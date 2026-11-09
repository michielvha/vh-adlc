import { PublicationScopeChanged } from "./publish";
import { realpathSync } from "node:fs";
import { selectApprovedRuntime } from "./bootstrap";
import { inspectCandidate } from "./preparation";
import { fetchCurrentDefault } from "./proposals";
import { canonicalDigest } from "./protocol";
import { captureBareSnapshot, captureRepositoryState, checkFreshness, externalArtifactDirectory, matchesRepositoryState, type OwnedObjectStore } from "./snapshot";
import { loadCommittedSettings } from "./settings";
import { readNativeContext, type PublicationIdentity } from "./transport";

type PublicationInputs = {
  schema_version: 1; kind: "docs-drift-publication-inputs"; authority: "none"; complete: boolean; scope_changed: boolean; diagnostics: string[];
  source_commit: string; current_default: string | null; identity: PublicationIdentity | null; store: OwnedObjectStore | null;
  candidate: ReturnType<typeof inspectCandidate> | null; freshness: ReturnType<typeof checkFreshness> | null;
  runtime: Awaited<ReturnType<typeof selectApprovedRuntime>> | null;
};

/** Collect current native policy, retained runtime and committed candidate facts. Effect grants follow separately. */
export async function collectPublicationInputs(input: {
  repo: string; source: string; candidate_repo: string; candidate: string; selection: unknown; resolution_record?: { path: string; sha256: string };
  artifact_root: string; owner: string; run: string; credential: string; path?: string;
  object_store?: OwnedObjectStore; cache_directory: string; entry: "hosted" | "copilot" | "claude"; launcher_path: string; settings_path: string;
}): Promise<PublicationInputs> {
  const options = { ...input, object_store: input.object_store ? { ...input.object_store } : undefined, selection: structuredClone(input.selection), resolution_record: structuredClone(input.resolution_record), path: input.path ?? process.env.PATH };
  const result: PublicationInputs = { schema_version: 1, kind: "docs-drift-publication-inputs", authority: "none", complete: false, scope_changed: false, diagnostics: [],
    source_commit: options.source, current_default: null, identity: null, store: null, candidate: null, freshness: null, runtime: null };
  const repo = realpathSync(options.repo), candidateRepo = realpathSync(options.candidate_repo);
  const before = canonicalDigest(captureRepositoryState(repo)), candidateBefore = canonicalDigest(captureRepositoryState(candidateRepo));
  try {
    const root = externalArtifactDirectory(options.artifact_root, repo);
    externalArtifactDirectory(root, candidateRepo);
    externalArtifactDirectory(options.cache_directory, repo);
    externalArtifactDirectory(options.cache_directory, candidateRepo);
    result.candidate = inspectCandidate({ repo, source: options.source, selection: options.selection, candidate_repo: candidateRepo, candidate: options.candidate,
      resolution_record: options.resolution_record, object_store: options.object_store, artifact_root: root, owner: options.owner, run: options.run });
    if (!result.candidate.complete) { result.diagnostics.push(...result.candidate.diagnostics); throw Error("Committed publication candidate incomplete"); }
    const { settings } = loadCommittedSettings(repo, options.source);
    const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path });
    const context = native();
    result.current_default = context.default_commit; result.identity = context.identity;
    if (context.identity.actor.toLowerCase() !== settings.publication.actor.toLowerCase() || context.identity.default_branch !== settings.default_branch)
      throw new PublicationScopeChanged("Selected native publication actor or default differs from assessed policy");
    const store = result.candidate.object_store;
    if (!store) throw Error("Owned candidate objects unavailable");
    result.store = store;
    const environment = { PATH: options.path,
      ...(settings.hostname === "github.com" || settings.hostname.endsWith(".ghe.com") ? { GH_TOKEN: options.credential } : { GH_ENTERPRISE_TOKEN: options.credential }) };
    const fetched = await fetchCurrentDefault(store, { hostname: settings.hostname, repository: settings.repository,
      default_branch: settings.default_branch, expected_default_commit: context.default_commit, environment });
    if (!fetched.complete) { result.diagnostics.push(...fetched.diagnostics); throw Error("Current native default objects unavailable"); }
    result.runtime = await selectApprovedRuntime({ repo, policy_repo: store.root, current_default: context.default_commit, identity: context.identity,
      cache_directory: options.cache_directory, entry: options.entry, launcher_path: options.launcher_path, settings_path: options.settings_path });
    result.freshness = checkFreshness(captureBareSnapshot(store.root, options.source), context.default_commit);
    if (!result.freshness.fresh) throw new PublicationScopeChanged("Assessed publication source needs fresh collection and review");
    const current = native();
    if (current.default_commit !== context.default_commit || canonicalDigest(current.identity) !== canonicalDigest(context.identity))
      throw new PublicationScopeChanged("Native publication source or actor changed during collection");
    result.complete = true;
  } catch (error) { result.scope_changed = error instanceof PublicationScopeChanged; result.diagnostics.push(error instanceof Error ? error.message : "Publication input collection unavailable"); }
  if (!matchesRepositoryState(repo, before) || !matchesRepositoryState(candidateRepo, candidateBefore)) {
    result.complete = false; result.diagnostics.push("Caller changed or became unavailable during publication input collection");
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  return result;
}
