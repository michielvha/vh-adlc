import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { inspectRetainedOperation, restoreRetainedOperation, resumeEffects, reconcileAbsent } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { appendIntent, appendAttempt, appendAttemptEnd, appendOutcome, readJournal, sealPlan, appendRecoveryOnly, createJournal, writePublicationObjects, writePlanObject } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { fixture, hash } from "./manifest-fixture";
import { publicationFixture, legacyReceiptInterruption, publicationOptions as options } from "./publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const setup = () => publicationFixture(roots);

async function interruptedPR() {
  const f = setup();
  const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "pr-create") throw Error("lost response");
  };
  const interrupted = await publish(options(f));
  f.transport.execute = execute;
  return { f, interrupted };
}

test("fresh-context recovery observes a created PR before any replay and releases only its own lease", async () => {
  const { f, interrupted } = await interruptedPR();
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("complete");
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr", "release"]);
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
  expect(f.observed.filter(id => id === "pr").length).toBeGreaterThan(1);
  expect(f.refs.has(f.settings.publication.receipt_ref_prefix + "operation-1")).toBe(true);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
});

test("missing current write authority permits observations but no remaining remote action", async () => {
  const { f, interrupted } = await interruptedPR();
  f.input.grants = [];
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("pending");
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
  const journal = readJournal(interrupted.journal.directory, f.repo);
  expect(journal.events.some(event => event.kind === "outcome" && event.effect_id === "pr")).toBe(true);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
});

test("unknown or changed native matches stop recovery without retrying or releasing", async () => {
  for (const state of ["unknown", "conflict"] as const) {
    const f = setup(), execute = f.transport.execute;
    f.transport.execute = async (plan, effect, objects) => {
      if (effect.kind === "pr-create") throw new PublicationExecutionError(false, true);
      await execute(plan, effect, objects);
    };
    const interrupted = await publish(options(f));
    f.transport.execute = execute;
    const observe = f.transport.observe;
    f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state, reason: "native-match-unavailable" } : observe(plan, effect, objects);
    const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
    expect(result.state).toBe("pending");
    expect(f.executed).toEqual(["lease", "receipt", "push"]);
    expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
  }
});

test("definitive absence retries the unchanged original action under fresh current proof", async () => {
  const f = setup(); const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-create") throw new PublicationExecutionError(false, true);
    await execute(plan, effect, objects);
  };
  const interrupted = await publish(options(f)); f.transport.execute = execute;
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("complete");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
});

test("changed source, original native artifacts or actor prevents absent-action replay", async () => {
  for (const change of [
    (f: ReturnType<typeof setup>) => { f.input.current.bindings.feedback_sha256 = hash("changed"); },
    (f: ReturnType<typeof setup>) => { f.input.reviewer.native = Buffer.from("lost original native result"); },
    (f: ReturnType<typeof setup>) => { f.transport.identity = async () => ({ repository: "fixture/docs", repository_id: 10, default_branch: "main", actor: "other", actor_id: 99 }); },
  ]) {
    const f = setup(); const execute = f.transport.execute;
    f.transport.execute = async (plan, effect, objects) => {
      if (effect.kind === "pr-create") throw new PublicationExecutionError(false, true);
      await execute(plan, effect, objects);
    };
    const interrupted = await publish(options(f)); f.transport.execute = execute; change(f);
    const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
    expect(result.state).toBe("pending");
    expect(f.executed).toEqual(["lease", "receipt", "push"]);
  }
});

test("completed business effects can finish observation after lease loss without foreign cleanup", async () => {
  for (const foreign of [null, "f".repeat(40)]) {
    const { f, interrupted } = await interruptedPR();
    if (foreign === null) f.refs.delete(f.settings.publication.lease_ref);
    else f.refs.set(f.settings.publication.lease_ref, foreign);
    const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
    expect(result.state).toBe("complete");
    expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
    expect(f.refs.get(f.settings.publication.lease_ref)).toBe(foreign ?? undefined);
  }
});

test("interruption after explanation never duplicates it, while edited explanations block closure", async () => {
  for (const changed of [false, true]) {
    const f = setup();
    const effects: Effect[] = [f.input.manifest.effects[0], f.input.manifest.effects[1],
      { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [], body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } },
      { id: "close", kind: "pr-close", payload: { number: 77, expected_head: "e".repeat(40) } }, f.input.manifest.effects[4]];
    f.input = fixture(f.input.manifest.bindings, effects);
    f.gate = async () => ({ review: f.input, policy: f.policy });
    f.plan = sealPlan({ reviewed: validateReviewedManifest(f.input), grants: f.input.grants, ...f.policy, corrections: [], attention: [] });
    const execute = f.transport.execute;
    f.transport.execute = async (plan, effect, objects) => {
      await execute(plan, effect, objects);
      if (effect.kind === "comment-create") throw Error("interrupted after explanation");
    };
    const interrupted = await publish(options(f)); f.transport.execute = execute;
    if (changed) {
      const observe = f.transport.observe;
      f.transport.observe = async (plan, effect, objects) => effect.id === "explain" ? { state: "conflict", reason: "native-comment-payload-changed" } : observe(plan, effect, objects);
    }
    const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
    expect(f.executed.filter(id => id === "explain")).toHaveLength(1);
    expect(f.executed.includes("close")).toBe(!changed);
    expect(result.state).toBe(changed ? "pending" : "complete");
  }
});

