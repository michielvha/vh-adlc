import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readdirSync, rmSync, symlinkSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executeCollectorEffect } from "../../../plugins/vh-adlc/scripts/docs-drift/collector-proof";
import { GitHubReadError } from "../../../plugins/vh-adlc/scripts/github-read";
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
import { acknowledgeDeliveries } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-ack";
import { readAppliedDelivery } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof";

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

test.each(["identity", "path", "grant", "component", "client", "launcher"] as const)("trial refuses forged %s context", fault => {
  const f = syntheticTrialFixture(roots);
  const selected = reviseTrialManifest(f, manifest => {
    if (fault === "identity") Object.assign(manifest, { identity: { ...manifest.identity, repository: "real/consumer" } });
    if (fault === "path") manifest.paths[1] = "../outside.git";
    if (fault === "grant") manifest.test_grant.transport = "native";
    if (fault === "component") manifest.component.component_sha256 = "a".repeat(64);
    if (fault === "client") manifest.clients_sha256 = "a".repeat(64);
    if (fault === "launcher") manifest.launcher.sha256 = "a".repeat(64);
  });
  const reason = { identity: "synthetic context identity", path: "synthetic context identity", grant: "synthetic grant required",
    component: "selected runtime identity", client: "synthetic settings identity", launcher: "launcher identity" }[fault];
  expect(() => loadTrialContext({ root: f.root, context_commit: selected, runtime_directory: f.runtime })).toThrow(reason);
});

test.each(["remote", "symlink", "runtime", "alternate"] as const)("trial refuses %s escape before a collector effect", async fault => {
  const { f, context, options } = persistentPublication();
  const journal = createJournal({ source_repo: f.source, artifact_root: context.artifacts, plan: options.plan });
  const objects = writePublicationObjects(context.store, options.plan, journal.header);
  const trackerBefore = git(f.tracker, "rev-parse", "refs/heads/state");
  if (fault === "remote") git(f.source, "remote", "set-url", "origin", "https://github.com/real/consumer");
  if (fault === "symlink") {
    renameSync(join(f.root, "artifacts"), join(f.root, "evidence/original-artifacts"));
    symlinkSync(join(f.root, "evidence/original-artifacts"), join(f.root, "artifacts"));
  }
  if (fault === "runtime") writeFileSync(join(f.runtime, "knowledge.md"), "changed retained bytes");
  if (fault === "alternate") writeFileSync(join(f.origin, "objects/info/alternates"), "/outside/objects\n");
  const reason = { remote: "only the owned local fixture origin", symlink: "foreign or linked fixture input",
    runtime: "unexpected or changed runtime input", alternate: "fixture Git layout" }[fault];
  await expect((async () => createTrialTransport(context).execute(options.plan, options.plan.manifest.effects[0], objects, "escape-attempt"))()).rejects.toThrow(reason);
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
  expect(git(f.tracker, "rev-parse", "refs/heads/state")).toBe(trackerBefore);
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

function persistentPublication(legacy = false) {
  const f = syntheticTrialFixture(roots, { legacy });
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
  if (legacy) {
    const original = { title: "Legacy title", body: "Legacy body", labels: ["documentation"], draft: false };
    effects[3] = { id: "pr", kind: "pr-update", payload: { number: 77, expected_head: f.sourceCommit,
      expected_payload: original, expected_payload_sha256: sha256(canonicalJSON(original)),
      title: "Reviewed legacy update", body: publicationMarker(settings, operation) + "\n" + effectMarker("pr"), labels: ["documentation"], draft: true } };
  }
  const input = manifestFixture({ ...bindings, source_commit: f.sourceCommit, candidate_commit: f.sourceCommit,
    candidate_tree: git(f.source, "rev-parse", f.sourceCommit + "^{tree}"), settings_sha256: sha256(canonicalJSON(f.settings)) }, effects, operation);
  const policy = { adoption_sha256: hash("synthetic-only"), publication_kind: "advisory" as const,
    context: "trial" as const, transport: "collector" as const, pr_draft: true, worker: role, reviewer: role };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policy, corrections: [], attention: [] });
  return { f, context, options: { source_repo: f.source, artifact_root: context.artifacts, object_store: context.store,
    settings, plan, transport: createTrialTransport(context), gate: async () => ({ review: input, policy }) } };
}

async function reviewedTrialEffects(options: ReturnType<typeof persistentPublication>["options"], effects: Effect[], kind: "advisory" | "resolve" = "advisory") {
  const original = await options.gate();
  const input = manifestFixture(original.review.manifest.bindings, effects, original.review.manifest.operation_id);
  const policy = { ...original.policy, publication_kind: kind };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policy, corrections: [], attention: [] });
  return { ...options, plan, gate: async () => ({ review: input, policy }) };
}

