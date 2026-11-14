// The standard label set lives in one data file; the reference page renders the same table.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PKG = resolve(import.meta.dir, "../../../plugins/vh-adlc");
const VOCABULARY = resolve(PKG, "scripts/labels/vocabulary.json");
const REFERENCE = resolve(PKG, "references/issues.md");

type Label = { name: string; kind: "type" | "state"; color: string; description: string };

function vocabulary(): Label[] {
  const input = JSON.parse(readFileSync(VOCABULARY, "utf8")) as { schema_version: number; labels: Label[] };
  expect(input.schema_version).toBe(1);
  return input.labels;
}

/** Rows of the reference table whose first cell is a backticked label name. */
function referenceRows(): Label[] {
  const text = readFileSync(REFERENCE, "utf8");
  const start = text.indexOf("| Name | Kind | Color | Description |");
  expect(start).toBeGreaterThanOrEqual(0);
  const rows: Label[] = [];
  for (const line of text.slice(start).split("\n").slice(2)) {
    const match = line.match(/^\| `([^`]+)` \| (type|state) \| `([0-9a-f]{6})` \| (.+) \|$/);
    if (!match) break;
    rows.push({ name: match[1], kind: match[2] as Label["kind"], color: match[3], description: match[4] });
  }
  return rows;
}

describe("standard label set", () => {
  test("the vocabulary file and the reference page exist", () => {
    expect(existsSync(VOCABULARY)).toBe(true);
    expect(existsSync(REFERENCE)).toBe(true);
  });

  test("the vocabulary holds the nine accepted labels with valid metadata", () => {
    const labels = vocabulary();
    expect(labels.map((label) => label.name)).toEqual([
      "bug", "enhancement", "documentation", "refactor", "security",
      "ready", "blocked", "partial", "needs-decision",
    ]);
    expect(labels.filter((label) => label.kind === "state").map((label) => label.name)).toEqual(["ready", "blocked", "partial", "needs-decision"]);
    for (const label of labels) {
      expect(label.color).toMatch(/^[0-9a-f]{6}$/);
      expect(label.description.trim().length).toBeGreaterThan(0);
      expect(label.description.length).toBeLessThanOrEqual(100);
      expect(label.description).not.toMatch(/[–—]/);
    }
  });

  test("the reference table matches the vocabulary exactly", () => {
    expect(referenceRows()).toEqual(vocabulary());
  });

  test("the reference uses the glossary terms and says who applies each kind", () => {
    const text = readFileSync(REFERENCE, "utf8");
    for (const term of ["standard label set", "type label", "state label", "label plan"]) expect(text).toContain(term);
    for (const verdict of ["act now", "track", "reject"]) expect(text).toContain(verdict);
    expect(text).toContain("references/triage.md");
    expect(text).toContain("create-request");
    expect(text).toContain("label_map");
  });
});

describe("triage reference", () => {
  test("names the vocabulary's state labels as the labels triage verdicts use", () => {
    const text = readFileSync(resolve(PKG, "references/triage.md"), "utf8");
    expect(text).toContain("references/issues.md");
    for (const label of vocabulary().filter((item) => item.kind === "state")) expect(text).toContain(`\`${label.name}\``);
    expect(text).toContain("label_map");
  });
});

describe("user guide and authority", () => {
  test("the workflows guide describes the standard label set and the labels helper", () => {
    const text = readFileSync(resolve(import.meta.dir, "../../../docs/user-guides/workflows.md"), "utf8");
    for (const phrase of ["standard label set", "scripts/labels/cli.ts", "label plan", "references/issues.md"]) expect(text).toContain(phrase);
    for (const label of vocabulary()) expect(text).toContain(`\`${label.name}\``);
  });

  test("the authority reference has a row for applying a label plan", () => {
    const text = readFileSync(resolve(PKG, "references/authority.md"), "utf8");
    const row = text.split("\n").find((line) => line.startsWith("| Apply a label plan"));
    expect(row).toBeDefined();
    expect(row).toContain("exact plan digest");
  });
});
