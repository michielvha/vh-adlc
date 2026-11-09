/** Synthetic exact native observations. No effect execution or owner permission is supplied. */
import { afterAll, expect, test } from "bun:test";
import { writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { captureClosureInventory, projectClosureReader } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-inventory";
import { collectClosureTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/closure";
import { appendIntent, appendOutcome, createJournal, sealPlan, writePublicationObjects } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { collectClosureInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-inputs";
import type { PublicationTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { closureFixture } from "./closure-fixture";
import { fixture as manifestFixture, bindings } from "./manifest-fixture";
import { runtimeIdentity } from "./adoption-fixture";
import { git } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

async function fixture(scenario: string) {
  const f = await closureFixture(roots), artifact_root = dirname(f.collection.store.record_path), source = f.merged;
  const inputs = collectClosureInputs(f.collection), target = collectClosureTarget({ inputs, collection: f.collection, operation_id: "inventory-closure" });
  expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
  const bytes = canonicalJSON({ source_commit: source, identity: runtimeIdentity, target }), original = { path: "original-target.json", sha256: sha256(bytes) };
  writeFileSync(join(artifact_root, original.path), bytes, { mode: 0o600 });
  const selectedBindings = { ...bindings, source_commit: source, candidate_commit: source, candidate_tree: git(f.repo, "rev-parse", source + "^{tree}"),
    assessment_sha256: original.sha256, proposals_sha256: canonicalDigest(inputs) };
  const selected = manifestFixture(selectedBindings, target.effects, "inventory-closure");
  const plan = sealPlan({ reviewed: validateReviewedManifest(selected), grants: selected.grants, adoption_sha256: "a".repeat(64),
    context: "production", transport: "native", publication_kind: "resolve", corrections: [], attention: [] });
  let journal = createJournal({ source_repo: f.repo, artifact_root, plan });
  const store = createOwnedObjectStore({ source_repo: f.repo, source_commit: source, parent: artifact_root, evidence_directory: artifact_root,
    owner: "inventory-owner", run: "inventory-run", repository: "fixture/docs" });
  for (const original of f.proposals.values()) git(store.root, "fetch", "--no-write-fetch-head", f.repo, original.head_sha);
  const comment = plan.manifest.effects.find(effect => effect.kind === "comment-create")!;
  const close = plan.manifest.effects.find(effect => effect.kind === "pr-close")!;
  const closed = ["closed", "changed-close", "reopened", "merged"].includes(scenario);
  if (scenario !== "no-intent") {
    for (const effect of plan.manifest.effects.slice(0, 2)) {
      journal = appendIntent(journal, effect.id);
      journal = appendOutcome(journal, effect.id, { state: "observed", observation_sha256: "a".repeat(64), resource_id: null, object: null });
    }
    journal = appendIntent(journal, comment.id);
    if (closed) {
      journal = appendOutcome(journal, comment.id, { state: "observed", observation_sha256: "a".repeat(64), resource_id: "101", object: f.proposals.get(1)!.head_sha });
      journal = appendIntent(journal, close.id);
      if (scenario === "reopened") journal = appendOutcome(journal, close.id, { state: "observed", observation_sha256: "b".repeat(64), resource_id: "1", object: f.proposals.get(1)!.head_sha });
    }
  }
  f.comments.set(1, [{ id: 101, body: String(comment.payload.body), actor: "fixture-bot", actor_id: 20 }]);
  const observed = f.comments.get(1)![0];
  if (scenario === "changed-comment") observed.body += "Later edit\n";
  if (scenario === "foreign-author") observed.actor_id = 21;
  if (scenario === "extra-comment") f.comments.get(1)!.push({ id: 102, body: "New owner concern", actor: "owner", actor_id: 22 });
  if (closed && scenario !== "reopened") f.proposals.get(1)!.state = "closed";
  if (scenario === "changed-close") f.proposals.get(1)!.body += "Changed original after closure\n";
  if (scenario === "merged") f.proposals.get(1)!.merged_at = "2026-11-09T00:00:00Z";
  const transport: Pick<PublicationTransport, "kind" | "observe"> = { kind: "native", observe: async (_plan, effect) => {
    if (scenario === "unknown") return { state: "unknown", reason: "Synthetic incomplete lookup" };
    if (scenario === "conflict") return { state: "conflict", reason: "Synthetic changed native payload" };
    if (scenario === "absent" || scenario === "reopened" && effect.kind === "pr-close") return { state: "absent" };
    return { state: "done", outcome: { state: "observed", observation_sha256: "a".repeat(64),
      resource_id: effect.kind === "comment-create" ? "101" : "1", object: f.proposals.get(1)!.head_sha } };
  } };
  return { ...f, artifact_root, original, target, plan, journal, store, transport, objects: writePublicationObjects(store, plan, journal.header) };
}

test.each(["comment", "closed"])("closure recovery normalizes exact observed own %s without changing native data", async scenario => {
  const f = await fixture(scenario), before = captureRepositoryState(f.repo), comments = structuredClone([...f.comments]);
  const context = await captureClosureInventory({ source_repo: f.repo, artifact_root: f.artifact_root, journal_directory: f.journal.directory,
    original: f.original, transport: f.transport, objects: f.objects, reader: f.collection.reader });
  const reader = projectClosureReader(f.collection.reader, context);
  const inputs = collectClosureInputs({ ...f.collection, store: f.store, reader });
  const current = collectClosureTarget({ inputs, operation_id: "inventory-closure", collection: { ...f.collection, store: f.store, reader } });
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  expect(current).toEqual(f.target);
  expect(context.observations).toHaveLength(scenario === "closed" ? 2 : 1);
  expect([...f.comments]).toEqual(comments); expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(() => projectClosureReader(f.collection.reader, structuredClone(context))).toThrow();
});

test.each(["no-intent", "changed-comment", "foreign-author", "extra-comment", "unknown", "conflict", "absent", "changed-close", "reopened", "merged"])("closure recovery refuses unproven or changed %s normalization", async scenario => {
  const f = await fixture(scenario), before = captureRepositoryState(f.repo);
  await expect(captureClosureInventory({ source_repo: f.repo, artifact_root: f.artifact_root, journal_directory: f.journal.directory,
    original: f.original, transport: f.transport, objects: f.objects, reader: f.collection.reader })).rejects.toThrow();
  expect(captureRepositoryState(f.repo)).toEqual(before);
});
