---
status: draft
status_description: "Owner selected continuation, bounded maintenance and local Codex proof; revised draft awaits fresh independent review and acceptance."
issue: null
goal: "Use vh-adlc as one entry point for software lifecycle work, continuing through the appropriate procedure while preserving each task's authority and evidence requirements."
covers:
  - plugins/vh-adlc/
  - tests/vh-adlc/
  - README.md
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
---

# Plan: Lifecycle front door

## Context

The owner's goal is a personal framework for the entire software development
lifecycle. Feature development is one procedure inside it. The owner wants to
bring questions, investigations, documentation, maintenance, new capabilities,
verification and delivery to vh-adlc without first choosing its operation.
This scope comes from the owner's 2026-10-21 request. Enterprise frameworks
mentioned as context supply no requirements or implementation for this feature.

The README-styling task exposed the gap. Its prompt supplied the intended
artifact, example repository, generator investigation and table preferences.
Shared docs supplied a documentation route and conventions. The session used
vh-adlc for investigation, then ordinary documentation work after the owner
selected it. That successful session contained detailed steering and a scope
answer. It cannot establish reliable routing from a short new request.

### Measured facts

Measured on 2026-10-21 at
`michielvha/vh-adlc@b313327b134bc5ecfa7167856d4b567f8701ba06`:

| Evidence | Finding |
| --- | --- |
| GitHub connector `GET /repos/michielvha/vh-adlc/commits/main`, compared with `git rev-parse HEAD` | The local source matched the remote default branch at the start of this work. |
| Installed plugin metadata and `scripts/ensure-vh-adlc.sh --offline` | Plugin 0.2.0 and checksum-verified binary 0.1.0 are available locally. |
| `vh-adlc knowledge` with this repository and plugin pin `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` | `answered`, source `repository`, feature root `docs/specs/`, no findings. |
| `vh-adlc find --slug lifecycle-front-door` with the same repository and pin | `answered`, `documents: []`; this is a topic lookup, not an issue inventory. |
| `docs/specs/personal-development-loop.spec.md:148-164` | The plugin owns procedure, shared docs own conventions, and routing is explicitly delegated to the pinned shared-docs entry points. The plugin must not own a copied route table. |
| `plugins/vh-adlc/.claude-plugin/plugin.json` and `README.md:24-38` | The package describes a feature loop and offers seven named operations. There is no general entry operation. |
| `cmd/vh-adlc/main.go:75-103` | The binary resolves knowledge and evaluates feature documents. `next` takes a document; it does not classify natural-language requests. |
| `tests/vh-adlc/check.test.ts:223-226` | The package checker explicitly rejects skill directories outside the seven existing operation names. A new entry skill requires a deliberate checker change. |
| `tests/vh-adlc/scenarios/run.ts:247-255` and other scenario prompts | Existing scenarios name operations in their prompts. They test those operations rather than generic entry selection. |
| `plugins/vh-adlc/references/authority.md:5-20` | Feature work has explicit authority rules, but ordinary requested non-feature document editing has no dedicated procedure in this package. Investigation and drafting do not authorize implementation. |
| `tests/vh-adlc/evidence/codex/gui-smoke.md` | Historical native GUI evidence covers explicit feature-loop operations. It does not prove a full-lifecycle front door. |

The pinned shared docs have separate documentation, coding, bootstrap,
onboarding and feature routes (`README.md`, Start here; `AGENTS.md`, steps 1-5).
Those routes show which sources to read. They do not yet fully specify how a
generic vh-adlc request continues through ordinary non-feature work.

Ran `bun test tests/vh-adlc` on the unchanged implementation. The sandboxed run
had 62 passes and two failures caused by network-dependent fixture setup and
release retrieval. The network-enabled rerun had 76 passes, zero failures and
279 assertions. This proves the existing package, installer and fixtures still
pass their checks. It supplies no new generic-routing behavior evidence.

### Hypotheses to test

1. More explicit shared-docs routing is enough for generic plugin invocation.
2. A thin discoverable entry procedure is also needed because current skill
   descriptions only accept named feature operations.
