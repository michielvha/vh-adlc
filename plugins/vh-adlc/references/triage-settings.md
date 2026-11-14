# Triage repository settings

The canonical validator and types live in `scripts/triage/settings.ts` and
`scripts/triage/types.ts`; `scripts/settings-file.ts` reads the file. Runtime helpers
require Bun; GitHub CLI is needed only for the CLI adapter. Reading a settings file
also needs the verified `vh-adlc` binary, which `scripts/ensure-vh-adlc.sh` obtains;
with no settings file, no binary is needed. A host can supply equivalent structured
connector data.

Create `.vh-adlc/triage.yaml` when a project needs its own scope or ownership rules.
Write it as block YAML, with comments where they help, and use schema version 1.
The strict reader refuses anchors, aliases, merge keys, explicit tags, duplicate keys,
numbers other than safe decimal integers, and boolean or null spellings other than
`true`, `false` and `null`. Its error gives a fixed reason and, when known, the line,
never text from the file. A settings file under another suffix, such as `.json` or
`.yml`, fails and names `.vh-adlc/triage.yaml`; `--settings` takes only a path ending
in `.yaml`. Paths are relative to the selected checkout and cannot escape through
parent segments or symlinks. The selected origin determines repository and hostname;
optional configured identity must agree with it. No account is switched.

```yaml
# Triage settings. Paths are relative to the checkout.
schema_version: 1
repository: example/project
source_roots:
  - src
generated_mirrors:
  - generated
plan_roots:
  - plans
report_dir: .vh-adlc/reports/triage
protected_ids: []
index_ids: []
index_rules:
  labels:
    - tracking
  title_prefixes:
    - "Milestone:"
bot_authors: []
owned_labels: []
priority_order:
  - high
  - medium
  - low
milestone_order: []
label_map: {}
stale_days: 90
```

`plan_fields` can map `issue`, `status`, `status_description` and `priority` to
different frontmatter keys. `page_budget` optionally bounds fetched pages; hitting
it makes collection incomplete. Omitting it imposes no configured page cap.
Unknown keys and schema versions fail before collection.

Without settings, source scope is the checkout, plan metadata and project mappings
are absent, stale age is 90 days, and reports/history use `.vh-adlc/reports/triage/`.
An explicitly requested missing file is an error.

`label_map` maps a standard label from `references/issues.md` to the name this
repository uses for it, for example `bug: defect`. Triage, investigate, spec and
the labels helper then use the mapped name, and the helper manages that label's
color and description, even when a bot created it. An entry keyed by a name outside
the standard set has no effect. The reader refuses a map in which two standard
labels end up with the same name, compared case-insensitively and counting unmapped
standard labels under their own names: `ready: blocked` and `bug: Enhancement` both
fail.

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
