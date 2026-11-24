// The labels helper's follow-up mode (docs/specs/proportional-review.md, AC-16): ship's follow-up review
// files a merged feature's deferred items with one type label, no state label, no change to any
// feature's ownership or issue aliases, and a body that ends with the entry's `Deferred:` line.
import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { digest } from "../../../plugins/vh-adlc/scripts/labels/plan";
import { checkout, tracker, vocabularyPath } from "./fixtures";

const CLI = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/labels/cli.ts");
const labels = () => (JSON.parse(readFileSync(vocabularyPath, "utf8")).labels as { name: string; color: string; description: string }[])
  .map(({ name, color, description }) => ({ name, color, description }));
const DEFERRED = "Deferred: docs/specs/example.md D-03";

function setup(body = `The merged feature works without it; users would benefit later.\n\n${DEFERRED}\n`) {
  const root = checkout(), f = tracker(labels());
  const env = { ...f.env, PATH: `${resolve(f.executable, "..")}:${process.env.PATH}` };
  const bodyFile = f.state + ".body.md", out = f.state + ".preview.json";
  writeFileSync(bodyFile, body);
  const run = (...args: string[]) => Bun.spawnSync([process.execPath, CLI, "file", "--repo", root, ...args], { env, stdout: "pipe", stderr: "pipe" });
  const preview = (type = "enhancement", ...extra: string[]) =>
    run("--operation", "follow-up", "--type", type, "--title", "Retry sampler", "--body-file", bodyFile, "--output", out, ...extra);
  return { f, out, run, preview };
}

describe("follow-up preview", () => {
  test("names one type label and no state label", () => {
    const { f, out, preview } = setup(), result = preview();
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(JSON.parse(text).labels).toEqual(["enhancement"]);
    expect(JSON.parse(text).operation).toBe("follow-up");
    expect(f.writes()).toEqual([]);
  });

  test("files a gap with the bug type", () => {
    const { out, preview } = setup(), result = preview("bug");
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8")).labels).toEqual(["bug"]);
  });

  test("refuses a type other than the feature or bug type", () => {
    const { f, preview } = setup(), result = preview("documentation");
    expect(result.exitCode).not.toBe(0);
    expect(f.writes()).toEqual([]);
  });

  test("refuses a state label", () => {
    const { f, preview } = setup(), result = preview("enhancement", "--verdict", "act now");
    expect(result.exitCode).not.toBe(0);
    expect(f.writes()).toEqual([]);
  });

  test("refuses a body that does not end with the Deferred line", () => {
    const { f, preview } = setup(`${DEFERRED}\n\nMore text after it.\n`), result = preview();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Deferred: <document path> D-<nn>");
    expect(f.writes()).toEqual([]);
  });
});

describe("follow-up creation", () => {
  test("creates one issue whose body ends with the Deferred line, and touches no ownership", () => {
    const { f, out, run, preview } = setup();
    expect(preview().exitCode).toBe(0);
    const text = readFileSync(out, "utf8");
    const result = run("--preview", out, "--approved-digest", digest(text));
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const issues = f.issues();
    expect(issues.map((issue) => issue.labels)).toEqual([["enhancement"]]);
    expect(issues[0].body.trimEnd().split("\n").at(-1)).toBe(DEFERRED);
    expect(f.writes().length).toBe(1);
    expect(JSON.parse(result.stdout.toString()).ownership).toBeUndefined();
  });

  test("refuses ownership options, which belong to spec filing", () => {
    const { f, out, run, preview } = setup();
    expect(preview().exitCode).toBe(0);
    const text = readFileSync(out, "utf8");
    const result = run("--preview", out, "--approved-digest", digest(text), "--ownership-spec", "docs/specs/example.md");
    expect(result.exitCode).not.toBe(0);
    expect(f.issues()).toEqual([]);
  });
});

test("the preview text keeps the Deferred line exactly", () => {
  const { out, preview } = setup();
  expect(preview().exitCode).toBe(0);
  expect(JSON.parse(readFileSync(out, "utf8")).body.trimEnd().endsWith(DEFERRED)).toBe(true);
});
