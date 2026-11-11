---
status: draft
status_description: "Revised after R-9; awaiting re-review."
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

Semrush stays optional, and free tools come first. All Semrush calls go through one packaged helper, `scripts/seo/semrush.ts`. The helper reads the key itself so the agent never needs to, and the procedure forbids the agent from reading or printing it; the scenarios search transcripts, tool output and saved files for the key. The helper talks only to Semrush over HTTPS. The owner's token has only ever worked through Semrush's MCP endpoint: on 27 October the key-in-URL API rejected it and the MCP endpoint accepted it, and on 1 November a report through MCP still succeeded. On 3 November a handshake got HTTP 401, but that client sent the token as `Authorization: Bearer` instead of the `Apikey` scheme every accepted call used and the helper uses, so it does not show the token expired. Whether the token works today is unknown; nothing in this change depends on it, and an expired token is recorded as an authentication failure. A zero-unit MCP handshake would settle it. So the helper calls the MCP endpoint's report tool by default, with the key in a request header, and calls the key-in-URL API only when the adapter names that route. The agent decides whether spending is granted: by the owner's request in the current run, or by a unit permission with a limit in the adopter's adapter as committed on its default branch. Offline scenarios prove that decision. The helper enforces the rest in code. It refuses any unit-spending report unless the agent passes the grant flag and a unit limit, prices each report before sending it, and reserves that cost in a locked ledger in the run's output directory. Calls that share that directory, in sequence or in parallel, never reserve more than the limit together. The procedure requires one output directory per run, and the `permitted` scenario checks that every call used it and that the rows Semrush actually served stay within the limit. The helper reserves each report's cost at the prices recorded in it, dated by their source. On the MCP route Semrush reports the units each report used, and the ledger records that figure. The key-in-URL route reports none, so its ledger units stay estimates. The operation never buys units, plans or accounts. Expired or failing access is recorded, and the run finishes from free sources and dated saved exports.

An assessment writes only its report and exports. It never publishes content, changes DNS or indexing, edits the adapter, creates accounts, commits or pushes. A live recheck after a site change goes to the owner as a handoff item. The operation adds no onboarding files and is not a codebase audit: "SEO audit" routes here, and audits of the code still go to `vh-adlc-audit`.

These defaults were set under the owner's standing instruction to take the recommended option; you can reject any of them at acceptance:

- Every unit permission carries a limit. An adapter permission without a limit counts as no permission, and an in-run request without a number gets 500 units.
- A report is capped at 100 rows, and fewer when its price would not fit the units left.
- The helper uses the MCP route unless the adapter names the key-in-URL route. It never falls back from one route to the other.
- On the MCP route the helper sends only the session handshake and the report tool for its listed report types. Project tools are refused: each project list cost 100 units on 29 October and shows unrelated projects.
- If Semrush reports more units for a report than the helper reserved, the ledger records the reported figure and the run makes no further Semrush request. That report, and any other already in flight when it is recorded, can take the run past its limit. On the key-in-URL route a Semrush price rise goes unnoticed until the helper's prices are updated.
- A Semrush MCP server connected to the agent's host is not used; only the helper calls Semrush, so the limit and ledger always apply.
- The helper accepts a credential that is one line and one token of 16 to 128 letters, digits, hyphens and underscores, the shape of the owner's current token.
- The SEO agent loses its `Edit` tool, because an assessment never edits existing files.
- The free balance check is informational only. The limit is enforced from the helper's own price ledger, because the balance request cannot be relied on (see Background).
- The version stays 0.18.0, landing after the blog visual reading change at 0.17.0.

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

Semrush documents a free balance request, `http://www.semrush.com/users/countapiunits.html?key=...`, that returns the remaining units. The same path answers over HTTPS, but not reliably. On 2026-11-11 a keyless HTTPS request returned HTTP 400 (`field is required`). From this host, a dummy 32-character key returned HTTP 200 with body `0`, the same as an empty balance, so the balance request cannot detect a wrong or expired key. From the R-3 reviewer's environment the same keyed request returned HTTP 429 "Blocked request" twice. The report host with the same dummy key returned `ERROR 120 :: WRONG KEY - ID PAIR`, so a bad key is detected on the first report. Report prices are charged per line or per request; Domain Organic Search Keywords, for example, costs 10 units per line, or 50 for historical data, so one 100-row report costs 1,000 units.

Stackweaver's Semrush baseline of 2026-10-29 (`docs/internal/plans/marketing/semrush-visibility-baseline-2026-10-29.md` on its `origin/main`, line 13) says the credential its adapter names "still work[s] through `https://mcp.semrush.com/v2/mcp`" and that "Direct legacy API endpoints were not retried". The Codex session behind it (`rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`) logged, for that credential on 2026-10-27, `ERROR 122 :: WRONG FORMAT OR EMPTY KEY` from the v3 report API, HTTP 400 `invalid api key` from the balance request, HTTP 403 from the v4 API and HTTP 200 from MCP initialization. On 2026-11-01 an MCP client sending `Authorization: Apikey` got HTTP 200 and a `no_data` answer for `domain_ranks`. On 2026-11-03 a new client sending `Authorization: Bearer` instead of `Apikey` got HTTP 401 on initialization, and the session stopped Semrush requests; it has no later Semrush call. Because the scheme changed, that 401 does not show the token expired. It is the observed basis for mapping MCP HTTP 401 to `authentication`. Whether the token works on 2026-11-11 is unknown. The credential file holds one line of 67 characters in groups joined by hyphens and an underscore. The session's MCP client sends the key in an `Authorization: Apikey <key>` header, not in the URL. The endpoint's `execute_report` tool takes a report name such as `domain_ranks` or `phrase_fullsearch` and parameters including `display_limit`. The server's instructions say a failed call returns a JSON error object instead of data, and give `validation_failed`, `no_subscription`, `no_api_units`, `no_data`, `rate_limit` and `internal` as examples of its `code`, so the list is not complete. The credential-free archive in Stackweaver's ignored `.tmp/seo-research/semrush-visibility-2026-10-29/` shows where both land. A request is a JSON-RPC `tools/call` with `params.name` `execute_report` and `params.arguments` holding `report` and `params` (`control-spacelift-request.json`). A success is a JSON-RPC `result` whose `content[0].text` is a JSON string holding `data` (CSV) and `metadata`, including `metadata.usage.api_units` ("Number of API units consumed by this call"), with the same object in `structuredContent` (`control-spacelift-response.json`, 10 units). An error is a JSON-RPC `result` whose `content[0].text` is a JSON string holding `code`, `message`, `retryable`, `hint` and `trace_id`, with no JSON-RPC `error`, no `isError` and no `structuredContent` (`overview-vhco.pro-response.json`, `no_data`). The initialize response is a `result` with `protocolVersion`, `capabilities`, `serverInfo` and `instructions`. The baseline (line 27) records 210 reported units: 100 for each of two project-list calls and 10 for a one-row control report. The no-data responses carried no usage figure.

The SEO API overview lists the v3 errors: `ERROR 120 :: WRONG KEY - ID PAIR` (unknown key), `ERROR 130 :: API DISABLED` (the subscription does not include the API), `ERROR 131 :: LIMIT EXCEEDED`, `ERROR 132 :: API UNITS BALANCE IS ZERO`, `ERROR 133 :: DB ACCESS DENIED`, `ERROR 134 :: TOTAL LIMIT EXCEEDED`, `ERROR 135 :: API REPORT TYPE DISABLED` (the report is gone or "The subscription has ended"), `ERROR 50 :: NOTHING FOUND`, and parameter errors. It also lists `ERROR 110 :: INVALID IMPORT KEY` ("The API key has an incorrect format"), `ERROR 402 :: Request param not valid` ("The API key is incorrect"), `ERROR 402 :: Request param not valid :: Duplicate domains` (duplicated `targets` values) and `ERROR 429 :: Too Many Requests`. It lists no error for an expired key. `ERROR 122` is not listed. Errors come with a 4xx status: the 2026-10-27 probe got HTTP 400 with `ERROR 122`, and on 2026-11-11 a dummy 32-character key got HTTP 403 with `ERROR 120`.

The validation note says the package "prepares 0.7.0 from `fcf7cd5`" and cites 58 tests. It predates the Search Console, crawler-verification and startup sections added in `82a5128`.

Stackweaver's adapter is `agents/seo.md` on its main branch (branch `docs/seo-performance-followup-20261105`, an ancestor of `origin/main`). It names the official origin, an owned previous host, a separate consultancy site, five European markets, primary journeys, prior research paths, durable and raw export locations, a local Semrush credential path and its authority limits. It states no unit permission.

`tests/vh-adlc/check.test.ts:224-232` checks only that the package version differs from main.

The package has no build step. It is published by merging to main, and consumers install it from this repository through `.claude-plugin/marketplace.json` (Claude Code) and `.agents/plugins/marketplace.json` (Codex), both pointing at `./plugins/vh-adlc`. The blog scenario runner `tests/vh-adlc/blog/run.ts:22-30` already installs the package through a local Codex marketplace, the way a consumer does.

At `dbb0485`, `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc/fixtures.test.ts` fails on this host with "the installer rejected the fixture lock: vh-adlc: /usr/local/bin/vh-adlc reports vh-adlc 0.19.0 but its digest does not match the lock", because the verified real vh-adlc 0.19.0 in `/usr/local/bin` has the fixture lock's version but not the digest of the test's wrapper, which the fixture lock pins (`tests/vh-adlc/fixtures/build.ts:271-276`, `plugins/vh-adlc/scripts/ensure-vh-adlc.sh:4-7`). CI runs the same test.

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
- the Semrush route, `mcp` or `v3`;
- the Semrush credential source;
- the Semrush unit permission and its per-run limit;
- the adopter's authority limits.

