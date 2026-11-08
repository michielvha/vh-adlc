import { afterAll, expect, test } from "bun:test";
import { readdirSync, rmSync, symlinkSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executeCollectorEffect } from "../../../plugins/vh-adlc/scripts/docs-drift/collector-proof";
import { executeCollectorRefs } from "../../../plugins/vh-adlc/scripts/docs-drift/collector-refs";
import { createJournal, writePublicationObjects } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { publicationFixture } from "./publication-fixture";
import { loadTrialContext } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { reviseTrialManifest, syntheticTrialFixture } from "./trial-fixture";
import { git } from "./repository-fixture";
import { persistTrialTracker, readTrialTracker } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-tracker";

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
