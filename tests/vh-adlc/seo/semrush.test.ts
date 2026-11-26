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
  // Report calls only: v3 report requests and MCP tools/call messages.
  calls() {
    return this.seen.filter(isCall);
  }
  mcp(method: string) {
    return this.seen.filter((seen) => seen.path === "/v2/mcp" && rpc(seen).method === method);
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

const mcpDir = join(import.meta.dir, "fixtures/mcp");
const fixture = (name: string) => JSON.parse(readFileSync(join(mcpDir, name), "utf8")) as Record<string, any>;

type Rpc = { id?: number | string; method?: string; params?: { name?: string; arguments?: { report?: string; params?: Record<string, unknown> } } };
function rpc(seen: Seen): Rpc {
  try {
    return JSON.parse(seen.body) as Rpc;
  } catch {
    return {};
  }
}
function isCall(seen: Seen) {
  return seen.path === "/" || (seen.path === "/v2/mcp" && rpc(seen).method === "tools/call");
}
function sentLimit(seen: Seen) {
  if (seen.path === "/") return Number(seen.query.get("display_limit"));
  return Number(rpc(seen).params?.arguments?.params?.display_limit);
}

// The archived success reply with this request's id, rows and units.
function mcpSuccess(id: Rpc["id"], rows: number, units = rows * 10) {
  const reply = fixture("success-response.json");
  const payload = JSON.parse(reply.result.content[0].text);
  payload.data = csv(rows);
  payload.metadata.usage.api_units = units;
  reply.id = id;
  reply.result.content[0].text = JSON.stringify(payload);
  reply.result.structuredContent = payload;
  return reply;
}
// The archived no-data reply, with only the code inside content[0].text changed.
function mcpError(id: Rpc["id"], code: string) {
  const reply = fixture("no-data-response.json");
  const payload = JSON.parse(reply.result.content[0].text);
  payload.code = code;
  reply.id = id;
  reply.result.content[0].text = JSON.stringify(payload);
  return reply;
}

function mcpReply(seen: Seen, call?: (message: Rpc) => Response): Response {
  const type = seen.headers.get("content-type") ?? "";
  const accept = seen.headers.get("accept") ?? "";
  if (!type.includes("application/json") || !accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return new Response("Not Acceptable", { status: 406 });
  }
  const auth = seen.headers.get("authorization") ?? "";
  if (![KEY, OTHER_KEY, KEY_67].some((key) => auth === `Apikey ${key}`)) return new Response("unauthorized", { status: 401 });
  const message = rpc(seen);
  if (message.method === "initialize") return Response.json({ ...fixture("initialize-response.json"), id: message.id }, { headers: { "mcp-session-id": "stub-session" } });
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (message.method === "tools/call" && message.params?.name === "execute_report") {
    if (call) return call(message);
    return Response.json(mcpSuccess(message.id, Number(message.params.arguments?.params?.display_limit ?? 0)));
  }
  return Response.json({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } });
}

