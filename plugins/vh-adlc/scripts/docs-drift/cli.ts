#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { artifactDirectoryScope, captureSnapshot, externalArtifactDirectory } from "./snapshot";
import { runScan, type ScanRun } from "./scan";
import { checkUpgradeSignals, collectTrialBindings } from "./adoption";
import { loadCommittedSettings } from "./settings";
import { readNativeContext } from "./transport";
import { prepareTrialFixture } from "./trial-setup";
import { selectApprovedRuntime, selectCandidateRuntime } from "./bootstrap";
import { collectProposals } from "./proposals";
import { inspectPreparation, inspectCandidate, prepareEdits, PreparationEvidenceError } from "./preparation";
import { collectPublicationInputs } from "./publication-inputs";
import { collectNativeResolution, collectNativeClosure } from "./resolution-entry";
import { readBoundArtifact } from "./evidence-input";
import { canonicalJSON, decodeUTF8, protocolPath } from "./protocol";

type Diagnostic = { code: string; message: string };
export type CLIReport = {
  schema_version: 1; command: string; outcome: "collected" | "attention" | "incomplete"; diagnostics: Diagnostic[];
  source_commit?: string; settings_sha256?: string; bindings_sha256?: string; assessment?: ScanRun;
  signals?: ReturnType<typeof checkUpgradeSignals>;
  trial?: ReturnType<typeof collectTrialBindings>;
  preparation?: ReturnType<typeof prepareTrialFixture>;
  runtime?: Awaited<ReturnType<typeof selectApprovedRuntime> | ReturnType<typeof selectCandidateRuntime>>;
  proposals?: ReturnType<typeof collectProposals>;
  edit_inspection?: ReturnType<typeof inspectPreparation>;
  publication_inputs?: Awaited<ReturnType<typeof collectPublicationInputs>>;
  candidate_inspection?: ReturnType<typeof inspectCandidate>;
  retained_resources?: { checkout: string | null; record_path: string | null };
  closure?: Awaited<ReturnType<typeof collectNativeClosure>>;
  resolution?: Awaited<ReturnType<typeof collectNativeResolution>>;
  prepared?: Awaited<ReturnType<typeof prepareEdits>>;
};
const usage = `Documentation drift helper protocol 1
bun <plugin>/scripts/docs-drift/cli.ts scan --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory>
bun <plugin>/scripts/docs-drift/cli.ts check-upgrade-signals --repo <repo>
  --source <full-commit>
bun <plugin>/scripts/docs-drift/cli.ts trial-bindings --repo <repo>
  --source <full-commit>
bun <plugin>/scripts/docs-drift/cli.ts prepare-trial-fixture --repo <repo>
  --source <full-current-default-commit> --artifact-root <private-external-directory>
bun <plugin>/scripts/docs-drift/cli.ts inspect-runtime --repo <repo>
  --source <full-current-default-commit> --cache-root <retained-cache>
  --entry <hosted|copilot|claude> --launcher <invoked-launcher> --settings <invoked-settings>
  [--trial-definition <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts collect-proposals --repo <repo>
  --source <full-current-default-commit>
bun <plugin>/scripts/docs-drift/cli.ts collect-publication-inputs --repo <assessment-repo>
  --source <full-commit> --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  --cache-root <retained-cache> --entry <hosted|copilot|claude>
  --launcher <invoked-launcher> --settings <invoked-settings>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts check-candidate --repo <assessment-repo> --source <full-commit>
  --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts check-edits --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts collect-closure --repo <repo> --source <full-current-default-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts collect-resolution --repo <repo> --source <full-current-default-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts prepare --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>

Prepare the locked verified binary and required knowledge before invoking this
helper. The scanner reads the selected committed configuration and runs in its
owned source copy. JSON reports collection accounting. Candidate assessment,
content decisions and publication have their own lifecycle gates.
Complete collection exits 0. Incomplete input, setup or collection exits 2.
Upgrade signals compare committed intake metadata. A mismatch exits 1.
Trial bindings report candidate policy with execution authority none.
Signal consistency reads committed blobs and requires no publication credential.
Native reads require GH_TOKEN for github.com and *.ghe.com, or GH_ENTERPRISE_TOKEN
for an enterprise server, to observe the authenticated account and repository.
Trial preparation requires that credential and the observed current default.
It imports the committed synthetic fixture into a new owned directory.
Runtime inspection verifies the approved retained selection, or the candidate
bound by trial-definition. Actual model invocation and effect grants are separate.
Proposal collection reads the configured shared and legacy PR inventory.
Resolution collection fetches selected complete native PR diffs into a new owned
object store, then rechecks their source and metadata. Its output grants no effects.
Closure collection recovers the durable merged consolidation record and original
full diffs from native inputs. Independent closure review and permission follow.
Edit checks require caller HEAD to equal the selected source commit.
A source mismatch returns the assessment-source diagnostic.
Edit checks compute postimages and feature-protection decisions. Semantic
verification, applying changes and publication have their own lifecycle steps.
Prepare requires the selected run's local-edit authority. It scans the committed
source, creates an owned preparation copy and applies the selected postimages.
Candidate inspection compares immutable Git objects with the selected complete
postimages and binds the full diff/tree. Working-tree overlays stay preserved.
A selected durable resolution record must match its exact bytes, assessed source
and complete postimages. Required input observations must be available.
The assessment repo must retain its selected HEAD for feature protection.
Publication input collection observes native current-default policy in a new owned
object store and verifies the adopted retained runtime and Git-source freshness.
Original role evidence, current required observations and actual effect grants
follow in the controller. This collection has authority none.
Verification, review and publication follow their own fresh owned-checkout gates.
`;

