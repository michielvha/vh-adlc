---
status: in-progress
status_description: "Accepted against R-5; implementing and testing locally on the owner-selected branch. No publication authorized."
issue: null
branch: feat/lifecycle-front-door
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
Those routes identify engineering references. They are not the framework intake,
dispatcher or task-state model. The owner clarified that separation when
accepting this work and authorizing testing on 2026-10-21.

Ran `bun test tests/vh-adlc` on the unchanged implementation. The sandboxed run
had 62 passes and two failures caused by network-dependent fixture setup and
release retrieval. The network-enabled rerun had 76 passes, zero failures and
279 assertions. This proves the existing package, installer and fixtures still
pass their checks. It supplies no new generic-routing behavior evidence.

### Hypotheses to test

1. A framework-owned intake procedure discoverable through the existing package entry is enough for generic invocation.
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
worktree was created or taken over. The initial exception covered specification. The owner then accepted the
clarified baseline and requested testing on this existing feature branch. The
local implementation claim stays here as a continuation of that instruction;
no default-branch claim or feature branch is pushed. This is a recorded
owner-directed branch exception, not the normal claim-publication procedure.

The owner subsequently selected these design decisions in session:

| Decision | Selected behavior |
| --- | --- |
| Continuation | Follow the chosen procedure through the authorized work, stopping at the next genuine owner decision. |
| Maintenance | Include a lighter maintenance path in this feature. |
| Maintenance boundary | Preserve the published contract; keep a short task record, run appropriate checks and use independent review. Escalate public-interface, permission, stored-data and release-policy changes. |
| Initial host | Prove native local Codex first. Other hosts remain unverified for the new front-door behavior. |
| Ownership boundary | Shared docs own pinned engineering conventions. vh-adlc owns lifecycle routing, procedures, maintenance records, dispatch and execution authority. No framework controller or state is added to the docs repo. |
| Start work | The owner accepted the design with that separation and requested testing on the existing feature branch. Keep evaluation and implementation local; no default-branch or feature publication is authorized by this request. |

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

No shared-docs change, new lifecycle guide or merged docs commit is a
prerequisite. Keep the existing engineering-knowledge pin. The framework's
lifecycle policy belongs in `plugins/vh-adlc/references/lifecycle.md`, with
maintenance execution and independent-review contracts beside it. Shared docs
remain independently usable by humans, other harnesses and ordinary repository
work. Their source-navigation tables are references, not vh-adlc dispatch rules.

The owner-authorized maintenance exception is defined by this framework. It
must be explicit in its authority reference and local task record. Repository
instructions that explicitly require a feature document for the proposed work
still win: route to that process or report the concrete conflict. Do not change
shared conventions or hide a conflict merely to make the maintenance path fit.

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

### Framework procedure and engineering knowledge

vh-adlc owns task classification, lifecycle artifacts, continuation, task-state
reconstruction, maintenance completion and dispatch. Put this procedure in
`references/lifecycle.md` inside the plugin package. The intake reads the
engineering conventions required for the chosen work at their verified pin.
No lifecycle dispatcher, maintenance state machine or framework dependency is
introduced into `vhco-pro/docs`.

| Requested outcome | Framework procedure and result |
| --- | --- |
| Explain, compare or advise | Read the needed sources and answer. Write no repository artifact unless requested. |
| Investigate a failure or question | Measure and produce the requested findings. Respect report-only and change-nothing constraints. |
| Update docs or a shared convention | Inspect evidence, edit the authoritative requested document or template, run its checks and report the diff. Do not manufacture a feature spec solely to hold prose. |
| Change executable behavior | Bounded maintenance follows the lighter procedure below. Broader feature changes preserve spec acceptance, test-first work, review and status gates. |
| Bootstrap or onboard | Read the relevant engineering guide and apply it within task authority; application creation still uses the feature procedure. |
| Verify or review | Run the requested checks or use the appropriate independent review procedure. |
| Resume | Reconstruct durable task state and ownership first. Features use `find`, freshness and `next`; non-feature work uses its artifact and history. |
| Ship or perform a live operation | Check explicit authority and the applicable procedure. Feature shipping is unchanged; unsupported non-feature publication or live operations report a concrete gap. |

