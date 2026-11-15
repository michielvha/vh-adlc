import { sameLogin, publisherActor } from "./identity";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { publishArtifact, readArtifact, readJournal, type SealedPlan } from "./journal";
import { effectDigest, effectMarker, ref, type Effect } from "./manifests";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { externalArtifactDirectory } from "./snapshot";
import type { PublicationIdentity } from "./transport";
import { projectSuccess, readSuccess, type Facts, type SuccessEvidence } from "./success";
import { readRejection } from "./rejections";
import { hasInFlightAttempt } from "./attempts";
import { publicationMarker } from "./report-history";
import type { Settings } from "./settings";

export type BeforeData = {
  hostname: string;
  identity: PublicationIdentity;
  source: {
    id: number; number: number; state: "open" | "closed"; draft: boolean;
    head_sha: string; head_ref: string; head_repository_id: number | null;
    base_ref: string; base_repository_id: number;
    title_sha256: string; body_sha256: string | null; labels: number[]; payload_sha256: string;
  } | null;
  label_ids: number[] | null;
  original_label_ids: number[] | null;
  creation: { surface: "pulls" | "issues" | "comments"; inventory_sha256: string; marker_ids: number[] } | null;
  requests_sha256: string;
};
type Scope = { artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect; attempt_id: string };

/** A parent PR can have an explicitly null body. Missing fields remain incomplete. */
export function projectBeforeSource(value: unknown): NonNullable<BeforeData["source"]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("invalid baseline source object");
  const input = value as Record<string, unknown>;
  const projected = projectSuccess(Buffer.from("HTTP/2.0 200 OK\r\n\r\n" + JSON.stringify(input))), facts = projected?.facts;
  if (!facts || facts.state === null || typeof facts.draft !== "boolean" || facts.labels === null
    || typeof input.title !== "string" || !input.title || input.title.includes("\0")
    || !Object.hasOwn(input, "body") || input.body !== null && typeof input.body !== "string"
    || typeof input.body === "string" && facts.body_sha256 === null || !Array.isArray(input.labels)) throw Error("incomplete baseline source");
  const names = input.labels.map(value => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("invalid baseline label");
    const name = (value as Record<string, unknown>).name;
    if (typeof name !== "string" || !name || name.includes("\0")) throw Error("invalid baseline label name");
    return name;
  }).sort();
  if (new Set(names).size !== names.length || typeof facts.head_sha !== "string" || typeof facts.head_ref !== "string"
    || typeof facts.base_ref !== "string" || typeof facts.title_sha256 !== "string") throw Error("incomplete baseline source binding");
  ref("refs/heads/" + facts.head_ref); ref("refs/heads/" + facts.base_ref);
  return { id: positive(facts.id), number: positive(facts.number), state: facts.state, draft: facts.draft,
    head_sha: facts.head_sha, head_ref: facts.head_ref, head_repository_id: facts.head_repository_id,
    base_ref: facts.base_ref, base_repository_id: positive(facts.base_repository_id), title_sha256: facts.title_sha256,
    body_sha256: facts.body_sha256, labels: facts.labels,
    payload_sha256: sha256(canonicalJSON({ title: input.title, body: input.body, labels: names, draft: input.draft })) };
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw Error("invalid delivery baseline fields");
  return value as Record<string, unknown>;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw Error("invalid delivery baseline ID");
  return value;
}
function digest(value: unknown): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw Error("invalid delivery baseline digest");
}
function ids(value: unknown): void {
  if (!Array.isArray(value) || value.length > 1000) throw Error("invalid delivery baseline IDs");
  const values = value.map(positive);
  if (values.some((id, index) => index > 0 && id <= values[index - 1])) throw Error("unordered delivery baseline IDs");
}
function validateData(value: unknown, options: Scope): BeforeData {
  const data = object(value, ["hostname", "identity", "source", "label_ids", "original_label_ids", "creation", "requests_sha256"]);
  if (typeof data.hostname !== "string" || !/^[a-z0-9.-]+$/u.test(data.hostname)) throw Error("invalid delivery baseline host");
  const identity = object(data.identity, ["repository", "repository_id", "actor", "actor_id", "default_branch"]);
  if (identity.repository !== options.plan.manifest.repository || identity.repository_id !== options.plan.manifest.repository_id
    || typeof identity.actor !== "string" || !sameLogin(identity.actor, options.plan.manifest.actor) || identity.actor_id !== options.plan.manifest.actor_id
    || typeof identity.default_branch !== "string" || !identity.default_branch || /[\r\n\0]/u.test(identity.default_branch)) throw Error("delivery baseline identity changed");
  if (data.source !== null) {
    const source = object(data.source, ["id", "number", "state", "draft", "head_sha", "head_ref", "head_repository_id",
      "base_ref", "base_repository_id", "title_sha256", "body_sha256", "labels", "payload_sha256"]);
    for (const key of ["id", "number", "base_repository_id"]) positive(source[key]);
    if (source.head_repository_id !== null) positive(source.head_repository_id);
    if (source.base_repository_id !== options.plan.manifest.repository_id || source.state !== "open" && source.state !== "closed"
      || typeof source.draft !== "boolean" || typeof source.head_sha !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(source.head_sha)) throw Error("invalid delivery baseline source");
    for (const key of ["head_ref", "base_ref"]) {
      if (typeof source[key] !== "string") throw Error("invalid delivery baseline branch");
      ref("refs/heads/" + source[key]);
    }
    for (const key of ["title_sha256", "payload_sha256"]) digest(source[key]);
    if (source.body_sha256 !== null) digest(source.body_sha256);
    ids(source.labels);
  }
  for (const key of ["label_ids", "original_label_ids"]) if (data[key] !== null) ids(data[key]);
  if (data.creation !== null) {
    const creation = object(data.creation, ["surface", "inventory_sha256", "marker_ids"]);
    const expected = { "pr-create": "pulls", "issue-create": "issues", "comment-create": "comments" };
    if (creation.surface !== expected[options.effect.kind as keyof typeof expected]) throw Error("delivery baseline surface changed");
    digest(creation.inventory_sha256); ids(creation.marker_ids);
  }
  if (["pr-create", "issue-create", "comment-create"].includes(options.effect.kind) !== (data.creation !== null)
    || ["pr-update", "pr-close", "comment-create"].includes(options.effect.kind) !== (data.source !== null)) throw Error("delivery baseline kind changed");
  if (data.source !== null && (data.source as BeforeData["source"])?.number !== options.effect.payload.number) throw Error("delivery baseline target changed");
  digest(data.requests_sha256);
  return data as BeforeData;
}
function envelope(value: unknown, options: Scope): BeforeData {
  const input = object(value, ["schema_version", "kind", "transport", "context", "operation_id", "repository", "plan_sha256", "effect_sha256", "attempt_id", "data"]);
  const selected = options.plan.manifest.effects.find(effect => effect.id === options.effect.id);
  if (!selected || effectDigest([selected]) !== effectDigest([options.effect]) || input.schema_version !== 1
    || !["pr-create", "issue-create", "comment-create", "pr-update", "pr-close"].includes(options.effect.kind)
    || !["native", "collector"].includes(options.plan.transport) || !["production", "trial"].includes(options.plan.context)
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(options.attempt_id)
    || input.kind !== "docs-drift-delivery-before" || input.transport !== options.plan.transport || input.context !== options.plan.context
    || options.plan.transport === "collector" && options.plan.context !== "trial"
    || input.operation_id !== options.plan.manifest.operation_id || input.repository !== options.plan.manifest.repository
    || input.plan_sha256 !== sha256(canonicalJSON(options.plan)) || input.effect_sha256 !== effectDigest([options.effect])
    || input.attempt_id !== options.attempt_id) throw Error("delivery baseline scope changed");
  return validateData(input.data, options);
}

