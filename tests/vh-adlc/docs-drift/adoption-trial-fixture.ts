/** Owned synthetic adoption sources and explicitly test-only receipt metadata. */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { collectAdoptionBindings } from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { TRIAL_CONTEXT_PATH } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { portableRecord, type AdoptionSourceFixture } from "./adoption-fixture";
import { commitAll, git, put } from "./repository-fixture";
import { syntheticTrialFixture } from "./trial-fixture";

export function trialAdoptionFixture(roots: string[]) {
  const f = syntheticTrialFixture(roots);
  const component = computeComponentIdentity(join(f.root, "component-source"), f.manifest.component.source_commit);
  const configured = { ...f.settings, component_pin: ".vh-adlc/docs-drift-components/synthetic.yaml",
    publication: { ...f.settings.publication, mode: "adopted" }, reports: { ...f.settings.reports, workflow_id: 19 } };
  put(f.source, configured.component_pin, canonicalJSON({ schema_version: 1, source_repository: "fixture/shared",
    source_commit: component.source_commit, source_release: "v1.0.0", plugin_version: component.plugin_version,
    component_sha256: component.component_sha256 }).toString());
  put(f.source, configured.execution.scheduled_workflow, canonicalJSON({ on: { schedule: [{ cron: "0 6 * * *" }], workflow_dispatch: null },
    permissions: configured.execution.permissions, jobs: { worker: { uses: "./" + configured.execution.worker_workflow,
      with: { component_pin: configured.component_pin, pr_draft: configured.publication.pr_state.advisory === "draft" },
      secrets: { COPILOT_GITHUB_TOKEN: "${{ secrets.COPILOT_GITHUB_TOKEN }}" } } } }).toString());
  put(f.source, ".vh-adlc/docs-drift.yaml", canonicalJSON(configured).toString());
  const candidate = commitAll(f.source);
  git(f.source, "push", "origin", candidate + ":refs/heads/main");
  const store = createOwnedObjectStore({ source_repo: f.source, source_commit: candidate, parent: join(f.root, "objects"),
    evidence_directory: join(f.root, "evidence"), repository: "fixture/docs", owner: "synthetic-adoption", run: f.manifest.fixture_id });
  f.manifest.source_commit = candidate;
  f.manifest.object_store = { ...store, root: relative(f.root, store.root), record_path: relative(f.root, store.record_path) };
  f.manifest.origin_initial_refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)").split("\n").map(row => row.split(" "));
  f.manifest.launcher.sha256 = sha256(readFileSync(join(f.source, configured.runtime_loader.launcher)));
  put(f.source, TRIAL_CONTEXT_PATH, canonicalJSON(f.manifest).toString());
  const contextCommit = commitAll(f.source);
  const source: AdoptionSourceFixture = { repo: f.source, configured, candidate };
  const record = portableRecord(source);
  for (const receipt of Object.values(record.receipts)) Object.assign(receipt, { evidence_kind: "test-only", fixture_id: f.manifest.fixture_id });
  const testRecord = { ...record, fixture_id: f.manifest.fixture_id };
  return { ...f, store, settings: configured, sourceCommit: candidate, contextCommit, candidate, configured, record: testRecord,
    boundary: { root: f.root, context_commit: contextCommit, runtime_directory: f.runtime } };
}

export function trialAdoptionDelivery(f: Omit<ReturnType<typeof trialAdoptionFixture>, "record"> & { record: unknown }, record: unknown = f.record) {
  git(f.source, "switch", "--detach", f.candidate);
  put(f.source, f.configured.publication.adoption_record, canonicalJSON(record).toString());
  const delivered = commitAll(f.source);
  git(f.source, "switch", "main");
  return delivered;
}


