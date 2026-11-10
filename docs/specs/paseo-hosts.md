---
status: draft
status_description: "R-1 findings applied and the owner's answers folded in; a new spec review is needed."
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

This feature rebuilds that tool as a Go CLI in a new `paseo-hosts` plugin in the vhco-tools marketplace, following the remote-gui pattern. An owner asks an agent to add a server, and the skill runs two commands. `onboard` installs a password-protected daemon reachable only over SSH, with the relay off. `link` gives a desktop, macOS or Windows, a key that can open only the daemon tunnel, and adds the server to its Paseo app with no manual step. `unlink` takes one desktop off a server, and `remove` unlinks every desktop and deletes the daemon service, its config and the local password; it keeps the server's Paseo state and workspace and each desktop's key unless `--purge` is given. All settings come from environment variables and flags on the operator host. Plaintext passwords stay there, the server keeps a hash, and each desktop app keeps its own copy as it does for any host.

Excluded: phones, the web UI, the Linux desktop app, relay pairing, installing agent CLIs, and the operator host's own daemon. New servers default to Paseo's port 6767; existing registry files keep their port, 6867 for the first server, and keep working. The owner retires the local tool after installing the plugin. Adding the logger to the Go convention is a separate docs change.

Side effects to know: `link`, `unlink` and `remove` quit and restart the desktop app twice, briefly enable its debugging port on loopback, and keep a backup of the app's host list, which holds passwords, in the registry directory. If the app rejects the change, the previous list is restored. On Windows the app is started through a scheduled task in the signed-in session, which needs a signed-in user and OpenSSH Server on the PC.

The proposed checks are Go tests that run the CLI against SSH and DevTools stand-ins, the repository's Go lint and race checks in CI, and a manual run on a real server, Mac, Windows PC and fresh agent session. The Mac flow was observed with the Bash tool; nothing in this plugin is implemented, Windows is unmeasured, and the first independent review (R-1) found two blocking gaps, now addressed, so a new review is needed. The owner answered all six questions R-1 raised; no questions are open.

Acceptance authorizes implementing the plugin on a feature branch through the vh-adlc gates. Opening a PR, merging, merging the logger PR, and touching real servers or desktops during tests still need separate approval.

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
- The app keeps its hosts as JSON under the local storage key `@paseo:daemon-registry` (bundle `app-dist/_expo/static/js/web/index-803dd72b3aeeefd8a0cf2c30209668d4.js:16792`). Each entry is a strict object with `serverId`, optional `password`, `label`, `appearance`, `lifecycle`, `connections`, `preferredConnectionId`, `createdAt` and `updatedAt`, and a Remote SSH connection is `{id?, type: "remoteSsh", host, sshPort?, daemonPort?}` (same file, line 16796). The app normalizes the connection id to `ssh:<encoded host>:<sshPort or empty>:<daemonPort or empty>` and drops `daemonPort` when it is the default 6767 (same line); the local tool writes the same form (`lib/mac-app-register.mjs:10`, `:78-81`). When any stored entry fails normalization, the app removes the whole key (same file, line 16792).
- The desktop app's tunnel code has no platform branch: `spawn("ssh", buildSshTunnelArgs(target))` (`node_modules/@getpaseo/client/dist/node/ssh-tunnel.js:36` in `app.asar` 0.15.3). On Windows this resolves to the OpenSSH client on `PATH`, which reads `%USERPROFILE%\.ssh\config`.
- Paseo publishes the desktop app for Windows as well as macOS and Linux: release v0.15.4 lists `Paseo-Setup-0.15.4-x64.exe` and `Paseo-Setup-0.15.4-arm64.exe` beside the `.dmg` files (`gh release view --repo getpaseo/paseo`).
- The operator host has no SSH alias for a Windows machine yet (`~/.ssh/config`), so no Windows client behaviour is measured. In particular, it is unmeasured whether an app started from an OpenSSH session appears on the signed-in user's desktop; Design starts it through a scheduled task in the interactive session for that reason.

Repository and convention facts:

