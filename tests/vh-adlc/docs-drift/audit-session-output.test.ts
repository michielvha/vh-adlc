import { expect, test } from "bun:test";
import { auditSessionOutput, type runAuditSession } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-session";
import type { AuditOutputArtifacts } from "../../../plugins/vh-adlc/scripts/docs-drift/report-output";

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

function artifacts(complete: boolean): AuditOutputArtifacts {
  return { schema_version: 1, kind: "docs-drift-report-artifacts", authority: "none", source_commit: "a".repeat(40),
    complete, scope_changed: false, content: "report", history_provenance: "absent", directory: "/private/audit-output-one",
    files: { report_json: { path: "audit-output-one/report.json", sha256: "b".repeat(64) }, markdown: null },
    diagnostics: complete ? [] : ["Markdown publication failed"] };
}
test("failed report retention keeps a completed audit command incomplete and preserves partial references", () => {
  const session = failed(); session.complete = true;
  const retained = artifacts(false), result = auditSessionOutput(session, 4096, retained);
  expect(result.outcome).toBe("incomplete"); expect(result.audit_session.complete).toBe(true);
  expect(result.report_artifacts).toEqual(retained);
  expect(result.diagnostics).toContainEqual({ code: "audit-output", message: "Markdown publication failed" });
  expect(session.complete).toBe(true);
});
test("retained references participate in the command output bound", () => {
  const retained = artifacts(false); retained.diagnostics = ["x".repeat(600000)];
  const result = auditSessionOutput(failed(), 2048, retained);
  expect(Buffer.byteLength(JSON.stringify(result) + "\n")).toBeLessThanOrEqual(2048);
  expect(result.outcome).toBe("incomplete"); expect(result.details_omitted).toBe(true);
  expect(result.report_artifacts?.files.report_json).toEqual(retained.files.report_json);
  expect(result.report_artifacts?.directory).toBe(retained.directory);
  expect(result.report_artifacts?.diagnostics).toEqual(["Retained output diagnostics exceed the command bound; inspect the saved files and original records"]);
  expect(result.audit_session).toEqual(failed()); expect(retained.diagnostics[0].length).toBe(600000);
});
test("artifact paths too large for a failure summary can be omitted only with an incomplete result", () => {
  const retained = artifacts(false); retained.files.report_json!.path = "x".repeat(6000);
  const result = auditSessionOutput(failed(), 2048, retained);
  expect(result.outcome).toBe("incomplete"); expect(result.details_omitted).toBe(true); expect(result.report_artifacts).toBeNull();
  expect(Buffer.byteLength(JSON.stringify(result) + "\n")).toBeLessThanOrEqual(2048);
  expect(retained.files.report_json!.path.length).toBe(6000);
});
