import { realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readGit } from "./git";
import { readArtifact, readVerifiedPlan, sealPlan, type PlanPolicy, type SealedPlan } from "./journal";
import { effectDigest, manifestDigest, validateReviewedManifest, type NativeRoleEvidence } from "./manifests";
import { canonicalJSON, decodeUTF8, protocolPath, sha256 } from "./protocol";
import { type PublicationGate, type PublishOptions } from "./publish";
import { loadTrialContext, type TrialContext } from "./trial-context";
import { createTrialTransport } from "./trial-transport";
import { loadCommittedSettings } from "./settings";
import type { OwnedProcess } from "./owned-process";

function exact(value: unknown, fields: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...fields].sort().join(",")) throw Error("synthetic publication fields");
  return value as Record<string, unknown>;
}
function json(bytes: Uint8Array): unknown {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(Buffer.from(bytes))) throw Error("synthetic publication canonical JSON required");
  return value;
}
function ownedArtifact(context: TrialContext, path: string): Buffer {
  const name = protocolPath(relative(context.artifacts, resolve(path)));
  const selected = join(context.artifacts, name);
  if (realpathSync(selected) !== selected) throw Error("synthetic publication linked artifact");
  return readArtifact(selected);
}
function retained(context: TrialContext, value: unknown): Buffer {
  const input = exact(value, ["path", "sha256"]);
  if (typeof input.path !== "string" || typeof input.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(input.sha256)) throw Error("synthetic publication artifact reference");
  const bytes = ownedArtifact(context, join(context.artifacts, protocolPath(input.path)));
  if (sha256(bytes) !== input.sha256) throw Error("synthetic publication original artifact changed");
  return bytes;
}
function nativeRole(context: TrialContext, value: unknown, binding: SealedPlan["roles"]["worker"]): NativeRoleEvidence {
  const input = exact(value, ["native", "returned", "process"]);
  const completion = exact(input.process, ["pid", "exit_code", "timed_out", "cancelled", "output_limit", "reaped"]);
  if (typeof completion.pid !== "number" || !Number.isSafeInteger(completion.pid) || completion.pid < 1
    || completion.exit_code !== 0 || completion.timed_out !== false || completion.cancelled !== null
    || completion.output_limit !== false || completion.reaped !== true) throw Error("synthetic publication native process incomplete");
  const native = retained(context, input.native), returned = retained(context, input.returned);
  return { invocation_id: binding.invocation_id, context_id: binding.context_id, provider: binding.provider,
    target_sha256: binding.target_sha256, isolation: binding.isolation, native, returned,
    native_sha256: binding.native_sha256, returned_sha256: binding.returned_sha256, process: completion as OwnedProcess };
}

/** Only the immutable setup test grant supplies collector authority. Request/report flags supply none. */
export function readTrialPublication(selected: TrialContext, requestPath: string): PublishOptions {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  const request = exact(json(ownedArtifact(context, requestPath)), ["schema_version", "kind", "context_sha256", "entry", "plan", "worker", "reviewer"]);
  if (request.schema_version !== 1 || request.kind !== "docs-drift-synthetic-publication" || request.context_sha256 !== context.context_sha256
    || !["copilot", "claude"].includes(String(request.entry))) throw Error("synthetic publication context or entry changed");
  const entry = context.settings.execution.entries[String(request.entry)];
  const rolePolicy = (name: "worker" | "reviewer") => {
    const selected = entry[name];
    if (selected.identity_source === null) throw Error("synthetic publication native role capability unavailable");
    return { requested_model: selected.model, adopted_model: selected.model, identity_source: selected.identity_source };
  };
  const workerPolicy = rolePolicy("worker"), reviewerPolicy = rolePolicy("reviewer");
  const plan = readVerifiedPlan(retained(context, request.plan), original => ({ adoption_sha256: context.context_sha256,
    context: "trial", transport: "collector", publication_kind: original.publication_kind, pr_draft: true,
    worker: workerPolicy, reviewer: reviewerPolicy }));
  const policy: PlanPolicy = { adoption_sha256: context.context_sha256, context: "trial", transport: "collector",
    publication_kind: plan.publication_kind, pr_draft: true, worker: workerPolicy, reviewer: reviewerPolicy };
  const manifest = plan.manifest, candidate = manifest.bindings.candidate_commit;
  if (manifest.bindings.source_commit !== context.source_commit || manifest.bindings.settings_sha256 !== loadCommittedSettings(context.source, context.source_commit).settings_sha256
    || readGit(context.store.root, "rev-parse", "--verify", "--end-of-options", candidate + "^{commit}").toString().trim() !== candidate
    || readGit(context.store.root, "rev-parse", "--verify", "--end-of-options", candidate + "^{tree}").toString().trim() !== manifest.bindings.candidate_tree) throw Error("synthetic publication source or candidate changed");
  const review: PublicationGate["review"] = { manifest, current: manifest,
    grants: manifest.effects.map(effect => ({ manifest_sha256: manifestDigest(manifest), effect_id: effect.id, effect_sha256: effectDigest([effect]) })),
    worker: nativeRole(context, request.worker, plan.roles.worker), reviewer: nativeRole(context, request.reviewer, plan.roles.reviewer),
    policy: { worker: workerPolicy, reviewer: reviewerPolicy } };
  const checked = sealPlan({ reviewed: validateReviewedManifest(review), grants: review.grants, ...policy,
    corrections: plan.corrections, attention: plan.attention });
  if (!canonicalJSON(checked).equals(canonicalJSON(plan))) throw Error("synthetic publication original review changed");
  return { source_repo: context.source, artifact_root: context.artifacts, object_store: context.store, settings: context.settings,
    plan, transport: createTrialTransport(context), gate: async () => {
      const current = readTrialPublication(context, requestPath);
      if (!canonicalJSON(current.plan).equals(canonicalJSON(plan))) throw Error("synthetic publication request changed");
      return { review, policy };
    } };
}
