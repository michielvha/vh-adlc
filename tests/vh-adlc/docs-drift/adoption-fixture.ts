/** Synthetic consumer and observed-shaped attestation fixtures. No native acceptance is claimed. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTrialHistoryBindings } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-definition";
import { collectAdoptionBindings } from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture } from "./publication-fixture";
import { settingsFixture } from "./settings-fixture";
import { hash } from "./manifest-fixture";

export const pin = () => ({ schema_version: 1 as const, source_repository: "fixture/shared", source_commit: "a".repeat(40),
  source_release: "v1.0.0", plugin_version: "0.11.0", component_sha256: hash("fixture component") });
export function write(repo: string, path: string, bytes: string | Uint8Array) {
  const file = join(repo, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
}
export function commit(repo: string, message: string) {
  readGit(repo, "add", "--", ".");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", message);
  return readGit(repo, "rev-parse", "HEAD").toString().trim();
}
export function source(roots: string[], options: { pin?: ReturnType<typeof pin>; client?: ReturnType<typeof settingsFixture>["clients"]["copilot-linux"]; hostname?: string } = {}) {
  const f = publicationFixture(roots), settings = { ...settingsFixture(),
    component_pin: ".vh-adlc/docs-drift-components/shared.yaml", publication: { ...settingsFixture().publication, mode: "adopted" },
    reports: { ...settingsFixture().reports, workflow_id: 19 } };
  if (options.client) settings.clients["copilot-linux"] = options.client;
  if (options.hostname) settings.hostname = options.hostname;
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings));
  write(f.repo, settings.component_pin, canonicalJSON(options.pin ?? pin()));
  for (const path of [settings.project_procedure, settings.execution.worker_workflow, settings.execution.scheduled_workflow,
    settings.execution.claude_command, settings.runtime_loader.launcher]) write(f.repo, path, "Synthetic protected input " + path + "\n");
  write(f.repo, settings.scanner.script, "Synthetic ordinary detector implementation\n");
  write(f.repo, "docs/guide.md", "Synthetic ordinary document\n");
  return { ...f, configured: settings, candidate: commit(f.repo, "synthetic adopted source candidate") };
}

export const runtimeIdentity = { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20, default_branch: "main" };

// Observed-shaped owner-attestation parser fixtures only. They establish no native host execution.
export type AdoptionSourceFixture = Pick<ReturnType<typeof source>, "repo" | "configured" | "candidate">;
export function portableRecord(f: AdoptionSourceFixture) {
  const bindings = collectAdoptionBindings(f.repo, f.candidate);
  const trialHistory = readTrialHistoryBindings({ repo: f.repo, source: f.candidate, settings: bindings.settings });
  const target = hash(canonicalJSON({ schema_version: 1, repository: f.configured.repository,
    source_candidate: f.candidate, protected_sha256: bindings.protected_sha256,
    component_pin_sha256: bindings.component_pin.sha256, identity: runtimeIdentity }).toString());
  const requirements = {
    hosted_advisory: ["collection_complete", "independent_review", "reviewed_draft_payload", "report_uploaded", "lease_complete"],
    history_read: ["native_history_read", "producer_verified", "permissions_bound"],
    quiescence: ["schedule_disabled", "runs_drained", "interactive_frozen", "no_legacy_owners"],
    copilot_entry: ["audit", "resolve", "closure", "issue", "acknowledgement", "ownership_denials", "settlement_denials", "retained_loader", "role_dispatch"],
    claude_entry: ["audit", "resolve", "closure", "issue", "acknowledgement", "ownership_denials", "settlement_denials", "retained_loader", "role_dispatch", "forwarded_arguments", "command_binding"],
    paired_review: ["shared_target", "consumer_target", "no_blocking_findings", "owner_acceptance"],
    codex_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
    claude_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
    copilot_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
  };
  const receipts = Object.fromEntries(Object.entries(requirements).map(([name, observations]) => {
    const entry = name === "hosted_advisory" ? f.configured.execution.entries.hosted
      : name === "claude_entry" ? f.configured.execution.entries.claude
      : name === "copilot_entry" || name === "paired_review" ? f.configured.execution.entries.copilot : null;
    const clientNames = entry === null ? [] : name === "paired_review" ? [entry.reviewer.client]
      : [entry.worker.client, entry.reviewer.client];
    const client_bindings = Object.fromEntries(Object.entries(f.configured.clients).filter(([id]) => clientNames.includes(id)));
    return [name, { schema_version: 1, kind: name, evidence_kind: "observed", source_commit: name.endsWith("_install") ? bindings.component_pin.value.source_commit : f.candidate,
      artifact_sha256: hash(name + " synthetic original bytes"), bindings_sha256: target, outcome: "passed", native_conclusion: "success",
      worker_model: name === "paired_review" ? null : entry?.worker.model ?? null, reviewer_model: entry?.reviewer.model ?? null, client_bindings,
      observations: Object.fromEntries(observations.map(observation => [observation, true])),
      ...(name === "history_read" ? trialHistory ?? { producer_workflow_id: f.configured.reports.workflow_id,
        producer_workflow_path: f.configured.execution.scheduled_workflow, reader_workflow_id: 222,
        reader_workflow_path: f.configured.execution.worker_workflow } : {}),
      ...(name === "quiescence" ? { workflow_id: f.configured.reports.workflow_id,
        workflow_path: f.configured.execution.scheduled_workflow, observed_at: "2000-01-01T00:00:00Z",
        workflow_state: "disabled_manually", drained_runs: [],
        queued_run_ids: [], in_progress_run_ids: [], interactive_request_sha256: hash("synthetic explicit freeze") } : {}) }];
  }));
  return { schema_version: 1, kind: "docs-drift-adoption", source_candidate: f.candidate,
    protected_sha256: bindings.protected_sha256, protected_manifest: bindings.protected_manifest,
    component_pin_sha256: bindings.component_pin.sha256, identity: runtimeIdentity, receipts, predecessor: null };
}
export function deliverRecord(f: ReturnType<typeof source>, record: ReturnType<typeof portableRecord>) {
  write(f.repo, f.configured.publication.adoption_record, canonicalJSON(record));
  return commit(f.repo, "synthetic portable attestation child");
}

