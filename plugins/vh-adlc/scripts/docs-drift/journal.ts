import type { PublisherEntry } from "./identity";
import type { ExecutionEvidence } from "./success";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { authorizeEffects, effectDigest, manifestDigest, modelMatches, parseActionManifest, requireReviewedManifest, workerInputDigest } from "./manifests";
import type { ActionManifest, EffectGrant, ReviewedManifest, RolePolicy } from "./manifests";
import { canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import { deliveryDigest, correctionProjection, type AttentionProjection, type CorrectionInput } from "./report";
import { parseComponentBinding, parseIdentitySource } from "./settings";
import type { InstalledComponentBinding } from "./bootstrap";
import { externalArtifactDirectory, type OwnedObjectStore } from "./snapshot";
import { requireOwnedStore } from "./proposals";
import { writeMetadataObject } from "./git";

type RoleBinding = Omit<ReviewedManifest["worker"], "records">;
type LegacyPolicyBinding = { adoption_sha256: string };
type CurrentPolicyBinding = { schema_version: 2; policy_sha256: string; component: InstalledComponentBinding };
export type PolicyBinding = LegacyPolicyBinding | CurrentPolicyBinding;
type PlanContents = {
  manifest: ActionManifest; manifest_sha256: string; approval_sha256: string; context: "production" | "trial"; transport: "native" | "collector";
  publication_kind: "advisory" | "resolve"; review_verdict: "clean"; roles: { worker: RoleBinding; reviewer: RoleBinding };
  corrections: CorrectionInput[]; attention: AttentionProjection[]; candidate_verification_sha256?: string;
};
export type LegacySealedPlan = PlanContents & LegacyPolicyBinding & { schema_version: 1 };
export type CurrentSealedPlan = PlanContents & CurrentPolicyBinding;
export type SealedPlan = LegacySealedPlan | CurrentSealedPlan;
export type PlanPolicy = PolicyBinding & {
  context: SealedPlan["context"]; transport: SealedPlan["transport"]; publication_kind: SealedPlan["publication_kind"]; pr_draft: boolean;
  worker: RolePolicy; reviewer: RolePolicy; publisher_entry?: PublisherEntry;
};

/** Preserve each format's own policy semantics without rewriting original retained bytes. */
export function policyBinding(value: PolicyBinding): PolicyBinding {
  return "policy_sha256" in value
    ? { schema_version: 2, policy_sha256: value.policy_sha256, component: structuredClone(value.component) }
    : { adoption_sha256: value.adoption_sha256 };
}
export function policyDigest(value: PolicyBinding): string {
  return "policy_sha256" in value ? value.policy_sha256 : value.adoption_sha256;
}
export type Outcome = { state: "observed"; observation_sha256: string; resource_id: string | null; object: string | null; lookup?: { path: string; sha256: string } };
export type Retirement = { scope_sha256: string; request_sha256: string; lookup: { path: string; sha256: string }; never_dispatched?: true; unapplied?: true };
export type ReconciliationGrant = Pick<Retirement, "scope_sha256" | "request_sha256"> & { kind?: "owner-delivery-acknowledgement" };
export type DeliveryAcknowledgement = ReconciliationGrant & {
  kind: "owner-delivery-acknowledgement"; lookup: { path: string; sha256: string };
  application_sha256: string; settlement_sha256: string;
};
type Attempt = { attempt_id: string; reconciliation?: ReconciliationGrant; atomic_receipt_id?: string };
type Intent = { effect_sha256: string; atomic_acquisition?: string };
type AttemptEnd = { attempt_id: string; sent: boolean; reaped: boolean; rejection?: { path: string; sha256: string }; execution?: ExecutionEvidence; capture_unverified?: true };
type Event = {
  schema_version: 1; revision: number; previous_sha256: string; kind: "intent" | "outcome" | "handoff" | "retired-absence" | "acknowledged-delivery" | "invalidation" | "attempt" | "attempt-ended" | "recovery-only";
  effect_id: string; payload: Intent | Outcome | { reason: string } | Retirement | DeliveryAcknowledgement | Attempt | AttemptEnd;
};
type Header = {
  schema_version: 1; kind: "docs-drift-journal"; operation_id: string; repository: string;
  source_repo: string; directory: string; plan_sha256: string; owner_uid: number; run_id: string; observed_lease_object: string | null; recovery_mode: "original" | "observation-only"; observed_receipt_object?: string | null;
};
export type Journal = {
  directory: string; source_repo: string; header: Header; plan: SealedPlan;
  events: Event[]; revision: number; digest: string;
};

function fail(reason: string): never { throw Error(`docs-drift journal ${reason}`); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid object");
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) fail("invalid fields");
  return input;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail("invalid digest");
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(value)) fail("invalid identifier");
  return value;
}
function parseCanonical(bytes: Uint8Array): unknown {
  let value: unknown;
  try { value = JSON.parse(decodeUTF8(bytes)); } catch { fail("invalid JSON"); }
  if (!canonicalJSON(value).equals(Buffer.from(bytes))) fail("noncanonical JSON");
  return value;
}
function roleBinding(value: unknown): RoleBinding {
  const input = exact(value, ["invocation_id", "context_id", "provider", "model", "requested_model", "identity_source", "isolation", "target_sha256", "native_sha256", "returned_sha256"]);
  identifier(input.invocation_id); identifier(input.context_id);
  hash(input.target_sha256); hash(input.native_sha256); hash(input.returned_sha256);
  if (typeof input.model !== "string" || !/[0-9]/u.test(input.model) || typeof input.requested_model !== "string"
    || !modelMatches(input.requested_model, input.model) || !["structural", "procedural", "unknown"].includes(String(input.isolation))) fail("role identity");
  if (typeof input.provider !== "string" || parseIdentitySource(input.identity_source, input.provider) === null) fail("native identity source");
  return input as RoleBinding;
}
function parsePlan(value: unknown): SealedPlan {
  const hasProof = value !== null && typeof value === "object" && Object.hasOwn(value, "candidate_verification_sha256");
  const version = value !== null && typeof value === "object" ? Reflect.get(value, "schema_version") : undefined;
  const input = exact(value, ["schema_version", "manifest", "manifest_sha256", ...(version === 2 ? ["approval_sha256", "policy_sha256", "component"] : ["approval_sha256", "adoption_sha256"]),
    "context", "transport", "publication_kind", "review_verdict", "roles", "corrections", "attention", ...(hasProof ? ["candidate_verification_sha256"] : [])]);
  const proof = hasProof ? hash(input.candidate_verification_sha256) : undefined;
  if ((input.schema_version !== 1 && input.schema_version !== 2) || input.review_verdict !== "clean" || !["production", "trial"].includes(String(input.context))
    || !["native", "collector"].includes(String(input.transport)) || (input.context === "production" && input.transport !== "native")) fail("plan context or verdict");
  if (input.publication_kind !== "advisory" && input.publication_kind !== "resolve") fail("publication kind");
  if (input.schema_version === 2) {
    hash(input.approval_sha256); hash(input.policy_sha256); parseComponentBinding(input.component);
  } else { hash(input.approval_sha256); hash(input.adoption_sha256); }
  const manifest = parseActionManifest(input.manifest);
  if (input.schema_version === 2 && manifest.effects.some(effect => effect.kind === "receipt-retire"))
    fail("receipt-retire is unsupported in version-two operations");
  if (manifestDigest(manifest) !== hash(input.manifest_sha256)) fail("plan manifest digest");
  const roles = exact(input.roles, ["worker", "reviewer"]);
  const worker = roleBinding(roles.worker), reviewer = roleBinding(roles.reviewer);
  if (worker.target_sha256 !== workerInputDigest(manifest.bindings) || reviewer.target_sha256 !== input.manifest_sha256
    || worker.invocation_id === reviewer.invocation_id || worker.context_id === reviewer.context_id) fail("review target or independence");
  const recordedWorker = { invocation_id: worker.invocation_id, context_id: worker.context_id, native_sha256: worker.native_sha256, returned_sha256: worker.returned_sha256 };
  if (!canonicalJSON(recordedWorker).equals(canonicalJSON(manifest.worker))) fail("worker receipt");
  if (!Array.isArray(input.corrections) || !Array.isArray(input.attention)) fail("plan item bindings");
  const identities = new Set<string>();
  for (const item of input.corrections) {
    exact(item, ["repository", "scope_sha256", "identity", "path", "patch_sha256", "postimage_sha256", "verification_sha256", "inputs_sha256"]);
    const correction = item as CorrectionInput;
    const identity = correctionProjection(correction);
    if (correction.repository !== manifest.repository || correction.scope_sha256 !== manifest.bindings.scope_sha256 || identities.has(identity)) fail("correction scope");
    identities.add(identity);
  }
  const attentionIds = new Set<string>();
  for (const item of input.attention) {
    const attention = exact(item, ["version", "sha256", "binding"]);
    if (attention.version !== 1 || hash(attention.sha256) !== sha256(canonicalJSON(attention.binding)) || attentionIds.has(String(attention.sha256))) fail("attention digest");
    if (attention.binding === null || typeof attention.binding !== "object" || Array.isArray(attention.binding)) fail("attention binding");
    const binding = attention.binding as Record<string, unknown>;
    if (binding.repository !== manifest.repository || binding.scope_sha256 !== manifest.bindings.scope_sha256) fail("attention scope");
    attentionIds.add(String(attention.sha256));
  }
  if (manifest.bindings.delivery_sha256 !== deliveryDigest(input.corrections as CorrectionInput[], input.attention as AttentionProjection[], proof)) fail("changed reviewed delivery bindings");
  return freezeJSON(JSON.parse(canonicalJSON(input).toString()) as SealedPlan);
}

