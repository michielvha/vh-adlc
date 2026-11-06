#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { GitHub } from "./github";
import { collect, render } from "./inventory";
import { loadSettings } from "./settings";

try {
  const parsed = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: { repo: { type: "string", default: "." }, json: { type: "boolean", default: false } } });
  if (parsed.positionals.length > 1 || ![undefined, "inventory"].includes(parsed.positionals[0])) throw new Error("usage: cli.ts inventory --repo PATH [--json]");
  const root = Bun.spawnSync(["git", "-C", parsed.values.repo, "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
  if (root.exitCode !== 0) throw new Error("repository checkout unavailable");
  const settings = loadSettings(root.stdout.toString().trim());
  const result = collect(settings, new GitHub(settings.page_budget));
  process.stdout.write(parsed.values.json ? JSON.stringify(result, null, 2) + "\n" : render(result));
  if (!result.complete) process.exitCode = 1;
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : "Projects command failed") + "\n");
  process.exitCode = 1;
}
