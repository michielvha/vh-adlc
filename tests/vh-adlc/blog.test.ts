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

describe("visual reading pass parsers", async () => {
  const visual = await import("./blog/visual.ts");

  test("the Presentation repairs splitter returns labelled entries", () => {
    const first = visual.splitRepairs(
      "irrelevant image: the PNG shows monthly rainfall (mm), but the caption calls it a plan review; replace it; no body treatment: the only image follows the last paragraph",
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.entries.map((e) => e.label)).toEqual(["irrelevant image", "no body treatment"]);
    expect(first.entries[0].text).toContain("; replace it");

    const marked = visual.splitRepairs("`Irrelevant image`: the chart is off topic; **No body treatment:** add one");
    expect(marked.ok && marked.entries.map((e) => e.label)).toEqual(["irrelevant image", "no body treatment"]);

    const none = visual.splitRepairs("None.");
    expect(none.ok && none.entries).toEqual([]);

    expect(visual.splitRepairs("the image is off topic; irrelevant image: replace it").ok).toBe(false);
    expect(visual.repairsLine("Verdict: Pass\nCopy repairs: None\nPresentation repairs: None.\nExceptions: None")).toBe("None.");
  });

  test("the No-visual exception line takes only the three categories", () => {
    for (const line of ["No-visual exception: short-read: the piece reads in one sitting.", "- No-visual exception: owner-request: the owner asked for text only."]) {
      const found = visual.fixedLine(line, "No-visual exception");
      expect(found.ok).toBe(true);
      expect(found.ok && visual.noVisualCategory(found.value)).not.toBeNull();
    }
    for (const line of ["No-visual exception: no-assets: no picture was supplied.", "No-visual exception: short-read", "No-visual exception: the piece is short."]) {
      const found = visual.fixedLine(line, "No-visual exception");
      expect(found.ok && visual.noVisualCategory(found.value)).toBeFalsy();
    }
    expect(visual.fixedLine("No-visual exception: short-read: a\nNo-visual exception: format: b", "No-visual exception").ok).toBe(false);
    expect(visual.fixedLine("nothing here", "No-visual exception").ok).toBe(false);
  });

  test("the Rendered checks parser accepts the unverified and entries forms only", () => {
    const parse = (line: string) => {
      const found = visual.fixedLine(line, "Rendered checks");
      return found.ok ? visual.parseRenderedChecks(found.value) : { kind: "invalid" as const };
    };
    expect(parse("Rendered checks: unverified, no renderer was available").kind).toBe("unverified");
    const four = parse("- Rendered checks: desktop light: pass; desktop dark: pass; phone light: pass; phone dark: code block overflows");
    expect(four.kind).toBe("entries");
    expect(four.kind === "entries" && four.entries).toHaveLength(4);
    for (const line of [
      "Rendered checks: unverified",
      "Rendered checks:",
      "Rendered checks: desktop: pass",
      "Rendered checks: tablet light: pass",
      "Rendered checks: desktop light: pass; phone dark: no overflow; caption clipped",
    ]) {
      expect(`${line} => ${parse(line).kind}`).toBe(`${line} => invalid`);
    }
  });

  test("the coverage check needs a verified entry for every viewport and theme pair", () => {
    const pairs = ["desktop light", "desktop dark", "phone light", "phone dark"];
    const four = visual.parseRenderedChecks("desktop light: pass; desktop dark: pass; phone light: pass; phone dark: code block overflows");
    expect(visual.coversPairs(four, pairs)).toBe(true);
    const two = visual.parseRenderedChecks("desktop light: pass; phone light: pass");
    expect(visual.coversPairs(two, pairs)).toBe(false);
    const unverifiedEntry = visual.parseRenderedChecks("desktop light: pass; desktop dark: pass; phone light: pass; phone dark: unverified, no dark theme");
    expect(visual.coversPairs(unverifiedEntry, pairs)).toBe(false);
  });
});

