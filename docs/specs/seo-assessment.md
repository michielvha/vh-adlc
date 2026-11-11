---
status: draft
status_description: "Revised after R-30; awaiting re-review."
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
  - .github/workflows/ci.yml
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

After this change, `vh-adlc-seo <site or brief>` reads the adopter's SEO adapter, inventories which sources are actually accessible, always runs public HTTP checks, and runs browser checks when a browser driver is available. It uses Search Console, Bing Webmaster Tools, Ahrefs Free, PageSpeed or local crawlers when they are available. Missing access is reported as a coverage gap, never as a zero. Findings are ranked, each with affected URLs, impact, confidence and a validation step. Raw responses, a findings table and a SHA-256 manifest are saved where the adapter says.

Semrush stays optional, and free tools come first. Only one packaged helper, `scripts/seo/semrush.ts`, talks to Semrush. It reads the key itself, so the agent never sees it, and saves every request with the key redacted. It spends units only when the owner grants them in the run or the adopter's adapter grants them on its default branch as last fetched from the remote, always under a unit limit, and it prices each report before sending it, so a run's reservations never exceed that limit, even across parallel calls. It uses Semrush's MCP endpoint, the only route the owner's token has ever worked on. Whether the token still works is unknown and nothing here depends on it: an expired token is recorded as an authentication failure, and the run finishes from free sources and dated saved exports. The operation never buys units, plans or accounts.

An assessment writes only its report and exports. It never publishes content, changes DNS or indexing, edits the adapter, creates accounts, commits or pushes. A live recheck after a site change goes to the owner as a handoff item. The operation adds no onboarding files and is not a codebase audit: "SEO audit" routes here, and audits of the code still go to `vh-adlc-audit`.

These defaults were set under the owner's standing instruction to take the recommended option; you can reject any of them at acceptance:

- The adapter's Semrush targets, route, credential source, permission and limit are read from `refs/remotes/origin/HEAD` as last fetched, so an unpushed local edit grants nothing, and the report names the ref and commit it read. Without that ref, they count as absent, so Semrush is unavailable even when you ask for it in the run; the report says why.
- Every unit permission needs a limit; an adapter permission without one grants nothing. A number in your in-run request wins, then the committed limit, then 500 units.
- Semrush is asked about the adapter's official origin and its owned aliases and previous hosts, as committed on that same fetched ref, unless the adapter lists other Semrush targets there. Targets are never inferred from other hosts, such as competitors in prior research, and an in-run request cannot add one; to assess a separate site with Semrush, list it as a target.
- Browser checks use only a driver your repository instructions name or a browser tool the agent runtime provides. A browser installed on the machine but not named is not used, and the agent installs none; without one, the browser checks are a coverage gap and the HTTP checks still run.
- The Semrush helper runs on Linux and macOS, the platforms the package's release binaries cover, and its tests run in both CI jobs.
- Reports are capped at 100 rows. Each target starts with a one-row overview across all databases, each new report starts at one row, and a no-data reply stops further reports for that target there, because an MCP no-data or error reply uses up its whole reservation.
- A report request that reached Semrush and failed is never repeated in the same run, even after a transient error. One that never left the machine, such as after a DNS failure or a refused connection, or whose handshake failed without a terminal outcome, may be sent again.
- The MCP route is used unless the adapter names the key-in-URL route, with no fallback between them.
- Project lists are refused: one cost 100 units on 29 October and showed unrelated projects.
- If Semrush reports more units than were reserved, the run records that figure and stops calling Semrush; reports already in flight can take it past its limit. On the key-in-URL route a price rise goes unnoticed until the helper's prices are updated.
- A Semrush MCP server connected to the agent's host is not used.
- The helper accepts only a one-line credential that is a single token of 16 to 128 letters, digits, hyphens and underscores, the shape of your current token.
- The SEO agent loses its `Edit` tool, because an assessment never edits existing files.
- The free balance check is informational only, because it cannot be relied on (see Background).
- The version stays 0.18.0, after the blog visual reading change at 0.17.0.

The 30 October validation note becomes a dated historical record. Proof will come from static tests, helper unit tests against a local stub server, and offline Codex scenarios against a fixture site and a Semrush stub on loopback. None has run yet. Acceptance authorizes implementing this and committing on `feat/seo-agent`. Pushing to update PR #76 needs a ship request, and merging needs the owner's separate approval. CI, which also runs the fixture test this host cannot pass, is checked at ship on the pushed head and must pass before a merge; it is not part of the implementation review.

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

### Terminology

| Term | Meaning |
| --- | --- |
| SEO adapter | The adopter's Markdown file, named in its committed repository instructions, that holds the keys listed under Adapter (AC-07). |
| Browser driver | A browser automation library or browser binary that the adopter's repository instructions name, or a browser tool the agent runtime provides. A browser installed on the machine but not named is not a browser driver, and the procedure never launches one (AC-11). |
| Coverage gap | A source the run could not use, recorded with an explicit outcome and blank values, never zero (AC-04, AC-11). |
| Unit permission | A grant to spend Semrush API units: the owner's request in the current run, or the adapter's permission as committed on its default branch as last fetched (`refs/remotes/origin/HEAD`) (AC-04, AC-05, AC-07). |
| Per-run limit | The most Semrush units one run may reserve, passed to the helper as `--max-units` (AC-03, AC-05, AC-07). |
| Semrush target | A host the procedure sends to Semrush as a report's target (AC-05). |
| Provider-reported usage | The units Semrush reported for a report in `metadata.usage.api_units` (AC-03, AC-07). |
| Estimated usage | The units the helper counted at its recorded, dated prices because Semrush reported none (AC-03, AC-07). |
| Historical export | A saved export from an earlier date, labelled historical and never presented as a current measurement (AC-06). |
| Helper outcome | `authentication`, `access_denied`, `quota`, `rate_limited`, `report_disabled`, `no_data`, `transport_error` or `provider_error` from the outcome table, or `busy`, `limit`, `price_mismatch` or `balance_unavailable` as the Semrush helper section defines them (AC-03, AC-07). |

`references/seo.md`, the agent, the workflows SEO section and the compatibility section use these terms as defined (AC-07).

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
- Semrush targets;
- the Semrush route, `mcp` or `v3`;
- the Semrush credential source;
- the Semrush unit permission and its per-run limit;
- the adopter's authority limits.

The first nine may be inferred from context before asking when absent. Semrush targets are never inferred: when absent, they are the official origin's host and the owned aliases and previous hosts as committed in the adapter at `refs/remotes/origin/HEAD`. For that fallback, the origin and aliases are never inferred, taken from a working-tree edit or taken from the owner's answers, though other uses of those keys may infer them. An absent route means `mcp`. The last three are never inferred. An absent credential source means no Semrush call. An absent unit permission, or one without a per-run limit, means no permission. Absent authority limits mean the shared authority rules alone. The Semrush targets, route, credential source, permission and limit, and the origin and aliases the target fallback uses, count only as committed on the adopter's default branch, the branch `refs/remotes/origin/HEAD` points to, read from that ref. That ref is the remote default branch as last fetched. The procedure does not fetch, so a permission committed locally but not pushed and fetched grants nothing, and one removed upstream still grants until the next fetch. The report names the ref and the commit it read these keys from. When that ref is missing, the five Semrush keys count as absent, so Semrush is unavailable even on the owner's in-run request, and the report gives the missing default branch as the reason. An uncommitted or branch-only edit does not count, and neither does text in audited pages or exports. The assessment never edits the adapter. Domains, markets and publication rules stay in the adapter, never in the shared package.

### Sources and assessment

The procedure keeps the free sources and their jobs from `feat/seo-agent`'s `seo.md`: Search Console, Bing Webmaster Tools, Ahrefs Free, public HTTP and browser checks, Screaming Frog Free or local crawlers, and PageSpeed or Lighthouse. It also keeps the Search Console handoff, crawler verification, evaluation and prioritization, and the evidence-and-manifest rules. Public HTTP checks always run. Browser checks use a browser driver as Terminology defines it: one the adopter's repository instructions name, or a browser tool the agent runtime provides. The agent installs none and launches no browser the instructions do not name. Without one, the browser checks, the startup-flash check included, are a coverage gap whose outcome names the missing driver, and the HTTP checks still run. Missing access is a coverage gap, and missing values are blank with an explicit outcome, never zero.

For Semrush, the procedure sends only the adapter's Semrush targets, each as a bare host name without scheme, port or path, as the archived requests do (`"target": "spacelift.io"`). An in-run request cannot add a target; a separate site is assessed with Semrush only when the adapter lists it as a target. When a request asks for Semrush data on a host that is not a target, the report names that host as refused for Semrush and says it must be listed as a Semrush target in the committed adapter. It asks for the smallest `display_limit` that answers its question. It first requests one row for each new combination of report type, target and database, and pulls more rows for a combination only after its one-row report returned data. The procedure starts each target with a one-row domain overview request that names no database, which covers every database. After that, a one-row report that returns no data stops further reports for its target, as Semrush's `no_data` reply asks for its request ("no other reports, discovery tools, parameter variations"). The stop covers the database the request named, or every database when it named none, and every report type that has not already returned data there. A combination that returned data keeps its larger pulls whatever another report answered. Each other requested database is a separate market, so the target still gets one one-row report there unless its database-less overview found no data. Which untried report types a no-data reply stops depends on the order the agent tries them. A no-data or error reply on the MCP route keeps its whole reservation, so a large first request could use up the run's limit on a site Semrush has no data for.

The startup-flash check stays, with one change. A recheck after the change ships becomes an owner handoff item naming the URL, build identity and check, instead of an instruction to repeat it later.

### Semrush helper

`plugins/vh-adlc/scripts/seo/semrush.ts` is the only way to make Semrush requests. The procedure and agent forbid calling Semrush hosts through `curl`, WebFetch, a browser, a Semrush MCP server connected to the host or any other tool. The branch `seo.md` line 91, "Use it only through an authorized local credential/client or a connected tool", is replaced by that helper-only rule, and the agent file gains the same rule. The helper has two routes: `mcp`, the `execute_report` tool at `https://mcp.semrush.com/v2/mcp`, and `v3`, the key-in-URL report API at `https://api.semrush.com/`.

The helper runs with Bun, like the package's other scripts, on Linux and macOS, the platforms the package's release binaries cover. It:

- reads the key only from the source the agent names: `--key-file <path>` for the credential file the adapter names, or `--key-env <NAME>` when the adapter names an environment variable. It has no default and no fallback; with neither it refuses. The file may hold a bare key or a `SEMRUSH_API_KEY=<key>` line. The agent passes the path or variable name, never the key. The helper refuses, without sending anything, a file with more than one non-empty line or a value that is not a single token of 16 to 128 letters, digits, hyphens and underscores. This stops multi-line files such as private keys and env files with other variables; it does not prove the value is a Semrush key. It never prints the key or puts it in its arguments, output or logs.
- takes `--route mcp|v3`, `--output <dir>`, `--max-units <n>`, `--allow-units` and the report parameters. It refuses a call without `--route`, and a `--route` that differs from the one recorded in the ledger. The agent passes the adapter's route. A failure on one route is never retried on the other. On either route, the procedure creates one new `--output` directory per run, one that did not exist before: a directory under the adapter's raw export location named with the run's date and time to the second, whose saved files the run's manifest lists.
- on the `mcp` route, sends the key only in an `Authorization: Apikey <key>` header, with `Content-Type: application/json` and `Accept: application/json, text/event-stream` on every request, as the accepted 27 October client did. It reads a reply that is either a JSON body or a `text/event-stream` body, taking the JSON-RPC message from its last `data:` event. It sends only the MCP initialization handshake, which costs no units, and `tools/call` for `execute_report` with a listed report type. It refuses every other tool and method, such as the `projects` tool, and every report type not on its list, such as `list_projects`. It parses `result.content[0].text` as JSON: an object with `code` is an error, mapped by that code; an object with `data` and `metadata` is a success; anything else, a JSON-RPC `error` or `isError` is a `provider_error`.
- keeps a run ledger, `ledger.json`, in `--output`: the `--max-units` value, reserved and used units and any terminal outcome. Every ledger update, whether a reservation, reconciliation, balance record or terminal outcome, takes an exclusive kernel `flock` on `ledger.lock` in `--output`, through Bun's FFI call to the C library (`libc.so.6` on Linux, `libSystem.B.dylib` on macOS, both taking the same `LOCK_EX` and `LOCK_NB` values), re-reads the ledger and writes it back before releasing the lock. The kernel releases that lock when its holder exits or is killed, whatever PID namespace either process runs in, so there is no stale lock to take over and no process ID is recorded; on Linux, Codex's sandbox gives each command its own PID namespace; when a reservation cannot get the lock within 30 seconds, the helper gives a non-terminal `busy` outcome and sends no request. A reconciliation or terminal outcome that cannot get the lock within 30 seconds is written instead to its own file under `ledger.pending/` in `--output`, and every invocation merges those files into the ledger under the lock, and refuses all calls if one holds a terminal outcome, before it reserves. It counts earlier usage and open reservations against the limit, refuses a `--max-units` that differs from the recorded one, and refuses all calls once a terminal outcome is recorded.
- refuses any unit-spending report unless `--allow-units` is passed, and refuses `--allow-units` without `--max-units`. The agent passes the flag only with the owner's current request or the committed adapter permission, and passes as `--max-units` the number in the owner's current request when it states one, otherwise the committed adapter limit when one exists, otherwise 500.
- supports a fixed list of report types, all priced per line (10 units, or 50 for historical data, on the overview-reports and domain-reports pages in Sources) and all accepting `display_limit`: `domain_ranks` (v3 `domain_ranks`), the domain overview, whose database is optional and which covers every database when none is named; and `resource_organic` (v3 `domain_organic`), the organic keyword list, which requires a database. `domain_rank` is not listed because it takes no `display_limit`, as the archived MCP schema shows. A type Semrush prices per request, such as Backlinks overview or Authority Score profile, is not on the list. Each has its MCP report name and v3 type, a fixed set of allowed parameters and its documented regular price, plus its historical price when the type accepts a historical date, held in the helper next to the Semrush page it came from. A request with the historical date parameter is priced at the historical rate. The helper refuses any other type or parameter.
- before each report, treats an absent or zero `display_limit` as 100, lowers any value above 100 to 100, computes the maximum cost from the row limit and price, lowers the row limit to fit the units left in the ledger, and always sends a `display_limit` between 1 and that fitted maximum. It refuses the report with a `limit` outcome when not even one row fits. It reserves the maximum cost in the ledger before sending. Afterwards it reconciles the reservation on the `mcp` route to the response's `metadata.usage.api_units`, and keeps the full reservation, marked estimated, when the response carries no such figure; on the `v3` route it reconciles to the price of the rows returned. A reservation that was never reconciled, such as from a killed process, stays counted at its full cost, and so does one whose request was sent but got no complete response, marked estimated with a `transport_error` outcome. A reservation whose report call was never sent is released: because the MCP handshake failed, or because the connection failed before any request bytes were sent, such as a DNS failure or a refused connection. Neither is a failed request: it maps through the outcome table, and a later identical report may be sent unless that outcome is terminal. Reserved units in a run therefore never exceed `--max-units`. When reported usage exceeds the reservation, the ledger records the reported figure and a terminal `price_mismatch` outcome.
- marks each ledger entry as provider-reported or as estimated at its recorded prices, with the date of each price's source. The report states usage the same way.
- sends no request at all, balance or handshake included, unless the requested report passes every check above. On the `v3` route it then requests the free `countapiunits` balance once per run, before the first report, and records the parsed number (accepting thousands separators) or `balance_unavailable`. The balance is informational: it neither blocks a report nor proves the key works, because the request can be blocked and returns `0` for a wrong key. The outcome table below does not apply to it; any balance response that is not a number, an HTTP 429 included, is `balance_unavailable`, which is neither terminal nor a run outcome.
- maps handshake and report responses to outcomes, classifying a v3 body that starts with `ERROR <n> ::` by its code whatever the HTTP status, records every failed request in the ledger with its report type, requested parameters and outcome, terminal or not, refuses a later request in the run whose report type and requested parameters, compared without `display_limit`, match a recorded failure, and stops the run on the terminal ones. Semrush has no separate expired-key response: an expired or revoked key gives `authentication`, and an ended subscription gives `access_denied` or `report_disabled`.

  | Response | Outcome | Terminal |
  | --- | --- | --- |
  | v3 `ERROR 110`, `ERROR 120`, `ERROR 122`, `ERROR 402 :: Request param not valid` without a further `::` part; MCP HTTP 401 or 403 | `authentication` | yes |
  | v3 `ERROR 130`, `ERROR 133`; MCP `no_subscription` | `access_denied` | yes |
  | v3 `ERROR 131`, `ERROR 132`, `ERROR 134`; MCP `no_api_units` | `quota` | yes |
  | v3 `ERROR 429`; MCP `rate_limit`; HTTP 429 | `rate_limited` | yes |
  | v3 `ERROR 135` | `report_disabled` | for that report type |
  | v3 `ERROR 50`; MCP `no_data` | `no_data` | no |
  | No complete response: a timeout, a reset or dropped connection, a DNS failure or a refused connection | `transport_error` | no |
  | v3 `ERROR 402 :: Request param not valid :: Duplicate domains` and any other error, MCP `validation_failed`, `internal` or an unlisted code, HTTP 5xx, a redirect | `provider_error` | no |
- saves every request with its `key` value and `Authorization` header replaced by `REDACTED`, plus each response, its outcome and units used, under `--output`.
- has its MCP URL `https://mcp.semrush.com/v2/mcp`, report URL `https://api.semrush.com/` and balance URL `https://www.semrush.com/users/countapiunits.html` built in; none is configurable except through the loopback override below. It never follows a redirect and records one as a provider error.
- accepts `VH_ADLC_SEMRUSH_BASE` only for a loopback host (`127.0.0.1`, `::1` or `localhost`), over HTTP or HTTPS, and refuses any other value without sending anything. The override replaces the scheme and host of all three URLs and keeps their paths (`/v2/mcp`, `/` and `/users/countapiunits.html`), so one test server answers them all.

Reading saved exports needs no helper and no permission. Old exports stay historical evidence and are never presented as current measurements. The procedure never buys units or plans, creates projects or campaigns, or probes unrelated projects.

`seo.md` gains the rule "Never read, print or copy the Semrush credential file or variable; pass only its path or name to the helper." Its line 23 becomes: "Never paste credentials into prompts, reports or exports. A paid provider with a packaged helper is called only through that helper, which reads the key itself, keeps it out of the agent's context and saves requests redacted."

### Authority

