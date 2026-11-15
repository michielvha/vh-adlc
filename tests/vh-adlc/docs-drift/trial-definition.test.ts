import { afterAll, expect, test } from "bun:test";
import { chmodSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { commitTrialDefinition, fullDefinitionUpgradeFixture, trialDefinitionFixture } from "./trial-definition-fixture";
import { commit, runtimeIdentity, write } from "./adoption-fixture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { settingsFixture } from "./settings-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("history receipts name the actual dispatch producer and separate read-check workflow", () => {
  const f = fullDefinitionUpgradeFixture(roots), receipt = f.record.receipts.history_read!;
  Object.assign(receipt, { producer_workflow_id: f.definition.history.producer_workflow_id,
    producer_workflow_path: f.definition.callers.trial.path, reader_workflow_id: f.definition.history.reader_workflow_id,
    reader_workflow_path: f.definition.history.reader.path });
  readGit(f.repo, "switch", "--detach", f.candidate);
  write(f.repo, f.candidate_settings.publication.adoption_record, canonicalJSON(f.record));
  const delivered = commit(f.repo, "synthetic honest read-check receipt");
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivered, identity: runtimeIdentity }).source_candidate).toBe(f.candidate);
});

test.each(["same-ids", "scheduled-id", "scheduled-path", "active-caller", "credential-step"] as const)("trial setup refuses %s history or workflow overlap", scenario => {
  const f = trialDefinitionFixture(roots);
  if (scenario === "same-ids") f.definition.history.reader_workflow_id = f.definition.history.producer_workflow_id;
  if (scenario === "scheduled-id") f.definition.history.producer_workflow_id = f.configured.reports.workflow_id;
  if (scenario === "scheduled-path") {
    f.candidate_settings.execution.scheduled_workflow = ".github/workflows/another-schedule.yml";
    f.candidate_settings.reports.workflow_path = f.candidate_settings.execution.scheduled_workflow;
    write(f.repo, f.definition.candidate_settings.path, canonicalJSON(f.candidate_settings));
    f.definition.candidate_settings.sha256 = sha256(canonicalJSON(f.candidate_settings));
  }
  if (scenario === "active-caller") {
    const bytes = readGit(f.repo, "show", f.staged + ":" + f.definition.callers.trial.path);
    f.definition.callers.trial = { path: f.configured.execution.scheduled_workflow, sha256: sha256(bytes) };
    write(f.repo, f.definition.callers.trial.path, bytes);
  }
  if (scenario === "credential-step") {
    const workflow = { on: { workflow_dispatch: null }, permissions: { actions: "read", contents: "read" },
      jobs: { read: { "runs-on": "ubuntu-latest", steps: [{ run: "bun report-history.ts --trial-read-check", env: { COPILOT_GITHUB_TOKEN: "${{ secrets.COPILOT_GITHUB_TOKEN }}" } }] } } };
    write(f.repo, f.definition.history.reader.path, canonicalJSON(workflow));
    f.definition.history.reader.sha256 = sha256(canonicalJSON(workflow));
  }
  const current = commitTrialDefinition(f);
  const reason = scenario === "same-ids" || scenario === "scheduled-id" ? "history workflow identities"
    : scenario === "scheduled-path" ? "existing scheduled caller" : scenario === "active-caller" ? "active protected input" : "history read-only invocation";
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: current })).toThrow(reason);
});

test.each(["producer_workflow_id", "producer_workflow_path", "reader_workflow_id", "reader_workflow_path"] as const)("full trial history refuses a mismatched %s receipt", field => {
  const f = fullDefinitionUpgradeFixture(roots), receipt = f.record.receipts.history_read!;
  Object.assign(receipt, { [field]: field.endsWith("_id") ? 999 : ".github/workflows/unrelated.yml" });
  readGit(f.repo, "switch", "--detach", f.candidate);
  write(f.repo, f.candidate_settings.publication.adoption_record, canonicalJSON(f.record));
  const delivered = commit(f.repo, "synthetic mismatched history receipt");
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivered, identity: runtimeIdentity })).toThrow("history producer/reader workflow");
});

test("upgrade setup retains the approved gate and refuses reusing its active worker", () => {
  const f = fullDefinitionUpgradeFixture(roots);
  readGit(f.repo, "switch", "--detach", f.policySource);
  f.candidate_settings.execution.worker_workflow = f.configured.execution.worker_workflow;
  write(f.repo, f.definition.candidate_settings.path, canonicalJSON(f.candidate_settings));
  f.definition.candidate_settings.sha256 = sha256(canonicalJSON(f.candidate_settings));
  f.definition.worker = { path: f.configured.execution.worker_workflow,
    sha256: sha256(readGit(f.repo, "show", f.policySource + ":" + f.configured.execution.worker_workflow)) };
  f.trial.definition_sha256 = sha256(canonicalJSON(f.definition));
  write(f.repo, f.trial.definition_path, canonicalJSON(f.definition));
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured, trial: f.trial }));
  const current = commit(f.repo, "synthetic invalid dormant worker selection");
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity }).evidence).toBe("owner-attestation");
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: current })).toThrow("distinct candidate worker required");
});

