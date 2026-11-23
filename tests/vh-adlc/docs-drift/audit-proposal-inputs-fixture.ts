/** Owned synthetic native proposals, including immutable Git objects and mutable API inventory. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { commitAll, git, put } from "./repository-fixture";
import { gitStub } from "./git-stub";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

export const auditInputFaults = ["empty", "matching", "multiple", "partial-missing", "early-missing", "oversized-first", "missing-objects", "changed-after-fetch", "oversized-inputs"] as const;
export async function auditProposalInputsFixture(roots: string[], fault: typeof auditInputFaults[number], options: {
  multiHunks?: boolean; sourceGuide?: string; coordinated?: boolean; sourceCheckNeedsRepair?: boolean; role?: NonNullable<Parameters<typeof bindingFixture>[2]>["role"];
} = {}) {
  const f = await bindingFixture(roots, false, { mutableInventory: true, role: options.role, sourceGuide: options.sourceGuide,
    coordinated: options.coordinated, sourceCheckNeedsRepair: options.sourceCheckNeedsRepair });
    let head = f.head;
    if (options.multiHunks) { put(f.candidate, "docs/extra.md", "# A second independent proposal hunk\n"); head = commitAll(f.candidate); }
    if (fault === "oversized-inputs" || fault === "oversized-first") { put(f.candidate, "docs/guide.md", "# " + "x".repeat(600000) + "\n"); head = commitAll(f.candidate); }
    const multiple = ["multiple", "partial-missing", "early-missing", "oversized-first"].includes(fault);
    let legacyHead = head;
    if (multiple) { put(f.candidate, "docs/guide.md", "# Distinct legacy candidate guide\n"); legacyHead = commitAll(f.candidate); }
    if (fault !== "empty") {
      const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
      const proposal = { number: 11, state: "open", merged_at: null, body: "Synthetic original proposal body", title: "Existing documentation correction", draft: false,
        labels: [{ id: 101, name: "documentation" }], user: { id: 20, login: "fixture-bot", type: "Bot" },
        head: { sha: ["missing-objects", "early-missing"].includes(fault) ? "f".repeat(40) : head, ref: "docs-drift/existing", repo: repository },
        base: { sha: f.source, ref: "main", repo: repository } };
      const proposals = [proposal, ...(multiple ? [{ ...proposal, number: 12, body: "Synthetic legacy original proposal", user: { id: 21, login: "legacy-bot", type: "Bot" },
        head: { ...proposal.head, sha: fault === "partial-missing" ? "e".repeat(40) : legacyHead, ref: "docs-audit/existing" } }] : [])];
      writeFileSync(f.inventoryFile, canonicalJSON(proposals));
      if (fault !== "missing-objects") {
        git(f.origin, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", f.candidate, multiple ? legacyHead : head);
        if (fault !== "early-missing") git(f.origin, "update-ref", "refs/pull/11/head", head);
        if (multiple && fault !== "partial-missing") git(f.origin, "update-ref", "refs/pull/12/head", legacyHead);
      }
      if (fault === "changed-after-fetch") {
        // Rewrite the inventory after Git has fetched the original proposal head, before the reader returns.
        const executable = Bun.which("git"); if (!executable) throw Error("fixture requires Git");
        const edit = `const fs = require("node:fs"), path = ${JSON.stringify(f.inventoryFile)}, values = JSON.parse(fs.readFileSync(path, "utf8"));
values[0].body = "Changed while reading the full original proposal"; fs.writeFileSync(path, JSON.stringify(values));`;
        writeFileSync(join(f.root, "native-bin/git"), gitStub({ git: executable, origin: f.origin, refuseRemote: true,
          after: { contains: "refs/pull/11/head", command: [process.execPath, "-e", edit] } }), { mode: 0o700 });
      }
    }
  return { ...f, proposalHead: head, legacyHead };
}
