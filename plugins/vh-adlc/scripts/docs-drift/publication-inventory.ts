import { PublicationScopeChanged } from "./publish";
import type { PullRequestInput } from "../github-read";
import { readBoundArtifact } from "./evidence-input";
import { readJournal } from "./journal";
import { exactRecord } from "./publication-decisions";
import { projectProposalBindings } from "./proposals";
import { canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import type { PlanObjects, PublicationTransport } from "./transport";

type Projection = ReturnType<typeof projectProposalBindings>;
export type PublicationInventory = {
  original: Projection; own: Projection["inventory"];
  observations: Array<{ effect_id: string; resource_id: string; observation_sha256: string }>;
};
const ownedContexts = new WeakSet<object>();

/** Called only by the native controller with its fresh inventory and reopened original journal. */
export async function capturePublicationInventory(input: {
  source_repo: string; artifact_root: string; journal_directory: string; original: unknown;
  transport: Pick<PublicationTransport, "kind" | "observe">; objects: PlanObjects; current_proposals: PullRequestInput[];
}): Promise<PublicationInventory> {
  const current = structuredClone(input.current_proposals), journal = readJournal(input.journal_directory, input.source_repo), plan = journal.plan;
  if (input.transport.kind !== "native" || plan.transport !== "native") throw Error("Native publication inventory required");
  const bytes = readBoundArtifact({ ...input, reference: input.original });
  if (sha256(bytes) !== plan.manifest.bindings.proposals_sha256) throw Error("Original proposal inventory binding changed");
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  const original = exactRecord(parsed, ["schema_version", "kind", "inventory", "resolution_sha256"], "Original proposal inventory fields changed");
  if (original.schema_version !== 1 || original.kind !== "docs-drift-proposal-snapshot" || !Array.isArray(original.inventory)
    || !canonicalJSON(original).equals(bytes)) throw Error("Original proposal inventory required");
  const result: PublicationInventory = { original: original as Projection, own: [], observations: [] };
  for (const effect of plan.manifest.effects) {
    if (effect.kind !== "pr-create" || !journal.events.some(event => event.kind === "intent" && event.effect_id === effect.id)) continue;
    const observed = await input.transport.observe(plan, effect, input.objects);
    if (observed.state === "conflict") throw new PublicationScopeChanged("Current own publication changed");
    if (observed.state === "unknown") throw Error("Current own publication proof unavailable");
    if (observed.state === "absent") {
      if (journal.events.some(event => event.effect_id === effect.id && event.kind === "outcome")) throw new PublicationScopeChanged("Current own publication disappeared");
      continue;
    }
    if (!observed.outcome.resource_id || !/^[1-9][0-9]*$/u.test(observed.outcome.resource_id)) throw Error("Current own publication resource unavailable");
    const number = Number(observed.outcome.resource_id);
    const matches = current.filter(item => item.number === number);
    if (matches.length !== 1) throw new PublicationScopeChanged("Current own publication inventory missing or duplicated");
    if (result.original.inventory.some(item => item.number === number)) continue;
    const proposal = matches[0], payload = effect.payload;
    // Full title/labels/payload are checked by the fresh native observer. Inventory fields must agree with that exact effect too.
    if (proposal.state !== "open" || proposal.merged_at !== null || proposal.body !== payload.body || proposal.draft !== payload.draft
      || proposal.actor !== plan.manifest.actor || proposal.actor_id !== plan.manifest.actor_id || proposal.head_ref !== payload.branch
      || proposal.head_sha !== plan.manifest.bindings.candidate_commit || proposal.head_repository?.id !== plan.manifest.repository_id
      || proposal.base_ref !== payload.base || proposal.base_repository.id !== plan.manifest.repository_id) throw new PublicationScopeChanged("Fresh own publication inventory changed");
    result.own.push(projectProposalBindings([proposal], null).inventory[0]);
    result.observations.push({ effect_id: effect.id, resource_id: observed.outcome.resource_id, observation_sha256: observed.outcome.observation_sha256 });
  }
  const context = freezeJSON(result); ownedContexts.add(context);
  projectCurrentProposals(current, context.original.resolution_sha256, context);
  return context;
}

/** Hide only exact freshly observed own creations when comparing against the reviewed original inventory. */
export function projectCurrentProposals(inventory: PullRequestInput[], resolutionSHA: string | null, context?: PublicationInventory): Projection {
  const current = projectProposalBindings(inventory, resolutionSHA);
  if (context === undefined) return current;
  if (!ownedContexts.has(context)) throw Error("Original native publication inventory context required");
  for (const own of context.own) {
    const matches = current.inventory.filter(item => item.number === own.number);
    if (matches.length !== 1 || !canonicalJSON(matches[0]).equals(canonicalJSON(own))) throw new PublicationScopeChanged("Fresh own publication inventory changed");
  }
  const normalized = { ...current, inventory: current.inventory.filter(item => !context.own.some(own => own.number === item.number)) };
  if (!canonicalJSON(normalized).equals(canonicalJSON(context.original))) throw new PublicationScopeChanged("Current proposal inventory changed outside proven own publication");
  return freezeJSON(normalized);
}
