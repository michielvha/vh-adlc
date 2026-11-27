// The external command route for the two reviewer roles (references/loop-settings.md,
// references/review-protocol.md). It runs a reviewer CLI on one exact commit and decides whether its
// reply may be stored. A read-only spec review reads a read-only `git archive` export of the commit
// and is launched from it; an implementation review runs in the owning worktree, which must be
// unchanged afterwards outside the declared scratch directories. Every outcome that is not `ready`
// is `pending`: nothing is stored.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pidNamespaceAvailable, resolvedPath, runOwnedClient, seatbeltAvailable } from "../triage/owned-process";
import { nulRecords, statusEntries } from "./git-paths";
import { gitEnvironment, gitReadArguments, readGitWithEnvironment } from "../git-read";

export type ReviewKind = "spec" | "implementation";
export type ReviewOutcome =
  | { status: "ready"; model: string; target: string; records: string; isolation: "procedural"; reply: string }
  | { status: "pending"; reason: string; reply?: string; exit_code?: number };
export type Cleanup = (result: { survivors: number[]; confirmed: boolean }) => Promise<{ confirmed: boolean; survivors: number[] }>;

export type ReviewRequest = {
  repo: string; commit: string; kind: ReviewKind; document: string;
  route: { model: string; argv: string[]; model_attestation?: "codex-session" }; prompt: string;
  scratch?: string[]; timeoutMs?: number; env?: Record<string, string>;
  /** Test seam: replaces the confirmation of process cleanup. */
  cleanup?: Cleanup;
  /** Test seam: `unavailable` simulates a host with neither a PID namespace nor a sandbox-exec write boundary. */
  boundary?: "auto" | "unavailable";
};

const QUIET_GIT = { GIT_OPTIONAL_LOCKS: "0" };

function git(root: string, args: string[], input?: Uint8Array): Buffer {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdin: input, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...QUIET_GIT } });
  if (run.exitCode !== 0) throw Error(`git ${args[0]} failed`);
  return run.stdout as Buffer;
}
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

function underScratch(path: string | Buffer, scratch: string[]) {
  return scratch.some(dir => {
    if (typeof path === "string") return path === dir || path.startsWith(`${dir.replace(/\/+$/, "")}/`);
    const prefix = Buffer.from(dir.replace(/\/+$/u, ""));
    return path.equals(prefix) || path.subarray(0, prefix.length + 1).equals(Buffer.concat([prefix, Buffer.from("/")]));
  });
}

/** A manifest of an ignored directory tree: each file's path and content hash. */
function treeManifest(root: string, dir: string, scratch: string[]): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(join(root, path))) {
      const child = path ? `${path}/${name}` : name;
      if (underScratch(child, scratch)) continue;
      const info = lstatSync(join(root, child));
      if (info.isDirectory()) walk(child);
      else out.push(`${child}\t${fileDigest(root, child)}`);
    }
  };
  walk(dir.replace(/\/+$/, ""));
  return out;
}

function fileDigest(root: string, path: string): string {
  try {
    const info = lstatSync(join(root, path));
    if (info.isSymbolicLink()) return `link:${readlinkSync(join(root, path))}`;
    if (info.isDirectory()) return "dir";
    return digest(readFileSync(join(root, path)));
  } catch { return "absent"; }
}