test("lost lease-release acknowledgement is observed without repeating deletion", async () => {
  const f = setup(); const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "lease-release") throw Error("release response lost");
  };
  const interrupted = await publish(options(f)); f.transport.execute = execute;
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("complete");
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
});

test("lost issue acknowledgement is reconciled without creating another issue", async () => {
  const f = setup();
  const effects: Effect[] = [f.input.manifest.effects[0], f.input.manifest.effects[1],
    { id: "issue", kind: "issue-create", payload: { title: "Selected issue", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue"), labels: [], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.input.manifest.bindings.source_commit, evidence_sha256: hash("synthetic published analysis") } }, f.input.manifest.effects[4]];
  f.input = fixture(f.input.manifest.bindings, effects); f.gate = async () => ({ review: f.input, policy: f.policy });
  f.plan = sealPlan({ reviewed: validateReviewedManifest(f.input), grants: f.input.grants, ...f.policy, corrections: [], attention: [] });
  const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => { await execute(plan, effect, objects); if (effect.kind === "issue-create") throw Error("issue response lost"); };
  const interrupted = await publish(options(f)); f.transport.execute = execute;
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("complete"); expect(f.executed.filter(id => id === "issue")).toHaveLength(1);
});

test("an already-recorded explanation must still match before a pending closure", async () => {
  const f = setup();
  const effects: Effect[] = [f.input.manifest.effects[0], f.input.manifest.effects[1],
    { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [], body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } },
    { id: "close", kind: "pr-close", payload: { number: 77, expected_head: "e".repeat(40) } }, f.input.manifest.effects[4]];
  f.input = fixture(f.input.manifest.bindings, effects); f.gate = async () => ({ review: f.input, policy: f.policy });
  f.plan = sealPlan({ reviewed: validateReviewedManifest(f.input), grants: f.input.grants, ...f.policy, corrections: [], attention: [] });
  const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => { if (effect.kind === "pr-close") throw Error("interrupted before closure"); await execute(plan, effect, objects); };
  const interrupted = await publish(options(f)); f.transport.execute = execute;
  expect(interrupted.journal.events.some(event => event.effect_id === "explain" && event.kind === "outcome")).toBe(true);
  const observe = f.transport.observe;
  f.transport.observe = async (plan, effect, objects) => effect.id === "explain" ? { state: "conflict", reason: "native-comment-payload-changed" } : observe(plan, effect, objects);
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("pending"); expect(f.executed).toEqual(["lease", "receipt", "explain"]);
});

test("lost local artifacts permit fixed-ref inspection without manufacturing original proof", async () => {
  const { f, interrupted } = await interruptedPR();
  rmSync(interrupted.journal.directory, { recursive: true });
  f.input.reviewer.native = Buffer.from("original proof unavailable");
  const artifactRoot = f.artifacts;
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: artifactRoot, settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  expect(inspection.state).toBe("inspection");
  expect(inspection.policy_state).toBe("current");
  expect(inspection.observations.find(item => item.effect_id === "pr")?.observation.state).toBe("done");
  expect(readFileSync(join(inspection.directory, "plan.json"), "utf8")).toContain("Exact reviewed body");
  await expect(restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: artifactRoot } })).rejects.toThrow();
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
});

test("retained-plan restoration remains observation-only and never duplicates an existing PR", async () => {
  const { f, interrupted } = await interruptedPR();
  rmSync(interrupted.journal.directory, { recursive: true });
  const artifactRoot = join(f.root, "restored"); mkdirSync(artifactRoot, { mode: 0o700 });
  f.transport = { ...f.transport, artifact_root: artifactRoot };
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: artifactRoot, settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  await expect(restoreRetainedOperation({ inspection: structuredClone(inspection), publication: { ...options(f), artifact_root: artifactRoot } })).rejects.toThrow("inspection");
  const result = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: artifactRoot } });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("retained-restore-no-replay");
  expect(result.journal.header.recovery_mode).toBe("observation-only");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
  expect(f.refs.has(f.settings.publication.receipt_ref_prefix + "operation-1")).toBe(true);
});

test("retained inspection refuses a foreign operation or modified metadata bytes", async () => {
  const { f } = await interruptedPR();
  await expect(inspectRetainedOperation({ source_repo: f.repo, artifact_root: f.artifacts, settings: f.settings, transport: f.transport, operation_id: "other-operation", verify_policy: () => f.policy })).rejects.toThrow("scope");
  const read = f.transport.readPlanObject;
  f.transport.readPlanObject = async object => ({ ...await read(object), bytes: Buffer.from("{}") });
  await expect(inspectRetainedOperation({ source_repo: f.repo, artifact_root: f.artifacts, settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy })).rejects.toThrow();
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
});