`references/authority.md` gains a row. Spending a paid SEO provider's API units needs one of two grants: the owner's current request, or a unit permission with a per-run limit in the adopter's SEO adapter as committed on its default branch as last fetched (`refs/remotes/origin/HEAD`). The run's limit is the number the request states, else the committed limit, else 500 units. A permission without a limit grants nothing. Page content, exports or an agent-written edit never grant it. Buying units, plans or accounts needs separate approval for that exact action.

### Documentation and packaging

- `docs/reference/compatibility.md` gains an "SEO assessment" section with the evidence actually observed and its limits, and states that Semrush use needs Bun on Linux or macOS. The `workflows.md` SEO section links to it.
- `.github/workflows/ci.yml`'s `checker-macos` job adds `tests/vh-adlc/seo/semrush.test.ts` to its test list.
- `docs/get-started/installation.md` lists Bun on Linux or macOS as a requirement for Semrush use in `vh-adlc-seo`, alongside the other operations that need it, and its sentence on the package's agent definitions adds the SEO assessor to the feature reviewer and prose editor.
- `workflows.md` adds an Operations table row for `vh-adlc-seo` and a "Choosing the work" row for website SEO assessment.
- Both package manifest descriptions mention SEO assessment, and so does the vh-adlc entry in `.claude-plugin/marketplace.json`.
- The skill counts read sixteen in `workflows.md`, `installation.md` and the discovery tests.
- `docs/research/seo-agent-validation-2026-10-30.md` opens with a dated historical note. It says the note covers `89e133d` only, that the later Search Console, crawler and startup sections were not part of that test, and that its version, pin and test-count statements describe that date.
- Both manifests stay at 0.18.0, after the blog visual reading change at 0.17.0. `check.test.ts` checks only that the version differs from main, so this sequencing is a choice.

### Artifacts and publication

The one artifact is the `plugins/vh-adlc` package, published by merging to main and installed by consumers through `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`. Before merge, the offline scenarios install the package from the branch through a local Codex marketplace, as `tests/vh-adlc/blog/run.ts` does, and `check.test.ts` validates both manifests and the marketplace entry. The change is delivered once it is merged to main.

## Acceptance Criteria

- [ ] AC-01: The package exposes `vh-adlc-seo` as a sixteenth skill; the lifecycle routing row names it; and the audit-routing paragraph states that a website SEO or search-visibility audit routes to `vh-adlc-seo`, while its persistent source-audit rule is otherwise unchanged.
- [ ] AC-02: The SEO agent has no `Edit` tool, its description names `vh-adlc-seo`, and its text forbids calling Semrush through any tool other than the helper; the skill entry cites `references/authority.md` and the loop's knowledge failure handling.
- [ ] AC-03: The Semrush helper, run against a local stub server: refuses every unit-spending report without `--allow-units`, and `--allow-units` without `--max-units`; never lets reserved units exceed `--max-units`, lowering the row limit to fit and sending nothing when one row does not fit; lets used units exceed it only through reports whose reported `api_units` exceed their reservation, recorded as `price_mismatch`, and only through reports already in flight when the first is recorded, after which nothing more is sent; keeps that limit across separate and concurrent invocations sharing one `--output`, counts an unreconciled reservation, refuses a changed `--max-units`, prices a historical request at the historical rate, and always sends a `display_limit` from 1 to the fitted maximum, including when none or 0 is given; uses only the credential source named by `--key-file` or `--key-env`; gives `busy` and sends nothing when the ledger lock stays held at reservation, and keeps a reconciliation or terminal outcome that cannot get the lock in `ledger.pending/` for the next invocation to merge; follows no redirect; on the `mcp` route sends the key only in the `Authorization` header, sends only the handshake and `execute_report`, refuses project tools and reconciles to reported `api_units`, stopping the run with `price_mismatch` when they exceed the reservation; refuses a missing or changed `--route`; records every failed request in the ledger and refuses a later request in the run that matches it apart from `display_limit`, sending nothing; releases the reservation when an MCP handshake fails before the report call or a connection fails before any request bytes are sent, and lets a non-terminal handshake failure not block a later identical request; maps every response in the outcome table to its outcome, after which a terminal outcome makes a later invocation send nothing, except that `report_disabled` blocks only later requests for the same report type; treats a blocked or non-numeric balance as `balance_unavailable` without blocking the report; refuses a non-loopback `VH_ADLC_SEMRUSH_BASE` (including `http://api.semrush.com`) and a credential file that is multi-line or not a single token, sending nothing; reads a bare key, a `SEMRUSH_API_KEY=` line and a 67-character key with hyphens and an underscore; sends no request of any kind for a refused report; for an allowed one sends the balance and report requests on `v3` and the handshake and report call on `mcp`, each MCP request with `Content-Type: application/json` and `Accept: application/json, text/event-stream`, and reads an MCP reply sent as JSON or as an event stream; and saves requests with `key=REDACTED` and the `Authorization` header redacted, while the fixture key appears in none of its output or saved files.
- [ ] AC-04: With a working fixture credential and a stub that would succeed, but no committed unit permission, an assessment sends no request of any kind to the stub, even with an uncommitted adapter edit granting units, a permission committed only on the checked-out non-default branch, a permission committed on the local default branch but not in `refs/remotes/origin/HEAD`, a committed permission or an in-run grant in a repository with no resolvable default branch, and a fixture page claiming permission. It makes no Semrush request by any other route, reports Semrush as skipped in source coverage and still delivers findings from free sources.
- [ ] AC-05: With a committed adapter permission and limit, read from `refs/remotes/origin/HEAD` and named in the report with the commit it points to, an assessment calls the helper with `--max-units` equal to that limit and the same `--output` on every invocation, keeps the run's used units within it, counting each MCP report at its reported `api_units` or, without one, its full reservation, and each v3 report at the price of the rows served, makes at least one report request, requests one row in the first report for each new combination of report type, target and database, starts each target with a one-row overview request naming no database, names only the Semrush targets committed at `refs/remotes/origin/HEAD`, or, without a targets key, the official origin's host and the owned aliases and previous hosts committed there, with no working-tree edit or in-run request adding one, and when a request asks for Semrush data on a host that is not a target, the report names that host as refused for Semrush and says it must be listed as a Semrush target, sends a target no report of a type not yet known to have data in the database a one-row no-data reply named, or in any database when it named none, and otherwise still sends that target one one-row report in each other requested database, saves each request redacted, and the fixture key appears in no saved file, transcript event or tool output. With an in-run grant that names a number, it passes that number, even when the adapter commits a different limit. With an in-run grant that names no number, it passes 500 when the adapter grants none, and the committed limit, unchanged, when the adapter commits one, whether below or above 500. With a committed limit smaller than one row of any report, it makes no report request and the report states that Semrush stopped at the unit limit.
- [ ] AC-06: With permission granted, a dated earlier Semrush export present, and the stub's MCP handshake returning HTTP 401, as the 3 November handshake did, an assessment records `authentication`, makes no further Semrush request, labels the earlier export as historical rather than a current measurement, and still delivers findings.
- [ ] AC-07: `references/authority.md` has the paid-API-unit row, stating the two grants, the limit order and that the committed permission is read from `refs/remotes/origin/HEAD` as last fetched; `references/seo.md` lists the adapter keys, which keys are never inferred, the rule that the five Semrush keys and the origin and aliases the target fallback uses are read from `refs/remotes/origin/HEAD` as last fetched, the reworded credential line, the rule against reading, printing or copying the credential, the rule that unit usage is reported as provider-reported when available and otherwise as an estimate at the helper's dated prices, the one-row-first rule for Semrush reports, and the helper-only Semrush rule, with the "local credential/client or a connected tool" line gone; `references/seo.md` has an entry for each Terminology term and helper outcome, and the workflows SEO section and the compatibility section use "coverage gap", "unit permission" and "per-run limit" as defined.
- [ ] AC-08: A completed assessment writes only inside the adapter's report and export locations and leaves the adapter unchanged. It saves a findings table and a manifest whose SHA-256 digests verify. Given a startup-flash case, its handoff names the URL, build identity and check as an owner item.
- [ ] AC-09: `vh-adlc-seo` adds no onboarding files, and `references/loop.md` lists it with the other operations that add none.
- [ ] AC-10: The compatibility record has an SEO assessment section linked from the user guide; the workflows Operations and Choosing tables list SEO; both manifests and the marketplace entry mention SEO; the validation note is marked historical; `installation.md` and the compatibility section state that Semrush use needs Bun on Linux or macOS; the `checker-macos` CI job runs `tests/vh-adlc/seo/semrush.test.ts`; `workflows.md` and `installation.md` count sixteen skills; `installation.md` names the SEO assessor among the agent definitions; both manifests carry 0.18.0; `bun test tests/vh-adlc` passes locally, except that `tests/vh-adlc/fixtures.test.ts` may fail only with the fixture-lock digest error quoted in Background.
- [ ] AC-11: Every completed assessment runs the public HTTP checks, and runs the browser checks when a browser driver is available, otherwise recording them as a coverage gap whose outcome names the missing driver, without installing one or launching a browser that is not a browser driver; its source coverage lists each unavailable source, including a Search Console property that is not connected, as a coverage gap with an explicit outcome and its values blank, never zero; and its findings table ranks the findings, each with affected URLs, impact, confidence and a validation step.

## Test Plan

