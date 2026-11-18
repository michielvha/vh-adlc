import type { WorkflowRunInput } from "../github-read";
import { isGitAncestor, readAdoptionInput } from "./git";
import { readHistoryWorkflowContract, readHistoryWorkflowEvents } from "./history-workflow";
import { requireOwnedStore } from "./proposals";
import { canonicalDigest, compareUTF8, freezeJSON, sha256 } from "./protocol";
import type { ProducerSource, VerifiedProducer } from "./report-history";
import { loadCommittedSettings, SetupRequired, settingsProjections, type InstalledSettings } from "./settings";
import { verifyProductionPreflight } from "./preflight";
import type { OwnedObjectStore } from "./snapshot";
import { requireCompleteHistory } from "./snapshot";
import type { PublicationIdentity } from "./transport";

function fail(reason: string): never { throw Error("incomplete docs-drift history producer " + reason); }

function flatProducer(input: { store: OwnedObjectStore; current_default: string; identity: PublicationIdentity }, current: InstalledSettings) {
  const { store, identity } = input, repo = store.root;
  if (!current.component) fail("ordinary released component required");
  verifyProductionPreflight({ repo, current_default: input.current_default, component: current.component });
  return (source: ProducerSource, run: WorkflowRunInput): VerifiedProducer | null => {
    try {
      requireOwnedStore(store, identity.repository);
      if (source.commit_sha !== run.head_sha || run.repository.id !== identity.repository_id
        || run.repository.full_name.toLowerCase() !== identity.repository.toLowerCase()
        || run.head_repository?.id !== identity.repository_id || run.head_repository.full_name.toLowerCase() !== identity.repository.toLowerCase()
        || !["schedule", "workflow_dispatch"].includes(run.event) || run.head_branch !== identity.default_branch) fail("native source or repository changed");
      requireCompleteHistory(repo, run.head_sha); requireCompleteHistory(repo, input.current_default);
      if (!isGitAncestor(repo, run.head_sha, input.current_default)) return null;
      if (readAdoptionInput(repo, run.head_sha, ".vh-adlc/docs-drift.yaml") === null) return null;
      const { settings } = loadCommittedSettings(repo, run.head_sha);
      if (settings.schema_version !== 2 || settings.publication.mode !== "adopted") return null;
      if (settings.repository !== identity.repository.toLowerCase() || settings.hostname !== current.hostname
        || settings.default_branch !== identity.default_branch) fail("original producer repository changed");
      if (!settings.component || !settings.publication.checklist_path || !settings.execution.worker_workflow) fail("original ordinary workflow policy required");
      const original = verifyProductionPreflight({ repo, current_default: run.head_sha, component: settings.component });
      if (!Object.values(original.checklist.native_entries).some(entry => entry.repository_id === identity.repository_id))
        fail("original native repository changed");
      if (run.workflow_id !== settings.reports.workflow_id || ![settings.reports.workflow_path,
        settings.reports.workflow_path + "@" + settings.default_branch, settings.reports.workflow_path + "@refs/heads/" + settings.default_branch,
        settings.reports.workflow_path + "@" + run.head_sha].includes(run.path)) fail("native scheduled workflow changed");
      const paths = [...new Set(["AGENTS.md", ".vh-adlc/docs-drift.yaml", settings.publication.checklist_path,
        settings.project_procedure, settings.reports.workflow_path, settings.execution.worker_workflow,
        ...(settings.execution.claude_command ? [settings.execution.claude_command] : []), settings.scanner.script,
        ...(settings.scanner.adapter ? [settings.scanner.adapter] : []), ...settings.feedback_files])].sort(compareUTF8);
      const native = new Map<string, Buffer | null>();
      const blobs = paths.map(path => {
        const expected = readAdoptionInput(repo, run.head_sha, path), bytes = source.file(path);
        if ((!expected && path !== "AGENTS.md") || (bytes === null ? null : sha256(bytes)) !== (expected?.sha256 ?? null)) fail("protected native blob changed " + path);
        native.set(path, bytes);
        return [path, expected?.mode ?? null, expected?.sha256 ?? null] as const;
      });
      const scheduled = native.get(settings.reports.workflow_path), worker = native.get(settings.execution.worker_workflow);
      if (!scheduled || !worker) fail("protected workflow source required");
      if (!readHistoryWorkflowEvents(scheduled).some(event => event === run.event)) fail("original caller trigger changed");
      const contract = readHistoryWorkflowContract({ scheduled, worker, worker_path: settings.execution.worker_workflow });
      return freezeJSON({ source_commit: run.head_sha,
        manifest_sha256: canonicalDigest({ settings: settingsProjections(settings).protected, component: settings.component, blobs }),
        component_sha256: settings.component.component_sha256, source_inputs_sha256: canonicalDigest(source.bindings()), ...contract });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("incomplete docs-drift history producer ")) throw error;
      fail("original ordinary native producer unavailable");
    }
  };
}

/** Native history supplies this callback. It accepts no report-provided approval or producer identity. */
export function createAdoptedProducerVerifier(input: { store: OwnedObjectStore; current_default: string; identity: PublicationIdentity }) {
  const store = { ...input.store }, current = input.current_default, identity = { ...input.identity }, repo = store.root;
  requireOwnedStore(store, identity.repository);
  const currentSettings = loadCommittedSettings(repo, current).settings;
  if (currentSettings.schema_version !== 2) throw new SetupRequired("Use the original implementation to inspect version-one report history.");
  return flatProducer({ store, current_default: current, identity }, currentSettings);
}
