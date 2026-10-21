---
status: draft
status_description: "Historical investigation and 96 controlled calls across Haiku and Opus completed; human comprehension testing, independent spec review and acceptance remain pending."
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

The owner selected Stackweaver as a long-running generated project. The initial
request covered a tracking issue and spec; follow-ups authorized the historical
investigation and controlled model trials. The eventual target is the custom
vh-adlc harness plugin. Implementation remains separate.

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

Track this work in vh-adlc, use Stackweaver as the example, and isolate the work
from the other active agent. After the draft, run the investigation and controlled
trials, including a stronger-model comparison requested after the Haiku pilot.
No implementation is authorized by this investigation.

### Investigation findings, 2026-10-21

The findings below cover the investigation authorized after the initial draft.

Stackweaver contains repeated explanations, contradictory current-state claims
and unused code abstractions. These deserve review. The historical sample does
not establish that agents progressively inflate language or that copied
terminology caused the unused code. The stronger-model comparison below also
weakens the case for a new plugin instruction based on the Haiku pilot alone.
The evidence does not justify a mandatory vocabulary or length check.

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

#### Controlled model trials

The owner authorized separate model sessions, then explicitly authorized sending
the selected private Stackweaver passages and supporting source excerpts to
GitHub Copilot. The first experiment ran 48 fresh sessions through the installed
Copilot CLI. Every response reported `claude-haiku-4.5`, the runner's default
model; no model override was supplied. The CLI reported version 1.0.56 through
an installed 1.0.54 launcher. This is a pilot on that model and harness.

Before execution, the protocol fixed six conditions, two repetitions per
condition and four rounds per repetition. Each response rewrote the same three
passages: queue handling, collection installation and the run timeline. Every
request received identical code excerpts at `66730960` and the same task. Each
inherited condition received the preceding round's text. The fresh control
received the original text every time. The full pinned prose guide was supplied
to the four guide conditions. Each additional instruction was tested separately.

All 48 calls completed. Verification confirmed the registered inputs and guide
placement, the same reported model, exactly one response per call, no tool calls,
disabled MCP servers and no reported file edits. The protocol fingerprint is
`b4e78c0646c32da92bcbce3e7c6d6622732e4ffa59f0be823f94d1d73c9ae679`.

The final 12 responses were assigned randomized labels and reviewed against the
source before revealing their conditions. The investigating assistant performed
that review. It is not an independent human comprehension test. The assessment
separates wrong assertions, missing details, unsupported historical claims and
missing source references.

| Condition | Mean words, round 1 | Mean words, round 4 | What changed |
| --- | ---: | ---: | --- |
| Minimal instruction, inherited text | 480.5 | 499 | One chain grew from 491 to 530 words; the other stayed near its starting length, 470 to 468. |
| Minimal instruction, original text each round | 431.5 | 372 | Fresh requests also varied considerably. |
| Existing prose guide, inherited text | 382.5 | 331.5 | Both chains ended shorter than they began. |
| Guide plus direct actor/action/conditions instruction | 470 | 313 | Both chains shortened; factual and precision problems still occurred. |
| Guide plus questioning abstractions and real consumers | 310.5 | 249 | Both chains shortened; one final queue explanation omitted ordinary-error handling. |
| Guide plus consolidation and replacement of obsolete claims | 404.5 | 316 | Both chains shortened; both final queue explanations invented retry behavior. |

Counts are whitespace-delimited words across the three passages, averaged over
two repetitions. Longer first-round text can add details missing from the seed;
it is not automatically worse. There are too few repetitions to rank safeguards
reliably. The first-to-last increase in one minimally instructed chain is a local
observation, not proof of the post's long-project explanation.

The clearest failure appeared in the consolidation condition. In both final
outputs, an ordinary handler error left a message available for retry. The code
instead logs that error and attempts acknowledgement
(`backend/cmd/ansible-runner/main.go:485-498`). In one chain this wrong claim
appeared in round 2 and persisted through round 4. The other chain already made
it in round 1 and kept it throughout. The same source code was available at
every round. This demonstrates an error being carried through repeated edits;
it does not establish that inheritance caused every observed error.