- The established pattern for a plugin CLI in this repository is Go: `plugins/remote-gui` has `go.mod` (`go 1.27.2`), `cmd/remote-gui`, `internal/`, `.golangci.yml`, and a Bash wrapper that builds the module into a private user cache with `GOTOOLCHAIN=local` (`plugins/remote-gui/scripts/remote-gui.sh:20-39`). CI builds, tests with `-race`, vets, lints and checks `go mod tidy -diff` for it (`.github/workflows/ci.yml:89-110`).
- The remote-gui wrapper builds without network access: it sets `GOPROXY=off` and `GOSUMDB=off` and builds with `-mod=readonly` (`plugins/remote-gui/scripts/remote-gui.sh:20-23`, `:49`), which works because that module requires no other module. `tests/remote-gui/package.test.ts:18-29` builds and runs an installed copy.
- Paseo 0.14.0 accepts Host headers for localhost and IP addresses and otherwise only for names in `daemon.hostnames` (`@getpaseo/server` `dist/server/server/hostnames.js:35-60`). The local tool sets it to localhost, `127.0.0.1` and the tailnet name (`paseo-host:200`), and keeps the daemon's config at `~/.local/share/paseo/state/config.json` because the unit runs with `--home ~/.local/share/paseo/state` (`paseo-host:198`, `:233`).
- `conventions/go.md:39` asks for `log/slog` with structured JSON logs. The owner's logger `github.com/michielvha/logger` (latest tag v0.0.5) wraps `slog`, reads `LOG_LEVEL`, and always writes JSON to standard output (`logger.go:55`, `slog.NewJSONHandler(os.Stdout, opts)`). The Go convention does not name it yet.
- `conventions/terminal-output.md` requires labelled `✓`, `✗`, `∅` and `›` status lines, `NO_COLOR` handling, plain append-only output on a non-TTY stream, and diagnostics on the documented diagnostic stream "so stdout remains usable as data" (lines 20-37, 43-57), and forbids decorating machine-readable output (line 65). Logs on standard output conflict with that.

The owner made these decisions in the session that produced the local tool: servers default to SSH-only with the relay off, and HTTPS publication is an opt-in for phones and browsers; plaintext passwords stay on the operator host; linking the desktop app needs no manual step.

