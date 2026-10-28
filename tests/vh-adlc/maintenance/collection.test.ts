import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collect } from "../../../plugins/vh-adlc/scripts/maintenance/collect";
import { createGitHubReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { fixture } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
const sha = "a".repeat(40);
function pull(number = 1, login = "renovate[bot]", type = "Bot") {
  return { number, title: `Update dependency ${number}`, body: "Untrusted $(touch should-not-exist)", state: "open", draft: false,
    user: { login, type }, head: { sha, ref: `update-${number}` }, base: { sha: "b".repeat(40), ref: "main", repo: { full_name: "example/project" } },
    changed_files: 1, updated_at: "2026-10-29T00:00:00Z" };
}
function setup(overrides: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  const f = fixture(); projects.push(f);
  f.settings({ schema_version: 1, ...settings });
  const responses: Record<string, unknown> = {
    "repos/example/project": { id: 42, full_name: "example/project", default_branch: "main" },
    "repos/example/project/pulls": [pull()], "repos/example/project/pulls/1": pull(),
    "repos/example/project/pulls/1/files": [{ filename: "package.json", status: "modified", patch: "+dependency" }],
    [`repos/example/project/commits/${sha}/check-runs`]: { total_count: 1, check_runs: [{ id: 11, name: "CI", status: "completed", conclusion: "success", head_sha: sha }] },
    [`repos/example/project/commits/${sha}/check-suites`]: { total_count: 1, check_suites: [{ id: 21, head_sha: sha }] },
    [`repos/example/project/commits/${sha}/status`]: { total_count: 0, state: "pending", sha, statuses: [] },
    "repos/example/project/dependabot/alerts": [{ number: 1, state: "open", dependency: { package: { name: "widget" }, manifest_path: "package.json" }, security_advisory: { severity: "high", summary: "Untrusted advisory" } }],
    "repos/example/project/code-scanning/alerts": [],
    ...overrides,
  };
  f.write(".tools/responses.json", JSON.stringify(responses));
  f.write(".tools/gh", `#!/usr/bin/env bun
import { readFileSync, appendFileSync, writeFileSync, writeSync } from "node:fs";
const args=process.argv.slice(2);
appendFileSync(process.env.MAINTENANCE_FAKE_LOG,JSON.stringify(args)+"\\n");
if(args[0]!=="api"||args[args.indexOf("--method")+1]!=="GET")throw Error("mutation denied");
const target=args.at(-1),url=new URL(target.startsWith("https:")?target:"https://api.github.com/"+target);
const route=url.pathname.replace(/^\\//,""),page=url.searchParams.get("page")??"1";
const all=JSON.parse(readFileSync(process.env.MAINTENANCE_FAKE_RESPONSES,"utf8"));
let value=all[route+"?page="+page]??all[route];
if(value?.__sequence){const key=all[route+"?page="+page]?route+"?page="+page:route;const sequence=value.__sequence;value=sequence[0];if(sequence.length>1){all[key].__sequence=sequence.slice(1);writeFileSync(process.env.MAINTENANCE_FAKE_RESPONSES,JSON.stringify(all));}}
if(value===undefined)value={__status:404,body:{message:"Fixture endpoint missing"}};
const status=value?.__status??200,body=value?.__status?value.body:value?.__headers?value.body:value;
writeSync(1,"HTTP/2.0 "+status+" Response\\r\\n"+(value?.__headers??"")+"\\r\\n"+JSON.stringify(body));
process.exit(status>=400?1:0);
`);
  chmodSync(join(f.root, ".tools/gh"), 0o755);
  const env = { ...process.env, PATH: `${join(f.root, ".tools")}:${process.env.PATH}`,
    MAINTENANCE_FAKE_LOG: join(f.root, ".tools/requests.jsonl"), MAINTENANCE_FAKE_RESPONSES: join(f.root, ".tools/responses.json") };
  return { ...f, responses, env,
    save() { f.write(".tools/responses.json", JSON.stringify(responses)); },
    reader: createGitHubReader("github.com", { env }),
    requests() { return readFileSync(env.MAINTENANCE_FAKE_LOG, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]); },
  };
}

