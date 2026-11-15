import { sameAccount, sameLogin } from "./identity";
import { dirname } from "node:path";
import { readAppliedDelivery, readBefore, projectBeforeSource, type AppliedDelivery } from "./delivery-proof";
import { readArtifact, readJournal, type SealedPlan } from "./journal";
import { canonicalJSON, sha256 } from "./protocol";
import { projectSuccess, type Facts, type SuccessEvidence } from "./success";
import { retainLookup } from "./observations";
import { publicationMarker } from "./report-history";
import { effectMarker, type Effect } from "./manifests";
import type { PublicationTransport } from "./transport";
import type { Settings } from "./settings";

/** These responses stay in memory. Only the validated bounded projection is retained. */
export type DeliveryResources = {
  resource: unknown; inventory: unknown[]; parent: unknown | null; explanation: unknown[];
  requests_sha256: string;
};
export type DeliveryLookup = {
  effect_id: string; resource_id: number; application_sha256: string;
  transport: "native" | "collector"; context: "trial" | "production";
  current: Facts; parent: ReturnType<typeof projectBeforeSource> | null;
  creator_projection?: { observed_login_sha256: string; recorded_login_sha256: string };
  differences: string[]; requests_sha256: string; current_sha256: string; evidence: SuccessEvidence;
};

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("incomplete delivery resource");
  return value as Record<string, unknown>;
}
function facts(value: unknown): Facts {
  const input = record(value), projected = projectSuccess(Buffer.from("HTTP/2.0 200 OK\r\n\r\n" + JSON.stringify(input)));
  if (!projected) throw Error("incomplete delivery lookup");
  return projected.facts;
}
function same(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }
function markers(value: unknown, marker: string, selected: string): boolean {
  return typeof value === "string" && value.split(marker).length === 2 && value.split(selected).length === 2
    && (value.match(/<!-- vh-adlc-docs-drift\b/gu)?.length ?? 0) === 1;
}
function inventory(items: unknown[], marker: string, selected: string): number[] {
  if (!Array.isArray(items) || items.length > 1000) throw Error("incomplete delivery inventory");
  const seen = new Set<number>(), matches: number[] = [];
  for (const item of items) {
    const resource = record(item);
    if (!Number.isSafeInteger(resource.id) || Number(resource.id) < 1 || seen.has(Number(resource.id))
      || resource.body !== null && typeof resource.body !== "string") throw Error("incomplete delivery inventory");
    seen.add(Number(resource.id));
    if (typeof resource.body === "string" && resource.body.includes(marker) && resource.body.includes(selected)) matches.push(Number(resource.id));
  }
  return matches.sort((left, right) => left - right);
}

