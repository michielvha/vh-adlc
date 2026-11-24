import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { collectAuditProposalInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs";
import { recheckCurrentProposalVerification, verifyCurrentProposals } from "../../../plugins/vh-adlc/scripts/docs-drift/current-proposal-verification";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = [];
let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved partial current-verification roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("a later failed proposal invalidates the earlier successful member in the same current proof", async () => {
  try {
    const f = await auditProposalInputsFixture(roots, "multiple", { sourceCheckNeedsRepair: true });
    const inputs = await collectAuditProposalInputs(f.options);
    expect(inputs.complete, JSON.stringify(inputs.diagnostics)).toBe(true);
    const before = captureRepositoryState(f.repo);
    const result = await verifyCurrentProposals({ repo: f.repo, source: f.source, artifact_root: f.artifacts,
      owner: f.owner, run: f.run, proposals: inputs, supported: [11, 12] });
    expect(result).toMatchObject({ complete: false, verified_proposals: 0, required_proposals: 2 });
    expect(result.proposals.map(row => row.number)).toEqual([11, 12]);
    for (const row of result.proposals) {
      expect(row.outcome).toBe("incomplete");
      expect(row.candidate_commit).toMatch(/^[a-f0-9]{40}$/u);
      expect(row.verification_reference).toBeNull();
      expect(row.corrections).toEqual([]);
      expect(row.postimages).toEqual([]);
    }
    expect(result.proposals[1].diagnostics.join("\n")).toContain("Current proposal configured verification failed");
    expect(() => recheckCurrentProposalVerification(result)).toThrow("Original complete current proposal verification required");
    if (!result.evidence) throw Error("The bounded incomplete original proof must remain retained");
    const bytes = readFileSync(join(f.artifacts, result.evidence.path));
    expect(sha256(bytes)).toBe(result.evidence.sha256);
    expect(JSON.parse(bytes.toString())).toMatchObject({ complete: false, verified_proposals: 0 });
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 180000);
