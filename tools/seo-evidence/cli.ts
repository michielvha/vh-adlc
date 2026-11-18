#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { writeSync } from "node:fs";
import { parseArgs } from "node:util";
import { stable } from "./src/bundle";
import { compare } from "./src/compare";
import { inspect } from "./src/inspect";
import { applyPolicy, parsePolicy } from "./src/policy";
import { renderFiles, renderStatus } from "./src/report";
import { parseSnapshot } from "./src/schema";
import { snapshot } from "./src/snapshot";
import { readArtifact, writeArtifact } from "./src/storage";

const HELP = `SEO evidence: inspect saved HTML evidence without network access.
Usage:
  bun tools/seo-evidence/cli.ts snapshot --input bundle.yaml --output NEW_DIRECTORY
  bun tools/seo-evidence/cli.ts inspect --snapshot snapshot.json --output NEW_DIRECTORY [--policy policy.yaml]
  bun tools/seo-evidence/cli.ts compare --baseline snapshot.json --current snapshot.json --output NEW_DIRECTORY [--policy policy.yaml]
Flags: --json (one result object), --ascii, --plain, --help
Exit codes: 0 completed without selected violations; 2 invalid/incompatible/partial; 3 selected violations.
Outputs must be new directories under an existing parent. A completed artifact is not a whole-site audit.
`;
// Bun's stream fast path can be denied for child-process pipes in sandboxed hosts.
// Ordinary write(2) keeps the documented stream contract in those environments.
function write(fd: number, text: string): void {
  const buffer = Buffer.from(text); let offset = 0;
  while (offset < buffer.length) { const written = writeSync(fd, buffer, offset); if (written === 0) throw new Error("Output stream made no progress"); offset += written; }
}
export async function main(args: string[]): Promise<number> {
  const json = args.includes("--json"); const controller = new AbortController();
  const cancel = () => controller.abort(new Error("Cancelled"));
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    if (args.includes("--help") || args.length === 0) { write(1, HELP); return 0; }
    const command = args[0];
    if (command !== "snapshot" && command !== "inspect" && command !== "compare") throw new Error("Expected snapshot, inspect or compare");
    const flags = args.slice(1); const seen = new Set<string>();
    for (const arg of flags) if (arg.startsWith("--")) { const name = arg.split("=")[0] ?? arg; if (seen.has(name)) throw new Error("Duplicate option: " + name); seen.add(name); }
    const parsed = parseArgs({ args: flags, strict: true, allowPositionals: false, options: { input: { type: "string" }, output: { type: "string" }, snapshot: { type: "string" }, baseline: { type: "string" }, current: { type: "string" }, policy: { type: "string" }, json: { type: "boolean" }, ascii: { type: "boolean" }, plain: { type: "boolean" } } });
    const allowed = new Set(["output", "json", "ascii", "plain", ...(command === "snapshot" ? ["input"] : command === "inspect" ? ["snapshot", "policy"] : ["baseline", "current", "policy"])]);
    for (const name of Object.keys(parsed.values)) if (!allowed.has(name)) throw new Error("Option is not applicable: " + name);
    const required = (name: "input" | "output" | "snapshot" | "baseline" | "current") => { const value = parsed.values[name]; if (typeof value !== "string" || !value) throw new Error("Missing --" + name); return value; };
    const output = required("output");
    let result: { schema_version: number; operation: string; analysis_status: string; policy_status: string; exit_code: 0 | 2 | 3 };
    if (command === "snapshot") {
      const data = await snapshot(required("input"));
      await writeArtifact(output, { "snapshot.json": stable(data) }, controller.signal);
      result = { schema_version: 1, operation: command, analysis_status: data.analysis_status, policy_status: "not_applicable", exit_code: data.analysis_status === "partial" ? 2 : 0 };
    } else {
      const report = command === "inspect" ? inspect(parseSnapshot(await readArtifact(required("snapshot")))) : compare(await readArtifact(required("baseline")), await readArtifact(required("current")));
      const policy = parsed.values.policy ? parsePolicy(await readFile(parsed.values.policy, "utf8")) : undefined;
      const data = applyPolicy(report, policy);
      await writeArtifact(output, renderFiles(data), controller.signal);
      result = { schema_version: 1, operation: command, analysis_status: data.analysis_status, policy_status: data.policy_status, exit_code: data.exit_code };
    }
    if (json) write(1, stable(result));
    else write(2, renderStatus(result, { tty: Boolean(process.stderr.isTTY), ascii: Boolean(parsed.values.ascii || parsed.values.plain), noColor: process.env.NO_COLOR }));
    return result.exit_code;
  } catch (error: unknown) {
    const result = { schema_version: 1, operation: args[0] ?? "unknown", analysis_status: "invalid", policy_status: "not_evaluated", exit_code: 2 };
    if (json) write(1, stable(result));
    write(2, "FAIL Failed: " + (error instanceof Error ? error.message : "Unknown error") + "\n");
    return 2;
  } finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
