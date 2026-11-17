# Documentation drift setup and adoption

## Greenfield setup

Install the shared `vh-adlc` plugin through the harness's ordinary marketplace
installation and install the configured native clients through their normal
installation paths. Create `.vh-adlc/docs-drift.yaml`, the scanner protocol
entry and the project procedure from the complete example under
`examples/docs-drift/basic/`. Set the consumer's actual repository, scanner,
workflow and credential-reference names before provider execution.

Use `schema_version: 2` and `protocol_version: 1`. Settings are strict YAML at
that exact filename. Committed-source reads use raw Git blobs and retain their
original hashes. Unknown fields, malformed values and missing setup leave a
setup handoff. Credential values belong in the consumer's existing secret
stores. Choose a private external run directory for each operation.

| Settings | Consumer choices |
| --- | --- |
| `repository`, `hostname`, `default_branch` | Actual assessment and publication destination. |
| `roots`, `exclusions`, `suffixes` | Tracked documentation inventory and explicit exclusions. |
| `required_detectors`, `detector_inputs`, `detector_options` | Unique local detector IDs, declarative input selectors and detector-specific options. |
| `feedback_files`, `project_procedure` | Suppression/correction stores and project instructions. |
| `scanner` | Argument vector, script, optional adapter and timeout. |
| `verification_commands`, `generation_commands` | Allowed project verification and generator vectors. |
| `read_set` | Source/reference prefixes. Omitted bounds retain the full tracked repository. |
| `component` | Released plugin version, full source commit and complete component fingerprint, or `null` while setting up static collection. |
| `clients`, `execution.entries` | Ordinary executable commands and separately configured worker/reviewer models for each named profile. |
| `credential_references` | Names of role credentials that may be inherited. |
| `pr_discovery`, `legacy_proposals` | Repository/base, configured authors, branch namespaces and selected legacy proposal IDs. |
| `publication` | Publisher, staged/adopted mode, checklist path, draft policy, disjoint branch/lease/receipt namespaces, resolution root and allowed merge methods. Closure is `after-merge`. |
| `reports` | Workflow identity, artifact naming, age/count/archive/entry bounds and interactive history policy. |
| `execution` | Optional workflow/command paths, runner, permissions and secret-reference mappings retained by the consumer. |
| `knowledge_pages` | Project/language pages in addition to the required shared knowledge. |
| Optional `trial` | Original committed trial definition path and exact digest. |

The scanner receives canonical bindings through `--protocol-bindings` and
writes versioned output through `--protocol-json` in owned external locations.
Its ordinary invocation retains its existing behavior. Collection accounts for
all expected document blobs and every required detector's applicable inputs
and outcome. Thresholds, exceptions and structural rules belong to the consumer.

Scanner and verification processes receive the fixed credential-free execution
environment and hardened Git controls. Their outputs are checked against the
committed inventory and source. Preserve the owner's home, credentials and
other checkouts. Additional detector access follows its explicitly selected
execution-change procedure and trial.

## Native profiles and installed identity

Choose local profile names such as `interactive` independently of the agent harness.
The reserved `hosted` profile selects GitHub Actions production publication,
effect-executing closure and their original resume paths. It requires
`GITHUB_ACTIONS=true`, `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`. Configure the
actual non-null `reports.workflow_id` and `reports.workflow_path` before hosted
production effects. The native run must match that workflow, the assessed source
commit, repository and attempt, with an active schedule or manual execution.
Other profiles are local and refuse Actions production effects.

Each role selects a client ID, model and allowed arguments. Copilot and Claude are the supported native role
backends. Their original native streams must establish the actual full model,
fresh context and successful final reply. Missing tools, capabilities or model
identity leave setup/review pending.

Declare executable commands in `clients`. The runtime uses the clients' normal
authentication paths and inherits only explicitly named role credentials.
Install and authenticate them separately through their owning tools.

`component` binds `plugin_version`, `source_commit` and `component_sha256`.
The runtime checks the installed plugin's complete regular-file inventory,
executable modes and bytes once per invocation. Each new invocation verifies
its inputs again. An installed payload that differs from the binding leaves
provider execution and remote effects at setup-required. Static collection and
its diagnostic report remain available. Bun's exact version is diagnostic for
ordinary version-two operations. Required execution capabilities still apply.

Use `publication.actor` for one account, or declare every configured profile
in `publication.entry_actors`. Include each publisher in `pr_discovery.authors`
and include its branch namespace in discovery. The runtime reads the native
account's login and numeric ID. Login comparisons accept case changes while
preserving original evidence bytes. A changed account ID or material login
requires fresh selection and evidence.

Read `references/docs-drift-review.md` for scoped approval and original-run
recovery. The selected client, worker and reviewer retain separate original
invocations and targets. Runtime hashes and checklists carry owner attestations
and retained-byte integrity.

## Reports and history

Eligible hosted history uses native repository, workflow, run, attempt, jobs
and artifact observations. Preserve the configured scheduled triggers and manual
dispatch. Require complete provenance and completed collection. A verified
`new-attention` report can supply prior attention even when its workflow exits
nonzero. Cancelled, incomplete and technical-failure runs leave history gaps.

Interactive history selects `actions`, `local-attestation` or `none`.
Local attestation requires declared private history roots. Preserve its weaker
provenance in the report. Age/count limits govern eligibility and leave saved
records on disk. Interrupted and completed records remain available for their
linked recovery needs. Terminal receipt refs are retained indefinitely.
The helper collects history itself. New settings omit `history_reader_argv`.
Older source records preserve that unused field when read.
Version-one history attribution requires its original implementation. Its plans
and receipts retain structural inspection and the original-execution handoff.

For hosted jobs, keep checkout credential persistence disabled and collection
credential-free. Expose each role credential only to its owning step. Preserve
the bounded report/provenance pair and human summary before applying the final
attention exit. Keep runner, permissions, secret mapping and artifact retention
in the consumer workflow.

## Staged adoption and upgrades

Start with `publication.mode: staged`. Keep the consumer's existing routes
active while validating the replacement. A declared synthetic trial uses its
isolated fixture paths and branch/lease/receipt namespace. Native trials bind
the original definition, component, workflow, event, head, run, attempt and
credential-selected publisher. Collector trials retain their hermetic fixture
binding. Test actual installed native roles and unattended execution separately
from fixture coverage.

Prepare candidate C, then a flat preflight checklist naming the released
component, exact consumer candidate, proposed activation diff and review target.
Record applicable installation, routing, scanner parity, native trials,
paired review and rollback evidence. Every configured native profile needs
its actual observed models and publisher identity. The reviewed activation D
is C's direct child and changes only its declared activation files plus the
checklist. Production requires the adopted settings and a matching checklist.

Read original evidence during adoption. The portable checklist records those
observed targets as owner attestations. Each remote effect retains its separate
current approval and live checks. Keep missing acceptance visible and preserve
the existing route until the replacement has passed its required checks.

Classify upgrades using the affected component, procedure/report, scanner,
execution, recovery, workflow and native-entry rows in the preflight helper.
Repeat their applicable checks and paired review. Preserve original run policy,
roles, approvals and receipts across upgrades and rollback. Use the recovery
handoff when an older original implementation is required.
