import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { inspectRetainedOperation, restoreRetainedOperation, resumeEffects } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { readJournal, sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { fixture, hash } from "./manifest-fixture";
import { publicationFixture, publicationOptions as options } from "./publication-fixture";

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

test("a replacement or lost lease never authorizes reacquisition or foreign cleanup", async () => {
  for (const foreign of [null, "f".repeat(40)]) {
    const { f, interrupted } = await interruptedPR();
    if (foreign === null) f.refs.delete(f.settings.publication.lease_ref);
    else f.refs.set(f.settings.publication.lease_ref, foreign);
    const result = await resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
    expect(result.state).toBe("pending");
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

test("a receipt appearing during acquisition cannot be adopted as this run's retention", async () => {
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
  expect(result.reason).toBe("operation-started-elsewhere");
  expect(f.executed).toEqual(["lease"]);
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


test("an original acquiring run can release only its owned completed recovery-only lease", async () => {
  const f = setup(), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "lease-acquire") {
      f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", objects.object);
      for (const id of ["receipt", "push", "pr"]) f.done.add(id);
    }
  };
  const stopped = await publish(options(f));
  expect(stopped.reason).toBe("operation-started-elsewhere");
  const result = await resumeEffects({ ...options(f), journal_directory: stopped.journal.directory });
  expect(result.state).toBe("complete");
  expect(f.executed).toEqual(["lease", "release"]);
});
