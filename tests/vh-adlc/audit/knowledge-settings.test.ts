import { afterEach, expect, test } from "bun:test";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { baseSettings, fixture } from "./fixtures";

const required = ["conventions/feature-documents.md", "conventions/coding.md", "conventions/documentation.md", "conventions/delivery.md", "guides/humanize-prose.md"];
const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function config(value: unknown) { const f = fixture(); projects.push(f); f.settings(baseSettings({ knowledge_pages: value })); return () => loadSettings(f.root); }

test("audit settings always expose the ordered mandatory page set", () => {
  const f = fixture(); projects.push(f);
  expect(loadSettings(f.root).knowledge_pages).toEqual(required);
});
test("declared language pages follow the fixed pages in declared order", () => {
  expect(config(["conventions/go.md", "conventions/typescript.md", "conventions/react.md"])().knowledge_pages)
    .toEqual([...required, "conventions/go.md", "conventions/typescript.md", "conventions/react.md"]);
});
test.each([null, "conventions/go.md", ["conventions/go.md", "conventions/go.md"], [required[0]], ["/conventions/go.md"],
  ["../go.md"], ["conventions/../go.md"], ["https://example.test/go.md"], ["conventions/go.txt"], ["conventions\\go.md"],
  ["conventions//go.md"], ["./go.md"], ["conventions/.git/go.md"], ["conventions/go.md#section"], ["conventions/GO.MD"], [""]])("unsafe or duplicate knowledge pages fail: %j", value => {
  expect(config(value)).toThrow("knowledge_pages");
});

test("explicit setup checks local page obligations against the exact entry list", async () => {
  const settings = await import("../../../plugins/vh-adlc/scripts/audit/settings");
  const c = config(["conventions/typescript.md"])();
  expect(settings.requireKnowledgePages(c, ["conventions/typescript.md"])).toEqual(c.knowledge_pages);
  expect(() => settings.requireKnowledgePages(c, ["conventions/go.md"])).toThrow("setup/config mismatch");
});
