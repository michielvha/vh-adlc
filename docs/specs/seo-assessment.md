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
| 2026-11-11 | R-1 | spec | `70f88db` | unknown | procedural | 12 findings: 1 blocking, 9 should-fix, 2 nits; model identity not attested |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Test Plan (AC-03, AC-04); Design, Semrush
EVIDENCE: Test Plan line 161 says AC-03 passes when "a stub Semrush client on PATH that logs every call" shows "The log is empty". Line 162 says AC-04 passes when every saved file is searched for the fixture key and saved requests show `key=REDACTED`. The package ships no Semrush client. `grep -rli semrush plugins/` on feat/seo-agent at 8e028c2 finds only seo.md, the SKILL and the agent, and `plugins/vh-adlc/scripts/` has no Semrush helper. seo.md:91 allows "an authorized local credential/client or a connected tool". The Design never says which command or tool makes a Semrush request, so the agent could use curl, WebFetch or a connector and bypass a PATH stub. In that case the AC-03 log is empty because the stub was never on the call path. If no Semrush request is made at all, AC-04 ("every saved Semrush request shows key=REDACTED") is also true with nothing saved. Both central spending and redaction proofs can pass while the problem remains.
PROPOSAL: Define in Design the single request route the procedure uses, such as a named command or `curl` against the Semrush API host, and make the stub intercept that route. Make the AC-03 scenario block or log all other egress. Require the AC-04 run to log at least one stub call and save at least one request, so it serves as the positive control for AC-03.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush; Acceptance Criteria AC-04; Test Plan AC-04
EVIDENCE: Design line 130: "It is never written into prompts, reports, client bundles or archives. Before any request URL or parameter set is saved, the `key` value is replaced with `REDACTED`." The Design does not say which component reads the key. If the agent reads it with Bash and builds the URL itself, the key ends up in the model context, the tool transcript and process arguments. authority.md:69 says "Never print tokens, credential-bearing URLs ... or keys." seo.md:23 ("Never paste credentials into prompts, URLs, ...") conflicts with a key-in-URL API, as Background line 62 notes, but no Design line amends it. The AC-04 proof searches only saved files.
PROPOSAL: Specify a mechanism that keeps the key out of the agent's context and command lines, such as a client that reads the env var or file itself. State how seo.md:23 is reworded. Extend the AC-04 proof to search the scenario agent's transcript and tool output for the fixture key.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Adapter
EVIDENCE: Design line 103 says the procedure "infers any that are absent from context before asking". The listed keys include "the Semrush credential source", "the Semrush unit permission" and "the adopter's authority limits" (lines 113-116). Design line 128 requires "an adapter entry that permits unit spending", and authority.md:70 says "Never try unrelated credentials." If inference applies to a permission key, spending could be authorized without any adapter entry. If it applies to a credential key, the agent may go looking for credentials.
PROPOSAL: Exclude the permission, credential-source and authority-limit keys from inference. State that an absent unit permission means no permission and an absent credential source means no Semrush call, and add a check for this to AC-05 or AC-03.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Authority; Design, Adapter
EVIDENCE: Design line 134 adds a row: spending "needs the owner's current request or the adopter's SEO adapter permitting it". Every other standing grant in authority.md is bound to committed, adopted state. Examples are lines 20 and 113 ("an adopted ... declaration"; "An unadopted declaration, report, advisory or journal cannot authorize itself") and line 134 ("Fresh committed origin/default AGENTS/settings/project-procedure bindings"). The SEO Design does not say whether an uncommitted, branch-only or agent-written adapter edit counts. The agent keeps `Write` and Bash (Design line 99).
PROPOSAL: State that the unit permission counts only from the adapter as committed on the adopter's default branch and named by its committed instructions. Add that the assessment never edits the adapter and that page content or exports cannot grant it, and reflect this in the authority row.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush; Acceptance Criteria; Open Questions
EVIDENCE: Design line 128 says the adapter permits spending "optionally with a per-run limit", and line 134 says "within any stated limit". No criterion or Test Plan row covers honouring a limit, how usage is counted against it, what happens when it is reached, or whether an owner's in-run request carries a limit. With no stated limit, an adapter permission allows unbounded spending per run. Making the limit optional is a trade-off the document settles while Open Questions says "None."
PROPOSAL: Raise the limit default (required, or optional and unbounded) as an Open Question for the owner. Add a criterion and a scenario row in which a stated limit stops further unit-spending calls and the run reports that it stopped.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-06; Test Plan AC-06
EVIDENCE: AC-06: "lists any live recheck as an owner handoff". Test Plan line 164: "check the handoff for the recheck item." Neither the Test Plan nor the 2026-10-30 fixture (input/http.json, gsc.csv, semrush.json, access.json) includes a startup-flash or not-yet-shipped condition that would trigger a recheck. Without one, "any live recheck" is satisfied with no item, so the startup-check fix (Design line 124) is never exercised.
PROPOSAL: Require the scenario fixture to include a startup-flash or pending-deployment case. Make the pass condition a handoff item naming the URL, build identity and check, with no instruction to repeat the check later.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria; frontmatter goal
EVIDENCE: The goal is "... leaves exports usable after access ends." AC-03 covers runs without permission, AC-04 covers redaction and AC-06 covers the manifest digests. No criterion covers a run whose Semrush access has expired or fails, finishing from free sources and dated saved exports without turning them into fresh measurements or zeros (seo.md:105-108). The only test of that case is the 2026-10-30 scenario against 89e133d, which Design line 141 makes historical.
PROPOSAL: Add a criterion and scenario row with permission granted but the stub returning an expired-key or quota outcome. The run must record that outcome, make no repeat calls and still deliver findings that label saved exports as historical.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01; Test Plan AC-01; Design, Entry and routing
EVIDENCE: AC-01 states a routing behaviour: "routed from SEO and search-visibility requests including 'SEO audit', while codebase audit requests still route to `vh-adlc-audit`". Test Plan line 159 proves it only with text assertions on the lifecycle row. lifecycle.md:18 tells intake to "Identify persistent audit intent before its installer or knowledge call", and lines 75-81 hold the audit-routing rule. A row note alone may not stop an "SEO audit" request from starting audit bootstrap, and a text check would not detect that.
PROPOSAL: Either restate AC-01 as the text end state that the test actually checks, or add a routing scenario for "SEO audit" and "audit the code". Also place the SEO note in the audit-routing paragraph at lifecycle.md:75-81, not only in the table row.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary
EVIDENCE: Line 45: "Acceptance authorizes implementing this on `feat/seo-agent` and updating PR #76." authority.md:15 grants accepted scope for "Edit code, tests and docs, and commit on the feature branch". authority.md:26 requires "An explicit ship request" to "Push the feature branch, create or update its PR".
PROPOSAL: State that acceptance authorizes implementation and commits on feat/seo-agent, and that pushing and updating PR #76 needs a ship request, as merging does.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Documentation and packaging; Acceptance Criteria AC-08
EVIDENCE: docs/user-guides/workflows.md at 8e028c2 lists every operation in its "Operations" table (Maintenance through Clean, including `vh-adlc-docs-impact` and `vh-adlc-blog`) and has a "Choosing the work" table. Neither has an SEO entry. The Design and AC-08 require only the count, a section and a compatibility link, so a reader choosing from the table does not find `vh-adlc-seo`.
PROPOSAL: Add an Operations table row for `vh-adlc-seo` to the Design, and assert it in the AC-08 proof.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Context, Background; Sources
EVIDENCE: Line 62: "the Semrush API takes its key as a query parameter". No citation or Sources entry supports it. The standard says "Sources lists every external page read, each with the claim it supports", and the redaction Design (line 130) and AC-04 depend on this claim.
PROPOSAL: Cite the Semrush API documentation page that shows the `key` parameter, and add it to Sources.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Context, Background; Design, Documentation and packaging
EVIDENCE: Line 53 lists what 8e028c2 adds. It omits that both manifests are already 0.18.0 (PR #75 head 997b63d is 0.17.0), that tests/vh-adlc/check.test.ts sets `CONTENT_OPERATIONS` to include "seo", and that the merge dropped 89e133d's SEO manifest description. Design line 142 cites "the repository's version policy", but no such page is cited. The only version check is check.test.ts:224-232, which requires the version to differ from origin/main and does not require the next minor.
PROPOSAL: Add these facts to Background. Cite the version rule used, or say that the 0.18.0 sequencing after 0.17.0 is a choice and not a checked policy.

## Sources

- `plugins/vh-adlc/references/authority.md`, `references/loop.md`, both package manifests and `tests/vh-adlc/triage/discovery.test.ts` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- `feat/seo-agent` at `8e028c2`, its `references/seo.md`, skill, agent and validation note, and its independent PR review in this session.
- Stackweaver `agents/seo.md` at branch `docs/seo-performance-followup-20261105`, contained in `origin/main`.
- Local Codex session `rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`, entries at 2026-10-30T01:33, 13:19, 13:20 and 2026-11-07T21:27.
- Engineering docs at `d8f07c9dd69038375a535af8ad586086688f85ab`: `conventions/feature-documents.md`, `guides/feature-document-template.md`, `guides/humanize-prose.md`.
