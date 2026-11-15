# Greenfield documentation drift example

Copy `basic/` into a disposable Git repository and commit it. Its complete
version-2 settings run an actual local-link scanner through the shared helper.
The repository starts staged. Its model is a placeholder and its component
binding is unset. Collection uses no provider credentials.

Install Bun 1.4.4, Node, Git and Bash. Acquire the verified binary through the
installed plugin's `scripts/ensure-vh-adlc.sh`, then resolve the knowledge pages
listed in `references/docs-drift.md`. Choose a private external artifact
directory, create it with owner-only permissions and record its ownership.
Supply the actual full source commit and installed plugin directory.

```sh
DOCS_DRIFT_PLUGIN_DIR="<installed-plugin>" BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 \
  bun scripts/docs-drift-entry.ts scan --repo "<example-checkout>" \
  --source "<full-commit>" --artifact-root "<private-external-directory>"
```

The unchanged example produces complete collection with no link findings.
Delete `src/server.ts`, commit that selected change and scan the new commit.
Collection remains complete and reports the missing link as a candidate.
Review the source before deciding how to correct it. A `scan` envelope can
return `collected` while containing findings. Full audit assessment and its
attention/publication status use the shared review and report procedure.

For a real consumer, create its own settings and project procedure. Replace
the scanner with the project's detector implementation and protocol accounting,
add actual feedback and verification/generation commands, configure the exact
installed client command, selected model and native role identity. Bind the
verified released plugin version, source commit and complete payload digest in
`component`. Keep secrets in the consumer's normal secret system. Complete the
installed-role, hosted advisory/history, paired migration and cutover evidence
before adopting shared publication. Retain legacy routes until their required
replacement tests and selected cutover pass.

Choose the consumer's publisher accounts during setup. The example's scalar
`publication.actor` works with a common publisher. A consumer using a hosted
bot and an interactive owner can add the complete `publication.entry_actors`
map for its configured execution profiles, along with matching
`pr_discovery.authors` and branch coverage. The example's `interactive` and
`hosted` profiles can be invoked from any supported harness. Preserve each
publisher's native numeric account identity in the retained operation evidence.
The committed preflight checklist records the consumer's setup and trial results.

The included dispatch-only workflow is a staged collection diagnostic. Before
installing it, populate `collection.yaml` from an operator-verified published
release and put that exact source commit in the caller. Record source release,
plugin version and the complete component digest separately. The worker compares
the selected payload with that committed pin and saves only its bounded scan
envelope. Its placeholder pin deliberately fails setup until configured.
It has read-only contents and actions permissions, no provider secrets and no
cron trigger. The settings reader requires `actions: read`.

The pin step checks consistency of an operator-verified immutable release.
It executes that selected component's installer and imports its modules to
compute the compared identity. An operator establishes trust in the release
before this example runs. A credentialed worker adaptation verifies identity
with already trusted tooling before executing the selected component.

The helper recognizes standard Claude Code and Copilot CLI model events. Native
execution verifies the actual full model and original session. Each native
client is installed and authenticated through its own ordinary installation
procedure. Configure a Claude command when selecting Claude for a role. Native
role identities need verification before independent review can finish.

The diagnostic artifact uses its own name and cannot supply eligible completed
audit history or hosted advisory-trial evidence. A real adoption adds the
consumer's common worker for scanner, selected worker, independent reviewer and
publisher, with the trial/production caller comparison and original observations
required by `references/docs-drift-settings.md`. Preserve those additional
obligations when adapting this staged example.

## Flat preflight checklist

After the required tests and paired review, create one checklist from the staged
consumer commit C. `normalizedConfigurationDigest` in `scripts/docs-drift/preflight.ts`
binds the parsed configuration, omitting `publication.mode` and
`publication.checklist_path`. `preflightReviewTarget` binds C, that configuration,
the component and the exact proposed activation files, including their modes and
before/after hashes. These values are available before activation.

Each passed check records its applicability target and the digest of its evidence.
Native entry observations separately retain their original component, consumer
commit, selected entry configuration, observed full models and publisher's REST
login/numeric ID. Use the actual saved observations. Classify an upgrade with the
fixed rows returned by `upgradeChecks`, repeat the selected checks and explain
why carried evidence still applies at its original target. Record unresolved
operations with their original component and lease identity and preserve their
records through the switch.

Add the checklist, mode/reference change and reviewed activation diff in D,
the direct child of C. The gate checks that shape and the current policy and
activation-file hashes. Save the actual routing-switch result after D in the
delivery report. The example stays staged while these observations are pending.
