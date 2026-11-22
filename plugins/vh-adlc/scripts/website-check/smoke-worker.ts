import { readlink } from "node:fs/promises";

const [, , parentNetwork, module, executablePath, url, heading, deadlineText] = process.argv;
const interfaces = Bun.spawnSync(["ip", "-o", "link", "show"], { stderr: "ignore" });
if (await readlink("/proc/self/ns/net") === parentNetwork || interfaces.exitCode !== 0 ||
    !/^\d+: lo:/.test(interfaces.stdout.toString().trim()) || interfaces.stdout.toString().trim().includes("\n")) {
  throw new Error("Browser network boundary is unavailable");
}
const { chromium } = await import(module);
const context = await chromium.launchPersistentContext("/run/website-check/profile", {
  executablePath,
  headless: true,
  serviceWorkers: "block",
  proxy: { server: "http://127.0.0.1:3128", bypass: "<-loopback>" },
  timeout: 10_000,
});

const browserVersion = context.browser()?.version() ?? null;
const observations: { kind: string; path: string; status?: number }[] = [];
const deadline = performance.now() + Number(deadlineText);
const remaining = () => Math.max(1, deadline - performance.now());
let routeStatus: number | null = null;
let visibleAssertion: "pass" | "fail" = "fail";
let incomplete = false;
try {
  const page = context.pages()[0] ?? await context.newPage();
  page.on("response", (response: { url(): string; status(): number; headers(): Record<string, string> }) => {
    const from = new URL(response.url());
    if (response.status() >= 400) observations.push({ kind: "http", path: from.pathname, status: response.status() });
    const location = response.headers().location;
    if (location && response.status() >= 300 && response.status() < 400) {
      try {
        const to = new URL(location, from);
        if (from.protocol === "https:" && to.protocol === "http:") {
          observations.push({ kind: "blocked-downgrade", path: to.pathname, status: response.status() });
        } else if (from.origin !== to.origin) {
          observations.push({ kind: "blocked-origin", path: to.pathname, status: response.status() });
        }
      } catch {
        observations.push({ kind: "invalid-redirect", path: from.pathname, status: response.status() });
      }
    }
  });
  try {
    const response = await page.goto(url, { waitUntil: "load", timeout: remaining() });
    routeStatus = response?.status() ?? null;
  } catch {
    incomplete = true;
  }
  if (!incomplete) {
    try {
      await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible", timeout: remaining() });
      visibleAssertion = "pass";
    } catch {
      observations.push({ kind: "assertion", path: new URL(url).pathname });
    }
  }
  console.log(JSON.stringify({ browserVersion, routeStatus, visibleAssertion, observations, incomplete }));
} finally {
  await context.close();
}
