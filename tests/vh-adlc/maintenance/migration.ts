import { existsSync, lstatSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { repositoryPath } from "../../../plugins/vh-adlc/scripts/maintenance/authority";
import { commitID, gitBytes } from "../../../plugins/vh-adlc/scripts/maintenance/history";

/** Rehearsal primitive for a disposable checkout; no real consumer rollback is authorized by a test. */
export function applyRuntimeRevision(root: string, input: { from: string; to: string; paths: string[] }) {
  const from = commitID(root, input.from), to = commitID(root, input.to);
  if (!Array.isArray(input.paths) || !input.paths.length || new Set(input.paths).size !== input.paths.length) throw Error("invalid migration path scope");
  input.paths.forEach(path => repositoryPath(path));
  const command = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", root, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw Error(`migration git ${args[0]} failed`); return result.stdout.toString();
  };
  if (command("diff", "--cached", "--name-only", "HEAD", "--", ...input.paths).trim()) throw Error("staged runtime edit blocks migration");
  const object = (commit: string, path: string) => {
    const row = gitBytes(root, "ls-tree", "-z", commit, "--", path).toString(); if (!row) return null;
    const match = row.match(/^(100644|100755) blob [a-f0-9]+\t(.+)\0$/s); if (!match || match[2] !== path) throw Error("non-file runtime object");
    return { bytes: gitBytes(root, "show", `${commit}:${path}`), mode: match[1] === "100755" ? 0o111 : 0 };
  };
  const desired = new Map<string, ReturnType<typeof object>>();
  for (const path of input.paths) {
    const prior = object(from, path), next = object(to, path), absolute = join(root, path); desired.set(path, next);
    for (const [index] of path.split("/").entries()) {
      const prefix = join(root, ...path.split("/").slice(0, index + 1));
      if (existsSync(prefix) && lstatSync(prefix).isSymbolicLink()) throw Error("symlink runtime path blocks migration");
    }
    if (prior) { const info = lstatSync(absolute); if (!info.isFile() || !readFileSync(absolute).equals(prior.bytes) || (info.mode & 0o111) !== prior.mode) throw Error("concurrent runtime edit blocks migration"); }
    else if (existsSync(absolute)) throw Error("unexpected runtime path blocks migration");
  }
  const restore = input.paths.filter(path => desired.get(path) !== null);
  if (restore.length) command("restore", `--source=${to}`, "--worktree", "--", ...restore);
  for (const path of input.paths) if (desired.get(path) === null && existsSync(join(root, path))) unlinkSync(join(root, path));
}
