import { sameAccount, type PublisherEntry } from "./identity";
import type { PullRequestInput } from "../github-read";
import { readOriginalProductionPolicy } from "./bootstrap";
import { verifyProductionPreflight } from "./preflight";
import { isGitAncestor, readGit } from "./git";
import { readRetainedPlan, readVerifiedPlan, type PlanPolicy, type SealedPlan } from "./journal";
import { readOwnedPatch } from "./preparation";
import { canonicalDigest, canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { deriveSourceWorkerInputs } from "./publication-worker";
import { validatePublicationShape } from "./publish";
import { correctionProjection } from "./report";
import type { NativePublicationBinding, ReviewedPublication } from "./report-history";
import { resolutionSource } from "./resolve";
import { loadCommittedSettings, SetupRequired } from "./settings";
import { captureBareSnapshot, type OwnedObjectStore } from "./snapshot";
import type { PublicationIdentity } from "./transport";

export class RetainedPublicationIneligible extends Error {
  constructor(reason: string) { super("docs-drift retained publication " + reason); }
}

/** Native ref/object collection calls this verifier; it supplies neither fresh support nor execution grants. */
export function createAdoptedPublicationVerifier(input: {
  store: OwnedObjectStore; current_default: string; identity: PublicationIdentity; entry?: PublisherEntry; proposal: PullRequestInput;
}) {
  const { store, current_default: current, identity, proposal } = structuredClone(input), repo = store.root;
  const currentSettings = loadCommittedSettings(repo, current).settings;
  if (currentSettings.schema_version !== 2) throw new SetupRequired("Use the original implementation to inspect version-one publication history.");
  if (!currentSettings.component) throw Error("Ordinary publication history component required");
  verifyProductionPreflight({ repo, current_default: current, component: currentSettings.component,
    publisher: input.entry ? { entry: input.entry, identity } : undefined });
  return (bytes: Buffer, native: Omit<NativePublicationBinding, "corrections" | "attention">): ReviewedPublication => {
    function fail(reason: string): never { throw new RetainedPublicationIneligible(reason); }
    try {
      function readPlan() { try { return readRetainedPlan(bytes); } catch { fail("invalid retained plan"); } }
      const original = readPlan(), manifest = original.manifest, bindings = manifest.bindings;
      if (original.context !== "production" || original.transport !== "native") fail("requires production native evidence");
      if (original.schema_version !== 2) fail("version-one history requires its original implementation");
      if (proposal.state !== "open" || proposal.merged_at !== null || !sameAccount(proposal, manifest)
        || proposal.base_repository.id !== identity.repository_id || proposal.head_repository?.id !== identity.repository_id
        || proposal.base_repository.full_name.toLowerCase() !== identity.repository.toLowerCase()
        || proposal.head_repository.full_name.toLowerCase() !== identity.repository.toLowerCase() || proposal.base_ref !== identity.default_branch)
        fail("current owned proposal identity changed");
      if (native.repository !== identity.repository || native.repository_id !== identity.repository_id || !sameAccount(native, manifest) || native.head !== proposal.head_sha || native.body_sha256 !== sha256(Buffer.from(proposal.body))
        || native.operation_id !== manifest.operation_id || native.ref !== currentSettings.publication.receipt_ref_prefix + manifest.operation_id
        || manifest.repository !== native.repository || manifest.repository_id !== native.repository_id)
        fail("native publication identity or receipt changed");
      // These snapshots require complete owned histories before a negative ancestry verdict is meaningful.
      const source = captureBareSnapshot(repo, bindings.source_commit), candidate = captureBareSnapshot(repo, native.head);
      if (!isGitAncestor(repo, bindings.source_commit, current) || !isGitAncestor(repo, bindings.source_commit, native.head))
        fail("original source is not an ancestor of the current default or proposal head");
      const producer = { ...identity, actor: native.actor, actor_id: native.actor_id };
      const stable = deriveSourceWorkerInputs(source);
      for (const key of Object.keys(stable) as Array<keyof typeof stable>) if (bindings[key] !== stable[key]) fail("original source bindings changed");
      const settings = source.settings;
      if (settings.hostname !== currentSettings.hostname || settings.repository !== currentSettings.repository)
        fail("original publication repository changed");
      const policies: PlanPolicy[] = [readOriginalProductionPolicy({ repo, plan: original, identity: producer }).policy];
      const policy = policies.find(candidate => (["worker", "reviewer"] as const).every(role => {
        const observed = original.roles[role], expected = candidate[role];
        return observed.requested_model === expected.requested_model && observed.model === expected.adopted_model
          && canonicalJSON(observed.identity_source).equals(canonicalJSON(expected.identity_source));
      }));
      if (!policy) fail("approved role policy changed");
      let plan: SealedPlan;
      try {
        plan = readVerifiedPlan(bytes, () => policy);
        validatePublicationShape(plan, settings, policy.pr_draft);
      } catch { fail("reviewed policy or publication shape changed"); }
      const tree = readGit(repo, "rev-parse", "--verify", "--end-of-options", native.head + "^{tree}").toString().trim();
      if (bindings.candidate_commit !== native.head || bindings.candidate_tree !== native.tree || native.tree !== tree
        || sha256(readOwnedPatch(store, settings.repository, bindings.source_commit, native.head)) !== bindings.diff_sha256)
        fail("candidate tree or complete diff changed");
      const effects = manifest.effects.filter(effect => (effect.kind === "pr-create" && effect.payload.branch === proposal.head_ref
        && effect.payload.base === proposal.base_ref) || (effect.kind === "pr-update" && effect.payload.number === proposal.number
        && effect.payload.expected_head === native.head)).filter(effect => effect.payload.draft === proposal.draft
          && typeof effect.payload.body === "string" && sha256(Buffer.from(effect.payload.body)) === native.body_sha256);
      if (effects.length !== 1) fail("exact reviewed proposal payload unavailable");
      const postimages = new Map(candidate.blobs.map(blob => [blob.path, blob.bytes]));
      if (candidate.settings_sha256 !== source.settings_sha256) fail("candidate configuration changed");
      const sourceInputs = canonicalDigest(resolutionSource(source));
      for (const correction of plan.corrections) {
        const postimageBytes = postimages.get(correction.path), postimage = postimageBytes ? sha256(postimageBytes) : canonicalDigest({ path: correction.path, absent: true });
        if (correction.inputs_sha256 !== sourceInputs || correction.postimage_sha256 !== postimage
          || correction.patch_sha256 !== sha256(readOwnedPatch(store, settings.repository, bindings.source_commit, native.head, [correction.path])))
          fail("normalized correction bindings changed");
      }
      return freezeJSON({ repository: native.repository, repository_id: native.repository_id, operation_id: native.operation_id,
        actor: manifest.actor, actor_id: manifest.actor_id, head: native.head, tree, body_sha256: native.body_sha256,
        corrections: plan.corrections.map(correctionProjection), attention: structuredClone(plan.attention) });
    } catch (error) {
      if (error instanceof RetainedPublicationIneligible) throw error;
      throw new Error("docs-drift retained publication original evidence unavailable", { cause: error });
    }
  };
}
