import { afterEach, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { collect, type Reader, type ReadRequest } from "../../../plugins/vh-adlc/scripts/triage/collect";
import { parsePage } from "../../../plugins/vh-adlc/scripts/triage/github";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/triage/settings";
import { fixture, git } from "./fixtures";

const roots: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of roots.splice(0)) f.dispose(); });
function project() { const f = fixture(); roots.push(f); return f; }
function issue(number: number, state = "open") {
  return { number, title: `Work ${number}`, body: `Scope ${number}`, state, user: { login: "owner" },
    labels: [], milestone: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
}
function pages(data: Record<string, unknown[]>) {
  const calls: { request: ReadRequest; page: number }[] = [];
  const reader: Reader = { async page(request, page) {
    calls.push({ request, page });
    const key = request.kind === "comments" ? `comments:${request.issue}` : request.kind;
    const items = data[key] ?? [], start = (page - 1) * 100;
    return { items: items.slice(start, start + 100), next: start + 100 < items.length ? page + 1 : null };
  } };
  return { reader, calls };
}

test("every page is collected beyond the legacy issue/PR/comment limits", async () => {
  const f = project(), open = Array.from({ length: 201 }, (_, i) => issue(i + 1));
  const closed = Array.from({ length: 101 }, (_, i) => issue(i + 202, "closed"));
  const pulls = Array.from({ length: 301 }, (_, i) => ({ number: i + 500, title: "Partial", body: "Refs #1", merged_at: "2026-01-01T00:00:00Z" }));
  const comments = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, body: `Owner status ${i}`, user: { login: "owner" }, created_at: "2026-01-01T00:00:00Z" }));
  const source = pages({ issues: [...open, ...closed, { ...issue(999), pull_request: {} }], pulls, "comments:1": comments });
  const before = git(f.root, "status", "--porcelain");
  const result = await collect(loadSettings(f.root), source.reader, { mode: "sweep" });
  expect(result.issues).toHaveLength(201);
  expect(result.closed_issues).toHaveLength(101);
  expect(result.pulls).toHaveLength(301);
  expect(result.issues[0].comments).toHaveLength(101);
  expect(result.coverage.every((entry) => entry.complete)).toBe(true);
  expect(result.coverage.find((entry) => entry.collection === "issues")?.pages).toBe(4);
  expect(result.coverage.find((entry) => entry.collection === "comments:1")?.pages).toBe(2);
  expect(result.plan_metadata).toBe("not-configured");
  expect(result.source_commit).toBe(git(f.root, "rev-parse", "HEAD"));
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

test("a failed page preserves partial data and explicit sanitized coverage", async () => {
  const f = project(), source = pages({ issues: Array.from({ length: 101 }, (_, i) => issue(i + 1)) });
  const reader: Reader = { async page(request, page) {
    if (request.kind === "issues" && page === 2) throw new Error("secret-value: permission denied");
    return source.reader.page(request, page);
  } };
  const result = await collect(loadSettings(f.root), reader);
  expect(result.issues).toHaveLength(100);
  expect(result.coverage.find((entry) => entry.collection === "issues")?.complete).toBe(false);
  expect(result.coverage.find((entry) => entry.collection === "issues")?.error).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("secret-value");
});

test("malformed pages, repeated page cursors and repeated IDs cannot claim completeness", async () => {
  for (const reader of [
    { async page() { return { items: "not an array", next: null }; } },
    { async page() { return { items: [issue(1)], next: 1 }; } },
    { async page(_request: ReadRequest, page: number) { return { items: [issue(1)], next: page === 1 ? 2 : null }; } },
    { async page() { return { items: [{ number: "invalid" }], next: null }; } },
  ]) {
    const result = await collect(loadSettings(project().root), reader as Reader);
    expect(result.coverage.some((entry) => !entry.complete)).toBe(true);
  }
});

test("replayed filtered PR records cannot hide an unstable issue or pull inventory",async()=>{
  const f=project();
  const reader:Reader={async page(request,page){
    if(request.kind==="comments")return{items:[],next:null};
    const filtered=request.kind==="issues"?{...issue(42),pull_request:{}}:{number:42,merged_at:null};
    return{items:[filtered],next:page===1?2:null};
  }};
  const result=await collect(loadSettings(f.root),reader);
  expect(result.coverage.find(entry=>entry.collection==="issues")?.complete).toBe(false);
  expect(result.coverage.find(entry=>entry.collection==="pulls")?.complete).toBe(false);
});

test("a configured page budget is incomplete coverage, never a successful empty inventory", async () => {
  const f = project(); f.settings({ schema_version: 1, page_budget: 1 });
  const source = pages({ issues: Array.from({ length: 101 }, (_, i) => issue(i + 1)) });
  const result = await collect(loadSettings(f.root), source.reader);
  expect(source.calls).toHaveLength(1);
  expect(result.issues).toHaveLength(100);
  expect(result.coverage.some((entry) => !entry.complete && entry.error === "page-budget-exhausted")).toBe(true);
});

