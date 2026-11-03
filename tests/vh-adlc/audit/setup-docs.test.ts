import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { blockYAML } from "../settings-yaml";
import { fixture } from "./fixtures";
const root = resolve(import.meta.dir, "../../.."), plugin = resolve(root, "plugins/vh-adlc");
const made: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of made.splice(0)) f.dispose(); });

test("the audit reference gives a complete commented block YAML setup that loads", () => {
  const text = readFileSync(resolve(plugin, "references/audit-settings.md"), "utf8");
  expect(text).toContain(".vh-adlc/audit.yaml"); expect(text).not.toContain(".vh-adlc/audit.json");
  const examples = [...text.matchAll(/^```yaml\n([\s\S]*?)^```$/gm)]; expect(examples).toHaveLength(1);
  const bytes = blockYAML(examples[0][1]); expect(() => JSON.parse(bytes)).toThrow();
  const f = fixture(); made.push(f); f.write(".vh-adlc/audit.yaml", bytes);
  expect(loadSettings(f.root).knowledge_pages).toContain("conventions/typescript.md");
  for (const term of ["verified", "--offline", "knowledge_pages", "settings-reader-unavailable", "settings-reader-refused"]) expect(text).toContain(term);
});
test("the standalone YAML example declares the same applicable language page", () => {
  const bytes = readFileSync(resolve(plugin, "examples/audit/basic/.vh-adlc/audit.yaml"), "utf8"); blockYAML(bytes);
  expect(() => JSON.parse(bytes)).toThrow();
  const f = fixture(); made.push(f); f.write(".vh-adlc/audit.yaml", bytes);
  expect(loadSettings(f.root).knowledge_pages).toContain("conventions/typescript.md");
});
test("the public workflow uses YAML and the new audit plugin release", () => {
  const text = readFileSync(resolve(root, "docs/user-guides/workflows.md"), "utf8").split("## Persistent codebase audit")[1];
  expect(text).toBeDefined(); expect(text).toContain(".vh-adlc/audit.yaml"); expect(text).not.toContain(".vh-adlc/audit.json");
  expect(text).toContain("0.8.0+"); expect(text).toContain("offline");
});

test.each(["compatibility", "marketplace"])("the %s audit guidance names the YAML settings and audit minimum", name => {
  const document = readFileSync(resolve(root, "docs/reference/" + name + ".md"), "utf8");
  const heading = name === "compatibility" ? "## Persistent codebase audit" : "## Persistent audit";
  const section = document.split(heading)[1]?.split(/^## /m)[0];
  expect(section).toBeDefined();
  expect(section).toContain(".vh-adlc/audit.yaml");
  expect(section).toContain("0.8.0");
  expect(section).not.toContain(".vh-adlc/audit.json");
  expect(section).not.toMatch(/(?:requires|minimum|included from|packaged in)\s+(?:plugin\s+)?0\.7\.0/i);
});