Ordinary requested edits can finish locally. Publication remains a separate
action unless the owner's request explicitly includes it. The framework imports
engineering rules about coding, prose, interfaces, dependencies and delivery;
it does not copy them into its routing reference or make the docs repository
host its own runtime procedure.

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
   since the reviewed commit. Use Git to check that equality. Only append-only
   review records, observed evidence and completion bookkeeping are exempt
   from record freshness. Report the committed result and the separate
   publication boundary.

The requested outcome, preserved contract, affected scope, proposed change and
required checks form the maintenance task definition. A change to any of these
invalidates the review even when runtime source is unchanged. Reassess
eligibility, preserve the earlier review as history and obtain a new independent
review of the revised definition and implementation before completion. Adding
review evidence cannot silently alter the definition or remove a failed check.

Keep the maintenance reviewer contract in one shared package reference such as
`references/maintenance-review.md`; it can be loaded by a generic independent
context. Preserve the existing feature reviewer's two review kinds and the
binary's feature semantics. Reuse the common model-identity and procedural
isolation rules. No available independent reviewer means review pending, not
self-certified completion. Record staleness after a later source change and
require a new review before calling the task complete.

The framework reference owns these maintenance working rules and its reviewer
contract. Engineering standards remain in shared docs and are loaded as needed.
No new binary status or a claim of deterministic feature-gate enforcement is
introduced for maintenance records.

### Candidate entry surfaces

Compare these candidates before fixing the package surface:

| Candidate | Change | Question it tests |
| --- | --- | --- |
| Baseline | Current 0.2.0 package and its current docs pin | What does the installed design already do with short generic requests? |
| Existing entry | Framework lifecycle reference and common authority integration, retaining seven skills | Can the existing package entry follow the policy without an extra selection skill? |
| Thin entry | The same framework procedure, authority and fixture, plus one discoverable entry procedure | Does an explicit entry improve policy loading and execution? |

The generic task prompts are identical between candidates and do not name an
operation, expected route or required artifact. Candidate instructions must not
contain answers to the evaluation cases. Compare existing-entry and thin-entry
runs with identical framework procedure content, engineering-docs pin and
common authority integration so those changes cannot
be credited to a new skill. The current conversation is not an evaluation trial.

Keep the same engineering-docs pin in repository instructions and the
plugin fallback across candidates. Common integration includes the non-feature authority and
maintenance review procedure needed by both candidates. The comparison varies
only the additional entry surface and the discovery metadata it needs; neither
candidate receives extra task instructions or broader authority.

Choose the existing entry if it meets the same end-state and authority checks.
Otherwise choose a thin entry only when it passes and the existing-entry failure
is recorded.
If neither passes, revise the procedure and rerun; do not claim that adding a
skill solved the problem merely because it appears in a picker.

If a thin entry is selected, a proposed name is `vh-adlc-start`. Its instructions
load the canonical framework lifecycle reference instead of duplicating it. Keep
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
| L18 Maintenance drift | Modify an affected source path or the task definition after a clean maintenance review | The earlier review cannot complete the changed task; eligibility is reassessed for a changed definition, a new exact-commit review is required, and unrelated work stays intact. |
| L19 Maintenance resume | Resume an interrupted bounded maintenance task from its record, then a checked locally complete task | Existing scope, check evidence and review target reconstructed; unfinished authorized work proceeds, completed work does not repeat or publish. |

