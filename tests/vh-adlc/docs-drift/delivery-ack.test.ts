import { afterAll, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { executeAttempt, PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { resumeEffects, reconcileAbsent } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { retainLookup } from "../../../plugins/vh-adlc/scripts/docs-drift/observations";
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readAppliedDelivery, readBefore, retainBefore, type BeforeData } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof";
import { appendAcknowledgement, appendAttempt, appendAttemptEnd, appendIntent, appendOutcome, appendRecoveryOnly, createJournal, isObservationOnly, readJournal, sealPlan, type DeliveryAcknowledgement } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readSuccess } from "../../../plugins/vh-adlc/scripts/docs-drift/success";
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
  let attempted = appendIntent(journal, effect.id);
  attempted = appendAttempt(attempted, effect.id, "schema-ineligible-attempt");
  attempted = appendAttemptEnd(attempted, effect.id, { attempt_id: "schema-ineligible-attempt", sent: true, reaped: true });
  const lookup = retainLookup({ artifact_root: f.artifacts, source_repo: f.repo, plan, effect,
    transport: "collector", state: "conflict", lookup: { schema_fixture: "ineligible kind" } });
  expect(() => appendAcknowledgement(attempted, effect.id, { kind: "owner-delivery-acknowledgement",
    scope_sha256: hash("schema scope"), request_sha256: hash("schema request"), lookup,
    application_sha256: hash("schema application"), settlement_sha256: hash("schema settlement") })).toThrow("invalid delivery acknowledgement");
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
    reconciliation: { scope_sha256: grant.scope_sha256, request_sha256: grant.request_sha256 } })).rejects.toThrow("acknowledgement cleanup authority required");
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

test("the collector's own execution can prove fixture application only through its explicit trial route", async () => {
  const f = publicationFixture(roots, { owned_resources: true }), execute = f.transport.execute;
  f.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].id === "pr") throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    return captured;
  };
  const interrupted = await publish(publicationOptions(f));
  const scope = { source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: "pr", settings: f.settings, transport: "collector" as const };
  const proof = readAppliedDelivery(scope);
  expect(proof).toMatchObject({ effect_id: "pr", transport: "collector", context: "trial", number: 501 });
  expect(proof.resource_id).toBeGreaterThan(0);
  expect(() => readAppliedDelivery({ ...scope, transport: "native" as const })).toThrow();
});

test("an exact recorded outcome stays on its ordinary recovery path", async () => {
  const { f, interrupted, effect, acknowledgement } = await interruptedAcknowledgementFixture();
  const observed = await f.transport.observe(f.plan, effect, interrupted.objects);
  if (observed.state !== "done") throw Error("missing exact schema fixture outcome");
  const completed = appendOutcome(interrupted.journal, effect.id, observed.outcome);
  expect(() => appendAcknowledgement(completed, effect.id, acknowledgement)).toThrow("invalid delivery acknowledgement");
});

test("an observation-only journal cannot acknowledge original application", () => {
  const f = publicationFixture(roots);
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan, recovery_mode: "observation-only" });
  const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
  for (const prior of f.plan.manifest.effects.slice(0, f.plan.manifest.effects.indexOf(effect))) {
    journal = appendIntent(journal, prior.id);
    journal = appendOutcome(journal, prior.id, { state: "observed", observation_sha256: hash("schema observed " + prior.id),
      resource_id: prior.id, object: f.plan.manifest.bindings.candidate_commit });
  }
  journal = appendIntent(journal, effect.id);
  const lookup = retainLookup({ artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect,
    transport: "collector", state: "conflict", lookup: { schema_fixture: "observation-only" } });
  expect(() => appendAcknowledgement(journal, effect.id, { kind: "owner-delivery-acknowledgement",
    scope_sha256: hash("schema scope"), request_sha256: hash("schema request"), lookup,
    application_sha256: hash("schema application"), settlement_sha256: hash("schema settlement") })).toThrow("invalid delivery acknowledgement");
});

type CollectorKind = "pr-create" | "issue-create" | "comment-create" | "pr-update" | "pr-close";
async function collectorDeliveryFixture(kind: CollectorKind) {
  const f = publicationFixture(roots, { owned_resources: true }), execute = f.transport.execute;
  const original = { title: "Original title", body: "Original body", labels: ["old"], draft: false };
  if (kind !== "issue-create" && kind !== "pr-create") f.resources.set("pulls/77", { ...original, id: 901, number: 77, state: "open", merged_at: null,
    labels: [{ id: 102, name: "old" }], user: { id: kind === "pr-close" ? 90 : 20, login: kind === "pr-close" ? "legacy-bot" : "fixture-bot" },
    head: { sha: f.input.manifest.bindings.candidate_commit, ref: kind === "pr-close" ? "docs-audit/legacy" : "docs-drift/one", repo: { id: 10 } },
    base: { ref: "main", repo: { id: 10 } } });
  const { publicationMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-history");
  const { effectMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  const body = publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("delivered");
  const effect: Effect = kind === "pr-create" ? { id: "delivered", kind, payload: { base: "main", branch: "docs-drift/one", title: "Reviewed PR", body, labels: ["documentation"], draft: true } }
    : kind === "issue-create" ? { id: "delivered", kind, payload: { title: "Reviewed issue", body: body + "\nhttps://github.com/fixture/docs/blob/" + f.input.manifest.bindings.source_commit + "/README.md",
    labels: ["documentation"], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.input.manifest.bindings.source_commit,
    evidence_sha256: sha256(readFileSync(join(f.repo, "README.md"))) } }
    : kind === "comment-create" ? { id: "delivered", kind, payload: { number: 77, body, prior_ids: [] } }
      : kind === "pr-close" ? { id: "delivered", kind, payload: { number: 77, expected_head: f.input.manifest.bindings.candidate_commit } }
        : { id: "delivered", kind, payload: { number: 77, expected_head: f.input.manifest.bindings.candidate_commit, expected_payload: original,
          expected_payload_sha256: sha256(canonicalJSON(original)), title: "Reviewed title", body, labels: ["documentation"], draft: true } };
  const explanation: Effect = { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } };
  const effects = [...f.plan.manifest.effects.slice(0, 2), ...(kind === "pr-create" ? [f.plan.manifest.effects.find(item => item.kind === "push")!] : []), ...(kind === "pr-close" ? [explanation] : []), effect, f.plan.manifest.effects.at(-1)!];
  f.input = fixture(f.input.manifest.bindings, effects);
  f.plan = sealPlan({ reviewed: validateReviewedManifest(f.input), grants: f.input.grants, ...f.policy, corrections: [], attention: [] });
  f.gate = async () => ({ review: f.input, policy: f.policy });
  f.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].id === effect.id) throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    return captured;
  };
  return { f, effect };
}

