import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs";
import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { commitAll, git, put } from "./repository-fixture";
import { TRIAL_IDENTITY } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { type TrialUpgradeDefinition, compatibleTrialUpgrade, trialUpgradeFixture, trialAdoptionDelivery, trialAdoptionFixture } from "./adoption-trial-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("an owned synthetic context exercises adoption with explicitly test-only receipts", async () => {
  const f = trialAdoptionFixture(roots), delivered = trialAdoptionDelivery(f);
  expect(typeof adoption.createTrialAdoptionGate).toBe("function");
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  const result = gate.verify({ current_default: delivered });
  expect(result.evidence).toBe("test-only");
  expect(result.fixture_id).toBe(f.manifest.fixture_id);
  expect(result.source_candidate).toBe(f.candidate);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.source, current_default: delivered, identity: TRIAL_IDENTITY })).toThrow("object fields");
});


test.each(["top-fixture", "receipt-fixture", "observed-receipt"] as const)("synthetic adoption refuses mismatched %s metadata", async scenario => {
  const f = trialAdoptionFixture(roots), gate = await adoption.createTrialAdoptionGate(f.boundary);
  if (scenario === "top-fixture") f.record.fixture_id = "00000000-0000-0000-0000-000000000000";
  if (scenario === "receipt-fixture") Object.assign(f.record.receipts.hosted_advisory!, { fixture_id: "wrong-fixture" });
  if (scenario === "observed-receipt") f.record.receipts.hosted_advisory!.evidence_kind = "observed";
  const delivered = trialAdoptionDelivery(f);
  expect(() => gate.verify({ current_default: delivered })).toThrow(scenario === "top-fixture" ? "synthetic adoption fixture identity" : "test-only record receipt hosted_advisory");
});

test("removing outer fixture metadata cannot promote test-only receipts through production", async () => {
  const f = trialAdoptionFixture(roots), record = { ...f.record, receipts: Object.fromEntries(Object.entries(f.record.receipts).map(([name, value]) => [name, { ...value }])) };
  Reflect.deleteProperty(record, "fixture_id");
  const withContext = trialAdoptionDelivery(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.source, current_default: withContext, identity: TRIAL_IDENTITY })).toThrow("receipt hosted_advisory fields");
  for (const receipt of Object.values(record.receipts)) Reflect.deleteProperty(receipt, "fixture_id");
  const withoutContext = trialAdoptionDelivery(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.source, current_default: withoutContext, identity: TRIAL_IDENTITY })).toThrow("observed record receipt hosted_advisory");
});

test("synthetic adoption scope cannot select a real host or an unrelated default", async () => {
  const f = trialAdoptionFixture(roots), gate = await adoption.createTrialAdoptionGate(f.boundary);
  const earlier = git(f.source, "rev-list", "--max-parents=0", "HEAD");
  expect(() => gate.verify({ current_default: earlier })).toThrow("synthetic adoption default outside owned source");
  put(f.source, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured, hostname: "github.com" }).toString());
  const foreign = commitAll(f.source);
  expect(() => gate.verify({ current_default: foreign })).toThrow("synthetic adoption namespace");
});

test("a test-context request requires the complete owned fixture constructor", async () => {
  const f = trialAdoptionFixture(roots);
  await expect(adoption.createTrialAdoptionGate({ ...f.boundary, root: f.source })).rejects.toThrow("fixture paths differ from setup");
});

test("the installed synthetic driver verifies test-only adoption without a production selector", () => {
  const f = trialAdoptionFixture(roots), delivered = trialAdoptionDelivery(f);
  const child = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), "verify-adoption",
    "--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--adoption-default", delivered], { stdout: "pipe", stderr: "pipe", timeout: 30000 });
  expect(child.exitCode).toBe(0);
  const report = JSON.parse(child.stdout.toString()) as { outcome: string; evidence_kind: string; transport: string; data: { evidence: string; fixture_id: string; current_default: string } };
  expect(report.outcome).toBe("complete");
  expect(report.evidence_kind).toBe("test-only");
  expect(report.transport).toBe("collector");
  expect(report.data.current_default).toBe(delivered);
  expect(report.data).toMatchObject({ evidence: "test-only", fixture_id: f.manifest.fixture_id });
});


