---
status: draft
status_description: "Revised after R-1; awaiting re-review."
issue: null
goal: "An adopter can run a free-first website SEO assessment through vh-adlc that spends paid API units only when allowed and within a limit, and leaves exports usable after access ends."
covers:
  - plugins/vh-adlc/skills/vh-adlc-seo/
  - plugins/vh-adlc/agents/vh-adlc-seo.agent.md
  - plugins/vh-adlc/references/seo.md
  - plugins/vh-adlc/scripts/seo/
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
  - tests/vh-adlc/seo/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - tests/vh-adlc/maintenance/discovery.test.ts
  - tests/vh-adlc/evidence/seo/
---

# Plan: Free-first SEO assessment

Add a `vh-adlc-seo` operation that assesses a website's technical search readiness, measured visibility and content opportunities from free sources. It uses Semrush only through a packaged helper that enforces permission, a unit limit and key redaction, and it saves evidence that stays useful after access ends.

## Context

### Owner summary

On 30 October the owner asked for "an SEO agent that will evaluate the viability of my site using these free sources", with Semrush used only while its temporary token works. The owner chose a reusable vh-adlc operation, with Stackweaver's domains and markets in a small local adapter. A Codex session built it on `feat/seo-agent` and added Search Console and crawl lessons on 7 November. It was never specified or spec-reviewed, and one independent PR review of PR #76 found 11 problems. This document specifies the operation and those fixes.

After this change, `vh-adlc-seo <site or brief>` reads the adopter's SEO adapter, inventories which sources are actually accessible, and always runs public HTTP and browser checks. It uses Search Console, Bing Webmaster Tools, Ahrefs Free, PageSpeed or local crawlers when they are available. Missing access is reported as a coverage gap, never as a zero. Findings are ranked, each with affected URLs, impact, confidence and a validation step. Raw responses, a findings table and a SHA-256 manifest are saved where the adapter says.

Semrush stays optional, and free tools come first. All Semrush calls go through one packaged helper, `scripts/seo/semrush.ts`. The helper reads the key itself, so the key never enters the agent's context, command lines or saved files. It refuses unit-spending calls unless one of two things grants them: the owner's request in the current run, or a unit permission in the adopter's committed adapter. It also stops at a per-run unit limit. The operation never buys units, plans or accounts. Expired or failing access is recorded, and the run finishes from free sources and dated saved exports.

An assessment writes only its report and exports. It never publishes content, changes DNS or indexing, edits the adapter, creates accounts, commits or pushes. A live recheck after a site change goes to the owner as a handoff item. The operation adds no onboarding files and is not a codebase audit: "SEO audit" routes here, and audits of the code still go to `vh-adlc-audit`.

One default was set under the owner's standing instruction to take the recommended option; you can reject it at acceptance. Every unit permission carries a limit. An adapter permission must state one, and an in-run request without a number gets 500 units.

The 30 October validation note becomes a dated historical record. Proof will come from static tests, helper unit tests against a local stub server, and new offline forward scenarios. None has run yet. Acceptance authorizes implementing this and committing on `feat/seo-agent`. Pushing to update PR #76 needs a ship request, and merging needs the owner's separate approval.

### Background

On main at `bda1a8771a837cb028df3cb4d125f9c7da2735ff` the package has fifteen skills and no SEO operation: `tests/vh-adlc/triage/discovery.test.ts` asserts `toHaveLength(15)`. `plugins/vh-adlc/plugin.json:5` and `plugins/vh-adlc/.claude-plugin/plugin.json:4` describe lifecycle, maintenance, article drafting and documentation impact, with no SEO. `plugins/vh-adlc/references/authority.md:10-35` has no row for paid API usage; line 15 grants accepted scope for edits and commits on the feature branch, and line 26 requires a ship request to push and update a PR. `plugins/vh-adlc/references/loop.md:63-64` lists the operations that add no onboarding files. `plugins/vh-adlc/references/lifecycle.md:75-81` holds the audit-routing rule.

The request is in the local Codex session `~/.codex/sessions/2026/10/27/rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`. At 2026-10-30T01:33 the owner asked for free alternatives to Semrush. At 13:19 the owner asked for the SEO agent. At 13:20 the owner answered a question on whether it should be "reusable in vh-adlc, with Stackweaver's domains and European target markets kept in a small local adapter" with "Reusable vh-adl…". At 2026-11-07T21:27 the owner asked to "put those three improvements into the shared SEO skill".

