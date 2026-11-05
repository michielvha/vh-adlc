import { expect, test } from "bun:test";
import { reconcileSecurity, evidenceBinding } from "../../../plugins/vh-adlc/scripts/maintenance/security";
import { securityInput, decision, proof } from "./security-fixtures";

test("orphan findings block accounting; a concrete assignment handoff accounts for open work", () => {
  const input = securityInput();
  expect(reconcileSecurity(input)).toMatchObject({ accounting_state: "pending", open_remediation_count: 1, all_clear: false });
  input.decisions.push(decision(input)); input.evidence.push(proof(input, "tracking", "accessible"));
  expect(reconcileSecurity(input)).toMatchObject({ accounting_state: "reconciled", open_remediation_count: 1, all_clear: false });
});
test.each([["major", "feature"], ["compatible-authored", "bounded-maintenance"], ["compatible-bot", "bot-batch"], ["unknown", "investigation"], ["posture", "consumer-policy"], ["audit", "audit-reference"]])("%s uses existing %s route without selecting work", (change, route) => {
  const input = securityInput(); input.decisions.push({ ...decision(input), change }); input.evidence.push(proof(input, "tracking", "accessible"));
  expect(reconcileSecurity(input).findings[0]).toMatchObject({ route, selected: false });
});
test("a provider fixed state, merged PR or check alone cannot establish a fixed target", () => {
  const input = securityInput(); input.decisions.push({ ...decision(input), outcome: "fixed" }); input.evidence.push(proof(input, "tracking", "accessible"), proof(input, "check", "pass"));
  input.observations[0].provider_state = "fixed";
  expect(reconcileSecurity(input).findings[0].remediation).toBe("unknown");
  input.evidence.push(proof(input, "source", "corrected"), proof(input, "scan", "absent"));
  expect(reconcileSecurity(input).findings[0].remediation).toBe("fixed-verified");
  input.evidence.at(-1)!.synthetic = true;
  expect(reconcileSecurity(input).findings[0].remediation).toBe("unknown");
});
test("dismissal does not become accepted risk, and policy changes/expiry invalidate approval", () => {
  const input = securityInput(); input.observations[0].provider_state = "dismissed";
  input.decisions.push({ ...decision(input), outcome: "exception", exception: { kind: "risk-accepted", rationale: "local decision", expires_at: "2026-12-01T00:00:00Z" } });
  input.evidence.push(proof(input, "tracking", "accessible"));
  expect(reconcileSecurity(input).findings[0].exception).toBeNull();
  input.evidence.push(proof(input, "authority", "approved"));
  expect(reconcileSecurity(input).findings[0].exception?.kind).toBe("risk-accepted");
  input.evaluated_at = "2026-12-02T00:00:00Z";
  expect(reconcileSecurity(input).findings[0].exception).toBeNull();
  input.evaluated_at = "2026-11-05T12:00:00Z"; input.policy[0].digest = "f".repeat(64);
  expect(reconcileSecurity(input).findings[0].exception).toBeNull();
});
test("coverage handoffs account for unknown surfaces without inventing a zero or all-clear", () => {
  const input = securityInput(); input.observations = [];
  input.coverage[0].status = "incomplete"; input.coverage[0].count = null; input.coverage[0].reason = "denied";
  expect(reconcileSecurity(input).accounting_state).toBe("pending");
  input.coverage[0].handoff = { reference: "local:coverage", next_action: "check access", owner: "owner", assignment_handoff: null };
  expect(reconcileSecurity(input)).toMatchObject({ accounting_state: "reconciled", coverage_state: "incomplete", all_clear: false });
});
test("wrong target, source/policy binding, incomplete evidence or future receipts cannot close a finding", () => {
  for (const mutate of [
    (e: ReturnType<typeof proof>) => { e.target.reference = "b".repeat(40); },
    (e: ReturnType<typeof proof>) => { e.binding = "f".repeat(64); },
    (e: ReturnType<typeof proof>) => { e.complete = false; },
    (e: ReturnType<typeof proof>) => { e.observed_at = "2027-01-01T00:00:00Z"; },
  ]) {
    const input = securityInput(); input.decisions.push({ ...decision(input), outcome: "fixed" });
    input.evidence.push(proof(input, "source", "corrected"), proof(input, "check", "pass"), proof(input, "scan", "absent")); mutate(input.evidence[2]);
    expect(reconcileSecurity(input).findings[0].remediation).toBe("unknown");
  }
});
test("an immutable successor is verified separately; only evidenced authorized retirement ends the old obligation", () => {
  const input = securityInput(), target = { kind: "image", reference: "sha256:" + "a".repeat(64), platform: "linux/amd64" };
  input.observations[0].target = target;
  const successor = { ...target, reference: "sha256:" + "b".repeat(64) };
  input.decisions.push({ ...decision(input), outcome: "retired", successor });
  input.evidence.push(proof(input, "tracking", "accessible"));
  for (const [kind,result] of [["source","corrected"],["check","pass"],["scan","absent"]]) input.evidence.push(proof(input, kind, result, successor));
  expect(reconcileSecurity(input).findings[0].target_lifecycle).toBe("superseded-pending");
  input.evidence.push(proof(input,"authority","approved"),proof(input,"retirement","inactive"));
  expect(reconcileSecurity(input).findings[0]).toMatchObject({ target_lifecycle: "retired-verified", remediation: "open" });
  expect(reconcileSecurity(input).open_remediation_count).toBe(0);
  input.observations[0].reactivated = true;
  expect(reconcileSecurity(input).findings[0].target_lifecycle).toBe("active");
});
test("grouping requires explicit equivalent source evidence and retains divergent occurrence outcomes", () => {
  const input = securityInput(); input.scope.repositories.push("example/satellite");
  const other = { ...structuredClone(input.observations[0]), repository: "example/satellite", id: "github.com/example/satellite/dependabot:1" };
  input.observations.push(other);
  input.groups.push({ id: "canonical", source_repository: "example/project", source_path: "package-lock.json", occurrence_ids: input.observations.map(o=>o.id), evidence: "ownership" });
  expect(()=>reconcileSecurity(input)).toThrow("ownership");
  input.evidence.push({ ...proof(input,"ownership","equivalent"), id: "ownership" });
  expect(reconcileSecurity(input).findings).toHaveLength(2);
  input.observations[1].package = "different";
  expect(()=>reconcileSecurity(input)).toThrow("equivalence");
});
test("duplicates, unknown fields, unrequested routes and future schemas are rejected", () => {
  const input=securityInput(); input.observations.push(structuredClone(input.observations[0])); expect(()=>reconcileSecurity(input)).toThrow();
  expect(()=>reconcileSecurity({...securityInput(),schema_version:2})).toThrow();
  expect(()=>reconcileSecurity({...securityInput(),automerge:true})).toThrow();
  const selected=securityInput(); selected.decisions.push({...decision(selected),selected:true}); expect(()=>reconcileSecurity(selected)).toThrow();
});

test("a complete nonzero surface cannot silently lose its observations", () => {
  const input=securityInput(); input.observations=[];
  expect(reconcileSecurity(input)).toMatchObject({accounting_state:"pending",coverage_state:"incomplete",all_clear:false});
});