The owner decided on 2026-11-10, in answer to this document's first questions: the CLI is written in Go, the repository's established pattern, and logs through `michielvha/logger`; Windows is the second client platform; removing a server is in the first version; new servers use Paseo's default port 6767, which the owner left to the recommendation; the feature is tracked in issue #71; the handoff note files are dropped in favour of `status`; and `link` keeps the app host-list backup after success. Later the same day the owner decided that the wrapper builds the binary on the operator host as remote-gui does, that the DevTools step uses `github.com/coder/websocket`, and that `remove` keeps the server's Paseo state and workspace unless `--purge` is given. After review R-1 the owner chose, on 2026-11-10: send logs to standard error by extending `michielvha/logger` with a writer option (draft PR michielvha/logger#8); desktops reach a server by its tailnet name, else the `ssh -G` host name, with `--client-host` to override; rollback is proven live through fault injection that only a `paseotest` build honours; an unsupported client exits 4; and the skill uses the default registry directory and asks only for a missing client alias. The owner also chose to let the build download its dependencies through Go's module proxy rather than commit a `vendor/` directory.

## Scope

In scope:

- A new `paseo-hosts` plugin in the vhco-tools marketplace for Codex and Claude: a Go CLI `paseo-hosts`, a Bash wrapper that builds it, a skill and a README.
- `onboard <alias>`: preflight, password creation, daemon install as a user service, SSH-only or published exposure, and authenticated verification. Re-running it refreshes an onboarded server without changing its password.
- `link <alias>` for macOS and Windows clients: the restricted client key, host key pinning, the client SSH alias, tunnel and shell-refusal checks, and the entry in the Paseo desktop app with automatic rollback.
- `unlink <alias> --client <client>` and `remove <alias>`: take a client off a server, or undo every link, the daemon service, its route and config, and the registry entry.
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
- The `michielvha/logger` change itself, reviewed and released in that repository, and adding the logger to the Go convention.
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
| Unlink | Take one client off a server: its app entry, its alias block and its key line on the server. |
| Remove | Unlink every client of a server, stop and delete its daemon service, route and config, and delete its registry entry. |

### Plugin layout

`plugins/paseo-hosts/` follows `plugins/remote-gui/`:

- `plugin.json` and `.claude-plugin/plugin.json` at version 0.1.0, `README.md`, and `skills/paseo-hosts/SKILL.md`.
- A Go module `github.com/michielvha/vh-adlc/plugins/paseo-hosts` with the Go version of `plugins/remote-gui/go.mod`, `cmd/paseo-hosts/main.go` for wiring only, packages under `internal/`, and `.golangci.yml` copied from remote-gui.
- The shell and PowerShell snippets that run on servers and clients, as files under `internal/` embedded with `go:embed`. They are sent to `ssh` on standard input, never as arguments, so they can be linted and tested on their own.
- `scripts/paseo-hosts.sh`, a wrapper that builds the module into `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts/builds` and runs it. Like `scripts/remote-gui.sh` it sets `GOTOOLCHAIN=local` and builds with `-mod=readonly`. Unlike remote-gui it leaves `GOPROXY` and `GOSUMDB` at Go's defaults, so the first build downloads the two dependencies through the module proxy and checks them against the committed `go.sum`; later builds reuse the module cache.

Both marketplace catalogs (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`) and the plugin table in `docs/reference/marketplace.md` list the plugin. A `paseo-hosts` job in `.github/workflows/ci.yml` runs the same build, `go test -race`, `go vet`, golangci-lint and `go mod tidy -diff` steps as the remote-gui job, and the `version` job waits for it.

### Output and logging

Human status goes to standard error as labelled lines, `› Installing Paseo 0.14.0`, `✓ Passed: password required`, `✗ Failed: tunnel refused`, `∅ Skipped: no Serve route`, with colour only on a terminal and never when `NO_COLOR` is non-empty, and `--plain` for ASCII words. With `--json`, each command prints one JSON object with `schema_version`, `command`, `result` and `data` on standard output. Exit codes: 0 success, 1 a failed check or remote step, 2 usage, 3 missing configuration, 4 an unsupported client. Debug diagnostics go through `michielvha/logger` at `LOG_LEVEL=debug`, initialised with `InitWithOptions(logger.Options{Output: os.Stderr})` from the logger release that adds that option.

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

One `<alias>.env` and one `<alias>.password` per server in `PASEO_HOSTS_DIR`. The file keys stay those of the local tool (`PASEO_SSH`, `PASEO_USER`, `PASEO_DNS`, `PASEO_LISTEN_PORT`, `PASEO_PUBLISHED`, `PASEO_SERVE_PORT`, `PASEO_URL`, `PASEO_VERSION`, `PASEO_AGENTS`, `PASEO_PASSWORD_FILE`, `PASEO_UNIT`), so existing files keep working. Three keys are added: `PASEO_CLIENTS`, the comma-separated client aliases `link` has run for, which `remove` uses; and `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, the host name and SSH port that clients' alias blocks use. `PASEO_DNS` holds the server's tailnet name when it runs Tailscale and is empty otherwise. The CLI parses `KEY=value` lines with an optional double-quoted value and rejects any other line; it never runs a registry file. A missing `PASEO_PUBLISHED` means `no`, a missing `PASEO_CLIENTS` means none recorded, and a missing `PASEO_CLIENT_HOST` or `PASEO_CLIENT_PORT` means `PASEO_DNS` and 22, which is what the local tool linked with (`paseo-host:508-513`).

### onboard

1. Preflight over SSH: Node, npm, Git, user lingering, a free daemon port, the agent CLIs found on `PATH`, and the tailnet name when Tailscale is present. Tailscale is required only with `--publish`.
2. Create the password on the operator host if `<alias>.password` is missing, otherwise reuse it. Hash it locally with `hashDaemonPassword` from the pinned Paseo runtime in `PASEO_HOSTS_CACHE`.
3. Install the pinned CLI on the server, set loopback listen, relay off, plugins off and `daemon.hostnames` to localhost, `127.0.0.1` and `PASEO_DNS` when it is set, write the hash through the persisted-config API, and install, enable and restart `paseo.service` with an explicit Node path and the agent CLIs' directories on `PATH`.
4. Without `--publish`, remove only Serve routes that proxy to the daemon port. With `--publish`, add one tailnet-only HTTPS route and refuse a Serve port that another route uses.
5. Write the registry file. `PASEO_CLIENT_HOST` is `--client-host` when given, else `PASEO_DNS` when set, else the `hostname` that `ssh -G <alias>` resolves on the operator host; `PASEO_CLIENT_PORT` is the `port` that `ssh -G` resolves. A host name that only the operator host can reach, for example behind `ProxyJump`, needs `--client-host`; `link` fails its tunnel check otherwise.
6. Verify over `PASEO_URL`: a connection without a password must be rejected and the stored password accepted. Retry while the WebSocket still answers 503 during daemon start. With `--publish`, also check HTTPS health.

The password reaches remote and local processes only through standard input or the environment, never as a command argument, and the CLI never prints it except through `password`.

### link

Before any change, the CLI probes the client over SSH. It runs `uname -s`; `Darwin` is macOS, and any other answer or a failure leads to a PowerShell probe, which identifies Windows even when Git's Unix tools are on `PATH`. Anything else stops with exit 4. Unless `--no-app` is given, the probe also checks that the Paseo app is installed and, on Windows, that the client user is signed in to a desktop session; otherwise `link` stops here with nothing changed.

1. Create the dedicated key in the client's `.ssh` directory with the client's `ssh-keygen` if it is missing, and read its public key.
2. On the server, back up `~/.ssh/authorized_keys`, remove any line with that key, and append `restrict,port-forwarding,permitopen="127.0.0.1:<port>",command="/bin/false" <key>`. `restrict` alone still allows commands, so the forced command stays.
3. Copy the operator host's known-hosts entry for the server to the client if the client has none, then write a `paseo-<alias>` block between `# BEGIN paseo-hosts paseo-<alias>` and `# END paseo-hosts paseo-<alias>` markers in the client's SSH config, replacing an earlier block or one with the local tool's `paseo-host` markers, with `IdentitiesOnly yes` and `StrictHostKeyChecking yes`. On Windows these files are in `%USERPROFILE%\.ssh`, and the CLI keeps the private key readable only by the user, as Windows OpenSSH requires.
4. From the client, check that the tunnel returns HTTP 200 from `/api/health` and that a shell command is refused.
5. Add the server to the desktop app unless `--no-app` is given, as described below, and add the client to `PASEO_CLIENTS`. With `--no-app`, copy the password to the client clipboard (`pbcopy` or `Set-Clipboard`) and print the Remote SSH values for a manual entry.

`status <alias>` prints the facts the local tool's handoff notes held: the server, exposure, port, Remote SSH value per linked client, and agent CLIs. The plugin writes no handoff files.

### Desktop app entry

The app accepts hosts only from its own UI or its local storage, so `link` writes the entry through the Chrome DevTools Protocol:

1. Read the daemon's `serverId` with `paseo daemon status --json` over `PASEO_URL`.
2. Quit the app on the client and relaunch it with `--remote-debugging-port` on a random loopback port. On macOS the CLI asks the app to quit with AppleScript, sends `SIGTERM` if it has not quit, and starts it with `open -a`. On Windows it stops the `Paseo` process and starts the app through a one-time scheduled task that runs in the signed-in user's interactive session, then deletes the task. The operator host forwards the debugging port over SSH for the duration of the step.
3. The CLI finds the app window by its `@paseo:client-id-v1` key and upserts one entry for the `serverId` in `@paseo:daemon-registry`: label `<alias>`, the password, `lifecycle: {}`, one `remoteSsh` connection to `paseo-<alias>` with id `ssh:paseo-<alias>::<daemon port>`, and that connection as preferred. At port 6767 the id ends in `:` and the connection has no `daemonPort`, matching the app's normalized form. It writes only the keys the app's strict schema allows and keeps every other host and an existing entry's `appearance` and `createdAt`. It saves the previous value to `PASEO_HOSTS_DIR/app-registry-<client>.backup.json` with mode 600 and keeps it after success. The DevTools WebSocket client is `github.com/coder/websocket`.
4. Reload the app and read the registry again. If the entry is gone or differs from the normalized form written in step 3, write the previous value back, reload, and fail.
5. Close the forward, quit the app, and relaunch it without the debugging port, whether or not step 3 or 4 succeeded.
6. Succeed only when the client shows an `ssh` process with `-W 127.0.0.1:<port> paseo-<alias>` started by the app within 30 seconds.

For the live rollback check, a binary built with the `paseotest` tag and run with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` adds a key the app's schema rejects to the entry before step 3 writes it, so the app drops the registry and step 4 rolls back. Release builds do not contain this code.

The client app stores the password in its own local storage, as it does for a host added by hand. The operator host keeps the only other copy, and the server keeps only the hash.

### unlink and remove

`unlink <alias> --client <client>` takes one client off a server:

1. Delete the server's entry from the client's desktop app with the same probe, quit, debug, write, verify and relaunch steps as `link`, keeping every other host.
2. Delete the `paseo-<alias>` block from the client's SSH config, including one with the local tool's `paseo-host` markers. The client key stays, since other servers use it.
3. Delete the key's line from the server's `authorized_keys` and drop the client from `PASEO_CLIENTS`.

`remove <alias>` unlinks every client in `PASEO_CLIENTS` and every `--client` given, in that order, and stops at the first failure, so a re-run continues where it stopped. When neither names a client, as with a registry the local tool wrote, it stops with exit 3 and asks for `--client` or `--no-clients`, so it never leaves an app entry behind silently. It then deletes every remaining `authorized_keys` line on the server that has both `permitopen="127.0.0.1:<daemon port>"` and `command="/bin/false"`, covering clients it could not reach.

On the server it then stops, disables and deletes `paseo.service`, deletes the Serve route to the daemon port, and deletes `~/.local/share/paseo/runtime` and `~/.local/share/paseo/state/config.json`, which holds the password hash. The rest of `~/.local/share/paseo/state` and `~/.local/share/paseo/workspace` stay unless `--purge` is given, which deletes `~/.local/share/paseo` entirely. Last, it deletes the registry files and password.

### Skill

`SKILL.md` triggers on requests to add, onboard, link, unlink, remove, check or list Paseo servers. It uses `PASEO_HOSTS_DIR` or its default, which `onboard` creates, and asks the owner for a client alias only when `PASEO_HOSTS_CLIENT` is unset and the request names none. It runs `onboard` and then `link`, tells the owner before `link`, `unlink` or `remove` that the desktop app will restart twice, confirms `unlink` and `remove` with the owner first, and reports the CLI's checks from `--json`. It never prints, reads into the conversation or pastes a password, and runs `password` only into a pipe.

### Delivery

Both catalogs point at `./plugins/paseo-hosts` on the default branch, as they do for `remote-gui`, so merging is the release path for the plugin; the wrapper builds the binary on the operator host. The feature is delivered when a fresh install from each catalog after the merge builds and runs `paseo-hosts --help` starting from an empty Go module cache. The vh-adlc binary release workflow does not change. The logger release with `InitWithOptions` comes first, and the module pins it.

## Acceptance Criteria

- [ ] AC-01: After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
- [ ] AC-02: `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
- [ ] AC-03: Running `onboard` again on an onboarded server keeps its password, leaves one unit and at most one route, and passes verification.
- [ ] AC-04: After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command and a forward to any other port. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
- [ ] AC-05: After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server.
- [ ] AC-06: When the app does not keep the new entry, `link` exits non-zero, the app's previous host list is restored, and the app runs again without a debugging port.
- [ ] AC-07: After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, and the registry files and password are gone. The rest of the server's Paseo state and workspace remain unless `--purge` was given. With a registry that names no clients, `remove` without `--client` or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line. Other servers and hosts in the apps are unchanged.
- [ ] AC-08: The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
- [ ] AC-09: Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`, and a registry line that is not `KEY=value` is rejected without being executed.
- [ ] AC-10: No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
- [ ] AC-11: Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command with the documented fields, and the exit code matches the documented meaning.
- [ ] AC-12: The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
- [ ] AC-13: The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
- [ ] AC-14: The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.

## Test Plan

Go tests run the CLI's commands with a stand-in `ssh` on `PATH` that executes the embedded snippets locally under a temporary home, with stand-in `npm`, `systemctl`, `loginctl`, `tailscale`, `osascript`, `open`, `powershell` and a stand-in daemon. A fake DevTools endpoint serves a page that applies the app's strict schema on reload and drops the whole registry on an invalid entry.

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | `internal/onboard` tests: assert the unit, config hash, removed or single route, password mode and reuse, and that verification fails when the stand-in daemon accepts a password-less connection. Live: manual steps 1 to 3. |
| AC-04 | `internal/link` tests: run the `authorized_keys` and SSH config snippets twice for both platforms against temporary files and assert one restricted line and one block, including replacement of a `paseo-host` block. Live: manual steps 4 and 6. |
| AC-05, AC-06 | `internal/clientapp` tests against the fake DevTools endpoint: the upsert keeps other hosts and `appearance`, the written id and `daemonPort` match the app's normalized form at 6767 and at 6867, and an entry the page rejects causes a non-zero exit and the restored registry. Live: manual steps 5 and 6. |
| AC-07 | `internal/remove` tests: after `link` with two stand-in clients, `remove` leaves no entry, block, key line, unit, route or registry file, keeps the state and workspace without `--purge` and deletes them with it, and keeps another server's files; a failure part way and a re-run finish the removal; `unlink` touches one client only; with a local-tool registry and a key line the local tool wrote, `remove` exits 3 without `--client`, and with `--client` it removes the app entry, the `paseo-host` block and the key line. Live: manual step 7. |
| AC-08 | `cmd/paseo-hosts` tests: run `onboard` and `link` with only the documented variables in a temporary home, record the stand-in's arguments, and check the exit-3 error. A test searches the plugin files for names from a list given in `PASEO_HOSTS_FORBIDDEN_NAMES`, which the live run sets to the operator host's names. |
| AC-09 | `internal/registry` tests: parse the local tool's format, and reject a line containing a command substitution without running it. |
| AC-10 | `cmd/paseo-hosts` tests record every stand-in's argument list, the debug log at `LOG_LEVEL=debug`, and both output streams during every command, and assert the password appears in none of them. |
| AC-11 | Reporter tests capture success, failure, skip and partial outcomes with a terminal and a pipe, with `NO_COLOR` absent, empty, `0` and `1`, and with `--plain`; assert no ANSI bytes in plain captures and that `--json` output parses with the documented fields and exit codes. |
| AC-12 | Manual: install `paseo-hosts@vhco-tools` in Codex and in Claude, start a new session on the operator host, ask to add a named server, and record that the agent loaded the skill, ran both commands, and showed no password. |
| AC-13 | Implementation review compares the README, `SKILL.md`, `paseo-hosts --help` and the marketplace row with the Terms table and records each mismatch. |
| AC-14 | A CI test copies `plugins/paseo-hosts` to a temporary directory, runs `scripts/paseo-hosts.sh --help` with an empty temporary `GOMODCACHE`, `GOFLAGS` unset and the default `GOPROXY`, and asserts it exits 0 and that both dependencies are now in that cache, as `tests/remote-gui/package.test.ts` does for remote-gui. |

Manual procedure on the operator host, a test server, the Mac and a Windows PC with OpenSSH Server and a signed-in user: (1) `onboard` the server and record the unit, config and Serve state; (2) re-run `onboard` and confirm the password file is unchanged; (3) `onboard --publish`, check the route and health, then `onboard` again and confirm the route is gone; (4) `link` the Mac, then from the Mac try a shell command and `ssh -W 127.0.0.1:22` with the key and confirm both fail; (5) check the Mac app's host list and tunnel process, check that no app process has `--remote-debugging-port` and the debugging port refuses connections, then run `link` again with a `paseotest` build and `PASEO_HOSTS_TEST_REJECT_ENTRY=1`, confirm it exits non-zero, the previous host list is back and no debugging port remains; (6) repeat steps 4 and 5 for the Windows PC and confirm the app window is on the user's desktop; (7) `unlink` the Windows PC, then `remove` the server, and record the clients, server and registry.

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-10 | R-1 | spec | `43cc4f95a8aa696194d3c5cbad3d8f210bb57d98` | unknown | procedural | Two blocking and five should-fix factual or judgement findings, four nits; model identity not attested. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Plugin layout and Delivery
EVIDENCE: docs/specs/paseo-hosts.md:119 says the wrapper builds the module "the way `scripts/remote-gui.sh` does". plugins/remote-gui/scripts/remote-gui.sh:22-23 exports GOPROXY=off and GOSUMDB=off, line 11 prints "nothing was downloaded", and line 49 builds with -mod=readonly. That works only because plugins/remote-gui/go.mod has no require lines and the plugin has no go.sum. This plugin adds github.com/coder/websocket (line 176) and github.com/michielvha/logger (line 125), so a wrapper copied from remote-gui fails module lookup on an operator host whose module cache lacks them. Delivery (line 199) says "a fresh install from each catalog after the merge builds and runs `paseo-hosts --help`", but no Test Plan row checks a build from an installed copy, which tests/remote-gui/package.test.ts does for remote-gui.
PROPOSAL: Raise an open question on vendoring the dependencies (committed vendor/ with -mod=vendor) versus allowing the module proxy in the wrapper. Then add a criterion and proof that the wrapper builds and runs `--help` from an installed copy with an empty module cache.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design, remove; Acceptance Criteria AC-07 and AC-09
EVIDENCE: Line 145 says "a missing `PASEO_CLIENTS` means none recorded". Line 185 says `remove` "runs these steps for each client in `PASEO_CLIENTS`". AC-09 requires local-tool registry files "without `PASEO_PUBLISHED` or `PASEO_CLIENTS`" to work unchanged with `remove`. AC-07 requires that afterwards "no linked client's app lists the server or has its alias block" and that `authorized_keys` "has no line for a client key of this plugin that permits the daemon port". The real server onboarded on 2026-11-10 was linked to the Mac by the local tool, which writes no PASEO_CLIENTS (paseo-host:340-352). Under this Design, `remove` on that server leaves the Mac app entry with its password, the Mac alias block and the server's tunnel-only key line. The AC-07 proof uses only clients that `link` recorded.
PROPOSAL: Define how `remove` finds clients the local tool linked, for example server-side removal of every `permitopen="127.0.0.1:<port>",command="/bin/false"` line plus a documented `--client` path for unrecorded clients. Add a local-tool registry case to the AC-07 proof.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Registry and onboard
EVIDENCE: Line 153 stores "the `hostname` and `port` that `ssh -G <alias>` resolves" for clients, but line 145 says the keys "stay those of the local tool" with only `PASEO_CLIENTS` added. No key holds a port, and `PASEO_DNS` is still the tailnet name that `--publish` verification and `PASEO_URL` use (paseo-host:84, :327). Step 3 (line 151) also leaves out `daemon.hostnames`, which the local tool sets to include the tailnet name (paseo-host:200). Paseo 0.14.0 rejects Host headers outside that allowlist apart from localhost and IP addresses (@getpaseo/server dist/server/server/hostnames.js:35-60), so a published route needs it. The Design also does not say what goes in `PASEO_DNS` when Tailscale is absent. A hostname from `ssh -G` may also resolve only from the operator host, for example behind ProxyJump. The document makes this trade-off without raising it as a question.
PROPOSAL: Name the registry keys for the client-facing host name and port, and say what `PASEO_DNS` and `daemon.hostnames` hold with and without `--publish`. Raise the `ssh -G` versus tailnet-name choice as an open question, or state the limitation.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context, Background; Design, Desktop app entry
EVIDENCE: Line 58 gives the Remote SSH connection as `{type: "remoteSsh", host, sshPort?, daemonPort?}`. The bundle schema at line 16796 also has `id: s.z.string().optional()`. The same line's normalizer builds the id as `ssh:<host>:<sshPort>:<daemonPort>` and drops `daemonPort` when it equals DEFAULT_SSH_DAEMON_PORT, which is `const o=6767`. The local tool handles both cases (lib/mac-app-register.mjs:77-82) and checks only for a remoteSsh connection to the host (line 116). Design step 3 (line 176) gives no id rule and says "with the daemon port", while `preferredConnectionId` must name a connection id. Step 4 fails when the entry is "changed". Under the new default port 6767, which the local tool's 6867 run never covered, a literal write and comparison can mismatch the app's normalized form.
PROPOSAL: State the connection id format, that `daemonPort` is omitted at 6767, and that the step 4 check compares against the app's normalized form. Add a 6767 case to the clientapp tests.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-05 and AC-06
EVIDENCE: AC-05 requires the app to run "without a debugging port in the user's session", and AC-06 says "the app runs again without a debugging port". The proof row (line 225) runs only against a fake DevTools endpoint, and manual step 5 (line 234) checks only "the Mac app's host list and tunnel process". No step observes that the relaunched app has no debugging port. Manual step 5 also uses "an invalid entry injected by the test harness" against the live app, but the Design defines no harness, flag or hook that injects one into a real `link`.
PROPOSAL: Add a manual check that the relaunched app's process has no `--remote-debugging-port` and that the port is closed. Either specify the test-only injection mechanism and its guard, or describe a concrete live way to make the app reject the entry.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, link and Desktop app entry
EVIDENCE: Line 175 says "without a signed-in user, `link` fails before changing anything". The app step runs at link step 5, after steps 1 to 3 have already created the client key, changed the server's `authorized_keys` and rewritten the client's SSH config (lines 162-164).
PROPOSAL: Move the signed-in-user check into the platform probe before step 1, or reword it to say which changes have been made when it fails.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary
EVIDENCE: The summary (line 24) says "`remove` undoes both". The Design keeps the client key (line 188) and keeps the server's Paseo state and workspace unless `--purge` is given (line 191), which line 74 records as an owner decision. The summary also does not say that new servers use port 6767 while the existing local-tool server uses 6867 (paseo-host:285). The standard asks the summary to cover important defaults and owner decisions.
PROPOSAL: Say in the summary that `remove` keeps server state, workspace and the client key unless `--purge` is given, and that new servers default to 6767 while existing registry files keep their port.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, link and Output and logging
EVIDENCE: Line 160 says an unsupported client platform "stops with exit 3", but line 125 defines exit 3 as "missing configuration". `uname -s` on a Windows PC with Git's Unix tools on PATH returns a MINGW string, so that PC would be classed as unsupported before the PowerShell probe runs.
PROPOSAL: Use exit 1 or a documented code for an unsupported platform. Run the Windows probe when `uname -s` output is not `Darwin` or `Linux`, not only when it fails.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-01
EVIDENCE: AC-01 says "the plaintext password exists on the operator host only". After `link`, AC-05 requires the client app to hold "the stored password", and line 180 says the app stores it. An implementation review after the manual procedure would find AC-01 false as worded.
PROPOSAL: Reword AC-01 so the plaintext password is absent from the server and its only file copy is in `PASEO_HOSTS_DIR` with mode 600.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Design, remove
EVIDENCE: Line 191 deletes "the server's Paseo runtime and config" but keeps "the server's Paseo state". The config is `~/.local/share/paseo/state/config.json`, inside the state directory, because the daemon runs with `--home $root/state` (paseo-host:198, :207, :233).
PROPOSAL: Name the exact paths `remove` deletes and keeps, for example the runtime directory and `state/config.json`.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Design, Skill
EVIDENCE: Line 195 says the skill "checks that `PASEO_HOSTS_DIR` exists" and otherwise asks the owner. The Configuration table gives it the default `~/.config/paseo-hosts`, and AC-08 expects a "fresh `PASEO_HOSTS_DIR`". On a first run the skill would ask for a value the CLI already defaults and creates.
PROPOSAL: Have the skill ask only when the variable is unset and the owner has not accepted the default, and let `onboard` create the directory.
