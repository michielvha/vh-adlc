import { bindRunJournal, type RunDirectory } from "./run-directory";
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { selectOriginalOperationRuntime } from "./bootstrap";
import { readNativeTrialSettings } from "./trial-definition";
import { fetchCurrentDefault } from "./proposals";
import { readJournal, type HostedExecutor } from "./journal";
import { readHostedExecutor } from "./hosted-executor";
import { acknowledgeDeliveries, reconcileAbsent, type AcknowledgementScope, type ReconciliationScope } from "./recovery";
import { recoveryEffectsOutput } from "./recovery-output";
import { readRecoveryAuthority } from "./recovery-authority";
import { exactRecord } from "./publication-decisions";
import { canonicalDigest, freezeJSON } from "./protocol";
import { artifactDirectoryScope, captureCallerState, createOwnedObjectStore, matchesCallerState, type OwnedObjectStore } from "./snapshot";
import { loadCommittedSettings, SetupRequired } from "./settings";
import { createNativeTransport, readNativeContext } from "./transport";
import { OUTPUT_LIMIT } from "./owned-process";
import type { AbsenceEvidence } from "./observations";

type Purpose = "acknowledgement" | "reconciliation";
export type RecoveryOptions = {
  repo: string; source: string; artifact_root: string; journal_directory: string; cache_directory: string;
  entry: string; owner: string; run: string; credential: string; path?: string; selection: unknown;
};
function selectedIDs(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000 || value.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(id))
    || new Set(value).size !== value.length) throw Error("Recovery effect selection required");
  return value;
}
function readSelection(value: unknown, source: string, operation: string) {
  const packet = exactRecord(value, ["schema_version", "kind", "source_commit", "operation_id", "purpose", "acknowledge_effect_ids", "retire_effect_ids", "retirement_lookups"], "Recovery selection fields changed");
  if (packet.schema_version !== 1 || packet.kind !== "docs-drift-recovery-selection" || packet.source_commit !== source || packet.operation_id !== operation
    || packet.purpose !== "acknowledgement" && packet.purpose !== "reconciliation") throw Error("Original recovery operation and purpose required");
  const acknowledge = selectedIDs(packet.acknowledge_effect_ids), retire = selectedIDs(packet.retire_effect_ids);
  if (packet.purpose === "acknowledgement" ? !acknowledge.length : acknowledge.length !== 0) throw Error("Recovery acknowledgement selection changed");
  const lookups = packet.retirement_lookups;
  if (!lookups || typeof lookups !== "object" || Array.isArray(lookups)) throw Error("Recovery original lookup mapping required");
  const selected: Record<string, AbsenceEvidence> = {};
  for (const [id, value] of Object.entries(lookups)) {
    if (!retire.includes(id) || packet.purpose !== "reconciliation") throw Error("Recovery lookup selection changed");
    const reference = exactRecord(value, ["path", "sha256"], "Recovery original lookup fields changed");
    if (typeof reference.path !== "string" || typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(reference.sha256)) throw Error("Recovery original lookup reference required");
    selected[id] = { path: reference.path, sha256: reference.sha256 };
  }
  return { purpose: packet.purpose as Purpose, acknowledge_effect_ids: acknowledge, retire_effect_ids: retire, retirement_lookups: selected };
}