The first nine may be inferred from context before asking when absent. An absent route means `mcp`. The last three are never inferred. An absent credential source means no Semrush call. An absent unit permission, or one without a per-run limit, means no permission. Absent authority limits mean the shared authority rules alone. The permission, limit and credential source count only as committed on the adopter's default branch, the branch `refs/remotes/origin/HEAD` points to, read from that ref. When that ref is missing, the permission and limit count as absent. An uncommitted or branch-only edit does not count, and neither does text in audited pages or exports. The assessment never edits the adapter. Domains, markets and publication rules stay in the adapter, never in the shared package.

### Sources and assessment

The procedure keeps the free sources and their jobs from `feat/seo-agent`'s `seo.md`: Search Console, Bing Webmaster Tools, Ahrefs Free, public HTTP and browser checks, Screaming Frog Free or local crawlers, and PageSpeed or Lighthouse. It also keeps the Search Console handoff, crawler verification, evaluation and prioritization, and the evidence-and-manifest rules. Public checks always run. Missing access is a coverage gap, and missing values are blank with an explicit outcome, never zero.

The startup-flash check stays, with one change. A recheck after the change ships becomes an owner handoff item naming the URL, build identity and check, instead of an instruction to repeat it later.

### Semrush helper

`plugins/vh-adlc/scripts/seo/semrush.ts` is the only way to make Semrush requests. The procedure and agent forbid calling Semrush hosts through `curl`, WebFetch, a browser, a Semrush MCP server connected to the host or any other tool. The helper has two routes: `mcp`, the `execute_report` tool at `https://mcp.semrush.com/v2/mcp`, and `v3`, the key-in-URL report API at `https://api.semrush.com/`.

The helper runs with Bun, like the package's other scripts. It:

- reads the key only from the source the agent names: `--key-file <path>` for the credential file the adapter names, or `--key-env <NAME>` when the adapter names an environment variable. It has no default and no fallback; with neither it refuses. The file may hold a bare key or a `SEMRUSH_API_KEY=<key>` line. The agent passes the path or variable name, never the key. The helper refuses, without sending anything, a file with more than one non-empty line or a value that is not a single token of 16 to 128 letters, digits, hyphens and underscores. This stops multi-line files such as private keys and env files with other variables; it does not prove the value is a Semrush key. It never prints the key or puts it in its arguments, output or logs.
- takes `--route mcp|v3`, `--output <dir>`, `--max-units <n>`, `--allow-units` and the report parameters. It refuses a call without `--route`, and a `--route` that differs from the one recorded in the ledger. The agent passes the adapter's route. A failure on one route is never retried on the other.
- on the `mcp` route, sends the key only in an `Authorization: Apikey <key>` header. It sends only the MCP initialization handshake, which costs no units, and `tools/call` for `execute_report` with a listed report type. It refuses every other tool and method, including project tools and `list_projects`. It parses `result.content[0].text` as JSON: an object with `code` is an error, mapped by that code; an object with `data` and `metadata` is a success; anything else, a JSON-RPC `error` or `isError` is a `provider_error`. The procedure uses one `--output` directory per run: a dated directory under the adapter's raw export location, whose saved files the run's manifest lists.
- keeps a run ledger, `ledger.json`, in `--output`: the `--max-units` value, reserved and used units and any terminal outcome. Every ledger update, whether a reservation, reconciliation, balance record or terminal outcome, takes an exclusive lock on the ledger, re-reads it and writes it back before releasing the lock; a lock it cannot get within 30 seconds gives a non-terminal `busy` outcome and no request. It counts earlier usage and open reservations against the limit, refuses a `--max-units` that differs from the recorded one, and refuses all calls once a terminal outcome is recorded.
- refuses any unit-spending report unless `--allow-units` is passed, and refuses `--allow-units` without `--max-units`. The agent passes the flag only with the owner's current request or the committed adapter permission, and passes the limit that grant states, or 500 for an in-run request without a number.
- supports a fixed list of report types. Each has its MCP report name and v3 type, a fixed set of allowed parameters and its documented regular price, plus its historical price when the type accepts a historical date, held in the helper next to the Semrush page it came from. A request with the historical date parameter is priced at the historical rate. The helper refuses any other type or parameter.
- before each report, treats an absent or zero `display_limit` as 100, lowers any value above 100 to 100, computes the maximum cost from the row limit and price, lowers the row limit to fit the units left in the ledger, and always sends a `display_limit` between 1 and that fitted maximum. It refuses the report with a `limit` outcome when not even one row fits. It reserves the maximum cost in the ledger before sending. Afterwards it reconciles the reservation to the response's `metadata.usage.api_units` when the MCP route reports it, and otherwise to the price of the rows returned. A reservation that was never reconciled, such as from a killed process, stays counted at its full cost. Reserved units in a run therefore never exceed `--max-units`. When reported usage exceeds the reservation, the ledger records the reported figure and a terminal `price_mismatch` outcome.
- marks each ledger entry as provider-reported or as estimated at its recorded prices, with the date of each price's source. The report states usage the same way.
- sends no request at all, balance or handshake included, unless the requested report passes every check above. On the `v3` route it then requests the free `countapiunits` balance once per run, before the first report, and records the parsed number (accepting thousands separators) or `balance_unavailable`. The balance is informational: it neither blocks a report nor proves the key works, because the request can be blocked and returns `0` for a wrong key. The outcome table below does not apply to it; any balance response that is not a number, an HTTP 429 included, is `balance_unavailable`, which is neither terminal nor a run outcome.
- maps handshake and report responses to outcomes, classifying a v3 body that starts with `ERROR <n> ::` by its code whatever the HTTP status, makes no repeat of an identical failed request, and records the terminal ones in the ledger. Semrush has no separate expired-key response: an expired or revoked key gives `authentication`, and an ended subscription gives `access_denied` or `report_disabled`.

  | Response | Outcome | Terminal |
  | --- | --- | --- |
  | v3 `ERROR 110`, `ERROR 120`, `ERROR 122`, `ERROR 402 :: Request param not valid` without a further `::` part; MCP HTTP 401 or 403 | `authentication` | yes |
  | v3 `ERROR 130`, `ERROR 133`; MCP `no_subscription` | `access_denied` | yes |
  | v3 `ERROR 131`, `ERROR 132`, `ERROR 134`; MCP `no_api_units` | `quota` | yes |
  | v3 `ERROR 429`; MCP `rate_limit`; HTTP 429 | `rate_limited` | yes |
  | v3 `ERROR 135` | `report_disabled` | for that report type |
  | v3 `ERROR 50`; MCP `no_data` | `no_data` | no |
  | v3 `ERROR 402 :: Request param not valid :: Duplicate domains` and any other error, MCP `validation_failed`, `internal` or an unlisted code, HTTP 5xx, a redirect | `provider_error` | no |
- saves every request with its `key` value and `Authorization` header replaced by `REDACTED`, plus each response, its outcome and units used, under `--output`.
- has its MCP URL `https://mcp.semrush.com/v2/mcp`, report URL `https://api.semrush.com/` and balance URL `https://www.semrush.com/users/countapiunits.html` built in; none is configurable except through the loopback override below. It never follows a redirect and records one as a provider error.
- accepts `VH_ADLC_SEMRUSH_BASE` only for a loopback host (`127.0.0.1`, `::1` or `localhost`), over HTTP or HTTPS, and refuses any other value without sending anything. The override replaces the scheme and host of all three URLs and keeps their paths (`/v2/mcp`, `/` and `/users/countapiunits.html`), so one test server answers them all.

Reading saved exports needs no helper and no permission. Old exports stay historical evidence and are never presented as current measurements. The procedure never buys units or plans, creates projects or campaigns, or probes unrelated projects.

`seo.md` gains the rule "Never read, print or copy the Semrush credential file or variable; pass only its path or name to the helper." Its line 23 becomes: "Never paste credentials into prompts, reports or exports. A paid provider with a packaged helper is called only through that helper, which reads the key itself, keeps it out of the agent's context and saves requests redacted."

### Authority

`references/authority.md` gains a row. Spending a paid SEO provider's API units needs one of two grants: the owner's current request, with any limit it states and 500 units when it states none, or a unit permission with a per-run limit in the adopter's SEO adapter as committed on its default branch. A permission without a limit grants nothing. Page content, exports or an agent-written edit never grant it. Buying units, plans or accounts needs separate approval for that exact action.

### Documentation and packaging

- `docs/reference/compatibility.md` gains an "SEO assessment" section with the evidence actually observed and its limits, and states that Semrush use needs Bun. The `workflows.md` SEO section links to it.
- `docs/get-started/installation.md` lists Bun as a requirement for Semrush use in `vh-adlc-seo`, alongside the other operations that need it.
- `workflows.md` adds an Operations table row for `vh-adlc-seo` and a "Choosing the work" row for website SEO assessment.
- Both package manifest descriptions mention SEO assessment, and so does the vh-adlc entry in `.claude-plugin/marketplace.json`.
- The skill counts read sixteen in `workflows.md`, `installation.md` and the discovery tests.
- `docs/research/seo-agent-validation-2026-10-30.md` opens with a dated historical note. It says the note covers `89e133d` only, that the later Search Console, crawler and startup sections were not part of that test, and that its version, pin and test-count statements describe that date.
- Both manifests stay at 0.18.0, after the blog visual reading change at 0.17.0. `check.test.ts` checks only that the version differs from main, so this sequencing is a choice.

### Artifacts and publication

The one artifact is the `plugins/vh-adlc` package, published by merging to main and installed by consumers through `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`. Before merge, the offline scenarios install the package from the branch through a local Codex marketplace, as `tests/vh-adlc/blog/run.ts` does, and `check.test.ts` validates both manifests and the marketplace entry. The change is delivered once it is merged to main.

