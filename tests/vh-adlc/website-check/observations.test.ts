import { afterEach, expect, test } from "bun:test";
import { runWebsiteCheck } from "../../../plugins/vh-adlc/scripts/website-check/runner";
import { startObservationSite, SYNTHETIC_SECRET } from "./fixtures/observation-site";

type Site = Awaited<ReturnType<typeof startObservationSite>>;
type Observation = Record<string, unknown> & { kind: string };
type Rule = Record<string, unknown> & { type: string; outcome: string };
type Result = {
  exitCode: number;
  coverage: string;
  boundary: string;
  visibleAssertion: string;
  observations: Observation[];
  rules: Rule[];
};

const sites: Site[] = [];

afterEach(() => {
  for (const site of sites.splice(0)) site.dispose();
});

async function fixture() {
  const site = await startObservationSite();
  sites.push(site);
  return site;
}

async function observe(site: Site, route: {
  path: string;
  visibleHeading?: string;
  deadlineMs?: number;
  requiredRequests?: { method: string; url: string }[];
}, expectedResponses: { method: string; url: string; resourceType: string; status: number }[] = []): Promise<Result> {
  return runWebsiteCheck({
    target: "deployed",
    origin: site.origin,
    mode: "report",
    chromium: { caFile: site.caFile },
    expectedResponses,
    route: {
      path: route.path,
      visibleHeading: route.visibleHeading ?? "Release ready",
      deadlineMs: route.deadlineMs ?? 8_000,
      requiredRequests: route.requiredRequests ?? [],
    },
  });
}

function responses(result: Result, path: string) {
  return result.observations.filter((o) => o.kind === "response" && o.path === path);
}

function rule(result: Result, path: string) {
  return result.rules.find((r) => r.type === "required-request" && r.path === path);
}

test("only the exact anonymous session response is expected", async () => {
  const site = await fixture();
  const result = await observe(site, {
    path: "/session",
    requiredRequests: [{ method: "GET", url: `${site.origin}/required.js` }],
  }, [{ method: "GET", url: `${site.origin}/auth/session`, resourceType: "fetch", status: 401 }]);

  // Every variant really reached the server, so each verdict rests on a real response.
  for (const search of ["", `?probe=${SYNTHETIC_SECRET}`]) {
    expect(site.visits).toContainEqual({ method: "GET", path: "/auth/session", search });
  }
  expect(site.visits).toContainEqual({ method: "POST", path: "/auth/session", search: "" });
  expect(site.visits).toContainEqual({ method: "GET", path: "/old-session", search: "" });

  const expected = result.observations.filter((o) => o.outcome === "expected");
  expect(expected).toEqual([expect.objectContaining({
    kind: "response", method: "GET", resourceType: "fetch", path: "/auth/session", status: 401, redirected: false,
  })]);
  const direct = responses(result, "/auth/session").filter((o) => o.method === "GET" && o.redirected === false);
  expect(direct.map((o) => o.outcome).sort()).toEqual(["expected", "fail"]);
  expect(responses(result, "/auth/session")).toContainEqual(expect.objectContaining({
    method: "GET", status: 401, redirected: true, outcome: "fail",
  }));
  expect(responses(result, "/auth/session")).toContainEqual(expect.objectContaining({
    method: "POST", status: 401, outcome: "fail",
  }));
  expect(responses(result, "/required.js")).toContainEqual(expect.objectContaining({
    resourceType: "script", status: 401, outcome: "fail",
  }));
  expect(rule(result, "/required.js")).toEqual(expect.objectContaining({ method: "GET", outcome: "fail" }));

  // Console records stay visible on their own and are never attributed to the expected response.
  const consoleRecords = result.observations.filter((o) => o.kind === "console");
  expect(consoleRecords).toContainEqual(expect.objectContaining({ level: "error", location: expect.objectContaining({ path: "/session" }) }));
  for (const record of consoleRecords) expect(record).not.toHaveProperty("outcome");

  expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
  expect(result.visibleAssertion).toBe("pass");
  expect(result.coverage).toBe("complete");
  expect(result.exitCode).toBe(0);
}, 30_000);

