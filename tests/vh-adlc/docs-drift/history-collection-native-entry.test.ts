import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { bindingFixture } from "./binding-fixture";
import { hostedHistoryFixture } from "./history-collection-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed native history CLI roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function environment(f: Awaited<ReturnType<typeof bindingFixture>>): Record<string, string> {
  return Object.fromEntries(Object.entries(f.native.environment).filter((row): row is [string, string] => typeof row[1] === "string"));
}
async function invoke(f: Awaited<ReturnType<typeof bindingFixture>>, entry: "copilot" | "hosted", env: Record<string, string>, expectedExit: number) {
  const { collectNativeReportHistory, historyCollectionOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-collection");
  const attempt = env.GITHUB_RUN_ATTEMPT;
  const history = await collectNativeReportHistory({ ...f.options, entry,
    run: entry === "hosted" ? env.GITHUB_RUN_ID ?? "" : randomUUID(),
    hosted_run_attempt: entry === "hosted" ? Number(attempt) : undefined });
  const result = historyCollectionOutput(history);
  expect(history.complete, JSON.stringify(history.diagnostics)).toBe(expectedExit === 0);
  expect(Buffer.byteLength(JSON.stringify(result) + "\n")).toBeLessThanOrEqual(524288);
  return result;
}

test("the native history collection binds original inputs and emits bounded read-only metadata", async () => {
  try {
    const started = performance.now(), f = await bindingFixture(roots, false), before = captureRepositoryState(f.repo);
    expect(performance.now() - started).toBeLessThan(60000);
    const result = await invoke(f, "copilot", environment(f), 0);
    expect(result.history_collection).toMatchObject({ complete: true, authority: "none", mode: "none", source_commit: f.source, history: [] });
    expect(result.history_collection.context?.run_id).toMatch(/^[a-f0-9-]{36}$/u);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);


test.each([{ name: "matching", attempt: "1", exit: 0 }, { name: "matching-attempt-2", attempt: "2", exit: 0 }, { name: "missing", attempt: undefined, exit: 2 },
  { name: "wrong", attempt: "2", exit: 2 }])("the hosted collector binds its independent native attempt: $name", async selected => {
  try {
    const started = performance.now(), f = await hostedHistoryFixture(roots, selected.name === "matching-attempt-2" ? "matching-attempt-2" : "matching"), before = captureRepositoryState(f.repo), env = environment(f);
    env.GITHUB_RUN_ID = "101"; delete env.GITHUB_RUN_ATTEMPT;
    if (selected.attempt !== undefined) env.GITHUB_RUN_ATTEMPT = selected.attempt;
    expect(performance.now() - started).toBeLessThan(60000);
    const result = await invoke(f, "hosted", env, selected.exit);
    expect(result.history_collection.authority).toBe("none");
    if (selected.exit === 0) {
      expect(result.history_collection).toMatchObject({ complete: true, hosted_run_attempt: Number(selected.attempt), mode: "actions", context: { run_id: "101" } });
      expect(Number(readFileSync(f.countPath, "utf8"))).toBe(2);
      expect(readFileSync(f.endpointsPath, "utf8").trim().split("\n").map(line => JSON.parse(line)))
        .toEqual(["repos/fixture/docs/actions/runs/101", "repos/fixture/docs/actions/runs/101/attempts/" + selected.attempt]);
    } else {
      expect(result.history_collection.complete).toBe(false);
      expect(result.diagnostics.map((item: { message: string }) => item.message).join("\n")).toContain("Current native scheduled run identity");
      if (selected.name === "missing") expect(existsSync(f.countPath)).toBe(false);
      else { expect(result.history_collection.scope_changed).toBe(true); expect(Number(readFileSync(f.countPath, "utf8"))).toBe(1); }
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
