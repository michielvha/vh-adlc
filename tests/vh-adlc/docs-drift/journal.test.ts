import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendIntent, appendAttempt, appendAttemptEnd, appendRetirement, appendOutcome, createJournal, readJournal, readVerifiedPlan, sealPlan, writePlanObject, writePublicationObjects } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore, captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { publicationFixture } from "./publication-fixture";
import { retainLookup, readLookup } from "../../../plugins/vh-adlc/scripts/docs-drift/observations";
import { fixture, hash, role, bindings } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function setup() {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "vh-drift-journal-")));
  roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  readGit(repo, "init", "--template=", "-b", "main");
  writeFileSync(join(repo, "README.md"), "Synthetic journal fixture\n");
  readGit(repo, "add", "--", "README.md");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const commit = readGit(repo, "rev-parse", "HEAD").toString().trim();
  const input = fixture({ ...bindings, source_commit: commit });
  const checked = validateReviewedManifest(input);
  const plan = sealPlan({ reviewed: checked, grants: input.grants, adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "production", transport: "native", corrections: [], attention: [] });
  const policy = () => ({ adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "production" as const, transport: "native" as const, pr_draft: true, worker: role, reviewer: role });
  return { root, repo, artifacts, commit, input, checked, plan, policy };
}

test("sealed plans retain exact payloads and digests without native records or self hashes", () => {
  const { plan, policy } = setup();
  const bytes = canonicalJSON(plan);
  const parsed = readVerifiedPlan(bytes, policy);
  expect(parsed.manifest.effects[1].payload.body).toBe("Exact reviewed body\n");
  expect(parsed.roles.reviewer.model).toBe("claude-opus-5.5");
  expect(bytes.toString()).not.toContain("MODEL:");
  expect(bytes.toString()).not.toContain("records");
  expect(Object.keys(plan)).not.toContain("object");
  expect(() => readVerifiedPlan(Buffer.concat([bytes, Buffer.from("\n")]), policy)).toThrow();
  expect(() => readVerifiedPlan(bytes, () => null)).toThrow("policy");
  expect(() => readVerifiedPlan(bytes, () => ({ ...policy(), adoption_sha256: hash("other") }))).toThrow("policy");
});

test("changed plan payloads, role provenance or returned proof cannot become durable approval", () => {
  const { plan, policy, checked, input } = setup();
  for (const change of [
    (p: typeof plan) => { p.manifest.effects[1].payload.body = "changed"; },
    (p: typeof plan) => { p.roles.reviewer.model = "claude-opus-5.6"; },
    (p: typeof plan) => { p.roles.reviewer.target_sha256 = hash("another review"); },
  ]) {
    const changed = structuredClone(plan); change(changed);
    expect(() => readVerifiedPlan(canonicalJSON(changed), policy)).toThrow();
  }
  expect(() => sealPlan({ reviewed: structuredClone(checked), grants: input.grants, adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "production", transport: "native", corrections: [], attention: [] })).toThrow("review");
});

test("collector plans remain separate from actual native production evidence", () => {
  const { checked, input, policy } = setup();
  const options = { reviewed: checked, grants: input.grants, adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, corrections: [], attention: [] };
  expect(() => sealPlan({ ...options, context: "production", transport: "collector" })).toThrow();
  const collector = sealPlan({ ...options, context: "trial", transport: "collector" });
  expect(() => readVerifiedPlan(canonicalJSON(collector), policy)).toThrow("policy");
  expect(readVerifiedPlan(canonicalJSON(collector), () => ({ ...policy(), context: "trial", transport: "collector" })).transport).toBe("collector");
});

