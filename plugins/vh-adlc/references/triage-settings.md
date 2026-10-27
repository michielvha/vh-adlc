# Triage repository settings

The canonical validator and types live in `scripts/triage/settings.ts` and
`scripts/triage/types.ts`. Runtime helpers require Bun; GitHub CLI is needed only
for the CLI adapter. A host can supply equivalent structured connector data.

Create `.vh-adlc/triage.json` when a project needs its own scope or ownership rules.
Use schema version 1. Paths are relative to the selected checkout and cannot escape
through parent segments or symlinks. The selected origin determines repository and
hostname; optional configured identity must agree with it. No account is switched.

```json
{
  "schema_version": 1,
  "repository": "example/project",
  "source_roots": ["src"],
  "generated_mirrors": ["generated"],
  "plan_roots": ["plans"],
  "report_dir": ".vh-adlc/reports/triage",
  "protected_ids": [],
  "index_ids": [],
  "index_rules": {"labels": ["tracking"], "title_prefixes": ["Milestone:"]},
  "bot_authors": [],
  "owned_labels": [],
  "priority_order": ["high", "medium", "low"],
  "milestone_order": [],
  "label_map": {},
  "stale_days": 90
}
```

`plan_fields` can map `issue`, `status`, `status_description` and `priority` to
different frontmatter keys. `page_budget` optionally bounds fetched pages; hitting
it makes collection incomplete. Omitting it imposes no configured page cap.
Unknown keys and schema versions fail before collection.

Without settings, source scope is the checkout, plan metadata and project mappings
are absent, stale age is 90 days, and reports/history use `.vh-adlc/reports/triage/`.
Loading settings creates no files. An explicitly requested missing file is an error.

Protected IDs, bot authors and owned labels exclude work from action proposals.
Index IDs and label/title rules identify umbrella work that needs the current
owner-request exception. The agent must also inspect issue purpose: a newly opened
index remains protected even when no rule or ID matches. Completed child items
alone do not establish that the index should close.

Settings contain data only. Put verification commands in repository instructions
and provide credentials through the host's existing account access.

`workstreams` adds hard ownership from repository-local data. Each rule has an
`owner` and nonempty `plan_roots` or `reference_files` arrays. Plan roots extract
the configured issue field from tracked Markdown frontmatter. Reference files
also assign bare local `#N` references and local GitHub issue URLs to that owner;
choose files whose references belong to that workflow. Foreign issue URLs do not
assign local ownership. Source files remain in the consuming repository.

Declared sources must be tracked, present and committed. Missing sources, edits,
untracked additions or invalid issue metadata block the run. Derived source hashes
and issue ownership are included in normalized settings and rechecked before
effects. Such work never receives an umbrella exception, and triage cannot patch
plans belonging to another configured workstream. Agent-observed ownership adds
conservative exclusions; omitting it never removes these configured protections.