/** Native records stay external. Only their exact reviewed digests and provenance enter the plan. */
type SealOptions = {
  reviewed: ReviewedManifest; grants: EffectGrant[];
  context: SealedPlan["context"]; transport: SealedPlan["transport"]; publication_kind: SealedPlan["publication_kind"];
  corrections: CorrectionInput[]; attention: AttentionProjection[]; candidate_verification_sha256?: string;
};
export function sealPlan(options: SealOptions & LegacyPolicyBinding): LegacySealedPlan;
export function sealPlan(options: SealOptions & CurrentPolicyBinding): CurrentSealedPlan;
export function sealPlan(options: SealOptions & PolicyBinding): SealedPlan;
export function sealPlan(options: SealOptions & PolicyBinding): SealedPlan {
  requireReviewedManifest(options.reviewed);
  const { manifest, manifest_sha256, worker, reviewer } = options.reviewed;
  authorizeEffects(manifest, options.grants);
  const { records: workerRecords, ...workerBinding } = worker;
  const { records: reviewerRecords, ...reviewerBinding } = reviewer;
  return parsePlan({
    ...("policy_sha256" in options
      ? { schema_version: 2, approval_sha256: sha256(canonicalJSON(options.grants)), policy_sha256: options.policy_sha256, component: options.component }
      : { schema_version: 1, approval_sha256: sha256(canonicalJSON(options.grants)), adoption_sha256: options.adoption_sha256 }),
    manifest, manifest_sha256, context: options.context, transport: options.transport,
    publication_kind: options.publication_kind, review_verdict: "clean", roles: { worker: workerBinding, reviewer: reviewerBinding },
    corrections: options.corrections, attention: options.attention,
    ...(options.candidate_verification_sha256 === undefined ? {} : { candidate_verification_sha256: options.candidate_verification_sha256 }),
  });
}

