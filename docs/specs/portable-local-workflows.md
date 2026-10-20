---
status: draft
status_description: "Scope approved; awaiting independent spec review and acceptance."
issue: null
goal: "Run the same ADLC workflow in local Codex and existing GUI hosts without generated host implementations."
covers:
  - plugins/vh-adlc/
  - .agents/plugins/
  - tests/vh-adlc/
  - README.md
---

# Plan: Portable local workflows

## Context

The original loop is complete: `vh-adlc next docs/specs/personal-development-loop.spec.md` returned
`action: none`, rule 17, on `f86d851`. GUI coverage remains tracked in issue
[3](https://github.com/michielvha/vh-adlc/issues/3). The existing evidence records a complete desktop
core loop and a passing Local default-review regression, but no Local implementation/completion run.
The native Claude extension stopped during its third spec review at the host usage limit.

`codex --version` returned `codex-cli 0.163.0`; `code --list-extensions --show-versions` found
`openai.chatgpt@26.1007.21434`, and `/Applications/Codex.app` exists. OpenAI's current packaging guide
documents root `plugin.json`, native marketplace discovery and the existing `skills/` layout.
The package checker currently forbids that manifest (`tests/vh-adlc/check.test.ts`, manifest tests).
The shared review protocol currently selects Claude-specific default models
(`plugins/vh-adlc/references/review-protocol.md`, Models).

The installed VS Code plugin copy's installer is mode 0644, while the source is mode 0755; `cmp`
confirmed identical bytes. Direct invocation failed with permission denied. The executable source
installer passed its existing checksum verification and returned the locked 0.1.0 binary.

On 2026-10-20 the owner approved local GUI completion and native Codex support, one shared workflow
with static discovery metadata, inherited default reviewer models on every host, GUI control of
disposable windows, and shipping/merging this bounded work after verification.

## Scope

One local workflow package: Codex-native discovery, portable reviewer dispatch, and execution in the
Codex and VS Code Local GUIs. Existing Claude discovery must remain intact. Attempt the remaining
native Claude extension run only within its normal allowance.

No emitters, generated skill mirrors, duplicated reviewer prompts, host adapters that implement the
loop again, new runtime dependencies, credential changes, paid-usage purchases, app restarts,
software releases or deployments. Remote/cloud sessions remain unsupported. Unrelated dependency
PRs and other repositories are excluded, except the existing throwaway ADLC shipping fixture.
An unavailable host or usage limit is a blocker, not a passing test; a residual needs owner approval.

## Design

Keep the seven `skills/*/SKILL.md` files, references, installer, lock and reviewer instructions in
`plugins/vh-adlc/`. Add a portable root Agent Plugins manifest and native marketplace metadata pointing
to that directory. Retain the Claude compatibility manifest. Both descriptors have the same package
identity and version, checked by tests; they contain metadata, not separate workflows.

Every unnamed reviewer inherits the host's configured default: no model override or Claude alias.
Explicit requests have no fallback. Keep matching, malformed-header rejection, exact-commit targeting,
byte-preserving review storage, gates and the honest `unknown` identity unchanged.

Prefer a registered reviewer when available. Otherwise use the host's independent subagent capability
with the existing reviewer file as its instructions and the same complete dispatch inputs. Never
replace an unavailable independent context with self-review; produce the existing pending handoff.
Do not require a host-specific agent registration file. Shell-enabled reviews remain procedural.

Invoke the installer through Bash so native extraction need not preserve its executable bit. Do not
chmod installed files, skip digests or accept a different binary. Installation, update and removal
instructions must name the actual native GUI operations or documented native discovery routes.

The support matrix distinguishes a passed core GUI loop from full scenario coverage. Preserve
existing evidence and add dated results with exact fixture commits. GUI agents work in disposable
repositories, preserving staged, unstaged and untracked entries and the second worktree. Shipping
tests use only the existing throwaway repository, never a real project.

## Acceptance Criteria

- [ ] AC-01: Native Codex discovers the same seven operations from the shared package, while Claude compatibility discovery still works and no generated workflow tree exists.
- [ ] AC-02: Unnamed reviews on every host inherit its default without an override; registered and generic independent dispatch use the same reviewer instructions.
- [ ] AC-03: An explicit unknown reviewer identity is eligible only without a requested model; missing headers and mismatched explicit requests store no eligible review.
- [ ] AC-04: The skill installer works when extracted without its executable bit and still rejects a digest mismatch.
- [ ] AC-05: A real Codex local GUI executes investigation, spec review, owner acceptance, tasks, test-first implementation, independent implementation review and gated completion in a disposable fixture.
- [ ] AC-06: VS Code Local executes the remaining coding/review/completion flow and an explicit-model negative case, without including unrelated work or changing another worktree.
- [ ] AC-07: GUI-first setup and the support matrix state verified surfaces, exact limits and native update/removal routes; attempted native Claude and shipping checks are recorded without claiming blocked runs passed.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Package tests check descriptors and one shared workflow tree. Native Codex GUI lists all seven skills. Claude plugin validation and discovery check the compatibility package. |
| AC-02 | Contract tests cover both review operations and the protocol, with no host-model branch. Real Codex and Local independent reviews record their dispatch and returned model without borrowing a primary label. |
| AC-03 | Contract tests preserve malformed/explicit-model checks; the actual Local GUI explicit-model negative request leaves no new eligible row or subsection. Positive unknown identity is checked with `review check`. |
| AC-04 | Run the real installer through Bash from a mode-0644 fixture copy. Existing installer tests exercise valid and invalid digests. |
| AC-05 | Drive the native Codex GUI on a disposable fixture; verify exact commits, status complete, passing tests, an independent criterion review and completion-gate line. Record whether desktop or extension was used; do not infer the other. |
| AC-06 | Drive actual Local chat on a disposable fixture. Independently compare original dirty entries and other-worktree HEAD, feature tests, review records, completion commit and negative-model outcome. |
| AC-07 | Read actual GUI setup/update/remove controls or official native instructions. Record the native Claude attempt and a GUI shipping attempt against the throwaway fixture; report any permission, authentication or quota blocker. Run the package checker and check documentation links. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [OpenAI skills](https://developers.openai.com/codex/skills): shared `SKILL.md` layout, native invocation and symlink discovery.
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): portable root manifest and native marketplace metadata.
- [Agent Plugins schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json): root manifest fields.
- [OpenAI subagents](https://developers.openai.com/codex/subagents): independent local subagent capability; no bundled role file is required for generic dispatch.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): feature gates and review records.
