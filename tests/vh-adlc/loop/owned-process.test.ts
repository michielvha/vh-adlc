// The owned-process runner stops everything a client left behind, including helpers that left its group.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markedProcesses, runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";

const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
function scratch() { const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-owned-"))); made.push(dir); return dir; }
const env = () => Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"));
const limits = { timeout_ms: 5_000, grace_ms: 200, reap_ms: 1_000 };

describe("cleanup", () => {
  test("a successful client leaves nothing running and cleanup is confirmed", async () => {
    const dir = scratch();
    const result = await runOwnedClient(["bash", "-c", "exit 0"], { cwd: dir, env: env(), stdout: join(dir, "o"), stderr: join(dir, "e") }, limits);
    expect(result).toMatchObject({ exit_code: 0, timed_out: false, reaped: true, group_absent: true, survivors: [], confirmed: true });
  });

  test("a helper that detached into its own session is stopped and cleanup is confirmed", async () => {
    const dir = scratch(), late = join(dir, "late"), ready = join(dir, "ready"), marker = `test-${crypto.randomUUID()}`;
    const script = `setsid bash -c 'echo $$ > ${ready}; sleep 1; echo x > ${late}' </dev/null >/dev/null 2>&1 &\nwhile [ ! -s ${ready} ]; do sleep 0.05; done`;
    const result = await runOwnedClient(["bash", "-c", script], { cwd: dir, env: env(), stdout: join(dir, "o"), stderr: join(dir, "e"), marker }, limits);
    expect(result.confirmed).toBe(true);
    expect(result.survivors).toEqual([]);
    expect(markedProcesses(marker)).toEqual([]);
    await Bun.sleep(1_300);
    expect(existsSync(late)).toBe(false);
  });

  test("a timed-out client is stopped with its helpers", async () => {
    const dir = scratch(), late = join(dir, "late");
    const result = await runOwnedClient(["bash", "-c", `(sleep 1; echo x > ${late}) & sleep 30`], { cwd: dir, env: env(), stdout: join(dir, "o"), stderr: join(dir, "e") },
      { ...limits, timeout_ms: 300 });
    expect(result).toMatchObject({ timed_out: true, confirmed: true });
    await Bun.sleep(1_300);
    expect(existsSync(late)).toBe(false);
  });

  test("an absent group is reported as absent, not as a failed signal", async () => {
    const dir = scratch();
    const result = await runOwnedClient(["bash", "-c", "exit 0"], { cwd: dir, env: env(), stdout: join(dir, "o"), stderr: join(dir, "e") }, limits);
    for (const record of result.signals.filter(s => !s.accepted)) expect(record.error).toBe("ESRCH");
  });
});

describe("the PID namespace boundary", () => {
  test("a detached helper that cleared its environment is stopped when the client exits", async () => {
    const dir = scratch(), late = join(dir, "late"), ready = join(dir, "ready");
    const script = `setsid env -i /bin/bash -c 'echo $$ > ${ready}; sleep 1; echo x > ${late}' </dev/null >/dev/null 2>&1 &\nwhile [ ! -s ${ready} ]; do sleep 0.05; done`;
    const result = await runOwnedClient(["bash", "-c", script], { cwd: dir, env: env(), stdout: join(dir, "o"), stderr: join(dir, "e"), pidNamespace: true }, limits);
    expect(result).toMatchObject({ confirmed: true, boundary: "pid-namespace" });
    await Bun.sleep(1_300);
    expect(existsSync(late)).toBe(false);
  });

  test("the same helper after a timeout is stopped too", async () => {
    const dir = scratch(), late = join(dir, "late"), ready = join(dir, "ready");
    const script = `setsid env -i /bin/bash -c 'echo $$ > ${ready}; sleep 1; echo x > ${late}' </dev/null >/dev/null 2>&1 &\nwhile [ ! -s ${ready} ]; do sleep 0.05; done\nsleep 30`;
    const result = await runOwnedClient(["bash", "-c", script], { cwd: dir, env: env(), stdout: join(dir, "o"), stderr: join(dir, "e"), pidNamespace: true }, { ...limits, timeout_ms: 500 });
    expect(result).toMatchObject({ timed_out: true, confirmed: true, boundary: "pid-namespace" });
    await Bun.sleep(1_300);
    expect(existsSync(late)).toBe(false);
  });
});

describe("hosts that forbid probing process groups", () => {
  test("cleanup reports unconfirmed, never confirmed, when the group cannot be probed", async () => {
    const { groupProbe } = await import("../../../plugins/vh-adlc/scripts/triage/owned-process");
    expect(groupProbe("EPERM")).toBe("unknown");
    expect(groupProbe("ESRCH")).toBe("gone");
    expect(groupProbe(undefined)).toBe("alive");
  });
});
