---
status: draft
status_description: "Being written; not yet reviewed."
issue: null
goal: "An adopter can run a free-first website SEO assessment through vh-adlc that spends paid API units only when allowed and leaves exports usable after access ends."
covers:
  - plugins/vh-adlc/skills/vh-adlc-seo/
  - plugins/vh-adlc/agents/vh-adlc-seo.agent.md
  - plugins/vh-adlc/references/seo.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - docs/user-guides/workflows.md
  - docs/get-started/installation.md
  - docs/reference/compatibility.md
  - docs/research/seo-agent-validation-2026-10-30.md
  - tests/vh-adlc/seo.test.ts
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - tests/vh-adlc/maintenance/discovery.test.ts
  - tests/vh-adlc/evidence/seo/
---

# Plan: Free-first SEO assessment

Add a `vh-adlc-seo` operation that assesses a website's technical search readiness, measured visibility and content opportunities from free sources, uses Semrush only when access exists and spending is allowed, and saves evidence that stays useful after access ends.

## Context

### Owner summary

On 30 October the owner asked for "an SEO agent that will evaluate the viability of my site using these free sources", with Semrush used only while its temporary token works. The owner chose a reusable vh-adlc operation, with Stackweaver's domains and markets in a small local adapter. A Codex session built it on `feat/seo-agent` and added Search Console and crawl lessons on 7 November. It was never specified or independently reviewed. PR #76 now carries it, and an independent PR review found 11 problems. This document specifies the operation and those fixes.

After this change, `vh-adlc-seo <site or brief>` reads the adopter's SEO adapter, inventories which sources are actually accessible, and runs public HTTP and browser checks every time. It uses Search Console, Bing Webmaster Tools, Ahrefs Free, PageSpeed or local crawlers when they are available. Missing access is reported as a coverage gap, never as a zero. Findings are ranked, each with affected URLs, impact, confidence and a validation step. Raw responses, a findings table and a SHA-256 manifest are saved where the adapter says.

Semrush stays optional. A call that spends units needs the owner's request in the current run or a permission declared in the adapter, and the operation never buys units or plans. The key comes from an environment variable or a local credential file, and any `key=` value is redacted before a request is saved. The owner said to focus on free tools, so a run with no Semrush permission is the normal case.

An assessment writes only its report and exports. It never publishes content, changes DNS or indexing, creates accounts, commits or pushes. A live recheck after a site change is handed to the owner rather than done silently later. The operation adds no onboarding files and is not a software feature or a codebase audit.

The 30 October validation note becomes a dated historical record, because later procedure sections were never tested against it. Proof will come from a static contract test, the package checks and a new offline forward scenario with a stub Semrush client. None of these has run yet.

Acceptance authorizes implementing this on `feat/seo-agent` and updating PR #76. Merging still needs the owner's request.

### Background

On main at `bda1a8771a837cb028df3cb4d125f9c7da2735ff` the package has fifteen skills and no SEO operation: `tests/vh-adlc/triage/discovery.test.ts` asserts `toHaveLength(15)`. `plugins/vh-adlc/plugin.json:5` and `plugins/vh-adlc/.claude-plugin/plugin.json:4` describe lifecycle, maintenance, article drafting and documentation impact, with no SEO. `plugins/vh-adlc/references/authority.md:10-35` has no row for paid API usage. `plugins/vh-adlc/references/loop.md:63-64` lists the operations that add no onboarding files.

The request is in the local Codex session `~/.codex/sessions/2026/10/27/rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`. At 2026-10-30T01:33 the owner asked for free alternatives to Semrush. At 13:19 the owner asked for the SEO agent. At 13:20 the owner answered a question on whether it should be "reusable in vh-adlc, with Stackweaver's domains and European target markets kept in a small local adapter" with "Reusable vh-adl…". At 2026-11-07T21:27 the owner asked to "put those three improvements into the shared SEO skill".

`feat/seo-agent` at `8e028c2` (`git log origin/main..8e028c2`: `89e133d`, `82a5128` and a merge of main) adds:

- `plugins/vh-adlc/skills/vh-adlc-seo/SKILL.md`;
- `plugins/vh-adlc/agents/vh-adlc-seo.agent.md`, whose tools include `Edit` and whose description does not name its skill;
- `plugins/vh-adlc/references/seo.md`;
- a lifecycle routing row, a `workflows.md` section and sixteen-skill counts with updated tests;
- `docs/research/seo-agent-validation-2026-10-30.md`;
- an offline evidence set under `tests/vh-adlc/evidence/seo/free-first-offline-2026-10-30/`.