test("a current-default trial binds its candidate, callers and synthetic input namespace", () => {
  const f = trialDefinitionFixture(roots);
  expect(typeof adoption.collectTrialBindings).toBe("function");
  const result = adoption.collectTrialBindings({ repo: f.repo, current_default: f.staged });
  expect(result.source_commit).toBe(f.staged);
  expect(result.candidate.protected_sha256).toBe(f.bindings.protected_sha256);
  expect(result.definition_sha256).toBe(f.trial.definition_sha256);
  expect(result.authority).toBe("none");
});

const refusals: { name: string; change: (f: ReturnType<typeof trialDefinitionFixture>) => void; reason: string }[] = [
  { name: "unknown fields", change: f => { Object.assign(f.definition, { production_grant: true }); }, reason: "fields" },
  { name: "foreign consumer", change: f => { f.definition.identity.repository = "other/repo"; }, reason: "consumer identity" },
  { name: "invalid native ID", change: f => { f.definition.identity.actor_id = 0; }, reason: "identity number" },
  { name: "changed candidate bytes", change: f => { f.definition.candidate_settings.sha256 = "0".repeat(64); }, reason: "committed blob" },
  { name: "registered prospective cron", change: f => { f.definition.callers.prospective = { ...f.definition.callers.trial }; }, reason: "dormant prospective caller" },
  { name: "production branch", change: f => { f.definition.namespace.branch_prefix = f.configured.publication.branch_prefix; }, reason: "overlaps production" },
  { name: "production lease", change: f => { f.definition.namespace.lease_ref = f.configured.publication.lease_ref; }, reason: "overlaps production" },
  { name: "consumer document output", change: f => { f.definition.namespace.output_root = "docs/trial"; }, reason: "synthetic namespace" },
  { name: "workflow output", change: f => { f.definition.namespace.output_root = ".github"; }, reason: "output overlaps bound inputs" },
  { name: "substituted copied scanner", change: f => {
      f.manifest.files[1]!.source = f.manifest.files[0]!.source; f.manifest.files[1]!.sha256 = f.manifest.files[0]!.sha256;
    }, reason: "fixed fixture layout" },
  { name: "duplicate fixture target", change: f => { f.manifest.files.push({ ...f.manifest.files[0]! }); }, reason: "copy scope" },
  { name: "duplicated expected case", change: f => { f.definition.expected.cases.push({ ...f.definition.expected.cases[0]! }); }, reason: "case identity" },
  { name: "wrong production draft state", change: f => { f.definition.callers.production_pr_draft = true; }, reason: "draft policy" },
  { name: "mismatched protected contract", change: f => { f.definition.prospective_protected_sha256 = "0".repeat(64); }, reason: "prospective trial bindings changed" },
];

test.each(refusals)("trial setup refuses $name", ({ change, reason }) => {
  const f = trialDefinitionFixture(roots); change(f);
  const current = commitTrialDefinition(f);
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: current })).toThrow(reason);
});

test("trial setup compares numeric native identity while accepting native name casing", () => {
  const f = trialDefinitionFixture(roots);
  expect(adoption.collectTrialBindings({ repo: f.repo, current_default: f.staged,
    identity: { ...runtimeIdentity, repository: "Fixture/Docs", actor: "Fixture-Bot" } }).authority).toBe("none");
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: f.staged,
    identity: { ...runtimeIdentity, actor_id: 99 } })).toThrow("current native trial identity");
});

test("trial setup preserves an executable scanner's committed mode", () => {
  const f = trialDefinitionFixture(roots);
  chmodSync(join(f.repo, f.configured.scanner.script), 0o755); f.manifest.files[1]!.mode = "100755";
  const current = commitTrialDefinition(f);
  expect(adoption.collectTrialBindings({ repo: f.repo, current_default: current }).authority).toBe("none");
});

