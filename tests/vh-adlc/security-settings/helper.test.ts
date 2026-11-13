import { afterEach, expect, test } from "bun:test";
import { adminOnly, cliRun, dispose, entry, setup, writes } from "./harness";
import type { FakeState } from "./fake-gh";
import { renderSecuritySettings } from "../../../plugins/vh-adlc/scripts/security-settings/render";
import type { Output } from "../../../plugins/vh-adlc/scripts/security-settings/security-settings";

afterEach(dispose);
const dependabot = { ".github/dependabot.yml": "version: 2\n" };
const bot = (login: string) => ({ login, type: "Bot" });
const allOn = { alerts: true, updates: { enabled: true, paused: false }, secret_scanning: true, push_protection: true };
const states = (output: Output) => Object.fromEntries(output.entries.map(item => [item.setting, [item.state, item.reason ?? null]]));
const writable = ["dependabot_alerts", "dependabot_security_updates", "secret_scanning", "secret_scanning_push_protection"];

test("apply on a public admin repository with dependabot.yml and no Renovate enables each setting once", () => {
  const f = setup({ files: dependabot }), { output, exit_code } = f.helper("apply");
  expect(states(output)).toEqual({ dependabot_alerts: ["enabled", null], dependabot_security_updates: ["enabled", null], secret_scanning: ["enabled", null], secret_scanning_push_protection: ["enabled", null] });
  expect(writes(f.calls).map(call => `${call.method} ${call.endpoint}`)).toEqual(["PUT repos/example/project/vulnerability-alerts", "PUT repos/example/project/automated-security-fixes", "PATCH repos/example/project"]);
  expect(JSON.parse(writes(f.calls)[2]!.body!)).toEqual({ security_and_analysis: { secret_scanning: { status: "enabled" }, secret_scanning_push_protection: { status: "enabled" } } });
  expect(f.calls.some(call => call.endpoint.includes("code-scanning"))).toBe(false);
  expect(output.entries.some(item => item.setting === "code_scanning")).toBe(false);
  expect(f.fake).toMatchObject({ alerts: true, updates: { enabled: true }, secret_scanning: true, push_protection: true });
  expect(exit_code).toBe(0);
});

test("without a Dependabot config or a Renovate signal security updates stay off as renovate-unknown", () => {
  const f = setup(), { output, exit_code } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "left-off", reason: "renovate-unknown" });
  expect(writes(f.calls).some(call => call.endpoint.endsWith("automated-security-fixes"))).toBe(false);
  expect(exit_code).toBe(0);
});

test("dependabot.yaml counts, and lookups use the target's own default branch", () => {
  expect(entry(setup({ files: { ".github/dependabot.yaml": "version: 2\n" } }).helper("apply").output, "dependabot_security_updates")).toMatchObject({ state: "enabled" });
  const f = setup({ default_branch: "master", files: dependabot }), { output } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "enabled" });
  expect(f.calls.filter(call => call.endpoint.includes("/contents/")).every(call => call.endpoint.endsWith("?ref=master"))).toBe(true);
});

const renovateFiles = ["renovate.json", "renovate.jsonc", "renovate.json5", ".github/renovate.json", ".github/renovate.jsonc", ".github/renovate.json5",
  ".gitlab/renovate.json", ".gitlab/renovate.jsonc", ".gitlab/renovate.json5", ".renovaterc", ".renovaterc.json", ".renovaterc.jsonc", ".renovaterc.json5"];
test.each(renovateFiles)("a Renovate config at %s keeps security updates off as renovate-present", path => {
  const f = setup({ files: { ...dependabot, [path]: "{}\n" } }), { output } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "left-off", reason: "renovate-present", detail: path });
  expect(writes(f.calls).some(call => call.endpoint.endsWith("automated-security-fixes"))).toBe(false);
});

test.each([
  ["a renovate key in package.json", { files: { ...dependabot, "package.json": JSON.stringify({ name: "x", renovate: { extends: ["config:recommended"] } }) } }, "package.json"],
  ["a Renovate pull request", { files: dependabot, pulls: [{ number: 24, user: bot("renovate[bot]") }] }, "pull request #24"],
  ["an open Dependency Dashboard issue", { files: dependabot, issues: [{ number: 3, title: "Dependency Dashboard", user: bot("renovate[bot]") }] }, "issue #3"],
] as [string, Partial<FakeState>, string][])("%s keeps security updates off as renovate-present", (_, fakeState, evidence) => {
  const f = setup(fakeState), { output } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "left-off", reason: "renovate-present", detail: evidence });
  expect(writes(f.calls).some(call => call.endpoint.endsWith("automated-security-fixes"))).toBe(false);
});

