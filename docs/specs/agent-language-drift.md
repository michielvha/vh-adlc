---
status: draft
status_description: "Investigation proposed; experiments, independent review and owner acceptance remain pending."
issue: https://github.com/michielvha/vh-adlc/issues/20
goal: "Determine whether repeated agent work makes Stackweaver harder for its owner to understand and whether a tested vh-adlc safeguard is justified."
covers:
  - plugins/vh-adlc/
  - tests/vh-adlc/
---

# Plan: Investigate language drift in agent-written projects

Use Stackweaver to test whether agents gradually replace clear explanations with
verbose terminology or unnecessary code abstractions. Evaluate ways for the
vh-adlc harness plugin to prevent recurrence before proposing an implementation.

## Context

### Observation from the supplied post

The owner supplied a post describing a loss of readability during long agent-led
projects. Its author suspects that agents copy earlier agents' terminology and
add abstractions that humans struggle to follow. The post also suggests direct
language, descriptions of behavior, documentation consolidation and scrutiny of
new abstractions. This is an anecdote supplied in the 2026-10-21 request; its
author and URL were not provided. It does not establish that Stackweaver has
the same problem.

The owner selected Stackweaver as a long-running generated project and requested
only a tracking issue and investigation spec in this session. The eventual
target is the custom vh-adlc harness plugin. Implementation remains separate.

### Measured starting points

These measurements identify available material. They do not establish drift.

| Evidence gathered on 2026-10-21 | Result |
| --- | --- |
| vh-adlc `git rev-parse HEAD` in the isolated worktree | `b313327b134bc5ecfa7167856d4b567f8701ba06` |
| Stackweaver `git rev-parse HEAD` | `66730960cb815947a4fe7b00568859d505aaf6a6`; use this as the initial case-study revision, not a claim about the latest remote version. |
| Stackweaver `git ls-tree -r --name-only HEAD docs/internal` and the same command for `docs/internal/analysis`, each piped to `wc -l` | 630 internal documentation files, including 48 analysis files. |
| Stackweaver `git log --reverse --format='%h %as %s' -- docs/internal/overviews/ansible-runner-overview.md` | The available history for this path begins at `7d9fb3b2` on 2026-01-18 and includes later documentation and runner changes. Renames and behavior changes still need examination. |
| Stackweaver `docs/internal/overviews/ansible-runner-overview.md:12-36` at the case-study revision | A concrete runner description and a component diagram provide one candidate passage for comparison. No readability verdict has been made. |
| vh-adlc `plugins/vh-adlc/references/loop.md:86-97` at the vh-adlc revision above | The procedure already requires editing reader-facing prose with the pinned humanize guide. |
| Pinned `conventions/documentation.md`, opening paragraph and “Findings and issues” | Existing guidance already calls for plain English and keeps substantial findings in a document linked from a short issue. |

### Hypotheses to test

- Repeated agent edits make descriptions of unchanged behavior harder to read.
- Reusing earlier agent prose carries invented terminology into later work.
- Human review and periodic consolidation reduce that effect.
- Names and wrappers introduced in prose sometimes become code abstractions
  without a demonstrated maintenance benefit.

More complex features, changed audiences, documentation moves, and changes in
model or instructions are alternative explanations. Git authorship alone cannot
prove agent authorship, the amount of human steering, or what an agent read.

### Decisions already supplied by the owner

Track this work in vh-adlc, use Stackweaver as the example, isolate the work from
the other active agent, and stop this session after the issue and draft spec.

## Scope

The later investigation examines Stackweaver documentation, available agent
explanations and the code behind selected behaviors. It compares history and
tests candidate safeguards in disposable copies. It records findings and the
recommended next step in this document.

This session creates the issue and draft only. The experiments, a Stackweaver
cleanup, production code changes, plugin changes, new mandatory checks and
releases are outside this session. The investigation does not establish a
general causal claim about all models or all generated software.

## Design

### Define the behavior being tested

Language drift means wording becomes harder for a human to connect to the actual
actor, action, limits and result while the described behavior stays equivalent.
New domain terms are legitimate when they name a distinct concept that helps a
reader or corresponds to a needed code boundary. Length alone does not decide
whether an explanation is clear.

The existing prose requirement is the baseline, as shown by the vh-adlc procedure
and pinned documentation convention cited above. The study must distinguish a
missing instruction, an instruction that was not followed, and an instruction
that was followed but did not prevent drift.

### Compare Stackweaver history

1. Record the exact repository revision, instruction files and available model
   or session metadata. Keep unavailable provenance explicit.
2. Select passages by a rule recorded before rating them. Include different
   areas and passages that appear clear. Use early, middle and recent revisions
   of the same behavior, following renames with `git log --follow` where needed.
   Start with the runner overview identified above; do not presume it is a bad
   example. Record sample size and selection limits.
3. Trace each passage to code at each sampled revision. Separate behavior
   changes from wording changes. Keep examples where complexity is justified
   and examples where the hypothesis fails.
