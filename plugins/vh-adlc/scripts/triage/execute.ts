import{hasManagedControllerAuthority}from"./controller-authority";
import{executionHistory}from"./execution-history";
import { createHash } from "node:crypto";
import{executionLock,repositoryLockPath}from"./execution-lock";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { git, loadSettings, ownership, resolveInside, sourcePath,workstreamPath } from "./settings";
import {buildReport,publicationVerified,type Report} from "./report";
import type { Inventory, Issue, Label, Settings } from "./types";

export type Action =
  | {id:string;kind:"create-request";request:{title:string;data:string};title?:string;body?:string}
  | { id: string; kind: "comment"; issue: number; body: string }
  | { id: string; kind: "labels"; issue: number; labels: string[] }
  | { id: string; kind: "create-label"; name: string; color: string; description: string;definition?:string }
  | { id: string; kind: "create"; title: string; body: string; labels: string[] }
  | { id: string; kind: "close"; issue: number; reason: "completed" | "not_planned"; duplicate_of: number | null; comment: string }
  | { id: string; kind: "checklist"; issue: number; before: string; after: string }
  | { id: string; kind: "plan-patch"; path: string; before: string; after: string; gate?: { status: string; document: string }; created_by?: string }
  | { id: string; kind: "commit"; subject: string; body?: string; paths: string[]; requires: string[] };
