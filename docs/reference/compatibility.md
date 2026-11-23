[Documentation](../README.md) / Compatibility

# Compatibility

Check the plugin version as well as the host: a successful run on an older version
does not establish support for a newer workflow. Installation instructions are in
[Install vh-adlc](../get-started/installation.md).

## Projects coordinator candidate

The candidate operation requires Git, authenticated `gh`, Bun and explicit project configuration.
Its Linux checks use native subprocess fixtures for pagination, identity, approvals and partial writes.
A bounded Linux CLI trial at `9a535ea4ef6778143b440b0bdfc422b46249a3f6` passed actual board inventory,
issue additions, field updates, repeated operations and conflict refusal. Independent read-back verified
the results and cleanup. Installed-agent invocation and other host platforms remain unverified.
See the [Projects reference](../../plugins/vh-adlc/references/projects.md) and
[feature status](../specs/github-projects-coordinator.md). No unattended authority is included.

## Shared triage

Shared triage is available from plugin 0.4.0. Both Codex CLI and
Claude Code CLI have observed read-only discovery and managed fake-tracker execution,
including interruption recovery, uncertainty, concurrency and exact-payload denials.
The [feature evidence](../specs/shared-triage.md) records the exact tested commits,
subsequent defensive fixes and the limits of the private migration trial.

Every published triage verdict and local assessment patch requires current proof in a
[confined controller](../../plugins/vh-adlc/references/triage-boundary.md), plus exact approval.
The shipped managed adapters require Linux, Bubblewrap, util-linux flock and an
authenticated Codex or Claude CLI. Other harnesses can report; execution needs their own tested
confinement adapter. A raw session or cache receipt grants no execution authority.

