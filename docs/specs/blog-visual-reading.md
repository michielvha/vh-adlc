---
status: draft
status_description: "Revised after R-12; awaiting re-review."
issue: null
goal: "Long-form articles reach the owner with a checked visual reading pass, and the editor reviews presentation as well as prose."
covers:
  - plugins/vh-adlc/references/blog.md
  - plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md
  - plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - docs/specs/blog-authoring.md
  - tests/vh-adlc/blog.test.ts
  - tests/vh-adlc/blog/
  - tests/vh-adlc/evidence/blog/
---

# Plan: Blog visual reading pass

Make the shared blog writer compose each new long-form article as a page, with relevant images or exact author pull quotes, and make the independent editor review that presentation before the owner sees the draft.

## Context

### Owner summary

The blog operation currently treats visuals as optional. It adds one only when prose cannot explain something, so founder stories and opinion pieces arrive as long walls of text. On 29 October the owner had to ask for visuals and pull quotes on Stackweaver articles by hand, then asked for the blog agents to be changed "so I don't have to remind you to do these things in the future". A Codex session made that change on `feat/blog-visual-reading`, now PR #75. It was never specified or spec-reviewed, and one independent PR review asked for changes. This document specifies the change and those fixes.

After this change, every new long-form article (800 words of body prose or more) gets a visual reading pass. The writer places story-specific illustrations, relevant product images or exact attributed quotes from the author's own notes inside the body, where they break up long stretches of prose for the reader. It never adds filler to meet a quota, never invents quotes, charts or customer outcomes, and never passes off an illustration as product UI. Shorter articles may record a reasoned no-visual exception instead. "No assets were supplied" is not a valid reason while a pull quote is available.

Revisions that only change wording, and review-only runs, keep the current conservative behavior. They report presentation gaps as findings. A presentation revision, such as backporting visuals to older articles, adds treatments and leaves the prose byte-identical.

The editor opens each actual image, gains a fourth return line, `Presentation repairs`, flags long stretches of prose left without a break, and checks that pull quotes don't repeat a point already quoted in the batch or related articles. For comparison articles, the writer picks comparators for the reader's job rather than listing every adjacent tool, as the owner asked when OTF and Atlantis were dropped.

Why there is a conflict: the in-progress blog-authoring spec says to add visuals "only when they solve an explanation problem" and fixes a three-line editor return. This document replaces exactly those two rules. Blog-authoring's Context gets a pointer here; its scope, criteria and status stay unchanged.

These defaults were set under the owner's standing instruction to take the recommended option. You can reject any of them at acceptance:

- No-visual exceptions are allowed only below 800 words.
- There is no fixed image count. The editor judges reading flow instead.
- In a new article, pull quotes come only from the author's notes, never from the writer's own draft. A presentation revision may also quote the existing article.
- Missing rendered checks, and images the editor could not view on its host, are reported in the handoff but don't fail the editor's `Pass` on their own, because neither capability is available on every host.
- New image files, raster or SVG, are created only when the request or adopter instructions permit it. Otherwise the writer uses supplied assets and pull quotes.
- The version is 0.17.0, landing before the SEO change at 0.18.0.

Proof will come from static contract tests and eight new native Codex scenarios in the existing blog runner. None has run yet. Acceptance authorizes implementing this and committing on `feat/blog-visual-reading`. Pushing to update PR #75 needs a ship request, and merging needs the owner's separate approval. CI, which also runs the fixture test this host cannot pass, is checked at ship on the pushed head and must pass before a merge; it is not part of the implementation review.

### Background