export type MutationResult = { number?: number; url?: string; issue?: Issue };
export class MutationFailure extends Error {
  constructor(readonly uncertain: boolean) { super(uncertain ? "github-write-outcome-unknown" : "github-write-denied"); }
}
export type Adapter = {
  identity():Promise<string>;
  labels():Promise<Label[]>;
  issue(number: number): Promise<Issue>;
  receipt(key: string, action: Action, context?:{actor:string;attempted_at:string}): Promise<MutationResult | null>;
  mutate(action: Action, key: string): Promise<MutationResult>;
};
export type Batch = {
  schema_version: 1; hash: string; context_id:string;repository: string; hostname: string; settings_hash: string;
  source_commit: string; source_hash: string; report: Report; issues: Issue[]; actions: Action[]; labels:Label[];actor:string|null;inventory:Inventory;
};
export type Approval = { batch_hash: string; action_ids: string[]; owner_statement: string };
type Journal = {
  schema_version: 1; batch_hash: string; completed: string[]; started: string | null;
  results: Record<string, MutationResult>; issues: Record<string, Issue>; source_commit: string;
  uncertain: string[];
  gated?: string[];
  gate_lines?: Record<string,string>;
  attempts?:Record<string,string>;
};
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
}
function hash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function batchHash(batch: Omit<Batch, "hash"> | Batch) { const { hash: _hash, ...content } = batch as Batch; return hash(content); }
function reportFacts(value:Report){const{created_at:_created,comparison:_comparison,...facts}=value;return facts;}
function bad(): never { throw new Error("invalid triage action batch or approval"); }
function nonempty(value: unknown): value is string { return typeof value === "string" && !!value.trim(); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(nonempty); }
function marker(namespace:string, id: string) { return `<!-- vh-adlc-triage:${namespace}:${id} -->`; }
export function actionKey(batch: Batch, action: Action) { return `${batch.context_id}:${action.id}`; }
function sourceHash(config: Settings, actions: Action[], journal?: Journal) {
  const paths = git(config.root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0")
    .filter((path) => path && sourcePath(config, path)).sort();
  return hash(paths.map((path) => {
    const absolute = resolveInside(config.root, path);
    try {
      const stat = lstatSync(absolute);
      if (!stat.isFile()) return [path, "non-file"];
      let bytes=readFileSync(absolute);
      for(const action of actions) if(action.kind==="plan-patch" && action.path===path && journal &&
        (journal.completed.includes(action.id)||journal.started===action.id) && (!action.gate||journal.gated?.includes(action.id))) {
        const created=action.created_by?journal.results[action.created_by]?.url:undefined;
        const after=action.created_by&&created?action.after.replace("{{created_issue_url}}",created):action.after;
        if(bytes.toString()===after)bytes=Buffer.from(action.before);
      }
      return [path, stat.mode & 0o777, createHash("sha256").update(bytes).digest("hex")];
    } catch { return [path, "missing"]; }
  }));
}
function material(issue: Issue) {
  return { number: issue.number, title: issue.title, body: issue.body, state: issue.state, author: issue.author,
    labels: [...issue.labels].sort(), milestone: issue.milestone,
    comments: issue.comments.map(({ id, author, body }) => ({ id, author, body })).sort((a,b) => a.id-b.id) };
}
function changedOnlyBy(before: Issue, after: Issue, action: Action): boolean {
  const expected = structuredClone(before);
  if (action.kind === "comment") {
    const additions = after.comments.filter((comment) => !before.comments.some((old) => old.id === comment.id));
    if (additions.length !== 1 || additions[0].body !== action.body) return false;
    expected.comments.push(additions[0]);
  } else if (action.kind === "labels") expected.labels = [...new Set([...before.labels, ...action.labels])];
  else if (action.kind === "close") expected.state = "closed";
  else if (action.kind === "checklist") expected.body = action.after;
  return hash(material(expected)) === hash(material(after));
}
function checklist(before: string, after: string) {
  return before !== after && before.replace(/^(\s*[-*+] \[)[ xX](\])/gm, "$1 $2") === after.replace(/^(\s*[-*+] \[)[ xX](\])/gm, "$1 $2");
}
function frontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) bad();
  let data: unknown; try { data = Bun.YAML.parse(match[1]); } catch { bad(); }
  if (!data || typeof data !== "object" || Array.isArray(data)) bad();
  return data as Record<string, unknown>;
}
function validatePatch(config: Settings, action: Extract<Action, { kind: "plan-patch" }>) {
  resolveInside(config.root, action.path);
  if(workstreamPath(config,action.path))bad();
  if (!action.path.endsWith(".md") || action.path.startsWith(".vh-adlc/") || !nonempty(action.before) || !nonempty(action.after) || action.before === action.after) bad();
  const placeholder = "https://triage.invalid/created-issue";
  const before = frontmatter(action.before), after = frontmatter(action.after.replace("{{created_issue_url}}", placeholder)), fields = config.plan_fields;
  const allowed = action.created_by ? [fields.issue] : [fields.status, fields.status_description];
  if (Object.keys({ ...before, ...after }).some((key) => !allowed.includes(key) && canonical(before[key]) !== canonical(after[key]))) bad();
  // Replacing only the approved single-line metadata fields must reproduce the entire file.
  let patched = action.before;
  for (const field of allowed) {
    const pattern = new RegExp(`^${field}:.*$`, "m"), line = action.after.match(pattern)?.[0];
    if (!line || !pattern.test(action.before)) bad();
    patched = patched.replace(pattern, () => line);
  }
  if (patched !== action.after) bad();
  if (action.created_by) {
    if (after[fields.issue] !== placeholder || action.after.split("{{created_issue_url}}").length !== 2 || /\{\{(?!created_issue_url\}\})/.test(action.after)) bad();
    if (before[fields.issue] !== null && before[fields.issue] !== "") bad();
  } else if (!action.gate || action.gate.document !== action.path || action.gate.status !== after[fields.status] || !nonempty(action.gate.status)) bad();
}

