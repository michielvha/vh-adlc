import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendRun, createRun, digest, readRun } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { appendReport, evidenceReference, renderReport, reserveReport, saveReport } from "../../../plugins/vh-adlc/scripts/maintenance/report";
import { compareHistory, parseObservation, readHistory, validateObservation, type ObservationDocument } from "../../../plugins/vh-adlc/scripts/maintenance/history";
import type { Inventory } from "../../../plugins/vh-adlc/scripts/maintenance/collect";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function project() { const f = fixture(); projects.push(f); return f; }
const date = "2026-10-29T12:00:00.000Z";
function observation(id = randomUUID(), numbers = [1]): ObservationDocument {
  return { schema_version: 1, run_id: id, created_at: date, observations: [{ hostname: "github.com", repository: "example/project", surface: "dependabot",
    scope: { state: "open", filters: [], exclusions: [] }, observed_at: date, source_reference: "commit:" + "a".repeat(40), status: "complete", reason: null,
    count: numbers.length, alerts: numbers.map(number => ({ number, identity: `dependabot:${number}`, package: "example", manifest: "package.json", severity: "high" })) }] };
}
function block(value: unknown) { return "## Security alerts\n\n```maintenance-observation-v1\n" + JSON.stringify(value) + "\n```\n"; }
function inventory(source: string): Inventory {
  const empty = { status: "complete" as const, pages: 1, count: 0 };
  return { schema_version: 1, hostname: "github.com", repository: "example/project", source_commit: source, collected_at: date, requests: [], scope: { repositories: ["example/project"] }, discovery: [],
    repositories: [{ repository: "example/project", identity: { id: 1, default_branch: "main" }, pulls: [{ repository: "example/project", number: 17,
      title: "<script>oops</script> | another\n# forged", body: "", state: "open", draft: false, author: { login: "renovate", type: "Bot" }, author_class: "configured",
      head: "b".repeat(40), base: source, base_ref: "main", files: [], checks: [], statuses: [], evidence: empty }], dashboards: [],
      dependabot: { alerts: [], coverage: empty }, code_scanning: { alerts: null, coverage: { status: "complete-unavailable", pages: 0, count: null, reason: "Documented no-GHAS" } },
      coverage: { identity: { ...empty, count: 1 }, pulls: { ...empty, count: 1 }, dashboards: empty } }] };
}

test("same-day unpublished runs reserve distinct paths and resume the same reservation", () => {
  const f = project(), c = loadSettings(f.root), a = createRun(c, { at: date }), b = createRun(c, { at: date });
  const base = git(f.root, "rev-parse", "HEAD");
  const first = reserveReport(c, a.header.run_id, base), second = reserveReport(c, b.header.run_id, base);
  expect(first).toBe(`${c.report_dir}/2026-10-29-dependency-sweep.md`);
  expect(second).toBe(`${c.report_dir}/2026-10-29-dependency-sweep-${b.header.run_id}.md`);
  expect(reserveReport(c, a.header.run_id, base)).toBe(first);
  expect(git(f.root, "status", "--porcelain")).toBe("");
});

test("two fresh processes cannot both reserve the unsuffixed report name", async () => {
  const f = project(), c = loadSettings(f.root), runs = [createRun(c, { at: date }), createRun(c, { at: date })];
  const processes = runs.map(run => Bun.spawn([process.execPath, "-e", `import{writeSync}from'node:fs';import{loadSettings}from ${JSON.stringify(join(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/settings.ts"))};import{reserveReport}from ${JSON.stringify(join(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/report.ts"))};writeSync(1,reserveReport(loadSettings(${JSON.stringify(f.root)}),${JSON.stringify(run.header.run_id)},${JSON.stringify(run.header.source_commit)}));`], { stdout: "pipe", stderr: "pipe" }));
  expect(await Promise.all(processes.map(p => p.exited))).toEqual([0, 0]);
  const paths = await Promise.all(processes.map(p => new Response(p.stdout).text()));
  expect(new Set(paths).size).toBe(2);
  expect(paths.filter(path => path.endsWith("2026-10-29-dependency-sweep.md"))).toHaveLength(1);
});

test("existing report-role refs force a suffix without overwriting bytes", () => {
  const f = project(), c = loadSettings(f.root), path = `${c.report_dir}/2026-10-29-dependency-sweep.md`;
  f.write(path, "another run\n"); git(f.root, "add", path); git(f.root, "commit", "-qm", "docs: earlier report");
  const earlier = git(f.root, "rev-parse", "HEAD");
  git(f.root, "branch", "chore/maintenance-report-fixture", earlier);
  git(f.root, "switch", "-q", "--detach", "HEAD~1");
  const run = createRun(c, { at: date });
  expect(reserveReport(c, run.header.run_id, run.header.source_commit)).toContain(run.header.run_id);
  expect(git(f.root, "show", `${earlier}:${path}`)).toBe("another run");
});