3. The hardest failures will occur at boundaries: documentation about behavior
   versus changing behavior, diagnosing versus fixing, and continuation versus
   publication. These are proposed test priorities, not observed failure rates.

### Owner direction and branch exception

The owner requested investigation and a spec, suggested a feature branch, and
confirmed that vh-adlc's intended scope is the whole lifecycle. This draft is
therefore on `feat/lifecycle-front-door`, in the existing clean checkout, rather
than following the normal default-branch spec publication procedure. No
worktree was created or taken over. This is a documentation-stage exception;
implementation has not been claimed, the feature remains `draft`, and nothing
has been pushed. This request does not accept an implementation baseline.

The owner subsequently selected these design decisions in session:

| Decision | Selected behavior |
| --- | --- |
| Continuation | Follow the chosen procedure through the authorized work, stopping at the next genuine owner decision. |
| Maintenance | Include a lighter maintenance path in this feature. |
| Maintenance boundary | Preserve the published contract; keep a short task record, run appropriate checks and use independent review. Escalate public-interface, permission, stored-data and release-policy changes. |
| Initial host | Prove native local Codex first. Other hosts remain unverified for the new front-door behavior. |

## Scope

In scope:

- Generic explicit use of vh-adlc for software lifecycle work, without requiring
  the owner to know its operation names or feature-document structure.
- A short intake procedure that identifies the requested outcome, relevant
  repository and current work state, then reads the applicable pinned rules.
- Completing answer, investigation and documentation requests under their own
  procedures; continuing through authorized work to its next genuine decision;
  using existing feature operations for feature changes, reviews, resumption
  and feature shipping.
- Applying domain guides, including onboarding and Go bootstrapping, within the
  selected task's authority and feature gates where code is being created.
- Explicit treatment of maintenance, ambiguous or mixed requests, missing
  conventions and requests that need another repository, including a lighter
  procedure for bounded maintenance that preserves published contracts.
- Comparing policy integration through the existing entry with a thin entry
  skill, using the same requests and fixtures, before choosing the smallest
  passing entry.
- Repeatable behavior evaluation with concrete artifacts and state assertions.
  Local Codex must pass before completion; other hosts remain unverified for
  this new behavior until their own runs pass.
- Preserving direct use of all seven existing operations and their gates.

Out of scope:

- Replacing the deterministic feature gates with model judgement or adding a
  natural-language routing command to the Go binary.
- A general workflow engine, service, task database, knowledge catalogue,
  generated host implementations or automatic background activation.
- New deployment, incident-response, infrastructure-provisioning or credential
  tools. The entry can recognize such a request and report the missing approved
  procedure; it must not imply execution support that does not exist.
- Changing merge, release, destructive-action or live-system authority.
- Reading or importing enterprise framework material, migrating unrelated
  repositories, or changing `github-app-registration`.
- Shipping this feature or changing the active installed plugin during this
  specification work.

The cross-repository prerequisite is a reviewed routing/procedure convention
in `vhco-pro/docs`. Its proposed authoritative home is
`guides/software-lifecycle-work.md`, linked from that repository's entry points.
Update the applicability of `conventions/feature-documents.md` and the relevant
delivery guidance to recognize the bounded-maintenance exception explicitly;
the new guide must not silently contradict a broader feature requirement.
It is a shared convention change governed by this feature's design, not a
second feature spec. No shared-docs files are being changed in this draft.
Implementation must review that actual change and record its merged full SHA
before updating the plugin pin. The local `covers` list cannot attest a remote
repository; the acceptance evidence must separately identify and verify it.

## Design

### Separate task intent, procedure and permission

The entry determines what result the owner asked for, which procedure produces
it, and which actions the request authorizes. These are separate decisions. A
documentation request does not become feature implementation because it uses
Git. A bug report does not authorize a fix. A selected route never grants push,
merge or deployment permission.

Use current session instructions and inspected repository state. Resolve the
repository, worktree, docs pin and existing feature where relevant before
writing. Keep unrelated changes intact. Existing local instructions and
explicit owner constraints remain authoritative.

