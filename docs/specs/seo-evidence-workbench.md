---
status: draft
status_description: "Research-backed draft for independent implementation; awaiting spec review and owner acceptance."
issue: null
goal: "A person or agent can turn saved public-site evidence into repeatable cross-page findings and technical regression checks without depending on the unfinished SEO features."
covers:
  - tools/seo-evidence/
  - .github/workflows/seo-evidence.yml
---

# Plan: Offline SEO evidence workbench

Build a standalone Bun toolkit for saved crawl evidence, link graphs, duplicate-page checks and technical snapshot comparisons. Its files and verification workflow are separate from both active SEO feature scopes.

## Context

### Owner summary

The SEO agent already describes useful public checks and preserves evidence. Its maintained executable helper handles Semrush, not cross-page analysis or technical regression comparison. The proposed AI-discovery addition concerns provider access, measured visibility and repair routing; it does not supply this analysis engine. Repeating those checklists would add little. A small evidence toolkit would let us run the same checks reliably on saved crawls and test whether a site change broke something.

The research examined established open-source skills and tools at exact source revisions. The useful ideas are explicit technical baselines from Claude SEO, graph-based orphan and duplicate checks from SEOnaut, contextual link analysis from SEO Machine and the marketing skills, and explicit CI failure contracts and sampling coverage from SiteOne and Unlighthouse. These are design references. This feature neither installs their plugins nor adopts their entire checklists or rankings claims.

The owner selected saved-evidence analysis first, with live collection deferred. The toolkit will consume a documented local bundle, produce technical snapshots and findings, and compare two explicit snapshots. It will identify observed broken links, pages unreachable within the supplied graph, duplicate titles/descriptions/main content, and changes such as a new noindex directive or a removed title. Every result retains its evidence and coverage limits. An unseen target stays unobserved; an incomplete crawl does not prove a site has an orphan page. Template groups make coverage visible without treating a sampled page as proof about every page in its group.

The owner also selected report-only behavior by default, with CI failure enabled only for named rules in a repository policy. Invalid or incomplete inputs still return an unsuccessful execution status. There is no aggregate SEO score, keyword-density target or promise of better rankings. The first version makes no network requests, runs no browser and changes no site files, accounts or search-engine settings.

Implementation owns only `tools/seo-evidence/` and a new `.github/workflows/seo-evidence.yml`. It needs neither existing SEO feature to land and does not edit their agent, skill, manifests, tests, adapters or current workflow. A person or agent can invoke the documented command directly from a checkout. Automatic skill integration remains separate. Acceptance authorizes building this isolated toolkit; it grants no site repair, publication, monitoring or live collection. The implementation checks below have not run.

### Research and current gap

The snapshot below comes from GitHub repository metadata and source read on 18 November 2026. Stars are adoption context, not proof of SEO effectiveness. All six repositories were public, unarchived, non-fork upstreams with MIT license metadata. Source behavior was checked below the README level.