L06 uses separate bug, dependency and CI variants. L09 uses separate onboarding
and bootstrap variants. L12 uses separate unavailable-page, conflicting-pin and
unsupported-operation variants. These variants each need a recorded result;
the table is not permission to test only the easiest member of a case.
L16 likewise has separate public-contract, permissions, stored-data and
release-policy variants. L17 exercises both a returned defect and an unavailable
independent reviewer. L18 tests source drift, changes to the requested outcome,
contract, affected scope, proposed change or required checks, and append-only
review/evidence bookkeeping separately. Definition changes must invalidate
review; bookkeeping must preserve an otherwise current review.

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
one frozen framework procedure and one verified engineering-docs revision. Every prescribed case, variant and
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
- [ ] AC-08: Lifecycle orchestration and task procedure are owned by vh-adlc, engineering conventions are read at one verified docs pin, the selected entry works through the supported native host, and no framework controller is added to shared docs or natural-language router to the Go binary.
- [ ] AC-09: One frozen final entry package, framework procedure and engineering-docs revision complete all prescribed scenario outcomes and repeated boundary trials in native local Codex; failures, mixed-revision results and unrun hosts cannot be presented as passing behavior evidence.
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
| AC-08 | Verify framework-owned lifecycle/maintenance references and unchanged shared-docs pin; reject a dependency on a new shared-docs lifecycle guide. Compare existing-entry and thin-entry candidates with identical common framework references and engineering-docs pin. Inspect package and binary diffs; run `bun test tests/vh-adlc` and native discovery in local Codex. |
| AC-09 | Independent reviewer checks that all core cases and variants, four reserved wording variants and prescribed repeats passed against one final frozen package/policy pair, with affected comparisons repeated after changes. Reproduce selected boundary cases; verify README support claims match completed native runs. |
| AC-10 | Every L06 variant completes three fresh trials with actual artifact and exact-commit independent review. L16-L19 and their declared variants prove eligibility escalation, unresolved/missing-review stops, source and task-definition drift rejection, append-only review/evidence freshness and maintenance resumption. A failing required check variant of L17 must remain incomplete. |

## Tasks

- [x] T1 `tests/vh-adlc/lifecycle.test.ts` - observe failing fixture/grader tests for correct artifacts, forbidden mutations, state preservation and stable candidate identity before the helper exists (AC-01, AC-02, AC-03, AC-07, AC-09).
      Evidence: `bun test tests/vh-adlc/lifecycle.test.ts` on f001df1 plus the new test failed because `./lifecycle/fixtures` does not exist; actual artifact/mutation graders are specified before implementation.
- [x] T2 `tests/vh-adlc/lifecycle/fixtures.ts` - implement isolated task fixtures, snapshots, candidate fingerprints and outcome graders; T1 passes on real filesystem and Git state (AC-01, AC-02, AC-03, AC-07, AC-09).
      Evidence: `bun test tests/vh-adlc` passed 85 tests and 292 assertions after fixture/grader implementation. The unauthorized-tag negative test was observed failing before its ref filter was corrected; all nine outcome tests now pass. This is grading infrastructure, not lifecycle behavior completion.
- [x] T3 `tests/vh-adlc/lifecycle/run.ts`, `tests/vh-adlc/lifecycle/fixtures.ts`, `tests/vh-adlc/evidence/lifecycle/` - run the four generic requests against the unchanged baseline, retaining actual outcomes and establishing any expected behavior failures before changing the procedure (AC-01, AC-02, AC-03, AC-04, AC-09).
      Evidence: native Codex CLI baseline diagnostics passed L01/L02/L04/L05; the L06 maintenance pilot repaired behavior but failed the task-record outcome and hit a sandbox Git limitation. `tests/vh-adlc/evidence/lifecycle/initial-baseline.json` preserves those results. Comparison reruns use normal automatic approval review and do not mix this first setup into final proof.
- [x] T9 `tests/vh-adlc/lifecycle.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts` - accept an observed test failure followed by successful inspection in one shell call, while rejecting source-only inspection as execution evidence (AC-03, AC-09).
      Evidence: the new combined-command test failed with the old exit-code-only grader; after inspecting the actual baseline transcript and correcting the oracle, all 13 grader tests and 21 assertions pass. The final frozen suite will use one grader revision; earlier raw trials remain available for regrading.
- [x] T10 `tests/vh-adlc/lifecycle.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts` - reject maintenance completion inferred solely from repaired artifacts and a claimed independent review (AC-09, AC-10).
      Evidence: the new negative test failed because the old grader accepted a review claim without independent dispatch evidence. The corrected diagnostic grader leaves that check explicitly unverified; all 14 outcome tests and 22 assertions pass. This adapter cannot yet establish a complete L06 result.
