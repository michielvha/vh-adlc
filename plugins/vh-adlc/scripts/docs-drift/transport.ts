import { retainRejection, type RejectionEvidence, type RejectedUpdate } from "./rejections";
import { PublicationExecutionError } from "./attempts";
import type { Effect } from "./manifests";
import type { Outcome, SealedPlan, writePlanObject } from "./journal";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGitHubReader, createRepositoryReader, GitHubReadError } from "../github-read";
import { gitEnvironment, gitReadArguments } from "../git-read";
import { canonicalJSON, protocolPath, sha256 } from "./protocol";
import { effectMarker } from "./manifests";
import { publicationMarker } from "./report-history";
import { retainAbsence, retainLookup, type AbsenceEvidence } from "./observations";
import { executeOwnedProcess } from "./owned-process";
import { externalArtifactDirectory, type OwnedObjectStore } from "./snapshot";
import { requireOwnedStore } from "./proposals";
import { readGit } from "./git";
import type { Settings } from "./settings";
export type PlanObjects = ReturnType<typeof writePlanObject> & { lease_object?: string; receipt_object?: string };
export type RefObservation = { state: "absent" } | { state: "present"; object: string };
export type EffectObservation = { state: "done"; outcome: Outcome } | { state: "absent"; evidence?: AbsenceEvidence } | { state: "unknown"; reason: string } | { state: "conflict"; reason: string; evidence?: AbsenceEvidence };
type NativeDelivery = { sent: boolean; reaped: boolean; effect_id: string; attempt_id: string | null; effect: Effect; completed_commands: number; rejection?: RejectionEvidence };
export type PublicationIdentity = { repository: string; repository_id: number; default_branch: string; actor: string; actor_id: number };

/** The production entry constructs its native transport. Only the separate trial entry injects a collector. */
export interface PublicationTransport {
  kind: "native" | "collector";
  object_store: string;
  artifact_root: string;
  identity(): Promise<PublicationIdentity>;
  ref(ref: string): Promise<RefObservation>;
  readPlanObject(object: string): Promise<{ bytes: Uint8Array; objects: PlanObjects }>;
  observe(plan: SealedPlan, effect: Effect, objects: PlanObjects): Promise<EffectObservation>;
  execute(plan: SealedPlan, effect: Effect, objects: PlanObjects, attempt_id?: string): Promise<void>;
}


function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("invalid native publication response");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0")) throw Error("invalid native publication text");
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw Error("invalid native publication ID");
  return value;
}
function actor(value: unknown) {
  const input = record(value);
  return { actor: text(input.login), actor_id: positive(input.id) };
}
type NativeLabel = { id: number; name: string };
type LabelComparison = { matched: boolean; observed: NativeLabel[]; expected: { requested: string; id: number | null; canonical: string | null }[] };
function nativeLabels(value: unknown): NativeLabel[] {
  if (!Array.isArray(value)) throw Error("incomplete native labels");
  const labels = value.map(item => { const label = record(item); return { id: positive(label.id), name: text(label.name) }; });
  if (new Set(labels.map(label => label.id)).size !== labels.length || new Set(labels.map(label => label.name)).size !== labels.length)
    throw Error("duplicate native labels");
  return labels.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}
function labelNames(value: unknown): string[] { return nativeLabels(value).map(label => label.name); }
function repositoryLabel(value: unknown): NativeLabel {
  const label = record(value);
  if (typeof label.color !== "string" || !/^[a-f0-9]{6}$/iu.test(label.color) || typeof label.default !== "boolean")
    throw Error("incomplete repository label");
  return { id: positive(label.id), name: text(label.name) };
}
class IssueEvidenceConflict extends Error {
  constructor(readonly lookup: Record<string, unknown>) { super("published issue evidence changed"); }
}

