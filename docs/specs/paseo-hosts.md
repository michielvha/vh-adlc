---
status: draft
status_description: "Drafted from the working local tool with the owner's first answers folded in; Q1 open until the owner sees the logger change; spec review pending."
issue: https://github.com/michielvha/vh-adlc/issues/71
goal: "An owner can ask an agent to add a Paseo server, and the vhco-tools paseo-hosts plugin installs a password-protected SSH-only daemon there and links the owner's macOS and Windows Paseo desktop apps to it, with all host-specific configuration supplied from the operator host's environment."
covers:
  - plugins/paseo-hosts/
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - docs/reference/marketplace.md
  - .github/workflows/ci.yml
---

# Plan: Paseo host onboarding plugin

Rebuild the working Paseo server onboarding and desktop-app linking tool as a Go CLI in the `paseo-hosts` plugin of the vhco-tools marketplace, with a skill that lets an agent add or remove a server on request and no host data in the plugin.

## Context

### Owner summary

The owner runs Paseo daemons on Linux servers and uses them from the Paseo desktop app on a Mac and a Windows PC. A local Bash tool on the operator host now adds a server and links the Mac end to end, and it did so for a real server on 2026-11-10. It is not in any repository, has no tests and contains names of the owner's own machines, so no agent can find it and nobody else can use it.

This feature rebuilds that tool as a Go CLI in a new `paseo-hosts` plugin in the vhco-tools marketplace, following the remote-gui pattern. An owner asks an agent to add a server, and the skill runs two commands. `onboard` installs a password-protected daemon reachable only over SSH, with the relay off. `link` gives a desktop, macOS or Windows, a key that can open only the daemon tunnel, and adds the server to its Paseo app with no manual step. `remove` undoes both. All settings come from environment variables and flags on the operator host. Plaintext passwords stay there, the server keeps a hash, and each desktop app keeps its own copy as it does for any host.

Excluded: phones, the web UI, the Linux desktop app, relay pairing, installing agent CLIs, and the operator host's own daemon. Existing registry files keep working, and the owner retires the local tool after installing the plugin. Adding the logger to the Go convention is a separate docs change.

Side effects to know: `link` and `remove` quit and restart the desktop app twice, briefly enable its debugging port on loopback, and keep a backup of the app's host list, which holds passwords, in the registry directory. If the app rejects the change, the previous list is restored. On Windows the app is started through a scheduled task in the signed-in session, which needs a signed-in user and OpenSSH Server on the PC.

The proposed checks are Go tests that run the CLI against SSH and DevTools stand-ins, the repository's Go lint and race checks in CI, and a manual run on a real server, Mac, Windows PC and fresh agent session. The Mac flow was observed with the Bash tool; nothing in this plugin is implemented, Windows is unmeasured, and this document is not reviewed. One decision is open below, on the logger.

Acceptance authorizes implementing the plugin on a feature branch through the vh-adlc gates. Opening a PR, merging, changing the logger repository, and touching real servers or desktops during tests still need separate approval.

### Background

The owner runs Paseo daemons on several Linux servers and reaches them from the Paseo desktop app on a Mac and a Windows PC. Adding a server by hand takes a daemon install, a password, a user service, SSH access for each desktop and an entry in each app. The owner wants this to be a repeatable request to an agent, with the configuration kept on the operator host and passed in as environment variables, so the same tool works from any operator host.

A local tool already does the whole flow and was used on a real server on 2026-11-10. It lives outside any repository, so no agent can find it and it has no history or tests:

