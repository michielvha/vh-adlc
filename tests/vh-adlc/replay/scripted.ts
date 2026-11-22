// A scripted executor for the replay harness tests: no model call. REPLAY_SCRIPT names a JSON file
// that lists, per brief and route, the outcome of each run in order, and a log file the harness's calls
// are appended to. The matcher maps a finding to a label when its EVIDENCE names the label ID.
import { appendFileSync, readFileSync } from "node:fs";
import type { Executor, Match, RunRequest, RunResult } from "./run";

type Scripted = { fail?: string; route?: string; model?: string; records?: string; docs?: string[]; questions?: number };
type Script = { log: string; runs: Record<string, Scripted[]>; loops?: Record<string, Scripted> };

const script = (): Script => JSON.parse(readFileSync(process.env.REPLAY_SCRIPT!, "utf8"));
const used = new Map<string, number>();

export const execute: Executor = async (request: RunRequest): Promise<RunResult> => {
  const s = script();
  const key = `${request.brief.name}/${request.route}`;
  const at = (...args: string[]) => Bun.spawnSync(["git", "-C", request.clone, ...args], { stdout: "pipe" }).stdout.toString().trim();
  appendFileSync(s.log, JSON.stringify({ kind: request.kind, key, plugin: request.brief.plugin, docs: request.brief.docs,
    origin: at("remote", "get-url", "origin"), branch: at("branch", "--show-current"), head: at("rev-parse", "HEAD"), commit: request.commit,
    agents: at("show", "HEAD:AGENTS.md"), loop: at("show", "HEAD:.vh-adlc/loop.yaml") }) + "\n");
  const identity = { plugin: request.brief.plugin, docs: request.brief.docs };
  if (request.kind === "loop") {
    const loop = s.loops?.[key];
    if (!loop || loop.fail) return { executed: false, failure: loop?.fail ?? "no scripted loop", ...identity };
    return { executed: true, route: loop.route ?? request.route, model: loop.model ?? request.model, ...identity, documents: loop.docs ?? [], questions: loop.questions ?? 0 };
  }
  const n = used.get(key) ?? 0;
  used.set(key, n + 1);
  const run = s.runs[key]?.[n] ?? s.runs[key]?.at(-1);
  if (!run || run.fail) return { executed: false, failure: run?.fail ?? "no scripted run", ...identity };
  return { executed: true, route: run.route ?? request.route, model: run.model ?? request.model, ...identity, records: run.records ?? "NO FINDINGS" };
};

export const match: Match = async ({ records, labels }) => {
  const hits: { label: string; severity: string }[] = [];
  for (const block of records.split(/\n(?=FINDING: )/)) {
    const severity = /^SEVERITY: (\S+)/m.exec(block)?.[1];
    const evidence = /^EVIDENCE: (.*)$/m.exec(block)?.[1] ?? "";
    for (const label of labels) if (severity && evidence.includes(label.id)) hits.push({ label: label.id, severity });
  }
  return hits;
};
