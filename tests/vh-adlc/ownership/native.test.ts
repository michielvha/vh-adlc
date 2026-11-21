import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOGS, payloadDigest } from "./native-trial";

test("both shipped catalogs resolve the unchanged ownership candidate and entry scripts", () => {
  const root = resolve(import.meta.dir, "../../..");
  const codex = JSON.parse(readFileSync(resolve(root, CATALOGS[0]!), "utf8")) as { plugins: { name: string; source: { path: string } }[] };
  const claude = JSON.parse(readFileSync(resolve(root, CATALOGS[1]!), "utf8")) as { plugins: { name: string; source: string }[] };
  const a = codex.plugins.find(plugin => plugin.name === "vh-adlc")!.source.path;
  const b = claude.plugins.find(plugin => plugin.name === "vh-adlc")!.source;
  expect(resolve(root, a)).toBe(resolve(root, b));
  expect(payloadDigest(resolve(root, a))).toMatch(/^[a-f0-9]{64}$/);
  expect(readFileSync(resolve(root, a, "scripts/ownership/cli.ts"), "utf8")).toContain("return enter(request)");
});