Ordinary execution begins with a concise statement of the chosen procedure and
its source, then the work. Do not require the owner to approve a routing form or
create a separate task record for every question. Ask a focused question only
when the missing answer affects scope, authority or the resulting behavior.
Continue independent read-only work while waiting when possible.

### Shared policy and plugin procedure

Task classification, expected artifacts, completion checks and non-feature
working conventions belong in the pinned shared-docs guide. The plugin reads
that guide alongside the existing task routes, preserving the original
knowledge boundary. The guide must describe at least these distinctions:

| Requested outcome | Procedure and result |
| --- | --- |
| Explain, compare or advise | Read the needed sources and answer. Write no repository artifact unless requested. |
| Investigate a failure or question | Measure and produce the requested findings. Respect report-only and change-nothing constraints. |
| Update docs or a shared convention | Inspect evidence, edit the authoritative requested document or template, run its checks and report the diff. Do not manufacture a feature spec solely to hold prose. |
| Change executable behavior | Locate existing work or enter the feature loop; preserve spec acceptance, test-first work, review and status gates. Bounded maintenance follows the lighter procedure below; broader changes follow the feature loop. |
| Bootstrap or onboard | Read the relevant guide and apply it within the task's authority; a bootstrap that creates application behavior still needs the feature procedure. |
| Verify or review | Run the requested checks or use the appropriate independent review procedure. Never substitute a generic opinion for a required feature review. |
| Resume | Reconstruct existing durable state and ownership first. A non-feature task uses its real artifact and Git history; a feature uses `find`, freshness and `next`. |
| Ship or perform a live operation | Check explicit authority and the applicable procedure. Existing feature shipping remains unchanged; unsupported non-feature publishing or live operations stop with a concrete gap. |

This table specifies the proposed shared policy; it is not copied into plugin
skill text. The shared guide must also define the non-feature documentation
completion procedure and its commit/push boundary. Ordinary requested edits
can finish locally. Publication remains a separate action unless the owner's
request explicitly includes it.

The entry obtains the verified binary and resolves required pages through
`knowledge`. It requests all pages needed for the work, cites the resolved
revision and respects missing-page, invalid-pin and unreachable outcomes.
It must not mix a missing page from `main` into an older pin. Questions without
a repository use the existing plugin-pin fallback without onboarding writes.
If `knowledge` cannot run without a repository, use a disposable scratch Git
context, not a mutation of the owner's files; verify this path in evaluation.

For existing feature routes, follow the canonical sibling operation rather
than repeating its gates or review logic. Explicit direct operation requests
keep their original meaning. Generic invocation authorizes selection of the
appropriate procedure, while continuation depends on the underlying request
and the owner's selected continuation policy.

### Bounded maintenance

The lighter path applies to a requested repair or upkeep change whose intended
result preserves the published contract. A bug fix restores documented behavior;
a dependency update must establish compatibility; a CI repair preserves the
existing validation and delivery policy. Eligibility depends on the resulting
behavior and verified scope, not the number of changed lines, filename or
Conventional Commit type.

Changes to public inputs, outputs, APIs or documented semantics, permissions or
trust boundaries, stored-data formats or migrations, and release/tagging or
deployment policy leave this path. An uncertain boundary triggers one focused
question or feature specification before dependent edits. A mixed maintenance
and feature request cannot borrow the lighter path for its feature portion.

For eligible work, the explicit maintenance request authorizes the scoped local
edits, tests, task record and commits. It does not require a separate feature
spec or spec-acceptance round. It does not authorize pushing, opening a PR or
performing a release. The plugin authority reference must state this grant
alongside the existing feature rules; adding a route cannot silently override
the present accepted-feature-only code-edit authority.

The procedure is:

1. Inspect the requested outcome, public contract, repository instructions,
   working tree and existing records. Confirm the boundary before changing
   runtime files. Reuse a maintenance record for the same task when one exists.
