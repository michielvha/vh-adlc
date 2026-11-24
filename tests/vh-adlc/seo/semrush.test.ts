import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const helper = join(root, "plugins/vh-adlc/scripts/seo/semrush.ts");
const KEY = "fixture-KEY_0123456789abcdef";
const OTHER_KEY = "other-KEY_fedcba9876543210";
const KEY_67 = "abcdefghijklmnop-qrstuvwxyz012345-6789ABCDEFGHIJKL-MNOPQRSTUV_wxyz";
const LOCK_WAIT_MS = 30_000;
const SLOW = 120_000;
const hasBwrap = spawnSync("sh", ["-c", "command -v bwrap"]).status === 0 &&
  spawnSync("bwrap", ["--unshare-pid", "--dev-bind", "/", "/", "true"]).status === 0;

type Seen = { path: string; query: URLSearchParams; headers: Headers; body: string };
type Reply = (seen: Seen) => Response | Promise<Response> | "drop";

class Stub {
  seen: Seen[] = [];
  reply: Reply = defaultReply;
  server!: ReturnType<typeof Bun.serve>;
  start() {
    this.server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request, server) => {
        const url = new URL(request.url);
        const seen = { path: url.pathname, query: url.searchParams, headers: request.headers, body: await request.text() };
        this.seen.push(seen);
        const out = await this.reply(seen);
        if (out === "drop") {
          server.timeout(request, 1);
          await Bun.sleep(5_000);
          return new Response("late");
        }
        return out;
      },
    });
    return this;
  }
  get base() {
    return `http://127.0.0.1:${this.server.port}`;
  }
  reports() {
    return this.seen.filter((seen) => seen.path === "/" || seen.path === "/v2/mcp");
  }
  reset() {
    this.seen = [];
    this.reply = defaultReply;
  }
}

function csv(rows: number) {
  const lines = ["Domain;Rank;Organic Keywords"];
  for (let i = 0; i < rows; i++) lines.push(`example.test;${i + 1};${100 - i}`);
  return lines.join("\n") + "\n";
}

function defaultReply(seen: Seen): Response {
  if (seen.path === "/users/countapiunits.html") return new Response("1,000,000");
  if (seen.path === "/") {
    if (seen.query.get("key") !== KEY && seen.query.get("key") !== OTHER_KEY && seen.query.get("key") !== KEY_67) {
      return new Response("ERROR 120 :: WRONG KEY - ID PAIR", { status: 403 });
    }
    return new Response(csv(Number(seen.query.get("display_limit") ?? "0")));
  }
  return new Response("not found", { status: 404 });
}

let stub: Stub;
let work: string;

beforeAll(() => {
  stub = new Stub().start();
  work = mkdtempSync(join(tmpdir(), "vh-adlc-semrush-"));
});
afterAll(() => {
  stub.server.stop(true);
  rmSync(work, { recursive: true, force: true });
});
beforeEach(() => stub.reset());

