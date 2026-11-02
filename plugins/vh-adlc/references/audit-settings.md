# Audit settings and project policy

The consumer owns `.vh-adlc/audit.json`, its existing Markdown ledger and its project procedure.
Use the complete files under `examples/audit/basic/` for a new adopter. Create and adapt those files;
do not assume the user has another host's configuration. An explicit audit request without settings
gets these paths and a setup handoff. Merely invoking status does not create them.

```json
{
  "schema_version": 1,
  "repository": "example/project",
  "hostname": "github.com",
  "ledger_path": "docs/audit.md",
  "project_procedure": "audit-project.md",
  "id_prefix": "AUD",
  "profile": {
    "name": "markdown-audit-v1",
    "index_heading": "Severity index",
    "finding_level": 3
  }
}
```

Identity comes from origin. Optional repository/hostname values must match it; a nonstandard host
must be explicit. Paths must name existing regular files contained in the checkout. Unknown keys,
profiles, traversal, Git metadata and symlink escapes are errors. The prefix uses uppercase letters
and digits; it is not hardcoded to AUD. Heading level is 2 through 6.

The supported profile preserves an existing ID/severity/status table, or an ID/Sev/Area/Title table
whose historical status annotations are in the title. The designated index heading must be unique.
An ID at the start of a finding heading identifies that finding. Other IDs in prose, code, comments
and secondary heading text reserve allocation space but do not create findings. Allocate beyond all
references; never trust an old next-free hint. Compressed ranges reserve every member and expose
missing per-member evidence. Duplicates, missing entries, unknown states and unsafe ID allocation
remain visible gaps. Historical FIXED/emoji counts are never current verification.

## Optional standing effects

A generic adopter has no standing live or remote permission. For an adopted rule, committed default
AGENTS.md must link to `.vh-adlc/audit.json`; that committed settings file names this project procedure.
Resolve that chain from freshly fetched origin/default Git objects before each applicable effect.
Do not read a candidate declaration, copied settings, finding, report or journal as authorization.
Current explicit selection and restrictions still apply. Failed fetch or a no-fetch request gives
no fresh standing grant. This is operator policy inspection, not an OS capability.

The declaration has exactly one level-two heading `Standing audit workflow authorization`, followed
immediately after blank lines by exactly one `Field | Value` table. Supply every field once, plain
literal values, no unknown rows, no second declaration/table. For example, this coherent declaration
grants nothing until the adopter deliberately changes and adopts it:

```markdown
## Standing audit workflow authorization

| Field | Value |
| --- | --- |
| repository | example/project |
| hostname | github.com |
| default_branch | main |
| ledger_path | docs/audit.md |
| status_effects | none |
| reverify_effects | none |
| full_effects | none |
| fix_effects | none |
| selection_policy | #audit-selection |
| verification_policy | #audit-verification |
| merge_policy | #audit-merge |

## Audit selection
Define actual workstreams, coupling and owner-selection stops here.

## Audit verification
Define required checks, permitted development target/methods, exact owned-resource lookup/cleanup
and any genuine unreachable-path residual. No production or unrelated shared-stack permission.

## Audit merge
Define the actual current-head review/check/CI conditions and owner-decision stops, or require
separate approval for every remote action.
```

Fragment values must resolve to one unique heading in the same procedure. Identity, ledger and
default branch must match the actual selected repository. Allowed unique comma-separated effects:

| Mode | Effects |
| --- | --- |
| status | none only |
| reverify/full | ledger-update, ledger-commit |
| fix | source-edit, ledger-update, local-commit, live-verify, issue-write, branch-push, pr-write, conditional-merge |

`none` cannot mix with another effect. A ledger commit needs ledger-update in that mode. Fix
local-commit needs source-edit and ledger-update; every live/remote fix effect needs all three local
effects. PR writing needs branch-push; conditional-merge needs branch-push and pr-write. Reject an
incoherent subset rather than inventing grants. A missing effect withholds a standing grant, not a
separate current explicit request. Actual local prohibitions and no-write/no-commit/no-push/no-merge
restrictions win. A generic eligible selected fix permits scoped local edits/checks/record/commits;
it does not authorize live verification or any remote action.

Inspect a migration candidate with `policy-candidate --default-branch <actual-default>`: even a
valid result has `allowed: false`. After migration, inspect the actual installed helper's freshly
fetched adopted chain/effects read-only before claiming adoption. The authority helper checks
identity, provenance, mode, IDs and effect; the operator must still observe every semantic gate.