test("actual CLI collection uses only fixed GET argv and retains head, files, checks and independent alerts", async () => {
  const f = setup(), result = await collect(loadSettings(f.root), { reader: f.reader });
  const repo = result.repositories[0];
  expect(repo.pulls[0].head).toBe(sha);
  expect(repo.pulls[0].files[0].filename).toBe("package.json");
  expect(repo.pulls[0].checks[0].name).toBe("CI");
  expect(repo.pulls[0].evidence.status).toBe("complete");
  expect(repo.dependabot.alerts[0].package).toBe("widget");
  expect(repo.dependabot.coverage).toMatchObject({ status: "complete", count: 1 });
  expect(repo.code_scanning.coverage).toMatchObject({ status: "complete", count: 0 });
  expect(existsSync(join(f.root, "should-not-exist"))).toBe(false);
  for (const argv of f.requests()) {
    expect(argv.slice(0, 6)).toEqual(["api", "--hostname", "github.com", "--method", "GET", "--include"]);
    expect(argv).toHaveLength(7);
  }
});

test("every page is collected and unknown bot accounts stay inventory gaps", async () => {
  const f = setup({
    "repos/example/project/pulls?page=1": { __headers: 'Link: <https://api.github.com/repos/example/project/pulls?state=open&per_page=100&page=2>; rel="next"\r\n', body: [pull()] },
    "repos/example/project/pulls?page=2": [pull(2, "renamed-bot", "Bot")],
    "repos/example/project/pulls/2": pull(2, "renamed-bot", "Bot"),
    "repos/example/project/pulls/2/files": [{ filename: "package.json", status: "modified" }],
  });
  const repo = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0];
  expect(repo.pulls.map(p => p.number)).toEqual([1, 2]);
  expect(repo.pulls[1].author_class).toBe("gap");
  expect(repo.pulls[0].author_class).toBe("configured");
  expect(repo.coverage.pulls).toMatchObject({ status: "complete", pages: 2, count: 2 });
});

test("documented unavailable scanning is n/a while Dependabot stays independently complete", async () => {
  const f = setup({ "repos/example/project/code-scanning/alerts": { __status: 403, body: { message: "Advanced Security is not enabled for this repository" } } });
  f.write("security.md", "Documented private-repository limitation.\n");
  f.settings({ schema_version: 1, surface_expectations: [{ repository: "example/project", surface: "code_scanning", status: 403,
    message_contains: "Advanced Security is not enabled", reason: "Documented no GHAS", evidence: "security.md" }] });
  const repo = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0];
  expect(repo.code_scanning.alerts).toBeNull();
  expect(repo.code_scanning.coverage).toMatchObject({ status: "complete-unavailable", count: null, reason: "Documented no GHAS" });
  expect(repo.dependabot.coverage).toMatchObject({ status: "complete", count: 1 });
});

test.each([403, 404, 429])("an unmatched %i is incomplete, never an empty successful security surface", async status => {
  const f = setup({ "repos/example/project/code-scanning/alerts": { __status: status, body: { message: "Access or rate-limit failure" } } });
  const repo = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0];
  expect(repo.code_scanning.coverage.status).toBe("incomplete");
  expect(repo.code_scanning.coverage.count).toBeNull();
  expect(repo.dependabot.coverage.status).toBe("complete");
});

test("partial pages retain observations without turning their size into a total", async () => {
  const f = setup({
    "repos/example/project/dependabot/alerts?page=1": { __headers: 'Link: <https://api.github.com/repos/example/project/dependabot/alerts?state=open&per_page=100&page=2>; rel="next"\r\n', body: [{ number: 4, state: "open", dependency: { package: { name: "partial" }, manifest_path: "go.mod" }, security_advisory: { severity: "critical" } }] },
    "repos/example/project/dependabot/alerts?page=2": { __status: 500, body: { message: "Server failure" } },
  });
  const surface = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0].dependabot;
  expect(surface.alerts).toHaveLength(1);
  expect(surface.coverage).toMatchObject({ status: "incomplete", count: null, pages: 2 });
});

test("foreign or widened next links are denied before the next request", async () => {
  for (const next of ["https://other.example/repos/example/project/pulls?state=open&per_page=100&page=2",
    "https://api.github.com/repos/example/project/pulls?state=closed&per_page=100&page=2"]) {
    const f = setup({ "repos/example/project/pulls": { __headers: `Link: <${next}>; rel="next"\r\n`, body: [pull()] } });
    const repo = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0];
    expect(repo.coverage.pulls.status).toBe("incomplete");
    expect(f.requests().some(args => args.at(-1) === next)).toBe(false);
  }
});