test("enforced and report-only CSP violations stay distinct from a transport failure", async () => {
  const site = await fixture();
  const result = await observe(site, { path: "/csp" });
  expect(site.visits).toContainEqual({ method: "GET", path: "/pixel.gif", search: "" });
  expect(site.visits).toContainEqual({ method: "GET", path: "/drop", search: "" });

  const violations = result.observations.filter((o) => o.kind === "csp-violation");
  expect(violations).toContainEqual(expect.objectContaining({ disposition: "enforce", directive: "connect-src", blocking: true }));
  expect(violations).toContainEqual(expect.objectContaining({ disposition: "report", directive: "img-src", blocking: false }));
  expect(result.observations).toContainEqual(expect.objectContaining({ kind: "request-failed", path: "/drop", outcome: "fail" }));
  expect(violations.filter((o) => o.path === "/drop")).toEqual([]);
  expect(responses(result, "/pixel.gif")).toContainEqual(expect.objectContaining({ status: 200, outcome: "pass" }));
  expect(result.coverage).toBe("complete");
  expect(result.exitCode).toBe(0);
}, 30_000);

test("retries, failed bodies and late failures of required requests each fail their rule", async () => {
  const site = await fixture();
  const result = await observe(site, {
    path: "/timing",
    requiredRequests: ["/flaky", "/partial", "/late"].map((path) => ({ method: "GET", url: `${site.origin}${path}` })),
  });
  expect(responses(result, "/flaky").map((o) => o.status).sort()).toEqual([200, 503]);
  expect(rule(result, "/flaky")?.outcome).toBe("fail");
  expect(result.observations).toContainEqual(expect.objectContaining({
    kind: "request-failed", path: "/partial", status: 200, outcome: "fail",
  }));
  expect(rule(result, "/partial")?.outcome).toBe("fail");
  expect(responses(result, "/late")).toContainEqual(expect.objectContaining({ status: 500, outcome: "fail" }));
  expect(rule(result, "/late")?.outcome).toBe("fail");
  expect(result.visibleAssertion).toBe("pass");
  expect(result.boundary).toBe("complete");
  expect(result.coverage).toBe("complete");
  expect(result.exitCode).toBe(0);
}, 30_000);

test("a required request that never starts leaves coverage incomplete at the deadline", async () => {
  const site = await fixture();
  const result = await observe(site, {
    path: "/", deadlineMs: 3_000, requiredRequests: [{ method: "GET", url: `${site.origin}/never` }],
  });
  expect(site.visits.filter(({ path }) => path === "/never")).toEqual([]);
  expect(rule(result, "/never")?.outcome).toBe("skipped");
  expect(result.visibleAssertion).toBe("pass");
  expect(result.boundary).toBe("deadline");
  expect(result.coverage).toBe("incomplete");
  expect(result.exitCode).not.toBe(0);
}, 30_000);

test("a false visible assertion at the deadline is a failed rule, not missing coverage", async () => {
  const site = await fixture();
  const result = await observe(site, { path: "/", visibleHeading: "Not on this page", deadlineMs: 3_000 });
  expect(result.visibleAssertion).toBe("fail");
  expect(result.rules).toContainEqual(expect.objectContaining({ type: "visible-assertion", outcome: "fail" }));
  expect(result.observations).toContainEqual(expect.objectContaining({ kind: "assertion", path: "/" }));
  expect(result.boundary).toBe("deadline");
  expect(result.coverage).toBe("complete");
  expect(result.exitCode).toBe(0);
}, 30_000);

test("a matching attempt still in flight at the deadline leaves coverage incomplete", async () => {
  const site = await fixture();
  const result = await observe(site, {
    path: "/overlap", deadlineMs: 4_000, requiredRequests: [{ method: "GET", url: `${site.origin}/overlap-data` }],
  });
  expect(site.visits.filter(({ path }) => path === "/overlap-data")).toHaveLength(2);
  expect(responses(result, "/overlap-data")).toContainEqual(expect.objectContaining({ status: 200, outcome: "pass" }));
  expect(rule(result, "/overlap-data")?.outcome).toBe("skipped");
  expect(result.visibleAssertion).toBe("pass");
  expect(result.boundary).toBe("deadline");
  expect(result.coverage).toBe("incomplete");
  expect(result.exitCode).not.toBe(0);
}, 30_000);