test("synthetic adoption rechecks owned inputs before reading a later default", async () => {
  const f = trialAdoptionFixture(roots), gate = await adoption.createTrialAdoptionGate(f.boundary), delivered = trialAdoptionDelivery(f);
  const outside = mkdtempSync(join(tmpdir(), "vh-adoption-moved-")); roots.push(outside);
  const moved = join(outside, "source"); renameSync(f.source, moved); symlinkSync(moved, f.source);
  expect(() => gate.verify({ current_default: delivered })).toThrow("foreign or linked fixture input");
});

test("synthetic adoption retains its constructor scope when the caller changes its options", async () => {
  const f = trialAdoptionFixture(roots), options = { ...f.boundary }, gate = await adoption.createTrialAdoptionGate(options);
  const delivered = trialAdoptionDelivery(f);
  options.root = f.source; options.context_commit = "main";
  const result = gate.verify({ current_default: delivered });
  expect(result.evidence).toBe("test-only");
  expect(result.fixture_id).toBe(f.manifest.fixture_id);
});


test("an explicit compatible successor preserves its recorded lineage as test-only fixture evidence", async () => {
  const f = trialAdoptionFixture(roots), successor = compatibleTrialUpgrade(f), gate = await adoption.createTrialAdoptionGate(f.boundary);
  const result = gate.verify({ current_default: successor.delivered });
  expect(result.evidence).toBe("test-only");
  expect(result.source_candidate).toBe(successor.candidate);
  expect(result.component_pin).toEqual(successor.record.predecessor.compatibility.next_component);
  expect(result.receipts).toMatchObject({ hosted_advisory: f.record.receipts.hosted_advisory });
});

const compatibilityRefusals: { name: string; change: (upgrade: ReturnType<typeof compatibleTrialUpgrade>) => void; reason: string }[] = [
  { name: "wrong predecessor digest", change: u => { u.record.predecessor.record_sha256 = "0".repeat(64); }, reason: "predecessor adoption binding" },
  { name: "missing carried receipt", change: u => { u.record.predecessor.carry_receipts.pop(); }, reason: "carried receipt inventory" },
  { name: "carried fresh install", change: u => { u.record.predecessor.carry_receipts.push("codex_install"); }, reason: "carried receipt inventory" },
  { name: "rewritten carried observation", change: u => { u.record.receipts.hosted_advisory!.artifact_sha256 = "0".repeat(64); }, reason: "carried receipt changed" },
  { name: "stale install source", change: u => { u.record.receipts.codex_install!.source_commit = "0".repeat(40); }, reason: "recorded source target codex_install" },
  { name: "wrong predecessor fixture", change: u => { u.record.predecessor.fixture_id = "00000000-0000-0000-0000-000000000000"; }, reason: "predecessor evidence kind or fixture" },
  { name: "mixed compatibility kind", change: u => { u.record.predecessor.compatibility.evidence_kind = "observed"; }, reason: "compatibility receipt bindings" },
  { name: "wrong compatibility fixture", change: u => { u.record.predecessor.compatibility.fixture_id = "00000000-0000-0000-0000-000000000000"; }, reason: "compatibility receipt bindings" },
  { name: "wrong compatibility candidate", change: u => { u.record.predecessor.compatibility.source_candidate = "0".repeat(40); }, reason: "compatibility receipt bindings" },
  { name: "missing dependency digest", change: u => { u.record.predecessor.compatibility.dependencies_sha256 = ""; }, reason: "record digest" },
  { name: "incomplete dependency review", change: u => { u.record.predecessor.compatibility.observations.dependencies_complete = false; }, reason: "incomplete compatibility observations" },
  { name: "unknown contract", change: u => { u.record.predecessor.compatibility.classification = "unknown"; }, reason: "compatibility classification" },
  { name: "missing regressions", change: u => { u.record.predecessor.compatibility.regressions = []; }, reason: "regressions required" },
  { name: "mixed regression kind", change: u => { u.record.predecessor.compatibility.regressions[0]!.evidence_kind = "observed"; }, reason: "regression bindings" },
  { name: "wrong regression fixture", change: u => { u.record.predecessor.compatibility.regressions[0]!.fixture_id = "00000000-0000-0000-0000-000000000000"; }, reason: "regression bindings" },
  { name: "wrong regression source", change: u => { u.record.predecessor.compatibility.regressions[0]!.next_source = "0".repeat(40); }, reason: "regression bindings" },
  { name: "duplicate regression", change: u => { u.record.predecessor.compatibility.regressions.push(structuredClone(u.record.predecessor.compatibility.regressions[0]!)); }, reason: "regression bindings" },
  { name: "failed preservation baseline", change: u => { u.record.predecessor.compatibility.regressions[0]!.before_result = "failed"; }, reason: "preservation regression" },
  { name: "changed expected behavior", change: u => { u.record.predecessor.compatibility.regressions[0]!.after_sha256 = "0".repeat(64); }, reason: "after result" },
  { name: "restoration without failing baseline", change: u => { u.record.predecessor.compatibility.classification = "contract-restoring";
      u.record.predecessor.compatibility.regressions[0]!.category = "restoration"; }, reason: "restoration regression" },
  { name: "restoration without restoration case", change: u => { u.record.predecessor.compatibility.classification = "contract-restoring"; }, reason: "restoration regression required" },
  { name: "trial route without required metadata", change: u => { u.record.predecessor.route = "trial"; }, reason: "successor predecessor fields" },
];