`feat/seo-agent` at `8e028c2` (`git log origin/main..8e028c2`: `89e133d`, `82a5128` and a merge of main) adds:

- `plugins/vh-adlc/skills/vh-adlc-seo/SKILL.md`;
- `plugins/vh-adlc/agents/vh-adlc-seo.agent.md`, whose tools include `Edit` and whose description does not name its skill;
- `plugins/vh-adlc/references/seo.md`;
- a lifecycle routing row, a `workflows.md` section and sixteen-skill counts with updated tests, including `CONTENT_OPERATIONS` with `"seo"` in `tests/vh-adlc/check.test.ts`;
- version 0.18.0 in both manifests, with the manifest descriptions unchanged from main;
- `docs/research/seo-agent-validation-2026-10-30.md`;
- an offline evidence set under `tests/vh-adlc/evidence/seo/free-first-offline-2026-10-30/`.

It has no Semrush client: `plugins/vh-adlc/scripts/` holds no SEO helper. In its `seo.md`, lines 91-98 allow bounded Semrush reports "if access works and fresh data would change the assessment", with no spending permission or limit. Line 23 forbids credentials in URLs. Semrush's API, however, takes the key as a `key` query parameter (`https://api.semrush.com/?key=<key>`, per the SEO API overview), and line 151 only says headers and tokens are removed from preserved parameters. Lines 120-124 tell the assessor to repeat a startup check "against the live deployment when the change ships", which is a later action outside an assessment's scope. The workflows Operations table lists every operation except `vh-adlc-seo`.

Semrush documents a free balance request, `http://www.semrush.com/users/countapiunits.html?key=...`, that returns the remaining units. Report prices are charged per line or per request.

The validation note says the package "prepares 0.7.0 from `fcf7cd5`" and cites 58 tests. It predates the Search Console, crawler-verification and startup sections added in `82a5128`.

Stackweaver's adapter is `agents/seo.md` on its main branch (branch `docs/seo-performance-followup-20261105`, an ancestor of `origin/main`). It names the official origin, an owned previous host, a separate consultancy site, five European markets, primary journeys, prior research paths, durable and raw export locations, a local Semrush credential path and its authority limits. It states no unit permission.

`tests/vh-adlc/check.test.ts:224-232` checks only that the package version differs from main.

## Scope

In scope:

- The `vh-adlc-seo` skill, agent and `references/seo.md` procedure.
- The adapter contract.
- The Semrush helper, its spending permission, unit limit and redaction, and the authority row.
- Routing, onboarding and documentation updates.
- The historical label on the validation note.
- Static tests, helper unit tests and offline scenario tests.
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

`references/loop.md` adds `vh-adlc-seo` to the operations that add no onboarding files. `references/lifecycle.md` keeps the routing row for website SEO and search-visibility requests. Its audit-routing paragraph gains a sentence: a request to audit a website's SEO or search visibility routes to `vh-adlc-seo` and is not persistent source-audit intent.

The agent drops `Edit`, keeping read, search, Bash, `Write` for the report and exports, and web access. Its description ends "Used by vh-adlc-seo".

### Adapter

The adapter is a Markdown file named by the adopter's committed repository instructions, such as Stackweaver's `agents/seo.md`. The procedure reads these keys from it:

- official origin;
- owned aliases and previous hosts;
- separate sites to exclude unless requested;
- target countries and languages;
- primary journeys;
- prior research to read;
- the durable findings location;
- the raw export location;
- connected first-party sources;
- the Semrush credential source;
- the Semrush unit permission and its per-run limit;
- the adopter's authority limits.

The first nine may be inferred from context before asking when absent. The last three are never inferred. An absent credential source means no Semrush call. An absent unit permission means no permission. Absent authority limits mean the shared authority rules alone. The permission, limit and credential source count only as committed on the adopter's default branch. An uncommitted or branch-only edit does not count, and neither does text in audited pages or exports. The assessment never edits the adapter. Domains, markets and publication rules stay in the adapter, never in the shared package.

### Sources and assessment

