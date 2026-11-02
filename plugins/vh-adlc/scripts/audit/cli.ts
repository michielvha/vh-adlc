#!/usr/bin/env bun
import { readFileSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { publishJSON } from "../maintenance/journal";
import { loadSettings } from "./settings";
import { inventory } from "./inventory";
import { captureSnapshot, privateDirectory, type Snapshot } from "./snapshot";
import { evaluateAssessments } from "./assessment";
import { saveReport } from "./report";
import { inspectAuthority, inspectCandidatePolicy, inspectAdoptedPolicy } from "./authority";
import { createLedgerCandidate, applyLedgerCandidate, appendFindings } from "./ledger";
import { checkBatch } from "./batch";
import { createRun, intent, noteResource, readRun } from "./journal";
import type { AuditMode } from "./types";

const argumentsByOperation: Record<string, string[]> = {
  settings: [], status: [], inventory: [], snapshot: ["mode", "ids", "artifact-root", "baseline", "scope-baseline", "requirements", "name"],
  check: ["snapshot", "input"], report: ["snapshot", "input", "name"], candidate: ["snapshot", "input", "run-id", "date", "name", "new-findings", "provisional"],
  "new-findings": ["snapshot", "input", "name"], apply: ["snapshot", "input", "candidate", "request", "path", "commit"],
  "policy-candidate": ["default-branch", "commit", "parity"], "policy-adopted": [], authority: ["input"], "batch-check": ["input"],
  "journal-new": ["artifact-root", "run-id", "batch-digest"], "journal-read": ["directory", "batch-digest"],
  "journal-intent": ["directory", "batch-digest", "input"], "journal-resource": ["directory", "batch-digest", "action-id", "resource-id"],
};
export function runCLI(argv: string[]) {
  const [operation, ...args] = argv, supported = argumentsByOperation[operation];
  if (!supported) throw Error("unknown audit helper operation");
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    if (!args[i].startsWith("--") || !["repo", ...supported].includes(key) || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith("--")) throw Error("invalid audit helper options");
    options[key] = args[i + 1];
  }
  const requireOption = (key: string) => { if (!options[key]) throw Error("missing audit helper option: " + key); return options[key]; };
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const config = loadSettings(resolve(options.repo ?? process.cwd()));
  const snapshot = () => json(requireOption("snapshot")) as Snapshot;
  const save = (root: string, value: unknown) => {
    privateDirectory(root, config.root);
    const name = requireOption("name"); if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(name)) throw Error("invalid audit artifact name");
    const path = join(root, name + ".json"); publishJSON(path, value); return { path };
  };
  if (operation === "settings") return config;
  if (["status", "inventory"].includes(operation)) return inventory(config);
  if (operation === "snapshot") {
    const value = captureSnapshot(config, { mode: requireOption("mode") as AuditMode, ids: options.ids?.split(","),
      artifact_root: requireOption("artifact-root"), baseline: options.baseline, scope_baseline: options["scope-baseline"],
      required_checks: options.requirements ? json(options.requirements) : undefined });
    return save(value.artifact_root, value);
  }
  if (operation === "check") { const snap = snapshot(); return evaluateAssessments(config, snap, json(requireOption("input"))); }
  if (operation === "report") { const snap = snapshot(); return { path: saveReport(config, snap, requireOption("name"), options.input ? json(options.input) : undefined) }; }
  if (operation === "candidate") {
    if (options.provisional !== undefined && options.provisional !== "true") throw Error("audit provisional candidate flag must be true when supplied");
    const snap = snapshot(), value = createLedgerCandidate(config, snap, { document: json(requireOption("input")),
      at: requireOption("date"), run_id: requireOption("run-id"), new_findings: options["new-findings"] ? json(options["new-findings"]) : undefined,
      provisional: options.provisional === "true" });
    return save(snap.artifact_root, value);
  }
  if (operation === "new-findings") { const snap = snapshot(); return save(snap.artifact_root, appendFindings(config, snap, json(requireOption("input")))); }
  if (operation === "apply") {
    if (!["true", "false"].includes(requireOption("commit"))) throw Error("commit must be explicitly true or false");
    return applyLedgerCandidate(config, snapshot(), json(requireOption("candidate")), json(requireOption("input")), {
      path: requireOption("path"), commit: options.commit === "true", request: json(requireOption("request")),
    });
  }
  if (operation === "policy-candidate") return inspectCandidatePolicy(config, { default_branch: requireOption("default-branch"), commit: requireOption("commit"), parity_path: options.parity });
  if (operation === "policy-adopted") return inspectAdoptedPolicy(config);
  if (operation === "authority") return inspectAuthority(config, json(requireOption("input")));
  if (operation === "batch-check") return checkBatch(config, json(requireOption("input")));
  if (operation === "journal-new") { const run = createRun(config, { artifact_root: requireOption("artifact-root"), run_id: requireOption("run-id"), batch_digest: requireOption("batch-digest") }); return { directory: run.directory, revision: run.revision }; }
  const run = readRun(config, requireOption("directory"), requireOption("batch-digest"));
  if (operation === "journal-intent") intent(run, json(requireOption("input")));
  if (operation === "journal-resource") noteResource(run, requireOption("action-id"), requireOption("resource-id"));
  return { header: run.header, events: run.events, revision: run.revision, directory: run.directory };
}
if (import.meta.main) {
  try {
    const result = runCLI(process.argv.slice(2));
    writeSync(1, JSON.stringify(result, null, 2) + "\n");
    if (result && typeof result === "object" && (("pass" in result && !result.pass) || ("valid" in result && !result.valid) || ("allowed" in result && !result.allowed && !("valid" in result)))) process.exitCode = 1;
  } catch (error) {
    // Never print user data or arbitrary JSON-parser/source contents in an error.
    const safe = error instanceof Error && /^(audit |invalid audit |unknown audit |missing audit |commit must)/.test(error.message) ? error.message : "audit helper could not validate its inputs";
    writeSync(2, safe + "\n"); process.exitCode = 1;
  }
}