test("look-alike Renovate signals do not match", () => {
  const f = setup({ files: { ...dependabot, "package.json": JSON.stringify({ name: "x" }) },
    pulls: [{ number: 1, user: { login: "renovate", type: "User" } }, { number: 2, user: bot("renovate-other[bot]") }],
    issues: [{ number: 3, title: "Dependency Dashboard", user: bot("renovate[bot]"), pull_request: {} }, { number: 4, title: "Other", user: bot("renovate[bot]") }] });
  expect(entry(f.helper("apply").output, "dependabot_security_updates")).toMatchObject({ state: "enabled" });
});

test.each(["private", "internal"] as const)("a %s repository enables alerts only and lists the paid features as not-free-on-private", visibility => {
  const f = setup({ visibility, analysis_null: true, files: dependabot }), { output } = f.helper("apply");
  expect(states(output)).toEqual({ dependabot_alerts: ["enabled", null], dependabot_security_updates: ["enabled", null], secret_scanning: ["unavailable", "not-free-on-private"],
    secret_scanning_push_protection: ["unavailable", "not-free-on-private"], code_scanning: ["unavailable", "not-free-on-private"] });
  expect(writes(f.calls).map(call => `${call.method} ${call.endpoint}`)).toEqual(["PUT repos/example/project/vulnerability-alerts", "PUT repos/example/project/automated-security-fixes"]);
});

test("a private repository with code_security enabled has no code_scanning entry", () => {
  const { output } = setup({ visibility: "private", code_security: true, files: dependabot }).helper("apply");
  expect(output.entries.some(item => item.setting === "code_scanning")).toBe(false);
});

test("an archived repository gets no write and every entry unavailable as archived", () => {
  const f = setup({ archived: true }), { output, exit_code } = f.helper("apply");
  expect(writes(f.calls)).toEqual([]);
  expect(output.entries.map(item => [item.state, item.reason])).toEqual(writable.map(() => ["unavailable", "archived"]));
  expect(exit_code).toBe(0);
});

test("without admin, apply writes nothing, reads nothing admin-only and reports needs-admin", () => {
  const f = setup({ admin: false }), { output, exit_code } = f.helper("apply");
  expect(writes(f.calls)).toEqual([]); expect(adminOnly(f.calls)).toEqual([]);
  expect(output.entries.map(item => [item.state, item.reason])).toEqual(writable.map(() => ["unknown", "needs-admin"]));
  expect(exit_code).toBe(1);
});

test("check writes nothing and lists every off and free setting as check-only", () => {
  const f = setup({ files: dependabot }), { output, exit_code } = f.helper("check");
  expect(writes(f.calls)).toEqual([]);
  expect(output.entries.map(item => [item.state, item.reason])).toEqual(writable.map(() => ["not-changed", "check-only"]));
  expect(output.mode).toBe("check");
  expect(exit_code).toBe(1);
});

test("a second apply after a clean first run writes nothing", () => {
  const f = setup({ files: dependabot, pulls: [] });
  expect(f.helper("apply").exit_code).toBe(0);
  const before = writes(f.calls).length, { output, exit_code } = f.helper("apply");
  expect(writes(f.calls).length).toBe(before);
  expect(output.entries.every(item => ["already-on", "left-off", "unavailable"].includes(item.state))).toBe(true);
  expect(exit_code).toBe(0);
  const failed = setup({ files: dependabot, fail: [{ method: "GET", path: "repos/example/project/pulls", status: 500 }] });
  expect(failed.helper("apply").exit_code).toBe(1);
});

test.each([
  ["every Renovate lookup fails", [{ method: "GET", path: "repos/example/project/contents/*", status: 500 }, { method: "GET", path: "repos/example/project/pulls", status: 500 }, { method: "GET", path: "repos/example/project/issues", status: 500 }], "renovate-detection-failed"],
  ["only the renovate.json lookup fails", [{ method: "GET", path: "repos/example/project/contents/renovate.json", status: 500 }], "renovate-detection-failed"],
  ["the dependabot.yml lookup fails", [{ method: "GET", path: "repos/example/project/contents/.github/dependabot.yml", status: 500 }], "dependabot-detection-failed"],
] as const)("when %s, security updates stay off with the failure and the helper exits 1", (_, fail, reason) => {
  const f = setup({ files: dependabot, fail: [...fail] }), { output, exit_code } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "left-off", reason });
  expect(entry(output, "dependabot_security_updates")!.detail).toContain("500");
  expect(writes(f.calls).some(call => call.endpoint.endsWith("automated-security-fixes"))).toBe(false);
  expect(exit_code).toBe(1);
});

