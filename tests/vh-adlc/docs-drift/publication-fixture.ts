import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import type { ExecutionResult } from "../../../plugins/vh-adlc/scripts/docs-drift/success";
import { executeCollectorRefs } from "../../../plugins/vh-adlc/scripts/docs-drift/collector-refs";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PublicationTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan, createJournal, readJournal, appendIntent, appendAttempt, appendAttemptEnd, appendOutcome, appendHandoff, writePublicationObjects } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { retainAbsence, retainLookup } from "../../../plugins/vh-adlc/scripts/docs-drift/observations";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { fixture, hash, role, bindings } from "./manifest-fixture";
import { settingsFixture } from "./settings-fixture";
import { executeCollectorEffect, type CollectorResources, type CollectorLabel } from "../../../plugins/vh-adlc/scripts/docs-drift/collector-proof";
import { projectBeforeSource } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof";


// Older orchestration tests use abstract observations. Owned-resource tests execute the collector.
export function publicationFixture(roots: string[], options: { owned_resources?: boolean; publisher?: { actor: string; actor_id: number; configured_actor: string; entry?: "copilot" | "claude" } } = {}) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "vh-drift-publish-")));
  roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts"), parent = join(root, "objects"), evidence = join(root, "evidence");
  for (const path of [repo, artifacts, parent, evidence]) mkdirSync(path, { mode: 0o700 });
  readGit(repo, "init", "--template=", "-b", "main");
  writeFileSync(join(repo, "README.md"), "Synthetic publisher fixture\n");
  mkdirSync(join(repo, ".vh-adlc"));
  const configured = settingsFixture(), publisher = options.publisher;
  if (publisher?.entry) {
    Object.assign(configured.publication, { entry_actors: { hosted: configured.publication.actor, copilot: publisher.configured_actor, claude: publisher.configured_actor } });
    configured.pr_discovery.authors.push(publisher.configured_actor);
  } else if (publisher) configured.publication.actor = publisher.configured_actor;
  const settingsBytes = canonicalJSON(configured);
  writeFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), settingsBytes);
  readGit(repo, "add", "--", "README.md", ".vh-adlc/docs-drift.yaml");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const commit = readGit(repo, "rev-parse", "HEAD").toString().trim();
  const settings = parseSettings(configured);
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + "operation-1" } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/one", head: bindings.candidate_commit } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Repair docs", body: "Exact reviewed body\n" + publicationMarker(settings, "operation-1") + "\n" + effectMarker("pr"), labels: ["documentation"], draft: true } },
    { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ];
  const input = fixture({ ...bindings, source_commit: commit, settings_sha256: sha256(settingsBytes) }, effects, "operation-1", publisher ? { actor: publisher.actor, actor_id: publisher.actor_id, ...(publisher.entry ? { publisher_entry: publisher.entry } : {}) } : undefined);
  const policy = { adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "trial" as const, transport: "collector" as const, pr_draft: true, ...(publisher?.entry ? { publisher_entry: publisher.entry } : {}), worker: role, reviewer: role };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policy, corrections: [], attention: [] });
  const store = createOwnedObjectStore({ parent, evidence_directory: evidence, source_repo: repo, source_commit: commit, repository: "fixture/docs", owner: "fixture", run: "fixture-run" });
  const executed: string[] = [], observed: string[] = [];
  const refs = new Map<string, string>(), done = new Set<string>();
  const resources: CollectorResources = new Map();
  const resourceLabels = new Map<string, CollectorLabel>([
    ["documentation", { id: 101, name: "documentation" }], ["old", { id: 102, name: "old" }], ["other", { id: 103, name: "other" }],
  ]);
  const transport: PublicationTransport = {
    kind: "collector", object_store: store.root, artifact_root: artifacts,
    async identity() { return { repository: "fixture/docs", repository_id: 10, actor: publisher?.actor ?? "fixture-bot", actor_id: publisher?.actor_id ?? 20, default_branch: "main" }; },
    async ref(ref) { return refs.has(ref) ? { state: "present", object: refs.get(ref)! } : { state: "absent" }; },
    async readPlanObject(object) {
      const tree = readGit(store.root, "rev-parse", object + "^{tree}").toString().trim();
      const blob = readGit(store.root, "rev-parse", tree + ":plan.json").toString().trim();
      const bytes = readGit(store.root, "cat-file", "blob", blob);
      return { bytes, objects: { object, tree, blob, plan_sha256: sha256(bytes) } };
    },
    async readDelivery(plan, effect, application) {
      const surface = effect.kind === "comment-create" ? "comments" : effect.kind === "issue-create" ? "issues" : "pulls";
      const inventory = [...resources.entries()].filter(([key, value]) => key.startsWith(surface + "/")
        && (surface !== "comments" || value.parent_number === effect.payload.number)).map(([, value]) => value);
      const resource = inventory.find(value => value.id === application.resource_id);
      const parent = effect.kind === "comment-create" ? resources.get("pulls/" + effect.payload.number) : null;
      const explanation = effect.kind === "pr-close" ? [...resources.entries()].filter(([key, value]) => key.startsWith("comments/")
        && value.parent_number === effect.payload.number).map(([, value]) => value) : [];
      return { resource, inventory, parent, explanation, // Match the native reader's request-scope digest. Response facts have their own projections.
        requests_sha256: sha256(canonicalJSON({ surface, number: application.number, resource_id: application.resource_id,
          parent_number: effect.payload.number ?? null })) };
    },
    async observe(plan, effect, objects) {
      observed.push(effect.id);
      const leaseObject = objects.lease_object ?? objects.object;
      if (options.owned_resources && ["lease-acquire", "receipt-retain", "lease-release", "push", "branch-refresh"].includes(effect.kind)) {
        const ref = String(effect.payload.ref), actual = refs.get(ref) ?? null;
        const expected = effect.kind === "push" || effect.kind === "branch-refresh" ? String(effect.payload.head)
          : effect.kind === "receipt-retain" ? objects.receipt_object ?? objects.object : objects.lease_object ?? objects.object;
        const lookup = { fixture_ref: ref, actual, expected };
        if (effect.kind === "lease-release" ? actual !== expected : actual === expected) return { state: "done", outcome: {
          state: "observed", observation_sha256: sha256(canonicalJSON(lookup)), resource_id: ref, object: actual } };
        const scope = { artifact_root: artifacts, source_repo: repo, plan, effect, transport: "collector" as const, lookup };
        if (effect.kind !== "lease-release" && actual !== null) return { state: "conflict", reason: "foreign-fixture-ref", evidence: retainLookup({ ...scope, state: "conflict" }) };
        return { state: "absent", evidence: retainAbsence(scope) };
      }
      if (effect.kind === "lease-release" && refs.get(String(effect.payload.ref)) !== leaseObject
        && objects.lease_object && objects.lease_object !== objects.object) return { state: "done", outcome: { state: "observed",
          observation_sha256: hash("lease-no-longer-owned"), resource_id: String(effect.payload.ref), object: refs.get(String(effect.payload.ref)) ?? null } };
      const receiptObject = objects.receipt_object ?? objects.object;
      if (effect.kind === "receipt-retain" && refs.has(String(effect.payload.ref)) && refs.get(String(effect.payload.ref)) !== receiptObject)
        return { state: "conflict", reason: "foreign-receipt-object" };
      if (effect.kind === "lease-acquire" && refs.has(String(effect.payload.ref)) && refs.get(String(effect.payload.ref)) !== leaseObject)
        return { state: "conflict", reason: "foreign-lease-object" };
      if (!done.has(effect.id) || (["lease-acquire", "receipt-retain"].includes(effect.kind) && !refs.has(String(effect.payload.ref)))) return { state: "absent", evidence: retainAbsence({ artifact_root: artifacts, source_repo: repo,
        plan, effect, transport: "collector", lookup: { fixture_effect: effect.id, state: "absent" } }) };
      let parentHead: string | undefined;
      if (effect.kind === "comment-create") {
        try { parentHead = projectBeforeSource(resources.get("pulls/" + effect.payload.number)).head_sha; }
        catch { /* Abstract fixtures retain their original observed object. */ }
      }
      return { state: "done", outcome: { state: "observed", observation_sha256: hash(effect.id), resource_id: effect.id,
        object: effect.kind === "lease-release" ? null : effect.kind === "lease-acquire" ? leaseObject : effect.kind === "receipt-retain" ? receiptObject : parentHead ?? objects.object } };
    },
    async execute(plan, effect, objects, attempt_id) {
      executed.push(effect.id);
      if (effect.kind === "lease-release" && refs.get(String(effect.payload.ref)) !== (objects.lease_object ?? objects.object)) throw Error("changed fixture lease");
      let captured: ExecutionResult | undefined;
      if (options.owned_resources && !attempt_id) throw new PublicationExecutionError(false, true);
      if (options.owned_resources && attempt_id) {
        const scope = { source_repo: repo, artifact_root: artifacts, plan, effect, attempt_id, settings, identity: await transport.identity() };
        captured = ["pr-create", "issue-create", "comment-create", "pr-update", "pr-close"].includes(effect.kind)
          ? executeCollectorEffect({ ...scope, resources, labels: resourceLabels })
          : executeCollectorRefs({ ...scope, objects, refs });
      }
      done.add(effect.id);
      if (options.owned_resources) {
        if (effect.kind === "lease-acquire") done.add(plan.manifest.effects[1].id);
      } else {
        if (effect.kind === "lease-acquire") {
          const receipt = plan.manifest.effects[1];
          if (receipt?.kind !== "receipt-retain") throw Error("missing fixture metadata envelope");
          const lease = objects.lease_object ?? objects.object, retained = objects.receipt_object ?? objects.object;
          if ((refs.has(String(effect.payload.ref)) && refs.get(String(effect.payload.ref)) !== lease)
            || (refs.has(String(receipt.payload.ref)) && refs.get(String(receipt.payload.ref)) !== retained)) throw new Error("fixture atomic metadata conflict");
          refs.set(String(effect.payload.ref), lease);
          refs.set(String(receipt.payload.ref), retained);
          done.add(receipt.id); executed.push(receipt.id);
        }
        if (effect.kind === "receipt-retain") refs.set(String(effect.payload.ref), objects.receipt_object ?? objects.object);
        if (effect.kind === "lease-release") refs.delete(String(effect.payload.ref));
      }
      return captured ?? undefined;
    },
  };
  const gate = async () => ({ review: input, policy });
  return { root, repo, artifacts, store, settings, input, policy, plan, transport, gate, executed, observed, refs, done, resources, resourceLabels };
}

