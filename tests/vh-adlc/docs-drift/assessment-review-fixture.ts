/** Original source/role artifacts only; no actual model or provider operation. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { commitAll, git, put } from "./repository-fixture";
import { expect } from "bun:test";
import { bindingFixture } from "./binding-fixture";
import { evidence, role } from "./manifest-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

export async function assessmentReviewFixture(roots: string[], options: { large?: boolean; proposals?: boolean } = {}) {
  let worker: { path: string; sha256: string } | null = null, assessment: { path: string; sha256: string } | null = null;
  const f = await bindingFixture(roots, false, { mutableInventory: options.proposals, scannerCase: options.large ? "finding" : "none", role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source },
    beforeCandidate: async input => {
      if (options.proposals) {
        const root = dirname(input.artifacts), candidate = join(root, "original-audit-proposal"), origin = join(root, "binding-origin");
        git(root, "clone", "--no-local", "--no-checkout", input.repo, candidate); git(candidate, "checkout", "--detach", input.source);
        put(candidate, "docs/guide.md", "# Full existing native proposal\n"); const head = commitAll(candidate);
        git(origin, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", candidate, head); git(origin, "update-ref", "refs/pull/11/head", head);
        const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
        writeFileSync(join(root, "binding-native-inventory.json"), canonicalJSON([{ number: 11, state: "open", merged_at: null, body: "Synthetic existing audit proposal",
          title: "Original audit proposal", draft: false, labels: [{ id: 101, name: "documentation" }], user: { id: 20, login: "fixture-bot", type: "Bot" },
          head: { sha: head, ref: "docs-drift/original", repo: repository }, base: { sha: input.source, ref: "main", repo: repository } }]));
      }
      const current = await collectWorkerInputs(input.worker_options); expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
      assessment = retainSyntheticArtifact(input.artifacts, "original-finding-assessment.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-assessment",
        source_commit: input.source, source_verification_sha256: input.baseline.evidence!.sha256,
          findings: (input.baseline.scan?.findings ?? []).map(finding => ({ id: finding.id, verdict: "unknown", reason: "x".repeat(120000),
            recommendation: "Inspect the original source", evidence: [] })) }));
      const edits = structuredClone((input.selection as { edits: Array<{ replacement_base64: string }> }).edits);
      if (options.large) edits[0].replacement_base64 = Buffer.alloc(307500, "x").toString("base64");
      const original = evidence("original-assessment-worker", current.worker_input_sha256!, canonicalJSON({ input_sha256: current.worker_input_sha256,
        edits, publication: null, assessment }).toString());
      worker = captureSyntheticRole(input.artifacts, input.source, "worker", roleRuntimeDigest(current.facts!.runtime!, "worker"), original);
    } });
  if (!worker || !assessment) throw Error("Missing original assessment fixture captures");
  return { ...f, worker: worker as { path: string; sha256: string }, assessment: assessment as { path: string; sha256: string } };
}
