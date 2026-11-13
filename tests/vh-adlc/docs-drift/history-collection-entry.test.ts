import { expect, test } from "bun:test";
import { join } from "node:path";

const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
function invoke(extra: string[] = []) {
  const result = Bun.spawnSync([process.execPath, entry, "collect-report-history", "--repo", "/nonexistent-history-source", "--source", "a".repeat(40),
    "--artifact-root", "/nonexistent-history-output", ...extra], { stdout: "pipe", stderr: "pipe", timeout: 10000 });
  expect(result.exitCode, result.stderr.toString()).toBe(2);
  expect(result.stdout.length, result.stderr.toString()).toBeGreaterThan(0);
  return JSON.parse(result.stdout.toString());
}

test("the history entry requires original source, decisions and retained runtime", () => {
  const result = invoke();
  expect(result.diagnostics[0].message).toContain("collect-report-history requires");
  for (const flag of ["--source-verification", "--decisions", "--cache-root", "--entry", "--launcher", "--settings"])
    expect(result.diagnostics[0].message).toContain(flag);
});
test("the history entry rejects report-provided provenance or permission flags", () => {
  for (const flag of ["--history", "--producer", "--authority", "--started-at", "--local-invocations"]) {
    const result = invoke([flag, "untrusted.json"]);
    expect(result.diagnostics[0].message).toContain("unknown collect-report-history option");
  }
});
