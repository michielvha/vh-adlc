import { expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { adopt, enter, fixture, invoke, REF } from "./fixture";
import { tracker } from "../labels/fixtures";

const oldSpec = "docs/specs/old-draft.md";
const newSpec = "docs/specs/moved-draft.md";
const envB = (f: ReturnType<typeof fixture>) => ({ ...f.env, CODEX_THREAD_ID: "fixture-other-writer" });

test("every retained alias holds after a collision and resolves to the selected writer", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const a = f.clone("draft");
    const b = f.clone("issue");
    await enter(a, f.env, "--spec", oldSpec);
    expect((await invoke(a, f.env, "link", "--spec", oldSpec, "--alias-spec", newSpec, "--operation", "move-spec")).status).toBe("linked");
    expect((await enter(b, envB(f), "--issue", "51")).status).toBe("entered");
    const collision = await invoke(a, f.env, "link", "--spec", newSpec, "--alias-issue", "51", "--operation", "collide");
    expect(collision.status).toBe("conflict");
    for (const target of [["--spec", oldSpec], ["--spec", newSpec], ["--issue", "51"]]) {
      expect((await enter(a, f.env, ...target)).status).toBe("held");
      expect((await enter(b, envB(f), ...target)).status).toBe("held");
    }
    const settled = await invoke(b, envB(f), "resolve-alias", "--choose", "issue:51", "--conflict", "collide",
      "--approved", "true", "--stopped", "true", "--preserved", "true", "--operation", "resolved");
    expect(settled.status).toBe("linked");
    for (const target of [["--spec", oldSpec], ["--spec", newSpec], ["--issue", "51"]]) {
      expect((await enter(b, envB(f), ...target)).status).toBe("entered");
      expect((await enter(a, f.env, ...target)).status).toBe("held");
    }
    expect(f.git(f.bare, "log", "--format=%s", REF).split("\n").length).toBeGreaterThan(4);
  } finally {
    f.cleanup();
  }
});

for (const differentWriter of [false, true]) {
  test(`pending marker and preview survive a ${differentWriter ? "handoff" : "same-session move"}`, async () => {
    const f = fixture();
    try {
      await adopt(f);
      const old = f.clone("draft");
      const dest = f.clone("destination");
      const incoming = differentWriter ? envB(f) : f.env;
      await enter(old, f.env, "--spec", oldSpec);
      const preview = join(f.root, "approved-preview.json");
      writeFileSync(preview, JSON.stringify({ repository: "team/project", title: "Draft issue", body: "fixture payload" }));
      const p = await invoke(old, f.env, "issue-pending", "--spec", oldSpec, "--preview", preview, "--operation", "pending-create");
      expect(p.status).toBe("pending");
      const state = f.git(f.bare, "show", `${REF}:reservations.json`);
      expect(state).not.toContain("fixture payload");
      expect((await enter(old, f.env, "--spec", oldSpec)).status).toBe("held");
      const stateDir = "vh-adlc-reservation-pending";
      const oldDir = join(f.git(old, "rev-parse", "--absolute-git-dir"), stateDir);
      const newDir = join(f.git(dest, "rev-parse", "--absolute-git-dir"), stateDir);
      const handoff = ["handoff", "--spec", oldSpec, "--expected-operation", p.operation!, "--operation", "takeover",
        "--approved", "true", "--stopped", "true", "--preserved", "true"];
      const recover = ["issue-recover", "--spec", oldSpec, "--alias-issue", "51", "--confirmed", "true", "--operation", "recover"];
      mkdirSync(dirname(newDir), { recursive: true });
      const args = differentWriter ? handoff : recover;
      expect((await invoke(dest, incoming, ...args)).status).toBe("held");
      cpSync(oldDir, newDir, { recursive: true });
      const localMarker = join(newDir, p.pending!, "marker");
      rmSync(localMarker);
      expect((await invoke(dest, incoming, ...args)).status).toBe("held");
      cpSync(join(oldDir, p.pending!, "marker"), localMarker);
      if (differentWriter) expect((await invoke(dest, incoming, ...handoff)).status).toBe("transferred");
      expect((await enter(dest, incoming, "--spec", oldSpec)).status).toBe("held");
      expect((await invoke(dest, incoming, "status", "--spec", oldSpec)).pending).toBe(p.pending);
      expect((await invoke(dest, incoming, ...recover)).status).toBe("linked");
      expect((await enter(dest, incoming, "--issue", "51")).status).toBe("entered");
      expect((await enter(dest, incoming, "--spec", oldSpec)).status).toBe("entered");
    } finally {
      f.cleanup();
    }
  });
}

test("the approved tracker command cannot resend an accepted request after the response is lost", async () => {
  const f = fixture();
  try {
    await adopt(f);
    const root = f.clone("draft");
    const gh = tracker([{ name: "enhancement", color: "a2eeef", description: "New feature or request" }],
      { host: "fixture.test", repository: "team/project" });
    const bin = join(f.root, "tracker-bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "gh"), `#!/bin/sh
case "$*" in
  *"-X POST"*"repos/team/project/issues"*)
    "$VH_FIXTURE_TRACKER" "$@" >/dev/null || exit "$?"
    exit 94 ;;
esac
exec "$VH_FIXTURE_TRACKER" "$@"
`, { mode: 0o700 });
    const env = { ...f.env, PATH: `${bin}:${f.env.PATH}`, LABELS_FIXTURE: gh.state, VH_FIXTURE_TRACKER: gh.executable };
    const labels = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/labels/cli.ts");
    const run = (...args: string[]) => Bun.spawnSync([process.execPath, labels, "file", "--repo", root, ...args], { env, stdout: "pipe", stderr: "pipe" });
    await enter(root, f.env, "--spec", oldSpec);
    const target = join(f.root, "preview"), body = join(f.root, "issue-body");
    writeFileSync(body, "Work in the draft.");
    const preview = run("--operation", "spec", "--type", "enhancement", "--title", "New issue", "--body-file", body, "--output", target);
    expect(preview.exitCode, preview.stderr.toString()).toBe(0);
    const approved = JSON.parse(preview.stdout.toString()) as { digest: string };
    const args = ["--preview", target, "--approved-digest", approved.digest, "--ownership-spec", oldSpec];
    expect(run(...args).exitCode).not.toBe(0);
    const issue = gh.issues()[0]!;
    expect(gh.issues()).toHaveLength(1);
    expect(run(...args).exitCode).not.toBe(0);
    expect(gh.issues()).toHaveLength(1);
    const held = await enter(root, f.env, "--spec", oldSpec);
    expect(held).toMatchObject({ status: "held", pending: approved.digest });
    expect(readFileSync(join(f.git(root, "rev-parse", "--absolute-git-dir"), "vh-adlc-reservation-pending", held.pending!, "preview.json"), "utf8"))
      .toBe(readFileSync(target, "utf8"));
    expect((await invoke(root, f.env, "issue-recover", "--spec", oldSpec, "--alias-issue", String(issue.number), "--confirmed", "true", "--operation", "recover"))
      .status).toBe("linked");
    expect((await enter(root, f.env, "--issue", String(issue.number))).status).toBe("entered");
    expect(gh.issues()).toHaveLength(1);
  } finally {
    f.cleanup();
  }
});
