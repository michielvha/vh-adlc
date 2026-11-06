import { expect, test } from "bun:test";
import cases from "./feature-covers.json";
import { compileCoverage } from "../../../plugins/vh-adlc/scripts/docs-impact/matching";

for (const fixture of cases) {
  test(`feature coverage ${fixture.name}`, () => {
    if (!fixture.valid) {
      expect(() => compileCoverage(fixture.pattern, "feature")).toThrow();
      return;
    }
    expect(compileCoverage(fixture.pattern, "feature")(fixture.path)).toBe(fixture.matched);
  });
}

test("documentation default keeps its distinct double-star and directory behavior", () => {
  expect(compileCoverage("src/**")("src/deep/a.ts")).toBe(true);
  expect(compileCoverage("src/")("src")).toBe(true);
  expect(compileCoverage("src/\\a.ts")("src/a.ts")).toBe(true);
  expect(compileCoverage("src[/]app.ts")("src/app.ts")).toBe(false);
});