for (const kind of ["issue-create", "comment-create", "pr-update", "pr-close"] as const) {
test(`owned collector ${kind} application has complete trial-labelled evidence`, async () => {
  const { f, effect } = await collectorDeliveryFixture(kind);
  const interrupted = await publish(publicationOptions(f));
  const scope = { source_repo: f.repo, journal_directory: interrupted.journal.directory, effect_id: effect.id,
    settings: f.settings, transport: "collector" as const };
  const proof = readAppliedDelivery(scope);
  expect(proof).toMatchObject({ context: "trial", transport: "collector", effect_id: effect.id });
  const resource = kind === "issue-create" ? f.resources.get("issues/" + proof.number)
    : kind === "comment-create" ? f.resources.get("comments/" + proof.resource_id) : f.resources.get("pulls/77");
  if (!resource) throw Error("collector resource was not applied");
  if (kind === "pr-close") resource.state = "open";
  else resource.body = String(resource.body) + "\nLater fixture owner edit";
  expect(readAppliedDelivery(scope).proof_sha256).toBe(proof.proof_sha256);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});
}

for (const [kind, field, incomplete] of [
  ["pr-create", "labels", []], ["pr-create", "draft", false],
  ["issue-create", "labels", []], ["comment-create", "body", "Unapplied body"],
  ["pr-update", "labels", []], ["pr-update", "draft", false], ["pr-close", "state", "open"],
] as const) {
test(`owned collector refuses partial ${kind} ${field} application`, async () => {
  const { f, effect } = await collectorDeliveryFixture(kind), set = f.resources.set.bind(f.resources);
  f.resources.set = (key, value) => {
    if ((kind === "comment-create" ? key.startsWith("comments/") : kind === "issue-create" ? key.startsWith("issues/") : key.startsWith("pulls/"))
      && (kind !== "pr-close" || value.state === "closed")) return set(key, { ...value, [field]: incomplete });
    return set(key, value);
  };
  const interrupted = await publish(publicationOptions(f));
  expect(() => readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: "collector" })).toThrow();
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});
}

for (const mode of ["production", "native", "native-production", "missing-completion", "changed-completion", "foreign-before", "oversized", "unlinked-baseline"] as const) {
test(`owned collector proof refuses ${mode} evidence`, async () => {
  const { f, effect } = await collectorDeliveryFixture("pr-create");
  const interrupted = await publish(publicationOptions(f));
  const ending = interrupted.journal.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === effect.id);
  if (!ending || !("execution" in ending.payload) || !ending.payload.execution?.before) throw Error("missing actual collector execution");
  const execution = ending.payload.execution, evidence = execution.successes[0];
  const value = JSON.parse(readFileSync(evidence.path, "utf8"));
  const scope = { source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan, effect, attempt_id: ending.payload.attempt_id, evidence };
  expect(readSuccess(scope)).toEqual(evidence);
  expect(statSync(evidence.path).mode & 0o777).toBe(0o600);
  const completion = join(value.command_directory, "fixture-result.json");
  if (mode === "missing-completion") rmSync(completion);
  if (mode === "changed-completion") {
    const result = JSON.parse(readFileSync(completion, "utf8")); result.completed = false;
    writeFileSync(completion, canonicalJSON(result));
  }
  if (mode === "foreign-before") {
    const result = JSON.parse(readFileSync(completion, "utf8")); result.before.path = join(f.repo, "README.md");
    writeFileSync(completion, canonicalJSON(result));
  }
  if (mode === "oversized") writeFileSync(completion, Buffer.alloc(65537, " "));
  if (mode === "unlinked-baseline") {
    const data = readBefore({ ...scope, evidence: execution.before! });
    const replacement = retainBefore({ ...scope, data });
    const result = JSON.parse(readFileSync(completion, "utf8")); result.before = replacement;
    const bytes = canonicalJSON(result); writeFileSync(completion, bytes);
    value.command.process_sha256 = sha256(bytes); value.command.baseline_sha256 = replacement.sha256;
    const proof = canonicalJSON(value); writeFileSync(evidence.path, proof);
    // The journal still links the original success proof and rejects the replacement.
  }
  if (["production", "native", "native-production"].includes(mode)) {
    const plan = { ...f.plan, transport: mode === "production" ? "collector" as const : "native" as const,
      context: mode === "native" ? "trial" as const : "production" as const };
    value.transport = plan.transport; value.context = plan.context; value.plan_sha256 = sha256(canonicalJSON(plan));
    const bytes = canonicalJSON(value); writeFileSync(evidence.path, bytes);
    expect(() => readSuccess({ ...scope, plan, evidence: { path: evidence.path, sha256: sha256(bytes) } })).toThrow();
  } else {
    expect(() => readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
      effect_id: effect.id, settings: f.settings, transport: "collector" })).toThrow();
  }
});
}

