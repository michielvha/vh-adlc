import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createYAMLReader } from "../settings-file";
import { compileCoverage } from "./matching";

type Diagnostic = { code: string; path?: string; message: string };
type Binding = { path: string; view: "HEAD" | "working-tree"; sha256: string | null };
type Entry = { mode: string; oid: string };
type Candidate = { path: string; coverage_only: true; feature_attention: boolean; matches: Array<{ source: string; pattern: string }> };
type Policy = { view: "HEAD"; sha256: string | null; excluded_dirty: boolean; feature_root: string; local_format: boolean };
export type RootsReport = {
  schema_version: 1; protocol: 1; command: "roots"; head: string | null;
  outcome: "declared" | "absent" | "incomplete"; roots: string[]; policy: Policy; diagnostics: Diagnostic[];
};
export type ImpactReport = {
  schema_version: 1; protocol: 1; command: "check"; outcome: "candidates" | "none" | "incomplete";
  roots: string[]; policy: Policy;
  source: { head: string | null; base: string | null; merge_base: string | null; paths: string[]; excluded_dirty_paths: string[]; bindings: Binding[] };
  metadata: { selected_paths: string[]; excluded_dirty_docs: string[]; uncovered_docs: string[]; bindings: Binding[] };
  candidates: Candidate[]; unmatched_sources: string[]; diagnostics: Diagnostic[];
};
export type CheckOptions = { repo: string; roots?: string[]; base?: string; paths?: string[]; metadataPaths?: string[] };
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function fail(message: string): never { throw new Error(message); }
function gitEnvironment(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" };
  // Git exports these when calling hooks; --repo always selects this command's own checkout.
  for (const key of ["GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT", "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE", "GIT_INDEX_FILE", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE", "GIT_COMMON_DIR", "GIT_NAMESPACE"]) delete env[key];
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_(?:KEY|VALUE)_/u.test(key)) delete env[key];
  return env;
}
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const within = (path: string, root: string) => root === "." || path === root || path.startsWith(root + "/");
const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
function nulFields(bytes: Buffer): Buffer[] {
  const result: Buffer[] = [];
  for (let start = 0; start < bytes.length;) {
    const end = bytes.indexOf(0, start);
    if (end < 0) fail("unterminated Git field");
    result.push(bytes.subarray(start, end)); start = end + 1;
  }
  return result;
}
const markdown = (path: string) => /\.(?:md|mdx|markdown)$/iu.test(path);

/** Paths are repository-relative POSIX names, including deleted names. */
export function repositoryPath(value: string): string {
  const path = value.replace(/^(?:\.\/)+/u, "").replace(/\/+$/u, "");
  if (!path || path.startsWith("/") || path.includes("\0") || path.includes("//") || path.split("/").some(part => part === ".." || part === ".git" || (part === "." && path !== "."))) fail("expected a repository-relative path without traversal");
  return path;
}

class ReaderUnavailable extends Error {}

class Snapshot {
  diagnostics: Diagnostic[] = [];
  head: string | null = null;
  tree = new Map<string, Entry>();
  dirty: string[] = [];
  undecodable: Array<{ bytes: Buffer; view: "HEAD" | "dirty" | "committed" }> = [];
  reader: ((bytes: Uint8Array) => unknown) | null | undefined;
  constructor(readonly repo: string) {
    try {
      const top = this.git("rev-parse", "--show-toplevel").toString().trim();
      if (realpathSync(repo) !== realpathSync(top)) fail("the repository input must be its Git root");
      this.head = this.git("rev-parse", "--verify", "--end-of-options", "HEAD^{commit}").toString().trim();
      for (const row of nulFields(this.git("ls-tree", "-r", "-z", this.head))) {
        const tab = row.indexOf(9), fields = row.subarray(0, tab).toString("ascii").split(" ");
        if (tab < 0 || fields.length !== 3 || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(fields[2])) fail("unreadable Git tree");
        const name = this.path(row.subarray(tab + 1), "HEAD");
        if (name !== null) this.tree.set(name, { mode: fields[0], oid: fields[2] });
      }
      this.dirty = sorted([...this.changed(this.head), ...nulFields(this.git("ls-files", "--others", "--exclude-standard", "-z")).flatMap(bytes => this.path(bytes, "dirty") ?? [])]);
    } catch { this.gap("repository", "could not collect the repository HEAD and working-tree scope"); }
  }
  path(bytes: Buffer, view: "HEAD" | "dirty" | "committed"): string | null {
    try { return decode(bytes); } catch { this.undecodable.push({ bytes, view }); return null; }
  }
  bytePathGaps(roots: string[], committed = false) {
    for (const item of this.undecodable) if ((item.view === "HEAD" && roots.some(root => root === "." || item.bytes.equals(Buffer.from(root)) || item.bytes.subarray(0, Buffer.byteLength(root + "/")).equals(Buffer.from(root + "/")))) || (committed && item.view === "committed")) {
      const path = "git-bytes:" + item.bytes.toString("hex");
      if (!this.diagnostics.some(d => d.code === "filename" && d.path === path)) this.gap("filename", "selected Git scope contains a filename that cannot be represented as UTF-8", path);
    }
  }
  git(...args: string[]): Buffer {
    const result = Bun.spawnSync(["git", "--no-pager", "--literal-pathspecs", "-c", "core.fsmonitor=false", ...args], {
      cwd: this.repo, env: gitEnvironment(), stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) fail("Git collection failed");
    return result.stdout;
  }
  changed(...revisions: string[]): string[] {
    const fields = nulFields(this.git("diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", "--find-renames", ...revisions, "--"));
    const paths: string[] = [];
    for (let at = 0; at < fields.length;) {
      const status = fields[at++].toString("ascii"), count = /^[RC]/u.test(status) ? 2 : 1;
      for (let i = 0; i < count; i++) { if (!fields[at]?.length) fail("unreadable Git path list"); const name = this.path(fields[at++], revisions.length > 1 ? "committed" : "dirty"); if (name !== null) paths.push(name); }
    }
    return paths;
  }
  gap(code: string, message: string, path?: string) { this.diagnostics.push({ code, ...(path === undefined ? {} : { path }), message }); }
  ensureReader(): (bytes: Uint8Array) => unknown {
    if (this.reader === null) throw new ReaderUnavailable();
    if (this.reader === undefined) {
      try { this.reader = createYAMLReader(fail, { offline: true }); }
      catch { this.reader = null; throw new ReaderUnavailable(); }
    }
    return this.reader;
  }
  readerGap() {
    if (!this.diagnostics.some(item => item.code === "reader")) this.gap("reader", "the locked verified YAML reader is unavailable offline");
  }
  yaml(bytes: Uint8Array): unknown { return this.ensureReader()(bytes); }
  headBytes(path: string): Buffer {
    const entry = this.tree.get(path);
    if (!entry || entry.mode === "120000") fail("missing file or symlink in HEAD");
    return this.git("cat-file", "blob", entry.oid);
  }
  overlay(path: string): Buffer | null {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      try {
        if (lstatSync(join(this.repo, ...parts.slice(0, i))).isSymbolicLink()) fail("selected metadata contains a symlink");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    }
    return readFileSync(join(this.repo, path));
  }
}

function policy(snapshot: Snapshot): RootsReport {
  const report: RootsReport = {
    schema_version: 1, protocol: 1, command: "roots", head: snapshot.head, outcome: "absent", roots: [],
    policy: { view: "HEAD", sha256: null, excluded_dirty: snapshot.dirty.includes("AGENTS.md"), feature_root: "docs/internal/plans", local_format: false }, diagnostics: snapshot.diagnostics,
  };
  if (!snapshot.head) { report.outcome = "incomplete"; return report; }
  if (!snapshot.tree.has("AGENTS.md")) return report;
  try {
    const bytes = snapshot.headBytes("AGENTS.md"); report.policy.sha256 = hash(bytes);
    let fence: string | undefined, featureDeclared = false;
    const declarations: string[] = [];
    for (const line of bytes.toString().split(/\r?\n/u)) {
      // Match the existing feature resolver exactly; roots have their own fence-aware grammar.
      const feature = line.match(/^Feature documents: `?([^`\s]+)`?$/u);
      if (feature && !featureDeclared) { report.policy.feature_root = repositoryPath(feature[1]); featureDeclared = true; }
      if (line === "Feature document format: local") report.policy.local_format = true;
      const fenced = line.match(/^ {0,3}(`{3,}|~{3,})/u);
      if (fence) { if (fenced && fenced[1][0] === fence[0] && fenced[1].length >= fence.length && new RegExp(`^ {0,3}${fenced[1]}\\s*$`, "u").test(line)) fence = undefined; continue; }
      if (fenced) { fence = fenced[1]; continue; }
      if (/^[ \t]*Documentation impact roots:/u.test(line)) {
        if (!line.startsWith("Documentation impact roots:")) fail("documentation roots declaration must start at column 0");
        declarations.push(line.slice("Documentation impact roots:".length).trim());
      }
    }
    if (declarations.length) {
      if (declarations.length !== 1 || !declarations[0].startsWith("[")) fail("expected one documentation roots flow sequence");
      const value = snapshot.yaml(Buffer.from("roots: " + declarations[0])), object = record(value);
      if (!object || !Array.isArray(object.roots) || !object.roots.length || object.roots.some(root => typeof root !== "string")) fail("documentation roots must be a nonempty list of paths");
      report.roots = sorted(object.roots.map(root => repositoryPath(root)));
      if (report.roots.length !== object.roots.length) fail("duplicate documentation root");
      report.outcome = "declared";
      for (const root of report.roots) {
        if (![...snapshot.tree.keys()].some(path => within(path, root))) fail("declared documentation root is missing from HEAD");
        for (const [path, entry] of snapshot.tree) if (entry.mode === "120000" && (within(root, path) || within(path, root))) snapshot.gap("symlink", "tracked symlink inside or above a documentation root", path);
      }
    }
  } catch (error) {
    if (error instanceof ReaderUnavailable) snapshot.readerGap();
    else snapshot.gap("policy", "could not read the committed documentation roots or feature classification", "AGENTS.md");
    report.outcome = "incomplete";
  }
  snapshot.bytePathGaps(report.roots);
  if (snapshot.diagnostics.length) report.outcome = "incomplete";
  return report;
}

