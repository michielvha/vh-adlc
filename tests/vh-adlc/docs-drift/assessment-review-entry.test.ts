import { expect, test } from "bun:test";
import { join } from "node:path";

const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
const commands = ["collect-assessment-review-target", "read-assessment-review"];
function invoke(command: string, extra: string[] = []) {
  const result = Bun.spawnSync([process.execPath, entry, command, "--repo", "/nonexistent-assessment-source", "--source", "a".repeat(40),
    "--artifact-root", "/nonexistent-assessment-output", ...extra], { stdout: "pipe", stderr: "pipe", timeout: 10000 });
  expect(result.exitCode, result.stderr.toString()).toBe(2); expect(result.stdout.length, result.stderr.toString()).toBeGreaterThan(0);
  return JSON.parse(result.stdout.toString());
}

test.each(commands)("the normal %s entry names the original native prerequisites", command => {
  const report = invoke(command);
  expect(report.command).toBe(command);
  expect(report.outcome).toBe("incomplete");
  expect(report.diagnostics[0].message).toContain(command + " requires");
  expect(report.diagnostics[0].message).toContain("--worker-capture");
  if (command === "read-assessment-review") expect(report.diagnostics[0].message).toContain("--reviewer-capture");
});

test.each(commands)("the normal %s entry rejects a loose assessment or effect grant", command => {
  for (const flag of ["--assessment", "--authority"]) {
    const report = invoke(command, [flag, "untrusted.json"]);
    expect(report.diagnostics[0].message).toContain("unknown " + command + " option");
  }
});
