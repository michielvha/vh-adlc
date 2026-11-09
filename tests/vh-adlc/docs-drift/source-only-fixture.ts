/** Original role captures here are synthetic. No real model or GitHub operation runs. */
import { expect } from "bun:test";
import { bindingFixture } from "./binding-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";
import { evidence, role } from "./manifest-fixture";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";

export async function sourceOnlyFixture(roots: string[], publicationKind: "issue-create" | "pr-create", fullComponent = false) {
  const f = await bindingFixture(roots, false, { sourceCheckNeedsRepair: true, fullComponent,
    role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source } });
  const decisions = retainSyntheticArtifact(f.artifacts, "source-only-decisions.json", canonicalJSON({ ...f.decisions, decisions: [] }));
  const options = { ...f.options, candidate_repo: f.repo, candidate: f.source, decisions, candidate_verification: f.options.source_verification,
    selection: { schema_version: 1, source_commit: f.source, edits: [] } };
  const current = await collectWorkerInputs(options); expect(current.complete, current.diagnostics.join("\n")).toBe(true);
  const body = `Synthetic finding evidence at https://github.com/fixture/docs/blob/${f.source}/README.md\n`;
  const payload = publicationKind === "issue-create" ? { title: "Investigate documentation baseline", body, labels: ["documentation"], prior_ids: [],
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.source,
    evidence_sha256: sha256(readGit(f.repo, "show", f.source + ":README.md")) }
    : { title: "Unverified source-only PR", body, labels: ["documentation"], draft: false, base: "main", branch: "docs-drift/source-only" };
  const original = evidence("source-only-worker", current.worker_input_sha256!, canonicalJSON({ input_sha256: current.worker_input_sha256,
    edits: [], publication: { operation_id: "source-only-operation", proposal: { kind: publicationKind, payload } } }).toString());
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", roleRuntimeDigest(current.facts!.runtime!, "worker"), original);
  return { ...f, options, worker, candidate: f.repo, head: f.source };
}
