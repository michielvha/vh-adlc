import type { PullRequestInput, RepositoryReader } from "../github-read";
import type { ClosureTarget } from "./closure";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { readJournal } from "./journal";
import { effectDigest } from "./manifests";
import { exactRecord } from "./publication-decisions";
import { PublicationScopeChanged } from "./publish";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import type { PlanObjects, PublicationTransport } from "./transport";

type Reader = Pick<RepositoryReader, "pull" | "comments">;
export type ClosureInventory = {
  operation_id: string; original: ClosureTarget; closed: number[];
  comments: Array<{ number: number; id: number; body: string; actor: string; actor_id: number }>;
  observations: Array<{ effect_id: string; resource_id: string; observation_sha256: string }>;
};
const ownedContexts = new WeakSet<object>();
function changed(message: string): never { throw new PublicationScopeChanged(message); }
function same(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }

/** Every native collection accepting an own-effect context binds its entire requested scope. */
export function requireClosureInventoryScope(context: ClosureInventory, scope: {
  source_commit: string; operation_id: string | undefined; consolidation: unknown; repository: string; repository_id: number;
}): void {
  if (!ownedContexts.has(context)) throw Error("Original native closure inventory context required");
  const original = context.original.closure;
  if (scope.source_commit !== original.current_default || scope.operation_id !== context.operation_id
    || scope.consolidation !== original.consolidation?.number || scope.repository !== original.repository
    || scope.repository_id !== original.repository_id) changed("Original closure inventory scope changed");
}

/** Only an original journal and fresh native effect observation can normalize this batch's own changes. */
export async function captureClosureInventory(input: {
  source_repo: string; artifact_root: string; journal_directory: string; original: unknown;
  transport: Pick<PublicationTransport, "kind" | "observe">; objects: PlanObjects; reader: Reader;
}): Promise<ClosureInventory> {
  const journal = readJournal(input.journal_directory, input.source_repo), plan = journal.plan;
  if (input.transport.kind !== "native" || plan.transport !== "native") throw Error("Native closure inventory required");
  let bytes: Buffer;
  try { bytes = readBoundArtifact({ ...input, reference: input.original }); }
  catch (error) { if (error instanceof ArtifactChanged) changed(error.message); throw error; }
  if (sha256(bytes) !== plan.manifest.bindings.assessment_sha256) changed("Original closure target binding changed");
  const parsed = exactRecord(JSON.parse(decodeUTF8(bytes)), ["source_commit", "identity", "target"], "Original closure target fields changed");
  if (!canonicalJSON(parsed).equals(bytes) || parsed.source_commit !== plan.manifest.bindings.source_commit) throw Error("Canonical original closure source required");
  const identity = exactRecord(parsed.identity, ["repository", "repository_id", "actor", "actor_id", "default_branch"], "Original closure identity fields changed");
  if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id
    || identity.actor !== plan.manifest.actor || identity.actor_id !== plan.manifest.actor_id) changed("Original closure identity changed");
  const target = exactRecord(parsed.target, ["kind", "authority", "verification_ready", "complete", "diagnostics", "effects", "already_closed", "closure", "verification_scopes", "inputs_sha256"], "Original closure model target fields changed");
  if (target.kind !== "docs-drift-closure-target" || target.authority !== "none" || target.verification_ready !== false || target.complete !== true
    || !same(target.diagnostics, []) || !Array.isArray(target.effects) || !same(target.effects, plan.manifest.effects)
    || effectDigest(target.effects) !== effectDigest(plan.manifest.effects)) throw Error("Original complete exact closure target required");
  const closure = exactRecord(target.closure, ["complete", "diagnostics", "repository", "repository_id", "current_default", "consolidation", "record", "originals", "inputs_sha256", "interval"], "Original closure input fields changed");
  if (closure.complete !== true || !same(closure.diagnostics, []) || closure.current_default !== plan.manifest.bindings.source_commit
    || closure.repository !== plan.manifest.repository || closure.repository_id !== plan.manifest.repository_id
    || canonicalDigest(closure) !== plan.manifest.bindings.proposals_sha256 || !Array.isArray(closure.originals)
    || plan.manifest.effects.some(effect => !["lease-acquire", "receipt-retain", "comment-create", "pr-close", "lease-release"].includes(effect.kind)))
    throw Error("Original closure inputs and effect scope required");
  // The immutable bytes are bound to the exact reviewed technical assessment and original manifest.
  const result: ClosureInventory = { operation_id: plan.manifest.operation_id, original: parsed.target as ClosureTarget, closed: [], comments: [], observations: [] };
  for (const effect of plan.manifest.effects) {
    if (!["comment-create", "pr-close"].includes(effect.kind) || !journal.events.some(event => event.kind === "intent" && event.effect_id === effect.id)) continue;
    const observed = await input.transport.observe(plan, effect, input.objects);
    if (observed.state === "conflict") changed("Current own closure effect changed");
    if (observed.state === "unknown") throw Error("Current own closure effect proof unavailable");
    if (observed.state === "absent") {
      if (journal.events.some(event => event.kind === "outcome" && event.effect_id === effect.id)) changed("Current own closure effect disappeared");
      continue;
    }
    const id = observed.outcome.resource_id, number = effect.payload.number;
    if (typeof number !== "number" || typeof id !== "string" || !/^[1-9][0-9]*$/u.test(id)) throw Error("Current own closure resource identity unavailable");
    const original = result.original.closure.originals.find(item => item.number === number);
    if (!original || observed.outcome.object !== original.head_sha) changed("Current own closure head binding changed");
    if (effect.kind === "comment-create") {
      const comments = input.reader.comments(number);
      if (!comments.complete || comments.diagnostics.length) throw Error("Complete current closure comment inventory required");
      const matches = comments.items.filter(item => String(item.id) === id);
      const comment = matches[0];
      if (matches.length !== 1 || typeof comment.body !== "string" || comment.body !== effect.payload.body || comment.actor !== plan.manifest.actor
        || comment.actor_id !== plan.manifest.actor_id) changed("Current own closure explanation changed");
      result.comments.push({ number, id: comment.id, body: comment.body, actor: comment.actor, actor_id: comment.actor_id });
    } else {
      const current = input.reader.pull(number);
      if (id !== String(number) || current.state !== "closed" || current.merged_at !== null
        || !same({ ...current, state: original.state }, original)) changed("Current own closed proposal changed outside its exact effect");
      result.closed.push(number);
    }
    result.observations.push({ effect_id: effect.id, resource_id: id, observation_sha256: observed.outcome.observation_sha256 });
  }
  const context = freezeJSON(result); ownedContexts.add(context);
  const reader = projectClosureReader(input.reader, context);
  for (const original of context.original.closure.originals) {
    reader.pull(original.number);
    if (context.original.effects.some(effect => effect.kind === "comment-create" && effect.payload.number === original.number)) reader.comments(original.number);
  }
  return context;
}