let counter = 0;
function fresh(name: string) {
  const dir = join(work, `${name}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  const keyFile = join(dir, "semrush.key");
  writeFileSync(keyFile, `${KEY}\n`);
  return { dir, out: join(dir, "run"), keyFile };
}

type Run = { code: number; stdout: string; stderr: string; result: Record<string, unknown> };

function args(o: { route?: string; out: string; keyFile?: string; max?: number | null; allow?: boolean; report?: string; target?: string; database?: string; limit?: string; date?: string; extra?: string[] }) {
  const a: string[] = [];
  if (o.route !== undefined) a.push("--route", o.route);
  a.push("--output", o.out);
  if (o.max !== null) a.push("--max-units", String(o.max ?? 1500));
  if (o.allow !== false) a.push("--allow-units");
  if (o.keyFile) a.push("--key-file", o.keyFile);
  a.push("--report", o.report ?? "domain_ranks", "--target", o.target ?? "first-target.example");
  if (o.database) a.push("--database", o.database);
  if (o.limit !== undefined) a.push("--display-limit", o.limit);
  if (o.date) a.push("--display-date", o.date);
  return [...a, ...(o.extra ?? [])];
}

function env(extra: Record<string, string> = {}, base = stub.base) {
  return { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", VH_ADLC_SEMRUSH_BASE: base, ...extra };
}

function spawn(argv: string[], e = env(), wrap: string[] = []) {
  return Bun.spawn([...wrap, process.execPath, helper, ...argv], { env: e, stdout: "pipe", stderr: "pipe" });
}

async function finish(proc: ReturnType<typeof spawn>): Promise<Run> {
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
  } catch {}
  return { code, stdout, stderr, result };
}

const run = (argv: string[], e = env(), wrap: string[] = []) => finish(spawn(argv, e, wrap));

function ledger(out: string) {
  return JSON.parse(readFileSync(join(out, "ledger.json"), "utf8"));
}

function counted(out: string) {
  const l = ledger(out);
  return (l.entries as { units: number }[]).reduce((sum, entry) => sum + entry.units, 0);
}

function savedFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function expectNoKey(r: Run, out: string, key = KEY) {
  expect(r.stdout).not.toContain(key);
  expect(r.stderr).not.toContain(key);
  for (const file of savedFiles(out)) expect(readFileSync(file, "utf8")).not.toContain(key);
}

async function lockHolder(out: string, ms: number, wrap: string[] = []) {
  mkdirSync(out, { recursive: true });
  const script = join(work, "hold-lock.ts");
  writeFileSync(
    script,
    `import { dlopen, FFIType } from "bun:ffi";
import { openSync } from "node:fs";
const lib = dlopen(process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6", { flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } });
const fd = openSync(process.argv[2], "a+");
if (lib.symbols.flock(fd, 2) !== 0) process.exit(3);
console.log("locked");
await Bun.sleep(Number(process.argv[3]));
`,
  );
  const proc = Bun.spawn([...wrap, process.execPath, script, join(out, "ledger.lock"), String(ms)], { stdout: "pipe", stderr: "inherit" });
  const reader = proc.stdout.getReader();
  const { value } = await reader.read();
  expect(new TextDecoder().decode(value)).toContain("locked");
  return proc;
}

describe("refusals before any request", () => {
  test("refuses a unit-spending report without --allow-units", async () => {
    const f = fresh("no-allow");
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, allow: false }));
    expect(r.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
  });

  test("refuses --allow-units without --max-units", async () => {
    const f = fresh("no-max");
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, max: null }));
    expect(r.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
  });

  test("refuses a missing --route and a changed --route", async () => {
    const f = fresh("route");
    const missing = await run(args({ out: f.out, keyFile: f.keyFile }));
    expect(missing.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
    const first = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(first.result.outcome).toBe("success");
    stub.reset();
    const changed = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1", target: "second-target.example" }));
    expect(changed.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
  });

  test("refuses a second invocation with a different --max-units", async () => {
    const f = fresh("max-change");
    expect((await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }))).result.outcome).toBe("success");
    stub.reset();
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1", max: 2000, target: "second-target.example" }));
    expect(r.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
  });

  test("refuses a run with neither --key-file nor --key-env", async () => {
    const f = fresh("no-key");
    const r = await run(args({ route: "v3", out: f.out }), env({ SEMRUSH_API_KEY: KEY }));
    expect(r.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
  });

  test("refuses a non-loopback base, including http://api.semrush.com", async () => {
    for (const base of ["http://api.semrush.com", "https://example.com", "http://10.0.0.1:8080", "ftp://127.0.0.1"]) {
      const f = fresh("base");
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile }), env({}, base));
      expect(r.result.outcome).toBe("refused");
    }
    expect(stub.seen).toHaveLength(0);
  });

  test("refuses a multi-line or non-token credential file", async () => {
    const privateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n";
    const envLines = `SEMRUSH_API_KEY=${KEY}\nOTHER_SECRET=abcdefghijklmnopqrstu\n`;
    for (const content of [privateKey, envLines, "short\n", "has spaces in it here\n"]) {
      const f = fresh("bad-key");
      writeFileSync(f.keyFile, content);
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile }));
      expect(r.result.outcome).toBe("refused");
      expect(r.stdout + r.stderr).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC");
    }
    expect(stub.seen).toHaveLength(0);
  });

  test("refuses a limit below one row's price", async () => {
    const f = fresh("tiny-limit");
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, max: 5, limit: "1" }));
    expect(r.result.outcome).toBe("limit");
    expect(stub.seen).toHaveLength(0);
  });

  test("prices a historical request at the historical rate", async () => {
    const f = fresh("historical");
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, max: 30, limit: "1", date: "20260115" }));
    expect(r.result.outcome).toBe("limit");
    expect(stub.seen).toHaveLength(0);
    stub.reset();
    const regular = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, max: 30, limit: "1" }));
    expect(regular.result.outcome).toBe("success");
  });
});

describe("credential sources", () => {
  test("reads a bare key, a SEMRUSH_API_KEY= line and a 67-character key", async () => {
    for (const [content, expected] of [[`${KEY}\n`, KEY], [`SEMRUSH_API_KEY=${KEY}\n`, KEY], [`${KEY_67}\n`, KEY_67]]) {
      stub.reset();
      const f = fresh("good-key");
      writeFileSync(f.keyFile, content);
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(r.result.outcome).toBe("success");
      expect(stub.reports()[0].query.get("key")).toBe(expected);
      expectNoKey(r, f.out, expected);
    }
  });

  test("uses the --key-file key even when SEMRUSH_API_KEY holds another", async () => {
    const f = fresh("file-over-env");
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }), env({ SEMRUSH_API_KEY: OTHER_KEY }));
    expect(r.result.outcome).toBe("success");
    expect(stub.reports()[0].query.get("key")).toBe(KEY);
  });

  test("uses only the variable --key-env names", async () => {
    const f = fresh("key-env");
    const r = await run(
      args({ route: "v3", out: f.out, limit: "1", extra: ["--key-env", "SITE_SEMRUSH"] }),
      env({ SITE_SEMRUSH: OTHER_KEY, SEMRUSH_API_KEY: KEY }),
    );
    expect(r.result.outcome).toBe("success");
    const keys = stub.seen.map((seen) => seen.query.get("key"));
    expect(keys.every((key) => key === OTHER_KEY)).toBe(true);
  });
});

describe("row fitting and the unit limit", () => {
  test("fits a full report, then a lowered row limit, then refuses with limit", async () => {
    const f = fresh("fit");
    const a = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100" }));
    expect(a.result.outcome).toBe("success");
    const b = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100", target: "second-target.example" }));
    expect(b.result.outcome).toBe("success");
    const c = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100", target: "third-target.example" }));
    expect(c.result.outcome).toBe("limit");
    const limits = stub.reports().map((seen) => seen.query.get("display_limit"));
    expect(limits).toEqual(["100", "50"]);
    expect(counted(f.out)).toBe(1500);
    expect(counted(f.out)).toBeLessThanOrEqual(1500);
  });

  test("sends 100 rows for an absent, zero or oversized display_limit", async () => {
    const f = fresh("display-limit");
    for (const [limit, target] of [[undefined, "a.example"], ["0", "b.example"], ["1000", "c.example"]] as const) {
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, max: 3000, limit, target }));
      expect(r.result.outcome).toBe("success");
    }
    expect(stub.reports().map((seen) => seen.query.get("display_limit"))).toEqual(["100", "100", "100"]);
  });

  test("keeps the limit across two concurrent invocations", async () => {
    const f = fresh("concurrent");
    const runs = await Promise.all([
      run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100" })),
      run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100", target: "second-target.example" })),
    ]);
    expect(runs.map((r) => r.result.outcome).sort()).toEqual(["success", "success"]);
    expect(counted(f.out)).toBeLessThanOrEqual(1500);
    const sent = stub.reports().map((seen) => Number(seen.query.get("display_limit"))).sort((x, y) => x - y);
    expect(sent).toEqual([50, 100]);
  });

  test("keeps both entries when one reconciles while another reserves", async () => {
    const f = fresh("interleave");
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    stub.reply = async (seen) => {
      if (seen.path === "/" && ++calls === 1) await held;
      return defaultReply(seen);
    };
    const first = spawn(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10" }));
    while (stub.reports().length < 1) await Bun.sleep(20);
    const second = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10", target: "second-target.example" }));
    release();
    const firstDone = await finish(first);
    expect([firstDone.result.outcome, second.result.outcome]).toEqual(["success", "success"]);
    const entries = ledger(f.out).entries as { state: string }[];
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.state === "reconciled")).toBe(true);
  });

  test("counts a reservation a killed process never reconciled", async () => {
    const f = fresh("killed");
    stub.reply = async (seen) => {
      if (seen.path === "/") await Bun.sleep(60_000);
      return defaultReply(seen);
    };
    const doomed = spawn(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100" }));
    while (stub.reports().length < 1) await Bun.sleep(20);
    doomed.kill("SIGKILL");
    await doomed.exited;
    stub.reset();
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100", target: "second-target.example" }));
    expect(r.result.outcome).toBe("success");
    expect(stub.reports()[0].query.get("display_limit")).toBe("50");
    expect(counted(f.out)).toBe(1500);
  }, SLOW);
});

for (const mode of ["plain", "pid-namespace"] as const) {
  // --die-with-parent: killing the bwrap process must kill the holder inside the namespace.
  const wrap = mode === "pid-namespace" ? ["bwrap", "--unshare-pid", "--die-with-parent", "--dev-bind", "/", "/", "--"] : [];
  const skip = mode === "pid-namespace" && !hasBwrap;
  if (skip) console.log("skipping the PID-namespace lock cases: bwrap is not available on this host");
  describe.skipIf(skip)(`the ledger lock (${mode})`, () => {
    test("gives busy and sends nothing while the lock stays held", async () => {
      const f = fresh("busy");
      const holder = await lockHolder(f.out, LOCK_WAIT_MS + 10_000, wrap);
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }), env(), wrap);
      expect(r.result.outcome).toBe("busy");
      expect(stub.seen).toHaveLength(0);
      holder.kill("SIGKILL");
      await holder.exited;
    }, SLOW);

    test("takes the lock after its holder is killed", async () => {
      const f = fresh("killed-holder");
      const holder = await lockHolder(f.out, 600_000, wrap);
      holder.kill("SIGKILL");
      await holder.exited;
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }), env(), wrap);
      expect(r.result.outcome).toBe("success");
      expect(ledger(f.out).entries).toHaveLength(1);
    }, SLOW);

    test("never exceeds the limit when two start together after a holder is killed", async () => {
      const f = fresh("race");
      const holder = await lockHolder(f.out, 600_000, wrap);
      const contenders = [
        spawn(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100" }), env(), wrap),
        spawn(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "100", target: "second-target.example" }), env(), wrap),
      ];
      await Bun.sleep(200);
      holder.kill("SIGKILL");
      await holder.exited;
      const runs = await Promise.all(contenders.map(finish));
      for (const r of runs) expect(["success", "limit"]).toContain(r.result.outcome as string);
      expect(counted(f.out)).toBeLessThanOrEqual(1500);
    }, SLOW);
  });
}

describe("pending ledger updates", () => {
  test("keeps a reconciliation that cannot get the lock and merges it later", async () => {
    const f = fresh("pending");
    let holder: Awaited<ReturnType<typeof lockHolder>> | undefined;
    stub.reply = async (seen) => {
      if (seen.path === "/") holder = await lockHolder(f.out, LOCK_WAIT_MS + 5_000);
      return defaultReply(seen);
    };
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10" }));
    expect(r.result.outcome).toBe("success");
    const pending = join(f.out, "ledger.pending");
    expect(readdirSync(pending).length).toBe(1);
    holder!.kill("SIGKILL");
    await holder!.exited;
    stub.reset();
    const next = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10", target: "second-target.example" }));
    expect(next.result.outcome).toBe("success");
    expect(readdirSync(pending)).toHaveLength(0);
    const entries = ledger(f.out).entries as { state: string; units: number }[];
    expect(entries.map((entry) => entry.state)).toEqual(["reconciled", "reconciled"]);
    expect(counted(f.out)).toBe(200);
  }, SLOW);
});

describe("transport failures on the v3 route", () => {
  test("releases the reservation when the connection is refused, and a later identical request is sent", async () => {
    const f = fresh("refused-port");
    const closed = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
    const port = closed.port;
    closed.stop(true);
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10" }), env({}, `http://127.0.0.1:${port}`));
    expect(r.result.outcome).toBe("transport_error");
    const l = ledger(f.out);
    expect(l.entries[0].state).toBe("released");
    expect(counted(f.out)).toBe(0);
    expect(l.failures).toHaveLength(0);
    const again = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10" }));
    expect(again.result.outcome).toBe("success");
    expect(stub.reports()).toHaveLength(1);
  });

  test("keeps the full reservation, marked estimated, when the connection drops after the request", async () => {
    const f = fresh("dropped");
    stub.reply = (seen) => (seen.path === "/" ? "drop" : defaultReply(seen));
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10" }));
    expect(r.result.outcome).toBe("transport_error");
    const entry = ledger(f.out).entries[0];
    expect(entry.units).toBe(100);
    expect(entry.basis).toBe("estimated");
  }, SLOW);

  test("follows no redirect", async () => {
    const f = fresh("redirect");
    const second = new Stub().start();
    stub.reply = (seen) =>
      seen.path === "/" ? new Response(null, { status: 302, headers: { location: `${second.base}/` } }) : defaultReply(seen);
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "10" }));
    expect(r.result.outcome).toBe("provider_error");
    expect(second.seen).toHaveLength(0);
    second.server.stop(true);
  });
});

describe("a successful v3 call", () => {
  test("sends the balance and report requests and saves them redacted", async () => {
    const f = fresh("success");
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(r.code).toBe(0);
    expect(r.result.outcome).toBe("success");
    expect(stub.seen.map((seen) => seen.path)).toEqual(["/users/countapiunits.html", "/"]);
    const report = stub.reports()[0];
    expect(report.query.get("type")).toBe("domain_ranks");
    expect(report.query.get("domain")).toBe("first-target.example");
    const l = ledger(f.out);
    expect(l.balance).toEqual({ value: 1000000 });
    expect(l.entries[0]).toMatchObject({ state: "reconciled", units: 10, basis: "estimated" });
    expect(l.entries[0].price_source_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const saved = savedFiles(f.out).filter((file) => file.includes(`${"/"}requests${"/"}`)).map((file) => readFileSync(file, "utf8"));
    expect(saved.length).toBeGreaterThanOrEqual(2);
    expect(saved.some((text) => text.includes("key=REDACTED"))).toBe(true);
    expectNoKey(r, f.out);
    expect(statSync(join(f.out, "ledger.json")).isFile()).toBe(true);
  });
});
