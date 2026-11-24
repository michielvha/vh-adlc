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
    expect(ship).toMatch(/internal-only/i);
    expect(ship).toMatch(/Do not.*draft|Never.*draft/);
    expect(ship).toMatch(/PR.*release|release.*PR/);
  });
});

const raw = (path: string) => readFileSync(join(root, path), "utf8");
const fold = (text: string) => text.replace(/\s+/g, " ").trim();
const paragraphs = (path: string) => raw(path).split(/\n\s*\n/).map(fold).filter(Boolean);
const paragraphWith = (path: string, needle: string) => paragraphs(path).filter((p) => p.includes(needle));

const REF = "plugins/vh-adlc/references/blog.md";
const EDITOR = "plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md";
const SKILL = "plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md";
const GUIDE = "docs/user-guides/workflows.md";

const LABELS = [
  "no body treatment",
  "unbroken prose",
  "invalid exception",
  "irrelevant image",
  "filler image",
  "illustration as UI",
  "illegible image",
  "missing alt text",
  "missing caption",
  "unsupported visual",
  "inexact quote",
  "unattributed quote",
  "repeated quote",
  "unverified image",
  "unverified render",
  "other",
];

const EXAMPLE_LINE =
  "Presentation repairs: irrelevant image: the photo shows a parked car, but the caption calls it the login screen; replace it with the screen the notes describe; no body treatment: the only image follows the last paragraph";

