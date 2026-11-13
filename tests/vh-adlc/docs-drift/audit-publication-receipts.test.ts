/** Owned full-input/native API fixtures only; eligibility is not current verification or delivery. */
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { collectAuditProposalInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { auditReceiptFixture } from "./audit-publication-receipts-fixture";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned audit-publication roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each(["matching", "serialized", "changed-body", "changed-input-record", "unavailable-native"])("audit receipt collection requires original complete inputs and preserves unknown evidence: %s", async fault => {
  try {
    const { collectAuditPublicationReceipts, readCollectedAuditPublicationReceipts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-publication-receipts");
    const f = await auditProposalInputsFixture(roots, "multiple"), original = await collectAuditProposalInputs(f.options);
    expect(original.complete, JSON.stringify(original.diagnostics)).toBe(true);
    const before = captureRepositoryState(f.repo);
    let path = f.options.path;
    if (fault === "changed-body") {
      const data = JSON.parse(readFileSync(f.inventoryFile, "utf8")); data[0].body += "\nPreserve this later owner edit";
      writeFileSync(f.inventoryFile, JSON.stringify(data), { mode: 0o600 });
    }
    if (fault === "changed-input-record") writeFileSync(join(f.artifacts, original.proposals[0].inputs_reference!.path), "Preserve this changed original input\n", { mode: 0o600 });
    if (fault === "unavailable-native") { path = join(f.artifacts, "empty-native-path"); mkdirSync(path, { mode: 0o700 }); }
    const result = await collectAuditPublicationReceipts({ repo: f.repo, source: f.source, artifact_root: f.artifacts,
      credential: f.options.credential, path, proposals: fault === "serialized" ? JSON.parse(JSON.stringify(original)) : original });
    expect(result.authority).toBe("none"); expect(result.complete, JSON.stringify(result.diagnostics)).toBe(fault === "matching");
    if (fault === "matching") {
      expect(result.required_proposals).toBe(2); expect(result.reviewed_proposals).toBe(0);
      expect(result.proposals.map(row => row.number)).toEqual([11, 12]);
      expect(result.proposals.every(row => row.eligibility === "unreviewed" && row.reviewed === null && row.receipt === null)).toBe(true);
      expect(readCollectedAuditPublicationReceipts(result)).toEqual(result.proposals);
      expect(() => readCollectedAuditPublicationReceipts(JSON.parse(JSON.stringify(result)))).toThrow("Original native audit publication receipts required");
    } else if (fault === "serialized") expect(result.diagnostics.join("\n")).toContain("Original native audit proposal context required");
    else if (fault === "changed-body") { expect(result.scope_changed).toBe(true); expect(result.proposals).toEqual([]); }
    else if (fault === "changed-input-record") {
      expect(result.scope_changed).toBe(true);
      expect(readFileSync(join(f.artifacts, original.proposals[0].inputs_reference!.path), "utf8")).toContain("Preserve this changed original input");
    }
    else expect(result.scope_changed).toBe(false);
    if (!result.complete) expect(() => readCollectedAuditPublicationReceipts(result)).toThrow("Original native audit publication receipts required");
    expect(result).not.toHaveProperty("carried_delivery"); expect(result).not.toHaveProperty("grants");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 180000);

test.each(["matching", "missing-ref", "missing-blob", "late-ref", "changed-input-during-read"])("audit receipt collection retains original native eligibility without inventing current delivery: %s", async fault => {
  try {
    const { collectAuditPublicationReceipts, readCollectedAuditPublicationReceipts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-publication-receipts");
    const f = await auditReceiptFixture(roots), original = await collectAuditProposalInputs(f.options);
    expect(original.complete, JSON.stringify(original.diagnostics)).toBe(true);
    const options = { repo: f.repo, source: f.source, artifact_root: f.artifacts, credential: f.options.credential, path: f.options.path, proposals: original };
    const before = captureRepositoryState(f.repo), baseline = await collectAuditPublicationReceipts(options);
    expect(baseline.complete, JSON.stringify(baseline.diagnostics)).toBe(true); expect(baseline.reviewed_proposals).toBe(1);
    expect(baseline.proposals[0].receipt?.object).toBe(f.receipt.objects.object);
    expect(baseline.proposals[1].eligibility).toBe("unreviewed");
    if (fault !== "matching") {
      writeFileSync(f.receipt.countPath, "0");
      const input = original.proposals[0].inputs_reference!;
      writeFileSync(f.receipt.faultsPath, JSON.stringify({ missing_ref: fault === "missing-ref", missing_blob: fault === "missing-blob",
        late_ref: fault === "late-ref", input_path: fault === "changed-input-during-read" ? join(f.artifacts, input.path) : undefined }), { mode: 0o600 });
      const result = await collectAuditPublicationReceipts(options);
      expect(result.complete, JSON.stringify(result.diagnostics)).toBe(fault === "missing-ref"); expect(result.reviewed_proposals).toBe(0);
      if (fault === "missing-ref") { expect(result.proposals[0].eligibility).toBe("unreviewed"); expect(result.scope_changed).toBe(false); }
      else {
        expect(() => readCollectedAuditPublicationReceipts(result)).toThrow("Original native audit publication receipts required");
        expect(result.scope_changed).toBe(fault === "late-ref" || fault === "changed-input-during-read");
        if (fault === "missing-blob") expect(result.proposals.map(row => row.number)).toEqual([11, 12]);
        if (fault === "changed-input-during-read") expect(readFileSync(join(f.artifacts, input.path), "utf8")).toContain("Preserve the changed original input during lookup");
      }
    } else {
      expect(readCollectedAuditPublicationReceipts(baseline)).toEqual(baseline.proposals);
      expect(() => readCollectedAuditPublicationReceipts(JSON.parse(JSON.stringify(baseline)))).toThrow("Original native audit publication receipts required");
    }
    expect(baseline).not.toHaveProperty("carried_delivery"); expect(baseline).not.toHaveProperty("grants");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 180000);
