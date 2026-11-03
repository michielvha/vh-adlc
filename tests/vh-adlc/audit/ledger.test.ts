import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLedgerCandidate, validateLedgerCandidate, applyLedgerCandidate, cleanupOwnedLedger, appendFindings } from "../../../plugins/vh-adlc/scripts/audit/ledger";
import { captureSnapshot, hash } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { inventory, visibleLines } from "../../../plugins/vh-adlc/scripts/audit/inventory";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git, ledger } from "./fixtures";
import { terminal } from "./evidence";
const projects: ReturnType<typeof fixture>[] = [];
function context(mode: "reverify" | "full" = "reverify") {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root), base = git(f.root, "rev-parse", "HEAD");
  git(f.root, "update-ref", "refs/remotes/origin/main", base);
  const snap = captureSnapshot(config, { mode, ids: ["AUD-001"], baseline: base, artifact_root: f.artifacts, required_checks: { "AUD-001": ["unit"] } });
  const document = { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(f, snap)] };
  const candidate = () => createLedgerCandidate(config, snap, { document, at: "2026-11-02", run_id: "test-ledger" });
  const refresh = () => ({ default_branch: "main", default_commit: git(f.root, "rev-parse", "refs/remotes/origin/main") });
  const request = { authorized: true, mode, ids: ["AUD-001"], effects: ["ledger-update", "ledger-commit"] as const };
  const options = { path: join(f.outer, "ledger-worktree"), commit: true, request, refresh };
  return { f, config, snap, document, candidate, options, base };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("a deterministic candidate changes only selected status plus dated evidence and preserves existing findings/history", () => {
  const c = context(), before = git(c.f.root, "status", "--porcelain"), candidate = c.candidate();
  expect(candidate.bytes).toContain("Historical observation"); expect(candidate.bytes).toContain("Recorded FIXED on an older commit.");
  expect(candidate.bytes).toContain("Scope baseline: " + c.base); expect(candidate.bytes).toContain("Verified source: " + c.base);
  expect(candidate.bytes).toContain("| AUD-001 | High | Incorrect result | FIXED |");
  expect(validateLedgerCandidate(c.config, c.snap, candidate, c.document).valid).toBe(true);
  expect(readFileSync(join(c.f.root, "docs/audit.md"), "utf8")).toBe(ledger); expect(git(c.f.root, "status", "--porcelain")).toBe(before);
});
test.each(["delete", "renumber", "unrelated", "false-fixed", "stale", "conflicting-id"])("a %s candidate cannot be applied", kind => {
  const c = context(), candidate = c.candidate();
  if (kind === "delete") candidate.bytes = candidate.bytes.replace("### AUD-002", "### Removed");
  if (kind === "renumber") candidate.bytes = candidate.bytes.replaceAll("AUD-001", "AUD-099");
  if (kind === "unrelated") candidate.bytes = candidate.bytes.replace("Historical observation", "Rewritten prose");
  if (kind === "false-fixed") c.document.assessments[0].challenge = null;
  if (kind === "stale") c.f.write("src/app.ts", "export const answer = 43;\n");
  if (kind === "conflicting-id") c.f.write("docs/audit.md", ledger + "\n### AUD-003 - Concurrent finding\n");
  expect(validateLedgerCandidate(c.config, c.snap, candidate, c.document).valid).toBe(false);
});
test("application and commit use only an owned branch at assessed default base and resume never duplicates the commit", () => {
  const c = context(), candidate = c.candidate(), refs = git(c.f.root, "rev-parse", "main");
  const applied = applyLedgerCandidate(c.config, c.snap, candidate, c.document, c.options);
  expect(applied.branch).toBe("chore/audit-ledger-test-ledger"); expect(applied.base).toBe(c.base);
  expect(git(applied.path, "diff-tree", "--no-commit-id", "--name-only", "-r", applied.commit!)).toBe("docs/audit.md");
  expect(git(c.f.root, "rev-parse", "main")).toBe(refs); expect(readFileSync(join(c.f.root, "docs/audit.md"), "utf8")).toBe(ledger);
  expect(applyLedgerCandidate(c.config, c.snap, candidate, c.document, c.options).commit).toBe(applied.commit);
  expect(() => cleanupOwnedLedger(c.config, applied, { retained: false })).toThrow();
  // This local report commit is unpublished; cleanup must retain it even when the worktree is clean.
  expect(cleanupOwnedLedger(c.config, applied, { retained: true }).removed).toBe(false);
});
test("ledger-update without ledger-commit leaves only the owned candidate uncommitted", () => {
  const c = context(), candidate = c.candidate();
  const applied = applyLedgerCandidate(c.config, c.snap, candidate, c.document, { ...c.options, commit: false, request: { ...c.options.request, effects: ["ledger-update"] } });
  expect(applied.commit).toBe(null); expect(git(applied.path, "status", "--porcelain")).toContain("docs/audit.md");
  expect(git(c.f.root, "status", "--porcelain")).toBe("");
});
test("ordinary cleanup removes a clean owned worktree only after its commit and evidence are retained in default history", () => {
  const c = context(), applied = applyLedgerCandidate(c.config, c.snap, c.candidate(), c.document, c.options);
  git(c.f.root, "merge", "--ff-only", applied.commit!); git(c.f.root, "update-ref", "refs/remotes/origin/main", applied.commit!);
  expect(cleanupOwnedLedger(c.config, applied, { retained: true }).removed).toBe(true);
  expect(git(c.f.root, "worktree", "list", "--porcelain")).not.toContain(applied.path);
});
test.each(["feature", "dirty", "advanced", "no-permission", "no-commit"])("%s cannot bypass the assessed default source or permission boundary", kind => {
  const c = context();
  if (kind === "feature") { git(c.f.root, "switch", "-qc", "feat/unrelated"); c.snap.source.branch = "feat/unrelated"; }
  if (kind === "dirty") c.f.write("unrelated.ts", "keep this work\n");
  if (kind === "advanced") { c.f.write("new.ts", "new default source\n"); git(c.f.root, "update-ref", "refs/remotes/origin/main", c.f.commit()); }
  const before = git(c.f.root, "status", "--porcelain"), options = { ...c.options };
  if (kind === "no-permission") options.request = { ...options.request, effects: [] };
  if (kind === "no-commit") options.request = { ...options.request, effects: ["ledger-update"] };
  expect(() => applyLedgerCandidate(c.config, c.snap, c.candidate(), c.document, options)).toThrow();
  expect(git(c.f.root, "status", "--porcelain")).toBe(before);
});

