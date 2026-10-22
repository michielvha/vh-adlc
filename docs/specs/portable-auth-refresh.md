---
status: draft
status_description: "Owner requirements captured; independent review and acceptance pending."
issue: null
goal: "Install and use the same auth-refresh workflow independently or from vhco-tools across supported harnesses, preserving Claude phone notifications."
covers:
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - tests/auth-refresh/
  - README.md
---

# Plan: Portable auth-refresh

## Context

The owner selected a separately installable auth-refresh plugin in the shared marketplace on
2026-10-22. It must also install from its own repository. Installing vh-adlc alone must not make
credential refresh a dependency of the development loop. Claude's existing MFA phone notification
and continuation behavior must keep working.

The canonical runtime is `michielvha/auth-refresh` at
`ceaea336fd14e3e270f49cedcb72e89f9e5243fd`. Its root `.claude-plugin/plugin.json` declares an
agent plugin; `agents/auth-refresh.md:4` restricts its prompt to Claude tool names. There is no shared
skill entry point or portable root manifest at this revision. Its README, Agent runtime section,
explicitly describes Claude background completion and PushNotification assumptions.

The shared repository already has both native marketplace formats and portable plugin packaging:
`.agents/plugins/marketplace.json:1`, `.claude-plugin/marketplace.json:1` and
`plugins/vh-adlc/plugin.json:1`, inspected at `0e26cb5`.

On this Fedora host, the canonical runtime built without edits and passed
`AUTH_REFRESH_E2E=1 go test -count=1 ./...` and `go vet ./...`. An actual AWS device-code login used
the admin lane, Okta password, number-match MFA and AWS confirmation/consent. STS verified all nine
configured profiles. Saving 7,318 bytes, stopping/restarting the admin lane and calling `lane whoami`
restored the expected identity. The normal lane remained unauthenticated. This contradicts
`agents/auth-refresh.md:110`, which treats saves below 20,000 bytes as failed.

The broader read-only check classified a silent Azure timeout as DEAD. Code at
`internal/check/check.go:211` treats every nonzero Azure probe as DEAD. Docker at line 480 and HTTP
tokens at line 488 likewise classify transport failures as expired credentials. The configured AKS
context and PAT/Sonar token files are absent here. These observations do not establish provider login
coverage. A real Azure device-code attempt produced no URL or code and was canceled. The race suite
could not build because this host has no C compiler.

## Scope

Coordinate changes in this marketplace and the standalone auth-refresh repository. Keep runtime,
shared skill instructions and compatibility adapters owned by auth-refresh. This document tracks
the combined acceptance scenario; runtime work is reviewed in that repository and marketplace work
in this one. `covers` above applies to this repository only.

Preserve Claude phone pushes and existing explicit agent invocation. Add standalone portable discovery,
shared-marketplace discovery, verified runtime provisioning, host capability handling and tests for
every supported identity type. Correct demonstrated classification and saved-session defects.

Do not migrate the old setup, delete credentials, log out of providers, switch a shared GitHub account,
publish secrets, or claim untested OS/client support. Publishing releases or switching an installed
daily-use setup requires the owner's explicit release or cutover instruction.

## Design

### One component and two installation routes

Auth-refresh remains its own repository and binary. Publish a portable root plugin manifest alongside
the existing Claude manifest and expose one canonical `skills/auth-refresh/SKILL.md`. Shared workflow
instructions live in that package; the existing Claude agent becomes a compatible entry point to
them, retaining its tool declarations and explicit invocation behavior. Both routes load the same
provider procedures and capability references. Do not maintain a second workflow in vh-adlc.

Add auth-refresh as a separate entry to both vhco-tools marketplace formats, referencing an immutable
auth-refresh revision. Validate each client's source format against its native installer before
claiming it works. Verify that both marketplace formats resolve the same component revision. The
current marketplace formats are shown in the Context citations; neither currently has auth-refresh.

An installer in auth-refresh resolves a platform-specific release from a committed lock, verifies the
download and binary digests before execution, and writes only to the user cache. Missing artifacts,
unsupported platforms and digest mismatches stop with actionable errors. A local Go toolchain or a
checkout under `/home/m/code` is not an installation dependency. Existing host config and credentials
are reused privately; installation does not initiate MFA or install system packages.

### Host capabilities and notification compatibility

Use one provider workflow with explicit capability selection for progress delivery, phone notification,
long-running commands and continuation. On Claude, preserve PushNotification, immediate MFA-number
delivery, end-of-turn behavior and the confirmation watcher. Other hosts may use an equivalent
available notification adapter, but must not silently replace a requested phone push with chat text
or pretend to have delivered one. A host without the required notification capability reports that
limitation before starting an unattended login. Interactive use can show the number immediately in
chat and complete the flow in the main conversation when the owner chooses that mode.

