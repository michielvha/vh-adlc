import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath, sha256, withinPrefix } from "./protocol";
import { collectionReaders } from "./git";
import { captureCallerState, type Snapshot } from "./snapshot";
import { evaluateProtection, type ProtectionContext } from "./protection";
import { recheckResolutionInputs, type ResolutionCollection, type ResolutionHunk, type ResolutionInputs } from "./resolve-inputs";
import type { ScanAssessment } from "./scan";
import type { Settings } from "./settings";

type Quote = { path: string; sha256: string; start: number; end: number; quote_sha256: string };
export type Edit = { id: string; path: string; action: "replace" | "create" | "delete" | "chmod"; start: number; end: number;
  before_sha256: string | null; replacement_base64: string; after_mode: "100644" | "100755" | null };
type Feedback = {
  cause: "detector" | "interpretation"; channel: "suppression" | "correction-history";
  action: "append" | "existing" | "retire"; path: string; edit_id: string | null;
  finding_id: string | null; detector_id: string | null; document: string | null;
  policy_quote: Quote; delivery_quote: Quote | null;
};
export type Decision = { proposal: number; hunk_id: string; disposition: "apply" | "apply-modified" | "already-fixed" | "wrong" | "defer";
  reason: string; evidence: Quote[]; edit_ids: string[]; feedback: Feedback | null; carry: string | null };
type Carry = { proposal: number; hunk_id: string; text: string; request_sha256: string; inputs_sha256: string };
export type Verification = { state: "passed" | "failed" | "unknown"; inputs_sha256: string; artifact_sha256: string; method: string; asset_checks: string[] };
export type ResolutionChange = { path: string; before_sha256: string | null; after_sha256: string | null;
  before_mode: string | null; after_mode: string | null; after_base64: string | null };
export type VerificationScope = { inputs_sha256: string; source_commit: string; decision: Decision; edits: Edit[];
  changes: ResolutionChange[]; scan_sha256: string };
export type ResolutionRecord = {
  schema_version: 1; id: string; repository: string; repository_id: number; assessed_base: string;
  originals: Array<Omit<ResolutionInputs["proposals"][number], "hunks"> & { hunks: Array<Omit<ResolutionHunk, "before_base64" | "after_base64">> }>;
  dispositions: Array<Decision & { changed_paths: string[] }>; postimages: Array<Omit<ResolutionChange, "after_base64">>;
  carried_decisions: Carry[]; source: Pick<Snapshot, "settings_sha256" | "read_set" | "entries" | "absent" | "read_set_sha256" | "history_sha256" | "required_inputs">
    & { scope_sha256: string; feedback_sha256: string }; verification: Array<Verification & { proposal: number; hunk_id: string }>;
  changed_paths: string[];
};
export type ResolutionDraft = { state: "proposal"; complete: boolean; diagnostics: string[]; changes: ResolutionChange[];
  record: ResolutionRecord | null; record_path: string; record_bytes: Buffer | null; record_sha256: string | null };
export type ResolutionOptions = { collection: ResolutionCollection; inputs: ResolutionInputs; scan: ScanAssessment;
  resolution_id: string; decisions: unknown; edits: unknown; carry_decisions: unknown;
  observe_verification: (scope: VerificationScope) => Promise<unknown>; protection_context?: ProtectionContext };