test("explicit full mode allocates after all reserved references and preserves the original ledger", () => {
  const c = context("full"); c.f.write("docs/audit.md", ledger + "\nHistorical reference AUD-019.\n"); c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "full", artifact_root: c.f.artifacts });
  const result = appendFindings(c.config, snap, [{ id: "AUD-020", severity: "High", title: "New root cause", body: "Observed original scenario and source evidence." }]);
  expect(result.bytes).toContain("### AUD-020 - New root cause"); expect(result.bytes).toContain("Historical reference AUD-019.");
  expect(() => appendFindings(c.config, snap, [{ id: "AUD-019", severity: "High", title: "Reused", body: "No." }])).toThrow();
  const reverify = captureSnapshot(c.config, { mode: "reverify", artifact_root: c.f.artifacts });
  expect(() => appendFindings(c.config, reverify, [{ id: "AUD-020", severity: "High", title: "Unexpected full", body: "No." }])).toThrow();
});

test("an honest UNKNOWN assessment can propose a partial update without inventing terminal evidence", () => {
  const c = context(); c.document.assessments[0].verdict = "UNKNOWN"; c.document.assessments[0].challenge = null;
  c.document.assessments[0].checks = []; c.document.assessments[0].residuals = ["Required live access unavailable."];
  expect(c.candidate().bytes).toContain("| AUD-001 | High | Incorrect result | UNKNOWN |");
});

