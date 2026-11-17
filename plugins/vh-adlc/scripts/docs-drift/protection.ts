import { sourceProtection } from "./protection-source";
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
type LocalRange = {
  document: string; document_sha256: string; ranges: Range[];
};
type Coordinated = { feature?: string; writer?: string; document: string; source_commit: string; selection_sha256: string };
type LocalCoverage = {
  dialect: "feature" | "documentation"; terminal_statuses: string[];
  statuses?: string[]; status_aliases?: Record<string, string>; required_fields?: string[]; acceptance_headings?: string[];
};
type LocalDocument = { patterns: string[]; exclude_patterns: string[]; kind: "ordinary" | "plan";
  editable_parts: Array<"frontmatter" | "acceptance-checkboxes"> };
export type ProtectionContext = {
  coordinated?: Coordinated[];
  local_ranges?: LocalRange[];
  local_coverage?: LocalCoverage;
  other_writers?: Array<{ writer: string; document: string; document_sha256: string }>;
  document_kinds?: Array<{ document: string; document_sha256: string; kind: "ordinary" | "plan" | "review" | "evidence" | "unknown" }>;
  local_documents?: LocalDocument[];
};
type Feature = { path: string; branch: string | null; historical: boolean; patterns: Array<(path: string) => boolean>; local?: LocalDocument };
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

type MarkdownLine = Range & { text: string; heading?: { level: number; title: string; atx: boolean } };

/** One byte-based walker supplies enrollment, governed structure and checkbox boundaries. */
function markdownLayout(bytes: Buffer) {
  const raw: MarkdownLine[] = [];
  let start = 0;
  for (const text of decodeUTF8(bytes).match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
    const end = start + Buffer.byteLength(text);
    raw.push({ text: text.replace(/\r?\n$/u, ""), start, end });
    start = end;
  }
  let frontmatter: Range | null = null, headerEnd = -1;
  if (/^\uFEFF?---[ \t]*$/u.test(raw[0]?.text ?? "")) {
    const close = raw.slice(1).find(line => /^---[ \t]*$/u.test(line.text));
    if (close) { frontmatter = { start: raw[0].end, end: close.start }; headerEnd = close.end; }
  }
  const lines: MarkdownLine[] = [];
  let fence: string | null = null;
  for (const line of raw) {
    if (line.start < headerEnd) continue;
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line.text)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.text.trim() === marker) fence = null;
      continue;
    }
    if (marker) { fence = marker; continue; }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/u.exec(line.text);
    if (atx) line.heading = { level: atx[1].length, title: (atx[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim(), atx: true };
    const setext = /^ {0,3}(=+|-+)[ \t]*$/u.exec(line.text), previous = lines.at(-1);
    if (setext && previous?.text.trim() && !previous.heading && previous.end === line.start)
      previous.heading = { level: setext[1][0] === "=" ? 1 : 2, title: previous.text.trim(), atx: false };
    lines.push(line);
  }
  return { lines, frontmatter, headerEnd, fence_state: fence };
}

/** All feature sections include governance or provenance. Only an unclaimed introduction can be edited. */
function standardLayout(bytes: Buffer): { protected: Range[]; shape: string[]; fence_state: string | null; enrolled: boolean } {
  const layout = markdownLayout(bytes), shape: string[] = [], sections: string[] = [];
  let firstSection = -1;
  const enrolled = layout.lines.some(line => /^ {0,3}\|/u.test(line.text) && line.text.trim().endsWith("|") &&
    line.text.trim().slice(1, -1).split("|").map(column => column.trim()).join("|") === "Date|Review|Kind|Commit|Model|Isolation|Outcome");
  for (const line of layout.lines) {
    const heading = line.heading;
    if (!heading) continue;
    shape.push(heading.level === 2 ? "## " + heading.title : "#".repeat(heading.level));
    if (heading.atx && heading.level === 2) {
      if (firstSection < 0) firstSection = line.start;
      sections.push(heading.title);
    }
  }
  const ambiguous = layout.headerEnd < 0 || firstSection < 0 || layout.fence_state !== null ||
    requiredSections.some(section => sections.filter(value => value === section).length !== 1);
  return { protected: ambiguous ? [{ start: 0, end: bytes.length }]
    : [{ start: 0, end: layout.headerEnd }, { start: firstSection, end: bytes.length }],
    shape, fence_state: layout.fence_state, enrolled };
}