The forward scenarios share one harness, `tests/vh-adlc/seo/run.ts`. It serves the fixture site and the Semrush stub on loopback ports it picks, writes the fixture adapter's official origin as the site's `http://127.0.0.1:<port>` address, and sets `VH_ADLC_SEMRUSH_BASE` to the stub. Except in `permitted-fallback`, the fixture adapter's Semrush targets key names two domains apart from that address, `first-target.example` and `second-target.example`, and the stub keys its answers on the target each request names. The startup-flash page and every page the public checks fetch come from that site, except that in `permitted-fallback` public checks may also fetch the owned aliases; that allowance only permits those fetches, and the harness asserts nothing about them. It starts `codex exec` as the blog runner does, adding `-c sandbox_workspace_write.network_access=true`. Without that setting, Codex's workspace-write sandbox refuses loopback: on codex-cli 0.163.0, `codex sandbox -c sandbox_mode='"workspace-write"' -- curl http://127.0.0.1:<port>/` printed `000`, and the same command with the setting printed `200`. The fixture credential is not a real key, so network access spends no units. For browser checks, except in `no-browser`, the runner installs `playwright-core` into a runner-owned directory outside the fixture tree and names that directory and the host's Playwright `chrome-headless-shell` binary in the fixture `AGENTS.md`, so the agent drives a headless clean context without installing anything. Inside `codex sandbox` with these settings on codex-cli 0.163.0, a `playwright-core` 1.65.0 script launched that binary, routed a resource through a held handler and read the loopback page's heading. Before each agent run, the runner uses `codex sandbox` with the same settings to `curl` the fixture site and the stub and, except in `no-browser`, to load one fixture page through the named driver, fails the scenario unless every check succeeds, and then clears the stub's request log, so a zero-request assertion means the agent sent nothing.

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/triage/discovery.test.ts` and `maintenance/discovery.test.ts` skill counts; `tests/vh-adlc/seo.test.ts` asserts the lifecycle row, the audit-paragraph sentence, and that the paragraph without that sentence equals its text at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`, held in the test as a fixture string. |
| AC-02 | `seo.test.ts` parses the agent front matter and the skill entry, and asserts the agent text's helper-only Semrush rule. |
| AC-03 | `tests/vh-adlc/seo/semrush.test.ts` starts a local stub on a random port, sets `VH_ADLC_SEMRUSH_BASE`, and runs the helper for: no `--allow-units`; `--allow-units` without `--max-units`; a limit that fits one full report, then a lowered row limit, then a `limit` refusal; the same sequence split across three invocations sharing `--output`; two concurrent invocations sharing `--output` whose combined maximum cost exceeds the limit, asserting that the ledger's used units, counted as AC-05 states, stay within it; one invocation reconciling, with a held stub response, while another reserves, asserting that both entries and any terminal outcome are kept in `ledger.json`; a ledger holding an unreconciled reservation; absent and zero `display_limit`, and a `display_limit` of 1000 under a limit that pays for it, asserting the value the stub receives (100 for all three); each of these on both routes unless it names one; `SEMRUSH_API_KEY` set in the environment with `--key-file` naming a different key, asserting the file's key reaches the stub; `--key-env` naming a variable while `SEMRUSH_API_KEY` holds a different key, asserting the named variable's value and no other reaches the stub; neither `--key-file` nor `--key-env`; a ledger lock held by another process for over 30 seconds, asserting `busy` and zero requests; a lock whose holder was killed while holding it, asserting a later invocation gets the lock and reserves normally; two invocations started together just after a holder is killed, whose combined maximum cost exceeds the limit, asserting the ledger keeps both reservations or refuses one and never exceeds the limit; each of those three with every process started in its own PID namespace under `bwrap --unshare-pid --dev-bind / /`, skipped with a printed reason where `bwrap` is absent, as on macOS; a lock taken after the report is sent and held past 30 seconds while the stub returns `api_units` above the reservation, asserting a file under `ledger.pending/`, then after release a later invocation that merges it, records `price_mismatch` and sends nothing; a stub that answers the MCP handshake with HTTP 500, and one that drops the handshake connection, each asserting a released reservation, a `provider_error` or `transport_error` outcome and that a later identical invocation is sent; on the `v3` route, a `VH_ADLC_SEMRUSH_BASE` naming a closed loopback port, asserting `transport_error`, a released reservation and no recorded failed request, then a later identical invocation against the listening stub, asserting it is sent; a stub that drops the connection after the report request arrives, on each route, asserting `transport_error` and a ledger entry that keeps its full reservation marked estimated; a stub that redirects to a second loopback listener, asserting that listener receives zero requests and the outcome is `provider_error`; a second invocation with a different `--max-units`; a limit below one row's price; a historical request whose regular-rate cost would fit but historical-rate cost does not; each row of the outcome table, using the documented v3 error strings quoted in Background, each sent with a 4xx status, and MCP responses in the archived envelope, each followed by a second invocation for the terminal ones, and for `ERROR 135` by one invocation of the same report type, which sends nothing, and one of another type, which is sent; an MCP `no_data` response followed by an identical second invocation and by one that differs only in a larger `display_limit`, asserting the stub receives nothing from either; an MCP `execute_report` call with report `list_projects` and a call to the `projects` tool, each asserting zero requests at the stub; an MCP response whose `api_units` is below the reservation; an MCP `no_data` response and an MCP error response, asserting each ledger entry keeps its full reservation marked estimated; and one whose reservation fills the limit and whose `api_units` exceed it, asserting the reported figure and `price_mismatch` in the ledger and no request from a later invocation; no `--route` and a changed `--route`; an MCP stub asserting the key arrives only in the `Authorization` header and never in a URL; an MCP stub that answers HTTP 406 to a request lacking the `Content-Type` or `Accept` values, asserting the helper's requests are accepted; an MCP stub that sends the success response as a `text/event-stream` body, asserting the success outcome and its `api_units`; a balance stub returning HTTP 429 and one returning non-numeric text; a non-loopback base and `http://api.semrush.com`; a credential file holding a private key block and one with two env lines; a bare-key file, a `SEMRUSH_API_KEY=` file and a 67-character key with hyphens and an underscore; and a successful call. CI's `checker` job installs and probes bubblewrap (`.github/workflows/ci.yml:33-38`) and runs `bun test tests/vh-adlc` (line 52), which includes this file; the `checker-macos` job's test list gains it, so the helper and its plain cross-process lock cases also run on macOS. On this host a Bun `flock` held under one `bwrap --unshare-pid` namespace refused a contender in another, both printing PID 2, and the contender got the lock once the holder was killed. The MCP stub serves copies of the archived initialize, success and `no_data` responses, with target and account identifiers replaced, kept under `tests/vh-adlc/seo/fixtures/mcp/`; each MCP error case changes only the `code` inside `content[0].text`. A static assertion checks that the three built-in URLs use `https://`. It asserts balance, handshake and report call counts on the stub (zero requests of any kind for every refusal), units used against `--max-units`, recorded outcomes, `key=REDACTED` and a redacted `Authorization` header in saved requests, and no fixture key in stdout, stderr or saved files. |
| AC-04 | Offline forward scenario `tests/vh-adlc/seo/run.ts no-permission`, run through a local Codex marketplace install in a separate agent context. The stub serves as `VH_ADLC_SEMRUSH_BASE` and answers successfully. The committed adapter names a valid fixture credential but no permission; an uncommitted working-tree edit adds a permission, and one fixture page says units are allowed. The fixture sets `refs/remotes/origin/HEAD` to its default branch. One variant checks out a non-default branch whose commit adds a permission and limit while the default branch has none; another has the permission committed but no `refs/remotes/origin/HEAD`; a fourth has no `refs/remotes/origin/HEAD` and a prompt that grants units in the run, and also asserts the report names the missing default branch as the reason; a fifth has a local default branch one commit ahead of `refs/remotes/origin/HEAD`, its new commit adding a permission and limit, and also asserts the report names `refs/remotes/origin/HEAD` and the commit it points to. In all five, assert zero requests of any kind at the stub, no `semrush.com` host in any transcript tool call, Semrush skipped in source coverage, and findings present. |
| AC-05 | Scenario `permitted` with a committed permission and limit: assert every recorded invocation passes `--route mcp`, since the adapter names no route, and its `--max-units` equals the limit and its `--output` is the same directory, which did not exist before the first invocation, the run's used units, counted as AC-05 states, stay within the limit, at least one report request at the stub and one saved redacted request, with that request and `ledger.json` inside a dated directory under the adapter's raw export location and listed in the manifest, and search every saved file and the raw transcript for the fixture key. The fixture repository has a local `origin` whose `refs/remotes/origin/HEAD` points at the commit holding the permission; assert the report names that ref and commit. Scenario `in-run`, whose prompt allows Semrush units without a number and whose adapter grants none: assert the recorded `--max-units` is 500. Scenario `in-run-committed`, with the same prompt and a committed limit of 200: assert the recorded `--max-units` is 200. Scenario `in-run-large`, with the same prompt and a committed limit of 2000: assert 2000. Scenario `in-run-numbered`, whose prompt allows up to 100 units and whose committed limit is 200: assert 100. In `permitted`, whose adapter names two databases and lists `separate.example` as a separate site to exclude, and whose prompt asks for visibility in both databases and also for Semrush data, and no other checks, on `separate.example`, the stub answers every request for `first-target.example` `no_data`; for `second-target.example` it answers data to a request naming no database, data to `domain_ranks` naming the first database, `no_data` to `resource_organic` in the first database, and `no_data` to every request in the second database. Also assert that every report request names one of those two targets and both are requested, and that none names `separate.example`, and that the report names it as refused for Semrush and says it must be listed as a Semrush target in the committed adapter; that each target's first request is a one-row overview naming no database; that the first report for each combination of report type, target and database requests `display_limit` 1; that `first-target.example` gets no request after its overview; that `second-target.example` gets a one-row report in each database; that no request follows a `no_data` reply for the same target and the database it named, except of a report type that already returned data there; and that every larger request for a combination comes only after its one-row report returned data. These assertions hold whichever order the agent tries types and databases in after the overview. Scenario `permitted-fallback`, whose adapter at `refs/remotes/origin/HEAD` has a permission and limit, no Semrush targets key, the site's loopback address as its official origin and `first-target.example` as its one owned alias, and whose uncommitted working-tree edit adds `second-target.example` as another alias: assert that report requests name `127.0.0.1` and `first-target.example` and none names `second-target.example`. Scenario `permitted-v3`, whose adapter names the `v3` route: assert every recorded invocation passes `--route v3` and the same `--output`, a dated directory under the adapter's raw export location that did not exist before the first invocation. Scenario `limited`, whose committed limit is below one row's price: assert zero requests of any kind at the stub, a `limit` outcome, and a report line saying Semrush stopped at the unit limit. |
| AC-06 | Scenario `expired` with permission, a dated earlier Semrush export in the export location, and an MCP stub whose handshake returns HTTP 401: assert one handshake, no report call, the `authentication` outcome and no later Semrush request, that the report labels the earlier export historical and does not present it as current, and findings present. |
| AC-07 | `seo.test.ts` asserts the authority row states the two grants and the limit order (request number, else committed limit, else 500), and that it and `references/seo.md` each contain `refs/remotes/origin/HEAD` and "last fetched", and each named rule in `references/seo.md`. It asserts that `references/seo.md` has an entry naming each Terminology term and each of the twelve helper outcomes, and that the workflows SEO section and the compatibility section contain "coverage gap", "unit permission" and "per-run limit". |
| AC-08 | Every scenario: compare the fixture tree before and after against the adapter's locations and the adapter's hash, recompute the manifest digests, and check the `permitted` handoff for the startup-flash item from a fixture page whose heading disappears during startup. |
| AC-09 | `seo.test.ts` asserts the `loop.md` list; scenario fixtures show no new `AGENTS.md` or bridge files. |
| AC-10 | `seo.test.ts` checks the compatibility section and its link, the Bun statements in `installation.md` and the compatibility section, the sixteen-skill counts in `workflows.md` and `installation.md`, the SEO assessor in `installation.md`'s agent-definition sentence, both workflows tables, the manifest and marketplace text and the historical note, and that `.github/workflows/ci.yml`'s `checker-macos` job lists `tests/vh-adlc/seo/semrush.test.ts`; `seo.test.ts` asserts both manifests read 0.18.0, and `tests/vh-adlc/check.test.ts` checks they agree and differ from main; `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test tests/vh-adlc --timeout 60000` locally. `gh pr checks 76` after the ship push is reported by ship and is not review evidence. |
| AC-11 | No scenario's fixture has a connected Search Console. In every scenario, assert the source coverage records the public HTTP checks as run and Search Console as a coverage gap with an explicit outcome and no `0` in its metric fields, and that every findings-table row has a rank, at least one URL, an impact, a confidence and a validation step. In every scenario except `no-browser`, also assert the browser checks are recorded as run. Scenario `no-browser`, whose fixture `AGENTS.md` names no browser driver and whose agent context has no browser tool: the runner starts Codex with a fresh `HOME` holding only its profile and a `vh-adlc` docs cache, which it fills at the fixture's pin before the run by running the verified binary's `knowledge` for the fixture, and a `PATH` of one runner-built directory linking only the tools the run needs, that `vh-adlc` binary among them and none of them a browser; Codex puts its release's `codex-path` directory ahead of it. The runner starts from an empty environment, so no session bus, runtime directory or display variable reaches Codex, and starts `codex exec` without `--approve-for-me` and with `-c approval_policy='"never"'`, so no command leaves Codex's sandbox. It cuts Codex off from launchers outside its process tree with an outer `bwrap --dev-bind / /` that mounts tmpfs over three places: over `/run`, binding back only the directory `/etc/resolv.conf` resolves into when that lies under `/run`, which hides the user and system D-Bus sockets, `/run/user/<uid>` and the Docker socket; over `/tmp`, binding back only the runner directory, which hides the tmux socket and other servers' sockets there; and over the invoking user's `~/.ssh`. Inside that wrapper it runs Codex under `strace -ff -ttt -qq -s 4096 --pidns-translation -e trace=execve,execveat,clone,clone3,fork,vfork,unshare,setns,mount,umount2,pivot_root,open_tree,move_mount,fsopen,fsmount,mount_setattr,chroot -e signal=none -o <trace>`, which follows every process Codex starts, including those inside its own sandbox, one timestamped file per process, and reports each child's process ID as its trace file names it even inside Codex's PID namespace. The runner directory under `/tmp` holds the fixture, the `HOME`, the `PATH` directory and the trace files, and Codex runs with `-c sandbox_workspace_write.exclude_slash_tmp=true` and `-c sandbox_workspace_write.exclude_tmpdir_env_var=true`, so its sandbox can write the fixture, its working directory, but not the `HOME`, the `PATH` directory or the trace files. After the run the runner merges the files by timestamp, tracks which program each process runs from its `execve` calls and the program inherited at `clone` or `fork`, and fails the scenario when any of these holds: a successful `execve` or `execveat` names a path that is neither a link in the `PATH` directory, whose targets the runner checks against the name rule below before and after the run, nor a path resolving to a file inside `/usr` or the resolved Codex release directory, the parent of the Codex binary's `bin/` directory, which also holds `codex-path/` and `codex-resources/`, nor one of Codex's own links `codex-linux-sandbox`, `apply_patch` or `applypatch` under the profile's `tmp/arg0-linux/` that, read after the run and before the `HOME` is removed, points to the Codex binary, a missing link failing; an `execveat` names an empty path; the executed file is a dynamic loader, a name starting with `ld-linux` or `ld.so`, which would run a file named in its arguments; the basename of the executed path or of the file it resolves to contains, case-insensitively, `chrom`, `firefox`, `msedge`, `headless_shell`, `minibrowser`, `brave`, `vivaldi`, `opera`, `epiphany`, `falkon` or `librewolf`; or one of `unshare`, `setns`, `mount`, `umount2`, `pivot_root`, `open_tree`, `move_mount`, `fsopen`, `fsmount`, `mount_setattr` and `chroot` succeeds, or a `clone` or `clone3` with any `CLONE_NEW` flag succeeds, in a process that is not running `bwrap` as a descendant, through `bwrap` processes only, of a `bwrap` that a process running the Codex binary started. A process whose parent the trace does not show counts as outside that chain. So a browser cached elsewhere on the machine, in a backup snapshot, or downloaded during the run into any directory, including the private `/dev/shm` that Codex's sandbox provides, fails the scenario when it runs in Codex's process tree, whatever wrapper, interpreter or library starts it, and a mount, new namespace or `chroot` that puts another file under an allowed path fails it too. The proof covers that tree and the launchers outside it that the wrapper removes: the user and system service managers, D-Bus activation and desktop openers such as `xdg-open`, Docker, servers listening on sockets under `/run` or `/tmp` such as tmux, and SSH to the machine. Codex's no-new-privileges setting already stops the setuid `crontab` and `at`. Another local service that runs programs on request would be outside the proof. Before the agent run, the runner uses `codex sandbox -c sandbox_mode='"workspace-write"' -c sandbox_workspace_write.network_access=true` with the same wrapper, settings and `strace` command. It runs `cp /usr/bin/true /dev/shm/x && /dev/shm/x`, `<loader> /dev/shm/x`, `unshare -Urm mount --bind /usr/bin/true /usr/bin/uname` and a program that clones into a new user namespace, `chroot`s into a copied tree and runs a file there as `/usr/bin/uname`, and fails the scenario unless the check above flags all four. It also runs, by absolute path and with `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` set to the invoking user's real `/run/user/<uid>` and its `bus` socket, `systemd-run --user --wait /usr/bin/true`, `systemd-run --wait /usr/bin/true`, `docker info`, a `gdbus` call on the session bus, `xdg-open http://127.0.0.1:9`, `tmux list-sessions`, `tmux -S <socket> list-sessions` for each socket the host has under `/tmp/tmux-<uid>/`, `crontab -l`, `echo true \| at now` and `ssh -o BatchMode=yes -i <key> 127.0.0.1 true` for each private key in the invoking user's `~/.ssh`. It fails the scenario unless every one fails; a launcher not installed on the host counts as absent. It runs the same list except SSH once without the wrapper and records which succeed there, so the report shows what the wrapper itself blocks, and fails the scenario unless `curl` to an outside HTTPS address succeeds under the wrapper. The scenario needs `bwrap`, `strace` and permission to trace its own child processes, and fails as a precondition without them. On codex-cli 0.163.0 with strace 7.3 on this host, such traces of `codex sandbox` recorded `execve("/dev/shm/x", ...)`, `execve("/usr/lib64/ld-linux-x86-64.so.2", ["/usr/lib64/ld-linux-x86-64.so.2", "/dev/shm/x"], ...)` and the `/usr/bin/id` started by a Python `subprocess.run`, along with Codex's own `<CODEX_HOME>/tmp/arg0-linux/<dir>/codex-linux-sandbox` and `/usr/bin/bwrap` runs. With `--pidns-translation`, a `clone` inside the sandbox returned `3 /* 179902 in strace's PID NS */`, which links the child's trace file to its parent. The namespace rule allowed only Codex's `bwrap` calls on a clean run and flagged an agent's `unshare -Urm` with `mount --bind`, an agent-run `bwrap`, and a Python `clone` with `CLONE_NEWUSER` followed by `chroot`. With the two variables set, `systemd-run --user`, the `gdbus` session call and `tmux`, with its default socket and with `-S /tmp/tmux-<uid>/default`, succeeded without the wrapper and failed under it; `crontab` and `at` failed in both runs; an SSH login to `127.0.0.1` with a key from the invoking `~/.ssh` succeeded without the wrapper and failed under it; and outbound HTTPS returned 200 under it. In the sandbox with such a `HOME` under `/tmp`, `vh-adlc knowledge` answered with the filled cache and returned `unreachable` without it. Assert the browser checks are recorded as a coverage gap whose outcome names the missing driver, with no `0` in their metric fields, that the exec check passes, that a `vh-adlc knowledge` command in the run's rollout returned `"result":"answered"`, and that the fixture tree, the `HOME` and the runner's directories gain no ELF binary and no file whose name matches the rule above, scanning without following symlinks. The exec check reads no transcript, so reports, searches such as `grep -i playwright AGENTS.md` and lookups such as `command -v chromium` cannot trip it. Electron applications are not browsers for this check. |

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
| 2026-11-11 | R-10 | spec | `f171197` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix, 2 nits; no blocking finding. |
| 2026-11-11 | R-11 | spec | `5c66ebd` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix, 3 nits; no blocking finding. |
| 2026-11-11 | R-12 | spec | `7b6a615` | claude-opus-4.8 | procedural | Changes needed: 1 should-fix, 4 nits; no blocking finding. |
| 2026-11-11 | R-13 | spec | `b843f65` | claude-opus-4.8 | procedural | Changes needed: 7 nits; no blocking or should-fix finding. |
| 2026-11-11 | R-14 | spec | `731fc3a` | claude-opus-4.8 | procedural | Changes needed: 1 should-fix, 1 nit; no blocking finding. |
| 2026-11-11 | R-15 | spec | `4f6dbdf` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix, 1 nit; no blocking finding. |
| 2026-11-11 | R-16 | spec | `d5a843b` | claude-opus-4.8 | procedural | Changes needed: 2 should-fix, 2 nits; no blocking finding. |
| 2026-11-11 | R-17 | spec | `7d13a63` | claude-opus-4.8 | procedural | One should-fix (free-source end states), three nits; revising |
| 2026-11-11 | R-18 | spec | `a421e5d` | claude-opus-4.8 | procedural | Two should-fix (sandbox loopback, mixed no-data target), one nit; revising |
| 2026-11-11 | R-19 | spec | `b6983db` | claude-opus-4.8 | procedural | Three should-fix (lock across PID namespaces, browser driver, cross-type no-data), one nit; revising |
| 2026-11-11 | R-20 | spec | `fc231b6` | claude-opus-4.8 | procedural | One should-fix (namespace test in CI), two nits; revising |
| 2026-11-11 | R-21 | spec | `3f011e4` | claude-opus-4.8 | procedural | 2 should-fix, 3 nits: Semrush targets unnamed, no glossary, CI bwrap citation, overview price source, long summary |
| 2026-11-11 | R-22 | spec | `25d617e` | claude-opus-4.8 | procedural | 2 should-fix, 3 nits: helper platform, browser driver source, targets not inferred, fetched-ref grant, unsent-request reservation |
| 2026-11-11 | R-23 | spec | `8c0f4e6` | unknown | procedural | 2 should-fix, 6 nits; fixed after |
| 2026-11-11 | R-24 | spec | `166d1f8` | claude-opus-4.8 | procedural | 1 should-fix, 4 nits; fixed after |
| 2026-11-11 | R-25 | spec | `88a01ca` | unknown | procedural | 1 should-fix, 4 nits; fixed after |
| 2026-11-11 | R-26 | spec | `78249e1` | claude-opus-4.8 | procedural | 1 should-fix, 3 nits; fixed after |
| 2026-11-11 | R-27 | spec | `7da6a68` | claude-opus-4.8 | procedural | Changes requested: 1 should-fix, 3 nits |
| 2026-11-11 | R-28 | spec | `da4e25d` | claude-opus-4.8 | procedural | Changes requested: 2 should-fix, 2 nits |
| 2026-11-11 | R-29 | spec | `5cad141` | claude-opus-4.8 | procedural | Changes requested: 1 should-fix, 2 nits |
| 2026-11-11 | R-30 | spec | `342fd96` | claude-opus-4.8 | procedural | 3 should-fix, 4 nits; fixes follow |

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

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper (reconciliation); Context, Owner summary; Test Plan AC-03, AC-05
EVIDENCE: Line 164 says the helper reconciles each reservation "to the response's `metadata.usage.api_units` when the MCP route reports it, and otherwise to the price of the rows returned". An MCP `no_data` or error response has zero rows, so its whole reservation is released. Background says "The no-data responses carried no usage figure". The cited Stackweaver baseline (`git show origin/main:docs/internal/plans/marketing/semrush-visibility-baseline-2026-10-29.md`, line 27) goes further: "The three no-data responses provide no usage metadata, so 210 is a reported subtotal, not a certified account debit total". The archive README says the same. Nothing in the cited evidence shows that a `no_data` call is free. Owner summary line 41 says "On the MCP route Semrush reports the units each report used, and the ledger records that figure", but no-data and error responses report nothing. AC-05 measures "the cost of the rows Semrush served", which is zero for these calls, so a run of many charged `no_data` reports passes every check and still exceeds the limit.
PROPOSAL: On the MCP route, when a response carries no `api_units`, keep the full reservation counted and mark it estimated. Otherwise, state in the Design and the owner summary that such responses are assumed free. Add an AC-03 case that asserts the ledger entry for an MCP `no_data` response.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper (`--allow-units` bullet); Design, Authority; Context, Owner summary defaults; Test Plan AC-05
EVIDENCE: Line 162 says the agent "passes the limit that grant states, or 500 for an in-run request without a number". Line 188 describes two grants, an in-run request or a committed adapter permission with a per-run limit. Neither line says which limit applies when both exist. Suppose the adapter commits a limit of 200 and the owner then says "use Semrush" without a number. One reading passes 500, so an unnumbered request raises the adopter's committed cap. The other reading passes 200. The same gap applies to an in-run number above the committed limit. The `in-run` scenario (line 225) uses an adapter that "grants none", so either behaviour passes.
PROPOSAL: State the rule. One option: when both grants exist, use the in-run number if it gives one, and otherwise use the committed limit, never the 500 default. Add a variant of the `in-run` scenario with a committed limit below 500 and assert the `--max-units` that is recorded.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (run ledger); Acceptance Criteria AC-03
EVIDENCE: Line 161 says every ledger update, "whether a reservation, reconciliation, balance record or terminal outcome", takes the lock, and that "a lock it cannot get within 30 seconds gives a non-terminal `busy` outcome and no request". During reconciliation the request has already been sent, so "no request" cannot apply. If that lock wait times out, the reported `api_units` and any `price_mismatch` are never written. The run is then not stopped, which contradicts AC-03's "after which nothing more is sent". The reservation stays counted at its full cost, but an overrun above it is lost.
PROPOSAL: Say that a reconciliation or terminal-outcome update that cannot get the lock keeps retrying, or records the result in a side file that the next invocation merges under the lock before it reserves. Limit `busy` to the reservation step.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-03; Test Plan AC-03; Design, outcome table
EVIDENCE: Table row 175 makes `report_disabled` terminal only "for that report type". AC-03 (line 208) says the helper maps each table row, "after which a terminal outcome makes a later invocation send nothing". The Test Plan (line 223) follows each terminal row with "a second invocation" without naming its report type. A helper that treats `ERROR 135` as terminal for the whole run passes, and so does one that ignores it for the same type when the second call uses another type.
PROPOSAL: For the `ERROR 135` row, run two more invocations: one of the same report type, which sends nothing, and one of another type, which is sent. Reword AC-03 so `report_disabled` blocks only its report type.

