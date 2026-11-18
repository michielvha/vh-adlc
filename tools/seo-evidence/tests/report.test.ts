import { expect, test } from "bun:test";
import { applyPolicy } from "../src/policy";
import { renderFiles, renderStatus } from "../src/report";
import { inspect } from "../src/inspect";
import { site } from "./helpers/site";

test("analytical bytes and finding identities are stable", async () => {
  const f = await site([{ path: "/", html: '<main><a href="/bad">bad</a></main>' }, { path: "/bad", status: 404 }]);
  const r = applyPolicy(inspect(f.snapshot));
  expect(renderFiles(r)).toEqual(renderFiles(applyPolicy(inspect(f.snapshot))));
  const files = renderFiles(r);
  expect(JSON.parse(files["findings.json"] ?? "{}").findings).toHaveLength(1);
  expect(files["report.md"]).toContain("observed");
});
test("CSV and Markdown keep hostile source text as data", async () => {
  const f = await site([{ path: "/", html: '<head><title>=SUM(1,2)\n# injected</title></head><main>Body</main>' }, { path: "/other", html: '<head><title>=SUM(1,2)\n# injected</title></head><main>Other</main>' }]);
  const r = applyPolicy(inspect(f.snapshot));
  const first = r.findings[0]; if (!first) throw new Error("Expected a duplicate finding");
  r.findings[0] = { ...first, detail: '=cmd\n# forged <script>alert(1)</script> | "quote"' };
  const files = renderFiles(r);
  expect(files["findings.csv"]).toContain("'=cmd");
  expect(files["report.md"]).not.toContain("\n# forged");
  expect(files["report.md"]).not.toContain("<script>");
  expect(JSON.parse(files["findings.json"] ?? "{}").findings[0].detail).toContain("<script>");
});
test("terminal modes remain labelled and machine output stays undecorated", () => {
  const base = { exit_code: 0, analysis_status: "complete", policy_status: "report_only" } as const;
  expect(renderStatus(base, { tty: true, ascii: false })).toContain("✓ Passed");
  expect(renderStatus(base, { tty: false, ascii: false })).toContain("OK Passed");
  expect(renderStatus({ ...base, exit_code: 2, analysis_status: "partial" }, { tty: true, ascii: true })).toContain("FAIL");
  for (const noColor of [undefined, "", "0"]) expect(renderStatus(base, { tty: false, ascii: false, noColor })).not.toMatch(/\x1b/);
  expect(renderStatus({ ...base, exit_code: 3, policy_status: "failed" }, { tty: true, ascii: false })).toContain("✗ Failed");
});
test("rendered source punctuation remains literal rather than creating links or images", async () => {
  const url = "https://example.test/![click](https://outside.test/tracker)";
  const f = await site([{ path: "/" }]); const r = applyPolicy(inspect(f.snapshot));
  const payload = '![click](https://outside.test/tracker) [label](https://outside.test/link) \\ *emphasis* # heading';
  r.findings = [{ id: "test", rule: "source", url, mode: "initial", detail: payload, evidence: [], values: {} }];
  r.partial_reasons = [payload];
  const rendered = Bun.markdown.html(renderFiles(r)["report.md"] ?? "");
  expect(rendered).not.toMatch(/<(?:img|a|em)\b/);
  expect(rendered).toContain(url);
  expect(rendered).toContain("![click](https://outside.test/tracker)");
  expect(rendered).toContain("*emphasis*");
});
