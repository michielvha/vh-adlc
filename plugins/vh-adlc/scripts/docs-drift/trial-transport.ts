import { executeCollectorEffect } from "./collector-proof";
import { executeCollectorRefs } from "./collector-refs";
import { projectBeforeSource } from "./delivery-proof";
import { readGit } from "./git";
import { effectDigest, effectMarker, type Effect } from "./manifests";
import { retainAbsence, retainLookup } from "./observations";
import { canonicalJSON, sha256 } from "./protocol";
import { publicationMarker } from "./report-history";
import { isRefreshTarget } from "./proposals";
import type { SealedPlan } from "./journal";
import { loadTrialContext, TRIAL_IDENTITY, type TrialContext } from "./trial-context";
import { persistTrialTracker, readTrialTracker } from "./trial-tracker";
import type { EffectObservation, PlanObjects, PublicationTransport, RefObservation } from "./transport";

const refKinds = new Set(["lease-acquire", "lease-release", "receipt-retain", "push", "branch-refresh"]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("synthetic resource unavailable");
  return value as Record<string, unknown>;
}
function same(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }
function resourceSurface(effect: Effect): string {
  return effect.kind === "comment-create" ? "comments" : effect.kind === "issue-create" ? "issues" : "pulls";
}

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
  function observeResource(plan: SealedPlan, effect: Effect): EffectObservation {
    const state = readTrialTracker(context), p = effect.payload, surface = resourceSurface(effect);
    const inventory = [...state.resources.entries()].filter(([key, value]) => key.startsWith(surface + "/")
      && (surface !== "comments" || value.parent_number === p.number)).map(([, value]) => value);
    const marker = publicationMarker(settings, plan.manifest.operation_id), selectedMarker = effectMarker(effect.id);
    const creation = ["pr-create", "issue-create", "comment-create"].includes(effect.kind);
    const matches = creation ? inventory.filter(item => typeof item.body === "string" && item.body.includes(marker) && item.body.includes(selectedMarker))
      : inventory.filter(item => item.number === p.number);
    const lookup = { inventory, matches };
    const observation = { artifact_root: context.artifacts, source_repo: context.source, plan, effect, transport: "collector" as const, lookup };
    if (!matches.length && creation) return { state: "absent", evidence: retainAbsence(observation) };
    if (matches.length !== 1) return { state: "unknown", reason: "synthetic target missing or ambiguous" };
    const item = matches[0], user = object(item.user);
    const labels = Array.isArray(item.labels) ? item.labels.map(label => object(label).name).sort() : null;
    const fieldsMatch = (fields: Record<string, unknown>) => same({ title: item.title, body: item.body, labels, draft: item.draft },
      { ...fields, labels: Array.isArray(fields.labels) ? [...fields.labels].sort() : fields.labels });
    let matchesTarget = item.body === p.body;
    if (["pr-create", "pr-update"].includes(effect.kind)) matchesTarget = fieldsMatch({ title: p.title, body: p.body, labels: p.labels, draft: p.draft });
    if (effect.kind === "issue-create") matchesTarget = item.title === p.title && item.body === p.body && same(labels, [...p.labels as string[]].sort())
      && item.state === "open" && !Object.hasOwn(item, "pull_request");
    if (creation) matchesTarget &&= user.id === TRIAL_IDENTITY.actor_id && user.login === TRIAL_IDENTITY.actor;
    if (surface === "pulls") {
      const source = projectBeforeSource(item);
      const wantedHead = effect.kind === "pr-create" ? plan.manifest.bindings.candidate_commit : p.expected_head;
      const validPull = source.head_sha === wantedHead && source.base_ref === settings.default_branch && source.base_repository_id === TRIAL_IDENTITY.repository_id
        && source.head_repository_id === TRIAL_IDENTITY.repository_id && item.merged_at === null && item.merged !== true;
      if (effect.kind === "pr-update" && !isRefreshTarget(settings, TRIAL_IDENTITY, { number: source.number, actor: String(user.login),
        actor_id: Number(user.id), head_ref: source.head_ref, head_repository_id: source.head_repository_id })) {
        return { state: "conflict", reason: "synthetic PR outside configured refresh scope", evidence: retainLookup({ ...observation, state: "conflict" }) };
      }
      matchesTarget &&= validPull;
      if (effect.kind === "pr-create" && (source.head_ref !== p.branch || source.state !== "open")) matchesTarget = false;
      if (effect.kind === "pr-close") matchesTarget = validPull && source.state === "closed";
      if (!matchesTarget && effect.kind === "pr-update" && validPull && source.state === "open"
        && fieldsMatch(object(p.expected_payload))) return { state: "absent", evidence: retainAbsence(observation) };
      if (effect.kind === "pr-close" && validPull && source.state === "open") return { state: "absent", evidence: retainAbsence(observation) };
    }
    if (!matchesTarget) return { state: "conflict", reason: "synthetic reviewed target changed", evidence: retainLookup({ ...observation, state: "conflict" }) };
    return { state: "done", outcome: { state: "observed", observation_sha256: sha256(canonicalJSON(lookup)),
      resource_id: String(item.id), object: surface === "pulls" ? projectBeforeSource(item).head_sha : null } };
  }
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
      const state = readTrialTracker(context), surface = resourceSurface(effect);
      const inventory = [...state.resources.entries()].filter(([key, value]) => key.startsWith(surface + "/")
        && (surface !== "comments" || value.parent_number === effect.payload.number)).map(([, value]) => value);
      const resource = inventory.find(value => value.id === application.resource_id);
      const parent = effect.kind === "comment-create" ? state.resources.get("pulls/" + effect.payload.number) ?? null : null;
      const explanation = effect.kind === "pr-close" ? [...state.resources.entries()].filter(([key, value]) => key.startsWith("comments/")
        && value.parent_number === effect.payload.number).map(([, value]) => value) : [];
      return { resource, inventory, parent, explanation, requests_sha256: sha256(canonicalJSON({ inventory, parent, explanation })) };
    },
    async observe(plan, effect, objects) {
      scope(plan, effect);
      if (!refKinds.has(effect.kind)) return observeResource(plan, effect);
      const name = String(effect.payload.ref), actual = ref(name), observed = actual.state === "present" ? actual.object : null;
      const expected = effect.kind === "receipt-retain" ? objects.receipt_object ?? objects.object
        : ["push", "branch-refresh"].includes(effect.kind) ? String(effect.payload.head) : objects.lease_object ?? objects.object;
      const lookup = { ref: name, observed, expected };
      if (effect.kind === "lease-release" ? observed !== expected : observed === expected) return { state: "done", outcome: {
        state: "observed", observation_sha256: sha256(canonicalJSON(lookup)), resource_id: name, object: observed } };
      const retained = { artifact_root: context.artifacts, source_repo: context.source, plan, effect, transport: "collector" as const, lookup };
      if (observed !== null && effect.kind !== "lease-release" && !(effect.kind === "branch-refresh" && observed === effect.payload.expected_head)) {
        return { state: "conflict", reason: "foreign synthetic ref", evidence: retainLookup({ ...retained, state: "conflict" }) };
      }
      return { state: "absent", evidence: retainAbsence(retained) };
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