test("a cross-host collision relocates only the unpublished path under the same run", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), old = reserveReport(c, run.header.run_id, run.header.source_commit);
  f.write(old, "different published run\n"); git(f.root, "add", old); git(f.root, "commit", "-qm", "docs: concurrent host report");
  const next = reserveReport(c, run.header.run_id, git(f.root, "rev-parse", "HEAD"));
  expect(next).toContain(run.header.run_id);
  expect(readFileSync(join(f.root, old), "utf8")).toBe("different published run\n");
  expect(readRun(c, run.header.run_id).state.report?.previous_paths).toEqual([old]);
});

test("published path collisions are handed off rather than relocated", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), path = reserveReport(c, run.header.run_id, run.header.source_commit);
  const current = readRun(c, run.header.run_id);
  appendRun(c, run.header.run_id, current, { ...current.state, report: { ...current.state.report!, published: true } });
  f.write(path, "other run\n"); git(f.root, "add", path); git(f.root, "commit", "-qm", "docs: conflicting report");
  expect(() => reserveReport(c, run.header.run_id, git(f.root, "rev-parse", "HEAD"))).toThrow("published");
});

test("rendering escapes tracker text and embeds portable observations with n/a counts", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  expect(text).not.toContain("<script>");
  expect(text).toContain("&lt;script&gt;oops&lt;/script&gt; &#124; another # forged");
  expect(text).toContain("n/a");
  const doc = parseObservation(text)!;
  expect(doc.run_id).toBe(run.header.run_id);
  expect(doc.observations[0].count).toBe(0);
  expect(doc.observations[1].count).toBeNull();
  expect(doc.observations[1].alerts).toBeNull();
});

test("saving and resuming reuses exact owned report bytes and preserves external edits", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  const saved = saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit });
  expect(readFileSync(saved.path, "utf8")).toBe(text);
  expect(saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit })).toEqual(saved);
  writeFileSync(saved.path, text + "someone else's edit\n");
  expect(() => saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit })).toThrow();
  expect(readFileSync(saved.path, "utf8")).toEndWith("someone else's edit\n");
});

test("read-only drafts use Git-private storage and preserve working-tree/index state", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  f.write("unrelated.txt", "keep"); git(f.root, "add", "unrelated.txt");
  const before = git(f.root, "status", "--porcelain"), index = readFileSync(join(f.root, ".git/index"));
  const saved = saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit, draft: true });
  expect(saved.path).toBe(join(run.run_dir, "drafts/report.md"));
  expect(git(f.root, "status", "--porcelain")).toBe(before);
  expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
});

test("append preserves metadata/body prefix and reconciles repeated steps without duplicating text", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit), { metadata: { author: "Example", covers: ["src/**"] } });
  const saved = saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit }), step = randomUUID();
  const update = { expected_digest: saved.digest, step_id: step, at: date, status: "complete", status_description: "Selected work verified", append: "Published outcome\n" };
  const next = appendReport(c, run.header.run_id, update), bytes = readFileSync(saved.path, "utf8");
  expect(bytes).toContain('author: "Example"'); expect(bytes).toContain('covers: ["src/**"]');
  expect(bytes.split("\n---\n")[1]).toStartWith(text.split("\n---\n")[1]);
  expect(bytes).toContain('status: "complete"');
  expect(appendReport(c, run.header.run_id, update).digest).toBe(next.digest);
  expect(bytes.match(/Published outcome/g)).toHaveLength(1);
  expect(() => appendReport(c, run.header.run_id, { ...update, step_id: randomUUID(), expected_digest: next.digest, author: "changed" } as never)).toThrow();
  writeFileSync(saved.path, bytes + "external edit\n");
  expect(() => appendReport(c, run.header.run_id, { ...update, expected_digest: next.digest, step_id: randomUUID() })).toThrow();
  expect(readFileSync(saved.path, "utf8")).toEndWith("external edit\n");
});

test("malformed, duplicate or contradictory observations never become complete", () => {
  const valid = observation(); expect(validateObservation(valid)).toEqual(valid);
  for (const change of [{ count: 2 }, { alerts: null }, { status: "complete-unavailable", count: 0 }, { status: "incomplete", count: 1 }, { scope: { state: "closed", filters: [], exclusions: [] } }]) {
    expect(() => validateObservation({ ...valid, observations: [{ ...valid.observations[0], ...change }] })).toThrow();
  }
  expect(() => validateObservation({ ...valid, observations: [valid.observations[0], valid.observations[0]] })).toThrow();
  expect(() => parseObservation(block(valid) + block(valid))).toThrow();
  expect(() => parseObservation(block({ malformed: true }))).toThrow();
  expect(parseObservation("legacy, no completeness marker")).toBeNull();
});

