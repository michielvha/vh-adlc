import { expect, test } from "bun:test";
import { compileCoverage } from "../../../plugins/vh-adlc/scripts/docs-impact/matching";

const cases: Array<[string, string, boolean]> = [
  ["src/app.ts", "src/app.ts", true], ["src/app.ts", "src/App.ts", false],
  ["src/", "src", true], ["src/", "src/deep/app.ts", true], ["src/", "src-other/app.ts", false],
  ["src/*.ts", "src/app.ts", true], ["src/*.ts", "src/deep/app.ts", false],
  ["src/**/app.ts", "src/app.ts", true], ["src/**/app.ts", "src/a/b/app.ts", true],
  ["**/README.md", "README.md", true], ["**/README.md", "docs/README.md", true],
  ["src/p**x.ts", "src/p/a/x.ts", true], ["src/**", "src/a\nb.ts", true],
  ["src/?.ts", "src/🚀.ts", true], ["src/?.ts", "src/ab.ts", false],
  ["src/[a-c].ts", "src/b.ts", true], ["src/[^a-c].ts", "src/d.ts", true],
  ["src/[^a-c].ts", "src/b.ts", false], ["src/[!a].ts", "src/!.ts", true],
  [String.raw`src/\?.ts`, "src/?.ts", true], [String.raw`src/\[x\].ts`, "src/[x].ts", true],
  [String.raw`src/\a.ts`, "src/a.ts", true], [String.raw`src/\\a.ts`, "src/\\a.ts", true],
  [String.raw`src/[\-].ts`, "src/-.ts", true], [String.raw`src/[\]].ts`, "src/].ts", true],
  ["src/{a,b}.ts", "src/{a,b}.ts", true], ["src/{a,b}.ts", "src/a.ts", false],
  ["!src/a.ts", "!src/a.ts", true], ["./src/**", "src/a.ts", true],
];
test.each(cases)("%s against %s gives %s", (pattern, source, expected) => {
  expect(compileCoverage(pattern)(source)).toBe(expected);
});

test.each(["", "/src/a", "../a", "src/../a", "a//b", "src/[", "src/[]", "src/[^]", "src/[a-]", "src/[-a]", "src/\\"])("refuses malformed or escaping pattern %s", pattern => {
  expect(() => compileCoverage(pattern)).toThrow();
});

test("a repetitive wildcard pattern answers without exponential backtracking", () => {
  expect(compileCoverage("a**".repeat(80) + "z")("a".repeat(160) + "y")).toBe(false);
});

test('reversed ranges retain the existing Go empty-class semantics', () => {
  for (const source of ['src/a.ts', 'src/m.ts', 'src/z.ts']) {
    expect(compileCoverage('src/[z-a].ts')(source)).toBe(false);
    expect(compileCoverage('src/[^z-a].ts')(source)).toBe(true);
  }
});
