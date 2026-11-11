import { committedSecuritySettings, securitySettingsMode, type CommittedSecuritySettings } from "../maintenance/authority";
import { readRun } from "../maintenance/journal";
import { loadSettings, normalizeLogin, repository as repositoryName } from "../maintenance/settings";
import type { SecurityKeepOff, WritableSecuritySetting } from "../maintenance/types";

export type Run = (argv: string[], input?: string) => { code: number; stdout: string; stderr: string };
export type State = "already-on" | "enabled" | "left-off" | "unavailable" | "not-changed" | "unknown";
export type Setting = WritableSecuritySetting | "code_scanning";
export type Entry = { setting: Setting; state: State; reason?: string; detail?: string };
export type Lookup = { status: string; evidence?: string; error?: string };
export type Output = {
  schema_version: 1; repository: string; hostname: string; run_id?: string; command: "check" | "apply"; mode: "check" | "apply";
  mode_reason: string | null; mode_detail?: string; visibility: string | null; archived: boolean | null; admin: boolean | null;
  detection: { renovate: Lookup; dependabot: Lookup }; entries: Entry[];
};
export type Options = {
  command: "check" | "apply"; repo: string; default_branch?: string; default_commit?: string; repository?: string;
  run_id?: string; mode_reason?: string; run?: Run;
};

export const WRITABLE: WritableSecuritySetting[] = ["dependabot_alerts", "dependabot_security_updates", "secret_scanning", "secret_scanning_push_protection"];
export const OWNER_DECISIONS = ["renovate-overlap", "owner-choice-conflict", "paused"];
export const RENOVATE_PATHS = ["renovate.json", "renovate.jsonc", "renovate.json5", ".github/renovate.json", ".github/renovate.jsonc", ".github/renovate.json5",
  ".gitlab/renovate.json", ".gitlab/renovate.jsonc", ".gitlab/renovate.json5", ".renovaterc", ".renovaterc.json", ".renovaterc.jsonc", ".renovaterc.json5"];
const DEPENDABOT_PATHS = [".github/dependabot.yml", ".github/dependabot.yaml"];

