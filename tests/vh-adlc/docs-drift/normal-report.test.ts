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

test.each(["matching", "source-change", "request-change", "copied-run", "hosted-spoof"])("normal report runs separate native assessment and review contexts: %s", async fault => {
  const component = ordinaryComponentFixture(roots, true), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable });
  writeFileSync(component.executable, auditClient(fault, true), { mode: 0o755 });
  const source = f.head(), origin = join(f.root, "origin.git"), directory = join(f.root, "run");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const service = installOwnedNativeService({ root: f.root, origin, source, head: source, publisher_identity: { actor: "fixture-owner", actor_id: 30 } });
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
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(readFileSync(service.statePath)).toEqual(nativeBefore); expect(git(origin, "for-each-ref")).toBe(refs);
}, 600000);