test.each(compatibilityRefusals)("compatible successors refuse $name", async ({ change, reason }) => {
  const f = trialAdoptionFixture(roots), successor = compatibleTrialUpgrade(f), gate = await adoption.createTrialAdoptionGate(f.boundary);
  change(successor);
  const delivered = trialAdoptionDelivery({ ...f, configured: successor.configured, candidate: successor.candidate }, successor.record);
  expect(() => gate.verify({ current_default: delivered })).toThrow(reason);
});

test("a compatible contract restoration binds an old-fail new-pass unchanged-rule regression", async () => {
  const f = trialAdoptionFixture(roots), successor = compatibleTrialUpgrade(f), gate = await adoption.createTrialAdoptionGate(f.boundary);
  const compatibility = successor.record.predecessor.compatibility;
  compatibility.classification = "contract-restoring";
  Object.assign(compatibility.regressions[0]!, { category: "restoration", before_result: "failed", before_sha256: "0".repeat(64) });
  const delivered = trialAdoptionDelivery({ ...f, configured: successor.configured, candidate: successor.candidate }, successor.record);
  expect(gate.verify({ current_default: delivered }).evidence).toBe("test-only");
});

test("a successor cannot enter production by removing only its outer fixture metadata", () => {
  const f = trialAdoptionFixture(roots), successor = compatibleTrialUpgrade(f);
  Reflect.deleteProperty(successor.record, "fixture_id");
  const delivered = trialAdoptionDelivery({ ...f, configured: successor.configured, candidate: successor.candidate }, successor.record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.source, current_default: delivered, identity: TRIAL_IDENTITY })).toThrow("successor predecessor fields");
});


test.each(["record", "pin"] as const)("compatible successors preserve every ancestral %s", async kind => {
  const f = trialAdoptionFixture(roots), first = compatibleTrialUpgrade(f);
  const second = compatibleTrialUpgrade({ ...f, configured: first.configured, candidate: first.candidate, record: first.record },
    { suffix: "second", prepare(repo) { put(repo, kind === "pin" ? f.configured.component_pin : f.configured.publication.adoption_record, "Changed ancestral input"); } });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: second.delivered })).toThrow("immutable predecessor input changed");
});


test("a multi-generation compatible chain retains first-adoption observations honestly", async () => {
  const f = trialAdoptionFixture(roots), first = compatibleTrialUpgrade(f);
  const second = compatibleTrialUpgrade({ ...f, configured: first.configured, candidate: first.candidate, record: first.record }, { suffix: "second" });
  const gate = await adoption.createTrialAdoptionGate(f.boundary), result = gate.verify({ current_default: second.delivered });
  expect(result.source_candidate).toBe(second.candidate);
  expect(result.receipts).toMatchObject({ hosted_advisory: f.record.receipts.hosted_advisory });
  expect(result.component_pin).toEqual(second.record.predecessor.compatibility.next_component);
});