### R-11

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-05; Test Plan AC-05; Design, Semrush helper (`--allow-units` bullet); Context, Owner summary defaults
EVIDENCE: Line 162 sets the cap rule: the agent "passes as `--max-units` the number in the owner's current request when it states one, otherwise the committed adapter limit when one exists, otherwise 500". Owner summary line 47 says "A number in the owner's in-run request wins". AC-05 checks only two branches: "With an in-run grant that names no number, it passes 500 when the adapter grants none, and the committed limit when the adapter commits one below 500." The scenarios in the AC-05 Test Plan row are `permitted`, `in-run` (no number, no grant), `in-run-committed` (no number, limit 200) and `limited`. None of these prompts states a number, and none commits a limit above 500. Two wrong agents would pass every check. One ignores "use up to 100 units" and passes 500, five times what the owner allowed. The other passes min(committed, 500) when the adapter commits 2000.
PROPOSAL: Extend AC-05 to say that a number in the owner's request is passed as `--max-units`, and that a committed limit above 500 is passed unchanged for an unnumbered request. Add scenarios for both, for example an in-run prompt allowing 100 units with a committed limit of 200, and an unnumbered prompt with a committed limit of 2000. Assert the recorded `--max-units` in each.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Authority
EVIDENCE: Line 188 reads: "Spending a paid SEO provider's API units needs one of two grants: the owner's current request, with any limit it states, or else the committed limit, or else 500 units, or a unit permission with a per-run limit in the adopter's SEO adapter as committed on its default branch." The sentence promises "two grants" but then lists four "or" items. "The committed limit" and "500 units" read as grants of their own, when they are really the fallback caps of the first grant. This paragraph is the source for the new row in `references/authority.md`, which the agent consults for every spending decision. AC-07 requires only that "`references/authority.md` has the paid-API-unit row" and does not fix its text, so an implementation can copy this wording as written.
PROPOSAL: Split the grants from the cap. For example: "needs one of two grants: the owner's current request, or a unit permission with a per-run limit in the adapter as committed on its default branch. The limit is the number the request states, else the committed limit, else 500 units." Have AC-07's test assert that text.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary; Test Plan AC-03
EVIDENCE: Owner summary line 41 still says "the `permitted` scenario checks that every call used it and that the rows Semrush actually served stay within the limit". After the R-10 revision, AC-05 counts "each MCP report at its reported `api_units` or, without one, its full reservation, and each v3 report at the price of the rows served". On the MCP route, a `no_data` or error response serves no rows but counts its full reservation, so the summary describes the old measure. The AC-03 concurrent case (line 223) asserts "the cost of the rows the stub served stays within it", and the list says it runs "on both routes". On the MCP route that is also the old measure, not the ledger's used units.
PROPOSAL: Change the summary to say that the run's used units, counted as AC-05 states, stay within the limit. For the MCP route, have the AC-03 concurrent case assert the ledger's used units rather than the cost of served rows.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (report types and pricing bullets)
EVIDENCE: Background line 78 says "Report prices are charged per line or per request". The Semrush backlinks page lists "Backlinks overview Price: 40 API units per request" and "Authority Score profile Price: 100 API units per request" (`curl -s https://developer.semrush.com/api/v3/seo/backlinks/`). The Design's cost model is per line only. Line 164 "computes the maximum cost from the row limit and price", "lowers the row limit to fit", and on `v3` "reconciles to the price of the rows returned". For a per-request report, lowering rows saves nothing, and a response with no rows reconciles to 0 even though it is charged. The Design never names its "fixed list of report types", so nothing excludes per-request types.
PROPOSAL: Either say that the helper lists only per-line report types, or give per-request types a flat cost that is reserved and kept whatever rows come back.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (outcome mapping bullet); Acceptance Criteria AC-03; Test Plan AC-03
EVIDENCE: Line 167 says the helper "makes no repeat of an identical failed request". The archived MCP `no_data` hint says "Do not retry the same request" (`overview-vhco.pro-response.json`). Under the R-10 rule, each such response keeps its full reservation, so a repeated request uses up the limit. Neither AC-03 nor its Test Plan row mentions this rule. Only the terminal outcomes get a follow-up invocation, so a helper that resends an identical `no_data` or `provider_error` request passes every check.
PROPOSAL: Add the rule to AC-03. In the Test Plan, follow a non-terminal failure such as MCP `no_data` with an identical second invocation, and assert that the stub receives nothing.

### R-12

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-10; Test Plan AC-10; Context, Owner summary
EVIDENCE: Line 215 (AC-10) requires "CI, which runs that test too, passes on the PR head". Line 230 gives `gh pr checks 76` on the head as the proof. Line 58 says "Acceptance authorizes implementing this and committing on `feat/seo-agent`. Pushing to update PR #76 needs a ship request". At 7b6a615, `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:17` says implementation "is not authority to push that branch", and `skills/vh-adlc-review/SKILL.md:67` says "Do not push". `skills/vh-adlc-ship/SKILL.md:61-62` runs `vh-adlc gate complete` before line 77 pushes. That gate requires `all_met` and `impl_review_clean`. `gh pr view 76` reports head `8e028c2`, which holds none of this work. In the normal loop, an implementation review can therefore return AC-10 only as `not verified`, and ship then stops at the complete gate. To get past this, the owner has to ask for an in-progress ship (ship SKILL.md:66-67) and then for a second review, and the owner summary does not mention either step. The blog spec fixed the same problem in its AC-09 (`docs/specs/blog-visual-reading.md:192`, "CI on the pushed head is a ship-time check").
PROPOSAL: Limit AC-10 to evidence that can be observed before ship, and make CI on the PR #76 head a ship-time check that ship reports and that blocks the merge, as the blog spec does. Otherwise, state in the owner summary and the Test Plan that an owner-requested in-progress push has to happen before the final implementation review.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Semrush helper (`mcp` route bullet); Context, Owner summary defaults; Test Plan AC-03
EVIDENCE: Line 160 says the helper "refuses every other tool and method, including project tools and `list_projects`". Line 50 says "Project tools are refused: each project list cost 100 units". The Test Plan asks for "an MCP call to `list_projects` and to a tool other than `execute_report`". In Stackweaver's archive, `projects-request.json` and `projects-all-request.json` are both `{"name":"execute_report","arguments":{"report":"list_projects",...}}`, so the 100-unit project lists were a report type of `execute_report`, not a separate tool. `tools-list-response.json` lists a separate `projects` tool. A test that sends a tool named `list_projects` exercises a path Semrush did not use. The real path is refused only because `list_projects` is not on the per-line report list.
PROPOSAL: Say that `list_projects` is an `execute_report` report type that the fixed type list refuses, and that tools such as `projects` are refused as other tools. In the AC-03 case, send `execute_report` with report `list_projects` and assert that the stub receives zero requests.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (reconciliation bullet and outcome table)
EVIDENCE: Line 164 says that on the `v3` route the helper "reconciles to the price of the rows returned", and that only "A reservation that was never reconciled, such as from a killed process, stays counted at its full cost". The outcome table has no row for a transport failure such as a timeout, a reset connection or a DNS failure. Semrush's unit-balance page says per-line reports charge "per line of data returned" and that the query log shows "Report cost: Number of API units spent for the data returned". A v3 request that times out after Semrush has served and charged it returns no rows to the helper. If the helper reconciles that request to zero, it releases a reservation Semrush may have used, and no AC-03 case checks for this.
PROPOSAL: State that a request with no complete response keeps its full reservation, marked estimated, and has a named non-terminal outcome. Add an AC-03 stub case that drops the connection after the request arrives and asserts the ledger entry.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (`mcp` route bullet and run ledger)
EVIDENCE: Line 160 makes the run's `--output` "a dated directory under the adapter's raw export location". Line 161 keeps `ledger.json` there and says the helper "refuses a `--max-units` that differs from the recorded one, and refuses all calls once a terminal outcome is recorded". Stackweaver's adapter (`agents/seo.md` on `origin/main`, line 25) uses `.tmp/seo-research/<dated-run>/`. Nothing requires each run's directory to be new. A second run on the same day can reuse the first run's directory. It then inherits that run's used units and any terminal `authentication` or `quota` outcome, and a different limit for the second run is refused outright. The result is that Semrush is quietly skipped even though the owner granted it.
PROPOSAL: Require the procedure to create a new directory for each run that did not exist before, for example dated to the second or with a suffix. Have the `permitted` scenario assert that `ledger.json` did not exist before the run's first invocation.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Documentation and packaging; Acceptance Criteria AC-10
EVIDENCE: `git show 7b6a615:docs/get-started/installation.md` line 110 says the package "includes separate feature-reviewer and prose-editor definitions". This feature adds `plugins/vh-adlc/agents/vh-adlc-seo.agent.md`, a third agent definition. The `installation.md` change on `feat/seo-agent` updates the skill sentence and leaves this one as it is. The Design's documentation bullets (lines 190-198) and AC-10 do not mention it, so the shipped page would say the package holds two definitions.
PROPOSAL: Add the SEO assessor definition to that sentence in the documentation bullets, and include it in the AC-10 `seo.test.ts` assertions on `installation.md`.

### R-13

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: Line 41 says "on 1 November a report through MCP still succeeded". Background line 80 describes the same call as "HTTP 200 and a `no_data` answer for `domain_ranks`". The Design (line 160) treats an object with `code` as an error, and the outcome table (line 176) maps MCP `no_data` to the `no_data` outcome, not to a success. The session rollout confirms the Background version. The script at line 11231 sends a bare `tools/call` with `Authorization: Apikey` and no initialize. Its output at 2026-11-01T23:01:38 is `"http_status": 200, "outcome": "no_data", "provider_codes": ["no_data"]` for both targets. The call shows that the token was accepted. It does not show that a report returned data.
PROPOSAL: Replace this with something like "on 1 November an MCP report call was accepted and answered `no_data`", so the summary matches Background and the Design's own outcome model.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (outcome mapping bullet and run ledger bullet); Acceptance Criteria AC-03
EVIDENCE: Line 167 says the helper "makes no repeat of an identical failed request, and records the terminal ones in the ledger". Line 161 says the ledger holds "the `--max-units` value, reserved and used units and any terminal outcome". AC-03 asks for more: it "records every failed request in the ledger and refuses an identical request later in the run". The Test Plan (line 224) runs "an MCP `no_data` response followed by an identical second invocation". That second invocation is a separate process, so it can only refuse the request if the ledger records non-terminal failures together with the request's identity. The Design states neither. It also does not say what "identical" compares: the requested parameters, or the request sent after `display_limit` was fitted.
PROPOSAL: In the Design, say that the ledger records every failed request with its report type and requested parameters and its outcome, terminal or not. Say that "identical" compares those requested parameters before the row limit is fitted.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (run ledger bullet)
EVIDENCE: Line 161 has every ledger update take "an exclusive lock" and return `busy` when a reservation waits more than 30 seconds. Line 164 expects killed processes ("A reservation that was never reconciled, such as from a killed process"), but nothing covers a process that is killed while it holds the lock. `git grep -i lock b843f65 -- 'plugins/vh-adlc/scripts/*.ts'` finds no existing lock helper in the package. The Node fs API, which Bun implements, has no advisory lock that the OS releases when the process exits, so a lock file or lock directory is the likely implementation. A file or directory like that stays after a crash. Every later invocation in that run then returns `busy`, which is non-terminal, and Semrush is skipped quietly for the rest of the run. The AC-03 case "a ledger lock held by another process for over 30 seconds" only checks `busy`. It does not check that the run recovers.
PROPOSAL: Specify a lock the OS releases when the holder dies, or stale-lock recovery such as recording the holder's PID and taking over the lock when that process is gone. Add an AC-03 case that kills a lock holder and asserts that a later invocation reserves normally.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Adapter; Context, Owner summary
EVIDENCE: Line 144 says "The permission, limit and credential source count only as committed on the adopter's default branch, ... read from that ref. When that ref is missing, the permission and limit count as absent." The second sentence names only the permission and limit, so the document leaves open what happens to the credential source when `refs/remotes/origin/HEAD` is missing. If the first sentence applies, the credential source is absent too. Then even an explicit in-run owner grant makes no Semrush call in a repository without that ref, such as a local-only repository or one whose remote was added after `git init`. The owner summary says the owner's in-run request is enough to grant spending, and it does not mention this case. No scenario combines an in-run grant with a missing ref.
PROPOSAL: Say explicitly whether the credential source also counts as absent when the ref is missing. If it does, state in the owner summary that Semrush is then unavailable even on request, and require the report to give that as the coverage-gap reason.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-10
EVIDENCE: AC-10 requires "both manifests carry 0.18.0", and the Test Plan cites "`tests/vh-adlc/check.test.ts` for the version". At b843f65, check.test.ts:172 only matches `^\d+\.\d+\.\d+$`, lines 174-178 only require the two manifests to agree, and lines 224-231 only require that the version "not.toBe" main's. Line 199 of the document says this too: "`check.test.ts` checks only that the version differs from main". As planned, no test asserts 0.18.0.
PROPOSAL: Have `seo.test.ts` assert that both manifests read 0.18.0, or name a manual inspection of them as the proof for that clause.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Sources
EVIDENCE: The standard says "Sources lists every external page read, each with the claim it supports". Line 843 gives the SEO API overview only as support for "the API key is passed as the `key` query parameter". Background line 82 also relies on that page for the full v3 error list (`ERROR 110` to `ERROR 135`, `ERROR 50`, the `ERROR 402` variants and `ERROR 429`), which the outcome table at lines 169-178 is built on. Line 163 names "Authority Score profile" as priced per request. That figure comes from the backlinks page (R-11 F-04 quotes `https://developer.semrush.com/api/v3/seo/backlinks/`), and Sources does not list that page.
PROPOSAL: Add the error list to the overview entry's supported claims, and add the backlinks page with the per-request prices it supports.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-05; Context, Owner summary defaults
EVIDENCE: Owner summary line 49 sets the default: "The helper uses the MCP route unless the adapter names the key-in-URL route." Line 159 says "The agent passes the adapter's route." The helper's own tests in AC-03 cover a missing or changed `--route`. None of the AC-05 scenarios asserts which `--route` the agent records, and no scenario adapter names `v3`. An agent that always passes `v3`, which puts the key in the URL, passes every check. So does an agent that ignores an adapter's `v3`.
PROPOSAL: In the `permitted` scenario, assert that every recorded invocation passes `--route mcp` when the adapter names no route. Optionally, add a variant whose adapter names `v3` and assert `--route v3`.

### R-14

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper (row-limit and reconciliation bullet); Context, Owner summary defaults
EVIDENCE: Line 165 says the helper "treats an absent or zero `display_limit` as 100", "lowers the row limit to fit the units left in the ledger", "reserves the maximum cost in the ledger before sending", and on the `mcp` route "keeps the full reservation, marked estimated, when the response carries no such figure". Line 41 confirms that a no-data response "keeps its full reservation counted as an estimate". Stackweaver's archive shows that all three of its own targets returned `no_data` (`README.txt`: "All three returned no_data"; `overview-vhco.pro-response.json`). The only data-bearing call was a control with `display_limit` 1 that cost 10 units (`control-spacelift-request.json`, `control-spacelift-response.json`). Take the 500-unit in-run default and `domain_ranks` at 10 units per line with no `display_limit`. The helper fits 50 rows, reserves 500, and a `no_data` answer keeps all 500, so every later report in the run is refused with `limit`. For the adopter's own no-data sites, one call ends Semrush use for the run, and the previous host and competitor controls are never queried. Neither the Design nor the kept procedure tells the agent to size `display_limit` (the branch `seo.md` only says "bounded reports"). The owner summary lists "A report is capped at 100 rows" as a default but does not mention this effect. No scenario would notice it.
PROPOSAL: Add a procedure rule that the agent requests the smallest `display_limit` that answers its question, starting with one row per target before any larger pull, and have a scenario assert the requested values. At minimum, state in the owner summary that each MCP no-data or error reply uses up its whole reservation and can end Semrush use for the run.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (`mcp` route, reservation and failure-record bullets); Test Plan AC-03
EVIDENCE: Line 165 reserves the report's maximum cost "before sending" and keeps the full reservation for "one whose request got no complete response, marked estimated with a `transport_error` outcome". Line 161 sends the initialization handshake before `tools/call`. Line 168 records "every failed request" with its report type and parameters, and refuses an identical later request. The Design does not cover a handshake that fails without ending the run, such as HTTP 5xx (`provider_error`) or a timeout (`transport_error`). It does not say whether that report's reservation is released, even though the report was never sent and cannot have been charged. It also does not say whether the failure is recorded as a failed request that blocks the identical report for the rest of the run. The AC-03 case "a stub that drops the connection after the request arrives, on each route" does not say whether the handshake or the report call is dropped on `mcp`.
PROPOSAL: State that a reservation is released when the report call was never sent, and say whether a handshake failure counts toward the identical-request rule. Add AC-03 cases for a handshake HTTP 500 and for a dropped handshake connection that assert the ledger entry and what a later identical invocation does.

### R-15

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Sources and assessment (one-row-first rule); Context, Owner summary defaults
EVIDENCE: Line 151 says "It first requests one row per target, and pulls more rows for a target only after that first report returned data." Line 167 still treats an absent or zero `display_limit` as 100, fits the row limit to the units left, and keeps the full reservation when an MCP reply carries no `api_units`. The rule is keyed on the target only. Semrush's own `no_data` reply in Stackweaver's archive (`overview-vhco.pro-response.json`, `content[0].text`) says "No data found for this request", so no data is decided for each exact request. Consider a target whose one-row `domain_ranks` call returns data for one database, as the archived control did (`control-spacelift-request.json`, `display_limit` 1, 10 units). The rule then allows a 100-row report of another type, or for one of the adapter's other markets, on that target. Stackweaver's adapter names five European markets. Under the 500-unit default a 10-unit-per-line report fits 50 rows and reserves 500 units, so one `no_data` reply for an unranked market still uses up the whole run's limit. The R-14 F-01 failure therefore survives for every report after a target's first.
PROPOSAL: Key the one-row-first rule on each new combination of report type, target and database, not on the target alone, and say so in the owner summary default at line 49. Have the `permitted` scenario include a second report or database for the target that returned data.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-05, AC-07; Test Plan AC-05
EVIDENCE: The only criterion that names the one-row-first behaviour is AC-07 (line 216), which requires only that `references/seo.md` lists "the one-row-first rule for Semrush reports". `seo.test.ts` checks that as text. AC-05 (line 214) says nothing about `display_limit` sizing. The Test Plan row for AC-05 (line 229) adds "assert the first report for each target requests `display_limit` 1 and that only the second target gets a larger request". That assertion is not tied to any criterion's text. The standard says "A criterion whose subject is a report, a count or a warning can go green while the problem remains", and an implementation review gives its verdict against each criterion's exact text. An agent that ignores the rule and sends 100-row first requests would still meet AC-05 and AC-07 as written, and R-14 F-01's problem would remain with every box ticked.
PROPOSAL: Add the observable end state to AC-05, for example "the first report for each target (and each new report type or database, per F-01) requests one row, and a target whose first report returned no data gets no further report". Keep the AC-07 text check as a secondary check.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-03; Design, Semrush helper (reservation bullet)
EVIDENCE: Line 167 adds "A reservation whose report call was never sent, because the MCP handshake failed, is released. A handshake failure is not a failed request ... a later identical report may be sent unless that outcome is terminal." The AC-03 Test Plan row asserts "a released reservation ... and that a later identical invocation is sent" for a handshake HTTP 500 and a dropped handshake. AC-03's text (line 212) does not mention the release. It still says the helper "records every failed request in the ledger and refuses an identical request later in the run, sending nothing", which, read literally, contradicts the handshake case the Test Plan expects to be sent. An implementation reviewer judging against the criterion text has nothing that requires the release.
PROPOSAL: Add to AC-03 that a reservation is released when an MCP handshake fails before the report call, and that a non-terminal handshake failure does not block a later identical request.

