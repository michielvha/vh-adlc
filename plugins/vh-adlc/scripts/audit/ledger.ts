import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { canonicalJSON, publishJSON } from "../maintenance/journal";
import { inspectAuthority, refreshDefault, validRequest, validConstraints, type AuthorityOptions } from "./authority";
import { evaluateAssessments, evaluateCandidateAssessments, evaluateCommittedAssessments, evaluateFrozenCandidateAssessments, type Assessment } from "./assessment";
import { tableCells, visibleLines, markdownVisibility, escapeInlineHtml, inventoryMarkdown, markdownSections, markdownTables } from "./inventory";
import { checkSnapshot, digest, git, gitBytes, hash, privateDirectory, type Snapshot } from "./snapshot";
import type { Settings } from "./types";
import { loadSettings } from "./settings";
import { repositoryPath } from "../maintenance/authority";

type Document = { schema_version: number; snapshot_digest: string; assessments: Assessment[] };
import { boundedBody, indexMetadata, insertEntries, addSectionNotes, type NewFinding, type SectionNote } from "./layout";
export type Candidate = { schema_version: 1; run_id: string; at: string; snapshot_digest: string; assessments_digest: string;
  source_target: string; scope_baseline: string; ids: string[]; new_findings: NewFinding[]; section_notes?: SectionNote[]; verdict_eligibility: "provisional" | "checked-proposal"; bytes: string; digest: string };
