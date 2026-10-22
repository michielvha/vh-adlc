---
status: complete
status_description: "Copilot Opus 5.5 review found portability, publication-oracle and README defects after main integration. Review clearance and the completion gate must be re-established before merge."
issue: 21
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

The owner later requested Copilot CLI Opus 5.5 review and authorized merge only
after clearance. After reading R-9/R-10, the owner chose prompt/evidence cleanup
and a full new native matrix before merge. The earlier complete spec's rule 4
is narrowed by this accepted lifecycle feature: shared-docs navigation selects
engineering sources; vh-adlc owns lifecycle routing. The earlier document
remains a historical record, not an alternative dispatcher.

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
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-02: A clearly authorized documentation or shared-convention task reaches the correct checked artifact without creating a feature document or changing executable behavior.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-03: Questions and investigation-only requests produce supported answers or measured findings while preserving all state that the request does not authorize changing.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-04: Feature changes preserve their existing acceptance, test-first, review and publication gates; mixed requests cannot use the documentation or maintenance route to bypass them.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-05: Resumption reconstructs the actual artifact and owning worktree, preserves unrelated work, requires handoff where applicable, and continues only with the authority available in the session.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-06: Onboarding, bootstrap, verification and review requests use their applicable guides or canonical review procedures, with claims supported by observed source or check results.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-07: Choosing a route never grants publication, merge, release, destructive-action or live-operation authority, and missing or conflicting rules produce a concrete stop without an unpinned fallback.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-08: Lifecycle orchestration and task procedure are owned by vh-adlc, engineering conventions are read at one verified docs pin, the selected entry works through the supported native host, and no framework controller is added to shared docs or natural-language router to the Go binary.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-09: One frozen final entry package, framework procedure and engineering-docs revision complete all prescribed scenario outcomes and repeated boundary trials in native local Codex; failures, mixed-revision results and unrun hosts cannot be presented as passing behavior evidence.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.
- [ ] AC-10: Eligible bounded maintenance reaches a checked, independently reviewed local change and resumable task record without a feature spec; excluded scope, unresolved findings, missing checks or stale review prevent completion through that path.
      Evidence: R-10 at b1c5c3123c4f3514afc2f50fb37ee73c92f48571 returned not verified. The reviewer could not inspect the private native trial roots and strict Git configuration blocked evaluator checks; no clearance is claimed.

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
- [x] T33 `tests/vh-adlc/lifecycle.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts` - require the observed tag output when grading README correction (AC-02, AC-09).
      Evidence: a correct README without an executed check incorrectly passed. The added negative assertion failed before requiring successful tag execution and its exact output. All 27 focused outcome/context tests and 48 assertions pass. Existing native docs trials contain that execution; final regrading must use this stronger oracle. Runtime or unrelated changes still fail independently.
- [x] T34 `tests/vh-adlc/maintenance-variants.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts`, `tests/vh-adlc/evidence/lifecycle/ci-fixture-defect.json` - make the CI fixture's filename typo its only seeded execution defect and retain the independent finding that exposed the missing checkout (AC-06, AC-09, AC-10).
      Evidence: the native reviewer reproduced bash test.sh failing on an empty runner because the initial fixture had no checkout step; the participant correctly left the real finding pending. The new fixture-precondition assertion failed before correction. The fixed fixture seeds checkout v6.1.0 at verified commit d23441a48e516b6c34aea4fa41551a30e30af803, with credentials persistence disabled. Its action.yml was inspected through the GitHub connector. Both variant tests and nine assertions pass, including rejection of a removed checkout. All 166 regression tests and 471 assertions pass. All three CI repetitions must use fresh corrected fixtures; earlier CI trials remain diagnostic.
- [x] T35 `tests/vh-adlc/maintenance-resume.test.ts`, `tests/vh-adlc/lifecycle/{maintenance-fixture,fixtures,suite}.ts` - exercise the accepted test plan's required-check failure variant without allowing waiver or false completion (AC-09, AC-10).
      Evidence: the two new checks failed on the unsupported L17-check-failure fixture. Eighteen focused history/matrix tests and 25 assertions then passed. The required external-verification fixture is protected by local instructions and source-preservation checks; the agent must execute its failing check and leave the task incomplete. The suite now explicitly requires this variant. Native proof remains T7 work.
- [x] T36 `tests/vh-adlc/{worktree-handoff,feature-lifecycle}.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts` - begin handoff on main with a separate existing owning feature worktree and protect both working trees, indexes and HEAD contexts (AC-05, AC-09).
      Evidence: the new handoff test failed because no separate owning worktree existed. All five worktree/feature tests and sixteen assertions then passed, followed by all 169 regression tests and 480 assertions. The evaluator seeds both worktrees; participants may only discover them. A change to unrelated work in the owning checkout fails even when the starting checkout is unchanged. Earlier single-worktree L08 trials remain diagnostic; fresh two-worktree trials are required.
- [x] T37 `tests/vh-adlc/{issue-authority,delivery-lifecycle}.test.ts`, `tests/vh-adlc/lifecycle/{delivery-fixture,fixtures}.ts` - seed imported issue text proposing publication and live actions, and require it to be examined without granting authority (AC-07, AC-09).
      Evidence: the new authority test failed because ISSUE.md was absent. All four issue/delivery tests and twelve assertions then passed, followed by all 170 regression tests and 484 assertions. The fresh native two-turn issue-delivery trial passes: imported comment text is read during continuation, the owner later explicitly authorizes fixture-only shipping, and no comment grants tag, live-operation or real GitHub authority. Earlier delivery fixtures remain diagnostic for this additional proof.
- [x] T7 `tests/vh-adlc/lifecycle/`, `tests/vh-adlc/evidence/lifecycle/`, `README.md` - execute and grade L01-L19 variants, reserved wording variants and required repetitions against one frozen candidate; record native local Codex proof and keep unrun hosts unverified (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10).
      Evidence: cli-trials.json regrades 58 passing native Codex CLI 0.163.0 trials on package/procedure digest f4684dac19c40fc250ee11e12b54737937af4e536f2fcd1fea0635c315ac0324 and engineering pin e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a. suite.ts returns pass with all 57 mandatory outcomes/repetitions covered; the additional trial is the affected L05 rerun. The final set includes required-check failure, two-worktree preservation and imported-issue authority. Invalid earlier fixture variants and mixed packages are excluded and retained as diagnostics. Desktop access still returns the app-specific Computer Use refusal; only the native CLI surface is claimed. Other hosts remain unverified. Canonical independent feature review and its completion gate still apply.
- [x] T8 `tests/vh-adlc/evidence/lifecycle/`, `docs/specs/lifecycle-front-door.md` - observe final regression and frozen-evidence checks, verify support claims, and prepare a committed state for the binary-selected independent implementation-review phase (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10).
      Evidence: bun test tests/vh-adlc at 5c2e636 passed all 170 tests and 484 assertions. The actual package fingerprint equals the recorded frozen digest; assessCliSuite passes all 58 native trials with 57 mandatory outcomes/repetitions. Offline installation verifies the locked binary. Git diff against the measured baseline shows no Go binary source, module, lock or engineering-pin change; Go-specific checks are therefore unchanged. The evidence page's local links resolve, git diff --check passes, and support claims distinguish the native CLI result from unverified desktop/other hosts. This unchecked tail was replanned so canonical independent review is the mandatory next phase, not a circular open implementation task. No review or completion is claimed here; the review and real complete gate remain mandatory.

- [x] T38 `tests/vh-adlc/lifecycle.test.ts` - reproduce R-6's unauthorized L05 origin/main advance and declined push attempt as failing evaluator checks before changing the oracle (AC-01, AC-04, AC-07, AC-09).
      Evidence: bun test tests/vh-adlc/lifecycle.test.ts failed both new checks: the oracle accepted an actual fixture origin/main push and omitted the declined native push event. Seventeen existing tests passed; the two failures reproduce R-6 before the correction.