describe("visual reading article checks", async () => {
  const visual = await import("./blog/visual.ts");
  const figure = (src: string, alt = "A screen", caption = "The plan screen") =>
    `<figure>\n<img src="${src}" alt="${alt}">\n<figcaption>${caption}</figcaption>\n</figure>`;
  const quote = (text: string, cite = "Fixture writer") => `<blockquote class="pull-quote">\n<p>${text}</p>\n<cite>${cite}</cite>\n</blockquote>`;
  const article = [
    "---", "status: draft", "author: Fixture writer", "---", "",
    "# Title", "", "First paragraph has five words.", "", figure("asset-1.png"), "",
    "Second paragraph here.", "", "```sh", "cedar docs --format html", "```", "",
    quote("I keep my notes."), "", "Last words.", "",
  ].join("\n");

  test("body prose excludes front matter, headings, code and treatments", () => {
    expect(visual.bodyWords(article)).toBe(5 + 3 + 2);
    expect(visual.hasBodyTreatment(article)).toBe(true);
    expect(visual.hasBodyTreatment(`# T\n\nOnly prose.\n\n${figure("a.png")}\n`)).toBe(false);
  });

  test("image tokens cover declared sources, srcset and stray paths, and resolve against the public root", () => {
    const text = `${figure("/img/a.PNG?x=1")}\n\n<figure>\n<img src="b.webp" srcset="c.png 2x, https://x.invalid/d.jpg 640w" alt="b">\n<figcaption>b</figcaption>\n</figure>\n\nSee e.svg#top.`;
    const tokens = visual.imageTokens(text);
    for (const t of ["/img/a.PNG", "b.webp", "c.png", "https://x.invalid/d.jpg", "e.svg"]) expect(tokens).toContain(t);
    expect(visual.resolveToken("/img/a.png", "/p/site/article.md", "/p/public")).toBe("/p/public/img/a.png");
    expect(visual.resolveToken("b.png", "/p/site/article.md", "/p/public")).toBe("/p/site/b.png");
    expect(visual.resolveToken("//cdn.invalid/b.png", "/p/article.md", "/p")).toBeNull();
    expect(visual.strayImages(text)).toEqual(["e.svg"]);
    expect(visual.strayImages("![x][ref]\n\n<IMG src=x>").length).toBe(2);
  });

  test("drawing markup is found in every listed form", () => {
    for (const bad of ["data:image/png;base64,AA", "<SVG viewBox='0 0 1 1'>", "<canvas id=c>", '<div class="mermaid">', "```Mermaid\ngraph TD\n```", "~~~d2\na -> b\n~~~"]) {
      expect(`${bad}: ${visual.drawingMarkup(bad).length > 0}`).toBe(`${bad}: true`);
    }
    expect(visual.drawingMarkup("```sh\ndot -V\n```")).toEqual([]);
  });

  test("quotes, figures and undeclared quote markup are read from declared markup", () => {
    expect(visual.pullQuotes(article)).toEqual([{ text: "I keep my notes.", cite: "Fixture writer" }]);
    expect(visual.figures(article)).toEqual([{ sources: ["asset-1.png"], alt: "A screen", caption: "The plan screen" }]);
    expect(visual.addedQuotes(article, `${article}\n${quote("New one.")}\n`).map((q) => q.text)).toEqual(["New one."]);
    expect(visual.quoteFrom({ text: "I keep my notes.", cite: "" }, ["Yes,\nI keep my   notes. Always."])).toBe(true);
    expect(visual.undeclaredQuotes(`${article}\n> quoted\n<q>x</q> <aside>y</aside>\n`)).toBe(3);
  });

  test("the skeleton keeps structure and folds prose runs", () => {
    const reworded = article.replace("First paragraph has five words.", "One.\n\nTwo new paragraphs.").replace("# Title", "# Another title");
    expect(visual.skeleton(reworded)).toBe(visual.skeleton(article));
    expect(visual.skeleton(article.replace("# Title", "## Title"))).not.toBe(visual.skeleton(article));
    expect(visual.skeleton(article.replace("cedar docs", "cedar doc"))).not.toBe(visual.skeleton(article));
    const moved = article.replace(`${figure("asset-1.png")}\n\nSecond paragraph here.`, `Second paragraph here.\n\n${figure("asset-1.png")}`);
    expect(visual.skeleton(moved)).not.toBe(visual.skeleton(article));
    expect(visual.withoutTreatments(article)).not.toContain("<figure>");
    expect(visual.withoutTreatments(article)).not.toMatch(/\n{3,}/);
  });
});

