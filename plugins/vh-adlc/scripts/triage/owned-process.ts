// The controller owns one detached process group. Never signal by process name.
//
// Cleanup has two parts. The group the child leads is signalled after the child exits, because even a
// successful parent can leave a driver or helper behind in it. A helper can also leave the group with
// setsid or setpgid, so every child carries an owner marker in its environment, which descendants
// inherit, and processes that still carry it after the group is gone are stopped as well. `confirmed`
// is true only when neither the group nor any marked process remains.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";

type Signal = "SIGTERM" | "SIGKILL";
export type SignalRecord = { signal: Signal; accepted: boolean; error?: string };
export type OwnedResult = {
  pid: number; exit_code: number; timed_out: boolean; reaped: boolean; signals: SignalRecord[];
  cancelled: string | null; output_limit: boolean; captured?: { stdout: Uint8Array; stderr: Uint8Array };
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

/** What a signal-0 probe of a process group tells: `unknown` when the host forbids the probe (EPERM). */
export function groupProbe(errorCode: string | undefined): "alive" | "gone" | "unknown" {
  if (errorCode === undefined) return "alive";
  return errorCode === "ESRCH" ? "gone" : "unknown";
}
function probeGroup(pgid: number): "alive" | "gone" | "unknown" {
  try { process.kill(-pgid, 0); return groupProbe(undefined); } catch (error) { return groupProbe((error as NodeJS.ErrnoException).code ?? "unknown"); }
}

export const OUTPUT_LIMIT = 16 * 1024 * 1024;

export function outputSize(path: string): number {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("nonregular owned process output");
    return stat.size;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
}

/** Completed commands require both their expected exit and confirmed owned-process cleanup. */
export function ownedClientCompleted(value: unknown, expectedExit = 0): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.exit_code === expectedExit && Number.isSafeInteger(result.exit_code)
    && result.reaped === true && result.timed_out === false && result.cancelled === null && result.output_limit === false
    && result.confirmed === true && result.group_absent === true
    && Array.isArray(result.survivors) && result.survivors.length === 0
    && (result.boundary === "marker" || result.boundary === "pid-namespace");
}

export type OwnedOptions = {
  cwd: string; env: Record<string, string>; stdout: string; stderr: string;
  started?: (pid: number) => void | false; marker?: string; pidNamespace?: boolean;
  capture?: "memory"; watchedOutputs?: string[]; maxOutputBytes?: number; signal?: AbortSignal;
};

export async function runOwnedClient(argv: string[], options: OwnedOptions,
  limits = { timeout_ms: 12 * 60_000, grace_ms: 500, reap_ms: 2000 }): Promise<OwnedResult> {
  const limit = options.maxOutputBytes ?? (options.capture === "memory" || options.watchedOutputs ? OUTPUT_LIMIT : undefined);
  if ([limits.timeout_ms, limits.grace_ms, limits.reap_ms].some(value => !Number.isSafeInteger(value) || value < 0)
    || limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw Error("invalid owned process bounds");
  if (options.signal?.aborted) throw Error("owned client cancelled before startup");
  const marker = options.marker ?? `${process.pid}-${crypto.randomUUID()}`;
  // Namespace init exit also stops descendants that cleared their inherited marker.
  const boundary = options.pidNamespace && pidNamespaceAvailable() ? "pid-namespace" as const : "marker" as const;
  if (boundary === "pid-namespace") argv = ["unshare", "--user", "--map-current-user", "--pid", "--fork", "--kill-child", "--", ...argv];
  const child = Bun.spawn(argv, { cwd: options.cwd, env: { ...options.env, [OWNER_MARKER_VARIABLE]: marker },
    stdout: options.capture === "memory" ? "pipe" : Bun.file(options.stdout),
    stderr: options.capture === "memory" ? "pipe" : Bun.file(options.stderr), stdin: "ignore", detached: true });
  const signals: SignalRecord[] = [];
  let groupAbsent = false, timedOut = false, outputLimit = false;
  let cancelled: string | null = null;
  let requestStop: () => void = () => {};
  const stopped = new Promise<null>(resolve => { requestStop = () => resolve(null); });
  const signal = (value: Signal) => {
    if (groupAbsent) return false;
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
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  let capturedBytes = 0;
  function cancelReaders() {
    for (const reader of readers) {
      try { reader.cancel().catch(() => {}); } catch { /* reader already released */ }
    }
  }
  async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [], reader = stream.getReader();
    readers.push(reader);
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        capturedBytes += next.value.byteLength;
        if (limit !== undefined && capturedBytes > limit) { outputLimit = true; requestStop(); }
        else chunks.push(next.value);
      }
      return Buffer.concat(chunks);
    } finally { reader.releaseLock(); }
  }
  const capturedResult = options.capture === "memory"
    ? Promise.all([drain(child.stdout as ReadableStream<Uint8Array>), drain(child.stderr as ReadableStream<Uint8Array>)])
      .then(value => ({ value }), () => { outputLimit = true; requestStop(); return { value: null }; })
    : null;
  const captureDeadline = capturedResult ? setTimeout(() => {
    outputLimit = true; requestStop(); cancelReaders();
  }, limits.timeout_ms + limits.grace_ms + limits.reap_ms) : undefined;
  const watched = [...(options.watchedOutputs ?? []), ...(options.capture === "memory" ? [] : [options.stdout, options.stderr])];
  const checkOutputs = () => {
    if (limit === undefined) return;
    try {
      if (watched.some(path => outputSize(path) > limit)) { outputLimit = true; requestStop(); }
    } catch { outputLimit = true; requestStop(); }
  };
  const monitor = limit === undefined ? undefined : setInterval(checkOutputs, 50);
  const timeout = setTimeout(() => { timedOut = true; requestStop(); }, limits.timeout_ms);
  const abort = () => {
    const reason: unknown = options.signal?.reason;
    cancelled = reason === "SIGINT" || reason === "SIGTERM" ? reason : "aborted";
    requestStop();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  let startupFailure: { error: unknown } | undefined;
  try {
    try {
      if (options.started?.(child.pid) === false) { cancelled = "startup-capture"; requestStop(); }
    } catch (error) { startupFailure = { error }; requestStop(); }
    const first = await Promise.race([child.exited.then(exit => ({ exit })), stopped]);
    clearTimeout(timeout);
    if (signal("SIGTERM")) { await Bun.sleep(limits.grace_ms); signal("SIGKILL"); }
    const final = first ?? await wait(limits.reap_ms);
    const survivors = await stopMarked();
    const groupGone = groupAbsent || probeGroup(child.pid) === "gone";
    if (groupGone) groupAbsent = true;
    checkOutputs();
    const captured = capturedResult ? await capturedResult : null;
    if (startupFailure) throw startupFailure.error;
    const failedSignal = signals.some(record => !record.accepted && record.error !== "ESRCH");
    return { pid: child.pid, exit_code: final?.exit ?? -1, timed_out: timedOut, reaped: final !== null, signals,
      cancelled, output_limit: outputLimit,
      ...(captured?.value ? { captured: { stdout: captured.value[0], stderr: captured.value[1] } } : {}),
      group_absent: groupAbsent, survivors, confirmed: final !== null && groupGone && survivors.length === 0 && !failedSignal, boundary };
  } finally {
    clearTimeout(timeout); clearInterval(monitor); clearTimeout(captureDeadline);
    options.signal?.removeEventListener("abort", abort);
    cancelReaders();
    await capturedResult;
  }
}