test.each(["current", "different-candidate"] as const)("staged signal checks use the committed %s trial target", scenario => {
  const client = { ...settingsFixture().clients["copilot-linux"], version: scenario === "current" ? "fixture-1.0.0" : "fixture-2.0.0" };
  const f = trialDefinitionFixture(roots, { candidate_client: client }), selected = f.bindings.component_pin.value;
  write(f.repo, ".vh-adlc/docs-drift-upgrade-signal.yaml", canonicalJSON({ schema_version: 1,
    source_repository: selected.source_repository, source_commit: selected.source_commit, source_release: selected.source_release }));
  write(f.repo, ".vh-adlc/docs-drift-client-upgrade-signals.yaml", canonicalJSON({ schema_version: 1,
    clients: { "copilot-linux": { provider: "copilot", package: "@github/copilot", version: "fixture-1.0.0", platform: "linux-x64" } } }));
  const current = commit(f.repo, "synthetic trial-target upgrade signals"), before = captureRepositoryState(f.repo);
  expect(adoption.checkUpgradeSignals({ repo: f.repo, source: current })).toMatchObject({ target: "candidate-trial",
    status: scenario === "current" ? "signal-match" : "signal-mismatch", matches: scenario === "current" });
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity })).toThrow("consumer is not adopted");
});

test.each(["extra-job-permission", "different-secret", "missing-permissions"] as const)("agreeing trial/prospective callers still refuse %s", caller => {
  const f = trialDefinitionFixture(roots, { caller });
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: f.staged })).toThrow("configured caller");
});

test("trial callers can bind their exact permissions at job level", () => {
  const f = trialDefinitionFixture(roots, { caller: "job-only-permissions" });
  expect(adoption.collectTrialBindings({ repo: f.repo, current_default: f.staged }).authority).toBe("none");
});

test("a job-level override cannot give the read-only history helper Actions write access", () => {
  const f = trialDefinitionFixture(roots, { history_job_write: true });
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: f.staged })).toThrow("history read permissions");
});

test("candidate worker setup cannot introduce a scheduled trigger", () => {
  const f = trialDefinitionFixture(roots, { worker_cron: true });
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: f.staged })).toThrow("fields");
});

test("a successor consumes its full trial definition while preserving the earlier approved runtime", () => {
  const f = fullDefinitionUpgradeFixture(roots);
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: f.policySource, identity: runtimeIdentity }).component_pin)
    .toEqual(f.bindings.component_pin.value);
  const result = adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: f.delivery, identity: runtimeIdentity });
  expect(result.source_candidate).toBe(f.candidate);
  expect(result.evidence).toBe("owner-attestation");
});

test.each(["mapped", "unmapped"] as const)("full trial definitions enforce %s changed-rule expectations", changed_rule => {
  const f = fullDefinitionUpgradeFixture(roots, { changed_rule });
  if (changed_rule === "mapped") expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: f.delivery, identity: runtimeIdentity }).source_candidate).toBe(f.candidate);
  else expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: f.delivery, identity: runtimeIdentity }))
    .toThrow("changed rule missing from full trial expectations");
});

test("an empty unknown field cannot pass the empty dispatch-input schema", () => {
  const f = trialDefinitionFixture(roots), workflow = { on: { workflow_dispatch: { "": true } },
    permissions: { actions: "read", contents: "read" },
    jobs: { read: { "runs-on": "ubuntu-latest", steps: [{ run: "printf 'Synthetic read fixture'" }] } } };
  write(f.repo, f.definition.history.reader.path, canonicalJSON(workflow));
  f.definition.history.reader.sha256 = sha256(canonicalJSON(workflow));
  const current = commitTrialDefinition(f);
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: current })).toThrow("fields");
});

test.each(["missing", "tampered"] as const)("trial setup refuses a %s bundle without repairing it", scenario => {
  const f = trialDefinitionFixture(roots), path = f.definition.fixture.bundle.path;
  if (scenario === "missing") rmSync(join(f.repo, path));
  else write(f.repo, path, "Changed synthetic bundle");
  const current = commit(f.repo, "synthetic unavailable trial bundle"), before = captureRepositoryState(f.repo);
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: current })).toThrow("committed blob " + path);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(existsSync(join(f.repo, path))).toBe(scenario === "tampered");
});

test("a missing dormant trial bundle leaves the earlier approved runtime usable", () => {
  const f = fullDefinitionUpgradeFixture(roots);
  readGit(f.repo, "switch", "--detach", f.policySource);
  rmSync(join(f.repo, f.definition.fixture.bundle.path));
  const current = commit(f.repo, "synthetic unavailable dormant trial"); readGit(f.repo, "switch", "main");
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity }).component_pin)
    .toEqual(f.bindings.component_pin.value);
  expect(() => adoption.collectTrialBindings({ repo: f.repo, current_default: current })).toThrow("committed blob");
});

test('trial setup retains the recorded native spelling when the configured actor is recased', () => {
  const f = trialDefinitionFixture(roots);
  f.configured.publication.actor = 'FIXTURE-BOT';
  const current = commitTrialDefinition(f);
  const policy = adoption.collectTrialBindings({ repo: f.repo, current_default: current, identity: runtimeIdentity });
  expect(policy.identity.actor).toBe(f.definition.identity.actor);
  expect(policy.identity.actor).toBe('fixture-bot');
  expect(policy.identity.actor_id).toBe(runtimeIdentity.actor_id);
});