async function labeledTrialPublication(kind: "pr-create" | "pr-update" | "issue-create", requestedLabels: string[]) {
  const { f, context, options } = persistentPublication(kind === "pr-update");
  const effects = structuredClone(options.plan.manifest.effects), selected = effects[3];
  if (kind === "issue-create") {
    effects[3] = { id: selected.id, kind, payload: { title: "Synthetic issue", body: selected.payload.body + "\nhttps://docs-drift.invalid/fixture/docs/blob/" + f.sourceCommit + "/docs/guide.md",
      labels: [], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "docs/guide.md", evidence_commit: f.sourceCommit,
      evidence_sha256: sha256(readFileSync(join(f.source, "docs/guide.md"))) } };
  }
  effects[3].payload.labels = requestedLabels;
  if (kind === "pr-update") {
    const before = effects[3].payload.expected_payload as Record<string, unknown>;
    before.labels = ["DOCUMENTATION", "documentation"];
    effects[3].payload.expected_payload_sha256 = sha256(canonicalJSON(before));
  }
  const scoped = await reviewedTrialEffects(options, effects);
  return { f, context, options: scoped };
}

test.each(["pr-create", "pr-update", "issue-create"] as const)("persistent %s accepts canonical label aliases", async kind => {
  const { context, options } = await labeledTrialPublication(kind, ["Documentation", "documentation"]);
  expect((await publish(options)).state).toBe("complete");
  const resource = readTrialTracker(context).resources.get(kind === "issue-create" ? "issues/501" : kind === "pr-update" ? "pulls/77" : "pulls/501");
  expect(resource?.labels).toEqual([{ id: 101, name: "documentation" }]);
}, 60000);

test.each(["pr-create", "pr-update", "issue-create", "pr-update-before"] as const)("a deleted reviewed label is an observed conflict (%s)", async scenario => {
  const kind = scenario === "pr-update-before" ? "pr-update" : scenario;
  const { context, options } = await labeledTrialPublication(kind, ["documentation"]);
  const execute = options.transport.execute;
  options.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].kind === kind) throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    return captured;
  };
  const interrupted = scenario === "pr-update-before" ? null : await publish(options);
  const tracker = readTrialTracker(context); tracker.labels.delete("documentation");
  for (const resource of tracker.resources.values()) resource.labels = [];
  persistTrialTracker(context, tracker);
  const transport = createTrialTransport(context);
  const result = interrupted
    ? await resumeEffects({ ...options, transport, journal_directory: interrupted.journal.directory })
    : await publish({ ...options, transport });
  expect(result.state).toBe("pending");
  expect((await transport.observe(options.plan, options.plan.manifest.effects[3], result.objects)).state).toBe("conflict");
  expect(result.reason).toBe("synthetic-reviewed-target-changed");
  expect(result.journal.events.some(event => event.kind === "invalidation")).toBe(true);
}, 60000);

test.each(["missing-target", "foreign-actor", "foreign-ref"] as const)("persistent recovery records a typed handoff (%s)", async scenario => {
  const { f, context, options } = persistentPublication(true);
  if (scenario === "foreign-ref") git(f.source, "push", f.origin, f.contextCommit + ":refs/heads/docs-drift/persistent");
  else {
    const state = readTrialTracker(context);
    if (scenario === "missing-target") state.resources.delete("pulls/77");
    else state.resources.get("pulls/77")!.user = { id: 90, login: "unconfigured-bot", type: "Bot" };
    persistTrialTracker(context, state);
  }
  const result = await publish(options);
  expect(result.state).toBe("pending");
  const reason = scenario === "missing-target" ? "synthetic-target-missing-or-ambiguous"
    : scenario === "foreign-actor" ? "synthetic-pr-outside-configured-refresh-scope" : "foreign-synthetic-ref";
  expect(result.reason).toBe(reason);
  expect(result.journal.events.some(event => event.kind === "handoff" && "reason" in event.payload && event.payload.reason === reason)).toBe(true);
  expect(result.journal.events.some(event => event.kind === "invalidation")).toBe(scenario !== "missing-target");
}, 60000);

