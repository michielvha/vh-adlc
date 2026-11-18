import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { readCollectedAuditProposalContext, readCollectedAuditProposals, type collectAuditProposalInputs } from "./audit-proposal-inputs";
import { verifyCandidate } from "./candidate-verification";
import { deriveCorrectionBindings } from "./correction-bindings";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { readGit } from "./git";
import { publishArtifact, readArtifact } from "./journal";
import { OUTPUT_LIMIT } from "./owned-process";
import { inspectPreparation, prepareEdits } from "./preparation";
import { readProposalDiff } from "./proposals";
import { canonicalDigest, canonicalJSON, compareUTF8, freezeJSON, protocolPath, sha256, withinPrefix } from "./protocol";
import { joinReportSentences, type CorrectionInput } from "./report";
import type { Edit, ResolutionChange } from "./resolve";
import { readResolutionProposal, type ResolutionProposal } from "./resolve-inputs";
import { artifactDirectoryScope, captureCallerState, captureSnapshot, matchesCallerState, type Snapshot } from "./snapshot";
import { readCandidateVerificationArtifacts } from "./verification-evidence";

type Reference = { path: string; sha256: string };
type Inputs = Awaited<ReturnType<typeof collectAuditProposalInputs>>;
type Context = ReturnType<typeof readCollectedAuditProposalContext>;
type Postimage = Omit<ResolutionChange, "after_base64">;
type Row = {
  number: number;
  binding_sha256: string;
  locator: string;
  outcome: "not-selected" | "terminal" | "needs-resolution" | "verified" | "incomplete";
  diagnostics: string[];
  candidate_commit: string | null;
  preparation_reference: Reference | null;
  verification_reference: Reference | null;
  corrections: CorrectionInput[];
  postimages: Postimage[];
};
export type CurrentProposalVerification = {
  schema_version: 1;
  kind: "docs-drift-current-proposal-verification";
  authority: "none";
  source_commit: string;
  complete: boolean;
  scope_changed: boolean;
  details_omitted: boolean;
  diagnostics: string[];
  inputs_sha256: string | null;
  required_proposals: number | null;
  verified_proposals: number;
  proposals: Row[];
  evidence: Reference | null;
};
class NeedsResolution extends Error {}
const verificationRechecks = new WeakMap<object, () => void>();

/** Reopen retained proof after the controller's final native and independent-review reads. */
export function recheckCurrentProposalVerification(result: CurrentProposalVerification): void {
  const recheck = verificationRechecks.get(result);
  if (!result.complete || !recheck) throw Error("Original complete current proposal verification required");
  recheck();
}