test("collector response extensions stay outside retained artifacts", async () => {
  const { f, effect } = await collectorDeliveryFixture("pr-create"), set = f.resources.set.bind(f.resources);
  f.resources.set = (key, value) => set(key, { ...value, ignored_extension: "collector-secret-response-canary" });
  const interrupted = await publish(publicationOptions(f));
  expect(readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: "collector" }).transport).toBe("collector");
  for (const path of readdirSync(f.artifacts, { recursive: true, encoding: "utf8" })) {
    const file = join(f.artifacts, path);
    if (statSync(file).isFile()) expect(readFileSync(file, "utf8")).not.toContain("collector-secret-response-canary");
  }
});

test("collector requires a resolved label name before mutation", async () => {
  const { f, effect } = await collectorDeliveryFixture("pr-create");
  f.resourceLabels.set("documentation", { id: 101, name: "" });
  const interrupted = await publish(publicationOptions(f));
  expect(f.resources.size).toBe(0);
  expect(() => readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: "collector" })).toThrow();
});

test("collector application rejects a different journal-linked baseline", async () => {
  const { f, effect } = await collectorDeliveryFixture("pr-create"), execute = f.transport.execute;
  f.transport.execute = async (...args) => {
    try { return await execute(...args); } catch (error) {
      if (!(error instanceof PublicationExecutionError) || !error.execution?.before || !args[3]) throw error;
      const scope = { artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect, attempt_id: args[3] };
      const data = readBefore({ ...scope, evidence: error.execution.before });
      error.execution.before = retainBefore({ ...scope, data: { ...data, requests_sha256: hash("different fixture reads") } });
      throw error;
    }
  };
  const interrupted = await publish(publicationOptions(f));
  expect(() => readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: "collector" })).toThrow("collector-baseline-link-changed");
});

for (const kind of ["pr-create", "issue-create", "comment-create", "pr-update", "pr-close"] as const) {
test(`fresh ${kind} lookup binds changed fixture state without overwriting it`, async () => {
  const { lookupAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-lookup");
  const { f, effect } = await collectorDeliveryFixture(kind);
  const interrupted = await publish(publicationOptions(f));
  const scope = { source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: f.transport };
  await expect(lookupAppliedDelivery(scope)).rejects.toThrow("delivery-currently-matching");
  const application = readAppliedDelivery({ ...scope, transport: "collector" });
  const key = kind === "issue-create" ? "issues/" + application.number
    : kind === "comment-create" ? "comments/" + application.resource_id : "pulls/" + application.number;
  const resource = f.resources.get(key);
  if (!resource) throw Error("missing fixture delivery");
  if (kind === "pr-close") resource.state = "open";
  else resource.body = String(resource.body) + "\nSubsequent owner edit";
  const bytes = canonicalJSON(resource), lookup = await lookupAppliedDelivery(scope);
  expect(lookup).toMatchObject({ effect_id: effect.id, resource_id: application.resource_id,
    application_sha256: application.proof_sha256, transport: "collector", context: "trial" });
  expect(lookup.differences).toContain(kind === "pr-close" ? "state" : "body_sha256");
  expect(canonicalJSON(f.resources.get(key))).toEqual(bytes);
  expect(statSync(lookup.evidence.path).mode & 0o777).toBe(0o600);
  expect(readFileSync(lookup.evidence.path, "utf8")).not.toContain("Subsequent owner edit");
});
}

test("an unwrapped owned collector reports a refused write as unsent", async () => {
  const f = publicationFixture(roots, { owned_resources: true }), effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
  f.resourceLabels.set("documentation", { id: 101, name: "" });
  const interrupted = await publish(publicationOptions(f));
  expect(interrupted.state).toBe("pending");
  const ending = interrupted.journal.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === effect.id);
  expect(ending?.payload).toMatchObject({ sent: false, reaped: true });
  expect(f.resources.size).toBe(0);
  expect(await f.transport.observe(f.plan, effect, interrupted.objects)).not.toMatchObject({ state: "done" });
  expect(interrupted.journal.events.some(event => event.kind === "outcome" && event.effect_id === effect.id)).toBe(false);
  const lookup = retainLookup({ artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect,
    transport: "collector", state: "conflict", lookup: { schema_fixture: "known unsent refusal" } });
  expect(() => appendAcknowledgement(interrupted.journal, effect.id, { kind: "owner-delivery-acknowledgement",
    scope_sha256: hash("scope"), request_sha256: hash("request"), lookup,
    application_sha256: hash("contradictory application"), settlement_sha256: hash("settlement") })).toThrow();
});

for (const mode of ["title", "labels", "state"] as const) {
test(`current issue lookup rejects missing ${mode}`, async () => {
  const { lookupAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-lookup");
  const { f, effect } = await collectorDeliveryFixture("issue-create");
  const interrupted = await publish(publicationOptions(f));
  const application = readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: "collector" });
  const resource = f.resources.get("issues/" + application.number)!;
  resource.body = String(resource.body) + "\nLater owner edit"; delete resource[mode];
  await expect(lookupAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: f.transport })).rejects.toThrow("delivery-current-resource-incomplete");
});
}

