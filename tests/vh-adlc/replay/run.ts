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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
export function prepareClone(config: CaseConfig, brief: Brief, route: Route, routes: Routes): { clone: string; commit: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), "vh-replay-clone-"));
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
  const limit = set.runs.length + want * 3;
  let target = set.counted + want;
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
export function retention(label: Label, old: Severity[], fresh: Severity[]): { old: number; new: number } {
  return { old: old.length, new: fresh.filter((severity) => rank(severity) >= rank(label.minimum)).length };
}

// ---- Results: counts and identities only ----

type CaseData = {
  case: string; approvedAt: string; terms: "pass";
  briefs: Record<"old" | "new", { plugin: string; docs: string }>;
  firstPasses: Record<string, { counted: number; failed: number; excluded: number; runs: RunEntry[] }>;
  retention: Record<string, Record<string, { old: number; new: number; runs: number; verdict: "pass" | "fail" | "not raised by old" }>>;
  loops: Record<string, { executed: boolean; reviews: number; questions: number; bodySizes: number[]; growth: number; clean: boolean; model?: string; plugin: string; docs: string }>;
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
  lines.push("", "### Retention", "", "| Route | Label | Old passes raising it | New passes at its minimum | New runs | Verdict |", "| --- | --- | --- | --- | --- | --- |");
  for (const [route, labels] of Object.entries(d.retention)) for (const [label, r] of Object.entries(labels)) lines.push(`| ${route} | ${label} | ${r.old}/3 | ${r.new}/${r.runs} | ${r.runs} | ${r.verdict} |`);
  lines.push("", "### Full loops", "", "| Brief | Route | Plugin | Docs | Model | Spec reviews | Open Questions | Body size per pass | Growth |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [key, l] of Object.entries(d.loops)) {
    const [brief, route] = key.split("/");
    lines.push(`| ${brief} | ${route} | \`${short(l.plugin)}\` | \`${short(l.docs)}\` | ${l.model ?? "unknown"} | ${l.executed ? `${l.reviews}${l.clean ? "" : " (cap)"}` : "failed"} | ${l.questions} | ${l.bodySizes.join(", ")} | ${l.growth} |`);
  }
  lines.push("", "```replay-data", JSON.stringify(d), "```", "");
  return lines.join("\n");
}

