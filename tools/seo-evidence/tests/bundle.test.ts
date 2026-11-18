import { expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadBundle, validateBudget } from "../src/bundle";
import { captured, capturedAt, fixture, origin } from "./helpers/bundle";

test("loads verified native evidence without rewriting inputs", async () => {
  const f = await fixture(); const before = await Bun.file(f.input).text();
  const result = await loadBundle(f.input);
  expect(result.bundle.pages[0]?.requested_url).toBe(origin + "/");
  expect(result.bodies.get("page.html")).toContain("Hello");
  expect(await Bun.file(f.input).text()).toBe(before);
});
test("rejects tampering, missing files and non-UTF8 bodies", async () => {
  for (const body of ["tampered", Buffer.from([0xff])]) {
    const f = await fixture(); await writeFile(join(f.dir, "page.html"), body);
    await expect(loadBundle(f.input)).rejects.toThrow();
  }
  const f = await fixture(); f.data.files = []; await f.save();
  await expect(loadBundle(f.input)).rejects.toThrow(/manifest|listed/i);
});
test("strict YAML, versions and metadata are validated", async () => {
  for (const change of [
    { schema_version: 2 }, { mystery: true }, { origins: [origin + "/"] },
    { pages: [{ ...captured(), final_url: undefined }] },
    { pages: [captured(), captured()] },
    { pages: [{ ...captured(), headers: { Authorization: ["secret"] } }] },
    { pages: [{ ...captured(), content_type: "text/html", headers: { "Content-Type": ["application/json"] } }] },
    { pages: [{ ...captured(), final_url: "https://outside.test/" }] },
  ]) {
    const f = await fixture(); Object.assign(f.data, change); await f.save();
    await expect(loadBundle(f.input)).rejects.toThrow();
  }
  const f = await fixture(); await writeFile(f.input, (await Bun.file(f.input).text()) + "schema_version: 1\n");
  await expect(loadBundle(f.input)).rejects.toThrow(/unique|duplicate/i);
});
test("captured HTTP errors differ from failed and uncollected requests", async () => {
  const f = await fixture(); f.data.pages = [
    { ...captured(), status: 404 },
    { requested_url: origin + "/failed", outcome: "failed", mode: "initial", observed_at: capturedAt, reason: "timeout" },
    { requested_url: origin + "/later", outcome: "not_collected", mode: "initial", observed_at: capturedAt, reason: "limit" },
  ]; await f.save();
  const result = await loadBundle(f.input);
  expect(result.bundle.pages.map(p => p.outcome)).toEqual(["captured", "failed", "not_collected"]);
});
test("containment rejects traversal, absolute paths and symlink components", async () => {
  for (const name of ["../page.html", "/tmp/page.html", "nested/link.html"]) {
    const f = await fixture();
    if (name === "nested/link.html") { await mkdir(join(f.dir, "nested")); await symlink(join(f.dir, "page.html"), join(f.dir, name)); }
    f.data.pages = [{ ...captured(), body_file: name }]; f.data.files = [{ path: name, sha256: "0".repeat(64) }]; await f.save();
    await expect(loadBundle(f.input)).rejects.toThrow();
  }
});
test("budget boundaries are inclusive and excesses fail without truncation", () => {
  expect(() => validateBudget([5 * 1024 ** 2], 10_000)).not.toThrow();
  expect(() => validateBudget(Array(50).fill(5 * 1024 ** 2), 1)).not.toThrow();
  for (const [sizes, count] of [[[5 * 1024 ** 2 + 1], 1], [Array(51).fill(5 * 1024 ** 2), 1], [[], 10_001]] as const) {
    expect(() => validateBudget([...sizes], count)).toThrow(/limit/i);
  }
});
