import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLedgerCandidate, validateLedgerCandidate, applyLedgerCandidate, cleanupOwnedLedger } from "../../../plugins/vh-adlc/scripts/audit/ledger";
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
