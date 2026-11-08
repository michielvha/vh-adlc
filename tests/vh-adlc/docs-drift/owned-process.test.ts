import { expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";

for (const oversized of [false, true]) {
  test(`memory capture ${oversized ? "refuses oversized output" : "retains bytes only in memory"}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "docs-drift-memory-"));
    try {
      const options = {
        argv: [process.execPath, "-e", oversized
          ? 'process.stdout.write("x".repeat(8192))'
          : 'process.stdout.write("body-canary"); process.stderr.write("header-canary")'],
        cwd: root, env: { PATH: process.env.PATH ?? "" }, watched_outputs: [],
        stdout: join(root, "stdout"), stderr: join(root, "stderr"), timeout_ms: 2000,
        max_output_bytes: 1024, capture: "memory" as const, started: () => {},
      };
      const result = await executeOwnedProcess(options);
      expect(existsSync(options.stdout)).toBe(false);
      expect(existsSync(options.stderr)).toBe(false);
      expect(result.reaped).toBe(true);
      expect(result.output_limit).toBe(oversized);
      if (!oversized) {
        expect(Buffer.from(result.captured!.stdout).toString()).toBe("body-canary");
        expect(Buffer.from(result.captured!.stderr).toString()).toBe("header-canary");
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("memory capture returns when an escaped helper holds a pipe open", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-held-pipe-"));
  const begin = Date.now();
  let returned = false;
  let signalledAfterReturn = false;
  const kill = process.kill.bind(process);
  const signals = spyOn(process, "kill").mockImplementation((pid, signal) => {
    if (returned) signalledAfterReturn = true;
    return kill(pid, signal);
  });
  try {
    const result = await executeOwnedProcess({
      argv: [process.execPath, "-e", `
        const helper = Bun.spawn([process.execPath, "-e", 'require("node:fs").writeFileSync("ready", "ready"); setTimeout(() => {}, 5000)'],
          { detached: true, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
        while (!require("node:fs").existsSync("ready")) await Bun.sleep(5);
        process.exit(0);
      `], cwd: root,
      env: { PATH: "/usr/bin:/bin" }, watched_outputs: [],
      stdout: join(root, "stdout"), stderr: join(root, "stderr"), capture: "memory",
      timeout_ms: 100, started: () => {},
    });
    expect(Date.now() - begin).toBeLessThan(4000);
    expect(result.output_limit).toBe(true);
    expect(existsSync(join(root, "stdout"))).toBe(false);
    returned = true;
    await Bun.sleep(300);
    expect(signalledAfterReturn).toBe(false);
  } finally { signals.mockRestore(); rmSync(root, { recursive: true, force: true }); }
}, 10000);

test("memory capture keeps the owned child timeout", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-memory-timeout-"));
  try {
    const result = await executeOwnedProcess({ argv: ["/bin/sleep", "5"], cwd: root,
      env: { PATH: "/usr/bin:/bin" }, watched_outputs: [], capture: "memory",
      stdout: join(root, "stdout"), stderr: join(root, "stderr"), timeout_ms: 100, started: () => {} });
    expect(result.timed_out).toBe(true);
    expect(result.reaped).toBe(true);
    expect(existsSync(join(root, "stdout"))).toBe(false);
    expect(existsSync(join(root, "stderr"))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