- [x] T4 `plugins/vh-adlc/references/lifecycle.md`, `plugins/vh-adlc/references/maintenance-review.md`, `plugins/vh-adlc/references/maintenance-record.md`, `plugins/vh-adlc/references/authority.md`, seven existing skills and both plugin manifests - add framework-owned intake and bounded-maintenance procedure plus independent review and record contracts; common-integration trials prove that no new shared-docs controller or pin is required (AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-10).
      Evidence: baseline L06 repaired behavior without the required task record; common-integration L06 created the framework record while preserving the contract and unrelated state. All four common-entry core diagnostics pass. `bun test tests/vh-adlc` passed 89 tests and 301 assertions before the additional T10 grader check. The docs pin and Go binary are unchanged. Independent maintenance review and the full lifecycle matrix remain unverified, so no acceptance criterion is ticked.
- [x] T5 `tests/vh-adlc/lifecycle/run.ts`, `tests/vh-adlc/lifecycle/regrade.ts`, `tests/vh-adlc/evidence/lifecycle/` - compare existing entry and a scratch thin-entry candidate against identical framework references and engineering pin; record all twelve diagnostic trials and select only a candidate whose actual outcomes pass (AC-01, AC-08, AC-09).
      Evidence: all twelve core diagnostic trials pass under one corrected grader; `comparison.json` retains original and regraded status, package/grader identities and actual artifact checks. The four baseline cases also pass, so no baseline routing defect is claimed. Keep seven skills for continued evaluation because the extra skill showed no benefit. All three maintenance pilots remain incomplete: baseline lacks a record, common-entry review independence is unverified, and thin-entry reviewer startup failed. No final acceptance or desktop support is inferred.
- [x] T6 seven existing skills, plugin manifests, marketplace metadata and `README.md` - commit the selected entry after its diagnostic failure/passing evidence, update exact package inventory and version metadata, and preserve all seven direct operation contracts (AC-01, AC-08).
      Evidence: the selected common entry and matching 0.3.0 manifests are committed in 916ce7d; no eighth production skill exists. Existing inventory, metadata and direct-operation structural checks pass. README now separates framework procedure from pinned engineering conventions and marks new-host behavior unverified. Full direct-operation behavior regression remains T7 work; structural checks do not establish AC-01.
- [x] T11 `tests/vh-adlc/lifecycle/run.ts`, `tests/vh-adlc/evidence/lifecycle/reviewer-transport.json`, evidence README and root README - retain native session files inside the disposable profile and test whether an independent maintenance reviewer can start and return (AC-09, AC-10).
      Evidence: the ephemeral thin-entry pilot failed reviewer startup because the parent rollout was unavailable. With the same package and retained sessions, the new pilot's native logs identify a separate reviewer linked to its parent, observed baseline failure and repaired checks, and `MODEL: unknown` / `NO FINDINGS` returned and stored verbatim. Source and Definition freshness checks pass. The automated grader deliberately still fails its unimplemented receipt check; this is a manually audited transport pilot, not final L06 or feature acceptance.
- [x] T12 `tests/vh-adlc/native-review.test.ts`, `tests/vh-adlc/lifecycle/native-review.ts`, fixture/runner/regrader integration and `tests/vh-adlc/evidence/lifecycle/verified-review-pilot.json` - validate native independent-review receipts, reject inherited session/tool evidence and stale source or Definition, and support fresh repeated trials without overwriting evidence (AC-09, AC-10).
      Evidence: the receipt tests first failed because the adapter did not exist. Negative inherited-session and inherited-tool tests were observed failing before their filters were corrected. All 23 receipt/outcome tests and 36 assertions pass. Regrading the unchanged retained-session pilot now passes with a distinct linked native reviewer, exact target and verbatim clean return; earlier original results remain untouched. This is one CLI bug-fix pilot, not final matrix acceptance.
- [x] T13 `tests/vh-adlc/lifecycle-boundaries.test.ts`, fixtures and runner - add actual shared-convention, mixed-scope and all four maintenance-exclusion fixtures with artifact and mutation graders (AC-02, AC-04, AC-07, AC-08, AC-09, AC-10).
      Evidence: the convention and four maintenance-claim negative tests failed before their graders existed. After implementation, all 29 boundary/receipt/outcome tests and 54 assertions pass. The convention requires actual guide/template/navigation/checker evidence and rejects a framework task store; excluded maintenance permits only a feature draft or focused decision, with runtime and unrelated state preserved. Native behavior trials remain T7 work.