### R-16

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-05 (`permitted` scenario); Design, Sources and assessment
EVIDENCE: Line 151 keys the rule on each combination: "It first requests one row for each new combination of report type, target and database ... A combination whose one-row report returned no data gets no further report." AC-05 (line 214) has the same text. The `permitted` row (line 229) gives the adapter "two databases" and has the stub answer "`no_data` for the first target", then asserts "that the first target gets no further report". Under the Design, an agent that gets no data for the first target in database A may still send a one-row report for that target in database B, or a one-row report of another type, because each is a new combination. A compliant agent would therefore fail the scenario, and an implementation reviewer would get contradictory instructions from AC-05 and its proof. Semrush's archived `no_data` hint (`overview-vhco.pro-response.json`, `content[0].text`) says "do not look for the data another way: no other reports, discovery tools, parameter variations", which supports the stricter rule the test asserts. The Design states the looser one.
PROPOSAL: Make the Design, AC-05 and the owner summary match the test by saying a target whose one-row report returned no data gets no further report of any type or database, as Semrush's hint asks. If the per-combination rule is meant, change the assertion to "a combination whose one-row report returned no data gets no further report".

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-05 (`permitted` scenario)
EVIDENCE: R-15 F-01 asked the `permitted` scenario to "include a second report or database for the target that returned data", so that it covers the failure where a target that already returned data gets a large first request for a new type or market. Line 229 now says the adapter "names two databases", but no assertion requires the second target to get a report in a second combination. The assertion "the first report for each combination of report type, target and database requests `display_limit` 1" passes without testing anything if the agent sends one combination per target. The archived control used `domain_ranks` with no `database` parameter (`control-spacelift-request.json`: `{"target":"spacelift.io","display_limit":1,...}`). An agent that only uses that report never touches the database dimension. A target-keyed agent could pass every check without the scenario ever exercising the case R-15 F-01 described.
PROPOSAL: Have the `permitted` prompt ask for visibility in both named databases, and assert that the second target got a one-row report in each database, using a report type that takes a database, before any larger request for that combination.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (failure-record bullet); Context, Owner summary
EVIDENCE: Line 170 refuses a later request "whose report type and requested parameters, compared before the row limit is fitted, match a recorded failure". `display_limit` is one of those parameters, so after a one-row `no_data` reply the helper still sends the same report with `display_limit` 100. Only the agent procedure (line 151) keeps that combination from getting a larger report, and an MCP `no_data` reply keeps its whole reservation. Most of the limit protections are enforced in code ("The helper enforces the rest in code", line 41), but this one depends on the agent following the procedure.
PROPOSAL: Leave `display_limit` out of the identical-request comparison so the helper also refuses a larger repeat of a no-data request, and add an AC-03 case for it. Otherwise, state in the owner summary that only the agent enforces this rule.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary defaults (line 49)
EVIDENCE: The owner summary says "each new combination of report type, site and market". The Design (line 151), AC-05 (line 214) and the Test Plan (line 229) say "report type, target and database". An adapter lists "target countries and languages", and one country can map to more than one Semrush database, so "market" and "database" can count combinations differently.
PROPOSAL: Use "report type, target and database" in the owner summary, or explain in one clause that a market means a Semrush country database.

### R-17

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-04, AC-06, AC-08; Test Plan AC-04 to AC-08
EVIDENCE: The owner summary (line 39) promises that the operation "always runs public HTTP and browser checks", that "Missing access is reported as a coverage gap, never as a zero", and that "Findings are ranked, each with affected URLs, impact, confidence and a validation step". The Design (line 149) keeps those rules from the branch `seo.md`: lines 140 and 156 at `8e028c2` require "URL(s), observation, impact, proposed action, confidence and a concrete validation" step and "Keep missing numeric values blank/null with an explicit outcome, never zero". No criterion states any of these end states. For the free-source part of the assessment, the criteria only require "still delivers findings from free sources" (AC-04), "still delivers findings" (AC-06) and "saves a findings table and a manifest" (AC-08). Their proofs only assert "findings present" and "Semrush skipped in source coverage" (lines 228 to 231). Suppose an assessment reports an unconnected Search Console as zero clicks, skips the public checks, and writes findings with no URLs, confidence or validation step. It would still tick every box, even though the free-first assessment is the main thing the owner asked for.
PROPOSAL: Add a criterion that a completed assessment runs the public checks, lists each unavailable source as a coverage gap whose values are blank with an explicit outcome and never zero, and ranks findings that each carry affected URLs, impact, confidence and a validation step. In every scenario, assert this on the saved findings table and source coverage, using a fixture where Search Console is not connected.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (`mcp` route bullet); Test Plan AC-03
EVIDENCE: Line 163 names only the `Authorization: Apikey <key>` header, the handshake, `tools/call` and JSON parsing of `result.content[0].text`. The doc does not say which `Content-Type` or `Accept` headers the helper sends, or whether it can read a streamed (`text/event-stream`) body. Every client the session used against `https://mcp.semrush.com/v2/mcp` sent `'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'`. That includes the accepted 27 October client (`/tmp/stackweaver-semrush-mcp.py`, rollout line 141) and the 3 November client, which also parsed `data:` lines. The AC-03 stub serves the archived plain JSON envelopes, and Scope excludes live Semrush proof. So a helper that sends other headers, or cannot read a streamed reply, would pass every stub case even if the live endpoint rejects it or replies in a form the helper cannot parse. The run would then record `provider_error` every time, and the owner's token would never be used.
PROPOSAL: State that on the `mcp` route the helper sends `Content-Type: application/json` and `Accept: application/json, text/event-stream`, as the accepted client did, and reads either a JSON body or the last `data:` event of a streamed reply. Add AC-03 stub cases that reject a request without those headers and that answer in streamed form.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (defaults list)
EVIDENCE: Design line 170 has the helper record "every failed request ... terminal or not". It then refuses any later request in the run "whose report type and requested parameters, compared without `display_limit`, match a recorded failure". The outcome table counts a dropped connection (`transport_error`) and MCP `internal` (`provider_error`) as non-terminal failures, so a transient failure blocks that exact report for the rest of the run. This setting came from R-16 F-03, and its proposal said that otherwise the owner summary should state who enforces the rule. The defaults list, which the owner "can reject ... at acceptance", says nothing about this rule. The only related default describes the agent's one-row-first and no-data stop.
PROPOSAL: Add a default saying that the helper itself refuses, for the rest of the run, any request that matches an earlier failed one apart from `display_limit`, including transient transport and provider errors.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Semrush helper (`mcp` route bullet)
EVIDENCE: The sentence "The procedure creates one new `--output` directory per run, one that did not exist before: a directory under the adapter's raw export location named with the run's date and time to the second" closes the bullet that begins "on the `mcp` route" (line 163). The owner summary (line 41) applies the one-directory rule to every run. The `permitted-v3` scenario asserts only `--route v3`, so if an implementer reads the rule as applying to MCP only, nothing on the v3 route catches it.
PROPOSAL: Move the one-new-directory sentence into the `--output` or ledger bullet so it clearly applies to both routes, and have `permitted-v3` also assert one new shared `--output` directory.

### R-18

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-04, AC-05, AC-06, AC-08, AC-11; Design, Artifacts and publication
EVIDENCE: Line 207 says only that the scenarios install the package "through a local Codex marketplace, as `tests/vh-adlc/blog/run.ts` does". That runner starts `codex exec --json --approve-for-me` (blog/run.ts:75), and `codex exec --help` says this flag routes approvals "using the workspace-write sandbox". The document never says how the scenarios let the agent reach loopback. I started `python3 -m http.server 18765 --bind 127.0.0.1` and ran `codex sandbox -c sandbox_mode='"workspace-write"' -- curl http://127.0.0.1:18765/` with codex-cli 0.163.0. Inside the sandbox it returned `curl: (7) Failed to connect to 127.0.0.1 port 18765` and `000`. The same curl outside the sandbox returned 200. The owner's own accepted Codex run on 2026-11-01 also needed `"sandbox_permissions":"require_escalated"` to call Semrush (rollout line 11231). The Test Plan also does not say what serves the fixture site for the "public HTTP and browser checks" that AC-11 asserts "as run" in every scenario, or for the AC-08 startup-flash page, or which browser the scenario provides. The adapter's official origin has to resolve to something the agent can fetch. With the blog runner's settings, the helper's calls to the stub and the public and browser checks would all fail. AC-05 ("at least one report request at the stub"), AC-08 and AC-11 would then fail for environmental reasons, and AC-04's "zero requests of any kind at the stub" would pass even if nothing were enforced. The 2026-10-30 forward test recorded "Public HTTP, partial ... synthetic capture; no network requests" (`source-coverage.csv`), which is what an agent falls back to without a served site.
PROPOSAL: State in the Test Plan, or in Artifacts and publication, that `run.ts` serves the fixture site and the Semrush stub on loopback. Say how loopback is reached inside the agent's sandbox, for example `-c sandbox_workspace_write.network_access=true`, and how the adapter's origin maps to the fixture server. Name the browser the scenario provides. Add a scenario precondition check that the stub and the fixture site are reachable from the sandbox, so AC-04's zero-request assertion is not vacuous.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Sources and assessment (line 152); Acceptance Criteria AC-05; Test Plan AC-05; Context, Owner summary defaults (line 49)
EVIDENCE: Line 152 sets two rules. The first is "pulls more rows for a combination only after its one-row report returned data". The second is "A target whose one-row report returned no data gets no further report of any type or database". AC-05 repeats the second rule. The two rules conflict for a target that has data in one database and none in another. Once any one-row report for that target returns `no_data`, the second rule, read literally, stops the larger pull the first rule allows for the database that did return data. It also stops every database not yet queried. What the run learns then depends on query order. This case is realistic because Stackweaver's adapter (`agents/seo.md` on origin/main) asks to evaluate "Belgium, the Netherlands, Germany, France and the UK separately". Semrush's archived hint (`overview-vhco.pro-response.json`, `content[0].text`) is scoped to "this request" and "these parameters". The `permitted` stub answers `no_data` for the whole first target and data for the whole second (Test Plan line 231), so no scenario covers a target with mixed results. An agent following either reading passes, and neither AC-05 nor its proof settles which behaviour the owner gets.
PROPOSAL: Say which rule wins. One option: a target's first `no_data` one-row report stops only reports for that target not yet known to have data. The other: any `no_data` stops the whole target, including databases that already returned data. Use the same wording in AC-05 and the owner summary default. Add a `permitted` stub case where one target returns data in one database and `no_data` in the other, and assert the chosen behaviour.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (line 158); Acceptance Criteria AC-02, AC-07
EVIDENCE: Line 158 says "The procedure and agent forbid calling Semrush hosts through `curl`, WebFetch, a browser, a Semrush MCP server connected to the host or any other tool". The kept `seo.md` at `8e028c2`, line 91, still says "Use it only through an authorized local credential/client or a connected tool". The Design changes line 23 and adds rules, but it never says line 91 is replaced. AC-07 requires only that the named rules are present. AC-02 checks only the agent's tools and description, not the forbidding rule. The agent file at `8e028c2` has no Semrush rule and keeps `WebFetch`. A `seo.md` that keeps line 91 next to the new helper-only line, and an agent file with no rule against other routes, would pass every listed check. No scenario connects a Semrush MCP server, so the scenarios would not catch it either.
PROPOSAL: State that line 91's "local credential/client or a connected tool" is replaced by the helper-only rule. Have `seo.test.ts` assert that the phrase is gone and that both `seo.md` and the agent file carry the rule against calling Semrush through any tool other than the helper.

### R-19

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper (ledger bullet, line 165); Context, Owner summary (line 41); Test Plan AC-03
EVIDENCE: Line 165 says "the lock records its holder's process ID, and a lock whose holder is no longer running is taken over". Line 41 promises that "Calls that share that directory, in sequence or in parallel, never reserve more than the limit together." Inside the sandbox the scenarios use, each command gets its own PID namespace. I ran `codex sandbox -c sandbox_mode='"workspace-write"' -c sandbox_workspace_write.network_access=true -- sh -c 'echo pid=$$; ls /proc | grep -c "^[0-9]"'` with codex-cli 0.163.0. It printed `pid=2` and `4`, while the host showed 2021 processes. A process ID written by one helper invocation therefore means nothing to an invocation started by a different agent command. Suppose a holder recorded PID 3 because it ran under `sh -c`, and a concurrent invocation runs as PID 2 and finds no PID 3. The second invocation takes over a live lock, and both reserve against the same ledger. If instead both helpers run under the same PID, a lock left by a killed holder looks alive forever. Every later reservation then returns `busy`, and Semrush is unusable for the rest of the run. The AC-03 cases ("a lock whose holder was killed", "two concurrent invocations") run in one namespace under `bun test`, so they pass while this failure goes undetected.
PROPOSAL: Use stale-lock detection that works across PID namespaces. Options are a kernel-released file lock on the ledger, or a lease with a heartbeat timestamp that expires. Add an AC-03 case that runs the holder and the contender in separate PID namespaces, for example under `unshare --pid --fork` or `codex sandbox`, and asserts no takeover of a live lock and a takeover of a dead one.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan preamble (line 225), AC-08 and AC-11 rows; Context, Owner summary
EVIDENCE: Line 225 says "Browser checks use the host's Playwright Chromium, headless in a clean context; the runner fails the scenario before starting the agent when it is not installed." The runner's reachability precondition only uses `curl`. On this host `~/.cache/ms-playwright` holds the browser binaries but no Playwright library: `npm root -g` lists only corepack and npm, Python has no `playwright` module, and the repository has no `package.json`. Inside the scenario sandbox, `bun -e 'import("playwright-core")'` failed with "EROFS accessing temporary directory", and `touch $HOME/.cache/...` and `touch $HOME/.npm/...` failed with "Read-only file system". So the agent cannot install a driver into the usual caches. `chrome-headless-shell --headless --dump-dom http://127.0.0.1:<port>/` did load a loopback page inside the sandbox. However, the startup-flash check that AC-08 exercises requires the agent to "delay the suspected resource in a clean browser context and verify that the request was held" (`seo.md:120-121` at `8e028c2`), and that needs a driver. The agent is left to fall back to a gap report, or to install a driver into the fixture tree, which breaks AC-08's write limit. Either way the scenarios fail for environmental reasons, or an AC-11 "browser checks as run" assertion is met with a DOM dump.
PROPOSAL: Have `run.ts` give the agent a browser driver outside the fixture tree. For example, preinstall `playwright-core` in a runner-owned directory and name it in the fixture instructions, or configure a Playwright MCP server in the scenario's Codex profile. Extend the precondition to drive one headless page load through that driver inside `codex sandbox`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Sources and assessment (line 152); Acceptance Criteria AC-05; Context, Owner summary defaults (line 49)
EVIDENCE: Line 152 lets "a database that returned data keep its larger pulls whatever another database answered". Within one database it does the opposite: "A one-row report that returns no data stops every further report of any type for that target in that database." Suppose report type A returns data for a target in a database and type B's one-row report then returns `no_data`. The rule stops A's larger pull even though A is known to have data. If B is tried first, A is never tried at all. So R-18 F-02's order dependence is fixed for databases but remains for report types. Different types answer different questions. The MCP discovery archive lists `resource_organic` next to `domain_organic_subdomains` (`organic_research-discovery.json`), and a single-host site with organic rankings can reasonably have no subdomain data. The archived hint covers "this request" and tells the agent not to look for "the data another way", which is narrower than stopping a different report that already returned data. The `permitted` stub answers per target and database, not per type, so no scenario covers this case.
PROPOSAL: Apply the database rule to types as well: a `no_data` one-row report stops only combinations for that target and database not already known to have data. Alternatively, state the cross-type order dependence in the owner summary default. Either way, add a `permitted` stub case where one type returns data and another returns `no_data` for the same target and database, and assert the chosen behaviour.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Sources and assessment (line 152); Test Plan AC-05
EVIDENCE: Line 152 says "for a report type without a database, it stops every further report of that type for that target". The archived `domain_ranks` requests sent no `database` (`control-spacelift-request.json`, `overview-vhco.pro-request.json`). That report covers all databases, so whether a request has a database depends on its parameters, not its type. A database-less `no_data` already says Semrush has nothing for the target in any database. The rule still requires a one-row report in every requested database, and on MCP each `no_data` keeps its full reservation. That is the "other reports" search that the archived hint advises against. The `permitted` row asserts that "the first target gets exactly one report in each database" but does not say how the stub answers a database-less request or whether such a request counts.
PROPOSAL: Key the rule on whether the request names a database. State whether a database-less `no_data` also stops the per-database one-row reports for that target, and say how the `permitted` stub answers database-less requests.

### R-20

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-03 (line 231); Context, Owner summary (CI paragraph)
EVIDENCE: The new AC-03 case runs the lock holder and the contender "each started in its own PID namespace under `unshare --pid --fork --map-root-user`, which printed `1` for `sh -c 'echo $$'` on this host". I reproduced `1` on this Fedora 43 host, which has no AppArmor. `tests/vh-adlc/seo/semrush.test.ts` is under `tests/vh-adlc`, so the Ubuntu `checker` job runs it with `bun test tests/vh-adlc --timeout 60000` (`.github/workflows/ci.yml:52`). That job runs on Ubuntu 26.04 (`docs/internal/maintenance/linux-ci-apparmor.md:23`). Before any test it has to load `/etc/apparmor.d/bwrap-userns-restrict` so that `bwrap` can create unprivileged namespaces (`ci.yml:34-38`). That shows Ubuntu's restriction on unprivileged user namespaces is active there. The loaded profile covers `bwrap`, not util-linux `unshare`. Under that restriction an unprivileged `unshare --map-root-user --pid` gets no capabilities inside the new user namespace, so creating the PID namespace is expected to fail. The owner summary says CI "must pass before a merge". The spec does not say whether this case runs or skips in CI, so it may fail there for environmental reasons or be dropped quietly.
PROPOSAL: Run the PID-namespace cases under `bwrap --unshare-pid`, which CI already provisions and probes (`cmd/vh-adlc/bwrap_test.go:57` uses the same flag). Alternatively, state that the case skips with a visible reason when no namespace can be created and that the local AC-10 run must execute it.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (ledger bullet, line 165); Test Plan AC-03
EVIDENCE: Line 165 says "a lock whose timestamp is more than 10 seconds old is stale and is taken over; before writing the ledger back, the holder checks that the lock still carries its token, and otherwise discards its update and starts again." It does not require the takeover itself to be atomic. Suppose two contenders find the same stale lock. A takes it over, re-reads the ledger, checks its token and writes. B overwrites the lock after A's token check, re-reads the ledger before A's write lands, then passes its own token check and writes. A's reservation is then lost and both requests go out. This breaks the owner summary's promise that parallel calls "never reserve more than the limit together". The AC-03 rows test one contender taking over a killed holder's lock, never two contenders racing for the same stale lock.
PROPOSAL: Require stale takeover to be a compare-and-swap that only one contender can win, for example renaming the stale lock aside and then creating a new one exclusively. Add an AC-03 case where two invocations find the same stale lock at once and the ledger keeps both reservations or refuses one.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (lines 167-168); Design, Sources and assessment (line 152); Acceptance Criteria AC-05
EVIDENCE: The document never names the helper's report types, but two rules depend on what each type allows. First, line 168 says the helper "always sends a `display_limit` between 1 and that fitted maximum". In the archived MCP schema, `domain_rank`, the single-database overview that `domain_ranks` itself recommends "for a single region", has no `display_limit` parameter and "Returns one row" (`schema-domain_rank-response.json`, `domain_overview-discovery.json`). Line 167 also limits each type to "a fixed set of allowed parameters". If `domain_rank` is on the list, the two rules conflict, and a rejected parameter would cost the whole MCP reservation. Second, line 152 says a no-data reply that named no database stops every report type in every database. That holds for the `domain_ranks` overview. It would also apply to any listed per-line type that has no database at all, such as a backlinks list, whose `no_data` says nothing about organic data per market. Yet the same paragraph says only the "database-less overview" stops other databases.
PROPOSAL: Name the helper's report types in Design, each with whether it takes a database and a `display_limit`. Alternatively, state that every listed type accepts `display_limit` and that only the database-less `domain_ranks` overview stops other databases.