/** Preserve real native state and normalize only freshly proven exact effects of this original journal. */
export function projectClosureReader<T extends Reader>(reader: T, context?: ClosureInventory) {
  if (context === undefined) return reader;
  if (!ownedContexts.has(context)) throw Error("Original native closure inventory context required");
  return { ...reader,
    pull(number: number): PullRequestInput {
      const current = reader.pull(number), original = context.original.closure.originals.find(item => item.number === number);
      if (!original) return current;
      const normalized = context.closed.includes(number) ? { ...current, state: original.state } : current;
      if (context.closed.includes(number) && (current.state !== "closed" || current.merged_at !== null)
        || !same(normalized, original)) changed("Current closure proposal changed outside proven own effects");
      return structuredClone(original);
    },
    comments(number: number): ReturnType<Reader["comments"]> {
      const current = reader.comments(number);
      if (!current.complete || current.diagnostics.length) throw Error("Complete current closure comment inventory required");
      const baseline = context.original.effects.find(effect => effect.kind === "comment-create" && effect.payload.number === number);
      if (!baseline) return current;
      const own = context.comments.filter(comment => comment.number === number);
      for (const comment of own) {
        const matches = current.items.filter(item => item.id === comment.id);
        const { number: _number, ...expected } = comment;
        if (matches.length !== 1 || !same(matches[0], expected)) changed("Fresh own closure explanation changed");
      }
      const items = current.items.filter(item => !own.some(comment => comment.id === item.id));
      if (!same(items.map(item => item.id).sort((left, right) => left - right), baseline.payload.prior_ids))
        changed("Current closure comment inventory changed outside proven own effects");
      return { ...current, items };
    },
  };
}