test("a failed write is api-error with its status and the other settings are still processed", () => {
  const f = setup({ files: dependabot, fail: [{ method: "PATCH", path: "repos/example/project", status: 422 }] }), { output, exit_code } = f.helper("apply");
  expect(states(output)).toMatchObject({ dependabot_alerts: ["enabled", null], dependabot_security_updates: ["enabled", null], secret_scanning: ["not-changed", "api-error"], secret_scanning_push_protection: ["not-changed", "api-error"] });
  expect(entry(output, "secret_scanning")!.detail).toContain("422");
  expect(exit_code).toBe(1);
});

test("a write that succeeds but does not read back on is api-error, not on after write", () => {
  const f = setup({ files: dependabot, noop: ["PUT automated-security-fixes"] }), { output, exit_code } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "not-changed", reason: "api-error" });
  expect(entry(output, "dependabot_security_updates")!.detail).toContain("204");
  expect(entry(output, "dependabot_security_updates")!.detail).toContain("not on after write");
  expect(exit_code).toBe(1);
});

test("markdown prints one row per JSON entry and the owner decisions", () => {
  for (const f of [setup({ files: dependabot }), setup({ ...allOn, files: { "renovate.json": "{}" } })]) {
    const { output } = f.helper("apply"), text = renderSecuritySettings([output]);
    expect(text).toStartWith("## Repository security settings\n");
    for (const item of output.entries) expect(text).toContain(`| \`${item.setting}\` | \`${item.state}\` | ${item.reason ? `\`${item.reason}\`` : ""}`);
    const decisions = text.slice(text.indexOf("Owner decisions"));
    const expected = output.entries.filter(item => ["renovate-overlap", "owner-choice-conflict", "paused"].includes(item.reason ?? ""));
    expect(decisions.split("\n").filter(line => line.startsWith("- ")).length).toBe(expected.length);
    if (!expected.length) expect(decisions).toContain("None.");
  }
});

test("when alerts do not read back on, security updates are not written and are alerts-off", () => {
  const f = setup({ files: dependabot, fail: [{ method: "PUT", path: "repos/example/project/vulnerability-alerts", status: 403 }] }), { output, exit_code } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "not-changed", reason: "alerts-off" });
  expect(writes(f.calls).some(call => call.endpoint.endsWith("automated-security-fixes"))).toBe(false);
  expect(exit_code).toBe(1);
});

test("Renovate with security updates already on is a renovate-overlap owner decision", () => {
  const f = setup({ ...allOn, files: { "renovate.json": "{}" } }), { output, exit_code } = f.helper("apply");
  expect(writes(f.calls)).toEqual([]);
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "already-on", reason: "renovate-overlap" });
  expect(renderSecuritySettings([output])).toContain("`dependabot_security_updates`: `already-on` (`renovate-overlap`)");
  expect(exit_code).toBe(0);
});

test("a failed read of a setting is unknown with api-error, even when kept off, and no write is made for it", () => {
  for (const settings of [{ security_settings: "apply" }, { security_settings: "apply", security_settings_keep_off: [{ repository: "example/project", settings: ["dependabot_security_updates"], reason: "Owner choice" }] }]) {
    const f = setup({ files: dependabot, fail: [{ method: "GET", path: "repos/example/project/automated-security-fixes", status: 500 }] }, { settings });
    const { output, exit_code } = f.helper("apply");
    expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "unknown", reason: "api-error" });
    expect(entry(output, "dependabot_security_updates")!.detail).toContain("500");
    expect(writes(f.calls).some(call => call.endpoint.endsWith("automated-security-fixes"))).toBe(false);
    expect(entry(output, "dependabot_alerts")).toMatchObject({ state: "enabled" });
    expect(exit_code).toBe(1);
  }
});

test("a 404 from either setting read and enabled false from automated-security-fixes read as off", () => {
  const missing = setup({ files: dependabot, alerts: false }), first = missing.helper("apply");
  expect(entry(first.output, "dependabot_alerts")).toMatchObject({ state: "enabled" });
  const updates404 = setup({ files: dependabot, alerts: true, fail: [{ method: "GET", path: "repos/example/project/automated-security-fixes", status: 404 }] });
  expect(entry(updates404.helper("apply").output, "dependabot_security_updates")).toMatchObject({ state: "not-changed", reason: "api-error", detail: expect.stringContaining("not on after write") });
  expect(writes(updates404.calls).some(call => call.endpoint.endsWith("automated-security-fixes"))).toBe(true);
  const disabled = setup({ files: dependabot, alerts: true, updates: { enabled: false, paused: false } }), third = disabled.helper("apply");
  expect(entry(third.output, "dependabot_security_updates")).toMatchObject({ state: "enabled" });
  expect(third.exit_code).toBe(0);
});

test("rule order decides archived, private and non-admin combinations", () => {
  const archived = setup({ archived: true, admin: false, visibility: "private" }), first = archived.helper("apply");
  expect(first.output.entries.every(item => item.state === "unavailable" && item.reason === "archived")).toBe(true);
  expect(adminOnly(archived.calls)).toEqual([]); expect(first.exit_code).toBe(0);
  const kept = setup({ visibility: "private", analysis_null: true }, { settings: { security_settings: "apply", security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"], reason: "Owner choice" }] } });
  expect(entry(kept.helper("apply").output, "secret_scanning")).toMatchObject({ state: "unavailable", reason: "not-free-on-private" });
  const viewer = setup({ visibility: "private", admin: false }), { output } = viewer.helper("apply");
  expect(states(output)).toEqual({ dependabot_alerts: ["unknown", "needs-admin"], dependabot_security_updates: ["unknown", "needs-admin"], secret_scanning: ["unavailable", "not-free-on-private"],
    secret_scanning_push_protection: ["unavailable", "not-free-on-private"], code_scanning: ["unknown", "needs-admin"] });
  expect(entry(setup({ files: dependabot }).helper("check").output, "dependabot_security_updates")).toMatchObject({ state: "not-changed", reason: "check-only" });
});

test("keep-off rows for alerts and for secret scanning also hold their dependent settings", () => {
  const alerts = setup({ files: dependabot, secret_scanning: true, push_protection: true }, { settings: { security_settings: "apply", security_settings_keep_off: [{ repository: "example/project", settings: ["dependabot_alerts"], reason: "Owner choice" }] } });
  const first = alerts.helper("apply");
  expect(states(first.output)).toMatchObject({ dependabot_alerts: ["left-off", "owner-choice"], dependabot_security_updates: ["left-off", "owner-choice"] });
  expect(entry(first.output, "dependabot_alerts")!.detail).toBe("Owner choice");
  expect(writes(alerts.calls)).toEqual([]); expect(first.exit_code).toBe(0);
  const secrets = setup({ files: dependabot }, { settings: { security_settings: "apply", security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"], reason: "Owner choice" }] } });
  expect(states(secrets.helper("apply").output)).toMatchObject({ secret_scanning: ["left-off", "owner-choice"], secret_scanning_push_protection: ["left-off", "owner-choice"] });
  expect(writes(secrets.calls).some(call => call.method === "PATCH")).toBe(false);
});

test("a failed repository read makes every writable entry unknown and nothing else is called", () => {
  const f = setup({ fail: [{ method: "GET", path: "repos/example/project", status: 500 }] }), { output, exit_code } = f.helper("apply");
  expect(output.entries.map(item => [item.setting, item.state, item.reason])).toEqual(writable.map(name => [name, "unknown", "api-error"]));
  expect(output.entries.every(item => item.detail?.includes("500"))).toBe(true);
  expect(f.calls.length).toBe(1); expect(exit_code).toBe(1);
});

test.each([
  ["dependabot.yml and no Renovate", { files: dependabot }, {}, "paused"],
  ["renovate.json", { files: { "renovate.json": "{}" } }, {}, "paused"],
  ["a keep-off row", { files: dependabot }, { settings: { security_settings: "apply", security_settings_keep_off: [{ repository: "example/project", settings: ["dependabot_security_updates"], reason: "Owner choice" }] } }, "owner-choice-conflict"],
] as const)("paused security updates with %s are already-on and go to the owner", (_, extra, options, reason) => {
  const f = setup({ ...allOn, updates: { enabled: true, paused: true }, ...extra }, options), { output, exit_code } = f.helper("apply");
  expect(entry(output, "dependabot_security_updates")).toMatchObject({ state: "already-on", reason });
  expect(writes(f.calls)).toEqual([]); expect(exit_code).toBe(0);
  expect(renderSecuritySettings([output])).toContain(`\`dependabot_security_updates\`: \`already-on\` (\`${reason}\`)`);
});

test("the CLI prints JSON or markdown and exits 0 or 1 by the entries", () => {
  const f = setup({ files: dependabot });
  const checked = cliRun(f, ["check", "--repo", f.root, "--default-branch", "main", "--default-commit", f.commit]);
  expect(checked.code).toBe(1); expect((JSON.parse(checked.stdout) as Output).entries.length).toBe(4);
  const applied = cliRun(f, ["apply", "--repo", f.root, "--default-branch", "main", "--default-commit", f.commit, "--format", "markdown"]);
  expect(applied.code, applied.stderr).toBe(0); expect(applied.stdout).toStartWith("## Repository security settings\n");
  expect(applied.calls.every(call => call.hostname === "github.com")).toBe(true);
});
