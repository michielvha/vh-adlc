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
import { executeOwnedProcess } from "./owned-process";
import { externalArtifactDirectory, type OwnedObjectStore } from "./snapshot";
import { requireOwnedStore } from "./proposals";
import { readGit } from "./git";
import type { Settings } from "./settings";
export type PlanObjects = ReturnType<typeof writePlanObject>;
export type RefObservation = { state: "absent" } | { state: "present"; object: string };
export type EffectObservation = { state: "done"; outcome: Outcome } | { state: "absent" } | { state: "unknown" | "conflict"; reason: string };
export type PublicationIdentity = { repository: string; repository_id: number; default_branch: string; actor: string; actor_id: number };

/** The production entry constructs its native transport. Only the separate trial entry injects a collector. */
export interface PublicationTransport {
  kind: "native" | "collector";
  object_store: string;
  identity(): Promise<PublicationIdentity>;
  ref(ref: string): Promise<RefObservation>;
  observe(plan: SealedPlan, effect: Effect, objects: PlanObjects): Promise<EffectObservation>;
  execute(plan: SealedPlan, effect: Effect, objects: PlanObjects): Promise<void>;
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
function labelNames(value: unknown): string[] {
  if (!Array.isArray(value)) throw Error("incomplete native labels");
  const result = value.map(item => text(record(item).name)).sort();
  if (new Set(result).size !== result.length) throw Error("duplicate native labels");
  return result;
}
function submittedFields(value: unknown) {
  const item = record(value);
  if (typeof item.body !== "string" || typeof item.draft !== "boolean") throw Error("incomplete native PR payload");
  return { title: text(item.title), body: item.body, labels: labelNames(item.labels), draft: item.draft };
}
function expectedFields(effect: Effect) {
  const p = effect.payload;
  if (!Array.isArray(p.labels)) throw Error("invalid reviewed labels");
  return { title: p.title, body: p.body, labels: [...p.labels].sort(), draft: p.draft };
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
  function ownedActor(input: unknown, plan: SealedPlan): boolean {
    const identity = actor(input);
    return identity.actor === plan.manifest.actor && identity.actor_id === plan.manifest.actor_id;
  }
  function pull(number: number, plan: SealedPlan, requireOwner = true) {
    const input = record(reader.get(`${prefix}/pulls/${positive(number)}`));
    if (positive(input.number) !== number || (requireOwner && !ownedActor(input.user, plan))) throw Error("foreign native PR");
    const base = record(input.base), head = record(input.head);
    if (positive(record(base.repo).id) !== plan.manifest.repository_id || text(base.ref) !== settings.publication.base) throw Error("native PR destination changed");
    if (requireOwner && (positive(record(head.repo).id) !== plan.manifest.repository_id || !text(head.ref).startsWith(settings.publication.branch_prefix))) throw Error("foreign native PR branch");
    if (input.state !== "open" && input.state !== "closed") throw Error("unknown native PR state");
    return { input, head: text(head.sha), branch: text(head.ref) };
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
    const otherMatches = new Set<string>();
    for (const value of items) {
      const item = record(value), nativeId = positive(item.id), owner = actor(item.user);
      if (markerMatches(item.body, plan, effect)) {
        if (baseline.has(nativeId)) return { candidates, ambiguous: true };
        candidates.push(item); continue;
      }
      // PRs share the issues list but cannot be the result of an issue-create effect.
      if (effect.kind === "issue-create" && Object.hasOwn(item, "pull_request")) continue;
      if (baseline.has(nativeId) || owner.actor_id !== plan.manifest.actor_id) continue;
      const other = plan.manifest.effects.find(other => other.id !== effect.id && other.kind === effect.kind
        && other.payload.body === item.body && (effect.kind !== "comment-create" || other.payload.number === effect.payload.number));
      if (!other || otherMatches.has(other.id)) return { candidates, ambiguous: true };
      otherMatches.add(other.id);
    }
    return { candidates, ambiguous: false };
  }
  function checkIssueEvidence(effect: Effect): void {
    const p = effect.payload;
    const name = text(p.evidence_repository), path = protocolPath(p.evidence_path), commit = text(p.evidence_commit);
    const evidence = createRepositoryReader(reader, name);
    let tree = evidence.commit(commit).tree_sha;
    const parts = path.split("/");
    for (const [index, part] of parts.entries()) {
      const entry = evidence.tree(tree).entries.find(entry => entry.path === part);
      if (!entry) throw Error("published issue evidence absent");
      if (index < parts.length - 1) {
        if (entry.type !== "tree" || entry.mode !== "040000") throw Error("invalid issue evidence path");
        tree = entry.sha;
      } else {
        if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)
          || sha256(evidence.blob(entry.sha, settings.reports.max_entry_bytes)) !== p.evidence_sha256) throw Error("published issue evidence changed");
      }
    }
    const permalink = `https://${settings.hostname}/${name}/blob/${commit}/${parts.map(encodeURIComponent).join("/")}`;
    if (!text(p.body).includes(permalink)) throw Error("reviewed issue body omits bound evidence permalink");
  }
  async function run(plan: SealedPlan, argv: string[], input: Uint8Array | null = null): Promise<void> {
    const id = randomUUID(), directory = join(root, "native-command-" + id);
    writeFileSync(join(root, id + ".native-command.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-native-command", operation_id: plan.manifest.operation_id,
      root: directory, argv_sha256: sha256(canonicalJSON(argv)) }), { flag: "wx", mode: 0o600 });
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
      started: pid => { writeFileSync(join(directory, "started.json"), canonicalJSON({ pid }), { flag: "wx", mode: 0o600 }); } });
    writeFileSync(join(directory, "process.json"), canonicalJSON(result), { flag: "wx", mode: 0o600 });
    if (result.exit_code !== 0 || !result.reaped || result.timed_out || result.cancelled !== null || result.output_limit) throw Error("native publication command incomplete; inspect owned artifacts");
  }
  async function mutation(plan: SealedPlan, method: string, endpoint: string, input: unknown): Promise<void> {
    if (!endpoint.startsWith(prefix + "/")) throw Error("foreign mutation destination");
    await run(plan, ["gh", "api", "--hostname", settings.hostname, "--method", method, endpoint], canonicalJSON(input));
  }
  async function pushRef(plan: SealedPlan, ref: string, head: string | null, expected: string): Promise<void> {
    requireOwnedStore(store, settings.repository);
    const argv = gitReadArguments(["--no-lazy-fetch", "--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=",
      "-c", "credential.helper=!gh auth git-credential", "-c", "http.extraHeader=", "push", "--porcelain", `--force-with-lease=${ref}:${expected}`,
      "--", `https://${settings.hostname}/${settings.repository}.git`, `${head ?? ""}:${ref}`]);
    await run(plan, argv);
  }

  return {
    kind: "native", object_store: store.root,
    async identity() {
      const repo = repository.repository();
      // A visible immutable source commit establishes contents-read capability before ref absence.
      repository.commit(store.source_commit);
      contentsObserved = true;
      const user = actor(reader.get("user"));
      return { repository: repo.full_name.toLowerCase(), repository_id: repo.id, default_branch: text(repo.default_branch), ...user };
    },
    async ref(ref) { return getRef(ref); },
    async observe(plan, effect, objects) {
      const p = effect.payload;
      try {
        if (["lease-acquire", "receipt-retain", "lease-release", "push", "branch-refresh"].includes(effect.kind)) {
          const target = getRef(text(p.ref));
          if (effect.kind === "branch-refresh") {
            const pr = pull(positive(p.number), plan);
            if (pr.input.state !== "open" || "refs/heads/" + pr.branch !== p.ref || target.state !== "present" || pr.head !== target.object) return { state: "conflict", reason: "native-refresh-scope-changed" };
          }
          const expected = effect.kind === "push" || effect.kind === "branch-refresh" ? text(p.head) : objects.object;
          if (effect.kind === "lease-release") {
            if (target.state === "absent") return observed({ ref: p.ref, state: "absent" }, text(p.ref), null);
            return target.object === expected ? { state: "absent" } : { state: "conflict", reason: "foreign-lease-object" };
          }
          if (target.state === "absent") return { state: "absent" };
          if (target.object === expected) return observed({ ref: p.ref, object: target.object }, text(p.ref), target.object);
          if (effect.kind === "branch-refresh" && target.object === p.expected_head) return { state: "absent" };
          return { state: "conflict", reason: "native-ref-changed" };
        }
        if (effect.kind === "pr-create") {
          const owner = settings.repository.split("/")[0];
          const candidates = list(`${prefix}/pulls?state=all&base=${encodeURIComponent(text(p.base))}&head=${encodeURIComponent(owner + ":" + text(p.branch))}&per_page=100`);
          if (candidates.length === 0) return { state: "absent" };
          if (candidates.length !== 1) return { state: "conflict", reason: "ambiguous-native-PR" };
          const candidate = record(candidates[0]), pr = pull(positive(candidate.number), plan);
          if (pr.head !== plan.manifest.bindings.candidate_commit || pr.branch !== p.branch || !same(submittedFields(pr.input), expectedFields(effect))) return { state: "conflict", reason: "native-PR-payload-changed" };
          return observed(pr.input, String(candidate.number), pr.head);
        }
        if (effect.kind === "pr-update" || effect.kind === "pr-close") {
          const pr = pull(positive(p.number), plan, effect.kind !== "pr-close");
          if (pr.head !== p.expected_head) return { state: "conflict", reason: "native-PR-head-changed" };
          if (effect.kind === "pr-close") return pr.input.state === "closed" ? observed(pr.input, String(p.number), pr.head) : { state: "absent" };
          if (same(submittedFields(pr.input), expectedFields(effect))) return observed(pr.input, String(p.number), pr.head);
          return pr.input.state === "open" && sha256(canonicalJSON(submittedFields(pr.input))) === p.expected_payload_sha256
            ? { state: "absent" } : { state: "conflict", reason: "native-PR-update-source-changed" };
        }
        if (effect.kind === "issue-create") {
          checkIssueEvidence(effect);
          const { candidates, ambiguous } = creationCandidates(list(`${prefix}/issues?state=all&per_page=100`), plan, effect);
          if (ambiguous) return { state: "conflict", reason: "native-issue-origin-ambiguous" };
          if (candidates.length === 0) return { state: "absent" };
          if (candidates.length !== 1) return { state: "conflict", reason: "ambiguous-native-issue" };
          const issue = candidates[0];
          if (Object.hasOwn(issue, "pull_request") || !ownedActor(issue.user, plan) || issue.title !== p.title || issue.body !== p.body || !same(labelNames(issue.labels), [...p.labels as string[]].sort())) return { state: "conflict", reason: "native-issue-payload-changed" };
          return observed(issue, String(positive(issue.number)), null);
        }
        if (effect.kind === "comment-create") {
          const pr = pull(positive(p.number), plan, false);
          const { candidates, ambiguous } = creationCandidates(list(`${prefix}/issues/${p.number}/comments?per_page=100`), plan, effect);
          if (ambiguous) return { state: "conflict", reason: "native-comment-origin-ambiguous" };
          if (candidates.length === 0) return { state: "absent" };
          if (candidates.length !== 1 || !ownedActor(candidates[0].user, plan) || candidates[0].body !== p.body) return { state: "conflict", reason: "native-comment-payload-changed" };
          return observed(candidates[0], String(positive(candidates[0].id)), pr.head);
        }
        throw Error("unsupported native effect");
      } catch { return { state: "unknown", reason: "native-publication-observation-unavailable" }; }
    },
    async execute(plan, effect, objects) {
      const p = effect.payload;
      if (effect.kind === "lease-acquire" || effect.kind === "receipt-retain") { await pushRef(plan, text(p.ref), objects.object, ""); return; }
      if (effect.kind === "lease-release") { await pushRef(plan, text(p.ref), null, objects.object); return; }
      if (effect.kind === "push" || effect.kind === "branch-refresh") {
        const tree = readGit(store.root, "rev-parse", "--verify", "--end-of-options", text(p.head) + "^{tree}").toString().trim();
        if (tree !== plan.manifest.bindings.candidate_tree) throw Error("native candidate tree changed");
        await pushRef(plan, text(p.ref), text(p.head), effect.kind === "branch-refresh" ? text(p.expected_head) : ""); return;
      }
      if (effect.kind === "pr-create") {
        const branch = getRef("refs/heads/" + text(p.branch));
        if (branch.state !== "present" || branch.object !== plan.manifest.bindings.candidate_commit
          || repository.commit(branch.object).tree_sha !== plan.manifest.bindings.candidate_tree) throw Error("native candidate branch changed");
        const body = join(root, "body-" + randomUUID() + ".md");
        writeFileSync(body, text(p.body), { flag: "wx", mode: 0o600 });
        const argv = ["gh", "pr", "create", "--repo", settings.repository, "--base", text(p.base), "--head", text(p.branch), `--title=${text(p.title)}`, "--body-file", body];
        if (p.draft === true) argv.push("--draft");
        for (const label of p.labels as string[]) argv.push("--label=" + label);
        await run(plan, argv); return;
      }
      if (effect.kind === "pr-update") {
        await mutation(plan, "PATCH", `${prefix}/pulls/${positive(p.number)}`, { title: p.title, body: p.body });
        await mutation(plan, "PUT", `${prefix}/issues/${p.number}/labels`, { labels: p.labels });
        const pr = pull(positive(p.number), plan);
        if (pr.input.draft !== p.draft) {
          const argv = ["gh", "pr", "ready", String(p.number), "--repo", settings.repository];
          if (p.draft === true) argv.push("--undo");
          await run(plan, argv);
        }
        return;
      }
      if (effect.kind === "issue-create") { checkIssueEvidence(effect); await mutation(plan, "POST", `${prefix}/issues`, { title: p.title, body: p.body, labels: p.labels }); return; }
      if (effect.kind === "comment-create") { await mutation(plan, "POST", `${prefix}/issues/${positive(p.number)}/comments`, { body: p.body }); return; }
      if (effect.kind === "pr-close") { await mutation(plan, "PATCH", `${prefix}/pulls/${positive(p.number)}`, { state: "closed" }); return; }
      throw Error("unsupported native publication effect");
    },
  };
}