Three final responses still said `VerticalRunTimeline` was never built or
implemented, despite the supplied deletion evidence. These came from minimal
inheritance, the existing guide and the abstraction-review condition. Other
outputs invented completion or shipping history that the supplied observations
did not establish. Correcting repetition did not reliably correct the underlying
claim.

Collection explanations often flattened a conditional rule into a list. The
actual base search path comes from the environment, otherwise configuration,
otherwise defaults. These are alternatives, not three paths always appended
together (`ansible_cfg.go:147-191`). One output also claimed that a repository
without requirements uses only bundled collections; the supplied source says
such a job keeps its existing environment and configuration. Some queue text
also described claim-time indexing as simultaneous with receipt, although the
source explicitly records the index afterward on a best-effort basis.

The existing guide reduced length in this pilot. The extra instructions showed
no consistent accuracy benefit over that guide. These observations support
checking source facts and their conditions before accepting a simplification.
None of the tested instructions is a validated safeguard against long-term
language drift.

The main limits are one small model, two chains per condition, four rounds,
short text tasks and source excerpts supplied on every request. The harness's
default system context and constant skill metadata remained; custom project
instructions were disabled. Temperature, sampling seed and reasoning settings
were not overridden. No code-generation experiment or human comprehension
test ran. The CLI exposed 15.84 premium-request units for the 48 calls, not a
dollar cost or input/output token counts. Prompts, outputs, byte counts and usage
records are retained for inspection.

The native Claude preflight hit its account spend limit and generated no study
output. A Codex preflight did not establish an empty tool surface and was
excluded. Neither preflight contributes to the 48-call results. No trial was
discarded or rerun to favor a condition.

#### Stronger-model comparison

After the owner questioned Haiku's suitability, the same 48-call protocol ran
with an explicit `--model claude-opus-4.8`. A probe and every trial response
reported that model. Task, source excerpts, seeds, guide, conditions, schedule
and four-round chains matched the Haiku protocol. Only the requested model
changed in the runner arguments. This compares two models in one harness;
it does not establish a general model ranking.

All 48 calls produced the three requested passages, without tools or reported
file edits. One response added a preamble before its JSON, stopping the strict
parser. Its JSON was extracted verbatim, the format violation retained, and
the two unexecuted rounds continued. No model call was rerun or discarded.
The same 11 verification checks passed. The protocol fingerprint is
`70cce14778d0fd550dcd343f8f1663dc5cf28fb2cbf48691d5a73e836686513d`.
Final responses received new randomized labels and the same source-based
assessment before their condition key was opened. This remains an assessment
by the investigating assistant, not an independent reader study.

| Condition | Haiku mean words, round 1 to 4 | Opus mean words, round 1 to 4 |
| --- | ---: | ---: |
| Minimal instruction, inherited text | 480.5 to 499 | 1,015.5 to 1,032.5 |
| Minimal instruction, original text each round | 431.5 to 372 | 1,092 to 1,016.5 |
| Existing prose guide | 382.5 to 331.5 | 645.5 to 673.5 |
| Guide plus direct behavior instruction | 470 to 313 | 713 to 712 |
| Guide plus questioning abstractions | 310.5 to 249 | 669.5 to 646.5 |
| Guide plus consolidation | 404.5 to 316 | 676 to 647.5 |

Opus was longer and preserved more source details. All 12 final responses
correctly described ordinary-error acknowledgement, treated the deleted
timeline components as having existed, and retained the environment/configuration/
default fallback alternatives. Haiku's two invented-retry explanations and
three never-built claims did not recur. Both source function names and their
file paths also survived in all 12 Opus collection explanations. These are
specific findings, not a validated overall accuracy score.

Errors remained. Five final queue explanations said a crash between `BLMOVE`
and acknowledgement leaves an in-flight index entry, without preserving the
best-effort write gap. Another described indexing as the same step as the move,
then acknowledged the gap later. Other outputs explained the gap but could
state the index requirement for cross-consumer recovery more clearly. Several
timeline explanations still extrapolated replacement history, intent or
never-used claims from the limited deletion-parent evidence. Both
abstraction-review finals explained the index gap; neither existing-guide final
did. The fresh controls also explained it. That is a candidate benefit to
recheck, with too few repetitions to distinguish the instruction's effect from
variation between responses. The extra instructions showed no consistent
advantage as a group.

