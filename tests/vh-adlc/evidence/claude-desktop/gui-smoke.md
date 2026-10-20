# Claude Code desktop: actual local GUI validation

Date: 2026-10-20

Result: GUI installation, all seven operation completions, investigation and independent spec review
passed. The fixture's implementation and implementation review are not yet established by this record.

| Field | Observed value |
| --- | --- |
| Application | Claude desktop 2.42304.2, macOS arm64 |
| Environment | This computer, selected in the actual desktop UI |
| Plugin | vh-adlc 0.1.2 from the public vhco-tools marketplace |
| Main-session model label | Opus 5.5 High |
| Independent reviewer | Requested `fable`; returned `MODEL: claude-fable-5-1` |
| Isolation | Procedural; shell access is not structural read-only isolation |
| Conventions | vhco-pro/docs at `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` |

## GUI installation and discovery

The existing desktop session was left in its history. A new session selected **This computer**, then
opened and trusted a separate disposable fixture through the native folder picker. No prompt was
submitted against a pre-existing project or remote environment.

The `/plugin` GUI command opened desktop Settings. **Add plugin**, **Add marketplace**, and **Add from a
repository** accepted `https://github.com/michielvha/vh-adlc.git`; **Sync** resolved the marketplace.
Only **Vh adlc** was added. The adjacent GitHub App registration plugin remained uninstalled.

After Settings closed, the actual slash menu listed all seven `vh-adlc:vh-adlc-*` operations. Selecting
the qualified investigation command submitted the real workflow, not a CLI listing.

## Executed investigation

The desktop operation resolved the plugin pin and reported:

```text
FAIL: got Hello, world., want Hello, Ada.
```

Its report cited the failing test and source lines, distinguished the required named greeting from
the fixed implementation, and made no implementation change.

## Independent spec review

The next GUI request explicitly permitted onboarding, fixture-only document commits and a review,
while withholding acceptance and implementation authority. The app:

- added pinned repository instructions and the native harness bridges without replacing unrelated work;
- dispatched `vh-adlc:vh-adlc-reviewer` in a separate context;
- requested `fable` and observed the matching `claude-fable-5-1` header;
- stored the returned findings and checked them with the real `review check` command;
- left the document draft when questions or owner acceptance were missing.

R-1 at fixture commit `45d9e65` found an invalid local issue link and two nits. The factual issue was
corrected to `issue: null`; judgement findings became explicit questions. Scripted fixture-owner
answers drove a real revision and R-2, then another revision and R-3.

R-3 at fixture commit `edf9af8` returned `NO FINDINGS`. It was stored in `0c25109` with procedural
isolation. The planned gate initially failed only on acceptance. The GUI then recorded the fixture
owner's explicit acceptance, passed the planned gate and moved the fixture to planned.

All documented pushes targeted the fixture's local bare origin, not GitHub. The real development
repository was unchanged by those GUI agents. Staged NOTES, the unstaged README edit, the untracked
scratch file and the other worktree were preserved.

## Boundaries

These are actual desktop UI operations under normal app authentication; no credential file was copied
to manufacture a headless session. No financial controls were approved.

The evidence does not establish the VS Code extension, remote sessions, every scenario variant, or
structural reviewer isolation. Raw conversation and UI dumps are not published.
