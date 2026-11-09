import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gitReadArguments } from "../git-read";
import { publishArtifact } from "./journal";
import { executeOwnedProcess } from "./owned-process";
import { canonicalDigest, canonicalJSON, protocolPath, sha256 } from "./protocol";
import { evaluateProtection, type ProtectionContext, type ProtectionResult } from "./protection";
import { collectEditChanges, parseEdit, type Edit, type ResolutionChange } from "./resolve";
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
