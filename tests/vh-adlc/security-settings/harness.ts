import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fixture, git } from "../maintenance/fixtures";
import { handle, state, type Call, type FakeState } from "./fake-gh";
import { securitySettings, type Output } from "../../../plugins/vh-adlc/scripts/security-settings/security-settings";

export const fakeGh = resolve(import.meta.dir, "fake-gh.ts");
export const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/security-settings/cli.ts");
const projects: ReturnType<typeof fixture>[] = [], scratch: string[] = [];
export function dispose() { for (const f of projects.splice(0)) f.dispose(); for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); }

export type Setup = { settings?: Record<string, unknown> | null; link?: boolean; host?: string };
/** A consumer checkout whose committed, linked default-branch settings are `settings`, and a fake GitHub. */
export function setup(fakeState: Partial<FakeState> = {}, options: Setup = {}) {
  const f = fixture(); projects.push(f);
  if (options.host) git(f.root, "remote", "set-url", "origin", `https://${options.host}/example/project.git`);
  if (options.settings !== null) {
    f.write("AGENTS.md", options.link === false ? "No maintenance settings link here.\n" : "Use [maintenance settings](.vh-adlc/maintenance.yaml).\n");
    f.settings({ schema_version: 1, ...(options.settings ?? { security_settings: "apply" }) });
    git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "docs: maintenance settings");
  }
  const commit = git(f.root, "rev-parse", "HEAD");
  git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  const fake = state(fakeState), calls: Call[] = [];
  const run = (argv: string[], input?: string) => {
    const { reply, call } = handle(fake, argv, input ?? null); calls.push(call); return reply;
  };
  const helper = (command: "check" | "apply", extra: Partial<Parameters<typeof securitySettings>[0]> = {}) => {
    const result = securitySettings({ command, repo: f.root, default_branch: "main", default_commit: commit, run, ...extra });
    for (const call of calls) {
      if (call.method === "DELETE") throw Error("the helper turned a setting off");
      if (call.body && call.body.includes("disabled")) throw Error("the helper wrote a disabling body");
    }
    return result;
  };
  return { ...f, commit, fake, calls, run, helper };
}
export const writes = (calls: Call[]) => calls.filter(call => call.method !== "GET");
export const entry = (output: Output, setting: string) => output.entries.find(item => item.setting === setting);
export const adminOnly = (calls: Call[]) => calls.filter(call => /\/(?:vulnerability-alerts|automated-security-fixes)$/.test(call.endpoint) && call.method === "GET");

/** Runs the helper's CLI with a `gh` shim on PATH that serves the fake state. */
export function cliRun(f: ReturnType<typeof setup>, args: string[], env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vh-security-settings-")), shim = join(dir, "bin"), path = join(dir, "state.json");
  scratch.push(dir);
  mkdirSync(shim, { recursive: true });
  writeFileSync(join(shim, "gh"), `#!/bin/sh\nexec bun ${JSON.stringify(fakeGh)} "$@"\n`, { mode: 0o755 });
  writeFileSync(path, JSON.stringify(f.fake));
  writeFileSync(path + ".calls", "");
  const result = Bun.spawnSync(["bun", cli, ...args], { stdout: "pipe", stderr: "pipe",
    env: { ...process.env, ...env, PATH: shim + delimiter + process.env.PATH, SECURITY_SETTINGS_FIXTURE: path } });
  const calls = readFileSync(path + ".calls", "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Call & { gh_host: string | null });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString(), calls };
}
