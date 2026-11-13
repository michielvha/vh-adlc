import { expect, test } from "bun:test";
import { join } from "node:path";
const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
function invoke(extra: string[] = []) {
  const result = Bun.spawnSync([process.execPath, entry, "run-audit", "--repo", "/missing-audit-source", "--source", "a".repeat(40),
    "--artifact-root", "/missing-audit-artifacts", ...extra], { stdout: "pipe", stderr: "pipe", timeout: 10000 });
  expect(result.exitCode).toBe(2); return JSON.parse(result.stdout.toString());
}
test("normal audit command requires original source/decision and retained runtime inputs", () => {
  const result = invoke(); expect(result.diagnostics[0].message).toContain("run-audit requires");
  for (const flag of ["--source-verification", "--decisions", "--cache-root", "--entry", "--launcher", "--settings"])
    expect(result.diagnostics[0].message).toContain(flag);
});
test.each(["--worker-capture", "--reviewer-capture", "--authority", "--assessment", "--provider", "--prompt", "--session-id", "--hosted-run-attempt"])("normal audit command rejects supplied roles or overrides: %s", flag => {
  expect(invoke([flag, "untrusted"]).diagnostics[0].message).toContain("unknown run-audit option");
});
