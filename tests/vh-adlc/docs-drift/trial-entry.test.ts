import { afterAll, expect, test } from "bun:test";
import { readdirSync, rmSync, symlinkSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executeCollectorEffect } from "../../../plugins/vh-adlc/scripts/docs-drift/collector-proof";
import { executeCollectorRefs } from "../../../plugins/vh-adlc/scripts/docs-drift/collector-refs";
import { createJournal, sealPlan, writePublicationObjects } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { publicationFixture } from "./publication-fixture";
import { loadTrialContext } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { reviseTrialManifest, syntheticTrialFixture } from "./trial-fixture";
import { git } from "./repository-fixture";
import { persistTrialTracker, readTrialTracker } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-tracker";
import { fixture as manifestFixture, bindings, hash, role } from "./manifest-fixture";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { createTrialTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-transport";
import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { resumeEffects } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["tracker", "refs"] as const)("collector %s persistence failure cannot produce successful delivery proof", async kind => {
  const f = publicationFixture(roots, { owned_resources: true });
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const objects = writePublicationObjects(f.store, f.plan, journal.header);
  const effect = f.plan.manifest.effects.find(item => item.kind === (kind === "tracker" ? "pr-create" : "lease-acquire"))!;
  let commits = 0;
  const options = { source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan, effect, attempt_id: "durable-fixture",
    settings: f.settings, identity: await f.transport.identity(), persist: () => { commits += 1; throw Error("synthetic durable store unavailable"); } };
  let failure: unknown;
  try {
    if (kind === "tracker") executeCollectorEffect({ ...options, resources: f.resources, labels: f.resourceLabels });
    else executeCollectorRefs({ ...options, objects, refs: f.refs });
  } catch (error) { failure = error; }
  expect(commits).toBe(1);
  expect(failure).toMatchObject({ sent: true, reaped: true });
  expect(readdirSync(f.artifacts, { recursive: true }).some(path => String(path).endsWith("fixture-result.json"))).toBe(false);
});


test("the synthetic entry refuses a non-owned context before reading tracker state", async () => {
  expect(() => loadTrialContext({ root: "/", context_commit: "a".repeat(40), runtime_directory: "/" }))
    .toThrow("private owned fixture");
});

test("the trial context verifies actual committed setup, retained bytes and local origins", () => {
  const f = syntheticTrialFixture(roots);
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  expect(context.source_commit).toBe(f.sourceCommit);
  expect(context.settings.hostname).toBe("docs-drift.invalid");
  expect(context.store).toEqual(f.store);
  expect(Object.isFrozen(context)).toBe(true);
});

test.each(["identity", "path", "grant", "component", "client", "launcher"])("trial refuses forged %s context", fault => {
  const f = syntheticTrialFixture(roots);
  const selected = reviseTrialManifest(f, manifest => {
    if (fault === "identity") Object.assign(manifest, { identity: { ...manifest.identity, repository: "real/consumer" } });
    if (fault === "path") manifest.paths[1] = "../outside.git";
    if (fault === "grant") manifest.test_grant.transport = "native";
    if (fault === "component") manifest.component.component_sha256 = "a".repeat(64);
    if (fault === "client") manifest.clients_sha256 = "a".repeat(64);
    if (fault === "launcher") manifest.launcher.sha256 = "a".repeat(64);
  });
  expect(() => loadTrialContext({ root: f.root, context_commit: selected, runtime_directory: f.runtime })).toThrow();
});

test.each(["remote", "symlink", "runtime", "alternate"])("trial refuses %s escape before a collector effect", fault => {
  const f = syntheticTrialFixture(roots);
  if (fault === "remote") git(f.source, "remote", "set-url", "origin", "https://github.com/real/consumer");
  if (fault === "symlink") {
    renameSync(join(f.root, "artifacts"), join(f.root, "original-artifacts"));
    symlinkSync(join(f.root, "original-artifacts"), join(f.root, "artifacts"));
  }
  if (fault === "runtime") writeFileSync(join(f.runtime, "knowledge.md"), "changed retained bytes");
  if (fault === "alternate") writeFileSync(join(f.origin, "objects/info/alternates"), "/outside/objects\n");
  expect(() => loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime })).toThrow();
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
});

test("tracker resources survive a fresh reader and concurrent stale writers cannot overwrite them", () => {
  const f = syntheticTrialFixture(roots);
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const first = readTrialTracker(context), stale = readTrialTracker(context);
  first.resources.set("issues/501", { id: 1001, number: 501, body: "Synthetic retained issue" });
  persistTrialTracker(context, first);
  expect(readTrialTracker(context).resources.get("issues/501")?.body).toBe("Synthetic retained issue");
  stale.resources.set("issues/502", { id: 1002, number: 502, body: "Losing concurrent edit" });
  expect(() => persistTrialTracker(context, stale)).toThrow();
  expect(readTrialTracker(context).resources.has("issues/502")).toBe(false);
  expect(readTrialTracker(context).resources.get("issues/501")?.id).toBe(1001);
});

