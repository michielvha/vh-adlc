// Codex CLI-specific evidence adapter. Read host logs, never a participant's
// claim of dispatch. Unsupported log shapes leave review unverified.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { git } from "./fixtures";

export type ReviewReceipt = {
  pass: boolean; reason: string; parentThread?: string; reviewerThread?: string;
  target?: string; model?: string; recordPath?: string; reviewerLogHash?: string;
  isolation?: "procedural";
};
function lines(path: string): any[] {
  return readFileSync(path, "utf8").split("\n").flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}
function logs(dir: string, depth = 0): string[] {
  if (!existsSync(dir) || depth > 6) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? logs(join(dir, e.name), depth + 1)
      : e.isFile() && e.name.endsWith(".jsonl") ? [join(dir, e.name)] : []);
}
function section(text: string, name: string): string | undefined {
  return text.match(new RegExp(`^## ${name}[^\\S\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"))?.[1];
}
function sameDirectory(a: unknown, b: string): boolean {
  try { return typeof a === "string" && realpathSync(a) === realpathSync(b); } catch { return false; }
}

export function verifyMaintenanceReview(project: string, sessions: string, parentThread: string, affectedPaths: string[]): ReviewReceipt {
  const fail = (reason: string): ReviewReceipt => ({ pass: false, reason });
  if (!parentThread || !affectedPaths.length) return fail("missing trial identity or affected paths");
  try {
    const records = git(project, "ls-files", "--cached", "--others", "--exclude-standard", "docs/internal/maintenance").split("\n").filter(Boolean);
    const paths = [...new Set(records)].filter((p) => p.endsWith(".md"));
    if (paths.length !== 1) return fail("expected one maintenance record");
    const recordPath = paths[0];
    const record = readFileSync(join(project, recordPath), "utf8");
    const reviews = section(record, "Reviews");
    const entries = [...record.matchAll(/^### (R-\d+)[ \t]*\n/gm)];
    const entry = entries.at(-1);
    const latest = entry ? record.slice(entry.index! + entry[0].length).split(/^## |^### R-/m)[0] : reviews ?? "";
    const named = entry && record.match(new RegExp(`^${entry[1]} (?:target:|reviewed) ([0-9a-f]{40})\\. Model: ([^\\s.]+)\\. Isolation: (?:procedural|structural|unknown)\\.[ \\t]*$`, "m"));
    const target = latest.match(/^Target: ([0-9a-f]{40})\s*$/m)?.[1] ?? named?.[1];
    if (!target) return fail("no exact review target in the record");
    const model = latest.match(/^Model: ([^\s()]+)(?:[ \t]+\([^\n]*\)\.?)?[ \t]*$/m)?.[1] ?? named?.[2];
    const stored = latest.match(/^```text\n([\s\S]*?)\n```/m)?.[1] ?? (latest.trim() === "NO FINDINGS" ? "NO FINDINGS" : undefined);
    if (!model || stored !== "NO FINDINGS") return fail("no clean, well-formed stored review");
    const definition = section(record, "Definition");
    const reviewed = git(project, "show", `${target}:${recordPath}`);
    if (!definition || definition !== section(reviewed, "Definition")) return fail("maintenance Definition changed after review");
    git(project, "merge-base", "--is-ancestor", target, "HEAD");
    if (git(project, "diff", target, "--", ...affectedPaths)) return fail("affected source changed after review");

    return verifyNativeReturn(project, sessions, parentThread, target, model, stored, recordPath,
      "references/maintenance-review.md", "# Independent maintenance review");
  } catch {
    return fail("native review evidence is missing, malformed or refers to unavailable committed state");
  }
}

function verifyNativeReturn(project: string, sessions: string, parentThread: string, target: string, model: string,
  stored: string, recordPath: string, contractPath: string, contractHeading: string): ReviewReceipt {
  const fail = (reason: string): ReviewReceipt => ({ pass: false, reason });
  const contractName = contractPath.split("/").at(-1)!.replace(/\.md$/, "");
    const native = logs(sessions).map((path) => {
      const rows = lines(path);
      // The first metadata names this native rollout. A fork can replay its
      // parent's metadata later; that inherited history is not its identity.
      const meta = rows.find((r) => r.type === "session_meta")?.payload;
      return { path, rows, meta };
    });
    const parent = native.find((log) => log.meta?.id === parentThread && log.meta.source === "exec" && sameDirectory(log.meta.cwd, project));
    if (!parent) return fail("native parent session is unavailable");
    const dispatches = parent.rows.filter((r) => r.type === "response_item" && r.payload?.type === "function_call" && r.payload.name === "spawn_agent");
    for (const log of native) {
      const meta = log.meta;
      if (meta?.source?.subagent?.thread_spawn?.parent_thread_id !== parentThread || meta.id === parentThread || !sameDirectory(meta.cwd, project)) continue;
      const completed = log.rows.filter((r) => r.type === "event_msg" && r.payload.type === "task_complete").at(-1)?.payload;
      const returned = completed?.last_agent_message?.match(/^MODEL: ([^\n]+)\n([\s\S]*)$/);
      if (!completed?.turn_id || !completed.root_turn_id || returned?.[1] !== model || returned[2].trim() !== stored) continue;
      if (!dispatches.some((r) => {
        if (r.payload.internal_chat_message_metadata_passthrough?.turn_id !== completed.root_turn_id) return false;
        try { return !("model" in JSON.parse(r.payload.arguments)); } catch { return false; }
      })) continue;
      const calls = log.rows.filter((r) => r.type === "response_item" && ["custom_tool_call", "function_call"].includes(r.payload?.type)
        && r.payload.internal_chat_message_metadata_passthrough?.turn_id === completed.turn_id)
        .map((r) => String(r.payload.input ?? r.payload.arguments ?? "")).join("\n");
      const ownOutputs = log.rows.filter((r) => r.type === "response_item" && ["custom_tool_call_output", "function_call_output"].includes(r.payload?.type)
        && r.payload.internal_chat_message_metadata_passthrough?.turn_id === completed.turn_id)
        .map((r) => JSON.stringify(r.payload.output)).join("\n");
      const inspectedTarget = calls.includes(target) || /git\s+rev-parse\s+(?:--verify\s+)?HEAD\b/.test(calls) && ownOutputs.includes(target)
        || /git (?:show|diff|rev-parse)/.test(calls)
        && [...calls.matchAll(/(?<![0-9a-f])([0-9a-f]{7,39})(?![0-9a-f])/g)].some((m) => {
          try { return git(project, "rev-parse", "--verify", `${m[1]}^{commit}`) === target; } catch { return false; }
        });
      const contractRead = calls.includes(contractPath)
        || calls.includes(contractName) && ownOutputs.includes(contractHeading);
      if (!inspectedTarget || !calls.includes(recordPath) || !contractRead) continue;
      return {
        pass: true, reason: "linked native reviewer returned the exact stored review and inspected its committed target",
        parentThread, reviewerThread: meta.id, target, model, recordPath, isolation: "procedural",
        reviewerLogHash: createHash("sha256").update(readFileSync(log.path)).digest("hex"),
      };
    }
    return fail("no linked completed reviewer establishes the stored review and target");
}

// This evaluator's accepted-feature fixture has one criterion and two covered
// source paths. Keep that contract explicit rather than interpreting arbitrary
// feature documents with a second general-purpose gate implementation.
export function verifyFeatureReview(project: string, sessions: string, parentThread: string): ReviewReceipt {
  const fail = (reason: string): ReviewReceipt => ({ pass: false, reason });
  try {
    const recordPath = "docs/specs/shout.md";
    const doc = readFileSync(join(project, recordPath), "utf8");
    const rows = [...doc.matchAll(/^\|[^\n]*\| (R-\d+) \| implementation \| `?([0-9a-f]{40})`? \| ([^|]+) \| (?:procedural|structural|unknown) \|[^\n]*$/gm)];
    const latest = rows.at(-1);
    if (!latest) return fail("no exact implementation review row");
    const [, id, target, modelField] = latest;
    const model = modelField.trim().split(/\s|\(/)[0];
    const stored = doc.match(new RegExp(`^### ${id}\\s*\\n([\\s\\S]*?)(?=^### R-|$(?![\\s\\S]))`, "m"))?.[1].trim();
    const criterion = section(doc, "Acceptance Criteria")?.match(/^- \[[ x]\] AC-01: (.+)$/m)?.[1];
    if (!stored || !criterion || !stored.startsWith(`CRITERION: AC-01 ${criterion}\nVERDICT: met\nEVIDENCE: `)
      || (stored.match(/^CRITERION:/gm) ?? []).length !== 1) return fail("missing or non-met exact fixture criterion record");
    git(project, "merge-base", "--is-ancestor", target, "HEAD");
    if (git(project, "diff", target, "--", "greet.sh", "test.sh")) return fail("feature source changed after review");
    const reviewed = git(project, "show", `${target}:${recordPath}`);
    for (const name of ["Scope", "Design", "Acceptance Criteria", "Test Plan"]) {
      const normalize = (value: string | undefined) => value?.replace(/^- \[[ x]\] /gm, "- [ ] ").replace(/^ +(?:Evidence|Residual):.*\n/gm, "").trim();
      if (normalize(section(reviewed, name)) !== normalize(section(doc, name))) return fail("accepted fixture baseline changed after review");
    }
    return verifyNativeReturn(project, sessions, parentThread, target, model, stored, recordPath,
      "agents/vh-adlc-reviewer.agent.md", "name: vh-adlc-reviewer");
  } catch { return fail("feature review evidence is missing, malformed or unavailable"); }
}
