import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adopt, enter, fixture, invoke, REF, SPEC } from "./fixture";

const issue = ["--issue", "42"];
const approve = ["--approved", "true", "--stopped", "true", "--preserved", "true"];

test("only an exact owner-approved handoff transfers work, and replay does not rewrite it", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const root = f.clone("same");
    const original = await enter(root, f.env, ...issue);
    expect(original.status).toBe("entered");
    const incoming = { ...f.env, CODEX_THREAD_ID: "fixture-incoming-session" };
    const named = ["handoff", ...issue, "--expected-operation", original.operation!, "--operation", "takeover"];
    const prior = f.git(f.bare, "rev-parse", REF);
    writeFileSync(join(root, "unfinished.txt"), "keep this work\n");
    expect((await invoke(root, incoming, ...named, "--approved", "true")).status).toBe("held");
    expect(f.git(f.bare, "rev-parse", REF)).toBe(prior);
    expect((await invoke(root, incoming, ...named, ...approve, "--no-push", "true")).status).toBe("held");
    const settled = await invoke(root, incoming, ...named, ...approve);
    expect(settled.status).toBe("transferred");
    const next = f.git(f.bare, "rev-parse", REF);
    expect((await invoke(root, incoming, ...named, ...approve)).status).toBe("transferred");
    expect(f.git(f.bare, "rev-parse", REF)).toBe(next);
    expect(readFileSync(join(root, "unfinished.txt"), "utf8")).toBe("keep this work\n");
    const old = await enter(root, f.env, ...issue);
    expect(old).toMatchObject({ status: "held", writer: settled.writer, localPath: root });
    expect(old.reason).toContain("handed off");
    expect((await enter(root, incoming, ...issue)).status).toBe("entered");

    const elsewhere = f.clone("elsewhere");
    const remoteDiagnostic = await enter(elsewhere, f.env, ...issue);
    expect(remoteDiagnostic.writer?.locator).toBe(`spec:${SPEC}`);
    expect(remoteDiagnostic.writer?.host).toBeTruthy();
    expect(remoteDiagnostic.localPath).toBeUndefined();
    const states = f.git(f.bare, "rev-list", REF).split("\n").map(oid => f.git(f.bare, "show", `${oid}:reservations.json`));
    for (const output of [...states, JSON.stringify(remoteDiagnostic)]) {
      expect(output).not.toContain(f.env.CODEX_THREAD_ID!);
      expect(output).not.toContain(incoming.CODEX_THREAD_ID);
      expect(output).not.toContain(root);
    }
  } finally {
    f.cleanup();
  }
});

test("existing claims stay held until selected once, including when enrollment races", async () => {
  const f = fixture();
  try {
    await adopt(f);
    writeFileSync(join(f.seed, SPEC), readFileSync(join(f.seed, SPEC), "utf8").replace("status: planned\n", "status: in-progress\nbranch: feat/example\n"));
    f.git(f.seed, "add", "--", SPEC);
    f.git(f.seed, "commit", "-qm", "fixture: legacy claim", "--", SPEC);
    f.git(f.seed, "push", "-q", "origin", "main");
    const old = f.clone("legacy-writer");
    const other = f.clone("legacy-competing");
    const env2 = { ...f.env, CODEX_THREAD_ID: "competing-session" };
    const base = f.git(f.bare, "rev-parse", REF);
    expect((await enter(old, f.env, "--branch", "feat/example")).status).toBe("held");
    expect(f.git(f.bare, "rev-parse", REF)).toBe(base);
    const attempts = await Promise.all([
      invoke(old, f.env, "handoff", ...issue, "--expected-operation", "absent", "--operation", "enroll-one", ...approve),
      invoke(other, env2, "handoff", ...issue, "--expected-operation", "absent", "--operation", "enroll-two", ...approve),
    ]);
    expect(attempts.map(result => result.status).sort()).toEqual(["held", "transferred"]);
    expect(f.git(f.bare, "rev-list", "--count", `${base}..${REF}`)).toBe("1");
    const entries = await Promise.all([enter(old, f.env, ...issue), enter(other, env2, ...issue)]);
    expect(entries.map(result => result.status).sort()).toEqual(["entered", "held"]);
  } finally {
    f.cleanup();
  }
});

test("same-session relocation updates the work location without granting another session access", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const a = f.clone("original");
    const b = f.clone("moved");
    const original = await enter(a, f.env, ...issue);
    const moved = await enter(b, f.env, ...issue);
    expect(moved.status).toBe("entered");
    expect(moved.writer?.fingerprint).toBe(original.writer?.fingerprint);
    expect(moved.operation).not.toBe(original.operation);
    const competitor = { ...f.env, CODEX_THREAD_ID: "another-session" };
    expect((await enter(a, competitor, ...issue)).localPath).toBeUndefined();
    expect((await enter(b, competitor, ...issue)).localPath).toBe(b);
    expect((await invoke(a, competitor, "handoff", ...issue, "--expected-operation", original.operation!, "--operation", "stale", ...approve)).status).toBe("held");
  } finally {
    f.cleanup();
  }
});
