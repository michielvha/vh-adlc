import { dirname, join, relative } from "node:path";
import { artifactDirectoryScope, captureSnapshot, matchesCallerState } from "./snapshot";
import { inspectCandidate } from "./preparation";
import { readOriginalScan, requireSuccessfulProcess } from "./scan-evidence";
import { readBoundArtifact } from "./evidence-input";
import { canonicalJSON, decodeUTF8, protocolPath } from "./protocol";
import type { verifyCandidate } from "./candidate-verification";

type Verification = Awaited<ReturnType<typeof verifyCandidate>>;
function fail(reason: string): never { throw Error("docs-drift candidate verification evidence " + reason); }
function same(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }
function json(bytes: Uint8Array): unknown {
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(parsed).equals(Buffer.from(bytes))) fail("canonical JSON required");
  return parsed;
}

/** Recheck original process/output bytes and immutable source bindings. Execution origin is owner-attested. */
export function readCandidateVerificationArtifacts(options: Parameters<typeof inspectCandidate>[0] & { reference: unknown }): Verification {
  const scope = artifactDirectoryScope(options.artifact_root, options.candidate_repo);
  function read(reference: unknown): Buffer {
    if (reference === null || typeof reference !== "object" || Array.isArray(reference)) fail("reference required");
    scope.assertExternal(join(scope.directory, protocolPath((reference as Record<string, unknown>).path)));
    return readBoundArtifact({ source_repo: options.repo, artifact_root: scope.directory, reference });
  }
  const parsed = json(read(options.reference));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) fail("record required");
  if ((parsed as Record<string, unknown>).schema_version === 1) fail("version-one physical snapshot proof requires its original implementation");
  const value = parsed as Verification;
  const fields = ["schema_version", "kind", "authority", "source_commit", "candidate_commit", "complete", "diagnostics", "inspection", "scan", "scan_artifacts", "checkout_state_sha256", "commands", "record_path"];
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))
    || value.schema_version !== 2 || value.kind !== "docs-drift-candidate-verification" || value.authority !== "none"
    || value.complete !== true || !same(value.diagnostics, []) || value.source_commit !== options.source || value.candidate_commit !== options.candidate)
    fail("complete exact-source record required");
  if (typeof value.record_path !== "string" || relative(scope.directory, value.record_path) !== (options.reference as { path: string }).path)
    fail("retained verification record location changed");
  const recorded = value.inspection;
  if (!recorded?.object_store) fail("retained candidate object store required");
  const actual = inspectCandidate({ ...options, object_store: recorded.object_store });
  if (!actual.complete) fail("current complete candidate required");
  const { object_store: _actualStore, ...current } = actual, { object_store: _recordedStore, ...prior } = recorded;
  if (!same(current, prior)) fail("candidate binding changed");
  const scan = value.scan, originals = value.scan_artifacts;
  if (!scan || !originals || !value.checkout_state_sha256) fail("owned verification source required");
  const checkoutPath = protocolPath(relative(scope.directory, scan.checkout));
  if (join(scope.directory, checkoutPath) !== scan.checkout) fail("canonical owned verification source required");
  scope.assertExternal(scan.checkout);
  artifactDirectoryScope(scope.directory, options.repo).assertExternal(scan.checkout);
  if (!matchesCallerState(scan.checkout, value.checkout_state_sha256, "full")) fail("owned verification source changed or unavailable");
  const snapshot = captureSnapshot(options.candidate_repo, options.candidate);
  readOriginalScan(snapshot, scan, originals, scope.directory, read);
  const configured = [...snapshot.settings.generation_commands, ...snapshot.settings.verification_commands];
  if (!Array.isArray(value.commands) || value.commands.length !== configured.length) fail("complete configured generation and verification required");
  for (const [index, command] of value.commands.entries()) {
    const purpose = index < snapshot.settings.generation_commands.length ? "generation" : "verification";
    if (!same(command.argv, configured[index])) fail(`configured ${purpose} vector changed`);
    if (!command.start || !command.completion) fail(`original ${purpose} start and completion required`);
    const directory = dirname(command.stdout.path);
    if ([command.stdout.path, command.stderr.path, command.start.path, command.completion.path].some((path, item) =>
      path !== join(directory, index + ["-stdout.log", "-stderr.log", "-start.json", "-process.json"][item]))) fail(`original ${purpose} artifact location changed`);
    const completion = json(read(command.completion)); requireSuccessfulProcess(completion);
    if (!same(completion, command.process)) fail(`original ${purpose} completion changed`);
    const start = json(read(command.start));
    if (start === null || typeof start !== "object" || Array.isArray(start)
      || (start as Record<string, unknown>).pid !== completion.pid
      || (start as Record<string, unknown>).source_commit !== options.candidate
      || !same((start as Record<string, unknown>).argv, command.argv)) fail(`original ${purpose} start changed`);
    read(command.stdout); read(command.stderr);
  }
  return { ...value, evidence: options.reference as Verification["evidence"] };
}
