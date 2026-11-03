# Audit settings and project policy

The consumer owns `.vh-adlc/audit.yaml`, its existing Markdown ledger and its project procedure.
Use the complete files under `examples/audit/basic/` for a new adopter. Create and adapt those files;
do not assume the user has another host's configuration. An explicit audit request without settings
gets these paths and a setup handoff. Merely invoking status does not create them.

```yaml
# Audit settings for a TypeScript project; adapt paths and declared pages.
schema_version: 1
repository: example/project
hostname: github.com
ledger_path: docs/audit.md
project_procedure: audit-project.md
id_prefix: AUD
knowledge_pages:
  - conventions/typescript.md
profile:
  name: markdown-audit-v1
  index_heading: Severity index
  finding_level: 3
```

## Explicit setup and offline entry

Audit requires plugin 0.8.0+, Bun 1.4+ and Git. First obtain the verified locked `vh-adlc` binary
with `bash <plugin>/scripts/ensure-vh-adlc.sh`. This explicit setup may download into the private
binary cache. Create the YAML, ledger and project procedure using the complete example. Remove
alternate `.json` or `.yml` audit settings; they fail closed even with an explicit YAML path.

Read `bun <plugin>/scripts/audit/cli.ts settings --repo <checkout>` for the normalized
`knowledge_pages`. The effective list contains feature-documents, coding, documentation, delivery
and humanize-prose, followed by the additional pages in declared order. Declare every locally
required language page before setup: this TypeScript example adds TypeScript; a Go/React project
must declare its own applicable pages. Setup must compare that list with the repository's pinned
instruction obligations and stop on a mismatch. Invocation never guesses languages or drops pages.
Unknown, duplicate, absolute, URL, traversal or non-Markdown page paths are invalid.

Resolve the entire normalized list with an explicit online `vh-adlc knowledge --repo <checkout>
--plugin-pin <knowledge.md pin> --page <path> ...` setup call. Retain its resolved revision and page
list; every page must be available in the caller's docs cache at that revision. A copied binary
alone does not prepare the docs cache. Stop setup if any required page is missing.

The portable setup executor is `bun <plugin>/scripts/audit/bootstrap.ts --setup --repo <checkout>
--plugin-pin <knowledge.md pin> --required-page conventions/typescript.md`. Supply one `--required-page`
for each applicable obligation read from local instructions. It rejects a page absent from the YAML
before resolving the declared set. Use `--offline` instead of `--setup` for ordinary entry.

Every later audit entry, including status and lifecycle intake, uses `ensure-vh-adlc.sh --offline`,
reads only this validated metadata, then runs `vh-adlc knowledge --offline` for that exact page set.
A missing binary or incomplete docs cache gives a prerequisite handoff before any audit work;
run explicit setup separately. Entry never retries online. Settings reads themselves download
nothing and create no audit artifacts, ledger, journal, worktree or permission.

Reader failures stay distinct: `settings-reader-unavailable` means the locked verified binary is
unavailable; `settings-reader-refused` means YAML was refused without disclosing its content.
Candidate/adopted inspections report `settings-link-stale` for a stale instruction link and
`settings-suffix-conflict` for a committed alternate suffix. They validate the complete schema and
same-commit files, comparing exact working/committed YAML bytes and values. Neither failure grants an action.

Identity comes from origin. Optional repository/hostname values must match it; a nonstandard host
must be explicit. Paths must name existing regular files contained in the checkout. Unknown keys,
profiles, traversal, Git metadata and symlink escapes are errors. The prefix uses uppercase letters
and digits; it is not hardcoded to AUD. Heading level is 2 through 6.
An HTTPS login prefix equal to the public repository owner identifies the same origin without
changing Git's configured transport. Other userinfo, passwords and query/fragment values are refused;
no transport username or credential becomes a report field or an effect grant.

The supported profile preserves an existing ID/severity/status table, or an ID/Sev/Area/Title table
whose historical status annotations are in the title. The designated index heading must be unique.
An ID at the start of a finding heading identifies that finding. Other IDs in prose, code, comments
and secondary heading text reserve allocation space but do not create findings. Allocate beyond all
references; never trust an old next-free hint. Compressed ranges reserve every member and expose
missing per-member evidence. Duplicates, missing entries, unknown states and unsafe ID allocation
remain visible gaps. Historical FIXED/emoji counts are never current verification.

## Optional standing effects

A generic adopter has no standing live or remote permission. For an adopted rule, committed default
AGENTS.md must link to `.vh-adlc/audit.yaml`; that committed settings file names this project procedure.
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

## Inspecting candidate and adopted policy