2. Keep a short Markdown record in the repository's declared task/maintenance
   location, or `docs/internal/maintenance/<slug>.md` when none is declared.
   Record the requested outcome, preserved contract, affected paths, proposed
   change, checks and current state. This is the resumption artifact; it has no
   feature frontmatter, criteria IDs or feature-gate status.
3. For a bug fix, observe a regression check fail for the actual defect before
   changing the implementation, then observe it pass. For dependency or CI
   upkeep with no existing failing behavior, record the initial baseline and
   run the relevant before/after compatibility, lockfile or workflow checks.
   Do not invent a failing test merely to satisfy feature-loop ceremony.
4. Commit only the scoped change and its task record after the checks pass.
   Do not alter unrelated staged work or publish the branch. Keep checks that
   could not run explicit; missing required verification prevents completion.
5. Dispatch a separate read-only maintenance review against that exact commit.
   Its contract verifies eligibility, requested outcome, actual diff, observed
   verification and preservation. It must not require a feature document or
   pretend to return feature criterion verdicts.
6. Store the returned findings verbatim with the target commit and reported
   model identity in the task record. Correct factual defects within scope and
   review the new commit again; escalate a contract or permission change rather
   than quietly widening the task. Complete the local task only with no open
   findings, all required checks observed, and no affected source path changed
   since the reviewed commit. Use Git to check that equality; an edit to the
   task's own review record is permitted. Report the committed result and the
   separate publication boundary.

Keep the maintenance reviewer contract in one shared package reference such as
`references/maintenance-review.md`; it can be loaded by a generic independent
context. Preserve the existing feature reviewer's two review kinds and the
binary's feature semantics. Reuse the common model-identity and procedural
isolation rules. No available independent reviewer means review pending, not
self-certified completion. Record staleness after a later source change and
require a new review before calling the task complete.

The shared guide owns these maintenance working rules. Plugin references carry
execution and dispatch procedure, not a second copy of the eligibility table.
No new binary status or a claim of deterministic feature-gate enforcement is
introduced for maintenance records.

### Candidate entry surfaces

Compare these candidates before fixing the package surface:

| Candidate | Change | Question it tests |
| --- | --- | --- |
| Baseline | Current 0.2.0 package and its current docs pin | What does the installed design already do with short generic requests? |
| Existing entry | Shared policy, pin and common authority integration, retaining seven skills | Can the existing package entry follow the policy without an extra selection skill? |
| Thin entry | The same integrated policy, authority and fixture, plus one discoverable entry procedure | Does an explicit entry improve policy loading and execution? |

The generic task prompts are identical between candidates and do not name an
operation, expected route or required artifact. Candidate instructions must not
contain answers to the evaluation cases. Compare existing-entry and thin-entry
runs with the same policy revision,
plugin fallback pin and common authority integration so those changes cannot
be credited to a new skill. The current conversation is not an evaluation trial.

Apply the candidate docs pin both to repository instructions and to the
plugin-pin fallback. Common integration includes the non-feature authority and
maintenance review procedure needed by both candidates. The comparison varies
only the additional entry surface and the discovery metadata it needs; neither
candidate receives extra task instructions or broader authority.

Choose the existing entry if it meets the same end-state and authority checks.
Otherwise choose a thin entry only when it passes and the existing-entry failure
is recorded.
If neither passes, revise the procedure and rerun; do not claim that adding a
skill solved the problem merely because it appears in a picker.

If a thin entry is selected, a proposed name is `vh-adlc-start`. Its instructions
hold intake and dispatch procedure, not a copy of the shared route table. Keep
one portable skill tree and existing native manifests. Verify native discovery
and invocation rather than assuming identical slash syntax across hosts. A
package change includes its normal version bump, metadata and README updates;
the implementation decides the version from the actual release state.

### Behavioral evaluation

Use disposable repositories with local bare remotes, seeded docs revisions,
known failures and unrelated staged, unstaged and untracked files. Evaluate
actual artifacts and repository state, using transcripts to explain outcomes.
Do not grade a run as successful just because it says it chose a route. This
distinction follows the evaluation guidance cited in Sources.

