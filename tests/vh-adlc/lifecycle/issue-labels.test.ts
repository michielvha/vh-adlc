// Filing scenarios for investigate and spec (references/issues.md): the owner sees the labels in the
// preview, the created issue carries exactly those labels, and a missing label files nothing.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileIssue, filingPreview } from "../../../plugins/vh-adlc/scripts/labels/issue";
import { checkout, tracker, vocabularyPath } from "../labels/fixtures";

const all = () => (JSON.parse(readFileSync(vocabularyPath, "utf8")).labels as { name: string; color: string; description: string }[])
  .map(({ name, color, description }) => ({ name, color, description }));
const issue = { title: "Launcher heartbeat times out", body: "Summary.\n\nFindings: docs/internal/analysis/heartbeat.md" };

function files(request: Parameters<typeof filingPreview>[2], expected: string[], options: { settings?: string; labels?: ReturnType<typeof all> } = {}) {
  const root = checkout(options.settings), f = tracker(options.labels ?? all());
  const preview = filingPreview(root, f.gh(), request);
  expect(preview.preview.labels).toEqual(expected);
  expect(preview.preview.missing).toEqual([]);
  expect(JSON.parse(preview.text).labels).toEqual(expected);
  const created = fileIssue(root, f.gh(), preview.text, preview.digest);
  expect(created.url).toBe("https://github.com/example/project/issues/1");
  expect(f.issues()).toEqual([{ number: 1, title: issue.title, body: issue.body, labels: expected }]);
}

describe("investigate files an issue on request", () => {
  test("act now gives the type label and ready", () => files({ operation: "investigate", type: "bug", verdict: "act now", ...issue }, ["bug", "ready"]));
  test("track with a named missing prerequisite gives blocked", () => files({ operation: "investigate", type: "enhancement", verdict: "track", waiting_on: "prerequisite", ...issue }, ["enhancement", "blocked"]));
  test("track waiting on a decision gives needs-decision", () => files({ operation: "investigate", type: "enhancement", verdict: "track", waiting_on: "decision", ...issue }, ["enhancement", "needs-decision"]));
  test("a requested reject gets the type label only", () => files({ operation: "investigate", type: "refactor", verdict: "reject", ...issue }, ["refactor"]));
});

describe("investigate with a mapped state label", () => {
  test("it files under the repository's name when only the mapped label exists", () => {
    const labels = all().map((label) => label.name === "ready" ? { ...label, name: "ready-for-work" } : label);
    files({ operation: "investigate", type: "bug", verdict: "act now", ...issue }, ["bug", "ready-for-work"], { settings: "schema_version: 1\nlabel_map:\n  ready: ready-for-work\n", labels });
  });
});

describe("spec files a tracking issue", () => {
  test("it gets one type label and no state label", () => files({ operation: "spec", type: "enhancement", ...issue }, ["enhancement"]));
  test("it uses the mapped name when only the mapped type label exists", () => {
    const labels = all().map((label) => label.name === "bug" ? { ...label, name: "defect" } : label);
    files({ operation: "spec", type: "bug", ...issue }, ["defect"], { settings: "schema_version: 1\nlabel_map:\n  bug: defect\n", labels });
  });
  test("a state verdict is refused for spec", () => {
    const root = checkout(), f = tracker(all());
    expect(() => filingPreview(root, f.gh(), { operation: "spec", type: "bug", verdict: "act now", ...issue })).toThrow();
  });
});

describe("a missing label files nothing", () => {
  test("the preview names the missing label and the helper's plan, and creation refuses", () => {
    const root = checkout(), f = tracker(all().filter((label) => label.name !== "ready"));
    const preview = filingPreview(root, f.gh(), { operation: "investigate", type: "bug", verdict: "act now", ...issue });
    expect(preview.preview.missing).toEqual(["ready"]);
    expect(preview.preview.next).toContain("scripts/labels/cli.ts plan");
    expect(() => fileIssue(root, f.gh(), preview.text, preview.digest)).toThrow();
    expect(f.issues()).toEqual([]);
    expect(f.writes()).toEqual([]);
  });

  test("a type outside the standard set is refused", () => {
    const root = checkout(), f = tracker(all());
    expect(() => filingPreview(root, f.gh(), { operation: "spec", type: "dependencies", ...issue })).toThrow();
  });
});