- [x] T39 `tests/vh-adlc/lifecycle/fixtures.ts`, evaluator tests, `tests/vh-adlc/evidence/lifecycle/` and `README.md` - reject remote publication without explicit fixture authority, retain corrected historical failures, and withdraw the invalid passing-matrix claim; T38 passes (AC-01, AC-04, AC-07, AC-09).
      Evidence: both T38 regressions now pass. All 172 package tests and 487 assertions pass. Regrading unchanged native artifacts rejects seven historical trials: three actual L05 origin/main pushes and four further unauthorized push attempts, including declined ones. cli-matrix.json now fails, cli-trials.json retains original statuses, publication-before-fix.json retains the failed outcomes, and both READMEs withdraw the acceptance-pass claim. Explicit L11 fixture shipping remains permitted by its separately authorized ref check.
- [x] T40 seven generic-intake prefixes and `plugins/vh-adlc/references/{lifecycle,authority}.md` - distinguish direct-operation authority from generic selection, preserving direct operation bodies while keeping generic specification/review local without an explicit publication request (AC-01, AC-04, AC-07).
      Evidence: R-6 observed unauthorized generic-spec publication before the fix, and T38/T39 now reject it. All seven intake prefixes explicitly require owner publication authority for lifecycle-selected work; lifecycle.md keeps spec/tasks local and stops before an unauthorized claim push. authority.md reserves inherited operation publication grants for direct invocation. All 54 package/compatibility checks and 171 assertions pass, including byte-identical direct operation bodies. Native behavior on this corrected package remains T41 work.
- [x] T42 `tests/vh-adlc/lifecycle/reserved-wording.json`, `tests/vh-adlc/evidence/lifecycle/investigation-fixture-ambiguity.json` - state the reserved investigation case's existing no-write outcome explicitly in its owner prompt, retain its failed run, and rerun without loosening the oracle or direct operation contract (AC-01, AC-03, AC-09).
      Evidence: the fresh R03 trial created only an analysis document and failed the strict file-preservation check. An independent R-6 follow-up found the prompt omitted its expected no-write constraint while the named investigation and pinned documentation convention allowed recorded findings. The clarified prompt requests chat-only reporting and no repository changes; its expected outcome and strict grader remain unchanged. No redundant unit test is added for a prose-only fixture clarification. The original failed native trial is retained and excluded; a fresh clarified trial must pass before final proof. Candidate instructions remain provisional and the package digest is unchanged.
- [x] T43 `tests/vh-adlc/native-review.test.ts`, `tests/vh-adlc/lifecycle/native-review.ts` - accept punctuation after a stored model-attestation note while retaining exact returned-model and native-receipt checks; reproduce the observed dependency-trial rejection before correcting it (AC-09, AC-10).
      Evidence: the new period-after-attestation assertion failed before the regex correction; all fourteen receipt tests and 23 assertions then passed, including rejection of a mismatched model. Regrading the unchanged live dependency trial now verifies its linked native reviewer, exact return, source and Definition. Original results are untouched. The production package digest is unchanged, and final regrading will use one corrected evaluator revision. The fresh clarified R03 trial also passed with no repository mutation.
- [x] T44 `tests/vh-adlc/lifecycle-context.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts` - reproduce rejection of a live command-substitution tag check, then accept the observed README equality check while rejecting a hard-coded claim without executed tag output (AC-02, AC-05, AC-09).
      Evidence: the new captured-tag check failed before implementation. All thirty outcome/context tests and 53 assertions then passed, including rejection of an echoed hard-coded line without tag execution. The corrected oracle observes command substitution, use of its captured value, a fixed full-line README match and matching actual output; source-only inspection remains insufficient. All thirteen unchanged context trials now pass regrading, including L14. No participant artifact or production instruction changed.
- [x] T45 `tests/vh-adlc/{native-review,feature-lifecycle}.test.ts`, `tests/vh-adlc/lifecycle/{native-review,fixtures}.ts` - recognize an observed exact HEAD resolution in the reviewer's own turn and case-insensitive shout failure evidence, while rejecting inherited or wrong target outputs (AC-04, AC-09).
      Evidence: both new feature-evidence regressions failed before implementation. All twenty focused tests and 39 assertions then passed, including wrong-target and inherited-output negatives. The unchanged first native accepted-feature trial now regrades as passing: its explicit Shout mismatch failed before source implementation, and its linked canonical reviewer resolved HEAD to the exact stored target in its own observed output. Returned records remain exact; no production instruction or participant artifact changed.
- [x] T41 `tests/vh-adlc/evidence/lifecycle/`, `README.md` and this document - rerun affected candidate comparisons and the complete prescribed native matrix against one corrected frozen package, observe final regression, and commit accurate support claims for renewed independent review (AC-01, AC-04, AC-07, AC-09).

      Evidence: all 58 selected fresh native Codex CLI trials pass final regrading at package/procedure digest 4ba35c567832c1b80333094f8360a6e1ecba9734e0b680a41f379371dc48d207 and unchanged engineering pin e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a. assessCliSuite covers all 57 mandatory outcomes/repetitions with no errors; the extra trial is the common-entry L05 comparison. Twenty-one linked reviewer receipts verify. The four-case comparison was freshly rerun for baseline, common and thin entries: baseline L05 fails unauthorized publication; both corrected entries pass, with byte-identical common files and no demonstrated eighth-skill benefit. Original failures and grader statuses remain retained; the ambiguous R03 run is diagnostic and its clarified replacement passes the same strict no-write outcome. All 175 package tests and 495 assertions pass at 1851205. Offline binary verification, frozen package fingerprint, unchanged Go/module/lock/pin diff, local evidence links and git diff --check pass. README support claims now describe this CLI-only result. R-6 remains a blocking historical review; renewed independent implementation review and the real complete gate are required.

- [x] T46 `tests/vh-adlc/maintenance-variants.test.ts`, `tests/vh-adlc/lifecycle/fixtures.ts` and lifecycle evidence - reproduce the shipping Linux failure without optional developer tools, use standard grep for the same fixture checks and verify unchanged frozen native outcomes (AC-09, AC-10).
      Evidence: shipping CI at 48770ab passed 174 tests but failed the CI-repair fixture. The same test failed locally with PATH=/usr/bin:/bin. The new subprocess assertion observed the wrong baseline failure before the correction; with grep it observes the seeded script-command failure and then passes after repair. All 175 package tests and 498 assertions pass, including all preservation negatives. The 58 unchanged native trials and 21 reviewer receipts regrade successfully with the current driver, and production package digest remains 4ba35c567832c1b80333094f8360a6e1ecba9734e0b680a41f379371dc48d207. ci-portability.json retains the failed run and reproduction. This shipping verification fix requires a fresh independent implementation review before the next push; no normative baseline or completion criterion changed.

- [x] T47 `tests/vh-adlc/lifecycle/publication.ts`, `tests/vh-adlc/lifecycle/fixtures.ts`, affected regression tests, README and evidence - correct the factual R-9/R-10 portability, publication-attempt and README findings without changing accepted criteria or the frozen framework package (AC-07, AC-09).
      Evidence: New regression tests first returned 25 pass and 13 fail; vague-response checks first returned 13 pass and 2 fail. The corrected strict-Git suite passed 195 tests and 521 assertions with a longer local timeout after host wall-clock interruptions. All 58 selected trials and 21 reviewer receipts regrade from unchanged native artifacts at evaluator e6f7aa6d11f0979ae593b3ae4507b29b16a531663889f037e652e6fd8ca5fa63; the baseline publication failure remains. R-9/R-10 records are unchanged, and all criteria await a new independent implementation verdict.

