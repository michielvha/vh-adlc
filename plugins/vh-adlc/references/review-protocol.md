# Review protocol

## Independence

A review runs in a separate context: dispatch the `vh-adlc-reviewer` agent where the host can, read-only,
with the document path, the exact commit and the resolved docs revision. Where the host cannot dispatch it,
write a self-contained handoff the owner runs elsewhere and leave the review visibly pending. Self-review is
never labelled independent, whatever the model.

The target is an exact commit. A completion-eligible implementation review runs against committed state in
the feature's owning worktree with `feature_tree_clean` true. An uncommitted diagnostic review is recorded
with a `+dirty` commit and never counts as current. The reviewer uses the host's existing worktree; it does
not create one.

## Models

Choose the model when dispatching; agent files name none. On Claude Code an independent pass with no model
named runs on `fable`; if the host rejects it, or the owner declines a usage-credit prompt, run it on `opus`
and say so in the run. On other hosts use the model the owner names, or the session's model, and record
which. A model the owner names is passed as given with no fallback: if the host rejects it, the review stays
pending and the report lists what the host offers. The Review Log row records the model that ran, or
`unknown`.

## Isolation

Record isolation as `structural`, `procedural` or `unknown` on every review row. A tool allow-list counts as
structural only on a host verified to enforce it, and a shell grant can still write, so `procedural` is the
honest default. If the owner requires structural isolation and the host cannot give it, the review stops.

## Records

The reviewer returns records in the formats the feature-document standard defines in its Review log
section, at the resolved revision: complete finding records or the single `NO FINDINGS` for a spec review,
and one criterion record per current criterion for an implementation review. Store what it returned,
byte for byte, under `### R-<n>` before acting on any of it, then confirm with `review check`. Review IDs
continue from the highest one in the document.

After a spec review, apply factual findings, turn judgement findings into Open Questions for the owner
without answering them, and never relabel a blocking pass as clean: only a new independent pass clears it.
After an implementation review, untick every criterion it did not return as `met` and add an evidence line
naming the review and its verdict.
