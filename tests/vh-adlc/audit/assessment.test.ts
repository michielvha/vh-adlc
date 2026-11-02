import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateAssessments } from "../../../plugins/vh-adlc/scripts/audit/assessment";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, ledger } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
function context() {
  const f = fixture(); projects.push(f);
  const config = loadSettings(f.root), snap = captureSnapshot(config, {
    mode: "reverify", ids: ["AUD-001"], artifact_root: f.artifacts, required_checks: { "AUD-001": ["unit"] },
  });
  const record = {
    id: "AUD-001", disposition: "assessment-only", verdict: "FIXED", reason: "The original scenario was reassessed.",
    evidence: [{ path: "src/app.ts", sha256: createHash("sha256").update(readFileSync(join(f.root, "src/app.ts"))).digest("hex"),
      symbol: "answer", scenario: "The documented return-value failure was checked.", commit: snap.source.commit }],
    checks: [{ name: "unit", argv: ["fixture-check", "unit"], exit_code: 0, commit: snap.source.commit, artifact: f.artifact("unit.txt") }],
    residuals: [] as string[],
    challenge: { producer: "first-pass", reviewer: "independent-check", result: "supports-verdict",
      id: "AUD-001", source_commit: snap.source.commit, artifact: f.artifact("challenge.txt") },
  };
  const document = () => ({ schema_version: 1, snapshot_digest: snap.digest, assessments: [structuredClone(record)] });
  return { f, config, snap, record, document };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("target-bound terminal assessments require all declared checks and independent challenge artifacts", () => {
  const c = context(), result = evaluateAssessments(c.config, c.snap, c.document());
  expect(result.pass).toBe(true);
  expect(result.eligible_ids).toEqual(["AUD-001"]);
  expect(result.limit).toContain("attestations");
});

test.each(["challenge", "self-challenge", "wrong-member", "check", "failed-check", "source", "artifact", "snapshot", "coverage", "duplicate"])(
  "missing, contradictory or changed %s cannot yield an eligible terminal update", kind => {
    const c = context(), doc = c.document(), row = doc.assessments[0];
    if (kind === "challenge") row.challenge = null as never;
    if (kind === "self-challenge") row.challenge.reviewer = row.challenge.producer;
    if (kind === "wrong-member") row.challenge.id = "AUD-002";
    if (kind === "check") row.checks = [];
    if (kind === "failed-check") row.checks[0].exit_code = 1;
    if (kind === "source") row.evidence[0].sha256 = "0".repeat(64);
    if (kind === "artifact") writeFileSync(join(c.f.artifacts, "unit.txt"), "changed observation\n");
    if (kind === "snapshot") doc.snapshot_digest = "0".repeat(64);
    if (kind === "coverage") doc.assessments = [];
    if (kind === "duplicate") doc.assessments.push(structuredClone(row));
    const result = evaluateAssessments(c.config, c.snap, doc);
    expect(result.pass).toBe(false);
    expect(result.eligible_ids).not.toContain("AUD-001");
  },
);

test("a dirty or malformed target remains ineligible even with otherwise populated proof fields", () => {
  for (const kind of ["dirty", "index-only"]) {
    const c = context();
    if (kind === "dirty") c.f.write("src/dirty.ts", "uncommitted source\n");
    else c.f.write("docs/audit.md", ledger.slice(0, ledger.indexOf("### AUD-001")));
    const snap = captureSnapshot(c.config, { mode: "reverify", ids: ["AUD-001"], artifact_root: c.f.artifacts, required_checks: { "AUD-001": ["unit"] } });
    const doc = c.document(); doc.snapshot_digest = snap.digest;
    const result = evaluateAssessments(c.config, snap, doc);
    expect(result.pass).toBe(false);
    expect(result.eligible_ids).toEqual([]);
  }
});

test("an UNKNOWN assessment preserves its stated gap and cannot be represented as complete closure", () => {
  const c = context(), doc = c.document();
  doc.assessments[0].verdict = "UNKNOWN"; doc.assessments[0].reason = "Required live access is unavailable.";
  doc.assessments[0].residuals = ["Live access unavailable."]; doc.assessments[0].checks = [];
  const result = evaluateAssessments(c.config, c.snap, doc);
  expect(result.coverage).toBe("incomplete");
  expect(result.eligible_ids).toEqual([]);
});

test("an authored repair cannot borrow a reassessment proof and requires real red and current batch review records", () => {
  const c = context(), doc = c.document(); doc.assessments[0].disposition = "authored-repair";
  const result = evaluateAssessments(c.config, c.snap, doc);
  expect(result.pass).toBe(false);
  expect(result.eligible_ids).toEqual([]);
});
