#!/usr/bin/env bun
import { readFileSync, writeSync } from "node:fs";
import { apply, digest, parsePlan } from "./apply";
import { parseArgs } from "node:util";
import { GitHub } from "./github";
import { collect, render } from "./inventory";
import { loadSettings } from "./settings";

try {
  const parsed = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: { repo: { type: "string", default: "." }, json: { type: "boolean", default: false }, batch: { type: "string" }, "approved-digest": { type: "string" } } });
  if (parsed.positionals.length > 1 || ![undefined, "inventory", "plan", "apply"].includes(parsed.positionals[0])) throw new Error("usage: cli.ts inventory|plan|apply --repo PATH [--json] [--batch FILE] [--approved-digest SHA256]");
  const root = Bun.spawnSync(["git", "-C", parsed.values.repo, "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
  if (root.exitCode !== 0) throw new Error("repository checkout unavailable");
  const settings = loadSettings(root.stdout.toString().trim());
  const mode = parsed.positionals[0] ?? "inventory";
  if (mode === "inventory") {
    if (parsed.values.batch || parsed.values["approved-digest"]) throw new Error("inventory accepts no batch or approval");
    const result = collect(settings, new GitHub(settings.page_budget));
    writeSync(1, parsed.values.json ? JSON.stringify(result, null, 2) + "\n" : render(result));
    if (!result.complete) process.exitCode = 1;
  } else {
    if (!parsed.values.batch) throw new Error("batch file is required");
    const text = readFileSync(parsed.values.batch, "utf8");
    const plan = parsePlan(settings, text);
    if (mode === "plan") {
      if (parsed.values["approved-digest"]) throw new Error("plan does not apply approval");
      writeSync(1, JSON.stringify({ plan, digest: digest(text), note: "Review every operation before approving this exact digest. Field writes have a read/write race." }, null, 2) + "\n");
    } else {
      const receipt = apply(settings, new GitHub(settings.page_budget), text, parsed.values["approved-digest"] ?? "");
      writeSync(1, JSON.stringify(receipt, null, 2) + "\n");
      if (!receipt.complete) process.exitCode = 1;
    }
  }
} catch (error) {
  writeSync(2, (error instanceof Error ? error.message : "Projects command failed") + "\n");
  process.exitCode = 1;
}