function submittedFields(value: unknown) {
  const item = record(value);
  if (typeof item.body !== "string" || typeof item.draft !== "boolean") throw Error("incomplete native PR payload");
  return { title: text(item.title), body: item.body, labels: labelNames(item.labels), draft: item.draft };
}
function reviewedLabels(value: unknown): string[] {
  if (!Array.isArray(value)) throw Error("invalid reviewed labels");
  return value.map(text).sort();
}
function expectedFields(effect: Effect) {
  const p = effect.payload;
  return { title: p.title, body: p.body, labels: reviewedLabels(p.labels), draft: p.draft };
}
function updateTransitions(effect: Effect) {
  const p = effect.payload, original = record(p.expected_payload);
  if (Object.keys(original).sort().join(",") !== "body,draft,labels,title" || typeof original.body !== "string"
    || typeof original.draft !== "boolean" || !Array.isArray(original.labels)) throw Error("missing original PR payload");
  const source = { title: text(original.title), body: original.body, labels: original.labels.map(text).sort(), draft: original.draft };
  if (sha256(canonicalJSON(source)) !== p.expected_payload_sha256) throw Error("original PR payload changed");
  const target = expectedFields(effect);
  return [source, { ...source, title: target.title, body: target.body },
    { ...source, title: target.title, body: target.body, labels: target.labels }];
}
function same(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }

