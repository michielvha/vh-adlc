// Runs Claude Code headless in an isolated profile for the vh-adlc scenarios.
//
// Each profile is a throwaway CLAUDE_CONFIG_DIR. The owner chose, on 2026-10-18,
// to authenticate it by copying their Claude Code login into that directory for
// the run; the copy is deleted when the run ends. Nothing of the owner's own
// profile (plugins, settings, memory) is read or changed.

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, sep } from "node:path";

export const CLAUDE = process.env.VH_ADLC_CLAUDE ?? join(homedir(), ".local", "bin", "claude");
const OWNER_CREDENTIALS = join(homedir(), ".claude", ".credentials.json");

export type Profile = { config: string; home: string; dispose: () => void };

// profile creates an isolated Claude Code profile whose HOME is the fixture home.
export function profile(home: string): Profile {
  const config = mkdtempSync(join(tmpdir(), "vh-adlc-claude-"));
  if (!existsSync(OWNER_CREDENTIALS)) throw new Error("no Claude Code login to copy into the isolated profile");
  copyFileSync(OWNER_CREDENTIALS, join(config, ".credentials.json"));
  writeFileSync(join(config, "settings.json"), `${JSON.stringify({ includeCoAuthoredBy: false }, null, 2)}\n`);
  mkdirSync(join(config, "projects"), { recursive: true });
  return {
    config,
    home,
    dispose: () => rmSync(config, { recursive: true, force: true }),
  };
}

function env(p: Profile): Record<string, string> {
  return {
    PATH: [join(homedir(), ".bun", "bin"), "/usr/local/bin", "/usr/bin", "/bin"].join(":"),
    HOME: p.home,
    XDG_CACHE_HOME: join(p.home, ".cache"),
    CLAUDE_CONFIG_DIR: p.config,
    GIT_CONFIG_GLOBAL: join(p.home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    LANG: "C.UTF-8",
    TERM: "dumb",
  };
}

export type Turn = {
  result: string;
  sessionId: string;
  isError: boolean;
  turns: number;
  costUsd: number;
  model: string;
  raw: string;
};

export type RunOptions = {
  cwd: string;
  pluginDirs?: string[];
  resume?: string;
  model?: string;
  maxTurns?: number;
  timeoutMs?: number;
};

// claude runs one headless turn and returns its JSON result.
export function claude(p: Profile, prompt: string, o: RunOptions): Turn {
  const args = [CLAUDE, "-p", prompt, "--output-format", "json", "--dangerously-skip-permissions"];
  for (const d of o.pluginDirs ?? []) args.push("--plugin-dir", d);
  if (o.resume) args.push("--resume", o.resume);
  if (o.model) args.push("--model", o.model);
  if (o.maxTurns) args.push("--max-turns", String(o.maxTurns));
  const r = Bun.spawnSync(args, {
    cwd: o.cwd,
    env: env(p),
    stdout: "pipe",
    stderr: "pipe",
    timeout: o.timeoutMs ?? 1_200_000,
  });
  const raw = r.stdout.toString();
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(raw);
  } catch {
    return { result: r.stderr.toString(), sessionId: "", isError: true, turns: 0, costUsd: 0, model: "", raw };
  }
  const usage = (j.modelUsage ?? {}) as Record<string, unknown>;
  return {
    result: String(j.result ?? ""),
    sessionId: String(j.session_id ?? ""),
    isError: Boolean(j.is_error) || r.exitCode !== 0,
    turns: Number(j.num_turns ?? 0),
    costUsd: Number(j.total_cost_usd ?? 0),
    model: Object.keys(usage).join(", "),
    raw,
  };
}

// cli runs a non-interactive claude subcommand, such as plugin install.
export function cli(p: Profile, cwd: string, ...args: string[]) {
  const r = Bun.spawnSync([CLAUDE, ...args], { cwd, env: env(p), stdout: "pipe", stderr: "pipe", timeout: 300_000 });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

export function version(): string {
  const r = Bun.spawnSync([CLAUDE, "--version"], { stdout: "pipe" });
  return r.stdout.toString().trim();
}

export type ToolUse = { name: string; input: Record<string, unknown>; error: boolean; output: string; subagent: boolean };

// toolUses reads every tool call from the profile's session transcripts, subagents included, with
// whether its result was an error. Call it before the profile is disposed.
export function toolUses(p: Profile): ToolUse[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith(".jsonl")) files.push(path);
    }
  };
  walk(join(p.config, "projects"));
  const uses: ToolUse[] = [];
  for (const file of files) {
    const subagent = file.includes(`${sep}subagents${sep}`) || /agent-[^/]*\.jsonl$/.test(file);
    const byId = new Map<string, ToolUse>();
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let entry: { message?: { content?: unknown } };
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === "tool_use") {
          const use = { name: String(block.name), input: (block.input ?? {}) as Record<string, unknown>, error: false, output: "", subagent };
          byId.set(String(block.id), use);
          uses.push(use);
        } else if (block.type === "tool_result") {
          const use = byId.get(String(block.tool_use_id));
          if (!use) continue;
          use.error = Boolean(block.is_error);
          const c = block.content;
          use.output = (typeof c === "string" ? c : Array.isArray(c) ? c.map((x: Record<string, unknown>) => String(x.text ?? "")).join("\n") : "").slice(0, 4000);
        }
      }
    }
  }
  return uses;
}