test("missing check/file evidence is scoped to that PR rather than unrelated alert coverage", async () => {
  const f = setup({ [`repos/example/project/commits/${sha}/check-runs`]: { __status: 403, body: { message: "Checks unavailable" } } });
  const repo = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0];
  expect(repo.pulls[0].evidence.status).toBe("incomplete");
  expect(repo.dependabot.coverage.status).toBe("complete");
});

test("files truncated below the PR changed-files count cannot establish complete evidence", async () => {
  const f = setup({ "repos/example/project/pulls/1": { ...pull(), changed_files: 2 } });
  expect((await collect(loadSettings(f.root), { reader: f.reader })).repositories[0].pulls[0].evidence.status).toBe("incomplete");
});

test("configured dashboard-only work is collected, and ambiguity remains incomplete", async () => {
  const f = setup({ "repos/example/project/pulls": [], "repos/example/project/issues": [{ number: 9, title: "Dependency Dashboard", body: "- [ ] Deferred widget update", state: "open" }] },
    { dashboards: [{ repository: "example/project", title: "Dependency Dashboard" }] });
  let repo = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0];
  expect(repo.dashboards[0].body).toContain("Deferred widget");
  expect(repo.coverage.dashboards.status).toBe("complete");
  f.responses["repos/example/project/issues"] = [{ number: 9, title: "Dependency Dashboard", body: "One", state: "open" }, { number: 10, title: "Dependency Dashboard", body: "Two", state: "open" }]; f.save();
  repo = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0];
  expect(repo.coverage.dashboards.status).toBe("incomplete");
});

test("organization gaps are visible but explicit repository scope does not expand collection", async () => {
  const f = setup({ "orgs/example/repos": [{ full_name: "example/project", archived: false }, { full_name: "example/new-project", archived: false }, { full_name: "example/excluded", archived: false }] },
    { discovery_organizations: ["example"], excluded_repositories: ["example/excluded"] });
  let result = await collect(loadSettings(f.root), { reader: f.reader });
  expect(result.discovery[0].repositories.find(r => r.repository === "example/new-project")?.inventory_gap).toBe(true);
  expect(result.discovery[0].repositories.find(r => r.repository === "example/excluded")?.excluded).toBe(true);
  f.write(".tools/requests.jsonl", "");
  result = await collect(loadSettings(f.root), { reader: f.reader, scope: { repository: "example/project", pull: 1 } });
  expect(result.discovery).toEqual([]);
  expect(f.requests().every(args => !args.at(-1)!.includes("orgs/"))).toBe(true);
  expect(result.scope.pull).toBe(1);
  expect(result.requests.every(request => !request.endpoint.includes("orgs/"))).toBe(true);
});

