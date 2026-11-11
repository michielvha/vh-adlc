---
status: draft
status_description: "Revised after R-1; awaiting re-review."
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

After this change, every new long-form article (800 words of body prose or more) gets a visual reading pass. The writer places story-specific illustrations, relevant product images or exact attributed quotes from the author's own notes where they help the reader. It never adds filler to meet a quota, never invents quotes, charts or customer outcomes, and never passes off an illustration as product UI. Shorter articles may record a reasoned no-visual exception instead. "No assets were supplied" is not a valid reason while a pull quote is available.

Revisions that only change wording, and review-only runs, keep the current conservative behavior. They report presentation gaps as findings. A presentation revision, such as backporting visuals to older articles, adds treatments and leaves the prose byte-identical.

The editor opens each actual image, gains a fourth return line, `Presentation repairs`, and checks that pull quotes don't repeat a point already quoted in the batch or related articles.

Why there is a conflict: the in-progress blog-authoring spec says to add visuals "only when they solve an explanation problem" and fixes a three-line editor return. This document replaces exactly those two rules. Blog-authoring's Context gets a pointer here; its scope, criteria and status stay unchanged.

Three defaults were set under the owner's standing instruction to take the recommended option. You can reject any of them at acceptance:

- No-visual exceptions are allowed only below 800 words.
- Missing rendered checks are reported in the handoff but don't fail the editor's `Pass` on their own, because rendering isn't available on every host.
- New image files, raster or SVG, are created only when the request or adopter instructions permit it. Otherwise the writer uses supplied assets and pull quotes.

Proof will come from static contract tests and six new native Codex scenarios in the existing blog runner. None has run yet. Acceptance authorizes implementing this and committing on `feat/blog-visual-reading`. Pushing to update PR #75 needs a ship request, and merging needs the owner's separate approval.

### Background