test("retained byte buffers cannot change while independent outcomes are inspected", async () => {
  const { f } = await interruptedPR();
  const read = f.transport.readPlanObject, observe = f.transport.observe;
  let raw: Uint8Array | null = null;
  f.transport.readPlanObject = async object => { const result = await read(object); raw = result.bytes; return result; };
  f.transport.observe = async (plan, effect, objects) => { raw?.fill(32); return observe(plan, effect, objects); };
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: f.artifacts, settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  expect(sha256(readFileSync(join(inspection.directory, "plan.json")))).toBe(inspection.objects.plan_sha256);
});


test("missing local payload bytes stop ordinary resume before every remote action", async () => {
  const { f, interrupted } = await interruptedPR();
  unlinkSync(join(interrupted.journal.directory, "plan.json"));
  await expect(resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory })).rejects.toThrow();
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
});

test("an observed material explanation change invalidates the old batch even after restoration", async () => {
  const f = setup();
  const effects: Effect[] = [
    f.input.manifest.effects[0], f.input.manifest.effects[1],
    { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [], body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } },
    { id: "close", kind: "pr-close", payload: { number: 77, expected_head: "e".repeat(40) } },
    f.input.manifest.effects[4],
  ];
  f.input = fixture(f.input.manifest.bindings, effects);
  f.gate = async () => ({ review: f.input, policy: f.policy });
  f.plan = sealPlan({ reviewed: validateReviewedManifest(f.input), grants: f.input.grants, ...f.policy, corrections: [], attention: [] });
  const execute = f.transport.execute, observe = f.transport.observe;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-close") throw Error("interrupted before closure");
    await execute(plan, effect, objects);
  };
  const interrupted = await publish(options(f));
  f.transport.execute = execute;
  f.transport.observe = async (plan, effect, objects) => effect.id === "explain"
    ? { state: "conflict", reason: "native-comment-payload-changed" } : observe(plan, effect, objects);
  expect((await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory })).state).toBe("pending");
  f.transport.observe = observe;
  const restored = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(restored.state).toBe("pending");
  expect(f.executed.includes("close")).toBe(false);
  expect(f.executed.filter(id => id === "explain")).toHaveLength(1);
});

test("observed source or actor changes cannot revive old approval when restored", async () => {
  for (const changed of ["source", "actor"] as const) {
    const f = setup(), execute = f.transport.execute, identity = f.transport.identity;
    f.transport.execute = async (plan, effect, objects) => {
      if (effect.kind === "pr-create") throw new PublicationExecutionError(false, true);
      await execute(plan, effect, objects);
    };
    const interrupted = await publish(options(f));
    f.transport.execute = execute;
    const original = f.input.current.bindings.feedback_sha256;
    if (changed === "source") f.input.current.bindings.feedback_sha256 = hash("changed feedback");
    else f.transport.identity = async () => ({ repository: "fixture/docs", repository_id: 10, default_branch: "main", actor: "other", actor_id: 99 });
    expect((await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory })).state).toBe("pending");
    f.input.current.bindings.feedback_sha256 = original;
    f.transport.identity = identity;
    expect((await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory })).state).toBe("pending");
    expect(f.executed).toEqual(["lease", "receipt", "push"]);
  }
});

test("concurrent recovery cannot dispatch the same pending creation twice", async () => {
  const f = setup(), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-create") throw new PublicationExecutionError(false, true);
    await execute(plan, effect, objects);
  };
  const interrupted = await publish(options(f));
  let entered!: () => void;
  const firstDispatch = new Promise<void>(resolve => { entered = resolve; });
  let creates = 0;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-create") {
      creates += 1;
      entered();
      await Bun.sleep(1000);
    }
    await execute(plan, effect, objects);
  };
  const first = resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  await firstDispatch;
  const second = resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  await Promise.allSettled([first, second]);
  expect(creates).toBe(1);
});


test("independent mirrors cannot dispatch an already claimed creation", async () => {
  const f = setup(), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-create") throw new PublicationExecutionError(false, true);
    await execute(plan, effect, objects);
  };
  const interrupted = await publish(options(f));
  const secondRoot = join(f.root, "second-mirror");
  mkdirSync(secondRoot, { mode: 0o700 });
  const secondTransport = { ...f.transport, artifact_root: secondRoot };
  let entered!: () => void;
  const firstDispatch = new Promise<void>(resolve => { entered = resolve; });
  let creates = 0;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-create") { creates += 1; entered(); await Bun.sleep(1000); }
    await execute(plan, effect, objects);
  };
  secondTransport.execute = f.transport.execute;
  const first = resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  await firstDispatch;
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: secondRoot, settings: f.settings,
    transport: secondTransport, operation_id: "operation-1", verify_policy: () => f.policy });
  const second = restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: secondRoot, transport: secondTransport } });
  const results = await Promise.allSettled([first, second]);
  expect(results.every(result => result.status === "fulfilled")).toBe(true);
  expect(creates).toBe(1);
});


test("an unconfirmed started creation is never replayed from an empty later listing", async () => {
  const f = setup(), execute = f.transport.execute;
  let attempts = 0;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-create") { attempts += 1; throw new PublicationExecutionError(true, true); }
    await execute(plan, effect, objects);
  };
  const interrupted = await publish(options(f));
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("dispatch-outcome-unknown");
  expect(attempts).toBe(1);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
});

