#!/usr/bin/env bun
// The only way vh-adlc-seo talks to Semrush. It reads the key itself, prices each
// report before sending it, keeps a per-run unit ledger under an exclusive kernel
// lock, and saves every request with the key redacted. See references/seo.md.

import { dlopen, FFIType } from "bun:ffi";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MCP_URL = "https://mcp.semrush.com/v2/mcp";
const REPORT_URL = "https://api.semrush.com/";
const BALANCE_URL = "https://www.semrush.com/users/countapiunits.html";
const LOCK_WAIT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ROWS = 100;
const LOCK_EX = 2;
const LOCK_NB = 4;
const LOCK_UN = 8;

type Route = "mcp" | "v3";

// Prices are units per returned line, from the Semrush pages named beside each
// report, as read on price_source_date. A historical request (display_date) is
// charged at the historical rate.
type ReportSpec = {
  mcp: string;
  v3: string;
  databaseRequired: boolean;
  price: number;
  historicalPrice: number;
  source: string;
  priceSourceDate: string;
};

const REPORTS: Record<string, ReportSpec> = {
  domain_ranks: {
    mcp: "domain_ranks",
    v3: "domain_ranks",
    databaseRequired: false,
    price: 10,
    historicalPrice: 50,
    source: "https://developer.semrush.com/api/v3/seo/overview-reports/",
    priceSourceDate: "2026-11-11",
  },
  resource_organic: {
    mcp: "resource_organic",
    v3: "domain_organic",
    databaseRequired: true,
    price: 10,
    historicalPrice: 50,
    source: "https://developer.semrush.com/api/v3/seo/domain-reports/",
    priceSourceDate: "2026-11-11",
  },
};

export type Outcome =
  | "success"
  | "authentication"
  | "access_denied"
  | "quota"
  | "rate_limited"
  | "report_disabled"
  | "no_data"
  | "transport_error"
  | "provider_error"
  | "busy"
  | "limit"
  | "price_mismatch"
  | "refused";

type Params = { target: string; database?: string; display_date?: string };

type Entry = {
  id: string;
  report: string;
  params: Params;
  display_limit: number;
  price: number;
  reserved: number;
  units: number;
  basis: "reserved" | "reported" | "estimated";
  price_source_date: string;
  state: "reserved" | "reconciled" | "released";
  outcome?: Outcome;
};

type Failure = { report: string; params: Params; outcome: Outcome; terminal: boolean };

type Balance = { value: number } | { outcome: "balance_unavailable" } | { claimed: string };

type Ledger = {
  version: 1;
  route: Route;
  max_units: number;
  entries: Entry[];
  failures: Failure[];
  terminal: { outcome: Outcome; entry: string } | null;
  disabled_reports: string[];
  balance: Balance | null;
};

// A ledger change that could not get the lock in time, kept for the next invocation.
type Update = {
  entry: string;
  units?: number;
  basis?: Entry["basis"];
  state?: Entry["state"];
  outcome?: Outcome;
  failure?: Failure;
  terminal?: Outcome;
  disabled_report?: string;
  balance?: Balance;
};

class Refusal extends Error {}

