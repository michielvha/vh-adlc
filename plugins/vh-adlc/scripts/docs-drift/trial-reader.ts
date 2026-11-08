import { collectClosureInputs } from "./closure-inputs";
import { createRepositoryReader, GitHubReadError, type GitHubReader, type PullRequestInput, type ReadObservation } from "../github-read";
import { readGit } from "./git";
import { readProposalDiff } from "./proposals";
import { loadTrialContext, TRIAL_IDENTITY, type TrialContext } from "./trial-context";
import { readTrialTracker } from "./trial-tracker";

function objectBase(item: Record<string, unknown>): Record<string, unknown> {
  if (!item.base || typeof item.base !== "object" || Array.isArray(item.base)) throw Error("synthetic PR base unavailable");
  return item.base as Record<string, unknown>;
}

/** Inject at the caller boundary. The production GET-only client and its parsers stay unchanged. */
export function createTrialGitHubReader(selected: TrialContext): GitHubReader {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  const prefix = "repos/" + TRIAL_IDENTITY.repository, observations: ReadObservation[] = [];
  function response<T>(endpoint: string, read: (state: ReturnType<typeof readTrialTracker>) => T): T {
    const started = new Date().toISOString();
    let status: number | null = null;
    try {
      loadTrialContext({ root: context.root, context_commit: context.context_commit, runtime_directory: context.root + "/runtime" });
      if (endpoint !== prefix && !endpoint.startsWith(prefix + "/")) throw Error("synthetic read outside fixture repository");
      const value = read(readTrialTracker(context));
      status = 200;
      return value;
    } catch (error) {
      status = error instanceof GitHubReadError ? error.status : null;
      throw new GitHubReadError(status, error instanceof Error ? error.message : "synthetic read unavailable");
    } finally {
      observations.push({ method: "GET", hostname: "docs-drift.invalid", endpoint,
        started_at: started, observed_at: new Date().toISOString(), status });
    }
  }
  const reader: GitHubReader = {
    trace: () => observations.map(item => ({ ...item })),
    get(endpoint) {
      return response(endpoint, state => {
        if (endpoint === prefix) return { id: TRIAL_IDENTITY.repository_id, full_name: TRIAL_IDENTITY.repository, default_branch: TRIAL_IDENTITY.default_branch };
        const pull = new RegExp("^" + prefix + "/pulls/([1-9][0-9]*)$").exec(endpoint);
        if (pull) {
          const resource = state.resources.get("pulls/" + pull[1]);
          if (!resource) throw new GitHubReadError(404, "synthetic PR absent");
          return structuredClone(resource);
        }
        const issue = new RegExp("^" + prefix + "/issues/([1-9][0-9]*)$").exec(endpoint);
        if (issue) {
          const resource = state.resources.get("issues/" + issue[1]);
          if (resource) return structuredClone(resource);
          const pull = state.resources.get("pulls/" + issue[1]);
          if (pull) return { ...structuredClone(pull), pull_request: { url: "https://docs-drift.invalid/" + endpoint } };
          throw new GitHubReadError(404, "synthetic issue absent");
        }
        const label = new RegExp("^" + prefix + "/labels/(.+)$").exec(endpoint);
        if (label) {
          const resource = state.labels.get(decodeURIComponent(label[1]).toLowerCase());
          if (!resource) throw new GitHubReadError(404, "synthetic label absent");
          return { ...resource, color: "000000", default: false };
        }
        if (endpoint.startsWith(prefix + "/git/ref/heads/")) {
          const ref = "refs/heads/" + endpoint.slice((prefix + "/git/ref/heads/").length).split("/").map(decodeURIComponent).join("/");
          readGit(context.origin, "check-ref-format", ref);
          const row = readGit(context.origin, "for-each-ref", "--format=%(refname) %(objectname)", "--", ref).toString().trim().split("\n")
            .find(item => item.startsWith(ref + " "));
          if (!row) throw new GitHubReadError(404, "synthetic ref absent");
          const sha = row.slice(ref.length + 1), type = readGit(context.origin, "cat-file", "-t", sha).toString().trim();
          return { ref, object: { type, sha } };
        }
        const gitObject = new RegExp("^" + prefix + "/git/(commits|trees|blobs)/([a-f0-9]{40}(?:[a-f0-9]{24})?)$").exec(endpoint);
        if (gitObject) {
          const [, kind, sha] = gitObject;
          if (kind === "commits") return { sha, tree: { sha: readGit(context.origin, "rev-parse", sha + "^{tree}").toString().trim() },
            parents: readGit(context.origin, "show", "-s", "--format=%P", sha).toString().trim().split(" ").filter(Boolean).map(sha => ({ sha })),
            message: readGit(context.origin, "show", "-s", "--format=%B", sha).toString() };
          if (kind === "trees") {
            const entries = readGit(context.origin, "ls-tree", "-z", sha).toString().split("\0");
            if (entries.pop() !== "") throw Error("incomplete synthetic tree");
            return { sha, truncated: false, tree: entries.map(entry => {
              const tab = entry.indexOf("\t"), [mode, type, oid] = entry.slice(0, tab).split(" ");
              if (tab < 0) throw Error("malformed synthetic tree entry");
              return { path: entry.slice(tab + 1), mode, type, sha: oid };
            }) };
          }
          const bytes = readGit(context.origin, "cat-file", "blob", sha);
          return { sha, encoding: "base64", content: bytes.toString("base64"), size: bytes.length };
        }
        throw Error("unsupported synthetic fixture read");
      });
    },
    pages(endpoint, expected = {}) {
      try {
        return response(endpoint, state => {
          if (expected.repositoryId !== undefined && expected.repositoryId !== TRIAL_IDENTITY.repository_id) throw Error("synthetic repository ID changed");
          const url = new URL("https://docs-drift.invalid/" + endpoint);
          if (url.searchParams.get("per_page") !== "100" || [...url.searchParams.keys()].some(key => !["per_page", "state", "base", "head"].includes(key))) throw Error("unsupported synthetic list options");
          const pulls = url.pathname === "/" + prefix + "/pulls", issues = url.pathname === "/" + prefix + "/issues";
          const comments = new RegExp("^" + prefix + "/issues/([1-9][0-9]*)/comments\\?per_page=100$").exec(endpoint);
          const labels = url.pathname === "/" + prefix + "/labels";
          if (!pulls && !issues && !comments && !labels) throw Error("unsupported synthetic fixture list");
          const items: unknown[] = labels ? [...state.labels.values()].map(label => ({ ...label, color: "000000", default: false }))
            : [...state.resources.entries()].filter(([key, item]) => {
              if (comments) return key.startsWith("comments/") && item.parent_number === Number(comments[1]);
              if (!(key.startsWith("pulls/") || issues && key.startsWith("issues/"))) return false;
              if (!["open", "closed"].includes(String(item.state))) throw Error("incomplete synthetic resource state");
              if (url.searchParams.get("state") !== "all" && item.state !== url.searchParams.get("state")) return false;
              if (pulls && url.searchParams.has("base") && objectBase(item).ref !== url.searchParams.get("base")) return false;
              if (pulls && url.searchParams.has("head")) {
                const head = item.head as { ref: string; repo: { full_name: string } };
                if (head.repo.full_name.split("/")[0] + ":" + head.ref !== url.searchParams.get("head")) return false;
              }
              return true;
            }).map(([key, item]) => issues && key.startsWith("pulls/")
              ? { ...structuredClone(item), pull_request: { url: "https://docs-drift.invalid/" + prefix + "/pulls/" + item.number } } : structuredClone(item));
          if (expected.key !== undefined || expected.sha !== undefined || expected.max_items !== undefined && items.length > expected.max_items) {
            return { items: [], pages: 1, complete: false, error: { status: null, message: "unsupported or incomplete fixture list bound" } };
          }
          return { items, pages: 1, complete: true };
        });
      } catch (error) {
        return { items: [], pages: 1, complete: false, error: { status: error instanceof GitHubReadError ? error.status : null,
          message: error instanceof Error ? error.message : "synthetic list unavailable" } };
      }
    },
  };
  return reader;
}