/** The selected executor records its actual reads before dispatching the mutation. */
export function retainBefore(options: Scope & { data: BeforeData }): SuccessEvidence {
  const value = { schema_version: 1, kind: "docs-drift-delivery-before", transport: options.plan.transport, context: options.plan.context,
    operation_id: options.plan.manifest.operation_id, repository: options.plan.manifest.repository,
    plan_sha256: sha256(canonicalJSON(options.plan)), effect_sha256: effectDigest([options.effect]), attempt_id: options.attempt_id, data: options.data };
  envelope(value, options);
  const bytes = canonicalJSON(value);
  if (bytes.byteLength > 65536) throw Error("oversized delivery baseline");
  const path = join(externalArtifactDirectory(options.artifact_root, options.source_repo), "before-" + randomUUID() + ".json");
  publishArtifact(path, bytes);
  return { path, sha256: sha256(bytes) };
}

export function readBefore(options: Scope & { evidence: SuccessEvidence }): BeforeData {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  if (dirname(options.evidence.path) !== root || realpathSync(options.evidence.path) !== options.evidence.path) throw Error("foreign delivery baseline");
  const bytes = readArtifact(options.evidence.path);
  if (bytes.byteLength > 65536 || sha256(bytes) !== options.evidence.sha256) throw Error("changed delivery baseline");
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(bytes)) throw Error("noncanonical delivery baseline");
  return envelope(value, options);
}

