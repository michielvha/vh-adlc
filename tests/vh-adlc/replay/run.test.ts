// The replay harness of docs/specs/proportional-review.md (AC-10, AC-17), on a public fixture case with a
// scripted executor and matcher, so no model is called. The fixture case has one seeded defect, L-01.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Each fixture run makes one throwaway clone with its own bare origin per first pass and loop (28 or more).
setDefaultTimeout(180_000);

const RUN = resolve(import.meta.dir, "run.ts");
const SCRIPTED = resolve(import.meta.dir, "scripted.ts");
const made: string[] = [];
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const TERM = "zebrafinch-ledger";

function git(root: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
}
function repo(files: Record<string, string>): { root: string; head: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-replay-repo-"))); made.push(root);
  git(root, "init", "-q");
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
  git(root, "add", "-A"); git(root, "commit", "-qm", "fixture");
  return { root, head: git(root, "rev-parse", "HEAD") };
}

const CASE_DOC = `---
status: draft
---

# Plan: Greeting

## Scope

The greeting command appends each name to names.log for the weekly tally report.

## Design

The command opens names.log and appends the name without any lock between writers.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
`;

const PUBLIC_DOC = (design: string, record: string) => `---
status: draft
---

# Plan: Public feature

## Design

${design}

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Design
EVIDENCE: ${record}
PROPOSAL: Fix it.
`;

const finding = (severity: string, evidence: string) => `FINDING: F-01\nKIND: judgement\nSEVERITY: ${severity}\nWHERE: Design\nEVIDENCE: ${evidence}\nPROPOSAL: Add a lock.`;
const RAISES = finding("should-fix", "L-01 concurrent appends to the log interleave");
const OTHER = finding("nit", "a wording slip in Scope");
const BELOW = finding("nit", "L-01 concurrent appends to the log interleave");

type Options = {
  approval?: "valid" | "missing" | "edit-label" | "edit-case";
  design?: string; record?: string; companionTerm?: boolean;
  runs?: Record<string, unknown[]>; loops?: Record<string, unknown>;
};

function fixture(o: Options = {}) {
  const caseRepo = repo({ "docs/specs/greeting.md": CASE_DOC, "AGENTS.md": "# Repository instructions\n" });
  const plugin = repo({
    "plugins/vh-adlc/knowledge.md": "Pass `1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff` as `--plugin-pin`.\n",
    "docs/specs/public.md": PUBLIC_DOC(o.design ?? "A plain design.", o.record ?? "A plain record."),
  });
  const oldPlugin = plugin.head;
  writeFileSync(join(plugin.root, "plugins/vh-adlc/NEW"), "new brief\n"); git(plugin.root, "add", "-A"); git(plugin.root, "commit", "-qm", "new");
  const newPlugin = git(plugin.root, "rev-parse", "HEAD");
  const docs = repo({ "conventions/feature-documents.md": "# Feature documents\n" });
  const base = docs.head;
  writeFileSync(join(docs.root, "conventions/feature-documents.md"), `# Feature documents\n\nSeverity by consequence.${o.companionTerm ? ` ${TERM}` : ""}\n`);
  git(docs.root, "commit", "-qam", "companion");
  const head = git(docs.root, "rev-parse", "HEAD");

  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-replay-case-"))); made.push(dir);
  const caseYaml = `schema_version: 1\ncase: fixture\nclone: ${caseRepo.root}\ncommit: ${caseRepo.head}\ndocument: docs/specs/greeting.md\nprofile: |\n  A hosted service that runs the command for many tenants at once.\nterms:\n  - ${TERM}\n`;
  const labels = "# Labels: fixture\n\n## L-01: Concurrent appends to names.log interleave\n- Original finding: R-1 F-01\n- Minimum severity: should-fix\n- Match: names the missing lock on names.log appends\n- Matches: appends interleave without a lock\n- Does not match: names.log is not rotated\n";
  writeFileSync(join(dir, "case.yaml"), caseYaml);
  let labelsText = labels;
  if (o.approval !== "missing") labelsText += `\nApproved: owner tester, 2026-11-22T00:00:00Z, labels.md above this line sha256 ${sha(labels)}, case.yaml sha256 ${sha(caseYaml)}\n`;
  if (o.approval === "edit-label") labelsText = labelsText.replace("Minimum severity: should-fix", "Minimum severity: nit");
  if (o.approval === "edit-case") writeFileSync(join(dir, "case.yaml"), caseYaml.replace("many tenants", "one tenant"));
  writeFileSync(join(dir, "labels.md"), labelsText);

  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const script = join(dir, "script.json");
  writeFileSync(script, JSON.stringify({ log, runs: o.runs ?? {}, loops: o.loops ?? {} }));
  const routes = join(dir, "routes.json");
  writeFileSync(routes, JSON.stringify({ command: { model: "gpt-test", argv: ["codex", "exec", "--json", "{prompt}"] }, host: { model: "claude-test" } }));
  const results = join(dir, "results.md");

  const run = () => Bun.spawnSync([process.execPath, RUN, "run", "--case", dir, "--tree", plugin.root, "--old-plugin", oldPlugin, "--new-plugin", newPlugin,
    "--docs", docs.root, "--companion-base", base, "--companion-head", head, "--routes", routes, "--results", results, "--executor", SCRIPTED],
  { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: script } });
  const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const resultsText = () => readFileSync(results, "utf8");
  return { dir, run, calls, resultsText, oldPlugin, newPlugin, base, head, caseRepo: caseRepo.root, tree: plugin.root, docs: docs.root, routes, results, script };
}