test("a different fixture tracker cannot replace the manifest-bound initial state", () => {
  const f = syntheticTrialFixture(roots), other = syntheticTrialFixture(roots);
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  git(f.tracker, "fetch", "--no-write-fetch-head", other.tracker, "refs/heads/state");
  git(f.tracker, "update-ref", "refs/heads/state", git(other.tracker, "rev-parse", "refs/heads/state"));
  expect(() => readTrialTracker(context)).toThrow("fixture binding");
});

test("the persistent transport reads actual fixture refs and refuses production plans", async () => {
  const f = syntheticTrialFixture(roots);
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const transport = createTrialTransport(context);
  expect(await transport.ref("refs/heads/main")).toEqual({ state: "present", object: f.sourceCommit });
  expect(await transport.ref("refs/heads/absent")).toEqual({ state: "absent" });
  const other = publicationFixture(roots);
  const plan = { ...other.plan, context: "production" as const, transport: "native" as const };
  await expect(transport.execute(plan, plan.manifest.effects[0], { object: "a".repeat(40), tree: "b".repeat(40),
    blob: "c".repeat(40), plan_sha256: "d".repeat(64) }, "denied-native")).rejects.toThrow("trial collector plan");
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
});

function persistentPublication() {
  const f = syntheticTrialFixture(roots);
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const settings = context.settings, operation = "persistent-one";
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + operation } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/persistent", head: f.sourceCommit } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/persistent", title: "Synthetic docs trial",
      body: publicationMarker(settings, operation) + "\n" + effectMarker("pr"), labels: ["documentation"], draft: true } },
    { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ];
  const input = manifestFixture({ ...bindings, source_commit: f.sourceCommit, candidate_commit: f.sourceCommit,
    candidate_tree: git(f.source, "rev-parse", f.sourceCommit + "^{tree}"), settings_sha256: sha256(canonicalJSON(f.settings)) }, effects, operation);
  const policy = { adoption_sha256: hash("synthetic-only"), publication_kind: "advisory" as const,
    context: "trial" as const, transport: "collector" as const, pr_draft: true, worker: role, reviewer: role };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policy, corrections: [], attention: [] });
  return { f, context, options: { source_repo: f.source, artifact_root: context.artifacts, object_store: context.store,
    settings, plan, transport: createTrialTransport(context), gate: async () => ({ review: input, policy }) } };
}

test("the common publisher persists branches, receipts and tracker resources across fresh transports", async () => {
  const { f, context, options } = persistentPublication();
  const result = await publish(options);
  expect(result.state).toBe("complete");
  const fresh = createTrialTransport(context);
  expect(await fresh.ref(options.settings.publication.lease_ref)).toEqual({ state: "absent" });
  expect((await fresh.ref("refs/heads/docs-drift/persistent")).state).toBe("present");
  expect((await fresh.ref(options.settings.publication.receipt_ref_prefix + "persistent-one")).state).toBe("present");
  const resource = readTrialTracker(context).resources.get("pulls/501");
  expect(resource?.title).toBe("Synthetic docs trial");
  expect(resource?.draft).toBe(true);
  expect(git(f.origin, "rev-parse", "main")).toBe(f.sourceCommit);
  expect((await fresh.observe(options.plan, options.plan.manifest.effects[3], result.objects)).state).toBe("done");
}, 60000);

test("a lost tracker response resumes from persistent resources without repeating the PR", async () => {
  const { context, options } = persistentPublication(), execute = options.transport.execute;
  options.transport.execute = async (...args) => {
    const result = await execute(...args);
    if (args[1].kind === "pr-create") throw new PublicationExecutionError(true, true, undefined, result ?? undefined);
    return result;
  };
  const pending = await publish(options);
  expect(pending.state).toBe("pending");
  expect(readTrialTracker(context).resources.size).toBe(1);
  const restored = await resumeEffects({ ...options, transport: createTrialTransport(context), journal_directory: pending.journal.directory });
  expect(restored.state).toBe("complete");
  expect(readTrialTracker(context).resources.size).toBe(1);
}, 60000);

test("the fixture reader feeds committed PR data through the unchanged shared read parser", async () => {
  const { createTrialReader } = await import("../../../plugins/vh-adlc/scripts/docs-drift/trial-reader");
  const { collectProposals } = await import("../../../plugins/vh-adlc/scripts/docs-drift/proposals");
  const { context, options } = persistentPublication();
  await publish(options);
  const reader = createTrialReader(context), collected = collectProposals(reader, context.settings);
  expect(collected.complete).toBe(true);
  expect(collected.proposals.map(proposal => proposal.number)).toEqual([501]);
  expect(reader.pull(501).head_sha).toBe(context.source_commit);
  expect(reader.trace().every(item => item.hostname === "docs-drift.invalid")).toBe(true);
}, 60000);
