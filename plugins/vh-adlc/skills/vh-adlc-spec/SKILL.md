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

Before writing or recording a spec, or bringing default-branch changes into its owning
checkout, follow [feature writer entry](../../references/authority.md#feature-writer-entry). Resolve the issue or final
spec path first. In an adopted repository, pass `--ownership-spec <document>` when filing an
issue from the approved preview. After an uncertain or held tracker result, follow the
recovery steps in the same reference before retrying or continuing the draft.

This operation's loop role and route come from `.vh-adlc/loop.yaml` through
`bun scripts/loop/cli.ts route` (`references/loop-settings.md`); without the file, every role keeps the
host default. Before acting, read every file `bun scripts/loop/cli.ts context` lists: the repository's instruction
files and its project procedure, whose local rules apply alongside this procedure. If its `plugin.stale` is true, stop before any write and report its `warning`: the session runs an older plugin than the host has installed. If it reports `plugin.binary_warning`, run only the binary `scripts/ensure-vh-adlc.sh` prints, never a `vh-adlc` found on PATH. A spec review also passes the declared lenses to the reviewer. A reviewer role's `command` route runs through `bun scripts/loop/cli.ts review` in place
of the host dispatch described below, as `references/review-protocol.md` (Routes) describes: a `ready`
outcome is stored like a host reviewer's records, and a `pending` outcome leaves the review pending. A
`host` route that names a model dispatches with it as a requested model.

## Issue labels

An issue this operation creates under acceptance or request gets one type label and no state label;
the feature document carries its state (`references/issues.md`). Run `bun scripts/labels/cli.ts file
--repo <checkout> --operation spec --type <type label>` with `--title`, `--body-file` and a new
`--output` file. It uses the repository's mapped label names. Show the owner the labels with the
title and body, then create the issue with `--preview <that file> --approved-digest <digest>`. When it
reports missing labels, create nothing and give its next step.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `guides/feature-document-template.md`, `conventions/documentation.md`, `conventions/delivery.md` and
   `guides/humanize-prose.md`. Report the one-line result. Read those pages from the cache before writing.
2. Run `vh-adlc find` with the issue number or the slug. If a document exists, extend it; never create a
   second document or a second issue for the same feature.
3. If the document has a `branch` field, work only on that branch in its owning worktree, and apply the
   handoff rule in `references/authority.md` before the first write. Otherwise work on the default branch
   in a worktree that holds it, without disturbing anyone's changes.
4. When resuming spec work after acceptance, check Git and the Review Log since the last acceptance
   before editing or dispatching a review. If the work began with a [drift re-review](#drift-re-reviews),
   continue from the recorded pass and keep the same revision limit, even if the spec is now in draft.

## Author mode

- Write from the template page at the resolved revision, into the feature root `vh-adlc knowledge`
  reported. A new document starts at the first status the standard gives; `find` returning nothing is what
  allows creating it.
- Ground every claim in a citation you gathered in this run: a `file:line`, a command and its output, or a
  source you read and list. Measure rather than remember.
- Start Background with the harm statement from `references/loop.md` (Weigh the harm before building
  machinery): the harm, the simplest alternative without machinery, and why the design beats it. Keep
  the design in proportion to that harm.
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
   changes the normative baseline, revise instead, as below. X is then the resulting commit. If drift
   alone prompted the re-review of a `planned` or `in-progress` spec, follow the
   [drift re-review limit](#drift-re-reviews).
2. Dispatch `vh-adlc-reviewer` as `references/review-protocol.md` describes, with the document, X, kind
   `spec`, the docs revision, the binary path and the plugin pin. If dispatch is impossible, write the handoff and leave
   the review pending.
3. Apply the model eligibility rules in `references/review-protocol.md` before storing anything.
   A requested model must match; an unrequested default may report `MODEL: unknown`,
   recorded as `unknown` with model identity explicitly not attested. Never infer its ID from the main
   session. If the protocol leaves the review pending, store nothing. Otherwise store the records
   after the header under the next `### R-<n>`, with a Review Log row at X naming the reported model,
   before changing anything. Then run `vh-adlc review check` against the same text.
4. Check the [drift re-review limit](#drift-re-reviews) and the convergence trigger before applying
   findings. The trigger fires when this pass and the spec review before it both have blocking
   findings, and this pass has at least as many: count the `SEVERITY: blocking` records under each
   `### R-<n>`. For example, R-5 with 12 blocking after R-4 with 11 fires it; R-5 with 9 does not. When
   it fires, revise nothing. Ask the owner one proportionality question that restates the harm
   statement and the simplest alternative, with four choices: keep going, narrow the scope, replace the
   feature with the alternative, or park it. Recommend one. Act on the answer before any further
   revision, and count passes for the trigger only from that answer onward. Otherwise apply the eligible
   findings as one revision. First list the behaviors the design touches and every test, scenario and
   fixture the criteria and Test Plan name. Walk each eligible finding and every change it implies
   through all of them, and re-read each named test or scenario before changing what it checks.
   Turn judgement findings into Open Questions for the owner first, without changing the baseline; when
   the nit rule below applies, nits are the exception. Once the owner has answered, apply every factual finding to be applied and every answer in
   one commit. Where a finding can be met by removing a mechanism or by adding one with the same
   behavior, remove it; where they behave differently, the choice is an Open Question recommending
   removal. Where a finding traces to a change the previous revision made, revisit that change instead of
   patching on top of it. List the behaviors and checks you walked in the report. A blocking pass is
   cleared only by a new independent pass at the new commit.

   The nit rule applies when the resolved `conventions/feature-documents.md` states it: its Review log
   section says that a baseline nit alone never triggers a revision. A page that only
   lists `nit` as a record value does not state it. When it applies, follow it in that same commit: fix
   every nit of the pass, factual or judgement and in any section, only when the pass's blocking or
   should-fix findings change the normative baseline, and never a free-text widening nit. Raise no nit as an Open Question. List every nit you did not apply, from every pass this run
   handled, with its review and finding IDs and one line, in your report and the owner-facing summary,
   not in the document. When the resolved page does not state it, apply a factual nit like any other factual
   finding and turn a judgement nit into an Open Question, as before the rule, and say in the report that
   the nit rule needs the plugin's own pin from `knowledge.md`.
5. When a clean review at X exists, Open Questions is empty and acceptance is needed, present the
   owner-facing summary below, then ask the owner to accept. On acceptance in session, append the
   acceptance row at X, run `vh-adlc gate planned`, and on a pass move the status and commit with the
   gate's line.

## Drift re-reviews

If a clean re-review leaves the accepted baseline intact, keep the acceptance and finish the review.
When a blocking finding requires a revision, revise once against the accepted scope. Limit edits to
what the default-branch changes affect and to defects a finding shows in the feature's behavior or
proof. Apply the same limit to nits.

If a finding calls for a new mechanism or guidance beyond the feature, leave it out of the revision.
This includes new release or publication checks, tool pins and extra procedures. Ask the owner one
question about the extra work and recommend dropping or deferring it. If there is no fix within scope
for a blocking finding, wait for the owner before requesting another review.

After the revision, request one independent follow-up. If it is clean, follow the acceptance step for
any changed baseline. If it still has a blocking finding, record the pass and stop. Wait for the owner
before revising or requesting another review. Say what the feature does, why it is blocked and what
you propose. Usually that means returning to the accepted text with only the fixes the feature needs.
Use plain feature terms in this report, without review IDs, finding codes or convention names.

## Owner-facing summary

Write every owner question in terms of the feature and the decision the owner needs to make. Keep
review IDs, finding codes and convention names with the review details.

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
