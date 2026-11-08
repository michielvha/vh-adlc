import { afterAll, expect, test } from "bun:test";
import { chmodSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readAppliedDelivery, readBefore, retainBefore, type BeforeData } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof";
import { createJournal, sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture } from "./publication-fixture";
import { fixture, hash } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
type MutableBaseline = { data: {
  label_ids: unknown; source: unknown; requests_sha256: unknown;
  creation: { surface: unknown; marker_ids: unknown };
  identity: { actor_id: unknown; repository_id: unknown };
  [key: string]: unknown;
} };

async function baseline() {
  const f = publicationFixture(roots), effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
  const scope = { artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect, attempt_id: "fixture-baseline" };
  // These are schema fixtures. Positive application tests use the actual native executor.
  const data: BeforeData = { hostname: f.settings.hostname, identity: await f.transport.identity(), source: null,
    label_ids: [101], original_label_ids: null, creation: { surface: "pulls", inventory_sha256: hash("fixture inventory"), marker_ids: [] },
    requests_sha256: hash("fixture reads") };
  return { f, scope, data };
}

test("baseline schema retains bounded private facts with exact attempt and transport bindings", async () => {
  const { scope, data } = await baseline(), evidence = retainBefore({ ...scope, data });
  expect(readBefore({ ...scope, evidence })).toEqual(data);
  expect(statSync(evidence.path).mode & 0o777).toBe(0o600);
  expect(() => readBefore({ ...scope, attempt_id: "other-attempt", evidence })).toThrow();
  expect(() => readBefore({ ...scope, plan: { ...scope.plan, transport: "native" }, evidence })).toThrow();
  expect(() => readBefore({ ...scope, plan: { ...scope.plan, context: "production" }, evidence })).toThrow();
  const original = readFileSync(evidence.path);
  writeFileSync(evidence.path, "{}");
  expect(() => readBefore({ ...scope, evidence })).toThrow();
  writeFileSync(evidence.path, original);
  chmodSync(evidence.path, 0o644);
  expect(() => readBefore({ ...scope, evidence })).toThrow();
  chmodSync(evidence.path, 0o600);
});

test("baseline reader rejects rehashed unsupported fields, source shapes and creation scopes", async () => {
  const { scope, data } = await baseline(), evidence = retainBefore({ ...scope, data });
  const original = readFileSync(evidence.path);
  const invalid = [
    (value: MutableBaseline) => { value.data.secret_header = "excluded-canary"; },
    (value: MutableBaseline) => { value.data.label_ids = [101, 101]; },
    (value: MutableBaseline) => { value.data.label_ids = [0]; },
    (value: MutableBaseline) => { value.data.creation.surface = "issues"; },
    (value: MutableBaseline) => { value.data.creation.marker_ids = [2, 1]; },
    (value: MutableBaseline) => { value.data.identity.actor_id = 21; },
    (value: MutableBaseline) => { value.data.identity.repository_id = 11; },
    (value: MutableBaseline) => { value.data.source = {}; },
    (value: MutableBaseline) => { value.data.requests_sha256 = "not-a-digest"; },
  ];
  for (const change of invalid) {
    const value = JSON.parse(original.toString()) as MutableBaseline; change(value);
    const bytes = canonicalJSON(value); writeFileSync(evidence.path, bytes);
    expect(() => readBefore({ ...scope, evidence: { path: evidence.path, sha256: sha256(bytes) } })).toThrow();
  }
  writeFileSync(evidence.path, original);
  expect(() => retainBefore({ ...scope, data: { ...data, secret_header: "excluded-canary" } as BeforeData })).toThrow();
});

for (const kind of ["push", "branch-refresh", "lease-acquire", "receipt-retain", "lease-release"] as const) {
test(`application acknowledgement proof refuses ${kind} independently`, () => {
  const f = publicationFixture(roots);
  const effect: Effect = kind === "branch-refresh" ? { id: "refresh", kind, payload: { number: 77,
    ref: "refs/heads/docs-drift/one", head: f.input.manifest.bindings.candidate_commit, expected_head: "e".repeat(40) } }
    : f.plan.manifest.effects.find(item => item.kind === kind)!;
  const input = fixture(f.input.manifest.bindings, [effect]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...f.policy, corrections: [], attention: [] });
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
  expect(() => readAppliedDelivery({ source_repo: f.repo, journal_directory: journal.directory,
    effect_id: effect.id, settings: f.settings })).toThrow("delivery-kind-ineligible");
});
}

test("a collector baseline cannot supply native application proof", async () => {
  const { f, scope } = await baseline();
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  expect(() => readAppliedDelivery({ source_repo: f.repo, journal_directory: journal.directory,
    effect_id: scope.effect.id, settings: f.settings })).toThrow("native-delivery-proof-required");
});
