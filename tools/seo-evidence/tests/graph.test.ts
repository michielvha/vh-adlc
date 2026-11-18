import { expect, test } from "bun:test";
import { analyzeGraph } from "../src/graph";
import { site } from "./helpers/site";
import { origin } from "./helpers/bundle";

test("graph distinguishes observed errors, unobserved links, fragments and isolated pages", async () => {
  const f = await site([
    { path: "/", html: '<main><a href="/guide#ok">Guide</a><a href="/missing">Bad</a><a href="/unseen">Unknown</a><a href="#">Top</a></main>' },
    { path: "/guide", html: '<main><h1 id="ok">Guide</h1><a href="/guide#bad">Missing fragment</a></main>' },
    { path: "/missing", status: 404 }, { path: "/isolated" },
  ], { sitemap: ["/isolated"] });
  const g = analyzeGraph(f.snapshot);
  expect(g.nodes.find(n => n.url === origin + "/guide")?.depth).toBe(1);
  expect(g.nodes.find(n => n.url === origin + "/guide")?.incoming).toBe(1);
  expect(g.findings.filter(f => f.rule === "broken_link").map(f => f.url)).toEqual([origin + "/"]);
  expect(g.links.find(l => l.href === "/unseen")?.status).toBe("unobserved");
  expect(g.links.find(l => l.href === "#")?.fragment_status).toBe("valid");
  expect(g.findings.filter(f => f.rule === "broken_fragment")).toHaveLength(1);
  expect(g.findings.find(f => f.rule === "unreachable")?.url).toBe(origin + "/isolated");
});
test("redirected roots reach final documents without inventing intermediate hops", async () => {
  const f = await site([
    { path: "/old", final: "/new", html: '<main><a href="/child">Child</a></main>' },
    { path: "/child" },
  ], { roots: ["/old"] });
  const g = analyzeGraph(f.snapshot);
  expect(g.edges.find(e => e.kind === "final_transition")).toMatchObject({ from: origin + "/old", to: origin + "/new", weight: 0, hop_count: null });
  expect(g.edges.find(e => e.kind === "anchor")).toMatchObject({ from: origin + "/new", to: origin + "/child", weight: 1 });
  expect(g.nodes.find(n => n.url === origin + "/child")?.depth).toBe(1);
  expect(g.findings.some(f => f.rule === "unreachable")).toBe(false);
});
test("agreeing final captures retain evidence; conflicting ones suppress onward facts", async () => {
  const html = '<main><h1 id="ok">Same</h1><a href="/child">Child</a></main>';
  const a = await site([{ path: "/a", final: "/final", html }, { path: "/b", final: "/final", html }, { path: "/child" }]);
  const agreeing = analyzeGraph(a.snapshot).nodes.find(n => n.url === origin + "/final");
  expect(agreeing?.observations).toHaveLength(2); expect(agreeing?.conflicting).toBe(false);
  const b = await site([{ path: "/a", final: "/final", html }, { path: "/b", final: "/final", html: "<main>Different</main>" }, { path: "/child" }]);
  const g = analyzeGraph(b.snapshot);
  expect(b.snapshot.analysis_status).toBe("partial");
  expect(g.nodes.find(n => n.url === origin + "/final")?.conflicting).toBe(true);
  expect(g.edges.some(e => e.kind === "anchor" && e.from === origin + "/final")).toBe(false);
  expect(g.findings.some(f => f.rule === "final_conflict")).toBe(true);
});
test("recorded hops and capture modes remain separate", async () => {
  const f = await site([
    { path: "/old", final: "/new", redirects: [{ from: origin + "/old", to: origin + "/middle", status: 301 }, { from: origin + "/middle", to: origin + "/new", status: 302 }], html: '<main><a href="/child#ok">Child</a></main>' },
    { path: "/child", html: '<main><h1 id="ok">Here</h1></main>' },
    { path: "/new", mode: "rendered", html: '<main><a href="/unknown">Different</a></main>' },
  ], { roots: ["/old", "/new"] });
  const g = analyzeGraph(f.snapshot);
  expect(g.edges.filter(e => e.kind === "redirect")).toHaveLength(2);
  expect(g.nodes.find(n => n.url === origin + "/child" && n.mode === "initial")?.depth).toBe(1);
  expect(g.links.find(l => l.href === "/child#ok")?.fragment_status).toBe("valid");
  expect(g.links.find(l => l.href === "/unknown")?.status).toBe("unobserved");
});
