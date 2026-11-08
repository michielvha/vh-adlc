import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PublicationExecutionError } from "./attempts";
import { projectBeforeSource, retainBefore, type BeforeData } from "./delivery-proof";
import { publishArtifact, syncDirectory, type SealedPlan } from "./journal";
import { effectDigest, effectMarker, type Effect } from "./manifests";
import { canonicalJSON, sha256 } from "./protocol";
import { publicationMarker } from "./report-history";
import { externalArtifactDirectory } from "./snapshot";
import { collectorMutationArguments, collectorRequest, projectSuccess, retainSuccess, type ExecutionResult } from "./success";
import type { Settings } from "./settings";
import type { PublicationIdentity } from "./transport";
import { readGit } from "./git";

export type CollectorResources = Map<string, Record<string, unknown>>;
export type CollectorLabel = { id: number; name: string };
type Options = {
  source_repo: string; artifact_root: string; plan: SealedPlan; effect: Effect; attempt_id: string;
  settings: Settings; identity: PublicationIdentity; resources: CollectorResources; labels: ReadonlyMap<string, CollectorLabel>;
};

function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw Error("invalid fixture resource ID");
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("missing fixture resource");
  return value as Record<string, unknown>;
}
function labels(value: unknown, known: Options["labels"]): CollectorLabel[] {
  if (!Array.isArray(value) || value.length > 1000) throw Error("invalid fixture labels");
  const selected = new Map<number, CollectorLabel>();
  for (const name of value) {
    if (typeof name !== "string") throw Error("invalid fixture label name");
    const label = known.get(name.toLowerCase());
    if (!label || typeof label.name !== "string" || !label.name || /[\r\n\0]/u.test(label.name)
      || label.name.toLowerCase() !== name.toLowerCase()) throw Error("fixture label unavailable");
    selected.set(positive(label.id), { id: label.id, name: label.name });
  }
  return [...selected.values()].sort((left, right) => left.id - right.id);
}

function prepare(options: Options) {
  const { plan, effect, settings, resources, identity } = options, p = effect.payload;
  const request = collectorRequest(effect, plan.manifest.repository);
  if (resources.size > 1000) throw Error("fixture inventory exceeds bound");
  const parent = ["pr-update", "pr-close", "comment-create"].includes(effect.kind) ? record(resources.get("pulls/" + positive(p.number))) : null;
  const source = parent ? projectBeforeSource(parent) : null;
  if (source && source.base_ref !== settings.publication.base) throw Error("fixture parent destination changed");
  const wanted = ["pr-create", "issue-create", "pr-update"].includes(effect.kind) ? labels(p.labels, options.labels) : null;
  const originalLabels = effect.kind === "pr-update" ? labels(record(p.expected_payload).labels, options.labels) : null;
  if (source && ["pr-update", "pr-close"].includes(effect.kind) && (source.state !== "open" || source.head_sha !== p.expected_head)) throw Error("fixture mutable target changed");
  if (effect.kind === "pr-update") {
    const original = record(p.expected_payload), author = record(parent!.user);
    if (author.id !== identity.actor_id || author.login !== identity.actor || source!.head_repository_id !== identity.repository_id
      || !source!.head_ref.startsWith(settings.publication.branch_prefix)
      || source!.title_sha256 !== sha256(Buffer.from(String(original.title))) || source!.body_sha256 !== sha256(Buffer.from(String(original.body)))
      || source!.draft !== original.draft || !canonicalJSON(source!.labels).equals(canonicalJSON(originalLabels!.map(label => label.id)))) throw Error("fixture original payload changed");
  }
  const marker = publicationMarker(settings, plan.manifest.operation_id), selectedMarker = effectMarker(effect.id);
  let creation: BeforeData["creation"] = null;
  if (["pr-create", "issue-create", "comment-create"].includes(effect.kind)) {
    const surface = effect.kind === "pr-create" ? "pulls" : effect.kind === "issue-create" ? "issues" : "comments";
    const inventory = [...resources.entries()].filter(([key]) => key.startsWith(surface + "/")).map(([, resource]) => resource);
    const selected = surface === "comments" ? inventory.filter(resource => {
      positive(resource.parent_number);
      return resource.parent_number === p.number;
    }) : inventory;
    const seen = new Set<number>();
    const markerIds: number[] = [];
    for (const resource of selected) {
      const id = positive(resource.id);
      if (seen.has(id) || resource.body !== null && typeof resource.body !== "string") throw Error("incomplete fixture inventory");
      seen.add(id);
      if (typeof resource.body === "string" && resource.body.includes(marker) && resource.body.includes(selectedMarker)) markerIds.push(id);
    }
    if (markerIds.length) throw Error("fixture creation marker predates dispatch");
    creation = { surface, inventory_sha256: sha256(canonicalJSON(selected)), marker_ids: markerIds };
  }
  if (effect.kind === "issue-create") {
    if (p.evidence_repository !== plan.manifest.repository
      || sha256(readGit(options.source_repo, "show", String(p.evidence_commit) + ":" + String(p.evidence_path))) !== p.evidence_sha256) throw Error("fixture issue evidence changed");
  }
  if (effect.kind === "pr-close") {
    const prior = plan.manifest.effects.slice(0, plan.manifest.effects.indexOf(effect));
    const explanations = prior.filter(item => item.kind === "comment-create" && item.payload.number === p.number);
    if (explanations.length !== 1 || [...resources.values()].filter(resource => resource.parent_number === p.number
      && resource.body === explanations[0].payload.body && record(resource.user).id === identity.actor_id).length !== 1) throw Error("fixture explanation unavailable");
  }
  const data: BeforeData = { hostname: settings.hostname, identity, source, creation,
    label_ids: wanted?.map(label => label.id) ?? null, original_label_ids: originalLabels?.map(label => label.id) ?? null,
    requests_sha256: sha256(canonicalJSON({ fixture_resource_count: resources.size, source, creation })) };
  const nextId = Math.max(1000, ...[...resources.values()].map(resource => positive(resource.id))) + 1;
  const nextNumber = Math.max(500, ...[...resources.entries()].filter(([key]) => !key.startsWith("comments/"))
    .map(([, resource]) => positive(resource.number))) + 1;
  let key: string, after: Record<string, unknown>;
  if (effect.kind === "pr-create") {
    if (p.base !== settings.publication.base || typeof p.branch !== "string" || !p.branch.startsWith(settings.publication.branch_prefix)) throw Error("fixture PR destination changed");
    key = "pulls/" + nextNumber;
    after = { id: nextId, number: nextNumber, title: p.title, body: p.body, draft: p.draft, labels: wanted,
      state: "open", merged_at: null, user: { id: identity.actor_id, login: identity.actor },
      head: { sha: plan.manifest.bindings.candidate_commit, ref: p.branch, repo: { id: identity.repository_id } },
      base: { ref: p.base, repo: { id: identity.repository_id } } };
  } else if (effect.kind === "issue-create") {
    key = "issues/" + nextNumber;
    after = { id: nextId, number: nextNumber, title: p.title, body: p.body, labels: wanted, state: "open",
      user: { id: identity.actor_id, login: identity.actor } };
  } else if (effect.kind === "comment-create") {
    key = "comments/" + nextId;
    const host = settings.hostname === "github.com" ? "api.github.com" : settings.hostname;
    after = { id: nextId, body: p.body, parent_number: p.number,
      issue_url: `https://${host}/repos/${plan.manifest.repository}/issues/${positive(p.number)}`,
      user: { id: identity.actor_id, login: identity.actor } };
  } else {
    key = "pulls/" + positive(p.number);
    after = effect.kind === "pr-close" ? { ...parent, state: "closed" }
      : { ...parent, title: p.title, body: p.body, labels: wanted, draft: p.draft };
  }
  return { request, data, key, after };
}

