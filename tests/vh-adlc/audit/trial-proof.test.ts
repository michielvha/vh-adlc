import { expect, test } from "bun:test";
import { gradeTrial, type ExpectedTrial } from "./trial-proof";
const expected: ExpectedTrial = { target: "a".repeat(40), payload_digest: "b".repeat(64), cases: [{ id: "AUD-001", verdict: "PARTIAL", eligible: false, next: "report-residual", evidence: [{ path: "source.ts", line: 2 }] }], routes: [{ id: "scope", operation: "clarify", mode: null }] };
const response = () => ({ source_commit: expected.target, payload_digest: expected.payload_digest, cases: [{ id: "AUD-001", verdict: "PARTIAL", eligible: false, next: "report-residual", reason: "The second surface still reproduces.", evidence: [{ path: "source.ts", line: 2 }] }], routes: [{ id: "scope", operation: "clarify", mode: null }], limits: { synthetic: true, live_compatible: false, published: false, executed_actions: [] } });
const proof = () => ({ exit_code: 0, timed_out: false, reaped: true, models: ["claude-opus-5.5"], tool_contract_pass: true, source_preserved: true, input_preserved: true, transcript_sha256: "c".repeat(64), requested_model: "claude-opus-5.5" });
test("semantic grades require correct whole-scenario outcomes and real native provenance supplied by the operator", () => { expect(gradeTrial(response(), expected, { "source.ts": "first\nsecond\n" }, proof()).pass).toBe(true); });
test.each(["wrong-verdict", "eligible", "missing-member", "duplicate", "wrong-source", "wrong-payload", "missing-evidence", "wrong-line", "wrong-route", "missing-route", "live-claim", "executed", "wrong-model", "native-failure", "timeout", "unreaped", "tools", "drift", "input-drift", "no-transcript"])("%s cannot be accepted as an audit model trial", kind => {
  const r = response(), p = proof();
  if (kind === "wrong-verdict") r.cases[0].verdict = "FIXED";
  if (kind === "eligible") r.cases[0].eligible = true;
  if (kind === "missing-member") r.cases = [];
  if (kind === "duplicate") r.cases.push(r.cases[0]);
  if (kind === "wrong-source") r.source_commit = "0".repeat(40);
  if (kind === "wrong-payload") r.payload_digest = "0".repeat(64);
  if (kind === "missing-evidence") r.cases[0].evidence = [];
  if (kind === "wrong-line") r.cases[0].evidence[0].line = 1;
  if (kind === "wrong-route") r.routes[0].operation = "audit";
  if (kind === "missing-route") r.routes = [];
  if (kind === "live-claim") r.limits.live_compatible = true;
  if (kind === "executed") (r.limits.executed_actions as unknown[]).push("merge");
  if (kind === "wrong-model") p.models = ["other"];
  if (kind === "native-failure") p.exit_code = 1;
  if (kind === "timeout") p.timed_out = true;
  if (kind === "unreaped") p.reaped = false;
  if (kind === "tools") p.tool_contract_pass = false;
  if (kind === "drift") p.source_preserved = false;
  if (kind === "input-drift") p.input_preserved = false;
  if (kind === "no-transcript") p.transcript_sha256 = "";
  expect(gradeTrial(r, expected, { "source.ts": "first\nsecond\n" }, p).pass).toBe(false);
});

test("citations may include supplied canonical policy as well as the required scenario", () => {
  const r = response(); r.cases[0].evidence.push({ path: "policy.md", line: 1 });
  expect(gradeTrial(r, expected, { "source.ts": "first\nsecond\n", "policy.md": "Retain sibling residuals.\n" }, proof()).pass).toBe(true);
});
