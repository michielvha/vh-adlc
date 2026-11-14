// The actual `cli.ts file` command: a preview files nothing, and creation happens only for the exact
// approved preview when nothing it observed has changed.
import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest } from "../../../plugins/vh-adlc/scripts/labels/plan";
import { checkout, tracker, vocabularyPath } from "./fixtures";

const CLI = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/labels/cli.ts");
const labels = () => (JSON.parse(readFileSync(vocabularyPath, "utf8")).labels as { name: string; color: string; description: string }[])
  .map(({ name, color, description }) => ({ name, color, description }));

function setup() {
  const root = checkout(), f = tracker(labels());
  const env = { ...f.env, PATH: `${resolve(f.executable, "..")}:${process.env.PATH}` };
  const body = join(f.state + ".body.md"), out = join(f.state + ".preview.json");
  writeFileSync(body, "Summary.\n\nFindings: docs/internal/analysis/heartbeat.md\n");
  const run = (...args: string[]) => Bun.spawnSync([process.execPath, CLI, "file", "--repo", root, ...args], { env, stdout: "pipe", stderr: "pipe" });
  const preview = () => {
    const result = run("--operation", "investigate", "--type", "bug", "--verdict", "act now", "--title", "Heartbeat times out", "--body-file", body, "--output", out);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return { text: readFileSync(out, "utf8"), printed: JSON.parse(result.stdout.toString()) };
  };
  const state = (change: (value: Record<string, unknown>) => void) => { const value = JSON.parse(readFileSync(f.state, "utf8")); change(value); writeFileSync(f.state, JSON.stringify(value)); };
  return { root, f, out, run, preview, state };
}

describe("file preview", () => {
  test("shows the labels and digest and writes nothing to GitHub", () => {
    const { f, preview } = setup(), { text, printed } = preview();
    expect(JSON.parse(text).labels).toEqual(["bug", "ready"]);
    expect(printed.labels).toEqual(["bug", "ready"]);
    expect(printed.digest).toBe(digest(text));
    expect(f.writes()).toEqual([]);
    expect(f.issues()).toEqual([]);
  });
});

describe("approved creation", () => {
  test("creates exactly one issue with the previewed labels", () => {
    const { f, out, run, preview } = setup(), { text } = preview();
    const result = run("--preview", out, "--approved-digest", digest(text));
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(f.issues().map((issue) => issue.labels)).toEqual([["bug", "ready"]]);
    expect(f.writes().length).toBe(1);
  });
});

describe("creation refuses with no issue created", () => {
  const refuses = (s: ReturnType<typeof setup>, sha: string) => {
    const result = s.run("--preview", s.out, "--approved-digest", sha);
    expect(result.exitCode).not.toBe(0);
    expect(s.f.issues()).toEqual([]);
    expect(s.f.writes()).toEqual([]);
  };

  test("an edited preview", () => {
    const s = setup(), { text } = s.preview();
    writeFileSync(s.out, text.replace("Heartbeat times out", "Something else"));
    refuses(s, digest(text));
  });

  test("a wrong digest", () => {
    const s = setup(); s.preview();
    refuses(s, "0".repeat(64));
  });

  test("another authenticated account", () => {
    const s = setup(), { text } = s.preview();
    s.state((value) => { value.actor = "someone-else"; });
    refuses(s, digest(text));
  });

  test("another repository", () => {
    const s = setup(), { text } = s.preview();
    Bun.spawnSync(["git", "-C", s.root, "remote", "set-url", "origin", "https://github.com/example/other.git"]);
    s.state((value) => { value.repository = "example/other"; });
    refuses(s, digest(text));
  });

  test("a label removed after the preview", () => {
    const s = setup(), { text } = s.preview();
    s.f.edit((items) => { items.splice(items.findIndex((item) => item.name === "ready"), 1); });
    refuses(s, digest(text));
  });
});
