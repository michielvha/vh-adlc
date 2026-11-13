import { expect, test } from "bun:test";

function runtime() {
  const worker = { executable: "/owned/client/copilot", client: { provider: "copilot" }, profile_directory: "/owned/profiles/worker",
    model: "opus", argv: ["--no-auto-update", "--reasoning-effort", "high"] };
  return { component: { directory: "/owned/component" }, loader: { provider: "copilot" as const, argv: ["--plugin-dir", "/owned/component"],
    credential_references: ["COPILOT_GITHUB_TOKEN"] }, worker, reviewer: { ...worker, profile_directory: "/owned/profiles/reviewer" } };
}

test("native role launch uses the selected executable/component/profile/model with a fresh independent context", async () => {
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
  expect(reviewer.context_id).not.toBe(worker.context_id); expect(worker.env.COPILOT_HOME).toBe(selected.worker.profile_directory);
  expect(reviewer.env.COPILOT_HOME).toBe(selected.reviewer.profile_directory); expect(worker.env.HOME).toBe(selected.worker.profile_directory);
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
  expect(() => buildCopilotRoleInvocation({ runtime: selected, role: "worker", cwd: "/owned/source", artifact_root: "/owned/artifacts", prompt: "Bounded prompt", environment: {} })).toThrow("setup required");
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
    prompt: fault === "empty-prompt" ? "" : fault === "oversize-prompt" ? "x".repeat(65537) : "Bounded prompt", environment: {} })).toThrow("setup required");
});
