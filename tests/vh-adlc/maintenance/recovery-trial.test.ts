import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
test("a native-trial startup receipt failure cleans its owned process before returning", async () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-client-start-")); let pid = 0;
  try {
    await expect(runOwnedClient([process.execPath, "-e", "setInterval(()=>{},1000)"], { cwd: root, env: process.env as Record<string, string>, stdout: join(root, "out"), stderr: join(root, "err"), started: value => { pid = value; throw Error("receipt unavailable"); } }, { timeout_ms: 1000, grace_ms: 20, reap_ms: 1000 })).rejects.toThrow("receipt unavailable");
    expect(pid).toBeGreaterThan(0); expect(() => process.kill(pid, 0)).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