const ghRun: Run = (argv, input) => {
  const result = Bun.spawnSync(argv, { stdin: input === undefined ? "ignore" : Buffer.from(input), stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" }, timeout: 60_000 });
  return { code: result.exitCode ?? 1, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
};

type Reply = { ok: true; status: number; body: string } | { ok: false; status: number | null; error: string };
const describe = (reply: Reply) => reply.ok ? `HTTP ${reply.status}` : reply.status ? `HTTP ${reply.status}: ${reply.error}` : reply.error;
function client(run: Run, hostname: string) {
  return (method: string, endpoint: string, options: { body?: unknown; paginate?: boolean } = {}): Reply => {
    const argv = ["gh", "api", "--hostname", hostname, "--method", method, ...(options.paginate ? ["--paginate", "--slurp"] : []),
      ...(options.body === undefined ? [] : ["--input", "-"]), endpoint];
    let result: ReturnType<Run>;
    try { result = run(argv, options.body === undefined ? undefined : JSON.stringify(options.body)); }
    catch (error) { return { ok: false, status: null, error: error instanceof Error ? error.message : "gh failed" }; }
    if (result.code === 0) return { ok: true, status: result.stdout.trim() ? 200 : 204, body: result.stdout };
    const status = /HTTP (\d{3})/.exec(result.stderr)?.[1];
    const message = /gh: (.*?) \(HTTP \d{3}\)/.exec(result.stderr)?.[1] ?? (result.stderr.trim().split("\n")[0] || `gh exited ${result.code}`);
    return { ok: false, status: status ? Number(status) : null, error: message };
  };
}
type Api = ReturnType<typeof client>;
const json = (reply: Reply & { ok: true }): unknown => { try { return JSON.parse(reply.body); } catch { return null; } };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Looks up Renovate, then Dependabot only when Renovate has no signal, as the design's detection section describes. */
function detect(api: Api, base: string, branch: string): { renovate: Lookup; dependabot: Lookup } {
  const ref = `?ref=${encodeURIComponent(branch)}`, failures: string[] = [];
  const file = (path: string): { found: boolean; content?: string } | null => {
    const reply = api("GET", `${base}/contents/${path}${ref}`);
    if (!reply.ok) { if (reply.status === 404) return { found: false }; failures.push(`${path}: ${describe(reply)}`); return null; }
    const body = record(json(reply));
    return { found: true, content: typeof body.content === "string" ? Buffer.from(body.content, "base64").toString("utf8") : undefined };
  };
  const renovate = (): Lookup => {
    for (const path of RENOVATE_PATHS) if (file(path)?.found) return { status: "present", evidence: path };
    const manifest = file("package.json");
    if (manifest?.found) {
      try { if (Object.hasOwn(record(JSON.parse(manifest.content ?? "")), "renovate")) return { status: "present", evidence: "package.json" }; }
      catch { failures.push("package.json: not valid JSON"); }
    }
    const bot = (user: unknown) => { const author = record(user); return author.type === "Bot" && typeof author.login === "string" && normalizeLogin(author.login) === "renovate"; };
    const items = (endpoint: string, label: string) => {
      const reply = api("GET", `${base}/${endpoint}`, { paginate: true });
      if (!reply.ok) { failures.push(`${label}: ${describe(reply)}`); return null; }
      const pages = json(reply);
      if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) { failures.push(`${label}: unexpected response`); return null; }
      return (pages as unknown[][]).flat().map(record);
    };
    const pull = items("pulls?state=all&per_page=100", "pull requests")?.find(item => bot(item.user));
    if (pull) return { status: "present", evidence: `pull request #${pull.number}` };
    const issue = items("issues?state=open&per_page=100", "issues")?.find(item => item.pull_request === undefined && bot(item.user) &&
      typeof item.title === "string" && item.title.includes("Dependency Dashboard"));
    if (issue) return { status: "present", evidence: `issue #${issue.number}` };
    return failures.length ? { status: "failed", error: failures.join("; ") } : { status: "none" };
  };
  const found = renovate();
  if (found.status !== "none") return { renovate: found, dependabot: { status: "not-checked" } };
  for (const path of DEPENDABOT_PATHS) {
    const result = file(path);
    if (!result) return { renovate: found, dependabot: { status: "failed", error: failures.join("; ") } };
    if (result.found) return { renovate: found, dependabot: { status: "configured", evidence: path } };
  }
  return { renovate: found, dependabot: { status: "not-configured" } };
}

type Binding = { mode: "check" | "apply"; mode_reason: string | null; mode_detail?: string; keep_off: SecurityKeepOff[] };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
/**
 * Binds keep-off rows and the mode to the committed, linked default-branch settings. `apply` never falls
 * back to the working tree and throws when the binding, the committed settings or its run cannot be read;
 * `check` falls back to the working tree's keep-off rows and reports why.
 */
function bind(config: ReturnType<typeof loadSettings>, target: string, options: Options): Binding {
  const tree = config.security_settings_keep_off ?? [];
  const observed = options.default_branch !== undefined && options.default_commit !== undefined
    ? { default_branch: options.default_branch, default_commit: options.default_commit } : null;
  if (options.command === "apply") {
    if (!observed) throw Error("apply requires --default-branch and --default-commit");
    let run: ReturnType<typeof readRun> | undefined;
    if (options.run_id !== undefined) {
      try { run = readRun(config, options.run_id); } catch (error) { throw Error(`maintenance run ${options.run_id} cannot be read: ${message(error)}`); }
    }
    const decided = securitySettingsMode(config, target, observed, run ? { request: run.state.request, scope: run.header.scope } : undefined);
    const keep_off = decided.committed.linked ? decided.committed.keep_off : tree;
    return { mode: decided.mode, mode_reason: decided.reason, ...(decided.detail ? { mode_detail: decided.detail } : {}), keep_off };
  }
  const passed = options.mode_reason ?? null;
  if (!observed) return { mode: "check", mode_reason: passed, keep_off: tree };
  let committed: CommittedSecuritySettings;
  try { committed = committedSecuritySettings(config, observed); }
  catch (error) {
    return { mode: "check", mode_reason: "committed-settings-unresolved", mode_detail: message(error) + (passed ? `; passed mode reason: ${passed}` : ""), keep_off: tree };
  }
  return { mode: "check", mode_reason: passed, keep_off: committed.linked ? committed.keep_off : tree };
}

/** Reads, and under apply enables, the free security settings of one repository; see references/security-settings.md. */
export function securitySettings(options: Options): { output: Output; exit_code: 0 | 1 } {
  const config = loadSettings(options.repo), hostname = config.hostname;
  const target = options.repository === undefined ? config.repository : repositoryName(options.repository, "--repository");
  const bound = bind(config, target, options);
  const keepOff: SecurityKeepOff | undefined = bound.keep_off.find(row => row.repository === target);
  const mode = bound.mode;
  const api = client(options.run ?? ghRun, hostname), base = `repos/${target}`, github = hostname === "github.com";
  const output: Output = { schema_version: 1, repository: target, hostname, ...(options.run_id ? { run_id: options.run_id } : {}), command: options.command, mode,
    mode_reason: bound.mode_reason, ...(bound.mode_detail ? { mode_detail: bound.mode_detail } : {}), visibility: null, archived: null, admin: null,
    detection: { renovate: { status: "not-checked" }, dependabot: { status: "not-checked" } }, entries: [] };
  const finish = () => {
    const failed = output.entries.some(item => item.state === "not-changed" || item.state === "unknown" ||
      item.reason === "renovate-detection-failed" || item.reason === "dependabot-detection-failed");
    return { output, exit_code: failed ? 1 as const : 0 as const };
  };

  const repo = api("GET", base);
  if (!repo.ok) { output.entries = WRITABLE.map(setting => ({ setting, state: "unknown", reason: "api-error", detail: describe(repo) })); return finish(); }
  const info = record(json(repo)), analysis = info.security_and_analysis === null ? null : record(info.security_and_analysis);
  const admin = record(info.permissions).admin === true, privateRepo = info.visibility !== "public";
  output.visibility = typeof info.visibility === "string" ? info.visibility : null;
  output.archived = info.archived === true; output.admin = admin;
  const enabled = (name: string) => record(analysis?.[name]).status === "enabled";
  const settings: Setting[] = [...WRITABLE];
  const codeScanningListed = github && privateRepo && !(admin && (enabled("advanced_security") || enabled("code_security")));
  if (codeScanningListed) settings.push("code_scanning");
  const decided = new Map<Setting, Entry>();
  const decide = (setting: Setting, state: State, reason?: string, detail?: string) => {
    if (!decided.has(setting)) decided.set(setting, { setting, state, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) });
  };
  const done = () => { output.entries = settings.map(setting => decided.get(setting)!); return finish(); };

  // Rule 1: archived.
  if (output.archived) { for (const setting of settings) decide(setting, "unavailable", "archived"); return done(); }
  // Rule 2: not free on a private or internal repository on github.com.
  const secrets = ["secret_scanning", "secret_scanning_push_protection"] as const;
  if (github && privateRepo) {
    for (const setting of secrets) if (!(admin && enabled(setting))) decide(setting, "unavailable", "not-free-on-private");
    if (admin && codeScanningListed) decide("code_scanning", "unavailable", "not-free-on-private");
  }
  // Rule 3: not admin.
  if (!admin) { for (const setting of settings) decide(setting, "unknown", "needs-admin"); return done(); }

  // Rule 4: reads of each setting's own state.
  const on = new Map<WritableSecuritySetting, boolean>();
  let paused = false;
  const alertsRead = api("GET", `${base}/vulnerability-alerts`);
  if (alertsRead.ok) on.set("dependabot_alerts", true);
  else if (alertsRead.status === 404) on.set("dependabot_alerts", false);
  else decide("dependabot_alerts", "unknown", "api-error", describe(alertsRead));
  const updatesRead = api("GET", `${base}/automated-security-fixes`);
  if (updatesRead.ok) { const body = record(json(updatesRead)); on.set("dependabot_security_updates", body.enabled === true); paused = body.enabled === true && body.paused === true; }
  else if (updatesRead.status === 404) on.set("dependabot_security_updates", false);
  else decide("dependabot_security_updates", "unknown", "api-error", describe(updatesRead));
  for (const setting of secrets) on.set(setting, enabled(setting));

  // Rule 5: keep-off rows, with the settings that depend on a listed one.
  const listed = new Set(keepOff?.settings ?? []);
  for (const setting of WRITABLE) {
    if (!on.has(setting)) continue;
    if (listed.has(setting)) {
      if (on.get(setting)) decide(setting, "already-on", "owner-choice-conflict", keepOff!.reason);
      else decide(setting, "left-off", "owner-choice", keepOff!.reason);
    }
  }
  if (listed.has("dependabot_alerts") && on.get("dependabot_security_updates") === false) decide("dependabot_security_updates", "left-off", "owner-choice", keepOff!.reason);
  if (listed.has("secret_scanning") && on.get("secret_scanning_push_protection") === false) decide("secret_scanning_push_protection", "left-off", "owner-choice", keepOff!.reason);

  // Rule 6: Renovate and Dependabot for security updates.
  if (!decided.has("dependabot_security_updates")) {
    output.detection = detect(api, base, typeof info.default_branch === "string" ? info.default_branch : "");
    const { renovate, dependabot } = output.detection, isOn = on.get("dependabot_security_updates");
    if (isOn) decide("dependabot_security_updates", "already-on", paused ? "paused" : renovate.status === "present" ? "renovate-overlap" : undefined);
    else if (renovate.status === "present") decide("dependabot_security_updates", "left-off", "renovate-present", renovate.evidence);
    else if (renovate.status === "failed") decide("dependabot_security_updates", "left-off", "renovate-detection-failed", renovate.error);
    else if (dependabot.status === "failed") decide("dependabot_security_updates", "left-off", "dependabot-detection-failed", dependabot.error);
    else if (dependabot.status === "not-configured") decide("dependabot_security_updates", "left-off", "renovate-unknown");
  }
  // Rule 7: already on. Rule 8: check only.
  for (const setting of WRITABLE) if (on.get(setting)) decide(setting, "already-on", setting === "dependabot_security_updates" && paused ? "paused" : undefined);
  if (mode === "check") { for (const setting of WRITABLE) decide(setting, "not-changed", "check-only"); return done(); }

  // Rules 9 and 10: writes, alerts first, each read back.
  const notOn = (write: Reply, read?: Reply) => `${describe(write)}; not on after write${read && !read.ok && read.status !== 404 ? ` (read back ${describe(read)})` : ""}`;
  if (!decided.has("dependabot_alerts")) {
    const write = api("PUT", `${base}/vulnerability-alerts`);
    if (!write.ok) decide("dependabot_alerts", "not-changed", "api-error", describe(write));
    else {
      const read = api("GET", `${base}/vulnerability-alerts`);
      if (read.ok) { on.set("dependabot_alerts", true); decide("dependabot_alerts", "enabled"); }
      else decide("dependabot_alerts", "not-changed", "api-error", notOn(write, read));
    }
  }
  if (!decided.has("dependabot_security_updates")) {
    if (!on.get("dependabot_alerts")) decide("dependabot_security_updates", "not-changed", "alerts-off");
    else {
      const write = api("PUT", `${base}/automated-security-fixes`);
      if (!write.ok) decide("dependabot_security_updates", "not-changed", "api-error", describe(write));
      else {
        const read = api("GET", `${base}/automated-security-fixes`);
        if (read.ok && record(json(read)).enabled === true) decide("dependabot_security_updates", "enabled");
        else decide("dependabot_security_updates", "not-changed", "api-error", notOn(write, read));
      }
    }
  }
  const pending = secrets.filter(setting => !decided.has(setting));
  if (pending.length) {
    const write = api("PATCH", base, { body: { security_and_analysis: Object.fromEntries(pending.map(setting => [setting, { status: "enabled" }])) } });
    if (!write.ok) for (const setting of pending) decide(setting, "not-changed", "api-error", describe(write));
    else {
      const read = api("GET", base), after = read.ok ? record(record(json(read)).security_and_analysis) : {};
      for (const setting of pending) {
        if (record(after[setting]).status === "enabled") decide(setting, "enabled");
        else decide(setting, "not-changed", "api-error", notOn(write, read));
      }
    }
  }
  return done();
}
