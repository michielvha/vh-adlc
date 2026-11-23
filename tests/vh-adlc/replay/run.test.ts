// The replay harness of docs/specs/proportional-review.md (AC-10, AC-17), on a public fixture case with a
// scripted executor and matcher, so no model is called. The fixture case has one seeded defect, L-01.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

describe("retention", () => {
  test("a label the old brief raised twice and the new brief never raises fails after twelve runs", () => {
    const o = healthy();
    o.runs!["old/command"] = [{ records: RAISES }, { records: RAISES }, { records: OTHER }];
    o.runs!["new/command"] = [{ records: OTHER }];
    const f = fixture(o);
    expect(f.run().exitCode).toBe(0);
    const data = JSON.parse(/```replay-data\n([\s\S]*?)\n```/.exec(f.resultsText())![1]);
    expect(data.retention.command["L-01"]).toEqual({ old: 2, new: 0, runs: 12, verdict: "fail" });
    expect(data.retention.host["L-01"].verdict).toBe("pass");
    expect(f.calls().filter((c) => c.key === "new/command" && c.kind === "first-pass").length).toBe(12);
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