const loopDoc = (extra: string, deferred = "") => CASE_DOC.replace("## Review Log", `${extra}${deferred ? `## Deferred\n\n${deferred}\n\n` : ""}## Review Log`);
const healthy = (): Options => ({
  runs: { "old/command": [{ records: RAISES }], "old/host": [{ records: RAISES }], "new/command": [{ records: RAISES }], "new/host": [{ records: RAISES }] },
  loops: Object.fromEntries(["old/command", "old/host", "new/command", "new/host"].map((key) => [key, { docs: [loopDoc(""), loopDoc("## Extra\n\nOne more line.\n\n")], questions: 1 }])),
});

describe("a healthy fixture case", () => {
  test("runs end to end and writes counts and identities only", () => {
    const f = fixture(healthy());
    const r = f.run();
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const text = f.resultsText();
    expect(text).toContain("L-01");
    expect(text).toContain(f.oldPlugin.slice(0, 12));
    expect(text).toContain(f.newPlugin.slice(0, 12));
    expect(text).toContain(f.base.slice(0, 12));
    expect(text).toContain(f.head.slice(0, 12));
    expect(text).toContain("gpt-test");
    expect(text).toContain("claude-test");
    expect(text).toContain("Terms check: pass");
    // Every prose line of the case document; table syntax and headings are shared with any Markdown.
    const prose = CASE_DOC.split("\n").filter((l) => /^[A-Za-z]/.test(l) && l.length > 20);
    expect(prose.length).toBeGreaterThan(1);
    for (const line of prose) expect(text).not.toContain(line);
    expect(text).not.toContain(TERM);
    expect(f.calls().filter((c) => c.kind === "first-pass" && c.key === "old/command").length).toBe(3);
    expect(f.calls().filter((c) => c.kind === "first-pass" && c.key === "new/command").length).toBe(6);
  });

  test("the totals table carries the spec review, growth and label conditions and no question condition", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const totals = f.resultsText().split("## Totals")[1];
    expect(totals).toContain("| Spec reviews |");
    expect(totals).toContain("| Body growth");
    expect(totals).toContain("| Failing labels |");
    expect(totals).not.toContain("Open Questions");
    expect(f.resultsText()).not.toContain("Open Questions");
  });

  test("records body size per pass without the Deferred section", () => {
    const o = healthy();
    o.loops!["new/host"] = { docs: [loopDoc(""), loopDoc("", "- D-01: A deferred item. From: author cut. Verdict: pending.\n- D-02: Another. From: author cut. Verdict: pending.")], questions: 0 };
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    const base = CASE_DOC.split("## Review Log")[0].split("\n").length - 1;
    expect(data.loops["new/host"].bodySizes).toEqual([base, base]);
    expect(data.loops["new/host"].growth).toBe(0);
    expect(data.loops["old/host"].growth).toBe(4);
  });
});

