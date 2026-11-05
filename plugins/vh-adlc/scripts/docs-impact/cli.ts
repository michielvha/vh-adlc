#!/usr/bin/env bun
import { readFileSync, writeSync } from "node:fs";
import { collectImpact, repositoryPath, resolveRoots, type ImpactReport, type RootsReport } from "./collection";

const usage = `Documentation impact protocol 1
bun <plugin>/scripts/docs-impact/cli.ts check --repo <repo> [--base <ref>]
  [--path <source>]... [--paths0-from <file|->] [--metadata-path <doc>]...
  [--docs-root <root>]... [--format json|text]
bun <plugin>/scripts/docs-impact/cli.ts roots --repo <repo> [--format json|text]

check requires a base, source selection or explicit metadata selection. Sources
and metadata overlays are independent. Checking is offline and read-only; prepare
the locked binary with the plugin's ensure-vh-adlc.sh before calling this command.
JSON is the default. candidates/none exit 0; incomplete exits 2. roots returns
declared/absent with exit 0, incomplete with exit 2. No result certifies accuracy.
`;

function main(argv: string[]): number {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "help")) { writeSync(1, usage); return 0; }
  let format = "json"; const command = argv[0] ?? "check";
  // Preserve the requested rendering even when an earlier option fails validation.
  for (let at = 1; at < argv.length; at++) {
    const value = argv[at] === "--format" ? argv[at + 1] : argv[at].startsWith("--format=") ? argv[at].slice(9) : undefined;
    if (value === "json" || value === "text") format = value;
  }
  let report: ImpactReport | RootsReport | { schema_version: 1; protocol: 1; command: string; outcome: "incomplete"; candidates: []; diagnostics: Array<{ code: string; message: string }> };
  try {
    if (command !== "check" && command !== "roots") throw Error("expected check or roots");
    const paths: string[] = [], metadataPaths: string[] = [], roots: string[] = [], unique = new Map<string, string>();
    for (let at = 1; at < argv.length; at++) {
      const arg = argv[at], equal = arg.indexOf("="), flag = equal < 0 ? arg : arg.slice(0, equal);
      if (!["--repo", "--base", "--path", "--paths0-from", "--metadata-path", "--docs-root", "--format"].includes(flag)) throw Error("unknown option or unexpected positional argument");
      const value = equal < 0 ? argv[++at] : arg.slice(equal + 1);
      if (value === undefined || value === "") throw Error("option requires a nonempty value");
      if (command === "roots" && flag !== "--repo" && flag !== "--format") throw Error("roots accepts only --repo and --format");
      if (flag === "--path") paths.push(repositoryPath(value));
      else if (flag === "--metadata-path") metadataPaths.push(repositoryPath(value));
      else if (flag === "--docs-root") roots.push(repositoryPath(value));
      else {
        if (unique.has(flag)) throw Error("duplicate singleton option");
        unique.set(flag, value);
        if (flag === "--format") { if (value !== "json" && value !== "text") throw Error("format must be json or text"); format = value; }
      }
    }
    const repo = unique.get("--repo"); if (!repo) throw Error("--repo is required");
    if (unique.has("--paths0-from")) {
      let input: Buffer;
      try { input = readFileSync(unique.get("--paths0-from") === "-" ? 0 : unique.get("--paths0-from")!); } catch { throw Error("could not read the selected NUL path input"); }
      if (input.length) {
        if (input[input.length - 1] !== 0) throw Error("NUL input must end in a NUL delimiter");
        let decoded: string; try { decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input); } catch { throw Error("path input must be valid UTF-8"); }
        for (const path of decoded.slice(0, -1).split("\0")) paths.push(repositoryPath(path));
      }
    }
    if (command === "roots") report = resolveRoots(repo);
    else {
      if (!unique.has("--base") && !paths.length && !metadataPaths.length) throw Error("check needs an explicit source/base or metadata selection");
      report = collectImpact({ repo, ...(roots.length ? { roots } : {}), paths, metadataPaths, base: unique.get("--base") });
    }
  } catch (error) {
    // Only fixed local validation messages escape. Collection diagnostics never expose subprocess stderr.
    report = { schema_version: 1, protocol: 1, command, outcome: "incomplete", candidates: [], diagnostics: [{ code: "input", message: error instanceof Error ? error.message : "could not validate the request" }] };
  }
  writeSync(1, format === "json" ? JSON.stringify(report) + "\n" : render(report));
  return report.outcome === "incomplete" ? 2 : 0;
}

function render(report: { command: string; outcome: string; diagnostics: Array<{ code: string; path?: string; message: string }>; candidates?: ImpactReport["candidates"]; roots?: string[] }): string {
  const lines = [`${report.command}: ${report.outcome} (coverage-only; accuracy requires review)`];
  if (report.roots) lines.push(`Roots: ${report.roots.map(root => JSON.stringify(root)).join(", ")}`);
  for (const candidate of report.candidates ?? []) {
    lines.push(`${JSON.stringify(candidate.path)}${candidate.feature_attention ? " [feature attention]" : ""}`);
    for (const match of candidate.matches) lines.push(`  ${JSON.stringify(match.source)} matches ${JSON.stringify(match.pattern)}`);
  }
  for (const finding of report.diagnostics) lines.push(`${finding.code}${finding.path === undefined ? "" : " " + JSON.stringify(finding.path)}: ${finding.message}`);
  {
    // Render the complete bindings/scope too, so the text view cannot hide excluded inputs.
    lines.push("Scope and metadata: " + JSON.stringify(report));
  }
  return lines.join("\n") + "\n";
}

process.exitCode = main(process.argv.slice(2));
