// The loop context reports the running plugin version, and a stale session when the host's install
// record names a different vh-adlc version (a session keeps the plugin it started with).
import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
const RUNNING = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../plugins/vh-adlc/plugin.json"), "utf8")).version as string;
const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

function context(record?: string | ((dir: string) => string), pathBinary?: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-plugin-"))); made.push(dir);
  Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: dir });
  const config = join(dir, "claude");
  if (record !== undefined) { mkdirSync(join(config, "plugins"), { recursive: true }); writeFileSync(join(config, "plugins", "installed_plugins.json"), typeof record === "function" ? record(dir) : record); }
  const bin = join(dir, "bin"); mkdirSync(bin);
  if (pathBinary !== undefined) { writeFileSync(join(bin, "vh-adlc"), `#!/bin/sh\necho "vh-adlc ${pathBinary}"\n`); chmodSync(join(bin, "vh-adlc"), 0o755); }
  // PATH holds only the fixture's bin and the system directories, so a real vh-adlc elsewhere does not leak in.
  const run = Bun.spawnSync([process.execPath, CLI, "context", "--repo", dir], { stdout: "pipe", stderr: "pipe",
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, CLAUDE_CONFIG_DIR: config, XDG_CONFIG_HOME: join(dir, "xdg") } });
  return JSON.parse(run.stdout.toString()).plugin;
}
const record = (version: string) => JSON.stringify({ version: 2, plugins: { "vh-adlc@vhco-tools": [{ scope: "user", version }] } });

test("a session on the installed plugin version is not stale", () => {
  expect(context(record(RUNNING))).toEqual({ running: RUNNING, installed: RUNNING, stale: false });
});

test("a session older than the installed plugin is reported stale with the restart it needs", () => {
  const plugin = context(record("99.0.0"));
  expect(plugin).toMatchObject({ running: RUNNING, installed: "99.0.0", stale: true });
  expect(plugin.warning).toContain("restart");
});

test("without an install record the running version is reported and nothing is called stale", () => {
  expect(context()).toEqual({ running: RUNNING, stale: false });
});

const LOCKED = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../plugins/vh-adlc/vh-adlc.lock.json"), "utf8")).version as string;

test("a vh-adlc on PATH at another version than the lock is reported, so operations use the locked binary", () => {
  const plugin = context(record(RUNNING), "0.19.0");
  expect(plugin).toMatchObject({ stale: false, path_binary: "0.19.0", locked_binary: LOCKED });
  expect(plugin.binary_warning).toContain("ensure-vh-adlc.sh");
});

test("a vh-adlc on PATH at the locked version raises no binary warning", () => {
  const plugin = context(record(RUNNING), LOCKED);
  expect(plugin.binary_warning).toBeUndefined();
});

test("a project-scope install for another checkout listed first does not make this session stale", () => {
  const twoScopes = JSON.stringify({ version: 2, plugins: { "vh-adlc@vhco-tools": [
    { scope: "project", version: "0.0.1", projectPath: "/tmp/some-other-checkout" }, { scope: "user", version: RUNNING }] } });
  expect(context(twoScopes)).toMatchObject({ running: RUNNING, installed: RUNNING, stale: false });
});

test("a project-scope install for this repository wins over the user install", () => {
  const forThisRepo = (dir: string) => JSON.stringify({ version: 2, plugins: { "vh-adlc@vhco-tools": [
    { scope: "user", version: RUNNING }, { scope: "project", version: "99.0.0", projectPath: dir }] } });
  expect(context(forThisRepo)).toMatchObject({ installed: "99.0.0", stale: true });
});