test.each(["launcher", "worker_workflow", "claude_command"] as const)("compatible evidence cannot waive a protected %s change", async selected => {
  const f = trialAdoptionFixture(roots), successor = compatibleTrialUpgrade(f, { prepare(repo, settings) {
    const path = selected === "launcher" ? settings.runtime_loader.launcher : settings.execution[selected];
    put(repo, path, "Changed protected execution contract");
  } });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: successor.delivered })).toThrow("compatible upgrade changes execution bindings");
});


test("the installed synthetic entry verifies a compatible successor as test-only evidence", () => {
  const f = trialAdoptionFixture(roots), successor = compatibleTrialUpgrade(f);
  const child = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), "verify-adoption",
    "--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--adoption-default", successor.delivered],
    { stdout: "pipe", stderr: "pipe", timeout: 30000 });
  expect(child.exitCode).toBe(0);
  const output: unknown = JSON.parse(child.stdout.toString());
  expect(output).toMatchObject({ outcome: "complete", transport: "collector", evidence_kind: "test-only",
    data: { source_candidate: successor.candidate, evidence: "test-only", fixture_id: f.manifest.fixture_id } });
});


test("selected component pins stay immutable throughout later default history", async () => {
  const f = trialAdoptionFixture(roots), delivered = trialAdoptionDelivery(f), gate = await adoption.createTrialAdoptionGate(f.boundary);
  const original = readGit(f.source, "show", f.candidate + ":" + f.configured.component_pin).toString();
  git(f.source, "switch", "--detach", delivered);
  put(f.source, f.configured.component_pin, "Changed selected pin"); commitAll(f.source);
  put(f.source, f.configured.component_pin, original); const restored = commitAll(f.source);
  git(f.source, "switch", "main");
  expect(() => gate.verify({ current_default: restored })).toThrow("immutable predecessor input changed");
});


test("a contract-changing upgrade binds its definition and discriminating synthetic observations", async () => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f), gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(gate.verify({ current_default: upgrade.previousDefault }).component_pin).toEqual(f.record.protected_manifest.component.value);
  const result = gate.verify({ current_default: upgrade.delivered });
  expect(result.evidence).toBe("test-only");
  expect(result.source_candidate).toBe(upgrade.candidate);
  expect(result.receipts).toMatchObject({ quiescence: f.record.receipts.quiescence });
});


const trialDefinitionRefusals: { name: string; change: (definition: TrialUpgradeDefinition) => void; reason: string }[] = [
  { name: "vacuous changed-rule coverage", change: d => { d.changed_rules = []; }, reason: "changed rule coverage required" },
  { name: "identical old and new outcome", change: d => { d.changed_rules[0]!.old_expected_sha256 = d.changed_rules[0]!.new_expected_sha256; }, reason: "does not discriminate" },
  { name: "identical old and new contract", change: d => { d.changed_rules[0]!.old_contract_sha256 = d.changed_rules[0]!.new_contract_sha256; }, reason: "does not discriminate" },
  { name: "missing fixture digest", change: d => { d.changed_rules[0]!.fixture_sha256 = ""; }, reason: "record digest" },
  { name: "duplicate changed rule", change: d => { d.changed_rules.push(structuredClone(d.changed_rules[0]!)); }, reason: "changed rule identity" },
  { name: "omitted affected surface", change: d => { d.affected_entries.pop(); }, reason: "affected surface inventory" },
  { name: "component change called execution-only", change: d => { d.classification = "execution"; }, reason: "component contract coverage required" },
];

test.each(trialDefinitionRefusals)("trial successors refuse $name", async ({ change, reason }) => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, { change_definition: change });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: upgrade.delivered })).toThrow(reason);
});

