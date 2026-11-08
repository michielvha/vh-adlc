import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { DOCS_DRIFT_KNOWLEDGE_PAGES, parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { source, pin, write, commit, runtimeIdentity, portableRecord, deliverRecord } from "./adoption-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("staged signal checks without trial policy explicitly have no runtime target", () => {
  const f = source(roots);
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured,
    publication: { ...f.configured.publication, mode: "staged" } }));
  const current = commit(f.repo, "synthetic staged source without trial");
  expect(typeof adoption.checkUpgradeSignals).toBe("function");
  expect(adoption.checkUpgradeSignals({ repo: f.repo, source: current })).toMatchObject({ status: "staged-no-target", matches: null });
});

function signals(f: ReturnType<typeof source>) {
  const selected = pin();
  const component = { schema_version: 1, source_repository: selected.source_repository,
    source_commit: selected.source_commit, source_release: selected.source_release };
  const clients = { schema_version: 1, clients: { "copilot-linux": { provider: "copilot", package: "@github/copilot",
    version: f.configured.clients["copilot-linux"].version, platform: f.configured.clients["copilot-linux"].platform } } };
  return { component, clients };
}
function writeSignals(f: ReturnType<typeof source>, values = signals(f)) {
  write(f.repo, ".vh-adlc/docs-drift-upgrade-signal.yaml", canonicalJSON(values.component));
  write(f.repo, ".vh-adlc/docs-drift-client-upgrade-signals.yaml", canonicalJSON(values.clients));
}

test("adopted signal checks compare curated component and all selected client identities", () => {
  const f = source(roots); writeSignals(f);
  f.candidate = commit(f.repo, "synthetic source with curated signals");
  const delivery = deliverRecord(f, portableRecord(f));
  const result = adoption.checkUpgradeSignals({ repo: f.repo, source: delivery, identity: runtimeIdentity });
  expect(result).toMatchObject({ status: "signal-match", matches: true });
  expect("clients" in result && result.clients).toHaveLength(1);
});

test.each(["component", "client", "package", "platform"] as const)("an intake-only %s proposal reports drift while approved selection stays unchanged", scenario => {
  const f = source(roots); writeSignals(f); f.candidate = commit(f.repo, "synthetic matching signal source");
  const delivery = deliverRecord(f, portableRecord(f));
  const before = adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity });
  const changed = signals(f);
  if (scenario === "component") changed.component.source_commit = "b".repeat(40);
  if (scenario === "client") changed.clients.clients["copilot-linux"].version = "fixture-2.0.0";
  if (scenario === "package") changed.clients.clients["copilot-linux"].package = "unrelated-package";
  if (scenario === "platform") changed.clients.clients["copilot-linux"].platform = "darwin-arm64";
  writeSignals(f, changed); const proposal = commit(f.repo, "synthetic intake-only proposal");
  expect(adoption.checkUpgradeSignals({ repo: f.repo, source: proposal, identity: runtimeIdentity })).toMatchObject({ status: "signal-mismatch", matches: false });
  const after = adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: proposal, identity: runtimeIdentity });
  expect(after.component_pin).toEqual(before.component_pin);
  expect(after.adoption_sha256).toBe(before.adoption_sha256);
});

test.each(["missing-component", "missing-client", "extra-client", "unknown-component-field", "invalid-source", "test-only-record"] as const)("signal checks refuse %s inputs", scenario => {
  const f = source(roots); writeSignals(f); f.candidate = commit(f.repo, "synthetic curated signal source");
  const record = portableRecord(f);
  if (scenario === "test-only-record") record.receipts.copilot_entry!.evidence_kind = "test-only";
  const delivered = deliverRecord(f, record);
  const values = signals(f);
  if (scenario === "missing-component") rmSync(f.repo + "/.vh-adlc/docs-drift-upgrade-signal.yaml");
  if (scenario === "missing-client") rmSync(f.repo + "/.vh-adlc/docs-drift-client-upgrade-signals.yaml");
  if (scenario === "extra-client") { Object.assign(values.clients.clients, { unexpected: values.clients.clients["copilot-linux"] }); writeSignals(f, values); }
  if (scenario === "unknown-component-field") { Object.assign(values.component, { runtime_directory: "/tmp/untrusted" }); writeSignals(f, values); }
  if (scenario === "invalid-source") { values.component.source_commit = "main"; writeSignals(f, values); }
  const current = scenario === "test-only-record" ? delivered : commit(f.repo, "synthetic invalid signals");
  const reasons = { "missing-component": "regular required upgrade signals", "missing-client": "regular required upgrade signals",
    "extra-client": "client signal inventory", "unknown-component-field": "component signal fields",
    "invalid-source": "immutable commit required", "test-only-record": "observed record receipt copilot_entry" };
  expect(() => adoption.checkUpgradeSignals({ repo: f.repo, source: current, identity: runtimeIdentity })).toThrow(reasons[scenario]);
});

