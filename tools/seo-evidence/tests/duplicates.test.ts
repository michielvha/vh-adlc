import { expect, test } from "bun:test";
import { inspect } from "../src/inspect";
import { site } from "./helpers/site";
import { origin } from "./helpers/bundle";

test("duplicate groups use observed final pages and language/mode partitions", async () => {
  const html = (title: string, body: string, lang = "en") => `<html lang="${lang}"><head><title>${title}</title><meta name="description" content="Shared description"></head><body><nav>Same shell</nav><main>${body}</main></body></html>`;
  const f = await site([
    { path: "/a", html: html("Shared title", "Distinct A") },
    { path: "/b", html: html("Shared title", "Distinct B") },
    { path: "/c", html: html("C", "Repeated main") },
    { path: "/d", html: html("D", "Repeated main") },
    { path: "/fr", html: html("Shared title", "Repeated main", "fr") },
    { path: "/a", mode: "rendered", html: html("Shared title", "Distinct A") },
    { path: "/alias", final: "/a", html: html("Shared title", "Distinct A") },
  ]);
  const report = inspect(f.snapshot);
  const titles = report.findings.filter(f => f.rule === "duplicate_title");
  expect(titles).toHaveLength(1);
  expect(titles[0]?.values).toMatchObject({ urls: [origin + "/a", origin + "/b"] });
  const main = report.findings.filter(f => f.rule === "duplicate_main");
  expect(main).toHaveLength(1);
  expect(main[0]?.values).toMatchObject({ urls: [origin + "/c", origin + "/d"] });
  expect(main[0]?.evidence.length).toBe(2);
});
test("missing roots and uncaptured group members remain unavailable", async () => {
  const f = await site([
    { path: "/", html: "<nav>Shell</nav><main>Unique body</main>" },
    { path: "/missing", html: "<nav>Shell</nav>" },
    { path: "/multiple", html: "<main>A</main><main>B</main>" },
    { path: "/later", outcome: "not_collected" },
    { path: "/failed", outcome: "failed" },
  ], { groups: { docs: ["/", "/later", "/failed"] } });
  const report = inspect(f.snapshot);
  expect(report.analysis_status).toBe("partial");
  expect(report.coverage.groups.docs).toMatchObject({ declared: 3, captured: 1, failed: 1, not_collected: 1 });
  expect(report.findings.filter(f => f.rule === "main_unavailable")).toHaveLength(2);
  expect(report.findings.filter(f => f.rule === "duplicate_main")).toHaveLength(0);
  expect(report.coverage.declared).toBe(5);
});
test("shared navigation alone cannot create a duplicate main-content group", async () => {
  const f = await site([{ path: "/", html: "<nav>Shell</nav><article>A</article>" }, { path: "/other", html: "<nav>Shell</nav><article>B</article>" }], { selector: "article" });
  expect(inspect(f.snapshot).findings.some(f => f.rule === "duplicate_main")).toBe(false);
});