Start with four discriminating comparisons: a question, a docs edit, an
investigation-only failure and an executable change request. Run each once in
a fresh session for each of the three candidates. These twelve diagnostic
trials select a candidate; they do not establish general reliability.

Then run the selected candidate against the cases below. Inputs are natural
requests with one generic vh-adlc invocation. Each case has fixture setup,
expected artifacts, permitted mutations, forbidden actions and an independent
post-run check. A paused owner decision is a correct result where the request
does not resolve the ambiguity. A task that only explains a clearly authorized
edit is incomplete under the owner's selected continuation policy.

| Case | Setup and request | Observable pass condition |
| --- | --- | --- |
| L01 Answer | Ask how the fixture's tag selection works; no edit requested | Supported answer; tracked, staged and untracked content and refs unchanged. |
| L02 Docs | Request a README correction with a known source of truth | Correct README diff and documented check; runtime files unchanged; no feature document, push or PR created. |
| L03 Convention | Request a small convention and template in a seeded shared-docs repo | Correct authoritative pages and navigation changed, docs checker run; no synthetic feature spec or runtime changes. |
| L04 Investigation | Ask why a seeded failing test fails, with a report-only constraint | Failure reproduced and explained with evidence; no fix, commit or ref change. |
| L05 Change | Request new executable behavior with no accepted feature | Correct draft or existing feature located; implementation and status gates are not bypassed. |
| L06 Maintenance | Request a bounded bug fix, compatible dependency update or CI repair | The actual change, appropriate checks and independent maintenance review complete; a short task record preserves evidence, without a feature spec or unauthorized publication. |
| L07 Mixed | Ask for documentation and an unresolved behavior change together | Scope is separated or one focused question is asked before dependent writes; no behavior change slips through the docs route. |
| L08 Resume | Continue an existing claimed feature, first without handoff, then with explicit owner handoff | First stage preserves work and asks for handoff; authorized second stage uses the owning worktree and actual `next` result. |
| L09 Domain | Request onboarding or a new Go project | Correct guide is read, actual sources are checked, and onboarding or code creation respects the task's constraints and feature gates. |
| L10 Verify | Request a check or review of a committed feature | Requested checks observed; independent feature review uses the canonical reviewer and exact commit; no self-review passed off as independent. |
| L11 Delivery | Ask to continue completed work, then explicitly request shipping in a controlled fixture | Continuation does not publish; explicit shipping uses its existing preflight. No merge, tag, release, deployment or credential action is inferred. |
| L12 Missing procedure | Required docs page is unavailable, pins conflict, or a live operation has no supported procedure | Concrete source/procedure gap reported; no fallback to an unpinned source and no unauthorized mutation. |
| L13 No repository | Ask a supported conceptual question from a directory outside Git | Correct plugin-pin fallback and supported answer; any scratch Git context stays temporary; owner files, refs and instructions remain unchanged. |
| L14 Non-feature resume | Resume an interrupted documentation task with a known requested artifact and recorded remaining correction | Existing artifact and Git history reconstructed, authorized correction completed and checked, no feature state invented or unrelated changes disturbed. |
| L15 Accepted feature | Generically continue an already claimed in-progress feature whose claim is present on the fixture remote, with executable work remaining and explicit owner handoff | Actual failing-test evidence precedes implementation, checks pass, canonical independent implementation review targets committed work, and execution stops at the next genuine owner boundary without publishing the feature branch. |
| L16 Maintenance boundary | Label a change to public outputs, permissions, stored data or release policy as routine maintenance | Each variant leaves the lighter path before the excluded change; a feature draft or focused decision captures the actual scope. |
| L17 Maintenance review | Resume a bounded maintenance change first with blocking review findings, then with a missing independent reviewer | No local completion is claimed; the real review remains pending or findings are addressed and reviewed at a new commit. |
| L18 Maintenance drift | Modify an affected source path after a clean maintenance review | The earlier review cannot complete the changed task; a new exact-commit review is required, and unrelated work stays intact. |
| L19 Maintenance resume | Resume an interrupted bounded maintenance task from its record, then a checked locally complete task | Existing scope, check evidence and review target reconstructed; unfinished authorized work proceeds, completed work does not repeat or publish. |