function logicalEnvironment() {
  return { PATH: process.env.PATH, HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, LANG: "C", LC_ALL: "C",
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM,
    GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
}
function logicalGit(root: string, args: string[]): Buffer { return readGitWithEnvironment(root, args, logicalEnvironment()); }
function byteRecords(bytes: Buffer): Buffer[] {
  const records: Buffer[] = [];
  for (let start = 0; start < bytes.length;) {
    const end = bytes.indexOf(0, start);
    if (end < 0) throw Error("Incomplete logical Git snapshot records");
    records.push(bytes.subarray(start, end)); start = end + 1;
  }
  return records;
}

/** Hash resolved repository/worktree-local values in memory, preserving each key's multi-value order. */
export function repositoryConfigurationDigest(root: string): string {
  const records = byteRecords(logicalGit(root, ["config", "--includes", "--null", "--list", "--show-scope"]));
  if (records.length % 2 !== 0) throw Error("Incomplete repository configuration snapshot");
  const values = new Map<string, string[]>();
  for (let index = 0; index < records.length; index += 2) {
    const scope = records[index].toString("ascii");
    if (scope !== "local" && scope !== "worktree") continue;
    const pair = records[index + 1], separator = pair.indexOf(10);
    const key = (separator < 0 ? pair : pair.subarray(0, separator)).toString("hex");
    const value = digest(separator < 0 ? Buffer.alloc(0) : pair.subarray(separator + 1));
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const exclude = logicalGit(root, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]).toString().replace(/\n$/u, "");
  const ignore = existsSync(exclude) ? digest(readFileSync(exclude)) : "absent";
  return digest(JSON.stringify({ values: [...values].sort(([left], [right]) => Buffer.compare(Buffer.from(left, "hex"), Buffer.from(right, "hex"))), ignore }));
}

function logicalContents(root: string, paths: Buffer[], ignoredPaths: Buffer[], directoryPaths: Buffer[], gitlinks: Set<string>, scope: "full" | "owning", scratch: string[]): string[] {
  const normalized = (path: Buffer) => path.at(-1) === 47 ? path.subarray(0, -1) : path;
  const kept = new Set(paths.map(path => normalized(path).toString("hex")));
  const ignored = new Set(ignoredPaths.map(path => normalized(path).toString("hex")));
  const directories = new Set(directoryPaths.map(path => normalized(path).toString("hex")));
  const ancestors = new Set<string>();
  for (const raw of [...paths, ...directoryPaths]) {
    const path = normalized(raw);
    ancestors.add(path.toString("hex"));
    for (let separator = path.indexOf(47); separator >= 0; separator = path.indexOf(47, separator + 1))
      ancestors.add(path.subarray(0, separator).toString("hex"));
  }
  const rows: string[] = [];
  function visit(path: Buffer, inheritedIgnore = false): void {
    if (path.length && underScratch(path, scratch)) return;
    const identity = path.toString("hex"), full = Buffer.concat([Buffer.from(root + "/"), path]);
    const excluded = !directories.has(identity) && (inheritedIgnore || ignored.has(identity));
    if (excluded && !ancestors.has(identity)) return;
    try {
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        if (kept.has(identity)) rows.push(`${identity}\tlink\t${readlinkSync(full, { encoding: "buffer" }).toString("hex")}`);
      } else if (stat.isFile()) {
        if (kept.has(identity)) rows.push(`${identity}\tfile\t${stat.mode}\t${digest(readFileSync(full))}`);
      } else if (stat.isDirectory()) {
        rows.push(`${identity}\tdirectory\t${stat.mode}`);
        if (path.length && (gitlinks.has(identity) || kept.has(identity)) && existsSync(Buffer.concat([full, Buffer.from("/.git")]))) {
          const nested = new TextDecoder("utf-8", { fatal: true }).decode(full);
          if (realpathSync(logicalGit(nested, ["rev-parse", "--show-toplevel"]).toString().replace(/\n$/u, "")) !== realpathSync(nested))
            throw Error("Nested Git snapshot root differs from its worktree");
          rows.push(`${identity}\tgitlink\t${digest(JSON.stringify(snapshot(nested, [], scope, { ignored: "exclude" })))}\t${repositoryConfigurationDigest(nested)}`);
        } else for (const name of readdirSync(full, { encoding: "buffer" }).sort(Buffer.compare)) {
          if (name.equals(Buffer.from(".git"))) continue;
          visit(path.length ? Buffer.concat([path, Buffer.from("/"), name]) : name, excluded);
        }
      } else if (kept.has(identity)) throw Error("Unsupported logical snapshot file type");
    } catch (error) {
      if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) rows.push(`${identity}\tabsent`);
      else throw error;
    }
  }
  visit(Buffer.alloc(0));
  return rows;
}

