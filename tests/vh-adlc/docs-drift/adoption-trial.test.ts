import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs";
import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { commitAll, git, put } from "./repository-fixture";
import { TRIAL_IDENTITY } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { trialAdoptionDelivery, trialAdoptionFixture } from "./adoption-trial-fixture";

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
