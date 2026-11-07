import type { PullRequestInput, RepositoryReader } from "../github-read";
import { readGit } from "./git";
import { readProposalDiff, requireOwnedStore, type ProposalFile } from "./proposals";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import type { OwnedObjectStore, Snapshot } from "./snapshot";

type Range = { start: number; end: number };
export type ResolutionHunk = {
  id: string; path: string; kind: "text" | "binary" | "metadata";
  before_range: Range; after_range: Range; before_mode: string; after_mode: string;
  before_sha256: string | null; after_sha256: string | null;
  before_base64: string | null; after_base64: string | null;
};
export type ResolutionFile = {
  path: string; status: string; before_mode: string; after_mode: string;
  before_sha256: string | null; after_sha256: string | null;
};
export type ResolutionProposal = {
  number: number; head_sha: string; base_sha: string; merge_base: string; body_sha256: string;
  metadata_sha256: string; diff_sha256: string; inputs_sha256: string; binding_sha256: string;
  files: ResolutionFile[]; hunks: ResolutionHunk[];
};
export type ResolutionInputs = {
  repository: string; repository_id: number | null; default_branch: string; source_commit: string; selected: number[];
  complete: boolean; proposals: ResolutionProposal[]; diagnostics: string[]; inputs_sha256: string;
};
type Reader = Pick<RepositoryReader, "repository" | "pull" | "trace">;
export type ResolutionCollection = { snapshot: Snapshot; store: OwnedObjectStore; reader: Reader; selected: number[] };

function metadata(proposal: PullRequestInput) {
  return {
    number: proposal.number, state: proposal.state, merged_at: proposal.merged_at,
    actor: proposal.actor, actor_id: proposal.actor_id, actor_type: proposal.actor_type,
    head_sha: proposal.head_sha, head_ref: proposal.head_ref, head_repository: proposal.head_repository,
    base_sha: proposal.base_sha, base_ref: proposal.base_ref, base_repository: proposal.base_repository,
    body_sha256: sha256(Buffer.from(proposal.body)), draft: proposal.draft,
  };
}
function textBytes(bytes: Buffer | null): boolean {
  if (bytes === null) return true;
  try { decodeUTF8(bytes); return !bytes.includes(0); } catch { return false; }
}
function hunk(file: ProposalFile, kind: ResolutionHunk["kind"], beforeRange: Range, afterRange: Range,
  before: Buffer | null, after: Buffer | null): ResolutionHunk {
  const binding = { path: file.path, kind, before_range: beforeRange, after_range: afterRange,
    before_mode: file.before_mode, after_mode: file.after_mode,
    before_sha256: before === null ? null : sha256(before), after_sha256: after === null ? null : sha256(after) };
  return { id: "hunk-" + canonicalDigest(binding), ...binding,
    before_base64: before === null ? null : before.toString("base64"), after_base64: after === null ? null : after.toString("base64") };
}
function byteRange(bytes: Buffer | null, start: number, count: number): Range {
  const source = bytes ?? Buffer.alloc(0), offsets = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === 10) offsets.push(index + 1);
  if (offsets.at(-1) !== source.length) offsets.push(source.length);
  const first = count === 0 ? start : start - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || first < 0 || count < 0
    || first + count >= offsets.length) throw Error("invalid complete hunk range");
  return { start: offsets[first], end: offsets[first + count] };
}
function fileHunks(store: OwnedObjectStore, mergeBase: string, head: string, file: ProposalFile): ResolutionHunk[] {
  const beforeLength = file.before?.length ?? 0, afterLength = file.after?.length ?? 0;
  if (!textBytes(file.before) || !textBytes(file.after)) return [hunk(file, "binary",
    { start: 0, end: beforeLength }, { start: 0, end: afterLength }, file.before, file.after)];
  const patch = readGit(store.root, "diff", "--text", "--unified=0", "--no-color", "--no-renames", "--no-ext-diff", "--no-textconv",
    mergeBase, head, "--", file.path);
  if (patch.length > 64 * 1024 * 1024) throw Error("hunk processing bound exceeded");
  const text = decodeUTF8(patch);
  const headers = [...text.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n/gmu)];
  const result: ResolutionHunk[] = [];
  for (const [index, header] of headers.entries()) {
    const oldCount = header[2] === undefined ? 1 : Number(header[2]);
    const newCount = header[4] === undefined ? 1 : Number(header[4]);
    const oldRange = byteRange(file.before, Number(header[1]), oldCount);
    const newRange = byteRange(file.after, Number(header[3]), newCount);
    const body = text.slice(header.index + header[0].length, headers[index + 1]?.index ?? text.length);
    const before: string[] = [], after: string[] = [];
    let oldLines = 0, newLines = 0, previous = "";
    for (const line of body.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
      const marker = line[0];
      if (marker === "\\") {
        if (line !== "\\ No newline at end of file\n" || !["-", "+", " "].includes(previous)) throw Error("invalid newline marker");
        if (previous !== "+") before[before.length - 1] = before.at(-1)!.replace(/\n$/u, "");
        if (previous !== "-") after[after.length - 1] = after.at(-1)!.replace(/\n$/u, "");
        previous = marker;
        continue;
      }
      if (!["-", "+", " "].includes(marker)) throw Error("omitted or malformed hunk body");
      if (marker !== "+") { before.push(line.slice(1)); oldLines += 1; }
      if (marker !== "-") { after.push(line.slice(1)); newLines += 1; }
      previous = marker;
    }
    const oldBytes = Buffer.from(before.join("")), newBytes = Buffer.from(after.join(""));
    if (oldLines !== oldCount || newLines !== newCount
      || !oldBytes.equals((file.before ?? Buffer.alloc(0)).subarray(oldRange.start, oldRange.end))
      || !newBytes.equals((file.after ?? Buffer.alloc(0)).subarray(newRange.start, newRange.end))) throw Error("incomplete hunk content");
    result.push(hunk(file, "text", oldRange, newRange, oldBytes, newBytes));
  }
  if (file.before_mode !== file.after_mode) result.push(hunk(file, "metadata",
    { start: 0, end: beforeLength }, { start: 0, end: afterLength }, file.before, file.after));
  if (result.length === 0) throw Error("changed file has no complete hunk or metadata unit");
  return result;
}

