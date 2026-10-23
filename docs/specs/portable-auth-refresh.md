---
status: in-progress
status_description: "Signed runtime and automatic previews verified; both remote CLI install routes pass, with phone and remaining host acceptance open."
issue: null
branch: feat/portable-auth-refresh
goal: "Install and use the same auth-refresh workflow independently or from vhco-tools across supported harnesses, preserving Claude phone notifications."
covers:
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - tests/auth-refresh/
  - tests/vh-adlc/check.test.ts
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

### Initial acceptance run, 2026-10-22

Target runtime: `ceaea336fd14e3e270f49cedcb72e89f9e5243fd`, with a clean working tree.
Test implementation: this feature branch at `2dc9f86`. Host: Fedora Linux 43,
Codex CLI 0.163.0, Claude Code 2.1.303 and Bun 1.4.3. No runtime source was changed by these tests.

| Check | Executed result | What it establishes |
| --- | --- | --- |
| `AUTH_REFRESH_E2E=1 go test -count=1 -v ./...` in auth-refresh | Passed; zero skipped tests | Existing unit tests, real-browser fake-IdP scenarios, process-tree cleanup and restart behavior pass |
| `go vet ./...`, `go mod tidy -diff`, `golangci-lint config verify`, `golangci-lint run`, `actionlint` | All passed, with stop-on-error verification | Existing static gates pass; they do not establish the new acceptance criteria |
| `bun test tests/auth-refresh` in vh-adlc | 1 passing and 7 failing top-level tests | The new acceptance suite remains red against the unchanged runtime and packaging |
| Go overlay provider scenarios from `probe-contract.test.ts` | 6 passing and 15 failing scenarios across all seven identity types | Non-authentication failures still produce credential-renewal suggestions in Azure, AWS, Kubernetes, GitHub, registry and HTTP probes |
| Native Codex and Claude install tests | Both clients rejected the standalone marketplace source and could not find auth-refresh in vhco-tools | Both installation routes need implementation; disposable profiles were removed after each run |
| Native `claude plugin validate` | Passed for the existing standalone Claude manifest | Legacy manifest validity only, not portable discovery or phone delivery |
| `setup`, then `doctor`, with empty temporary driver and browser directories | Both exited 0 and launched Chromium 151.0.7922.34 with driver 1.62.1 | Clean-cache provisioning works on this Fedora host; installed browser and lane sessions were untouched |
| Inert cached-driver fixture through `doctor` | Doctor exited 1, but the marker executable ran before rejection | Current startup does not satisfy the accepted rejection-before-execution integrity requirement; the fixture and marker stayed in a disposable directory |
| `az --version` with an empty temporary Azure config and telemetry/version checks disabled | Timed out after 20 seconds | Azure startup is blocked independently of the live token cache; no device-code flow was started by this diagnostic |
| `systemctl --user show claude-remote-control.service` | Inactive/dead with an empty FragmentPath | The named service is not configured on this host; this does not establish whether the owner's phone workflow runs on another host or outside systemd |
| Race tests | Could not build: C compiler `gcc` missing | Race coverage remains unverified |

Raw command output for this run is retained locally in `/tmp/auth-refresh-full-tests.log` and
`/tmp/auth-refresh-acceptance.log`; those temporary files are not durable evidence. The committed
tests reproduce the acceptance failures without editing the canonical component. The Go overlay
uses fixture credentials and local HTTP servers only. Native installs use disposable client profiles.

Real-provider gaps remain: Azure login, both required live host routes, normal-lane IdP login,
AKS/EKS identity on configured contexts, the configured corporate GitHub account, registry access,
PAT/Sonar validation, phone notification arrival, stale-challenge cleanup and post-MFA continuation
through Remote Control. Missing local PAT/Sonar files and the configured AKS context remain missing;
they were not created or replaced. The existing admin lane was left parked, and the normal lane stopped.
No criterion below is marked complete from this partial run.

### Fix progress, 2026-10-22

The standalone component now has feature branch `feat/portable-auth-refresh`. Commit `1d3a3c2`
corrects non-authentication failure classifications and adds the independent provider cases beside the
runtime code. `bun test tests/auth-refresh/probe-contract.test.ts` now passes all 21 scenarios.

In-progress component changes add native standalone marketplace metadata and a shared skill, retain
Claude's PushNotification/background sequence in the canonical workflow, and replace the 20 KB
session-size rule with identity and restore checks. At that intermediate stage, both native standalone install tests passed in
isolated Codex and Claude profiles; shared-marketplace tests still awaited integration.
The unverified-driver execution test now passes: startup checks pinned file hashes before execution.
Fresh verified-archive setup and doctor both passed in disposable caches. The final committed validation and remaining acceptance gaps are recorded below.

The release lock deliberately has no version or digests while no runtime release exists. Its installer
fails with a provisioning-pending error rather than compiling a replacement or inventing an artifact.
Publication was not authorized during the initial implementation; the release authorization below
supersedes that limit. Daily-use cutover remains unauthorized. Real phone delivery and Remote Control continuation
remain unverified. The owner explicitly deferred them on 2026-10-22 to another host that has the flow;
they remain open rather than being counted as fixture coverage.

### Final local validation and remaining migration blockers

The pinned component is `a00c6001d6c448479fb851729a9a7d9147a9f814`. Both shared catalog formats
reference that exact commit. Independent R-5 executed the review reproducers and found the three
blocking code defects resolved. R-6 reviewed the final component and marketplace commits, found no
new actionable defects, and confirmed AC-05 while leaving composite acceptance criteria open. Unknown GitHub output and AWS permission failures now warn without
login fixes; HTTP probes also reject incomplete responses and distinguish empty/unreadable files.
The canonical workflow's explicit verified-binary function survives env PATH changes and background
invocation, with an executed shell regression. Its legacy entry point retains the previous installed
binary fallback and the Claude PushNotification/number/watcher sequence.

`bun test tests/auth-refresh tests/vh-adlc` passed 85/85 tests with 325 assertions, including lifecycle private-state preservation. The full component
Go suite with `AUTH_REFRESH_E2E=1`, vet, module checks, golangci-lint, actionlint and five Python
installer/workflow tests passed. Fresh verified setup and doctor passed; the existing genuine cache
passed verification, while the inert replacement driver was rejected before execution.
A final cache/setup regression distinguishes unreadable, malformed and foreign SSO metadata from
absent or expired credentials. Release downloading uses a bounded curl subprocess, avoiding the
Python network-connection path that hung during host diagnosis.

The local native-install tests remap only their child Git transport to the exact committed component;
they do not establish that an unpublished commit can be installed from GitHub.