export function compatibleTrialUpgrade(f: Omit<ReturnType<typeof trialAdoptionFixture>, "record"> & { record: { receipts: ReturnType<typeof portableRecord>["receipts"] } },
  options: { suffix?: string; prepare?: (repo: string, settings: ReturnType<typeof trialAdoptionFixture>["configured"]) => void } = {}) {
  const suffix = options.suffix ?? "successor";
  const previousDefault = trialAdoptionDelivery(f), previous = collectAdoptionBindings(f.source, f.candidate);
  const configured = { ...f.configured, component_pin: ".vh-adlc/docs-drift-components/" + suffix + ".yaml",
    publication: { ...f.configured.publication, adoption_record: ".vh-adlc/docs-drift-adoptions/" + suffix + ".yaml" } };
  const component = { ...previous.component_pin.value, source_commit: sha256(Buffer.from(f.candidate + suffix)).slice(0, 40), source_release: "v1.1.0",
    plugin_version: "0.13.0", component_sha256: sha256(Buffer.from("Synthetic compatible component")) };
  git(f.source, "switch", "--detach", previousDefault);
  put(f.source, configured.component_pin, canonicalJSON(component).toString());
  put(f.source, ".vh-adlc/docs-drift.yaml", canonicalJSON(configured).toString());
  put(f.source, configured.execution.scheduled_workflow, canonicalJSON({ on: { schedule: [{ cron: "0 6 * * *" }], workflow_dispatch: null },
    permissions: configured.execution.permissions, jobs: { worker: { uses: "./" + configured.execution.worker_workflow,
      with: { component_pin: configured.component_pin, pr_draft: configured.publication.pr_state.advisory === "draft" },
      secrets: { COPILOT_GITHUB_TOKEN: "${{ secrets.COPILOT_GITHUB_TOKEN }}" } } } }).toString());
  options.prepare?.(f.source, configured);
  const candidate = commitAll(f.source); git(f.source, "switch", "main");
  const current = portableRecord({ repo: f.source, configured, candidate });
  for (const receipt of Object.values(current.receipts)) Object.assign(receipt, { evidence_kind: "test-only", fixture_id: f.manifest.fixture_id });
  const carried = ["hosted_advisory", "history_read", "quiescence", "copilot_entry", "claude_entry"];
  for (const name of carried) current.receipts[name] = structuredClone(f.record.receipts[name]!);
  const stable = sha256(Buffer.from("Synthetic accepted protocol result"));
  const predecessorHash = sha256(readGit(f.source, "show", previousDefault + ":" + f.configured.publication.adoption_record));
  const record = { ...current, fixture_id: f.manifest.fixture_id, predecessor: {
    schema_version: 1, evidence_kind: "test-only", fixture_id: f.manifest.fixture_id, route: "compatible",
    default_commit: previousDefault, record_path: f.configured.publication.adoption_record, record_sha256: predecessorHash,
    carry_receipts: carried, compatibility: { schema_version: 1, evidence_kind: "test-only", fixture_id: f.manifest.fixture_id,
      source_candidate: candidate, predecessor_adoption_sha256: predecessorHash, previous_component: previous.component_pin.value,
      next_component: component, previous_protected_sha256: previous.protected_sha256, classification: "contract-preserving",
      reviewer_model: configured.execution.entries.copilot.reviewer.model,
      artifact_sha256: sha256(Buffer.from("Synthetic compatibility review")), diff_sha256: sha256(Buffer.from("Synthetic complete diff")),
      dependencies_sha256: sha256(Buffer.from("Synthetic complete dependency set")),
      observations: { full_diff_reviewed: true, dependencies_complete: true, no_blocking_findings: true, no_should_fix_findings: true,
        contract_preserved: true, affected_regressions: true, installed_contract_checks: true },
      regressions: [{ id: "protocol-preservation", evidence_kind: "test-only", fixture_id: f.manifest.fixture_id, category: "preservation",
        previous_source: previous.component_pin.value.source_commit, next_source: component.source_commit,
        command_sha256: sha256(Buffer.from("Synthetic protocol check")), accepted_rule_sha256: sha256(Buffer.from("Synthetic unchanged rule")),
        expected_sha256: stable, before_sha256: stable, after_sha256: stable, before_result: "passed", after_result: "passed",
        artifact_sha256: sha256(Buffer.from("Synthetic regression capture")) }] } } };
  const delivered = trialAdoptionDelivery({ ...f, configured, candidate }, record);
  return { configured, candidate, record, delivered, previousDefault };
}