function localEditable(path: string, edit: Range, context: ProtectionContext): boolean {
  const matching = context.local_ranges?.filter(rule => rule.document === path) ?? [];
  if (matching.length !== 1) return false;
  const rule = matching[0];
  return rule.ranges.some(range => edit.start >= range.start && edit.end <= range.end);
}

/** Checkbox offsets are derived from raw bytes. Heading ambiguity never grants an editable range. */
function localCheckboxes(bytes: Buffer, titles: string[]): number[] {
  const { lines, fence_state } = markdownLayout(bytes);
  if (fence_state) return [];
  const sections = lines.filter(line => line.heading?.atx && titles.includes(line.heading.title));
  if (sections.length !== 1) return [];
  const section = sections[0], level = section.heading?.level;
  if (level === undefined) return [];
  const positions: number[] = [];
  let protectedLevel: number | null = null;
  for (const line of lines.slice(lines.indexOf(section) + 1)) {
    if (line.heading) {
      if (line.heading.level <= level) break;
      if (protectedLevel !== null && line.heading.level <= protectedLevel) protectedLevel = null;
      if (["Evidence", "Residuals", "Review Log", "Tasks"].includes(line.heading.title)) protectedLevel = line.heading.level;
    }
    if (protectedLevel !== null) continue;
    const checkbox = /^([ \t]*(?:[-*+]|[0-9]+[.)]) \[)([ xX])\][ \t]+\S/u.exec(line.text);
    if (checkbox) positions.push(line.start + Buffer.byteLength(checkbox[1]));
  }
  return positions;
}

function frontmatterFields(bytes: Buffer, metadata: Record<string, unknown>) {
  const range = markdownLayout(bytes).frontmatter;
  if (!range) return null;
  const { start, end } = range, body = decodeUTF8(bytes.subarray(start, end));
  const keys = [...body.matchAll(/^([A-Za-z_][A-Za-z0-9_]*):/gmu)];
  if (keys.length !== Object.keys(metadata).length || keys.some(row => !Object.hasOwn(metadata, row[1]))) return null;
  return { start, end, prefix: body.slice(0, keys[0]?.index ?? body.length),
    fields: keys.map((row, index) => ({ key: row[1], raw: body.slice(row.index, keys[index + 1]?.index ?? body.length) })) };
}

