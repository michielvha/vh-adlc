// Typed browser observations for one route visit. Matching uses full URLs in memory; everything this
// module returns from result() is sanitized: no query values, fragments, user info or message text.

export type RequiredRequest = { method: string; url: string };
export type ExpectedResponse = { method: string; url: string; resourceType: string; status: number };

function isRequestRule(value: unknown): value is RequiredRequest {
  return typeof value === "object" && value !== null && "method" in value && typeof value.method === "string" &&
    "url" in value && typeof value.url === "string";
}

/** Reads the rule lists the runner passes to the confined worker; anything malformed is refused. */
export function parseRules(text: string | undefined): { required: RequiredRequest[]; expected: ExpectedResponse[] } {
  const parsed: unknown = JSON.parse(text ?? "");
  if (typeof parsed !== "object" || parsed === null || !("required" in parsed) || !("expected" in parsed)) {
    throw new Error("Invalid website check rules");
  }
  const { required, expected } = parsed;
  const isExpected = (value: unknown): value is ExpectedResponse => isRequestRule(value) &&
    "resourceType" in value && typeof value.resourceType === "string" && "status" in value && typeof value.status === "number";
  if (!Array.isArray(required) || !required.every(isRequestRule) || !Array.isArray(expected) || !expected.every(isExpected)) {
    throw new Error("Invalid website check rules");
  }
  return { required, expected };
}

export type CspEvent = {
  disposition: unknown; directive: unknown; blockedURL: unknown; sourceFile: unknown; line: unknown;
};

export type Attempt = {
  method: string;
  url: string;
  resourceType: string;
  redirected: boolean;
  status?: number;
  state: "pending" | "finished" | "failed";
};

export type Observation = { kind: string; count?: number } & Record<string, unknown>;
export type Rule = { type: string; outcome: "pass" | "fail" | "skipped" } & Record<string, unknown>;

const NON_URL_CSP_SOURCES = new Set(["inline", "eval", "wasm-eval", "trusted-types-policy", "trusted-types-sink"]);

export function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function sanitizeUrl(raw: string): { url: string; path: string; hasQuery?: true } {
  if (NON_URL_CSP_SOURCES.has(raw)) return { url: raw, path: "" };
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { url: url.protocol, path: "" };
    return { url: `${url.origin}${url.pathname}`, path: url.pathname, ...(url.search ? { hasQuery: true as const } : {}) };
  } catch {
    return { url: "invalid", path: "" };
  }
}

function sanitizeLocation(url: unknown, line: unknown) {
  if (typeof url !== "string" || !url) return undefined;
  const { url: safe, path } = sanitizeUrl(url);
  return { url: safe, path, ...(typeof line === "number" && Number.isSafeInteger(line) && line > 0 ? { line } : {}) };
}

function sameRequest(attempt: Attempt, method: string, url: string) {
  return attempt.method === method.toUpperCase() && attempt.url === normalizeUrl(url);
}

export class ObservationCollector {
  readonly #attempts: Attempt[] = [];
  readonly #records: Observation[] = [];
  readonly #listeners = new Set<() => void>();
  #frozen = false;
  #inFlight: Attempt[] = [];

  constructor(
    private readonly required: RequiredRequest[],
    private readonly expected: ExpectedResponse[],
  ) {}