## Acceptance Criteria

- [ ] AC-01: The package exposes `vh-adlc-seo` as a sixteenth skill; the lifecycle routing row names it; and the audit-routing paragraph states that a website SEO or search-visibility audit routes to `vh-adlc-seo`, while its persistent source-audit rule is otherwise unchanged.
- [ ] AC-02: The SEO agent has no `Edit` tool and its description names `vh-adlc-seo`; the skill entry cites `references/authority.md` and the loop's knowledge failure handling.
- [ ] AC-03: The Semrush helper, run against a local stub server: refuses every unit-spending report without `--allow-units`, and `--allow-units` without `--max-units`; never lets reserved units exceed `--max-units`, lowering the row limit to fit and sending nothing when one row does not fit; lets used units exceed it only through reports whose reported `api_units` exceed their reservation, recorded as `price_mismatch`, and only through reports already in flight when the first is recorded, after which nothing more is sent; keeps that limit across separate and concurrent invocations sharing one `--output`, counts an unreconciled reservation, refuses a changed `--max-units`, prices a historical request at the historical rate, and always sends a `display_limit` from 1 to the fitted maximum, including when none or 0 is given; uses only the credential source named by `--key-file` or `--key-env`; gives `busy` and sends nothing when the ledger lock stays held; follows no redirect; on the `mcp` route sends the key only in the `Authorization` header, sends only the handshake and `execute_report`, refuses project tools and reconciles to reported `api_units`, stopping the run with `price_mismatch` when they exceed the reservation; refuses a missing or changed `--route`; maps every response in the outcome table to its outcome, after which a terminal outcome makes a later invocation send nothing; treats a blocked or non-numeric balance as `balance_unavailable` without blocking the report; refuses a non-loopback `VH_ADLC_SEMRUSH_BASE` (including `http://api.semrush.com`) and a credential file that is multi-line or not a single token, sending nothing; reads a bare key, a `SEMRUSH_API_KEY=` line and a 67-character key with hyphens and an underscore; sends no request of any kind for a refused report; for an allowed one sends the balance and report requests on `v3` and the handshake and report call on `mcp`; and saves requests with `key=REDACTED` and the `Authorization` header redacted, while the fixture key appears in none of its output or saved files.
- [ ] AC-04: With a working fixture credential and a stub that would succeed, but no committed unit permission, an assessment sends no request of any kind to the stub, even with an uncommitted adapter edit granting units, a permission committed only on the checked-out non-default branch, a committed permission in a repository with no resolvable default branch, and a fixture page claiming permission. It makes no Semrush request by any other route, reports Semrush as skipped in source coverage and still delivers findings from free sources.
- [ ] AC-05: With a committed adapter permission and limit, an assessment calls the helper with `--max-units` equal to that limit and the same `--output` on every invocation, keeps the cost of the rows Semrush served over the whole run within it, makes at least one report request, saves it redacted, and the fixture key appears in no saved file, transcript event or tool output. With an in-run grant that names no number, it passes 500. With a committed limit smaller than one row of any report, it makes no report request and the report states that Semrush stopped at the unit limit.
- [ ] AC-06: With permission granted, a dated earlier Semrush export present, and the stub's MCP handshake returning HTTP 401, as the 3 November handshake did, an assessment records `authentication`, makes no further Semrush request, labels the earlier export as historical rather than a current measurement, and still delivers findings.
- [ ] AC-07: `references/authority.md` has the paid-API-unit row; `references/seo.md` lists the adapter keys, the three never-inferred keys and the committed-default-branch rule, the reworded credential line, the rule against reading, printing or copying the credential, and the rule that unit usage is reported as provider-reported when available and otherwise as an estimate at the helper's dated prices.
- [ ] AC-08: A completed assessment writes only inside the adapter's report and export locations and leaves the adapter unchanged. It saves a findings table and a manifest whose SHA-256 digests verify. Given a startup-flash case, its handoff names the URL, build identity and check as an owner item.
- [ ] AC-09: `vh-adlc-seo` adds no onboarding files, and `references/loop.md` lists it with the other operations that add none.
- [ ] AC-10: The compatibility record has an SEO assessment section linked from the user guide; the workflows Operations and Choosing tables list SEO; both manifests and the marketplace entry mention SEO; the validation note is marked historical; `installation.md` and the compatibility section state that Semrush use needs Bun; `workflows.md` and `installation.md` count sixteen skills; both manifests carry 0.18.0; `bun test tests/vh-adlc` passes locally, except that `tests/vh-adlc/fixtures.test.ts` may fail only with the fixture-lock digest error quoted in Background; and CI, which runs that test too, passes on the PR head.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/triage/discovery.test.ts` and `maintenance/discovery.test.ts` skill counts; `tests/vh-adlc/seo.test.ts` asserts the lifecycle row, the audit-paragraph sentence, and that the paragraph without that sentence equals its text at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`, held in the test as a fixture string. |
| AC-02 | `seo.test.ts` parses the agent front matter and the skill entry. |
| AC-03 | `tests/vh-adlc/seo/semrush.test.ts` starts a local stub on a random port, sets `VH_ADLC_SEMRUSH_BASE`, and runs the helper for: no `--allow-units`; `--allow-units` without `--max-units`; a limit that fits one full report, then a lowered row limit, then a `limit` refusal; the same sequence split across three invocations sharing `--output`; two concurrent invocations sharing `--output` whose combined maximum cost exceeds the limit, asserting that the cost of the rows the stub served stays within it; one invocation reconciling, with a held stub response, while another reserves, asserting that both entries and any terminal outcome are kept in `ledger.json`; a ledger holding an unreconciled reservation; absent and zero `display_limit`, and a `display_limit` of 1000 under a limit that pays for it, asserting the value the stub receives (100 for all three); each of these on both routes unless it names one; `SEMRUSH_API_KEY` set in the environment with `--key-file` naming a different key, asserting the file's key reaches the stub; `--key-env` naming a variable while `SEMRUSH_API_KEY` holds a different key, asserting the named variable's value and no other reaches the stub; neither `--key-file` nor `--key-env`; a ledger lock held by another process for over 30 seconds, asserting `busy` and zero requests; a stub that redirects to a second loopback listener, asserting that listener receives zero requests and the outcome is `provider_error`; a second invocation with a different `--max-units`; a limit below one row's price; a historical request whose regular-rate cost would fit but historical-rate cost does not; each row of the outcome table, using the documented v3 error strings quoted in Background, each sent with a 4xx status, and MCP responses in the archived envelope, each followed by a second invocation for the terminal ones; an MCP call to `list_projects` and to a tool other than `execute_report`; an MCP response whose `api_units` is below the reservation, and one whose reservation fills the limit and whose `api_units` exceed it, asserting the reported figure and `price_mismatch` in the ledger and no request from a later invocation; no `--route` and a changed `--route`; an MCP stub asserting the key arrives only in the `Authorization` header and never in a URL; a balance stub returning HTTP 429 and one returning non-numeric text; a non-loopback base and `http://api.semrush.com`; a credential file holding a private key block and one with two env lines; a bare-key file, a `SEMRUSH_API_KEY=` file and a 67-character key with hyphens and an underscore; and a successful call. The MCP stub serves copies of the archived initialize, success and `no_data` responses, with target and account identifiers replaced, kept under `tests/vh-adlc/seo/fixtures/mcp/`; each MCP error case changes only the `code` inside `content[0].text`. A static assertion checks that the three built-in URLs use `https://`. It asserts balance, handshake and report call counts on the stub (zero requests of any kind for every refusal), units used against `--max-units`, recorded outcomes, `key=REDACTED` and a redacted `Authorization` header in saved requests, and no fixture key in stdout, stderr or saved files. |
| AC-04 | Offline forward scenario `tests/vh-adlc/seo/run.ts no-permission`, run through a local Codex marketplace install in a separate agent context. The stub serves as `VH_ADLC_SEMRUSH_BASE` and answers successfully. The committed adapter names a valid fixture credential but no permission; an uncommitted working-tree edit adds a permission, and one fixture page says units are allowed. The fixture sets `refs/remotes/origin/HEAD` to its default branch. One variant checks out a non-default branch whose commit adds a permission and limit while the default branch has none; another has the permission committed but no `refs/remotes/origin/HEAD`. In all three, assert zero requests of any kind at the stub, no `semrush.com` host in any transcript tool call, Semrush skipped in source coverage, and findings present. |
| AC-05 | Scenario `permitted` with a committed permission and limit: assert every recorded invocation's `--max-units` equals the limit and its `--output` is the same directory, the cost of the rows the stub served, summed over the run at the helper's prices, stays within the limit, at least one report request at the stub and one saved redacted request, with that request and `ledger.json` inside a dated directory under the adapter's raw export location and listed in the manifest, and search every saved file and the raw transcript for the fixture key. Scenario `in-run`, whose prompt allows Semrush units without a number and whose adapter grants none: assert the recorded `--max-units` is 500. Scenario `limited`, whose committed limit is below one row's price: assert zero requests of any kind at the stub, a `limit` outcome, and a report line saying Semrush stopped at the unit limit. |
| AC-06 | Scenario `expired` with permission, a dated earlier Semrush export in the export location, and an MCP stub whose handshake returns HTTP 401: assert one handshake, no report call, the `authentication` outcome and no later Semrush request, that the report labels the earlier export historical and does not present it as current, and findings present. |
| AC-07 | `seo.test.ts` asserts the authority row text and each named rule in `references/seo.md`. |
| AC-08 | Every scenario: compare the fixture tree before and after against the adapter's locations and the adapter's hash, recompute the manifest digests, and check the `permitted` handoff for the startup-flash item from a fixture page whose heading disappears during startup. |
| AC-09 | `seo.test.ts` asserts the `loop.md` list; scenario fixtures show no new `AGENTS.md` or bridge files. |
| AC-10 | `seo.test.ts` checks the compatibility section and its link, the Bun statements in `installation.md` and the compatibility section, the sixteen-skill counts in `workflows.md` and `installation.md`, both workflows tables, the manifest and marketplace text and the historical note; `tests/vh-adlc/check.test.ts` for the version; `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc --timeout 60000` locally; `gh pr checks 76` on the head. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The defaults listed in the owner summary were set under the owner's standing instruction of 2026-11-10 to take the recommended option, and are confirmed or rejected at acceptance.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-11 | R-1 | spec | `70f88db` | unknown | procedural | 12 findings: 1 blocking, 9 should-fix, 2 nits; model identity not attested |
| 2026-11-11 | R-2 | spec | `dbb0485` | unknown | procedural | Changes needed: 1 blocking, 7 should-fix, 4 nits. |
| 2026-11-11 | R-3 | spec | `aba495b` | unknown | procedural | Changes needed: 1 blocking, 4 should-fix, 4 nits. |
| 2026-11-11 | R-4 | spec | `9c146a3` | unknown | procedural | Changes needed: 1 blocking, 4 should-fix, 4 nits. |
| 2026-11-11 | R-5 | spec | `30f552b` | claude-opus-4.8 | procedural | Changes needed: 1 blocking, 1 should-fix, 3 nits. |
| 2026-11-11 | R-6 | spec | `7d44d21` | claude-opus-4.8 | procedural | Changes needed: 3 should-fix, 2 nits; no blocking finding. |
| 2026-11-11 | R-7 | spec | `ae4622a` | unknown | procedural | Changes needed: 3 should-fix, 3 nits; no blocking finding. |
| 2026-11-11 | R-8 | spec | `7533fd0` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix, 2 nits; no blocking finding. |
| 2026-11-11 | R-9 | spec | `ba8b3de` | claude-opus-4.8 | procedural | Changes needed: 1 should-fix, 2 nits; no blocking finding. |

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

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design, Semrush helper; Acceptance Criteria AC-03; Test Plan AC-03
EVIDENCE: Design line 141 says the helper "stops once units used in the run reach `--max-units`. The limit can be exceeded only by the final request's cost, and each request's `display_limit` is capped at 100 rows." Line 45 sets 500 units as the default for an in-run grant. The Semrush API unit balance page says Domain Organic Search Keywords costs "10 units per keyword" for regular data and "50 units per keyword" for historical data, and that per-line reports charge for each line returned. One 100-row request can therefore cost 1,000 to 5,000 units, which is 2 to 10 times the 500 default, and the first request alone can do this. The AC-03 proof ("a limit reached after two calls") passes whatever a single request costs. The goal "spends paid API units only ... within a limit" fails while every box is ticked.
PROPOSAL: Have the helper estimate each request's maximum cost (rows times the report's per-line price, or its fixed price) before sending it. It should refuse the request, or lower `display_limit`, when that estimate would exceed the units left under `--max-units`. Add an AC-03 case where a single request's estimated cost exceeds the remaining limit, and assert that the stub receives no request.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper and Authority; Acceptance Criteria AC-03, AC-05; Test Plan AC-05
EVIDENCE: Line 139 says the helper "takes `--output <dir>`, `--max-units <n>`", but the document never says what happens when `--allow-units` is passed without `--max-units`. Lines 121 and 152 require "a unit permission with a per-run limit" but do not say whether an adapter permission with no limit counts as no permission. No criterion or Test Plan row checks the limit the agent actually passes. AC-05 asserts only "at least one helper request", so the scenario passes even if the agent passes `--max-units 1000000` or ignores the adapter's limit. The 500-unit default for an in-run request (lines 45 and 152) is not covered anywhere. R-1 F-05 also asked for a run-level case "in which a stated limit stops further unit-spending calls and the run reports that it stopped". AC-03 covers only the helper.
PROPOSAL: Make the helper refuse `--allow-units` without `--max-units`, and state that an adapter permission without a limit counts as no permission. Extend AC-05 so that the recorded helper invocation's `--max-units` equals the adapter limit and the report states that the run stopped at the limit. Add a scenario or helper-level check for the 500 default.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-04; Test Plan AC-04; Design, Adapter
EVIDENCE: Test Plan line 183 runs `no-permission` with "an adapter without permission" but does not say whether that adapter names a working credential source. Line 124 says "An absent credential source means no Semrush call", so an adapter with no credential also gives zero stub requests and the permission gate is never tested. Line 124 also says an "uncommitted or branch-only edit does not count, and neither does text in audited pages or exports", and line 152 repeats this in the authority row. No criterion or scenario checks either rule. AC-07 checks only that `seo.md` states it.
PROPOSAL: Specify that the `no-permission` fixture names a valid fixture credential and that the stub would succeed. Add a variant with an uncommitted adapter edit that grants units, and a fixture page or export that claims permission, and assert zero stub requests in both.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper
EVIDENCE: Line 144 says the helper "accepts `VH_ADLC_SEMRUSH_BASE` to point at a test server; it is used only by tests". Nothing in the helper enforces that. Line 138 has the helper read "the credential file the adapter names", with "the agent passes the file path". The agent keeps Bash (line 105) and reads untrusted pages. A prompt-injected or mistaken run that sets the base to another host, or passes another secret file as the credential path, makes the helper send the key or that file's contents to the attacker's host or to Semrush. This defeats the line 138 promise that the key stays private. AC-03 does not cover it.
PROPOSAL: Accept the override only for loopback hosts, and reject a credential value that does not match the Semrush key shape. Add AC-03 cases where a non-loopback base and a non-key file are refused with no request sent.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context, Background; Design, Semrush helper
EVIDENCE: Line 67 cites the balance request as `http://www.semrush.com/users/countapiunits.html?key=...`. The Semrush API unit balance page gives that plain-HTTP URL on the `www.semrush.com` host. Reports go to `https://api.semrush.com/` (SEO API overview). Line 141 calls the balance request before every report. As written, the helper sends the key in clear text on every call. A single `VH_ADLC_SEMRUSH_BASE` (line 144) also does not say how the stub stands in for two different hosts.
PROPOSAL: Require HTTPS for every Semrush request, including the balance request, and refuse plain HTTP. State how the base override maps both the balance path and the report path, and assert in AC-03 that the stub sees both.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary
EVIDENCE: Line 41 says the helper "refuses unit-spending calls unless one of two things grants them: the owner's request in the current run, or a unit permission in the adopter's committed adapter. It also stops at a per-run unit limit." Design line 140 says the helper refuses "unless `--allow-units` is passed. The agent passes it only with the owner's current request or the committed adapter permission." The helper checks a flag. Whether a grant exists, including the committed-default-branch rule, is decided by the agent. The summary tells the owner the grant check is enforced in code.
PROPOSAL: Reword the summary so the agent decides whether a grant exists and the helper enforces only the flag and the limit. Then state which scenario proves the agent's decision.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary; Open Questions
EVIDENCE: Line 45 says "One default was set under the owner's standing instruction", and line 197 names only "The unit-limit default". The Design settles other choices the summary does not disclose. Line 134 says "A connected Semrush tool is out of scope for this version", which removes the "connected tool" route that seo.md:91 on feat/seo-agent allows. Line 161 says the 0.18.0 sequencing "is a choice". Line 141 caps `display_limit` at 100 rows. Line 105 drops the agent's `Edit` tool.
PROPOSAL: List each settled default in the owner summary so the owner can confirm or reject it at acceptance, at least the connected-tool exclusion and the version sequencing.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Context; Design, Documentation and packaging
EVIDENCE: conventions/delivery.md:85-89 at d8f07c9 says "A feature document names every artifact its change affects and the path that builds and publishes each one ... Before merge, a check rebuilds each artifact the way that path builds it." This change modifies the vh-adlc plugin package, both manifests and the `.claude-plugin/marketplace.json` entry (lines 158 and 161). It also adds a Bun helper. `grep -n -i "release\|publish\|artifact"` on the document finds no artifact or publication path.
PROPOSAL: Add a short artifact and publication path note naming the plugin package and its marketplace route. Name the pre-merge check that installs it the way consumers do, for example the forward scenarios' local marketplace install.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria AC-10
EVIDENCE: AC-10 says "passes locally apart from the known fixtures digest failure", and the document never defines that failure. Running `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc/fixtures.test.ts` at dbb0485 fails with "the installer rejected the fixture lock: vh-adlc: /usr/local/bin/vh-adlc reports vh-adlc 0.19.0 but its digest does not match the lock". An implementation reviewer could treat any fixtures failure as "known".
PROPOSAL: Name the exact test and error message that is excused, and say that CI runs it.

