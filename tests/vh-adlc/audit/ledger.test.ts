import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLedgerCandidate, validateLedgerCandidate, applyLedgerCandidate, cleanupOwnedLedger, appendFindings } from "../../../plugins/vh-adlc/scripts/audit/ledger";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
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