test("persistent explanation and closure proof supports non-success acknowledgement after reopening", async () => {
  const { context, options } = persistentPublication(true), current = options.plan.manifest.effects;
  const explanation: Effect = { id: "explanation", kind: "comment-create", payload: { number: 77, prior_ids: [],
    body: publicationMarker(context.settings, options.plan.manifest.operation_id) + "\n" + effectMarker("explanation") + "\nSynthetic closure explanation" } };
  const close: Effect = { id: "close", kind: "pr-close", payload: { number: 77, expected_head: context.source_commit } };
  const scoped = await reviewedTrialEffects(options, [current[0], current[1], explanation, close, current.at(-1)!], "resolve");
  const execute = scoped.transport.execute;
  scoped.transport.execute = async (...args) => {
    const result = await execute(...args);
    if (args[1].kind === "pr-close") throw new PublicationExecutionError(true, true, undefined, result ?? undefined);
    return result;
  };
  const pending = await publish(scoped);
  expect(pending.state).toBe("pending");
  expect(readAppliedDelivery({ source_repo: context.source, journal_directory: pending.journal.directory,
    effect_id: close.id, settings: context.settings, transport: "collector" }).explanation_effect_id).toBe(explanation.id);
  const tracker = readTrialTracker(context); tracker.resources.get("pulls/77")!.state = "open"; persistTrialTracker(context, tracker);
  const otherRefs = git(context.origin, "for-each-ref", "--format=%(refname) %(objectname)").split("\n")
    .filter(row => !row.startsWith(context.settings.publication.lease_ref + " "));
  const acknowledged = await acknowledgeDeliveries({ source_repo: context.source, journal_directory: pending.journal.directory,
    object_store: context.store, settings: context.settings, transport: createTrialTransport(context), acknowledge_effect_ids: [close.id], retire_effect_ids: [],
    authorize: async scope => ({ kind: "owner-delivery-acknowledgement", source: "owner-current-request", scope_sha256: sha256(canonicalJSON(scope)),
      request_sha256: hash("synthetic acknowledgement preserves reopening") }) });
  expect(acknowledged.state).toBe("acknowledged");
  expect(readTrialTracker(context).resources.get("pulls/77")?.state).toBe("open");
  expect([...readTrialTracker(context).resources.keys()].filter(key => key.startsWith("comments/"))).toHaveLength(1);
  const observed = createTrialTransport(context);
  expect((await observed.ref(context.settings.publication.lease_ref)).state).toBe("absent");
  expect(await observed.ref(context.settings.publication.receipt_ref_prefix + options.plan.manifest.operation_id))
    .toEqual({ state: "present", object: pending.objects.receipt_object ?? pending.objects.object });
  expect(git(context.origin, "for-each-ref", "--format=%(refname) %(objectname)").split("\n")
    .filter(row => !row.startsWith(context.settings.publication.lease_ref + " "))).toEqual(otherRefs);
}, 60000);

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
  const { createTrialReader, fetchTrialProposalObjects } = await import("../../../plugins/vh-adlc/scripts/docs-drift/trial-reader");
  const { collectProposals } = await import("../../../plugins/vh-adlc/scripts/docs-drift/proposals");
  const { f, context, options } = persistentPublication();
  await publish(options);
  const reader = createTrialReader(context), collected = collectProposals(reader, context.settings);
  expect(collected.complete).toBe(true);
  expect(collected.proposals.map(proposal => proposal.number)).toEqual([501]);
  expect(reader.pull(501).head_sha).toBe(context.source_commit);
  expect(reader.trace().every(item => item.hostname === "docs-drift.invalid")).toBe(true);
  expect((await fetchTrialProposalObjects(context, reader.pull(501))).complete).toBe(true);
  const installed = invokeTrial(f, "collect-proposals");
  if (installed.result.exitCode !== 0) throw Error(JSON.stringify(installed.report) + "\n" + installed.result.stderr.toString());
  expect(installed.result.exitCode).toBe(0);
  expect(installed.report.data.objects).toHaveLength(1);
}, 60000);

function invokeTrial(f: ReturnType<typeof syntheticTrialFixture>, command: string, extras: string[] = []) {
  const result = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), command,
    "--synthetic-trial", f.root, "--context-commit", f.contextCommit, ...extras], { stdout: "pipe", stderr: "pipe", timeout: 30000 });
  const report = result.stdout.length ? JSON.parse(result.stdout.toString()) : null;
  return { result, report };
}

test("the exported installed entry verifies its own runtime and emits a bound synthetic receipt", () => {
  const f = syntheticTrialFixture(roots), { result, report } = invokeTrial(f, "inspect");
  expect(result.exitCode).toBe(0);
  expect(report.evidence_kind).toBe("synthetic");
  expect(report.transport).toBe("collector");
  expect(report.context_sha256).toHaveLength(64);
  expect(report.component_sha256).toBe(f.manifest.component.component_sha256);
  expect(report.entry_sha256).toBe(sha256(readFileSync(join(f.runtime, "scripts/docs-drift/trial-entry.ts"))));
  expect(JSON.parse(readFileSync(report.receipt_path, "utf8"))).toEqual(report);
});

