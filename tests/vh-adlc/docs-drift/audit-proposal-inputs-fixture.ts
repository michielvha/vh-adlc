/** Owned synthetic native proposals, including immutable Git objects and mutable API inventory. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { commitAll, git, put } from "./repository-fixture";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

export const auditInputFaults = ["empty", "matching", "multiple", "partial-missing", "missing-objects", "changed-after-fetch", "oversized-inputs"] as const;
export async function auditProposalInputsFixture(roots: string[], fault: typeof auditInputFaults[number]) {
  const f = await bindingFixture(roots, false, { mutableInventory: true });
    let head = f.head;
    if (fault === "oversized-inputs") { put(f.candidate, "docs/guide.md", "# " + "x".repeat(600000) + "\n"); head = commitAll(f.candidate); }
    if (fault !== "empty") {
      const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
      const proposal = { number: 11, state: "open", merged_at: null, body: "Synthetic original proposal body", title: "Existing documentation correction", draft: false,
        labels: [{ id: 101, name: "documentation" }], user: { id: 20, login: "fixture-bot", type: "Bot" },
        head: { sha: fault === "missing-objects" ? "f".repeat(40) : head, ref: "docs-drift/existing", repo: repository },
        base: { sha: f.source, ref: "main", repo: repository } };
      const multiple = ["multiple", "partial-missing"].includes(fault);
      const proposals = [proposal, ...(multiple ? [{ ...proposal, number: 12, body: "Synthetic legacy original proposal", user: { id: 21, login: "legacy-bot", type: "Bot" },
        head: { ...proposal.head, sha: fault === "partial-missing" ? "e".repeat(40) : head, ref: "docs-audit/existing" } }] : [])];
      writeFileSync(f.inventoryFile, canonicalJSON(proposals));
      if (fault !== "missing-objects") {
        git(f.origin, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", f.candidate, head);
        git(f.origin, "update-ref", "refs/pull/11/head", head);
        if (fault === "multiple") git(f.origin, "update-ref", "refs/pull/12/head", head);
      }
      if (fault === "changed-after-fetch") {
        const path = join(f.root, "native-bin/git"), original = readFileSync(path, "utf8");
        const edit = `if (args.some(value => value.includes("refs/pull/11/head"))) {
          const fs = require("node:fs"), path = ${JSON.stringify(f.inventoryFile)}, values = JSON.parse(fs.readFileSync(path, "utf8"));
          values[0].body = "Changed while reading the full original proposal"; fs.writeFileSync(path, JSON.stringify(values)); }
`;
        if (!original.includes("process.exit(result.exitCode);")) throw Error("Missing owned Git fixture completion boundary");
        writeFileSync(path, original.replace("process.exit(result.exitCode);", edit + "process.exit(result.exitCode);"));
      }
    }
  return f;
}
