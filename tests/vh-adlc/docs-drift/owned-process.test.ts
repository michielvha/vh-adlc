import { expect, test } from "bun:test";
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
