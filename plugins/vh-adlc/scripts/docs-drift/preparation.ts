import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gitReadArguments } from "../git-read";
import { readGit } from "./git";
import { publishArtifact } from "./journal";
import { executeOwnedProcess } from "./owned-process";
import { canonicalDigest, canonicalJSON, compareUTF8, protocolPath, sha256 } from "./protocol";
import { evaluateProtection, type ProtectionContext, type ProtectionResult } from "./protection";
import { collectEditChanges, parseEdit, readResolutionRecord, resolutionSource, type Edit, type ResolutionChange } from "./resolve";
import { runScan, scannerEnvironment, type ScanRun } from "./scan";
import { captureSnapshot } from "./snapshot";

type EditInspection = {
  schema_version: 1; kind: "docs-drift-edit-inspection"; authority: "none"; source_commit: string;
  complete: boolean; diagnostics: string[]; edits_sha256: string | null; changes: ResolutionChange[];
  protection: Pick<ProtectionResult, "complete" | "diagnostics"> & { edits: Array<Omit<ProtectionResult["edits"][number], "bytes">> } | null;
};

function selectedEdits(value: unknown, source: string): Edit[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("edit selection object required");
  canonicalJSON(value);
  const input = value as Record<string, unknown>, keys = ["schema_version", "source_commit", "edits"];
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key)) || input.schema_version !== 1
    || input.source_commit !== source || !Array.isArray(input.edits)) throw Error("edit selection fields or source changed");
  const edits = input.edits.map(parseEdit);
  if (new Set(edits.map(edit => edit.id)).size !== edits.length) throw Error("duplicate selected edit ID");
  const unique = new Map<string, Edit>();
  for (const edit of edits) {
    const { id: _id, ...binding } = edit;
    const digest = canonicalDigest(binding);
    if (!unique.has(digest)) unique.set(digest, edit);
  }
  return [...unique.values()];
}

/** Evaluate proposed postimages against committed preimages and feature ownership. */
export function inspectPreparation(options: {
  repo: string; source: string; selection: unknown; protection_context?: ProtectionContext;
}): EditInspection {
  const result: EditInspection = { schema_version: 1, kind: "docs-drift-edit-inspection", authority: "none", source_commit: options.source,
    complete: false, diagnostics: [], edits_sha256: null, changes: [], protection: null };
  try {
    const selected = selectedEdits(options.selection, options.source), snapshot = captureSnapshot(options.repo, options.source);
    result.edits_sha256 = canonicalDigest(selected);
    result.changes = collectEditChanges(selected, snapshot);
    const protection = evaluateProtection(snapshot.repo, snapshot, selected.map(edit => ({ path: edit.path, start: edit.start, end: edit.end,
      before_sha256: edit.before_sha256, action: edit.action, after_mode: edit.after_mode,
      replacement: Buffer.from(edit.replacement_base64, "base64") })), options.protection_context);
    result.protection = { complete: protection.complete, diagnostics: protection.diagnostics,
      edits: protection.edits.map(({ bytes: _bytes, ...edit }) => edit) };
    result.diagnostics.push(...protection.diagnostics.map(diagnostic => diagnostic.message));
    for (const edit of protection.edits) if (!edit.allowed) result.diagnostics.push(edit.path + " (" + edit.reason + ")");
    result.complete = protection.complete && protection.edits.every(edit => edit.allowed);
  } catch (error) {
    result.diagnostics.push(error instanceof Error ? error.message : "edit inspection unavailable");
  }
  return result;
}

type PreparedEdits = {
  schema_version: 1; kind: "docs-drift-prepared-edits"; source_commit: string;
  state: "incomplete" | "prepared-uncommitted" | "no-change"; diagnostics: string[];
  checkout: string | null; record_path: string | null; inspection: EditInspection | null; scan: ScanRun | null;
};

export class PreparationEvidenceError extends AggregateError {
  readonly checkout: string | null;
  readonly record_path: string | null;
  constructor(result: PreparedEdits, failure: unknown, recording: unknown) {
    super(failure === null ? [recording] : [failure, recording], "Preparation evidence could not be retained", { cause: failure ?? recording });
    this.checkout = result.checkout; this.record_path = result.record_path;
  }
}

function writeDiffInput(root: string, path: string, bytes: Uint8Array, mode: string) {
  if (mode !== "100644" && mode !== "100755") throw Error("unsupported preparation file mode");
  const file = join(root, protocolPath(path));
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, bytes, { flag: "wx", mode: mode === "100755" ? 0o755 : 0o644 });
}

function matchesFile(root: string, change: ResolutionChange, side: "before" | "after") {
  const path = join(root, protocolPath(change.path)), hash = side === "before" ? change.before_sha256 : change.after_sha256;
  const expectedMode = side === "before" ? change.before_mode : change.after_mode;
  if (hash === null) return !existsSync(path);
  const stat = lstatSync(path), mode = (stat.mode & 0o111) ? "100755" : "100644";
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1
    && mode === expectedMode && sha256(readFileSync(path)) === hash;
}