test("a fix candidate can be explicitly provisional while missing independent final review, and cannot use the reverify application route", () => {
  const c = context(); git(c.f.root, "switch", "-qc", "fix/selected");
  c.f.write("src/app.ts", "export const answer = 43;\n"); c.f.commit("test: selected repair");
  const snap = captureSnapshot(c.config, { mode: "fix", ids: ["AUD-001"], baseline: c.base, artifact_root: c.f.artifacts, required_checks: { "AUD-001": ["unit"] } });
  const row = terminal(c.f, snap); row.disposition = "authored-repair"; row.challenge = null;
  row.red = { ...row.checks[0], commit: c.base, exit_code: 1, artifact: c.f.artifact("selected-red.txt") };
  const document = { schema_version: 1, snapshot_digest: snap.digest, assessments: [row] };
  const candidate = createLedgerCandidate(c.config, snap, { document, at: "2026-11-02", run_id: "selected-fix", provisional: true });
  expect(candidate.verdict_eligibility).toBe("provisional"); expect(candidate.bytes).toContain("Verified source: " + snap.source.commit);
  expect(() => applyLedgerCandidate(c.config, snap, candidate, document, c.options)).toThrow();
});
test("legacy range gaps can be recorded honestly without changing a shared historical range to a terminal member verdict", () => {
  const c = context(), original = ledger.replace("| AUD-002 | Low | Historical observation | FIXED |", "| AUD-002..AUD-003 | Low | Historical group | FIXED |");
  c.f.write("docs/audit.md", original); const base = c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-003"], baseline: base, artifact_root: c.f.artifacts });
  const row = terminal(c.f, snap, "AUD-003"); row.verdict = "UNKNOWN"; row.reason = "The range has no individual historical scenario.";
  row.residuals = ["Individual identity and evidence unavailable."]; row.checks = []; row.challenge = null;
  const candidate = createLedgerCandidate(c.config, snap, { document: { schema_version: 1, snapshot_digest: snap.digest, assessments: [row] }, at: "2026-11-02", run_id: "range-gap" });
  expect(candidate.bytes).toContain("| AUD-002..AUD-003 | Low | Historical group | FIXED |");
  expect(candidate.bytes).toContain("The range has no individual historical scenario."); expect(candidate.bytes).not.toContain("### AUD-003");
});
test("a lightweight reverify delta can propose a genuinely new related finding without triggering full mode", () => {
  const c = context(); c.f.write("src/app.ts", "export const answer = 43; // related class instance\n"); c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-001"], baseline: c.base, artifact_root: c.f.artifacts });
  const findings = [{ id: "AUD-003", severity: "High", title: "Related new root cause", body: "Observed in the changed source.", delta_paths: ["src/app.ts"] }];
  expect(appendFindings(c.config, snap, findings).bytes).toContain("### AUD-003");
  expect(() => appendFindings(c.config, snap, [{ ...findings[0], delta_paths: ["docs/audit.md"] }])).toThrow();
  expect(snap.mode).toBe("reverify");
});
test("legacy title annotations and inline reverify markers preserve the original finding heading and anchor", () => {
  const c = context(), original = ledger.replace("| ID | Sev | Finding | Status |", "| ID | Sev | Area | Title |")
    .replace("| AUD-001 | High | Incorrect result | OPEN |", "| AUD-001 | High | Example | Incorrect result |")
    .replace("| AUD-002 | Low | Historical observation | FIXED |", "| AUD-002 | Low | Example | Historical observation - **FIXED** |");
  c.f.write("docs/audit.md", original); const base = c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-001"], baseline: base, artifact_root: c.f.artifacts });
  const candidate = createLedgerCandidate(c.config, snap, { document: { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(c.f, snap)] }, at: "2026-11-02", run_id: "legacy-format" });
  expect(candidate.bytes).toContain("**Re-verify (2026-11-02):**"); expect(candidate.bytes).toContain("✅ **FIXED");
  expect(candidate.bytes).toContain("### AUD-001 - Incorrect result\nThe return value needs a current check.");
});

