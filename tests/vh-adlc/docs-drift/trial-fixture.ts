import { randomUUID } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { loadTrialContext, TRIAL_CONTEXT_PATH, TRIAL_IDENTITY } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";
import { fixture as manifestFixture, bindings, hash, role } from "./manifest-fixture";
import { sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { createTrialTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-transport";

/** This creates no native-provider or historical observed-execution evidence. */
export function syntheticTrialFixture(roots: string[], options: { legacy?: boolean } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-docs-trial-"))); roots.push(root);
  const names = ["source", "origin.git", "tracker.git", "artifacts", "objects", "evidence", "component-source", "runtime"];
  for (const name of names) mkdirSync(join(root, name), { mode: 0o700 });
  const source = join(root, "source"), origin = join(root, "origin.git"), tracker = join(root, "tracker.git");
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify("none")).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  populateRepository(source, false, scanner);
  const settings = settingsFixture(); settings.hostname = "docs-drift.invalid";
  put(source, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
  const sourceCommit = commitAll(source);
  git(origin, "init", "--bare", "--template=", "-b", "main");
  git(source, "remote", "add", "origin", origin);
  git(source, "push", "origin", "main");
  if (options.legacy) git(source, "push", "origin", sourceCommit + ":refs/heads/docs-audit/legacy");
  const componentSource = join(root, "component-source"), runtime = join(root, "runtime");
  const pluginSource = join(import.meta.dir, "../../../plugins/vh-adlc");
  mkdirSync(join(componentSource, "plugins"));
  cpSync(pluginSource, join(componentSource, "plugins/vh-adlc"), { recursive: true });
  cpSync(pluginSource, runtime, { recursive: true }); chmodSync(runtime, 0o700);
  git(componentSource, "init", "--template=", "-b", "main");
  const componentCommit = commitAll(componentSource), component = computeComponentIdentity(componentSource, componentCommit);
  const seed = join(root, "tracker-seed"); mkdirSync(seed, { mode: 0o700 });
  const fixtureID = randomUUID();
  const initialState = { schema_version: 1, kind: "docs-drift-synthetic-tracker", fixture_id: fixtureID,
    resources: options.legacy ? [["pulls/77", { id: 1001, number: 77, title: "Legacy title", body: "Legacy body", draft: false,
      state: "open", merged: false, merged_at: null, merge_commit_sha: null, labels: [{ id: 101, name: "documentation" }],
      user: { id: 90, login: "legacy-bot", type: "Bot" },
      head: { ref: "docs-audit/legacy", sha: sourceCommit, repo: { id: 10, full_name: "fixture/docs" } },
      base: { ref: "main", sha: sourceCommit, repo: { id: 10, full_name: "fixture/docs" } } }]] : [],
    labels: [{ id: 101, name: "documentation" }] };
  put(seed, "state.json", canonicalJSON(initialState).toString());
  git(seed, "init", "--template=", "-b", "state");
  const trackerCommit = commitAll(seed);
  git(tracker, "init", "--bare", "--template=", "-b", "state");
  git(seed, "push", tracker, "state");
  rmSync(seed, { recursive: true });
  const store = createOwnedObjectStore({ source_repo: source, source_commit: sourceCommit, parent: join(root, "objects"),
    evidence_directory: join(root, "evidence"), repository: TRIAL_IDENTITY.repository, owner: "synthetic", run: fixtureID });
  const manifest = { schema_version: 1, kind: "docs-drift-synthetic-context", fixture_id: fixtureID,
    source_commit: sourceCommit, paths: names, identity: TRIAL_IDENTITY,
    component: { source_commit: componentCommit, component_sha256: component.component_sha256 },
    launcher: { path: settings.runtime_loader.launcher, sha256: sha256(readFileSync(join(source, settings.runtime_loader.launcher))) },
    clients_sha256: sha256(canonicalJSON(settings.clients)), test_grant: { context: "trial", transport: "collector", scope: "synthetic-only" },
    tracker_initial_commit: trackerCommit, origin_initial_refs: git(origin, "for-each-ref", "--format=%(refname) %(objectname)").split("\n").map(row => row.split(" ")),
    object_store: { ...store, root: relative(root, store.root), record_path: relative(root, store.record_path) } };
  put(source, TRIAL_CONTEXT_PATH, canonicalJSON(manifest).toString());
  const contextCommit = commitAll(source);
  return { root, source, origin, tracker, runtime, sourceCommit, contextCommit, manifest, store, settings };
}

export function reviseTrialManifest(f: ReturnType<typeof syntheticTrialFixture>, mutate: (manifest: typeof f.manifest) => void) {
  mutate(f.manifest);
  put(f.source, TRIAL_CONTEXT_PATH, canonicalJSON(f.manifest).toString());
  git(f.source, "add", "--", TRIAL_CONTEXT_PATH); git(f.source, "commit", "--amend", "--no-edit");
  return git(f.source, "rev-parse", "HEAD");
}

export function persistentTrialPublication(roots: string[], fixtureOptions: { legacy?: boolean } = {}) {
  const f = syntheticTrialFixture(roots, fixtureOptions);
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
  if (fixtureOptions.legacy) {
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
