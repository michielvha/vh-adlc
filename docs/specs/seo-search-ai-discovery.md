---
status: draft
status_description: "Fresh independent spec review R-3 has no findings on current main; awaiting owner acceptance of the reviewed document."
issue: null
goal: "An adopter can identify and prepare verified repository repairs for conventional search and AI-search discovery while measuring visibility separately from technical readiness."
covers:
  - plugins/vh-adlc/skills/vh-adlc-seo/
  - plugins/vh-adlc/agents/vh-adlc-seo.agent.md
  - plugins/vh-adlc/references/seo.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - tests/vh-adlc/seo.test.ts
  - tests/vh-adlc/seo/
---

# Plan: SEO repairs and AI discovery

Extend the SEO operation with provider-specific discovery checks, evidence of search and citation visibility, and an explicit route into tested repository repairs.

## Context

### Owner summary

Stackweaver already serves substantial public HTML, but this does not tell us whether search engines index its pages or AI services cite them. The existing SEO agent assesses a site and saves findings. It does not prepare site repairs. This addition makes it useful for improving discovery through Bing and Google and through search-backed answers in ChatGPT, Copilot, Claude and Perplexity.

The existing assessment invocation remains available. An explicit improvement request can assess a selected repository and carry authorized repairs into vh-adlc's existing maintenance or feature procedure. Each repair needs a reproduced problem and relevant checks. New product behavior still needs its own accepted consumer feature. The shared operation contains no Stackweaver domains, market list or product claims; these stay in the consumer's adapter and source.

The owner chose local preparation and testing followed by vh-adlc review and shipping, and chose to preserve the existing AI-training crawler policy. This addition therefore distinguishes search crawlers, training crawlers and user-triggered fetchers. A working request with a crawler's user-agent string is only a diagnostic request. It does not establish that the provider crawled, indexed or cited the page.

First-party search data and dated provider-answer observations are used when authorized and available. Missing measurements remain unknown. No paid provider call, account setup, scheduled monitoring, search-engine submission, publication or deployment follows merely from assessment or local repair. IndexNow is evaluated as a possible consumer improvement, with its submission step requiring separate authority. An optional documentation index such as `llms.txt` must have a maintenance purpose and receives no promised ranking benefit.

Implementation depends on completing the existing [SEO assessment feature](seo-assessment.md), which remains claimed on `feat/seo-agent`. This document does not take over that feature. The checks below are planned, not executed implementation proof. The owner's initial scope approval precedes independent review and is not recorded as acceptance of a reviewed commit. Acceptance of this document authorizes the shared-agent feature within its scope; individual consumer repairs, spending, shipping and live operations retain their own authority requirements.

### Background

