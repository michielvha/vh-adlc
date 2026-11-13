// The controller owns one detached process group. Never signal by process name.
//
// Cleanup has two parts. The group the child leads is signalled after the child exits, because even a
// successful parent can leave a driver or helper behind in it. A helper can also leave the group with
// setsid or setpgid, so every child carries an owner marker in its environment, which descendants
// inherit, and processes that still carry it after the group is gone are stopped as well. `confirmed`
// is true only when neither the group nor any marked process remains.
import { existsSync, readdirSync, readFileSync } from "node:fs";

type Signal = "SIGTERM" | "SIGKILL";
export type SignalRecord = { signal: Signal; accepted: boolean; error?: string };
export type OwnedResult = {
  exit_code: number; timed_out: boolean; reaped: boolean; signals: SignalRecord[];
  group_absent: boolean; survivors: number[]; confirmed: boolean;
  /** `pid-namespace` when the client ran in its own PID namespace, whose every process the kernel stops when the client exits. */
  boundary: "pid-namespace" | "marker";
};

let namespaceProbe: boolean | undefined;
/** Whether this host can run a client in an unprivileged PID namespace (Linux with user namespaces). */
export function pidNamespaceAvailable(): boolean {
  if (namespaceProbe === undefined) {
    const probe = Bun.spawnSync(["unshare", "--user", "--map-current-user", "--pid", "--fork", "--kill-child", "true"], { stdout: "ignore", stderr: "ignore" });
    namespaceProbe = probe.exitCode === 0;
  }
  return namespaceProbe;
}

export const OWNER_MARKER_VARIABLE = "VH_ADLC_OWNED_PROCESS";

/** Process ids whose environment carries `marker`, other than this process. */
export function markedProcesses(marker: string): number[] {
  const needle = `${OWNER_MARKER_VARIABLE}=${marker}`;
  if (existsSync("/proc/self/environ")) {
    const found: number[] = [];
    for (const name of readdirSync("/proc")) {
      if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
      try {
        if (readFileSync(`/proc/${name}/environ`, "latin1").split("\0").includes(needle)) found.push(Number(name));
      } catch { /* gone, or not ours */ }
    }
    return found;
  }
  const ps = Bun.spawnSync(["ps", "-axeww", "-o", "pid=,command="], { stdout: "pipe", stderr: "ignore" });
  return ps.stdout.toString().split("\n").flatMap(line => {
    const match = /^\s*(\d+)\s(.*)$/.exec(line);
    return match && Number(match[1]) !== process.pid && match[2]!.split(/\s+/).includes(needle) ? [Number(match[1])] : [];
  });
}

function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

export async function runOwnedClient(argv: string[], options: { cwd: string; env: Record<string, string>; stdout: string; stderr: string; started?: (pid: number) => void; marker?: string; pidNamespace?: boolean },
  limits = { timeout_ms: 12 * 60_000, grace_ms: 500, reap_ms: 2000 }): Promise<OwnedResult> {
  const marker = options.marker ?? `${process.pid}-${crypto.randomUUID()}`;
  // In a PID namespace the client is its init process: when it exits, the kernel kills every process left
  // in the namespace, including helpers that left the group and cleared their environment.
  const boundary = options.pidNamespace && pidNamespaceAvailable() ? "pid-namespace" as const : "marker" as const;
  if (boundary === "pid-namespace") argv = ["unshare", "--user", "--map-current-user", "--pid", "--fork", "--kill-child", "--", ...argv];
  const child = Bun.spawn(argv, { cwd: options.cwd, env: { ...options.env, [OWNER_MARKER_VARIABLE]: marker },
    stdout: Bun.file(options.stdout), stderr: Bun.file(options.stderr), stdin: "ignore", detached: true });
  const signals: SignalRecord[] = [];
  let groupAbsent = false;
  const signal = (value: Signal) => {
    try { process.kill(-child.pid, value); signals.push({ signal: value, accepted: true }); return true; } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "unknown";
      if (code === "ESRCH") groupAbsent = true;
      signals.push({ signal: value, accepted: false, error: code });
      return false;
    }
  };
  async function wait(milliseconds: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([child.exited.then(exit => ({ exit })), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), milliseconds); })]);
    } finally { clearTimeout(timer); }
  }
  async function stopMarked(): Promise<number[]> {
    for (const value of ["SIGTERM", "SIGKILL"] as const) {
      const live = markedProcesses(marker);
      if (!live.length) return [];
      for (const pid of live) { try { process.kill(pid, value); } catch { /* already gone */ } }
      await Bun.sleep(value === "SIGTERM" ? limits.grace_ms : 100);
    }
    return markedProcesses(marker);
  }
  try { options.started?.(child.pid); } catch (error) {
    signal("SIGTERM"); await wait(limits.grace_ms); signal("SIGKILL"); await wait(limits.reap_ms); await stopMarked();
    throw error;
  }
  const first = await wait(limits.timeout_ms), timedOut = first === null;
  if (signal("SIGTERM")) { await Bun.sleep(limits.grace_ms); signal("SIGKILL"); }
  const final = first ?? await wait(limits.reap_ms);
  const survivors = await stopMarked();
  const groupGone = !groupAlive(child.pid);
  if (groupGone) groupAbsent = true;
  const failedSignal = signals.some(record => !record.accepted && record.error !== "ESRCH");
  return { exit_code: final?.exit ?? -1, timed_out: timedOut, reaped: final !== null, signals,
    group_absent: groupAbsent, survivors, confirmed: final !== null && groupGone && survivors.length === 0 && !failedSignal, boundary };
}
