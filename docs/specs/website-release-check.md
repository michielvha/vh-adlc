---
status: draft
status_description: "Back to draft to record two owner decisions from 2026-11-23: unread response bodies and a Chromium-only delivery. T1 to T3 are done; the T4 collector waits for its full-suite run."
branch: feat/website-release-check
issue: null
goal: "Run repeatable website release checks against a locally served production build and an owned deployed URL without a hosted scanning service."
covers:
  - plugins/vh-adlc/skills/vh-adlc-website-check/
  - plugins/vh-adlc/references/website-check.md
  - plugins/vh-adlc/scripts/website-check/
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - plugins/vh-adlc/scripts/seo/
  - tools/seo-evidence/
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - tests/vh-adlc/
---

# Plan: Website release checks

## Context

### Owner summary

Run the same browser smoke checks against the local production build and the deployed site. The command runs directly from a terminal or pipeline. A vh-adlc skill reads its results, explains failures, and points to the project code and deploy configuration that own each fix. Each adopter supplies a short profile with a route, a page assertion and any site-specific expected responses. Stackweaver adopts the shared check in a separate change after its release, starting in report mode. Other projects can start with just a public homepage and add coverage as needed.

Start with Playwright, the existing SEO evidence toolkit, and the project's installed secret scanner. Use axe through Playwright for automated accessibility checks. The browser check can ship first. The optional SEO adapter ships once the shared SEO feature releases its analyzer bundle. For configured deployed routes, check declared headers from the observed HTTPS response. The shared code supplies browser event collection where an existing runner lacks it, tool adapters, and a consistent report. Browser smoke coverage requires Playwright and a supported browser. The minimum profile uses Chromium in a runner with scoped network access. Accessibility, SEO analysis, secret scanning and deployed header checks can each be enabled separately. The command exits with an error if required evidence is incomplete. A completed report-only run can contain findings and still exit successfully. Enforcement additionally fails on violations of required rules.

The Stackweaver comparison already shows why the two targets need their own evidence. Both browsers saw the deployed homepage return 200 and make one signed-out session request that returned 401. Chromium reported that request as a console error. The clean local build served by its pinned Nginx image had a different failure: its default API URL points to localhost, and the page's policy blocked session and health requests. The local run used default configuration and the deployed artifact identity is unknown. The original scanner's full finding counts were not reproduced. Chromium's console diagnostic stays visible even when the HTTP response has an expected verdict.

### Background

The local evidence directory is `/tmp/stackweaver-release-check.HSTmoi/`. The build output is in `build.log` and browser observations are in `nginx-built.jsonl`, `built.jsonl` and `deployed.jsonl`. The capture removed URL queries and omitted request methods and redirect chains. The pinned client source establishes the session request method. The proposed exception still needs a proof with the full request tuple.

- Stackweaver source was exported from fetched `origin/main` at `72e48ed577af958034d6aa598e2835ef36ccdb8c`. `npm run build` exited 0. `frontend/Dockerfile` uses that build command and a pinned Nginx image. The browser run mounted the resulting files and the build's generated Nginx configuration into that image, with no injected deploy settings.
- Fresh anonymous Chromium 158 and Firefox 159 visits waited for the load event and observed seven more seconds. Local Nginx returned 200 in both and logged 12 and 7 console errors respectively. The errors name the policy blocking `http://localhost:8022/auth/session` or `/health` and follow-on fetch failures. There were no observed 401 responses in that Nginx run. The plain static server control returned one 401 per engine from the local API, which the browser could reach without the Nginx response policy.
- The deployed homepage returned 200 in both engines and one 401 each from `https://stackweaver.sh/auth/session`. Chromium logged one console error for that response. Neither engine reported an uncaught page error or transport failure. No other 401s were observed. This is one visit per engine per measured target.
- In that Stackweaver revision, `frontend/src/config.ts:45` defaults the API URL to localhost and `frontend/src/lib/zitadel.ts:96-98` maps a session 401 to an anonymous session. `e2e/tests/public-seo.spec.ts:388-389` exercises public browser navigation and collects page errors. The next line intercepts the session request and returns a fixture 401. Reuse its runtime and compatible assertions in a separate anonymous smoke project with real responses. `scripts/verify-local.sh:209-221` already invokes Gitleaks for repository changes.
- In vh-adlc at `84e59c898cbdb0bd4e76bd207b30a5356b495b32`, `tools/seo-evidence/README.md:25-32` describes the offline snapshot and inspection commands. Its policy section at line 125 defaults to report only. Reuse its bundle and finding formats for the evidence it already handles.

## Scope

Check explicitly configured routes on two targets: the adopter's locally served release artifact and its owned deployed site. Cover browser startup, required resources, automated accessibility, technical SEO metadata and links, built files for secrets, and deployed TLS, redirect, and header observations. The tool reports on public routes. Authenticated journeys, where relevant, belong to the adopter's existing test suites and do not count as covered by the public run. Scope excludes exploit probes, guessed endpoints, external scoring parity, ranking claims, publication, hosted monitoring and Lighthouse integration. Adopters can run Lighthouse in their own workflow.

## Design