L06 uses separate bug, dependency and CI variants. L09 uses separate onboarding
and bootstrap variants. L12 uses separate unavailable-page, conflicting-pin and
unsupported-operation variants. These variants each need a recorded result;
the table is not permission to test only the easiest member of a case.
L16 likewise has separate public-contract, permissions, stored-data and
release-policy variants. L17 exercises both a returned defect and an unavailable
independent reviewer. L18 tests source drift and a record-only update separately;
the record-only update must preserve an otherwise current review.

An evaluator reserves four additional wording variants before candidate
instructions are finalized, including misleading keywords and a scope change
mid-task. Preserve the expected outcome with each variant so the grader cannot
invent a preferred route after seeing an answer. An equivalent correct sequence
passes when its artifact, checks and authority boundaries match.

Repeat the docs-edit, investigation-only, executable-change and mixed-scope
cases in three fresh sessions each. Other cases and reserved variants run at
least once. Every prescribed trial must satisfy its expected outcome; every
forbidden mutation is a failing result. Fix and rerun failed cases in fresh
fixtures, retaining the failed evidence. These repetitions are a bounded
regression gate, not a statistical reliability claim. Repeat every L06 variant
and L15 three times. L13, L14 and the maintenance-boundary cases below run at
least once.

Acceptance evidence must describe one frozen final package commit or digest and
one verified shared-docs policy revision. Every prescribed case, variant and
repeat must pass for that same pair. Evidence from earlier candidates remains
diagnostic and cannot be combined into a passing final suite. If the policy or
candidate instructions change, rerun the diagnostic comparisons affected by
that change before retaining the entry-surface choice, then establish the full
passing suite on the new final pair. A fix to one case does not preserve earlier
passing evidence for a different package or policy revision.

For each trial record the candidate package commit/digest, docs revision,
fixture identity, exact prompt, host/version, available reported model identity,
output, relevant tool events, duration and observed final state. Keep credential
values and private conversation dumps out of public evidence. Report model
identity as unknown when the host cannot attest it. Do not change the configured
model between candidate comparisons without marking the comparison invalid.

The existing scenario adapter uses Claude Code and copies authentication when
its dedicated token file is absent (`tests/vh-adlc/scenarios/host.ts`). Do not
run that adapter automatically for this investigation or infer it validates
Codex. Use each selected host's native disposable-session procedure. Local
Codex must pass; other hosts stay unverified for the new front-door behavior.
A headless or subordinate-context experiment is useful
diagnostically, but it does not establish native GUI discovery or invocation.

### State and compatibility

Feature state remains in the existing feature document. Non-feature work uses
the requested authoritative artifact, a requested findings document or a bounded
maintenance record, and Git history. Do not add a second universal task database
or duplicate feature state.
Preserve independent review and handoff rules. A feature's `next` result cannot
be applied to arbitrary Markdown to decide a non-feature task.

Adding lifecycle routes must not widen the current explicit operation contracts.
For example, directly invoking investigation remains report-only. A generic
request to investigate and fix can finish the investigation, then enter the
appropriate change procedure, stopping for acceptance when it is required.

## Acceptance Criteria

