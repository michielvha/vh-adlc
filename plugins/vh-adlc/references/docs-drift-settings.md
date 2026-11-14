# Documentation drift setup and adoption

## Greenfield consumer setup

Missing settings require an explicit setup handoff. Create the consumer's own
`.vh-adlc/docs-drift.yaml`, scanner protocol entry and project procedure from
its source and delivery rules. Use the complete examples under
`examples/docs-drift/` when available in the selected release. Resolve actual
client distributions, digests, repository/workflow identities and paths for
that consumer before execution. Keep credentials in its existing secret
provisioning system and runtime state in selected private external directories.

`scripts/docs-drift/settings.ts` owns the closed version-1 schema and semantic
validation. It uses the verified binary's shared strict YAML reader through
`scripts/settings-file.ts`. Committed assessment and current-default policy
read exact Git blob bytes and hash those bytes. The sole settings filename is
`.vh-adlc/docs-drift.yaml`. Unknown fields, alternate suffixes and malformed
values require correction in authorized setup. Dirty/candidate policy cannot
substitute for current-default adoption policy.

## Consumer contract

| Settings | Consumer choices |
| --- | --- |
| `schema_version`, `protocol_version` | Both are 1. |
| `repository`, `hostname`, `default_branch` | Actual assessment and publication destination. |
| `roots`, `exclusions`, `suffixes` | Tracked documentation inventory and explicit exclusions. |
| `required_detectors`, `detector_inputs`, `detector_options` | Nonempty unique local detector IDs, one declarative selector per ID and local options. Use `all_inventory` or a roots/exclusions/suffixes subset. |
| `feedback_files`, `project_procedure` | Exact retained feedback and project procedure paths. |
| `scanner` | Argument vector, script path, nullable adapter path and timeout. |
| `verification_commands`, `generation_commands` | Local allowed argument vectors. |
| `read_set` | Nullable source/reference prefix sets. Incomplete bounds default assessment to the full tracked repository. |
| `component_pin` | Staged nullable pin path. Adopted policy requires the exact component pin. |
| `pr_discovery`, `legacy_proposals` | Explicit repository/base, authors, branch namespaces and selected legacy IDs. |
| `publication` | Actor/destination, staged or adopted mode, adoption record, advisory/resolve draft state, disjoint branch/lease/receipt namespaces, resolution root and allowed merge methods. Closure is `after-merge`. |
| `reports` | Native Actions provenance, interactive history policy, matching scheduled workflow path/ID, artifact naming and bounded age/count/archive/entry limits. |
| `runtime_loader`, `clients`, `execution` | Approved isolated launcher, exact client distributions and roles for each entry. |
| `knowledge_pages` | Additional pinned project/language pages alongside the required shared pages. |
| Optional `trial` | Committed definition path and exact definition digest. |

The scanner receives canonical JSON bindings through `--protocol-bindings` and
writes versioned output through `--protocol-json`, both in owned external
locations. Its legacy invocation keeps its existing behavior. Collection must
account for each expected document's raw blob bytes and every required
detector's actual applicable inputs/outcome. Keep structural detector rules,
thresholds and exceptions local. The shared validator checks bindings,
inventories and completeness.

Collection uses the fixed runtime/locale/owned-output allowlist and hardened
Git controls. Strip ambient provider/publisher tokens, mapped job secrets,
credential URLs, askpass hooks and agent sockets. Disable credential helpers,
extraheaders and global/system credential configuration through trusted
controls. Preserve the owner's home and host credentials. This isolates ambient
credentials for trusted consumer code. A consumer needing detector secrets or
extra network access must go through the protected execution-change grant and
trial. Scanner execution stays repository-write-free, including feedback.

## Runtime and hosted entry

`runtime_loader` declares the launcher/provider, argument vector, literal
`{plugin_dir}` and `{profile_root}` templates and credential reference names.
Automatic updates and ambient discovery must both be false. Each client has a
fixed version/platform, credential-free HTTPS distribution URL and SHA-256.
Each of `hosted`, `copilot` and `claude` declares worker, independent reviewer
and publisher vectors. Worker/reviewer roles bind client, full model and native
identity-source event/field. Missing usable native identity leaves review pending.
No setting grants provider execution or publication.

Use a private retained cache outside caller repositories/Git directories.
The approved runtime verifies the retained complete component payload and client
before creating isolated entry profiles. Inspect the exact invoked launcher
and settings with the selected entry. Preserve the returned diagnostics.

```text
bun <plugin>/scripts/docs-drift/cli.ts inspect-runtime --repo <repo> --source <source> \
  --cache-root <cache> --entry <entry> --launcher <launcher> --settings <settings>
```

Hosted setup supplies the configured worker/scheduled workflow paths, runner,
permissions and secret-reference mappings. Actions access is read. Use checkout
with credential persistence disabled. Run collection in a credential-free step
before exposing role credentials in their required later steps. Use a separate
collection job if the provider setup cannot preserve that separation. Transfer
only bound outputs. Keep workflow/artifact upload, provider execution and any
trial effects within their selected grants. Report output uses the declared
existing run/repository destination. Upload only its bounded report/provenance
pair, with the human-readable report available separately as intended.

## History and retention

Hosted eligible history comes from bounded native run/job/artifact observations
for the configured repository, workflow, attempt and selected source. Require
complete verified provenance and recorded completed collection. A failed run
whose verified envelope records `new-attention` is eligible. Incomplete,
technical-failure, cancelled or missing-provenance runs cannot establish a
match. Interactive policy selects Actions,
explicit local attestation or none. `local-attestation` requires declared local
history roots. History is evidence used to identify already-carried attention.
Unchanged items remain visible in the new report.

Local invocation metadata lives in the explicitly selected private runtime cache.
`reports.max_runs` limits inspected saved report pairs and `max_age_seconds`
limits eligibility. Invocation-digest indexing is current, and older
timestamp-addressed records remain readable. Each metadata record is byte-bounded.
Completed records and interrupted `.pending-*` files remain until explicit
owned cleanup. Preserve them with journals, receipts and linked artifacts when
recovery still needs them. An age/count eligibility limit leaves saved evidence
on disk. Receipt retirement has its own exact-ref grant.

## Staged adoption and upgrades

Start with `publication.mode: staged`. It denies shared real-corpus effects.
Use the fixed installed synthetic entry and owned fixture definition under
its selected trial grant. Collector receipts establish fixture coverage.
Retain actual native installed-role and hosted advisory/history observations
separately. Keep legacy routes active until their required replacement evidence
and explicit cutover are observed. Test rollback while staged and preserve
legacy configuration needed to reverse the change.

Before adoption cutover D, the operator reads and hashes the original installed
artifacts and verifies payload, consumer, native-install/model targets and
results. Commit the approved portable adoption record with those bindings.
Runtime gates report owner attestation and use that committed portable record
without requiring the operator's private artifact directory on every host.
The record grants only effects explicitly adopted by the consumer procedure.

```text
bun <plugin>/scripts/docs-drift/cli.ts trial-bindings --repo <repo> --source <source>
```

After an upgrade, evaluate protected component/consumer execution, client/model
identity, secret mapping, lease and closure/supersession contract changes.
Use `check-upgrade-signals` and the recorded adoption bindings. Compatible
changes still need independent review and installed checks. Contract-changing
updates require their explicit trial/re-adoption. Ordinary scope, detector
options and feedback use normal freshness while preserving that contract.
Keep unavailable required acceptance visible and the corresponding legacy
route active until its actual replacement test passes.
