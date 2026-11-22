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

  test("discovers standalone product drafts from the skill description and generic intake", () => {
    const entry = read("skills/vh-adlc-blog/SKILL.md");
    expect(entry).toMatch(/description:.*public-facing product copy.*community replies/);
    const intake = read("references/lifecycle.md");
    expect(intake).toMatch(/public-facing product copy.*skills\/vh-adlc-blog\/SKILL\.md/);
    expect(read("references/blog.md")).toContain("For standalone product copy, prepare only the requested drafts");
  });

  test("requires reader rehearsal for public drafting and changed directions before handoff", () => {
    const workflow = read("references/blog.md");
    const rehearsal = workflow.split("## Rehearse reader actions")[1]?.split("## ")[0];
    expect(rehearsal).toBeDefined();
    expect(rehearsal).toContain("new public-facing copy and whenever an edit changes a reader action");
    expect(rehearsal).toContain("start with the draft as the reader receives it");
    expect(rehearsal).toContain("Stop before submission");
    expect(rehearsal).toContain("works");
    expect(rehearsal).toContain("needs a fix");
    expect(rehearsal).toContain("not verified");
    expect(rehearsal).toContain("publication-ready");
  });

  test("shipping only suggests explicit promotion for public-facing work", () => {
    const ship = read("skills/vh-adlc-ship/SKILL.md");
    expect(ship).toContain("vh-adlc-blog promote");
    expect(ship).toMatch(/internal-only/i);
    expect(ship).toMatch(/Do not.*draft|Never.*draft/);
    expect(ship).toMatch(/PR.*release|release.*PR/);
  });
});
