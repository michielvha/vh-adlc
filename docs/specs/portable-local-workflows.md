---
status: in-progress
status_description: "Implementing the accepted local portability and GUI checks."
issue: https://github.com/michielvha/vh-adlc/issues/16
branch: feat/portable-local-workflows
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

The owner separately authorised the repository's existing automatic tag/release workflow on the final
verified merge. This does not authorise a manual release, deployment or changes to that workflow.

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

- [x] AC-01: Native Codex discovers the same seven operations from the shared package, while Claude compatibility discovery still works and no generated workflow tree exists.
      Evidence: native Codex GUI installed 0.2.0 and reported all seven operations. An isolated Claude-native install of the same tree listed seven skills and one agent. Metadata equality and shared-tree package tests pass.
- [x] AC-02: Unnamed reviews on every host inherit its default without an override; registered and generic independent dispatch use the same reviewer instructions.
      Evidence: shared-protocol and both-operation contract tests pass. Codex GUI used independent shared-contract reviewers; Local used the registered reviewer. Neither requested a model; both stored honest unknown identities. The new Claude default policy has not had a model-session rerun.
- [x] AC-03: An explicit unknown reviewer identity is eligible only without a requested model; missing headers and mismatched explicit requests store no eligible review.
      Evidence: contract tests retain malformed-header rejection and strict explicit matching. Codex and Local stored eligible unnamed unknown reviews. The repeated Local unavailable-model GUI request under verified Default permissions returned review pending, with no new row/subsection or fixture change.
- [x] AC-04: The skill installer works when extracted without its executable bit and still rejects a digest mismatch.
      Evidence: real installer tests ran a mode-0644 copy through Bash, verified its locked binary and preserved mode 0644. All digest-rejection cases passed; the production lock and verification code are unchanged.
- [x] AC-05: A real Codex local GUI executes investigation, spec review, owner acceptance, tasks, test-first implementation, independent implementation review and gated completion in a disposable fixture.
      Evidence: native app 26.1013.40934 completed fixture c20fb38 through five independently met criteria and the real completion gate. Independent post-run tests passed and complete preservation snapshots matched. See tests/vh-adlc/evidence/codex/gui-smoke.md.
- [x] AC-06: VS Code Local executes the remaining coding/review/completion flow and an explicit-model negative case, without including unrelated work or changing another worktree.
      Evidence: real Local GUI completed b10c1a1 after test-first implementation and independent R-2. The negative case left state unchanged; full unrelated/second-worktree snapshots matched. Core-loop permission UI showed Allow all unexpectedly, so normal per-command approval for that full run is not claimed; Default permissions was restored. See tests/vh-adlc/evidence/vscode-local/gui-smoke.md.
- [ ] AC-07: GUI-first setup and the support matrix state verified surfaces, exact limits and native update/removal routes; attempted native Claude and shipping checks are recorded without claiming blocked runs passed.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Package tests check descriptors and one shared workflow tree. Native Codex GUI lists all seven skills. Claude plugin validation and discovery check the compatibility package. |
| AC-02 | Contract tests cover both review operations and the protocol, with no host-model branch. Real Codex and Local independent reviews record their dispatch and returned model without borrowing a primary label. |
| AC-03 | Contract tests preserve malformed/explicit-model checks; the actual Local GUI explicit-model negative request leaves no new eligible row or subsection. Positive unknown identity is checked with `review check`. |
| AC-04 | Run the real installer through Bash from a mode-0644 fixture copy. Existing installer tests exercise valid and invalid digests. |
| AC-05 | Drive the native Codex GUI on a disposable fixture; verify exact commits, status complete, passing tests, an independent criterion review and completion-gate line. Record whether desktop or extension was used; do not infer the other. |
| AC-06 | Drive actual Local chat on a disposable fixture. Compare the unrelated staged/unstaged/untracked contents and modes before and after; require identical snapshots of the second worktree's HEAD, index, tracked and untracked file contents and modes. Verify feature tests, review records, completion commit and negative-model outcome. |
| AC-07 | Read actual GUI setup/update/remove controls or official native instructions. Record the native Claude attempt and a GUI shipping attempt against the throwaway fixture; report any permission, authentication or quota blocker. Run the package checker and check documentation links. |

