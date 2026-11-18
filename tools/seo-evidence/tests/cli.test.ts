import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readArtifact } from "../src/storage";
import { site } from "./helpers/site";
import { sha } from "./helpers/bundle";

import { example, resultSchema, run } from "./helpers/cli";
test("real snapshot/inspect/compare flow verifies outputs without changing input", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-cli-test-")); const before = sha(await Bun.file(example).bytes());
  const s = await run(["snapshot", "--input", example, "--output", join(root, "snapshot"), "--json"]);
  expect(s.code).toBe(0); expect(resultSchema.parse(JSON.parse(s.stdout) as unknown)).toMatchObject({ analysis_status: "complete", exit_code: 0 });
  const input = join(root, "snapshot/snapshot.json");
  for (const [name, args] of [["inspect", ["inspect", "--snapshot", input]], ["compare", ["compare", "--baseline", input, "--current", input]]] as const) {
    const r = await run([...args, "--output", join(root, name), "--json"]);
    expect(r.code).toBe(0); expect(r.stdout).not.toMatch(/\x1b/);
    const stdout = resultSchema.parse(JSON.parse(r.stdout) as unknown); const saved = resultSchema.parse(await readArtifact(join(root, name, "findings.json")));
    expect(stdout).toEqual(saved);
  }
  expect(sha(await Bun.file(example).bytes())).toBe(before);
  expect((await run(["snapshot", "--input", example, "--output", join(root, "snapshot"), "--json"])).code).toBe(2);
});
test("unknown arguments and invalid evidence fail visibly without a successful artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-cli-errors-"));
  for (const args of [["missing"], ["inspect", "--unknown", "value"], ["snapshot", "--input", "missing.yaml", "--output", join(root, "invalid")], ["snapshot", "--input", example, "--input", example, "--output", join(root, "duplicate")]]) {
    const r = await run([...args, "--json"]); expect(r.code).toBe(2); expect(resultSchema.parse(JSON.parse(r.stdout) as unknown).exit_code).toBe(2); expect(r.stderr.length).toBeGreaterThan(0);
  }
  expect((await run(["--help"])).code).toBe(0);
});
test("CLI policies preserve partial precedence, mode and machine status", async () => {
  const f = await site([{ path: "/", html: '<main><a href="/bad">bad</a></main>' }, { path: "/bad", status: 404 }, { path: "/later", outcome: "not_collected" }]);
  const root = await mkdtemp(join(tmpdir(), "seo-cli-partial-"));
  expect((await run(["snapshot", "--input", f.input, "--output", join(root, "snapshot"), "--json"])).code).toBe(2);
  const policy = join(root, "policy.yaml"); await writeFile(policy, "schema_version: 1\nfail_rules: [broken_link]\n");
  for (const noColor of ["", "0", "1"]) {
    const r = await run(["inspect", "--snapshot", join(root, "snapshot/snapshot.json"), "--policy", policy, "--output", join(root, "report" + noColor), "--json"], { NO_COLOR: noColor });
    expect(r.code).toBe(2); expect(resultSchema.parse(JSON.parse(r.stdout) as unknown)).toMatchObject({ analysis_status: "partial", policy_status: "failed" }); expect(r.stdout).not.toMatch(/\x1b/);
  }
});
