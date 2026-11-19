import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const plugin = resolve(root, "plugins/vh-adlc");
const skillPath = "skills/vh-adlc-docs-truth/SKILL.md";

test("both marketplace catalogs expose the same harness-neutral docs truth skill", () => {
  const codexCatalog = JSON.parse(readFileSync(resolve(root, ".agents/plugins/marketplace.json"), "utf8"));
  const claudeCatalog = JSON.parse(readFileSync(resolve(root, ".claude-plugin/marketplace.json"), "utf8"));
  const codexPackage = codexCatalog.plugins.find((entry: { name: string }) => entry.name === "vh-adlc");
  const claudePackage = claudeCatalog.plugins.find((entry: { name: string }) => entry.name === "vh-adlc");

  expect(resolve(root, codexPackage.source.path)).toBe(plugin);
  expect(resolve(root, claudePackage.source)).toBe(plugin);

  const skill = readFileSync(resolve(plugin, skillPath), "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  expect(frontmatter).not.toBeNull();
  expect(Bun.YAML.parse(frontmatter![1])).toEqual({
    name: "vh-adlc-docs-truth",
    description: expect.any(String),
  });
  expect(skill).toContain("references/docs-truth.md");
  expect(readFileSync(resolve(plugin, "references/docs-truth.md"), "utf8")).toContain("`sweep <path>...`");
});

test("explicit claim review routes to docs truth alongside the existing documentation routes", () => {
  const lifecycle = readFileSync(resolve(plugin, "references/lifecycle.md"), "utf8");
  expect(lifecycle).toMatch(/\| Rolling factual documentation review \|[^\n]*skills\/vh-adlc-docs-truth\/SKILL.md/);
  expect(lifecycle).toMatch(/\| Review documentation affected by a code change \|[^\n]*skills\/vh-adlc-docs-impact\/SKILL.md/);
  expect(lifecycle).toMatch(/\| Whole-corpus documentation drift[^\n]*skills\/vh-adlc-docs-drift\/SKILL.md/);
});

test("generic discovery exposes the ambiguity guard before the lifecycle reference is loaded", () => {
  const skill = readFileSync(resolve(plugin, "skills/vh-adlc/SKILL.md"), "utf8");
  const header = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  expect(header).not.toBeNull();
  const metadata = Bun.YAML.parse(header![1]) as { description: string };
  expect(metadata.description).toMatch(/ambiguous documentation audit.+before opening candidate documents/i);
  expect(skill.indexOf("before opening candidate documents")).toBeLessThan(skill.indexOf("../../references/lifecycle.md"));
});
