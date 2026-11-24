#!/usr/bin/env bun
// The replay harness of docs/specs/proportional-review.md (Design, Replay harness). It replays one real
// feature document at the commit X of its first spec review under two briefs, old and new, on the Codex
// command route and the Claude host route, and writes only counts and run identities to the public
// results file. Everything else (records, matcher verdicts, documents) stays in the private case directory.
//
//   bun tests/vh-adlc/replay/run.ts run --case <dir> --tree <vh-adlc checkout> --old-plugin <commit> --new-plugin <commit>
//       --docs <vhco-pro/docs checkout> --companion-base <sha> --companion-head <sha> --routes <json>
//       [--results <file>] [--executor <module>] [--only first-passes|loops] [--routes-under-test command,host]
//   bun tests/vh-adlc/replay/run.ts terms --case <dir> [--tree <checkout>] [--docs <checkout> --companion-base <sha> --companion-head <sha>] [--file <path>]...
//
// The executor module exports `execute` (one first pass or one full loop) and `match` (an independent
// matcher that maps a run's findings to labels). The default is ./live.ts; the tests pass ./scripted.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export type Route = "command" | "host";
export type Severity = "nit" | "should-fix" | "blocking";
export type Label = { id: string; minimum: Severity };
export type Brief = { name: "old" | "new"; plugin: string; pluginDir: string; docs: string };
export type RouteSettings = { model: string; argv?: string[]; model_attestation?: string };
export type Routes = { command: RouteSettings; host: RouteSettings; author?: { model: string } };
export type RunRequest = {
  kind: "first-pass" | "loop"; route: Route; model: string; brief: Brief;
  clone: string; commit: string; document: string; caseDir: string; maxReviews: number;
  /** The model of the host session that authors revisions, when the route settings name one. */
  authorModel?: string;
};
export type RunResult = {
  executed: boolean; failure?: string; route?: string; model?: string; plugin: string; docs: string;
  /** First pass: the reviewer's returned records. */
  records?: string;
  /** Loop: the document at X' and after every spec review, up to and including the clean pass. */
  documents?: string[];
  /** Loop: Open Questions the author raised, and whether it reached a clean pass within maxReviews. */
  questions?: number; clean?: boolean;
};
export type Executor = (request: RunRequest) => Promise<RunResult>;
export type Match = (input: { records: string; labels: Label[]; caseDir: string }) => Promise<{ label: string; severity: string }[]>;

export type CaseConfig = { case: string; clone: string; commit: string; document: string; profile: string; terms: string[] };

