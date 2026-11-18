import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

test("complete README example runs from the repository root", async () => {
  const directory = resolve(import.meta.dir, ".."); const repo = resolve(directory, "../..");
  const readme = await readFile(resolve(directory, "README.md"), "utf8");
  const block = /<!-- verified-example -->\s*```bash\n([\s\S]*?)```/.exec(readme)?.[1];
  if (!block) throw new Error("README must contain the complete verified example");
  const p = Bun.spawn(["bash", "-eu", "-c", block], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  expect(code).toBe(0); expect(stdout.match(/"analysis_status": "complete"/g)).toHaveLength(3); expect(stderr).not.toContain("Failed");
}, 30_000);
test("dedicated CI is path-filtered, pinned and calls actual toolkit checks", async () => {
  const file = resolve(import.meta.dir, "../../../.github/workflows/seo-evidence.yml");
  const source = await readFile(file, "utf8"); const parsed = parseDocument(source);
  expect(parsed.errors).toHaveLength(0);
  expect(source).toContain("tools/seo-evidence/**"); expect(source).toContain(".github/workflows/seo-evidence.yml");
  for (const line of source.split("\n").filter(l => l.includes("uses:"))) expect(line).toMatch(/@[a-f0-9]{40}\b/);
  expect(source).toContain("persist-credentials: false"); expect(source).toContain("bun install --frozen-lockfile"); expect(source).toContain("bun run typecheck"); expect(source).toContain("bun test");
  expect(source).not.toMatch(/upload-artifact|workflow_call|secrets:|curl|npm install -g/);
});
