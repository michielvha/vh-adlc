[Documentation](../README.md) / Compatibility

# Compatibility

Check the plugin version as well as the host: a successful run on an older version
does not establish support for a newer workflow. Installation instructions are in
[Install vh-adlc](../get-started/installation.md).

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
| Copilot CLI lifecycle intake and agent loop | Unsupported | [Copilot CLI evidence](../../tests/vh-adlc/evidence/copilot-cli/README.md) |
| macOS arm64 | Core desktop GUI loop passed; other surfaces and full-matrix limits are listed separately | [Desktop GUI run](../../tests/vh-adlc/evidence/claude-desktop/gui-smoke.md), [binary and fixture checks](../../tests/vh-adlc/evidence/claude-code/S1.host.macos.md) |
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