test.each(["missing", "older"])("a %s comparison remains honest while the next scope baseline permits isolated default application", kind => {
  const c = context(), comparison = kind === "missing" ? "0".repeat(40) : c.base;
  c.f.write("src/app.ts", "export const answer = 43; // current default delta\n"); const head = c.f.commit(); git(c.f.root, "update-ref", "refs/remotes/origin/main", head);
  const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-001"], baseline: comparison, artifact_root: c.f.artifacts, required_checks: { "AUD-001": ["unit"] } });
  const document = { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(c.f, snap)] };
  const candidate = createLedgerCandidate(c.config, snap, { document, at: "2026-11-02", run_id: "comparison-scope",
    ...(kind === "older" ? { new_findings: [{ id: "AUD-003", severity: "High", title: "New related cause", body: "Observed in current related source delta.", delta_paths: ["src/app.ts"] }] } : {}) });
  expect(candidate.scope_baseline).toBe(head); expect(candidate.bytes).toContain("Scope baseline: " + head);
  if (kind === "missing") { expect(snap.history.status).toBe("unscoped"); expect(candidate.bytes).toContain("Comparison: unscoped"); }
  else { expect(snap.history.baseline).toBe(c.base); expect(candidate.bytes).toContain("### AUD-003"); }
  const result = applyLedgerCandidate(c.config, snap, candidate, document, { ...c.options, path: join(c.f.outer, "comparison-worktree") });
  expect(result.base).toBe(head); expect(readFileSync(join(result.path, "docs/audit.md"), "utf8")).toBe(candidate.bytes);
});

test.each([false, true])("CI suppression is only included with the explicit current request flag %s", skip_ci => {
  const c = context(), applied = applyLedgerCandidate(c.config, c.snap, c.candidate(), c.document, { ...c.options, request: { ...c.options.request, skip_ci } });
  expect(git(applied.path, "log", "-1", "--format=%s").includes("[skip ci]")).toBe(skip_ci);
});
test("fresh finding allocation preserves the widest observed ID spelling", () => {
  const c = context("full"); c.f.write(c.config.ledger_path, ledger.replaceAll("AUD-001", "AUD-0001").replaceAll("AUD-002", "AUD-0002") + "\nReference-only AUD-0159.\n"); c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "full", artifact_root: c.f.artifacts }); expect(snap.inventory.next_id).toBe("AUD-0160");
  expect(appendFindings(c.config, snap, [{ id: "AUD-0160", severity: "High", title: "Distinct cause", body: "Observed fixture scenario." }]).bytes).toContain("### AUD-0160");
});

test("dated notes stay outside fenced/commented headings and before an indented next finding", () => {
  const c = context(), sample = "```sh\n# reproduce as attacker\n## output\nprintf 'example'\n```\n<!--\n## Hidden example\n-->\nOriginal scenario detail.\n";
  c.f.write(c.config.ledger_path, ledger.replace("The return value needs a current check.\n", sample).replace("### AUD-002", "  ### AUD-002")); const base = c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-001"], baseline: base, artifact_root: c.f.artifacts });
  const candidate = createLedgerCandidate(c.config, snap, { document: { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(c.f, snap)] }, at: "2026-11-02", run_id: "body-boundaries" });
  expect(candidate.bytes).toContain(sample);
  const note = candidate.bytes.indexOf("<!-- audit-run:body-boundaries:AUD-001 -->");
  expect(note).toBeGreaterThan(candidate.bytes.indexOf("Original scenario detail.")); expect(note).toBeLessThan(candidate.bytes.indexOf("  ### AUD-002"));
});
test("title status annotations preserve non-pipe Markdown escapes byte for byte", () => {
  const c = context(), title = String.raw`Escaped \*literal\* \_name\_ \<tag\> and \\slash`;
  const original = ledger.replace("| ID | Sev | Finding | Status |", "| ID | Sev | Area | Title |")
    .replace("| AUD-001 | High | Incorrect result | OPEN |", `| AUD-001 | High | Example | ${title} |`)
    .replace("| AUD-002 | Low | Historical observation | FIXED |", "| AUD-002 | Low | Example | Historical observation |" );
  c.f.write(c.config.ledger_path, original); const base = c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-001"], baseline: base, artifact_root: c.f.artifacts });
  const candidate = createLedgerCandidate(c.config, snap, { document: { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(c.f, snap)] }, at: "2026-11-02", run_id: "raw-title" });
  expect(candidate.bytes).toContain(title + " - ✅ **FIXED");
});