Native CLI same-version refresh/update and uninstall also passed for both installation routes,
with private sentinel config and credentials unchanged and credential mode preserved. This does not
prove a version-to-version remote upgrade or an actual legacy agent invocation. The task-owned admin
lane also restarted under the corrected runtime and restored the real expected IdP account from
the 7,318-byte saved session, then remained parked with the normal lane stopped.

A new read-only configured-provider check returned AWS OK; Azure, AKS, registry and service health
WARN without login suggestions; the configured GitHub account DEAD; and the two PAT files and Sonar
MISSING. The latter manual token renewals were not attempted. Azure startup was traced to a network
fetch in its version metadata path. An isolated profile with installed-version metadata reached the
normal missing-login error. The informational metadata cache on this host was repaired from installed
versions, preserving a private backup and leaving authentication caches untouched; the existing
credential request still timed out, so Azure live login remains unverified.

Initial migration blockers before release authorization:

- Publication of the pinned component and marketplace commits and a verified runtime release. The
  committed runtime lock remains intentionally empty; invoking the new release-backed skill reports
  provisioning pending. No release, tag, push, installed-plugin cutover or old-setup removal was done.
- Required real-provider acceptance where this host lacks a healthy Azure request path, configured
  Kubernetes context, corporate GitHub login, registry reachability, or manual PAT/Sonar files.
- Native Codex desktop and VS Code Local invocation plus update/uninstall/rollback acceptance. CLI
  installation and fixture tests do not establish these client behaviors.
- Claude Remote Control phone delivery, failed-delivery cleanup and continuation on another host.
  The owner explicitly deferred these tests. Their criteria remain open; no chat message or fixture
  result is counted as phone delivery.
- Race testing on a host with a C compiler. The verified browser archive lock currently covers Linux
  amd64 only; other browser platforms fail explicitly until separately pinned and tested.


### Remote release and install validation, 2026-10-22

The owner authorized pushing the changes and publishing a verified runtime release to test actual
marketplace installation. Phone delivery and Remote Control continuation remain deferred. This
instruction authorizes publication, not merging the feature PRs or switching the daily-use setup.

Remote inspection found auth-refresh is private and has no `PGP_PRIVATE_KEY` repository secret;
the configured signed release workflow could not yet run. The initial check inspected only the active
GPG keyring and missed the exported VHCO Pro key; the 2026-10-23 correction below supersedes that conclusion. The owner was asked to identify the existing
release key or authorize checksum-only test artifacts. No new signing identity was generated.

The bootstrap now supports authenticated `gh release download` after a failed anonymous GitHub
release download, while retaining both pinned archive and binary hashes and bounded subprocesses.
The additional private-access tests pass, along with the prior checksum and workflow regressions
(eight Python tests total). The candidate runtime/plugin version is `0.2.0-rc.1`.

Both remote default branches were refreshed before publication. Marketplace main gained unrelated
CI/release updates, merged without changing their behavior. Auth-refresh main was rewritten with
identical baseline files; `git diff ceaea336fd14e3e270f49cedcb72e89f9e5243fd origin/main`
was empty. The feature changes remain intact.