test("fresh checkouts compare published per-surface history without a run journal", () => {
  const f = project(), c = loadSettings(f.root), before = observation();
  f.write(`${c.history_dir}/prior.md`, block(before)); git(f.root, "add", c.history_dir); git(f.root, "commit", "-qm", "docs: prior observation");
  const reports = readHistory(c, git(f.root, "rev-parse", "HEAD"));
  expect(existsSync(join(f.root, ".git/vh-adlc"))).toBe(false);
  const current = observation(randomUUID(), [2]); current.created_at = "2026-10-30T12:00:00.000Z";
  const comparison = compareHistory(current, reports);
  expect(comparison.surfaces[0].appeared).toEqual(["dependabot:2"]);
  expect(comparison.surfaces[0].resolved).toEqual(["dependabot:1"]);
  expect(comparison.surfaces[0].baseline?.provenance).toBe("published");
  expect(comparison.surfaces[0].baseline?.commit).toBe(git(f.root, "rev-parse", "HEAD"));
});

test("incomplete, unavailable and differently scoped observations cannot prove resolution", () => {
  const before = observation(), reports = [{ path: "prior.md", provenance: "published" as const, commit: "b".repeat(40), digest: digest(block(before)), text: block(before) }];
  for (const change of [{ status: "incomplete", count: null, alerts: [], reason: "Denied" }, { status: "complete-unavailable", count: null, alerts: null, reason: "No GHAS" }, { scope: { state: "open", filters: ["severity:high"], exclusions: [] }, count: 0, alerts: [] }]) {
    const current = { ...observation(randomUUID(), []), created_at: "2026-10-30T00:00:00.000Z", observations: [{ ...before.observations[0], ...change }] };
    const comparison = compareHistory(current as ObservationDocument, reports);
    expect(comparison.surfaces[0].resolved).toBeNull(); expect(comparison.surfaces[0].appeared).toBeNull();
    expect(comparison.surfaces[0].availability_previous).toBe("complete");
  }
});

test("newest comparable complete history is used while local-only baselines remain labelled", () => {
  const good = observation(), bad = observation(); bad.created_at = "2026-10-30T00:00:00.000Z"; bad.observations[0] = { ...bad.observations[0], status: "incomplete", reason: "Denied", count: null, alerts: [] };
  const reports = [good, bad].map((v, i) => ({ path: `prior${i}.md`, provenance: "local" as const, digest: digest(block(v)), text: block(v) }));
  const current = observation(randomUUID(), []); current.created_at = "2026-10-31T00:00:00.000Z";
  const comparison = compareHistory(current, reports);
  expect(comparison.surfaces[0].resolved).toEqual(["dependabot:1"]);
  expect(comparison.surfaces[0].baseline?.provenance).toBe("local");
  expect(comparison.surfaces[0].baseline?.digest).toBe(reports[0].digest);
  expect(comparison.surfaces[0].availability_previous).toBe("incomplete");
});

test("legacy counts and identifiable entries remain visible as an unverified comparison", () => {
  const text = "## Security alerts\n\n| Repo | Dependabot (open) | Code scanning (open) |\n|---|---|---|\n| example/project | 3 | n/a |\n\n- CodeQL #19 high in package.json\n";
  const result = compareHistory(observation(), [{ path: "old.md", provenance: "published", commit: "b".repeat(40), digest: digest(text), text }]);
  expect(result.legacy[0].label).toBe("unverified legacy comparison");
  expect(result.legacy[0].rows[0].cells).toEqual(["example/project", "3", "n/a"]);
  expect(result.legacy[0].entries).toContain("- CodeQL #19 high in package.json");
  expect(result.legacy[0].counts[0]).toMatchObject({ repository: "example/project", surface: "dependabot", recorded_count: 3, current_count: 1, recorded_delta: -2 });
  expect(result.surfaces[0].resolved).toBeNull();
});

test("unpublished evidence references contain no Markdown links or host paths", () => {
  const ref = { run_id: randomUUID(), ref: "chore/maintenance-evidence-test", path: "reports/task.md", record_target: "b".repeat(40), source_target: "a".repeat(40) };
  const text = evidenceReference(ref);
  expect(text).toContain("unpublished"); expect(text).not.toContain("]("); expect(text).not.toContain("/home/");
  expect(() => evidenceReference({ ...ref, path: "/home/private/task.md" })).toThrow();
});

