---
status: draft
status_description: "Revised after spec review R-12: targets and modes named apart, browser-check profile keys with T6 extending the schema, no CA option on the shipped command, Squid from Ubuntu's archive. Next: follow-up spec review and renewed acceptance."
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
  - tests/vh-adlc/website-check/
  - tests/vh-adlc/check.test.ts
  - .github/workflows/ci.yml
---

# Plan: Website release checks

## Context

### Owner summary

Run the same browser smoke checks against the local production build and the deployed site. The command runs directly from a terminal or pipeline. A vh-adlc skill reads its results, explains failures, and points to the project code and deploy configuration that own each fix. Each adopter supplies a short profile with a route, a page assertion and any site-specific expected responses. Stackweaver adopts the shared check in a separate change after its release, starting in report mode. Other projects can start with just a public homepage and add coverage as needed.

Start with Playwright, the existing SEO evidence toolkit, and the project's installed secret scanner. Use axe through Playwright for automated accessibility checks. The browser check can ship first. The optional SEO adapter ships once the shared SEO feature releases its analyzer bundle. For configured deployed routes, check declared headers from the observed HTTPS response. The shared code supplies browser event collection where an existing runner lacks it, tool adapters, and a consistent report. Browser smoke coverage requires Playwright and a supported browser. The minimum profile uses Chromium in a runner with scoped network access. This delivery supports Chromium only: a profile whose `browser` is anything but `chromium`, or that has a key the profile format does not define at any level, is refused before the run starts. Neither a profile nor the shipped command can add a trusted certificate authority. Firefox support follows in [#158](https://github.com/michielvha/vh-adlc/issues/158). Accessibility, SEO analysis, secret scanning and deployed header checks can each be enabled separately. The command exits with an error if required evidence is incomplete. A completed report-only run can contain findings and still exit successfully. Enforcement additionally fails on violations of required rules.

The Stackweaver comparison already shows why the two targets need their own evidence. Both browsers saw the deployed homepage return 200 and make one signed-out session request that returned 401. Chromium reported that request as a console error. The clean local build served by its pinned Nginx image had a different failure: its default API URL points to localhost, and the page's policy blocked session and health requests. The local run used default configuration and the deployed artifact identity is unknown. The original scanner's full finding counts were not reproduced. Chromium's console diagnostic stays visible even when the HTTP response has an expected verdict.

Owner decisions on 2026-11-23 changed the accepted scope in four ways. Chromium never finishes a request whose body the page leaves unread, which is how Stackweaver's session client treats its 401. Such a response is still classified from its observed status, as a pass, an expected response or a failure, but it can never satisfy a required request, so an adopter declares it as an expected response rather than a required one. The Chromium and Firefox comparison moved out of this delivery into #158. The profile gains an optional `browser` field that accepts only `chromium`, and unknown profile keys become invalid configuration. Hosted CI installs the smoke prerequisites, so the browser tests run on every push. On every host they fail rather than skip when a prerequisite is missing, and `AGENTS.md` names a portable test selection for hosts without them. The new checks for these decisions are planned and have not run yet.

The harm this guards against is a public page that breaks only in the built or deployed artifact and stays broken for visitors until someone notices. No such break has been observed on a deployed site yet. The Stackweaver local build ran without its release configuration, and its blocked requests show the kind of failure the check reports, not one that visitors saw. The existing mocked Playwright suite cannot see such failures, and the hosted scanner is a pilot whose counts could not be reproduced. The confinement keeps the run to the owner's explicitly configured origins, which a plain browser run cannot guarantee. Background has the detail.

### Background

Harm: visitors to an adopter's public site, and the owner who ships it, would be affected when a release breaks a public page only in the built or deployed artifact. Such a break reaches every visitor of that route and does not heal on its own: it stays live until someone notices it and ships a fix. How often it happens is unknown, because no visitor-facing break has been observed on a deployed site so far. The Stackweaver comparison below is the only example, and it is not a release defect: the local production build ran with default configuration and no deploy settings, so its default localhost API URL let its own Content Security Policy block the session and health requests, with 12 Chromium and 7 Firefox console errors. The deployed site showed only the expected anonymous 401.

Simplest alternatives considered:

- The hosted scanner that started this work. The owner reported that it is a pilot and not publicly available, it adds an outside service and its pricing, and its reported 3 blocked requests and 34 console errors were not reproduced in the visits below.
- Running the adopter's existing Playwright suite against the deployed URL. Stackweaver's public suite replaces the session response with a fixture 401 (`e2e/tests/public-seo.spec.ts:390`), so it cannot observe the real response, and the T1 existing-suite fixture shows an ordinary mocked test passing over a real 503 that the release run reports.
- A plain anonymous Playwright smoke run without the proxy and Bubblewrap boundary. It would catch these failures, but the owner required that release checks send only ordinary traffic to explicitly configured owned origins. An unconfined browser follows redirects, third-party subresources and service workers to any destination, and Playwright listeners can only record that traffic, not stop it.

The design reuses Playwright and existing tools and adds only the boundary, the observation collector and the report. Because the harm has not been observed yet, it starts in report mode, so an adopter collects findings before any of them can block a release.

The local evidence directory is `/tmp/stackweaver-release-check.HSTmoi/`. The build output is in `build.log` and browser observations are in `nginx-built.jsonl`, `built.jsonl` and `deployed.jsonl`. The capture removed URL queries and omitted request methods and redirect chains. The pinned client source establishes the session request method. The proposed exception still needs a proof with the full request tuple.

- Stackweaver source was exported from fetched `origin/main` at `72e48ed577af958034d6aa598e2835ef36ccdb8c`. `npm run build` exited 0. `frontend/Dockerfile` uses that build command and a pinned Nginx image. The browser run mounted the resulting files and the build's generated Nginx configuration into that image, with no injected deploy settings.
- Fresh anonymous Chromium 158 and Firefox 159 visits waited for the load event and observed seven more seconds. Local Nginx returned 200 in both and logged 12 and 7 console errors respectively. The errors name the policy blocking `http://localhost:8022/auth/session` or `/health` and follow-on fetch failures. There were no observed 401 responses in that Nginx run. The plain static server control returned one 401 per engine from the local API, which the browser could reach without the Nginx response policy.
- The deployed homepage returned 200 in both engines and one 401 each from `https://stackweaver.sh/auth/session`. Chromium logged one console error for that response. Neither engine reported an uncaught page error or transport failure. No other 401s were observed. This is one visit per engine per measured target.
- In that Stackweaver revision, `frontend/src/config.ts:45` defaults the API URL to localhost and `frontend/src/lib/zitadel.ts:96-98` maps a session 401 to an anonymous session. `e2e/tests/public-seo.spec.ts:388-389` exercises public browser navigation and collects page errors. The next line intercepts the session request and returns a fixture 401. Reuse its runtime and compatible assertions in a separate anonymous smoke project with real responses. `scripts/verify-local.sh:209-221` already invokes Gitleaks for repository changes.
- The first T4 collector run on 2026-11-23 (`website-t4-first-attempt.log` in the same evidence directory) found no expected record for the fixture's anonymous session 401. The fixture page leaves that body unread, as `frontend/src/lib/zitadel.ts:96-98` does on a 401, and Chromium fired no `requestfinished` for it before the deadline. The T4 collector, implemented at `6b00d5a9` and not yet ticked, at `plugins/vh-adlc/scripts/website-check/observations.ts:186-192` classifies such a response from its observed status and records its transfer as unfinished.
- In vh-adlc at `84e59c898cbdb0bd4e76bd207b30a5356b495b32`, `tools/seo-evidence/README.md:25-32` describes the offline snapshot and inspection commands. Its policy section at line 125 defaults to report only. Reuse its bundle and finding formats for the evidence it already handles.