- `git rev-parse HEAD` in the vh-adlc default checkout returned `b3e65115a7f2a6fc9160ffc7524c8936f09b2a6d` on 18 November 2026. At this revision, `docs/specs/seo-assessment.md:2-5` is in progress on `feat/seo-agent`, while the SEO skill and procedure have not landed on the default branch.
- The owner-selected development checkout `/home/m/code/vh-adlc-seo-agent` is at local commit `9e5e11f8c0f3b6b1503f5f58a9989e6c29502697`. Its `plugins/vh-adlc/agents/vh-adlc-seo.agent.md:27-31` restricts writes to new assessment reports and exports. Its `references/seo.md:257-291` distinguishes readiness and measurement and prioritizes findings; `references/seo.md:295-309` defines preserved evidence and null missing values. These contracts are the base to extend, not an installed release claim.
- Anonymous HTTP requests on 18 November 2026 found 100 URLs in Stackweaver's sitemap. All returned 200 with matching canonicals, a description and one H1, without detected noindex directives. Three documentation URLs shared the title `Troubleshooting | Stackweaver`. The homepage returned 200 to diagnostic requests using Bing, OpenAI, Claude and Perplexity search crawler user-agent strings. `/llms.txt` and `/llms-full.txt` returned 404. The previous host returned 200 with `X-Robots-Tag: noindex, nofollow`. These are bounded public observations, not search-performance measurements.
- The local evidence is `/home/m/code/stackweaver/.tmp/seo-research/ai-discovery-2026-11-18/findings.json` and `manifest.json`: 110 HTTP request records and 111 verified file hashes. No Search Console, Bing performance or provider-citation measurement was retrieved. These ignored exports remain outside this repository; repeatable implementation proof uses the fixtures below.
- The current [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots) separates search, training and user-triggered requests. [Google's AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) says established SEO practices apply without special AI optimization requirements. [Bing AI Performance](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/) reports citation activity across supported Microsoft surfaces and warns that these counts do not establish ranking or placement.

## Scope

Include provider-specific technical checks, source-backed content opportunities, available first-party and sampled citation evidence, and an explicit improvement mode that hands authorized fixes to existing vh-adlc procedures. Keep the current assessment defaults, evidence handling, optional Semrush rules and adopter separation.

Exclude building a ranking service, new paid API clients, scraping signed-in consumer chat products, guaranteed placement, training models, changing training policy, backlink purchases, fabricated reviews, hidden crawler-only content, automatic account setup, automatic submissions and scheduled monitoring. This shared feature does not implement or deploy the Stackweaver repairs it identifies. A consumer repair follows the consumer's own instructions and authority.

## Design

### Terms and invocation

| Term | Meaning |
| --- | --- |
| Technical readiness | Observed ability to discover and read public content under the tested request conditions. |
| Search visibility | Dated search-engine performance or indexing evidence from the named property and source. |
| Citation observation | A preserved provider answer and its cited URLs for one recorded prompt and run configuration. |
| Improvement mode | An explicit SEO request that can continue into authorized repository repairs through existing vh-adlc procedures. |

`vh-adlc-seo <site or brief>` keeps assessment behavior. `vh-adlc-seo improve <repository and scope>` selects improvement mode; an equally explicit natural-language request has the same route. This is a skill argument, not a new Go binary subcommand. Merely asking what could improve a site remains assessment. The skill and lifecycle procedure make this distinction, and the agent's tool declaration permits edits only as the host supports; tool availability never grants repair authority.

Improvement scope identifies the consumer repository, authorized public origin or URLs, and selected findings or a bounded repair brief. If that scope is missing, assess and propose the concrete repair set before dependent edits. Read the consumer's instructions and adapter before making any write. Keep adapter changes subject to the consumer's own workflow and explicit scope; assessment still never edits it.

### Provider-specific discovery

Extend `references/seo.md` with a dated provider matrix, citing official documentation and the date it was checked. Cover Google Search and its AI features, Bing/Copilot, OpenAI search, Claude search and Perplexity. Record crawler purpose separately from training and user-triggered fetchers, supported controls, relevant access evidence and the limits of that evidence. Refresh guidance when using it; unavailable documentation leaves the affected claim unverified rather than inferred.

Always retain the existing bounded HTTP checks. Inspect robots groups and applicable page/header controls, sitemap inclusion and discovery links, canonical URLs and redirect chains, HTTP content types and status codes, and useful content in initial HTML. Compare rendered content only when an authorized browser driver is available. Detect challenge/login/error bodies even under HTTP 200. Diagnose named crawler access only where current provider guidance supports the method. Keep diagnostic user-agent requests separate from verified crawler requests. Follow the existing trusted-proxy/IP verification procedure before attributing logs to a provider; lack of log access is a coverage gap.

Preserve the effective training policy for all paths a repair touches. Do not broaden or narrow training access as a side effect of search changes, including changes to a shared wildcard robots group. Check the resulting rules for training agents and paths as well as the search agent that motivated the change. Treat user-triggered fetchers according to each provider's documented behavior; do not assume robots controls apply uniformly.

Treat an existing noindex policy as policy until the owner's launch intent establishes a defect. IndexNow and sitemap submission are discovery notifications, not ranking or indexing proof. Assessment may inspect their existing configuration and propose improvements. Local code/configuration can be prepared only under the consumer repair route, and no notification is sent without explicit submission authority. Preserve accepted staging/private exclusions.

### Measurement and content

Use authorized existing read-only connections or supplied exports for Google Search Console and Bing Webmaster Tools. Include Bing AI Performance when available, with its actual surface coverage and metric definitions. Record source, property/host, engine or provider, period, country, language, device and filters when applicable. Mark dimensions not supplied by a source as unavailable; do not assign a country from an English answer. Separate clicks, impressions, index verdicts, referral visits, estimated traffic and citation counts. Missing numeric values are null with an explicit reason. Partial and historical samples stay labelled.

For citation observations, accept owner-supplied answers/exports or an already authorized provider interface. Record the exact prompt, provider, model or product label when exposed, timestamp, search/browsing mode, language, locale when exposed, cited URLs, and whether the answer mentions the product. Include the number of completed observations and failures. Model/product metadata not exposed by the interface stays unknown. Keep branded and unbranded prompts separate; no fixed prompt suite is inferred from a domain. The owner supplies or approves the actual suite before provider queries. No new paid call, account login or authenticated consumer-chat scraping is introduced by this feature.

Repeat only owner-authorized observations. Compare matching prompts, provider surface, language/locale and search mode, recording changes in exposed model/product identity and coverage. Report citation frequency only within that sample, with its denominator; it is not a universal rank, a stable product recommendation or causal proof that a site repair worked. A rate change and a technical improvement remain separate observations.

Evaluate pages against real user tasks and product evidence: what the product does, supported installation paths, accurate limitations, useful comparisons, tested examples, authorship and sources. Prioritize missing answers and unclear navigation with affected URLs and validation steps. Consumer copy must follow the consumer's author and public-documentation workflows. Structured data must agree with visible content; introduce no unsupported product capability, testimonial, review score or commercial claim. Propose off-site authority/content opportunities only with source evidence; do not publish messages or buy links.

An optional `llms.txt` or Markdown representation is an engineering/content opportunity only when it helps an identified reader or integration. Its absence alone is not an indexing blocker, and adding one never proves ranking gain. If selected later as consumer work, derive it from public canonical sources, test for stale/private links and follow that consumer's build and publishing route. Do not maintain a second invented product description.

### Repair route and recovery

Improvement mode first produces the existing findings and evidence. For each selected repair, record the consumer repository/base commit, affected URLs/source paths, observed defect, proposed behavior, current authorization and concrete check. Route preserved-contract repairs through bounded maintenance; new behavior, permissions, formats or delivery policy through a separate accepted consumer feature. The shared-agent feature's acceptance does not accept a consumer feature. Reuse a matching existing consumer task; never create a duplicate feature or bypass a claimed writer's handoff.

Before editing, observe a failing regression or other relevant baseline. Prepare only the authorized source patch and run the consumer's checks. A generated site change edits its canonical input and uses its actual generator. The repair record names the affected production artifacts and their build paths. For frontend changes, the consumer's required browser/visual checks and production build apply. A failed or unavailable required check remains incomplete. Independent review and an explicit ship request precede publication; source readiness, pushed CI, merge, release, deployment, live checks and measured visibility are recorded separately.

Use the existing lifecycle's records and branch rules; add no shared job scheduler, execution queue or approval cache. Concurrent assessments write distinct new run directories. Repairs use the existing single-writer claim/handoff rules and stop if the base, selected source or working tree changes incompatibly. Preserve unrelated work and evidence; never reset or stash it. A partial patch or failed test stays visible in the task record and is resumed from actual Git state. Retrying an improvement request reuses its existing task and rechecks current authorization and source; it does not replay a prior ship or submission permission.

Older adapters need no new mandatory field. Provider guidance is shared; origins, markets, article conventions and output locations remain consumer-owned. Assessment keeps its existing report/export-only write boundary. An upgrade adds improvement routing without expanding old assessment invocations. Rolling back the plugin leaves consumer commits and evidence intact; any source rollback follows the consumer's existing reviewed Git procedure, and production rollback requires its own authority.

### Packaging and documentation

Extend the existing skill, agent, SEO reference, lifecycle and authority entries, workflows and compatibility documentation together. Do not add a second SEO skill or a standalone local fork. Add the improvement distinction and provider roles to user documentation, including what an ordinary assessment cannot do. Keep package manifests and marketplace metadata consistent at implementation time under the existing version policy; select the next version from the then-current main branch, not the historical SEO feature version.

The affected deliverable is the vh-adlc plugin directory, published by the repository's existing marketplace/plugin path. Run the existing plugin checker on the final source and validate both manifests and marketplace entry. No binary command, new install platform or release pipeline is introduced. Existing Semrush permission, spending and redaction checks remain unchanged and passing.

## Acceptance Criteria

- [ ] AC-01: Existing SEO assessment requests still perform bounded public checks and write only their reports/exports; explicit improvement requests alone can route authorized fixes into the consumer's existing lifecycle.
- [ ] AC-02: Discovery assessments distinguish provider search crawlers, training crawlers and user-triggered fetchers, identify tested access/content blockers, preserve training policy in proposed repairs and avoid attributing diagnostic user-agent requests to verified crawlers.
- [ ] AC-03: Search and AI-visibility findings preserve each available source's scope, metrics and provenance, distinguish missing/historical/partial evidence, and leave unsupported values unknown.
- [ ] AC-04: Citation comparisons preserve the actual prompts, provider/run configuration, cited URLs and completed/failed sample sizes, and make claims only about that sample without initiating unapproved provider queries or spending.
- [ ] AC-05: Content and metadata repairs address demonstrated reader/discovery problems through canonical source files and accurate visible claims; optional AI text indexes and structured data receive no unsupported ranking claim.
- [ ] AC-06: An authorized improvement request produces a tested local consumer repair through the correct maintenance or accepted-feature route, while preserving ownership, unrelated work and separate publication/live-operation boundaries.
- [ ] AC-07: Partial failure, repeated requests and concurrent work retain evidence, avoid duplicate repair tasks or replayed delivery, and keep unsuccessful or unexecuted checks visibly incomplete.
- [ ] AC-08: The existing skill, user documentation, authority/routing guidance and plugin package agree on assessment versus improvement behavior, and old adapters continue to work without migration.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Extend `tests/vh-adlc/seo.test.ts` and the forward harness under `tests/vh-adlc/seo/` with an assessment run and an improve run against the same fixture. Snapshot the fixture repository before/after. Assessment must leave every existing file and Git ref unchanged and create only report/evidence files in declared locations. Improve must enter the selected consumer procedure only under the explicit request. |
| AC-02 | Provider-control fixture scenarios cover search allowed/training denied; a search block inherited from a wildcard group; path-specific training rules; intentional staging noindex; a 200 challenge body; and unavailable logs. Check actual directives, preserved training behavior at the affected fixture paths, and report provenance. A synthetic UA request must never appear as verified provider traffic. Source review checks the dated official references. |
| AC-03 | Feed fixtures containing Google and Bing exports, a Bing AI citation sample, an old export and no account connection. Inspect the resulting machine-readable findings and report against source rows: engine/property/period and supplied dimensions remain distinct, unavailable values are null, old/partial coverage is labelled, and no-account checks still complete public assessment. |
| AC-04 | Use supplied answer fixtures for branded and unbranded prompts: one citation, one product mention without citation, one completed answer with neither, one failed request and an answer with model/locale unexposed. Verify cited URLs and exact prompts, separate mention/citation counts, a denominator of completed observations, recorded failures and unknown metadata. Add two-run fixtures: a matching comparison must preserve each run's completed/failed denominators and disclose changed model identity or coverage; paired observations that differ in prompts, provider surface, language, locale or search mode must remain separate without a comparative improvement claim. Exercise each mismatch independently. A recording provider stub must receive no request without current suite/query authority. No live paid service is needed. |
| AC-05 | Use a small generated-site fixture with duplicate page titles, a broken discovery link and public canonical source. The improve scenario edits inputs, rebuilds the fixture and observes distinct served titles and a working link. Companion cases with missing `llms.txt`, mismatched JSON-LD and unsupported capability copy must respectively remain an optional opportunity, expose the content mismatch and avoid inventing a claim. Review the emitted content and resulting HTTP behavior. |
| AC-06 | Run improvement scenarios against disposable consumer repositories: one documented metadata regression eligible for maintenance, one new site behavior requiring an accepted feature, and one claimed by another writer. Observe the regression fail before the eligible repair and pass after the generated build. Check the maintenance record and independent-review handoff. Without an accepted consumer feature or owner handoff, dependent edits must stop. Fake Git/notification endpoints record no push, PR, merge, deployment or IndexNow submission without its separate current authority. |
| AC-07 | Interrupt an improve scenario after a partial patch, resume it, repeat the request after a completed local repair, and run two assessments into separate directories. Also change the repair base between proposal and edit and inject a failing required build. Add recording-endpoint variants for prior shipping and prior IndexNow submission: first complete the selected action under explicit current authority and its other required consumer gates, then resume or repeat that task with the authority absent, and separately with it explicitly withdrawn. The retry must reuse the task and preserve its evidence without another publication or submission request. All endpoints are disposable stubs, never real publication or search services. Inspect Git state and records: unrelated staged/untracked work survives, assessment exports remain separate, base drift stops dependent writes, and failure is never reported as completion or delivered. |
| AC-08 | Run `bun test tests/vh-adlc/seo.test.ts`, the added forward scenarios and `bun test tests/vh-adlc` on the final source. Inspect the real packaging inputs, both plugin manifests and marketplace metadata for agreement. Exercise an existing adapter with no added keys and confirm the original Semrush permission/redaction tests still pass. Required scenarios that cannot run remain unverified; a static wording test alone cannot establish the behavior above. |

## Tasks

None yet; written once the reviewed document is accepted and planned. Implementation also waits for the existing SEO assessment feature to finish and land.

## Open Questions

None. The owner approved the proposed scope, local preparation followed by review/shipping, and preserving training policy on 18 November 2026. Future consumer selections, prompt suites and live operations retain their own authority; they are not silently selected here.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-18 | R-1 | spec | `f69e8e2b0905eb98eb12e6b9f3c523b5967d004b` | unknown | procedural | Two should-fix findings in comparison and retry proofs; model identity not attested. |
| 2026-11-18 | R-2 | spec | `aabe627e581deb520bc74b1478aba4efd9037cfc` | unknown | procedural | No findings; model identity not attested. |
| 2026-11-18 | R-3 | spec | `2ad0443a658b40fd2d69a1d958370c620f730c49` | unknown | procedural | No findings; model identity not attested. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design > Measurement and content, lines 82-84; Acceptance Criteria > AC-04, line 111; Test Plan > AC-04, line 124
EVIDENCE: The design requires comparisons between matching prompts, provider surfaces, language/locale and search modes, with changes in model identity and coverage recorded. The AC-04 proof supplies answer fixtures and checks extraction, counts, missing metadata and query authority, but requires no comparison between runs. An implementation that correctly extracts each answer and then reports a citation-frequency improvement across different prompt suites or search modes could pass this proof.
PROPOSAL: Add two-run fixtures with a matching comparison and deliberately mismatched prompts, provider surfaces, language/locale and search modes. Require valid comparisons to retain their denominators and changed metadata, and require mismatched observations to remain separate without a comparative improvement claim.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design > Repair route and recovery, line 96; Acceptance Criteria > AC-07, line 114; Test Plan > AC-06 and AC-07, lines 126-127
EVIDENCE: The design requires retries to recheck current authorization and forbids replaying prior ship or submission permission. AC-07 repeats a completed local repair, while AC-06 checks endpoints without separate current authority. Neither proof requires an earlier authorized delivery or submission followed by a retry with that authority withdrawn or absent. An implementation that retains and replays a previously authorized action could pass both scenarios.
PROPOSAL: Add a retry scenario whose first run has explicit ship or submission authority against recording endpoints, then resume or repeat the same task without that authority. Require task reuse and retained evidence while observing no repeated publication or submission request.

### R-2

NO FINDINGS

### R-3

NO FINDINGS

## Sources

- [SEO assessment feature](seo-assessment.md): the existing assessment contract and active branch dependency.
- Local `git show 9e5e11f8c0f3b6b1503f5f58a9989e6c29502697:plugins/vh-adlc/references/seo.md` and `agents/vh-adlc-seo.agent.md` under that plugin: the owner-selected development source, write boundary and preserved evidence rules.
- Stackweaver's local ignored `ai-discovery-2026-11-18/findings.json` and `manifest.json` under `.tmp/seo-research/`: the dated public baseline and its verification limits.
- [OpenAI crawlers](https://developers.openai.com/api/docs/bots), read 18 November 2026: independent search/training controls, published crawler IP ranges and user-triggered fetch behavior.
- [Google AI features and your website](https://developers.google.com/search/docs/appearance/ai-features), read 18 November 2026: conventional SEO eligibility and no special AI optimization requirement.
- [Bing AI Performance public preview](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/), read 18 November 2026: cited pages, grounding-query samples, supported surfaces and limits on interpreting counts.
- [IndexNow setup](https://www.bing.com/indexnow/getstarted), read 18 November 2026: ownership key, hosted key file and submission/verification steps.
- [Anthropic crawler controls](https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), read 18 November 2026: distinct search, training and user fetchers.
- [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers), read 18 November 2026: search crawler, user fetcher and published address guidance.
- Engineering conventions and `guides/humanize-prose.md` at `vhco-pro/docs@1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff`: feature format, independent review, owner acceptance and delivery boundaries.
