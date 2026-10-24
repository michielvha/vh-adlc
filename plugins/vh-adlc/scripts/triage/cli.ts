import { collect } from "./collect";
import { githubReader } from "./github";
import { loadSettings } from "./settings";
import { buildReport, saveReport } from "./report";
import type { Observation } from "./report";
import type { Inventory, Mode } from "./types";

function argumentsFor(command: string, values: string[]) {
  const result: Record<string, string> = {};
  const allowed = ["--repo", "--settings", ...(command === "collect" ? ["--mode", "--ids"] :
    command === "report" ? ["--inventory", "--observations", "--index-requests", "--run-id", "--report-output"] : [])];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!allowed.includes(key) || !value || value.startsWith("--") || key in result) throw new Error("invalid-triage-argument");
    result[key] = value;
  }
  return result;
}
async function main() {
  const [command, ...values] = process.argv.slice(2), args = argumentsFor(command, values);
  if (!["settings", "collect", "report"].includes(command)) throw new Error("expected settings, collect or report");
  const config = loadSettings(args["--repo"] ?? process.cwd(), args["--settings"] ? { settingsPath: args["--settings"] } : {});
  if (command === "settings") return config;
  if (command === "report") {
    if (!args["--inventory"] || !args["--observations"]) throw new Error("report requires inventory and observations files");
    const inventory = await Bun.file(args["--inventory"]).json() as Inventory;
    const observations = await Bun.file(args["--observations"]).json() as Observation[];
    const indexRequests = args["--index-requests"]?.split(",").map(Number);
    const report = buildReport(config, inventory, observations, { runId: args["--run-id"], indexRequests });
    return { path: saveReport(config, report, { output: args["--report-output"] }), report };
  }
  return collect(config, githubReader(config), { mode: (args["--mode"] ?? "sweep") as Mode, ids: args["--ids"]?.split(",").map(Number) });
}
if (import.meta.main) {
  try { process.stdout.write(`${JSON.stringify(await main(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "triage failed"}\n`); process.exitCode = 1; }
}
