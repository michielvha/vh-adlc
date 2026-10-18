# Review protocol

## Independence

A review runs in a separate context: dispatch the `vh-adlc-reviewer` agent where the host can, read-only,
with the repository directory, the document path, the exact commit, the review kind, the resolved docs
revision, the binary path and the plugin pin. Where the host cannot dispatch it, write a self-contained
handoff the owner runs elsewhere and leave the review visibly pending. Self-review is never labelled
independent, whatever the model.

The target is an exact commit. A completion-eligible implementation review runs against committed state in
the feature's owning worktree with `feature_tree_clean` true. An uncommitted diagnostic review is recorded
with a `+dirty` commit and never counts as current. The reviewer uses the host's existing worktree; it does
not create one.

## Models

Choose the model when dispatching; agent files name none. On Claude Code an independent pass with no model
named runs on `fable`; if the host rejects it, or the owner declines a usage-credit prompt, run it on `opus`
and say so in the run. On other hosts use the model the owner names, or the session's model, and record
which. A model the owner names is passed as given with no fallback: if the host rejects it, the review stays
pending and the report lists what the host offers.

A host may run a subagent on another model than the one asked for, without saying so: Claude Code does
this when its settings refuse the requested model. So compare the model the reviewer's first line,
`MODEL: <id>`, names with the one you asked for. An alias matches any ID of its family (`sonnet` matches
`claude-sonnet-5-5`), a full ID must match exactly, and `MODEL: unknown` never matches.

- A match: record that line's model on the Review Log row.
- No model named, and the pass ran on `opus` instead of `fable`: that is the fallback above. Record `opus`
  and say so in the run.
- No model named, and the pass ran on any other model: dispatch again, naming `opus`. If that pass does
  not match either, treat it as below.
- A named model, or the second default pass, that does not match: the host refused it. The review stays
  pending. Write no Review Log row and no `### R-<n>` subsection, and put the returned text in the
  handoff, with the model that ran and the models the host offers, so the owner can run the review on
  the model asked for.

## Isolation

Record isolation as `structural`, `procedural` or `unknown` on every review row. A tool allow-list counts as
structural only on a host verified to enforce it, and a shell grant can still write, so `procedural` is the
honest default. If the owner requires structural isolation and the host cannot give it, the review stops.

## Records

The reviewer returns records in the formats the feature-document standard defines in its Review log
section, at the resolved revision, after its `MODEL:` line: complete finding records or the single
`NO FINDINGS` for a spec review, and one criterion record per current criterion for an implementation
review. Store what it returned after that line, byte for byte, under `### R-<n>` before acting on any of
it, then confirm with `review check` against the same text. Review IDs continue from the highest one in
the document.

After a spec review, apply factual findings, turn judgement findings into Open Questions for the owner
without answering them, and never relabel a blocking pass as clean: only a new independent pass clears it.
After an implementation review, untick every criterion it did not return as `met` and add an evidence line
naming the review and its verdict.
