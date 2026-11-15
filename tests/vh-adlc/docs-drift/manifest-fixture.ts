import { effectDigest, manifestDigest, workerInputDigest, type ActionManifest, type Effect, type IdentitySource, type NativeRoleEvidence, type RolePolicy } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

export const hash = (value: string) => sha256(Buffer.from(value));
export const source: IdentitySource = { provider: "copilot", event_type: "assistant.message", field_path: ["data", "model"] };
export const role: RolePolicy = { requested_model: "opus", adopted_model: "claude-opus-5.5", identity_source: source };
export const bindings = {
  source_commit: "a".repeat(40), candidate_commit: "b".repeat(40), candidate_tree: "c".repeat(40),
  assessment_sha256: hash("assessment"), diff_sha256: hash("diff"), settings_sha256: hash("settings"),
  scanner_sha256: hash("scanner"), options_sha256: hash("options"), scope_sha256: hash("scope"),
  feedback_sha256: hash("feedback"), proposals_sha256: hash("heads and full bodies"),
  decisions_sha256: hash("owner decisions"), dependencies_sha256: hash("dependencies"),
  delivery_sha256: sha256(canonicalJSON({ corrections: [], attention: [] })),
};

export function evidence(id: string, target: string, returned: string): NativeRoleEvidence {
  const native = Buffer.from(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.5" } }) + "\n");
  const records = Buffer.from(`MODEL: claude-opus-5.5\n${returned}`);
  return {
    invocation_id: id, context_id: id + "-context", provider: "copilot", target_sha256: target, isolation: "procedural",
    native, native_sha256: sha256(native), returned: records, returned_sha256: sha256(records),
    process: { pid: 123, exit_code: 0, reaped: true, timed_out: false, cancelled: null, output_limit: false,
      confirmed: true, group_absent: true, survivors: [], boundary: "marker", signals: [] },
  };
}

export function fixture(selectedBindings = bindings, selectedEffects?: Effect[], operationId = "operation-1", publisher?: Pick<ActionManifest, "actor" | "actor_id" | "publisher_entry">) {
  const effects: Effect[] = selectedEffects ?? [
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/one", head: selectedBindings.candidate_commit } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Repair docs", body: "Exact reviewed body\n", labels: ["documentation"], draft: true } },
  ];
  const worker = evidence("worker", workerInputDigest(selectedBindings), canonicalJSON({ input_sha256: workerInputDigest(selectedBindings), edits: [], publication: effects.find(effect => effect.kind === "pr-create")?.payload ?? null }).toString());
  const manifest: ActionManifest = {
    schema_version: 1, operation_id: operationId, repository: "fixture/docs", repository_id: 10,
    actor: "fixture-bot", actor_id: 20, ...publisher, bindings: selectedBindings, effects,
    worker: { invocation_id: worker.invocation_id, context_id: worker.context_id, native_sha256: worker.native_sha256, returned_sha256: worker.returned_sha256 },
  };
  const reviewer = evidence("reviewer", manifestDigest(manifest), "NO FINDINGS\n");
  const grants = effects.map(effect => ({ manifest_sha256: manifestDigest(manifest), effect_id: effect.id, effect_sha256: effectDigest([effect]) }));
  return { manifest, current: structuredClone(manifest), worker, reviewer, grants, policy: { worker: role, reviewer: role } };
}
