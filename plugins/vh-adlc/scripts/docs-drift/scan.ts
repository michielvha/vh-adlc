import { executeOwnedProcess, outputSize, OUTPUT_LIMIT } from "./owned-process";
import type { OwnedProcess as ScanProcess } from "./owned-process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { gitEnvironment } from "../git-read";
import { readGitWithEnvironment } from "./git";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, protocolPath, sha256, verifyProtocolBindings } from "./protocol";
import type { PathDigest } from "./protocol";
import { captureRepositoryState, externalArtifactDirectory, readCommittedTree } from "./snapshot";
import type { Snapshot } from "./snapshot";

type Diagnostic = { code: string; message: string };
export type Finding = { id: string; detector: string; severity: string; document: string; location: unknown; explanation: string };
type DocumentRead = { path: string; sha256: string | null; status: "complete" | "failed"; error: string | null };
type DetectorExecution = { id: string; options: unknown; documents: PathDigest[]; input_count: number; input_sha256: string; outcome: "complete" | "failed"; error: string | null };
export type ScanAssessment = {
  complete: boolean; diagnostics: Diagnostic[]; documents: DocumentRead[]; detectors: DetectorExecution[]; findings: Finding[];
  suppressed_findings: Array<{ finding: Finding; reason: string }>;
  stale_suppressions: Array<{ id: string; reason: string; document: string | null }>;
};

function malformed(field: string): never { throw new Error(`invalid scan field ${field}`); }

function object(value: unknown, fields: string[], field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) malformed(field);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !fields.includes(key))) malformed(field);
  return record;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) malformed(field);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) malformed(field);
  canonicalJSON(value);
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) malformed("digest");
  return value;
}

function rows(value: unknown): PathDigest[] {
  const result = array(value, "path digests").map(value => {
    const row = array(value, "path digest");
    if (row.length !== 2) malformed("path digest");
    return [protocolPath(row[0]), digest(row[1])] as const;
  });
  if (new Set(result.map(row => row[0])).size !== result.length) malformed("duplicate path");
  return result.sort((left, right) => compareUTF8(left[0], right[0]));
}

function finding(value: unknown): Finding {
  const input = object(value, ["id", "detector", "severity", "document", "location", "explanation"], "finding");
  const body = {
    detector: text(input.detector, "finding detector"), severity: text(input.severity, "finding severity"),
    document: protocolPath(input.document), location: input.location ?? null, explanation: text(input.explanation, "finding explanation"),
  };
  canonicalJSON(body.location);
  return { id: input.id === undefined ? canonicalDigest(body) : text(input.id, "finding id"), ...body };
}

function same(left: unknown, right: unknown): boolean { return canonicalDigest(left) === canonicalDigest(right); }