/**
 * Everything a reviewer could change in the owning worktree: HEAD, every ref, index entries with their
 * flags, status, the ignored-file list and the contents of every tracked, untracked and ignored file.
 * Scratch directories are left out.
 */
export function snapshot(root: string, scratch: string[], scope: "full" | "owning" = "full", options: { ignored?: "include" | "exclude" } = {}): Record<string, string> {
  if (options.ignored === "exclude") {
    const index = logicalGit(root, ["ls-files", "--stage", "-v", "-z"]);
    const paths = byteRecords(logicalGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]));
    const kept = paths.filter(path => !underScratch(path, scratch));
    const ignoredPaths = byteRecords(logicalGit(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]));
    const directoryPaths = byteRecords(logicalGit(root, ["ls-files", "--others", "--exclude-standard", "--directory", "-z"])).filter(path => path.at(-1) === 47);
    const gitlinks = new Set(byteRecords(index).filter(row => /^[A-Za-z?] 160000 /u.test(row.toString("ascii")))
      .map(row => row.subarray(row.indexOf(9) + 1).toString("hex")));
    const symbolic = Bun.spawnSync(gitReadArguments(["symbolic-ref", "-q", "HEAD"]), { cwd: root,
      stdout: "pipe", stderr: "pipe", env: gitEnvironment(logicalEnvironment()) });
    if (symbolic.exitCode !== 0 && symbolic.exitCode !== 1) throw Error("Logical snapshot branch unavailable");
    const branch = symbolic.exitCode === 0 ? symbolic.stdout.toString().trim() : "detached";
    return { head: logicalGit(root, ["rev-parse", "HEAD"]).toString().trim(), head_ref: branch,
      refs: scope === "full" ? digest(logicalGit(root, ["for-each-ref", "--format=%(refname) %(objectname)"]))
        : digest(branch === "detached" ? "detached" : branch + " " + logicalGit(root, ["rev-parse", branch]).toString().trim()),
      index: digest(index), status: digest(kept.map(path => path.toString("hex")).sort().join("\n")),
      ignored: digest(""), contents: digest(logicalContents(root, kept, ignoredPaths, directoryPaths, gitlinks, scope, scratch).sort().join("\n")) };
  }
  const keep = (path: string) => !underScratch(path, scratch);
  const entries = statusEntries(root, ["--untracked-files=all", "--ignored=no"]).filter(entry => keep(entry.path));
  const status = entries.map(entry => `${entry.xy}\0${entry.path}\0${entry.from ?? ""}`);
  const changed = entries.flatMap(entry => entry.from ? [entry.path, entry.from] : [entry.path]);
  const ignored = nulRecords(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]).filter(keep);
  const index = nulRecords(root, ["ls-files", "--stage", "-v", "-z"]);
  // Every tracked file is hashed, clean or not: Git's stat cache can call a same-size rewrite with a
  // restored modification time clean (for example under core.trustctime=false).
  const tracked = index.map(line => line.slice(line.indexOf("\t") + 1)).filter(keep);
  const contents: string[] = [];
  for (const path of new Set([...changed, ...tracked])) contents.push(`${path}\t${fileDigest(root, path)}`);
  for (const path of ignored) {
    if (path.endsWith("/")) for (const entry of treeManifest(root, path, scratch)) contents.push(`ignored-tree\t${entry}`);
    else contents.push(`${path}\t${fileDigest(root, path)}`);
  }
  const symbolic = Bun.spawnSync(["git", "symbolic-ref", "-q", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...QUIET_GIT } });
  return {
    head: git(root, ["rev-parse", "HEAD"]).toString().trim(),
    head_ref: symbolic.exitCode === 0 ? symbolic.stdout.toString().trim() : "detached",
    // In the owning worktree only HEAD and its own branch count: other sessions move the shared refs.
    refs: scope === "full" ? digest(git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]))
      : digest(symbolic.exitCode === 0 ? `${symbolic.stdout.toString().trim()} ${git(root, ["rev-parse", symbolic.stdout.toString().trim()]).toString().trim()}` : "detached"),
    index: digest(index.join("\n")),
    status: digest(status.join("\n")),
    ignored: digest(ignored.join("\n")),
    contents: digest(contents.sort().join("\n")),
  };
}