In that `seo.md`, lines 91-98 allow bounded Semrush reports "if access works and fresh data would change the assessment", with no spending permission. Line 23 forbids credentials in URLs, but the Semrush API takes its key as a query parameter, and line 151 only says headers and tokens are removed from preserved parameters. Lines 120-124 tell the assessor to repeat a startup check "against the live deployment when the change ships", which is a later action outside an assessment's scope.

The validation note says the package "prepares 0.7.0 from `fcf7cd5`" and cites 58 tests. It predates the Search Console, crawler-verification and startup sections added in `82a5128`.

Stackweaver's adapter is `agents/seo.md` on its main branch (branch `docs/seo-performance-followup-20261105`, an ancestor of `origin/main`). It names the official origin, an owned previous host, a separate consultancy site, five European markets, primary journeys, prior research paths, durable and raw export locations, a local Semrush credential path and its authority limits.

## Scope

In scope:

- The `vh-adlc-seo` skill, agent and `references/seo.md` procedure.
- The adapter contract.
- The Semrush unit-spending rule and its authority row.
- Credential handling and redaction.
- Routing, onboarding and documentation updates.
- The historical label on the validation note.
- Static and offline scenario tests.
- The package version.

Out of scope:

- Live Google, Bing, Ahrefs or Semrush integration proof on every host. Each run reports the integrations it exercised.
- Buying or setting up any account.
- Scheduled monitoring.
- Fixing the sites the assessment finds problems on.
- Article writing, which stays with `vh-adlc-blog`.
- Codebase audits, which stay with `vh-adlc-audit`.
- Stackweaver's own adapter content.

## Design

### Entry and routing

`plugins/vh-adlc/skills/vh-adlc-seo/SKILL.md` is a short entry to `references/seo.md` and the agent. It resolves the verified binary and requests `conventions/documentation.md`, `conventions/feature-documents.md` and `guides/humanize-prose.md` through `knowledge`, using the loop's knowledge failure handling. It cites `references/authority.md` for every write and spending decision. An assessment is a report, not a feature, and changes no feature state.

`references/loop.md` adds `vh-adlc-seo` to the operations that add no onboarding files. `references/lifecycle.md` keeps the routing row for website SEO and search-visibility requests and notes that an "SEO audit" request stays with `vh-adlc-seo`, while a codebase audit stays with `vh-adlc-audit`.

The agent drops `Edit`, keeping read, search, Bash, `Write` for the report and exports, and web access. Its description ends "Used by vh-adlc-seo".

### Adapter

The adapter is a Markdown file the adopter's repository instructions name, such as Stackweaver's `agents/seo.md`. The procedure reads these keys from it, and infers any that are absent from context before asking:

- official origin;
- owned aliases and previous hosts;
- separate sites to exclude unless requested;
- target countries and languages;
- primary journeys;
- prior research to read;
- the durable findings location;
- the raw export location;
- the Semrush credential source;
- the Semrush unit permission;
- connected first-party sources;
- the adopter's authority limits.

Domains, markets and publication rules stay in the adapter, never in the shared package.

### Sources and assessment

The procedure keeps the free sources and their jobs from `feat/seo-agent`'s `seo.md`: Search Console, Bing Webmaster Tools, Ahrefs Free, public HTTP and browser checks, Screaming Frog Free or local crawlers, and PageSpeed or Lighthouse. It also keeps the Search Console handoff, crawler verification, evaluation and prioritization, and the evidence-and-manifest rules. Public checks always run. Missing access is a coverage gap, and missing values are blank with an explicit outcome, never zero.

The startup-flash check stays, with one change. A recheck after the change ships becomes an owner handoff item naming the URL, build identity and check, instead of an instruction to repeat it later.

### Semrush

Semrush is used only through an authorized local credential or a connected tool. Reading saved exports needs no extra permission. A request that spends API units needs one of two things: the owner's request in the current run, or an adapter entry that permits unit spending, optionally with a per-run limit. Without either, the run skips fresh Semrush calls, says so in source coverage, and finishes from free sources and saved exports. The operation never buys units or plans, creates projects or campaigns, or probes unrelated projects.

The key is read at request time from an environment variable or the adapter's local credential file. It is never written into prompts, reports, client bundles or archives. Before any request URL or parameter set is saved, the `key` value is replaced with `REDACTED`.

