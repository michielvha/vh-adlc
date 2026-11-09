import { PublicationScopeChanged } from "./publish";
import type { PullRequestInput } from "../github-read";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { readJournal } from "./journal";
import { exactRecord } from "./publication-decisions";
import { projectProposalBindings } from "./proposals";
import { canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import { updateTransitions, type PlanObjects, type PublicationTransport } from "./transport";

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
  let bytes: Buffer;
  try { bytes = readBoundArtifact({ ...input, reference: input.original }); }
  catch (error) { if (error instanceof ArtifactChanged) throw new PublicationScopeChanged(error.message); throw error; }
  if (sha256(bytes) !== plan.manifest.bindings.proposals_sha256) throw new PublicationScopeChanged("Original proposal inventory binding changed");
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
  for (const branch of plan.manifest.effects.filter(effect => effect.kind === "branch-refresh")) {
    if (!journal.events.some(event => event.kind === "intent" && event.effect_id === branch.id)) continue;
    const observed = await input.transport.observe(plan, branch, input.objects);
    if (observed.state === "conflict") throw new PublicationScopeChanged("Current own refresh branch changed");
    if (observed.state === "unknown") throw Error("Current own refresh branch proof unavailable");
    if (observed.state === "absent") {
      if (journal.events.some(event => event.kind === "outcome" && event.effect_id === branch.id)) throw new PublicationScopeChanged("Current own refresh branch disappeared");
      continue;
    }
    if (observed.outcome.resource_id !== branch.payload.ref || observed.outcome.object !== branch.payload.head)
      throw new PublicationScopeChanged("Current own refresh observation changed");
    const before = result.original.inventory.filter(row => row.number === branch.payload.number), matches = current.filter(row => row.number === branch.payload.number);
    const updates = plan.manifest.effects.filter(effect => effect.kind === "pr-update" && effect.payload.number === branch.payload.number);
    if (before.length !== 1 || matches.length !== 1 || updates.length !== 1) throw new PublicationScopeChanged("Current own refresh inventory missing or duplicated");
    const original = before[0], proposal = matches[0], update = updates[0], projected = projectProposalBindings([proposal], null).inventory[0];
    const sourcePayload = update.payload.expected_payload as Record<string, unknown>;
    if (original.head_sha !== branch.payload.expected_head || proposal.head_sha !== branch.payload.head || "refs/heads/" + proposal.head_ref !== branch.payload.ref
      || typeof original.title !== "string" || !Array.isArray(original.labels) || typeof sourcePayload.body !== "string"
      || original.body_sha256 !== sha256(Buffer.from(sourcePayload.body))
      || !canonicalJSON({ title: original.title, body: sourcePayload.body, labels: original.labels, draft: original.draft }).equals(canonicalJSON(sourcePayload))
      || !canonicalJSON({ ...projected, head_sha: original.head_sha, body_sha256: original.body_sha256,
        title: original.title, labels: original.labels, draft: original.draft }).equals(canonicalJSON(original)))
      throw new PublicationScopeChanged("Current own refresh target changed outside its reviewed fields");
    const updateStarted = journal.events.some(event => event.kind === "intent" && event.effect_id === update.id);
    const actualPayload = { title: proposal.title, body: proposal.body, labels: proposal.labels, draft: proposal.draft };
    if (updateStarted) {
      const delivery = await input.transport.observe(plan, update, input.objects);
      if (delivery.state === "conflict") throw new PublicationScopeChanged("Current own refresh metadata changed");
      if (delivery.state === "unknown") throw Error("Current own refresh metadata proof unavailable");
      // Native observation resolves requested label aliases by ID. Bind its exact canonical resource payload too.
      const allowed = [...updateTransitions(update), { title: update.payload.title, body: update.payload.body,
        labels: [...(update.payload.labels as string[])].sort(), draft: update.payload.draft }];
      if (!allowed.some(fields => canonicalJSON({ ...fields, labels: [] }).equals(canonicalJSON({ ...actualPayload, labels: [] }))))
        throw new PublicationScopeChanged("Current own refresh metadata changed outside its approved attempt");
      if (delivery.payload_sha256 === undefined) throw Error("Current own refresh full payload proof unavailable");
      if (delivery.payload_sha256 !== sha256(canonicalJSON(actualPayload)))
        throw new PublicationScopeChanged("Current own refresh metadata differs from its fresh native observation");
      if (delivery.state === "done") {
        if (delivery.outcome.resource_id !== String(proposal.number) || delivery.outcome.object !== branch.payload.head)
          throw new PublicationScopeChanged("Current own refresh delivery observation changed");
        result.observations.push({ effect_id: update.id, resource_id: String(proposal.number), observation_sha256: delivery.outcome.observation_sha256 });
      } else if (journal.events.some(event => event.kind === "outcome" && event.effect_id === update.id)) throw new PublicationScopeChanged("Current own refresh metadata disappeared");
    } else if (!canonicalJSON(sourcePayload).equals(canonicalJSON(actualPayload))) {
      throw new PublicationScopeChanged("Current own refresh metadata changed outside its approved attempt");
    }
    result.own.push(projected);
    result.observations.push({ effect_id: branch.id, resource_id: String(branch.payload.ref), observation_sha256: observed.outcome.observation_sha256 });
  }
  const context = freezeJSON(result); ownedContexts.add(context);
  projectCurrentProposals(current, context.original.resolution_sha256, context);
  return context;
}

/** Normalize only exact freshly observed own publication against the reviewed original inventory. */
export function projectCurrentProposals(inventory: PullRequestInput[], resolutionSHA: string | null, context?: PublicationInventory): Projection {
  const current = projectProposalBindings(inventory, resolutionSHA);
  if (context === undefined) return current;
  if (!ownedContexts.has(context)) throw Error("Original native publication inventory context required");
  for (const own of context.own) {
    const matches = current.inventory.filter(item => item.number === own.number);
    if (matches.length !== 1 || !canonicalJSON(matches[0]).equals(canonicalJSON(own))) throw new PublicationScopeChanged("Fresh own publication inventory changed");
  }
  const normalized = { ...current, inventory: current.inventory.flatMap(item => context.own.some(own => own.number === item.number)
    ? context.original.inventory.filter(original => original.number === item.number) : [item]) };
  if (!canonicalJSON(normalized).equals(canonicalJSON(context.original))) throw new PublicationScopeChanged("Current proposal inventory changed outside proven own publication");
  return freezeJSON(normalized);
}
