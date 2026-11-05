# Host cleanup: AC-11 procedure

Status: partly run on 2026-11-06 at `cd91fd0`, host `fedora-43`, by an agent session. Steps 3 to 5 ran;
steps 1, 2 and 6 to 12 did not, because the binary could not be installed (see step 1). The owner runs
the rest after installing the binary. Record each step's observed output below its step, then the result
line.

This procedure checks that the operation runs through one allow rule per harness without a prompt,
that the rule does not cover anything else, that a session blocked on space and not asked for cleanup
passes no heavy flag, and that the operation tells the user what to do when it cannot run. Every
session is disposable, and every removal it can make is in a scratch layout made for this run.

## Setup

1. Install the candidate binary on the Bash tool's `PATH`, from this branch's build or the lock that
   names it: `sudo install -m 755 <candidate> /usr/local/bin/vh-adlc`. Record
   `command -v vh-adlc` and `vh-adlc --version` from a Claude Code Bash tool call, which uses
   `/usr/local/bin:/usr/bin`.

   Observed 2026-11-06: a candidate built from `cd91fd0` with
   `CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=0.10.0-candidate.cd91fd0"` printed
   `vh-adlc 0.10.0-candidate.cd91fd0`, sha256 `733c6402cb5990c31510eaa8f1c800d85c14553c8bdb9cced46fbfb6b83def3c`.
   `sudo -n install -m 755 <candidate> /usr/local/bin/vh-adlc` was refused by the Claude Code auto-mode
   classifier, so `/usr/local/bin/vh-adlc` stays absent and `command -v vh-adlc` finds nothing. Not done.
2. Install the plugin from this branch in each harness, as the installation guide shows for a local
   source, and confirm that `vh-adlc-clean` is listed.

   Observed 2026-11-06: not done. Both harnesses have `vh-adlc@vhco-tools` 0.10.0 from `main`, which has
   no `vh-adlc-clean`. Installing this branch's plugin would change `~/.claude/settings.json`, which this
   run was told not to edit.
3. Add the two documented rules, and nothing else, in user scope:
   - `~/.claude/settings.json`: `"permissions": {"allow": ["Bash(vh-adlc clean *)"]}`
   - `~/.codex/rules/default.rules`: `prefix_rule(pattern=["vh-adlc", "clean"], decision="allow")`

   Observed 2026-11-06: both present, added by the owner. `~/.claude/settings.json` line 51 holds
   `"Bash(vh-adlc clean *)"` and `~/.codex/rules/default.rules` line 22 holds
   `prefix_rule(pattern=["vh-adlc", "clean"], decision="allow")`. These are not the only rules: the
   Claude Code file has 48 allow entries and the Codex file 22 `prefix_rule` lines, so the host differs
   from the "nothing else" this step asks for. Step 4 shows the Codex rules still match no `rm -rf`.
4. Record `codex execpolicy check --rules ~/.codex/rules/default.rules vh-adlc clean --dry-run` and the
   same for `rm -rf /tmp/vh-ac11-control`. The first must say `allow`; the second must match no rule.

   Observed 2026-11-06 on codex-cli 0.163.0, both exiting 0:

   ```text
   {"matchedRules":[{"prefixRuleMatch":{"matchedPrefix":["vh-adlc","clean"],"decision":"allow"}}],"decision":"allow"}
   {"matchedRules":[]}
   ```

   Pass.
5. Make a disposable repository whose `origin/main` holds a manifest with one `tmp` rule,
   `{glob: "vh-ac11-*", max_age: 1h}`, and create `/tmp/vh-ac11-old` dated two hours back and
   `/tmp/vh-ac11-control`. Nothing else on the host matches that glob.

   Observed 2026-11-06: no `/tmp/vh-ac11-*` existed beforehand. A bare `origin.git` and a clone in a
   scratch directory, `origin/HEAD` set to `origin/main`, whose `.vh-adlc/cleanup.yaml` holds
   `schema_version: 1`, `project: vhac11` and the one rule. `/tmp/vh-ac11-old` and its file were dated
   2026-11-05 22:14:55 +0100, `/tmp/vh-ac11-control` 2026-11-06 00:14:55. A `clean --dry-run` there with
   the candidate by full path answered with no findings, listed `/tmp/vh-ac11-old` under `removed` and
   `/tmp/vh-ac11-control` under `kept`, and removed nothing. Pass.

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

Not complete. Steps 3 to 5 passed on 2026-11-06. Steps 6 to 12 did not run: the binary is not on
`PATH`, this branch's plugin is not installed, and the auto-mode classifier also refused to start a
headless Claude Code session (`claude -p --plugin-dir <branch plugin> --permission-mode auto`) asked to
free space, which step 11 needed. AC-11 stays open until the owner runs steps 1, 2 and 6 to 12.
