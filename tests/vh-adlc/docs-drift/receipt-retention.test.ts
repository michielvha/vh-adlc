import { afterAll, expect, test } from "bun:test";
import { createJournal, sealPlan, readRetainedPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest, manifestDigest, effectDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { fixture, bindings, hash } from "./manifest-fixture";
import { readdirSync, rmSync } from "node:fs";
import { publicationFixture } from "./publication-fixture";
import { retainSyntheticArtifact } from "./original-publication-fixture";
import { readPublicationAuthority } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-authority";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function receiptDeletionPlan() {
  const input = fixture(bindings, [{ id: "cleanup", kind: "receipt-retire", payload: { ref: "refs/heads/receipt", expected_object: "a".repeat(40) } }]);
  const options = { reviewed: validateReviewedManifest(input), grants: input.grants, publication_kind: "advisory" as const,
    context: "trial" as const, transport: "collector" as const, corrections: [], attention: [] };
  const component = { plugin_version: "0.25.0", source_commit: "a".repeat(40), component_sha256: hash("component") };
  return { options, component };
}

test("new version-two grants cannot seal a receipt-deletion operation", () => {
  const f = receiptDeletionPlan();
  expect(() => sealPlan({ ...f.options, schema_version: 2, policy_sha256: hash("policy"), component: f.component })).toThrow("receipt-retire");
});

test("new version-two retained input cannot smuggle a receipt-deletion operation", () => {
  const f = receiptDeletionPlan(), legacy = sealPlan({ ...f.options, adoption_sha256: hash("legacy") });
  const { adoption_sha256: _legacy, ...contents } = legacy;
  const value = { ...contents, schema_version: 2, policy_sha256: hash("policy"), component: f.component };
  expect(() => readRetainedPlan(canonicalJSON(value))).toThrow("receipt-retire");
});

test("version-one receipt-deletion records retain their read-only original bytes", () => {
  const f = receiptDeletionPlan(), legacy = sealPlan({ ...f.options, adoption_sha256: hash("legacy") }), bytes = canonicalJSON(legacy);
  expect(readRetainedPlan(bytes).schema_version).toBe(1);
  expect(canonicalJSON(readRetainedPlan(bytes))).toEqual(bytes);
});

test("receipt deletion cannot create a new version-two journal or resource record", () => {
  const f = publicationFixture(roots), selectedPlan = receiptDeletionPlan();
  const legacy = sealPlan({ ...selectedPlan.options, adoption_sha256: hash("legacy") });
  const { adoption_sha256: _legacy, ...contents } = legacy;
  const value = { ...contents, schema_version: 2 as const, policy_sha256: hash("policy"), component: selectedPlan.component };
  const before = readdirSync(f.artifacts);
  expect(() => createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: value })).toThrow("receipt-retire");
  expect(readdirSync(f.artifacts)).toEqual(before);
  expect(f.executed).toEqual([]);
});

test("new publication grants refuse receipt deletion while original records remain inspectable", () => {
  const f = publicationFixture(roots), plan = receiptDeletionPlan(), manifest = plan.options.reviewed.manifest;
  const request = retainSyntheticArtifact(f.artifacts, "owner-request.txt", Buffer.from("Synthetic explicit request for the unsupported receipt deletion."));
  const authority = retainSyntheticArtifact(f.artifacts, "authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority",
    manifest_sha256: manifestDigest(manifest), origin: { kind: "owner-request", artifact: request },
    effects: manifest.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
  expect(() => readPublicationAuthority({ source_repo: f.repo, artifact_root: f.artifacts, reference: authority, manifest })).toThrow("receipt-retire");
  expect(f.executed).toEqual([]);
});
