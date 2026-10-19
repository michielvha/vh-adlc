// Checks the scenario fixtures that tests/vh-adlc/fixtures/build.ts produces.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, type Fixtures, gitEnv, realBinary, SECRET_CANARIES } from "./fixtures/build";

const ROOT = resolve(import.meta.dir, "..", "..");
const dir = mkdtempSync(join(tmpdir(), "vh-adlc-fixtures-"));
let f: Fixtures;

beforeAll(() => {
  f = build(dir);
}, 180_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function sh(cwd: string, ...cmd: string[]) {
  const r = Bun.spawnSync(cmd, { cwd, env: gitEnv(f.home), stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function wrapperPath(plugin: string): string {
  const r = Bun.spawnSync(["bash", join(plugin, "scripts", "ensure-vh-adlc.sh")], {
    env: { HOME: f.home, XDG_CACHE_HOME: join(f.home, ".cache"), PATH: "/usr/local/bin:/usr/bin:/bin", LC_ALL: "C" },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(r.exitCode).toBe(0);
  return r.stdout.toString().trim();
}

function vh(plugin: string, cwd: string, ...args: string[]) {
  const pin = readFileSync(join(plugin, "knowledge.md"), "utf8").match(/\b[0-9a-f]{40}\b/)?.[0] ?? "";
  const r = sh(cwd, wrapperPath(plugin), ...args, "--repo", cwd, "--plugin-pin", pin);
  return { ...r, json: r.out ? JSON.parse(r.out) : null };
}

describe("docs fixture", () => {
  test("revision B differs from A only in the default root and the planned gate", () => {
    expect(sh(f.docs, "git", "diff", "--name-only", f.revisionA, f.revisionB).out.trim()).toBe("conventions/feature-documents.md\nguides/onboard-a-repository.md");
    expect(sh(f.docs, "git", "grep", "-c", "docs/internal/plans", f.revisionB, "--", "conventions/feature-documents.md", "guides/onboard-a-repository.md").out).toBe("");
    const b = sh(f.docs, "git", "show", `${f.revisionB}:conventions/feature-documents.md`).out;
    expect(b).toContain("default: plans");
    expect(b).toContain("accepted, all_met, on_feature_branch_if_set]");
  });
});

describe("project fixture", () => {
  test("its test suite fails on purpose", () => {
    const r = sh(f.project, "./test.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("FAIL");
  });

  test("it holds unrelated staged, unstaged and untracked work", () => {
    const status = sh(f.project, "git", "status", "--porcelain").out;
    expect(status).toContain("A  NOTES.md");
    expect(status).toContain(" M README.md");
    expect(status).toContain("?? scratch.txt");
    expect(status).not.toContain(".env.local");
  });

  test("it holds secret canaries in an ignored file", () => {
    const env = readFileSync(join(f.project, ".env.local"), "utf8");
    for (const c of SECRET_CANARIES) expect(env).toContain(c);
  });

  test("it has a remote with HEAD set and a host-managed worktree", () => {
    expect(sh(f.project, "git", "symbolic-ref", "refs/remotes/origin/HEAD").out.trim()).toBe("refs/remotes/origin/main");
    expect(sh(f.project, "git", "worktree", "list", "--porcelain").out).toContain("branch refs/heads/feat/other-work");
    expect(existsSync(f.worktree)).toBe(true);
  });
});

describe("other plugin", () => {
  test("exposes skills named spec, implement and review", () => {
    for (const name of ["spec", "implement", "review"]) {
      expect(readFileSync(join(f.otherPlugin, "skills", name, "SKILL.md"), "utf8")).toContain(`name: ${name}`);
    }
  });
});

describe("fixture plugins and the logging wrapper", () => {
  test("the released binary and fixture wrapper use separate verified caches", () => {
    const wrapper = wrapperPath(f.pluginA);
    expect(realBinary(f.home)).not.toBe(wrapper);
    expect(wrapperPath(f.pluginB)).toBe(wrapper);
  });

  test("the unmodified installer installs the wrapper from the fixture lock", () => {
    const path = wrapperPath(f.pluginA);
    const digest = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
    expect(digest(path)).toBe(digest(f.wrapper));
    expect(readFileSync(join(f.pluginA, "scripts", "ensure-vh-adlc.sh"))).toEqual(
      readFileSync(join(ROOT, "plugins", "vh-adlc", "scripts", "ensure-vh-adlc.sh")),
    );
  });

  test("the real lock and package are untouched", () => {
    const r = Bun.spawnSync(["git", "-C", ROOT, "status", "--porcelain", "--", "plugins/vh-adlc"], { stdout: "pipe" });
    expect(r.stdout.toString()).toBe("");
  });

  test("the wrapper forwards, logs and seeds the isolated cache", () => {
    const r = vh(f.pluginA, f.project, "knowledge", "--page", "guides/humanize-prose.md");
    expect(r.code).toBe(0);
    expect(r.json.knowledge.revision).toBe(f.revisionA);
    expect(r.json.knowledge.override).toBe(true);
    const base = process.platform === "darwin" ? join(f.home, "Library", "Caches") : join(f.home, ".cache");
    expect(existsSync(join(base, "vh-adlc", "docs", f.revisionA, "guides", "humanize-prose.md"))).toBe(true);
    expect(readFileSync(f.log, "utf8")).toContain("knowledge --page guides/humanize-prose.md");
  });

  test("the docs revision decides the feature root and the gate", () => {
    expect(vh(f.pluginA, f.project, "find", "--slug", "greeting-name").json.data.documents).toEqual(["docs/internal/plans/greeting-name.md"]);
    expect(vh(f.pluginB, f.project, "find", "--slug", "greeting-name").json.data.documents).toEqual([]);
    expect(vh(f.pluginA, f.project, "lint", "docs/internal/plans/greeting-name.md").json.result).toBe("pass");
  });
});
