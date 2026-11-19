import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adopt, enter, fixture, invoke, POLICY, REF, SPEC } from "./fixture";

test("checks the committed policy on the remote rather than the local checkout", async () => {
  const f = fixture();
  try {
    const older = f.clone("before-setup");
    expect((await enter(older, { ...f.env, CODEX_THREAD_ID: undefined }, "--issue", "42")).status).toBe("legacy");
    expect((await enter(older, f.env, "--issue", "42")).status).toBe("legacy");
    const init = await invoke(f.seed, f.env, "initialize", "--approved", "true", "--operation", "setup");
    const interrupted = await enter(older, f.env, "--issue", "42");
    expect(interrupted.status).toBe("held");
    f.policy(init.genesis!);
    expect((await enter(older, f.env, "--issue", "42", "--no-push", "true")).status).toBe("held");
    expect((await enter(older, f.env, "--issue", "42")).status).toBe("entered");
    const tip = f.git(f.bare, "rev-parse", REF);
    expect((await enter(older, f.env, "--issue", "42", "--no-push", "true")).status).toBe("entered");
    expect(f.git(f.bare, "rev-parse", REF)).toBe(tip);
  } finally {
    f.cleanup();
  }
});

test("a known adopted checkout holds when both remote records vanish or origin is removed", async () => {
  const f = fixture();
  try {
    const beforeAdoption = f.git(f.seed, "rev-parse", "HEAD");
    await adopt(f);
    const known = f.clone("known");
    expect((await enter(known, f.env, "--issue", "42")).status).toBe("entered");
    f.git(f.bare, "update-ref", "-d", REF);
    f.git(f.bare, "update-ref", "refs/heads/main", beforeAdoption);
    expect((await enter(known, f.env, "--issue", "42")).status).toBe("held");
    expect((await enter(f.clone("fresh"), f.env, "--issue", "42")).status).toBe("legacy");
    f.git(known, "remote", "remove", "origin");
    const local = await enter(known, f.env, "--spec", "docs/specs/private.md", "--local-draft", "true");
    expect(local.status).toBe("held");
  } finally {
    f.cleanup();
  }
});

test("local-draft mode checks the path and works before the first local commit", async () => {
  const f = fixture();
  try {
    const local = join(f.root, "local");
    f.git(f.root, "init", "-q", "-b", "main", local);
    const selected = ["--local-draft", "true"] as const;
    expect((await enter(local, f.env, "--spec", "docs/internal/plans/private.md", ...selected)).status).toBe("local-draft");
    expect((await enter(local, f.env, "--spec", "../outside.md", ...selected)).status).toBe("held");
    expect((await enter(local, f.env, "--issue", "42", ...selected)).status).toBe("held");
    const old = f.clone("old");
    f.git(old, "remote", "remove", "origin");
    expect((await enter(old, f.env, "--spec", "docs/specs/private.md")).status).toBe("held");
    expect((await enter(old, f.env, "--spec", "docs/specs/private.md", ...selected)).status).toBe("local-draft");
    expect((await enter(old, f.env, "--spec", SPEC, ...selected)).status).toBe("held");
  } finally {
    f.cleanup();
  }
});

test("initialization reconciles an exact lost response but refuses a competing genesis", async () => {
  const f = fixture();
  try {
    const cmd = ["initialize", "--approved", "true", "--operation"] as const;
    const clone = f.clone("initializer");
    const [first, second] = await Promise.all([
      invoke(f.seed, withPushExit(f, "lost"), ...cmd, "first-init"),
      invoke(clone, f.env, ...cmd, "second-init"),
    ]);
    expect([first.status, second.status].sort()).toEqual(["held", "initialized"]);
    const winner = first.status === "initialized" ? "first-init" : "second-init";
    const repeat = await invoke(f.seed, f.env, ...cmd, winner);
    expect(repeat.genesis).toBe(f.git(f.bare, "rev-parse", REF));
    expect((await invoke(f.seed, f.env, ...cmd, "new-init")).status).toBe("held");
  } finally {
    f.cleanup();
  }
});

test("recovers an accepted update with a lost response and holds a rejected update", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const clone = f.clone("claim");
    const genesis = f.git(f.bare, "rev-parse", REF);
    const refused = await enter(clone, withPushExit(f, "reject"), "--issue", "21");
    expect(refused.status).toBe("held");
    expect(f.git(f.bare, "rev-parse", REF)).toBe(genesis);
    const accepted = await enter(clone, withPushExit(f, "lost"), "--issue", "22");
    expect(accepted.status).toBe("entered");
    const actual = JSON.parse(f.git(f.bare, "show", `${REF}:reservations.json`)) as { operation: string };
    expect(actual.operation).toBe(accepted.operation!);
    expect(f.git(f.bare, "rev-list", "--count", `${genesis}..${REF}`)).toBe("1");
  } finally {
    f.cleanup();
  }
});

test("a checkout with committed adoption cannot downgrade to a private draft before first verification", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const clone = f.clone("not-verified");
    f.git(clone, "remote", "remove", "origin");
    expect(f.git(clone, "show", `HEAD:${POLICY}`)).toContain("genesis:");
    expect((await enter(clone, f.env, "--spec", "docs/specs/private.md", "--local-draft", "true")).status).toBe("held");
  } finally {
    f.cleanup();
  }
});

function withPushExit(f: ReturnType<typeof fixture>, mode: "lost" | "reject") {
  const bin = join(f.root, "bin");
  mkdirSync(bin, { recursive: true });
  const git = Bun.which("git");
  if (!git) throw Error("Git is required");
  writeFileSync(join(bin, "git"), `#!/bin/sh
case "$*" in
  *" push "*"--force-with-lease=refs/heads/vh-adlc/work-ownership:"*)
    test "$VH_FIXTURE_PUSH" = reject && exit 92
    "$VH_FIXTURE_REAL_GIT" "$@" || exit "$?"
    exit 93 ;;
esac
exec "$VH_FIXTURE_REAL_GIT" "$@"
`, { mode: 0o700 });
  return { ...f.env, PATH: `${bin}:${f.env.PATH}`, VH_FIXTURE_PUSH: mode, VH_FIXTURE_REAL_GIT: git };
}

test("a replacement history cannot satisfy a committed genesis", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const clone = f.clone("replacement");
    const unrelated = f.git(f.bare, "rev-parse", "main");
    f.git(f.bare, "update-ref", REF, unrelated);
    expect(await enter(clone, f.env, "--issue", "42")).toMatchObject({
      status: "held", reason: "reservation history does not descend from the bound genesis",
    });
    expect(f.git(f.bare, "rev-parse", REF)).toBe(unrelated);
  } finally {
    f.cleanup();
  }
});
