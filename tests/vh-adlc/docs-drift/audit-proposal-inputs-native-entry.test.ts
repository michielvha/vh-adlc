import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { bindingFixture } from "./binding-fixture";
import { auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed audit proposal CLI roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function environment(f: Awaited<ReturnType<typeof bindingFixture>>): Record<string, string> {
  return Object.fromEntries(Object.entries(f.native.environment).filter((row): row is [string, string] => typeof row[1] === "string"));
}
async function invoke(f: Awaited<ReturnType<typeof bindingFixture>>, entry: "copilot" | "hosted", env: Record<string, string>, expectedExit: number) {
  const options = f.options;
  const argv = [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), "collect-audit-proposal-inputs",
    "--repo", f.repo, "--source", f.source, "--artifact-root", f.artifacts, "--cache-root", options.cache_directory,
    "--entry", entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
    "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
    "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256];
  const completed = await executeOwnedProcess({ argv, cwd: f.repo, env, capture: "memory", watched_outputs: [], timeout_ms: 60000,
    stdout: join(f.artifacts, "audit-proposal-cli-stdout"), stderr: join(f.artifacts, "audit-proposal-cli-stderr"),
    started: pid => writeFileSync(join(f.artifacts, "audit-proposal-cli-start.json"), canonicalJSON({ pid, argv }), { mode: 0o600 }) });
  const { captured, ...metadata } = completed, stdout = Buffer.from(captured?.stdout ?? []), stderr = Buffer.from(captured?.stderr ?? []);
  writeFileSync(join(f.artifacts, "audit-proposal-cli-stdout"), stdout, { mode: 0o600 }); writeFileSync(join(f.artifacts, "audit-proposal-cli-stderr"), stderr, { mode: 0o600 });
  writeFileSync(join(f.artifacts, "audit-proposal-cli-process.json"), canonicalJSON(metadata), { mode: 0o600 });
  expect(metadata.reaped).toBe(true); expect(metadata.timed_out, JSON.stringify(metadata)).toBe(false); expect(metadata.exit_code, stderr.toString()).toBe(expectedExit);
  expect(stdout.length).toBeGreaterThan(0); expect(stdout.length).toBeLessThanOrEqual(524288);
  const result = JSON.parse(stdout.toString());
  expect(result.command).toBe("collect-audit-proposal-inputs"); expect(result.outcome, JSON.stringify(result.diagnostics)).toBe(expectedExit === 0 ? "collected" : "incomplete");
  return result;
}


test.each(["multiple", "partial-missing"] as const)("the audit proposal CLI accounts for full shared and legacy inputs: %s", async fault => {
  try {
    const started = performance.now(), f = await auditProposalInputsFixture(roots, fault), before = captureRepositoryState(f.repo);
    expect(performance.now() - started).toBeLessThan(60000);
    const result = await invoke(f, "copilot", environment(f), fault === "multiple" ? 0 : 2);
    expect(result.audit_proposal_inputs).toMatchObject({ authority: "none", source_commit: f.source, required_proposals: 2,
      collected_proposals: fault === "multiple" ? 2 : 1, complete: fault === "multiple" });
    expect(result.audit_proposal_inputs.proposals.map((value: { number: number }) => value.number)).toEqual([11, 12]);
    if (fault === "multiple") {
      expect(result.audit_proposal_inputs.proposals.every((value: { files: number; hunks: number }) => value.files === 1 && value.hunks > 0)).toBe(true);
      expect(result.audit_proposal_inputs.proposals.map((value: { head_sha: string }) => value.head_sha)).toEqual([f.proposalHead, f.legacyHead]);
      expect(result.audit_proposal_inputs.proposals[0].binding_sha256).not.toBe(result.audit_proposal_inputs.proposals[1].binding_sha256);
    }
    else expect(result.audit_proposal_inputs.proposals[1]).toMatchObject({ files: null, hunks: null, binding_sha256: null });
    const stdout = readFileSync(join(f.artifacts, "audit-proposal-cli-stdout"), "utf8");
    expect(stdout).not.toContain("Synthetic original proposal body"); expect(stdout).not.toContain("Synthetic legacy original proposal");
    expect(stdout).not.toContain("Current candidate guide"); expect(stdout).not.toContain("Distinct legacy candidate guide"); expect(stdout).not.toContain("after_base64");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