test("only a pending lease release needs no new review of completed mutable resources", async () => {
  const f = setup(), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "lease-release") throw new PublicationExecutionError(false, true);
    await execute(plan, effect, objects);
  };
  const interrupted = await publish(options(f));
  f.transport.execute = execute;
  const observe = f.transport.observe;
  f.observed.length = 0;
  f.transport.observe = async (plan, effect, objects) => effect.id === "push" || effect.id === "pr"
    ? { state: "conflict", reason: "later-resource-change" } : observe(plan, effect, objects);
  const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(result.state).toBe("complete");
  expect(f.observed).toEqual(["release", "release"]);
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
});

test("a different artifact argument cannot bypass the selected controller root", async () => {
  const { f } = await interruptedPR();
  const other = join(f.root, "unselected");
  mkdirSync(other, { mode: 0o700 });
  await expect(inspectRetainedOperation({ source_repo: f.repo, artifact_root: other, settings: f.settings,
    transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy })).rejects.toThrow("root changed");
});

test("an existing owner record prevents restoration over a lost local journal", async () => {
  const { f, interrupted } = await interruptedPR();
  rmSync(interrupted.journal.directory, { recursive: true });
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: f.artifacts, settings: f.settings,
    transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  await expect(restoreRetainedOperation({ inspection, publication: options(f) })).rejects.toThrow("conflict");
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
});

test("a second original journal cannot adopt the first run's matching-plan lease", async () => {
  const f = setup();
  const effects: Effect[] = [f.input.manifest.effects[0], f.input.manifest.effects[1],
    { id: "issue", kind: "issue-create", payload: { title: "Selected issue", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue"),
      labels: [], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md",
      evidence_commit: f.input.manifest.bindings.source_commit, evidence_sha256: hash("selected analysis") } }, f.input.manifest.effects[4]];
  f.input = fixture(f.input.manifest.bindings, effects);
  f.gate = async () => ({ review: f.input, policy: f.policy });
  f.plan = sealPlan({ reviewed: validateReviewedManifest(f.input), grants: f.input.grants, ...f.policy, corrections: [], attention: [] });
  const execute = f.transport.execute;
  let entered!: () => void, release!: () => void, creates = 0;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "issue-create") { creates += 1; entered(); await finish; }
    await execute(plan, effect, objects);
  };
  const first = publish(options(f));
  await started;
  const secondRoot = join(f.root, "second-original");
  mkdirSync(secondRoot, { mode: 0o700 });
  const secondOptions = { ...options(f), artifact_root: secondRoot, transport: { ...f.transport, artifact_root: secondRoot } };
  const second = await publish(secondOptions);
  expect(second.state).toBe("pending");
  const resumed = resumeEffects({ ...secondOptions, journal_directory: second.journal.directory });
  try { await Bun.sleep(200); expect(creates).toBe(1); }
  finally { release(); await Promise.allSettled([first, resumed]); }
});


test("a foreign unreadable lease does not prevent read-only inspection of the retained plan", async () => {
  const { f } = await interruptedPR();
  f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: f.artifacts,
    settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  expect(inspection.state).toBe("inspection");
  expect(inspection.lease_object).toBeNull();
  expect(inspection.observations.find(item => item.effect_id === "pr")?.observation.state).toBe("done");
  expect(f.executed.includes("release")).toBe(false);
});


test("normal contention can wait for an unrelated lease without invalidating the reviewed operation", async () => {
  const f = setup();
  f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
  const waiting = await publish(options(f));
  expect(waiting.state).toBe("pending");
  expect(waiting.journal.events.some(event => event.kind === "invalidation")).toBe(false);
  const stillWaiting = await resumeEffects({ ...options(f), journal_directory: waiting.journal.directory });
  expect(stillWaiting.state).toBe("pending");
  expect(stillWaiting.journal.events.some(event => event.kind === "invalidation")).toBe(false);
  f.refs.delete(f.settings.publication.lease_ref);
  expect((await resumeEffects({ ...options(f), journal_directory: waiting.journal.directory })).state).toBe("complete");
});

test("lease-fallback restoration records the actually observed nonce-bearing object", async () => {
  const { f } = await interruptedPR();
  f.refs.delete(f.settings.publication.receipt_ref_prefix + "operation-1");
  const recovered = join(f.root, "fallback-root");
  mkdirSync(recovered, { mode: 0o700 });
  f.transport = { ...f.transport, artifact_root: recovered };
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: recovered, settings: f.settings,
    transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  const result = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: recovered } });
  const origin = JSON.parse(readFileSync(join(result.journal.directory, "retained-origin.json"), "utf8"));
  expect(inspection.ref).toBe(f.settings.publication.lease_ref);
  expect(origin.object).toBe(inspection.objects.object);
});

test("a completed operation can be reconstructed read-only after its lease and original proof are gone", async () => {
  const f = setup();
  const original = await publish(options(f));
  expect(original.state).toBe("complete");
  f.input.grants = [];
  f.input.reviewer.native = Buffer.from("lost original proof");
  const recovered = join(f.root, "completed-mirror");
  mkdirSync(recovered, { mode: 0o700 });
  f.transport = { ...f.transport, artifact_root: recovered };
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: recovered, settings: f.settings,
    transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  const result = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: recovered } });
  expect(result.state).toBe("complete");
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr", "release"]);
});

