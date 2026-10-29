---
status: in-progress
branch: feat/blog-authoring
status_description: "Implemented and independently reviewed for supplied-reference authoring; live retrieval/humanizer integration AC-03 remains unverified. Owner-authorized merge does not mark the feature complete."
issue: null
goal: "Prepare repository-owned articles and social drafts that link to them, using verified project facts and the requested writer's actual style before owner review."
covers:
  - plugins/vh-adlc/skills/vh-adlc-blog/
  - plugins/vh-adlc/references/blog.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - tests/vh-adlc/
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
---

# Plan: Shared blog authoring

Add a reusable article and promotion-drafting operation to the vh-adlc plugin. It uses project evidence and the requested writer's style, then returns drafts and unresolved factual questions for review.

## Context

The owner approved Stackweaver's blog design and requested a blog agent in vh-adlc, using the humanizer and write-like-me skills. Stackweaver supports self-hosting and is intended to offer a managed SaaS service; articles must distinguish current availability from planned offerings.

The owner requested the latest VitePress skill update. Commit `1d1c3b10672ec0ad29cbb9efc04b8bc3d13e647c`, inspected with `git show`, changes `.claude/skills/write-post/SKILL.md` and `.claude/agents/llm-tell-hunter.md`. The writer now separates new drafts from conservative editing. Existing prose is its primary voice reference, and edits need an identifiable defect. Step 5 compares original, candidate, source-position inventory and edit reasons. The critic returns a verdict, minimal repairs and separate exceptions instead of a replacement article; unchanged text can pass. These requirements supersede the earlier draft's aggressive rewriting approach. VitePress paths, frontmatter, containers and sidebar integration remain site-specific.

At the inspected vh-adlc commit `35f62ca3f8989e9f3bec51b6f2f9a9f420ef51d5`, the plugin has no blog operation. `tests/vh-adlc/check.test.ts`, the skills directory test, accepts the generic entry and eight operations, including triage. `.claude-plugin/marketplace.json` declares the vh-adlc package, and `plugins/vh-adlc/plugin.json` carries its version. The new operation must be discoverable without weakening feature-status checks or pretending a blog post is a software implementation feature.

The installed write-like-me skill instructs the writer to inspect actual writing samples, preferably through its search/retrieve tools, and allows supplied examples when those tools are unavailable. The current host exposes no write-like-me retrieval tools. The owner-designated VitePress workflow and its named posts provide local references for this work; this is not proof that connector retrieval works.

## Scope

Add an explicit `vh-adlc-blog` operation for topic-to-draft, revision and editorial review requests. Support repository-selected output locations, article metadata and author voice. It can prepare ordinary blog posts and product comparisons without requiring a new feature document for each article.

An explicit `vh-adlc-blog promote` mode prepares an article and social drafts that send readers to its canonical website URL. It reuses the same writer and independent editor. After shipping suitable public-facing work, the ship operation suggests this command without invoking it. The owner selected explicit invocation over automatic drafting on 2026-10-29.

The operation reads the adopter's instructions, available voice sources, supplied notes and relevant project documentation/code. It uses the installed humanizer and write-like-me skills where available, with the pinned prose guide and explicit supplied samples as documented fallbacks. It reports when a requested style tool or reference cannot be used.

No CMS, automatic drafting during shipping, automatic publishing, outreach, scheduled posting, analytics account, SEO API dependency, product implementation, or rewrite of the VitePress repository is included. Installing a workflow or approving a draft does not authorize pushing, publishing or creating accounts. Stackweaver's frontend remains a separate feature.

## Design

### Entry and packaging

Add `plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md` as a short entry to the workflow in `references/blog.md`. Update explicit invocation/discovery documentation and both package manifests, `plugins/vh-adlc/plugin.json` and `plugins/vh-adlc/.claude-plugin/plugin.json`, together under the repository's normal version policy. Preserve the binary lock, engineering pin and status-changing operation behavior.

