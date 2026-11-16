import { realpathSync } from "node:fs";
import { join } from "node:path";
import { inspectRetainedOperation, restoreRetainedOperation } from "./recovery";
import { publicationMarker, readRetainedMetadata } from "./report-history";
import { canonicalDigest, freezeJSON } from "./protocol";
import { artifactDirectoryScope, captureRepositoryState, createOwnedObjectStore, matchesRepositoryState } from "./snapshot";
import { loadCommittedSettings, type Settings } from "./settings";
import { readRetainedPlan } from "./journal";
import { GitHubReadError, type RepositoryReader } from "../github-read";
import { createNativeTransport } from "./transport";
import { OUTPUT_LIMIT } from "./owned-process";
import { readNativeTrialSettings } from "./trial-definition";

type Options = {
  repo: string; source: string; artifact_root: string; operation_id: string;
  owner: string; run: string; credential: string; path?: string; restore?: true;
  trial_definition_sha256?: string;
};
export type PendingLeaseObservation = {
  authority: "none"; replay_authority: false; operation_id: string | null; plan_sha256: string | null;
  observed_refs: { lease: { ref: string; object: string }; receipt: { ref: string; object: string | null } | null };
  diagnostics: string[];
};

/** A present lease is pending independently of whether its historical metadata is readable. */
export function observePendingLease(reader: RepositoryReader, settings: Settings, repositoryID: number): PendingLeaseObservation | null {
  let lease: ReturnType<RepositoryReader["ref"]>;
  try { lease = reader.ref(settings.publication.lease_ref); }
  catch (error) {
    if (error instanceof GitHubReadError && error.status === 404) return null;
    throw error;
  }
  const result: PendingLeaseObservation = { authority: "none", replay_authority: false, operation_id: null, plan_sha256: null,
    observed_refs: { lease: { ref: lease.ref, object: lease.sha }, receipt: null },
    diagnostics: ["Publication operation remains pending at " + lease.ref + " object " + lease.sha + ". Preserve original ownership and unknown outcomes."] };
  try {
    const metadata = readRetainedMetadata(reader, lease.sha, settings.reports.max_entry_bytes), plan = readRetainedPlan(metadata.bytes);
    if (plan.manifest.repository !== settings.repository || plan.manifest.repository_id !== repositoryID)
      throw Error("Lease metadata belongs to another repository");
    publicationMarker(settings, plan.manifest.operation_id);
    result.operation_id = plan.manifest.operation_id; result.plan_sha256 = metadata.objects.plan_sha256;
    const ref = settings.publication.receipt_ref_prefix + plan.manifest.operation_id;
    try { result.observed_refs.receipt = { ref, object: reader.ref(ref).sha }; }
    catch (error) {
      if (error instanceof GitHubReadError && error.status === 404) result.observed_refs.receipt = { ref, object: null };
      else throw error;
    }
  } catch (error) {
    result.diagnostics.push(error instanceof Error ? error.message : "Original lease metadata or receipt observation is unavailable");
  }
  return freezeJSON(result);
}
type Summary = {
  authority: "none"; replay_authority: false; historical_review_verified: false;
  operation_id: string; plan_sha256: string; inspection_directory: string; object_store: string;
  policy_state: "unavailable-or-changed"; state: string; reason: string | null;
  journal_directory: string | null; revision: number | null; inspection_observation_count: number;
  inspection_observations: Array<{ effect_id: string; state: string; reason?: string }>; details_omitted: boolean;
  observed_refs: { lease: { ref: string; object: string | null }; receipt: { ref: string; object: string | null } };
};
function output(summary: Summary, source: string, restore: boolean, complete: boolean, limit: number) {
  const report = { schema_version: 1 as const, command: restore ? "restore-retained" : "inspect-retained", source_commit: source,
    outcome: complete ? "collected" as const : "incomplete" as const, retained_operation: { ...summary },
    diagnostics: summary.reason ? [{ code: "retained-observation", message: summary.reason }] : [] };
  const size = () => Buffer.byteLength(JSON.stringify(report) + "\n");
  if (size() > limit) {
    report.retained_operation.inspection_observations = []; report.retained_operation.details_omitted = true;
    report.retained_operation.reason = null; report.diagnostics = [];
  }
  if (size() > limit) throw Error("Configured output bound cannot retain the native observation summary and journal reference");
  return freezeJSON(report);
}

