import { expect, test } from "bun:test";
import { compare } from "../src/compare";
import { site } from "./helpers/site";
const html = (head: string, body = "<h1>Heading</h1>") => `<head>${head}</head><main>${body}</main>`;

test("real technical regressions retain old and new evidence", async () => {
  const before = await site([{ path: "/", html: html('<title>Before</title><meta name="description" content="old"><link rel="canonical" href="/">') }]);
  const after = await site([{ path: "/", html: html('<meta name="robots" content="noindex"><link rel="canonical" href="/other">', "Text") }]);
  const report = compare(before.snapshot, after.snapshot);
  for (const rule of ["title_removed", "h1_removed", "noindex_added", "canonical_changed"]) expect(report.findings.some(f => f.rule === rule)).toBe(true);
  expect(report.findings.find(f => f.rule === "title_removed")?.values).toMatchObject({ old: ["Before"], new: [] });
  expect(report.findings.find(f => f.rule === "title_removed")?.evidence).toHaveLength(2);
});
test("captured errors are regressions; missing evidence and inventory changes are not", async () => {
  const before = await site([{ path: "/" }, { path: "/removed" }]);
  const failed = await site([{ path: "/", outcome: "failed" }, { path: "/added" }]);
  const unknown = compare(before.snapshot, failed.snapshot);
  expect(unknown.analysis_status).toBe("partial"); expect(unknown.findings.some(f => f.rule === "http_regression")).toBe(false);
  expect(unknown.findings.map(f => f.rule)).toEqual(expect.arrayContaining(["page_added", "page_missing", "comparison_unavailable"]));
  const bad = await site([{ path: "/", status: 404 }]);
  expect(compare(before.snapshot, bad.snapshot).findings.some(f => f.rule === "http_regression")).toBe(true);
  expect(compare(before.snapshot, bad.snapshot).findings.some(f => f.rule === "title_removed")).toBe(false);
});
test("equivalent generic directives and canonical sources cannot become regressions", async () => {
  const before = await site([{ path: "/", html: html('<title>Same</title><meta name="robots" content="none"><link rel="canonical" href="/">') }]);
  const after = await site([{ path: "/", html: html('<title>Same</title>'), headers: { "X-Robots-Tag": ["NOINDEX"], Link: ['</>; rel="canonical"'] } }]);
  const r = compare(before.snapshot, after.snapshot);
  expect(r.findings.some(f => ["noindex_added", "canonical_changed", "canonical_removed"].includes(f.rule))).toBe(false);
  const generic = await site([{ path: "/", headers: { "X-Robots-Tag": ["noindex"] } }]);
  const scoped = await site([{ path: "/", headers: { "X-Robots-Tag": ["googlebot: noindex"] } }]);
  expect(compare(scoped.snapshot, generic.snapshot).findings.some(f => f.rule === "noindex_added")).toBe(true);
  expect(compare(scoped.snapshot, scoped.snapshot).findings).toHaveLength(0);
});
test("ambiguous canonicals and final conflicts stay unavailable", async () => {
  const before = await site([{ path: "/", html: html('<link rel="canonical" href="/">') }]);
  const after = await site([{ path: "/", html: html('<link rel="canonical" href="/">'), headers: { Link: ['</other>; rel="canonical"'] } }]);
  const r = compare(before.snapshot, after.snapshot);
  expect(r.findings.some(f => f.rule === "canonical_changed")).toBe(false);
  expect(r.findings.some(f => f.rule === "comparison_unavailable")).toBe(true);
  const conflict = await site([{ path: "/", final: "/same" }, { path: "/alias", final: "/same", html: "<main>Other</main>" }]);
  const c = compare(before.snapshot, conflict.snapshot);
  expect(c.analysis_status).toBe("partial"); expect(c.findings.some(f => f.rule === "title_removed")).toBe(false);
});
test("incompatible extraction and origin scopes fail; capture modes do not rematch", async () => {
  const f = await site([{ path: "/" }]);
  for (const change of [{ schema_version: 2 }, { extraction_version: "2" }, { origins: ["https://other.test"] }, { extraction: { main_selector: "article" } }]) {
    expect(() => compare(f.snapshot, { ...f.snapshot, ...change })).toThrow(/incompatible/i);
  }
  const rendered = await site([{ path: "/", mode: "rendered" }]);
  const r = compare(f.snapshot, rendered.snapshot);
  expect(r.findings.map(f => f.rule)).toEqual(["page_added", "page_missing"]);
});
test("final URL changes and JSON-LD changes remain observations", async () => {
  const a = await site([{ path: "/", html: html('<script type="application/ld+json">{"@type":"Article"}</script>') }]);
  const b = await site([{ path: "/", final: "/new", html: html("") }]);
  const r = compare(a.snapshot, b.snapshot);
  expect(r.findings.map(f => f.rule)).toEqual(expect.arrayContaining(["final_url_changed", "jsonld_changed"]));
});