test("a changed receipt after atomic acquisition stops before business effects", async () => {
  const f = setup(), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "lease-acquire") {
      f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", objects.object);
      f.done.add("receipt");
    }
  };
  const result = await publish(options(f));
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("foreign-receipt-object");
  expect(f.executed).toEqual(["lease", "receipt"]);
});

test("an operation observed elsewhere remains non-replaying even after receipt cleanup", async () => {
  const f = setup();
  const { writePlanObject } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const objects = writePlanObject(f.store, f.plan);
  f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", objects.object);
  const waiting = await publish(options(f));
  f.refs.delete(f.settings.publication.receipt_ref_prefix + "operation-1");
  const resumed = await resumeEffects({ ...options(f), journal_directory: waiting.journal.directory });
  expect(resumed.state).toBe("pending");
  expect(f.executed).toEqual([]);
  expect(resumed.journal.events.some(event => event.kind === "invalidation")).toBe(false);
});


test("an original legacy acquiring run can release only its owned completed recovery-only lease", async () => {
  const f = setup(), stopped = await legacyReceiptInterruption(f);
  f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", stopped.objects.object);
  for (const id of ["receipt", "push", "pr"]) f.done.add(id);
  appendRecoveryOnly(stopped.journal, "receipt", "operation-started-elsewhere");
  const result = await resumeEffects({ ...options(f), journal_directory: stopped.journal.directory });
  expect(result.state).toBe("complete");
  expect(f.executed).toEqual(["lease", "release"]);
});


test("a delayed nonce acquisition can outlive a replayed run's release", async () => {
  const f = setup(), execute = f.transport.execute;
  let lateAcquire: (() => Promise<void>) | null = null, calls = 0;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "lease-acquire" && ++calls === 1) {
      lateAcquire = async () => { await execute(plan, effect, objects); };
      throw new PublicationExecutionError(true, true);
    }
    await execute(plan, effect, objects);
  };
  const interrupted = await publish(options(f));
  const refused = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  expect(refused.state).toBe("pending");
  expect(refused.reason).toBe("dispatch-outcome-unknown");
  expect(calls).toBe(1);
  // Model the proposed unsafe replay directly on this synthetic remote.
  for (const effect of f.plan.manifest.effects) await execute(f.plan, effect, interrupted.objects);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  if (lateAcquire === null) throw Error("missing delayed accepted acquisition");
  await (lateAcquire as () => Promise<void>)();
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
});


test("a lease acquired by the next run after release does not invalidate completed publication", async () => {
  const f = setup(), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "lease-release") f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
  };
  const result = await publish(options(f));
  expect(result.state).toBe("complete");
  expect(result.journal.events.some(event => event.kind === "invalidation")).toBe(false);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe("f".repeat(40));
});


test("an absent business effect cannot replay after the publication lease is lost", async () => {
  for (const replacement of [null, "f".repeat(40)]) {
    const f = setup(), execute = f.transport.execute;
    f.transport.execute = async (plan, effect, objects) => {
      if (effect.kind === "pr-create") throw new PublicationExecutionError(false, true);
      await execute(plan, effect, objects);
    };
    const stopped = await publish(options(f));
    f.transport.execute = execute;
    if (replacement === null) f.refs.delete(f.settings.publication.lease_ref);
    else f.refs.set(f.settings.publication.lease_ref, replacement);
    const result = await resumeEffects({ ...options(f), journal_directory: stopped.journal.directory });
    expect(result.state).toBe("pending");
    expect(f.executed).toEqual(["lease", "receipt", "push"]);
    expect(f.refs.get(f.settings.publication.lease_ref)).toBe(replacement ?? undefined);
  }
});


test("an uncertain sent candidate push stays pending instead of dispatching another create", async () => {
  const f = setup(), execute = f.transport.execute;
  let pushes = 0;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "push" && ++pushes === 1) throw new PublicationExecutionError(true, true);
    await execute(plan, effect, objects);
  };
  const stopped = await publish(options(f));
  const result = await resumeEffects({ ...options(f), journal_directory: stopped.journal.directory });
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("dispatch-outcome-unknown");
  expect(pushes).toBe(1);
  expect(f.executed.includes("pr")).toBe(false);
});


test("a receipt landing after the precheck cannot leave a new original holding a lease", async () => {
  const f = setup(), execute = f.transport.execute, other = join(f.root, "other-acquirer");
  mkdirSync(other, { mode: 0o700 });
  const earlier = createJournal({ source_repo: f.repo, artifact_root: other, plan: f.plan });
  const priorObjects = writePublicationObjects(f.store, f.plan, earlier.header);
  const receiptRef = f.settings.publication.receipt_ref_prefix + "operation-1";
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "lease-acquire") f.refs.set(receiptRef, priorObjects.receipt_object);
    await execute(plan, effect, objects);
  };
  const result = await publish(options(f));
  expect(result.state).toBe("pending");
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  expect(f.refs.get(receiptRef)).toBe(priorObjects.receipt_object);
  expect(f.executed).toEqual(["lease"]);
});