type Options = {
  route: Route;
  output: string;
  maxUnits: number | null;
  allowUnits: boolean;
  keyFile: string | null;
  keyEnv: string | null;
  report: string;
  params: Params;
  displayLimit: number | null;
};

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  let allowUnits = false;
  const valued = ["--route", "--output", "--max-units", "--key-file", "--key-env", "--report", "--target", "--database", "--display-limit", "--display-date"];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow-units") {
      allowUnits = true;
    } else if (valued.includes(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Refusal(`${arg} needs a value`);
      if (values.has(arg)) throw new Refusal(`${arg} given twice`);
      values.set(arg, value);
    } else {
      throw new Refusal(`unknown argument ${arg}`);
    }
  }
  const route = values.get("--route");
  if (route !== "mcp" && route !== "v3") throw new Refusal("--route must be mcp or v3");
  const output = values.get("--output");
  if (!output) throw new Refusal("--output is required");
  const report = values.get("--report") ?? "";
  const spec = REPORTS[report];
  if (!spec) throw new Refusal(`report type ${report || "(none)"} is not on the helper's list`);
  const target = values.get("--target") ?? "";
  if (!isBareHost(target)) throw new Refusal("--target must be a bare host name without scheme, port or path");
  const params: Params = { target };
  const database = values.get("--database");
  if (database !== undefined) {
    if (!/^[a-z][a-z0-9-]{1,15}$/.test(database)) throw new Refusal("--database is not a Semrush database code");
    params.database = database;
  } else if (spec.databaseRequired) {
    throw new Refusal(`${report} needs --database`);
  }
  const date = values.get("--display-date");
  if (date !== undefined) {
    if (!/^\d{4}(0[1-9]|1[0-2])15$/.test(date)) throw new Refusal("--display-date must be YYYYMM15");
    params.display_date = date;
  }
  const maxText = values.get("--max-units");
  let maxUnits: number | null = null;
  if (maxText !== undefined) {
    if (!/^[1-9]\d{0,8}$/.test(maxText)) throw new Refusal("--max-units must be a positive whole number");
    maxUnits = Number(maxText);
  }
  const limitText = values.get("--display-limit");
  let displayLimit: number | null = null;
  if (limitText !== undefined) {
    if (!/^\d{1,9}$/.test(limitText)) throw new Refusal("--display-limit must be a whole number");
    displayLimit = Number(limitText);
  }
  const keyFile = values.get("--key-file") ?? null;
  const keyEnv = values.get("--key-env") ?? null;
  if (keyFile && keyEnv) throw new Refusal("give --key-file or --key-env, not both");
  if (!keyFile && !keyEnv) throw new Refusal("give --key-file or --key-env; the helper has no default credential");
  if (keyEnv !== null && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) throw new Refusal("--key-env must be a variable name");
  if (!allowUnits) throw new Refusal("every report spends units; pass --allow-units only under a unit permission");
  if (maxUnits === null) throw new Refusal("--allow-units needs --max-units");
  return { route, output, maxUnits, allowUnits, keyFile, keyEnv, report, params, displayLimit };
}

function isBareHost(value: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  return value.length <= 253 && /^(?!-)[A-Za-z0-9-]{1,63}(\.(?!-)[A-Za-z0-9-]{1,63})+$/.test(value);
}

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

function readKey(options: Options): string {
  let raw: string;
  if (options.keyFile !== null) {
    try {
      raw = readFileSync(options.keyFile, "utf8");
    } catch {
      throw new Refusal("the credential file cannot be read");
    }
    const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length !== 1) throw new Refusal("the credential file must hold exactly one non-empty line");
    raw = lines[0].trim();
    if (raw.startsWith("SEMRUSH_API_KEY=")) raw = raw.slice("SEMRUSH_API_KEY=".length);
  } else {
    raw = (process.env[options.keyEnv ?? ""] ?? "").trim();
  }
  if (!TOKEN.test(raw)) throw new Refusal("the credential is not a single token of 16 to 128 letters, digits, hyphens and underscores");
  return raw;
}

type Urls = { mcp: string; report: string; balance: string };

function urls(): Urls {
  const override = process.env.VH_ADLC_SEMRUSH_BASE;
  if (override === undefined || override === "") return { mcp: MCP_URL, report: REPORT_URL, balance: BALANCE_URL };
  let base: URL;
  try {
    base = new URL(override);
  } catch {
    throw new Refusal("VH_ADLC_SEMRUSH_BASE is not a URL");
  }
  const loopback = ["127.0.0.1", "[::1]", "localhost"];
  if (
    (base.protocol !== "http:" && base.protocol !== "https:") ||
    !loopback.includes(base.hostname) ||
    base.username !== "" ||
    base.password !== "" ||
    (base.pathname !== "/" && base.pathname !== "") ||
    base.search !== "" ||
    base.hash !== ""
  ) {
    throw new Refusal("VH_ADLC_SEMRUSH_BASE must name a loopback host over HTTP or HTTPS");
  }
  const origin = `${base.protocol}//${base.host}`;
  return {
    mcp: origin + new URL(MCP_URL).pathname,
    report: origin + new URL(REPORT_URL).pathname,
    balance: origin + new URL(BALANCE_URL).pathname,
  };
}

// The kernel lock: flock on ledger.lock. The kernel drops it when the holder exits
// or is killed, in any PID namespace, so there is no stale lock to take over.
const libc = dlopen(process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6", {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
});