type OwnedLedger = { path: string; branch: string; base: string; commit: string | null; candidate_digest: string; owner_file: string };
function fail(message: string): never { throw Error("audit ledger: " + message); }
function unchangedState(recorded: string, current: string) { return recorded === current || recorded === "OPEN" && current === "STILL_PRESENT"; }
function marker(verdict: string) { return verdict === "FIXED" ? "✅" : verdict === "MOOT" ? "🗑️" : "⚠️"; }
function replaceCell(line: string, index: number, value: string | ((raw: string) => string)) {
  const delimiters: number[] = []; let escaped = false;
  for (let i = 0; i < line.length; i++) {
    if (escaped) escaped = false;
    else if (line[i] === "\\") escaped = true;
    else if (line[i] === "|") delimiters.push(i);
  }
  const leading = line.trimStart().startsWith("|");
  const start = index === 0 && !leading ? 0 : (delimiters[index - (leading ? 0 : 1)] ?? fail("status cell missing")) + 1;
  const end = delimiters[index + (leading ? 1 : 0)] ?? line.length;
  const old = line.slice(start, end), spaces = old.match(/^(\s*)[\s\S]*?(\s*)$/)!;
  const rendered = typeof value === "function" ? value(old.slice(spaces[1].length, old.length - spaces[2].length)) : value;
  return line.slice(0, start) + spaces[1] + rendered + spaces[2] + line.slice(end);
}
type CandidateOptions = { document: Document; at: string; run_id: string; new_findings?: NewFinding[]; section_notes?: SectionNote[]; provisional?: boolean };
export function createLedgerCandidate(config: Settings, snap: Snapshot, options: CandidateOptions): Candidate {
  if (options.new_findings !== undefined && !Array.isArray(options.new_findings) || options.section_notes !== undefined && !Array.isArray(options.section_notes)) fail("proposal additions must be arrays");
  if (!(["reverify", "full"].includes(snap.mode) && !options.provisional || snap.mode === "fix" && options.provisional) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(options.at) || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(options.run_id)) fail("invalid proposal mode/date/run");
  if (!checkSnapshot(config, snap).current) fail("assessment bindings changed");
  const assessed = options.provisional ? evaluateCandidateAssessments(config, snap, options.document) : evaluateAssessments(config, snap, options.document);
  if (!assessed.pass) fail("assessment evidence is incomplete");
  return renderCandidate(config, snap, options, readFileSync(join(config.root, config.ledger_path), "utf8"));
}
function renderCandidate(config: Settings, snap: Snapshot, options: CandidateOptions, original: string): Candidate {
  if (snap.inventory.diagnostics.some(row => row.code === "unsupported-markdown-structure")) fail("unsupported Markdown structure requires explicit reconciliation");
  if (!snap.scope_baseline) fail("a reachable next scope baseline is required for this update");
  const lines = original.split("\n");
  const datedLayout = visibleLines(original).some(line => /^ {0,3}#{1,6}[ \t]+How this audit was performed(?:[ \t]+#+)?[ \t]*$/i.test(line));
  for (const row of options.document.assessments) {
    const finding = snap.inventory.findings.find(f => f.id === row.id);
    if (!finding) fail("finding identity is unknown");
    if (["UNKNOWN", "PARTIAL"].includes(row.verdict) && !row.residuals.length) fail("incomplete assessment requires its actual gap");
    if (!finding.identity_valid || finding.aggregate) {
      if (!["UNKNOWN", "PARTIAL"].includes(row.verdict)) fail("individual finding identity is incomplete");
      continue; // Preserve the ambiguous/range index; record its gap separately below.
    }
    if (datedLayout && unchangedState(finding.recorded_status,row.verdict)) continue;
    const index = finding.index_lines[0] - 1;
    let header: string[] | undefined;
    for (let i = index - 1; i >= 0; i--) {
      const cells = tableCells(lines[i]);
      if (cells[0]?.toUpperCase() === "ID") { header = cells; break; }
      if (/^#/.test(lines[i])) break;
    }
    if (!header) fail("supported index header is missing");
    let column = header.findIndex(c => /^(status|state)$/i.test(c));
    const title = column < 0;
    if (title) column = header.findIndex(c => /^(title|finding|description)$/i.test(c));
    if (column < 0) fail("supported status/title column is missing");
    lines[index] = replaceCell(lines[index], column, title ? raw => raw + ` - ${marker(row.verdict)} **${row.verdict} (${options.at})**` : row.verdict);
  }
  // Append dated notes inside each finding section, without rewriting prior content or anchors.
  const rows = [...options.document.assessments].filter(row => snap.inventory.findings.find(f => f.id === row.id)?.identity_valid).sort((a, b) =>
    snap.inventory.findings.find(f => f.id === b.id)!.entry_lines[0] - snap.inventory.findings.find(f => f.id === a.id)!.entry_lines[0]);
  for (const row of rows) {
    const finding = snap.inventory.findings.find(f => f.id === row.id)!;
    if (datedLayout && snap.mode !== "fix" && unchangedState(finding.recorded_status,row.verdict)) continue;
    let end = finding.entry_lines[0];
    const sections = markdownSections(lines.join("\n")).headings;
    while (end < lines.length) {
      const heading = sections.get(end);
      if (heading && heading.level <= config.profile.finding_level) break;
      end++;
    }
    const marker = `<!-- audit-run:${options.run_id}:${row.id} -->`;
    if (lines.includes(marker)) fail("run note already exists; reconcile the actual ledger");
    const safe = (value: string) => escapeInlineHtml(value.replace(/[\r\n]/g, " "));
    const stateMarker = row.verdict === "FIXED" ? "✅" : row.verdict === "MOOT" ? "🗑️" : "⚠️";
    lines.splice(end, 0, "", marker, `**Re-verify (${options.at}):** ${stateMarker} **${row.verdict}** (previous recorded state: ${finding.recorded_status}).`,
      `Scope baseline: ${snap.scope_baseline}`, `Verified source: ${snap.source.commit}`, `Comparison: ${snap.history.status}; baseline: ${snap.history.baseline ?? "unavailable"}. ${snap.history.reason}`, `Run: ${options.run_id}; snapshot: ${snap.digest}`,
      "Scenario: " + safe(row.reason), "Evidence: " + row.evidence.map(e => safe(e.path + (e.line === undefined ? "" : ":" + e.line) + "#" + e.symbol)).join(", "),
      "Checks: " + row.checks.map(c => safe(c.name + " exit " + c.exit_code)).join(", "),
      "Residuals: " + (row.residuals.map(safe).join("; ") || "none recorded"), "");
    if (datedLayout && finding.recorded_status !== row.verdict) lines.splice(finding.entry_lines[0], 0, "", `${stateMarker} **${row.verdict} (${options.at})** <!-- audit-status:${options.run_id}:${row.id} --> Current status; supersedes any historical heading annotation.`, "");
  }
  const gaps = options.document.assessments.filter(row => !snap.inventory.findings.find(f => f.id === row.id)?.identity_valid);
  if (gaps.length) {
    lines.push("", `## Audit coverage ${options.at} (${options.run_id})`, "", `Scope baseline: ${snap.scope_baseline}`, `Verified source: ${snap.source.commit}`,
      "Incomplete identities below were not converted into individual terminal verdicts; original index/history remains unchanged.");
    for (const row of gaps) lines.push(`- ${row.id}: ${row.verdict}. ${escapeInlineHtml(row.reason.replace(/[\r\n]/g, " "))} Gap: ${escapeInlineHtml(row.residuals.join("; ").replace(/[\r\n]/g, " "))}`);
    lines.push("");
  }
  if (datedLayout && snap.mode!=="fix") {
    const heading = visibleLines(lines.join("\n")).findIndex(line => /^ {0,3}#{1,6}[ \t]+How this audit was performed(?:[ \t]+#+)?[ \t]*$/i.test(line));
    if (heading < 0) fail("dated layout heading changed");
    lines.splice(heading + 1, 0, "", `> Audit pass (${options.at}): ${snap.selected_ids.length} selected assessments; run ${options.run_id}. Scope baseline: ${snap.scope_baseline}; Verified source: ${snap.source.commit}. Comparison: ${snap.history.status}. Prior passes remain historical.`, "");
    lines.push("", `## Re-verification summary (${options.at})`, "", `Run: ${options.run_id}; selected scope only.`);
    const cell = (text: string) => text.replace(/[\r\n]/g, " ").replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("<", "&lt;");
    for (const [title, verdict] of [["Fully fixed", "FIXED"], ["Partially fixed", "PARTIAL"], ["Regressed", "REGRESSED"], ["Moot", "MOOT"], ["Unknown", "UNKNOWN"]]) {
      const rows = options.document.assessments.filter(row => row.verdict === verdict);
      lines.push("", "### " + title, "", "| ID | Previously recorded | Current observation |", "| --- | --- | --- |");
      for (const row of rows) lines.push(`| ${row.id} | ${snap.inventory.findings.find(f => f.id === row.id)?.recorded_status ?? "UNKNOWN"} | ${cell(row.reason + (row.residuals.length ? " Residuals: " + row.residuals.join("; ") : ""))} |`);
      if (!rows.length) lines.push("", "No selected findings in this category.");
    }
    const present = options.document.assessments.filter(row => row.verdict === "STILL_PRESENT").map(row => row.id);
    lines.push("", "Assessed still present: " + (present.join(", ") || "none in the selected scope") + ".", "Unselected findings retain their recorded history; this pass does not freshly verify them.", "");
  }
  let bytes = options.new_findings?.length ? appendBytes(config, snap, lines.join("\n"), options.new_findings) : lines.join("\n");
  if (options.section_notes?.length) bytes = addSectionNotes(config,snap,bytes,options.section_notes,{at:options.at,run_id:options.run_id,ids:[...snap.selected_ids,...(options.new_findings??[]).map(row=>row.id)]});
  verifyRenderedInventory(config, snap, original, bytes, (options.new_findings ?? []).map(f => f.id), options.document.assessments.map(row => row.id));
  const body = { schema_version: 1 as const, run_id: options.run_id, at: options.at, snapshot_digest: snap.digest,
    assessments_digest: digest(options.document), source_target: snap.source.commit, scope_baseline: snap.scope_baseline,
    ids: [...snap.selected_ids, ...(options.new_findings ?? []).map(f => f.id)], new_findings: options.new_findings ?? [],
    ...(options.section_notes?.length ? {section_notes:options.section_notes} : {}),
    verdict_eligibility: options.provisional ? "provisional" as const : "checked-proposal" as const,
    bytes };
  return { ...body, digest: digest(body) };
}
function verifyRenderedInventory(config: Settings, snap: Snapshot, original: string, bytes: string, newIDs: string[], changed: string[]) {
  const before = inventoryMarkdown(config, original), after = inventoryMarkdown(config, bytes);
  if (digest(before) !== digest(snap.inventory) || !markdownVisibility(bytes).balanced || after.diagnostics.some(row => row.code === "unsupported-markdown-structure") || digest(after.findings.map(f => f.id).sort()) !== digest([...before.findings.map(f => f.id), ...newIDs].sort())) fail("rendered ledger changes finding visibility or declared identity scope");
  const oldLines = original.split("\n"), newLines = bytes.split("\n");
  for (const finding of before.findings) {
    const next = after.findings.find(f => f.id === finding.id);
    if (!next || next.identity_valid !== finding.identity_valid || next.aggregate !== finding.aggregate || next.index_lines.length !== finding.index_lines.length ||
        digest(next.entry_lines.map(line => newLines[line - 1])) !== digest(finding.entry_lines.map(line => oldLines[line - 1])) || next.severity !== finding.severity ||
        (!changed.includes(finding.id) || !finding.identity_valid) && digest(next.index_lines.map(line => newLines[line - 1])) !== digest(finding.index_lines.map(line => oldLines[line - 1]))) fail("rendered ledger hides or rewrites an original finding/index class");
  }
  for (const id of newIDs) { const next = after.findings.find(f => f.id === id); if (!next?.identity_valid || next.index_lines.length !== 1 || next.entry_lines.length !== 1 || next.recorded_status !== "OPEN") fail("new finding must have one visible OPEN index/entry identity"); }
}
export function validateLedgerCandidate(config: Settings, snap: Snapshot, candidate: Candidate, document: Document) {
  try {
    const expected = createLedgerCandidate(config, snap, { document, at: candidate.at, run_id: candidate.run_id, new_findings: candidate.new_findings, section_notes: candidate.section_notes, provisional: candidate.verdict_eligibility === "provisional" });
    return { valid: canonicalJSON(candidate) === canonicalJSON(expected), reason: "Candidate must exactly match the checked deterministic proposal." };
  } catch { return { valid: false, reason: "Candidate evidence or source changed." }; }
}
export function validateHistoricalCandidate(config: Settings, snap: Snapshot, candidate: Candidate, document: Document) {
  try {
    if (!["reverify", "full"].includes(snap.mode) || !evaluateCommittedAssessments(config, snap, document).pass) return false;
    const expected = renderCandidate(config, snap, { document, at: candidate.at, run_id: candidate.run_id, new_findings: candidate.new_findings, section_notes: candidate.section_notes },
      gitBytes(config.root, "show", `${snap.source.commit}:${config.ledger_path}`).toString());
    return canonicalJSON(candidate) === canonicalJSON(expected);
  } catch { return false; }
}
/** Reconstruct a provisional fix proposal from immutable frozen-source Git objects. */
export function validateFrozenFixCandidate(config: Settings, snap: Snapshot, candidate: Candidate, document: Document) {
  try {
    if (snap.mode !== "fix" || !snap.source.clean || candidate.verdict_eligibility !== "provisional" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(candidate.at) || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(candidate.run_id) ||
        !evaluateFrozenCandidateAssessments(config, snap, document).pass) return false;
    const expected = renderCandidate(config, snap, { document, at: candidate.at, run_id: candidate.run_id, new_findings: candidate.new_findings, section_notes: candidate.section_notes, provisional: true },
      gitBytes(config.root, "show", `${snap.source.commit}:${config.ledger_path}`).toString());
    return canonicalJSON(expected) === canonicalJSON(candidate);
  } catch { return false; }
}
function appendBytes(config: Settings, snap: Snapshot, original: string, findings: NewFinding[]) {
  if (snap.inventory.diagnostics.some(row => row.code === "unsupported-markdown-structure")) fail("unsupported Markdown structure requires explicit reconciliation");
  if (!["full", "reverify"].includes(snap.mode) || snap.inventory.next_id === null || !findings.length) fail("new findings require a selected audit pass and safe allocation");
  const delta = snap.mode === "reverify" && snap.history.status === "scoped" && snap.history.baseline ?
    new Set(git(config.root, "diff", "--name-only", "-z", snap.history.baseline, snap.source.commit, "--").split("\0").filter(Boolean)) : null;
  let next = snap.inventory.highest_id + 1;
  for (const finding of findings) {
    if (!Number.isSafeInteger(next) || !finding || Object.keys(finding).some(key => !["id", "severity", "title", "body", "delta_paths", "index_cells", "workstream"].includes(key))) fail("unsafe new-finding fields or ID allocation");
    const expected = config.id_prefix + "-" + String(next++).padStart(snap.inventory.next_id!.slice(config.id_prefix.length + 1).length, "0");
    if (finding.id !== expected || !finding.severity?.trim() || !finding.title?.trim() || !finding.body?.trim() ||
        /[\x00-\x1f\x7f|]/.test(finding.title + finding.severity) || finding.body.includes("\0") || new RegExp("^#{1,6}\\s+" + config.id_prefix + "-", "m").test(finding.body)) fail("new IDs must follow the reserved high-water mark with a single supported finding identity");
    boundedBody(finding.body,config.profile.finding_level);
    if (snap.mode === "reverify" && (!delta || !Array.isArray(finding.delta_paths) || !finding.delta_paths.length ||
        finding.delta_paths.some(path => repositoryPath(path) !== path || !delta.has(path) || [config.ledger_path, config.settings_path, config.project_procedure].includes(path) ||
          !/^100(?:644|755) blob /.test(git(config.root, "ls-tree", snap.source.commit, "--", path))))) fail("reverify new findings must cite actual related changed source paths; missing history never triggers full audit");
  }
  const lines = original.split("\n");
  const visibleIndex = visibleLines(lines.join("\n")), sectionMap = markdownSections(lines.join("\n")).headings;
  const sections = [...sectionMap.values()].filter(heading => heading.title === config.profile.index_heading);
  if (sections.length !== 1) fail("one visible index heading is required");
  const section = sections[0],boundary=[...sectionMap.values()].find(head=>head.at>section.at&&head.level<=section.level)?.at??lines.length;
  const table=markdownTables(original).find(table=>table.rows[0]>section.at&&table.rows[0]<boundary&&tableCells(visibleIndex[table.rows[0]])[0]?.toUpperCase()==="ID");
  if(!table)fail("index table missing");
  const header=table.rows[0],cells=tableCells(lines[header]),end=Math.max(header+2,table.rows.at(-1)!+1);
  const rows = findings.map(finding => { const extra=indexMetadata(config,finding,cells); return "| " + cells.map(cell => {
    if (/^ID$/i.test(cell)) return finding.id;
    if (/^(Sev|Severity)$/i.test(cell)) return escapeInlineHtml(finding.severity);
    if (/^(Status|State)$/i.test(cell)) return "OPEN";
    if (/^(Title|Finding|Description)$/i.test(cell)) return escapeInlineHtml(finding.title);
    return extra.get(cell.toLowerCase())??"";
  }).join(" | ") + " |"; });
  lines.splice(end, 0, ...rows);
  return insertEntries(config,lines,findings);
}
export function appendFindings(config: Settings, snap: Snapshot, findings: NewFinding[]) {
  if (!checkSnapshot(config, snap).current) fail("new-finding source changed");
  const bytes = appendBytes(config, snap, readFileSync(join(config.root, config.ledger_path), "utf8"), findings);
  verifyRenderedInventory(config, snap, readFileSync(join(config.root, config.ledger_path), "utf8"), bytes, findings.map(f => f.id), []);
  return { bytes, digest: hash(bytes), eligible: false, reason: "Private proposal only; checked candidate and separate ledger authority are required for application." };
}
export function applyLedgerCandidate(config: Settings, snap: Snapshot, candidate: Candidate, document: Document, options: {
  path: string; commit: boolean; request: AuthorityOptions["request"]; refresh?: AuthorityOptions["refresh"]; restrictions?: AuthorityOptions["restrictions"]; prohibited_effects?: AuthorityOptions["prohibited_effects"];
}): OwnedLedger {
  if (!validRequest(options.request) || !options.request.authorized || !validConstraints(options.restrictions, options.prohibited_effects) ||
      options.request.mode !== snap.mode || digest(options.request.ids.slice().sort()) !== digest(snap.selected_ids.slice().sort())) fail("invalid current request or constraints");
  const restrictions = new Set([...(options.restrictions ?? []), ...(options.request.restrictions ?? [])]);
  const prohibited = new Set([...(options.prohibited_effects ?? []), ...(options.request.prohibited_effects ?? [])]);
  if (restrictions.has("read-only") || restrictions.has("no-write") || options.commit && restrictions.has("no-commit") || prohibited.has("ledger-update") || options.commit && prohibited.has("ledger-commit")) fail("current request restriction forbids ledger effect before refresh");
  if (!["reverify", "full"].includes(snap.mode) || candidate.verdict_eligibility !== "checked-proposal") fail("provisional fix candidate stays on its selected repair branch pending final review");
  if (!validateLedgerCandidate(config, snap, candidate, document).valid) fail("invalid or stale candidate");
  const observed = (options.refresh ?? (() => refreshDefault(config)))();
  if (observed.default_commit !== snap.source.commit || observed.default_commit !== snap.scope_baseline ||
      !snap.source.clean ||
      git(config.root, "rev-parse", "refs/remotes/origin/" + observed.default_branch) !== observed.default_commit) fail("assessment must use the same clean fetched default source");
  for (const effect of ["ledger-update", ...(options.commit ? ["ledger-commit"] : [])] as const) {
    if (!inspectAuthority(config, { mode: snap.mode, ids: snap.selected_ids, effect: effect as "ledger-update" | "ledger-commit", request: options.request,
      refresh: () => observed, restrictions: [...restrictions], prohibited_effects: [...prohibited] }).allowed) fail("required current/adopted permission is missing");
  }
  const branch = "chore/audit-ledger-" + candidate.run_id;
  const parent = realpathSync(dirname(options.path));
  if (!isAbsolute(options.path) || join(parent, options.path.split(sep).at(-1)!) !== options.path || relative(config.root, options.path) === "" ||
      !relative(config.root, options.path).startsWith(".." + sep)) fail("owned worktree requires a separate canonical sibling path");
  const directory = privateDirectory(snap.artifact_root, config.root), owner_file = join(directory, "ledger-" + candidate.run_id + ".json");
  const ownership = { path: options.path, branch, base: observed.default_commit, candidate_digest: candidate.digest,
    default_branch: observed.default_branch, common_dir: realpathSync(git(config.root, "rev-parse", "--path-format=absolute", "--git-common-dir")), commit_requested: options.commit, skip_ci: options.request.skip_ci === true };
  if (existsSync(owner_file)) {
    const info = lstatSync(owner_file);
    if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || process.getuid && info.uid !== process.getuid() || readFileSync(owner_file, "utf8") !== canonicalJSON(ownership) + "\n") fail("owned worktree intent conflicts");
  } else publishJSON(owner_file, ownership);
  if (!existsSync(options.path)) git(config.root, "worktree", "add", "-b", branch, options.path, observed.default_commit);
  if (lstatSync(options.path).isSymbolicLink() || git(options.path, "symbolic-ref", "--short", "HEAD") !== branch ||
      realpathSync(git(options.path, "rev-parse", "--path-format=absolute", "--git-common-dir")) !== ownership.common_dir) fail("owned worktree identity conflicts");
  loadSettings(options.path, { settingsPath: config.settings_path });
  const head = git(options.path, "rev-parse", "HEAD");
  if (head !== observed.default_commit) {
    if (!options.commit || git(options.path, "rev-parse", "HEAD^") !== observed.default_commit || git(options.path, "status", "--porcelain") ||
        git(options.path, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD") !== config.ledger_path ||
        readFileSync(join(options.path, config.ledger_path), "utf8") !== candidate.bytes) fail("existing commit is not this exact ledger outcome");
    return { ...ownership, commit: head, owner_file };
  }
  const status = git(options.path, "status", "--porcelain");
  if (status && (git(options.path, "diff", "--name-only", "HEAD") !== config.ledger_path ||
      readFileSync(join(options.path, config.ledger_path), "utf8") !== candidate.bytes || git(options.path, "ls-files", "--others", "--exclude-standard"))) fail("unrelated owned-worktree changes require reconciliation");
  writeFileSync(join(options.path, config.ledger_path), candidate.bytes);
  let commit: string | null = null;
  if (options.commit) {
    git(options.path, "add", "--", config.ledger_path);
    git(options.path, "commit", "-m", `docs(audit): re-verify findings at ${snap.source.commit.slice(0, 12)}${options.request.skip_ci === true ? " [skip ci]" : ""}`);
    commit = git(options.path, "rev-parse", "HEAD");
  }
  return { ...ownership, commit, owner_file };
}
export function cleanupOwnedLedger(config: Settings, owned: OwnedLedger, options: { retained: boolean }) {
  if (!options.retained) fail("retain the private report and outcome before cleanup");
  privateDirectory(dirname(owned.owner_file), config.root);
  const info = lstatSync(owned.owner_file);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || process.getuid && info.uid !== process.getuid()) fail("unsafe owned cleanup artifact");
  const saved = JSON.parse(readFileSync(owned.owner_file, "utf8"));
  if (saved.path !== owned.path || saved.branch !== owned.branch || saved.base !== owned.base || saved.candidate_digest !== owned.candidate_digest ||
      saved.common_dir !== realpathSync(git(config.root, "rev-parse", "--path-format=absolute", "--git-common-dir")) ||
      saved.common_dir !== realpathSync(git(owned.path, "rev-parse", "--path-format=absolute", "--git-common-dir")) ||
      !/^chore\/audit-ledger-[a-z0-9][a-z0-9_-]*$/.test(owned.branch) || git(owned.path, "symbolic-ref", "--short", "HEAD") !== owned.branch ||
      git(owned.path, "rev-parse", "HEAD") !== (owned.commit ?? owned.base)) fail("owned cleanup binding differs");
  let published = owned.commit === null;
  if (owned.commit) {
    try { git(config.root, "merge-base", "--is-ancestor", owned.commit, "refs/remotes/origin/" + saved.default_branch); published = true; } catch { /* Private or squash-unreachable evidence refs stay retained. */ }
  }
  if (!published || git(owned.path, "status", "--porcelain")) return { removed: false, reason: "Keep private ledger work and its ref." };
  git(config.root, "worktree", "remove", owned.path);
  try { git(config.root, "branch", "-d", owned.branch); } catch { return { removed: true, reason: "Worktree removed; ref retained because ordinary deletion refused." }; }
  return { removed: true, reason: "Clean owned worktree removed with ordinary Git operations." };
}