test("a completed retained operation can be reconstructed read-only while another plan holds the lease", async () => {
  for (const when of ["before-inspection", "after-inspection"] as const) {
    const f = setup();
    const completed = await publish(options(f));
    expect(completed.state).toBe("complete");
    const effects = structuredClone(f.input.manifest.effects);
    effects[1].payload.ref = f.settings.publication.receipt_ref_prefix + "operation-2";
    effects[3].payload.body = String(effects[3].payload.body).replace("operation-1", "operation-2");
    const other = fixture(f.input.manifest.bindings, effects, "operation-2");
    const foreignPlan = sealPlan({ reviewed: validateReviewedManifest(other), grants: other.grants,
      ...f.policy, corrections: [], attention: [] });
    const foreign = writePlanObject(f.store, foreignPlan);
    const artifacts = join(f.root, "historical-observer"); mkdirSync(artifacts, { mode: 0o700 });
    f.transport = { ...f.transport, artifact_root: artifacts };
    if (when === "before-inspection") f.refs.set(f.settings.publication.lease_ref, foreign.object);
    const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: artifacts,
      settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
    f.refs.set(f.settings.publication.lease_ref, foreign.object);
    const before = [...f.executed];
    const restored = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: artifacts } });
    expect(restored.state).toBe("complete");
    expect(f.executed).toEqual(before);
    expect(f.refs.get(f.settings.publication.lease_ref)).toBe(foreign.object);
  }
});


test("retained reconstruction stays pending for an unreadable or newly replaced same-plan lease", async () => {
  for (const mode of ["unreadable", "same-plan"] as const) {
    const f = setup(); await publish(options(f));
    const artifacts = join(f.root, "uncertain-lease-observer"); mkdirSync(artifacts, { mode: 0o700 });
    f.transport = { ...f.transport, artifact_root: artifacts };
    const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: artifacts,
      settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
    const unused = join(f.root, "same-plan-lease"); mkdirSync(unused, { mode: 0o700 });
    const created = createJournal({ source_repo: f.repo, artifact_root: unused, plan: f.plan });
    const samePlan = writePublicationObjects(f.store, f.plan, created.header);
    f.refs.set(f.settings.publication.lease_ref, mode === "same-plan" ? samePlan.lease_object : "f".repeat(40));
    const before = [...f.executed];
    const restored = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: artifacts } });
    expect(restored.state).toBe("pending");
    expect(f.executed).toEqual(before);
  }
});


test("a receipt appearing during lease-fallback inspection requires a fresh coherent inspection", async () => {
  const f = setup(), stopped = await legacyReceiptInterruption(f), observe = f.transport.observe;
  const receiptRef = f.settings.publication.receipt_ref_prefix + "operation-1";
  f.transport.observe = async (plan, effect, objects) => {
    if (effect.kind === "lease-acquire") { f.refs.set(receiptRef, stopped.objects.object); f.done.add("receipt"); }
    return observe(plan, effect, objects);
  };
  const input = { source_repo: f.repo, artifact_root: f.artifacts, settings: f.settings, transport: f.transport,
    operation_id: "operation-1", verify_policy: () => f.policy };
  await expect(inspectRetainedOperation(input)).rejects.toThrow("receipt changed");
  const fresh = await inspectRetainedOperation(input);
  expect(fresh.receipt_object).toBe(stopped.objects.object);
  expect(fresh.observations.find(item => item.effect_id === "receipt")?.observation.state).toBe("done");
});

test.each(["adoption", "model", "unavailable"] as const)("retained inspection survives %s policy drift while preserving ambiguous lease ownership", async changed => {
  const { f, interrupted } = await interruptedPR();
  const artifactRoot = join(f.root, "policy-drift-restoration"); mkdirSync(artifactRoot, { mode: 0o700 });
  f.transport = { ...f.transport, artifact_root: artifactRoot };
  const currentPolicy = { ...f.policy, adoption_sha256: changed === "adoption" ? hash("new adoption") : f.policy.adoption_sha256,
    worker: changed === "model" ? { ...f.policy.worker, adopted_model: "claude-opus-5.6" } : f.policy.worker };
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: artifactRoot, settings: f.settings,
    transport: f.transport, operation_id: "operation-1", verify_policy: () => {
      if (changed === "unavailable") throw Error("current policy unavailable");
      return currentPolicy;
    } });
  expect(inspection.policy_state).toBe("unavailable-or-changed");
  const before = [...f.executed];
  const restored = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: artifactRoot,
    gate: async () => { throw Error("old business grant unavailable"); } } });
  expect(restored.journal.header.recovery_mode).toBe("observation-only");
  expect(restored.state).toBe("pending");
  expect(f.executed).toEqual(before);
  const completed = await reconcileAbsent({ source_repo: f.repo, journal_directory: restored.journal.directory, object_store: f.store,
    settings: f.settings, transport: f.transport, retire_effect_ids: [],
    authorize: async scope => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("current exact-owned cleanup request") }) });
  expect(completed.state).toBe("pending");
  expect(completed.reason).toBe("inferred-publication-lease");
  expect(f.executed).toEqual(before);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(interrupted.objects.lease_object);
  expect(interrupted.journal.plan.adoption_sha256).toBe(f.plan.adoption_sha256);
});

