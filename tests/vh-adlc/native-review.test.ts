import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, git } from "./lifecycle/fixtures";
import { verifyMaintenanceReview } from "./lifecycle/native-review";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vh-native-review-"));
  roots.push(root);
  const f = buildDiagnostic(root, "L06");
  const sessions = join(root, "sessions");
  mkdirSync(sessions);
  mkdirSync(join(f.project, "docs/internal/maintenance"), { recursive: true });
  const path = "docs/internal/maintenance/greeting.md";
  const definition = "## Definition\n\nOutcome: restore the name.\nAffected paths: greet.sh, test.sh.\n\n";
  writeFileSync(join(f.project, path), "# Maintenance\n\n" + definition + "## Evidence\n\nObserved checks.\n");
  writeFileSync(join(f.project, "greet.sh"), 'printf "Hello, %s.\\n" "${1-world}"\n');
  git(f.project, "add", "greet.sh", path);
  git(f.project, "commit", "-qm", "fix: restore name", "--", "greet.sh", path);
  const target = git(f.project, "rev-parse", "HEAD");
  const record = readFileSync(join(f.project, path), "utf8") + `\n## Reviews\n\nTarget: ${target}\nModel: unknown\nIsolation: procedural\n\n\x60\x60\x60text\nNO FINDINGS\n\x60\x60\x60\n`;
  writeFileSync(join(f.project, path), record);
  const parent = [
    { type: "session_meta", payload: { id: "parent", cwd: f.project, source: "exec" } },
    { type: "response_item", payload: { type: "function_call", name: "spawn_agent", arguments: JSON.stringify({ task_name: "maintenance_review", message: "opaque dispatch" }), internal_chat_message_metadata_passthrough: { turn_id: "parent-turn" } } },
  ];
  const child = [
    { type: "session_meta", payload: { id: "reviewer", cwd: f.project, source: { subagent: { thread_spawn: { parent_thread_id: "parent", depth: 1 } } } } },
    { type: "response_item", payload: { type: "custom_tool_call", input: `git show ${target}; cat ${path} references/maintenance-review.md`, internal_chat_message_metadata_passthrough: { turn_id: "review-turn" } } },
    { type: "event_msg", payload: { type: "task_complete", last_agent_message: "MODEL: unknown\nNO FINDINGS", turn_id: "review-turn", root_turn_id: "parent-turn" } },
  ];
  function logs() {
    writeFileSync(join(sessions, "parent.jsonl"), parent.map(JSON.stringify).join("\n") + "\n");
    writeFileSync(join(sessions, "reviewer.jsonl"), child.map(JSON.stringify).join("\n") + "\n");
  }
  logs();
  const verify = () => verifyMaintenanceReview(f.project, sessions, "parent", ["greet.sh", "test.sh"]);
  return { f, sessions, path, target, parent, child, logs, verify };
}

test("a linked native reviewer return establishes independence without attesting a model", () => {
  const f = fixture();
  const result = f.verify();
  expect(result.pass).toBe(true);
  expect(result.model).toBe("unknown");
  expect(result.reviewerThread).toBe("reviewer");
});

test("blank lines outside returned records preserve their exact content", () => {
  const f = fixture();
  f.child[2].payload.last_agent_message = "MODEL: unknown\n\nNO FINDINGS\n";
  f.logs();
  expect(f.verify().pass).toBe(true);
  f.child[2].payload.last_agent_message = "MODEL: unknown\n\nNO FINDINGS after editing";
  f.logs();
  expect(f.verify().pass).toBe(false);
});

test("explicit review-ID metadata can accompany a bare verbatim returned record", () => {
  const f = fixture();
  const path = join(f.f.project, f.path);
  const record = readFileSync(path, "utf8");
  writeFileSync(path, record.replace("## Reviews", `R-1 target: ${f.target}. Model: unknown. Isolation: procedural.\n\n## Reviews`)
    .replace(`Target: ${f.target}\nModel: unknown\nIsolation: procedural\n\n\x60\x60\x60text\nNO FINDINGS\n\x60\x60\x60`, "### R-1\n\nNO FINDINGS"));
  expect(f.verify().pass).toBe(true);
  writeFileSync(path, readFileSync(path, "utf8").replace("R-1 target:", "R-2 target:"));
  expect(f.verify().pass).toBe(false);
});

