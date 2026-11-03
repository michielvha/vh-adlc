#!/usr/bin/env bun
// Audit entry is cache-only. Online setup is an explicit separate invocation.
import { join, resolve } from "node:path";
import { loadSettings, requireKnowledgePages, settingsFailure } from "./settings";

export function auditBootstrap(repo: string, pin: string, options: { setup?: boolean; requiredPages?: string[] } = {}) {
  if (!/^[a-f0-9]{40}$/.test(pin)) throw Error("audit bootstrap requires the full plugin docs pin");
  const ensured = Bun.spawnSync(["bash", join(import.meta.dir, "../ensure-vh-adlc.sh"), ...(options.setup ? [] : ["--offline"])], { stdout: "pipe", stderr: "pipe" });
  if (ensured.exitCode !== 0) return { ready: false, phase: "binary", reason: "settings-reader-unavailable", message: "Run explicit setup for the locked verified binary; audit entry cannot download it." };
  let config;
  try {
    config = loadSettings(resolve(repo));
    requireKnowledgePages(config, options.requiredPages ?? []);
  } catch (error) {
    return { ready: false, phase: "settings", reason: settingsFailure(error, "audit-setup-required"), message: error instanceof Error ? error.message : "Audit settings setup failed." };
  }
  const binary = ensured.stdout.toString().trim(), pages = config.knowledge_pages;
  const argv = [binary, "knowledge", ...(options.setup ? [] : ["--offline"]), "--repo", config.root, "--plugin-pin", pin, ...pages.flatMap(page => ["--page", page])];
  const run = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
  let knowledge: unknown;
  try { knowledge = JSON.parse(run.stdout.toString()); } catch { return { ready: false, phase: "knowledge", reason: "knowledge-report-unavailable" }; }
  const result = knowledge && typeof knowledge === "object" ? knowledge as Record<string, unknown> : undefined;
  return { ready: run.exitCode === 0 && result?.result === "answered", phase: "knowledge", pages, binary, argv, knowledge, setup: !!options.setup };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2), requiredPages: string[] = [];
    let repo: string | undefined, pin: string | undefined, setup = false, offline = false;
    for (let i = 0; i < args.length; i++) {
      const name = args[i];
      if (name === "--setup" && !setup) { setup = true; continue; }
      if (name === "--offline" && !offline) { offline = true; continue; }
      if (!["--repo", "--plugin-pin", "--required-page"].includes(name) || !args[i + 1] || args[i + 1].startsWith("--")) throw Error("invalid audit bootstrap options");
      const value = args[++i];
      if (name === "--required-page") requiredPages.push(value);
      else if (name === "--repo" && repo === undefined) repo = value;
      else if (name === "--plugin-pin" && pin === undefined) pin = value;
      else throw Error("duplicate audit bootstrap option");
    }
    if (!repo || !pin || setup && offline || !setup && requiredPages.length) throw Error("explicit setup and offline entry are separate; supply repo and plugin pin");
    const result = auditBootstrap(repo, pin, { setup, requiredPages });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  } catch { console.log(JSON.stringify({ ready: false, phase: "options", reason: "invalid-audit-bootstrap-options" })); process.exitCode = 1; }
}
