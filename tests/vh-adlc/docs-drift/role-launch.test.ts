import { expect, test } from "bun:test";

function runtime() {
  const worker = { executable: "/owned/client/copilot", client: { provider: "copilot" },
    model: "opus", argv: ["--no-auto-update", "--reasoning-effort", "high"] };
  return { authentication: "native" as const, component: { directory: "/owned/component" }, loader: { provider: "copilot" as const, argv: ["--plugin-dir", "/owned/component"],
    credential_references: ["COPILOT_GITHUB_TOKEN"] }, worker, reviewer: { ...worker } };
}

test.each(["copilot", "claude"] as const)("ordinary %s launch preserves the existing native authentication locations", async provider => {
  const { buildNativeRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = runtime();
  const worker = { ...selected.worker, client: { provider }, argv: [] };
  const environment = { HOME: "/owner", XDG_CONFIG_HOME: "/owner/config", XDG_CACHE_HOME: "/owner/cache", XDG_STATE_HOME: "/owner/state",
    COPILOT_HOME: "/owner/copilot", COPILOT_CACHE_HOME: "/owner/copilot-cache", CLAUDE_CONFIG_DIR: "/owner/claude",
    NODE_OPTIONS: "--require=/ambient/injection", CLAUDE_CODE_SESSION_ID: "ambient", COPILOT_AGENT_SESSION_ID: "ambient" };
  const invocation = buildNativeRoleInvocation({ runtime: { ...selected, authentication: "native", worker,
    loader: { ...selected.loader, provider, credential_references: [] } }, role: "worker", cwd: "/owned/source",
    artifact_root: "/owned/artifacts", prompt: "Bounded source review", environment });
  expect(invocation.env.HOME).toBe(environment.HOME);
  expect(invocation.env.XDG_CONFIG_HOME).toBe(environment.XDG_CONFIG_HOME);
  expect(invocation.env.XDG_CACHE_HOME).toBe(environment.XDG_CACHE_HOME);
  expect(invocation.env.XDG_STATE_HOME).toBe(environment.XDG_STATE_HOME);
  if (provider === "claude") expect(invocation.env.CLAUDE_CONFIG_DIR).toBe(environment.CLAUDE_CONFIG_DIR);
  else {
    expect(invocation.env.COPILOT_HOME).toBe(environment.COPILOT_HOME);
    expect(invocation.env.COPILOT_CACHE_HOME).toBe(environment.COPILOT_CACHE_HOME);
  }
  expect(invocation.env.NODE_OPTIONS).toBeUndefined();
  expect(invocation.env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
  expect(invocation.env.COPILOT_AGENT_SESSION_ID).toBeUndefined();
  expect(environment.HOME).toBe("/owner");
});

test("native role launch uses the selected executable/component/model with a fresh independent context", async () => {
  const { buildCopilotRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = runtime(), environment = { PATH: "/owned/tools:/usr/bin:/bin", HOME: "/ambient", COPILOT_HOME: "/ambient/copilot",
    COPILOT_GITHUB_TOKEN: "synthetic-selected-credential", GH_TOKEN: "synthetic-unselected-credential", NODE_OPTIONS: "--require=/ambient/code",
    COPILOT_AGENT_SESSION_ID: "ambient-session", HTTPS_PROXY: "http://proxy.invalid:8080" };
  const options = { runtime: selected, role: "worker" as "worker" | "reviewer", cwd: "/owned/source", artifact_root: "/owned/artifacts",
    prompt: "Read the exact original inputs; no publication is permitted.", environment };
  const worker = buildCopilotRoleInvocation(options), reviewer = buildCopilotRoleInvocation({ ...options, role: "reviewer" });
  expect(worker.authority).toBe("none"); expect(worker.argv[0]).toBe(selected.worker.executable);
  expect(worker.argv[worker.argv.indexOf("--model") + 1]).toBe("opus");
  expect(worker.argv[worker.argv.indexOf("--plugin-dir") + 1]).toBe(selected.component.directory);
  expect(worker.argv[worker.argv.indexOf("--session-id") + 1]).toBe(worker.context_id);
  expect(reviewer.context_id).not.toBe(worker.context_id); expect(worker.env.COPILOT_HOME).toBe(environment.COPILOT_HOME);
  expect(reviewer.env.COPILOT_HOME).toBe(environment.COPILOT_HOME); expect(worker.env.HOME).toBe(environment.HOME);
  expect(worker.env.COPILOT_GITHUB_TOKEN).toBe("synthetic-selected-credential"); expect(worker.env.GH_TOKEN).toBeUndefined();
  expect(worker.env.NODE_OPTIONS).toBeUndefined(); expect(worker.env.COPILOT_AGENT_SESSION_ID).toBeUndefined();
  expect(worker.env.COPILOT_AUTO_UPDATE).toBe("false"); expect(worker.env.COPILOT_PLUGIN_DIR_ONLY).toBe("1");
  expect(worker.env.HTTPS_PROXY).toBe(environment.HTTPS_PROXY); expect(worker.env.GIT_CONFIG_GLOBAL).toBe("/dev/null");
  expect(worker.argv).toContain("--no-custom-instructions"); expect(worker.argv).toContain("--disable-builtin-mcps");
  expect(worker.argv[worker.argv.indexOf("--available-tools") + 1]).toContain("bash");
  expect(reviewer.argv[reviewer.argv.indexOf("--available-tools") + 1]).toBe("view,grep,glob");
  expect(worker.argv).not.toContain("--allow-all"); expect(worker.argv.at(-1)).toBe(options.prompt);
  expect(JSON.stringify(worker.argv)).not.toContain("synthetic-selected-credential");
  expect(selected).toEqual(runtime()); expect(environment.HOME).toBe("/ambient");
});

test.each(["--resume", "--continue", "--session-id=old", "-r", "-p", "--model=other", "--available-tools=bash", "--allow-all", "--agent=ambient", "--additional-mcp-config={}", "--connect", "--", "-C", "unknown-subcommand"])("unsupported protected role argv cannot replace fresh bound launch: %s", async argument => {
  const { buildCopilotRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = runtime(); selected.worker.argv = [argument];
  expect(() => buildCopilotRoleInvocation({ runtime: selected, role: "worker", cwd: "/owned/source", artifact_root: "/owned/artifacts", prompt: "Bounded prompt", environment: { HOME: "/owner" } })).toThrow("setup required");
});

test.each(["backend", "loader-path", "loader-extra", "credential-override", "relative-executable", "empty-prompt", "oversize-prompt", "invalid-tuning"])("native role launch fails explicit setup rather than selecting an alternate: %s", async fault => {
  const { buildCopilotRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = runtime();
  if (fault === "backend") selected.worker.client.provider = "claude";
  if (fault === "loader-path") selected.loader.argv[1] = "/ambient/plugin";
  if (fault === "loader-extra") selected.loader.argv.push("--plugin-dir", "/ambient/plugin");
  if (fault === "credential-override") selected.loader.credential_references.push("COPILOT_HOME");
  if (fault === "relative-executable") selected.worker.executable = "copilot";
  if (fault === "invalid-tuning") selected.worker.argv = ["--reasoning-effort", "--resume"];
  expect(() => buildCopilotRoleInvocation({ runtime: selected, role: "worker", cwd: "/owned/source", artifact_root: "/owned/artifacts",
    prompt: fault === "empty-prompt" ? "" : fault === "oversize-prompt" ? "x".repeat(65537) : "Bounded prompt", environment: { HOME: "/owner" } })).toThrow("setup required");
});

test("the generic native launcher preserves Claude scanning and an independent Copilot reviewer", async () => {
  const { buildNativeRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = { ...runtime(), loader: { ...runtime().loader, provider: "claude" as const } };
  selected.loader.credential_references = ["CLAUDE_CODE_OAUTH_TOKEN", "COPILOT_GITHUB_TOKEN"];
  selected.worker = { ...selected.worker, executable: "/owned/client/claude", client: { provider: "claude" }, argv: ["--effort", "high"] };
  const input = { runtime: selected, role: "worker" as const, cwd: "/owned/source", artifact_root: "/owned/artifacts",
    prompt: "Read the exact selected source.", environment: { PATH: "/usr/bin:/bin", HOME: "/ambient",
      CLAUDE_CODE_OAUTH_TOKEN: "synthetic-oauth", COPILOT_GITHUB_TOKEN: "synthetic-copilot", ANTHROPIC_API_KEY: "synthetic-unselected-key",
      CLAUDE_CONFIG_DIR: "/ambient/claude", CLAUDE_CODE_SESSION_ID: "ambient", NODE_OPTIONS: "--require=/ambient/injection" } };
  const worker = buildNativeRoleInvocation(input), reviewer = buildNativeRoleInvocation({ ...input, role: "reviewer" });
  expect(worker.provider).toBe("claude"); expect(worker.argv[0]).toBe("/owned/client/claude");
  expect(worker.argv).toContain("--no-session-persistence"); expect(worker.argv).toContain("--strict-mcp-config");
  expect(worker.argv).not.toContain("--bare"); expect(worker.argv).not.toContain("--dangerously-skip-permissions");
  expect(worker.argv[worker.argv.indexOf("--session-id") + 1]).toBe(worker.context_id);
  expect(worker.argv[worker.argv.indexOf("--output-format") + 1]).toBe("stream-json");
  expect(worker.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("synthetic-oauth"); expect(worker.env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(worker.env.COPILOT_GITHUB_TOKEN).toBeUndefined(); expect(worker.env.NODE_OPTIONS).toBeUndefined();
  expect(worker.env.CLAUDE_CODE_SESSION_ID).toBeUndefined(); expect(worker.env.CLAUDE_CONFIG_DIR).toBe(input.environment.CLAUDE_CONFIG_DIR);
  expect(worker.env.DISABLE_AUTOUPDATER).toBe("1"); expect(worker.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
  expect(reviewer.provider).toBe("copilot"); expect(reviewer.context_id).not.toBe(worker.context_id);
  expect(reviewer.env.COPILOT_GITHUB_TOKEN).toBe("synthetic-copilot"); expect(reviewer.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
});

test.each(["--resume", "--bare", "--fallback-model", "--session-id", "--dangerously-skip-permissions", "--tools", "--setting-sources"])("Claude launch refuses protected argv override %s", async option => {
  const { buildClaudeRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = runtime(), worker = { ...selected.worker, client: { provider: "claude" }, argv: [option] };
  expect(() => buildClaudeRoleInvocation({ runtime: { ...selected, loader: { ...selected.loader, provider: "claude", credential_references: ["CLAUDE_CODE_OAUTH_TOKEN"] }, worker },
    role: "worker", cwd: "/owned/source", artifact_root: "/owned/artifacts", prompt: "Bounded source review", environment: { HOME: "/owner" } })).toThrow("unsupported protected Claude role argv");
});

test("a Claude reviewer receives only read tools and the explicitly selected API credential", async () => {
  const { buildClaudeRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = runtime(), worker = { ...selected.worker, client: { provider: "claude" }, argv: ["--effort", "high"] };
  const result = buildClaudeRoleInvocation({ runtime: { ...selected, loader: { ...selected.loader, provider: "claude", credential_references: ["ANTHROPIC_API_KEY"] }, worker, reviewer: worker },
    role: "reviewer", cwd: "/owned/source", artifact_root: "/owned/artifacts", prompt: "Bounded source review",
    environment: { HOME: "/owner", ANTHROPIC_API_KEY: "synthetic-api", CLAUDE_CODE_OAUTH_TOKEN: "synthetic-unselected-oauth" } });
  expect(result.argv[result.argv.indexOf("--tools") + 1]).toBe("Read,Glob,Grep");
  expect(result.argv[result.argv.indexOf("--allowedTools") + 1]).toBe("Read,Glob,Grep");
  expect(result.env.ANTHROPIC_API_KEY).toBe("synthetic-api"); expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(JSON.stringify(result.argv)).not.toContain("synthetic-api");
  expect(result.argv[result.argv.indexOf("--setting-sources") + 1]).toBe("");
  expect(JSON.parse(result.argv[result.argv.indexOf("--settings") + 1])).toEqual({ disableAllHooks: true });
});

test("Claude forwards the documented xhigh effort and refuses an undocumented value", async () => {
  const { buildClaudeRoleInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-launch");
  const selected = runtime(), worker = { ...selected.worker, client: { provider: "claude" }, argv: ["--effort", "xhigh"] };
  const input = { runtime: { ...selected, loader: { ...selected.loader, provider: "claude" as const, credential_references: [] }, worker },
    role: "worker" as const, cwd: "/owned/source", artifact_root: "/owned/artifacts", prompt: "Bounded source review", environment: { HOME: "/owner" } };
  const result = buildClaudeRoleInvocation(input);
  expect(result.argv[result.argv.indexOf("--effort") + 1]).toBe("xhigh");
  worker.argv = ["--effort", "undocumented"];
  expect(() => buildClaudeRoleInvocation(input)).toThrow("unsupported protected Claude role argv");
});