/** Exports `commit` read-only. Fails when a committed symlink points outside the export. */
export function exportCommit(repo: string, commit: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-adlc-review-export-")));
  const archive = git(repo, ["archive", "--format=tar", commit]);
  const tar = Bun.spawnSync(["tar", "-x", "-C", dir], { stdin: archive, stdout: "ignore", stderr: "pipe" });
  if (tar.exitCode !== 0) throw Error("extracting the export failed");
  const escaping: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(join(dir, path))) {
      const child = path ? `${path}/${name}` : name, full = join(dir, child), info = lstatSync(full);
      if (info.isSymbolicLink()) {
        // Follow every intermediate link: a lexical check misses chains such as d/back -> .. with
        // leak -> d/back/../outside.txt. A link whose destination cannot be resolved cannot be shown
        // to stay inside, so it counts as escaping too.
        let real: string | undefined;
        try { real = realpathSync(full); } catch { real = undefined; }
        const rel = real === undefined ? ".." : relative(dir, real);
        if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) escaping.push(child);
      } else if (info.isDirectory()) walk(child);
    }
  };
  walk("");
  writeFileSync(join(dir, ".vh-adlc-export"), `${commit}\n`);
  Bun.spawnSync(["chmod", "-R", "a-w", dir]);
  if (escaping.length) {
    removeExport(dir);
    throw Error(`the export holds a committed symlink that escapes it: ${escaping.join(", ")}`);
  }
  return dir;
}
export function removeExport(dir: string) {
  Bun.spawnSync(["chmod", "-R", "u+w", dir]);
  rmSync(dir, { recursive: true, force: true });
}

