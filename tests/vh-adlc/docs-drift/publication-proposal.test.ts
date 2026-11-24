import { expect, test } from "bun:test";

test.each(["pr", "issue", "null", "unknown-field", "unknown-payload", "authority", "unknown-kind"])("original publication proposals use a closed schema %s", async scenario => {
  const { parseWorkerPublication } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-proposal");
  expect(typeof parseWorkerPublication).toBe("function");
  const payload: Record<string, unknown> = scenario === "issue" ? { title: "Documentation finding", body: "Published analysis link", labels: [], prior_ids: [],
    evidence_repository: "fixture/docs", evidence_path: "docs/analysis.md", evidence_commit: "a".repeat(40), evidence_sha256: "b".repeat(64) }
    : { base: "main", branch: "docs-drift/fix", title: "Repair docs", body: "Exact original proposal\n", labels: ["documentation"], draft: false };
  const packet: Record<string, unknown> = { operation_id: "original-operation", proposal: { kind: scenario === "issue" ? "issue-create" : "pr-create", payload } };
  if (scenario === "unknown-field") packet.unknown = true;
  if (scenario === "unknown-payload") payload.unknown = true;
  if (scenario === "authority") payload.approved = true;
  if (scenario === "unknown-kind") (packet.proposal as { kind: string }).kind = "release";
  if (["pr", "issue"].includes(scenario)) {
    const parsed = parseWorkerPublication(packet); expect<unknown>(parsed).toEqual(packet);
    payload.body = "Later caller mutation"; expect(parsed?.proposal.payload.body).not.toBe(payload.body);
  } else if (scenario === "null") expect(parseWorkerPublication(null)).toBe(null);
  else expect(() => parseWorkerPublication(packet)).toThrow();
});

test("original refresh proposal retains the exact metadata preimage", async () => {
  const { parseWorkerPublication } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-proposal");
  const { canonicalDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol");
  const before = { title: "Previous title", body: "Previous body", labels: ["documentation"], draft: true };
  const packet = { operation_id: "refresh-operation", proposal: { kind: "pr-update", payload: { number: 17, expected_head: "a".repeat(40),
    expected_payload: before, expected_payload_sha256: canonicalDigest(before), title: "Reviewed new title", body: "Reviewed new body", labels: ["documentation"], draft: false } } };
  expect<unknown>(parseWorkerPublication(packet)).toEqual(packet);
  expect(() => parseWorkerPublication({ ...packet, proposal: { ...packet.proposal, payload: { ...packet.proposal.payload, expected_payload_sha256: "b".repeat(64) } } })).toThrow();
});
