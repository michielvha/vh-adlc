import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBatch, renderRecord, type Definition } from "../../../plugins/vh-adlc/scripts/audit/batch";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git } from "./fixtures";
import { terminal } from "./evidence";
import { createLedgerCandidate } from "../../../plugins/vh-adlc/scripts/audit/ledger";
const projects: ReturnType<typeof fixture>[] = [];
function context(carry = false, allAssessment = false, priorLedger = false, checkNames = ["unit"]) {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root), base = git(f.root, "rev-parse", "HEAD");
  git(f.root, "update-ref", "refs/remotes/origin/main", base); git(f.root, "switch", "-qc", "fix/audit-batch");
  let taskBase = base, carried: Definition["carried"] = null;
  if (carry) {
    const snapshot = captureSnapshot(config, { mode: "reverify", ids: ["AUD-001", "AUD-002"], baseline: base, artifact_root: f.artifacts,
      required_checks: { "AUD-001": checkNames, "AUD-002": checkNames } });
    const document = { schema_version: 1, snapshot_digest: snapshot.digest, assessments: snapshot.selected_ids.map(id => terminal(f, snapshot, id)) };
    const candidate = createLedgerCandidate(config, snapshot, { document, at: "2026-11-02", run_id: "carried-ledger" });
    f.write(config.ledger_path, candidate.bytes); taskBase = f.commit("test: private ledger report");
    carried = { commit: taskBase, ids: snapshot.selected_ids, paths: [config.ledger_path], report_snapshot_digest: snapshot.digest,
      evidence_artifact: f.artifact("carried-report.json", JSON.stringify({ snapshot, document, candidate })) };
  }
  if (priorLedger) f.write(config.ledger_path, readFileSync(join(f.root, config.ledger_path), "utf8") + "\n### AUD-099 - Unapproved before freeze\nUnchecked source metadata.\n");
  // Actual disposable regression execution is retained separately by the model trial; these unit records are structural attestations.
  if (!allAssessment) f.write("src/app.ts", "export const answer = 43;\n"); const repaired = allAssessment ? taskBase : f.commit("test: authored fixture repair");
  const path = "docs/internal/maintenance/audit-A-test.md";
  const definition: Definition = { schema_version: 1, repository: config.repository, hostname: config.hostname, default_branch: "main", run_id: "batch-test", workstream: "A",
    scope_baseline: base, task_base: taskBase, source_target: repaired, ledger_path: config.ledger_path, record_path: path,
    affected_paths: ["src/app.ts", config.ledger_path, path], verification_inputs: ["src/app.ts"],
    members: ["AUD-001", "AUD-002"].map((id, i) => ({ id, disposition: i === 0 && !allAssessment ? "authored-repair" : "assessment-only", contract: "Existing documented return-value contract.", eligibility: "restoration", required_checks: checkNames, ...(i === 0 && !allAssessment ? { pre_fix: taskBase, repair_commit: repaired } : {}) })),
    carried };
  const sourceSnapshot = captureSnapshot(config, { mode: "fix", ids: ["AUD-001", "AUD-002"], baseline: base, artifact_root: f.artifacts, required_checks: { "AUD-001": checkNames, "AUD-002": checkNames } });
  const sourceRows = sourceSnapshot.selected_ids.map(id => terminal(f, sourceSnapshot, id));
  sourceRows[0].disposition = allAssessment ? "assessment-only" : "authored-repair";
  if (!allAssessment) sourceRows[0].red = { ...sourceRows[0].checks[0], commit: taskBase, exit_code: 1, artifact: f.artifact("source-red.txt") };
  const sourceDocument = { schema_version: 1, snapshot_digest: sourceSnapshot.digest, assessments: sourceRows };
  const candidate = createLedgerCandidate(config, sourceSnapshot, { document: sourceDocument, at: "2026-11-02", run_id: "batch-test", provisional: true });
  const provisional = { snapshot: sourceSnapshot, document: sourceDocument, candidate };
  f.write(path, renderRecord(definition)); f.write(config.ledger_path, candidate.bytes);
  const target = f.commit("test: finalize fixture ledger and record");
  const snapshot = captureSnapshot(config, { mode: "fix", ids: ["AUD-001", "AUD-002"], baseline: base, artifact_root: f.artifacts, required_checks: { "AUD-001": checkNames, "AUD-002": checkNames } });
  const rows = snapshot.selected_ids.map(id => terminal(f, snapshot, id)); rows[0].disposition = allAssessment ? "assessment-only" : "authored-repair";
  if (!allAssessment) rows[0].red = { ...rows[0].checks[0], commit: taskBase, exit_code: 1, artifact: f.artifact("red.txt") };
  rows[0].batch_review = { producer: "author", reviewer: "independent", result: "NO FINDINGS", source_commit: target, artifact: f.artifact("review.txt", "MODEL: claude-opus-5.5\nNO FINDINGS\n") };
  const input = { record_path: path, review_target: target, snapshot, provisional, document: { schema_version: 1, snapshot_digest: snapshot.digest, assessments: rows },
    selection: { ids: ["AUD-001", "AUD-002"], workstream: "A", carried },
    review: { target, producer: "author", reviewer: "independent", artifact: rows[0].batch_review.artifact, model: "claude-opus-5.5" } };
  return { f, config, definition, input, base, target, path };
}
function retarget(c: ReturnType<typeof context>) {
  const target = git(c.f.root, "rev-parse", "HEAD"), previous = c.input.document.assessments;
  const snapshot = captureSnapshot(c.config, { mode: "fix", ids: ["AUD-001", "AUD-002"], baseline: c.base, artifact_root: c.f.artifacts, required_checks: { "AUD-001": ["unit"], "AUD-002": ["unit"] } });
  const rows = snapshot.selected_ids.map(id => terminal(c.f, snapshot, id));
  rows.forEach((row, i) => { row.disposition = previous[i].disposition; if (row.disposition === "authored-repair") {
    row.red = previous[i].red; row.batch_review = { ...previous[i].batch_review!, source_commit: target };
  } });
  c.input.review_target = target; c.input.review.target = target; c.input.snapshot = snapshot;
  c.input.document = { schema_version: 1, snapshot_digest: snapshot.digest, assessments: rows };
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

test("a caller cannot use another remote branch as default scope, or hide deleted finding content in metadata", () => {
  const c = context();
  git(c.f.root, "update-ref", "refs/remotes/origin/main", c.target);
  git(c.f.root, "update-ref", "refs/remotes/origin/old-feature", c.base);
  expect(checkBatch(c.config, c.input).pass).toBe(false);
});
test("re-reviewed ledger metadata still cannot delete pre-existing finding prose or IDs", () => {
  const c = context(), text = readFileSync(join(c.f.root, "docs/audit.md"), "utf8");
  c.f.write("docs/audit.md", text.replace("The return value needs a current check.\n", "")); c.f.commit(); retarget(c);
  expect(checkBatch(c.config, c.input).pass).toBe(false);
});
test("all-assessment work produces no empty repair publication", () => {
  const c = context(false, true);
  const result = checkBatch(c.config, c.input); expect(result.pass).toBe(true); expect(result.publish_repair).toBe(false);
});

test("a carried report is reviewed from its default ancestor and requires exact owner inclusion and all original evidence", () => {
  const c = context(true); expect(checkBatch(c.config, c.input).pass).toBe(true);
  c.input.selection.carried = null; expect(checkBatch(c.config, c.input).pass).toBe(false);
});
test("an omitted carried ID or missing member challenge cannot hide behind a structurally valid artifact digest", () => {
  for (const kind of ["id", "challenge"]) {
    const c = context(true), carried = c.definition.carried!;
    const proof = JSON.parse(readFileSync(join(c.f.artifacts, carried.evidence_artifact.path), "utf8"));
    if (kind === "id") proof.document.assessments.pop(); else proof.document.assessments[0].challenge = null;
    carried.evidence_artifact = c.f.artifact("carried-bad.json", JSON.stringify(proof));
    c.input.selection.carried = structuredClone(carried); c.f.write(c.path, renderRecord(c.definition)); c.f.commit(); retarget(c);
    expect(checkBatch(c.config, c.input).pass).toBe(false);
  }
});

test.each(["pre-fix-ledger-source", "missing-ledger-source", "placeholder-ledger-source", "contradictory-verdict", "unchecked-new-id"])("a freshly re-reviewed %s cannot bypass frozen provisional ledger binding", kind => {
  const c = context(); let bytes = readFileSync(join(c.f.root, c.config.ledger_path), "utf8");
  if (kind === "pre-fix-ledger-source") bytes = bytes.replaceAll("Verified source: " + c.definition.source_target, "Verified source: " + c.base);
  if (kind === "missing-ledger-source") bytes = bytes.replace(/^Verified source: .*\n/gm, "");
  if (kind === "placeholder-ledger-source") bytes = bytes.replaceAll("Verified source: " + c.definition.source_target, "Verified source: PLACEHOLDER");
  if (kind === "contradictory-verdict") bytes = bytes.replace(/(\| AUD-001 \| High \| Incorrect result \| )[^|]+/, "$1MOOT ");
  if (kind === "unchecked-new-id") bytes += "\n### AUD-099 - Unchecked finding\nAn unassessed new root cause.\n";
  c.f.write(c.config.ledger_path, bytes); c.f.commit(); retarget(c);
  expect(checkBatch(c.config, c.input).pass).toBe(false);
});

test("an unchecked ledger edit hidden before frozen source cannot become a checked candidate baseline", () => {
  const c = context(false, false, true); expect(checkBatch(c.config, c.input).pass).toBe(false);
});

test("a verbatim clean review may separate its model header and records with a blank line, without admitting other content", () => {
  const c = context(); c.input.review.artifact = c.f.artifact("blank-separated-review.txt", "MODEL: claude-opus-5.5\n\nNO FINDINGS\n");
  expect(checkBatch(c.config, c.input).pass).toBe(true);
  c.input.review.artifact = c.f.artifact("review-footer.txt", "MODEL: claude-opus-5.5\nNO FINDINGS\nAn extra claim.\n"); expect(checkBatch(c.config, c.input).pass).toBe(false);
});

test("even an all-assessment terminal batch must declare nonempty per-member final checks", () => {
  const c = context(false, true, false, []); expect(checkBatch(c.config, c.input).pass).toBe(false);
});
