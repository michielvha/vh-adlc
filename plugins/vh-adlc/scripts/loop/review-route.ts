// The external command route for the two reviewer roles (references/loop-settings.md,
// references/review-protocol.md). It runs a reviewer CLI on one exact commit and decides whether its
// reply may be stored. A file-only spec review reads a read-only `git archive` export of the commit
// and is launched from it; an implementation review runs in the owning worktree, which must be
// unchanged afterwards outside the declared scratch directories. Every outcome that is not `ready`
// is `pending`: nothing is stored.
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { runOwnedClient } from "../triage/owned-process";

export type ReviewKind = "spec" | "implementation";
export type ReviewOutcome =
  | { status: "ready"; model: string; target: string; records: string; isolation: "procedural"; reply: string }
  | { status: "pending"; reason: string; reply?: string; exit_code?: number };
export type Cleanup = (result: { survivors: number[]; confirmed: boolean }) => Promise<{ confirmed: boolean; survivors: number[] }>;

export type ReviewRequest = {
  repo: string; commit: string; kind: ReviewKind; document: string;
  route: { model: string; argv: string[] }; prompt: string;
  scratch?: string[]; timeoutMs?: number; env?: Record<string, string>;
  /** Test seam: replaces the confirmation of process cleanup. */
  cleanup?: Cleanup;
};

const QUIET_GIT = { GIT_OPTIONAL_LOCKS: "0" };

function git(root: string, args: string[], input?: Uint8Array): Buffer {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdin: input, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...QUIET_GIT } });
  if (run.exitCode !== 0) throw Error(`git ${args[0]} failed`);
  return run.stdout as Buffer;
}
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

function underScratch(path: string, scratch: string[]) {
  return scratch.some(dir => path === dir || path.startsWith(`${dir.replace(/\/+$/, "")}/`));
}

