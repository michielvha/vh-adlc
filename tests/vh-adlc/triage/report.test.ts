import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildReport, saveReport } from "../../../plugins/vh-adlc/scripts/triage/report";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/triage/settings";
import type { Inventory, Issue } from "../../../plugins/vh-adlc/scripts/triage/types";
import { fixture, git } from "./fixtures";
import{inspectSources,verifyCommand,verificationDirectory}from"../../../plugins/vh-adlc/scripts/triage/verification";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function setup(numbers = [1, 2]) {
  const f = fixture(); projects.push(f);
  f.settings({ schema_version: 1, source_roots: ["src"], priority_order: ["high", "low"], milestone_order: ["Launch"] });
  const config = loadSettings(f.root);
  const issues: Issue[] = numbers.map((number) => ({ number, title: `Work ${number}`, body: "Expose answer 42 through the app module", state: "open", author: "owner",
    labels: [], milestone: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", comments: [] }));
  const inventory: Inventory = { schema_version: 1, repository: config.repository, hostname: config.hostname,
    source_commit: git(f.root, "rev-parse", "HEAD"), mode: "sweep", requested_ids: [], collected_at: "2026-10-24T10:00:00Z",
    issues, closed_issues: [], pulls: [], plans: [], plan_metadata: "not-configured",
    coverage: ["issues", "pulls", "plans", ...numbers.map((n) => `comments:${n}`)].map((collection) => ({ collection, scope: "fixture", pages: collection === "plans" ? 0 : 1, complete: true })) };
  function pass(phase:"primary"|"adversarial"="primary") {
    const source = git(f.root, "show", "HEAD:src/app.ts");
    const result = Bun.spawnSync(["bun", "-e", 'import {answer} from "./src/app.ts"; if(answer !== 42) process.exit(1);'], { cwd: f.root, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(0);
    return [
      { kind: "source", path: "src/app.ts", line: 1, detail: source, verified: true },
      verifyCommand(config,["bun","-e",'import {answer} from "./src/app.ts"; if(answer !== 42) process.exit(1);'],phase),
    ];
  }
  const resolved = (number: number) => ({ number, state: "resolved", remaining: "", evidence: pass("primary"), adversarial: pass("adversarial") });
  const search = () => {
    const result = Bun.spawnSync(["git", "-C", f.root, "grep", "-n", "missingFunction", "HEAD", "--", "src"], { stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(1);
    return { kind: "search", scope: ["src"], result: "empty", detail: "No missingFunction implementation in canonical source", verified: true };
  };
  const open = (number: number) => ({ number, state: "open", remaining: "Implement missingFunction", evidence: [search()] });
  return { ...f, config, inventory, resolved, open, search };
}

test("resolved closure needs reachable source/test proof and a second verified pass", () => {
  const f = setup([1]), good = f.resolved(1);
  const report = buildReport(f.config, f.inventory, [good]);
  expect(report.rows[0].disposition).toBe("close-candidate");
  expect(report.rows[0].closure_reason).toBe("completed");
  expect(report.rows[0].close_executable).toBe(true);
  expect(buildReport(f.config, f.inventory, [{ ...good, adversarial: [] }]).rows[0].close_executable).toBe(false);
  const failed = { ...good, evidence: good.evidence.map((value) => value.kind === "test" ? { ...value, exit_code: 1 } : value) };
  expect(buildReport(f.config, f.inventory, [failed]).rows[0].close_executable).toBe(false);
});

test("claimed successful commands and a copied primary receipt cannot authorize closure",()=>{
  const f=setup([1]),observed=f.resolved(1);
  const strip=(values:typeof observed.evidence)=>values.map(({receipt:_receipt,...claim})=>claim);
  const claimed={...observed,evidence:strip(observed.evidence),adversarial:strip(observed.adversarial)};
  expect(buildReport(f.config,f.inventory,[claimed]).rows[0].close_executable).toBe(false);
  const argv=["bun","-e",'import{answer}from"./src/app.ts";if(answer!==42)process.exit(1);'];
  const primary=verifyCommand(f.config,argv,"primary"),adversarial=verifyCommand(f.config,argv,"adversarial");
  const source=claimed.evidence[0],observation={...claimed,evidence:[source,primary],adversarial:[{...source,detail:"Rechecked the canonical export"},adversarial]};
  expect(buildReport(f.config,f.inventory,[{...observation,adversarial:observation.evidence}]).rows[0].close_executable).toBe(false);
  expect(buildReport(f.config,f.inventory,[observation]).rows[0].close_executable).toBe(true);
  writeFileSync(join(verificationDirectory(f.config),`${primary.receipt}.json`),"{}");
  expect(buildReport(f.config,f.inventory,[observation]).rows[0].close_executable).toBe(false);
});

test("complete plans and merged Refs-only PRs are leads rather than closure evidence", () => {
  const f = setup([1]);
  f.inventory.plans.push({ path: "plans/a.md", issue: 1, issue_ref: "1", status: "complete", status_description: null, priority: "high" });
  f.inventory.pulls.push({ number: 50, title: "Partial work", body: "Refs #1", merged_at: "2026-10-01T00:00:00Z" });
  const report = buildReport(f.config, f.inventory, [{ number: 1, state: "resolved", evidence: [{ kind: "merged-pr", pull_number: 50, detail: "Refs #1", verified: true }], adversarial: [] }]);
  expect(report.rows[0].state).toBe("unverified");
  expect(report.rows[0].close_executable).toBe(false);
});

test("a merged PR closes only the issue its closing reference names", () => {
  const f=setup([1]), source=f.resolved(1).evidence.filter(value=>value.kind==="source");
  f.inventory.pulls.push({number:50,title:"Other work",body:"Closes #12",merged_at:"2026-10-01T00:00:00Z"});
  const proof=[...source,{kind:"merged-pr",pull_number:50,detail:"Verified merged implementation",verified:true}];
  const first=inspectSources(f.config,["src/app.ts"],"primary"),second=inspectSources(f.config,["src/app.ts"],"adversarial");
  const observation={number:1,state:"resolved",remaining:"",evidence:proof.map(item=>item.kind==="source"?{...item,receipt:first.receipt}:item),adversarial:proof.map(item=>item.kind==="source"?{...item,receipt:second.receipt,detail:"Rechecked canonical source"}:item)};
  expect(buildReport(f.config,f.inventory,[observation]).rows[0].close_executable).toBe(false);
  f.inventory.pulls[0].body="Closes example/project#1";
  expect(buildReport(f.config,f.inventory,[observation]).rows[0].close_executable).toBe(true);
});

test("partial work keeps its remaining scope and mirrors cannot establish resolution", () => {
  const f = setup([1]), good = f.resolved(1);
  const partial = buildReport(f.config, f.inventory, [{ ...good, state: "partial", remaining: "Wire the exported behavior into the route" }]);
  expect(partial.rows[0].state).toBe("partial");
  expect(partial.rows[0].remaining).toContain("Wire");
  expect(partial.rows[0].close_executable).toBe(false);
  f.write("generated/app.ts", "export const answer = 42;\n");
  f.settings({ schema_version: 1, generated_mirrors: ["generated"] });
  const config = loadSettings(f.root);
  const mirrored = { ...good, evidence: good.evidence.map((value) => value.kind === "source" ? { ...value, path: "generated/app.ts" } : value) };
  expect(buildReport(config, f.inventory, [mirrored]).rows[0].close_executable).toBe(false);
});

test("obsolete and total duplicate closures use their own evidence and not-planned reason", () => {
  const f = setup([1, 2]);
  const overlap = { kind: "overlap", reference: "issue:2", detail: "The complete requested scope belongs to canonical issue 2", verified: true };
  const duplicate = { number: 1, state: "duplicate", duplicate_of: 2, total_overlap: true, remaining: "Canonical issue 2 remains open", evidence: [overlap], adversarial: [{...overlap,detail:"Adversarial full-scope comparison against the canonical issue"}] };
  const report = buildReport(f.config, f.inventory, [duplicate, f.open(2)]);
  expect(report.rows[0].closure_reason).toBe("not_planned");
  expect(report.rows[0].close_executable).toBe(true);
  expect(buildReport(f.config, f.inventory, [{ ...duplicate, total_overlap: false }, f.open(2)]).rows[0].close_executable).toBe(false);
  f.write("src/legacy.ts", "export const legacy = true;\n");
  git(f.root, "add", "src/legacy.ts"); git(f.root, "commit", "-qm", "test: seed former mode");
  const beforeRemoval = git(f.root, "rev-parse", "HEAD");
  unlinkSync(join(f.root, "src/legacy.ts")); git(f.root, "add", "-u"); git(f.root, "commit", "-qm", "test: retire former mode");
  f.inventory.source_commit = git(f.root, "rev-parse", "HEAD");
  f.inventory.issues[0].body = "Extend the retired legacy mode";
  const removal = { kind: "removal", path: "src/legacy.ts", before_commit: beforeRemoval, reference: `commit:${f.inventory.source_commit}`, detail: "The former product scope was removed", verified: true };
  const obsolete = buildReport(f.config, f.inventory, [{ number: 1, state: "obsolete", evidence: [removal], adversarial: [{...removal,detail:"Adversarial ancestor/current-tree removal check"}] }, f.open(2)]);
  expect(obsolete.rows[0].close_executable).toBe(true);
  expect(obsolete.rows[0].closure_reason).toBe("not_planned");
});

test("a duplicate must retain open canonical work and cannot form a duplicate cycle",()=>{
  const f=setup([1,2]);
  const duplicate=(number:number,canonical:number)=>({number,state:"duplicate",duplicate_of:canonical,total_overlap:true,remaining:`Tracked by ${canonical}`,
    evidence:[{kind:"overlap",reference:`issue:${canonical}`,detail:"Verified total overlap",verified:true}],adversarial:[{kind:"overlap",reference:`issue:${canonical}`,detail:"Rechecked distinct acceptance criteria",verified:true}]});
  f.inventory.closed_issues=[{...f.inventory.issues[1],state:"closed"}];f.inventory.issues=[f.inventory.issues[0]];
  expect(buildReport(f.config,f.inventory,[duplicate(1,2)]).rows[0].close_executable).toBe(false);
  f.inventory.issues.push({...f.inventory.closed_issues[0],state:"open"});f.inventory.closed_issues=[];
  expect(buildReport(f.config,f.inventory,[duplicate(1,2),duplicate(2,1)]).rows.every(row=>!row.close_executable)).toBe(true);
});

test("any incomplete required collection or missing verification blocks every closure", () => {
  const f = setup(), observations = [f.resolved(1), f.open(2)];
  f.inventory.coverage[0] = { ...f.inventory.coverage[0], complete: false, error: "read-failed" };
  expect(buildReport(f.config, f.inventory, observations).rows.every((row) => !row.close_executable)).toBe(true);
  f.inventory.coverage[0] = { ...f.inventory.coverage[0], complete: true, error: undefined };
  expect(buildReport(f.config, f.inventory, [observations[0]]).rows.every((row) => !row.close_executable)).toBe(true);
  f.inventory.coverage = f.inventory.coverage.filter((entry) => entry.collection !== "pulls");
  expect(buildReport(f.config, f.inventory, observations).completeness.inventory).toBe(false);
});

test("unlisted indexes need a current owner request and hard ownership never gets an exception", () => {
  const f = setup([1]), index = { ...f.resolved(1), is_index: true };
  expect(buildReport(f.config, f.inventory, [index]).rows[0].close_executable).toBe(false);
  expect(buildReport(f.config, f.inventory, [index], { indexRequests: [1] }).rows[0].close_executable).toBe(true);
  f.settings({ schema_version: 1, protected_ids: [1] });
  expect(buildReport(loadSettings(f.root), f.inventory, [index], { indexRequests: [1] }).rows[0].close_executable).toBe(false);
});

test("blockers are verified predicates, not stale issue-state comments, and cycles never rank ready", () => {
  const f = setup(), first = f.open(1), second = f.open(2);
  const blocked = { ...first, state: "blocked", blockers: [{ issue: 2, missing: true, evidence: [f.search()] }] };
  const report = buildReport(f.config, f.inventory, [blocked, second]);
  expect(report.rows[0].disposition).toBe("blocked");
  expect(report.ranked.map((row) => row.number)).not.toContain(1);
  const cycles = buildReport(f.config, f.inventory, [{ ...first, depends_on: [2] }, { ...second, depends_on: [1] }]);
  expect(cycles.graph.cycles.length).toBeGreaterThan(0);
  expect(cycles.ranked).toEqual([]);
  f.inventory.issues = [f.inventory.issues[0]];
  f.inventory.closed_issues = [{ ...f.inventory.issues[0], number: 2, state: "closed" }];
  const unblocked = { ...blocked, depends_on:[2], blockers: [{ issue: 2, missing: false, evidence: f.resolved(1).evidence }] };
  expect(buildReport(f.config, f.inventory, [unblocked]).rows[0].disposition).toBe("ready");
  expect(buildReport(f.config, f.inventory, [unblocked]).rows[0].state).not.toBe("resolved");
});

test("ranking uses project data only in sweep/next and records reasons", () => {
  const f = setup(); f.inventory.issues[1].milestone = "Launch";
  const observations = [f.open(1), f.open(2)];
  expect(buildReport(f.config, f.inventory, observations).ranked.map((row) => row.number)).toEqual([2, 1]);
  expect(buildReport(f.config, f.inventory, observations).ranked[0].reasons.length).toBeGreaterThan(0);
  for (const mode of ["close", "stale", "ids"] as const) {
    const inventory = { ...f.inventory, mode, requested_ids: mode === "ids" ? [1, 2] : [] };
    expect(buildReport(f.config, inventory, observations).ranked).toEqual([]);
  }
});

test("reports preserve repeated runs and external output still compares configured history", () => {
  const f = setup(), observations = [f.open(1), f.open(2)];
  const first = buildReport(f.config, f.inventory, observations, { runId: "first" });
  const firstPath = saveReport(f.config, first);
  const before = readFileSync(firstPath, "utf8");
  const second = buildReport(f.config, f.inventory, observations, { runId: "second" });
  expect(second.comparison.previous_run_id).toBe("first");
  const outside = join(f.root, "..", `external-${f.root.split("/").at(-1)}.md`);
  try {
    saveReport(f.config, second, { output: outside });
    expect(readFileSync(firstPath, "utf8")).toBe(before);
    expect(readdirSync(join(f.root, f.config.report_dir))).toHaveLength(1);
    expect(() => saveReport(f.config, second, { output: outside })).toThrow();
    expect(git(f.root, "log", "--format=%s")).toBe("test: seed project");
  } finally { if (existsSync(outside)) unlinkSync(outside); }
});

test("mixed scopes and incomplete history cannot turn unobserved issues into removals", () => {
  const f = setup(), all = [f.open(1), f.open(2)];
  saveReport(f.config, buildReport(f.config, f.inventory, all, { runId: "full" }));
  const targeted = { ...f.inventory, mode: "ids" as const, requested_ids: [1] };
  const report = buildReport(f.config, targeted, [f.open(1)], { runId: "target" });
  expect(report.rows.map((row) => row.number)).toEqual([1]);
  expect(report.comparison.removed).toEqual([]);
  expect(report.comparison.not_compared).toContain(2);
  f.inventory.issues = [f.inventory.issues[0]];
  f.inventory.coverage[0].complete = false;
  const incomplete = buildReport(f.config, f.inventory, [f.open(1)], { runId: "incomplete" });
  expect(incomplete.comparison.removed).toEqual([]);
  expect(incomplete.comparison.not_compared).toContain(2);
});

test("malformed history is unavailable, not a first run, and evidence commands never execute", () => {
  const f = setup([1]); mkdirSync(join(f.root, f.config.report_dir), { recursive: true });
  f.write(`${f.config.report_dir}/broken.md`, "---\ntriage: [invalid\n---\n");
  const observation = f.resolved(1), marker = join(f.root, "not-executed");
  observation.evidence[1].command = `touch ${marker}`;
  observation.evidence[1].verified = false;
  const report = buildReport(f.config, f.inventory, [observation]);
  expect(report.comparison.status).toBe("unavailable");
  expect(existsSync(marker)).toBe(false);
  expect(report.rows[0].close_executable).toBe(false);
});

test("explicit missing history is unavailable and relative outputs use the selected checkout", () => {
  const f = setup([1]);
  f.settings({ schema_version: 1, report_dir: "reports/not-created" });
  const config = loadSettings(f.root), report = buildReport(config, f.inventory, [f.open(1)]);
  expect(report.comparison.status).toBe("unavailable");
  const path = saveReport(config, report, { output: "reports/explicit.md" });
  expect(path).toBe(join(f.root, "reports/explicit.md"));
  expect(existsSync(path)).toBe(true);
});

test("contradictory or repeated coverage cannot become complete and unresolved dependencies cannot close", () => {
  const f = setup([1]);
  f.inventory.coverage.push({ ...f.inventory.coverage[0], complete: false, error: "denied" });
  expect(buildReport(f.config, f.inventory, [f.resolved(1)]).rows[0].close_executable).toBe(false);
  f.inventory.coverage.pop();
  const report = buildReport(f.config, f.inventory, [{ ...f.resolved(1), depends_on: [999] }]);
  expect(report.rows[0].close_executable).toBe(false);
  expect(report.graph.unresolved).toContain(1);
});

test("next verifies its declared shortlist and report CLI saves exactly that offline input", () => {
  const f = setup(), inventory = { ...f.inventory, mode: "next" as const };
  const observations = [f.open(2)];
  const report = buildReport(f.config, inventory, observations);
  expect(report.rows.map((row) => row.number)).toEqual([2]);
  expect(report.counts.reviewed).toBe(1);
  expect(report.scope).toContain('"ids":[2]');
  f.write("inventory.json", JSON.stringify(inventory)); f.write("observations.json", JSON.stringify(observations));
  const cli = Bun.spawnSync(["bun", join(import.meta.dir, "../../../plugins/vh-adlc/scripts/triage/cli.ts"), "report", "--repo", f.root,
    "--inventory", join(f.root, "inventory.json"), "--observations", join(f.root, "observations.json"), "--report-output", "out/report.md"], { stdout: "pipe", stderr: "pipe" });
  expect({ exit: cli.exitCode, error: cli.stderr.toString() }).toEqual({ exit: 0, error: "" });
  const result = JSON.parse(cli.stdout.toString());
  expect(result.report.rows.map((row: { number: number }) => row.number)).toEqual([2]);
  expect(result.path).toBe(join(f.root, "out/report.md"));
});

test("the latest same-scope history is selected by run time rather than alphabetic run ID", async () => {
  const f = setup([1]);
  saveReport(f.config, buildReport(f.config, f.inventory, [f.open(1)], { runId: "z-first" }));
  await Bun.sleep(5);
  saveReport(f.config, buildReport(f.config, f.inventory, [f.open(1)], { runId: "a-second" }));
  expect(buildReport(f.config, f.inventory, [f.open(1)]).comparison.previous_run_id).toBe("a-second");
});

test("an explicitly requested report commit includes only its approved artifact and preserves unrelated staging",()=>{
  const f=setup([1]),report=buildReport(f.config,f.inventory,[f.open(1)]),path=saveReport(f.config,report);
  f.write("unrelated-staged.txt","Keep this staged work\n");git(f.root,"add","unrelated-staged.txt");
  const entry=git(f.root,"ls-files","--stage","--","unrelated-staged.txt"),relativePath=path.slice(f.root.length+1);
  // The fixture represents an explicit owner request for this shown subject/path.
  git(f.root,"add","--",relativePath);git(f.root,"commit","-m","docs: retain the requested triage report","--",relativePath);
  expect(git(f.root,"diff-tree","--no-commit-id","--name-only","-r","HEAD")).toBe(relativePath);
  expect(git(f.root,"show","-s","--format=%s","HEAD")).toBe("docs: retain the requested triage report");
  expect(git(f.root,"ls-files","--stage","--","unrelated-staged.txt")).toBe(entry);
  expect(git(f.root,"diff","--cached","--name-only")).toBe("unrelated-staged.txt");
});

test("mixed status history reads a measured legacy triage table with explicitly unknown scope", () => {
  const f = setup([50,68]);
  f.settings({schema_version:1,source_roots:["src"],report_dir:"status"});
  const config = loadSettings(f.root);
  f.write("status/README.md","# Historical status index\n");
  f.write("status/other-status.md","---\ndescription: Unrelated status snapshot\n---\n\n# Other work\n");
  f.write("status/2026-09-13-issue-triage.md","---\ndescription: Close-mode issue triage\nstatus: complete\n---\n\n# Issue triage - 2026-09-13 (close mode)\n\n## Verified fully landed\n\n### #50\n\nLegacy prose without a verified-state table.\n");
  f.write("status/2026-09-26-issue-triage.md",readFileSync(join(import.meta.dir,"fixtures/legacy/status/2026-09-26-issue-triage.md"),"utf8"));
  const report = buildReport(config,f.inventory,[f.resolved(50),f.open(68)]);
  expect(report.comparison.status).toBe("overlap-only");
  expect(report.comparison.previous_run_id).toContain("2026-09-26-issue-triage");
  expect(report.comparison.previous_scope).toContain("unknown");
  expect(report.comparison.changed).toContain(50); expect(report.comparison.changed).toContain(68);
  expect(report.comparison.added).toEqual([]); expect(report.comparison.removed).toEqual([]);
  expect(report.comparison.not_compared).toContain(63);
});

test("other-workstream ownership is visible and never gets an umbrella action exception", () => {
  const f = setup([1]);
  f.write("src/audit.ts", "// Finding AUD-1 and its remediation belong to the audit workflow.\n");
  git(f.root,"add","src/audit.ts");git(f.root,"commit","-qm","test: seed ownership ledger");
  f.inventory.source_commit=git(f.root,"rev-parse","HEAD");
  const observation={...f.resolved(1),owned_by:"codebase-audit",ownership_evidence:[{kind:"source",path:"src/audit.ts",line:1,detail:git(f.root,"show","HEAD:src/audit.ts"),verified:true}],is_index:true};
  const row=buildReport(f.config,f.inventory,[observation],{indexRequests:[1]}).rows[0];
  expect(row.ownership).toBe("protected");expect(row.owned_by).toBe("codebase-audit");
  expect(row.disposition).toBe("excluded");expect(row.close_executable).toBe(false);
});

test("repository workstream data excludes an omitted ownership field and cannot receive an index exception",()=>{
  const f=setup([1]);f.write("docs/owned.md","---\nissue: 1\n---\nSpecialist-owned scope\n");
  git(f.root,"add","docs/owned.md");git(f.root,"commit","-qm","test: seed independent ownership source");
  f.settings({schema_version:1,source_roots:["src"],workstreams:[{owner:"specialist",plan_roots:["docs"]}]});
  f.inventory.source_commit=git(f.root,"rev-parse","HEAD");
  const row=buildReport(loadSettings(f.root),f.inventory,[{...f.resolved(1),is_index:true}],{indexRequests:[1]}).rows[0];
  expect(row.owned_by).toBe("specialist");expect(row.disposition).toBe("excluded");expect(row.close_executable).toBe(false);
});

test("readiness ranking retains prerequisite, designed-plan and partial-scope tie-breaks", () => {
  const f = setup([1,2,3,4,5]);
  f.inventory.plan_metadata="available";
  for(const number of [2,3]) f.inventory.plans.push({path:`plans/${number}.md`,issue:number,issue_ref:String(number),status:"planned",status_description:"Designed remaining work",priority:null});
  const observations=[f.open(1),f.open(2),{...f.open(3),state:"partial",remaining:"Only the final wiring slice remains"},f.open(4),{...f.open(5),state:"blocked",depends_on:[4],blockers:[{issue:4,missing:true,evidence:[f.search()]}]}];
  const report=buildReport(f.config,f.inventory,observations);
  expect(report.ranked.map(row=>row.number)).toEqual([4,3,2,1]);
  expect(report.ranked.find(row=>row.number===2)!.reasons.join(" ")).toContain("plan");
  expect(report.ranked.find(row=>row.number===3)!.reasons.join(" ")).toContain("partial");
});
