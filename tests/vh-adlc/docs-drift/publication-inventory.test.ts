import { afterAll, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendIntent, appendOutcome, createJournal, sealPlan, writePublicationObjects } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { projectProposalBindings } from "../../../plugins/vh-adlc/scripts/docs-drift/proposals";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { publicationFixture } from "./publication-fixture";
import { fixture as manifestFixture } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["matching", "lost-outcome", "no-intent", "partial", "changed-body", "unrelated-pr", "changed-resolution", "forged-context"])("publication replay accounts only for freshly proven own inventory %s", async scenario => {
  const { capturePublicationInventory, projectCurrentProposals } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-inventory");
  const f = publicationFixture(roots), bytes = canonicalJSON(projectProposalBindings([], null)), reference = { path: "original-proposals.json", sha256: sha256(bytes) };
  writeFileSync(join(f.artifacts, reference.path), bytes, { mode: 0o600 });
  const input = manifestFixture({ ...f.input.manifest.bindings, proposals_sha256: reference.sha256 }, f.input.manifest.effects);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: f.policy.adoption_sha256,
    context: "trial", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
  if (scenario !== "no-intent") {
    for (const prior of plan.manifest.effects.slice(0, 3)) {
      journal = appendIntent(journal, prior.id);
      journal = appendOutcome(journal, prior.id, { state: "observed", observation_sha256: "a".repeat(64), resource_id: null, object: null });
    }
    journal = appendIntent(journal, "pr");
  }
  const objects = writePublicationObjects(f.store, plan, journal.header), effect = plan.manifest.effects.find(effect => effect.kind === "pr-create")!;
  const identity = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const created: PullRequestInput = { number: 73, state: "open", merged_at: null, body: String(effect.payload.body), draft: true,
    actor: "fixture-bot", actor_id: 20, actor_type: "Bot", head_sha: plan.manifest.bindings.candidate_commit, head_ref: String(effect.payload.branch),
    head_repository: identity, base_sha: plan.manifest.bindings.source_commit, base_ref: "main", base_repository: identity };
  const current = [structuredClone(created)];
  if (scenario === "changed-body") current[0].body += "Changed after the verified native lookup\n";
  if (scenario === "unrelated-pr") current.push({ ...created, number: 74, head_ref: "docs-drift/unrelated" });
  const transport = { ...f.transport, kind: "native" as const, observe: async () => scenario === "partial"
    ? { state: "unknown" as const, reason: "native-PR-labels-incomplete" }
    : { state: "done" as const, outcome: { state: "observed" as const, observation_sha256: "a".repeat(64), resource_id: "73", object: created.head_sha } } };
  const check = async () => {
    const context = await capturePublicationInventory({ source_repo: f.repo, artifact_root: f.artifacts, journal_directory: journal.directory,
      original: reference, transport, objects, current_proposals: current });
    const selected = scenario === "forged-context" ? structuredClone(context) : context;
    const projected = projectCurrentProposals(current, scenario === "changed-resolution" ? "a".repeat(64) : null, selected);
    return { context, projected };
  };
  if (["matching", "lost-outcome"].includes(scenario)) {
    const { context, projected } = await check();
    expect(projected).toEqual(projectProposalBindings([], null));
    expect(current).toHaveLength(1); expect(context.observations).toHaveLength(1);
  } else await expect(check()).rejects.toThrow();
});