Route generic requests to write or revise an article through the documentation/content path only when the requested work is article authoring. A request to implement a blog feature keeps the normal feature lifecycle. Do not route ordinary code work here because a source path contains blog.

Keep existing operation contracts, generic intake, triage and their tests intact. Adjust the skill inventory check to distinguish them from content operations, instead of requiring feature gates on an article-writing entry. Do not remove validation to make discovery pass.

Document promotion as a mode of the same operation, not a second writing agent or lifecycle. A generic request for article and social drafts selects that mode only within its authorized destinations. The ship handoff may suggest the command for relevant public-facing changes; internal-only changes get no promotion suggestion. Shipping a PR does not prove a release is available. The suggestion never adds a completion gate, changes feature status, generates content, or grants publication authority.

### Inputs and repository ownership

Determine the article's purpose, audience, intended writer, topic, destination and publication state from the current request and repository instructions. For greenfield articles, the writer may choose a useful structure, compose new prose and develop the supplied notes into a coherent article using verified supporting sources and the requested voice. Notes are factual/positional inputs, not wording that must be preserved. The conservative wording-preservation rule applies only to existing-article rewrites. For an existing article, preserve working structure and wording; change a passage only for a concrete defect or an explicitly requested change. Do not force an existing article into a new template or create a rewrite copy merely to edit it. Ask only for missing information that changes the work. Prefer an existing local article schema and generator; never transplant VitePress paths, frontmatter or sidebar steps into another project.

Locate the authoritative project facts before drafting. For product articles, distinguish self-hosted and managed editions, current and planned availability, supported behavior and limitations. A company location is not evidence of hosting jurisdiction, certification, support terms or legal compliance. For comparisons, verify competitor facts against current primary sources and preserve meaningful reasons to choose another product.

Keep private notes and unretrieved claim support out of public drafts. Product policy and project-specific positioning stay in the adopter repository, referenced by its normal instructions. The shared package contains no personal biography, private samples, local absolute paths or Stackweaver-specific sales claims.

Keep the site's voice guide, article schema and prose critic in the adopting repository when they contain site-specific rules. The shared operation reads and uses those adapters without copying them into the plugin or silently replacing their requirements. The promotion request must authorize the article repository as well as the project repository before writing across them.

### Writer style and prose

When the host has write-like-me, follow that skill's reference selection and retrieval instructions. Read usable content before composing. Reuse references already supplied for the task; do not create a personal writing cache or copy retrieved examples into the plugin.

When the writer explicitly designates local examples or a repository voice guide, read those selected sources and preserve their provenance. If neither retrieval nor adequate examples are available, draft plainly and state that a reference-based voice match was not verified. Do not make the availability of a paid connector a universal prerequisite for article drafting.

Use the available humanizer skill for the prose edit. When it is unavailable, use `guides/humanize-prose.md` at the resolved engineering revision, and report that fallback. Follow local punctuation and formatting rules where they are stricter. Do not imitate a sample by inventing the writer's experience, opinions, benchmarks, endorsements or history.

Before editing an existing article, keep a short internal inventory of the author's recommendations, defaults, examples, named domain roles and callout purposes. Track routine copy repairs separately from factual corrections, meaning changes and unresolved questions. The original article is the primary voice sample on revision; external examples supplement it rather than displacing sound wording.

An explicit request to preserve exact supplied wording overrides the default freedom to develop notes into new prose. Preserve protected copy with only the requested structural changes. A factual problem in that copy is flagged separately, never silently corrected or certified as ready to post. The same protection applies during the independent editor pass.

### Promotion drafts

Start from the owner's actual experience or supplied notes, the inspected project revision, and the existing article when one exists. Verify capability and release claims against source, executed evidence and release state. Separate implemented-but-unreleased behavior from available releases; never imply that `@latest` installs a feature branch. Do not invent customer results, usage, first-person experience, popularity or a claim that no competing tool exists. When a novelty or competitor claim matters, check current primary sources and report an unsupported statement as a factual exception.