test.each(["detached", "owned-branch"])("a clean %s assessment of exact default can apply while shared main stays dirty and staged", mode => {
  const c = context(), assessment = join(c.f.outer, "assessment");
  c.f.write("OWNER-STAGED.txt", "Preserve staged owner bytes.\n"); git(c.f.root, "add", "OWNER-STAGED.txt"); c.f.write("OWNER-UNTRACKED.txt", "Preserve working owner bytes.\n");
  const before = git(c.f.root, "status", "--porcelain"), index = hash(readFileSync(join(c.f.root, ".git/index")));
  if (mode === "detached") git(c.f.root, "worktree", "add", "--detach", assessment, c.base);
  else git(c.f.root, "worktree", "add", "-b", "chore/audit-ledger-assessment", assessment, c.base);
  const config = loadSettings(assessment), snap = captureSnapshot(config, { mode: "reverify", ids: ["AUD-001"], artifact_root: c.f.artifacts, baseline: c.base, required_checks: { "AUD-001": ["unit"] } });
  const document = { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(c.f, snap)] }, candidate = createLedgerCandidate(config, snap, { document, at: "2026-11-02", run_id: "isolated-default" });
  const result = applyLedgerCandidate(config, snap, candidate, document, { ...c.options, path: join(c.f.outer, "applied-default") });
  expect(result.base).toBe(c.base); expect(git(c.f.root, "rev-parse", "main")).toBe(c.base);
  expect(git(c.f.root, "status", "--porcelain")).toBe(before); expect(hash(readFileSync(join(c.f.root, ".git/index")))).toBe(index);
});

test("an established dated-ledger layout keeps banners, summary tables, visible status markers and unchanged heading anchors", () => {
  const c = context(), original = ledger.replace("## Severity index", "## How this audit was performed\n\n> Historical pass (2026-10-01): prior evidence only.\n\n## Severity index") + "\n## Re-verification summary (2026-10-01)\nOlder summary stays intact.\n";
  c.f.write(c.config.ledger_path, original); const base = c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-001"], baseline: base, artifact_root: c.f.artifacts });
  const candidate = createLedgerCandidate(c.config, snap, { document: { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(c.f, snap)] }, at: "2026-11-02", run_id: "dated-layout" });
  expect(candidate.bytes).toContain("> Audit pass (2026-11-02)");
  expect(candidate.bytes.indexOf("> Audit pass (2026-11-02)")).toBeLessThan(candidate.bytes.indexOf("> Historical pass"));
  expect(candidate.bytes).toContain("## Re-verification summary (2026-11-02)");
  for (const category of ["Fully fixed", "Partially fixed", "Regressed", "Moot", "Unknown"]) expect(candidate.bytes).toContain("### " + category);
  expect(candidate.bytes).toContain("### AUD-001 - Incorrect result\n\n✅ **FIXED (2026-11-02)**");
  expect(candidate.bytes).toContain("Older summary stays intact."); expect(candidate.bytes).toContain("Historical pass (2026-10-01): prior evidence only.");
  expect(candidate.bytes).toContain("Unselected findings retain their recorded history");
});

test("new full-audit entries stay with findings before existing summaries instead of becoming summary children", () => {
  const c = context("full"); c.f.write(c.config.ledger_path, ledger + "\n## Re-verification summary (2026-10-01)\nHistorical summary remains.\n"); c.f.commit();
  const snap = captureSnapshot(c.config, { mode: "full", artifact_root: c.f.artifacts }), result = appendFindings(c.config, snap, [{ id: "AUD-003", severity: "High", title: "New cause", body: "Original new scenario." }]);
  expect(result.bytes.indexOf("### AUD-003")).toBeLessThan(result.bytes.indexOf("## Re-verification summary")); expect(result.bytes).toContain("Historical summary remains.");
});
test("a new finding body cannot introduce a sibling/parent heading, while fenced reproduction headings remain content", () => {
  const c = context("full"), snap = captureSnapshot(c.config, { mode: "full", artifact_root: c.f.artifacts });
  const finding = { id: "AUD-003", severity: "High", title: "New cause", body: "## Escapes finding scope\nUnexpected document structure." };
  expect(() => appendFindings(c.config, snap, [finding])).toThrow();
  expect(appendFindings(c.config, snap, [{ ...finding, body: "```sh\n# Reproduction comment\n```\n#### Evidence\nObserved scenario." }]).bytes).toContain("# Reproduction comment");
});

