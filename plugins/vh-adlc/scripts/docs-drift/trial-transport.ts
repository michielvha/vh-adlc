import { executeCollectorEffect } from "./collector-proof";
import { executeCollectorRefs } from "./collector-refs";
import { readGit } from "./git";
import { effectDigest, type Effect } from "./manifests";
import { sha256 } from "./protocol";
import type { SealedPlan } from "./journal";
import { loadTrialContext, TRIAL_IDENTITY, type TrialContext } from "./trial-context";
import { persistTrialTracker, readTrialTracker } from "./trial-tracker";
import { createPublicationReader, type PlanObjects, type PublicationTransport, type RefObservation } from "./transport";
import { createRepositoryReader } from "../github-read";
import { createTrialGitHubReader } from "./trial-reader";

const refKinds = new Set(["lease-acquire", "lease-release", "receipt-retain", "push", "branch-refresh"]);
/** No network client, endpoint override, credential input or native transport is constructed here. */
export function createTrialTransport(selected: TrialContext): PublicationTransport {
  function currentContext() {
    return loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  }
  const context = currentContext(), settings = context.settings;
  function ref(ref: string): RefObservation {
    readGit(context.origin, "check-ref-format", ref);
    const inventory = readGit(context.origin, "for-each-ref", "--format=%(refname) %(objectname)", "--", ref).toString().trim().split("\n");
    const found = inventory.find(row => row.startsWith(ref + " "));
    return found ? { state: "present", object: found.slice(ref.length + 1) } : { state: "absent" };
  }
  function scope(plan: SealedPlan, effect: Effect): void {
    const fresh = currentContext();
    if (fresh.context_sha256 !== context.context_sha256 || plan.context !== "trial" || plan.transport !== "collector"
      || plan.manifest.repository !== TRIAL_IDENTITY.repository || plan.manifest.repository_id !== TRIAL_IDENTITY.repository_id
      || plan.manifest.actor !== TRIAL_IDENTITY.actor || plan.manifest.actor_id !== TRIAL_IDENTITY.actor_id) throw Error("synthetic trial collector plan required");
    const owned = plan.manifest.effects.find(item => item.id === effect.id);
    if (!owned || effectDigest([owned]) !== effectDigest([effect])) throw Error("synthetic selected effect changed");
    const allowedRef = String(effect.payload.ref ?? "");
    if (refKinds.has(effect.kind) && !(allowedRef === settings.publication.lease_ref
      || allowedRef === settings.publication.receipt_ref_prefix + plan.manifest.operation_id
      || ["push", "branch-refresh"].includes(effect.kind) && allowedRef.startsWith("refs/heads/" + settings.publication.branch_prefix))) throw Error("synthetic ref outside fixture scope");
  }
  function fetchedObject(id: string): string {
    if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(id)) throw Error("synthetic immutable object required");
    readGit(context.store.root, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always", "-c", "gc.auto=0",
      "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--", context.origin, id);
    if (readGit(context.store.root, "rev-parse", "--verify", "--end-of-options", id + "^{commit}").toString().trim() !== id) throw Error("synthetic object binding");
    return id;
  }
  const reader = createTrialGitHubReader(context);
  const publication = createPublicationReader({ settings, source_repo: context.source, artifact_root: context.artifacts,
    transport: "collector", reader, repository: createRepositoryReader(reader, settings.repository), ref });
  return {
    kind: "collector", object_store: context.store.root, artifact_root: context.artifacts,
    async identity() { currentContext(); return { ...TRIAL_IDENTITY }; },
    async ref(name) { currentContext(); return ref(name); },
    async readPlanObject(id) {
      currentContext(); fetchedObject(id);
      const tree = readGit(context.store.root, "rev-parse", id + "^{tree}").toString().trim();
      const blob = readGit(context.store.root, "rev-parse", tree + ":plan.json").toString().trim();
      const bytes = readGit(context.store.root, "cat-file", "blob", blob);
      return { bytes, objects: { object: id, tree, blob, plan_sha256: sha256(bytes) } };
    },
    async readDelivery(plan, effect, application) {
      scope(plan, effect);
      return publication.readDelivery(plan, effect, application);
    },
    async observe(plan, effect, objects) {
      scope(plan, effect);
      return publication.observe(plan, effect, objects);
    },
    async execute(plan, effect, objects: PlanObjects, attempt_id) {
      scope(plan, effect);
      if (!attempt_id) throw Error("synthetic attempt identity required");
      const common = { source_repo: context.source, artifact_root: context.artifacts, plan, effect, attempt_id, settings, identity: TRIAL_IDENTITY };
      if (!refKinds.has(effect.kind)) {
        const state = readTrialTracker(context);
        return executeCollectorEffect({ ...common, resources: state.resources, labels: state.labels,
          persist: () => { persistTrialTracker(context, state); } });
      }
      const rows = readGit(context.origin, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/").toString().trim().split("\n").filter(Boolean);
      const refs = new Map(rows.map(row => row.split(" ") as [string, string])), previous = new Map(refs);
      return executeCollectorRefs({ ...common, objects, refs, persist: () => {
        const updates = [...new Set([...previous.keys(), ...refs.keys()])].filter(name => previous.get(name) !== refs.get(name));
        if (!updates.length) throw Error("synthetic ref transaction made no change");
        const leases = updates.map(name => "--force-with-lease=" + name + ":" + (previous.get(name) ?? ""));
        const specifications = updates.map(name => (refs.get(name) ?? "") + ":" + name);
        readGit(context.store.root, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always",
          "push", "--atomic", "--no-verify", ...leases, "--", context.origin, ...specifications);
        for (const name of updates) {
          const current = ref(name);
          if ((current.state === "present" ? current.object : null) !== (refs.get(name) ?? null)) throw Error("synthetic ref transaction observation changed");
        }
      } });
    },
  };
}
