import { lstatSync } from "node:fs";

export type OwnedProcess = {
  pid: number; exit_code: number | null; timed_out: boolean; cancelled: string | null; output_limit: boolean; reaped: boolean;
  captured?: { stdout: Uint8Array; stderr: Uint8Array };
};

export const OUTPUT_LIMIT = 16 * 1024 * 1024;

export function outputSize(path: string): number {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("nonregular owned process output");
    return stat.size;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
}

/** Own one process group, including helpers left behind after its parent exits. */
export async function executeOwnedProcess(options: {
  argv: string[]; cwd: string; env: Record<string, string>; watched_outputs: string[];
  stdout: string; stderr: string; capture?: "memory"; timeout_ms: number; max_output_bytes?: number; started: (pid: number) => void | false;
}): Promise<OwnedProcess> {
  const { argv, cwd, env, watched_outputs, stdout, stderr, timeout_ms: timeout, started } = options;
  const limit = options.max_output_bytes ?? OUTPUT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(timeout) || timeout < 1) throw new Error("invalid owned process bounds");
  const child = Bun.spawn(argv, { cwd, env, stdin: "ignore", stdout: options.capture === "memory" ? "pipe" : Bun.file(stdout), stderr: options.capture === "memory" ? "pipe" : Bun.file(stderr), detached: true });
  const result: OwnedProcess = { pid: child.pid, exit_code: null, timed_out: false, cancelled: null, output_limit: false, reaped: false };
  const signal = (value: "SIGTERM" | "SIGKILL") => {
    try { process.kill(-child.pid, value); return true; } catch { return false; }
  };
  let escalation: ReturnType<typeof setTimeout> | undefined;
  let groupCleanupStarted = false;
  const stop = () => {
    if (groupCleanupStarted) return;
    signal("SIGTERM");
    escalation ??= setTimeout(() => signal("SIGKILL"), 200);
  };
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  let capturedBytes = 0;
  async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    readers.push(reader);
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        capturedBytes += next.value.byteLength;
        if (capturedBytes > limit) { result.output_limit = true; stop(); }
        else chunks.push(next.value);
      }
      return Buffer.concat(chunks);
    } finally { reader.releaseLock(); }
  }
  const captured = options.capture === "memory"
    ? Promise.all([drain(child.stdout as ReadableStream<Uint8Array>), drain(child.stderr as ReadableStream<Uint8Array>)])
    : null;
  // Attach rejection handling immediately while process termination is still being awaited.
  const capturedResult = captured?.then(value => ({ value }), () => ({ value: null }));
  const captureDeadline = capturedResult ? setTimeout(() => {
    result.output_limit = true;
    for (const reader of readers) reader.cancel().catch(() => {});
  }, timeout + 2500) : undefined;
  const interrupt = () => { result.cancelled = "SIGINT"; stop(); };
  const terminate = () => { result.cancelled = "SIGTERM"; stop(); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  const timer = setTimeout(() => { result.timed_out = true; stop(); }, timeout);
  const monitor = setInterval(() => {
    try {
      if ([...watched_outputs, stdout, stderr].some(path => outputSize(path) > limit)) { result.output_limit = true; stop(); }
    } catch { result.output_limit = true; stop(); }
  }, 50);
  try {
    let reap: ReturnType<typeof setTimeout> | undefined;
    try {
      if (started(child.pid) === false) { result.cancelled = "startup-capture"; stop(); }
      result.exit_code = await Promise.race([
        child.exited,
        new Promise<null>(resolve => { reap = setTimeout(() => resolve(null), timeout + 2500); }),
      ]);
      result.reaped = result.exit_code !== null;
    } finally {
      groupCleanupStarted = true;
      clearTimeout(timer);
      clearTimeout(reap);
      clearInterval(monitor);
      clearTimeout(escalation);
      if (signal("SIGTERM")) { await Bun.sleep(200); signal("SIGKILL"); }
      if (!result.reaped) {
        let finalTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          result.exit_code = await Promise.race([
            child.exited,
            new Promise<null>(resolve => { finalTimer = setTimeout(() => resolve(null), 2000); }),
          ]);
          result.reaped = result.exit_code !== null;
        } finally { clearTimeout(finalTimer); }
      }
      try { result.output_limit ||= [...watched_outputs, stdout, stderr].some(path => outputSize(path) > limit); }
      catch { result.output_limit = true; }
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    }
    if (capturedResult) {
      const { value } = await capturedResult;
      clearTimeout(captureDeadline);
      clearTimeout(escalation);
      if (value === null) result.output_limit = true;
      else result.captured = { stdout: value[0], stderr: value[1] };
    }
    return result;
  } finally {
    clearTimeout(captureDeadline);
    clearTimeout(escalation);
    for (const reader of readers) reader.cancel().catch(() => {});
    await capturedResult;
  }

}

