import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { ArtifactChanged } from "./evidence-input";
import { readGit } from "./git";
import { publishArtifact, readArtifact } from "./journal";
import { verifyRoleIdentity, type NativeRoleEvidence, type RolePolicy } from "./manifests";
import { decodeNativeRoleOutput } from "./native-role-output";
import { executeOwnedProcess, type OwnedProcess } from "./owned-process";
import { canonicalDigest, canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { readNativeRoleCapture } from "./role-capture";
import { artifactDirectoryScope, captureRepositoryState, matchesRepositoryState } from "./snapshot";

type Reference = { path: string; sha256: string };
type Options = {
  source_repo: string; candidate_repo?: string; artifact_root: string; source_commit: string;
  role: "worker" | "reviewer"; runtime_sha256: string; target_sha256: string;
  provider: string; policy: RolePolicy; context_id: string;
  argv: string[]; cwd: string; env: Record<string, string>; timeout_ms: number;
};

/** Capture one owned invocation. The caller selects its retained runtime and grants separately. */
export async function captureNativeRoleProcess(input: Options) {
  const options = structuredClone(input);
  const result: { authority: "none"; complete: boolean; scope_changed: boolean; invocation_id: string;
    directory: string | null; capture: Reference | null; process: OwnedProcess | null; diagnostics: string[] } = {
    authority: "none", complete: false, scope_changed: false, invocation_id: randomUUID(),
    directory: null, capture: null, process: null, diagnostics: [],
  };
  let before: string | null = null, repo: string | null = null, candidateBefore: string | null = null, candidate: string | null = null;
  function unchanged() {
    if (repo === null || before === null || !matchesRepositoryState(repo, before)
      || candidate !== null && candidateBefore !== null && !matchesRepositoryState(candidate, candidateBefore))
      throw new ArtifactChanged("Caller changed during native role execution");
  }
  try {
    if (options.provider !== "copilot") throw Error("Native role output provider unavailable");
    if (!["worker", "reviewer"].includes(options.role) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.source_commit)
      || ![options.runtime_sha256, options.target_sha256].every(value => /^[a-f0-9]{64}$/u.test(value))
      || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(options.context_id)
      || !options.argv.length || !options.argv.every(value => typeof value === "string" && !value.includes("\0"))
      || !isAbsolute(options.argv[0]) || !isAbsolute(options.cwd) || !Number.isSafeInteger(options.timeout_ms) || options.timeout_ms < 1)
      throw Error("Bounded original native role invocation required");
    repo = realpathSync(options.source_repo); before = canonicalDigest(captureRepositoryState(repo));
    if (readGit(repo, "rev-parse", "--verify", "--end-of-options", options.source_commit + "^{commit}").toString().trim() !== options.source_commit)
      throw Error("Original native role source required");
    if (options.candidate_repo) {
      candidate = realpathSync(options.candidate_repo); candidateBefore = canonicalDigest(captureRepositoryState(candidate));
    }
    const scope = artifactDirectoryScope(options.artifact_root, repo);
    if (candidate) artifactDirectoryScope(scope.directory, candidate);
    const directory = mkdtempSync(join(scope.directory, "native-role-")); result.directory = directory;
    const retain = (name: string, bytes: Uint8Array): Reference => {
      const path = join(directory, name); publishArtifact(path, bytes);
      return { path: relative(scope.directory, path), sha256: sha256(bytes) };
    };
    const expected = { role: options.role, source_commit: options.source_commit,
      runtime_sha256: options.runtime_sha256, target_sha256: options.target_sha256 };
    retain("invocation.json", canonicalJSON({ ...expected, invocation_id: result.invocation_id, provider: options.provider,
      context_id: options.context_id, cwd: realpathSync(options.cwd), argv_sha256: canonicalDigest(options.argv) }));
    const native = join(directory, "native.jsonl"), stderr = join(directory, "stderr.txt");
    for (const path of [native, stderr]) writeFileSync(path, Buffer.alloc(0), { mode: 0o600, flag: "wx" });
    let launch: Reference | null = null;
    result.process = await executeOwnedProcess({ argv: options.argv, cwd: options.cwd, env: options.env,
      stdout: native, stderr, watched_outputs: [], timeout_ms: options.timeout_ms,
      started(pid) { launch = retain("launch.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-role-launch", ...expected,
        invocation_id: result.invocation_id, context_id: options.context_id, pid })); } });
    const completion = retain("process.json", canonicalJSON(result.process));
    unchanged();
    if (result.process.exit_code !== 0 || !result.process.reaped || result.process.timed_out
      || result.process.cancelled !== null || result.process.output_limit) throw Error("Native role process incomplete");
    const bytes = readArtifact(native), decoded = decodeNativeRoleOutput({ provider: options.provider, native: bytes,
      expected_context: options.context_id, expected_cwd: realpathSync(options.cwd) });
    const returned = retain("returned.txt", decoded.returned);
    const evidence: NativeRoleEvidence = { provider: options.provider, invocation_id: result.invocation_id, context_id: decoded.context_id,
      target_sha256: options.target_sha256, isolation: "procedural", native: bytes, native_sha256: sha256(bytes),
      returned: decoded.returned, returned_sha256: returned.sha256, process: result.process };
    const { records: _records, ...binding } = verifyRoleIdentity(evidence, options.policy);
    unchanged();
    const capture = retain("capture.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-role-capture", role: options.role,
      source_commit: options.source_commit, runtime_sha256: options.runtime_sha256, launch, binding,
      artifacts: { native: { path: relative(scope.directory, native), sha256: evidence.native_sha256 }, returned, process: completion } }));
    readNativeRoleCapture({ source_repo: repo, candidate_repo: candidate ?? undefined, artifact_root: scope.directory,
      reference: capture, expected, policy: options.policy });
    unchanged(); result.capture = capture; result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof ArtifactChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Native role process unavailable");
  }
  if (repo !== null && before !== null) {
    try { unchanged(); } catch {
      result.complete = false; result.capture = null; result.scope_changed = true;
      if (!result.diagnostics.includes("Caller changed during native role execution")) result.diagnostics.push("Caller changed during native role execution");
    }
  }
  return freezeJSON(result);
}
