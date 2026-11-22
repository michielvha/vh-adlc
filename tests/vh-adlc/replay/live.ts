// The live executor and matcher for the replay harness (tests/vh-adlc/replay/run.ts): real reviewers on
// the Codex command route and the Claude host route, a scripted owner for full loops, and an independent
// Claude matcher. Not part of `bun test`: every call here is a real model run. The harness hands each run
// a throwaway clone at X' whose origin is a throwaway bare repository.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { claude, profile } from "../scenarios/host";
import type { Executor, Label, Match, RunRequest, RunResult } from "./run";

const HOUR = 3_600_000;
const MATCHER_MODEL = process.env.REPLAY_MATCHER_MODEL ?? "opus";

function sh(argv: string[], cwd: string, timeout = HOUR): { code: number; out: string; err: string } {
  const r = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe", timeout });
  return { code: r.exitCode ?? -1, out: r.stdout.toString(), err: r.stderr.toString() };
}
const git = (clone: string, ...args: string[]) => sh(["git", "-C", clone, ...args], clone).out.trim();
const docAt = (clone: string, ref: string, doc: string) => sh(["git", "-C", clone, "show", `${ref}:${doc}`], clone).out;

function binary(pluginDir: string): string {
  const r = sh(["bash", join(pluginDir, "scripts", "ensure-vh-adlc.sh")], pluginDir);
  if (r.code !== 0) throw new Error("the brief's plugin could not provide its verified binary");
  return r.out.trim().split("\n").at(-1)!;
}
function pin(pluginDir: string): string {
  const m = /Pass `([0-9a-f]{40})` as `--plugin-pin`/.exec(readFileSync(join(pluginDir, "knowledge.md"), "utf8"));
  if (!m) throw new Error("the brief's knowledge.md names no plugin pin");
  return m[1];
}
function routeIn(r: RunRequest): string {
  const out = sh(["bun", join(r.brief.pluginDir, "scripts", "loop", "cli.ts"), "route", "--repo", r.clone, "--operation", "spec review"], r.clone);
  try { return JSON.parse(out.out).route as string; } catch { return "unknown"; }
}

