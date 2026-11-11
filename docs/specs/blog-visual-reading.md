---
status: draft
status_description: "Being written; not yet reviewed."
issue: null
goal: "Long-form articles reach the owner with a checked visual reading pass, and the editor reviews presentation as well as prose."
covers:
  - plugins/vh-adlc/references/blog.md
  - plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md
  - plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - tests/vh-adlc/blog.test.ts
  - tests/vh-adlc/blog/
  - tests/vh-adlc/evidence/blog/
---

# Plan: Blog visual reading pass

Make the shared blog writer compose each new long-form article as a page, with relevant images or exact author pull quotes, and make the independent editor review that presentation before the owner sees the draft.

## Context

### Owner summary

The blog operation currently treats visuals as optional. It adds one only when prose cannot explain something, so founder stories and opinion pieces arrive as long walls of text. On 29 October the owner had to ask for visuals and pull quotes on Stackweaver articles by hand, then asked for the blog agents to be changed "so I don't have to remind you to do these things in the future". That change exists on `feat/blog-visual-reading` (PR #75) but was never specified or reviewed. This document specifies it and the fixes an independent PR review asked for.

After this change, every new article gets a visual reading pass. The writer places story-specific illustrations, relevant product images or exact attributed quotes from the author's own notes where they help the reader, or records why the article needs none. It never adds filler to meet a quota, never invents quotes, charts or customer outcomes, and never passes off an illustration as product UI. It generates images only when the owner or the adopter's instructions allow it. It checks the rendered page on desktop and phone in each supported theme, and says plainly when rendering was not available.

Revisions, exact-wording requests and review-only runs keep their current conservative behavior. They report presentation gaps as findings and add visuals only when the request asks for presentation work.

The editor gains a fourth return line, `Presentation repairs`. It checks that each image shows what its passage discusses and that pull quotes don't repeat a point already quoted in the current batch or related articles. Unverified rendering checks are named in that line and in the handoff, but they don't by themselves turn a `Pass` into `Needs revision`.

This replaces part of the in-progress blog-authoring design: its "add visuals only when they solve an explanation problem" rule and its three-line editor return. Nothing else in blog-authoring changes, and no publication authority is added.

Proof will come from static contract tests and new native Codex scenarios in the existing blog runner. None of these checks has run yet. Acceptance authorizes implementing this on `feat/blog-visual-reading` and updating PR #75; merging still needs the owner's request.

### Background

On main at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`, `plugins/vh-adlc/references/blog.md:55-56` says "Use actual assets; add a visual when it explains something the prose cannot show well." The editor's return block at `plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md:38-40` has three lines: `Verdict`, `Copy repairs` and `Exceptions`. Its description at line 3 calls it a "prose editor". `plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md:24` says the editor "reviews prose, not gates". `tests/vh-adlc/blog.test.ts:37` asserts that the editor text contains `Copy repairs`.

`docs/specs/blog-authoring.md` is `in-progress` with AC-03 unverified. Its Draft and handoff design (line 96) says to "add visuals only when they solve an explanation problem", and its AC-09 (line 119) defines the editor's verdict, repairs and exceptions return. It covers the same blog files as this document.

The originating request is in the local Codex session `~/.codex/sessions/2026/10/27/rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`. At 2026-10-29T17:27 the assistant reported "I missed the visual composition pass". At 21:37 the owner replied: "You need to change the blog agents so I don't have to remind you to do these things in the future", and asked that adjacent tools such as OTF and Atlantis not be listed. The same session wrote the shared change at 21:41 on `feat/blog-visual-reading`; it stayed uncommitted until commit `8205531` preserved it.

PR #75 (`git diff origin/main...997b63d`) adds a "Compose the reading experience" section and comparator guidance to `references/blog.md`, presentation review and a `Presentation repairs` line to the editor, a visual-pass sentence and extra dispatch inputs to the skill entry, and a paragraph to `docs/user-guides/workflows.md`. Its independent PR review asked for changes. It found the conflict with blog-authoring, an unconditional pass that would also add visuals during wording-only revisions, image generation without a permission rule, inputs listed differently in three places, no rendering fallback in the skill entry, and an editor still described as prose-only.

`tests/vh-adlc/blog/run.ts` runs native Codex scenarios against an installed copy of the package in a disposable profile and checks outputs and authorized destinations. `tests/vh-adlc/evidence/blog/README.md` records nine passing scenarios from 29 October.

## Scope

In scope:

- The visual reading pass for new articles, and the revision rule for existing ones.
- Asset and quote integrity, including when generated images are allowed.
- One shared list of presentation inputs used by the writer, the skill entry and the editor.
- The editor's presentation review and its `Presentation repairs` return line.
- Rendering checks per viewport and supported theme, with an explicit fallback.
- Comparator selection guidance for comparison articles.
- User guide text, the package version bump, static tests and native scenarios.

Out of scope:

- Changing any adopter's site, renderer, theme or components.
- Backporting visuals into existing published articles. An owner can request that as a presentation revision.
- New image tooling, a stock-image source, or a mandatory image count.
- Publication, scheduling or social posting authority.
- Blog-authoring's other rules, its AC-03 residual and its status.

## Design

### Relationship to blog-authoring

This document replaces two parts of `docs/specs/blog-authoring.md`. The rule at line 96, "add visuals only when they solve an explanation problem", gives way to the reading pass below. Its rule against visuals "solely to decorate" still holds: a treatment must serve a named point. AC-09's return gains `Presentation repairs`. Blog-authoring's text is left as written and its status unchanged. This document is the current authority for presentation.

### The reading pass

`references/blog.md` gains a "Compose the reading experience" section. For a new article, the writer composes the page before handoff, including founder stories and opinion pieces with no technical diagram. It breaks sustained prose with a story-specific illustration, a relevant product image, an exact author pull quote or another treatment the destination supports. Headings and short paragraphs alone do not complete the pass. Placement follows the story, without a fixed image count or one template for every article. The writer may record a deliberate no-visual exception, with its reason, for an article of any length. The lack of a technical diagram is not a reason.

Existing-article revisions, exact-wording requests and review-only runs keep blog-authoring's conservative rule. They report presentation gaps as findings and add or move treatments only when the request asks for presentation work. When it does, surrounding prose stays as it is.

### Asset and quote integrity

The writer uses existing assets when they fit. It creates or edits raster images only when the owner's request or the adopter's instructions permit generated images, and then through the host's image capability inside the authorized destination. Without that permission it uses existing assets, pull quotes or other supported treatments, and reports any missing asset.

A conceptual illustration is never presented as product UI. A customer quote, usage chart or benchmark is never invented. Before selecting an image, the writer inspects it and matches its visible screen, state and controls to the nearby passage; a new caption does not make an unrelated screenshot relevant. Demo captures are described as demos.

A pull quote comes word for word from the author's notes or the article, keeps its qualifications and carries attribution. It highlights an article-specific point. The writer compares it with the current batch and related articles for the same meaning as well as the same words, and picks another supported point or leaves ordinary prose when emphasis adds nothing. Essential information stays in selectable text, with alt text and captions.

### Presentation inputs

`references/blog.md` defines one list of presentation inputs:

- each placement and the point it serves;
- asset descriptions and provenance;
- quote sources;
- the quote inventory of the current batch or related articles;
- rendered evidence for each viewport and supported theme, or a statement of what is missing.

The skill entry's editor dispatch and the editor agent refer to this list by name instead of restating it.

### Rendering checks

The writer inspects the destination's existing image, caption, quote and code components and keeps article presentation out of reusable renderer internals. It checks the rendered page on desktop and phone in each theme the site supports: spacing, contrast, legible image text, loading and overflow, plus existing zoom and navigation when used. When rendering is unavailable it reports presentation as unverified and names the missing assets. A Markdown-only inspection is never called a rendered review. The skill entry states this fallback and the theme requirement.

### Editor

The editor's description and the skill entry describe it as a prose and presentation editor. It reviews the presentation inputs alongside the prose. It flags walls of prose without an accepted exception, filler, irrelevant images, illegible image text, missing alt text or captions, unsupported screenshots or charts, inexact or unattributed quotes, and quotes that repeat a point from the batch or related articles. It asks for the smallest presentation repair, keeps useful existing visuals and never returns a replacement article.

Its return becomes:

```text
Verdict: Pass | Needs revision
Copy repairs: ...
Presentation repairs: Visual or reading-flow repairs and unverified rendered checks, or None.
Exceptions: ...
```

A missing rendered check is listed under `Presentation repairs` but does not by itself make the verdict `Needs revision`.

### Handoff and documentation

The handoff reports visual changes, recorded no-visual exceptions and rendered checks, or their limits, including every unverified check the editor named. `docs/user-guides/workflows.md` describes the pass and states that pull quotes must differ from those in the current batch or related articles.

### Comparator guidance

For comparison articles, the writer picks comparators for the reader's job and the article's scope. Research does not have to become a public list of every adjacent tool. Dropping an irrelevant comparator does not support an exclusive market claim.

### Packaging

Both package manifests take the next minor version under the repository's version policy, sequenced against any other open package change. No new skill, agent or binary change is added.

## Acceptance Criteria

- [ ] AC-01: A new long-form article run hands off either placed treatments, each with the point it serves, or a recorded no-visual exception with a reason other than the lack of a technical diagram.
- [ ] AC-02: Without permission for generated images, a new article run creates no image files, and every pull quote it adds appears word for word in the author's notes or article with attribution.
- [ ] AC-03: A wording-only revision of an existing article adds or moves no visual treatment and reports presentation gaps as findings.
- [ ] AC-04: `references/blog.md` defines the presentation inputs once, and the skill entry and editor refer to that list instead of restating different inputs.
- [ ] AC-05: Given an irrelevant screenshot and a pull quote that repeats a batch quote's meaning in new words, the editor returns `Needs revision` and names both under `Presentation repairs`.
- [ ] AC-06: Given sound prose and presentation with only phone evidence missing, the editor returns `Pass` and names the missing check under `Presentation repairs`, and the handoff repeats it.
- [ ] AC-07: When rendering is unavailable, the handoff says presentation is unverified and does not call a Markdown inspection a rendered review.
- [ ] AC-08: The editor description, skill entry, handoff guidance, comparator guidance and user guide state the behavior in this document; both manifests carry the same new version; the package checks pass.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Native `visual-new` scenario in `tests/vh-adlc/blog/run.ts`: founder-style notes with no diagram material and no renderer. Inspect the handoff for placements with their points or a reasoned exception that does not cite a missing diagram. |
| AC-02 | Same `visual-new` run with instructions that do not permit generated images. Compare the fixture tree before and after for new image files, and check each added quote verbatim against the notes file. |
| AC-03 | Native `visual-revision` scenario: an existing wall-of-prose article with a wording-only request. Diff shows no added or moved image, figure or quote markup, and the handoff lists the presentation gap. |
| AC-04 | `tests/vh-adlc/blog.test.ts` asserts the named list and its five items in `references/blog.md`, and asserts that the skill entry and editor reference it by name. |
| AC-05 | Native `visual-editor` scenario: candidate with a launch-dialog screenshot captioned as a plan review, and a batch inventory containing a quote with the same meaning. Assert the verdict and both named repairs. |
| AC-06 | Native `visual-editor-pass` scenario: clean candidate, desktop evidence only. Assert `Pass`, the named missing phone check, and its presence in the handoff. |
| AC-07 | `visual-new` handoff contains the unverified statement and no rendered-review claim; `blog.test.ts` asserts the fallback in the skill entry. |
| AC-08 | `blog.test.ts` assertions for the editor description, four return lines, handoff line, comparator guidance and user guide quote rule; `tests/vh-adlc/check.test.ts` for the version; full suite `bun test tests/vh-adlc`. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

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
