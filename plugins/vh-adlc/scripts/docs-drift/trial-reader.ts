import { createRepositoryReader, type GitHubReader, type PullRequestInput, type ReadObservation } from "../github-read";
import { readGit } from "./git";
import { readProposalDiff } from "./proposals";
import { loadTrialContext, TRIAL_IDENTITY, type TrialContext } from "./trial-context";
import { readTrialTracker } from "./trial-tracker";

/** Inject at the caller boundary. The production GET-only client and its parsers stay unchanged. */
export function createTrialReader(selected: TrialContext) {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  const prefix = "repos/" + TRIAL_IDENTITY.repository, observations: ReadObservation[] = [];
  function inspect(endpoint: string) {
    loadTrialContext({ root: context.root, context_commit: context.context_commit, runtime_directory: context.root + "/runtime" });
    if (endpoint !== prefix && !endpoint.startsWith(prefix + "/")) throw Error("synthetic read outside fixture repository");
    observations.push({ method: "GET", hostname: "docs-drift.invalid", endpoint,
      started_at: new Date().toISOString(), observed_at: new Date().toISOString(), status: 200 });
    return readTrialTracker(context);
  }
  const reader: GitHubReader = {
    trace: () => observations.map(item => ({ ...item })),
    get(endpoint) {
      const state = inspect(endpoint);
      if (endpoint === prefix) return { id: TRIAL_IDENTITY.repository_id, full_name: TRIAL_IDENTITY.repository, default_branch: TRIAL_IDENTITY.default_branch };
      const pull = new RegExp("^" + prefix + "/pulls/([1-9][0-9]*)$").exec(endpoint);
      if (pull) {
        const resource = state.resources.get("pulls/" + pull[1]);
        if (!resource) throw Error("synthetic PR absent");
        return structuredClone(resource);
      }
      if (endpoint.startsWith(prefix + "/git/ref/heads/")) {
        const ref = "refs/heads/" + endpoint.slice((prefix + "/git/ref/heads/").length).split("/").map(decodeURIComponent).join("/");
        readGit(context.origin, "check-ref-format", ref);
        const sha = readGit(context.origin, "rev-parse", "--verify", "--end-of-options", ref).toString().trim();
        return { ref, object: { type: "commit", sha } };
      }
      throw Error("unsupported synthetic fixture read");
    },
    pages(endpoint, expected = {}) {
      const state = inspect(endpoint);
      if (expected.repositoryId !== undefined && expected.repositoryId !== TRIAL_IDENTITY.repository_id) throw Error("synthetic repository ID changed");
      const pulls = endpoint === prefix + "/pulls?state=open&base=" + encodeURIComponent(TRIAL_IDENTITY.default_branch) + "&per_page=100";
      const comments = new RegExp("^" + prefix + "/issues/([1-9][0-9]*)/comments\\?per_page=100$").exec(endpoint);
      if (!pulls && !comments) throw Error("unsupported synthetic fixture list");
      const items = [...state.resources.entries()].filter(([key, item]) => pulls
        ? key.startsWith("pulls/") && item.state === "open" : key.startsWith("comments/") && item.parent_number === Number(comments![1]))
        .map(([, item]) => structuredClone(item));
      if (expected.key !== undefined || expected.sha !== undefined || expected.max_items !== undefined && items.length > expected.max_items) {
        return { items: [], pages: 1, complete: false, error: { status: null, message: "unsupported or incomplete fixture list bound" } };
      }
      return { items, pages: 1, complete: true };
    },
  };
  return createRepositoryReader(reader, TRIAL_IDENTITY.repository);
}

/** Fetch only from the declared owned bare origin into the recorded owned object store. */
export function fetchTrialProposalObjects(selected: TrialContext, proposal: PullRequestInput) {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  const current = createTrialReader(context).pull(proposal.number);
  if (current.head_sha !== proposal.head_sha || current.base_sha !== proposal.base_sha
    || current.head_repository?.id !== TRIAL_IDENTITY.repository_id || current.base_repository.id !== TRIAL_IDENTITY.repository_id) throw Error("synthetic proposal identity changed");
  readGit(context.store.root, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always", "-c", "gc.auto=0",
    "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--", context.origin, current.head_sha, current.base_sha);
  return readProposalDiff(context.store, current);
}