test("policy-drift inspection never turns an unseen retained action into a replay grant", async () => {
  const f = setup(), observe = f.transport.observe;
  f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state: "unknown", reason: "initial-read-unavailable" } : observe(plan, effect, objects);
  await publish(options(f)); f.transport.observe = observe;
  const artifactRoot = join(f.root, "unseen-policy-drift"); mkdirSync(artifactRoot, { mode: 0o700 });
  f.transport = { ...f.transport, artifact_root: artifactRoot };
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: artifactRoot, settings: f.settings,
    transport: f.transport, operation_id: "operation-1", verify_policy: () => null });
  expect(inspection.policy_state).toBe("unavailable-or-changed");
  const before = [...f.executed];
  const restored = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: artifactRoot } });
  expect(restored.state).toBe("pending"); expect(restored.reason).toBe("retained-restore-no-replay");
  expect(f.executed).toEqual(before); expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
});


test.each(["held", "released", "same-operation"] as const)("acquisition between recovery reads preserves the reviewed operation (%s)", async state => {
  const f = setup(), journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const competitorRoot = join(f.root, "racing-owner"); mkdirSync(competitorRoot, { mode: 0o700 });
  const competitor = createJournal({ source_repo: f.repo, artifact_root: competitorRoot, plan: f.plan });
  const competing = writePublicationObjects(f.store, f.plan, competitor.header), observe = f.transport.observe;
  let race = true;
  f.transport.observe = async (plan, effect, objects) => {
    if (effect.kind !== "lease-acquire" || !race) return observe(plan, effect, objects);
    race = false;
    f.refs.set(f.settings.publication.lease_ref, competing.lease_object);
    if (state === "same-operation") f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", competing.receipt_object);
    const result = await observe(plan, effect, objects);
    if (state === "released") f.refs.delete(f.settings.publication.lease_ref);
    return result;
  };
  const stopped = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(stopped.journal.events.some(event => event.kind === "invalidation")).toBe(false);
  expect(stopped.state).toBe("pending");
  expect(stopped.reason).toBe(state === "same-operation" ? "operation-started-elsewhere" : "publication-lease-occupied");
  expect(f.executed).toEqual([]);
  f.refs.delete(f.settings.publication.lease_ref);
  if (state === "same-operation") f.refs.delete(f.settings.publication.receipt_ref_prefix + "operation-1");
  const resumed = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  if (state === "same-operation") {
    expect(resumed.state).toBe("pending");
    expect(resumed.journal.events.some(event => event.kind === "recovery-only")).toBe(true);
    expect(f.executed).toEqual([]);
  } else {
    expect(resumed.state).toBe("complete");
    expect(f.executed).toEqual(["lease", "receipt", "push", "pr", "release"]);
  }
});


test("a late own acquisition after a competing observation stays recoverable", async () => {
  const f = setup();
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  journal = appendIntent(journal, "lease");
  journal = appendIntent(journal, "receipt", "lease");
  journal = appendAttempt(journal, "lease", "delayed-acquisition", undefined, "receipt");
  journal = appendAttemptEnd(journal, "lease", { attempt_id: "delayed-acquisition", sent: true, reaped: true });
  const observe = f.transport.observe;
  let late = true;
  f.transport.observe = async (plan, effect, objects) => {
    if (effect.kind !== "lease-acquire" || !late) return observe(plan, effect, objects);
    late = false;
    f.refs.set(f.settings.publication.lease_ref, "e".repeat(40));
    const earlier = await observe(plan, effect, objects);
    if (!objects.lease_object || !objects.receipt_object) throw Error("missing per-run metadata");
    f.refs.set(f.settings.publication.lease_ref, objects.lease_object);
    f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", objects.receipt_object);
    f.done.add("lease"); f.done.add("receipt");
    return earlier;
  };
  const stopped = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(stopped.reason).toBe("lease-acquisition-observation-changed");
  expect(stopped.journal.events.some(event => event.kind === "invalidation" || event.kind === "recovery-only")).toBe(false);
  expect(f.executed).toEqual([]);
  const completed = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(completed.state).toBe("complete");
  expect(f.executed).toEqual(["push", "pr", "release"]);
});


