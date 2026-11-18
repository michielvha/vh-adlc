import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readArtifact, writeArtifact } from "../src/storage";
import { stable } from "../src/bundle";
import { site } from "./helpers/site";
import { sha, fixture, captured } from "./helpers/bundle";
import { parseSnapshot } from "../src/schema";

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
test("manifest-valid partial snapshots cannot hide their missing evidence reasons", async () => {
  const f = await site([{ path: "/" }, { path: "/later", outcome: "not_collected" }]);
  const root = await mkdtemp(join(tmpdir(), "seo-cli-inconsistent-"));
  await writeArtifact(join(root, "bad"), { "snapshot.json": stable({ ...f.snapshot, partial_reasons: [] }) });
  const input = join(root, "bad/snapshot.json");
  for (const [name, args] of [["inspect", ["inspect", "--snapshot", input]], ["compare", ["compare", "--baseline", input, "--current", input]]] as const) {
    const r = await run([...args, "--output", join(root, name), "--json"]);
    expect(r.code).toBe(2);
    expect(resultSchema.parse(JSON.parse(r.stdout) as unknown).analysis_status).toBe("invalid");
    expect(await Bun.file(join(root, name, "complete.json")).exists()).toBe(false);
  }
});
test("shared body files do not turn plain-text responses into HTML evidence", async () => {
  const f = await fixture('<title>Shared</title><main><a href="/bad">Bad</a></main>');
  f.data.pages = [captured(), { ...captured("/plain"), content_type: "text/plain" }, { ...captured("/bad"), status: 404, content_type: "text/plain" }]; await f.save();
  const root = await mkdtemp(join(tmpdir(), "seo-cli-media-"));
  expect((await run(["snapshot", "--input", f.input, "--output", join(root, "snapshot"), "--json"])).code).toBe(0);
  const input = join(root, "snapshot/snapshot.json"); const s = parseSnapshot(await readArtifact(input));
  expect(s.observations[1]?.facts).toBeNull(); expect(s.observations[2]?.facts).toBeNull();
  const policy = join(root, "policy.yaml"); await writeFile(policy, "schema_version: 1\nfail_rules: [duplicate_title, duplicate_main]\n");
  expect((await run(["inspect", "--snapshot", input, "--policy", policy, "--output", join(root, "report"), "--json"])).code).toBe(0);
  const report = await Bun.file(join(root, "report/findings.json")).json();
  expect(report.findings.some((f: { url: string }) => f.url.endsWith("/plain"))).toBe(false);
  const plain = s.observations[1]; if (!plain) throw new Error("Expected plain response"); plain.facts = s.observations[0]?.facts ?? null;
  await writeArtifact(join(root, "forged"), { "snapshot.json": stable(s) });
  const bad = join(root, "forged/snapshot.json");
  for (const [name, args] of [["inspect", ["inspect", "--snapshot", bad]], ["compare", ["compare", "--baseline", input, "--current", bad]]] as const) {
    const result = await run([...args, "--output", join(root, "invalid-" + name), "--json"]);
    expect(result.code).toBe(2); expect(resultSchema.parse(JSON.parse(result.stdout) as unknown).analysis_status).toBe("invalid");
  }
});
test("real comparisons do not enforce invented missing-href or other-context canonicals", async () => {
  const old = '<head><link rel="canonical" href="/old"></head><main>Body</main>';
  const before = await site([{ path: "/", html: old }]);
  const root = await mkdtemp(join(tmpdir(), "seo-cli-canonical-context-"));
  await run(["snapshot", "--input", before.input, "--output", join(root, "baseline"), "--json"]);
  const policy = join(root, "policy.yaml"); await writeFile(policy, "schema_version: 1\nfail_rules: [canonical_changed, canonical_removed]\n");
  const inputs: { html: string; headers: Record<string, string[]> }[] = [
    { html: '<head><link rel="canonical"></head><main>Body</main>', headers: {} },
    { html: old, headers: { Link: ['</new>; rel="canonical"; anchor="/unrelated"'] } },
    { html: old, headers: { Link: ['</new>; rel="canonical"; anchor="#part"'] } },
  ];
  for (const [i, page] of inputs.entries()) {
    const current = await site([{ path: "/", ...page }]); const out = join(root, "snapshot" + i);
    expect((await run(["snapshot", "--input", current.input, "--output", out, "--json"])).code).toBe(0);
    const result = await run(["compare", "--baseline", join(root, "baseline/snapshot.json"), "--current", join(out, "snapshot.json"), "--policy", policy, "--output", join(root, "compare" + i), "--json"]);
    expect(result.code).toBe(0);
    const report = await Bun.file(join(root, "compare" + i, "findings.json")).json();
    expect(report.findings.some((f: { rule: string }) => ["canonical_changed", "canonical_removed"].includes(f.rule))).toBe(false);
  }
});