for (const mode of ["marker", "duplicate", "head", "branch", "base", "actor", "merged", "missing-resource", "malformed-labels"] as const) {
test(`fresh PR lookup refuses changed ${mode} bindings`, async () => {
  const { lookupAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-lookup");
  const { f, effect } = await collectorDeliveryFixture("pr-create");
  const interrupted = await publish(publicationOptions(f));
  const application = readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: "collector" });
  const key = "pulls/" + application.number, resource = f.resources.get(key)!;
  resource.title = "Later owner edit";
  if (mode === "marker") resource.body = "Removed original markers";
  if (mode === "duplicate") f.resources.set("pulls/999", { ...resource, id: application.resource_id + 10, number: 999 });
  if (mode === "head") (resource.head as Record<string, unknown>).sha = "e".repeat(40);
  if (mode === "branch") (resource.head as Record<string, unknown>).ref = "docs-drift/other";
  if (mode === "base") (resource.base as Record<string, unknown>).ref = "other";
  if (mode === "actor") (resource.user as Record<string, unknown>).id = 99;
  if (mode === "merged") resource.merged_at = "2026-11-08T12:00:00Z";
  if (mode === "missing-resource") f.resources.delete(key);
  if (mode === "malformed-labels") resource.labels = null;
  await expect(lookupAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: f.transport })).rejects.toThrow();
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});
}

for (const mode of ["parent", "explanation-body", "explanation-actor", "missing-explanation"] as const) {
test(`fresh comment or closure lookup refuses changed ${mode}`, async () => {
  const { lookupAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-lookup");
  const kind = mode === "parent" ? "comment-create" : "pr-close";
  const { f, effect } = await collectorDeliveryFixture(kind);
  const interrupted = await publish(publicationOptions(f));
  f.resources.get("pulls/77")!.state = "open";
  const [key, explanation] = [...f.resources.entries()].find(([key]) => key.startsWith("comments/"))!;
  if (mode === "parent") {
    explanation.body = String(explanation.body) + "\nLater owner edit";
    (f.resources.get("pulls/77")!.head as Record<string, unknown>).sha = "e".repeat(40);
  }
  if (mode === "explanation-body") explanation.body = String(explanation.body) + "\nLater explanation edit";
  if (mode === "explanation-actor") (explanation.user as Record<string, unknown>).id = 99;
  if (mode === "missing-explanation") f.resources.delete(key);
  await expect(lookupAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: f.transport })).rejects.toThrow();
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});
}

test("an extra malformed marker match still makes current delivery ambiguous", async () => {
  const { lookupAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-lookup");
  const { effectMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  const { f, effect } = await collectorDeliveryFixture("pr-create");
  const interrupted = await publish(publicationOptions(f));
  const resource = [...f.resources.values()][0]; resource.title = "Later owner edit";
  f.resources.set("pulls/999", { ...resource, id: 9999, number: 999, body: String(resource.body) + "\n" + effectMarker(effect.id) });
  await expect(lookupAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: f.transport })).rejects.toThrow("delivery-current-marker-ambiguous");
});

test("owned collector publication captures every ref transaction and preserves its receipt", async () => {
  const { readGitSuccess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git-success");
  const f = publicationFixture(roots, { owned_resources: true });
  const completed = await publish(publicationOptions(f));
  expect(completed.state).toBe("complete");
  for (const effect of f.plan.manifest.effects.filter(item => ["lease-acquire", "push", "lease-release"].includes(item.kind))) {
    const ending = completed.journal.events.find(event => event.effect_id === effect.id && event.kind === "attempt-ended");
    if (!ending || !("execution" in ending.payload) || !ending.payload.execution) throw Error("missing owned collector ref execution");
    expect(ending.payload.execution.successes).toHaveLength(1);
    const evidence = ending.payload.execution.successes[0], attemptId = ending.payload.attempt_id;
    const value = readGitSuccess({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan, effect,
      attempt_id: attemptId, evidence });
    expect(value.updates[0].ref).toBe(String(effect.payload.ref));
    const encoded = JSON.parse(readFileSync(evidence.path, "utf8"));
    expect(encoded).toMatchObject({ context: "trial", transport: "collector" });
    const plan = { ...f.plan, transport: "native" as const, context: "production" as const };
    encoded.transport = plan.transport; encoded.context = plan.context; encoded.plan_sha256 = sha256(canonicalJSON(plan));
    const bytes = canonicalJSON(encoded); writeFileSync(evidence.path, bytes);
    expect(() => readGitSuccess({ source_repo: f.repo, artifact_root: f.artifacts, plan, effect,
      attempt_id: attemptId, evidence: { path: evidence.path, sha256: sha256(bytes) } })).toThrow();
  }
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  expect(f.refs.get(f.settings.publication.receipt_ref_prefix + f.plan.manifest.operation_id)).toBe(completed.objects.receipt_object);
});

test("owned collector refuses a foreign acquisition companion without taking its lease", async () => {
  const f = publicationFixture(roots, { owned_resources: true });
  const { writePublicationObjects } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const objects = writePublicationObjects(f.store, f.plan, journal.header);
  const receipt = f.settings.publication.receipt_ref_prefix + f.plan.manifest.operation_id;
  f.refs.set(receipt, "f".repeat(40));
  await expect(f.transport.execute(f.plan, f.plan.manifest.effects[0], objects, "refused-companion"))
    .rejects.toMatchObject({ sent: false, reaped: true });
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  expect(f.refs.get(receipt)).toBe("f".repeat(40));
});

test("an exact current-owner acknowledgement preserves the changed delivery and releases its original lease", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, effect } = await collectorDeliveryFixture("pr-create");
  const interrupted = await publish(publicationOptions(f));
  const resource = [...f.resources.values()][0], originalBody = resource.body;
  resource.body = String(resource.body) + "\nOwner-kept delivery edit";
  const changed = canonicalJSON(resource);
  const result = await acknowledgeDeliveries({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    object_store: f.store, settings: f.settings, transport: f.transport, acknowledge_effect_ids: [effect.id], retire_effect_ids: [],
    authorize: async scope => ({ kind: "owner-delivery-acknowledgement", source: "owner-current-request",
      scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("synthetic current owner approval") }) });
  expect(result.state).toBe("acknowledged");
  expect(canonicalJSON(resource)).toEqual(changed);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  expect(f.refs.get(f.settings.publication.receipt_ref_prefix + f.plan.manifest.operation_id)).toBe(interrupted.objects.receipt_object);
  expect(result.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  resource.body = originalBody;
  const restored = await resumeEffects({ ...publicationOptions(f), journal_directory: result.journal.directory });
  expect(restored.state).toBe("acknowledged");
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
});