test("the installed synthetic scan uses the common scanner without caller mutations", () => {
  const f = syntheticTrialFixture(roots), before = git(f.source, "status", "--porcelain");
  const { result, report } = invokeTrial(f, "scan");
  expect(result.exitCode).toBe(0);
  expect(report.data.complete).toBe(true);
  expect(report.source_commit).toBe(f.sourceCommit);
  expect(git(f.source, "status", "--porcelain")).toBe(before);
});

test.each([["--repo", "/"], ["--transport", "native"], ["--approved", "true"]])("installed trial rejects extra authority selectors %j", (flag, value) => {
  const f = syntheticTrialFixture(roots), { result, report } = invokeTrial(f, "inspect", [flag, value]);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("refused");
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
});

test.each(["approved", "standing-procedure", "missing-proof"] as const)("persistent delivery acknowledgement preserves owner edits (%s)", async approval => {
  const { context, options } = persistentPublication(), execute = options.transport.execute;
  options.transport.execute = async (...args) => {
    const result = await execute(...args);
    if (args[1].kind === "pr-create") throw new PublicationExecutionError(true, true, undefined, result ?? undefined);
    return result;
  };
  const pending = await publish(options);
  expect(pending.state).toBe("pending");
  const state = readTrialTracker(context), resource = state.resources.get("pulls/501")!;
  resource.body += "\nPreserved owner edit"; persistTrialTracker(context, state);
  if (approval === "missing-proof") {
    const evidence = readAppliedDelivery({ source_repo: context.source, journal_directory: pending.journal.directory,
      effect_id: "pr", settings: context.settings, transport: "collector" });
    rmSync(evidence.successes[0].path);
  }
  let authorizations = 0;
  const result = await acknowledgeDeliveries({ source_repo: context.source, journal_directory: pending.journal.directory,
    object_store: context.store, settings: context.settings, transport: createTrialTransport(context),
    acknowledge_effect_ids: ["pr"], retire_effect_ids: [], authorize: async scope => {
      authorizations += 1;
      return { kind: "owner-delivery-acknowledgement", source: approval === "standing-procedure" ? "adopted-procedure" : "owner-current-request",
        scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("synthetic exact owner approval") };
    } });
  expect(result.state).toBe(approval === "approved" ? "acknowledged" : "pending");
  const lease = await createTrialTransport(context).ref(context.settings.publication.lease_ref);
  expect(lease.state).toBe(approval === "approved" ? "absent" : "present");
  expect(readTrialTracker(context).resources.get("pulls/501")?.body).toBe(resource.body);
  expect(result.journal.events.some(event => event.kind === "acknowledged-delivery")).toBe(approval === "approved");
  if (approval === "approved") expect(authorizations).toBeGreaterThanOrEqual(2);
  else expect(authorizations).toBe(approval === "missing-proof" ? 0 : 1);
}, 60000);

test("failed fixture reads preserve actual status and shared error shape", async () => {
  const { createTrialReader } = await import("../../../plugins/vh-adlc/scripts/docs-drift/trial-reader");
  const f = syntheticTrialFixture(roots), context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const reader = createTrialReader(context);
  let missing: unknown;
  try { reader.pull(999); } catch (error) { missing = error; }
  expect(missing).toBeInstanceOf(GitHubReadError);
  expect(reader.trace().at(-1)?.status).toBe(404);
  expect(() => reader.ref("refs/heads/missing")).toThrow();
  expect(reader.trace().at(-1)?.status).toBe(404);
  expect(() => reader.workflow(1)).toThrow();
  expect(reader.trace().at(-1)?.status).toBeNull();
});

test("the fixture reader exposes actual ref object types to the shared validator", async () => {
  const { createTrialReader } = await import("../../../plugins/vh-adlc/scripts/docs-drift/trial-reader");
  const f = syntheticTrialFixture(roots);
  git(f.source, "-c", "tag.gpgSign=false", "tag", "-a", "synthetic-tag", "-m", "Synthetic tag", f.sourceCommit);
  git(f.origin, "fetch", "--no-tags", "--no-write-fetch-head", f.source, "refs/tags/synthetic-tag");
  mkdirSync(join(f.origin, "refs/heads/docs-drift"), { recursive: true });
  writeFileSync(join(f.origin, "refs/heads/docs-drift/tag-object"), git(f.source, "rev-parse", "refs/tags/synthetic-tag") + "\n");
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const reader = createTrialReader(context);
  expect(() => reader.ref("refs/heads/docs-drift/tag-object")).toThrow("github-git-ref-changed");
  expect(reader.trace().at(-1)?.status).toBe(200);
});

