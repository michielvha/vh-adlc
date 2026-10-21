---
status: draft
status_description: "Historical analysis, source checks and a manual rewrite pilot completed; independent model trials, human comprehension testing and spec review remain pending."
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

### Investigation findings, 2026-10-21

The owner's follow-up authorizes the investigation. The draft-only boundary below
records the initial delivery. Implementation remains outside the request.

There is enough evidence to try a small advisory review step in vh-adlc.
Stackweaver contains repeated explanations, contradictory current-state claims
and unused code abstractions. The historical sample does **not** establish that
agents progressively inflate language, or that copied terminology caused the
unused code. A mandatory vocabulary or length check is not supported by these
results.

#### Historical measurements

The case study uses committed Stackweaver files, without changing that checkout.
The three snapshots are:

| Snapshot | Commit |
| --- | --- |
| Early, 2026-01-18 documentation move | `7d9fb3b26a6dba6da5be876c383b70efcea90e7f` |
| Middle, last reachable commit before 2026-06-01 | `bab15c70e1895a7918a11a8a085478f49b9f99c2` |
| Late, sampled checkout | `66730960cb815947a4fe7b00568859d505aaf6a6` |

Selection was fixed before rating: every Markdown path under `docs/internal/`
present at all three snapshots, excluding `README.md` and the TFE compatibility
matrix. This gives 85 documents. The fixed manual sample is all three overviews
in that cohort. The largest text increases were inspected separately to explain
growth; they are not a random sample of defects.

The parser removes frontmatter, fenced code, comments, headings, tables and
quoted blocks. It replaces inline code with a placeholder before counting
English words. These counts measure the remaining prose, not comprehension.

| Measurement | Early | Middle | Late |
| --- | ---: | ---: | ---: |
| Matched documents | 85 | 85 | 85 |
| Prose words in those documents | 79,626 | 81,943 | 95,452 |
| Prose words excluding both API-reference documents | 76,081 | 78,388 | 80,665 |
| Occurrences of the fixed exploratory vocabulary list, all 85 documents | 35 | 35 | 35 |

Forty-five normalized prose bodies are identical between early and late. Thirty-six
documents gain words, three lose words and 46 retain the same count. Overall
growth is 19.9%; growth without the two API references is 6.0%. A single generated
backend reference accounts for 70.6% of the overall increase. Its endpoint
inventory expanded, so that increase is not evidence of more abstract wording
(`git diff 7d9fb3b2 66730960 -- docs/internal/api-reference/backend-api-reference.md`).

The fixed vocabulary list is in the evidence protocol. It includes words such as
orchestration, subsystem, comprehensive and contract. Flat counts do not prove
clarity, but they contradict a claim that these particular signals increased in
this cohort. The cohort omits new, moved and deleted documents; it cannot
characterize the whole project. The 45 identical bodies exclude inline-code
details, so they do not mean that every code reference stayed unchanged.

#### Cases checked against source and history

All current file locations below refer to the late snapshot unless another ref
is named.

| Case | What was observed | What it supports |
| --- | --- | --- |
| Repeated opening | `docs/internal/overviews/ansible.md:13-17` explains the combined Terraform/Ansible platform twice. The same wording already appears at `7d9fb3b2`. | There is prose to consolidate, but this example was already verbose at the early snapshot. It does not show gradual inflation. |
| Useful added detail | The runner overview grows from 123 to 410 counted prose words. The diff replaces a sample Dockerfile with actual build stages and explains the writable filesystem and collection search order. `runner-images/ansible/Dockerfile:64-99` and `backend/cmd/ansible-runner/ansible_cfg.go:108-136` support those operational details. | Some added complexity explains real behavior and should stay. The counted increase also reflects code being replaced by prose. |
| Contradictory corrections | `docs/internal/plans/features/terraform/workspace-run-ui-enhancement-plan.md:159-171` says `CreatedNode` was deleted, then says it is implemented but not rendered. At lines 145-151, completion labels coexist with missing features and tests. | Adding a correction without replacing obsolete claims leaves humans to reconstruct the truth. |
| A correction is itself false | The same plan at line 146 says `VerticalRunTimeline` was never built. Its 251-line implementation exists at `d5120773^`, and `d5120773` deletes it. | A confident maintenance note must be checked against history, just like the older text it corrects. |
| Readable but wrong example | `docs/internal/overviews/ansible-runner-overview.md:44-58` uses `BLPop` and `ansible:jobs`. The early implementation already uses `BRPop` and `ansible_jobs`; the current consumer uses `DequeueReliable`, acknowledgement and dead-letter handling (`backend/cmd/ansible-runner/main.go:476-498`). | Clear sentences and plausible snippets can still teach the wrong behavior. This error predates the sampled period. |
| Partly refreshed description | The overview names runtime user `iac` at line 255. The current Dockerfile creates and selects `stackweaver` at lines 80-83; UID 1001 remains the same. | Refreshing one paragraph does not establish the accuracy of adjacent claims. |
| Unused component designs | At `d5120773^`, references to `CreatedNode`, `PhaseConnectionLine` and `VerticalRunTimeline` occur only in their own source files. The next commit deletes them. | There was code with no other source caller immediately before deletion. This is not proof that it was never used throughout its history. |
| Surviving unused interface | `core/plugins/interface.go:18-24` declares the older plugin interface. Source searches find no qualified `plugins.Plugin` use and no production selector calls to `Plan`, `Apply`, `Destroy` or `Validate`. The runner calls concrete `PlanWithOptions` and `ApplyWithOptions`; `Plan` forwards to the options method (`core/plugins/opentofu/plugin.go:99-104`). | A proposed abstraction should name a real consumer. These searches and the existing dead-code analysis support reviewing this interface; they do not prove it is safe to delete. |
| Inputs carried without use | `UnifiedPhaseTimeline.tsx:35-54` explicitly discards three props. `RunDetail.tsx:574-579` still passes them. Its comment also describes a Created node absent from the current component tree. | An interface and its explanation can retain work that callers no longer need. No language-to-code causal link was established. |

