import { GitHub, pageInfo, pages } from "./github";
import { list, object, resolveFields, string, type Field, type Settings } from "./settings";

export type IssueRef = { id: string; repository: string; number: number; url: string; title: string; state: string; stateReason: string | null };
export type PullRequest = { url: string; state: string; head: string; review: string | null; checks: string | null };
export type Issue = IssueRef & { prs: PullRequest[]; blockedBy: IssueRef[]; lifecycle: null };
export type Item = { id: string; archived: boolean; issue: IssueRef; values: Record<string, string> };
export type Operation = { kind: "add"; issue: IssueRef } | { kind: "set"; issue: IssueRef; item: string; field: string; before: string | null; value: string };
export type Inventory = { schema_version: 1; project: { id: string; url: string } | null; repositories: string[]; observed_at: string; complete: boolean; gaps: string[]; fields: Field[]; items: Item[]; issues: Issue[]; proposed: Operation[] };
export const issueFields = "id number url title state stateReason repository { nameWithOwner }";
const fieldFields = "... on ProjectV2SingleSelectField { id name options { id } }";
const valueFields = "... on ProjectV2ItemFieldSingleSelectValue { optionId field { ... on ProjectV2SingleSelectField { id } } }";
const prFields = "url state headRefOid reviewDecision commits(last:1) { nodes { commit { statusCheckRollup { state } } } }";