function defaultReply(seen: Seen): Response {
  if (seen.path === "/v2/mcp") return mcpReply(seen);
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

for (const route of ["v3", "mcp"] as const) describe(`row fitting and the unit limit (${route})`, () => {
  test("fits a full report, then a lowered row limit, then refuses with limit", async () => {
    const f = fresh("fit");
    const a = await run(args({ route, out: f.out, keyFile: f.keyFile, limit: "100" }));
    expect(a.result.outcome).toBe("success");
    const b = await run(args({ route, out: f.out, keyFile: f.keyFile, limit: "100", target: "second-target.example" }));
    expect(b.result.outcome).toBe("success");
    const c = await run(args({ route, out: f.out, keyFile: f.keyFile, limit: "100", target: "third-target.example" }));
    expect(c.result.outcome).toBe("limit");
    const limits = stub.calls().map((seen) => String(sentLimit(seen)));
    expect(limits).toEqual(["100", "50"]);
    expect(counted(f.out)).toBe(1500);
    expect(counted(f.out)).toBeLessThanOrEqual(1500);
  });

  test("sends 100 rows for an absent, zero or oversized display_limit", async () => {
    const f = fresh("display-limit");
    for (const [limit, target] of [[undefined, "a.example"], ["0", "b.example"], ["1000", "c.example"]] as const) {
      const r = await run(args({ route, out: f.out, keyFile: f.keyFile, max: 3000, limit, target }));
      expect(r.result.outcome).toBe("success");
    }
    expect(stub.calls().map((seen) => String(sentLimit(seen)))).toEqual(["100", "100", "100"]);
  });

  test("keeps the limit across two concurrent invocations", async () => {
    const f = fresh("concurrent");
    const runs = await Promise.all([
      run(args({ route, out: f.out, keyFile: f.keyFile, limit: "100" })),
      run(args({ route, out: f.out, keyFile: f.keyFile, limit: "100", target: "second-target.example" })),
    ]);
    expect(runs.map((r) => r.result.outcome).sort()).toEqual(["success", "success"]);
    expect(counted(f.out)).toBeLessThanOrEqual(1500);
    const sent = stub.calls().map(sentLimit).sort((x, y) => x - y);
    expect(sent).toEqual([50, 100]);
  });

  test("keeps both entries when one reconciles while another reserves", async () => {
    const f = fresh("interleave");
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    stub.reply = async (seen) => {
      if (isCall(seen) && ++calls === 1) await held;
      return defaultReply(seen);
    };
    const first = spawn(args({ route, out: f.out, keyFile: f.keyFile, limit: "10" }));
    while (stub.calls().length < 1) await Bun.sleep(20);
    const second = await run(args({ route, out: f.out, keyFile: f.keyFile, limit: "10", target: "second-target.example" }));
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
      if (isCall(seen)) await Bun.sleep(60_000);
      return defaultReply(seen);
    };
    const doomed = spawn(args({ route, out: f.out, keyFile: f.keyFile, limit: "100" }));
    while (stub.calls().length < 1) await Bun.sleep(20);
    doomed.kill("SIGKILL");
    await doomed.exited;
    stub.reset();
    const r = await run(args({ route, out: f.out, keyFile: f.keyFile, limit: "100", target: "second-target.example" }));
    expect(r.result.outcome).toBe("success");
    expect(String(sentLimit(stub.calls()[0]))).toBe("50");
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

describe("the outcome table", () => {
  const v3Rows: [string, number, string, boolean][] = [
    ["ERROR 110 :: INVALID IMPORT KEY", 400, "authentication", true],
    ["ERROR 120 :: WRONG KEY - ID PAIR", 403, "authentication", true],
    ["ERROR 122 :: WRONG FORMAT OR EMPTY KEY", 400, "authentication", true],
    ["ERROR 402 :: Request param not valid", 400, "authentication", true],
    ["ERROR 130 :: API DISABLED", 403, "access_denied", true],
    ["ERROR 133 :: DB ACCESS DENIED", 403, "access_denied", true],
    ["ERROR 131 :: LIMIT EXCEEDED", 403, "quota", true],
    ["ERROR 132 :: API UNITS BALANCE IS ZERO", 403, "quota", true],
    ["ERROR 134 :: TOTAL LIMIT EXCEEDED", 403, "quota", true],
    ["ERROR 429 :: Too Many Requests", 429, "rate_limited", true],
    ["ERROR 50 :: NOTHING FOUND", 400, "no_data", false],
    ["ERROR 402 :: Request param not valid :: Duplicate domains", 400, "provider_error", false],
    ["ERROR 999 :: SOMETHING ELSE", 400, "provider_error", false],
  ];
  for (const [body, status, outcome, terminal] of v3Rows) {
    test(`v3 ${body} gives ${outcome}${terminal ? " and stops the run" : ""}`, async () => {
      const f = fresh("v3-outcome");
      stub.reply = (seen) => (seen.path === "/" ? new Response(body, { status }) : defaultReply(seen));
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(r.result.outcome).toBe(outcome);
      expect(ledger(f.out).terminal?.outcome ?? null).toBe(terminal ? outcome : null);
      if (terminal) {
        stub.reset();
        const later = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1", target: "second-target.example" }));
        expect(later.result.outcome).toBe("refused");
        expect(stub.seen).toHaveLength(0);
      }
    });
  }

  for (const [label, status] of [["HTTP 429", 429], ["HTTP 503", 503]] as const) {
    test(`v3 ${label} without an ERROR body`, async () => {
      const f = fresh("v3-http");
      stub.reply = (seen) => (seen.path === "/" ? new Response("busy", { status }) : defaultReply(seen));
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(r.result.outcome).toBe(status === 429 ? "rate_limited" : "provider_error");
    });
  }

  test("v3 ERROR 135 disables only that report type", async () => {
    const f = fresh("disabled");
    stub.reply = (seen) =>
      seen.path === "/" && seen.query.get("type") === "domain_ranks" ? new Response("ERROR 135 :: API REPORT TYPE DISABLED", { status: 403 }) : defaultReply(seen);
    const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(r.result.outcome).toBe("report_disabled");
    stub.reset();
    const same = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1", target: "second-target.example" }));
    expect(same.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
    const other = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1", report: "resource_organic", database: "us" }));
    expect(other.result.outcome).toBe("success");
    expect(stub.calls()).toHaveLength(1);
  });

  const mcpRows: [string, string, boolean][] = [
    ["no_subscription", "access_denied", true],
    ["no_api_units", "quota", true],
    ["rate_limit", "rate_limited", true],
    ["no_data", "no_data", false],
    ["validation_failed", "provider_error", false],
    ["internal", "provider_error", false],
    ["something_new", "provider_error", false],
  ];
  for (const [code, outcome, terminal] of mcpRows) {
    test(`mcp ${code} gives ${outcome}${terminal ? " and stops the run" : ""}`, async () => {
      const f = fresh("mcp-outcome");
      stub.reply = (seen) => (seen.path === "/v2/mcp" ? mcpReply(seen, (m) => Response.json(mcpError(m.id, code))) : defaultReply(seen));
      const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(r.result.outcome).toBe(outcome);
      const entry = ledger(f.out).entries[0];
      expect(entry).toMatchObject({ units: 10, basis: "estimated" });
      if (terminal) {
        stub.reset();
        const later = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1", target: "second-target.example" }));
        expect(later.result.outcome).toBe("refused");
        expect(stub.seen).toHaveLength(0);
      }
    });
  }

  for (const status of [401, 403]) {
    test(`mcp HTTP ${status} on the handshake gives authentication and sends no report call`, async () => {
      const f = fresh("mcp-auth");
      stub.reply = (seen) => (seen.path === "/v2/mcp" ? new Response("no", { status }) : defaultReply(seen));
      const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(r.result.outcome).toBe("authentication");
      expect(stub.calls()).toHaveLength(0);
      expect(ledger(f.out).entries[0].state).toBe("released");
      stub.reset();
      const later = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(later.result.outcome).toBe("refused");
      expect(stub.seen).toHaveLength(0);
    });
  }

  for (const [label, reply] of [
    ["HTTP 429", () => new Response("slow down", { status: 429 })],
    ["HTTP 500", () => new Response("oops", { status: 500 })],
    ["a JSON-RPC error", (m: Rpc) => Response.json({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message: "boom" } })],
    ["isError", (m: Rpc) => Response.json({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: "bad" }] } })],
    ["an unrecognised result", (m: Rpc) => Response.json({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "\"just text\"" }] } })],
  ] as const) {
    test(`mcp report call answered with ${label}`, async () => {
      const f = fresh("mcp-call-error");
      stub.reply = (seen) => (seen.path === "/v2/mcp" ? mcpReply(seen, (m) => reply(m)) : defaultReply(seen));
      const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(r.result.outcome).toBe(label === "HTTP 429" ? "rate_limited" : "provider_error");
    });
  }
});