On main at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`, `plugins/vh-adlc/references/blog.md:55-56` says "Use actual assets; add a visual when it explains something the prose cannot show well." The editor's return block at `plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md:38-40` has three lines: `Verdict`, `Copy repairs` and `Exceptions`. Its description at line 3 calls it a "prose editor". `plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md:24` says the editor "reviews prose, not gates". `tests/vh-adlc/blog.test.ts:37` asserts that the editor text contains `Copy repairs`.

`docs/specs/blog-authoring.md` is `in-progress` with AC-03 unverified and `branch: feat/blog-authoring`. That branch no longer exists: `git ls-remote --heads origin feat/blog-authoring` and `git branch --list feat/blog-authoring` both return nothing. Its Draft and handoff design (line 96) says to "add visuals only when they solve an explanation problem", and its AC-09 (line 119) defines the editor's verdict, repairs and exceptions return. It covers the same blog files as this document.

The originating request is in the local Codex session `~/.codex/sessions/2026/10/27/rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`. At 2026-10-29T17:27 the assistant reported "I missed the visual composition pass". At 21:37 the owner replied: "You need to change the blog agents so I don't have to remind you to do these things in the future", asked that adjacent tools such as OTF and Atlantis not be listed, and asked to "backport this visual stuff into the other articles". The same session wrote the shared change at 21:41 on `feat/blog-visual-reading`; it stayed uncommitted until commit `8205531` preserved it.

PR #75 (`git diff origin/main...997b63d`) adds a "Compose the reading experience" section and comparator guidance to `references/blog.md`, presentation review and a `Presentation repairs` line to the editor, a visual-pass sentence and extra dispatch inputs to the skill entry, and a paragraph to `docs/user-guides/workflows.md`. Its independent PR review asked for changes. It found the conflict with blog-authoring, an unconditional pass that would also add visuals during wording-only revisions, image generation without a permission rule, inputs listed differently in three places, no rendering fallback in the skill entry, and an editor still described as prose-only.

At `dbb0485`, `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc --timeout 60000` reports 1425 passing and one failure: `tests/vh-adlc/fixtures.test.ts` fails during setup with "the installer rejected the fixture lock: vh-adlc: /usr/local/bin/vh-adlc reports vh-adlc 0.19.0 but its digest does not match the lock", because the verified real vh-adlc 0.19.0 in `/usr/local/bin` has the fixture lock's version but not the digest of the test's wrapper, which the fixture lock pins (`tests/vh-adlc/fixtures/build.ts:271-276`, `plugins/vh-adlc/scripts/ensure-vh-adlc.sh:4-7`). No test in that file runs locally; CI runs them.

`tests/vh-adlc/blog/run.ts` runs native Codex scenarios against an installed copy of the package in a disposable profile and checks outputs and authorized destinations. `tests/vh-adlc/evidence/blog/README.md` records nine passing scenarios from 29 October.

## Scope

In scope:

- The visual reading pass for new long-form articles, the short-article exception, and the revision rules for existing ones.
- Asset and quote integrity, including when new image files are allowed.
- One shared list of presentation inputs used by the writer, the skill entry and the editor.
- The editor's presentation review and its `Presentation repairs` return line.
- Rendering checks per viewport and supported theme, with an explicit fallback.
- Comparator selection guidance for comparison articles.
- A non-normative pointer from blog-authoring's Context to this document.
- User guide text, the package version bump, static tests and native scenarios.

Out of scope:

- Changing any adopter's site, renderer, theme or components.
- Backporting visuals into specific existing articles. An owner requests that as a presentation revision.
- New image tooling, a stock-image source, or a mandatory image count.
- Publication, scheduling or social posting authority.
- Blog-authoring's other rules, its AC-03 residual and its status.

## Design

### Terminology

| Term | Meaning |
| --- | --- |
| Visual reading pass | The writer's composition of a new long-form article as a page, with treatments placed for the reader (AC-01, AC-09). |
| Long-form article | An article whose body prose is 800 words or more, excluding front matter, code blocks and captions (AC-01, AC-02). |
| Treatment | A placed illustration, product image, pull quote or other component the destination supports, tied to a named point in the passage (AC-01). |
| No-visual exception | A recorded decision, with its reason, that an article below 800 words needs no treatment (AC-02). |
| Presentation revision | A request to add, move or replace treatments in an existing article without changing its prose (AC-04). |
| Presentation inputs | The list in `references/blog.md` under that heading, which the writer supplies to the editor (AC-06). |
| Presentation repairs | The editor's return line for treatment, reading-flow and unverified rendering findings (AC-07, AC-08). |

The editor, skill entry, `references/blog.md` and the user guide use these terms as defined (AC-09).

### Relationship to blog-authoring

This document replaces two parts of `docs/specs/blog-authoring.md`. Its rule at line 96, "add visuals only when they solve an explanation problem", gives way to the reading pass below. Its rule against visuals "solely to decorate" still holds: a treatment must serve a named point. AC-09's three-line return gains `Presentation repairs`. Once this ships, those two rules are not review targets for blog-authoring.

Blog-authoring's Context gains one paragraph pointing here and naming the two replaced rules. Context is outside the normative baseline, so its criteria, ticks, reviews and status are unaffected. The edit is made on `feat/blog-visual-reading` because blog-authoring's own branch no longer exists.

### The reading pass

`references/blog.md` gains a "Compose the reading experience" section. For a new long-form article, the writer composes the page before handoff, including founder stories and opinion pieces with no technical diagram. It places at least one treatment, more where the length calls for it, inside the body between paragraphs, at points that break sustained prose. A treatment before the first paragraph or after the last does not count. Headings and short paragraphs alone do not complete the pass. Placement follows the story, without a fixed image count or one template for every article.

A new article below 800 words either places a treatment or records a no-visual exception with its reason. These are never valid reasons: the lack of a technical diagram, and missing assets while the author's notes contain a quotable point.

Revisions fall into three kinds:

- A wording-only revision, including one whose only request is exact wording, changes no treatment. It reports presentation gaps as findings.
- A review-only run changes no file and reports presentation gaps as findings.
- A presentation revision adds, moves or replaces treatments and leaves every prose line and exact-wording span byte-identical.

In every run, including a new article, an exact-wording span keeps its wording; the pass places treatments around it.

### Asset and quote integrity

The writer uses supplied assets when they fit. Copying a supplied asset unchanged into the destination is not creating an image. Creating or editing any image file, raster or vector including SVG, needs permission in the owner's request or the adopter's instructions. With permission it uses the host's image capability inside the authorized destination. Without it the writer uses supplied assets, pull quotes or other supported treatments, and reports any missing asset.

A conceptual illustration's caption or alt text identifies it as an illustration and never presents it as product UI. A customer quote, usage chart or benchmark is never invented. Before selecting an image, the writer opens it and matches its visible screen, state and controls to the nearby passage; a new caption does not make an unrelated screenshot relevant. Demo captures are described as demos.

A pull quote in a new article comes word for word from the author's notes, never from the writer's own draft. In a presentation revision it may also come from the existing article. It keeps its qualifications and carries attribution to the author. It highlights an article-specific point. The writer compares it with the current batch and related articles for the same meaning as well as the same words, and picks another supported point or leaves ordinary prose when emphasis adds nothing. Essential information stays in selectable text. Every image has alt text and a caption.

### Presentation inputs

`references/blog.md` has a list under the heading "Presentation inputs":

- each placement and the point it serves;
- each asset's file path, description and provenance;
- quote sources;
- the quote inventory of the current batch or related articles;
- rendered evidence for each viewport and supported theme, or a statement of what is missing.

The skill entry's editor dispatch and the editor agent name "Presentation inputs" in `references/blog.md` and do not list the items themselves.

### Rendering checks

The writer inspects the destination's existing image, caption, quote and code components and keeps article presentation out of reusable renderer internals. It checks the rendered page on desktop and phone in each theme the site supports: spacing, contrast, legible image text, loading and overflow, plus existing zoom and navigation when used. When rendering is unavailable it reports presentation as unverified and names the missing assets. A Markdown-only inspection is never called a rendered review. The skill entry states this fallback and the per-theme requirement.

### Editor

The editor's description and the skill entry describe it as a prose and presentation editor. The writer dispatches it without parent history, so it never inherits the writer's own reading of an image; on Codex that means `spawn_agent` with `fork_turns` set to `none`. The dispatch tells the editor to read `agents/vh-adlc-blog-editor.agent.md` from the installed package itself rather than pasting its text. `references/blog.md` states both. It reads the presentation inputs and opens each image file itself, judging relevance from the image and not from the writer's description or caption. When its host cannot show it an image's content, it names that image's relevance as unverified under `Presentation repairs` and never judges it from the caption. It flags:

- long-form articles without a treatment inside the body;
- sustained prose runs left without a break;
- invalid no-visual exceptions;
- filler and irrelevant images;
- illustrations presented as product UI;
- illegible image text and missing alt text or captions;
- unsupported screenshots or charts;
- inexact or unattributed quotes;
- quotes that repeat a point from the batch or related articles.

It asks for the smallest presentation repair, keeps useful existing visuals and never returns a replacement article.

Its return becomes:

```text
Verdict: Pass | Needs revision
Copy repairs: ...
Presentation repairs: Visual or reading-flow repairs and unverified rendered checks, or None.
Exceptions: ...
```

A missing rendered check or an image the editor could not view is listed under `Presentation repairs` but does not by itself make the verdict `Needs revision`. The handoff repeats each.

### Handoff and documentation

The handoff reports treatments placed, no-visual exceptions and rendered checks, or their limits, including every unverified check the editor named. `docs/user-guides/workflows.md` describes the pass, the 800-word threshold, and states that pull quotes must differ from those in the current batch or related articles.

### Comparator guidance

For comparison articles, the writer picks comparators for the reader's job and the article's scope. Research does not have to become a public list of every adjacent tool. Dropping an irrelevant comparator does not support an exclusive market claim.

### Packaging

Both package manifests move to 0.17.0, the version PR #75 already carries. `tests/vh-adlc/check.test.ts:224-232` checks only that the version differs from main; the sequencing before the SEO change at 0.18.0 is a choice. No new skill, agent or binary change is added.

## Acceptance Criteria

- [ ] AC-01: A new long-form article run whose notes contain quotable points and an exact-wording span produces a draft of 800 or more body prose words with at least one treatment between body paragraphs, hands off the point each treatment serves, and keeps the exact-wording span byte-identical.
- [ ] AC-02: A new article run whose draft is below 800 body prose words and whose notes contain a quotable point either places a treatment or records a no-visual exception whose reason is neither a missing diagram nor missing assets.
- [ ] AC-03: Without permission for new images, a new article run leaves every image file in the destination identical to a supplied asset, and every pull quote it adds appears word for word in the author's notes and is attributed to the author.
- [ ] AC-04: A presentation revision adds at least one treatment and leaves every prose line and exact-wording span byte-identical; a wording-only revision changes no treatment; a review-only run changes no file; and the last two report presentation gaps as findings.
- [ ] AC-05: With permission for new images and notes that call for a conceptual illustration, a new article run adds an image file whose caption or alt text identifies it as an illustration and not product UI; every image any run adds has alt text and a caption.
- [ ] AC-06: `references/blog.md` has a "Presentation inputs" list with the five items, and the skill entry and editor name that list without restating its items.
- [ ] AC-07: Given a real image of a bar chart of monthly rainfall whose caption and description claim a plan review, a pull quote that repeats a batch quote's meaning in new words, a long-form candidate whose only treatment follows its last paragraph, and a long-form candidate with one early body treatment followed by an unbroken run of over 1,500 words, the editor returns `Needs revision` and names all four under `Presentation repairs`. It reports the image as not matching its passage from what the image shows; an "unverified" entry for that image leaves this criterion unmet.
- [ ] AC-08: Given sound prose and presentation with only phone evidence missing, the editor returns `Pass` and names the missing check under `Presentation repairs`, and the handoff repeats it. When rendering is unavailable, the handoff says presentation is unverified and makes no rendered-review claim. The editor agent states the unviewable-image fallback.
- [ ] AC-09: The editor description says "prose and presentation"; the editor text names each flag in the Design's list; the editor return has the four lines above; the skill entry states the rendering fallback and per-theme check; `references/blog.md` has the comparator guidance, the rule that the editor is dispatched without parent history and told to read its agent file from the installed package, the 800-word threshold and the handoff line for treatments, exceptions and rendered checks; the user guide states the 800-word threshold and the batch-or-related quote rule; these files use the Terminology terms; blog-authoring's Context points here; and both manifests carry 0.17.0. `bun test tests/vh-adlc` passes locally, except that `tests/vh-adlc/fixtures.test.ts` may fail only with the fixture-lock digest error quoted in Background.

## Test Plan

Each visual fixture's `AGENTS.md` declares the destination's image-with-caption markup and its pull-quote markup with attribution. The runner recognizes treatments, images, captions, quotes and attribution only in that declared markup.

| Criterion | Proof |
| --- | --- |
| AC-01 | Native `visual-new` scenario in `tests/vh-adlc/blog/run.ts`: founder-style notes of about 1,200 words with quotable lines and one exact-wording span, one supplied relevant PNG, no renderer and no image permission. Count the draft's body prose words as Terminology defines them and fail unless 800 or more. Assert at least one treatment with body paragraphs both before and after it, a point for each in the handoff, and the exact-wording span unchanged. |
| AC-02 | Native `visual-short` scenario: notes for a 400-word piece containing a quotable line. Count body prose words and fail unless below 800. Assert either a treatment or an exception whose reason does not mention a diagram or missing assets. |
| AC-03 | `visual-new` run: hash every `png`, `jpg`, `jpeg`, `gif`, `webp`, `avif` and `svg` file in the fixture after the run and assert each matches a supplied asset; check each added quote verbatim against the notes file and that its markup names the author from the notes. |
| AC-04 | Native `visual-presentation` scenario on an existing article with a protected span: diff shows added treatment markup and every original prose line unchanged. Native `visual-revision` (wording-only) and `visual-review` (review-only) scenarios each start from a long-form article with one treatment and a known gap: a run of over 1,000 words without a break. In the first, the article's image, figure and quote markup is byte-identical before and after the run; the second changes no file; both handoffs name that gap. |
| AC-05 | Native `visual-illustration` scenario: notes calling for a conceptual illustration of a workflow, with image permission in the request and no supplied asset for it. Assert a new image file in the destination whose caption or alt text says it is an illustration, with alt text and a caption. In `visual-new`, `visual-short`, `visual-presentation` and `visual-illustration`, assert every added image has alt text and a caption. |
| AC-06 | `tests/vh-adlc/blog.test.ts` asserts the heading and five items in `references/blog.md`. It locates two spans: the skill entry's paragraph that dispatches the editor, and the editor agent's paragraph that says what it reads, each found as the paragraph containing "Presentation inputs". It asserts both spans name "Presentation inputs" and that neither matches, case-insensitively, "placement", "file path", "asset path", "provenance", "quote source", "quote inventory" or "rendered evidence". |
| AC-07 | Native `visual-editor` scenario with two editor dispatches. The first candidate is 1,200 words whose only treatment, after the last paragraph, is a real PNG of a bar chart of monthly rainfall, captioned and described as a plan review. The second is 2,500 words whose only treatment, after its second paragraph, is a pull quote repeating the meaning of a quote in the supplied batch inventory, followed by unbroken prose. The repeated quote shares no run of six or more consecutive words with the batch quote. Assert `Needs revision` from each, with each named problem on its `Presentation repairs` line: the first names the image mismatch and the closing placement, the second names the repeated quote and locates the unbroken run. The image repair must describe the image as a rainfall chart, not a plan review, and fails if it calls the image unverified. The runner sets `TMPDIR` to a `.scratch/` directory inside the fixture project, lists it in `.git/info/exclude` and leaves it out of the changed-path and unchanged-file checks, so a review-only run that writes scratch there still changes no tracked or reported file. A scratch path elsewhere, such as a hard-coded `/tmp`, is outside the allowlist. The scenario prompt asks the parent to dispatch the editor on the two supplied candidates and not to open their images itself. Before the run, the runner asserts that the PNG's file name, alt text, caption and description, the other fixture files, every file of the installed package and the resolved docs cache at the fixture's pin and the scenario prompt text contain none of "rainfall", "precipitation" or "weather", and that the PNG has no `tEXt`, `iTXt`, `zTXt` or `eXIf` chunk. After the run it reads the parent's native rollout and its linked child rollouts under the run profile's sessions directory, matched by `source.subagent.thread_spawn.parent_thread_id` as `tests/vh-adlc/lifecycle/native-review.ts` does. Codex stores the text sent to a child encrypted, so the runner cannot read it. Instead, the scenario fails unless all of these hold: each editor `spawn_agent` call inherits no parent history (`fork_turns` is `none` and `fork_context` is absent or false); no turn other than the editor's own, in the parent or any other child, has a view of the PNG or any command or `exec` input naming its path other than a directory listing; every file any turn in the scenario, the parent's and every child's, read or listed lies inside the fixture project, the installed package or that docs cache, so `../driver.ts` and the repository checkout are out of bounds; no turn makes a network fetch or web search, where a fetch is a `web_search` or web-fetch tool call, or a URL operand to `curl`, `wget` or `fetch`, other than a `github.com` or `raw.githubusercontent.com` path under `vhco-pro/docs` at the fixture's pin, which the fixture `AGENTS.md` names and which is word-free; and one of the editor's own turns viewed the PNG with its output carrying the image. A view is a `view_image` function call on the PNG's path, or in code mode a `tools.view_image` call on that path inside an `exec` input whose result is passed to `image(...)`. Reads and listings are taken from shell commands and from `exec` input text, as native-review.ts reads `payload.input`. An editor child is a linked child whose own turns read `agents/vh-adlc-blog-editor.agent.md` in the installed package and whose final message starts with `Verdict:`; every other linked child is a non-editor. Editor turns are matched by `turn_id`. A shell command is split into simple commands on `&&`, `||`, `;`, `|`, newlines and `$(...)`; in each, the first word after any `VAR=value` assignments is the command name. A read or listing is any later word that resolves against the turn's working directory to an existing file or directory. In a code-mode `exec` input, a string literal passed to a shell-running call is split as a shell command, and a literal passed to a file-reading or listing call, such as `readFile`, `readdir`, `open` or `tools.view_image`, is a read; other literals, such as a `/` passed to `split`, are not. The verified binary path `scripts/ensure-vh-adlc.sh` prints is a run wherever it appears, never a read, and is allowed. A path mention, a `file` or `ls` command or a text read of the PNG does not count as the editor viewing it. Every turn reads only word-free files and no other turn opened the image, so nothing that reached the editor can name the subject. |
| AC-08 | Native `visual-editor-pass` scenario: clean candidate with desktop evidence only. Assert `Pass`, the named phone check on the editor's `Presentation repairs` line and its presence in the handoff. The `visual-new` handoff contains the unverified statement and no rendered-review claim. `blog.test.ts` asserts the editor's unviewable-image fallback text. |
| AC-09 | `blog.test.ts` assertions for each named statement and term, including the threshold in the user guide and each of the editor's nine flags in its agent text, and for the pointer in `docs/specs/blog-authoring.md`; `tests/vh-adlc/check.test.ts` for the version; `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc --timeout 60000` locally. `gh pr checks 75` after the ship push is reported by ship and is not review evidence. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The defaults in the owner summary were set under the owner's standing instruction of 2026-11-10 to take the recommended option, and are confirmed or rejected at acceptance.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-11 | R-1 | spec | `70f88db` | unknown | procedural | 10 findings: 1 blocking, 7 should-fix, 2 nits; model identity not attested |
| 2026-11-11 | R-2 | spec | `dbb0485` | claude-opus-4.8 | procedural | Changes needed: 6 should-fix, 6 nits; no blocking finding. |
| 2026-11-11 | R-3 | spec | `aba495b` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix, 3 nits; no blocking finding. |
| 2026-11-11 | R-4 | spec | `9c146a3` | unknown | procedural | Changes needed: 1 should-fix, 4 nits; no blocking finding. |
| 2026-11-11 | R-5 | spec | `30f552b` | claude-opus-4.8 | procedural | Changes needed: 1 should-fix, 2 nits; no blocking finding. |
| 2026-11-11 | R-6 | spec | `7d44d21` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix; no blocking finding. |
| 2026-11-11 | R-7 | spec | `23b3278` | claude-opus-4.8 | procedural | Changes needed: 1 should-fix, 1 nit; no blocking finding. |
| 2026-11-11 | R-8 | spec | `7880566` | unknown | procedural | Changes needed: 1 blocking, 1 should-fix, 2 nits. |
| 2026-11-11 | R-9 | spec | `58e2a8f` | claude-opus-4.8 | procedural | Changes needed: 1 should-fix, 1 nit; no blocking finding. |
| 2026-11-11 | R-10 | spec | `ba8b3de` | unknown | procedural | Changes needed: 1 should-fix, 2 nits; no blocking finding. |
| 2026-11-11 | R-11 | spec | `e74edb1` | claude-opus-4.8 | procedural | Changes needed: 1 should-fix, 2 nits; no blocking finding. |
| 2026-11-11 | R-12 | spec | `03b3009` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix, 1 nit; no blocking finding. |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Acceptance Criteria AC-01, Test Plan AC-01 and AC-02, Design "The reading pass"
EVIDENCE: docs/specs/blog-visual-reading.md:135 at 70f88db says AC-01 passes with "either placed treatments ... or a recorded no-visual exception with a reason other than the lack of a technical diagram". Line 78 allows that exception "for an article of any length". Line 148 accepts "placements with their points or a reasoned exception". Line 149 runs the same `visual-new` scenario without permission for generated images, and the scenario states no existing assets. The owner asked for this change because a founder article arrived as a wall of text: the Codex session at 2026-10-29T17:00:50Z says "I am missing visual assets in between the text", and at 21:37:40Z the owner asks "so I don't have to remind you". If the writer records an exception such as "no assets supplied", every box can be ticked while the founder article still has no treatment.
PROPOSAL: Make the `visual-new` fixture contain at least one admissible treatment, such as quotable author notes or an existing relevant asset, and require AC-01 to show at least one placed treatment there. Prove the exception path with a separate scenario. Also state which exception reasons are invalid when an admissible treatment exists, such as missing assets when a pull quote is available.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design "Asset and quote integrity", AC-02, Test Plan AC-02
EVIDENCE: docs/specs/blog-visual-reading.md:84 says the writer "creates or edits raster images only when" permitted. AC-02 at line 136 says that without permission "a new article run creates no image files". The Test Plan at line 149 counts "new image files" in the fixture tree. Under the Design, an unpermitted run may still write an SVG or other non-raster illustration, or copy an existing asset into the destination, and either would fail AC-02. The Codex session at 2026-10-29T17:27:57Z reports that the original run added "original illustrations".
PROPOSAL: Use the same rule in the Design and in AC-02. Either restrict every generated image file, or restrict only raster files and name the file types the Test Plan counts. Also say whether copying an existing supplied asset counts as creating an image file.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design "Presentation inputs" and "Editor", AC-05, Test Plan AC-05
EVIDENCE: docs/specs/blog-visual-reading.md:95 makes "asset descriptions and provenance" the editor's image input. Line 108 says the editor "reviews the presentation inputs" and flags "irrelevant images", but it never says the editor inspects the actual image. The Owner summary at line 32 says the editor "checks that each image shows what its passage discusses". PR #75 at 997b63d tells the editor to "Compare each actual image with the passage" and says "A plausible filename or caption alone is insufficient". Test Plan line 152 does not say whether the launch-dialog screenshot fixture is a real image or a description. If the editor reads only writer-supplied descriptions, a mislabelled screenshot passes.
PROPOSAL: State in the Design that the editor inspects each actual image file and does not rely only on the writer's description. Make the AC-05 fixture a real image whose caption and description claim a plan review.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design "Relationship to blog-authoring"
EVIDENCE: docs/specs/blog-visual-reading.md:74 says blog-authoring's text "is left as written and its status unchanged" and that "This document is the current authority for presentation". `git show bda1a87:docs/specs/blog-authoring.md` shows `status: in-progress`, `branch: feat/blog-authoring`, and covers that include `plugins/vh-adlc/references/blog.md`, the editor agent and `tests/vh-adlc/`. Its normative Design at line 96 still says "add visuals only when they solve an explanation problem". The owner chose a separate document in session turn 22 ("2. A") and asked "why does it contradict?" Nothing in blog-authoring will point to this override. A later implementation review of blog-authoring, for example one that settles AC-03, would read line 96 as current and find the shipped code contradicting it.
PROPOSAL: Add a non-normative pointer to this document in blog-authoring's Context or status_description. Neither is part of its normative baseline, so the change does not reset its criteria. State here that line 96 and the three-line return are not review targets for blog-authoring after this ships. Briefly say in the Owner summary why the two documents conflict.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, Test Plan
EVIDENCE: The Design states behavior that no criterion covers. docs/specs/blog-visual-reading.md:80 says that when a request asks for presentation work, treatments are added "When it does, surrounding prose stays as it is". The owner's 21:37:40Z message asks to "backport this visual stuff into the other articles", and line 65 routes that case to a presentation revision. Line 80 also covers exact-wording requests and review-only runs, but AC-03 at line 137 tests only a wording-only revision. Line 86 says "A conceptual illustration is never presented as product UI" and "A customer quote, usage chart or benchmark is never invented". Line 88 requires alt text and captions. Line 104 requires the skill entry to state "the theme requirement", but Test Plan line 154 asserts only the fallback.
PROPOSAL: Add criteria with proofs for a presentation revision that leaves surrounding prose byte-identical, and for illustrations not presented as product UI. Either test review-only and exact-wording runs, or narrow line 80 to what AC-03 proves. Extend the AC-07 static check to the theme requirement.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design "Presentation inputs", AC-04, Test Plan AC-04
EVIDENCE: docs/specs/blog-visual-reading.md:92-100 defines "one list of presentation inputs" and says the skill entry and editor "refer to this list by name", but the Design never gives that name. Test Plan line 151 asserts "the named list" and references to it "by name". It has no assertion for the "instead of restating different inputs" half of AC-04 at line 138. A skill entry that names the list and also restates a different input list, as SKILL.md does at 997b63d ("asset provenance, quote sources and rendered desktop/phone evidence"), would pass the planned test.
PROPOSAL: Give the list's exact heading or name in the Design. Add a Test Plan assertion that neither the skill entry nor the editor restates any of the five items in different words.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions, Design
EVIDENCE: feature-documents.md at d8f07c9 says "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion". This document introduces user-facing terms with no glossary: the `Presentation repairs` return label (line 115), "visual reading pass" (line 28), "no-visual exception" (line 78), "presentation inputs" (line 92) and "presentation revision" (line 65).
PROPOSAL: Add a glossary with these terms, and a criterion or AC-08 assertion that the editor, the skill entry, `references/blog.md` and the user guide use them consistently.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions
EVIDENCE: Line 163 says "None.". feature-documents.md at d8f07c9 says "Every trade-off the document settles is an open question". The owner answered only the three session choices (turn 22: "1. A / 2. A / 3. ..."). This document also settles three trade-offs: a no-visual exception at any length (line 78, where PR #75 allowed it only for "Short pieces"); a `Pass` verdict despite missing rendered checks (line 119); and a default of no generated images without explicit permission (line 84). The first two weaken the outcome the owner asked for. Nothing records that the owner chose them.
PROPOSAL: Raise these three choices as Open Questions with a recommendation, or present them in the Owner summary as defaults the owner accepts or rejects at acceptance.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-08
EVIDENCE: Line 142: "The editor description, skill entry, handoff guidance, comparator guidance and user guide state the behavior in this document". "The behavior in this document" has no observable bound. Test Plan line 155 checks a narrower, specific set of assertions. The criterion also does not name where "the package checks pass" will be observed.
PROPOSAL: Rewrite AC-08 to name the specific statements each file must contain, matching the Test Plan assertions. Name CI or the exact local command as the place where the package checks are observed.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: Line 26 says the change "was never specified or reviewed". Line 26 then mentions "the fixes an independent PR review asked for", and Background line 46 says "Its independent PR review asked for changes".
PROPOSAL: Say it was never specified or spec-reviewed, and that one independent PR review asked for changes.

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design "The reading pass" and "Editor", AC-01, Test Plan AC-01
EVIDENCE: docs/specs/blog-visual-reading.md:102 at dbb0485 says the writer places "at least one treatment, more where the length calls for it, at points that break sustained prose". The editor flag list at lines 140-147 flags only "long-form articles without a treatment". PR #75 at 997b63d also told the editor to "Flag sustained walls of prose", and that flag has been dropped. AC-01 at line 176 requires only "at least one placed treatment", and Test Plan line 190 asserts "at least one treatment in the draft". A 3,000-word founder article with one pull quote after its last paragraph ticks AC-01 and passes the editor. That is still the wall of text that caused this change (Codex session 2026-10-29T17:27:57Z: "I missed the visual composition pass").
PROPOSAL: Add an editor flag for sustained prose runs left without a break. Require AC-01 treatments to sit inside the body, between paragraphs, and assert that in the proof. If a density rule is wanted, disclose it as an owner default rather than a fixed quota.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-01, AC-02
EVIDENCE: Terminology line 85 measures the 800-word threshold on the article's body prose. The Test Plan sizes the notes instead: "founder-style notes of about 1,200 words" (line 190) and "notes for a 400-word piece" (line 191). Neither row asserts the word count of the draft the run produced. If visual-new produces a 750-word draft, an exception is legitimate and AC-01's premise is never established. If visual-short produces 900 words, the row's "either a treatment or an exception" assertion accepts an exception that Design line 104 forbids.
PROPOSAL: In both scenarios, count the draft's body prose words as Terminology defines them. Fail the scenario unless the draft is on the intended side of 800.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design "Asset and quote integrity", AC-03, Test Plan AC-03, Owner summary
EVIDENCE: Design line 118 and AC-03 at line 178 let a pull quote come from "the author's notes or the article". In a new article the article text is the writer's own draft. A quote taken from it and attributed to the author presents writer prose as the author's words. The Owner summary at line 29 says "exact attributed quotes from the author's own notes". The proof at line 192 checks each quote "verbatim against the notes file" only, which contradicts the criterion for quotes taken from the article. It has no attribution assertion, although AC-03 requires "with attribution".
PROPOSAL: Decide whether a new article may pull-quote its own draft, and make the Design, AC-03 and the Owner summary say the same thing. Add an attribution assertion to the AC-03 proof.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: AC-05, Test Plan AC-05
EVIDENCE: AC-05 at line 180 covers "Any illustration a run adds". Its proof at line 194 uses only visual-new and visual-presentation. Line 190 gives visual-new "no image permission", and line 193 gives visual-presentation no image permission either, so under Design line 114 neither run may create an illustration. The "labelled as an illustration" assertion is therefore vacuous. No scenario exercises the permitted creation path at line 114. If visual-new places only a pull quote, "every added image has alt text and a caption" is vacuous as well.
PROPOSAL: Add a scenario with explicit image permission whose notes call for a conceptual illustration, or supply a conceptual illustration asset that the run must place. Assert its illustration label, alt text and caption there.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design "The reading pass", AC-04
EVIDENCE: Line 108 says "A wording-only revision or exact-wording request changes no treatment." In `git show bda1a87:docs/specs/blog-authoring.md`, line 123 (AC-11) treats exact wording as protected copy inside a request, and that request can be a new article. A new long-form article with a protected span is then required to receive a treatment (line 102) and forbidden to change any treatment (line 108). AC-04 at line 179 and its proof at line 193 test only a wording-only revision. The exact-wording part of R-1 F-05 therefore remains unproved.
PROPOSAL: Limit line 108 to revisions whose only request is exact wording, or state that protected spans keep their wording while the pass still applies around them. Cover the chosen rule in AC-04 or remove the untested clause.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design "Editor", AC-07, AC-08
EVIDENCE: Line 138 requires the editor to open "each image file itself, judging relevance from the image and not from the writer's description or caption". The editor frontmatter at 997b63d (plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md line 4) grants `tools: Read, Grep, Glob`. The document says nothing about what happens when a host's editor cannot view image content. Rendering checks at line 134 do have an explicit fallback. Without one, an editor that cannot see the image may judge from the caption, which is the failure AC-07 targets.
PROPOSAL: Add a fallback: when the editor cannot view an image, it names that image's relevance as unverified under `Presentation repairs`, and the handoff repeats it. Prove this in AC-08 or a new criterion.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: Line 43 says "six new native Codex scenarios". The Test Plan at lines 190-198 names seven: visual-new, visual-short, visual-presentation, visual-revision, visual-review, visual-editor and visual-editor-pass.
PROPOSAL: Say seven scenarios.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Design "The reading pass", AC-02, Test Plan AC-02
EVIDENCE: Design line 104 makes missing assets an invalid reason only "while the author's notes or article contain a quotable point", and the Owner summary at line 29 is conditional in the same way. AC-02 at line 177 and the proof at line 191 reject a missing-assets reason unconditionally.
PROPOSAL: Use one rule in the Design, the Owner summary, AC-02 and its proof.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: AC-09, Test Plan AC-09
EVIDENCE: AC-09 at line 184 excuses "the known fixtures digest failure", and no part of the document identifies it. I ran `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc --timeout 60000` on a clone at dbb0485. Result: 1425 pass, 1 fail, `(fail) (unnamed)` in tests/vh-adlc/fixtures.test.ts with "the installer rejected the fixture lock: vh-adlc: /usr/local/bin/vh-adlc reports vh-adlc 0.19.0 but its digest does not match the lock". The failure happens during setup, so no test in fixtures.test.ts runs locally.
PROPOSAL: Name the failing file and its cause in the criterion or Context. State that the fixtures.test.ts coverage comes from CI on the PR head.

FINDING: F-10
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: The Owner summary at lines 27-43 does not mention the comparator guidance (Design line 168, which carries the owner's OTF and Atlantis instruction at 2026-10-29T21:37:40Z). It also omits the 0.17.0 before 0.18.0 version sequencing, which Design line 172 calls "a choice" and which is not among the three disclosed defaults at lines 39-41.
PROPOSAL: Mention the comparator guidance in the summary, and disclose the version sequencing as a default the owner confirms at acceptance.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-06
EVIDENCE: Line 195 checks that the skill entry and editor do not contain "provenance", "quote inventory" or "rendered evidence". A restatement such as "placements, asset paths and quote sources" still passes, which leaves part of R-1 F-06 open.
PROPOSAL: Assert that neither file's dispatch or input text names any of the five items, including placements, asset paths and quote sources.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Design "Handoff and documentation", AC-09
EVIDENCE: Design line 164 requires `docs/user-guides/workflows.md` to describe the 800-word threshold. AC-09 at line 184 requires the threshold only in `references/blog.md`, and for the user guide it requires only "the batch-or-related quote rule".
PROPOSAL: Add the user guide threshold to AC-09 and its proof, or drop it from the Design.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: AC-07, Test Plan AC-07, Design "Editor"
EVIDENCE: Design line 145 says that when the host cannot show the editor an image, the editor "names that image's relevance as unverified under `Presentation repairs`". Line 168 says such an image "does not by itself make the verdict `Needs revision`". AC-07 at line 190 requires only that the editor return `Needs revision` and "names all three under `Presentation repairs`". The proof at line 204 is "Assert the verdict and all three named repairs". In the visual-editor fixture, the repeated quote and the treatment after the last paragraph already force `Needs revision`. An editor that never sees the launch-dialog PNG can still name it under `Presentation repairs` as unverified through the fallback. In that case AC-07 ticks even though the editor never judged the image from its content, which R-1 F-03 asked this criterion to prove. The editor frontmatter at 997b63d still grants only `tools: Read, Grep, Glob`.
PROPOSAL: Require AC-07 and its proof to show the editor reporting that the image does not match its passage, for example a launch dialog and not a plan review. State that an "unverified" entry for that image leaves AC-07 unmet.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, Test Plan, Design "The reading pass" and "Editor"
EVIDENCE: The fix for R-2 F-01 added the editor flag "sustained prose runs left without a break" at line 148 and the writer rule "more where the length calls for it" at line 107. No criterion or proof exercises either one. AC-01 at line 184 needs "at least one treatment between body paragraphs" in a draft of about 1,200 words. AC-07's third case at line 190 tests the separate flag "long-form articles without a treatment inside the body", because its candidate's only treatment comes after the last paragraph. Suppose a 3,000-word article has one pull quote after its second paragraph and none after that. AC-01 is ticked, and the editor's sustained-run flag is never tested. That leaves most of the wall of text the owner complained about on 2026-10-29.
PROPOSAL: Extend AC-07, or add a criterion, with a long candidate that has a body treatment but also a long unbroken run of prose. Assert that the editor names that run under `Presentation repairs`.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design "The reading pass"
EVIDENCE: Line 109 makes missing assets an invalid exception reason "while the author's notes or article contain a quotable point". Line 125 says a pull quote in a new article comes "from the author's notes, never from the writer's own draft", and exceptions apply only to new articles below 800 words. Take a new short article where only the writer's draft has a quotable point and there are no assets and no image permission. The writer may not quote that draft, but line 109 still rejects a missing-assets exception. The owner summary at line 29 says "while a pull quote is available".
PROPOSAL: Replace "the author's notes or article" at line 109 with the author's notes, or say "while a permitted pull quote is available", so it matches line 125 and the owner summary.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context, Background
EVIDENCE: Line 58 says fixtures.test.ts fails "because the locally installed binary is newer than the fixture lock". That is not the case:
- `git show aba495b:plugins/vh-adlc/vh-adlc.lock.json` gives version 0.19.0, and `tests/vh-adlc/fixtures/build.ts:319` builds the fixture lock with that same version.
- `sha256sum /usr/local/bin/vh-adlc` prints f51c103465fc597e762f37a3b2f9db604504eeec31ff1a55dc2fa3d329503f8a. That equals the real lock's linux_amd64 `binary_sha256`.
- build.ts:271-276 writes a fixture lock that pins the digest of the shim wrapper instead.
- ensure-vh-adlc.sh:4-7 rejects a PATH entry with a matching version and the wrong digest.

The failure therefore comes from the real 0.19.0 binary on the installer's PATH, `/usr/local/bin`, which has the same version as the fixture lock but a different digest. The binary is not newer.
PROPOSAL: Say the failure occurs because a verified real vh-adlc 0.19.0 in /usr/local/bin has the fixture lock's version but not its wrapper digest.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-04
EVIDENCE: AC-04 at line 187 says a wording-only revision "changes no treatment" and that both runs "report presentation gaps as findings". The proof at line 201 checks only that visual-revision "adds or moves no image, figure or quote markup". Removing or replacing an existing treatment would pass that check. The proof also never says that the existing article in either fixture has a presentation gap to report. If it has none, "both handoffs list the gap" cannot be checked.
PROPOSAL: Assert that the treatment markup in visual-revision is byte-identical before and after the run. State that the visual-revision and visual-review fixtures start from a long-form article with a known presentation gap.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-07
EVIDENCE: AC-07 at docs/specs/blog-visual-reading.md:190 requires the editor to report the image as not matching its passage "from what the image shows". The proof at line 204 passes when "the image repair must describe the image as a launch dialog, not a plan review". The row fixes only the caption and the description ("captioned and described as a plan review"). It says nothing about the PNG's file name, its alt text or any other text the editor receives. The existing runner names fixture files freely (tests/vh-adlc/blog/run.ts at bda1a87). It also copies the driver, with all fixture strings, into the parent of every project directory (`cpSync(import.meta.filename, join(out, "driver.ts"))`). Suppose the file is named something like `launch-dialog.png`. An editor that never opens the image can then write "launch dialog, not a plan review" from the name alone. AC-07 ticks, and R-1 F-03 and R-3 F-01 asked this criterion to prove exactly the opposite.
PROPOSAL: Require the fixture's file name, alt text, caption, description and every other text input to avoid naming or hinting at a launch dialog. Say that the assertion is valid only under that condition.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: Line 204 lists four fixture parts: a real PNG, a same-meaning batch quote, "a 1,200-word candidate whose only treatment follows the last paragraph" and "a 2,500-word candidate with one pull quote after its second paragraph and no other break". The row does not say where the PNG or the repeated quote sits. Each candidate may hold only one treatment. So the PNG has to be the 1,200-word candidate's closing treatment, and the repeated quote has to be the 2,500-word candidate's pull quote. Put either one anywhere else and one of the four conditions breaks. The row also does not say whether the two candidates go to one editor dispatch, which returns a single `Verdict` block (Design line 161-166), or to two.
PROPOSAL: State that the PNG is the 1,200-word candidate's only treatment and the repeated quote is the 2,500-word candidate's pull quote. Also state whether one dispatch or two produces the asserted verdict.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design "The reading pass", AC-02
EVIDENCE: Design line 107 requires the pass only "For a new long-form article". Line 109 says an article below 800 words "may carry a no-visual exception with its reason". Nothing in the Design requires a short new article to have either a treatment or an exception. AC-02 at line 185 and its proof at line 199 fail a short article that has neither. The Owner summary at line 29 ("Shorter articles may record a reasoned no-visual exception instead") suggests the stronger rule but does not state it.
PROPOSAL: State in the Design that a new article below 800 words places a treatment or records a no-visual exception with a valid reason. Alternatively, loosen AC-02 to match the Design.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-06
EVIDENCE: Line 203 asserts that "the editor's input text" names none of "placement", "asset path", "provenance", "quote sources", "quote inventory" or "rendered evidence". The editor agent has no delimited input section. At bda1a87 the agent mentions its inputs in its first prose paragraph (agents/vh-adlc-blog-editor.agent.md:10-14). The Design also requires the editor to handle missing rendered checks and to judge treatment placement (lines 145-168). If the test scans the whole agent file, a correct sentence about missing rendered evidence or a misplaced treatment fails AC-06. If it scans less, the scanned part is undefined.
PROPOSAL: Say which text the AC-06 assertion scans in the editor agent, for example the paragraph that names what the editor reads, and keep the forbidden-word check to that span.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design "Editor", Acceptance Criteria, Test Plan
EVIDENCE: The editor flag list at lines 147-155 names nine checks. AC-07 (line 190) and its proof cover four of them: the missing body treatment, sustained runs, irrelevant images and repeated quotes. No criterion or proof has the editor flag an invalid no-visual exception, an illustration presented as product UI, illegible image text, missing alt text or captions, an unsupported screenshot or chart, or an inexact or unattributed quote. AC-05 (line 188) and AC-03 (line 186) cover only the writer side of some of these. An editor whose text omits those flags still ticks every box.
PROPOSAL: Add the untested flags to the AC-09 static assertions on the editor text, or add fixture cases to `visual-editor`. Otherwise mark them as guidance outside the criteria.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-07
EVIDENCE: The AC-07 proof at docs/specs/blog-visual-reading.md:204 says the assertion "is valid only because no text the editor can read names or hints at a launch dialog". It controls only fixture text and keeps the runner's assertion code out of readable directories. The editor's main input is not a fixture. The parent session writes the dispatch, and it carries the presentation inputs, including "each asset's file path, description and provenance" (line 132). Line 123 tells the writer to open each image before selecting it. In the existing runner, the parent session composes the editor dispatch ("Dispatch the packaged shared independent prose editor", tests/vh-adlc/blog/run.ts at bda1a87, `editor` prompt). So a parent that opens the PNG can write "launch dialog" into the dispatch, and an editor that never views the image can repeat it. The condition is also impossible as written. run.ts:11 resolves the repository checkout, and line 75 runs `codex exec ... -C project` with no read restriction, so the agent can read run.ts in the checkout and this document, which names the launch dialog at line 190. No step in the proof checks that the condition held in a given run.
PROPOSAL: Make the condition a runner check on the raw events. Fail the scenario if the editor's dispatch text names or hints at a launch dialog, or if the editor read run.ts, driver.ts or docs/specs. Also require evidence in the editor's own events that it opened the PNG.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: AC-07 at line 190 requires the editor to name all four problems "under `Presentation repairs`", and requires the quote to repeat a batch quote's meaning "in new words". The proof at line 204 only checks that each dispatch "names" its two problems, without saying which return line. It describes the quote only as "repeating the meaning of a quote in the supplied batch inventory". An editor could name a problem under `Exceptions` or `Copy repairs`, or the fixture could repeat the quote word for word, and the proof would still pass. The same-meaning check from Design line 125 would then never be tested.
PROPOSAL: Assert that each named problem appears on the `Presentation repairs` line. State that the fixture's repeated quote shares no sentence-length wording with the batch quote.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-06
EVIDENCE: The Design item at line 132 reads "each asset's file path, description and provenance". The AC-06 proof at line 203 forbids "asset path", and that string does not appear in the item's wording. A restatement such as "each asset's file path and description" contains none of the forbidden strings and passes. That leaves part of R-1 F-06 and R-2 F-11 open.
PROPOSAL: Match the forbidden terms to the Design's item wording, for example "file path" and "description" or a pattern covering "asset's file path". Alternatively, reword the item so that "asset path" is its exact term.

### R-6

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-07
EVIDENCE: The AC-07 proof at docs/specs/blog-visual-reading.md:204 bars "launch", "dialog" and "modal" from fixture files and from the editor's dispatch text. It also bars the editor from reading `run.ts`, `driver.ts` and `docs/specs/`. It does not cover the installed package text that the editor is told to read. Design line 137 makes the editor name "Presentation inputs" in `references/blog.md`. On the implementation branch, `git show 997b63d:plugins/vh-adlc/references/blog.md` lines 90-92 read "Inspect the actual image before selecting it: a launch dialog does not show a workspace overview, execution result or plan review." That is the exact contrast the proof asserts ("describe the image as a launch dialog, not a plan review"). Nothing in the Design or the criteria removes that sentence. An editor that sees a caption claiming a plan review, reads this reference and never looks at the PNG can produce the asserted repair from text alone. The read check is a denylist of three paths. `codex exec -C project` (run.ts:75) has no read restriction, so the editor can still read other repository files that name the subject. One example is `tests/vh-adlc/evidence/blog/README.md`, which this feature covers and will update with the new scenarios. Separately, the dispatch-word check fails the scenario on ordinary wording such as "launch the editor". The packaged editor agent itself contains "Launch wording" (997b63d agents/vh-adlc-blog-editor.agent.md:45).
PROPOSAL: Choose an image subject that no packaged or repository file names, and have the runner assert that the installed package text and fixture text contain none of the subject's words. Replace the read denylist with an allowlist: the editor may read only the project directory and the installed package.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-07
EVIDENCE: The AC-07 proof at line 204 says "The runner checks the raw events" and requires that "the editor's own events show it opened the PNG". In `tests/vh-adlc/blog/run.ts` at 7d44d21, the raw events file is only the `codex exec --json` stdout of the parent (lines 73-76). `events()` in `tests/vh-adlc/lifecycle/fixtures.ts:441-465` parses only `agent_message`, `command_execution` and `mcp_tool_call` items. The repository already reads a child agent's own tool calls from a different place. `tests/vh-adlc/lifecycle/native-review.ts:66-90` reads the child rollout logs under the profile's sessions directory, linked by `source.subagent.thread_spawn.parent_thread_id`. It gets the dispatch from the parent's `spawn_agent` arguments. `tests/vh-adlc/evidence/lifecycle/provenance.json` says "reviewer sessions stay in each run profile". The proof does not name this source. It also does not define "opened". A command such as `file x.png` or `ls`, or a text read of the PNG's bytes, mentions the path without showing the image. Under either reading the check can pass even though the editor never saw the image, which is the defect that R-1 F-03, R-3 F-01, R-4 F-01 and R-5 F-01 asked this proof to rule out.
PROPOSAL: State that the editor's dispatch text comes from the parent's `spawn_agent` arguments. State that the editor's reads come from its linked child rollout under the profile's sessions directory, as native-review.ts does. Define "opened the PNG" as an image-viewing tool call on that file path in the editor's own turn whose output carries the image, and say that a path mention or a text read does not count.

### R-7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-07
EVIDENCE: The AC-07 proof at docs/specs/blog-visual-reading.md:204 checks the editor's input only through "the editor dispatch text, taken from the parent's `spawn_agent` arguments". It passes when "the editor's own rollout has a `view_image` call on the PNG's path". It does not limit that call to the editor's own turns, and it does not require a dispatch without parent history. Codex 0.163.0 (`strings` on ~/.codex/packages/standalone/releases/0.163.0-x86_64-unknown-linux-musl/bin/codex) documents `fork_turns` as "Parent history to inherit. Defaults to `all`" and `fork_context` as "True forks the current thread history into the new agent". It also offers `followup_task` and `send_message` for later input to a running child. In the originating rollout, 8 of 20 `spawn_agent` calls that carry arguments omit `fork_turns`, 1 sets `all`, and the parent uses `followup_task` 87 times and `send_message` 59 times. tests/vh-adlc/lifecycle/native-review.ts notes that "A fork can replay its parent's metadata later; that inherited history is not its identity", and it counts only calls whose `turn_id` is the child's own. Take a parent that views the PNG to describe the asset for the presentation inputs, then dispatches the editor with default full history and a neutral message. The dispatch-text check passes. The replayed parent `view_image` call sits in the editor's rollout and satisfies the open check. The editor can then name a rainfall chart without ever viewing the image itself. That is the defect R-1 F-03 and R-3 F-01 through R-6 F-02 asked this proof to rule out. A replayed parent read outside the allowlist could also fail the scenario when the editor did nothing wrong. references/blog.md:142 at 997b63d already requires dispatch "in a separate context".
PROPOSAL: Make the scenario fail unless each editor spawn inherits no parent history (`fork_turns` set to `none`, or `fork_context` absent or false). Apply the word check to every message the editor receives, including `followup_task` and `send_message` payloads. Count the `view_image` call and the file reads only when they come from the editor's own turns, matched by `turn_id` as native-review.ts does.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-08
EVIDENCE: AC-08 at line 191 requires the editor to name the missing phone check "under `Presentation repairs`". The proof at line 205 says only "Assert `Pass`, the named phone check and its presence in the handoff". It does not say which return line must carry it. An editor that puts the missing phone check under `Exceptions` or `Copy repairs` would pass this proof. R-5 F-02 fixed the same gap for AC-07.
PROPOSAL: Assert that the missing phone check appears on the editor's `Presentation repairs` line.

### R-8

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan AC-07
EVIDENCE: The AC-07 proof at docs/specs/blog-visual-reading.md:204 fails the scenario unless "no text the editor receives, in its `spawn_agent` arguments or any `followup_task` or `send_message` payload to it, contains those words". Codex exec 0.163.0 does not record that text in readable form. In /home/m/code/.triage-review-archive/triage-r27-codex-lifecycle/profile/sessions/2026/10/26/rollout-2026-10-26T01-37-56-01a175a4-7af3-7fe3-bb96-563a1d963820.jsonl (session_meta originator codex_exec, cli_version 0.163.0, source exec), the spawn_agent arguments are {"task_name":"maintenance_review","fork_turns":"none","message":"gAAAAABq3qEU..."} and the send_message arguments are {"target":"maintenance_review","message":"gAAAAABq3qEl..."}. The linked child rollout 01a175a5 receives both as agent_message items whose payload is {"type": "encrypted_content", ...}. The same run's L06/events.jsonl from `codex exec --json` has collab_tool_call items only for `wait`, with "prompt": null. In the originating rollout, every message body of the 20 spawn_agent, 60 followup_task and 32 send_message function calls starts with "gAAAA". tests/vh-adlc/lifecycle/native-review.ts:87-90 reads only whether `model` is a key in the spawn arguments and never reads the message text. The runner therefore cannot read what the editor received. Either the check passes vacuously, which leaves undetected the leak that R-5 F-01 through R-7 F-01 asked this proof to rule out, or it can never pass, and then AC-07 cannot be met without a normative revision.
PROPOSAL: Replace the received-text clause with a check the rollouts support. For example, fail unless no turn outside the editor's own turns opened the PNG: no `view_image` call and no non-text read of it in the parent or another child. With the word-free fixture and package, nothing that reached the editor could then name the subject.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design "Editor", AC-07, AC-09
EVIDENCE: The AC-07 proof requires each editor spawn to have `fork_turns` set to `none`. The Codex 0.163.0 spawn_agent schema (`strings` on ~/.codex/packages/standalone/releases/0.163.0-x86_64-unknown-linux-musl/bin/codex) says "Parent history to inherit. Defaults to `all`; use `none` to start without parent history." Neither Design "Editor" (lines 143-168) nor any criterion says how the editor is dispatched. The only dispatch rule is plugins/vh-adlc/references/blog.md:95 at 7880566: "Dispatch `agents/vh-adlc-blog-editor.agent.md` in a separate context". In the originating rollout, 8 of the 20 spawn_agent calls under that kind of instruction omit `fork_turns` and 1 sets `all`. A writer that follows every Design rule can still dispatch a full-history fork. AC-07 then fails, and no specified package text exists to repair. A forked editor also inherits the writer's own reading of the image, which the Design's "judging relevance from the image and not from the writer's description" is meant to exclude. No AC-09 static assertion covers dispatch isolation.
PROPOSAL: State in the Design that the editor is dispatched without parent history (on Codex, `fork_turns` set to `none`). Add an AC-09 and blog.test.ts assertion for that sentence in references/blog.md or the skill entry.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: The proof requires "a `view_image` call on the PNG's path whose output carries the image" and checks "every file the editor read or listed". run.ts passes no model override (line 1 comment), so the run uses the configured model. ~/.codex/config.toml sets model = "gpt-6.1-sol", and ~/.codex/models_cache.json lists that model with tool_mode code_mode_only and multi_agent_version v2. In code-mode rollouts such as ~/.codex/sessions/2026/11/03/rollout-2026-11-03T02-38-53-01a19f0f-2933-7d51-82e4-2fcd89b17099.jsonl, image views never appear as a function_call named view_image. They appear only inside an `exec` custom_tool_call input, such as `const r=await tools.view_image({path:"..."});image(r.image_url);`, and the image reaches the model only when the code passes it to `image(...)`. Shell file reads also happen inside that `exec` code.
PROPOSAL: Say that a `tools.view_image` call on the PNG path inside one of the editor's own `exec` inputs counts when its output carries the image. Say that reads and listings are extracted from `exec` input text, as native-review.ts does with `payload.input`.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: The proof fails unless "every file the editor read or listed in its own turns ... lies inside the fixture project or the installed package". plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md:21 at 7880566 says "Use the given voice rules and resolved prose guide", and references/blog.md:46-47 names `guides/humanize-prose.md` "at the resolved revision". The binary keeps that page under ${XDG_CACHE_HOME:-$HOME/.cache}/vh-adlc/docs/<sha>/. tests/vh-adlc/blog/run.ts sets only CODEX_HOME in its env, so the cache is outside both allowed roots. An editor that reads the pinned guide would fail AC-07 even though nothing is wrong.
PROPOSAL: Copy the resolved guide into the fixture project and supply it in the dispatch, or add the resolved docs cache at the fixture's pin to both the read allowlist and the subject-word check.

### R-9

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-07
EVIDENCE: After R-8, the AC-07 proof at docs/specs/blog-visual-reading.md:204 no longer constrains any text that reaches the editor. It limits only what other turns do with the image ("no turn other than the editor's own, in the parent or any other child, viewed the PNG or read it by any non-text means;"). The read allowlist applies only to "every file the editor read or listed in its own turns". The proof then concludes: "With the fixture, package and docs free of the subject's words and no other turn having seen the image, nothing that reached the editor can name the subject." That conclusion depends on the parent reading nothing that names the subject, and the proof never checks this. Three readable sources name it. First, tests/vh-adlc/blog/run.ts:15 at 58e2a8f copies the driver into `out` (`cpSync(import.meta.filename, join(out, "driver.ts"))`), and `out` is the parent directory of every fixture project (line 43). The new driver has to contain "rainfall", "precipitation" and "weather" in order to run the word check. Second, run.ts:11 resolves the repository checkout, and this document names "a bar chart of monthly rainfall" at lines 190 and 204. Third, run.ts:75 runs `codex exec ... -C project` with no read restriction, and `gh repo view` reports michielvha/vh-adlc as PUBLIC. A parent that reads ../driver.ts or the spec and never views the PNG can put "rainfall chart" into its encrypted dispatch. The editor then views the PNG, which satisfies the open check, and can repeat the parent's words. AC-07 ticks even though the editor's verdict did not come from the image. R-5 F-01 through R-8 F-01 asked this proof to rule out exactly that leak, and the R-8 revision reopened it by dropping the received-text check without moving the read restriction to the other turns.
PROPOSAL: Apply the same read and listing allowlist (fixture project, installed package, docs cache at the pin) to every turn in the scenario, including the parent and any other child, and fail on any network fetch in those turns. Alternatively, keep the subject words out of every readable file by holding the word list outside `out` and the checkout, for example as hashes, and state which of these two approaches the proof relies on.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: The pre-run word check at line 204 covers "the PNG's file name, alt text, caption and description, the other fixture files, every file of the installed package and the resolved docs cache". It does not cover the bytes of the PNG itself. A PNG can carry tEXt, iTXt or zTXt chunks, such as a title naming monthly rainfall, and a text read such as `strings` exposes them. The proof explicitly allows other turns to text-read the PNG ("a text read of the PNG does not count as viewing it"), so the parent can learn the subject from metadata without tripping any check. The proof also does not define "read it by any non-text means" in terms the runner can detect from shell and `exec` input text. It does not say, for example, whether a Python or OCR command that names the PNG path counts.
PROPOSAL: Require the fixture PNG to carry no text chunks, or include its raw bytes in the word check. Define the forbidden non-editor access as any `view_image` or `tools.view_image` call, or any command or `exec` input other than a listing that names the PNG path.

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-07
EVIDENCE: The AC-07 proof at docs/specs/blog-visual-reading.md:204 fails the scenario unless "every file any turn in the scenario, the parent's and every child's, read or listed lies inside the fixture project, the installed package or that docs cache". It also says "Reads and listings are taken from shell commands and from `exec` input text". It never says which commands count as reads, or how the runner extracts their path operands. The blog skill tells every run to touch a path outside those three roots. plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md:11-13 at ba8b3de says "Resolve the verified binary with `scripts/ensure-vh-adlc.sh` through Bash, then request ... with `knowledge`". ensure-vh-adlc.sh:4-6 returns a PATH binary or the user cache entry, so the path is /usr/local/bin/vh-adlc or ~/.cache/vh-adlc/bin/<version>/<platform>/vh-adlc. Neither is in the docs cache ~/.cache/vh-adlc/docs/<pin>. A native Codex parent shows this shape. In /home/m/code/.triage-review-archive/test-tmp/triage-generic-intake-codex-83HhdM/client/control-profile/sessions/2026/10/26/rollout-2026-10-26T01-00-32-01a17582-3da0-7573-9378-138b6f6854ac.jsonl, the parent's `exec` inputs include `/home/m/.cache/vh-adlc/bin/0.1.0/linux_amd64/vh-adlc knowledge --repo ...` and `cat /tmp/vh-triage-intake-inventory.json`. A runner that treats every absolute path in command text as a read fails every run that follows the skill. A runner that skips executed paths is a reading the proof does not define. Either way, the implementer has to choose the check's real boundary, and the owner never reviewed that choice.
PROPOSAL: Define the read and listing extraction, for example by naming the commands and operands it parses. Explicitly allow running the verified binary path that ensure-vh-adlc.sh prints. Also say whether the parent's own scratch files outside the fixture count as out-of-bounds reads.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: The proof at line 204 reads the parent and "its linked child rollouts". It applies its rules to "each editor `spawn_agent` call", "no turn other than the editor's own" and "one of the editor's own turns". It also says the text sent to a child is encrypted, so the runner cannot use the dispatch message to tell which children are editors. The proof does not say how the runner identifies an editor child. Suppose the editor is defined as whichever child viewed the PNG. A helper child could then view the PNG and report "rainfall chart" back to the parent. The parent could pass that to a second child that also views it, and both children would count as editors. The pre-run word check also omits the scenario prompt, which the runner writes into the parent. That prompt lives in the driver, which by R-9 F-01 contains the subject words. The closing claim, "nothing that reached the editor can name the subject", does not account for that channel.
PROPOSAL: Identify editor children by an observable mark, for example own turns that read `agents/vh-adlc-blog-editor.agent.md` in the installed package and a final message that starts with `Verdict:`. Treat every other linked child as non-editor. Add the scenario prompt text to the pre-run word check.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-01, AC-03, AC-04, AC-05
EVIDENCE: Several proofs depend on recognizing markup. Line 198 asserts "at least one treatment with body paragraphs both before and after it". Line 200 checks that each added quote's "markup names the author". Line 201 requires "the article's image, figure and quote markup is byte-identical". The Design at line 141 has the writer use "the destination's existing image, caption, quote and code components". The current fixture AGENTS.md written by tests/vh-adlc/blog/run.ts:45 declares only frontmatter and destinations, not image, figure or pull-quote syntax. The proofs do not say which syntax the runner parses. Without it, a runner can count a quoted command or any blockquote as a pull quote, or it can miss an HTML or MDX component the writer chose. AC-05 at line 188 also says "every image any run adds has alt text and a caption", but the proof at line 202 checks only `visual-new`, `visual-presentation` and `visual-illustration`. It does not check `visual-short`, which may place a treatment under AC-02.
PROPOSAL: Have the visual fixtures declare the destination's image, caption and pull-quote markup, with attribution, in their AGENTS.md, and have the runner parse only that markup. Add `visual-short` to the AC-05 alt-text and caption assertion, or narrow AC-05 to the scenarios it names.

### R-11

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-09, Test Plan AC-09, Context "Owner summary"
EVIDENCE: AC-09 at docs/specs/blog-visual-reading.md:192 requires that "CI, which runs that file, passes on the PR head". The AC-09 proof at line 208 is "`gh pr checks 75` on the head". The owner summary at line 46 says "Acceptance authorizes implementing this and committing on `feat/blog-visual-reading`. Pushing to update PR #75 needs a ship request". At e74edb1, plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:17 says implementation "is not authority to push that branch", and plugins/vh-adlc/skills/vh-adlc-review/SKILL.md:67 says "Do not push". plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:61 runs `vh-adlc gate complete` before line 77 pushes the branch, and the complete gate requires `all_met` and `impl_review_clean`. `gh pr view 75` reports head 997b63d, which carries none of the implementation. Under the normal loop, an implementation review can only return AC-09 as `not verified`, because no commit with the change reaches PR #75 before ship. Ship then stops at the complete gate before it pushes. The feature can complete only if the owner first asks for an in-progress ship (ship SKILL.md:67) and then for a second review and a second ship. The owner summary never mentions that extra step.
PROPOSAL: State in the owner summary and the Test Plan that AC-09's CI evidence comes after an owner-requested in-progress push to PR #75 and before the final implementation review. Alternatively, limit AC-09 to evidence that can be observed before ship and make CI a ship-time check.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design "Editor", Test Plan AC-07
EVIDENCE: The AC-07 proof at line 206 says "An editor child is a linked child whose own turns read `agents/vh-adlc-blog-editor.agent.md` in the installed package and whose final message starts with `Verdict:`; every other linked child is a non-editor." The Design at line 145 requires only that the writer dispatch the editor "without parent history" (`fork_turns` set to `none`). Neither the Design nor any criterion requires the editor child to read its own agent file. Neither package manifest declares agents (`git show e74edb1:plugins/vh-adlc/plugin.json`), so on Codex a parent must either point the child at the file or paste the file's text into the encrypted message. A parent that pastes the text still dispatches a correctly isolated editor. The runner then finds no editor child, so AC-07 fails, and no specified package text exists to repair.
PROPOSAL: State in the Design, and assert in AC-09 for `references/blog.md` or the skill entry, that the dispatch tells the editor to read `agents/vh-adlc-blog-editor.agent.md` from the installed package itself.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: Line 206 says "The runner sets `TMPDIR` to a directory inside the fixture project, so scratch files stay in bounds." At e74edb1, tests/vh-adlc/blog/run.ts:90-92 fails `onlyAuthorizedPaths` when `git ls-files --others --exclude-standard` lists any path outside an allow set, and that set is empty for review cases. The Design at line 114 says a review-only run "changes no file". Any scratch file written under that TMPDIR therefore fails the scenario or breaks the review-only rule. TMPDIR also does not redirect a hard-coded path such as `/tmp/x`, so the claim that scratch "stays in bounds" is overstated. Separately, the proof treats "any token ... after the command name" as a read, but it does not say how a chained command is split. In `cd <fixture> && /usr/local/bin/vh-adlc knowledge ...`, the binary path comes after the first command name, so the runner would count it as an out-of-bounds read. The proof also does not name the command in a code-mode `exec` input, which is JavaScript text.
PROPOSAL: Exclude the TMPDIR directory from the changed-path and unchanged-file checks, for example through `.git/info/exclude` and the fingerprint, and drop the "stay in bounds" claim. Define the command name per simple command after splitting on `&&`, `||`, `;`, `|` and `$(...)`, and say how `exec` input is tokenized.

### R-12

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-09, Test Plan AC-09
EVIDENCE: AC-09 at docs/specs/blog-visual-reading.md:192 ends: "CI on the pushed head is a ship-time check: ship reports it, and a failing run blocks the merge." This sentence is part of the criterion text that an implementation review must return verbatim and decide. conventions/feature-documents.md at d8f07c9 says "A passing subset never upgrades a composite criterion." The AC-09 proof at line 208 says "`gh pr checks 75` after the ship push is reported by ship and is not review evidence." The ship-push and merge-blocking clause therefore has no check that an implementation review can run. A strict reviewer has to return AC-09 as `not verified` or `untested`. That fails `impl_review_clean` and `all_met`, and ship stops at the complete gate before it pushes. The R-11 F-01 fix moved CI to ship but left the ship-time statement inside the criterion.
PROPOSAL: Remove the CI sentence from the AC-09 text and keep it in the Owner summary and the Test Plan note as a ship-time condition. AC-09 then contains only end states that can be observed before ship.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-07 (line 196 fixture note and line 206)
EVIDENCE: The AC-07 proof fails the scenario if "no turn makes a network fetch or web search" does not hold. It never defines how the runner detects a fetch. tests/vh-adlc/blog/run.ts:45 at 03b3009 writes every fixture `AGENTS.md` starting with "Read https://github.com/vhco-pro/docs/blob/${pin}/AGENTS.md.". The line 196 note adds markup declarations to that file but does not remove this line. Native Codex 0.163.0 parents follow this kind of line by fetching it. In /home/m/code/.triage-review-archive/triage-r25-existing-routes/profile/sessions/2026/10/25/rollout-2026-10-25T22-42-13-01a17503-9b99-7c92-9e15-17c10d4079e1.jsonl (source exec), the exec input at record 19 runs `curl -fsSL https://raw.githubusercontent.com/vhco-pro/docs/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md`. In that archive, 52 of 121 exec parent rollouts whose fixture carries the same "Read https://github.com/vhco-pro/docs/blob/" line contain such a fetch. A correct `visual-editor` run can therefore fail AC-07 on a benign fetch of the pinned, word-free docs. Removing the line would also change which pin `vh-adlc knowledge` resolves (lint at X reports `"source":"repository","pin_files":["AGENTS.md"]`), and that moves "the resolved docs cache at the fixture's pin".
PROPOSAL: Define a network fetch, for example a `web_search` call or a URL operand to curl, wget or fetch. Explicitly allow fetches of `github.com` and `raw.githubusercontent.com` paths under `vhco-pro/docs` at the fixture's pin. Alternatively, state that the visual fixtures declare their pin in a form the binary reads but that does not invite a fetch.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-07
EVIDENCE: Line 206 says "In a code-mode `exec` input, every string literal is a word ... any other literal that resolves to an existing path is a read". The literal "/" resolves to the root directory, so a turn that runs `s.split("/")` or `p.startsWith("/")` would count as listing a path outside the allowlist. This pattern is common. In ~/.codex/sessions/2026/11/03/rollout-2026-11-03T02-38-53-01a19f0f-2933-7d51-82e4-2fcd89b17099.jsonl, 38 of 3005 `exec` inputs contain a bare "/" string literal, for example `d.split('/').at(-1)` and `p.split('/')[0]`. A parent or editor that parses Markdown paths or counts words this way would fail AC-07 with no out-of-bounds read.
PROPOSAL: Exclude "/", "." and ".." literals that are not arguments to a file or shell call. Alternatively, count a non-shell literal only when it is passed to a known file-reading call such as `readFile`, `open` or `tools.view_image`.

## Sources

- `plugins/vh-adlc/references/blog.md`, `plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md`, `plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md` and `tests/vh-adlc/blog.test.ts` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- `docs/specs/blog-authoring.md` lines 96 and 119 at the same commit.
- `tests/vh-adlc/blog/run.ts` and `tests/vh-adlc/evidence/blog/README.md` at the same commit.
- PR #75, `feat/blog-visual-reading` at `997b63d`, and its independent PR review in this session.
- Local Codex session `rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`, entries at 2026-10-29T17:27, 21:37 and 21:41.
- Engineering docs at `d8f07c9dd69038375a535af8ad586086688f85ab`: `conventions/feature-documents.md`, `guides/feature-document-template.md`, `guides/humanize-prose.md`.
