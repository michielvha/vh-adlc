import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { publish, validatePublicationShape } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { createJournal, writePublicationObjects, sealPlan, readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { resumeEffects } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { fixture, hash, bindings } from "./manifest-fixture";
import { publicationFixture, publicationOptions as options } from "./publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const setup = () => publicationFixture(roots);

test("one publisher delivers exact reviewed payloads under the owned lease and retained receipt", async () => {
  const f = setup();
  const result = await publish(options(f));
  expect(result.state).toBe("complete");
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr", "release"]);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  expect(f.refs.has(f.settings.publication.receipt_ref_prefix + "operation-1")).toBe(true);
  expect(result.journal.plan.manifest.effects[3].payload.body).toBe(f.plan.manifest.effects[3].payload.body);
});

test("a pending foreign lease prevents every publication and cleanup effect", async () => {
  const f = setup(); f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
  const result = await publish(options(f));
  expect(result.state).toBe("pending"); expect(f.executed).toEqual([]);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe("f".repeat(40));
});

test("missing current authority, changed actor or stale source denies before native effects", async () => {
  for (const change of [
    (f: ReturnType<typeof setup>) => { f.input.grants = f.input.grants.filter(grant => grant.effect_id !== "receipt"); },
    (f: ReturnType<typeof setup>) => { f.input.current.bindings.source_commit = "d".repeat(40); },
    (f: ReturnType<typeof setup>) => { f.transport.identity = async () => ({ repository: "fixture/docs", repository_id: 10, actor: "foreign", actor_id: 99, default_branch: "main" }); },
    (f: ReturnType<typeof setup>) => { f.policy.adoption_sha256 = hash("changed"); },
  ]) {
    const f = setup(); change(f);
    await expect(publish(options(f))).rejects.toThrow();
    expect(f.executed).toEqual([]);
  }
});

test("under-lease payload changes stop business effects after atomic metadata creation", async () => {
  const f = setup();
  const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "lease-acquire") f.input.current.effects[3].payload.body = "changed after lease";
  };
  const result = await publish(options(f));
  expect(result.state).toBe("pending"); expect(f.executed).toEqual(["lease", "receipt"]);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
});

test("a lost effect response retains intent and lease without blind replay or early release", async () => {
  const f = setup(); const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "pr-create") throw Error("lost response");
  };
  const result = await publish(options(f));
  expect(result.state).toBe("pending"); expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
  expect(result.journal.events.filter(event => event.effect_id === "pr").map(event => event.kind)).toEqual(["intent", "attempt", "attempt-ended", "handoff"]);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
});

test("collector evidence and modified prepared payloads never enter native production publication", async () => {
  const f = setup();
  f.transport.kind = "native";
  await expect(publish(options(f))).rejects.toThrow("transport");
  expect(f.executed).toEqual([]);
  const other = setup(); other.plan = structuredClone(other.plan); other.plan.manifest.effects[3].payload.body = "after review";
  await expect(publish(options(other))).rejects.toThrow(); expect(other.executed).toEqual([]);
});

test("gate inspection cannot mutate the exact plan sent to a transport", async () => {
  const f = setup();
  let submittedBody: unknown = null;
  const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "pr-create") submittedBody = effect.payload.body;
    await execute(plan, effect, objects);
  };
  const result = await publish({ ...options(f), gate: async journal => {
    if (journal) journal.plan.manifest.effects[3].payload.body = "changed during gate inspection";
    return { review: f.input, policy: f.policy };
  } });
  expect(result.state).toBe("complete");
  expect(submittedBody).toBe(f.plan.manifest.effects[3].payload.body);
});

test("a consolidation refresh cannot finish while its PR retains the old receipt body", async () => {
  const f = setup();
  const effects = f.input.manifest.effects.filter(effect => effect.id !== "pr");
  effects[2] = { id: "refresh", kind: "branch-refresh", payload: { number: 77, ref: "refs/heads/docs-drift/one", expected_head: "e".repeat(40), head: bindings.candidate_commit } };
  const input = fixture(f.input.manifest.bindings, effects);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...f.policy, corrections: [], attention: [] });
  await expect(publish({ ...options(f), plan, gate: async () => ({ review: input, policy: f.policy }) })).rejects.toThrow("refresh");
  expect(f.executed).toEqual([]);
});