test.each(["precheck", "post-conflict"] as const)("own atomic receipt arriving between lease and receipt reads stays recoverable (%s)", async phase => {
  const f = setup();
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  journal = appendIntent(journal, "lease"); journal = appendIntent(journal, "receipt", "lease");
  journal = appendAttempt(journal, "lease", "late-own-receipt", undefined, "receipt");
  journal = appendAttemptEnd(journal, "lease", { attempt_id: "late-own-receipt", sent: true, reaped: true });
  const objects = writePublicationObjects(f.store, f.plan, journal.header);
  const ref = f.transport.ref, observe = f.transport.observe;
  let conflicted = false, arrived = false;
  if (phase === "precheck") f.refs.set(f.settings.publication.lease_ref, "e".repeat(40));
  f.transport.ref = async name => {
    const earlier = await ref(name);
    if (!arrived && name === f.settings.publication.lease_ref && (phase === "precheck" || conflicted)) {
      arrived = true;
      f.refs.set(f.settings.publication.lease_ref, objects.lease_object);
      f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", objects.receipt_object);
      f.done.add("lease"); f.done.add("receipt");
    }
    return earlier;
  };
  f.transport.observe = async (plan, effect, current) => {
    if (phase !== "post-conflict" || effect.kind !== "lease-acquire" || conflicted) return observe(plan, effect, current);
    f.refs.set(f.settings.publication.lease_ref, "e".repeat(40));
    const earlier = await observe(plan, effect, current);
    f.refs.delete(f.settings.publication.lease_ref); conflicted = true;
    return earlier;
  };
  const stopped = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(stopped.journal.events.some(event => event.kind === "invalidation" || event.kind === "recovery-only")).toBe(false);
  expect(stopped.reason).toBe("lease-acquisition-observation-changed");
  expect(f.executed).toEqual([]);
  const completed = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(completed.state).toBe("complete");
  expect(f.executed).toEqual(["push", "pr", "release"]);
});


test("an own receipt arriving at the final acquisition guard is reobserved without replay", async () => {
  const f = setup(), journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const objects = writePublicationObjects(f.store, f.plan, journal.header), ref = f.transport.ref;
  let leaseReads = 0;
  f.transport.ref = async name => {
    const earlier = await ref(name);
    if (name === f.settings.publication.lease_ref && ++leaseReads === 2) {
      let concurrent = readJournal(journal.directory, f.repo);
      concurrent = appendIntent(concurrent, "receipt", "lease");
      concurrent = appendAttempt(concurrent, "lease", "concurrent-own-acquisition", undefined, "receipt");
      appendAttemptEnd(concurrent, "lease", { attempt_id: "concurrent-own-acquisition", sent: true, reaped: true });
      f.refs.set(f.settings.publication.lease_ref, objects.lease_object);
      f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", objects.receipt_object);
      f.done.add("lease"); f.done.add("receipt");
    }
    return earlier;
  };
  const stopped = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(stopped.reason).toBe("lease-acquisition-observation-changed");
  expect(stopped.journal.events.some(event => event.kind === "invalidation" || event.kind === "recovery-only")).toBe(false);
  expect(f.executed).toEqual([]);
  const completed = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(completed.state).toBe("complete");
  expect(f.executed).toEqual(["push", "pr", "release"]);
});

test("a canonical legacy receipt retains ambiguous-run fencing", async () => {
  const f = setup(), created = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const legacy = { ...created.header }; delete legacy.observed_receipt_object;
  writeFileSync(join(created.directory, "header.json"), canonicalJSON(legacy));
  writeFileSync(join(f.artifacts, "operation-1.journal-owner.json"), canonicalJSON(legacy));
  const journal = readJournal(created.directory, f.repo), objects = writePublicationObjects(f.store, f.plan, journal.header);
  expect(objects.receipt_object).toBe(objects.object);
  f.refs.set(f.settings.publication.lease_ref, "e".repeat(40));
  f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", objects.receipt_object);
  const result = await resumeEffects({ ...options(f), journal_directory: journal.directory });
  expect(result.reason).toBe("operation-started-elsewhere");
  expect(result.journal.events.some(event => event.kind === "recovery-only")).toBe(true);
  expect(result.journal.events.some(event => event.kind === "invalidation")).toBe(false);
  expect(f.executed).toEqual([]);
});

for (const route of ["resume", "cleanup"] as const) for (const recorded of [false, true])
test(`recovery retains its lease until an observed write's executor settles (${route}, recorded=${recorded})`, async () => {
  const f = setup(), execute = f.transport.execute;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.id === "pr") { entered(); await finish; }
  };
  const running = publish(options(f));
  await started;
  try {
    const directory = join(f.artifacts, "docs-drift-operation-1");
    if (recorded) {
      const journal = readJournal(directory, f.repo);
      const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
      const observation = await f.transport.observe(f.plan, effect, writePublicationObjects(f.store, f.plan, journal.header));
      if (observation.state !== "done") throw Error("missing synthetic applied state");
      appendOutcome(journal, effect.id, observation.outcome);
    }
    const result = route === "resume"
      ? await resumeEffects({ ...options(f), journal_directory: directory })
      : await reconcileAbsent({ source_repo: f.repo, journal_directory: directory, object_store: f.store,
        settings: f.settings, transport: f.transport, retire_effect_ids: [],
        authorize: async scope => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("current cleanup request") }) });
    expect(result.state).toBe("pending");
    expect(result.reason).toBe("attempt-in-flight");
    expect(result.journal.events.some(event => event.effect_id === "pr" && event.kind === "outcome")).toBe(recorded);
    expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
    expect(f.executed.includes("release")).toBe(false);
  } finally { release(); }
  const settled = await running;
  // A legacy observer may have recorded the outcome before the executor's ending.
  const recovered = await resumeEffects({ ...options(f), journal_directory: settled.journal.directory });
  expect(recovered.state).toBe("complete");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(1);
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
});