function requestPayload(namespace:string,action:Extract<Action,{kind:"create-request"}>){
  if(!action.request||Object.keys(action.request).sort().join(",")!=="data,title"||!nonempty(action.request.title)||/[\r\n]/.test(action.request.title)||action.request.title.length>200||!nonempty(action.request.data)||Object.keys(action).some(key=>!["id","kind","request","title","body"].includes(key)))bad();
  return{title:`Owner request: ${action.request.title}`,body:`Unverified owner task data. This issue records a request and makes no triage assessment.\n\n    ${JSON.stringify(action.request.data)}\n\n${marker(namespace,action.id)}`};
}
function vocabularyDescription(action:Extract<Action,{kind:"create-label"}>){
  if(typeof action.definition!=="string"||!/^[-a-z0-9:]{1,63}$/.test(action.name)||!nonempty(action.definition)||Object.keys(action).some(key=>!["id","kind","name","color","description","definition"].includes(key)))return null;
  return `Owner-selected taxonomy; unverified definition: ${JSON.stringify(action.definition)}`;
}
function publicationActions(config:Settings,inventory:Inventory,report:Report,actions:Action[]){
  const neutral=(action:Action):boolean=>{
    if(action.kind==="create-request"){requestPayload("proposal",action);return true;}
    if(action.kind==="create-label")return vocabularyDescription(action)!==null;
    if(action.kind==="plan-patch"&&action.created_by)return actions.some(prior=>prior.id===action.created_by&&prior.kind==="create-request");
    if(action.kind==="commit")return Array.isArray(action.requires)&&action.requires.length>0&&action.requires.every(id=>actions.some(prior=>prior.id===id&&prior.kind==="plan-patch"&&neutral(prior)));
    return false;
  };
  const requires=actions.some(action=>!neutral(action));
  if(requires&&!publicationVerified(config,inventory,report))bad();
  for(const action of actions)if(!["comment","labels","create-label","create-request","create","close","checklist","plan-patch","commit"].includes(action.kind))bad();
  return requires;
}