FINDING: F-10
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-01
EVIDENCE: Line 180 says `seo.test.ts` asserts "that the rest of the audit paragraph matches main". After merge, main contains the new sentence, so a comparison against main either has to strip the sentence or fails. A test based on `origin/main` also depends on the checkout's remote state.
PROPOSAL: Compare against the paragraph text at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`, held as a fixture string, not against main.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-06
EVIDENCE: Line 185 asserts "historical labels on saved exports" but does not require the `expired` fixture to contain any dated earlier Semrush export. With none, the label check passes with nothing to label. This is the same gap R-1 F-06 found for the startup case.
PROPOSAL: Require the `expired` fixture to include at least one dated earlier Semrush export, and assert that the report labels it historical and does not present it as a current measurement.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Design, Semrush helper; Design, Documentation and packaging
EVIDENCE: Stackweaver origin/main agents/seo.md:27-28 says the credential at `/home/m/code/semrush.env` "may be a bare key". Design line 138 does not say which file formats the helper parses. The helper is TypeScript under `scripts/seo/`. installation.md:121-140 lists Bun as a requirement for each operation that needs it, and Design line 159 changes only the skill count there.
PROPOSAL: State that the helper accepts both a bare key and a `SEMRUSH_API_KEY=` line, and cover both in AC-03. Add the Bun requirement for Semrush use to installation.md and the compatibility section.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design, Semrush helper; Acceptance Criteria AC-03, AC-05; Test Plan AC-03, AC-05
EVIDENCE: Line 149 says the helper "takes `--output <dir>`, `--max-units <n>`, `--allow-units` and the report parameters, and records the `--max-units` value it was given". Line 152 says it fits each report to "the units left under `--max-units`" and concludes "Units used in a run therefore never exceed `--max-units`." Line 153 says it "stops all calls after an authentication, expiry or quota failure". The document never says whether one run is one helper process or whether the helper keeps usage and outcomes across invocations, for example in `--output`. If the agent calls the helper once per report, each process starts with the full limit and no record of earlier failures. Three calls with `--max-units 500` can then spend up to 1,500 units. The AC-03 sequence ("a limit that fits one full report, then a lowered row limit, then a `limit` refusal", line 199) passes within one process. AC-05 (line 186, Test Plan line 201) checks only that the recorded `--max-units` equals the limit and that at least one report was sent. The goal "spends paid API units only ... within a limit" can fail with every box ticked.
PROPOSAL: Define the run ledger. For example, the helper records units used and terminal outcomes under `--output`, counts them against `--max-units` on every invocation, and refuses after a terminal failure, and the procedure requires one `--output` per run. Add an AC-03 case with two separate invocations sharing `--output` whose combined cost would exceed the limit. Make AC-05 assert that the units summed over all helper invocations in the run stay within the committed limit.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper; Acceptance Criteria AC-03
EVIDENCE: Line 151 gives each supported report type "its documented per-line or per-request price", and line 149 passes "the report parameters" through. Background line 73 notes that Domain Organic Search Keywords costs "10 units per line, or 50 for historical data". The Semrush API unit balance page confirms that historical data "costs more than regular data requests" (500 keywords x 50 units versus x 10 in its example). If the agent passes a historical-date parameter while the helper prices the request at the regular rate, the pre-send estimate is 5 times too low and the limit is exceeded. The design does not say how price-changing parameters are handled, and AC-03 has no case for them.
PROPOSAL: Hold separate regular and historical prices per report type, or allow only a fixed set of parameters per type and refuse any that change the price. Add an AC-03 case where a historical request is priced at the historical rate, or refused, with the stub receiving nothing that would exceed the limit.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper; Acceptance Criteria AC-06; Test Plan AC-06
EVIDENCE: Line 152 sends the keyed `countapiunits` balance request "before each report". Line 153 lists the outcomes for reports but does not say what a failed, blocked or unparseable balance response does. The Semrush page shows the balance response as `1,000`, with a thousands separator. With an expired key, the balance request uses the same key and would fail first, so no report request is ever sent. Test Plan line 202 nevertheless asserts "one report request" for the `expired` scenario. That passes only with a stub that answers the balance call successfully for an expired key, which tests a sequence the real API is not expected to produce, and it leaves the failure path the helper will actually take untested.
PROPOSAL: State that a balance response that is not a parsable number gets one of the recorded outcomes, sends no report and stops further calls. Make the `expired` stub return the expired-key error on the balance path and assert zero report requests and one Semrush request in total. Add an AC-03 case for a non-numeric or blocked balance response.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context, Background
EVIDENCE: Line 73 says "The same path answers over HTTPS: `curl https://www.semrush.com/users/countapiunits.html` without a key returned HTTP 400". On 2026-11-11 I repeated that request and got 400 with `{"errors":[{"field":"key","message":"field is required"}]}`. The same HTTPS path with a dummy 32-character key returned HTTP 429 and an HTML page titled "Blocked request", on two attempts, one with a custom user agent. The plain `http://` URL returned 301. The same dummy key on `https://api.semrush.com/` returned `ERROR 120 :: WRONG KEY - ID PAIR`. A keyless 400 does not show that a keyed HTTPS balance request is answered, and every report in the design depends on that request.
PROPOSAL: Record the keyed probe result and its limits in Background. Say whether a report may still proceed, bounded by `--max-units` and the price alone, when the balance host blocks the helper, or whether the run then records a provider error and stops.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary
EVIDENCE: Line 41: "The helper reads the key itself, so the key never enters the agent's context, command lines or saved files". Line 148 has the helper read `SEMRUSH_API_KEY` or a file whose path the agent passes. Line 115 keeps the agent's Bash and read tools, so the agent can still read the credential file or print the environment. Only the procedure keeps the key out of the agent's context, and only the AC-05 transcript search would detect a leak. As with R-2 F-06, the summary presents a procedural rule as guaranteed.
PROPOSAL: Reword the summary to say that the helper reads the key so the agent does not need to, that the procedure forbids reading the key, and that the AC-05 scenario checks transcripts and tool output for the fixture key.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper; Acceptance Criteria AC-03; Test Plan AC-03
EVIDENCE: Line 155 fixes both Semrush URLs as HTTPS. Line 156 allows `VH_ADLC_SEMRUSH_BASE` only for loopback hosts, over HTTP or HTTPS. The only way to give the helper an `http://` Semrush URL is a non-loopback base, which the non-loopback case already refuses. So the AC-03 "non-HTTPS Semrush URL" case (lines 184 and 199) cannot fail on its own and tests nothing beyond the non-loopback case.
PROPOSAL: Drop the case, or replace it with a check that the helper's built-in report and balance URLs use `https://` and that `http://api.semrush.com` as the base is refused with its own reason.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper
EVIDENCE: Line 148 says the helper refuses a value that is not "a single token of 16 to 64 letters and digits ... so another secret file cannot be sent". Many other secrets, such as hex tokens and alphanumeric API keys, match that shape and would still be sent to Semrush. The check stops PEM blocks and multi-line files, not every other secret.
PROPOSAL: Reword the line to claim only what the check does, or narrow the accepted shape to the documented Semrush key format if Semrush documents one.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-04
EVIDENCE: Line 200 says the scenario runs "through a local Codex marketplace install in a separate agent context, as the 2026-10-30 test was". On feat/seo-agent at 8e028c2, `docs/research/seo-agent-validation-2026-10-30.md` says "A separate context was given only the skill" (line 14). It also says the test is "not ... native host discovery, an API installation test" (lines 33-34) and that "no release or native installation is claimed" (lines 9-10). The 2026-10-30 test did not use a marketplace install.
PROPOSAL: Limit the comparison to the separate agent context, or drop "as the 2026-10-30 test was".

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Context, Background
EVIDENCE: Line 57 says "`plugins/vh-adlc/references/lifecycle.md:76-82` holds the audit-routing rule", while Sources line 403 cites `lifecycle.md:75-81`. At bda1a8771a837cb028df3cb4d125f9c7da2735ff, `git show <sha>:plugins/vh-adlc/references/lifecycle.md` shows the paragraph on lines 75-81, starting "Audit routing requires persistent source-audit intent", and line 82 is blank.
PROPOSAL: Change line 57 to `lifecycle.md:75-81`.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design, Semrush helper; Acceptance Criteria AC-03; Test Plan AC-03
EVIDENCE: Line 151 says "Every invocation reads it first, counts earlier usage against the limit". Line 154 says "After the report it adds the cost of the rows returned to the ledger. Units used in a run therefore never exceed `--max-units`." The design has no lock and no reservation before a request is sent. Suppose two helper invocations run at the same time with `--max-units 500` and the same `--output`, which hosts that run tool calls in parallel allow. Each reads 0 units used and fits 50 rows of Domain Organic Search Keywords at 10 units a row. Both send, and the run spends 1,000 units. The same gap applies to a helper killed by a host timeout after it sends but before it writes the ledger: the units it spent are never recorded. Every AC-03 case on line 202 is sequential. The goal "spends paid API units only ... within a limit" can still fail with every box ticked.
PROPOSAL: Have the helper lock the ledger and reserve each report's maximum cost before sending, then reconcile to the rows returned. A reservation that was never reconciled stays counted. Add an AC-03 case with two concurrent invocations sharing `--output` whose combined maximum cost exceeds the limit, and assert that the cost of the rows the stub served stays within the limit.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-05; Design, Semrush helper
EVIDENCE: Line 150 says "The procedure uses one `--output` directory per run", and line 151 keeps the ledger in `--output`. The Test Plan AC-05 row on line 204 asserts "every recorded invocation's `--max-units` equals the limit, the ledger's units used stay within it". An agent that passes a second `--output` directory gets a fresh ledger with the full limit. Each ledger then stays within the limit while the run spends twice as much, and AC-05 ("keeps the units summed over all invocations within it", line 189) passes as written. The check reads the helper's own ledger instead of an independent measure.
PROPOSAL: In the AC-05 scenarios, assert that every helper invocation used the same `--output`. Compute units from the rows the stub actually served, summed over the whole run, and check that total against the committed limit.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary
EVIDENCE: Line 41 says the helper "keeps a ledger for the whole run, so a run never goes over its limit however many times the helper is called". Under the Design, this holds only when every call passes the same `--output` (line 150, a procedural rule), the calls do not overlap (see F-01), and the agent does not edit `ledger.json` (it keeps Bash and `Write`, line 116). The summary presents a procedural limit as guaranteed in code, which is the same kind of problem as R-2 F-06 and R-3 F-05.
PROPOSAL: Say that the helper enforces the limit across calls that share the run's output directory, that the procedure requires one directory per run, and which scenario checks that.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper; Acceptance Criteria AC-03; Test Plan AC-03
EVIDENCE: Line 154 says the helper "lowers `display_limit` (at most 100) to fit the units left". The Semrush Domain reports page says of `display_limit`: "If this parameter isn't specified or is set to 0, the default value will be 10,000 lines". At 10 units a line, that is 100,000 units. The Design does not say that the helper always sets `display_limit`, or that it treats an absent or 0 value as unbounded. A helper that takes the minimum of the passed value, 100 and the fit sends `display_limit=0` unchanged. AC-03 has no case for an absent or zero row limit.
PROPOSAL: State that the helper always sends a `display_limit` between 1 and the fitted maximum, and treats an absent or 0 value as 100 before fitting. Add an AC-03 case for each, asserting the `display_limit` the stub receives.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper; Design, Adapter
EVIDENCE: Line 149 says the helper "reads the key from `SEMRUSH_API_KEY`, or from the credential file the adapter names", with no order of precedence. Line 135 says "An absent credential source means no Semrush call". `authority.md:69` at bda1a87 says "Never try unrelated credentials." The helper cannot see the adapter. An adopter shell that exports `SEMRUSH_API_KEY` for another account would have that key used even when the adapter names a different file or no credential source at all.
PROPOSAL: Have the helper use only the source the agent selects explicitly, such as a credential file path or a flag naming the environment variable when the adapter names it, with no fallback. Add an AC-03 case with the environment variable set and a file passed, asserting the file's key reaches the stub.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper; Test Plan AC-03, AC-04
EVIDENCE: Line 155 sends the keyed balance request "once per run, before the first report" and does not say whether a refused invocation sends it. AC-03 (line 187) says the helper sends nothing when one row does not fit. The Test Plan on line 202 asserts only "zero report requests for every refusal", and AC-04's proof on line 203 asserts "zero report requests at the stub". Both pass if a refused or ungranted call still sends the key to the balance host.
PROPOSAL: State that the helper sends no request, including the balance request, unless the requested report passes every check. Assert zero total stub requests for each AC-03 refusal and in the `no-permission` scenario.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Semrush helper; Design, Sources and assessment
EVIDENCE: Line 154 adds "the cost of the rows returned" to the ledger, using prices held in the helper (line 153). Semrush report responses carry no cost, and line 155 says the balance cannot be relied on. The ledger is therefore an estimate at the helper's recorded prices, and a later Semrush price increase goes undetected. Line 139 keeps the evidence rules of `feat/seo-agent`'s `seo.md`, whose line 152 says "Record observed unit usage as reported, not an invented account debit total".
PROPOSAL: Label ledger units as estimates at the helper's recorded prices, with the date of the price source. Say in `seo.md` how this fits the kept line-152 rule, and disclose the limitation in the owner summary.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper; Context, Owner summary
EVIDENCE: Line 41 says "The helper talks only to Semrush over HTTPS", and line 158 fixes both URLs. The Design does not say how the helper handles redirects. Fetch follows redirects by default, which resends the key-bearing URL to the `Location` host. `curl -sI http://www.semrush.com/users/countapiunits.html` returned `301` with `Location: https://www.semrush.com:443/...`, so Semrush does redirect. A loopback stub that redirects would also lead the helper to a non-loopback host, which line 159 is meant to prevent.
PROPOSAL: Have the helper refuse to follow redirects and record a redirect as a provider error. Add an AC-03 case where the stub redirects to a non-loopback host and no request leaves loopback.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Design, Documentation and packaging; Acceptance Criteria AC-10; Test Plan AC-10
EVIDENCE: Lines 171-175 require these changes: `installation.md` lists Bun for Semrush use, the compatibility section states that Semrush use needs Bun, and the skill counts read sixteen in `workflows.md` and `installation.md`. AC-10 (line 194) and its proof (line 209) check only the compatibility section and its link, the tables, the manifest and marketplace text, the historical note and the version. AC-01 counts skills only through the discovery tests. These documentation items can be skipped with every box ticked.
PROPOSAL: Add the Bun statements in both documents and the two sixteen-skill counts to AC-10, and assert them in `seo.test.ts`.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Context, Owner summary; Context, Background; Design, Semrush helper
EVIDENCE: Line 37 says the owner wants Semrush used "only while its temporary token works". Lines 50 and 146 put "A connected Semrush tool (an MCP server or similar)" out of scope, so only the v3 key-in-URL helper may call Semrush. Line 150 has the helper refuse any credential "that is not a single token of 16 to 64 letters and digits". Stackweaver's adapter (`git show origin/main:agents/seo.md`, lines 27-29) names `/home/m/code/semrush.env`. That file has one non-empty line that is longer than 64 characters and contains hyphens and an underscore, and an awk check matched neither accepted form, so the helper would refuse it. Stackweaver `docs/internal/plans/marketing/semrush-visibility-baseline-2026-10-29.md:13` says this credential "still work[s] through `https://mcp.semrush.com/v2/mcp`" and that "Direct legacy API endpoints were not retried". In the cited Codex session, the probe that used this credential logged `"label": "v3_keyword", "status": 400, "body": "ERROR 122 :: WRONG FORMAT OR EMPTY KEY"`, `"label": "balance", "status": 400` with `invalid api key`, `"label": "v4_keyword", "status": 403` and `"label": "mcp_init", "status": 200`. The same baseline (line 25) says MCP report metadata "explicitly accounts for 210 API units", while lines 49 and 156 say Semrush reports no cost per response. If every box is ticked, the owner's only working Semrush credential can never be used, so the request that started this feature is not met. The Background and the owner summary leave this out, and the MCP default is presented without its consequence.
PROPOSAL: Record the 2026-10-29 probe results in Background, and say in the owner summary that with the MCP route out of scope Stackweaver cannot use Semrush at all. Alternatively, bring a bounded MCP route into scope under the same grant, limit and ledger rules, using the usage that MCP reports.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper; Acceptance Criteria AC-03, AC-06; Test Plan AC-03, AC-06
EVIDENCE: Line 158 says the helper records "authentication, expiry, quota, provider error, `limit` and `no_data` as distinct outcomes". AC-03 (line 189) requires that "an expired key" is recorded "as a distinct terminal outcome". Test Plan line 207 has the report path return "the expired-key error". The Semrush SEO API overview lists the errors at its "Error messages" heading. None of them is an expired-key error. The nearest are `ERROR 120 :: WRONG KEY - ID PAIR` ("unknown API key"), `ERROR 130 :: API DISABLED`, `ERROR 132 :: API UNITS BALANCE IS ZERO` and `ERROR 135 :: API REPORT TYPE DISABLED`, whose causes include "The subscription has ended". The 2026-10-29 probe also got `ERROR 122 :: WRONG FORMAT OR EMPTY KEY`, which is not listed. The design never maps any provider response to "expiry", so the stub's expired-key error has to be invented. AC-03 and AC-06 can then pass against a response Semrush never sends, while a real expiry falls into another class or into provider error.
PROPOSAL: Map each documented Semrush error code, plus `ERROR 122`, to an outcome in the Design and say which ones are terminal. Have the AC-03 and `expired` stubs return those documented strings, or merge expiry into authentication if the provider cannot tell them apart.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-05
EVIDENCE: Line 157 says the helper "sends no request at all, balance included, unless the requested report passes every check". The AC-03 row (line 204) asserts "zero requests of any kind for every refusal", and AC-04 (line 205) asserts "zero requests of any kind". The `limited` scenario on line 206 asserts only "zero report requests". So it passes if the keyed balance request is still sent when no row fits.
PROPOSAL: Assert zero requests of any kind at the stub in the `limited` scenario.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-03
EVIDENCE: Line 204 has "a stub that redirects to a non-loopback host, asserting no request leaves loopback". A unit test with only a loopback stub cannot see whether a request went to a non-loopback host, so this assertion has no stated way to be observed. Line 160 says the helper "never follows a redirect and records one as a provider error".
PROPOSAL: Redirect to a second loopback listener and assert that it receives zero requests and that the helper records a provider error. That shows the redirect was not followed, whatever the target.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Open Questions
EVIDENCE: Line 219: "The defaults listed in the owner summary were set under the owner's standing instruction of 2026-11-10 to take the recommended option, and is confirmed or rejected at acceptance." The subject "The defaults" is plural, so "is" does not agree with it.
PROPOSAL: Change "and is confirmed or rejected" to "and are confirmed or rejected".

