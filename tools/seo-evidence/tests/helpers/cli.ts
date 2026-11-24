import { resolve } from "node:path";
import { z } from "zod";
export const cli = resolve(import.meta.dir, "../../cli.ts");
export const example = resolve(import.meta.dir, "../../examples/basic/bundle.yaml");
export const resultSchema = z.object({ analysis_status: z.string(), policy_status: z.string(), exit_code: z.number().int() });
export async function run(args: string[], env: Record<string, string | undefined> = {}) {
  const p = Bun.spawn([process.execPath, cli, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", ...env } });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, stdout, stderr };
}