function argumentsForCommand(argv: string[]) {
  const command = argv[0];
  if (!["scan", "check-upgrade-signals", "trial-bindings", "prepare-trial-fixture", "inspect-runtime", "collect-proposals", "check-edits", "prepare", "collect-resolution", "collect-closure", "check-candidate", "collect-publication-inputs"].includes(command)) throw Error("unknown docs-drift command");
  const needsArtifacts = ["scan", "prepare-trial-fixture", "check-edits", "prepare", "collect-resolution", "collect-closure", "check-candidate", "collect-publication-inputs"].includes(command);
  const flags = ["--repo", "--source"];
  if (needsArtifacts) flags.push("--artifact-root");
  if (command === "inspect-runtime") flags.push("--cache-root", "--entry", "--launcher", "--settings", "--trial-definition");
  if (["check-edits", "prepare", "collect-resolution", "collect-closure", "check-candidate", "collect-publication-inputs"].includes(command)) flags.push("--selection", "--selection-sha256");
  if (["check-candidate", "collect-publication-inputs"].includes(command)) flags.push("--candidate-repo", "--candidate", "--resolution-record", "--resolution-sha256");
  if (command === "collect-publication-inputs") flags.push("--cache-root", "--entry", "--launcher", "--settings");
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!flags.includes(flag)) throw Error("unknown " + command + " option");
    if (values.has(flag)) throw Error("duplicate " + command + " option");
    if (!value || value.startsWith("--")) throw Error(command + " option requires a value");
    values.set(flag, value);
  }
  const repo = values.get("--repo"), source = values.get("--source"), artifacts = values.get("--artifact-root");
  if (!repo || !source || (needsArtifacts && !artifacts)) throw Error(command + " requires " + flags.join(", "));
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source)) throw Error(command + " requires a full immutable source commit");
  return { command, repo, source, artifacts, cache: values.get("--cache-root"), entry: values.get("--entry"),
    launcher: values.get("--launcher"), settings: values.get("--settings"), definition: values.get("--trial-definition"),
    selection: values.get("--selection"), selection_sha256: values.get("--selection-sha256"), candidate_repo: values.get("--candidate-repo"), candidate: values.get("--candidate"), resolution_record: values.get("--resolution-record"), resolution_sha256: values.get("--resolution-sha256") };
}

function nativeCredential(hostname: string): string {
  return (hostname === "github.com" || hostname.endsWith(".ghe.com") ? process.env.GH_TOKEN : process.env.GH_ENTERPRISE_TOKEN) ?? "";
}

function nativeContext(repo: string, source: string) {
  const { settings } = loadCommittedSettings(repo, source);
  return readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: nativeCredential(settings.hostname) });
}

function privateArtifacts(path: string | undefined, repo: string) {
  if (!path) throw Error("command requires artifact-root");
  const requested = resolve(path), root = externalArtifactDirectory(requested, repo);
  const stat = lstatSync(requested), owner = process.getuid?.();
  if (owner === undefined || root !== requested || !stat.isDirectory() || stat.isSymbolicLink()
    || stat.uid !== owner || (stat.mode & 0o077) !== 0) throw Error("command requires a private owned external artifact directory");
  return { root, owner: "uid-" + owner };
}

