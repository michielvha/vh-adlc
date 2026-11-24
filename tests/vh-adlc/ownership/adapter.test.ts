import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { adopt, enter, fixture, SPEC } from "./fixture";

const loop = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");

test("standalone claim stops a competing writer before editing, committing or pushing", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const owner = f.clone("owner");
    const competitor = f.clone("competitor");
    const env = { ...f.env, CODEX_THREAD_ID: "competing-client" };
    const starting = f.git(f.bare, "rev-parse", "main");
    const args = ["claim", "--document", SPEC, "--feature-branch", "feat/example", "--default-branch", "main",
      "--status-description", "In progress", "--message", "fixture: claim"];
    const original = readFileSync(join(competitor, SPEC), "utf8");
    expect((await enter(owner, f.env, "--issue", "42")).status).toBe("entered");
    const run = (repo: string, environment: typeof env, ...extra: string[]) => {
      const child = Bun.spawnSync([process.execPath, loop, ...args, "--repo", repo, ...extra], { env: environment, stdout: "pipe", stderr: "pipe" });
      return { code: child.exitCode, body: JSON.parse(child.stdout.toString()) as { status: string; reason?: string; writer?: unknown } };
    };
    for (const denied of [
      run(competitor, env, "--client", "codex"),
      run(owner, f.env, "--client", "claude"),
      run(owner, f.env),
      run(owner, f.env, "--client", "codex", "--no-push", "true"),
    ]) {
      expect(denied.code).toBe(3);
      expect(denied.body.status).toBe("refused");
    }
    expect(f.git(f.bare, "rev-parse", "main")).toBe(starting);
    expect(f.git(competitor, "rev-parse", "HEAD")).toBe(starting);
    expect(f.git(competitor, "branch", "--list", "feat/example")).toBe("");
    expect(f.git(competitor, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(competitor, SPEC), "utf8")).toBe(original);
    expect(run(owner, f.env, "--client", "codex").body.status).toBe("claimed");
    expect(f.git(owner, "branch", "--show-current")).toBe("feat/example");
    expect(f.git(f.bare, "rev-parse", "main")).not.toBe(starting);
    expect((await enter(owner, f.env, "--branch", "feat/example")).status).toBe("entered");
  } finally {
    f.cleanup();
  }
});

test("the feature skills route each writing entry to the reservation and leave read-only review available", () => {
  const root = resolve(import.meta.dir, "../../../plugins/vh-adlc");
  for (const operation of ["spec", "tasks", "implement", "review", "ship"]) {
    const source = readFileSync(join(root, `skills/vh-adlc-${operation}/SKILL.md`), "utf8");
    expect(source).toContain("references/authority.md#feature-writer-entry");
  }
  const resume = readFileSync(join(root, "skills/vh-adlc-resume/SKILL.md"), "utf8");
  expect(resume).toContain("the selected writer operation runs the reservation check");
  const review = readFileSync(join(root, "skills/vh-adlc-review/SKILL.md"), "utf8");
  expect(review).toContain("Independent read-only review does not acquire a reservation");
});

test("an adopted claim can be retried from the new default tip without losing the pending commit", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const first = f.clone("first-claim");
    const branch = "feat/example";
    const run = (root: string, message: string, env = f.env) => {
      const child = Bun.spawnSync([process.execPath, loop, "claim", "--repo", root, "--document", SPEC, "--client", "codex",
        "--feature-branch", branch, "--default-branch", "main", "--status-description", "In progress", "--message", message],
        { env, stdout: "pipe", stderr: "pipe" });
      return JSON.parse(child.stdout.toString()) as { status: string; commit?: string };
    };
    writeFileSync(join(f.bare, "hooks/pre-receive"), `#!/bin/sh
while read -r old new ref; do
  if test "$ref" = refs/heads/main && test "$(git show -s --format=%s "$new")" = 'fixture: reject initial claim'; then
    exit 91
  fi
done
`, { mode: 0o700 });
    const pending = run(first, "fixture: reject initial claim");
    expect(pending.status).toBe("pending");
    expect(f.git(first, "rev-parse", "HEAD")).toBe(pending.commit);
    expect(f.git(first, "branch", "--list", branch)).toBe("");
    writeFileSync(join(f.seed, "advance.txt"), "Advance default after the rejected claim.\n");
    f.git(f.seed, "add", "--", "advance.txt");
    f.git(f.seed, "commit", "-qm", "fixture: advance default", "--", "advance.txt");
    f.git(f.seed, "push", "-q", "origin", "main");
    f.git(first, "fetch", "-q", "origin", "main");
    const retry = join(f.root, "fresh-worktree");
    f.git(first, "worktree", "add", "--detach", "-q", retry, "origin/main");
    expect(run(retry, "fixture: competitor", { ...f.env, CODEX_THREAD_ID: "other-writer" }).status).toBe("refused");
    expect(run(retry, "fixture: retry").status).toBe("claimed");
    expect(f.git(retry, "branch", "--show-current")).toBe(branch);
    expect(f.git(first, "rev-parse", "HEAD")).toBe(pending.commit);
  } finally {
    f.cleanup();
  }
});
