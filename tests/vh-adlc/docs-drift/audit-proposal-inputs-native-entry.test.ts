import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type { bindingFixture } from "./binding-fixture";
import { auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed audit proposal CLI roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

async function invoke(f: Awaited<ReturnType<typeof bindingFixture>>, entry: "copilot" | "hosted", expectedExit: number) {
  const { collectAuditProposalInputs, auditProposalInputsOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs");
  const collection = await collectAuditProposalInputs({ ...f.options, entry });
  expect(collection.complete, JSON.stringify(collection.diagnostics)).toBe(expectedExit === 0);
  const result = auditProposalInputsOutput(collection);
  expect(Buffer.byteLength(JSON.stringify(result) + "\n")).toBeLessThanOrEqual(524288);
  return result;
}


test.each(["multiple", "partial-missing"] as const)("the native audit proposal collector accounts for full shared and legacy inputs: %s", async fault => {
  try {
    const started = performance.now(), f = await auditProposalInputsFixture(roots, fault), before = captureRepositoryState(f.repo);
    expect(performance.now() - started).toBeLessThan(60000);
    const result = await invoke(f, "copilot", fault === "multiple" ? 0 : 2);
    expect(result.audit_proposal_inputs).toMatchObject({ authority: "none", source_commit: f.source, required_proposals: 2,
      collected_proposals: fault === "multiple" ? 2 : 1, complete: fault === "multiple" });
    expect(result.audit_proposal_inputs.proposals.map((value: { number: number }) => value.number)).toEqual([11, 12]);
    if (fault === "multiple") {
      expect(result.audit_proposal_inputs.proposals.every(value => value.files === 1 && value.hunks !== null && value.hunks > 0)).toBe(true);
      expect(result.audit_proposal_inputs.proposals.map((value: { head_sha: string }) => value.head_sha)).toEqual([f.proposalHead, f.legacyHead]);
      expect(result.audit_proposal_inputs.proposals[0].binding_sha256).not.toBe(result.audit_proposal_inputs.proposals[1].binding_sha256);
    }
    else expect(result.audit_proposal_inputs.proposals[1]).toMatchObject({ files: null, hunks: null, binding_sha256: null });
    const stdout = JSON.stringify(result);
    expect(stdout).not.toContain("Synthetic original proposal body"); expect(stdout).not.toContain("Synthetic legacy original proposal");
    expect(stdout).not.toContain("Current candidate guide"); expect(stdout).not.toContain("Distinct legacy candidate guide"); expect(stdout).not.toContain("after_base64");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