### R-21

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan preamble and AC-05 row; Design, Sources and assessment; Design, Adapter
EVIDENCE: The Test Plan preamble says the runner "writes the fixture adapter's official origin as the site's `http://127.0.0.1:<port>` address". The AC-05 `permitted` row then makes its stub answer "every request for the first target `no_data`; for the second target it answers data to a request naming no database...". It also asserts "that each target's first request is a one-row overview naming no database". No part of the document says which hosts the procedure sends to Semrush as targets, or how the fixture names its two targets. The Adapter key list has official origin, owned aliases and previous hosts, and separate sites. In the scenario the only named host is a loopback IP. The archived MCP requests send `target` as a bare domain (`control-spacelift-request.json`: `"target": "spacelift.io"`; `overview-vhco.pro-request.json`: `"target": "vhco.pro"`). The real 2026-10-29 run queried the adapter's three hosts, `stackweaver.sh`, `sw.vhco.pro` and `vhco.pro`. With the origin at `127.0.0.1:<port>`, the agent might send `127.0.0.1` as a target, might skip Semrush because a loopback IP has no search data, or might pick hosts the stub does not key on. The "first target" and "second target" assertions and "at least one report request at the stub" then depend on the agent's guess, not on the procedure.
PROPOSAL: State in Design which adapter hosts the procedure sends to Semrush as targets, for example the official origin's domain and owned aliases or previous hosts. In the Test Plan, have the fixture adapter name two domain targets that are separate from the loopback serving address, and say that the stub keys on them. Assert that the requests name exactly those targets.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design; Acceptance Criteria AC-07, AC-10
EVIDENCE: feature-documents.md at d8f07c9 says "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion." `git show 3f011e4:docs/specs/seo-assessment.md | grep -c -i glossary` prints `0`. The document introduces terms that reach the adopter in reports and user documentation. Among them are "coverage gap", "unit permission", "per-run limit", "SEO adapter", "provider-reported" versus "estimated" usage, the "historical" export label and the outcome names `authentication`, `access_denied`, `quota`, `rate_limited`, `report_disabled`, `no_data`, `transport_error`, `provider_error`, `busy`, `limit`, `price_mismatch` and `balance_unavailable`. AC-05 and AC-06 require the report to state some of them ("Semrush stopped at the unit limit", `authentication`). AC-07 and AC-10 check that rules and sections are present, not that the terms are used consistently. The same gap was raised as should-fix for the sibling blog document (blog-visual-reading.md R-1 F-07, lines 301-306).
PROPOSAL: Add a glossary table for the user-facing terms and outcome names. Add a criterion, or an AC-07 or AC-10 assertion in `seo.test.ts`, that `references/seo.md`, the workflows SEO section and the compatibility section use those terms as defined.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-03 row
EVIDENCE: The row says the PID-namespace cases run under `bwrap --unshare-pid --dev-bind / /`, "the flag CI already provisions for `cmd/vh-adlc/bwrap_test.go`". At 3f011e4, `.github/workflows/ci.yml` installs and probes bubblewrap only in the `checker` job (lines 33-38, probe `bwrap --unshare-all --ro-bind / / -- /usr/bin/true`). That job runs `bun test tests/vh-adlc` (line 52), so `semrush.test.ts` runs there and the cases are covered. `cmd/vh-adlc/bwrap_test.go` runs in the `verify` job through `michielvha/go-ci-action`. Its `action.yml` at `ab14d64` runs `go test ./...` and installs no bubblewrap, and `bwrapOrSkip` (bwrap_test.go:22-30) skips when bwrap is missing. I ran a Bun FFI `flock` holder and a contender, each under `bwrap --unshare-pid --dev-bind / /` and each inside its own `codex sandbox` on codex-cli 0.163.0. In both setups the contender was refused while the holder lived and got the lock after the holder was SIGKILLed. So the conclusion holds and only the attribution is wrong.
PROPOSAL: Cite the `checker` job's bubblewrap provisioning and probe (`ci.yml:33-38`) as the CI basis, not `cmd/vh-adlc/bwrap_test.go`.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Semrush helper (report-type bullet); Sources
EVIDENCE: The report-type bullet says every listed type is "priced per line" and that the helper holds each type's price "next to the Semrush page it came from". It lists `domain_ranks` with a historical rate. The Sources entries give a per-line price only for Domain Organic Search Keywords (the domain-reports page). The `domain_ranks` price is on `https://developer.semrush.com/api/v3/seo/overview-reports/`, which I fetched and which says "Domain Overview (all databases) Price: 10 API units per line Price for historical data: 50 API units per line". That page is not in Sources. The archived MCP schema confirms that `domain_ranks` accepts `display_date` (`schema-domain_ranks-response.json`).
PROPOSAL: Add the overview-reports page to Sources with the 10-unit and 50-unit per-line prices for `domain_ranks`, and cite it where Design calls the listed types per-line.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: `git show 3f011e4:docs/specs/seo-assessment.md | sed -n '35,61p' | wc -w` prints `1303`. feature-documents.md says "Usually 250 to 400 words is enough" and asks for "a few short paragraphs". The third paragraph alone covers the token's probe history, the route choice, grant decisions, ledger locking and the reconciliation rules for both routes. Those details are already in Background and Design. The defaults the owner must confirm at acceptance come after it. This is guidance, not a gate, but the length makes the acceptance decision harder to read.
PROPOSAL: Shorten the summary to about 400 words. Keep the outcome, scope, authority limits, defaults list and proof state, and leave the token history and helper mechanics to Background and Design.

### R-22

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Semrush helper (ledger bullet) and Documentation and packaging; Acceptance Criteria AC-10; Test Plan AC-03
EVIDENCE: Design line 183 has every ledger update take "an exclusive kernel `flock` on `ledger.lock` ... through Bun's FFI call to the C library", and relies on "the agent's sandbox gives each command its own PID namespace", which is Linux behaviour. The document never says which platforms the helper supports. Line 215 and AC-10 only require the compatibility section and `installation.md` to say "Semrush use needs Bun". At 25d617e, `.github/workflows/ci.yml:68` says "Managed verification and effect recovery require Linux/Bubblewrap/flock", and the `checker-macos` job runs only `bun test tests/vh-adlc/*.test.ts` plus named subdirectories (line 77 onward), so `tests/vh-adlc/seo/semrush.test.ts` never runs on macOS. `installation.md:12` and `:114` say the package supports Linux and macOS, and `installation.md:125` and `compatibility.md:29` state Linux requirements where other helpers need them. The compatibility table records macOS arm64 hosts as in use (`compatibility.md:140-153`). An implementation that loads `libc.so.6` passes every planned check, and a macOS adopter's helper then fails before any request. Nothing says whether that counts as a coverage gap or how the report states it.
PROPOSAL: State the helper's platform in Design. Either make it Linux-only and have `installation.md` and the compatibility section say so, with a macOS run recording Semrush as a coverage gap, or require a portable C-library lookup and add the helper tests to the macOS CI job. Add the chosen statement to AC-10.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Sources and assessment and Adapter; Acceptance Criteria AC-08, AC-11; Context, Owner summary
EVIDENCE: The owner summary (line 39) says the operation "always runs public HTTP and browser checks". Design line 168 says "Public checks always run". AC-11 requires that "Every completed assessment runs the public HTTP and browser checks", and AC-08 relies on a browser for the startup-flash case. The agent keeps only "read, search, Bash, `Write` ... and web access" (line 143). The adapter key list (lines 149-162) has no browser or driver key, and no Design text says how the procedure finds a browser driver or what it does without one. The only driver source is test-only: the Test Plan preamble (line 243) installs `playwright-core` in a runner directory and names it and `chrome-headless-shell` in the fixture `AGENTS.md`. R-19 F-02 found that, without such a driver, the agent cannot install one into the usual caches inside the sandbox. So every scenario passes because of a harness step that a real adopter's host does not have. Real runs then either fail AC-11's "always" or improvise. Line 168's "Missing access is a coverage gap" does not say whether a missing browser counts as one.
PROPOSAL: In Design, say where the procedure gets a browser driver, for example from the adopter's repository instructions or a host browser tool. Also say that, when none is available, the browser checks become a coverage gap with an explicit outcome while the HTTP checks still run. Make AC-11 conditional on the driver being available and add a scenario with no driver.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, Adapter
EVIDENCE: The adapter key list puts "Semrush targets" tenth (line 158), and line 164 says "The first ten may be inferred from context before asking when absent". The same paragraph then says "Absent Semrush targets mean the official origin's host and the owned aliases and previous hosts". The owner summary default (line 49) also gives that fixed fallback. Under the inference sentence, an agent could take competitor hosts from prior research as Semrush targets and spend units on them. Stackweaver's adapter, for example, points at a baseline whose control target is `spacelift.io`. AC-05 cannot catch this because its fixture names its targets explicitly.
PROPOSAL: Change "The first ten" to "The first nine", or exclude Semrush targets from inference by name, so that the fixed fallback is the only rule when the key is absent.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Adapter; Context, Owner summary
EVIDENCE: Line 164 counts the permission, limit and credential source "only as committed on the adopter's default branch, the branch `refs/remotes/origin/HEAD` points to, read from that ref". That ref is a remote-tracking ref. So a permission committed on local `main` but not yet pushed and fetched grants nothing. A permission removed upstream keeps granting until the next fetch. The owner summary (line 41) says the adapter grants units "on its default branch", and the defaults list mentions only a missing ref. AC-04 has no local-ahead or stale-ref variant. The report gives a reason only for a missing ref, so an owner whose local commit is ignored sees "no permission" with no explanation.
PROPOSAL: Say in the owner summary and Design that the grant is read from the last fetched remote default branch. Have the report name the ref and commit it read the permission from.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design, Semrush helper (reservation bullet and outcome table)
EVIDENCE: The outcome table (line 199) counts "a DNS failure" as `transport_error`. Line 186 keeps "the full reservation, marked estimated" for a request that "got no complete response", and line 189 refuses any later request that matches a recorded failure. A DNS failure or refused connection means the report never reached Semrush. On the `mcp` route the handshake fails first and the reservation is released. On `v3` there is no handshake, so a run whose first report is blocked by a network-off host sandbox loses that report for the rest of the run, even after network approval, and keeps its units reserved. Codex `workspace-write` has network off unless it is enabled; I observed `000` without `network_access=true` and `200` with it on codex-cli 0.163.0.
PROPOSAL: Treat a failure before any request bytes are sent, such as DNS failure or connection refused, like a failed handshake. Release the reservation and do not record it as a failed request, and add a v3 stub case for it.

### R-23

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers; Design, Documentation and packaging; Acceptance Criteria AC-10
EVIDENCE: Design line 218 now requires "`.github/workflows/ci.yml`'s `checker-macos` job adds `tests/vh-adlc/seo/semrush.test.ts` to its test list", and AC-10 requires "the `checker-macos` CI job runs `tests/vh-adlc/seo/semrush.test.ts`". The `covers` list (lines 7-26) does not include `.github/workflows/ci.yml`. feature-documents.md at d8f07c9 says "`covers` lists every path whose change can affect the feature". `feature_tree_clean` and staleness both read `covers`. So an uncommitted edit to `ci.yml` would not block completion, and a later change that drops the test from the macOS job would not show up against the feature. At 8c0f4e6, `ci.yml:76-87` lists `tests/vh-adlc/*.test.ts` and named subdirectories, and `tests/vh-adlc/seo/` is not among them, so the implementation has to edit this file.
PROPOSAL: Add `.github/workflows/ci.yml` to `covers`.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Sources and assessment (line 170); Context, Owner summary (line 50); Acceptance Criteria AC-11; Test Plan AC-11 `no-browser`
EVIDENCE: Design says browser checks use "a browser driver the adopter's repository instructions or adapter name, or a browser tool the host provides; the agent installs none". The document uses "host" in two senses: the agent runtime ("A Semrush MCP server connected to the agent's host") and the machine ("fails on this host" in Background). It never says whether a browser binary that is already installed on the machine counts. On this machine, `command -v chromium-browser firefox` prints `/usr/bin/chromium-browser` and `/usr/bin/firefox`, and `~/.cache/ms-playwright` holds several `chromium_headless_shell-*` builds. Through Bash, an agent can run `chromium-browser --headless --dump-dom <url>` without installing anything. The `no-browser` scenario (line 260) only removes the driver from the fixture `AGENTS.md` and gives the agent no browser tool. It then asserts the browser checks are a coverage gap. Whether the scenario passes depends on how the agent reads "host" and on which browsers the test machine has, not on the procedure. Real adopters with Chrome installed will see the same inconsistency.
PROPOSAL: Define "browser driver" in Terminology, saying whether a browser binary found on the machine but not named counts. Either forbid it or allow it explicitly. In `no-browser`, also assert that no transcript command launched a browser binary, or run the scenario with a `PATH` that has no browser on it.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, Adapter (key list) and Sources and assessment (line 170); Context, Owner summary (line 50)
EVIDENCE: Line 170 lets the adapter name a browser driver ("the adopter's repository instructions or adapter name"). The Adapter key list has no browser or driver key, and AC-07 requires `seo.md` to list the adapter keys. The owner summary default says "only a driver your repository instructions name or a browser tool the host provides" and leaves out the adapter.
PROPOSAL: Either add a browser driver key to the Adapter list and the owner summary, or drop "or adapter" from line 170.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (line 47); Design, Terminology (line 129) and Authority (line 213)
EVIDENCE: The owner summary says "The adapter's Semrush settings are read from `refs/remotes/origin/HEAD` as last fetched ... Without that ref, they count as absent". Design line 166 applies the ref rule only to "the permission, limit and credential source". It does not say where targets and route are read from. The Terminology row for "Unit permission" and the Authority row that becomes `authority.md` text still say "as committed on its default branch", with no last-fetched or remote-tracking qualifier. So `authority.md` can be read as letting a commit on local `main` grant units.
PROPOSAL: Have the summary name the three keys the ref rule covers, or extend Design to targets and route. Add "as last fetched (`refs/remotes/origin/HEAD`)" to the Terminology and Authority wording.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-04; Test Plan AC-04 and AC-05
EVIDENCE: The owner summary promises that "an unpushed local edit grants nothing", and Design line 166 says "a permission committed locally but not pushed and fetched grants nothing". The AC-04 variants (line 253) cover an uncommitted edit, a non-default branch and a missing `refs/remotes/origin/HEAD`. In AC-05 (line 254), `refs/remotes/origin/HEAD` points at the commit that holds the permission, which is also the local default branch tip. An implementation that resolves the default branch name and reads local `main` would pass every planned scenario. It would also name a plausible ref and commit.
PROPOSAL: Add an AC-04 variant where the local default branch has a committed permission and limit that `refs/remotes/origin/HEAD` does not. Assert zero requests and that the report names the remote ref and its commit.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (line 53); Design, Semrush helper (line 188)
EVIDENCE: The owner summary says "A failed Semrush request is never repeated in the same run, even after a transient error." After the R-22 fix, Design line 188 releases the reservation and allows a later identical report after "a DNS failure or a refused connection" or a non-terminal handshake failure: "Neither is a failed request ... a later identical report may be sent". AC-03 and its Test Plan row assert that resend. To an owner, a DNS failure or a refused connection is a transient error, so the summary contradicts the detailed rule.
PROPOSAL: Reword the default along these lines: a report that reached Semrush and failed is never repeated in the run, while one that never left the host, or whose handshake failed non-terminally, may be sent again.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, Sources and assessment (line 171); Acceptance Criteria AC-05
EVIDENCE: Line 171 says "the procedure sends only the adapter's Semrush targets ...; a separate site is a target only when the request names it." AC-05 requires that the run "names only the adapter's Semrush targets". This can be read two ways. Either an owner request can add a separate site that is not in the targets key, which contradicts "only the adapter's Semrush targets" and AC-05. Or a separate site listed in the targets key is queried only when the request names it. The fallback for an absent targets key never includes separate sites, so the clause has no clear effect.
PROPOSAL: State which reading is meant, and make AC-05 and the owner summary's targets default match it.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-03 row (line 252)
EVIDENCE: The case list that starts "runs the helper for:" is broken by two full sentences: the CI basis ("CI's `checker` job installs and probes bubblewrap ... also run on macOS.") and host evidence ("On this host a Bun `flock` held under one such namespace refused a contender in another, both printing PID 2, and the contender got the lock once the holder was killed"). The list then resumes with "; a lock taken after the report is sent ...". It is unclear whether the cases after the break are still part of the "runs the helper for" list, and the evidence clause runs straight into a test case.
PROPOSAL: Move the CI and host-evidence sentences after the complete case list, so the list stays one unbroken enumeration.