export type AppliedDelivery = {
  operation_id: string; run_id: string; effect_id: string; attempt_id: string;
  context: SealedPlan["context"]; transport: SealedPlan["transport"]; plan_sha256: string;
  resource_id: number; number: number | null; parent_number: number | null; head_sha: string | null;
  explanation_effect_id: string | null;
  before: SuccessEvidence; successes: SuccessEvidence[]; settlement_sha256: string; proof_sha256: string;
};
type Capture = { command_index: number; command_directory: string; hostname: string; endpoint: string;
  command: { baseline_sha256?: string }; facts: Facts };

/** Application evidence alone supplies no acknowledgement permission or lease ownership. */
export function readAppliedDelivery(options: {
  source_repo: string; journal_directory: string; effect_id: string; settings: Settings; transport?: "native" | "collector";
}): AppliedDelivery {
  const journal = readJournal(options.journal_directory, options.source_repo), plan = journal.plan;
  const effect = plan.manifest.effects.find(item => item.id === options.effect_id);
  if (!effect || !["pr-create", "issue-create", "comment-create", "pr-update", "pr-close"].includes(effect.kind)) throw Error("delivery-kind-ineligible");
  if (plan.transport !== (options.transport ?? "native")) throw Error("native-delivery-proof-required");
  if (plan.transport === "collector" && plan.context !== "trial") throw Error("collector-proof-requires-trial");
  if (journal.header.recovery_mode !== "original" || hasInFlightAttempt(journal, effect)) throw Error("original-delivery-executor-unsettled");
  if (options.settings.repository !== plan.manifest.repository || !sameLogin(publisherActor(options.settings, plan.manifest.publisher_entry), plan.manifest.actor)) throw Error("delivery-policy-scope-changed");
  const p = effect.payload;
  if (effect.kind !== "pr-close") {
    const body = String(p.body);
    if (body.split(publicationMarker(options.settings, plan.manifest.operation_id)).length !== 2
      || body.split(effectMarker(effect.id)).length !== 2 || (body.match(/<!-- vh-adlc-docs-drift\b/gu)?.length ?? 0) !== 1) throw Error("delivery-marker-unproved");
  }
  const attempts = journal.events.filter(event => event.kind === "attempt" && event.effect_id === effect.id);
  const settlement: string[] = [];
  let selected: { attempt_id: string; before: SuccessEvidence; successes: SuccessEvidence[]; captures: Capture[] } | undefined;
  for (const attempt of attempts) {
    if (!("attempt_id" in attempt.payload)) throw Error("delivery-attempt-unavailable");
    const attemptId = attempt.payload.attempt_id;
    const ending = journal.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === effect.id
      && "attempt_id" in event.payload && event.payload.attempt_id === attemptId && event.revision > attempt.revision);
    if (!ending || !("sent" in ending.payload) || !ending.payload.reaped) throw Error("delivery-request-unsettled");
    settlement.push(sha256(canonicalJSON(ending)));
    if (!ending.payload.sent) continue;
    const scope = { artifact_root: dirname(journal.directory), source_repo: journal.source_repo, plan, effect, attempt_id: attemptId };
    if (ending.payload.rejection) { readRejection({ ...scope, header: journal.header, evidence: ending.payload.rejection }); continue; }
    const execution = ending.payload.execution;
    if (ending.payload.capture_unverified || !execution || !execution.commands || execution.commands !== execution.successes.length) throw Error("delivery-command-settlement-unproved");
    const captures = execution.successes.map(evidence => {
      readSuccess({ ...scope, evidence });
      const bytes = readArtifact(evidence.path);
      if (sha256(bytes) !== evidence.sha256) throw Error("delivery-capture-changed");
      return JSON.parse(decodeUTF8(bytes)) as Capture;
    });
    if (captures.some((capture, index) => capture.command_index !== index)
      || new Set(captures.map(capture => capture.command_directory)).size !== captures.length) throw Error("delivery-command-sequence-unproved");
    if (execution.before) selected = { attempt_id: attemptId, before: execution.before, successes: execution.successes, captures };
    else throw Error("delivery-baseline-unavailable");
  }
  if (!selected) throw Error("delivery-application-unavailable");
  const scope = { artifact_root: dirname(journal.directory), source_repo: journal.source_repo, plan, effect, attempt_id: selected.attempt_id };
  const before = readBefore({ ...scope, evidence: selected.before });
  if (plan.transport === "collector" && selected.captures.some(capture => capture.command.baseline_sha256 !== selected.before.sha256)) throw Error("collector-baseline-link-changed");
  if (before.hostname !== options.settings.hostname || selected.captures.some(capture => capture.hostname !== before.hostname)) throw Error("delivery-host-changed");
  const expectedCount = plan.transport === "native" && ["pr-create", "pr-update"].includes(effect.kind) ? 2 : 1;
  if (selected.captures.length !== expectedCount) throw Error("delivery-components-unproved");
  const first = selected.captures[0].facts, last = selected.captures.at(-1)!.facts;
  const resourceId = positive(first.id), source = before.source;
  const sameIds = (actual: number[] | null, expected: number[] | null) => actual !== null && expected !== null && canonicalJSON(actual).equals(canonicalJSON(expected));
  if (before.creation && before.creation.marker_ids.length !== 0) throw Error("delivery-marker-predates-attempt");
  if (["pr-create", "issue-create", "pr-update"].includes(effect.kind)) {
    if (first.title_sha256 !== sha256(Buffer.from(String(p.title))) || first.body_sha256 !== sha256(Buffer.from(String(p.body)))
      || !sameIds(last.labels, before.label_ids)) throw Error("delivery-payload-incomplete");
  }
  if (["pr-create", "pr-update"].includes(effect.kind) && first.draft !== p.draft) throw Error("delivery-draft-unproved");
  if (effect.kind === "pr-create") {
    if (first.head_sha !== plan.manifest.bindings.candidate_commit || first.head_ref !== p.branch || first.base_ref !== p.base
      || p.base !== options.settings.publication.base || first.head_repository_id !== plan.manifest.repository_id
      || first.base_repository_id !== plan.manifest.repository_id || first.state !== "open" || first.merged !== false
      || plan.transport === "native" && selected.captures[1].endpoint !== `repos/${plan.manifest.repository}/issues/${positive(first.number)}/labels`) throw Error("delivery-created-PR-binding-unproved");
  }
  if (effect.kind === "issue-create" || effect.kind === "comment-create") {
    if ((p.prior_ids as number[]).includes(resourceId)) throw Error("delivery-resource-predates-attempt");
  }
  if (source) {
    if (source.number !== p.number || effect.kind !== "comment-create" && source.state !== "open") throw Error("delivery-source-unproved");
    if (effect.kind !== "comment-create" && (first.id !== source.id || first.number !== source.number
      || first.head_sha !== p.expected_head || first.head_sha !== source.head_sha || first.head_ref !== source.head_ref
      || first.base_ref !== source.base_ref || first.head_repository_id !== source.head_repository_id
      || first.base_repository_id !== source.base_repository_id || first.base_ref !== options.settings.publication.base)) throw Error("delivery-transition-target-unproved");
  }
  if (effect.kind === "comment-create" && (first.body_sha256 !== sha256(Buffer.from(String(p.body)))
    || first.parent_number !== p.number || first.parent_repository !== plan.manifest.repository)) throw Error("delivery-comment-application-unproved");
  if (effect.kind === "pr-update") {
    const original = p.expected_payload as { title: string; body: string; draft: boolean };
    if (!source || source.title_sha256 !== sha256(Buffer.from(original.title)) || source.body_sha256 !== sha256(Buffer.from(original.body))
      || source.draft !== original.draft || !sameIds(source.labels, before.original_label_ids)
      || plan.transport === "native" && original.draft !== p.draft || first.state !== "open" || first.merged !== false || first.head_repository_id !== plan.manifest.repository_id
      || p.expected_head !== plan.manifest.bindings.candidate_commit) throw Error("delivery-original-transition-unproved");
  }
  if (effect.kind === "pr-close" && (first.state !== "closed" || first.merged !== false)) throw Error("delivery-closure-unproved");
  let explanation_effect_id: string | null = null;
  if (effect.kind === "pr-close") {
    const earlier = plan.manifest.effects.slice(0, plan.manifest.effects.indexOf(effect));
    const explanations = earlier.filter(item => item.kind === "comment-create" && item.payload.number === p.number);
    const attempt = attempts.find(event => "attempt_id" in event.payload && event.payload.attempt_id === selected.attempt_id)!;
    if (explanations.length !== 1 || !journal.events.some(event => event.kind === "outcome" && event.effect_id === explanations[0].id
      && event.revision < attempt.revision && "object" in event.payload && event.payload.object === p.expected_head)) throw Error("delivery-explanation-unproved");
    explanation_effect_id = explanations[0].id;
  }
  const proof = { operation_id: plan.manifest.operation_id, run_id: journal.header.run_id, effect_id: effect.id, attempt_id: selected.attempt_id,
    context: plan.context, transport: plan.transport, plan_sha256: journal.header.plan_sha256,
    resource_id: resourceId, number: first.number, parent_number: first.parent_number,
    explanation_effect_id,
    head_sha: effect.kind === "comment-create" ? source!.head_sha : first.head_sha,
    before: selected.before, successes: selected.successes, settlement_sha256: sha256(canonicalJSON(settlement)) };
  return { ...proof, proof_sha256: sha256(canonicalJSON(proof)) };
}