test("upgrade binding collection preserves ordinary inputs and reports no execution change", () => {
  const f = source(roots), delivered = deliverRecord(f, portableRecord(f));
  write(f.repo, "docs/guide.md", "Fresh ordinary documentation input\n");
  write(f.repo, f.configured.scanner.script, "Fresh consumer-owned detector rules\n");
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured,
    detector_options: { ...f.configured.detector_options, links: { check_history: false } },
    trial: { definition_path: ".vh-adlc/docs-drift-trials/dormant.yaml", definition_sha256: "f".repeat(64) } }));
  const proposed = commit(f.repo, "synthetic ordinary source advance");
  expect(typeof adoption.collectUpgradeChanges).toBe("function");
  const result = adoption.collectUpgradeChanges({ repo: f.repo, approved_default: delivered, source_candidate: proposed, identity: runtimeIdentity });
  expect(result.known_affected_entries).toEqual([]);
  expect(result.component.changed).toBe(false);
  expect(result.changed_settings).toEqual([]);
});


function upgradeFixture() {
  const f = source(roots);
  const scheduled = { on: { schedule: [{ cron: "0 6 * * *" }], workflow_dispatch: null },
    permissions: { contents: "write", "pull-requests": "write", actions: "read" },
    jobs: { worker: { uses: "./" + f.configured.execution.worker_workflow,
      with: { component_pin: f.configured.component_pin, pr_draft: false }, secrets: { PROVIDER_TOKEN: "${{ secrets.PROVIDER_TOKEN }}" } } } };
  write(f.repo, f.configured.execution.scheduled_workflow, canonicalJSON(scheduled));
  f.candidate = commit(f.repo, "synthetic approved worker contract");
  const delivered = deliverRecord(f, portableRecord(f)), proposed = parseSettings(f.configured);
  proposed.publication.adoption_record = ".vh-adlc/docs-drift-adoptions/successor.yaml";
  return { ...f, delivered, proposed, scheduled };
}
function changedSource(f: ReturnType<typeof upgradeFixture>) {
  const { trial, ...raw } = f.proposed;
  const required = new Set<string>(DOCS_DRIFT_KNOWLEDGE_PAGES);
  const configured = { ...raw, knowledge_pages: raw.knowledge_pages.filter(page => !required.has(page)) };
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(trial === null ? configured : { ...configured, trial }));
  return commit(f.repo, "synthetic proposed successor source");
}
function changes(f: ReturnType<typeof upgradeFixture>, target = changedSource(f)) {
  return adoption.collectUpgradeChanges({ repo: f.repo, approved_default: f.delivered, source_candidate: target, identity: runtimeIdentity });
}