/** Splits a reply into its two header lines and the records after them. */
export function parseReply(reply: string): { model: string; target: string; records: string } | { error: string } {
  // A reviewer that cannot read a convention page from the cache stops on its own line; that is a pending
  // review for the dispatcher, never a record, whatever header lines came before it. Replies whose records
  // open as records do (FINDING:, CRITERION: or NO FINDINGS) are records, even when they quote the marker.
  // In any other reply a marker line stops the review, matched leniently: any case and spacing, list or quote
  // markers, emphasis, backticks, a colon, a dash or nothing after the words, code fences, a line of prose
  // before it and trailing text after it.
  const lines = reply.split(/\r?\n/).map(text => text.trim()).filter(Boolean).filter(text => !/^(?:MODEL|TARGET): /.test(text));
  if (!/^(?:FINDING:|CRITERION:|NO FINDINGS)/.test(lines[0] ?? "")) {
    for (const text of lines) {
      const stop = /^PAGE\s+NOT\s+CACHED\b[*_`'"]*\s*[:\-\u2013\u2014]?[*_`'"\s]*(.*)$/i.exec(text.replace(/^[\s>*+\-\d.)`'"_]*/, ""));
      if (!stop) continue;
      const page = /[A-Za-z0-9_\/-][A-Za-z0-9._\/-]*/.exec(stop[1]!)?.[0]?.replace(/\.+$/, "");
      return { error: `the reviewer stopped: page not cached: ${page || "unnamed"}` };
    }
  }
  // Only the two header lines and the blank lines around them are removed; the records keep their bytes.
  let at = 0;
  const line = (): string | undefined => {
    while (at < reply.length) {
      const end = reply.indexOf("\n", at), stop = end < 0 ? reply.length : end + 1, text = reply.slice(at, stop);
      at = stop;
      if (text.trim()) return text.trim();
    }
    return undefined;
  };
  const model = /^MODEL: (\S+)$/.exec(line() ?? "");
  if (!model) return { error: "the reply does not open with a MODEL: line" };
  const target = /^TARGET: ([0-9a-f]{7,40})$/.exec(line() ?? "");
  if (!target) return { error: "the reply has no TARGET: line after MODEL:" };
  let rest = reply.slice(at);
  while (/^\r?\n/.test(rest)) rest = rest.replace(/^\r?\n/, "");
  return { model: model[1]!, target: target[1]!, records: rest };
}

function substitute(argv: string[], values: Record<string, string>): string[] {
  return argv.map(part => part.replace(/\{(model|prompt|prompt_file|export_dir)\}/g, (_, name: string) => values[name] ?? ""));
}

/**
 * Codex's `--json` stream names the thread; its session log under `$HOME/.codex/sessions` records the
 * model that served it. Returns the reply text (the final agent message) and the attested model.
 */
export function codexSession(stdout: string, home: string): { reply: string; model?: string; error?: string } {
  let thread: string | undefined, reply = "";
  for (const line of stdout.split("\n")) {
    let event: { type?: string; thread_id?: string; item?: { type?: string; text?: string } };
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === "thread.started" && event.thread_id) thread = event.thread_id;
    if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") reply = event.item.text;
  }
  if (!thread || !/^[0-9a-f-]{16,}$/i.test(thread)) return { reply, error: "the Codex stream named no thread id, so the served model cannot be attested" };
  const sessions = join(home, ".codex", "sessions");
  const found: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      const path = join(dir, name);
      if (lstatSync(path).isDirectory()) walk(path);
      else if (name.startsWith("rollout-") && name.endsWith(`-${thread}.jsonl`)) found.push(path);
    }
  };
  walk(sessions);
  if (found.length !== 1) return { reply, error: `no single Codex session log for thread ${thread}, so the served model cannot be attested` };
  const models = new Set<string>();
  for (const line of readFileSync(found[0]!, "utf8").split("\n")) {
    for (const match of line.matchAll(/"model":"([^"]+)"/g)) models.add(match[1]!);
  }
  if (models.size !== 1) return { reply, error: `the Codex session log records ${models.size === 0 ? "no model" : "several models"}, so the served model cannot be attested` };
  return { reply, model: [...models][0] };
}

/** An alias matches any ID of its family; a full ID must match exactly; `unknown` never matches. */
export function modelMatches(requested: string, reported: string): boolean {
  if (reported === "unknown") return false;
  if (requested === reported) return true;
  return !/\d/.test(requested) && reported.toLowerCase().split(/[-.]/).includes(requested.toLowerCase());
}

const NO_BOUNDARY = "no process boundary on this host keeps reviewer processes off the owning worktree after the review "
  + "(a PID namespace through unshare on Linux, or a sandbox-exec write boundary on macOS, is required)";

/**
 * The first regular file under `root`, outside `.git` and the scratch directories, that already has a second
 * hard link. Seatbelt checks the path a write goes through, so such a file could be changed through its
 * other name.
 */
export function protectedLinkCheck(root: string, scratch: string[], extra: string[],
  hooks: { afterList?: (dir: string) => void } = {}): { linked?: string; changed?: string } {
  for (const path of extra) { try { const info = lstatSync(path); if (info.isFile() && info.nlink > 1) return { linked: path }; } catch { /* absent */ } }
  // Another session may remove or lock a file between the listing and its lstat: that is a retry, not an error.
  const walk = (path: string): { linked?: string; changed?: string } | undefined => {
    let names: string[];
    try { names = readdirSync(join(root, path)); } catch { return { changed: path || "." }; }
    hooks.afterList?.(path);
    for (const name of names) {
      const child = path ? `${path}/${name}` : name;
      if (child === ".git" || underScratch(child, scratch)) continue;
      let info;
      try { info = lstatSync(join(root, child)); } catch { return { changed: child }; }
      if (info.isDirectory()) { const found = walk(child); if (found) return found; }
      else if (info.isFile() && info.nlink > 1) return { linked: child };
    }
    return undefined;
  };
  return walk("") ?? {};
}

