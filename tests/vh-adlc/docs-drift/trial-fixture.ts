import { randomUUID } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { TRIAL_CONTEXT_PATH, TRIAL_IDENTITY } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";

/** This creates no native-provider or historical observed-execution evidence. */
export function syntheticTrialFixture(roots: string[]) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-docs-trial-"))); roots.push(root);
  const names = ["source", "origin.git", "tracker.git", "artifacts", "objects", "evidence", "component-source", "runtime"];
  for (const name of names) mkdirSync(join(root, name), { mode: 0o700 });
  const source = join(root, "source"), origin = join(root, "origin.git"), tracker = join(root, "tracker.git");
  populateRepository(source);
  const settings = settingsFixture(); settings.hostname = "docs-drift.invalid";
  put(source, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
  const sourceCommit = commitAll(source);
  git(origin, "init", "--bare", "--template=", "-b", "main");
  git(source, "remote", "add", "origin", origin);
  git(source, "push", "origin", "main");
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
    resources: [], labels: [{ id: 101, name: "documentation" }] };
  put(seed, "state.json", canonicalJSON(initialState).toString());
  git(seed, "init", "--template=", "-b", "state");
  const trackerCommit = commitAll(seed);
  git(tracker, "init", "--bare", "--template=", "-b", "state");
  git(seed, "push", tracker, "state");
  const store = createOwnedObjectStore({ source_repo: source, source_commit: sourceCommit, parent: join(root, "objects"),
    evidence_directory: join(root, "evidence"), repository: TRIAL_IDENTITY.repository, owner: "synthetic", run: fixtureID });
  const manifest = { schema_version: 1, kind: "docs-drift-synthetic-context", fixture_id: fixtureID,
    source_commit: sourceCommit, paths: names, identity: TRIAL_IDENTITY,
    component: { source_commit: componentCommit, component_sha256: component.component_sha256 },
    launcher: { path: settings.runtime_loader.launcher, sha256: sha256(readFileSync(join(source, settings.runtime_loader.launcher))) },
    clients_sha256: sha256(canonicalJSON(settings.clients)), test_grant: { context: "trial", transport: "collector", scope: "synthetic-only" },
    tracker_initial_commit: trackerCommit, object_store: { ...store, root: relative(root, store.root), record_path: relative(root, store.record_path) } };
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
