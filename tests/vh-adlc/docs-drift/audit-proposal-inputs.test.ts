import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { auditInputFaults, auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed audit proposal input roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(auditInputFaults)("audit proposal inputs collect every native full diff before semantic assessment: %s", async fault => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs"), f = await auditProposalInputsFixture(roots, fault);
    const before = captureRepositoryState(f.repo), result = await api.collectAuditProposalInputs(f.options);
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(["empty", "matching", "multiple"].includes(fault)); expect(result.authority).toBe("none");
    expect(result.required_proposals).toBe(fault === "empty" ? 0 : ["multiple", "partial-missing"].includes(fault) ? 2 : 1);
    expect(result.collected_proposals).toBe(fault === "multiple" ? 2 : ["matching", "partial-missing"].includes(fault) ? 1 : 0);
    if (result.complete) {
      const originals = api.readCollectedAuditProposals(result);
      expect(result.required_proposals).toBe(originals.length);
      if (fault === "multiple") expect(originals.map(proposal => proposal.number)).toEqual([11, 12]);
      if (fault === "matching") {
        expect(originals[0].number).toBe(11); expect(originals[0].hunks.length).toBeGreaterThan(0);
        expect(originals[0].files.map(file => file.path)).toEqual(["docs/guide.md"]);
        expect(Buffer.from(originals[0].hunks[0].after_base64 ?? "", "base64").toString()).toContain("# Current candidate guide\n");
      }
      expect(() => api.readCollectedAuditProposals(JSON.parse(JSON.stringify(result)))).toThrow("Original native audit proposal inputs required");
    } else {
      expect(() => api.readCollectedAuditProposals(result)).toThrow("Original native audit proposal inputs required");
      if (fault === "changed-after-fetch") expect(result.scope_changed).toBe(true);
      if (fault === "oversized-inputs") expect(result.diagnostics.join("\n")).toContain("retained entry bound");
      const unknown = result.proposals[fault === "partial-missing" ? 1 : 0];
      expect(unknown.files).toBe(null); expect(unknown.hunks).toBe(null);
      if (fault === "partial-missing") expect(result.proposals[0].files).toBe(1);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