function fail(reason: string): never { throw Error("invalid resolution " + reason); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object");
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) fail("fields");
  return input;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) fail("text");
  canonicalJSON(value);
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail("digest");
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) fail("integer");
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) fail("array");
  const result = value.map(text);
  if (new Set(result).size !== result.length) fail("duplicate identifiers");
  return result;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) fail("choice");
  return value as T;
}
function quote(value: unknown): Quote {
  const input = object(value, ["path", "sha256", "start", "end", "quote_sha256"]);
  const result = { path: protocolPath(input.path), sha256: hash(input.sha256), start: integer(input.start),
    end: integer(input.end), quote_sha256: hash(input.quote_sha256) };
  if (result.start >= result.end) fail("empty evidence quote");
  return result;
}
export function parseEdit(value: unknown): Edit {
  const input = object(value, ["id", "path", "action", "start", "end", "before_sha256", "replacement_base64", "after_mode"]);
  if (typeof input.replacement_base64 !== "string" || Buffer.from(input.replacement_base64, "base64").toString("base64") !== input.replacement_base64) fail("base64 edit");
  return { id: text(input.id), path: protocolPath(input.path), action: choice(input.action, ["replace", "create", "delete", "chmod"]),
    start: integer(input.start), end: integer(input.end), before_sha256: input.before_sha256 === null ? null : hash(input.before_sha256),
    replacement_base64: input.replacement_base64, after_mode: input.after_mode === null ? null : choice(input.after_mode, ["100644", "100755"] as const) };
}
function feedback(value: unknown): Feedback | null {
  if (value === null) return null;
  const input = object(value, ["cause", "channel", "action", "path", "edit_id", "finding_id", "detector_id", "document", "policy_quote", "delivery_quote"]);
  return { cause: choice(input.cause, ["detector", "interpretation"]), channel: choice(input.channel, ["suppression", "correction-history"]),
    action: choice(input.action, ["append", "existing", "retire"]), path: protocolPath(input.path),
    edit_id: input.edit_id === null ? null : text(input.edit_id), finding_id: input.finding_id === null ? null : text(input.finding_id),
    detector_id: input.detector_id === null ? null : text(input.detector_id), document: input.document === null ? null : protocolPath(input.document),
    policy_quote: quote(input.policy_quote), delivery_quote: input.delivery_quote === null ? null : quote(input.delivery_quote) };
}
function decision(value: unknown): Decision {
  const input = object(value, ["proposal", "hunk_id", "disposition", "reason", "evidence", "edit_ids", "feedback", "carry"]);
  if (!Array.isArray(input.evidence)) fail("evidence");
  return { proposal: integer(input.proposal, 1), hunk_id: text(input.hunk_id),
    disposition: choice(input.disposition, ["apply", "apply-modified", "already-fixed", "wrong", "defer"]), reason: text(input.reason),
    evidence: input.evidence.map(quote), edit_ids: strings(input.edit_ids), feedback: feedback(input.feedback), carry: input.carry === null ? null : text(input.carry) };
}
function carry(value: unknown): Carry {
  const input = object(value, ["proposal", "hunk_id", "text", "request_sha256", "inputs_sha256"]);
  return { proposal: integer(input.proposal, 1), hunk_id: text(input.hunk_id), text: text(input.text), request_sha256: hash(input.request_sha256), inputs_sha256: hash(input.inputs_sha256) };
}
export function readVerification(value: unknown, expected: string): Verification {
  const input = object(value, ["state", "inputs_sha256", "artifact_sha256", "method", "asset_checks"]);
  const result = { state: choice(input.state, ["passed", "failed", "unknown"]), inputs_sha256: hash(input.inputs_sha256),
    artifact_sha256: hash(input.artifact_sha256), method: text(input.method), asset_checks: strings(input.asset_checks).map(hash) };
  if (result.inputs_sha256 !== expected) fail("verification inputs");
  return result;
}
function selectedKey(proposal: number, hunk: string): string { return `${proposal}:${hunk}`; }
function validQuote(value: Quote, collection: Pick<ResolutionCollection, "snapshot">): boolean {
  const blob = collection.snapshot.blobs.find(blob => blob.path === value.path);
  return blob !== undefined && collection.snapshot.entries.some(entry => entry[0] === value.path) && sha256(blob.bytes) === value.sha256
    && value.end <= blob.bytes.length && sha256(blob.bytes.subarray(value.start, value.end)) === value.quote_sha256;
}
export { quote as parseSourceQuote, validQuote as matchesSourceQuote };
function overlap(left: Edit, right: Edit): boolean {
  if (left.path !== right.path) return false;
  if ([left.action, right.action].some(action => action === "create" || action === "delete")) return true;
  if (left.action === "chmod" || right.action === "chmod") return false;
  if (left.start === left.end) return left.start >= right.start && left.start <= right.end;
  if (right.start === right.end) return right.start >= left.start && right.start <= left.end;
  return left.start < right.end && left.end > right.start;
}