async function collectContext(input: RecoveryOptions, execution?: Purpose, run?: RunDirectory) {
  const options = structuredClone(input), repo = realpathSync(options.repo), before = canonicalDigest(captureCallerState(repo));
  const root = artifactDirectoryScope(options.artifact_root, repo).directory;
  if (dirname(realpathSync(options.journal_directory)) !== root) throw Error("Original recovery journal artifact root required");
  const journal = readJournal(options.journal_directory, repo), plan = journal.plan;
  if (plan.manifest.bindings.source_commit !== options.source || plan.transport !== "native") throw Error("Original native recovery source required");
  const selection = readSelection(options.selection, options.source, plan.manifest.operation_id);
  if (execution && execution !== selection.purpose) throw Error("Recovery command purpose differs from its selected operation");
  let { settings } = loadCommittedSettings(repo, options.source);
  const comparison = { repository: plan.manifest.repository, repository_id: plan.manifest.repository_id,
    actor: plan.manifest.actor, actor_id: plan.manifest.actor_id, default_branch: settings.default_branch };
  const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential,
    path: options.path, comparison_identity: comparison });
  const observed = native();
  if (observed.identity.repository_id !== plan.manifest.repository_id || observed.identity.repository !== plan.manifest.repository
    || observed.identity.actor_id !== plan.manifest.actor_id || observed.identity.actor !== plan.manifest.actor) throw Error("Recovery original repository and actor required");
  const runtime = await selectOriginalOperationRuntime({ repo, directory: resolve(import.meta.dir, "../.."), plan,
    identity: observed.identity, entry: options.entry });
  settings = runtime.settings;
  if (execution && realpathSync(import.meta.path) !== join(runtime.component.directory, "scripts/docs-drift/recovery-controller.ts"))
    throw Error("Original retained recovery controller required");
  let originalRun: RunDirectory | undefined;
  if (execution) {
    if (!run) throw Error("Original run required for version-two recovery");
    originalRun = bindRunJournal(run, journal);
  }
  // This owned environment carries immutable source and metadata. Original journals and application artifacts supply proof.
  const store = createOwnedObjectStore({ source_repo: repo, source_commit: options.source, parent: root, evidence_directory: root,
    owner: options.owner, run: options.run, repository: settings.repository });
  const fetched = await fetchCurrentDefault(store, { hostname: settings.hostname, repository: settings.repository, default_branch: settings.default_branch,
    expected_default_commit: observed.default_commit, environment: { PATH: options.path ?? process.env.PATH ?? "/usr/bin:/bin",
      ...(settings.hostname === "github.com" || settings.hostname.endsWith(".ghe.com") ? { GH_TOKEN: options.credential } : { GH_ENTERPRISE_TOKEN: options.credential }) } });
  if (!fetched.complete) throw Error("Current recovery permission source unavailable");
  const fresh = native();
  if (canonicalDigest(fresh.identity) !== canonicalDigest(observed.identity) || fresh.default_commit !== observed.default_commit)
    throw Error("Recovery identity or permission source changed during collection");
  if (!matchesCallerState(repo, before)) throw Error("Caller changed during recovery collection");
  const transport = createNativeTransport({ source_repo: repo, artifact_root: root, object_store: store, settings, credential: options.credential, path: options.path, run: originalRun });
  const common = { source_repo: repo, journal_directory: journal.directory, object_store: store, settings, transport };
  return { options, repo, before, settings, runtime, native, observed, store, selection, common, plan };
}

/** Inspect only. The same lower recovery path stops before authority and preserves the journal. */
export type RecoveryInspection = {
  schema_version: 1; kind: "docs-drift-recovery-inspection"; authority: "none"; complete: boolean; diagnostics: string[];
  purpose: Purpose | null; state: string | null; scopes: Array<AcknowledgementScope | ReconciliationScope>; scope_sha256s: string[];
  resources: { object_store: OwnedObjectStore } | null;
};
export function recoveryInspectionOutput(inspection: RecoveryInspection, source: string) {
  return { schema_version: 1 as const, command: "inspect-recovery", source_commit: source,
    outcome: inspection.complete ? "collected" as const : "incomplete" as const, recovery_inspection: inspection,
    diagnostics: inspection.diagnostics.map(message => ({ code: "recovery-inspection", message })) };
}

