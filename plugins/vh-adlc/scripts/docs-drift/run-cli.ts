import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, realpathSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertRunStageOrder, createRunArtifactWriter, createRunDirectory, readRunDirectory, appendRunStage, latestRunArtifact as latestArtifact, RUN_COMMANDS, type RunDirectory } from "./run-directory";
import { assessSource, readSourceAssessmentArtifacts } from "./source-assessment";
import { inspectInstalledPayload } from "./bootstrap";
import { verifyProductionPreflight } from "./preflight";
import { loadCommittedSettings, SetupRequired } from "./settings";
import { inspectJournal, publishArtifact } from "./journal";
import { canonicalDigest, canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { readBoundArtifact } from "./evidence-input";
import { readNativeCredential } from "./transport";
import { collectNativeRetained } from "./retained-controller";
import { applyRecovery } from "./recovery-controller";
import { recoveryEffectsOutput, publicationEffectsOutput } from "./recovery-output";
import { OUTPUT_LIMIT } from "./owned-process";
import { runReport } from "./run-report";
import { runPreparation } from "./run-preparation";
import { runVerification } from "./run-verification";
import { runPublication } from "./run-publication";
import { runResolution } from "./run-resolution";
import { runClosure } from "./run-closure";
import type { AuditOutputArtifacts } from "./report-output";
import { captureRepositoryState, matchesRepositoryState } from "./snapshot";

type Outcome = "collected" | "attention" | "pending" | "setup-required" | "incomplete";
type Report = {
  schema_version: 1; authority: "none"; command: string; outcome: Outcome; run_directory: string;
  source_commit?: string; stage?: string; summary?: string; counts?: { findings: number };
  diagnostics: string[];
  prepared_checkout?: string | null;
  stage_artifacts?: Record<string, { path: string; sha256: string }>;
  component?: ReturnType<typeof componentForRun>;
  operation?: ReturnType<typeof operationSummary>;
  retained_operation?: Awaited<ReturnType<typeof collectNativeRetained>>["retained_operation"];
  recovery_effects?: ReturnType<typeof recoveryEffectsOutput>["recovery_effects"];
  publication_effects?: ReturnType<typeof publicationEffectsOutput>["publication_effects"];
  report_artifacts?: AuditOutputArtifacts | null;
};
function optionsFor(argv: string[]) {
  const command = RUN_COMMANDS.find(command => command === argv[0]);
  if (!command) throw Error("Select scan, report, resolve, prepare, verify, publish, resume or close.");
  const options = new Map<string, string>(), proposals: number[] = [];
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index], value = argv[index + 1];
    if (!["--repo", "--run-dir", "--source", "--entry", "--proposal", "--action", "--operation-id"].includes(name)
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
  if (action !== undefined && !["continue", "inspect", "restore", "reconcile", "acknowledge"].includes(action))
    throw Error("Select a supported resume action.");
  if (proposals.length && command !== "resolve" && command !== "close") throw Error("Proposal selection belongs to resolve or close.");
  const operation = options.get("--operation-id");
  if (operation !== undefined && (command !== "resume" || !["inspect", "restore"].includes(action ?? "continue")
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(operation))) throw Error("Select an exact operation for resume inspection or restoration.");
  if (action === "restore" && (!operation || !source)) throw Error("Restoration requires the original --source and --operation-id.");
  if (command === "close" && proposals.length > 1) throw Error("Close selects one merged replacement with --proposal.");
  return { command, repo: realpathSync(repo), directory: resolve(directory), source,
    entry: options.get("--entry"), proposals, operation, action: action ?? "continue" };
}
function operationDirectory(run: RunDirectory, repo: string) {
  const reference = latestArtifact(run, "journal");
  if (reference) {
    readBoundArtifact({ source_repo: repo, artifact_root: run.directory, reference });
    return dirname(join(run.directory, reference.path));
  }
  const files = readdirSync(run.directory);
  if (files.length > 1000) throw Error("Run directory inspection bound exceeded.");
  const journals = files.filter(name => /^docs-drift-[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(name)
    && existsSync(join(run.directory, name, "header.json")));
  if (journals.length > 1) throw Error("The selected run has multiple operation journals.");
  return journals.length ? join(run.directory, journals[0]) : null;
}

function operationSummary(run: RunDirectory, directory: string, repo: string) {
  const journal = inspectJournal(directory, repo), plan = journal.plan;
  if (plan.manifest.bindings.source_commit !== run.manifest.source_commit
    || plan.manifest.bindings.settings_sha256 !== run.manifest.settings_sha256) throw Error("Original operation source/configuration changed.");
  return { schema_version: plan.schema_version, operation_id: plan.manifest.operation_id, approval_sha256: plan.approval_sha256,
    policy: plan.schema_version === 1 ? { adoption_sha256: plan.adoption_sha256 } : { policy_sha256: plan.policy_sha256, component: plan.component },
    execution_origin: run.origin, revision: journal.revision, pending_effect_ids: journal.pending_effect_ids,
    handoff: plan.schema_version === 1 ? "Inspect with this entry. Execution requires the original version-one implementation and setup." : null };
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

function retainPublicationResult(options: { repo: string; run: RunDirectory; location: Parameters<typeof readRunDirectory>[0];
  command: typeof RUN_COMMANDS[number]; result: Awaited<ReturnType<typeof runPublication>>; artifact: "publication_result" | "closure_result" }) {
  const { repo, run, result, command } = options, settings = loadCommittedSettings(repo, run.manifest.source_commit).settings;
  const complete = result.state === "complete";
  const output = publicationEffectsOutput({ command, source: run.manifest.source_commit, outcome: complete ? "collected" : "attention",
    result, limit: Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes) });
  const current = readRunDirectory(options.location), retain = createRunArtifactWriter(current, settings.reports.max_entry_bytes);
  const stage = appendRunStage(current, { command, state: complete ? "complete" : "pending",
    artifacts: { [options.artifact]: retain(options.artifact, canonicalJSON(output)) } });
  return { publication_effects: output.publication_effects, outcome: complete ? "collected" as const : "pending" as const,
    stage: command, diagnostics: output.diagnostics.map(diagnostic => diagnostic.message), stage_artifacts: stage.artifacts };
}

/** Public run-directory entry. Domain stages keep their existing review, ownership and authority checks. */
export async function runDirectoryMain(argv: string[]): Promise<number> {
  let report: Report = { schema_version: 1, authority: "none", command: argv[0] ?? "", outcome: "incomplete", run_directory: "", diagnostics: [] };
  let caller: { repo: string; digest: string } | undefined;
  try {
    const options = optionsFor(argv);
    caller = { repo: options.repo, digest: canonicalDigest(captureRepositoryState(options.repo)) };
    report.command = options.command; report.run_directory = options.directory;
    const origins = resolve(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "vh-adlc/docs-drift/origins");
    const location = { repo: options.repo, directory: options.directory, origins };
    let run: RunDirectory;
    if (!existsSync(options.directory)) {
      if (options.command === "resolve" && !options.proposals.length || options.command === "close" && options.proposals.length !== 1)
        throw new SetupRequired("Select exact original proposals for resolve or one merged replacement for close before creating the run.");
      if (!options.source || options.command !== "scan" && options.command !== "resolve" && options.command !== "close" && options.action !== "restore")
        throw Error("Create the run with scan, resolve or close and an explicit --source.");
      const restored = options.command === "resume" && options.action === "restore";
      const entry = options.entry ?? (restored ? Object.keys(loadCommittedSettings(options.repo, options.source).settings.execution.entries)[0] : "interactive");
      run = createRunDirectory({ ...location, source: options.source, entry,
        mode: options.command === "resolve" || options.command === "close" ? options.command : "audit", proposals: options.proposals,
        ...(restored ? { ownership: "observation-only" as const } : {}) });
    } else {
      if (options.action === "restore") throw Error("Restore into a fresh external directory. Inspect the existing run with resume --action inspect.");
      run = readRunDirectory(location);
      if (options.entry !== undefined && options.entry !== run.manifest.entry) throw Error("Recorded execution profile changed. Select a fresh run.");
      if (options.source !== undefined && options.source !== run.manifest.source_commit) throw Error("Recorded source changed. Select a fresh run for a new source.");
      if (options.proposals.length && JSON.stringify(options.proposals) !== JSON.stringify(run.manifest.proposals))
        throw Error("Recorded proposal selection changed. Select a fresh run.");
    }
    report.source_commit = run.manifest.source_commit;
    const stage = run.stages.at(-1);
    report.stage = stage?.command;
    report.stage_artifacts = stage?.artifacts;
    const continuePublication = options.command === "resume" && options.action === "continue" && run.origin === "original"
      && Boolean(latestArtifact(run, "candidate") && latestArtifact(run, "approval") && latestArtifact(run, "journal"));
    const continueClosure = options.command === "resume" && options.action === "continue" && run.origin === "original"
      && Boolean(latestArtifact(run, "closure_review") && latestArtifact(run, "approval") && latestArtifact(run, "journal"));
    if (options.command === "resume" && options.action === "restore") {
      if (!options.operation) throw Error("Exact original operation required.");
      const settings = loadCommittedSettings(options.repo, run.manifest.source_commit).settings;
      const credential = await readNativeCredential({ hostname: settings.hostname, cwd: options.repo });
      const result = await collectNativeRetained({ repo: options.repo, source: run.manifest.source_commit, artifact_root: run.directory,
        operation_id: options.operation, owner: run.manifest.id, run: randomUUID(), credential, restore: true });
      report.retained_operation = result.retained_operation;
      report.outcome = result.outcome === "collected" ? "collected" : "pending";
      report.diagnostics = result.diagnostics.map(diagnostic => diagnostic.message);
      report.summary = "Durable native observations restored. Original application, settlement and host ownership evidence remains required for effects.";
    } else if (options.command === "resume" && (options.action === "inspect" || options.action === "continue" && !continuePublication && !continueClosure)) {
      const directory = operationDirectory(run, options.repo);
      if (directory) report.operation = operationSummary(run, directory, options.repo);
      if (options.operation && options.operation !== report.operation?.operation_id) throw Error("Selected operation differs from the retained run.");
      report.outcome = report.operation?.pending_effect_ids.length || stage?.state === "pending" || stage?.state === "setup-required" ? "pending" : "collected";
      report.summary = run.origin === "original" ? "Original run retained. Resume uses its recorded stages and inputs."
        : "Observation-only run. Its original executing ownership is unavailable.";
    } else if (options.command === "resume" && ["acknowledge", "reconcile"].includes(options.action)) {
      const directory = operationDirectory(run, options.repo), selection = latestArtifact(run, "recovery_selection"), authority = latestArtifact(run, "approval");
      if (!directory || !selection || !authority) throw Error("Retain the exact recovery selection and current approval before executing recovery.");
      if (run.origin !== "original") throw Error("Original host ownership required for recovery effects.");
      const settings = loadCommittedSettings(options.repo, run.manifest.source_commit).settings;
      const credential = await readNativeCredential({ hostname: settings.hostname, cwd: options.repo });
      const result = await applyRecovery({ repo: options.repo, source: run.manifest.source_commit, artifact_root: run.directory,
        journal_directory: directory, cache_directory: run.directory, entry: run.manifest.entry, owner: run.manifest.id, run: randomUUID(), credential,
        selection: JSON.parse(decodeUTF8(readBoundArtifact({ source_repo: options.repo, artifact_root: run.directory, reference: selection }))),
        authority, purpose: options.action === "acknowledge" ? "acknowledgement" : "reconciliation" }, run);
      report.recovery_effects = recoveryEffectsOutput({ command: "resume", source: run.manifest.source_commit,
        outcome: "attention", result, limit: Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes) }).recovery_effects;
      report.outcome = "pending";
      report.diagnostics = result.reason ? [result.reason] : [];
    } else if (options.command === "report" && run.origin !== "original") {
      const directory = operationDirectory(run, options.repo);
      if (directory) report.operation = operationSummary(run, directory, options.repo);
      report.outcome = "pending";
      report.summary = "Observation-only records retained. New assessment and review require the original host ownership or a fresh run.";
    } else {
      assertRunStageOrder(run, options.command);
      const component = componentForRun(options.repo, run.manifest.source_commit);
      report.component = component; report.diagnostics = [...component.diagnostics];
      if (options.command === "report") {
        const reference = latestArtifact(run, "source_verification");
        if (!reference) throw Error("Scan the selected source before reading its report.");
        const source = readSourceAssessmentArtifacts({ repo: options.repo, source: run.manifest.source_commit,
          candidate_repo: options.repo, artifact_root: run.directory, owner: run.manifest.id, run: run.manifest.id, reference });
        report.counts = { findings: source.scan?.findings.length ?? 0 };
        if (!source.complete || !component.matched || run.origin !== "original") {
          report.outcome = source.complete ? "pending" : "incomplete";
          report.summary = "Source scan retained. Source-grounded assessment and independent review remain pending.";
          report.diagnostics.push(...source.diagnostics);
          if (run.origin !== "original") report.diagnostics.push("Original host ownership is required for new native assessment and review.");
        } else {
          const reviewed = await runReport({ repo: options.repo, run,
            history_directory: join(origins, "../reports"), source_verification: reference });
          report.outcome = reviewed.output.outcome;
          report.report_artifacts = reviewed.output.report_artifacts;
          report.summary = reviewed.output.outcome === "incomplete" ? "Assessment or independent review remains incomplete. Retained diagnostics identify the failed stage."
            : "Source-grounded assessment and independent review are retained with the report.";
          report.diagnostics = reviewed.output.diagnostics.map(diagnostic => diagnostic.message);
          report.stage_artifacts = appendRunStage(run, { command: "report", state: report.outcome === "incomplete" ? "pending" : "complete",
            artifacts: { report_output: reviewed.reference, report_decisions: reviewed.decisions,
              ...(reviewed.worker ? { assessment_worker: reviewed.worker } : {}), ...(reviewed.reviewer ? { assessment_reviewer: reviewed.reviewer } : {}) } }).artifacts;
        }
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
      } else if (options.command === "resolve") {
        if (operationDirectory(run, options.repo)) throw Error("An operation already owns this run. Resume it or select a fresh resolution run.");
        verifyProductionPreflight({ repo: options.repo, current_default: run.manifest.source_commit, component: component.expected });
        const resolution = await runResolution({ repo: options.repo, run, source_verification: latestArtifact(run, "source_verification") });
        report.stage_artifacts = appendRunStage(run, { command: "resolve", state: "complete", artifacts: resolution.artifacts }).artifacts;
        report.outcome = "collected"; report.stage = "resolve";
        report.summary = "Complete current source and all " + resolution.count + " selected original proposal diffs are retained for consolidation decisions.";
      } else if (options.command === "prepare") {
        const source = latestArtifact(run, "source_verification");
        if (!source) throw new SetupRequired("Scan the selected source before preparing corrections.");
        if (operationDirectory(run, options.repo)) throw Error("An operation already owns this run. Resume it or select a fresh run for new preparation.");
        if (!existsSync(join(run.directory, "prepare.yaml"))) throw new SetupRequired("Create prepare.yaml in the run directory with the selected decisions before preparation.");
        verifyProductionPreflight({ repo: options.repo, current_default: run.manifest.source_commit, component: component.expected });
        const prepared = await runPreparation({ repo: options.repo, run, source_verification: source });
        report.outcome = prepared.prepared.state === "incomplete" ? "incomplete" : "collected";
        report.stage = "prepare"; report.diagnostics = prepared.prepared.diagnostics;
        report.prepared_checkout = prepared.prepared.checkout;
        report.summary = "Selected corrections and the original worker are retained. Commit the owned candidate under the project rules before verification.";
        report.stage_artifacts = appendRunStage(run, { command: "prepare", state: report.outcome === "collected" ? "complete" : "pending", artifacts: prepared.artifacts }).artifacts;
      } else if (options.command === "verify") {
        const source_verification = latestArtifact(run, "source_verification"), preparation = latestArtifact(run, "preparation"),
          selection = latestArtifact(run, "selection"), decisions = latestArtifact(run, "decisions"), worker_capture = latestArtifact(run, "worker_capture");
        if (!source_verification || !preparation || !selection || !decisions || !worker_capture) throw new SetupRequired("Complete original preparation is required before verification.");
        if (operationDirectory(run, options.repo)) throw Error("An operation already owns this run. Resume it or select a fresh run for new verification.");
        verifyProductionPreflight({ repo: options.repo, current_default: run.manifest.source_commit, component: component.expected });
        const verified = await runVerification({ repo: options.repo, run, source_verification, preparation, selection, decisions, worker_capture });
        report.stage_artifacts = appendRunStage(run, { command: "verify", state: "complete", artifacts: verified.artifacts }).artifacts;
        report.outcome = "collected"; report.stage = "verify";
        report.summary = "Candidate verification and independent native review are retained with the exact proposed effect manifest.";
      } else if (options.command === "close" || continueClosure) {
        verifyProductionPreflight({ repo: options.repo, current_default: run.manifest.source_commit, component: component.expected });
        const closed = await runClosure({ repo: options.repo, run });
        report.stage = options.command;
        if (closed.kind === "publication") {
          Object.assign(report, retainPublicationResult({ repo: options.repo, run, location, command: options.command,
            result: closed.result, artifact: "closure_result" }));
        } else {
          report.stage_artifacts = appendRunStage(run, { command: "close",
            state: closed.kind === "complete" ? "complete" : "pending", artifacts: closed.artifacts }).artifacts;
          report.outcome = closed.kind === "complete" ? "collected" : "pending";
          report.summary = closed.kind === "complete" ? "All selected originals are already closed after their merged replacement."
            : "Fresh closure verification and independent review are retained. Approve the exact displayed manifest before executing this batch.";
        }
      } else if (options.command === "publish" || continuePublication) {
        verifyProductionPreflight({ repo: options.repo, current_default: run.manifest.source_commit, component: component.expected });
        const result = await runPublication({ repo: options.repo, run });
        Object.assign(report, retainPublicationResult({ repo: options.repo, run, location, command: options.command,
          result, artifact: "publication_result" }));
      } else {
        throw new SetupRequired("The selected run operation is unavailable.");
      }
    }
  } catch (error) {
    report.outcome = error instanceof SetupRequired ? "setup-required" : "incomplete";
    report.diagnostics = [error instanceof Error ? error.message : "Run setup or retained input unavailable."];
  }
  if (caller && !matchesRepositoryState(caller.repo, caller.digest)) {
    report.outcome = "incomplete";
    report.diagnostics.push("Caller source, index or repository configuration changed during this operation.");
  }
  writeSync(1, JSON.stringify(report) + "\n");
  return report.outcome === "collected" ? 0 : report.outcome === "pending" || report.outcome === "attention" ? 1 : 2;
}