/**
 * The first scratch allow that would open a protected path: one that resolves to a denied path or a parent
 * of one, into a Git directory, or, through a symlink, to anywhere inside a denied path. The snapshot skips
 * a scratch entry by its declared path, not by what it points at.
 */
function scratchOverlap(allows: { entry: string; declared: string }[], deny: string[], gitDirs: string[]): { entry: string; resolved: string } | undefined {
  const inside = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);
  for (const { entry, declared } of allows) {
    const resolved = resolvedPath(declared);
    if (deny.some(dir => inside(dir, resolved)) || gitDirs.some(dir => inside(resolved, dir))
      || resolved !== declared && deny.some(dir => inside(resolved, dir))) return { entry, resolved };
  }
  return undefined;
}

export async function runReviewRoute(request: ReviewRequest): Promise<ReviewOutcome> {
  const repo = realpathSync(request.repo), scratch = (request.scratch ?? []).map(dir => dir.replace(/\/+$/, ""));
  const commit = git(repo, ["rev-parse", "--verify", `${request.commit}^{commit}`]).toString().trim();
  const work = realpathSync(mkdtempSync(join(tmpdir(), "vh-adlc-review-run-")));
  let exportDir: string | undefined, cloneDir: string | undefined;
  try {
    const namespace = request.boundary !== "unavailable" && pidNamespaceAvailable();
    const seatbelt = request.boundary !== "unavailable" && !namespace && seatbeltAvailable();
    if (!namespace && !seatbelt) return { status: "pending", reason: NO_BOUNDARY };
    const gitDir = git(repo, ["rev-parse", "--absolute-git-dir"]).toString().trim();
    const commonDir = git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).toString().trim();
    if (seatbelt) {
      const links = protectedLinkCheck(repo, scratch, [join(gitDir, "index"), join(gitDir, "HEAD")]);
      if (links.changed) return { status: "pending", reason: `a protected file changed while the link check read it (${links.changed}); retry the review` };
      if (links.linked) return { status: "pending", reason: `a protected file already has a second hard link, through which a reviewer could change it after the review: ${links.linked}` };
    }
    if (request.kind === "spec") {
      try { exportDir = exportCommit(repo, commit); } catch (error) { return { status: "pending", reason: (error as Error).message }; }
    } else {
      // An implementation review runs in a private clone of the reviewed commit, with refs of its own.
      cloneDir = join(work, "clone");
      const clone = Bun.spawnSync(["git", "clone", "-q", "--no-hardlinks", repo, cloneDir], { stdout: "pipe", stderr: "pipe" });
      const checkout = clone.exitCode === 0 ? Bun.spawnSync(["git", "-C", cloneDir, "checkout", "-q", "--detach", commit], { stdout: "pipe", stderr: "pipe" }) : clone;
      if (checkout.exitCode !== 0) return { status: "pending", reason: "the private review clone could not be prepared" };
    }
    // Under the macOS boundary no reviewer process may write what the before-and-after check judges. The
    // profile is built from these resolved paths, after no scratch allow is shown to open a protected one.
    const deny = [repo, gitDir, commonDir, ...(cloneDir ? [cloneDir] : []), ...(exportDir ? [exportDir] : [])].map(resolvedPath);
    const allows = [...scratch.map(entry => ({ entry, declared: join(repo, entry) })),
      ...(cloneDir ? scratch.map(entry => ({ entry, declared: join(cloneDir!, entry) })) : [])];
    if (seatbelt) {
      const overlap = scratchOverlap(allows, deny, [resolvedPath(gitDir), resolvedPath(commonDir)]);
      if (overlap) return { status: "pending", reason: `the review_scratch entry ${overlap.entry} resolves onto a protected path (${overlap.resolved}), so allowing writes there would open it` };
    }
    const promptFile = join(work, "prompt.md");
    writeFileSync(promptFile, request.prompt);
    chmodSync(promptFile, 0o400);
    const argv = substitute(request.route.argv, { model: request.route.model, prompt: request.prompt, prompt_file: promptFile, export_dir: exportDir ?? "" });
    const before = snapshot(repo, scratch, "owning"), cloneBefore = cloneDir ? snapshot(cloneDir, scratch, "full") : undefined;
    const stdout = join(work, "stdout"), stderr = join(work, "stderr");
    mkdirSync(dirname(stdout), { recursive: true });
    const env = Object.fromEntries(Object.entries({ ...process.env, ...request.env }).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    let result;
    try {
      const writeDeny = { deny, allow: allows.map(allow => resolvedPath(allow.declared)) };
      result = await runOwnedClient(argv, { cwd: exportDir ?? cloneDir ?? repo, env, stdout, stderr, pidNamespace: namespace, writeDeny },
        { timeout_ms: request.timeoutMs ?? 15 * 60_000, grace_ms: 500, reap_ms: 2_000 });
    } catch (error) { return { status: "pending", reason: `the reviewer command could not start: ${(error as Error).message}` }; }
    const cleanup = request.cleanup ? await request.cleanup(result) : result;
    const raw = readFileSync(stdout, "utf8");
    const attestation = request.route.model_attestation === "codex-session" ? codexSession(raw, request.env?.HOME ?? process.env.HOME ?? homedir()) : undefined;
    const reply = attestation ? attestation.reply : raw;
    if (result.boundary === "marker") return { status: "pending", reason: NO_BOUNDARY, reply: readFileSync(stdout, "utf8") };
    if (!cleanup.confirmed) return { status: "pending", reason: `process cleanup could not confirm every reviewer process stopped (${cleanup.survivors.join(", ") || "group"})`, reply };
    const after = snapshot(repo, scratch, "owning"), cloneAfter = cloneDir ? snapshot(cloneDir, scratch, "full") : undefined;
    const changed = [...Object.keys(before).filter(key => before[key] !== after[key]),
      ...(cloneBefore && cloneAfter ? Object.keys(cloneBefore).filter(key => cloneBefore[key] !== cloneAfter[key]).map(key => `private clone ${key}`) : [])];
    if (changed.length) return { status: "pending", reason: `the reviewer changed the owning worktree: ${changed.join(", ")}`, reply };
    if (result.timed_out) return { status: "pending", reason: "the reviewer command timed out", reply };
    if (result.exit_code !== 0) return { status: "pending", reason: `the reviewer command failed with exit ${result.exit_code}`, reply, exit_code: result.exit_code };
    const parsed = parseReply(reply);
    if ("error" in parsed) return { status: "pending", reason: parsed.error, reply };
    let model = parsed.model;
    if (attestation) {
      if (attestation.error || !attestation.model) return { status: "pending", reason: `model attestation failed: ${attestation.error ?? "no model"}`, reply };
      if (!modelMatches(request.route.model, attestation.model)) return { status: "pending", reason: `model attestation found ${attestation.model}, not the requested ${request.route.model}`, reply };
      if (parsed.model !== "unknown" && !modelMatches(request.route.model, parsed.model)) return { status: "pending", reason: `the reviewer reported model ${parsed.model}, which differs from the attested ${attestation.model}`, reply };
      model = attestation.model;
    } else if (!modelMatches(request.route.model, parsed.model)) return { status: "pending", reason: `the reviewer reported model ${parsed.model}, not the requested ${request.route.model}`, reply };
    if (!commit.startsWith(parsed.target)) return { status: "pending", reason: `the reviewer reported target ${parsed.target}, not ${commit}`, reply };
    return { status: "ready", model, target: commit, records: parsed.records, isolation: "procedural", reply };
  } finally {
    if (exportDir) removeExport(exportDir);
    rmSync(work, { recursive: true, force: true });
  }
}