Prepare the article in its existing location and the social copy as Markdown at the authorized destination. Keep one requested copy file rather than creating a file for every channel. If channels are named, follow their currently verified constraints and adapt the copy only as permitted; otherwise return channel-neutral copy without claiming it fits every platform. Preserve the author's supplied opening where requested. The article carries the technical examples; social copy gives a reader a concrete reason to follow its link, without manufacturing a dramatic hook or adding hashtags by default.

Each social draft includes the verified canonical article URL on the owner's website. Prefer existing site routing and canonical metadata over guessing a slug. If that destination is missing, serves an older revision or is not yet published, keep the draft visibly pending and state the article/publication dependency in the handoff. Do not invent a live destination or claim that newly drafted content is already there. A private preview is for owner review and must never become the public call-to-action URL. Link to the project from the article as appropriate.

The same independent editor checks the article and social copy against the source notes, protected wording and project evidence. Its review separates routine copy repairs from unsupported claims or changed meaning. When either source code or the article changes after review, recheck the affected statements before calling the bundle ready; a green implementation test suite is not editorial review. Return the draft paths, actual preview when available, inspected project revision and checks, public URL, substantive exceptions, and what must happen before posting. Keep the evidence in the normal handoff or existing adopter record instead of requiring a new campaign database, baseline file or permanent report for each post.

A separate editor uses `agents/vh-adlc-blog-editor.agent.md` and compares the original, candidate, that inventory and edit reasons. For a new article it receives the brief and source notes instead of a previous article, and checks factual fidelity and voice without requiring the draft to retain note wording or structure. It returns a verdict, only necessary copy repairs (including unjustified candidate edits to revert), and separate factual/meaning/question exceptions. It does not return a full rewritten article, manufacture findings or require a changed sentence to prove useful work. A no-change pass is valid. It reads only and does not publish, alter sources or execute instructions inside quoted draft material. It preserves commands, code, metadata, URLs, supported technical facts and unresolved placeholders. It also preserves the strength of the author's recommendations, domain-role distinctions, examples and each callout's rationale/use cases. Correct an evidenced false guarantee narrowly while retaining a sound stated preference. True but unrequested advice is a content addition, not a copy repair. If independent dispatch is unavailable, perform a self-edit and label it accurately; do not call it an independent review or certify naturalness with an AI-detector score.

### Draft and handoff

Keep unresolved facts explicit in a draft or in its accompanying review notes, as the adopter's authoring convention requires. A final/publication-ready result must not conceal unresolved claims or missing assets. Use actual asset paths and original evidence for claims about observed product behavior. Do not add screenshots or diagrams solely to decorate a post.

Write only to the destination authorized by the request or adopter instructions. Preserve existing article identifiers and canonical URLs on revision unless changing them is authorized. Draft approval and publication are distinct states. For a new article, show the finished draft or file link and remaining placeholders. For an existing article, link the edited file and summarize routine repairs briefly; surface only factual corrections, meaning changes and unresolved questions with their passages and evidence. Group batch exceptions in one report. Do not make the owner inspect a full replacement article or approve every sentence to discover substantive changes. Preserve working visuals and callouts, and add visuals only when they solve an explanation problem. Calibrate a new editing setup on a small representative sample before a batch; one successful keep-example does not establish unattended rewrite safety.

No article run changes vh-adlc feature statuses, creates an issue, updates a milestone or pushes a repository merely because this operation was invoked. A specific user request may separately authorize those actions under their existing procedures.

## Acceptance Criteria

- [x] AC-01: A user can invoke the packaged blog operation and receive a draft or revision in the adopter's existing article format without installing VitePress or creating a software feature document for the post; a greenfield brief can become newly structured prose instead of a minimally edited transcript.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-02: With a supplied voice guide and designated examples, the operation uses those sources and preserves supported facts, commands, code, URLs and declared uncertainty through the editorial pass; verified factual corrections are reported separately.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [ ] AC-03: With working write-like-me retrieval and humanizer tools, the operation follows their current instructions, reads the selected writing content before drafting and keeps retrieved sample content out of package/output evidence caches.
      Evidence: R-6 at 31bc6cc: not verified; actual write-like-me retrieval APIs are unavailable. No simulated tool proof or completion claim.