Codex desktop and VS Code Local triage invocations remain unverified. The owner deferred
those compatibility checks to [issue #33](https://github.com/michielvha/vh-adlc/issues/33).
The runtime has no GUI dependency. Other GUI surfaces have no triage support claim.
Copilot's migration runner is test-only and grants no managed execution support.
The historical results below retain their original scope.

## Persistent codebase audit

The audit operation is a harness-agnostic skill and Bun/Git helper package, included from plugin 0.8.0.
Configure `.vh-adlc/audit.yaml` using the [audit settings reference](../../plugins/vh-adlc/references/audit-settings.md).
Actual Codex CLI and Claude CLI marketplace fresh installs, upgrades from 0.7.0, discovery of twelve
operations, installed offline entry/helpers and reinstall passed at published source
`afb0c4b84ad0c013614f404bcfea7d12ee9eca78`, with identical complete payload bytes/modes.

The shared source gate includes 1,092 Linux package tests, 935 portable macOS tests and actual bounded
Copilot Opus 5.5 behavior, repair and interruption-recovery trials. Stackweaver passed 100 consumer
checks, all 18 applicable pre-push checks with no skips, a clean paired review at published/current
commits and artifact-bound installed preflight before [adoption #1020](https://github.com/michielvha/stackweaver/pull/1020).
Post-merge installed policy inspection matched every mode and binding, left the ledger unchanged and
passed synthetic mismatch/rollback/reapply checks. Exact targets and retained attempts live in the
[audit delivery evidence](../specs/shared-audit.md#published-audit-and-stackweaver-adoption-2026-11-03).

These checks use operator attestations and provide no OS-level enforcement claim. Real Claude model
invocation, GUI/phone entry and actual product audit repairs or live token/database/resource operations
remain unclaimed. Other adopters must verify their own policy and installation.

Audit helpers require Bun 1.4+ with `Bun.markdown.render`, plus Git. An older or renderer-less
runtime reports that prerequisite before the operation starts. Use the same verified Bun version
when generating and reconstructing a candidate; renderer differences are not proof of equivalent
ledger bytes. A changed rendering result requires reconciliation and renewed verification.

## Dependency and security maintenance

Maintenance requires plugin 0.6.0 or later. Isolated native installs of the exact
earlier 0.5.0 development candidate passed on Codex CLI 0.163.0 and Claude Code CLI 2.1.309 on Linux:
both discovered the operation and ran installed settings, fake-GET collection
and private-report helpers with matching payload bytes/modes and preserved fixture
source/index. Uninstall/reinstall results and exact source targets are recorded in
the [maintenance feature evidence](../specs/shared-maintenance.md).

After blog integration, final 0.6.0 local-catalog validation passed at committed source
`1d8bc8ae47dac829e6fe0612386c05ea54ab4936`: both native CLI hosts discovered all eleven
skills, passed installed helpers with source/index preservation, and restored the same
payload through uninstall/reinstall. The exact targets and digest are in the feature evidence.
Those earlier runs are development checks. On 2026-10-30, fresh installs and upgrades
from the actual GitHub marketplace passed on both CLI hosts at published source
`b5b94495f5bf3dd1d0678c8fabaf102506cfe3d1`, plugin 0.6.0/eleven skills, with exact
payload bytes and modes. Native discovery, installed settings, GET-only collection,
private reports and uninstall/reinstall passed with source/index preservation.
A fresh paired Copilot Opus 5.5 review returned no findings, and the artifact-bound
adoption preflight passed before Stackweaver PR #997 merged. Exact revisions, rollback
and receipt limitations are in the feature evidence. The preflight continues to reject
local-catalog receipts as publication proof.
Native model report/delivery trials are tracked separately in that feature;
an installer result does not establish agent behavior. The live Claude command
trial and GUI maintenance checks remain deferred. Copilot report/reviewer tests
do not establish general Copilot lifecycle or delivery support.

## Repository settings

The security reconciliation candidate adds normalized scanner packets, typed report revisions and
history comparison schema 2. Its development evidence and unrun surfaces are recorded in
[the security reconciliation feature](../specs/maintenance-security-resolution.md). Existing
settings/inventories/reports remain readable; older helpers reject a newly adopted `security_policy`
key and require the documented settings rollback handoff. They reject `security_settings` and
`security_settings_keep_off` the same way; adopting either key needs plugin 0.16.0 or later.
Candidate tests do not establish a released
marketplace upgrade, automatic scanner collection or live advisory remediation.

Triage reads `.vh-adlc/triage.yaml` and maintenance reads `.vh-adlc/maintenance.yaml`. YAML settings need
plugin 0.7.0 or later. An earlier plugin does not read these files and runs on its defaults, so upgrade
the plugin on every host before a repository moves its settings. Plugin 0.7.0 refuses a `.json` or `.yml`
settings file and names the expected path. Reading a triage or maintenance settings file uses the verified
`vh-adlc` binary that the plugin installs; a repository without settings files needs no binary for
settings. `.vh-adlc/cleanup.yaml` is different: the `vh-adlc` on `PATH` reads it, without verification, as
described under [host cleanup](#host-cleanup).

## Host cleanup

`vh-adlc-clean` needs plugin 0.13.0 and a binary with the `clean` command, installed on the shell's `PATH`
as the [installation guide](../get-started/installation.md#host-cleanup) shows. The operation calls that
binary unverified, so the allow rule can match it. `clean` and `env` run on Linux only, and `clean` needs
Git 2.45 or newer, above the 2.35 the other commands need.

`clean` refuses with `pid-namespace` inside a PID-namespace sandbox, because `kill` and `/proc` give
wrong answers there; run the command in a terminal then. On Codex CLI 0.163.0 the documented allow rule
ran `clean` outside the default `workspace-write` sandbox, while the same command inside `codex sandbox`
reported `pid-namespace`. `DOCKER_HOST` values other than `unix://`, and Docker contexts, read as no engine. Age is the only
protection against other users' processes, same-user processes whose `/proc` entries cannot be read,
and Podman bind mounts.

The operation passed on one Linux host, `fedora-43`, on 2026-11-09: headless Claude Code 2.1.316 sessions
in auto mode and Codex CLI 0.163.0 sessions in the default `workspace-write` sandbox, and a real-host
sequence in disposable clones of this repository and Stackweaver. The sessions loaded the plugin at 0.11.0,
before the version moved to 0.13.0 with no change to `vh-adlc-clean` or `references/clean.md`, and every run
used a candidate binary built from `7235dbb`, whose `clean` and `env` code is unchanged since. Interactive
sessions, other Linux hosts and macOS, where `clean` does not run, are not covered.

## Workstream orchestration

Plugin 0.31.0 adds `vh-adlc-orchestrate`, a written procedure for a session that drives many
sub-sessions. It is unverified on every host: the package tests check the procedure's text, and no
scenario run has exercised it in a live workstream.
[Feature document](../specs/workstream-orchestration.md)

## Support matrix

Supported means the scenario run in `tests/vh-adlc/evidence/` passed on that host. Everything else is
unsupported until its own run passes. Partial GUI entries name the checks actually run, rather than
claiming that the whole scenario matrix passed.

| Host or capability | Status | Evidence |
| --- | --- | --- |
| Claude Code CLI 2.1.303, Linux | Historical full scenario proof; the 0.2.0 model-policy changes have not had an authenticated scenario rerun | [Claude CLI scenarios](../../tests/vh-adlc/evidence/claude-code/); [0.2.0 compatibility discovery](../../tests/vh-adlc/evidence/codex/gui-smoke.md) |
| Codex desktop app 26.1013.40934, macOS arm64 | Core GUI loop passed on plugin 0.2.0, through independent implementation review and gated completion; unsafe shipping preflight correctly stopped | [Codex GUI run](../../tests/vh-adlc/evidence/codex/gui-smoke.md) |
| Codex CLI 0.163.0, plugin 0.2.0 packaging | Historical native installation check in an isolated, credential-free profile; no 0.2.0 CLI agent-loop claim | [Codex GUI run](../../tests/vh-adlc/evidence/codex/gui-smoke.md) |
| Lifecycle front door, plugin 0.3.0, Codex CLI 0.163.0 | 57 fresh native CLI trials pass on one compact package/docs pair, with required repetitions and linked independent review; prior publication failures are retained. This is a bounded scenario result | [Lifecycle evaluation](../../tests/vh-adlc/evidence/lifecycle/README.md) |
| Lifecycle front door, plugin 0.3.0, desktop and other hosts | Unverified; Computer Use refused access to the local Codex app, so no new desktop result is claimed | [Lifecycle testing limits](../../tests/vh-adlc/evidence/lifecycle/README.md) |
| Generic `vh-adlc` discovery entry, plugin 0.4.0 candidate | Native generic intake observed on Codex CLI and Claude CLI; GUI compatibility deferred in #33 | [Shared triage acceptance](../specs/shared-triage.md) |
| Codex VS Code extension and Copilot's Codex harness | Not yet tested | Not inferred from the desktop app |
| Claude Code desktop app 2.42304.2, macOS arm64 | Historical core GUI loop passed on plugin 0.1.2, through gated completion; the new inherited-default policy has not been rerun here | [Desktop GUI run](../../tests/vh-adlc/evidence/claude-desktop/gui-smoke.md) |
| Claude Code VS Code extension 2.1.301, macOS arm64 | Partial GUI validation: seven operations, investigation, independent spec review and structured owner questions passed | [Native extension GUI run](../../tests/vh-adlc/evidence/claude-code-extension/gui-smoke.md) |
| Claude Code remote sessions | Unsupported | Not inferred from another Claude Code surface |
| VS Code Copilot Chat 1.142, Local harness, macOS arm64 | Core GUI loop and explicit-model rejection passed; permission-mode caveat recorded separately | [Local GUI run](../../tests/vh-adlc/evidence/vscode-local/gui-smoke.md) |
| VS Code Copilot Chat, Copilot and Claude harnesses | Unsupported | Not tested |
| `vh-adlc-orchestrate` workstream orchestration, plugin 0.31.0 | Unverified on every host; only package tests of the procedure's text have run | [Workstream orchestration](#workstream-orchestration) |
| Copilot CLI lifecycle intake and agent loop | Unsupported | [Copilot CLI evidence](../../tests/vh-adlc/evidence/copilot-cli/README.md) |
| `vh-adlc-clean` host cleanup, plugin 0.13.0, Claude Code and Codex on Linux | Headless Claude Code 2.1.316 auto-mode and Codex CLI 0.163.0 `workspace-write` sessions and the real-host sequence passed on one Linux host with the operation as it stood at plugin 0.11.0, unchanged in 0.13.0; interactive sessions are not covered | [Host cleanup acceptance](../specs/host-cleanup.md); [AC-11 procedure](../../tests/vh-adlc/evidence/clean/procedure.md); [host cleanup](#host-cleanup) |
| macOS arm64 | Core desktop GUI loop passed; other surfaces and full-matrix limits are listed separately | [Desktop GUI run](../../tests/vh-adlc/evidence/claude-desktop/gui-smoke.md), [binary and fixture checks](../../tests/vh-adlc/evidence/claude-code/S1.host.macos.md) |
| Antigravity CLI 1.4.7 and the language server from standalone IDE 2.5.5 run headless, Linux x64, plugin 0.3.1 | Unsupported for workflows. Native GitHub installation passed and all seven skills of that version were discovered; the reviewer agent was skipped because Antigravity expects `tools` as a YAML list. No authenticated workflow ran | [Installation](../../tests/vh-adlc/evidence/antigravity/install-smoke.md); [reviewer fallback](../../tests/vh-adlc/evidence/antigravity/reviewer-fallback.md) |
| Kiro CLI 1.26.0, Linux x64, reviewer file from plugin 0.3.1 (`6ea0ce5`), plugin not installed | An explicit read-only child profile reported reading the shared reviewer; the generic default child was not usable, and a trusted-shell child ran validation but could also create files, so read-only was not enforced | [Reviewer fallback probes](../../tests/vh-adlc/evidence/kiro/reviewer-fallback.md) |
| Structural reviewer isolation | Unsupported: reviews record `procedural` | The reviewer has a shell, which can still write |
| Choosing a specific reviewer model | Capability-dependent; a mismatch remains pending | A host must be able to pass the requested model and return a matching identity. A silently substituted model or an unavailable selector never counts as a match |

On every host, a review with no named reviewer model uses the host's inherited default. Version 0.2.0
removes the earlier Claude-specific preferred-model and fallback chain.
Some hosts do not expose that model's identity: the Review Log records `unknown`, and the report says
that identity was not attested. Asking for a specific model still requires a matching identity;
`unknown` cannot satisfy that request.

Hosts may register the reviewer agent directly or dispatch a generic independent subagent that reads
the same reviewer file. If neither capability is available, the review stays pending with a handoff.
The primary session never substitutes self-review for independence.

Plugin 0.20.0 brings the review convergence rules. The severity definitions, the nit rule and the
free-text rule come from the docs revision a repository resolves, and need `1ccf8f3` or later. On an
earlier pin the reviewer rates findings without the shared definitions, and the spec operation applies
a factual nit and turns a judgement nit into an Open Question, as before. The failure-mode check, one
pass for every finding, one revision per pass and the ban on rewriting a reviewed commit apply on any
pin.

Plugin 0.28.1 limits a drift re-review of an accepted spec to one revision and one follow-up review.
If the follow-up still finds a blocker, the skill pauses for an owner decision. See the
[spec skill](../../plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md#drift-re-reviews).

Plugin 0.29.0 lets a verification rung declare `stages`. A rung with `stages: [completion]` is skipped at
each task and runs once when ship verifies the feature, before push, completion and delivery. Older plugins
refuse the field, so update the plugin before adding it to `.vh-adlc/loop.yaml`. See the
[loop settings reference](../../plugins/vh-adlc/references/loop-settings.md#verification-rungs).

## Article operation

The article and promotion procedure is packaged as `vh-adlc-blog`. Its source
checks cover discovery, preservation and publication boundaries; native runtime
checks are recorded separately under `tests/vh-adlc/evidence/blog/` when executed.
No desktop, extension or connector support follows from those source checks.
An unavailable write-like-me retrieval integration remains unverified even when
drafting from supplied voice references works. The operation can use the pinned
prose guide when the humanizer skill is unavailable.

Continue with [your first feature](../get-started/first-feature.md) or
[review requirements](../user-guides/workflows.md#reviews).

## Shared documentation impact

Plugin 0.9.0 is published through [PR #51](https://github.com/michielvha/vh-adlc/pull/51)
at source `02096e780deea4d695c7352dca0bfd54808574b6`. Its canonical payload digest is
`2e0b09a6079e12f5a820853aaeb1a395ab971189872a2005ad8a5f0e754b5781`.

| Surface | Observed result | Limit |
| --- | --- | --- |
| Copilot CLI, Opus 5.5 | All 15 synthetic cases have successful observations under the current plugin component: 12 cases in trial 11, contracts in trial 9 and manual/fenced entry in trial 10. | Focused retries after retained failures, not one all-green initial run. Exact requests and source bindings remain in the feature evidence. No remote write. |
| Codex CLI 0.163.0, GitHub marketplace | Actual fresh install and 0.8.0-to-0.9.0 upgrade discover 13 skills. Installed roots/candidate/no-match checking, uninstall/reinstall and input/index preservation pass. | Isolated native installation and helper checks outside an agent session. |
| Claude Code CLI 2.1.316, GitHub marketplace | Actual fresh install and 0.8.0-to-0.9.0 upgrade discover 13 skills; the installed helper and uninstall/reinstall checks pass. | Native installation/helper evidence, not Claude docs-impact model execution. |

The initial native setup succeeded before an acceptance-operator log-path error
interrupted helper verification. Continuations used the same installed/upgraded
profiles and retained the original transition transcripts. This was not a failed
plugin install or a second upgrade presented as the first.

Published-source Linux CI passed 1,226 tests. macOS passed 1,068 with one explicit
skip: its filesystem rejects the Linux invalid-byte filename fixture before the
checker runs. Earlier failed CI attempts and their focused fixes remain recorded.
All other published-source jobs passed. The configured signed runtime release
[v0.14.0](https://github.com/michielvha/vh-adlc/releases/tag/v0.14.0) was verified
against the repository public key and all four archive checksums; only Linux amd64
was executed here. Plugin 0.9.0 deliberately retains its verified 0.9.0 runtime lock.

Existing triage and maintenance knowledge resolve at convention `f8ccacb`.
Audit's cold offline entry reports its knowledge gap; explicit setup then permits
the warmed offline entry. These checks do not establish live tracker/audit effects.

Stackweaver's advisory hook checks HEAD metadata and suppresses stderr on quiet
no-match results. Current task-owned doc metadata needs explicit `--metadata-path`
overlays. Consumer adoption requires fresh installed full-corpus parity, caller
inventory, rollback and paired review before merge, plus post-merge route checks.

Claude docs-impact model execution, GUI/phone entry and live Stackweaver screenshot
capture remain unclaimed. Other operations' compatibility rows do not establish
those capabilities.

## Feature reservations

The reservation workflow targets ordinary Codex and Claude Code sessions in opted-in repositories.
Other clients may inspect or review there. Unadopted repositories retain their existing routes.
A nested client must start without its parent's session markers so it can supply its own identity.
Native resume and adoption must be verified against the installed package before an adopter enables
writers. See [adoption and handoff](../../plugins/vh-adlc/references/authority.md#reservation-adoption).

## Documentation truth review

Codex CLI and Claude Code both discovered `vh-adlc-docs-truth` after a fresh
marketplace install and after upgrading from 0.26.1 to 0.27.0. All four installs
matched the released package at commit `84e59c89`. Both clients passed the
synthetic claim review and freshness report through the installed skill.
[Release and acceptance evidence](../specs/shared-docs-truth.md#tasks)

Stackweaver kept its `/docs-truth` command, selector and existing verification
history. The native Claude trials exercised read-only reports, authorized fixes,
ledger updates and delivery recovery in disposable repositories. The
post-merge report used the merged command and the installed skill.
[Stackweaver migration #1162](https://github.com/michielvha/stackweaver/pull/1162)

<a name="shared-documentation-drift-candidate"></a>

## Shared documentation drift

Plugin 0.26.1 packages `vh-adlc-docs-drift`, strict consumer settings,
source-accounted collection, selected correction/resolution preparation and
native publication/recovery helpers. Stackweaver adopts the published workflow
through [migration #1160](https://github.com/michielvha/stackweaver/pull/1160).
The [feature document](../specs/shared-docs-drift.md) records exact sources,
retained failures and lifecycle completion separately from adoption.

The setup reference lists implemented native client adapters. That list does
not establish live backend verification. Stackweaver selects Claude for every
configured profile; native Copilot execution remains unclaimed.

| Surface or capability | Observed evidence |
| --- | --- |
| Local shared source and owned Git/API fixtures | Exact-source CI passes collection, protection, payload, recovery, resume, discovery and packaged command checks. Fixtures remain labelled synthetic. |
| Independent Claude Code Opus 5.5 paired source review | Final C/P review r21 has no blocking or should-fix findings; both small follow-ups are addressed. Canonical criterion records and the lifecycle gate are tracked in the feature document. |
| Actual Codex and Claude marketplace fresh installs/upgrades | All four ordinary paths pass for 0.26.1 at published source `dae76bf9`, matching all 291 files, modes and component fingerprint. The earlier 0.26.0 observations keep their original attribution. |
| Active ordinary Claude installation | A real registered Claude Code 2.1.326 Opus 5.5 session loads 0.26.1 with its native process marker present. The checker matches all shipped files and preserves foreign metadata and notification settings. The earlier 0.26.0 active-cache refusal remains a recorded release limitation. |
| Actual Claude native interactive worker/reviewer identities | Both intake profiles have passing synthetic preparation/verification observations at original 0.26.0 consumer `ded677aa`, with separate Opus 5.5 contexts. Their entry digests remain unchanged; the final checklist validates their original sources without relabelling them as 0.26.1 executions. |
| Actual unattended installed synthetic publication | Actions run `44486848125` at consumer `92f1c685` passes with ordinary 0.26.1 installation, native Claude Code 2.1.325, distinct Opus 5.5 contexts and real owned bot publication. Its draft PR is closed unmerged after stopped execution; both terminal trial receipts remain. This does not establish a production weekly sweep. |
| Stackweaver parity, cutover and rollback | Complete 875-document/twelve-unit parity and protection checks pass at staged C. The actual D and merged default branch pass installed preflight. The final feature passes 92 consumer tests and all 48 repository checks without skips; a real-D revert restores the whole staged tree. Local scanners, rules, schedule, accounts, credentials and notification routing are preserved. |
| Copilot marketplace/native execution | Unclaimed for this operation. The named Copilot intake profile selects the authorized Claude backend. |
| Codex desktop, VS Code Local and other GUI/phone entry | Owner-deferred. No live GUI/phone behavior is claimed. |
| First production weekly sweep | Unobserved; the migration dispatches no real-backlog sweep. |

The ordinary installed payload must match the consumer's released component
binding and flat checklist before production execution. The checklist records
operator/reviewer attestations for C and the reviewed activation; it is not an
OS-enforced trust boundary. Missing or stale original evidence blocks adoption.
Follow the [setup and adoption reference](../../plugins/vh-adlc/references/docs-drift-settings.md)
and [publication/recovery limits](../../plugins/vh-adlc/references/docs-drift-review.md).
