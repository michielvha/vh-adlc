/** Synthetic original role captures and an isolated retained component. No real model or provider operation. */
import { expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { evidence, role } from "./manifest-fixture";
import { nativeServiceProgram } from "./native-service-fixture";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { collectReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/review-target";
import { effectDigest, verifyRoleIdentity, type NativeRoleEvidence, type RolePolicy } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

type Reference = { path: string; sha256: string };
function retain(root: string, name: string, bytes: Uint8Array): Reference {
  writeFileSync(join(root, name), bytes, { mode: 0o600 }); return { path: name, sha256: sha256(bytes) };
}
function capture(root: string, source: string, selectedRole: "worker" | "reviewer", runtime: string, original: NativeRoleEvidence, policy: RolePolicy = role): Reference {
  const { records: _records, ...binding } = verifyRoleIdentity(original, policy);
  const launch = { schema_version: 1, kind: "docs-drift-role-launch", role: selectedRole, source_commit: source, runtime_sha256: runtime,
    target_sha256: original.target_sha256, invocation_id: original.invocation_id, context_id: original.context_id, pid: original.process.pid };
  return retain(root, selectedRole + "-capture.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-role-capture", role: selectedRole,
    source_commit: source, runtime_sha256: runtime, launch: retain(root, selectedRole + "-launch.json", canonicalJSON(launch)), binding,
    artifacts: { native: retain(root, selectedRole + "-native.jsonl", original.native), returned: retain(root, selectedRole + "-returned.txt", original.returned),
      process: retain(root, selectedRole + "-process.json", canonicalJSON(original.process)) } }));
}

export { retain as retainSyntheticArtifact, capture as captureSyntheticRole };

export async function originalPublicationFixture(roots: string[], publisher?: NonNullable<Parameters<typeof bindingFixture>[2]>["publisher"]) {
  let worker: Reference | null = null;
  const f = await bindingFixture(roots, false, { fullComponent: true, publisher, role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source },
    beforeCandidate: async input => {
      const current = await collectWorkerInputs(input.worker_options); expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
      const publication = { operation_id: "native-operation", proposal: { kind: "pr-create", payload: { base: "main", branch: "docs-drift/native-operation",
        title: "Repair the guide", body: "Exact synthetic source correction\n", labels: ["documentation"], draft: false } } };
      const original = evidence("native-fixture-worker", current.worker_input_sha256!, canonicalJSON({ input_sha256: current.worker_input_sha256,
        edits: (input.selection as { edits: unknown[] }).edits, publication }).toString());
      worker = capture(input.artifacts, input.source, "worker", roleRuntimeDigest(current.facts!.runtime!, "worker"), original);
    } });
  if (!worker) throw Error("Missing original synthetic worker capture");
  const target = await collectReviewTarget({ ...f.options, worker_capture: worker }); expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
  const reviewer = capture(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!, evidence("native-fixture-reviewer", target.manifest_sha256!, "NO FINDINGS\n"));
  const instruction = retain(f.artifacts, "owner-request.txt", Buffer.from("Synthetic owner request approves this exact lease, retained receipt, candidate branch, PR payload and lease release.\n"));
  const authority = retain(f.artifacts, "owner-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority", manifest_sha256: target.manifest_sha256,
    origin: { kind: "owner-request", artifact: instruction }, effects: target.manifest!.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
  return { ...f, target, worker: worker as Reference, reviewer, authority, publication: { ...f.options, worker_capture: worker as Reference, reviewer_capture: reviewer, authority } };
}

/** The existing fake API gains real owned-origin Git refs. All other destinations are refused. */
export function installOwnedNativeService(f: Pick<Awaited<ReturnType<typeof originalPublicationFixture>>, "root" | "origin" | "source" | "head"> & { publisher_identity?: { actor: string; actor_id: number } }) {
  const executable = Bun.which("git"), flock = Bun.which("flock");
  if (!executable || !flock) throw Error("Synthetic owned native service requires Git and flock");
  const directory = join(f.root, "native-service"), bin = join(f.root, "native-bin"), statePath = join(f.root, "native-state.json"), calls = join(f.root, "native-service-calls.jsonl");
  mkdirSync(directory, { mode: 0o700 }); mkdirSync(bin, { recursive: true, mode: 0o700 });
  const commit = f.source, tree = readGit(f.origin, "rev-parse", commit + "^{tree}").toString().trim();
  const state = { ...(f.publisher_identity ? { viewer_login: f.publisher_identity.actor, viewer_id: f.publisher_identity.actor_id, viewer_type: "User" } : {}), commit, tree, publication_commit: f.head, repository_id: 10, git_source: f.origin, git_executable: executable,
    repository_identity: { id: 10, full_name: "fixture/docs", default_branch: "main" },
    refs: {}, prs: [], issues: [], comments: {}, label_race: "none", labels: { documentation: { id: 101, name: "documentation" } },
    metadata_commit: { sha: "f".repeat(40) }, metadata_tree: { sha: "f".repeat(40) }, metadata_blob: { sha: "f".repeat(40) }, blob: { sha: "f".repeat(40) } };
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  const program = nativeServiceProgram(statePath, calls);
  for (const name of ["gh", "git"]) {
    const service = join(directory, name); writeFileSync(service, program, { mode: 0o700 });
    const wrapper = `#!${process.execPath}
const args = process.argv.slice(2);
const readOnlyGit = ${JSON.stringify(name === "git")} && !args.includes("fetch") && !args.includes("push");
if (readOnlyGit && args.some(arg => arg.startsWith("https://"))) process.exit(91);
const command = readOnlyGit ? [${JSON.stringify(executable)}] : ${JSON.stringify([flock, "-x", join(directory, "state.lock"), process.execPath, service])};
const environment = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "0" };
const result = Bun.spawnSync([...command, ...args], { env: environment, stdin: "inherit", stdout: "inherit", stderr: "inherit" }); process.exit(result.exitCode);
`;

    writeFileSync(join(bin, name), wrapper, { mode: 0o700 });
  }
  return { statePath, calls };
}

export function publicationCLIArguments(f: Awaited<ReturnType<typeof originalPublicationFixture>>, command: "publish" | "resume", journal?: string): string[] {
  const selected = retain(f.artifacts, "native-cli-selection.json", canonicalJSON(f.selection)), options = f.publication;
  const argv = [process.execPath, join(f.retained.directory, "scripts/docs-drift/cli.ts"), command, "--repo", f.repo, "--source", f.source,
    "--candidate-repo", f.candidate, "--candidate", f.head, "--artifact-root", f.artifacts, "--selection", selected.path, "--selection-sha256", selected.sha256,
    "--cache-root", options.cache_directory, "--entry", options.entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
    "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
    "--candidate-verification", options.candidate_verification.path, "--candidate-verification-sha256", options.candidate_verification.sha256,
    "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256, "--worker-capture", f.worker.path, "--worker-capture-sha256", f.worker.sha256,
    "--reviewer-capture", f.reviewer.path, "--reviewer-capture-sha256", f.reviewer.sha256, "--authority", f.authority.path, "--authority-sha256", f.authority.sha256];
  if (journal) argv.push("--journal-directory", journal);
  return argv;
}
