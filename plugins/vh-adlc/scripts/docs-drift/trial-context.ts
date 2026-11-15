import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { computeComponentIdentity, inspectRetainedPayload } from "./bootstrap";
import { readGit } from "./git";
import { canonicalJSON, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { requireOwnedStore } from "./proposals";
import { loadLegacyCommittedSettings } from "./settings";
import type { OwnedObjectStore } from "./snapshot";
import { publisherActor, sameLogin } from "./identity";

export const TRIAL_CONTEXT_PATH = ".vh-adlc/docs-drift-trial.json";
export const TRIAL_IDENTITY = Object.freeze({ repository: "fixture/docs", repository_id: 10,
  actor: "fixture-bot", actor_id: 20, default_branch: "main" });
const paths = ["source", "origin.git", "tracker.git", "artifacts", "objects", "evidence", "component-source", "runtime"] as const;

function fail(reason: string): never { throw Error("docs-drift synthetic trial " + reason); }
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("context fields");
  const actual = Object.keys(value).sort(), expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) fail("context fields");
  return value as Record<string, unknown>;
}
function commit(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) fail("immutable commit required");
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail("digest required");
  return value;
}

/** All fixture resources live below one private, symlink-free setup-owned root. */
function inspectFixture(root: string): void {
  const owner = process.getuid?.(), stat = lstatSync(root);
  if (owner === undefined || realpathSync(root) !== root || !stat.isDirectory() || stat.isSymbolicLink()
    || stat.uid !== owner || (stat.mode & 0o077) !== 0) fail("private owned fixture required");
  let entries = 0;
  if (!canonicalJSON(readdirSync(root).sort()).equals(canonicalJSON([...paths].sort()))) fail("fixture paths differ from setup");
  function visit(path: string): void {
    if (++entries > 50000) fail("fixture inventory bound");
    const item = lstatSync(path);
    if (item.uid !== owner || item.isSymbolicLink() || (item.mode & 0o022) !== 0) fail("foreign or linked fixture input");
    if (item.isDirectory()) { for (const name of readdirSync(path)) visit(join(path, name)); }
    else if (!item.isFile() || item.nlink !== 1) fail("unsupported fixture input");
  }
  visit(root);
  for (const path of paths) {
    if (!lstatSync(join(root, path)).isDirectory()) fail("fixture directory missing");
  }
}

function gitLayout(path: string, bare: boolean): void {
  const admin = bare ? path : join(path, ".git");
  if (readGit(path, "rev-parse", "--absolute-git-dir").toString().trim() !== admin
    || readGit(path, "rev-parse", "--is-bare-repository").toString().trim() !== String(bare)
    || existsSync(join(admin, "objects/info/alternates")) || existsSync(join(admin, "shallow"))) fail("fixture Git layout");
  if (readGit(path, "rev-parse", "--path-format=absolute", "--git-common-dir").toString().trim() !== admin) fail("linked fixture Git directory");
}

