import { readlink } from "node:fs/promises";
import { ObservationCollector, parseRules, sanitizeUrl, type CspEvent } from "./observations";

type Request = {
  method(): string; url(): string; resourceType(): string; redirectedFrom(): Request | null;
};
type Response = { url(): string; status(): number; headers(): Record<string, string>; request(): Request };

const [, , parentNetwork, module, executablePath, url, heading, deadlineText, rulesText] = process.argv;
const interfaces = Bun.spawnSync(["ip", "-o", "link", "show"], { stderr: "ignore" });
if (await readlink("/proc/self/ns/net") === parentNetwork || interfaces.exitCode !== 0 ||
    !/^\d+: lo:/.test(interfaces.stdout.toString().trim()) || interfaces.stdout.toString().trim().includes("\n")) {
  throw new Error("Browser network boundary is unavailable");
}
const { required, expected } = parseRules(rulesText);

const { chromium } = await import(module);
const context = await chromium.launchPersistentContext("/run/website-check/profile", {
  executablePath,
  headless: true,
  serviceWorkers: "block",
  proxy: { server: "http://127.0.0.1:3128", bypass: "<-loopback>" },
  timeout: 10_000,
});

const browserVersion = context.browser()?.version() ?? null;
const collector = new ObservationCollector(required, expected);
const attempts = new Map<Request, ReturnType<ObservationCollector["started"]>>();
let routeStatus: number | null = null;
let visibleAssertion: "pass" | "fail" = "fail";
let navigated = false;
let boundary: "complete" | "deadline" | "navigation-failed" = "deadline";
try {
  await context.exposeBinding("__websiteCheckCsp", (_source: unknown, event: CspEvent) => { collector.csp(event); });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report = Reflect.get(window, "__websiteCheckCsp");
      if (typeof report !== "function") return;
      void Promise.resolve(report({
        disposition: event.disposition, directive: event.effectiveDirective, blockedURL: event.blockedURI,
        sourceFile: event.sourceFile, line: event.lineNumber,
      })).catch(() => {});
    }, true);
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on("request", (request: Request) => {
    attempts.set(request, collector.started({
      method: request.method(), url: request.url(), resourceType: request.resourceType(),
      redirected: request.redirectedFrom() !== null,
    }));
  });
  page.on("requestfinished", (request: Request) => { collector.finished(attempts.get(request)); });
  page.on("requestfailed", (request: Request) => { collector.failed(attempts.get(request)); });
  page.on("console", (message: { type(): string; location(): { url?: string; lineNumber?: number } }) => {
    collector.console(message.type(), message.location());
  });
  page.on("pageerror", (error: Error) => { collector.pageError(error.name); });
  page.on("response", (response: Response) => {
    collector.responded(attempts.get(response.request()), response.status());
    const location = response.headers().location;
    if (!location || response.status() < 300 || response.status() >= 400) return;
    const from = new URL(response.url());
    try {
      const to = new URL(location, from);
      const kind = from.protocol === "https:" && to.protocol === "http:" ? "blocked-downgrade"
        : from.origin !== to.origin ? "blocked-origin" : null;
      if (kind) collector.record({ kind, ...sanitizeUrl(to.href), status: response.status() });
    } catch {
      collector.record({ kind: "invalid-redirect", ...sanitizeUrl(from.href), status: response.status() });
    }
  });

  // The deadline starts immediately before navigation and bounds navigation and observation alike.
  const deadline = performance.now() + Number(deadlineText);
  const remaining = () => Math.max(0, deadline - performance.now());
  try {
    const response = await page.goto(url, { waitUntil: "load", timeout: Math.max(1, remaining()) });
    routeStatus = response?.status() ?? null;
    navigated = true;
  } catch {
    boundary = remaining() > 0 ? "navigation-failed" : "deadline";
  }
  if (navigated) {
    let visible = false;
    void page.getByRole("heading", { name: heading, exact: true })
      .waitFor({ state: "visible", timeout: Math.max(1, remaining()) })
      .then(() => { visible = true; collector.wake(); }, () => {});
    while (!(visible && collector.requiredSettled())) {
      if (remaining() <= 0) break;
      await collector.changed(remaining());
    }
    if (visible && collector.requiredSettled()) boundary = "complete";
    // Deliver browser events emitted before this point, such as pending CSP binding calls.
    await page.evaluate(() => true).catch(() => {});
    collector.freeze();
    visibleAssertion = visible ? "pass" : "fail";
  }
  const { observations, rules: outcomes, requiredComplete } = collector.result(visibleAssertion);
  if (navigated && visibleAssertion === "fail") observations.push({ kind: "assertion", ...sanitizeUrl(url), count: 1 });
  console.log(JSON.stringify({
    browserVersion, routeStatus, visibleAssertion, boundary,
    coverage: navigated && requiredComplete ? "complete" : "incomplete",
    observations, rules: outcomes,
  }));
} finally {
  await context.close();
}
