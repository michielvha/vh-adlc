# Stackweaver triage entry

Invoke the installed shared `vh-adlc-triage` operation with this checkout and
`.vh-adlc/triage.json`. It owns collection, verification, report-first approval and execution.
Read its canonical procedure from the discovered plugin; do not resolve it from a personal checkout
or copy an old procedure into this repository. If the operation is missing or unavailable, stop with
an install/version blocker: install `vh-adlc` from the `vhco-tools` marketplace, then verify the
revision against `tests/agent-triage/README.md`. There is no legacy fallback.

Keep `CLAUDE.md` and local verification requirements. The shared operation inherits the host's model;
the Claude compatibility command retains its own pinned model. Pass the original arguments:
no argument/`sweep`, `next`, `close`, `stale`, or explicit issue numbers.

Project data and report rules:

- The settings retain plan roots, milestone/priority order, generated mirror exclusions, hard
  ownership and index IDs. Inspect unlisted index roles as the shared procedure requires.
- The local `workstreams` settings derive hard ownership from the canonical plan/issue-reference
  sources below, even when an observation omits `owned_by`. Bare issue references in a declared
  reference file are protected by that file's owner. Missing or uncommitted declared sources block
  triage rather than silently dropping exclusions. Keep these source files in Stackweaver.
- Read the audit ledger at `docs/internal/codebase-audit-2026-06-analysis.md`,
  `docs/internal/tfe-compatibility/` and `docs/internal/plans/features/RBAC_MASTER_PLAN.md`
  to identify other-owned work; keep those workflows and their work outside triage execution.
- Normal reports live in `docs/internal/status/`, with distinct run IDs. Preserve the shared `triage`
  metadata and add local frontmatter: `description`, `status: in-progress`, `status_description`,
  `author: "Michiel VH"`, `goal`, date fields and `covers` containing only the actual code/config
  areas inspected. A completed analysis is not completed implementation.
- Regenerate required report indexes with `scripts/build-docs-index.js`; never hand-edit a
  README Contents table. Review generated changes and retain only report-required index effects.
  This invokes the existing workflow; it changes no docs agent, scanner or hook.
- A live read-only trial saves externally through `--report-output` and reads normal history,
  leaving this checkout, settings, indexes and staging unchanged. Test normal placement/indexes
  in a disposable fixture instead.
- Reports remain uncommitted unless requested. Approved plan patches retain their separately shown
  local commit; use `docs(internal): sync plan statuses after issue triage [skip ci]` only for
  eligible internal plan paths. Preserve unrelated staging and all local lifecycle gates.

The migration baseline, intentional differences, parity/rollback checks and ordered publication
handoff live in `tests/agent-triage/README.md`. Dependency maintenance, audit, documentation,
TFE/provider-fork and the wider development loop remain local and deferred.