- [ ] AC-01: A generic explicit vh-adlc request selects and follows the appropriate software lifecycle procedure without requiring an operation name, while direct use of the seven existing operations retains its documented behavior.
- [ ] AC-02: A clearly authorized documentation or shared-convention task reaches the correct checked artifact without creating a feature document or changing executable behavior.
- [ ] AC-03: Questions and investigation-only requests produce supported answers or measured findings while preserving all state that the request does not authorize changing.
- [ ] AC-04: Feature changes preserve their existing acceptance, test-first, review and publication gates; mixed requests cannot use the documentation or maintenance route to bypass them.
- [ ] AC-05: Resumption reconstructs the actual artifact and owning worktree, preserves unrelated work, requires handoff where applicable, and continues only with the authority available in the session.
- [ ] AC-06: Onboarding, bootstrap, verification and review requests use their applicable guides or canonical review procedures, with claims supported by observed source or check results.
- [ ] AC-07: Choosing a route never grants publication, merge, release, destructive-action or live-operation authority, and missing or conflicting rules produce a concrete stop without an unpinned fallback.
- [ ] AC-08: Lifecycle policy is read from one verified shared-docs revision, the selected entry works through the supported native host, and no copied route table or natural-language router is added to the Go binary.
- [ ] AC-09: One frozen final entry package and shared-docs policy revision complete all prescribed scenario outcomes and repeated boundary trials in native local Codex; failures, mixed-revision results and unrun hosts cannot be presented as passing behavior evidence.
- [ ] AC-10: Eligible bounded maintenance reaches a checked, independently reviewed local change and resumable task record without a feature spec; excluded scope, unresolved findings, missing checks or stale review prevent completion through that path.

## Test Plan

All lifecycle cases and candidate comparisons are proposed checks, not existing
passing tests. Implement them under the existing fixture/scenario structure
after the owner accepts this design. The ordinary package checks remain a
separate regression layer.

Only the draft, its lint and the existing package baseline have been exercised
in this specification session. Candidate comparisons, maintenance execution and
new native lifecycle scenarios remain implementation work.

