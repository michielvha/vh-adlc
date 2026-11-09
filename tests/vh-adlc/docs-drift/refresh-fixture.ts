/** Synthetic existing PR state and original role captures for the refresh controller. */
import { expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";
import { evidence, role } from "./manifest-fixture";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { collectReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/review-target";
import { roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { canonicalDigest, canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { effectDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";

type Reference = { path: string; sha256: string };
export async function refreshFixture(roots: string[], legacy = false, fault?: "title" | "body" | "head" | "number" | "draft" | "fork" | "alias") {
  let worker: Reference | null = null;
  const before = { title: "Earlier proposal", body: "Original source proposal\n", labels: ["documentation"], draft: true };
  const branch = legacy ? "docs-audit/legacy" : "docs-drift/earlier";
  const original = (source: string) => {
    const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
    return { id: 901, number: 17, state: "open", merged_at: null, ...before, labels: [{ id: 101, name: "documentation" }],
      user: { id: legacy ? 21 : 20, login: legacy ? "legacy-bot" : "fixture-bot", type: "Bot" },
      head: { sha: source, ref: branch, repo: fault === "fork" ? { ...repository, id: 99, full_name: "other/fork" } : repository }, base: { sha: source, ref: "main", repo: repository } };
  };
  const f = await bindingFixture(roots, false, { fullComponent: true, mutableInventory: true,
    role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source },
    beforeCandidate: async input => {
      expect(input.baseline.complete, JSON.stringify({ diagnostics: input.baseline.diagnostics, scan: input.baseline.scan?.process, commands: input.baseline.commands })).toBe(true);
      writeFileSync(join(input.repo, "../binding-native-inventory.json"), JSON.stringify([original(input.source)]), { mode: 0o600 });
      const current = await collectWorkerInputs(input.worker_options); expect(current.complete, current.diagnostics.join("\n")).toBe(true);
      const proposedBefore = { ...before, title: fault === "title" ? "Changed title" : before.title, body: fault === "body" ? "Changed body" : before.body };
      const publication = { operation_id: "refresh-operation", proposal: { kind: "pr-update", payload: { number: fault === "number" ? 18 : 17, expected_head: fault === "head" ? "e".repeat(40) : input.source,
        expected_payload: proposedBefore, expected_payload_sha256: canonicalDigest(proposedBefore), title: "Repair the guide", body: "Reviewed fresh source correction\n", labels: fault === "alias" ? ["Documentation"] : ["documentation"], draft: fault === "draft" } } };
      worker = captureSyntheticRole(input.artifacts, input.source, "worker", roleRuntimeDigest(current.facts!.runtime!, "worker"),
        evidence("refresh-worker", current.worker_input_sha256!, canonicalJSON({ input_sha256: current.worker_input_sha256,
          edits: (input.selection as { edits: unknown[] }).edits, publication }).toString()));
    } });
  if (!worker) throw Error("Missing original refresh worker");
  const target = await collectReviewTarget({ ...f.options, worker_capture: worker });
  return { ...f, before, branch, original: original(f.source), worker: worker as Reference, target };
}

export function reviewRefresh(f: Awaited<ReturnType<typeof refreshFixture>>) {
  expect(f.target.complete, f.target.diagnostics.join("\n")).toBe(true);
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", f.target.reviewer_runtime_sha256!,
    evidence("refresh-reviewer", f.target.manifest_sha256!, "NO FINDINGS\n"));
  const instruction = retainSyntheticArtifact(f.artifacts, "refresh-request.txt", Buffer.from("Synthetic exact owner approval of the displayed refresh effects.\n"));
  const authority = retainSyntheticArtifact(f.artifacts, "refresh-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority",
    manifest_sha256: f.target.manifest_sha256, origin: { kind: "owner-request", artifact: instruction },
    effects: f.target.manifest!.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
  return { ...f.options, worker_capture: f.worker, reviewer_capture: reviewer, authority };
}
