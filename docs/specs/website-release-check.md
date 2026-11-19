---
status: draft
status_description: "Initial draft based on the Stackweaver browser comparison. Independent review pending."
issue: null
goal: "Run repeatable website release checks against a locally served production build and an owned deployed URL without a hosted scanning service."
covers:
  - plugins/vh-adlc/skills/vh-adlc-website-check/
  - plugins/vh-adlc/references/website-check.md
  - plugins/vh-adlc/scripts/website-check/
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tools/seo-evidence/
  - tests/vh-adlc/
---

# Plan: Website release checks

## Context

### Owner summary

Run the same browser smoke checks against the local production build and the deployed site. The command runs directly from a terminal or pipeline. A vh-adlc skill reads its results, explains failures, and points to the project code and deploy configuration that own each fix. Each adopter supplies a short profile with a route, a page assertion and any site-specific expected responses. Stackweaver starts in report mode. Other projects can start with just a public homepage and add coverage as needed.

Start with Playwright, the existing SEO evidence toolkit, and the project's installed secret scanner. Use axe through Playwright for automated accessibility checks. Use the local MDN HTTP Observatory CLI for deployed header findings if its current rule output fits the report. The shared code supplies browser event collection where an existing runner lacks it, tool adapters, and a consistent report. Browser smoke coverage requires Playwright and a supported browser. The default profile needs Chromium only. Accessibility, SEO analysis, secret scanning and deployed header checks can each be enabled separately. A missing tool is reported per check, and incomplete required coverage prevents an enabled gate from passing.

The Stackweaver comparison already shows why the two targets need their own evidence. Both browsers saw the deployed homepage return 200 and make one signed-out session request that returned 401. Chromium reported that request as a console error. The clean local build served by its pinned Nginx image had a different failure: its default API URL points to localhost, and the page's policy blocked session and health requests. The local run used default configuration and the deployed artifact identity is unknown. The original scanner's full finding counts were not reproduced.

### Background

- Stackweaver source was exported from fetched `origin/main` at `72e48ed577af958034d6aa598e2835ef36ccdb8c`. `npm run build` exited 0. `frontend/Dockerfile` uses that build command and a pinned Nginx image. The browser run mounted the resulting files and the build's generated Nginx configuration into that image, with no injected deploy settings.
- Fresh anonymous Chromium 158 and Firefox 159 visits waited for the load event and observed seven more seconds. Local Nginx returned 200 in both and logged 12 and 7 console errors respectively. The errors name the policy blocking `http://localhost:8022/auth/session` or `/health` and follow-on fetch failures. There were no observed 401 responses in that Nginx run. The plain static server control returned one 401 per engine from the local API, which the browser could reach without the Nginx response policy.
- The deployed homepage returned 200 in both engines and one 401 each from `https://stackweaver.sh/auth/session`. Chromium logged one console error for that response. Neither engine reported an uncaught page error or transport failure. No other 401s were observed. This is one visit per engine per measured target.
- In that Stackweaver revision, `frontend/src/config.ts:45` defaults the API URL to localhost and `frontend/src/lib/zitadel.ts:96-98` maps a session 401 to an anonymous session. `e2e/tests/public-seo.spec.ts:388-389` already exercises public browser navigation and collects page errors. `scripts/verify-local.sh:209-221` already invokes Gitleaks for repository changes.
- In vh-adlc at `84e59c898cbdb0bd4e76bd207b30a5356b495b32`, `tools/seo-evidence/README.md:25-32` describes the offline snapshot and inspection commands. Its policy section at line 125 defaults to report only. Reuse its bundle and finding formats for the evidence it already handles.

## Scope

Check explicitly configured routes on two targets: the adopter's locally served release artifact and its owned deployed site. Cover browser startup, required resources, automated accessibility, technical SEO metadata and links, built files for secrets, and deployed TLS, redirect, and header observations. The tool reports on public routes. Authenticated journeys, where relevant, belong to the adopter's existing test suites and do not count as covered by the public run. Scope excludes exploit probes, guessed endpoints, external scoring parity, ranking claims, publication and hosted monitoring.

## Design