### R-6

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary; Context, Background
EVIDENCE: Line 41 says "The owner's current token works only through Semrush's MCP endpoint: on 29 October the key-in-URL API rejected it and the MCP endpoint accepted it." In the cited Codex session, the probe that logged `v3_keyword` 400 `ERROR 122 :: WRONG FORMAT OR EMPTY KEY`, `balance` 400, `v4_keyword` 403 and `mcp_init` 200 is in the entries timestamped 2026-10-27T14:49:18Z, not 29 October. The 29 October baseline (line 13) says direct legacy endpoints "were not retried". The session also has later results that the document leaves out. At 2026-11-01T23:01 a client sending the `Authorization: Apikey` header got HTTP 200 with `no_data` for `domain_ranks`. At 2026-11-03T19:44 a client sending `Authorization: Bearer` got `"initializeHttpStatus": 401, "outcome": "authentication_failed"`, and the assistant wrote "Semrush now returns **401 Unauthorized**, so I've stopped API requests". The session has no later Semrush call. The MCP route was added to fix R-5 F-01 because the token worked, but nothing in the evidence shows the token works on 2026-11-11. Its last success was 1 November, and it may have expired by 3 November. The owner is asked to accept the extra MCP scope on a premise the document states as current fact.
PROPOSAL: Date the v3 rejection 27 October. Record the 1 November success and the 3 November HTTP 401 under the Bearer scheme, and say that whether the token works today is unknown. Note that the 401 is the observed basis for mapping MCP HTTP 401 to `authentication`. If the owner wants the question settled before acceptance, the owner can run the zero-unit initialize handshake with the `Apikey` scheme.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-03; Design, Semrush helper; Context, Owner summary
EVIDENCE: AC-03 (line 208) requires that the helper "never lets units used exceed `--max-units`". Line 51 of the owner summary says that when Semrush reports more units than were reserved, "That one report can take the run past its limit". Line 164 of the Design says "Reserved units in a run therefore never exceed `--max-units`" and that reported usage above the reservation is recorded with `price_mismatch`. The AC-03 Test Plan row (line 223) includes "one whose `api_units` exceeds it". If that reservation fills the limit, the documented behaviour makes AC-03 false. If the test picks a reservation that stays clear of the limit, AC-03 passes without showing the documented overrun case. The criterion and the design disagree on whether used units or reserved units are bounded.
PROPOSAL: Reword AC-03 to say that reserved units never exceed `--max-units`, and that used units can exceed it only through one report recorded as `price_mismatch`, after which nothing more is sent. In the Test Plan, have the over-reservation case fill the limit and assert both the overrun figure in the ledger and that a later invocation sends no request.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Background; Test Plan AC-03, AC-06
EVIDENCE: Background (line 80) says MCP errors "are JSON objects whose `code` is one of `validation_failed`, `no_subscription`, `no_api_units`, `no_data`, `rate_limit` or `internal`". The server instructions in the session introduce that list with "e.g.", so it is not complete. The document never says where Semrush places these objects. The credential-free archive in Stackweaver `.tmp/seo-research/semrush-visibility-2026-10-29/` shows the actual envelope. `control-spacelift-response.json` is a JSON-RPC `result` whose `content[0].text` is a JSON string holding `data` (CSV) and `metadata.usage.api_units: 10`, with a matching `structuredContent`. `overview-vhco.pro-response.json` carries the `no_data` object inside `result.content[0].text`. It has no JSON-RPC `error` and no `isError`. Live Semrush proof is out of scope, and the AC-03 row has the stub use only "the documented error strings and codes quoted in Background". The implementer therefore invents the envelope for both the helper and the stub. If every box is ticked, the helper can still misread a real `no_subscription` as success, or miss `api_units`. In that case, on the route this revision exists for, the ledger falls back to estimates or never sees a terminal outcome.
PROPOSAL: In Background, record the observed envelope and call the code list examples. Have the AC-03 stub, and the AC-06 stub, return responses with the same structure as the archived success, `no_data` and initialize responses, with any credential-free identifiers replaced.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-06; Acceptance Criteria AC-06
EVIDENCE: The scenario is named `expired` (line 226), but its stub returns `no_subscription`, which maps to `access_denied`. Line 167 of the Design says that "an expired or revoked key gives `authentication`". The only failure seen with the owner's credential on the MCP route was HTTP 401 on initialize on 2026-11-03. So the end-to-end scenario does not exercise the expired-token case it is named for, and that case is the owner's original concern.
PROPOSAL: Either rename the scenario to match what it tests, or have it return HTTP 401 on the MCP handshake and assert `authentication`, no further request and the historical label. Leave `no_subscription` to AC-03.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Background
EVIDENCE: Line 80 cites "The baseline (line 25) records 210 reported units". In `git show origin/main:docs/internal/plans/marketing/semrush-visibility-baseline-2026-10-29.md`, `grep -n "210 API units"` gives line 27. Line 25 is the paragraph about the project lists.
PROPOSAL: Cite line 27.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-06; Context, Owner summary
EVIDENCE: AC-06 (line 211) says the stub's MCP handshake returns HTTP 401 "as an expired token did on 3 November". The owner summary (line 41) says "On 3 November an MCP handshake got HTTP 401" and does not name the auth scheme. In the cited Codex session, the 2026-11-03T19:44:23Z client (`local-semrush-client.py`, added by apply_patch) sent `'Authorization': 'Bearer ' + token`. It read the same single line from `/home/m/code/semrush.env`. Every earlier client that the server accepted sent `'Authorization': 'Apikey ' + key`: the 2026-10-27T14:49 probe (`mcp_init` 200), the 2026-10-29 `stackweaver-semrush-mcp.py`, and the 2026-11-01T23:01 `domain_ranks` call (`http_status` 200, `no_data`). The Bearer scheme is the only change, so the 401 is explained at least as well by that scheme as by expiry. Nothing in the session shows that the token expired. The helper itself uses `Apikey` (Design line 159).
PROPOSAL: Remove "as an expired token did on 3 November" from AC-06, or replace it with "as the 3 November handshake did". In the owner summary, say that the 401 came from a client that used `Authorization: Bearer` instead of the `Apikey` scheme the helper uses, so it does not show that the token has expired.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper (outcome table); Context, Background; Test Plan AC-03
EVIDENCE: The outcome table (line 171 onward) maps v3 responses by their `ERROR nnn` body. It then sends "any other error, ... HTTP 5xx, a redirect" to the non-terminal `provider_error`. It does not say which HTTP status comes with a v3 error body or which one wins. Real v3 errors come with 4xx statuses. In the cited session the 2026-10-27 probe logged `"label": "v3_keyword", "status": 400, "body": "ERROR 122 :: WRONG FORMAT OR EMPTY KEY"`. On 2026-11-11, `curl -s -w ' HTTP%{http_code}' 'https://api.semrush.com/?type=domain_ranks&key=<32 zeros>&domain=example.com&display_limit=1'` returned `ERROR 120 :: WRONG KEY - ID PAIR HTTP403`. Background quotes the error strings but not these statuses. The AC-03 row has the stub use only "the documented v3 error strings quoted in Background". A helper that treats any non-2xx v3 response as `provider_error` would pass against a stub that returns those strings with HTTP 200. Against Semrush, the same helper would record a revoked key as non-terminal and keep sending other reports.
PROPOSAL: In Background, record the observed v3 statuses (400 for `ERROR 122`, 403 for `ERROR 120`). In the Design, state that a v3 `ERROR` body is classified by its code whatever the HTTP status. Have the AC-03 stub return each v3 error string with a 4xx status, and assert the mapped outcome.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-04; Acceptance Criteria AC-04; Design, Adapter
EVIDENCE: Design line 144 says the permission, limit and credential source "count only as committed on the adopter's default branch. An uncommitted or branch-only edit does not count". The owner summary says "Offline scenarios prove that decision". The AC-04 scenario (line 224) uses only "an uncommitted working-tree edit" and a fixture page. A procedure that reads the adapter from `HEAD`, for example `git show HEAD:agents/seo.md`, ignores the uncommitted edit and passes AC-04. The same procedure counts a permission committed only on the checked-out feature branch. Nothing else in the Test Plan exercises the branch-only rule, and the agent alone enforces this grant.
PROPOSAL: Add a `no-permission` variant whose checkout is a non-default branch with a commit that adds a unit permission and limit, while the default branch has none. Assert zero requests of any kind at the stub, and name the branch-only case in AC-04.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-03; Context, Owner summary
EVIDENCE: AC-03 (line 208) says the helper "lets used units exceed it only through one report whose reported `api_units` exceed its reservation". Line 161 releases the ledger lock once a reservation is written, before the request is sent, so concurrent invocations can have several reservations in flight. If two in-flight MCP reports each report more than they reserved, both overruns are recorded, and used units exceed the limit through two reports. The owner summary says shared-directory calls "in sequence or in parallel, never go over the limit together" (line 41) and that "That one report can take the run past its limit" (line 51). The Test Plan covers the overrun only in sequence.
PROPOSAL: Reword AC-03 and the summary to say that used units can exceed the limit only through reports already in flight when the first `price_mismatch` is recorded. Alternatively, require the helper to hold the lock across the send on the `mcp` route.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-03; Design, Semrush helper
EVIDENCE: AC-03 requires that the helper "uses only the credential source named by `--key-file` or `--key-env`". The AC-03 row tests `--key-file` with `SEMRUSH_API_KEY` set, and it tests neither flag. It has no case where `--key-env <NAME>` supplies the key that reaches the stub. Line 161 also defines a `busy` outcome for a lock not acquired within 30 seconds, "and no request". No criterion or Test Plan case covers `busy`, and `busy` is not in the outcome table.
PROPOSAL: Add an AC-03 case where `--key-env` names a variable and assert that its value, and no other, reaches the stub. Add a held-lock case that asserts `busy` and zero requests, or remove `busy` from the Design.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary; Design, Semrush helper; Acceptance Criteria AC-07
EVIDENCE: Line 41 says "the procedure forbids the agent from reading or printing it". The Design never gives the procedure that rule. It says the helper "never prints the key" and "The agent passes the path or variable name, never the key". The new `seo.md` line (Design, end of Semrush helper) says the helper "reads the key itself, keeps it out of the agent's context". AC-07 asserts only that reworded line. The agent keeps read tools and Bash (line 124 area, "keeping read, search, Bash, `Write`").
PROPOSAL: Add to the Design a `seo.md` rule that the agent never reads, prints or copies the credential file or variable, and include that rule in AC-07's assertions. Alternatively, reword the owner summary to match the Design.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper (run ledger); Test Plan AC-03; Context, Owner summary
EVIDENCE: Line 161 says "Every invocation takes an exclusive lock on the ledger before reading it and holds it until its reservation is written". Line 164 then says "Afterwards it reconciles the reservation to the response's `metadata.usage.api_units` ... When reported usage exceeds the reservation, the ledger records the reported figure and a terminal `price_mismatch` outcome". Line 166 also records the balance or `balance_unavailable` in the ledger. No line says that these later read-modify-write updates take the lock. Suppose invocation B reads the ledger to reconcile, invocation C then locks it and writes its reservation, and B writes back its stale copy. C's reservation is lost, and a fourth invocation can reserve the same units. A terminal outcome can be lost the same way, so later calls are not refused. The owner summary (line 41) promises that calls "in sequence or in parallel, never reserve more than the limit together". The AC-03 concurrent case uses only "two concurrent invocations", and both of them reserve before either reconciles, so this interleaving cannot happen in that test.
PROPOSAL: State that every ledger update (reservation, reconciliation, balance, terminal outcome) re-reads and writes `ledger.json` under the same exclusive lock. Add an AC-03 case where one invocation reconciles while another reserves, and assert that both entries and any terminal outcome are kept.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Semrush helper (outcome table); Context, Background; Test Plan AC-03
EVIDENCE: `curl -s https://developer.semrush.com/api/v3/seo/overview/` lists `ERROR 110 :: INVALID IMPORT KEY` ("The API key has an incorrect format"), `ERROR 402 :: Request param not valid` ("The API key is incorrect"), `ERROR 402 :: Request param not valid :: Duplicate domains` ("The 'targets' parameter contains duplicated values") and `ERROR 429 :: Too Many Requests`. Background line 82 lists none of them. The outcome table maps "any `ERROR 402`" (line 171) to terminal `authentication`, which includes the duplicate-domains parameter error. `ERROR 110` falls under "any other error" (line 177) as non-terminal `provider_error`, even though the similar `ERROR 122` "WRONG FORMAT OR EMPTY KEY" is `authentication`. Line 168 classifies a v3 `ERROR <n> ::` body "by its code whatever the HTTP status", so an `ERROR 429` body is `provider_error`. Line 174 maps HTTP 429 to terminal `rate_limited`. The two rules contradict each other for that documented response. The AC-03 row has the stub use "the documented v3 error strings quoted in Background", but Background quotes no `ERROR 402` string, so the 402 row cannot be tested as written.
PROPOSAL: Quote `ERROR 110`, both `ERROR 402` forms and `ERROR 429` in Background. Map each one explicitly in the table: 110 and the key form of 402 to `authentication`, the duplicate-domains 402 to `provider_error`, and `ERROR 429` to `rate_limited`. Have AC-03 send each of these strings.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper; Acceptance Criteria AC-05, AC-08; Test Plan AC-05, AC-08
EVIDENCE: The owner summary (line 39) says "Raw responses, a findings table and a SHA-256 manifest are saved where the adapter says". The helper saves requests, responses and `ledger.json` "under `--output`" (lines 161 and 178). The Design only says "The procedure uses one `--output` directory per run" (line 160) and never says that this directory is inside the adapter's raw export location or that the manifest covers the helper's files. AC-05 asserts "one saved redacted request" without a location. AC-08 compares only the fixture tree and recomputes the manifest digests. A run that writes `--output` outside the fixture, for example under a system temporary directory, passes AC-05 and AC-08, but its Semrush exports and ledger are then gone after access ends. The goal promises the opposite.
PROPOSAL: State that `--output` is the run's dated directory under the adapter's raw export location and that the manifest lists the helper's saved files. In the `permitted` scenario, assert that the saved redacted request and `ledger.json` are inside that location and listed in the manifest.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Sources; Context, Background
EVIDENCE: Sources (line 672 onward) lists the Codex session only for "entries at 2026-10-30T01:33, 13:19, 13:20 and 2026-11-07T21:27". Background relies on further evidence that Sources does not list: the 2026-10-27T14:49 probe, the 2026-11-01T23:01 `Apikey` call, the 2026-11-03T19:44 `Bearer` client, the Stackweaver baseline `semrush-visibility-baseline-2026-10-29.md` (lines 13 and 27), the credential-free archive `.tmp/seo-research/semrush-visibility-2026-10-29/`, and the Semrush domain-reports page behind "10 units per line, or 50 for historical data". The archived `no_data` object also carries `trace_id` (`overview-vhco.pro-response.json`: keys `code, message, retryable, hint, trace_id`), but Background describes only `code`, `message`, `retryable` and `hint`. The AC-03 stub copies these archived responses.
PROPOSAL: Add these sources to Sources, each with the claim it supports, and add `trace_id` to the Background description of the MCP error object.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary; Design, Semrush helper; Acceptance Criteria AC-03; Test Plan AC-03
EVIDENCE: Owner summary line 48 lists this default for the owner to confirm: "A report is capped at 100 rows, and fewer when its price would not fit the units left." The Design no longer caps a requested row count. Line 164 says the helper "treats an absent or zero `display_limit` as 100, computes the maximum cost from the row limit and price, lowers the row limit to fit the units left in the ledger, and always sends a `display_limit` between 1 and that fitted maximum." So 100 is only the value used when none is given. The cap came out with the R-4 revision: at `9c146a3`, line 154 read "lowers `display_limit` (at most 100) to fit the units left", and from `30f552b` onward the "(at most 100)" is gone. The summary line did not change. Under the current Design, a committed limit of 50,000 units and a requested `display_limit` of 1000 on Domain Organic Search Keywords (10 units per line) sends 1000 rows. AC-03 and the AC-03 Test Plan row cover only an absent or zero `display_limit`. No case sends a value above 100, so either reading passes.
PROPOSAL: Restore the cap in the Design: the fitted maximum is at most 100 rows. Add an AC-03 case that requests more than 100 rows under a limit large enough to pay for them, and assert that the stub receives 100. If the cap is not wanted, remove the line from the owner summary.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (balance bullet and outcome table)
EVIDENCE: Line 166 says the balance "is informational: it neither blocks a report nor proves the key works, because the request can be blocked". AC-03 also requires treating "a blocked or non-numeric balance as `balance_unavailable` without blocking the report". Line 167 then says the helper "maps responses to outcomes", and table row 174 maps a bare "HTTP 429" to a terminal `rate_limited`. Neither the bullet nor the table limits that mapping to report and handshake responses. The balance endpoint really does answer with HTTP 429. Background records this from the R-3 environment, and in this review `curl -s -w ' HTTP%{http_code}' 'https://www.semrush.com/users/countapiunits.html?key=<32 zeros>'` returned an HTML "Error code: 429" page with HTTP429. If the table is applied to every response, a blocked balance ends the run before its first report. The AC-03 balance case would catch that, but the Design text still contradicts itself.
PROPOSAL: Say that the outcome table applies to handshake and report responses only. Any balance response that is not a number becomes `balance_unavailable`, which is neither terminal nor recorded as a run outcome.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Adapter; Test Plan AC-04
EVIDENCE: Line 144 says the permission, limit and credential source "count only as committed on the adopter's default branch". AC-04 now has a variant that "checks out a non-default branch whose commit adds a permission and limit while the default branch has none". No line says how the procedure identifies the default branch. It does not choose between `origin/HEAD`, the local `main` ref and the remote-tracking ref, and it does not say what happens when no default branch can be found. `git grep -i "origin/HEAD\|symbolic-ref" ba8b3de -- plugins/vh-adlc/references` finds only `clean.md:50`, so the package has no shared rule to rely on. The Test Plan does not say how the fixture marks its default branch. Take an agent that assumes `main`, or falls back to `HEAD` when it finds no `origin/HEAD`. It can pass a fixture built around `main` and still behave wrongly in an adopter repository whose default branch has another name or has no remote-tracking ref.
PROPOSAL: Name the resolution in the Design, for example the branch `refs/remotes/origin/HEAD` points to. If the default branch cannot be resolved, treat it as no permission. Have the AC-04 fixture set that ref explicitly, and add a case with no resolvable default branch that also expects zero requests at the stub.