/** Rebuild the complete original hunks against the assessed source before configured checks. */
function currentSelection(snapshot: Snapshot, context: Context, original: ResolutionProposal) {
  const native = context.proposals.find(row => row.number === original.number);
  if (!native) throw Error("Original current proposal metadata required");
  const { title: _title, labels: _labels, ...proposal } = native;
  if (canonicalDigest(readResolutionProposal(context.store, proposal)) !== canonicalDigest(original))
    throw new ArtifactChanged("Original full proposal Git inputs changed");
  const diff = readProposalDiff(context.store, proposal);
  if (!diff.complete) throw Error("Complete current proposal Git inputs required");
  if (!diff.files.length) throw new NeedsResolution("An empty proposal needs an explicit resolution disposition");
  if (original.hunks.some(hunk => hunk.kind === "binary"))
    throw new NeedsResolution("Current binary asset verification requires its explicit asset-check evidence");
  const source = new Map(snapshot.blobs.map(blob => [blob.path, blob]));
  const edits: Edit[] = [];
  for (const file of diff.files) {
    if (!snapshot.settings.roots.some(root => withinPrefix(file.path, root)) && !snapshot.settings.feedback_files.includes(file.path))
      throw new NeedsResolution("The proposal includes paths outside declared documentation and feedback");
    const current = source.get(file.path);
    if ((current?.mode ?? "000000") !== file.before_mode || (current ? sha256(current.bytes) : null) !== (file.before ? sha256(file.before) : null))
      throw new NeedsResolution("Current documentation preimage differs from the full original proposal");
    const before = current ? sha256(current.bytes) : null;
    const afterMode = file.after_mode === "000000" ? null : file.after_mode;
    if (afterMode !== null && afterMode !== "100644" && afterMode !== "100755")
      throw new NeedsResolution("Current proposal requires a regular documentation postimage");
    const common: Pick<Edit, "path" | "before_sha256" | "after_mode"> = { path: file.path, before_sha256: before, after_mode: afterMode };
    const id = "proposal-" + original.number + "-" + canonicalDigest({ path: file.path });
    if (!file.before) {
      if (!file.after) throw Error("Original created-file postimage required");
      edits.push({ ...common, id, action: "create", start: 0, end: 0, replacement_base64: file.after.toString("base64") });
    } else if (!file.after) {
      edits.push({ ...common, id, action: "delete", start: 0, end: file.before.length, replacement_base64: "" });
    } else {
      for (const hunk of original.hunks.filter(hunk => hunk.path === file.path && hunk.kind === "text")) {
        edits.push({ ...common, id: "proposal-" + original.number + "-" + hunk.id, action: "replace",
          start: hunk.before_range.start, end: hunk.before_range.end, replacement_base64: hunk.after_base64 ?? "" });
      }
      if (file.before_mode !== file.after_mode)
        edits.push({ ...common, id: id + "-mode", action: "chmod", start: 0, end: 0, replacement_base64: "" });
    }
  }
  const selection = { schema_version: 1, source_commit: snapshot.source_commit, edits };
  const inspection = inspectPreparation({ repo: snapshot.repo, source: snapshot.source_commit, selection });
  if (!inspection.complete) {
    if (inspection.protection?.complete) throw new NeedsResolution(inspection.diagnostics.join(". ") || "Current feature protection requires resolution");
    throw Error("Complete current proposal protection metadata required");
  }
  const expected = diff.files.map(file => ({ path: file.path, before_mode: file.before_mode === "000000" ? null : file.before_mode,
    after_mode: file.after_mode === "000000" ? null : file.after_mode, before_sha256: file.before ? sha256(file.before) : null,
    after_sha256: file.after ? sha256(file.after) : null })).sort((a, b) => compareUTF8(a.path, b.path));
  const postimages = inspection.changes.map(({ after_base64: _bytes, ...change }) => change);
  if (canonicalDigest(postimages) !== canonicalDigest(expected)) throw Error("Current selection differs from the complete original postimages");
  return { selection, postimages };
}

/** Incomplete current scope cannot expose rows as verified proof. Original files stay retained. */
export function invalidateCurrentProposalVerification(input: CurrentProposalVerification, message: string, scopeChanged = false): CurrentProposalVerification {
  const result = structuredClone(input);
  result.complete = false;
  result.scope_changed ||= scopeChanged;
  result.verified_proposals = 0;
  result.evidence = null;
  result.diagnostics = [...new Set([...result.diagnostics, message])];
  for (const row of result.proposals) if (row.outcome === "verified") {
    row.outcome = "incomplete";
    row.verification_reference = null;
    row.corrections = [];
    row.postimages = [];
  }
  return freezeJSON(result);
}

/** Pure presentation bound. Pending retention reserves its future reference here. */
export function boundCurrentProposalVerification(input: CurrentProposalVerification, limit: number, pendingRecord?: string | null): CurrentProposalVerification {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT) throw Error("Current verification output bound required");
  let result = structuredClone(input);
  const pending = pendingRecord ? { path: protocolPath(pendingRecord), sha256: "0".repeat(64) } : null;
  if (pendingRecord !== undefined) result.evidence = pending;
  if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) {
    result = { ...invalidateCurrentProposalVerification(result, "Current verification exceeds the retained entry bound"),
      details_omitted: true, proposals: [], evidence: pending };
    result.diagnostics = ["Current verification exceeds the retained entry bound. Inspect the original private records"];
  }
  if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) throw Error("Configured bound cannot retain an incomplete current verification result");
  return result;
}