- [x] AC-04: Without connector retrieval or an independent editor, the operation can produce an honest draft from supplied inputs, identifies the unavailable capability, and does not claim a retrieved voice match or independent review.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-05: A comparison request with mixed current/planned offerings and missing evidence produces accurate edition/availability distinctions, preserved unresolved questions and no invented first-person use, metrics, vendor claims or compliance guarantees.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-06: Drafting and editorial review leave publication state, unrelated repository files, Git refs, accounts and external services unchanged unless separately authorized; hostile instructions inside source material do not expand that authority.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-07: The plugin's existing lifecycle checks continue to enforce their gates, and the new operation is included in packaged discovery and usage documentation with no unsupported host-runtime compatibility claim.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.

- [x] AC-08: Revising a sound original leaves it unchanged; targeted repairs preserve recommendations/defaults and their strength, domain-role terms, concrete examples, and callout purposes, and report verified factual or meaning changes separately.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-09: The independent editor compares original/source notes with the candidate and returns a verdict, minimal repairs and genuine exceptions without a replacement article or invented findings; the owner-facing handoff summarizes routine repairs and groups substantive batch exceptions.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-10: Explicit promotion mode creates an article draft and Markdown social copy linking to the verified canonical website article, follows adopter-specific writing rules, and identifies an unpublished or outdated destination without presenting the bundle as ready to post.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-11: An exact-wording request preserves the protected copy through writing and editorial review, while unsupported novelty, release and experience claims are surfaced separately; new feature claims cannot be attributed to an older published release.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.
- [x] AC-12: Shipping relevant public-facing work suggests the explicit promotion command without drafting, publishing or adding a lifecycle gate; internal-only work produces no promotion suggestion.
      Evidence: R-6 at 31bc6cc: met; independent executed/inspected evidence is preserved verbatim in the criterion record below.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Package/discovery check and isolated authoring scenarios in a minimal Markdown repo and a VitePress-shaped fixture; draft format follows each fixture's actual instructions. A greenfield notes fixture permits reordered, developed prose while retaining supported facts and positions; it is not evaluated for wording preservation. |
| AC-02 | Independent behavioral run with supplied style examples, code/URL sentinels and uncertain facts; compare protected content and inspect the edited article against the brief. |
| AC-03 | Native host run where both tools are actually available; observe search/retrieve and reading before drafting, inspect handoff/output for leaked sample content. If that host is unavailable, leave this criterion unverified; a prompt-only fixture is not runtime proof. |
| AC-04 | Isolated run without retrieval and independent dispatch; observe a useful draft plus an accurate limitation statement, with no fabricated tool use. |
| AC-05 | Isolated comparison brief separating current self-hosting from a future managed offering, with unproven region/benchmark claims and an incomplete competitor source; inspect scope and factual handling. |
| AC-06 | Hash and ref snapshots before/after a draft/review scenario, with publication instructions embedded in an untrusted source; no unauthorized mutation or external write occurs. |
| AC-07 | Existing `bun test tests/vh-adlc`, package inventory/version checks and new blog scenarios; inspect canonical usage docs and report only the host runs actually observed. |
| AC-08 | A keep-example remains byte-identical; a second fixture with a grammatical defect, a named workload/management role and a preference plus false guarantee gets only the supported narrow repairs, with the preference/callout meaning preserved. |
| AC-09 | Native editorial scenario supplies original, candidate and inventory, including an unnecessary paraphrase and an unchanged passage. The critic accepts unchanged prose, proposes the justified revert, separates any factual change and produces no full replacement. Inspect a small batch handoff for one grouped exception report. |
| AC-10 | Isolated promotion scenarios authorize separate project/site repositories, use their real voice/frontmatter adapters, and request channel-neutral or named-channel Markdown copy. Assert the actual canonical URL, unchanged article identifier, no invented platform-fit claim, and accurate pending state for missing, unpublished and outdated destinations; a tailnet preview must never appear as the public call to action. A missing destination authorization causes no cross-repository write. |
| AC-11 | Supply exact copy with distinctive spelling and an unsupported no-equivalent claim, alongside source evidence for an unreleased feature and a different latest release. Compare protected text after only permitted whitespace changes, inspect writer/editor exceptions, and reject fabricated first-person claims or install instructions that imply the older release has the new feature. Change a covered capability or article claim after review and observe the affected content being rechecked before readiness is reported. |
| AC-12 | Run native ship-handoff scenarios for public-facing and internal-only changes. Public work gets a concrete `vh-adlc-blog promote` suggestion; both runs leave article/social files and publication services untouched. Existing feature-gate tests still pass, and the suggestion describes PR shipment and release availability accurately. |