| Source | Dated adoption/activity evidence | Useful source examined | Decision for this feature |
| --- | --- | --- | --- |
| [Claude SEO](https://github.com/AgriciDaniel/claude-seo) | 30,571 stars; pushed 16 November 2026 | `skills/seo-drift/SKILL.md`, `scripts/drift_compare.py`, `scripts/drift_baseline.py` at `468ed5b0d9e3249394783710e54abb02837e326b` | Adopt explicit technical snapshots and field-level comparisons. Do not copy its automatic query sorting/trailing-slash removal or predicted traffic-loss timing. |
| [Marketing skills](https://github.com/coreyhaines31/marketingskills) | 61,164 stars; pushed 18 November 2026 | `skills/site-architecture/SKILL.md`, `skills/programmatic-seo/SKILL.md`, title guidance at `73573e94a06a39965978b3fa1f9c1eace8cebc7c` | Adopt discovery-path and template-aware analysis. Do not turn suggested click-depth or link-count targets into universal ranking rules. |
| [SEO Machine](https://github.com/TheCraigHewitt/seomachine) | 7,633 stars; pushed 23 October 2026 | `.claude/agents/internal-linker.md` and `.claude/agents/keyword-mapper.md` at `120e7b46dc07c98382cd4f68ac5b6515ab9f2604` | Adopt evidence for contextual link opportunities. Defer editorial recommendations to the existing writer/repair workflow; exclude its fixed keyword-density targets and any automatic cannibalization verdict. |
| [Unlighthouse](https://github.com/harlan-zw/unlighthouse) | 4,957 stars; pushed 17 November 2026 | Dynamic-sampling guide, CI guide and `packages/cli/src/ci.ts` at `ea2baf26e85a13e5718304fb90806f0f81a20537` | Adopt explicit per-group coverage and opt-in failure policy. Running Lighthouse is deferred; existing agent guidance already supports lab tools. |
| [SEOnaut](https://github.com/StJudeWasHere/seonaut) | 872 stars; pushed 8 October 2026 | `internal/issues/multipage/orphan.go`, `title.go`, `body.go` and `internal/issues/page/depth.go` at `a67387fe63a291be2ba49dd02399f20e453eb8b5` | Adopt cross-page incoming-link and duplicate-content analysis with explicit corpus limits. No database/server installation or fixed depth threshold is needed. |
| [SiteOne Crawler](https://github.com/janreges/siteone-crawler) | 1,015 stars; pushed 27 September 2026 | `README.md` and `src/output/json_output.rs` at `f3d967b190a77ff5f816b7ddab74c1a778d9dbaf` | Adopt machine-readable findings and an unambiguous CI exit contract. Defer its crawler, browser, mailer, composite score and external report hosting. |

Current source evidence:

- Default checkout `git rev-parse HEAD` returned `46a60447361a09d45830a9ef0197a5f1a52e5213`. [SEO assessment](seo-assessment.md) is claimed on `feat/seo-agent`; [SEO repairs and AI discovery](seo-search-ai-discovery.md) remains a separate draft. Neither covers the two new paths above.
- In the owner-selected SEO checkout at local commit `9e5e11f8c0f3b6b1503f5f58a9989e6c29502697`, `rg --files plugins/vh-adlc/scripts/seo` returns only `semrush.ts`. `references/seo.md:113-135` describes HTTP, browser, crawler and Lighthouse checks; `:284-309` describes prioritized findings, exports and hashes. These are useful procedures, not an executable graph or technical-diff engine.
- The saved Stackweaver run at `/home/m/code/stackweaver/.tmp/seo-research/ai-discovery-2026-11-18/` contains `findings.json`, a manifest and raw HTML for 100 sitemap pages. The earlier run found three identical troubleshooting titles. This establishes immediately available input material, not a site-wide indexing or ranking verdict. Its current JSON shape is not declared a universal export format.

## Scope

Implement local bundle validation, deterministic extraction, observed link-graph analysis, exact duplicate groups, technical snapshot comparison, explicit failure rules and reproducible JSON/CSV/Markdown outputs. Supply a complete example bundle and independent tests/type checking/CI.

Do not add live crawling, provider API clients, authentication, search-performance ingestion, AI-answer sampling, repair execution, automatic agent dispatch, scheduled monitoring, a web UI, a database, content generation or deployment. Do not modify either SEO feature or integrate this command into the installed plugin. This is source-delivered tooling callable by a person or an agent from a repository checkout.

## Design

### Parallel ownership and invocation

All source, schemas, dependency lock, tests, fixtures, examples and the usage guide live in `tools/seo-evidence/`. A separate workflow, `.github/workflows/seo-evidence.yml`, verifies that directory. No other existing file is an implementation dependency or edit target. If integration later requires changing an active feature's files, leave it for that feature's owner or a separate accepted integration task.

Expose three noninteractive commands through `bun tools/seo-evidence/cli.ts`: `snapshot --input <bundle.yaml> --output <new-directory>`, `inspect --snapshot <snapshot.json> --output <new-directory> [--policy <policy.yaml>]`, and `compare --baseline <snapshot.json> --current <snapshot.json> --output <new-directory> [--policy <policy.yaml>]`. Help and the example guide show complete commands. Configuration is strict YAML; generated snapshots and findings are versioned JSON. The local package keeps its runtime dependencies and strict TypeScript config within its own directory and uses a committed Bun lockfile. It does not require the vh-adlc binary, an agent login or any SEO subscription.

### Evidence bundle and coverage

Define bundle schema version 1 in the tool's schema and complete example files. Required top-level fields are `schema_version`, `captured_at`, `origins`, `entry_urls`, `pages` and `files`. `origins` lists exact allowed HTTP(S) origins; `entry_urls` identifies graph roots. `pages` is the declared observation inventory. An optional `sitemap_urls` inventory and optional `groups` map supplied URLs to named page-template groups. Group membership is explicit, not inferred from path depth or AI classification. Optional `extraction.main_selector` supplies the main-content CSS root selector; its default is `main`, and its effective value becomes part of the extraction identity.

Each page has its requested URL, final URL when known, outcome (`captured`, `failed` or `not_collected`), capture mode (`initial` or `rendered`), and observation timestamp. Captured pages also provide HTTP status, response content type, selected response headers and a relative body-file path. Headers are limited to `Content-Type`, `X-Robots-Tag`, `Link` and `Location`, matched case-insensitively; a supplied Content-Type header must agree with the required content type. Header values are ordered lists so repeated directives are retained. Redirect chains are optional recorded ordered hops, never reconstructed from a canonical annotation. A page may supply only one observation per requested URL and mode in a bundle; duplicates are invalid. HTTP errors with captured responses remain captured status observations; a transport failure has unknown status. Files carry relative paths and SHA-256 digests. HTML bodies must be valid UTF-8 in v1; unsupported encodings fail visibly rather than producing replacement text.

Require every referenced file to be in `files` and to match its digest. Resolve only ordinary files within the bundle directory; reject absolute paths, traversal and symlinks. Reject unsupported versions, duplicate/unknown YAML keys, inconsistent URL/origin metadata, malformed required values and over-limit inputs before analysis. The v1 limits are 10,000 declared page observations, 5 MiB per body file and 250 MiB total referenced input bytes; exceeding a limit is a visible input error, never silent truncation. Do not resolve URLs through the network. URLs in content are data, never commands.

Provide a written mapping example for the existing Stackweaver saved export into this native bundle: use the retained HTML plus matching request status/headers/final URL and their hashes. Validate each mapped record instead of trusting the old summary. Do not silently accept arbitrary third-party JSON. Native schema support is required; general SiteOne/SEOnaut export importers are deferred.

Snapshot coverage records declared/captured/failed/not-collected counts and capture modes, all supplied roots and sitemap URLs, and per-group declared/captured/failed counts. Missing HTML or metadata caused by an input error is invalid. Declared failed/not-collected observations produce a partial snapshot with their reasons. A complete snapshot means its declared inventory was captured, not that the whole site was crawled. The snapshot retains extraction-version and settings identities, file hashes and relative evidence references. It never copies full response bodies or unrelated headers into findings.

### URL identity, parsing and graph

Use an HTML parser rather than regular expressions. Parse title, description, H1 text, document language, canonical annotations, generic robots meta, JSON-LD presence/syntax, `a[href]` links and fragment IDs. Retain multiple title/canonical/directive observations as findings; do not pick a value silently. Derive link URLs from the recorded final URL and the document's first valid HTTP(S) base URL. Non-HTTP link schemes do not enter the page graph. Extract all links, distinguishing links within the selected main-content root from links elsewhere.

Use standard URL resolution and serialize URL identity without fragments. Preserve path case, trailing slashes, percent-encoded path distinctions and the query string's ordering, repeated keys and values. Do not remove tracking parameters, sort queries, fold HTTP into HTTPS or merge hosts. Canonical and redirect relationships remain separate evidence; they do not merge graph nodes. Keep original hrefs and fragments for diagnostics. URL fragments use the parser's decoded fragment identifier for lookup against captured target IDs; invalid escapes are a finding rather than a reason to fetch a page.

Analyze each capture mode separately. Build directed edges only from observed anchors, retain their source file and anchor position, and compute incoming links and shortest observed paths from the supplied roots. Incoming discovery links come from other pages; a self-link cannot establish discovery. Report pages with no observed incoming link and pages unreachable from those roots as candidates within this corpus; roots are exempt from the zero-incoming finding. Report the actual observed depth without a default too-deep threshold. A sitemap entry is discovery evidence, not an incoming content link.

Classify link targets as captured-success, captured-HTTP-error, redirect-recorded, out-of-scope or unobserved. An uncaptured target is not a broken link. Check a fragment only when the target's successful HTML and IDs were captured in the same mode; otherwise mark it unverified. Observed redirects never count as proof that an unobserved destination works. Keep all directed graph facts separate from ranking, PageRank, verified crawler or indexation claims.

### Duplicate groups and coverage by template

Find exact duplicate nonempty title and description values among captured successful HTML pages, partitioned by document language and capture mode; unknown language stays explicitly unknown. Normalize character whitespace only and preserve case. Keep canonical annotations and response state with every member so a human can distinguish intended variants from mistakes. Duplicate groups are candidates, not automatic consolidation/canonical instructions.

For main-content duplicates, use an explicit CSS root selector, default `main`, and remove script/style/template content before extracting text in DOM order. Require exactly one matching root; absent or multiple roots make that page's main-content comparison unavailable. Collapse character whitespace and hash the resulting nonempty text. Compare exact hashes only within the same selector, extractor version, language and capture mode. Shared navigation/footer text outside the root cannot create a duplicate-main-content finding. Do not label a short page thin or treat overlapping words as proven keyword cannibalization. Near-duplicate semantic detection and editorial recommendations are deferred.

For each optional page group, show its observed URL set, capture coverage and applicable findings. No sample is propagated to uncaptured group members. This adopts the useful coverage discipline of template sampling without introducing a browser sampler, lab score or arbitrary sample-size default.

### Technical comparisons and failure policy

Compare two explicit snapshot files. Reject different schema/extraction versions, extraction settings or origin scopes as incompatible. Match pages by requested URL and capture mode, preserve both timestamps and inventories, and report added, missing and unobserved pages separately. Status rules require captured HTTP responses in both observations, regardless of body media type. HTML-field regressions require successful captured HTML in both observations. Missing evidence stays unavailable and must not become a removed title, removed schema or a new HTTP failure.

Emit changes for status codes, titles/descriptions, canonical annotations, generic page index directives, H1s and JSON-LD presence/syntax. Provide named regression rules for successful HTTP response becoming captured 4xx/5xx, a nonempty title or H1 disappearing, a generic noindex/none directive being added, and a previously present canonical being removed or changed. A changed or removed JSON-LD block is a change requiring review, not proof of lost rich-result eligibility. Preserve raw evidence and normalized old/new values with each finding. Compare generic page controls only; provider-specific robots.txt policy, Google-selected canonicals and AI-training policy remain outside this tool's claims.

The policy YAML has schema version 1 and `fail_rules`, a set of documented rule IDs. The empty set is the default. Unknown IDs are invalid; there are no severity/score thresholds or wildcard rules in v1. `inspect` can enforce its documented static rules for captured broken links, broken fragments, duplicate titles/descriptions/main content and observed-graph unreachable candidates. `compare` can enforce its documented regression rules. Selecting a rule that does not apply to the command is invalid. Do not modify any repository policy or CI pipeline while analyzing evidence.

Exit 0 means analysis completed and no selected rule failed, even if report-only findings exist. Exit 2 means invalid/incompatible input or partial declared capture; it never means clean. Exit 3 means complete analysis with a selected rule violation. When a partial analysis also contains selected-rule violations, exit 2 takes precedence and the report preserves both facts. Each output has explicit `analysis_status` and `policy_status`; do not conflate report-only findings with passing SEO or absence of defects. This feature adds no automatic deployment block to a consumer repository.

### Output, retry and verification delivery

Produce `snapshot.json` and `manifest.json` for snapshot, and `findings.json`, `findings.csv`, `report.md` and `manifest.json` for inspect/compare. JSON has schema version 1, tool/extraction version, input digests, capture/scope metadata, findings, coverage and statuses. The normalized snapshot contains the extracted facts and content hashes needed by inspect/compare; they do not reopen the original HTML. A finding identifies its rule, affected URL/mode, evidence paths/hashes and observed values. Stable IDs derive from rule, URL/mode and affected evidence identity; outputs sort by rule and URL. Reprocessing the same input/policy yields byte-identical analytical files in a new output directory. Include no current wall-clock timestamp or absolute local path in those files. CSV/Markdown escape source text so page content cannot become formulas, code execution or a forged report heading. Tool data is not an agent instruction.

Output directories must be new and exclusively created. Create an `INCOMPLETE` marker first, write files via temporary names, then publish `complete.json` with the manifest hash only after all file hashes verify and remove `INCOMPLETE`. Consumers require the verified manifest/completion marker and absence of `INCOMPLETE`; an interrupted finalization is safely refused. A fully written partial-capture snapshot may carry the completion marker, but retains partial analysis status and exit 2: artifact completion does not mean complete site coverage. A write failure or cancellation leaves the labelled incomplete directory, which is never accepted or overwritten on retry. Concurrent runs with distinct outputs are independent; two runs selecting the same output have one creator and one refusal. Inputs and other sessions' outputs remain read-only. A retry uses a fresh directory; there is no hidden baseline database, implicit latest selection, scheduler or delivery permission to replay.

Human status output follows the pinned terminal-output standard: explicit outcome words with its status symbols on TTY, an ASCII/plain option, append-only plain output without ANSI on non-TTY, and `NO_COLOR` handling. `--json` writes one undecorated result object to stdout; diagnostics go to stderr. That object retains the same status/exit semantics as file output. No interactive prompt, spinner or browser is needed.

The deliverable is the self-contained source directory and documented Bun command, not a new Go binary or installed plugin release. Verification runs the tool's frozen dependency install, strict type check, all tool tests and the complete example commands. A new path-filtered workflow runs those same checks for changes to the directory or itself, using the repository's existing action-pinning and Bun policies. It performs no live crawl and uploads no site evidence. Existing workflows and plugin version/manifests remain unchanged. A later plugin integration must recheck its own package/version and authority requirements.

No existing output requires migration. Unsupported future input versions fail visibly; old bundles/snapshots remain available to their original tool version. Rolling back the source leaves saved evidence intact and introduces no site-state rollback. Compare snapshots only when their extraction identities match rather than rewriting old evidence to fit a new version.

## Acceptance Criteria

- [ ] AC-01: A person or agent can run the documented commands from the isolated source directory against a valid saved bundle, with no network/browser/account dependency or change to either active SEO feature.
- [ ] AC-02: Invalid, tampered, over-limit or incomplete evidence cannot be reported as a complete clean analysis, and every reported value retains its capture mode, scope and source provenance.
- [ ] AC-03: Graph findings distinguish observed broken links/fragments, zero-incoming and unreachable candidates from uncaptured destinations, and preserve meaningful URL distinctions and observed path evidence.
- [ ] AC-04: Exact metadata/main-content duplicate groups and template coverage identify the actual observed pages without grouping shared navigation, missing content roots or unobserved samples into a false whole-site verdict.
- [ ] AC-05: Technical snapshot comparisons identify supported changes and regressions while keeping incompatible snapshots, different capture modes and missing evidence out of false before/after claims.
- [ ] AC-06: The default command reports findings without enforcing them, explicit known rule selections control failure, and invalid/partial execution has distinct stable exit and machine-output semantics.
- [ ] AC-07: Equivalent inputs produce stable evidence-linked outputs, interrupted or concurrent runs cannot overwrite inputs or completed results, and rendered reports preserve source text safely.
- [ ] AC-08: The toolkit's complete examples, type checks, tests and dedicated CI exercise the actual deliverable independently of the unfinished SEO features and existing plugin release paths.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Execute all three CLI commands on the committed example after a frozen install, with network denied in a Linux test namespace and no browser/provider credentials. Snapshot the input tree and both existing SEO feature documents/implementation paths before and after. Require usable reports, unchanged input/feature state and no attempted subprocess/browser or network use. Review the feature diff to confirm only the two declared roots changed. |
| AC-02 | Feed bundles with good hashes, modified HTML, missing files, unsupported versions, duplicate and unknown YAML keys, malformed page records, duplicate URL/mode entries, traversal/absolute/symlink paths, and each size/page limit boundary. Invalid cases must exit 2 before successful output promotion. Add captured 404, transport failure and not-collected entries; status must distinguish an observed HTTP response from unknown and the latter cases must remain partial with null/unavailable facts. |
| AC-03 | Use a saved four-page site with a rooted path, an isolated sitemap-only page, one captured 404 target, one uncaptured target and one observed redirect with an uncaptured destination. Verify exact directed edges, incoming counts, observed depth/path and candidate qualifiers. Add initial/rendered variants, a valid base URL, malformed fragments, captured good/missing fragment IDs, query-order/repeated-key variants, encoded paths, path case and trailing slashes. Assert no guessed request, merged URL identity or broken verdict on an unobserved target. |
| AC-04 | Two pages share a title, two share only navigation and two share their main text. Inspect actual groups against expected URL/mode/language membership. Add missing/multiple `main` roots, empty content, changed selector/version, intended canonical variants and a group with one captured and two uncollected pages. Only supported exact groups may form; unavailable extraction and incomplete group coverage remain visible, and no per-sample verdict is copied to unobserved members. |
| AC-05 | Compare paired fixtures for each supported field change and regression, an unchanged pair, a changed canonical, a captured HTTP failure, a transport failure, and added/missing pages. Also compare incompatible schema/extractor/settings/origin pairs and initial versus rendered observations. Require correct old/new evidence for real changes, unavailable results for missing evidence, incompatible-input exit 2 where specified and no implied indexing/ranking result. |
| AC-06 | Run inspect and compare with no policy, an empty policy, each applicable fail rule, unknown IDs and a command-inapplicable rule. Require report-only findings with exit 0, selected complete violations with exit 3, invalid/partial runs with exit 2, and partial precedence while retaining observed violations. Check JSON/file statuses agree. Capture TTY, non-TTY, ASCII/plain and `NO_COLOR` absent/empty/`0` output; JSON must parse and plain/machine output must contain no ANSI/cursor bytes. |
| AC-07 | Run identical bundles/policies into two fresh outputs and compare analytical bytes and hashes. Interrupt between writes, race two creators on the same output and run two separate outputs concurrently. Verify completion markers/manifests, no overwritten file and refusal to consume incomplete output. Include titles/URLs with quotes, newlines, Markdown headings and CSV formula prefixes; parse JSON/CSV and inspect Markdown to confirm those values remain data. |
| AC-08 | From a fresh checkout without either SEO feature merged, run the directory's documented frozen install, typecheck, `bun test --cwd tools/seo-evidence`, and complete example commands, plus workflow validation. The new workflow must call those checks on tool/self changes without invoking a site or modifying existing workflows. Observe its exact-head result at authorized shipping; until then hosted CI is unverified. No static text check alone establishes AC-01 through AC-07. |

## Tasks

None yet; written once the reviewed document is accepted and planned. No dependency on either existing SEO feature is required before claiming this feature's separate branch.

## Open Questions

None. On 18 November 2026 the owner chose saved-evidence analysis before live collection and report-only defaults with explicit rule enforcement. The new isolated paths satisfy the requested parallel implementation boundary. The detailed implementation scope still requires acceptance after independent review.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Claude SEO drift skill](https://github.com/AgriciDaniel/claude-seo/blob/468ed5b0d9e3249394783710e54abb02837e326b/skills/seo-drift/SKILL.md), [comparison code](https://github.com/AgriciDaniel/claude-seo/blob/468ed5b0d9e3249394783710e54abb02837e326b/scripts/drift_compare.py) and [normalization code](https://github.com/AgriciDaniel/claude-seo/blob/468ed5b0d9e3249394783710e54abb02837e326b/scripts/drift_baseline.py): implemented field comparisons and the URL-normalization choices deliberately not adopted here.
- [Marketing skills site architecture](https://github.com/coreyhaines31/marketingskills/blob/73573e94a06a39965978b3fa1f9c1eace8cebc7c/skills/site-architecture/SKILL.md), [programmatic SEO](https://github.com/coreyhaines31/marketingskills/blob/73573e94a06a39965978b3fa1f9c1eace8cebc7c/skills/programmatic-seo/SKILL.md) and [title guidance](https://github.com/coreyhaines31/marketingskills/blob/73573e94a06a39965978b3fa1f9c1eace8cebc7c/skills/seo-audit/references/title-tags.md): information architecture, unique page value and template-aware metadata.
- [SEO Machine internal-linker](https://github.com/TheCraigHewitt/seomachine/blob/120e7b46dc07c98382cd4f68ac5b6515ab9f2604/.claude/agents/internal-linker.md) and [keyword mapper](https://github.com/TheCraigHewitt/seomachine/blob/120e7b46dc07c98382cd4f68ac5b6515ab9f2604/.claude/agents/keyword-mapper.md): contextual linking merit and keyword-density/overlap heuristics not adopted as proof.
- [SEOnaut orphan query](https://github.com/StJudeWasHere/seonaut/blob/a67387fe63a291be2ba49dd02399f20e453eb8b5/internal/issues/multipage/orphan.go), [duplicate titles](https://github.com/StJudeWasHere/seonaut/blob/a67387fe63a291be2ba49dd02399f20e453eb8b5/internal/issues/multipage/title.go), [duplicate bodies](https://github.com/StJudeWasHere/seonaut/blob/a67387fe63a291be2ba49dd02399f20e453eb8b5/internal/issues/multipage/body.go) and [depth rule](https://github.com/StJudeWasHere/seonaut/blob/a67387fe63a291be2ba49dd02399f20e453eb8b5/internal/issues/page/depth.go): cross-page analysis and its corpus/threshold limits.
- [Unlighthouse sampling](https://github.com/harlan-zw/unlighthouse/blob/ea2baf26e85a13e5718304fb90806f0f81a20537/docs/1.guide/guides/dynamic-sampling.md), [CI guide](https://github.com/harlan-zw/unlighthouse/blob/ea2baf26e85a13e5718304fb90806f0f81a20537/docs/2.integrations/1.ci.md) and [CI implementation](https://github.com/harlan-zw/unlighthouse/blob/ea2baf26e85a13e5718304fb90806f0f81a20537/packages/cli/src/ci.ts): actual sampling and budget behavior; browser/lab execution remains deferred.
- [SiteOne README](https://github.com/janreges/siteone-crawler/blob/f3d967b190a77ff5f816b7ddab74c1a778d9dbaf/README.md) and [JSON output](https://github.com/janreges/siteone-crawler/blob/f3d967b190a77ff5f816b7ddab74c1a778d9dbaf/src/output/json_output.rs): structured exports and explicit quality-gate exit behavior.
- GitHub repository metadata for the six linked upstreams, retrieved 18 November 2026: default refs, stars, push dates, fork/archive status and root license metadata. No third-party implementation was installed or executed for this research.
- [Google link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable): crawlable anchors and descriptive links. [Canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): canonicals are signals, not verified index choices. [Helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): original reader value, not a numeric keyword recipe.
- [Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview/): page audits, JSON reports and regression tooling already available upstream; this feature does not run them.
- Local SEO source at `9e5e11f8c0f3b6b1503f5f58a9989e6c29502697` and the two linked feature documents: the existing behavior and non-overlapping parallel boundary.
- Engineering conventions and `guides/humanize-prose.md` at `vhco-pro/docs@1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff`: feature format, code/runtime, CLI, review and delivery requirements.
