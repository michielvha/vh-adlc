// Runs the clean command's Bubblewrap tests (cmd/vh-adlc/bwrap_test.go) from
// the checker job, which installs Bubblewrap and Go. VH_ADLC_REQUIRE_BWRAP=1
// makes a missing or broken bwrap fail those tests instead of skipping, so a
// green job means both ran. macOS has no Bubblewrap; its job skips this file.

import { expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const TESTS = ["TestCleanRefusesInAPIDNamespace", "TestCleanFreesAFullTmp"];

test.skipIf(process.platform !== "linux")("clean refuses in a PID namespace and frees a full /tmp under Bubblewrap", () => {
  const r = Bun.spawnSync(
    ["go", "test", "-count=1", "-v", "-run", `^(${TESTS.join("|")})$`, "./cmd/vh-adlc"],
    { cwd: ROOT, env: { ...process.env, VH_ADLC_REQUIRE_BWRAP: "1" }, stdout: "pipe", stderr: "pipe" },
  );
  const out = r.stdout.toString() + r.stderr.toString();
  expect(out).not.toContain("--- SKIP");
  for (const name of TESTS) expect(out).toContain(`--- PASS: ${name} `);
  expect(r.exitCode).toBe(0);
}, 600_000);