- `~/code/paseo-hosts` on the operator host is not a Git repository (`git rev-parse --is-inside-work-tree` printed `fatal: not a git repository`). It holds a 564-line Bash CLI `paseo-host` and a 141-line Node helper `lib/mac-app-register.mjs` (`wc -l`).
- `paseo-host onboard <alias>` checked the server, generated a password, installed `@getpaseo/cli` 0.14.0 as a `paseo.service` user unit on loopback port 6867 with the relay off, removed a Tailscale Serve route that pointed at the daemon, and verified that a connection without a password was rejected and one with the stored password was accepted (command output, 2026-11-10).
- `paseo-host link-mac <alias>` created a dedicated key on the Mac, authorized it on the server for the daemon port only, pinned the server host key, added a `paseo-<alias>` SSH alias on the Mac, checked the tunnel (`HTTP/1.1 200 OK`) and that shell access was refused, then added the host to the Mac app. It finished with `app connected via ssh -W 127.0.0.1:6867 paseo-<alias>` and `app hosts: {"replaced":false,"hosts":[...,"<alias>"]}` (command output, 2026-11-10).
- With that key, `ssh -W 127.0.0.1:22` to the server failed with `channel 0: open failed: administratively prohibited` (command output, 2026-11-10).

The local tool contains values tied to one operator host and one Mac, which a shared plugin cannot keep:

- The default Mac alias is a fixed hostname (`paseo-host:41`, `:487`), the client key path is fixed (`paseo-host:500`), the local Paseo runtime defaults to a path inside an unrelated trial checkout (`paseo-host:10`), and the default ports are fixed at 6867 and 8956 (`paseo-host:285`).
- Handoff notes are written next to the script (`paseo-host:11`, `:106-150`). An installed plugin directory is a cache, not a place for owner data.
- Registry files are loaded with `source` (`paseo-host:64-69`), so a registry file can run code.
- Preflight requires Tailscale on every server and takes the client's SSH host name from the server's tailnet DNS name, even when nothing is published (`paseo-host:161`, `:167`, `:177`, `:306`, `:508-513`).

Paseo constraints the design depends on:

- `paseo daemon config set daemon.auth.password` fails with `Use daemon set-password to change the daemon password.`, and `paseo daemon set-password` without a terminal fails with `Run it in an interactive terminal, or set PASEO_PASSWORD in the daemon's environment instead.` (Paseo 0.14.0, command output). The local tool therefore hashes the password on the operator host with the package's `hashDaemonPassword` and writes only the hash through `readPersistedConfig` and `savePersistedConfig` (`paseo-host:207-210`, `:320-322`).
- The Paseo CLI reaches a daemon through SSH with `--host "ssh://<alias>?daemonPort=<port>"` and authenticates with `PASEO_PASSWORD`. Without it the CLI fails with `The daemon requires a password. Set PASEO_PASSWORD and retry.` (command output). `daemon status --json` returns the daemon's `serverId` (command output, `srv_` prefix).
- The desktop app's Remote SSH host runs the system `ssh` as `ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o ClearAllForwardings=yes -o ExitOnForwardFailure=yes -W 127.0.0.1:<port> <alias>` (process listing on the Mac, 2026-11-10). It opens a forwarding channel only, so a key restricted to that one forward is enough.
- The desktop app 0.15.3 (`CFBundleShortVersionString`) registers only the `paseo` URL scheme, and its `open-url` handler passes the URL to the agent deep-link parser (`dist/main.js:698-701`, `dist/agent-navigation.js:5-8` in `app.asar`). No URL or file adds a host.
- The app keeps its hosts as JSON under the local storage key `@paseo:daemon-registry` (bundle `app-dist/_expo/static/js/web/index-803dd72b3aeeefd8a0cf2c30209668d4.js:16792`). Each entry is a strict object with `serverId`, optional `password`, `label`, `appearance`, `lifecycle`, `connections`, `preferredConnectionId`, `createdAt` and `updatedAt`, and a Remote SSH connection is `{type: "remoteSsh", host, sshPort?, daemonPort?}` (same file, line 16796). When any stored entry fails normalization, the app removes the whole key (same file, line 16792).
- The desktop app's tunnel code has no platform branch: `spawn("ssh", buildSshTunnelArgs(target))` (`node_modules/@getpaseo/client/dist/node/ssh-tunnel.js:36` in `app.asar` 0.15.3). On Windows this resolves to the OpenSSH client on `PATH`, which reads `%USERPROFILE%\.ssh\config`.
- Paseo publishes the desktop app for Windows as well as macOS and Linux: release v0.15.4 lists `Paseo-Setup-0.15.4-x64.exe` and `Paseo-Setup-0.15.4-arm64.exe` beside the `.dmg` files (`gh release view --repo getpaseo/paseo`).
- The operator host has no SSH alias for a Windows machine yet (`~/.ssh/config`), so no Windows client behaviour is measured. In particular, it is unmeasured whether an app started from an OpenSSH session appears on the signed-in user's desktop; Design starts it through a scheduled task in the interactive session for that reason.

