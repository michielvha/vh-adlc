// Tests for plugins/vh-adlc/scripts/host/capacity.sh, the check every operation runs before it
// creates a worktree, starts a session or sub-agent, or launches parallel local work.

import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const SCRIPT = join(ROOT, "plugins", "vh-adlc", "scripts", "host", "capacity.sh");

function run(args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["bash", SCRIPT, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const lines = result.stdout.toString().trim().split("\n");
  return { code: result.exitCode, lines, last: lines[lines.length - 1] };
}

// Limits no real host can miss, so a case controls the verdict through one threshold.
const lenient = {
  VH_ADLC_MIN_FREE_GIB: "0",
  VH_ADLC_MAX_USED_PCT: "101",
  VH_ADLC_MAX_BTRFS_METADATA_PCT: "101",
  VH_ADLC_MAX_LOAD_PER_CPU: "100000",
};

describe("host capacity check", () => {
  test("passes and says ok when every limit holds", () => {
    const out = run([tmpdir()], lenient);
    expect(out.code).toBe(0);
    expect(out.last).toBe("capacity: ok");
    expect(out.lines.some((line) => line.startsWith("ok ") && line.includes("GiB free"))).toBe(true);
    expect(out.lines.some((line) => line.startsWith("ok load:"))).toBe(true);
  });

  test("blocks when a filesystem has less free space than required", () => {
    const out = run([tmpdir()], { ...lenient, VH_ADLC_MIN_FREE_GIB: "100000000" });
    expect(out.code).toBe(1);
    expect(out.last).toBe("capacity: blocked");
    expect(out.lines.some((line) => line.startsWith("blocked ") && line.includes("GiB free"))).toBe(true);
  });

  test("blocks when the load average is above the limit", () => {
    const out = run([tmpdir()], { ...lenient, VH_ADLC_MAX_LOAD_PER_CPU: "-1" });
    expect(out.code).toBe(1);
    expect(out.lines.some((line) => line.startsWith("blocked load:"))).toBe(true);
  });

  test("blocks a path that does not exist instead of skipping it", () => {
    const out = run([join(tmpdir(), "vh-adlc-capacity-missing-path")], lenient);
    expect(out.code).toBe(1);
    expect(out.lines[0]).toContain("path does not exist");
  });

  test("checks the working and temp directories when given no path", () => {
    const out = run([], lenient);
    expect(out.code).toBe(0);
    expect(out.lines.filter((line) => line.includes("GiB free")).length).toBeGreaterThanOrEqual(1);
  });
});
