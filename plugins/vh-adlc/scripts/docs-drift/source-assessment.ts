import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { readGit } from "./git";
import { readBoundArtifact } from "./evidence-input";
import { publishArtifact } from "./journal";
import { requireOwnedStore } from "./proposals";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { runScan, type ScanRun } from "./scan";
import { readOriginalScan, scanArtifactReferences, type ScanArtifacts } from "./scan-evidence";
import { artifactDirectoryScope, captureRepositoryState, captureSnapshot, createOwnedObjectStore, matchesRepositoryState, type OwnedObjectStore } from "./snapshot";
import { readCandidateVerificationArtifacts } from "./verification-evidence";

type Reference = { path: string; sha256: string };
type Options = { repo: string; source: string; artifact_root: string; owner: string; run: string; timeout_ms?: number };
type SourceAssessment = {
  schema_version: 1; kind: "docs-drift-source-assessment"; authority: "none"; source_commit: string;
  complete: boolean; diagnostics: string[]; scan: ScanRun | null; scan_artifacts: ScanArtifacts | null;
  object_store: OwnedObjectStore | null; record_path: string | null; evidence: Reference | null;
};

/** Collect complete baseline inputs even when a documentation check needs the proposed repair. */
export async function assessSource(input: Options): Promise<SourceAssessment> {
  const options = { ...input }, repo = realpathSync(options.repo), scope = artifactDirectoryScope(options.artifact_root, repo);
  const before = canonicalDigest(captureRepositoryState(repo));
  const result: SourceAssessment = { schema_version: 1, kind: "docs-drift-source-assessment", authority: "none", source_commit: options.source,
    complete: false, diagnostics: [], scan: null, scan_artifacts: null, object_store: null, record_path: null, evidence: null };
  try {
    const snapshot = captureSnapshot(repo, options.source);
    result.object_store = createOwnedObjectStore({ parent: scope.directory, evidence_directory: scope.directory, source_repo: repo,
      source_commit: options.source, repository: snapshot.settings.repository, owner: options.owner, run: options.run });
    result.scan = await runScan(snapshot, { artifact_root: scope.directory, owner: options.owner, run: options.run, timeout_ms: options.timeout_ms });
    if (!result.scan.complete) { result.diagnostics.push(...result.scan.diagnostics.map(item => item.message)); throw Error("Source scan incomplete"); }
    result.scan_artifacts = scanArtifactReferences(result.scan, scope.directory);
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Source assessment unavailable"); }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during source assessment"); }
  result.record_path = join(scope.directory, "source-assessment-" + randomUUID() + ".json");
  try {
    const { evidence: _evidence, ...payload } = result, bytes = canonicalJSON(payload);
    publishArtifact(result.record_path, bytes);
    result.evidence = { path: relative(scope.directory, result.record_path), sha256: sha256(bytes) };
  } catch (error) { result.complete = false; result.diagnostics.push(error instanceof Error ? error.message : "Source assessment retention failed"); }
  return freezeJSON(result);
}

/** Read source assessments and passing baseline records with explicit snapshot-format validation. */
export function readSourceAssessmentArtifacts(options: Options & { candidate_repo: string; reference: unknown }): SourceAssessment {
  const secondary = artifactDirectoryScope(options.artifact_root, options.candidate_repo), primary = artifactDirectoryScope(secondary.directory, options.repo);
  function read(reference: unknown): Buffer {
    if (reference === null || typeof reference !== "object" || Array.isArray(reference)) throw Error("Source assessment reference required");
    secondary.assertExternal(join(secondary.directory, protocolPath((reference as Record<string, unknown>).path)));
    return readBoundArtifact({ source_repo: options.repo, artifact_root: secondary.directory, reference });
  }
  const bytes = read(options.reference), parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(parsed).equals(bytes) || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Canonical source assessment required");
  if ((parsed as Record<string, unknown>).kind === "docs-drift-candidate-verification") {
    const verified = readCandidateVerificationArtifacts({ ...options, candidate: options.source,
      selection: { schema_version: 1, source_commit: options.source, edits: [] } });
    return { schema_version: 1, kind: "docs-drift-source-assessment", authority: "none", source_commit: options.source,
      complete: true, diagnostics: [], scan: verified.scan, scan_artifacts: verified.scan_artifacts, object_store: verified.inspection?.object_store ?? null,
      record_path: verified.record_path, evidence: verified.evidence };
  }
  const fields = ["schema_version", "kind", "authority", "source_commit", "complete", "diagnostics", "scan", "scan_artifacts", "object_store", "record_path"];
  const value = parsed as SourceAssessment;
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field)) || value.schema_version !== 1
    || value.kind !== "docs-drift-source-assessment" || value.authority !== "none" || value.complete !== true || !canonicalJSON(value.diagnostics).equals(canonicalJSON([]))
    || value.source_commit !== options.source || typeof value.record_path !== "string"
    || relative(secondary.directory, value.record_path) !== (options.reference as Reference).path || !value.scan || !value.scan_artifacts || !value.object_store)
    throw Error("Complete exact-source assessment required");
  secondary.assertExternal(value.scan.checkout); primary.assertExternal(value.scan.checkout);
  for (const path of [value.object_store.root, value.object_store.record_path]) { secondary.assertExternal(path); primary.assertExternal(path); }
  read({ path: relative(secondary.directory, value.object_store.record_path), sha256: value.object_store.record_sha256 });
  const snapshot = captureSnapshot(options.repo, options.source);
  requireOwnedStore(value.object_store, snapshot.settings.repository);
  if (value.object_store.source_commit !== options.source
    || readGit(value.object_store.root, "rev-parse", "--verify", "--end-of-options", options.source + "^{commit}").toString().trim() !== options.source)
    throw Error("Source assessment object binding changed");
  readOriginalScan(snapshot, value.scan, value.scan_artifacts, secondary.directory, read);
  return freezeJSON({ ...value, evidence: options.reference as Reference });
}