test("an already equal collector ref cannot claim another application", async () => {
  const f = publicationFixture(roots, { owned_resources: true });
  const completed = await publish(publicationOptions(f));
  const push = f.plan.manifest.effects.find(effect => effect.kind === "push")!;
  await expect(f.transport.execute(f.plan, push, completed.objects, "unchanged-ref-attempt"))
    .rejects.toMatchObject({ sent: false, reaped: true });
  expect(f.refs.get(String(push.payload.ref))).toBe(String(push.payload.head));
});

for (const body of ["Owner replaced the update body", "", null]) {
test(`a proven PR update stays identifiable after later marker removal (${body === null ? "null" : body.length})`, async () => {
  const { lookupAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-lookup");
  const { f, effect } = await collectorDeliveryFixture("pr-update");
  const interrupted = await publish(publicationOptions(f));
  f.resources.get("pulls/77")!.body = body;
  const lookup = await lookupAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: f.transport });
  expect(lookup.differences).toEqual(["body_sha256"]);
});
}

test("collector ref rewrites derive a rewrite status from the original ref", async () => {
  const { executeCollectorRefs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/collector-refs");
  const { readGitSuccess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git-success");
  const { writePublicationObjects } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const f = publicationFixture(roots, { owned_resources: true });
  const effect: Effect = { id: "refresh", kind: "branch-refresh", payload: { number: 77, ref: "refs/heads/docs-drift/one",
    expected_head: "e".repeat(40), head: f.input.manifest.bindings.candidate_commit } };
  const input = fixture(f.input.manifest.bindings, [effect]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...f.policy, corrections: [], attention: [] });
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
  const objects = writePublicationObjects(f.store, plan, journal.header);
  f.refs.set(String(effect.payload.ref), String(effect.payload.expected_head));
  const result = executeCollectorRefs({ source_repo: f.repo, artifact_root: f.artifacts, plan, effect, attempt_id: "fixture-rewrite",
    settings: f.settings, identity: await f.transport.identity(), objects, refs: f.refs });
  const evidence = result.successes[0];
  expect(JSON.parse(readFileSync(evidence.path, "utf8")).projection.statuses).toEqual(["+"]);
  expect(readGitSuccess({ source_repo: f.repo, artifact_root: f.artifacts, plan, effect, attempt_id: "fixture-rewrite", evidence }).updates[0].expected).toBe("e".repeat(40));
});

async function changedDeliveryFixture(kind: CollectorKind = "pr-create") {
  const { f, effect } = await collectorDeliveryFixture(kind), interrupted = await publish(publicationOptions(f));
  const application = readAppliedDelivery({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    effect_id: effect.id, settings: f.settings, transport: "collector" });
  const key = kind === "issue-create" ? "issues/" + application.number
    : kind === "comment-create" ? "comments/" + application.resource_id : "pulls/" + application.number;
  const resource = f.resources.get(key)!;
  if (kind === "pr-close") resource.state = "open";
  else resource.body = String(resource.body) + "\nLater owner edit";
  const authorize = async (scope: unknown) => ({ kind: "owner-delivery-acknowledgement", source: "owner-current-request",
    scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("current synthetic owner request") });
  const options = { source_repo: f.repo, journal_directory: interrupted.journal.directory, object_store: f.store,
    settings: f.settings, transport: f.transport, acknowledge_effect_ids: [effect.id], retire_effect_ids: [], authorize };
  return { f, effect, interrupted, resource, options };
}

for (const mode of ["standing", "unattended", "cleanup", "retirement", "wrong-scope", "changed-request"] as const) {
test(`acknowledgement refuses ${mode} authority before stopping replay`, async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, options, interrupted } = await changedDeliveryFixture(); let calls = 0;
  const result = await acknowledgeDeliveries({ ...options, authorize: async scope => {
    const grant = await options.authorize(scope); calls++;
    if (mode === "standing" || mode === "unattended") grant.source = mode;
    if (mode === "cleanup" || mode === "retirement") grant.kind = mode;
    if (mode === "wrong-scope") grant.scope_sha256 = hash("another scope");
    if (mode === "changed-request" && calls > 1) grant.request_sha256 = hash("new current request");
    return grant;
  } });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("acknowledgement-owner-approval-required");
  expect(result.journal.events.some(event => event.kind === "acknowledged-delivery")).toBe(false);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
  expect(f.executed.includes("release")).toBe(false);
});
}

for (const mode of ["payload", "source", "actor", "lease"] as const) {
test(`acknowledgement revalidates ${mode} after owner approval`, async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, options, interrupted, resource } = await changedDeliveryFixture(); let changed = false;
  const result = await acknowledgeDeliveries({ ...options, authorize: async scope => {
    const grant = await options.authorize(scope);
    if (!changed) {
      changed = true;
      if (mode === "payload") resource.body = String(resource.body) + "\nNew edit during approval";
      if (mode === "source") writeFileSync(join(f.repo, "README.md"), "Changed source during approval\n");
      if (mode === "actor") {
        const identity = await f.transport.identity(); f.transport.identity = async () => ({ ...identity, actor_id: 99 });
      }
      if (mode === "lease") f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
    }
    return grant;
  } });
  expect(result.state).toBe("pending");
  expect(result.journal.events.some(event => event.kind === "acknowledged-delivery")).toBe(false);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(mode === "lease" ? "f".repeat(40) : interrupted.objects.lease_object);
  expect(f.executed.includes("release")).toBe(false);
});
}

