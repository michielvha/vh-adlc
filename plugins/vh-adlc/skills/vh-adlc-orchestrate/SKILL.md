---
name: vh-adlc-orchestrate
description: Drive many sub-sessions across a workstream, one per issue or feature, with the vh-adlc admission, status-pass, communication and close-out rules. Use when a session is asked to orchestrate or coordinate a workstream of sessions. It changes no feature status; sub-sessions run their own operations. Generic vh-adlc requests use lifecycle intake.
---

# vh-adlc-orchestrate

## Generic intake

For generic vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here.

The plugin directory is two levels above this skill's own directory. Every path below that starts
with `references/` or `scripts/`, and `knowledge.md`, is in that directory.

Follow `references/loop.md` for every step it describes and `references/authority.md` for what you
may do without asking. The owner's request to orchestrate a workstream grants exactly the writes in
that table's orchestration row.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/delivery.md`,
   `conventions/feature-documents.md` and `guides/humanize-prose.md`. Report the one-line result and
   read the pages from the cache.
2. Run `bun scripts/loop/cli.ts context` and read every file it lists: the repository's instruction
   files and its project procedure, whose `## Orchestration` section sets this workstream's specifics.
   If its `plugin.stale` is true, follow the stale-orchestrator rule in `references/orchestrate.md`
   before anything else. If it reports `plugin.binary_warning`, run only the binary
   `scripts/ensure-vh-adlc.sh` prints, never a `vh-adlc` found on PATH.
3. Follow `references/orchestrate.md` for the whole workstream.

## Status

This operation changes no feature status. Sub-sessions change status through their own operations
and gates.

## Prose

Edit every brief, owner question, ledger entry and report with `guides/humanize-prose.md` at the
resolved revision.