export function planBatch(config: Settings, inventory: Inventory, report: Report, requested: Action[]): Batch {
  if (report.repository !== config.repository || inventory.repository !== config.repository || report.hostname !== config.hostname ||
      report.source_commit !== inventory.source_commit || git(config.root, "rev-parse", "HEAD") !== report.source_commit || !Array.isArray(requested)) bad();
  if(!Array.isArray(report.observations)||!Array.isArray(report.index_requests))bad();
  const rebuilt=buildReport(config,inventory,report.observations,{runId:report.run_id,indexRequests:report.index_requests});
  if(hash(reportFacts(rebuilt))!==hash(reportFacts(report)))bad();
  const contextId=hash({config,inventory,report:reportFacts(report)});
  const actions = structuredClone(requested), ids = new Set<string>();
  publicationActions(config,inventory,report,actions);
  if(actions.some(action=>!["plan-patch","commit"].includes(action.kind))&&(!nonempty(inventory.actor)||!inventory.coverage.some(entry=>entry.collection==="identity"&&entry.complete&&!entry.error)))bad();
  for (const action of actions) {
    if(action.kind==="create-label" || (action.kind==="labels"||action.kind==="create")&&action.labels.length){
      if(!Array.isArray(inventory.labels)||!inventory.coverage.some(entry=>entry.collection==="labels"&&entry.complete&&!entry.error))bad();
      if(action.kind!=="create-label")for(const name of action.labels){
        const existing=inventory.labels.some(label=>label.name.toLowerCase()===name.toLowerCase());
        const creation=actions.find(prior=>prior.kind==="create-label"&&prior.name.toLowerCase()===name.toLowerCase()&&actions.indexOf(prior)<actions.indexOf(action));
        if(!existing&&!creation)bad();
      }
    }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(action.id) || ids.has(action.id)) bad(); ids.add(action.id);
    if ("issue" in action) {
      if (!Number.isSafeInteger(action.issue) || action.issue < 1) bad();
      const row = report.rows.find((row) => row.number === action.issue), issue = [...inventory.issues, ...inventory.closed_issues].find((issue) => issue.number === action.issue);
      if (!row || !issue || row.ownership === "protected" || ownership(issue, config, row.ownership === "index") === "protected" ||
          row.ownership === "index" && (!row.index_requested || !["checklist", "close", "comment"].includes(action.kind))) bad();
      if (action.kind === "close" && (!row.close_executable || !report.completeness.inventory || !report.completeness.verification || action.reason !== row.closure_reason || action.duplicate_of !== row.duplicate_of)) bad();
      if (action.kind === "checklist" && (row.ownership !== "index" || !row.index_requested || action.before !== issue.body || !checklist(action.before, action.after))) bad();
    }
    switch (action.kind) {
      case "create-request":Object.assign(action,requestPayload(contextId,action));break;
      case "comment": case "create": {
        if (!nonempty(action.body) || action.kind === "create" && (!nonempty(action.title) || !strings(action.labels))) bad();
        action.body += `\n\n${marker(contextId, action.id)}`; break;
      }
      case "labels": if (!strings(action.labels) || !action.labels.length) bad(); break;
      case "create-label": if(action.definition!==undefined){const description=vocabularyDescription(action);if(description===null)bad();action.description=description;}if (!nonempty(action.name) || !/^[0-9a-f]{6}$/i.test(action.color) || typeof action.description !== "string") bad(); break;
      case "close": if (!["completed", "not_planned"].includes(action.reason) || !nonempty(action.comment)) bad(); break;
      case "checklist": break;
      case "plan-patch": validatePatch(config, action); break;
      case "commit": if (!/^(?:docs|chore)(?:\([^\r\n]+\))?: [^\r\n]+$/.test(action.subject) || action.body!==undefined && (!nonempty(action.body)||action.body!==action.body.trim()) || !strings(action.paths) || !action.paths.length || !strings(action.requires) || !action.requires.length) bad(); break;
      default: bad();
    }
  }
  for (const action of actions) {
    if (action.kind === "close" && !actions.some((prior) => prior.id === action.comment && prior.kind === "comment" && prior.issue === action.issue && actions.indexOf(prior) < actions.indexOf(action))) bad();
    if(action.kind==="close" && action.duplicate_of!==null && (!inventory.issues.some(issue=>issue.number===action.duplicate_of&&issue.state==="open") || actions.some(other=>other.kind==="close"&&other.issue===action.duplicate_of)))bad();
    if (action.kind === "plan-patch" && action.created_by && !actions.some((prior) => prior.id === action.created_by && ["create","create-request"].includes(prior.kind) && actions.indexOf(prior) < actions.indexOf(action))) bad();
    if (action.kind === "commit") {
      const patches = actions.filter((prior) => action.requires.includes(prior.id));
      if (patches.length !== action.requires.length || patches.some((prior) => prior.kind !== "plan-patch" || actions.indexOf(prior) > actions.indexOf(action)) ||
          hash([...action.paths].sort()) !== hash(patches.map((prior) => (prior as Extract<Action, { kind: "plan-patch" }>).path).sort())) bad();
    }
  }
  const batch: Batch = { schema_version: 1, hash: "", context_id:contextId,repository: config.repository, hostname: config.hostname,
    settings_hash: hash(config), source_commit: report.source_commit, source_hash: sourceHash(config, actions),
    report: structuredClone(report), issues: structuredClone([...inventory.issues, ...inventory.closed_issues]), labels:structuredClone(inventory.labels??[]),actor:inventory.actor??null,inventory:structuredClone(inventory), actions };
  batch.hash = batchHash(batch); return batch;
}
export function approveBatch(batch: Batch, actionIds: string[], ownerStatement: string): Approval {
  if (batch.hash !== batchHash(batch) || !Array.isArray(actionIds) || new Set(actionIds).size !== actionIds.length ||
      actionIds.some((id) => !batch.actions.some((action) => action.id === id)) || !nonempty(ownerStatement)) bad();
  return { batch_hash: batch.hash, action_ids: [...actionIds], owner_statement: ownerStatement };
}
function saveJournal(path: string, journal: Journal) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(journal), { mode: 0o600 }); renameSync(temporary, path);
}