/** Test-only setup metadata grants no production or native-provider authority. */
export function loadTrialContext(options: { root: string; context_commit: string; runtime_directory: string }) {
  const root = options.root;
  inspectFixture(root);
  const source = join(root, "source"), origin = join(root, "origin.git"), tracker = join(root, "tracker.git");
  gitLayout(source, false); gitLayout(origin, true); gitLayout(tracker, true);
  gitLayout(join(root, "component-source"), false);
  if (readGit(source, "remote").toString().trim() !== "origin"
    || readGit(source, "config", "--get-all", "remote.origin.url").toString().trim() !== origin
    || readGit(origin, "remote").length || readGit(tracker, "remote").length) fail("only the owned local fixture origin is allowed");
  const contextCommit = commit(options.context_commit);
  const entry = readGit(source, "ls-tree", contextCommit, "--", TRIAL_CONTEXT_PATH).toString();
  if (!/^100644 blob [a-f0-9]+\t/u.test(entry)) fail("regular committed context required");
  const bytes = readGit(source, "show", contextCommit + ":" + TRIAL_CONTEXT_PATH);
  if (bytes.length > 1024 * 1024) fail("context size bound");
  const manifest = object(JSON.parse(decodeUTF8(bytes)), ["schema_version", "kind", "fixture_id", "source_commit",
    "paths", "identity", "component", "launcher", "clients_sha256", "test_grant", "tracker_initial_commit", "origin_initial_refs", "object_store"]);
  if (!canonicalJSON(manifest).equals(bytes) || manifest.schema_version !== 1 || manifest.kind !== "docs-drift-synthetic-context"
    || typeof manifest.fixture_id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(manifest.fixture_id)
    || !canonicalJSON(manifest.paths).equals(canonicalJSON(paths))
    || !canonicalJSON(manifest.identity).equals(canonicalJSON(TRIAL_IDENTITY))) fail("synthetic context identity");
  const sourceCommit = commit(manifest.source_commit);
  if (readGit(source, "rev-list", "--parents", "-n", "1", contextCommit).toString().trim() !== contextCommit + " " + sourceCommit
    || readGit(source, "diff", "--name-only", sourceCommit, contextCommit).toString().trim() !== TRIAL_CONTEXT_PATH) fail("record-only immutable context child required");
  const settings = loadLegacyCommittedSettings(source, sourceCommit).settings;
  if (settings.repository !== TRIAL_IDENTITY.repository || settings.hostname !== "docs-drift.invalid"
    || settings.default_branch !== TRIAL_IDENTITY.default_branch || !sameLogin(publisherActor(settings, "hosted"), TRIAL_IDENTITY.actor)
    || settings.publication.repository !== TRIAL_IDENTITY.repository || settings.pr_discovery.repository !== TRIAL_IDENTITY.repository
    || digest(manifest.clients_sha256) !== sha256(canonicalJSON(settings.clients))) fail("synthetic settings identity");
  const defaultRef = "refs/heads/" + settings.default_branch;
  if (!Array.isArray(manifest.origin_initial_refs) || !manifest.origin_initial_refs.length || manifest.origin_initial_refs.length > 1000) fail("initial origin inventory");
  const initialRefs = new Map<string, string>();
  for (const row of manifest.origin_initial_refs) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || initialRefs.has(row[0])) fail("initial origin ref fields");
    const ref = row[0], target = commit(row[1]);
    readGit(origin, "check-ref-format", ref);
    if (ref !== defaultRef && !settings.legacy_proposals.branch_prefixes.some(prefix => ref.startsWith("refs/heads/" + prefix))) fail("initial origin ref scope");
    initialRefs.set(ref, target);
  }
  if (initialRefs.get(defaultRef) !== sourceCommit) fail("initial origin source binding");
  const originRefs = readGit(origin, "for-each-ref", "--format=%(refname) %(objectname)").toString().trim().split("\n");
  for (const [ref, target] of initialRefs) {
    if (!originRefs.includes(ref + " " + target)
      || readGit(origin, "rev-parse", "--verify", "--end-of-options", target + "^{commit}").toString().trim() !== target) fail("origin source binding changed");
  }
  for (const line of originRefs) {
    const [ref] = line.split(" ");
    if (!initialRefs.has(ref) && ref !== settings.publication.lease_ref
      && !ref.startsWith(settings.publication.receipt_ref_prefix) && !ref.startsWith("refs/heads/" + settings.publication.branch_prefix)) fail("origin ref outside declared fixture scope");
  }
  const grant = object(manifest.test_grant, ["context", "transport", "scope"]);
  if (grant.context !== "trial" || grant.transport !== "collector" || grant.scope !== "synthetic-only") fail("synthetic grant required");
  const component = object(manifest.component, ["source_commit", "component_sha256"]);
  const expected = computeComponentIdentity(join(root, "component-source"), commit(component.source_commit));
  if (expected.component_sha256 !== digest(component.component_sha256) || options.runtime_directory !== join(root, "runtime")) fail("selected runtime identity");
  inspectRetainedPayload({ directory: options.runtime_directory, expected });
  const launcher = object(manifest.launcher, ["path", "sha256"]), launcherPath = protocolPath(launcher.path);
  if (launcherPath !== settings.runtime_loader.launcher
    || sha256(readGit(source, "show", sourceCommit + ":" + launcherPath)) !== digest(launcher.sha256)) fail("launcher identity");
  const stored = object(manifest.object_store, ["root", "record_path", "record_sha256", "source_commit"]);
  const storeRoot = protocolPath(stored.root), recordPath = protocolPath(stored.record_path);
  if (!/^objects\/docs-drift-objects-[a-f0-9-]+$/u.test(storeRoot) || !/^evidence\/[a-f0-9-]+\.json$/u.test(recordPath)
    || stored.source_commit !== sourceCommit) fail("owned object store scope");
  const store: OwnedObjectStore = { root: join(root, storeRoot), record_path: join(root, recordPath),
    record_sha256: digest(stored.record_sha256), source_commit: sourceCommit };
  gitLayout(store.root, true); requireOwnedStore(store, TRIAL_IDENTITY.repository);
  return freezeJSON({ root, source, origin, tracker, artifacts: join(root, "artifacts"), store, settings,
    fixture_id: manifest.fixture_id, context_commit: contextCommit, source_commit: sourceCommit,
    context_sha256: sha256(bytes), tracker_initial_commit: commit(manifest.tracker_initial_commit), component: expected });
}
export type TrialContext = ReturnType<typeof loadTrialContext>;
