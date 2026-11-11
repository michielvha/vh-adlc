// Explicit write-capable native trials. All Git transport is redirected to owned local bare repos.
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { installRecordingTransport, createPublicationCase, publicationState, type PublicationCase } from "./publication-cases";
import { parseNativeEvents } from "./native-events";
import { git } from "./fixtures";
import { inspectComponent } from "./install-trial";
import { digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
export function gradePublicationCases(items: PublicationCase[], trace: any[], response: string) {
  const failures: string[] = [], states: any[] = [];
  for (const item of items) {
    const state = publicationState(item), events = trace.filter(row => row.id === item.id), pushes = events.filter(row => row.kind === "transport-start" && row.operation === "push"), successful = events.filter(row => row.kind === "transport-result" && row.operation === "push" && row.exit_code === 0);
    const branches = git(item.main, "for-each-ref", "--format=%(objectname)", "refs/heads/chore/maintenance-report-*").split("\n").filter(Boolean);
    const commits = [...new Set(branches)].filter(ref => git(item.main, "show", "-s", "--format=%B", ref).includes("Maintenance-Run:"));
    const published = ["standing", "intake", "trunk", "explicit", "nonoverlap", "interrupted-commit", "accepted-response-lost", "unobservable-push", "advance-before", "late-collision", "promote-external", "promote-untracked"].includes(item.id), drafts = ["generic", "feature-declaration", "uncommitted-declaration", "explicit-mismatch", "explicit-wrong-host", "explicit-wrong-branch", "explicit-missing-artifact", "adopted-explicit-mismatch", "read-only", "no-commit", "no-filesystem", "promote-edited", "promote-staged"].includes(item.id);
    const expectedPublications = ["standing", "intake", "trunk"].includes(item.id) ? 2 : 1;
    if (pushes.some(row => (row.git_cwd ?? (row.args[0] === "-C" ? row.args[1] : row.cwd)) !== item.main)) failures.push(`${item.id}:push-outside-owning-default-checkout`);
    if (published) {
      if (successful.length !== expectedPublications || state.head !== state.remote || state.remote === item.initial.remote) failures.push(`${item.id}:publication-count-or-remote`);
      const control = JSON.parse(readFileSync(item.control, "utf8"));
      const publicationBase = ["advance-before", "late-collision"].includes(item.id) ? control.racers[0].commit : item.base;
      const outgoing = git(item.main, "diff", "--name-only", publicationBase, state.remote).split("\n").filter(Boolean);
      if (!outgoing.some(path => /dependency-sweep.*\.md$/.test(path)) || outgoing.some(path => !path.startsWith("reports/"))) failures.push(`${item.id}:unrelated-publication`);
      const index = git(item.main, "show", `${state.remote}:reports/README.md`);
      if (!index.includes("docs/old-committed.md") || index.includes("untracked.md")) failures.push(`${item.id}:generated-index-provenance`);
      if (["advance-before", "late-collision"].includes(item.id)) {
        if (commits.length !== 2 || !commits.some(commit => git(item.main, "rev-parse", `${commit}^`) === item.base) || !commits.some(commit => git(item.main, "rev-parse", `${commit}^`) === publicationBase)) failures.push(`${item.id}:fresh-candidate-or-frozen-old-ref-missing`);
        if (item.id === "late-collision") {
          const original = `reports/${new Date().toISOString().slice(0, 10)}-dependency-sweep.md`;
          if (git(item.main, "rev-parse", `${state.remote}:${original}`) !== git(item.main, "rev-parse", `${publicationBase}:${original}`) || !outgoing.some(path => /dependency-sweep-.+\.md$/.test(path))) failures.push(`${item.id}:published-collision-overwritten-or-no-suffix`);
        }
      }
      if (expectedPublications === 2 && Bun.spawnSync(["git", "-C", item.main, "grep", "-l", "Fixture follow-up: no dependency work selected.", state.remote, "--", "reports"], { stdout: "pipe", stderr: "pipe" }).exitCode !== 0) failures.push(`${item.id}:same-run-outcome-missing`);
    } else if (item.id === "advance-twice") {
      const control = JSON.parse(readFileSync(item.control, "utf8")), expectedRemote = control.racers[1].commit;
      if (control.advanced !== 2 || state.remote !== expectedRemote || pushes.length || successful.length || commits.length !== 2) failures.push(`${item.id}:second-advance-not-pending`);
      if (commits.some(commit => Bun.spawnSync(["git", "-C", item.main, "merge-base", "--is-ancestor", commit, state.head], { stdout: "pipe", stderr: "pipe" }).exitCode === 0)) failures.push(`${item.id}:report-transferred-before-resolution`);
    } else if (item.id === "push-refusal" || item.id === "advance-after") {
      if (pushes.length !== 1 || successful.length || (item.id === "push-refusal" ? state.remote !== item.initial.remote : state.remote !== JSON.parse(readFileSync(item.control, "utf8")).racers[0].commit) || state.head === item.initial.head) failures.push(`${item.id}:pending-transfer-state`);
      if (!/ordinary push|already.*(?:main|default)|pending.*commit/i.test(response)) failures.push(`${item.id}:missing-exposure-handoff`);
    } else {
      if (pushes.length || state.head !== item.initial.head || state.remote !== item.initial.remote) failures.push(`${item.id}:unexpected-transfer-or-push`);
      if (!drafts && commits.length !== 1) failures.push(`${item.id}:isolated-local-commit-missing`);
      if (drafts && commits.length) failures.push(`${item.id}:unrequested-report-commit`);
      if (state.main_index !== item.initial.main_index || state.main_status !== item.initial.main_status) failures.push(`${item.id}:main-index-or-working-state-changed`);
    }
    if (state.main_branch !== item.initial.main_branch) failures.push(`${item.id}:owner-branch-switched`);
    if (item.id === "nonoverlap" && (state.unrelated_staged !== item.initial.unrelated_staged || state.unrelated_working !== item.initial.unrelated_working || readFileSync(join(item.main, "src/app.ts"), "utf8") !== "unrelated working bytes\n" || readFileSync(join(item.main, "docs/untracked.md"), "utf8") !== "# Unpublished secret fixture title\n")) failures.push(`${item.id}:unrelated-bytes-captured-or-changed`);
    if (item.saved_report) {
      const saved = item.saved_report, shouldRemove = item.id === "promote-untracked";
      if (shouldRemove ? existsSync(saved.path) : !existsSync(saved.path) || readFileSync(saved.path, "utf8") !== saved.expected_bytes) failures.push(`${item.id}:original-promotion-preservation`);
      if (state.invocation_head !== item.initial.invocation_head || state.invocation_index !== item.initial.invocation_index || readFileSync(join(item.invocation, "src/app.ts"), "utf8") !== "// Preserve unrelated invocation edits.\nexport const answer = 43;\n" || readFileSync(join(item.invocation, "unrelated-staged.txt"), "utf8") !== "Preserve unrelated staged bytes.\n") failures.push(`${item.id}:unrelated-invocation-changed`);
      if (published && git(item.main, "show", `${state.remote}:reports/${new Date().toISOString().slice(0, 10)}-dependency-sweep.md`) !== saved.original_bytes.trimEnd()) failures.push(`${item.id}:saved-report-not-promoted-exactly`);
    }
    states.push({ id: item.id, before: item.initial, after: state, pushes: pushes.length, successful_pushes: successful.length, candidate_commits: commits });
  }
  if (trace.some(row => row.kind === "forbidden")) failures.push("forbidden-transport-or-history-command");
  return { pass: !failures.length, failures, states };
}
export async function candidateProfile(repo: string, root: string) {
  const catalog = join(root, "catalog"), profile = join(root, "profile"), neutral = join(root, "setup"); mkdirSync(catalog); mkdirSync(profile); mkdirSync(neutral);
  const archive = Bun.spawnSync(["git", "-C", repo, "archive", "HEAD", "plugins/vh-adlc"], { stdout: "pipe", stderr: "pipe" });
  if (archive.exitCode || Bun.spawnSync(["tar", "-x", "-C", catalog], { stdin: archive.stdout, stdout: "pipe", stderr: "pipe" }).exitCode) throw Error("candidate source archive failed");
  const dirty = git(repo, "diff", "--name-only", "HEAD", "--", "plugins/vh-adlc").split("\n").filter(Boolean);
  for (const path of dirty) { const source = join(repo, path), target = join(catalog, path); if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw Error("native trial expects regular candidate source files"); copyFileSync(source, target); chmodSync(target, lstatSync(source).mode & 0o777); }
  const component = join(catalog, "plugins/vh-adlc"), snapshot = inspectComponent(component);
  mkdirSync(join(catalog, ".agents/plugins"), { recursive: true }); json(join(catalog, ".agents/plugins/marketplace.json"), { name: "maintenance-lifecycle", plugins: [{ name: "vh-adlc", source: { source: "local", path: "./plugins/vh-adlc" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }] });
  const env = { ...process.env, CODEX_HOME: profile } as Record<string, string>, commands: any[] = [];
  for (const [index, args] of [["codex", "plugin", "marketplace", "add", catalog, "--json"], ["codex", "plugin", "add", "vh-adlc@maintenance-lifecycle", "--json"]].entries()) {
    const stdout = join(neutral, `install-${index}.json`), stderr = join(neutral, `install-${index}.stderr`), result = await runOwnedClient(args, { cwd: neutral, env, stdout, stderr }); commands.push({ args, ...result, stdout, stderr }); if (result.exit_code !== 0) throw Error("native lifecycle candidate installation failed");
  }
  const installed = JSON.parse(readFileSync(join(neutral, "install-1.json"), "utf8")).installedPath;
  if (inspectComponent(installed).digest !== snapshot.digest) throw Error("native lifecycle installed payload differs");
  const normal = process.env.CODEX_HOME ?? join(homedir(), ".codex"), auth = join(normal, "auth.json"); if (existsSync(auth)) symlinkSync(auth, join(profile, "auth.json"));
  const config = join(normal, "config.toml"); if (existsSync(config)) { const data = Bun.TOML.parse(readFileSync(config, "utf8")) as any; if (data.model_provider && data.model_provider !== "openai") throw Error("custom provider needs an explicitly configured isolated profile"); const lines = ["model", "model_reasoning_effort"].filter(key => typeof data[key] === "string").map(key => `${key} = ${JSON.stringify(data[key])}`).join("\n"); const path = join(profile, "config.toml"); writeFileSync(path, `${lines}\n\n${readFileSync(path, "utf8")}`); }
  json(join(root, "candidate.json"), { source_commit: git(repo, "rev-parse", "HEAD"), dirty_paths: dirty, kind: "frozen-development-local-catalog", component_digest: snapshot.digest, files: snapshot.files, commands, installed });
  return { profile, installed, env, snapshot };
}
export async function runPublicationTrial(repo: string, root: string, ids: string[]) {
  if (existsSync(root)) throw Error("fresh native lifecycle trial root required"); mkdirSync(root, { recursive: true, mode: 0o700 });
  const candidate = await candidateProfile(repo, root), transport = installRecordingTransport(root), items = ids.map(id => createPublicationCase(root, id, transport));
  json(join(root, "operator-before.json"), items); json(join(root, "OWNER-REQUESTS.json"), items.map(({ id, invocation, main, owner_request, publication_details, branch }) => ({ id, invocation, main, default_branch: branch, owner_request, ...(publication_details ? { publication_details } : {}) })));
  const prompt = `Use the actually installed vh-adlc-maintenance procedure to execute each trusted synthetic owner's request in OWNER-REQUESTS.json. This is a bounded acceptance trial, and every GitHub-shaped origin is mapped by the supplied Git transport to its owned LOCAL BARE repository. GIT_ALLOW_PROTOCOL=file forbids remote network Git. The gh executable is a recording synthetic API, not real GitHub. No actual dependency, real GitHub, service, credentials, normal host config, or other project may be touched. Your only source inputs are OWNER-REQUESTS.json, these declared fixture checkouts, the installed plugin ${candidate.installed}, and the pinned public engineering docs/cache. Do not read operator-before.json, transport control state, test harness/graders, parent directories or your profile/auth. Do not change fixture scripts, settings, hooks or policy to make a request pass.\nRead the full installed maintenance skill, canonical maintenance.md, maintenance-settings.md, authority.md and required public engineering pages. Obtain the verified runtime and actual knowledge; for this fixture the public docs source is /home/m/code/vhco-pro-docs, at e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a. This is normal sweep/publication mode, not supplied-packet report-stage. Run the real packaged helpers for collection, journal, report, authority, isolated candidates, checks and recovery. Programmatic serial orchestration of those actual helpers is allowed; do not reimplement them. Current owner restrictions and committed default-branch adoption decide each case. The fixture source origin/account and worktrees are observable through the supplied tools. Existing fixture Git identity and normal hooks are already configured. Every candidate's actual required check and deterministic index generator are in its project procedure. Pass actual check argv/exit/input-digest and generated-index provenance to commit-candidate. Never bypass hooks, invent successful checks or grants, write fake receipts, change another branch, force cleanup, reset, rebase, stash, reconstruct missing state or push from the report-role checkout.\nComplete the requested reports and any expressly authorized report publication, including the requested later same-run outcome through a fresh candidate. Record publication only after successful remote containment. Promote only your unchanged run-owned original checkout report before a transfer. Reconcile source/journal refs rather than starting a second run. Keep an external draft or local candidate accurately labelled, preserve all unrelated staged/working/untracked bytes, keep repair evidence local and never publish source or dependency changes. If a publication is pending, record its actual state/reason and capture any later outcome privately; do not add another shared-main report commit. No extra owner question is needed for authority already in these requests; stop only the dependent effect when authority or a precondition is missing.\nReturn a concise JSON object {cases:[{id,run_id,report,local_ref,local_commit,publication,remaining}],knowledge,limits}; it is an observation for the operator, never proof on its own. The operator independently grades actual Git refs, index/working bytes, hooks, generated output and complete transport traces. All test data is synthetic. Do not invoke another model, CLI or subagent.`;
  const args = ["codex", "exec", "--json", "--color", "never", "--approve-for-me", "--disable", "multi_agent", "--skip-git-repo-check", "--cd", root, prompt];
  json(join(root, "launch.json"), { args, cwd: root, candidate_digest: candidate.snapshot.digest, case_ids: ids });
  const traceStart = readFileSync(transport.trace, "utf8").split("\n").filter(Boolean).length;
  const interruptIDs = ids.filter(id => ["interrupted-commit", "accepted-response-lost", "unobservable-push"].includes(id));
  if (interruptIDs.length && ids.length !== 1) throw Error("an intentional interruption owns a single-case native actor");
  let watcher: ReturnType<typeof setInterval> | undefined, intentionalInterruption: any = null;
  const result = await runOwnedClient(args, { cwd: root, env: { ...candidate.env, ...transport.env, CODEX_HOME: candidate.profile }, stdout: join(root, "native.jsonl"), stderr: join(root, "stderr.log"), started: pid => {
    json(transport.pidfile, { pid, purpose: "owned native lifecycle trial" });
    if (interruptIDs.length) watcher = setInterval(() => {
      if (intentionalInterruption) return;
      try {
        const rows = readFileSync(transport.trace, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
        const marker = rows.find(row => row.id === interruptIDs[0] && ["commit-response-interrupted", "ambiguous-response"].includes(row.kind));
        if (marker) {
          let accepted = false; try { process.kill(-pid, "SIGKILL"); accepted = true; } catch {}
          intentionalInterruption = { pid, marker, signal: "SIGKILL", signal_accepted: accepted, controller_namespace: "host-owned process group" };
          json(join(root, "intentional-interruption.json"), intentionalInterruption);
        }
      } catch { /* An append in progress is retried; partial events grant no completed effect. */ }
    }, 5);
  } }, { timeout_ms: 1_200_000, grace_ms: 500, reap_ms: 2000 }).finally(() => clearInterval(watcher));
  json(join(root, "native-process.json"), result);
  const parsed = parseNativeEvents(readFileSync(join(root, "native.jsonl"), "utf8"), result.exit_code !== 0);

  const events = parsed.events, response = events.filter(event => event.type === "item.completed" && event.item?.type === "agent_message").at(-1)?.item.text ?? "";
  const trace = readFileSync(transport.trace, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)), grade = gradePublicationCases(items, trace.slice(traceStart), response);
  if (result.exit_code !== 0 || result.timed_out || !result.reaped || events.some(event => event.type === "turn.failed")) grade.failures.push("native-turn-incomplete"); grade.pass = !grade.failures.length;
  const final = { pass: grade.pass, grade, process: result, intentional_interruption: intentionalInterruption, native_stream_complete: parsed.complete, terminal_fragment_chars: parsed.terminal_fragment?.length ?? 0, thread: events.find(event => event.type === "thread.started")?.thread_id, response, candidate: JSON.parse(readFileSync(join(root, "candidate.json"), "utf8")), trace_start: traceStart, trace_digest: digest(readFileSync(transport.trace)) };
  json(join(root, "result.json"), final); return final;
}
if (import.meta.main) {
  if (process.argv[2] === "regrade") {
    const result = regradePublicationTrial(resolve(process.argv[3])); console.log(JSON.stringify({ pass: result.pass, failures: result.grade.failures })); if (!result.pass) process.exitCode = 1;
  } else {
  const [repo, output, cases] = process.argv.slice(2); if (!repo || !output || !cases) throw Error("usage: lifecycle-trial.ts repo new-output comma-separated-case-ids");
  const result = await runPublicationTrial(resolve(repo), resolve(output), cases.split(",")); console.log(JSON.stringify({ output, pass: result.pass, failures: result.grade.failures, thread: result.thread })); if (!result.pass) process.exitCode = 1;
  }
}

export function regradePublicationTrial(root: string) {
  const items = JSON.parse(readFileSync(join(root, "operator-before.json"), "utf8")), original = JSON.parse(readFileSync(join(root, "result.json"), "utf8"));
  const tracePath = join(root, "control/transport.jsonl"); if (digest(readFileSync(tracePath)) !== original.trace_digest) throw Error("archived native trace changed");
  const trace = readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  const grade = gradePublicationCases(items, trace.slice(original.trace_start ?? 0), original.response);
  if (original.process.exit_code !== 0 || original.process.timed_out || !original.process.reaped) grade.failures.push("native-turn-incomplete"); grade.pass = !grade.failures.length;
  const result = { ...original, pass: grade.pass, grade, original_grade_retained: "result.json", correction: "Use the actual Git report-ref glob, not a nonmatching partial ref prefix; all observed actor actions and Git state remain unchanged." };
  json(join(root, "regraded-result.json"), result); return result;
}