Repository and convention facts:

- The established pattern for a plugin CLI in this repository is Go: `plugins/remote-gui` has `go.mod` (`go 1.27.2`), `cmd/remote-gui`, `internal/`, `.golangci.yml`, and a Bash wrapper that builds the module into a private user cache with `GOTOOLCHAIN=local` (`plugins/remote-gui/scripts/remote-gui.sh:20-39`). CI builds, tests with `-race`, vets, lints and checks `go mod tidy -diff` for it (`.github/workflows/ci.yml:89-110`).
- `conventions/go.md:39` asks for `log/slog` with structured JSON logs. The owner's logger `github.com/michielvha/logger` (latest tag v0.0.5) wraps `slog`, reads `LOG_LEVEL`, and always writes JSON to standard output (`logger.go:55`, `slog.NewJSONHandler(os.Stdout, opts)`). The Go convention does not name it yet.
- `conventions/terminal-output.md` requires labelled `✓`, `✗`, `∅` and `›` status lines, `NO_COLOR` handling, plain append-only output on a non-TTY stream, and diagnostics on the documented diagnostic stream "so stdout remains usable as data" (lines 20-37, 43-57), and forbids decorating machine-readable output (line 65). Logs on standard output conflict with that.

The owner made these decisions in the session that produced the local tool: servers default to SSH-only with the relay off, and HTTPS publication is an opt-in for phones and browsers; plaintext passwords stay on the operator host; linking the desktop app needs no manual step.

The owner decided on 2026-11-10, in answer to this document's first questions: the CLI is written in Go, the repository's established pattern, and logs through `michielvha/logger`; Windows is the second client platform; removing a server is in the first version; new servers use Paseo's default port 6767, which the owner left to the recommendation; the feature is tracked in issue #71; the handoff note files are dropped in favour of `status`; and `link` keeps the app host-list backup after success. Later the same day the owner decided that the wrapper builds the binary on the operator host as remote-gui does, that the DevTools step uses `github.com/coder/websocket`, and that `remove` keeps the server's Paseo state and workspace unless `--purge` is given.

## Scope

In scope:

- A new `paseo-hosts` plugin in the vhco-tools marketplace for Codex and Claude: a Go CLI `paseo-hosts`, a Bash wrapper that builds it, a skill and a README.
- `onboard <alias>`: preflight, password creation, daemon install as a user service, SSH-only or published exposure, and authenticated verification. Re-running it refreshes an onboarded server without changing its password.
- `link <alias>` for macOS and Windows clients: the restricted client key, host key pinning, the client SSH alias, tunnel and shell-refusal checks, and the entry in the Paseo desktop app with automatic rollback.
- `remove <alias>`: undo every link, the daemon service, its route and the registry entry.
- `verify`, `status`, `list` and `password <alias>` for onboarded servers.
- Output that follows `conventions/terminal-output.md`, with `--json` results on standard output.
- Configuration from environment variables and flags only, with the registry and passwords in an operator-chosen directory.
- Reading registry files written by the local tool without changes.

Out of scope:

- Paseo clients other than the macOS and Windows desktop apps, including the Linux desktop app, phones and the web UI.
- Relay pairing, QR codes and pairing links.
- Installing agent CLIs or signing them in on a server. Preflight only reports which ones it finds.
- Installing OpenSSH Server on a Windows client. `link` reports it missing.
- Managing the operator host's own Paseo daemon, and migrating it.
- Changes to `michielvha/logger` and to the Go convention; Q1 decides what the plugin needs from the logger.
- Retiring the local tool on the operator host; the owner does that after installing the plugin.

## Design

### Terms

