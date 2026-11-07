import type { PullRequestInput, RepositoryReader } from "../github-read";
import { collectionReaders, readGit } from "./git";
import { readProposalDiff, requireOwnedStore } from "./proposals";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, sha256, withinPrefix } from "./protocol";
import { readResolutionRecord, resolutionSource, type ResolutionRecord } from "./resolve";
import { readResolutionProposal } from "./resolve-inputs";
import { captureBareSnapshot, captureRepositoryState, readCommittedTree, type OwnedObjectStore, type RequiredInput, type Snapshot } from "./snapshot";
import { loadCommittedSettings, type Settings } from "./settings";

type Reader = Pick<RepositoryReader, "repository" | "mergedPull" | "pull" | "ref" | "trace" | "comments">;
export type ClosureCollection = {
  source_repo: string; store: OwnedObjectStore; settings: Settings; reader: Reader; consolidation_id: number;
  required_inputs: RequiredInput[];
};
type RecordInput = { path: string; sha256: string; blob: string; value: ResolutionRecord };
export type ClosureInputs = {
  complete: boolean; diagnostics: string[]; repository: string; repository_id: number | null;
  current_default: string | null; consolidation: ReturnType<Reader["mergedPull"]> | null; record: RecordInput | null;
  originals: PullRequestInput[]; inputs_sha256: string;
  interval: { base: string; current: string; changed_paths: string[]; material_paths: string[];
    history_sha256: string; required_inputs: RequiredInput[]; required_inputs_changed: boolean } | null;
};

function same(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }
function fail(reason: string): never { throw Error("incomplete closure " + reason); }
function selectedRepository(proposal: PullRequestInput, settings: Settings, id: number): void {
  if (proposal.base_repository.id !== id || proposal.base_repository.full_name.toLowerCase() !== settings.repository
    || proposal.base_ref !== settings.default_branch) fail("proposal repository scope");
}
function nativeShape(proposal: ReturnType<Reader["mergedPull"]>, settings: Settings, id: number): void {
  selectedRepository(proposal, settings, id);
  if (proposal.merged !== true || proposal.state !== "closed" || proposal.merged_at === null || proposal.merge_commit_sha === null || proposal.draft
    || proposal.actor !== settings.publication.actor || proposal.head_repository?.id !== id
    || proposal.head_repository.full_name.toLowerCase() !== settings.repository
    || !proposal.head_ref.startsWith(settings.publication.branch_prefix)) fail("actual merged consolidation identity");
}
function nulPaths(bytes: Buffer): string[] {
  if (bytes.length === 0) return [];
  const values = bytes.toString("binary").split("\0");
  if (values.pop() !== "") fail("complete path inventory");
  return values.map(value => decodeUTF8(Buffer.from(value, "binary"))).sort(compareUTF8);
}
function matchesPostimages(record: ResolutionRecord, snapshot: Snapshot, path: string, digest: string): boolean {
  const stored = snapshot.blobs.find(blob => blob.path === path);
  return stored !== undefined && stored.mode === "100644" && sha256(stored.bytes) === digest
    && record.postimages.every(expected => {
      const actual = snapshot.blobs.find(blob => blob.path === expected.path);
      return expected.after_sha256 === null ? actual === undefined : actual !== undefined
        && actual.mode === expected.after_mode && sha256(actual.bytes) === expected.after_sha256;
    });
}

