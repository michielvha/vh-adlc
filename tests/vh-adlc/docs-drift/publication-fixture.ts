import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PublicationTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { fixture, hash, role, bindings } from "./manifest-fixture";
import { settingsFixture } from "./settings-fixture";


export function publicationFixture(roots: string[]) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "vh-drift-publish-")));
  roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts"), parent = join(root, "objects"), evidence = join(root, "evidence");
  for (const path of [repo, artifacts, parent, evidence]) mkdirSync(path, { mode: 0o700 });
  readGit(repo, "init", "--template=", "-b", "main");
  writeFileSync(join(repo, "README.md"), "Synthetic publisher fixture\n");
  mkdirSync(join(repo, ".vh-adlc"));
  const settingsBytes = canonicalJSON(settingsFixture());
  writeFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), settingsBytes);
  readGit(repo, "add", "--", "README.md", ".vh-adlc/docs-drift.yaml");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const commit = readGit(repo, "rev-parse", "HEAD").toString().trim();
  const settings = parseSettings(settingsFixture());
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + "operation-1" } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/one", head: bindings.candidate_commit } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Repair docs", body: "Exact reviewed body\n" + publicationMarker(settings, "operation-1") + "\n" + effectMarker("pr"), labels: ["documentation"], draft: true } },
    { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ];
  const input = fixture({ ...bindings, source_commit: commit, settings_sha256: sha256(settingsBytes) }, effects);
  const policy = { adoption_sha256: hash("adoption"), context: "trial" as const, transport: "collector" as const, pr_draft: true, worker: role, reviewer: role };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policy, corrections: [], attention: [] });
  const store = createOwnedObjectStore({ parent, evidence_directory: evidence, source_repo: repo, source_commit: commit, repository: "fixture/docs", owner: "fixture", run: "fixture-run" });
  const executed: string[] = [], observed: string[] = [];
  const refs = new Map<string, string>(), done = new Set<string>();
  const transport: PublicationTransport = {
    kind: "collector", object_store: store.root,
    async identity() { return { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20, default_branch: "main" }; },
    async ref(ref) { return refs.has(ref) ? { state: "present", object: refs.get(ref)! } : { state: "absent" }; },
    async readPlanObject(object) {
      const tree = readGit(store.root, "rev-parse", object + "^{tree}").toString().trim();
      const blob = readGit(store.root, "rev-parse", tree + ":plan.json").toString().trim();
      const bytes = readGit(store.root, "cat-file", "blob", blob);
      return { bytes, objects: { object, tree, blob, plan_sha256: sha256(bytes) } };
    },
    async observe(plan, effect, objects) {
      observed.push(effect.id);
      if (!done.has(effect.id)) return { state: "absent" };
      return { state: "done", outcome: { state: "observed", observation_sha256: hash(effect.id), resource_id: effect.id, object: effect.kind === "lease-release" ? null : objects.object } };
    },
    async execute(plan, effect, objects) {
      executed.push(effect.id); done.add(effect.id);
      if (effect.kind === "lease-acquire") { refs.set(String(effect.payload.ref), objects.object); }
      if (effect.kind === "receipt-retain") refs.set(String(effect.payload.ref), objects.object);
      if (effect.kind === "lease-release") refs.delete(String(effect.payload.ref));
    },
  };
  const gate = async () => ({ review: input, policy });
  return { root, repo, artifacts, store, settings, input, policy, plan, transport, gate, executed, observed, refs, done };
}

export function publicationOptions(f: ReturnType<typeof publicationFixture>) {
  return { source_repo: f.repo, artifact_root: f.artifacts, object_store: f.store, settings: f.settings, plan: f.plan, transport: f.transport, gate: f.gate };
}

