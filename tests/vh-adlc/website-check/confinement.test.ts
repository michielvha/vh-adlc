import { afterEach, expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinnedPlaywrightVersion } from "../../../plugins/vh-adlc/scripts/website-check/chromium";
import { existingSuiteMasksServiceFailure } from "./fixtures/existing-suite";
import { startSite } from "./fixtures/site";

type Site = ReturnType<typeof startSite>;
const sites: Site[] = [];
const runnerPath = new URL("../../../plugins/vh-adlc/scripts/website-check/runner.ts", import.meta.url);

afterEach(() => {
  for (const site of sites.splice(0)) site.dispose();
});

function fixture() {
  const site = startSite();
  sites.push(site);
  return site;
}

type Profile = {
  target: "build" | "deployed";
  origin: string;
  path: string;
  httpUpgradeUrl?: string;
  visibleHeading?: string;
};

async function smoke(site: Site, profile: Profile) {
  await access(runnerPath);
  const { runWebsiteCheck } = await import(runnerPath.href);
  return runWebsiteCheck({
    target: profile.target,
    origin: profile.origin,
    httpUpgradeUrl: profile.httpUpgradeUrl,
    mode: "report",
    chromium: { caFile: site.caFile },
    route: { path: profile.path, visibleHeading: profile.visibleHeading ?? "Release ready", deadlineMs: 8_000 },
  });
}

test("the build fixture serves a real document and logs the visit", async () => {
  const site = fixture();
  const response = await fetch(site.localURL);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("<h1>Release ready</h1>");
  expect(site.visits).toEqual([{ server: "http", method: "GET", path: "/" }]);
});

test("the HTTPS fixture trusts its own CA and preserves the redirect", async () => {
  const site = fixture();
  const response = await fetch(`${site.deploymentURL}/redirect`, {
    redirect: "manual",
    tls: { ca: await readFile(site.caFile, "utf8") },
  });
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(`${site.excludedURL}/navigation`);
  expect(site.visits).toEqual([{ server: "https", method: "GET", path: "/redirect" }]);
});

test("confined Chromium runs the same report-only route on the build and the HTTPS deployment", async () => {
  const site = fixture();
  const build = await smoke(site, { target: "build", origin: site.localURL, path: "/" });
  const deployed = await smoke(site, { target: "deployed", origin: site.deploymentURL, path: "/allowed" });
  for (const result of [build, deployed]) {
    expect(result.mode).toBe("report");
    expect(result.browser).toBe("chromium");
    expect(result.browserVersion).toMatch(/^156\./);
    expect(result.exitCode).toBe(0);
    expect(result.routeStatus).toBe(200);
    expect(result.visibleAssertion).toBe("pass");
  }
  expect(site.visits).toContainEqual({ server: "http", method: "GET", path: "/" });
  expect(site.visits).toContainEqual({ server: "https", method: "GET", path: "/allowed" });
  expect(site.visits).toContainEqual({ server: "https", method: "GET", path: "/" });
}, 30_000);

test("release report sees the service failure an existing Playwright mock hides", async () => {
  const site = fixture();
  expect(await existingSuiteMasksServiceFailure(site.localURL)).toBe("Service ready");
  expect(site.visits.filter(({ path }) => path === "/service.js")).toEqual([]);
  const result = await smoke(site, { target: "build", origin: site.localURL, path: "/service" });
  expect(result.exitCode).toBe(0);
  expect(result.visibleAssertion).toBe("pass");
  expect(result.observations).toContainEqual(expect.objectContaining({ path: "/service.js", status: 503 }));
  expect(site.visits).toContainEqual({ server: "http", method: "GET", path: "/service.js" });
}, 30_000);

test("the excluded destination receives no navigation, resource or service worker request", async () => {
  const site = fixture();
  const control = await fetch(`${site.excludedURL}/log-control`, { tls: { ca: await readFile(site.caFile, "utf8") } });
  expect(await control.text()).toBe("out of scope");
  expect(site.visits.splice(0)).toEqual([{ server: "excluded", method: "GET", path: "/log-control" }]);
  for (const path of ["/redirect", "/resources", "/worker"]) {
    const result = await smoke(site, {
      target: "deployed", origin: site.deploymentURL, path,
      visibleHeading: path === "/worker" ? "Worker fixture executed" : undefined,
    });
    if (path === "/worker") expect(result.visibleAssertion).toBe("pass");
    else expect(result.observations).toContainEqual(expect.objectContaining({ kind: "blocked-origin" }));
    expect(site.visits).toContainEqual({ server: "https", method: "GET", path });
  }
  expect(site.visits).toContainEqual({ server: "https", method: "GET", path: "/asset" });
  expect(site.visits.filter(({ path }) => path === "/sw.js")).toEqual([]);
  expect(site.visits.filter(({ server }) => server === "excluded")).toEqual([]);
  console.log("Scope destination log", JSON.stringify(site.visits));
}, 45_000);

test("a separate HTTP upgrade request does not permit a downgrade to that origin", async () => {
  const site = fixture();
  const result = await smoke(site, {
    target: "deployed", origin: site.deploymentURL, path: "/downgrade", httpUpgradeUrl: `${site.localURL}/upgrade`,
  });
  expect(result.observations).toContainEqual(expect.objectContaining({ kind: "blocked-downgrade" }));
  expect(result.observations).toContainEqual(expect.objectContaining({ kind: "http-upgrade" }));
  expect(site.visits).toContainEqual({ server: "https", method: "GET", path: "/downgrade" });
  expect(site.visits.filter(({ server }) => server === "http")).toEqual([
    { server: "http", method: "GET", path: "/upgrade" },
  ]);
  console.log("Upgrade destination log", JSON.stringify(site.visits));
}, 30_000);