describe("X'", () => {
  test("holds the profile, the brief's pin and the route under test, on main, with a throwaway origin", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const calls = f.calls().filter((c) => c.kind === "first-pass");
    for (const c of calls) {
      expect(c.origin).not.toBe(f.caseRepo);
      expect(c.origin.endsWith("origin.git")).toBe(true);
      expect(c.branch).toBe("main");
      expect(c.head).toBe(c.commit);
      expect(c.agents).toContain("## Product profile");
      expect(c.agents).toContain("many tenants");
      expect(c.agents).toContain(`vhco-pro/docs/blob/${c.docs}/AGENTS.md`);
    }
    expect(calls.find((c) => c.key === "old/command").loop).toContain("route: command");
    expect(calls.find((c) => c.key === "old/command").loop).toContain("gpt-test");
    expect(calls.find((c) => c.key === "old/host").loop).toContain("route: host");
    expect(git(f.caseRepo, "branch", "--list")).not.toContain("replay");
    expect(git(f.caseRepo, "log", "--oneline", "-1")).toContain("fixture");
  });
});

describe("routes run separately", () => {
  test("a run of one route keeps the other route's results for the same briefs", () => {
    const f = fixture(healthy());
    const run = (route: string) => Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin,
      "--docs", f.docs, "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--routes-under-test", route],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    expect(run("command").exitCode).toBe(0);
    expect(run("host").exitCode).toBe(0);
    // A loops-only rerun of one route keeps that route's first passes.
    expect(Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--routes-under-test", "host", "--only", "loops"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } }).exitCode).toBe(0);
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    expect(Object.keys(data.retention).sort()).toEqual(["command", "host"]);
    expect(Object.keys(data.firstPasses).sort()).toEqual(["new/command", "new/host", "old/command", "old/host"]);
    expect(Object.keys(data.loops).sort()).toEqual(["new/command", "new/host", "old/command", "old/host"]);
  });
});

describe("runs that do not count", () => {
  test("a failed execution is recorded, rerun and not counted", () => {
    const o = healthy();
    o.runs!["old/command"] = [{ fail: "reviewer crashed" }, { records: RAISES }];
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    expect(data.firstPasses["old/command"].counted).toBe(3);
    expect(data.firstPasses["old/command"].failed).toBe(1);
    expect(f.calls().filter((c) => c.key === "old/command" && c.kind === "first-pass").length).toBe(4);
  });

  test("a run reporting another route or model is not counted", () => {
    const o = healthy();
    o.runs!["new/host"] = [{ records: RAISES, model: "claude-other" }, { records: RAISES, route: "command" }, { records: RAISES }];
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    expect(data.firstPasses["new/host"].counted).toBe(6);
    expect(data.firstPasses["new/host"].excluded).toBe(2);
  });
});

describe("loops that fail", () => {
  test("a loop that fails once is recorded, rerun and counted", () => {
    const o = healthy();
    o.loops!["new/command"] = [{ fail: "session error" }, { docs: [loopDoc(""), loopDoc("")], questions: 0 }];
    const f = fixture(o);
    const r = f.run();
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    expect(data.loops["new/command"]).toMatchObject({ executed: true, failed: 1, reviews: 1 });
    expect(f.calls().filter((c) => c.kind === "loop" && c.key === "new/command").length).toBe(2);
  });

  test("a loop that keeps failing stops the run after writing every first pass", () => {
    const o = healthy();
    o.loops!["new/command"] = { fail: "session error" };
    const f = fixture(o);
    const r = f.run();
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.toString()).toContain("--only loops");
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    expect(data.firstPasses["new/command"].counted).toBe(6);
    expect(data.loops["new/command"]).toMatchObject({ executed: false, failed: 3 });
    expect(data.firstPasses["old/host"]).toBeUndefined();
  });
});

describe("stored runs", () => {
  const data = (text: string) => JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(text)![1]);

  test("assemble rebuilds the run's counts from the stored runs alone", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const ran = data(f.resultsText());
    const assembled = join(f.dir, "assembled.md");
    const r = Bun.spawnSync([process.execPath, RUN, "assemble", "--case", f.dir, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--old-docs", f.base, "--new-docs", f.head,
      "--routes", f.routes, "--results", assembled], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const built = data(readFileSync(assembled, "utf8"));
    for (const key of Object.keys(ran.firstPasses)) expect([key, built.firstPasses[key].counted]).toEqual([key, ran.firstPasses[key].counted]);
    expect(built.retention).toEqual(ran.retention);
    for (const key of Object.keys(ran.loops)) expect([key, built.loops[key].reviews, built.loops[key].growth]).toEqual([key, ran.loops[key].reviews, ran.loops[key].growth]);
  });

  test("a rerun of the new brief compares against the stored old passes without running them", () => {
    const o = healthy();
    o.runs!["old/command"] = [{ records: RAISES }, { records: RAISES }, { records: OTHER }];
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    writeFileSync(join(f.dir, "calls.log"), "");
    const r = Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--briefs", "new"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(f.calls().filter((c) => c.key.startsWith("old/")).length).toBe(0);
    // The new-brief passes stored under the same identity are continued, so none runs again.
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(0);
    const after = data(f.resultsText());
    expect(after.retention.command["L-01"]).toMatchObject({ oldMin: 2, verdict: "pass" });
    expect(after.loops["old/command"].reviews).toBe(1);
  });
});