async function withLock<T>(output: string, action: () => T): Promise<{ held: true; value: T } | { held: false }> {
  const fd = openSync(join(output, "ledger.lock"), "a+");
  try {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (libc.symbols.flock(fd, LOCK_EX | LOCK_NB) !== 0) {
      if (Date.now() >= deadline) return { held: false };
      await Bun.sleep(50);
    }
    try {
      return { held: true, value: action() };
    } finally {
      libc.symbols.flock(fd, LOCK_UN);
    }
  } finally {
    closeSync(fd);
  }
}

function loadLedger(output: string): Ledger | null {
  const path = join(output, "ledger.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Ledger;
}

function saveLedger(output: string, ledger: Ledger) {
  const path = join(output, "ledger.json");
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(ledger, null, 2) + "\n");
  renameSync(temporary, path);
}

function applyUpdate(ledger: Ledger, update: Update) {
  const entry = ledger.entries.find((candidate) => candidate.id === update.entry);
  if (entry) {
    if (update.units !== undefined) entry.units = update.units;
    if (update.basis !== undefined) entry.basis = update.basis;
    if (update.state !== undefined) entry.state = update.state;
    if (update.outcome !== undefined) entry.outcome = update.outcome;
  }
  if (update.failure) ledger.failures.push(update.failure);
  if (update.terminal && !ledger.terminal) ledger.terminal = { outcome: update.terminal, entry: update.entry };
  if (update.disabled_report && !ledger.disabled_reports.includes(update.disabled_report)) {
    ledger.disabled_reports.push(update.disabled_report);
  }
  if (update.balance) ledger.balance = update.balance;
}

function mergePending(output: string, ledger: Ledger) {
  const dir = join(output, "ledger.pending");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
    const path = join(dir, name);
    applyUpdate(ledger, JSON.parse(readFileSync(path, "utf8")) as Update);
    saveLedger(output, ledger);
    rmSync(path);
  }
}

async function commit(output: string, update: Update) {
  const done = await withLock(output, () => {
    const ledger = loadLedger(output);
    if (!ledger) throw new Error("the run ledger disappeared");
    mergePending(output, ledger);
    applyUpdate(ledger, update);
    saveLedger(output, ledger);
  });
  if (!done.held) {
    const dir = join(output, "ledger.pending");
    mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${process.pid}-${randomUUID()}`;
    writeFileSync(join(dir, `${name}.tmp`), JSON.stringify(update) + "\n");
    renameSync(join(dir, `${name}.tmp`), join(dir, `${name}.json`));
  }
}

function counted(ledger: Ledger): number {
  return ledger.entries.reduce((sum, entry) => sum + entry.units, 0);
}

type Reservation =
  | { kind: "refused"; reason: string }
  | { kind: "limit" }
  | { kind: "reserved"; entry: Entry; balance: boolean };

// Requested parameters compared without display_limit, which is not part of Params.
function sameParams(a: Params, b: Params): boolean {
  return a.target === b.target && a.database === b.database && a.display_date === b.display_date;
}

function reserve(options: Options, maxUnits: number): Reservation {
  const ledger: Ledger = loadLedger(options.output) ?? {
    version: 1,
    route: options.route,
    max_units: maxUnits,
    entries: [],
    failures: [],
    terminal: null,
    disabled_reports: [],
    balance: null,
  };
  mergePending(options.output, ledger);
  if (ledger.route !== options.route) return { kind: "refused", reason: `this run uses --route ${ledger.route}` };
  if (ledger.max_units !== maxUnits) return { kind: "refused", reason: `this run's --max-units is ${ledger.max_units}` };
  if (ledger.terminal) return { kind: "refused", reason: `the run stopped on ${ledger.terminal.outcome}` };
  if (ledger.disabled_reports.includes(options.report)) return { kind: "refused", reason: `Semrush disabled ${options.report} in this run` };
  const failed = ledger.failures.find((failure) => failure.report === options.report && sameParams(failure.params, options.params));
  if (failed) return { kind: "refused", reason: `the same request already failed in this run with ${failed.outcome}` };
  const spec = REPORTS[options.report];
  const price = options.params.display_date ? spec.historicalPrice : spec.price;
  const requested = options.displayLimit === null || options.displayLimit === 0 ? MAX_ROWS : Math.min(options.displayLimit, MAX_ROWS);
  const rows = Math.min(requested, Math.floor((maxUnits - counted(ledger)) / price));
  if (rows < 1) return { kind: "limit" };
  const entry: Entry = {
    id: randomUUID(),
    report: options.report,
    params: options.params,
    display_limit: rows,
    price,
    reserved: rows * price,
    units: rows * price,
    basis: "reserved",
    price_source_date: spec.priceSourceDate,
    state: "reserved",
  };
  ledger.entries.push(entry);
  let balance = false;
  if (options.route === "v3" && ledger.balance === null) {
    ledger.balance = { claimed: entry.id };
    balance = true;
  }
  saveLedger(options.output, ledger);
  return { kind: "reserved", entry, balance };
}

let sequence = 0;

function save(output: string, kind: string, request: { method: string; url: string; headers: Record<string, string>; body?: string }, response: unknown, key: string) {
  const dir = join(output, "requests");
  mkdirSync(dir, { recursive: true });
  const redact = (text: string) => text.split(key).join("REDACTED");
  const url = new URL(request.url);
  if (url.searchParams.has("key")) url.searchParams.set("key", "REDACTED");
  const headers = Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [name, name.toLowerCase() === "authorization" ? "REDACTED" : redact(value)]),
  );
  const record = {
    request: { method: request.method, url: url.toString(), headers, body: request.body === undefined ? undefined : redact(request.body) },
    response,
  };
  const name = `${Date.now()}-${process.pid}-${String(++sequence).padStart(3, "0")}-${kind}.json`;
  writeFileSync(join(dir, name), redact(JSON.stringify(record, null, 2)) + "\n");
}

