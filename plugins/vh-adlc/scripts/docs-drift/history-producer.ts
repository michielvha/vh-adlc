import type { WorkflowRunInput } from "../github-read";
import { collectAdoptionBindings, verifyRuntimeAdoption } from "./adoption";
import { readCompatibleAdoptionLineage } from "./adoption-lineage";
import { readAdoptionInput, readGit } from "./git";
import { readHistoryWorkflowContract } from "./history-workflow";
import { requireOwnedStore } from "./proposals";
import { canonicalDigest, freezeJSON, sha256 } from "./protocol";
import type { ProducerSource, VerifiedProducer } from "./report-history";
import { loadCommittedSettings } from "./settings";
import type { OwnedObjectStore } from "./snapshot";
import type { PublicationIdentity } from "./transport";

function fail(reason: string): never { throw Error("incomplete docs-drift history producer " + reason); }

/** Native history supplies this callback. It accepts no report-provided approval or producer identity. */
export function createAdoptedProducerVerifier(input: { store: OwnedObjectStore; current_default: string; identity: PublicationIdentity }) {
  const store = { ...input.store }, current = input.current_default, identity = { ...input.identity }, repo = store.root;
  requireOwnedStore(store, identity.repository);
  const allowed = new Set(readCompatibleAdoptionLineage({ store, current_default: current, identity }));
  return (source: ProducerSource, run: WorkflowRunInput): VerifiedProducer | null => {
    try {
      requireOwnedStore(store, identity.repository);
      if (source.commit_sha !== run.head_sha || run.repository.id !== identity.repository_id
        || run.repository.full_name.toLowerCase() !== identity.repository.toLowerCase()
        || run.head_repository?.id !== identity.repository_id || run.head_repository.full_name.toLowerCase() !== identity.repository.toLowerCase()
        || run.event !== "schedule" || run.head_branch !== identity.default_branch) fail("native source or repository changed");
      if (readGit(repo, "rev-parse", "--verify", "--end-of-options", run.head_sha + "^{commit}").toString().trim() !== run.head_sha)
        fail("complete producer objects required");
      try { readGit(repo, "merge-base", "--is-ancestor", run.head_sha, current); } catch { return null; }
      // A pre-adoption run is ineligible, not a fabricated approved producer.
      if (readAdoptionInput(repo, run.head_sha, ".vh-adlc/docs-drift.yaml") === null) return null;
      const { settings } = loadCommittedSettings(repo, run.head_sha);
      if (settings.publication.mode !== "adopted" || readAdoptionInput(repo, run.head_sha, settings.publication.adoption_record) === null) return null;
      const adopted = verifyRuntimeAdoption({ repo, current_default: run.head_sha, identity });
      if (!allowed.has(adopted.adoption_sha256)) return null;
      if (run.workflow_id !== settings.reports.workflow_id || ![settings.reports.workflow_path,
        settings.reports.workflow_path + "@" + settings.default_branch, settings.reports.workflow_path + "@refs/heads/" + settings.default_branch,
        settings.reports.workflow_path + "@" + run.head_sha].includes(run.path)) fail("native scheduled workflow changed");
      const bindings = collectAdoptionBindings(repo, run.head_sha);
      const required = new Map<string, string | null>(bindings.protected_manifest.blobs.map(([path, , digest]) => [path, digest]));
      required.set(".vh-adlc/docs-drift.yaml", bindings.settings_sha256);
      required.set(bindings.component_pin.path, bindings.component_pin.sha256);
      required.set(adopted.record_path, adopted.adoption_sha256);
      for (const [path, expected] of required) {
        const bytes = source.file(path);
        if ((bytes === null ? null : sha256(bytes)) !== expected) fail("protected native blob changed " + path);
      }
      const scheduled = source.file(settings.execution.scheduled_workflow), worker = source.file(settings.execution.worker_workflow);
      if (!scheduled || !worker) fail("protected workflow source required");
      const contract = readHistoryWorkflowContract({ scheduled, worker, worker_path: settings.execution.worker_workflow });
      return freezeJSON({ source_commit: run.head_sha, manifest_sha256: adopted.protected_sha256,
        component_sha256: adopted.component_pin.component_sha256, source_inputs_sha256: canonicalDigest(source.bindings()), ...contract });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("incomplete docs-drift history producer ")) throw error;
      fail("approved native producer unavailable");
    }
  };
}