/** The report controller chooses supported IDs after reopening independent assessment review. */
export async function verifyCurrentProposals(input: {
  repo: string; source: string; artifact_root: string; owner: string; run: string; proposals: Inputs; supported: number[];
}): Promise<CurrentProposalVerification> {
  const options = { ...input, supported: [...input.supported] };
  let result: CurrentProposalVerification = { schema_version: 1, kind: "docs-drift-current-proposal-verification", authority: "none",
    source_commit: input.source, complete: false, scope_changed: false, details_omitted: false, diagnostics: [], inputs_sha256: null,
    required_proposals: null, verified_proposals: 0, proposals: [], evidence: null };
  let repo: string | null = null, before: string | null = null, root: string | null = null, limit = OUTPUT_LIMIT;
  let recheck: (() => void) | null = null;
  try {
    const context = readCollectedAuditProposalContext(options.proposals);
    repo = realpathSync(options.repo);
    before = canonicalDigest(captureCallerState(repo));
    root = artifactDirectoryScope(options.artifact_root, repo).directory;
    if (context.repo !== repo || context.source_commit !== options.source || context.artifact_root !== root)
      throw new ArtifactChanged("Original current proposal verification scope changed");
    const snapshot = captureSnapshot(repo, options.source), sourceRepo = repo, artifactRoot = root;
    limit = Math.min(limit, snapshot.settings.reports.max_entry_bytes);
    const originals = readCollectedAuditProposals(options.proposals);
    if (new Set(options.supported).size !== options.supported.length || options.supported.some(number => !originals.some(row => row.number === number)))
      throw Error("Supported verification selection must name distinct original proposals");
    const recheckInputs = () => {
      for (const reference of context.references)
        readBoundArtifact({ source_repo: sourceRepo, artifact_root: artifactRoot, reference });
    };
    recheckInputs();
    result.inputs_sha256 = context.inputs_sha256;
    result.required_proposals = originals.length;
    const checked: Array<Parameters<typeof readCandidateVerificationArtifacts>[0]> = [];
    const preparations: Reference[] = [];
    let incomplete = false;
    for (const original of originals) {
      const native = context.proposals.find(row => row.number === original.number);
      if (!native) throw Error("Complete original native proposal scope required");
      const row: Row = { number: original.number, binding_sha256: original.binding_sha256,
        locator: "https://" + snapshot.settings.hostname + "/" + snapshot.settings.repository + "/pull/" + original.number,
        outcome: "not-selected", diagnostics: [], candidate_commit: null, preparation_reference: null, verification_reference: null,
        corrections: [], postimages: [] };
      result.proposals.push(row);
      if (native.state !== "open" || native.merged_at !== null) { row.outcome = "terminal"; continue; }
      if (!options.supported.includes(original.number)) continue;
      try {
        const selected = currentSelection(snapshot, context, original);
        const common = { repo: sourceRepo, source: options.source, artifact_root: artifactRoot,
          owner: options.owner, run: options.run + "/proposal-" + original.number };
        const prepared = await prepareEdits({ ...common, selection: selected.selection });
        if (prepared.state !== "prepared-uncommitted" || !prepared.checkout || !prepared.record_path)
          throw Error(joinReportSentences(["Current proposal preparation failed", ...prepared.diagnostics]));
        const preparation = { path: relative(artifactRoot, prepared.record_path), sha256: sha256(readArtifact(prepared.record_path)) };
        readBoundArtifact({ source_repo: sourceRepo, artifact_root: artifactRoot, reference: preparation });
        row.preparation_reference = preparation;
        preparations.push(preparation);
        const checkout = prepared.checkout;
        readGit(checkout, "add", "--", ...selected.postimages.map(image => image.path));
        const tree = readGit(checkout, "write-tree").toString().trim();
        const candidate = readGit(checkout, "-c", "user.name=vh-adlc", "-c", "user.email=vh-adlc@localhost.invalid",
          "commit-tree", "--no-gpg-sign", tree, "-p", options.source, "-m", "Current documentation proposal verification").toString().trim();
        readGit(checkout, "update-ref", "--no-deref", "HEAD", candidate, options.source);
        row.candidate_commit = candidate;
        const proofOptions = { ...common, selection: selected.selection, candidate_repo: checkout, candidate };
        const verified = await verifyCandidate(proofOptions);
        if (!verified.complete || !verified.evidence) throw Error(joinReportSentences(["Current proposal configured verification failed", ...verified.diagnostics]));
        const originalProof = { ...proofOptions, reference: verified.evidence };
        const proof = readCandidateVerificationArtifacts(originalProof);
        if (!proof.inspection?.object_store || !proof.scan) throw Error("Complete original current candidate proof required");
        row.verification_reference = verified.evidence;
        row.corrections = deriveCorrectionBindings({ source: snapshot, candidate: captureSnapshot(checkout, candidate),
          store: proof.inspection.object_store, paths: proof.inspection.changed_paths, scan: proof.scan });
        row.postimages = selected.postimages;
        row.outcome = "verified";
        result.verified_proposals++;
        checked.push(originalProof);
      } catch (error) {
        row.outcome = error instanceof NeedsResolution ? "needs-resolution" : "incomplete";
        row.diagnostics.push(error instanceof Error ? error.message : "Current proposal verification unavailable");
        if (!(error instanceof NeedsResolution)) incomplete = true;
        if (error instanceof ArtifactChanged) result.scope_changed = true;
      }
    }
    for (const proof of checked) readCandidateVerificationArtifacts(proof);
    for (const reference of preparations) readBoundArtifact({ source_repo: sourceRepo, artifact_root: artifactRoot, reference });
    recheckInputs();
    recheck = () => {
      recheckInputs();
      for (const proof of checked) readCandidateVerificationArtifacts(proof);
      for (const reference of preparations) readBoundArtifact({ source_repo: sourceRepo, artifact_root: artifactRoot, reference });
    };
    result.complete = !incomplete;
    if (incomplete) result.diagnostics.push("Required current proposal verification is incomplete");
  } catch (error) {
    result.scope_changed ||= error instanceof ArtifactChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Current proposal verification unavailable");
  }
  if (repo !== null && before !== null && !matchesCallerState(repo, before)) {
    result.scope_changed = true;
    result.complete = false;
    result.diagnostics.push("Caller changed during current proposal verification");
  }
  if (!result.complete) result = invalidateCurrentProposalVerification(result, "Current proposal proof is incomplete", result.scope_changed);
  const record = root === null ? null : "current-proposal-verification-" + randomUUID() + ".json";
  result = boundCurrentProposalVerification(result, limit, record);
  if (record && root !== null) {
    try {
      const { evidence: _evidence, ...payload } = result;
      const bytes = canonicalJSON(payload);
      publishArtifact(join(root, record), bytes);
      result = { ...result, evidence: { path: record, sha256: sha256(bytes) } };
    } catch (error) {
      result = { ...invalidateCurrentProposalVerification(result, error instanceof Error ? error.message : "Current verification retention failed"), evidence: null };
    }
  }
  result = boundCurrentProposalVerification(result, limit);
  const completed = freezeJSON(result);
  if (completed.complete && completed.evidence && root && repo && recheck) {
    const scope = { source_repo: repo, artifact_root: root, reference: completed.evidence }, originalRecheck = recheck;
    verificationRechecks.set(completed, () => { readBoundArtifact(scope); originalRecheck(); });
  }
  return completed;
}