/** Structural read for retained diagnostics only. Current policy and grants separately gate every replay. */
export function readRetainedPlan(bytes: Uint8Array): SealedPlan {
  return parsePlan(parseCanonical(bytes));
}

/** The native adopter supplies current policy. A plan cannot authorize its own historical evidence. */
export function readVerifiedPlan(bytes: Uint8Array, verifyPolicy: (plan: SealedPlan) => PlanPolicy | null): SealedPlan {
  const plan = readRetainedPlan(bytes);
  const policy = verifyPolicy(structuredClone(plan));
  if (policy === null || !canonicalJSON(policyBinding(policy)).equals(canonicalJSON(policyBinding(plan))) || policy.context !== plan.context || policy.transport !== plan.transport || policy.publication_kind !== plan.publication_kind) fail("current policy unavailable or changed");
  if (policy.publisher_entry !== plan.manifest.publisher_entry) fail("current publisher entry changed");
  if (typeof policy.pr_draft !== "boolean") fail("missing draft policy");
  for (const effect of plan.manifest.effects) {
    if (["pr-create", "pr-update"].includes(effect.kind) && effect.payload.draft !== policy.pr_draft) fail("current draft policy");
  }
  for (const name of ["worker", "reviewer"] as const) {
    const role = plan.roles[name], expected = policy[name];
    if (role.model !== expected.adopted_model || role.requested_model !== expected.requested_model || !modelMatches(expected.requested_model, role.model)
      || !canonicalJSON(role.identity_source).equals(canonicalJSON(expected.identity_source))) fail("current role policy");
  }
  return plan;
}

