import { afterEach, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { collect, type Reader, type ReadRequest } from "../../../plugins/vh-adlc/scripts/triage/collect";
import { parsePage } from "../../../plugins/vh-adlc/scripts/triage/github";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/triage/settings";
import { fixture, git } from "./fixtures";

const roots: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of roots.splice(0)) f.dispose(); });
function project() { const f = fixture(); roots.push(f); return f; }
function issue(number: number, state = "open") {
  return { number, title: `Work ${number}`, body: `Scope ${number}`, state, user: { login: "owner" },
    labels: [], milestone: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
}
function pages(data: Record<string, unknown[]>) {
  const calls: { request: ReadRequest; page: number }[] = [];
  const reader: Reader = { async page(request, page) {
    calls.push({ request, page });
    const key = request.kind === "comments" ? `comments:${request.issue}` : request.kind;
    const items = data[key] ?? [], start = (page - 1) * 100;
    return { items: items.slice(start, start + 100), next: start + 100 < items.length ? page + 1 : null };
  } };
  return { reader, calls };
}

test("every page is collected beyond the legacy issue/PR/comment limits", async () => {
  const f = project(), open = Array.from({ length: 201 }, (_, i) => issue(i + 1));
  const closed = Array.from({ length: 101 }, (_, i) => issue(i + 202, "closed"));
  const pulls = Array.from({ length: 301 }, (_, i) => ({ number: i + 500, title: "Partial", body: "Refs #1", merged_at: "2026-01-01T00:00:00Z" }));
  const comments = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, body: `Owner status ${i}`, user: { login: "owner" }, created_at: "2026-01-01T00:00:00Z" }));
  const source = pages({ issues: [...open, ...closed, { ...issue(999), pull_request: {} }], pulls, "comments:1": comments });
  const before = git(f.root, "status", "--porcelain");
  const result = await collect(loadSettings(f.root), source.reader, { mode: "sweep" });
  expect(result.issues).toHaveLength(201);
  expect(result.closed_issues).toHaveLength(101);
  expect(result.pulls).toHaveLength(301);
  expect(result.issues[0].comments).toHaveLength(101);
  expect(result.coverage.every((entry) => entry.complete)).toBe(true);
  expect(result.coverage.find((entry) => entry.collection === "issues")?.pages).toBe(4);
  expect(result.coverage.find((entry) => entry.collection === "comments:1")?.pages).toBe(2);
  expect(result.plan_metadata).toBe("not-configured");
  expect(result.source_commit).toBe(git(f.root, "rev-parse", "HEAD"));
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

test("a failed page preserves partial data and explicit sanitized coverage", async () => {
  const f = project(), source = pages({ issues: Array.from({ length: 101 }, (_, i) => issue(i + 1)) });
  const reader: Reader = { async page(request, page) {
    if (request.kind === "issues" && page === 2) throw new Error("secret-value: permission denied");
    return source.reader.page(request, page);
  } };
  const result = await collect(loadSettings(f.root), reader);
  expect(result.issues).toHaveLength(100);
  expect(result.coverage.find((entry) => entry.collection === "issues")?.complete).toBe(false);
  expect(result.coverage.find((entry) => entry.collection === "issues")?.error).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("secret-value");
});

test("malformed pages, repeated page cursors and repeated IDs cannot claim completeness", async () => {
  for (const reader of [
    { async page() { return { items: "not an array", next: null }; } },
    { async page() { return { items: [issue(1)], next: 1 }; } },
    { async page(_request: ReadRequest, page: number) { return { items: [issue(1)], next: page === 1 ? 2 : null }; } },
    { async page() { return { items: [{ number: "invalid" }], next: null }; } },
  ]) {
    const result = await collect(loadSettings(project().root), reader as Reader);
    expect(result.coverage.some((entry) => !entry.complete)).toBe(true);
  }
});

test("a configured page budget is incomplete coverage, never a successful empty inventory", async () => {
  const f = project(); f.settings({ schema_version: 1, page_budget: 1 });
  const source = pages({ issues: Array.from({ length: 101 }, (_, i) => issue(i + 1)) });
  const result = await collect(loadSettings(f.root), source.reader);
  expect(source.calls).toHaveLength(1);
  expect(result.issues).toHaveLength(100);
  expect(result.coverage.some((entry) => !entry.complete && entry.error === "page-budget-exhausted")).toBe(true);
});