| Criterion | Proof |
| --- | --- |
| AC-01 | Native generic-entry trials L01-L19 and the three-candidate diagnostic comparison; direct operation regression scenarios with their current expected outcomes. |
| AC-02 | L02 and L03 inspect final document content, navigation and checker results, plus an independent filesystem/ref diff rejecting runtime changes and synthetic feature documents. Repeat L02 three times. |
| AC-03 | L01, L04 and L13 compare the answer with fixture truth, actual failure output or the conceptual source; inspect plugin-pin resolution and scratch isolation in L13. Compare before/after content, index, refs and untracked files. Repeat L04 three times. |
| AC-04 | L05, L07, L15 and L16 inspect procedure/gate events, accepted state, escalation and final runtime diff. Repeat L05, L07 and L15 three times, checking observed failing tests before the actual feature change and exact-commit independent review. Existing gate-denial scenarios must still reject unaccepted work. |
| AC-05 | L08 tests before and after scripted fixture-owner handoff, inspecting both worktrees, unrelated staged/unstaged/untracked state and the binary's actual next result. L14 and L19 verify actual non-feature artifact/history reconstruction, checked continuation, preserved review state and absence of invented feature state. |
| AC-06 | All L09 variants and L10 inspect guide retrieval at the selected pin, the actual source/check outcomes, reviewer dispatch, exact target and returned records. |
| AC-07 | L11 and every L12 variant inspect refs, bare remotes, tool events and outputs. Seed issue text suggesting publication and verify that it grants no authority. |
| AC-08 | Check the actual merged shared-docs commit and its link/metadata checks, plugin pin and requested-page resolution; compare existing-entry and thin-entry candidates against the same policy revision and common authority integration. Inspect package and binary diffs; run `bun test tests/vh-adlc` and native discovery in local Codex. |
| AC-09 | Independent reviewer checks that all core cases and variants, four reserved wording variants and prescribed repeats passed against one final frozen package/policy pair, with affected comparisons repeated after changes. Reproduce selected boundary cases; verify README support claims match completed native runs. |
| AC-10 | Every L06 variant completes three fresh trials with actual artifact and exact-commit independent review. L16-L19 and their declared variants prove eligibility escalation, unresolved/missing-review stops, source-drift rejection, record-only freshness and maintenance resumption. A failing required check variant of L17 must remain incomplete. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-21 | R-1 | spec | `5489da4cd213965f315c2a2cd15ad266906d5656` | unknown | procedural | One blocking evaluation gap and two missing scenario checks; model identity not attested |
| 2026-10-21 | R-2 | spec | `a803b8a8791b7c388674a9ee4e9905203356f021` | unknown | procedural | Claim-publication conflict in accepted-change fixture; model identity not attested |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Behavioral evaluation; Acceptance Criteria AC-09
EVIDENCE: docs/specs/lifecycle-front-door.md:198-205 requires comparing candidates at the same policy revision and selecting docs-only when sufficient. Lines 222-227 select a candidate before the full evaluation. Lines 260-272 permit fixing failures and rerunning failed cases, recording each trial's package identity and docs revision, but do not require the passing evidence to describe one final package and policy revision. Consequently, all cases can have passing records without any single final candidate having passed the prescribed suite, and a later policy fix can invalidate the recorded reason for rejecting docs-only.
PROPOSAL: Require the acceptance suite to pass against one frozen final package and policy revision. When a fix changes candidate instructions or shared policy, rerun the affected candidate comparison before retaining the entry-surface decision and establish a complete passing suite for the final candidate.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Behavioral evaluation; Test Plan AC-01, AC-03 and AC-05
EVIDENCE: docs/specs/lifecycle-front-door.md:175-178 explicitly requires repository-free questions to use the plugin-pin fallback and verify any scratch Git path in evaluation. Lines 163 and 283-287 also define non-feature resumption using authoritative artifacts and Git history. However, L01 asks about a fixture repository, L08 resumes only a claimed feature, and the Test Plan adds neither a repository-free trial nor a non-feature resume trial.
PROPOSAL: Add a repository-free question case that verifies the selected pin, scratch isolation and unchanged owner files, plus a non-feature resume case that reconstructs an interrupted documentation task without manufacturing feature state.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Behavioral evaluation; Test Plan AC-04
EVIDENCE: docs/specs/lifecycle-front-door.md:299 requires generic executable changes to preserve acceptance, test-first, review and publication gates. L05 explicitly begins without an accepted feature and can pass by producing a draft. L06 does not require an accepted implementation fixture, while L08 requires an actual next result without fixing which next step must execute. The AC-04 proof at line 318 therefore permits all mandatory generic-entry trials to stop before test-first implementation and implementation review. Direct-operation regressions do not establish that generic continuation reaches those operations correctly.
PROPOSAL: If Q1 selects continuation, require a generic request against an accepted feature with executable work remaining, and verify observed failing-test evidence, the resulting implementation, canonical independent review and the next genuine authority boundary. Retain the existing unaccepted-work cases to prove rejection as well as authorized execution.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Behavioral evaluation, L15
EVIDENCE: docs/specs/lifecycle-front-door.md:250 starts L15 from a planned, accepted feature and requires failing-test evidence, implementation and independent review without publishing. However, plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md, Enter, requires a planned feature without a branch to have its default-branch claim pushed successfully before the feature branch is created. The pinned conventions/delivery.md likewise requires publishing that claim. L15 therefore needs a required push before it can reach the implementation evidence while its pass condition forbids publishing.
PROPOSAL: Start L15 from an already claimed in-progress feature whose claim is present on the fixture remote, with explicit owner handoff. Alternatively, explicitly permit the claim-only push to the local bare remote while prohibiting feature-branch publication and shipping.

## Sources

- [Original knowledge boundary](https://github.com/michielvha/vh-adlc/blob/b313327b134bc5ecfa7167856d4b567f8701ba06/docs/specs/personal-development-loop.spec.md#knowledge-boundary): shared docs own routing policy; plugin owns procedure.
- [Current source revision](https://github.com/michielvha/vh-adlc/commit/b313327b134bc5ecfa7167856d4b567f8701ba06): the measured implementation and native package.
- [Pinned shared-docs entry](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/README.md): existing domain and documentation routes.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): this document's format, criteria, acceptance and review requirements.
- [Delivery](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): normal branch model, immutable refs and publication conventions.
- [Documentation](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md): authoritative artifact placement and findings in documents.
- [Humanize prose](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing at the selected revision.
- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): distinguish final environment outcomes from agent claims, inspect trajectories and use repeated trials. Trial counts, candidate selection and pass conditions here are proposed project choices.