export function publicationOptions(f: ReturnType<typeof publicationFixture>) {
  return { source_repo: f.repo, artifact_root: f.artifacts, object_store: f.store, settings: f.settings, plan: f.plan, transport: f.transport, gate: f.gate };
}


/** Serialized data from the pre-atomic publisher, retained for recovery compatibility tests. */
export async function legacyReceiptInterruption(f: ReturnType<typeof publicationFixture>, artifactRoot = f.artifacts) {
  const created = createJournal({ source_repo: f.repo, artifact_root: artifactRoot, plan: f.plan });
  const legacy = { ...created.header };
  delete legacy.observed_receipt_object;
  const header = canonicalJSON(legacy);
  writeFileSync(join(created.directory, "header.json"), header, { mode: 0o600 });
  writeFileSync(join(artifactRoot, "operation-1.journal-owner.json"), header, { mode: 0o600 });
  let journal = readJournal(created.directory, f.repo);
  const objects = writePublicationObjects(f.store, f.plan, journal.header);
  journal = appendIntent(journal, "lease");
  journal = appendAttempt(journal, "lease", "legacy-acquisition");
  f.refs.set(f.settings.publication.lease_ref, objects.lease_object);
  f.done.add("lease"); f.executed.push("lease");
  journal = appendAttemptEnd(journal, "lease", { attempt_id: "legacy-acquisition", sent: true, reaped: true });
  journal = appendOutcome(journal, "lease", { state: "observed", observation_sha256: hash("legacy-acquisition"),
    resource_id: f.settings.publication.lease_ref, object: objects.lease_object });
  journal = appendIntent(journal, "receipt");
  journal = appendAttempt(journal, "receipt", "legacy-unsent-receipt");
  journal = appendAttemptEnd(journal, "receipt", { attempt_id: "legacy-unsent-receipt", sent: false, reaped: true });
  journal = appendHandoff(journal, "receipt", "legacy-unsent-retention");
  return { state: "pending" as const, reason: "legacy-unsent-retention", journal, objects };
}
