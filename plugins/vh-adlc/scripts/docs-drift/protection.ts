import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readDocumentMetadata, resolveRoots } from "../docs-impact/collection";
import { compileCoverage } from "../docs-impact/matching";
import { collectionReaders, verifiedHelperEnvironment } from "./git";
import { canonicalDigest, decodeUTF8, protocolPath, sha256, withinPrefix } from "./protocol";
import type { Snapshot } from "./snapshot";

type Range = { start: number; end: number };
export type ProtectedEdit = Range & { path: string; replacement: Uint8Array; before_sha256: string | null;
  action?: "replace" | "create" | "delete" | "chmod"; after_mode?: "100644" | "100755" | null };
type Quote = Range & { sha256: string };
type LocalRange = {
  document: string; document_sha256: string; procedure_sha256: string; procedure_quote: Quote; ranges: Range[];
};
type Coordinated = { feature?: string; writer?: string; document: string; source_commit: string; selection_sha256: string };
type LocalCoverage = {
  dialect: "feature" | "documentation"; terminal_statuses: string[]; procedure_sha256: string; procedure_quote: Quote;
};
export type ProtectionContext = {
  coordinated?: Coordinated[];
  local_ranges?: LocalRange[];
  local_coverage?: LocalCoverage;
  other_writers?: Array<{ writer: string; document: string; document_sha256: string }>;
  document_kinds?: Array<{ document: string; document_sha256: string; kind: "ordinary" | "plan" | "review" | "evidence" | "unknown" }>;
};
type Feature = { path: string; branch: string | null; historical: boolean; patterns: Array<(path: string) => boolean> };
type AffectedFeature = { path: string; historical: boolean; claimed: boolean };
export type ProtectionResult = {
  complete: boolean;
  diagnostics: Array<{ code: string; path?: string; message: string }>;
  edits: Array<{ path: string; allowed: boolean; reason: string; bytes: Buffer | null; affected_features: AffectedFeature[] }>;
};

const statuses = ["draft", "planned", "in-progress", "complete", "blocked", "parked", "abandoned", "superseded", "archived"];
const terminal = ["complete", "abandoned", "superseded", "archived"];
const requiredSections = ["Context", "Scope", "Design", "Acceptance Criteria", "Test Plan", "Tasks", "Open Questions", "Review Log"];

function validRange(range: Range, length: number): boolean {
  return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.start >= 0 && range.end >= range.start && range.end <= length;
}

function overlaps(edit: Range, protectedRange: Range): boolean {
  if (edit.start === edit.end) return edit.start >= protectedRange.start && edit.start <= protectedRange.end;
  return edit.start < protectedRange.end && edit.end > protectedRange.start;
}

/** All feature sections include governance or provenance. Only an unclaimed introduction can be edited. */
function standardLayout(bytes: Buffer): { protected: Range[]; shape: string[]; fence_state: string | null } {
  const text = decodeUTF8(bytes);
  const lines: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
    const end = start + Buffer.byteLength(line);
    lines.push({ text: line.replace(/\r?\n$/u, ""), start, end });
    start = end;
  }
  let headerEnd = -1;
  if (/^\uFEFF?---[ \t]*$/u.test(lines[0]?.text ?? "")) {
    for (const line of lines.slice(1)) if (/^---[ \t]*$/u.test(line.text)) { headerEnd = line.end; break; }
  }
  const shape: string[] = [];
  const sections: string[] = [];
  let firstSection = -1;
  let fence: string | null = null;
  for (const line of lines) {
    if (line.start < headerEnd) continue;
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line.text)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.text.trim() === marker) fence = null;
      continue;
    }
    if (marker) { fence = marker; continue; }
    const heading = /^(#{1,6}) (.*)$/u.exec(line.text);
    if (!heading) continue;
    shape.push(heading[1] === "##" ? "## " + heading[2].trim() : heading[1]);
    if (heading[1] === "##") {
      if (firstSection < 0) firstSection = line.start;
      sections.push(heading[2].trim());
    }
  }
  const ambiguous = headerEnd < 0 || firstSection < 0 || fence !== null ||
    requiredSections.some(section => sections.filter(value => value === section).length !== 1);
  return {
    protected: ambiguous ? [{ start: 0, end: bytes.length }] : [{ start: 0, end: headerEnd }, { start: firstSection, end: bytes.length }],
    shape, fence_state: fence,
  };
}

