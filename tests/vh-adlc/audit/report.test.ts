import { afterEach, expect, test } from "bun:test";
import { lstatSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { saveReport } from "../../../plugins/vh-adlc/scripts/audit/report";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git, ledger } from "./fixtures";
import { evaluateAssessments } from "../../../plugins/vh-adlc/scripts/audit/assessment";
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


test("a comment-hidden identity is neither terminal-eligible nor allocated in the private report",()=>{
 const f=fixture();projects.push(f);
 const bytes=ledger.replace("| AUD-002 | Low | Historical observation | FIXED |\n","").replace("## Findings","Note <!-- archived\n| AUD-002 | Low | Hidden | FIXED |\n-->\n\n## Findings");f.write("docs/audit.md",bytes);const base=f.commit();
 const config=loadSettings(f.root),snap=captureSnapshot(config,{mode:"reverify",ids:["AUD-002"],artifact_root:f.artifacts,baseline:base,required_checks:{"AUD-002":["unit"]}});
 const document={schema_version:1,snapshot_digest:snap.digest,assessments:[terminal(f,snap,"AUD-002")]};
 expect(evaluateAssessments(config,snap,document).eligible_ids).toEqual([]);expect(snap.inventory.next_id).toBeNull();
 const text=readFileSync(saveReport(config,snap,"hidden-index",document),"utf8");expect(text).toContain("Terminal eligibility: not established");expect(text).not.toContain("structurally eligible");
});