### Authority

`references/authority.md` gains a row: spending a paid SEO provider's API units needs the owner's current request or the adopter's SEO adapter permitting it, within any stated limit. Buying units, plans or accounts needs separate approval for that exact action.

### Documentation and packaging

- `docs/reference/compatibility.md` gains an "SEO assessment" section with the evidence actually observed and its limits. The `workflows.md` SEO section links to it.
- Both package manifest descriptions mention SEO assessment, and so does the vh-adlc entry in `.claude-plugin/marketplace.json`.
- The skill counts read sixteen in `workflows.md`, `installation.md` and the discovery tests.
- `docs/research/seo-agent-validation-2026-10-30.md` opens with a dated historical note. It says the note covers `89e133d` only, that the later Search Console, crawler and startup sections were not part of that test, and that its version, pin and test-count statements describe that date.
- Both manifests take the next minor version after the blog visual reading change, under the repository's version policy.

## Acceptance Criteria

- [ ] AC-01: The package exposes `vh-adlc-seo` as a sixteenth skill, routed from SEO and search-visibility requests including "SEO audit", while codebase audit requests still route to `vh-adlc-audit`.
- [ ] AC-02: The SEO agent has no `Edit` tool and its description names `vh-adlc-seo`; the skill entry cites `references/authority.md` and the loop's knowledge failure handling.
- [ ] AC-03: Without an owner request or adapter permission, an assessment makes no unit-spending Semrush call, reports Semrush as skipped in source coverage and still delivers findings from free sources.
- [ ] AC-04: With adapter permission, every saved Semrush request shows `key=REDACTED`, and no saved file contains the key.
- [ ] AC-05: `references/authority.md` has a paid-API-unit row, and the procedure reads the adapter keys listed in this document.
- [ ] AC-06: A completed assessment writes only inside the adapter's report and export locations, saves a findings table and a manifest whose SHA-256 digests verify, and lists any live recheck as an owner handoff.
- [ ] AC-07: `vh-adlc-seo` adds no onboarding files, and `references/loop.md` lists it with the other operations that add none.
- [ ] AC-08: The compatibility record has an SEO assessment section linked from the user guide; both manifests and the marketplace entry mention SEO; the validation note is marked historical; and the package checks pass at the new version.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/triage/discovery.test.ts` and `maintenance/discovery.test.ts` skill counts; new `tests/vh-adlc/seo.test.ts` asserts the lifecycle row names `vh-adlc-seo` and SEO audit, and the audit row is unchanged. |
| AC-02 | `seo.test.ts` parses the agent front matter and the skill entry. |
| AC-03 | Offline forward scenario in a separate agent context, run as the 2026-10-30 test was, with an adapter that grants no Semrush permission and a stub Semrush client on `PATH` that logs every call. The log is empty, source coverage shows Semrush skipped, and findings exist. |
| AC-04 | Same scenario with adapter permission and a stub that requires `key=` in the URL. Search every saved file for the fixture key and assert `key=REDACTED` in saved requests. |
| AC-05 | `seo.test.ts` asserts the authority row and each adapter key in `references/seo.md`. |
| AC-06 | Both scenario runs: compare the fixture tree before and after against the adapter's locations, recompute the manifest digests, and check the handoff for the recheck item. |
| AC-07 | `seo.test.ts` asserts the `loop.md` list; scenario fixtures show no new `AGENTS.md` or bridge files. |
| AC-08 | `seo.test.ts` checks the compatibility section, its link, the manifest and marketplace text and the historical note; `tests/vh-adlc/check.test.ts` for the version; full suite `bun test tests/vh-adlc`. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- `plugins/vh-adlc/references/authority.md`, `references/loop.md`, both package manifests and `tests/vh-adlc/triage/discovery.test.ts` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- `feat/seo-agent` at `8e028c2`, its `references/seo.md`, skill, agent and validation note, and its independent PR review in this session.
- Stackweaver `agents/seo.md` at branch `docs/seo-performance-followup-20261105`, contained in `origin/main`.
- Local Codex session `rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`, entries at 2026-10-30T01:33, 13:19, 13:20 and 2026-11-07T21:27.
- Engineering docs at `d8f07c9dd69038375a535af8ad586086688f85ab`: `conventions/feature-documents.md`, `guides/feature-document-template.md`, `guides/humanize-prose.md`.
