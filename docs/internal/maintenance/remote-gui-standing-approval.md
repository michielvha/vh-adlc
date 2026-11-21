---
issue: https://github.com/michielvha/vh-adlc/issues/62
---

# Maintenance: honor standing owner approval for saved browser reuse

## Definition

Outcome: stop repeatedly asking an owner to approve browser control when their
explicit standing instruction already covers the named profile and requested work.

Preserved contract: named profiles remain owner-bound and single-writer. Agent
starts still require `--agent-start-approved`; that flag is recorded per runtime
session and is never persisted as a profile permission. Unapproved starts remain
human. Credential/MFA challenges retain human handoff and confirmed return.
Provider-action authority and the existing lifecycle/cleanup rules are unchanged.

Task base: `335a00de2a63a438e70f75a313f1559c87e6bf3e`.

Affected paths:

- `plugins/remote-gui/skills/remote-gui/SKILL.md`
- `plugins/remote-gui/README.md`
- `plugins/remote-gui/examples/standing-agent-approval.md`

Verification inputs: those instruction files, the unchanged remote-gui config
parser and profile/session tests, and the independently installed package tests.

Proposed change: clarify that an explicit standing owner instruction active in
the task supplies approval for each eligible invocation. A per-session flag is
not a requirement for a new human prompt. Add an opt-in startup instruction
example and retain the default when no applicable approval exists. This repairs
instruction wording; it adds no runtime interface or stored permission mechanism.

Required checks:

- Native Go config/profile tests keep approved starts accepted and unapproved or
  misplaced approval flags rejected.
- `bun test tests/remote-gui` checks the packaged instruction files; optional
  browser/native-agent suites must be reported as skipped when not enabled.
- Read the final guidance for profile/owner/work scope, revocation, real credential
  challenges and unchanged provider-action authority.
- Verify the adopted host instruction is copied from the versioned example and
  preserves the existing workstation and Oracle instructions.

Owned maintenance role: `/home/m/code/vh-adlc-browser-standing-approval`, branch
`fix/remote-gui-standing-approval`, locked for this maintenance task. Other active
feature worktrees are outside this change.

## Evidence

The previous README said approval was given "for that one session" and the skill
mentioned only the current task. The owner reported repeated prompts despite
wanting autonomous reuse of the saved browser. The runtime config parser already
accepts the approval flag and does not implement a human-prompt mechanism. No
runtime regression failure is invented for this instruction repair.

The repair follows the repository pin `vhco-pro/docs@0c983f6793bfe35eb96ae95ad0c361c6200af44f`,
including `conventions/testing.md`; prose follows `guides/humanize-prose.md` at that revision.
This is a follow-up to the reusable-profile work tracked by issue #62.

Observed checks:

- Native `go test -race ./internal/config ./internal/profile ./internal/session`
  passed all three packages, with executed durations rather than cached verdicts.
  The CLI approval flag remains required and misplaced flags remain rejected.
- `bun test tests/remote-gui --timeout 60000` passed 11 package checks. All 46
  opt-in browser/native-agent scenarios were skipped and are not claimed as evidence.
- The existing saved profile reopened in agent mode under the owner's explicit
  standing instruction, retained its owner binding and showed an authenticated
  provider session without another sign-in. This is live owner-task evidence,
  not execution of an automated native-agent routing fixture.
- The workstation adopted the exact versioned example block. Its SHA-256 is
  `106bee3f09b0d5336afcefb51a73ad901c86f009abef356ab4e994283650ad94`.
  The existing startup instructions were preserved and their mode remains `0600`.
  A protected original copy was retained outside Git.
- `git diff --check` passed. No runtime, package version, profile data, persisted
  permission field, authentication rule or release workflow changed.

The current installed runtime already supports the required flag. The adopted
owner instruction takes effect immediately; this source change clarifies the
shared package guidance. It does not claim a new marketplace release.

## Reviews

### R-1

Target: `bec33ce76b0cf083f062bddced407e352b3395c8`.
Model: unknown; the native Codex review context supplied no exact model identifier.
Isolation: procedural, read-only source instructions; HEAD, branch, index and
working tree were verified unchanged before/after.

The reviewer independently observed 11 passing Bun package checks, 46 opt-in
skips, and passing uncached Go race checks for config, profile and session.
An initial read-only cache error and sandbox-denied socket option were environment
limits; the same fixture checks then passed with an owned temporary cache and
the permitted native test boundary. Live host/profile claims remain author evidence.

Verbatim return:

```text
MODEL: unknown
NO FINDINGS
```

## State

Locally complete and independently reviewed. The shared guidance and adopted host
instruction agree. Publication bookkeeping may be appended without changing the
reviewed source or Definition. No merge or marketplace release has occurred.
