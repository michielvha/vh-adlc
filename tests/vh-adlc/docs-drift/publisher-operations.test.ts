import { expect, test } from "bun:test";
import { parseActionManifest, manifestDigest, effectDigest, validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { validatePublicationShape } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { sealPlan, readVerifiedPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { fixture, evidence, hash, role } from "./manifest-fixture";
import { settingsFixture } from "./settings-fixture";

function settings() {
  const raw = settingsFixture();
  return parseSettings({ ...raw, publication: { ...raw.publication,
    entry_actors: { hosted: "fixture-bot", copilot: "fixture-owner", claude: "fixture-owner" } },
    pr_discovery: { ...raw.pr_discovery, authors: ["fixture-bot", "fixture-owner"] } });
}

function manifest() {
  return { ...fixture().manifest, publisher_entry: "copilot" as const, actor: "Fixture-Owner", actor_id: 30, effects: [
    { id: "lease", kind: "lease-acquire" as const, payload: { ref: settings().publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain" as const, payload: { ref: settings().publication.receipt_ref_prefix + "operation-1" } },
    { id: "candidate", kind: "push" as const, payload: { ref: "refs/heads/docs-drift/one", head: fixture().manifest.bindings.candidate_commit } },
    { id: "release", kind: "lease-release" as const, payload: { ref: settings().publication.lease_ref } },
  ] };
}

test("an operation binds its original publisher entry before independent review", () => {
  const original = manifest(), parsed = parseActionManifest(original);
  expect(parsed).toHaveProperty("publisher_entry", "copilot");
  expect(manifestDigest(parsed)).not.toBe(manifestDigest(parseActionManifest({ ...original, publisher_entry: "claude" })));
  expect(parseActionManifest(fixture().manifest)).not.toHaveProperty("publisher_entry");
});

test.each([null, "unknown", 1])("a malformed original publisher entry %j is refused", publisher_entry => {
  expect(() => parseActionManifest({ ...manifest(), publisher_entry })).toThrow();
});

test("mapped publication shape binds the original entry selector", () => {
  const original = manifest();
  expect(() => validatePublicationShape({ manifest: original, context: "trial", publication_kind: "advisory" }, settings(), true)).not.toThrow();
  expect(parseActionManifest(original).actor).toBe("Fixture-Owner");
  expect(() => validatePublicationShape({ manifest: { ...original, publisher_entry: "hosted" }, context: "trial", publication_kind: "advisory" }, settings(), true)).toThrow();
  const { publisher_entry, ...unselected } = original;
  expect(() => validatePublicationShape({ manifest: unselected, context: "trial", publication_kind: "advisory" }, settings(), true)).toThrow();
});


test("recovery policy must bind the original entry even when two entries share one account", () => {
  const input = fixture();
  input.manifest = parseActionManifest(manifest());
  input.current = structuredClone(input.manifest);
  input.reviewer = evidence("reviewer", manifestDigest(input.manifest), "NO FINDINGS\n");
  input.grants = input.manifest.effects.map(effect => ({ manifest_sha256: manifestDigest(input.manifest), effect_id: effect.id,
    effect_sha256: effectDigest([effect]) }));
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: hash("adoption"),
    context: "trial", transport: "collector", publication_kind: "advisory", corrections: [], attention: [] });
  const policy = { adoption_sha256: plan.adoption_sha256, context: plan.context, transport: plan.transport,
    publication_kind: plan.publication_kind, pr_draft: true, worker: role, reviewer: role, publisher_entry: "copilot" as const };
  expect(readVerifiedPlan(canonicalJSON(plan), () => policy).manifest.publisher_entry).toBe("copilot");
  expect(() => readVerifiedPlan(canonicalJSON(plan), () => ({ ...policy, publisher_entry: "claude" }))).toThrow("publisher entry");
  const { publisher_entry, ...unselected } = policy;
  expect(() => readVerifiedPlan(canonicalJSON(plan), () => unselected)).toThrow("publisher entry");
});
