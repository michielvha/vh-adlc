# VS Code Local: actual GUI validation

Date: 2026-10-20

Result: installation, discovery and the read-only investigation passed. A real default-review blocker
was reproduced; the version 0.1.3 correction still needs its post-update GUI run.

| Field | Observed value |
| --- | --- |
| Application | VS Code 1.142.0, macOS arm64 |
| Harness | Local, selected in the actual Chat UI |
| Main-session model label | GPT-6.1 Sol; not a reviewer-model attestation |
| Plugin before correction | vh-adlc 0.1.2, public `michielvha/vh-adlc` source |
| Binary | Locked release 0.1.0, installed by the plugin's checksum-verifying installer |
| Conventions | vhco-pro/docs at `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` |

## Setup and discovery

A separate VS Code window opened a disposable greeting fixture, not the development repository.
Existing windows and the running operator conversation were preserved.

The actual Command Palette's **Chat: Install Plugin from Source** accepted `michielvha/vh-adlc`.
After the source trust prompt, the GUI offered both marketplace plugins; only vh-adlc was selected.
Its Agent Plugins entry then showed **Manage** while github-app-registration still showed **Install**.

An initial test-workspace marketplace setting produced this GUI error:

```text
Unable to write chat.plugins.marketplaces to Workspace Settings. This setting can be written only into User settings.
```

Removing that unsupported Workspace setting and repeating the GUI installation succeeded. No
unrelated plugin was removed or disabled.

Typing `/vh-adlc` in Local chat displayed all seven operations. Choosing the investigate completion
inserted `/vh-adlc vh-adlc-investigate`. The actual Agent picker also listed `vh-adlc-reviewer`.

## Executed investigation

The GUI submitted a report-only investigation of the fixture's failing test. The operation:

- loaded the installed skill and its references outside the skill directory;
- obtained the verified release binary and resolved the pinned conventions;
- returned `answered` from `knowledge` and `find`;
- ran `test.sh`, observed exit 1 and the named-greeting assertion failure;
- measured that `greet.sh` always printed `Hello, world.`, including for Ada and Grace;
- reported the unchanged repository revision and preserved unrelated work.

The GUI report recorded the full convention pin and prose guide. An independent Git check after the
operation confirmed the original fixture HEAD `35657868f6e59924400be37909b9928fddd9ef07`, the staged
NOTES file, unstaged README edit and untracked scratch file. The investigated source, test and feature
document had no diff against that initial commit.

## Default-review blocker

A subsequent GUI request permitted fixture-only onboarding and an independent spec review, but no
feature acceptance or implementation. The installed reviewer ran and returned `MODEL: unknown`.
The host did not expose its executed-tool trace to the caller.

Version 0.1.2 rejected that identity and stored no eligible review, despite the owner naming no reviewer
model. The GUI reported `review pending`; it did not invent a matching identity or claim a completed
review. This reproduced the mismatch with D-37's permitted unrequested-model case.

Version 0.1.3 separates that case from requested-model checks: a non-Claude-Code default passes no
model override and can record an explicit `unknown` header, with identity not attested. Named targets
and Claude Code's named default chain still require a match. Missing headers remain pending.

The package checks cover those instruction boundaries. They are structural checks, not a substitute
for the pending post-update GUI test.

## Boundaries

Native macOS accessibility and window-specific snapshots drove these tests. No headless CLI agent run
was counted as GUI proof. Normal permission prompts were reviewed individually; no unrestricted mode
was enabled. Only public plugin sources, the pinned public cache and disposable fixtures were approved.

This record does not prove the Copilot or Claude harnesses, the native Claude Code extension, remote
sessions, structural isolation, or the full manual scenario selection. Raw UI dumps are not published.
