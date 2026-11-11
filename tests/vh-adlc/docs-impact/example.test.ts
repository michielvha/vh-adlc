import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("the complete distributed example runs through the actual portable CLI", () => {
  const root = mkdtempSync(join(tmpdir(), "vh-docs-example-")), plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc");
  try {
    cpSync(join(plugin, "examples/docs-impact"), root, { recursive: true });
    for (const args of [["init", "-q"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture"]]) {
      const child = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" }); expect(child.exitCode).toBe(0);
    }
    for (const [path, outcome] of [["deploy/values.yaml", "candidates"], ["unrelated.txt", "none"]]) {
      const child = Bun.spawnSync(["bun", join(plugin, "scripts/docs-impact/cli.ts"), "check", "--repo", root, "--path", path], { stdout: "pipe", stderr: "pipe" });
      expect(child.exitCode).toBe(0); expect(JSON.parse(child.stdout.toString()).outcome).toBe(outcome);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