function procedureEvidence(snapshot: Snapshot, evidence: { procedure_sha256: string; procedure_quote: Quote }): boolean {
  const procedure = snapshot.blobs.find(blob => blob.path === snapshot.settings.project_procedure);
  const quote = evidence.procedure_quote;
  return procedure !== undefined && evidence.procedure_sha256 === sha256(procedure.bytes) &&
    validRange(quote, procedure.bytes.length) && quote.start < quote.end &&
    sha256(procedure.bytes.subarray(quote.start, quote.end)) === quote.sha256;
}

function localEditable(bytes: Buffer, path: string, snapshot: Snapshot, edit: Range, context: ProtectionContext): boolean {
  const matching = context.local_ranges?.filter(rule => rule.document === path) ?? [];
  if (matching.length !== 1) return false;
  const rule = matching[0];
  if (rule.document_sha256 !== sha256(bytes) || !procedureEvidence(snapshot, rule)) return false;
  if (!Array.isArray(rule.ranges) || rule.ranges.some(range => !validRange(range, bytes.length))) return false;
  return rule.ranges.some(range => edit.start >= range.start && edit.end <= range.end);
}

function sourceLocalCoverage(snapshot: Snapshot, yaml: (bytes: Uint8Array) => unknown): ProtectionContext["local_coverage"] {
  const procedure = snapshot.blobs.find(blob => blob.path === snapshot.settings.project_procedure);
  if (!procedure) return undefined;
  const value = readDocumentMetadata(procedure.bytes, yaml)?.docs_drift_local_coverage;
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Project-local coverage declaration must be a mapping");
  const policy = value as Record<string, unknown>;
  if (Object.keys(policy).sort().join(",") !== "dialect,terminal_statuses"
    || policy.dialect !== "feature" && policy.dialect !== "documentation" || !Array.isArray(policy.terminal_statuses)
    || policy.terminal_statuses.some(status => typeof status !== "string" || !status.trim())
    || new Set(policy.terminal_statuses).size !== policy.terminal_statuses.length) throw Error("Project-local coverage declaration fields changed");
  const digest = sha256(procedure.bytes);
  return { dialect: policy.dialect, terminal_statuses: policy.terminal_statuses, procedure_sha256: digest,
    procedure_quote: { start: 0, end: procedure.bytes.length, sha256: digest } };
}

