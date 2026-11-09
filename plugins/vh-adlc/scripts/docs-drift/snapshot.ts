import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { readGit } from "./git";
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

/** Read raw tree identities and bytes without checkout filters or automatic object fetching. */
export function readCommittedTree(repo: string, sourceCommit: string): TreeBlob[] {
  commitID(sourceCommit);
  return nulFields(readGit(repo, "ls-tree", "-r", "--full-tree", "-z", sourceCommit)).map(row => {
    const tab = row.indexOf(9);
    if (tab < 0) incomplete("unreadable Git tree entry");
    const metadata = row.subarray(0, tab).toString("ascii");
    const fields = /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/u.exec(metadata);
    if (!fields || (fields[1] === "160000") !== (fields[2] === "commit")) incomplete("unsupported Git tree entry");
    const path = protocolPath(decodeUTF8(row.subarray(tab + 1)));
    return {
      path, mode: fields[1], oid: fields[3],
      bytes: fields[2] === "blob" ? readGit(repo, "cat-file", "blob", fields[3]) : Buffer.alloc(0),
    };
  });
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareUTF8);
}

function readSetFor(settings: Settings): ReadSet {
  const omitted = settings.read_set.source_roots === null || settings.read_set.reference_roots === null;
  // Arbitrary project commands can read implicit inputs. Retain the conservative fallback
  // until their complete dependency sets can be established by the selected verification.
  const commandInputsUnknown = settings.verification_commands.length > 0 || settings.generation_commands.length > 0;
  const bounded = !omitted && !commandInputsUnknown;
  const alwaysPaths = [
    "AGENTS.md", ".vh-adlc/docs-drift.yaml", settings.scanner.script, settings.project_procedure,
    settings.execution.worker_workflow, settings.execution.scheduled_workflow, settings.execution.claude_command,
    settings.runtime_loader.launcher, settings.publication.adoption_record, ...settings.feedback_files,
  ];
  if (settings.scanner.adapter !== null) alwaysPaths.push(settings.scanner.adapter);
  if (settings.component_pin !== null) alwaysPaths.push(settings.component_pin);
  return {
    mode: bounded ? "bounded" : "whole-repository",
    reason: omitted ? "omitted-read-bound" : commandInputsUnknown ? "command-inputs-unbounded" : null,
    prefixes: bounded ? sorted([...settings.roots, ...(settings.read_set.source_roots ?? []), ...(settings.read_set.reference_roots ?? [])]) : ["."],
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
  const readSet = readSetFor(loaded.settings);
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

function fileDigest(path: string): string | null {
  try { return sha256(readFileSync(path)); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function directoryInventory(root: string, skipRootNames: string[]): unknown[] {
  const rows: unknown[] = [];
  function visit(directory: Buffer, prefix: Buffer): void {
    for (const name of readdirSync(directory, { encoding: "buffer" }).sort(Buffer.compare)) {
      if (prefix.length === 0 && skipRootNames.some(skip => name.equals(Buffer.from(skip)))) continue;
      const full = Buffer.concat([directory, Buffer.from("/"), name]);
      const path = prefix.length === 0 ? name : Buffer.concat([prefix, Buffer.from("/"), name]);
      const identity = path.toString("hex");
      const stat = lstatSync(full);
      if (stat.isDirectory()) {
        rows.push([identity, "directory", stat.mode]);
        visit(full, path);
      } else if (stat.isSymbolicLink()) {
        rows.push([identity, "link", readlinkSync(full, { encoding: "buffer" }).toString("hex")]);
      } else if (stat.isFile()) {
        rows.push([identity, "file", stat.mode, sha256(readFileSync(full))]);
      } else incomplete("unsupported repository file type");
    }
  }
  visit(Buffer.from(root), Buffer.alloc(0));
  return rows;
}

function objectInventory(root: string): unknown[] {
  const rows: unknown[] = [];
  function visit(directory: string, prefix: string): void {
    for (const name of readdirSync(directory).sort(compareUTF8)) {
      const path = join(directory, name);
      const relative = prefix ? prefix + "/" + name : name;
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        rows.push([relative, "directory", stat.mode]);
        visit(path, relative);
      }
      else if (stat.isSymbolicLink()) rows.push([relative, "link", readlinkSync(path)]);
      else rows.push([relative, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs]);
    }
  }
  visit(root, "");
  return rows;
}

/** A mutation guard for the owned scanner checkout, also usable in preservation regressions. */
export function captureRepositoryState(directory: string) {
  const repo = repositoryRoot(directory);
  const gitDirectory = gitPath(repo, "--git-dir");
  const objects = gitPath(repo, "--git-path", "objects");
  const commonDirectory = gitPath(repo, "--git-common-dir");
  const worktree = directoryInventory(repo, [".git"]);
  const gitMetadata = canonicalDigest(directoryInventory(gitDirectory, ["objects"]));
  const commonMetadata = commonDirectory === gitDirectory ? gitMetadata : canonicalDigest(directoryInventory(commonDirectory, ["objects"]));
  return {
    head_sha256: fileDigest(join(gitDirectory, "HEAD")),
    index_sha256: fileDigest(gitPath(repo, "--git-path", "index")),
    fetch_head_sha256: fileDigest(join(gitDirectory, "FETCH_HEAD")),
    refs_sha256: sha256(readGit(repo, "for-each-ref", "--format=%(refname)%00%(objectname)%00")),
    worktree_sha256: canonicalDigest(worktree),
    git_metadata_sha256: gitMetadata,
    common_metadata_sha256: commonMetadata,
    objects_inventory_sha256: canonicalDigest(objectInventory(objects)),
  };
}

/** Preserve an incomplete handoff when the original canonical caller changes or becomes unavailable. */
export function matchesRepositoryState(directory: string, expected: string): boolean {
  try {
    return realpathSync(directory) === directory && canonicalDigest(captureRepositoryState(directory)) === expected;
  } catch { return false; }
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
  const worktrees = nulFields(readGit(sourceRepo, "worktree", "list", "--porcelain", "-z"))
    .filter(field => field.subarray(0, 9).equals(Buffer.from("worktree ")))
    .map(field => realpathSync(decodeUTF8(field.subarray(9))));
  const protectedPaths = [...worktrees, realpathSync(gitPath(sourceRepo, "--git-common-dir")), realpathSync(gitPath(sourceRepo, "--git-path", "objects"))];
  outside(canonical, protectedPaths);
  return { directory: canonical, assertExternal(path: string) { outside(path, protectedPaths); } };
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