`bun <plugin>/scripts/audit/cli.ts policy-candidate --repo <checkout> --default-branch main --commit <full-commit> --parity <consumer-parity.json>`
checks exact committed AGENTS/settings/procedure/parity objects, current remote default identity, the proposed declaration and fragment pointers. Dirty policy bytes cannot stand in for that commit. The parity argument is optional for generic consumers; migration receipts bind their actual map. The emitted commit/blob/effect bindings must match adoption preflight. It grants no effect.
After an authorized migration merge, run `policy-adopted --repo <checkout>` from the same helper.
It refreshes the actual remote default, follows committed AGENTS/settings/procedure, and reports all
resolved mode effects. Compare them with the consumer parity map; a mismatch blocks adoption.
This read-only inspection does not invent a selected fix request and never authorizes execution.
Current selection, restrictions and semantic gates still apply to each later action.

## Current request constraints

Current request JSON requires `authorized`, `mode` and `ids`. Optional keys are `workstream`,
`eligible_repair`, `effects`, `skip_ci`, `restrictions` and `prohibited_effects`; unknown keys fail closed.
Restriction tokens are `read-only`, `no-write`, `no-commit`, `no-push`, `no-merge` and `no-live`.
Prohibited effects use the declared effect vocabulary. Constraints from the current request and helper
options accumulate; neither a standing declaration nor explicit effects override them. Ledger apply
rejects a prohibited write/commit before refreshing refs or creating an owned branch/worktree.

## New-entry Markdown safety

New title/severity text is rendered as literal HTML text outside code spans. New bodies must keep
fences and comments balanced; put HTML examples in code spans or fenced code rather than raw tags.
The audit helper requires Bun 1.4+ and uses its Markdown renderer to establish which section
headings actually render, including single-line setext sections. New bodies cannot introduce a
rendered heading at or above the finding level. The renderer locates section boundaries. Index rows and insertion boundaries come from the renderer's actual tables under the supported
leading-pipe profile. Pipe-shaped prose remains a reference. Raw HTML and comments in the index
make identities and allocation unavailable. Existing inline angle placeholders outside that index
retain their original bytes; new bodies/section notes still require raw HTML examples inside code. The helper
re-inventories the complete output under those same supported-profile checks. Original identities, heading/index classes and unselected rows must remain visible; each
new ID needs one visible OPEN index row and finding entry. An unbalanced existing ledger remains
inspectable as a gap, but canonical updates wait for explicit reconciliation rather than rewriting it.


Raw HTML blocks, container-nested comments and unsupported multiline setext section titles
are explicit inventory gaps. Status and private reporting remain available, while terminal verdicts,
new IDs and canonical ledger updates wait for reconciliation. No format rewrite is performed. Use
ATX finding headings for this profile; supported single-line setext section boundaries retain their
original lines. Fence info-string and inline-comment handling follow the renderer, rather than
hiding a heading merely because it looks like code or a comment to a line scanner.


## Optional existing-ledger layout

The same `markdown-audit-v1` profile can declare `severity_sections` as an object mapping each
severity label to an existing section heading, `required_index_columns` as extra index headers
that every new entry must fill, `workstream_heading` as the existing membership section, and
`section_note_headings` as the exact existing sections allowed to receive checked dated updates.
These are literal layout names, never commands or a new storage format. All declared sections
must resolve uniquely at proposal time; severity sections must contain the configured finding level.

A new-finding object may include `index_cells` for extra non-reserved index headers and `workstream`
for its explicit membership key. Required cells and configured workstream assignment cannot be
omitted. Core ID/severity/status/title cells cannot be overridden. Without these optional layout
settings, the minimal standalone profile keeps its existing behavior.

Candidate input can provide `--section-notes <json>`: an array of `{heading, ids, text, evidence}`.
Each evidence item is a real private `{path,sha256}` artifact; IDs must belong to the selected/new
scope. An empty ID list is allowed only for assessment-mode coverage observations. Updates go
inside declared existing sections, retaining prior prose as history with the current source/run
binding. They cannot introduce an equal/ancestor heading, raw HTML or an unclosed block. Rebuilding
a candidate revalidates the same section updates and evidence; editing only its bytes cannot pass.
A source evidence item may supply `line`; it must name a nonempty line in the same hash-bound
current file. The dated note records that location without rewriting old historical references.


For reverify/full, ledgers with the established "How this audit was performed" dated layout keep
inline history only for changed statuses. OPEN observed as STILL_PRESENT is unchanged. Current
unchanged findings stay in the pass summary with its source/Scope baseline; partial/unknown summary
observations include residuals. A selected fix writes a per-finding evidence note for every selected
member, including unchanged statuses, because it has no pass summary. Its note retains the run,
Scope baseline and Verified source without adding an unchanged index/status annotation. The minimal
standalone layout keeps per-finding notes. Existing headings remain unchanged.

Comments or raw HTML within the declared index section remain unsupported, including multiline
inline forms. Although rows come from rendered tables, this profile conservatively invalidates
terminal eligibility and next-ID allocation for that index until explicit reconciliation.
Literal examples inside code fences/spans do not trigger this restriction.