## Tasks

- [x] T1 `tests/vh-adlc/check.test.ts`, `tests/vh-adlc/ensure.test.ts` - portable manifest, shared dispatch/default policy and mode-0644 installer contracts fail before their implementation (AC-01, AC-02, AC-03, AC-04)
      Evidence: `bun test tests/vh-adlc/check.test.ts tests/vh-adlc/ensure.test.ts` exited 1 before implementation: absent portable metadata and outdated dispatch/default/invocation contracts failed. Bash already passed the mode-0644 runtime case; the missing production instruction is the regression.
- [x] T2 `plugins/vh-adlc/`, `.agents/plugins/marketplace.json` - T1 passes with native metadata, one reviewer contract, inherited defaults and Bash installer invocation; existing package tests pass (AC-01, AC-02, AC-03, AC-04)
      Evidence: targeted Bun tests passed 63/63; full `bun test tests/vh-adlc` passed 76/76 with 280 assertions. `claude plugin validate --json plugins/vh-adlc` passed without errors or warnings. Binary lock and installer verification logic are unchanged.
- [x] T5 `tests/vh-adlc/scenarios/run.ts`, `plugins/vh-adlc/references/review-protocol.md` - executable model scenarios assert inherited dispatch rather than the retired fallback chain; missing canonical instructions stay pending (AC-02, AC-03)
      Evidence: old S11.1/S11.2/S11.7 explicitly required the retired model chain. They now check actual subagent traces and absence of concrete overrides. Full Bun checks passed 76/76 and the scenario entry point compiled. The authenticated headless scenario runner was not executed; compilation is not scenario proof.
- [x] T3 `tests/vh-adlc/evidence/codex/`, `tests/vh-adlc/evidence/vscode-local/` - real local GUI runs verify core loops and explicit-model rejection, with preservation snapshots (AC-03, AC-05, AC-06)
      Evidence: Codex c20fb38 and Local b10c1a1 completed through independent review and actual gates; independent tests and complete preservation snapshots passed. Local negative-model rejection was rerun under Default permissions. The Local core-run permission caveat is recorded rather than hidden.
- [ ] T4 `README.md`, `tests/vh-adlc/evidence/claude-code-extension/gui-smoke.md` - native setup/update/removal instructions and bounded host/shipping outcomes match measured runs; package checks pass (AC-07)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | R-1 | spec | `044b43685584208d7c3146289f423858baa0f2b7` | unknown | procedural | One factual should-fix; model identity not attested |
| 2026-10-20 | R-2 | spec | `41fde3a096a0c55905167b3e4e8d14636ce8542f` | unknown | procedural | No findings; model identity not attested |
| 2026-10-20 | R-2 | spec | `41fde3a096a0c55905167b3e4e8d14636ce8542f` | n/a | n/a | accepted by owner |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-06
EVIDENCE: docs/specs/portable-local-workflows.md:94 names comparison of “original dirty entries and other-worktree HEAD”. AC-06 requires not changing another worktree, but its HEAD remains unchanged when its files or index are modified.
PROPOSAL: Capture and compare the second worktree's HEAD, index and working-file contents, including untracked files, before and after the GUI run. Require those snapshots to match.

### R-2

NO FINDINGS

## Sources

- [OpenAI skills](https://developers.openai.com/codex/skills): shared `SKILL.md` layout, native invocation and symlink discovery.
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): portable root manifest and native marketplace metadata.
- [Agent Plugins schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json): root manifest fields.
- [OpenAI subagents](https://developers.openai.com/codex/subagents): independent local subagent capability; no bundled role file is required for generic dispatch.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): feature gates and review records.