test.each(["status", "attention", "history"])("a changed %s trial requires carried and new-attention history observations", async surface => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, { surface }), gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(gate.verify({ current_default: upgrade.delivered }).evidence).toBe("test-only");
  const scenario = upgrade.record.predecessor.trial.cases[0]!;
  scenario.unchanged_carried = false;
  const changed = trialAdoptionDelivery({ ...f, ...upgrade }, upgrade.record);
  expect(() => gate.verify({ current_default: changed })).toThrow("changed history observations required");
});

const trialReceiptRefusals: { name: string; change: (upgrade: ReturnType<typeof trialUpgradeFixture>) => void; reason: string }[] = [
  { name: "missing changed-rule observation", change: u => { u.record.predecessor.trial.cases = []; }, reason: "case inventory" },
  { name: "wrong definition digest", change: u => { u.record.predecessor.trial.definition_sha256 = "0".repeat(64); }, reason: "trial receipt bindings" },
  { name: "mixed trial evidence", change: u => { u.record.predecessor.trial.evidence_kind = "observed"; }, reason: "trial receipt bindings" },
  { name: "mixed scenario evidence", change: u => { u.record.predecessor.trial.cases[0]!.evidence_kind = "observed"; }, reason: "observation binding" },
  { name: "old expected outcome", change: u => { u.record.predecessor.trial.cases[0]!.outcome_sha256 = u.definition.changed_rules[0]!.old_expected_sha256; }, reason: "observation binding" },
  { name: "skipped scenario", change: u => { u.record.predecessor.trial.cases[0]!.result = "skipped"; }, reason: "observation binding" },
  { name: "unexercised changed roles", change: u => { u.record.predecessor.trial.observations.affected_roles_exercised = false; }, reason: "incomplete upgrade trial observations" },
  { name: "carried changed hosted entry", change: u => { u.record.predecessor.carry_receipts.push("hosted_advisory"); }, reason: "trial carried receipt inventory" },
];

test.each(trialReceiptRefusals)("trial successors refuse $name", async ({ change, reason }) => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f), gate = await adoption.createTrialAdoptionGate(f.boundary);
  change(upgrade);
  const changed = trialAdoptionDelivery({ ...f, ...upgrade }, upgrade.record);
  expect(() => gate.verify({ current_default: changed })).toThrow(reason);
});


test("a successor cannot skip an intervening adoption to hide its deleted record", async () => {
  const f = trialAdoptionFixture(roots), first = compatibleTrialUpgrade(f);
  const second = compatibleTrialUpgrade({ ...f, configured: first.configured, candidate: first.candidate, record: first.record },
    { suffix: "second", prepare(repo) { rmSync(join(repo, first.configured.publication.adoption_record)); } });
  const link = second.record.predecessor, original = first.record.predecessor;
  link.default_commit = original.default_commit; link.record_path = original.record_path; link.record_sha256 = original.record_sha256;
  Object.assign(link.compatibility, { predecessor_adoption_sha256: original.record_sha256,
    previous_component: original.compatibility.previous_component, previous_protected_sha256: original.compatibility.previous_protected_sha256 });
  link.compatibility.regressions[0]!.previous_source = original.compatibility.previous_component.source_commit;
  const delivered = trialAdoptionDelivery({ ...f, ...second }, second.record), gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: delivered })).toThrow("intervening adopted selection");
});


test("protected report-policy changes require history-case coverage even with fresh entry receipts", async () => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, {
    component: f.record.protected_manifest.component.value,
    prepare_candidate(repo, settings) {
      settings.reports.max_age_seconds -= 1;
      put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
    },
    change_definition(definition) { definition.classification = "execution"; definition.changed_rules = []; },
  });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: upgrade.delivered })).toThrow("changed history coverage required");
});

