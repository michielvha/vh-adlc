// Which vh-adlc plugin this session runs, and whether the host has installed a different one since.
// A host keeps the plugin a session started with, so after an update a long-running session still
// resolves its old scripts and binary lock. The host's install record is read when one exists
// (Claude Code: plugins/installed_plugins.json in its config directory); hosts without one report only
// the running version.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type PluginStatus = { running: string; installed?: string; stale: boolean; warning?: string;
  path_binary?: string; locked_binary?: string; binary_warning?: string };

/** A `vh-adlc` on PATH at another version than the plugin's lock: operations must use the locked binary. */
function pathBinary(): Pick<PluginStatus, "path_binary" | "locked_binary" | "binary_warning"> {
  const found = Bun.which("vh-adlc");
  if (!found) return {};
  const locked = JSON.parse(readFileSync(resolve(import.meta.dir, "../../vh-adlc.lock.json"), "utf8")).version as string;
  const run = Bun.spawnSync([found, "--version"], { stdout: "pipe", stderr: "ignore" });
  const version = /(\d+\.\d+\.\d+\S*)/.exec(run.stdout.toString())?.[1] ?? "unknown";
  if (version === locked) return { path_binary: version, locked_binary: locked };
  return { path_binary: version, locked_binary: locked,
    binary_warning: `vh-adlc on PATH (${found}) is ${version}, not the locked ${locked}; run the binary scripts/ensure-vh-adlc.sh prints, never the one on PATH` };
}

/** The install that applies to `repo`: a project-scope install for it (or a directory holding it), else the user install. */
function installedFor(entries: { scope?: string; version?: string; projectPath?: string }[], repo: string): string | undefined {
  const holds = (path?: string) => !!path && (repo === path || repo.startsWith(path.replace(/\/+$/, "") + "/"));
  const project = entries.filter(entry => entry.scope === "project" && holds(entry.projectPath))
    .sort((a, b) => (b.projectPath?.length ?? 0) - (a.projectPath?.length ?? 0))[0];
  const chosen = project ?? entries.find(entry => entry.scope === "user") ?? entries.find(entry => entry.scope !== "project");
  return typeof chosen?.version === "string" ? chosen.version : undefined;
}

export function pluginStatus(repo: string): PluginStatus {
  const running = JSON.parse(readFileSync(resolve(import.meta.dir, "../../plugin.json"), "utf8")).version as string;
  let installed: string | undefined;
  try {
    const config = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
    const record = JSON.parse(readFileSync(join(config, "plugins", "installed_plugins.json"), "utf8"));
    const plugins = (record.plugins ?? record) as Record<string, unknown[]>;
    const entries = Object.entries(plugins).find(([key]) => key.startsWith("vh-adlc@"))?.[1] ?? [];
    installed = installedFor(entries as { scope?: string; version?: string; projectPath?: string }[], repo);
  } catch { /* no install record on this host */ }
  const binary = pathBinary();
  if (installed === undefined) return { running, stale: false, ...binary };
  if (installed === running) return { running, installed, stale: false, ...binary };
  return { running, installed, stale: true,
    warning: `this session runs vh-adlc ${running} but ${installed} is installed; restart the session to load it before continuing`, ...binary };
}