export function issueRef(value: unknown): IssueRef {
  const row = object(value), repository = typeof row.repository === "string" ? string(row.repository) : string(object(row.repository).nameWithOwner), number = row.number;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) throw new Error("invalid issue number");
  const url = string(row.url);
  if (url !== `https://github.com/${repository}/issues/${number}`) throw new Error("issue URL does not match identity");
  const state = string(row.state);
  if (!["OPEN", "CLOSED"].includes(state)) throw new Error("unknown issue state");
  return { id: string(row.id), repository, number, url, title: string(row.title), state, stateReason: row.stateReason === null ? null : string(row.stateReason) };
}
export function allowed(settings: Settings, issue: IssueRef): boolean {
  return settings.repositories.some(repo => repo.toLowerCase() === issue.repository.toLowerCase());
}
export function projectFields(settings: Settings, gh: GitHub): { project: { id: string; url: string }; fields: Field[] } {
  let identity: { id: string; url: string } | undefined;
  const available = pages(cursor => {
    const data = gh.query(`query ProjectFields($owner:String!,$number:Int!,$cursor:String) { ${settings.ownerType}(login:$owner) { projectV2(number:$number) { id url fields(first:100,after:$cursor) { nodes { ${fieldFields} } ${pageInfo} } } } }`, { owner: settings.owner, number: settings.number, cursor });
    const project = object(object(data[settings.ownerType]).projectV2);
    const current = { id: string(project.id), url: string(project.url) };
    if (current.url !== settings.project || identity && identity.id !== current.id) throw new Error("project identity changed");
    identity = current;
    return project.fields;
  }).filter(row => row.id !== undefined).map(row => ({ id: string(row.id), name: string(row.name), options: list(row.options).map(value => string(object(value).id)) }));
  if (!identity) throw new Error("project is inaccessible");
  return { project: identity, fields: resolveFields(settings, available) };
}
export function projectItems(id: string, gh: GitHub): Item[] {
  const rows = pages(cursor => object(gh.query(`query ProjectItems($id:ID!,$cursor:String) { node(id:$id) { ... on ProjectV2 { id items(first:100,after:$cursor,archivedStates:[ARCHIVED,NOT_ARCHIVED]) { nodes { id isArchived content { __typename ... on Issue { ${issueFields} } } } ${pageInfo} } } } }`, { id, cursor }).node).items);
  const items: Item[] = [], seen = new Set<string>();
  for (const row of rows) {
    const content = object(row.content);
    if (content.__typename !== undefined && content.__typename !== "Issue") continue;
    const issue = issueRef(content);
    if (seen.has(issue.id)) throw new Error("duplicate issue membership");
    seen.add(issue.id);
    const item = string(row.id), values: Record<string, string> = {};
    const fields = pages(cursor => object(gh.query(`query ItemFields($id:ID!,$cursor:String) { node(id:$id) { ... on ProjectV2Item { fieldValues(first:100,after:$cursor) { nodes { ${valueFields} } ${pageInfo} } } } }`, { id: item, cursor }).node).fieldValues);
    for (const field of fields) if (field.optionId !== undefined) values[string(object(field.field).id)] = string(field.optionId);
    if (typeof row.isArchived !== "boolean") throw new Error("missing archival state");
    items.push({ id: item, archived: row.isArchived, issue, values });
  }
  return items;
}
function repositoryIssues(repository: string, gh: GitHub): IssueRef[] {
  const [owner, name] = repository.split("/");
  return pages(cursor => {
    const found = object(gh.query(`query RepositoryIssues($owner:String!,$name:String!,$cursor:String) { repository(owner:$owner,name:$name) { nameWithOwner issues(first:100,after:$cursor) { nodes { ${issueFields} } ${pageInfo} } } }`, { owner, name, cursor }).repository);
    if (string(found.nameWithOwner).toLowerCase() !== repository.toLowerCase()) throw new Error("repository identity changed");
    return found.issues;
  }).map(issueRef);
}
function relations(issue: IssueRef, gh: GitHub): Issue {
  const prs: PullRequest[] = [], blockedBy: IssueRef[] = [];
  const initial = object(gh.query(`query IssueRelations($id:ID!) { node(id:$id) { ... on Issue { closedByPullRequestsReferences(first:100,includeClosedPrs:true) { nodes { ${prFields} } ${pageInfo} } blockedBy(first:100) { nodes { ${issueFields} } ${pageInfo} } } } }`, { id: issue.id }).node);
  for (const relation of ["closedByPullRequestsReferences", "blockedBy"] as const) {
    const rows = pages(cursor => {
      if (cursor === null) return initial[relation];
      const fields = relation === "blockedBy" ? issueFields : prFields;
      const extra = relation === "blockedBy" ? "" : ",includeClosedPrs:true";
      const node = object(gh.query(`query IssueRelations($id:ID!,$cursor:String) { node(id:$id) { ... on Issue { ${relation}(first:100,after:$cursor${extra}) { nodes { ${fields} } ${pageInfo} } } } }`, { id: issue.id, cursor }).node);
      return node[relation];
    });
    if (relation === "blockedBy") blockedBy.push(...rows.map(issueRef));
    else for (const row of rows) {
      const commits = list(object(row.commits).nodes), latest = commits.length ? object(object(commits[0]).commit).statusCheckRollup : null;
      prs.push({ url: string(row.url), state: string(row.state), head: string(row.headRefOid), review: row.reviewDecision === null ? null : string(row.reviewDecision), checks: latest === null ? null : string(object(latest).state) });
    }
  }
  return { ...issue, prs, blockedBy, lifecycle: null };
}
export function collect(settings: Settings, gh: GitHub): Inventory {
  const result: Inventory = { schema_version: 1, project: null, repositories: settings.repositories, observed_at: new Date().toISOString(), complete: false, gaps: [], fields: [], items: [], issues: [], proposed: [] };
  try {
    const board = projectFields(settings, gh); result.project = board.project; result.fields = board.fields;
    result.items = projectItems(board.project.id, gh).filter(item => allowed(settings, item.issue));
    const seen = new Set<string>();
    for (const repository of settings.repositories) for (const issue of repositoryIssues(repository, gh)) {
      if (!allowed(settings, issue) || issue.repository.toLowerCase() !== repository.toLowerCase() || seen.has(issue.id)) throw new Error("conflicting issue identity");
      seen.add(issue.id); result.issues.push(relations(issue, gh));
    }
    result.complete = true;
    result.proposed = result.issues.filter(issue => issue.state === "OPEN" && !result.items.some(item => item.issue.id === issue.id)).map(issue => ({ kind: "add", issue }));
  } catch (error) {
    result.gaps.push(error instanceof Error ? error.message : "inventory unavailable");
  }
  return result;
}
export function render(result: Inventory): string {
  const lines = [`Projects inventory: ${result.complete ? "complete" : "incomplete"}`, `Observed: ${result.observed_at}`, "Repository lifecycle: unknown; inspect each owning checkout through vh-adlc before selecting implementation."];
  for (const issue of result.issues) {
    lines.push(`- ${issue.url}: ${issue.state}${issue.stateReason ? ` (${issue.stateReason})` : ""}`);
    for (const pr of issue.prs) lines.push(`  PR ${pr.url}: ${pr.state}; head ${pr.head}; review ${pr.review ?? "unknown"}; checks ${pr.checks ?? "unknown"}`);
    const blockers = issue.blockedBy.filter(blocker => blocker.state === "OPEN");
    lines.push(`  Next: ${blockers.length ? `inspect dependencies: ${blockers.map(blocker => blocker.url).join(", ")}` : issue.state === "CLOSED" ? "inspect closure reason before considering further work" : issue.prs.some(pr => pr.state === "OPEN") ? "inspect the owning PR review and lifecycle gates" : "triage in the owning repository"}`);
  }
  if (result.gaps.length) lines.push(...result.gaps.map(gap => `Gap: ${gap}`));
  lines.push(`Proposed issue additions: ${result.proposed.length}; no changes applied.`);
  return lines.join("\n") + "\n";
}
