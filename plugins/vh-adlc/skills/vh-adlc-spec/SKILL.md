---
name: vh-adlc-spec
description: Author or review a vh-adlc feature document, the single document that is both a feature's spec and its plan. Use only when the owner invokes /vh-adlc-spec or explicitly asks to specify, revise or review a feature with the vh-adlc loop; it is not the entry point for planning in general. Generic vh-adlc requests use lifecycle intake.
---

# vh-adlc-spec

## Saved owner summary

- When the resolved template includes `### Owner summary` inside Context, write that subsection for
  the owner before the background detail. Use its guidance rather than creating a second template.
  On a normative revision, refresh it against the changed scope; before acceptance, reconcile its
  decisions and proof wording with the current document. Keep planned checks distinct from observed
  results. Summary-only corrections do not create acceptance or change the normative baseline.
- Keep the conversation summary below even when the document already contains its saved summary.
  Untouched historical documents need no summary backfill; preserve returned review records exactly.

## Generic intake

For generic vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here.

The plugin directory is two levels above this skill's own directory. Every path below that starts
with `references/` or `scripts/`, and `knowledge.md`, is in that directory.

Two modes: author (`/vh-adlc-spec <issue, goal or document>`) and review (`/vh-adlc-spec review <path>`).
Follow `references/loop.md` for every step it describes, `references/authority.md` for what you may do
without asking, and `references/review-protocol.md` for the review mode.

## Loop routes

This operation's loop role and route come from `.vh-adlc/loop.yaml` through
`bun scripts/loop/cli.ts route` (`references/loop-settings.md`); without the file, every role keeps the
host default. Before acting, read every file `bun scripts/loop/cli.ts context` lists: the repository's instruction
files and its project procedure, whose local rules apply alongside this procedure. A spec review also passes the declared lenses to the reviewer. A reviewer role's `command` route runs through `bun scripts/loop/cli.ts review` in place
of the host dispatch described below, as `references/review-protocol.md` (Routes) describes: a `ready`
outcome is stored like a host reviewer's records, and a `pending` outcome leaves the review pending. A
`host` route that names a model dispatches with it as a requested model.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `guides/feature-document-template.md`, `conventions/documentation.md`, `conventions/delivery.md` and
   `guides/humanize-prose.md`. Report the one-line result. Read those pages from the cache before writing.
2. Run `vh-adlc find` with the issue number or the slug. If a document exists, extend it; never create a
   second document or a second issue for the same feature.
3. If the document has a `branch` field, work only on that branch in its owning worktree, and apply the
   handoff rule in `references/authority.md` before the first write. Otherwise work on the default branch
   in a worktree that holds it, without disturbing anyone's changes.

## Author mode

- Write from the template page at the resolved revision, into the feature root `vh-adlc knowledge`
  reported. A new document starts at the first status the standard gives; `find` returning nothing is what
  allows creating it.
- Ground every claim in a citation you gathered in this run: a `file:line`, a command and its output, or a
  source you read and list. Measure rather than remember.
- Write criteria as end states, each with a Test Plan row naming a real check.
- Where the design changes state, runs concurrently, or crosses a process or network boundary, state in
  Design what happens under concurrent requests, partial failure, retry or replay, and upgrade or rollback
  from the previous version. Put any of those choices you cannot settle into Open Questions.
- When you change a rule, limit or default, search the document for every other place that states it and
  change them all in the same commit.
- Put every judgement call into Open Questions in the standard's decision shape, and put each to the owner
  with the host's question tool. Never answer one yourself. Fold the owner's answers into the document. When
  the resolved convention states the nit rule, nits from a review pass are not Open Questions; review
  mode handles them under that rule.
- Creating an issue needs explicit authority.
- Run `vh-adlc lint` and fix what it reports before committing.

## Review mode

1. Commit the document first; a review targets an exact commit. Call it X. When `vh-adlc fresh` shows the
   spec review stale from drift alone (covered changes on the default branch, an unchanged baseline),
   first bring that work in. With a `branch` field, run `git merge origin/<default branch>` on the feature
   branch in its owning worktree; without one, run `git merge --ff-only origin/<default branch>` on the
   default branch. Git keeps unrelated uncommitted work through either. Let Git decide whether it can: if
   it refuses, report its message and stop, never stash or discard anything to get past it. If the merge
   changes the normative baseline, revise instead, as below. X is then the resulting commit.
