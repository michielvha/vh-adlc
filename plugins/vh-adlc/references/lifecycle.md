# Lifecycle intake and execution

This is vh-adlc's framework procedure. Engineering conventions are external,
pinned inputs resolved through `knowledge.md`; the docs repository is not a
dispatcher, task store or workflow runtime. Do not require a new lifecycle page
or change its pin merely to run this procedure.

## Intake once

Use this procedure for an explicit generic vh-adlc request that does not select
an operation. Once a procedure is selected, follow it without entering intake
again. A direct named operation keeps its own contract. In particular, directly
invoking investigation never becomes permission to implement a repair.

1. Identify the requested result and inspect the current repository or artifact.
   Separate the outcome, the actions authorized in the owner's request, and the
   existing task's actual state. A question may need only an answer.
2. Inspect local instructions and Git state where relevant. Resolve engineering
   knowledge through the existing installer and `vh-adlc knowledge` procedure.
   Request the applicable prose/documentation, coding, language or delivery
   pages, read the returned pages, and report the revision. Local repository
   instructions still apply. A cached page is not a framework task record.
3. Select the procedure below. State it briefly, then do the authorized work.
   Do not ask the owner to choose a skill name. Ask only a missing scope or
   authority question that changes the result, continuing independent reads.
4. Stop at an actual decision or authority boundary, an unavailable required
   source, an unresolved conflict, or a failed required check. A successful
   check does not create permission to publish.

For a repository-free question, resolve the plugin pin in a temporary Git
directory if the binary needs one. Do not initialize the owner's directory or
add onboarding files. A restriction on changing repository files still allows
ordinary cache and temporary work; honor a broader explicit no-write constraint.
If binary verification is unavailable, use the existing loop's read-only
fallback and report its limitation. Do not claim an unexecuted gate passed.

## Choose and continue

| Requested result | Procedure |
| --- | --- |
| Answer or advice | Inspect the relevant source and answer with its practical limits. No saved artifact unless requested. |
| Backlog triage | Use `skills/vh-adlc-triage/SKILL.md` to verify scope, rank ready work and save a report; GitHub writes require exact triage approval. |
| Diagnosis or findings | Use `skills/vh-adlc-investigate/SKILL.md` with the selected investigation intent. Reproduce the issue and respect report-only limits. |
| Documentation or a convention | Edit the authoritative requested artifact using the resolved engineering rules, check the result and report it. No feature spec is needed solely to store prose. |
| Bounded maintenance | Follow the maintenance procedure below if the public contract is preserved and local instructions allow it. |
| New capability or wider behavior change | Locate any existing feature and use the existing spec/tasks/implement/review procedures and binary gates. No unaccepted implementation. |
| Bootstrap or onboarding | Read the applicable engineering guide; apply it within the selected task's authority. Creating application behavior still uses the feature procedure. |
| Verification or review | Observe the requested checks. For feature review, dispatch the canonical independent feature reviewer at an exact commit. |
| Resume | Reconstruct the artifact, Git history and owner handoff. Features use their existing resume operation; maintenance uses its record and review target; docs use the requested artifact and remaining authorized edit. |
| Ship or a live operation | Require an explicit request and a supported procedure. Existing feature shipping uses its original preflight. Exact batch approval permits only the triage actions in `references/triage.md`; other non-feature publishing or live-operation gaps remain unsupported. |

The paths in this table are relative to the plugin root. A generic request to
diagnose and fix can finish diagnosis, then enter maintenance or feature work
within the original authority. A report-only request stops after its findings.
An unresolved mixed request gets a focused scope question before dependent
runtime edits. Do not classify YAML or a small diff as documentation by filename.

For an explicitly requested change that needs the feature procedure, continue
with its spec operation: locate the existing document or draft the requested
change and follow its review/decision steps. A missing accepted document blocks
implementation, but does not block that authorized drafting. If a contract,
permission, data or policy decision is missing, ask that concrete question and
continue independent specification work. Merely announcing that a feature spec
is needed does not finish intake.

Publication authority comes from the owner's request, not from selecting an
operation. A generic request that selects spec or tasks may draft, check,
independently review and commit its document locally. The operation's normal
default-branch push does not apply without a separate publication request.
Likewise, stop before an implementation claim that requires a push when that
push is not authorized. Report the ready local artifact and the exact remaining
boundary; do not attempt publication and rely on host approval to reject it.
An explicit request to ship the feature is the publication request for that
shipping operation, whether intake selects it or the owner names the skill.
Directly invoking a named operation retains the publication authority its
existing contract grants. This distinction changes no acceptance, branch,
review or completion gate, and grants no merge, release or live-operation
permission. The separately presented exact triage batch grants only its named tracker actions and
local plan patches/commit under `references/triage.md`; it grants no feature publication,
implementation, merge or release authority.

## Bounded maintenance

Eligible work repairs or maintains the published contract: a regression fix
restores it, a dependency update establishes compatibility, and a CI repair
preserves the intended validation and delivery policy. Scope is determined by
behavior and verified interfaces, not labels or a line-count threshold.

Changes to public interfaces or promised semantics, permission/trust boundaries,
stored-data formats/migrations, or tagging/release/deployment policy use the
feature route. If eligibility is uncertain, resolve that question before the
dependent change. Explicit repository requirements for a feature spec take
precedence; report that concrete requirement rather than overriding it.

A clearly requested eligible maintenance task authorizes its scoped local
edits, checks, record and commits. It authorizes no push, PR, merge or live
action. Use a short-lived maintenance branch in the task's owning checkout;
do not write into an unrelated feature or discard staged work to switch.
Apply the existing handoff rule to another session's claimed work.

1. Inspect the defect or update, interface, instructions and Git state. Reuse
   the record for this task when it exists.
2. Create a short record using `references/maintenance-record.md` in the declared
   repository task/maintenance location, otherwise
   `docs/internal/maintenance/<slug>.md`. The Definition records the requested
   outcome, preserved contract, affected paths, proposed change and required
   checks. Do not add feature frontmatter or create a second feature document.
3. For a regression, execute its failing check before the implementation and
   observe the corrected result afterward. For healthy dependency or CI upkeep,
   observe the baseline and relevant compatibility/lockfile/workflow checks;
   record why there is no meaningful failing regression. Invent no failure.
4. Run required verification and commit only the task's paths and record.
   Preserve unrelated index entries as well as working files. A missing required
   check leaves the task incomplete.
5. Dispatch an independent context with `references/maintenance-review.md`,
   the exact commit, record path, engineering-docs revision and requested scope.
   Reuse `references/review-protocol.md` for model identity and isolation; omit
   an override for an unrequested model. Never substitute self-review.
6. Store its returned records verbatim in the task record. A missing reviewer
   leaves `review pending`. Fix in-scope findings and obtain a new review of the
   resulting commit; take scope-expanding findings to the owner.
7. Complete locally only after required checks were observed and a current
   independent review has no open findings. Compare affected source paths and
   the record's Definition against the reviewed commit using Git. A changed
   Definition or source invalidates that review, even with identical filenames.
   Append-only review/evidence and state bookkeeping may preserve freshness;
   they cannot redefine scope or remove a required check. Commit the resulting
   record and report the local result and the publication boundary.

On resume, inspect the record and actual history before editing. Reassess a
changed definition and re-review stale work; do not repeat a completed repair
or publish it merely because the owner said continue. Preserve earlier reviews
as history. Maintenance completion is a framework check, not a feature-gate
status, and must never be reported as `vh-adlc gate complete`.