/** A manifest of a directory tree by path, size and modification time, for ignored directories. */
function treeManifest(root: string, dir: string, scratch: string[]): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(join(root, path))) {
      const child = path ? `${path}/${name}` : name;
      if (underScratch(child, scratch)) continue;
      const info = lstatSync(join(root, child));
      if (info.isDirectory()) walk(child);
      else out.push(`${child}\t${info.size}\t${info.mtimeNs ?? info.mtimeMs}`);
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

/**
 * Everything a reviewer could change in the owning worktree: HEAD, every ref, index entries with their
 * flags, status, the ignored-file list and the contents of modified, untracked, ignored and
 * flag-hidden tracked files. Scratch directories are left out.
 */
export function snapshot(root: string, scratch: string[]): Record<string, string> {
  const lines = (args: string[]) => git(root, args).toString().split("\n").filter(Boolean);
  const keep = (path: string) => !underScratch(path, scratch);
  const status = lines(["status", "--porcelain=v1", "--untracked-files=all", "--ignored=no"]).filter(line => keep(line.slice(3)));
  const changed = status.map(line => line.slice(3).replace(/^.* -> /, ""));
  const ignored = lines(["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"]).filter(keep);
  const index = lines(["ls-files", "--stage", "-v"]);
  const hidden = index.filter(line => /^[a-zS] /.test(line)).map(line => line.split("\t")[1]!).filter(keep);
  const contents: string[] = [];
  for (const path of [...changed, ...hidden]) contents.push(`${path}\t${fileDigest(root, path)}`);
  for (const path of ignored) {
    if (path.endsWith("/")) for (const entry of treeManifest(root, path, scratch)) contents.push(`ignored-tree\t${entry}`);
    else contents.push(`${path}\t${fileDigest(root, path)}`);
  }
  return {
    head: git(root, ["rev-parse", "HEAD"]).toString().trim(),
    refs: digest(git(root, ["for-each-ref", "--format=%(refname) %(objectname)"])),
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
        const target = readlinkSync(full), resolved = isAbsolute(target) ? target : resolve(dirname(full), target);
        const rel = relative(dir, resolved);
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
  const lines = reply.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  const next = () => { while (index < lines.length && !lines[index]!.trim()) index++; return lines[index++] ?? ""; };
  const modelLine = next();
  const model = /^MODEL: (\S+)$/.exec(modelLine.trim());
  if (!model) return { error: "the reply does not open with a MODEL: line" };
  const target = /^TARGET: ([0-9a-f]{7,40})$/.exec(next().trim());
  if (!target) return { error: "the reply has no TARGET: line after MODEL:" };
  const records = lines.slice(index).join("\n").replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
  return { model: model[1]!, target: target[1]!, records };
}

function substitute(argv: string[], values: Record<string, string>): string[] {
  return argv.map(part => part.replace(/\{(model|prompt|prompt_file|export_dir)\}/g, (_, name: string) => values[name] ?? ""));
}

/** An alias matches any ID of its family; a full ID must match exactly; `unknown` never matches. */
export function modelMatches(requested: string, reported: string): boolean {
  if (reported === "unknown") return false;
  if (requested === reported) return true;
  return !/\d/.test(requested) && reported.toLowerCase().split(/[-.]/).includes(requested.toLowerCase());
}

export async function runReviewRoute(request: ReviewRequest): Promise<ReviewOutcome> {
  const repo = realpathSync(request.repo), scratch = (request.scratch ?? []).map(dir => dir.replace(/\/+$/, ""));
  const commit = git(repo, ["rev-parse", "--verify", `${request.commit}^{commit}`]).toString().trim();
  const work = realpathSync(mkdtempSync(join(tmpdir(), "vh-adlc-review-run-")));
  let exportDir: string | undefined;
  try {
    if (request.kind === "spec") {
      try { exportDir = exportCommit(repo, commit); } catch (error) { return { status: "pending", reason: (error as Error).message }; }
    }
    const promptFile = join(work, "prompt.md");
    writeFileSync(promptFile, request.prompt);
    chmodSync(promptFile, 0o400);
    const argv = substitute(request.route.argv, { model: request.route.model, prompt: request.prompt, prompt_file: promptFile, export_dir: exportDir ?? "" });
    const before = snapshot(repo, scratch);
    const stdout = join(work, "stdout"), stderr = join(work, "stderr");
    mkdirSync(dirname(stdout), { recursive: true });
    const env = Object.fromEntries(Object.entries({ ...process.env, ...request.env }).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    let result;
    try {
      result = await runOwnedClient(argv, { cwd: exportDir ?? repo, env, stdout, stderr },
        { timeout_ms: request.timeoutMs ?? 15 * 60_000, grace_ms: 500, reap_ms: 2_000 });
    } catch (error) { return { status: "pending", reason: `the reviewer command could not start: ${(error as Error).message}` }; }
    const cleanup = request.cleanup ? await request.cleanup(result) : result;
    const reply = readFileSync(stdout, "utf8");
    if (!cleanup.confirmed) return { status: "pending", reason: `process cleanup could not confirm every reviewer process stopped (${cleanup.survivors.join(", ") || "group"})`, reply };
    const after = snapshot(repo, scratch);
    const changed = Object.keys(before).filter(key => before[key] !== after[key]);
    if (changed.length) return { status: "pending", reason: `the reviewer changed the owning worktree: ${changed.join(", ")}`, reply };
    if (result.timed_out) return { status: "pending", reason: "the reviewer command timed out", reply };
    if (result.exit_code !== 0) return { status: "pending", reason: `the reviewer command failed with exit ${result.exit_code}`, reply, exit_code: result.exit_code };
    const parsed = parseReply(reply);
    if ("error" in parsed) return { status: "pending", reason: parsed.error, reply };
    if (!modelMatches(request.route.model, parsed.model)) return { status: "pending", reason: `the reviewer reported model ${parsed.model}, not the requested ${request.route.model}`, reply };
    if (!commit.startsWith(parsed.target)) return { status: "pending", reason: `the reviewer reported target ${parsed.target}, not ${commit}`, reply };
    return { status: "ready", model: parsed.model, target: commit, records: parsed.records, isolation: "procedural", reply };
  } finally {
    if (exportDir) removeExport(exportDir);
    rmSync(work, { recursive: true, force: true });
  }
}