/** This checks proposal eligibility. Exact execution selection and independent review remain separate. */
export function evaluateProtection(repo: string, snapshot: Snapshot, edits: ProtectedEdit[], context: ProtectionContext = {}): ProtectionResult {
  const result: ProtectionResult = {
    complete: false, diagnostics: [], edits: edits.map(edit => ({ path: edit.path, allowed: false, reason: "incomplete-policy", bytes: null, affected_features: [] })),
  };
  const gap = (code: string, path: string | undefined, message: string) => result.diagnostics.push({ code, ...(path ? { path } : {}), message });
  const readers = collectionReaders();
  const roots = resolveRoots(repo, readers);
  if (roots.head !== snapshot.source_commit || !["declared", "absent"].includes(roots.outcome) || roots.diagnostics.length > 0) {
    for (const diagnostic of roots.diagnostics) gap(diagnostic.code, diagnostic.path, diagnostic.message);
    if (result.diagnostics.length === 0) gap("assessment-source", undefined, "Protection requires the exact committed assessment and complete root classification.");
    return result;
  }
  if (roots.policy.local_format && context.local_coverage === undefined) {
    try { context = { ...context, local_coverage: sourceLocalCoverage(snapshot, readers.yaml) }; }
    catch (error) {
      gap("feature-classification", snapshot.settings.project_procedure, error instanceof Error ? error.message : "Project-local coverage unavailable");
      return result;
    }
  }
  const features: Feature[] = [];
  for (const blob of snapshot.blobs) {
    if (!withinPrefix(blob.path, roots.policy.feature_root) || !/\.(md|mdx|markdown)$/iu.test(blob.path)) continue;
    try {
      const metadata = readDocumentMetadata(blob.bytes, readers.yaml);
      if (!metadata) throw new Error("feature metadata absent");
      if (metadata.branch !== undefined && (typeof metadata.branch !== "string" || !metadata.branch.trim())) throw new Error("feature branch malformed");
      if (!roots.policy.local_format && (typeof metadata.status !== "string" || !statuses.includes(metadata.status))) throw new Error("feature status malformed");
      if (!roots.policy.local_format && !Object.hasOwn(metadata, "covers")) throw new Error("feature coverage absent");
      const covers = metadata.covers ?? [];
      if (!Array.isArray(covers) || covers.some(value => typeof value !== "string")) throw new Error("feature coverage malformed");
      const local = context.local_coverage;
      if (roots.policy.local_format && covers.length > 0 && (!local || !procedureEvidence(snapshot, local))) throw new Error("local coverage requires its retained project matcher");
      if (local && (!["feature", "documentation"].includes(local.dialect) || !Array.isArray(local.terminal_statuses) ||
          local.terminal_statuses.some(status => typeof status !== "string" || !status))) throw new Error("local coverage malformed");
      const closed = roots.policy.local_format ? local?.terminal_statuses ?? [] : terminal;
      const dialect = roots.policy.local_format ? local?.dialect ?? "feature" : "feature";
      features.push({
        path: blob.path, branch: typeof metadata.branch === "string" ? metadata.branch : null,
        historical: typeof metadata.status === "string" && closed.includes(metadata.status),
        patterns: covers.map(pattern => compileCoverage(pattern, dialect)),
      });
    } catch { gap("feature-classification", blob.path, "Feature ownership or coverage cannot be classified from committed metadata."); }
  }
  if (result.diagnostics.length > 0) return result;
  const inventory = new Set(snapshot.protocol.bindings.documents.map(row => row[0]));
  for (let index = 0; index < edits.length; index++) {
    const edit = edits[index];
    const decision = result.edits[index];
    try {
      protocolPath(edit.path);
      const blob = snapshot.blobs.find(blob => blob.path === edit.path);
      const action = edit.action ?? "replace", bytes = blob ? Buffer.from(blob.bytes) : Buffer.alloc(0);
      const inScope = (snapshot.settings.roots.some(root => withinPrefix(edit.path, root))
        && !snapshot.settings.exclusions.some(root => withinPrefix(edit.path, root))) || snapshot.settings.feedback_files.includes(edit.path);
      if (!inScope || !["replace", "create", "delete", "chmod"].includes(action)
        || edit.before_sha256 !== (blob ? sha256(bytes) : null) || !validRange(edit, bytes.length)
        || (action === "create" ? blob !== undefined || edit.start !== 0 || edit.end !== 0 : blob === undefined)
        || (edit.after_mode !== undefined && edit.after_mode !== null && !["100644", "100755"].includes(edit.after_mode))) throw new Error("edit source mismatch");
      if (action === "delete" && (edit.start !== 0 || edit.end !== bytes.length || edit.replacement.length !== 0 || edit.after_mode !== null)) throw new Error("delete scope");
      if (action !== "delete" && edit.after_mode === null) throw new Error("missing file mode");
      if (action === "chmod" && (edit.start !== 0 || edit.end !== 0 || edit.replacement.length !== 0 || edit.after_mode === undefined)) throw new Error("mode scope");
      if (!blob && edit.after_mode === undefined) throw new Error("create mode required");
      let prose = true;
      try { decodeUTF8(bytes); if (bytes.includes(0)) prose = false; } catch { prose = false; }
      if (!inventory.has(edit.path) && !snapshot.settings.suffixes.some(suffix => edit.path.endsWith(suffix))) {
        try { decodeUTF8(edit.replacement); if (Buffer.from(edit.replacement).includes(0)) prose = false; } catch { prose = false; }
      }
      if (!prose && (inventory.has(edit.path) || snapshot.settings.suffixes.some(suffix => edit.path.endsWith(suffix)))) throw new Error("declared prose cannot become a binary asset");
      if (prose && action !== "chmod") {
        decodeUTF8(bytes.subarray(0, edit.start)); decodeUTF8(bytes.subarray(edit.end)); decodeUTF8(edit.replacement);
      } else if (!prose && action !== "chmod" && (edit.start !== 0 || edit.end !== bytes.length)) throw new Error("binary needs full-file selection");
      if (!blob && withinPrefix(edit.path, roots.policy.feature_root)) { decision.reason = "feature-creation-requires-lifecycle"; continue; }
      const ownFeature = features.find(feature => feature.path === edit.path);
      decision.affected_features = features.filter(feature => feature.path !== edit.path && feature.patterns.some(pattern => pattern(edit.path)))
        .map(feature => ({ path: feature.path, historical: feature.historical, claimed: feature.branch !== null }));
      if (ownFeature?.branch) { decision.reason = "claimed-feature"; continue; }
      const conflict = decision.affected_features.find(feature => feature.claimed && !feature.historical &&
        !context.coordinated?.some(selection => selection.feature === feature.path && selection.document === edit.path &&
          selection.source_commit === snapshot.source_commit && /^[a-f0-9]{64}$/u.test(selection.selection_sha256)));
      if (conflict) { decision.reason = "active-feature-overlap"; continue; }
      const writers = context.other_writers?.filter(writer => writer.document === edit.path) ?? [];
      if (writers.some(writer => writer.document_sha256 !== sha256(bytes) ||
          !context.coordinated?.some(selection => selection.writer === writer.writer && selection.document === edit.path &&
            selection.source_commit === snapshot.source_commit && /^[a-f0-9]{64}$/u.test(selection.selection_sha256)))) {
        decision.reason = "other-current-writer";
        continue;
      }
      const metadata = prose ? readDocumentMetadata(bytes, readers.yaml) : null;
      const declaredKind = context.document_kinds?.find(item => item.document === edit.path && item.document_sha256 === sha256(bytes))?.kind;
      const historyKind = ownFeature !== undefined || ["plan", "review", "evidence", "report"].includes(String(metadata?.type)) ||
        ["plan", "review", "evidence", "unknown"].includes(declaredKind ?? "");
      const unclassifiedLocal = roots.policy.local_format && (historyKind || (declaredKind !== "ordinary" &&
        !["guide", "guideline", "architecture", "principle", "standard", "decision"].includes(String(metadata?.type))));
      if ((ownFeature || historyKind || unclassifiedLocal) && action !== "replace") { decision.reason = "governed-file-transition"; continue; }
      if (unclassifiedLocal || (!ownFeature && historyKind)) {
        if (!localEditable(bytes, edit.path, snapshot, edit, context)) { decision.reason = "unclassified-local-range"; continue; }
      } else if (ownFeature) {
        if (standardLayout(bytes).protected.some(range => overlaps(edit, range))) { decision.reason = "protected-feature-range"; continue; }
      }
      const selected = edits.filter(item => item.path === edit.path);
      if (selected.length > 1 && selected.some(item => ["create", "delete"].includes(item.action ?? "replace"))) throw new Error("conflicting file transitions");
      const modes = new Set(selected.map(item => item.after_mode ?? blob?.mode ?? null));
      if (modes.size !== 1) throw new Error("conflicting file modes");
      const replacements = selected.filter(item => (item.action ?? "replace") !== "chmod");
      for (const [position, item] of replacements.entries()) if (replacements.slice(position + 1).some(other => overlaps(item, other)
        || overlaps(other, item))) throw new Error("conflicting edit ranges");
      let after: Buffer | null = action === "delete" ? null : Buffer.from(bytes);
      for (const item of [...replacements].sort((left, right) => right.start - left.start || right.end - left.end)) {
        if (after === null) break;
        after = Buffer.concat([after.subarray(0, item.start), Buffer.from(item.replacement), after.subarray(item.end)]);
      }
      if (prose && after !== null && action !== "chmod") decodeUTF8(after);
      if (ownFeature || historyKind || unclassifiedLocal) {
        const prior = standardLayout(bytes);
        if (after === null) throw new Error("governed deletion");
        const next = standardLayout(after);
        if (canonicalDigest([next.shape, next.fence_state]) !== canonicalDigest([prior.shape, prior.fence_state])) {
          decision.reason = "governed-document-structure-change";
          continue;
        }
      }
      decision.allowed = true;
      decision.reason = "eligible-proposal";
      decision.bytes = after;
    } catch { gap("edit-source", edit.path, "The proposed range or document does not match the exact source bytes."); }
  }
  result.complete = result.diagnostics.length === 0;
  if (!result.complete) for (const decision of result.edits) { decision.allowed = false; decision.bytes = null; }
  return result;
}