test("a mismatched artifact root fails before journal creation or effects", async () => {
  const f = setup(), wrong = join(f.root, "unselected-root");
  mkdirSync(wrong, { mode: 0o700 });
  await expect(publish({ ...options(f), artifact_root: wrong })).rejects.toThrow("artifact");
  expect(existsSync(join(wrong, "docs-drift-operation-1"))).toBe(false);
  expect(f.executed).toEqual([]);
});


test("both metadata intents and their exact pairing precede acquisition dispatch", async () => {
  const f = setup(), execute = f.transport.execute;
  let inspected = false;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "lease-acquire") {
      const journal = readJournal(join(f.artifacts, "docs-drift-operation-1"), f.repo);
      const intents = journal.events.filter(event => event.kind === "intent");
      expect(intents.map(event => event.effect_id)).toEqual(["lease", "receipt"]);
      const attempt = journal.events.find(event => event.kind === "attempt");
      if (!attempt) throw Error("missing atomic attempt");
      expect(attempt.payload).toHaveProperty("atomic_receipt_id", "receipt");
      inspected = true;
    }
    await execute(plan, effect, objects);
  };
  const result = await publish(options(f));
  expect(result.state).toBe("complete");
  expect(inspected).toBe(true);
});


test("atomic metadata creation still requires each separate current effect grant", async () => {
  for (const id of ["lease", "receipt"]) {
    const f = setup();
    f.input.grants = f.input.grants.filter(grant => grant.effect_id !== id);
    await expect(publish(options(f))).rejects.toThrow();
    expect(f.executed).toEqual([]);
    expect(f.refs.size).toBe(0);
  }
});


test.each(["advisory", "resolve"] as const)("the publisher derives %s PR state from explicit consumer policy", kind => {
  const f = setup();
  const settings = { ...f.settings, publication: { ...f.settings.publication, mode: "adopted" as const,
    pr_state: { advisory: "ready" as const, resolve: "draft" as const } } };
  const expected = kind === "resolve";
  const plan = structuredClone(f.plan);
  Object.assign(plan, { context: "production", transport: "native", publication_kind: kind });
  const pr = plan.manifest.effects.find(effect => effect.kind === "pr-create")!;
  pr.payload.draft = expected;
  expect(() => validatePublicationShape(plan, settings, expected)).not.toThrow();
  expect(() => validatePublicationShape(plan, settings, !expected)).toThrow("draft policy");
  expect(() => validatePublicationShape(plan, { ...settings, publication: { ...settings.publication, mode: "staged" } }, expected)).toThrow("adoption");
  plan.context = "trial"; pr.payload.draft = true;
  expect(() => validatePublicationShape(plan, settings, true)).not.toThrow();
  expect(() => validatePublicationShape(plan, settings, false)).toThrow("draft policy");
});


test("a losing atomic acquisition throws before any after-observation or invalidation", async () => {
  const f = setup(), winnerRoot = join(f.root, "winner-artifacts"); mkdirSync(winnerRoot, { mode: 0o700 });
  const winner = createJournal({ source_repo: f.repo, artifact_root: winnerRoot, plan: f.plan });
  const winning = writePublicationObjects(f.store, f.plan, winner.header);
  f.transport.execute = async (_plan, effect) => {
    f.executed.push(effect.id);
    f.refs.set(f.settings.publication.lease_ref, winning.lease_object);
    f.refs.set(f.settings.publication.receipt_ref_prefix + "operation-1", winning.receipt_object);
    throw new PublicationExecutionError(true, true);
  };
  const result = await publish(options(f));
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("current-proof-or-effect-unavailable");
  expect(f.observed).toEqual([]);
  expect(f.executed).toEqual(["lease"]);
  expect(result.journal.events.some(event => event.kind === "invalidation")).toBe(false);
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe(winning.lease_object);
  expect(winning.receipt_object).toBe(winning.lease_object);
  expect(winning.receipt_object).not.toBe(result.objects.receipt_object);
  const resumed = await resumeEffects({ ...options(f), journal_directory: result.journal.directory });
  expect(resumed.reason).toBe("operation-started-elsewhere");
  expect(resumed.journal.events.some(event => event.kind === "recovery-only")).toBe(true);
  expect(resumed.journal.events.some(event => event.kind === "invalidation")).toBe(false);
  expect(f.executed).toEqual(["lease"]);
});
