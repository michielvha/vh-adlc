import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBatch, renderRecord, type Definition } from "../../../plugins/vh-adlc/scripts/audit/batch";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git } from "./fixtures";
import { terminal } from "./evidence";
const projects: ReturnType<typeof fixture>[] = [];
function context() {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root), base = git(f.root, "rev-parse", "HEAD");
  git(f.root, "update-ref", "refs/remotes/origin/main", base); git(f.root, "switch", "-qc", "fix/audit-batch");
  // Actual disposable regression execution is retained separately by the model trial; these unit records are structural attestations.
  f.write("src/app.ts", "export const answer = 43;\n"); const repaired = f.commit("test: authored fixture repair");
  const path = "docs/internal/maintenance/audit-A-test.md";
  const definition: Definition = { schema_version: 1, repository: config.repository, hostname: config.hostname, run_id: "batch-test", workstream: "A",
    scope_baseline: base, task_base: base, source_target: repaired, ledger_path: config.ledger_path, record_path: path,
    affected_paths: ["src/app.ts", config.ledger_path, path], verification_inputs: ["src/app.ts"],
    members: ["AUD-001", "AUD-002"].map((id, i) => ({ id, disposition: i === 0 ? "authored-repair" : "assessment-only", contract: "Existing documented return-value contract.", eligibility: "restoration", required_checks: ["unit"], ...(i === 0 ? { pre_fix: base, repair_commit: repaired } : {}) })),
    carried: null };
  f.write(path, renderRecord(definition)); f.write("docs/audit.md", readFileSync(join(f.root, "docs/audit.md"), "utf8") + "\nVerified source: " + repaired + "\n");
  const target = f.commit("test: finalize fixture ledger and record");
  const snapshot = captureSnapshot(config, { mode: "fix", ids: ["AUD-001", "AUD-002"], baseline: base, artifact_root: f.artifacts, required_checks: { "AUD-001": ["unit"], "AUD-002": ["unit"] } });
  const rows = snapshot.selected_ids.map(id => terminal(f, snapshot, id)); rows[0].disposition = "authored-repair";
  rows[0].red = { ...rows[0].checks[0], commit: base, exit_code: 1, artifact: f.artifact("red.txt") };
  rows[0].batch_review = { producer: "author", reviewer: "independent", result: "NO FINDINGS", source_commit: target, artifact: f.artifact("review.txt", "MODEL: claude-opus-5.5\nNO FINDINGS\n") };
  const input = { record_path: path, review_target: target, snapshot, document: { schema_version: 1, snapshot_digest: snapshot.digest, assessments: rows },
    selection: { ids: ["AUD-001", "AUD-002"], workstream: "A", carried: null },
    review: { target, producer: "author", reviewer: "independent", artifact: rows[0].batch_review.artifact, model: "claude-opus-5.5" } };
  return { f, config, definition, input, base, target, path };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
test("a fully covered mixed batch checks the full scope and frozen source without SHA self-reference", () => {
  const c = context(), result = checkBatch(c.config, c.input);
  expect(result.pass).toBe(true); expect(result.publication_base).toBe(c.base); expect(result.repair_batch).toBe(true);
});
test.each(["missing-member", "missing-contract", "missing-challenge", "one-check-only", "unresolved", "new-contract", "wrong-review", "changed-ledger", "changed-definition", "source-after-freeze", "pre-fix-source"])("%s blocks whole batch completion", kind => {
  const c = context();
  if (kind === "missing-member") c.input.document.assessments.pop();
  if (kind === "missing-challenge") c.input.document.assessments[1].challenge = null;
  if (kind === "one-check-only") c.input.document.assessments[0].checks = [];
  if (kind === "unresolved") { c.input.document.assessments[1].verdict = "UNKNOWN"; c.input.document.assessments[1].residuals = ["Cannot reproduce under available access."]; }
  if (kind === "wrong-review") c.input.review.target = c.base;
  if (kind === "changed-ledger") { c.f.write("docs/audit.md", "Rewritten ledger\n"); c.f.commit(); }
  if (["missing-contract", "new-contract", "changed-definition", "pre-fix-source"].includes(kind)) {
    if (kind === "missing-contract") c.definition.members[0].contract = "";
    if (kind === "new-contract") c.definition.members[0].eligibility = "feature-required";
    if (kind === "changed-definition") c.definition.members.pop();
    if (kind === "pre-fix-source") c.definition.source_target = c.base;
    c.f.write(c.path, renderRecord(c.definition)); c.f.commit();
  }
  if (kind === "source-after-freeze") { c.f.write("src/app.ts", "export const answer = 44;\n"); c.f.commit(); }
  expect(checkBatch(c.config, c.input).pass).toBe(false);
});
test("append-only record evidence/review/state bookkeeping preserves freshness but rewriting evidence does not", () => {
  const c = context(), record = readFileSync(join(c.f.root, c.path), "utf8");
  c.f.write(c.path, record + "\nObserved final review outcome.\n"); c.f.commit("test: append state evidence");
  expect(checkBatch(c.config, c.input).pass).toBe(true);
  c.f.write(c.path, record.replace("review pending", "rewritten history")); c.f.commit();
  expect(checkBatch(c.config, c.input).pass).toBe(false);
});
test("scope baseline survives a squash while the discarded pre-squash source target is not used as the delta baseline", () => {
  const c = context(); git(c.f.root, "switch", "-q", "main"); git(c.f.root, "merge", "--squash", "fix/audit-batch"); const squash = c.f.commit("test: squash batch");
  git(c.f.root, "branch", "-D", "fix/audit-batch"); // Disposable fixture only, to simulate hosted squash branch deletion.
  const snap = captureSnapshot(loadSettings(c.f.root), { mode: "reverify", artifact_root: c.f.artifacts, baseline: c.base });
  expect(snap.history.status).toBe("scoped"); expect(snap.source.commit).toBe(squash);
  expect(captureSnapshot(loadSettings(c.f.root), { mode: "reverify", artifact_root: c.f.artifacts, baseline: c.target }).history.status).toBe("unscoped");
});
