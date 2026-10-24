import { collect } from "./collect";
import { githubExecutor, githubReader } from "./github";
import { loadSettings } from "./settings";
import { buildReport, saveReport } from "./report";
import type { Observation } from "./report";
import type { Inventory, Mode,Settings } from "./types";
import { executeBatch, planBatch } from "./execute";
import type { Action, Approval, Batch } from "./execute";
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import{inspectSources,verifyCommand}from"./verification";

function argumentsFor(command: string, values: string[]) {
  const result: Record<string, string> = {};
  const allowed = ["--repo", "--settings", ...(command === "session" ? ["--inventory","--checks","--output-dir","--control-fd"] : command === "collect" ? ["--mode", "--ids"] :
    command === "report" ? ["--inventory", "--observations", "--index-requests", "--run-id", "--report-output"] :
    command === "batch" ? ["--inventory", "--report", "--actions", "--batch-output"] :
    command === "execute" ? ["--batch", "--approval", "--journal"] : command==="verify"?["--argv","--pass"]:command==="inspect"?["--paths","--pass"]:[])];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!allowed.includes(key) || !value || value.startsWith("--") || key in result) throw new Error("invalid-triage-argument");
    result[key] = value;
  }
  return result;
}
async function lifecycleGate(config:Settings,gate:{status:string;document:string}){
        const installer = Bun.spawnSync(["bash", resolve(import.meta.dir, "../ensure-vh-adlc.sh")], { stdout: "pipe", stderr: "pipe" });
        if (installer.exitCode !== 0) return false;
        const binary = installer.stdout.toString().trim(), knowledge = readFileSync(resolve(import.meta.dir, "../../knowledge.md"), "utf8");
        const pins = [...new Set(knowledge.match(/\b[0-9a-f]{40}\b/g) ?? [])];
        if (pins.length !== 1) return false;
        const repo = Bun.spawnSync(["gh", "api", "--hostname", config.hostname, "--method", "GET", `repos/${config.repository}`, "--jq", ".default_branch"], { stdout: "pipe", stderr: "pipe" });
        const branch = repo.stdout.toString().trim();
        if (repo.exitCode !== 0 || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(branch)) return false;
        if (Bun.spawnSync(["git", "-C", config.root, "fetch", "origin", branch], { stdout: "pipe", stderr: "pipe" }).exitCode !== 0) return false;
        const check = Bun.spawnSync([binary, "gate", gate.status, gate.document, "--repo", config.root, "--plugin-pin", pins[0]], { stdout: "pipe", stderr: "pipe" });
        if (check.exitCode !== 0) return false;
        try {
          const result=JSON.parse(check.stdout.toString());
          return result.result==="pass" && typeof result.data?.line==="string" ? {pass:true,line:result.data.line} : false;
        } catch { return false; }
}
async function main() {
  const [command, ...values] = process.argv.slice(2), args = argumentsFor(command, values);
  if (!["settings", "collect", "report", "batch", "execute","verify","inspect","session"].includes(command)) throw new Error("expected settings, collect, report, batch, execute, verify, inspect or session");
  const config = loadSettings(args["--repo"] ?? process.cwd(), args["--settings"] ? { settingsPath: args["--settings"] } : {});
  if (command === "settings") return config;
  if(command==="session"){
    if(!args["--inventory"]||!args["--checks"]||!args["--output-dir"])throw Error("session requires fixed inventory, operator checks and output directory");
    const{createInterface}=await import("node:readline"),{verificationSession,operatorInput}=await import("./session");
    const checks=await Bun.file(args["--checks"]).json();
    if(!checks||typeof checks!=="object"||Array.isArray(checks)||Object.values(checks).some(value=>!Array.isArray(value)||!value.length||value.some(arg=>typeof arg!=="string")))throw Error("invalid operator checks");
    await verificationSession({config,inventory:await Bun.file(args["--inventory"]).json(),checks,output:resolve(args["--output-dir"]),analysis:createInterface({input:process.stdin,crlfDelay:Infinity}),control:args["--control-fd"]?operatorInput(Number(args["--control-fd"])):undefined,adapter:githubExecutor(config),gate:gate=>lifecycleGate(config,gate),write:line=>process.stdout.write(line+"\n")});
    return;
  }
  if(command==="verify"||command==="inspect"){
    const phase=args["--pass"];if(!["primary","adversarial"].includes(phase))throw Error("verification requires primary or adversarial pass");
    const values=await Bun.file(args[command==="verify"?"--argv":"--paths"]??"").json();
    if(!Array.isArray(values)||!values.length||values.some(value=>typeof value!=="string"))throw Error("verification requires a JSON string array");
    return command==="verify"?verifyCommand(config,values,phase as "primary"|"adversarial"):inspectSources(config,values,phase as "primary"|"adversarial");
  }
  if (command === "batch") {
    if (!["--inventory", "--report", "--actions", "--batch-output"].every((key) => args[key])) throw new Error("batch requires inventory, report, actions and batch-output files");
    const batch = planBatch(config, await Bun.file(args["--inventory"]).json() as Inventory,
      await Bun.file(args["--report"]).json(), await Bun.file(args["--actions"]).json() as Action[]);
    writeFileSync(args["--batch-output"], JSON.stringify(batch, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return batch;
  }
  if (command === "execute") {
    if (!["--batch", "--approval", "--journal"].every((key) => args[key])) throw new Error("execute requires batch, approval and journal files");
    const result = await executeBatch(config, await Bun.file(args["--batch"]).json() as Batch,
      await Bun.file(args["--approval"]).json() as Approval, githubExecutor(config), { journal: args["--journal"], gate:gate=>lifecycleGate(config,gate) });
    if (result.blocked.length || result.failed.length) process.exitCode = 1;
    return result;
  }
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
  try { const result=await main();if(result!==undefined)process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "triage failed"}\n`); process.exitCode = 1; }
}