4. For each comparison, record exact refs and file locations, changed terms,
   repeated explanations, and the concrete behavior. Inspect whether a new
   code wrapper or interface adds a useful boundary, responsibility or reuse.
   A name or extra layer alone does not establish unnecessary complexity.
5. Use historical session explanations only when they are available and their
   provenance is known. Label newly generated explanations as experiment output.

### Test repeated agent sessions

Use disposable copies of one pinned Stackweaver snapshot. Give each condition
the same behavior-preserving documentation task and the same source code.
Keep model, settings, task, starting files and available context constant within
each comparison. Start successive sessions with the preceding session's written
artifacts so the experiment tests whether terminology is inherited.

Compare the current instructions with each candidate separately:

- A direct instruction to name the actor, action, limits and result, and to
  explain a new term using an example of actual behavior.
- A review step that asks whether each new abstraction has a concrete benefit.
- A consolidation step that removes duplicate explanations while keeping one
  authoritative description and working links.

Also compare against a condition that starts each round from the original prose.
Repeat matched runs and record the number of rounds, trials and input tokens.
Choose these counts before the runs and retain every output, including failures.
If a combination is tested, identify it separately from the individual changes.
Run no experiments or model calls as part of drafting this spec.

### Assess human understanding and correctness

Hide the condition and chronology when presenting passages for review. Ask the
owner to explain who acts, what happens, and the relevant limits or failures.
Record answer accuracy against the code, time to answer, and terms that require
clarification. Use the same questions for each matched passage and acknowledge
learning effects when the same reader sees multiple versions.

Sentence length, word count, duplicated text and the number of new terms can
support the analysis. They cannot substitute for understanding or establish
that an abstraction has no value. Verify that shorter text retains conditions,
exceptions, identifiers and links. Include necessary domain terminology as a
check against over-simplification. An automated readability score alone cannot
justify a blocking check.

### Decide what belongs in the plugin later

For each candidate, compare understanding, factual accuracy, review burden,
token cost, repeated-session behavior and false positives on useful abstractions.
Keep measured facts, source observations, hypotheses and owner decisions apart,
as `plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md:19-25` requires.

Identify which result supports an instruction change, an advisory review,
periodic consolidation, a deterministic check, or no plugin change. Name the
proposed vh-adlc entry point and the evidence it would inspect. Examine the
plugin at its then-current revision, since another feature is being developed
concurrently. Shared prose rules remain in the pinned conventions; a plugin
proposal should reference them and describe when to apply or verify them.

A useful outcome may be no observed drift, mixed results or insufficient
evidence. State that outcome with its limits. Any enforcement policy, cleanup or
implementation needs a later owner decision and its own accepted scope.

## Acceptance Criteria

- [ ] AC-01: The owner can distinguish harder wording from necessary complexity in the selected Stackweaver cases using comparisons tied to exact documentation and code revisions, including counterexamples and provenance limits.
- [ ] AC-02: Another investigator can repeat the comparison between inherited prose and fresh prose with the same inputs, recorded settings, rounds and retained outputs.
- [ ] AC-03: The owner can judge candidate safeguards using human understanding and factual accuracy, including cases where technical terms and abstractions are useful.
- [ ] AC-04: The owner can decide whether a vh-adlc change is justified from the observed benefits, costs and failure cases, with an explicit inconclusive or no-change outcome when warranted.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Manually follow every sampled comparison to its recorded refs and code locations. Check that behavior changes are separated, a clear or justified-complexity case is included, and claims about agent involvement have evidence or an explicit limit. |
| AC-02 | Reconstruct the disposable starting snapshot and one matched trial from the recorded commands, prompts and settings. Check retained outputs for every round and verify that the fresh-prose condition starts from the original text. Exact model wording need not repeat. |
| AC-03 | Run the concealed-condition comprehension procedure. Check answers against code and inspect proposed simplifications for lost conditions, exceptions, names or links. Compare the unchanged baseline with each candidate and retain false positives. |
| AC-04 | Review the findings against the trials. Each proposed plugin action must cite supporting cases, failures and costs, identify its intended entry point, and state remaining uncertainty. Verify that no cleanup or enforcement was shipped under this investigation. |

## Tasks

None yet. This session drafts the investigation only.

## Open Questions

None for the requested tracking scope. Safeguard selection and enforcement
policy remain future owner decisions after the investigation produces evidence.

## Review Log

Independent spec review and owner acceptance are pending.

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- Owner request and supplied post, 2026-10-21: anecdote, proposed causes and
  candidate remedies; the request supplies the repository, example and session
  boundary. No external post URL was supplied.
- [Documentation convention](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md): existing plain-language guidance and placement of investigation findings.
- [Humanize prose](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing baseline used for this draft.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md), [template](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/feature-document-template.md), [delivery](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md), [entry point](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md) and [task routes](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/README.md): draft format, documentation-only delivery and applicable reading routes.
- Local vh-adlc and Stackweaver measurements at the exact revisions listed in Context: available procedures, corpus and candidate history. The full investigation has not run.
