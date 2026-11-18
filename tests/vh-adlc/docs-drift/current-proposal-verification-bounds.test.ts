import { expect, test } from "bun:test";
import * as api from "../../../plugins/vh-adlc/scripts/docs-drift/current-proposal-verification";
import { OUTPUT_LIMIT } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";

const record = "current-proposal-verification-00000000-0000-4000-8000-000000000000.json";
function input(): api.CurrentProposalVerification {
  return { schema_version: 1, kind: "docs-drift-current-proposal-verification", authority: "none", source_commit: "a".repeat(40),
    complete: true, scope_changed: false, details_omitted: false, diagnostics: ["x".repeat(6000)], inputs_sha256: "b".repeat(64),
    required_proposals: 0, verified_proposals: 0, proposals: [], evidence: null };
}
function compact() {
  return { ...input(), complete: false, details_omitted: true,
    diagnostics: ["Current verification exceeds the retained entry bound. Inspect the original private records"] };
}
function size(value: unknown) { return Buffer.byteLength(JSON.stringify(value) + "\n"); }

test("an incomplete pending summary must reserve the reference before accepting its bound", () => {
  const limit = size(compact()) + 1;
  expect(() => api.boundCurrentProposalVerification(input(), limit, record)).toThrow("Configured bound cannot retain an incomplete current verification result");
});

test("a compact pending result and its actual retained reference both fit the checked bound", () => {
  const reference = { path: record, sha256: "0".repeat(64) }, limit = size({ ...compact(), evidence: reference }) + 1;
  const result = api.boundCurrentProposalVerification(input(), limit, record);
  expect(result).toMatchObject({ complete: false, details_omitted: true, proposals: [], evidence: reference });
  expect(size(result)).toBeLessThanOrEqual(limit);
  expect(size({ ...result, evidence: { ...reference, sha256: "c".repeat(64) } })).toBeLessThanOrEqual(limit);
});

test("final oversize output clears a formerly successful reference and stays bounded", () => {
  const original = { ...input(), evidence: { path: record, sha256: "c".repeat(64) } }, before = structuredClone(original);
  const limit = size(compact()) + 1, result = api.boundCurrentProposalVerification(original, limit);
  expect(result).toMatchObject({ complete: false, details_omitted: true, evidence: null });
  expect(size(result)).toBeLessThanOrEqual(limit);
  expect(original).toEqual(before);
});

test("pure output bounding supplies no original verification provenance", () => {
  const original = input(), before = structuredClone(original);
  const result = api.boundCurrentProposalVerification(original, 8192, record);
  expect(result.complete).toBe(true);
  expect(size(result)).toBeLessThanOrEqual(8192);
  expect(original).toEqual(before);
  expect(() => api.recheckCurrentProposalVerification(result)).toThrow("Original complete current proposal verification required");
});

for (const [name, limit] of Object.entries({ zero: 0, NaN, infinity: Infinity, "above maximum": OUTPUT_LIMIT + 1 })) {
  test("current-result bounding rejects " + name, () => {
    expect(() => api.boundCurrentProposalVerification(input(), limit, record)).toThrow("Current verification output bound required");
  });
}