export function createTrialReader(selected: TrialContext) {
  return createRepositoryReader(createTrialGitHubReader(selected), TRIAL_IDENTITY.repository);
}

/** Fetch only from the declared owned bare origin into the recorded owned object store. */
export async function fetchTrialProposalObjects(selected: TrialContext, proposal: PullRequestInput) {
  try {
    const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
    const current = createTrialReader(context).pull(proposal.number);
    if (current.head_sha !== proposal.head_sha || current.base_sha !== proposal.base_sha || current.base_ref !== context.settings.default_branch
      || current.head_repository?.id !== TRIAL_IDENTITY.repository_id || current.base_repository.id !== TRIAL_IDENTITY.repository_id
      || current.head_repository.full_name !== TRIAL_IDENTITY.repository || current.base_repository.full_name !== TRIAL_IDENTITY.repository) throw Error("synthetic proposal identity changed");
    const headRef = "refs/heads/" + current.head_ref, baseRef = "refs/heads/" + context.settings.default_branch;
    readGit(context.origin, "check-ref-format", headRef);
    readGit(context.store.root, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always", "-c", "gc.auto=0",
      "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--", context.origin,
      "+" + headRef + ":refs/docs-drift/inputs/pr-" + current.number, "+" + baseRef + ":refs/docs-drift/inputs/default");
    const head = readGit(context.store.root, "rev-parse", "--verify", "refs/docs-drift/inputs/pr-" + current.number + "^{commit}").toString().trim();
    const base = readGit(context.store.root, "rev-parse", "--verify", "refs/docs-drift/inputs/default^{commit}").toString().trim();
    if (head !== current.head_sha || base !== current.base_sha) throw Error("synthetic proposal ref changed during fetch");
    return readProposalDiff(context.store, current);
  } catch {
    return { complete: false, diagnostics: ["Fixed-ref synthetic proposal fetch unavailable or source changed"], base_sha: proposal.base_sha,
      head_sha: proposal.head_sha, merge_base: null, patch_bytes: Buffer.alloc(0), patch_sha256: null, files: [], inputs_sha256: null };
  }
}

