import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { aws, incomplete, oci } from "./fixtures";
const root = resolve(import.meta.dir, "../../..");
test("both candidate catalogs point to the package containing the shared diagram skill", () => {
  for (const catalog of [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]) {
    const packageEntry = JSON.parse(readFileSync(join(root, catalog), "utf8")).plugins.find((entry: { name: string }) => entry.name === "vh-adlc");
    const source = typeof packageEntry.source === "string" ? packageEntry.source : packageEntry.source.path;
    expect(readFileSync(join(root, source, "skills/vh-adlc-diagram/SKILL.md"), "utf8")).toMatch(/^name: vh-adlc-diagram$/m);
  }
});
test("diagram fixtures distinguish scope, proposed flows and incomplete input", () => {
  expect(aws.shapes.some(shape => /log bucket/i.test(shape.label))).toBe(false);
  expect(oci.links.every(link => link.proposed)).toBe(true);
  expect(incomplete.links).toEqual([]);
});
