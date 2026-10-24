[Documentation](../README.md) / Compatibility

# Compatibility

Check the plugin version as well as the host: a successful run on an older version
does not establish support for a newer workflow. Installation instructions are in
[Install vh-adlc](../get-started/installation.md).

## Shared triage

Shared triage is an unpublished local candidate on plugin 0.4.0. Bounded Codex CLI and Claude Code
CLI native trials have passed; the current Claude follow-up also passes a private read-only trial
and synthetic legacy/shared analysis comparison. The [feature evidence](../specs/shared-triage.md)
records the exact commits, payload hashes and limits. Codex desktop and VS Code Local trials remain
unverified. Migration is still blocked by the receipt-trust decision, remaining closure-provenance
work and a fresh final review. Do not treat these intermediate results as release readiness.
No triage support is claimed for other GUI surfaces. The historical results below retain their
original operation/version scope.

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

Continue with [your first feature](../get-started/first-feature.md) or
[review requirements](../user-guides/workflows.md#reviews).