export function collectEditChanges(edits: Edit[], snapshot: Snapshot): ResolutionChange[] {
  const result: ResolutionChange[] = [], grouped = new Map<string, Edit[]>();
  for (const item of edits) grouped.set(item.path, [...grouped.get(item.path) ?? [], item]);
  for (const [path, group] of grouped) {
    const source = snapshot.blobs.find(blob => blob.path === path);
    const before = source?.bytes ?? Buffer.alloc(0), beforeHash = source ? sha256(before) : null;
    const modes = new Set(group.map(item => item.after_mode));
    if (modes.size !== 1 || group.some(item => item.before_sha256 !== beforeHash || item.start > item.end || item.end > before.length)) fail("edit preimage or mode");
    for (const [index, item] of group.entries()) {
      if (!snapshot.settings.roots.some(root => withinPrefix(path, root)) && !snapshot.settings.feedback_files.includes(path)) fail("correction path outside selected documentation");
      if (group.slice(index + 1).some(other => overlap(item, other))) fail("conflicting selected edits");
      if (item.action === "create" ? source !== undefined || item.start !== 0 || item.end !== 0 || item.after_mode === null
        : source === undefined) fail("edit existence");
      if (item.action === "delete" && (item.start !== 0 || item.end !== before.length || item.replacement_base64 !== "" || item.after_mode !== null)) fail("deletion");
      if (item.action === "chmod" && (item.start !== 0 || item.end !== 0 || item.replacement_base64 !== "" || item.after_mode === null)) fail("mode edit");
      if (item.action !== "delete" && item.after_mode === null) fail("missing postimage mode");
    }
    let after: Buffer | null = Buffer.from(before);
    for (const item of [...group].sort((left, right) => right.start - left.start || right.end - left.end)) {
      if (item.action === "delete") { after = null; break; }
      if (item.action === "chmod") continue;
      if (after === null) fail("edit after deletion");
      after = Buffer.concat([after.subarray(0, item.start), Buffer.from(item.replacement_base64, "base64"), after.subarray(item.end)]);
    }
    const afterMode = group[0].after_mode;
    if (beforeHash === (after === null ? null : sha256(after)) && (source?.mode ?? null) === afterMode) fail("unchanged correction needs an already-fixed disposition");
    result.push({ path, before_sha256: beforeHash, after_sha256: after === null ? null : sha256(after),
      before_mode: source?.mode ?? null, after_mode: afterMode, after_base64: after === null ? null : after.toString("base64") });
  }
  return result.sort((left, right) => compareUTF8(left.path, right.path));
}

function literalSelection(hunk: ResolutionHunk, edits: Array<Edit | undefined>, collection: ResolutionCollection): boolean {
  if (edits.length !== 1 || !edits[0]) return false;
  const selected = edits[0], source = collection.snapshot.blobs.find(blob => blob.path === hunk.path);
  if (selected.path !== hunk.path || selected.after_mode !== (hunk.after_mode === "000000" ? null : hunk.after_mode)) return false;
  if (hunk.kind === "metadata" && hunk.before_mode !== "000000" && hunk.after_mode !== "000000"
    && hunk.before_sha256 === hunk.after_sha256) return selected.action === "chmod";
  if (selected.start !== hunk.before_range.start || selected.end !== hunk.before_range.end
    || selected.replacement_base64 !== (hunk.after_base64 ?? "")) return false;
  const expectedAction = hunk.before_mode === "000000" ? "create" : hunk.after_mode === "000000" ? "delete" : "replace";
  return selected.action === expectedAction && (hunk.before_base64 === null ? source === undefined
    : source !== undefined && Buffer.from(source.bytes.subarray(selected.start, selected.end)).toString("base64") === hunk.before_base64);
}

