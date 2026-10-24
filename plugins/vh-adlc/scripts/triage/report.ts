import {createHash,randomUUID} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { git, ownership, resolveInside, sourcePath } from "./settings";
import type { Inventory, Issue, Mode, Settings } from "./types";
import{observedVerification,verificationRecord,hasRequiredVerificationFailure}from"./verification";

export type State = "resolved" | "partial" | "open" | "blocked" | "obsolete" | "duplicate" | "unverified";
export type Evidence = {
  kind: string; detail: string; verified: boolean; path?: string; line?: number; command?: string;
  exit_code?: number; scope?: string[]; result?: string; reference?: string; before_commit?: string;
  pull_number?: number;
  receipt?:string;
};
export type Observation = {
  number: number; state: string; remaining?: string; evidence?: Evidence[]; adversarial?: Evidence[]; leads?: Evidence[];
  duplicate_of?: number; total_overlap?: boolean; is_index?: boolean; index_evidence?: string;
  blockers?: { issue: number; missing: boolean; evidence: Evidence[] }[]; depends_on?: number[];
  owned_by?: string; ownership_evidence?: Evidence[];
  estimated_size?: string;
};
export type Row = {
  number: number; title: string; state: State; remaining: string; ownership: "protected" | "index" | "eligible";
  disposition: "excluded" | "close-candidate" | "ready" | "blocked" | "needs-decision";
  closure_reason: "completed" | "not_planned" | null; close_executable: boolean;
  evidence: Evidence[]; adversarial: Evidence[]; leads: Evidence[]; duplicate_of: number | null; depends_on: number[];
  index_requested: boolean; index_evidence: string | null; warnings: string[];
  owned_by: string | null; ownership_evidence: Evidence[];
  plan_paths: string[]; estimated_size: string;
};
type Comparison = {
  status: "first" | "comparable" | "overlap-only" | "unavailable";
  previous_run_id: string | null; previous_scope: string | null;
  added: number[]; removed: number[]; changed: number[]; not_compared: number[]; limits: string[];
};
export type Report = {
  observations:Observation[]; index_requests:number[];
  schema_version: 1; run_id: string; repository: string; hostname: string; source_commit: string;
  collected_at: string; created_at: string; mode: Mode; requested_ids: number[]; scope: string;
  completeness: { inventory: boolean; verification: boolean; missing: string[] };
  plan_metadata: Inventory["plan_metadata"]; coverage: Inventory["coverage"];
  counts: { observed_open: number; reviewed: number; closure_candidates: number; blocked: number; without_plans: number | null; qualifier: string };
  rows: Row[]; ranked: { number: number; reasons: string[] }[];
  graph: { edges: { issue: number; prerequisite: number }[]; cycles: number[][]; unresolved: number[] };
  drift: { issue: number; plan: string; detail: string }[];
  comparison: Comparison;
};