The minimally instructed inherited chains stayed at 1,016 words throughout,
or rose once from 1,015 to 1,049 and stayed there. This gives no convincing
evidence of continuing growth over four rounds. Fresh controls also varied.
Length and terminology counts cannot decide whether these longer explanations
are harder for a person to understand. The same short-task and missing human
comprehension limits apply. Opus used 48 reported premium-request units,
compared with Haiku's 15.84; these are CLI usage units, not dollar prices.

#### Recommendation and remaining hypotheses

Keep the existing prose guide. The Opus results weaken the earlier recommendation
to add a plugin instruction based on the Haiku pilot: the clearest Haiku failures
did not recur, and the extra instructions showed no consistent factual benefit
over the guide. None of the tested instructions has earned implementation as a
preventive safeguard from this evidence.

The historical contradictions still justify reviewing documentation against its
code. A useful review finding names the passage, supporting code or caller,
and a concrete correction. Keep historical claims within the revisions examined.
The evidence does not support blocking on a word count, banning technical
terms, automatically deleting wrappers, or automatically consolidating the corpus.
Stackweaver already has scheduled auditing and a consolidation resolver
(`agents/docs-drift-audit.md`, `agents/docs-drift-resolver.md`); another scheduled
audit would duplicate existing machinery. The missing proof is whether a more
specific review instruction catches these failures reliably at acceptable cost.

Historical model identity, prompts, human steering and files read by agents are
unavailable from Git. Both controlled pilots are now complete. Blind human
comprehension testing has not run. The causal explanation and the best safeguard
therefore remain open. No acceptance criterion is marked met by the investigating
assistant, and no plugin or Stackweaver fix is included.

If this investigation continues, test realistic longer edits and human
understanding with a capable model before choosing a plugin change. A candidate
review could ask an editor to retain a short list of source-backed
behavioral facts, check failure conditions and fallback alternatives, and limit
history claims to the revisions actually examined. It should then apply the
existing prose guide. This candidate has not been tested here. A new blocking
check or a claim that this prevents drift would exceed the evidence.

Raw measurements, source probes, worked rewrites, commands and test output are
retained in the local evidence bundle
`/private/tmp/vh-adlc-language-study-20261021.zip`. The controlled trial protocol,
all 48 prompts and outputs, verification and grading records are retained in
`/private/tmp/vh-adlc-language-trials-20261021.zip`. The matched Opus protocol,
48 prompts and outputs, format-recovery record, comparison and assessments are
in `/private/tmp/vh-adlc-language-opus-trials-20261021.zip`. The smallest next
decision is whether a longer edit and human comprehension test is worth running.
Raw private excerpts remain in the local evidence bundles; this report publishes
the measurements and findings.

## Scope

The later investigation examines Stackweaver documentation, available agent
explanations and the code behind selected behaviors. It compares history and
tests candidate safeguards in disposable copies. It records findings and the
recommended next step in this document.

The investigation includes historical measurements and controlled documentation
trials. A Stackweaver cleanup, production code changes, plugin changes, new
mandatory checks and releases remain outside its scope. The investigation does
not establish a general causal claim about all models or all generated software.

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
The owner authorized model calls after the initial draft; the findings record
the completed protocol separately from this proposed method.

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

No implementation tasks. This document records an investigation; independent
spec review and owner acceptance remain pending.

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
- Local vh-adlc and Stackweaver measurements at the exact revisions listed in Context: available procedures, historical comparisons, source probes, manual rewrites and six queue tests.
- Installed `copilot --help`, `copilot help permissions` and `copilot help config`: tool filtering, non-interactive controls and explicit model selection. The local trial bundles contain both protocols, all 96 prompts and responses, usage and source-based assessments. Human comprehension testing remains pending.
- [GitHub Copilot supported models](https://docs.github.com/en/copilot/reference/ai-models/supported-models), consulted 2026-10-21: model availability reference; the installed CLI and account probe verified the actual Opus model used.
- [OpenAI configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference): consulted while checking command execution and instruction controls for the excluded Codex preflight. The actual trials used Copilot.
