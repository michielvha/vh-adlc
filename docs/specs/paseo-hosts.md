---
status: draft
status_description: "Revising the desktop app session after review R-23: update installs, lost pages and restores the app undoes."
issue: https://github.com/michielvha/vh-adlc/issues/71
branch: feat/paseo-hosts
goal: "An owner can ask an agent to add a Paseo server, and the vhco-tools paseo-hosts plugin installs a password-protected SSH-only daemon there and links the owner's macOS and Windows Paseo desktop apps to it, with all host-specific configuration supplied from the operator host's environment."
covers:
  - plugins/paseo-hosts/
  - tests/paseo-hosts/
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - docs/reference/marketplace.md
  - .github/workflows/ci.yml
  - cmd/vh-adlc/workflow_test.go
  - README.md
  - CONTRIBUTING.md
---

# Plan: Paseo host onboarding plugin

Rebuild the working Paseo server onboarding and desktop-app linking tool as a Go CLI in the `paseo-hosts` plugin of the vhco-tools marketplace, with a skill that lets an agent add or remove a server on request and no host data in the plugin.

## Context

### Owner summary

The owner runs Paseo daemons on Linux servers and uses them from the Paseo desktop app on a Mac and a Windows PC. A local Bash tool did this for one server, but it is untracked and names the owner's machines.

This feature rebuilds it as a Go CLI in a new vhco-tools plugin, `paseo-hosts`. `onboard` installs a password-protected daemon reachable only over SSH, relay off; `--publish` adds a tailnet-only HTTPS route. `link` gives a macOS or Windows desktop a key that opens the daemon tunnel and, apart from the Unix socket limit below, nothing else, and adds the server to its Paseo app unattended. `unlink` takes one desktop off; `remove` unlinks all and deletes the service, config and local password, keeping Paseo state and workspace unless `--purge`. Plaintext passwords stay on the operator host and in the apps. Excluded: phones, the web UI, the Linux app, relay pairing, agent CLI installs and the operator's own daemon.

Side effects: the first run downloads two Go libraries and the pinned Paseo CLI. `link`, `unlink` and `remove` restart the desktop app at least twice, and more after a rollback or when it stops answering, which stops its built-in daemon and may install a downloaded update; the CLI waits up to 2 minutes for that install. They briefly open a loopback debugging port and keep a host-list backup, passwords included. Windows needs OpenSSH Server and a signed-in user.

What changed: review R-23 found the app session unreliable. On Windows, the app installed its 0.15.4 update over 0.15.3 as it quit, which left it stopped although `link` reported success. On the Mac, a debug-mode app sometimes exits within a second, and in two rollbacks the window stopped answering after the reload, so the app came back with no hosts. The app can also delete the restored list right after the CLI writes it, and the CLI never read it back. The revised session waits for a running update installer, starts an app that exits early again, reconnects to a lost window, reads every restore back and checks a rollback again after a restart. If it still cannot confirm the list, it exits 1 naming the backup file. AC-05 now covers an update installed on quit, and AC-06 judges the host list after the app's next start, including a lost window and a deleted restore. The owner's 2026-11-11 decisions stand: the Unix socket limit, OpenSSH 7.8 with no version check, and checking the marketplace install (AC-12) after the merge as https://github.com/michielvha/vh-adlc/issues/77. The revision resets every criterion; that residual returns at the next review.

Checks run: T1 to T38 pass Go tests, lint, race checks, a real `sshd` test and an installed-copy build, and R-22 and R-23 ran manual steps 1 to 7 live. Planned: fake DevTools and stand-in installer tests, and three live rollbacks per desktop, each read back after a restart. An update cannot be made pending on demand, so the live run records whether one was.

Acceptance authorizes T39 to T44 on the feature branch and those live runs, which restart both desktop apps. The owner has approved opening the PR once the complete gate passes; merging stays separate.

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