test("the latest explicitly bound review may follow completion bookkeeping", () => {
  const f = fixture(), path = join(f.f.project, f.path);
  const record = readFileSync(path, "utf8");
  writeFileSync(path, record.slice(0, record.indexOf("## Reviews")) + `## Reviews\n\n### R-1\n\nHistorical finding retained.\n\n## State\n\nComplete locally.\n\nR-2 reviewed ${f.target}. Model: unknown. Isolation: procedural.\n\n### R-2\n\nNO FINDINGS\n`);
  expect(f.verify().pass).toBe(true);
  writeFileSync(path, readFileSync(path, "utf8").replace("R-2 reviewed", "R-1 reviewed"));
  expect(f.verify().pass).toBe(false);
});

test.each(["prose", "table"])("explicit %s metadata binds the latest bare review", (format) => {
  const f = fixture(), path = join(f.f.project, f.path);
  const record = readFileSync(path, "utf8");
  const metadata = format === "prose"
    ? `R-2 target: ${f.target}. Model: unknown. Isolation: procedural. Model identity was not attested.`
    : `| Review | Target | Model | Isolation | Outcome |\n| --- | --- | --- | --- | --- |\n| R-2 | ${f.target} | unknown | procedural | No findings |`;
  writeFileSync(path, record.slice(0, record.indexOf("## Reviews")) + metadata + "\n\n## Reviews\n\n### R-1\n\nHistorical finding.\n\n### R-2\n\nNO FINDINGS\n");
  expect(f.verify().pass).toBe(true);
  writeFileSync(path, readFileSync(path, "utf8").replace(format === "prose" ? "R-2 target:" : "| R-2 |", format === "prose" ? "R-1 target:" : "| R-1 |"));
  expect(f.verify().pass).toBe(false);
});

test("an independent reviewer retains its own contract context during re-review", () => {
  const f = fixture();
  f.child[1].payload.input = "cat references/maintenance-review.md";
  f.child[1].payload.internal_chat_message_metadata_passthrough.turn_id = "old-review-turn";
  f.child[2].payload.turn_id = "old-review-turn";
  f.child[2].payload.last_agent_message = "MODEL: unknown\nFINDING: F-01\nEarlier defect.";
  f.child.push({ type: "response_item", payload: { type: "custom_tool_call", input: `git show ${f.target}; cat ${f.path}`, internal_chat_message_metadata_passthrough: { turn_id: "new-review-turn" } } } as any);
  f.child.push({ type: "event_msg", payload: { type: "task_complete", last_agent_message: "MODEL: unknown\nNO FINDINGS", turn_id: "new-review-turn", root_turn_id: "parent-turn" } } as any);
  f.logs();
  expect(f.verify().pass).toBe(true);
  f.child[1].payload.internal_chat_message_metadata_passthrough.turn_id = "parent-turn";
  f.child.splice(1, 0, { type: "event_msg", payload: { type: "task_complete", last_agent_message: "MODEL: unknown\nNO FINDINGS", turn_id: "parent-turn", root_turn_id: "parent-turn" } } as any);
  f.logs();
  expect(f.verify().pass).toBe(false);
});

test("bookkeeping after review preserves freshness but source drift does not", () => {
  const f = fixture();
  writeFileSync(join(f.f.project, f.path), readFileSync(join(f.f.project, f.path), "utf8") + "\n## State\n\nComplete locally.\n");
  expect(f.verify().pass).toBe(true);
  writeFileSync(join(f.f.project, "greet.sh"), "exit 0\n");
  expect(f.verify().pass).toBe(false);
});

test("forked history does not make a guardian log the parent session", () => {
  const f = fixture();
  const guardian = [{ type: "session_meta", payload: { id: "guardian", cwd: f.f.project, source: { subagent: { other: "guardian" } } } }, f.parent[0]];
  writeFileSync(join(f.sessions, "aaa-guardian.jsonl"), guardian.map((r) => JSON.stringify(r)).join("\n"));
  expect(f.verify().pass).toBe(true);
});

