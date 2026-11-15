/** Owned synthetic adoption sources and explicitly test-only receipt metadata. */
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { collectAdoptionBindings } from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { canonicalDigest, canonicalJSON, decodeUTF8, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore, readCommittedTree } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { TRIAL_CONTEXT_PATH } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { portableRecord, write, type AdoptionSourceFixture } from "./adoption-fixture";
import { commitAll, git, put } from "./repository-fixture";
import { syntheticTrialFixture } from "./trial-fixture";

export function trialAdoptionFixture(roots: string[], mapped = false) {
  const f = syntheticTrialFixture(roots, { bound_roles: true, ...(mapped ? { mapped_entry: "copilot" } : {}) });
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
  const account = { actor: "fixture-bot", actor_id: 20 };
  const record = portableRecord(source, mapped ? { hosted: account, copilot: account, claude: account } : undefined);
  for (const receipt of Object.values(record.receipts)) Object.assign(receipt, { evidence_kind: "test-only", fixture_id: f.manifest.fixture_id });
  const testRecord = { ...record, fixture_id: f.manifest.fixture_id };
  return { ...f, store, settings: configured, sourceCommit: candidate, contextCommit, candidate, configured, record: testRecord,
    boundary: { root: f.root, context_commit: contextCommit, runtime_directory: f.runtime } };
}

export function trialAdoptionDelivery(f: Pick<ReturnType<typeof trialAdoptionFixture>, "source" | "candidate" | "configured"> & { record: unknown }, record: unknown = f.record) {
  git(f.source, "switch", "--detach", f.candidate);
  put(f.source, f.configured.publication.adoption_record, canonicalJSON(record).toString());
  const delivered = commitAll(f.source);
  git(f.source, "switch", "main");
  return delivered;
}


type UpgradeSource = Pick<ReturnType<typeof trialAdoptionFixture>, "source" | "candidate" | "configured"> & {
  manifest: { fixture_id: string }; record: { receipts: ReturnType<typeof portableRecord>["receipts"]; entry_identities?: Parameters<typeof portableRecord>[1] };
};

