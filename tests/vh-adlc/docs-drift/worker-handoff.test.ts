import { expect, test } from "bun:test";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const source = "a".repeat(40), target = sha256(Buffer.from("original worker input"));
function packet() { return { input_sha256: target, edits: [], publication: null }; }
const options = (value: unknown) => ({ source, input_sha256: target, max_entry_bytes: 524288, records: canonicalJSON(value).toString() });

test("original worker preparation stays compatible when no assessment was returned", async () => {
  const { parseWorkerHandoff } = await import("../../../plugins/vh-adlc/scripts/docs-drift/worker-handoff");
  const result = parseWorkerHandoff(options(packet()));
  expect(result.selection).toEqual({ schema_version: 1, source_commit: source, edits: [] });
  expect(result.publication).toBe(null); expect(result.assessment_reference).toBe(null);
});

test("an original worker can bind a separately retained source assessment without granting effects", async () => {
  const { parseWorkerHandoff } = await import("../../../plugins/vh-adlc/scripts/docs-drift/worker-handoff");
  const reference = { path: "assessment.json", sha256: sha256(Buffer.from("original assessment bytes")) };
  const result = parseWorkerHandoff(options({ ...packet(), assessment: reference }));
  expect(result.assessment_reference).toEqual(reference);
  expect(result.publication).toBe(null); expect(Object.hasOwn(result, "grants")).toBe(false);
});

test.each(["authority", "wrong-target", "reference-field", "reference-path", "reference-digest", "noncanonical-edit", "too-large"])("worker assessment handoff refuses unbound data: %s", async fault => {
  const { parseWorkerHandoff } = await import("../../../plugins/vh-adlc/scripts/docs-drift/worker-handoff");
  const reference: Record<string, unknown> = { path: "assessment.json", sha256: target };
  const value: Record<string, unknown> = { ...packet(), assessment: reference };
  if (fault === "authority") value.approved = true;
  if (fault === "wrong-target") value.input_sha256 = "b".repeat(64);
  if (fault === "reference-field") reference.approved = true;
  if (fault === "reference-path") reference.path = "../assessment.json";
  if (fault === "reference-digest") reference.sha256 = "not-a-digest";
  if (fault === "noncanonical-edit") value.edits = [{ id: "edit", approved: true }];
  const input = options(value); if (fault === "too-large") input.max_entry_bytes = 10;
  expect(() => parseWorkerHandoff(input)).toThrow();
});
