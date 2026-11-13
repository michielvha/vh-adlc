import { expect, test } from "bun:test";
import { auditSessionOutput, type runAuditSession } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-session";

function failed(): Awaited<ReturnType<typeof runAuditSession>> {
  return { schema_version: 1, kind: "docs-drift-audit-session", authority: "none", source_commit: "a".repeat(40),
    complete: false, scope_changed: false, diagnostics: ["Original source unavailable"], start: null, requests: { worker: null, reviewer: null }, worker: null, reviewer: null, report: null };
}
test("failed audit-session output stays incomplete without an empty successful report", () => {
  const result = auditSessionOutput(failed(), 2048);
  expect(result.outcome).toBe("incomplete"); expect(result.audit_session.report).toBeNull(); expect(result.details_omitted).toBe(false);
  expect(result.diagnostics[0].message).toContain("Original source unavailable");
});
test("oversized session diagnostics become a bounded incomplete summary without altering originals", () => {
  const original = failed(); original.diagnostics = ["x".repeat(16000)];
  const result = auditSessionOutput(original, 2048);
  expect(result.outcome).toBe("incomplete"); expect(result.details_omitted).toBe(true); expect(result.audit_session.complete).toBe(false);
  expect(Buffer.byteLength(JSON.stringify(result) + "\n")).toBeLessThanOrEqual(2048);
  expect(JSON.stringify(result)).not.toContain("x".repeat(100)); expect(original.diagnostics[0].length).toBe(16000);
});
test("an audit-session bound too small for its failure summary cannot pass", () => {
  expect(() => auditSessionOutput(failed(), 32)).toThrow("cannot retain an incomplete audit session summary");
});
