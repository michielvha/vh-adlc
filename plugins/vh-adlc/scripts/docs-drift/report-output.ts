import { mkdtempSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { readOriginalAuditReport } from "./audit-report";
import { auditSessionOutput, readOriginalAuditSessionOutputScope, type runAuditSession } from "./audit-session";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { publishArtifact } from "./journal";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import { loadCommittedSettings } from "./settings";
import { artifactDirectoryScope, captureCallerState, matchesCallerState } from "./snapshot";

type Reference = { path: string; sha256: string };
type Session = Awaited<ReturnType<typeof runAuditSession>>;
export type AuditOutputArtifacts = { schema_version: 1; kind: "docs-drift-report-artifacts"; authority: "none"; source_commit: string;
  complete: boolean; scope_changed: boolean; content: "report" | "diagnostic"; history_provenance: "absent" | "pending" | "local-attestation";
  directory: string | null; files: { report_json: Reference | null; markdown: Reference | null; provenance_json?: Reference | null };
  local_invocation?: Reference; diagnostics: string[] };

/** Save selected local data only. Native/history provenance and every publication grant are separate. */
export function persistAuditOutput(options: { repo: string; source: string; artifact_root: string; session: Session }) {
  const result: AuditOutputArtifacts = {
    schema_version: 1, kind: "docs-drift-report-artifacts", authority: "none", source_commit: options.source,
    complete: false, scope_changed: false, content: options.session.complete ? "report" : "diagnostic", history_provenance: "absent",
    directory: null, files: { report_json: null, markdown: null }, diagnostics: [],
  };
  let repo: string | null = null, before: string | null = null;
  try {
    // Preserve the live report object: cloning or JSON cannot reproduce its original provenance.
    const original = options.session.complete
      ? options.session.report ? readOriginalAuditReport(options.session.report) : (() => { throw Error("Original completed audit report required"); })()
      : null;
    if (options.session.source_commit !== options.source || original && original.source_commit !== options.source)
      throw new ArtifactChanged("Audit output source changed");
    repo = realpathSync(options.repo); before = canonicalDigest(captureCallerState(repo));
    const scope = artifactDirectoryScope(options.artifact_root, repo), settings = loadCommittedSettings(repo, options.source).settings;
    const limit = Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes);
    if (original && original.repository !== settings.repository) throw new ArtifactChanged("Audit output repository changed");
    if (original) {
      const owned = readOriginalAuditSessionOutputScope(options.session);
      if (owned.repo !== repo || owned.artifact_root !== scope.directory) throw new ArtifactChanged("Original audit output scope changed");
      artifactDirectoryScope(scope.directory, owned.source_checkout);
    }
    const request = options.session.requests.worker;
    if (request) {
      let checkout: string | null = null;
      try {
        const bytes = readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference: request });
        const parsed: unknown = JSON.parse(decodeUTF8(bytes));
        if (!canonicalJSON(parsed).equals(bytes) || parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
          throw Error("Original audit request required for output scope");
        const record = parsed as Record<string, unknown>;
        if (record.kind !== "docs-drift-audit-worker-request" || record.source_commit !== options.source
          || typeof record.source_checkout !== "string" || !isAbsolute(record.source_checkout)) throw Error("Original audit request output scope unavailable");
        checkout = record.source_checkout;
      } catch (error) {
        if (original) throw error instanceof ArtifactChanged ? error : Error("Original audit request output scope unavailable");
        result.scope_changed ||= error instanceof ArtifactChanged;
        result.diagnostics.push("Original worker request unavailable; saved output is diagnostic data only");
      }
      if (checkout !== null) artifactDirectoryScope(scope.directory, checkout);
    }
    let bytes: Buffer, markdown: Buffer;
    if (original) {
      if (typeof options.session.report?.markdown !== "string" || !options.session.report.markdown)
        throw Error("Original audit report markdown required");
      bytes = canonicalJSON(original); markdown = Buffer.from(options.session.report.markdown);
    } else {
      const details = auditSessionOutput(options.session, limit);
      const packet: { schema_version: 1; kind: string; authority: "none"; source_commit: string; outcome: "incomplete";
        details_omitted: boolean; details: typeof details | null; diagnostics: string[] } = {
        schema_version: 1, kind: "docs-drift-diagnostic-report", authority: "none", source_commit: options.source,
        outcome: "incomplete", details_omitted: details.details_omitted, details, diagnostics: [...result.diagnostics],
      };
      bytes = canonicalJSON(packet);
      if (bytes.length > limit) {
        packet.details = null; packet.details_omitted = true;
        packet.diagnostics = ["Audit details exceed the retained output bound; inspect original source and native role records"];
        bytes = canonicalJSON(packet);
      }
      markdown = Buffer.from("# Documentation drift report\n\nThe audit is incomplete. Finding counts and judgments may be unavailable.\n\nInspect report.json and the retained original source and native role records. This diagnostic output establishes no history provenance.\n");
    }
    if (bytes.length > limit || markdown.length > limit) throw Error("Audit output exceeds the configured retained entry bound");
    const directory = mkdtempSync(join(scope.directory, "audit-output-")); result.directory = directory;
    const retain = (name: string, data: Buffer) => {
      const path = join(directory, name); publishArtifact(path, data);
      return { path: relative(scope.directory, path), sha256: sha256(data) };
    };
    result.files.report_json = retain("report.json", bytes);
    result.files.markdown = retain("report.md", markdown);
    for (const reference of Object.values(result.files)) readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference });
    result.complete = true;
  } catch (error) {
    result.scope_changed ||= error instanceof ArtifactChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Audit output retention unavailable");
  }
  if (repo !== null && before !== null && !matchesCallerState(repo, before)) {
    result.complete = false; result.scope_changed = true; result.diagnostics.push("Caller changed during audit output retention");
  }
  return freezeJSON(result);
}
