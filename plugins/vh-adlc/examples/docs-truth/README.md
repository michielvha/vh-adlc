# Try documentation truth review

Copy the contents of [project](project/) into a new disposable Git repository,
including `.vh-adlc`, and commit them. Open that repository with vh-adlc installed.

Ask for `vh-adlc-docs-truth next 1`. The selector should pick
`docs/current/setup.md` because it has no recorded review. The report should identify
the wrong port and show the source that gives the replacement. The correct command and
external backend should stay accurate. A claim about worker count should stay unknown.
Check the current source and its contract before recommending an edit to the failure behavior.

Ask for `vh-adlc-docs-truth report` to see recorded freshness or
`vh-adlc-docs-truth meta` to review `README.md`. Use `sweep docs/history/launch.md`
to target the historical document explicitly. Confirm that `git status --porcelain`
is still empty afterward.

For your repository, start with
[the project instructions](project/.vh-adlc/docs-truth.md). Set your own eligible docs,
source checks, batch selector and verification history. The example selector is for
this fixture. See [the shared procedure](../../references/docs-truth.md) for the handoff.
