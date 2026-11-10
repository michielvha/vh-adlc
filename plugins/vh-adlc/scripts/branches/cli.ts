#!/usr/bin/env bun
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import { parseArgs } from "node:util";
import { afterMerge, apply, digest, observe } from "./branches";

const usage = "usage: cli.ts plan --repo PATH --output FILE [--repository OWNER/NAME] [--worktrees true|false]\n       cli.ts apply --repo PATH --plan FILE --approved-digest SHA256\n       cli.ts after-merge --repo PATH --pull NUMBER [--repository OWNER/NAME] [--worktrees true|false]";
const flag = (value: string | undefined) => {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("--worktrees takes true or false");
};

try {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: {
    repo: { type: "string", default: "." }, repository: { type: "string" }, worktrees: { type: "string" },
    output: { type: "string" }, plan: { type: "string" }, "approved-digest": { type: "string" }, pull: { type: "string" },
  } });
  const mode = positionals[0];
  if (positionals.length !== 1 || !["plan", "apply", "after-merge"].includes(mode!)) throw new Error(usage);
  const allowed: Record<string, string[]> = { plan: ["repo", "repository", "worktrees", "output"], apply: ["repo", "plan", "approved-digest"], "after-merge": ["repo", "repository", "worktrees", "pull"] };
  const extra = Object.keys(values).filter(key => values[key as keyof typeof values] !== undefined && !allowed[mode!]!.includes(key));
  if (extra.length) throw new Error(`${mode} does not accept --${extra.join(", --")}`);
  const options = { repo: values.repo!, repository: values.repository, worktrees: flag(values.worktrees) };
  let result: { complete?: boolean };
  if (mode === "plan") {
    if (!values.output) throw new Error("plan requires --output FILE");
    const { plan } = observe(options), text = JSON.stringify(plan, null, 2) + "\n";
    writeFileSync(values.output, text, { mode: 0o600 });
    result = { ...plan, plan_path: values.output, digest: digest(text), note: "Review every operation, then approve this exact digest to apply it." } as never;
  } else if (mode === "apply") {
    if (!values.plan || !values["approved-digest"]) throw new Error("apply requires --plan FILE and --approved-digest SHA256");
    result = apply({ repo: options.repo }, readFileSync(values.plan, "utf8"), values["approved-digest"]);
  } else {
    if (!values.pull || !/^[1-9]\d*$/.test(values.pull)) throw new Error("after-merge requires --pull NUMBER");
    result = afterMerge(options, Number(values.pull));
  }
  writeSync(1, JSON.stringify(result, null, 2) + "\n");
  if (result.complete === false) process.exitCode = 1;
} catch (error) {
  writeSync(2, (error instanceof Error ? error.message : "branch command failed") + "\n");
  process.exitCode = 2;
}
