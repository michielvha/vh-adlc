import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("doctor rejects an unverified cached driver before executing it", () => {
  const source = realpathSync(process.env.AUTH_REFRESH_SOURCE ?? resolve(import.meta.dir, "../../../auth-refresh"));
  const scratch = mkdtempSync(join(tmpdir(), "auth-refresh-integrity-"));
  try {
    const binary = join(scratch, "auth-refresh");
    const build = Bun.spawnSync(["go", "build", "-o", binary, "./cmd/auth-refresh"], {
      cwd: source, stdout: "pipe", stderr: "pipe", timeout: 120_000,
    });
    expect(build.exitCode, build.stderr.toString()).toBe(0);
    const driver = join(scratch, "driver");
    mkdirSync(join(driver, "package"), { recursive: true });
    writeFileSync(join(driver, "package/cli.js"), "// Inert acceptance fixture.\n");
    writeFileSync(join(driver, "node"), '#!/bin/sh\nprintf fixture > "$AUTH_REFRESH_TEST_MARKER"\nexit 1\n', { mode: 0o700 });
    const marker = join(scratch, "executed");
    const result = Bun.spawnSync([binary, "doctor"], {
      env: {
        ...process.env,
        PLAYWRIGHT_DRIVER_PATH: driver,
        PLAYWRIGHT_BROWSERS_PATH: join(scratch, "browser"),
        AUTH_REFRESH_TEST_MARKER: marker,
      },
      stdout: "pipe", stderr: "pipe", timeout: 20_000,
    });
    expect(result.exitCode).not.toBe(0);
    expect(existsSync(marker), "the unverified driver executed before rejection").toBe(false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 150_000);
