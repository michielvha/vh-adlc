import { PublicationScopeChanged } from "./publish";
import { ArtifactChanged } from "./evidence-input";
import { realpathSync } from "node:fs";
import { collectPublicationBindings } from "./publication-bindings";
import { isRefreshTarget } from "./proposals";
import { projectCurrentProposals } from "./publication-inventory";
import { parseWorkerPublication } from "./publication-proposal";
import { collectWorkerPreparation } from "./worker-preparation";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { effectMarker, manifestDigest, parseActionManifest, type ActionManifest, type Effect } from "./manifests";
import { validatePublicationShape } from "./publish";
import { publicationMarker } from "./report-history";
import { canonicalDigest, canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { captureRepositoryState, captureSnapshot, matchesRepositoryState } from "./snapshot";

type Options = Parameters<typeof collectPublicationBindings>[0] & { worker_capture: unknown };
type ReviewTarget = {
  schema_version: 1; kind: "docs-drift-review-target"; authority: "none"; complete: boolean; scope_changed: boolean; diagnostics: string[];
  manifest: ActionManifest | null; manifest_sha256: string | null; reviewer_runtime_sha256: string | null;
  bindings: Awaited<ReturnType<typeof collectPublicationBindings>> | null;
  preparation: Awaited<ReturnType<typeof collectWorkerPreparation>> | null;
};

/** Assemble the exact candidate and proposed payload before independent review. No verdict or permission is synthesized. */
export async function collectReviewTarget(input: Options): Promise<ReviewTarget> {
  const options = { ...input, worker_capture: structuredClone(input.worker_capture), selection: structuredClone(input.selection) };
  const repo = realpathSync(options.repo), candidate = realpathSync(options.candidate_repo);
  const before = canonicalDigest(captureRepositoryState(repo)), candidateBefore = canonicalDigest(captureRepositoryState(candidate));
  const result: ReviewTarget = { schema_version: 1, kind: "docs-drift-review-target", authority: "none", complete: false, scope_changed: false, diagnostics: [],
    manifest: null, manifest_sha256: null, reviewer_runtime_sha256: null, bindings: null, preparation: null };
  try {
    result.preparation = await collectWorkerPreparation(options);
    if (!result.preparation.complete) { result.diagnostics.push(...result.preparation.diagnostics); throw Error("Original worker preparation required for review"); }
    if (!canonicalJSON(result.preparation.selection).equals(canonicalJSON(options.selection))) throw Error("Candidate selection differs from the original worker");
    result.bindings = await collectPublicationBindings(options);
    if (!result.bindings.complete) { result.diagnostics.push(...result.bindings.diagnostics); throw Error("Current publication bindings required for review"); }
    const bound = result.bindings, facts = bound.facts;
    if (!bound.bindings || !bound.mode || !facts?.runtime || !facts.store || !facts.current_default || !facts.identity) throw Error("Complete candidate runtime required for review");
    const runtime = facts.runtime;
    const policy = readAdoptedRolePolicy({ repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime, role: "worker" });
    const original = readNativeRoleCapture({ source_repo: repo, candidate_repo: candidate, artifact_root: options.artifact_root, reference: options.worker_capture, policy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: bound.worker_input_sha256! } });
    if (!result.preparation.publication) throw Error("Original worker publication proposal required");
    const proposal = parseWorkerPublication(result.preparation.publication)!;
    if (bound.candidate_source_only && proposal.proposal.kind !== "issue-create") throw Error("Source-only publication requires an issue proposal");
    const action = proposal.proposal, payload = { ...action.payload }, settings = captureSnapshot(repo, options.source).settings;
    if (typeof payload.body !== "string") throw Error("Original publication body required");
    // These stable identifiers and exact native/checkpoint values are finalized before the reviewer is launched.
    const operationId = proposal.operation_id as string;
    payload.body += "\n" + publicationMarker(settings, operationId) + "\n" + effectMarker("publication") + "\n";
    const effects: Effect[] = [
      { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
      { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + operationId } },
    ];
    if (action.kind === "pr-create") effects.push({ id: "candidate", kind: "push", payload: { ref: "refs/heads/" + payload.branch, head: bound.bindings.candidate_commit } });
    if (action.kind === "pr-update") {
      const inventory = projectCurrentProposals(bound.proposals!.proposals, bound.resolution?.inputs_sha256 ?? null, options.inventory_context);
      const targets = inventory.inventory.filter(proposal => proposal.number === payload.number);
      if (targets.length !== 1) throw Error("Refresh requires one collected native proposal");
      const target = targets[0], before = payload.expected_payload as Record<string, unknown>;
      if (target.state !== "open" || target.merged_at !== null || target.base_ref !== settings.publication.base
        || target.base_repository.id !== facts.identity.repository_id || target.head_sha !== payload.expected_head
        || typeof target.title !== "string" || !Array.isArray(target.labels) || typeof before.body !== "string"
        || sha256(Buffer.from(before.body)) !== target.body_sha256
        || !canonicalJSON({ title: target.title, body: before.body, labels: target.labels, draft: target.draft }).equals(canonicalJSON(before))
        || !isRefreshTarget(settings, facts.identity, { number: target.number, actor: target.actor, actor_id: target.actor_id,
          head_ref: target.head_ref, head_repository_id: target.head_repository?.id ?? null })) throw Error("Refresh native target or original metadata preimage changed");
      effects.push({ id: "candidate", kind: "branch-refresh", payload: { ref: "refs/heads/" + target.head_ref,
        number: target.number, expected_head: target.head_sha, head: bound.bindings.candidate_commit } });
      payload.expected_head = bound.bindings.candidate_commit;
      if (payload.draft !== (settings.publication.pr_state[bound.mode] === "draft")) throw Error("Refresh draft policy changed");
    }
    effects.push({ id: "publication", kind: action.kind, payload }, { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } });
    const { repository, repository_id, actor, actor_id } = facts.identity;
    const manifest = parseActionManifest({ schema_version: 1, operation_id: proposal.operation_id, repository, repository_id, actor, actor_id,
      ...(settings.publication.entry_actors ? { publisher_entry: options.entry } : {}),
      bindings: bound.bindings, effects, worker: { invocation_id: original.binding.invocation_id, context_id: original.binding.context_id,
        native_sha256: original.binding.native_sha256, returned_sha256: original.binding.returned_sha256 } });
    validatePublicationShape({ manifest, context: "production", publication_kind: bound.mode }, settings,
      settings.publication.pr_state[bound.mode] === "draft");
    result.manifest = manifest; result.manifest_sha256 = manifestDigest(manifest);
    result.reviewer_runtime_sha256 = roleRuntimeDigest(runtime, "reviewer");
    result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof PublicationScopeChanged || error instanceof ArtifactChanged || Boolean(result.preparation?.scope_changed || result.bindings?.scope_changed);
    result.diagnostics.push(error instanceof Error ? error.message : "Candidate review target unavailable");
  }
  if (!matchesRepositoryState(repo, before) || !matchesRepositoryState(candidate, candidateBefore)) {
    result.complete = false; result.diagnostics.push("Caller changed or became unavailable during review target collection");
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}