test.each(["no-commit", "read-only", "option-no-write", "prohibited-update", "unknown-request-field"])("apply honors %s before any refresh, worktree, commit or ref change", kind => {
  const c = context();
  c.f.write("AGENTS.md", "Audit: [settings](.vh-adlc/audit.json).\n");
  const fields = { repository: "example/project", hostname: "github.com", default_branch: "main", ledger_path: "docs/audit.md", status_effects: "none", reverify_effects: "ledger-update,ledger-commit", full_effects: "none", fix_effects: "none", selection_policy: "#selection", verification_policy: "#verification", merge_policy: "#merge" };
  c.f.write("audit-project.md", ["# Policy", "", "## Standing audit workflow authorization", "", "| Field | Value |", "| --- | --- |", ...Object.entries(fields).map(([key,value]) => `| ${key} | ${value} |`), "", "## Selection", "Selected IDs only.", "## Verification", "Required checks.", "## Merge", "No merge grant.", ""].join("\n"));
  const base = c.f.commit(); git(c.f.root, "update-ref", "refs/remotes/origin/main", base);
  const config = loadSettings(c.f.root), snap = captureSnapshot(config, { mode: "reverify", ids: ["AUD-001"], baseline: base, artifact_root: c.f.artifacts, required_checks: { "AUD-001": ["unit"] } });
  const document = { schema_version: 1, snapshot_digest: snap.digest, assessments: [terminal(c.f,snap)] }, candidate = createLedgerCandidate(config,snap,{document,at:"2026-11-02",run_id:"restricted-write"});
  const request: any = { authorized: true, mode: "reverify", ids: ["AUD-001"], effects: [] };
  if (["no-commit","read-only"].includes(kind)) request.restrictions = [kind];
  if (kind === "prohibited-update") request.prohibited_effects = ["ledger-update"];
  if (kind === "unknown-request-field") request.assumed_permission = true;
  let refreshes=0; const before = git(c.f.root,"show-ref"), index=hash(readFileSync(join(c.f.root,".git/index")));
  expect(() => applyLedgerCandidate(config,snap,candidate,document,{...c.options,request, ...(kind === "option-no-write" ? { restrictions: ["no-write"] } : {}), refresh:()=>{refreshes++;return {default_branch:"main",default_commit:base};}})).toThrow();
  expect(refreshes).toBe(0); expect(git(c.f.root,"show-ref")).toBe(before); expect(hash(readFileSync(join(c.f.root,".git/index")))).toBe(index); expect(git(c.f.root,"status","--porcelain")).toBe("");
});