describe("stored brief identity", () => {
  const newOnly = (f: ReturnType<typeof fixture>) => Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin,
    "--docs", f.docs, "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--briefs", "new"],
  { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });

  test("a new-brief-only run refuses a stored old-brief set from another brief", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const path = join(f.dir, "runs", "old-command-pass.identity.json");
    writeFileSync(path, readFileSync(path, "utf8").replace(f.oldPlugin, f.newPlugin));
    writeFileSync(join(f.dir, "calls.log"), "");
    const r = newOnly(f);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.toString()).toContain("from another brief");
  });

  test("a run under another identity moves the earlier stored set aside", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const r = Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.oldPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--briefs", "new"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const sets = readdirSync(join(f.dir, "runs-superseded"));
    expect(readdirSync(join(f.dir, "runs-superseded", sets.find((d) => d.endsWith("-new-host"))!)).filter((n) => n.endsWith(".txt")).length).toBe(6);
    expect(sets.some((d) => d.includes("-old-"))).toBe(false);
  });

  test("a run under the same identity continues a stored set and runs only the missing passes", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    for (const n of [5, 6]) for (const ext of [".txt", ".verdicts.json"]) rmSync(join(f.dir, "runs", `new-command-pass-${n}${ext}`));
    writeFileSync(join(f.dir, "calls.log"), "");
    const r = Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--briefs", "new", "--only", "first-passes", "--routes-under-test", "command"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(2);
  });

  test("a failed loop keeps its clone and the next attempt resumes it", () => {
    const o = healthy();
    o.loops!["new/command"] = [{ fail: "session error" }, { docs: [loopDoc(""), loopDoc("")], questions: 0 }];
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    const loops = f.calls().filter((c) => c.kind === "loop" && c.key === "new/command");
    expect(loops.length).toBe(2);
    expect(loops[1].clone).toBe(loops[0].clone);
    expect(loops[0].clone).toContain(join(f.dir, "loop-clones"));
    expect(readdirSync(join(f.dir, "loop-clones"))).not.toContain("new-command");
  });

  test("a resumed loop clone takes changed route settings in a new commit and keeps unchanged ones", () => {
    const o = healthy();
    o.loops!["new/command"] = [{ fail: "session error" }, { fail: "session error" }, { fail: "session error" }];
    const f = fixture(o);
    expect(f.run().exitCode).not.toBe(0);
    const first = f.calls().filter((c) => c.kind === "loop" && c.key === "new/command");
    expect(first.length).toBe(3);
    expect(new Set(first.map((c) => c.head)).size).toBe(1);
    const script = JSON.parse(readFileSync(f.script, "utf8"));
    script.loops["new/command"] = { docs: [loopDoc(""), loopDoc("")], questions: 0 };
    writeFileSync(f.script, JSON.stringify(script));
    writeFileSync(f.routes, JSON.stringify({ command: { model: "gpt-test", argv: ["sh", "-c", 'f=$1; shift; exec "$@" - < "$f"', "sh", "{prompt_file}", "codex", "exec", "--json"] }, host: { model: "claude-test" } }));
    const r = Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--briefs", "new", "--only", "loops", "--routes-under-test", "command"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const resumed = f.calls().filter((c) => c.kind === "loop" && c.key === "new/command").at(-1);
    expect(resumed.clone).toBe(first[0].clone);
    expect(resumed.loop).toContain("{prompt_file}");
    expect(resumed.loop).not.toContain("{prompt}");
    expect(resumed.head).not.toBe(first[0].head);
    expect(resumed.origin).toBe(first[0].origin);
  });

  test("a loop that lost its documents counts a recorded lower bound and is left out of growth", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    for (const n of readdirSync(join(f.dir, "runs")).filter((n) => n.startsWith("old-command-loop-"))) rmSync(join(f.dir, "runs", n));
    writeFileSync(join(f.dir, "runs", "old-command-loop.bound.json"), JSON.stringify({ reviews_at_least: 30, clean: false }));
    const assembled = join(f.dir, "assembled.md");
    const r = Bun.spawnSync([process.execPath, RUN, "assemble", "--case", f.dir, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--old-docs", f.base, "--new-docs", f.head,
      "--routes", f.routes, "--results", assembled], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const text = readFileSync(assembled, "utf8");
    expect(text).toContain("| Spec reviews | at least 31 |");
    expect(text).toContain("| Body growth (1 pairs with stored old documents)");
  });

  test("a pre-T25 set counts through a matching launch record and is refused through a mismatched or incomplete one", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const runs = join(f.dir, "runs");
    rmSync(join(runs, "old-command-pass.identity.json"));
    const files = readdirSync(runs).filter((n) => n.startsWith("old-command-pass-"));
    const record = (plugin: string, listed: string[]) => writeFileSync(join(runs, "launch-record.json"), JSON.stringify({ launches: [{ brief: "old", route: "command", part: "pass", plugin, docs: f.base, model: "gpt-test", command: "run.ts run ...", files: listed }] }));
    const assemble = () => Bun.spawnSync([process.execPath, RUN, "assemble", "--case", f.dir, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--old-docs", f.base, "--new-docs", f.head,
      "--routes", f.routes, "--results", join(f.dir, "assembled.md")], { stdout: "pipe", stderr: "pipe" });
    record(f.oldPlugin, files);
    expect(assemble().exitCode).toBe(0);
    record(f.newPlugin, files);
    expect(assemble().stderr.toString()).toContain("launch record");
    record(f.oldPlugin, files.filter((n) => n !== "old-command-pass-3.txt"));
    const r = assemble();
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.toString()).toContain("not in the launch record");
  });

  test("pre-T25 first passes followed by a post-T25 loops-only run keep each part's own identity", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const runs = join(f.dir, "runs");
    rmSync(join(runs, "old-command-pass.identity.json"));
    writeFileSync(join(runs, "launch-record.json"), JSON.stringify({ launches: [{ brief: "old", route: "command", part: "pass", plugin: f.oldPlugin, docs: f.base, model: "gpt-test", command: "run.ts run ...",
      files: readdirSync(runs).filter((n) => n.startsWith("old-command-pass-")) }] }));
    const loops = Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--only", "loops"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    expect(loops.exitCode, loops.stderr.toString()).toBe(0);
    expect(readdirSync(runs)).toContain("old-command-loop.identity.json");
    expect(readdirSync(runs)).not.toContain("old-command-pass.identity.json");
    const r = Bun.spawnSync([process.execPath, RUN, "assemble", "--case", f.dir, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--old-docs", f.base, "--new-docs", f.head,
      "--routes", f.routes, "--results", join(f.dir, "assembled.md")], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
  });

  test("a loops-only rerun keeps the stored first passes", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const r = Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--only", "loops"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(readdirSync(join(f.dir, "runs")).filter((n) => n.startsWith("new-command-pass-") && n.endsWith(".txt")).length).toBe(6);
  });

  const assembleTo = (f: ReturnType<typeof fixture>, out: string) => Bun.spawnSync([process.execPath, RUN, "assemble", "--case", f.dir, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin,
    "--old-docs", f.base, "--new-docs", f.head, "--routes", f.routes, "--results", out], { stdout: "pipe", stderr: "pipe" });
  const newOnlyRun = (f: ReturnType<typeof fixture>, ...extra: string[]) => Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin,
    "--new-plugin", f.newPlugin, "--docs", f.docs, "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--briefs", "new", ...extra],
  { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });

  test("a pre-T25 lost loop set with a launch-record entry and a bound counts its bound and stays finished", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const runs = join(f.dir, "runs");
    for (const n of readdirSync(runs).filter((n) => n.startsWith("old-command-loop"))) rmSync(join(runs, n));
    writeFileSync(join(runs, "launch-record.json"), JSON.stringify({ launches: [{ brief: "old", route: "command", part: "loop", plugin: f.oldPlugin, docs: f.base, model: "gpt-test", command: "run.ts run ...", files: [] }] }));
    writeFileSync(join(runs, "old-command-loop.bound.json"), JSON.stringify({ reviews_at_least: 40, clean: false }));
    writeFileSync(join(f.dir, "calls.log"), "");
    expect(newOnlyRun(f).exitCode).toBe(0);
    expect(f.calls().filter((c) => c.key.startsWith("old/")).length).toBe(0);
    expect(existsSync(join(runs, "old-command-loop.bound.json"))).toBe(true);
    const r = assembleTo(f, join(f.dir, "a.md"));
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(readFileSync(join(f.dir, "a.md"), "utf8")).toContain("at least 40, not clean");
  });

  test("a fresh set moves its kept loop clone aside", () => {
    const o = healthy();
    o.loops!["new/command"] = { fail: "session error" };
    const f = fixture(o);
    expect(f.run().exitCode).not.toBe(0);
    expect(readdirSync(join(f.dir, "loop-clones"))).toContain("new-command");
    // The loop part under another new brief starts a fresh set, which takes the kept clone with it.
    Bun.spawnSync([process.execPath, RUN, "run", "--case", f.dir, "--tree", f.tree, "--old-plugin", f.oldPlugin, "--new-plugin", f.oldPlugin, "--docs", f.docs,
      "--companion-base", f.base, "--companion-head", f.head, "--routes", f.routes, "--results", f.results, "--executor", SCRIPTED, "--briefs", "new", "--routes-under-test", "command", "--only", "loops"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, REPLAY_SCRIPT: f.script } });
    const aside = readdirSync(join(f.dir, "runs-superseded"));
    expect(aside.some((d) => d.endsWith("-new-command") && readdirSync(join(f.dir, "runs-superseded", d)).includes("loop-clone"))).toBe(true);
  });

  test("a pre-T25 set holding an unlisted run file starts a fresh set", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const runs = join(f.dir, "runs");
    rmSync(join(runs, "new-command-pass.identity.json"));
    writeFileSync(join(runs, "launch-record.json"), JSON.stringify({ launches: [{ brief: "new", route: "command", part: "pass", plugin: f.newPlugin, docs: f.head, model: "gpt-test", command: "run.ts run ...",
      files: readdirSync(runs).filter((n) => n.startsWith("new-command-pass-") && !n.startsWith("new-command-pass-6")) }] }));
    writeFileSync(join(f.dir, "calls.log"), "");
    expect(newOnlyRun(f, "--routes-under-test", "command", "--only", "first-passes").exitCode).toBe(0);
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(6);
    expect(readdirSync(join(f.dir, "runs-superseded")).some((d) => d.endsWith("-new-command"))).toBe(true);
  });

  test("an old loop that stored documents but never reached a clean pass stays out of growth", () => {
    const f = fixture(healthy());
    expect(f.run().exitCode).toBe(0);
    const runs = join(f.dir, "runs");
    for (let i = 2; i <= 61; i++) writeFileSync(join(runs, `old-command-loop-${i}.md`), loopDoc("## Extra\n\nMore.\n\n"));
    const r = assembleTo(f, join(f.dir, "a.md"));
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const text = readFileSync(join(f.dir, "a.md"), "utf8");
    expect(text).toContain("60 (cap)");
    expect(text).toContain("| Body growth (1 pairs with stored old documents)");
  });

  test("assembly after an interrupted first-pass set keeps its finished passes", () => {
    const o = healthy();
    o.runs!["old/command"] = [{ records: RAISES }, { records: RAISES }, { fail: "crash" }];
    const f = fixture(o);
    expect(f.run().exitCode).not.toBe(0);
    const assembled = join(f.dir, "assembled.md");
    const r = Bun.spawnSync([process.execPath, RUN, "assemble", "--case", f.dir, "--old-plugin", f.oldPlugin, "--new-plugin", f.newPlugin, "--old-docs", f.base, "--new-docs", f.head,
      "--routes", f.routes, "--results", assembled], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const built = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(readFileSync(assembled, "utf8"))![1]);
    expect(built.firstPasses["old/command"].counted).toBe(2);
    expect(built.firstPasses["old/command"].failed).toBeGreaterThan(0);
  });
});

