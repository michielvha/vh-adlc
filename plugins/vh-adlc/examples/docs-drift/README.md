# Greenfield documentation drift example

Copy `basic/` into a disposable Git repository and commit it. Its complete
version-1 settings run an actual local-link scanner through the shared helper.
The repository starts staged. The client distribution/model values identify
placeholders, and collection uses no provider credentials.

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
client distribution/digest and native role identity, and verify its isolated
runtime. Keep secrets in the consumer's normal secret system. Complete the
installed-role, hosted advisory/history, paired migration and cutover evidence
before adopting shared publication. Retain legacy routes until their required
replacement tests and selected cutover pass.

The included dispatch-only workflow is a staged collection diagnostic. Before
installing it, populate `collection.yaml` from an operator-verified published
release and put that exact source commit in the caller. Record source release,
plugin version and the complete component digest separately. The worker compares
the selected payload with that committed pin and saves only its bounded scan
envelope. Its placeholder pin deliberately fails setup until configured.
It has read-only contents permission, no provider secrets and no cron trigger.

The diagnostic artifact uses its own name and cannot supply eligible completed
audit history or hosted advisory-trial evidence. A real adoption adds the
consumer's common worker for scanner, selected worker, independent reviewer and
publisher, with the trial/production caller comparison and original observations
required by `references/docs-drift-settings.md`. Preserve those additional
obligations when adapting this staged example.