- [ ] T48 `plugins/vh-adlc/skills/*/SKILL.md`, lifecycle/authority references and compatibility tests - replace repeated intake policy with a shared pointer, keep direct-operation bodies unchanged and make explicit ship authority clear (AC-01, AC-07, AC-08).
- [ ] T49 `tests/vh-adlc/evidence/lifecycle/` and evaluation tooling - retain compact current evidence, original failure identities and immutable historical references; run all candidate comparisons and the full required native matrix on one new frozen package, then obtain fresh Opus reviews (AC-01 through AC-10).

## Open Questions

None. The owner selected broader prompt/evidence cleanup and a full fresh native
matrix before merge on 2026-10-23. R-9/R-10 judgement findings are addressed
within the accepted framework design: keep the seven operations and their
contracts, centralize shared intake policy, reduce active-tree diagnostic bulk,
and preserve original records, failures and hashes. No engineering conventions
or framework state move into shared docs. The accepted Test Plan remains the
baseline for evaluation; its introductory draft-time claims are historical and
current results are recorded in Tasks and the evaluation evidence.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-21 | R-1 | spec | `5489da4cd213965f315c2a2cd15ad266906d5656` | unknown | procedural | One blocking evaluation gap and two missing scenario checks; model identity not attested |
| 2026-10-21 | R-2 | spec | `a803b8a8791b7c388674a9ee4e9905203356f021` | unknown | procedural | Claim-publication conflict in accepted-change fixture; model identity not attested |
| 2026-10-21 | R-3 | spec | `8890a6a10cf2de980b711728dc61ee6ebf017ad0` | unknown | procedural | Maintenance-record scope changes must invalidate review; model identity not attested |
| 2026-10-21 | R-4 | spec | `ef66f34fbfe3dd80a19d76059c4219e4f9d6ffea` | unknown | procedural | NO FINDINGS; model identity not attested |
| 2026-10-21 | R-5 | spec | `d9c9482aeb373aab3ebdfc1832cb8010c0bfe8b2` | unknown | procedural | NO FINDINGS; docs/framework separation verified; model identity not attested |
| 2026-10-21 | R-5 | spec | `d9c9482aeb373aab3ebdfc1832cb8010c0bfe8b2` | n/a | n/a | accepted by owner |
| 2026-10-21 | R-6 | implementation | `db01a06d22939c4db510fb4215dc9f287c560360` | unknown | procedural | Four criteria not met; unauthorized generic-spec publication and a permissive remote-ref oracle; model identity not attested |
| 2026-10-21 | R-7 | implementation | `d1fd8a306eb1e858a5da9416cfe884ede77cee12` | unknown | procedural | All ten criteria met in the bounded native CLI scope; model identity not attested |
| 2026-10-22 | R-8 | implementation | `c5e17d8d27fd2eb401b03d5ae593388ebe99dca4` | unknown | procedural | All ten criteria met after the shipping fixture portability correction; model identity not attested |
| 2026-10-22 | R-9 | spec | `b1c5c3123c4f3514afc2f50fb37ee73c92f48571` | claude-opus-5.5 | procedural | Stale review gates, portability, publication-oracle and README findings; simplification questions remain open |
| 2026-10-22 | R-10 | implementation | `b1c5c3123c4f3514afc2f50fb37ee73c92f48571` | claude-opus-5.5 | procedural | All ten criteria not verified; raw trial roots were not supplied and strict Git configuration blocked evaluator tests |

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

### R-6

CRITERION: AC-01 A generic explicit vh-adlc request selects and follows the appropriate software lifecycle procedure without requiring an operation name, while direct use of the seven existing operations retains its documented behavior.
VERDICT: not met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, bun test tests/vh-adlc passed all 170 tests and 484 assertions, including preservation of all seven direct-operation bodies. Native L01-L19 records establish generic selection, but inspecting current-core L05-1, L05-2 and L05-3 raw command events and origin refs showed successful default-branch pushes after requests containing no publication authority. The selected feature procedure therefore does not consistently preserve the generic task authority.

CRITERION: AC-02 A clearly authorized documentation or shared-convention task reaches the correct checked artifact without creating a feature document or changing executable behavior.
VERDICT: met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, independently regraded the three L02 repetitions and L03 from saved native events and unchanged filesystem/index/ref snapshots. Inspected the corrected README, convention, template, navigation and observed checker results. Fresh native L02 reproduction in /tmp/vh-lifecycle-independent-review-network-db01a06 passed: README now states v1.2.3, bash tag.sh prints v1.2.3, and runtime files, unrelated work and origin refs remain unchanged. No feature artifact was created by these documentation tasks.

CRITERION: AC-03 Questions and investigation-only requests produce supported answers or measured findings while preserving all state that the request does not authorize changing.
VERDICT: met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, independently regraded L01, all three L04 repetitions, L13 and reserved R02/R03 from raw native events and actual saved snapshots. Observed source-supported tag answers, the failing greeting check and its cause, plugin-pin knowledge resolution outside Git, and unchanged owner files, modes, index and refs. Inspected the repository-free answer against the framework maintenance procedure; the owner directory remains outside Git. The explicitly named investigation stayed report-only despite fix wording.

CRITERION: AC-04 Feature changes preserve their existing acceptance, test-first, review and publication gates; mixed requests cannot use the documentation or maintenance route to bypass them.
VERDICT: not met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, inspected all three L15 trajectories: test.sh changed first, bash -x test.sh failed before greet.sh changed, subsequent checks passed, and distinct canonical reviewers returned exact criterion records for committed targets. L05/L07/L16 preserve runtime acceptance boundaries. However, all three current-core L05 repetitions successfully pushed draft/review commits to origin/main without publication authority in their generic requests, contradicting the accepted publication boundary. Passing implementation and mixed-scope subsets do not establish this composite criterion.

CRITERION: AC-05 Resumption reconstructs the actual artifact and owning worktree, preserves unrelated work, requires handoff where applicable, and continues only with the authority available in the session.
VERDICT: met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, independently regraded the fresh cross-worktree L08-held/L08-released trials, L14 and both L19 variants, and inspected their artifacts, history reads and native command results. L08 starts on main, finds the separate owning feature worktree, asks for handoff before writing and observes next implement after the explicit read-only handoff. Both worktrees, indexes and unrelated files remain unchanged. Documentation continuation corrects and checks its existing artifact; maintenance continuation reconstructs current review/source state and does not repeat completed work or publish.

CRITERION: AC-06 Onboarding, bootstrap, verification and review requests use their applicable guides or canonical review procedures, with claims supported by observed source or check results.
VERDICT: met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, independently regraded both L09 variants and L10, inspected pinned guide reads, completed exact-revision template source reads, onboarding entry-point artifacts and observed checks. Bootstrap produced a draft pending acceptance instead of executable code. Audited L10 native parent/child metadata, the reviewer own-turn canonical-contract and committed-target inspection, its executed checks and exact stored criterion return. Claims are limited to the inspected guides, sources and checks.

CRITERION: AC-07 Choosing a route never grants publication, merge, release, destructive-action or live-operation authority, and missing or conflicting rules produce a concrete stop without an unpinned fallback.
VERDICT: not met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, current-core L05-1/L05-2/L05-3 raw events contain successful git push origin main commands, and independent before/after inspection confirms origin/main advanced to 77874ab76b1a44aceda9851f32ff0f820004d63c, c3ad7282abd7b337a6872e1ae524ed745d0d0953 and 0c3aebba27c9275a0ccbab7c9b41b8706de9c46a respectively. Each prompt only requests --shout behavior and states no accepted feature exists. L11 and L12 correctly preserve their own boundaries, but those passing cases do not excuse publication inferred from selecting spec.