- Provide a script in the shared plugin with two explicit modes, build and deployed. Each consumes a checked-in YAML profile that selects origins, routes, capabilities, required rules, and precise expected responses. The adopter owns how the production artifact is built and served. Reuse its configured Playwright runtime and compatible page assertions. Release runs use a dedicated anonymous browser scenario with real responses. They cannot inherit fixture mocks, seeded session state or authenticated setup. Traffic confinement runs below Playwright and does not fabricate application responses. A minimum profile selects one route and one visible page assertion. An existing Playwright suite can call the shared runner from a dedicated project. For a new adopter, the plugin provides a generic anonymous smoke scenario driven by the profile, run with a pinned Playwright runtime and Chromium installed through documented repository setup. Firefox is opt-in for the release check. Optional adapters are disabled unless selected. A disabled adapter is not applicable to this run. A selected adapter with a missing prerequisite is skipped with a reason. Report mode is the default. Enforce mode requires an explicit policy. The browser check is required in both modes. A profile may make selected applicable adapters required. Reject policies that require disabled or inapplicable checks before starting.
- Capture each selected page in a fresh browser context. Attach Playwright listeners before navigation for console errors, uncaught page errors, request failures, completed requests and HTTP responses. Track responses and terminal events by Playwright Request identity. Only `requestfinished` or `requestfailed` is terminal. Keep the observed HTTP status where present, and report a failed body transfer as a failure even after successful headers. Install a document initialization listener for `securitypolicyviolation` before page scripts run. Record enforced violations as blocking observations even when no network request was issued. Report-only CSP violations are advisory. Keep ordinary network failures distinct. Record browser version, route, request method, resource type, sanitized URL and source location, and observed status or error text. Group repeated events while preserving their count. Each route names a visible assertion, any required requests by method and URL, and a positive deadline covering navigation and observations. Start the deadline immediately before navigation. Require the main-frame navigation to reach the browser load event and the visible assertion to succeed. Each required request matches the method and exact normalized URL before sanitization. Record every matching terminal outcome within the observation window. A failed attempt makes that rule fail even if a later attempt succeeds. Track the start of each matching attempt through Playwright’s request event. Complete only after the visible assertion and load event, at least one terminal attempt per required request, and no matching attempts left in flight. Stop at completion or the deadline and record the observation boundary. A completed error response can fail its check. A required request without a terminal observation by the deadline makes coverage incomplete. If navigation succeeded and the assertion is false at the deadline, record an assertion failure.
- Classify a declared anonymous session response as expected only for its exact method, origin, path, resource type, status and anonymous context. The separate Stackweaver adoption will declare that its deployed profile allows only the same-origin fetch `GET https://stackweaver.sh/auth/session` with status 401 in a fresh anonymous context. Match the full normalized URL including query, with no redirect and no query in this exception. Other profiles declare their own exceptions, including any local equivalent. Apply the exception only to the matching HTTP response. Console messages and page errors keep separate records. Console messages without reliable request identity remain diagnostic observations with no attribution to the expected response. Required failures come from typed browser or HTTP observations and assertions, including captured Content Security Policy violations and uncaught page errors. Keep the sanitized observation and reason. A script returning the same status, a changed endpoint status, or a CSP-blocked connection remains actionable. A public-only profile explicitly shows login and private API journeys as outside its scope.
- Deliver the base check without an SEO adapter when the analyzer is not in the marketplace release. A follow-up enables SEO only after the installed plugin contains the canonical `plugins/vh-adlc/scripts/seo/evidence.js` build with licenses and provenance. The dependency design is in the [SEO packaging spec at 774ce7fa](https://github.com/michielvha/vh-adlc/blob/774ce7fa59b99bc8c82c583091121226c86a7a7f/docs/specs/seo-assessment.md#packaged-evidence-analysis). The enabled adapter uses Bun to run that bundle. It builds and validates a native bundle from actual target observations, including URL scope, requested and final URLs, status, media type, permitted headers and body digests. Uncollected destinations remain unknown. Map partial analysis to incomplete coverage and failed analysis to a tool error. Use Playwright with axe for automated accessibility and reuse the adopter's pinned Gitleaks version and config. Run its directory mode on the explicit built artifact root with redacted JSON and a distinct configured finding exit code. Validate the report and classify scanner errors as incomplete evidence. For deployed headers, evaluate the selected route’s final main-document HTTPS response already observed by Playwright. Read only the header entries the selected browser reports through Playwright’s `headersArray()`. A browser may combine headers before exposing them. Reports name the browser and present these checks as observations from that browser. They do not establish how many field lines were sent on the wire. Compare names case insensitively. A presence rule passes if at least one matching entry exists. An exact-value rule passes only if exactly one matching entry exists and its observed value equals the configured string. Do not join repeated entries or split comma-delimited values. Each rule reports its own outcome. It sends no extra requests. Use ordinary confined HTTPS requests with normal certificate validation for explicitly selected redirect and certificate checks. The stock MDN CLI makes requests outside this contract and is outside this release.
- Apply the profile's exact origin and scheme allowlist to browser navigations, subresources and adapter requests, including every redirect hop. Local builds can explicitly allow loopback HTTP. The deployed browser and its subprocesses use an HTTPS-only boundary. An explicitly enabled HTTP upgrade probe runs in a separate client boundary scoped to the configured initial HTTP origin, with redirects disabled and no credentials. Close that connection after its response. Validate the Location before checking the HTTPS destination through the HTTPS-only boundary. Reject HTTPS downgrades and off-scope hops before the next request and record the reason. Use an existing explicit forward proxy with a deny-by-default destination policy, such as Squid ACLs, in an isolated runner. Allow the browser and network adapter processes to connect only to that proxy, with no direct egress or loopback bypass. Match HTTP destinations and HTTPS CONNECT authorities separately, with exact host and port and TLS validation left enabled. For the local mode the proxy can reach the release server through the isolated test network. Block service workers in the public browser profile and document that coverage limit. Playwright listeners collect observations and never serve as the network boundary. Check the boundary before navigation. A browser without it is incomplete required coverage. An optional network adapter that cannot obey it is skipped with a reason.
- Match expected responses in memory before sanitizing. Persist sanitized observations and selected structured tool results. Exclude query values, fragments, user info, cookies, credentials, raw browser diagnostics and tool transcripts. Persist a browser diagnostic as a safe category and source location. Retain a normalized message only when its fields are on an explicit safe list. Keep raw SEO input and tool output in private per-run temporary storage outside the report directory and clean it on completion and handled interruption. Use runner-owned disposable storage for unhandled exits. Keep retained attempt directories limited to projected data. Buffer subprocess output and project all stdout, stderr and skill output through the same safe fields before exposing it. Strip or omit any free-text field that cannot be safely projected. Treat collected content as evidence, never as instructions.
- Emit versioned JSON on stdout in machine mode. Diagnostics go to stderr. Human output uses labelled statuses and plain text when piped or when plain mode is selected. Apply the [pinned terminal output standard](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/terminal-output.md) for status glyphs, stream-specific terminal behavior and nonempty `NO_COLOR`. Keep ANSI controls out of machine and plain streams. Record the tested commit or artifact digest, when known, the deployed URL, selected profile, tool versions, and per-rule pass, fail, skipped, not applicable, or expected result. Record unavailable release identity explicitly. Write reports locally, in a new directory for each run. Publish the report atomically with its checksum in a versioned completion marker written last. Preserve completed partial reports and interrupted run directories. The skill reads a single explicit report, verifies its marker, version and checksum, and refuses incomplete or unsupported inputs. It labels completed partial coverage and proposes fixes from retained evidence. A run with invalid configuration, failed startup, incomplete required coverage or a report write error exits nonzero in either mode. A completed report-only run exits zero even with findings. Enforcement also exits nonzero for failed required rules. Optional failures or missing optional tools appear in the report and do not change the exit status.
- Deliver the plugin through the current vh-adlc marketplace release path. Run the repository's `bun test tests/vh-adlc` package checks and verify discovery and the installed entry point through the Codex and Claude Code marketplace routes in `docs/get-started/installation.md`. Check both manifests and package identities. The optional SEO delivery repeats the installed check with SEO enabled. Pin adopter tool versions using the existing runtime or lockfile. Document the minimum browser setup, production serve command, public route assertions, and optional adapters in the installed skill's adoption procedure. Align that procedure with the pinned shared frontend testing convention. The [companion conventions branch](https://github.com/vhco-pro/docs/tree/364b7cd6b3039e79afac6023bd9f33498c64c543) extends `conventions/frontend-testing.md` and `guides/onboard-a-repository.md`. Consumers adopt the reviewed convention through their own pin updates. Allow an adopter to opt out by removing the check invocation and its profile. Deliver the shared plugin against generic fixtures. Adopt it separately in Stackweaver after release, in report mode. That consumer change must verify the real configured local build and deployed origin and retain their reports. Enabling a Stackweaver gate is a separate change.

### Terms

| Term | Meaning |
| --- | --- |
| Build | Local production artifact served with the adopter's release configuration. |
| Deployed | The selected running release at an owned origin. |
| Report only | Completed observations are reported without treating findings as a policy failure. |
| Enforcement | Apply an explicitly selected policy to the observed results. |
| Pass | The check observed its required result. |
| Fail | An observation contradicts the check. |
| Skipped | The selected check lacks a prerequisite or sufficient evidence. |
| Not applicable | The check is disabled or outside the selected target's capabilities. |
| Expected | An observed response matches the target's complete exception rule. |

## Acceptance Criteria

- [ ] AC-01: A project with either an existing Playwright suite or the documented minimum browser setup can run the same configured public route checks against a production build and its deployed origin without an external scanning service or model.
- [ ] AC-02: A known anonymous session response remains visible as expected, while a blocked connection, missing or failed required asset, or unexpected status is reported with enough evidence to locate it.
- [ ] AC-03: The command, report and skill use the glossary meanings for modes and outcomes. The report identifies named rule outcomes from enabled accessibility, certificate and header checks, and what coverage was unavailable or disabled. Report-only mode records findings without blocking a completed run. Both modes reject invalid configuration and incomplete required coverage. Enforcement additionally rejects failures of required rules.
- [ ] AC-04: A project can invoke the installed skill to interpret an existing report and trace its findings to sanitized evidence without rerunning checks. The skill rejects unfinished or unsupported reports.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run both modes against a locally served production fixture and an owned HTTPS deployment fixture. Check that both execute the same route assertions and that deploy-only observations are present only in the deployed report. Prove the same one-route smoke profile works in a minimal static fixture with no existing Playwright suite and no optional tools. In an existing-suite fixture, show that the release scenario observes a real backend failure masked by the ordinary mocked test. Run with third-party scanning services unavailable. For each browser enabled by the delivery, confirm from destination logs that navigation redirects, subresource redirects, a service-worker attempt and an HTTPS downgrade cannot reach excluded destinations. Confirm allowed redirects still load. In one configured deployment fixture, let the separate HTTP probe start a successful upgrade, then return an HTTPS redirect to that same initial HTTP origin. Use the HTTP destination log to prove only the initial probe reached it. A missing confinement boundary fails browser coverage before navigation. An adapter unable to honor the profile is skipped. |
| AC-02 | Serve an anonymous session 401, a required script returning 401, a wrong query or method with a 401, a redirected 401, and a page with a connection refused by CSP. Also emit an unrelated console error and make a different request to the same URL in that visit. Assert that only the exact HTTP observation is expected and console diagnostics remain independently visible with sanitized fields. Include a delayed resource failure, a required request that never appears, a false assertion, and a required request returning 503 and then 200 before load and the visible assertion complete. Verify both response records and a failed rule. Send 200 headers for a required fetch and then abort its body. Verify a failed rule. In a separate run start two matching attempts before the assertion completes. Complete the first and hold the second body past the deadline. Verify incomplete required coverage, even though the first attempt succeeded. Check enforced and report-only CSP dispositions and a separate transport failure. Assert distinct outcomes. Include a synthetic sensitive value in a request query and echoed browser and adapter diagnostics. Verify its absence in stdout, stderr, markers, reports, retained artifacts and skill output after a tool failure or interruption while the observations remain traceable. Check Chromium and Firefox differences without depending on identical console wording. |
| AC-03 | Exercise real outputs from the enabled tools. Detect a known axe violation, distinguish certificate validation failure from reachability failure, and retain known passed and failed header outcomes by rule name. Verify a Content Security Policy presence check. Confirm that the pinned browser fixture exposes two matching entries through Playwright, then verify the exact-value rule fails even when one entry equals the configured value. In a separate fixture, confirm the browser exposes a single comma-delimited value, then verify that only the entire observed string matches. If a browser combines duplicates, verify its verdict against the actual observed entries. Compare destination logs to the same fixture with header rules disabled. Verify the header checks sent no extra requests. Disable each adapter in turn and verify a not applicable result. Put a synthetic secret only in the built output and exercise a Gitleaks execution error. Assert distinct outcomes and redacted findings. Check status labels and glyphs on a terminal and plain redirected streams. Test absent, empty and `NO_COLOR=0` in terminal mode. Verify JSON stdout and separate stderr for success, failure, skipped and partial runs. Verify both modes for passed checks, findings, optional failure, missing optional tools, missing required browser, an inconsistent policy, interrupted collection and a failed report write. Assert coverage and exits. Verify concurrent attempts do not share output directories and that interruption before the marker leaves no readable completed report. |
| AC-04 | Run the package checks and discover and invoke the installed smoke entry on both marketplace routes without a source checkout. For base delivery, verify the browser check works without SEO and reports the adapter unavailable when selected. For SEO-enabled delivery, execute the installed analyzer through the release collector in both targets using different HTML. Check a known metadata finding and unknown coverage for an uncollected link. Run a real analyzer partial-result case and a failed invocation. Verify separate incomplete and tool-error outcomes and nonzero exits when SEO coverage is required. Give the skill a saved fixture report and verify its findings cite the sanitized records and identify skipped checks. Pass an interrupted report, a replaced report with a mismatched checksum and a report with an unsupported version. Verify that none is interpreted and that a completed partial report is identified as partial. |

## Tasks

- [x] T1 `tests/vh-adlc/website-check/confinement.test.ts` and `tests/vh-adlc/website-check/fixtures/` - run the same route proof in local and deployed modes, with real responses from both a minimal project and an existing-suite fixture. The checks fail before the runner exists and include the accepted destination-log confinement proofs (AC-01)
      Evidence: at 40d0564, `bun test tests/vh-adlc/website-check/confinement.test.ts` on Bun 1.4.3 passed the two fixture checks and failed the five smoke checks with ENOENT for the missing runner; /tmp/stackweaver-release-check.HSTmoi/chromium-t1-red.log.
- [x] T2 `plugins/vh-adlc/scripts/website-check/profile.ts` and `plugins/vh-adlc/scripts/website-check/runner.ts` - make T1 pass with the minimum pinned Chromium runner, accepted transport isolation and scoped upgrade check. Record the runner prerequisites and observed coverage in the fixture results (AC-01)
      Evidence: at 6d2385f on CI-pinned Bun 1.4.5, `tests/vh-adlc/check.test.ts`, the confinement test and `tests/vh-adlc/docs-drift/evidence-input.test.ts` passed 111 of 111 with Chromium 156 behind Bubblewrap and Squid 7.5. The excluded destination logged no smoke request and the HTTP destination logged only `GET /upgrade`; /tmp/stackweaver-release-check.HSTmoi/website-ci-bun-focused.log. The confinement test passed 7 of 7 again on 2026-11-23; /tmp/stackweaver-release-check.HSTmoi/website-t3-red.log. The full `bun test tests/vh-adlc` selection covered all 275 files with `GOWORK=off` on Bun 1.4.3 but was not one clean run: a triage fixture timed out under parallel load and passed alone, and a docs-drift filename case fails on Bun 1.4.3 and passes on 1.4.5. Prerequisites are in `tests/vh-adlc/website-check/fixtures/README.md`. Hosted CI does not install them yet.
- [x] T3 `tests/vh-adlc/website-check/observations.test.ts` - exercise the exact anonymous exception, CSP dispositions, delayed and overlapping requests, body errors and deadline cases in the Test Plan. Observe the missing observations or incorrect rule outcomes before adding the collector (AC-02)
      Evidence: on Bun 1.4.5 against the T2 runner, `bun test tests/vh-adlc/website-check/observations.test.ts` had 0 pass and 6 fail. The fixture received every request, and each case failed because the runner returned no typed response, CSP or transport records, rule outcomes, coverage or boundary; /tmp/stackweaver-release-check.HSTmoi/website-t3-red.log. The Test Plan's Chromium and Firefox comparison stays untested because no task builds a confined Firefox runner.
- [ ] T4 `plugins/vh-adlc/scripts/website-check/observations.ts` and `plugins/vh-adlc/scripts/website-check/runner.ts` - make T3 pass with typed terminal observations, independent console records and target-specific exception matching (AC-02)
- [ ] T5 `tests/vh-adlc/website-check/report.test.ts` and `tests/vh-adlc/website-check/adapters.test.ts` - run the accepted output, policy, interruption, sanitization and non-SEO tool fixtures. Observe failures for missing report behaviors and unsupported adapters (AC-02, AC-03)
- [ ] T6 `plugins/vh-adlc/scripts/website-check/report.ts`, `cli.ts` and `adapters.ts` in the same directory - make T5 pass with the plain and JSON streams, local completion marker, gate behavior and selected accessibility, built-file and deployed checks (AC-02, AC-03)
- [ ] T7 `tests/vh-adlc/website-check/installation.test.ts` - observe missing discovery and failed installed entry-point checks using both marketplace routes with the source checkout absent. Exercise completed, partial, altered and unsupported reports (AC-04)
- [ ] T8 `plugins/vh-adlc/skills/vh-adlc-website-check/SKILL.md`, `plugins/vh-adlc/references/website-check.md`, and the covered manifests - make T7 pass through both installed entry points. Document the minimum setup and verify the base release reports SEO unavailable if selected without its dependency (AC-01, AC-04)
- [ ] T9 `tests/vh-adlc/website-check/seo.test.ts` - for the SEO-enabled delivery only, after the analyzer is available in the supported marketplace package, exercise the installed two-target bundle, incomplete analysis and analyzer failure proofs. Observe failure without the adapter (AC-03, AC-04)
- [ ] T10 `plugins/vh-adlc/scripts/website-check/adapters.ts` and `plugins/vh-adlc/references/website-check.md` - for the SEO-enabled delivery only, consume the installed canonical analyzer and make T9 pass without a source checkout (AC-03, AC-04)

## Open Questions

None. The owner selected report mode first and approved explicit run outcomes and bounded observation, scoped and sanitized evidence, and a separate Stackweaver adoption. Lighthouse remains outside the shared tool.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `24e61d66d71bbc1562f8208edb9bb41035ffaa0f` | unknown | procedural | One blocking, twelve should-fix and one nit |
| 2026-11-20 | R-2 | spec | `1069bcf989934141d80b610bd387d2c60f9fdd49` | unknown | procedural | One blocking and seven should-fix findings |
| 2026-11-20 | R-3 | spec | `e896b1047cfbc109f9211adb4bd1972584e6802d` | unknown | procedural | One blocking and three should-fix findings |
| 2026-11-20 | R-4 | spec | `f2dfa03f9fdf0eab4a00eb649f47b90a4a855145` | unknown | procedural | Two should-fix findings |
| 2026-11-20 | R-5 | spec | `754c9507ebae9a4045dbfa72045ef15f97a274ba` | unknown | procedural | One should-fix finding |
| 2026-11-20 | R-6 | spec | `e7a9d2857b490a6fd5bdaecdee8e3f5c42927388` | unknown | procedural | One blocking finding |
| 2026-11-20 | R-7 | spec | `ffe3077c7269d14ebe45781cd1a2e2eed9ae95f5` | unknown | procedural | NO FINDINGS |
| 2026-11-20 | R-7 | spec | `ffe3077c7269d14ebe45781cd1a2e2eed9ae95f5` | n/a | n/a | accepted by owner |
| 2026-11-21 | R-8 | spec | `46249c1b7f9232cd5afa999301da044b06960795` | unknown | procedural | NO FINDINGS |
| 2026-11-22 | R-9 | spec | `287b10fbba86c66b86df971be37397b017e0a51a` | unknown | procedural | NO FINDINGS |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context / Background line 33, Design lines 42-44, Acceptance Criteria AC-01 and AC-02, Test Plan AC-01 and AC-02
EVIDENCE: Stackweaver at `72e48ed5`, `e2e/tests/public-seo.spec.ts:388-391`, intercepts every matching `/auth/session` request and fulfills it with 401. Running that existing scenario as specified can report an expected 401 when the production endpoint was never reached. The fixtures in the Test Plan do not exercise the existing-suite path.
PROPOSAL: Reuse the existing Playwright runtime and compatible assertions. Require release scenarios to collect real responses without interception or authenticated setup, and prove the integration with an existing-suite fixture whose smoke scenario observes a backend failure the ordinary mocked test would mask.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary line 26, Design lines 43-44, Acceptance Criteria AC-02, Test Plan AC-02
EVIDENCE: `deployed.jsonl` records one Chromium HTTP 401 and one console error at the same URL. Playwright's `ConsoleMessage` provides location, page, text and time but exposes no request identity, HTTP method, resource type or status. The draft lets the exception affect related console errors without defining what establishes that relationship. [Playwright ConsoleMessage API](https://playwright.dev/docs/api/class-consolemessage)
PROPOSAL: Specify the console verdict when a matching network response also produces a console error, including the fallback when the correlation cannot be established. Exercise a matching fetch alongside an unrelated console error and a different request to the same URL in the same visit.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary line 24, Context / Background line 34, frontmatter covers, Design lines 45 and 47, Test Plan AC-03 and AC-04
EVIDENCE: `.agents/plugins/marketplace.json:17-22` and `.claude-plugin/marketplace.json:17-20` install `plugins/vh-adlc`. The SEO CLI and its lockfile are outside that directory under `tools/seo-evidence/`. Pinned `conventions/delivery.md:111-117` requires the affected artifacts and actual build and publication paths to be named. AC-03 can consume outputs made from a checkout, while AC-04 can pass by reading a prewritten report from a fresh install.
PROPOSAL: Name the supported distribution or separately pinned installation path for the existing SEO toolkit, enumerate any affected packaging entry points in `covers`, and exercise the enabled SEO check from the installed product with no source checkout.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary line 24, Context / Background line 33, Scope line 38, Design line 45, Test Plan AC-03
EVIDENCE: Stackweaver's `scripts/verify-local.sh:209-221` uses Gitleaks for staged changes and Git history. Reusing that invocation as the design directs can produce a pass without scanning the built files. Current Gitleaks documentation identifies a separate file and directory mode and an exit code shared by findings and execution errors by default. [Gitleaks directory mode and exit codes](https://github.com/gitleaks/gitleaks)
PROPOSAL: Reuse the adopter's Gitleaks version and configuration with a pinned invocation that scans the explicit built artifact. Require an artifact-only synthetic finding and a scanner error in the proof, with distinct report outcomes and redacted evidence.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary lines 22 and 24, Scope line 38, Design lines 42 and 45-46, Acceptance Criteria AC-03, Test Plan AC-01 and AC-03, Open Questions
EVIDENCE: The report-only status is settled for Stackweaver, while the YAML can independently select capabilities and required rules. The design defines disabled and missing-tool outcomes without stating what happens when policy requires a disabled or inapplicable check, a tool returns unknown coverage, or a nonrequired check fails. It also leaves the exit status of report-only runs with findings or execution errors unspecified.
PROPOSAL: Record the policy and exit outcomes for report-only and enforced runs, including inconsistent profiles, optional failures and required checks that did not complete. Test those states explicitly, including that a missing required browser cannot produce a successful enforced run.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Background lines 30-32, Scope line 38, Design lines 42-43, Acceptance Criteria AC-01 and AC-02, Test Plan AC-01 and AC-02
EVIDENCE: `observe.cjs` captures events for seven seconds after the load event. The design supplies no browser observation boundary, timeout outcome or rule for recognizing a required resource that was never requested. A correct visible heading can become ready before a delayed required asset fails, and a collector can close the page before it observes that failure.
PROPOSAL: Define how each route identifies required resources, when its observation ends, and how timeout, absent required resources and assertions affect coverage. Prove a delayed failure and a required resource that is never requested.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary lines 22 and 24, Scope line 38, Design lines 42, 45 and 47, Acceptance Criteria AC-01 and AC-03, Test Plan AC-01 and AC-03, Open Questions
EVIDENCE: Mode selection and the profile's origins do not bound redirect following or active adapter requests. MDN's local CLI accepts a host and can make unencrypted requests. A profile configured for an owned deployment can therefore check another origin or follow a downgrade under a reasonable implementation of the draft. [MDN HTTP Observatory CLI](https://github.com/mdn/mdn-http-observatory/blob/main/README.md#running-a-simple-scan-from-the-command-line)
PROPOSAL: Define allowed origins and schemes for configured and tool-initiated requests, including how to record off-scope redirect destinations without treating them as covered. Test an off-scope redirect and the missing or unsupported deployment adapter path.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary lines 22 and 24, Design lines 43-46, Acceptance Criteria AC-02 to AC-04, Test Plan AC-02 to AC-04
EVIDENCE: The design sanitizes the URL field and calls for original observations, browser error text, SEO HTML and tool outputs to be retained. `observe.cjs` demonstrates that sanitizing a location is a separate operation from retaining `m.text()` or `e.message`. MDN's local JSON can also contain response headers. AC-02 only checks sanitized URLs and does not detect the same sensitive data in adjacent fields or tool artifacts. [MDN HTTP Observatory CLI result](https://github.com/mdn/mdn-http-observatory/blob/main/README.md#running-a-simple-scan-from-the-command-line)
PROPOSAL: Specify what the runner persists and what it removes from request evidence, free-text diagnostics and adapter output. Prove that a synthetic sensitive value in a query and mirrored diagnostic is absent from saved reports and skill output while the finding remains traceable.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary line 22, Design lines 46-47, Acceptance Criteria AC-04, Test Plan AC-03 and AC-04
EVIDENCE: Separate directories protect parallel attempts, but the draft does not define how a reader recognizes an in-progress, interrupted, ambiguous or unsupported-version report. `tools/seo-evidence/README.md:152-169` already distinguishes partial capture from unfinished output and refuses unfinished artifacts. The skill proof only supplies a readable saved fixture.
PROPOSAL: Define when a shared report becomes readable, how partial evidence is identified, and how the skill handles incomplete and unsupported reports. Use the existing completion convention where it fits and test interruption while a report is being read.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary line 22, Design lines 42, 44 and 47, Acceptance Criteria AC-01 to AC-03, Test Plan AC-01 to AC-03, Open Questions
EVIDENCE: The document repeatedly says Stackweaver starts in report-only mode and declares what its deployed profile allows. All affected paths in `covers` are in vh-adlc, and none of the proof rows runs an actual Stackweaver profile. A shared-only implementation can meet every listed criterion without delivering the claimed first adoption.
PROPOSAL: Name the Stackweaver adoption as a separate consumer change with its own verification, or include the exact consumer deliverable and a proof that its first build and deployed runs produce report-only results with the approved exception.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary line 22, Design lines 42 and 46-47, Acceptance Criteria AC-03, Test Plan AC-03
EVIDENCE: Pinned `conventions/terminal-output.md` defines noninteractive plain output, status vocabulary, machine output streams and verification. The design only asks for JSON and a short human summary, and the proof does not check output behavior on a pipeline or separation between machine output and diagnostics.
PROPOSAL: State the new command's streams, plain output and stable status contract using the pinned convention. Extend AC-03 proof to capture representative success, failure, skipped and partial outcomes with redirected output.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary line 24, Scope line 38, Design line 45, Test Plan AC-01 and AC-03, Open Questions, Sources line 86
EVIDENCE: The design includes Lighthouse CI conditionally, but no acceptance test establishes its adapter or local-only operation. Lighthouse CI supports uploads to a server and temporary public storage as well as saving to the filesystem. The same draft excludes publication and hosted services. [Lighthouse CI upload configuration](https://googlechrome.github.io/lighthouse-ci/docs/configuration.html#upload)
PROPOSAL: Treat Lighthouse CI as a separate optional adopter workflow, or explicitly scope a local-only integration and add proof for its included behavior.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Design lines 42 and 46, Acceptance Criteria AC-03, Open Questions
EVIDENCE: Pinned `conventions/feature-documents.md`, Open questions, requires introduced or changed user-facing terms in a glossary row held to by a criterion. The spec introduces `build`, `deployed`, `report only`, `skipped`, `not applicable` and `expected` as user-facing terms without a glossary or a criterion that holds the command, report and skill to their meanings.
PROPOSAL: Record the user-visible mode and outcome names with their meanings. Require AC-03 to verify consistent meanings across the command and report.

FINDING: F-14
KIND: factual
SEVERITY: nit
WHERE: Context / Owner summary line 26, Context / Background lines 30-32, Design line 47, Sources lines 80-81
EVIDENCE: The captures reproduce the counts, and the build log shows successful build output. The draft links the current homepage instead of identifying the captured records by path or a reproducible evidence reference. `observe.cjs` removes query strings and does not record method or redirect history, so the capture alone cannot attest the entire proposed exception tuple. The companion draft is also named without a path or revision.
PROPOSAL: Cite the captured artifacts and companion convention revision, and identify the method as supported by pinned source while the historical capture leaves query and redirect details unavailable.

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Scope line 43, Design lines 47 and 51, Acceptance Criteria AC-01, Test Plan AC-01
EVIDENCE: R-1 F-07's revision requires preventing contact with every off-scope redirect hop, while the real-response design says release scenarios cannot inherit route interception. Playwright request listeners observe traffic. The page route handler is called only for the first URL in a redirect chain, and service-worker-handled requests can bypass browser context routing. A browser check built from the specified listeners and ordinary route handling can contact a destination the owner excluded. [Playwright page routing](https://playwright.dev/docs/api/class-page#page-route) [Playwright browser context routing](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)
PROPOSAL: Specify a pre-request enforcement boundary supported by each enabled browser, distinguish that boundary from inherited fixture mocks, and make failure to establish confinement incomplete required coverage. Prove from destination logs that navigation redirects, subresource redirects and service-worker traffic cannot contact an excluded origin.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary line 27, Design lines 50 and 54, frontmatter covers, Test Plan AC-04
EVIDENCE: R-1 F-03's revision links `seo-assessment.md` as the owner of the installed `scripts/seo/evidence.js` contract. That file at the reviewed commit contains no such packaging contract. The contract exists under Packaged evidence analysis at `774ce7fa59b99bc8c82c583091121226c86a7a7f:docs/specs/seo-assessment.md:175-185`. The revised design allows base-only delivery, while AC-04's proof unconditionally requires an enabled SEO run with the installed bundle.
PROPOSAL: Cite the exact dependency revision and make the release and proof gates explicit for base-only and SEO-enabled delivery. Enable the SEO adapter only after the supported marketplace release contains the dependency, and retain the fresh-installed enabled proof for that change.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Scope line 43, Design lines 50 and 52, Test Plan AC-03 and AC-04
EVIDENCE: The revised design supplies anonymous HTML in scratch and invokes the installed analyzer. `tools/seo-evidence/README.md:36-68` requires a validated native bundle with URL scope, requested and final URLs, actual status, media type, selected headers and body digests. AC-03 can exercise real tool output from a prepared bundle, and AC-04 can exercise the installed analyzer, without proving that the release collector supplies correct observations for the two targets.
PROPOSAL: Require the release collector to build valid native bundle inputs from its recorded observations and map the analyzer's incomplete and failed outcomes into the shared report. Use an end-to-end fixture with target-specific HTML, a known metadata or link finding, and an uncollected destination whose coverage remains unknown.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary lines 27 and 29, Design lines 48, 49 and 53, Terms lines 64-68, Acceptance Criteria AC-02 and AC-03, Test Plan AC-02 and AC-03
EVIDENCE: R-1 F-06's revision defines a deadline but neither selects which browser milestone completes navigation nor defines how to aggregate multiple terminal observations for one required method and URL. For example, a 503 followed by a successful retry before the visible assertion can produce a required failure or a required pass. The current proof exercises a delayed failure and an absent request separately, which allows either implementation.
PROPOSAL: Define navigation completion, required observation identity, and aggregation for repeated or retried matching requests. Include a fixture that returns a failed response and then a successful response for the same required request before the observation boundary, and assert both the retained observations and final rule verdict.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary line 27, Design lines 48 and 49, Acceptance Criteria AC-02, Test Plan AC-02
EVIDENCE: The R-1 revisions make CSP violations typed required failures, while the four listed listeners only cover console, page errors, requests and HTTP responses. AC-02's fixture uses a CSP refusal but does not require an enforced CSP block to be distinguished from a report-only CSP violation or an unrelated network error. Both an enforced policy and a report-only policy can emit a security policy violation event. [MDN SecurityPolicyViolationEvent disposition](https://developer.mozilla.org/en-US/docs/Web/API/SecurityPolicyViolationEvent/disposition)
PROPOSAL: Define a typed source and the verdict for enforced versus report-only policy observations, including when no request reaches the network. Prove both cases without relying on console wording.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design lines 48 and 52-53, Acceptance Criteria AC-02 and AC-04, Test Plan AC-02 through AC-04
EVIDENCE: R-1 F-08 and F-09's revisions sanitize saved observations and retain interrupted run directories. Raw HTML goes to per-run scratch, but the design does not define whether interrupted scratch is part of a retained run directory or prevent a tool's raw diagnostics from escaping through stderr. The sensitive-value proof checks markers, reports and retained artifacts but omits the command streams and skill output.
PROPOSAL: Define the raw scratch lifecycle and retention boundary for interruption, and apply the evidence projection to every report and diagnostic stream the runner or skill exposes. Exercise a tool error and interruption during processing, and check both streams, retained output and skill output for the synthetic value.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design line 53, Terms lines 64-68, Acceptance Criteria AC-03, Test Plan AC-03
EVIDENCE: R-1 F-11's revision adds labelled statuses, piped plain output and stream separation. The pinned `conventions/terminal-output.md` additionally requires the shared status glyphs, stream-specific terminal behavior and nonempty `NO_COLOR` handling, with coverage for absent, empty and `0` values. A CLI can meet the revised proof while always ignoring `NO_COLOR` on a terminal.
PROPOSAL: Apply the pinned terminal output contract explicitly and extend the proof to the status labels and glyphs, terminal and redirected streams, and the specified `NO_COLOR` cases.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design lines 50 and 54, Acceptance Criteria AC-04, Test Plan AC-04
EVIDENCE: Pinned `conventions/delivery.md:111-117` requires naming the build and publication paths and exercising each affected artifact as built for release. The draft names both marketplace manifests but says to install the package in one unspecified supported environment. The install routes documented in `docs/get-started/installation.md:53-85` use distinct marketplace clients. A fixture that exercises one manifest can pass while the second manifest has a missing discovery entry or incorrect version.
PROPOSAL: Name the supported marketplace install paths and the repository checks that establish the final package and manifest contents. Require package discovery and the installed smoke entry point to be verified along each supported path the change affects.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Scope line 43, Design lines 47 and 51, Acceptance Criteria AC-01, Test Plan AC-01
EVIDENCE: The R-2 confinement revision permits an explicit HTTP-to-HTTPS probe and requires the proxy to block HTTPS downgrades. A static scheme, host and port allowlist that permits both origins admits the initial HTTP probe and a downgrade to that same HTTP origin. The test can pass by trying a downgrade with HTTP disabled throughout, leaving the combined case unverified.
PROPOSAL: Give the explicit upgrade probe a separate HTTP-only initial request and validate its Location before continuing through an HTTPS-only boundary. Verify a successful upgrade followed by a downgrade back to the same HTTP origin, using destination logs to prove the downgrade did not reach it.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design lines 48-49, Terms line 65, Acceptance Criteria AC-02, Test Plan AC-02
EVIDENCE: The R-2 revision waits for one terminal outcome per required request, but its listed Playwright listeners observe response headers and failures without establishing completed downloads. A required fetch issued after page load can return 200 headers, satisfy an implementation's completion condition, and then fail while downloading the body. The 503-then-200 proof can pass with header-only tracking. [Playwright Request lifecycle](https://playwright.dev/docs/api/class-request)
PROPOSAL: Define terminal outcomes using request completion or failure, with HTTP status attached to the corresponding completed request. Prove that a required response whose body fails after 200 headers produces a failure and that an unfinished required response at the deadline leaves coverage incomplete.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary line 27, Scope line 43, Design lines 47 and 50-51, Acceptance Criteria AC-01 and AC-03, Test Plan AC-01 and AC-03
EVIDENCE: The test plan asks for real tool output and deployed-only observations, but gives no pass condition for automated accessibility, certificate validation or header rule verdicts. It can pass with an axe invocation that discards violations or a deployed adapter that records a generic reachability result without distinguishing certificate and header findings.
PROPOSAL: Require the enabled adapters to report a known axe violation, a certificate validation failure and a named header rule outcome against controlled fixtures. Confirm that disabling each adapter produces its documented coverage result.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary line 27, Design lines 50 and 53, Acceptance Criteria AC-03 and AC-04, Test Plan AC-03 and AC-04
EVIDENCE: The R-2 revision defines different mappings for partial SEO analysis and analyzer failure. The installed proof checks a finding and an uncollected destination, but unknown link coverage does not by itself prove the analyzer returned a partial result or that an execution failure maps to a tool error. AC-03's named execution-error fixture covers Gitleaks.
PROPOSAL: Add SEO-enabled cases that exercise an actual partial analysis and a failed analyzer invocation. Assert distinct report outcomes and the required-coverage exit behavior.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary line 27, Scope line 43, Design lines 50 and 51, Acceptance Criteria AC-01 and AC-03, Test Plan AC-01 and AC-03
EVIDENCE: The preferred stock MDN CLI initiates both HTTP and HTTPS requests, then automatically requests `/robots.txt` and sends a CORS preflight. The draft permits HTTP only through a separate one-request probe and limits coverage to explicitly configured routes. An origin allowlist alone still permits the extra same-origin requests. The draft lets the adapter skip when it cannot comply, but leaves the working path for the now-required positive header proof unspecified. [MDN Observatory retriever](https://github.com/mdn/mdn-http-observatory/blob/main/src/retriever/retriever.js#L36-L84)
PROPOSAL: Define a header check that evaluates the confined HTTPS response from a configured route. Include the stock CLI only if it can honor the request boundary, and verify the enabled path's request footprint and named rule outcome in the same fixture.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Context / Owner summary lines 27 and 29, Design lines 48 and 49, Terms lines 64 to 66, Acceptance Criteria AC-02 and AC-03, Test Plan AC-02 and AC-03
EVIDENCE: The R-3 revision requires real terminal events but still ends collection after the first terminal outcome for each required method and URL. If two matching attempts have already started, the first can succeed while the second is still downloading. The current proof only holds open the sole matching response, so it cannot distinguish a run that silently passes with a known pending attempt from one that waits for it.
PROPOSAL: Define how a matching attempt already in flight at the early completion point affects coverage while keeping the existing deadline. Prove the selected behavior with overlapping attempts where one succeeds and the other remains pending.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary line 27, Scope line 43, Design line 50, Acceptance Criteria AC-03, Test Plan AC-03
EVIDENCE: The R-4 revision adds case-insensitive presence and exact-value rules without defining the observed value for repeated headers. Playwright's `headerValue()` combines repeated values, `headerValues()` returns the values separately where available, and `headers()` omits some security-related headers. A fixture with one ordinary header can pass while implementations disagree on presence or exact-value matches against real deployments. [Playwright Response API](https://playwright.dev/docs/api/class-response#response-header-value)
PROPOSAL: Define a single case-insensitive lookup and exact-value comparison using Playwright's documented observed representation. Prove the verdict for a security-related header and a repeated header containing an additional value, while retaining the no-extra-requests check.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context / Owner summary line 27, Scope line 43, Design lines 47 and 50, Acceptance Criteria AC-03, Test Plan AC-03, Sources line 326
EVIDENCE: The R-5 revision selects `headersArray()` so repeated entries remain separate. Playwright documents that some browser network stacks combine values before exposing them, so a repeated header at the server does not guarantee two observed entries. AC-03 requires proof based on two matching entries without setting an observation precondition, while the design permits multiple browser engines. [Playwright Response API](https://playwright.dev/docs/api/class-response#response-headers-array)
PROPOSAL: Define exact matching on the entries and values the selected browser reports, and state that the rule cannot establish wire-level multiplicity. Prove the duplicate path with a fixture and engine confirmed to expose two entries, and cover a single comma-delimited observed value without splitting it.

### R-7

NO FINDINGS

### R-8

NO FINDINGS

### R-9

NO FINDINGS

## Sources

- [Stackweaver homepage](https://stackweaver.sh/), observed deployed navigation and anonymous session response.
- [VibeCodeCheck report](https://vibecodecheck.nl/scan/7261c49e-8e0d-4614-b3ef-59fec3db92f5), the owner's pasted findings include three 401s and 34 console errors.
- [Playwright ConsoleMessage API](https://playwright.dev/docs/api/class-consolemessage), console event fields.
- [Playwright page routing](https://playwright.dev/docs/api/class-page#page-route), first-hop and service-worker limits.
- [Squid ACL directives](https://www.squid-cache.org/Doc/config/acl/), destination and request matching for a confined runner.
- [SecurityPolicyViolationEvent disposition](https://developer.mozilla.org/en-US/docs/Web/API/SecurityPolicyViolationEvent/disposition), enforced and report-only observations.
- [Playwright request lifecycle](https://playwright.dev/docs/api/class-request), response and terminal request events.
- [Playwright Response headersArray](https://playwright.dev/docs/api/class-response#response-headers-array), browser-observed response header entries and the limit on field multiplicity.
- [Playwright network events](https://playwright.dev/docs/network), browser request and response observation.
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing), integration with axe.
- [MDN Observatory retriever](https://github.com/mdn/mdn-http-observatory/blob/main/src/retriever/retriever.js#L36-L84), requests initiated by the stock CLI.
- [Gitleaks](https://github.com/gitleaks/gitleaks), file and directory secret scanning.
- [Lighthouse CI configuration](https://googlechrome.github.io/lighthouse-ci/docs/configuration.html), optional local browser budgets.
