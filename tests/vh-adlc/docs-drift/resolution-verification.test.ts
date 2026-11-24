import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { resolutionFixture } from "./resolution-fixture";
import { buildResolution } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { resolutionVerificationReader } from "../../../plugins/vh-adlc/scripts/docs-drift/resolution-verification";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["matching", "unknown", "missing-evidence", "wrong-evidence", "duplicate", "missing-row", "wrong-hunk"])("native resolution semantic rows retain exact hunk accounting: %s", async fault => {
  const f = resolutionFixture(roots), quoted = f.quote("src/app.ts");
  if (fault === "wrong-evidence") quoted.quote_sha256 = "f".repeat(64);
  const row = { proposal: 1, hunk_id: fault === "wrong-hunk" ? "foreign-hunk" : f.decision.hunk_id,
    state: fault === "unknown" ? "unknown" : "passed", method: "Current source inspection",
    evidence: fault === "missing-evidence" ? [] : [quoted], asset_checks: [] };
  const records = fault === "duplicate" ? [row, row] : fault === "missing-row" ? [] : [row];
  const options = { repo: f.repo, artifact_root: dirname(f.collection.store.record_path), snapshot: f.snapshot, inputs: f.inputs,
    records, returned_sha256: sha256(Buffer.from("Original native returned records")), decisions: [f.decision] };
  if (fault === "duplicate" || fault === "missing-row") {
    expect(() => resolutionVerificationReader(options)).toThrow();
    return;
  }
  const read = resolutionVerificationReader(options);
  const result = await buildResolution({ ...f.options, observe_verification: async scope => read(scope) });
  expect(result.complete, result.diagnostics.join("\n")).toBe(fault === "matching");
  if (fault === "matching") expect(result.record?.verification[0].artifact_sha256).toBe(options.returned_sha256);
});
