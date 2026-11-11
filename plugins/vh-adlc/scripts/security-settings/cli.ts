#!/usr/bin/env bun
import { writeSync } from "node:fs";
import { parseArgs } from "node:util";
import { securitySettings } from "./security-settings";
import { renderSecuritySettings } from "./render";

const usage = "usage: cli.ts check --repo PATH [--default-branch BRANCH --default-commit SHA] [--repository OWNER/NAME] [--run-id ID] [--mode-reason TEXT] [--format json|markdown]\n       cli.ts apply --repo PATH --default-branch BRANCH --default-commit SHA [--repository OWNER/NAME] [--run-id ID] [--format json|markdown]";

try {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: {
    repo: { type: "string" }, "default-branch": { type: "string" }, "default-commit": { type: "string" }, repository: { type: "string" },
    "run-id": { type: "string" }, "mode-reason": { type: "string" }, format: { type: "string" },
  } });
  const command = positionals[0];
  if (positionals.length !== 1 || (command !== "check" && command !== "apply")) throw new Error(usage);
  if (command === "apply" && values["mode-reason"] !== undefined) throw new Error("apply does not accept --mode-reason");
  if (!values.repo) throw new Error(`${command} requires --repo PATH`);
  if ((values["default-branch"] === undefined) !== (values["default-commit"] === undefined)) throw new Error("--default-branch and --default-commit go together");
  if (command === "apply" && values["default-branch"] === undefined) throw new Error("apply requires --default-branch and --default-commit");
  const format = values.format ?? "json";
  if (format !== "json" && format !== "markdown") throw new Error("--format takes json or markdown");
  const { output, exit_code } = securitySettings({ command, repo: values.repo, default_branch: values["default-branch"], default_commit: values["default-commit"],
    repository: values.repository, run_id: values["run-id"], mode_reason: values["mode-reason"] });
  writeSync(1, format === "json" ? JSON.stringify(output, null, 2) + "\n" : renderSecuritySettings([output]));
  process.exitCode = exit_code;
} catch (error) {
  writeSync(2, (error instanceof Error ? error.message : "security settings command failed") + "\n");
  process.exitCode = 2;
}