Published review targets are component `513b7cc137a9414aed9716ab5e2da46b236ac474` and marketplace
`30f1e9ef63982d9f9fab4aa13b4218185d2ae6d1`, both on `feat/portable-auth-refresh`. Draft PRs are
[auth-refresh #6](https://github.com/michielvha/auth-refresh/pull/6) and
[vh-adlc #24](https://github.com/michielvha/vh-adlc/pull/24); neither was merged. A focused independent
review of the component's private-download change found no actionable findings and executed all
eight Python regressions successfully.

`AUTH_REFRESH_REMOTE_ACCEPTANCE=1 bun test tests/auth-refresh/package-contract.test.ts` used real
GitHub Git sources and no local transport remap. All four client/route combinations added the remote
marketplace and installed the plugin. Each then failed at the expected empty release-lock check:
three top-level metadata tests passed, four end-to-end tests failed with provisioning pending.
This proves remote plugin packaging and discovery, not verified runtime installation. The fixture
profiles were removed, and no daily-use plugin configuration was changed.

The Linux amd64 release candidate was built from component `513b7cc` with Go 1.27.1,
`-trimpath -ldflags '-s -w -X main.version=0.2.0-rc.1'`. Its `version` command returned
`auth-refresh 0.2.0-rc.1`, and its `doctor` passed all checks, including managed browser verification
and launch. The staged binary SHA-256 is
`42e427c4d7c444a9d6d5d1eaee8685ad330652438a219c62a18be3ad8696a159`.
No runtime release or release tag has been published while the signing decision remains pending.
The full component Go/browser suite and static gates passed again at this target. Phone tests stay
deferred, and the feature remains in progress.


GitHub CI at component `513b7cc` passed its mandatory browser job but failed its verification job:
its pinned golangci-lint 2.15.0 checks discarded errors received from channels, while this host's
2.14.0 did not flag them. Component `8136096` explicitly acknowledges the three intentionally
discarded process-wait errors, preserving the existing log/cancellation error reporting. That initial correction conflicted with staticcheck S1005. The final
component `7709650` instead joins process-exit errors with startup/cancellation errors and checks
the test server shutdown result. The mandatory real-browser lane suite and local lint pass; a focused
independent source review found no regression. Both shared catalogs pin this final revision.
The candidate must be rebuilt and rechecked at this revision before publication; the earlier staged digest above is historical and will not be pinned.
The repeated combined local suite passed 85 tests and 325 assertions after merging marketplace main.


The final static (`CGO_ENABLED=0`) Linux amd64 candidate was rebuilt from `7709650a83d58fcdac7c72480c5da7cf56f77591`;
its `doctor` passed all checks and its binary SHA-256 is
`a2b478b9841520c4f8ee7a23813a5bfb404b246cf68ec4fafda72fce5d14f057`. The staged archive SHA-256 is
`ca35ce2616d79929b0d5681f39577a28d2844865a51025d67182fd8852fad87c`. These are local staged artifacts, not a published
release or a populated runtime lock. Native packaging tests passed again at this final source pin
(seven tests, 42 assertions). Publication still requires the owner's pending signing choice; no key
was generated, existing secret stores were not changed, and no tag was created.

### Signed release and automatic versioning, 2026-10-23

The host is `fedora-43`. The existing exported release key was located under the host's private key
storage; its public primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`, matching
vh-adlc's committed release key. No replacement key was generated. The owner explicitly approved
transferring it to auth-refresh's encrypted `PGP_PRIVATE_KEY` Actions secret after automatic approval
review required separate permission for the transfer. The secret is now configured without printing
its contents. Earlier missing-key and checksum-only-release notes are historical.

Auth-refresh now pins the published `vhco-pro/go-release-workflow` v0.1.0 implementation
`311467ed4ba150944298460af16497abad8b7a69`, publishes the public verification key and documents
signature verification. Release tag `v0.2.0-rc.1` targets component `d686c6d`; its signed release is
being produced by the configured workflow. No manual artifact upload competes with that workflow.

vh-adlc already pins `vhco-pro/version-workflow` v0.1.0 at
`3b78b04df802ea1592cbe19338d7a882d1888389`. Its main CI and signed release for `v0.3.1` both succeeded;
feature-branch CI at `218eb25` succeeded but correctly computed without tagging because PR #24 lacked
`release:preview`. That label is now enabled. The existing Preview workflow successfully dispatched
branch CI; after all checks pass, the shared version workflow should tag a prerelease, whose tag push
starts the signed release workflow. This preserves the existing trusted-branch opt-in rather than
turning every branch into an automatic publisher. The actual tag and release results will be recorded.

Phone tests remain deferred, and no default branch merge or daily-use cutover is included.

The automatic preview release completed successfully:
[v0.4.0-feat-portable-auth-refresh.1](https://github.com/michielvha/vh-adlc/releases/tag/v0.4.0-feat-portable-auth-refresh.1),
from CI `39872899345` and release run `39872991718`. Its checksum signature verified against the expected
VHCO Pro primary fingerprint. No reusable-workflow code change was needed in vh-adlc: the missing
preview opt-in was the cause. Future successful pushes to PR #24 now produce prereleases automatically.

Auth-refresh release run `39872978575` succeeded and published the signed
[v0.2.0-rc.1 runtime](https://github.com/michielvha/auth-refresh/releases/tag/v0.2.0-rc.1).
The downloaded `checksums.txt.sig` verified with `gpgv` against primary fingerprint
`9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`. All four archives matched the signed checksum file;
the binary in each archive was measured independently. Component `be34aa21b1701dfed73ef2f8c8f7c780d2728996` commits those
archive and binary hashes to `auth-refresh.lock.json`. Linux amd64 archive SHA-256 is
`a9310709910aea6ac9bc2492ff35fe24dd1cb520522d7dc8dfa3f478b90fdf24`; binary SHA-256 is
`384a159bac9162f5d26bd3773b4b333c9deb246158d7604141821e756f1bc5c8`.
The earlier locally staged digests are not used. Other platform assets have integrity verification;
this run executes only Linux amd64. The shared catalogs now pin the published lock-bearing component.
Remote tests will compare installed workflow/bootstrap/lock bytes with that exact canonical payload,
provision from the real private release, invoke a read-only fixture check, refresh and uninstall.

Final remote acceptance at marketplace `18e27d3da334cddc3c76d80c9be79f1893442c92` and component
`be34aa21b1701dfed73ef2f8c8f7c780d2728996` passed:
`AUTH_REFRESH_REMOTE_ACCEPTANCE=1 bun test tests/auth-refresh/package-contract.test.ts`
(seven tests, 104 assertions). All four Codex/Claude and standalone/vhco-tools combinations installed
from real GitHub sources with no local Git remap. Each compared the installed lock, installer, skill,
workflow and capability bytes with the canonical component; provisioned the real private runtime;
verified its version and cache reuse; invoked a read-only missing-token fixture check; refreshed or
updated the Git marketplace/plugin; and uninstalled. Sentinel config and credential contents plus
restrictive permissions survived. This is a same-version lifecycle proof, not a version-to-version
upgrade or GUI/Remote Control invocation. No real token was created and no login was started.

The published Linux amd64 binary also passed `doctor` on this host after a fresh disposable binary
cache install. The combined local suite passed 85 tests with 325 assertions. An independent reviewer
verified the runtime signature, every archive and binary lock hash, and GitHub release metadata.
The publication/provisioning blocker is resolved. Remaining migration gaps are the deferred phone
flow, desktop and VS Code invocation/rollback, and the full live-provider matrix. Race coverage
was subsequently completed on this host as recorded below.
No criterion is closed from a passing subset, and T5 remains open.

Independent implementation review R-7 observed the same seven remote acceptance tests and 104
assertions passing at the exact committed targets above, independently verified the release
signature and all four asset/binary digests, and reran focused provider and installer tests with no
findings. AC-05 remains met; all composite criteria retain their explicit unverified portions.

A second ordinary branch push also completed CI and automatic signed publication:
[v0.4.0-feat-portable-auth-refresh.2](https://github.com/michielvha/vh-adlc/releases/tag/v0.4.0-feat-portable-auth-refresh.2),
from marketplace `18e27d3`, CI `39873471706` and release `39873547528`. Its checksum signature
verified against the same expected primary key. This proves continuing automatic preview releases,
not only the one-time label dispatch. The auth-refresh lock-bearing commit's CI also passed both
verification and mandatory browser jobs (run `39873419571`).


A later common-CI report was checked against auth-refresh main `88ed421` and failing run `39873019130`.
Its three errcheck findings are current on that main-based branch, not a regression in the signed
portable component: startup and probe process errors plus the saved-session test cleanup error are
already handled in the component's reviewed `7709650` correction. A minimal main-based backport is
[auth-refresh PR #8](https://github.com/michielvha/auth-refresh/pull/8), commit `f1219b3`, changing only
those three files. It lets the common-CI PR #3 proceed independently of the full migration PR #6.
The main-based full Go suite with mandatory browser tests, vet, module check, local lint and whitespace
checks passed. GitHub CI run `39875627899` also passed its verification and mandatory browser jobs,
including the pinned newer linter. The owner then authorized merging PR #8. It merged on 2026-10-23 as
`42d4d37034c8a23f0b5f16d0c5495626bfe2994a`, so main now contains the three process-error fixes.
The portable-auth migration PRs remain separate and unmerged.

On 2026-10-23, the owner authorized making auth-refresh public. Gitleaks 8.21.2 scanned all reachable
Git history (24 commits) with redacted reporting and found no leaks. The repository visibility was
changed to PUBLIC and confirmed through GitHub metadata. An anonymous Git request with system/global
Git config and credential helpers excluded resolved main to
`42d4d37034c8a23f0b5f16d0c5495626bfe2994a`. An unauthenticated curl download of the Linux amd64
`v0.2.0-rc.1` archive matched its committed SHA-256 pin. A fresh disposable-cache installer run with
GitHub token variables removed and an empty GH_CONFIG_DIR succeeded and returned the expected
`auth-refresh 0.2.0-rc.1` version. Public installation no longer requires authenticated gh; its private
release fallback remains available. Historical private-repository observations above describe earlier
runs. The portable-plugin PRs remain unmerged, and phone/GUI/provider acceptance gaps remain open.

On the owner's request, GCC 15.3.1 and its required Fedora development dependencies were installed
on this host. The package manager also updated glibc to the matching development-package version.
`CGO_ENABLED=1 AUTH_REFRESH_E2E=1 go test -race -count=1 -v ./...` passed all six packages at runtime
source `be34aa2`; the full real-browser lane suite ran, with zero skipped tests and no race reports.
CGO was enabled for this command without changing the host's default Go environment. The earlier
missing-compiler/race-test gap is resolved; phone, GUI/legacy rollback and remaining provider
acceptance are still open. Raw output is temporarily retained at `/tmp/auth-refresh-race-tests.log`.

Component `2fadfe08349ef9c67059de3925a5e32dd560c20a` replaces the README's old host-copy recipe with first-time local setup:
create config, notes, lane credentials and token files; select the published runtime; install browser
dependencies; run setup, doctor and check. The JSON/INI/notes examples were extracted and validated
with the verified production binary's config parser, lane listing and doctor in a private temporary
setup, without changing the live config or starting a login. The shared catalogs pin that README
revision while retaining the same signed runtime release and hashes.

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
failed notification delivery, stale challenges and bounded retries. Check notification capability and
configuration before starting unattended authentication. If delivery fails after a challenge begins,
report immediately, park the challenge, suppress further pushes and leave the login incomplete.
Keep one outstanding push across
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

Clean-cache provisioning tests must launch the pinned driver, bundled Node.js and headless shell through
`doctor`. Document the integrity check for each executable dependency, including what the upstream
installer verifies. Exercise interrupted downloads and invalid cached driver/browser artifacts; a valid
Go binary alone does not prove a usable installation. `gh release list --repo michielvha/auth-refresh`
returned an empty array on 2026-10-22, so release availability remains a delivery prerequisite.

### Required acceptance matrix

The owner confirmed Claude Remote Control sessions through the phone app on 2026-10-22.
The required live targets are this Codex desktop/Fedora host and that Claude Remote Control flow.
Phone push delivery and continuation must pass on Remote Control; chat text alone is not equivalent.

| Target | Required installation routes | Required proof |
| --- | --- | --- |
| Codex desktop on this Fedora host | Standalone and vhco-tools auth-refresh plugin | Discovery and live provider matrix below; interactive MFA displayed immediately |
| Claude Remote Control through the phone app | Standalone and vhco-tools auth-refresh plugin | Discovery, live provider matrix, phone notification arrival, one-tap MFA and continuation |
| Isolated Codex CLI profile | Standalone and vhco-tools auth-refresh plugin | Native install, discovery, read-only invocation, update and uninstall |
| Isolated Claude CLI profile | Standalone and vhco-tools auth-refresh plugin | Native install, discovery, old-agent compatibility, update and uninstall |
| VS Code Local profile | Standalone and vhco-tools auth-refresh plugin | Native install, discovery, read-only invocation, update and uninstall |

For each required live target, test AWS cold login, warm reuse and STS for all configured profiles;
Azure device-code login and token validation; Okta admin and normal-lane login, save/restart and
expected-account verification; AKS/EKS read-only identity; configured GitHub account status without
account switching; registry manifest access; PAT/Sonar token validation and manual-renewal reporting;
and service-health outage reporting without login dispatch. Missing host inputs leave their rows
open. No required target is removed during implementation to narrow the claimed support set.

## Acceptance Criteria

- [ ] AC-01: Auth-refresh installs and is discoverable as a separate plugin from vhco-tools and directly from its own repository on each claimed harness, without installing vh-adlc or requiring a source checkout.
- [ ] AC-02: Both install routes load the same canonical workflow and a verified pinned runtime; corrupt downloads, missing artifacts and unsupported platforms fail before executable code runs.
- [ ] AC-03: Claude's existing MFA phone push, immediate number delivery, background continuation and post-MFA confirmation complete a real login with the same user interaction as before.
- [ ] AC-04: Other required harnesses complete the shared workflow using available capabilities; missing required notification capabilities stop unattended authentication before a challenge, and delivery failures during a challenge are reported immediately, park the challenge and suppress further pushes.
- [x] AC-05: All identity types distinguish credential rejection from transport, permission and setup failures; only supported credential failures offer a login, and manual tokens remain manual.
      Evidence: R-5, R-6 and R-7; component `be34aa21b1701dfed73ef2f8c8f7c780d2728996` provider regressions and independent reviewer fixtures passed. Full Go and independent probe suites passed; real-provider matrix remains open under AC-07.
- [ ] AC-06: A saved authenticated session survives lane restart, the expected identity is verified, distinct lanes cannot share credentials or cookies, and abandoned challenges stop generating pushes.
- [ ] AC-07: Each claimed real-provider operation in the acceptance matrix succeeds on its target host, including Azure and AWS login, Okta lanes, Kubernetes identity, GitHub status, registry access, HTTP token validation and service-health reporting.
- [ ] AC-08: Installation, update and uninstall preserve private host config and credentials, the independent Claude entry point remains usable, and migration instructions permit returning to the previous setup without logging out.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Fresh native-client profiles install from each source, enumerate the skill and invoke a read-only check. Verify auth-refresh-only installation does not load ADLC. Record exact client versions and sources. |
| AC-02 | Installer tests execute with a local HTTP artifact fixture: valid artifact, wrong digest, corrupted archive, missing asset, unsupported platform, offline cache, wrong preinstalled binary. Native installs resolve the same pinned revision. Clean-cache provisioning launches the driver, bundled Node.js and headless shell through doctor; interrupted downloads and invalid cached artifacts fail visibly. Record each dependency's integrity mechanism. |
| AC-03 | Live Claude daily-use surface: initiate one cold login, confirm notification arrives on locked phone with matching account/provider/number, tap once, observe confirmation and CLI success without another owner prompt. Repeat warm flow without an unnecessary push. |
| AC-04 | Fake-provider native-host scenarios plus actual required host run: immediate number visibility, continuation after approval, missing capability before challenge, and delivery failure after challenge followed by parking and no further push. Never count a chat message as proof of phone delivery. |
| AC-05 | Table-driven CLI and HTTP-server regressions for every identity type, including silent Azure timeout, registry transport failure, HTTP 401/403/429/5xx, TLS and DNS errors, malformed data, missing files and missing tools. Assert status, exit code and absence/presence of suggested login. |
| AC-06 | Mandatory real-browser fake-IdP tests cover two lanes, mismatched credentials, saves below 20 KB, restart, passive status/whoami, simultaneous callers and cancellation. Real IdP restart verifies expected account without another push. |
| AC-07 | Execute each real-provider row after host prerequisites exist. Use read-only identity/API checks, confirm deliberate login success where applicable, record missing inputs as untested and keep criterion open. Run full Go suite, browser suite, vet, module checks, configured lint and supported race checks. |
| AC-08 | Fresh profile tests and manual compatibility trial exercise update/uninstall while preserving sentinel config and credentials. Follow documented old-agent invocation and rollback with no logout or cache deletion. |

## Tasks

- [x] T1 `tests/auth-refresh/probe-contract.test.ts`, `tests/auth-refresh/fixtures/probe-contract_test.go.txt` - execute acceptance probes against the canonical runtime without modifying that checkout; demonstrate unsafe authentication recommendations and preserve the failure evidence (AC-05, AC-07).
- [x] T2 `tests/auth-refresh/package-contract.test.ts`, `tests/auth-refresh/provisioning-contract.test.ts` - exercise native plugin validation and verify standalone and shared-marketplace discovery inputs against the exact component revision; missing supported packaging fails visibly (AC-01, AC-02, AC-08).
- [x] T3 `docs/specs/portable-auth-refresh.md` - record observed baseline gates and live-host prerequisites, with each missing input remaining untested (AC-03, AC-04, AC-06, AC-07).
- [x] T6 `auth-refresh:internal/check/` - fix the provider rejection/outage cases in the standalone component; its local unit suite and all 21 independent acceptance scenarios pass (AC-05).
- [x] T7 `auth-refresh:internal/browserruntime/`, `auth-refresh:skills/`, `auth-refresh:scripts/`, `auth-refresh:plugin.json` - implement and test verified runtime provisioning and canonical portable packaging while retaining the legacy Claude notification flow (AC-01, AC-02, AC-03, AC-04, AC-06, AC-08).
- [x] T4 `README.md`, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` - integrate the reviewed canonical portable auth-refresh component and its verified release, once its corresponding implementation exists (AC-01, AC-02, AC-08).
- [ ] T5 `tests/auth-refresh/` - run both native installation routes, notification failure and continuation scenarios, and the full fixed acceptance matrix; keep unavailable live rows open (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08).

Runtime fixes, canonical skill packaging, notification adapters and verified artifact provisioning are
implemented and reviewed in the standalone component before T4 pins their exact published revision.
This does not waive the combined criteria or authorize publication.

## Open Questions

None. The live Claude target is Remote Control through the phone app.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-22 | R-1 | spec | `dedfae46681a2b7b2a6b6cacf4831c234b74a4dc` | unknown | procedural | Two blocking findings and one should-fix; model identity not attested. |
| 2026-10-22 | R-2 | spec | `9474365fe7fc40a342da80f5e521f92298921c1f` | unknown | procedural | Clean independent review; model identity not attested. |
| 2026-10-22 | R-2 | spec | `9474365fe7fc40a342da80f5e521f92298921c1f` | n/a | n/a | accepted by owner |
| 2026-10-22 | R-3 | spec | `f3ea3bb5373572683856e832b92e52725590258e` | unknown | procedural | Clean review of checker coverage revision; model identity not attested. |
| 2026-10-22 | R-3 | spec | `f3ea3bb5373572683856e832b92e52725590258e` | n/a | n/a | accepted by owner |
| 2026-10-22 | R-4 | implementation | `f3ea3bb5373572683856e832b92e52725590258e` | unknown | procedural | Diagnostic review at runtime b2fca51 found three blockers; required live tests remain unverified. |
| 2026-10-22 | R-5 | implementation | `11cb22c99de97d50d30e54fcebf87c69504bfcf3` | unknown | procedural | Focused re-review at runtime fda67f4 resolved all three code blockers; AC-05 met, other composite criteria unverified. |

| 2026-10-22 | R-6 | implementation | `ee31174e8eafcbeda232d9274bbaf790f706309f` | unknown | procedural | Final focused review at runtime a00c600 found no new actionable defects; AC-05 met, composite criteria remain unverified. |

| 2026-10-23 | R-7 | implementation | `18e27d3da334cddc3c76d80c9be79f1893442c92` | unknown | procedural | Verified signed runtime assets and reran actual remote acceptance at component be34aa2; no findings, AC-05 met and composite gaps remain open. |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design, Acceptance Criteria and Test Plan
EVIDENCE: At dedfae46681a2b7b2a6b6cacf4831c234b74a4dc, AC-01 and AC-04 quantify over "claimed harnesses"; AC-07 refers to an "acceptance matrix". No matrix specifies required harnesses, platforms, installation routes, provider operations or target environments. Design names provider families but does not define these combinations.
PROPOSAL: Define the required acceptance matrix before accepting the spec, including this Codex host and the existing Claude daily-use surface. Name each required operation and installation route, and keep unavailable targets explicitly untested rather than allowing the claimed support set to shrink during implementation.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: AC-04 and its Test Plan row
EVIDENCE: AC-04 requires failed phone notifications to be surfaced "before an unattended challenge starts". The canonical agents/auth-refresh.md obtains the MFA number from an existing challenge using `lane mfa`, then sends PushNotification. Delivery of that number can fail only after the challenge has started; a successful capability check cannot guarantee subsequent delivery.
PROPOSAL: Require capability and notification configuration checks before starting unattended authentication. Separately require actual delivery failures to surface immediately, cancel or park the active challenge, prevent further pushes and leave the operation incomplete; test both failure stages.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: One component and two installation routes; AC-02 Test Plan
EVIDENCE: The proposed installer verifies the runtime binary, but the canonical README.md:9-14 describes additional executable downloads: Playwright's driver, Node.js and Chromium. The AC-02 fixture cases cover the runtime artifact without explicitly exercising provisioning and integrity failures for those browser dependencies.
PROPOSAL: State which component verifies each downloaded executable dependency and require a clean-cache installation test through doctor and a real browser launch. Include interrupted downloads and invalid cached browser or driver artifacts so a verified runtime alone cannot satisfy usable installation.

### R-2

NO FINDINGS

### R-3

NO FINDINGS

### R-4

CRITERION: AC-01 Auth-refresh installs and is discoverable as a separate plugin from vhco-tools and directly from its own repository on each claimed harness, without installing vh-adlc or requiring a source checkout.
VERDICT: not verified
EVIDENCE: `bun test tests/auth-refresh` at marketplace f3ea3bb5373572683856e832b92e52725590258e with runtime b2fca516069d4a4aa4439c562564b1740509c7d7 passed all nine tests, including standalone and shared-marketplace installation in disposable Codex and Claude profiles. Required VS Code Local, Codex desktop and Claude Remote Control acceptance executions were not observed; local-profile installation does not establish published installation without a checkout.

CRITERION: AC-02 Both install routes load the same canonical workflow and a verified pinned runtime; corrupt downloads, missing artifacts and unsupported platforms fail before executable code runs.
VERDICT: not met
EVIDENCE: At runtime b2fca516069d4a4aa4439c562564b1740509c7d7, four Python installer tests passed and the independent Bun test confirmed doctor rejects an unverified driver before execution. However, a disposable shell fixture with the verified runtime directory initially first on PATH executed an alternative binary from ~/.local/bin after applying workflow.md:26. The committed release lock intentionally remains unpopulated; production runtime provisioning is pending.

CRITERION: AC-03 Claude's existing MFA phone push, immediate number delivery, background continuation and post-MFA confirmation complete a real login with the same user interaction as before.
VERDICT: not verified
EVIDENCE: Inspected the legacy agent and shared workflow at runtime b2fca516069d4a4aa4439c562564b1740509c7d7. PushNotification, immediate number delivery and the bounded Azure confirmation watcher remain documented. Actual phone arrival and Remote Control continuation were not executed, as explicitly deferred by the owner.

CRITERION: AC-04 Other required harnesses complete the shared workflow using available capabilities; missing required notification capabilities stop unattended authentication before a challenge, and delivery failures during a challenge are reported immediately, park the challenge and suppress further pushes.
VERDICT: not verified
EVIDENCE: Inspected skills/auth-refresh/references/capabilities.md at runtime b2fca516069d4a4aa4439c562564b1740509c7d7. It specifies capability checks, interactive continuation and cleanup after failed delivery. The passing installation and provider suites do not execute native-host notification failures, challenge parking or post-approval continuation; required host executions were not observed.

CRITERION: AC-05 All identity types distinguish credential rejection from transport, permission and setup failures; only supported credential failures offer a login, and manual tokens remain manual.
VERDICT: not met
EVIDENCE: The committed provider suite and all 21 independent overlay scenarios passed at runtime b2fca516069d4a4aa4439c562564b1740509c7d7. Additional temporary overlay cases executed through production One returned DEAD instead of WARN for AWS AccessDenied with an absent SSO cache, GitHub JSON reporting permission denied reading config.yml, and unknown GitHub text output. Those results permit inappropriate authentication fixes.

CRITERION: AC-06 A saved authenticated session survives lane restart, the expected identity is verified, distinct lanes cannot share credentials or cookies, and abandoned challenges stop generating pushes.
VERDICT: not verified
EVIDENCE: `AUTH_REFRESH_E2E=1 go test -count=1 ./...` at runtime b2fca516069d4a4aa4439c562564b1740509c7d7 passed every package, including the real-browser lane suite. This establishes the executed fake-IdP and lane regressions. Real IdP restoration and cessation of actual abandoned phone pushes were not executed; the composite criterion remains unverified.

CRITERION: AC-07 Each claimed real-provider operation in the acceptance matrix succeeds on its target host, including Azure and AWS login, Okta lanes, Kubernetes identity, GitHub status, registry access, HTTP token validation and service-health reporting.
VERDICT: not verified
EVIDENCE: At runtime b2fca516069d4a4aa4439c562564b1740509c7d7, the complete Go suite with mandatory browser tests passed; go vet and go mod tidy -diff produced no errors or changes. No live-provider acceptance matrix was executed during this review. Fixture results do not establish real-provider success on the required hosts.

CRITERION: AC-08 Installation, update and uninstall preserve private host config and credentials, the independent Claude entry point remains usable, and migration instructions permit returning to the previous setup without logging out.
VERDICT: not verified
EVIDENCE: The disposable native installation tests passed at marketplace f3ea3bb5373572683856e832b92e52725590258e and runtime b2fca516069d4a4aa4439c562564b1740509c7d7. Source inspection confirms the legacy Claude agent retains its tool declarations and installed-binary bootstrap. An actual legacy invocation and the full update, uninstall and rollback procedure with private-state preservation were not executed.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: auth-refresh skills/auth-refresh/references/workflow.md:26
EVIDENCE: At b2fca516069d4a4aa4439c562564b1740509c7d7, SKILL.md prepends the verified runtime directory, but the shared workflow subsequently prepends ~/.local/bin before calling auth-refresh env and all later runtime commands. A disposable fixture with distinguishable verified and alternative binaries printed UNPINNED after executing that exact bootstrap.
PROPOSAL: Retain the verified absolute executable path throughout the portable workflow, including env, lane commands and background watchers. Preserve the ambient-PATH fallback only for the explicitly supported legacy entry point.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: auth-refresh internal/check/check.go:315
EVIDENCE: At b2fca516069d4a4aa4439c562564b1740509c7d7, a temporary Go overlay passed an AWS GetCallerIdentity AccessDenied result with an absent fixture SSO cache through One. TestReviewAdditionalFailureKinds/AWS_denied_with_no_cache returned DEAD instead of WARN because the absent-cache fallback overrides permission and setup failures not matched by awsNetRe.
PROPOSAL: Classify explicit permission and host-setup errors before the cache-based credential fallback. Add cases for AccessDenied, invalid profiles and unreadable or malformed caches, asserting that these failures do not suggest a login.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: auth-refresh internal/check/check.go:471 and internal/check/check.go:495
EVIDENCE: At b2fca516069d4a4aa4439c562564b1740509c7d7, temporary overlay cases passed GitHub JSON reporting Permission denied reading config.yml and unrecognized text output through One. Both returned DEAD instead of WARN. The JSON and text fallbacks treat failures outside the transport regex as credential rejection without affirmative authentication evidence.
PROPOSAL: Require explicit evidence of absent or rejected credentials before returning DEAD. Return WARN for permission, setup and unrecognized output, and test both JSON and text paths with assertions that no login fix is offered.

### R-5

CRITERION: AC-01 Auth-refresh installs and is discoverable as a separate plugin from vhco-tools and directly from its own repository on each claimed harness, without installing vh-adlc or requiring a source checkout.
VERDICT: not verified
EVIDENCE: `bun test tests/auth-refresh` at marketplace 11cb22c99de97d50d30e54fcebf87c69504bfcf3 with runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f passed all nine tests, including standalone and shared-marketplace installation in disposable Codex and Claude profiles. Required VS Code Local, Codex desktop and Claude Remote Control acceptance executions and published installation without a checkout remain unverified.

CRITERION: AC-02 Both install routes load the same canonical workflow and a verified pinned runtime; corrupt downloads, missing artifacts and unsupported platforms fail before executable code runs.
VERDICT: not verified
EVIDENCE: At runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f, four Python installer tests and the independent doctor integrity test passed. `PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_workflow.py` passed its executed shell fixture, preserving the verified executable after env PATH changes and during background invocation. The previous routing defect is resolved. The release lock intentionally remains unpopulated; published runtime provisioning and the complete provisioning failure matrix remain unverified.

CRITERION: AC-03 Claude's existing MFA phone push, immediate number delivery, background continuation and post-MFA confirmation complete a real login with the same user interaction as before.
VERDICT: not verified
EVIDENCE: Inspected the legacy agent and shared workflow at runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f. PushNotification, immediate number delivery and the bounded Azure confirmation watcher remain documented. Actual phone arrival and Remote Control continuation were not executed, as explicitly deferred by the owner.

CRITERION: AC-04 Other required harnesses complete the shared workflow using available capabilities; missing required notification capabilities stop unattended authentication before a challenge, and delivery failures during a challenge are reported immediately, park the challenge and suppress further pushes.
VERDICT: not verified
EVIDENCE: Inspected the capability reference and corrected shared bootstrap at runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f. Capability checks, interactive continuation and delivery-failure cleanup remain specified. Installation and provider fixtures do not execute required native-host notification failures, challenge parking or post-approval continuation; these executions remain unverified.

CRITERION: AC-05 All identity types distinguish credential rejection from transport, permission and setup failures; only supported credential failures offer a login, and manual tokens remain manual.
VERDICT: met
EVIDENCE: At runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f, the complete Go suite and independent provider contract passed. The original temporary reviewer overlay now passes all three cases: AWS AccessDenied without an SSO cache, GitHub configuration permission denial and unknown GitHub text output all produce WARN without a login fix. The committed provider regressions and TestTokenFileAndPartialResponseFailures also passed, covering unreadable and empty token files and an incomplete HTTP response. Source inspection confirms warning results suppress fixes and manual token renewal remains manual. This establishes tested classification behavior, not real-provider acceptance.

CRITERION: AC-06 A saved authenticated session survives lane restart, the expected identity is verified, distinct lanes cannot share credentials or cookies, and abandoned challenges stop generating pushes.
VERDICT: not verified
EVIDENCE: `AUTH_REFRESH_E2E=1 go test -count=1 ./...` at runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f passed every package, including the real-browser lane suite. This establishes executed fake-IdP and lane regressions. Real IdP restoration and cessation of actual abandoned phone pushes were not executed; the composite criterion remains unverified.

CRITERION: AC-07 Each claimed real-provider operation in the acceptance matrix succeeds on its target host, including Azure and AWS login, Okta lanes, Kubernetes identity, GitHub status, registry access, HTTP token validation and service-health reporting.
VERDICT: not verified
EVIDENCE: At runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f, the complete Go suite with mandatory browser tests passed; go vet and go mod tidy -diff passed. No live-provider acceptance matrix was executed during this review. Fixture results do not establish real-provider success on the required hosts.

CRITERION: AC-08 Installation, update and uninstall preserve private host config and credentials, the independent Claude entry point remains usable, and migration instructions permit returning to the previous setup without logging out.
VERDICT: not verified
EVIDENCE: The disposable native installation tests passed at marketplace 11cb22c99de97d50d30e54fcebf87c69504bfcf3 and runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f. Inspection confirms the independent Claude entry point retains its tools and ambient installed-binary fallback. Actual legacy invocation and the full update, uninstall and rollback procedure with private-state preservation remain unverified.

### R-6

CRITERION: AC-01 Auth-refresh installs and is discoverable as a separate plugin from vhco-tools and directly from its own repository on each claimed harness, without installing vh-adlc or requiring a source checkout.
VERDICT: not verified
EVIDENCE: `bun test tests/auth-refresh/package-contract.test.ts` at marketplace ee31174e8eafcbeda232d9274bbaf790f706309f with runtime a00c6001d6c448479fb851729a9a7d9147a9f814 passed all seven tests and 42 assertions, including both native installation routes in disposable Codex and Claude profiles. Required VS Code Local, Codex desktop and Claude Remote Control acceptance executions and published installation without a checkout remain unverified.

CRITERION: AC-02 Both install routes load the same canonical workflow and a verified pinned runtime; corrupt downloads, missing artifacts and unsupported platforms fail before executable code runs.
VERDICT: not verified
EVIDENCE: At runtime a00c6001d6c448479fb851729a9a7d9147a9f814, four Python installer tests and the verified-path workflow shell test passed. Additional no-network downloader fixtures verified rejection of invalid schemes, embedded credentials and missing hostnames before subprocess execution, bounded curl arguments, staged artifact reading, nonzero-exit rejection and timeout propagation. Source inspection retains archive and binary verification before execution. The release lock intentionally remains unpopulated; published provisioning and the complete provisioning failure matrix remain unverified.

CRITERION: AC-03 Claude's existing MFA phone push, immediate number delivery, background continuation and post-MFA confirmation complete a real login with the same user interaction as before.
VERDICT: not verified
EVIDENCE: Inspected the unchanged legacy agent and shared notification workflow at runtime a00c6001d6c448479fb851729a9a7d9147a9f814. PushNotification, immediate number delivery and the bounded Azure confirmation watcher remain documented. Actual phone arrival and Remote Control continuation were not executed, as explicitly deferred by the owner.

CRITERION: AC-04 Other required harnesses complete the shared workflow using available capabilities; missing required notification capabilities stop unattended authentication before a challenge, and delivery failures during a challenge are reported immediately, park the challenge and suppress further pushes.
VERDICT: not verified
EVIDENCE: Inspected the capability reference and verified bootstrap at runtime a00c6001d6c448479fb851729a9a7d9147a9f814. Capability checks, interactive continuation and delivery-failure cleanup remain specified. Required native-host notification failures, challenge parking and post-approval continuation were not executed and remain unverified.

CRITERION: AC-05 All identity types distinguish credential rejection from transport, permission and setup failures; only supported credential failures offer a login, and manual tokens remain manual.
VERDICT: met
EVIDENCE: `go test -count=1 -v ./internal/check` at runtime a00c6001d6c448479fb851729a9a7d9147a9f814 passed all provider, HTTP, token-file and AWS-cache tests. Executed cache cases distinguish absent or expired credentials from malformed metadata, foreign start URLs and unreadable expiry values; warning results offer no fix. The prior AWS permission and GitHub permission/unknown-output regressions and incomplete HTTP response regression also pass. Source inspection confirms manual tokens remain manual. This establishes tested classification behavior, not real-provider acceptance.

CRITERION: AC-06 A saved authenticated session survives lane restart, the expected identity is verified, distinct lanes cannot share credentials or cookies, and abandoned challenges stop generating pushes.
VERDICT: not verified
EVIDENCE: The lane implementation and browser tests are unchanged from runtime fda67f43feadcaa9e4482c110dac6d91ba91fd4f, where this reviewer observed `AUTH_REFRESH_E2E=1 go test -count=1 ./...` pass every package, including real-browser lane tests. Those tests were not rerun in this focused review of a00c6001d6c448479fb851729a9a7d9147a9f814. Real IdP restoration and cessation of actual abandoned phone pushes remain unverified.

CRITERION: AC-07 Each claimed real-provider operation in the acceptance matrix succeeds on its target host, including Azure and AWS login, Okta lanes, Kubernetes identity, GitHub status, registry access, HTTP token validation and service-health reporting.
VERDICT: not verified
EVIDENCE: The focused provider suite passed at runtime a00c6001d6c448479fb851729a9a7d9147a9f814. This review did not execute the live-provider acceptance matrix. The earlier full Go and browser suite at fda67f43feadcaa9e4482c110dac6d91ba91fd4f and current fixture results do not establish real-provider success on the required hosts.

CRITERION: AC-08 Installation, update and uninstall preserve private host config and credentials, the independent Claude entry point remains usable, and migration instructions permit returning to the previous setup without logging out.
VERDICT: not verified
EVIDENCE: At marketplace ee31174e8eafcbeda232d9274bbaf790f706309f and runtime a00c6001d6c448479fb851729a9a7d9147a9f814, native lifecycle tests passed standalone and shared-marketplace installation, local refresh or update, and uninstall in disposable Codex and Claude profiles. Sentinel config and credential contents and restrictive credential permissions survived. Codex re-adds the local fixture rather than testing a published Git marketplace upgrade. Actual legacy invocation and the documented rollback procedure remain unverified.

### R-7

CRITERION: AC-01 Auth-refresh installs and is discoverable as a separate plugin from vhco-tools and directly from its own repository on each claimed harness, without installing vh-adlc or requiring a source checkout.
VERDICT: not verified
EVIDENCE: Independently executed `AUTH_REFRESH_REMOTE_ACCEPTANCE=1 bun test tests/auth-refresh/package-contract.test.ts` at marketplace 18e27d3da334cddc3c76d80c9be79f1893442c92 with component be34aa21b1701dfed73ef2f8c8f7c780d2728996. All seven tests and 104 assertions passed, including actual remote standalone and shared-marketplace installation in disposable Codex and Claude CLI profiles. Required VS Code Local, Codex desktop and Claude Remote Control acceptance executions remain unverified.

CRITERION: AC-02 Both install routes load the same canonical workflow and a verified pinned runtime; corrupt downloads, missing artifacts and unsupported platforms fail before executable code runs.
VERDICT: not verified
EVIDENCE: At component be34aa21b1701dfed73ef2f8c8f7c780d2728996, independently verified the published v0.2.0-rc.1 checksum signature against primary key 9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6. All four archive hashes match the signed manifest, committed lock and GitHub metadata; all four extracted binary hashes match the lock. The independently executed remote suite passed installed canonical payload comparisons, private-release provisioning, version checks and verified cache reuse on both clients and routes. Seven Python installer tests and the verified-path shell test also passed. The complete provisioning failure matrix and all executable-dependency corruption/interruption scenarios remain unverified, so this composite criterion is not closed.

CRITERION: AC-03 Claude's existing MFA phone push, immediate number delivery, background continuation and post-MFA confirmation complete a real login with the same user interaction as before.
VERDICT: not verified
EVIDENCE: Inspected the legacy agent and canonical workflow at component be34aa21b1701dfed73ef2f8c8f7c780d2728996. PushNotification, immediate number delivery, the bounded confirmation watcher and Claude background continuation remain specified. Actual phone arrival and Remote Control continuation were not executed, as explicitly deferred by the owner.

CRITERION: AC-04 Other required harnesses complete the shared workflow using available capabilities; missing required notification capabilities stop unattended authentication before a challenge, and delivery failures during a challenge are reported immediately, park the challenge and suppress further pushes.
VERDICT: not verified
EVIDENCE: The remote suite passed read-only invocation of the provisioned published runtime for both clients and installation routes at marketplace 18e27d3da334cddc3c76d80c9be79f1893442c92 and component be34aa21b1701dfed73ef2f8c8f7c780d2728996. Capability and cleanup instructions remain present. Actual required-host notification capability failure, delivery failure during a challenge, parking, suppression of further pushes and post-approval continuation were not executed.

CRITERION: AC-05 All identity types distinguish credential rejection from transport, permission and setup failures; only supported credential failures offer a login, and manual tokens remain manual.
VERDICT: met
EVIDENCE: Independently executed `go test -count=1 ./internal/check` at component be34aa21b1701dfed73ef2f8c8f7c780d2728996; it passed. The classification code is unchanged from the previously reviewed provider and typed-cache fixes. The suite covers provider credential rejection versus transport, permission, setup and unknown-output failures, manual-token handling, AWS cache metadata and incomplete HTTP responses; warning results suppress login fixes. This establishes tested classification behavior, not the separate real-provider matrix.

CRITERION: AC-06 A saved authenticated session survives lane restart, the expected identity is verified, distinct lanes cannot share credentials or cookies, and abandoned challenges stop generating pushes.
VERDICT: not verified
EVIDENCE: Inspected the final lane changes and the retained browser regression coverage at component be34aa21b1701dfed73ef2f8c8f7c780d2728996. This reviewer previously observed the mandatory real-browser fake-IdP suite pass at fda67f43feadcaa9e4482c110dac6d91ba91fd4f. Final lane changes preserve process cleanup and join process-exit errors with startup or cancellation errors. Real IdP restoration, expected-account verification after a live restart and cessation of actual abandoned phone pushes remain unverified.

CRITERION: AC-07 Each claimed real-provider operation in the acceptance matrix succeeds on its target host, including Azure and AWS login, Okta lanes, Kubernetes identity, GitHub status, registry access, HTTP token validation and service-health reporting.
VERDICT: not verified
EVIDENCE: The focused provider suite passed at component be34aa21b1701dfed73ef2f8c8f7c780d2728996, and actual remote installation exercised the signed published runtime with a read-only missing-token fixture. This review did not execute the required live-provider acceptance matrix on the required hosts. Fixture and release results cannot establish those live operations.

CRITERION: AC-08 Installation, update and uninstall preserve private host config and credentials, the independent Claude entry point remains usable, and migration instructions permit returning to the previous setup without logging out.
VERDICT: not verified
EVIDENCE: The independently executed remote suite at marketplace 18e27d3da334cddc3c76d80c9be79f1893442c92 and component be34aa21b1701dfed73ef2f8c8f7c780d2728996 passed Git marketplace refresh or upgrade, plugin update or refresh, and uninstall across both clients and both routes. Sentinel config and credential contents and restrictive credential permissions survived. Installed canonical payloads matched the component pin. Actual legacy Claude invocation and the documented rollback procedure without logout remain unverified.

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): review and acceptance before implementation; one feature document and explicit unmet criteria.
- [Pinned delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): immutable executable downloads and coordinated reviewed delivery.
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): portable plugin manifests and native plugin installation; actual host compatibility still requires the tests above.

- [Pinned shared version workflow](https://github.com/vhco-pro/version-workflow/blob/3b78b04df802ea1592cbe19338d7a882d1888389/.github/workflows/version.yml): checks the default-branch or exact labelled PR-head gate before pushing a version tag with the release App.
- [Pinned shared Go release workflow](https://github.com/vhco-pro/go-release-workflow/blob/311467ed4ba150944298460af16497abad8b7a69/.github/workflows/go-release.yml): verifies tagged Go source before building, signing and publishing.