### R-24

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Adapter (line 168); Context, Owner summary (lines 48 and 50); Acceptance Criteria AC-05; Test Plan AC-05
EVIDENCE: After R-23, line 168 says "The Semrush targets, route, credential source, permission and limit count only as committed on the adopter's default branch ... read from that ref". The same line also says "Semrush targets are never inferred: when absent, they are the official origin's host and the owned aliases and previous hosts". The official origin and owned aliases are the first two keys of the list (lines 153-154). Line 168 also says "The first nine may be inferred from context before asking when absent", and nothing ties those nine to `refs/remotes/origin/HEAD`. So when the targets key is absent, the hosts Semrush is asked about come from keys that an uncommitted working-tree edit, context inference or the owner's answer to a question can set. That contradicts the summary's "an unpushed local edit grants nothing" and "an in-run request cannot add one". This fallback is the real adopter path. Stackweaver's adapter at `origin/main` (3cc486c3, `agents/seo.md`) has no Semrush targets key, only "Official product origin" and "Owned previous product host" lines. In every Semrush scenario, the fixture adapter names `first-target.example` and `second-target.example` explicitly (Test Plan preamble), so the fallback is never exercised.
PROPOSAL: When the targets key is absent, derive the fallback only from the official origin and owned aliases as read from `refs/remotes/origin/HEAD`, never inferred, and say so in Design and the owner summary. Add an AC-05 scenario whose committed adapter has no targets key and an uncommitted edit that adds an alias, and assert that only the committed origin and aliases reach the stub.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-07; Test Plan AC-07 (line 258)
EVIDENCE: R-23 added "as last fetched (`refs/remotes/origin/HEAD`)" to the Authority row (line 215) and the Unit permission term, and extended the ref rule to five keys. AC-07 (line 240) still requires only "the three never-inferred keys and the committed-default-branch rule", and the AC-07 proof asserts only that the authority row "states the two grants and the limit order". Line 168 now also leaves Semrush targets and route uninferred, besides "the last three". An `authority.md` or `seo.md` that says only "as committed on its default branch", the wording R-23 F-04 found ambiguous, still passes AC-07.
PROPOSAL: In AC-07 and its proof, require `authority.md` and `seo.md` to state that the five Semrush keys are read from `refs/remotes/origin/HEAD` as last fetched, and replace "three never-inferred keys" with a phrase that matches line 168.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-11; Test Plan AC-11 `no-browser` (line 262); Design, Terminology (line 129)
EVIDENCE: The Terminology row says an unnamed installed browser "is not a browser driver, and the procedure never launches one (AC-11)", and Design line 172 says the agent "launches no browser the instructions do not name". AC-11 (line 244) requires only that the browser checks are run or recorded as a gap "without installing one". It has no no-launch clause. So the `no-browser` launch assertion checks something the criterion does not state, and an implementation that launches `/usr/bin/chromium-browser` but records a gap meets the criterion's text. The assertion also matches only "by command name or path". A launch from a script file the agent writes, such as `node probe.mjs` that spawns `~/.cache/ms-playwright/chromium_headless_shell-*/.../headless_shell`, has neither in its command.
PROPOSAL: Add "and launches no browser that is not a browser driver" to AC-11. Extend the `no-browser` match to command arguments and to the contents of files the agent writes, or run that scenario with a `PATH` and `HOME` that hold no browser.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (line 50); Design, Sources and assessment (line 174); Test Plan AC-05
EVIDENCE: R-23 added "an in-run request cannot add one" and "An in-run request cannot add a target; a separate site is assessed with Semrush only when the adapter lists it as a target". No scenario prompt names any host outside the adapter's targets. `permitted` asks only for "visibility in both" databases, and the `in-run*` prompts only allow units. An implementation that adds a host named in the prompt passes every planned check.
PROPOSAL: Have one permitted scenario's prompt also ask for Semrush data on a separate site (for example the adapter's excluded separate site), and assert that no report request names it.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 (line 262)
EVIDENCE: The row opens "Every scenario except `no-browser`, whose fixture has no connected Search Console: assert ...". The relative clause can attach to `no-browser` rather than to every scenario. The `no-browser` assertions then omit the Search Console coverage gap and the findings-table checks, although AC-11 applies to "Every completed assessment".
PROPOSAL: Reword to something like "In every scenario, whose fixture has no connected Search Console, assert ...; in every scenario except `no-browser`, also assert the browser checks ran", so that `no-browser` is covered by the Search Console and findings-table assertions too.

### R-25

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262); Acceptance Criteria AC-11 (line 244)
EVIDENCE: After R-24, the `no-browser` assertion fails the scenario if any "command word, `exec` input or patch content" contains `chrome`, `chromium`, `firefox`, `msedge`, `headless_shell`, `playwright` or `puppeteer`. The same scenario requires the browser gap's outcome to "name the missing driver", and the agent writes that report through a patch or a shell heredoc. A correct report line such as "browser checks: coverage gap, no Playwright or Chrome driver named" therefore puts a matched word into patch content or `exec` input. Some ordinary non-launching commands would also match. Examples are an agent checking the instructions with `grep -i playwright AGENTS.md` or probing with `command -v chromium firefox`. With the R-24 isolation (fresh `HOME`, runner-built `PATH`), a bare browser name cannot be resolved, and every absolute browser path (`/usr/bin/chromium-browser`, `/usr/bin/firefox`, `~/.cache/ms-playwright/chromium_headless_shell-*/.../headless_shell`) already contains a matched word. So the widened content match adds little protection, but it can fail an implementation that behaves correctly.
PROPOSAL: Apply the word match only to what actually runs. That means the executable word of each command, the script an interpreter is given, and the contents of files the agent writes and then executes. Exclude report and export writes and read-only searches, or name exactly which transcript fields count as a launch.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-07 (line 240); Test Plan AC-07 (line 258)
EVIDENCE: The R-24 fix put the ref wording into the AC-07 proof: "asserts ... that it and `references/seo.md` each contain `refs/remotes/origin/HEAD` and \"last fetched\"". The criterion requires that wording only of `references/seo.md` ("the rule that the five Semrush keys and the origin and aliases the target fallback uses are read from `refs/remotes/origin/HEAD` as last fetched"). For `authority.md` it still says only "has the paid-API-unit row". Under the criterion text, an `authority.md` row that says only "as committed on its default branch" still meets AC-07. That was the gap R-24 F-02 raised, and the same kind of criterion and proof mismatch that R-24 F-03 fixed for AC-11.
PROPOSAL: In AC-07, say that the `authority.md` row states the two grants, the limit order, and that the committed permission is read from `refs/remotes/origin/HEAD` as last fetched.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-05 (line 238); Test Plan AC-05 `permitted-fallback` (line 256)
EVIDENCE: The new `permitted-fallback` scenario asserts that an alias added only in the working tree (`second-target.example`) is never requested. AC-05 still says only "names only the adapter's Semrush targets". It does not say that the targets come from `refs/remotes/origin/HEAD`, or that without a targets key they are the origin and aliases committed there. Read as text alone, "the adapter's Semrush targets" can mean the working-tree adapter. In that reading the scenario's key assertion goes beyond the criterion.
PROPOSAL: Add to AC-05 that every report names only the Semrush targets committed at `refs/remotes/origin/HEAD`, or, without a targets key, the official origin's host and the owned aliases committed there. State that no working-tree edit or in-run request adds one.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Test Plan preamble (line 248); Test Plan AC-05 `permitted-fallback` (line 256)
EVIDENCE: The shared-harness preamble says "The fixture adapter's Semrush targets key names two domains apart from that address, `first-target.example` and `second-target.example`". `permitted-fallback` has "no Semrush targets key", uses `first-target.example` as a committed owned alias, and uses `second-target.example` only in an uncommitted alias edit. The preamble does not mark `permitted-fallback` as an exception, so the two descriptions of the fixture adapter contradict each other.
PROPOSAL: Qualify the preamble sentence, for example "Except in `permitted-fallback`, the fixture adapter's Semrush targets key names ...".

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-05 `permitted` (line 256); Test Plan preamble (line 248); Design, Adapter (line 155) and Sources and assessment (line 174)
EVIDENCE: The R-24 `permitted` fixture lists `separate.example` under the adapter key "separate sites to exclude unless requested", and its prompt now asks "for Semrush data on `separate.example`". Under that key, the prompt counts as a request, so the free checks may include `separate.example`. That conflicts with the preamble's "every page the public checks fetch come from that site", and the `.example` host fails DNS with network access on. The Design also does not say what the report tells the owner when an in-run request names a host that is not a Semrush target. The owner asked for that data and the document defines no reported outcome.
PROPOSAL: Choose one rule and state it. Either the `permitted` prompt limits its `separate.example` request to Semrush data, or the preamble allows the separate site in free checks. In Design, and if wanted in the scenario, require the report to name the refused host and say that it must be listed as a Semrush target.

### R-26

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262)
EVIDENCE: The R-25 rule matches the command name of each simple command, an interpreter's "script argument" when the command is `sh` or `bash`, and "in code-mode `exec` input, string literals passed to a process-spawning call". It then says that read-only searches such as `grep -i playwright AGENTS.md` and report writes "do not count". The rule does not say which recorded form of a command it parses. On codex-cli 0.163.0 on this host, the local session `~/.codex/sessions/2026/11/03/rollout-2026-11-03T02-38-53-01a19f0f-2933-7d51-82e4-2fcd89b17099.jsonl` records each shell call in two ways. The first is a `CommandExecution` item with `"command": ["/bin/bash", "-lc", "pwd && rg --files -g 'AGENTS.md' ..."]`. The second is a code-mode `exec` input such as `const r = await tools.exec_command({cmd:"pwd && rg --files ..."})`; the session has 3005 of these. In the first form the command name is `bash`, so the whole `-lc` string is its script argument and is matched without being split. In the second form the `cmd` string is a literal passed to a process-spawning call and is also matched whole. Under either reading, `grep -i playwright AGENTS.md` and a heredoc report line that names the missing Playwright or Chrome driver both match. Those are the false positives that R-25 F-01 removed and the exclusion sentence forbids. Splitting also ignores quoting: `rg -i 'chromium|playwright' AGENTS.md` split on `|` gives a simple command whose first word is `playwright'`. Correct behaviour in the procedure, which is to check the instructions for a named driver, can therefore fail the scenario. Which way a harness decides is left open.
PROPOSAL: Name the transcript fields the check reads. State that the string of a `bash -c` or `-lc` call, and a code-mode `exec_command` `cmd`, are split and matched recursively by the simple-command rule, with quotes and heredoc bodies respected. Limit the literal rule to other process-spawning calls such as `child_process.spawn`, `execFile` or `Bun.spawn`.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262); Acceptance Criteria AC-11 (line 244)
EVIDENCE: Narrowing the check to command names lets some real launches through. This host has `/usr/bin/chromium-browser`, `/usr/bin/firefox` and `/home/m/.cache/ms-playwright/chromium_headless_shell-*`. The runner-built `PATH` and fresh `HOME` do not hide absolute paths. In `/usr/bin/timeout 20 /usr/bin/chromium-browser --headless --dump-dom http://127.0.0.1:<port>/`, the command name is `timeout`, which is not in the interpreter list, so its arguments are never matched. The same applies to `env`, `nohup`, `exec`, `xvfb-run` and `npx`. Some scripts the agent writes also escape. One run directly, as in `chmod +x probe.sh && ./probe.sh`, is never read, because file content is read only when the script is given to a listed interpreter. A script fed on standard input, as in `python3 - <<'EOF'`, has no script file to read. Interpreters such as `python`, `perl`, `ruby` and `zsh` are not listed. AC-11 forbids launching a browser that is not a browser driver, but these launches pass the proof.
PROPOSAL: For wrapper commands, match their first non-option command argument as well. Read the content of any written file that is executed, whether through an interpreter or directly, and also standard-input scripts. Alternatively, match every word of each simple command except under the stated exclusions.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-05 (line 238); Test Plan AC-05 `permitted` (line 256); Design, Sources and assessment (line 174)
EVIDENCE: R-25 added to Design: "When a request asks for Semrush data on a host that is not a target, the report names that host as refused for Semrush and says it must be listed as a Semrush target in the committed adapter." The `permitted` proof now asserts that the report "names it as refused for Semrush" and that "no public check fetches it". AC-05 says only "with no working-tree edit or in-run request adding one". No criterion requires the refused-host report line or forbids public checks of `separate.example`. This is the same criterion and proof mismatch that R-25 F-02 and F-03 fixed for AC-07 and AC-05.
PROPOSAL: Add to AC-05 that, when a request asks for Semrush data on a host that is not a target, the report names that host as refused for Semrush and that it must be listed as a target. Either tie "no public check fetches it" to a criterion or drop it from the proof.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Test Plan preamble (line 248); Test Plan AC-05 `permitted-fallback` (line 256); Design, Adapter (line 168)
EVIDENCE: The preamble says "The startup-flash page and every page the public checks fetch come from that site". In `permitted-fallback`, `first-target.example` is a committed owned alias and `second-target.example` is an alias added in the working tree. Line 168 says that apart from the target fallback, "other uses of those keys may infer them", so the working-tree alias is valid for other uses. The procedure the spec keeps from `feat/seo-agent` (`plugins/vh-adlc/references/seo.md:10-12` at `8e028c2`) has the agent establish "owned aliases" and says "An old host and a future official host need separate observations". Its public checks inspect "status codes and redirects" within "the authorized hosts/pages" (lines 41-48). A correct assessment may therefore fetch both `.example` aliases, which contradicts the preamble.
PROPOSAL: Qualify the preamble so that public checks of the fixture's owned aliases in `permitted-fallback` are allowed and recorded with their DNS outcome. Otherwise, have that scenario's prompt limit the public checks to the official origin.

### R-27

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262); Test Plan preamble (line 248)
EVIDENCE: The trap list covers only the file names `chrome`, `chromium`, `chromium-browser`, `google-chrome`, `google-chrome-stable`, `firefox`, `firefox-bin`, `msedge` and `headless_shell`, searched under `/usr`, `/opt`, `/snap` and `~/.cache/ms-playwright`. On this host, `find ~/.cache/ms-playwright -name headless_shell` returns nothing. Each of the seven `chromium_headless_shell-*` directories holds `chrome-headless-shell-linux64/chrome-headless-shell` instead. The preamble names this binary as "the host's Playwright `chrome-headless-shell` binary" that the other scenarios drive. Some browsers sit outside the listed roots: `~/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome` and `linux-143.0.7499.40`, and the flatpak `app.zen_browser.zen` under `/var/lib/flatpak/app`. Others under a listed root have unlisted names, such as the WebKit `minibrowser-gtk/bin/MiniBrowser` and `pw_run.sh` in `~/.cache/ms-playwright/webkit-2370`. I ran `bwrap --dev-bind / / --ro-bind trap.sh /usr/lib64/chromium-browser/chromium-browser -- codex sandbox -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["<log>"]' -- sh -c "test -x <chrome-headless-shell path> && head -c 4 <path> | od -c; test -x ~/.cache/puppeteer/.../chrome && echo puppeteer-exec-ok"` on codex-cli 0.163.0. It printed `177 E L F` and `puppeteer-exec-ok`, so inside the scenario's wrapper both are real, executable, untrapped browsers. The trap itself worked: `/usr/bin/chromium-browser --headless --version` under the same wrapper exited 1 and logged the call. The row's statement "A launch through any wrapper, interpreter, script or library reaches one of the trapped paths" is therefore false on the host where the probe was observed. An agent that finds and launches the cached headless shell by absolute path passes the empty-trap-log assertion.
PROPOSAL: Add `chrome-headless-shell`, `MiniBrowser` and `pw_run.sh` to the names. Add `~/.cache/puppeteer`, `/var/lib/flatpak` and `~/.local/share/flatpak` to the roots, or trap every executable under the browser caches whose name matches chrome, chromium, firefox or MiniBrowser. Make the runner fail the scenario when the `chrome-headless-shell` binary that the preamble names is not in its trap list.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262); Acceptance Criteria AC-11 (line 244)
EVIDENCE: The no-install proof asserts only that "the fixture tree and the runner's directories gain no browser package or binary". Every scenario adds `-c sandbox_workspace_write.network_access=true` (line 248). Under `codex sandbox -c sandbox_mode='"workspace-write"' -c sandbox_workspace_write.network_access=true`, `echo hi > /tmp/.../wtest` succeeded, so `/tmp` is writable inside the agent's sandbox. A browser downloaded into `/tmp`, for example through `PLAYWRIGHT_BROWSERS_PATH=/tmp/...`, would not appear in the fixture tree or the runner's directories. It would also not be trapped, because the trap list is built before the run. AC-11's "without installing one" is then not covered by the proof.
PROPOSAL: Either run `no-browser` with `/tmp` and `$TMPDIR` excluded from the sandbox's writable roots, or extend the after-run check to every writable root, `/tmp` included, and fail when a new executable with a browser name appears.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-05 `permitted` (line 256); Acceptance Criteria AC-05 (line 238)
EVIDENCE: AC-05 now requires that "the report names that host as refused for Semrush and says it must be listed as a Semrush target". The `permitted` proof asserts only "that the report names it as refused for Semrush". Nothing checks the second clause, so a report that names the refusal without telling the owner how to fix it passes.
PROPOSAL: Also assert in `permitted` that the report says `separate.example` must be listed as a Semrush target in the committed adapter.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan preamble (line 248)
EVIDENCE: The new preamble text reads "except that in `permitted-fallback` public checks may also fetch the owned aliases, each recorded with its DNS outcome". It does not say whether the harness asserts the DNS-outcome record when an alias is fetched, and no criterion requires that record. AC-11 covers coverage gaps for sources, not per-host DNS outcomes. A harness author could add an assertion that has no criterion behind it, or leave it as a description only.
PROPOSAL: Either state that the allowance only permits these fetches and asserts nothing, or tie the DNS-outcome record to AC-11 and assert it in `permitted-fallback`.