Notification adapters receive only provider, account label and MFA number or device authorization
instructions. Never send passwords, tokens, cookies, assertions or session files. Test missing and
failed notification delivery, stale challenges and bounded retries. Keep one outstanding push across
lanes, cancel abandoned challenge pages and finish post-MFA consent without asking whether the owner
tapped. Host-specific instructions must not require unavailable tools on another host.

### Runtime correctness and acceptance

Use successful identity checks and real saved-session restoration to validate sessions; remove the
20 KB threshold. For every identity type, distinguish absent credentials, explicit authentication
rejection, insufficient permissions, missing host setup, service outage, timeout and unknown output.
Network and permission failures must not dispatch a login. HTTP service health never dispatches an
authentication flow. Token checks continue to report manual-renewal requirements instead of minting
PATs. Preserve expected-account verification and lane isolation.

Run fake-provider browser tests without live credentials and real-provider acceptance separately.
The real matrix covers AWS, Azure, Okta admin and normal lanes, AKS/EKS, GitHub, registry, HTTP token
validation and service health. Only refresh flows the tool actually supports are required: checking
a manual PAT and reporting its owner action is not an automatic PAT renewal feature. Record exact
target revisions and observable outcomes, including notification arrival on the phone. Missing
credentials, network access or a native host leave that row untested; a fixture pass cannot close it.

## Acceptance Criteria

- [ ] AC-01: Auth-refresh installs and is discoverable as a separate plugin from vhco-tools and directly from its own repository on each claimed harness, without installing vh-adlc or requiring a source checkout.
- [ ] AC-02: Both install routes load the same canonical workflow and a verified pinned runtime; corrupt downloads, missing artifacts and unsupported platforms fail before executable code runs.
- [ ] AC-03: Claude's existing MFA phone push, immediate number delivery, background continuation and post-MFA confirmation complete a real login with the same user interaction as before.
- [ ] AC-04: Other claimed harnesses complete the shared workflow using available capabilities, and missing or failed required phone notifications are surfaced before an unattended challenge starts.
- [ ] AC-05: All identity types distinguish credential rejection from transport, permission and setup failures; only supported credential failures offer a login, and manual tokens remain manual.
- [ ] AC-06: A saved authenticated session survives lane restart, the expected identity is verified, distinct lanes cannot share credentials or cookies, and abandoned challenges stop generating pushes.
- [ ] AC-07: Each claimed real-provider operation in the acceptance matrix succeeds on its target host, including Azure and AWS login, Okta lanes, Kubernetes identity, GitHub status, registry access, HTTP token validation and service-health reporting.
- [ ] AC-08: Installation, update and uninstall preserve private host config and credentials, the independent Claude entry point remains usable, and migration instructions permit returning to the previous setup without logging out.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Fresh native-client profiles install from each source, enumerate the skill and invoke a read-only check. Verify auth-refresh-only installation does not load ADLC. Record exact client versions and sources. |
| AC-02 | Installer tests execute with a local HTTP artifact fixture: valid artifact, wrong digest, corrupted archive, missing asset, unsupported platform, offline cache, wrong preinstalled binary. Native installs resolve the same pinned revision. |
| AC-03 | Live Claude daily-use surface: initiate one cold login, confirm notification arrives on locked phone with matching account/provider/number, tap once, observe confirmation and CLI success without another owner prompt. Repeat warm flow without an unnecessary push. |
| AC-04 | Fake-provider native-host scenarios plus actual claimed host run: immediate number visibility, continuation after approval, notification transport failure and missing capability before challenge. Never count a chat message as proof of phone delivery. |
| AC-05 | Table-driven CLI and HTTP-server regressions for every identity type, including silent Azure timeout, registry transport failure, HTTP 401/403/429/5xx, TLS and DNS errors, malformed data, missing files and missing tools. Assert status, exit code and absence/presence of suggested login. |
| AC-06 | Mandatory real-browser fake-IdP tests cover two lanes, mismatched credentials, saves below 20 KB, restart, passive status/whoami, simultaneous callers and cancellation. Real IdP restart verifies expected account without another push. |
| AC-07 | Execute each real-provider row after host prerequisites exist. Use read-only identity/API checks, confirm deliberate login success where applicable, record missing inputs as untested and keep criterion open. Run full Go suite, browser suite, vet, module checks, configured lint and supported race checks. |
| AC-08 | Fresh profile tests and manual compatibility trial exercise update/uninstall while preserving sentinel config and credentials. Follow documented old-agent invocation and rollback with no logout or cache deletion. |

## Tasks

None yet; populate after independent review and owner acceptance.

## Open Questions

None. The owner selected a separate marketplace plugin and retained Claude phone notifications.
Unavailable host capabilities and real-provider prerequisites remain acceptance blockers, not waived tests.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): review and acceptance before implementation; one feature document and explicit unmet criteria.
- [Pinned delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): immutable executable downloads and coordinated reviewed delivery.
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): portable plugin manifests and native plugin installation; actual host compatibility still requires the tests above.