| Term | Meaning |
| --- | --- |
| Operator host | The machine that runs the plugin and holds the registry and plaintext passwords. |
| Server | A Linux machine, reached by an SSH alias from the operator host, that runs a Paseo daemon. |
| Client | A Mac or Windows PC that runs the Paseo desktop app, reached by an SSH alias from the operator host. |
| Registry | The `<alias>.env` and `<alias>.password` files in `PASEO_HOSTS_DIR`. |
| SSH-only | The daemon listens on loopback and is reachable only through an SSH forward. |
| Published | SSH-only plus one tailnet-only HTTPS route on the server, for phones and browsers. |
| Onboard | Install or refresh a server's daemon, password and exposure, then verify authentication. |
| Link | Give a client a tunnel-only key and alias for a server and add the server to the client's desktop app. |
| Remove | Undo every link of a server, stop and delete its daemon service and route, and delete its registry entry. |

### Plugin layout

`plugins/paseo-hosts/` follows `plugins/remote-gui/`:

- `plugin.json` and `.claude-plugin/plugin.json` at version 0.1.0, `README.md`, and `skills/paseo-hosts/SKILL.md`.
- A Go module `github.com/michielvha/vh-adlc/plugins/paseo-hosts` with the Go version of `plugins/remote-gui/go.mod`, `cmd/paseo-hosts/main.go` for wiring only, packages under `internal/`, and `.golangci.yml` copied from remote-gui.
- The shell and PowerShell snippets that run on servers and clients, as files under `internal/` embedded with `go:embed`. They are sent to `ssh` on standard input, never as arguments, so they can be linted and tested on their own.
- `scripts/paseo-hosts.sh`, a wrapper that builds the module into `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts/builds` the way `scripts/remote-gui.sh` does, with `GOTOOLCHAIN=local`, and runs it.

