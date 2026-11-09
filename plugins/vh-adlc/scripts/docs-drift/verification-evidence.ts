import { dirname, join, relative } from "node:path";
import { artifactDirectoryScope, captureSnapshot, matchesRepositoryState } from "./snapshot";
import { inspectCandidate } from "./preparation";
import { assessScan } from "./scan";
import { readBoundArtifact } from "./evidence-input";
import { canonicalJSON, decodeUTF8, protocolPath, verifyProtocolBindings } from "./protocol";
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
  const value = parsed as Verification;
  const fields = ["schema_version", "kind", "authority", "source_commit", "candidate_commit", "complete", "diagnostics", "inspection", "scan", "scan_artifacts", "checkout_state_sha256", "commands", "record_path"];
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))
    || value.schema_version !== 1 || value.kind !== "docs-drift-candidate-verification" || value.authority !== "none"
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
  if (!matchesRepositoryState(scan.checkout, value.checkout_state_sha256)) fail("owned verification source changed or unavailable");
  const snapshot = captureSnapshot(options.candidate_repo, options.candidate);
  verifyProtocolBindings(read(originals.bindings), snapshot.protocol);
  const assessment = assessScan(JSON.parse(decodeUTF8(read(originals.report))), snapshot);
  if (!assessment.complete) fail("scan incomplete");
  for (const key of Object.keys(assessment) as Array<keyof typeof assessment>) if (!same(assessment[key], scan[key])) fail("scan assessment changed");
  const process = json(read(originals.process));
  if (!same(process, scan.process)) fail("original scanner completion changed");
  function complete(value: unknown): asserts value is NonNullable<Verification["commands"][number]["process"]> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail("process required");
    const p = value as Record<string, unknown>;
    if (Object.keys(p).sort().join(",") !== "cancelled,exit_code,output_limit,pid,reaped,timed_out"
      || typeof p.pid !== "number" || !Number.isSafeInteger(p.pid) || p.pid < 1 || p.exit_code !== 0 || p.timed_out !== false
      || p.cancelled !== null || p.output_limit !== false || p.reaped !== true) fail("successful reaped process required");
  }
  complete(process);
  const allocation = json(read(originals.record));
  if (allocation === null || typeof allocation !== "object" || Array.isArray(allocation)
    || (allocation as Record<string, unknown>).kind !== "assessment-checkout"
    || (allocation as Record<string, unknown>).source_commit !== options.candidate
    || (allocation as Record<string, unknown>).checkout !== scan.checkout
    || (allocation as Record<string, unknown>).root !== dirname(scan.checkout)
    || (allocation as Record<string, unknown>).evidence_location !== scan.record_path
    || (allocation as Record<string, unknown>).bindings_sha256 !== snapshot.protocol.sha256) fail("owned scanner allocation changed");
  const scanRoot = dirname(scan.checkout);
  if (scan.output_path !== join(scanRoot, "scan.json")
    || relative(scope.directory, scan.output_path) !== originals.report.path || relative(scope.directory, scan.record_path) !== originals.record.path
    || relative(scope.directory, join(scanRoot, "bindings.json")) !== originals.bindings.path
    || relative(scope.directory, join(scanRoot, "process-result.json")) !== originals.process.path) fail("original scanner artifact location changed");
  if (!Array.isArray(value.commands) || value.commands.length !== snapshot.settings.verification_commands.length) fail("complete configured verification required");
  for (const [index, command] of value.commands.entries()) {
    if (!same(command.argv, snapshot.settings.verification_commands[index])) fail("configured verification vector changed");
    if (!command.start || !command.completion) fail("original verification start and completion required");
    const directory = dirname(command.stdout.path);
    if ([command.stdout.path, command.stderr.path, command.start.path, command.completion.path].some((path, item) =>
      path !== join(directory, index + ["-stdout.log", "-stderr.log", "-start.json", "-process.json"][item]))) fail("original verification artifact location changed");
    const completion = json(read(command.completion)); complete(completion);
    if (!same(completion, command.process)) fail("original verification completion changed");
    const start = json(read(command.start));
    if (start === null || typeof start !== "object" || Array.isArray(start)
      || (start as Record<string, unknown>).pid !== completion.pid
      || (start as Record<string, unknown>).source_commit !== options.candidate
      || !same((start as Record<string, unknown>).argv, command.argv)) fail("original verification start changed");
    read(command.stdout); read(command.stderr);
  }
  return { ...value, evidence: options.reference as Verification["evidence"] };
}
