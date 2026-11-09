import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { publicationFixture } from "./publication-fixture";
import { createJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { OUTPUT_LIMIT } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("recovery CLI output projects a large journal into a bounded persistent-attention summary", async () => {
  const { recoveryEffectsOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-output");
  const f = publicationFixture(roots), journal = structuredClone(createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan }));
  // Only the pure output projector sees this oversized synthetic payload.
  journal.plan.manifest.effects[3].payload.body = "private-body-canary".repeat(100000);
  const options = { command: "acknowledge-delivery", source: f.plan.manifest.bindings.source_commit, outcome: "attention" as const,
    result: { state: "acknowledged" as const, reason: null, journal }, limit: 4096 };
  const output = recoveryEffectsOutput(options), bytes = JSON.stringify(output) + "\n";
  expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(4096);
  expect(bytes).not.toContain("private-body-canary"); expect(bytes).not.toContain('"events"');
  expect(output).toMatchObject({ outcome: "attention", recovery_effects: { state: "acknowledged", operation_id: f.plan.manifest.operation_id,
    journal: { directory: journal.directory, sha256: journal.digest } } });
  const largeReason = recoveryEffectsOutput({ ...options, result: { ...options.result, reason: "diagnostic".repeat(10000) } });
  expect(Buffer.byteLength(JSON.stringify(largeReason) + "\n")).toBeLessThanOrEqual(4096);
  expect(largeReason.recovery_effects.details_omitted).toBe(true);
  expect(() => recoveryEffectsOutput({ ...options, limit: 1, capacity_check: true })).toThrow();
  expect(() => recoveryEffectsOutput({ ...options, limit: OUTPUT_LIMIT + 1 })).toThrow();
});
