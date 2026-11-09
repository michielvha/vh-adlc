#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { captureSnapshot, externalArtifactDirectory } from "./snapshot";
import { runScan, type ScanRun } from "./scan";
import { checkUpgradeSignals, collectTrialBindings } from "./adoption";
import { loadCommittedSettings } from "./settings";
import { readNativeContext } from "./transport";
import { prepareTrialFixture } from "./trial-setup";

type Diagnostic = { code: string; message: string };
export type CLIReport = {
  schema_version: 1; command: string; outcome: "collected" | "attention" | "incomplete"; diagnostics: Diagnostic[];
  source_commit?: string; settings_sha256?: string; bindings_sha256?: string; assessment?: ScanRun;
  signals?: ReturnType<typeof checkUpgradeSignals>;
  trial?: ReturnType<typeof collectTrialBindings>;
  preparation?: ReturnType<typeof prepareTrialFixture>;
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

Prepare the locked verified binary and required knowledge before invoking this
helper. The scanner reads the selected committed configuration and runs in its
owned source copy. JSON reports collection accounting. Candidate assessment,
content decisions and publication have their own lifecycle gates.
Complete collection exits 0. Incomplete input, setup or collection exits 2.
Upgrade signals compare committed intake metadata. A mismatch exits 1.
Trial bindings report candidate policy with execution authority none.
Adopted signal checks require GH_TOKEN for github.com and *.ghe.com, or
GH_ENTERPRISE_TOKEN for an enterprise server, to observe the authenticated
account and repository access.
Trial preparation requires the same credential and the observed current default.
It imports the committed synthetic fixture into a new owned directory.
`;

function argumentsForCommand(argv: string[]) {
  const command = argv[0];
  if (!["scan", "check-upgrade-signals", "trial-bindings", "prepare-trial-fixture"].includes(command)) throw Error("unknown docs-drift command");
  const needsArtifacts = command === "scan" || command === "prepare-trial-fixture";
  const flags = needsArtifacts ? ["--repo", "--source", "--artifact-root"] : ["--repo", "--source"];
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
  return { command, repo, source, artifacts };
}

function nativeContext(repo: string, source: string) {
  const { settings } = loadCommittedSettings(repo, source);
  const hosted = settings.hostname === "github.com" || settings.hostname.endsWith(".ghe.com");
  return readNativeContext({ hostname: settings.hostname, repository: settings.repository,
    credential: (hosted ? process.env.GH_TOKEN : process.env.GH_ENTERPRISE_TOKEN) ?? "" });
}

function privateArtifacts(path: string | undefined, repo: string) {
  if (!path) throw Error("command requires artifact-root");
  const requested = resolve(path), root = externalArtifactDirectory(requested, repo);
  const stat = lstatSync(requested), owner = process.getuid?.();
  if (owner === undefined || root !== requested || !stat.isDirectory() || stat.isSymbolicLink()
    || stat.uid !== owner || (stat.mode & 0o077) !== 0) throw Error("command requires a private owned external artifact directory");
  return { root, owner: "uid-" + owner };
}

/** Technical collection feeds the controller's separate semantic decisions and effect grants. */
export async function main(argv: string[]): Promise<number> {
  if (argv.length === 1 && ["--help", "help"].includes(argv[0])) { writeSync(1, usage); return 0; }
  let report: CLIReport;
  try {
    const options = argumentsForCommand(argv), repo = realpathSync(options.repo);
    if (options.command === "trial-bindings") {
      const trial = collectTrialBindings({ repo, current_default: options.source });
      report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, diagnostics: [], trial };
    } else if (options.command === "check-upgrade-signals") {
      const { settings } = loadCommittedSettings(repo, options.source);
      const identity = settings.publication.mode === "staged" ? undefined : nativeContext(repo, options.source).identity;
      const signals = checkUpgradeSignals({ repo, source: options.source, identity });
      report = { schema_version: 1, command: options.command, outcome: signals.matches === false ? "attention" : "collected",
        source_commit: options.source, diagnostics: [], signals };
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
    report = { schema_version: 1, command: argv[0] ?? "", outcome: "incomplete", diagnostics: [{ code: argv[0] === "scan" ? "scan-setup-or-input" : "command-setup-or-input",
      message: error instanceof Error ? error.message : "Command input or setup unavailable" }] };
  }
  writeSync(1, JSON.stringify(report) + "\n");
  return report.outcome === "incomplete" ? 2 : report.outcome === "attention" ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
