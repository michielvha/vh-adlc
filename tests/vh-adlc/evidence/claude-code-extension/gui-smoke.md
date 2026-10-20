# Claude Code VS Code extension: actual GUI validation

Date: 2026-10-20

Result: all seven operations, a real read-only investigation and independent spec-review dispatch
passed. Two reviews and their structured owner questions completed. A host usage limit prevented
completion of the third review; acceptance and implementation were not reached.

| Field | Observed value |
| --- | --- |
| Editor | VS Code 1.142.0, macOS arm64 |
| Extension | anthropic.claude-code 2.1.301 |
| Surface | Native Claude Code extension webview, not Copilot Chat's Claude harness |
| Plugin | vh-adlc 0.1.2 in the normal Claude Code plugin registry |
| Reviewer | `vh-adlc:vh-adlc-reviewer`, returned `claude-fable-5-1` |
| Isolation | Procedural |
| Conventions | vhco-pro/docs at `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` |

## GUI setup and discovery

A separate Code window opened an independent disposable fixture. The actual **Claude Code: Open**
control opened the extension's own webview. It reused normal authentication; no credentials were
copied or changed.

The Message input's actual `/vh-adlc` completion list contained all seven qualified
`/vh-adlc:vh-adlc-*` operations. This observed the extension itself; the desktop app's result was not
used as a substitute.

## Executed investigation

The real extension composer submitted a report-only investigation. Its visible tool results showed:

- the installed plugin pin and successful checksum-verifying installer;
- `knowledge` returning `answered`, with the expected full revision and no findings;
- feature discovery and direct reads of the fixture document, source and test;
- `./test.sh` returning `FAIL: got Hello, world., want Hello, Ada.` with exit 1;
- the original staged, unstaged and untracked work preserved.

The final GUI response explained the fixed greeting versus the named-greeting requirement and cited
the pinned prose guide. No implementation authority was given in that turn.

## Independent review and question form

A subsequent GUI request supplied bounded fixture-owner scope decisions and authorised only
onboarding, document revision and spec review. The extension created pinned instructions, committed
the draft and dispatched the installed independent reviewer.

R-1 reviewed fixture commit `31f56d8`, recorded `claude-fable-5-1` and procedural isolation, and returned
three nonblocking findings. The records were committed in `cb10849`. The factual citation was corrected;
the two judgement findings appeared as a real, structured GUI question form.

The scripted fixture-owner choices selected an additional general-name criterion and left exit status
outside the output-only contract. They were submitted using the form's actual radio controls and
Submit answers button, not by fabricating review records. The revised draft was committed in `e4f91c9`.

R-2 was recorded in `938cbf2` with the same model and procedural isolation. Its two judgement findings
became another active question form. The scripted fixture-owner choices required a reviewer-chosen
fresh name for the general-name proof and cited test checks by their text instead of unstable line
numbers. Both choices were submitted through the actual form. The revised baseline was committed
in `ffcf644`.

The third review started at that baseline, but no eligible R-3 was stored. The actual host then
reported its usage limit. A visible `review check` for R-3 failed with `review-not-found`; this run
does not turn the interrupted review into a clean result or owner acceptance. No billing settings
were changed to continue the test.

The normal development repository was not the extension agent's workspace. Document pushes were
permitted only to the fixture's existing local bare origin, and no GitHub writes were authorised.

## Boundaries

This is not evidence for Copilot Chat's separate Claude harness, remote sessions, structural isolation,
or the full scenario matrix. The implementation and completion phases are not yet claimed here.
Raw UI dumps and unrelated editor notifications are not published.

## Later continuation attempt

The same disposable native-extension workspace was reopened on 2026-10-20. Its actual message UI still
reported `You've hit your weekly limit`, with the reset shown as October 23 at midnight,
Europe/Brussels. No further model request, billing change or app restart was used to continue it.
The earlier R-3, acceptance and implementation checks remain unverified on this surface.
