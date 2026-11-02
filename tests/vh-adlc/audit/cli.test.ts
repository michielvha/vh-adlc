import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fixture, git } from "./fixtures";
const projects: ReturnType<typeof fixture>[] = [];
const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/audit/cli.ts");
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function invoke(f: ReturnType<typeof fixture>, ...args: string[]) {
  return Bun.spawnSync([process.execPath, cli, ...args, "--repo", f.root], { stdout: "pipe", stderr: "pipe" });
}
test("native status and snapshot helpers preserve source, index and refs", () => {
  const f = fixture(); projects.push(f); const head = git(f.root, "rev-parse", "HEAD"), status = git(f.root, "status", "--porcelain");
  const result = invoke(f, "status"); expect(result.exitCode).toBe(0); expect(JSON.parse(result.stdout.toString()).verification).toBe("not-performed");
  const snap = invoke(f, "snapshot", "--mode", "reverify", "--ids", "AUD-001", "--artifact-root", f.artifacts, "--name", "snapshot");
  expect(snap.exitCode).toBe(0); expect(existsSync(join(f.artifacts, "snapshot.json"))).toBe(true);
  expect(JSON.parse(readFileSync(join(f.artifacts, "snapshot.json"), "utf8")).selected_ids).toEqual(["AUD-001"]);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(head); expect(git(f.root, "status", "--porcelain")).toBe(status);
});
test("unknown operation, scope or option gives a safe error without creating output", () => {
  const f = fixture(); projects.push(f);
  for (const args of [["unknown"], ["status", "--execute", "injected"], ["snapshot", "--mode", "fuller", "--artifact-root", f.artifacts, "--name", "bad"],
    ["snapshot", "--mode", "fix", "--ids", "AUD-999", "--artifact-root", f.artifacts, "--name", "bad"]]) {
    expect(invoke(f, ...args).exitCode).toBe(1);
  }
  expect(existsSync(join(f.artifacts, "bad.json"))).toBe(false); expect(git(f.root, "status", "--porcelain")).toBe("");
});