- [x] T14 `tests/vh-adlc/maintenance-variants.test.ts`, fixture/runner/regrader integration and boundary tests - add compatible dependency and CI maintenance fixtures, meaningful baseline/contract checks and all three unrelated Git states (AC-03, AC-05, AC-07, AC-09, AC-10).
      Evidence: dependency and CI completion-claim tests failed before the variant graders existed; the fixture-state test exposed the missing tracked unstaged edit. All 32 outcome/receipt/boundary/maintenance tests and 64 assertions now pass. Dependency validation checks the actual local package, lockfile and preserved API; CI validation rejects increased permissions and restores the documented command. Every new Git fixture contains unrelated staged, tracked unstaged and untracked work. Native repeated variant runs remain T7 work.
- [x] T15 `plugins/vh-adlc/references/lifecycle.md` - continue authorized feature drafting after a maintenance exclusion instead of only announcing the required route (AC-01, AC-04, AC-09, AC-10).
      Evidence: native L16-permissions, L16-data and L16-release trials on package digest 7b6f5902 preserved executable state but failed the required draft-or-focused-decision outcome. The procedure now explicitly continues the spec operation and distinguishes drafting authority from acceptance to implement. Affected candidate comparisons and final-package trials must be rerun; these failures are retained and no criterion is ticked.
- [x] T16 native reviewer adapter and tests - resolve an inspected unambiguous short Git hash to the exact stored review commit, preserving rejection of absent or wrong targets (AC-09, AC-10).
      Evidence: a real reviewer inspected the correct commit using its seven-character abbreviation; the full-hash-only grader rejected it. The new abbreviation test was observed failing before resolution was added. All ten receipt tests and 15 assertions pass, and the unchanged first repeated maintenance fixture passes regrading without editing its original result.
- [x] T17 context fixtures and tests - cover unavailable sources, conflicting pins, unsupported live procedures, repository-free questions and documentation resumption (AC-02, AC-03, AC-05, AC-07, AC-09).
      Evidence: five new context tests failed before the fixtures and graders existed. The adapter now requires actual source-gap or plugin-pin evidence, protects a non-Git owner directory from initialization/onboarding, and checks real documentation correction plus task/history reconstruction. Nine context tests pass. These are evaluator checks; native case outcomes remain T7 work.
- [x] T18 native reviewer adapter and tests - distinguish the stored model ID from a parenthetical attestation note without accepting a different returned identity (AC-09, AC-10).
      Evidence: a real record stored unknown followed by an attestation note, which the original literal-field comparison rejected. The new test failed before parsing was corrected; all eleven receipt tests and 17 assertions pass. Regrading the unchanged twelve repeated core trials and three dependency trials now passes. Original failing grader results remain intact, and those earlier package runs remain diagnostic.
- [x] T19 native adapter, fixture setup and grader tests - accept valid conventional branch names, observed brace-expanded contract reads and concrete procedure-gap wording; isolate Bun setup in owned temporary directories (AC-07, AC-09, AC-10).
      Evidence: native CI repair used a valid ci/ branch and read the contract through shell brace expansion; the live-operation response reported that neither procedure nor target was supplied. Three corresponding tests failed before their adapters were corrected. All 24 receipt/context/maintenance tests and 43 assertions pass. Regrading the unchanged completed fixtures passes those outcomes. An intermittent sandbox temp-directory error is avoided by fixture-owned Bun temp/cache paths, without changing user settings or access policy.
- [x] T20 feature fixture builder, outcome integration and feature lifecycle tests - seed an accepted, remotely claimed feature and test writer handoff and binary next-step reconstruction (AC-04, AC-05, AC-09).
      Evidence: four tests failed before the feature fixtures existed. A real binary check exposed the missing origin/HEAD; its regression test failed before fixture setup was corrected. All four feature tests and ten assertions pass. Against a new fixture, the verified binary returned gate in-progress pass and next implement with the claim present on the local bare remote. Native handoff trials remain T7 work. L15 has a seeded fixture and negative oracle only; its feature-review receipt adapter is still pending and cannot pass from a claim.
