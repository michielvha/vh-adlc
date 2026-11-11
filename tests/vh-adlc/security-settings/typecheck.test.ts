import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("Security settings helper source and tests pass the repository's locked strict TypeScript compiler", () => {
  const result = Bun.spawnSync(["bash", resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/security-settings/typecheck.sh")], { stdout: "pipe", stderr: "pipe", timeout: 60000 });
  expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0);
}, 60000);