- Provide a script in the shared plugin with two explicit modes, build and deployed. Each consumes a checked-in YAML profile that selects origins, routes, capabilities, required rules, and precise expected responses. The adopter owns how the production artifact is built and served. Reuse its configured Playwright runtime and existing route fixtures where possible. A minimum profile selects one route and one visible page assertion. An existing Playwright suite is reused when present. For a new adopter, the plugin provides a generic anonymous smoke scenario driven by the profile, run with a pinned Playwright runtime and Chromium installed through documented repository setup. Firefox is opt-in for the release check. Optional adapters are disabled unless selected. A disabled adapter is not applicable to this run. A selected adapter with a missing prerequisite is skipped with a reason. Stackweaver's first adoption is report only, as the owner decided. Enforcement requires an explicit policy.
- Capture each selected page in a fresh browser context. Attach Playwright listeners before navigation for console errors, uncaught page errors, failed requests, and HTTP responses. Record browser version, route, request method, resource type, sanitized URL and source location, and observed status or error text. Group repeated events while preserving their count. Use existing assertions for required page content so a successful HTTP response alone cannot pass.
- Classify a declared anonymous session response as expected only for its exact method, origin, path, resource type, status and anonymous context. Stackweaver's deployed profile allows only the same-origin fetch `GET https://stackweaver.sh/auth/session` with status 401 in a fresh anonymous context. Match the full normalized URL including query, with no redirect and no query in this exception. Other profiles declare their own exceptions, including any local equivalent. Do not carry the Stackweaver exception across targets or apply it to unrelated console or page errors. Keep the original observation and reason. A script returning the same status, a changed endpoint status, or a CSP-blocked connection remains actionable. A public-only profile explicitly shows login and private API journeys as outside its scope.
- Use the existing SEO evidence toolkit for saved HTML and link analysis. Use Playwright with axe for automated accessibility and consume the adopter's configured Gitleaks invocation for built files, with redaction. For deployed headers, prefer the local MDN HTTP Observatory CLI and retain individual outcomes. Use ordinary HTTPS requests for redirects and certificate validation when the tool output does not already cover them. Add Lighthouse CI only when the adopter needs lab performance budgets.
- Emit versioned JSON plus a short human summary. Record the tested commit or artifact digest, when known, the deployed URL, selected profile, tool versions, and per-rule pass, fail, skipped, not applicable, or expected result. Record unavailable release identity explicitly. Keep failed attempts and write each retry or parallel run to its own directory. Treat failure to complete a required check as an unsuccessful gate. Write reports locally. The skill reads the report and proposes fixes from its evidence.
- Validate packaging through the existing plugin build and installation path. Pin adopter tool versions using the existing runtime or lockfile. Document the minimum browser setup, production serve command, public route assertions, and optional adapters in the installed skill's adoption procedure. Align that procedure with the pinned shared frontend testing convention. The companion draft extension to that convention documents the repository-owned release smoke pattern. Publication of the shared convention and consumer pin updates have their own delivery paths. Allow an adopter to opt out by removing the check invocation and its profile. Existing SEO assessment and release workflows keep their current behavior until a consumer adopts this check.

## Acceptance Criteria

- [ ] AC-01: A project with either an existing Playwright suite or the documented minimum browser setup can run the same configured public route checks against a production build and its deployed origin without an external scanning service or model.
- [ ] AC-02: A known anonymous session response remains visible as expected, while a blocked connection, failed required asset, or unexpected status is reported with enough evidence to locate it.
- [ ] AC-03: The report identifies what the enabled tools checked and what they could not check. An explicit gate rejects failures and incomplete required coverage.
- [ ] AC-04: A project can invoke the installed skill to interpret an existing report and trace its findings to the evidence without rerunning the checks.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run both modes against a locally served production fixture and an owned HTTPS deployment fixture. Check that both execute the same route assertions and that deploy-only observations are present only in the deployed report. Prove the same one-route smoke profile works in a minimal static fixture with no existing Playwright suite and no optional tools. Run with third-party scanning services unavailable. |
| AC-02 | Serve an anonymous session 401, a required script returning 401, a wrong query or method with a 401, a redirected 401, and a page with a connection refused by CSP. Assert distinct outcomes, sanitized URLs, and retained browser evidence. Check Chromium and Firefox differences without depending on identical console wording. |
| AC-03 | Feed actual outputs from Playwright, axe, the SEO toolkit, Gitleaks, and the deployment header tool. Compare an all-pass run with required failure, tool absence and interrupted collection. Assert reported coverage and gate exits, plus separate artifacts for parallel runs. |
| AC-04 | Install the packaged plugin in a fresh supported environment. Give the skill a saved fixture report and verify its findings cite the matching records and identify skipped checks. |

## Tasks

None yet. Task breakdown follows acceptance.

## Open Questions

None. The owner selected report mode for the initial Stackweaver adoption.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Stackweaver homepage](https://stackweaver.sh/), observed deployed navigation and anonymous session response.
- [VibeCodeCheck report](https://vibecodecheck.nl/scan/7261c49e-8e0d-4614-b3ef-59fec3db92f5), the owner's pasted findings include three 401s and 34 console errors.
- [Playwright network events](https://playwright.dev/docs/network), browser request and response observation.
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing), integration with axe.
- [MDN HTTP Observatory](https://github.com/mdn/mdn-http-observatory), local CLI and rule results.
- [Gitleaks](https://github.com/gitleaks/gitleaks), file and directory secret scanning.
- [Lighthouse CI configuration](https://googlechrome.github.io/lighthouse-ci/docs/configuration.html), optional local browser budgets.