function totals(cases: CaseData[]): string {
  const sum = (brief: "old" | "new", field: "reviews" | "questions" | "growth") => cases.reduce((total, c) =>
    total + Object.entries(c.loops).filter(([key]) => key.startsWith(`${brief}/`)).reduce((t, [, l]) => t + l[field], 0), 0);
  const failing = cases.flatMap((c) => Object.entries(c.retention).flatMap(([route, labels]) => Object.entries(labels).filter(([, r]) => r.verdict === "fail").map(([label]) => `${c.case} ${route} ${label}`)));
  const [oldReviews, newReviews, oldQ, newQ, oldG, newG] = [sum("old", "reviews"), sum("new", "reviews"), sum("old", "questions"), sum("new", "questions"), sum("old", "growth"), sum("new", "growth")];
  const growthOk = oldG <= 0 ? newG <= oldG : newG * 2 <= oldG;
  return ["## Totals", "", `Cases: ${cases.map((c) => c.case).join(", ")}.`, "",
    "| Measure | Old | New | Condition | Met |", "| --- | --- | --- | --- | --- |",
    `| Spec reviews | ${oldReviews} | ${newReviews} | new at most half of old | ${newReviews * 2 <= oldReviews ? "yes" : "no"} |`,
    `| Open Questions | ${oldQ} | ${newQ} | new fewer than old | ${newQ < oldQ ? "yes" : "no"} |`,
    `| Body growth | ${oldG} | ${newG} | new at most half of old, or no larger when old is zero or less | ${growthOk ? "yes" : "no"} |`,
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
  const results = resolve(o.results ?? join(import.meta.dir, "..", "evidence", "proportional-review", "results.md"));
  const privateRuns = join(caseDir, "runs");
  mkdirSync(privateRuns, { recursive: true });

  const plugins = { old: extractPlugin(tree, need(o, "old-plugin")), new: extractPlugin(tree, need(o, "new-plugin")) };
  const briefs: Record<"old" | "new", Brief> = {
    old: { name: "old", plugin: git(tree, "rev-parse", need(o, "old-plugin")).trim(), pluginDir: plugins.old.dir, docs: git(docs, "rev-parse", base).trim() },
    new: { name: "new", plugin: git(tree, "rev-parse", need(o, "new-plugin")).trim(), pluginDir: plugins.new.dir, docs: git(docs, "rev-parse", head).trim() },
  };
  const data: CaseData = { case: config.case, approvedAt: approval.at, terms: "pass", briefs: { old: { plugin: briefs.old.plugin, docs: briefs.old.docs }, new: { plugin: briefs.new.plugin, docs: briefs.new.docs } }, firstPasses: {}, retention: {}, loops: {} };
  try {
    for (const route of ROUTES.filter((r) => underTest.includes(r))) {
      const model = routes[route].model;
      const once = async (brief: Brief, kind: RunRequest["kind"]) => {
        const prepared = prepareClone(config, brief, route, routes);
        try { return await execute({ kind, route, model, brief, clone: prepared.clone, commit: prepared.commit, document: config.document, caseDir, maxReviews: MAX_REVIEWS, ...(routes.author ? { authorModel: routes.author.model } : {}) }); }
        finally { prepared.dispose(); }
      };
      if (only !== "loops") {
        const sets: Record<"old" | "new", PassSet> = { old: { counted: 0, failed: 0, excluded: 0, runs: [], hits: new Map() }, new: { counted: 0, failed: 0, excluded: 0, runs: [], hits: new Map() } };
        const pass = (name: "old" | "new", want: number) => firstPasses(want, sets[name], () => once(briefs[name], "first-pass"), { route, model, plugin: briefs[name].plugin, docs: briefs[name].docs }, labels, match, caseDir,
          (n, text, verdicts) => {
            writeFileSync(join(privateRuns, `${name}-${route}-pass-${n}.txt`), text);
            if (verdicts !== undefined) writeFileSync(join(privateRuns, `${name}-${route}-pass-${n}.verdicts.json`), `${JSON.stringify(verdicts, null, 2)}\n`);
          });
        await pass("old", FIRST_PASSES.old);
        await pass("new", FIRST_PASSES.new);
        const verdicts: CaseData["retention"][string] = {};
        const failing = () => labels.filter((label) => { const r = retention(label, sets.old.hits.get(label.id) ?? [], sets.new.hits.get(label.id) ?? []); return r.old >= 2 && r.new === 0; });
        if (failing().length) await pass("new", FIRST_PASSES.confirm);
        for (const label of labels) {
          const r = retention(label, sets.old.hits.get(label.id) ?? [], sets.new.hits.get(label.id) ?? []);
          verdicts[label.id] = { ...r, runs: sets.new.counted, verdict: r.old === 0 ? "not raised by old" : r.old >= 2 && r.new === 0 ? "fail" : "pass" };
        }
        for (const name of ["old", "new"] as const) data.firstPasses[`${name}/${route}`] = { counted: sets[name].counted, failed: sets[name].failed, excluded: sets[name].excluded, runs: sets[name].runs };
        data.retention[route] = verdicts;
      }
      if (only !== "first-passes") {
        for (const name of ["old", "new"] as const) {
          const result = await once(briefs[name], "loop");
          const identityOk = result.executed && result.route === route && result.model === model && result.plugin === briefs[name].plugin && result.docs === briefs[name].docs;
          const documents = result.documents ?? [];
          documents.forEach((doc, i) => writeFileSync(join(privateRuns, `${name}-${route}-loop-${i}.md`), doc));
          const sizes = documents.map(bodySize);
          data.loops[`${name}/${route}`] = { executed: identityOk, reviews: Math.min(Math.max(documents.length - 1, 0), MAX_REVIEWS), questions: result.questions ?? 0,
            bodySizes: sizes, growth: sizes.length ? sizes.at(-1)! - sizes[0] : 0, clean: result.clean ?? documents.length - 1 <= MAX_REVIEWS, model: result.model, plugin: result.plugin, docs: result.docs };
          if (!identityOk) throw new Error(`stopped: the ${name} loop on the ${route} route ${result.executed ? "reported another route, model or brief" : "failed to execute"}; rerun it`);
        }
      }
    }
  } finally {
    plugins.old.dispose(); plugins.new.dispose();
  }
  const resultHits = termsCheck(config.terms, { files: existsSync(results) ? [results] : [] });
  writeResults(results, data);
  const after = termsCheck(config.terms, { files: [results] });
  if (after.length || resultHits.length) throw new Error("stopped: the terms check found a case term in the results file");
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
    file: { type: "string", multiple: true },
  } });
  const command = positionals[0];
  if (command === "run") { await runCase(values as Record<string, string | undefined>); return 0; }
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