function blob(config: Settings, commit: string, path: string): string | null {
  if (!/^[0-9a-f]{40,64}$/.test(commit) || !sourcePath(config, path)) return null;
  const normalized = relative(config.root, resolveInside(config.root, path)).split("\\").join("/");
  try { return git(config.root, "show", `${commit}:${normalized}`); } catch { return null; }
}
function validEvidence(config: Settings, inventory: Inventory, evidence: Evidence, issueNumber?: number): boolean {
  if (!evidence || evidence.verified !== true || typeof evidence.detail !== "string" || !evidence.detail.trim()) return false;
  switch (evidence.kind) {
    case "source": {
      if (!evidence.path || !Number.isSafeInteger(evidence.line) || evidence.line! < 1) return false;
      const text = blob(config, inventory.source_commit, evidence.path);
      const receipt=evidence.receipt?verificationRecord(config,inventory.source_commit,evidence.receipt):null;
      return text !== null && evidence.line! <= text.split("\n").length&&(!evidence.receipt||receipt?.kind==="inspection"&&receipt.reads.some(read=>read.path===evidence.path&&evidence.line!>=read.start_line&&evidence.line!<=read.end_line));
    }
    case "test": {
      const record=verificationRecord(config,inventory.source_commit,evidence.receipt);
      return record?.kind==="command"&&evidence.command===JSON.stringify(record.argv)&&evidence.exit_code===0;
    }
    case "search": return !!evidence.scope?.length && evidence.scope.every((path) => sourcePath(config, path)) && ["empty", "found"].includes(evidence.result ?? "");
    case "wiring": {
      const record=verificationRecord(config,inventory.source_commit,evidence.receipt);
      return !!evidence.path&&Number.isSafeInteger(evidence.line)&&record?.kind==="inspection"&&record.reads.some(read=>read.path===evidence.path&&evidence.line!>=read.start_line&&evidence.line!<=read.end_line)&&blob(config,inventory.source_commit,evidence.path)!==null;
    }
    case "merged-pr": return inventory.pulls.some((pull) => pull.number === evidence.pull_number && !!pull.merged_at &&
      new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+(?:${inventory.repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#|#)${issueNumber ?? "[1-9]\\d*"}(?!\\d)`, "i").test(pull.body));
    case "removal": {
      if (!evidence.path || !evidence.before_commit || evidence.reference !== `commit:${inventory.source_commit}`) return false;
      if (blob(config, evidence.before_commit, evidence.path) === null || blob(config, inventory.source_commit, evidence.path) !== null) return false;
      const removal=verificationRecord(config,inventory.source_commit,evidence.receipt)?.removal;
      if(!removal||removal.path!==evidence.path||removal.before_commit!==evidence.before_commit)return false;
      try { git(config.root, "merge-base", "--is-ancestor", evidence.before_commit, inventory.source_commit); return true; } catch { return false; }
    }
    case "supersession": {
      const record=verificationRecord(config,inventory.source_commit,evidence.receipt);
      return !!evidence.path&&!!evidence.reference&&record?.kind==="inspection"&&record.reads.some(read=>read.path===evidence.path)&&blob(config,inventory.source_commit,evidence.path)!==null;
    }
    case "overlap": {
      const record=verificationRecord(config,inventory.source_commit,evidence.receipt);
      return record?.kind==="issues"&&/^issue:[1-9]\d*$/.test(evidence.reference??"")&&[...inventory.issues,...inventory.closed_issues].some(issue=>`issue:${issue.number}`===evidence.reference&&record.issues?.some(read=>read.number===issue.number&&read.sha256===createHash("sha256").update(JSON.stringify(issue)).digest("hex")));
    }
    default: return false;
  }
}
function completed(config: Settings, inventory: Inventory, values: Evidence[], issueNumber: number,pass:"primary"|"adversarial") {
  const valid = values.filter((value) => validEvidence(config, inventory, value, issueNumber));
  // Test failures and invalid claimed proof are never discarded to manufacture a pass.
  return valid.length === values.length && valid.some((value) => value.kind === "source") && valid.some((value) => ["test", "wiring", "merged-pr"].includes(value.kind))&&
    valid.some(value=>verificationRecord(config,inventory.source_commit,value.receipt)?.pass===pass);
}
function verified(config: Settings, inventory: Inventory, values: Evidence[]) {
  return values.length > 0 && values.every((value) => validEvidence(config, inventory, value));
}
function observedProof(config:Settings,inventory:Inventory,values:Evidence[],phase?:"primary"|"adversarial",issueNumber?:number){
  const receipt=(value:Evidence)=>observedVerification(config,inventory.source_commit,value.receipt);
  return values.some(value=>{const record=receipt(value);return !!record&&(!phase||record.pass===phase);})&&
    values.filter(value=>["test","wiring","supersession","overlap","removal"].includes(value.kind)||value.receipt).every(value=>{
      const record=receipt(value);if(!record||phase&&record.pass!==phase)return false;
      if(value.kind==="overlap"&&issueNumber){const issue=[...inventory.issues,...inventory.closed_issues].find(issue=>issue.number===issueNumber);return !!issue&&record.issues?.some(read=>read.number===issueNumber&&read.sha256===createHash("sha256").update(JSON.stringify(issue)).digest("hex"));}
      return true;
    });
}
// Local reports retain observations. Publication additionally requires actual
// current proof for every assessment carried by this report, including open work.
export function publicationVerified(config:Settings,inventory:Inventory,report:Report){
  return report.completeness.inventory&&report.completeness.verification&&!hasRequiredVerificationFailure(config)&&report.observations.length>0&&report.observations.every(value=>{
    const row=report.rows.find(row=>row.number===value.number);
    return row&&row.state!=="unverified"&&observedProof(config,inventory,value.evidence??[],"primary",value.number)&&observedProof(config,inventory,value.adversarial??[],"adversarial",value.number)&&
      (value.blockers??[]).every(blocker=>verified(config,inventory,blocker.evidence)&&observedProof(config,inventory,blocker.evidence))&&
      (!value.owned_by||!!config.workstream_ownership[value.number]||verified(config,inventory,value.ownership_evidence??[])&&observedProof(config,inventory,value.ownership_evidence??[]));
  });
}
function selection(inventory: Inventory, config: Settings, observations: Observation[]): Issue[] {
  if (inventory.mode === "ids") return [...inventory.issues, ...inventory.closed_issues].filter((issue) => inventory.requested_ids.includes(issue.number));
  if (inventory.mode === "stale") return inventory.issues.filter((issue) => Date.parse(issue.updated_at) <= Date.parse(inventory.collected_at) - config.stale_days * 86400000);
  if (["next", "close"].includes(inventory.mode)) return inventory.issues.filter((issue) => observations.some((value) => value.number === issue.number));
  return inventory.issues;
}
function scopeFor(config: Settings, inventory: Inventory, selected: Issue[]) {
  return JSON.stringify({ mode: inventory.mode, ids: (["next", "close"].includes(inventory.mode) ? selected.map((issue) => issue.number) : [...inventory.requested_ids]).sort((a,b) => a-b),
    stale_days: inventory.mode === "stale" ? config.stale_days : null, source_roots: config.source_roots, plan_roots: config.plan_roots });
}
function cyclesFor(rows: Row[]) {
  const byId = new Map(rows.map((row) => [row.number, row])), cycles: number[][] = [], done = new Set<number>();
  function visit(id: number, path: number[]) {
    const at = path.indexOf(id);
    if (at >= 0) { const cycle = [...path.slice(at), id]; if (!cycles.some((old) => old.includes(id))) cycles.push(cycle); return; }
    if (done.has(id)) return;
    for (const dep of byId.get(id)?.depends_on ?? []) visit(dep, [...path, id]);
    done.add(id);
  }
  for (const row of rows) visit(row.number, []);
  return cycles;
}

type Historical = Pick<Report, "repository" | "hostname" | "run_id" | "collected_at" | "created_at" | "scope" | "mode" | "completeness"> & { rows: { number: number; state: string }[] };
function legacyHistory(config: Settings, file: string, text: string): Historical | null {
  const date = file.match(/^(\d{4}-\d{2}-\d{2})-issue-triage\.md$/)?.[1];
  if (!date || !Number.isFinite(Date.parse(date))) return null;
  let stateColumn = -1;
  const rows = new Map<number, { number: number; state: string }>();
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) { stateColumn = -1; continue; }
    const columns = line.split(/(?<!\\)\|/).slice(1,-1).map((column) => column.replace(/[*`]/g, "").trim());
    const header = columns.findIndex((column) => /^verified state$/i.test(column));
    if (header >= 0) { stateColumn = header; continue; }
    if (stateColumn < 0 || !/^#?[1-9]\d*$/.test(columns[0] ?? "")) continue;
    const number = Number(columns[0].replace(/^#/, "")), value = columns[stateColumn]?.toLowerCase();
    const state = value?.match(/^(resolved|partial|open|blocked|obsolete|duplicate|unverified)\b/)?.[1] ?? (value === "superseded" ? "obsolete" : null);
    if (state && !rows.has(number)) rows.set(number, { number, state });
  }
  if (!rows.size && !new RegExp(`^# Issue triage[^\\n]*${date}[^\\n]*$`,"im").test(text)) return null;
  return { repository: config.repository, hostname: config.hostname, run_id: `legacy:${file.replace(/\.md$/, "")}`,
    collected_at: `${date}T00:00:00.000Z`, created_at: `${date}T00:00:00.000Z`, scope: "legacy:unknown-selection-and-coverage",
    mode: /\(close mode\)|close-mode/i.test(text.slice(0,3000)) ? "close" : "sweep",
    rows: [...rows.values()], completeness: { inventory: false, verification: false, missing: ["legacy-scope-and-coverage",...(!rows.size?["legacy-per-issue-states-unavailable"]:[])] } };
}
function readHistory(config: Settings): { reports: Historical[]; unavailable: boolean } {
  const directory = resolveInside(config.root, config.report_dir);
  if (!existsSync(directory)) return { reports: [], unavailable: config.report_dir_configured };
  const reports: Historical[] = []; let unavailable = false;
  try {
    for (const file of readdirSync(directory).sort()) {
      if (!file.endsWith(".md")) continue;
      const path = resolveInside(config.root, join(config.report_dir, file));
      if (!statSync(path).isFile()) continue;
      const text = readFileSync(path, "utf8");
      const encoded = /^triage:/m.test(text), legacy = /-issue-triage\.md$/.test(file);
      if (!encoded && !legacy && (config.report_dir_configured || /^README\.md$/i.test(file))) continue;
      const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!match) { unavailable = true; continue; }
      const data = Bun.YAML.parse(match[1]) as { triage?: Report };
      if (!data?.triage && legacy) {
        const previous = legacyHistory(config, file, text);
        if (previous) reports.push(previous); else unavailable = true;
        continue;
      }
      if (!data?.triage || data.triage.schema_version !== 1 || !Array.isArray(data.triage.rows) ||
          !data.triage.rows.every((row) => Number.isSafeInteger(row.number) && typeof row.state === "string") ||
          typeof data.triage.repository !== "string" || typeof data.triage.run_id !== "string" || !Number.isFinite(Date.parse(data.triage.collected_at)) ||
          typeof data.triage.scope !== "string" || !data.triage.completeness) { unavailable = true; continue; }
      reports.push(data.triage);
    }
  } catch { unavailable = true; }
  return { reports, unavailable };
}
function compare(config: Settings, report: Report): Comparison {
  const history = readHistory(config), empty: Comparison = { status: "first", previous_run_id: null, previous_scope: null, added: [], removed: [], changed: [], not_compared: [], limits: [] };
  if (history.unavailable) return { ...empty, status: "unavailable", limits: ["Report history could not be read completely; no additions or removals are inferred."] };
  const available = history.reports.filter((old) => old.repository.toLowerCase() === report.repository.toLowerCase() && old.hostname === report.hostname)
    .sort((a,b) => (b.created_at ?? b.collected_at).localeCompare(a.created_at ?? a.collected_at));
  if (!available.length) return empty;
  const previous = available.find((old) => old.mode === report.mode && old.scope === report.scope) ?? available[0];
  const comparable = previous.scope === report.scope && previous.mode === report.mode && previous.completeness.inventory && report.completeness.inventory;
  const before = new Map(previous.rows.map((row) => [row.number, row])), after = new Map(report.rows.map((row) => [row.number, row]));
  const common = [...before.keys()].filter((id) => after.has(id));
  return { ...empty, status: comparable ? "comparable" : "overlap-only", previous_run_id: previous.run_id, previous_scope: previous.scope,
    added: comparable ? [...after.keys()].filter((id) => !before.has(id)) : [],
    removed: comparable ? [...before.keys()].filter((id) => !after.has(id)) : [],
    changed: common.filter((id) => before.get(id)!.state !== "unverified" && after.get(id)!.state !== "unverified" && before.get(id)!.state !== after.get(id)!.state),
    not_compared: comparable ? [] : [...new Set([...before.keys(), ...after.keys()])].filter((id) => !common.includes(id)),
    limits: comparable ? [] : ["Different scope or incomplete inventory: only shared observed issue IDs are compared."] };
}

export function buildReport(config: Settings, inventory: Inventory, observations: Observation[], options: { runId?: string; indexRequests?: number[]; fixedHead?:string } = {}): Report {
  if (inventory.schema_version !== 1 || inventory.repository.toLowerCase() !== config.repository.toLowerCase() || inventory.hostname !== config.hostname ||
      !/^[0-9a-f]{40,64}$/.test(inventory.source_commit) || !Number.isFinite(Date.parse(inventory.collected_at)) ||
      !["sweep", "next", "close", "stale", "ids"].includes(inventory.mode)) throw new Error("invalid triage inventory identity");
  const runId = options.runId ?? randomUUID();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId)) throw new Error("invalid triage run identity");
  if (!Array.isArray(observations) || options.indexRequests?.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error("invalid triage observations or index requests");
  const selected = selection(inventory, config, observations), byId = new Map<number, Observation>();
  for (const value of observations) {
    if (!selected.some((issue) => issue.number === value.number) || byId.has(value.number)) throw new Error("invalid or repeated triage observation target");
    byId.set(value.number, value);
  }
  const required = ["issues", "pulls", "plans", ...selected.map((issue) => `comments:${issue.number}`)];
  const missing = required.filter((name) => inventory.coverage.filter((entry) => entry.collection === name && entry.complete === true && !entry.error && Number.isSafeInteger(entry.pages) && entry.pages >= 0 && !!entry.scope).length !== 1);
  for (const entry of inventory.coverage) if (!entry.complete || entry.error) missing.push(entry.collection);
  if(hasRequiredVerificationFailure(config))missing.push("required-verification");
  if (inventory.plan_metadata === "incomplete") missing.push("plans");
  try { if ((options.fixedHead??git(config.root, "rev-parse", "HEAD")) !== inventory.source_commit) missing.push("source-head"); } catch { missing.push("source-head"); }
  if (inventory.mode === "ids") for (const id of inventory.requested_ids) if (!selected.some((issue) => issue.number === id)) missing.push(`issue:${id}`);
  const rows: Row[] = selected.map((issue) => {
    const observation = byId.get(issue.number), evidence = observation?.evidence ?? [], adversarial = observation?.adversarial ?? [];
    const indexRole = observation?.is_index === true || /(?:^|\b)(?:umbrella|milestone (?:index|tracker)|issue index)(?:\b|$)/i.test(`${issue.title}\n${issue.body}`);
    const configuredOwner=config.workstream_ownership[issue.number];
    const ownedBy = configuredOwner?.owners.join(", ") ?? (typeof observation?.owned_by === "string" && observation.owned_by.trim() ? observation.owned_by : null);
    const owner = ownedBy ? "protected" : ownership(issue, config, indexRole), indexRequested = (options.indexRequests ?? []).includes(issue.number);
    const warnings: string[] = [];
    if (ownedBy && !configuredOwner && !verified(config, inventory, observation?.ownership_evidence ?? [])) warnings.push("Other-workstream ownership needs canonical evidence; conservatively excluded pending verification.");
    let state: State = observation && ["resolved", "partial", "open", "blocked", "obsolete", "duplicate", "unverified"].includes(observation.state) ? observation.state as State : "unverified";
    const evidenceOK = verified(config, inventory, evidence), secondOK = verified(config, inventory, adversarial);
    if (!evidenceOK && state !== "unverified") { warnings.push("Verification evidence is absent or invalid."); state = "unverified"; }
    let closure: Row["closure_reason"] = null;
    if (state === "resolved") {
      if (completed(config, inventory, evidence, issue.number,"primary") && completed(config, inventory, adversarial, issue.number,"adversarial") && !observation?.remaining) closure = "completed";
      else { state = "unverified"; warnings.push("Completed behavior needs canonical source and observed behavior/wiring in both passes."); }
    } else if (state === "obsolete") {
      if (secondOK && JSON.stringify(evidence)!==JSON.stringify(adversarial) && [evidence, adversarial].every((pass) => pass.some((item) => ["removal", "supersession"].includes(item.kind)))) closure = "not_planned";
      else { state = "unverified"; warnings.push("Removed or superseded scope needs verification in both passes."); }
    } else if (state === "duplicate") {
      const canonical = observation?.duplicate_of;
      const retained=inventory.issues.find(other=>other.number===canonical&&other.state==="open");
      const canonicalState=canonical?byId.get(canonical)?.state:undefined;
      if (canonical !== issue.number && observation?.total_overlap === true && secondOK && JSON.stringify(evidence)!==JSON.stringify(adversarial) && retained && !["resolved","obsolete","duplicate"].includes(canonicalState??"") &&
          [evidence, adversarial].every((pass) => pass.some((item) => item.kind === "overlap" && item.reference === `issue:${canonical}`))) closure = "not_planned";
      else { state = "unverified"; warnings.push("Total overlap and a canonical issue require both verification passes."); }
    }
    const blockers = observation?.blockers ?? [];
    const unknownBlocker = blockers.some((blocker) => !verified(config, inventory, blocker.evidence)||!blocker.missing&&!observedProof(config,inventory,blocker.evidence));
    const blocked = blockers.some((blocker) => blocker.missing) || unknownBlocker;
    if (state === "blocked" && !blocked && blockers.length) state = "open";
    if (blocked && !closure) state = unknownBlocker ? "unverified" : "blocked";
    if (state === "partial" && !observation?.remaining?.trim()) { state = "unverified"; warnings.push("Partial work has no recorded remaining scope."); }
    const allowed = owner === "eligible" || owner === "index" && indexRequested;
    const disposition: Row["disposition"] = !allowed ? "excluded" : closure ? "close-candidate" : state === "blocked" ? "blocked" : ["open", "partial"].includes(state) ? "ready" : "needs-decision";
    return { number: issue.number, title: issue.title, state, remaining: observation?.remaining ?? "", ownership: owner, disposition,
      closure_reason: closure, close_executable: !!closure && allowed && issue.state === "open",
      evidence, adversarial, leads: observation?.leads ?? [], duplicate_of: observation?.duplicate_of ?? null, depends_on: [...new Set([...(observation?.depends_on ?? []), ...blockers.filter((blocker) => blocker.missing).map((blocker) => blocker.issue)])]
        .filter(id=>!blockers.some(blocker=>blocker.issue===id && !blocker.missing && verified(config,inventory,blocker.evidence)&&observedProof(config,inventory,blocker.evidence)) || blockers.some(blocker=>blocker.issue===id && blocker.missing)),
      index_requested: indexRequested, index_evidence: indexRole ? observation?.index_evidence ?? "Observed index/umbrella role" : owner === "index" ? "Configured index rule" : null,
      owned_by: ownedBy, ownership_evidence: configuredOwner?configuredOwner.sources.map(path=>({kind:"ownership",path,reference:`issue:${issue.number}`,detail:`Declared workstream source ${config.workstream_sources[path]}`,verified:true})):observation?.ownership_evidence ?? [],
      plan_paths: inventory.plans.filter((plan) => plan.issue === issue.number).map((plan) => plan.path),
      estimated_size: typeof observation?.estimated_size === "string" ? observation.estimated_size : "unknown", warnings };
  });
  // Authenticate every completion state before it can clear a prerequisite, even
  // when protection or issue state makes the row ineligible for execution.
  for(const row of rows)if(["resolved","obsolete","duplicate"].includes(row.state)){
    const authentic=observedProof(config,inventory,row.evidence,"primary",row.number)&&observedProof(config,inventory,row.adversarial,"adversarial",row.number);
    if(!authentic){row.close_executable=false;row.state="unverified";if(row.disposition!=="excluded")row.disposition="needs-decision";row.closure_reason=null;row.remaining||="Remaining scope is unverified.";row.warnings.push("Completion requires current trusted verification; cache records are attestations only.");missing.push("verification-boundary");}
  }
  const cycles = cyclesFor(rows), cycleIds = new Set(cycles.flat()), unresolved = new Set<number>();
  for (const row of rows) for (const id of row.depends_on) {
    const prerequisite = rows.find((other) => other.number === id);
    if (!prerequisite || prerequisite.state !== "resolved") unresolved.add(row.number);
  }
  for (const row of rows) if (cycleIds.has(row.number) || unresolved.has(row.number)) {
    if (row.disposition === "ready") row.disposition = "blocked";
    if (row.close_executable) {
      row.close_executable = false; row.state = "unverified";
      row.warnings.push("A cyclic or unresolved prerequisite prevents closure.");
    }
  }
  const verificationComplete = !missing.includes("required-verification")&&!missing.includes("verification-boundary")&&rows.every((row) => row.ownership === "protected" || row.disposition === "excluded" || row.state !== "unverified");
  if (!verificationComplete) missing.push("verification");
  for (const row of rows) row.close_executable &&= missing.length === 0;
  const score = (row: Row) => {
    const issue = selected.find((issue) => issue.number === row.number)!;
    const priority = inventory.plans.find((plan) => plan.issue === row.number)?.priority ?? issue.labels.find((label) => config.priority_order.includes(label)) ?? null;
    const planned = inventory.plans.some((plan) => plan.issue === row.number && ["planned", "in-progress"].includes(plan.status ?? ""));
    const unblocks = rows.filter((other) => other.depends_on.includes(row.number)).length;
    return { milestone: issue.milestone && config.milestone_order.includes(issue.milestone) ? config.milestone_order.indexOf(issue.milestone) : config.milestone_order.length,
      priority: priority && config.priority_order.includes(priority) ? config.priority_order.indexOf(priority) : config.priority_order.length,
      unblocks, planned: Number(planned), partial: Number(row.state === "partial"),
      reasons: [`Milestone: ${issue.milestone ?? "unknown"}`, `Priority: ${priority ?? "unknown"}`, `Prerequisite for ${unblocks} observed issues`,
        planned ? "Existing planned/in-progress plan; verify design before implementation" : "No ready plan metadata; plan remaining work first",
        row.state === "partial" ? "Verified partial work with explicit remaining scope" : "No partial-scope preference", "Numeric issue ID breaks remaining ties"] };
  };
  const ranked = ["sweep", "next"].includes(inventory.mode) ? rows.filter((row) => row.disposition === "ready")
    .sort((a,b) => score(a).milestone - score(b).milestone || score(a).priority - score(b).priority || score(b).unblocks - score(a).unblocks ||
      score(b).planned - score(a).planned || score(b).partial - score(a).partial || a.number - b.number)
    .map((row) => ({ number: row.number, reasons: score(row).reasons })) : [];
  const report: Report = {
    observations:structuredClone(observations),index_requests:[...(options.indexRequests??[])],
    schema_version: 1, run_id: runId, repository: inventory.repository, hostname: inventory.hostname, source_commit: inventory.source_commit,
    collected_at: inventory.collected_at, created_at: new Date().toISOString(), mode: inventory.mode, requested_ids: inventory.requested_ids, scope: scopeFor(config, inventory, selected),
    completeness: { inventory: missing.filter((name) => !["verification","verification-boundary","required-verification"].includes(name)).length === 0, verification: verificationComplete, missing: [...new Set(missing)] },
    plan_metadata: inventory.plan_metadata, coverage: inventory.coverage,
    counts: { observed_open: selected.filter((issue) => issue.state === "open").length, reviewed: byId.size,
      closure_candidates: rows.filter((row) => row.disposition === "close-candidate").length, blocked: rows.filter((row) => row.disposition === "blocked").length,
      without_plans: inventory.plan_metadata === "available" ? selected.filter((issue) => !inventory.plans.some((plan) => plan.issue === issue.number)).length : null,
      qualifier: `Observed ${inventory.mode} scope; ${missing.length ? "incomplete inputs" : "complete required inputs"}` },
    rows, ranked, graph: { cycles, unresolved: [...unresolved], edges: rows.flatMap((row) => row.depends_on.map((prerequisite) => ({ issue: row.number, prerequisite }))) },
    drift: inventory.plans.flatMap((plan) => {
      const issue = [...inventory.issues, ...inventory.closed_issues].find((issue) => issue.number === plan.issue);
      if (!issue) return [];
      const complete = ["complete", "completed"].includes(plan.status ?? "");
      return complete !== (issue.state === "closed") ? [{ issue: issue.number, plan: plan.path, detail: complete ? "Plan says complete while issue is open; verify behavior." : "Issue is closed while plan is incomplete; verify remaining scope." }] : [];
    }), comparison: { status: "first", previous_run_id: null, previous_scope: null, added: [], removed: [], changed: [], not_compared: [], limits: [] },
  };
  report.comparison = compare(config, report);
  return report;
}

function cell(value: string) { return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "); }
export function saveReport(config: Settings, report: Report, options: { output?: string } = {}): string {
  const path = options.output ? isAbsolute(options.output) ? resolve(options.output) : resolveInside(config.root, options.output) :
    resolveInside(config.root, join(config.report_dir, `${report.collected_at.slice(0,10)}-${report.run_id}.md`));
  mkdirSync(dirname(path), { recursive: true });
  const lines = ["---", `triage: ${JSON.stringify(report)}`, "---", "", `# Triage: ${report.repository}`, "",
    `Run: ${report.run_id}. Source: ${report.source_commit}. Mode: ${report.mode}.`, "", report.counts.qualifier + ".",
    `Observed open: ${report.counts.observed_open}; reviewed: ${report.counts.reviewed}; closure candidates: ${report.counts.closure_candidates}; blocked: ${report.counts.blocked}; without plans: ${report.counts.without_plans ?? "unavailable"}.`, "",
    "| Issue | State | Disposition | Remaining scope | Plan | Estimated size |", "| --- | --- | --- | --- | --- | --- |",
    ...report.rows.map((row) => `| #${row.number} ${cell(row.title)} | ${row.state} | ${row.disposition} | ${cell(row.remaining)} | ${cell(row.plan_paths.join(", ") || "No plan; plan remaining work first")} | ${cell(row.estimated_size)} |`), "",
    "## Evidence", "", ...report.rows.flatMap((row) => [`### #${row.number}`, "", `Ownership: ${row.ownership}; workstream: ${cell(row.owned_by ?? "none")}; index request: ${row.index_requested}; closure executable: ${row.close_executable}; reason: ${row.closure_reason ?? "none"}.`, "",
      ...[...row.ownership_evidence.map((value) => ({ pass: "Ownership", value })), ...row.evidence.map((value) => ({ pass: "Verification", value })), ...row.adversarial.map((value) => ({ pass: "Adversarial", value })), ...row.leads.map((value) => ({ pass: "Context (not proof)", value }))].map(({ pass, value }) => `- ${pass}: ${cell(JSON.stringify(value))}`), ...row.warnings.map((warning) => `- ${warning}`), ""]),
    "## Ranking and blockers", "", ...report.ranked.map((row,index) => `${index+1}. #${row.number}: ${row.reasons.join("; ")}`), "", `Graph: ${JSON.stringify(report.graph)}`, "",
    "## Coverage and plan drift", "", `Completeness: ${JSON.stringify(report.completeness)}`, "", ...report.coverage.map((entry) => `- ${cell(JSON.stringify(entry))}`), "", `Plan drift: ${JSON.stringify(report.drift)}`, "",
    "## Previous run", "", report.comparison.status === "first" ? "No previous report exists in the configured history source." : JSON.stringify(report.comparison), "",
    "Report saved locally, uncommitted. No tracker actions executed. Exact action payloads require a separate presented batch and approval.", ""];
  writeFileSync(path, lines.join("\n"), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return path;
}