test("local intent is durable before an observed outcome and ordered effects cannot skip it", () => {
  const { repo, artifacts, plan } = setup();
  let journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  expect(() => appendOutcome(journal, "push", { state: "observed", observation_sha256: hash("native push"), resource_id: null, object: plan.manifest.bindings.candidate_commit })).toThrow("intent");
  expect(() => appendIntent(journal, "pr")).toThrow("order");
  journal = appendIntent(journal, "push");
  expect(readJournal(journal.directory, repo).events[0].kind).toBe("intent");
  expect(() => appendIntent(journal, "pr")).toThrow("pending");
  journal = appendOutcome(journal, "push", { state: "observed", observation_sha256: hash("native push"), resource_id: null, object: plan.manifest.bindings.candidate_commit });
  journal = appendIntent(journal, "pr");
  expect(journal.events.map(event => event.kind)).toEqual(["intent", "outcome", "intent"]);
  expect(readFileSync(join(journal.directory, "plan.json")).equals(canonicalJSON(plan))).toBe(true);
});

test("stale concurrent journal writers cannot replace or append over each other", () => {
  const { repo, artifacts, plan } = setup();
  const start = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  const current = appendIntent(start, "push");
  expect(() => appendIntent(start, "push")).toThrow("conflict");
  expect(() => appendOutcome(start, "push", { state: "observed", observation_sha256: hash("push"), resource_id: null, object: null })).toThrow("conflict");
  expect(readJournal(current.directory, repo).digest).toBe(current.digest);
});

test("changed, lost and noncanonical local plans or event chains fail inspection", () => {
  for (const kind of ["plan", "event", "missing-middle", "missing-tail"] as const) {
    const { repo, artifacts, plan } = setup();
    let journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
    journal = appendIntent(journal, "push");
    journal = appendOutcome(journal, "push", { state: "observed", observation_sha256: hash("push"), resource_id: null, object: null });
    if (kind === "plan") writeFileSync(join(journal.directory, "plan.json"), "{}");
    if (kind === "event") writeFileSync(join(journal.directory, "events", "0000000001.json"), "{}");
    if (kind === "missing-middle") unlinkSync(join(journal.directory, "events", "0000000001.json"));
    if (kind === "missing-tail") unlinkSync(join(journal.directory, "events", "0000000002.json"));
    expect(() => readJournal(journal.directory, repo, { revision: journal.revision, digest: journal.digest })).toThrow();
  }
});

test("journal roots and files stay private, external, regular and owned", () => {
  const { repo, artifacts, plan } = setup();
  expect(() => createJournal({ source_repo: repo, artifact_root: repo, plan })).toThrow();
  const journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  const header = join(journal.directory, "header.json");
  chmodSync(header, 0o644);
  expect(() => readJournal(journal.directory, repo)).toThrow();
  chmodSync(header, 0o600);
  const bytes = readFileSync(header); unlinkSync(header);
  const outside = join(artifacts, "header-copy"); writeFileSync(outside, bytes, { mode: 0o600 }); symlinkSync(outside, header);
  expect(() => readJournal(journal.directory, repo)).toThrow();
});

test("metadata-only parentless Git objects are deterministic and never alter source state", () => {
  const { repo, artifacts, plan, commit, policy } = setup();
  const parent = join(artifacts, "objects"), evidence = join(artifacts, "evidence");
  mkdirSync(parent, { mode: 0o700 }); mkdirSync(evidence, { mode: 0o700 });
  const store = createOwnedObjectStore({ parent, evidence_directory: evidence, source_repo: repo, source_commit: commit, repository: "fixture/docs", owner: "fixture", run: "fixture-run" });
  const before = captureRepositoryState(repo);
  const result = writePlanObject(store, plan);
  expect(writePlanObject(store, plan)).toEqual(result);
  const nativeCommit = readGit(store.root, "cat-file", "commit", result.object).toString();
  expect(nativeCommit).not.toContain("parent ");
  const tree = readGit(store.root, "ls-tree", result.tree).toString();
  expect(tree).toBe(`100644 blob ${result.blob}\tplan.json\n`);
  const bytes = readGit(store.root, "cat-file", "blob", result.blob);
  expect(sha256(bytes)).toBe(result.plan_sha256);
  expect(readVerifiedPlan(bytes, policy).manifest_sha256).toBe(plan.manifest_sha256);
  expect(captureRepositoryState(repo)).toEqual(before);
  expect(() => writePlanObject({ ...store, record_sha256: hash("foreign") }, plan)).toThrow();
});