- [x] T21 reserved wording manifest, scenario planner, runner and tests - reserve four prompts and their expected outcomes before final instruction freeze; execute supported single-turn variants without losing fixture identity, and reject unsupported multi-turn or invalid selections before starting an agent (AC-01, AC-04, AC-07, AC-09).
      Evidence: the planner test failed because the module did not exist. Both planner tests and seven assertions now pass. The four expected outcomes are fixed in reserved-wording.json; R04 remains explicitly unsupported until the multi-turn adapter exists. Current packages are provisional evaluation candidates, not a final acceptance freeze. No reserved outcome is claimed from unit tests.
- [x] T22 `tests/vh-adlc/lifecycle/`, `tests/vh-adlc/scenario-plan.test.ts`, `tests/vh-adlc/evidence/lifecycle/continued-evaluation.json` - execute the reserved two-turn scope-change case through one retained native thread and preserve independently regradable checkpoints (AC-04, AC-07, AC-09).
      Evidence: the planner initially rejected R04 as unsupported. After adding native session resumption and phase checkpoints, all 14 targeted planner/boundary/feature tests passed. The native R04 trial corrected the README in its first turn and escalated the later permission change in the same thread; the workflow and unrelated state stayed unchanged. Regrading the saved checkpoint and final fixture passed. The continued-evaluation report preserves 39 passing diagnostics across their actual package identities; these are not a final same-package acceptance suite.
- [x] T23 `tests/vh-adlc/feature-native-review.test.ts`, `tests/vh-adlc/lifecycle/{fixtures,native-review,run,regrade}.ts` - validate canonical feature-review receipts and permit only local movement of the claimed fixture branch (AC-04, AC-05, AC-09).
      Evidence: the new tests failed on the missing verifyFeatureReview export. All 15 feature/maintenance receipt tests then passed, followed by 131 package regression tests and 393 assertions. The adapter rejects changed source or accepted criteria, inherited contract inspection, substituted returns, reversed failure/pass evidence and fixture-branch publication. It accepts the next shipping boundary without requiring an extra complete status change, matching L15's accepted outcome. Native execution remains T7 evidence.
- [x] T24 `tests/vh-adlc/domain-lifecycle.test.ts`, `tests/vh-adlc/lifecycle/{fixtures,feature-fixture,run,regrade}.ts` - seed onboarding, unaccepted Go bootstrap and committed feature verification, with artifact and canonical review checks (AC-01, AC-04, AC-06, AC-09).
      Evidence: all three domain tests initially failed because their fixtures were unsupported. Nine domain/feature-receipt/planner tests and 27 assertions then passed. Onboarding must preserve the local instruction and produce pinned bridges with observed checks. Bootstrap must inspect the actual guide and personal template before drafting; unaccepted Go source creation fails. Feature verification needs observed checks and a native canonical reviewer receipt. Native outcomes remain T7 work.
- [x] T25 `tests/vh-adlc/{feature-native-review,lifecycle}.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts`, `tests/vh-adlc/evidence/lifecycle/accepted-feature-pilot.json` - accept observed Bash xtrace checks and a local maintenance branch without weakening publication checks (AC-04, AC-07, AC-09).
      Evidence: the native feature trial used bash -x test.sh and the maintenance trial used maintenance/restore-greet-name; both were rejected by overly narrow grader patterns. Each new regression failed before the correction. All 19 focused tests and 33 assertions pass. Regrading the unchanged accepted-feature pilot now passes, including its canonical linked reviewer receipt and next shipping boundary. Original results are retained; no production package instruction changed.
- [x] T26 `tests/vh-adlc/domain-lifecycle.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts` - permit one local onboarding branch while continuing to reject its publication (AC-06, AC-07, AC-09).
      Evidence: the native onboarding trial changed only its pinned entry points on docs/onboard-personal-conventions and preserved origin. The added local-branch assertion failed before the correction; all three domain tests and twelve assertions then passed, including the forbidden push check. This corrects an evaluator restriction absent from the accepted onboarding outcome; production instructions are unchanged.