test("plan joins use structured metadata and preserve untracked and foreign references", async () => {
  const f = project();
  f.write("plans/local.md", "---\ntracker: https://github.com/example/project/issues/5\nstate: planned\nrank: high\n---\nDetails\n");
  f.write("plans/untracked.md", "---\nstate: planned\n---\n");
  f.write("plans/foreign.md", "---\ntracker: https://github.com/other/project/issues/5\n---\n");
  f.settings({ schema_version: 1, plan_roots: ["plans"], plan_fields: { issue: "tracker", status: "state", priority: "rank" } });
  const result = await collect(loadSettings(f.root), pages({ issues: [issue(5)] }).reader);
  expect(result.plan_metadata).toBe("available");
  expect(result.plans.find((plan) => plan.path === "plans/local.md")?.issue).toBe(5);
  expect(result.plans.find((plan) => plan.path === "plans/local.md")?.priority).toBe("high");
  expect(result.plans.find((plan) => plan.path === "plans/untracked.md")?.issue_ref).toBeNull();
  expect(result.plans.find((plan) => plan.path === "plans/foreign.md")?.issue).toBeNull();
  expect(result.plans.find((plan) => plan.path === "plans/foreign.md")?.issue_ref).toContain("other/project");
});

test("invalid metadata and nested symlink escapes are visible incomplete plan coverage", async () => {
  const f = project(), outside = project();
  f.write("plans/broken.md", "---\nissue: [invalid\n---\n");
  symlinkSync(outside.root, join(f.root, "plans", "external"), "dir");
  f.settings({ schema_version: 1, plan_roots: ["plans"] });
  const result = await collect(loadSettings(f.root), pages({}).reader);
  expect(result.plan_metadata).toBe("incomplete");
  expect(result.coverage.find((entry) => entry.collection === "plans")?.complete).toBe(false);
});

test("targeted mode reads comments only for its declared issues and rejects unknown targets", async () => {
  const f = project(), source = pages({ issues: [issue(1), issue(2)] });
  const result = await collect(loadSettings(f.root), source.reader, { mode: "ids", ids: [2] });
  expect(result.requested_ids).toEqual([2]);
  expect(source.calls.filter((call) => call.request.kind === "comments").map((call) => call.request.issue)).toEqual([2]);
  const missing = await collect(loadSettings(f.root), source.reader, { mode: "ids", ids: [99] });
  expect(missing.coverage.some((entry) => !entry.complete && entry.error === "requested-issue-unavailable")).toBe(true);
});

test("a changing source HEAD invalidates collection instead of producing mixed-source proof", async () => {
  const f = project(), start = git(f.root, "rev-parse", "HEAD");
  let changed = false;
  const reader: Reader = { async page() {
    if (!changed) { changed = true; f.write("src/other.ts", "export const changed = true;\n"); git(f.root, "add", "src/other.ts"); git(f.root, "commit", "-qm", "test: concurrent source"); }
    return { items: [], next: null };
  } };
  const result = await collect(loadSettings(f.root), reader);
  expect(result.source_commit).toBe(start);
  expect(result.coverage.some((entry) => !entry.complete && entry.error === "source-head-changed")).toBe(true);
});

test("the CLI page parser follows validated Link metadata and rejects failed/non-list responses", () => {
  const expected = { hostname: "github.com", endpoint: "repos/example/project/issues?state=all&per_page=100", page: 1 };
  const response = 'HTTP/2.0 200 OK\r\nLink: <https://api.github.com/repos/example/project/issues?state=all&per_page=100&page=2>; rel="next"\r\n\r\n[]';
  expect(parsePage(response, expected)).toEqual({ items: [], next: 2 });
  expect(() => parsePage(response.replace("api.github.com", "other.example"), expected)).toThrow();
  expect(() => parsePage(response.replace("state=all", "state=closed"), expected)).toThrow();
  expect(() => parsePage("HTTP/2.0 403 Forbidden\n\n{}", expected)).toThrow();
  expect(() => parsePage("HTTP/2.0 200 OK\n\n{}", expected)).toThrow();
});