test("delivered corrections and carried attention cannot be added after candidate review", () => {
  const { checked, input, plan, policy } = setup();
  const correction = { repository: "fixture/docs", scope_sha256: bindings.scope_sha256, identity: "unreviewed", path: "docs/a.md", patch_sha256: hash("patch"), postimage_sha256: hash("post"), verification_sha256: hash("check"), inputs_sha256: hash("inputs") };
  expect(() => sealPlan({ reviewed: checked, grants: input.grants, adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "production", transport: "native", corrections: [correction], attention: [] })).toThrow("delivery");
  const changed = structuredClone(plan); changed.corrections = [correction];
  expect(() => readVerifiedPlan(canonicalJSON(changed), policy)).toThrow("delivery");
});

test("nonregular journal files fail without waiting for a writer", () => {
  const { repo, artifacts, plan } = setup();
  const journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  const header = join(journal.directory, "header.json");
  unlinkSync(header);
  const fifo = Bun.spawnSync(["mkfifo", header], { stdout: "pipe", stderr: "pipe" });
  expect(fifo.exitCode).toBe(0);
  expect(() => readJournal(journal.directory, repo)).toThrow("file");
});

test("policy inspection cannot mutate the retained publication bytes", () => {
  const { plan, policy } = setup();
  const parsed = readVerifiedPlan(canonicalJSON(plan), candidate => {
    candidate.manifest.effects[1].payload.body = "changed during policy inspection";
    return policy();
  });
  expect(parsed.manifest.effects[1].payload.body).toBe("Exact reviewed body\n");
});

test("resource ownership is recorded explicitly before the journal directory exists", () => {
  const { repo, artifacts, plan } = setup();
  const journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  const owner = JSON.parse(readFileSync(join(artifacts, plan.manifest.operation_id + ".journal-owner.json"), "utf8"));
  expect(owner.owner_uid).toBe(process.getuid?.());
  expect(owner.run_id).toMatch(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
  expect(owner.run_id).not.toBe(plan.manifest.operation_id);
});


test("same reviewed plan has stable plan bytes and distinct acquiring receipts", () => {
  const { repo, artifacts, plan, commit } = setup();
  const parent = join(artifacts, "objects"), evidence = join(artifacts, "evidence"), second = join(artifacts, "second-root");
  for (const directory of [parent, evidence, second]) mkdirSync(directory, { mode: 0o700 });
  const store = createOwnedObjectStore({ parent, evidence_directory: evidence, source_repo: repo, source_commit: commit,
    repository: "fixture/docs", owner: "fixture", run: "lease-nonce" });
  const first = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  const other = createJournal({ source_repo: repo, artifact_root: second, plan });
  const a = writePublicationObjects(store, plan, first.header), b = writePublicationObjects(store, plan, other.header);
  expect(a.object).toBe(b.object);
  expect(a.tree).toBe(b.tree);
  expect(a.blob).toBe(b.blob);
  expect(a.lease_object).not.toBe(b.lease_object);
  expect(a.receipt_object).toBe(a.lease_object);
  expect(b.receipt_object).toBe(b.lease_object);
  expect(a.lease_object).not.toBe(a.object);
  expect(writePublicationObjects(store, plan, readJournal(first.directory, repo).header).lease_object).toBe(a.lease_object);
  expect(readGit(store.root, "rev-parse", a.lease_object + "^{tree}").toString().trim()).toBe(a.tree);
  expect(readGit(store.root, "cat-file", "commit", a.lease_object).toString()).not.toContain("parent ");
  expect(readGit(store.root, "show", a.lease_object + ":plan.json")).toEqual(canonicalJSON(plan));
});

test("native outcome resources preserve valid Unicode ref identities", () => {
  const { repo, artifacts, plan } = setup();
  let journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  journal = appendIntent(journal, "push");
  journal = appendOutcome(journal, "push", { state: "observed", observation_sha256: hash("native Unicode ref"),
    resource_id: "refs/heads/docs-drift/évidence-🧪", object: plan.manifest.bindings.candidate_commit });
  expect(readJournal(journal.directory, repo).events.at(-1)?.kind).toBe("outcome");
});


test("paired metadata intents cannot bypass business-effect ordering or bind another acquisition", () => {
  const f = publicationFixture(roots);
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  journal = appendIntent(journal, "lease");
  expect(() => appendIntent(journal, "receipt", "other-lease")).toThrow();
  expect(() => appendIntent(journal, "push", "lease")).toThrow();
  journal = appendIntent(journal, "receipt", "lease");
  journal = appendAttempt(journal, "lease", "paired-acquisition", undefined, "receipt");
  expect(() => appendIntent(journal, "push")).toThrow();
  const objects = writePublicationObjects(f.store, f.plan, journal.header);
  journal = appendOutcome(journal, "lease", { state: "observed", observation_sha256: hash("actual acquired nonce"), resource_id: "lease", object: objects.lease_object });
  expect(() => appendIntent(journal, "push")).toThrow();
  journal = appendOutcome(journal, "receipt", { state: "observed", observation_sha256: hash("actual retained nonce"), resource_id: "receipt", object: objects.receipt_object });
  expect(appendIntent(journal, "push").events.at(-1)?.effect_id).toBe("push");
});


test("observation-only journals reject unscoped attempts but retain separately granted metadata cleanup", () => {
  const f = publicationFixture(roots);
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan, recovery_mode: "observation-only" });
  journal = appendIntent(journal, "lease");
  expect(() => appendAttempt(journal, "lease", "forbidden-read-only-dispatch")).toThrow();
  journal = appendOutcome(journal, "lease", { state: "observed", observation_sha256: hash("native retained acquisition"), resource_id: f.settings.publication.lease_ref, object: null });
  journal = appendIntent(journal, "receipt");
  expect(() => appendAttempt(journal, "receipt", "separately-granted-cleanup", {
    scope_sha256: hash("exact current metadata cleanup"), request_sha256: hash("actual request") })).not.toThrow();
});


