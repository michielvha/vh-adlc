import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
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