/** Current native metadata can restore observations. Missing original approval/model proof supplies no replay. */
export async function collectNativeRetained(input: Options) {
  const options = structuredClone(input), repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  const root = artifactDirectoryScope(options.artifact_root, repo).directory;
  const loaded = loadCommittedSettings(repo, options.source), settingsHash = loaded.settings_sha256;
  const settings = options.trial_definition_sha256 === undefined ? loaded.settings
    : readNativeTrialSettings({ repo, source: options.source, definition_sha256: options.trial_definition_sha256 }).settings;
  publicationMarker(settings, options.operation_id);
  const limit = Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes);
  const store = createOwnedObjectStore({ source_repo: repo, source_commit: options.source, parent: root, evidence_directory: root,
    repository: settings.repository, owner: options.owner, run: options.run });
  const transport = createNativeTransport({ source_repo: repo, artifact_root: root, object_store: store, settings,
    credential: options.credential, path: options.path });
  transport.execute = async () => { throw Error("Retained native observation grants no effects"); };
  try {
    const inspection = await inspectRetainedOperation({ source_repo: repo, artifact_root: root, settings, transport,
      operation_id: options.operation_id, verify_policy: () => null,
      verify_original: plan => {
        if (plan.context !== (options.trial_definition_sha256 ? "trial" : "production") || plan.transport !== "native"
          || (options.trial_definition_sha256 !== undefined && plan.schema_version !== 2) || plan.manifest.operation_id !== options.operation_id
          || plan.manifest.bindings.source_commit !== options.source || plan.manifest.bindings.settings_sha256 !== settingsHash)
          throw Error("Retained native original source or operation changed");
      } });
    const summary: Summary = { authority: "none", replay_authority: false, historical_review_verified: false,
      operation_id: options.operation_id, plan_sha256: inspection.objects.plan_sha256,
      inspection_directory: inspection.directory, object_store: store.root, policy_state: "unavailable-or-changed",
      state: "inspection", reason: null, journal_directory: null, revision: null,
      observed_refs: { lease: { ref: settings.publication.lease_ref, object: inspection.lease_object },
        receipt: { ref: settings.publication.receipt_ref_prefix + options.operation_id, object: inspection.receipt_object } },
      inspection_observation_count: inspection.observations.length, details_omitted: false,
      inspection_observations: inspection.observations.map(({ effect_id, observation }) => ({ effect_id, state: observation.state,
        ...("reason" in observation ? { reason: observation.reason } : {}) })) };
    if (!options.restore) return output(summary, options.source, false, inspection.observations.every(row => row.observation.state !== "unknown"), limit);
    // Check the complete minimum envelope before creating a local journal. No remote effect is permitted either way.
    output({ ...summary, state: "acknowledged", reason: null, journal_directory: join(root, "docs-drift-" + options.operation_id),
      revision: Number.MAX_SAFE_INTEGER, inspection_observations: [], details_omitted: true }, options.source, true, false, limit);
    const result = await restoreRetainedOperation({ inspection, publication: { source_repo: repo, artifact_root: root,
      object_store: store, settings, transport, plan: inspection.plan,
      gate: async () => { throw Error("Retained native observation grants no replay"); } } });
    return output({ ...summary, state: result.state, reason: result.reason,
      journal_directory: result.journal.directory, revision: result.journal.revision }, options.source, true, result.state === "complete", limit);
  } finally {
    if (!matchesRepositoryState(repo, before)) throw Error("Caller changed during retained native observation");
  }
}