/** Pre-dispatch refusals leave resources unchanged and are recorded as unsent. */
export function executeCollectorEffect(options: Options): ExecutionResult {
  const { plan, effect, identity } = options;
  if (plan.transport !== "collector" || plan.context !== "trial" || identity.repository !== plan.manifest.repository
    || identity.repository_id !== plan.manifest.repository_id || identity.actor !== plan.manifest.actor
    || identity.actor_id !== plan.manifest.actor_id || options.settings.repository !== identity.repository
    || options.settings.publication.actor !== identity.actor) throw new PublicationExecutionError(false, true);
  const selected = plan.manifest.effects.find(item => item.id === effect.id);
  if (!selected || effectDigest([selected]) !== effectDigest([effect])) throw new PublicationExecutionError(false, true);
  let prepared: ReturnType<typeof prepare>;
  try { prepared = prepare(options); } catch { throw new PublicationExecutionError(false, true); }
  let sent = false, before: ExecutionResult["before"];
  try {
    before = retainBefore({ ...options, data: prepared.data });
    const root = externalArtifactDirectory(options.artifact_root, options.source_repo), id = randomUUID();
    const directory = join(root, "collector-command-" + id);
    const argv_sha256 = sha256(canonicalJSON(collectorMutationArguments(prepared.request.method, prepared.request.endpoint)));
    publishArtifact(join(root, id + ".collector-command.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-collector-command",
      capture: "fixture-v1", operation_id: plan.manifest.operation_id, root: directory, effect_id: effect.id, attempt_id: options.attempt_id, argv_sha256 }));
    mkdirSync(directory, { mode: 0o700 }); syncDirectory(root);
    const input = canonicalJSON(prepared.request.input);
    publishArtifact(join(directory, "payload.json"), input);
    sent = true;
    options.resources.set(prepared.key, prepared.after);
    const actual = options.resources.get(prepared.key);
    const status = prepared.request.method === "POST" ? 201 : 200;
    const response = Buffer.from(`HTTP/2.0 ${status} fixture\r\n\r\n` + JSON.stringify(actual));
    const projection = projectSuccess(response);
    if (!projection) throw Error("incomplete fixture response");
    publishArtifact(join(directory, "fixture-result.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-collector-result",
      transport: "collector", context: "trial", operation_id: plan.manifest.operation_id, effect_id: effect.id, attempt_id: options.attempt_id,
      completed: true, request_sha256: sha256(canonicalJSON({ argv_sha256, input_sha256: sha256(input) })),
      response_sha256: sha256(response), projection_sha256: sha256(canonicalJSON(projection)), before }));
    const evidence = retainSuccess({ ...options, command_directory: directory, command_index: 0, hostname: options.settings.hostname,
      method: prepared.request.method, endpoint: prepared.request.endpoint, response });
    if (!evidence) throw Error("fixture success projection unavailable");
    return { successes: [evidence], commands: 1, before };
  } catch {
    throw new PublicationExecutionError(sent, true, undefined, sent
      ? { successes: [], commands: 1, ...(before ? { before } : {}), capture_unverified: true } : undefined);
  }
}