test("the collector's runtime import graph does not load triage execution or the controller", async () => {
  const imports: string[] = [];
  const result = await Bun.build({ entrypoints: [join(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/collect.ts")], target: "bun",
    plugins: [{ name: "record-runtime-imports", setup(build) { build.onResolve({ filter: /.*/ }, args => { imports.push(args.path); return undefined; }); } }] });
  expect(result.success).toBe(true);
  expect(imports.some(path => /(?:^|\/)(?:execute|controller[^/]*|verification)(?:\.ts)?$/.test(path))).toBe(false);
});

test("a selected PR cannot cause reads of a different response identity", async () => {
  const f = setup({ "repos/example/project/pulls/1": pull(2) });
  const result = await collect(loadSettings(f.root), { reader: f.reader, scope: { pull: 1 } });
  expect(result.repositories[0].coverage.pulls.status).toBe("incomplete");
  expect(result.repositories[0].pulls).toEqual([]);
  expect(f.requests().some(args => args.at(-1)!.includes("pulls/2"))).toBe(false);
});

test("closed records cannot masquerade as an open PR inventory", async () => {
  const f = setup({ "repos/example/project/pulls": [{ ...pull(), state: "closed" }] });
  expect((await collect(loadSettings(f.root), { reader: f.reader })).repositories[0].coverage.pulls.status).toBe("incomplete");
});

test("duplicate check runs do not establish complete PR evidence", async () => {
  const check = { id: 11, name: "CI", status: "completed", conclusion: "success", head_sha: sha };
  const f = setup({ [`repos/example/project/commits/${sha}/check-runs`]: { total_count: 2, check_runs: [check, check] } });
  expect((await collect(loadSettings(f.root), { reader: f.reader })).repositories[0].pulls[0].evidence.status).toBe("incomplete");
});

test("a moving PR head is observed instead of returning mixed evidence as current", async () => {
  const f = setup({ "repos/example/project/pulls/1": { __sequence: [pull(), { ...pull(), head: { sha: "c".repeat(40), ref: "update-1" } }] } });
  expect((await collect(loadSettings(f.root), { reader: f.reader })).repositories[0].pulls[0].evidence.status).toBe("incomplete");
});

test("a foreign repository in an organization response makes that discovery incomplete", async () => {
  const f = setup({ "orgs/example/repos": [{ full_name: "foreign/project", archived: false }] }, { discovery_organizations: ["example"] });
  const result = await collect(loadSettings(f.root), { reader: f.reader });
  expect(result.discovery[0].coverage.status).toBe("incomplete");
  expect(result.repositories[0].dependabot.coverage.status).toBe("complete");
});

test("newly enabled scanning returns findings despite an earlier unavailable expectation", async () => {
  const f = setup({ "repos/example/project/code-scanning/alerts": [{ number: 8, state: "open", rule: { id: "rule-1", security_severity_level: "high", description: "Finding" }, most_recent_instance: { location: { path: "src/app.ts" } } }] });
  f.write("security.md", "Previous no-GHAS policy.\n");
  f.settings({ schema_version: 1, surface_expectations: [{ repository: "example/project", surface: "code_scanning", status: 403,
    message_contains: "Advanced Security", reason: "Earlier unavailable", evidence: "security.md" }] });
  const surface = (await collect(loadSettings(f.root), { reader: f.reader })).repositories[0].code_scanning;
  expect(surface.coverage).toMatchObject({ status: "complete", count: 1 });
  expect(surface.alerts?.[0].number).toBe(8);
});

test("a discovery failure cannot invalidate independently complete configured-repository evidence", async () => {
  const f = setup({ "orgs/example/repos": { __status: 403, body: { message: "Organization unavailable" } } }, { discovery_organizations: ["example"] });
  const result = await collect(loadSettings(f.root), { reader: f.reader });
  expect(result.discovery[0].coverage.status).toBe("incomplete");
  expect(result.repositories[0].coverage.pulls.status).toBe("complete");
  expect(result.repositories[0].dependabot.coverage.status).toBe("complete");
});

test("more than 1000 suites uses every suite instead of trusting the capped aggregate", async () => {
  const f = setup(), visited: number[] = [];
  const reader = { ...f.reader, pages(endpoint: string, expected?: Parameters<typeof f.reader.pages>[1]) {
    if (endpoint.includes(`/commits/${sha}/check-suites?`)) return { items: Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, head_sha: sha })), pages: 11, complete: true };
    const match = endpoint.match(/\/check-suites\/(\d+)\/check-runs\?/);
    if (match) {
      const id = Number(match[1]); visited.push(id);
      const check = { id: id === 1 ? 11 : 99, name: id === 1 ? "CI" : "Late suite", status: "completed", conclusion: "success", head_sha: sha };
      return { items: id === 1 || id === 1001 ? [check] : [], pages: 1, complete: true };
    }
    return f.reader.pages(endpoint, expected);
  } };
  const row = (await collect(loadSettings(f.root), { reader })).repositories[0].pulls[0];
  expect(visited).toHaveLength(1001);
  expect(row.checks.some(check => check.id === 99)).toBe(true);
  expect(row.evidence.status).toBe("complete");
});

test("a stale combined-status response is not current PR evidence", async () => {
  const f = setup({ [`repos/example/project/commits/${sha}/status`]: { sha: "d".repeat(40), total_count: 0, statuses: [] } });
  expect((await collect(loadSettings(f.root), { reader: f.reader })).repositories[0].pulls[0].evidence.status).toBe("incomplete");
});