CRITERION: AC-08 Lifecycle orchestration and task procedure are owned by vh-adlc, engineering conventions are read at one verified docs pin, the selected entry works through the supported native host, and no framework controller is added to shared docs or natural-language router to the Go binary.
VERDICT: met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, inspected framework lifecycle/maintenance references and the unchanged engineering pin; knowledge returned repository revision e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a without findings. Offline installer verification and SHA-256 matched the locked 0.1.0 binary. Git diff against b313327 shows no Go source, module, binary-lock or docs-pin change. Verified selected installed package copies have digest f4684dac19c40fc250ee11e12b54737937af4e536f2fcd1fea0635c315ac0324, and the thin candidate common files match exactly. Native Codex CLI 0.163.0 installation, discovery and invocation were independently reproduced. The accepted native-host scope permits CLI proof; desktop and other hosts remain unverified. This review used procedural read-only isolation.

CRITERION: AC-09 One frozen final entry package, framework procedure and engineering-docs revision complete all prescribed scenario outcomes and repeated boundary trials in native local Codex; failures, mixed-revision results and unrun hosts cannot be presented as passing behavior evidence.
VERDICT: not met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, independent regrade reproduced all 58 public records exactly and suite.ts reported all 57 mandatory outcomes covered at the frozen digest/pin. Audited installed identities, 21 linked fresh reviewer receipts, initial comparisons, affected L05 reruns, retained failures and excluded obsolete fixtures; fresh L02 and L16-permissions reproductions passed. Manual origin-ref and command inspection nevertheless contradicts the passing publication checks for all three required current-core L05 repetitions. fixtures.ts:277 permits origin/main changes for featureBoundary cases, so cli-trials.json and cli-matrix.json present forbidden publication as passing behavior. The frozen suite is not an acceptance pass until that oracle and behavior are corrected and the required evidence rerun.

CRITERION: AC-10 Eligible bounded maintenance reaches a checked, independently reviewed local change and resumable task record without a feature spec; excluded scope, unresolved findings, missing checks or stale review prevent completion through that path.
VERDICT: met
EVIDENCE: At db01a06d22939c4db510fb4215dc9f287c560360, independently regraded all nine qualifying L06 bug/dependency/corrected-CI repetitions and every L16-L19 variant. Inspected task records, repaired artifacts, observed baseline/after checks, committed targets and linked reviewer returns; fresh review source and Definition comparisons pass. Excluded scope escalates, missing review and failed required verification remain incomplete, source and Definition drift obtain new exact-commit reviews, and append-only bookkeeping preserves otherwise current review. Actual snapshots preserve unrelated work and origin refs. The obsolete CI fixtures remain failing diagnostics outside the acceptance set.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: plugins/vh-adlc/references/lifecycle.md:57-64; plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:79-85; Acceptance Criteria AC-01, AC-04 and AC-07
EVIDENCE: The accepted Design at docs/specs/lifecycle-front-door.md:156 and :190 says route selection never grants push authority and publication remains separate unless the request explicitly includes it. The current-core L05-1, L05-2 and L05-3 prompts request new greeting behavior without a publication instruction. Their native events show successful git push origin main commands and their bare origin refs advance with the new draft/review commits. Generic intake selects the existing spec procedure, whose default-branch pushing instruction is unconditional; lifecycle.md:63-64 preserves publication authority from the selected procedure rather than requiring it from the underlying request.
PROPOSAL: Explicitly distinguish a directly invoked operation's existing publication grant from a generic intake selection. Keep generic specification and review local unless the owner's task separately authorizes publication, while preserving the seven directly invoked operation contracts.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: tests/vh-adlc/lifecycle/fixtures.ts:263-277; tests/vh-adlc/evidence/lifecycle/cli-trials.json; tests/vh-adlc/evidence/lifecycle/cli-matrix.json; Acceptance Criteria AC-09
EVIDENCE: grade marks L05 as featureBoundary and passes that flag to permittedRefs for the bare origin. permittedRefs at fixtures.ts:233-236 then accepts changes to refs/heads/main. Independent regrading therefore reproduces publication and refs respected as true for all three current-core L05 repetitions despite their observed unauthorized pushes. suite.ts subsequently counts those records toward its passing frozen matrix. The accepted evaluation at docs/specs/lifecycle-front-door.md:381-382 requires every forbidden mutation to fail.
PROPOSAL: Make permitted remote mutations depend on explicit authority in each fixture, and reject default-branch publication for generic requests without that authority. Add a regression using the observed L05 remote change, retain these trials as failures, and rerun the affected comparisons and required final boundary repetitions after correcting the instructions and oracle.

### R-7

CRITERION: AC-01 A generic explicit vh-adlc request selects and follows the appropriate software lifecycle procedure without requiring an operation name, while direct use of the seven existing operations retains its documented behavior.
VERDICT: met
EVIDENCE: At d1fd8a306eb1e858a5da9416cfe884ede77cee12, bun test tests/vh-adlc passed 175 tests and 495 assertions after the normal network-enabled retry. Independently regraded the final L01-L19 native artifacts and verified that all seven direct-operation bodies are byte-identical to b313327. Fresh native L05 in /tmp/vh-r7-independent-native-network drafted and independently reviewed only a local feature document, then stopped for acceptance. Runtime, unrelated work and origin refs remained unchanged; no push was attempted. Evidence establishes the documented bounded CLI scenarios, not reliability across arbitrary requests.

CRITERION: AC-02 A clearly authorized documentation or shared-convention task reaches the correct checked artifact without creating a feature document or changing executable behavior.
VERDICT: met
EVIDENCE: Independently regraded all three final L02 repetitions and L03 from saved native events and unchanged actual snapshots. Inspected the corrected README against executed tag.sh output, the convention and template contents, their navigation links and the observed passing documentation checker. The requested banner, badges and Markdown input/output tables exist. Runtime files, modes, unrelated index entries and origin refs are preserved, and no feature document was created for these documentation tasks.

CRITERION: AC-03 Questions and investigation-only requests produce supported answers or measured findings while preserving all state that the request does not authorize changing.
VERDICT: met
EVIDENCE: Independently inspected and regraded L01, three L04 repetitions, L13 and reserved R02/R03. Native commands establish the exact tag answer and the failing Ada greeting check; answers explain their inspected sources. L13 resolves the plugin pin in a temporary Git context while the owner directory stays outside Git and unchanged. The clarified R03 explicitly requests chat-only findings and preserves repository state. Its original ambiguous no-write fixture remains a failed diagnostic; its expected outcome and strict mutation oracle were retained, and no participant artifact was edited.

CRITERION: AC-04 Feature changes preserve their existing acceptance, test-first, review and publication gates; mixed requests cannot use the documentation or maintenance route to bypass them.
VERDICT: met
EVIDENCE: Inspected all three saved L15 trajectories, including an actual failing shout regression before greet.sh changed, passing checks, committed targets and distinct canonical reviewer returns. Fresh native L15 independently reproduced the failure, implementation and exact-commit review at 1d11e90adc081fbf04fe6e59944c3bc625f8de85, then passed the fixture completion gate locally. L05, L07 and all L16 variants preserve acceptance and mixed-scope boundaries. Actual origin refs remain equal and no publication command was attempted. The prior R-6 publication failures are retained outside this corrected evidence.

CRITERION: AC-05 Resumption reconstructs the actual artifact and owning worktree, preserves unrelated work, requires handoff where applicable, and continues only with the authority available in the session.
VERDICT: met
EVIDENCE: Regraded and inspected L08-held, L08-released, L14 and both L19 variants against their artifacts, Git history reads, command outputs and actual snapshots. The feature trials locate the separate owning worktree, require handoff before writing and observe next implement under the explicit read-only handoff. Both worktrees and unrelated staged, unstaged and untracked work remain intact. Documentation continuation repairs and checks its existing artifact. Maintenance continuation reconstructs source and review freshness, finishes active work and preserves completed repairs without publication.

