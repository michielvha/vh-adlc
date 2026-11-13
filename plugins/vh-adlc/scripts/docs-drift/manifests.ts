import { canonicalJSON, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { parseIdentitySource, type IdentitySource } from "./settings";
import type { OwnedProcess } from "./owned-process";

export type { IdentitySource } from "./settings";
export type RolePolicy = { requested_model: string; adopted_model: string; identity_source: IdentitySource | null };
export type NativeRoleEvidence = {
  invocation_id: string; context_id: string; provider: IdentitySource["provider"]; target_sha256: string;
  native: Uint8Array; native_sha256: string; returned: Uint8Array; returned_sha256: string; process: OwnedProcess;
  isolation: "structural" | "procedural" | "unknown";
};
export type RoleReceipt = {
  invocation_id: string; context_id: string; native_sha256: string; returned_sha256: string;
};
export type Bindings = {
  source_commit: string; candidate_commit: string; candidate_tree: string;
  assessment_sha256: string; diff_sha256: string; settings_sha256: string; scanner_sha256: string;
  options_sha256: string; scope_sha256: string; feedback_sha256: string; proposals_sha256: string;
  decisions_sha256: string; dependencies_sha256: string; delivery_sha256: string;
};
export type Effect = { id: string; kind: keyof typeof effectFields; payload: Record<string, unknown> };
export type ActionManifest = {
  schema_version: 1; operation_id: string; repository: string; repository_id: number; actor: string; actor_id: number;
  bindings: Bindings; effects: Effect[]; worker: RoleReceipt;
};
/** Created by the owner-request/adopted-procedure controller, never read from worker output. */
export type EffectGrant = { manifest_sha256: string; effect_id: string; effect_sha256: string };

function invalid(reason: string): never { throw new Error(`invalid docs-drift manifest ${reason}`); }
function object(value: unknown, keys: readonly string[], reason: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(reason);
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) invalid(reason);
  return input;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) invalid("text");
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(result)) invalid("ID");
  return result;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) invalid("digest");
  return value;
}
function gitObject(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value)) invalid("Git object");
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid("positive integer");
  return value;
}
export function ref(value: unknown): string {
  const result = text(value);
  if (!result.startsWith("refs/heads/") || result.includes("..") || result.includes("@{") ||
      /[\u0000-\u0020\u007f~^:?*\[\\]/u.test(result) || result.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))) invalid("ref");
  return result;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) invalid("string array");
  const result = value.map(text);
  if (new Set(result).size !== result.length) invalid("duplicate strings");
  return result;
}

// Separate effect names preserve the owner's distinct grants, including metadata refs and cleanup.
const effectFields = {
  "report-write": ["path", "report_sha256"],
  "diagnostic-upload": ["run_id", "destination", "name", "report_sha256", "max_bytes"],
  edit: ["path", "before_sha256", "after_sha256"],
  generate: ["argv", "inputs_sha256", "outputs_sha256"],
  commit: ["head", "tree", "message"],
  push: ["ref", "head"],
  "branch-refresh": ["ref", "number", "expected_head", "head"],
  "pr-create": ["base", "branch", "title", "body", "labels", "draft"],
  "pr-update": ["number", "expected_head", "expected_payload_sha256", "expected_payload", "title", "body", "labels", "draft"],
  "issue-create": ["title", "body", "labels", "prior_ids", "evidence_repository", "evidence_path", "evidence_commit", "evidence_sha256"],
  "comment-create": ["number", "body", "prior_ids"],
  "pr-close": ["number", "expected_head"],
  "lease-acquire": ["ref"],
  "lease-release": ["ref"],
  "receipt-retain": ["ref"],
  "receipt-retire": ["ref", "expected_object"],
  "workflow-dispatch": ["workflow_id", "ref", "inputs"],
  "workflow-disable": ["workflow_id"],
  "workflow-enable": ["workflow_id"],
  "run-cancel": ["run_id"],
  "trial-pr-create": ["base", "branch", "title", "body", "labels", "draft"],
  "trial-pr-close": ["number", "expected_head"],
  "trial-branch-delete": ["ref", "expected_object"],
  "merged-branch-delete": ["ref", "expected_object"],
  "pr-merge": ["number", "expected_head", "method"],
  release: ["tag", "head", "title", "body", "draft", "prerelease"],
} as const;