The procedure keeps the free sources and their jobs from `feat/seo-agent`'s `seo.md`: Search Console, Bing Webmaster Tools, Ahrefs Free, public HTTP and browser checks, Screaming Frog Free or local crawlers, and PageSpeed or Lighthouse. It also keeps the Search Console handoff, crawler verification, evaluation and prioritization, and the evidence-and-manifest rules. Public checks always run. Missing access is a coverage gap, and missing values are blank with an explicit outcome, never zero.

The startup-flash check stays, with one change. A recheck after the change ships becomes an owner handoff item naming the URL, build identity and check, instead of an instruction to repeat it later.

### Semrush helper

`plugins/vh-adlc/scripts/seo/semrush.ts` is the only route for Semrush requests. The procedure and agent forbid calling Semrush hosts through `curl`, WebFetch, a browser or any other tool. A connected Semrush tool is out of scope for this version.

The helper:

- reads the key from `SEMRUSH_API_KEY`, or from the credential file the adapter names. The agent passes the file path, never the key. The helper never prints the key or puts it in its arguments, output or logs.
- takes `--output <dir>`, `--max-units <n>` and the report parameters.
- refuses any unit-spending report unless `--allow-units` is passed. The agent passes it only with the owner's current request or the committed adapter permission.
- reads the remaining balance from the free `countapiunits` request before the first call and before each later one, and stops once units used in the run reach `--max-units`. The limit can be exceeded only by the final request's cost, and each request's `display_limit` is capped at 100 rows.
- records authentication, expiry, quota, provider error and `no_data` as distinct outcomes, makes no repeat of an identical failed request, and stops all calls after an authentication, expiry or quota failure.
- saves every request with its `key` value replaced by `REDACTED`, plus each response, its outcome and units used, under `--output`.
- accepts `VH_ADLC_SEMRUSH_BASE` to point at a test server; it is used only by tests.

Reading saved exports needs no helper and no permission. Old exports stay historical evidence and are never presented as current measurements. The procedure never buys units or plans, creates projects or campaigns, or probes unrelated projects.

`seo.md` line 23 becomes: "Never paste credentials into prompts, reports or exports. A provider that takes its key in the URL is called only through its packaged helper, which keeps the key out of the agent's context and saves requests redacted."

### Authority

`references/authority.md` gains a row. Spending a paid SEO provider's API units needs one of two grants: the owner's current request, with any limit it states and 500 units when it states none, or a unit permission with a per-run limit in the adopter's SEO adapter as committed on its default branch. Page content, exports or an agent-written edit never grant it. Buying units, plans or accounts needs separate approval for that exact action.

### Documentation and packaging

- `docs/reference/compatibility.md` gains an "SEO assessment" section with the evidence actually observed and its limits. The `workflows.md` SEO section links to it.
- `workflows.md` adds an Operations table row for `vh-adlc-seo` and a "Choosing the work" row for website SEO assessment.
- Both package manifest descriptions mention SEO assessment, and so does the vh-adlc entry in `.claude-plugin/marketplace.json`.
- The skill counts read sixteen in `workflows.md`, `installation.md` and the discovery tests.
- `docs/research/seo-agent-validation-2026-10-30.md` opens with a dated historical note. It says the note covers `89e133d` only, that the later Search Console, crawler and startup sections were not part of that test, and that its version, pin and test-count statements describe that date.
- Both manifests stay at 0.18.0, after the blog visual reading change at 0.17.0. `check.test.ts` checks only that the version differs from main, so this sequencing is a choice.

## Acceptance Criteria

