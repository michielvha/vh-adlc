import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import type { InstalledRuntime } from "./bootstrap";
import { freezeJSON } from "./protocol";

type Runtime = InstalledRuntime;
type SelectedRole = Pick<Runtime["worker"], "executable" | "model" | "argv"> & { client: { provider: string } };
type LaunchRuntime = { component: { directory: string }; worker: SelectedRole; reviewer: SelectedRole; authentication: "native";
  loader: Pick<Runtime["loader"], "provider" | "argv" | "credential_references"> };
const fixed = new Set(["--no-auto-update", "--no-custom-instructions", "--disable-builtin-mcps", "--no-ask-user", "--disallow-temp-dir"]);
const tuning = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const copilotCredentials = new Set(["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]);
const claudeCredentials = new Set(["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]);
const credentials = new Set([...copilotCredentials, ...claudeCredentials]);
const inherited = ["PATH", "LANG", "LC_ALL", "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "all_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS"];
const authenticationPaths = ["HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"];
function fail(reason: string): never { throw Error("docs-drift native role setup required: " + reason); }
function absolute(value: unknown) { return typeof value === "string" && isAbsolute(value) && !value.includes("\0"); }

export function nativeCredentialReferences(provider: string, references: readonly string[]): string[] {
  const selected = provider === "claude" ? claudeCredentials : provider === "copilot" ? copilotCredentials : null;
  if (!selected) fail("unsupported selected native backend");
  return references.filter(name => selected.has(name));
}

function roleArguments(argv: string[]): string[] {
  const result: string[] = [], seen = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (fixed.has(value)) continue;
    if (value !== "--reasoning-effort" || seen.has(value) || !tuning.has(argv[index + 1])) fail("unsupported protected role argv");
    seen.add(value); result.push(value, argv[++index]);
  }
  return result;
}

type LaunchOptions = {
  runtime: LaunchRuntime; role: "worker" | "reviewer"; cwd: string; artifact_root: string; prompt: string;
  environment: Record<string, string | undefined>;
};

function prepareRole(input: LaunchOptions, provider: "copilot" | "claude") {
  const options = structuredClone(input), runtime = options.runtime, selected = runtime[options.role];
  if (!selected || runtime.loader.provider !== runtime.worker.client.provider || selected.client.provider !== provider) fail("unsupported selected native backend");
  if (runtime.authentication !== "native") fail("ordinary native authentication required");
  if (![options.cwd, options.artifact_root, runtime.component.directory, selected.executable,
    options.environment.HOME].every(absolute)
    || typeof selected.model !== "string" || !selected.model.trim() || selected.model.includes("\0")
    || typeof options.prompt !== "string" || !options.prompt.trim() || options.prompt.includes("\0") || Buffer.byteLength(options.prompt) > 65536)
    fail("bounded paths, model and prompt required");
  if (runtime.loader.argv.length !== 2 || runtime.loader.argv[0] !== "--plugin-dir" || runtime.loader.argv[1] !== runtime.component.directory)
    fail("unsupported protected component loader argv");
  if (runtime.loader.credential_references.some(name => !credentials.has(name))
    || new Set(runtime.loader.credential_references).size !== runtime.loader.credential_references.length) fail("unsupported native credential reference");
  const context = randomUUID();
  const env: Record<string, string> = {};
  const nativePaths = [...authenticationPaths, ...(provider === "claude" ? ["CLAUDE_CONFIG_DIR"] : ["COPILOT_HOME", "COPILOT_CACHE_HOME"])];
  for (const key of [...inherited, ...nativePaths, ...nativeCredentialReferences(provider, runtime.loader.credential_references)]) {
    const value = options.environment[key];
    if (value !== undefined) {
      if (typeof value !== "string" || value.includes("\0")) fail("invalid native environment value");
      env[key] = value;
    }
  }
  Object.assign(env, {
    TMPDIR: options.artifact_root,
    GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "", GIT_CONFIG_KEY_1: "http.extraHeader", GIT_CONFIG_VALUE_1: "" });
  return { options, runtime, selected, context, env };
}

/** Build invocation data from a selected runtime; selection, origin and effect permission remain separate. */
export function buildCopilotRoleInvocation(input: LaunchOptions) {
  const { options, runtime, selected, context, env } = prepareRole(input, "copilot");
  const args = roleArguments(selected.argv);
  Object.assign(env, { COPILOT_AUTO_UPDATE: "false", COPILOT_PLUGIN_DIR_ONLY: "1" });
  const tools = options.role === "reviewer" ? "view,grep,glob" : "view,grep,glob,bash,create,edit";
  const argv = [selected.executable, "--no-auto-update", "--no-custom-instructions", "--disable-builtin-mcps", "--no-ask-user", "--disallow-temp-dir",
    "--sync-session=off", "--session-id", context, "--model", selected.model, ...runtime.loader.argv, ...args,
    "--available-tools", tools, "--allow-tool", "read", ...(options.role === "worker" ? ["--allow-tool", "write", "--allow-tool", "shell"] : []),
    "--add-dir", options.artifact_root, "--output-format", "json", "--stream", "on", "--log-dir", join(options.artifact_root, "native-role-logs-" + context),
    "--prompt", options.prompt];
  return freezeJSON({ authority: "none" as const, provider: "copilot", context_id: context, argv, cwd: options.cwd, env });
}

export function buildClaudeRoleInvocation(input: LaunchOptions) {
  const { options, runtime, selected, context, env } = prepareRole(input, "claude");
  const args: string[] = [];
  for (let index = 0; index < selected.argv.length; index += 2) {
    if (index !== 0 || selected.argv[index] !== "--effort" || !["low", "medium", "high", "xhigh", "max"].includes(selected.argv[index + 1]))
      fail("unsupported protected Claude role argv");
    args.push(selected.argv[index], selected.argv[index + 1]);
  }
  Object.assign(env, { DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" });
  const tools = options.role === "reviewer" ? "Read,Glob,Grep" : "Read,Glob,Grep,Bash,Write,Edit";
  // Invocation-scoped settings exclude ambient hooks while preserving the selected auth location.
  const argv = [selected.executable, "--print", "--verbose", "--output-format", "stream-json",
    "--session-id", context, "--no-session-persistence", "--model", selected.model, ...args,
    "--setting-sources", "", "--settings", JSON.stringify({ disableAllHooks: true }),
    "--strict-mcp-config", "--mcp-config", JSON.stringify({ mcpServers: {} }), "--no-chrome",
    ...runtime.loader.argv, "--tools", tools, "--allowedTools", tools, "--permission-mode", "dontAsk",
    "--add-dir", options.artifact_root, "--", options.prompt];
  return freezeJSON({ authority: "none" as const, provider: "claude", context_id: context, argv, cwd: options.cwd, env });
}

export function buildNativeRoleInvocation(input: LaunchOptions) {
  const provider = input.runtime[input.role]?.client.provider;
  if (provider === "copilot") return buildCopilotRoleInvocation(input);
  if (provider === "claude") return buildClaudeRoleInvocation(input);
  fail("unsupported selected native backend");
}