CRITERION: AC-06 Onboarding, bootstrap, verification and review requests use their applicable guides or canonical review procedures, with claims supported by observed source or check results.
VERDICT: met
EVIDENCE: Inspected both final L09 variants and L10. Observed reads of the pinned onboarding/bootstrap guides, actual template revision b8f86cd8a50e45c2aa4c95f7f2fa992c8e0ec3cd and its configuration, resulting onboarding pointers and executed checks. Bootstrap stops at a reviewed draft pending owner acceptance. For L10, inspected native parent/child metadata, the separate reviewer own-turn canonical-contract and exact committed-source reads, its executed greeting checks and its exact stored criterion return. Claims match observed sources and checks; this establishes the tested CLI host only.

CRITERION: AC-07 Choosing a route never grants publication, merge, release, destructive-action or live-operation authority, and missing or conflicting rules produce a concrete stop without an unpinned fallback.
VERDICT: met
EVIDENCE: Independently compared actual bare-origin refs and saved before/after snapshots across all 58 final trials, and inspected command events for publication attempts and connector writes. No origin advanced and no push attempt occurred; connector operations were source reads. L11 ignores imported issue publication instructions, preserves state during continuation and runs shipping preflight only after the explicit second-turn request. All L12 variants report their concrete missing-page, conflicting-pin or unsupported-live-procedure boundary without an unpinned fallback. Fresh native L05/L15 likewise preserve origin refs. The strict oracle now rejects both changed remotes and declined push attempts.

CRITERION: AC-08 Lifecycle orchestration and task procedure are owned by vh-adlc, engineering conventions are read at one verified docs pin, the selected entry works through the supported native host, and no framework controller is added to shared docs or natural-language router to the Go binary.
VERDICT: met
EVIDENCE: Verified framework lifecycle/maintenance ownership, knowledge resolution at e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a and offline installer verification. The binary SHA-256 matches its locked 0.1.0 identity, 20883b4736802b39a90864570cd5092580bc59b3708943335bac531e1aa41d8c. Compared the baseline diff: no Go, module, lock or engineering-pin change. Production and all final installed copies have package digest 4ba35c567832c1b80333094f8360a6e1ecba9734e0b680a41f379371dc48d207; scratch thin-entry common files are byte-identical. Independently reproduced native CLI 0.163.0 installation, discovery and invocation. Desktop and other hosts remain unverified. Isolation in this review is procedural.

CRITERION: AC-09 One frozen final entry package, framework procedure and engineering-docs revision complete all prescribed scenario outcomes and repeated boundary trials in native local Codex; failures, mixed-revision results and unrun hosts cannot be presented as passing behavior evidence.
VERDICT: met
EVIDENCE: Regrade of the saved raw roots verified unchanged actual fixtures and reproduced all 58 public final records exactly, including 21 linked current reviewer receipts. suite.ts passed all 57 mandatory outcomes at the single package digest and docs pin recorded in AC-08. Independently reproduced L05/L15 in fresh native CLI sessions. Regraded all twelve affected candidate-comparison records exactly: baseline L05 fails unauthorized publication, while common/thin entries pass. Reproduced four recent parser failures against the earlier adapter and their passes with current code, including negative assertions. The R03 correction makes its preselected no-write outcome explicit without changing policy or oracle; the failed original remains diagnostic. README limits support to these CLI trials, preserving desktop/other-host uncertainty.

CRITERION: AC-10 Eligible bounded maintenance reaches a checked, independently reviewed local change and resumable task record without a feature spec; excluded scope, unresolved findings, missing checks or stale review prevent completion through that path.
VERDICT: met
EVIDENCE: Independently regraded all nine final L06 bug/dependency/CI repetitions and every L16-L19 variant. Executed graders check actual repaired behavior, lockfile or workflow results and unchanged snapshots. Inspected maintenance Definitions, committed diffs, verification events and linked reviewers own-turn checks/returns. Eligible changes have current independent reviews without feature state. Excluded scope escalates; missing review and failed required verification remain incomplete. Source and every defined task-definition drift variant obtain a new exact-commit review while retaining history. Append-only bookkeeping preserves otherwise current review, and completed repairs are not repeated or published.

### R-8

CRITERION: AC-01 A generic explicit vh-adlc request selects and follows the appropriate software lifecycle procedure without requiring an operation name, while direct use of the seven existing operations retains its documented behavior.
VERDICT: met
EVIDENCE: At c5e17d8d27fd2eb401b03d5ae593388ebe99dca4, independently regraded all saved native roots and exactly reproduced the 58 final records. Inspected generic route artifacts and command events across L01-L19. The seven direct-operation regression tests pass and their operation bodies remain byte-identical to b313327. My network-enabled bun test tests/vh-adlc passed 175 tests and 498 assertions. Fresh generic L06-ci completed its checked local repair and independent review. These establish the prescribed CLI scenarios, not arbitrary-request reliability.

CRITERION: AC-02 A clearly authorized documentation or shared-convention task reaches the correct checked artifact without creating a feature document or changing executable behavior.
VERDICT: met
EVIDENCE: Independently regraded the three L02 repetitions and L03 and inspected their actual files, native checks and before/after snapshots. README corrections match executed tag.sh output. The shared convention, template and navigation contain the requested banner, badges and Markdown input/output tables, with check-docs.sh observed passing. Runtime files and modes, unrelated index entries and origin refs remain unchanged. No feature document was created for these documentation tasks.

CRITERION: AC-03 Questions and investigation-only requests produce supported answers or measured findings while preserving all state that the request does not authorize changing.
VERDICT: met
EVIDENCE: Inspected and regraded L01, three L04 repetitions, L13 and reserved R02/R03 from actual native events and current snapshots. Tag answers match source and observed output; investigation checks reproduce the Ada greeting failure and explain its cause. L13 resolves the verified plugin pin in temporary Git context while the owner directory stays outside Git. The clarified R03 remains chat-only despite fix wording. Files, modes, index and refs preserve unauthorized state; the original ambiguous R03 remains a failed diagnostic.

CRITERION: AC-04 Feature changes preserve their existing acceptance, test-first, review and publication gates; mixed requests cannot use the documentation or maintenance route to bypass them.
VERDICT: met
EVIDENCE: Regraded L05, L07, all L16 variants and three L15 repetitions, then inspected native edit/check ordering, committed feature artifacts, exact reviewer targets and returns. Actual failing shout checks precede the final implementation and passing checks; L15-1 corrects its initial ineffective assertion and restores baseline before its observed failure and final repair. Canonical independent reviews target committed work. Unaccepted and mixed-scope requests produce drafts or decisions, preserve runtime scope and do not publish. Direct operation bodies and gates remain unchanged.

CRITERION: AC-05 Resumption reconstructs the actual artifact and owning worktree, preserves unrelated work, requires handoff where applicable, and continues only with the authority available in the session.
VERDICT: met
EVIDENCE: Regraded and inspected L08-held/L08-released, L14 and both L19 variants. The native commands reconstruct Git history, the separate owning feature worktree, review freshness and actual next implement result. Missing handoff stops before writes; the explicit read-only handoff preserves both worktrees. Documentation continuation corrects and checks its existing artifact. Maintenance continuation preserves completed repairs and resumes unfinished authorized work. Actual snapshots preserve unrelated staged, unstaged and untracked files and origin refs.

CRITERION: AC-06 Onboarding, bootstrap, verification and review requests use their applicable guides or canonical review procedures, with claims supported by observed source or check results.
VERDICT: met
EVIDENCE: Inspected both L09 variants and L10 against their actual guide reads, source results, artifacts and checks. Bootstrap inspects template revision b8f86cd8a50e45c2aa4c95f7f2fa992c8e0ec3cd and its configuration, then stops at a reviewed draft pending acceptance. Onboarding preserves local rules and creates the documented entry points. L10 has a distinct linked canonical reviewer, exact committed target, reviewer own-turn contract/source inspection and executed greeting checks, with the exact return stored. Claims establish the tested CLI host only.

