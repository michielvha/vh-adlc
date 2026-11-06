import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import type { PublicationTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { fixture, hash, role, bindings } from "./manifest-fixture";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function setup() {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "vh-drift-publish-")));
  roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts"), parent = join(root, "objects"), evidence = join(root, "evidence");
  for (const path of [repo, artifacts, parent, evidence]) mkdirSync(path, { mode: 0o700 });
  readGit(repo, "init", "--template=", "-b", "main");
  writeFileSync(join(repo, "README.md"), "Synthetic publisher fixture\n");
  mkdirSync(join(repo, ".vh-adlc"));
  const settingsBytes = canonicalJSON(settingsFixture());
  writeFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), settingsBytes);
  readGit(repo, "add", "--", "README.md", ".vh-adlc/docs-drift.yaml");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const commit = readGit(repo, "rev-parse", "HEAD").toString().trim();
  const settings = parseSettings(settingsFixture());
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + "operation-1" } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/one", head: bindings.candidate_commit } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Repair docs", body: "Exact reviewed body\n" + publicationMarker(settings, "operation-1") + "\n" + effectMarker("pr"), labels: ["documentation"], draft: true } },
    { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ];
  const input = fixture({ ...bindings, source_commit: commit, settings_sha256: sha256(settingsBytes) }, effects);
  const policy = { adoption_sha256: hash("adoption"), context: "trial" as const, transport: "collector" as const, pr_draft: true, worker: role, reviewer: role };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policy, corrections: [], attention: [] });
  const store = createOwnedObjectStore({ parent, evidence_directory: evidence, source_repo: repo, source_commit: commit, repository: "fixture/docs", owner: "fixture", run: "fixture-run" });
  const executed: string[] = [], observed: string[] = [];
  const refs = new Map<string, string>(), done = new Set<string>();
  let leasedObject: string | null = null;
  const transport: PublicationTransport = {
    kind: "collector", object_store: store.root,
    async identity() { return { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20, default_branch: "main" }; },
    async ref(ref) { return refs.has(ref) ? { state: "present", object: refs.get(ref)! } : { state: "absent" }; },
    async observe(plan, effect, objects) {
      observed.push(effect.id);
      if (!done.has(effect.id)) return { state: "absent" };
      return { state: "done", outcome: { state: "observed", observation_sha256: hash(effect.id), resource_id: effect.id, object: effect.kind === "lease-release" ? null : objects.object } };
    },
    async execute(plan, effect, objects) {
      executed.push(effect.id); done.add(effect.id);
      if (effect.kind === "lease-acquire") { leasedObject = objects.object; refs.set(String(effect.payload.ref), objects.object); }
      if (effect.kind === "receipt-retain") refs.set(String(effect.payload.ref), objects.object);
      if (effect.kind === "lease-release") refs.delete(String(effect.payload.ref));
    },
  };
  const gate = async () => ({ review: input, policy });
  return { root, repo, artifacts, store, settings, input, policy, plan, transport, gate, executed, observed, refs, done, leasedObject };
}

function options(f: ReturnType<typeof setup>) {
  return { source_repo: f.repo, artifact_root: f.artifacts, object_store: f.store, settings: f.settings, plan: f.plan, transport: f.transport, gate: f.gate };
}

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

test("under-lease payload or permission changes leave the operation pending without publishing", async () => {
  const f = setup();
  const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "lease-acquire") f.input.current.effects[3].payload.body = "changed after lease";
  };
  const result = await publish(options(f));
  expect(result.state).toBe("pending"); expect(f.executed).toEqual(["lease"]);
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
  expect(result.journal.events.filter(event => event.effect_id === "pr").map(event => event.kind)).toEqual(["intent", "handoff"]);
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