for (const kind of ["issue-create", "comment-create", "pr-update", "pr-close"] as const) {
test(`owner-approved ${kind} acknowledgement preserves its delivery`, async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, effect, options, resource } = await changedDeliveryFixture(kind), bytes = canonicalJSON(resource);
  const result = await acknowledgeDeliveries(options);
  expect(result.state).toBe("acknowledged");
  expect(canonicalJSON(resource)).toEqual(bytes);
  expect(result.journal.events.filter(event => event.effect_id === effect.id && event.kind === "acknowledged-delivery")).toHaveLength(1);
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
});
}

test("acknowledgement recovery does not duplicate a locally published event with a lost response", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const ledger = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const { f, effect, options } = await changedDeliveryFixture(), append = ledger.appendAcknowledgement;
  const lost = spyOn(ledger, "appendAcknowledgement").mockImplementationOnce((...args) => {
    append(...args); throw Error("lost local acknowledgement response");
  });
  try {
    const first = await acknowledgeDeliveries(options);
    expect(first.state).toBe("pending");
    expect(first.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
    expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
  } finally { lost.mockRestore(); }
  const recovered = await acknowledgeDeliveries(options);
  expect(recovered.state).toBe("acknowledged");
  expect(recovered.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
});

for (const replacement of [false, true]) {
test(`owner cleanup recovers a lost release response without repeating deletion (replacement=${replacement})`, async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, effect, options } = await changedDeliveryFixture(), execute = f.transport.execute;
  f.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].kind === "lease-release") throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    return captured;
  };
  const first = await acknowledgeDeliveries(options);
  expect(first.state).toBe("pending");
  if (replacement) f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
  const recovered = await acknowledgeDeliveries(options);
  expect(recovered.state).toBe("acknowledged");
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(replacement ? "f".repeat(40) : undefined);
  expect(recovered.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
});
}

test("concurrent acknowledgement cleanup writes one disposition and deletes only once", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, effect, options } = await changedDeliveryFixture();
  await Promise.all([acknowledgeDeliveries(options), acknowledgeDeliveries(options)]);
  const recovered = await acknowledgeDeliveries(options);
  expect(recovered.state).toBe("acknowledged");
  expect(recovered.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
});

test("an approved remaining absence is retired in the same acknowledgement cleanup", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { publicationMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-history");
  const { effectMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  const f = publicationFixture(roots, { owned_resources: true }), execute = f.transport.execute;
  const future: Effect = { id: "future", kind: "issue-create", payload: { title: "Later reviewed issue", labels: ["documentation"], prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("future") + "\nhttps://github.com/fixture/docs/blob/" + f.input.manifest.bindings.source_commit + "/README.md",
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.input.manifest.bindings.source_commit,
    evidence_sha256: sha256(readFileSync(join(f.repo, "README.md"))) } };
  const effects = [...f.plan.manifest.effects.slice(0, -1), future, f.plan.manifest.effects.at(-1)!];
  f.input = fixture(f.input.manifest.bindings, effects);
  f.plan = sealPlan({ reviewed: validateReviewedManifest(f.input), grants: f.input.grants, ...f.policy, corrections: [], attention: [] });
  f.gate = async () => ({ review: f.input, policy: f.policy });
  f.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].id === "pr") throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    return captured;
  };
  const interrupted = await publish(publicationOptions(f));
  [...f.resources.values()][0].title = "Later owner edit";
  const result = await acknowledgeDeliveries({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    object_store: f.store, settings: f.settings, transport: f.transport, acknowledge_effect_ids: ["pr"], retire_effect_ids: [future.id],
    authorize: async scope => ({ kind: "owner-delivery-acknowledgement", source: "owner-current-request",
      scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("explicit acknowledgement and absence retirement") }) });
  expect(result.reason).toBeNull();
  expect(result.state).toBe("acknowledged");
  expect(result.journal.events.filter(event => event.kind === "retired-absence" && event.effect_id === future.id)).toHaveLength(1);
  expect(f.executed.includes(future.id)).toBe(false);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
});

test("a restored payload still needs fresh cleanup approval and never reactivates its acknowledged write", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, effect, options, resource } = await changedDeliveryFixture(); let calls = 0;
  const first = await acknowledgeDeliveries({ ...options, authorize: async scope => {
    const grant = await options.authorize(scope);
    if (++calls === 3) resource.body = effect.payload.body;
    return grant;
  } });
  expect(first.state).toBe("pending");
  expect(first.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
  const recovered = await acknowledgeDeliveries({ ...options, authorize: async scope => ({ ...await options.authorize(scope),
    request_sha256: hash("fresh owner approval for the restored payload cleanup") }) });
  expect(recovered.reason).toBeNull();
  expect(recovered.state).toBe("acknowledged");
  expect(recovered.journal.events.filter(event => event.kind === "acknowledged-delivery")).toHaveLength(1);
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
});