test("an interactive-only client trial carries unchanged hosted and Claude receipts", async () => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, {
    component: f.record.protected_manifest.component.value,
    prepare_candidate(repo, settings) {
      Object.assign(settings.clients, { "copilot-new": { ...settings.clients["copilot-linux"], version: "fixture-2.0.0" } });
      const old = settings.execution.entries.copilot;
      settings.execution.entries.copilot = { ...old, worker: { ...old.worker, client: "copilot-new" }, reviewer: { ...old.reviewer, client: "copilot-new" } };
      put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
    },
    change_definition(definition) { definition.classification = "execution"; definition.affected_entries = ["copilot"]; definition.changed_rules = []; },
  });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(gate.verify({ current_default: upgrade.previousDefault }).component_pin).toEqual(f.record.protected_manifest.component.value);
  const result = gate.verify({ current_default: upgrade.delivered });
  expect(result.receipts).toMatchObject({ hosted_advisory: f.record.receipts.hosted_advisory, claude_entry: f.record.receipts.claude_entry });
  expect(result.source_candidate).toBe(upgrade.candidate);
});


test.each(["record", "pin", "record-restored", "pin-restored"] as const)("rollback preserves later %s evidence after selecting an earlier runtime", async scenario => {
  const f = trialAdoptionFixture(roots), successor = compatibleTrialUpgrade(f), gate = await adoption.createTrialAdoptionGate(f.boundary);
  git(f.source, "switch", "--detach", successor.delivered);
  put(f.source, ".vh-adlc/docs-drift.yaml", canonicalJSON(f.configured).toString());
  put(f.source, f.configured.execution.scheduled_workflow, readGit(f.source, "show", f.candidate + ":" + f.configured.execution.scheduled_workflow).toString());
  const rollback = commitAll(f.source);
  expect(gate.verify({ current_default: rollback }).component_pin).toEqual(f.record.protected_manifest.component.value);
  const path = scenario.startsWith("record") ? successor.configured.publication.adoption_record : successor.configured.component_pin;
  const original = readGit(f.source, "show", rollback + ":" + path).toString();
  if (scenario.endsWith("restored")) {
    put(f.source, path, "Changed after rollback"); commitAll(f.source); put(f.source, path, original);
  } else rmSync(join(f.source, path));
  const changed = commitAll(f.source); git(f.source, "switch", "main");
  expect(() => gate.verify({ current_default: changed })).toThrow(scenario === "record" ? "historical adoption input changed" : "immutable predecessor input changed");
});

test.each(["uncertain", "scanner", "publication", "procedure", "instructions"] as const)("trial successors require coverage for %s changes despite execution labels", async scenario => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, {
    component: scenario === "uncertain" ? undefined : f.record.protected_manifest.component.value,
    prepare_candidate(repo, settings) {
      if (scenario === "scanner") settings.scanner.argv.push("--alternate");
      if (scenario === "publication") settings.publication.merge_methods = ["merge"];
      if (scenario === "procedure") put(repo, settings.project_procedure, "Synthetic changed project policy");
      if (scenario === "instructions") put(repo, "AGENTS.md", "Synthetic changed instructions");
      put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
    },
    change_definition(definition) { definition.classification = scenario === "uncertain" ? "uncertain" : "execution"; definition.changed_rules = []; },
  });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: upgrade.delivered })).toThrow("changed rule coverage required");
});

test("a compatible successor preserves an unrelated merged branch from an older adoption", async () => {
  const f = trialAdoptionFixture(roots), first = compatibleTrialUpgrade(f);
  git(f.source, "switch", "--detach", first.record.predecessor.default_commit);
  put(f.source, "docs/older-branch.md", "Synthetic unrelated work\n");
  const olderBranch = commitAll(f.source); git(f.source, "switch", "main");
  const second = compatibleTrialUpgrade({ ...f, configured: first.configured, candidate: first.candidate, record: first.record }, {
    suffix: "merged", prepare(repo) {
      commitAll(repo);
      git(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "merge", "--no-ff", "--no-edit", olderBranch);
      put(repo, "docs/after-merge.md", "Synthetic candidate work\n");
    },
  });
  const gate = await adoption.createTrialAdoptionGate(f.boundary), result = gate.verify({ current_default: second.delivered });
  expect(result.source_candidate).toBe(second.candidate);
  expect(readGit(f.source, "show", second.candidate + ":docs/older-branch.md").toString()).toBe("Synthetic unrelated work\n");
});


