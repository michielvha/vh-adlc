import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("all providers distinguish authentication failures from host and service failures", () => {
  const source = realpathSync(process.env.AUTH_REFRESH_SOURCE ?? resolve(import.meta.dir, "../../../auth-refresh"));
  const scratch = mkdtempSync(join(tmpdir(), "auth-refresh-contract-"));
  try {
    const overlay = join(scratch, "overlay.json");
    writeFileSync(overlay, JSON.stringify({ Replace: {
      [join(source, "internal/check/acceptance_contract_test.go")]: join(import.meta.dir, "fixtures/probe-contract_test.go.txt"),
    } }));
    const result = Bun.spawnSync([
      "go", "test", "-count=1", `-overlay=${overlay}`, "-run", "^TestAcceptance", "-v", "./internal/check",
    ], { cwd: source, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    process.stdout.write(output);
    expect(result.exitCode, output).toBe(0);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 130_000);