export function syncDirectory(directory: string): void {
  const fd = openSync(directory, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function publishArtifact(path: string, bytes: Uint8Array): void {
  const temporary = join(dirname(path), ".tmp-" + randomUUID());
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  try { linkSync(temporary, path); syncDirectory(dirname(path)); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") fail("revision conflict");
    throw error;
  } finally { unlinkSync(temporary); }
}
function privateDirectory(directory: string): void {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory || (stat.mode & 0o077) !== 0
    || (process.getuid && stat.uid !== process.getuid())) fail("unsafe private directory");
}
export function readArtifact(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) fail("unsafe private file");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
export function numberedRecordFiles(directory: string): string[] {
  privateDirectory(directory);
  const files = readdirSync(directory).sort();
  for (const file of files) {
    if (/^\.tmp-[a-f0-9-]{36}$/u.test(file)) {
      try { readArtifact(join(directory, file)); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      continue;
    }
    if (!/^\d{10}\.json$/u.test(file)) fail("unexpected event file");
  }
  return files.filter(file => !file.startsWith(".tmp-"));
}
function outcome(value: unknown, artifactRoot: string): Outcome {
  const supported = value !== null && typeof value === "object" && Object.hasOwn(value, "lookup");
  const receipt = exact(value, ["state", "observation_sha256", "resource_id", "object", ...(supported ? ["lookup"] : [])]);
  if (supported) {
    const lookup = exact(receipt.lookup, ["path", "sha256"]);
    if (hash(lookup.sha256) !== receipt.observation_sha256 || typeof lookup.path !== "string" || !lookup.path.startsWith("/")
      || lookup.path.includes("\0") || resolve(lookup.path) !== lookup.path || dirname(lookup.path) !== artifactRoot) fail("invalid outcome lookup");
  }
  if (receipt.state !== "observed") fail("outcome state");
  hash(receipt.observation_sha256);
  if (receipt.resource_id !== null && (typeof receipt.resource_id !== "string" || receipt.resource_id.length === 0 || /[\u0000-\u0020\u007f]/u.test(receipt.resource_id))) fail("outcome resource");
  if (receipt.object !== null && (typeof receipt.object !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(receipt.object))) fail("outcome object");
  return receipt as Outcome;
}
function attemptEnding(events: Event[], attempt: Event): Event | undefined {
  if (!("attempt_id" in attempt.payload)) return undefined;
  const id = attempt.payload.attempt_id;
  return events.findLast(event => event.kind === "attempt-ended" && event.effect_id === attempt.effect_id
    && "attempt_id" in event.payload && event.payload.attempt_id === id && event.revision > attempt.revision);
}
function attemptsUnapplied(events: Event[], effectId: string): boolean {
  const attempts = events.filter(event => event.kind === "attempt" && (event.effect_id === effectId
    || "atomic_receipt_id" in event.payload && event.payload.atomic_receipt_id === effectId));
  return attempts.every(attempt => {
    const ended = attemptEnding(events, attempt);
    return ended !== undefined && "sent" in ended.payload && ended.payload.reaped
      && (!ended.payload.sent || "rejection" in ended.payload);
  });
}
function validateEvent(event: Event, plan: SealedPlan, previous: Event[], header: Header): void {
  const effect = plan.manifest.effects.find(effect => effect.id === event.effect_id);
  if (!effect) fail("unknown effect");
  const prior = previous.filter(item => item.effect_id === event.effect_id);
  if (event.kind === "intent") {
    const paired = Object.hasOwn(event.payload, "atomic_acquisition");
    const payload = exact(event.payload, paired ? ["effect_sha256", "atomic_acquisition"] : ["effect_sha256"]);
    const acquisition = plan.manifest.effects[0];
    if (paired && (effect !== plan.manifest.effects[1] || effect.kind !== "receipt-retain" || acquisition.kind !== "lease-acquire"
      || payload.atomic_acquisition !== acquisition.id || !previous.some(item => item.kind === "intent" && item.effect_id === acquisition.id))) fail("invalid paired metadata intent");
    if (payload.effect_sha256 !== effectDigest([effect]) || prior.length !== 0) fail("changed or repeated intent");
    for (const earlier of plan.manifest.effects.slice(0, plan.manifest.effects.indexOf(effect))) {
      if (!(paired && earlier === acquisition) && !previous.some(item => item.effect_id === earlier.id
        && ["outcome", "retired-absence", "acknowledged-delivery"].includes(item.kind))) fail("effect order has pending earlier effect");
    }
  } else {
    if (!prior.some(item => item.kind === "intent")) fail("outcome or handoff without intent");
    if (["outcome", "retired-absence"].includes(event.kind) && prior.some(item => ["outcome", "retired-absence", "acknowledged-delivery"].includes(item.kind))) fail("effect already terminal");
    if (event.kind === "attempt") {
      const scoped = Object.hasOwn(event.payload, "reconciliation");
      const paired = Object.hasOwn(event.payload, "atomic_receipt_id");
      const payload = exact(event.payload, ["attempt_id", ...(scoped ? ["reconciliation"] : []), ...(paired ? ["atomic_receipt_id"] : [])]);
      if (!scoped && header.recovery_mode === "observation-only") fail("read-only journal cannot dispatch");
      if (paired) {
        const receipt = plan.manifest.effects[1];
        if (scoped || effect !== plan.manifest.effects[0] || effect.kind !== "lease-acquire" || receipt?.kind !== "receipt-retain"
          || payload.atomic_receipt_id !== receipt.id || !previous.some(item => item.kind === "intent" && item.effect_id === receipt.id
            && "atomic_acquisition" in item.payload && item.payload.atomic_acquisition === effect.id)) fail("invalid atomic metadata attempt");
      }
      identifier(payload.attempt_id);
      let acknowledgementAuthority = false;
      if (scoped) {
        if (payload.reconciliation === null || typeof payload.reconciliation !== "object") fail("invalid cleanup authority");
        const tagged = Object.hasOwn(payload.reconciliation, "kind");
        const grant = exact(payload.reconciliation, ["scope_sha256", "request_sha256", ...(tagged ? ["kind"] : [])]);
        if (tagged && grant.kind !== "owner-delivery-acknowledgement") fail("invalid acknowledgement authority");
        acknowledgementAuthority = tagged;
        hash(grant.scope_sha256); hash(grant.request_sha256);
        if (effect.kind !== "receipt-retain" && effect.kind !== "lease-release") fail("cleanup cannot replay business effects");
      }
      if (previous.some(item => item.kind === "acknowledged-delivery") && !acknowledgementAuthority) fail("acknowledgement cleanup authority required");
      const latest = prior.findLast(item => item.kind === "attempt");
      if (prior.some(item => ["outcome", "retired-absence", "acknowledged-delivery"].includes(item.kind))
        || (!scoped && effect.kind !== "lease-release" && previous.some(item => item.kind === "invalidation" || item.kind === "recovery-only"))
        || (latest && !prior.some(item => item.kind === "attempt-ended" && item.revision > latest.revision))) fail("attempt already pending or operation terminal");
      if (prior.some(item => item.kind === "attempt" && (item.payload as { attempt_id: string }).attempt_id === (event.payload as { attempt_id: string }).attempt_id)) fail("repeated attempt identity");
    }
    else if (event.kind === "attempt-ended") {
      const rejected = Object.hasOwn(event.payload, "rejection");
      const executed = Object.hasOwn(event.payload, "execution");
      const unverified = Object.hasOwn(event.payload, "capture_unverified");
      const payload = exact(event.payload, ["attempt_id", "sent", "reaped", ...(rejected ? ["rejection"] : []), ...(executed ? ["execution"] : []), ...(unverified ? ["capture_unverified"] : [])]);
      if (rejected) {
        const evidence = exact(payload.rejection, ["path", "sha256"]);
        hash(evidence.sha256);
        if (payload.sent !== true || payload.reaped !== true || typeof evidence.path !== "string"
          || !evidence.path.startsWith("/") || evidence.path.includes("\0")) fail("invalid rejection evidence");
      }
      if (unverified && (payload.capture_unverified !== true || rejected || payload.sent !== true)) fail("invalid unverified capture");
      if (executed && rejected) fail("contradictory execution and rejection");
      if (executed) {
        if (payload.execution === null || typeof payload.execution !== "object" || Array.isArray(payload.execution)) fail("invalid execution metadata");
        const hasBefore = Object.hasOwn(payload.execution, "before"), hasCommands = Object.hasOwn(payload.execution, "commands");
        const execution = exact(payload.execution, ["successes", ...(hasBefore ? ["before"] : []), ...(hasCommands ? ["commands"] : [])]);
        if (!Array.isArray(execution.successes) || execution.successes.length > 16 || payload.sent !== true) fail("invalid success references");
        if (hasCommands && (typeof execution.commands !== "number" || !Number.isSafeInteger(execution.commands)
          || execution.commands < execution.successes.length || execution.commands > 16)) fail("invalid execution command count");
        const paths = new Set<string>();
        for (const item of [...execution.successes, ...(hasBefore ? [execution.before] : [])]) {
          const evidence = exact(item, ["path", "sha256"]);
          hash(evidence.sha256);
          if (typeof evidence.path !== "string" || !evidence.path.startsWith("/") || evidence.path.includes("\0") || resolve(evidence.path) !== evidence.path || dirname(evidence.path) !== dirname(header.directory) || paths.has(evidence.path)) fail("invalid success reference");
          paths.add(evidence.path);
        }
      }
      identifier(payload.attempt_id);
      const attempt = prior.findLast(item => item.kind === "attempt");
      if (!attempt || (attempt.payload as { attempt_id: string }).attempt_id !== payload.attempt_id
        || prior.some(item => item.kind === "attempt-ended" && item.revision > attempt.revision)
        || typeof payload.sent !== "boolean" || typeof payload.reaped !== "boolean") fail("invalid attempt ending");
    }
    else if (event.kind === "outcome") outcome(event.payload, dirname(header.directory));
    else if (event.kind === "acknowledged-delivery") {
      const payload = exact(event.payload, ["kind", "scope_sha256", "request_sha256", "lookup", "application_sha256", "settlement_sha256"]);
      if (payload.kind !== "owner-delivery-acknowledgement" || header.recovery_mode !== "original"
        || !["pr-create", "issue-create", "comment-create", "pr-update", "pr-close"].includes(effect.kind)
        || !prior.some(item => item.kind === "attempt") || prior.some(item => ["outcome", "retired-absence", "acknowledged-delivery"].includes(item.kind))
        || attemptsUnapplied(previous, effect.id)
        || previous.some(item => item.kind === "recovery-only")) fail("invalid delivery acknowledgement");
      for (const attempt of previous.filter(item => item.kind === "attempt")) {
        const ended = attemptEnding(previous, attempt);
        if (!ended || !("sent" in ended.payload) || ended.payload.reaped !== true) fail("acknowledgement executor unsettled");
      }
      for (const key of ["scope_sha256", "request_sha256", "application_sha256", "settlement_sha256"]) hash(payload[key]);
      const lookup = exact(payload.lookup, ["path", "sha256"]);
      hash(lookup.sha256);
      if (typeof lookup.path !== "string" || resolve(lookup.path) !== lookup.path || lookup.path.includes("\0")
        || dirname(lookup.path) !== dirname(header.directory)) fail("invalid acknowledgement lookup");
    }
    else if (event.kind === "retired-absence") {
      const undispatched = Object.hasOwn(event.payload, "never_dispatched"), unapplied = Object.hasOwn(event.payload, "unapplied");
      if (undispatched && unapplied) fail("contradictory retirement proof");
      const payload = exact(event.payload, ["scope_sha256", "request_sha256", "lookup", ...(undispatched ? ["never_dispatched"] : []), ...(unapplied ? ["unapplied"] : [])]);
      if (unapplied && (payload.unapplied !== true || header.recovery_mode !== "original"
        || ["lease-acquire", "receipt-retain", "lease-release"].includes(effect.kind)
        || previous.some(item => item.kind === "recovery-only") || !attemptsUnapplied(previous, effect.id))) fail("unproven unapplied retirement");
      if (undispatched && (payload.never_dispatched !== true || header.recovery_mode !== "original"
        || ["lease-acquire", "receipt-retain", "lease-release"].includes(effect.kind)
        || previous.some(item => item.kind === "recovery-only" || item.kind === "attempt" && (item.effect_id === effect.id
          || "atomic_receipt_id" in item.payload && item.payload.atomic_receipt_id === effect.id)))) fail("unproven never-dispatched retirement");
      hash(payload.scope_sha256); hash(payload.request_sha256);
      const lookup = exact(payload.lookup, ["path", "sha256"]);
      hash(lookup.sha256);
      if (typeof lookup.path !== "string" || !lookup.path.startsWith("/") || lookup.path.includes("\0")) fail("retirement lookup path");
    }
    else if (event.kind === "handoff" || event.kind === "invalidation" || event.kind === "recovery-only") identifier(exact(event.payload, ["reason"]).reason);
    else fail("unknown event kind");
  }
}

export function createJournal(options: { source_repo: string; artifact_root: string; plan: SealedPlan; recovery_mode?: "observation-only"; observed_lease_object?: string | null; observed_receipt_object?: string | null }): Journal {
  const source = realpathSync(options.source_repo);
  const root = externalArtifactDirectory(options.artifact_root, source);
  const plan = parsePlan(options.plan), planBytes = canonicalJSON(plan);
  const directory = join(root, "docs-drift-" + plan.manifest.operation_id);
  const owner = process.getuid?.();
  if (owner === undefined) fail("POSIX owner identity required");
  if (options.observed_lease_object !== undefined && options.observed_lease_object !== null
    && (options.recovery_mode !== "observation-only" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.observed_lease_object))) fail("invalid observed recovery lease");
  if (options.observed_receipt_object !== undefined && options.observed_receipt_object !== null
    && (options.recovery_mode !== "observation-only" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.observed_receipt_object))) fail("invalid observed recovery receipt");
  const header: Header = { observed_receipt_object: options.observed_receipt_object ?? null, observed_lease_object: options.observed_lease_object ?? null, recovery_mode: options.recovery_mode ?? "original", owner_uid: owner, run_id: randomUUID(), schema_version: 1, kind: "docs-drift-journal", operation_id: plan.manifest.operation_id,
    repository: plan.manifest.repository, source_repo: source, directory, plan_sha256: sha256(planBytes) };
  // The resource record precedes directory creation. Failed/partial resources remain for inspection.
  publishArtifact(join(root, plan.manifest.operation_id + ".journal-owner.json"), canonicalJSON(header));
  mkdirSync(directory, { mode: 0o700 }); syncDirectory(root);
  mkdirSync(join(directory, "events"), { mode: 0o700 });
  publishArtifact(join(directory, "plan.json"), planBytes);
  publishArtifact(join(directory, "header.json"), canonicalJSON(header));
  syncDirectory(directory);
  return readJournal(directory, source);
}