function failureDiagnostics(error: unknown, code: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [], seen = new Set<unknown>();
  function visit(value: unknown): void {
    if (seen.has(value)) return;
    seen.add(value);
    diagnostics.push({ code, message: value instanceof Error ? value.message : "Command input or setup unavailable" });
    if (value instanceof AggregateError) for (const member of value.errors) visit(member);
    if (value instanceof Error && value.cause !== undefined) visit(value.cause);
  }
  visit(error);
  return diagnostics;
}

/** Technical collection feeds the controller's separate semantic decisions and effect grants. */
export async function main(argv: string[]): Promise<number> {
  if (argv.length === 1 && ["--help", "help"].includes(argv[0])) { writeSync(1, usage); return 0; }
  let report: CLIReport;
  try {
    const options = argumentsForCommand(argv), repo = realpathSync(options.repo);
    if (["check-edits", "prepare", "collect-resolution", "collect-closure", "check-candidate", "collect-publication-inputs"].includes(options.command)) {
      const artifacts = privateArtifacts(options.artifacts, repo);
      let candidate: { repo: string; commit: string } | null = null;
      if (["check-candidate", "collect-publication-inputs"].includes(options.command)) {
        if (!options.candidate_repo || !options.candidate) throw Error("candidate inspection requires candidate-repo and candidate");
        candidate = { repo: realpathSync(options.candidate_repo), commit: options.candidate };
        artifactDirectoryScope(artifacts.root, candidate.repo).assertExternal(join(artifacts.root, protocolPath(options.selection)));
      }
      const bytes = readBoundArtifact({ source_repo: repo, artifact_root: artifacts.root,
        reference: { path: options.selection, sha256: options.selection_sha256 } });
      let selection: unknown;
      try {
        selection = JSON.parse(decodeUTF8(bytes));
        if (!canonicalJSON(selection).equals(bytes)) throw Error("noncanonical selection");
      } catch { throw Error("invalid canonical selection JSON"); }
      if (candidate) {
        if ((options.resolution_record === undefined) !== (options.resolution_sha256 === undefined)) throw Error("resolution record path and digest are required together");
        const resolution = options.resolution_record !== undefined && options.resolution_sha256 !== undefined
          ? { path: options.resolution_record, sha256: options.resolution_sha256 } : undefined;
        if (options.command === "collect-publication-inputs") {
          const entry = options.entry;
          if ((entry !== "hosted" && entry !== "copilot" && entry !== "claude") || !options.cache || !options.launcher || !options.settings)
            throw Error("publication input collection requires cache-root, entry, launcher and settings");
          const { settings } = loadCommittedSettings(repo, options.source);
          const publication_inputs = await collectPublicationInputs({ repo, source: options.source, selection, candidate_repo: candidate.repo, candidate: candidate.commit,
            resolution_record: resolution, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID(), credential: nativeCredential(settings.hostname),
            cache_directory: resolve(options.cache), entry, launcher_path: resolve(options.launcher), settings_path: resolve(options.settings) });
          report = { schema_version: 1, command: options.command, outcome: publication_inputs.complete ? "collected" : "incomplete",
            source_commit: options.source, publication_inputs, diagnostics: publication_inputs.diagnostics.map(message => ({ code: "publication-inputs", message })) };
        } else {
          const candidate_inspection = inspectCandidate({ repo, source: options.source, selection, candidate_repo: candidate.repo, candidate: candidate.commit, resolution_record: resolution,
            artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
          report = { schema_version: 1, command: options.command, outcome: candidate_inspection.complete ? "collected" : "incomplete",
            source_commit: options.source, candidate_inspection, diagnostics: candidate_inspection.diagnostics.map(message => ({ code: "candidate-inspection", message })) };
        }
      } else if (["collect-resolution", "collect-closure"].includes(options.command)) {
        const settings = loadCommittedSettings(repo, options.source).settings;
        const input = { repo, source: options.source, selection, artifact_root: artifacts.root, owner: artifacts.owner,
          run: randomUUID(), credential: nativeCredential(settings.hostname) };
        if (options.command === "collect-closure") {
          const closure = await collectNativeClosure(input);
          report = { schema_version: 1, command: options.command, outcome: closure.complete ? "collected" : "incomplete",
            diagnostics: closure.diagnostics.map(message => ({ code: "closure-collection", message })),
            source_commit: options.source, closure };
        } else {
          const resolution = await collectNativeResolution(input);
          report = { schema_version: 1, command: options.command, outcome: resolution.complete ? "collected" : "incomplete",
            diagnostics: resolution.diagnostics.map(message => ({ code: "resolution-collection", message })),
            source_commit: options.source, resolution };
        }
      } else if (options.command === "prepare") {
        const prepared = await prepareEdits({ repo, source: options.source, selection, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
        report = { schema_version: 1, command: options.command, outcome: prepared.state === "incomplete" ? "incomplete" : "collected",
          source_commit: options.source, diagnostics: prepared.diagnostics.map(message => ({ code: "preparation", message })), prepared };
      } else {
        const edit_inspection = inspectPreparation({ repo, source: options.source, selection });
        const protection = edit_inspection.protection?.diagnostics ?? [], protectionMessages = new Set(protection.map(item => item.message));
        report = { schema_version: 1, command: options.command, outcome: edit_inspection.complete ? "collected" : "incomplete",
          source_commit: options.source, diagnostics: [...protection, ...edit_inspection.diagnostics.filter(message => !protectionMessages.has(message)).map(message => ({ code: "edit-inspection", message }))], edit_inspection };
      }
    } else if (options.command === "trial-bindings") {
      const trial = collectTrialBindings({ repo, current_default: options.source });
      report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, diagnostics: [], trial };
    } else if (options.command === "check-upgrade-signals") {
      const signals = checkUpgradeSignals({ repo, source: options.source });
      report = { schema_version: 1, command: options.command, outcome: signals.matches === false ? "attention" : "collected",
        source_commit: options.source, diagnostics: [], signals };
    } else if (options.command === "collect-proposals") {
      const context = nativeContext(repo, options.source);
      if (context.default_commit !== options.source) throw Error("proposal collection source must match the observed current default");
      const { settings } = loadCommittedSettings(repo, options.source), proposals = collectProposals(context.repository, settings);
      report = { schema_version: 1, command: options.command, outcome: proposals.complete ? "collected" : "incomplete", source_commit: options.source,
        diagnostics: proposals.diagnostics.map(message => ({ code: "proposal-collection", message })), proposals };
    } else if (options.command === "inspect-runtime") {
      const entry = options.entry;
      if ((entry !== "hosted" && entry !== "copilot" && entry !== "claude") || !options.cache || !options.launcher || !options.settings)
        throw Error("runtime inspection requires cache-root, entry, launcher and settings");
      if (options.definition !== undefined && !/^[a-f0-9]{64}$/u.test(options.definition)) throw Error("runtime inspection requires a full trial definition digest");
      const context = nativeContext(repo, options.source);
      if (context.default_commit !== options.source) throw Error("runtime inspection source must match the observed current default");
      const selection: Parameters<typeof selectApprovedRuntime>[0] = { repo, current_default: options.source, identity: context.identity, cache_directory: resolve(options.cache), entry,
        launcher_path: resolve(options.launcher), settings_path: resolve(options.settings) };
      const runtime = options.definition === undefined ? await selectApprovedRuntime(selection)
        : await selectCandidateRuntime({ ...selection, definition_sha256: options.definition });
      report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, diagnostics: [], runtime };
    } else if (options.command === "prepare-trial-fixture") {
      const artifacts = privateArtifacts(options.artifacts, repo), context = nativeContext(repo, options.source);
      if (context.default_commit !== options.source) throw Error("trial preparation source must match the observed current default");
      const preparation = prepareTrialFixture({ repo, current_default: options.source, identity: context.identity, directory: artifacts.root });
      report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, diagnostics: [], preparation };
    } else {
      const artifacts = privateArtifacts(options.artifacts, repo);
      const snapshot = captureSnapshot(repo, options.source);
      const assessment = await runScan(snapshot, { artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
      report = { schema_version: 1, command: "scan", outcome: assessment.complete ? "collected" : "incomplete",
        source_commit: snapshot.source_commit, settings_sha256: snapshot.settings_sha256,
        bindings_sha256: snapshot.protocol.sha256, diagnostics: assessment.diagnostics, assessment };
    }
  } catch (error) {
    report = { schema_version: 1, command: argv[0] ?? "", outcome: "incomplete", diagnostics: failureDiagnostics(error, argv[0] === "scan" ? "scan-setup-or-input" : "command-setup-or-input"),
      ...(error instanceof PreparationEvidenceError ? { retained_resources: { checkout: error.checkout, record_path: error.record_path } } : {}) };
  }
  writeSync(1, JSON.stringify(report) + "\n");
  return report.outcome === "incomplete" ? 2 : report.outcome === "attention" ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