test("current-owner approval cannot bypass an executor still finishing its applied write", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const f = publicationFixture(roots, { owned_resources: true }), execute = f.transport.execute;
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  f.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].id === "pr") {
      entered(); await finished;
      throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    }
    return captured;
  };
  const publishing = publish(publicationOptions(f));
  await started;
  [...f.resources.values()][0].title = "Later owner edit";
  let approvals = 0;
  const options = { source_repo: f.repo, journal_directory: join(f.artifacts, "docs-drift-operation-1"), object_store: f.store,
    settings: f.settings, transport: f.transport, acknowledge_effect_ids: ["pr"], retire_effect_ids: [],
    authorize: async (scope: unknown) => { approvals++; return { kind: "owner-delivery-acknowledgement", source: "owner-current-request",
      scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("current owner after executor settlement") }; } };
  try {
    const blocked = await acknowledgeDeliveries(options);
    expect(blocked.state).toBe("pending");
    expect(blocked.reason).toBe("acknowledgement-executor-unsettled");
    expect(approvals).toBe(0);
    expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
  } finally { finish(); await publishing; }
  const recovered = await acknowledgeDeliveries(options);
  expect(recovered.reason).toBeNull();
  expect(recovered.state).toBe("acknowledged");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
});

test("current-owner approval cannot turn a partial application into a completed delivery", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, effect } = await collectorDeliveryFixture("pr-create"), set = f.resources.set.bind(f.resources);
  f.resources.set = (key, value) => set(key, { ...value, labels: [] });
  const interrupted = await publish(publicationOptions(f)); let approvals = 0;
  const result = await acknowledgeDeliveries({ source_repo: f.repo, journal_directory: interrupted.journal.directory,
    object_store: f.store, settings: f.settings, transport: f.transport, acknowledge_effect_ids: [effect.id], retire_effect_ids: [],
    authorize: async scope => { approvals++; return { kind: "owner-delivery-acknowledgement", source: "owner-current-request",
      scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("cannot approve absent application evidence") }; } });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("delivery-payload-incomplete");
  expect(approvals).toBe(0);
  expect(result.journal.events.some(event => event.kind === "acknowledged-delivery")).toBe(false);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});

test("current-owner permission cannot adopt another original run's same-plan lease", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { writePublicationObjects } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const { f, options, interrupted } = await changedDeliveryFixture();
  const competingRoot = join(f.root, "competing-artifacts"); mkdirSync(competingRoot, { mode: 0o700 });
  const competing = createJournal({ source_repo: f.repo, artifact_root: competingRoot, plan: f.plan });
  const objects = writePublicationObjects(f.store, f.plan, competing.header);
  expect(objects.object).toBe(interrupted.objects.object);
  expect(objects.lease_object).not.toBe(interrupted.objects.lease_object);
  f.refs.set(f.settings.publication.lease_ref, objects.lease_object!);
  f.refs.set(f.settings.publication.receipt_ref_prefix + f.plan.manifest.operation_id, objects.receipt_object!);
  let approvals = 0;
  const result = await acknowledgeDeliveries({ ...options, authorize: async scope => { approvals++; return options.authorize(scope); } });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("acknowledgement-owned-lease-changed");
  expect(approvals).toBe(0);
  expect(result.journal.events.some(event => event.kind === "acknowledged-delivery")).toBe(false);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(objects.lease_object);
});

test("a read-only mirror cannot gain cleanup ownership from current-owner permission", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, options, interrupted } = await changedDeliveryFixture();
  const mirrorRoot = join(f.root, "mirror-artifacts"); mkdirSync(mirrorRoot, { mode: 0o700 });
  const mirror = createJournal({ source_repo: f.repo, artifact_root: mirrorRoot, plan: f.plan, recovery_mode: "observation-only",
    observed_lease_object: interrupted.objects.lease_object!, observed_receipt_object: interrupted.objects.receipt_object! });
  let approvals = 0;
  const result = await acknowledgeDeliveries({ ...options, journal_directory: mirror.directory, transport: { ...f.transport, artifact_root: mirrorRoot },
    authorize: async scope => { approvals++; return options.authorize(scope); } });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("acknowledgement-original-owner-required");
  expect(approvals).toBe(0);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});

test("fresh approval cannot retry a release whose server outcome is unknown", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, options } = await changedDeliveryFixture(), execute = f.transport.execute;
  let requests = 0, queued: Parameters<typeof execute> | undefined;
  f.transport.execute = async (...args) => {
    if (args[1].kind === "lease-release") {
      requests++; queued = args;
      throw new PublicationExecutionError(true, true);
    }
    return execute(...args);
  };
  expect((await acknowledgeDeliveries(options)).state).toBe("pending");
  expect(requests).toBe(1);
  const retry = await acknowledgeDeliveries(options);
  expect(retry.state).toBe("pending");
  expect(requests).toBe(1);
  if (!queued) throw Error("missing queued fixture backend request");
  // Model the first backend request completing after its client returned an unknown result.
  await execute(...queued);
  const settled = await acknowledgeDeliveries(options);
  expect(settled.state).toBe("acknowledged");
  expect(requests).toBe(1);
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
});

test("a proven deletion cannot be repeated after the same old lease object is restored", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, options, interrupted } = await changedDeliveryFixture(), execute = f.transport.execute;
  f.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].kind === "lease-release") {
      f.refs.set(f.settings.publication.lease_ref, interrupted.objects.lease_object!);
      throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    }
    return captured;
  };
  expect((await acknowledgeDeliveries(options)).state).toBe("pending");
  const retry = await acknowledgeDeliveries(options);
  expect(retry.state).toBe("pending");
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});