test("repository vocabulary is collected on every page and preserves exact label metadata",async()=>{
  const source=pages({labels:Array.from({length:101},(_,at)=>({id:at+1,name:`label-${at}`,color:"aa00ff",description:`Purpose ${at}`}))});
  const result=await collect(loadSettings(project().root),source.reader);
  expect(result.labels).toHaveLength(101);expect(result.labels?.[100].description).toBe("Purpose 100");
  expect(result.coverage.find(entry=>entry.collection==="labels")).toMatchObject({complete:true,pages:2});
});

test("GitHub label reads follow verified numeric links and disable prompts on every page",async()=>{
  const f=project();
  f.write("tools/gh",`#!/usr/bin/env bun
if(process.env.GH_PROMPT_DISABLED!=="1")throw Error("interactive prompt possible");
const args=process.argv.slice(2),target=args.find(a=>a.startsWith("repos/")||a.startsWith("https:"));
if(args.includes("--jq")){process.stdout.write("42\\n");process.exit(0);}
const second=target.includes("page=2");
if(second&&!target.startsWith("https://api.github.com/repositories/42/labels?"))throw Error("lost validated target");
const items=Array.from({length:second?1:100},(_,i)=>({id:(second?100:0)+i+1,name:"label-"+((second?100:0)+i),color:"aa00ff",description:"Exact purpose"}));
const link=second?"":'Link: <https://api.github.com/repositories/42/labels?per_page=100&page=2>; rel="next"\\r\\n';
process.stdout.write("HTTP/2.0 200 OK\\r\\n"+link+"\\r\\n"+JSON.stringify(items));
`);
  const{chmodSync}=await import("node:fs");chmodSync(join(f.root,"tools/gh"),0o700);
  const code=`import{githubExecutor}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/github.ts"))};import{loadSettings}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/settings.ts"))};console.log(JSON.stringify(await githubExecutor(loadSettings(${JSON.stringify(f.root)})).labels()));`;
  const run=Bun.spawnSync(["bun","-e",code],{env:{...process.env,PATH:`${join(f.root,"tools")}:${process.env.PATH}`},stdout:"pipe",stderr:"pipe"});
  expect({exit:run.exitCode,error:run.stderr.toString()}).toEqual({exit:0,error:""});expect(JSON.parse(run.stdout.toString())).toHaveLength(101);
});

test("plan joins use structured metadata and preserve untracked and foreign references", async () => {
  const f = project();
  f.write("plans/local.md", "---\ntracker: https://github.com/example/project/issues/5\nstate: planned\nrank: high\n---\nDetails\n");
  f.write("plans/untracked.md", "---\nstate: planned\n---\n");
  f.write("plans/foreign.md", "---\ntracker: https://github.com/other/project/issues/5\n---\n");
  f.settings({ schema_version: 1, plan_roots: ["plans"], plan_fields: { issue: "tracker", status: "state", priority: "rank" } });
  const result = await collect(loadSettings(f.root), pages({ issues: [issue(5)] }).reader);
  expect(result.plan_metadata).toBe("available");
  expect(result.plans.find((plan) => plan.path === "plans/local.md")?.issue).toBe(5);
  expect(result.plans.find((plan) => plan.path === "plans/local.md")?.priority).toBe("high");
  expect(result.plans.find((plan) => plan.path === "plans/untracked.md")?.issue_ref).toBeNull();
  expect(result.plans.find((plan) => plan.path === "plans/foreign.md")?.issue).toBeNull();
  expect(result.plans.find((plan) => plan.path === "plans/foreign.md")?.issue_ref).toContain("other/project");
});

test("invalid metadata and nested symlink escapes are visible incomplete plan coverage", async () => {
  const f = project(), outside = project();
  f.write("plans/broken.md", "---\nissue: [invalid\n---\n");
  symlinkSync(outside.root, join(f.root, "plans", "external"), "dir");
  f.settings({ schema_version: 1, plan_roots: ["plans"] });
  const result = await collect(loadSettings(f.root), pages({}).reader);
  expect(result.plan_metadata).toBe("incomplete");
  expect(result.coverage.find((entry) => entry.collection === "plans")?.complete).toBe(false);
});

test("targeted mode reads comments only for its declared issues and rejects unknown targets", async () => {
  const f = project(), source = pages({ issues: [issue(1), issue(2)] });
  const result = await collect(loadSettings(f.root), source.reader, { mode: "ids", ids: [2] });
  expect(result.requested_ids).toEqual([2]);
  expect(source.calls.filter((call) => call.request.kind === "comments").map((call) => call.request.issue)).toEqual([2]);
  const missing = await collect(loadSettings(f.root), source.reader, { mode: "ids", ids: [99] });
  expect(missing.coverage.some((entry) => !entry.complete && entry.error === "requested-issue-unavailable")).toBe(true);
});

