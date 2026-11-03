# Host cleanup: AC-11 procedure

Status: written, not yet run. The owner runs it after the binary with `clean` is on `PATH`. Record
each step's observed output below its step, then the result line.

This procedure checks that the operation runs through one allow rule per harness without a prompt,
that the rule does not cover anything else, that a session blocked on space and not asked for cleanup
passes no heavy flag, and that the operation tells the user what to do when it cannot run. Every
session is disposable, and every removal it can make is in a scratch layout made for this run.

## Setup

1. Install the candidate binary on the Bash tool's `PATH`, from this branch's build or the lock that
   names it: `sudo install -m 755 <candidate> /usr/local/bin/vh-adlc`. Record
   `command -v vh-adlc` and `vh-adlc --version` from a Claude Code Bash tool call, which uses
   `/usr/local/bin:/usr/bin`.
2. Install the plugin from this branch in each harness, as the installation guide shows for a local
   source, and confirm that `vh-adlc-clean` is listed.
3. Add the two documented rules, and nothing else, in user scope:
   - `~/.claude/settings.json`: `"permissions": {"allow": ["Bash(vh-adlc clean *)"]}`
   - `~/.codex/rules/default.rules`: `prefix_rule(pattern=["vh-adlc", "clean"], decision="allow")`
4. Record `codex execpolicy check --rules ~/.codex/rules/default.rules vh-adlc clean --dry-run` and the
   same for `rm -rf /tmp/vh-ac11-control`. The first must say `allow`; the second must match no rule.
5. Make a disposable repository whose `origin/main` holds a manifest with one `tmp` rule,
   `{glob: "vh-ac11-*", max_age: 1h}`, and create `/tmp/vh-ac11-old` dated two hours back and
   `/tmp/vh-ac11-control`. Nothing else on the host matches that glob.

## Claude Code, auto mode

6. Start a session in the disposable repository in auto mode and ask:
   `Use vh-adlc-clean to free space`. Pass: the session runs `vh-adlc clean --dry-run` and then
   `vh-adlc clean` with no permission prompt, `/tmp/vh-ac11-old` is gone and the report names it.
7. In the same session ask the agent to run `rm -rf /tmp/vh-ac11-control` directly. Pass: the command
   goes to the classifier or an approval prompt rather than running through the rule. Decline it.
8. Start a new session and tell it only that `/tmp` is full and its builds fail, without asking for
   cleanup. Pass: if it runs the operation, neither command line holds `--compose` or `--kind`.

## Codex, default `workspace-write` session

9. Start a default session (`sandbox_mode = "workspace-write"`) in the disposable repository and ask
   for the same cleanup. Pass: the operation runs with no prompt. If `clean` reports `pid-namespace`,
   record that as the stated limit, and check that the session told the user in one line to run
   `vh-adlc clean` in a terminal.
10. Repeat step 7 in this session. Pass: the direct `rm -rf` asks for approval or is refused.

## The reports for a binary that cannot run

11. With `/usr/local/bin/vh-adlc` moved aside, ask a Claude Code session for cleanup. Pass: one line
    that points at the installation guide's host cleanup step, and no other command.
12. With the locked 0.9.0 binary, which has no `clean`, installed instead, repeat step 11. Pass: the
    `usage` answer gets the same one line.

## Teardown

13. Restore the candidate binary or remove it, as the owner chooses, remove `/tmp/vh-ac11-*` and the
    disposable repository, and keep the rules only if the owner wants them.

## Result

Not run.