/** Read-only inspection stays possible after policy drift. It confers no replay authority. */
function readJournalRecords(directory: string, sourceRepo: string, expected?: { revision: number; digest: string }, observationOnly = false): Journal {
  const source = realpathSync(sourceRepo);
  externalArtifactDirectory(directory, source);
  privateDirectory(dirname(directory));
  const headerBytes = readArtifact(join(directory, "header.json"));
  const value = parseCanonical(headerBytes);
  const hasReceipt = value !== null && typeof value === "object" && Object.hasOwn(value, "observed_receipt_object");
  const header = exact(value, ["schema_version", "kind", "operation_id", "repository", "source_repo", "directory", "plan_sha256", "owner_uid", "run_id", "recovery_mode", "observed_lease_object", ...(hasReceipt ? ["observed_receipt_object"] : [])]) as Header;
  if (hasReceipt && header.observed_receipt_object !== null && (header.recovery_mode !== "observation-only"
    || typeof header.observed_receipt_object !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(header.observed_receipt_object))) fail("changed recovery receipt");
  if (!["original", "observation-only"].includes(header.recovery_mode) || header.schema_version !== 1 || header.kind !== "docs-drift-journal"
    || typeof header.directory !== "string" || !isAbsolute(header.directory) || header.directory.includes("\0")
    || typeof header.source_repo !== "string" || !isAbsolute(header.source_repo) || header.source_repo.includes("\0")
    || !Number.isSafeInteger(header.owner_uid) || header.owner_uid < 0
    || !observationOnly && (header.directory !== directory || header.source_repo !== source || header.owner_uid !== process.getuid?.())
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(header.run_id)
    || (header.observed_lease_object !== null && (header.recovery_mode !== "observation-only"
      || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(header.observed_lease_object)))) fail("changed journal ownership");
  const planBytes = readArtifact(join(directory, "plan.json"));
  if (sha256(planBytes) !== hash(header.plan_sha256)) fail("changed local plan");
  const plan = parsePlan(parseCanonical(planBytes));
  if (header.operation_id !== plan.manifest.operation_id || header.repository !== plan.manifest.repository
    || directory !== join(dirname(directory), "docs-drift-" + header.operation_id)
    || !readArtifact(join(dirname(directory), header.operation_id + ".journal-owner.json")).equals(headerBytes)) fail("changed resource record");
  const eventDirectory = join(directory, "events");
  const files = numberedRecordFiles(eventDirectory), events: Event[] = [];
  let previous = sha256(headerBytes);
  for (const [index, file] of files.entries()) {
    if (file !== String(index + 1).padStart(10, "0") + ".json") fail("lost event revision");
    const bytes = readArtifact(join(eventDirectory, file));
    const event = exact(parseCanonical(bytes), ["schema_version", "revision", "previous_sha256", "kind", "effect_id", "payload"]) as Event;
    if (event.schema_version !== 1 || event.revision !== index + 1 || event.previous_sha256 !== previous) fail("changed event chain");
    validateEvent(event, plan, events, header);
    events.push(event); previous = sha256(bytes);
  }
  if (!canonicalJSON(files).equals(canonicalJSON(numberedRecordFiles(eventDirectory)))) fail("journal read conflict");
  if (expected && (expected.revision !== events.length || expected.digest !== previous)) fail("revision conflict");
  return { directory, source_repo: source, header, plan, events, revision: events.length, digest: previous };
}