test("inherited parent history alone is not a live parent session receipt", () => {
  const f = fixture();
  const inherited = [{ type: "session_meta", payload: { id: "guardian", cwd: f.f.project, source: { subagent: { other: "guardian" } } } }, f.parent[0], f.parent[1]];
  writeFileSync(join(f.sessions, "parent.jsonl"), inherited.map((r) => JSON.stringify(r)).join("\n"));
  expect(f.verify().pass).toBe(false);
});

test("a changed Definition invalidates review even when paths and return are unchanged", () => {
  const f = fixture();
  const p = join(f.f.project, f.path);
  writeFileSync(p, readFileSync(p, "utf8").replace("restore the name", "change the public output"));
  expect(f.verify().pass).toBe(false);
});

test("an unrelated or self-linked native thread cannot satisfy independent review", () => {
  const f = fixture();
  f.child[0].payload.source.subagent.thread_spawn.parent_thread_id = "another-parent";
  f.logs();
  expect(f.verify().pass).toBe(false);
  f.child[0].payload.source.subagent.thread_spawn.parent_thread_id = "parent";
  f.child[0].payload.id = "parent";
  f.logs();
  expect(f.verify().pass).toBe(false);
});

test("a returned finding or an unobserved commit cannot be replaced by a clean record claim", () => {
  const f = fixture();
  f.child[2].payload.last_agent_message = "MODEL: unknown\nFINDING: F-01\nMissing check.";
  f.logs();
  expect(f.verify().pass).toBe(false);
  f.child[2].payload.last_agent_message = "MODEL: unknown\nNO FINDINGS";
  f.child[1].payload.input = "cat references/maintenance-review.md";
  f.logs();
  expect(f.verify().pass).toBe(false);
});

test("a missing native return cannot pass from the maintenance record alone", () => {
  const f = fixture();
  f.child.pop();
  f.logs();
  expect(f.verify().pass).toBe(false);
});

test("inherited inspection cannot stand in for the reviewer's own tool evidence", () => {
  const f = fixture();
  f.child[1].payload.internal_chat_message_metadata_passthrough.turn_id = "parent-turn";
  f.logs();
  expect(f.verify().pass).toBe(false);
});

test("an inspected unambiguous Git abbreviation resolves to the exact reviewed commit", () => {
  const f = fixture();
  f.child[1].payload.input = f.child[1].payload.input.replace(f.target, f.target.slice(0, 7));
  f.logs();
  expect(f.verify().pass).toBe(true);
});

test("a reviewer can bind HEAD to an exact observed own-turn commit", () => {
  const f = fixture();
  f.child[1].payload.input = `git rev-parse HEAD; git show HEAD; cat ${f.path} references/maintenance-review.md`;
  f.child.push({ type: "response_item", payload: { type: "custom_tool_call_output", output: f.target, internal_chat_message_metadata_passthrough: { turn_id: "review-turn" } } } as any);
  f.logs();
  expect(f.verify().pass).toBe(true);
  f.child.at(-1)!.payload.output = "f".repeat(40);
  f.logs();
  expect(f.verify().pass).toBe(false);
  f.child.at(-1)!.payload.output = f.target;
  f.child.at(-1)!.payload.internal_chat_message_metadata_passthrough.turn_id = "parent-turn";
  f.logs();
  expect(f.verify().pass).toBe(false);
});

test("an attestation note in the stored model field cannot change the returned model identity", () => {
  const f = fixture();
  const path = join(f.f.project, f.path);
  writeFileSync(path, readFileSync(path, "utf8").replace("Model: unknown", "Model: unknown (identity not attested)"));
  expect(f.verify().pass).toBe(true);
  writeFileSync(path, readFileSync(path, "utf8").replace("(identity not attested)", "(identity not attested)."));
  expect(f.verify().pass).toBe(true);
  writeFileSync(path, readFileSync(path, "utf8").replace("Model: unknown", "Model: another-model"));
  expect(f.verify().pass).toBe(false);
});

test("a native contract read may use shell brace expansion when its returned source is observed", () => {
  const f = fixture();
  f.child[1].payload.input = f.child[1].payload.input.replace("references/maintenance-review.md", "references/{maintenance-review,lifecycle}.md");
  f.child.push({ type: "response_item", payload: { type: "custom_tool_call_output", output: "# Independent maintenance review\nRead only.", internal_chat_message_metadata_passthrough: { turn_id: "review-turn" } } } as any);
  f.logs();
  expect(f.verify().pass).toBe(true);
});
