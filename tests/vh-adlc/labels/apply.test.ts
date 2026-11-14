// Apply makes exactly the approved writes, or refuses before any write when anything it was bound to changed.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { apply } from "../../../plugins/vh-adlc/scripts/labels/apply";
import { buildPlan, digest } from "../../../plugins/vh-adlc/scripts/labels/plan";
import { checkout, tracker, vocabularyPath, write } from "./fixtures";

const vocabulary = JSON.parse(readFileSync(vocabularyPath, "utf8")).labels as { name: string; color: string; description: string }[];
const start = () => [
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  { name: "enhancement", color: "ffffff", description: "New feature or request" },
  { name: "dependencies", color: "0366d6", description: "Pull requests that update a dependency file" },
];

function git(root: string, ...args: string[]) { Bun.spawnSync(["git", "-C", root, ...args]); }

describe("approved apply", () => {
  test("leaves every standard label in place, other labels unchanged and nothing deleted or renamed", () => {
    const root = checkout(), f = tracker(start());
    const { text, digest: sha } = buildPlan(root, f.gh());
    const receipt = apply(root, f.gh(), text, sha);
    expect(receipt.complete).toBe(true);
    const after = f.labels();
    for (const label of vocabulary) expect(after).toContainEqual({ name: label.name, color: label.color, description: label.description });
    expect(after).toContainEqual(start()[2]);
    expect(after.length).toBe(vocabulary.length + 1);
    const writes = f.writes();
    expect(writes.length).toBe(8);
    expect(writes.every((call) => ["POST", "PATCH"].includes(call.method))).toBe(true);
    expect(writes.every((call) => (call.input as Record<string, unknown>).name === undefined || call.method === "POST")).toBe(true);
    expect(receipt.outcomes.every((outcome) => outcome.status === "succeeded")).toBe(true);
  });

  test("the CLI plans to a file and applies that exact file", () => {
    const root = checkout(), f = tracker(start()), out = join(f.state + ".plan.json");
    const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/labels/cli.ts");
    const env = { ...f.env, PATH: `${resolve(f.executable, "..")}:${process.env.PATH}` };
    const planned = Bun.spawnSync([process.execPath, cli, "plan", "--repo", root, "--output", out], { env, stdout: "pipe", stderr: "pipe" });
    expect(planned.exitCode, planned.stderr.toString()).toBe(0);
    const sha = JSON.parse(planned.stdout.toString()).digest;
    expect(sha).toBe(digest(readFileSync(out, "utf8")));
    const applied = Bun.spawnSync([process.execPath, cli, "apply", "--repo", root, "--plan", out, "--approved-digest", sha], { env, stdout: "pipe", stderr: "pipe" });
    expect(applied.exitCode, applied.stderr.toString()).toBe(0);
    expect(JSON.parse(applied.stdout.toString()).complete).toBe(true);
  });
});

describe("apply refuses before any write", () => {
  const refuses = (run: () => unknown, f: ReturnType<typeof tracker>) => {
    expect(run).toThrow();
    expect(f.writes()).toEqual([]);
  };

  test("an edited plan", () => {
    const root = checkout(), f = tracker(start()), { text, digest: sha } = buildPlan(root, f.gh());
    refuses(() => apply(root, f.gh(), text.replace('"d73a4a"', '"000000"'), sha), f);
  });

  test("another digest", () => {
    const root = checkout(), f = tracker(start()), { text } = buildPlan(root, f.gh());
    refuses(() => apply(root, f.gh(), text, "0".repeat(64)), f);
  });

  test("another origin repository", () => {
    const root = checkout(), f = tracker(start()), { text, digest: sha } = buildPlan(root, f.gh());
    git(root, "remote", "set-url", "origin", "https://github.com/example/other.git");
    refuses(() => apply(root, f.gh(), text, sha), f);
  });

  test("another host", () => {
    const root = checkout(), f = tracker(start()), { text, digest: sha } = buildPlan(root, f.gh());
    git(root, "remote", "set-url", "origin", "https://ghe.example.com/example/project.git");
    refuses(() => apply(root, f.gh("ghe.example.com"), text, sha), f);
  });

  test("another authenticated actor", () => {
    const root = checkout(), f = tracker(start()), { text, digest: sha } = buildPlan(root, f.gh());
    const other = tracker(start(), { actor: "someone-else" });
    refuses(() => apply(root, other.gh(), text, sha), other);
  });

  test("an edited vocabulary", () => {
    const root = checkout(), f = tracker(start()), { plan } = buildPlan(root, f.gh());
    const text = JSON.stringify({ ...plan, vocabulary_sha256: "f".repeat(64) }, null, 2) + "\n";
    refuses(() => apply(root, f.gh(), text, digest(text)), f);
  });

  test("an edited label_map", () => {
    const root = checkout(), f = tracker(start()), { text, digest: sha } = buildPlan(root, f.gh());
    write(join(root, ".vh-adlc/triage.yaml"), "schema_version: 1\nlabel_map:\n  bug: defect\n");
    refuses(() => apply(root, f.gh(), text, sha), f);
  });

  test("a repository label changed after planning", () => {
    const root = checkout(), f = tracker(start()), { text, digest: sha } = buildPlan(root, f.gh());
    f.edit((labels) => { labels[0].color = "123456"; });
    refuses(() => apply(root, f.gh(), text, sha), f);
  });
});
