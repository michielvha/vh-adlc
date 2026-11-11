import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRun, readRun, appendRun, publishJSON } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function project() { const f = fixture(); projects.push(f); return f; }
const scope = { repositories: ["example/project"] };

test("run state lives in private Git-common metadata and leaves all working/index bytes alone", () => {
  const f = project(), config = loadSettings(f.root);
  f.write("src/other.ts", "unrelated\n"); git(f.root, "add", "src/other.ts");
  f.write("notes.txt", "untracked\n");
  const before = git(f.root, "status", "--porcelain"), index = readFileSync(join(f.root, ".git/index"));
  const run = createRun(config, { scope });
  expect(run.run_dir.startsWith(join(f.root, ".git/vh-adlc/maintenance/runs/"))).toBe(true);
  expect(run.header.repository).toBe("example/project");
  expect(run.header.source_commit).toBe(git(f.root, "rev-parse", "HEAD"));
  expect(run.revision).toBe(0);
  expect(statSync(run.run_dir).mode & 0o777).toBe(0o700);
  expect(statSync(join(run.run_dir, "run.json")).mode & 0o777).toBe(0o600);
  expect(git(f.root, "status", "--porcelain")).toBe(before);
  expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
});

test("committed snapshots retain source/evidence pairs and pending intent in a fresh process", () => {
  const f = project(), config = loadSettings(f.root), run = createRun(config, { scope }), step = randomUUID();
  const next = appendRun(config, run.header.run_id, { revision: run.revision, digest: run.digest }, {
    ...run.state, report: { kind: "candidate", path: "reports/report.md", commit: run.header.source_commit },
    tasks: [{ source_target: "a".repeat(40), record_target: "b".repeat(40), evidence_ref: "chore/maintenance-evidence-test" }],
    operations: [{ step_id: step, kind: "report-commit", state: "intent", expected_base: run.header.source_commit }],
  }, "intent");
  const source = `import{writeSync}from"node:fs";import{loadSettings}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/maintenance/settings.ts"))};import{readRun}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/maintenance/journal.ts"))};writeSync(1,JSON.stringify(readRun(loadSettings(${JSON.stringify(f.root)}),${JSON.stringify(run.header.run_id)})));`;
  const result = Bun.spawnSync([process.execPath, "-e", source], { stdout: "pipe", stderr: "pipe" });
  expect({ exit: result.exitCode, error: result.stderr.toString() }).toEqual({ exit: 0, error: "" });
  const loaded = JSON.parse(result.stdout.toString());
  expect(loaded.revision).toBe(1);
  expect(loaded.digest).toBe(next.digest);
  expect(loaded.state.operations[0].step_id).toBe(step);
  expect(loaded.state.operations[0].state).toBe("intent");
  expect(loaded.state.tasks[0].record_target).toBe("b".repeat(40));
  expect(statSync(join(run.run_dir, "events/0000000001.json")).mode & 0o777).toBe(0o600);
});

test("stale revisions and reused IDs never overwrite an existing snapshot", () => {
  const f = project(), config = loadSettings(f.root), run = createRun(config, { scope });
  const next = appendRun(config, run.header.run_id, { revision: 0, digest: run.digest }, { ...run.state, phase: "selected" });
  const before = readFileSync(join(run.run_dir, "events/0000000001.json"));
  expect(() => appendRun(config, run.header.run_id, { revision: 0, digest: run.digest }, { ...run.state, phase: "blocked" })).toThrow("conflict");
  expect(() => createRun(config, { scope, run_id: run.header.run_id })).toThrow();
  expect(readFileSync(join(run.run_dir, "events/0000000001.json"))).toEqual(before);
  expect(readRun(config, run.header.run_id).digest).toBe(next.digest);
});

test("exclusive publication has one winner across two real processes", async () => {
  const f = project(), path = join(f.root, "race.json");
  const launch = (writer: string) => Bun.spawn([process.execPath, "-e",
    `import{publishJSON}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/maintenance/journal.ts"))};try{publishJSON(${JSON.stringify(path)},{writer:${JSON.stringify(writer)}});}catch{process.exitCode=9;}`],
    { stdout: "pipe", stderr: "pipe" });
  const first = launch("one"), second = launch("two");
  expect((await Promise.all([first.exited, second.exited])).sort()).toEqual([0, 9]);
  expect(["one", "two"]).toContain(JSON.parse(readFileSync(path, "utf8")).writer);
  expect(readdirSync(f.root).filter(name => name.startsWith(".tmp-"))).toEqual([]);
});

test("unpublished temporary bytes are ignored, but missing/corrupt committed events stop recovery", () => {
  const f = project(), config = loadSettings(f.root), run = createRun(config, { scope });
  writeFileSync(join(run.run_dir, `events/.tmp-${randomUUID()}`), "torn incomplete bytes", { mode: 0o600 });
  expect(readRun(config, run.header.run_id).revision).toBe(0);
  appendRun(config, run.header.run_id, { revision: 0, digest: run.digest }, run.state);
  const event = join(run.run_dir, "events/0000000001.json"), bytes = readFileSync(event);
  renameSync(event, join(run.run_dir, "events/0000000002.json"));
  expect(() => readRun(config, run.header.run_id)).toThrow();
  renameSync(join(run.run_dir, "events/0000000002.json"), event);
  writeFileSync(event, JSON.stringify({ ...JSON.parse(bytes.toString()), previous_digest: "0".repeat(64) }) + "\n");
  expect(() => readRun(config, run.header.run_id)).toThrow();
});

test("linked worktrees find the same persistent journal and source changes are visible", () => {
  const f = project(), config = loadSettings(f.root), run = createRun(config, { scope });
  const linked = join(mkdtempSync(join(tmpdir(), "vh-maintenance-linked-")), "checkout");
  try {
    git(f.root, "worktree", "add", "-q", "-b", "fixture-linked", linked);
    expect(readRun(loadSettings(linked), run.header.run_id).digest).toBe(run.digest);
    f.write("src/app.ts", "export const answer = 43;\n"); git(f.root, "add", "src/app.ts"); git(f.root, "commit", "-qm", "test: changed source");
    expect(readRun(config, run.header.run_id).source_changed).toBe(true);
    expect(readRun(loadSettings(linked), run.header.run_id).source_changed).toBe(false);
  } finally { if (existsSync(linked)) git(f.root, "worktree", "remove", linked); rmSync(join(linked, ".."), { recursive: true, force: true }); }
});

test("invalid run IDs and a symlink in the private state path fail without touching its target", () => {
  const f = project(), config = loadSettings(f.root), outside = mkdtempSync(join(tmpdir(), "vh-maintenance-outside-"));
  try {
    expect(() => readRun(config, "../other")).toThrow();
    symlinkSync(outside, join(f.root, ".git/vh-adlc"));
    expect(() => createRun(config, { scope })).toThrow();
    expect(readdirSync(outside)).toEqual([]);
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("immutable scope, finite JSON and source identities are validated before writing", () => {
  const f = project(), config = loadSettings(f.root), run = createRun(config, { scope });
  expect(() => createRun(config, { scope: { repositories: ["foreign/project"] } })).toThrow();
  expect(() => createRun(config, { scope, source_commit: "a".repeat(40) })).toThrow();
  expect(() => appendRun(config, run.header.run_id, { revision: 0, digest: run.digest }, { ...run.state, surprise: true } as never)).toThrow();
  expect(() => publishJSON(join(f.root, "invalid.json"), { value: NaN })).toThrow();
  expect(existsSync(join(f.root, "invalid.json"))).toBe(false);
  expect(readRun(config, run.header.run_id).revision).toBe(0);
});
