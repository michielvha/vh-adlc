import { currentRuntimeValidation } from "./runtime-validation";
import { snapshot as logicalSnapshot, repositoryConfigurationDigest } from "../loop/review-route";
import { readFeatureClassification } from "../docs-impact/collection";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { mapGitBlobs, readGit } from "./git";
import { loadCommittedSettings } from "./settings";
import type { Settings } from "./settings";
import { canonicalDigest, canonicalJSON, compareUTF8, createProtocolBindings, decodeUTF8, protocolPath, sha256, withinPrefix } from "./protocol";
import type { BlobInput } from "./protocol";

export type TreeBlob = BlobInput & { oid: string; bytes: Buffer };
export type RequiredInput = { id: string; kind: "history" | "time" | "external"; sha256: string };
export type ReadSet = {
  mode: "bounded" | "whole-repository";
  reason: "omitted-read-bound" | "command-inputs-unbounded" | null;
  prefixes: string[];
  always_paths: string[];
};

function incomplete(reason: string): never {
  throw new Error(`incomplete docs-drift snapshot ${reason}`);
}

function commitID(value: string): string {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) incomplete("immutable commit required");
  return value;
}

function nulFields(bytes: Buffer): Buffer[] {
  const fields: Buffer[] = [];
  for (let start = 0; start < bytes.length;) {
    const end = bytes.indexOf(0, start);
    if (end < 0) incomplete("unterminated Git inventory");
    fields.push(bytes.subarray(start, end));
    start = end + 1;
  }
  return fields;
}

function gitPath(repo: string, ...args: string[]): string {
  const output = decodeUTF8(readGit(repo, "rev-parse", "--path-format=absolute", ...args));
  if (!output.endsWith("\n")) incomplete("unreadable Git directory");
  return output.slice(0, -1);
}

function repositoryRoot(directory: string): string {
  const root = realpathSync(directory);
  if (realpathSync(gitPath(root, "--show-toplevel")) !== root) incomplete("repository root required");
  return root;
}

function completeHistory(repo: string, commit: string): void {
  commitID(commit);
  if (readGit(repo, "rev-parse", "--is-shallow-repository").toString().trim() !== "false") incomplete("shallow history");
  const grafts = gitPath(repo, "--git-path", "info/grafts");
  if (existsSync(grafts) && readFileSync(grafts).length > 0) incomplete("grafted history");
  const missing = readGit(repo, "rev-list", "--objects", "--missing=print", "--no-object-names", commit);
  if (missing.includes(63)) incomplete("missing history objects");
}

/** History consumers need the same graph validation without requiring ordinary documentation inputs. */
export { completeHistory as requireCompleteHistory };

/** Read raw tree identities and bytes without checkout filters or automatic object fetching. */
export function readCommittedTree(repo: string, sourceCommit: string): TreeBlob[] {
  commitID(sourceCommit);
  const entries = nulFields(readGit(repo, "ls-tree", "-r", "--full-tree", "--long", "-z", sourceCommit)).map(row => {
    const tab = row.indexOf(9);
    if (tab < 0) incomplete("unreadable Git tree entry");
    const metadata = row.subarray(0, tab).toString("ascii");
    const fields = /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40}(?:[a-f0-9]{24})?) +(-|[0-9]+)$/u.exec(metadata);
    if (!fields || (fields[1] === "160000") !== (fields[2] === "commit")
      || (fields[2] === "commit") !== (fields[4] === "-")
      || fields[2] === "blob" && !Number.isSafeInteger(Number(fields[4]))) incomplete("unsupported Git tree entry");
    const path = protocolPath(decodeUTF8(row.subarray(tab + 1)));
    return {
      path, mode: fields[1], oid: fields[3], size: fields[2] === "blob" ? Number(fields[4]) : 0,
    };
  });
  const objects = entries.filter(entry => entry.mode !== "160000").map(({ oid, size }) => ({ oid, size }));
  const contents = mapGitBlobs(repo, objects, bytes => bytes);
  let index = 0;
  return entries.map(({ path, mode, oid }) => ({ path, mode, oid,
    bytes: mode === "160000" ? Buffer.alloc(0) : contents[index++] }));
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareUTF8);
}