The existing `docs/internal/analysis/dead-code-sweep-2026-10.md` was read as a
source observation, then the interface/caller claims above were checked directly.
The recent `saving-a-struct-loaded-before-a-long-step.md` is a counterexample to
the idea that all recent writing is abstract: it names the write, the rows it can
restore, the measured cases and the untested cases. Its repository `GetByID`
preloads and `Save` path were inspected; its database experiment was not rerun.

#### Executed checks and pilot rewrites

Twelve static source probes confirmed the recorded contradictions, old queue
example, caller patterns, discarded props and runtime-user mismatch. Their scope
is the source patterns recorded in the evidence, not runtime reachability or
proof of why the code was written.

Six existing `core/queue` tests were run with fresh temporary Go caches and
in-memory Redis: `TestDequeueReliable_MovesToProcessing`,
`TestAck_RemovesFromProcessing`, `TestDeadLetter_MovesPoisonAside`,
`TestRequeueProcessing_RecoversInFlight`,
`TestReclaim_RecoversOrphanedAndSkipsFresh`, and
`TestAck_ClearsInflightIndex`. All passed. No live Stackweaver service or database
was used. These tests confirm why removing the recovery and acknowledgement
details would lose meaningful behavior. The first sandboxed attempt could not
populate the dependency cache; the successful run used temporary caches and
downloaded the versions pinned by the module.

The existing audit was also executed:
`node scripts/docs-audit.js --churn --prune --json <temporary-report>`.
It reported 172 findings: 2 errors, 67 warnings and 103 informational findings,
plus 55 suppressions. Eighteen findings concern length. There are no findings
or suppressions for the runner overview or run UI plan above.
`scripts/docs-audit.js:634-647` flags length above 3,500 words. This run shows
that the existing structural checks do not cover the verified contradictions;
it does not establish that all 172 other findings are valid.

Two one-pass rewrites were written and checked by the investigating assistant:

| Passage | Whitespace-delimited words | Supported claims checked |
| --- | --- | --- |
| Repeated Ansible introduction | 51 to 12 | Three: Ansible support, Terraform workspaces, and which provides provisioning versus configuration management. |
| Collection installation paragraph | 70 to 51 | Seven: no separate image install, bundled package, version relationship, both version files, conditional per-job requirements install, search precedence, and both source symbols with their file paths. |

The shorter introduction reads: Stackweaver provisions infrastructure through
Terraform workspaces and manages configuration through Ansible automation.

A third worked example repairs the run UI contradictions using the deletion
commit and actual caller. It becomes longer than the short paraphrase of the
false claims. Correcting meaning sometimes needs more words. These are manual
worked examples, not independent model trials or a measured human benefit.

#### Recommendation and remaining hypotheses

Try a small advisory addition to the existing spec/review workflow before
building a new detector. Ask the reviewer to explain the behavior plainly,
identify a real consumer for a new abstraction, and replace obsolete current-state
claims wherever a correction changes them. A finding should name the passage,
the supporting code or caller, and a concrete correction. Keep history clearly
separate from the description of current behavior. Reference the existing prose
guide instead of creating a second writing policy.

The evidence supports piloting this review on changed documentation and new
interfaces. It does not support blocking on a word count, banning technical
terms, automatically deleting wrappers, or automatically consolidating the corpus.
Stackweaver already has scheduled auditing and a consolidation resolver
(`agents/docs-drift-audit.md`, `agents/docs-drift-resolver.md`); another scheduled
audit would duplicate existing machinery. The missing proof is whether a more
specific review instruction catches these failures reliably at acceptable cost.

Historical model identity, prompts, human steering and files read by agents are
unavailable from Git. Independent repeated-writing trials require additional
agent sessions; authorization has been requested and no such sessions have run.
Blind human comprehension testing has not run. The causal explanation and the
best safeguard therefore remain open. No acceptance criterion is marked met by
the investigating assistant, and no plugin or Stackweaver fix is included.

Raw measurements, source probes, worked rewrites, commands and test output are
retained in the local evidence bundle
`/private/tmp/vh-adlc-language-study-20261021.zip`. The smallest next decision is
whether to run the controlled trials, then assess a single advisory review
instruction before specifying enforcement.

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
- Local vh-adlc and Stackweaver measurements at the exact revisions listed in Context: available procedures, historical comparisons, source probes, manual rewrites and six queue tests. Independent model trials and human comprehension testing remain pending.