test("uncertain trial-route candidates remain usable when their mapped scenarios pass", async () => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, { change_definition(definition) { definition.classification = "uncertain"; } });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(gate.verify({ current_default: upgrade.previousDefault }).component_pin).toEqual(f.record.protected_manifest.component.value);
  expect(gate.verify({ current_default: upgrade.delivered }).source_candidate).toBe(upgrade.candidate);
});

function componentScopeFixture(mixed = false, componentEntries = ["claude"], execution = true) {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, {
    prepare_candidate: mixed ? (repo, settings) => {
      Object.assign(settings.clients, { "copilot-new": { ...settings.clients["copilot-linux"], version: "fixture-2.0.0" } });
      const old = settings.execution.entries.copilot;
      settings.execution.entries.copilot = { ...old, worker: { ...old.worker, client: "copilot-new" }, reviewer: { ...old.reviewer, client: "copilot-new" } };
      put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
    } : undefined,
    change_definition(definition) {
      definition.component_entries = componentEntries;
      definition.affected_entries = mixed ? ["copilot", ...componentEntries] : componentEntries;
      if (execution) { definition.classification = "execution"; definition.changed_rules = []; }
    },
  });
  return { f, upgrade };
}

test.each([{ name: "component-only", mixed: false }, { name: "mixed-client", mixed: true }])("reviewed component influence carries only unaffected entries for $name", async ({ mixed }) => {
  const { f, upgrade } = componentScopeFixture(mixed), gate = await adoption.createTrialAdoptionGate(f.boundary);
  const result = gate.verify({ current_default: upgrade.delivered });
  expect(result.receipts).toMatchObject({ hosted_advisory: f.record.receipts.hosted_advisory });
  expect(result.source_candidate).toBe(upgrade.candidate);
});

test.each(["assessment", "scan", "status", "attention", "history"])("changed %s rules cannot carry hosted evidence through a narrow component scope", async surface => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, { surface, change_definition(definition) {
    definition.component_entries = ["claude"]; definition.affected_entries = ["claude"];
  } });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: upgrade.delivered })).toThrow("component affected entry scope");
});

test("an empty component scope cannot narrow a mixed client upgrade", async () => {
  const { f, upgrade } = componentScopeFixture(true, [], true), gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: upgrade.delivered })).toThrow("component affected entry scope");
});

test.each(["missing-review", "wrong-source", "missing-entry", "test-kind", "failed-check"] as const)("component scope refuses %s", async scenario => {
  const { f, upgrade } = componentScopeFixture(), trial = upgrade.record.predecessor.trial;
  const review = Reflect.get(trial, "component_review");
  if (scenario === "missing-review") Reflect.deleteProperty(trial, "component_review");
  if (scenario === "wrong-source") review.source_candidate = f.candidate;
  if (scenario === "missing-entry") review.regressions.pop();
  if (scenario === "test-kind") review.evidence_kind = "observed";
  if (scenario === "failed-check") review.observations.installed_contract_checks = false;
  const delivered = trialAdoptionDelivery({ ...f, configured: upgrade.configured, candidate: upgrade.candidate, record: upgrade.record });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  const reason = scenario === "missing-review" ? "upgrade trial receipt fields"
    : scenario === "missing-entry" ? "component preservation regression coverage"
    : scenario === "failed-check" ? "incomplete compatibility observations" : "compatibility receipt bindings";
  expect(() => gate.verify({ current_default: delivered })).toThrow(reason);
});

test.each(["uncertain", "duplicate", "unknown", "unordered"] as const)("component mapping refuses %s scope", async scenario => {
  const f = trialAdoptionFixture(roots), upgrade = trialUpgradeFixture(f, { change_definition(definition) {
    definition.classification = "execution"; definition.changed_rules = [];
    definition.component_entries = scenario === "duplicate" ? ["claude", "claude"]
      : scenario === "unknown" ? ["unknown"] : scenario === "unordered" ? ["claude", "copilot"] : ["claude"];
    definition.affected_entries = ["claude"];
    if (scenario === "uncertain") definition.classification = "uncertain";
  } });
  const gate = await adoption.createTrialAdoptionGate(f.boundary);
  expect(() => gate.verify({ current_default: upgrade.delivered })).toThrow("component affected entry scope");
});
