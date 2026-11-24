import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runAuditSession, auditSessionOutput } from "./audit-session";
import { persistAuditOutput } from "./report-output";
import { persistHostedAuditOutput } from "./history-output";
import { persistLocalAuditOutput } from "./local-history-output";
import { canonicalJSON } from "./protocol";
import { loadCommittedSettings } from "./settings";
import { assertCallerUnchanged, artifactDirectoryScope, externalResourceScope } from "./snapshot";
import { readNativeContext, readNativeCredential, withNativeObservation } from "./transport";
import { observePendingLease } from "./retained-controller";
import { verifyProductionPreflight } from "./preflight";
import { OUTPUT_LIMIT } from "./owned-process";
import { createRunArtifactWriter, originalRunContext, type RunDirectory } from "./run-directory";

/** Run the existing native assessment/review pipeline and retain its original report artifacts. */
export async function runReport(options: { repo: string; run: RunDirectory; history_directory: string;
  source_verification: { path: string; sha256: string } }) {
  const { run, repo } = options, source = run.manifest.source_commit;
  originalRunContext(run);
  const settings = loadCommittedSettings(repo, source).settings;
  if (settings.schema_version !== 2 || !settings.component) throw Error("Ordinary released report policy required");
  verifyProductionPreflight({ repo, current_default: source, component: settings.component });
  externalResourceScope(repo).assertExternal(options.history_directory);
  mkdirSync(options.history_directory, { mode: 0o700, recursive: true });
  const history = artifactDirectoryScope(options.history_directory, repo).directory;
  const credential = await readNativeCredential({ hostname: settings.hostname, cwd: repo });
  const invocation = randomUUID(), bytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-decisions",
    mode: "advisory", source_commit: source, selected_proposals: [], decisions: [], attention: [] });
  const retain = createRunArtifactWriter(run, settings.reports.max_entry_bytes, invocation);
  const decisions = retain("report-decisions", bytes);
  const hosted = process.env.GITHUB_ACTIONS === "true";
  const assessed = await withNativeObservation({ hostname: settings.hostname, repository: settings.repository, credential, collection: "audit" }, async observation => {
    const current = readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential, observation });
    let pending = observePendingLease(current.repository, settings, current.identity.repository_id);
    let session = await runAuditSession({ repo, source, artifact_root: run.directory, owner: run.manifest.id, observation,
      run: hosted ? process.env.GITHUB_RUN_ID ?? "" : invocation,
      ...(hosted ? { hosted_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT) } : {}),
      source_verification: options.source_verification, decisions, credential, cache_directory: history,
      entry: run.manifest.entry, launcher_path: join(import.meta.dir, "cli.ts"), settings_path: join(repo, ".vh-adlc/docs-drift.yaml"),
      environment: process.env, pending_publication: pending });
    // Absence is an uncached 404. Read it again after roles before saving a green report.
    if (!pending) {
      pending = observePendingLease(current.repository, settings, current.identity.repository_id);
      // A late lease produces an incomplete diagnostic session without completed-report authority.
      if (pending) session = { ...session, complete: false, report: null, diagnostics: [...session.diagnostics, ...pending.diagnostics] };
    }
    return { session, pending };
  });
  const { session, pending } = assessed;
  assertCallerUnchanged();
  const save = { repo, source, artifact_root: run.directory, session };
  const artifacts = hosted ? persistHostedAuditOutput(save)
    : settings.reports.interactive === "local-attestation" ? persistLocalAuditOutput(save) : persistAuditOutput(save);
  const output = auditSessionOutput(session, Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes), artifacts);
  return { output, pending, pending_reference: pending ? retain("pending-publication", canonicalJSON(pending)) : null,
    reference: retain("report-output", canonicalJSON(output)), decisions,
    worker: session.worker?.capture ?? null, reviewer: session.reviewer?.capture ?? null };
}
