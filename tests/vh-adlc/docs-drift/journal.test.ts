import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendIntent, appendOutcome, createJournal, readJournal, readVerifiedPlan, sealPlan, writePlanObject } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore, captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
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
  const plan = sealPlan({ reviewed: checked, grants: input.grants, adoption_sha256: hash("adoption"), context: "production", transport: "native", corrections: [], attention: [] });
  const policy = () => ({ adoption_sha256: hash("adoption"), context: "production" as const, transport: "native" as const, pr_draft: true, worker: role, reviewer: role });
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
  expect(() => sealPlan({ reviewed: structuredClone(checked), grants: input.grants, adoption_sha256: hash("adoption"), context: "production", transport: "native", corrections: [], attention: [] })).toThrow("review");
});

test("collector plans remain separate from actual native production evidence", () => {
  const { checked, input, policy } = setup();
  const options = { reviewed: checked, grants: input.grants, adoption_sha256: hash("adoption"), corrections: [], attention: [] };
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
  expect(() => sealPlan({ reviewed: checked, grants: input.grants, adoption_sha256: hash("adoption"), context: "production", transport: "native", corrections: [correction], attention: [] })).toThrow("delivery");
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