export type FeatureFreshness = {
  spec_review: { stale: boolean; reasons: string[] };
  implementation_review: { stale: boolean; reasons: string[] };
  feature_tree: { clean: boolean; paths: string[] };
};

/** Ask the existing verified binary. Coverage matching never supplies a freshness verdict. */
export function observeFeatureFreshness(repo: string, feature: string): FeatureFreshness {
  protocolPath(feature);
  const readers = collectionReaders();
  const roots = resolveRoots(repo, readers);
  if (!roots.head || roots.outcome === "incomplete" || roots.diagnostics.length > 0 || roots.policy.excluded_dirty) {
    throw new Error("freshness requires complete committed root policy");
  }
  const installer = Bun.spawnSync(["bash", join(import.meta.dir, "../ensure-vh-adlc.sh"), "--offline"], { env: verifiedHelperEnvironment(), stdout: "pipe", stderr: "pipe" });
  if (installer.exitCode !== 0) throw new Error("verified freshness binary unavailable");
  const binary = installer.stdout.toString().trim();
  const pin = readFileSync(join(import.meta.dir, "../../knowledge.md"), "utf8").match(/\b[a-f0-9]{40}\b/u)?.[0];
  if (!binary || !pin) throw new Error("verified freshness setup unavailable");
  const run = Bun.spawnSync([binary, "fresh", feature, "--repo", repo, "--plugin-pin", pin, "--offline"], {
    env: verifiedHelperEnvironment(), stdout: "pipe", stderr: "pipe",
  });
  const value: unknown = JSON.parse(decodeUTF8(run.stdout));
  if (value === null || typeof value !== "object" || !("command" in value) || value.command !== "fresh" ||
      !("result" in value) || value.result !== "answered" || run.exitCode !== 0 || !("data" in value)) throw new Error("native freshness observation unavailable");
  const data = value.data;
  if (data === null || typeof data !== "object") throw new Error("native freshness data unavailable");
  const state = (name: string) => {
    if (!(name in data)) throw new Error("missing freshness state");
    const item: unknown = data[name as keyof typeof data];
    if (item === null || typeof item !== "object" || !("stale" in item) || typeof item.stale !== "boolean" ||
        !("reasons" in item) || !Array.isArray(item.reasons) || item.reasons.some(reason => typeof reason !== "string")) throw new Error("invalid freshness state");
    return { stale: item.stale, reasons: item.reasons as string[] };
  };
  if (!("feature_tree" in data)) throw new Error("missing feature tree");
  const tree = data.feature_tree;
  if (tree === null || typeof tree !== "object" || !("clean" in tree) || typeof tree.clean !== "boolean" ||
      !("paths" in tree) || !Array.isArray(tree.paths) || tree.paths.some(path => typeof path !== "string")) throw new Error("invalid feature tree");
  return { spec_review: state("spec_review"), implementation_review: state("implementation_review"), feature_tree: { clean: tree.clean, paths: tree.paths as string[] } };
}
