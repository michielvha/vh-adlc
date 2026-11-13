import { realpathSync } from "node:fs";
import { ArtifactChanged } from "./evidence-input";
import { createAdoptedProducerVerifier } from "./history-producer";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, freezeJSON } from "./protocol";
import { PublicationScopeChanged } from "./publish";
import { collectWorkerInputs, type WorkerCollectionOptions } from "./publication-worker";
import { collectActionsHistory, collectLocalHistory, type HistoryContext, type OwnedInvocation } from "./report-history";
import type { HistorySnapshot } from "./report";
import { loadCommittedSettings } from "./settings";
import { captureRepositoryState, matchesRepositoryState } from "./snapshot";
import { readNativeContext } from "./transport";

type Options = WorkerCollectionOptions & {
  /** Original registry supplied by the local execution controller, never a CLI approval flag. */
  owned_local_invocations?: OwnedInvocation[];
};
type Result = {
  schema_version: 1; kind: "docs-drift-history-collection"; authority: "none"; source_commit: string;
  complete: boolean; scope_changed: boolean; mode: "actions" | "local-attestation" | "none" | null; captured_at: string;
  context: HistoryContext | null; worker_input_sha256: string | null; current_default: string | null;
  history: Array<{ kind: "report"; locator: string; sha256: string; expires_at: string }>; receipts: unknown[];
  diagnostics: string[]; details_omitted: boolean;
};
const originalSnapshots = new WeakMap<object, HistorySnapshot>();
function copySnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return { captured_at: snapshot.captured_at, diagnostics: [...snapshot.diagnostics],
    records: snapshot.records.map(record => ({ ...record, bytes: Buffer.from(record.bytes) })) };
}
export function historyCollectionOutput(result: Result) {
  return { schema_version: 1 as const, command: "collect-report-history", source_commit: result.source_commit,
    outcome: result.complete ? "collected" as const : "incomplete" as const, history_collection: result,
    diagnostics: result.diagnostics.map(message => ({ code: "report-history", message })) };
}

/** Collect the starting history view from current native policy, never from a report's provenance claims. */
export async function collectNativeReportHistory(input: Options): Promise<Result> {
  const options = { ...input, path: input.path ?? process.env.PATH, source_verification: structuredClone(input.source_verification),
    decisions: structuredClone(input.decisions), owned_local_invocations: structuredClone(input.owned_local_invocations) };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo)), captured_at = new Date().toISOString();
  const result: Result = { schema_version: 1, kind: "docs-drift-history-collection", authority: "none", source_commit: options.source,
    complete: false, scope_changed: false, mode: null, captured_at, context: null, worker_input_sha256: null, current_default: null,
    history: [], receipts: [], diagnostics: [], details_omitted: false };
  let snapshot: HistorySnapshot | null = null, limit = OUTPUT_LIMIT;
  try {
    const { settings } = loadCommittedSettings(repo, options.source);
    limit = Math.min(limit, settings.reports.max_entry_bytes);
    result.mode = options.entry === "hosted" ? settings.reports.hosted : settings.reports.interactive;
    if (options.entry === "hosted" && (!/^[1-9][0-9]*$/u.test(options.run) || !Number.isSafeInteger(Number(options.run))))
      throw Error("Current native scheduled run identity required");
    const current = await collectWorkerInputs(options);
    result.scope_changed = current.scope_changed;
    if (!current.complete || !current.inputs || !current.worker_input_sha256 || !current.facts?.store || !current.facts.identity || !current.facts.current_default) {
      result.diagnostics.push(...current.diagnostics); throw Error("Complete original native inputs required for report history");
    }
    const facts = current.facts, identity = facts.identity, store = facts.store, currentDefault = facts.current_default;
    if (!identity || !store || !currentDefault) throw Error("Current native history source required");
    result.worker_input_sha256 = current.worker_input_sha256; result.current_default = currentDefault;
    const context: HistoryContext = { repository: settings.repository, scope_sha256: current.inputs.scope_sha256, run_id: options.run, started_at: captured_at };
    result.context = context;
    const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path });
    const initial = native();
    if (initial.default_commit !== currentDefault || canonicalDigest(initial.identity) !== canonicalDigest(identity))
      throw new PublicationScopeChanged("Native history source or actor changed before collection");
    const run = options.entry === "hosted" ? initial.repository.run(Number(options.run)) : null;
    const runBinding = (selected: NonNullable<typeof run>) => {
      const { updated_at: _updated, ...binding } = selected;
      return canonicalDigest(binding);
    };
    if (run && (run.repository.id !== identity.repository_id || run.head_repository?.id !== identity.repository_id
      || run.head_sha !== options.source || run.head_branch !== settings.default_branch || run.event !== "schedule" || run.status !== "in_progress"
      || run.workflow_id !== settings.reports.workflow_id || ![settings.reports.workflow_path, settings.reports.workflow_path + "@" + settings.default_branch,
        settings.reports.workflow_path + "@refs/heads/" + settings.default_branch, settings.reports.workflow_path + "@" + options.source].includes(run.path)))
      throw new PublicationScopeChanged("Current native scheduled run identity changed");
    if (result.mode === "actions") {
      const collected = await collectActionsHistory({ repo, artifact_root: options.artifact_root, settings, context, reader: initial.repository,
        environment: { PATH: options.path, ...(settings.hostname === "github.com" || settings.hostname.endsWith(".ghe.com")
          ? { GH_TOKEN: options.credential } : { GH_ENTERPRISE_TOKEN: options.credential }) },
        verifyProducer: createAdoptedProducerVerifier({ store, current_default: currentDefault, identity }) });
      snapshot = collected; result.receipts = collected.receipts;
      if (!collected.complete) { result.diagnostics.push(...collected.diagnostics); throw Error("Required native report history collection incomplete"); }
    } else if (result.mode === "local-attestation") {
      if (!options.owned_local_invocations) throw Error("Original local invocation registry required for adopted report history");
      snapshot = collectLocalHistory({ repo, settings, context, invocations: options.owned_local_invocations });
    } else snapshot = { captured_at, records: [], diagnostics: ["Report history is disabled by the adopted interactive policy; no earlier attention can be carried"] };
    const final = native();
    if (final.default_commit !== currentDefault || canonicalDigest(final.identity) !== canonicalDigest(identity)
      || (run && runBinding(final.repository.run(run.id, run.run_attempt)) !== runBinding(run)))
      throw new PublicationScopeChanged("Native history source, actor or invocation changed during collection");
    result.history = snapshot.records.map(({ bytes: _bytes, ...record }) => record);
    result.diagnostics.push(...snapshot.diagnostics); result.complete = true;
  } catch (error) {
    result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Original native report history unavailable");
  }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during report history collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  if (Buffer.byteLength(JSON.stringify(historyCollectionOutput(result)) + "\n") > limit) {
    result.complete = false; result.details_omitted = true; result.history = []; result.receipts = [];
    result.diagnostics = ["Native history details exceed the retained entry bound; inspect the original history artifacts"];
    if (Buffer.byteLength(JSON.stringify(historyCollectionOutput(result)) + "\n") > limit) throw Error("Configured output bound cannot hold an incomplete native history result");
  }
  const completed = freezeJSON(result);
  if (completed.complete && snapshot) originalSnapshots.set(completed, copySnapshot(snapshot));
  return completed;
}

/** Same-controller handoff only. Serialized metadata cannot mint eligible history. */
export function readCollectedReportHistory(result: Result): HistorySnapshot {
  const snapshot = originalSnapshots.get(result);
  if (!snapshot || !result.complete) throw Error("Original native history collection required");
  return copySnapshot(snapshot);
}
