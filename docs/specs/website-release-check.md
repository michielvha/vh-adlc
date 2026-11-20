---
status: draft
status_description: "Initial draft based on the Stackweaver browser comparison. Owner decisions recorded and R-1 findings addressed. Follow-up independent review pending."
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

Start with Playwright, the existing SEO evidence toolkit, and the project's installed secret scanner. Use axe through Playwright for automated accessibility checks. The SEO adapter uses the installed canonical analyzer bundle from the shared SEO feature. Use the local MDN HTTP Observatory CLI for deployed header findings if its current rule output fits the report. The shared code supplies browser event collection where an existing runner lacks it, tool adapters, and a consistent report. Browser smoke coverage requires Playwright and a supported browser. The default profile needs Chromium only. Accessibility, SEO analysis, secret scanning and deployed header checks can each be enabled separately. The command exits with an error if required evidence is incomplete. A completed report-only run can contain findings and still exit successfully. Enforcement additionally fails on violations of required rules.

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

- Provide a script in the shared plugin with two explicit modes, build and deployed. Each consumes a checked-in YAML profile that selects origins, routes, capabilities, required rules, and precise expected responses. The adopter owns how the production artifact is built and served. Reuse its configured Playwright runtime and compatible page assertions. Release runs use a dedicated anonymous browser scenario with real responses. They cannot inherit route interception, seeded session state or authenticated setup. A minimum profile selects one route and one visible page assertion. An existing Playwright suite can call the shared runner from a dedicated project. For a new adopter, the plugin provides a generic anonymous smoke scenario driven by the profile, run with a pinned Playwright runtime and Chromium installed through documented repository setup. Firefox is opt-in for the release check. Optional adapters are disabled unless selected. A disabled adapter is not applicable to this run. A selected adapter with a missing prerequisite is skipped with a reason. Report mode is the default. Enforce mode requires an explicit policy. The browser check is required in both modes. A profile may make selected applicable adapters required. Reject policies that require disabled or inapplicable checks before starting.
- Capture each selected page in a fresh browser context. Attach Playwright listeners before navigation for console errors, uncaught page errors, failed requests, and HTTP responses. Record browser version, route, request method, resource type, sanitized URL and source location, and observed status or error text. Group repeated events while preserving their count. Each route names a visible assertion, any required requests by method and URL, and a positive deadline covering navigation and observations. Start the deadline immediately before navigation. Wait for navigation, the assertion, and a terminal outcome for each named request. Stop at completion or the deadline and record the observation boundary. A completed error response can fail its check. A required request without a terminal observation by the deadline makes coverage incomplete. If navigation succeeded and the assertion is false at the deadline, record an assertion failure.
- Classify a declared anonymous session response as expected only for its exact method, origin, path, resource type, status and anonymous context. The separate Stackweaver adoption will declare that its deployed profile allows only the same-origin fetch `GET https://stackweaver.sh/auth/session` with status 401 in a fresh anonymous context. Match the full normalized URL including query, with no redirect and no query in this exception. Other profiles declare their own exceptions, including any local equivalent. Apply the exception only to the matching HTTP response. Console messages and page errors keep separate records. Console messages without reliable request identity remain diagnostic observations with no attribution to the expected response. Required failures come from typed browser or HTTP observations and assertions, including captured Content Security Policy violations and uncaught page errors. Keep the sanitized observation and reason. A script returning the same status, a changed endpoint status, or a CSP-blocked connection remains actionable. A public-only profile explicitly shows login and private API journeys as outside its scope.
- When enabled, invoke the canonical `plugins/vh-adlc/scripts/seo/evidence.js` bundle through Bun from the plugin installation. The [shared SEO assessment feature](seo-assessment.md) owns generating that bundle from `tools/seo-evidence/` with its license and provenance. The enabled SEO adapter depends on a released plugin containing that bundle. Base browser checks can ship independently with SEO disabled. Both marketplace manifests package `plugins/vh-adlc` as the release artifact. Use Playwright with axe for automated accessibility and reuse the adopter's pinned Gitleaks version and config. Run its directory mode on the explicit built artifact root with redacted JSON and a distinct configured finding exit code. Validate the report and classify scanner errors as incomplete evidence. For deployed headers, prefer the local MDN HTTP Observatory CLI and retain individual outcomes. Use ordinary HTTPS requests for redirects and certificate validation when the tool output does not already cover them.
- Apply the profile's exact origin and scheme allowlist to browser navigations, subresources and adapter requests, including every redirect hop. Local builds can explicitly allow loopback HTTP. The deployed check starts on HTTPS. An explicit HTTP-to-HTTPS check may start on the HTTP origin of the configured deployment and only upgrade to an allowed HTTPS origin. Reject HTTPS downgrades and off-scope hops before the next request and record the reason. Run a network adapter only when its requests can be confined to that policy. Otherwise report it as skipped and name the limitation.
- Match expected responses in memory before sanitizing. Persist sanitized observations and selected structured tool results. Exclude query values, fragments, user info, cookies, credentials, raw browser diagnostics and tool transcripts. Persist a browser diagnostic as a safe category and source location. Retain a normalized message only when its fields are on an explicit safe list. For SEO, pass anonymous response HTML to the analyzer in private per-run scratch and retain only sanitized structured findings in the shared report. Strip or omit any free-text field that cannot be safely projected. Treat collected content as evidence, never as instructions.
- Emit versioned JSON on stdout in machine mode. Diagnostics go to stderr. Human output uses labelled statuses and plain text when piped or when plain mode is selected. Keep ANSI controls out of machine and plain streams. Record the tested commit or artifact digest, when known, the deployed URL, selected profile, tool versions, and per-rule pass, fail, skipped, not applicable, or expected result. Record unavailable release identity explicitly. Write reports locally, in a new directory for each run. Publish the report atomically with its checksum in a versioned completion marker written last. Preserve completed partial reports and interrupted run directories. The skill reads a single explicit report, verifies its marker, version and checksum, and refuses incomplete or unsupported inputs. It labels completed partial coverage and proposes fixes from retained evidence. A run with invalid configuration, failed startup, incomplete required coverage or a report write error exits nonzero in either mode. A completed report-only run exits zero even with findings. Enforcement also exits nonzero for failed required rules. Optional failures or missing optional tools appear in the report and do not change the exit status.
- Validate packaging through the existing plugin build and installation path. Pin adopter tool versions using the existing runtime or lockfile. Document the minimum browser setup, production serve command, public route assertions, and optional adapters in the installed skill's adoption procedure. Align that procedure with the pinned shared frontend testing convention. The companion convention draft at local commit `1680a2742f37f419e4e4b01d25a918a76ec05184` extends `conventions/frontend-testing.md` and `guides/onboard-a-repository.md`. Publication of the shared convention and consumer pin updates have their own delivery paths. Allow an adopter to opt out by removing the check invocation and its profile. Deliver the shared plugin against generic fixtures. Adopt it separately in Stackweaver after release, in report mode. That consumer change must verify the real configured local build and deployed origin and retain their reports. Enabling a Stackweaver gate is a separate change.

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
- [ ] AC-03: The command, report and skill use the glossary meanings for modes and outcomes. The report identifies what enabled tools checked and what they could not check. Report-only mode records findings without blocking a completed run. Both modes reject invalid configuration and incomplete required coverage. Enforcement additionally rejects failures of required rules.
- [ ] AC-04: A project can invoke the installed skill to interpret an existing report and trace its findings to sanitized evidence without rerunning checks. The skill rejects unfinished or unsupported reports.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run both modes against a locally served production fixture and an owned HTTPS deployment fixture. Check that both execute the same route assertions and that deploy-only observations are present only in the deployed report. Prove the same one-route smoke profile works in a minimal static fixture with no existing Playwright suite and no optional tools. In an existing-suite fixture, show that the release scenario observes a real backend failure masked by the ordinary mocked test. Run with third-party scanning services unavailable. Verify that an off-scope subresource or redirect destination is never contacted and that an adapter unable to honor the profile is skipped. |
| AC-02 | Serve an anonymous session 401, a required script returning 401, a wrong query or method with a 401, a redirected 401, and a page with a connection refused by CSP. Also emit an unrelated console error and make a different request to the same URL in that visit. Assert that only the exact HTTP observation is expected and console diagnostics remain independently visible with sanitized fields. Include a delayed required resource failure, a required request that never appears and a false visible assertion. Assert distinct outcomes. Include a synthetic sensitive value in a request query and echoed browser and adapter diagnostics. Verify its absence in markers, reports and retained artifacts while the observations remain traceable. Check Chromium and Firefox differences without depending on identical console wording. |
| AC-03 | Exercise real outputs from the enabled tools. Put a synthetic secret only in the built output and exercise a Gitleaks execution error. Assert distinct outcomes and redacted findings. Check piped human output and JSON stdout with separate stderr for success, failure, skipped and partial runs. Verify both modes for passed checks, findings, optional failure, missing optional tools, missing required browser, an inconsistent policy, interrupted collection and a failed report write. Assert coverage and exits. Verify concurrent attempts do not share output directories and that interruption before the marker leaves no readable completed report. |
| AC-04 | Install the packaged plugin in a fresh supported environment. Enable SEO in a fresh marketplace installation whose bundle includes the analyzer. Run the check without the source checkout. Give the skill a saved fixture report and verify its findings cite the sanitized records and identify skipped checks. Pass an interrupted report, a replaced report with a mismatched checksum and a report with an unsupported version. Verify that none is interpreted and that a completed partial report is identified as partial. |

