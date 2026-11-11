import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, git, grade, snapshot } from "./lifecycle/fixtures";
import { SHOUT_CRITERION } from "./lifecycle/feature-fixture";
import { verifyFeatureReview } from "./lifecycle/native-review";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vh-feature-review-"));
  roots.push(root);
  const f = buildDiagnostic(root, "L15"), before = snapshot(f), path = "docs/specs/shout.md";
  writeFileSync(join(f.project, "greet.sh"), 'if [ "${1-}" = --shout ]; then printf "HELLO, WORLD.\\n"; else printf "Hello, world.\\n"; fi\n');
  writeFileSync(join(f.project, "test.sh"), 'test "$(bash greet.sh --shout)" = "HELLO, WORLD."\ntest "$(bash greet.sh)" = "Hello, world."\n');
  git(f.project, "add", "greet.sh", "test.sh");
  git(f.project, "commit", "-qm", "feat: add shout", "--", "greet.sh", "test.sh");
  const target = git(f.project, "rev-parse", "HEAD");
  const returned = `CRITERION: AC-01 ${SHOUT_CRITERION}\nVERDICT: met\nEVIDENCE: bash test.sh at ${target} passed for both invocations.`;
  const doc = readFileSync(join(f.project, path), "utf8").replace("### R-1", `| 2026-10-21 | R-2 | implementation | \x60${target}\x60 | unknown | procedural | AC-01 met |\n\n### R-1`) + `\n### R-2\n\n${returned}\n`;
  writeFileSync(join(f.project, path), doc);
  const sessions = join(root, "sessions"); mkdirSync(sessions);
  const parent: any[] = [
    { type: "session_meta", payload: { id: "parent", cwd: f.project, source: "exec" } },
    { type: "response_item", payload: { type: "function_call", name: "spawn_agent", arguments: JSON.stringify({ task_name: "review", message: "Read the canonical agent and review implementation." }), internal_chat_message_metadata_passthrough: { turn_id: "parent-turn" } } },
  ];
  const child: any[] = [
    { type: "session_meta", payload: { id: "reviewer", cwd: f.project, source: { subagent: { thread_spawn: { parent_thread_id: "parent" } } } } },
    { type: "response_item", payload: { type: "custom_tool_call", input: `git show ${target}; cat agents/vh-adlc-reviewer.agent.md ${path}; bash test.sh`, internal_chat_message_metadata_passthrough: { turn_id: "review-turn" } } },
    { type: "event_msg", payload: { type: "task_complete", last_agent_message: `MODEL: unknown\n${returned}`, turn_id: "review-turn", root_turn_id: "parent-turn" } },
  ];
  const logs = () => { for (const [name, rows] of [["parent", parent], ["reviewer", child]] as const) writeFileSync(join(sessions, `${name}.jsonl`), rows.map(JSON.stringify).join("\n")); };
  logs();
  const verify = () => verifyFeatureReview(f.project, sessions, "parent");
  return { f, before, path, target, returned, child, logs, verify };
}

test("feature review requires a linked canonical reviewer and exact criterion return", () => {
  const f = fixture();
  expect(f.verify().pass).toBe(true);
  f.child[2].payload.last_agent_message = "MODEL: unknown\nNO FINDINGS"; f.logs();
  expect(f.verify().pass).toBe(false);
});

test("an inherited contract read and a changed accepted criterion cannot pass feature review", () => {
  const f = fixture();
  f.child[1].payload.internal_chat_message_metadata_passthrough.turn_id = "parent-turn"; f.logs();
  expect(f.verify().pass).toBe(false);
  f.child[1].payload.internal_chat_message_metadata_passthrough.turn_id = "review-turn"; f.logs();
  writeFileSync(join(f.f.project, f.path), readFileSync(join(f.f.project, f.path), "utf8").replace("AC-01: Running", "AC-01: Now running"));
  expect(f.verify().pass).toBe(false);
});

test("source drift invalidates feature review while a local feature commit preserves remote and unrelated state", () => {
  const f = fixture();
  const commands = [
    { command: "bash test.sh", exitCode: 1, output: "FAIL: expected HELLO, WORLD.; got Hello, world." },
    { command: "bash test.sh", exitCode: 0, output: "PASS: shout and default" },
    { command: "vh-adlc next docs/specs/shout.md", exitCode: 0, output: '{"command":"next","result":"answered","data":{"action":"ship"}}' },
  ];
  expect(grade(f.f, f.before, snapshot(f.f), "Ready for shipping when requested.", commands, f.verify()).pass).toBe(true);
  expect(grade(f.f, f.before, snapshot(f.f), "Done", [...commands].reverse(), f.verify()).pass).toBe(false);
  git(f.f.project, "push", "-q", "origin", "feat/shout");
  expect(grade(f.f, f.before, snapshot(f.f), "Done", commands, f.verify()).pass).toBe(false);
  writeFileSync(join(f.f.project, "greet.sh"), "exit 0\n");
  expect(f.verify().pass).toBe(false);
});

test("an observed Bash xtrace regression remains test-first evidence", () => {
  const f = fixture();
  const commands = [
    { command: "bash -x test.sh", exitCode: 1, output: "+ bash greet.sh --shout\n+ [[ Hello, world. == \\H\\E\\L\\L\\O ] ]" },
    { command: "bash test.sh", exitCode: 0, output: "PASS: shout and default" },
    { command: "vh-adlc next", exitCode: 0, output: '{"command":"next","result":"answered","data":{"action":"ship"}}' },
  ];
  expect(grade(f.f, f.before, snapshot(f.f), "Ready.", commands, f.verify()).pass).toBe(true);
});