### R-28

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262); Acceptance Criteria AC-11 (line 244)
EVIDENCE: The row says the Codex settings mean "every directory the agent can write is on the `noexec` mount and nothing the run writes or downloads can execute". I rebuilt the wrapper on this host with codex-cli 0.163.0: `unshare --user --map-root-user --mount`, a `noexec` tmpfs holding the fixture, HOME and log directory, then `bwrap --dev-bind / / --tmpfs /home/m --tmpfs /var/lib/flatpak --ro-bind <codex release> <codex release>` plus `--ro-bind` traps over the 24 files the row's name pattern lists. Inside it I ran `codex sandbox -c sandbox_mode='"workspace-write"' -c sandbox_workspace_write.network_access=true -c sandbox_workspace_write.exclude_slash_tmp=true -c sandbox_workspace_write.exclude_tmpdir_env_var=true -c 'sandbox_workspace_write.writable_roots=["<log dir>"]'`. The command `cp /usr/bin/true /dev/shm/x && /dev/shm/x` exited 0, so `/dev/shm` is writable and executable. The same check against `/tmp`, `/var/tmp`, `/run/user/1000`, `/home/m` and HOME showed them read-only. Fixture and log copies exited 126, and outbound HTTPS returned 200. A file written there did not appear on the host's `/dev/shm` after the run, so it is a private tmpfs that Codex's own sandbox creates, which the outer wrapper cannot mount `noexec`. An agent could download a browser into `/dev/shm` and launch it in one command. The after-run checks would still pass, because they only scan the fixture, HOME and log directory, the copy is gone after the run and the file was never trapped. The preflight never checks `/dev/shm`, and AC-11's "without installing one" is still not proven.
PROPOSAL: Fix the claim and close the gap. One option is to record every `execve` in Codex's process tree, for example by running Codex under `strace -f -e trace=execve`, and fail when an executed file is outside `/usr` and the bound Codex install. Another is to have the preflight copy `/usr/bin/true` into `/dev/shm` and require that it fails to execute.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262)
EVIDENCE: The trap list covers only `/usr`, `/opt` and `/snap`, and the wrapper hides only the invoking home and `/var/lib/flatpak`. Everything else stays visible through `--dev-bind / /`. On this host, `/srv/backup/btrbk/` holds world-readable btrbk snapshots of `/home` (`home.20261104T0404` to `home.20261110T0000`, owned by root with mode `drwxr-xr-x`). They include `m/.cache/ms-playwright/chromium_headless_shell-1217`, `-1224`, `-1234` and `-1247`, each with an executable `chrome-headless-shell-linux64/chrome-headless-shell` (`-rwxr-xr-x`). I ran a check inside the wrapper and `codex sandbox` described in F-01. `test -x /srv/backup/btrbk/home.20261110T0000/m/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell` succeeded and its first bytes were `177 E L F`. The same file under `/home/m/.cache` was hidden. It sits on a btrfs mount without `noexec` and is not in the trap list. An agent that launches it by absolute path would pass the empty-trap-log assertion. The row claims the wrapper "hid the cached `chrome-headless-shell`", but that is true only for the copy under the home path.
PROPOSAL: Build the list from every directory visible inside the wrapper except `/proc`, `/sys` and `/dev`, not only `/usr`, `/opt` and `/snap`. Alternatively, bind only the roots the run needs instead of `--dev-bind / /`. Make the preflight fail when an untrapped executable matching the name pattern is still reachable.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262); Test Plan preamble (line 248)
EVIDENCE: The row hides the invoking home with `--tmpfs` but does not say what must be bound back. On this host `codex` is `/home/m/.local/bin/codex -> /home/m/.codex/packages/standalone/current/bin/codex`. The release directory also holds `codex-resources/bwrap` and `codex-path/rg`. With the same wrapper minus `--ro-bind <release> <release>`, the run printed "env: 'codex': No such file or directory". The preamble says the runner "starts `codex exec` as the blog runner does". That runner symlinks the auth profile to the invoking home (`tests/vh-adlc/blog/run.ts:19-20`, `symlinkSync(join(homedir(), ".codex/auth.json"), ...)`), so the link would also dangle under the hidden home. Copying it instead puts a credential onto the tmpfs, which the row does not address.
PROPOSAL: State that the runner binds back the resolved Codex installation read-only, and that it provides the auth profile in a way that still works while the invoking home is hidden.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262)
EVIDENCE: The name pattern also matches shared libraries, because they are executable ELF files. On this host the list includes `/usr/lib64/libchromaprint.so.1`, `/usr/lib64/libchromaprint.so.1.6.0`, `/usr/lib64/vlc/plugins/demux/libdemux_chromecast_plugin.so` and `/usr/lib64/qt6/plugins/pim6/importwizard/operaimporterplugin.so`. `ldd /usr/bin/ffmpeg` and `ldd /usr/bin/ffprobe` each link `libchromaprint`. With the trap script bound over it, those tools would fail with a loader error and log nothing. A run would then fail for a reason the scenario does not report, rather than a trap call.
PROPOSAL: Exclude shared objects from the list, for example ELF files of type `ET_DYN` that have no interpreter, or names ending in `.so` or `.so.<n>`.

### R-29

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262); Acceptance Criteria AC-11 (line 244)
EVIDENCE: The row says a browser that runs anywhere "fails the scenario when it runs, whatever wrapper, interpreter or library starts it". The check only sees processes that Codex itself starts, so a program that a service outside that tree starts is never seen. I ran `strace -f -qq -s 512 -e trace=execve,execveat -e signal=none -o '|cat' codex sandbox -c sandbox_mode='"workspace-write"' -c sandbox_workspace_write.network_access=true -- sh -c 'systemd-run --user --quiet --wait --pipe /usr/bin/uname -n; echo rc=$?'` on codex-cli 0.163.0 with strace 7.3. It printed `fedora-43` and `rc=0`. The trace held `execve("/usr/bin/systemd-run", ...) = 0` and had no `execve` of `/usr/bin/uname`. The user systemd manager ran that program outside the traced tree. In the same sandbox, `env` showed `XDG_RUNTIME_DIR=/run/user/1000` and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`. `busctl --user list` worked, and a `gdbus` Ping to `org.freedesktop.systemd1` returned `()`. The socket `/run/user/1000/bus` has mode `srw-rw-rw-`, so a fresh `HOME` and `PATH` do not hide it. The user `m` is also in the `docker` group, and `/var/run/docker.sock` is `srw-rw---- root docker`. So `systemd-run --user <any path>`, `docker run` with a browser image, or `xdg-open`/`gio open <url>`, which hands the URL to the desktop's default browser, could each start a browser. In every case the trace would hold only `/usr` tools with non-browser names, so the exec check and the after-run file scan would both pass. `xdg-open` is a plausible accidental choice for an agent that wants to look at a page.
PROPOSAL: Have the scenario cut Codex off from launchers outside its process tree. For example, run it with `/run/user/<uid>` and the Docker socket hidden and the bus variables unset. Add preflight cases in which `systemd-run --user --wait /usr/bin/true` and `docker info` must fail inside `codex sandbox`. Otherwise, drop the "whatever wrapper" claim and state this limit of the proof.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262)
EVIDENCE: The check trusts the path string that `execve` names. Inside `codex sandbox` with the row's settings, under the row's strace command, I ran `printf '#!/bin/sh\necho SWAPPED\n' > /dev/shm/s; chmod +x /dev/shm/s; unshare -Urm sh -c "mount --bind /dev/shm/s /usr/bin/uname && /usr/bin/uname"`. It printed `SWAPPED`. The trace recorded only `/usr/bin/unshare`, `/usr/bin/mount` and `execve("/usr/bin/uname", ...) = 0`. All of those resolve inside `/usr` on the host and have non-browser names, so a browser bind-mounted the same way would pass. The first clause accepts any successful exec of "a link in the runner-built `PATH` directory" and checks the link targets only before the run. The row does not place that directory or the `-o <trace>` file outside the sandbox's writable roots. The traced `bwrap` call has `--bind /tmp /tmp` and `--bind <cwd> <cwd>`, so an agent could repoint a link before running it. Both cases need deliberate evasion, but they contradict the "whatever wrapper" claim.
PROPOSAL: Also fail on a successful `mount`, `unshare` or `setns` from any process that is not Codex's own `bwrap`. Check the `PATH` link targets again after the run. Keep the `PATH` directory and the trace file outside every root that Codex makes writable.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262)
EVIDENCE: The row says the trace recorded "Codex's own `codex-linux-sandbox`, `bwrap` and `codex-path/sh` runs". In my traces, `execve(".../0.163.0-x86_64-unknown-linux-musl/codex-path/sh", ...)` returned `-1 ENOENT` because that directory holds only `rg`. So it was a failed attempt, not a run, and the check ignores it. `codex-linux-sandbox` did run, as `execve("/home/m/.codex/tmp/arg0-linux/codex-arg02HiHSt/codex-linux-sandbox", ...) = 0`. That path is a symlink under `$CODEX_HOME/tmp/arg0-linux/`, outside the install directory, and the rule accepts it only if it still resolves when the runner reads the trace. After one probe the directory `codex-arg09LbVfg` was already gone when I listed it. Another Codex process that shares that `CODEX_HOME` sweeps stale directories like this. After another probe the directory persisted. With the profile inside the fresh `HOME`, these links (`codex-linux-sandbox`, `apply_patch`, `applypatch`, each pointing to the Codex ELF) also appear in a directory that the "gain no ELF binary" scan covers. The row does not say whether that scan follows symlinks.
PROPOSAL: Correct the observed-trace sentence. State how the check treats Codex's `arg0-linux` links, for example by accepting those three names under the profile when their target is the resolved Codex install. Say that the ELF scan does not follow symlinks.

### R-30

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262), launcher preflight
EVIDENCE: The row requires `systemd-run --user --wait /usr/bin/true`, a `gdbus` session call, `xdg-open http://127.0.0.1:9`, `crontab -l` and `echo true | at now` to fail. It says this shows the wrapper removes those launchers. Most of these commands fail even without the wrapper. I ran them with no wrapper and no sandbox, as `env -i PATH=/usr/bin HOME=<scratch> <cmd>`. `systemd-run --user` returned rc=1 with "$DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined". `gdbus call --session ...` returned rc=1 with "Cannot autolaunch D-Bus without X11 $DISPLAY". `xdg-open` returned rc=3 because no text browser was found. `crontab -l` returned rc=1 with "no crontab for m". Only `docker info` succeeded. I then ran plain `codex sandbox` with no wrapper. `at now` failed with "Cannot open lockfile /var/spool/at/.SEQ: Permission denied" and `crontab -l` failed with a PAM refusal. `/proc/self/status` showed `NoNewPrivs: 1`, and both binaries are setuid root (`-rwsr-xr-x`). So Codex's no_new_privs blocks cron and at, not the wrapper, although the row lists them among "the launchers outside it that the wrapper removes". The wrapper itself does work. Under it, with `XDG_RUNTIME_DIR=/run/user/1000` and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus` set by hand, `systemd-run --user` and `gdbus` both failed with "No such file or directory". The preflight never sets those variables, so it does not show this. If a later wrapper change bound `/run/user/<uid>` back, these cases would still pass. If the preflight uses the scenario's one-directory `PATH`, a launcher that is not linked there fails with "command not found" and also passes.
PROPOSAL: Run each launcher case by absolute path, with `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` pointing at the real `/run/user/<uid>` paths. Require either a missing-socket or missing-key error, or a control run without the wrapper that succeeds. Credit cron and at to Codex's no_new_privs rather than the wrapper.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262), outer wrapper
EVIDENCE: The wrapper hides `/run` and `~/.ssh` but not `/tmp`, and this host runs a tmux server at `/tmp/tmux-1000/default`. I ran the row's wrapper (`bwrap --dev-bind / / --tmpfs /run --bind /run/systemd/resolve /run/systemd/resolve --tmpfs /home/m/.ssh -- env -i ...`) around the row's strace command. Inside it I ran `codex sandbox` on codex-cli 0.163.0 with `network_access`, `exclude_slash_tmp` and `exclude_tmpdir_env_var` set. In that setup, `/usr/bin/tmux display-message -p ...` printed `default-socket-reached /tmp/tmux-1000/default` with no environment variables. `tmux -S /tmp/tmux-1000/default run-shell -b '/usr/bin/uname -n > <scratch>/tmux-ran'` returned rc=0, and the file then held `fedora-43`. No trace file had an `execve` of `/usr/bin/uname`. Only the `tmux` argument string mentioned it. So `tmux new-session -d <browser>` would start a browser outside the traced tree with no setup at all. Agents commonly use tmux to keep a server running in the background. The row's limit sentence ("Another local service that runs programs on request would be outside it") is accurate, but on this host the gap is real and easy to fall into.
PROPOSAL: Also mount a tmpfs over `/tmp` in the outer wrapper, binding back only the runner and fixture directories. Add a tmux case to the preflight that must fail. If that cannot be done, name tmux in the limit sentence.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-11 `no-browser` (line 262); Design, Entry and routing (line 143)
EVIDENCE: The skill must resolve the verified binary and call `knowledge`, and `references/loop.md` says to "Stop and report when the result is ... `unreachable`". In `no-browser`, the HOME is fresh and holds only the profile, so the docs cache is empty. The R-29 fix also makes `/tmp` read-only inside the sandbox. I ran `env -i HOME=<fresh dir under /tmp> ... codex sandbox -c sandbox_mode='"workspace-write"' -c sandbox_workspace_write.network_access=true -c sandbox_workspace_write.exclude_slash_tmp=true -c sandbox_workspace_write.exclude_tmpdir_env_var=true -- /usr/local/bin/vh-adlc knowledge --repo ... --plugin-pin d8f07c9... --page conventions/documentation.md`. It returned `"result":"unreachable"` with "mkdir <HOME>/.cache: read-only file system". Without the sandbox, the same call with a fresh writable HOME returned `answered`. A HOME outside `/tmp` and outside the fixture is not a writable root either. The installer's download fallback writes to the same cache. So an assessment that follows the skill stops before it produces the source coverage and findings that AC-11 checks. With the blog runner's `--approve-for-me`, it may instead ask to escalate (see F-04).
PROPOSAL: Have the runner fill the fresh HOME's `vh-adlc` docs cache at the fixture's pin, and link the verified `vh-adlc` into the `PATH` directory. Alternatively, point `XDG_CACHE_HOME` at a pre-filled directory. Also assert that the run's `knowledge` call answered.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262); Test Plan preamble (line 248)
EVIDENCE: The row says the runner's `PATH` directory and trace files are safe because "its sandbox cannot write them". The scenarios start `codex exec` "as the blog runner does", and `tests/vh-adlc/blog/run.ts:75` passes `--approve-for-me`. `codex exec --help` describes that flag as "Route approval requests through automatic review using the workspace-write sandbox". An escalation that review approves runs outside Codex's sandbox. It is still traced, but it can write the runner directory, including the trace files and the `PATH` links.
PROPOSAL: Start `no-browser` with an approval setting under which commands never leave the sandbox. Otherwise, state that only sandboxed commands are kept away from the runner directory.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262), "the program inherited at `clone` or `fork`"
EVIDENCE: The row tracks each process's program and ancestry through `clone` and `fork` return values, but the strace command lacks `--pidns-translation`. Codex's sandbox gives commands their own PID namespace. In my trace of `codex sandbox -- /usr/bin/true`, the inner Codex process (trace file t.125867) logged `clone(...) = 2`, but the child's trace file was t.125907. With `--pidns-translation`, strace 7.3 printed `= 3 /* 173414 in strace's PID NS */`. Without that option, no process inside the sandbox can be linked to its parent.
PROPOSAL: Add `--pidns-translation` to the strace command, or state that a process with no known parent counts as not being a Codex `bwrap` descendant.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262), "whatever wrapper, interpreter or library starts it"
EVIDENCE: A process can enter a new namespace through `clone` flags and then `chroot`. The rule flags neither. Inside `codex sandbox` under the row's strace command, I ran a Python script that copied the static `/usr/sbin/ldconfig` to `/dev/shm/r/usr/bin/uname`. It then called `syscall(SYS_clone, CLONE_NEWUSER|SIGCHLD)` and, in the child, `chroot('/dev/shm/r')` followed by `execv('/usr/bin/uname', ...)`. The command printed `ldconfig (GNU libc) 2.42`. The trace held only `clone(..., flags=CLONE_NEWUSER|SIGCHLD) = 3` and `execve("/usr/bin/uname", ["uname", "--version"], ...) = 0`. Neither call matches any listed namespace call, and the path resolves inside `/usr` on the host. A browser renamed the same way would pass. This takes deliberate evasion.
PROPOSAL: Add `chroot` to the traced and flagged calls, and flag `clone` or `clone3` with any `CLONE_NEW*` flag outside the Codex `bwrap` chain. Otherwise, narrow the claim.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 `no-browser` (line 262), "the resolved Codex installation directory" and "a `PATH` of one runner-built directory"
EVIDENCE: The resolved binary is `/home/m/.codex/packages/standalone/releases/0.163.0-x86_64-unknown-linux-musl/bin/codex`. Codex adds that release's `codex-path` directory, which holds an ELF `rg`, to the front of the command `PATH`. Inside the sandbox, `env` printed `PATH=<release>/codex-path:/usr/bin`. If "installation directory" means the binary's own directory (`.../bin`), an agent's ordinary `rg` call executes `.../codex-path/rg`. That path is outside the allowed directories, so a clean run would fail.
PROPOSAL: Define the installation directory as the release directory that holds `bin/` and `codex-path/`. Note that Codex adds `codex-path` to the runner's one-directory `PATH`.

## Sources

- `plugins/vh-adlc/references/authority.md`, `references/loop.md`, both package manifests and `tests/vh-adlc/triage/discovery.test.ts` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- `feat/seo-agent` at `8e028c2`, its `references/seo.md`, skill, agent and validation note, and its independent PR review in this session.
- Stackweaver `agents/seo.md` at branch `docs/seo-performance-followup-20261105`, contained in `origin/main`.
- Local Codex session `rollout-2026-10-27T15-42-56-01a17dd0-782c-73d2-8843-471b64567a87.jsonl`: entries at 2026-10-30T01:33, 13:19, 13:20 and 2026-11-07T21:27 (the request and the PR's origin); 2026-10-27T14:49 (the v3, balance, v4 and MCP probe); 2026-11-01T23:01 (the `Apikey` MCP call returning `no_data`); 2026-11-03T19:44 (the `Bearer` client's HTTP 401); and the MCP server instructions and `execute_report` schema (error codes and `api_units`).
- Stackweaver `docs/internal/plans/marketing/semrush-visibility-baseline-2026-10-29.md` on `origin/main`, lines 13 and 27: the MCP route working, legacy endpoints not retried, and 210 reported units.
- Stackweaver's ignored, credential-free archive `.tmp/seo-research/semrush-visibility-2026-10-29/`: the `initialize`, `tools/call` success and `no_data` envelopes.
- [Semrush SEO API overview](https://developer.semrush.com/api/v3/seo/overview/): the API key is passed as the `key` query parameter, and the v3 error list (`ERROR 50`, `ERROR 110` to `ERROR 135`, the `ERROR 402` variants and `ERROR 429`) the outcome table maps.
- [Semrush backlinks reports](https://developer.semrush.com/api/v3/seo/backlinks/): Backlinks overview costs 40 units per request and Authority Score profile 100 units per request, so both are priced per request and left off the helper's list.
- [Semrush overview reports](https://developer.semrush.com/api/v3/seo/overview-reports/): Domain Overview (all databases), the v3 `domain_ranks` report, costs 10 units per line, or 50 for historical data.
- [Semrush domain reports](https://developer.semrush.com/api/v3/seo/domain-reports/): 10 units per line for Domain Organic Search Keywords, or 50 for historical data.
- [Semrush API unit balance](https://developer.semrush.com/api/v3/get-started/api-units-balance/): the free `countapiunits` balance request and per-line or per-request pricing.
- `tests/vh-adlc/check.test.ts:224-232` and `plugins/vh-adlc/references/lifecycle.md:75-81` at `bda1a8771a837cb028df3cb4d125f9c7da2735ff`.
- Engineering docs at `d8f07c9dd69038375a535af8ad586086688f85ab`: `conventions/feature-documents.md`, `guides/feature-document-template.md`, `guides/humanize-prose.md`.