export function compatibleTrialUpgrade(f: UpgradeSource,
  options: { suffix?: string; component?: ReturnType<typeof collectAdoptionBindings>["component_pin"]["value"]; prepare?: (repo: string, settings: ReturnType<typeof trialAdoptionFixture>["configured"]) => void } = {}) {
  const suffix = options.suffix ?? "successor";
  const previousDefault = trialAdoptionDelivery(f), previous = collectAdoptionBindings(f.source, f.candidate);
  const configured = { ...structuredClone(f.configured), component_pin: ".vh-adlc/docs-drift-components/" + suffix + ".yaml",
    publication: { ...f.configured.publication, adoption_record: ".vh-adlc/docs-drift-adoptions/" + suffix + ".yaml" } };
  const component = options.component ?? { ...previous.component_pin.value, source_commit: sha256(Buffer.from(f.candidate + suffix)).slice(0, 40), source_release: "v1.1.0",
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
  const current = portableRecord({ repo: f.source, configured, candidate }, f.record.entry_identities);
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


export type TrialUpgradeDefinition = {
  schema_version: number; kind: string; predecessor_adoption_sha256: string;
  candidate_component: ReturnType<typeof collectAdoptionBindings>["component_pin"]["value"];
  candidate_protected_sha256: string; classification: string; affected_entries: string[];
  component_entries?: string[];
  changed_rules: { id: string; surface: string; scenario: string; fixture_sha256: string; old_contract_sha256: string;
    new_contract_sha256: string; old_expected_sha256: string; new_expected_sha256: string }[];
};

export function trialUpgradeFixture(f: UpgradeSource, options: {
  surface?: string; change_definition?: (definition: TrialUpgradeDefinition) => void;
  component?: ReturnType<typeof collectAdoptionBindings>["component_pin"]["value"];
  prepare_candidate?: (repo: string, settings: ReturnType<typeof trialAdoptionFixture>["configured"]) => void;
} = {}) {
  const surface = options.surface ?? "assessment";
  const prototype = compatibleTrialUpgrade(f, { component: options.component, prepare: options.prepare_candidate }), prospective = collectAdoptionBindings(f.source, prototype.candidate);
  const predecessorHash = sha256(readGit(f.source, "show", prototype.previousDefault + ":" + f.configured.publication.adoption_record));
  const definition: TrialUpgradeDefinition = { schema_version: 1, kind: "docs-drift-upgrade-trial", predecessor_adoption_sha256: predecessorHash,
    candidate_component: prospective.component_pin.value, candidate_protected_sha256: prospective.protected_sha256,
    classification: "contract", affected_entries: ["hosted", "copilot", "claude"],
    changed_rules: [{ id: "changed-contract", surface, scenario: "Synthetic changed contract scenario",
      fixture_sha256: sha256(Buffer.from("Synthetic changed-rule fixture")), old_contract_sha256: sha256(Buffer.from("Synthetic old contract")),
      new_contract_sha256: sha256(Buffer.from("Synthetic new contract")), old_expected_sha256: sha256(Buffer.from("Synthetic old expected outcome")),
      new_expected_sha256: sha256(Buffer.from("Synthetic new expected outcome")) }] };
  options.change_definition?.(definition);
  const trial = { definition_path: ".vh-adlc/docs-drift-trials/upgrade.yaml", definition_sha256: canonicalDigest(definition) };
  git(f.source, "switch", "--detach", prototype.previousDefault);
  put(f.source, trial.definition_path, canonicalJSON(definition).toString());
  put(f.source, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured, trial }).toString());
  put(f.source, prototype.configured.component_pin, readGit(f.source, "show", prototype.candidate + ":" + prototype.configured.component_pin).toString());
  const previousDefault = commitAll(f.source);
  const configured = { ...prototype.configured, trial };
  put(f.source, ".vh-adlc/docs-drift.yaml", canonicalJSON(configured).toString());
  const entries = new Map(readCommittedTree(f.source, prototype.candidate).map(entry => [entry.path, entry]));
  const changed = decodeUTF8(readGit(f.source, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z",
    prototype.previousDefault, prototype.candidate, "--")).split("\0").filter(Boolean);
  for (const path of changed) {
    if (path === ".vh-adlc/docs-drift.yaml") continue;
    const entry = entries.get(path);
    if (!entry) rmSync(join(f.source, path), { force: true });
    else {
      if (entry.mode !== "100644" && entry.mode !== "100755") throw Error("unsupported synthetic candidate entry");
      write(f.source, path, entry.bytes); chmodSync(join(f.source, path), entry.mode === "100755" ? 0o755 : 0o644);
    }
  }
  const candidate = commitAll(f.source); git(f.source, "switch", "main");
  const fresh = portableRecord({ repo: f.source, configured, candidate }, f.record.entry_identities);
  for (const receipt of Object.values(fresh.receipts)) Object.assign(receipt, { evidence_kind: "test-only", fixture_id: f.manifest.fixture_id });
  const affected = definition.affected_entries;
  const carried = ["hosted_advisory", "history_read", "quiescence", "copilot_entry", "claude_entry"].filter(name => name === "quiescence"
    || (name === "hosted_advisory" || name === "history_read" ? !affected.includes("hosted")
      : name === "copilot_entry" ? !affected.includes("copilot") : !affected.includes("claude")));
  for (const name of carried) fresh.receipts[name] = structuredClone(f.record.receipts[name]!);
  const record = { ...fresh, fixture_id: f.manifest.fixture_id, predecessor: { schema_version: 1, evidence_kind: "test-only",
    fixture_id: f.manifest.fixture_id, route: "trial", default_commit: previousDefault, record_path: f.configured.publication.adoption_record,
    record_sha256: predecessorHash, carry_receipts: carried, trial: { schema_version: 1, evidence_kind: "test-only",
      fixture_id: f.manifest.fixture_id, definition_path: trial.definition_path, definition_sha256: trial.definition_sha256,
      source_candidate: candidate, predecessor_adoption_sha256: predecessorHash, reviewer_model: configured.execution.entries.copilot.reviewer.model,
      artifact_sha256: sha256(Buffer.from("Synthetic upgraded-trial artifact")),
      observations: { definition_reviewed: true, prospective_bindings_matched: true, affected_roles_exercised: true,
        complete_native_results: true, no_blocking_findings: true, no_should_fix_findings: true },
      cases: definition.changed_rules.map(rule => ({ id: rule.id, evidence_kind: "test-only", fixture_id: f.manifest.fixture_id, source_candidate: candidate,
        rule_sha256: canonicalDigest(rule), outcome_sha256: rule.new_expected_sha256,
        artifact_sha256: sha256(Buffer.from("Synthetic changed-rule observed artifact")), result: "passed",
        ...(["status", "attention", "history"].includes(rule.surface) ? { history_read: true, unchanged_carried: true, changed_new_attention: true } : {}) })) } } };
  if (definition.component_entries) {
    const selected = definition.component_entries;
    const preserved = ["hosted", "copilot", "claude"].filter(entry => !selected.includes(entry));
    const review = structuredClone(prototype.record.predecessor.compatibility);
    Object.assign(record.predecessor.trial, { component_review: { ...review, source_candidate: candidate, preserved_entries: preserved,
      regressions: preserved.map(entry => ({ ...review.regressions[0]!, id: entry + "-preservation", entry })) } });
  }
  const delivered = trialAdoptionDelivery({ ...f, configured, candidate, record });
  return { configured, candidate, previousDefault, definition, record, delivered };
}