/** Execution callers always reopen the original location and ownership record. */
export function readJournal(directory: string, sourceRepo: string, expected?: { revision: number; digest: string }): Journal {
  return readJournalRecords(directory, sourceRepo, expected);
}

/** Inspect copied records without converting their recorded origin into executing ownership. */
export function inspectJournal(directory: string, sourceRepo: string) {
  const journal = readJournalRecords(directory, sourceRepo, undefined, true);
  const terminal = new Set(journal.events.filter(event => ["outcome", "acknowledged-delivery", "retired-absence"].includes(event.kind)).map(event => event.effect_id));
  return freezeJSON({ authority: "none" as const, replay_authority: false as const, header: journal.header, plan: journal.plan,
    events: journal.events, revision: journal.revision, digest: journal.digest,
    pending_effect_ids: journal.plan.manifest.effects.filter(effect => !terminal.has(effect.id)).map(effect => effect.id) });
}
function append(journal: Journal, kind: Event["kind"], effectId: string, payload: Event["payload"]): Journal {
  const current = readJournal(journal.directory, journal.source_repo, journal);
  if (current.revision >= 9999999999) fail("revision limit");
  const event: Event = { schema_version: 1, revision: current.revision + 1, previous_sha256: current.digest, kind, effect_id: effectId, payload };
  validateEvent(event, current.plan, current.events, current.header);
  publishArtifact(join(current.directory, "events", String(event.revision).padStart(10, "0") + ".json"), canonicalJSON(event));
  return readJournal(current.directory, current.source_repo);
}
export function appendIntent(journal: Journal, effectId: string, atomicAcquisition?: string): Journal {
  const effect = journal.plan.manifest.effects.find(effect => effect.id === effectId);
  if (!effect) fail("unknown effect intent");
  return append(journal, "intent", effectId, { effect_sha256: effectDigest([effect]), ...(atomicAcquisition ? { atomic_acquisition: atomicAcquisition } : {}) });
}
export function appendOutcome(journal: Journal, effectId: string, receipt: Outcome): Journal { return append(journal, "outcome", effectId, outcome(receipt, dirname(journal.directory))); }
export function appendHandoff(journal: Journal, effectId: string, reason: string): Journal { return append(journal, "handoff", effectId, { reason: identifier(reason) }); }

