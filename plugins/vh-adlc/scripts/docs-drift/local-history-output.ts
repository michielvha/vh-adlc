import { existsSync, realpathSync, renameSync } from "node:fs";
import { join, relative } from "node:path";
import { readOriginalAuditLocalContext, readOriginalAuditReport } from "./audit-report";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { publishArtifact } from "./journal";
import { stageLocalInvocation } from "./local-history";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { PublicationScopeChanged } from "./publish";
import { createLocalEnvelope, type OwnedInvocation } from "./report-history";
import { persistAuditOutput } from "./report-output";
import { artifactDirectoryScope, captureCallerState, matchesCallerState } from "./snapshot";

/** Retain an original local report and its owner attestation. Saving into adopted roots uses report-write authority. */
export function persistLocalAuditOutput(options: Parameters<typeof persistAuditOutput>[0]) {
  const saved = persistAuditOutput(options);
  if (!saved.complete || saved.content !== "report") return saved;
  const result = structuredClone(saved); result.files.provenance_json = null;
  let repo: string | null = null, before: string | null = null;
  try {
    repo = realpathSync(options.repo); before = canonicalDigest(captureCallerState(repo));
    const callerBefore = before;
    const scope = artifactDirectoryScope(options.artifact_root, repo);
    if (!options.session.report || !result.directory || !result.files.report_json || !result.files.markdown
      || !options.session.requests.worker || !options.session.requests.reviewer) throw Error("Original completed local report and requests required");
    const report = readOriginalAuditReport(options.session.report), context = readOriginalAuditLocalContext(options.session.report);
    if (context.repo !== repo || context.source !== options.source || context.run_id !== report.run_id
      || context.scope_sha256 !== report.scope_sha256 || context.started_at !== report.started_at)
      throw new ArtifactChanged("Original local report scope changed");
    const bytes = canonicalJSON(report);
    if (!readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference: result.files.report_json }).equals(bytes))
      throw new ArtifactChanged("Original local report bytes changed");
    const reopen = () => {
      for (const reference of [...Object.values(result.files), ...Object.values(options.session.requests)])
        if (reference) readBoundArtifact({ source_repo: context.repo, artifact_root: scope.directory, reference });
      if (!matchesCallerState(context.repo, callerBefore)) throw new PublicationScopeChanged("Caller changed during local report retention");
    };
    reopen();
    const original = { origin: "local-attestation" as const, context: "production" as const, repository: report.repository,
      id: report.run_id, source_commit: report.source_commit, component_sha256: context.component_sha256,
      request_sha256: canonicalDigest(options.session.requests), scope_sha256: report.scope_sha256,
      report_sha256: sha256(bytes), completed_at: report.completed_at };
    const invocation: OwnedInvocation = { ...original, invocation_sha256: canonicalDigest(original) };
    const envelope = createLocalEnvelope(bytes, invocation), limit = Math.min(OUTPUT_LIMIT, context.settings.reports.max_entry_bytes);
    if (envelope.length > limit) throw Error("Local provenance exceeds the configured retained entry bound");
    const pending = join(result.directory, "provenance.pending.json"); publishArtifact(pending, envelope);
    readBoundArtifact({ source_repo: repo, artifact_root: scope.directory,
      reference: { path: relative(scope.directory, pending), sha256: sha256(envelope) } });
    const staged = stageLocalInvocation(context, invocation);
    context.recheck(); reopen();
    const path = join(result.directory, "provenance.json"); renameSync(pending, path);
    result.files.provenance_json = { path: relative(scope.directory, path), sha256: sha256(envelope) };
    result.local_invocation = staged.activate(reopen);
    result.history_provenance = "local-attestation";
  } catch (error) {
    result.complete = false; result.history_provenance = "absent"; result.files.provenance_json = null;
    delete result.local_invocation;
    result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Local report attestation unavailable");
    if (repo !== null && before !== null && !matchesCallerState(repo, before)) {
      result.scope_changed = true; result.diagnostics.push("Caller changed during local report retention");
    }
    if (result.directory && existsSync(join(result.directory, "provenance.json"))) {
      try { renameSync(join(result.directory, "provenance.json"), join(result.directory, "provenance.pending.json")); }
      catch { result.diagnostics.push("Local provenance could not be moved to its diagnostic filename"); }
    }
    result.diagnostics = [...new Set(result.diagnostics)];
  }
  return freezeJSON(result);
}
