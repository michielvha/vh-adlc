import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { fixture, settings, issue, boardStep, itemsStep, repoStep, relationsStep } from "./fixtures";

function checkout(root: string): void {
  const init = Bun.spawnSync(["git", "init", "-q", root]);
  expect(init.exitCode).toBe(0);
  mkdirSync(join(root, ".vh-adlc"));
  writeFileSync(join(root, ".vh-adlc/projects.yaml"), `schema_version: 1\nproject: ${settings().project}\nrepositories:\n  - example/one\n  - other/two\nfields:\n  - name: Status\n    options: [todo, done]\n`);
}
test("a fresh CLI process reuses YAML configuration and produces reusable JSON without writes", () => {
  const f = fixture([boardStep(), itemsStep(), repoStep("example/one", [issue()]), relationsStep(), repoStep("other/two", [])]); checkout(f.dir);
  const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/projects/cli.ts");
  const env = { ...process.env, PROJECTS_FIXTURE: f.state, PATH: f.dir + delimiter + process.env.PATH };
  const run = (...args: string[]) => Bun.spawnSync([process.execPath, cli, ...args, "--repo", f.dir], { stdout: "pipe", stderr: "pipe", env });
  const inventory = run("inventory", "--json");
  expect(inventory.stderr.toString()).toBe(""); expect(inventory.exitCode).toBe(0);
  const result = JSON.parse(inventory.stdout.toString()); expect(result.complete).toBe(true);
  const file = join(f.dir, "batch.json");
  writeFileSync(file, JSON.stringify({ schema_version: 1, complete: result.complete, project: result.project, repositories: result.repositories, operations: result.proposed }));
  const planned = run("plan", "--batch", file); expect(planned.exitCode, planned.stderr.toString()).toBe(0);
  expect(JSON.parse(planned.stdout.toString()).digest).toMatch(/^[a-f0-9]{64}$/);
  expect(run("apply", "--batch", file).exitCode).toBe(1);
  expect(f.calls().every(call => call.query.startsWith("query "))).toBe(true);
});
