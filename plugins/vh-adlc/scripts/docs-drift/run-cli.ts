import { randomUUID } from "node:crypto";
import { existsSync, realpathSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRunDirectory, readRunDirectory, appendRunStage, RUN_COMMANDS, type RunDirectory } from "./run-directory";
import { assessSource, readSourceAssessmentArtifacts } from "./source-assessment";
import { inspectInstalledPayload } from "./bootstrap";
import { verifyProductionPreflight } from "./preflight";
import { loadCommittedSettings } from "./settings";
import { publishArtifact } from "./journal";
import { canonicalJSON, sha256 } from "./protocol";

type Outcome = "collected" | "pending" | "setup-required" | "incomplete";
type Report = {
  schema_version: 1; authority: "none"; command: string; outcome: Outcome; run_directory: string;
  source_commit?: string; stage?: string; summary?: string; counts?: { findings: number };
  diagnostics: string[];
  component?: ReturnType<typeof componentForRun>;
};
function optionsFor(argv: string[]) {
  const command = RUN_COMMANDS.find(command => command === argv[0]);
  if (!command) throw Error("Select scan, report, resolve, prepare, verify, publish, resume or close.");
  const options = new Map<string, string>(), proposals: number[] = [];
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index], value = argv[index + 1];
    if (!["--repo", "--run-dir", "--source", "--entry", "--proposal", "--action"].includes(name)
      || !value || value.startsWith("--") || options.has(name)) throw Error("Unknown, duplicate or incomplete run option.");
    if (name === "--proposal") {
      if (!/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(Number(value))) throw Error("Select exact positive proposal numbers.");
      proposals.push(Number(value));
    } else options.set(name, value);
  }
  const repo = options.get("--repo"), directory = options.get("--run-dir");
  if (!repo || !directory) throw Error("Select --repo and --run-dir.");
  const source = options.get("--source"), action = options.get("--action");
  if (source !== undefined && !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source)) throw Error("Select a full immutable source commit.");
  if (action !== undefined && command !== "resume") throw Error("Recovery actions belong to resume.");
  if (action !== undefined && !["inspect", "restore", "reconcile", "acknowledge", "retire-receipt"].includes(action))
    throw Error("Select a supported resume action.");
  if (proposals.length && command !== "resolve" && command !== "close") throw Error("Proposal selection belongs to resolve or close.");
  return { command, repo: realpathSync(repo), directory: resolve(directory), source,
    entry: options.get("--entry"), proposals, action: action ?? "inspect" };
}
function latestArtifact(run: RunDirectory, name: string) {
  return run.stages.findLast(stage => Object.hasOwn(stage.artifacts, name))?.artifacts[name];
}

function componentForRun(repo: string, source: string) {
  const settings = loadCommittedSettings(repo, source).settings;
  if (settings.schema_version !== 2) throw Error("Ordinary settings version 2 required.");
  const expected = settings.component;
  if (!expected) return { matched: false, expected, diagnostics: ["Select a released component binding before provider execution or publication."] };
  try {
    inspectInstalledPayload({ directory: resolve(import.meta.dir, "../.."), expected });
    return { matched: true, expected, diagnostics: [] as string[] };
  } catch {
    return { matched: false, expected, diagnostics: ["The selected component differs from this installed payload. Static scan/report remain available."] };
  }
}

