import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { recordedProcessCompleted, type OwnedProcess } from "./owned-process";
import { readArtifact } from "./journal";
import { canonicalJSON, decodeUTF8, sha256, verifyProtocolBindings } from "./protocol";
import { assessScan, type ScanRun } from "./scan";
import type { Snapshot } from "./snapshot";

type Reference = { path: string; sha256: string };
export type ScanArtifacts = { report: Reference; start: Reference; process: Reference; bindings: Reference; record: Reference };
function fail(reason: string): never { throw Error("docs-drift scanner evidence " + reason); }
function same(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }
function json(bytes: Uint8Array): unknown {
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(parsed).equals(Buffer.from(bytes))) fail("canonical JSON required");
  return parsed;
}

export function scanArtifactReferences(scan: ScanRun, root: string): ScanArtifacts {
  const reference = (path: string): Reference => ({ path: relative(root, path), sha256: sha256(readArtifact(path)) });
  const directory = dirname(scan.output_path);
  return { report: reference(scan.output_path), start: reference(join(directory, "process-start.json")),
    process: reference(join(directory, "process-result.json")), bindings: reference(join(directory, "bindings.json")), record: reference(scan.record_path) };
}

export function requireSuccessfulProcess(value: unknown): asserts value is OwnedProcess {
  if (!recordedProcessCompleted(value)) fail("successful reaped process required");
}

/** Validate the original execution independently of later use of its source copy. */
export function readOriginalScan(snapshot: Snapshot, scan: ScanRun, originals: ScanArtifacts, artifactRoot: string, read: (reference: unknown) => Buffer): void {
  verifyProtocolBindings(read(originals.bindings), snapshot.protocol);
  const assessment = assessScan(JSON.parse(decodeUTF8(read(originals.report))), snapshot);
  if (!assessment.complete) fail("scan incomplete");
  for (const key of Object.keys(assessment) as Array<keyof typeof assessment>) if (!same(assessment[key], scan[key])) fail("scan assessment changed");
  const process = json(read(originals.process));
  if (!same(process, scan.process)) fail("original scanner completion changed");
  requireSuccessfulProcess(process);
  const scannerStart = json(read(originals.start));
  if (scannerStart === null || typeof scannerStart !== "object" || Array.isArray(scannerStart)) fail("original scanner start required");
  const launched = scannerStart as Record<string, unknown>, argv = launched.argv, configured = snapshot.settings.scanner.argv;
  if (launched.pid !== process.pid || launched.source_commit !== snapshot.source_commit || !Array.isArray(argv) || typeof argv[0] !== "string"
    || !same(argv.slice(1), [...configured.slice(1), "--protocol-bindings", join(dirname(scan.checkout), "bindings.json"), "--protocol-json", scan.output_path])
    || (configured[0].includes("/") ? argv[0] !== (isAbsolute(configured[0]) ? configured[0] : join(scan.checkout, configured[0])) : basename(argv[0]) !== configured[0]))
    fail("original scanner launch binding changed");
  const allocation = json(read(originals.record));
  if (allocation === null || typeof allocation !== "object" || Array.isArray(allocation)
    || (allocation as Record<string, unknown>).kind !== "assessment-checkout"
    || (allocation as Record<string, unknown>).source_commit !== snapshot.source_commit
    || (allocation as Record<string, unknown>).checkout !== scan.checkout
    || (allocation as Record<string, unknown>).root !== dirname(scan.checkout)
    || (allocation as Record<string, unknown>).evidence_location !== scan.record_path
    || (allocation as Record<string, unknown>).bindings_sha256 !== snapshot.protocol.sha256) fail("owned scanner allocation changed");
  const scanRoot = dirname(scan.checkout);
  if (scan.output_path !== join(scanRoot, "scan.json")
    || relative(artifactRoot, scan.output_path) !== originals.report.path || relative(artifactRoot, scan.record_path) !== originals.record.path
    || relative(artifactRoot, join(scanRoot, "bindings.json")) !== originals.bindings.path
    || relative(artifactRoot, join(scanRoot, "process-result.json")) !== originals.process.path
    || relative(artifactRoot, join(scanRoot, "process-start.json")) !== originals.start.path) fail("original scanner artifact location changed");
}