/** Bind metadata and actual execution accounting separately. Findings survive an incomplete assessment. */
export function assessScan(value: unknown, snapshot: Snapshot): ScanAssessment {
  const result: ScanAssessment = { complete: false, diagnostics: [], documents: [], detectors: [], findings: [], suppressed_findings: [], stale_suppressions: [] };
  const gap = (code: string, message: string) => result.diagnostics.push({ code, message });
  let input: Record<string, unknown>;
  try {
    input = object(value, [
      "schema_version", "source_commit", "settings_digest", "bindings_sha256", "scanner", "scope", "feedback",
      "documents", "detectors", "collection_failures", "findings", "suppressed_findings", "stale_suppressions",
    ], "report");
  } catch { gap("invalid-report", "The scanner returned an unsupported report structure."); return result; }
  function collect<T>(value: unknown, field: string, parse: (value: unknown) => T): T[] {
    const entries: T[] = [];
    try {
      for (const item of array(value, field)) {
        try { entries.push(parse(item)); }
        catch { gap("invalid-" + field, "A scanner " + field + " entry is malformed."); }
      }
    } catch { gap("invalid-" + field, "The scanner omitted or malformed its " + field + " collection."); }
    return entries;
  }
  result.findings = collect(input.findings, "findings", finding);
  result.suppressed_findings = collect(input.suppressed_findings, "suppressed_findings", value => {
    const item = object(value, ["finding", "reason"], "suppressed finding");
    return { finding: finding(item.finding), reason: text(item.reason, "suppression reason") };
  });
  result.stale_suppressions = collect(input.stale_suppressions, "stale_suppressions", value => {
    const item = object(value, ["id", "reason", "document"], "stale suppression");
    return { id: text(item.id, "suppression id"), reason: text(item.reason, "suppression reason"), document: item.document === undefined ? null : protocolPath(item.document) };
  });
  try {
    const expected = snapshot.protocol.bindings;
    if (input.schema_version !== 1 || input.source_commit !== snapshot.source_commit ||
        input.settings_digest !== snapshot.settings_sha256 || input.bindings_sha256 !== snapshot.protocol.sha256 ||
        !same(input.scope, expected.scope) || !same(rows(input.feedback), expected.feedback)) malformed("source bindings");
    const scanner = object(input.scanner, ["script_sha256", "argv"], "scanner");
    const script = snapshot.blobs.find(blob => blob.path === snapshot.settings.scanner.script);
    if (!script || scanner.script_sha256 !== sha256(script.bytes) || !same(scanner.argv, snapshot.settings.scanner.argv)) malformed("scanner identity");
  } catch { gap("binding-mismatch", "The scanner metadata differs from the independently bound source, scope or executable."); }
  try {
    result.documents = collect(input.documents, "documents", value => {
      const item = object(value, ["path", "sha256", "status", "error"], "document");
      if (item.status !== "complete" && item.status !== "failed") malformed("document status");
      if (item.status === "complete" && item.error !== undefined) malformed("document error");
      return {
        path: protocolPath(item.path), sha256: item.sha256 === null ? null : digest(item.sha256), status: item.status,
        error: item.status === "failed" ? text(item.error, "document error") : null,
      };
    });
    const observed = result.documents.map(item => [item.path, item.sha256] as const).sort((left, right) => compareUTF8(left[0], right[0]));
    if (new Set(result.documents.map(item => item.path)).size !== result.documents.length ||
        result.documents.some(item => item.status !== "complete") || !same(observed, snapshot.protocol.bindings.documents)) malformed("document inventory");
  } catch { gap("incomplete-documents", "Document reads are missing, failed, duplicated or differently bound."); }
  try {
    result.detectors = collect(input.detectors, "detectors", value => {
      const item = object(value, ["id", "options", "documents", "input_count", "input_sha256", "outcome", "error"], "detector");
      if (item.outcome !== "complete" && item.outcome !== "failed") malformed("detector outcome");
      if (item.outcome === "complete" && item.error !== undefined) malformed("detector error");
      if (typeof item.input_count !== "number" || !Number.isSafeInteger(item.input_count) || item.input_count < 0) malformed("detector count");
      canonicalJSON(item.options);
      return {
        id: text(item.id, "detector id"), options: item.options, documents: rows(item.documents), input_count: item.input_count,
        input_sha256: digest(item.input_sha256), outcome: item.outcome,
        error: item.outcome === "failed" ? text(item.error, "detector error") : null,
      };
    });
    if (new Set(result.detectors.map(unit => unit.id)).size !== result.detectors.length ||
        !same(result.detectors.map(unit => unit.id).sort(compareUTF8), snapshot.protocol.bindings.scope.required_detectors)) malformed("required detectors");
    for (const unit of result.detectors) {
      const expected = snapshot.protocol.bindings.detectors.find(expected => expected.id === unit.id);
      const recomputed = canonicalDigest({
        source_commit: snapshot.source_commit, settings_sha256: snapshot.settings_sha256,
        scope_sha256: snapshot.protocol.bindings.scope_sha256, feedback_sha256: snapshot.protocol.bindings.feedback_sha256,
        detector_id: unit.id, options: unit.options, documents: unit.documents,
      });
      if (!expected || unit.outcome !== "complete" || unit.input_count !== unit.documents.length ||
          !same(unit.documents, expected.documents) || !same(unit.options, expected.options) ||
          unit.input_sha256 !== recomputed || unit.input_sha256 !== expected.input_sha256) malformed("detector execution");
    }
  } catch { gap("incomplete-detectors", "Required detector executions or their actual inputs are missing, failed or mismatched."); }
  try {
    for (const value of array(input.collection_failures, "collection_failures")) {
      const failure = object(value, ["path", "detector", "message"], "collection failure");
      if (failure.path !== undefined) protocolPath(failure.path);
      if (failure.detector !== undefined) text(failure.detector, "failure detector");
      text(failure.message, "collection failure message");
      gap("collection-failure", "The scanner recorded a required collection failure.");
    }
  } catch { gap("invalid-failures", "Collection failure accounting is malformed."); }
  const documentPaths = new Set(snapshot.protocol.bindings.documents.map(row => row[0]));
  const activeFindings = [...result.findings, ...result.suppressed_findings.map(item => item.finding)];
  if (activeFindings.some(item => !documentPaths.has(item.document))) gap("foreign-finding", "A finding names a document outside the bound inventory.");
  result.complete = result.diagnostics.length === 0;
  return result;
}