describe("visual reading rollout analysis", async () => {
  const visual = await import("./blog/visual.ts");
  const { mkdtempSync, mkdirSync: mkdir, writeFileSync: write, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  const fixture = () => {
    const dir = mkdtempSync(join(tmpdir(), "bvr-rollout-"));
    const project = join(dir, "project"), pkgDir = join(dir, "pkg"), sessions = join(dir, "sessions");
    for (const d of [project, join(pkgDir, "agents"), sessions]) mkdir(d, { recursive: true });
    write(join(project, "candidate-1.md"), "x");
    write(join(project, "chart-1.png"), "png");
    write(join(pkgDir, "agents/vh-adlc-blog-editor.agent.md"), "x");
    return { dir, project, pkgDir, sessions };
  };
  const row = (type: string, payload: object) => JSON.stringify({ type, payload });
  const call = (turn: string, id: string, name: string, args: object) => row("response_item", { type: "function_call", name, call_id: id, arguments: JSON.stringify(args), internal_chat_message_metadata_passthrough: { turn_id: turn } });
  const exec = (turn: string, id: string, input: string) => row("response_item", { type: "custom_tool_call", name: "exec", call_id: id, input, internal_chat_message_metadata_passthrough: { turn_id: turn } });
  const output = (id: string, output: unknown) => row("response_item", { type: "function_call_output", call_id: id, output });
  const task = (turn: string, root: string, message?: string) => [
    row("event_msg", { type: "task_started", turn_id: turn, root_turn_id: root }),
    ...(message === undefined ? [] : [row("event_msg", { type: "task_complete", turn_id: turn, root_turn_id: root, last_agent_message: message })]),
  ];

  test("links children, finds the editor's reads and view, and checks the spawn", () => {
    const f = fixture();
    try {
      write(join(f.sessions, "parent.jsonl"), [
        row("session_meta", { id: "P", cwd: f.project, source: "exec" }),
        ...task("pt", "pt"),
        row("turn_context", { turn_id: "pt", cwd: f.project }),
        call("pt", "c1", "spawn_agent", { task_name: "editor", fork_turns: "none", message: "enc" }),
        call("pt", "c2", "exec_command", { cmd: "ls -la && cat candidate-1.md 2>/dev/null | head -5" }),
        ...task("pt", "pt", "Verdict: Needs revision"),
      ].join("\n"));
      write(join(f.sessions, "child.jsonl"), [
        row("session_meta", { id: "C", cwd: f.project, source: { subagent: { thread_spawn: { parent_thread_id: "P" } } } }),
        ...task("ct", "pt"),
        row("turn_context", { turn_id: "ct", cwd: f.project }),
        call("ct", "d1", "exec_command", { cmd: `sed -n 1,80p ${f.pkgDir}/agents/vh-adlc-blog-editor.agent.md` }),
        call("ct", "d2", "view_image", { path: "chart-1.png" }),
        output("d2", [{ type: "input_image", image_url: "data:image/png;base64,AA" }]),
        exec("ct", "d3", `const r = await tools.exec_command({cmd:"curl -s https://example.invalid/x"}); text(r);`),
        ...task("ct", "pt", "Verdict: Needs revision\nCopy repairs: None\nPresentation repairs: None.\nExceptions: None"),
      ].join("\n"));
      const all = visual.loadRollouts(f.sessions);
      const { parent, children } = visual.linkedRollouts(all, "P");
      expect(parent?.id).toBe("P");
      expect(children.map((c) => c.id)).toEqual(["C"]);
      const child = children[0];
      expect([...visual.rootTurns(child)]).toEqual(["pt"]);
      expect(visual.spawnCalls(parent!, visual.rootTurns(child)).every((s) => s.noHistory)).toBe(true);
      const analysis = visual.analyze([parent!, child], { png: join(f.project, "chart-1.png"), allowedUrl: visual.docsUrl("abc") });
      const childReads = analysis.reads.filter((r) => r.thread === "C").map((r) => r.path);
      expect(childReads.some((p) => p.endsWith("agents/vh-adlc-blog-editor.agent.md"))).toBe(true);
      expect(analysis.reads.some((r) => r.thread === "P" && r.path.endsWith("candidate-1.md"))).toBe(true);
      expect(analysis.reads.some((r) => r.path === "/dev/null")).toBe(false);
      expect(analysis.views).toEqual([{ thread: "C", turn: "ct", path: expect.stringMatching(/chart-1\.png$/), carriesImage: true }]);
      expect(analysis.fetches.map((x) => x.what)).toEqual(["url: https://example.invalid/x"]);
      expect(analysis.mentions.map((m) => m.thread)).toEqual(["C"]);
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });

  test("flags forked spawns, code-mode views, searches, gh and git fetches, and outside reads", () => {
    const f = fixture();
    try {
      write(join(f.sessions, "parent.jsonl"), [
        row("session_meta", { id: "P", cwd: f.project, source: "exec" }),
        ...task("pt", "pt"),
        exec("pt", "e1", `await tools.spawn_agent({task_name:"editor", fork_turns:"all", message:"go"}); const v = await tools.view_image({path:"chart-1.png"}); image(v);`),
        row("response_item", { type: "custom_tool_call_output", call_id: "e1", output: [{ type: "input_image" }] }),
        call("pt", "e2", "exec_command", { cmd: "gh api repos/x/y; git -C . fetch origin; cat ../" }),
        row("response_item", { type: "web_search_call", id: "w1", action: { type: "search", query: "chart topic" }, internal_chat_message_metadata_passthrough: { turn_id: "pt" } }),
        call("pt", "e3", "exec_command", { cmd: "ls chart-1.png" }),
        call("pt", "e4", "exec_command", { cmd: "curl https://raw.githubusercontent.com/vhco-pro/docs/abc/AGENTS.md" }),
      ].join("\n"));
      const { parent } = visual.linkedRollouts(visual.loadRollouts(f.sessions), "P");
      expect(visual.spawnCalls(parent!, new Set(["pt"])).map((s) => s.noHistory)).toEqual([false]);
      const a = visual.analyze([parent!], { png: join(f.project, "chart-1.png"), allowedUrl: visual.docsUrl("abc") });
      expect(a.views.map((v) => v.carriesImage)).toEqual([true]);
      const what = a.fetches.map((x) => x.what.split(":")[0]);
      expect(what).toContain("gh");
      expect(what).toContain("git");
      expect(what).toContain("search");
      expect(a.fetches.some((x) => x.what.includes("raw.githubusercontent.com"))).toBe(false);
      expect(a.reads.some((r) => r.path === f.dir || !visual.inside(r.path, [f.project, f.pkgDir]))).toBe(true);
      expect(a.mentions.map((m) => m.listingOnly)).toEqual([false, true]);
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });

  test("shell splitting finds command names and skips redirection targets", () => {
    expect(visual.simpleCommands("A=1 cat 'a b' && echo \"$(ls x)\" | grep -q y; tail z").map((w) => visual.commandWords(w).name).sort()).toEqual(["cat", "echo", "grep", "ls", "tail"]);
    expect(visual.commandWords(["cat", "a", ">", "out", "2>/dev/null", "b"]).args).toEqual(["a", "b"]);
  });
});