export function parseEffect(value: unknown): Effect {
  const input = object(value, ["id", "kind", "payload"], "effect");
  const kind = text(input.kind);
  if (!Object.hasOwn(effectFields, kind)) invalid("effect kind");
  const selected = kind as Effect["kind"];
  const payload = object(input.payload, effectFields[selected], "effect payload");
  for (const [key, value] of Object.entries(payload)) {
    if (key.endsWith("sha256")) {
      if (!(kind === "edit" && ["before_sha256", "after_sha256"].includes(key) && value === null)) digest(value);
      continue;
    }
    switch (key) {
      case "head": case "tree": case "expected_head": case "expected_object": case "evidence_commit": gitObject(value); break;
      case "number": case "workflow_id": case "run_id": case "max_bytes": positive(value); break;
      case "draft": case "prerelease": if (typeof value !== "boolean") invalid("boolean"); break;
      case "labels": strings(value); break;
      case "expected_payload": {
        const source = object(value, ["title", "body", "labels", "draft"], "expected PR payload");
        text(source.title);
        if (typeof source.body !== "string" || typeof source.draft !== "boolean") invalid("expected PR payload types");
        const normalized = { ...source, labels: strings(source.labels).sort() };
        if (sha256(canonicalJSON(normalized)) !== payload.expected_payload_sha256) invalid("expected PR payload digest");
        break;
      }
      case "prior_ids": {
        if (!Array.isArray(value)) invalid("prior native IDs");
        const ids = value.map(positive);
        if (new Set(ids).size !== ids.length) invalid("duplicate prior native IDs");
        break;
      }
      case "argv": if (!Array.isArray(value) || value.length === 0) invalid("argv"); else value.forEach(text); break;
      case "path": case "evidence_path": protocolPath(value); break;
      case "ref":
        if (kind === "workflow-dispatch") text(value); else ref(value);
        break;
      case "branch": case "base": ref("refs/heads/" + text(value)); break;
      case "inputs": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("workflow inputs");
        for (const item of Object.values(value)) if (typeof item !== "string") invalid("workflow inputs");
        break;
      }
      case "destination": if (value !== "artifact" && value !== "job-summary") invalid("diagnostic destination"); break;
      case "method": if (!["merge", "squash", "rebase"].includes(text(value))) invalid("merge method"); break;
      default: text(value);
    }
  }
  if (kind === "edit" && payload.before_sha256 === null && payload.after_sha256 === null) invalid("absent edit");
  if (kind === "trial-pr-create" && payload.draft !== true) invalid("trial draft");
  return { id: id(input.id), kind: selected, payload };
}

const bindingFields = [
  "source_commit", "candidate_commit", "candidate_tree", "assessment_sha256", "diff_sha256", "settings_sha256",
  "scanner_sha256", "options_sha256", "scope_sha256", "feedback_sha256", "proposals_sha256", "decisions_sha256", "dependencies_sha256", "delivery_sha256",
] as const;

export type WorkerInputs = Omit<Bindings, "candidate_commit" | "candidate_tree" | "diff_sha256" | "delivery_sha256">;
const workerInputFields = bindingFields.filter(field => !["candidate_commit", "candidate_tree", "diff_sha256", "delivery_sha256"].includes(field));

function checkedBindingDigest(value: unknown, fields: readonly string[]): string {
  const bindings = object(value, fields, "bindings");
  for (const [key, value] of Object.entries(bindings)) {
    if (key.endsWith("sha256")) digest(value); else gitObject(value);
  }
  return sha256(canonicalJSON(bindings));
}

export function bindingDigest(value: Bindings): string {
  return checkedBindingDigest(value, bindingFields);
}

/** Capture this target before authoring. It contains no candidate or verification outputs. */
export function workerInputsDigest(value: WorkerInputs): string {
  return checkedBindingDigest(value, workerInputFields);
}

/** Worker inputs precede produced diff/tree/commit identities. The reviewer binds those outputs. */
export function workerInputDigest(value: Bindings): string {
  bindingDigest(value);
  const { candidate_commit, candidate_tree, diff_sha256, delivery_sha256, ...inputs } = value;
  return workerInputsDigest(inputs);
}