/** Ordinary collection inherits runtime paths and fixed Git controls, without ambient credentials. */
export function scannerEnvironment(executable: string, git: string, temporary: string): Record<string, string> {
  const environment = gitEnvironment({
    PATH: [...new Set([dirname(git), dirname(executable), "/usr/bin", "/bin"])].join(":"),
    LANG: "C", LC_ALL: "C", TMPDIR: temporary, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  });
  const result = Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return { ...result,
    GIT_CONFIG_COUNT: "4", GIT_CONFIG_KEY_0: "core.fsmonitor", GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "credential.helper", GIT_CONFIG_VALUE_1: "",
    GIT_CONFIG_KEY_2: "http.extraHeader", GIT_CONFIG_VALUE_2: "",
    GIT_CONFIG_KEY_3: "core.hooksPath", GIT_CONFIG_VALUE_3: "/dev/null",
  };
}


type ScanOptions = { artifact_root: string; owner: string; run: string; timeout_ms?: number };
export type ScanRun = ScanAssessment & { checkout: string; output_path: string; record_path: string; process: ScanProcess | null };

/** Execute only the bound consumer vector in a recorded, credential-free source copy. */
export async function runScan(snapshot: Snapshot, options: ScanOptions): Promise<ScanRun> {
  const result: ScanRun = {
    complete: false, diagnostics: [], documents: [], detectors: [], findings: [], suppressed_findings: [], stale_suppressions: [],
    checkout: "", output_path: "", record_path: "", process: null,
  };
  const gap = (code: string, message: string) => result.diagnostics.push({ code, message });
  let original: ReturnType<typeof captureRepositoryState> | undefined;
  let before: ReturnType<typeof captureRepositoryState> | undefined;
  try {
    const parent = externalArtifactDirectory(options.artifact_root, snapshot.repo);
    const executable = snapshot.settings.scanner.argv[0];
    const runtime = executable.includes("/") ? executable : Bun.which(executable);
    const git = Bun.which("git");
    if (!runtime || !git || ![options.owner, options.run].every(value => /^[A-Za-z0-9][A-Za-z0-9_./-]*$/u.test(value))) throw new Error("scanner setup unavailable");
    const configuredTimeout = snapshot.settings.scanner.timeout_seconds * 1000;
    const timeout = options.timeout_ms ?? configuredTimeout;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > configuredTimeout) throw new Error("invalid scanner timeout");
    const id = randomUUID();
    const root = join(parent, "scan-" + id);
    const checkout = join(root, "source");
    const bindingsPath = join(root, "bindings.json");
    const output = join(root, "scan.json");
    const stdout = join(root, "stdout.log");
    const stderr = join(root, "stderr.log");
    result.checkout = checkout;
    result.output_path = output;
    result.record_path = join(parent, id + ".json");
    writeFileSync(result.record_path, canonicalJSON({
      schema_version: 1, kind: "assessment-checkout", root, checkout, owner: options.owner, run: options.run,
      repository: snapshot.settings.repository, source_commit: snapshot.source_commit,
      bindings_sha256: snapshot.protocol.sha256, evidence_location: result.record_path,
    }), { flag: "wx", mode: 0o600 });
    mkdirSync(root, { mode: 0o700 });
    mkdirSync(checkout, { mode: 0o700 });
    const temporary = join(root, "temporary");
    mkdirSync(temporary, { mode: 0o700 });
    const env = scannerEnvironment(isAbsolute(runtime) ? runtime : join(checkout, runtime), git, temporary);
    const ownedGit = (...args: string[]) => readGitWithEnvironment(checkout, [
      "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "http.extraHeader=", ...args,
    ], env);
    original = captureRepositoryState(snapshot.repo);
    const format = readGitWithEnvironment(snapshot.repo, ["rev-parse", "--show-object-format"], env).toString().trim();
    if (!["sha1", "sha256"].includes(format)) throw new Error("unknown Git format");
    ownedGit("init", "--template=", "--object-format=" + format);
    ownedGit("-c", "gc.auto=0", "-c", "fetch.writeCommitGraph=false", "fetch", "--no-tags", "--no-write-fetch-head",
      "--no-recurse-submodules", "--no-auto-maintenance", "--", snapshot.repo, snapshot.source_commit);
    ownedGit("config", "core.autocrlf", "false");
    ownedGit("update-ref", "--no-deref", "HEAD", snapshot.source_commit);
    ownedGit("read-tree", snapshot.source_commit);
    const blobs = readCommittedTree(checkout, snapshot.source_commit);
    const identity = (values: typeof blobs) => canonicalDigest(values.map(blob => [blob.path, blob.mode, sha256(blob.bytes)]));
    if (identity(blobs) !== identity(snapshot.blobs)) throw new Error("source copy mismatch");
    for (const blob of blobs) {
      if (!["100644", "100755"].includes(blob.mode)) throw new Error("nonregular scanner source requires setup");
      const file = join(checkout, blob.path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, blob.bytes, { flag: "wx", mode: blob.mode === "100755" ? 0o755 : 0o644 });
    }
    writeFileSync(bindingsPath, snapshot.protocol.bytes, { flag: "wx", mode: 0o600 });
    for (const file of [stdout, stderr]) writeFileSync(file, "", { flag: "wx", mode: 0o600 });
    const args = [
      isAbsolute(runtime) ? runtime : join(checkout, runtime), ...snapshot.settings.scanner.argv.slice(1),
      "--protocol-bindings", bindingsPath, "--protocol-json", output,
    ];
    before = captureRepositoryState(checkout);
    result.process = await executeOwnedProcess({ argv: args, cwd: checkout, env, watched_outputs: [output], stdout, stderr, timeout_ms: timeout, started: pid => {
      writeFileSync(join(root, "process-start.json"), canonicalJSON({ pid, argv: args, source_commit: snapshot.source_commit }), { flag: "wx", mode: 0o600 });
    } });
    writeFileSync(join(root, "process-result.json"), canonicalJSON(result.process), { flag: "wx", mode: 0o600 });
    try {
      if (outputSize(bindingsPath) > OUTPUT_LIMIT) throw new Error("invalid bindings file");
      verifyProtocolBindings(readFileSync(bindingsPath), snapshot.protocol);
    } catch { gap("bindings-changed", "The scanner changed or removed its owned bindings file."); }
    if (result.process.exit_code !== 0 || !result.process.reaped || result.process.timed_out ||
        result.process.cancelled || result.process.output_limit) {
      gap("scanner-process", "The scanner failed, timed out, was cancelled or exceeded its output bound.");
    }
    if (outputSize(output) > OUTPUT_LIMIT) throw new Error("scanner output bound");
    const parsed: unknown = JSON.parse(decodeUTF8(readFileSync(output)));
    const assessment = assessScan(parsed, snapshot);
    const processDiagnostics = result.diagnostics;
    Object.assign(result, assessment, { diagnostics: [...processDiagnostics, ...assessment.diagnostics] });
  } catch {
    gap("scanner-incomplete", "Scanner setup, execution, output or retained bindings could not be verified.");
  } finally {
    try {
      if (before && !same(captureRepositoryState(result.checkout), before)) gap("scanner-mutation", "The scanner changed its committed source, files or Git state.");
      if (original && !same(captureRepositoryState(snapshot.repo), original)) gap("caller-changed", "The original caller state changed during collection.");
    } catch { gap("scanner-state-unavailable", "The final source mutation check is unavailable."); }
    result.complete = result.diagnostics.length === 0;
  }
  return result;
}