function feedbackValid(item: Decision, edits: Map<string, Edit>, options: ResolutionOptions): boolean {
  const change = item.feedback;
  if (!change) return item.disposition !== "wrong";
  if (!options.collection.snapshot.settings.feedback_files.includes(change.path)
    || change.channel !== (change.cause === "detector" ? "suppression" : "correction-history")
    || change.policy_quote.path !== options.collection.snapshot.settings.project_procedure
    || !validQuote(change.policy_quote, options.collection)) return false;
  const procedure = options.collection.snapshot.blobs.find(blob => blob.path === change.policy_quote.path);
  if (!procedure || !decodeUTF8(procedure.bytes.subarray(change.policy_quote.start, change.policy_quote.end)).includes(change.path)) return false;
  if (change.action === "existing") return change.edit_id === null && change.delivery_quote !== null
    && change.delivery_quote.path === change.path && validQuote(change.delivery_quote, options.collection);
  if (change.edit_id === null || edits.get(change.edit_id)?.path !== change.path || change.delivery_quote !== null) return false;
  if (change.action === "retire") {
    const stale = options.scan.stale_suppressions.find(stale => stale.id === change.finding_id && stale.document === change.document);
    const detector = options.scan.detectors.find(detector => detector.id === change.detector_id && detector.outcome === "complete");
    if (change.channel !== "suppression" || !options.scan.complete || stale === undefined || detector === undefined) return false;
    if (change.document !== null) return detector.documents.some(document => document[0] === change.document);
    const bound = options.collection.snapshot.protocol.bindings;
    const expected = bound.detectors.find(unit => unit.id === change.detector_id);
    return expected !== undefined && "all_inventory" in expected.selector
      && canonicalDigest(detector.documents) === canonicalDigest(bound.documents);
  }
  return change.finding_id === null || options.scan.findings.some(finding => finding.id === change.finding_id
    && (change.detector_id === null || finding.detector === change.detector_id) && (change.document === null || finding.document === change.document));
}

export function resolutionSource(snapshot: Snapshot): ResolutionRecord["source"] {
  return { settings_sha256: snapshot.settings_sha256, scope_sha256: snapshot.protocol.bindings.scope_sha256,
    feedback_sha256: snapshot.protocol.bindings.feedback_sha256, read_set: snapshot.read_set, entries: snapshot.entries,
    absent: snapshot.absent, read_set_sha256: snapshot.read_set_sha256, history_sha256: snapshot.history_sha256,
    required_inputs: snapshot.required_inputs };
}

function recordBytes(record: ResolutionRecord): Buffer {
  return Buffer.from(Object.entries(record).sort(([left], [right]) => compareUTF8(left, right)).map(([key, value]) => `${key}: ${JSON.stringify(value, null, 2).replace(/\n/gu, "\n  ")}\n`).join(""));
}