function readSetFor(settings: Settings, featureRoot: string): ReadSet {
  const omitted = settings.read_set.source_roots === null || settings.read_set.reference_roots === null;
  // Arbitrary project commands can read implicit inputs. Retain the conservative fallback
  // until their complete dependency sets can be established by the selected verification.
  const commandInputsUnknown = settings.verification_commands.length > 0 || settings.generation_commands.length > 0;
  const bounded = !omitted && !commandInputsUnknown;
  const workflowPaths = [settings.execution.worker_workflow, settings.execution.scheduled_workflow, settings.execution.claude_command]
    .filter((value): value is string => value !== null);
  const alwaysPaths = [
    "AGENTS.md", ".vh-adlc/docs-drift.yaml", settings.scanner.script, settings.project_procedure,
    ...workflowPaths, ...settings.feedback_files,
  ];
  if (settings.scanner.adapter !== null) alwaysPaths.push(settings.scanner.adapter);
  if (settings.schema_version === 1) {
    alwaysPaths.push(settings.runtime_loader.launcher, settings.publication.adoption_record);
    if (settings.component_pin !== null) alwaysPaths.push(settings.component_pin);
  } else {
    alwaysPaths.push(settings.reports.workflow_path);
    if (settings.publication.checklist_path !== null) alwaysPaths.push(settings.publication.checklist_path);
  }
  return {
    mode: bounded ? "bounded" : "whole-repository",
    reason: omitted ? "omitted-read-bound" : commandInputsUnknown ? "command-inputs-unbounded" : null,
    prefixes: bounded ? sorted([...settings.roots, featureRoot, ...(settings.read_set.source_roots ?? []), ...(settings.read_set.reference_roots ?? [])]) : ["."],
    always_paths: sorted(alwaysPaths),
  };
}

function isBound(path: string, readSet: ReadSet): boolean {
  return readSet.always_paths.includes(path) || readSet.prefixes.some(root => withinPrefix(path, root));
}

function historyDigest(repo: string, commit: string, readSet: ReadSet): string {
  const prefixes = sorted([...readSet.prefixes, ...readSet.always_paths]);
  return sha256(readGit(repo, "log", "--full-history", "--no-show-signature", "--no-notes", "--format=%H%x00%P%x00%at%x00", commit, "--", ...prefixes));
}

function requiredInputs(values: RequiredInput[]): RequiredInput[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value.id) || ids.has(value.id) ||
        !["history", "time", "external"].includes(value.kind) || !/^[a-f0-9]{64}$/u.test(value.sha256)) incomplete("required input bindings");
    ids.add(value.id);
  }
  return values.map(value => ({ id: value.id, kind: value.kind, sha256: value.sha256 })).sort((left, right) => compareUTF8(left.id, right.id));
}

/** Bind source and negative reads to immutable objects while leaving the caller's checkout intact. */
export function captureSnapshot(directory: string, sourceCommit: string, options: { required_inputs?: RequiredInput[] } = {}) {
  return snapshotAt(repositoryRoot(directory), sourceCommit, options);
}

/** Read immutable inputs in the collector's separately verified owned bare store. */
export function captureBareSnapshot(directory: string, sourceCommit: string, options: { required_inputs?: RequiredInput[] } = {}) {
  const repo = realpathSync(directory);
  if (readGit(repo, "rev-parse", "--is-bare-repository").toString().trim() !== "true") incomplete("bare snapshot required");
  return snapshotAt(repo, sourceCommit, options);
}

function snapshotAt(repo: string, sourceCommit: string, options: { required_inputs?: RequiredInput[] }) {
  completeHistory(repo, sourceCommit);
  const loaded = loadCommittedSettings(repo, sourceCommit);
  const blobs = readCommittedTree(repo, sourceCommit);
  const policy = blobs.find(blob => blob.path === "AGENTS.md");
  const classification = readFeatureClassification(policy?.bytes ?? null);
  const readSet = readSetFor(loaded.settings, classification.feature_root);
  for (const blob of blobs) {
    if (isBound(blob.path, readSet) && !["100644", "100755"].includes(blob.mode)) incomplete("nonregular required source input");
  }
  const protocol = createProtocolBindings({ ...loaded, blobs });
  const byPath = new Map(blobs.map(blob => [blob.path, blob]));
  for (const [path] of protocol.bindings.documents) {
    const blob = byPath.get(path);
    if (!blob) incomplete("missing document blob");
    decodeUTF8(blob.bytes);
  }
  for (const path of [loaded.settings.scanner.script, loaded.settings.project_procedure, ...loaded.settings.feedback_files]) {
    if (!byPath.has(path)) incomplete("missing required scanner, procedure or feedback input");
  }
  const entries = blobs.filter(blob => isBound(blob.path, readSet))
    .sort((left, right) => compareUTF8(left.path, right.path))
    .map(blob => [blob.path, blob.mode, sha256(blob.bytes)] as const);
  const absent = sorted([...readSet.prefixes, ...readSet.always_paths])
    .filter(prefix => !blobs.some(blob => withinPrefix(blob.path, prefix)));
  const history = historyDigest(repo, sourceCommit, readSet);
  return {
    repo, ...loaded, blobs, protocol, read_set: readSet,
    read_set_sha256: canonicalDigest({ ...readSet, entries, absent }),
    entries, absent, history_sha256: history, required_inputs: requiredInputs(options.required_inputs ?? []),
  };
}

