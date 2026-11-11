// Actual author -> external reviewer -> same-thread continuation orchestration.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { candidateProfile } from "./lifecycle-trial";
import { builderOrder } from "./builder-order";
import { createIndependentRepairCase } from "./related-cases";
import { createAuthoredRepairCase, installSourceCheckRecorder } from "./delivery-cases";
import { installRecordingTransport, publicationState } from "./publication-cases";
import { git } from "./fixtures";
import { digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
import { parseNativeEvents } from "./native-events";
import { parseCopilotResponse } from "../triage/copilot-trial";
const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
export function isNormalizationDelta(before: string, after: string, manifest: string) {
  try {
    const old = JSON.parse(before), next = JSON.parse(after), selected = JSON.parse(manifest).fixture_widget_version;
    return [old, next].every(row => JSON.stringify(Object.keys(row).sort()) === '["normalized","widget"]' && typeof row.normalized === "boolean" && row.widget === selected) && next.normalized === true;
  } catch { return false; }
}
export function isReadOnlyTrackerCommand(args: string[]) {
  if (args[0] === "api") {
    const methodAt = args.findIndex(arg => ["--method", "-X"].includes(arg));
    return methodAt >= 0 ? args[methodAt + 1] === "GET" : !args.some(arg => ["-f", "-F", "--field", "--raw-field", "--input"].includes(arg));
  }
  return args[0] === "auth" && args[1] === "status" || args[0] === "repo" && args[1] === "view" || args[0] === "pr" && ["list", "view", "checks"].includes(args[1]) || ["run", "workflow"].includes(args[0]) && ["list", "view", "watch"].includes(args[1]);
}
export function gradeAuthoredHandoff(item: ReturnType<typeof createAuthoredRepairCase>, handoff: any, trace: any[], native: any) {
  const failures: string[] = [], primary = item.primary, after = publicationState(primary);
  if (native.exit_code !== 0 || native.timed_out || !native.reaped) failures.push("native-turn-incomplete");
  if (!handoff || handoff.status !== "review-pending" || handoff.requested_model !== "claude-opus-5.5" || !/^[a-f0-9-]{36}$/.test(handoff.run_id ?? "")) return { pass: false, failures: [...failures, "canonical-paired-handoff-missing"], after };
  if (trace.some(row => row.kind === "forbidden" || row.kind === "transport-start" && row.operation === "push" || row.kind === "gh-command" && !isReadOnlyTrackerCommand(row.args))) failures.push("publication-or-cross-scope-action-before-review");
  if (after.head !== primary.initial.head || after.main_index !== primary.initial.main_index || after.invocation_head !== primary.initial.invocation_head || after.invocation_index !== primary.initial.invocation_index || after.invocation_status !== primary.initial.invocation_status) failures.push("primary-or-unrelated-invocation-changed");
  try {
    for (const field of ["source_target", "record_target", "task_base"]) if (!/^[a-f0-9]{40}$/.test(handoff[field] ?? "")) throw Error("full paired targets required");
    if (handoff.source_repository !== item.source_repository || !handoff.source_root || !handoff.record_root || handoff.record_path !== item.record_path || !/^chore\/maintenance-evidence-[a-z0-9-]+$/.test(handoff.record_ref ?? "")) throw Error("paired scope/ref invalid");
    if (git(handoff.source_root, "rev-parse", "HEAD") !== handoff.source_target || git(handoff.record_root, "rev-parse", "HEAD") !== handoff.record_target || git(primary.main, "rev-parse", handoff.record_ref) !== handoff.record_target) throw Error("paired targets do not match actual committed heads");
    const sourceRef = git(handoff.source_root, "branch", "--show-current"); if (sourceRef !== handoff.source_ref || !sourceRef.includes(handoff.run_id) || [primary.main, primary.invocation].includes(handoff.source_root)) throw Error("source batch is not uniquely owned by this run");
    const sourceBase = (item as any).source_base ?? primary.base;
    const postAggregation = git(handoff.source_root, "diff", "--name-only", sourceBase, handoff.task_base).split("\n").sort();
    if (JSON.stringify(postAggregation) !== JSON.stringify(["package.json", "runtime-lock.json", "vendor/widget.ts"])) throw Error("task base does not exclude the selected bot patch");
    for (const path of postAggregation) if (git(handoff.source_root, "rev-parse", `${handoff.task_base}:${path}`) !== git(item.source_owner, "rev-parse", `${item.selected_bot_commit}:${path}`)) throw Error("selected bot input changed during aggregation");
    const authored = git(handoff.source_root, "diff", "--name-only", handoff.task_base, handoff.source_target).split("\n").filter(Boolean);
    if (!authored.includes("src/greet.ts") || authored.some(path => path !== "src/greet.ts" && path !== "runtime-lock.json" && !path.startsWith("tests/"))) throw Error("authored diff contains bot context or unselected source");
    if (authored.includes("runtime-lock.json") && !isNormalizationDelta(git(handoff.source_root, "show", `${handoff.task_base}:runtime-lock.json`), git(handoff.source_root, "show", `${handoff.source_target}:runtime-lock.json`), git(handoff.source_root, "show", `${handoff.source_target}:package.json`))) throw Error("lock delta selects a new constraint or contains unexplained changes");
    const record = git(handoff.record_root, "show", `${handoff.record_target}:${handoff.record_path}`);
    for (const term of ["## Definition", "Task base", handoff.task_base, handoff.source_target, "Verification inputs", "runtime-lock.json", "package.json", "vendor/widget.ts", "bun test tests"]) if (!record.includes(term)) throw Error("committed paired Definition/evidence missing");
    if (git(handoff.source_root, "ls-tree", "-r", "--name-only", handoff.source_target, "--", handoff.record_path)) throw Error("private record entered the source squash");
    const check = Bun.spawnSync([process.execPath, "test", "tests"], { cwd: handoff.source_root, stdout: "pipe", stderr: "pipe" }); if (check.exitCode !== 0) throw Error("actual repaired source checks fail");
    const baseline = trace.find(row => row.kind === "source-check" && row.head === handoff.task_base && row.exit_code !== 0 && /oldCall/.test(row.stderr));
    if (!baseline) throw Error("author did not observe the real post-aggregation failing check");
    if (!trace.some(row => row.kind === "source-check" && row.cwd === handoff.source_root && row.exit_code === 0)) throw Error("author passing check not observed");
    const related = item as any;
    if (related.source_owner_state) {
      const ownerIndex = git(item.source_owner, "rev-parse", "--path-format=absolute", "--git-path", "index");
      if (git(item.source_owner, "rev-parse", "HEAD") !== related.source_owner_state.head || digest(readFileSync(ownerIndex)) !== related.source_owner_state.index || git(item.source_owner, "status", "--porcelain=v1") !== related.source_owner_state.status) throw Error("canonical independent source checkout changed");
      if (handoff.source_root === item.source_owner || !trace.some(row => row.kind === "clone-result" && row.exit_code === 0 && row.repository === item.source_repository && git(row.destination, "rev-parse", "--path-format=absolute", "--git-common-dir") === git(handoff.source_root, "rev-parse", "--path-format=absolute", "--git-common-dir"))) throw Error("selected related repair did not use an actual fresh owned clone");
    }
    if (related.topology === "satellite") {
      const bump = handoff.primary_batch;
      if (!bump || !bump.root || !bump.ref?.includes(handoff.run_id) || bump.bot_commit !== related.primary_bot_commit || bump.base !== primary.base || [primary.main, primary.invocation].includes(bump.root) || git(bump.root, "rev-parse", "HEAD") !== bump.target || git(primary.main, "rev-parse", bump.ref) !== bump.target) throw Error("local primary builder-pointer batch binding missing");
      if (git(bump.root, "diff", "--name-only", primary.base, bump.target) !== "deps/builder.version.json" || git(bump.root, "rev-parse", `${bump.target}:deps/builder.version.json`) !== git(primary.main, "rev-parse", `${related.primary_bot_commit}:deps/builder.version.json`) || git(bump.root, "ls-tree", "-r", "--name-only", bump.target, "--", handoff.record_path)) throw Error("primary bump is not the exact selected pointer-only patch");
      const artifact = JSON.parse(readFileSync(bump.builder_receipt, "utf8"));
      if (artifact.repository !== item.source_repository || artifact.source_commit !== handoff.source_target || artifact.widget !== "1.1.0" || artifact.greeting !== "Hello, Zoë.") throw Error("actual committed-source builder artifact invalid");
      if (!builderOrder(trace, handoff.source_root, handoff.source_target, bump, related.primary_bot_commit).pass) throw Error("actual final-source build did not precede primary pointer application");
    }
    const recordPaths = git(handoff.record_root, "diff", "--name-only", primary.base, handoff.record_target).split("\n").filter(Boolean); if (recordPaths.some(path => path !== handoff.record_path)) throw Error("evidence ref contains unrelated source or reports");
  } catch (error) { failures.push(error instanceof Error ? error.message : "paired-state-invalid"); }
  return { pass: !failures.length, failures, after };
}
export async function runAuthoredPreparation(repo: string, root: string, mode: "primary" | "independent" | "satellite" = "primary") {
  if (existsSync(root)) throw Error("fresh authored trial root required"); mkdirSync(root, { recursive: true, mode: 0o700 });
  const candidate = await candidateProfile(repo, root), transport = installRecordingTransport(root), item = mode !== "primary" ? createIndependentRepairCase(root, transport, mode) : createAuthoredRepairCase(root, "primary-repair", transport); installSourceCheckRecorder(root, transport);
  json(join(root, "operator-before.json"), item); json(join(root, "OWNER-REPAIR.json"), { repository: item.source_repository, invocation: item.primary.invocation, main_owner: item.primary.main, selected_bot_commit: item.selected_bot_commit, source_repository: item.source_repository, source_owner: item.source_owner, source_base: (item as any).source_base ?? item.primary.base, source_remote: (item as any).source_remote ?? item.primary.remote, topology: (item as any).topology ?? "primary", primary_bot_commit: (item as any).primary_bot_commit, builder_output_dir: (item as any).builder_output_dir, required_checks: item.required_checks, record_path: item.record_path, owner_request: item.owner_request });
  const prompt = `Use the actually installed vh-adlc-maintenance operation for the trusted owner request in OWNER-REPAIR.json. This is a synthetic acceptance task, with Git/API transport redirected to owned local bare repositories, not real GitHub. Your declared source inputs are that request, its primary/selected source checkouts and expressly declared independent source/cache, the installed plugin ${candidate.installed}, and pinned public engineering docs/cache at e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a (local docs source /home/m/code/vhco-pro-docs). Do not read operator-before.json, test harness/graders, transport control, upstream-bot-seed checkout, normal host config, auth or other projects. The upstream bot commit itself is available in Git and selected by exact SHA. Inspect its actual patch/notes and affected caller. Never modify fixture hooks/check scripts, upstream intent, README contract, owner instructions or policy to obtain a pass.\nRead the entire canonical maintenance procedure, maintenance record and paired-review contract, scope authority and engineering pages. Preserve the unrelated invocation checkout exactly. Use the journal to record report/batch/evidence owned locations and exact source/record/task-base bindings. The selected report is committed locally but report/record refs stay unpublished. New owned batch/evidence worktrees must be unique and non-forcing; never commit on shared main or the unrelated invocation branch. Observe the actual failing source checks after applying the selected bot patch and before the authored repair, and actual passing checks after it. Use the declared \`bun test tests\` command via the exact provided executable ${join(transport.bin, "bun")} (pass test and tests as its arguments). Login-shell PATH ordering can otherwise select the host Bun and bypass the fixture recorder. This executable runs the actual normal Bun and records its real result; do not replace or edit it. Normal hooks must run. Only an eligible internal repair preserving README's public API is authorized.\nRequested reviewer: Copilot claude-opus-5.5. This author context has no matching native independent route (multi-agent disabled). Do not launch a second model, CLI or subagent, self-review, fabricate records or publish first. Prepare/commit eligible source and the separate record, then stop REVIEW PENDING with a self-contained handoff. The separate trusted operator will run the requested actual independent reviewer and later resume this SAME thread with its real artifact. Missing review is not a successful completed positive case.\nReturn ONLY JSON with status:"review-pending", requested_model:"claude-opus-5.5", run_id, source_repository, source_root, source_target, source_ref, task_base, record_repository:"example/project", record_root, record_ref, record_path, record_target, affected_paths, verification_inputs, checks:[{argv,exit_code}], engineering_revision, handoff_instructions, remaining. For a declared satellite case also return the requested actual primary_batch object; it is local-only and its build-before-bump proof is separate from source publication. All commits must be full actual SHAs. Include source and Definition targets and canonical review instructions, not a narrative review claim. Source_repository/source_root/source_target refer to the actual selected source owner, including an independent repo when declared; record_repository stays example/project. An independent source needs the declared fresh clone, while the primary owns its run/report/record; never apply that patch in primary or put evidence in the independent squash. Source and verification-input changes or Definition changes require renewed checks/review. No push, PR, merge, workflow dispatch or service command is permitted before that review returns.`;
  const args = ["codex", "exec", "--json", "--color", "never", "--approve-for-me", "--disable", "multi_agent", "--skip-git-repo-check", "--cd", root, prompt];
  json(join(root, "launch.json"), { args, cwd: root, candidate_digest: candidate.snapshot.digest, purpose: "actual authored paired-review preparation" });
  const processResult = await runOwnedClient(args, { cwd: root, env: { ...candidate.env, ...transport.env, CODEX_HOME: candidate.profile }, stdout: join(root, "native.jsonl"), stderr: join(root, "stderr.log") }, { timeout_ms: 1_200_000, grace_ms: 500, reap_ms: 2000 }); json(join(root, "native-process.json"), processResult);
  const parsed = parseNativeEvents(readFileSync(join(root, "native.jsonl"), "utf8"), processResult.exit_code !== 0), events = parsed.events, response = events.filter(event => event.type === "item.completed" && event.item?.type === "agent_message").at(-1)?.item.text;
  let handoff: any = null; try { handoff = parseCopilotResponse(response); } catch {}
  const trace = readFileSync(transport.trace, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)), grade = gradeAuthoredHandoff(item, handoff, trace, processResult);
  json(join(root, "handoff.json"), handoff); const result = { pass: grade.pass, grade, handoff, thread: events.find(event => event.type === "thread.started")?.thread_id, process: processResult, trace_digest: digest(readFileSync(transport.trace)), limitation: "A passed preparation is review pending; an actual independent pass and same-thread publication remain required." }; json(join(root, "preparation-result.json"), result); return result;
}
if (import.meta.main) { const [repo, root, mode] = process.argv.slice(2); const result = await runAuthoredPreparation(resolve(repo), resolve(root), mode as any || "primary"); console.log(JSON.stringify({ pass: result.pass, failures: result.grade.failures, thread: result.thread })); if (!result.pass) process.exitCode = 1; }