test("retained publication operation cannot change between advisory and resolve", () => {
  const { plan, policy } = setup();
  expect(() => readVerifiedPlan(canonicalJSON(plan), () => ({ ...policy(), publication_kind: "resolve" }))).toThrow("policy");
});


test.each(["in-flight", "sent", "unreaped", "unsent", "capture-unverified"] as const)("unapplied retirement cannot fabricate negative dispatch proof (%s)", state => {
  const f = setup();
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const effect = f.plan.manifest.effects[0];
  journal = appendIntent(journal, effect.id);
  journal = appendAttempt(journal, effect.id, "owned-negative-proof");
  if (state !== "in-flight") journal = appendAttemptEnd(journal, effect.id, { attempt_id: "owned-negative-proof", sent: state !== "unsent", reaped: state !== "unreaped",
    ...(state === "capture-unverified" ? { capture_unverified: true as const } : {}) });
  const retirement = { scope_sha256: hash("scope"), request_sha256: hash("request"), unapplied: true as const,
    lookup: { path: join(f.artifacts, "lookup.json"), sha256: hash("lookup") } };
  if (state === "unsent") expect(appendRetirement(journal, effect.id, retirement).revision).toBe(journal.revision + 1);
  else expect(() => appendRetirement(journal, effect.id, retirement)).toThrow("unapplied");
});


test("legacy never-dispatched retirement remains readable", () => {
  const f = setup(), effect = f.plan.manifest.effects[0];
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  journal = appendIntent(journal, effect.id);
  journal = appendRetirement(journal, effect.id, { scope_sha256: hash("scope"), request_sha256: hash("request"), never_dispatched: true,
    lookup: { path: join(f.artifacts, "lookup.json"), sha256: hash("lookup") } });
  const retained = readJournal(journal.directory, f.repo).events.at(-1)!;
  expect(retained.kind).toBe("retired-absence");
  expect(retained.payload).toMatchObject({ never_dispatched: true });
  expect(Object.hasOwn(retained.payload, "unapplied")).toBe(false);
});


