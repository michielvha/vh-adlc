import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { settingsFixture } from "./settings-fixture";

export function put(repo: string, path: string, content: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

export function git(repo: string, ...args: string[]): string {
  const run = Bun.spawnSync(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  return run.stdout.toString().trim();
}

export function populateRepository(repo: string, bounded = false, scanner = "// Synthetic fixture scanner\n") {
  const settings = settingsFixture();
  const selected = bounded ? { ...settings, verification_commands: [], generation_commands: [], read_set: { source_roots: ["src"], reference_roots: ["references"] } } : settings;
  for (const [path, content] of Object.entries({
    "AGENTS.md": "Feature documents: plans/\n",
    ".vh-adlc/docs-drift.yaml": JSON.stringify(selected) + "\n",
    "docs/guide.md": "# Guide\n",
    "docs/suppressions.yaml": "suppressions: []\n",
    "docs/docs-procedure.md": "# Project procedure\n",
    "scripts/scan.js": scanner,
    "scripts/docs-drift-entry.ts": "// Synthetic fixture launcher\n",
    ".claude/commands/docs-drift.md": "Use the fixture entry.\n",
    ".github/workflows/docs-drift-worker.yml": "name: Fixture worker\n",
    ".github/workflows/docs-drift.yml": "name: Fixture schedule\n",
    "src/app.ts": "export const value = 1;\n",
    "outside.txt": "unchanged\n",
  })) put(repo, path, content);
  git(repo, "init", "-q", "-b", "main");
  const commit = commitAll(repo);
  return { repo, commit };
}

export function commitAll(repo: string): string {
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fixture update");
  return git(repo, "rev-parse", "HEAD");
}