/** Re-read native state independently from the retained application response. */
export async function lookupAppliedDelivery(options: {
  source_repo: string; journal_directory: string; effect_id: string; settings: Settings; transport: PublicationTransport;
}): Promise<DeliveryLookup> {
  const application = readAppliedDelivery({ ...options, transport: options.transport.kind });
  const journal = readJournal(options.journal_directory, options.source_repo), { plan } = journal;
  const effect = plan.manifest.effects.find(item => item.id === options.effect_id)!;
  if (!options.transport.readDelivery || options.transport.artifact_root !== dirname(journal.directory)) throw Error("delivery-lookup-unavailable");
  const identity = await options.transport.identity();
  if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id
    || !sameAccount(identity, plan.manifest)) throw Error("delivery-current-actor-changed");
  const resources = structuredClone(await options.transport.readDelivery(plan, effect, application));
  const current = facts(resources.resource), originalBytes = readArtifact(application.successes[0].path);
  if (sha256(originalBytes) !== application.successes[0].sha256) throw Error("delivery-application-changed");
  const applied = record(JSON.parse(originalBytes.toString())), original = applied.facts as Facts;
  const creatorValue = record(applied.identity);
  if (typeof creatorValue.actor !== "string" || typeof creatorValue.actor_id !== "number"
    || !Number.isSafeInteger(creatorValue.actor_id) || creatorValue.actor_id < 1) throw Error("delivery-current-target-changed");
  const creator = { actor: creatorValue.actor, actor_id: creatorValue.actor_id };
  const scope = { artifact_root: options.transport.artifact_root, source_repo: options.source_repo, plan, effect, attempt_id: application.attempt_id };
  const before = readBefore({ ...scope, evidence: application.before });
  if (current.id !== application.resource_id || current.number !== application.number
    || current.user_id !== original.user_id) throw Error("delivery-current-target-changed");
  let creator_projection: DeliveryLookup["creator_projection"];
  if (current.user_login_sha256 !== original.user_login_sha256) {
    const nativeCreator = record(record(resources.resource).user);
    // The verified applied response binds the original own creator's ID and exact spelling hash.
    if (!sameAccount(creator, plan.manifest) || original.user_id !== creator.actor_id || original.user_login_sha256 !== sha256(Buffer.from(creator.actor))
      || typeof nativeCreator.login !== "string" || !sameLogin(nativeCreator.login, creator.actor)) throw Error("delivery-current-target-changed");
    creator_projection = { observed_login_sha256: sha256(Buffer.from(nativeCreator.login)),
      recorded_login_sha256: sha256(Buffer.from(creator.actor)) };
  }
  const marker = publicationMarker(options.settings, plan.manifest.operation_id);
  if (effect.kind !== "pr-close" && effect.kind !== "pr-update") {
    if (!markers(record(resources.resource).body, marker, effectMarker(effect.id))) throw Error("delivery-current-marker-changed");
    const matches = inventory(resources.inventory, marker, effectMarker(effect.id));
    if (matches.length !== 1 || matches[0] !== application.resource_id) throw Error("delivery-current-marker-ambiguous");
  }
  let parent: DeliveryLookup["parent"] = null;
  if (effect.kind === "comment-create") {
    parent = projectBeforeSource(resources.parent);
    for (const key of ["id", "number", "head_sha", "head_ref", "base_ref", "head_repository_id", "base_repository_id"] as const) {
      if (parent[key] !== before.source![key]) throw Error("delivery-current-parent-changed");
    }
    for (const key of ["parent_number", "parent_repository", "parent_host", "parent_path"] as const) {
      if (current[key] !== original[key]) throw Error("delivery-current-parent-changed");
    }
  } else if (effect.kind !== "issue-create") {
    projectBeforeSource(resources.resource);
    for (const key of ["head_sha", "head_ref", "base_ref", "head_repository_id", "base_repository_id"] as const) {
      if (current[key] !== original[key]) throw Error("delivery-current-head-changed");
    }
    if (current.merged !== false) throw Error("delivery-current-merge-changed");
  } else {
    if (Object.hasOwn(record(resources.resource), "pull_request")) throw Error("delivery-current-target-changed");
    if (current.title_sha256 === null || current.labels === null || current.state === null) throw Error("delivery-current-resource-incomplete");
  }
  if (effect.kind === "pr-close") {
    const explanation = plan.manifest.effects.find(item => item.id === application.explanation_effect_id)!;
    const proof = readAppliedDelivery({ ...options, effect_id: explanation.id, transport: options.transport.kind });
    const matches = inventory(resources.explanation, marker, effectMarker(explanation.id));
    const found = resources.explanation.map(record).find(item => item.id === proof.resource_id);
    if (matches.length !== 1 || matches[0] !== proof.resource_id || !found || found.body !== explanation.payload.body
      || facts(found).user_id !== plan.manifest.actor_id || !sameLogin(String(record(found.user).login), plan.manifest.actor)) throw Error("delivery-current-explanation-changed");
  }
  const p = effect.payload;
  const desired: Partial<Facts> = effect.kind === "pr-close" ? { state: "closed" }
    : effect.kind === "comment-create" ? { body_sha256: sha256(Buffer.from(String(p.body))) }
      : { title_sha256: sha256(Buffer.from(String(p.title))), body_sha256: sha256(Buffer.from(String(p.body))),
        labels: before.label_ids, state: original.state,
        ...(["pr-create", "pr-update"].includes(effect.kind) ? { draft: p.draft as boolean } : {}) };
  const differences = (Object.keys(desired) as (keyof Facts)[]).filter(key => !same(current[key], desired[key])).sort();
  const acknowledged = journal.events.some(event => event.kind === "acknowledged-delivery" && event.effect_id === effect.id);
  if (!differences.length && !acknowledged) throw Error("delivery-currently-matching");
  if (!/^[a-f0-9]{64}$/u.test(resources.requests_sha256)) throw Error("incomplete delivery request trace");
  const projection = { effect_id: effect.id, resource_id: application.resource_id, application_sha256: application.proof_sha256,
    transport: plan.transport, context: plan.context, current, parent, differences,
    ...(creator_projection ? { creator_projection } : {}),
    requests_sha256: resources.requests_sha256 };
  const evidence = retainLookup({ ...scope, transport: plan.transport, state: "conflict", lookup: projection });
  return { ...projection, current_sha256: sha256(canonicalJSON(projection)), evidence };
}

export type DeliveryReader = (plan: SealedPlan, effect: Effect, application: AppliedDelivery) => Promise<DeliveryResources>;
