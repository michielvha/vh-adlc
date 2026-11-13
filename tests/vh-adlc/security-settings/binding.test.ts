import { afterEach, expect, test } from "bun:test";
import { readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { cliRun, dispose, entry, recordRun, setup, writes } from "./harness";
import { git } from "../maintenance/fixtures";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { readRun } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { renderSecuritySettings } from "../../../plugins/vh-adlc/scripts/security-settings/render";

afterEach(dispose);
const dependabot = { ".github/dependabot.yml": "version: 2\n" };
const satellite = { repository: "example/satellite", role: "independent" };
const keepOff = (settings: string[], repository = "example/project") => ({ security_settings_keep_off: [{ repository, settings, reason: "Owner choice" }] });
type Fixture = ReturnType<typeof setup>;
/** A refused apply makes no write and reports what check reports with the same binding. */
function refused(f: Fixture, extra: Parameters<Fixture["helper"]>[1], reason: string, detail?: string) {
  const applied = f.helper("apply", extra);
  expect(writes(f.calls)).toEqual([]);
  expect(applied.output).toMatchObject({ command: "apply", mode: "check", mode_reason: reason });
  if (detail) expect(applied.output.mode_detail).toBe(detail);
  const { run_id: _, ...checkExtra } = extra ?? {};
  expect(applied.output.entries).toEqual(f.helper("check", checkExtra).output.entries);
  return applied;
}

test("a committed keep-off row leaves the setting off with the configured reason, and an unknown setting fails", () => {
  const f = setup({ files: dependabot }, { settings: { security_settings: "apply", ...keepOff(["secret_scanning"]) } }), { output } = f.helper("apply");
  expect(entry(output, "secret_scanning")).toEqual({ setting: "secret_scanning", state: "left-off", reason: "owner-choice", detail: "Owner choice" });
  expect(writes(f.calls).some(call => call.method === "PATCH")).toBe(false);
  const unknown = setup({}, { settings: { security_settings: "apply", ...keepOff(["code_scanning"]) } });
  expect(() => unknown.helper("apply")).toThrow("security_settings_keep_off settings");
  expect(writes(unknown.calls)).toEqual([]);
});

test("a keep-off row for a setting that is already on is an owner-choice-conflict owner decision", () => {
  const f = setup({ files: dependabot, push_protection: true }, { settings: { security_settings: "apply", ...keepOff(["secret_scanning_push_protection"]) } });
  const { output } = f.helper("apply");
  expect(entry(output, "secret_scanning_push_protection")).toMatchObject({ state: "already-on", reason: "owner-choice-conflict" });
  expect(writes(f.calls).some(call => call.method === "PATCH" && call.body!.includes("push_protection"))).toBe(false);
  expect(renderSecuritySettings([output])).toContain("`secret_scanning_push_protection`: `already-on` (`owner-choice-conflict`)");
});

test.each([
  ["the committed AGENTS.md does not link the settings", { settings: {}, link: false }],
  ["nothing is committed", { settings: null }],
  ["AGENTS.md links a settings file that was never committed", { settings: {}, agentsOnly: true }],
] as const)("check reads a working-tree keep-off row when %s", (_, options) => {
  const f = setup({ push_protection: true }, options);
  f.settings({ schema_version: 1, ...keepOff(["secret_scanning_push_protection"]) });
  const { output } = f.helper("check");
  expect(output.mode_reason).toBeNull();
  expect(entry(output, "secret_scanning_push_protection")).toMatchObject({ state: "already-on", reason: "owner-choice-conflict" });
  expect(renderSecuritySettings([output])).toContain("`secret_scanning_push_protection`: `already-on` (`owner-choice-conflict`)");
});

test("apply reports mode apply with reason adopted when nothing refuses it", () => {
  expect(setup({ files: dependabot }).helper("apply").output).toMatchObject({ mode: "apply", mode_reason: "adopted" });
});

test("committed settings that do not adopt apply refuse it as not-adopted", () => {
  refused(setup({ files: dependabot }, { settings: {} }), {}, "not-adopted");
});

test("a target the committed settings do not name is refused as not-in-committed-scope", () => {
  const f = setup({ repository: "example/satellite", files: dependabot });
  f.settings({ schema_version: 1, security_settings: "apply", repositories: [satellite] });
  const { output } = refused(f, { repository: "example/satellite" }, "not-in-committed-scope");
  expect(output.repository).toBe("example/satellite");
});

test.each([
  ["a read_only run", { security_settings: "apply" }, { authorized_sweep: true, read_only: true }, undefined, "request-restricted", "read_only"],
  ["a run scoped to a pull request", { security_settings: "apply" }, { authorized_sweep: true }, { repositories: ["example/project"], pull: 4 }, "pull-request-scope", undefined],
  ["a read_only run when the settings do not adopt apply", {}, { authorized_sweep: true, read_only: true }, undefined, "request-restricted", "read_only"],
  ["a run without authorized_sweep", { security_settings: "apply" }, { authorized_sweep: false }, undefined, "not-authorized-sweep", undefined],
  ["a run scoped to another repository", { security_settings: "apply", repositories: [satellite] }, { authorized_sweep: true }, { repositories: ["example/satellite"] }, "not-in-run-scope", undefined],
] as const)("apply with %s is refused with the mode reason", (_, settings, request, scope, reason, detail) => {
  const f = setup({ files: dependabot }, { settings });
  const run_id = recordRun(f.root, request, scope ? { ...scope, repositories: [...scope.repositories] } : undefined);
  const { output } = refused(f, { run_id }, reason, detail);
  expect(output.run_id).toBe(run_id);
});

test("apply with a run that does not exist or whose event chain is broken fails naming the run", () => {
  const f = setup({ files: dependabot }), missing = "6f0c2a8e-1b9d-4c3e-8f7a-2d5b6c7e8f90";
  expect(() => f.helper("apply", { run_id: missing })).toThrow(missing);
  const run_id = recordRun(f.root, { authorized_sweep: true }), dir = join(readRun(loadSettings(f.root), run_id).run_dir, "events");
  const [first] = readdirSync(dir).sort(); renameSync(join(dir, first!), join(dir, "0000000003.json"));
  expect(() => f.helper("apply", { run_id })).toThrow(run_id);
  expect(writes(f.calls)).toEqual([]);
});

test("apply fails visibly on a default commit that differs from the tracking tip and on invalid committed settings", () => {
  const f = setup({ files: dependabot });
  expect(() => f.helper("apply", { default_commit: git(f.root, "rev-parse", "HEAD~1") })).toThrow("default commit differs");
  const invalid = setup({ files: dependabot }, { settings: { security_settings: "maybe" } });
  invalid.settings({ schema_version: 1, security_settings: "apply" });
  expect(() => invalid.helper("apply")).toThrow("security_settings");
  expect(writes(f.calls)).toEqual([]); expect(writes(invalid.calls)).toEqual([]);
});

test.each([
  ["no committed AGENTS.md or settings", { settings: null }],
  ["a committed AGENTS.md that does not link the settings", { settings: { security_settings: "apply" }, link: false }],
  ["a committed link to a settings file that was never committed", { settings: { security_settings: "apply" }, agentsOnly: true }],
] as const)("apply never reads adoption from the working tree: %s", (_, options) => {
  const f = setup({ files: dependabot }, options);
  f.settings({ schema_version: 1, security_settings: "apply" });
  refused(f, {}, "not-adopted");
});

test("adoption committed only on a checked-out unmerged branch is not-adopted", () => {
  const f = setup({ files: dependabot }, { settings: {} });
  git(f.root, "switch", "-qc", "feature"); f.settings({ schema_version: 1, security_settings: "apply" });
  git(f.root, "commit", "-qam", "chore: adopt on a branch");
  refused(f, {}, "not-adopted");
});

test("a committed keep-off row still applies when the working tree drops it", () => {
  const f = setup({ files: dependabot }, { settings: { security_settings: "apply", ...keepOff(["secret_scanning"]) } });
  f.settings({ schema_version: 1, security_settings: "apply" });
  const { output } = f.helper("apply");
  expect(output.mode).toBe("apply");
  expect(entry(output, "secret_scanning")).toMatchObject({ state: "left-off", reason: "owner-choice" });
  expect(writes(f.calls).some(call => call.method === "PATCH")).toBe(false);
});

test("check with a binding that does not resolve reports committed-settings-unresolved and still lists entries", () => {
  const f = setup({ files: dependabot }), { output, exit_code } = f.helper("check", { default_commit: git(f.root, "rev-parse", "HEAD~1"), mode_reason: "request-restricted" });
  expect(output).toMatchObject({ mode: "check", mode_reason: "committed-settings-unresolved" });
  expect(output.mode_detail).toContain("default commit differs");
  expect(output.mode_detail).toContain("request-restricted");
  expect(output.entries.length).toBe(4); expect(exit_code).toBe(1);
});

test("check with invalid committed settings uses the working tree's keep-off rows", () => {
  const f = setup({ files: dependabot }, { settings: { security_settings: "maybe" } });
  f.settings({ schema_version: 1, ...keepOff(["secret_scanning"]) });
  const { output } = f.helper("check");
  expect(output).toMatchObject({ mode: "check", mode_reason: "committed-settings-unresolved" });
  expect(output.mode_detail).toContain("security_settings");
  expect(entry(output, "secret_scanning")).toMatchObject({ state: "left-off", reason: "owner-choice" });
});

test("check passes a supplied mode reason through when the helper has none of its own", () => {
  expect(setup({}).helper("check", { mode_reason: "not-adopted" }).output).toMatchObject({ mode: "check", mode_reason: "not-adopted" });
});

const ghe = { settings: { security_settings: "apply", hostname: "ghe.example.com", repository: "example/project" }, host: "ghe.example.com" };
test("on a host other than github.com apply is refused as not-github-com", () => {
  const f = setup({ hostname: "ghe.example.com", files: dependabot }, ghe);
  refused(f, {}, "not-github-com");
  expect(f.calls.every(call => call.hostname === "ghe.example.com")).toBe(true);
});

test("on a host other than github.com private settings get no not-free-on-private reason and no code_scanning entry", () => {
  const f = setup({ hostname: "ghe.example.com", visibility: "private", analysis_null: true, files: dependabot }, ghe), { output } = f.helper("check");
  expect(output.entries.map(item => item.setting)).toEqual(["dependabot_alerts", "dependabot_security_updates", "secret_scanning", "secret_scanning_push_protection"]);
  expect(output.entries.some(item => item.reason === "not-free-on-private")).toBe(false);
  expect(entry(output, "secret_scanning")).toMatchObject({ state: "not-changed", reason: "check-only" });
});

test("every gh call passes --hostname for the settings host even when GH_HOST names another", () => {
  const f = setup({ hostname: "ghe.example.com", files: dependabot }, ghe);
  const result = cliRun(f, ["apply", "--repo", f.root, "--default-branch", "main", "--default-commit", f.commit], { GH_HOST: "github.com" });
  expect(result.code, result.stderr).toBe(1);
  expect(result.calls.length).toBeGreaterThan(0);
  expect(result.calls.every(call => call.hostname === "ghe.example.com" && call.gh_host === "github.com" && call.method === "GET")).toBe(true);
});

test("the CLI exits 2 naming the cause when apply cannot bind", () => {
  const f = setup({ files: dependabot });
  const result = cliRun(f, ["apply", "--repo", f.root, "--default-branch", "main", "--default-commit", git(f.root, "rev-parse", "HEAD~1")]);
  expect(result.code).toBe(2); expect(result.stderr).toContain("default commit differs");
  expect(result.calls).toEqual([]);
});
