import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gitEnvironment } from "../../../plugins/vh-adlc/scripts/git-read";

export const REF = "refs/heads/vh-adlc/work-ownership";
export const POLICY = ".vh-adlc/work-ownership.yaml";
export const SPEC = "docs/specs/example.md";
export const URL = "git@fixture.test:team/project.git";
export const ID = "fixture.test/team/project";

export type Env = Record<string, string | undefined>;

export function git(cwd: string, env: Env, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { env, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) throw Error(`fixture git ${args[0]}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vh-ownership-"));
  const server = join(root, "server");
  const ssh = join(root, "fixture-ssh");
  mkdirSync(join(server, "team"), { recursive: true });
  // Only these disposable repositories can be reached through the test transport.
  writeFileSync(ssh, `#!/bin/sh
test "$#" = 2 && test "$1" = git@fixture.test || exit 81
case "$2" in
  "git-upload-pack 'team/project.git'") verb=git-upload-pack; remote=project ;;
  "git-receive-pack 'team/project.git'") verb=git-receive-pack; remote=project ;;
  "git-upload-pack 'team/mirror.git'") verb=git-upload-pack; remote=mirror ;;
  "git-receive-pack 'team/mirror.git'") verb=git-receive-pack; remote=mirror ;;
  *) exit 82 ;;
esac
exec "$verb" "$VH_FIXTURE_GIT/team/$remote.git"
`, { mode: 0o700 });
  const env = {
    ...gitEnvironment(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_SSH_VARIANT: "simple",
    GIT_SSH_COMMAND: ssh, VH_FIXTURE_GIT: server, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    CODEX_THREAD_ID: "fixture-original-session", CODEX_SESSION_ID: undefined, CLAUDECODE: undefined, CLAUDE_CODE_SESSION_ID: undefined,
  };
  const bare = join(server, "team/project.git");
  const seed = join(root, "seed");
  git(root, env, "init", "-q", "--bare", "-b", "main", bare);
  git(root, env, "init", "-q", "-b", "main", seed);
  mkdirSync(join(seed, "docs/specs"), { recursive: true });
  mkdirSync(join(seed, ".vh-adlc"));
  writeFileSync(join(seed, "AGENTS.md"), "Feature documents: docs/specs/\n");
  writeFileSync(join(seed, SPEC), "---\nstatus: planned\nissue: https://fixture.test/team/project/issues/42\n---\n# Example\n");
  git(seed, env, "add", "-A");
  git(seed, env, "commit", "-qm", "fixture: initial feature");
  git(seed, env, "remote", "add", "origin", URL);
  git(seed, env, "push", "-q", "origin", "main");
  return {
    root, bare, seed, env, mirror: join(server, "team/mirror.git"),
    clone(name: string) {
      const path = join(root, name);
      git(root, env, "clone", "-q", URL, path);
      return path;
    },
    git(cwd: string, ...args: string[]) { return git(cwd, env, ...args); },
    policy(genesis: string) {
      writeFileSync(join(seed, POLICY), `schema_version: 1\nrepository: ${ID}\ngenesis: ${genesis}\n`);
      git(seed, env, "add", "--", POLICY);
      git(seed, env, "commit", "-qm", "fixture: adopt reservations", "--", POLICY);
      git(seed, env, "push", "-q", "origin", "main");
    },
    cleanup() { rmSync(root, { recursive: true }); },
  };
}

export const CLI = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/ownership/cli.ts");
export type Reply = { status: string; reason?: string; writer?: { fingerprint: string; host: string; locator: string }; genesis?: string; item?: string; operation?: string };

export async function invoke(repo: string, env: Env, ...args: string[]): Promise<Reply> {
  const child = Bun.spawn([process.execPath, CLI, ...args, "--repo", repo], { env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, child.stdout.text(), child.stderr.text()]);
  if (![0, 3].includes(code) || !stdout.trim()) throw Error(`ownership command exited ${code}: ${stderr || stdout}`);
  return JSON.parse(stdout) as Reply;
}

export async function adopt(f: ReturnType<typeof fixture>) {
  const result = await invoke(f.seed, f.env, "initialize", "--approved", "true", "--operation", "initialize-fixture");
  if (result.status !== "initialized" || !result.genesis) throw Error(`setup did not initialize: ${JSON.stringify(result)}`);
  f.policy(result.genesis);
}

export function enter(repo: string, env: Env, ...item: string[]) {
  return invoke(repo, env, "enter", ...item);
}