describe("retention", () => {
  test("a label the old brief raised twice and the new brief never raises fails after twelve runs", () => {
    const o = healthy();
    o.runs!["old/command"] = [{ records: RAISES }, { records: RAISES }, { records: OTHER }];
    o.runs!["new/command"] = [{ records: OTHER }];
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    expect(data.retention.command["L-01"]).toEqual({ oldMin: 2, oldAny: 2, newMin: 0, newAny: 0, runs: 12, verdict: "fail" });
    expect(data.retention.host["L-01"].verdict).toBe("pass");
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(12);
  });

  const retentionOf = (old: string[], fresh: string[]) => {
    const o = healthy();
    o.runs!["old/command"] = old.map((records) => ({ records }));
    o.runs!["new/command"] = fresh.map((records) => ({ records }));
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    return { f, r: JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]).retention.command["L-01"] };
  };

  test("a label the old brief raised at its minimum fails after twelve new passes that raise it only below", () => {
    const { f, r } = retentionOf([RAISES, RAISES, OTHER], [BELOW]);
    expect(r).toEqual({ oldMin: 2, oldAny: 2, newMin: 0, newAny: 12, runs: 12, verdict: "fail" });
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(12);
  });

  test("a label the old brief raised only below its minimum passes when a new pass raises it at any severity", () => {
    const { f, r } = retentionOf([BELOW, BELOW, OTHER], [OTHER, BELOW, OTHER]);
    expect(r).toEqual({ oldMin: 0, oldAny: 2, newMin: 0, newAny: 1, runs: 6, verdict: "pass" });
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(6);
  });

  test("a label the old brief raised only below its minimum fails after twelve new passes that never raise it", () => {
    const { f, r } = retentionOf([BELOW, BELOW, OTHER], [OTHER]);
    expect(r).toEqual({ oldMin: 0, oldAny: 2, newMin: 0, newAny: 0, runs: 12, verdict: "fail" });
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(12);
  });

  test("a label one old pass raises at its minimum and one below fails after twelve new passes that never raise it", () => {
    const { f, r } = retentionOf([RAISES, BELOW, OTHER], [OTHER]);
    expect(r).toEqual({ oldMin: 1, oldAny: 2, newMin: 0, newAny: 0, runs: 12, verdict: "fail" });
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(12);
  });

  test("the results table shows the four counts per label", () => {
    const { f } = retentionOf([BELOW, BELOW, OTHER], [OTHER, BELOW, OTHER]);
    expect(f.resultsText()).toContain("| Route | Label | Old at its minimum | Old at any severity | New at its minimum | New at any severity | New runs | Verdict |");
    expect(f.resultsText()).toContain("| command | L-01 | 0/3 | 2/3 | 0/6 | 1/6 | 6 | pass |");
  });
});

