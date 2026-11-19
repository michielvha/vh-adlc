export function withoutGitOverrides(inherited = process.env) {
  return Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith("GIT_")));
}

export function fixtureGit(cwd: string, args: string[], inherited = process.env) {
  const result = Bun.spawnSync(["git", "-C", cwd, "-c", "user.name=Docs Fixture",
    "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
    "-c", "core.hooksPath=/dev/null", ...args], {
    env: withoutGitOverrides(inherited),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
