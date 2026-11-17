/** Actual normal entry with owned native clients and services. No model/provider acceptance. */
import { afterAll, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { preflightFixture, ordinaryComponentFixture } from "./preflight-fixture";
import { auditClient } from "./native-audit-client-fixture";
import { installOwnedNativeService } from "./original-publication-fixture";
import { git } from "./repository-fixture";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { exactRecord } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-decisions";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["matching", "source-change", "request-change", "copied-run", "hosted-spoof", "caller-change"])("normal report runs separate native assessment and review contexts: %s", async fault => {
  const component = ordinaryComponentFixture(roots, true), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable });
  let client = auditClient(fault, true);
  if (fault === "caller-change") client = client.replace("let records;", `
if (request.kind === "docs-drift-audit-review-request") writeFileSync(${JSON.stringify(join(f.repo, "README.md"))}, "Changed original caller\\n");
let records;`);
  writeFileSync(component.executable, client, { mode: 0o755 });
  const source = f.head(), origin = join(f.root, "origin.git"), directory = join(f.root, "run");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const service = installOwnedNativeService({ root: f.root, origin, source, head: source, publisher_identity: { actor: "fixture-owner", actor_id: 30 } });
  const trace = join(f.root, "caller-captures.jsonl");
  if (fault === "matching") {
    const executable = join(f.root, "native-bin/git");
    const record = 'import { appendFileSync as recordCaller } from "node:fs"; recordCaller(' + JSON.stringify(trace)
      + ', JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}) + "\\n");\n';
    writeFileSync(executable, readFileSync(executable, "utf8").replace(/^(.*\n)/, "$1" + record));
  }
  const before = captureRepositoryState(f.repo), nativeBefore = readFileSync(service.statePath), refs = git(origin, "for-each-ref");
  let selectedDirectory = directory;
  async function invoke(command: string) {
    const result = await executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
      "--repo", f.repo, "--run-dir", selectedDirectory, ...(command === "scan" ? ["--source", source] : [])], cwd: f.repo,
      env: { PATH: join(f.root, "native-bin") + ":" + process.env.PATH, HOME: process.env.HOME!, GH_TOKEN: "synthetic-native-token",
        COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", XDG_STATE_HOME: join(f.root, "state"), BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        ...(fault === "hosted-spoof" ? { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "1" } : {}) },
      capture: "memory", watched_outputs: [], timeout_ms: 180000,
      stdout: join(f.root, command + ".stdout"), stderr: join(f.root, command + ".stderr"), started: () => {} });
    expect(result.reaped).toBe(true); expect(result.timed_out).toBe(false);
    const report: unknown = JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString());
    return { result, report };
  }
  expect((await invoke("scan")).result.exit_code).toBe(0);
  const scanTrace = fault === "matching" ? readFileSync(trace, "utf8").length : 0;
  if (fault === "copied-run") {
    selectedDirectory = join(f.root, "copied-run"); cpSync(directory, selectedDirectory, { recursive: true });
  }
  const completed = await invoke("report");
  if (fault === "matching") {
    expect(completed.report).toMatchObject({ command: "report", outcome: "collected", report_artifacts: { complete: true, content: "report" } });
    expect(completed.result.exit_code).toBe(0);
    const order = readFileSync(join(directory, "synthetic-role-order.jsonl"), "utf8").trim().split("\n");
    expect(order).toHaveLength(2);
    expect(order[0]).toContain("docs-drift-audit-worker-request"); expect(order[1]).toContain("docs-drift-audit-review-request");
    const calls: unknown[] = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const viewers = calls.filter(value => {
      const call = exactRecord(value, ["program", "args"], "Invalid owned native call");
      if (!Array.isArray(call.args) || !call.args.every(arg => typeof arg === "string")) throw Error("Invalid owned native arguments");
      return call.program === "gh" && call.args.includes("query=query { viewer { login databaseId } }");
    });
    expect(viewers).toHaveLength(3);
    function callerCaptures(text: string): number {
      return text.trim().split("\n").filter(Boolean).filter(line => {
        const row = exactRecord(JSON.parse(line) as unknown, ["cwd", "args"], "Invalid owned caller trace");
        if (!Array.isArray(row.args)) throw Error("Invalid owned caller arguments");
        return row.cwd === f.repo && row.args.includes("ls-files") && row.args.includes("--stage") && row.args.includes("-v");
      }).length;
    }
    const callsByStage = readFileSync(trace, "utf8");
    expect(callerCaptures(callsByStage.slice(0, scanTrace))).toBe(2);
    expect(callerCaptures(callsByStage.slice(scanTrace))).toBe(2);
  } else if (fault === "copied-run") {
    expect(completed.result.exit_code).toBe(1);
    expect(completed.report).toMatchObject({ outcome: "pending" });
    expect(existsSync(join(selectedDirectory, "synthetic-role-order.jsonl"))).toBe(false);
  } else if (fault === "hosted-spoof") {
    expect(completed.result.exit_code).toBe(2);
    expect(completed.report).toMatchObject({ outcome: "incomplete" });
    expect(existsSync(join(directory, "synthetic-role-order.jsonl"))).toBe(false);
  } else {
    expect(completed.result.exit_code).toBe(2);
    expect(completed.report).toMatchObject({ command: "report", outcome: "incomplete" });
    expect(existsSync(join(directory, "synthetic-role-order.jsonl"))).toBe(true);
  }
  if (fault === "caller-change") {
    expect(captureRepositoryState(f.repo)).not.toEqual(before);
    expect(completed.report).toMatchObject({ diagnostics: ["Caller source, index or repository configuration changed during this operation."] });
  } else expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(readFileSync(service.statePath)).toEqual(nativeBefore); expect(git(origin, "for-each-ref")).toBe(refs);
}, 600000);

