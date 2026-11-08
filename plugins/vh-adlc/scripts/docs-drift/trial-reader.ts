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
export function createTrialReader(selected: TrialContext) {
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
        if (endpoint.startsWith(prefix + "/git/ref/heads/")) {
          const ref = "refs/heads/" + endpoint.slice((prefix + "/git/ref/heads/").length).split("/").map(decodeURIComponent).join("/");
          readGit(context.origin, "check-ref-format", ref);
          const row = readGit(context.origin, "for-each-ref", "--format=%(refname) %(objectname)", "--", ref).toString().trim().split("\n")
            .find(item => item.startsWith(ref + " "));
          if (!row) throw new GitHubReadError(404, "synthetic ref absent");
          const sha = row.slice(ref.length + 1), type = readGit(context.origin, "cat-file", "-t", sha).toString().trim();
          return { ref, object: { type, sha } };
        }
        throw Error("unsupported synthetic fixture read");
      });
    },
    pages(endpoint, expected = {}) {
      try {
        return response(endpoint, state => {
          if (expected.repositoryId !== undefined && expected.repositoryId !== TRIAL_IDENTITY.repository_id) throw Error("synthetic repository ID changed");
          const pulls = endpoint === prefix + "/pulls?state=open&base=" + encodeURIComponent(TRIAL_IDENTITY.default_branch) + "&per_page=100";
          const comments = new RegExp("^" + prefix + "/issues/([1-9][0-9]*)/comments\\?per_page=100$").exec(endpoint);
          if (!pulls && !comments) throw Error("unsupported synthetic fixture list");
          const items = [...state.resources.entries()].filter(([key, item]) => pulls
            ? key.startsWith("pulls/") && item.state === "open" && objectBase(item).ref === TRIAL_IDENTITY.default_branch : key.startsWith("comments/") && item.parent_number === Number(comments![1]))
            .map(([, item]) => structuredClone(item));
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
  return createRepositoryReader(reader, TRIAL_IDENTITY.repository);
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
