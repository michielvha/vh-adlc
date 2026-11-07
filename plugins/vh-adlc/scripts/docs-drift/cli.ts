#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { captureSnapshot, externalArtifactDirectory } from "./snapshot";
import { runScan, type ScanRun } from "./scan";

type Diagnostic = { code: string; message: string };
export type CLIReport = {
  schema_version: 1; command: string; outcome: "collected" | "incomplete"; diagnostics: Diagnostic[];
  source_commit?: string; settings_sha256?: string; bindings_sha256?: string; assessment?: ScanRun;
};
const usage = `Documentation drift scan protocol 1
bun <plugin>/scripts/docs-drift/cli.ts scan --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory>

Prepare the locked verified binary and required knowledge before invoking this
helper. The scanner reads the selected committed configuration and runs in its
owned source copy. JSON reports collection accounting. Candidate assessment,
content decisions and publication have their own lifecycle gates.
Complete collection exits 0. Incomplete input, setup or collection exits 2.
`;

function argumentsForScan(argv: string[]) {
  if (argv[0] !== "scan") throw Error("expected scan");
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!["--repo", "--source", "--artifact-root"].includes(flag)) throw Error("unknown scan option");
    if (values.has(flag)) throw Error("duplicate scan option");
    if (!value || value.startsWith("--")) throw Error("scan option requires a value");
    values.set(flag, value);
  }
  const repo = values.get("--repo"), source = values.get("--source"), artifacts = values.get("--artifact-root");
  if (!repo || !source || !artifacts) throw Error("scan requires repo, source and artifact-root");
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source)) throw Error("scan requires a full immutable source commit");
  return { repo, source, artifacts };
}

/** Technical collection feeds the controller's separate semantic decisions and effect grants. */
export async function main(argv: string[]): Promise<number> {
  if (argv.length === 1 && ["--help", "help"].includes(argv[0])) { writeSync(1, usage); return 0; }
  let report: CLIReport;
  try {
    const options = argumentsForScan(argv), repo = realpathSync(options.repo);
    const requestedRoot = resolve(options.artifacts), artifacts = externalArtifactDirectory(requestedRoot, repo);
    const stat = lstatSync(requestedRoot), owner = process.getuid?.();
    if (owner === undefined || artifacts !== requestedRoot || !stat.isDirectory() || stat.isSymbolicLink()
      || stat.uid !== owner || (stat.mode & 0o077) !== 0) throw Error("scan requires a private owned external artifact directory");
    const snapshot = captureSnapshot(repo, options.source);
    const assessment = await runScan(snapshot, { artifact_root: artifacts, owner: "uid-" + owner, run: randomUUID() });
    report = { schema_version: 1, command: "scan", outcome: assessment.complete ? "collected" : "incomplete",
      source_commit: snapshot.source_commit, settings_sha256: snapshot.settings_sha256,
      bindings_sha256: snapshot.protocol.sha256, diagnostics: assessment.diagnostics, assessment };
  } catch (error) {
    report = { schema_version: 1, command: argv[0] ?? "", outcome: "incomplete", diagnostics: [{ code: "scan-setup-or-input",
      message: error instanceof Error ? error.message : "Scan input or setup unavailable" }] };
  }
  writeSync(1, JSON.stringify(report) + "\n");
  return report.outcome === "collected" ? 0 : 2;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