export async function inspectRecovery(input: RecoveryOptions): Promise<RecoveryInspection> {
  const result: RecoveryInspection = { schema_version: 1, kind: "docs-drift-recovery-inspection", authority: "none", complete: false,
    diagnostics: [], purpose: null, state: null, scopes: [], scope_sha256s: [], resources: null };
  try {
    const context = await collectContext(input), selected = context.selection;
    result.purpose = selected.purpose; result.resources = { object_store: context.store };
    const authorize = async () => { throw Error("Recovery inspection grants no effects"); };
    if (selected.purpose === "acknowledgement") {
      const inspected = await acknowledgeDeliveries({ ...context.common, ...selected, inspect_only: true, authorize });
      result.state = inspected.state; result.scopes = inspected.inspection_scope ? [inspected.inspection_scope] : [];
      if (inspected.reason && inspected.reason !== "inspection-only") result.diagnostics.push(inspected.reason);
    } else {
      const inspected = await reconcileAbsent({ ...context.common, ...selected, inspect_only: true, authorize });
      result.state = inspected.state; result.scopes = inspected.inspection_scopes ?? [];
      if (inspected.reason && inspected.reason !== "inspection-only") result.diagnostics.push(inspected.reason);
    }
    result.complete = result.diagnostics.length === 0 && (result.scopes.length > 0 || result.state !== "pending");
    result.scope_sha256s = result.scopes.map(canonicalDigest);
    if (!matchesCallerState(context.repo, context.before)) { result.complete = false; result.diagnostics.push("Caller changed during recovery inspection"); }
    if (Buffer.byteLength(JSON.stringify(recoveryInspectionOutput(result, context.options.source)) + "\n") > Math.min(OUTPUT_LIMIT, context.settings.reports.max_entry_bytes)) throw Error("Recovery scope exceeds the configured retained entry bound");
  } catch (error) {
    result.complete = false; result.scopes = []; result.scope_sha256s = [];
    result.diagnostics.push(error instanceof Error ? error.message : "Recovery inspection unavailable");
  }
  return freezeJSON(result);
}

/** Execute only metadata recovery under fresh exact authority using the original retained code. */
export async function applyRecovery(input: RecoveryOptions & { authority: unknown; purpose: Purpose; hosted_executor?: HostedExecutor }, run?: RunDirectory) {
  const original = readJournal(input.journal_directory, input.repo).plan;
  if (original.schema_version !== 2)
    throw new SetupRequired("Use the original implementation for this operation format.");
  if (original.context === "production" && original.manifest.publisher_entry === "hosted"
    && (!input.hosted_executor || canonicalDigest(input.hosted_executor) !== canonicalDigest(original.hosted_executor ?? null)))
    throw new SetupRequired("Hosted recovery executor identity required");
  const options = structuredClone(input), context = await collectContext(options, options.purpose, run), selected = context.selection;
  if (options.hosted_executor) readHostedExecutor({ entry: options.entry, executor: options.hosted_executor,
    settings: context.settings, source: options.source, identity: context.observed.identity, reader: context.observed.repository });
  recoveryEffectsOutput({ command: selected.purpose === "acknowledgement" ? "acknowledge-delivery" : "reconcile-publication",
    source: options.source, outcome: "incomplete", limit: Math.min(OUTPUT_LIMIT, context.settings.reports.max_entry_bytes), capacity_check: true,
    result: { state: "pending", reason: null, journal: readJournal(options.journal_directory, options.repo) } });
  const reference = options.authority;
  const authorize = async (scope: Parameters<typeof readRecoveryAuthority>[0]["scope"]) => {
    const fresh = context.native();
    if (canonicalDigest(fresh.identity) !== canonicalDigest(context.observed.identity) || fresh.default_commit !== context.observed.default_commit)
      throw Error("Current recovery authority source changed");
    return readRecoveryAuthority({ source_repo: context.repo, artifact_root: context.common.transport.artifact_root, reference, purpose: selected.purpose, scope,
      current_procedure: () => {
        let current = loadCommittedSettings(context.store.root, fresh.default_commit).settings;
        if (context.plan.schema_version === 2 && context.plan.context === "trial") {
          if (!current.trial) throw Error("Recovery current trial procedure unavailable");
          current = readNativeTrialSettings({ repo: context.store.root, source: fresh.default_commit,
            definition_sha256: current.trial.definition_sha256 }).settings;
        }
        if (current.repository !== context.settings.repository || current.hostname !== context.settings.hostname
          || current.publication.lease_ref !== context.settings.publication.lease_ref
          || current.publication.receipt_ref_prefix !== context.settings.publication.receipt_ref_prefix)
          throw Error("Recovery current procedure repository or ref namespace changed");
        return { repo: context.store.root, current_default: fresh.default_commit, path: current.project_procedure,
          receipt_ref_prefix: current.publication.receipt_ref_prefix };
      } });
  };
  return selected.purpose === "acknowledgement"
    ? acknowledgeDeliveries({ ...context.common, ...selected, authorize }) : reconcileAbsent({ ...context.common, ...selected, authorize });
}