function locateRecord(options: ClosureCollection, proposal: PullRequestInput, repositoryId: number): RecordInput {
  const { store, settings } = options;
  const candidates: RecordInput[] = [];
  const blobs = readCommittedTree(store.root, proposal.head_sha).filter(blob => withinPrefix(blob.path, settings.publication.resolution_root));
  if (blobs.length > 1000) fail("record inventory processing bound");
  for (const blob of blobs) {
    try {
      if (blob.mode !== "100644" || blob.bytes.length > settings.reports.max_entry_bytes) continue;
      const raw = collectionReaders().yaml(blob.bytes);
      if (raw === null || typeof raw !== "object" || !("assessed_base" in raw) || typeof raw.assessed_base !== "string"
        || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(raw.assessed_base)) continue;
      const historical = loadCommittedSettings(store.root, raw.assessed_base);
      const record = readResolutionRecord(blob.bytes, historical.settings);
      if (record.repository_id !== repositoryId || record.repository !== settings.repository
        || blob.path !== historical.settings.publication.resolution_root + "/" + record.id + ".yaml") continue;
      readGit(store.root, "merge-base", "--is-ancestor", record.assessed_base, proposal.head_sha);
      if (readGit(store.root, "rev-list", "--min-parents=2", record.assessed_base + ".." + proposal.head_sha).length !== 0) continue;
      const changed = nulPaths(readGit(store.root, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z", record.assessed_base, proposal.head_sha, "--"));
      if (!same(changed, [...record.changed_paths, blob.path].sort(compareUTF8))) continue;
      const full = readProposalDiff(store, { ...proposal, base_sha: record.assessed_base });
      if (!full.complete || full.merge_base !== record.assessed_base || full.files.length !== record.changed_paths.length + 1) continue;
      const recordFile = full.files.find(file => file.path === blob.path);
      if (!recordFile || recordFile.status !== "A" || recordFile.before !== null || recordFile.after === null || !recordFile.after.equals(blob.bytes)) continue;
      if (full.files.some(file => file.path !== blob.path && !record.postimages.some(expected => expected.path === file.path
        && expected.before_mode === (file.before === null ? null : file.before_mode)
        && expected.after_mode === (file.after === null ? null : file.after_mode)
        && expected.before_sha256 === (file.before === null ? null : sha256(file.before))
        && expected.after_sha256 === (file.after === null ? null : sha256(file.after))))) continue;
      const assessed = captureBareSnapshot(store.root, record.assessed_base, { required_inputs: record.source.required_inputs });
      if (!same(resolutionSource(assessed), record.source)) continue;
      candidates.push({ path: blob.path, sha256: sha256(blob.bytes), blob: blob.oid, value: record });
    } catch { /* A candidate must satisfy every native object and record check. */ }
  }
  if (candidates.length !== 1) fail("missing ambiguous or differently bound resolve record");
  return candidates[0];
}

/** Collect read-only evidence for a new closure assessment and review. */
export function collectClosureInputs(options: ClosureCollection): ClosureInputs {
  const result: ClosureInputs = { complete: false, diagnostics: [], repository: options.settings.repository, repository_id: null,
    current_default: null, consolidation: null, record: null, originals: [], interval: null, inputs_sha256: "" };
  const before = canonicalDigest(captureRepositoryState(options.source_repo));
  try {
    requireOwnedStore(options.store, options.settings.repository);
    const repository = options.reader.repository();
    if (repository.full_name.toLowerCase() !== options.settings.repository || repository.default_branch !== options.settings.default_branch) fail("native repository changed");
    result.repository_id = repository.id;
    const consolidation = options.reader.mergedPull(options.consolidation_id);
    if (consolidation.number !== options.consolidation_id) fail("native consolidation changed");
    nativeShape(consolidation, options.settings, repository.id);
    result.consolidation = consolidation;
    const mergeCommit = consolidation.merge_commit_sha;
    if (mergeCommit === null) fail("missing actual merge commit");
    const current = options.reader.ref("refs/heads/" + options.settings.default_branch);
    if (current.ref !== "refs/heads/" + options.settings.default_branch) fail("default ref changed");
    result.current_default = current.sha;
    const currentSnapshot = captureBareSnapshot(options.store.root, current.sha, { required_inputs: options.required_inputs });
    if (!same(currentSnapshot.settings, options.settings)) fail("current committed settings changed");
    const merged = mergeCommit === current.sha ? currentSnapshot : captureBareSnapshot(options.store.root, mergeCommit);
    readGit(options.store.root, "merge-base", "--is-ancestor", mergeCommit, current.sha);
    const record = locateRecord(options, consolidation, repository.id);
    result.record = record;
    if (!matchesPostimages(record.value, merged, record.path, record.sha256)
      || !matchesPostimages(record.value, currentSnapshot, record.path, record.sha256)) fail("merged or current postimages changed");
    readGit(options.store.root, "merge-base", "--is-ancestor", record.value.assessed_base, mergeCommit);
    for (const original of record.value.originals) {
      const observed = options.reader.pull(original.number);
      selectedRepository(observed, options.settings, repository.id);
      if (observed.number !== original.number || observed.head_sha !== original.head_sha || sha256(Buffer.from(observed.body)) !== original.body_sha256) fail("original head or body changed");
      const actual = readResolutionProposal(options.store, { ...observed, base_sha: original.base_sha });
      const hunks = actual.hunks.map(({ before_base64, after_base64, ...hunk }) => hunk);
      if (actual.merge_base !== original.merge_base || actual.inputs_sha256 !== original.inputs_sha256
        || actual.diff_sha256 !== original.diff_sha256 || !same(actual.files, original.files) || !same(hunks, original.hunks)) fail("original full Git inputs changed");
      result.originals.push(observed);
    }
    const base = record.value.assessed_base;
    readGit(options.store.root, "merge-base", "--is-ancestor", base, current.sha);
    const changed_paths = nulPaths(readGit(options.store.root, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z", base, current.sha, "--"));
    const readSet = record.value.source.read_set;
    const material_paths = changed_paths.filter(path => readSet.always_paths.includes(path) || readSet.prefixes.some(prefix => withinPrefix(path, prefix)));
    const history = readGit(options.store.root, "log", "--full-history", "--no-show-signature", "--no-notes", "--format=%H%x00%P%x00%at%x00",
      base + ".." + current.sha, "--", ...new Set([...readSet.prefixes, ...readSet.always_paths]));
    if (history.length > 64 * 1024 * 1024) fail("history processing bound");
    result.interval = { base, current: current.sha, changed_paths, material_paths, history_sha256: sha256(history),
      required_inputs: currentSnapshot.required_inputs, required_inputs_changed: !same(record.value.source.required_inputs, currentSnapshot.required_inputs) };
    if (result.originals.some(original => !same(options.reader.pull(original.number), original))) fail("original changed during collection");
    if (!same(options.reader.mergedPull(options.consolidation_id), consolidation)
      || options.reader.ref(current.ref).sha !== current.sha || !same(options.reader.repository(), repository)) fail("native inputs changed during collection");
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Required closure inputs unavailable"); }
  if (canonicalDigest(captureRepositoryState(options.source_repo)) !== before) {
    result.complete = false; result.diagnostics.push("Caller repository changed during closure collection");
  }
  result.inputs_sha256 = canonicalDigest(result);
  return freezeJSON(result);
}

export function recheckClosureInputs(inputs: ClosureInputs, options: ClosureCollection): { fresh: boolean; diagnostics: string[] } {
  const current = collectClosureInputs(options);
  if (!current.complete) return { fresh: false, diagnostics: current.diagnostics };
  if (!same(current, inputs)) return { fresh: false, diagnostics: ["Closure inputs changed"] };
  return { fresh: true, diagnostics: [] };
}
