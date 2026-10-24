[Documentation](../README.md) / Your first feature

# Your first feature

Start in a local Git repository with [vh-adlc installed](installation.md).
Pick a change with a clear result, such as adding a `--json` option to a CLI.
Invocation syntax varies by client; the names below are operation names you can
choose from your client's suggestions.

Directly named spec and task operations can push feature documents to the default
branch. Include `Keep all work local until I ask you to ship` in your request if
you want to prepare the feature locally. See
[authority and publication](../user-guides/workflows.md#authority-and-publication).

## 1. Write the spec

Invoke `vh-adlc-spec` and describe the result you want:

```text
Add a --json option to the status command. Keep the existing text output as the default.
```

The agent checks for an existing feature document before creating one. That
document holds the requirements, acceptance criteria, test plan, and later tasks.
The agent asks you to resolve choices that affect the feature's scope.

Run `vh-adlc-spec review <path>` for an independent spec review. Resolve the
findings, then accept the reviewed scope when you are satisfied. The binary checks
whether the document can move to `planned`.

## 2. Plan the work

Invoke `vh-adlc-tasks` for the accepted document. The agent adds ordered tasks
small enough to commit individually, with checks tied to the acceptance criteria.
The plan stays in the feature document.

## 3. Implement

Invoke `vh-adlc-implement`. The agent claims the feature on its branch and works
through the tasks, starting with tests. It runs the repository's required checks
and records evidence in the document.

Existing local instructions still apply. If another session owns the feature,
confirm that it has stopped and hand it over before a new session writes to it.

## 4. Review

Invoke `vh-adlc-review` to review the committed implementation independently.
The review targets an exact commit. Fix blocking findings and obtain a current
review before completion; a changed implementation can make an older review stale.

The binary checks the document, evidence, and review state before allowing
`complete`. If the host cannot dispatch an independent reviewer, the review stays
pending. See [review requirements](../user-guides/workflows.md#reviews).

## 5. Ship when ready

Explicitly ask to ship, or invoke `vh-adlc-ship`. It checks the completed feature,
pushes the branch, opens or updates the PR, and updates the linked issue when
authorized. Merging requires a separate request.

For a generic request such as `Use vh-adlc to add this option`, publication needs
a separate request. Directly named operations retain their documented authority.

## Coming back later

Invoke `vh-adlc-resume` with the feature document or goal. The agent reconstructs
the state from the document and Git history, checks what is current, and continues
the next authorized step.

For small fixes and documentation edits, see [workflows](../user-guides/workflows.md).
