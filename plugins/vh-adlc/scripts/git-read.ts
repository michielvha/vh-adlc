import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

/** Run Git byte reads against the selected checkout, independent of inherited hook state. */
export function readGit(repo: string, ...args: string[]): Buffer {
  return readGitWithEnvironment(repo, args, process.env);
}

/** Collection subprocesses can supply an allowlisted environment through the same runner. */
export function readGitWithEnvironment(repo: string, args: string[], environment: Readonly<Record<string, string | undefined>>, input?: Uint8Array): Buffer {
  const env = gitEnvironment(environment);
  let temporary: string | undefined;
  try {
    let selectedArgs = args;
    if (args.includes("diff")) {
      // Porcelain diff can refresh the index even with optional locks disabled.
      const index = readGitWithEnvironment(repo, ["rev-parse", "--path-format=absolute", "--git-path", "index"], environment).toString().replace(/\n$/u, "");
      const parent = realpathSync(tmpdir());
      const common = readGitWithEnvironment(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"], environment).toString().replace(/\n$/u, "");
      for (const root of [realpathSync(repo), realpathSync(common)]) {
        const delta = relative(root, parent);
        if (delta === "" || !isAbsolute(delta) && delta !== ".." && !delta.startsWith("../")) throw Error("Git read temporary directory overlaps the selected repository");
      }
      temporary = mkdtempSync(join(parent, "vh-git-read-index-"));
      const privateIndex = join(temporary, "index");
      if (existsSync(index)) writeFileSync(privateIndex, readFileSync(index), { flag: "wx", mode: 0o600 });
      env.GIT_INDEX_FILE = privateIndex;
      selectedArgs = ["-c", "diff.autoRefreshIndex=true", "-c", "core.splitIndex=false", ...args];
    }
    const result = Bun.spawnSync(gitReadArguments(selectedArgs), {
      cwd: repo, env, ...(input === undefined ? {} : { stdin: input }), stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error("Git collection failed");
    return result.stdout;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

export function gitEnvironment(base: Readonly<Record<string, string | undefined>> = process.env): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...base,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
  };
  // Git exports these when calling hooks. The repo argument selects this command's checkout.
  const inherited = [
    "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
    "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE",
    "GIT_INDEX_FILE", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE", "GIT_COMMON_DIR", "GIT_NAMESPACE",
  ];
  for (const key of inherited) delete env[key];
  for (const key of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_/u.test(key)) delete env[key];
  }
  return env;
}

/** Shared fixed argv for synchronous reads and owned authenticated collection. */
export function gitReadArguments(args: string[]): string[] {
  return ["git", "--no-pager", "--literal-pathspecs", "-c", "core.fsmonitor=false", ...args];
}
