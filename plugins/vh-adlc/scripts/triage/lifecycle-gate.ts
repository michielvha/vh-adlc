import{readFileSync}from"node:fs";
import{resolve}from"node:path";
import type{Settings}from"./types";
export async function lifecycleGate(config:Settings,gate:{status:string;document:string}){
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
