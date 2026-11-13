import { expect, test } from "bun:test";
import { join } from "node:path";

const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
function invoke(extra: string[] = []) {
  const result = Bun.spawnSync([process.execPath, entry, "collect-audit-proposal-inputs", "--repo", "/nonexistent-audit-source", "--source", "a".repeat(40),
    "--artifact-root", "/nonexistent-audit-output", ...extra], { stdout: "pipe", stderr: "pipe", timeout: 10000 });
  expect(result.exitCode, result.stderr.toString()).toBe(2);
  expect(result.stdout.length, result.stderr.toString()).toBeGreaterThan(0);
  return JSON.parse(result.stdout.toString());
}

test("the audit proposal entry requires original source, decisions and retained runtime", () => {
  const result = invoke();
  expect(result.diagnostics[0].message).toContain("collect-audit-proposal-inputs requires");
  for (const flag of ["--source-verification", "--decisions", "--cache-root", "--entry", "--launcher", "--settings"])
    expect(result.diagnostics[0].message).toContain(flag);
});
test("the audit proposal entry rejects report-provided provenance or permission flags", () => {
  for (const flag of ["--proposals", "--complete", "--authority", "--assessment", "--selection", "--publication"]) {
    const result = invoke([flag, "untrusted.json"]);
    expect(result.diagnostics[0].message).toContain("unknown collect-audit-proposal-inputs option");
  }
});