/** Assemble a source-bound proposal. This helper grants no edit, checkpoint or tracker authority. */
export async function buildResolution(options: ResolutionOptions): Promise<ResolutionDraft> {
  const { snapshot } = options.collection;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(options.resolution_id)) fail("resolution identity");
  const path = protocolPath(snapshot.settings.publication.resolution_root + "/" + options.resolution_id + ".yaml");
  const result: ResolutionDraft = { state: "proposal", complete: false, diagnostics: [], changes: [], record: null,
    record_path: path, record_bytes: null, record_sha256: null };
  const before = canonicalDigest(captureCallerState(snapshot.repo));
  try {
    const immutableInputs = canonicalDigest({ inputs: options.inputs, scan: options.scan,
      settings: snapshot.settings, bindings: snapshot.protocol.bindings, read_set: snapshot.read_set, entries: snapshot.entries,
      absent: snapshot.absent, read_set_sha256: snapshot.read_set_sha256, history_sha256: snapshot.history_sha256, required_inputs: snapshot.required_inputs });
    const current = recheckResolutionInputs(options.inputs, options.collection);
    if (!current.fresh || !options.scan.complete || snapshot.blobs.some(blob => blob.path === path)) fail("current complete collection or new record path");
    if (!Array.isArray(options.decisions) || !Array.isArray(options.edits) || !Array.isArray(options.carry_decisions)) fail("selection arrays");
    const decisions = options.decisions.map(decision), rawEdits = options.edits.map(parseEdit), carries = options.carry_decisions.map(carry);
    const edits = new Map(rawEdits.map(item => [item.id, item]));
    if (edits.size !== rawEdits.length) fail("duplicate edit ID");
    const units = new Map<string, ResolutionHunk | null>(options.inputs.proposals.flatMap<readonly [string, ResolutionHunk | null]>(proposal => proposal.hunks.length
      ? proposal.hunks.map(hunk => [selectedKey(proposal.number, hunk.id), hunk] as const)
      : [[selectedKey(proposal.number, "empty-" + proposal.binding_sha256), null] as const]));
    const keys = decisions.map(item => selectedKey(item.proposal, item.hunk_id));
    if (new Set(keys).size !== keys.length || keys.length !== units.size || keys.some(key => !units.has(key))) fail("missing or repeated selected hunk disposition");
    const used = new Set<string>();
    for (const item of decisions) {
      if (item.evidence.length === 0 || item.evidence.some(value => !validQuote(value, options.collection))) fail("current source evidence");
      if (!feedbackValid(item, edits, options)) fail("feedback channel or collection");
      const applied = item.disposition === "apply" || item.disposition === "apply-modified";
      if (applied !== (item.edit_ids.length > 0)) fail("selected correction disposition");
      const hunk = units.get(selectedKey(item.proposal, item.hunk_id));
      if (applied && !hunk) fail("empty proposal has no correction");
      if (item.disposition === "apply" && (!hunk || !literalSelection(hunk, item.edit_ids.map(id => edits.get(id)), options.collection))) fail("literal selected hunk changed");
      for (const id of item.edit_ids) { if (!edits.has(id)) fail("missing selected edit"); used.add(id); }
      if (item.feedback?.edit_id) used.add(item.feedback.edit_id);
      if (item.disposition === "defer") {
        if (item.carry === null || !carries.some(value => value.proposal === item.proposal && value.hunk_id === item.hunk_id && value.text === item.carry)) fail("uncarried deferral");
      } else if (item.carry !== null) fail("unexpected carried decision");
    }
    const carryKeys = carries.map(value => selectedKey(value.proposal, value.hunk_id));
    if (new Set(carryKeys).size !== carryKeys.length || carries.some(value => value.inputs_sha256 !== options.inputs.inputs_sha256 || !decisions.some(item => item.disposition === "defer"
      && item.proposal === value.proposal && item.hunk_id === value.hunk_id && item.carry === value.text))) fail("unselected carried decision");
    if (used.size !== edits.size || [...edits.keys()].some(id => !used.has(id))) fail("unselected edit");
    const unique = new Map<string, Edit>();
    for (const item of rawEdits) {
      const { id, ...binding } = item;
      const digest = canonicalDigest(binding);
      if (!unique.has(digest)) unique.set(digest, item);
    }
    const selectedEdits = [...unique.values()];
    const changes = collectEditChanges(selectedEdits, snapshot);
    const protection = evaluateProtection(snapshot.repo, snapshot, selectedEdits.map(item => ({ path: item.path, start: item.start,
      end: item.end, before_sha256: item.before_sha256, action: item.action, after_mode: item.after_mode, replacement: Buffer.from(item.replacement_base64, "base64") })), options.protection_context);
    if (!protection.complete || protection.edits.some(item => !item.allowed)) fail("protected correction");
    const verifications: ResolutionRecord["verification"] = [];
    for (const item of decisions) {
      const selected = [...new Set([...item.edit_ids, ...(item.feedback?.edit_id ? [item.feedback.edit_id] : [])])].map(id => edits.get(id));
      if (selected.some(value => value === undefined)) fail("missing verification edit");
      const boundEdits = selected.filter((value): value is Edit => value !== undefined);
      const binding = { source_commit: snapshot.source_commit, decision: item, edits: boundEdits, changes, scan_sha256: canonicalDigest(options.scan),
        proposal_inputs_sha256: options.inputs.inputs_sha256, read_set_sha256: snapshot.read_set_sha256, history_sha256: snapshot.history_sha256 };
      const digest = canonicalDigest(binding);
      const scope: VerificationScope = { inputs_sha256: digest, source_commit: snapshot.source_commit, decision: item,
        edits: boundEdits, changes, scan_sha256: binding.scan_sha256 };
      const observed = readVerification(await options.observe_verification(freezeJSON(JSON.parse(canonicalJSON(scope).toString()) as VerificationScope)), digest);
      if (observed.state !== "passed" && !(item.disposition === "defer" && observed.state === "unknown")) fail("selected verification incomplete");
      if (units.get(selectedKey(item.proposal, item.hunk_id))?.kind === "binary" && item.edit_ids.length > 0 && observed.asset_checks.length === 0) fail("binary asset checks");
      verifications.push({ ...observed, proposal: item.proposal, hunk_id: item.hunk_id });
    }
    if (immutableInputs !== canonicalDigest({ inputs: options.inputs, scan: options.scan,
      settings: snapshot.settings, bindings: snapshot.protocol.bindings, read_set: snapshot.read_set, entries: snapshot.entries,
      absent: snapshot.absent, read_set_sha256: snapshot.read_set_sha256, history_sha256: snapshot.history_sha256, required_inputs: snapshot.required_inputs })
      || !recheckResolutionInputs(options.inputs, options.collection).fresh || canonicalDigest(captureCallerState(snapshot.repo)) !== before) fail("source changed during verification");
    const originals = options.inputs.proposals.map(proposal => ({ ...proposal, hunks: proposal.hunks.map(({ before_base64, after_base64, ...hunk }) => hunk) }));
    if (options.inputs.repository_id === null) fail("repository identity");
    const record: ResolutionRecord = { schema_version: 1, id: options.resolution_id, repository: options.inputs.repository,
      repository_id: options.inputs.repository_id, assessed_base: snapshot.source_commit, originals, dispositions: decisions.map(item => ({ ...item, changed_paths: [...new Set([
        ...item.edit_ids, ...(item.feedback?.edit_id ? [item.feedback.edit_id] : [])
      ].map(id => { const selected = edits.get(id); if (!selected) fail("missing record edit"); return selected.path; }))].sort(compareUTF8) })),
      postimages: changes.map(({ after_base64, ...change }) => change), carried_decisions: carries,
      source: resolutionSource(snapshot),
      verification: verifications, changed_paths: changes.map(change => change.path) };
    const bytes = recordBytes(record);
    if (!canonicalJSON(readResolutionRecord(bytes, snapshot.settings)).equals(canonicalJSON(record))) fail("record round trip");
    result.changes = changes; result.record = freezeJSON(record); result.record_bytes = bytes; result.record_sha256 = sha256(bytes); result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Resolution inputs unavailable"); }
  return result;
}