test.each(["main", "foreign-ref", "extra-root"])("context refuses an undeclared origin/resource change (%s)", fault => {
  const f = syntheticTrialFixture(roots);
  if (fault === "main") git(f.source, "push", f.origin, "main");
  if (fault === "foreign-ref") git(f.origin, "update-ref", "refs/heads/foreign", f.sourceCommit);
  if (fault === "extra-root") writeFileSync(join(f.root, "unlisted"), "outside declared context");
  expect(() => loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime }))
    .toThrow(fault === "main" ? "origin source binding" : fault === "foreign-ref" ? "origin ref outside" : "fixture paths");
});

test("a full collector inventory refuses creation before dispatch and persistence", async () => {
  const f = publicationFixture(roots, { owned_resources: true });
  for (let index = 1; index <= 1000; index += 1) f.resources.set("issues/" + index, { id: 1000 + index, number: index });
  const effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
  let persisted = false, failure: unknown;
  try {
    executeCollectorEffect({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan, effect, attempt_id: "full-inventory",
      settings: f.settings, identity: await f.transport.identity(), resources: f.resources, labels: f.resourceLabels,
      persist: () => { persisted = true; throw Error("too late"); } });
  } catch (error) { failure = error; }
  expect(failure).toMatchObject({ sent: false, reaped: true });
  expect(persisted).toBe(false);
  expect(f.resources.size).toBe(1000);
});

test("a legacy-authored PR update and acknowledgement bind the mutator separately", async () => {
  const { context, options } = persistentPublication(true), execute = options.transport.execute;
  options.transport.execute = async (...args) => {
    const result = await execute(...args);
    if (args[1].kind === "pr-update") throw new PublicationExecutionError(true, true, undefined, result ?? undefined);
    return result;
  };
  const pending = await publish(options);
  const proof = readAppliedDelivery({ source_repo: context.source, journal_directory: pending.journal.directory,
    effect_id: "pr", settings: context.settings, transport: "collector" });
  expect(proof.resource_id).toBe(1001);
  const state = readTrialTracker(context), resource = state.resources.get("pulls/77")!;
  expect(resource.title).toBe("Reviewed legacy update");
  resource.body += "\nPreserved legacy author's later edit"; persistTrialTracker(context, state);
  const result = await acknowledgeDeliveries({ source_repo: context.source, journal_directory: pending.journal.directory,
    object_store: context.store, settings: context.settings, transport: createTrialTransport(context),
    acknowledge_effect_ids: ["pr"], retire_effect_ids: [], authorize: async scope => ({ kind: "owner-delivery-acknowledgement",
      source: "owner-current-request", scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("synthetic legacy update acknowledgement") }) });
  expect(result.state).toBe("acknowledged");
  expect(readTrialTracker(context).resources.get("pulls/77")?.user).toEqual({ id: 90, login: "legacy-bot", type: "Bot" });
  expect(readTrialTracker(context).resources.get("pulls/77")?.body).toBe(resource.body);
}, 60000);

test.each(["changed-head", "wrong-base", "missing-head"] as const)("fixture object fetch remains incomplete for %s", async fault => {
  const { createTrialReader, fetchTrialProposalObjects } = await import("../../../plugins/vh-adlc/scripts/docs-drift/trial-reader");
  const { f, context, options } = persistentPublication(); await publish(options);
  const original = createTrialReader(context).pull(501);
  if (fault === "changed-head") git(f.source, "push", f.origin, f.contextCommit + ":refs/heads/docs-drift/persistent");
  if (fault === "missing-head") git(f.origin, "update-ref", "-d", "refs/heads/docs-drift/persistent");
  if (fault === "wrong-base") {
    const state = readTrialTracker(context), resource = state.resources.get("pulls/501")!;
    (resource.base as { ref: string }).ref = "release"; persistTrialTracker(context, state);
    expect(createTrialReader(context).pulls("main").items).toEqual([]);
  }
  const result = await fetchTrialProposalObjects(context, original);
  expect(result.complete).toBe(false);
  expect(result.diagnostics).toHaveLength(1);
  expect(git(f.origin, "rev-parse", "main")).toBe(f.sourceCommit);
}, 60000);
