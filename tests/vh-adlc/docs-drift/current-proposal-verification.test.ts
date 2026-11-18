import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { collectAuditProposalInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { commitAll, git, put } from "./repository-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed current-proposal verification roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each(["matching", "not-selected", "multiple", "serialized", "changed-original", "wrong-source", "unknown-selection"])("current proposal checks require original inputs and preserve the caller for %s", async fault => {
  try {
    const { verifyCurrentProposals, recheckCurrentProposalVerification } = await import("../../../plugins/vh-adlc/scripts/docs-drift/current-proposal-verification");
    const f = await auditProposalInputsFixture(roots, fault === "multiple" ? "multiple" : "matching");
    const original = await collectAuditProposalInputs(f.options);
    expect(original.complete, JSON.stringify(original.diagnostics)).toBe(true);
    const before = captureRepositoryState(f.repo), input = original.proposals[0].inputs_reference!;
    if (fault === "changed-original") writeFileSync(join(f.artifacts, input.path), "Preserve this changed original input\n", { mode: 0o600 });
    const supported = fault === "not-selected" ? [] : fault === "unknown-selection" ? [99] : fault === "multiple" ? [11, 12] : [11];
    const result = await verifyCurrentProposals({ repo: f.repo, source: fault === "wrong-source" ? "f".repeat(40) : f.source,
      artifact_root: f.artifacts, owner: f.owner, run: f.run, supported,
      proposals: fault === "serialized" ? JSON.parse(JSON.stringify(original)) : original });
    const successful = ["matching", "not-selected", "multiple"].includes(fault);
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(successful);
    expect(result.authority).toBe("none");
    if (successful) {
      expect(() => recheckCurrentProposalVerification(result)).not.toThrow();
      expect(() => recheckCurrentProposalVerification(JSON.parse(JSON.stringify(result)))).toThrow("Original complete current proposal verification required");
      expect(result.required_proposals).toBe(fault === "multiple" ? 2 : 1);
      expect(result.verified_proposals).toBe(supported.length);
      expect(result.proposals.map(row => row.number)).toEqual(fault === "multiple" ? [11, 12] : [11]);
      for (const row of result.proposals) {
        expect(row.outcome).toBe(fault === "not-selected" ? "not-selected" : "verified");
        if (row.outcome === "verified") {
          expect(row.verification_reference?.sha256).toMatch(/^[a-f0-9]{64}$/u);
          expect(row.corrections).toHaveLength(1);
          expect(row.corrections[0].path).toBe("docs/guide.md");
        } else expect(row.verification_reference).toBeNull();
      }
    } else {
      expect(result.verified_proposals).toBe(0);
      if (fault === "serialized") expect(result.diagnostics.join("\n")).toContain("Original native audit proposal context required");
      if (fault === "changed-original") {
        expect(result.scope_changed).toBe(true);
        expect(readFileSync(join(f.artifacts, input.path), "utf8")).toContain("Preserve this changed original input");
      }
    }
    expect(result).not.toHaveProperty("grants");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 180000);


test.each(["configured-failure", "protected", "changed-preimage"])("current proposal proof preserves unresolved or failing results for %s", async fault => {
  try {
    const { verifyCurrentProposals, recheckCurrentProposalVerification } = await import("../../../plugins/vh-adlc/scripts/docs-drift/current-proposal-verification");
    const f = await auditProposalInputsFixture(roots, "matching", { sourceCheckNeedsRepair: fault === "configured-failure", coordinated: fault === "protected",
      sourceGuide: fault === "changed-preimage" ? "# The current default changed this guide\n" : undefined });
    if (fault !== "protected") {
      let base = f.source;
      if (fault === "changed-preimage") {
        base = git(f.repo, "rev-parse", f.source + "^");
        git(f.candidate, "checkout", "--detach", base);
      }
      put(f.candidate, "docs/guide.md", "# A different full original result\n");
      const head = commitAll(f.candidate);
      git(f.origin, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", f.candidate, head);
      git(f.origin, "update-ref", "refs/pull/11/head", head);
      const inventory = JSON.parse(readFileSync(f.inventoryFile, "utf8"));
      inventory[0].head.sha = head; inventory[0].base.sha = base;
      writeFileSync(f.inventoryFile, canonicalJSON(inventory));
    }
    const original = await collectAuditProposalInputs(f.options);
    expect(original.complete, JSON.stringify(original.diagnostics)).toBe(true);
    const before = captureRepositoryState(f.repo);
    const result = await verifyCurrentProposals({ repo: f.repo, source: f.source, artifact_root: f.artifacts,
      owner: f.owner, run: f.run, proposals: original, supported: [11] });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(fault !== "configured-failure");
    expect(result.verified_proposals).toBe(0);
    expect(result.proposals[0].outcome).toBe(fault === "configured-failure" ? "incomplete" : "needs-resolution");
    expect(result.proposals[0].verification_reference).toBeNull();
    expect(result.proposals[0].corrections).toEqual([]);
    expect(result.proposals[0].diagnostics.length).toBeGreaterThan(0);
    if (fault === "configured-failure") expect(() => recheckCurrentProposalVerification(result)).toThrow("Original complete current proposal verification required");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 180000);

test.each(["verification", "preparation", "summary"])("later current-proof reopening rejects changed retained %s evidence", async fault => {
  try {
    const { verifyCurrentProposals, recheckCurrentProposalVerification } = await import("../../../plugins/vh-adlc/scripts/docs-drift/current-proposal-verification");
    const f = await auditProposalInputsFixture(roots, "matching"), original = await collectAuditProposalInputs(f.options);
    expect(original.complete).toBe(true);
    const result = await verifyCurrentProposals({ repo: f.repo, source: f.source, artifact_root: f.artifacts,
      owner: f.owner, run: f.run, proposals: original, supported: [11] });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    expect(() => recheckCurrentProposalVerification(result)).not.toThrow();
    const reference = fault === "verification" ? result.proposals[0].verification_reference
      : fault === "preparation" ? result.proposals[0].preparation_reference : result.evidence;
    if (!reference) throw Error("Original complete retained current-proof fixture required");
    const before = captureRepositoryState(f.repo), path = join(f.artifacts, reference.path);
    writeFileSync(path, "Preserve changed original current-proof evidence\n", { mode: 0o600 });
    expect(() => recheckCurrentProposalVerification(result)).toThrow();
    expect(readFileSync(path, "utf8")).toContain("Preserve changed original");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 180000);
