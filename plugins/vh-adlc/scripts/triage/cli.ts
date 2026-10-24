import { collect } from "./collect";
import { githubReader } from "./github";
import { loadSettings } from "./settings";
import type { Mode } from "./types";

function argumentsFor(values: string[]) {
  const result: Record<string, string> = {};
  const allowed = ["--repo", "--settings", "--mode", "--ids"];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!allowed.includes(key) || !value || value.startsWith("--") || key in result) throw new Error("invalid-triage-argument");
    result[key] = value;
  }
  return result;
}
async function main() {
  const [command, ...values] = process.argv.slice(2), args = argumentsFor(values);
  if (!["settings", "collect"].includes(command)) throw new Error("expected settings or collect");
  const config = loadSettings(args["--repo"] ?? process.cwd(), args["--settings"] ? { settingsPath: args["--settings"] } : {});
  if (command === "settings") return config;
  return collect(config, githubReader(config), { mode: (args["--mode"] ?? "sweep") as Mode, ids: args["--ids"]?.split(",").map(Number) });
}
if (import.meta.main) {
  try { process.stdout.write(`${JSON.stringify(await main(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "triage failed"}\n`); process.exitCode = 1; }
}