- [ ] AC-01: The package exposes `vh-adlc-seo` as a sixteenth skill; the lifecycle routing row names it; and the audit-routing paragraph states that a website SEO or search-visibility audit routes to `vh-adlc-seo`, while its persistent source-audit rule is otherwise unchanged.
- [ ] AC-02: The SEO agent has no `Edit` tool and its description names `vh-adlc-seo`; the skill entry cites `references/authority.md` and the loop's knowledge failure handling.
- [ ] AC-03: The Semrush helper, run against a local stub server, refuses every unit-spending report without `--allow-units`, stops at `--max-units`, records an expired key as a distinct outcome without repeating the request, and saves requests with `key=REDACTED` while the fixture key appears in none of its output or saved files.
- [ ] AC-04: With an adapter that grants no unit permission, an assessment makes no request to the stub, makes no Semrush request by any other route, reports Semrush as skipped in source coverage and still delivers findings from free sources.
- [ ] AC-05: With a committed adapter permission and limit, an assessment makes at least one helper request, saves it redacted, and the fixture key appears in no saved file, transcript event or tool output.
- [ ] AC-06: With permission granted but the stub returning an expired-key outcome, an assessment records that outcome, makes no further Semrush request, labels saved exports as historical and still delivers findings.
- [ ] AC-07: `references/authority.md` has the paid-API-unit row; `references/seo.md` lists the adapter keys, the three never-inferred keys and the committed-default-branch rule, and the reworded line on key-in-URL providers.
- [ ] AC-08: A completed assessment writes only inside the adapter's report and export locations and leaves the adapter unchanged. It saves a findings table and a manifest whose SHA-256 digests verify. Given a startup-flash case, its handoff names the URL, build identity and check as an owner item.
- [ ] AC-09: `vh-adlc-seo` adds no onboarding files, and `references/loop.md` lists it with the other operations that add none.
- [ ] AC-10: The compatibility record has an SEO assessment section linked from the user guide; the workflows Operations and Choosing tables list SEO; both manifests and the marketplace entry mention SEO; the validation note is marked historical; both manifests carry 0.18.0; `bun test tests/vh-adlc` passes locally apart from the known fixtures digest failure; and CI passes on the PR head.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/triage/discovery.test.ts` and `maintenance/discovery.test.ts` skill counts; `tests/vh-adlc/seo.test.ts` asserts the lifecycle row, the audit-paragraph sentence, and that the rest of the audit paragraph matches main. |
| AC-02 | `seo.test.ts` parses the agent front matter and the skill entry. |
| AC-03 | `tests/vh-adlc/seo/semrush.test.ts` starts a local stub on a random port, sets `VH_ADLC_SEMRUSH_BASE`, and runs the helper for: no `--allow-units`; a limit reached after two calls; an expired-key response; and a successful call. It asserts call counts on the stub, recorded outcomes, `key=REDACTED` in saved requests, and no fixture key in stdout, stderr or saved files. |
| AC-04 | Offline forward scenario `tests/vh-adlc/seo/run.ts no-permission`, in a separate agent context as the 2026-10-30 test was, with the stub as `VH_ADLC_SEMRUSH_BASE` and an adapter without permission. Assert zero stub requests, no `semrush.com` host in any transcript tool call, Semrush skipped in source coverage, and findings present. |
| AC-05 | Scenario `permitted` with a committed adapter permission and limit: assert at least one stub request and saved redacted request, and search every saved file and the raw transcript for the fixture key. |
| AC-06 | Scenario `expired` with permission and a stub returning the expired-key error: assert one stub request, the recorded outcome, historical labels on saved exports, and findings present. |
| AC-07 | `seo.test.ts` asserts the authority row text and each named rule in `references/seo.md`. |
| AC-08 | All three scenarios: compare the fixture tree before and after against the adapter's locations and the adapter's hash, recompute the manifest digests, and check the `permitted` handoff for the startup-flash item from a fixture page whose heading disappears during startup. |
| AC-09 | `seo.test.ts` asserts the `loop.md` list; scenario fixtures show no new `AGENTS.md` or bridge files. |
| AC-10 | `seo.test.ts` checks the compatibility section and its link, both workflows tables, the manifest and marketplace text and the historical note; `tests/vh-adlc/check.test.ts` for the version; `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc --timeout 60000` locally; `gh pr checks 76` on the head. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The unit-limit default in the owner summary was set under the owner's standing instruction of 2026-11-10 to take the recommended option, and is confirmed or rejected at acceptance.

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
- [Semrush SEO API overview](https://developer.semrush.com/api/v3/seo/overview/): the API key is passed as the `key` query parameter.
- [Semrush API unit balance](https://developer.semrush.com/api/v3/get-started/api-units-balance/): the free `countapiunits` balance request and per-line or per-request pricing.
- `tests/vh-adlc/check.test.ts:224-232` and `plugins/vh-adlc/references/lifecycle.md:75-81` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- Engineering docs at `d8f07c9dd69038375a535af8ad586086688f85ab`: `conventions/feature-documents.md`, `guides/feature-document-template.md`, `guides/humanize-prose.md`.