describe("failed requests", () => {
  test("an MCP no_data is not asked again, even with a larger display_limit", async () => {
    const f = fresh("no-data-repeat");
    stub.reply = (seen) => (seen.path === "/v2/mcp" ? mcpReply(seen, (m) => Response.json(mcpError(m.id, "no_data"))) : defaultReply(seen));
    expect((await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }))).result.outcome).toBe("no_data");
    stub.reset();
    const same = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
    const larger = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "20" }));
    expect([same.result.outcome, larger.result.outcome]).toEqual(["refused", "refused"]);
    expect(stub.seen).toHaveLength(0);
    expect(ledger(f.out).failures).toHaveLength(1);
  });

  test("a failed v3 request is recorded with its report type, parameters and outcome", async () => {
    const f = fresh("v3-failure");
    stub.reply = (seen) => (seen.path === "/" ? new Response("ERROR 50 :: NOTHING FOUND", { status: 400 }) : defaultReply(seen));
    await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1", database: "us" }));
    expect(ledger(f.out).failures).toEqual([
      { report: "domain_ranks", params: { target: "first-target.example", database: "us" }, outcome: "no_data", terminal: false },
    ]);
  });
});

describe("MCP handshake and transport", () => {
  test("a handshake answered with HTTP 500 releases the reservation and a later identical request is sent", async () => {
    const f = fresh("handshake-500");
    stub.reply = (seen) => (seen.path === "/v2/mcp" && rpc(seen).method === "initialize" ? new Response("oops", { status: 500 }) : defaultReply(seen));
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(r.result.outcome).toBe("provider_error");
    expect(ledger(f.out).entries[0].state).toBe("released");
    expect(ledger(f.out).failures).toHaveLength(0);
    stub.reset();
    const again = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(again.result.outcome).toBe("success");
    expect(stub.calls()).toHaveLength(1);
  });

  test("a dropped handshake releases the reservation and a later identical request is sent", async () => {
    const f = fresh("handshake-drop");
    stub.reply = (seen) => (seen.path === "/v2/mcp" && rpc(seen).method === "initialize" ? "drop" : defaultReply(seen));
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(r.result.outcome).toBe("transport_error");
    expect(ledger(f.out).entries[0].state).toBe("released");
    stub.reset();
    expect((await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }))).result.outcome).toBe("success");
  }, SLOW);

  test("a connection dropped after the report call keeps the full reservation, marked estimated", async () => {
    const f = fresh("mcp-drop");
    stub.reply = (seen) => (seen.path === "/v2/mcp" && rpc(seen).method === "tools/call" ? "drop" : defaultReply(seen));
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "10" }));
    expect(r.result.outcome).toBe("transport_error");
    expect(ledger(f.out).entries[0]).toMatchObject({ units: 100, basis: "estimated" });
  }, SLOW);

  test("follows no redirect on the MCP route", async () => {
    const f = fresh("mcp-redirect");
    const second = new Stub().start();
    stub.reply = (seen) => (seen.path === "/v2/mcp" ? new Response(null, { status: 307, headers: { location: `${second.base}/v2/mcp` } }) : defaultReply(seen));
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(r.result.outcome).toBe("provider_error");
    expect(second.seen).toHaveLength(0);
    second.server.stop(true);
  });

  test("sends the key only in the Authorization header, with the required content headers", async () => {
    const f = fresh("mcp-headers");
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1" }));
    expect(r.result.outcome).toBe("success");
    const mcp = stub.seen.filter((seen) => seen.path === "/v2/mcp");
    expect(mcp.map((seen) => rpc(seen).method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    for (const seen of mcp) {
      expect(seen.headers.get("authorization")).toBe(`Apikey ${KEY}`);
      expect([...seen.query.values()].join()).not.toContain(KEY);
      expect(seen.body).not.toContain(KEY);
    }
    const call = rpc(stub.calls()[0]);
    expect(call.params?.arguments).toEqual({ report: "domain_ranks", params: { target: "first-target.example", display_limit: 1 } });
    const saved = savedFiles(f.out).filter((file) => file.includes("/requests/")).map((file) => readFileSync(file, "utf8"));
    expect(saved.some((text) => /"authorization": "REDACTED"/i.test(text))).toBe(true);
    expectNoKey(r, f.out);
  });

  test("passes a historical date to MCP as YYYY-MM-15", async () => {
    const f = fresh("mcp-date");
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1", date: "20260115", max: 100 }));
    expect(r.result.outcome).toBe("success");
    expect(rpc(stub.calls()[0]).params?.arguments?.params?.display_date).toBe("2026-01-15");
  });

  test("reads a success sent as an event stream", async () => {
    const f = fresh("mcp-sse");
    stub.reply = (seen) =>
      seen.path === "/v2/mcp"
        ? mcpReply(seen, (m) => new Response(`event: message\ndata: ${JSON.stringify(mcpSuccess(m.id, 3, 30))}\n\n`, { headers: { "content-type": "text/event-stream" } }))
        : defaultReply(seen);
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "3" }));
    expect(r.result.outcome).toBe("success");
    expect(ledger(f.out).entries[0]).toMatchObject({ units: 30, basis: "reported" });
  });

  test("refuses the list_projects report and the projects tool, sending nothing", async () => {
    const f = fresh("projects");
    const report = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, report: "list_projects" }));
    const tool = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, extra: ["--tool", "projects"] }));
    expect([report.result.outcome, tool.result.outcome]).toEqual(["refused", "refused"]);
    expect(stub.seen).toHaveLength(0);
  });
});