## Scope

Check explicitly configured routes on two targets: the adopter's locally served release artifact and its owned deployed site. Cover browser startup, required resources, automated accessibility, technical SEO metadata and links, built files for secrets, and deployed TLS, redirect, and header observations. The tool reports on public routes. Authenticated journeys, where relevant, belong to the adopter's existing test suites and do not count as covered by the public run. Scope excludes exploit probes, guessed endpoints, external scoring parity, ranking claims, publication, hosted monitoring and Lighthouse integration. Adopters can run Lighthouse in their own workflow.

## Design

- Provide a script in the shared plugin with two explicit targets, build and deployed. Each run consumes a checked-in YAML profile that selects the target, the mode, the browser, one origin and one route, capabilities, required rules and precise expected responses. An adopter checks more routes with more profiles. The adopter owns how the production artifact is built and served. Reuse its configured Playwright runtime and compatible page assertions. Release runs use a dedicated anonymous browser scenario with real responses. They cannot inherit fixture mocks, seeded session state or authenticated setup. Traffic confinement runs below Playwright and does not fabricate application responses. A minimum profile selects one route and one visible page assertion. An existing Playwright suite can call the shared runner from a dedicated project. For a new adopter, the plugin provides a generic anonymous smoke scenario driven by the profile, run with a pinned Playwright runtime and Chromium installed through documented repository setup. This delivery supports Chromium only. The profile's optional `browser` field defaults to `chromium` and accepts no other value. The browser check defines these profile keys: at the top level `target`, `origin`, `mode`, `browser`, `httpUpgradeUrl`, `expectedResponses` and `route`; in `route`, `path`, `visibleHeading`, `deadlineMs` and `requiredRequests`; in each required request, `method` and `url`; in each expected response, `method`, `url`, `resourceType` and `status`. `mode` is `report` or `enforce` and defaults to `report`. T6 adds the keys for adapter selection, header rules, required rules and the enforcement policy to the same profile schema, under the same rule. Any other `browser` value, such as `firefox` or `webkit`, and any key the schema does not define at any level, is invalid configuration. It is rejected before the proxy, the boundary check or the browser starts, and before any request. A profile cannot add trusted certificate authorities, and neither can the shipped command. Only the internal runner API that the tests call takes a fixture CA argument. Firefox support is the follow-up feature [#158](https://github.com/michielvha/vh-adlc/issues/158). Optional adapters are disabled unless selected. A disabled adapter is not applicable to this run. A selected adapter with a missing prerequisite is skipped with a reason. Report mode is the default. Enforce mode requires an explicit policy. The browser check is required in both modes. A profile may make selected applicable adapters required. Reject policies that require disabled or inapplicable checks before starting.
- Capture each selected page in a fresh browser context. Attach Playwright listeners before navigation for console errors, uncaught page errors, request failures, completed requests and HTTP responses. Track responses and terminal events by Playwright Request identity. Only `requestfinished` or `requestfailed` is terminal. Keep the observed HTTP status where present, and report a failed body transfer as a failure even after successful headers. Chromium fires neither terminal event for a response whose body the page leaves unread, and browser events cannot tell that apart from a body the server holds back. At the observation boundary, a response with headers but no terminal event keeps its observed status, records its transfer as unfinished, and is classified against the expected-response rules like any other response. An unfinished transfer never satisfies a required request, so a required request whose only attempts are unfinished leaves coverage incomplete. Adopters declare a response the page never reads, such as an anonymous session 401, as an expected response, not as a required request. Install a document initialization listener for `securitypolicyviolation` before page scripts run. Record enforced violations as blocking observations even when no network request was issued. Report-only CSP violations are advisory. Keep ordinary network failures distinct. Record browser version, route, request method, resource type, sanitized URL and source location, and observed status or error text. Group repeated events while preserving their count. Each route names a visible assertion, any required requests by method and URL, and a positive deadline covering navigation and observations. Start the deadline immediately before navigation. Require the main-frame navigation to reach the browser load event and the visible assertion to succeed. Each required request matches the method and exact normalized URL before sanitization. Record every matching terminal outcome within the observation window. A failed attempt makes that rule fail even if a later attempt succeeds. Track the start of each matching attempt through Playwright’s request event. Complete only after the visible assertion and load event, at least one terminal attempt per required request, and no matching attempts left in flight. Stop at completion or the deadline and record the observation boundary. A completed error response can fail its check. A required request without a terminal observation by the deadline makes coverage incomplete. If navigation succeeded and the assertion is false at the deadline, record an assertion failure.
- Classify a declared anonymous session response as expected only for its exact method, origin, path, resource type, status and anonymous context. The separate Stackweaver adoption will declare that its deployed profile allows only the same-origin fetch `GET https://stackweaver.sh/auth/session` with status 401 in a fresh anonymous context. Match the full normalized URL including query, with no redirect and no query in this exception. Other profiles declare their own exceptions, including any local equivalent. Apply the exception only to the matching HTTP response. Console messages and page errors keep separate records. Console messages without reliable request identity remain diagnostic observations with no attribution to the expected response. Required failures come from typed browser or HTTP observations and assertions, including captured Content Security Policy violations and uncaught page errors. Keep the sanitized observation and reason. A script returning the same status, a changed endpoint status, or a CSP-blocked connection remains actionable. A public-only profile explicitly shows login and private API journeys as outside its scope.
- Deliver the base check without an SEO adapter when the analyzer is not in the marketplace release. A follow-up enables SEO only after the installed plugin contains the canonical `plugins/vh-adlc/scripts/seo/evidence.js` build with licenses and provenance. The dependency design is in the [SEO packaging spec at 774ce7fa](https://github.com/michielvha/vh-adlc/blob/774ce7fa59b99bc8c82c583091121226c86a7a7f/docs/specs/seo-assessment.md#packaged-evidence-analysis). The enabled adapter uses Bun to run that bundle. It builds and validates a native bundle from actual target observations, including URL scope, requested and final URLs, status, media type, permitted headers and body digests. Uncollected destinations remain unknown. Map partial analysis to incomplete coverage and failed analysis to a tool error. Use Playwright with axe for automated accessibility and reuse the adopter's pinned Gitleaks version and config. Run its directory mode on the explicit built artifact root with redacted JSON and a distinct configured finding exit code. Validate the report and classify scanner errors as incomplete evidence. For deployed headers, evaluate the selected route’s final main-document HTTPS response already observed by Playwright. Read only the header entries the selected browser reports through Playwright’s `headersArray()`. A browser may combine headers before exposing them. Reports name the browser and present these checks as observations from that browser. They do not establish how many field lines were sent on the wire. Compare names case insensitively. A presence rule passes if at least one matching entry exists. An exact-value rule passes only if exactly one matching entry exists and its observed value equals the configured string. Do not join repeated entries or split comma-delimited values. Each rule reports its own outcome. It sends no extra requests. Use ordinary confined HTTPS requests with normal certificate validation for explicitly selected redirect and certificate checks. The stock MDN CLI makes requests outside this contract and is outside this release.
- Apply the profile's exact origin and scheme allowlist to browser navigations, subresources and adapter requests, including every redirect hop. Local builds can explicitly allow loopback HTTP. The deployed browser and its subprocesses use an HTTPS-only boundary. An explicitly enabled HTTP upgrade probe runs in a separate client boundary scoped to the configured initial HTTP origin, with redirects disabled and no credentials. Close that connection after its response. Validate the Location before checking the HTTPS destination through the HTTPS-only boundary. Reject HTTPS downgrades and off-scope hops before the next request and record the reason. Use an existing explicit forward proxy with a deny-by-default destination policy, such as Squid ACLs, in an isolated runner. Allow the browser and network adapter processes to connect only to that proxy, with no direct egress or loopback bypass. Match HTTP destinations and HTTPS CONNECT authorities separately, with exact host and port and TLS validation left enabled. For the build target the proxy can reach the release server through the isolated test network. Block service workers in the public browser profile and document that coverage limit. Playwright listeners collect observations and never serve as the network boundary. Check the boundary before navigation. A browser without it is incomplete required coverage. An optional network adapter that cannot obey it is skipped with a reason.
- Match expected responses in memory before sanitizing. Persist sanitized observations and selected structured tool results. Exclude query values, fragments, user info, cookies, credentials, raw browser diagnostics and tool transcripts. Persist a browser diagnostic as a safe category and source location. Retain a normalized message only when its fields are on an explicit safe list. Keep raw SEO input and tool output in private per-run temporary storage outside the report directory and clean it on completion and handled interruption. Use runner-owned disposable storage for unhandled exits. Keep retained attempt directories limited to projected data. Buffer subprocess output and project all stdout, stderr and skill output through the same safe fields before exposing it. Strip or omit any free-text field that cannot be safely projected. Treat collected content as evidence, never as instructions.
- Emit versioned JSON on stdout in machine mode. Diagnostics go to stderr. Human output uses labelled statuses and plain text when piped or when plain mode is selected. Apply the [pinned terminal output standard](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/terminal-output.md) for status glyphs, stream-specific terminal behavior and nonempty `NO_COLOR`. Keep ANSI controls out of machine and plain streams. Record the tested commit or artifact digest, when known, the deployed URL, selected profile, tool versions, and per-rule pass, fail, skipped, not applicable, or expected result. Record unavailable release identity explicitly. Write reports locally, in a new directory for each run. Publish the report atomically with its checksum in a versioned completion marker written last. Preserve completed partial reports and interrupted run directories. The skill reads a single explicit report, verifies its marker, version and checksum, and refuses incomplete or unsupported inputs. It labels completed partial coverage and proposes fixes from retained evidence. A run with invalid configuration, failed startup, incomplete required coverage or a report write error exits nonzero in either mode. A completed report-only run exits zero even with findings. Enforcement also exits nonzero for failed required rules. Optional failures or missing optional tools appear in the report and do not change the exit status.
- Deliver the plugin through the current vh-adlc marketplace release path. Run the repository's `bun test tests/vh-adlc` package checks, including the website-check tests, in the existing hosted `checker` job. That job already lifts Ubuntu's unprivileged user namespace restriction (`.github/workflows/ci.yml:41`). It also installs the smoke prerequisites: Bubblewrap, iproute, socat, OpenSSL, certutil, Squid, playwright-core 1.64.1 pinned by a lockfile under `tests/vh-adlc/website-check/`, and its matching Chromium headless shell. A missing prerequisite fails the website-check tests on every host; they never skip. `AGENTS.md` states that `bun test tests/vh-adlc` needs Linux and these prerequisites, and gives the hosted `checker-macos` job's file list (`.github/workflows/ci.yml:98-110`) as the portable selection for other hosts. Squid comes from Ubuntu's signed apt archive, like the job's existing Bubblewrap install (`.github/workflows/ci.yml:36`), and the job logs its version. The confinement tests prove its behavior on every run. Ubuntu 24.04's Squid 6.14 passed all 14 website-check tests on 2026-11-23, on a Linux host with Bun 1.4.5, playwright-core 1.64.1 and Chromium headless shell 156. If the first hosted run fails with the packaged Squid, pinning Squid 7.5 is a revision of this document. Verify discovery and the installed entry point through the Codex and Claude Code marketplace routes in `docs/get-started/installation.md`. Check both manifests and package identities. The optional SEO delivery repeats the installed check with SEO enabled. Pin adopter tool versions using the existing runtime or lockfile. Document the minimum browser setup, production serve command, public route assertions, and optional adapters in the installed skill's adoption procedure. Align that procedure with the pinned shared frontend testing convention. The [companion conventions branch](https://github.com/vhco-pro/docs/tree/364b7cd6b3039e79afac6023bd9f33498c64c543) extends `conventions/frontend-testing.md` and `guides/onboard-a-repository.md`. Consumers adopt the reviewed convention through their own pin updates. Allow an adopter to opt out by removing the check invocation and its profile. Deliver the shared plugin against generic fixtures. Adopt it separately in Stackweaver after release, in report mode. That consumer change must verify the real configured local build and deployed origin and retain their reports. Enabling a Stackweaver gate is a separate change.

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
| Target | Where a run points: the build target or the deployed target, set by the profile's `target` key. |
| Mode | How a run treats findings: report or enforce, set by the profile's `mode` key. |
| Expected | An observed response matches the target's complete exception rule. |

## Acceptance Criteria

- [ ] AC-01: A project with either an existing Playwright suite or the documented minimum browser setup can run the same configured public route checks against a production build and its deployed origin without an external scanning service or model.
- [ ] AC-02: A known anonymous session response remains visible as expected, while a blocked connection, missing or failed required asset, or unexpected status is reported with enough evidence to locate it.
- [ ] AC-03: The command, report and skill use the glossary meanings for modes and outcomes. The report identifies named rule outcomes from enabled accessibility, certificate and header checks, and what coverage was unavailable or disabled. Report-only mode records findings without blocking a completed run. Both modes reject invalid configuration and incomplete required coverage. Enforcement additionally rejects failures of required rules.
- [ ] AC-04: A project can invoke the installed skill to interpret an existing report and trace its findings to sanitized evidence without rerunning checks. The skill rejects unfinished or unsupported reports.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run both targets against a locally served production fixture and an owned HTTPS deployment fixture. Check that both execute the same route assertions and that deploy-only observations are present only in the deployed report. Prove the same one-route smoke profile works in a minimal static fixture with no existing Playwright suite and no optional tools. In an existing-suite fixture, show that the release scenario observes a real backend failure masked by the ordinary mocked test. Run with third-party scanning services unavailable. For each browser enabled by the delivery, confirm from destination logs that navigation redirects, subresource redirects, a service-worker attempt and an HTTPS downgrade cannot reach excluded destinations. Confirm allowed redirects still load. In one configured deployment fixture, let the separate HTTP probe start a successful upgrade, then return an HTTPS redirect to that same initial HTTP origin. Use the HTTP destination log to prove only the initial probe reached it. A missing confinement boundary fails browser coverage before navigation. An adapter unable to honor the profile is skipped. Run these tests in the hosted `checker` job with the prerequisites installed, and verify that a missing prerequisite fails a test instead of skipping it. |
| AC-02 | Serve an anonymous session 401, a required script returning 401, a wrong query or method with a 401, a redirected 401, and a page with a connection refused by CSP. Also emit an unrelated console error and make a different request to the same URL in that visit. Assert that only the exact HTTP observation is expected and console diagnostics remain independently visible with sanitized fields. Include a delayed resource failure, a required request that never appears, a false assertion, and a required request returning 503 and then 200 before load and the visible assertion complete. Verify both response records and a failed rule. Send 200 headers for a required fetch and then abort its body. Verify a failed rule. In a separate run start two matching attempts before the assertion completes. Complete the first and hold the second body past the deadline. Verify incomplete required coverage, even though the first attempt succeeded. Check enforced and report-only CSP dispositions and a separate transport failure. Assert distinct outcomes. Include a synthetic sensitive value in a request query and echoed browser and adapter diagnostics. Verify its absence in stdout, stderr, markers, reports, retained artifacts and skill output after a tool failure or interruption while the observations remain traceable. Make a required fetch whose 200 body the page never reads, while the server sends the whole body. Verify that its response record keeps the status with an unfinished transfer and that coverage is incomplete. In the same run, verify that a declared expected 401 whose body is left unread is still recorded as expected. |
| AC-03 | Exercise real outputs from the enabled tools. Detect a known axe violation, distinguish certificate validation failure from reachability failure through the runner API with the fixture CA, and retain known passed and failed header outcomes by rule name. Verify a Content Security Policy presence check. Confirm that the pinned browser fixture exposes two matching entries through Playwright, then verify the exact-value rule fails even when one entry equals the configured value. In a separate fixture, confirm the browser exposes a single comma-delimited value, then verify that only the entire observed string matches. If a browser combines duplicates, verify its verdict against the actual observed entries. Compare destination logs to the same fixture with header rules disabled. Verify the header checks sent no extra requests. Disable each adapter in turn and verify a not applicable result. Put a synthetic secret only in the built output and exercise a Gitleaks execution error. Assert distinct outcomes and redacted findings. Check status labels and glyphs on a terminal and plain redirected streams. Test absent, empty and `NO_COLOR=0` in terminal mode. Verify JSON stdout and separate stderr for success, failure, skipped and partial runs. In both report and enforce mode, verify passed checks, findings, optional failure, missing optional tools, missing required browser, an inconsistent policy, interrupted collection and a failed report write. Assert coverage and exits. For each target in both report and enforce mode, give a profile whose `browser` is `firefox`, one whose `browser` is `webkit`, one with an undefined key at each level the schema defines (top level, `route`, a required request and an expected response), and one that sets a certificate authority such as `chromium.caFile`. Verify that each is rejected as invalid configuration with a nonzero exit, that the destination log has no request, and that no proxy, boundary check or browser launch is recorded. Verify concurrent attempts do not share output directories and that interruption before the marker leaves no readable completed report. |
| AC-04 | Run the package checks and discover and invoke the installed smoke entry on both marketplace routes without a source checkout, against the build target over loopback HTTP. For base delivery, verify the browser check works without SEO and reports the adapter unavailable when selected. For SEO-enabled delivery, execute the installed analyzer through the release collector in both targets using different HTML. Check a known metadata finding and unknown coverage for an uncollected link. Run a real analyzer partial-result case and a failed invocation. Verify separate incomplete and tool-error outcomes and nonzero exits when SEO coverage is required. Give the skill a saved fixture report and verify its findings cite the sanitized records and identify skipped checks. Pass an interrupted report, a replaced report with a mismatched checksum and a report with an unsupported version. Verify that none is interpreted and that a completed partial report is identified as partial. |

## Tasks

- [x] T1 `tests/vh-adlc/website-check/confinement.test.ts` and `tests/vh-adlc/website-check/fixtures/` - run the same route proof against the build and deployed targets, with real responses from both a minimal project and an existing-suite fixture. The checks fail before the runner exists and include the accepted destination-log confinement proofs (AC-01)
      Evidence: at 40d0564, `bun test tests/vh-adlc/website-check/confinement.test.ts` on Bun 1.4.3 passed the two fixture checks and failed the five smoke checks with ENOENT for the missing runner; /tmp/stackweaver-release-check.HSTmoi/chromium-t1-red.log.
- [x] T2 `plugins/vh-adlc/scripts/website-check/profile.ts` and `plugins/vh-adlc/scripts/website-check/runner.ts` - make T1 pass with the minimum pinned Chromium runner, accepted transport isolation and scoped upgrade check. Record the runner prerequisites and observed coverage in the fixture results (AC-01)
      Evidence: at 6d2385f on CI-pinned Bun 1.4.5, `tests/vh-adlc/check.test.ts`, the confinement test and `tests/vh-adlc/docs-drift/evidence-input.test.ts` passed 111 of 111 with Chromium 156 behind Bubblewrap and Squid 7.5. The excluded destination logged no smoke request and the HTTP destination logged only `GET /upgrade`; /tmp/stackweaver-release-check.HSTmoi/website-ci-bun-focused.log. The confinement test passed 7 of 7 again on 2026-11-23; /tmp/stackweaver-release-check.HSTmoi/website-t3-red.log. The full `bun test tests/vh-adlc` selection covered all 275 files with `GOWORK=off` on Bun 1.4.3 but was not one clean run: a triage fixture timed out under parallel load and passed alone, and a docs-drift filename case fails on Bun 1.4.3 and passes on 1.4.5. Prerequisites are in `tests/vh-adlc/website-check/fixtures/README.md`. Hosted CI does not install them yet.
- [x] T3 `tests/vh-adlc/website-check/observations.test.ts` - exercise the exact anonymous exception, CSP dispositions, delayed and overlapping requests, body errors and deadline cases in the Test Plan. Observe the missing observations or incorrect rule outcomes before adding the collector (AC-02)
      Evidence: on Bun 1.4.5 against the T2 runner, `bun test tests/vh-adlc/website-check/observations.test.ts` had 0 pass and 6 fail. The fixture received every request, and each case failed because the runner returned no typed response, CSP or transport records, rule outcomes, coverage or boundary; /tmp/stackweaver-release-check.HSTmoi/website-t3-red.log. The Test Plan's Chromium and Firefox comparison stays untested because no task builds a confined Firefox runner. On 2026-11-23 that comparison moved to #158.
- [ ] T4 `plugins/vh-adlc/scripts/website-check/observations.ts`, `plugins/vh-adlc/scripts/website-check/runner.ts` and `tests/vh-adlc/website-check/observations.test.ts` - make T3 pass with typed terminal observations, independent console records and target-specific exception matching. Add the unread required body case from the AC-02 Test Plan as a check on this collector; it has no separate red step, because the collector already leaves such a request incomplete (AC-02)
- [ ] T11 `tests/vh-adlc/website-check/confinement.test.ts` - add the rejected profiles from the AC-03 Test Plan: `browser` set to `firefox` or `webkit`, an undefined key at each level the schema defines (top level, `route`, a required request and an expected response), and a profile that sets a certificate authority. Each must be rejected as invalid configuration with no fixture request and no proxy or browser start. Observe them fail before T12 (AC-03)
- [ ] T12 `plugins/vh-adlc/scripts/website-check/profile.ts`, `plugins/vh-adlc/scripts/website-check/runner.ts` and the T1 and T3 tests - make T11 pass with the optional `browser` field, `mode` accepting `report` or `enforce` with `report` as the default, the defined key set enforced at every level, and the fixture CA moved from the profile to an internal runner API argument that the shipped command does not expose (AC-03)
- [ ] T13 `.github/workflows/ci.yml`, `tests/vh-adlc/website-check/package.json` with its lockfile, `AGENTS.md` and `tests/vh-adlc/website-check/fixtures/README.md` - install the smoke prerequisites in the `checker` job and pin playwright-core 1.64.1. Install Squid from Ubuntu's apt archive and log its version. Document the Linux requirement in `AGENTS.md` with the `checker-macos` file list as the portable selection, and correct the README, which says the repository already pins playwright-core. First observe the hosted job fail on the website-check tests without the prerequisites, then pass with them (AC-01)
- [ ] T5 `tests/vh-adlc/website-check/report.test.ts` and `tests/vh-adlc/website-check/adapters.test.ts` - run the accepted output, policy, interruption, sanitization and non-SEO tool fixtures. Observe failures for missing report behaviors and unsupported adapters (AC-02, AC-03)
- [ ] T6 `plugins/vh-adlc/scripts/website-check/report.ts`, `cli.ts` and `adapters.ts` in the same directory - make T5 pass with the plain and JSON streams, local completion marker, gate behavior and selected accessibility, built-file and deployed checks (AC-02, AC-03)
- [ ] T7 `tests/vh-adlc/website-check/installation.test.ts` - observe missing discovery and failed installed entry-point checks using both marketplace routes with the source checkout absent. Exercise completed, partial, altered and unsupported reports (AC-04)
- [ ] T8 `plugins/vh-adlc/skills/vh-adlc-website-check/SKILL.md`, `plugins/vh-adlc/references/website-check.md`, and the covered manifests - make T7 pass through both installed entry points. Document the minimum setup and verify the base release reports SEO unavailable if selected without its dependency (AC-01, AC-04)
- [ ] T9 `tests/vh-adlc/website-check/seo.test.ts` - for the SEO-enabled delivery only, after the analyzer is available in the supported marketplace package, exercise the installed two-target bundle, incomplete analysis and analyzer failure proofs. Observe failure without the adapter (AC-03, AC-04)
- [ ] T10 `plugins/vh-adlc/scripts/website-check/adapters.ts` and `plugins/vh-adlc/references/website-check.md` - for the SEO-enabled delivery only, consume the installed canonical analyzer and make T9 pass without a source checkout (AC-03, AC-04)

## Open Questions

None. The owner selected report mode first and approved explicit run outcomes and bounded observation, scoped and sanitized evidence, and a separate Stackweaver adoption. Lighthouse remains outside the shared tool.

On 2026-11-23 the owner settled two questions raised during T4. An unfinished transfer never satisfies a required request, and adopters declare a response the page never reads as an expected response. This delivery is Chromium-only, a profile that selects Firefox is rejected before start, and Firefox support is the follow-up feature #158.

The owner also answered two questions from spec review R-10 on 2026-11-23. A profile names its browser in an optional `browser` field that defaults to `chromium` and accepts only `chromium`, and undefined profile keys are invalid configuration. Hosted CI installs the smoke prerequisites in the `checker` job, pins playwright-core with a lockfile, and fails rather than skips when a prerequisite is missing; the first hosted run shows whether Ubuntu's Squid works or the job pins 7.5.

On 2026-11-23 the owner also answered two questions from spec review R-11. Unknown profile keys are rejected at every nesting level, against the defined key set in the Design, and the fixture CA is a runner argument the test harness passes, never part of a checked-in profile. The website-check tests fail without their prerequisites on every host, and `AGENTS.md` states the Linux requirement and names the portable selection for other hosts.

Spec review R-12 asked whether the shipped command may trust an extra certificate authority. The owner's 2026-11-23 answer to the R-11 question already settles it: the fixture CA is a runner argument that only the test harness passes. Only the internal runner API takes it, and the shipped command never does. AC-03's certificate cases run through the runner API, and AC-04's installed-entry proofs use the build target over loopback HTTP.

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
| 2026-11-23 | R-10 | spec | `37f956c5db149b84d5aa21c48d4708bc70566be0` | claude-opus-5-5 | procedural | Four should-fix findings and two nits |
| 2026-11-23 | R-11 | spec | `ed45264af49645b4c191390ccf3ca0afa4397c18` | claude-opus-5-5 | procedural | Four should-fix findings and one nit |
| 2026-11-23 | R-12 | spec | `87e238777ec294f196f8e1a341248082b82b4b27` | claude-opus-5-5 | procedural | Five should-fix findings and two nits |
| 2026-11-23 | R-13 | spec | `d5b0409bb8d50bae1f9f2e4c348483ddb9d70f5e` | claude-opus-5-5 | procedural | Four should-fix findings and four nits |

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

### R-10

TARGET: 37f956c5db149b84d5aa21c48d4708bc70566be0

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design line 51 (profile contents and the Chromium-only rule), Context / Owner summary line 28, Test Plan AC-03, Tasks T11 and T12, Open Questions line 112
EVIDENCE: This revision adds "A profile that selects any other browser, including Firefox, is invalid configuration". The same Design bullet lists what a profile selects ("origins, routes, capabilities, required rules, and precise expected responses"), and no browser selection is among them. `plugins/vh-adlc/scripts/website-check/profile.ts:3-11` has no browser key, and `resolveProfile` (lines 38-62) ignores unknown keys, so a profile with `browser: firefox` would run Chromium today. The document never says which field selects a browser, whether leaving it out means Chromium, whether an explicit `chromium` is allowed, or whether unknown keys are rejected. The AC-03 row and T11 only exercise Firefox, so an implementation that rejects only the string `firefox` and accepts `webkit` would pass. The issue comes from the change this revision made.
PROPOSAL: Name the profile field that selects the browser, its default, and `chromium` as the only accepted value. State that any other value, and say whether an unrecognised key too, is invalid configuration. Add a value other than Firefox, such as `webkit`, to the AC-03 proof.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-03, Design line 51, Context / Owner summary line 28, Tasks T11
EVIDENCE: The Design says a profile that selects another browser "is rejected before the boundary check or any request", and the Owner summary says it "is refused before the run starts". The AC-03 row only lists "a profile that selects Firefox" among the cases where it will "Assert coverage and exits". An implementation that starts the proxy and Chromium, visits the route, and only then reports invalid configuration with a nonzero exit passes that row. Only the unticked task T11 asks for "before the fixture receives any request", and a task is not the normative proof. This row was changed in this revision.
PROPOSAL: Extend the AC-03 row so that, for the rejected browser profile, the destination log has no request and no boundary check or browser launch is recorded, in both modes.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Tasks T11, T12 and T4, Context / Background line 42
EVIDENCE: Commit X already contains `6b00d5a9 feat: collect typed website check observations`, the T4 work. In it, `plugins/vh-adlc/scripts/website-check/observations.ts:172-177` (`requiredSettled`) keeps waiting while any matching attempt is pending. `#ruleOutcome` (lines 201-209) returns `skipped` with `no-terminal-attempt` when no attempt is terminal, and `result()` (lines 228-232) then sets `requiredComplete` to false. A required 200 fetch whose body the page never reads gets no `requestfinished`, so it stays pending and coverage is already incomplete, the same path that `tests/vh-adlc/website-check/observations.test.ts:167` exercises for a held body. T11's done condition "Observe both fail before T12" therefore cannot be met for the unread required body case, and T12's change to `observations.ts` has nothing left to implement. Background line 42 also says the collector "now" handles unread bodies while T4 is still unticked. These tasks were added in this revision.
PROPOSAL: Move the unread required body test under T4 as a check on the existing collector, or say how its red state is observed. Limit T11's red step and T12's change to the browser rejection in `profile.ts`.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary lines 26-32, Context / Background lines 36-43
EVIDENCE: Context shows what happened at Stackweaver: a localhost API default and CSP blocks on the local build, and a 401 plus a console error on the deployed site. It does not say who is harmed by a release that ships with these failures, how often that happens, how badly, or whether it heals on its own. It also names no simplest alternative that was rejected, with its reason. One example would be running the adopter's existing Playwright suite against the deployed URL, without the proxy and Bubblewrap confinement, the completion markers or the adapter framework. The goal says "without a hosted scanning service" but gives no reason for rejecting that service, and none for rejecting a plain unconfined smoke run. The document is at `draft`.
PROPOSAL: Add a short harm statement to Context covering who is affected, frequency, severity and self-healing. Name the simplest alternative considered, such as an unconfined Playwright smoke run or the hosted scanner, and say why it was rejected, so the confinement and evidence machinery can be weighed against the harm.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context / Owner summary line 32, Design line 52
EVIDENCE: The Owner summary says an unread response "still gets its expected or failed verdict from the observed status". The Design classifies it "against the expected-response rules like any other response", which also allows a pass: `observations.ts:194-198` gives an unread non-required 200 the outcome `pass` with `transfer: "unfinished"`.
PROPOSAL: Say "its pass, expected or failed verdict" in the Owner summary, or say that an unread response is classified like any other.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: frontmatter covers (`tests/vh-adlc/`)
EVIDENCE: `/tmp/vhadlc-bin/vh-adlc fresh docs/specs/website-release-check.md --repo . --plugin-pin 1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff` reports `covered-drift` for R-9 from unrelated files, including `tests/vh-adlc/proportionality.test.ts`, `tests/vh-adlc/security-settings/helper.test.ts` and `tests/vh-adlc/author-extras.test.ts`. Covering the whole test directory makes any other feature's test change mark this document's reviews stale.
PROPOSAL: Narrow the entry to `tests/vh-adlc/website-check/` plus any specific package check file this feature changes, such as `tests/vh-adlc/check.test.ts`, the next time the baseline is revised.

### R-11

TARGET: ed45264af49645b4c191390ccf3ca0afa4397c18

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design line 65 (profile contents, `browser` field and undefined keys), Context / Owner summary lines 30 and 34, Test Plan AC-03, Tasks T11 and T12, Open Questions line 129
EVIDENCE: This revision makes "any key the profile format does not define" invalid configuration. The document never lists the keys the profile format defines, and it does not say whether the rule also applies to keys nested inside a route, a required request or an expected response. The two readings lead to different builds. A top-level-only check would accept a typo such as `requiredRequest` inside `route`, and the run would silently drop a required request, which is the silent misconfiguration the rule exists to stop. The AC-03 row and T11 ask only for "one with a key the profile format does not define", so a top-level-only implementation passes. The current profile type at `plugins/vh-adlc/scripts/website-check/profile.ts:3-11` also carries `mode` and a `chromium: { caFile }` key that the confinement tests pass (`tests/vh-adlc/website-check/confinement.test.ts:37`). The Design does not mention `chromium.caFile`, so it is unclear whether T12 must reject it, which breaks the existing tests, or accept it as a defined key. Accepting it lets a checked-in profile trust an extra CA. This traces to the change this revision made for R-10 F-01.
PROPOSAL: List the profile's defined keys at each level, or name the schema file that defines them, and state that unknown keys are rejected at every nesting level. Say whether a CA override belongs to the profile or only to the test harness, and add a nested unknown key to the AC-03 proof.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design line 72 (CI prerequisites, "they never skip"), Context / Owner summary line 34, Test Plan AC-01, Tasks T13, Open Questions line 129, repository `AGENTS.md` (Local commands and constraints)
EVIDENCE: `AGENTS.md` names `bun test tests/vh-adlc` as the vh-adlc plugin checker for local use. The Design says "A missing prerequisite fails the website-check tests; they never skip" with no host condition, and the tests need Linux, Bubblewrap and Squid. On this macOS checkout at X, `bun test tests/vh-adlc/website-check/` gave 3 pass and 11 fail, with errors such as "Missing prerequisite: bwrap" and "Set WEBSITE_CHECK_PLAYWRIGHT_MODULE to the pinned playwright-core entry point". After this feature, the repository's documented local check cannot pass on macOS or on any host without these prerequisites. The hosted `checker-macos` job avoids this only because it runs an explicit file list (`.github/workflows/ci.yml:98-110`). The owner's answer in Open Questions is about hosted CI, while the Design states the rule without that limit. The document neither proposes a change to `AGENTS.md` nor says that the rule applies only to hosted CI.
PROPOSAL: Raise an Open Question on whether fail-not-skip applies only in the hosted `checker` job or on every host, and whether `AGENTS.md` should state the Linux prerequisites or give a portable local selection that leaves out website-check. Fold the answer into the Design and T13.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design line 72 ("or the job pins Squid 7.5"), Open Questions line 129, Tasks T13, `tests/vh-adlc/website-check/fixtures/README.md`
EVIDENCE: The Design lets the first hosted run decide between Ubuntu's packaged Squid and "the job pins Squid 7.5", but gives no source, checksum or updater-visible manifest for the 7.5 path. Pinned `conventions/delivery.md:188-199` requires downloading executable tools at an exact version, verifying an independently pinned checksum, rejecting a different preinstalled version, and keeping every pin discoverable by the update tool. A version hardcoded in a workflow script is called out there as invisible to updaters. T2's evidence and the fixtures README record that the tests passed with Squid 7.5, and Ubuntu's packaged Squid is a different version, accepted with no pin. One implementer could add an unverified source build in a workflow step, and another could accept whatever version apt installs. Either would meet T13 as written. This traces to the CI change this revision made.
PROPOSAL: State how the 7.5 fallback is obtained and verified, with its checksum and the manifest or Renovate custom manager that carries the pin. Also state whether the packaged path records and checks the installed Squid version.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary lines 32 and 36, Context / Background line 40
EVIDENCE: The new harm statement says the harm is a page that breaks in the built or deployed artifact "as the Stackweaver local build did, and stays broken for visitors until someone happens to notice". The same Context says the local run "used default configuration", with "no injected deploy settings" (line 52), and that its failure came from the localhost API default at `frontend/src/config.ts:45`. The deployed homepage returned 200 with only the expected anonymous 401 (line 54). The one cited example therefore never reached a visitor, and it may come from the missing deploy configuration rather than from a release defect. No observed visitor-facing break is cited, so the frequency ("recurs at every release") and the severity of the harm are not supported by the evidence given. That makes it harder to weigh the Squid, Bubblewrap and report machinery against the harm. This traces to the harm statement this revision added for R-10 F-04.
PROPOSAL: Cite an observed visitor-facing break, or state plainly that none has been observed. Describe the Stackweaver local result as a build run without release configuration, not as a failure visitors saw.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Tasks T3 evidence line
EVIDENCE: T3's evidence says "The Test Plan's Chromium and Firefox comparison stays untested because no task builds a confined Firefox runner." At X, the Test Plan has no Chromium and Firefox comparison. The previous revision moved it to #158, and the only Firefox mention left in the AC-03 row is the rejected `browser: firefox` profile.
PROPOSAL: Add a note that the comparison has since moved to #158, or drop the sentence the next time Tasks are edited.

### R-12

TARGET: 87e238777ec294f196f8e1a341248082b82b4b27

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design line 67 (profile contents and the defined key set), Design line 70 (header rules with a "configured string"), Design line 73 (enforcement and required rules), Context / Owner summary line 32 ("can each be enabled separately"), Test Plan AC-03, Tasks T6, T11 and T12, Open Questions line 133
EVIDENCE: Line 67 says the profile "selects the browser, origins, routes, capabilities, required rules, and precise expected responses", and that a profile "may make selected applicable adapters required". The same bullet then gives a closed key set: `target`, `origin`, `mode`, `browser`, `httpUpgradeUrl`, `expectedResponses` and `route`, with `route` holding one `path`, `visibleHeading`, `deadlineMs` and `requiredRequests`. It says "any undefined key at any of these levels, is invalid configuration". No key selects accessibility, Gitleaks, SEO, certificate or redirect checks, header presence or exact-value rules, the built artifact root, required rules or an enforcement policy. There is also only one `origin` and one `route`, not origins and routes. The values `mode` takes, and whether it may be left out when "Report mode is the default", are not stated. `plugins/vh-adlc/scripts/website-check/profile.ts:48` requires `mode === "report"` today. Under the closed set, T6 must either reject every profile that enables an adapter or break the key rule. One implementer will add keys and another will move capability and policy selection to CLI flags. This traces to the key list this revision added for R-11 F-01.
PROPOSAL: Complete the defined key set so it covers adapter selection, header rules, required rules and policy, routes and the values of `mode` and its default, or state which of these come from CLI arguments instead of the profile. Make the Owner summary and the first Design sentence agree with that choice.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design line 67 ("two explicit modes, build and deployed", key `mode`), Design line 71 ("For the local mode"), Design line 73 ("exits nonzero in either mode"), Terms table, Acceptance Criteria AC-03, Test Plan AC-01 ("Run both modes") and AC-03 ("Verify both modes", "Give both modes a profile")
EVIDENCE: The Design calls build and deployed "two explicit modes", and the AC-01 row's "Run both modes" means build and deployed. This revision also names the profile key `target` for build or deployed and the key `mode` for report or enforce (`profile.ts:4-6`). Line 73 uses "either mode" for report and enforce. The AC-03 row's "Verify both modes for passed checks, findings, optional failure" and "Give both modes a profile whose `browser` is `firefox`" can be read either way, so the T11 proof could cover build and deployed with no enforce run, or report and enforce with only one target. AC-03 requires "the glossary meanings for modes", but the Terms table has no row for mode or target.
PROPOSAL: Use one word for build and deployed, matching the `target` key, and keep "mode" for report and enforcement. Add the terms to the Terms table and say in the AC-03 row which pair each "both modes" means.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-03, Tasks T11, Design line 67 ("at any of these levels"), Context / Owner summary line 32 ("at any level"), Open Questions line 133 ("at every nesting level")
EVIDENCE: The Design defines four levels: top level, `route`, each required request and each expected response. It rejects an undefined key at any of them. The AC-03 row and T11 test only "an undefined top-level key" and "an undefined key inside `route`". An implementation that checks only those two levels passes the proof while silently ignoring an extra field such as `redirect` or `anonymous` in an expected response, or `query` in a required request. The existing checks at `profile.ts:53-55` validate only the required fields there and ignore extra ones.
PROPOSAL: Add a profile with an undefined key inside a required request and one inside an expected response to the AC-03 row and T11.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design line 67 ("separate runner argument, outside the profile"), Context / Owner summary line 32 ("A profile cannot add a trusted certificate authority"), Open Questions line 133, Test Plan AC-03 and AC-04, Tasks T6, T7 and T12
EVIDENCE: The fixture CA moves to "a separate runner argument" that "the test harness passes". The document does not say whether that argument exists only in the internal `runWebsiteCheck` API or is also accepted by `cli.ts` and the installed entry point. The AC-04 row invokes "the installed smoke entry on both marketplace routes" and the AC-03 row distinguishes certificate validation failure, and both run against fixtures that use their own CA (`tests/vh-adlc/website-check/fixtures/README.md:6-7`, `confinement.test.ts:36`). So one implementer ships a CA flag on the installed CLI, which any adopter pipeline can use to trust an extra CA and weaken "normal certificate validation" (Design line 70). Another keeps it internal and has to find another way to run the installed checks over HTTPS. The Owner summary only promises that the profile cannot add a CA.
PROPOSAL: State whether the shipped CLI accepts a CA argument, and if it does, how its use is shown in the report. Otherwise say how the installed and certificate proofs reach their HTTPS fixtures. Raise this as an Open Question if it changes the trust boundary the owner approved.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design line 74 ("A Renovate custom manager in the repository's `renovate.json`"), frontmatter covers (`renovate.json`), Tasks T13, Context / Owner summary line 36
EVIDENCE: At X there is no `renovate.json`; `git ls-files | grep -i renovate` is empty, and `gh api repos/michielvha/vh-adlc/contents/renovate.json` returns 404 on the default branch. Renovate already opens PRs here with no repository config file, for example #125 "update dependency bun to v1.4.5" and #106 "update dependency ubuntu to v26". So T13 creates the repository's first Renovate config file. That changes how Renovate resolves its config for the whole repository, and the document does not say whether the new file must keep the current inherited settings. The Design names no datasource for the Ubuntu Squid version or the Fedora package and its SHA-256. Pinned `conventions/delivery.md` ("Adding a dependency includes confirming the updater will propose its next version") and `knowledge/managed-renovate.md` ("A config file is not proof") require an observed confirmation. T13's done condition only checks the hosted job, and no proof row confirms that Renovate picks up the pin. The Owner summary does not mention the new updater config at all. This traces to the change this revision made for R-11 F-03.
PROPOSAL: Say that `renovate.json` is new and must keep the current inherited behavior, name the datasources that track the Squid pin and its checksum, and add a T13 done condition that observes Renovate detecting that dependency. Mention the new updater config in the Owner summary.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design line 74 ("a portable selection without `tests/vh-adlc/website-check/`"), Context / Owner summary line 36, Tasks T13, Open Questions line 133
EVIDENCE: Other tests already need Linux. `tests/vh-adlc/triage/execution.test.ts:504` spawns `flock`, and `.github/workflows/ci.yml:87-88` says "Managed verification and effect recovery require Linux/Bubblewrap/flock". The macOS job leaves out `tests/vh-adlc/triage/execution.test.ts`, `lifecycle/` and `loop/`, among others. If the portable selection is read as "all of `tests/vh-adlc` except website-check", `AGENTS.md` would document a command that still fails on macOS. The "like the hosted `checker-macos` job's file list" clause points at the right selection but does not require it.
PROPOSAL: Say that the portable selection in `AGENTS.md` is the `checker-macos` file list, not the full suite minus website-check.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: frontmatter covers (`AGENTS.md`)
EVIDENCE: `internal/fresh/fresh.go:164-180` marks a review stale with `covered-drift` when any covered path changes on the default branch. `git log -- AGENTS.md` shows routine docs pin bumps such as `8a21a1e0`, `ff8d7fe0`, `eae566bd` and `111af6c4`, and those have nothing to do with this feature. Covering `AGENTS.md` makes every future pin bump or unrelated instruction edit mark this document's spec and implementation reviews stale. This is the same pattern R-10 F-06 raised for `tests/vh-adlc/`, and it traces to the entry this revision added.
PROPOSAL: Drop `AGENTS.md` from `covers` and rely on T13's done condition for the instruction change, or keep it knowing that pin bumps will force re-review.

### R-13

TARGET: d5b0409bb8d50bae1f9f2e4c348483ddb9d70f5e

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design line 65 ("T6 adds the keys for adapter selection, header rules, required rules and the enforcement policy to the same profile schema, under the same rule"), Context / Owner summary line 30 ("a key the profile format does not define at any level"), Test Plan AC-03 ("an undefined key at each level the schema defines (top level, `route`, a required request and an expected response)"), Tasks T5, T6, T11 and T12, Open Questions line 133 ("at every nesting level")
EVIDENCE: This revision answers R-12 F-01 by letting T6 add the adapter, header rule, required rule and policy keys "under the same rule", but it names none of them. The AC-03 row's parenthetical fixes the levels it tests to the four browser-check levels, and T11 runs before T5 and T6. Header rules (presence and exact-value entries), adapter selection with the built artifact root and Gitleaks settings, and the enforcement policy all add new nested objects. No proof row or task tests an undefined key inside any of them. A T6 that rejects unknown keys only at the four listed levels passes every listed proof while silently ignoring a typo such as `exactvalue` in a header rule, which is the silent misconfiguration the closed key set exists to stop. The key names themselves are left to the T6 implementer, so two implementers would ship different adopter-facing profile shapes. This traces to the change this revision made for R-12 F-01.
PROPOSAL: Name the keys and nesting levels T6 adds, or name the schema file that will define them, and extend the AC-03 row and T5 so an undefined key is tested at every level the final schema defines, not only the four browser-check levels.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-03 ("For each target in both report and enforce mode, give a profile whose `browser` is `firefox` ..."), Tasks T11 ("Observe them fail before T12") and T12, Design line 65 ("Enforce mode requires an explicit policy")
EVIDENCE: The Design says enforce mode requires an explicit policy, and the policy keys only arrive with T6, after T11 and T12. Until then no enforce-mode profile can be valid, so each enforce-mode rejection case is rejected whatever its `browser`, unknown key or CA setting. At X, `plugins/vh-adlc/scripts/website-check/profile.ts:48` throws for any `mode` other than `report`, and `runner.ts:8` calls `resolveProfile` before the proxy, boundary or browser starts. So the enforce-mode half of T11 already passes before T12, and its "Observe them fail before T12" step cannot be met. Even after T6, the row does not require each rejected profile to be otherwise valid with a valid policy. An implementation that ignores `browser` or unknown keys in enforce mode passes as long as the test profile also lacks a policy.
PROPOSAL: State in the AC-03 row that each rejected profile is otherwise valid, with a valid enforcement policy in enforce mode, and that the test asserts the rejection reason. Move the enforce-mode cases to T5 or after T6, or say that only the report-mode cases are red before T12.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design line 65 ("An existing Playwright suite can call the shared runner from a dedicated project" and "Only the internal runner API that the tests call takes a fixture CA argument"), Context / Owner summary line 30 ("Neither a profile nor the shipped command can add a trusted certificate authority"), Open Questions line 135, Tasks T12
EVIDENCE: The same Design bullet makes the shared runner something an adopter's existing Playwright suite calls directly, and makes the runner API the one place that accepts a fixture CA. The runner ships inside the installed plugin (`plugins/vh-adlc/scripts/website-check/runner.ts`, exported `runWebsiteCheck`), so whether adopter suites get the CA-accepting function is not settled. One implementer exposes `runWebsiteCheck` with its CA argument to adopter projects, so any adopter can trust an extra CA and weaken the "normal certificate validation" in Design line 68. Another keeps a CA-free adopter entry point and a test-only function. The shipped runner also takes test-only overrides the Design does not mention: `chromium.ts:21` and `:60` read `WEBSITE_CHECK_SQUID` and `WEBSITE_CHECK_SQUID_ROOT` to replace the deny-by-default proxy executable, and `:84` passes `WEBSITE_CHECK_SQUID_LIB` as `LD_LIBRARY_PATH`. This traces to the change this revision made for R-12 F-04.
PROPOSAL: State which entry point adopter suites call and that it takes no CA argument, and keep the CA-accepting function reachable only from the tests. Say whether the Squid override variables stay in the shipped runner, and if they do, how the report shows their use.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design line 65 ("Reuse its configured Playwright runtime" and "An existing Playwright suite can call the shared runner"), Design line 72 ("playwright-core 1.64.1 pinned by a lockfile under `tests/vh-adlc/website-check/`"), Test Plan AC-01 (existing-suite fixture), Tasks T13
EVIDENCE: The shipped runner refuses every Playwright version except one: `plugins/vh-adlc/scripts/website-check/chromium.ts:25-26` throws "Website smoke requires playwright-core 1.64.1" for any other version, and `tests/vh-adlc/website-check/fixtures/existing-suite.ts:19-20` hardcodes the same version. The Design promises to reuse an existing adopter's configured Playwright runtime. The AC-01 existing-suite fixture runs on the same 1.64.1 runtime, so the proof passes while any adopter on another version is refused. This repository already shows the mismatch: `tests/remote-gui/package.json` with its `bun.lock` pins playwright-core 1.65.1. T13 then adds a second, older playwright-core pin. Renovate will propose a bump on that new lockfile that the hardcoded checks reject, which conflicts with pinned `conventions/delivery.md` ("A version and checksum hardcoded in a script are invisible to Dependabot and Renovate").
PROPOSAL: State which Playwright versions the shared runner supports for existing suites and how it checks them, and give the existing-suite fixture a runtime version different from the generic runner's pin, or limit the reuse claim to the pinned version. Say whether T13 reuses the repository's existing playwright-core pin or keeps a separate one that the updater can bump without editing code.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design line 72 ("Ubuntu 24.04's Squid 6.14 passed all 14 website-check tests on 2026-11-23"), Context / Owner summary line 34
EVIDENCE: The claim gives no log path or command output, though Context and Design claims must be cited. The `checker` job runs on `ubuntu-latest` (`.github/workflows/ci.yml:25`), not on 24.04, so the Squid version the hosted job installs may not be the one tested. The Design already says the job logs its version and that the confinement tests run on every push.
PROPOSAL: Cite the log of the 6.14 run, and say that the hosted job's Squid version follows `ubuntu-latest`.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context / Background line 56 (`observations.ts:186-192`)
EVIDENCE: At X, `plugins/vh-adlc/scripts/website-check/observations.ts:186-192` holds `#isExpected` and `#outcome`, which classify a response from its status. The unfinished transfer is recorded at line 222 (`transfer: open ? "unfinished" : "finished"`).
PROPOSAL: Cite lines 186-192 for the classification and line 222 for the unfinished transfer record.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design line 71 ("machine mode", "plain mode is selected"), Test Plan AC-03 ("in terminal mode"), Terms table row Mode, Acceptance Criteria AC-03 ("the glossary meanings for modes")
EVIDENCE: This revision defines Mode in the Terms table as report or enforce only, and AC-03 holds the command, report and skill to the glossary meanings for modes. The Design and the AC-03 row still use "mode" for output kinds: machine mode, plain mode and terminal mode. The command's user-facing text could then use "mode" in two senses. This traces to the R-12 F-02 change. Gitleaks "directory mode" is the tool's own term and is fine.
PROPOSAL: Call the output kinds "machine output", "plain output" and "terminal output", or add them to the Terms table as distinct from Mode.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Design line 72 ("`AGENTS.md` states that `bun test tests/vh-adlc` needs Linux and these prerequisites"), Tasks T13
EVIDENCE: The full `bun test tests/vh-adlc` run in the `checker` job also depends on setup outside the smoke prerequisites: the AppArmor sysctl (`.github/workflows/ci.yml:41`), libxml2-utils for `xmllint` (`ci.yml:36`, used at `tests/vh-adlc/diagram/grade.ts:27`), the Go-built YAML reader (`ci.yml:50-51`), and GNU mv built from coreutils 9.7 (`ci.yml:59-68`). An `AGENTS.md` line that names only Linux and the smoke prerequisites would describe a command that still fails on a Linux host that has just those.
PROPOSAL: Have `AGENTS.md` say the full selection needs the `checker` job's setup, including the smoke prerequisites, rather than only the smoke prerequisites.

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
