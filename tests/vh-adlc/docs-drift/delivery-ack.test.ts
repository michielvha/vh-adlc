import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { executeAttempt, PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { resumeEffects, reconcileAbsent } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { retainLookup } from "../../../plugins/vh-adlc/scripts/docs-drift/observations";
import { chmodSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  const f = publicationFixture(roots), execute = f.transport.execute;
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
  const f = publicationFixture(roots), execute = f.transport.execute;
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
