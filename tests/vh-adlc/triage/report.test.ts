import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { buildReport, saveReport } from "../../../plugins/vh-adlc/scripts/triage/report";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/triage/settings";
import type { Inventory, Issue } from "../../../plugins/vh-adlc/scripts/triage/types";
import { fixture, git } from "./fixtures";

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
  function pass() {
    const source = git(f.root, "show", "HEAD:src/app.ts");
    const result = Bun.spawnSync(["bun", "-e", 'import {answer} from "./src/app.ts"; if(answer !== 42) process.exit(1);'], { cwd: f.root, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(0);
    return [
      { kind: "source", path: "src/app.ts", line: 1, detail: source, verified: true },
      { kind: "test", command: 'bun -e import-and-check-answer', exit_code: result.exitCode, detail: "Observed exported behavior", verified: true },
    ];
  }
  const resolved = (number: number) => ({ number, state: "resolved", remaining: "", evidence: pass(), adversarial: pass() });
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

test("complete plans and merged Refs-only PRs are leads rather than closure evidence", () => {
  const f = setup([1]);
  f.inventory.plans.push({ path: "plans/a.md", issue: 1, issue_ref: "1", status: "complete", status_description: null, priority: "high" });
  f.inventory.pulls.push({ number: 50, title: "Partial work", body: "Refs #1", merged_at: "2026-10-01T00:00:00Z" });
  const report = buildReport(f.config, f.inventory, [{ number: 1, state: "resolved", evidence: [{ kind: "merged-pr", pull_number: 50, detail: "Refs #1", verified: true }], adversarial: [] }]);
  expect(report.rows[0].state).toBe("unverified");
  expect(report.rows[0].close_executable).toBe(false);
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
  const duplicate = { number: 1, state: "duplicate", duplicate_of: 2, total_overlap: true, remaining: "Canonical issue 2 remains open", evidence: [overlap], adversarial: [overlap] };
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
  const obsolete = buildReport(f.config, f.inventory, [{ number: 1, state: "obsolete", evidence: [removal], adversarial: [removal] }, f.open(2)]);
  expect(obsolete.rows[0].close_executable).toBe(true);
  expect(obsolete.rows[0].closure_reason).toBe("not_planned");
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
  const unblocked = { ...blocked, blockers: [{ issue: 2, missing: false, evidence: f.resolved(1).evidence }] };
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