- [x] T27 `tests/vh-adlc/maintenance-resume.test.ts`, `tests/vh-adlc/lifecycle/{maintenance-fixture,fixtures,run,regrade}.ts` - seed maintenance findings, missing reviewers, each Definition/source drift and fresh completion/resumption (AC-05, AC-07, AC-09, AC-10).
      Evidence: all fourteen tests failed before their fixtures existed, then passed with seventeen assertions. Historical reviews are explicitly seeded fixture prerequisites, never native-review proof; changed tasks require a fresh linked reviewer receipt. The unavailable-review trial disables the native multi_agent feature only for its disposable process and forbids launching a replacement host. Fresh bookkeeping and complete-task checks preserve runtime source and inspect actual history. Native outcomes remain T7 work.
- [x] T28 `tests/vh-adlc/lifecycle.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts`, `tests/vh-adlc/evidence/lifecycle/domain-routing.json` - grade completed GitHub connector source reads and task-owned local branches without treating failed reads or publication as success (AC-06, AC-07, AC-09).
      Evidence: native bootstrap inspected exact-commit template files through github.fetch; the shell-only adapter missed that evidence. A separate maintenance trial used maintenance-greet-name, which had no prohibited ref changes. Both new regressions failed before correction. Twenty focused tests and 41 assertions then passed. Regrading the unchanged three domain trials now passes. Existing task branches are preserved and only one local task branch may move or be created; origin changes remain forbidden.
- [x] T29 `tests/vh-adlc/delivery-lifecycle.test.ts`, `tests/vh-adlc/lifecycle/{delivery-fixture,fixtures,scenario-plan,run,regrade}.ts` - distinguish completed-work continuation from a later explicit ship request in the same native thread (AC-05, AC-07, AC-09).
      Evidence: all three delivery tests failed on unsupported fixtures/planning before implementation. Six delivery/planner tests and seventeen assertions then passed. The first phase must observe next none and preserve publication state. The second phase permits only the fixture branch's local-bare delivery, requires existing shipping preflight and observed checks, and reports the missing GitHub PR/issue destination. Tags, unrelated refs and real destinations remain forbidden. Complete phase artifacts and execution results are independently regradable. Seeded historical feature review is fixture setup, not new independent-review proof.
- [x] T30 `tests/vh-adlc/native-review.test.ts`, `tests/vh-adlc/lifecycle/native-review.ts`, `tests/vh-adlc/evidence/lifecycle/{accepted-feature-repeats,delivery-boundary}.json` - accept outer blank lines around exact returned review records while preserving their internal content and identity (AC-04, AC-09).
      Evidence: the third native feature repetition returned a blank line after MODEL: unknown; its own canonical contract read, target inspection and checks were present, but the literal header/body join rejected it. The new regression failed before parsing was corrected. All seventeen receipt tests and 29 assertions pass. All three unchanged accepted-feature repetitions pass regrading, as does the saved two-turn delivery checkpoint. Original results remain intact; no production procedure changed.
- [x] T31 `tests/vh-adlc/native-review.test.ts`, `tests/vh-adlc/lifecycle/native-review.ts` - verify an explicitly associated maintenance review target/model outside its subsection without replacing native dispatch or freshness proof (AC-09, AC-10).
      Evidence: the contract-drift trial recorded R-2's exact target and model in Evidence and its bare NO FINDINGS return under Reviews. The heading-only parser incorrectly selected historical R-1. The new positive assertion failed before parsing was corrected; a mismatched review ID still fails. All fourteen receipt tests and 22 assertions pass. The unchanged source/outcome/contract drift trials now pass regrading with fresh linked R-2 receipts. No record or production procedure was edited to make them pass.
- [x] T32 `tests/vh-adlc/{lifecycle-suite,direct-operation-compatibility}.test.ts`, `tests/vh-adlc/lifecycle/suite.ts` - reject incomplete or mixed-package CLI matrices and preserve all seven original direct-operation bodies (AC-01, AC-09).
      Evidence: the suite tests failed on the missing evaluator module before implementation. Nine focused tests and 26 assertions then passed. Coverage requires every accepted variant, fresh repetitions, both same-thread phases where required, one package/pin/host and passing artifact checks. It rejects mixed identities, duplicate evidence and missing cases. All seven direct-operation bodies are byte-identical to the measured baseline after their generic-intake entry; these preservation checks already passed because those bodies were intentionally unchanged, so no artificial failing implementation was introduced. CLI coverage never asserts desktop or feature completion.
