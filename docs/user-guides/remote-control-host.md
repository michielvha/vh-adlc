[Documentation](../README.md) / Remote Control host

# Remote Control host

`claude remote-control` makes a machine appear as an environment where you can
start Claude Code sessions from claude.ai/code and the Claude apps. The plugin's
`scripts/host/remote-control.sh` keeps it running as a per-user service, so no
terminal has to stay open, and tells you what still stops it from starting.

It runs on macOS and Linux with a POSIX shell. The checks that read Claude's
JSON files need `python3`.

## Install

Run it from the plugin directory, or give the full path:

```sh
sh scripts/host/remote-control.sh install --dir ~/code/my-project
```

- macOS gets a LaunchAgent, `~/Library/LaunchAgents/pro.vhco.claude-remote-control.<id>.plist`,
  loaded into your GUI session. That session can read the Claude login from
  the Keychain, which an SSH session cannot. It logs to
  `~/Library/Logs/claude-remote-control-<id>.log`.
- Linux gets a `systemd --user` unit, `claude-remote-control-<id>.service`,
  logging to the journal. On a server, add `--linger` so it keeps running after
  you log out.

`<id>` is the folder's last path segment. Each session starts in its own Git
worktree. Pass `--spawn same-dir` to start sessions in the folder itself. The
bridge's name in claude.ai/code defaults to the short host name and the folder;
`--name` sets another. The service restarts the bridge 60 seconds after it exits.

Running `install` again with the same options changes nothing. Changed options
rewrite the service and reload it. `--dry-run` shows what would change.

## Steps only you can take

The script never records workspace trust or answers the consent prompt. When
they are missing, it lists them at the end, in order. At a terminal on the host,
in the folder:

1. Run `claude`, sign in if asked and accept the workspace trust dialog.
2. Run `claude remote-control` once and answer `y` to "Enable Remote Control?".
3. Stop that terminal bridge with Ctrl+C. While it runs, the service fails with
   "This folder is already served by a terminal `claude remote-control` on this device".

The service starts by itself at its next retry.

## Status and uninstall

```sh
sh scripts/host/remote-control.sh status --dir ~/code/my-project
sh scripts/host/remote-control.sh uninstall --dir ~/code/my-project
```

`status` prints the service state and one line per check, each `ok`, `action`,
`unknown` or `optional`. It exits 0 when nothing needs doing. It checks:

- that the `claude` binary exists
- that no settings file sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. This
  covers user, project, local and managed settings. Remote Control needs
  feature-flag evaluation, which that setting turns off. Settings `env`
  overrides the shell, so unsetting it there does not help.
- that `claude auth status` reports a login. Over SSH on macOS the result is
  `unknown`, because the Keychain is out of reach there.
- workspace trust for the folder or a parent
- the one-time Remote Control consent
- that no terminal `claude remote-control` serves the same folder
- on Linux, whether linger is on

`uninstall` stops the service and deletes it. It keeps the log, linger, trust,
consent and your login.