export function resolveRoots(repo: string): RootsReport { return policy(new Snapshot(repo)); }

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function patterns(snapshot: Snapshot, bytes: Buffer): string[] {
  const text = decode(bytes).replace(/^\uFEFF/u, "");
  if (!/^---[ \t]*(?:\r?\n|$)/u.test(text)) return [];
  const close = /^---[ \t]*\r?$/gmu; close.lastIndex = text.indexOf("\n") + 1;
  const end = close.exec(text);
  if (!end) fail("unterminated frontmatter");
  const value = snapshot.yaml(Buffer.from(text.slice(text.indexOf("\n") + 1, end.index))), object = record(value);
  if (!object) fail("frontmatter must be a mapping");
  if (!Object.hasOwn(object, "covers")) return [];
  if (!Array.isArray(object.covers) || object.covers.some(pattern => typeof pattern !== "string")) fail("covers must be a list of patterns");
  return object.covers.map(pattern => { compileCoverage(pattern); return pattern; });
}

export function collectImpact(options: CheckOptions): ImpactReport {
  const snapshot = new Snapshot(options.repo), resolved = policy(snapshot);
  const report: ImpactReport = {
    schema_version: 1, protocol: 1, command: "check", outcome: "incomplete", roots: resolved.roots, policy: resolved.policy,
    source: { head: snapshot.head, base: options.base ?? null, merge_base: null, paths: [], excluded_dirty_paths: [], bindings: [] },
    metadata: { selected_paths: [], excluded_dirty_docs: [], uncovered_docs: [], bindings: [] }, candidates: [], unmatched_sources: [], diagnostics: snapshot.diagnostics,
  };
  const select = (paths: string[], kind: string): string[] => {
    const selected: string[] = [];
    for (const path of paths) { try { selected.push(repositoryPath(path)); } catch { snapshot.gap("path", `invalid ${kind} path`, path); } }
    return sorted(selected);
  };
  if (options.roots) report.roots = select(options.roots, "documentation root");
  if (!report.roots.length) snapshot.gap("roots", "no documentation roots were selected");
  const explicit = select(options.paths ?? [], "source"), metadata = select(options.metadataPaths ?? [], "metadata");
  report.metadata.selected_paths = metadata;
  let committed: string[] = [];
  if (options.base !== undefined && snapshot.head) {
    try {
      const base = snapshot.git("rev-parse", "--verify", "--end-of-options", options.base + "^{commit}").toString().trim();
      const bases = snapshot.git("merge-base", "--all", snapshot.head, base).toString().trim().split("\n");
      if (bases.length !== 1 || !bases[0]) fail("nonunique merge base");
      report.source.merge_base = bases[0]; committed = snapshot.changed(bases[0], snapshot.head);
    } catch { snapshot.gap("base", "could not resolve one merge-base for the requested base"); }
  }
  report.source.paths = sorted([...committed, ...explicit]);
  report.source.excluded_dirty_paths = sorted([...snapshot.dirty.filter(path => !explicit.includes(path)), ...snapshot.undecodable.filter(item => item.view === "dirty").map(item => "git-bytes:" + item.bytes.toString("hex"))]);
  snapshot.bytePathGaps(report.roots, true);
  const inRoots = (path: string) => report.roots.some(root => within(path, root));
  report.metadata.excluded_dirty_docs = snapshot.dirty.filter(path => inRoots(path) && markdown(path) && !metadata.includes(path));
  const docs = new Set([...snapshot.tree.keys()].filter(path => inRoots(path) && markdown(path)));
  for (const path of metadata) {
    if (!inRoots(path) || !markdown(path)) snapshot.gap("metadata-path", "selected metadata must be Markdown inside the selected roots", path);
    else docs.add(path);
  }
  for (const root of report.roots) {
    if (![...snapshot.tree.keys(), ...metadata].some(path => within(path, root))) snapshot.gap("root", "documentation root is absent from the selected view", root);
    for (const [path, entry] of snapshot.tree) if (entry.mode === "120000" && (within(root, path) || within(path, root))) snapshot.gap("symlink", "tracked symlink inside or above a documentation root", path);
  }
  // Resolve the reader even when every file is uncovered: setup is an explicit prerequisite.
  try { snapshot.ensureReader(); } catch { snapshot.readerGap(); }
  const covered = new Set<string>(), matched = new Set<string>();
  for (const path of sorted(docs)) {
    try {
      const overlay = metadata.includes(path), bytes = overlay ? snapshot.overlay(path) : snapshot.headBytes(path);
      report.metadata.bindings.push({ path, view: overlay ? "working-tree" : "HEAD", sha256: bytes === null ? null : hash(bytes) });
      if (bytes === null || snapshot.reader === null) continue;
      const declarations = patterns(snapshot, bytes);
      if (!declarations.length) { report.metadata.uncovered_docs.push(path); continue; }
      for (const root of report.roots) if (within(path, root)) covered.add(root);
      const attention = !resolved.policy.local_format && within(path, resolved.policy.feature_root);
      const matches: Candidate["matches"] = [];
      for (const pattern of declarations) {
        const match = compileCoverage(pattern);
        for (const source of report.source.paths) if (!(attention && source === path) && match(source)) { matches.push({ source, pattern }); matched.add(source); }
      }
      if (matches.length) report.candidates.push({ path, coverage_only: true, feature_attention: attention, matches });
    } catch { snapshot.gap("metadata", "could not read valid frontmatter and coverage patterns in the selected view", path); }
  }
  for (const root of report.roots) if (snapshot.reader !== null && !covered.has(root)) snapshot.gap("coverage", "documentation root has no usable declared coverage", root);
  for (const path of explicit) {
    // Source scope is a name selection. Missing files and symlinks are not followed.
    let bytes: Buffer | null = null;
    try { bytes = snapshot.overlay(path); } catch { /* The report binds the name, with no claim about unread bytes. */ }
    report.source.bindings.push({ path, view: "working-tree", sha256: bytes === null ? null : hash(bytes) });
  }
  report.unmatched_sources = report.source.paths.filter(path => !matched.has(path));
  report.outcome = snapshot.diagnostics.length ? "incomplete" : report.candidates.length ? "candidates" : "none";
  return report;
}