/** Apply the selected proposal in a newly recorded source copy. Checkpoints use the later commit gate. */
export async function prepareEdits(input: {
  repo: string; source: string; selection: unknown; artifact_root: string; owner: string; run: string; protection_context?: ProtectionContext;
}): Promise<PreparedEdits> {
  const options = { ...input, selection: structuredClone(input.selection), protection_context: structuredClone(input.protection_context) };
  const result: PreparedEdits = { schema_version: 1, kind: "docs-drift-prepared-edits", source_commit: options.source,
    state: "incomplete", diagnostics: [], checkout: null, record_path: null, inspection: null, scan: null };
  let failure: unknown = null;
  try {
    const edits = selectedEdits(options.selection, options.source), snapshot = captureSnapshot(options.repo, options.source);
    collectEditChanges(edits, snapshot);
    const scan = await runScan(snapshot, { artifact_root: options.artifact_root, owner: options.owner, run: options.run });
    result.scan = scan;
    if (!scan.complete) throw Error("preparation requires complete source collection");
    result.checkout = scan.checkout;
    const root = dirname(scan.checkout);
    result.inspection = inspectPreparation({ repo: scan.checkout, source: options.source, selection: options.selection, protection_context: options.protection_context });
    if (!result.inspection.complete) throw Error("selected preparation failed its protection checks");
    result.record_path = join(root, "prepare-result.json");
    publishArtifact(join(root, "prepare-owner.json"), canonicalJSON({ schema_version: 1, kind: "prepare-checkout", role: "docs-drift-prepare", owner: options.owner,
      run: options.run, repository: snapshot.settings.repository, ref: "HEAD", base_commit: options.source, source_commit: options.source, checkout: scan.checkout,
      selection_sha256: canonicalDigest(options.selection), edits_sha256: result.inspection.edits_sha256, evidence_location: result.record_path }));
    const changes = result.inspection.changes;
    if (changes.length === 0) result.state = "no-change";
    else {
      const before = join(root, "before"), after = join(root, "after"), temporary = join(root, "prepare-temporary");
      for (const directory of [before, after, temporary]) mkdirSync(directory, { mode: 0o700 });
      for (const change of changes) {
        const blob = snapshot.blobs.find(blob => blob.path === change.path);
        if (blob) writeDiffInput(before, change.path, blob.bytes, blob.mode);
        if (change.after_base64 !== null && change.after_mode !== null) writeDiffInput(after, change.path, Buffer.from(change.after_base64, "base64"), change.after_mode);
        if (!matchesFile(scan.checkout, change, "before")) throw Error("owned preparation preimage changed");
      }
      const git = Bun.which("git");
      if (!git) throw Error("preparation Git unavailable");
      const env = { ...scannerEnvironment(git, git, temporary), GIT_ATTR_NOSYSTEM: "1" };
      // Highest-precedence attributes keep this owned raw-blob copy byte-exact.
      const info = join(scan.checkout, ".git", "info");
      mkdirSync(info, { recursive: true, mode: 0o700 });
      writeFileSync(join(info, "attributes"), "* -text -ident -filter -working-tree-encoding -eol\n", { flag: "wx", mode: 0o600 });
      async function runGit(phase: "diff" | "check" | "apply", cwd: string, args: string[], expectedExit: 0 | 1) {
        const argv = gitReadArguments(["-c", "core.attributesFile=/dev/null", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "http.extraHeader=", ...args]);
        const stdout = join(root, phase + "-stdout"), stderr = join(root, phase + "-stderr");
        const native = await executeOwnedProcess({ argv, cwd, env, capture: "memory", stdout, stderr, watched_outputs: [], timeout_ms: 30000,
          started: pid => publishArtifact(join(root, phase + "-owner.json"), canonicalJSON({ pid, argv_sha256: sha256(canonicalJSON(argv)) })) });
        const { captured, ...completion } = native;
        const stdoutBytes = captured?.stdout ?? new Uint8Array(), stderrBytes = captured?.stderr ?? new Uint8Array();
        publishArtifact(stdout, stdoutBytes); publishArtifact(stderr, stderrBytes);
        publishArtifact(join(root, phase + "-result.json"), canonicalJSON({ kind: "docs-drift-preparation-git", process: completion,
          capture_verified: captured !== undefined, expected_exit_code: expectedExit, stdout_sha256: sha256(stdoutBytes), stderr_sha256: sha256(stderrBytes) }));
        if (!captured || completion.exit_code !== expectedExit || !completion.reaped || completion.timed_out || completion.cancelled !== null || completion.output_limit)
          throw Error("preparation Git " + phase + " failed");
        return captured.stdout;
      }
      // The owned repository supplies the object format for binary patch headers.
      const patch = await runGit("diff", root, ["--git-dir=" + join(scan.checkout, ".git"), "diff", "--no-index", "--binary", "--full-index",
        "--no-ext-diff", "--no-textconv", "--no-renames", "--", "before", "after"], 1);
      const patchPath = join(root, "selected.patch"); publishArtifact(patchPath, patch);
      const index = join(scan.checkout, ".git", "index"), indexSHA = sha256(readFileSync(index));
      await runGit("check", scan.checkout, ["apply", "--check", "--binary", "-p2", "--", patchPath], 0);
      await runGit("apply", scan.checkout, ["apply", "--binary", "-p2", "--", patchPath], 0);
      if (sha256(readFileSync(index)) !== indexSHA || changes.some(change => !matchesFile(scan.checkout, change, "after")))
        throw Error("preparation postimage or index changed");
      result.state = "prepared-uncommitted";
    }
  } catch (error) {
    failure = error;
    result.diagnostics.push(error instanceof Error ? error.message : "preparation unavailable");
  }
  try {
    if (result.record_path) publishArtifact(result.record_path, canonicalJSON(result));
  } catch (error) {
    throw new PreparationEvidenceError(result, failure, error);
  }
  return result;
}