describe("reconciling to reported api_units", () => {
  test("reconciles to a lower reported figure", async () => {
    const f = fresh("lower");
    stub.reply = (seen) => (seen.path === "/v2/mcp" ? mcpReply(seen, (m) => Response.json(mcpSuccess(m.id, 10, 40))) : defaultReply(seen));
    await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "10" }));
    expect(ledger(f.out).entries[0]).toMatchObject({ reserved: 100, units: 40, basis: "reported" });
  });

  test("records a higher reported figure as price_mismatch and stops the run", async () => {
    const f = fresh("mismatch");
    stub.reply = (seen) => (seen.path === "/v2/mcp" ? mcpReply(seen, (m) => Response.json(mcpSuccess(m.id, 100, 2000))) : defaultReply(seen));
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, max: 1000, limit: "100" }));
    expect(r.result.outcome).toBe("price_mismatch");
    const l = ledger(f.out);
    expect(l.entries[0].units).toBe(2000);
    expect(l.terminal.outcome).toBe("price_mismatch");
    stub.reset();
    const later = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, max: 1000, limit: "1", target: "second-target.example" }));
    expect(later.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
  });

  test("keeps a price_mismatch that cannot get the lock and stops the run once merged", async () => {
    const f = fresh("mismatch-pending");
    let holder: Awaited<ReturnType<typeof lockHolder>> | undefined;
    stub.reply = async (seen) => {
      if (seen.path === "/v2/mcp" && rpc(seen).method === "tools/call") {
        holder = await lockHolder(f.out, LOCK_WAIT_MS + 5_000);
        return Response.json(mcpSuccess(rpc(seen).id, 10, 500));
      }
      return defaultReply(seen);
    };
    const r = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "10" }));
    expect(r.result.outcome).toBe("price_mismatch");
    expect(readdirSync(join(f.out, "ledger.pending"))).toHaveLength(1);
    holder!.kill("SIGKILL");
    await holder!.exited;
    stub.reset();
    const later = await run(args({ route: "mcp", out: f.out, keyFile: f.keyFile, limit: "1", target: "second-target.example" }));
    expect(later.result.outcome).toBe("refused");
    expect(stub.seen).toHaveLength(0);
    expect(ledger(f.out).terminal.outcome).toBe("price_mismatch");
  }, SLOW);
});

describe("the v3 balance request", () => {
  for (const [label, reply] of [["HTTP 429", () => new Response("Blocked request", { status: 429 })], ["non-numeric text", () => new Response("<html>login</html>")]] as const) {
    test(`a balance answered with ${label} is balance_unavailable and the report is still sent`, async () => {
      const f = fresh("balance");
      stub.reply = (seen) => (seen.path === "/users/countapiunits.html" ? reply() : defaultReply(seen));
      const r = await run(args({ route: "v3", out: f.out, keyFile: f.keyFile, limit: "1" }));
      expect(r.result.outcome).toBe("success");
      expect(ledger(f.out).balance).toEqual({ outcome: "balance_unavailable" });
      expect(ledger(f.out).terminal).toBeNull();
      expect(stub.calls()).toHaveLength(1);
    });
  }
});

test("the three built-in Semrush URLs use https", () => {
  const source = readFileSync(helper, "utf8");
  for (const name of ["MCP_URL", "REPORT_URL", "BALANCE_URL"]) {
    expect(source).toMatch(new RegExp(`const ${name} = "https://[a-z.]+semrush\\.com/`));
  }
});