function array<T>(value: unknown, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) fail("array");
  return value.map(parse);
}
function commit(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) fail("commit");
  return value;
}
function nullableHash(value: unknown): string | null { return value === null ? null : hash(value); }
function fileBinding(value: unknown) {
  const input = object(value, ["path", "status", "before_mode", "after_mode", "before_sha256", "after_sha256"]);
  const before_mode = choice(input.before_mode, ["000000", "100644", "100755"]);
  const after_mode = choice(input.after_mode, ["000000", "100644", "100755"]);
  const before_sha256 = nullableHash(input.before_sha256), after_sha256 = nullableHash(input.after_sha256);
  if ((before_mode === "000000") !== (before_sha256 === null) || (after_mode === "000000") !== (after_sha256 === null)) fail("file absence binding");
  return { path: protocolPath(input.path), status: choice(input.status, ["A", "M", "D", "T"]), before_mode, after_mode, before_sha256, after_sha256 };
}
function recordedHunk(value: unknown): ResolutionRecord["originals"][number]["hunks"][number] {
  const input = object(value, ["id", "path", "kind", "before_range", "after_range", "before_mode", "after_mode", "before_sha256", "after_sha256"]);
  const range = (value: unknown) => {
    const input = object(value, ["start", "end"]), start = integer(input.start), end = integer(input.end);
    if (end < start) fail("hunk range");
    return { start, end };
  };
  // Text hunks retain empty-side byte hashes even when their enclosing file is absent.
  const file = { path: protocolPath(input.path), before_mode: choice(input.before_mode, ["000000", "100644", "100755"]),
    after_mode: choice(input.after_mode, ["000000", "100644", "100755"]),
    before_sha256: nullableHash(input.before_sha256), after_sha256: nullableHash(input.after_sha256) };
  const binding = { path: file.path, kind: choice(input.kind, ["text", "binary", "metadata"]),
    before_range: range(input.before_range), after_range: range(input.after_range), before_mode: file.before_mode,
    after_mode: file.after_mode, before_sha256: file.before_sha256, after_sha256: file.after_sha256 };
  if (input.id !== "hunk-" + canonicalDigest(binding)) fail("hunk identity");
  return { id: text(input.id), ...binding };
}
function original(value: unknown): ResolutionRecord["originals"][number] {
  const input = object(value, ["number", "head_sha", "base_sha", "merge_base", "body_sha256", "metadata_sha256", "diff_sha256", "inputs_sha256", "binding_sha256", "files", "hunks"]);
  const files = array(input.files, fileBinding), hunks = array(input.hunks, recordedHunk);
  if (new Set(files.map(file => file.path)).size !== files.length || new Set(hunks.map(hunk => hunk.id)).size !== hunks.length
    || hunks.some(hunk => !files.some(file => file.path === hunk.path && file.before_mode === hunk.before_mode && file.after_mode === hunk.after_mode))
    || files.some(file => !hunks.some(hunk => hunk.path === file.path))) fail("original file/hunk accounting");
  return { number: integer(input.number, 1), head_sha: commit(input.head_sha), base_sha: commit(input.base_sha), merge_base: commit(input.merge_base),
    body_sha256: hash(input.body_sha256), metadata_sha256: hash(input.metadata_sha256), diff_sha256: hash(input.diff_sha256),
    inputs_sha256: hash(input.inputs_sha256), binding_sha256: hash(input.binding_sha256), files, hunks };
}
function postimage(value: unknown): ResolutionRecord["postimages"][number] {
  const input = object(value, ["path", "before_sha256", "after_sha256", "before_mode", "after_mode"]);
  const before_mode = input.before_mode === null ? null : choice(input.before_mode, ["100644", "100755"]);
  const after_mode = input.after_mode === null ? null : choice(input.after_mode, ["100644", "100755"]);
  const before_sha256 = nullableHash(input.before_sha256), after_sha256 = nullableHash(input.after_sha256);
  if ((before_mode === null) !== (before_sha256 === null) || (after_mode === null) !== (after_sha256 === null)
    || (before_mode === after_mode && before_sha256 === after_sha256)) fail("postimage transition");
  return { path: protocolPath(input.path), before_sha256, after_sha256, before_mode, after_mode };
}
function recordSource(value: unknown): ResolutionRecord["source"] {
  const input = object(value, ["settings_sha256", "scope_sha256", "feedback_sha256", "read_set", "entries", "absent", "read_set_sha256", "history_sha256", "required_inputs"]);
  const read = object(input.read_set, ["mode", "reason", "prefixes", "always_paths"]);
  const prefix = (value: unknown) => value === "." ? "." : protocolPath(value);
  const read_set = { mode: choice(read.mode, ["bounded", "whole-repository"]),
    reason: read.reason === null ? null : choice(read.reason, ["omitted-read-bound", "command-inputs-unbounded"]),
    prefixes: strings(read.prefixes).map(prefix), always_paths: strings(read.always_paths).map(protocolPath) };
  if ((read_set.mode === "bounded") !== (read_set.reason === null)) fail("read-set mode");
  const entries = array(input.entries, value => {
    if (!Array.isArray(value) || value.length !== 3) fail("source entry");
    return [protocolPath(value[0]), choice(value[1], ["100644", "100755"]), hash(value[2])] as const;
  });
  const absent = strings(input.absent).map(prefix);
  if (new Set(entries.map(entry => entry[0])).size !== entries.length
    || canonicalDigest({ ...read_set, entries, absent }) !== hash(input.read_set_sha256)) fail("read-set digest");
  const required_inputs = array(input.required_inputs, value => {
    const input = object(value, ["id", "kind", "sha256"]);
    return { id: text(input.id), kind: choice(input.kind, ["history", "time", "external"]), sha256: hash(input.sha256) };
  });
  if (new Set(required_inputs.map(item => item.id)).size !== required_inputs.length) fail("duplicate required input");
  return { settings_sha256: hash(input.settings_sha256), scope_sha256: hash(input.scope_sha256), feedback_sha256: hash(input.feedback_sha256),
    read_set, entries, absent, read_set_sha256: hash(input.read_set_sha256), history_sha256: hash(input.history_sha256), required_inputs };
}

