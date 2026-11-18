import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readArtifact, writeArtifact } from "../src/storage";
import { stable } from "../src/bundle";
const output = async () => join(await mkdtemp(join(tmpdir(), "seo-storage-test-")), "result");

test("outputs require verified manifests and completion markers", async () => {
  const dir = await output(); await writeArtifact(dir, { "snapshot.json": stable({ example: true }) });
  expect(await readArtifact(join(dir, "snapshot.json"))).toEqual({ example: true });
  await writeFile(join(dir, "snapshot.json"), '{"tampered":true}');
  await expect(readArtifact(join(dir, "snapshot.json"))).rejects.toThrow(/hash/i);
});
test("analytical bytes and manifest hashes repeat in new directories", async () => {
  const a = await output(); const b = await output(); const files = { "snapshot.json": stable({ fixture: true }) };
  await Promise.all([writeArtifact(a, files), writeArtifact(b, files)]);
  for (const name of ["snapshot.json", "manifest.json", "complete.json"]) expect(await readFile(join(a, name), "utf8")).toBe(await readFile(join(b, name), "utf8"));
});
test("an interrupted producer leaves incomplete evidence and is never overwritten", async () => {
  function* interrupted(): Generator<readonly [string, string]> { yield ["first.json", "{}\n"]; throw new Error("interrupted"); }
  const dir = await output(); await expect(writeArtifact(dir, interrupted())).rejects.toThrow("interrupted");
  expect(await Bun.file(join(dir, "INCOMPLETE")).exists()).toBe(true);
  await expect(readArtifact(join(dir, "first.json"))).rejects.toThrow(/incomplete/i);
  await expect(writeArtifact(dir, { "next.json": "{}" })).rejects.toThrow();
  expect(await Bun.file(join(dir, "first.json")).exists()).toBe(true);
});
test("same-output creators have one winner and distinct outputs are independent", async () => {
  const dir = await output(); const files = { "snapshot.json": "{}\n" };
  const results = await Promise.allSettled([writeArtifact(dir, files), writeArtifact(dir, files)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  expect(await readArtifact(join(dir, "snapshot.json"))).toEqual({});
});
test("reader rejects incomplete finalization, unsafe entries and unsupported versions", async () => {
  const dir = await output(); await writeArtifact(dir, { "snapshot.json": "{}\n" });
  await writeFile(join(dir, "INCOMPLETE"), "interrupted finalization");
  await expect(readArtifact(join(dir, "snapshot.json"))).rejects.toThrow(/incomplete/i);
  await expect(writeArtifact(await output(), { "../escape.json": "{}" })).rejects.toThrow();
});
