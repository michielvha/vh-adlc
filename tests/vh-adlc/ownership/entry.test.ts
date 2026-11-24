import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adopt, enter, fixture, REF, SPEC } from "./fixture";

function snapshot(f: ReturnType<typeof fixture>, root: string) {
  const index = f.git(root, "rev-parse", "--path-format=absolute", "--git-path", "index");
  return {
    head: f.git(root, "rev-parse", "HEAD"),
    branches: f.git(root, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/tags"),
    index: createHash("sha256").update(readFileSync(index)).digest("hex"),
    spec: readFileSync(join(root, SPEC), "utf8"),
    status: f.git(root, "status", "--porcelain=v1"),
  };
}

test("two independent clones reserve the same work only once", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const first = f.clone("first");
    const second = f.clone("second");
    const before = [snapshot(f, first), snapshot(f, second)];
    const base = f.git(f.bare, "rev-parse", REF);

    const entries = await Promise.all([
      enter(first, f.env, "--issue", "42"),
      enter(second, { ...f.env, CODEX_THREAD_ID: "fixture-second-session" }, "--spec", SPEC),
    ]);
    const winners = entries.filter(result => result.status === "entered");
    const losers = entries.filter(result => result.status === "held");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.writer).toEqual(winners[0]?.writer);
    expect(losers[0]?.writer?.host).toBeTruthy();
    expect(f.git(f.bare, "rev-list", "--count", `${base}..${REF}`)).toBe("1");
    expect([snapshot(f, first), snapshot(f, second)]).toEqual(before);
  } finally {
    f.cleanup();
  }
});

test("unwritten spec paths are reserved and independent items can start", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const a = f.clone("a");
    const b = f.clone("b");
    const envB = { ...f.env, CODEX_THREAD_ID: "fixture-second-session" };
    const draft = "docs/specs/next feature.md";
    const race = await Promise.all([enter(a, f.env, "--spec", draft), enter(b, envB, "--spec", draft)]);
    expect(race.map(result => result.status).sort()).toEqual(["entered", "held"]);
    const independent = await Promise.all([enter(a, f.env, "--issue", "51"), enter(b, envB, "--issue", "52")]);
    expect(independent.map(result => result.status)).toEqual(["entered", "entered"]);
  } finally {
    f.cleanup();
  }
});

test("a different effective push repository holds entry without changing either remote", async () => {
  const f = fixture();
  try {
    await adopt(f);
    f.git(f.root, "clone", "-q", "--bare", "--no-hardlinks", f.bare, f.mirror);
    const clone = f.clone("candidate");
    f.git(clone, "remote", "set-url", "--push", "origin", "git@fixture.test:team/mirror.git");
    const tip = f.git(f.bare, "rev-parse", REF);
    expect(f.git(f.mirror, "rev-parse", REF)).toBe(tip);
    const result = await enter(clone, f.env, "--issue", "42");
    expect(result.status).toBe("held");
    expect(result.reason).toContain("destination");
    expect(f.git(f.bare, "rev-parse", REF)).toBe(tip);
    expect(f.git(f.mirror, "rev-parse", REF)).toBe(tip);
  } finally {
    f.cleanup();
  }
});