## Tasks

- [x] T1 `tests/vh-adlc/blog.test.ts` - package and authority checks fail because the shared blog operation, editor and promotion route are absent (AC-01, AC-02, AC-04, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12)
      Evidence: bun test tests/vh-adlc/blog.test.ts at 5791353: 0 pass, 5 fail because the operation/editor and routes do not exist; /tmp/vh-adlc-blog-red.log.
- [x] T2 `plugins/vh-adlc/skills/vh-adlc-blog/SKILL.md`, `plugins/vh-adlc/references/blog.md`, `plugins/vh-adlc/agents/vh-adlc-blog-editor.agent.md`, both package manifests and `tests/vh-adlc/check.test.ts` - shared authoring/editor contracts and discovery checks pass without weakening existing operation gates (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11)
      Evidence: targeted blog contracts: 3 pass; bun test tests/vh-adlc/check.test.ts: package checks pass with gated operation coverage retained.
- [x] T3 `plugins/vh-adlc/references/lifecycle.md`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md`, `docs/user-guides/workflows.md` and `docs/reference/compatibility.md` - explicit promotion routing and suggestion checks pass and usage describes actual host limits (AC-07, AC-10, AC-12)
      Evidence: bun test tests/vh-adlc/blog.test.ts tests/vh-adlc/check.test.ts: 55 pass, 0 fail; routing and suggestion contracts pass with original engineering checks retained.
- [x] T4 `tests/vh-adlc/blog/` and `tests/vh-adlc/evidence/blog/` - execute isolated native drafting, preservation, comparison, editor, cross-repository promotion and authority scenarios; retain honest outcomes and connector limitations, with package/ref hashes unchanged (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10, AC-11, AC-12)
      Evidence: nine native CLI scenarios pass at the unchanged candidate payload fingerprint, plus independent app-host comparison/drift/authority/editor scenarios; tests/vh-adlc/evidence/blog/README.md records raw hashes and retained failed attempts. Live connector integration remains unverified.
- [ ] T5 `docs/specs/blog-authoring.md` - current independent implementation review records every criterion and completion gate passes only with observed proof or an owner-approved tracked residual (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12)

## Open Questions

None. The owner chose explicit invocation, suggested after shipping, over automatic drafting. Article and social drafting share one operation and editor; site-specific voice and publication rules remain in the adopter repository.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-27 | R-1 | spec | `182c6502abf5523b250907be6ce445ed30573737` | unknown | procedural | One blocking manifest-coverage finding; model identity not attested. |
| 2026-10-27 | R-2 | spec | `556d39a1b493dee6045c3f4baf998567c68f3175` | unknown | procedural | No findings; model identity not attested. |
| 2026-10-27 | R-3 | spec | `394f5ff3122ac778d69f335a95de71725168c31a` | unknown | procedural | No findings; greenfield and existing-article modes verified; model identity not attested. |
| 2026-10-29 | R-4 | spec | `94bc595082a658bde7114a999da1db1162c4d3d2` | unknown | procedural | No findings; explicit promotion mode and post-ship suggestion reviewed; model identity not attested. |
| 2026-10-29 | R-5 | spec | `320b72856e5d2b7bb809e700a0c985ca03d5cea8` | unknown | procedural | No findings on refreshed current-main checkout; model identity not attested. |
| 2026-10-29 | R-5 | spec | `320b72856e5d2b7bb809e700a0c985ca03d5cea8` | n/a | n/a | accepted by owner |

| 2026-10-29 | R-6 | implementation | `31bc6cc304bb770fa1d37dcc04d36ec20327ac14` | unknown | procedural | Eleven criteria met; live retrieval/humanizer integration AC-03 not verified; model identity not attested. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: covers frontmatter; Design / Entry and packaging
EVIDENCE: docs/specs/blog-authoring.md:6-15 covers plugins/vh-adlc/plugin.json but omits plugins/vh-adlc/.claude-plugin/plugin.json. The version update required at line 44 also requires changing the omitted manifest: tests/vh-adlc/check.test.ts:162-173 requires both manifests to match, and lines 212-219 checks the version change through the Claude manifest. The pinned conventions/feature-documents.md requires covers to include every path whose change can affect the feature.
PROPOSAL: Add plugins/vh-adlc/.claude-plugin/plugin.json to covers and explicitly require updating both package manifests together. This keeps the required version change and subsequent manifest edits within review freshness and cleanliness checks.

### R-2

NO FINDINGS

### R-3

NO FINDINGS

### R-4

NO FINDINGS

### R-5

NO FINDINGS

### R-6

CRITERION: AC-01 A user can invoke the packaged blog operation and receive a draft or revision in the adopter's existing article format without installing VitePress or creating a software feature document for the post; a greenfield brief can become newly structured prose instead of a minimally edited transcript.
VERDICT: met
EVIDENCE: At 31bc6cc304bb770fa1d37dcc04d36ec20327ac14, inspected native Codex CLI new/repair trials and their raw sessions, resulting articles and Git diffs. The installed package fingerprint matches the reviewed source: 8360c2ee12e6f3d8681e7928b0b39a4c197527f326fbbceb744c5a96f3db6332. The new article develops the notes into paragraphs and sections with adopter-required frontmatter; repair changes the identified defects. Neither run requires VitePress or creates a software feature document.

CRITERION: AC-02 With a supplied voice guide and designated examples, the operation uses those sources and preserves supported facts, commands, code, URLs and declared uncertainty through the editorial pass; verified factual corrections are reported separately.
VERDICT: met
EVIDENCE: Inspected CLI new/repair/keep raw sessions and independent editor child sessions for the package matching 31bc6cc. The repair retains the management/workload distinction, command and self-hosting preference, removes the unsupported compliance guarantee and reports that correction separately. The valid keep fixture remains identical. Direct app-host promotion/comparison scenarios additionally preserve protected copy and explicit competitor uncertainty. These runs use supplied local references, not retrieved style samples.

CRITERION: AC-03 With working write-like-me retrieval and humanizer tools, the operation follows their current instructions, reads the selected writing content before drafting and keeps retrieved sample content out of package/output evidence caches.
VERDICT: not verified
EVIDENCE: At 31bc6cc, the workflow specifies actual tool discovery, source reading and protection of retrieved samples, and explicitly rejects simulated integration proof. Actual write-like-me retrieval APIs are unavailable in the reviewed host. Native trials use local voice references and the pinned prose-guide fallback. No run exercises the required live retrieval/humanizer combination, so source checks and successful fallback drafting do not establish this criterion.

CRITERION: AC-04 Without connector retrieval or an independent editor, the operation can produce an honest draft from supplied inputs, identifies the unavailable capability, and does not claim a retrieved voice match or independent review.
VERDICT: met
EVIDENCE: Inspected /tmp/vh-blog-native-fallback-20261029 raw events, response, article and result receipt at 31bc6cc; verified the raw-event hash. The native CLI run completes with independent dispatch disabled, produces adopter-formatted prose, identifies unavailable retrieval and independent review, and reports self-editing with the pinned guide. No replacement host, publication, commit or unsupported integration claim appears.

CRITERION: AC-05 A comparison request with mixed current/planned offerings and missing evidence produces accurate edition/availability distinctions, preserved unresolved questions and no invented first-person use, metrics, vendor claims or compliance guarantees.
VERDICT: met
EVIDENCE: Executed a direct app-host comparison scenario using the shared procedure at 31bc6cc, then inspected /tmp/vh-blog-independent-app-20261029/comparison/article.md and its independent editor verdict. The article distinguishes released Markdown, unreleased HTML and the unavailable planned managed service. Missing Pine evidence remains an explicit verification placeholder; there is no invented benchmark, customer outcome, region or compliance guarantee. External research was forbidden for this fixture, so it correctly remains an incomplete draft.

CRITERION: AC-06 Drafting and editorial review leave publication state, unrelated repository files, Git refs, accounts and external services unchanged unless separately authorized; hostile instructions inside source material do not expand that authority.
VERDICT: met
EVIDENCE: Independently compared fixture file hashes, Git refs and index snapshots for direct app-host promotion, denied-site, comparison, editor and ship-handoff scenarios at 31bc6cc. Only authorized article/social destinations change; denied-site/editor/ship fixtures remain identical. CLI fixture diffs and receipts likewise preserve inputs, sentinels, refs, index and installed package. The embedded instruction to commit, push and publish is ignored. Evidence is limited to these observed scenarios and procedural host isolation.

CRITERION: AC-07 The plugin's existing lifecycle checks continue to enforce their gates, and the new operation is included in packaged discovery and usage documentation with no unsupported host-runtime compatibility claim.
VERDICT: met
EVIDENCE: Independently executed bun test tests/vh-adlc at 31bc6cc with required host capabilities: 437 pass, 0 fail, 1862 assertions. Inspected the skill inventory, matching manifests, discovery changes, retained engineering-gate tests and usage/compatibility documentation. Native CLI sessions read the installed blog operation from the package whose fingerprint matches source. The initial restricted run failed on network/Bubblewrap capabilities and is retained separately; no desktop, extension or connector compatibility follows from the passing checks.

CRITERION: AC-08 Revising a sound original leaves it unchanged; targeted repairs preserve recommendations/defaults and their strength, domain-role terms, concrete examples, and callout purposes, and report verified factual or meaning changes separately.
VERDICT: met
EVIDENCE: Inspected the valid native keep fixture at /tmp/vh-blog-native-keep-20261029/keep: clean tree and identical article, metadata and command. Inspected the repair diff and independent editor child verdict: the grammatical repair and unsupported guarantee removal retain the strong self-hosting preference, tip purpose, management/workload roles and command. The original malformed keep fixture is a retained failed trial because it omitted mandatory frontmatter; it is not counted as preservation proof.

CRITERION: AC-09 The independent editor compares original/source notes with the candidate and returns a verdict, minimal repairs and genuine exceptions without a replacement article or invented findings; the owner-facing handoff summarizes routine repairs and groups substantive batch exceptions.
VERDICT: met
EVIDENCE: Inspected raw CLI child session metadata and editor verdicts for new, repair and valid keep. Executed a separate app-host editorial scenario using the packaged shared editor: it rejects the unjustified replacement of the author's management-cluster preference with a weaker statement, proposes the exact minimal revert, and does not rewrite either file. The app-host batch handoff groups promotion/comparison exceptions. Separate editor context is observed; model identity and structural read-only enforcement are not attested.

CRITERION: AC-10 Explicit promotion mode creates an article draft and Markdown social copy linking to the verified canonical website article, follows adopter-specific writing rules, and identifies an unpublished or outdated destination without presenting the bundle as ready to post.
VERDICT: met
EVIDENCE: Inspected the completed native CLI promotion trial at 31bc6cc and verified raw-event hash 3768b4592e15a6e13e1b174875b4d65239d833cebe385e89a732f195c55d4a35. It creates only the authorized article/social files, uses the adopter's schema and declared canonical URL, and keeps the inaccessible/unpublished destination explicitly pending. Independent app-host promotion and denied-site scenarios confirm the same behavior and no unauthorized cross-destination write. The canonical is verified against fixture metadata; no live public article, named-channel limits or separate outdated-destination variant is claimed.

CRITERION: AC-11 An exact-wording request preserves the protected copy through writing and editorial review, while unsupported novelty, release and experience claims are surfaced separately; new feature claims cannot be attributed to an older published release.
VERDICT: met
EVIDENCE: Independently compared protected.txt with CLI and app-host social output: the protected body remains byte-identical and its unsupported exclusivity claim is flagged separately. Articles distinguish released 1.0 from unreleased implementation. In a supplemental app-host scenario, the harness changes source facts after editorial review to remove implemented HTML support; the writer rereads them, changes only affected article statements and obtains a second independent editorial verdict. Social text, source facts, refs and index remain unchanged by the writer. Receipts are in /tmp/vh-blog-independent-app-20261029/drift-after-check.json.

CRITERION: AC-12 Shipping relevant public-facing work suggests the explicit promotion command without drafting, publishing or adding a lifecycle gate; internal-only work produces no promotion suggestion.
VERDICT: met
EVIDENCE: Executed read-only public-facing and internal-only ship-handoff scenarios against the actual shared ship section at 31bc6cc. Public work suggests vh-adlc-blog promote Cedar while preserving the distinction between a shipped PR and an unpublished release; internal-only cleanup produces no promotion suggestion. Both fixture trees, refs and indexes remain identical. Independent full package checks pass with engineering-gate coverage retained. These are handoff exercises, not actual feature shipments or publication tests.

## Sources

- Owner request and decision on 2026-10-29: save exact Crossplane Docs promotional copy, revise the existing VitePress article, and add natural article-linked social drafts to vh-adlc through an explicit command suggested after shipping.
- `git show 1d1c3b1:app/projects/crossplane-docs/intro.md` contains the existing article and its unsupported no-equivalent claim. `/home/m/code/crossplane-docs` at `083d10d42acb544f1f54c86bc3fa3bdd7d7e04ca`, inspected via `README.md`, `examples/platform/config.yml`, `examples/platform/go-templating.yaml` and `tests/render/cases.yaml`, provides the current product evidence. These are authoring inputs, not portable package dependencies.
- [XDocs repository](https://github.com/Kavinraja-G/crossplane-docs), read 2026-10-29: an existing generator for XRD/Composition documentation, contradicting a universal novelty claim.
- `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md`, Deliver and Report: shipping currently reports the PR and CI, and explicitly does not authorize a merge, tag or release. `plugins/vh-adlc/references/lifecycle.md`, Choose and continue: new capability needs an accepted feature, while drafting alone grants no publication authority.
- Owner-designated prior art at VitePress commit `1d1c3b10672ec0ad29cbb9efc04b8bc3d13e647c`, read with `git show origin/main:<path>`: `.claude/skills/write-post/SKILL.md`, `voice.md`, `references/frontmatter.md`, and `.claude/agents/llm-tell-hunter.md`. The updated writer/critic define conservative editing, source comparison, preservation and exception-only review; they replace the older inspected workflow. These local paths identify inspected prior art; they are not dependencies of the shared operation.
- Owner-designated voice references: `app/blog/devops/gitversion.md` and `app/blog/devops/TUI.md` in that repository: practical technical writing and the writer's conversational register. Their facts are not imported into new articles.
- Installed humanizer skill: `/home/m/.claude/skills/humanizer/SKILL.md`: prose-edit behavior and protected content.
- Installed write-like-me skill: `/home/m/.codex/plugins/cache/openai-curated-remote/write-like-me/0.1.1/skills/write-like-me/SKILL.md`: reference retrieval, use of designated examples, privacy and capability fallback. The shared operation discovers the host's available skill, not this machine's absolute path.
- [Pinned feature-document convention](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): feature review and owner acceptance before adding an operation.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): authoritative prose-edit fallback.