## Tasks

None yet. Task breakdown follows acceptance.

## Open Questions

None. The owner selected report mode first and approved explicit run outcomes and bounded observation, scoped and sanitized evidence, and a separate Stackweaver adoption. Lighthouse remains outside the shared tool.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

| 2026-11-19 | R-1 | spec | `24e61d66d71bbc1562f8208edb9bb41035ffaa0f` | unknown | procedural | One blocking, twelve should-fix and one nit |

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

## Sources

- [Stackweaver homepage](https://stackweaver.sh/), observed deployed navigation and anonymous session response.
- [VibeCodeCheck report](https://vibecodecheck.nl/scan/7261c49e-8e0d-4614-b3ef-59fec3db92f5), the owner's pasted findings include three 401s and 34 console errors.
- [Playwright ConsoleMessage API](https://playwright.dev/docs/api/class-consolemessage), console event fields.
- [Playwright network events](https://playwright.dev/docs/network), browser request and response observation.
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing), integration with axe.
- [MDN HTTP Observatory](https://github.com/mdn/mdn-http-observatory), local CLI and rule results.
- [Gitleaks](https://github.com/gitleaks/gitleaks), file and directory secret scanning.
- [Lighthouse CI configuration](https://googlechrome.github.io/lighthouse-ci/docs/configuration.html), optional local browser budgets.