On main at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`, `plugins/vh-adlc/references/blog.md:55-56` says "Use actual assets; add a visual when it explains something the prose cannot show well." The editor's return block at `plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md:38-40` has three lines: `Verdict`, `Copy repairs` and `Exceptions`. Its description at line 3 calls it a "prose editor". `plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md:24` says the editor "reviews prose, not gates". `tests/vh-adlc/blog.test.ts:37` asserts that the editor text contains `Copy repairs`.

`docs/specs/blog-authoring.md` is `in-progress` with AC-03 unverified and `branch: feat/blog-authoring`. That branch no longer exists: `git ls-remote --heads origin feat/blog-authoring` and `git branch --list feat/blog-authoring` both return nothing. Its Draft and handoff design (line 96) says to "add visuals only when they solve an explanation problem", and its AC-09 (line 119) defines the editor's verdict, repairs and exceptions return. It covers the same blog files as this document.

The originating request is in the local Codex session `~/.codex/sessions/2026/10/27/rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`. At 2026-10-29T17:27 the assistant reported "I missed the visual composition pass". At 21:37 the owner replied: "You need to change the blog agents so I don't have to remind you to do these things in the future", asked that adjacent tools such as OTF and Atlantis not be listed, and asked to "backport this visual stuff into the other articles". The same session wrote the shared change at 21:41 on `feat/blog-visual-reading`; it stayed uncommitted until commit `8205531` preserved it.

PR #75 (`git diff origin/main...997b63d`) adds a "Compose the reading experience" section and comparator guidance to `references/blog.md`, presentation review and a `Presentation repairs` line to the editor, a visual-pass sentence and extra dispatch inputs to the skill entry, and a paragraph to `docs/user-guides/workflows.md`. Its independent PR review asked for changes. It found the conflict with blog-authoring, an unconditional pass that would also add visuals during wording-only revisions, image generation without a permission rule, inputs listed differently in three places, no rendering fallback in the skill entry, and an editor still described as prose-only.

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

`references/blog.md` gains a "Compose the reading experience" section. For a new long-form article, the writer composes the page before handoff, including founder stories and opinion pieces with no technical diagram. It places at least one treatment, more where the length calls for it, at points that break sustained prose. Headings and short paragraphs alone do not complete the pass. Placement follows the story, without a fixed image count or one template for every article.

An article below 800 words may carry a no-visual exception with its reason. These are never valid reasons: the lack of a technical diagram, and missing assets while the author's notes or article contain a quotable point.

Revisions fall into three kinds:

- A wording-only revision or exact-wording request changes no treatment. It reports presentation gaps as findings.
- A review-only run changes no file and reports presentation gaps as findings.
- A presentation revision adds, moves or replaces treatments and leaves every prose line and exact-wording span byte-identical.

### Asset and quote integrity

The writer uses supplied assets when they fit. Copying a supplied asset unchanged into the destination is not creating an image. Creating or editing any image file, raster or vector including SVG, needs permission in the owner's request or the adopter's instructions. With permission it uses the host's image capability inside the authorized destination. Without it the writer uses supplied assets, pull quotes or other supported treatments, and reports any missing asset.

A conceptual illustration's caption or alt text identifies it as an illustration and never presents it as product UI. A customer quote, usage chart or benchmark is never invented. Before selecting an image, the writer opens it and matches its visible screen, state and controls to the nearby passage; a new caption does not make an unrelated screenshot relevant. Demo captures are described as demos.

A pull quote comes word for word from the author's notes or the article, keeps its qualifications and carries attribution. It highlights an article-specific point. The writer compares it with the current batch and related articles for the same meaning as well as the same words, and picks another supported point or leaves ordinary prose when emphasis adds nothing. Essential information stays in selectable text. Every image has alt text and a caption.

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

The editor's description and the skill entry describe it as a prose and presentation editor. It reads the presentation inputs and opens each image file itself, judging relevance from the image and not from the writer's description or caption. It flags:

- long-form articles without a treatment;
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

A missing rendered check is listed under `Presentation repairs` but does not by itself make the verdict `Needs revision`.

### Handoff and documentation

The handoff reports treatments placed, no-visual exceptions and rendered checks, or their limits, including every unverified check the editor named. `docs/user-guides/workflows.md` describes the pass, the 800-word threshold, and states that pull quotes must differ from those in the current batch or related articles.

### Comparator guidance

For comparison articles, the writer picks comparators for the reader's job and the article's scope. Research does not have to become a public list of every adjacent tool. Dropping an irrelevant comparator does not support an exclusive market claim.

### Packaging

Both package manifests move to 0.17.0, the version PR #75 already carries. `tests/vh-adlc/check.test.ts:224-232` checks only that the version differs from main; the sequencing before the SEO change at 0.18.0 is a choice. No new skill, agent or binary change is added.

## Acceptance Criteria

- [ ] AC-01: A new long-form article run whose notes contain quotable points hands off at least one placed treatment, each with the point it serves.
- [ ] AC-02: A new article run below 800 words either places a treatment or records a no-visual exception whose reason is neither a missing diagram nor missing assets.
- [ ] AC-03: Without permission for new images, a new article run leaves every image file in the destination identical to a supplied asset, and every pull quote it adds appears word for word in the author's notes or article with attribution.
- [ ] AC-04: A presentation revision adds at least one treatment and leaves every prose line and exact-wording span byte-identical; a wording-only revision changes no treatment; a review-only run changes no file; and the last two report presentation gaps as findings.
- [ ] AC-05: Any illustration a run adds has a caption or alt text that identifies it as an illustration and not product UI, and every added image has alt text and a caption.
- [ ] AC-06: `references/blog.md` has a "Presentation inputs" list with the five items, and the skill entry and editor name that list without restating its items.
- [ ] AC-07: Given a real launch-dialog image whose caption and description claim a plan review, and a pull quote that repeats a batch quote's meaning in new words, the editor returns `Needs revision` and names both under `Presentation repairs`.
- [ ] AC-08: Given sound prose and presentation with only phone evidence missing, the editor returns `Pass` and names the missing check under `Presentation repairs`, and the handoff repeats it. When rendering is unavailable, the handoff says presentation is unverified and makes no rendered-review claim.
- [ ] AC-09: The editor description says "prose and presentation"; the editor return has the four lines above; the skill entry states the rendering fallback and per-theme check; `references/blog.md` has the comparator guidance, the 800-word threshold and the handoff line for treatments, exceptions and rendered checks; the user guide states the batch-or-related quote rule; these files use the Terminology terms; blog-authoring's Context points here; and both manifests carry 0.17.0. `bun test tests/vh-adlc` passes locally apart from the known fixtures digest failure, and CI passes on the PR head.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Native `visual-new` scenario in `tests/vh-adlc/blog/run.ts`: founder-style notes of about 1,200 words with quotable lines, one supplied relevant PNG, no renderer and no image permission. Assert at least one treatment in the draft and a point for each in the handoff. |
| AC-02 | Native `visual-short` scenario: notes for a 400-word piece. Assert either a treatment or an exception whose reason does not mention a diagram or missing assets. |
| AC-03 | `visual-new` run: hash every `png`, `jpg`, `jpeg`, `gif`, `webp`, `avif` and `svg` file in the fixture after the run and assert each matches a supplied asset; check each added quote verbatim against the notes file. |
| AC-04 | Native `visual-presentation` scenario on an existing article with a protected span: diff shows added treatment markup and every original prose line unchanged. Native `visual-revision` (wording-only) and `visual-review` (review-only) scenarios: the first adds or moves no image, figure or quote markup, the second changes no file, and both handoffs list the gap. |
| AC-05 | `visual-new` and `visual-presentation` runs: every added image has alt text and a caption, and any non-supplied or conceptual image is labelled as an illustration. |
| AC-06 | `tests/vh-adlc/blog.test.ts` asserts the heading and five items in `references/blog.md`, that the skill entry and editor contain "Presentation inputs", and that neither contains "provenance", "quote inventory" or "rendered evidence". |
| AC-07 | Native `visual-editor` scenario: a real PNG showing a launch dialog, captioned and described as a plan review, and a batch inventory with a same-meaning quote. Assert the verdict and both named repairs. |
| AC-08 | Native `visual-editor-pass` scenario: clean candidate with desktop evidence only. Assert `Pass`, the named phone check and its presence in the handoff. The `visual-new` handoff contains the unverified statement and no rendered-review claim. |
| AC-09 | `blog.test.ts` assertions for each named statement and term, and for the pointer in `docs/specs/blog-authoring.md`; `tests/vh-adlc/check.test.ts` for the version; `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc --timeout 60000` locally; `gh pr checks 75` on the head. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The three defaults in the owner summary were set under the owner's standing instruction of 2026-11-10 to take the recommended option, and are confirmed or rejected at acceptance.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-11 | R-1 | spec | `70f88db` | unknown | procedural | 10 findings: 1 blocking, 7 should-fix, 2 nits; model identity not attested |

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

## Sources

- `plugins/vh-adlc/references/blog.md`, `plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md`, `plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md` and `tests/vh-adlc/blog.test.ts` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- `docs/specs/blog-authoring.md` lines 96 and 119 at the same commit.
- `tests/vh-adlc/blog/run.ts` and `tests/vh-adlc/evidence/blog/README.md` at the same commit.
- PR #75, `feat/blog-visual-reading` at `997b63d`, and its independent PR review in this session.
- Local Codex session `rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`, entries at 2026-10-29T17:27, 21:37 and 21:41.
- Engineering docs at `d8f07c9dd69038375a535af8ad586086688f85ab`: `conventions/feature-documents.md`, `guides/feature-document-template.md`, `guides/humanize-prose.md`.