  /** Resolves on the next recorded change or after `ms`, whichever comes first. */
  changed(ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.#listeners.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.#listeners.add(done);
    });
  }

  /** Wakes a pending changed() wait after a change the collector does not record, such as the assertion. */
  wake() {
    for (const listener of [...this.#listeners]) listener();
  }

  #notify() {
    this.wake();
  }

  started(request: { method: string; url: string; resourceType: string; redirected: boolean }) {
    if (this.#frozen) return undefined;
    const url = normalizeUrl(request.url);
    if (!url) return undefined;
    const attempt: Attempt = {
      method: request.method.toUpperCase(), url, resourceType: request.resourceType, redirected: request.redirected, state: "pending",
    };
    this.#attempts.push(attempt);
    this.#notify();
    return attempt;
  }

  responded(attempt: Attempt | undefined, status: number) {
    if (this.#frozen || !attempt) return;
    attempt.status = status;
  }

  finished(attempt: Attempt | undefined) {
    if (this.#frozen || !attempt || attempt.state !== "pending") return;
    attempt.state = "finished";
    this.#notify();
  }

  failed(attempt: Attempt | undefined) {
    if (this.#frozen || !attempt || attempt.state !== "pending") return;
    attempt.state = "failed";
    this.#notify();
  }

  record(observation: Observation) {
    if (this.#frozen) return;
    this.#records.push(observation);
    this.#notify();
  }

  console(level: string, location: { url?: string; lineNumber?: number }) {
    if (level !== "error") return;
    const at = sanitizeLocation(location.url, location.lineNumber);
    this.record({ kind: "console", level, category: "console-error", ...(at ? { location: at } : {}) });
  }

  pageError(name: unknown) {
    const safeName = typeof name === "string" && /^[A-Z][A-Za-z]*Error$|^Error$/.test(name) ? name : "Error";
    this.record({ kind: "page-error", category: "uncaught-exception", name: safeName, outcome: "fail" });
  }

  csp(event: CspEvent) {
    if (event.disposition !== "enforce" && event.disposition !== "report") return;
    const directive = typeof event.directive === "string" && /^[a-z-]+$/.test(event.directive) ? event.directive : "unknown";
    const blocked = typeof event.blockedURL === "string" ? sanitizeUrl(event.blockedURL) : { url: "unknown", path: "" };
    const at = sanitizeLocation(event.sourceFile, event.line);
    const blocking = event.disposition === "enforce";
    this.record({
      kind: "csp-violation", disposition: event.disposition, directive, blocking, ...blocked,
      ...(at ? { location: at } : {}), ...(blocking ? { outcome: "fail" } : {}),
    });
  }

  #matching(rule: RequiredRequest) {
    return this.#attempts.filter((attempt) => sameRequest(attempt, rule.method, rule.url));
  }

  /** True once every required request has a terminal attempt and none of its attempts is still pending. */
  requiredSettled() {
    return this.required.every((rule) => {
      const attempts = this.#matching(rule);
      return attempts.length > 0 && attempts.every((attempt) => attempt.state !== "pending");
    });
  }

  freeze() {
    if (this.#frozen) return;
    this.#frozen = true;
    this.#inFlight = this.#attempts.filter((attempt) => attempt.state === "pending");
  }

  // The exception applies to the observed HTTP response, whether or not the page ever read its body.
  // Chromium does not finish a fetch whose body the page leaves unread, which is how an anonymous session
  // client typically treats a 401.
  #isExpected(attempt: Attempt) {
    return attempt.state !== "failed" && !attempt.redirected && attempt.status !== undefined && this.expected.some((rule) =>
      sameRequest(attempt, rule.method, rule.url) && attempt.resourceType === rule.resourceType && attempt.status === rule.status);
  }

  #outcome(attempt: Attempt): "pass" | "fail" | "expected" {
    if (attempt.state === "failed") return "fail";
    if (this.#isExpected(attempt)) return "expected";
    return attempt.status !== undefined && attempt.status < 400 ? "pass" : "fail";
  }

  // Required requests count only terminal attempts: requestfinished or requestfailed.
  #ruleOutcome(rule: RequiredRequest): { outcome: Rule["outcome"]; reason?: string; attempts: number; inFlight: number } {
    const attempts = this.#matching(rule);
    const terminal = attempts.filter((attempt) => !this.#inFlight.includes(attempt));
    const counts = { attempts: attempts.length, inFlight: attempts.length - terminal.length };
    if (terminal.some((attempt) => this.#outcome(attempt) === "fail")) return { outcome: "fail", ...counts };
    if (terminal.length === 0) return { outcome: "skipped", reason: "no-terminal-attempt", ...counts };
    if (counts.inFlight > 0) return { outcome: "skipped", reason: "attempt-in-flight", ...counts };
    return { outcome: "pass", ...counts };
  }

  result(visibleAssertion: "pass" | "fail") {
    this.freeze();
    const records: Observation[] = [];
    for (const attempt of this.#attempts) {
      const base = {
        method: attempt.method, resourceType: attempt.resourceType, ...sanitizeUrl(attempt.url),
        redirected: attempt.redirected, ...(attempt.status !== undefined ? { status: attempt.status } : {}),
      };
      const open = this.#inFlight.includes(attempt);
      if (open && attempt.status === undefined) records.push({ kind: "in-flight", ...base });
      else if (attempt.state === "failed") records.push({ kind: "request-failed", ...base, outcome: "fail" });
      else records.push({ kind: "response", ...base, transfer: open ? "unfinished" : "finished", outcome: this.#outcome(attempt) });
    }
    records.push(...this.#records);

    const rules: Rule[] = [{ type: "visible-assertion", outcome: visibleAssertion }];
    let incomplete = false;
    for (const rule of this.required) {
      const verdict = this.#ruleOutcome(rule);
      if (verdict.outcome === "skipped" || verdict.inFlight > 0) incomplete = true;
      rules.push({ type: "required-request", method: rule.method.toUpperCase(), ...sanitizeUrl(rule.url), ...verdict });
    }
    return { observations: group(records), rules, requiredComplete: !incomplete };
  }
}

function group(records: Observation[]) {
  const grouped = new Map<string, Observation>();
  for (const record of records) {
    const key = JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
    const existing = grouped.get(key);
    if (existing) existing.count = (existing.count ?? 1) + 1;
    else grouped.set(key, { ...record, count: 1 });
  }
  return [...grouped.values()];
}