/** Derive one complete immutable proposal using the shared Git inventory and hunk reader. */
export function readResolutionProposal(store: OwnedObjectStore, proposal: PullRequestInput): ResolutionProposal {
  const diff = readProposalDiff(store, proposal);
  const mergeBase = diff.merge_base;
  if (!diff.complete || !mergeBase || !diff.patch_sha256 || !diff.inputs_sha256) throw Error("incomplete selected full diff");
  const files = diff.files.map(file => ({ path: file.path, status: file.status, before_mode: file.before_mode, after_mode: file.after_mode,
    before_sha256: file.before === null ? null : sha256(file.before), after_sha256: file.after === null ? null : sha256(file.after) }));
  const hunks = diff.files.flatMap(file => fileHunks(store, mergeBase, diff.head_sha, file));
  if (new Set(hunks.map(hunk => hunk.id)).size !== hunks.length) throw Error("repeated complete hunk identity");
  const binding = { number: proposal.number, head_sha: proposal.head_sha, base_sha: proposal.base_sha, merge_base: mergeBase,
    body_sha256: sha256(Buffer.from(proposal.body)), metadata_sha256: canonicalDigest(metadata(proposal)),
    diff_sha256: diff.patch_sha256, inputs_sha256: diff.inputs_sha256, files, hunks };
  return { ...binding, binding_sha256: canonicalDigest(binding) };
}

/** Derive every selected unit from complete owned Git objects, never optional REST patches. */
export function collectResolutionInputs(options: ResolutionCollection): ResolutionInputs {
  const { snapshot, store, reader } = options;
  requireOwnedStore(store, snapshot.settings.repository);
  if (store.source_commit !== snapshot.source_commit) throw Error("resolution object store source changed");
  const selected = [...options.selected];
  const result: ResolutionInputs = { repository: snapshot.settings.repository, repository_id: null, default_branch: snapshot.settings.default_branch,
    source_commit: snapshot.source_commit, selected, complete: false, proposals: [], diagnostics: [], inputs_sha256: "" };
  if (selected.length === 0 || new Set(selected).size !== selected.length
    || selected.some(number => !Number.isSafeInteger(number) || number < 1)) result.diagnostics.push("Invalid or repeated selected proposal identity");
  try {
    const repository = reader.repository();
    if (repository.full_name.toLowerCase() !== result.repository || repository.default_branch !== snapshot.settings.default_branch
      || !Number.isSafeInteger(repository.id) || repository.id < 1) throw Error("foreign selected repository");
    result.repository_id = repository.id;
    for (const number of new Set(selected)) {
      try {
        if (!Number.isSafeInteger(number) || number < 1) continue;
        const proposal = reader.pull(number);
        if (proposal.number !== number || proposal.base_repository.id !== repository.id
          || proposal.base_repository.full_name.toLowerCase() !== result.repository || proposal.base_ref !== snapshot.settings.default_branch) throw Error("changed selected proposal identity");
        result.proposals.push(readResolutionProposal(store, proposal));
      } catch { result.diagnostics.push(`Required complete proposal ${number} unavailable`); }
    }
  } catch { result.diagnostics.push("Selected repository metadata unavailable or changed"); }
  result.complete = result.diagnostics.length === 0 && result.proposals.length === selected.length;
  result.inputs_sha256 = canonicalDigest({ repository: result.repository, repository_id: result.repository_id, default_branch: result.default_branch, source_commit: result.source_commit,
    selected, proposals: result.proposals.map(proposal => [proposal.number, proposal.binding_sha256]), diagnostics: result.diagnostics });
  return freezeJSON(JSON.parse(canonicalJSON(result).toString()) as ResolutionInputs);
}

/** Recompute the controller's complete selected scope. Serialized flags or digests supply no freshness proof. */
export function recheckResolutionInputs(inputs: ResolutionInputs, options: ResolutionCollection): { fresh: boolean; diagnostics: string[] } {
  try {
    const current = collectResolutionInputs(options);
    const diagnostics = [...current.diagnostics];
    if (!canonicalJSON(current).equals(canonicalJSON(inputs))) diagnostics.push("Selected resolution Git inputs or native metadata changed");
    return { fresh: current.complete && diagnostics.length === 0, diagnostics };
  } catch { return { fresh: false, diagnostics: ["Required current resolution inputs unavailable"] }; }
}