/** Parse a durable input record. It supplies neither verification authority nor publication permission. */
export function readResolutionRecord(bytes: Uint8Array, settings: Settings): ResolutionRecord {
  const input = object(collectionReaders().yaml(bytes), ["schema_version", "id", "repository", "repository_id", "assessed_base", "originals", "dispositions", "postimages", "carried_decisions", "source", "verification", "changed_paths"]);
  if (input.schema_version !== 1 || input.repository !== settings.repository || typeof input.id !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(input.id)) fail("record identity");
  const originals = array(input.originals, original), postimages = array(input.postimages, postimage);
  if (originals.length === 0 || new Set(originals.map(item => item.number)).size !== originals.length) fail("original selection");
  const expected = originals.flatMap(item => item.hunks.length ? item.hunks.map(hunk => selectedKey(item.number, hunk.id))
    : [selectedKey(item.number, "empty-" + item.binding_sha256)]).sort(compareUTF8);
  const dispositions = array(input.dispositions, value => {
    const input = object(value, ["proposal", "hunk_id", "disposition", "reason", "evidence", "edit_ids", "feedback", "carry", "changed_paths"]);
    const { changed_paths, ...binding } = input;
    const parsed = decision(binding), paths = strings(changed_paths).map(protocolPath);
    if (parsed.evidence.length === 0 || ((parsed.disposition === "apply" || parsed.disposition === "apply-modified") !== (parsed.edit_ids.length > 0))
      || (parsed.disposition === "defer") !== (parsed.carry !== null)
      || (parsed.disposition === "wrong" && parsed.feedback === null)
      || paths.some(path => !postimages.some(change => change.path === path))
      || (parsed.edit_ids.length === 0 && !parsed.feedback?.edit_id && paths.length > 0)
      || ((parsed.edit_ids.length > 0 || parsed.feedback?.edit_id !== undefined && parsed.feedback?.edit_id !== null) && paths.length === 0)) fail("disposition binding");
    const feedback = parsed.feedback;
    if (feedback && (!settings.feedback_files.includes(feedback.path)
      || feedback.channel !== (feedback.cause === "detector" ? "suppression" : "correction-history")
      || (feedback.action === "existing" ? feedback.edit_id !== null || feedback.delivery_quote?.path !== feedback.path
        : feedback.edit_id === null || feedback.delivery_quote !== null || !paths.includes(feedback.path)))) fail("record feedback binding");
    return { ...parsed, changed_paths: paths };
  });
  if (!canonicalJSON(dispositions.map(item => selectedKey(item.proposal, item.hunk_id)).sort(compareUTF8)).equals(canonicalJSON(expected))) fail("disposition accounting");
  const carried_decisions = array(input.carried_decisions, carry);
  const inputsDigest = canonicalDigest({ repository: settings.repository, repository_id: integer(input.repository_id, 1),
    default_branch: settings.default_branch, source_commit: commit(input.assessed_base), selected: originals.map(item => item.number),
    proposals: originals.map(item => [item.number, item.binding_sha256]), diagnostics: [] });
  if (carried_decisions.some(item => item.inputs_sha256 !== inputsDigest)) fail("carried source binding");
  if (new Set(carried_decisions.map(item => selectedKey(item.proposal, item.hunk_id))).size !== carried_decisions.length
    || !canonicalJSON(carried_decisions.map(item => [item.proposal, item.hunk_id, item.text]).sort()).equals(canonicalJSON(dispositions.filter(item => item.disposition === "defer").map(item => [item.proposal, item.hunk_id, item.carry]).sort()))) fail("carried decision accounting");
  const verifications = array(input.verification, value => {
    const input = object(value, ["proposal", "hunk_id", "state", "inputs_sha256", "artifact_sha256", "method", "asset_checks"]);
    const { proposal, hunk_id, ...binding } = input;
    return { proposal: integer(proposal, 1), hunk_id: text(hunk_id), ...readVerification(binding, hash(input.inputs_sha256)) };
  });
  if (!canonicalJSON(verifications.map(item => selectedKey(item.proposal, item.hunk_id)).sort(compareUTF8)).equals(canonicalJSON(expected))
    || verifications.some(item => item.state !== "passed" && !(item.state === "unknown" && dispositions.some(selected => selected.proposal === item.proposal && selected.hunk_id === item.hunk_id && selected.disposition === "defer")))) fail("record verification accounting");
  const changed_paths = strings(input.changed_paths).map(protocolPath), actualPaths = postimages.map(item => item.path).sort(compareUTF8);
  if (new Set(actualPaths).size !== actualPaths.length || !canonicalJSON(changed_paths).equals(canonicalJSON(actualPaths))
    || actualPaths.some(path => !dispositions.some(item => item.changed_paths.includes(path)))
    || changed_paths.some(path => !settings.roots.some(root => withinPrefix(path, root)) && !settings.feedback_files.includes(path))) fail("changed path accounting");
  return freezeJSON({ schema_version: 1, id: input.id, repository: settings.repository, repository_id: integer(input.repository_id, 1),
    assessed_base: commit(input.assessed_base), originals, dispositions, postimages, carried_decisions,
    source: recordSource(input.source), verification: verifications, changed_paths });
}
