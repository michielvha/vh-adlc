import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { collectAuditProposalInputs, readCollectedAuditProposals } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed proposal assessment roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("proposal assessments account for every original full hunk and quote current source without granting semantic authority", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/proposal-assessment");
    const f = await auditProposalInputsFixture(roots, "multiple"), collected = await collectAuditProposalInputs(f.options);
    expect(collected.complete, JSON.stringify(collected.diagnostics)).toBe(true);
    const originals = readCollectedAuditProposals(collected), bytes = readFileSync(join(f.repo, "docs/guide.md"));
    const quote = { path: "docs/guide.md", sha256: sha256(bytes), start: 0, end: bytes.length, quote_sha256: sha256(bytes) };
    const packet = { schema_version: 1, kind: "docs-drift-proposal-assessment", source_commit: f.source, inputs_sha256: collected.inputs_sha256,
      proposals: originals.map(proposal => ({ number: proposal.number, binding_sha256: proposal.binding_sha256,
        hunks: proposal.hunks.map(hunk => ({ id: hunk.id, verdict: "supported", reason: "Synthetic current-source assessment",
          recommendation: "Verify the proposed result before carrying delivery", evidence: [quote] })) })) };
    for (const [index, proposal] of originals.entries()) {
      const reference = collected.proposals[index].inputs_reference;
      expect(reference).toBeObject(); if (!reference) throw Error("Complete model-readable native proposal input required");
      const raw = readFileSync(join(f.artifacts, reference.path));
      expect(sha256(raw)).toBe(reference.sha256); expect(JSON.parse(raw.toString())).toEqual(proposal);
    }
    const before = captureRepositoryState(f.repo);
    for (const fault of ["matching", "missing-proposal", "missing-hunk", "duplicate-hunk", "foreign-binding", "changed-inputs", "changed-quote", "affirmative-without-evidence", "unknown", "copied-inputs", "oversized"] as const) {
      const value = structuredClone(packet);
      if (fault === "missing-proposal") value.proposals.pop();
      if (fault === "missing-hunk") value.proposals[0].hunks.pop();
      if (fault === "duplicate-hunk") value.proposals[0].hunks.push(value.proposals[0].hunks[0]);
      if (fault === "foreign-binding") value.proposals[1].binding_sha256 = "f".repeat(64);
      if (fault === "changed-inputs") value.inputs_sha256 = "e".repeat(64);
      if (fault === "changed-quote") value.proposals[0].hunks[0].evidence[0].quote_sha256 = "d".repeat(64);
      if (fault === "affirmative-without-evidence" || fault === "unknown") value.proposals[0].hunks[0].evidence = [];
      if (fault === "unknown") value.proposals[0].hunks[0].verdict = "unknown";
      if (fault === "oversized") value.proposals[0].hunks[0].reason = "x".repeat(600000);
      const raw = canonicalJSON(value); writeFileSync(join(f.artifacts, "proposal-assessment.json"), raw, { mode: 0o600 });
      const result = api.readProposalAssessment({ repo: f.repo, source: f.source, artifact_root: f.artifacts,
        inputs: fault === "copied-inputs" ? JSON.parse(JSON.stringify(collected)) : collected,
        reference: { path: "proposal-assessment.json", sha256: sha256(raw) } });
      expect(result.complete, fault + ": " + JSON.stringify(result.diagnostics)).toBe(fault === "matching" || fault === "unknown");
      expect(result.authority).toBe("none"); expect(result.origin).toBe("caller-assessment");
      if (result.complete) {
        expect(result.counts).toMatchObject({ required_proposals: 2, assessed_proposals: 2, unassessed_proposals: 0 });
        expect(result.proposals.map(proposal => proposal.number)).toEqual([11, 12]);
        expect(result.proposals[0].assessment).toBe(fault === "unknown" ? "unverifiable" : "supported");
      } else expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(captureRepositoryState(f.repo)).toEqual(before);
    }
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);


test("fully assessed proposal mixtures stay distinct from unknown judgments", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/proposal-assessment");
    const report = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await auditProposalInputsFixture(roots, "multiple", { multiHunks: true }), inputs = await collectAuditProposalInputs(f.options);
    expect(inputs.complete, JSON.stringify(inputs.diagnostics)).toBe(true);
    const originals = readCollectedAuditProposals(inputs), source = readFileSync(join(f.repo, "docs/guide.md"));
    expect(originals[0].hunks.length).toBeGreaterThanOrEqual(2);
    const quote = { path: "docs/guide.md", sha256: sha256(source), start: 0, end: source.length, quote_sha256: sha256(source) };
    const cases = [
      { verdicts: ["supported", "supported"], assessment: "supported", disposition: "needs-resolution" },
      { verdicts: ["fixed-differently", "fixed-differently"], assessment: "fixed-differently", disposition: "needs-resolution" },
      { verdicts: ["unsupported", "unsupported"], assessment: "unsupported", disposition: "needs-resolution" },
      { verdicts: ["supported", "fixed-differently"], assessment: "mixed", disposition: "needs-resolution" },
      { verdicts: ["supported", "unsupported"], assessment: "mixed", disposition: "needs-resolution" },
      { verdicts: ["unknown", "unknown"], assessment: "unverifiable", disposition: "unknown" },
      { verdicts: ["supported", "unknown"], assessment: "mixed", disposition: "needs-resolution" },
    ] as const;
    const routed: Array<{ judgment: Parameters<typeof report.proposalAttentionDisposition>[0]; expected: ReturnType<typeof report.proposalAttentionDisposition> }> = [];
    for (const selected of cases) {
      const packet = { schema_version: 1, kind: "docs-drift-proposal-assessment", source_commit: f.source, inputs_sha256: inputs.inputs_sha256,
        proposals: originals.map(proposal => ({ number: proposal.number, binding_sha256: proposal.binding_sha256,
          hunks: proposal.hunks.map((hunk, index) => ({ id: hunk.id, verdict: selected.verdicts[index % selected.verdicts.length], reason: "Synthetic distinct hunk assessment",
            recommendation: "Resolve every assessed hunk", evidence: selected.verdicts[index % selected.verdicts.length] === "unknown" ? [] : [quote] })) })) };
      const bytes = canonicalJSON(packet); writeFileSync(join(f.artifacts, "mixed-proposal-assessment.json"), bytes, { mode: 0o600 });
      const result = api.readProposalAssessment({ repo: f.repo, source: f.source, artifact_root: f.artifacts, inputs,
        reference: { path: "mixed-proposal-assessment.json", sha256: sha256(bytes) } });
      expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
      expect(result.proposals[0].assessment, selected.verdicts.join("+")).toBe(selected.assessment);
      expect(result.counts.unassessed_hunks).toBe(0);
      routed.push({ judgment: result.proposals[0].assessment, expected: selected.disposition });
    }
    for (const row of routed) expect(report.proposalAttentionDisposition(row.judgment)).toBe(row.expected);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