export function effectDigest(value: Effect[]): string {
  if (!Array.isArray(value)) invalid("effects");
  const effects = value.map(parseEffect);
  if (new Set(effects.map(effect => effect.id)).size !== effects.length) invalid("duplicate effect IDs");
  return sha256(canonicalJSON(effects));
}
export function parseActionManifest(value: unknown): ActionManifest {
  const input = object(value, ["schema_version", "operation_id", "repository", "repository_id", "actor", "actor_id", "bindings", "effects", "worker"], "fields");
  if (input.schema_version !== 1) invalid("schema version");
  if (typeof input.operation_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(input.operation_id)) invalid("operation ID");
  if (typeof input.repository !== "string" || !/^[a-z0-9-]+\/[a-z0-9_.-]+$/u.test(input.repository) || input.repository.split("/").some(part => part === "." || part === "..")) invalid("repository");
  positive(input.repository_id); positive(input.actor_id); text(input.actor);
  bindingDigest(input.bindings as Bindings);
  effectDigest(input.effects as Effect[]);
  const worker = object(input.worker, ["invocation_id", "context_id", "native_sha256", "returned_sha256"], "worker receipt");
  id(worker.invocation_id); id(worker.context_id); digest(worker.native_sha256); digest(worker.returned_sha256);
  // The closed schema has been validated. Copy through canonical bytes to detach all caller state.
  return JSON.parse(canonicalJSON(input).toString()) as ActionManifest;
}
export function manifestDigest(value: ActionManifest): string { return sha256(canonicalJSON(parseActionManifest(value))); }

/** This checks exact controller-materialized authority, without inferring any additional grant. */
export function authorizeEffects(manifest: ActionManifest, grants: EffectGrant[]): Effect[] {
  const parsed = parseActionManifest(manifest);
  const hash = manifestDigest(parsed);
  for (const effect of parsed.effects) {
    const matches = grants.filter(grant => grant.manifest_sha256 === hash && grant.effect_id === effect.id && grant.effect_sha256 === effectDigest([effect]));
    if (matches.length !== 1) invalid("missing or ambiguous effect grant");
  }
  return parsed.effects;
}