test("missing proxy prerequisites fail before the browser contacts the site", async () => {
  const site = fixture();
  const previous = process.env.WEBSITE_CHECK_SQUID;
  process.env.WEBSITE_CHECK_SQUID = "/nonexistent/website-check/squid";
  try {
    await expect(smoke(site, { target: "build", origin: site.localURL, path: "/" }))
      .rejects.toThrow("Missing prerequisite: squid");
    expect(site.visits).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.WEBSITE_CHECK_SQUID;
    else process.env.WEBSITE_CHECK_SQUID = previous;
  }
});

// A run that passes profile validation fails on this missing proxy instead, so a rejection that names the
// offending key or CA proves the profile was refused before the proxy, the boundary or the browser started.
async function withoutProxy<T>(run: () => Promise<T>) {
  const previous = process.env.WEBSITE_CHECK_SQUID;
  process.env.WEBSITE_CHECK_SQUID = "/nonexistent/website-check/squid";
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.WEBSITE_CHECK_SQUID;
    else process.env.WEBSITE_CHECK_SQUID = previous;
  }
}

function validProfile(target: "build" | "deployed", origin: string): Record<string, any> {
  return {
    target, origin, mode: "report", browser: "chromium",
    expectedResponses: [{ method: "GET", url: `${origin}/auth/session`, resourceType: "fetch", status: 401 }],
    route: {
      path: "/", visibleHeading: "Release ready", deadlineMs: 8_000,
      requiredRequests: [{ method: "GET", url: `${origin}/asset` }],
    },
  };
}

const rejectedProfiles: [string, (profile: Record<string, any>, site: Site) => void, string][] = [
  ["browser firefox", (p) => { p.browser = "firefox"; }, "firefox"],
  ["browser webkit", (p) => { p.browser = "webkit"; }, "webkit"],
  ["an undefined top-level key", (p) => { p.routes = []; }, "routes"],
  ["an undefined key in route", (p) => { p.route.requiredRequest = p.route.requiredRequests; }, "requiredRequest"],
  ["an undefined key in a required request", (p) => { p.route.requiredRequests[0].query = "a=1"; }, "query"],
  ["an undefined key in an expected response", (p) => { p.expectedResponses[0].anonymous = true; }, "anonymous"],
  ["a profile certificate authority", (p, site) => { p.chromium = { caFile: site.caFile }; }, "chromium"],
];

for (const target of ["build", "deployed"] as const) {
  test(`an otherwise valid ${target} profile reaches the proxy prerequisites`, async () => {
    const site = fixture();
    const origin = target === "build" ? site.localURL : site.deploymentURL;
    const { runWebsiteCheck } = await import(runnerPath.href);
    await withoutProxy(() => expect(runWebsiteCheck(validProfile(target, origin), { fixtureCaFile: site.caFile }))
      .rejects.toThrow("Missing prerequisite"));
    expect(site.visits).toEqual([]);
  });

  for (const [name, change, named] of rejectedProfiles) {
    test(`a ${target} profile with ${name} is invalid configuration before anything starts`, async () => {
      const site = fixture();
      const profile = validProfile(target, target === "build" ? site.localURL : site.deploymentURL);
      change(profile, site);
      const { runWebsiteCheck } = await import(runnerPath.href);
      const error = await withoutProxy(() => runWebsiteCheck(profile, { fixtureCaFile: site.caFile }).then(() => undefined, (e: Error) => e));
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toContain("Invalid website smoke profile");
      expect(error?.message).toContain(named);
      expect(error?.message).not.toContain("Missing prerequisite");
      expect(site.visits).toEqual([]);
    });
  }
}

test("a fixture CA with a non-loopback origin is invalid configuration before anything starts", async () => {
  const site = fixture();
  const { runWebsiteCheck } = await import(runnerPath.href);
  const error = await withoutProxy(() => runWebsiteCheck(validProfile("deployed", "https://release.example.invalid"),
    { fixtureCaFile: site.caFile }).then(() => undefined, (e: Error) => e));
  expect(error?.message).toContain("fixture CA");
  expect(error?.message).not.toContain("Missing prerequisite");
  expect(site.visits).toEqual([]);
});

test("a playwright-core module that differs from the pin is refused before launch", async () => {
  const site = fixture();
  const module = await mkdtemp(join(tmpdir(), "website-check-module-"));
  await writeFile(join(module, "package.json"), JSON.stringify({ name: "playwright-core", version: "0.0.1" }));
  await writeFile(join(module, "index.mjs"), "export const chromium = {};\n");
  const previous = process.env.WEBSITE_CHECK_PLAYWRIGHT_MODULE;
  process.env.WEBSITE_CHECK_PLAYWRIGHT_MODULE = join(module, "index.mjs");
  try {
    const { runWebsiteCheck } = await import(runnerPath.href);
    await expect(runWebsiteCheck(validProfile("build", site.localURL)))
      .rejects.toThrow(`Website smoke requires playwright-core ${await pinnedPlaywrightVersion()}`);
    expect(site.visits).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.WEBSITE_CHECK_PLAYWRIGHT_MODULE;
    else process.env.WEBSITE_CHECK_PLAYWRIGHT_MODULE = previous;
    await rm(module, { recursive: true, force: true });
  }
});
