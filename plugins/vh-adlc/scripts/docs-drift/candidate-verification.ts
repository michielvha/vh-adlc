import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { publishArtifact, readArtifact } from "./journal";
import { inspectCandidate } from "./preparation";
import { executeOwnedProcess, ownedClientCompleted, type OwnedProcess } from "./owned-process";
import { canonicalDigest, canonicalJSON, sha256 } from "./protocol";
import { scanArtifactReferences } from "./scan-evidence";
import { runScan, scannerEnvironment, type ScanRun } from "./scan";
import { captureRepositoryState, captureSnapshot, externalArtifactDirectory, matchesRepositoryState } from "./snapshot";

type Reference = { path: string; sha256: string };
type CommandResult = { start: Reference | null; argv: string[]; process: OwnedProcess | null; stdout: Reference; stderr: Reference; completion: Reference | null };
type CandidateVerification = {
  schema_version: 1; kind: "docs-drift-candidate-verification"; authority: "none";
  source_commit: string; candidate_commit: string; complete: boolean; diagnostics: string[];
  inspection: ReturnType<typeof inspectCandidate> | null; scan: ScanRun | null;
  scan_artifacts: { report: Reference; start: Reference; process: Reference; bindings: Reference; record: Reference } | null; checkout_state_sha256: string | null; commands: CommandResult[]; record_path: string | null; evidence: Reference | null;
};

/** Recheck committed generated outputs, scanner results and allowed verification in an owned candidate copy. */
export async function verifyCandidate(input: Parameters<typeof inspectCandidate>[0] & { timeout_ms?: number }): Promise<CandidateVerification> {
  const options = { ...input, selection: structuredClone(input.selection), resolution_record: structuredClone(input.resolution_record) };
  const result: CandidateVerification = { schema_version: 1, kind: "docs-drift-candidate-verification", authority: "none",
    source_commit: options.source, candidate_commit: options.candidate, complete: false, diagnostics: [], inspection: null, scan: null, scan_artifacts: null, checkout_state_sha256: null, commands: [], record_path: null, evidence: null };
  const repo = realpathSync(options.repo), candidateRepo = realpathSync(options.candidate_repo);
  const before = canonicalDigest(captureRepositoryState(repo)), candidateBefore = canonicalDigest(captureRepositoryState(candidateRepo));
  const root = externalArtifactDirectory(options.artifact_root, repo);
  externalArtifactDirectory(root, candidateRepo);
  const reference = (path: string): Reference => ({ path: relative(root, path), sha256: sha256(readArtifact(path)) });
  try {
    result.inspection = inspectCandidate({ ...options, repo, candidate_repo: candidateRepo, artifact_root: root });
    if (!result.inspection.complete) { result.diagnostics.push(...result.inspection.diagnostics); throw Error("Candidate inspection incomplete"); }
    const snapshot = captureSnapshot(candidateRepo, options.candidate);
    result.scan = await runScan(snapshot, { artifact_root: root, owner: options.owner, run: options.run, timeout_ms: options.timeout_ms });
    if (!result.scan.complete) { result.diagnostics.push(...result.scan.diagnostics.map(item => item.message)); throw Error("Candidate scan incomplete"); }
    result.scan_artifacts = scanArtifactReferences(result.scan, root);
    result.checkout_state_sha256 = canonicalDigest(captureRepositoryState(result.scan.checkout));
    const checkout = result.scan.checkout, directory = join(root, "candidate-checks-" + randomUUID());
    mkdirSync(directory, { mode: 0o700 });
    const temporary = join(directory, "temporary"); mkdirSync(temporary, { mode: 0o700 });
    const git = Bun.which("git");
    if (!git) throw Error("Candidate verification Git runtime unavailable");
    const timeout = options.timeout_ms ?? snapshot.settings.scanner.timeout_seconds * 1000;
    const configured = [
      ...snapshot.settings.generation_commands.map(argv => ({ argv, purpose: "generation" })),
      ...snapshot.settings.verification_commands.map(argv => ({ argv, purpose: "verification" })),
    ];
    for (const [index, { argv, purpose }] of configured.entries()) {
      const executable = argv[0].includes("/") ? (isAbsolute(argv[0]) ? argv[0] : join(checkout, argv[0])) : Bun.which(argv[0]);
      if (!executable) throw Error(`Configured candidate ${purpose} runtime unavailable`);
      const stdout = join(directory, index + "-stdout.log"), stderr = join(directory, index + "-stderr.log"), completion = join(directory, index + "-process.json");
      for (const path of [stdout, stderr]) writeFileSync(path, "", { flag: "wx", mode: 0o600 });
      const command: CommandResult = { start: null, argv: [...argv], process: null, stdout: reference(stdout), stderr: reference(stderr), completion: null };
      result.commands.push(command);
      const state = canonicalDigest(captureRepositoryState(checkout));
      command.process = await executeOwnedProcess({ argv: [executable, ...argv.slice(1)], cwd: checkout,
        env: scannerEnvironment(executable, git, temporary), stdout, stderr, watched_outputs: [], timeout_ms: timeout,
        started: pid => writeFileSync(join(directory, index + "-start.json"), canonicalJSON({ pid, argv, source_commit: options.candidate }), { flag: "wx", mode: 0o600 }) });
      writeFileSync(completion, canonicalJSON(command.process), { flag: "wx", mode: 0o600 });
      command.start = reference(join(directory, index + "-start.json"));
      command.stdout = reference(stdout); command.stderr = reference(stderr); command.completion = reference(completion);
      if (!matchesRepositoryState(checkout, state)) throw Error(`Configured candidate ${purpose} changed its source or Git state`);
      const process = command.process;
      if (!ownedClientCompleted(process))
        throw Error(`Configured candidate ${purpose} failed`);
    }
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Candidate verification unavailable"); }
  if (!matchesRepositoryState(repo, before) || !matchesRepositoryState(candidateRepo, candidateBefore)) {
    result.complete = false; result.diagnostics.push("Caller changed or became unavailable during candidate verification");
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  result.record_path = join(root, "candidate-verification-" + randomUUID() + ".json");
  try {
    const { evidence: _evidence, ...payload } = result;
    publishArtifact(result.record_path, canonicalJSON(payload));
    result.evidence = reference(result.record_path);
  } catch (error) {
    result.complete = false;
    result.diagnostics.push(error instanceof Error ? error.message : "Candidate verification evidence could not be retained");
  }
  return result;
}