/** Read actual committed fixture merge objects through the common fresh-session closure collector. */
export async function collectTrialClosureInputs(selected: TrialContext, consolidationID: number) {
  try {
    const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
    const reader = createTrialReader(context);
    const collection = { source_repo: context.source, store: context.store, settings: context.settings, reader,
      consolidation_id: consolidationID, required_inputs: [] };
    function fetchObjects(ids: string[]): void {
      const wanted = [...new Set(ids)];
      if (!wanted.length || wanted.length > 1000 || wanted.some(id => !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(id))) throw Error("synthetic immutable closure objects required");
      readGit(context.store.root, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always", "-c", "gc.auto=0",
        "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--", context.origin, ...wanted);
      for (const id of wanted) {
        if (readGit(context.store.root, "rev-parse", "--verify", "--end-of-options", id + "^{commit}").toString().trim() !== id) throw Error("synthetic closure object changed");
      }
    }
    function selectedRepository(proposal: PullRequestInput): void {
      if (proposal.head_repository?.id !== TRIAL_IDENTITY.repository_id || proposal.base_repository.id !== TRIAL_IDENTITY.repository_id
        || proposal.head_repository.full_name !== TRIAL_IDENTITY.repository || proposal.base_repository.full_name !== TRIAL_IDENTITY.repository
        || proposal.base_ref !== context.settings.default_branch) throw Error("synthetic closure repository changed");
    }
    const consolidation = reader.mergedPull(consolidationID);
    selectedRepository(consolidation);
    if (!consolidation.merged || consolidation.merge_commit_sha === null) throw Error("synthetic consolidation is not merged");
    fetchObjects([consolidation.head_sha, consolidation.merge_commit_sha, reader.ref("refs/heads/" + context.settings.default_branch).sha]);
    const located = collectClosureInputs(collection);
    if (!located.record) return located;
    for (const original of located.record.value.originals) {
      const proposal = reader.pull(original.number);
      selectedRepository(proposal);
      fetchObjects([proposal.head_sha, original.base_sha]);
    }
    return collectClosureInputs(collection);
  } catch {
    return { complete: false, diagnostics: ["Fixed-object synthetic closure fetch unavailable or inputs changed"] };
  }
}