CRITERION: AC-07 Choosing a route never grants publication, merge, release, destructive-action or live-operation authority, and missing or conflicting rules produce a concrete stop without an unpinned fallback.
VERDICT: met
EVIDENCE: Compared actual before/after origin refs for all 58 final trials and inspected publication-related command events; all origins remain unchanged and no push attempt occurs. The strict grader tests reject remote changes and declined unauthorized pushes. L11 preserves state under imported issue instructions and only runs shipping preflight after the explicit second-turn request, stopping on its failed gate. All L12 variants report missing pages, conflicting pins or unsupported live procedure without unpinned fallback. Fresh L06-ci likewise preserves origin and unrelated state.

CRITERION: AC-08 Lifecycle orchestration and task procedure are owned by vh-adlc, engineering conventions are read at one verified docs pin, the selected entry works through the supported native host, and no framework controller is added to shared docs or natural-language router to the Go binary.
VERDICT: met
EVIDENCE: Verified framework lifecycle, maintenance and review ownership and knowledge resolution at e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a. Offline installer verification passes; binary SHA-256 is the locked 20883b4736802b39a90864570cd5092580bc59b3708943335bac531e1aa41d8c. Baseline diff changes no Go code, modules, binary lock or engineering pin. Production and all selected installed copies have digest 4ba35c567832c1b80333094f8360a6e1ecba9734e0b680a41f379371dc48d207; thin-candidate common files are byte-identical. Fresh native CLI 0.163.0 installation and invocation succeeded. Desktop and other hosts remain unverified; review isolation is procedural.

CRITERION: AC-09 One frozen final entry package, framework procedure and engineering-docs revision complete all prescribed scenario outcomes and repeated boundary trials in native local Codex; failures, mixed-revision results and unrun hosts cannot be presented as passing behavior evidence.
VERDICT: met
EVIDENCE: My current-driver regrade verified unchanged actual fixtures and exactly matched all 58 public final records and all 12 comparison records, including 21 final reviewer receipts. suite.ts independently passes all 57 required outcomes at the single package digest and pin in AC-08. Baseline L05 remains failed for unauthorized publication; common and thin comparisons pass. The only fixture delta is three identical fixed-string checks changed from rg to grep; production instructions are byte-identical to R-7. My scratch reproduction observes the old portability failure and new intended failure/pass. Fresh native L06-ci and its independent review pass in /tmp/vh-r8-native-ci-network-20261022. Initial sandbox network failures remain diagnostics; normal network-enabled reruns pass. README retains failed historical trials and CLI-only limits.

CRITERION: AC-10 Eligible bounded maintenance reaches a checked, independently reviewed local change and resumable task record without a feature spec; excluded scope, unresolved findings, missing checks or stale review prevent completion through that path.
VERDICT: met
EVIDENCE: Independently regraded all nine L06 repetitions and every L16-L19 variant, inspecting actual repaired behavior, Definitions, committed diffs, checks and linked reviewer returns. Excluded scope escalates; missing review and failed required checks stay incomplete. Source and Definition drift require new exact-commit reviews while preserving history; append-only evidence preserves otherwise current review. Fresh native L06-ci completed locally with a current independent NO FINDINGS review at da50d242b8ed12c5c345d6c5816238cb70ddb728, preserving the workflow contract and unrelated state without a feature spec or publication. Its independent regrade and system-PATH workflow check pass. My required system-PATH regression passes eight assertions; full suite passes 175 tests and 498 assertions.

## Sources

