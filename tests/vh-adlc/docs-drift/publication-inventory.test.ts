import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
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

test.each(["matching", "lost-outcome", "no-intent", "partial", "changed-body", "unrelated-pr", "changed-resolution", "forged-context", "case-only"])("publication replay accounts only for freshly proven own inventory %s", async scenario => {
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
  if (scenario === "case-only") current[0].actor = "FIXTURE-BOT";
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
  if (["matching", "lost-outcome", "case-only"].includes(scenario)) {
    const { context, projected } = await check();
    expect(projected).toEqual(projectProposalBindings([], null));
    expect(current).toHaveLength(1); expect(context.observations).toHaveLength(1);
  } else await expect(check()).rejects.toThrow();
});

test.each(["branch-only", "partial-metadata", "delivered", "delivered-alias", "missing-payload-proof", "changed-payload-proof", "no-branch-intent", "no-update-intent", "external-title", "external-head", "external-owner", "unrelated-pr"])("refresh replay normalizes only its observed original target %s", async scenario => {
  const { capturePublicationInventory, projectCurrentProposals } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-inventory");
  const f = publicationFixture(roots), repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const original: PullRequestInput = { number: 17, state: "open", merged_at: null, title: "Earlier title", labels: ["documentation"], body: "Earlier body", draft: true,
    actor: "fixture-bot", actor_id: 20, actor_type: "Bot", head_sha: f.input.manifest.bindings.source_commit, head_ref: "docs-drift/earlier",
    head_repository: repository, base_sha: f.input.manifest.bindings.source_commit, base_ref: "main", base_repository: repository };
  const bytes = canonicalJSON(projectProposalBindings([original], null)), reference = { path: "refresh-proposals.json", sha256: sha256(bytes) };
  writeFileSync(join(f.artifacts, reference.path), bytes, { mode: 0o600 });
  const before = { title: original.title, body: original.body, labels: original.labels, draft: original.draft };
  const update = { id: "publication", kind: "pr-update" as const, payload: { number: 17, expected_head: f.input.manifest.bindings.candidate_commit,
    expected_payload: before, expected_payload_sha256: sha256(canonicalJSON(before)), title: "Fresh title", body: "Fresh body", labels: ["documentation", "reviewed"], draft: false } };
  if (scenario === "delivered-alias") update.payload.labels = ["Documentation"];
  const effects = [f.input.manifest.effects[0], f.input.manifest.effects[1], { id: "candidate", kind: "branch-refresh" as const,
    payload: { ref: "refs/heads/" + original.head_ref, number: 17, expected_head: original.head_sha, head: f.input.manifest.bindings.candidate_commit } }, update, f.input.manifest.effects.at(-1)!];
  const input = manifestFixture({ ...f.input.manifest.bindings, proposals_sha256: reference.sha256 }, effects);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: f.policy.adoption_sha256,
    context: "trial", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
  if (scenario !== "no-branch-intent") {
    for (const effect of effects.slice(0, 2)) {
      journal = appendIntent(journal, effect.id);
      journal = appendOutcome(journal, effect.id, { state: "observed", observation_sha256: "a".repeat(64), resource_id: null, object: null });
    }
    journal = appendIntent(journal, "candidate");
    if (!["branch-only", "no-update-intent"].includes(scenario)) {
      journal = appendOutcome(journal, "candidate", { state: "observed", observation_sha256: "a".repeat(64), resource_id: "refs/heads/" + original.head_ref, object: f.input.manifest.bindings.candidate_commit });
      journal = appendIntent(journal, "publication");
    }
  }
  const current = [{ ...original, head_sha: f.input.manifest.bindings.candidate_commit }];
  if (!["branch-only", "no-branch-intent"].includes(scenario)) Object.assign(current[0], { title: "Fresh title", body: "Fresh body" });
  if (scenario === "delivered" || scenario === "delivered-alias") Object.assign(current[0], { labels: scenario === "delivered-alias" ? ["documentation"] : update.payload.labels, draft: false });
  if (scenario === "external-title") current[0].title = "Another writer changed this";
  if (scenario === "external-head") current[0].head_sha = "e".repeat(40);
  if (scenario === "external-owner") current[0].actor_id = 999;
  if (scenario === "unrelated-pr") current.push({ ...current[0], number: 18 });
  const transport = { ...f.transport, kind: "native" as const, observe: async (_plan: unknown, effect: { kind: string }) => {
    const payload = scenario === "missing-payload-proof" ? {} : { payload_sha256: scenario === "changed-payload-proof" ? "0".repeat(64)
      : sha256(canonicalJSON({ title: current[0].title, body: current[0].body, labels: current[0].labels, draft: current[0].draft })) };
    if (effect.kind === "pr-update" && !["delivered", "delivered-alias"].includes(scenario)) return { state: "absent" as const, ...payload };
    return { state: "done" as const, ...payload, outcome: { state: "observed" as const, observation_sha256: "a".repeat(64),
      resource_id: effect.kind === "branch-refresh" ? "refs/heads/" + original.head_ref : "17", object: current[0].head_sha } };
  } };

  const check = async () => {
    const context = await capturePublicationInventory({ source_repo: f.repo, artifact_root: f.artifacts, journal_directory: journal.directory,
      original: reference, transport, objects: writePublicationObjects(f.store, plan, journal.header), current_proposals: current });
    return projectCurrentProposals(current, null, context);
  };
  if (["branch-only", "partial-metadata", "delivered", "delivered-alias"].includes(scenario)) expect(await check()).toEqual(projectProposalBindings([original], null));
  else await expect(check()).rejects.toThrow();
});