export function modelMatches(requested: string, observed: string): boolean {
  if (!requested || observed === "unknown" || !observed) return false;
  if (requested === observed) return true;
  const alias = requested.toLowerCase();
  const family = /^(?:claude[-.])?(opus|sonnet|haiku)$/u.exec(alias)?.[1];
  return family !== undefined && new RegExp(`^claude[-.]${family}[-.]\\d`, "u").test(observed);
}
export function fullModel(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]*[0-9][A-Za-z0-9_.:-]*$/u.test(value) || value === "unknown") invalid("native model identity");
  return value;
}
function field(event: unknown, path: string[]): unknown {
  let value = event;
  for (const part of path) {
    if (value === null || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** Evidence is supplied by the owned native invocation wrapper, never by a report or settings flag. */
export function verifyRoleIdentity(evidence: NativeRoleEvidence, policy: RolePolicy) {
  const source = parseIdentitySource(policy.identity_source, evidence.provider);
  if (source === null) invalid("missing native identity source");
  id(evidence.invocation_id); id(evidence.context_id); digest(evidence.target_sha256);
  if (!["structural", "procedural", "unknown"].includes(evidence.isolation)) invalid("review isolation record");
  const process = evidence.process;
  if (process.exit_code !== 0 || !process.reaped || process.timed_out || process.cancelled !== null || process.output_limit) invalid("native process completion");
  if (sha256(evidence.native) !== evidence.native_sha256 || sha256(evidence.returned) !== evidence.returned_sha256) invalid("original native artifact digest");
  const native = decodeUTF8(evidence.native);
  let events: unknown[];
  try { events = [JSON.parse(native)]; }
  catch {
    events = native.split("\n").filter(line => line.trim() !== "").map(line => {
      try { return JSON.parse(line) as unknown; } catch { invalid("native event JSON"); }
    });
  }
  const models: string[] = [];
  let selectedEvents = 0;
  for (const event of events) {
    const selected = field(event, ["type"]) === source.event_type;
    if (selected) selectedEvents++;
    const model = field(event, source.field_path);
    if (selected || model !== undefined) models.push(fullModel(model));
  }
  if (selectedEvents === 0 || models.length === 0 || new Set(models).size !== 1) invalid("conflicting or missing native identity");
  const model = models[0];
  if (model !== fullModel(policy.adopted_model) || !modelMatches(policy.requested_model, model)) invalid("adopted native identity");
  const returned = decodeUTF8(evidence.returned);
  const newline = returned.indexOf("\n");
  if (newline < 0 || returned.slice(0, newline) !== `MODEL: ${model}` || /^MODEL:/mu.test(returned.slice(newline + 1))) invalid("returned model identity");
  return {
    invocation_id: evidence.invocation_id, context_id: evidence.context_id, provider: evidence.provider,
    model, requested_model: policy.requested_model, identity_source: source, isolation: evidence.isolation, target_sha256: evidence.target_sha256,
    native_sha256: evidence.native_sha256, returned_sha256: evidence.returned_sha256,
    records: returned.slice(newline + 1),
  };
}

function cleanReview(records: string): number {
  const lines = records.split("\n").filter(line => line.trim() !== "");
  if (lines.length === 1 && lines[0] === "NO FINDINGS") return 0;
  const fields = ["FINDING", "KIND", "SEVERITY", "WHERE", "EVIDENCE", "PROPOSAL"];
  const ids = new Set<string>();
  let current: Record<string, string> | null = null;
  const complete = () => {
    const record = current;
    if (record === null) invalid("incomplete review records");
    if (fields.some(key => !record[key])) invalid("incomplete review records");
    if (record.SEVERITY !== "nit") invalid("blocking review findings");
    if (!["factual", "judgement"].includes(record.KIND) || ids.has(record.FINDING)) invalid("review records");
    ids.add(record.FINDING);
  };
  let previous: string | null = null;
  for (const line of lines) {
    const match = /^([A-Z]+): (.+)$/u.exec(line);
    if (match && fields.includes(match[1])) {
      if (match[1] === "FINDING") { if (current !== null) complete(); current = {}; }
      if (current === null || Object.hasOwn(current, match[1])) invalid("review records");
      current[match[1]] = match[2]; previous = match[1];
    } else {
      if (current === null || previous === null || /^[A-Z][A-Z_ ]*:/u.test(line) || line === "NO FINDINGS") invalid("review records");
      current[previous] += "\n" + line;
    }
  }
  complete();
  return ids.size;
}

/** Verify a read-only semantic review. Only validateReviewedManifest can authorize an effect plan. */
export function verifyIndependentRoleReview(input: {
  worker: NativeRoleEvidence; reviewer: NativeRoleEvidence;
  worker_target_sha256: string; reviewer_target_sha256: string; policy: { worker: RolePolicy; reviewer: RolePolicy };
}) {
  const worker = verifyRoleIdentity(input.worker, input.policy.worker), reviewer = verifyRoleIdentity(input.reviewer, input.policy.reviewer);
  if (worker.invocation_id === reviewer.invocation_id || worker.context_id === reviewer.context_id) invalid("independent review context");
  if (worker.target_sha256 !== input.worker_target_sha256 || reviewer.target_sha256 !== input.reviewer_target_sha256) invalid("review target");
  const nit_count = cleanReview(reviewer.records);
  return freezeJSON({ worker, reviewer, nit_count });
}

const reviewedInstances = new WeakSet<object>();
export type ReviewedManifest = ReturnType<typeof validateReviewedManifest>;
export function requireReviewedManifest(value: ReviewedManifest): void {
  if (!reviewedInstances.has(value)) invalid("missing owned review result");
}

export function verifyReviewEvidence(input: {
  manifest: unknown; current: ActionManifest;
  worker: NativeRoleEvidence; reviewer: NativeRoleEvidence; policy: { worker: RolePolicy; reviewer: RolePolicy };
}) {
  const manifest = parseActionManifest(input.manifest);
  const hash = manifestDigest(manifest);
  if (hash !== manifestDigest(input.current)) invalid("changed current bindings or payload");
  const { worker, reviewer } = verifyIndependentRoleReview({ worker: input.worker, reviewer: input.reviewer, policy: input.policy,
    worker_target_sha256: workerInputDigest(manifest.bindings), reviewer_target_sha256: hash });
  const receipt = { invocation_id: worker.invocation_id, context_id: worker.context_id, native_sha256: worker.native_sha256, returned_sha256: worker.returned_sha256 };
  if (!canonicalJSON(manifest.worker).equals(canonicalJSON(receipt))) invalid("worker receipt binding");
  let preparation: unknown;
  try { preparation = JSON.parse(worker.records); } catch { invalid("worker returned manifest"); }
  if (field(preparation, ["input_sha256"]) !== workerInputDigest(manifest.bindings)) invalid("worker input binding");
  // The wrapper validates/stages the bounded edit manifest. Its unchanged original bytes are bound
  // above and reviewed together with the resulting checkpoint and complete publication payload.
  return freezeJSON({ manifest, manifest_sha256: hash, worker, reviewer });
}

/** Only the effect-authorized result can enter the journal's sealed-plan path. */
export function validateReviewedManifest(input: Parameters<typeof verifyReviewEvidence>[0] & { grants: EffectGrant[] }) {
  const manifest = parseActionManifest(input.manifest);
  authorizeEffects(manifest, input.grants);
  const result = verifyReviewEvidence(input);
  reviewedInstances.add(result);
  return result;
}

/** Distinct effect IDs are finalized in payloads before candidate review. */
export function effectMarker(effectId: string): string {
  return `<!-- vh-adlc-docs-drift_effect id=${id(effectId)} -->`;
}
