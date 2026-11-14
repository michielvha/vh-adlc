#!/usr/bin/env bun
// Labels helper: plan compares a repository with the standard label set; apply makes only approved writes.
import { existsSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { parseArgs } from "node:util";
import { origin } from "../triage/settings";
import { apply } from "./apply";
import { LabelsGitHub } from "./github";
import { buildPlan } from "./plan";

const USAGE = "usage: cli.ts plan --repo PATH --output FILE | apply --repo PATH --plan FILE --approved-digest SHA256";
try {
  const parsed = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: {
    repo: { type: "string", default: "." }, output: { type: "string" }, plan: { type: "string" }, "approved-digest": { type: "string" },
  } });
  const mode = parsed.positionals[0];
  if (parsed.positionals.length !== 1 || !["plan", "apply"].includes(mode)) throw new Error(USAGE);
  const root = Bun.spawnSync(["git", "-C", parsed.values.repo, "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
  if (root.exitCode !== 0) throw new Error("repository checkout unavailable");
  const checkout = root.stdout.toString().trim();
  const gh = new LabelsGitHub(origin(checkout).hostname);
  if (mode === "apply") {
    if (!parsed.values.plan || !parsed.values["approved-digest"] || parsed.values.output) throw new Error(USAGE);
    const receipt = apply(checkout, gh, readFileSync(parsed.values.plan, "utf8"), parsed.values["approved-digest"]);
    writeSync(1, JSON.stringify(receipt, null, 2) + "\n");
    if (!receipt.complete) process.exitCode = 1;
  } else {
    if (parsed.values.plan || parsed.values["approved-digest"]) throw new Error("plan accepts no approval");
    if (!parsed.values.output) throw new Error("plan needs a new --output file");
    if (existsSync(parsed.values.output)) throw new Error("plan output already exists; choose a new file");
    const { plan, text, digest } = buildPlan(checkout, gh);
    writeFileSync(parsed.values.output, text, { flag: "wx" });
    const count = (status: string) => plan.standard.filter((entry) => entry.status === status).length;
    writeSync(1, JSON.stringify({ repository: plan.repository, actor: plan.actor, output: parsed.values.output, digest,
      present: count("present"), missing: count("missing"), different: count("different"), unmanaged: plan.unmanaged.length,
      writes: plan.writes, note: "Review every write before approving this exact digest. Nothing has been written." }, null, 2) + "\n");
  }
} catch (error) {
  writeSync(2, (error instanceof Error ? error.message : "labels command failed") + "\n");
  process.exitCode = 1;
}
