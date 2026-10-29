import { readFileSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadSettings } from "./settings";
import { collect } from "./collect";
import { appendRun, canonicalJSON, createRun, digest, readRun } from "./journal";
import { appendReport, renderReport, reserveReport, saveReport } from "./report";
import { compareHistory, parseObservation, readHistory } from "./history";
import { parseReportRequest, reportPermission, resolveStanding } from "./authority";
import { capturePendingOutcome, pendingOutcomes, storeCollection } from "./artifacts";
import { adoptionPreflight } from "./migration";
import { beginCandidate, candidateSnapshot, commitCandidate, promoteOriginal, publicationReadiness, type Candidate } from "./report-candidate";

const commands: Record<string, string[]> = {
  settings: [], collect: ["--repository", "--pull"], start: ["--repository", "--pull", "--request"], resume: ["--run-id"],
  checkpoint: ["--run-id", "--revision", "--digest", "--state", "--kind"],
  report: ["--run-id", "--inventory", "--default-commit", "--default-branch", "--request", "--report-output", "--metadata", "--analysis"],
  append: ["--run-id", "--update", "--request"], history: ["--default-commit", "--observations"],
  authority: ["--run-id", "--default-commit", "--default-branch", "--request", "--later-update"],
  candidate: ["--run-id", "--permission", "--default-commit", "--refresh-of"],
  "candidate-snapshot": ["--run-id", "--step-id"], "commit-candidate": ["--run-id", "--step-id", "--permission", "--checks", "--generated-indexes", "--skip-ci"],
  "promote-report": ["--run-id", "--step-id", "--permission"], "publication-readiness": ["--run-id", "--step-id", "--permission", "--known-blocker"],
  "analysis-input": ["--input"],
  "adoption-preflight": ["--input"],
  "pending-outcome": ["--run-id", "--update", "--request"], "pending-outcomes": ["--run-id"],
  "store-collection": ["--run-id", "--inventory", "--step-id", "--request"],
};
function argumentsFor(argv: string[]) {
  const [operation, ...values] = argv;
  if (!Object.hasOwn(commands, operation)) throw Error("maintenance expects a documented local/GET operation; no remote mutation command is available");
  const args: Record<string, string> = {}, allowed = ["--repo", "--settings", ...commands[operation]];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!allowed.includes(key) || !value || value.startsWith("--") || Object.hasOwn(args, key)) throw Error("maintenance invalid or duplicate argument");
    args[key] = value;
  }
  return { operation, args };
}
function input(path: string | undefined): any {
  if (!path) throw Error("maintenance required input file missing");
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { throw Error("maintenance input must be readable JSON"); }
}
function required(args: Record<string, string>, key: string) { if (!args[key]) throw Error(`maintenance requires ${key}`); return args[key]; }
function number(value: string) { if (!/^(?:0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error("maintenance invalid integer argument"); return Number(value); }
function flag(value: string | undefined) { if (value !== undefined && !["true", "false"].includes(value)) throw Error("maintenance boolean flags take true or false"); return value === "true"; }
export async function main(argv = process.argv.slice(2)) {
  const { operation, args } = argumentsFor(argv), config = loadSettings(args["--repo"] ?? process.cwd(), args["--settings"] ? { settingsPath: args["--settings"] } : {});
  if (operation === "settings") return config;
  if (operation === "adoption-preflight") {
    const result = adoptionPreflight(input(required(args, "--input"))); if (!result.pass) process.exitCode = 1; return result;
  }
  const selected = args["--repository"], pull = args["--pull"] === undefined ? undefined : number(args["--pull"]);
  if (pull === 0) throw Error("maintenance pull must be positive");
  if (operation === "collect") return collect(config, { scope: { repository: selected, pull } });
  if (operation === "start") {
    const request = parseReportRequest(args["--request"] ? input(args["--request"]) : { authorized_sweep: true });
    if (request.no_filesystem === true) return { persisted: false, mode: "chat-only", reason: "current request forbids filesystem writes" };
    const run = createRun(config, { scope: { repositories: selected ? [selected] : [config.repository, ...config.repositories.map(row => row.repository)], ...(pull === undefined ? {} : { pull }) } });
    return appendRun(config, run.header.run_id, run, { ...run.state, request: request as never });
  }
  if (operation === "history") {
    const reports = readHistory(config, required(args, "--default-commit"));
    return args["--observations"] ? compareHistory(input(args["--observations"]), reports) : reports;
  }
  if (operation === "analysis-input") {
    const { exportAnalysisInput } = await import("./analysis-input"); return exportAnalysisInput(config, input(args["--input"]));
  }
  const id = required(args, "--run-id"), run = readRun(config, id);
  if (operation === "resume") return run;
  if (operation === "pending-outcomes") return pendingOutcomes(config, id);
  if (operation === "pending-outcome" || operation === "store-collection") {
    const request = parseReportRequest(args["--request"] ? input(args["--request"]) : run.state.request ?? { authorized_sweep: true });
    if (request.no_filesystem) return { persisted: false, reason: "current request forbids filesystem writes" };
    return operation === "pending-outcome" ? capturePendingOutcome(config, id, input(required(args, "--update"))) : storeCollection(config, id, input(required(args, "--inventory")), required(args, "--step-id"));
  }
  if (operation === "checkpoint") return appendRun(config, id, { revision: number(required(args, "--revision")), digest: required(args, "--digest") }, input(args["--state"]), (args["--kind"] ?? "checkpoint") as never);
  if (operation === "report" || operation === "authority") {
    const request = parseReportRequest(args["--request"] ? input(args["--request"]) : run.state.request ?? { authorized_sweep: true });
    const inventory = operation === "report" ? input(required(args, "--inventory")) : null;
    const branch = args["--default-branch"] ?? inventory?.repositories?.find((row: any) => row.repository === config.repository)?.identity?.default_branch;
    if (typeof branch !== "string") throw Error("maintenance observed default branch required");
    const defaultCommit = required(args, "--default-commit"), standing = resolveStanding(config, { default_branch: branch, default_commit: defaultCommit });
    // Chat-only output must not reserve a filename or append a journal event.
    const relative = typeof run.state.report?.relative_path === "string" ? run.state.report.relative_path : `${config.report_dir === "." ? "" : config.report_dir + "/"}${run.header.created_at.slice(0,10)}-dependency-sweep.md`;
    let authority = reportPermission(config, standing, request, { run_id: id, report_path: relative, later_update: flag(args["--later-update"]) });
    if (operation === "authority") return authority;
    const analysis = args["--analysis"] ? readFileSync(args["--analysis"], "utf8") : undefined;
    const text = renderReport(config, run, inventory, { metadata: args["--metadata"] ? input(args["--metadata"]) : undefined, analysis });
    if (authority.save === "chat") return { saved: false, text, authority };
    if (canonicalJSON(run.state.request) !== canonicalJSON(request)) appendRun(config, id, run, { ...run.state, request: request as never });
    if (run.state.collection?.inventory_digest !== digest(canonicalJSON(inventory))) storeCollection(config, id, inventory, randomUUID());
    const saved = saveReport(config, id, text, { default_commit: defaultCommit, draft: authority.save === "draft" || authority.commit, output: args["--report-output"] });
    const current = readRun(config, id);
    if (authority.save === "checkout" && authority.commit) {
      const path = reserveReport(config, id, defaultCommit); authority = reportPermission(config, standing, request, { run_id: id, report_path: path });
    } else if (typeof current.state.report?.relative_path === "string") authority = reportPermission(config, standing, request, { run_id: id, report_path: current.state.report.relative_path });
    return { saved: true, ...saved, authority, observations: parseObservation(text) };
  }
  if (operation === "append") {
    const request = parseReportRequest(args["--request"] ? input(args["--request"]) : run.state.request ?? { authorized_sweep: true });
    if (request.no_filesystem || (request.read_only || request.draft_only || request.no_commit) && run.state.report?.kind === "checkout-draft") throw Error("maintenance current request requires private outcome capture instead of editing this report");
    return appendReport(config, id, input(required(args, "--update")));
  }
  const authority = args["--permission"] ? input(args["--permission"]) : null;
  if (operation === "candidate") return beginCandidate(config, id, authority, { default_commit: required(args, "--default-commit"), refresh_of: args["--refresh-of"] });
  const step = required(args, "--step-id");
  if (operation === "candidate-snapshot") {
    const row = run.state.operations.find(op => op.kind === "report-candidate" && op.step_id === step);
    if (!row?.candidate) throw Error("maintenance candidate missing"); return { input_digest: candidateSnapshot(row.candidate as unknown as Candidate) };
  }
  if (operation === "publication-readiness") return publicationReadiness(config, id, step, authority, { known_blocker: args["--known-blocker"] });
  if (operation === "commit-candidate" || operation === "promote-report") {
    required(args, "--permission");
    if (canonicalJSON(authority) !== canonicalJSON(run.state.authority) || !authority.commit) throw Error("maintenance current commit permission differs from candidate; reconcile first");
    if (operation === "promote-report") { promoteOriginal(config, id, step); return { promoted: true, step_id: step }; }
    return commitCandidate(config, id, step, { checks: input(required(args, "--checks")), generated_indexes: args["--generated-indexes"] ? input(args["--generated-indexes"]) : undefined, skip_ci: flag(args["--skip-ci"]) });
  }
  throw Error("maintenance unsupported operation");
}
if (import.meta.main) {
  try { writeSync(1, JSON.stringify(await main(), null, 2) + "\n"); }
  catch (error) { const message = error instanceof Error && /^(?:maintenance|invalid maintenance)/.test(error.message) ? error.message : "maintenance command failed; inspect its local inputs and persisted state"; writeSync(2, message + "\n"); process.exitCode = 1; }
}