type Sent = { status: number; headers: Headers; body: string };
type Failed = { sent: boolean; error: string };

function neverSent(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return ["ConnectionRefused", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "DNSError", "FailedToOpenSocket"].includes(code);
}

async function send(url: string, init: RequestInit): Promise<Sent | Failed> {
  try {
    const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return { status: response.status, headers: response.headers, body: await response.text() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { sent: !neverSent(error), error: message };
  }
}

function isFailed(result: Sent | Failed): result is Failed {
  return "error" in result;
}

async function balanceRequest(options: Options, endpoints: Urls, key: string): Promise<Balance> {
  const url = `${endpoints.balance}?key=${encodeURIComponent(key)}`;
  const result = await send(url, { method: "GET" });
  save(options.output, "balance", { method: "GET", url, headers: {} }, isFailed(result) ? { error: result.error } : { status: result.status, body: result.body }, key);
  if (isFailed(result) || result.status !== 200) return { outcome: "balance_unavailable" };
  const text = result.body.trim().replace(/,/g, "");
  return /^\d+$/.test(text) ? { value: Number(text) } : { outcome: "balance_unavailable" };
}

type Result = { outcome: Outcome; units: number; basis: Entry["basis"]; state: Entry["state"]; detail?: string };

// Outcomes that stop the run. report_disabled stops only its report type.
const TERMINAL: Outcome[] = ["authentication", "access_denied", "quota", "rate_limited", "price_mismatch"];

// A v3 body that starts with `ERROR <n> ::`, classified by its code whatever the HTTP status.
function v3Outcome(body: string): Outcome | null {
  const match = body.match(/^ERROR (\d+) :: ([^\r\n]*)/);
  if (!match) return null;
  const code = Number(match[1]);
  if ([110, 120, 122].includes(code)) return "authentication";
  if (code === 402) return match[2].trim() === "Request param not valid" ? "authentication" : "provider_error";
  if ([130, 133].includes(code)) return "access_denied";
  if ([131, 132, 134].includes(code)) return "quota";
  if (code === 429) return "rate_limited";
  if (code === 135) return "report_disabled";
  if (code === 50) return "no_data";
  return "provider_error";
}

const MCP_CODES: Record<string, Outcome> = {
  no_subscription: "access_denied",
  no_api_units: "quota",
  rate_limit: "rate_limited",
  no_data: "no_data",
};

function httpOutcome(status: number, route: Route): Outcome {
  if (route === "mcp" && (status === 401 || status === 403)) return "authentication";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

async function v3Report(options: Options, endpoints: Urls, key: string, entry: Entry): Promise<Result> {
  const spec = REPORTS[options.report];
  const query = new URLSearchParams({ type: spec.v3, key, domain: options.params.target });
  if (options.params.database) query.set("database", options.params.database);
  query.set("display_limit", String(entry.display_limit));
  if (options.params.display_date) query.set("display_date", options.params.display_date);
  const url = `${endpoints.report}?${query.toString()}`;
  const result = await send(url, { method: "GET" });
  save(options.output, "report", { method: "GET", url, headers: {} }, isFailed(result) ? { error: result.error } : { status: result.status, body: result.body }, key);
  if (isFailed(result)) {
    if (!result.sent) return { outcome: "transport_error", units: 0, basis: "estimated", state: "released", detail: result.error };
    return { outcome: "transport_error", units: entry.reserved, basis: "estimated", state: "reconciled", detail: result.error };
  }
  if (result.status >= 300 && result.status < 400) {
    return { outcome: "provider_error", units: 0, basis: "estimated", state: "reconciled", detail: `redirect ${result.status}` };
  }
  const coded = v3Outcome(result.body);
  if (coded) return { outcome: coded, units: 0, basis: "estimated", state: "reconciled", detail: result.body.slice(0, 200) };
  if (result.status >= 200 && result.status < 300) {
    const rows = result.body.split(/\r?\n/).filter((line) => line.trim() !== "").length - 1;
    const units = Math.max(rows, 0) * entry.price;
    return { outcome: "success", units, basis: "estimated", state: "reconciled" };
  }
  return { outcome: httpOutcome(result.status, "v3"), units: 0, basis: "estimated", state: "reconciled", detail: `HTTP ${result.status}` };
}

// The JSON-RPC message in a reply that is either a JSON body or an event stream,
// whose last `data:` event carries it.
function rpcMessage(sent: Sent): Record<string, unknown> | null {
  let text = sent.body;
  if ((sent.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:"));
    text = data.length ? data[data.length - 1].slice(5).trim() : "";
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[name] : undefined;
}

// The execute_report reply: an object with `code` is an error, one with `data` and
// `metadata` is a success; anything else, a JSON-RPC error or isError is a provider error.
function mcpCallResult(message: Record<string, unknown> | null, entry: Entry): Result {
  const kept = { units: entry.reserved, basis: "estimated" as const, state: "reconciled" as const };
  const result = message ? field(message, "result") : undefined;
  if (!message || message.error !== undefined || result === undefined || field(result, "isError") === true) {
    return { outcome: "provider_error", ...kept, detail: "not an execute_report result" };
  }
  const content = field(result, "content");
  const text = Array.isArray(content) ? field(content[0], "text") : undefined;
  let payload: unknown;
  try {
    payload = typeof text === "string" ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  const code = field(payload, "code");
  if (typeof code === "string") return { outcome: MCP_CODES[code] ?? "provider_error", ...kept, detail: code };
  if (field(payload, "data") !== undefined && field(payload, "metadata") !== undefined) {
    const units = field(field(field(payload, "metadata"), "usage"), "api_units");
    if (typeof units !== "number" || !Number.isFinite(units) || units < 0) return { outcome: "success", ...kept };
    if (units > entry.reserved) return { outcome: "price_mismatch", units, basis: "reported", state: "reconciled", detail: `reported ${units} units for a ${entry.reserved}-unit reservation` };
    return { outcome: "success", units, basis: "reported", state: "reconciled" };
  }
  return { outcome: "provider_error", ...kept, detail: "unrecognised execute_report payload" };
}

async function mcpReport(options: Options, endpoints: Urls, key: string, entry: Entry): Promise<Result> {
  const spec = REPORTS[options.report];
  const headers: Record<string, string> = {
    Authorization: `Apikey ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const post = async (kind: string, body: unknown) => {
    const text = JSON.stringify(body);
    const result = await send(endpoints.mcp, { method: "POST", headers, body: text });
    save(options.output, kind, { method: "POST", url: endpoints.mcp, headers, body: text }, isFailed(result) ? { error: result.error } : { status: result.status, body: result.body }, key);
    return result;
  };
  // A handshake that fails never sent the report call, so its reservation is released.
  const handshakeFailed = (result: Sent | Failed): Result => {
    if (isFailed(result)) return { outcome: "transport_error", units: 0, basis: "estimated", state: "released", detail: result.error };
    return { outcome: httpOutcome(result.status, "mcp"), units: 0, basis: "estimated", state: "released", detail: `handshake HTTP ${result.status}` };
  };
  const init = await post("initialize", {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "vh-adlc-seo", version: "1" } },
  });
  if (isFailed(init) || init.status < 200 || init.status >= 300) return handshakeFailed(init);
  if (!field(rpcMessage(init), "result")) return { outcome: "provider_error", units: 0, basis: "estimated", state: "released", detail: "no initialize result" };
  const session = init.headers.get("mcp-session-id");
  if (session) headers["Mcp-Session-Id"] = session;
  const initialized = await post("initialized", { jsonrpc: "2.0", method: "notifications/initialized" });
  if (isFailed(initialized) || initialized.status < 200 || initialized.status >= 300) return handshakeFailed(initialized);

  const params: Record<string, unknown> = { target: options.params.target };
  if (options.params.database) params.database = options.params.database;
  params.display_limit = entry.display_limit;
  const date = options.params.display_date;
  if (date) params.display_date = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const call = await post("report", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "execute_report", arguments: { report: spec.mcp, params } } });
  if (isFailed(call)) {
    if (!call.sent) return { outcome: "transport_error", units: 0, basis: "estimated", state: "released", detail: call.error };
    return { outcome: "transport_error", units: entry.reserved, basis: "estimated", state: "reconciled", detail: call.error };
  }
  if (call.status < 200 || call.status >= 300) {
    return { outcome: httpOutcome(call.status, "mcp"), units: entry.reserved, basis: "estimated", state: "reconciled", detail: `HTTP ${call.status}` };
  }
  return mcpCallResult(rpcMessage(call), entry);
}

function print(result: Record<string, unknown>) {
  console.log(JSON.stringify(result));
}

async function main(argv: string[]): Promise<number> {
  let options: Options;
  let key: string;
  let endpoints: Urls;
  try {
    options = parseArgs(argv);
    endpoints = urls();
    key = readKey(options);
  } catch (error) {
    if (error instanceof Refusal) {
      print({ outcome: "refused", reason: error.message });
      return 2;
    }
    throw error;
  }
  mkdirSync(options.output, { recursive: true });
  const maxUnits = options.maxUnits ?? 0;
  const reserved = await withLock(options.output, () => reserve(options, maxUnits));
  if (!reserved.held) {
    print({ outcome: "busy", reason: "the run ledger stayed locked for 30 seconds" });
    return 1;
  }
  const reservation = reserved.value;
  if (reservation.kind === "refused") {
    print({ outcome: "refused", reason: reservation.reason });
    return 2;
  }
  if (reservation.kind === "limit") {
    print({ outcome: "limit", reason: "not even one row fits in the units left under --max-units" });
    return 1;
  }
  const { entry } = reservation;
  let balance: Balance | undefined;
  if (reservation.balance) balance = await balanceRequest(options, endpoints, key);
  const result = options.route === "mcp" ? await mcpReport(options, endpoints, key, entry) : await v3Report(options, endpoints, key, entry);
  // A request that reached Semrush and failed is never sent again in this run; one
  // that never left the machine (a released reservation) may be.
  const failedRequest = result.outcome !== "success" && result.state !== "released";
  await commit(options.output, {
    entry: entry.id,
    units: result.units,
    basis: result.basis,
    state: result.state,
    outcome: result.outcome,
    balance,
    failure: failedRequest ? { report: options.report, params: options.params, outcome: result.outcome, terminal: TERMINAL.includes(result.outcome) } : undefined,
    terminal: TERMINAL.includes(result.outcome) ? result.outcome : undefined,
    disabled_report: result.outcome === "report_disabled" ? options.report : undefined,
  });
  print({
    outcome: result.outcome,
    report: options.report,
    target: options.params.target,
    display_limit: entry.display_limit,
    units: result.units,
    basis: result.basis,
    ...(result.detail ? { detail: result.detail.split(key).join("REDACTED") } : {}),
  });
  return result.outcome === "success" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