test("new title/comment text cannot hide original or newly declared ledger identities", () => {
  const c = context("full"), candidate = createLedgerCandidate(c.config,c.snap,{ document:c.document,at:"2026-11-02",run_id:"literal-title",new_findings:[{id:"AUD-003",severity:"High",title:"Stored XSS via <!-- injection",body:"Observed new scenario."}] });
  c.f.write(c.config.ledger_path,candidate.bytes);
  const observed = inventory(c.config);
  expect(observed.complete).toBe(true); expect(observed.findings.map((row:any)=>row.id).sort()).toEqual(["AUD-001","AUD-002","AUD-003"]);
});
test.each(["<!-- unclosed comment", "```sh\n# unclosed code", "~~~\nUnclosed alternative fence"])("unbalanced new body cannot swallow following ledger content: %s", body => {
  const c=context("full"); expect(()=>appendFindings(c.config,c.snap,[{id:"AUD-003",severity:"High",title:"New cause",body}])).toThrow();
});
test.each(["## Severity index ##", " ## Severity index"])("the supported visible index heading %s can receive a new finding", heading => {
  const c=context("full"); c.f.write(c.config.ledger_path,ledger.replace("## Severity index",heading)); c.f.commit();
  const snap=captureSnapshot(c.config,{mode:"full",artifact_root:c.f.artifacts}),result=appendFindings(c.config,snap,[{id:"AUD-003",severity:"High",title:"New cause",body:"Observed scenario."}]);
  c.f.write(c.config.ledger_path,result.bytes); const observed=inventory(c.config); expect(observed.complete).toBe(true);
});
test("a fenced example index before the real table cannot capture new index rows",()=>{
  const c=context("full"),example="```md\n## Severity index\n| ID | Sev | Finding | Status |\n| --- | --- | --- | --- |\n```\n";
  c.f.write(c.config.ledger_path,"# Layout example\n\n"+example+"\n"+ledger);c.f.commit(); const snap=captureSnapshot(c.config,{mode:"full",artifact_root:c.f.artifacts});
  const result=appendFindings(c.config,snap,[{id:"AUD-003",severity:"High",title:"New cause",body:"Observed scenario."}]); expect(result.bytes).toContain(example);
  c.f.write(c.config.ledger_path,result.bytes);const observed=inventory(c.config);expect(observed.complete).toBe(true);
});
test("gap prose cannot comment out the new dated overview",()=>{
  const c=context("full"),original=ledger.replace("## Severity index","## How this audit was performed\n\nPrior pass.\n\n## Severity index").replace("| AUD-002 | Low | Historical observation | FIXED |","| AUD-002..AUD-003 | Low | Historical group | FIXED |");
  c.f.write(c.config.ledger_path,original);const base=c.f.commit(),snap=captureSnapshot(c.config,{mode:"full",ids:["AUD-003"],baseline:base,artifact_root:c.f.artifacts});
  const row=terminal(c.f,snap,"AUD-003");row.verdict="UNKNOWN";row.reason="Missing identity <!-- sample";row.residuals=["Missing scenario <!-- another sample"];row.checks=[];row.challenge=null;
  const candidate=createLedgerCandidate(c.config,snap,{document:{schema_version:1,snapshot_digest:snap.digest,assessments:[row]},at:"2026-11-02",run_id:"literal-gap"});
  const visible=visibleLines(candidate.bytes);expect(visible).toContain("## Re-verification summary (2026-11-02)");
});
test("inline-code HTML examples remain literal and do not hide a later new finding",()=>{
  const c=context("full"),result=appendFindings(c.config,c.snap,[{id:"AUD-003",severity:"High",title:"First cause",body:"The literal `<!--` opener and `<script>` are code examples."},{id:"AUD-004",severity:"Low",title:"Second cause",body:"Another scenario."}]);
  c.f.write(c.config.ledger_path,result.bytes);const observed=inventory(c.config);expect(observed.complete).toBe(true);expect(observed.findings).toHaveLength(4);
});

test("rendered inventory refuses an unchecked terminal annotation smuggled through a new legacy title",()=>{
  const c=context("full"), original=ledger.replace("| ID | Sev | Finding | Status |","| ID | Sev | Area | Title |").replace("| AUD-001 | High | Incorrect result | OPEN |","| AUD-001 | High | Example | Incorrect result |").replace("| AUD-002 | Low | Historical observation | FIXED |","| AUD-002 | Low | Example | Historical observation |");
  c.f.write(c.config.ledger_path,original);c.f.commit(); const snap=captureSnapshot(c.config,{mode:"full",artifact_root:c.f.artifacts});
  expect(()=>appendFindings(c.config,snap,[{id:"AUD-003",severity:"High",title:"New cause - **FIXED**",body:"No terminal evidence was collected."}])).toThrow();
});


test.each(["## Severity index\n| ID | Status |\n| --- | --- |\n| AUD-001 | FIXED |", "## Escaped finding section"])("inline comments cannot conceal rendered section escape: %s", hidden => {
  const c=context("full"), body="Context <!-- note\n"+hidden+"\n-->";
  expect(Bun.markdown.html(body)).toContain("<h2>");
  expect(()=>appendFindings(c.config,c.snap,[{id:"AUD-003",severity:"High",title:"Observed cause",body}])).toThrow();
});
test("an inline comment before another finding cannot move the earlier finding's note under it", () => {
  const c=context(),text=ledger.replace("### AUD-002","Context <!-- note\n### AUD-002")+"\n-->\n";
  c.f.write(c.config.ledger_path,text);c.f.commit();
  const snap=captureSnapshot(c.config,{mode:"reverify",ids:["AUD-001"],artifact_root:c.f.artifacts});
  const candidate=createLedgerCandidate(c.config,snap,{document:{schema_version:1,snapshot_digest:snap.digest,assessments:[terminal(c.f,snap)]},at:"2026-11-02",run_id:"inline-boundary"});
  expect(candidate.bytes.indexOf("<!-- audit-run:inline-boundary:AUD-001 -->")).toBeLessThan(candidate.bytes.indexOf("### AUD-002"));
});