type CandidateInspection = {
  schema_version: 1; kind: "docs-drift-candidate-inspection"; authority: "none"; complete: boolean; diagnostics: string[];
  source_commit: string; candidate_commit: string; candidate_tree: string | null; diff_sha256: string | null; changed_paths: string[]; resolution_record: { path: string; sha256: string } | null;
};

/** Compare the complete committed candidate with selected, protected raw-byte postimages. */
export function inspectCandidate(options: {
  repo: string; source: string; selection: unknown; candidate_repo: string; candidate: string; protection_context?: ProtectionContext;
  resolution_record?: { path: string; sha256: string };
}): CandidateInspection {
  const result: CandidateInspection = { schema_version: 1, kind: "docs-drift-candidate-inspection", authority: "none", complete: false, diagnostics: [],
    source_commit: options.source, candidate_commit: options.candidate, candidate_tree: null, diff_sha256: null, changed_paths: [], resolution_record: null };
  try {
    const inspection = inspectPreparation(options);
    result.diagnostics.push(...inspection.diagnostics);
    if (!inspection.complete) throw Error("candidate selection failed protection or preimage checks");
    const source = captureSnapshot(options.repo, options.source), candidate = captureSnapshot(options.candidate_repo, options.candidate);
    if (candidate.settings_sha256 !== source.settings_sha256) throw Error("candidate changes the assessed configuration");
    readGit(candidate.repo, "merge-base", "--is-ancestor", source.source_commit, candidate.source_commit);
    if (readGit(candidate.repo, "rev-list", "--min-parents=2", source.source_commit + ".." + candidate.source_commit).length !== 0)
      throw Error("candidate contains an unreviewed merge interval");
    const before = new Map(source.blobs.map(blob => [blob.path, blob])), after = new Map(candidate.blobs.map(blob => [blob.path, blob]));
    const paths = [...new Set([...before.keys(), ...after.keys()])].sort(compareUTF8);
    const changes = [];
    for (const path of paths) {
      const old = before.get(path), next = after.get(path);
      if (old?.mode === next?.mode && old?.oid === next?.oid) continue;
      changes.push({ path, before_mode: old?.mode ?? null, after_mode: next?.mode ?? null,
        before_sha256: old ? sha256(old.bytes) : null, after_sha256: next ? sha256(next.bytes) : null });
    }
    const expected = inspection.changes.map(({ after_base64: _bytes, ...change }) => change);
    if (options.resolution_record) {
      const selected = options.resolution_record, path = protocolPath(selected.path), blob = after.get(path);
      if (!/^[a-f0-9]{64}$/u.test(selected.sha256) || !blob || blob.mode !== "100644" || before.has(path)
        || blob.bytes.length > source.settings.reports.max_entry_bytes || sha256(blob.bytes) !== selected.sha256)
        throw Error("candidate resolution record binding changed");
      const record = readResolutionRecord(blob.bytes, source.settings);
      if (path !== source.settings.publication.resolution_root + "/" + record.id + ".yaml") throw Error("candidate resolution record path changed");
      if (record.source.required_inputs.length > 0) throw Error("Current observations for required resolution inputs unavailable");
      if (record.assessed_base !== source.source_commit || !canonicalJSON(record.source).equals(canonicalJSON(resolutionSource(source)))
        || !canonicalJSON(record.postimages).equals(canonicalJSON(expected))) throw Error("candidate resolution source or postimages changed");
      expected.push({ path, before_mode: null, after_mode: "100644", before_sha256: null, after_sha256: selected.sha256 });
      expected.sort((left, right) => compareUTF8(left.path, right.path));
      result.resolution_record = { path, sha256: selected.sha256 };
    }
    if (!canonicalJSON(changes).equals(canonicalJSON(expected))) throw Error("candidate differs from the selected complete postimages");
    result.changed_paths = changes.map(change => change.path);
    result.candidate_tree = readGit(candidate.repo, "rev-parse", "--verify", "--end-of-options", candidate.source_commit + "^{tree}").toString().trim();
    result.diff_sha256 = sha256(readGit(candidate.repo, "diff", "--binary", "--full-index", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames",
      source.source_commit, candidate.source_commit, "--"));
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Candidate inspection unavailable"); }
  return result;
}