export function appendInvalidation(journal: Journal, effectId: string, reason: string): Journal { return append(journal, "invalidation", effectId, { reason: identifier(reason) }); }

type MetadataHash = (kind: "blob" | "tree" | "commit", bytes: Buffer) => string;
function planMetadata(plan: SealedPlan, hash: MetadataHash) {
  const bytes = canonicalJSON(plan);
  const blob = hash("blob", bytes);
  const tree = hash("tree", Buffer.concat([Buffer.from("100644 plan.json\0"), Buffer.from(blob, "hex")]));
  const commit = Buffer.from(`tree ${tree}\nauthor vh-adlc <noreply@vhco.pro> 0 +0000\ncommitter vh-adlc <noreply@vhco.pro> 0 +0000\n\nDocs-drift operation ${plan.manifest.operation_id}\n`);
  return { object: hash("commit", commit), tree, blob, plan_sha256: sha256(bytes) };
}
function runMetadata(plan: SealedPlan, header: Header, hash: MetadataHash) {
  const objects = planMetadata(plan, hash);
  const commit = Buffer.from(`tree ${objects.tree}\nauthor vh-adlc <noreply@vhco.pro> 0 +0000\ncommitter vh-adlc <noreply@vhco.pro> 0 +0000\n\nDocs-drift lease ${plan.manifest.operation_id} ${header.run_id}\n`);
  const lease_object = header.observed_lease_object ?? hash("commit", commit);
  const receipt_object = Object.hasOwn(header, "observed_receipt_object") ? header.observed_receipt_object ?? (header.recovery_mode === "observation-only" ? objects.object : lease_object) : objects.object;
  return { ...objects, lease_object, receipt_object };
}