Both marketplace catalogs (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`) and the plugin table in `docs/reference/marketplace.md` list the plugin. A `paseo-hosts` job in `.github/workflows/ci.yml` runs the same build, `go test -race`, `go vet`, golangci-lint and `go mod tidy -diff` steps as the remote-gui job, and the `version` job waits for it.

### Output and logging

Human status goes to standard error as labelled lines, `› Installing Paseo 0.14.0`, `✓ Passed: password required`, `✗ Failed: tunnel refused`, `∅ Skipped: no Serve route`, with colour only on a terminal and never when `NO_COLOR` is non-empty, and `--plain` for ASCII words. With `--json`, each command prints one JSON object with `schema_version`, `command`, `result` and `data` on standard output. Exit codes: 0 success, 1 a failed check or remote step, 2 usage, 3 missing configuration. Debug diagnostics go through `michielvha/logger` at `LOG_LEVEL=debug`, on standard error (see Q1).

### Configuration

The plugin contains no host names, user names, tailnet names or paths of one machine. Every setting comes from a flag, an environment variable or the registry:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PASEO_HOSTS_DIR` | `~/.config/paseo-hosts` | Registry files and plaintext passwords, mode 700 and 600 |
| `PASEO_HOSTS_CLIENT` | none | SSH alias of the client for `link`; `--client` overrides it. Without either, `link` stops with exit 3 naming the variable |
| `PASEO_HOSTS_VERSION` | `0.14.0` | Paseo CLI version installed on servers and used locally |
| `PASEO_HOSTS_LISTEN_PORT` | `6767` | Daemon port for a newly onboarded server; `--listen-port` overrides it |
| `PASEO_HOSTS_SERVE_PORT` | `8956` | Tailnet HTTPS port when `--publish` is given |
| `PASEO_HOSTS_CACHE` | `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts` | Local Paseo runtime used for hashing and verification, and the build cache |
| `PASEO_HOSTS_CLIENT_KEY` | `id_ed25519_paseo` | File name of the dedicated key in the client's `.ssh` directory |

The prefix avoids Paseo's own variables such as `PASEO_PASSWORD`. Server-side paths stay fixed: `~/.local/share/paseo/{runtime,state,workspace}` and `paseo.service`.

### Registry

One `<alias>.env` and one `<alias>.password` per server in `PASEO_HOSTS_DIR`. The file keys stay those of the local tool (`PASEO_SSH`, `PASEO_USER`, `PASEO_DNS`, `PASEO_LISTEN_PORT`, `PASEO_PUBLISHED`, `PASEO_SERVE_PORT`, `PASEO_URL`, `PASEO_VERSION`, `PASEO_AGENTS`, `PASEO_PASSWORD_FILE`, `PASEO_UNIT`), so existing files keep working. One key is added: `PASEO_CLIENTS`, the comma-separated client aliases `link` has run for, which `remove` uses. The CLI parses `KEY=value` lines with an optional double-quoted value and rejects any other line; it never runs a registry file. A missing `PASEO_PUBLISHED` means `no`, and a missing `PASEO_CLIENTS` means none recorded.

### onboard

1. Preflight over SSH: Node, npm, Git, user lingering, a free daemon port, and the agent CLIs found on `PATH`. Tailscale is required only with `--publish`.
2. Create the password on the operator host if `<alias>.password` is missing, otherwise reuse it. Hash it locally with `hashDaemonPassword` from the pinned Paseo runtime in `PASEO_HOSTS_CACHE`.
3. Install the pinned CLI on the server, set loopback listen, relay off and plugins off, write the hash through the persisted-config API, and install, enable and restart `paseo.service` with an explicit Node path and the agent CLIs' directories on `PATH`.
4. Without `--publish`, remove only Serve routes that proxy to the daemon port. With `--publish`, add one tailnet-only HTTPS route and refuse a Serve port that another route uses.
5. Write the registry file. The SSH host name stored for clients is the `hostname` and `port` that `ssh -G <alias>` resolves on the operator host, so servers outside a tailnet work too.
6. Verify over `PASEO_URL`: a connection without a password must be rejected and the stored password accepted. Retry while the WebSocket still answers 503 during daemon start. With `--publish`, also check HTTPS health.

The password reaches remote and local processes only through standard input or the environment, never as a command argument, and the CLI never prints it except through `password`.

### link

The CLI finds the client's platform by running `uname -s` over SSH and, when that fails, a PowerShell probe; `Darwin` and Windows are supported and anything else stops with exit 3.

1. Create the dedicated key in the client's `.ssh` directory with the client's `ssh-keygen` if it is missing, and read its public key.
2. On the server, back up `~/.ssh/authorized_keys`, remove any line with that key, and append `restrict,port-forwarding,permitopen="127.0.0.1:<port>",command="/bin/false" <key>`. `restrict` alone still allows commands, so the forced command stays.
3. Copy the operator host's known-hosts entry for the server to the client if the client has none, then write a `paseo-<alias>` block between `# BEGIN paseo-hosts paseo-<alias>` and `# END paseo-hosts paseo-<alias>` markers in the client's SSH config, replacing an earlier block or one with the local tool's `paseo-host` markers, with `IdentitiesOnly yes` and `StrictHostKeyChecking yes`. On Windows these files are in `%USERPROFILE%\.ssh`, and the CLI keeps the private key readable only by the user, as Windows OpenSSH requires.
4. From the client, check that the tunnel returns HTTP 200 from `/api/health` and that a shell command is refused.
5. Add the server to the desktop app unless `--no-app` is given, as described below, and add the client to `PASEO_CLIENTS`. With `--no-app`, copy the password to the client clipboard (`pbcopy` or `Set-Clipboard`) and print the Remote SSH values for a manual entry.

`status <alias>` prints the facts the local tool's handoff notes held: the server, exposure, port, Remote SSH value per linked client, and agent CLIs. The plugin writes no handoff files.

### Desktop app entry

The app accepts hosts only from its own UI or its local storage, so `link` writes the entry through the Chrome DevTools Protocol:

1. Read the daemon's `serverId` with `paseo daemon status --json` over `PASEO_URL`.
2. Quit the app on the client and relaunch it with `--remote-debugging-port` on a random loopback port. On macOS the CLI asks the app to quit with AppleScript, sends `SIGTERM` if it has not quit, and starts it with `open -a`. On Windows it stops the `Paseo` process and starts the app through a one-time scheduled task that runs in the signed-in user's interactive session, then deletes the task; without a signed-in user, `link` fails before changing anything. The operator host forwards the debugging port over SSH for the duration of the step.
3. The CLI finds the app window by its `@paseo:client-id-v1` key and upserts one entry for the `serverId` in `@paseo:daemon-registry`: label `<alias>`, the password, `lifecycle: {}`, one `remoteSsh` connection to `paseo-<alias>` with the daemon port, and that connection as preferred. It writes only the keys the app's strict schema allows and keeps every other host and an existing entry's `appearance` and `createdAt`. It saves the previous value to `PASEO_HOSTS_DIR/app-registry-<client>.backup.json` with mode 600 and keeps it after success. The DevTools WebSocket client is `github.com/coder/websocket`.
4. Reload the app and read the registry again. If the entry is gone or changed, write the previous value back, reload, and fail.
5. Close the forward, quit the app, and relaunch it without the debugging port, whether or not step 3 or 4 succeeded.
6. Succeed only when the client shows an `ssh` process with `-W 127.0.0.1:<port> paseo-<alias>` started by the app within 30 seconds.

The client app stores the password in its own local storage, as it does for a host added by hand. The operator host keeps the only other copy, and the server keeps only the hash.

### remove

`remove <alias>` runs these steps for each client in `PASEO_CLIENTS` and stops at the first failure, so a re-run continues where it stopped:

1. Delete the server's entry from the client's desktop app with the same quit, debug, write, verify and relaunch steps as `link`, keeping every other host.
2. Delete the `paseo-<alias>` block from the client's SSH config. The client key stays, since other servers use it.
3. Delete the key's line from the server's `authorized_keys`.

Then it stops, disables and deletes `paseo.service`, deletes the Serve route to the daemon port, deletes the server's Paseo runtime and config, and deletes the registry files and password. It keeps the server's Paseo state and workspace unless `--purge` is given, which deletes them too. `--client <alias>` limits the run to unlinking that one client and keeps the server.

### Skill

`SKILL.md` triggers on requests to add, onboard, link, remove, check or list Paseo servers. It checks that `PASEO_HOSTS_DIR` exists and that `PASEO_HOSTS_CLIENT` or a named client is set, asking the owner for a missing value instead of guessing. It runs `onboard` and then `link`, tells the owner before `link` or `remove` that the desktop app will restart twice, confirms `remove` with the owner first, and reports the CLI's checks from `--json`. It never prints, reads into the conversation or pastes a password, and runs `password` only into a pipe.

### Delivery

Both catalogs point at `./plugins/paseo-hosts` on the default branch, as they do for `remote-gui`, so merging is the release path for the plugin; the wrapper builds the binary on the operator host. The feature is delivered when a fresh install from each catalog after the merge builds and runs `paseo-hosts --help`. The vh-adlc binary release workflow does not change. If Q1 needs a logger change, that logger release comes first and the module pins it.

## Acceptance Criteria

- [ ] AC-01: After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password exists on the operator host only, in `PASEO_HOSTS_DIR` with mode 600.
- [ ] AC-02: `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
- [ ] AC-03: Running `onboard` again on an onboarded server keeps its password, leaves one unit and at most one route, and passes verification.
- [ ] AC-04: After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command and a forward to any other port. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
- [ ] AC-05: After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server.
- [ ] AC-06: When the app does not keep the new entry, `link` exits non-zero, the app's previous host list is restored, and the app runs again without a debugging port.
- [ ] AC-07: After `paseo-hosts remove <alias>`, no linked client's app lists the server or has its alias block, the server's `authorized_keys` has no line for a client key of this plugin that permits the daemon port, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, and the registry files and password are gone, while the server's Paseo state and workspace remain unless `--purge` was given. Other servers and hosts in the apps are unchanged. With `--client`, only that client is unlinked.
- [ ] AC-08: The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
- [ ] AC-09: Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link` and `remove`, and a registry line that is not `KEY=value` is rejected without being executed.
- [ ] AC-10: No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
- [ ] AC-11: Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command with the documented fields, and the exit code matches the documented meaning.
- [ ] AC-12: The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
- [ ] AC-13: The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.

## Test Plan

Go tests run the CLI's commands with a stand-in `ssh` on `PATH` that executes the embedded snippets locally under a temporary home, with stand-in `npm`, `systemctl`, `loginctl`, `tailscale`, `osascript`, `open`, `powershell` and a stand-in daemon. A fake DevTools endpoint serves a page that applies the app's strict schema on reload and drops the whole registry on an invalid entry.

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | `internal/onboard` tests: assert the unit, config hash, removed or single route, password mode and reuse, and that verification fails when the stand-in daemon accepts a password-less connection. Live: manual steps 1 to 3. |
| AC-04 | `internal/link` tests: run the `authorized_keys` and SSH config snippets twice for both platforms against temporary files and assert one restricted line and one block, including replacement of a `paseo-host` block. Live: manual steps 4 and 6. |
| AC-05, AC-06 | `internal/clientapp` tests against the fake DevTools endpoint: the upsert keeps other hosts and `appearance`, and an entry the page rejects causes a non-zero exit and the restored registry. Live: manual steps 5 and 6. |
| AC-07 | `internal/remove` tests: after `link` with two stand-in clients, `remove` leaves no entry, block, key line, unit, route or registry file, keeps the state and workspace without `--purge` and deletes them with it, and keeps another server's files; a failure part way and a re-run finish the removal; `--client` touches one client only. Live: manual step 7. |
| AC-08 | `cmd/paseo-hosts` tests: run `onboard` and `link` with only the documented variables in a temporary home, record the stand-in's arguments, and check the exit-3 error. A test searches the plugin files for names from a list given in `PASEO_HOSTS_FORBIDDEN_NAMES`, which the live run sets to the operator host's names. |
| AC-09 | `internal/registry` tests: parse the local tool's format, and reject a line containing a command substitution without running it. |
| AC-10 | `cmd/paseo-hosts` tests record every stand-in's argument list, the debug log at `LOG_LEVEL=debug`, and both output streams during every command, and assert the password appears in none of them. |
| AC-11 | Reporter tests capture success, failure, skip and partial outcomes with a terminal and a pipe, with `NO_COLOR` absent, empty, `0` and `1`, and with `--plain`; assert no ANSI bytes in plain captures and that `--json` output parses with the documented fields and exit codes. |
| AC-12 | Manual: install `paseo-hosts@vhco-tools` in Codex and in Claude, start a new session on the operator host, ask to add a named server, and record that the agent loaded the skill, ran both commands, and showed no password. |
| AC-13 | Implementation review compares the README, `SKILL.md`, `paseo-hosts --help` and the marketplace row with the Terms table and records each mismatch. |

Manual procedure on the operator host, a test server, the Mac and a Windows PC with OpenSSH Server and a signed-in user: (1) `onboard` the server and record the unit, config and Serve state; (2) re-run `onboard` and confirm the password file is unchanged; (3) `onboard --publish`, check the route and health, then `onboard` again and confirm the route is gone; (4) `link` the Mac, then from the Mac try a shell command and `ssh -W 127.0.0.1:22` with the key and confirm both fail; (5) check the Mac app's host list and tunnel process, then repeat `link` with an invalid entry injected by the test harness and confirm the list is restored; (6) repeat steps 4 and 5 for the Windows PC and confirm the app window is on the user's desktop; (7) `remove --client` the Windows PC, then `remove` the server, and record the clients, server and registry.

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: How should the CLI log through michielvha/logger

**Recommendation:** A. Add a way to choose the output writer to the logger, release it, and send logs to standard error, so the plugin uses your logger and keeps standard output for data.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Extend the logger** | Your logger in the plugin, meeting the terminal-output rule | A change and release in `michielvha/logger` before the plugin can merge |
| **B. Use it unchanged, only with `--debug`** | No logger change | Debug runs put JSON logs on standard output, mixed with `--json` results |
| **C. Plain `log/slog`** | No dependency | The plugin does not use your logger |

**Why this is yours:** it changes another of your repositories or bends a convention.


## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