test.each(["foreign-metadata", "forbidden-read", "lease-during-review"])("normal report refuses green over an unresolved lease: %s", async fault => {
  const component = ordinaryComponentFixture(roots, true), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable });
  writeFileSync(component.executable, auditClient("matching", true), { mode: 0o755 });
  const source = f.head(), origin = join(f.root, "lease-origin.git"), directory = join(f.root, "lease-run");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const service = installOwnedNativeService({ root: f.root, origin, source, head: source, publisher_identity: { actor: "fixture-owner", actor_id: 30 } });
  const lease = f.afterSettings.publication.lease_ref;
  if (fault === "lease-during-review") {
    const program = auditClient("matching", true).replace("let records;", `
if (request.kind === "docs-drift-audit-review-request") {
  const result = Bun.spawnSync([${JSON.stringify(Bun.which("git"))}, "--git-dir", ${JSON.stringify(origin)}, "update-ref", ${JSON.stringify(lease)}, ${JSON.stringify(source)}]);
  if (result.exitCode !== 0) throw Error("Owned late-lease injection failed");
}
let records;`);
    writeFileSync(component.executable, program, { mode: 0o755 });
  } else git(origin, "update-ref", lease, source);
  if (fault === "forbidden-read") {
    const state = JSON.parse(readFileSync(service.statePath, "utf8")); state.ref_status = 403; state.ref_status_ref = lease;
    writeFileSync(service.statePath, JSON.stringify(state));
  }
  const before = captureRepositoryState(f.repo), native = readFileSync(service.statePath), refs = git(origin, "for-each-ref");
  for (const command of ["scan", "report"]) {
    const result = await executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
      "--repo", f.repo, "--source", source, "--run-dir", directory], cwd: f.repo,
      env: { PATH: join(f.root, "native-bin") + ":" + process.env.PATH, HOME: process.env.HOME!, GH_TOKEN: "synthetic-native-token",
        COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", XDG_STATE_HOME: join(f.root, "lease-state"), BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      capture: "memory", watched_outputs: [], timeout_ms: 180000,
      stdout: join(f.root, "lease-" + command + ".stdout"), stderr: join(f.root, "lease-" + command + ".stderr"), started: () => {} });
    expect(result.reaped).toBe(true); expect(result.timed_out).toBe(false);
    const report: unknown = JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString());
    if (command === "scan") expect(result.exit_code).toBe(0);
    else if (fault !== "forbidden-read") {
      expect(result.exit_code).toBe(1);
      expect(report).toMatchObject({ outcome: "pending", pending_publication: { authority: "none", replay_authority: false,
        operation_id: null, observed_refs: { lease: { ref: lease, object: source }, receipt: null } },
        report_artifacts: { complete: true, content: "diagnostic", history_provenance: "absent" } });
    } else {
      expect(result.exit_code).toBe(2); expect(report).toMatchObject({ outcome: "incomplete" });
    }
  }
  if (fault === "lease-during-review")
    expect(readFileSync(join(directory, "synthetic-role-order.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
  else expect(existsSync(join(directory, "synthetic-role-order.jsonl"))).toBe(false);
  const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(calls.some(call => call.program === "gh" && call.args.includes("repos/fixture/docs/git/ref/heads/docs-drift-lease"))).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(readFileSync(service.statePath)).toEqual(native);
  if (fault === "lease-during-review") {
    expect(git(origin, "rev-parse", lease)).toBe(source);
    expect(git(origin, "for-each-ref").split("\n").filter(line => !line.endsWith("\t" + lease)).join("\n")).toBe(refs);
  } else expect(git(origin, "for-each-ref")).toBe(refs);
}, 240000);