export type Snapshot = ReturnType<typeof captureSnapshot>;
export type Freshness = {
  fresh: boolean; assessed_commit: string; current_commit: string; changed_paths: string[];
  material_paths: string[]; history_changed: boolean; required_inputs_changed: boolean; diagnostic: string | null;
};

/** Compare the full default interval. A reverted path can still change required history. */
export function checkFreshness(snapshot: Snapshot, currentCommit: string, options: { required_inputs?: RequiredInput[] } = {}): Freshness {
  const result: Freshness = {
    fresh: false, assessed_commit: snapshot.source_commit, current_commit: currentCommit,
    changed_paths: [], material_paths: [], history_changed: false, required_inputs_changed: false, diagnostic: null,
  };
  try {
    completeHistory(snapshot.repo, currentCommit);
    readGit(snapshot.repo, "merge-base", "--is-ancestor", snapshot.source_commit, currentCommit);
    result.changed_paths = nulFields(readGit(snapshot.repo, "diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--no-renames", "--name-only", "-z", snapshot.source_commit, currentCommit, "--"))
      .map(bytes => protocolPath(decodeUTF8(bytes))).sort(compareUTF8);
    result.material_paths = result.changed_paths.filter(path => isBound(path, snapshot.read_set));
    result.history_changed = historyDigest(snapshot.repo, currentCommit, snapshot.read_set) !== snapshot.history_sha256;
    result.required_inputs_changed = canonicalDigest(requiredInputs(options.required_inputs ?? [])) !== canonicalDigest(snapshot.required_inputs);
    result.fresh = result.material_paths.length === 0 && !result.history_changed && !result.required_inputs_changed;
  } catch {
    result.diagnostic = "unavailable-history-or-comparison";
  }
  return result;
}

/** Protect logical caller inputs while excluding ignored output and unrelated shared Git activity. */
export function captureRepositoryState(directory: string, scope: "owning" | "full" = "owning") {
  const repo = repositoryRoot(directory);
  const boundary = ["shallow", "info/grafts"].map(name => {
    const path = gitPath(repo, "--git-path", name);
    return [name, existsSync(path) ? sha256(readFileSync(path)) : null];
  });
  return { schema_version: 2, ...logicalSnapshot(repo, [], scope, { ignored: "exclude" }),
    local_config_sha256: repositoryConfigurationDigest(repo), history_boundary_sha256: canonicalDigest(boundary) };
}

/** Preserve an incomplete handoff when the original canonical caller changes or becomes unavailable. */
export function matchesRepositoryState(directory: string, expected: string, scope: "owning" | "full" = "owning"): boolean {
  try {
    return realpathSync(directory) === directory && canonicalDigest(captureRepositoryState(directory, scope)) === expected;
  } catch { return false; }
}

/** Nested caller guards share the public invocation's entry state and final comparison. */
export function captureCallerState(directory: string, scope: "owning" | "full" = "owning"): ReturnType<typeof captureRepositoryState> {
  const caller = currentRuntimeValidation()?.caller;
  return scope === "owning" && caller && realpathSync(directory) === caller.repo
    ? caller.state : captureRepositoryState(directory, scope);
}

/** Standalone APIs and owned copies retain their immediate comparisons. */
export function matchesCallerState(directory: string, expected: string, scope: "owning" | "full" = "owning"): boolean {
  try { return realpathSync(directory) === directory && canonicalDigest(captureCallerState(directory, scope)) === expected; }
  catch { return false; }
}

/** Complete retained stages and report artifacts only after the invocation's final comparison. */
export function assertCallerUnchanged(): void {
  const caller = currentRuntimeValidation()?.caller;
  if (caller && !caller.unchanged()) throw Error("Caller source, index or repository configuration changed during this operation.");
}