/** Recompute original metadata identities without writing objects or touching repository state. */
export function publicationObjectIDs(plan: SealedPlan, header: Header) {
  const checked = parsePlan(plan);
  if (header.plan_sha256 !== sha256(canonicalJSON(checked)) || header.operation_id !== checked.manifest.operation_id) fail("metadata header scope");
  const algorithm = checked.manifest.bindings.source_commit.length === 64 ? "sha256" : "sha1";
  return runMetadata(checked, header, (kind, bytes) => createHash(algorithm)
    .update(Buffer.from(`${kind} ${bytes.length}\0`)).update(bytes).digest("hex"));
}

/** Content-addressed objects add no refs, parents, workflow files or application tree entries. */
export function writePlanObject(store: OwnedObjectStore, value: SealedPlan) {
  const plan = parsePlan(value);
  requireOwnedStore(store, plan.manifest.repository);
  if (store.source_commit !== plan.manifest.bindings.source_commit) fail("object store source binding");
  return planMetadata(plan, (kind, bytes) => writeMetadataObject(store.root, kind, bytes));
}

export function appendRetirement(journal: Journal, effectId: string, retirement: Retirement): Journal {
  return append(journal, "retired-absence", effectId, retirement);
}

export function appendAcknowledgement(journal: Journal, effectId: string, acknowledgement: DeliveryAcknowledgement): Journal {
  return append(journal, "acknowledged-delivery", effectId, acknowledgement);
}

export function appendAttempt(journal: Journal, effectId: string, attemptId: string, reconciliation?: ReconciliationGrant, atomicReceiptId?: string): Journal {
  return append(journal, "attempt", effectId, { attempt_id: identifier(attemptId), ...(reconciliation ? { reconciliation } : {}), ...(atomicReceiptId ? { atomic_receipt_id: atomicReceiptId } : {}) });
}
export function appendAttemptEnd(journal: Journal, effectId: string, status: AttemptEnd): Journal {
  return append(journal, "attempt-ended", effectId, status);
}

/** Canonical plan bytes stay stable across per-run acquisition objects. */
export function writePublicationObjects(store: OwnedObjectStore, plan: SealedPlan, header: Header) {
  requireOwnedStore(store, plan.manifest.repository);
  if (store.source_commit !== plan.manifest.bindings.source_commit) fail("object store source binding");
  return runMetadata(parsePlan(plan), header, (kind, bytes) => writeMetadataObject(store.root, kind, bytes));
}

export function appendRecoveryOnly(journal: Journal, effectId: string, reason: string): Journal {
  return append(journal, "recovery-only", effectId, { reason: identifier(reason) });
}
export function isObservationOnly(journal: Journal): boolean {
  return journal.header.recovery_mode === "observation-only" || journal.events.some(event => event.kind === "recovery-only" || event.kind === "acknowledged-delivery");
}
