import { afterEach, expect, test } from "bun:test";
import { lstatSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { saveReport } from "../../../plugins/vh-adlc/scripts/audit/report";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git } from "./fixtures";
import { terminal } from "./evidence";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
test("reports are exclusive private artifacts and recorded status is never presented as fresh verification", () => {
  const f = fixture(); projects.push(f);
  const config = loadSettings(f.root), before = git(f.root, "status", "--porcelain");
  const snap = captureSnapshot(config, { mode: "status", artifact_root: f.artifacts });
  const file = saveReport(config, snap, "status-report");
  expect(readFileSync(file, "utf8")).toContain("Recorded status");
  expect(readFileSync(file, "utf8")).toContain("Current verification: not performed");
  expect(lstatSync(file).mode & 0o777).toBe(0o600);
  expect(() => saveReport(config, snap, "status-report")).toThrow();
  expect(() => saveReport(config, snap, "../escape")).toThrow();
  symlinkSync(join(f.root, "docs/audit.md"), join(f.artifacts, "linked.md"));
  expect(() => saveReport(config, snap, "linked")).toThrow();
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});
test("a human report contains every current finding's verdict, observed checks and unresolved reason", () => {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root);
  const snap = captureSnapshot(config, { mode: "reverify", ids: ["AUD-001"], artifact_root: f.artifacts });
  const row = terminal(f, snap); row.verdict = "UNKNOWN"; row.reason = "The live scenario could not be exercised."; row.residuals = ["Live target unavailable."];
  const file = saveReport(config, snap, "incomplete-report", { schema_version: 1, snapshot_digest: snap.digest, assessments: [row] });
  const text = readFileSync(file, "utf8");
  for (const expected of ["AUD-001", "UNKNOWN", "The live scenario could not be exercised.", "Live target unavailable.", "unit"]) expect(text).toContain(expected);
});
