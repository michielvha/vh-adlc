// Path reads from Git without quoting or trimming: every list uses NUL-delimited output, so a path with
// spaces, quotes or a leading status space is read exactly as Git stores it.
function run(repo: string, args: string[]): string {
  const child = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (child.exitCode !== 0) throw Error(`git ${args[0]} failed: ${child.stderr.toString().trim()}`);
  return child.stdout.toString();
}

/** Runs a Git command whose output is NUL-delimited (the caller passes -z) and returns its records. */
export function nulRecords(repo: string, args: string[]): string[] {
  return run(repo, args).split("\0").filter(record => record !== "");
}

export type StatusEntry = { xy: string; path: string; from?: string };

/** `git status --porcelain=v1 -z` entries; a rename or copy carries its source path in `from`. */
export function statusEntries(repo: string, extra: string[] = []): StatusEntry[] {
  const records = nulRecords(repo, ["status", "--porcelain=v1", "-z", ...extra]);
  const entries: StatusEntry[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!, xy = record.slice(0, 2), path = record.slice(3);
    if (xy[0] === "R" || xy[0] === "C") entries.push({ xy, path, from: records[++i] });
    else entries.push({ xy, path });
  }
  return entries;
}

/** Paths changed between two commits; a rename counts as both its source and its destination. */
export function diffPaths(repo: string, from: string, to: string): string[] {
  return nulRecords(repo, ["diff", "--no-renames", "--name-only", "-z", from, to]);
}

/** Every path any commit in `range` touched, rename sources included, so a change reverted later in the range still counts. */
export function rangePaths(repo: string, range: string): string[] {
  // One read per commit: `git log -z` separates commits with a newline that a filename may also start with.
  const commits = run(repo, ["rev-list", range]).split("\n").filter(Boolean);
  return [...new Set(commits.flatMap(commit => nulRecords(repo, ["diff-tree", "--root", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", commit])))];
}