test("mechanical pin selection stays unclassified until independent component review", () => {
  const f = upgradeFixture(), nextPin = ".vh-adlc/docs-drift-components/successor.yaml";
  f.proposed.component_pin = nextPin;
  write(f.repo, nextPin, canonicalJSON({ ...pin(), source_commit: "b".repeat(40), component_sha256: "b".repeat(64) }));
  f.scheduled.jobs.worker.with.component_pin = nextPin;
  write(f.repo, f.proposed.execution.scheduled_workflow, canonicalJSON(f.scheduled));
  const target = changedSource(f), before = captureRepositoryState(f.repo), result = changes(f, target);
  expect(result.known_affected_entries).toEqual([]);
  expect(result.component).toMatchObject({ changed: true, classification: "pending-independent-review" });
  expect(result.caller_pin_exception?.contract_sha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["hosted", "copilot", "claude"] as const)("a protected client change maps to its actual %s entry", entry => {
  const f = upgradeFixture();
  f.proposed.clients.successor = { ...f.proposed.clients["copilot-linux"], version: "fixture-2.0.0", distribution_sha256: "b".repeat(64) };
  f.proposed.execution.entries[entry].worker.client = "successor";
  f.proposed.execution.entries[entry].reviewer.client = "successor";
  expect(changes(f).known_affected_entries).toEqual([entry]);
});

test.each(["launcher", "loader-argv", "loader-provider", "claude-command", "worker", "permissions", "verification", "read-set"] as const)("protected %s changes retain the corresponding affected entries", scenario => {
  const f = upgradeFixture();
  if (scenario === "launcher") write(f.repo, f.proposed.runtime_loader.launcher, "Changed protected launcher\n");
  if (scenario === "loader-argv") f.proposed.runtime_loader.argv.push("--no-custom-instructions");
  if (scenario === "loader-provider") f.proposed.runtime_loader.provider = "claude";
  if (scenario === "claude-command") write(f.repo, f.proposed.execution.claude_command, "Changed protected Claude forwarding\n");
  if (scenario === "worker") write(f.repo, f.proposed.execution.worker_workflow, "Changed protected hosted worker\n");
  if (scenario === "permissions") f.proposed.execution.permissions.contents = "read";
  if (scenario === "verification") f.proposed.verification_commands = [["bun", "test", "different-check"]];
  if (scenario === "read-set") f.proposed.read_set.source_roots = ["src"];
  const expected = { launcher: ["hosted", "copilot", "claude"], "loader-argv": ["hosted", "copilot", "claude"], "loader-provider": ["hosted", "copilot", "claude"], "claude-command": ["claude"], worker: ["hosted"], permissions: ["hosted"],
    verification: ["hosted", "copilot", "claude"], "read-set": ["hosted", "copilot", "claude"] } satisfies Record<typeof scenario, Array<"hosted" | "copilot" | "claude">>;
  expect(changes(f).known_affected_entries).toEqual(expected[scenario]);
});

test("a scheduled caller change beyond its pin keeps hosted trials required", () => {
  const f = upgradeFixture(), nextPin = ".vh-adlc/docs-drift-components/successor.yaml";
  f.proposed.component_pin = nextPin;
  write(f.repo, nextPin, canonicalJSON({ ...pin(), source_commit: "b".repeat(40), component_sha256: "b".repeat(64) }));
  f.scheduled.jobs.worker.with.component_pin = nextPin; f.scheduled.permissions.contents = "read";
  write(f.repo, f.proposed.execution.scheduled_workflow, canonicalJSON(f.scheduled));
  const result = changes(f);
  expect(result.known_affected_entries).toEqual(["hosted"]);
  expect(result.caller_pin_exception).toBeNull();
  expect(result.caller_failure).toContain("compatible caller fields changed");
});

test.each(["pin", "record", "pin-restored", "record-restored"] as const)("upgrade comparison refuses a changed immutable predecessor %s", scenario => {
  const f = upgradeFixture(), path = scenario.startsWith("pin") ? f.configured.component_pin : f.configured.publication.adoption_record;
  const original = scenario.startsWith("pin") ? canonicalJSON(pin()) : canonicalJSON(portableRecord(f));
  write(f.repo, path, "Changed retained predecessor\n");
  if (scenario.endsWith("restored")) { commit(f.repo, "synthetic predecessor mutation"); write(f.repo, path, original); }
  const target = changedSource(f);
  expect(() => changes(f, target)).toThrow("immutable predecessor input changed " + path);
});


test("upgrade comparison refuses another consumer host", () => {
  const f = upgradeFixture(); f.proposed.hostname = "other.example.invalid";
  expect(() => changes(f)).toThrow("successor consumer identity differs");
});

test("upgrade comparison requires a descendant of the approved default", () => {
  const f = upgradeFixture(), earlier = readGit(f.repo, "rev-list", "--max-parents=0", "HEAD").toString().trim();
  const before = captureRepositoryState(f.repo);
  expect(() => changes(f, earlier)).toThrow("successor source must descend from approved default");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("a settings-only pin change retains hosted impact when the scheduled caller still selects its predecessor", () => {
  const f = upgradeFixture(), nextPin = ".vh-adlc/docs-drift-components/successor.yaml";
  f.proposed.component_pin = nextPin;
  write(f.repo, nextPin, canonicalJSON({ ...pin(), source_commit: "b".repeat(40), component_sha256: "b".repeat(64) }));
  const result = changes(f);
  expect(result.known_affected_entries).toEqual(["hosted"]);
  expect(result.caller_pin_exception).toBeNull();
  expect(result.caller_failure).toContain("compatible selected pin differs");
});