## Sources

- `plugins/vh-adlc/references/authority.md`, `references/loop.md`, both package manifests and `tests/vh-adlc/triage/discovery.test.ts` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- `feat/seo-agent` at `8e028c2`, its `references/seo.md`, skill, agent and validation note, and its independent PR review in this session.
- Stackweaver `agents/seo.md` at branch `docs/seo-performance-followup-20261105`, contained in `origin/main`.
- Local Codex session `rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`: entries at 2026-10-30T01:33, 13:19, 13:20 and 2026-11-07T21:27 (the request and the PR's origin); 2026-10-27T14:49 (the v3, balance, v4 and MCP probe); 2026-11-01T23:01 (the `Apikey` MCP call returning `no_data`); 2026-11-03T19:44 (the `Bearer` client's HTTP 401); and the MCP server instructions and `execute_report` schema (error codes and `api_units`).
- Stackweaver `docs/internal/plans/marketing/semrush-visibility-baseline-2026-10-29.md` on `origin/main`, lines 13 and 27: the MCP route working, legacy endpoints not retried, and 210 reported units.
- Stackweaver's ignored, credential-free archive `.tmp/seo-research/semrush-visibility-2026-10-29/`: the `initialize`, `tools/call` success and `no_data` envelopes.
- [Semrush SEO API overview](https://developer.semrush.com/api/v3/seo/overview/): the API key is passed as the `key` query parameter.
- [Semrush domain reports](https://developer.semrush.com/api/v3/seo/domain-reports/): 10 units per line for Domain Organic Search Keywords, or 50 for historical data.
- [Semrush API unit balance](https://developer.semrush.com/api/v3/get-started/api-units-balance/): the free `countapiunits` balance request and per-line or per-request pricing.
- `tests/vh-adlc/check.test.ts:224-232` and `plugins/vh-adlc/references/lifecycle.md:75-81` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- Engineering docs at `d8f07c9dd69038375a535af8ad586086688f85ab`: `conventions/feature-documents.md`, `guides/feature-document-template.md`, `guides/humanize-prose.md`.