describe("case approval", () => {
  for (const approval of ["missing", "edit-label", "edit-case"] as const) {
    test(`refuses a case with ${approval} before any run`, () => {
      const f = fixture({ ...healthy(), approval });
      const r = f.run();
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr.toString()).toContain("approval");
      expect(f.calls()).toEqual([]);
    });
  }
});

describe("terms check", () => {
  test("a term in a Design section stops the run before any run", () => {
    const f = fixture({ ...healthy(), design: `The ${TERM} goes here.` });
    const r = f.run();
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.toString()).toContain("terms check");
    expect(r.stderr.toString()).not.toContain(TERM);
    expect(f.calls()).toEqual([]);
  });

  test("a term in the companion diff stops the run", () => {
    const f = fixture({ ...healthy(), companionTerm: true });
    expect(f.run().exitCode).not.toBe(0);
    expect(f.calls()).toEqual([]);
  });

  test("a term inside a stored review record passes", () => {
    const f = fixture({ ...healthy(), record: `The record names ${TERM} with a count.` });
    const r = f.run();
    expect(r.exitCode, r.stderr.toString()).toBe(0);
  });

  test("the terms subcommand checks a document and the results file", () => {
    const f = fixture(healthy());
    const doc = join(f.dir, "doc.md"), clean = join(f.dir, "clean.md");
    writeFileSync(doc, PUBLIC_DOC(`It mentions ${TERM}.`, "plain"));
    writeFileSync(clean, PUBLIC_DOC("plain", `It mentions ${TERM}.`));
    const terms = (...files: string[]) => Bun.spawnSync([process.execPath, RUN, "terms", "--case", f.dir, ...files.flatMap((file) => ["--file", file])], { stdout: "pipe", stderr: "pipe" });
    expect(terms(doc).exitCode).not.toBe(0);
    expect(terms(clean).exitCode).toBe(0);
  });
});
