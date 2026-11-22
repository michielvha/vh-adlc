import { afterEach, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
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
