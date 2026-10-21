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
    const targets = [...(reviews ?? "").matchAll(/^Target: ([0-9a-f]{40})\s*$/gm)];
    const target = targets.at(-1)?.[1];
    if (!target) return fail("no exact review target in the record");
    const latest = reviews!.slice(targets.at(-1)!.index);
    const model = latest.match(/^Model: ([^\n]+)$/m)?.[1].trim();
    const stored = latest.match(/^```text\n([\s\S]*?)\n```/m)?.[1];
    if (!model || stored !== "NO FINDINGS") return fail("no clean, well-formed stored review");
    const definition = section(record, "Definition");
    const reviewed = git(project, "show", `${target}:${recordPath}`);
    if (!definition || definition !== section(reviewed, "Definition")) return fail("maintenance Definition changed after review");
    git(project, "merge-base", "--is-ancestor", target, "HEAD");
    if (git(project, "diff", target, "--", ...affectedPaths)) return fail("affected source changed after review");

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
      if (!completed?.turn_id || !completed.root_turn_id || completed.last_agent_message !== `MODEL: ${model}\n${stored}`) continue;
      if (!dispatches.some((r) => {
        if (r.payload.internal_chat_message_metadata_passthrough?.turn_id !== completed.root_turn_id) return false;
        try { return !("model" in JSON.parse(r.payload.arguments)); } catch { return false; }
      })) continue;
      const calls = log.rows.filter((r) => r.type === "response_item" && ["custom_tool_call", "function_call"].includes(r.payload?.type)
        && r.payload.internal_chat_message_metadata_passthrough?.turn_id === completed.turn_id)
        .map((r) => String(r.payload.input ?? r.payload.arguments ?? "")).join("\n");
      const inspectedTarget = calls.includes(target) || /git (?:show|diff|rev-parse)/.test(calls)
        && [...calls.matchAll(/(?<![0-9a-f])([0-9a-f]{7,39})(?![0-9a-f])/g)].some((m) => {
          try { return git(project, "rev-parse", "--verify", `${m[1]}^{commit}`) === target; } catch { return false; }
        });
      if (!inspectedTarget || !calls.includes(recordPath) || !calls.includes("references/maintenance-review.md")) continue;
      return {
        pass: true, reason: "linked native reviewer returned the stored clean review; source and Definition remain current",
        parentThread, reviewerThread: meta.id, target, model, recordPath, isolation: "procedural",
        reviewerLogHash: createHash("sha256").update(readFileSync(log.path)).digest("hex"),
      };
    }
    return fail("no linked completed reviewer establishes the stored review and target");
  } catch {
    return fail("native review evidence is missing, malformed or refers to unavailable committed state");
  }
}