test("supported outcomes retain scoped lookup digests while historical journal reading stays structural", () => {
  const f = setup(), effect = f.plan.manifest.effects[0];
  let journal = appendIntent(createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan }), effect.id);
  const lookup = retainLookup({ artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect,
    transport: "native", state: "done", lookup: { resource_sha256: hash("native snapshot"), label_comparisons: [] } });
  const receipt = { state: "observed" as const, observation_sha256: lookup.sha256, resource_id: "77", object: null, lookup };
  expect(() => appendOutcome(journal, effect.id, { ...receipt, observation_sha256: hash("unrelated") })).toThrow("lookup");
  expect(() => appendOutcome(journal, effect.id, { ...receipt, lookup: { ...lookup, path: join(f.root, "foreign.json") } })).toThrow("lookup");
  expect(() => appendOutcome(journal, effect.id, { ...receipt, lookup: { ...lookup, path: join(f.artifacts, "child") + "/../lookup.json" } })).toThrow("lookup");
  journal = appendOutcome(journal, effect.id, receipt);
  expect(readJournal(journal.directory, f.repo).events.at(-1)?.payload).toEqual(receipt);
  expect(readLookup({ evidence: lookup, artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect, transport: "native", state: "done" })).toEqual(lookup);
  expect(() => readLookup({ evidence: lookup, artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect, transport: "native", state: "conflict" })).toThrow("scope");
  unlinkSync(lookup.path);
  expect(readJournal(journal.directory, f.repo).events.at(-1)?.payload).toEqual(receipt);
  expect(() => readLookup({ evidence: lookup, artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect, transport: "native", state: "done" })).toThrow();
});

test.each(["duplicate", "oversized", "unsent", "foreign", "unnormalized", "rejected"] as const)(
  "attempt success references reject %s payloads", kind => {
    const f = setup();
    let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
    const effect = f.plan.manifest.effects[0];
    journal = appendIntent(journal, effect.id);
    journal = appendAttempt(journal, effect.id, "captured-attempt");
    const reference = { path: join(f.artifacts, "success-fixture.json"), sha256: hash("success") };
    const successes = kind === "duplicate" ? [reference, reference]
      : kind === "oversized" ? Array.from({ length: 17 }, (_, index) => ({ ...reference, path: join(f.artifacts, `success-${index}.json`) }))
      : [{ ...reference, path: kind === "foreign" ? join(f.root, "foreign.json")
        : kind === "unnormalized" ? f.artifacts + "/child/../success-fixture.json" : reference.path }];
    const status = { attempt_id: "captured-attempt", sent: kind !== "unsent", reaped: true, execution: { successes },
      ...(kind === "rejected" ? { rejection: { path: join(f.artifacts, "rejection-fixture.json"), sha256: hash("rejection") } } : {}) };
    expect(() => appendAttemptEnd(journal, effect.id, status)).toThrow();
  });

test.each(["unsent", "rejected"] as const)("unverified capture rejects a contradictory %s ending", kind => {
  const f = setup(); let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const effect = f.plan.manifest.effects[0];
  journal = appendIntent(journal, effect.id); journal = appendAttempt(journal, effect.id, "capture-attempt");
  expect(() => appendAttemptEnd(journal, effect.id, { attempt_id: "capture-attempt", sent: kind !== "unsent", reaped: true,
    capture_unverified: true, ...(kind === "rejected" ? { rejection: { path: join(f.artifacts, "rejection.json"), sha256: hash("rejection") } } : {}) })).toThrow();
});

test("pending capture serializes its known reference subset", () => {
  const f = setup(); let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const effect = f.plan.manifest.effects[0];
  journal = appendIntent(journal, effect.id); journal = appendAttempt(journal, effect.id, "capture-attempt");
  // Schema fixture only. Native proof verification is exercised through executeAttempt.
  const execution = { successes: [{ path: join(f.artifacts, "success-fixture.json"), sha256: hash("success") }] };
  journal = appendAttemptEnd(journal, effect.id, { attempt_id: "capture-attempt", sent: true, reaped: true, execution, capture_unverified: true });
  expect(readJournal(journal.directory, f.repo).events.at(-1)?.payload).toEqual({ attempt_id: "capture-attempt", sent: true,
    reaped: true, execution, capture_unverified: true });
});