test("a fresh process reconciles an append written before its journal receipt", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  const saved = saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit });
  const update = { expected_digest: saved.digest, step_id: randomUUID(), at: date, append: "One observed outcome\n" };
  const completed = appendReport(c, run.header.run_id, update), before = readFileSync(saved.path);
  const receipt = readRun(c, run.header.run_id);
  appendRun(c, run.header.run_id, receipt, { ...receipt.state, report: { ...receipt.state.report!, digest: saved.digest, inode: saved.inode },
    operations: receipt.state.operations.map(op => op.step_id === update.step_id ? { ...op, state: "intent" } : op) }, "intent");
  const result = Bun.spawnSync([process.execPath, "-e", `import{writeSync}from'node:fs';import{loadSettings}from ${JSON.stringify(join(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/settings.ts"))};import{appendReport}from ${JSON.stringify(join(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/report.ts"))};writeSync(1,JSON.stringify(appendReport(loadSettings(${JSON.stringify(f.root)}),${JSON.stringify(run.header.run_id)},${JSON.stringify(update)})));`], { stdout: "pipe", stderr: "pipe" });
  expect({ exit: result.exitCode, error: result.stderr.toString() }).toEqual({ exit: 0, error: "" });
  expect(JSON.parse(result.stdout.toString()).digest).toBe(completed.digest);
  expect(readFileSync(saved.path)).toEqual(before);
  expect(readRun(c, run.header.run_id).state.operations[0].state).toBe("receipt");
  expect(() => appendReport(c, run.header.run_id, { ...update, append: "Different outcome" })).toThrow("conflict");
});

test("a persisted save intent can resume before file creation without inventing a second report", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  const relative = reserveReport(c, run.header.run_id, run.header.source_commit), current = readRun(c, run.header.run_id), path = join(f.root, relative);
  f.write(`${c.report_dir}/.keep`, "");
  appendRun(c, run.header.run_id, current, { ...current.state, report: { ...current.state.report!, path, kind: "checkout-draft", digest: digest(text), saved: false } }, "intent");
  expect(saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit }).path).toBe(path);
  expect(readFileSync(path, "utf8")).toBe(text);
  expect(readRun(c, run.header.run_id).state.report?.saved).toBe(true);
});

test("an unfinished append intent blocks a new step instead of concealing an uncertain write", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  const saved = saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit }), current = readRun(c, run.header.run_id);
  appendRun(c, run.header.run_id, current, { ...current.state, operations: [{ kind: "report-append", state: "intent", step_id: randomUUID(), payload: "a".repeat(64), after_digest: "b".repeat(64) }] });
  expect(() => appendReport(c, run.header.run_id, { expected_digest: saved.digest, at: date, append: "new outcome", step_id: randomUUID() })).toThrow("reconciliation");
  expect(readFileSync(saved.path, "utf8")).toBe(text);
});

test("an update cannot inject a second portable observation or replace the report identity", () => {
  const f = project(), c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  const saved = saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit });
  expect(() => appendReport(c, run.header.run_id, { expected_digest: saved.digest, at: date, append: block(observation()), step_id: randomUUID() })).toThrow();
  expect(readFileSync(saved.path, "utf8")).toBe(text);
});

test("ambiguous legacy leaf names remain recorded rows instead of becoming per-repository deltas", () => {
  const current = observation(); current.observations.push({ ...current.observations[0], repository: "other/project" });
  const text = "## Security alerts\n\n| Repo | Dependabot |\n|---|---|\n| project | 3 |\n";
  const result = compareHistory(current, [{ path: "old.md", provenance: "local", digest: digest(text), text }]);
  expect(result.legacy[0].rows).toHaveLength(1);
  expect(result.legacy[0].counts).toHaveLength(0);
});

test("a configured repository-root report directory keeps canonical paths and avoids Git metadata", () => {
  const f = project(); f.settings({ schema_version: 1, report_dir: "." });
  const c = loadSettings(f.root), run = createRun(c, { at: date }), text = renderReport(c, run, inventory(run.header.source_commit));
  const path = reserveReport(c, run.header.run_id, run.header.source_commit);
  expect(path).toBe("2026-10-29-dependency-sweep.md");
  saveReport(c, run.header.run_id, text, { default_commit: run.header.source_commit });
  git(f.root, "add", path); git(f.root, "commit", "-qm", "docs: report at root");
  const history = readHistory(c, git(f.root, "rev-parse", "HEAD"));
  expect(history.filter(report => report.path.endsWith(path))).toHaveLength(1);
  expect(history[0].provenance).toBe("published");
});

test("unpublished evidence accepts only complete SHA-1 or SHA-256 targets", () => {
  const value = { run_id: randomUUID(), ref: "chore/maintenance-evidence-test", path: "reports/task.md", record_target: "a".repeat(40) };
  expect(evidenceReference({ ...value, record_target: "b".repeat(64) })).toContain("unpublished");
  for (const length of [39, 41, 48, 63, 65]) {
    expect(() => evidenceReference({ ...value, record_target: "b".repeat(length) })).toThrow();
    expect(() => evidenceReference({ ...value, source_target: "c".repeat(length) })).toThrow();
  }
});