type Row = { review: string; commit: string; model: string };
/** Spec review rows that are not acceptances, in document order. */
function specRows(doc: string): Row[] {
  return doc.split("\n").flatMap((line) => {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 8 || !/^R-\d+$/.test(cells[2]) || cells[3] !== "spec" || cells[7] === "accepted by owner") return [];
    return [{ review: cells[2], commit: cells[4].replace(/`/g, ""), model: cells[5] }];
  });
}
function recordsOf(doc: string, review: string): string {
  const start = doc.indexOf(`\n### ${review}\n`);
  if (start < 0) return "";
  const rest = doc.slice(start + review.length + 6);
  const end = rest.search(/\n### R-\d+\n|\n## /);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}
const questions = (doc: string) => (doc.match(/^### Q\d+: /gm) ?? []).length;

const OWNER = `This is a replay with a scripted owner, run in a throwaway clone. Whenever the procedure asks the owner
anything, take the option you recommend as the owner's answer without waiting: adopt every Open Question's
recommendation, and answer a proportionality question with "keep going". Follow the procedure otherwise.
Never ask the owner to accept the document; stop when a spec review is clean and Open Questions is empty.`;

function session(r: RunRequest, prompt: string) {
  const p = profile(homedir());
  try {
    return claude(p, prompt, { cwd: r.clone, pluginDirs: [r.brief.pluginDir], model: r.authorModel, maxTurns: 200, timeoutMs: 2 * HOUR });
  } finally { p.dispose(); }
}

async function commandFirstPass(r: RunRequest, identity: { plugin: string; docs: string }): Promise<RunResult> {
  const out = sh(["bun", join(r.brief.pluginDir, "scripts", "loop", "cli.ts"), "review", "--repo", r.clone, "--document", r.document, "--commit", r.commit,
    "--kind", "spec", "--docs-revision", r.brief.docs, "--binary", binary(r.brief.pluginDir), "--plugin-pin", pin(r.brief.pluginDir)], r.clone, 2 * HOUR);
  let json: Record<string, unknown>;
  try { json = JSON.parse(out.out.trim().split("\n").at(-1) ?? ""); } catch { return { executed: false, failure: "the review command printed no result", ...identity }; }
  if (json.status === "host") return { executed: true, route: "host", model: String(json.model ?? "unknown"), records: "", ...identity };
  if (json.status !== "ready") return { executed: false, failure: `review ${String(json.status)}: ${String(json.reason ?? "")}`, ...identity };
  return { executed: true, route: "command", model: String(json.model), records: String(json.records), ...identity };
}

async function hostFirstPass(r: RunRequest, identity: { plugin: string; docs: string }): Promise<RunResult> {
  const turn = session(r, `/vh-adlc-spec review ${r.document}\n\n${OWNER}\nThis run needs only the first spec review: once its records and Review Log row are stored and committed, stop without revising the document.`);
  const doc = docAt(r.clone, "HEAD", r.document);
  const rows = specRows(doc).filter((row) => !specRows(docAt(r.clone, r.commit, r.document)).some((old) => old.review === row.review));
  if (turn.isError || rows.length === 0) return { executed: false, failure: turn.isError ? "the session ended in an error" : "no spec review was stored", ...identity };
  return { executed: true, route: routeIn(r), model: rows[0].model, records: recordsOf(doc, rows[0].review), ...identity };
}

function clean(r: RunRequest): boolean {
  const out = sh([binary(r.brief.pluginDir), "gate", "planned", r.document, "--repo", r.clone, "--plugin-pin", pin(r.brief.pluginDir)], r.clone);
  try {
    const failing = JSON.parse(out.out).data?.failing as string[] | undefined;
    return Array.isArray(failing) && failing.length === 1 && failing[0] === "accepted";
  } catch { return false; }
}

async function loop(r: RunRequest, identity: { plugin: string; docs: string }): Promise<RunResult> {
  const before = specRows(docAt(r.clone, r.commit, r.document)).map((row) => row.review);
  const newRows = () => specRows(docAt(r.clone, "HEAD", r.document)).filter((row) => !before.includes(row.review));
  let stalled = 0, reachedClean = false;
  while (newRows().length < r.maxReviews) {
    const count = newRows().length;
    const prompt = count === 0 ? `/vh-adlc-spec review ${r.document}\n\n${OWNER}`
      : `/vh-adlc-spec review ${r.document}\n\n${OWNER}\nContinue from the stored reviews: apply the latest pass as the procedure says, then run the next spec review.`;
    const turn = session(r, prompt);
    if (newRows().length > count && clean(r)) { reachedClean = true; break; }
    stalled = newRows().length > count ? 0 : stalled + 1;
    if (stalled >= 2) return { executed: false, failure: turn.isError ? "the session ended in an error twice" : "two sessions in a row stored no spec review", ...identity };
  }
  const rows = newRows();
  const documents = [docAt(r.clone, r.commit, r.document), ...rows.map((row) => docAt(r.clone, row.commit, r.document))];
  // Questions the author raised: every increase in Open Questions between consecutive commits since X'.
  const commits = git(r.clone, "rev-list", "--reverse", `${r.commit}..HEAD`, "--", r.document).split("\n").filter(Boolean);
  let raised = 0, previous = questions(documents[0]);
  for (const commit of commits) { const now = questions(docAt(r.clone, commit, r.document)); raised += Math.max(0, now - previous); previous = now; }
  const models = [...new Set(rows.map((row) => row.model))];
  return { executed: true, route: routeIn(r), model: models.length === 1 ? models[0] : `mixed: ${models.join(", ")}`, documents, questions: raised, clean: reachedClean, ...identity };
}

export const execute: Executor = async (r) => {
  const identity = { plugin: r.brief.plugin, docs: r.brief.docs };
  try {
    if (r.kind === "loop") return await loop(r, identity);
    return r.route === "command" ? await commandFirstPass(r, identity) : await hostFirstPass(r, identity);
  } catch (error) {
    return { executed: false, failure: (error as Error).message, ...identity };
  }
};

/** An independent Claude session matches findings to labels from labels.md; the harness stores its verdicts beside each run. */
export const match: Match = async ({ records, labels, caseDir }) => {
  if (!records.trim() || records.trim() === "NO FINDINGS") return [];
  const dir = mkdtempSync(join(tmpdir(), "vh-replay-match-"));
  try {
    writeFileSync(join(dir, "records.txt"), records);
    writeFileSync(join(dir, "labels.md"), readFileSync(join(caseDir, "labels.md"), "utf8"));
    const ids = labels.map((label: Label) => label.id).join(", ");
    const prompt = `You match spec review findings to labelled defects. Read labels.md and records.txt in the current directory.
For each FINDING record, decide which labels (${ids}) it raises, using each label's Match line strictly, with its
Matches and Does not match examples. A finding may raise several labels or none. Reply with only a JSON array of
objects {"finding": "F-nn", "label": "L-nn", "severity": "<the finding's SEVERITY>"}, and [] when none match.`;
    const p = profile(homedir());
    try {
      const turn = claude(p, prompt, { cwd: dir, model: MATCHER_MODEL, maxTurns: 20, timeoutMs: HOUR });
      const json = /\[[\s\S]*\]/.exec(turn.result)?.[0];
      if (turn.isError || !json) throw new Error("the matcher returned no verdicts");
      const verdicts = JSON.parse(json) as { finding: string; label: string; severity: string }[];
      return verdicts.map(({ label, severity }) => ({ label, severity }));
    } finally { p.dispose(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