for (const when of ["before selection", "during approval"] as const) {
test(`an exact outcome recorded ${when} cannot be silently skipped as acknowledged`, async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, effect } = await collectorDeliveryFixture("pr-create");
  const interrupted = await publish(publicationOptions(f));
  const exact = await f.transport.observe(f.plan, effect, interrupted.objects);
  if (exact.state !== "done") throw Error("missing exact original observation");
  let recorded = interrupted.journal;
  if (when === "before selection") recorded = appendOutcome(recorded, effect.id, exact.outcome);
  const resource = [...f.resources.values()][0]; resource.body = String(resource.body) + "\nLater owner edit";
  let approvals = 0;
  const result = await acknowledgeDeliveries({ source_repo: f.repo, journal_directory: recorded.directory,
    object_store: f.store, settings: f.settings, transport: f.transport, acknowledge_effect_ids: [effect.id], retire_effect_ids: [],
    authorize: async scope => {
      approvals++;
      if (when === "during approval" && approvals === 1) recorded = appendOutcome(readJournal(recorded.directory, f.repo), effect.id, exact.outcome);
      return { kind: "owner-delivery-acknowledgement", source: "owner-current-request",
        scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("current owner cannot replace a recorded outcome") };
    } });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("acknowledgement-selection-invalid");
  expect(approvals).toBe(when === "before selection" ? 0 : 1);
  expect(result.journal.events).toEqual(recorded.events);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
  expect(f.executed.includes("release")).toBe(false);
});
}

test("acknowledgement inspection returns the exact scope without requesting authority or changing the journal", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const { f, options, resource } = await changedDeliveryFixture();
  const before = readJournal(options.journal_directory, f.repo), refs = [...f.refs], executed = [...f.executed], body = resource.body;
  let approvals = 0;
  const inspected = await acknowledgeDeliveries({ ...options, inspect_only: true, authorize: async scope => { approvals++; return options.authorize(scope); } });
  expect(inspected.state).toBe("pending"); expect(inspected.reason).toBe("inspection-only");
  expect(inspected.inspection_scope?.kind).toBe("docs-drift-delivery-acknowledgement"); expect(approvals).toBe(0);
  expect(readJournal(options.journal_directory, f.repo).digest).toBe(before.digest);
  expect([...f.refs]).toEqual(refs); expect(f.executed).toEqual(executed); expect(resource.body).toBe(body);
});

test("inspection after an acknowledged remote release leaves its missing local outcome untouched", async () => {
  const { acknowledgeDeliveries } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery");
  const artifacts = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const { f, options } = await changedDeliveryFixture(), append = artifacts.appendOutcome;
  const fault = spyOn(artifacts, "appendOutcome").mockImplementation((journal, id, outcome) => {
    if (id === "release") throw Error("Synthetic lost acknowledgement release outcome");
    return append(journal, id, outcome);
  });
  let pending;
  try { pending = await acknowledgeDeliveries(options); } finally { fault.mockRestore(); }
  expect(pending.state).toBe("pending"); expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  const before = readJournal(options.journal_directory, f.repo).digest, executed = [...f.executed];
  const inspected = await acknowledgeDeliveries({ ...options, inspect_only: true });
  expect(inspected.state).toBe("acknowledged"); expect(readJournal(options.journal_directory, f.repo).digest).toBe(before);
  expect(f.executed).toEqual(executed);
  expect((await acknowledgeDeliveries(options)).state).toBe("acknowledged");
});


test.each(["scalar", "mapped"] as const)("applied %s delivery proof checks the selected original publisher with configured casing", async mode => {
  const f = publicationFixture(roots, { owned_resources: true, publisher: { actor: "Fixture-Owner", actor_id: 30, configured_actor: "FIXTURE-OWNER",
    ...(mode === "mapped" ? { entry: "copilot" as const } : {}) } });
  const result = await publish(publicationOptions(f));
  expect(result.state, result.reason ?? undefined).toBe("complete");
  const scope = { source_repo: f.repo, journal_directory: result.journal.directory, effect_id: "pr", settings: f.settings, transport: "collector" as const };
  const proof = readAppliedDelivery(scope);
  expect(proof.resource_id).toBeGreaterThan(0);
  const original = canonicalJSON(result.journal.plan), changed = structuredClone(f.settings);
  if (changed.publication.entry_actors) changed.publication.entry_actors.copilot = "somebody-else";
  else changed.publication.actor = "somebody-else";
  expect(() => readAppliedDelivery({ ...scope, settings: changed })).toThrow("delivery-policy-scope-changed");
  expect(canonicalJSON(result.journal.plan).equals(original)).toBe(true);
});


for (const mode of ["scalar", "mapped"] as const) test.each(["case", "account-id", "material-login"] as const)(`a ${mode} collector creates exactly once under a verified native account observation: %s`, async change => {
  const f = publicationFixture(roots, { owned_resources: true, publisher: { actor: "Fixture-Owner", actor_id: 30, configured_actor: "FIXTURE-OWNER",
    ...(mode === "mapped" ? { entry: "copilot" as const } : {}) } });
  const native = await f.transport.identity();
  f.transport.identity = async () => ({ ...native, actor: change === "material-login" ? "somebody-else" : "fixture-owner", actor_id: change === "account-id" ? 31 : 30 });
  const original = canonicalJSON(f.plan);
  if (change !== "case") {
    await expect(publish(publicationOptions(f))).rejects.toThrow("current-native-repository-or-actor-changed");
    expect(f.resources.size).toBe(0);
    expect(f.executed).toEqual([]);
    expect(canonicalJSON(f.plan).equals(original)).toBe(true);
    return;
  }
  const published = await publish(publicationOptions(f));
  expect(published.state, published.reason ?? undefined).toBe("complete");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
  const raw = [...f.resources.values()].find(item => (item.user as { id: number } | undefined)?.id === 30)!;
  expect(raw.user).toMatchObject({ login: "fixture-owner", id: 30 });
  expect(readAppliedDelivery({ source_repo: f.repo, journal_directory: published.journal.directory,
    effect_id: "pr", settings: f.settings, transport: "collector" }).resource_id).toBeGreaterThan(0);
  expect(canonicalJSON(published.journal.plan).equals(original)).toBe(true);
});