export async function executeBatch(config: Settings, batch: Batch, approval: Approval, adapter: Adapter, options: {
  journal: string; gate?: (gate: { status: string; document: string }) => Promise<boolean | {pass:boolean;line:string}>;
}): Promise<{ completed: string[]; blocked: string[]; failed: string[] }> {
  if (batch.hash !== batchHash(batch) || approval.batch_hash !== batch.hash || hash(config) !== batch.settings_hash ||
      !nonempty(approval.owner_statement) || new Set(approval.action_ids).size !== approval.action_ids.length ||
      approval.action_ids.some((id) => !batch.actions.some((action) => action.id === id))) bad();
  if(batch.context_id!==hash({config,inventory:batch.inventory,report:reportFacts(batch.report)}))bad();
  const rebuilt=buildReport(config,batch.inventory,batch.report.observations,{runId:batch.report.run_id,indexRequests:batch.report.index_requests,fixedHead:batch.source_commit});
  if(hash(reportFacts(rebuilt))!==hash(reportFacts(batch.report)))bad();
  if(publicationActions(config,batch.inventory,batch.report,batch.actions)&&!hasManagedControllerAuthority())bad();
  for(const action of batch.actions)if(action.kind==="create-request"){const expected=requestPayload(batch.context_id,action);if(action.title!==expected.title||action.body!==expected.body)bad();}
  for(const action of batch.actions)if(action.kind==="create-label"&&action.definition!==undefined&&action.description!==vocabularyDescription(action))bad();
  const path = options.journal;
  mkdirSync(dirname(path), { recursive: true });
  const releaseRepository=await executionLock(repositoryLockPath(config));let releaseLock:(()=>Promise<void>)|undefined;
  try {
    releaseLock=await executionLock(`${path}.lock`);
    let journal: Journal = { schema_version: 1, batch_hash: batch.hash, completed: [], started: null, results: {}, issues: Object.fromEntries(batch.issues.map((issue) => [issue.number, issue])), source_commit: batch.source_commit, uncertain: [] };
    if (existsSync(path)) {
      try { journal = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("unreadable triage execution journal"); }
      if (journal.schema_version !== 1 || journal.batch_hash !== batch.hash || !Array.isArray(journal.completed) || !Array.isArray(journal.uncertain) || !journal.results || !journal.issues) bad();
      const interrupted = batch.actions.find((action) => action.id === journal.started);
      if (interrupted && !["plan-patch", "commit"].includes(interrupted.kind) && !journal.completed.includes(interrupted.id) && !journal.uncertain.includes(interrupted.id)) {
        journal.uncertain.push(interrupted.id); saveJournal(path, journal);
      }
    }
    const history=executionHistory(config,path,batch.hash);
    if(history.blocked)return{completed:journal.completed,blocked:approval.action_ids.filter(id=>!journal.completed.includes(id)),failed:[]};
    const blocked: string[] = [], failed: string[] = [];
    const pendingCommit = batch.actions.find((action) => action.id === journal.started && action.kind === "commit") as Extract<Action, { kind: "commit" }> | undefined;
    const head = git(config.root, "rev-parse", "HEAD");
    if (pendingCommit && head !== journal.source_commit && approval.action_ids.includes(pendingCommit.id)) {
      const paths = git(config.root, "diff-tree", "--no-commit-id", "--name-only", "-r", head).split("\n").filter(Boolean).sort();
      const exact = git(config.root, "show", "-s", "--format=%P", head) === journal.source_commit &&
        git(config.root, "show", "-s", "--format=%s", head) === pendingCommit.subject && hash(paths) === hash([...pendingCommit.paths].sort()) &&
        git(config.root, "show", "-s", "--format=%b", head) === (pendingCommit.body??"") &&
        pendingCommit.requires.every((id) => journal.completed.includes(id)) && pendingCommit.paths.every((path) => {
          const patch = batch.actions.find((action) => action.kind === "plan-patch" && action.path === path) as Extract<Action, { kind: "plan-patch" }>;
          const expected = patch.created_by ? patch.after.replace("{{created_issue_url}}", journal.results[patch.created_by].url!) : patch.after;
          const stored = Bun.spawnSync(["git", "-C", config.root, "show", `${head}:${path}`], { stdout: "pipe", stderr: "pipe" });
          return stored.exitCode === 0 && stored.stdout.toString() === expected && readFileSync(resolveInside(config.root, path), "utf8") === expected;
        });
      if (exact && sourceHash(config, batch.actions, journal) === batch.source_hash) {
        journal.source_commit = head; journal.completed.push(pendingCommit.id); journal.started = null; saveJournal(path, journal);
      }
    }
    const liveConfig = () => {
      // Identity and settings are re-read before every effect. Custom settings are retained on config.
      const fresh = loadSettings(config.root, config.configured ? { settingsPath: config.settings_path } : {});
      return hash(fresh) === batch.settings_hash;
    };
    for (const action of batch.actions) {
      if (!approval.action_ids.includes(action.id) || journal.completed.includes(action.id)) continue;
      let mutationAttempted = false;
      try {
        if(!["plan-patch","commit"].includes(action.kind)&&(!batch.actor||(await adapter.identity()).toLowerCase()!==batch.actor.toLowerCase())){blocked.push(action.id);continue;}
        if (!liveConfig() || git(config.root, "rev-parse", "HEAD") !== journal.source_commit || sourceHash(config, batch.actions, journal) !== batch.source_hash) { blocked.push(action.id); continue; }
        const dependencies = action.kind === "close" ? [action.comment] : action.kind === "plan-patch" && action.created_by ? [action.created_by] : action.kind === "commit" ? action.requires : [];
        if (dependencies.some((id) => !journal.completed.includes(id))) { blocked.push(action.id); continue; }
        if((action.kind==="labels"||action.kind==="create")&&action.labels.length){
          const live=await adapter.labels();
          const permitted=action.labels.every(name=>{
            const current=live.find(label=>label.name.toLowerCase()===name.toLowerCase());
            if(!current)return false;
            const previous=batch.labels.find(label=>label.name.toLowerCase()===name.toLowerCase());
            if(previous)return hash(current)===hash(previous);
            const creation=batch.actions.find(prior=>prior.kind==="create-label"&&prior.name.toLowerCase()===name.toLowerCase());
            return creation?.kind==="create-label"&&approval.action_ids.includes(creation.id)&&journal.completed.includes(creation.id)&&current.color===creation.color.toLowerCase()&&current.description===creation.description;
          });
          if(!permitted){blocked.push(action.id);continue;}
        }
        let current: Issue | undefined;
        if ("issue" in action) {
          current = await adapter.issue(action.issue);
          const row = batch.report.rows.find((row) => row.number === action.issue)!;
          if (ownership(current, config, row.ownership === "index") === "protected") { blocked.push(action.id); continue; }
          if(row.duplicate_of!==null){
            const canonical=await adapter.issue(row.duplicate_of),before=batch.issues.find(issue=>issue.number===row.duplicate_of);
            const context=(issue:Issue)=>{const{comments:_comments,...rest}=material(issue);return rest;};
            if(!before||canonical.state!=="open"||hash(context(canonical))!==hash(context(before))){blocked.push(action.id);continue;}
          }
        }
        // A receipt reconciles a completed remote request whose response/journal write was lost.
        const attempted=journal.attempts?.[action.id];
        const receipt = !["plan-patch", "commit"].includes(action.kind) && (attempted||journal.uncertain.includes(action.id)) ? await adapter.receipt(actionKey(batch, action), action,attempted&&batch.actor?{actor:batch.actor,attempted_at:attempted}:undefined) : null;
        if (receipt) {
          if (current && !changedOnlyBy(journal.issues[current.number], current, action)) { blocked.push(action.id); continue; }
          journal.results[action.id] = receipt;
          if (current) journal.issues[current.number] = current;
          journal.uncertain = journal.uncertain.filter((id) => id !== action.id);
          journal.completed.push(action.id); journal.started = null; saveJournal(path, journal); history.resolve(action.id);continue;
        }
        if (journal.uncertain.includes(action.id)) { blocked.push(action.id); continue; }
        if (current && hash(material(current)) !== hash(material(journal.issues[current.number]))) { blocked.push(action.id); continue; }
        journal.started = action.id;journal.attempts={...(journal.attempts??{}),[action.id]:new Date().toISOString()};saveJournal(path, journal);
        let result: MutationResult = {};
        if (action.kind === "plan-patch") {
          const target = resolveInside(config.root, action.path);
          if (git(config.root, "diff", "--cached", "--name-only", "--", action.path)) { blocked.push(action.id); continue; }
          let after = action.after;
          if (action.created_by) {
            const created = journal.results[action.created_by], expected = `https://${config.hostname}/${config.repository}/issues/${created?.number}`;
            if (!created?.number || created.url !== expected) { blocked.push(action.id); continue; }
            after = after.replace("{{created_issue_url}}", expected);
          }
          const content = readFileSync(target, "utf8");
          if (content===after && action.gate && !journal.gated?.includes(action.id)) { blocked.push(action.id); continue; }
          if (content !== after) {
            if(content!==action.before){blocked.push(action.id);continue;}
            if(action.gate){
              const checked=options.gate?await options.gate(action.gate):false;
              if(checked!==true && (!checked || typeof checked!=="object" || checked.pass!==true || !nonempty(checked.line) || /[\r\n]/.test(checked.line))){blocked.push(action.id);continue;}
              const commits=batch.actions.filter(candidate=>candidate.kind==="commit" && candidate.requires.includes(action.id) && approval.action_ids.includes(candidate.id)) as Extract<Action,{kind:"commit"}>[];
              if(commits.some(commit=>typeof checked!=="object" || !commit.body?.split("\n").includes(checked.line))){blocked.push(action.id);continue;}
              if(typeof checked==="object"){journal.gate_lines={...(journal.gate_lines??{}),[action.id]:checked.line};}
            }
            if (readFileSync(target, "utf8") !== action.before) { blocked.push(action.id); continue; }
            if(action.gate){journal.gated=[...new Set([...(journal.gated??[]),action.id])];saveJournal(path,journal);}
            writeFileSync(target, after);
          }
        } else if (action.kind === "commit") {
          const gated=action.requires.filter(id=>batch.actions.some(patch=>patch.id===id && patch.kind==="plan-patch" && patch.gate));
          if(gated.some(id=>!journal.gate_lines?.[id] || !action.body?.split("\n").includes(journal.gate_lines[id]))){blocked.push(action.id);continue;}
          for (const selected of action.paths) {
            const patch = batch.actions.find((prior) => prior.kind === "plan-patch" && prior.path === selected) as Extract<Action, { kind: "plan-patch" }>;
            const after = patch.created_by ? patch.after.replace("{{created_issue_url}}", journal.results[patch.created_by].url!) : patch.after;
            if (readFileSync(resolveInside(config.root, selected), "utf8") !== after) throw new Error("approved patch changed before commit");
          }
          git(config.root, "add", "--", ...action.paths);
          git(config.root, "commit", "--cleanup=verbatim", "-m", action.subject, ...(action.body?["-m",action.body]:[]), "--", ...action.paths);
          journal.source_commit = git(config.root, "rev-parse", "HEAD");
        } else {
          history.register(action.id);
          mutationAttempted = true;
          result = await adapter.mutate(action, actionKey(batch, action));
          if (current) {
            const after = result.issue ?? await adapter.issue(current.number);
            if (!changedOnlyBy(current, after, action)) throw new Error("tracker changed outside the approved payload");
            journal.issues[current.number] = after;
          }
        }
        journal.results[action.id] = result; journal.completed.push(action.id); journal.started = null; saveJournal(path, journal);history.resolve(action.id);
      } catch (error) {
        if (mutationAttempted && (!(error instanceof MutationFailure) || error.uncertain)) {
          if (!journal.uncertain.includes(action.id)) journal.uncertain.push(action.id);
          saveJournal(path, journal);
        } else if (mutationAttempted) {
          journal.started = null; saveJournal(path, journal);history.resolve(action.id);
        }
        failed.push(action.id);
      }
    }
    return { completed: journal.completed, blocked, failed };
  } finally { try{if(releaseLock)await releaseLock();}finally{await releaseRepository();} }
}