const SEVERITIES: Severity[] = ["nit", "should-fix", "blocking"];
const ROUTES: Route[] = ["command", "host"];
const FIRST_PASSES = { old: 3, new: 6, confirm: 6 };
const MAX_REVIEWS = 60;
const LOOP_ATTEMPTS = 3;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function git(root: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "replay", GIT_AUTHOR_EMAIL: "replay@localhost", GIT_COMMITTER_NAME: "replay", GIT_COMMITTER_EMAIL: "replay@localhost" } });
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed in a replay checkout`);
  return r.stdout.toString();
}

// ---- The approved case ----

const APPROVAL = /^Approved: owner (\S+), (\S+), labels\.md above this line sha256 ([0-9a-f]{64}), case\.yaml sha256 ([0-9a-f]{64})$/;

/** Reads the case and refuses it unless labels.md ends with an approval line whose digests match. */
export function loadCase(dir: string): { config: CaseConfig; labels: Label[]; approval: { owner: string; at: string } } {
  const labelsText = readFileSync(join(dir, "labels.md"), "utf8"), caseText = readFileSync(join(dir, "case.yaml"), "utf8");
  const at = labelsText.lastIndexOf("\nApproved: ");
  const line = at < 0 ? "" : labelsText.slice(at + 1).trimEnd();
  const approval = APPROVAL.exec(line);
  if (!approval || line.includes("\n")) throw new Error("case refused: labels.md has no owner approval line at its end");
  if (sha256(labelsText.slice(0, at)) !== approval[3]) throw new Error("case refused: labels.md changed since its approval");
  if (sha256(caseText) !== approval[4]) throw new Error("case refused: case.yaml changed since its approval");
  const raw = Bun.YAML.parse(caseText) as Record<string, unknown>;
  for (const key of ["case", "clone", "commit", "document", "profile"]) if (typeof raw[key] !== "string" || !(raw[key] as string).trim()) throw new Error(`case.yaml needs ${key}`);
  if (!Array.isArray(raw.terms) || raw.terms.some((term) => typeof term !== "string" || !term.trim())) throw new Error("case.yaml needs a terms list");
  return { config: { ...(raw as unknown as CaseConfig), terms: raw.terms as string[] }, labels: parseLabels(labelsText.slice(0, at)), approval: { owner: approval[1], at: approval[2] } };
}

export function parseLabels(text: string): Label[] {
  const labels: Label[] = [];
  for (const block of text.split(/\n(?=## L-\d{2,}:)/)) {
    const id = /^## (L-\d{2,}):/.exec(block)?.[1];
    if (!id) continue;
    const minimum = /^- Minimum severity: (\S+)/m.exec(block)?.[1] as Severity | undefined;
    if (!minimum || !SEVERITIES.includes(minimum)) throw new Error(`${id} has no valid minimum severity`);
    labels.push({ id, minimum });
  }
  if (!labels.length) throw new Error("labels.md holds no labels");
  return labels;
}

// ---- The private terms check ----

/** Markdown with every stored review record (a `### R-<n>` subsection) left out; those stay verbatim. */
export function withoutRecords(text: string): string {
  let skipping = false;
  return text.split("\n").filter((line) => {
    if (/^### R-\d+\s*$/.test(line)) skipping = true;
    else if (/^## /.test(line) || /^### (?!R-\d+\s*$)/.test(line)) skipping = false;
    return !skipping;
  }).join("\n");
}

function hasTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

/** Where a case term appears: paths only, never the term itself. */
export function termsCheck(terms: string[], sources: { tree?: string; diff?: string; files?: string[] }): string[] {
  const hits: string[] = [];
  const scan = (name: string, text: string) => { if (hasTerm(name.endsWith(".md") ? withoutRecords(text) : text, terms)) hits.push(name); };
  if (sources.tree) {
    for (const path of git(sources.tree, "ls-tree", "-r", "--name-only", "-z", "HEAD").split("\0").filter(Boolean)) {
      const blob = Bun.spawnSync(["git", "-C", sources.tree, "show", `HEAD:${path}`], { stdout: "pipe", stderr: "pipe" });
      if (blob.exitCode !== 0 || blob.stdout.includes(0)) continue;
      scan(path, blob.stdout.toString());
    }
  }
  if (sources.diff !== undefined) scan("companion diff", sources.diff);
  for (const file of sources.files ?? []) scan(file, readFileSync(file, "utf8"));
  return hits;
}

// ---- Document size ----

/** Lines above `## Review Log`, without the `## Deferred` section, so deferring an item is not growth. */
export function bodySize(doc: string): number {
  const above = doc.split(/^## Review Log\s*$/m)[0];
  let deferred = false;
  return above.split("\n").slice(0, -1).filter((line) => {
    if (/^## /.test(line)) deferred = /^## Deferred\s*$/.test(line);
    return !deferred;
  }).length;
}

// ---- X': the case commit with the profile, the brief's pin and the route under test ----

const PIN = /(https:\/\/github\.com\/vhco-pro\/docs\/blob\/)[0-9a-f]{40}(\/AGENTS\.md)/g;

export function agentsAt(text: string, profile: string, docs: string): string {
  let out = PIN.test(text) ? text.replace(PIN, `$1${docs}$2`)
    : `# Repository instructions\n\nRead the personal conventions at\nhttps://github.com/vhco-pro/docs/blob/${docs}/AGENTS.md\nand follow the task routes there before implementation.\n\n${text}`;
  PIN.lastIndex = 0;
  const section = `## Product profile\n\n${profile.trim()}\n`;
  const start = out.search(/^## Product profile\s*$/m);
  if (start < 0) return `${out.trimEnd()}\n\n${section}`;
  const next = out.slice(start + 1).search(/^## /m);
  return out.slice(0, start) + section + (next < 0 ? "" : `\n${out.slice(start + 1 + next)}`);
}

function loopSettings(existing: string | null, route: Route, routes: Routes): string {
  const value = (existing ? Bun.YAML.parse(existing) : { schema_version: 1 }) as Record<string, any>;
  value.roles = { ...(value.roles ?? {}) };
  const chosen = routes[route];
  value.roles.spec_reviewer = route === "command"
    ? { route: "command", model: chosen.model, ...(chosen.model_attestation ? { model_attestation: chosen.model_attestation } : {}), argv: chosen.argv }
    : { route: "host", model: chosen.model };
  if (routes.author) value.roles.author = { route: "host", model: routes.author.model };
  return `# Replay route settings for the ${route} route.\n${Bun.YAML.stringify(value, null, 2).trimEnd()}\n`;
}

/**
 * A throwaway shared clone of the case repository at X with X' committed on top, checked out on `main`.
 * Its `origin` is a throwaway bare repository that borrows the case repository's objects, so a session
 * that fetches or pushes never reaches the case repository itself.
 */
export function prepareClone(config: CaseConfig, brief: Brief, route: Route, routes: Routes, at?: string): { clone: string; commit: string; dispose: () => void } {
  const root = at ?? mkdtempSync(join(tmpdir(), "vh-replay-clone-"));
  if (at) mkdirSync(at, { recursive: true });
  const clone = join(root, "work"), bare = join(root, "origin.git");
  const dispose = () => rmSync(root, { recursive: true, force: true });
  try {
    git(root, "clone", "-q", "--shared", "--no-checkout", config.clone, clone);
    git(clone, "checkout", "-q", "--detach", config.commit);
    const agents = join(clone, "AGENTS.md");
    writeFileSync(agents, agentsAt(existsSync(agents) ? readFileSync(agents, "utf8") : "", config.profile, brief.docs));
    const settings = join(clone, ".vh-adlc", "loop.yaml");
    mkdirSync(join(clone, ".vh-adlc"), { recursive: true });
    writeFileSync(settings, loopSettings(existsSync(settings) ? readFileSync(settings, "utf8") : null, route, routes));
    git(clone, "add", "AGENTS.md", ".vh-adlc/loop.yaml");
    git(clone, "commit", "-q", "-m", `replay: profile, docs pin and ${route} route for the ${brief.name} brief`);
    const commit = git(clone, "rev-parse", "HEAD").trim();
    git(root, "init", "-q", "--bare", bare);
    const objects = git(clone, "rev-parse", "--path-format=absolute", "--git-path", "objects").trim();
    writeFileSync(join(bare, "objects", "info", "alternates"), `${readFileSync(join(objects, "info", "alternates"), "utf8").trim()}\n${objects}\n`);
    git(clone, "push", "-q", bare, `${commit}:refs/heads/main`);
    git(clone, "remote", "set-url", "origin", bare);
    git(clone, "fetch", "-q", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*");
    git(clone, "checkout", "-q", "-B", "main", "origin/main");
    return { clone, commit, dispose };
  } catch (error) { dispose(); throw error; }
}

/**
 * A resumed loop clone takes the case's current route settings, so a change to how the route starts
 * its reviewer reaches a resumed loop the way it reaches a new one. The change is a commit on the
 * clone's own origin, because the command route reads its settings from the reviewed commit.
 */
function refreshRoute(clone: string, route: Route, routes: Routes): void {
  const settings = join(clone, ".vh-adlc", "loop.yaml");
  const current = existsSync(settings) ? readFileSync(settings, "utf8") : null;
  const wanted = loopSettings(current, route, routes);
  if (current === wanted) return;
  writeFileSync(settings, wanted);
  git(clone, "add", ".vh-adlc/loop.yaml");
  git(clone, "commit", "-q", "-m", `replay: current ${route} route settings`, "--", ".vh-adlc/loop.yaml");
  git(clone, "push", "-q", "origin", "HEAD:main");
}

function extractPlugin(tree: string, commit: string): { dir: string; dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "vh-replay-plugin-"));
  const archive = Bun.spawnSync(["git", "-C", tree, "archive", "--format=tar", commit, "plugins/vh-adlc"], { stdout: "pipe", stderr: "pipe" });
  if (archive.exitCode !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error(`plugin commit ${commit} has no plugins/vh-adlc`); }
  Bun.spawnSync(["tar", "-x", "-C", dir], { stdin: archive.stdout });
  return { dir: join(dir, "plugins", "vh-adlc"), dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---- Runs ----

type RunEntry = { n: number; status: "counted" | "failed" | "not counted"; reason?: string; plugin: string; docs: string; model?: string; labels: string[] };
type PassSet = { counted: number; failed: number; excluded: number; runs: RunEntry[]; hits: Map<string, Severity[]> };

const rank = (severity: string) => SEVERITIES.indexOf(severity as Severity);

async function firstPasses(want: number, set: PassSet, run: () => Promise<RunResult>, expected: { route: Route; model: string; plugin: string; docs: string }, labels: Label[], match: Match, caseDir: string, store: (n: number, text: string, verdicts?: unknown) => void) {
  // want is the number of counted passes the set must reach; a continued set keeps its earlier passes.
  const limit = set.runs.length + Math.max(want - set.counted, 0) * 3;
  const target = want;
  while (set.counted < target) {
    if (set.runs.length >= limit) throw new Error(`stopped: too many failed or wrong-route runs for ${expected.route}`);
    const n = set.runs.length + 1;
    const result = await run();
    const base = { n, plugin: result.plugin, docs: result.docs, model: result.model, labels: [] as string[] };
    if (!result.executed) { set.failed++; set.runs.push({ ...base, status: "failed", reason: "execution failed" }); store(n, `FAILED: ${result.failure ?? "unknown"}`); continue; }
    const identity = [result.route === expected.route ? "" : "route", result.model === expected.model ? "" : "model",
      result.plugin === expected.plugin ? "" : "plugin commit", result.docs === expected.docs ? "" : "docs revision"].filter(Boolean);
    if (identity.length) { set.excluded++; set.runs.push({ ...base, status: "not counted", reason: `reported another ${identity.join(" and ")}` }); store(n, result.records ?? ""); continue; }
    const records = result.records ?? "";
    store(n, records);
    const verdicts = await match({ records, labels, caseDir });
    store(n, records, verdicts);
    const raised = new Map<string, Severity>();
    for (const v of verdicts) {
      if (!labels.some((label) => label.id === v.label) || rank(v.severity) < 0) continue;
      const before = raised.get(v.label);
      if (before === undefined || rank(v.severity) > rank(before)) raised.set(v.label, v.severity as Severity);
    }
    for (const [label, severity] of raised) set.hits.set(label, [...(set.hits.get(label) ?? []), severity]);
    set.counted++;
    set.runs.push({ ...base, status: "counted", labels: [...raised].map(([label, severity]) => `${label}:${severity}`) });
  }
}

/** The retention rule: fail when two of three old passes raise a label and none of the new passes does at its minimum. */
export type Retention = { oldMin: number; oldAny: number; newMin: number; newAny: number };

/** Counts the passes of each brief that raise a label at its minimum severity and at any severity. */
export function retention(label: Label, old: Severity[], fresh: Severity[]): Retention {
  const atMin = (list: Severity[]) => list.filter((severity) => rank(severity) >= rank(label.minimum)).length;
  return { oldMin: atMin(old), oldAny: old.length, newMin: atMin(fresh), newAny: fresh.length };
}

/**
 * Both briefs meet the same bar: a label the old brief raised at its minimum in two passes fails when no
 * new pass raises it at its minimum; one the old brief raised only below its minimum in two passes fails
 * when no new pass raises it at all, because then the new rules dropped it.
 */
export function retentionFails(r: Retention): boolean {
  return r.oldMin >= 2 ? r.newMin === 0 : r.oldAny >= 2 && r.newAny === 0;
}

function retentionVerdict(r: Retention): "pass" | "fail" | "not raised by old" {
  return r.oldAny === 0 ? "not raised by old" : retentionFails(r) ? "fail" : "pass";
}

// ---- Stored runs ----

type Identity = { plugin: string; docs: string; model: string };
type Part = "pass" | "loop";
const identityPath = (dir: string, brief: "old" | "new", route: Route, part: Part) => join(dir, `${brief}-${route}-${part}.identity.json`);

/** Records which brief, docs revision and model a stored set (one part of a brief on a route) comes from. */
export function recordIdentity(dir: string, brief: "old" | "new", route: Route, part: Part, identity: Identity) {
  writeFileSync(identityPath(dir, brief, route, part), `${JSON.stringify(identity, null, 2)}\n`);
}

/**
 * Starts a fresh stored set for a brief on a route: earlier files of the kinds this run produces move to
 * runs-superseded, so a set never mixes two invocations. A loops-only run keeps the first passes.
 */
export function freshSet(dir: string, brief: "old" | "new", route: Route, kinds: Part[], identity: Identity) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const moved = existsSync(dir) ? readdirSync(dir).filter((f) => kinds.some((kind) => f.startsWith(`${brief}-${route}-${kind}-`) || f === `${brief}-${route}-${kind}.identity.json`)) : [];
  if (moved.length) {
    const aside = join(dir, "..", "runs-superseded", `${stamp}-${brief}-${route}`);
    mkdirSync(aside, { recursive: true });
    for (const f of moved) renameSync(join(dir, f), join(aside, f));
  }
  // A kept loop clone belongs to its set and moves aside with it.
  const clone = join(dir, "..", "loop-clones", `${brief}-${route}`);
  if (kinds.includes("loop") && existsSync(clone)) {
    const aside = join(dir, "..", "runs-superseded", `${stamp}-${brief}-${route}`);
    mkdirSync(aside, { recursive: true });
    renameSync(clone, join(aside, "loop-clone"));
  }
  const recordPath = launchRecordPath(dir);
  if (existsSync(recordPath)) {
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { launches: LaunchEntry[] };
    record.launches = record.launches.filter((e) => !(e.brief === brief && e.route === route && kinds.includes(e.part)));
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  }
  for (const kind of kinds) recordIdentity(dir, brief, route, kind, identity);
}

type LaunchEntry = Identity & { brief: string; route: string; part: Part; files: string[]; pid?: number; command?: string; log?: string; note?: string };
const launchRecordPath = (dir: string) => join(dir, "launch-record.json");

/** The launch record entry for a stored set made before the harness recorded identity; one launch wrote each. */
function launchEntry(dir: string, brief: "old" | "new", route: Route, part: Part): LaunchEntry | undefined {
  const path = launchRecordPath(dir);
  if (!existsSync(path)) return undefined;
  const entries = (JSON.parse(readFileSync(path, "utf8")).launches as LaunchEntry[]).filter((e) => e.brief === brief && e.route === route && e.part === part);
  if (entries.length > 1) throw new Error(`refused: the launch record names ${entries.length} launches for the ${brief}-brief ${part} set on the ${route} route`);
  return entries[0];
}

/** Files of a stored set its launch record entry lists, or null when no entry covers it. */
function listedFiles(dir: string, brief: "old" | "new", route: Route, part: Part): Set<string> | null {
  const entry = launchEntry(dir, brief, route, part);
  return entry ? new Set(entry.files) : null;
}

/** Refuses stored runs whose recorded identity is missing or differs from the expected brief. */
export function checkIdentity(dir: string, brief: "old" | "new", route: Route, part: Part, expected: Identity) {
  const path = identityPath(dir, brief, route, part), entry = launchEntry(dir, brief, route, part);
  if (!existsSync(path) && entry) {
    if (entry.plugin !== expected.plugin || entry.docs !== expected.docs || entry.model !== expected.model)
      throw new Error(`refused: the launch record for the ${brief}-brief ${part} set on the ${route} route names another brief, docs revision or model`);
    const listed = new Set(entry.files);
    const unlisted = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${brief}-${route}-${part}-`) && !listed.has(f)) : [];
    if (unlisted.length) throw new Error(`refused: ${unlisted.length} stored ${brief}-brief ${part} file(s) on the ${route} route are not in the launch record`);
    return;
  }
  if (!existsSync(path)) throw new Error(`refused: the stored ${brief}-brief ${part} set on the ${route} route records no brief identity`);
  const recorded = JSON.parse(readFileSync(path, "utf8")) as Identity;
  if (recorded.plugin !== expected.plugin || recorded.docs !== expected.docs || recorded.model !== expected.model)
    throw new Error(`refused: the stored ${brief}-brief ${part} set on the ${route} route comes from another brief, docs revision or model`);
}

/** The passes a brief stored on a route: a .txt with its .verdicts.json was counted, FAILED text failed to execute. */
export function storedPasses(dir: string, brief: "old" | "new", route: Route, expected: { model: string; plugin: string; docs: string }): PassSet {
  const set: PassSet = { counted: 0, failed: 0, excluded: 0, runs: [], hits: new Map() };
  if (!existsSync(dir)) return set;
  const prefix = `${brief}-${route}-pass-`, listed = existsSync(identityPath(dir, brief, route, "pass")) ? null : listedFiles(dir, brief, route, "pass");
  const numbers = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".txt") && (!listed || listed.has(f))).map((f) => Number(f.slice(prefix.length, -4))).filter(Number.isInteger).sort((a, b) => a - b);
  for (const n of numbers) {
    const text = readFileSync(join(dir, `${prefix}${n}.txt`), "utf8"), verdictsPath = join(dir, `${prefix}${n}.verdicts.json`);
    const base = { n, plugin: expected.plugin, docs: expected.docs, labels: [] as string[] };
    if (existsSync(verdictsPath)) {
      const raised = new Map<string, Severity>();
      for (const v of JSON.parse(readFileSync(verdictsPath, "utf8")) as { label: string; severity: string }[]) {
        if (rank(v.severity) < 0) continue;
        const before = raised.get(v.label);
        if (before === undefined || rank(v.severity) > rank(before)) raised.set(v.label, v.severity as Severity);
      }
      for (const [label, severity] of raised) set.hits.set(label, [...(set.hits.get(label) ?? []), severity]);
      set.counted++;
      set.runs.push({ ...base, model: expected.model, status: "counted", labels: [...raised].map(([label, severity]) => `${label}:${severity}`) });
    } else if (text.startsWith("FAILED")) { set.failed++; set.runs.push({ ...base, status: "failed", reason: "execution failed" }); }
    else { set.excluded++; set.runs.push({ ...base, status: "not counted", reason: "reported another identity" }); }
  }
  return set;
}

/** A brief's finished loop on a route, from its stored documents. */
export function storedLoop(dir: string, brief: "old" | "new", route: Route, expected: { model: string; plugin: string; docs: string }): CaseData["loops"][string] | undefined {
  if (!existsSync(dir)) return undefined;
  const prefix = `${brief}-${route}-loop-`, listed = existsSync(identityPath(dir, brief, route, "loop")) ? null : listedFiles(dir, brief, route, "loop");
  const numbers = readdirSync(dir).filter((f) => f.startsWith(prefix) && /^\d+\.md$/.test(f.slice(prefix.length)) && (!listed || listed.has(f))).map((f) => Number(f.slice(prefix.length, -3))).sort((a, b) => a - b);
  const failed = readdirSync(dir).filter((f) => f.startsWith(`${prefix}failed-`)).length;
  const boundPath = join(dir, `${brief}-${route}-loop.bound.json`);
  if (!numbers.length && existsSync(boundPath)) {
    // A loop that stopped before a clean pass and lost its documents counts its recorded reviews as a lower bound.
    const bound = JSON.parse(readFileSync(boundPath, "utf8")) as { reviews_at_least: number };
    return { executed: true, failed, reviews: Math.min(bound.reviews_at_least, MAX_REVIEWS), questions: 0, bodySizes: [], growth: 0, clean: false, bound: true, ...expected };
  }
  if (!numbers.length) return failed ? { executed: false, failed, reviews: 0, questions: 0, bodySizes: [], growth: 0, clean: false, ...expected } : undefined;
  const sizes = numbers.map((n) => bodySize(readFileSync(join(dir, `${prefix}${n}.md`), "utf8")));
  const reviews = Math.min(numbers.length - 1, MAX_REVIEWS);
  return { executed: true, failed, reviews, questions: 0, bodySizes: sizes, growth: sizes.at(-1)! - sizes[0], clean: reviews < MAX_REVIEWS, ...expected };
}

/** Rebuilds a case's results from its stored runs alone. */
export function assembleCase(caseDir: string, o: { oldPlugin: string; newPlugin: string; oldDocs: string; newDocs: string; routes: Routes; approvedAt: string; name: string; labels: Label[] }): CaseData {
  const dir = join(caseDir, "runs");
  const briefs = { old: { plugin: o.oldPlugin, docs: o.oldDocs }, new: { plugin: o.newPlugin, docs: o.newDocs } };
  const data: CaseData = { case: o.name, approvedAt: o.approvedAt, terms: "pass", briefs, firstPasses: {}, retention: {}, loops: {} };
  for (const route of ROUTES) {
    const model = o.routes[route].model;
    for (const name of ["old", "new"] as const) for (const part of ["pass", "loop"] as const) {
      const stored = existsSync(dir) && readdirSync(dir).some((f) => f.startsWith(`${name}-${route}-${part}-`));
      if (stored) checkIdentity(dir, name, route, part, { model, ...briefs[name] });
    }
    const sets = { old: storedPasses(dir, "old", route, { model, ...briefs.old }), new: storedPasses(dir, "new", route, { model, ...briefs.new }) };
    if (sets.old.runs.length || sets.new.runs.length) {
      for (const name of ["old", "new"] as const) data.firstPasses[`${name}/${route}`] = { counted: sets[name].counted, failed: sets[name].failed, excluded: sets[name].excluded, runs: sets[name].runs };
      if (sets.old.counted && sets.new.counted) {
        data.retention[route] = Object.fromEntries(o.labels.map((label) => {
          const r = retention(label, sets.old.hits.get(label.id) ?? [], sets.new.hits.get(label.id) ?? []);
          return [label.id, { ...r, runs: sets.new.counted, verdict: retentionVerdict(r) }];
        }));
      }
    }
    for (const name of ["old", "new"] as const) {
      const loop = storedLoop(dir, name, route, { model, ...briefs[name] });
      if (loop) data.loops[`${name}/${route}`] = loop;
    }
  }
  return data;
}

// ---- Results: counts and identities only ----

type CaseData = {
  case: string; approvedAt: string; terms: "pass";
  briefs: Record<"old" | "new", { plugin: string; docs: string }>;
  firstPasses: Record<string, { counted: number; failed: number; excluded: number; runs: RunEntry[] }>;
  retention: Record<string, Record<string, Retention & { runs: number; verdict: "pass" | "fail" | "not raised by old" }>>;
  loops: Record<string, { executed: boolean; failed?: number; bound?: boolean; reviews: number; questions: number; bodySizes: number[]; growth: number; clean: boolean; model?: string; plugin: string; docs: string }>;
};

const short = (s: string) => s.slice(0, 12);

function renderCase(d: CaseData): string {
  const lines = [`## Case: ${d.case}`, "", `Labels approved: ${d.approvedAt}. Terms check: ${d.terms}.`, "",
    `Briefs: old plugin \`${short(d.briefs.old.plugin)}\` with docs \`${short(d.briefs.old.docs)}\`; new plugin \`${short(d.briefs.new.plugin)}\` with docs \`${short(d.briefs.new.docs)}\`.`, "",
    "### First passes", "", "| Brief | Route | Run | Plugin | Docs | Model | Status | Labels raised |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const [key, set] of Object.entries(d.firstPasses)) {
    const [brief, route] = key.split("/");
    for (const r of set.runs) lines.push(`| ${brief} | ${route} | ${r.n} | \`${short(r.plugin)}\` | \`${short(r.docs)}\` | ${r.model ?? "unknown"} | ${r.status}${r.reason ? ` (${r.reason})` : ""} | ${r.labels.join(", ") || "none"} |`);
  }
  lines.push("", "### Retention", "", "| Route | Label | Old at its minimum | Old at any severity | New at its minimum | New at any severity | New runs | Verdict |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [route, labels] of Object.entries(d.retention)) for (const [label, r] of Object.entries(labels)) lines.push(`| ${route} | ${label} | ${r.oldMin}/3 | ${r.oldAny}/3 | ${r.newMin}/${r.runs} | ${r.newAny}/${r.runs} | ${r.runs} | ${r.verdict} |`);
  lines.push("", "### Full loops", "", "| Brief | Route | Plugin | Docs | Model | Spec reviews | Body size per pass | Growth |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [key, l] of Object.entries(d.loops)) {
    const [brief, route] = key.split("/");
    lines.push(`| ${brief} | ${route} | \`${short(l.plugin)}\` | \`${short(l.docs)}\` | ${l.model ?? "unknown"} | ${l.executed ? `${l.bound ? "at least " : ""}${l.reviews}${l.clean ? "" : l.bound ? ", not clean" : " (cap)"}` : "failed"} | ${l.bodySizes.join(", ") || "not stored"} | ${l.bodySizes.length ? l.growth : "unknown"} |`);
  }
  lines.push("", "```replay-data", JSON.stringify(d), "```", "");
  return lines.join("\n");
}

function totals(cases: CaseData[]): string {
  const sum = (brief: "old" | "new", field: "reviews" | "questions" | "growth") => cases.reduce((total, c) =>
    total + Object.entries(c.loops).filter(([key]) => key.startsWith(`${brief}/`)).reduce((t, [, l]) => t + l[field], 0), 0);
  const failing = cases.flatMap((c) => Object.entries(c.retention).flatMap(([route, labels]) => Object.entries(labels).filter(([, r]) => r.verdict === "fail").map(([label]) => `${c.case} ${route} ${label}`)));
  const [oldReviews, newReviews] = [sum("old", "reviews"), sum("new", "reviews")];
  // Growth compares only the pairs whose old-brief loop stored its documents.
  const pairs = cases.flatMap((c) => Object.keys(c.loops).filter((k) => k.startsWith("old/") && c.loops[k].clean && !c.loops[k].bound && c.loops[k].bodySizes.length && c.loops[`new/${k.slice(4)}`]?.bodySizes.length).map((k) => [c, k.slice(4)] as const));
  const oldG = pairs.reduce((t, [c, r]) => t + c.loops[`old/${r}`].growth, 0), newG = pairs.reduce((t, [c, r]) => t + c.loops[`new/${r}`].growth, 0);
  // Growth needs at least one pair whose old loop reached a clean pass with stored documents.
  const growthOk = pairs.length > 0 && (oldG <= 0 ? newG <= oldG : newG * 2 <= oldG);
  return ["## Totals", "", `Cases: ${cases.map((c) => c.case).join(", ")}.`, "",
    "| Measure | Old | New | Condition | Met |", "| --- | --- | --- | --- | --- |",
    `| Spec reviews | ${cases.some((c) => Object.values(c.loops).some((l) => l.bound)) ? "at least " : ""}${oldReviews} | ${newReviews} | new at most half of old | ${newReviews * 2 <= oldReviews ? "yes" : "no"} |`,
    `| Body growth (${pairs.length} pairs with stored old documents) | ${oldG} | ${newG} | new at most half of old, or no larger when old is zero or less | ${growthOk ? "yes" : "no"} |`,
    `| Failing labels | | ${failing.length} | none | ${failing.length ? "no" : "yes"} |`, ""].join("\n");
}

/**
 * Writes one case's counts, keeping the other cases. With the same briefs, a run keeps every earlier result it
 * did not produce again, so the routes, and the first passes and loops, can run separately.
 */
export function writeResults(file: string, data: CaseData) {
  const previous = existsSync(file) ? readFileSync(file, "utf8") : "";
  const all = [...previous.matchAll(/```replay-data\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]) as CaseData);
  const before = all.find((c) => c.case === data.case);
  const cases = all.filter((c) => c.case !== data.case);
  if (before && JSON.stringify(before.briefs) === JSON.stringify(data.briefs)) {
    // Each entry this run produced replaces the earlier one; every other earlier entry stays.
    data = { ...data, firstPasses: { ...before.firstPasses, ...data.firstPasses }, retention: { ...before.retention, ...data.retention }, loops: { ...before.loops, ...data.loops } };
  }
  cases.push(data);
  cases.sort((a, b) => a.case.localeCompare(b.case));
  const header = "# Proportional review replay results\n\nCounts and run identities only, written by `tests/vh-adlc/replay/run.ts`. Case material stays in the private case directories.\n";
  writeFileSync(file, [header, ...cases.map(renderCase), totals(cases)].join("\n"));
}

// ---- The run ----

async function runCase(o: Record<string, string | undefined>) {
  const caseDir = resolve(need(o, "case"));
  const { config, labels, approval } = loadCase(caseDir);
  const tree = resolve(need(o, "tree")), docs = resolve(need(o, "docs"));
  const base = need(o, "companion-base"), head = need(o, "companion-head");
  const hits = termsCheck(config.terms, { tree, diff: git(docs, "diff", `${base}..${head}`) });
  if (hits.length) throw new Error(`stopped: the terms check found a case term in ${hits.join(", ")}`);
  const routes = JSON.parse(readFileSync(need(o, "routes"), "utf8")) as Routes;
  const executorPath = o.executor ? resolve(o.executor) : join(import.meta.dir, "live.ts");
  const { execute, match } = await import(executorPath) as { execute: Executor; match: Match };
  const underTest = (o["routes-under-test"] ?? "command,host").split(",") as Route[];
  const only = o.only;
  const selected = (o.briefs ?? "old,new").split(",");
  if (selected.some((name) => name !== "old" && name !== "new") || !selected.length) throw new Error("--briefs takes old, new or old,new");
  const results = resolve(o.results ?? join(import.meta.dir, "..", "evidence", "proportional-review", "results.md"));
  const privateRuns = join(caseDir, "runs");
  mkdirSync(privateRuns, { recursive: true });

  const plugins = { old: extractPlugin(tree, need(o, "old-plugin")), new: extractPlugin(tree, need(o, "new-plugin")) };
  const briefs: Record<"old" | "new", Brief> = {
    old: { name: "old", plugin: git(tree, "rev-parse", need(o, "old-plugin")).trim(), pluginDir: plugins.old.dir, docs: git(docs, "rev-parse", base).trim() },
    new: { name: "new", plugin: git(tree, "rev-parse", need(o, "new-plugin")).trim(), pluginDir: plugins.new.dir, docs: git(docs, "rev-parse", head).trim() },
  };
  let stopped = "";
  const data: CaseData = { case: config.case, approvedAt: approval.at, terms: "pass", briefs: { old: { plugin: briefs.old.plugin, docs: briefs.old.docs }, new: { plugin: briefs.new.plugin, docs: briefs.new.docs } }, firstPasses: {}, retention: {}, loops: {} };
  try {
    for (const route of ROUTES.filter((r) => underTest.includes(r))) {
      const model = routes[route].model;
      const kinds: ("pass" | "loop")[] = only === "loops" ? ["loop"] : only === "first-passes" ? ["pass"] : ["pass", "loop"];
      // A run continues a stored set made with the same identity and starts a fresh one when it differs.
      for (const name of selected as ("old" | "new")[]) {
        const identity = { model, plugin: briefs[name].plugin, docs: briefs[name].docs };
        for (const part of kinds) {
          let same = false;
          try { checkIdentity(privateRuns, name, route, part, identity); same = true; } catch { same = false; }
          if (same) recordIdentity(privateRuns, name, route, part, identity);
          else freshSet(privateRuns, name, route, [part], identity);
        }
      }
      const once = async (brief: Brief, kind: RunRequest["kind"]) => {
        // A loop works in a clone kept in the case directory: it survives a failure, and the next attempt
        // resumes it, so no finished review is lost. A first pass uses a throwaway clone.
        const kept = kind === "loop" ? join(caseDir, "loop-clones", `${brief.name}-${route}`) : undefined;
        const marker = kept ? join(kept, "replay-clone.json") : undefined;
        let prepared: { clone: string; commit: string; dispose: () => void };
        if (kept && marker && existsSync(marker)) {
          const m = JSON.parse(readFileSync(marker, "utf8")) as { commit: string; plugin: string; docs: string };
          if (m.plugin !== brief.plugin || m.docs !== brief.docs) throw new Error(`refused: the kept ${brief.name} loop clone on the ${route} route belongs to another brief`);
          prepared = { clone: join(kept, "work"), commit: m.commit, dispose: () => rmSync(kept, { recursive: true, force: true }) };
          refreshRoute(prepared.clone, route, routes);
        } else {
          prepared = prepareClone(config, brief, route, routes, kept);
          if (marker) writeFileSync(marker, `${JSON.stringify({ commit: prepared.commit, plugin: brief.plugin, docs: brief.docs })}\n`);
        }
        let result: RunResult | undefined;
        try { result = await execute({ kind, route, model, brief, clone: prepared.clone, commit: prepared.commit, document: config.document, caseDir, maxReviews: MAX_REVIEWS, ...(routes.author ? { authorModel: routes.author.model } : {}) }); return result; }
        finally { if (!kept || result?.executed) prepared.dispose(); }
      };
      if (only !== "loops") {
        const sets: Record<"old" | "new", PassSet> = { old: { counted: 0, failed: 0, excluded: 0, runs: [], hits: new Map() }, new: { counted: 0, failed: 0, excluded: 0, runs: [], hits: new Map() } };
        const pass = (name: "old" | "new", want: number) => firstPasses(want, sets[name], () => once(briefs[name], "first-pass"), { route, model, plugin: briefs[name].plugin, docs: briefs[name].docs }, labels, match, caseDir,
          (n, text, verdicts) => {
            writeFileSync(join(privateRuns, `${name}-${route}-pass-${n}.txt`), text);
            if (verdicts !== undefined) writeFileSync(join(privateRuns, `${name}-${route}-pass-${n}.verdicts.json`), `${JSON.stringify(verdicts, null, 2)}\n`);
          });
        // A brief that is not run takes its counted passes from the stored runs, so a rerun of the new brief
        // compares against the old passes already stored.
        for (const name of ["old", "new"] as const) {
          const identity = { model, plugin: briefs[name].plugin, docs: briefs[name].docs };
          if (selected.includes(name)) { sets[name] = storedPasses(privateRuns, name, route, identity); await pass(name, FIRST_PASSES[name]); }
          else { checkIdentity(privateRuns, name, route, "pass", identity); sets[name] = storedPasses(privateRuns, name, route, identity); }
        }
        const verdicts: CaseData["retention"][string] = {};
        const failing = () => labels.filter((label) => { const r = retention(label, sets.old.hits.get(label.id) ?? [], sets.new.hits.get(label.id) ?? []); return retentionFails(r); });
        if (failing().length && selected.includes("new")) await pass("new", FIRST_PASSES.new + FIRST_PASSES.confirm);
        for (const label of labels) {
          const r = retention(label, sets.old.hits.get(label.id) ?? [], sets.new.hits.get(label.id) ?? []);
          verdicts[label.id] = { ...r, runs: sets.new.counted, verdict: retentionVerdict(r) };
        }
        for (const name of ["old", "new"] as const) data.firstPasses[`${name}/${route}`] = { counted: sets[name].counted, failed: sets[name].failed, excluded: sets[name].excluded, runs: sets[name].runs };
        data.retention[route] = verdicts;
      }
      if (only !== "first-passes") {
        for (const name of ["old", "new"] as const) {
          const identity = { model, plugin: briefs[name].plugin, docs: briefs[name].docs };
          if (!selected.includes(name)) {
            const hasLoop = existsSync(privateRuns) && readdirSync(privateRuns).some((f) => f.startsWith(`${name}-${route}-loop-`));
            if (hasLoop) checkIdentity(privateRuns, name, route, "loop", identity);
            const stored = storedLoop(privateRuns, name, route, identity);
            if (stored) data.loops[`${name}/${route}`] = stored;
            continue;
          }
          // A continued loop set that already finished is used as stored, never run again.
          const finished = storedLoop(privateRuns, name, route, identity);
          if (finished?.executed && finished.bodySizes.length) { data.loops[`${name}/${route}`] = finished; continue; }
          // A loop that fails to execute or reports another identity is recorded and rerun, never counted.
          let failed = 0, result: RunResult | undefined, identityOk = false;
          while (failed < LOOP_ATTEMPTS) {
            result = await once(briefs[name], "loop");
            identityOk = result.executed && result.route === route && result.model === model && result.plugin === briefs[name].plugin && result.docs === briefs[name].docs;
            if (identityOk) break;
            failed++;
            writeFileSync(join(privateRuns, `${name}-${route}-loop-failed-${failed}.txt`), result.executed ? `reported ${result.route} ${result.model}` : `FAILED: ${result.failure ?? "unknown"}`);
          }
          const documents = identityOk ? result!.documents ?? [] : [];
          documents.forEach((doc, i) => writeFileSync(join(privateRuns, `${name}-${route}-loop-${i}.md`), doc));
          const sizes = documents.map(bodySize);
          data.loops[`${name}/${route}`] = { executed: identityOk, failed, reviews: Math.min(Math.max(documents.length - 1, 0), MAX_REVIEWS), questions: identityOk ? result!.questions ?? 0 : 0,
            bodySizes: sizes, growth: sizes.length ? sizes.at(-1)! - sizes[0] : 0, clean: identityOk && (result!.clean ?? documents.length - 1 <= MAX_REVIEWS), model: result!.model, plugin: result!.plugin, docs: result!.docs };
          if (!identityOk) stopped = `stopped: the ${name} loop on the ${route} route failed ${failed} times; its first passes are recorded, rerun its loops with --only loops`;
          if (stopped) break;
        }
      }
      if (stopped) break;
    }
  } finally {
    plugins.old.dispose(); plugins.new.dispose();
  }
  const resultHits = termsCheck(config.terms, { files: existsSync(results) ? [results] : [] });
  writeResults(results, data);
  const after = termsCheck(config.terms, { files: [results] });
  if (after.length || resultHits.length) throw new Error("stopped: the terms check found a case term in the results file");
  if (stopped) throw new Error(stopped);
  console.log(JSON.stringify({ case: config.case, results, retention: data.retention, loops: Object.fromEntries(Object.entries(data.loops).map(([k, l]) => [k, { reviews: l.reviews, questions: l.questions, growth: l.growth }])) }));
}

function need(o: Record<string, string | undefined>, name: string): string {
  const value = o[name];
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    case: { type: "string" }, tree: { type: "string" }, "old-plugin": { type: "string" }, "new-plugin": { type: "string" },
    docs: { type: "string" }, "companion-base": { type: "string" }, "companion-head": { type: "string" }, routes: { type: "string" },
    results: { type: "string" }, executor: { type: "string" }, only: { type: "string" }, "routes-under-test": { type: "string" },
    file: { type: "string", multiple: true }, briefs: { type: "string" }, "old-docs": { type: "string" }, "new-docs": { type: "string" },
    brief: { type: "string" }, sessions: { type: "string" }, since: { type: "string" }, until: { type: "string" }, "first-passes": { type: "string" },
  } });
  const command = positionals[0];
  if (command === "run") { await runCase(values as Record<string, string | undefined>); return 0; }
  if (command === "bound") {
    // Counts the reviews a lost loop ran from the reviewer's session logs: distinct reviewed commits for this
    // document and docs revision, less the first passes, which each reviewed their own X'.
    const v = values as Record<string, string | undefined>;
    const caseDir = resolve(need(v, "case"));
    const { config } = loadCase(caseDir);
    const brief = need(v, "brief") as "old" | "new", route = need(v, "routes-under-test") as Route;
    const sessions = need(v, "sessions"), docs = need(v, "old-docs"), since = Date.parse(need(v, "since")), until = Date.parse(need(v, "until"));
    const seen: { at: number; commit: string }[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) walk(path);
      else if (name.name.endsWith(".jsonl")) {
        const t = statSync(path).mtimeMs;
        if (t < since || t > until) continue;
        const text = readFileSync(path, "utf8");
        if (!text.includes(config.document) || !text.includes(docs)) continue;
        const m = /Commit: ([0-9a-f]{40})/.exec(text);
        if (m) seen.push({ at: t, commit: m[1] });
      }
    } };
    walk(sessions);
    // Distinct commits in the order they were first reviewed; the launch's first-pass executions came first,
    // each on its own X', so the first ones belong to them and are set aside.
    const ordered: string[] = [];
    for (const { commit } of seen.sort((a, b) => a.at - b.at)) if (!ordered.includes(commit)) ordered.push(commit);
    const firstPasses = Number(need(v, "first-passes"));
    const counted = ordered.slice(firstPasses);
    const record = { reviews_at_least: Math.min(counted.length, MAX_REVIEWS), clean: false, window: { since: v.since, until: v.until }, first_pass_executions: firstPasses,
      set_aside: ordered.slice(0, firstPasses), counted_commits: counted, source: `reviewer session logs under ${sessions} for ${config.document} at docs ${docs}` };
    writeFileSync(join(caseDir, "runs", `${brief}-${route}-loop.bound.json`), `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify(record));
    return 0;
  }
  if (command === "assemble") {
    const v = values as Record<string, string | undefined>;
    const caseDir = resolve(need(v, "case"));
    const { config, labels, approval } = loadCase(caseDir);
    const routes = JSON.parse(readFileSync(need(v, "routes"), "utf8")) as Routes;
    const results = resolve(v.results ?? join(import.meta.dir, "..", "evidence", "proportional-review", "results.md"));
    const data = assembleCase(caseDir, { oldPlugin: need(v, "old-plugin"), newPlugin: need(v, "new-plugin"), oldDocs: need(v, "old-docs"), newDocs: need(v, "new-docs"), routes, approvedAt: approval.at, name: config.case, labels });
    writeResults(results, data);
    if (termsCheck(config.terms, { files: [results] }).length) throw new Error("stopped: the terms check found a case term in the results file");
    console.log(JSON.stringify({ case: config.case, results, retention: data.retention, loops: Object.fromEntries(Object.entries(data.loops).map(([k, l]) => [k, { reviews: l.reviews, growth: l.growth, clean: l.clean }])) }));
    return 0;
  }
  if (command === "terms") {
    const caseDir = resolve(need(values as Record<string, string>, "case"));
    const { config } = loadCase(caseDir);
    const diff = values.docs ? git(resolve(values.docs), "diff", `${need(values as Record<string, string>, "companion-base")}..${need(values as Record<string, string>, "companion-head")}`) : undefined;
    const files = (values.file ?? []).map((file) => isAbsolute(file) ? file : resolve(file));
    const hits = termsCheck(config.terms, { tree: values.tree ? resolve(values.tree) : undefined, diff, files });
    console.log(JSON.stringify({ terms: hits.length ? "fail" : "pass", where: hits }));
    return hits.length ? 3 : 0;
  }
  throw new Error("usage: run.ts run|terms ... (see the header of tests/vh-adlc/replay/run.ts)");
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(2);
  });
}