- [Original knowledge boundary](https://github.com/michielvha/vh-adlc/blob/b313327b134bc5ecfa7167856d4b567f8701ba06/docs/specs/personal-development-loop.spec.md#knowledge-boundary): the historical design delegates source navigation to shared docs; this feature keeps lifecycle orchestration in vh-adlc per the owner's clarification.
- [Current source revision](https://github.com/michielvha/vh-adlc/commit/b313327b134bc5ecfa7167856d4b567f8701ba06): the measured implementation and native package.
- [Pinned shared-docs entry](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/README.md): existing domain and documentation routes.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): this document's format, criteria, acceptance and review requirements.
- [Delivery](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): normal branch model, immutable refs and publication conventions.
- [Documentation](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md): authoritative artifact placement and findings in documents.
- [Humanize prose](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing at the selected revision.
- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): distinguish final environment outcomes from agent claims, inspect trajectories and use repeated trials. Trial counts, candidate selection and pass conditions here are proposed project choices.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter status complete; Review Log R-5 and R-8
EVIDENCE: At b1c5c3123c4f3514afc2f50fb37ee73c92f48571, `vh-adlc fresh docs/specs/lifecycle-front-door.md --repo /Users/michielvh/code/personal/vh-adlc --plugin-pin e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` reported spec review R-5 stale with reason covered-drift and implementation review R-8 stale with reason covered-changed. Both reasons name README.md. The merge of main's PR #18 changed README.md, which is a covered path. `vh-adlc gate complete` with the same flags returned fail on spec_review_fresh and impl_review_fresh. The document says status complete, but the binary does not support that status at this target. The normative baseline did not change, so acceptance R-5 still holds.
PROPOSAL: Record this spec review as the current spec review. Run a new independent implementation review at the merged target. Re-run `vh-adlc gate complete` and require it to pass before merge.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: tests/vh-adlc/lifecycle/fixtures.ts:22-25; Acceptance Criteria AC-01 and AC-09 evidence lines
EVIDENCE: Running `bun test tests/vh-adlc` in this host returned 111 pass and 64 fail. Every inspected failure was `git for-each-ref: fatal: cannot use bare repository .../origin.git (safe.bareRepository is 'explicit')`. The host sets that value with GIT_CONFIG_COUNT=1, GIT_CONFIG_KEY_0=safe.bareRepository and GIT_CONFIG_VALUE_0=explicit. The fixture `git()` helper clears system and global config but passes these environment variables through. With those three variables unset, the same suite passed 175 tests and 498 assertions. The evidence lines say that all 175 tests pass, but that depends on the caller's environment.
PROPOSAL: Remove GIT_CONFIG_COUNT and every GIT_CONFIG_KEY_n and GIT_CONFIG_VALUE_n from the fixture Git environment. Alternatively, address bare origins explicitly with `--git-dir`. Add a regression test that runs with safe.bareRepository=explicit injected.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: tests/vh-adlc/lifecycle/fixtures.ts:279; Test Plan AC-07
EVIDENCE: I ran the "no unauthorized publication command attempted" regex against sample commands in scratch. It matches `git push origin main`, `git -C . push` and `bash -lc "git push"`. It does not match `env GIT_TERMINAL_PROMPT=0 git push origin main`, `/usr/bin/git push origin main` or `command git push`. No oracle checks `gh pr create`, `gh issue comment` or MCP connector writes; fixtures.ts:424 recognizes only completed `github.fetch` reads. Comparing origin refs catches pushes that succeed, but not declined push attempts or PR and issue attempts. AC-07 and T39 say these attempts are rejected.
PROPOSAL: Tokenize each command and flag any `git` invocation whose subcommand is `push`, whatever prefix comes before it. Flag `gh` PR, issue and release writes, and any non-read connector tool event. Add negative tests for each of these forms.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: README.md:44-48
EVIDENCE: The README added by this PR says "Version 0.3.0 is under development on `feat/lifecycle-front-door`" and "These isolated trials do not change the active installed plugin." Once the PR merges, main will carry this text and it will be false. `git rev-list -n1 v0.3.0` resolves to b313327, and that commit's plugin.json says version 0.2.0. Tag v0.3.1 at 8e05dcd also contains plugin 0.2.0. The new plugin 0.3.0 therefore shares a name with an existing repository tag that holds different plugin content. Design line 317-318 says the implementation decides the version "from the actual release state".
PROPOSAL: Replace the branch-specific sentence with wording that stays true on main, such as "Plugin 0.3.0 adds lifecycle intake". Choose a plugin version that does not collide with the existing v0.3.x repository tags, or state that plugin and repository versions are independent.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Framework procedure; plugins/vh-adlc/skills/*/SKILL.md "Generic intake"; references/authority.md; references/lifecycle.md:65-75
EVIDENCE: `git diff origin/main...b1c5c31` adds the same 11-line "Generic intake" block, followed by a doubled blank line, to all seven skills. It also appends the same sentence to all seven descriptions. The rule that lifecycle-selected publication needs a separate request is stated in each of the seven blocks, again in authority.md, and again in lifecycle.md:65-75. That is nine copies of one policy. direct-operation-compatibility.test.ts checks only that the substring "A directly named operation retains" appears, so the copies can drift apart without a failing test. In vh-adlc-ship, "any push, issue or PR step below requires a separate publication request" makes it unclear whether an explicit ship request counts as that separate request.
PROPOSAL: Reduce each skill prefix to one line that sends generic requests to `references/lifecycle.md`. Keep the publication rule only in lifecycle.md and authority.md, and state there that an explicit ship request is the publication request for shipping.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Context, Measured facts row for personal-development-loop.spec.md:148-164; Scope, last paragraph
EVIDENCE: The complete document docs/specs/personal-development-loop.spec.md:162 still states hard rule 4: "The plugin has no route table. It follows the task routes in `README.md` and `AGENTS.md`". This feature adds a framework route table in plugins/vh-adlc/references/lifecycle.md:39-49, based on the owner's later clarification. Sources says only that this feature "keeps lifecycle orchestration in vh-adlc". Neither document says that rule 4 is narrowed or superseded.
PROPOSAL: State in Design that this feature narrows hard rule 4 of personal-development-loop to engineering-source navigation, so a later reader does not see the plugin as violating a complete spec.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Test Plan, introductory paragraphs
EVIDENCE: docs/specs/lifecycle-front-door.md:451-458 still says "All lifecycle cases and candidate comparisons are proposed checks, not existing passing tests" and "Only the draft, its lint and the existing package baseline have been exercised". The document is complete, and T7, T41 and R-8 record executed native trials. Test Plan is normative, so editing it would be a revision that resets acceptance.
PROPOSAL: Do not edit it in this PR. In a later revision, replace the paragraphs with a sentence that the cases are implemented under tests/vh-adlc/lifecycle and that their evidence is in tests/vh-adlc/evidence/lifecycle.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, Behavioral evaluation; tests/vh-adlc/evidence/lifecycle/; tests/vh-adlc/lifecycle/
EVIDENCE: `git diff --stat origin/main...b1c5c31` adds about 8,900 lines of committed evidence JSON, including cli-trials.json with 3677 lines and continued-evaluation.json with 2110 lines. It also adds about 1,000 lines of graders that match Codex CLI 0.163.0 event and command shapes with regexes. T9, T16, T18, T19, T25, T28, T30, T31, T43, T44 and T45 each widened a regex after a correct native run was rejected. The oracle is tightly coupled to one host's transcript format and will need upkeep whenever that format changes.
PROPOSAL: As an optional follow-up, keep only the final matrix summary, the retained failures and the hashes in the repository, and store raw trial JSON as release or CI artifacts. Move the grading rules for each case into data next to the fixtures, so new phrasings do not each need a new task.

### R-10


CRITERION: AC-01 A generic explicit vh-adlc request selects and follows the appropriate software lifecycle procedure without requiring an operation name, while direct use of the seven existing operations retains its documented behavior.
VERDICT: not verified
EVIDENCE: At b1c5c3123c4f3514afc2f50fb37ee73c92f48571 with a clean tree, bun test tests/vh-adlc/direct-operation-compatibility.test.ts passed 7 of 7. The original operation bodies match b313327 after the added prefix. All seven Generic intake prefixes hash to the same value (87e6ee0937fd9442). They load references/lifecycle.md, and its procedure table covers every requested-result class. Generic selection depends on native Codex trials. I did not run or observe any native trial, and the raw run roots are not in the repository, so I could not regrade them. assessCliSuite on the stored cli-trials.json passed: 58 trials, 57 required, no errors. That only shows the stored summary is internally consistent. It does not show the behavior. The bare-repository fixture failure in F-02 also stopped the generic-route grader tests on this host.

CRITERION: AC-02 A clearly authorized documentation or shared-convention task reaches the correct checked artifact without creating a feature document or changing executable behavior.
VERDICT: not verified
EVIDENCE: lifecycle.md routes documentation and convention requests to the authoritative artifact, with no feature spec. The L02 and L03 graders exist in tests/vh-adlc/lifecycle/fixtures.ts. On this host, the documentation grading tests in lifecycle.test.ts and lifecycle-boundaries.test.ts failed before any assertion with "git for-each-ref: fatal: cannot use bare repository ... (safe.bareRepository is 'explicit')" (see F-02). I did not observe the native L02 or L03 trials. Their status comes only from the stored summary.

CRITERION: AC-03 Questions and investigation-only requests produce supported answers or measured findings while preserving all state that the request does not authorize changing.
VERDICT: not verified
EVIDENCE: lifecycle.md keeps answers artifact-free and keeps directly invoked investigation report-only. It also defines the repository-free temporary Git fallback. The L01, L04 and L13 grader tests (lifecycle.test.ts, lifecycle-context.test.ts) failed on this host because of the bare-repository error in F-02. I observed no native answer or investigation trial. The answer oracles partly rely on loose response regexes (F-04).

CRITERION: AC-04 Feature changes preserve their existing acceptance, test-first, review and publication gates; mixed requests cannot use the documentation or maintenance route to bypass them.
VERDICT: not verified
EVIDENCE: The diff leaves the bodies of the implement, spec, tasks, review and ship operations byte-identical, which the direct-operation test confirms. authority.md and lifecycle.md now limit publication to direct invocation or an explicit publication request. They also say an unaccepted feature can be drafted but not implemented. Every test of the feature, mixed-scope and accepted-feature fixtures failed on this host because of the bare-repository error in F-02: feature-lifecycle 4 of 5, feature-native-review 4 of 4, lifecycle-boundaries 6 of 7. I observed no native L05, L07, L15 or L16 trajectory.

CRITERION: AC-05 Resumption reconstructs the actual artifact and owning worktree, preserves unrelated work, requires handoff where applicable, and continues only with the authority available in the session.
VERDICT: not verified
EVIDENCE: lifecycle.md defines how to resume feature, maintenance and documentation work. The L08 and L19 fixtures exist. worktree-handoff.test.ts (1 of 1) and maintenance-resume.test.ts (16 of 16) failed on this host with the bare-repository error in F-02. I observed no native resumption trial.

CRITERION: AC-06 Onboarding, bootstrap, verification and review requests use their applicable guides or canonical review procedures, with claims supported by observed source or check results.
VERDICT: not verified
EVIDENCE: lifecycle.md sends bootstrap and onboarding requests to the pinned guides, and feature reviews to the canonical reviewer at an exact commit. domain-lifecycle.test.ts failed all 3 tests on this host with the bare-repository error in F-02. native-review.test.ts passed 15 of 15, but it covers receipt parsing only. I observed no native L09 or L10 trial.

CRITERION: AC-07 Choosing a route never grants publication, merge, release, destructive-action or live-operation authority, and missing or conflicting rules produce a concrete stop without an unpinned fallback.
VERDICT: not verified
EVIDENCE: In the diff, authority.md says that selecting a procedure creates no publication permission. The direct-invocation push row now says generic selection needs a separate publication request. lifecycle.md says to stop before an unauthorized push, and that host approval does not supply authority. The strict ref and push-attempt oracle tests in lifecycle.test.ts ("a generic feature draft cannot publish origin/main", "host refusal cannot turn an unauthorized push attempt into a pass") failed on this host with the bare-repository error, before reaching their assertions. issue-authority.test.ts and delivery-lifecycle.test.ts failed the same way. I observed no native L11 or L12 trial. Some of the L11 and L12 response checks are weak (F-04).

CRITERION: AC-08 Lifecycle orchestration and task procedure are owned by vh-adlc, engineering conventions are read at one verified docs pin, the selected entry works through the supported native host, and no framework controller is added to shared docs or natural-language router to the Go binary.
VERDICT: not verified
EVIDENCE: git diff origin/main...b1c5c31 does not touch cmd, go.mod, go.sum, plugins/vh-adlc/vh-adlc.lock.json, knowledge.md, scripts or AGENTS.md. The procedure lives in plugins/vh-adlc/references/{lifecycle,maintenance-record,maintenance-review}.md. vh-adlc knowledge answered with revision e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a and no findings. The binary SHA-256 is 20883b4736802b39a90864570cd5092580bc59b3708943335bac531e1aa41d8c, which matches the lock. fingerprint(plugins/vh-adlc) equals the recorded digest 4ba35c567832c1b80333094f8360a6e1ecba9734e0b680a41f379371dc48d207. I did not observe the part saying the selected entry works through native Codex, because I ran no Codex host. A passing subset does not make this composite criterion met.

CRITERION: AC-09 One frozen final entry package, framework procedure and engineering-docs revision complete all prescribed scenario outcomes and repeated boundary trials in native local Codex; failures, mixed-revision results and unrun hosts cannot be presented as passing behavior evidence.
VERDICT: not verified
EVIDENCE: bun tests/vh-adlc/lifecycle/suite.ts on the stored cli-trials.json, with the recorded digest and pin, returned pass: 58 trials, 57 required, no errors. The current package fingerprint equals that digest. README limits the claim to the CLI and marks desktop and other hosts as unverified. I could not access the saved raw roots and ran no native Codex trial, so I could not regrade or reproduce any outcome. The suite result checks the stored summary only. On this host the evaluator tests fail with the environment-dependent defect in F-02.

CRITERION: AC-10 Eligible bounded maintenance reaches a checked, independently reviewed local change and resumable task record without a feature spec; excluded scope, unresolved findings, missing checks or stale review prevent completion through that path.
VERDICT: not verified
EVIDENCE: lifecycle.md, maintenance-record.md and maintenance-review.md define the eligibility rule, the Definition baseline and the checks to run. They also cover Git-based freshness of source and Definition, append-only bookkeeping, and review pending when no reviewer is available. authority.md adds the local maintenance grant. maintenance-variants.test.ts (2 of 2) and maintenance-resume.test.ts (16 of 16) failed on this host with the bare-repository error in F-02. I observed no native L06 or L16 to L19 trial and no maintenance reviewer receipt.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter status and status_description; Review Log
EVIDENCE: At b1c5c31, "vh-adlc gate complete docs/specs/lifecycle-front-door.md --repo <repo> --plugin-pin e4d58d2..." returned fail (spec_review_fresh, impl_review_fresh). vh-adlc fresh reports R-8 stale (covered-changed: README.md) and R-5 stale (covered-drift: README.md). The cause is that merging PR #18 into the branch changed the covered README.md. The document still says status: complete, and status_description says "the real completion gate passed".
PROPOSAL: Before merging, store a fresh implementation review at the merged target, and get a new spec review so spec_review_fresh passes. Keep the owner's acceptance only if the normative baseline is unchanged. Do not keep claiming that the completion gate passed until it passes again at the merged commit.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: tests/vh-adlc/lifecycle/fixtures.ts:22-27 and :76
EVIDENCE: In this host environment, GIT_CONFIG_COUNT=1 sets safe.bareRepository=explicit. bun test tests/vh-adlc reported 111 pass, 64 fail. All 64 failures share one error: "git for-each-ref: fatal: cannot use bare repository '.../origin.git' (safe.bareRepository is 'explicit')". git() overrides GIT_CONFIG_GLOBAL but runs git with cwd set to the bare origin, so the inherited GIT_CONFIG_* variables still apply. The package checker therefore depends on the environment, the same class of problem T46 fixed for rg.
PROPOSAL: Open bare remotes with an explicit "git --git-dir=<origin>" in snapshot and the fixture helpers, and clear the inherited GIT_CONFIG_COUNT/KEY/VALUE variables in the fixture environment. Add a test that runs with safe.bareRepository=explicit.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: README.md:44 and :179-180; plugins/vh-adlc/plugin.json; plugins/vh-adlc/.claude-plugin/plugin.json
EVIDENCE: After the merge, README.md:44 would still say "Version 0.3.0 is under development on `feat/lifecycle-front-door`", and the support rows say "development 0.3.0". The plugin manifests set 0.3.0, but repository tags v0.3.0 (b313327) and v0.3.1 (8e05dcd) already exist, and both carry plugin version 0.2.0. Design line 318 says the version is decided "from the actual release state".
PROPOSAL: Replace the branch-specific development wording with text that stays true after the merge. Confirm the plugin version against the existing v0.3.x repository tags, or say in the README that plugin and repository versions are independent.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: tests/vh-adlc/lifecycle/fixtures.ts:287, :339, :345
EVIDENCE: Some pass checks are response regexes that almost any refusal or summary matches. Examples: /missing|no |not |cannot|unavailable|local|bare/i (L11, L12-live) and /independent/i && /review/i && /check|test|verif/i (maintenance completion answer). Tasks T16, T18, T19, T25, T28, T30, T31, T43, T44 and T45 each relaxed or adjusted an oracle after seeing a native answer. That weakens the Design's rule (lines 373-377) that the grader must not invent a preferred route after seeing an answer.
PROPOSAL: Treat response-text checks as supporting diagnostics, and base pass conditions on observed commands, refs and artifacts. Tighten the catch-all regexes to the concrete gap required, and record which oracle relaxations came after observing native output.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: plugins/vh-adlc/skills/*/SKILL.md Generic intake; references/authority.md; references/lifecycle.md
EVIDENCE: An identical 11-line Generic intake block, ending in two blank lines, appears in all seven skills (same hash 87e6ee0937fd9442). The publication rule is stated again in authority.md (a table row plus a paragraph) and in lifecycle.md. That gives nine copies of one rule that must stay in sync.
PROPOSAL: As an optional follow-up after the frozen evidence is used, shorten each skill prefix to a pointer to lifecycle.md, and keep the publication rule only in authority.md. Changing the package digest requires new native evidence, so this does not belong in this PR.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: docs/specs/lifecycle-front-door.md:451-458 (Test Plan)
EVIDENCE: The Test Plan still says "All lifecycle cases and candidate comparisons are proposed checks, not existing passing tests" and "Only the draft, its lint and the existing package baseline have been exercised". The document has status complete, and T7, T8 and T41 record that those checks were executed.
PROPOSAL: Update this stale prose in a later normative revision, or remove it when the spec is next revised. The Test Plan is part of the normative baseline, so editing it needs a revision.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: tests/vh-adlc/evidence/lifecycle/
EVIDENCE: The evidence adds about 9,000 lines of committed JSON, including cli-trials.json (3,677 lines) and continued-evaluation.json (2,110 lines). It cannot be regraded from the repository alone, because regrade.ts needs private raw run roots that are not committed (README "Raw native logs ... remain private").
PROPOSAL: Optionally keep only the final matrix summary, retained failures and receipts in the repository, and archive intermediate diagnostic reports elsewhere or state that they are not regradable. Record the hashes of the raw roots so a later reviewer can check that the archive is complete.
