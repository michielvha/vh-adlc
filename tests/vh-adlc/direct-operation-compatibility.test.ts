import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const baseline = "b313327b134bc5ecfa7167856d4b567f8701ba06";
test.each(["investigate", "spec", "tasks", "implement", "review", "ship", "resume"])("direct %s keeps the original operation body", (name) => {
  const path = `plugins/vh-adlc/skills/vh-adlc-${name}/SKILL.md`;
  const old = Bun.spawnSync(["git", "show", `${baseline}:${path}`], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect(old.exitCode).toBe(0);
  const body = (text: string) => text.slice(text.indexOf("The plugin directory is two levels"));
  const current = readFileSync(join(root, path), "utf8");
  expect(current).toContain("A directly named operation retains");
  expect(body(current)).toBe(body(old.stdout.toString()));
});
