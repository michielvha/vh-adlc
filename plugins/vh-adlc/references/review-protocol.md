# Review protocol

## Routes

Before dispatching, read the reviewer role's route:
`bun scripts/loop/cli.ts route --repo <dir> --operation "spec review"` for a spec review, or
`--operation review` for an implementation review. Its JSON names the role, the route and any model.

- A `host` route uses the procedure below. A model the route names counts as a requested model.
- A `command` route runs `bun scripts/loop/cli.ts review --repo <dir> --document <doc> --commit <X>
  --kind <spec|implementation> --docs-revision <sha> --binary <path> --plugin-pin <pin>`. It runs the
  configured CLI with the canonical reviewer instructions and the dispatch identity, as
  `references/loop-settings.md` describes: a spec review reads a read-only export of X and is launched
  from it; an implementation review runs in a private clone of X. Afterwards the clone, and the owning
  worktree's files, index, HEAD and branch, must be unchanged outside `review_scratch`. A route with `model_attestation: codex-session` takes the served model from
  Codex's own session log, so a `MODEL: unknown` self-report is accepted only when that attested model
  matches the request. Its JSON `status` is `ready` or `pending`. On `ready`, store its `records`
  under `### R-<n>` with a Review Log row naming its `model` and isolation `procedural`, then run
  `review check` against the same text. On `pending`, store nothing and report a line that starts with
  `review pending`, followed by its `reason`, with the raw `reply` in the handoff.

## Independence

A review runs in a separate context. Prefer the registered `vh-adlc-reviewer` agent. If the host does not
register that agent but supports a generic independent subagent, dispatch one with
`agents/vh-adlc-reviewer.agent.md` as its instructions. Have it read that canonical file and follow its
body; frontmatter tool names do not grant or restrict a generic subagent's tools. Request read-only
access where the host supports it. Do not copy or translate the reviewer into a host-specific file.
If that canonical file cannot be read, leave the review pending rather than invent its instructions.

Both routes receive the repository directory, document path, exact commit, review kind, resolved docs
revision, verified binary path and plugin pin. A dispatch never tells the reviewer to skip a check or to
judge from stored results instead of running it. Neither route creates or switches a worktree. If the
host has neither independent route, or dispatch fails, write a self-contained
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

### Default review on every host

When the owner names no reviewer model, do not pass a model override. Let the host inherit its configured
default on every host, including Codex, Claude Code and Copilot. There is no requested identity to compare.

The reviewer still returns a `MODEL:` header. Record the ID it reports, or record `unknown` when it
returns `MODEL: unknown`. In the latter case, report that model identity was not attested. Do not infer
the reviewer's ID from the main session's model picker or say that a model match was verified.

That explicit `unknown` header alone does not make an otherwise valid independent review pending.
Commit targeting, isolation, the returned records, `review check`, executed evidence and human
acceptance still apply.

If the host cannot dispatch without a concrete model override, leave the review pending and ask the
owner to choose from the models the host offers. Do not invent a default. An owner-named model always
uses the rules below, on every host.

### Requested model

A model the owner names is passed as given, without a fallback. If the host cannot pass it, rejects it,
or asks for usage credit the owner does not approve, leave the review pending and list what the host
offers. A host that cannot select models must not silently treat a named request as unnamed.

A host may silently run a different model. Compare the reviewer's `MODEL: <id>` with the model requested
for that dispatch. An alias matches any ID of its family (`sonnet` matches `claude-sonnet-5-5`), a full ID
must match exactly, and `MODEL: unknown` never matches a requested model.

- A match: record that line's model on the Review Log row.
- A named model that does not match: leave the review
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

After a spec review, apply the pass's findings as one revision as the spec skill's review mode says: turn
judgement findings into Open Questions for the owner without answering them, except the nits the nit rule covers
when the resolved convention states it, and never relabel a blocking pass as clean: only a new independent
pass clears it.
After an implementation review, untick every criterion it did not return as `met` and add an evidence line
naming the review and its verdict.
