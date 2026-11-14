import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { createOriginalAuditReportEnvelope, readOriginalAuditReport } from "./audit-report";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { publishArtifact } from "./journal";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { PublicationScopeChanged } from "./publish";
import { persistAuditOutput } from "./report-output";
import { loadCommittedSettings } from "./settings";
import { artifactDirectoryScope, captureRepositoryState, matchesRepositoryState } from "./snapshot";

/** Retain pre-upload inputs. Later native artifact and terminal-job checks establish eligible history. */
export function persistHostedAuditOutput(options: Parameters<typeof persistAuditOutput>[0]) {
  const saved = persistAuditOutput(options);
  if (!saved.complete || saved.content !== "report") return saved;
  const result = structuredClone(saved);
  result.files.provenance_json = null;
  let repo: string | null = null, before: string | null = null;
  try {
    repo = realpathSync(options.repo); before = canonicalDigest(captureRepositoryState(repo));
    const scope = artifactDirectoryScope(options.artifact_root, repo);
    if (!options.session.report || !result.directory || !result.files.report_json || !result.files.markdown)
      throw Error("Original completed hosted report files required");
    artifactDirectoryScope(result.directory, repo);
    const original = canonicalJSON(readOriginalAuditReport(options.session.report));
    const report = readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference: result.files.report_json });
    if (!original.equals(report)) throw new ArtifactChanged("Original hosted report bytes changed");
    const bytes = createOriginalAuditReportEnvelope(options.session.report);
    const limit = Math.min(OUTPUT_LIMIT, loadCommittedSettings(repo, options.source).settings.reports.max_entry_bytes);
    if (bytes.length > limit) throw Error("Hosted provenance exceeds the configured retained entry bound");
    const path = join(result.directory, "provenance.json"); publishArtifact(path, bytes);
    result.files.provenance_json = { path: relative(scope.directory, path), sha256: sha256(bytes) };
    for (const reference of Object.values(result.files)) {
      if (reference) readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference });
    }
    if (!bytes.equals(createOriginalAuditReportEnvelope(options.session.report)))
      throw new PublicationScopeChanged("Original hosted provenance changed during retention");
    result.history_provenance = "pending";
  } catch (error) {
    result.complete = false; result.history_provenance = "absent";
    result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Hosted report provenance unavailable");
  }
  if (repo !== null && before !== null && !matchesRepositoryState(repo, before)) {
    result.complete = false; result.scope_changed = true; result.history_provenance = "absent";
    result.diagnostics.push("Caller changed during hosted report retention");
  }
  return freezeJSON(result);
}