/** Fixed native destinations, explicit credentials and owned subprocess groups. No collector selector. */
export function createNativeTransport(options: {
  settings: Settings; object_store: OwnedObjectStore; artifact_root: string; source_repo: string;
  credential: string; path?: string; timeout_ms?: number;
}): PublicationTransport {
  const { settings, object_store: store } = options;
  requireOwnedStore(store, settings.repository);
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  if (!options.credential || /[\r\n\0]/u.test(options.credential)) throw Error("missing selected publication credential");
  const environment = {
    PATH: options.path ?? process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME,
    LANG: "C", LC_ALL: "C", GH_TOKEN: options.credential, GH_HOST: settings.hostname, GH_PROMPT_DISABLED: "1",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };
  const reader = createGitHubReader(settings.hostname, { inherit_env: false, env: environment, timeout_ms: options.timeout_ms ?? 30000 });
  const repository = createRepositoryReader(reader, settings.repository);
  const prefix = "repos/" + settings.repository;

  let contentsObserved = false;
  function getRef(ref: string): RefObservation {
    try { return { state: "present", object: repository.ref(ref).sha }; }
    catch (error) {
      if (error instanceof GitHubReadError && error.status === 404 && contentsObserved) return { state: "absent" };
      throw error;
    }
  }
  function list(endpoint: string): unknown[] {
    const page = reader.pages(endpoint, { repositoryId: repository.repository().id });
    if (!page.complete) throw Error("incomplete native publication collection");
    return page.items;
  }
  function labelsMatch(value: unknown, expected: string[], comparisons?: LabelComparison[]): boolean {
    const actual = nativeLabels(value);
    if (same(actual.map(label => label.name), expected)) return true;
    if (actual.length === 0 || expected.length === 0) return false;
    const resolved = new Map<string, NativeLabel | null>();
    const identity = (name: string): NativeLabel | null => {
      if (resolved.has(name)) return resolved.get(name) ?? null;
      let label = actual.find(item => item.name === name) ?? null;
      if (!label) {
        try { label = repositoryLabel(reader.get(`${prefix}/labels/${encodeURIComponent(name).replaceAll(".", "%2E")}`)); }
        catch (error) {
          if (!(error instanceof GitHubReadError) || error.status !== 404) throw error;
          // Contents visibility does not establish label-read permission. Require the complete label surface.
          const labels = list(`${prefix}/labels?per_page=100`).map(repositoryLabel);
          nativeLabels(labels);
          label = labels.find(item => item.name === name) ?? null;
        }
      }
      resolved.set(name, label);
      return label;
    };
    const expectedLabels = expected.map(requested => { const label = identity(requested);
      return { requested, id: label?.id ?? null, canonical: label?.name ?? null }; });
    const expectedIds = [...new Set(expectedLabels.map(label => label.id))].sort((left, right) => Number(left) - Number(right));
    const matched = expectedLabels.every(label => label.id !== null)
      && same(actual.map(label => label.id).sort((left, right) => left - right), expectedIds);
    comparisons?.push({ observed: actual, expected: expectedLabels, matched });
    return matched;
  }
  function fieldsMatch(value: unknown, expected: ReturnType<typeof expectedFields>, comparisons?: LabelComparison[]): boolean {
    const actual = submittedFields(value);
    return same({ ...actual, labels: [] }, { ...expected, labels: [] }) && labelsMatch(record(value).labels, expected.labels, comparisons);
  }
  function ownedActor(input: unknown, plan: SealedPlan): boolean {
    const identity = actor(input);
    return identity.actor === plan.manifest.actor && identity.actor_id === plan.manifest.actor_id;
  }
  function pull(number: number, plan: SealedPlan, requireOwner = true, requireBase = true) {
    const input = record(reader.get(`${prefix}/pulls/${positive(number)}`));
    if (positive(input.number) !== number || (requireOwner && !ownedActor(input.user, plan))) throw Error("foreign native PR");
    const base = record(input.base), head = record(input.head);
    if (positive(record(base.repo).id) !== plan.manifest.repository_id || (requireBase && text(base.ref) !== settings.publication.base)) throw Error("native PR destination changed");
    if (requireOwner && (positive(record(head.repo).id) !== plan.manifest.repository_id || !text(head.ref).startsWith(settings.publication.branch_prefix))) throw Error("foreign native PR branch");
    if (input.state !== "open" && input.state !== "closed") throw Error("unknown native PR state");
    return { input, head: text(head.sha), branch: text(head.ref) };
  }
  function headRepository(pr: { input: Record<string, unknown> }): number | null {
    const selected = record(pr.input.head).repo;
    return selected === null ? null : positive(record(selected).id);
  }
  function pullInventory(items: unknown[]) {
    const seen = new Set<number>();
    return items.map(value => {
      const item = record(value), number = positive(item.number);
      if (seen.has(number)) throw Error("duplicate native PR inventory number");
      seen.add(number);
      if (item.body !== null && typeof item.body !== "string") throw Error("incomplete native PR body");
      return { number, body_sha256: sha256(canonicalJSON(item.body)), actor: actor(item.user) };
    });
  }
  function mutablePull(effect: Effect, plan: SealedPlan) {
    const pr = pull(positive(effect.payload.number), plan, effect.kind !== "pr-close");
    if (pr.input.state !== "open" || pr.head !== effect.payload.expected_head) throw Error("native mutable PR target changed");
    if (effect.kind === "pr-update" && !updateTransitions(effect).some(fields => fieldsMatch(pr.input, fields))) throw Error("native mutable PR payload changed");
    return pr;
  }
  function observed(input: unknown, resourceId: string | null, object: string | null): EffectObservation {
    return { state: "done", outcome: { state: "observed", observation_sha256: sha256(canonicalJSON(input)), resource_id: resourceId, object } };
  }
  function markerMatches(value: unknown, plan: SealedPlan, effect: Effect): boolean {
    return typeof value === "string" && value.includes(publicationMarker(settings, plan.manifest.operation_id)) && value.includes(effectMarker(effect.id));
  }
  function creationCandidates(items: unknown[], plan: SealedPlan, effect: Effect) {
    const prior = effect.payload.prior_ids;
    if (!Array.isArray(prior)) throw Error("missing pre-review native inventory");
    const baseline = new Set(prior.map(positive));
    const candidates: Record<string, unknown>[] = [];
    const seen = new Set<number>();
    for (const value of items) {
      const item = record(value), nativeId = positive(item.id);
      if (seen.has(nativeId)) throw Error("incomplete duplicate native inventory");
      seen.add(nativeId);
      if (markerMatches(item.body, plan, effect)) {
        if (baseline.has(nativeId)) return { candidates, conflict: true };
        candidates.push(item);
      }
    }
    return { candidates, conflict: false };
  }

  function inventoryEvidence(items: unknown[]) {
    return items.map(value => {
      const item = record(value);
      if (item.body !== null && typeof item.body !== "string") throw Error("incomplete native resource body");
      return { id: positive(item.id), actor: actor(item.user), body_sha256: sha256(canonicalJSON(item.body)),
        is_pull_request: Object.hasOwn(item, "pull_request") };
    });
  }
  function checkIssueEvidence(effect: Effect): void {
    const p = effect.payload;
    const name = text(p.evidence_repository), path = protocolPath(p.evidence_path), commit = text(p.evidence_commit);
    const evidence = createRepositoryReader(reader, name), parts = path.split("/");
    function changed(reason: string, observed: unknown = null): never {
      throw new IssueEvidenceConflict({ repository: name, path, commit, expected_sha256: p.evidence_sha256, reason, observed });
    }
    try {
      let tree = evidence.commit(commit).tree_sha;
      for (const [index, part] of parts.entries()) {
        const entry = evidence.tree(tree).entries.find(entry => entry.path === part);
        if (!entry) changed("path-absent", { parent_tree: tree, part });
        if (index < parts.length - 1) {
          if (entry.type !== "tree" || entry.mode !== "040000") changed("non-directory-parent", { type: entry.type, mode: entry.mode });
          tree = entry.sha;
        } else {
          if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) changed("nonregular-evidence", { type: entry.type, mode: entry.mode });
          const actual = sha256(evidence.blob(entry.sha, settings.reports.max_entry_bytes));
          if (actual !== p.evidence_sha256) changed("digest-mismatch", { sha256: actual });
        }
      }
    } catch (error) {
      if (!(error instanceof GitHubReadError) || error.status !== 404) throw error;
      // A hidden repository or lost permission also returns 404. Establish fresh contents access first.
      if (name.toLowerCase() === settings.repository) evidence.commit(store.source_commit);
      else {
        const visible = evidence.repository(), head = evidence.ref("refs/heads/" + visible.default_branch);
        evidence.commit(head.sha);
      }
      changed("object-absent", { status: 404 });
    }
    const permalink = `https://${settings.hostname}/${name}/blob/${commit}/${parts.map(encodeURIComponent).join("/")}`;
    if (!text(p.body).includes(permalink)) changed("missing-evidence-permalink");
  }
  async function run(plan: SealedPlan, argv: string[], input: Uint8Array | null, delivery: NativeDelivery, protocol?: { protocol: "http" } | { protocol: "git"; updates: RejectedUpdate[] }): Promise<void> {
    const id = randomUUID(), directory = join(root, "native-command-" + id);
    writeFileSync(join(root, id + ".native-command.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-native-command", operation_id: plan.manifest.operation_id,
      root: directory, effect_id: delivery.effect_id, attempt_id: delivery.attempt_id, argv_sha256: sha256(canonicalJSON(argv)) }), { flag: "wx", mode: 0o600 });
    mkdirSync(directory, { mode: 0o700 });
    const stdout = join(directory, "stdout"), stderr = join(directory, "stderr");
    for (const file of [stdout, stderr]) writeFileSync(file, "", { flag: "wx", mode: 0o600 });
    const command = [...argv];
    if (input !== null) {
      const payload = join(directory, "payload.json");
      writeFileSync(payload, input, { flag: "wx", mode: 0o600 });
      command.push("--input", payload);
    }
    const result = await executeOwnedProcess({ argv: command, cwd: store.root, env: Object.fromEntries(Object.entries(gitEnvironment(environment)).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      watched_outputs: [], stdout, stderr, timeout_ms: options.timeout_ms ?? 30000,
      started: pid => { delivery.sent = true; delivery.reaped = false; writeFileSync(join(directory, "started.json"), canonicalJSON({ pid }), { flag: "wx", mode: 0o600 }); } });
    delivery.reaped = result.reaped;
    writeFileSync(join(directory, "process.json"), canonicalJSON(result), { flag: "wx", mode: 0o600 });
    if (result.exit_code !== 0 || !result.reaped || result.timed_out || result.cancelled !== null || result.output_limit) {
      if (protocol && delivery.attempt_id !== null && delivery.completed_commands === 0 && delivery.effect.kind !== "pr-update") {
        try {
          delivery.rejection = retainRejection({ artifact_root: root, source_repo: options.source_repo, plan,
            effect: delivery.effect, attempt_id: delivery.attempt_id, command_directory: directory, protocol });
        } catch { /* An incomplete or ambiguous response supplies no rejection proof. */ }
      }
      throw Error("native publication command incomplete; inspect owned artifacts");
    }
    delivery.completed_commands++;
  }
  async function mutation(plan: SealedPlan, method: string, endpoint: string, input: unknown, delivery: NativeDelivery): Promise<void> {
    if (!endpoint.startsWith(prefix + "/")) throw Error("foreign mutation destination");
    await run(plan, ["gh", "api", "--hostname", settings.hostname, "--method", method, "--include", "--jq", "empty", endpoint], canonicalJSON(input), delivery, { protocol: "http" });
  }
  async function pushRef(plan: SealedPlan, ref: string, head: string | null, expected: string, delivery: NativeDelivery, companion?: { ref: string; head: string; expected: string }): Promise<void> {
    requireOwnedStore(store, settings.repository);
    const updates = [{ ref, head, expected }, ...(companion ? [companion] : [])];
    const argv = gitReadArguments(["--no-lazy-fetch", "--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=",
      "-c", "credential.helper=!gh auth git-credential", "-c", "http.extraHeader=", "push", "--porcelain", ...(companion ? ["--atomic"] : []), ...updates.map(update => `--force-with-lease=${update.ref}:${update.expected}`),
      "--", `https://${settings.hostname}/${settings.repository}.git`, ...updates.map(update => `${update.head ?? ""}:${update.ref}`)]);
    await run(plan, argv, null, delivery, { protocol: "git", updates });
  }

  return {
    kind: "native", object_store: store.root, artifact_root: root,
    async identity() {
      const repo = repository.repository();
      // A visible immutable source commit establishes contents-read capability before ref absence.
      repository.commit(store.source_commit);
      contentsObserved = true;
      const response = Bun.spawnSync(["gh", "api", "--hostname", settings.hostname, "--method", "POST", "graphql", "-f",
        "query=query { viewer { login databaseId } }"], { env: environment, stdout: "pipe", stderr: "pipe", timeout: options.timeout_ms ?? 30000 });
      if (response.exitCode !== 0) throw Error("native authenticated viewer unavailable");
      const envelope = record(JSON.parse(response.stdout.toString()) as unknown);
      if (Object.hasOwn(envelope, "errors") && (!Array.isArray(envelope.errors) || envelope.errors.length !== 0)) throw Error("native viewer query incomplete");
      const viewer = record(record(envelope.data).viewer);
      return { repository: repo.full_name.toLowerCase(), repository_id: repo.id, default_branch: text(repo.default_branch),
        actor: text(viewer.login), actor_id: positive(viewer.databaseId) };
    },
    async ref(ref) { return getRef(ref); },
    async readPlanObject(object) {
      const commit = repository.commit(object), tree = repository.tree(commit.tree_sha, 2);
      if (commit.parents.length !== 0 || tree.entries.length !== 1 || tree.entries[0].path !== "plan.json"
        || tree.entries[0].mode !== "100644" || tree.entries[0].type !== "blob") throw Error("invalid retained operation metadata object");
      const blob = tree.entries[0].sha, bytes = repository.blob(blob, settings.reports.max_entry_bytes);
      return { bytes, objects: { object, tree: commit.tree_sha, blob, plan_sha256: sha256(bytes) } };
    },
    async observe(plan, effect, objects) {
      const p = effect.payload;
      const requestStart = reader.trace().length;
      const comparisons: LabelComparison[] = [];
      try {
        const absent = (lookup: unknown): EffectObservation => ({ state: "absent", evidence: retainAbsence({
          artifact_root: root, source_repo: options.source_repo, plan, effect, transport: "native", lookup: { result: lookup, label_comparisons: comparisons, requests: reader.trace().slice(requestStart) },
        }) });
        const conflicted = (reason: string, lookup: unknown): EffectObservation => ({ state: "conflict", reason,
          evidence: retainLookup({ artifact_root: root, source_repo: options.source_repo, plan, effect, transport: "native",
            state: "conflict", lookup: { reason, result: lookup, label_comparisons: comparisons, requests: reader.trace().slice(requestStart) } }) });
        const observedLabels = (input: unknown, resourceId: string, object: string | null): EffectObservation => {
          if (comparisons.length === 0) return observed(input, resourceId, object);
          const lookup = retainLookup({ artifact_root: root, source_repo: options.source_repo, plan, effect, transport: "native", state: "done",
            lookup: { resource_sha256: sha256(canonicalJSON(input)), label_comparisons: comparisons, requests: reader.trace().slice(requestStart) } });
          return { state: "done", outcome: { state: "observed", observation_sha256: lookup.sha256, resource_id: resourceId, object, lookup } };
        };
        if (["lease-acquire", "receipt-retain", "lease-release", "push", "branch-refresh"].includes(effect.kind)) {
          const target = getRef(text(p.ref));
          if (effect.kind === "push" && (target.state === "absent" || target.object !== p.head)) {
            const owner = settings.repository.split("/")[0], branch = text(p.ref).slice("refs/heads/".length);
            const candidates = list(`${prefix}/pulls?state=all&head=${encodeURIComponent(owner + ":" + branch)}&per_page=100`);
            for (const value of candidates) {
              const candidate = record(value);
              if (!ownedActor(candidate.user, plan)) continue;
              const pr = pull(positive(candidate.number), plan, false, false);
              if (headRepository(pr) === plan.manifest.repository_id && pr.branch === branch && pr.head === p.head) return observed(pr.input, text(p.ref), pr.head);
            }
          }
          if (effect.kind === "branch-refresh") {
            const pr = pull(positive(p.number), plan, false, false);
            if (!ownedActor(pr.input.user, plan) || headRepository(pr) !== plan.manifest.repository_id
              || !pr.branch.startsWith(settings.publication.branch_prefix)) return conflicted("native-refresh-scope-changed", { number: p.number, head: pr.head, branch: pr.branch, state: pr.input.state, actor: actor(pr.input.user) });
            if ("refs/heads/" + pr.branch === p.ref && pr.head === p.head) return observed(pr.input, text(p.ref), pr.head);
            if (text(record(pr.input.base).ref) !== settings.publication.base || pr.input.state !== "open" || "refs/heads/" + pr.branch !== p.ref || target.state !== "present") return conflicted("native-refresh-scope-changed", { ref: p.ref, target, number: p.number, head: pr.head, branch: pr.branch, state: pr.input.state });
            if (target.object === p.head && pr.head === p.expected_head) return { state: "unknown", reason: "native-PR-head-sync-pending" };
            if (pr.head !== target.object) return conflicted("native-refresh-scope-changed", { ref: p.ref, target, number: p.number, head: pr.head, branch: pr.branch, state: pr.input.state });
          }
          const expected = effect.kind === "push" || effect.kind === "branch-refresh" ? text(p.head)
            : effect.kind === "receipt-retain" ? objects.receipt_object ?? objects.object : objects.lease_object ?? objects.object;
          if (effect.kind === "lease-release") {
            if (target.state === "absent") return observed({ ref: p.ref, state: "absent" }, text(p.ref), null);
            if (target.object === expected) return absent({ ref: p.ref, target });
            if (objects.lease_object && objects.lease_object !== objects.object)
              return observed({ ref: p.ref, state: "not-owned", object: target.object }, text(p.ref), target.object);
            return conflicted("foreign-lease-object", { ref: p.ref, target });
          }
          if (target.state === "absent") return absent({ ref: p.ref, target });
          if (target.object === expected) return observed({ ref: p.ref, object: target.object }, text(p.ref), target.object);
          if (effect.kind === "branch-refresh" && target.object === p.expected_head) return absent({ ref: p.ref, target });
          return conflicted("native-ref-changed", { ref: p.ref, target });
        }
        if (effect.kind === "pr-create") {
          const owner = settings.repository.split("/")[0];
          const candidates = list(`${prefix}/pulls?state=all&head=${encodeURIComponent(owner + ":" + text(p.branch))}&per_page=100`);
          if (candidates.length === 0) return absent({ candidates });
          const inventory = pullInventory(candidates);
          const matches = candidates.map(record).filter(item => markerMatches(item.body, plan, effect));
          if (matches.length !== 1) return conflicted("ambiguous-or-changed-native-PR", { candidates: inventory });
          const candidate = matches[0], pr = pull(positive(candidate.number), plan, false, false);
          const actual = submittedFields(pr.input), expected = expectedFields(effect);
          if (!ownedActor(pr.input.user, plan) || headRepository(pr) !== plan.manifest.repository_id
            || !pr.branch.startsWith(settings.publication.branch_prefix) || pr.head !== plan.manifest.bindings.candidate_commit || pr.branch !== p.branch) return conflicted("native-PR-payload-changed", { number: p.number ?? pr.input.number, head: pr.head, branch: pr.branch, payload_sha256: sha256(canonicalJSON(actual)) });
          if (!fieldsMatch(pr.input, expected, comparisons)) {
            if (actual.labels.length === 0 && same({ ...actual, labels: expected.labels }, expected))
              return { state: "unknown", reason: "native-PR-labels-incomplete" };
            return conflicted("native-PR-payload-changed", { number: p.number ?? pr.input.number, head: pr.head, branch: pr.branch, payload_sha256: sha256(canonicalJSON(actual)) });
          }
          return observedLabels(pr.input, String(candidate.number), pr.head);
        }
        if (effect.kind === "pr-update" || effect.kind === "pr-close") {
          const pr = pull(positive(p.number), plan, false, false);
          if (effect.kind === "pr-update" && (!ownedActor(pr.input.user, plan) || headRepository(pr) !== plan.manifest.repository_id
            || !pr.branch.startsWith(settings.publication.branch_prefix))) return conflicted("native-PR-owner-changed", { number: p.number, head: pr.head, branch: pr.branch, state: pr.input.state, actor: actor(pr.input.user) });
          if (pr.head !== p.expected_head) return conflicted("native-PR-head-changed", { number: p.number, head: pr.head, branch: pr.branch, state: pr.input.state });
          if (effect.kind === "pr-close" && pr.input.state === "closed") return observed(pr.input, String(p.number), pr.head);
          if (effect.kind === "pr-update" && fieldsMatch(pr.input, expectedFields(effect), comparisons)) return observedLabels(pr.input, String(p.number), pr.head);
          const base = text(record(pr.input.base).ref);
          if (base !== settings.publication.base) return conflicted("native-PR-destination-changed", { number: p.number, base, head: pr.head, state: pr.input.state });
          if (effect.kind === "pr-close") return absent({ number: p.number, head: pr.head, branch: pr.branch, state: pr.input.state, actor: actor(pr.input.user) });
          const transitions = updateTransitions(effect);
          return pr.input.state === "open" && transitions.some(fields => fieldsMatch(pr.input, fields, comparisons))
            ? absent({ number: p.number, head: pr.head, branch: pr.branch, state: pr.input.state, actor: actor(pr.input.user),
              source_payload_sha256: sha256(canonicalJSON(submittedFields(pr.input))) }) : conflicted("native-PR-update-source-changed", { number: p.number, head: pr.head, state: pr.input.state, payload_sha256: sha256(canonicalJSON(submittedFields(pr.input))) });
        }
        if (effect.kind === "issue-create") {
          const inventory = list(`${prefix}/issues?state=all&per_page=100`);
          const { candidates, conflict } = creationCandidates(inventory, plan, effect);
          if (conflict) return conflicted("native-issue-baseline-marker-changed", { inventory: inventoryEvidence(inventory) });
          if (candidates.length === 0) {
            try { checkIssueEvidence(effect); }
            catch (error) {
              if (error instanceof IssueEvidenceConflict) return conflicted("native-issue-evidence-changed", error.lookup);
              throw error;
            }
            return absent({ inventory: inventoryEvidence(inventory), candidates });
          }
          if (candidates.length !== 1) return conflicted("ambiguous-native-issue", { inventory: inventoryEvidence(inventory) });
          const issue = candidates[0];
          if (Object.hasOwn(issue, "pull_request") || !ownedActor(issue.user, plan) || issue.title !== p.title || issue.body !== p.body || !labelsMatch(issue.labels, reviewedLabels(p.labels), comparisons)) return conflicted("native-issue-payload-changed", { inventory: inventoryEvidence(inventory) });
          return observedLabels(issue, String(positive(issue.number)), null);
        }
        if (effect.kind === "comment-create") {
          const pr = pull(positive(p.number), plan, false, false);
          const inventory = list(`${prefix}/issues/${p.number}/comments?per_page=100`);
          const { candidates, conflict } = creationCandidates(inventory, plan, effect);
          if (conflict) return conflicted("native-comment-baseline-marker-changed", { inventory: inventoryEvidence(inventory) });
          if (candidates.length === 0) return absent({ inventory: inventoryEvidence(inventory), candidates });
          if (candidates.length !== 1 || !ownedActor(candidates[0].user, plan) || candidates[0].body !== p.body) return conflicted("native-comment-payload-changed", { inventory: inventoryEvidence(inventory) });
          return observed(candidates[0], String(positive(candidates[0].id)), pr.head);
        }
        throw Error("unsupported native effect");
      } catch { return { state: "unknown", reason: "native-publication-observation-unavailable" }; }
    },
    async execute(plan, effect, objects, attempt_id) {
      const delivery: NativeDelivery = { sent: false, reaped: true, effect_id: effect.id, attempt_id: attempt_id ?? null, effect, completed_commands: 0 };
      try {
        const p = effect.payload;
        if (effect.kind === "lease-acquire") {
          const receipt = plan.manifest.effects[1];
          if (plan.manifest.effects[0].id !== effect.id || receipt?.kind !== "receipt-retain"
            || p.ref !== settings.publication.lease_ref || receipt.payload.ref !== settings.publication.receipt_ref_prefix + plan.manifest.operation_id
            || !objects.lease_object || objects.receipt_object !== objects.lease_object || objects.receipt_object === objects.object
            || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(objects.receipt_object)) throw Error("atomic acquisition scope changed");
          const metadata = readGit(store.root, "show", objects.receipt_object + ":plan.json");
          if (!metadata.equals(canonicalJSON(plan))
            || readGit(store.root, "rev-parse", objects.receipt_object + "^{tree}").toString().trim() !== objects.tree
            || readGit(store.root, "rev-list", "--parents", "-n", "1", objects.receipt_object).toString().trim() !== objects.receipt_object) throw Error("atomic metadata object changed");
          await pushRef(plan, text(p.ref), objects.lease_object, "", delivery, { ref: text(receipt.payload.ref), head: objects.receipt_object, expected: "" });
          return;
        }
        if (effect.kind === "receipt-retain") { await pushRef(plan, text(p.ref), objects.receipt_object ?? objects.object, "", delivery); return; }
        if (effect.kind === "lease-release") { await pushRef(plan, text(p.ref), null, objects.lease_object ?? objects.object, delivery); return; }
        if (effect.kind === "push" || effect.kind === "branch-refresh") {
          const tree = readGit(store.root, "rev-parse", "--verify", "--end-of-options", text(p.head) + "^{tree}").toString().trim();
          if (tree !== plan.manifest.bindings.candidate_tree) throw Error("native candidate tree changed");
          await pushRef(plan, text(p.ref), text(p.head), effect.kind === "branch-refresh" ? text(p.expected_head) : "", delivery); return;
        }
        if (effect.kind === "pr-create") {
          if (p.base !== settings.publication.base) throw Error("native PR destination policy changed");
          const branch = getRef("refs/heads/" + text(p.branch));
          if (branch.state !== "present" || branch.object !== plan.manifest.bindings.candidate_commit
            || repository.commit(branch.object).tree_sha !== plan.manifest.bindings.candidate_tree) throw Error("native candidate branch changed");
          const body = join(root, "body-" + randomUUID() + ".md");
          writeFileSync(body, text(p.body), { flag: "wx", mode: 0o600 });
          const argv = ["gh", "pr", "create", "--repo", settings.repository, "--base", text(p.base), "--head", text(p.branch), `--title=${text(p.title)}`, "--body-file", body];
          if (p.draft === true) argv.push("--draft");
          for (const label of p.labels as string[]) argv.push("--label=" + label);
          await run(plan, argv, null, delivery); return;
        }
        if (effect.kind === "pr-update") {
          mutablePull(effect, plan);
          await mutation(plan, "PATCH", `${prefix}/pulls/${positive(p.number)}`, { title: p.title, body: p.body }, delivery);
          mutablePull(effect, plan);
          await mutation(plan, "PUT", `${prefix}/issues/${p.number}/labels`, { labels: p.labels }, delivery);
          const pr = mutablePull(effect, plan);
          if (pr.input.draft !== p.draft) {
            const argv = ["gh", "pr", "ready", String(p.number), "--repo", settings.repository];
            if (p.draft === true) argv.push("--undo");
            await run(plan, argv, null, delivery);
          }
          return;
        }
        if (effect.kind === "issue-create") { checkIssueEvidence(effect); await mutation(plan, "POST", `${prefix}/issues`, { title: p.title, body: p.body, labels: p.labels }, delivery); return; }
        if (effect.kind === "comment-create") { pull(positive(p.number), plan, false); await mutation(plan, "POST", `${prefix}/issues/${positive(p.number)}/comments`, { body: p.body }, delivery); return; }
        if (effect.kind === "pr-close") { mutablePull(effect, plan); await mutation(plan, "PATCH", `${prefix}/pulls/${positive(p.number)}`, { state: "closed" }, delivery); return; }
        throw Error("unsupported native publication effect");
      } catch { throw new PublicationExecutionError(delivery.sent, delivery.reaped, delivery.rejection); }
    },
  };
}
