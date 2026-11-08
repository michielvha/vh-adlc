import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PublicationExecutionError } from "./attempts";
import { collectorRefArguments, projectGitSuccess, retainGitSuccess, type GitUpdate } from "./git-success";
import { publishArtifact, syncDirectory, type SealedPlan } from "./journal";
import { effectDigest, type Effect } from "./manifests";
import { canonicalJSON, sha256 } from "./protocol";
import { externalArtifactDirectory } from "./snapshot";
import type { Settings } from "./settings";
import type { ExecutionResult } from "./success";
import type { PlanObjects, PublicationIdentity } from "./transport";

/** The trial supplies any owned durable transaction. This helper has no native endpoint. */
export function executeCollectorRefs(options: {
  source_repo: string; artifact_root: string; plan: SealedPlan; effect: Effect; attempt_id: string;
  settings: Settings; identity: PublicationIdentity; objects: PlanObjects; refs: Map<string, string>;
  persist?: () => void;
}): ExecutionResult {
  const { plan, effect, objects, identity, refs } = options, p = effect.payload;
  const selected = plan.manifest.effects.find(item => item.id === effect.id);
  if (plan.transport !== "collector" || plan.context !== "trial" || !selected || effectDigest([selected]) !== effectDigest([effect])
    || identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id
    || identity.actor !== plan.manifest.actor || identity.actor_id !== plan.manifest.actor_id
    || options.settings.repository !== identity.repository || options.settings.publication.actor !== identity.actor) throw new PublicationExecutionError(false, true);
  let updates: GitUpdate[];
  const lease = objects.lease_object ?? objects.object, receipt = objects.receipt_object ?? objects.object;
  if (effect.kind === "lease-acquire") {
    const retained = plan.manifest.effects[1];
    if (plan.manifest.effects[0].id !== effect.id || retained?.kind !== "receipt-retain" || p.ref !== options.settings.publication.lease_ref
      || retained.payload.ref !== options.settings.publication.receipt_ref_prefix + plan.manifest.operation_id
      || lease === objects.object || lease !== receipt) throw new PublicationExecutionError(false, true);
    updates = [{ ref: String(p.ref), head: lease, expected: "" }, { ref: String(retained.payload.ref), head: receipt, expected: "" }];
  } else if (effect.kind === "lease-release") updates = [{ ref: String(p.ref), head: null, expected: lease }];
  else if (effect.kind === "receipt-retain") updates = [{ ref: String(p.ref), head: receipt, expected: "" }];
  else if (effect.kind === "push" || effect.kind === "branch-refresh") updates = [{ ref: String(p.ref), head: String(p.head), expected: effect.kind === "push" ? "" : String(p.expected_head) }];
  else throw new PublicationExecutionError(false, true);
  if (updates.some(update => (refs.get(update.ref) ?? "") !== update.expected && refs.get(update.ref) !== update.head)) throw new PublicationExecutionError(false, true);
  const previous = updates.map(update => refs.get(update.ref) ?? null);
  if (updates.some((update, index) => previous[index] === update.head)) throw new PublicationExecutionError(false, true);
  let sent = false;
  try {
    const argv_sha256 = sha256(canonicalJSON(collectorRefArguments(updates)));
    const root = externalArtifactDirectory(options.artifact_root, options.source_repo), id = randomUUID(), directory = join(root, "collector-command-" + id);
    publishArtifact(join(root, id + ".collector-command.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-collector-command",
      capture: "fixture-v1", operation_id: plan.manifest.operation_id, root: directory, effect_id: effect.id, attempt_id: options.attempt_id, argv_sha256 }));
    mkdirSync(directory, { mode: 0o700 }); syncDirectory(root);
    sent = true;
    for (const update of updates) {
      if (update.head === null) refs.delete(update.ref);
      else refs.set(update.ref, update.head);
    }
    options.persist?.();
    if (updates.some(update => (refs.get(update.ref) ?? null) !== update.head)) throw Error("incomplete fixture ref transaction");
    const response = Buffer.from("To owned-collector-fixture\n" + updates.map((update, index) => `${update.head === null ? "-" : previous[index] === null ? "*" : "+"}\t${update.head ?? ""}:${update.ref}\t[fixture applied]\n`).join("") + "Done\n");
    const projected = projectGitSuccess(response, updates);
    if (!projected) throw Error("incomplete fixture ref projection");
    publishArtifact(join(directory, "fixture-result.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-collector-ref-result",
      transport: "collector", context: "trial", operation_id: plan.manifest.operation_id, effect_id: effect.id, attempt_id: options.attempt_id,
      completed: true, request_sha256: argv_sha256, projection_sha256: sha256(canonicalJSON(projected)) }));
    const evidence = retainGitSuccess({ ...options, command_directory: directory, hostname: options.settings.hostname, response, updates });
    if (!evidence) throw Error("fixture ref application proof unavailable");
    return { successes: [evidence], commands: 1 };
  } catch { throw new PublicationExecutionError(sent, true, undefined, sent ? { successes: [], commands: 1, capture_unverified: true } : undefined); }
}
