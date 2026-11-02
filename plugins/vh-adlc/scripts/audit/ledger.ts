import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { canonicalJSON, publishJSON } from "../maintenance/journal";
import { inspectAuthority, refreshDefault, type AuthorityOptions } from "./authority";
import { evaluateAssessments, evaluateCandidateAssessments, evaluateCommittedAssessments, evaluateFrozenCandidateAssessments, type Assessment } from "./assessment";
import { tableCells, visibleLines } from "./inventory";
import { checkSnapshot, digest, git, gitBytes, hash, privateDirectory, type Snapshot } from "./snapshot";
import type { Settings } from "./types";
import { loadSettings } from "./settings";
import { repositoryPath } from "../maintenance/authority";

type Document = { schema_version: number; snapshot_digest: string; assessments: Assessment[] };
type NewFinding = { id: string; severity: string; title: string; body: string; delta_paths?: string[] };
export type Candidate = { schema_version: 1; run_id: string; at: string; snapshot_digest: string; assessments_digest: string;
  source_target: string; scope_baseline: string; ids: string[]; new_findings: NewFinding[]; verdict_eligibility: "provisional" | "checked-proposal"; bytes: string; digest: string };
type OwnedLedger = { path: string; branch: string; base: string; commit: string | null; candidate_digest: string; owner_file: string };
function fail(message: string): never { throw Error("audit ledger: " + message); }
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
type CandidateOptions = { document: Document; at: string; run_id: string; new_findings?: NewFinding[]; provisional?: boolean };
export function createLedgerCandidate(config: Settings, snap: Snapshot, options: CandidateOptions): Candidate {
  if (!(["reverify", "full"].includes(snap.mode) && !options.provisional || snap.mode === "fix" && options.provisional) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(options.at) || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(options.run_id)) fail("invalid proposal mode/date/run");
  if (!checkSnapshot(config, snap).current) fail("assessment bindings changed");
  const assessed = options.provisional ? evaluateCandidateAssessments(config, snap, options.document) : evaluateAssessments(config, snap, options.document);
  if (!assessed.pass) fail("assessment evidence is incomplete");
  return renderCandidate(config, snap, options, readFileSync(join(config.root, config.ledger_path), "utf8"));
}
function renderCandidate(config: Settings, snap: Snapshot, options: CandidateOptions, original: string): Candidate {
  if (!snap.scope_baseline) fail("a reachable next scope baseline is required for this update");
  const lines = original.split("\n");
  for (const row of options.document.assessments) {
    const finding = snap.inventory.findings.find(f => f.id === row.id);
    if (!finding) fail("finding identity is unknown");
    if (["UNKNOWN", "PARTIAL"].includes(row.verdict) && !row.residuals.length) fail("incomplete assessment requires its actual gap");
    if (!finding.identity_valid || finding.aggregate) {
      if (!["UNKNOWN", "PARTIAL"].includes(row.verdict)) fail("individual finding identity is incomplete");
      continue; // Preserve the ambiguous/range index; record its gap separately below.
    }
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
    let end = finding.entry_lines[0];
    const visible = visibleLines(lines.join("\n"));
    while (end < lines.length) {
      const heading = visible[end]?.match(/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
      if (heading && heading[1].length <= config.profile.finding_level) break;
      end++;
    }
    const marker = `<!-- audit-run:${options.run_id}:${row.id} -->`;
    if (lines.includes(marker)) fail("run note already exists; reconcile the actual ledger");
    const safe = (value: string) => value.replace(/[\r\n]/g, " ").replaceAll("<!--", "&lt;!--");
    const stateMarker = row.verdict === "FIXED" ? "✅" : row.verdict === "MOOT" ? "🗑️" : "⚠️";
    lines.splice(end, 0, "", marker, `**Re-verify (${options.at}):** ${stateMarker} **${row.verdict}** (previous recorded state: ${finding.recorded_status}).`,
      `Scope baseline: ${snap.scope_baseline}`, `Verified source: ${snap.source.commit}`, `Comparison: ${snap.history.status}; baseline: ${snap.history.baseline ?? "unavailable"}. ${snap.history.reason}`, `Run: ${options.run_id}; snapshot: ${snap.digest}`,
      "Scenario: " + safe(row.reason), "Evidence: " + row.evidence.map(e => safe(e.path + "#" + e.symbol)).join(", "),
      "Checks: " + row.checks.map(c => safe(c.name + " exit " + c.exit_code)).join(", "),
      "Residuals: " + (row.residuals.map(safe).join("; ") || "none recorded"), "");
  }
  const gaps = options.document.assessments.filter(row => !snap.inventory.findings.find(f => f.id === row.id)?.identity_valid);
  if (gaps.length) {
    lines.push("", `## Audit coverage ${options.at} (${options.run_id})`, "", `Scope baseline: ${snap.scope_baseline}`, `Verified source: ${snap.source.commit}`,
      "Incomplete identities below were not converted into individual terminal verdicts; original index/history remains unchanged.");
    for (const row of gaps) lines.push(`- ${row.id}: ${row.verdict}. ${row.reason.replace(/[\r\n]/g, " ")} Gap: ${row.residuals.join("; ").replace(/[\r\n]/g, " ")}`);
    lines.push("");
  }
  const body = { schema_version: 1 as const, run_id: options.run_id, at: options.at, snapshot_digest: snap.digest,
    assessments_digest: digest(options.document), source_target: snap.source.commit, scope_baseline: snap.scope_baseline,
    ids: [...snap.selected_ids, ...(options.new_findings ?? []).map(f => f.id)], new_findings: options.new_findings ?? [],
    verdict_eligibility: options.provisional ? "provisional" as const : "checked-proposal" as const,
    bytes: options.new_findings?.length ? appendBytes(config, snap, lines.join("\n"), options.new_findings) : lines.join("\n") };
  return { ...body, digest: digest(body) };
}
export function validateLedgerCandidate(config: Settings, snap: Snapshot, candidate: Candidate, document: Document) {
  try {
    const expected = createLedgerCandidate(config, snap, { document, at: candidate.at, run_id: candidate.run_id, new_findings: candidate.new_findings, provisional: candidate.verdict_eligibility === "provisional" });
    return { valid: canonicalJSON(candidate) === canonicalJSON(expected), reason: "Candidate must exactly match the checked deterministic proposal." };
  } catch { return { valid: false, reason: "Candidate evidence or source changed." }; }
}
export function validateHistoricalCandidate(config: Settings, snap: Snapshot, candidate: Candidate, document: Document) {
  try {
    if (!["reverify", "full"].includes(snap.mode) || !evaluateCommittedAssessments(config, snap, document).pass) return false;
    const expected = renderCandidate(config, snap, { document, at: candidate.at, run_id: candidate.run_id, new_findings: candidate.new_findings },
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
    const expected = renderCandidate(config, snap, { document, at: candidate.at, run_id: candidate.run_id, new_findings: candidate.new_findings, provisional: true },
      gitBytes(config.root, "show", `${snap.source.commit}:${config.ledger_path}`).toString());
    return canonicalJSON(expected) === canonicalJSON(candidate);
  } catch { return false; }
}
function appendBytes(config: Settings, snap: Snapshot, original: string, findings: NewFinding[]) {
  if (!["full", "reverify"].includes(snap.mode) || snap.inventory.next_id === null || !findings.length) fail("new findings require a selected audit pass and safe allocation");
  const delta = snap.mode === "reverify" && snap.history.status === "scoped" && snap.history.baseline ?
    new Set(git(config.root, "diff", "--name-only", "-z", snap.history.baseline, snap.source.commit, "--").split("\0").filter(Boolean)) : null;
  let next = snap.inventory.highest_id + 1;
  for (const finding of findings) {
    if (!Number.isSafeInteger(next) || !finding || Object.keys(finding).some(key => !["id", "severity", "title", "body", "delta_paths"].includes(key))) fail("unsafe new-finding fields or ID allocation");
    const expected = config.id_prefix + "-" + String(next++).padStart(snap.inventory.next_id!.slice(config.id_prefix.length + 1).length, "0");
    if (finding.id !== expected || !finding.severity?.trim() || !finding.title?.trim() || !finding.body?.trim() ||
        /[\x00-\x1f\x7f|]/.test(finding.title + finding.severity) || finding.body.includes("\0") || new RegExp("^#{1,6}\\s+" + config.id_prefix + "-", "m").test(finding.body)) fail("new IDs must follow the reserved high-water mark with a single supported finding identity");
    if (snap.mode === "reverify" && (!delta || !Array.isArray(finding.delta_paths) || !finding.delta_paths.length ||
        finding.delta_paths.some(path => repositoryPath(path) !== path || !delta.has(path) || [config.ledger_path, config.settings_path, config.project_procedure].includes(path) ||
          !/^100(?:644|755) blob /.test(git(config.root, "ls-tree", snap.source.commit, "--", path))))) fail("reverify new findings must cite actual related changed source paths; missing history never triggers full audit");
  }
  const lines = original.split("\n");
  const section = lines.findIndex(line => line.replace(/^#{1,6}\s+/, "").trim() === config.profile.index_heading);
  if (section < 0) fail("index heading is missing");
  let header = section + 1;
  while (header < lines.length && tableCells(lines[header])[0]?.toUpperCase() !== "ID") { if (/^#/.test(lines[header])) fail("index table missing"); header++; }
  if (header >= lines.length) fail("index table missing");
  const cells = tableCells(lines[header]); let end = header + 2;
  while (end < lines.length && lines[end].trim().startsWith("|")) end++;
  const rows = findings.map(finding => "| " + cells.map(cell => {
    if (/^ID$/i.test(cell)) return finding.id;
    if (/^(Sev|Severity)$/i.test(cell)) return finding.severity;
    if (/^(Status|State)$/i.test(cell)) return "OPEN";
    if (/^(Title|Finding|Description)$/i.test(cell)) return finding.title;
    return "";
  }).join(" | ") + " |");
  lines.splice(end, 0, ...rows);
  for (const finding of findings) lines.push("", "#".repeat(config.profile.finding_level) + " " + finding.id + " - " + finding.title, finding.body, "");
  return lines.join("\n");
}
export function appendFindings(config: Settings, snap: Snapshot, findings: NewFinding[]) {
  if (!checkSnapshot(config, snap).current) fail("new-finding source changed");
  const bytes = appendBytes(config, snap, readFileSync(join(config.root, config.ledger_path), "utf8"), findings);
  return { bytes, digest: hash(bytes), eligible: false, reason: "Private proposal only; checked candidate and separate ledger authority are required for application." };
}
export function applyLedgerCandidate(config: Settings, snap: Snapshot, candidate: Candidate, document: Document, options: {
  path: string; commit: boolean; request: AuthorityOptions["request"]; refresh?: AuthorityOptions["refresh"];
}): OwnedLedger {
  if (!["reverify", "full"].includes(snap.mode) || candidate.verdict_eligibility !== "checked-proposal") fail("provisional fix candidate stays on its selected repair branch pending final review");
  if (!validateLedgerCandidate(config, snap, candidate, document).valid) fail("invalid or stale candidate");
  const observed = (options.refresh ?? (() => refreshDefault(config)))();
  if (observed.default_commit !== snap.source.commit || observed.default_commit !== snap.scope_baseline ||
      !snap.source.clean ||
      git(config.root, "rev-parse", "refs/remotes/origin/" + observed.default_branch) !== observed.default_commit) fail("assessment must use the same clean fetched default source");
  for (const effect of ["ledger-update", ...(options.commit ? ["ledger-commit"] : [])] as const) {
    if (!inspectAuthority(config, { mode: snap.mode, ids: snap.selected_ids, effect: effect as "ledger-update" | "ledger-commit", request: options.request,
      refresh: () => observed }).allowed) fail("required current/adopted permission is missing");
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
