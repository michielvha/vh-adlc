// Checks michielvha/vh-adlc#141: the spec skill removes an extra the author added on its own,
// without an Open Question, when the removal needs no follow-up, and records it in the Review Log.
// Prose wraps at any word, so phrases are matched with whitespace collapsed.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\s+/g, " ");

describe("author-added extras", () => {
  const spec = read("plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md");

  test("review mode removes an author-added extra without an Open Question", () => {
    expect(spec).toContain("The exception is an extra the author added on its own initiative");
    expect(spec).toContain("a mechanism, assertion or proof step that no criterion, owner decision or public contract requires");
    expect(spec).toContain("When removing it needs no follow-up, remove it without an Open Question");
  });

  test("the removal is recorded in the pass's Review Log row, with an example", () => {
    expect(spec).toContain("record the removal in the Outcome cell of that pass's Review Log row");
    expect(spec).toContain("`removed author extra: replacement-pod assertion (R-4 F-02)`");
  });

  test("a removal touching a criterion, an owner decision or a public contract keeps the question", () => {
    expect(spec).toContain("A removal that touches a criterion, an owner decision or a public contract keeps the Open Question.");
    expect(spec).toContain("where they behave differently, the choice is an Open Question recommending removal");
  });

  test("the user guides describe the exception", () => {
    expect(read("docs/user-guides/workflows.md")).toContain("is removed without asking you and noted in the Review Log");
    expect(read("docs/get-started/first-feature.md")).toContain("It removes an extra it added on its own");
  });
});
