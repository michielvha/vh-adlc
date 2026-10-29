import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const pkg = join(root, "plugins/vh-adlc");
const read = (path: string) => readFileSync(join(pkg, path), "utf8").replace(/\s+/g, " ");

describe("shared article and promotion contract", () => {
  test("packages one content operation and its independent editor", () => {
    expect(existsSync(join(pkg, "skills/vh-adlc-blog/SKILL.md"))).toBe(true);
    expect(existsSync(join(pkg, "agents/vh-adlc-blog-editor.agent.md"))).toBe(true);
    const entry = read("skills/vh-adlc-blog/SKILL.md");
    expect(entry).toContain("name: vh-adlc-blog");
    expect(entry).toContain("references/blog.md");
    expect(entry).toContain("guides/humanize-prose.md");
    expect(entry).not.toMatch(/vh-adlc gate|vh-adlc find/);
    expect(read("references/blog.md")).not.toMatch(/\/home\/|Michiel|Stackweaver|app\/projects\//);
  });

  test("keeps facts, voice adapters and exact copy separate from publication", () => {
    const workflow = read("references/blog.md");
    for (const term of ["write-like-me", "humanizer", "canonical", "exact wording", "unpublished", "original", "source-position inventory", "independent", "launch draft"]) {
      expect(workflow).toContain(term);
    }
    expect(workflow).toMatch(/each repository|both repositories/);
    expect(workflow).toMatch(/no.*publication|does not authorize.*publish/i);
    expect(workflow).toMatch(/unavailable.*retrieval|retrieval.*unavailable/);
    expect(workflow).toMatch(/unavailable.*independent|independent.*unavailable/);
    expect(workflow).toContain("unverified");
  });

  test("editor can accept unchanged prose and must return exceptions, not a replacement", () => {
    const editor = read("agents/vh-adlc-blog-editor.agent.md");
    expect(editor).toContain("disallowedTools: Edit, Write");
    expect(editor).toMatch(/unchanged.*pass|pass.*unchanged/i);
    expect(editor).toContain("Copy repairs");
    expect(editor).toContain("Exceptions");
    expect(editor).toContain("exact wording");
    expect(editor).toMatch(/not.*replacement article/);
    expect(editor).toMatch(/read.only/i);
  });

  test("generic intake distinguishes content authoring from software implementation", () => {
    const intake = read("references/lifecycle.md");
    expect(intake).toContain("skills/vh-adlc-blog/SKILL.md");
    expect(intake).toContain("implementing a blog");
    expect(intake).toContain("promotion");
  });

  test("shipping only suggests explicit promotion for public-facing work", () => {
    const ship = read("skills/vh-adlc-ship/SKILL.md");
    expect(ship).toContain("vh-adlc-blog promote");
    expect(ship).toContain("internal-only");
    expect(ship).toMatch(/Do not.*draft|Never.*draft/);
    expect(ship).toMatch(/PR.*release|release.*PR/);
  });
});
