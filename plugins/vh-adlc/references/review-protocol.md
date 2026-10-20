# Review protocol

## Independence

A review runs in a separate context: dispatch the `vh-adlc-reviewer` agent where the host can, read-only,
with the repository directory, the document path, the exact commit, the review kind, the resolved docs
revision, the binary path and the plugin pin. Where the host cannot dispatch it, write a self-contained
handoff the owner runs elsewhere and leave the review visibly pending: whenever no review is stored, the
report has a line that starts with the exact words `review pending`, followed by why. Self-review is never labelled
independent, whatever the model.

The target is an exact commit. A completion-eligible implementation review runs against committed state in
the feature's owning worktree with `feature_tree_clean` true. An uncommitted diagnostic review is recorded
with a `+dirty` commit and never counts as current. The reviewer uses the host's existing worktree; it does
not create one.

## Models

Agent files name no model. Decide whether this dispatch has a requested model before comparing identities.
A missing or malformed `MODEL:` line leaves the review pending; never manufacture an `unknown` header.

### Default review outside Claude Code

On non-Claude-Code hosts, such as VS Code Local and Copilot, when the owner names no reviewer model,
do not pass a model override. Let the host inherit its configured session default. There is no
requested identity to compare.

The reviewer still returns a `MODEL:` header. Record the ID it reports, or record `unknown` when it
returns `MODEL: unknown`. In the latter case, report that model identity was not attested. Do not infer
the reviewer's ID from the main session's model picker or say that a model match was verified.

That explicit `unknown` header alone does not make an otherwise valid independent review pending.
Commit targeting, isolation, the returned records, `review check`, executed evidence and human
acceptance still apply. Do not apply the Claude Code default chain to these hosts.

If the host requires a concrete model override to dispatch, use the requested-model rules below.
An owner-named model always uses those rules, on every host.

### Requested model, including Claude Code defaults

On Claude Code, with no owner-named model, request `fable`. If the host rejects it or the owner
declines a usage-credit prompt, request `opus` and announce the fallback. Those are requested models
even though the owner did not name one. A model the owner names is passed as given, without a fallback;
if the host rejects it, leave the review pending and list what the host offers.

A host may silently run a different model. Compare the reviewer's `MODEL: <id>` with the model requested
for that dispatch. An alias matches any ID of its family (`sonnet` matches `claude-sonnet-5-5`), a full ID
must match exactly, and `MODEL: unknown` never matches a requested model.

- A match: record that line's model on the Review Log row.
- Claude Code's default pass ran on `opus` instead of `fable`: record that announced fallback.
- Claude Code's default pass ran on another model: dispatch again requesting `opus`. A mismatch on
  that second pass leaves the review pending.
- A named model that does not match, or an unverified Claude Code default pass: leave the review
  pending. Write no Review Log row and no `### R-<n>` subsection. Put the returned text, the reported
  identity and the available models in the handoff. An unknown identity never satisfies a named-model
  requirement.

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
