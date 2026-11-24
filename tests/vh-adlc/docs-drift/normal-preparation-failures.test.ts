import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";
import { auditClient } from "./native-audit-client-fixture";
import { installOwnedNativeService } from "./original-publication-fixture";
import { git } from "./repository-fixture";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["provider-error", "request-change", "source-change", "decision-mismatch"])("normal preparation reports runtime failures as incomplete: %s", async fault => {
  const component = ordinaryComponentFixture(roots, true), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable });
  writeFileSync(component.executable, auditClient(fault, true), { mode: 0o755 });
  const source = f.head(), origin = join(f.root, "origin.git"), directory = join(f.root, "run");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const service = installOwnedNativeService({ root: f.root, origin, source, head: source, publisher_identity: { actor: "fixture-owner", actor_id: 30 } });
  const before = captureRepositoryState(f.repo), native = readFileSync(service.statePath);
  async function invoke(command: string) {
    const result = await executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
      "--repo", f.repo, "--run-dir", directory, ...(command === "scan" ? ["--source", source] : [])], cwd: f.repo,
      env: { PATH: join(f.root, "native-bin") + ":" + process.env.PATH, HOME: process.env.HOME!, GH_TOKEN: "synthetic-native-token",
        COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", XDG_STATE_HOME: join(f.root, "state"), BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      capture: "memory", watched_outputs: [], timeout_ms: 180000, stdout: join(f.root, command + ".stdout"), stderr: join(f.root, command + ".stderr"), started: () => {} });
    expect(result.reaped).toBe(true); expect(result.timed_out).toBe(false);
    return { result, report: JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString()) as unknown };
  }
  expect((await invoke("scan")).result.exit_code).toBe(0);
  writeFileSync(join(directory, "prepare.yaml"), "decisions:\n  - id: guide-fix\n    reason: Correct the guide\nattention: []\n", { mode: 0o600 });
  const prepared = await invoke("prepare");
  expect(prepared.result.exit_code).toBe(2); expect(prepared.report).toMatchObject({ command: "prepare", outcome: "incomplete" });
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(readFileSync(service.statePath)).toEqual(native);
}, 300000);