describe("visual reading pass contract", () => {
  test("references/blog.md lists the five presentation inputs, and the skill and editor only name the list", () => {
    const text = raw(REF);
    const section = text.split(/^#+ Presentation inputs\s*$/m)[1];
    expect(section).toBeDefined();
    const items = (section ?? "").split(/\n#/)[0].split("\n").filter((l) => /^\s*[-*] /.test(l)).map(fold);
    expect(items).toHaveLength(5);
    for (const item of ["placement and the point it serves", "file path, description and provenance", "quote sources", "quote inventory of the current batch or related articles", "rendered evidence for each viewport and supported theme"]) {
      expect(items.some((i) => i.includes(item))).toBe(true);
    }
    for (const path of [SKILL, EDITOR]) {
      const spans = paragraphWith(path, "Presentation inputs");
      expect(spans).toHaveLength(1);
      expect(spans[0]).not.toMatch(/placement|file path|asset path|provenance|quote source|quote inventory|rendered evidence/i);
    }
  });

  test("references/blog.md states the reading pass, revision, integrity, dispatch and handoff rules", () => {
    const ref = fold(raw(REF));
    expect(ref).toContain("reader's job");
    expect(ref).toContain("every adjacent tool");
    expect(ref).toContain("exclusive market claim");
    expect(ref).toMatch(/wording changes and treatment changes runs as a wording-only revision followed by a presentation revision/);
    expect(ref).toContain("A revision request that names no treatment change is a wording-only revision");
    expect(ref).toMatch(/without parent history/);
    expect(ref).toMatch(/`fork_turns` set to `none`/);
    expect(ref).toMatch(/read `agents\/vh-adlc-blog-editor\.agent\.md` from the installed package/);
    expect(ref).toContain("800 words");
    expect(ref).toContain("`No-visual exception: <category>: <explanation>`");
    expect(ref).toContain("`Rendered checks: <entries>`");
    expect(ref).toContain("`Rendered checks: unverified, <reason>`");
    for (const category of ["`short-read`", "`format`", "`owner-request`"]) expect(ref).toContain(category);

    const permission = paragraphs(REF).filter((p) =>
      ["image file", "data:", "<svg>", "<canvas>", "diagram code block", "permission", "draw nothing"].every((t) => p.includes(t)),
    );
    expect(permission.length).toBeGreaterThan(0);
    expect(permission.some((p) => p.split(/(?<=\.)\s/).some((s) => /edit\w*[^.]{0,60}diagram code block|diagram code block[^.]{0,60}edit/i.test(s)))).toBe(true);

    expect(paragraphs(REF).some((p) => ["image reference", "project file", "remote URL", "missing"].every((t) => p.includes(t)))).toBe(true);
    expect(paragraphs(REF).some((p) => p.includes("draw nothing") && p.includes("pull-quote rule") && p.includes("adds no claim the notes do not support"))).toBe(true);
    expect(paragraphs(REF).some((p) => p.includes("no permitted treatment") && p.includes("presentation gap") && /never adds? filler/.test(p))).toBe(true);
    expect(paragraphs(REF).some((p) => ["treatments placed", "no-visual exceptions", "presentation gaps", "rendered checks"].every((t) => p.includes(t)))).toBe(true);
    expect(ref.toLowerCase()).not.toContain("original editorial artwork");
    expect(ref.toLowerCase()).not.toContain("original artwork");
  });

  test("the editor names every flag and label, the precedence rule, the example line and the four-line return", () => {
    const editor = fold(raw(EDITOR));
    for (const flag of [
      "without a treatment inside the body",
      "sustained prose runs left without a break",
      "invalid no-visual exceptions",
      "visible content does not match their passage, caption or description",
      "illustrations presented as product UI",
      "illegible image text and missing alt text or captions",
      "show screens or data the notes do not support",
      "inexact or unattributed quotes",
      "repeat a point from the batch or related articles",
    ]) {
      expect(editor).toContain(flag);
    }
    for (const label of LABELS) expect(editor).toContain(`\`${label}\``);
    expect(editor).toMatch(/contradicts its caption or description is labelled `irrelevant image`, even when it is also a chart the notes do not support/);
    expect(editor).toMatch(/Each `Presentation repairs` entry starts with one of these labels and a colon/);
    expect(editor).toContain(`\`${EXAMPLE_LINE}\``);
    for (const line of ["Verdict: Pass | Needs revision", "Copy repairs:", "Presentation repairs:", "Exceptions:"]) expect(editor).toContain(line);
  });

  test("the editor states the unviewable-image fallback", () => {
    const editor = fold(raw(EDITOR));
    expect(editor).toMatch(/cannot show it an image's content/);
    expect(editor).toMatch(/`unverified image`/);
    expect(editor).toMatch(/never judges? it from the caption/);
  });

  test("the editor description and skill entry describe a prose and presentation editor with the rendering fallback", () => {
    const description = raw(EDITOR).match(/^description: (.*)$/m)?.[1] ?? "";
    expect(description).toContain("prose and presentation");
    const skill = fold(raw(SKILL));
    expect(skill).toContain("prose and presentation");
    expect(skill).not.toContain("independent prose pass");
    expect(skill).not.toContain("reviews prose, not gates");
    expect(skill).toMatch(/desktop and phone in each theme the site supports/);
    expect(skill).toMatch(/`Rendered checks: unverified, <reason>`/);
    expect(skill).toMatch(/Markdown-only inspection is never called a rendered review/);
  });

  test("the user guide states the threshold, the quote rule and the plain-revision rule", () => {
    const guide = fold(raw(GUIDE));
    expect(guide).toContain("800 words");
    expect(guide).toMatch(/pull quotes must differ from those in the current batch or related articles/i);
    expect(guide).toMatch(/plain revision changes no treatment and only reports presentation gaps/);
    expect(guide).toMatch(/adding visuals to an existing article needs an explicit request/i);
  });

  test("each file uses the Terminology terms", () => {
    const terms: Record<string, string[]> = {
      [REF]: ["visual reading pass", "long-form article", "treatment", "no-visual exception", "Rendered checks", "presentation revision", "wording-only revision", "review-only run", "presentation gap", "Presentation inputs", "Presentation repairs"],
      [EDITOR]: ["long-form article", "treatment", "no-visual exception", "Presentation inputs", "Presentation repairs"],
      [SKILL]: ["visual reading pass", "Presentation inputs", "Rendered checks"],
      [GUIDE]: ["visual reading pass", "long-form article", "treatment", "presentation gap"],
    };
    for (const [path, list] of Object.entries(terms)) {
      const text = fold(raw(path)).toLowerCase();
      for (const term of list) expect(`${path}: ${text.includes(term.toLowerCase())}`).toBe(`${path}: true`);
    }
  });

  test("blog-authoring's Context points to this document and names the two replaced rules", () => {
    const context = fold(raw("docs/specs/blog-authoring.md").split(/^## Context\s*$/m)[1]?.split(/^## /m)[0] ?? "");
    expect(context).toContain("docs/specs/blog-visual-reading.md");
    expect(context).toContain("add visuals only when they solve an explanation problem");
    expect(context).toMatch(/three-line|`Presentation repairs`/);
  });
});