/** Preserve comments verbatim even in selected fields. Quoted # characters belong to their value. */
function yamlComments(raw: string): string[] {
  const comments: string[] = [];
  let quote: string | null = null;
  let blockIndent: number | null = null, flow = 0;
  for (const line of raw.split("\n")) {
    const indent = /^[ \t]*/u.exec(line)?.[0].length ?? 0;
    if (blockIndent !== null && (!line.trim() || indent > blockIndent)) continue;
    blockIndent = null;
    let plain = false;
    for (let at = 0; at < line.length; at++) {
      const char = line[at];
      if (quote === '"' && char === "\\") { at++; continue; }
      if (quote === "'" && char === "'" && line[at + 1] === "'") { at++; continue; }
      if (quote) { if (char === quote) { quote = null; plain = true; } continue; }
      if (char === "#" && (at === 0 || /\s/u.test(line[at - 1]))) { comments.push(line.slice(at)); break; }
      if (!plain && (char === '"' || char === "'")) { quote = char; continue; }
      if (!plain && (char === "[" || char === "{")) { flow++; continue; }
      if (flow && (char === "]" || char === "}")) { flow--; plain = true; continue; }
      if (flow && char === "," || char === ":" && (at + 1 === line.length || /\s/u.test(line[at + 1]))) { plain = false; continue; }
      if (!/\s/u.test(char)) plain = true;
    }
    if (!quote && /:\s*[|>][+\-0-9]*(?:\s+#.*)?\s*$/u.test(line)) blockIndent = indent;
  }
  return comments;
}

function localPlanEdit(before: Buffer, after: Buffer, edits: ProtectedEdit[], rule: LocalDocument,
  coverage: LocalCoverage | undefined, yaml: (bytes: Uint8Array) => unknown): boolean {
  if (!coverage) return false;
  const checkboxes = rule.editable_parts.includes("acceptance-checkboxes") ? localCheckboxes(before, coverage.acceptance_headings ?? []) : [];
  const frontmatter = edits.filter(edit => !checkboxes.some(at => edit.start === at && edit.end === at + 1 &&
    edit.replacement.length === 1 && [32, 120, 88].includes(edit.replacement[0])));
  if (!frontmatter.length) return true;
  const prior = readDocumentMetadata(before, yaml) ?? {}, next = readDocumentMetadata(after, yaml);
  if (!next) return false;
  const oldFields = frontmatterFields(before, prior) ?? (Object.keys(prior).length === 0
    ? { start: 0, end: 0, prefix: "", fields: [] } : null), newFields = frontmatterFields(after, next);
  if (!rule.editable_parts.includes("frontmatter") || !oldFields || !newFields
    || frontmatter.some(edit => edit.start < oldFields.start || edit.end > oldFields.end)) return false;
  // Header edits cannot move any inserted bytes past the resulting closing delimiter.
  const headerDelta = frontmatter.reduce((length, edit) => length + edit.replacement.length - (edit.end - edit.start), 0);
  if (markdownLayout(after).headerEnd !== Math.max(0, markdownLayout(before).headerEnd) + headerDelta) return false;
  const oldKeys = oldFields.fields.map(field => field.key);
  if (canonicalDigest(newFields.fields.filter(field => Object.hasOwn(prior, field.key)).map(field => field.key)) !== canonicalDigest(oldKeys)
    || oldFields.prefix !== newFields.prefix) return false;
  for (const field of oldFields.fields) {
    const current = newFields.fields.find(row => row.key === field.key);
    if (!current) return false;
    if (canonicalDigest(prior[field.key]) === canonicalDigest(next[field.key]) && field.raw !== current.raw) return false;
    if (canonicalDigest(yamlComments(field.raw)) !== canonicalDigest(yamlComments(current.raw))) return false;
  }
  for (const key of Object.keys(next)) {
    if (Object.hasOwn(prior, key) && canonicalDigest(prior[key]) === canonicalDigest(next[key])) continue;
    if (!Object.hasOwn(prior, key) && !coverage.required_fields?.includes(key)) return false;
    if (key === "status") {
      if (typeof next.status !== "string") return false;
      if (Object.hasOwn(prior, key)) {
        if (typeof prior.status !== "string" || coverage.status_aliases?.[prior.status] !== next.status) return false;
      } else if (!coverage.statuses?.includes(next.status) || coverage.terminal_statuses.includes(next.status)) return false;
    } else if (key === "covers") {
      if (!Array.isArray(next.covers) || next.covers.some(pattern => typeof pattern !== "string")) return false;
      try { for (const pattern of next.covers) compileCoverage(pattern, coverage.dialect); }
      catch { return false; }
    } else if (key === "status_description") {
      if (typeof next[key] !== "string" || !next[key].trim()) return false;
    } else if (Object.hasOwn(prior, key) || !coverage.required_fields?.includes(key)) return false;
  }
  return true;
}

function sourceLocalCoverage(snapshot: Snapshot, yaml: (bytes: Uint8Array) => unknown, mixed = false): ProtectionContext["local_coverage"] {
  const procedure = snapshot.blobs.find(blob => blob.path === snapshot.settings.project_procedure);
  if (!procedure) return undefined;
  const value = readDocumentMetadata(procedure.bytes, yaml)?.docs_drift_local_coverage;
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Project-local coverage declaration must be a mapping");
  const policy = value as Record<string, unknown>;
  const added = ["statuses", "status_aliases", "required_fields", "acceptance_headings"];
  if (Object.keys(policy).some(key => !["dialect", "terminal_statuses", ...added].includes(key))
    || policy.dialect !== "feature" && policy.dialect !== "documentation" || !Array.isArray(policy.terminal_statuses)
    || policy.terminal_statuses.some(status => typeof status !== "string" || !status.trim())
    || new Set(policy.terminal_statuses).size !== policy.terminal_statuses.length) throw Error("Project-local coverage declaration fields changed");
  const additional: Pick<LocalCoverage, "statuses" | "status_aliases" | "required_fields" | "acceptance_headings"> = {};
  if (mixed) {
    const strings = (value: unknown): string[] => {
      if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim()) || new Set(value).size !== value.length)
        throw Error("Mixed-plan coverage lists must contain unique nonempty strings");
      return value;
    };
    additional.statuses = strings(policy.statuses);
    additional.required_fields = strings(policy.required_fields);
    additional.acceptance_headings = strings(policy.acceptance_headings);
    const aliases = policy.status_aliases;
    if (!additional.statuses.length || additional.required_fields.some(field => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(field))
      || aliases === null || typeof aliases !== "object" || Array.isArray(aliases)) throw Error("Mixed-plan coverage fields invalid");
    additional.status_aliases = {};
    for (const [alias, target] of Object.entries(aliases)) {
      if (!alias.trim() || typeof target !== "string" || !additional.statuses.includes(target)) throw Error("Mixed-plan status alias invalid");
      additional.status_aliases[alias] = target;
    }
    if (policy.terminal_statuses.some(status => !additional.statuses?.includes(status))) throw Error("Mixed-plan terminal status must be canonical");
  }
  return { dialect: policy.dialect, terminal_statuses: policy.terminal_statuses, ...additional };
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
  const localDocuments = new Map<string, LocalDocument>();
  try {
    if (context === null || typeof context !== "object" || Array.isArray(context)
      || Object.keys(context).some(key => key !== "coordinated")) throw Error("Caller protection policy is not accepted");
    const committed = sourceProtection(snapshot, readers.yaml);
    context = { ...committed, coordinated: context.coordinated };
    if (!roots.policy.local_format) {
      const rules = (context.local_documents ?? []).map(rule => ({ rule,
        patterns: rule.patterns.map(pattern => compileCoverage(pattern, "documentation")),
        excluded: rule.exclude_patterns.map(pattern => compileCoverage(pattern, "documentation")) }));
      for (const blob of snapshot.blobs) {
        if (!withinPrefix(blob.path, roots.policy.feature_root) || !/\.(md|mdx|markdown)$/iu.test(blob.path)
          || standardLayout(Buffer.from(blob.bytes)).enrolled) continue;
        const matching = rules.filter(row => row.patterns.some(pattern => pattern(blob.path)) && !row.excluded.some(pattern => pattern(blob.path)));
        if (!matching.length) continue;
        const selected = matching[0].rule;
        if (matching.some(row => row.rule.kind !== selected.kind || canonicalDigest([...row.rule.editable_parts].sort()) !== canonicalDigest([...selected.editable_parts].sort())))
          throw Error("Conflicting project local-document classifications");
        if (context.document_kinds?.some(row => row.document === blob.path) || context.local_ranges?.some(row => row.document === blob.path))
          throw Error("Project local-document classification overlaps a digest-bound declaration");
        localDocuments.set(blob.path, selected);
      }
    }
  } catch (error) {
    gap("project-protection", snapshot.settings.project_procedure, error instanceof Error ? error.message : "Project protection unavailable");
    return result;
  }
  const mixedPlans = [...localDocuments.values()].some(rule => rule.kind === "plan");
  if (roots.policy.local_format || mixedPlans) {
    try {
      context = { ...context, local_coverage: sourceLocalCoverage(snapshot, readers.yaml, mixedPlans) };
      if (mixedPlans && !context.local_coverage) throw Error("Mixed-plan coverage declaration required");
    }
    catch (error) {
      gap("feature-classification", snapshot.settings.project_procedure, error instanceof Error ? error.message : "Project-local coverage unavailable");
      return result;
    }
  }
  const features: Feature[] = [];
  for (const blob of snapshot.blobs) {
    if (!withinPrefix(blob.path, roots.policy.feature_root) || !/\.(md|mdx|markdown)$/iu.test(blob.path)) continue;
    const localRule = localDocuments.get(blob.path);
    if (localRule?.kind === "ordinary") continue;
    try {
      const metadata = readDocumentMetadata(blob.bytes, readers.yaml) ?? (localRule?.kind === "plan" ? {} : null);
      if (!metadata) throw new Error("feature metadata absent");
      if (metadata.branch !== undefined && (typeof metadata.branch !== "string" || !metadata.branch.trim())) throw new Error("feature branch malformed");
      const localPlan = localRule?.kind === "plan", localFormat = roots.policy.local_format || localPlan;
      if (!localFormat && (typeof metadata.status !== "string" || !statuses.includes(metadata.status))) throw new Error("feature status malformed");
      if (!localFormat && !Object.hasOwn(metadata, "covers")) throw new Error("feature coverage absent");
      const covers = metadata.covers ?? [];
      if (!Array.isArray(covers) || covers.some(value => typeof value !== "string")) throw new Error("feature coverage malformed");
      const local = context.local_coverage;
      if (localFormat && covers.length > 0 && !local) throw new Error("local coverage requires its retained project matcher");
      const closed = localFormat ? local?.terminal_statuses ?? [] : terminal;
      const dialect = localFormat ? local?.dialect ?? "feature" : "feature";
      const status = localPlan && typeof metadata.status === "string" ? local?.status_aliases?.[metadata.status] ?? metadata.status : metadata.status;
      features.push({
        path: blob.path, branch: typeof metadata.branch === "string" ? metadata.branch : null,
        historical: typeof status === "string" && closed.includes(status),
        patterns: covers.map(pattern => compileCoverage(pattern, dialect)),
        ...(localPlan ? { local: localRule } : {}),
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
      if (ownFeature?.branch && (!ownFeature.local || !ownFeature.historical)) { decision.reason = "claimed-feature"; continue; }
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
      const historyKind = ownFeature !== undefined || localDocuments.get(edit.path)?.kind !== "ordinary" && ["plan", "review", "evidence", "report"].includes(String(metadata?.type)) ||
        ["plan", "review", "evidence", "unknown"].includes(declaredKind ?? "");
      const unclassifiedLocal = roots.policy.local_format && (historyKind || (declaredKind !== "ordinary" &&
        !["guide", "guideline", "architecture", "principle", "standard", "decision"].includes(String(metadata?.type))));
      if ((ownFeature || historyKind || unclassifiedLocal) && action !== "replace") { decision.reason = "governed-file-transition"; continue; }
      if (unclassifiedLocal || (!ownFeature && historyKind)) {
        if (!localEditable(edit.path, edit, context)) { decision.reason = "unclassified-local-range"; continue; }
      } else if (ownFeature && !ownFeature.local) {
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
      if (ownFeature?.local && (after === null || !localPlanEdit(bytes, after, replacements, ownFeature.local, context.local_coverage, readers.yaml))) {
        decision.reason = "protected-local-plan-range";
        continue;
      }
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
