import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { hostedHistoryFixture } from "./history-collection-fixture";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed native history CLI roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function environment(f: Awaited<ReturnType<typeof bindingFixture>>): Record<string, string> {
  return Object.fromEntries(Object.entries(f.native.environment).filter((row): row is [string, string] => typeof row[1] === "string"));
}
async function invoke(f: Awaited<ReturnType<typeof bindingFixture>>, entry: "copilot" | "hosted", env: Record<string, string>, expectedExit: number) {
  const options = f.options;
  const argv = [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), "collect-report-history",
    "--repo", f.repo, "--source", f.source, "--artifact-root", f.artifacts, "--cache-root", options.cache_directory,
    "--entry", entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
    "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
    "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256];
  const completed = await executeOwnedProcess({ argv, cwd: f.repo, env, capture: "memory", watched_outputs: [], timeout_ms: 60000,
    stdout: join(f.artifacts, "history-cli-stdout"), stderr: join(f.artifacts, "history-cli-stderr"),
    started: pid => writeFileSync(join(f.artifacts, "history-cli-start.json"), canonicalJSON({ pid, argv }), { mode: 0o600 }) });
  const { captured, ...metadata } = completed, stdout = Buffer.from(captured?.stdout ?? []), stderr = Buffer.from(captured?.stderr ?? []);
  writeFileSync(join(f.artifacts, "history-cli-stdout"), stdout, { mode: 0o600 }); writeFileSync(join(f.artifacts, "history-cli-stderr"), stderr, { mode: 0o600 });
  writeFileSync(join(f.artifacts, "history-cli-process.json"), canonicalJSON(metadata), { mode: 0o600 });
  expect(metadata.reaped).toBe(true); expect(metadata.timed_out, JSON.stringify(metadata)).toBe(false); expect(metadata.exit_code, stderr.toString()).toBe(expectedExit);
  expect(stdout.length).toBeGreaterThan(0); expect(stdout.length).toBeLessThanOrEqual(524288);
  const result = JSON.parse(stdout.toString());
  expect(result.command).toBe("collect-report-history"); expect(result.outcome, JSON.stringify(result.diagnostics)).toBe(expectedExit === 0 ? "collected" : "incomplete");
  return result;
}

test("the normal history CLI binds original inputs and emits bounded read-only metadata", async () => {
  try {
    const started = performance.now(), f = await bindingFixture(roots, false), before = captureRepositoryState(f.repo);
    expect(performance.now() - started).toBeLessThan(60000);
    const result = await invoke(f, "copilot", environment(f), 0);
    expect(result.history_collection).toMatchObject({ complete: true, authority: "none", mode: "none", source_commit: f.source, history: [] });
    expect(result.history_collection.context.run_id).toMatch(/^[a-f0-9-]{36}$/u);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);


test.each([{ name: "matching", attempt: "1", exit: 0 }, { name: "missing", attempt: undefined, exit: 2 },
  { name: "wrong", attempt: "2", exit: 2 }])("the hosted CLI binds its independent native attempt: $name", async selected => {
  try {
    const started = performance.now(), f = await hostedHistoryFixture(roots), before = captureRepositoryState(f.repo), env = environment(f);
    env.GITHUB_RUN_ID = "101"; delete env.GITHUB_RUN_ATTEMPT;
    if (selected.attempt !== undefined) env.GITHUB_RUN_ATTEMPT = selected.attempt;
    expect(performance.now() - started).toBeLessThan(60000);
    const result = await invoke(f, "hosted", env, selected.exit);
    expect(result.history_collection.authority).toBe("none");
    if (selected.exit === 0) {
      expect(result.history_collection).toMatchObject({ complete: true, hosted_run_attempt: 1, mode: "actions", context: { run_id: "101" } });
      expect(Number(readFileSync(f.countPath, "utf8"))).toBe(2);
    } else {
      expect(result.history_collection.complete).toBe(false);
      expect(result.diagnostics.map((item: { message: string }) => item.message).join("\n")).toContain("Current native scheduled run identity");
      if (selected.name === "missing") expect(existsSync(f.countPath)).toBe(false);
      else { expect(result.history_collection.scope_changed).toBe(true); expect(Number(readFileSync(f.countPath, "utf8"))).toBe(1); }
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
