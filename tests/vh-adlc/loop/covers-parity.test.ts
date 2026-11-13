// The docs-impact matcher and internal/doc agree on covers patterns with **: both read this table.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileCoverage } from "../../../plugins/vh-adlc/scripts/docs-impact/matching";

const table = JSON.parse(readFileSync(join(import.meta.dir, "covers-cases.json"), "utf8")) as { cases: { pattern: string; path: string; match: boolean }[] };

test("the docs-impact matcher gives the shared answer for every case", () => {
  expect(table.cases.length).toBeGreaterThan(10);
  for (const c of table.cases) expect([c.pattern, c.path, compileCoverage(c.pattern)(c.path)]).toEqual([c.pattern, c.path, c.match]);
});