2. Dispatch `vh-adlc-reviewer` as `references/review-protocol.md` describes, with the document, X, kind
   `spec`, the docs revision, the binary path and the plugin pin. If dispatch is impossible, write the handoff and leave
   the review pending.
3. Apply the model eligibility rules in `references/review-protocol.md` before storing anything.
   A requested model must match; an unrequested default may report `MODEL: unknown`,
   recorded as `unknown` with model identity explicitly not attested. Never infer its ID from the main
   session. If the protocol leaves the review pending, store nothing. Otherwise store the records
   after the header under the next `### R-<n>`, with a Review Log row at X naming the reported model,
   before changing anything. Then run `vh-adlc review check` against the same text.
4. Apply the pass's findings as one revision. First list the behaviors the design touches and every
   test, scenario and fixture the criteria and Test Plan name. Walk each finding, and every change it
   implies, through all of them, and re-read each named test or scenario before changing what it checks.
   Turn judgement findings into Open Questions for the owner first, without changing the baseline; when
   the nit rule below applies, nits are the exception. Once the owner has answered, apply every factual finding to be applied and every answer in
   one commit. Where a finding can be met by removing a mechanism or by adding one with the same
   behavior, remove it; where they behave differently, the choice is an Open Question recommending
   removal. Where a finding traces to a change the previous revision made, revisit that change instead of
   patching on top of it. List the behaviors and checks you walked in the report. A blocking pass is
   cleared only by a new independent pass at the new commit.

   The nit rule applies when the resolved `conventions/feature-documents.md` states it: its Review log
   section says a nit on the normative baseline never causes a revision on its own. A page that only
   lists `nit` as a record value does not state it. When it applies, follow it in that same commit: fix
   every nit of the pass, factual or judgement and in any section, only when the pass's blocking or
   should-fix findings change the normative baseline, and never a free-text widening nit. Raise no nit as an Open Question. List every nit you did not apply, from every pass this run
   handled, with its review and finding IDs and one line, in your report and the owner-facing summary,
   not in the document. When the resolved page does not state it, apply a factual nit like any other factual
   finding and turn a judgement nit into an Open Question, as before the rule, and say in the report that
   the nit rule needs the plugin's own pin from `knowledge.md`.
5. When a clean review at X exists and Open Questions is empty, present the owner-facing summary below,
   then ask the owner to accept. On acceptance in session, append the acceptance row at X, run
   `vh-adlc gate planned`, and on a pass move the status and commit with the gate's line.

## Owner-facing summary

Whenever you finish spec work, summarize the current spec in the conversation. Before each acceptance
or renewed acceptance request, give the owner enough information to decide without reading the document
end to end or reopening earlier progress updates. Scale the summary to the feature; use plain language
and a few short paragraphs or bullets covering:

- The problem, intended outcome and proposed user-visible behavior.
- What is included, what stays unchanged or local, and what is excluded.
- Significant defaults, side effects, permissions and trade-offs.
- Migration, compatibility and rollback when relevant.
- The validation plan, current review result, and remaining blockers, limitations or deferred tests.
- Exactly what acceptance authorizes and which later actions still need separate approval.

For a revised spec, explain what changed since the last accepted version. Distinguish planned checks
from executed checks and spec review from implementation verification. Link the full document for
details; a link, review verdict or list of criterion IDs does not replace the summary. The document
remains the canonical scope and the existing acceptance and status gates still apply.

## Revising a planned or in-progress document

Before changing anything in the normative baseline the standard defines, run `vh-adlc gate draft` and
commit the move to draft on its own, on the feature branch when one is set. Then revise, review and accept
again as above. On a normative revision, reset criterion ticks and remove live evidence and residual lines;
their history stays in Git. Keep checked tasks and add new task IDs for changed requirements.

## Committing and pushing

Edit every prose section, commit message and report with `guides/humanize-prose.md` at the resolved
revision before writing it, and name the page and revision in the report. While the document has no
`branch` field, commit it (with first-run onboarding files) on the default branch and push those
documentation-only commits there, as the delivery convention at the revision describes for such
deliveries. A rejected push is a partial result: keep the commit and ask whether to open a PR instead.

## Report

What changed, the knowledge line, every `vh-adlc` result you acted on (quote its JSON `result` and `line`),
what was verified, what is left, including any review that is pending, and the page and revision used to
edit the prose.