The owner decided on 2026-11-10, in answer to this document's first questions: the CLI is written in Go, the repository's established pattern, and logs through `michielvha/logger`; Windows is the second client platform; removing a server is in the first version; new servers use Paseo's default port 6767, which the owner left to the recommendation; the feature is tracked in [issue #71](https://github.com/michielvha/vh-adlc/issues/71); the handoff note files are dropped in favour of `status`; and `link` keeps the app host-list backup after success. Later the same day the owner decided that the wrapper builds the binary on the operator host as remote-gui does, that the DevTools step uses `github.com/coder/websocket`, and that `remove` keeps the server's Paseo state and workspace unless `--purge` is given. After review R-1 the owner chose, on 2026-11-10: send logs to standard error by extending `michielvha/logger` with a writer option ([draft PR michielvha/logger#8](https://github.com/michielvha/logger/pull/8)); desktops reach a server by its tailnet name, else the `ssh -G` host name, with `--client-host` to override; rollback is proven live through fault injection that only a `paseotest` build honours; an unsupported client exits 4; and the skill uses the default registry directory and asks only for a missing client alias. After R-2 the owner set the rule that every path runs unattended, so `link --no-app` sets up SSH access only and puts no password on a clipboard for a manual entry. After R-3 the owner chose `remove --skip-server` with app entries matched by connection host for a dead server, Windows snippet tests under a real `pwsh` with no extra CI step and a lean test suite overall, and a fixed set of `status` fields. The owner also chose to let the build download its dependencies through Go's module proxy rather than commit a `vendor/` directory. After R-10 to R-14 the owner chose, on 2026-11-11: a Unix socket remote forward stays a stated known limit; no CI step is added for the real `sshd` test; the implementation reviewer runs manual steps 1 to 7 itself and restores the setup; AC-12 carries the residual tracked in [issue #77](https://github.com/michielvha/vh-adlc/issues/77); and servers need OpenSSH 7.8 or later, with no version check. After R-17 the owner chose, the same day, a standard-library terminal check over adding `golang.org/x/term`.

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
- Blocking Unix socket remote forwards from client keys, which needs a root-owned sshd setting on each server.

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
- The shell and PowerShell snippets that run on servers and clients, as files under `internal/` embedded with `go:embed`. They are sent to `ssh` on standard input, never as arguments, so they can be linted and tested on their own. On Windows the remote command is the fixed bootstrap `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "iex ([Console]::In.ReadToEnd())"`, which holds no data and works whether the OpenSSH default shell is `cmd.exe` or PowerShell; the snippets keep to Windows PowerShell 5.1 syntax, the version Windows ships. Because 5.1 writes UTF-16 or BOM-prefixed files that OpenSSH rejects, the snippets write `config`, `known_hosts` and key files only through `[IO.File]::WriteAllText` with UTF-8 without a BOM. Because 5.1 drops empty native arguments, `ssh-keygen` runs through `Start-Process` with a single argument string so `-N ""` survives.
- `scripts/paseo-hosts.sh`, a wrapper that builds the module into `builds/` under `PASEO_HOSTS_CACHE` (default `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts`) and runs it. Like `scripts/remote-gui.sh` it sets `GOTOOLCHAIN=local` and builds with `-mod=readonly`. Unlike remote-gui it leaves `GOPROXY` and `GOSUMDB` at Go's defaults, so the first build downloads the two dependencies through the module proxy and checks them against the committed `go.sum`; later builds reuse the module cache.

Both marketplace catalogs (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`) and the plugin table in `docs/reference/marketplace.md` list the plugin. The plugin tables in `README.md` and `CONTRIBUTING.md` list it too, and `CONTRIBUTING.md` names its checks next to remote-gui's. A `paseo-hosts` job in `.github/workflows/ci.yml` runs the same build, `go test -race`, `go vet`, golangci-lint and `go mod tidy -diff` steps as the remote-gui job, then the installed-copy test with `bun test tests/paseo-hosts`. The `version` job waits for it, and `cmd/vh-adlc/workflow_test.go`, which pins the `version` job's needs to an exact list (`:106`), adds `paseo-hosts` to that list.

### Output and logging

Human status goes to standard error as labelled lines, `› Installing Paseo 0.14.0`, `✓ Passed: password required`, `✗ Failed: tunnel refused`, `∅ Skipped: no Serve route`, with colour only on a terminal and never when `NO_COLOR` is non-empty, and `--plain` for ASCII words. With `--json`, each command prints one JSON object with `schema_version`, `command`, `result` and `data` on standard output. `--help` with `--json` prints one such object, with `command` set to the command whose help it is, or `help`, and the help text under `data.usage`. Standard error counts as a terminal only when the terminal driver answers for it, so a redirect to `/dev/null` or a file is not one. The check uses only the standard library: a `syscall` ioctl (`TCGETS` on Linux, `TIOCGETA` on macOS), and on any other system standard error never counts as a terminal. The macOS check is a direct system call. The `paseo-hosts` CI job does no cross build, so only T35's one-time `GOOS=darwin go vet` checks that file. Exit codes: 0 success, 1 a failed check or remote step, 2 usage, 3 missing configuration, 4 an unsupported client. Debug diagnostics go through `michielvha/logger` at `LOG_LEVEL=debug`, initialised with `InitWithOptions(logger.Options{Output: os.Stderr})` from the logger release that adds that option.

### Configuration

The plugin contains no host names, user names, tailnet names or paths of one machine. Every setting comes from a flag, an environment variable or the registry:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PASEO_HOSTS_DIR` | `~/.config/paseo-hosts` | Registry files and plaintext passwords, mode 700 and 600 |
| `PASEO_HOSTS_CLIENT` | none | SSH alias of the client for `link`; `--client` overrides it. Without either, `link` stops with exit 3 naming the variable |
| `PASEO_HOSTS_VERSION` | `0.14.0` | Paseo CLI version installed on servers and used locally |
| `PASEO_HOSTS_LISTEN_PORT` | `6767` | Daemon port for a newly onboarded server; `--listen-port` overrides it |
| `PASEO_HOSTS_SERVE_PORT` | `8956` | Tailnet HTTPS port when `--publish` is given |
| `PASEO_HOSTS_CACHE` | `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts` | Local Paseo runtime used for hashing and verification, and the build cache. The CLI installs `@getpaseo/cli` at `PASEO_HOSTS_VERSION` into `runtime/<version>/` with `npm install --prefix` the first time a command needs it |
| `PASEO_HOSTS_CLIENT_KEY` | `id_ed25519_paseo` | File name of the dedicated key in the client's `.ssh` directory |

The operator host needs Go to build the CLI and Node and npm for the local runtime. A command that needs the runtime and finds no `node` or `npm` on `PATH` stops with exit 3 naming the missing tool, before any change. The prefix avoids Paseo's own variables such as `PASEO_PASSWORD`. Server-side paths stay fixed: `~/.local/share/paseo/{runtime,state,workspace}` and `paseo.service`.

### Registry

One `<alias>.env` and one `<alias>.password` per server in `PASEO_HOSTS_DIR`. The file keys stay those of the local tool (`PASEO_SSH`, `PASEO_USER`, `PASEO_DNS`, `PASEO_LISTEN_PORT`, `PASEO_PUBLISHED`, `PASEO_SERVE_PORT`, `PASEO_URL`, `PASEO_VERSION`, `PASEO_AGENTS`, `PASEO_PASSWORD_FILE`, `PASEO_UNIT`), so existing files keep working. Three keys are added: `PASEO_CLIENTS`, the comma-separated client aliases `link` has run for, which `remove` uses; and `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, the host name and SSH port that clients' alias blocks use. `PASEO_DNS` holds the server's tailnet name when it runs Tailscale and is empty otherwise. The CLI parses `KEY=value` lines with an optional double-quoted value and rejects any other line; it never runs a registry file. A missing `PASEO_PUBLISHED` means `no`, a missing `PASEO_CLIENTS` means none recorded, and a missing `PASEO_CLIENT_HOST` or `PASEO_CLIENT_PORT` means `PASEO_DNS` and 22, which is what the local tool linked with (`paseo-host:508-513`).

### onboard

When `<alias>.env` exists, `onboard` reads it first and keeps its daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`; missing keys take the meanings given under Registry. A `--listen-port` that differs from the recorded port stops with exit 2 and changes nothing, because linked clients' key lines and app entries name the old port. A `--client-host` replaces the recorded host name, and `onboard` then names the linked clients that need `link` again.

1. Preflight over SSH: Node, npm, Git, user lingering, a daemon port that is free or held by this server's `paseo.service`, the agent CLIs found on `PATH`, and the tailnet name when Tailscale is present. Tailscale is required only with `--publish`.
2. Create the password on the operator host if `<alias>.password` is missing, otherwise reuse it. Hash it locally with `hashDaemonPassword` from the pinned Paseo runtime in `PASEO_HOSTS_CACHE`.
3. Install the pinned CLI on the server, set loopback listen, relay off, plugins off and `daemon.hostnames` to localhost, `127.0.0.1` and `PASEO_DNS` when it is set, write the hash through the persisted-config API, and install, enable and restart `paseo.service` with an explicit Node path and the agent CLIs' directories on `PATH`.
4. Without `--publish`, remove only Serve routes that proxy to the daemon port. With `--publish`, add one tailnet-only HTTPS route and refuse a Serve port that another route uses.
5. Write the registry file. For a new server, `PASEO_CLIENT_HOST` is `--client-host` when given, else `PASEO_DNS` when set, else the `hostname` that `ssh -G <alias>` resolves on the operator host; `PASEO_CLIENT_PORT` is the `port` that `ssh -G` resolves. A host name that only the operator host can reach, for example behind `ProxyJump`, needs `--client-host`; `link` fails its tunnel check otherwise.
6. Verify over `PASEO_URL`: a connection without a password must be rejected and the stored password accepted. Retry while the WebSocket still answers 503 during daemon start. With `--publish`, also check HTTPS health.

The password reaches remote and local processes only through standard input or the environment, never as a command argument, and the CLI never prints it except through `password`.

### link

Before any change, the CLI probes the client over SSH. It runs `uname -s`; `Darwin` is macOS, and any other answer or a failure leads to a PowerShell probe, which identifies Windows even when Git's Unix tools are on `PATH`. Anything else stops with exit 4. The probe also looks up the server's host keys on the operator host with `ssh-keygen -F` under the name and port that `ssh -G <alias>` resolves (its `hostkeyalias` when set), which finds hashed entries too; with no entry `link` stops with exit 1, telling the owner to connect once with `ssh <alias>`. Unless `--no-app` is given, the probe also checks that the Paseo app is installed and, on Windows, that the client user is signed in to a desktop session; otherwise `link` stops here with nothing changed.

1. Add the client to `PASEO_CLIENTS` first, so a `link` that fails later still leaves a client that `unlink` and `remove` find. Create the dedicated key in the client's `.ssh` directory with the client's `ssh-keygen` if it is missing, and read its public key.
2. On the server, back up `~/.ssh/authorized_keys`, remove any line with that key, and append `restrict,port-forwarding,permitopen="127.0.0.1:<port>",permitlisten="127.0.0.1:1",command="/bin/false" <key> paseo-hosts:<client>`, whose comment names the client. `restrict` alone still allows commands, so the forced command stays. `port-forwarding` enables remote forwards as well as local ones, and `ssh -N` never runs the forced command, so `permitlisten` limits TCP remote forwards to loopback port 1, which the server user cannot bind unless it is root, holds `CAP_NET_BIND_SERVICE` or the server lowers `net.ipv4.ip_unprivileged_port_start`; OpenSSH rejects the whole key for `permitlisten="none"`. A line written before this option, by the local tool or an earlier build, still matches the removal rules below, and keeps allowing TCP remote forwards until `link` runs again for that client and server, which replaces it. Servers therefore need OpenSSH 7.8 or later, which added `permitlisten`. Nothing checks the version: on an older server `link` writes the client's files and key line, then fails at the step 4 tunnel check. sshd rejects the whole key when it cannot parse an option, so on such a server a `link` run again for a client that already works also replaces its working line and breaks that client's tunnel there; recovery means putting the client's previous line back by hand, because `authorized_keys.bak-paseo-hosts` holds only the state before the latest `link` or `unlink` on that server, and `unlink` removes the client rather than restoring its tunnel. No key option stops a Unix socket remote forward (`ssh -R <path>:...`), so the key can still create a socket at an unused path the server user can write; blocking that needs a server-wide sshd setting, which the plugin does not make.
3. Write those host keys to the client's `known_hosts` as plain entries for `PASEO_CLIENT_HOST`, as `[host]:port` when `PASEO_CLIENT_PORT` is not 22, replacing earlier entries for that name. Then write a `paseo-<alias>` block between `# BEGIN paseo-hosts paseo-<alias>` and `# END paseo-hosts paseo-<alias>` markers in the client's SSH config, replacing an earlier block or one with the local tool's `paseo-host` markers, with `IdentitiesOnly yes` and `StrictHostKeyChecking yes`. On Windows these files are in `%USERPROFILE%\.ssh`, and the CLI keeps the private key readable only by the user, as Windows OpenSSH requires.
4. From the client, check that the tunnel returns HTTP 200 from `/api/health` and that a shell command is refused.
5. Add the server to the desktop app unless `--no-app` is given, as described below. With `--no-app`, `link` sets up SSH access only: it leaves the app and the clipboard alone and prints no password, and a later `link` without `--no-app` adds the app entry unattended.

`status <alias>` prints the facts the local tool's handoff notes held, with these `--json` keys: `alias`, `ssh` (`PASEO_SSH`), `exposure` (`ssh-only` or `tailnet`), `daemon_port`, `url` (`PASEO_URL`), `clients` (a list of `name` and `remote_ssh`, the Remote SSH value) and `agents`. The plugin writes no handoff files.

`verify <alias>` runs onboard step 6 against the registry entry, including HTTPS health when `PASEO_PUBLISHED` is `yes`, changes nothing, and exits 1 on a failed check. `list` prints one line per registry file with its alias, `PASEO_SSH` and `PASEO_URL`, and with `--json` a list of objects with the keys `alias`, `ssh` and `url`.

### Desktop app entry

The app accepts hosts only from its own UI or its local storage, so `link` writes the entry through the Chrome DevTools Protocol:

1. Read the daemon's `serverId` with `paseo daemon status --json` over `PASEO_URL`.
2. Quit the app on the client, wait as described below, and relaunch it with `--remote-debugging-port` on a random loopback port. On macOS the CLI asks the app to quit with AppleScript, sends `SIGTERM` if it has not quit, and starts it with `open -a`. On Windows it stops the `Paseo` process, which holds none of the CLI's writes yet, and starts the app through a one-time scheduled task that runs in the signed-in user's interactive session, then deletes the task. The operator host forwards the debugging port over SSH for the duration of the step. A debug launch succeeds when the app answers on its debugging port. If the app's main process exits before that, the CLI waits 3 seconds and launches it again, up to three launches in all. In live runs on the Mac, a debug-mode app exited by itself within a second of starting, after it applied its login shell environment and before it opened a window, in 3 of about 9 runs; the likely cause is `setupSingleInstanceLock`, which quits without a log line when `requestSingleInstanceLock()` fails (`dist/main.js:702-707` in app 0.15.4).
3. The CLI finds the app window by its `@paseo:client-id-v1` key and upserts one entry for the `serverId` in `@paseo:daemon-registry`: label `<alias>`, the password, `lifecycle: {}`, one `remoteSsh` connection to `paseo-<alias>` with id `ssh:paseo-<alias>::<daemon port>`, and that connection as preferred. At port 6767 the id ends in `:` and the connection has no `daemonPort`, matching the app's normalized form. It writes only the keys the app's strict schema allows and keeps every other host and an existing entry's `appearance` and `createdAt`. It saves the previous value to `PASEO_HOSTS_DIR/app-registry-<client>.backup.json` with mode 600 and keeps it after success. The DevTools WebSocket client is `github.com/coder/websocket`.
4. Reload the app, wait 4 seconds and read the registry again. If the entry is gone or differs from the normalized form written in step 3, restore the previous value as described below and fail.
5. Whether or not step 3 or 4 succeeded, wait until 8 seconds have passed since the last registry write, which covers Chromium's default 5-second localStorage commit delay (`local_storage_impl.cc`, `kCommitDefaultDelaySecs`); its rate limiter can hold a commit longer, and only a graceful shutdown flushes pending writes (`LocalStorageImpl::ShutDown`). Then quit the app gracefully: AppleScript on macOS, and on Windows `window.close()` through DevTools, after which the app quits when its last window closes (`main.js:876-879` in app 0.15.3). Force-stop it only if it is still running 20 seconds later; after a force-stop, `link` succeeds only if step 6 confirms the tunnel, and `unlink` or a rollback exits 1 and reports that the app may not have saved the change, so a re-run repeats it. Close the forward, then quit and wait as described below. After a rollback, debug-launch the app once more and read the registry; if it does not hold the backed-up value, restore it and repeat this step once. If the CLI still cannot confirm the previous host list, it exits 1 and names `PASEO_HOSTS_DIR/app-registry-<client>.backup.json`, which holds it.
6. Relaunch the app without the debugging port and wait until its main process runs. `link` succeeds only when the client shows an `ssh` process with `-W 127.0.0.1:<port> paseo-<alias>` started by the app within 30 seconds. Every command then checks that the app's main process still runs, and fails if it does not.

To quit and wait, the CLI waits until the app's main process is gone, then until at least 3 seconds have passed and no app update installer runs, for up to 120 seconds. On macOS the installer is the Squirrel.Mac `ShipIt` process whose arguments name the job `sh.paseo.desktop.ShipIt`. A match on `ShipIt` alone would also catch other apps' installers, such as VS Code's `com.microsoft.VSCode.ShipIt`, which stays running on the Mac. On Windows the installer is any process whose executable is under `%LOCALAPPDATA%\@getpaseodesktop-updater\`. If an installer still runs after 120 seconds, the command exits 1 without starting the app and says to run it again once the update has installed.

To restore, the CLI writes the backed-up value, or removes the key when there was none, reloads, waits 4 seconds and reads the key back. It repeats this up to three times until the key holds the same JSON value as the backup. The read-back is needed because the app can delete `@paseo:daemon-registry` once more after the CLI writes it. Chromium then commits the write and the delete in one batch and only the delete persists, which the Mac app's localStorage log showed for failed rollbacks on app 0.15.4.

When the window stops answering after a reload in step 4 or in a restore, the CLI quits and waits, debug-launches the app again and continues with the read that follows the reload. It does this at most twice in one command.

For the live rollback check, a binary built with the `paseotest` tag and run with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` adds a key the app's schema rejects to the entry before step 3 writes it, so the app drops the registry and step 4 rolls back. Release builds do not contain this code.

Every graceful quit in steps 2 and 5, and the macOS `SIGTERM` fallback, runs the app's `before-quit` path. With the default settings `manageBuiltInDaemon: true` and `keepRunningAfterQuit: false` (`dist/settings/desktop-settings.js:18-19`), that path stops the desktop's own built-in daemon and the agents in it, and it installs a downloaded app update before exiting (`main.js:844-852` in app 0.15.3, `main.js:874` in 0.15.4). The CLI does not change those settings; quit and wait keeps it from starting the app while that install runs.

The client app stores the password in its own local storage, as it does for a host added by hand. The operator host keeps the only other copy, and the server keeps only the hash.

### unlink and remove

`unlink <alias> --client <client>` takes one client off a server:

1. Delete the server's entry from the client's desktop app with the same probe, quit, debug, write, verify and relaunch steps as `link`, keeping every other host. When the probe finds no Paseo app on the client, skip this step. When the server's daemon cannot be reached for its `serverId`, find the entry by its `paseo-<alias>` connection host instead.
2. Delete the `paseo-<alias>` block from the client's SSH config, including one with the local tool's `paseo-host` markers. The client key stays, since other servers use it.
3. Delete the key's line from the server's `authorized_keys` and drop the client from `PASEO_CLIENTS`.

`unlink <alias> --client <client> --server-only` is for a client that is gone, offline or has no app. It does not contact the client: it deletes the server's `authorized_keys` lines with the comment `paseo-hosts:<client>`, drops the client from `PASEO_CLIENTS`, and reports that the client may still hold the app entry and alias block. A client in `PASEO_CLIENTS` with no such line, as after a `link` that failed before its key line, is dropped all the same. A client that is not in `PASEO_CLIENTS` and has no such line, as for one the local tool linked, makes it exit 1 with nothing changed and name the tunnel-only lines no recorded client owns; `remove --no-clients` deletes those.

`remove <alias>` unlinks every client in `PASEO_CLIENTS` and every `--client` given, in that order, and stops at the first failure, naming `unlink --server-only` when a client cannot be reached, so a re-run continues where it stopped. Before it changes anything, `remove` probes each of those clients, reads its public key, and counts the server's tunnel-only key lines (both `permitopen="127.0.0.1:<daemon port>"` and `command="/bin/false"`) whose key belongs to none of them. If any remain, as with a client the local tool linked that neither list names, it stops with exit 3, naming those lines' comments and asking for `--client` or `--no-clients`; `--no-clients` accepts that those clients keep their app entry and alias block. So it never leaves an app entry behind silently. It then deletes every remaining `authorized_keys` line on the server that has both `permitopen="127.0.0.1:<daemon port>"` and `command="/bin/false"`, covering clients dropped with `--server-only` and lines the local tool wrote.

On the server it then stops, disables and deletes `paseo.service`, deletes the Serve route to the daemon port, and deletes `~/.local/share/paseo/runtime` and `~/.local/share/paseo/state/config.json`, which holds the password hash. The rest of `~/.local/share/paseo/state` and `~/.local/share/paseo/workspace` stay unless `--purge` is given, which deletes `~/.local/share/paseo` entirely. Last, it deletes the registry files and password.

`remove <alias> --skip-server` is for a server that is gone or does not answer. It cannot read the server's key lines, so with no client in `PASEO_CLIENTS` and no `--client` it stops with exit 3 unless `--no-clients` is given. Otherwise it unlinks the clients as above, matching app entries by connection host, skips every step on the server, and deletes the registry files and password. A client it cannot reach is dropped and reported with the app entry and alias block left on it, since its key opens nothing on a server that is gone.

After a successful `unlink`, `unlink --server-only` or `remove`, the CLI also deletes the server's entries from every `app-registry-*.backup.json` in `PASEO_HOSTS_DIR` and from the local tool's `mac-app-registry.backup.json`, matching an entry by the server's `serverId` or by a connection to `paseo-<alias>`, so no backup keeps the removed server's password or brings it back.

### Skill

`SKILL.md` triggers on requests to add, onboard, link, unlink, remove, check or list Paseo servers. It uses `PASEO_HOSTS_DIR` or its default, which `onboard` creates, and asks the owner for a client alias only when `PASEO_HOSTS_CLIENT` is unset and the request names none. It runs `onboard` and then `link`, tells the owner before `link`, `unlink` or `remove` that the desktop app will restart at least twice, and more after a rollback or when it stops answering, and, with default app settings, stop the desktop's built-in daemon and its agents and may install a downloaded update, confirms `unlink` and `remove` with the owner first, and reports the CLI's checks from `--json`. It never prints, reads into the conversation or pastes a password, and runs `password` only into a pipe.

### Delivery

Both catalogs point at `./plugins/paseo-hosts` on the default branch, as they do for `remote-gui`, so merging is the release path for the plugin; the wrapper builds the binary on the operator host. The feature is delivered when a fresh install from each catalog after the merge builds and runs `paseo-hosts --help` starting from an empty Go module cache. The vh-adlc binary release workflow does not change. The logger release with `InitWithOptions` comes first, and the module pins it.

## Acceptance Criteria

- [ ] AC-01: After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
- [ ] AC-02: `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
- [ ] AC-03: Running `onboard` again on an onboarded server, including one whose registry the local tool wrote with port 6867, keeps its password, daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, leaves one unit and at most one route, and passes verification. A `--listen-port` that differs from the recorded port exits 2 and changes nothing.
- [ ] AC-04: After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command, a forward to any other port and every TCP remote forward when the server user cannot bind port 1. The client trusts the server's host key under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
- [ ] AC-05: After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server, also when the app installs a downloaded update as it quits.
- [ ] AC-06: When the app does not keep the new entry, `link` exits non-zero, and after the app's next start it lists exactly the hosts it listed before and runs without a debugging port, also when its window stops answering after a reload or the app deletes the restored list once.
- [ ] AC-07: After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, the registry files and password are gone, and no app backup in `PASEO_HOSTS_DIR` holds the server's entry. The rest of the server's Paseo state and workspace remain unless `--purge` was given. When the server has a tunnel-only key line that belongs to no client `remove` will unlink, `remove` without a `--client` for it or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line; `unlink --server-only` removes that client's key line and registry record without contacting it, after which `remove` completes; for a recorded client with no key line it drops the client, and for an unrecorded client whose key line has no `paseo-hosts:<client>` comment it exits 1 and changes nothing. With the server unreachable, `remove --skip-server` removes the app entry and alias block of every recorded client it can reach, drops and reports any client it cannot reach, which keeps its entry and block, and deletes the registry files, and with no client recorded or named it exits 3 unless `--no-clients` is given. Other servers and hosts in the apps are unchanged.
- [ ] AC-08: The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
- [ ] AC-09: Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`. `status <alias>` prints every field listed under link, in human output and under those keys in `--json`. A registry line that is not `KEY=value` is rejected without being executed.
- [ ] AC-10: No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
- [ ] AC-11: Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command, `--help` included, with the documented fields, and the exit code matches the documented meaning.
- [ ] AC-12: The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
- [ ] AC-13: The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
- [ ] AC-14: The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.
- [ ] AC-15: `link --no-app` sets up the key, host key and alias block as `link` does, records the client, changes neither the desktop app nor the clipboard and prints no password; a later `link` without `--no-app` adds the app entry, and `unlink` of a client without the app removes its block and key line.

## Test Plan

Go tests run the CLI's commands with a stand-in `ssh` on `PATH` that executes the embedded snippets locally under a temporary home, with stand-in `npm`, `systemctl`, `loginctl`, `tailscale`, `osascript`, `open` and a stand-in daemon. The stand-in `ssh` runs the PowerShell snippets with a real `pwsh` against temporary files, with the ACL step replaced by a recorder; those tests skip with a message when `pwsh` is not on `PATH`. Because `pwsh` also accepts PowerShell 7 syntax, one test rejects `&&`, `||`, `??`, `?.`, the ternary operator, `>` and `>>` redirection, and `Out-File`, `Set-Content` and `Add-Content` in the `.ps1` snippets. CI needs no new step: the `ubuntu-latest` image ships PowerShell 7.6.9 (runner-images `Ubuntu2404-Readme.md`) and the repository is public, so its Actions minutes are not metered. A fake DevTools endpoint serves a page that applies the app's strict schema on reload and drops the whole registry on an invalid entry.

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | `internal/onboard` tests: assert the unit, config hash, removed or single route, password mode and reuse; re-run on a local-tool registry at port 6867 with a recorded client and a `--client-host`, and assert the kept port, clients and client host and that a different `--listen-port` exits 2 with no change; and assert that verification fails when the stand-in daemon accepts a password-less connection. Live: manual steps 1 to 3. |
| AC-04 | `internal/link` tests: run the `authorized_keys` and SSH config snippets twice for both platforms against temporary files and assert one restricted line and one block, including replacement of a `paseo-host` block; resolve host keys from a hashed operator `known_hosts` for a `--client-host` value and for a server on port 2222, and assert the client entries' names, and that a missing operator entry exits 1 before any change. A test starts an unprivileged `sshd` on a free loopback port with an `authorized_keys` file written by the authorize snippet, and asserts that `ssh -W` reaches a test HTTP server on the daemon port, that `-W` to another port, a shell command, and `ssh -N -o ExitOnForwardFailure=yes` with `-R 127.0.0.1:<free port>:127.0.0.1:<daemon port>` and, after the test HTTP server stops so the daemon port is free, with `-R 127.0.0.1:<daemon port>:127.0.0.1:<daemon port>` all fail; it skips with a message when `sshd` is not installed, and no CI step is added to install it. The `ubuntu-latest` runner is expected to have `sshd`, so the test should run in CI; the first push shows whether it ran or skipped. Live: manual steps 4 and 6. |
| AC-05, AC-06 | `internal/clientapp` tests against the fake DevTools endpoint: the upsert keeps other hosts and `appearance`, the written id and `daemonPort` match the app's normalized form at 6767 and at 6867, and an entry the page rejects causes a non-zero exit and the restored registry. Further cases make the page stop answering once after a reload, make the page delete the restored value once, make the stand-in app's first debug launch exit before it answers, and make every restore fail; each asserts a non-zero exit, and the first three the restored registry, the last a message naming the backup file. A `stop.sh` test runs a stand-in process whose arguments contain `sh.paseo.desktop.ShipIt` for 2 seconds and one with `com.microsoft.VSCode.ShipIt` that keeps running, and asserts that the quit returns after the first ends without waiting for the second. A test with a stand-in app that exits right after its final launch asserts that `link` fails. A wrapper-built binary run with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` writes a valid entry. The Windows installer wait is checked live only, because the snippet needs `Get-CimInstance`, which `pwsh` on Linux lacks. Live: manual steps 5 and 6. An app update cannot be made pending on demand, so the live run records whether one was pending. |
| AC-07 | `internal/remove` tests: after `link` with two stand-in clients, `remove` leaves no entry, block, key line, unit, route or registry file, keeps the state and workspace without `--purge` and deletes them with it, and keeps another server's files; a failure part way and a re-run finish the removal; `unlink` touches one client only and deletes the server's entry from the app backups, including a local-tool `mac-app-registry.backup.json`; `unlink --server-only` drops a recorded client with no key line, and for an unrecorded client whose key line lacks the `paseo-hosts:<client>` comment exits 1 and changes nothing; `remove --skip-server` with the server and one client unreachable drops and reports that client and completes; `remove --skip-server` with no client recorded or named exits 3 unless `--no-clients` is given; with one stand-in client unreachable, `remove` stops naming `unlink --server-only`, and after that command `remove` completes and the unreachable client's files are untouched; with the stand-in server refusing connections, `remove --skip-server` deletes each client's app entry, matched by connection host, its block and the registry files; with a local-tool registry and a key line the local tool wrote, `remove` exits 3 without `--client`, and also when `PASEO_CLIENTS` names a second client the plugin linked; and with `--client` it removes the app entry, the `paseo-host` block and the key line. Live: manual step 7. |
| AC-08 | `cmd/paseo-hosts` tests: run `onboard` and `link` with only the documented variables in a temporary home and an empty `PASEO_HOSTS_CACHE`, record the stand-ins' arguments, assert that the stand-in `npm` was asked to install the pinned `@getpaseo/cli` into `runtime/<version>/`, check the exit-3 error for a missing client alias, and check exit 3 naming `npm` when it is not on `PATH`. A test searches the plugin files for names from a list given in `PASEO_HOSTS_FORBIDDEN_NAMES`, which the live run sets to the operator host's names. |
| AC-09 | `internal/registry` tests parse the local tool's format and reject a line containing a command substitution without running it. `cmd/paseo-hosts` tests run `verify`, `status`, `list`, `link`, `unlink` and `remove` against a fixture in the local tool's format with no `PASEO_PUBLISHED`, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` or `PASEO_CLIENT_PORT`, and assert that `link` writes the client's alias block and `known_hosts` entry under `PASEO_DNS` with no port, and that `status` prints every field AC-09 names. |
| AC-10 | `cmd/paseo-hosts` tests record every stand-in's argument list, the debug log at `LOG_LEVEL=debug`, and both output streams during every command, and assert the password appears in none of them. |
| AC-11 | Reporter tests capture success, failure, skip and partial outcomes with a terminal and a pipe, with `NO_COLOR` absent, empty, `0` and `1`, and with `--plain`; assert no ANSI bytes in plain captures and that `--json` output parses with the documented fields and exit codes. `cmd/paseo-hosts` tests assert that `--help --json` and `<command> --help --json` print one object with `data.usage`, and that `/dev/null`, a file and a pipe are not terminals. |
| AC-12 | Manual: install `paseo-hosts@vhco-tools` in Codex and in Claude, start a new session on the operator host, ask to add a named server, and record that the agent loaded the skill, ran both commands, and showed no password. |
| AC-13 | Implementation review compares the README, `SKILL.md`, `paseo-hosts --help` and the marketplace row with the Terms table and records each mismatch. |
| AC-14 | `tests/paseo-hosts/package.test.ts`, run by the `bun test tests/paseo-hosts` step of the `paseo-hosts` CI job, copies `plugins/paseo-hosts` to a temporary directory, runs `scripts/paseo-hosts.sh --help` with an empty temporary `GOMODCACHE`, `GOFLAGS` unset and the default `GOPROXY`, and asserts it exits 0 and that both dependencies are now in that cache, as `tests/remote-gui/package.test.ts` does for remote-gui. |
| AC-15 | `internal/link` tests with a stand-in client without the app: `link --no-app` writes the key line, host key and block, calls no clipboard or app command and keeps the password out of every stream; a later `link` with the app present adds the entry; `unlink` skips the app step and removes the block and key line. |

Manual procedure on the operator host, a test server, the Mac and a Windows PC with OpenSSH Server and a signed-in user: (1) `onboard` the server and record the unit, config and Serve state; (2) re-run `onboard` and confirm the password file is unchanged; (3) `onboard --publish`, check the route and health, then `onboard` again and confirm the route is gone; (4) `link` the Mac, then from the Mac try a shell command, `ssh -W 127.0.0.1:22`, and `ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:<free port>:127.0.0.1:<daemon port>` with the key and confirm all three fail; (5) check the Mac app's host list and tunnel process, check that no app process has `--remote-debugging-port` and the debugging port refuses connections, then run `link` three times with a `paseotest` build and `PASEO_HOSTS_TEST_REJECT_ENTRY=1`; confirm that each run exits non-zero and that afterwards the restarted app's `@paseo:daemon-registry` holds the hosts it held before, its tunnels are back and no debugging port remains; (6) repeat steps 4 and 5 for the Windows PC and confirm the app window is on the user's desktop; (7) `unlink` the Windows PC, then `remove` the server, and record the clients, server and registry; (8) run the forbidden-names test with `PASEO_HOSTS_FORBIDDEN_NAMES` set to the operator host's machine, user and tailnet names, and record that it passed.

The implementation reviewer runs manual steps 1 to 7 itself on the test server, the Mac and the Windows PC, including the three `paseotest` rollbacks on each desktop, and inspects the results over SSH. It records whether an app update was pending on each desktop, and if a run leaves a desktop's host list damaged, it records that and restores the list from the backup file. Afterwards it runs `onboard` on the server and `link` for both desktops again, so the setup is back in use. It prints no password.

## Tasks

Paths under `internal/`, `cmd/`, `scripts/` and `skills/` are in `plugins/paseo-hosts/`.

- [x] T1 `plugin.json`, `.claude-plugin/plugin.json`, `go.mod`, `go.sum`, `.golangci.yml`, `cmd/paseo-hosts/main.go` - the module skeleton at version 0.1.0 with `github.com/michielvha/logger` v0.1.0; `go build ./cmd/paseo-hosts`, `go vet ./...` and golangci-lint pass and `paseo-hosts --help` exits 0 (Design)
  - Evidence: `go build ./plugins/paseo-hosts/cmd/paseo-hosts` failed before (directory not found) and the module skeleton now builds; `go build ./cmd/paseo-hosts && go test -race ./... && go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, and `go mod tidy -diff` pass in plugins/paseo-hosts, and `paseo-hosts --help` exits 0.
- [x] T2 `tests/paseo-hosts/package.json`, `tests/paseo-hosts/package.test.ts` - the installed-copy test; fails because `scripts/paseo-hosts.sh` does not exist (AC-14)
  - Evidence: `bun test tests/paseo-hosts` fails with exit 127, `scripts/paseo-hosts.sh: No such file or directory`, as intended until T3.
- [x] T3 `scripts/paseo-hosts.sh` - the wrapper builds into `PASEO_HOSTS_CACHE/builds` with `GOTOOLCHAIN=local` and `-mod=readonly`; `bun test tests/paseo-hosts` passes (AC-14)
  - Evidence: `bun test tests/paseo-hosts` failed before (wrapper missing) and passes after: the copied wrapper builds with an empty temporary `GOMODCACHE`, `GOFLAGS` and `GOPROXY` unset, and the logger zip lands in that cache. The test now puts the `go env GOROOT` toolchain first on `PATH`, since `GOTOOLCHAIN=local` otherwise picks an older `go` on this host. `shellcheck` is not installed here, so the wrapper is not linted.
- [x] T4 `internal/report/report_test.go` - reporter tests for every outcome on a terminal and a pipe, each `NO_COLOR` value, `--plain`, `--json` fields and exit codes; fail because the package is empty (AC-11)
  - Evidence: `go test ./internal/report` fails with `no non-test Go files in .../internal/report`, as intended until T5.
- [x] T5 `internal/report/report.go`, `cmd/paseo-hosts/main.go` - labelled lines on standard error, JSON on standard output, exit codes 0 to 4, and the logger initialised on standard error; T4 passes (AC-11)
  - Evidence: `go test ./internal/report` failed before (no non-test Go files) and `go test -race ./internal/report` passes after; the module verification (build, `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, `go mod tidy -diff`) passes. Terminal detection is a character-device check on standard error, exercised only through the `Terminal` option in tests, not under a real terminal.
- [x] T6 `internal/registry/registry_test.go` - parse the local tool's format, apply the defaults for missing keys, and reject a command substitution line without running it; fails (AC-09, AC-03)
  - Evidence: `go test ./internal/registry` fails with `no non-test Go files in .../internal/registry`, as intended until T7.
- [x] T7 `internal/registry/registry.go` - the parser and writer with modes 700 and 600; T6 passes (AC-09, AC-03, AC-01)
  - Evidence: `go test ./internal/registry` failed before (no non-test Go files) and `go test -race ./internal/registry` passes after; the module verification passes.
- [x] T8 `internal/config/config_test.go` - every variable's default and override, and exit 3 naming `PASEO_HOSTS_CLIENT` for `link` without a client; fails (AC-08)
  - Evidence: `go test ./internal/config` fails with `no non-test Go files in .../internal/config`, as intended until T9.
- [x] T9 `internal/config/config.go` - configuration from flags and variables only; T8 passes (AC-08)
  - Evidence: `go test ./internal/config` failed before (no non-test Go files) and `go test -race ./internal/config` passes after; the module verification passes.
- [x] T10 `internal/testenv/` - stand-in `ssh`, `npm`, `systemctl`, `loginctl`, `tailscale`, `osascript`, `open` and daemon, with `pwsh` for `.ps1` snippets and an ACL recorder; its self-test runs a snippet under a temporary home and records every argument list (AC-08, AC-10)
  - Evidence: The self-test `go test -race ./internal/testenv` was written with the stand-ins and passes: a snippet sent through the stand-in `ssh` runs under the server's temporary home and every stand-in argument list is recorded. The PowerShell self-test passes with pwsh 7.6.9 on PATH and skips with a message without it. The module verification passes. The stand-in daemon is the fake `paseo` that the stand-in `npm` installs. The stand-ins also cover `curl`, `ss`, `uname`, `pgrep` and `pkill`, and the real system tools come from a linked directory, so the host's own `tailscale` and `systemctl` never run.
- [x] T11 `internal/runtime/runtime_test.go` - install `@getpaseo/cli` into `runtime/<version>/` with `npm install --prefix`, exit 3 naming a missing `node` or `npm`, and hash a password passed on standard input; fails (AC-01, AC-08, AC-10)
  - Evidence: `go test ./internal/runtime` fails with `no non-test Go files in .../internal/runtime`, as intended until T12.
- [x] T12 `internal/runtime/runtime.go` - the local runtime and `hashDaemonPassword` call; T11 passes (AC-01, AC-08, AC-10)
  - Evidence: `go test ./internal/runtime` failed before (no non-test Go files) and `go test -race ./internal/runtime` passes after; the module verification passes. The real `npm install` of `@getpaseo/cli` is not run in tests, which use the stand-in `npm`.
- [x] T13 `internal/onboard/onboard_test.go` - the AC-01 to AC-03 rows of the Test Plan; fail (AC-01, AC-02, AC-03)
  - Evidence: `go test ./internal/onboard` fails with `no non-test Go files in .../internal/onboard`, as intended until T14.
- [x] T14 `internal/onboard/onboard.go`, `internal/onboard/snippets/*.sh` - preflight, password, install, exposure, registry and verification with 503 retry; T13 passes (AC-01, AC-02, AC-03)
  - Evidence: `go test ./internal/onboard` failed before (no non-test Go files) and passes after (4 tests); the module verification passes. Also adds `internal/remote`, the ssh runner that sends snippets on stdin, and sets `GORACE=atexit_sleep_ms=0` in testenv so race-built stand-ins exit at once (the onboard package took 210 s under -race without it). Untested: real systemd, tailscale and npm on a server (T27).
- [x] T15 `internal/link/link_test.go`, `internal/snippets/ps1_syntax_test.go` - the AC-04 and AC-15 rows for both platforms, the client probe with exit 4, and the PowerShell 7 syntax ban; fail (AC-04, AC-15)
  - Evidence: `go test ./internal/link` fails with `no non-test Go files in .../internal/link`, and `go test ./internal/snippets` fails with `no .ps1 snippets found under internal/`. The detector self-test passes. The `link` tests take the desktop app step as a function, so the app half of the AC-15 row is checked here as a call, and its `unlink` half is in the T19 remove tests.
- [x] T16 `internal/link/link.go`, `internal/link/snippets/*.sh`, `internal/link/snippets/*.ps1` - probe, client record, key, key line, host keys, alias block and tunnel checks; T15 passes (AC-04, AC-15)
  - Evidence: `go test ./internal/link ./internal/snippets` failed before (no link code, no .ps1 snippets) and passes after. The Windows test ran here with pwsh 7.6.9 on PATH and skips without it. The module verification passes. testenv now sets `OS=Windows_NT` for Windows hosts, as Windows does, so the probe can identify Windows under pwsh on Linux. Untested: the Windows app and desktop-session probe (`%LOCALAPPDATA%\Programs\Paseo\Paseo.exe`, `Win32_ComputerSystem.UserName`) and Windows PowerShell 5.1 itself, left for T28.
- [x] T17 `internal/clientapp/clientapp_test.go`, `internal/clientapp/fakedevtools_test.go` - the AC-05 and AC-06 rows against the fake DevTools endpoint, including the 8 second commit wait, the graceful quit and the force-stop exit; fail (AC-05, AC-06)
  - Evidence: `go test ./internal/clientapp` fails at setup: the package has no code yet and `github.com/coder/websocket`, which the fake DevTools endpoint uses, is not in go.mod; T18 adds both. The fake applies the strict schema and normalized form on reload, keeps only writes older than its commit delay when killed, and reports the app's tunnel process from its stored registry. The tests scale the 8, 20 and 30 second waits down and check the defaults.
- [x] T18 `go.mod`, `go.sum`, `internal/clientapp/*.go`, `internal/clientapp/snippets/*`, `internal/clientapp/inject_paseotest.go` - quit, debug relaunch, upsert, verify, rollback, relaunch and tunnel process check with `github.com/coder/websocket`, and the `paseotest` fault injection; T17 passes and a release build has no `PASEO_HOSTS_TEST_REJECT_ENTRY` string (AC-05, AC-06)
  - Evidence: `go test ./internal/clientapp` passes, and also with `-tags paseotest`, where `PASEO_HOSTS_TEST_REJECT_ENTRY=1` drives the rollback test. `TestReleaseBuildHasNoFaultInjection` finds no `PASEO_HOSTS_TEST_REJECT_ENTRY` in the untagged test binary, and a `-tags paseotest` test binary does hold it. Removing the commit wait or writing `daemonPort` at 6767 makes the tests fail. The module verification passes. The Windows snippets (scheduled task launch, `window.close()` quit, `Stop-Process` force-stop, `Win32_Process` tunnel check) only parse under pwsh and pass the syntax ban; they run for real in T28.
- [x] T19 `internal/remove/remove_test.go` - the AC-07 row of the Test Plan; fails (AC-07)
  - Evidence: `go test ./internal/remove` fails with `no non-test Go files in .../internal/remove`, as intended until T20. The tests stand in for the desktop app with a host list file on each client, built on `clientapp.Matches`, because the `clientapp` tests cover the app session. They also hold the `unlink` half of the AC-15 row.
- [x] T20 `internal/remove/*.go`, `internal/remove/snippets/*` - `unlink`, `--server-only`, `remove` with `--client`, `--no-clients`, `--skip-server` and `--purge`, and backup cleanup; T19 passes (AC-07)
  - Evidence: `go test ./internal/remove` failed before (no non-test Go files) and passes after. Removing the backup cleanup or the Serve route deletion makes it fail. The module verification passes. `unlink` and `remove` find the app with a new `link.ProbeForApp`, which leaves `App` empty when the app is missing; `link.Probe` and its snippets take a third `optional` mode for this. `report.Error` now carries its cause, so a caller can test for an unreachable client. Untested: no test runs `unblock.ps1` or `client-pub.ps1` against a Windows stand-in. One manual pwsh run against a scratch profile removed a `paseo-host` block and printed the key. Real systemd and tailscale are left to T27.
- [x] T21 `cmd/paseo-hosts/main_test.go` - the AC-08, AC-09 and AC-10 rows: every command against a local-tool fixture and against only the documented variables, and the password in no argument list, log record or stream; fails (AC-08, AC-09, AC-10)
  - Evidence: `go test ./cmd/paseo-hosts` fails as intended: every test stops on `unknown command "onboard"` with exit 2 because the commands are not wired yet. `go vet` and golangci-lint pass on the test file. The CLI tests link with `--no-app` because the fake desktop app exists only in the clientapp tests, which cover the app step.
- [x] T22 `cmd/paseo-hosts/*.go` - wire `onboard`, `link`, `unlink`, `remove`, `verify`, `status`, `list` and `password` with their flags and help; T21 passes (AC-08, AC-09, AC-10, AC-13)
  - Evidence: `go test ./cmd/paseo-hosts` failed before (`unknown command "onboard"`, exit 2) and passes after. The module verification passes. A release build of `cmd/paseo-hosts` does not contain `PASEO_HOSTS_TEST_REJECT_ENTRY`. `run` now starts the logger on the stream it is given, so the tests capture the debug log. The T21 alias-block check now accepts the explicit `Port 22` line that link writes, and still requires `HostName` to be `PASEO_DNS` and an unbracketed `known_hosts` name. Untested in the CLI tests: link with the desktop app, which the clientapp tests cover.
- [x] T23 `cmd/paseo-hosts/forbidden_names_test.go` - searches the plugin files for the names in `PASEO_HOSTS_FORBIDDEN_NAMES` and skips when it is unset; passes (AC-08)
  - Evidence: With `PASEO_HOSTS_FORBIDDEN_NAMES` unset, `go test -run TestNoForbiddenNames -v ./cmd/paseo-hosts` skips. With `fedora-43,tailscale` it fails as a probe of the check, naming the snippets that contain `tailscale`. With `fedora-43` plus this machine's `hostname` it passes. `go vet`, golangci-lint and `go test -race ./cmd/...` pass. The operator host's own names are left to manual step 8 (T27).
- [x] T24 `skills/paseo-hosts/SKILL.md`, `README.md` - the skill and README in the Design terms, with the restart and built-in daemon warning; the help, skill and README use the Terms table (AC-12, AC-13)
  - Evidence: This task changes only documentation, so no failing test came first. Checked by hand: the README repeats the Terms table word for word. The skill and `paseo-hosts --help` define server, client, registry, onboard, link, unlink and remove with the same meanings. A grep finds no em or en dashes in the README, the skill or `cli.go`. Untested: whether the skill triggers in Codex and Claude, which is AC-12 and left to T27.
- [x] T25 `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, `docs/reference/marketplace.md`, `README.md`, `CONTRIBUTING.md` - list the plugin and its checks; `bun test tests/vh-adlc` passes (AC-12, AC-13)
  - Evidence: Before the change, `jq -e '.plugins[] | select(.name=="paseo-hosts")'` found no entry in either catalog (exit 4), and `grep -c paseo-hosts` counted 0 in the three docs. After it, both catalogs and all three docs list the plugin. `bun test tests/vh-adlc --timeout 60000` gives 1304 pass and 1 fail. The failure is the expected host-binary fixture test, where the digest of `/usr/local/bin/vh-adlc` does not match the lock. Installing from the marketplaces is left to T27.
- [x] T26 `.github/workflows/ci.yml`, `cmd/vh-adlc/workflow_test.go` - the `paseo-hosts` job and the `version` job's needs; `go test ./cmd/vh-adlc` passes (AC-14)
  - Evidence: `go test ./cmd/vh-adlc` failed before, at `workflow_test.go:107` (the version needs list), and passes after. `actionlint`, `go vet ./cmd/vh-adlc` and `bun test tests/paseo-hosts` (1 pass) pass. The new job has not run on GitHub Actions yet; it runs on the first push.
- [x] T29 `internal/onboard/onboard.go`, `internal/link/link.go`, `internal/clientapp/clientapp.go`, `internal/remove/remove.go`, `internal/testenv/testenv.go` and the four command test files - status messages stop repeating the label the reporter adds; every command test fails on a line such as `Passed: Passed:` and `go test ./...` passes (AC-11)
  - Evidence: The live `onboard arch-1` and `link arch-1 --client macbook-pro` runs printed `✓ Passed: Passed: ...` on every status line. With `testenv.CheckReport` added to the onboard, link, clientapp and remove test helpers, `go test ./internal/...` failed in all four packages with `status line repeats its label: "✓ Passed: Passed: alias paseo-srv on mac"` and the same for `Skipped:` and `Partial:` lines. After the callers dropped the label, `go test -race ./... -count=1` passes in every package and `golangci-lint run ./...` reports 0 issues.
- [x] T30 `internal/link/snippets/tunnel.ps1`, `internal/testenv/standins.go` - the Windows tunnel check opens an `ssh -N -L` forward and requests `/api/health` through it instead of piping into `ssh -W`; the Windows link test passes with the stand-in serving the forward under the key's `permitopen` (AC-04)
  - Evidence: Live, `link arch-1 --client win-main` hung at the tunnel check, because Windows OpenSSH 9.5 never relays `ssh -W` over redirected pipes. A failing unit test for the hang is not feasible, since the stand-in `ssh` relays pipes and cannot reproduce that behaviour. Run on win-main through `ssh win-main powershell.exe`, the new snippet printed success in 12.7 s for `paseo-arch-1` port 6867 and failed with `the tunnel to 127.0.0.1:22 answered: nothing` for port 22. `go test ./internal/link -run Windows` failed with `the tunnel to 127.0.0.1:6767 answered: nothing` until the stand-in answered `-L` forwards for a client key, and passes after, with pwsh 7.6.9 on PATH.
- [x] T31 `internal/clientapp/snippets/launch.ps1`, `internal/clientapp/snippets/stop.ps1` - on Windows the scheduled task runs as the token's account, and the launch and quit waits count only the app's main `Paseo.exe`; `link` to a Windows client quits the app without a force-stop (AC-05)
  - Evidence: Live on win-main, `link arch-1 --client win-main` first failed at `Register-ScheduledTask` with HRESULT 0x80070534, because `$env:USERDOMAIN` reads `WORKGROUP` in an SSH session; the token name is `WIN-MAIN\mike`. The next run reported `Partial: the app on win-main did not quit within 20s and was force-stopped`. The app's log shows the quit starting at 04:19:34.9, and the process list shows the built-in daemon and a terminal worker running as `Paseo.exe` with a script argument, which outlive the app. No unit test is feasible: the snippets need `Get-CimInstance` and the ScheduledTasks module, which pwsh on Linux lacks. With both fixes, `link arch-1 --client win-main` exits 0 in 30 s, with no force-stop line. `go test ./internal/clientapp` passes.
- [x] T27 `docs/specs/paseo-hosts.md` - manual steps 1 to 5, 7 and 8 against a test server and the Mac, recorded as evidence; each step's pass condition holds (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08)
  - Evidence: Server arch-1, Mac macbook-pro. Steps 2 to 5 ran first against the registry the local tool wrote: re-running `onboard` kept the password, port 6867 and `PASEO_CLIENTS` and added `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, `--listen-port 7000` exited 2, `--publish` added one route on 8956 whose health answered 200, and plain `onboard` removed only that route; the 20 Serve routes other users own stayed. `link arch-1 --client macbook-pro` passed; from the Mac a shell command printed nothing and `ssh -W 127.0.0.1:22` was administratively prohibited, while 6867 answered 200. The app listed arch-1 and fedora-43, ran its own `ssh -W 127.0.0.1:6867 paseo-arch-1`, and no process had `--remote-debugging-port`. A `paseotest` build with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` exited 1 with `previous host list is restored`, left no debugging port, and the tunnel reopened.
  - Evidence: Step 7: `unlink arch-1 --client win-main` exited 0; win-main then had no `paseo-arch-1` block or tunnel and kept its fedora-43 tunnel, and arch-1 kept only the macbook-pro key line. `remove arch-1` unlinked the Mac and exited 0. Afterwards `paseo.service` was not found, nothing listened on 6867, no key line remained, `runtime` and `state/config.json` were gone while the rest of `state` and `workspace` stayed, the 20 foreign Serve routes were unchanged, the registry held no arch-1 file, and no backup JSON mentioned arch-1.
  - Evidence: Step 1 on the cleaned server: `onboard arch-1` exited 0 in 55 s. The unit is enabled and active, it listens on `127.0.0.1:6767` only, the config has relay `{'enabled': False}` and a `$2b$` hash, port 8956 has no Serve route, and `arch-1.password` is mode 600. `grep -rlsF -f /dev/stdin ~ /tmp /etc` on arch-1, fed the password on standard input, found no file. Step 2 on the fresh install: a second `onboard` exited 0 and the password file's SHA-256 was unchanged. Both clients were then linked again and both exit 0.
  - Evidence: Step 8: `PASEO_HOSTS_FORBIDDEN_NAMES="fedora-43,/home/m/,tail6948f,arch-1,sysadmin,win-main,macbook-pro,mike,100.123.74.118" go test -run TestNoForbiddenNames ./cmd/paseo-hosts` passes. The user `m` is given as `/home/m/` because the test matches substrings. A probe with `permitopen` reported 5 files, so the search walks the plugin.
- [x] T28 `docs/specs/paseo-hosts.md` - manual step 6 on the Windows PC once it accepts SSH, recorded as evidence; the app window is on the user's desktop and the tunnel is open (AC-04, AC-05, AC-06)
  - Evidence: Client win-main, Windows OpenSSH 9.5, after T30 and T31. `link arch-1 --client win-main` exited 0 in 30 s with no force-stop line. The main `Paseo.exe` runs in session 1, the active console session from `query user`; a scheduled task in that session found its window with a title. No process has `--remote-debugging-port`. The app runs `ssh ... -W 127.0.0.1:6867 paseo-arch-1`. From win-main the key's shell command exits 1, and an `-L` forward to 127.0.0.1:22 reports `administratively prohibited`. After three runs, arch-1 has one `paseo-hosts:win-main` line and the client config one `Host paseo-arch-1`. The `paseotest` build with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` exited 1 with `previous host list is restored`; 20 s later the app ran without a debugging port and had reopened its arch-1 tunnel.
- [x] T33 `internal/link/sshd_test.go` - a test starts an unprivileged `sshd` with an `authorized_keys` file from the authorize snippet and checks the AC-04 key-line cases in the Test Plan; it stops its HTTP server before the daemon-port `-R` case, fails on both `-R` cases with the current key line, and skips without `sshd` (AC-04)
  - Evidence: `GOTOOLCHAIN=local go test -count=1 -run TestKeyLineAgainstRealSSHD ./internal/link/` against OpenSSH 10.0p2 on the operator host fails as intended with the current key line: the daemon tunnel returns 200, another port and a shell command are refused, and both `-R 127.0.0.1:<free>:127.0.0.1:<daemon>` and, after the HTTP server stops, `-R 127.0.0.1:<daemon>:127.0.0.1:<daemon>` stay up until the 5 s timeout ("remote forward ... was allowed"). golangci-lint reports 0 issues.
- [x] T34 `internal/link/snippets/authorize.sh`, `internal/testenv/standins.go` - the key line carries `permitlisten="127.0.0.1:1"` and the stand-in `ssh` accepts the option; T33 and `go test -race ./...` pass (AC-04, AC-07)
  - Evidence: The expected line in `internal/link/link_test.go` gained `permitlisten="127.0.0.1:1"` first; `go test -count=1 ./internal/link/` then failed in `TestLinkMacTwiceKeepsOneKeyLineAndOneBlock` and `TestKeyLineAgainstRealSSHD`. After `authorize.sh` writes the option, and the stand-in `ssh` knows it and now refuses a key with an option it does not know, as sshd does, `go test -race -count=1 ./...` passes with `pwsh` on PATH (the real-sshd test included, 1.07 s), and `go vet`, golangci-lint and `go mod tidy -diff` are clean.
- [x] T35 `cmd/paseo-hosts/cli.go`, `cmd/paseo-hosts/main.go`, `cmd/paseo-hosts/term_linux.go`, `cmd/paseo-hosts/term_darwin.go`, `cmd/paseo-hosts/term_other.go`, `cmd/paseo-hosts/cli_test.go` - `--help --json` prints one object with `data.usage`, and the terminal check asks the terminal driver through `syscall` with `go.mod` unchanged; the new tests fail first, then pass with `go test -race ./...` and golangci-lint, and `GOOS=darwin go vet ./cmd/paseo-hosts` passes (AC-11)
  - Evidence: The new tests in `cmd/paseo-hosts/cli_test.go` failed first: `--help --json` printed human help ("invalid character 'p' looking for beginning of value") and `/dev/null` counted as a terminal. After the change both pass, the `/dev/ptmx` case included; `go test -race -count=1 ./...`, `go vet ./...`, `GOOS=darwin go vet ./cmd/paseo-hosts`, a `GOOS=darwin GOARCH=arm64` build, `GOOS=windows go vet ./cmd/paseo-hosts`, golangci-lint (also with `GOOS=darwin`) and `go mod tidy -diff` are clean, and `go.mod` is unchanged. `paseo-hosts link --help --json` prints one object with `"command":"link"` and `data.usage`.
- [x] T36 `docs/specs/paseo-hosts.md` - run `link` again for both desktops on every server whose `authorized_keys` holds a tunnel-only line written before `permitlisten`, today arch-1, so those lines carry it; the registry's fedora-43 entry is the operator host's own daemon, which holds no such line and is left alone, then manual steps 4 and 6 with the TCP `-R` check, recorded as evidence (AC-04, AC-05)
  - Evidence: arch-1 was the only server with a tunnel-only line from before `permitlisten`; fedora-43 was left alone. `link arch-1 --client win-main` and `--client macbook-pro` (after the Mac rejoined the tailnet) both exited 0, and arch-1 then held one `permitlisten="127.0.0.1:1"` line for each. Step 4 from both clients: a shell command exits 1, a forward to 127.0.0.1:22 is `administratively prohibited`, and `ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:47123:127.0.0.1:6767 paseo-arch-1` exits with `remote port forwarding failed`. Steps 5 and 6: each app lists arch-1 and runs its own `-W 127.0.0.1:6767 paseo-arch-1`, the Windows app in active console session 1, and no process has `--remote-debugging-port`; the `paseotest` build with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` exited 1 with `previous host list is restored` on both, and 20 s later each app had its tunnel back with no debugging port. The daemon-port `-R` case with the daemon stopped ran only in the sshd test.
- [x] T37 `plugins/paseo-hosts/README.md`, `plugins/paseo-hosts/skills/paseo-hosts/SKILL.md` - the README's Requirements list and a new short server requirements line in the skill name OpenSSH 7.8 or later; the README's description of the `link` key also names the Unix socket remote forward limit and says that key lines written before `permitlisten` stay open to TCP remote forwards until `link` runs again; a grep finds `7.8` in each file and `Unix socket` and `permitlisten` in the README (Design)
  - Evidence: `grep -c 7.8` finds one line in `plugins/paseo-hosts/README.md` (Server requirements) and one in `skills/paseo-hosts/SKILL.md` (under Add a server); `grep -o` finds `Unix socket` and `permitlisten` in the README's `link` paragraph. `bun test tests/paseo-hosts` passes (1 test) and `go test ./cmd/...` passes. `bun test tests/vh-adlc` passes 1304 of 1305; the failing fixture test stops because `/usr/local/bin/vh-adlc` 0.19.0 does not match this branch's binary lock, which no file in this change touches.
- [x] T38 `plugins/paseo-hosts/cmd/paseo-hosts/cli_test.go`, `plugins/paseo-hosts/cmd/paseo-hosts/pty_linux_test.go`, `plugins/paseo-hosts/cmd/paseo-hosts/pty_darwin_test.go`, `plugins/paseo-hosts/cmd/paseo-hosts/pty_other_test.go` - the pseudo-terminal case of `TestOnlyATerminalCountsAsATerminal` opens the slave side on macOS, where the master does not answer TIOCGETA (R-22 F-01); a darwin/arm64 test binary passes it on the Mac and `go test -race ./...` still passes on Linux (AC-11)
  - Evidence: Before the change, a `GOOS=darwin GOARCH=arm64 go test -c` binary run on the Mac with `-test.run TestOnlyATerminalCountsAsATerminal` failed with `a pseudo-terminal does not count as a terminal`; after it, the same run passes, and the whole `cmd/paseo-hosts` darwin test binary passes on the Mac under the login PATH (`node` is not on the non-interactive SSH PATH). `go test -race -count=1 ./...` with `pwsh` on PATH, golangci-lint (also with `GOOS=darwin`), `go vet` for linux, darwin and windows and `go mod tidy -diff` pass.
- [ ] T39 `internal/clientapp/fakedevtools_test.go`, `internal/clientapp/clientapp_test.go`, `internal/testenv/standins.go` - fake DevTools and stand-in app cases for a page that stops answering once after a reload, a page that deletes the restored value once, a first debug launch whose app exits before it answers, and a restore that never holds; each fails against the current code for the reason the Test Plan names (AC-06)
- [ ] T40 `internal/clientapp/clientapp.go`, `internal/clientapp/cdp.go`, `internal/clientapp/snippets/launch.sh`, `internal/clientapp/snippets/launch.ps1` - the debug launch retries an app that exits before it answers, a lost window leads to a new debug launch, every restore is read back, a rollback is confirmed after a restart, and an unconfirmed restore exits 1 naming the backup file; T39 and `go test -race ./...` pass (AC-06)
- [ ] T41 `internal/clientapp/snippets/stop.sh`, `internal/clientapp/snippets/stop.ps1`, `internal/clientapp/fakedevtools_test.go`, `internal/clientapp/clientapp_test.go` - quit and wait waits at least 3 seconds and until no app update installer runs, up to 120 seconds; the `stop.sh` test with a stand-in `sh.paseo.desktop.ShipIt` process and a stand-in `com.microsoft.VSCode.ShipIt` process fails first, then passes (AC-05)
- [ ] T42 `internal/clientapp/clientapp.go`, `internal/clientapp/snippets/launch.sh`, `internal/clientapp/snippets/running.sh`, `internal/clientapp/snippets/running.ps1`, `internal/clientapp/fakedevtools_test.go`, `internal/clientapp/clientapp_test.go` - the final launch waits for the app's main process, and every command fails when that process is gone at the end, checked on macOS by `running.sh` and on Windows by `running.ps1`; a test with a stand-in app that exits right after its final launch fails first, then passes, and the PowerShell syntax test passes on `running.ps1` (AC-05)
- [ ] T43 `plugins/paseo-hosts/README.md`, `plugins/paseo-hosts/skills/paseo-hosts/SKILL.md` - both say that the app restarts at least twice, and more after a rollback or when it stops answering, that a command waits up to 2 minutes for a downloaded app update to install, and that a failed restore names the backup file; a grep finds `at least twice`, `2 minutes` and `backup.json` in each file and `restart twice` or `starts again twice` in neither (Design)
- [ ] T44 `docs/specs/paseo-hosts.md` - manual steps 5 and 6 with three `paseotest` rollbacks on each desktop, each followed by a read of the restarted app's `@paseo:daemon-registry`, recorded as evidence with whether an update was pending; both desktops end with their hosts and tunnels (AC-05, AC-06)

## Open Questions

### Q7: Should a restore the CLI cannot confirm get its own criterion, with AC-06 limited to the cases the CLI recovers from?

**Recommendation:** A. A run that ends with a damaged host list must say so, and R-23 F-01 was exactly that path going unreported.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Bound AC-06, add AC-16** | AC-06 covers a window lost up to twice and a restored list deleted once. A new AC-16 says that every other rollback path exits 1, names `PASEO_HOSTS_DIR/app-registry-<client>.backup.json`, and that file holds the list the app had before the command; the Design says every unconfirmed path reaches that exit | One more criterion to prove; its proof is the fake DevTools case that makes every restore fail |
| **B. Keep AC-06 as written** | No new criterion; the backup-file exit stays in Design | AC-06 promises a restore on paths the Design gives up on, so a review can find it unmet, or pass a run that lost the list (R-24 F-02) |

**Why this is yours:** it sets how much the CLI promises when the app keeps undoing its writes.

### Q8: How should the live run prove that `link` waits for an app update installer?

**Recommendation:** A. It runs the real snippets on both desktops in minutes, without depending on a Paseo release being available.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Stand-in installers** | A new manual step: during `link`, run a long-lived stand-in process whose executable is under `%LOCALAPPDATA%\@getpaseodesktop-updater\` on Windows, and one whose arguments contain `sh.paseo.desktop.ShipIt` on the Mac, stop it after 20 seconds, and record that the app started only after it ended; then check that each app still runs 60 seconds after `link` exits | It does not run a real update, so a real installer that behaves differently, for example by starting late, is not covered |
| **B. A real pending update** | Install the previous Paseo release on a desktop, let it download the current one, then run `link` and record the install and the relaunch | Downgrades a desktop app the owner uses, depends on the updater's own timing, and takes longer; may need several tries |
| **C. Keep the plan** | The live run records whether an update was pending | AC-05's update clause may have no executed evidence on Windows at review time (R-24 F-03) |

**Why this is yours:** it trades proof strength against changes to the apps the owner works in.

### Q9: Should the tests cover a restore that holds in the session but is gone after the restart, and should the Design say the check after a rollback opens a new forward?

**Recommendation:** A. It is the branch that confirms a rollback after a restart, and the fake app can already lose uncommitted writes.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Add both** | A T39 case where the restored value reads back in the session but is missing after the restart, asserting that the CLI restores it and checks again; step 5 says that debug launch opens a new debugging-port forward | One more test case |
| **B. Leave them out** | Less test code | The repeat-once branch has no test that fails first (R-24 F-05) |

**Why this is yours:** the reviewer marked it a judgement nit, so the extra test is optional.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-10 | R-1 | spec | `43cc4f95a8aa696194d3c5cbad3d8f210bb57d98` | unknown | procedural | Two blocking and five should-fix factual or judgement findings, four nits; model identity not attested. |
| 2026-11-10 | R-2 | spec | `ca547a83a2d5768315eee7e0c33961c072c7fb29` | unknown | procedural | Six should-fix findings (five factual, one judgement) and two nits, none blocking; model identity not attested. |
| 2026-11-10 | R-3 | spec | `8e5c51499cf9073e6507099d1c694f5ae61d0667` | unknown | procedural | Five should-fix findings (three factual, two judgement) and three nits, none blocking; model identity not attested. |
| 2026-11-10 | R-4 | spec | `c648b53d1d17d5c1f6c4026bbec735c0373df0ad` | claude-opus-4.8 | procedural | Three should-fix factual findings and three nits (two factual, one judgement), none blocking; model reported by the reviewer, not requested. |
| 2026-11-10 | R-5 | spec | `8f9aba05ac58d02989b483293064597bf17cff4c` | unknown | procedural | One should-fix factual finding and one factual nit, none blocking; model identity not attested. |
| 2026-11-10 | R-6 | spec | `7cf545ffec4c3eb8c9edf5290fc6223cd917d7f0` | unknown | procedural | Three should-fix factual findings and one factual nit, none blocking; model identity not attested. |
| 2026-11-10 | R-7 | spec | `038146bca5d105691d47219cb16f8efaacb4eb2a` | claude-opus-4.8 | procedural | One should-fix factual finding and one factual nit, none blocking; model reported by the reviewer, not requested. |
| 2026-11-10 | R-8 | spec | `c1ae6fe96c0d3ce22320142d6b553268e84c33aa` | unknown | procedural | One should-fix factual finding, not blocking; model identity not attested. |
| 2026-11-10 | R-9 | spec | `b3e5b4ce742b346b17d45cb0d2fbc30017d5ae39` | unknown | procedural | No findings; model identity not attested. |
| 2026-11-10 | R-9 | spec | `b3e5b4ce742b346b17d45cb0d2fbc30017d5ae39` | n/a | n/a | accepted by owner |
| 2026-11-11 | R-10 | implementation | `70566773176866fdb4ce7ab48076d093f8aec87f` | unknown | procedural | One blocking factual finding (client keys can open remote forwards) and two nits; AC-04 not met, six live-only criteria not verified, AC-12 untested, seven met; model identity not attested. |
| 2026-11-11 | R-11 | spec | `e312b04259376552e59fdf0d2749259bdd247a2f` | claude-opus-4.8 | procedural | One blocking factual finding (Unix socket remote forwards still open), two should-fix judgement findings and one factual nit; model reported by the reviewer, not requested. |
| 2026-11-11 | R-12 | spec | `586a3f15f625d380f663dad948cdb81aabaa067c` | unknown | procedural | Two should-fix factual findings (the CI runner has sshd, no tasks for the revision), two factual nits and one judgement nit, none blocking; model identity not attested. |
| 2026-11-11 | R-13 | spec | `ff0b45686b127b816fe19c08ddb0bef4a14b7a32` | unknown | procedural | Two should-fix factual findings (the daemon-port test case passes for the wrong reason, no migration note for existing key lines) and one factual nit, none blocking; model identity not attested. |
| 2026-11-11 | R-14 | spec | `889e786b7eedddb9a28cc4ea6686d07cd85201ab` | unknown | procedural | One should-fix factual finding (AC-12 cannot be met before the PR), one factual nit and one judgement nit (minimum OpenSSH version), none blocking; model identity not attested. |
| 2026-11-11 | R-15 | spec | `6f76bd03fb3eb67333078ab200d764abf386d1c6` | claude-opus-4.8 | procedural | Two factual nits and one judgement nit (a re-link on a pre-7.8 server breaks the working tunnel), none blocking; model reported by the reviewer, not requested. |
| 2026-11-11 | R-16 | spec | `d70c77e50e3d4acfe7895aa9755ccceb0fc88904` | unknown | procedural | Two factual nits (the key file backup covers only the latest run; the summary's tunnel-only wording), none blocking; model identity not attested. |
| 2026-11-11 | R-17 | spec | `3178e9765baedcd8444cdedbaae3d02388b96538` | unknown | procedural | One judgement nit (whether the terminal check may add a dependency), none blocking; model identity not attested. |
| 2026-11-11 | R-18 | spec | `6d2f22af4333c457b235e6bef0da65938b9b5095` | unknown | procedural | One should-fix factual finding (T36 would re-link the operator host's own daemon) and one factual nit (nothing builds the macOS terminal check), none blocking; model identity not attested. |
| 2026-11-11 | R-19 | spec | `09384960f4f31b586c434c25b7094e96ddf2eb61` | claude-opus-4.8 | procedural | One factual nit (the reason CI does not check the macOS file), none blocking; model reported by the reviewer, not requested. |
| 2026-11-11 | R-20 | spec | `6f705bfb52c4f044e66f22308d6ff6790014a044` | unknown | procedural | One should-fix factual finding (the README still says the key allows only the daemon forward), none blocking; model identity not attested. |
| 2026-11-11 | R-21 | spec | `9db96c0807bb0ab275149d48882b4250b05fa7ba` | unknown | procedural | No findings; model identity not attested. |
| 2026-11-11 | R-21 | spec | `9db96c0807bb0ab275149d48882b4250b05fa7ba` | n/a | n/a | accepted by owner |
| 2026-11-11 | R-22 | implementation | `75f133019ee3927b4b563121903ff9caa843b754` | claude-opus-4.8 | procedural | Fourteen criteria met, AC-12 not verified (needs the merge, issue #77); one should-fix factual finding (the pseudo-terminal test fails on macOS) and one factual nit (the owner summary is out of date); model reported by the reviewer, not requested. |
| 2026-11-11 | R-23 | implementation | `d4155d62af70742f8d271e4bde7138e6459b379f` | unknown | procedural | One blocking factual finding (a lost page after the reload skips the restore) and two should-fix factual findings (a pending app update races the relaunch; the macOS debug launch needs a settle time); AC-05 and AC-06 not met, AC-12 not verified, twelve met; model identity not attested. |
| 2026-11-11 | R-24 | spec | `f9405ec9afecea149a0f74bd3e4cb188a0e8f5e9` | unknown | procedural | Four should-fix findings (two factual: the restart count and the tasks' files; two judgement: unbounded AC-06 recovery and no executed update check) and two nits, none blocking; model identity not attested. |

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

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers; Design, Plugin layout; Test Plan, AC-14
EVIDENCE: Line 124 says the `version` job waits for the new `paseo-hosts` job. cmd/vh-adlc/workflow_test.go:106 requires `version.Needs` to equal exactly `[]string{"verify", "checker", "checker-macos", "remote-gui"}`, so that change fails the root `go test ./...` unless the test also changes. The covers list (lines 6-11) leaves out cmd/vh-adlc/workflow_test.go. It also leaves out the AC-14 test path; remote-gui keeps the equivalent test in tests/remote-gui/package.test.ts, and CI runs it as a separate `bun test tests/remote-gui` step (ci.yml:111-112). It also leaves out README.md:86 and CONTRIBUTING.md:24 and :67-68, which list each plugin and its checks. The remote-gui document lists all of these in its covers (docs/specs/remote-gui.md:8-15). Line 124 names only the build, test, vet, lint and tidy steps for the new CI job, and the AC-14 row (line 241) does not say where its test lives or which CI step runs it.
PROPOSAL: Add the workflow test, the AC-14 test directory (for example tests/paseo-hosts/), README.md and CONTRIBUTING.md to covers and to the Design. Say that the CI job runs the installed-copy test and that workflow_test.go expects the new needs list.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, onboard and Registry; Acceptance Criteria AC-03
EVIDENCE: Onboard step 5 (line 156) says "Write the registry file" and works out `PASEO_CLIENT_HOST` again from `--client-host`, then `PASEO_DNS`, then `ssh -G`. No step says that a re-run reads the existing entry, so a re-run drops `PASEO_CLIENTS`, which `remove` depends on (line 196). A re-run without the earlier `--client-host` also changes `PASEO_CLIENT_HOST`, while linked clients keep the old name in their alias blocks. The port table (line 139) applies 6767 only "for a newly onboarded server", but no onboard step says that a re-run keeps the registry's port, for example 6867 on the server the local tool onboarded. Preflight step 1 (line 152) requires "a free daemon port", but on a re-run `paseo.service` already holds that port. The local tool allowed this case (paseo-host:173). AC-03 (line 212) checks only the password, the unit, the route and verification.
PROPOSAL: Say that re-running `onboard` reads the existing entry and keeps its port, `PASEO_CLIENTS` and `PASEO_CLIENT_HOST` unless a flag overrides them, and that preflight accepts a port held by `paseo.service`. Extend AC-03 and its proof to cover these, including a re-run on a local-tool registry at 6867.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, unlink and remove
EVIDENCE: Line 196 says `remove` "stops at the first failure" while it unlinks the clients. The same line says the later sweep of key lines covers "clients it could not reach", but `remove` never reaches that sweep when a client cannot be reached. `unlink` (lines 190-194) starts with the same probe as `link`, and that probe requires the app to be installed (line 163), so it cannot drop a client that is offline for good, has no app or was linked with `--no-app`. No command removes such a client from `PASEO_CLIENTS`. `--no-clients` is defined only for a registry that names no clients. As written, one retired PC in `PASEO_CLIENTS` blocks `remove` for that server permanently.
PROPOSAL: Define a path for a client that cannot be reached or has no app, for example `unlink --server-only` or `remove --skip-client <c>`, which removes the server key line and the `PASEO_CLIENTS` entry and reports what stays on the client. Fix the "could not reach" wording and add a proof case for this path.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, link step 3; Registry
EVIDENCE: Line 167 copies "the operator host's known-hosts entry for the server" to the client. It does not say which name it looks up or which name the client gets, and does not say what happens when no entry exists. The client checks `PASEO_CLIENT_HOST` with `StrictHostKeyChecking yes`, and checks `[host]:port` when `PASEO_CLIENT_PORT` is not 22. After R-1, `PASEO_CLIENT_HOST` is often a name the operator host never connects by: the tailnet name even when the operator's alias uses another HostName, or `--client-host`, which line 156 defines as the case where the client uses a different name. The local tool looked up only `PASEO_DNS` and stopped when it found no entry (paseo-host:508-509). An entry written with HashKnownHosts cannot be renamed either.
PROPOSAL: Specify that the host key is looked up by the name the operator host uses, then written on the client under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT` (or that it is read from the server's own host key files over the trusted connection), and state the failure when no key is found. Cover a non-22 port and a `--client-host` value in the AC-04 tests.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary
EVIDENCE: The summary says the plugin is built "following the remote-gui pattern" (line 24) and lists the proposed checks as Go tests, CI lint and race checks, and a manual run (line 30). It does not say that, unlike remote-gui, the first build downloads modules from Go's module proxy and checksum database (line 122), a decision the owner made after R-1 (line 73). It also leaves out the new AC-14 installed-copy check (line 223). It does not say that the build needs a logger release that does not exist yet (line 206; the latest tag is v0.0.5, and PR michielvha/logger#8 is an open draft), while line 32 says merging that PR needs separate approval. Together these mean implementation cannot finish until that approval is given.
PROPOSAL: In the summary, say that the build needs network access to the module proxy on first run and that go.sum verifies the downloads. Name AC-14 among the planned checks, and say that implementation waits on the logger PR's merge and tag.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, link step 5
EVIDENCE: Line 169 copies the password with `Set-Clipboard` on Windows when `--no-app` is given. Line 61 says it is unmeasured whether an app started from an OpenSSH session reaches the signed-in desktop, and line 178 avoids that risk for the app with a scheduled task. A clipboard set from a Windows OpenSSH session has the same session limit, but the Design takes no such step for it. No criterion or Test Plan row covers `--no-app` on either platform, so the manual fallback could ship broken.
PROPOSAL: Use the same interactive-session method for the Windows clipboard, or drop the Windows clipboard copy and print only the manual values. Add a criterion and proof for the `--no-app` result.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry; Test Plan
EVIDENCE: Line 184 says "Release builds do not contain this code" about the `PASEO_HOSTS_TEST_REJECT_ENTRY` fault injection. No criterion or Test Plan row checks that a build from the wrapper ignores that variable.
PROPOSAL: Add a test that runs a default build with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` against the fake DevTools page and checks that the written entry is valid.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-08 and manual procedure
EVIDENCE: The AC-08 row (line 235) says the forbidden-names search uses `PASEO_HOSTS_FORBIDDEN_NAMES`, "which the live run sets". None of manual steps (1) to (7) (line 243) runs that test or sets the variable. In CI the variable is unset, so the search checks nothing.
PROPOSAL: Add a manual step that runs the search test with `PASEO_HOSTS_FORBIDDEN_NAMES` set to the operator host's machine, user and tailnet names and records the result.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, onboard and Configuration; Context, Owner summary
EVIDENCE: Onboard step 2 (line 159) hashes the password "with `hashDaemonPassword` from the pinned Paseo runtime in `PASEO_HOSTS_CACHE`". Line 145 says that cache holds the "Local Paseo runtime used for hashing and verification". Step 6 and Desktop app entry step 1 (line 183) also run the local `paseo` CLI over `PASEO_URL`. The document does not say what installs that runtime, or that the operator host needs Node and npm and access to the npm registry. The local tool relied on a runtime that was already installed in an unrelated checkout (paseo-host:10) and ran `node` in it (paseo-host:320-321). AC-08 expects a fresh operator host. The Owner summary (line 28) names only "two Go libraries" as first-run downloads, but the CLI also has to fetch `@getpaseo/cli` and its dependency tree from npm. The Test Plan uses a stand-in `npm`, so no check covers this install.
PROPOSAL: Say how and when the CLI installs the pinned `@getpaseo/cli` into `PASEO_HOSTS_CACHE`, for example with `npm install --prefix` at the exact version on first use. List Node and npm on the operator host as prerequisites with a clear exit when they are missing. Mention the npm download in the Owner summary, and include an empty-cache case in the AC-08 proof.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, link step 5 and remove; AC-07
EVIDENCE: Line 204 says `remove` stops with exit 3 only "When neither names a client", so that "it never leaves an app entry behind silently". The real server was linked to the Mac by the local tool, which records no `PASEO_CLIENTS` (paseo-host:340-352). If the owner then links the Windows PC with the plugin, as planned, `PASEO_CLIENTS` names only Windows. `remove` then unlinks Windows, the sweep deletes the Mac's key line, and the Mac keeps its app entry with the password and its `paseo-host` alias block, without any warning. AC-07 checks only "no client it unlinked", so it passes in that case. Separately, link step 5 (line 175) records the client only after the key line, host key and alias block are written. A `link` that fails at step 4 or in the app step leaves a client that `remove` cannot find.
PROPOSAL: Before `remove` changes anything, have it count the server's tunnel-only key lines that have no `paseo-hosts:<client>` comment for a client it will unlink. If any exist, stop with exit 3 unless `--client` or `--no-clients` covers them. Record the client in `PASEO_CLIENTS` before link step 2. Add the mixed-registry case to the AC-07 proof.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, unlink and remove
EVIDENCE: `unlink` step 1 (line 198) deletes the app entry using "the same ... steps as `link`". `link` identifies the entry by the `serverId` it reads from the live daemon with `paseo daemon status --json` (lines 183, 185). If a server's daemon is down or the server no longer exists, `unlink` cannot find the entry to delete. `remove` then stops at the first failure (line 204) before it deletes the registry files (line 206). The document gives a path for a client that is gone (`--server-only`) but none for a server that is gone. In that case the owner has to edit the registry and every app by hand, and `list` and the skill keep reporting the server.
PROPOSAL: Raise as an open question whether `unlink` should also match entries by the `paseo-<alias>` connection host when the daemon cannot be reached, and whether to add a client-only `remove` path for a server that cannot be reached, mirroring `--server-only`.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-09
EVIDENCE: AC-09 (line 226) says local-tool registry files "work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`". Its proof (line 245) only parses the format and rejects a command substitution. None of `verify`, `status`, `list`, `link` or `unlink` is run against a local-tool registry. In particular, no test checks that `link` falls back to `PASEO_DNS` and port 22 when `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT` are missing (Registry, line 151). The AC-03 and AC-07 rows cover only `onboard` and `remove`.
PROPOSAL: Extend the AC-09 row to run each named command against a fixture written in the local tool's format. Assert that `link` writes the client entries under `PASEO_DNS` with no port.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-04 and AC-15
EVIDENCE: The Test Plan intro (line 236) runs the embedded snippets through a stand-in `ssh` with a "stand-in ... `powershell`". The AC-04 row (line 241) asserts results "for both platforms against temporary files". The Windows client snippets that write the SSH config, `known_hosts`, the key and its ACL are PowerShell, and a stand-in does not run them. Windows is not measured live yet (Context, line 66), so these tests are the only automated evidence for Windows. As written, they could pass without ever running a Windows snippet.
PROPOSAL: Say that the PowerShell snippets run under a real `pwsh` in the Go tests and in CI, with ACL steps faked where Linux cannot run them. If that is not possible, state in AC-04, AC-15 and the Owner summary that the Windows snippets are proven only by manual step 6.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Plugin layout and Configuration
EVIDENCE: Line 126 says the wrapper builds into `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts/builds`. Line 145 says `PASEO_HOSTS_CACHE` is also "the build cache". The document does not say whether the wrapper reads `PASEO_HOSTS_CACHE`, so the two places can disagree when the variable is set.
PROPOSAL: Either have the wrapper build into `${PASEO_HOSTS_CACHE}/builds`, or remove "and the build cache" from the table row.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry and remove; AC-07
EVIDENCE: Line 185 keeps `app-registry-<client>.backup.json` in `PASEO_HOSTS_DIR` after success. That file holds the client's full host list, passwords included. Line 206 and AC-07 (line 224) say the "registry files and password are gone" after `remove`. Terms defines the registry as only the `.env` and `.password` files, and nothing deletes or rewrites the backups. The removed server's plaintext password therefore stays on the operator host, and restoring a backup would bring the removed host back.
PROPOSAL: State what happens to the backups on `unlink` and `remove`, for example deleting the removed entry from each backup. Otherwise, narrow the AC-07 wording to the `<alias>` files.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, link; Acceptance Criteria
EVIDENCE: Line 177 makes `status <alias>` the replacement for the handoff notes, which the owner chose to drop. With `--no-app` it is also where the owner sees the Remote SSH value for each client. No criterion or Test Plan row checks what `status` prints. AC-09 checks only that it "works" on a local-tool registry.
PROPOSAL: Add the fields `status` must print to AC-09 or AC-11, with a reporter test that asserts them.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, unlink and remove; Acceptance Criteria AC-07; Context, Owner summary
EVIDENCE: Line 202 says `unlink --server-only` "deletes the server's `authorized_keys` lines with the comment `paseo-hosts:<client>`". The local tool wrote its key line as `printf '...command="/bin/false" %s\n' "$port" "$pub"` (paseo-host:371), where `$pub` is the client's `.pub` file created with `-C "paseo@$(scutil --get LocalHostName ...)"` (paseo-host:500). That line's comment is `paseo@<host>`, not `paseo-hosts:<client>`. The real server was linked to the Mac by the local tool (Context, line 46). For a client the local tool linked that is now gone or lost, `--server-only` deletes nothing and drops nothing from `PASEO_CLIENTS`, yet nothing in the Design makes it fail. The client's key still opens the tunnel, and the lost client's app still holds the password. AC-07 (line 226) says `unlink --server-only` "removes that client's key line ... after which `remove` completes". In this case `remove` instead stops with exit 3 on the unattributed line (line 204). The Owner summary (line 28) says `--server-only` "revokes one that is gone".
PROPOSAL: Have `unlink --server-only` exit 1 when no line carries the client's comment and name the remaining tunnel-only lines that no recorded client owns. Alternatively, let it select a line by key fingerprint or comment. Either way, state the local-tool case in the Design and AC-07.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, unlink and remove; Acceptance Criteria AC-07
EVIDENCE: Line 208 deletes the server's entry from "every `app-registry-*.backup.json` in `PASEO_HOSTS_DIR`", and AC-07 (line 226) requires that "no app backup in `PASEO_HOSTS_DIR` holds the server's entry". The local tool writes its backup to `$PASEO_HOSTS_DIR/mac-app-registry.backup.json` (paseo-host:455, `backupFile`), with mode 600 and the app's full previous host list, passwords included (lib/mac-app-register.mjs:122). That name does not match the glob. On the operator host that ran the local tool, `remove` leaves that backup with any server entry it holds, and AC-07 fails as worded. AC-09 requires local-tool state to work unchanged with `remove`.
PROPOSAL: Include the local tool's `mac-app-registry.backup.json` in the backup cleanup, or name it in the Design and AC-07 as a file `remove` leaves in place.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Plugin layout and link; Test Plan intro
EVIDENCE: Line 125 sends the snippets "to `ssh` on standard input, never as arguments", and line 169 runs "a PowerShell probe" on Windows. The Design never says what the Windows client runs that input with. Microsoft's OpenSSH Server configuration page says "The initial default in Windows is the Windows command prompt (cmd.exe)", and its example shell is `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`. Windows ships Windows PowerShell 5.1, not PowerShell 7. A PowerShell script piped to the default shell goes to cmd.exe. The Test Plan (line 238) runs the snippets under `pwsh` 7.6.9 on Linux, so a snippet that uses syntax only PowerShell 7 accepts, such as `&&`, `??` or the ternary operator, passes every automated test and then fails on the client.
PROPOSAL: State the remote command that runs the Windows snippets, for example `powershell.exe -NoProfile -NonInteractive -Command -`, and that snippets keep to Windows PowerShell 5.1 syntax. Alternatively, require `pwsh` on the client and have the probe report it missing.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, unlink and remove; Acceptance Criteria AC-07
EVIDENCE: Line 206 says `remove --skip-server` "unlinks the clients as above ... skips every step on the server". The check that stops `remove` with exit 3 for unattributed key lines (line 204) reads the server, so it cannot run here. On a local-tool registry, where a missing `PASEO_CLIENTS` "means none recorded" (line 152), `--skip-server` therefore unlinks no client. It deletes the registry and leaves the Mac's app entry, with its password, without a warning. That contradicts "So it never leaves an app entry behind silently" (line 204). Line 208 cleans backups by "the server's entry", but the Design does not say how a backup entry is matched when the `serverId` cannot be read. Line 208 also follows the `--skip-server` paragraph and begins "On the server it then stops", so it reads as part of the `--skip-server` path.
PROPOSAL: When `PASEO_CLIENTS` is absent and no `--client` or `--no-clients` is given, have `--skip-server` stop with exit 3. Match backup entries by connection host in that path, and move the server-step paragraph before the `--skip-server` paragraph.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, link; Acceptance Criteria AC-09
EVIDENCE: Line 177 lists the `status` output as "the server, exposure, port, Remote SSH value per linked client, and agent CLIs". AC-09 (line 228) adds `PASEO_URL` and requires the fields "under the same names in `--json`". Line 77 records the owner's choice of "a fixed set of `status` fields". Neither section names those fields or their JSON keys.
PROPOSAL: List the `status` fields once in the Design with their JSON key names, including `PASEO_URL`, and have AC-09 refer to that list.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: The summary does not mention three decisions taken after R-3 and recorded on line 77: `remove --skip-server` for a server that is gone, Windows snippets tested under a real `pwsh` with Windows otherwise proven only by the manual run, and the fixed `status` fields. Line 32 says "`link`, `unlink` and `remove` restart the desktop app twice". Under line 175, `link --no-app` leaves the app alone, and `unlink --server-only` (line 202) does not contact the client.
PROPOSAL: Add the three R-3 decisions to the summary, and say that `link --no-app` and `unlink --server-only` do not restart the app.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Design; Acceptance Criteria AC-09
EVIDENCE: Scope (line 87) lists "`verify`, `status`, `list` and `password <alias>` for onboarded servers". AC-09 (line 230) requires local-tool registry files to "work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`", and the AC-09 proof (line 249) runs `verify` and `list` against a local-tool fixture. The Design defines `status` (line 177) and the `password` output rule (line 165). It does not say what `verify` checks, whether it changes anything, or which exit code it returns on a failed check. It also does not say what `list` prints. The local tool's `verify` ran only the authentication checks over `PASEO_URL` (paseo-host:89-102, :554). As written, an implementation review cannot decide what "works" means for these two commands.
PROPOSAL: Give `verify` and `list` a short Design entry. For example, `verify <alias>` runs onboard step 6 (plus HTTPS health when published) without changes and exits 1 on a failed check, and `list` prints each registry alias with its `PASEO_SSH` and `PASEO_URL`.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-07
EVIDENCE: AC-07 (line 228) is composite. It includes these clauses: `unlink --server-only` "for a client whose key line has no `paseo-hosts:<client>` comment ... exits 1 and changes nothing"; `remove --skip-server` "with no client recorded or named ... exits 3 unless `--no-clients` is given"; and "no app backup in `PASEO_HOSTS_DIR` holds the server's entry", which line 210 extends to the local tool's `mac-app-registry.backup.json`. The AC-07 row (line 247) and manual step 7 (line 257) cover none of these three clauses. Under the standard, a passing subset never upgrades a composite criterion, so AC-07 would be reviewed as `untested` even when the code is correct.
PROPOSAL: Add these three assertions to the existing `internal/remove` cases in the AC-07 row. They need no new test file or CI step.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry steps 2, 4 and 5
EVIDENCE: Line 186 says that on Windows the CLI "stops the `Paseo` process". Step 5 (line 189) then quits the app straight after step 3 writes the entry or step 4 writes the previous value back. Chromium writes localStorage to disk in batches. chromium/chromium components/services/storage/dom_storage/local_storage_impl.cc sets `default_commit_delay = kCommitDefaultDelaySecs`, with `kCommitDefaultDelaySecs = base::Seconds(5)`. A forced stop skips Electron's shutdown, so a write less than 5 seconds old can be lost. On the success path the new entry is gone after the relaunch. On the rollback path the app has already removed the whole `@paseo:daemon-registry` key (line 62). If the restore write is lost too, the app has no hosts left, which contradicts AC-06. The local tool quits through AppleScript (paseo-host:418) and waits about 8 seconds after its write (lib/mac-app-register.mjs:124-129). On Windows the app quits on its own when its last window closes (main.js:876-879, app.asar 0.15.3).
PROPOSAL: In step 5, quit the app gracefully on both platforms once the commit delay has passed, for example by closing its window from the signed-in session on Windows, and force-stop it only after a timeout. State that this also applies to the rollback path.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Plugin layout; Test Plan intro
EVIDENCE: Line 125 keeps the Windows snippets "to Windows PowerShell 5.1 syntax". The Test Plan (line 242) runs them under `pwsh` 7.6.9, with one test that rejects five PowerShell 7 operators. Syntax is not the only difference. Microsoft's about_Character_Encoding page for 5.1 says `Out-File`, `>` and `>>` create UTF-16LE files, `-Encoding UTF8` always writes a BOM, and `Set-Content` on a new file uses the ANSI code page. PowerShell 6 and later default to utf8NoBOM. Local OpenSSH 10.0p2 rejects both 5.1 forms. `ssh -G -F` on a config file with a UTF-8 BOM printed `Bad configuration option: \357\273\277host`, and on a UTF-16 file it printed `no argument after keyword "\377\376h"`. Windows PowerShell 5.1 also drops an empty string argument to a native command (PowerShell/PowerShell#1995), so `ssh-keygen -N ""` loses its empty passphrase, while pwsh 7 on Linux passes it. The pwsh tests would pass snippets that break link steps 1 and 3 on every Windows client.
PROPOSAL: State in the Design that the Windows snippets write `config`, `known_hosts` and key files through .NET as UTF-8 without a BOM, and pass no empty native arguments. Add the file-writing cmdlets and redirections to the existing forbidden-syntax test instead of adding a new test.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, unlink and remove; Acceptance Criteria AC-07
EVIDENCE: Line 206 says `remove` stops at a client it cannot reach, "naming `unlink --server-only`", "so a re-run continues where it stopped". Line 210 says `--skip-server` unlinks the clients "as above". `unlink --server-only` (line 204) deletes the client's lines on the server, and exits 1 with nothing changed when no line carries `paseo-hosts:<client>`. Two cases have no way out. First, when the server is gone and a recorded client is offline, `remove --skip-server` stops at that client, and the `unlink --server-only` it names needs the server it cannot reach. Second, `link` records a client before its key line exists (line 171). If that `link` failed before step 2, the client has no key line. Once the client is unreachable, `unlink --server-only` exits 1 and `remove` keeps stopping at it. In both cases the registry and password stay, although AC-07 says `remove` completes after `--server-only`.
PROPOSAL: Let `unlink --server-only` drop a recorded client that has no key line. Let `remove --skip-server` drop an unreachable client and report what stays on it, because its key opens nothing once the server is gone. Add both cases to the existing AC-07 assertions.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary; frontmatter
EVIDENCE: Line 28 says `onboard` installs "a password-protected daemon reachable only over SSH". The summary never mentions `--publish`, which adds a tailnet HTTPS route (Scope, onboard step 4, AC-02). Line 34 says "R-2 to R-4 found none", and `status_description` (line 3) says "R-4 findings applied". At this commit, R-5 is recorded and its findings are applied.
PROPOSAL: Name the `--publish` opt-in and its tailnet HTTPS exposure in the summary, and update both review-status texts to R-5.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-07
EVIDENCE: AC-07 says "With the server unreachable, `remove --skip-server` removes every recorded client's app entry and alias block and the registry files". The R-6 F-03 fix changed Design, unlink and remove, which now says "A client it cannot reach is dropped and reported with the app entry and alias block left on it". The AC-07 Test Plan row also asserts that "`remove --skip-server` with the server and one client unreachable drops and reports that client and completes". In that tested case the unreachable client keeps its app entry and alias block. Read as written, AC-07 is false for that case. An implementation review would therefore get evidence against a criterion while the code does what the Design says.
PROPOSAL: Reword the AC-07 `--skip-server` clause to say that it removes the app entry and alias block of every recorded client it can reach, and drops and reports any client it cannot reach, which keeps its entry and block.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry step 5
EVIDENCE: Step 5 says "Chromium commits localStorage to disk up to 5 seconds late (`local_storage_impl.cc`, `kCommitDefaultDelaySecs`)". Five seconds is only the minimum delay. In chromium/chromium storage_area_impl.cc, `ComputeCommitDelay` returns `std::max(default_commit_delay_, std::max(commit_rate_limiter_.ComputeDelayNeeded(elapsed_time), ...))`. The commit rate limiter is built with `kMaxCommitsPerHour = 60` (local_storage_impl.cc:53) over `base::Hours(1)` (storage_area_impl.cc:79), with float `samples_ / rate_`. So once the app has made one commit after relaunch, the next commit can wait until about 60 seconds after the storage area opened. Only a graceful shutdown flushes pending writes (`LocalStorageImpl::ShutDown`, "Flush any uncommitted data", `ScheduleImmediateCommit`). The 8 second wait does not guarantee the write is on disk. A force-stop at 20 seconds can drop it, although step 6 would then catch the lost entry on the success path.
PROPOSAL: Fix the rationale: say that the graceful quit is what persists the write, and that the wait only covers the default delay. State that a link or unlink that needed a force-stop fails unless step 6, or a re-read after relaunch, confirms the result.

### R-8

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (Side effects); Design, Desktop app entry steps 2 and 5; Design, Skill
EVIDENCE: Line 32 lists the side effects of restarting the desktop app twice: the debugging port and the host list backup. Line 216 has the skill tell the owner only that the app "will restart twice". Neither section says what a graceful quit does inside the app. In app 0.15.3, main.js:844-852 wires `before-quit` to `stopDesktopManagedDaemonOnQuitIfNeeded` with `stopDaemon: () => stopDesktopDaemonViaCli("quit")`. In dist/daemon/quit-lifecycle.js, `shouldStopDesktopManagedDaemonOnQuit` returns `!settings.daemon.keepRunningAfterQuit`. dist/settings/desktop-settings.js:18-19 sets the defaults to `manageBuiltInDaemon: true` and `keepRunningAfterQuit: false`. The same before-quit path calls `installAppUpdateOnQuit` before `app.exit(0)`. The quits in step 5 (AppleScript on macOS, `window.close()` and then `app.quit` on Windows through main.js:876-879) and the macOS SIGTERM fallback, which `registerExternalQuitSignals` turns into `app.quit()`, all take this path. So with default settings, every `link`, `unlink` and `remove` stops the Mac's or Windows PC's own built-in Paseo daemon, and any agents running in it, up to twice per client. A pending app update can also be installed during the CLI's restart. The owner is not told about either.
PROPOSAL: Add to the Owner summary side effects, the Desktop app entry design and the skill's pre-run warning that, under default app settings, the restart stops the client's built-in daemon and its running agents and may apply a downloaded app update. Do this at least by stating the consequence. Alternatively, have the probe report when the app manages a running built-in daemon.

### R-9

NO FINDINGS

### R-10

CRITERION: AC-01 After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
VERDICT: not verified
EVIDENCE: I ran `GOTOOLCHAIN=local go test -race -count=1 ./...` in plugins/paseo-hosts at 7056677 and all packages passed, including the onboard stand-in tests that inspect the install and exposure snippets and the password file mode. I also read onboard.go, install.sh and exposure.sh. The criterion is about real server state (the systemd user unit, the loopback bind, the relay setting, Serve routes, the bcrypt config and a password search on the server). The only evidence for that is the T27 live run on arch-1 recorded in the document, and I did not observe that run. I was not permitted to run against remote hosts.

CRITERION: AC-02 `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
VERDICT: not verified
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed, and that includes the onboard verification-path tests with stand-in ssh and daemon responses. I read the onboard.go verification and publish logic. Rejecting an unauthenticated connection and accepting the password against a real daemon, and the `--publish` Serve route and health check, were only exercised in the live T27 run recorded in the document. I did not observe that run, and I made no remote calls.

CRITERION: AC-03 Running `onboard` again on an onboarded server, including one whose registry the local tool wrote with port 6867, keeps its password, daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, leaves one unit and at most one route, and passes verification. A `--listen-port` that differs from the recorded port exits 2 and changes nothing.
VERDICT: not verified
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed, including the onboard re-run tests that preserve registry keys from a local-tool fixture with port 6867. I read onboard.go and confirmed it returns exit 2 for a differing `--listen-port` before taking any action. Leaving one unit and at most one route and passing verification on a real server depend on the live T27 run, which I did not observe. This composite criterion is not upgraded on the strength of the passing subset.

CRITERION: AC-04 After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command and a forward to any other port. The client trusts the server's host key under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
VERDICT: not met
EVIDENCE: The key line comes from authorize.sh line 14 at 7056677 and matches Design link step 2: `restrict,port-forwarding,permitopen="127.0.0.1:<port>",command="/bin/false" <key> paseo-hosts:<client>`. To test it, I ran an unprivileged local sshd (OpenSSH 10.0p2) on 127.0.0.1:47022 with exactly that line and port 47001, plus an HTTP server on 127.0.0.1:47001.
- A shell command returned exit 1. Refused, as required.
- `ssh -W 127.0.0.1:47001` returned HTTP 200. The daemon-port tunnel works.
- `ssh -W 127.0.0.1:47022` returned "administratively prohibited". Local forwards to other ports are refused.
- `ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:47555:127.0.0.1:47001` succeeded. `ss -ltn` showed a listener on 127.0.0.1:47555, and curl through it returned 200.

So the same key is allowed a forward that is not to the daemon port: a remote forward that opens a listening port on the server. The `go test` stand-in tests pass, and the live T28 evidence for the macOS and Windows clients was not observed by me.

CRITERION: AC-05 After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server.
VERDICT: not verified
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed. I also ran `go test -tags paseotest ./internal/clientapp`, and TestAddUpsertsTheNormalizedEntry, TestRejectedEntryIsRolledBack and TestForceStop passed. The macOS and Windows Windows-snippet tests ran under pwsh and were not skipped. These tests use stand-ins for the app and the CDP endpoint. The real desktop app's host list, its relaunch without a debugging port and its open tunnel are recorded only in the T28 evidence for macbook-pro and win-main, which I did not observe.

CRITERION: AC-06 When the app does not keep the new entry, `link` exits non-zero, the app's previous host list is restored, and the app runs again without a debugging port.
VERDICT: not verified
EVIDENCE: `go test -tags paseotest ./internal/clientapp` at 7056677 passed TestRejectedEntryIsRolledBack, which checks the non-zero exit and the restoration of the previous list against a stand-in app. The link tests in `go test -race ./...` passed. The real app's restore and relaunch without a debugging port were not observed by me, since that evidence exists only as a recorded manual run.

CRITERION: AC-07 After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, the registry files and password are gone, and no app backup in `PASEO_HOSTS_DIR` holds the server's entry. The rest of the server's Paseo state and workspace remain unless `--purge` was given. When the server has a tunnel-only key line that belongs to no client `remove` will unlink, `remove` without a `--client` for it or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line; `unlink --server-only` removes that client's key line and registry record without contacting it, after which `remove` completes; for a recorded client with no key line it drops the client, and for an unrecorded client whose key line has no `paseo-hosts:<client>` comment it exits 1 and changes nothing. With the server unreachable, `remove --skip-server` removes the app entry and alias block of every recorded client it can reach, drops and reports any client it cannot reach, which keeps its entry and block, and deletes the registry files, and with no client recorded or named it exits 3 unless `--no-clients` is given. Other servers and hosts in the apps are unchanged.
VERDICT: not verified
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed the remove and unlink stand-in tests, covering the foreign key line exit 3, `--server-only`, the uncommented line exit 1, `--skip-server` with reachable and unreachable clients, the no-clients exit 3, and backup cleanup. I read remove.go, teardown.sh and the key-removal snippets. Teardown on a real server (unit, listener, Serve route, runtime and config removal, purge behaviour) and real app state are evidenced only by the recorded live runs, which I did not observe.

CRITERION: AC-08 The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed the cmd/paseo-hosts tests:
- With only the documented variables set and a fresh `PASEO_HOSTS_DIR`, they assert that every stand-in ssh invocation targets the given aliases and that `link` without a client exits 3 naming `PASEO_HOSTS_CLIENT`.
- I ran a scratch build with `link arch-1 --no-app` and no client. It printed "no client alias: pass --client or set PASEO_HOSTS_CLIENT".
- TestNoForbiddenNames passed with PASEO_HOSTS_FORBIDDEN_NAMES set to the local hostnames, user names, tailnet name and IPs taken from `hostname`, `whoami`, `tailscale status` and ~/.ssh/config.

The name scan covers only the names I collected on this operator host.

CRITERION: AC-09 Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`. `status <alias>` prints every field listed under link, in human output and under those keys in `--json`. A registry line that is not `KEY=value` is rejected without being executed.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed:
- TestLocalToolRegistry, which runs verify, list, `link --no-app`, status (human and `--json`), unlink and remove on a local-tool fixture without `PASEO_PUBLISHED` or `PASEO_CLIENTS`.
- The registry tests, which reject a non-`KEY=value` line containing command substitution without executing it.

I also ran a scratch build read-only against ~/.config/paseo-hosts:
- `list` and `list --json` printed both servers.
- `status fedora-43 --plain` printed all fields for a file lacking `PASEO_CLIENTS`.
- `status arch-1 --json` emitted the keys alias, ssh, exposure, daemon_port, url, clients[name, remote_ssh] and agents.

CRITERION: AC-10 No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed:
- The CLI test, which scans every stand-in process argument list, the debug log at LOG_LEVEL=debug, and stdout and stderr of every command except `password` for the password.
- The clientapp, link, onboard and remove tests, which do the same checks.

`go test -tags paseotest ./internal/clientapp` passed. Reading the code, I confirmed the password reaches child processes only through environment or stdin, and that it reaches the app inside a CDP websocket message, not an argument. Real remote process tables were not observed.

CRITERION: AC-11 Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command with the documented fields, and the exit code matches the documented meaning.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed:
- The internal/report tests, covering the terminal and pipe matrix crossed with `NO_COLOR`, `--plain` ASCII words, a single `--json` object, and exit codes 0 through 4.
- The command tests, each of which runs CheckReport on its output.

`golangci-lint run ./...` reported 0 issues. My read-only `status` and `list` runs printed labelled lines on stderr and a single JSON object on stdout with `--json`. `status nope` exited 3. One minor gap is recorded as F-02.

CRITERION: AC-12 The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
VERDICT: untested
EVIDENCE: I inspected the document at 7056677. T32, the publish and marketplace install check, is open and AC-12 is unticked. The plugin is not yet in the published vhco-tools marketplace, so no installation from it or new-session skill run exists, and I observed none. The marketplace rows in .claude-plugin/marketplace.json and .agents/plugins/marketplace.json are present in the branch only.

CRITERION: AC-13 The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
VERDICT: met
EVIDENCE: At 7056677 I compared four sources against the Design terms:
- the plugins/paseo-hosts/README.md Terms table, word for word;
- skills/paseo-hosts/SKILL.md;
- the Terms and Commands sections of `paseo-hosts --help` from a scratch build;
- the plugin rows in .claude-plugin/marketplace.json, .agents/plugins/marketplace.json and docs/reference/marketplace.md.

All use the same terms (server, client, operator host, alias, registry, link, unlink, onboard, remove, published) with consistent meanings, differing only in abbreviation. Help defines operator host and the command terms under Commands rather than Terms. This is a manual reading, and no automated check covers it.

CRITERION: AC-14 The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.
VERDICT: met
EVIDENCE: I ran `bun test tests/paseo-hosts` from the repo root at 7056677: 1 pass, 5 expect() calls. The test copies the plugin outside the repository and runs the wrapper with an empty GOMODCACHE and with GOPROXY, GOSUMDB and GOFLAGS unset, so the defaults apply (proxy.golang.org and sum.golang.org). `paseo-hosts --help` succeeded, and both dependency module zips appeared in the fresh cache. `go mod tidy -diff` was clean.

CRITERION: AC-15 `link --no-app` sets up the key, host key and alias block as `link` does, records the client, changes neither the desktop app nor the clipboard and prints no password; a later `link` without `--no-app` adds the app entry, and `unlink` of a client without the app removes its block and key line.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 7056677 passed the link tests. With `--no-app` they assert:
- the key, host key and alias block setup and the client record;
- no app or CDP call, and no open, osascript, pgrep, pkill or pbcopy invocation;
- no password in the output.

A following `link` without `--no-app` performs the app step. The remove and unlink tests passed for unlinking a client without the app, removing its block and key line. A grep of the plugin source found no clipboard access. These are stand-in clients, not real macOS or Windows hosts.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: docs/specs/paseo-hosts.md Design, link step 2 (line 173), and plugins/paseo-hosts/internal/link/snippets/authorize.sh line 14
EVIDENCE: The key line `restrict,port-forwarding,permitopen="127.0.0.1:<port>",command="/bin/false"` restricts only local forwards. `port-forwarding` re-enables remote forwarding too, and `ssh -N` never runs the forced command.

I tested this with an unprivileged local sshd (OpenSSH 10.0p2) using exactly this line. `ssh -N -R 127.0.0.1:47555:127.0.0.1:47001` succeeded, a listener appeared on the server's 127.0.0.1:47555, and traffic passed through it. So any client key can open listening ports on the server. While the daemon is down, it could bind the daemon port and capture other clients' connections and passwords. This contradicts AC-04's "refused ... a forward to any other port".
PROPOSAL: Add a `permitlisten` option that allows no usable listen address, in both the Design key line and authorize.sh. The removal and foreign-line matching should recognise the new line as well. Add a test that a remote forward is refused. In my test, `permitlisten="none"` made OpenSSH 10.0p2 reject the key entirely. `permitlisten="127.0.0.1:1"` blocked `-R` and kept the `-W` tunnel to the daemon port working.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: plugins/paseo-hosts/cmd/paseo-hosts/cli.go, help handling
EVIDENCE: Reading the code at 7056677, `paseo-hosts --help --json` prints the human help text to standard output, not a JSON object. AC-11 says that with `--json`, standard output holds only one JSON object per command.
PROPOSAL: Either emit a JSON object (for example the command list) for `--help --json`, or document that `--help` ignores `--json`.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: plugins/paseo-hosts/internal/report, terminal detection
EVIDENCE: Reading the code at 7056677, the terminal check treats any character device as a terminal, so output redirected to /dev/null counts as a terminal. Nothing a user can see is affected, but it is not a true isatty check.
PROPOSAL: Use a real terminal check such as golang.org/x/term IsTerminal, or an ioctl-based check.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, link step 2 (line 175); Context, Owner summary (line 35); Acceptance Criteria AC-04 (line 232)
EVIDENCE: I started an unprivileged local sshd (OpenSSH 10.0p2, default AllowStreamLocalForwarding) with exactly the Design key line `restrict,port-forwarding,permitopen="127.0.0.1:47101",permitlisten="127.0.0.1:1",command="/bin/false"`. `ssh -W 127.0.0.1:47101` returned `HTTP/1.0 200 OK`, a shell command exited 1, and `ssh -W 127.0.0.1:47122` failed. `ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:47555:127.0.0.1:47101` failed with `remote port forwarding failed for listen port 47555`. But `ssh -N -o ExitOnForwardFailure=yes -R <dir>/remote.sock:127.0.0.1:47101` stayed connected until `timeout` killed it (exit 124). The server side then had `srw------- remote.sock`, and `curl --unix-socket <dir>/remote.sock http://x/` returned the client's page (`hi`). permitlisten only limits TCP listeners, and `port-forwarding` also enables Unix socket remote forwards. So a client key can still make listening sockets wherever the server user can write. The Owner summary's "every remote forward fails" is false, and an implementation that follows Design exactly fails AC-04's "refused ... every remote forward". A local Unix socket forward (`ssh -W <path>`) was denied (`request to connect to path ... was denied`), so only the remote side is open.
PROPOSAL: Raise an open question on how to block Unix socket remote forwards. No authorized_keys option covers them, so the choices are a server-side sshd setting (for example `AllowStreamLocalForwarding local` in a `Match` block, which needs root) or accepting a residual that AC-04 and the summary then state honestly. Add a streamlocal `-R` case to the real-sshd test and to manual step 4.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-04 row (line 252) and the introduction (line 247)
EVIDENCE: The new real-sshd test "skips with a message when `sshd` is not installed". The `paseo-hosts` CI job (`.github/workflows/ci.yml:132-155` at e312b04) runs on `ubuntu-latest` and installs nothing. The runner image readme (`Ubuntu2404-Readme.md`, image 20261101.360.1) lists `openssh-client`, `ssh` and `sshpass` but no `openssh-server`. So in CI the only test that proves the R-10 F-01 fix always skips. A regression in authorize.sh would pass CI, and the fix would rest only on local runs and the manual step.
PROPOSAL: Add a step that installs `openssh-server` in the `paseo-hosts` job, or make the test fail instead of skip when `CI` is set. Say in the Test Plan and the Owner summary that CI runs it.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, implementation reviewer paragraph (line 266); Context, Owner summary
EVIDENCE: R-10 returned AC-01, AC-02, AC-03, AC-05, AC-06 and AC-07 as `not verified` because their live parts were only recorded, not observed. The new paragraph lets the next reviewer only read state over SSH and "runs no `paseo-hosts` command that writes". Read-only observation can show the unit, config, key line text, process list and host list, which covers parts of AC-01, AC-04 and AC-05. It cannot show that `onboard` rejects a password-less connection (AC-02), that a re-run keeps state (AC-03), that a rejected entry is rolled back (AC-06), or what `remove` leaves behind (AC-07). Each of those needs a writing command. `impl_review_clean` requires every criterion to be `met` or residualised. So the complete gate, which the summary says will open the PR, would stall at the next review the same way it did at R-10.
PROPOSAL: Choose a path and state it: let the implementation reviewer run the named manual steps (including the `paseotest` rollback and a `remove` on the test server), or ask the owner as an open question to accept residuals for the live parts of these criteria.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (line 35)
EVIDENCE: The summary says "`--help --json` now prints one JSON object, and colour needs a real terminal". At e312b04, `plugins/paseo-hosts/cmd/paseo-hosts/main.go:11` still treats any character device as a terminal (`info.Mode()&os.ModeCharDevice != 0`), and `internal/link/snippets/authorize.sh:14` still writes the key line without `permitlisten`. These are planned changes, not built ones. The standard asks the summary to distinguish planned work from observed proof.
PROPOSAL: Write the revised behaviours as planned ("will print", "the fix adds") until the tasks that implement them are done.

### R-12

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-04 row (line 253); Context, Owner summary (line 37)
EVIDENCE: The AC-04 row says the real-sshd test "skips with a message when `sshd` is not installed, as on the `ubuntu-latest` runner", and the summary says "(skipped in CI)". The Q2 answer was based on that claim. The runner readme (Ubuntu2404-Readme.md, image 20261101.360.1) lists only the apt packages that the toolset installs. It does not list the base image's packages. bundlewrap/bundlewrap `.github/workflows/tests.yml` runs on `ubuntu-latest`, installs no openssh-server (no apt step), and runs `ssh -o StrictHostKeyChecking=no localhost id`. Run 42346569359 (2026-11-07) concluded `success`. So `sshd` is installed on that runner. The `paseo-hosts` job (`.github/workflows/ci.yml:132-133`) runs on `ubuntu-latest`, so a test that skips only when `sshd` is missing will run in CI. That contradicts the document and the owner's "local only" choice.
PROPOSAL: Say that the test runs in CI because the runner has `sshd`, and confirm this on the first push. If the owner still wants it local only, make it skip when `CI` is set. In either case, correct the AC-04 row and the summary.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Tasks
EVIDENCE: The revision adds `permitlisten="127.0.0.1:1"` to the key line (line 176), a real-sshd test (line 253), `ssh -N -R` in manual step 4 (line 265), and `--help --json` and terminal detection changes (line 35). No task covers any of them. T1 to T31 are ticked, and T32 (line 338) covers only the marketplace install. At 586a3f1, `plugins/paseo-hosts/internal/link/snippets/authorize.sh:14` still writes the line without `permitlisten`, and no Go file mentions `sshd` or `permitlisten`. T27 and T28 stay ticked with live evidence gathered under the old key line. vh-adlc-spec SKILL.md:101 says "Keep checked tasks and add new task IDs for changed requirements". After `planned`, `tasks_populated` already holds, so the binary's next step is `implement`, and no `tasks` step adds them later.
PROPOSAL: Before acceptance, add new task IDs for the failing real-sshd test, the authorize.sh and stand-in changes, the `--help --json` and terminal fixes, and a re-run of the live steps under the new key line.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, link step 2 (line 176); Acceptance Criteria AC-04 (line 233); Context, Owner summary (line 35)
EVIDENCE: I ran an unprivileged local sshd (OpenSSH 10.0p2) with the Design key line and `net.ipv4.ip_unprivileged_port_start = 1024`. sshd denied `-R 127.0.0.1:47555`, `-R 47556`, `-R 0`, `-R 47557`, `-R [::1]:1` and `-R *:1` at the permission check. For `-R 127.0.0.1:1` and `-R localhost:1`, the request passed the check and failed only at `bind [127.0.0.1]:1: Permission denied` (sshd log). So the forward to port 1 is refused only because the bind fails. When the server user can bind port 1 (root, CAP_NET_BIND_SERVICE, or a lowered `ip_unprivileged_port_start`, as container setups often use), that forward succeeds, and AC-04's "every TCP remote forward" is false. The e312b04 summary named this caveat ("Where a server lowers the privileged port range..."). 586a3f1 removed it and now says "which no ordinary user can bind", and preflight does not check for it.
PROPOSAL: Restore the caveat in the summary and the Design as part of the known limit. Alternatively, have preflight report a server user that can bind port 1.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, AC-04 row (line 253) and manual step 4 (line 265)
EVIDENCE: Both proofs say only "`ssh -N -R` ... fail" and do not give the listen spec. A Unix socket remote forward is a documented success under the known limit. In my local sshd run, `ssh -N -o ExitOnForwardFailure=yes -R <dir>/r.sock:127.0.0.1:47301` stayed connected until `timeout` killed it (exit 124) and created `srw------- r.sock`. A reviewer or implementer could therefore run a form that does not match the "every TCP remote forward" wording of AC-04.
PROPOSAL: Name a TCP listen address in both proofs, for example `-R 127.0.0.1:<free port>:127.0.0.1:<daemon port>`, and the daemon port itself.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 30, 35, 37)
EVIDENCE: The summary justifies the known limit with "anyone who also has the password already controls the server". It leaves out the cost that Q1 gave the owner: "A stolen client key alone can still create a Unix socket at an unused path ... where a program such as tmux may later connect". A client linked with `--no-app` holds the key without the password by design (Design link step 5). The revision also removed "keeping Paseo state unless `--purge`", an owner decision that Design line 214 keeps. Finally, the summary says the reviewer "will run that procedure itself", but the Test Plan (line 267) limits the reviewer to steps 1 to 7.
PROPOSAL: State the cost of the limit for a key without the password, including `--no-app` clients. Restore the `--purge` default, and say "manual steps 1 to 7".

### R-13

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-04 row (line 253); Tasks, T33 (line 338)
EVIDENCE: The AC-04 row starts a test HTTP server on the daemon port and says that `-R 127.0.0.1:<daemon port>:127.0.0.1:<daemon port>` must fail. It does not say to stop that server first. T33 says the test "fails on the two `-R` cases with the current key line". I ran an unprivileged local sshd (OpenSSH 10.0p2, `sshd -d`) with the current key line `restrict,port-forwarding,permitopen="127.0.0.1:47611",command="/bin/false"`, which has no `permitlisten`, and an HTTP server on 127.0.0.1:47611. `ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:47611:127.0.0.1:47611` exited 255 with `remote port forwarding failed for listen port 47611`. The sshd log gave the reason as `bind [127.0.0.1]:47611: Address already in use`, not a permission denial. With the HTTP server stopped, the same command stayed connected until `timeout` ended it (exit 124), so the forward succeeded. With `permitlisten="127.0.0.1:1"` added, both forms were denied at the permission check. So while the test server is up, the daemon-port case passes with or without the fix, and T33's done condition cannot hold for that case. R-10's attack needs the daemon to be down, and the test as written never covers that state.
PROPOSAL: In the AC-04 row and T33, require the test to stop the HTTP server before the daemon-port `-R` case, or to use an unoccupied port as the daemon port for that case. Then both `-R` cases fail with the current key line for the right reason.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (line 35); Design, link step 2 (line 176); Tasks, T36 (line 341)
EVIDENCE: At 586a3f1 the summary said "Running `link` again will rewrite existing key lines." ff0b456 removed that sentence and put nothing in its place. Design step 2 says only that an older line "still matches the removal rules below". The local tool wrote the same line without `permitlisten` (`~/code/paseo-hosts/paseo-host:371`, `restrict,port-forwarding,permitopen="127.0.0.1:%s",command="/bin/false"`), and so does the plugin up to now (`authorize.sh:14`). The T27 evidence (lines 332 and 333) shows that the Mac and win-main also connect to fedora-43. T36 re-links only "both desktops", which in this document means arch-1. Every key line that already exists, on fedora-43 or any other server, still allows TCP remote forwards, including on the daemon port. That stays true until someone runs `link` again for that client and server, and the document does not tell the owner. The standard asks the summary to cover migration or recovery where it matters.
PROPOSAL: Restore the migration note in the summary and in Design link step 2: key lines written before this change keep allowing TCP remote forwards until `link` runs again for each client and server. Also either widen T36 to every server in the registry, or name the remaining servers as an owner follow-up.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (line 37); Test Plan, AC-04 row (line 253)
EVIDENCE: R-12 F-01 found that the `ubuntu-latest` runner has `sshd`, and it proposed saying that the test therefore runs in CI and confirming this on the first push. The revision instead says "wherever one is installed (no CI step is added for it)" and "skips with a message when `sshd` is not installed, and no CI step is added to install it". Those statements are accurate. Neither one says whether the `paseo-hosts` CI job is expected to run the test or skip it. The owner answered Q2 on the earlier claim that CI skips it, and the summary still does not say whether CI covers the R-10 fix.
PROPOSAL: Add one clause to the summary and the AC-04 row saying that the runner is expected to have `sshd`, so the test should run in CI, and that the first push confirms whether it ran or skipped.

### R-14

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (line 39); Tasks, T32 (line 342); Acceptance Criteria AC-12 (line 241); Design, Delivery (line 226)
EVIDENCE: The summary says "The owner has approved opening the PR once the complete gate passes". The `complete` gate in feature-documents.md includes `all_met` and `impl_review_clean`, so AC-12 must be met or have a residual. AC-12 requires the plugin to install "from the vhco-tools marketplace". T32 runs only "once the plugin is in the vhco-tools marketplace". Delivery says the catalogs point at `./plugins/paseo-hosts` on the default branch, "so merging is the release path for the plugin". So AC-12 cannot be met before the merge, and the merge comes after the PR. R-10 returned AC-12 as `untested` for this reason (line 755). While T32 stays open, `next` keeps returning `implement` (`tasks_open`). The complete gate cannot pass without an owner residual, and that residual needs a tracker (delivery.md: "A residual needs a durable tracker before the feature is complete"). The document does not mention a residual, and the summary does not name this precondition. R-11 F-03 fixed the same kind of stall for the live criteria but did not cover AC-12.
PROPOSAL: State how AC-12 is settled before the PR. One option is for T32 to install from a marketplace added at the feature branch ref before the PR. The other is for the owner to accept an AC-12 residual with a tracker issue, closed after the merge. Then say which one applies in the summary.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (line 29)
EVIDENCE: Line 29 says "`link` gives a macOS or Windows desktop a key that opens only the daemon tunnel". Line 37 of the same summary and Design link step 2 say the key can still create a Unix socket remote forward at any unused path the server user can write. Key lines that already exist also keep allowing TCP remote forwards until `link` runs again. I checked this with a local unprivileged sshd (OpenSSH 10.0p2) and the planned key line. `-W` to the daemon port returned `HTTP/1.0 200 OK`. `-W` to another port, the shell command and both TCP `-R` cases failed, and the sshd log shows the `-R` cases were "denied". `ssh -N -o ExitOnForwardFailure=yes -R <dir>/r.sock:...` stayed up until `timeout` ended it (exit 124) and left `srw------- r.sock`.
PROPOSAL: On line 29, say the key opens only the daemon tunnel apart from the Unix socket limit described below, or drop "only".

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, link step 2 (line 175) and onboard step 1 (line 162)
EVIDENCE: The OpenSSH release notes (openssh.com/releasenotes.html, "Changes since OpenSSH 7.7") add the `permitlisten=` authorized_keys option in 7.8. Before this revision the key line needed only `restrict`, which came in 7.2. A server whose sshd predates 7.8, such as Ubuntu 18.04 with 7.6, does not know the new option. Neither the document nor preflight states a minimum sshd version, so on such a server `link` writes the key line, the client record, `known_hosts` and the alias block, and then fails only at the step 4 tunnel check.
PROPOSAL: State that servers need OpenSSH 7.8 or later, and have onboard preflight report an older sshd. Otherwise, name the version as a known limit next to the Unix socket one.

### R-15

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 35 and 37) and the owner decisions paragraph (line 80)
EVIDENCE: The decisions paragraph at line 80 records owner choices only up to R-3 and the module proxy choice. The owner's 2026-11-11 answers to Q1 to Q5 appear only as plain facts in the summary and Design. Those answers are: the Unix socket limit is accepted, no CI step is added, the implementation reviewer runs steps 1 to 7, AC-12 carries residual #77, and OpenSSH 7.8 is a prerequisite with no version check. Line 35 says "The marketplace install (AC-12) is checked after the merge, as residual https://github.com/michielvha/vh-adlc/issues/77" and does not say that the owner decided it. feature-documents.md says "A residual needs the owner's decision" and asks the summary to cover owner decisions. As a result, a reader of the document cannot tell that the residual or the known limit was approved.
PROPOSAL: Add one sentence to the decisions paragraph, and a short clause in the summary, saying that on 2026-11-11 the owner chose these five answers, including the AC-12 residual tracked in #77.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, link step 2 (line 176); Tasks, T36 (line 342)
EVIDENCE: Step 2 removes every existing line for the key, then appends the new line with `permitlisten`. Line 176 says that on a server older than 7.8 "`link` writes the client's files and key line, then fails at the step 4 tunnel check", and no step restores the old line. I ran a local unprivileged sshd (OpenSSH 10.0p2) with an option value the server cannot parse (`permitlisten="none"`). The log showed `bad key options: invalid permission port`, and the key was refused (`Permission denied (publickey...)`). So sshd rejects the whole key when it cannot use a key option. On a pre-7.8 server, then, re-running `link` for a client that already works replaces that client's working line with one sshd rejects, and the desktop app loses its tunnel to that server. The summary and T36 both tell the owner to run `link` again on every server to close TCP remote forwards. The Q5 cost the owner accepted mentioned only a failed new link.
PROPOSAL: State in link step 2 that on a pre-7.8 server a re-link also breaks the client's existing tunnel there. Name the recovery: restore `authorized_keys.bak-paseo-hosts` or unlink. Alternatively, have T36 confirm each server's sshd version before re-linking.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Tasks, T37 (line 343)
EVIDENCE: Line 272 says that only paths under `internal/`, `cmd/`, `scripts/` and `skills/` are in `plugins/paseo-hosts/`, so `README.md` in T37 reads as the repository root README, as it does in T25 (line 322). The root README has no server requirements. The plugin's own list is under `## Requirements` in `plugins/paseo-hosts/README.md:33-37`. Also, `skills/paseo-hosts/SKILL.md` has no requirements list (its headings are Add a server, Take a client or server away, Check and list, Passwords). T37's done condition is "a grep for `7.8` finds it in each", and the file it checks depends on which README the reader picks.
PROPOSAL: Name `plugins/paseo-hosts/README.md` in T37, and say that the skill gains a short server requirements line.

### R-16

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Design, link step 2 (line 176); Context, Owner summary (line 35); Tasks, T36 (line 342)
EVIDENCE: Line 176 says that on a pre-7.8 server, after a re-link breaks a working tunnel, "restoring `authorized_keys.bak-paseo-hosts` or running `unlink` recovers". The summary says the tunnel is "recovered from the key file backup". `internal/link/snippets/authorize.sh:11` runs `cp -p "$f" "$f.bak-paseo-hosts"` on every link, and `internal/remove/snippets/keys.sh:27` does the same on every deletion, so the backup only holds the state from just before the latest run. I ran authorize.sh twice under a scratch HOME on an `authorized_keys` holding lines for clients a and b, first for a and then for b. The backup then held the line that a's run had just written, not a's original line. T36 re-links both desktops on every server one after the other. On a pre-7.8 server, restoring the backup after both runs gets back only the second client's working line, and the first client stays broken. `unlink` deletes the broken line along with the client's app entry and alias block. It does not bring the tunnel back. I confirmed the premise from source: OpenSSH 7.7 `auth-options.c:471-473` fails with "unknown key option", and 7.6 jumps to `bad_option`, so both reject the whole key.
PROPOSAL: Say that the backup covers only the most recent `link` or `unlink` on that server, so the owner must restore it after each re-link, or recover by putting the old line back by hand. Say that `unlink` removes the client and does not restore its tunnel.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (line 29)
EVIDENCE: R-14 F-02 asked that line 29 stop saying the key opens only the daemon tunnel. The text at e937e21 read "a key that opens the daemon tunnel and, apart from the Unix socket limit below, nothing else". The R-15 edit at d70c77e put back "`link` gives a macOS or Windows desktop a tunnel-only key", and the limit now appears only six sentences later, on line 35. My local unprivileged sshd (OpenSSH 10.0p2) used the planned key line `restrict,port-forwarding,permitopen="127.0.0.1:47711",permitlisten="127.0.0.1:1",command="/bin/false"`. With it, `-W` to the daemon port returned `HTTP/1.0 200 OK`. A shell command exited 1, `-W` to another port failed, and both TCP `-R` cases failed with "the request was denied", the daemon-port case after its listener stopped. But `ssh -N -o ExitOnForwardFailure=yes -R <dir>/r.sock:...` stayed up until `timeout` ended it (exit 124) and left `srw------- r.sock`.
PROPOSAL: Put back the R-14 wording on line 29, or add "apart from the Unix socket limit below" after "tunnel-only key".

### R-17

FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Tasks, T35 (line 341); Design, Output and logging and Plugin layout (line 130); Context, Owner summary (line 29); Test Plan, AC-14
EVIDENCE: Design says "Standard error counts as a terminal only when the terminal driver answers for it", and T35 says "the terminal check asks the terminal driver". T35 lists only `cmd/paseo-hosts/cli.go`, `main.go` and `cli_test.go`. At 3178e97, `plugins/paseo-hosts/go.mod` requires only `github.com/coder/websocket` and `github.com/michielvha/logger`, and `main.go:9-12` still uses `info.Mode()&os.ModeCharDevice`. The summary says "The first run downloads two Go libraries", line 130 says "the first build downloads the two dependencies", and the AC-14 row asserts "both dependencies are now in that cache". R-10 F-03 proposed `golang.org/x/term` `IsTerminal`, which is the obvious way to do this. It adds `golang.org/x/term` and `golang.org/x/sys` to go.mod and go.sum, which T35 does not list, and it would make those three statements false. With only the standard library, the check needs a per-OS ioctl (`syscall.TCGETS` on Linux, `syscall.TIOCGETA` on macOS). The document does not choose either way.
PROPOSAL: Say in Design or T35 that the terminal check uses only the standard library. Otherwise, add `go.mod` and `go.sum` to T35 and update the dependency count in the summary, Plugin layout and the AC-14 row.

<br>

I checked the following and found no other issues:
- **R-16's findings are fixed.** The summary now says the key opens "the daemon tunnel and, apart from the Unix socket limit below, nothing else". Link step 2 now says the backup covers only the latest run and that `unlink` does not restore a tunnel.
- **Binary checks:** `lint` passes. `gate planned` fails only on `spec_review_fresh` and `accepted`, which is expected before this review and the owner's acceptance.
- **Local sshd test (OpenSSH 10.0p2) with the planned key line:**
  - `-W` to the daemon port returned 200.
  - These were refused: `-W` to another port, the shell command, TCP `-R` to a free port, TCP `-R` to the daemon port after its listener stopped, remote dynamic `-R`, and a `localhost` name.
  - `-R` to port 1 failed with `Permission denied` at bind.
  - The Unix socket `-R` stayed up, which is the stated known limit.
  - `permitlisten="none"` made sshd reject the whole key.
- **Residual tracker:** issue #77 is open and tracks AC-12.
- **Scratch files:** I put them in `/home/m/code/.r17-scratch` instead of `/tmp` and removed them afterwards. The worktree is unchanged.

### R-18

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Tasks, T36 (line 342); Scope, Out of scope (line 101)
EVIDENCE: T36 says to "run `link` again for both desktops on every server in the registry so every key line carries `permitlisten`". The R-10 record (lines 738 and 739) shows that the registry holds `fedora-43` as well as arch-1. On the operator host, `hostname` prints `fedora-43`, so that entry is the operator host's own daemon. Scope (line 101) excludes it: "Managing the operator host's own Paseo daemon". The operator host's `~/.ssh/authorized_keys` is the default file, since sshd_config sets no AuthorizedKeysFile. It holds 2 lines, and neither has key options or a `paseo` comment: `grep -c "permitopen\|restrict"` printed 0. So fedora-43 has no tunnel-only line for T36 to replace. If someone ran T36 as written, it would add new restricted key lines on the operator host. Through Design, Desktop app entry step 3, it would also replace the existing fedora-43 entry in both desktop apps with a single `paseo-fedora-43` connection and make that the preferred connection. The T27 evidence (line 334) shows both apps use that entry today.
PROPOSAL: Limit T36 to servers whose `authorized_keys` already holds a tunnel-only line written before `permitlisten`, which today means arch-1. State that the operator host's own fedora-43 entry is left alone.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Tasks, T35 (line 341); Design, Output and logging (line 134); Test Plan, AC-11 row (line 260)
EVIDENCE: Design gives macOS its own terminal check through `TIOCGETA`, and T35 adds `cmd/paseo-hosts/term_darwin.go` for it. T35's done condition is `go test -race ./...` and golangci-lint. The `paseo-hosts` CI job (`.github/workflows/ci.yml:132-153`) runs only on `ubuntu-latest` and does no cross build. Nothing in T35, the AC-11 row or CI therefore compiles or lints the darwin file. In Go 1.27.4, `syscall.Syscall` on darwin is a direct kernel trap (`asm_darwin_arm64.s`: `SVC $0x80`) and does not go through libSystem. x/sys v0.49.0 marks its darwin `SYS_*` constants "Deprecated: Use libSystem wrappers instead of direct syscalls". Q6 did not mention either cost. I built a scratch version of the planned files. On Linux it reported `false` for `/dev/null`, a file and a pipe, and `true` under a pty. `GOOS=darwin GOARCH=amd64` and `GOOS=darwin GOARCH=arm64` passed `go vet` and `go build`, and golangci-lint with the plugin's `.golangci.yml` and `GOOS=darwin` reported 0 issues. So the design is feasible, but no stated check would catch a broken macOS file.
PROPOSAL: Add `GOOS=darwin go vet ./cmd/paseo-hosts` to T35's done condition. State in Design that the macOS check is a direct syscall that only a cross build covers.

### R-19

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Design, Output and logging (line 136); Tasks, T35 (line 341)
EVIDENCE: Line 136 says "The macOS check is a direct system call, and only a cross build on the operator host covers it, because CI runs on Linux." A Linux runner can run a cross build with `GOOS=darwin go vet`, so the Linux runner does not stop CI from checking the darwin file. CI also has a macOS runner: `.github/workflows/ci.yml:54-55` defines `checker-macos` with `runs-on: macos-latest`. The actual gap is that the `paseo-hosts` job (`ci.yml:132-155`, `runs-on: ubuntu-latest`) runs `go build`, `go test -race`, `go vet`, golangci-lint and `go mod tidy -diff` with no `GOOS=darwin` step. The T35 check `GOOS=darwin go vet ./cmd/paseo-hosts` runs once, so a later change that breaks `term_darwin.go` would pass CI. Q2 covered only the real-sshd test step. The owner has not decided whether CI should cross build. R-18 F-02 is otherwise resolved: T35 now includes the darwin vet, and T36 is limited to arch-1 and leaves fedora-43 alone. I ran the planned key line `restrict,port-forwarding,permitopen="127.0.0.1:47811",permitlisten="127.0.0.1:1",command="/bin/false"` against a local unprivileged sshd (OpenSSH 10.0p2). `-W` to the daemon port returned `HTTP/1.0 200 OK`. `-W` to another port and a shell command failed. TCP `-R` to a free port was denied, and TCP `-R` to the daemon port was denied after its listener stopped. A Unix socket `-R` stayed up until `timeout` ended it (exit 124) and left `srw-------`, which is the stated known limit. `vh-adlc lint` passes, and `gate planned` fails only on `spec_review_fresh` and `accepted`.
PROPOSAL: Say instead that the `paseo-hosts` CI job does no cross build, so only T35's one-time `GOOS=darwin go vet` checks the macOS file. Alternatively, add that command to the job's module check step in `ci.yml`.

### R-20

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Tasks, T37 (line 343); Design, link step 2 (line 176); Context, decisions paragraph (line 80)
EVIDENCE: `plugins/paseo-hosts/README.md:54` is in `covers`. It says "`link` gives the client a dedicated key that the server accepts only for a forward to the daemon port". Design link step 2 says the opposite: "No key option stops a Unix socket remote forward (`ssh -R <path>:...`), so the key can still create a socket at an unused path the server user can write". It also says lines written before `permitlisten` keep allowing TCP remote forwards until `link` runs again. Line 80 records that the owner chose to keep the Unix socket remote forward as "a stated known limit". Only the feature document states that limit. The plugin's README, SKILL.md and `--help` never mention it. T37 is the only unchecked task that edits the README, and it adds only the OpenSSH 7.8 requirement, so after every task is ticked the README still makes the false claim. I tested the planned key line `restrict,port-forwarding,permitopen="127.0.0.1:47911",permitlisten="127.0.0.1:1",command="/bin/false"` against a local unprivileged sshd (OpenSSH 10.0p2). `ssh -N -o ExitOnForwardFailure=yes -R <dir>/r.sock:127.0.0.1:47911` stayed connected until `timeout` ended it (exit 124) and left `srw------- r.sock`. The TCP `-R 127.0.0.1:47944:...` case failed with "remote port forwarding failed", and a shell command exited 1. R-19's finding is resolved: line 134 now says the `paseo-hosts` CI job does no cross build, so only T35's one-time `GOOS=darwin go vet` checks the macOS file, and `.github/workflows/ci.yml:132-153` confirms there is no cross build. A `-L` forward to a Unix socket was refused (`Received request to connect to path ..., but the request was denied`), because `channel_connect_to_path` checks the permitopen list in both 7.8p1 and 10.0p2. `vh-adlc lint` passes. `gate planned` fails only on `spec_review_fresh` and `accepted`.
PROPOSAL: Extend T37 to correct README line 54 and state the Unix socket remote forward limit in the README, and say there that key lines from before `permitlisten` stay open until `link` runs again. The done condition would grep for both changes.

### R-21

NO FINDINGS

### R-22

CRITERION: AC-01 After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` in plugins/paseo-hosts with pwsh on PATH at 75f1330 passes, including `internal/onboard`. Live on arch-1: `paseo-hosts onboard arch-1` exited 0 on the onboarded server, and again after `remove` as a fresh install that created a new password. Each time `systemctl --user` reported paseo.service enabled and active, running @getpaseo/cli 0.14.0. `ss` showed only 127.0.0.1:6767. config.json had `relay.enabled:false` and `auth.password` as a 60-character `$2b$` hash. The tailnet Serve config had 26 routes and none to 6767. Two scans of /home/sysadmin, /etc, /tmp, /var/tmp and /root, plus the user journal and `ps`, used a pattern file read from stdin and found no plaintext password. A positive control was found. On the operator host, `grep -F` over ~/.config, ~/.cache/paseo-hosts and /tmp found only ~/.config/paseo-hosts/arch-1.password, mode 600 in a mode 700 directory. Limitations: the operator scan did not cover all of $HOME.

CRITERION: AC-02 `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including `TestVerificationFailsWhenTheDaemonAcceptsNoPassword` and `TestPublishAddsOneRouteAndARerunRemovesIt`. Live: onboard reported `password required` and `stored password accepted`. Independently, the pinned paseo CLI over `ssh://arch-1?daemonPort=6767` returned `AUTH_REQUIRED` without PASEO_PASSWORD and returned serverId `srv_9XVgOi1SYKtK` with it. `onboard arch-1 --publish --json` exited 0 with exposure `tailnet`. Serve then had exactly one route, `arch-1.tail6948f.ts.net:8956/ -> http://127.0.0.1:6767`, with AllowFunnel empty. `curl https://arch-1.tail6948f.ts.net:8956/api/health` returned 200. A second `--publish` still left one route. Limitations: none.

CRITERION: AC-03 Running `onboard` again on an onboarded server, including one whose registry the local tool wrote with port 6867, keeps its password, daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, leaves one unit and at most one route, and passes verification. A `--listen-port` that differs from the recorded port exits 2 and changes nothing.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including `TestRerunKeepsALocalToolRegistry`, which covers the port 6867 case. Live on arch-1: two re-runs of `onboard` kept the password file's sha256 prefix and mtime, port 6767, `PASEO_CLIENTS=macbook-pro,win-main`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. They left one paseo.service unit file and reported `password_created:false`. After `--publish`, a plain `onboard` removed the route and returned to `PASEO_PUBLISHED=no`, with 26 routes and port 8956 refusing connections. `onboard arch-1 --listen-port 6868` exited 2. The env checksum and the daemon's ExecMainPID were unchanged. Limitations: the port 6867 local-tool case was observed only in the Go test, because fedora-43 is the operator host's own daemon and was left alone.

CRITERION: AC-04 After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command, a forward to any other port and every TCP remote forward when the server user cannot bind port 1. The client trusts the server's host key under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes. `go test -v -run TestKeyLineAgainstRealSSHD ./internal/link` printed PASS, not SKIP, with /usr/bin/sshd present. Live: `link arch-1` exited 0 for macbook-pro and win-main. arch-1 holds exactly one `restrict,port-forwarding,permitopen="127.0.0.1:6767",permitlisten="127.0.0.1:1",command="/bin/false"` line per client, after several links each.

From the Mac, using the paseo-arch-1 alias with the dedicated key:
- A shell command exited 1.
- `-W 127.0.0.1:22` and `-L` to port 22 got `administratively prohibited`.
- `-W 127.0.0.1:6767` returned `HTTP/1.1 200 OK` from /api/health.
- `-R 127.0.0.1:47123:127.0.0.1:6767` and `-R 127.0.0.1:6767:127.0.0.1:6767` both exited 255 with `remote port forwarding failed`.

From win-main:
- A shell command exited 1.
- `-L` to port 22 got `administratively prohibited`.
- `-L` to 6767 returned `HTTP/1.1 200 OK`.
- `-R 127.0.0.1:47123:...` exited 255 with `port forwarding refused` and `remote port forwarding failed`, and arch-1 showed nothing listening on 47123.

Both clients have one `# BEGIN paseo-hosts paseo-arch-1` block with `StrictHostKeyChecking yes`, and a `known_hosts` ssh-ed25519 entry for arch-1.tail6948f.ts.net on port 22. Limitations: with redirected stdout, Windows ssh -R hung rather than exiting, a client-side pipe behaviour; rerun without stdout redirection, it failed as above.

CRITERION: AC-05 After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including `internal/clientapp`. Live, I read `@paseo:daemon-registry` from each app's localStorage leveldb log, printing passwords only as truncated sha256 hashes.

After `link`, the Mac app listed:
- fedora-43, kept from before.
- arch-1 with `{"host":"paseo-arch-1","id":"ssh:paseo-arch-1::","type":"remoteSsh"}` as the preferred connection, and a password hash equal to the operator's stored password (bf0fb9c1ff21, and 8a48925dc6ef after the final re-onboard).

After `link`, the Windows app listed win-main and fedora-43, both kept, and arch-1 in the same form with the matching password hash.

Processes:
- The Mac app ran as user michielvh with child `ssh ... -W 127.0.0.1:6767 paseo-arch-1`.
- The Windows Paseo.exe processes ran in console session 1 owned by WIN-MAIN\mike with the same tunnel. A scheduled task in session 1 found the app's main window responding.
- No process on either client had `--remote-debugging-port`. The remaining app listeners answered 401, not DevTools.

Limitations: after the final re-link, the Windows host list had been compacted out of the leveldb log. For that run, presence rests on the tunnel process and on the daemon logging `Client connected via hello` from two 0.15.3 app clients.

CRITERION: AC-06 When the app does not keep the new entry, `link` exits non-zero, the app's previous host list is restored, and the app runs again without a debugging port.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including `TestRejectedEntryIsRolledBack`. Live: I built a binary with `go build -tags paseotest` at 75f1330 and ran it with `PASEO_HOSTS_TEST_REJECT_ENTRY=1 link arch-1`. It exited 1 with `the app on macbook-pro did not keep the change; its previous host list is restored`, and the same message for win-main. 20 seconds later each app was running again: Windows in session 1 with its window on the desktop. Each had its arch-1 tunnel and no `--remote-debugging-port` process, and its leveldb host list matched the list before the run (2 hosts on the Mac, 3 on Windows, same password hashes). Limitations: none.

CRITERION: AC-07 After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, the registry files and password are gone, and no app backup in `PASEO_HOSTS_DIR` holds the server's entry. The rest of the server's Paseo state and workspace remain unless `--purge` was given. When the server has a tunnel-only key line that belongs to no client `remove` will unlink, `remove` without a `--client` for it or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line; `unlink --server-only` removes that client's key line and registry record without contacting it, after which `remove` completes; for a recorded client with no key line it drops the client, and for an unrecorded client whose key line has no `paseo-hosts:<client>` comment it exits 1 and changes nothing. With the server unreachable, `remove --skip-server` removes the app entry and alias block of every recorded client it can reach, drops and reports any client it cannot reach, which keeps its entry and block, and deletes the registry files, and with no client recorded or named it exits 3 unless `--no-clients` is given. Other servers and hosts in the apps are unchanged.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including the `internal/remove` tests: TestRemoveTwoClients (with and without --purge), TestRemoveFailurePartWayThenRerun, TestUnlinkOneClientAndBackups, TestUnlinkServerOnly, TestRemoveSkipServer, TestRemoveSkipServerNeedsClientsOrNoClients, TestRemoveStopsAtAnUnreachableClient and TestRemoveLocalToolLink.

Live, `unlink arch-1 --client win-main` exited 0. Afterwards:
- The Windows app list held win-main and fedora-43 only.
- win-main had no paseo-arch-1 block.
- arch-1 kept only the macbook-pro line.
- `PASEO_CLIENTS=macbook-pro`.

Then `remove arch-1` exited 0. Afterwards:
- The Mac app held only fedora-43, with no tunnel and no alias block.
- arch-1 had no permitopen line, paseo.service was not-found, nothing listened on 6767, and no Serve route pointed at the daemon.
- runtime and state/config.json were gone, while the rest of state and workspace remained.
- arch-1.env and arch-1.password were gone, and no `*backup.json` in `PASEO_HOSTS_DIR` mentioned `paseo-arch-1` or `srv_9XVgOi1SYKtK`.
- fedora-43 files and app entries were unchanged.

Limitations: the exit 3, `--server-only`, `--skip-server` and `--purge` cases were observed only in the Go tests.

CRITERION: AC-08 The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including `TestOnlyTheDocumentedVariables` and `TestMissingNpmStopsBeforeAnyChange`. I ran `PASEO_HOSTS_FORBIDDEN_NAMES="fedora-43,arch-1,macbook-pro,win-main,tail6948f,sysadmin,michielvh/,/home/m/,WIN-MAIN\mike" go test -run TestNoForbiddenNames -v ./cmd/paseo-hosts` and it passed. `grep -rniwE "mike|fedora|arch|macbook|michielvh|ts\.net"` over plugins/paseo-hosts found only the `build-1.example.ts.net` fixture. Live: `env -u PASEO_HOSTS_CLIENT paseo-hosts link arch-1 --json` exited 3 with `no client alias: pass --client or set PASEO_HOSTS_CLIENT`. Limitations: none.

CRITERION: AC-09 Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`. `status <alias>` prints every field listed under link, in human output and under those keys in `--json`. A registry line that is not `KEY=value` is rejected without being executed.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including `TestLocalToolRegistry`, which runs every command against a local-tool fixture and checks the status keys, and `internal/registry` `TestRejectsNonAssignmentLines`. Live: `status arch-1` printed alias, ssh, exposure, daemon port, url, both clients with their Remote SSH value, and agents. `status arch-1 --json` had keys `alias`, `ssh`, `exposure`, `daemon_port`, `url`, `clients` (each with `name` and `remote_ssh`) and `agents`. `list --json` returned `alias`, `ssh` and `url` for arch-1 and for the local-tool registry fedora-43. Limitations: the local-tool format with link, unlink and remove was observed only in the Go test.

CRITERION: AC-10 No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including `assertNoPassword` in `cmd/paseo-hosts` over every stand-in argument list, both streams and the `LOG_LEVEL=debug` log, and the clientapp argument and output checks. Live, the scratch directory held every stdout and stderr capture from steps 1 to 7, from the restore runs, and from `LOG_LEVEL=debug verify` and `status`. A pattern-file `grep -F` over it, ~/.config/paseo-hosts and /tmp found only arch-1.password. arch-1 `ps` and user-journal scans found no hits. Limitations: process lists were sampled, not traced continuously.

CRITERION: AC-11 Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command, `--help` included, with the documented fields, and the exit code matches the documented meaning.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including the reporter tests and `cmd/paseo-hosts/cli_test.go`. GOOS linux, darwin and windows `go vet` and golangci-lint (also for darwin) report 0 issues.

Live on Linux, with stderr on a python pty:
- `verify arch-1` printed green `✓` lines, with ESC sequences when NO_COLOR was unset or empty.
- NO_COLOR=0 or 1 removed all ESC sequences.
- `--plain` printed `OK Passed:`.
- With stderr redirected to a file, there were no ESC bytes.

JSON and exit codes:
- `--help --json` printed one line holding one object with `command: help` and `data.usage`.
- `link --help --json` printed one object.
- An unknown command exited 2.
- A missing client and a missing registry entry each exited 3, with a `config` result object.

On macOS, a darwin/arm64 build run with stderr on a real pty (`ssh -tt`) printed coloured `✗` lines, and the same command piped through `cat` printed none.

Limitations: the Mac test binary's pseudo-terminal case fails (F-01), a test defect that does not affect real terminal detection.

CRITERION: AC-12 The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
VERDICT: not verified
EVIDENCE: The Test Plan's AC-12 manual procedure (install from both catalogs, then a new session) was not run in this review, because the catalogs point at the default branch and the plugin is not merged. The document carries `Residual: https://github.com/michielvha/vh-adlc/issues/77`. I read SKILL.md, which triggers on adding a server, runs `onboard` then `link` with `--json`, and forbids printing passwords. Limitations: no install or agent session was observed.

CRITERION: AC-13 The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
VERDICT: met
EVIDENCE: I compared these at 75f1330 with the Design Terms table:
- plugins/paseo-hosts/README.md repeats the Terms table word for word.
- SKILL.md defines server, client, registry, onboard, link, unlink and remove with the same meanings and points to the README.
- `paseo-hosts --help` defines server, client, registry, SSH-only and published, and describes each command with the Terms wording.
- The marketplace rows (.claude-plugin and .agents catalogs, docs/reference/marketplace.md, README.md) describe it as onboarding Linux servers as SSH-only Paseo daemons and linking the Paseo desktop app on Macs and Windows PCs.

No term is used with another meaning. Limitations: the help text's server and client definitions omit "from the operator host", which narrows nothing.

CRITERION: AC-14 The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.
VERDICT: met
EVIDENCE: `bun test tests/paseo-hosts` at 75f1330 passed with 1 pass and 5 expect() calls. The test copies the plugin to a temporary directory, runs `scripts/paseo-hosts.sh --help` with an empty GOMODCACHE and with GOPROXY, GOSUMDB and GOFLAGS unset, and finds both required module zips in that cache. The wrapper builds with `-mod=readonly`, so downloads are checked against the committed go.sum. Limitations: none.

CRITERION: AC-15 `link --no-app` sets up the key, host key and alias block as `link` does, records the client, changes neither the desktop app nor the clipboard and prints no password; a later `link` without `--no-app` adds the app entry, and `unlink` of a client without the app removes its block and key line.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 75f1330 passes, including the `internal/link` `--no-app` cases. They check that no `open`, `osascript`, `pgrep`, `pkill` or `pbcopy` call is made and that the app step is not reached. Also included are `TestUnlinkOneClientAndBackups` (unlink of a client without the app) and `cmd/paseo-hosts` `TestOnlyTheDocumentedVariables` (`link --no-app` then `unlink`, with the password in no stream). Limitations: not run live.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Tasks, T35 (`plugins/paseo-hosts/cmd/paseo-hosts/cli_test.go`)
EVIDENCE: `GOOS=darwin GOARCH=arm64 go test -c ./cmd/paseo-hosts`, run on macbook-pro with `-test.run TestOnlyATerminalCountsAsATerminal`, fails with `cli_test.go:78: a pseudo-terminal does not count as a terminal`. On macOS, a /dev/ptmx master that has not been granted and unlocked does not answer TIOCGETA. The same darwin build of `paseo-hosts` colours its output on a real `ssh -tt` terminal, so only the test is wrong. The README tells developers to run `go test -race ./...`, and on a Mac operator host that run fails. CI does not catch it because it runs only on Linux.
PROPOSAL: On darwin, test the slave side of the pty (after TIOCPTYGRANT and TIOCPTYUNLK, opening the TIOCPTYGNAME path), or skip the pseudo-terminal case there with a message. Then run the test once on macOS.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: The summary still describes the remote-forward fix as future work: "`--help --json` will print one JSON object, and colour will need a real terminal", "Planned checks: ...", "The next implementation reviewer will run manual steps 1 to 7". Meanwhile T33 to T37 are ticked and AC-04 to AC-06, AC-08 to AC-11, AC-14 and AC-15 carry evidence lines.
PROPOSAL: Refresh the summary so it states which checks have now been observed, including this review's live run and the new arch-1 password, and keeps only the remaining work as planned.

### R-23

CRITERION: AC-01 After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at d4155d6 (GOTOOLCHAIN=local, go1.27.4, pwsh on PATH) passes in every package. Live step 1: `paseo-hosts onboard arch-1 --json` exited 0. Over ssh arch-1, paseo.service was enabled and active as a single user unit, with ExecStart from the pinned 0.14.0 runtime. Port 6767 listened only on 127.0.0.1. state/config.json had relay enabled false, listen 127.0.0.1:6767 and a 60 character $2b$ hash. Tailscale Serve had 26 routes and none pointed to 6767. On the operator host, arch-1.password is mode 600 in ~/.config/paseo-hosts. The final re-onboard after remove (password_created true) passed the same checks. I compared passwords only by checksum.

CRITERION: AC-02 `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
VERDICT: met
EVIDENCE: Go tests pass, including the onboard test where a stand-in daemon that accepts a connection without a password fails verification. Live: I ran the pinned runtime paseo CLI against ssh://arch-1?daemonPort=6767. Without a password it returned AUTH_REQUIRED (exit 1). With the stored password it returned exit 0 and serverId srv_9XVgOi1SYKtK. `onboard arch-1 --publish --json` exited 0 with exposure tailnet and url wss://arch-1.tail6948f.ts.net:8956. Serve had exactly one route to http://127.0.0.1:6767 and no AllowFunnel. Health returned 200. `verify arch-1` printed "password required" and "stored password accepted", exit 0.

CRITERION: AC-03 Running `onboard` again on an onboarded server, including one whose registry the local tool wrote with port 6867, keeps its password, daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, leaves one unit and at most one route, and passes verification. A `--listen-port` that differs from the recorded port exits 2 and changes nothing.
VERDICT: met
EVIDENCE: Go tests pass, including the onboard re-run on a local-tool registry at port 6867. Live step 2: a second `onboard arch-1` exited 0. The password file sha256 prefix and its mtime were unchanged. The env kept port 6767, PASEO_CLIENTS=macbook-pro,win-main, the client host arch-1.tail6948f.ts.net and port 22. There was still one unit. After `--publish`, a plain `onboard` removed the route: 26 routes, none to 6767, and health stopped answering. `onboard arch-1 --listen-port 6868` exited 2 with "already runs on port 6767 ... refused". The env checksum and the daemon MainPID 300898 were unchanged.

CRITERION: AC-04 After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command, a forward to any other port and every TCP remote forward when the server user cannot bind port 1. The client trusts the server's host key under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
VERDICT: met
EVIDENCE: Go tests pass. TestKeyLineAgainstRealSSHD ran with -v and printed PASS against /usr/bin/sshd. Live, from macbook-pro with the paseo-arch-1 alias (arch-1 runs OpenSSH 10.2p1):
- A shell command exited 1 with no output.
- `-W 127.0.0.1:22` and `-L` to 22 got "administratively prohibited".
- `-W 127.0.0.1:6767` returned HTTP/1.1 200.
- `-R 127.0.0.1:47123:127.0.0.1:6767` and `-R 127.0.0.1:6767:...` failed with "remote port forwarding failed", and nothing listened on 47123.

Live, from win-main:
- The shell command exited 1 with no output.
- `-L` to 22 gave "open failed: administratively prohibited".
- `-L` to 6767 returned HTTP 200.
- Both `-R` forms failed with "remote port forwarding failed".

Each alias block has HostName arch-1.tail6948f.ts.net, Port 22 and StrictHostKeyChecking yes, and BatchMode connections succeeded. After repeated links, arch-1 held one paseo-hosts key line per client, and each client had one paseo-arch-1 block.

CRITERION: AC-05 After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server.
VERDICT: not met
EVIDENCE: Executed evidence contradicts this.
- On win-main at 15:51, `paseo-hosts link arch-1 --client win-main --json` exited 0 and reported that the app lists arch-1 and opened its tunnel. About 25 s later, no Paseo.exe ran on win-main at all.
- The app log shows that link's quit at 15:51:39 triggered "quitAndInstall requested { isSilent: true, isForceRunAfter: false }" for 0.15.4. The relaunched 0.15.3 instance logged last at 15:51:46. The installer rewrote the install directory at 15:52:04, so the app was left stopped. I relaunched it by hand.
- On macbook-pro, link exited 1 twice ("did not answer over DevTools") while a pending 0.15.4 update installed on the first quit. The third run succeeded.

When link succeeded and the app stayed up, the subset held:
- Mac: fedora-43 plus arch-1 with ssh:paseo-arch-1:: and a password hash equal to the operator file's.
- Windows: win-main, fedora-43 and arch-1, parsed from the app's leveldb.
- Both had a `-W 127.0.0.1:6767 paseo-arch-1` tunnel and no `--remote-debugging-port`. The Windows app ran in session 1, and no Paseo socket listened on the Mac.
- The final re-links at 15:58 held on both clients.

CRITERION: AC-06 When the app does not keep the new entry, `link` exits non-zero, the app's previous host list is restored, and the app runs again without a debugging port.
VERDICT: not met
EVIDENCE: The paseotest build has PASEO_HOSTS_TEST_REJECT_ENTRY once; the release build has it 0 times. The clientapp tests with `-tags paseotest` pass.

On win-main, `PASEO_HOSTS_TEST_REJECT_ENTRY=1 paseo-hosts-test link arch-1 --client win-main` held:
- It exited 1 with "did not keep the change; its previous host list is restored".
- The leveldb showed win-main, fedora-43 and arch-1 restored.
- The tunnel was running, with no debugging port.

On macbook-pro the same command contradicts the criterion, twice (15:40 and 15:46):
- It exited 1 with "the Paseo app window did not answer over DevTools".
- The CLI wrote the entry, the app dropped the whole @paseo:daemon-registry key on reload, and the debug instance then vanished.
- write() returned at clientapp.go:275 without restoring. The app relaunched with no hosts at all: fedora-43 and arch-1 were lost and there was no tunnel.
- I restored the list by hand from app-registry-macbook-pro.backup.json both times.

CRITERION: AC-07 After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, the registry files and password are gone, and no app backup in `PASEO_HOSTS_DIR` holds the server's entry. The rest of the server's Paseo state and workspace remain unless `--purge` was given. When the server has a tunnel-only key line that belongs to no client `remove` will unlink, `remove` without a `--client` for it or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line; `unlink --server-only` removes that client's key line and registry record without contacting it, after which `remove` completes; for a recorded client with no key line it drops the client, and for an unrecorded client whose key line has no `paseo-hosts:<client>` comment it exits 1 and changes nothing. With the server unreachable, `remove --skip-server` removes the app entry and alias block of every recorded client it can reach, drops and reports any client it cannot reach, which keeps its entry and block, and deletes the registry files, and with no client recorded or named it exits 3 unless `--no-clients` is given. Other servers and hosts in the apps are unchanged.
VERDICT: met
EVIDENCE: Go tests pass in internal/remove. They cover --skip-server, --server-only, the exit 3 and exit 1 cases, the local-tool backup and purge.

Live step 7, `unlink arch-1 --client win-main --json` (exit 0):
- The win-main app lists win-main and fedora-43 only, and its arch-1 tunnel stopped.
- The paseo-arch-1 block count on win-main is 0.
- arch-1 kept only the macbook-pro key line, and PASEO_CLIENTS=macbook-pro.

`remove arch-1 --json` (exit 0), on arch-1:
- The Mac app lists fedora-43 only, and the Mac has 0 paseo-arch-1 blocks.
- authorized_keys has 0 permit lines.
- "Unit paseo.service could not be found", nothing listens on 6767, and Serve has 0 routes to 6767.
- runtime and state/config.json are gone, while agents, daemon-keypair.json, server-id, logs and workspace remain.

On the operator host:
- arch-1.env and arch-1.password are gone.
- No file in ~/.config/paseo-hosts mentions paseo-arch-1 or srv_9XVgOi1SYKtK.
- The fedora-43 daemon pid 97242 is unchanged.

CRITERION: AC-08 The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
VERDICT: met
EVIDENCE: Go tests pass, including the cmd/paseo-hosts documented-variables test. TestNoForbiddenNames skipped because its variable was unset; step 8 was not required of this review. Live, `env -u PASEO_HOSTS_CLIENT paseo-hosts link arch-1` exited 3 with "no client alias: pass --client or set PASEO_HOSTS_CLIENT". A grep of plugins/paseo-hosts and tests/paseo-hosts for fedora-43, arch-1, tail6948f, sysadmin, macbook-pro, win-main, /home/m/ and /Users/michielvh found 0 files. The only other match, michielvh, is the GitHub module path.

CRITERION: AC-09 Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`. `status <alias>` prints every field listed under link, in human output and under those keys in `--json`. A registry line that is not `KEY=value` is rejected without being executed.
VERDICT: met
EVIDENCE: Go tests pass, including the internal/registry parser and command-substitution rejection tests and the cmd/paseo-hosts local-tool fixture tests across verify, status, list, link, unlink and remove. Live, `status arch-1 --json` exited 0 with data keys agents, alias, clients, daemon_port, exposure, ssh and url. `list --json` and `verify arch-1` exited 0. The live registry was the plugin's own, not a local-tool fixture.

CRITERION: AC-10 No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
VERDICT: met
EVIDENCE: Go tests pass, including the cmd/paseo-hosts password-leak test over stand-in argument lists, the debug log and both streams. Live, `grep -cF -f arch-1.password` over every captured stdout and stderr of onboard, link, unlink, remove, status, verify and the rollback runs found 0 matches. The client tunnel processes' command lines (`ssh -T ... -W 127.0.0.1:6767 paseo-arch-1`) carry no secret.

CRITERION: AC-11 Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command, `--help` included, with the documented fields, and the exit code matches the documented meaning.
VERDICT: met
EVIDENCE: Go tests pass, including the reporter tests and cli_test.go. A darwin/arm64 cli.test built at d4155d6 and run on macbook-pro under zsh -lc passed, including TestOnlyATerminalCountsAsATerminal; T38 fixes R-22 F-01. golangci-lint reported 0 issues for linux and darwin, and go vet passed for linux, darwin and windows. Live, the `--json` runs put one object with schema_version, command, result and data on stdout and labelled lines on stderr. The exit codes were 0, 1, 2 and 3 as documented.

CRITERION: AC-12 The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
VERDICT: not verified
EVIDENCE: The manual marketplace install in Codex and Claude can run only after the merge, so I did not observe it. The marketplace rows in .agents/plugins/marketplace.json and .claude-plugin/marketplace.json exist, and the residual is tracked in issue #77.

CRITERION: AC-13 The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
VERDICT: met
EVIDENCE: The plugin README Terms table matches the document's Terms table row for row. The SKILL.md server and client definitions match. `paseo-hosts --help` describes onboard, link, unlink and remove with the Terms wording and defines Server, Client, Registry, SSH-only and Published to match. Both marketplace rows say "Onboard Linux servers as SSH-only Paseo daemons and link the Paseo desktop app on Macs and Windows PCs to them".

CRITERION: AC-14 The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.
VERDICT: met
EVIDENCE: `bun test tests/paseo-hosts` from the repo root at d4155d6 gave 1 pass and 5 expects. It copies the plugin outside the repo, uses an empty GOMODCACHE, unsets GOPROXY, GOSUMDB and GOFLAGS, and the wrapper builds with -mod=readonly. `go mod tidy -diff` was clean.

CRITERION: AC-15 `link --no-app` sets up the key, host key and alias block as `link` does, records the client, changes neither the desktop app nor the clipboard and prints no password; a later `link` without `--no-app` adds the app entry, and `unlink` of a client without the app removes its block and key line.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` passes, including the internal/link --no-app tests: no clipboard or app command, the password absent from every stream, a later link adding the entry, and unlink skipping the app step. I did not exercise --no-app live.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: plugins/paseo-hosts/internal/clientapp/clientapp.go:275 (App.write)
EVIDENCE: After setItem and Page.reload, write() calls findPage again. When that fails, it returns the error with no restore attempt, and the message does not say the host list is unrestored. On macbook-pro (Paseo 0.15.4), the paseotest rollback runs at 15:40 and 15:46 both exited 1 with "the Paseo app window did not answer over DevTools". The app had dropped @paseo:daemon-registry and relaunched with no hosts: fedora-43 and arch-1 were both lost and there was no tunnel. The fake DevTools endpoint in the tests never loses the page after a reload, so the tests pass.
PROPOSAL: When the page is unreachable after the reload, relaunch with a debugging port again and restore the backed-up registry before the final relaunch. If that also fails, exit 1 with a message naming the backup file. Add a fake DevTools case where the page disappears after reload.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: plugins/paseo-hosts/internal/clientapp/clientapp.go session(); snippets/stop.sh, launch.sh, launch.ps1
EVIDENCE: Quitting the app with a downloaded update pending runs electron-updater quitAndInstall (isSilent true, isForceRunAfter false), and the tool's next launch races the installer.
- On win-main, link exited 0 at 15:51. The installer then rewrote the install directory at 15:52:04 and left no Paseo.exe running.
- On macbook-pro, two links exited 1 because ShipIt replaced the bundle at 15:36:51.9 under a debug instance started at 15:36:51.1.
PROPOSAL: Before the debug launch, wait for a pending update install to finish. Check, after the final relaunch, that the app is still running with its tunnel, and fail otherwise. Document the update interaction in the README.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: plugins/paseo-hosts/internal/clientapp/snippets/launch.sh, stop.sh
EVIDENCE: On macOS, launch.sh runs `open -a ... --remote-debugging-port` as soon as stop.sh sees the main process gone. With no update pending (app already 0.15.4), the debug instance died right after the reload in both rollback runs. My own CDP script reproduced this with an immediate relaunch at 15:50, while a 3 s delay before the debug launch worked every time.
PROPOSAL: After the quit, wait a short settle time on macOS before the debug launch. Retry the launch and findPage once when the page disappears, and keep F-01's restore on that path.

### R-24

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Skill; Context, Owner summary; Tasks, T43
EVIDENCE: Design Skill (line 226) still has the skill say "the desktop app will restart twice". plugins/paseo-hosts/README.md:64 says the app "quits and starts again twice", and skills/paseo-hosts/SKILL.md:23 says "will quit and restart twice". The Owner summary (line 31) says "two or three times". The revised Design restarts the app more often than either count. Step 5 adds a debug launch after every rollback and may "repeat this step once". Line 198 adds up to two more quit and debug-launch cycles when the window is lost. Step 2 allows up to three launches. T43 changes the README and SKILL.md only for the update wait and the backup file, so after T39 to T44 both files will still say "twice".
PROPOSAL: Give one restart count in the Design Skill section and the Owner summary that matches the revised session, for example "at least twice, and more after a rollback or a lost window". Add the README and SKILL.md wording to T43's done condition.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-06; Design, Desktop app entry
EVIDENCE: AC-06 says that after the app's next start it "lists exactly the hosts it listed before ... also when its window stops answering after a reload". It sets no limit on how many times the window can stop answering. The Design bounds that recovery: "It does this at most twice in one command" (line 198), launches stop after three attempts, and step 5 ends with "If the CLI still cannot confirm the previous host list, it exits 1 and names `PASEO_HOSTS_DIR/app-registry-<client>.backup.json`". On that path the app does not list its previous hosts. The Test Plan already tests the path ("make every restore fail ... the last a message naming the backup file"), but no criterion states it. The Design also never says that a third lost window, or a run out of launches during a restore or the check after a rollback, leads to that same exit naming the backup file. R-23 F-01 was exactly an unrestored path that did not say the list was lost.
PROPOSAL: Bound AC-06 to the cases the Design recovers from, such as a window lost once and a restored list deleted once. Add an observable end state for every other path: `link`, `unlink` or a rollback exits 1 naming the backup file, and that file holds the previous list. State in the Design that every path that ends without a confirmed restore reaches that exit.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-05; Test Plan, AC-05 and AC-06 row and manual procedure
EVIDENCE: AC-05 requires the tunnel to be open "also when the app installs a downloaded update as it quits". The only planned executed check is a `stop.sh` test whose stand-in `pgrep` reads processes from the fake app's `/ps` handler (internal/testenv/standins.go:1037, internal/clientapp/fakedevtools_test.go:184). Real ShipIt is never observed. "The Windows installer wait is checked live only", but "An app update cannot be made pending on demand, so the live run records whether one was pending." The Windows check that the app is still running after the final launch also has no unit test, because pwsh on Linux lacks Get-CimInstance, and no manual step covers it. R-23's Windows failure was on exactly this path. The Windows half of this composite criterion may therefore have no executed evidence at review time. The claim that an update cannot be made pending is also unsupported: R-23 observed a 0.15.3 app with 0.15.4 pending, and the Background shows that older installers are published.
PROPOSAL: Add a manual step that makes the update path observable on each desktop. One option is to run a long-lived stand-in process from `%LOCALAPPDATA%\@getpaseodesktop-updater\` on Windows, and one whose arguments contain `sh.paseo.desktop.ShipIt` on the Mac, during `link`, then record that the CLI waits and then starts the app. Another is to install the previous release so an update becomes pending. Also add a step that checks the Windows app still runs some time after `link` exits.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Tasks, T41 and T42
EVIDENCE: The stand-in `pgrep` and `pkill` only see the process list that `fakeApp.handlePS` serves in internal/clientapp/fakedevtools_test.go:184-202. That list holds only the app's main process and its tunnels. The stand-in ShipIt processes in T41 and the stand-in app in T42 that "exits right after its final launch" both need changes to fakedevtools_test.go, which neither task lists. T42 also requires that "every command fails when that process is gone at the end". On Windows that check needs a PowerShell snippet: launch.ps1 starts the app and tunnel.ps1 looks only for ssh.exe. T42 lists only `launch.sh`, so the Windows half of the R-23 Windows failure has no file and no done condition.
PROPOSAL: Add `internal/clientapp/fakedevtools_test.go` to T41 and T42. Name the Windows snippet that checks the main process in T42, with a done condition such as passing the PowerShell syntax test plus the live check from F-03.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, AC-05 and AC-06 row; Tasks, T39 and T40; Design, step 5
EVIDENCE: T40 implements "a rollback is confirmed after a restart". None of the four T39 cases has a restore that reads back correctly in the session but is missing after the restart, so the "restore it and repeat this step once" branch has no test that fails first. The fake app already loses uncommitted writes on a kill (fakedevtools_test.go:163-167), so such a case is feasible. Step 5 also says "Close the forward" before the debug launch that follows a rollback. That launch needs a forward to read the registry, and the Design does not say one is opened again.
PROPOSAL: Add a T39 case where the restored value holds in the session but is gone after the restart, and assert that the CLI restores it and checks again. In step 5, say that the debug launch after a rollback opens a new forward.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: Line 33 says "review R-23 found the app session unreliable on Paseo 0.15.4. On Windows, an update installed on quit left the app stopped". R-23 records that the Windows app was 0.15.3 and was installing 0.15.4 ("The relaunched 0.15.3 instance logged last at 15:51:46"). The summary also does not say that the AC-05 and AC-06 text changed: AC-05 gained the update clause, and AC-06 now judges the host list "after the app's next start" and names the lost window and deleted restore cases. These are material changes to the accepted proof bar.
PROPOSAL: Say that the Windows app was updating from 0.15.3 to 0.15.4, and add one sentence on how AC-05 and AC-06 were reworded.