export type OwnedObjectStore = { root: string; record_path: string; record_sha256: string; source_commit: string };
export type ObjectStoreOptions = {
  parent: string; evidence_directory: string; repository: string; source_repo: string;
  source_commit: string; owner: string; run: string;
};

function outside(path: string, protectedPaths: string[]): void {
  for (const protectedPath of protectedPaths) {
    const delta = relative(protectedPath, path);
    if (delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(".." + sep))) incomplete("owned resource overlaps a caller checkout or Git directory");
  }
}

/** Scanner artifacts belong to a private, explicitly selected location outside caller checkouts. */
export function externalArtifactDirectory(directory: string, sourceRepo: string): string {
  return artifactDirectoryScope(directory, sourceRepo).directory;
}

/** Reuse one caller inventory while checking the directory and each referenced artifact. */
export function artifactDirectoryScope(directory: string, sourceRepo: string) {
  const canonical = realpathSync(directory);
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || canonical !== directory ||
      (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0) incomplete("private artifact directory required");
  const scope = externalResourceScope(sourceRepo);
  scope.assertExternal(canonical);
  return { directory: canonical, ...scope };
}

/** Check future resource paths before creating them, using the same caller and Git exclusions. */
export function externalResourceScope(sourceRepo: string) {
  const worktrees = nulFields(readGit(sourceRepo, "worktree", "list", "--porcelain", "-z"))
    .filter(field => field.subarray(0, 9).equals(Buffer.from("worktree ")))
    .map(field => realpathSync(decodeUTF8(field.subarray(9))));
  const protectedPaths = [...worktrees, realpathSync(gitPath(sourceRepo, "--git-common-dir")), realpathSync(gitPath(sourceRepo, "--git-path", "objects"))];
  return { assertExternal(path: string) { outside(path, protectedPaths); } };
}

/** Record the exact assessment resource before creating or fetching into its new bare store. */
export function createOwnedObjectStore(options: ObjectStoreOptions): OwnedObjectStore {
  const source = repositoryRoot(options.source_repo);
  completeHistory(source, options.source_commit);
  if (![options.owner, options.run].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_./-]*$/u.test(value))) incomplete("resource owner and run");
  const parent = realpathSync(options.parent);
  const evidence = realpathSync(options.evidence_directory);
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u.test(options.repository)) incomplete("resource repository identity");
  const worktrees = nulFields(readGit(source, "worktree", "list", "--porcelain", "-z"))
    .filter(field => field.subarray(0, 9).equals(Buffer.from("worktree ")))
    .map(field => realpathSync(decodeUTF8(field.subarray(9))));
  const protectedPaths = [
    ...worktrees, source, realpathSync(gitPath(source, "--git-dir")),
    realpathSync(gitPath(source, "--git-common-dir")), realpathSync(gitPath(source, "--git-path", "objects")),
  ];
  outside(parent, protectedPaths);
  outside(evidence, protectedPaths);
  const id = randomUUID();
  const root = join(parent, "docs-drift-objects-" + id);
  const recordPath = join(evidence, id + ".json");
  const record = canonicalJSON({
    schema_version: 1, kind: "pr-object-store", root, owner: options.owner, run: options.run,
    repository: options.repository.toLowerCase(), source_repo: source, source_commit: options.source_commit,
    base_commit: options.source_commit, evidence_location: recordPath,
  });
  writeFileSync(recordPath, record, { flag: "wx", mode: 0o600 });
  mkdirSync(root, { mode: 0o700 });
  const format = readGit(source, "rev-parse", "--show-object-format").toString().trim();
  if (!["sha1", "sha256"].includes(format)) incomplete("Git object format");
  // Failure deliberately retains the new resource and its record for reconciliation.
  readGit(root, "init", "--bare", "--template=", "--object-format=" + format);
  readGit(root, "-c", "core.hooksPath=/dev/null", "-c", "gc.auto=0", "-c", "fetch.writeCommitGraph=false",
    "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--", source, options.source_commit);
  const observed = readGit(root, "rev-parse", "--verify", "--end-of-options", options.source_commit + "^{commit}").toString().trim();
  if (observed !== options.source_commit) incomplete("owned fetch object mismatch");
  return { root, record_path: recordPath, record_sha256: sha256(record), source_commit: options.source_commit };
}
