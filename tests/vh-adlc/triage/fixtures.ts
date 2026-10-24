import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function git(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
    stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`fixture git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.toString().trim();
}

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vh-triage-"));
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.com");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  git(root, "remote", "add", "origin", "https://github.com/example/project.git");
  write("src/app.ts", "export const answer = 42;\n");
  git(root, "add", "src/app.ts");
  git(root, "commit", "-qm", "test: seed project");
  return { root, write, settings: (value: unknown) => write(".vh-adlc/triage.json", JSON.stringify(value)), dispose: () => rmSync(root, { recursive: true, force: true }) };
}