test("a changing source HEAD invalidates collection instead of producing mixed-source proof", async () => {
  const f = project(), start = git(f.root, "rev-parse", "HEAD");
  let changed = false;
  const reader: Reader = { async page() {
    if (!changed) { changed = true; f.write("src/other.ts", "export const changed = true;\n"); git(f.root, "add", "src/other.ts"); git(f.root, "commit", "-qm", "test: concurrent source"); }
    return { items: [], next: null };
  } };
  const result = await collect(loadSettings(f.root), reader);
  expect(result.source_commit).toBe(start);
  expect(result.coverage.some((entry) => !entry.complete && entry.error === "source-head-changed")).toBe(true);
});

test("the CLI page parser follows validated Link metadata and rejects failed/non-list responses", () => {
  const expected = { hostname: "github.com", endpoint: "repos/example/project/issues?state=all&per_page=100", page: 1 };
  const response = 'HTTP/2.0 200 OK\r\nLink: <https://api.github.com/repos/example/project/issues?state=all&per_page=100&page=2>; rel="next"\r\n\r\n[]';
  expect(parsePage(response, expected)).toEqual({ items: [], next: 2 });
  expect(() => parsePage(response.replace("api.github.com", "other.example"), expected)).toThrow();
  expect(() => parsePage(response.replace("state=all", "state=closed"), expected)).toThrow();
  expect(() => parsePage("HTTP/2.0 403 Forbidden\n\n{}", expected)).toThrow();
  expect(() => parsePage("HTTP/2.0 200 OK\n\n{}", expected)).toThrow();
  expect(parsePage(response.replace('rel="next"', 'rel="NEXT"'), expected).next).toBe(2);
  expect(() => parsePage(response.replace('rel="next"', 'broken-next-link'), expected)).toThrow();
});

test("GitHub numeric repository links retain their validated cursor without changing collection scope", () => {
  let target = "";
  const expected = { hostname: "github.com", endpoint: "repos/example/project/issues?state=all&per_page=100", page: 1,
    repositoryId: 42, onNext: (url: string) => { target = url; } };
  const url = "https://api.github.com/repositories/42/issues?state=all&per_page=100&page=2&after=opaque%3D%3D";
  const raw = `HTTP/2.0 200 OK\r\nLink: <${url}>; rel="next"\r\n\r\n[]`;
  expect(parsePage(raw, expected)).toEqual({ items: [], next: 2 });
  expect(target).toBe(url);
  expect(parsePage(raw.replace("&page=2", ""), expected)).toEqual({items:[],next:2});
  expect(() => parsePage(raw.replace("/42/", "/43/"), expected)).toThrow();
  expect(() => parsePage(raw.replace("state=all", "state=closed"), expected)).toThrow();
  expect(() => parsePage(raw.replace("after=opaque%3D%3D", "after="), expected)).toThrow();
});

test("non-plan descriptions do not break plan coverage and blank issue fields remain untracked", async () => {
  const f = project();
  f.write("plans/analysis.md", "---\ndescription: “Analysis: details”\n---\nContext\n");
  f.write("plans/untracked.md", '---\nissue: ""\nstatus: planned\n---\n');
  f.settings({ schema_version: 1, plan_roots: ["plans"] });
  const result = await collect(loadSettings(f.root), pages({}).reader);
  expect(result.plan_metadata).toBe("available");
  expect(result.plans).toHaveLength(1);
  expect(result.plans[0].issue).toBeNull();
  expect(result.plans[0].issue_ref).toBeNull();
  f.write("plans/broken.md", '---\n"issue": [invalid\n---\n');
  expect((await collect(loadSettings(f.root), pages({}).reader)).plan_metadata).toBe("incomplete");
});

test("a plan-file alias cannot turn generated metadata into the canonical plan spine", async () => {
  const f = project();
  f.write("plans/README.md", "Plan directory\n");
  f.write("generated/plan.md", "---\nissue: 1\nstatus: complete\n---\n");
  symlinkSync(join(f.root, "generated", "plan.md"), join(f.root, "plans", "alias.md"));
  f.settings({ schema_version: 1, plan_roots: ["plans"], generated_mirrors: ["generated"] });
  const result = await collect(loadSettings(f.root), pages({}).reader);
  expect(result.plans).toEqual([]);
});

test("an invalid run timestamp fails before any API call", async () => {
  const source = pages({});
  await expect(collect(loadSettings(project().root), source.reader, { now: "not-a-date" })).rejects.toThrow();
  expect(source.calls).toHaveLength(0);
});
