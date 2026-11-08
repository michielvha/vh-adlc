import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { executeAttempt, PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { resumeEffects, reconcileAbsent } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { retainLookup } from "../../../plugins/vh-adlc/scripts/docs-drift/observations";
import { chmodSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readAppliedDelivery, readBefore, retainBefore, type BeforeData } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof";
import { appendAcknowledgement, appendAttempt, appendIntent, appendOutcome, appendRecoveryOnly, createJournal, isObservationOnly, readJournal, sealPlan, type DeliveryAcknowledgement } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture, publicationOptions } from "./publication-fixture";
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

async function interruptedAcknowledgementFixture(reaped = true) {
  const f = publicationFixture(roots), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.id === "pr") throw new PublicationExecutionError(true, reaped);
  };
  const interrupted = await publish(publicationOptions(f)); f.transport.execute = execute;
  const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
  // Format-level fixture values do not assert that the real acknowledgement controller ran.
  const lookup = retainLookup({ artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect,
    transport: "collector", state: "conflict", lookup: { schema_fixture: "changed delivery" } });
  const grant = { kind: "owner-delivery-acknowledgement" as const, scope_sha256: hash("exact schema fixture scope"), request_sha256: hash("schema fixture owner request") };
  const acknowledgement = { ...grant, lookup, application_sha256: hash("schema fixture application"), settlement_sha256: hash("schema fixture settlement") };
  return { f, interrupted, effect, grant, acknowledgement };
}

test("acknowledgement journal schema is distinct, stops replay and rejects ordinary cleanup authority", async () => {
  const { f, interrupted, effect, grant, acknowledgement } = await interruptedAcknowledgementFixture();
  const journal = appendAcknowledgement(interrupted.journal, effect.id, acknowledgement);
  expect(readJournal(journal.directory, f.repo).events.at(-1)?.kind).toBe("acknowledged-delivery");
  expect(isObservationOnly(journal)).toBe(true);
  expect(() => appendAcknowledgement(journal, effect.id, acknowledgement)).toThrow();
  const observation = await f.transport.observe(f.plan, effect, interrupted.objects);
  if (observation.state !== "done") throw Error("missing restored fixture payload");
  expect(() => appendOutcome(journal, effect.id, observation.outcome)).toThrow();
  const ordinary = await resumeEffects({ ...publicationOptions(f), journal_directory: journal.directory });
  expect(ordinary.state).toBe("pending");
  expect(ordinary.reason).toBe("acknowledgement-cleanup-required");
  let granted = false;
  const generic = await reconcileAbsent({ source_repo: f.repo, journal_directory: journal.directory, object_store: f.store,
    settings: f.settings, transport: f.transport, retire_effect_ids: [], authorize: async () => { granted = true; return null; } });
  expect(generic.state).toBe("pending");
  expect(generic.reason).toBe("acknowledgement-cleanup-required");
  expect(granted).toBe(false);
  const release = f.plan.manifest.effects.at(-1)!;
  await expect(executeAttempt({ journal: readJournal(journal.directory, f.repo),
    effect: release, objects: interrupted.objects, transport: f.transport,
    reconciliation: { scope_sha256: grant.scope_sha256, request_sha256: grant.request_sha256 } })).rejects.toThrow();
  expect(f.executed.includes("release")).toBe(false);
  let ending = await executeAttempt({ journal: readJournal(journal.directory, f.repo), effect: release,
    objects: interrupted.objects, transport: f.transport, reconciliation: grant });
  const released = await f.transport.observe(f.plan, release, interrupted.objects);
  if (released.state !== "done") throw Error("missing fixture release");
  ending = appendOutcome(ending, release.id, released.outcome);
  const recovered = await resumeEffects({ ...publicationOptions(f), journal_directory: ending.directory });
  expect(recovered.state).toBe("acknowledged");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
});

for (const mode of ["generic-grant", "missing-request", "scope", "application", "settlement", "foreign-lookup", "relative-lookup", "extra"] as const) {
test(`acknowledgement schema rejects ${mode}`, async () => {
  const { f, interrupted, effect, acknowledgement } = await interruptedAcknowledgementFixture();
  const value = structuredClone(acknowledgement) as Record<string, unknown>;
  if (mode === "generic-grant") value.kind = "adopted-procedure";
  if (mode === "missing-request") delete value.request_sha256;
  if (mode === "scope") value.scope_sha256 = "invalid";
  if (mode === "application") value.application_sha256 = "invalid";
  if (mode === "settlement") value.settlement_sha256 = "invalid";
  if (mode === "foreign-lookup") value.lookup = { path: join(f.root, "foreign.json"), sha256: hash("foreign lookup") };
  if (mode === "relative-lookup") value.lookup = { path: "lookup.json", sha256: hash("relative lookup") };
  if (mode === "extra") value.raw_response = "excluded-canary";
  expect(() => appendAcknowledgement(interrupted.journal, effect.id, value as DeliveryAcknowledgement)).toThrow();
  expect(f.executed.includes("release")).toBe(false);
});
}

for (const mode of ["in-flight", "unreaped", "recovery-only"] as const) {
test(`acknowledgement schema refuses ${mode} original execution`, async () => {
  const { f, interrupted, effect, acknowledgement } = await interruptedAcknowledgementFixture(mode !== "unreaped");
  let journal = interrupted.journal;
  if (mode === "in-flight") journal = appendAttempt(journal, effect.id, "active-schema-attempt");
  if (mode === "recovery-only") journal = appendRecoveryOnly(journal, effect.id, "operation-started-elsewhere");
  expect(() => appendAcknowledgement(journal, effect.id, acknowledgement)).toThrow();
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
});
}

for (const replacement of [null, "f".repeat(40)]) {
test(`acknowledged recovery observes a lost release response without repeating deletion (replacement=${replacement !== null})`, async () => {
  const { f, interrupted, effect, grant, acknowledgement } = await interruptedAcknowledgementFixture();
  let journal = appendAcknowledgement(interrupted.journal, effect.id, acknowledgement);
  const release = f.plan.manifest.effects.at(-1)!, execute = f.transport.execute;
  f.transport.execute = async (plan, selected, objects) => {
    await execute(plan, selected, objects);
    if (selected.kind === "lease-release") throw new PublicationExecutionError(true, true);
  };
  await expect(executeAttempt({ journal: appendIntent(journal, release.id), effect: release,
    objects: interrupted.objects, transport: f.transport, reconciliation: grant })).rejects.toThrow();
  f.transport.execute = execute;
  if (replacement !== null) f.refs.set(f.settings.publication.lease_ref, replacement);
  journal = readJournal(journal.directory, f.repo);
  const recovered = await resumeEffects({ ...publicationOptions(f), journal_directory: journal.directory });
  expect(recovered.state).toBe("acknowledged");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(replacement ?? undefined);
  expect(recovered.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
});
}

test("acknowledged recovery preserves a replacement lease without attempting its deletion", async () => {
  const { f, interrupted, effect, acknowledgement } = await interruptedAcknowledgementFixture();
  const journal = appendAcknowledgement(interrupted.journal, effect.id, acknowledgement), replacement = "f".repeat(40);
  f.refs.set(f.settings.publication.lease_ref, replacement);
  const recovered = await resumeEffects({ ...publicationOptions(f), journal_directory: journal.directory });
  expect(recovered.state).toBe("acknowledged");
  expect(f.executed.includes("release")).toBe(false);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(replacement);
});