- [ ] T7 `tests/vh-adlc/lifecycle/`, `tests/vh-adlc/evidence/lifecycle/`, `README.md` - execute and grade L01-L19 variants, reserved wording variants and required repetitions against one frozen candidate; record native local Codex proof and keep unrun hosts unverified (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10).
      Evidence: partial diagnostics only, documented in `tests/vh-adlc/evidence/lifecycle/README.md`. Desktop testing is blocked by Computer Use refusing access to `com.openai.codex` for safety reasons. No alternate UI route was attempted. Do not infer native desktop support from CLI results or complete this feature before the full matrix and review pass.
- [ ] T8 `tests/vh-adlc/evidence/lifecycle/`, `docs/specs/lifecycle-front-door.md` - observe required regressions and independent exact-commit implementation review, resolve findings in scope, and complete only after the real completion gate passes (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10).

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-21 | R-1 | spec | `5489da4cd213965f315c2a2cd15ad266906d5656` | unknown | procedural | One blocking evaluation gap and two missing scenario checks; model identity not attested |
| 2026-10-21 | R-2 | spec | `a803b8a8791b7c388674a9ee4e9905203356f021` | unknown | procedural | Claim-publication conflict in accepted-change fixture; model identity not attested |
| 2026-10-21 | R-3 | spec | `8890a6a10cf2de980b711728dc61ee6ebf017ad0` | unknown | procedural | Maintenance-record scope changes must invalidate review; model identity not attested |
| 2026-10-21 | R-4 | spec | `ef66f34fbfe3dd80a19d76059c4219e4f9d6ffea` | unknown | procedural | NO FINDINGS; model identity not attested |
| 2026-10-21 | R-5 | spec | `d9c9482aeb373aab3ebdfc1832cb8010c0bfe8b2` | unknown | procedural | NO FINDINGS; docs/framework separation verified; model identity not attested |
| 2026-10-21 | R-5 | spec | `d9c9482aeb373aab3ebdfc1832cb8010c0bfe8b2` | n/a | n/a | accepted by owner |

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

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Bounded maintenance; Behavioral evaluation L18
EVIDENCE: docs/specs/lifecycle-front-door.md:228-232 places the requested outcome, preserved contract, affected paths, proposed change and checks in the maintenance record. Lines 245-260 require source equality with the reviewed commit but permit editing the review record. Lines 350-352 require a record-only update to preserve review freshness without distinguishing review-evidence updates from changes to the task definition. The design therefore does not explicitly invalidate review when its scope or required checks change while source files remain unchanged.
PROPOSAL: Limit the freshness exception to appending review records, observed evidence and completion bookkeeping. Require renewed eligibility assessment and independent review when the requested outcome, preserved contract, affected scope or required checks change, and add an L18 variant proving that distinction.

### R-4

NO FINDINGS

### R-5

NO FINDINGS

## Sources

- [Original knowledge boundary](https://github.com/michielvha/vh-adlc/blob/b313327b134bc5ecfa7167856d4b567f8701ba06/docs/specs/personal-development-loop.spec.md#knowledge-boundary): the historical design delegates source navigation to shared docs; this feature keeps lifecycle orchestration in vh-adlc per the owner's clarification.
- [Current source revision](https://github.com/michielvha/vh-adlc/commit/b313327b134bc5ecfa7167856d4b567f8701ba06): the measured implementation and native package.
- [Pinned shared-docs entry](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/README.md): existing domain and documentation routes.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): this document's format, criteria, acceptance and review requirements.
- [Delivery](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): normal branch model, immutable refs and publication conventions.
- [Documentation](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md): authoritative artifact placement and findings in documents.
- [Humanize prose](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing at the selected revision.
- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): distinguish final environment outcomes from agent claims, inspect trajectories and use repeated trials. Trial counts, candidate selection and pass conditions here are proposed project choices.