test.each(["case", "account-id", "row-id", "body"])("retained inventory projects only the matching original account row: %s", async change => {
  const { capturePublicationInventory, projectCurrentProposals } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-inventory");
  const f = publicationFixture(roots), repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const original: PullRequestInput[] = [
    { number: 11, actor: "Fixture-Bot", actor_id: 20 },
    { number: 12, actor: "Fixture-Owner", actor_id: 30 },
    { number: 13, actor: "Legacy-Bot", actor_id: 90 },
  ].map(item => ({ ...item, state: "open", merged_at: null, body: "Original proposal", draft: true, actor_type: "Bot",
    head_sha: f.input.manifest.bindings.candidate_commit, head_ref: "docs-drift/" + item.number, head_repository: repository,
    base_sha: f.input.manifest.bindings.source_commit, base_ref: "main", base_repository: repository }));
  const bytes = canonicalJSON(projectProposalBindings(original, null)), reference = { path: "account-rows.json", sha256: sha256(bytes) };
  writeFileSync(join(f.artifacts, reference.path), bytes, { mode: 0o600 });
  const input = manifestFixture({ ...f.input.manifest.bindings, proposals_sha256: reference.sha256 }, f.input.manifest.effects);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: f.policy.adoption_sha256,
    context: "trial", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
  const current = original.map(item => ({ ...item, actor: item.actor.toUpperCase() }));
  if (change === "account-id") current[1].actor_id++;
  if (change === "row-id") current[1].number = 14;
  if (change === "body") current[1].body += " Material change";
  const check = async () => {
    const context = await capturePublicationInventory({ source_repo: f.repo, artifact_root: f.artifacts, journal_directory: journal.directory,
      original: reference, transport: { ...f.transport, kind: "native" }, objects: writePublicationObjects(f.store, plan, journal.header), current_proposals: current });
    return projectCurrentProposals(current, null, context);
  };
  if (change === "case") expect(await check()).toEqual(projectProposalBindings(original, null));
  else await expect(check()).rejects.toThrow();
  expect(current[1].actor).toBe("FIXTURE-OWNER");
  expect(readFileSync(join(f.artifacts, reference.path)).equals(bytes)).toBe(true);
});