/** Public run-directory entry. Domain stages keep their existing review, ownership and authority checks. */
export async function runDirectoryMain(argv: string[]): Promise<number> {
  let report: Report = { schema_version: 1, authority: "none", command: argv[0] ?? "", outcome: "incomplete", run_directory: "", diagnostics: [] };
  try {
    const options = optionsFor(argv);
    report.command = options.command; report.run_directory = options.directory;
    const origins = resolve(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "vh-adlc/docs-drift/origins");
    const location = { repo: options.repo, directory: options.directory, origins };
    let run: RunDirectory;
    if (!existsSync(options.directory)) {
      if (!options.source || options.command !== "scan" && options.command !== "resolve" && options.command !== "close")
        throw Error("Create the run with scan, resolve or close and an explicit --source.");
      run = createRunDirectory({ ...location, source: options.source, entry: options.entry ?? "interactive",
        mode: options.command === "scan" ? "audit" : options.command, proposals: options.proposals });
    } else {
      run = readRunDirectory(location);
      if (options.entry !== undefined && options.entry !== run.manifest.entry) throw Error("Recorded execution profile changed. Select a fresh run.");
      if (options.source !== undefined && options.source !== run.manifest.source_commit) throw Error("Recorded source changed. Select a fresh run for a new source.");
      if (options.proposals.length && JSON.stringify(options.proposals) !== JSON.stringify(run.manifest.proposals))
        throw Error("Recorded proposal selection changed. Select a fresh run.");
    }
    report.source_commit = run.manifest.source_commit;
    const component = componentForRun(options.repo, run.manifest.source_commit);
    report.component = component; report.diagnostics = [...component.diagnostics];
    const stage = run.stages.at(-1);
    report.stage = stage?.command;
    if (options.command === "resume" && options.action === "inspect") {
      report.outcome = stage?.state === "pending" || stage?.state === "setup-required" ? "pending" : "collected";
      report.summary = run.origin === "original" ? "Original run retained. Resume uses its recorded stages and inputs."
        : "Observation-only run. Its original executing ownership is unavailable.";
    } else if (options.command === "report") {
      const reference = latestArtifact(run, "source_verification");
      if (!reference) throw Error("Scan the selected source before reading its report.");
      const source = readSourceAssessmentArtifacts({ repo: options.repo, source: run.manifest.source_commit,
        candidate_repo: options.repo, artifact_root: run.directory, owner: run.manifest.id, run: run.manifest.id, reference });
      report.counts = { findings: source.scan?.findings.length ?? 0 };
      report.outcome = source.complete ? "pending" : "incomplete";
      report.summary = "Source scan retained. Source-grounded assessment and independent review remain pending.";
      report.diagnostics.push(...source.diagnostics);
    } else if (run.origin !== "original") {
      report.outcome = "setup-required";
      report.diagnostics = ["The original host ownership record is required for executing stages. Use resume --action inspect to observe this copy."];
    } else if (options.command === "scan") {
      const existing = latestArtifact(run, "source_verification");
      const complete = run.stages.findLast(stage => stage.command === "scan")?.state === "complete";
      if (complete && !existing) throw Error("Original completed scan reference is missing.");
      const common = { repo: options.repo, source: run.manifest.source_commit, artifact_root: run.directory,
        owner: run.manifest.id, run: randomUUID() };
      const source = complete && existing ? readSourceAssessmentArtifacts({ ...common, candidate_repo: options.repo, reference: existing })
        : await assessSource(common);
      if (!complete) {
        const path = "component-inspection-" + randomUUID() + ".json";
        const bytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-component-inspection", source_commit: run.manifest.source_commit, bun_version: Bun.version, ...component });
        publishArtifact(join(run.directory, path), bytes);
        appendRunStage(run, { command: "scan", state: source.complete ? "complete" : "pending",
          artifacts: { component: { path, sha256: sha256(bytes) }, ...(source.evidence ? { source_verification: source.evidence } : {}) } });
      }
      report.outcome = source.complete ? "collected" : "incomplete";
      report.stage = "scan"; report.counts = { findings: source.scan?.findings.length ?? 0 };
      report.summary = "Scanner candidates and their original execution evidence are retained.";
      report.diagnostics.push(...source.diagnostics);
    } else if (!component.matched || !component.expected) {
      report.outcome = "setup-required";
    } else {
      if (["publish", "close"].includes(options.command)) {
        report.outcome = "setup-required";
        verifyProductionPreflight({ repo: options.repo, current_default: run.manifest.source_commit, component: component.expected });
      }
      // These prerequisites are produced by the integrated assessment, candidate and publication stages.
      const required: Record<string, string[]> = {
        resolve: ["source_verification", "decisions"], prepare: ["selection"], verify: ["candidate", "selection"],
        publish: ["reviewed_plan", "approval"], close: ["closure_review", "approval"], resume: ["journal", "recovery_selection", "approval"],
      };
      const missing = (required[options.command] ?? []).filter(name => !latestArtifact(run, name));
      report.outcome = missing.length ? "setup-required" : "incomplete";
      report.diagnostics = missing.length ? ["Missing recorded stage inputs include " + missing.join(", ") + "."]
        : ["This execution route awaits the active integration tasks. Inspect its retained records with resume --action inspect."];
    }
  } catch (error) {
    report.outcome = report.outcome === "setup-required" ? "setup-required" : "incomplete";
    report.diagnostics = [error instanceof Error ? error.message : "Run setup or retained input unavailable."];
  }
  writeSync(1, JSON.stringify(report) + "\n");
  return report.outcome === "collected" ? 0 : report.outcome === "pending" ? 1 : 2;
}
