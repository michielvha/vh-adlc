---
status: in-progress
status_description: "Implementation started on feat/paseo-hosts."
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

The owner runs Paseo daemons on Linux servers and uses them from the Paseo desktop app on a Mac and a Windows PC. A local Bash tool did this for a real server and the Mac on 2026-11-10, but it is untracked, untested and names the owner's machines.

This feature rebuilds it as a Go CLI in a new vhco-tools plugin, `paseo-hosts`, like remote-gui, except that the first run on a machine downloads two Go libraries through Go's module proxy, checked against `go.sum`, and the pinned Paseo CLI from npm. To add a server, the skill runs `onboard` and `link`. `onboard` installs a password-protected daemon reachable only over SSH, relay off; `--publish` opts in to a tailnet-only HTTPS route. `link` gives a macOS or Windows desktop a key that opens only the daemon tunnel and adds the server to its Paseo app with no manual step. `unlink` takes one desktop off a server; `--server-only` revokes one that is gone. `remove` unlinks every desktop and deletes the daemon service, its config and the local password, keeping Paseo state and workspace unless `--purge`; `--skip-server` handles a dead server. `status` prints fixed fields. Settings come from environment variables and flags; plaintext passwords stay on the operator host and in apps.

Excluded: phones, the web UI, the Linux app, relay pairing, agent CLI installs and the operator's own daemon. New servers use port 6767.

Side effects: `link`, `unlink` and `remove` restart the desktop app twice (not `link --no-app` or `unlink --server-only`). With default app settings each quit stops the desktop's own built-in daemon and its agents and may install a downloaded update. The run briefly opens a loopback debugging port and keeps a backup of the host list, passwords included, in the registry directory; a rejected change restores it. Windows needs OpenSSH Server and a signed-in user.

Planned checks: Go tests against SSH and DevTools stand-ins, CI lint and race checks, an installed-copy build in CI, and a manual run on a server, Mac, Windows PC and fresh agent session. Windows scripts run under `pwsh` on Linux; Windows itself is proven only manually. Nothing is implemented. R-1's blocking gaps are fixed; R-2 to R-8 found none.

Acceptance authorizes implementing on a feature branch through the vh-adlc gates; the logger option shipped in [v0.1.0](https://github.com/michielvha/logger/tree/v0.1.0). Opening or merging PRs, including the logger's, and touching real machines in tests need separate approval.

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

The owner decided on 2026-11-10, in answer to this document's first questions: the CLI is written in Go, the repository's established pattern, and logs through `michielvha/logger`; Windows is the second client platform; removing a server is in the first version; new servers use Paseo's default port 6767, which the owner left to the recommendation; the feature is tracked in [issue #71](https://github.com/michielvha/vh-adlc/issues/71); the handoff note files are dropped in favour of `status`; and `link` keeps the app host-list backup after success. Later the same day the owner decided that the wrapper builds the binary on the operator host as remote-gui does, that the DevTools step uses `github.com/coder/websocket`, and that `remove` keeps the server's Paseo state and workspace unless `--purge` is given. After review R-1 the owner chose, on 2026-11-10: send logs to standard error by extending `michielvha/logger` with a writer option ([draft PR michielvha/logger#8](https://github.com/michielvha/logger/pull/8)); desktops reach a server by its tailnet name, else the `ssh -G` host name, with `--client-host` to override; rollback is proven live through fault injection that only a `paseotest` build honours; an unsupported client exits 4; and the skill uses the default registry directory and asks only for a missing client alias. After R-2 the owner set the rule that every path runs unattended, so `link --no-app` sets up SSH access only and puts no password on a clipboard for a manual entry. After R-3 the owner chose `remove --skip-server` with app entries matched by connection host for a dead server, Windows snippet tests under a real `pwsh` with no extra CI step and a lean test suite overall, and a fixed set of `status` fields. The owner also chose to let the build download its dependencies through Go's module proxy rather than commit a `vendor/` directory.

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
- The shell and PowerShell snippets that run on servers and clients, as files under `internal/` embedded with `go:embed`. They are sent to `ssh` on standard input, never as arguments, so they can be linted and tested on their own. On Windows the remote command is the fixed bootstrap `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "iex ([Console]::In.ReadToEnd())"`, which holds no data and works whether the OpenSSH default shell is `cmd.exe` or PowerShell; the snippets keep to Windows PowerShell 5.1 syntax, the version Windows ships. Because 5.1 writes UTF-16 or BOM-prefixed files that OpenSSH rejects, the snippets write `config`, `known_hosts` and key files only through `[IO.File]::WriteAllText` with UTF-8 without a BOM. Because 5.1 drops empty native arguments, `ssh-keygen` runs through `Start-Process` with a single argument string so `-N ""` survives.
- `scripts/paseo-hosts.sh`, a wrapper that builds the module into `builds/` under `PASEO_HOSTS_CACHE` (default `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts`) and runs it. Like `scripts/remote-gui.sh` it sets `GOTOOLCHAIN=local` and builds with `-mod=readonly`. Unlike remote-gui it leaves `GOPROXY` and `GOSUMDB` at Go's defaults, so the first build downloads the two dependencies through the module proxy and checks them against the committed `go.sum`; later builds reuse the module cache.

Both marketplace catalogs (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`) and the plugin table in `docs/reference/marketplace.md` list the plugin. The plugin tables in `README.md` and `CONTRIBUTING.md` list it too, and `CONTRIBUTING.md` names its checks next to remote-gui's. A `paseo-hosts` job in `.github/workflows/ci.yml` runs the same build, `go test -race`, `go vet`, golangci-lint and `go mod tidy -diff` steps as the remote-gui job, then the installed-copy test with `bun test tests/paseo-hosts`. The `version` job waits for it, and `cmd/vh-adlc/workflow_test.go`, which pins the `version` job's needs to an exact list (`:106`), adds `paseo-hosts` to that list.

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
2. On the server, back up `~/.ssh/authorized_keys`, remove any line with that key, and append `restrict,port-forwarding,permitopen="127.0.0.1:<port>",command="/bin/false" <key> paseo-hosts:<client>`, whose comment names the client. `restrict` alone still allows commands, so the forced command stays.
3. Write those host keys to the client's `known_hosts` as plain entries for `PASEO_CLIENT_HOST`, as `[host]:port` when `PASEO_CLIENT_PORT` is not 22, replacing earlier entries for that name. Then write a `paseo-<alias>` block between `# BEGIN paseo-hosts paseo-<alias>` and `# END paseo-hosts paseo-<alias>` markers in the client's SSH config, replacing an earlier block or one with the local tool's `paseo-host` markers, with `IdentitiesOnly yes` and `StrictHostKeyChecking yes`. On Windows these files are in `%USERPROFILE%\.ssh`, and the CLI keeps the private key readable only by the user, as Windows OpenSSH requires.
4. From the client, check that the tunnel returns HTTP 200 from `/api/health` and that a shell command is refused.
5. Add the server to the desktop app unless `--no-app` is given, as described below. With `--no-app`, `link` sets up SSH access only: it leaves the app and the clipboard alone and prints no password, and a later `link` without `--no-app` adds the app entry unattended.

`status <alias>` prints the facts the local tool's handoff notes held, with these `--json` keys: `alias`, `ssh` (`PASEO_SSH`), `exposure` (`ssh-only` or `tailnet`), `daemon_port`, `url` (`PASEO_URL`), `clients` (a list of `name` and `remote_ssh`, the Remote SSH value) and `agents`. The plugin writes no handoff files.

`verify <alias>` runs onboard step 6 against the registry entry, including HTTPS health when `PASEO_PUBLISHED` is `yes`, changes nothing, and exits 1 on a failed check. `list` prints one line per registry file with its alias, `PASEO_SSH` and `PASEO_URL`, and with `--json` a list of objects with the keys `alias`, `ssh` and `url`.

### Desktop app entry

The app accepts hosts only from its own UI or its local storage, so `link` writes the entry through the Chrome DevTools Protocol:

1. Read the daemon's `serverId` with `paseo daemon status --json` over `PASEO_URL`.
2. Quit the app on the client and relaunch it with `--remote-debugging-port` on a random loopback port. On macOS the CLI asks the app to quit with AppleScript, sends `SIGTERM` if it has not quit, and starts it with `open -a`. On Windows it stops the `Paseo` process, which holds none of the CLI's writes yet, and starts the app through a one-time scheduled task that runs in the signed-in user's interactive session, then deletes the task. The operator host forwards the debugging port over SSH for the duration of the step.
3. The CLI finds the app window by its `@paseo:client-id-v1` key and upserts one entry for the `serverId` in `@paseo:daemon-registry`: label `<alias>`, the password, `lifecycle: {}`, one `remoteSsh` connection to `paseo-<alias>` with id `ssh:paseo-<alias>::<daemon port>`, and that connection as preferred. At port 6767 the id ends in `:` and the connection has no `daemonPort`, matching the app's normalized form. It writes only the keys the app's strict schema allows and keeps every other host and an existing entry's `appearance` and `createdAt`. It saves the previous value to `PASEO_HOSTS_DIR/app-registry-<client>.backup.json` with mode 600 and keeps it after success. The DevTools WebSocket client is `github.com/coder/websocket`.
4. Reload the app and read the registry again. If the entry is gone or differs from the normalized form written in step 3, write the previous value back, reload, and fail.
5. Whether or not step 3 or 4 succeeded, wait until 8 seconds have passed since the last registry write, which covers Chromium's default 5-second localStorage commit delay (`local_storage_impl.cc`, `kCommitDefaultDelaySecs`); its rate limiter can hold a commit longer, and only a graceful shutdown flushes pending writes (`LocalStorageImpl::ShutDown`). Then quit the app gracefully: AppleScript on macOS, and on Windows `window.close()` through DevTools, after which the app quits when its last window closes (`main.js:876-879` in app 0.15.3). Force-stop it only if it is still running 20 seconds later; after a force-stop, `link` succeeds only if step 6 confirms the tunnel, and `unlink` or a rollback exits 1 and reports that the app may not have saved the change, so a re-run repeats it. Close the forward and relaunch the app without the debugging port.
6. Succeed only when the client shows an `ssh` process with `-W 127.0.0.1:<port> paseo-<alias>` started by the app within 30 seconds.

For the live rollback check, a binary built with the `paseotest` tag and run with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` adds a key the app's schema rejects to the entry before step 3 writes it, so the app drops the registry and step 4 rolls back. Release builds do not contain this code.

Every graceful quit in steps 2 and 5, and the macOS `SIGTERM` fallback, runs the app's `before-quit` path. With the default settings `manageBuiltInDaemon: true` and `keepRunningAfterQuit: false` (`dist/settings/desktop-settings.js:18-19`), that path stops the desktop's own built-in daemon and the agents in it, and it installs a downloaded app update before exiting (`main.js:844-852` in app 0.15.3). The CLI does not change those settings.

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

`SKILL.md` triggers on requests to add, onboard, link, unlink, remove, check or list Paseo servers. It uses `PASEO_HOSTS_DIR` or its default, which `onboard` creates, and asks the owner for a client alias only when `PASEO_HOSTS_CLIENT` is unset and the request names none. It runs `onboard` and then `link`, tells the owner before `link`, `unlink` or `remove` that the desktop app will restart twice and, with default app settings, stop the desktop's built-in daemon and its agents and may install a downloaded update, confirms `unlink` and `remove` with the owner first, and reports the CLI's checks from `--json`. It never prints, reads into the conversation or pastes a password, and runs `password` only into a pipe.

### Delivery

Both catalogs point at `./plugins/paseo-hosts` on the default branch, as they do for `remote-gui`, so merging is the release path for the plugin; the wrapper builds the binary on the operator host. The feature is delivered when a fresh install from each catalog after the merge builds and runs `paseo-hosts --help` starting from an empty Go module cache. The vh-adlc binary release workflow does not change. The logger release with `InitWithOptions` comes first, and the module pins it.

## Acceptance Criteria

- [ ] AC-01: After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
- [ ] AC-02: `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
- [ ] AC-03: Running `onboard` again on an onboarded server, including one whose registry the local tool wrote with port 6867, keeps its password, daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, leaves one unit and at most one route, and passes verification. A `--listen-port` that differs from the recorded port exits 2 and changes nothing.
- [ ] AC-04: After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command and a forward to any other port. The client trusts the server's host key under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
- [ ] AC-05: After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server.
- [ ] AC-06: When the app does not keep the new entry, `link` exits non-zero, the app's previous host list is restored, and the app runs again without a debugging port.
- [ ] AC-07: After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, the registry files and password are gone, and no app backup in `PASEO_HOSTS_DIR` holds the server's entry. The rest of the server's Paseo state and workspace remain unless `--purge` was given. When the server has a tunnel-only key line that belongs to no client `remove` will unlink, `remove` without a `--client` for it or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line; `unlink --server-only` removes that client's key line and registry record without contacting it, after which `remove` completes; for a recorded client with no key line it drops the client, and for an unrecorded client whose key line has no `paseo-hosts:<client>` comment it exits 1 and changes nothing. With the server unreachable, `remove --skip-server` removes the app entry and alias block of every recorded client it can reach, drops and reports any client it cannot reach, which keeps its entry and block, and deletes the registry files, and with no client recorded or named it exits 3 unless `--no-clients` is given. Other servers and hosts in the apps are unchanged.
- [ ] AC-08: The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
- [ ] AC-09: Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`. `status <alias>` prints every field listed under link, in human output and under those keys in `--json`. A registry line that is not `KEY=value` is rejected without being executed.
- [ ] AC-10: No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
- [ ] AC-11: Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command with the documented fields, and the exit code matches the documented meaning.
- [ ] AC-12: The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
- [ ] AC-13: The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
- [ ] AC-14: The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.
- [ ] AC-15: `link --no-app` sets up the key, host key and alias block as `link` does, records the client, changes neither the desktop app nor the clipboard and prints no password; a later `link` without `--no-app` adds the app entry, and `unlink` of a client without the app removes its block and key line.

## Test Plan

Go tests run the CLI's commands with a stand-in `ssh` on `PATH` that executes the embedded snippets locally under a temporary home, with stand-in `npm`, `systemctl`, `loginctl`, `tailscale`, `osascript`, `open` and a stand-in daemon. The stand-in `ssh` runs the PowerShell snippets with a real `pwsh` against temporary files, with the ACL step replaced by a recorder; those tests skip with a message when `pwsh` is not on `PATH`. Because `pwsh` also accepts PowerShell 7 syntax, one test rejects `&&`, `||`, `??`, `?.`, the ternary operator, `>` and `>>` redirection, and `Out-File`, `Set-Content` and `Add-Content` in the `.ps1` snippets. CI needs no new step: the `ubuntu-latest` image ships PowerShell 7.6.9 (runner-images `Ubuntu2404-Readme.md`) and the repository is public, so its Actions minutes are not metered. A fake DevTools endpoint serves a page that applies the app's strict schema on reload and drops the whole registry on an invalid entry.

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | `internal/onboard` tests: assert the unit, config hash, removed or single route, password mode and reuse; re-run on a local-tool registry at port 6867 with a recorded client and a `--client-host`, and assert the kept port, clients and client host and that a different `--listen-port` exits 2 with no change; and assert that verification fails when the stand-in daemon accepts a password-less connection. Live: manual steps 1 to 3. |
| AC-04 | `internal/link` tests: run the `authorized_keys` and SSH config snippets twice for both platforms against temporary files and assert one restricted line and one block, including replacement of a `paseo-host` block; resolve host keys from a hashed operator `known_hosts` for a `--client-host` value and for a server on port 2222, and assert the client entries' names, and that a missing operator entry exits 1 before any change. Live: manual steps 4 and 6. |
| AC-05, AC-06 | `internal/clientapp` tests against the fake DevTools endpoint: the upsert keeps other hosts and `appearance`, the written id and `daemonPort` match the app's normalized form at 6767 and at 6867, and an entry the page rejects causes a non-zero exit and the restored registry. A wrapper-built binary run with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` writes a valid entry. Live: manual steps 5 and 6. |
| AC-07 | `internal/remove` tests: after `link` with two stand-in clients, `remove` leaves no entry, block, key line, unit, route or registry file, keeps the state and workspace without `--purge` and deletes them with it, and keeps another server's files; a failure part way and a re-run finish the removal; `unlink` touches one client only and deletes the server's entry from the app backups, including a local-tool `mac-app-registry.backup.json`; `unlink --server-only` drops a recorded client with no key line, and for an unrecorded client whose key line lacks the `paseo-hosts:<client>` comment exits 1 and changes nothing; `remove --skip-server` with the server and one client unreachable drops and reports that client and completes; `remove --skip-server` with no client recorded or named exits 3 unless `--no-clients` is given; with one stand-in client unreachable, `remove` stops naming `unlink --server-only`, and after that command `remove` completes and the unreachable client's files are untouched; with the stand-in server refusing connections, `remove --skip-server` deletes each client's app entry, matched by connection host, its block and the registry files; with a local-tool registry and a key line the local tool wrote, `remove` exits 3 without `--client`, and also when `PASEO_CLIENTS` names a second client the plugin linked; and with `--client` it removes the app entry, the `paseo-host` block and the key line. Live: manual step 7. |
| AC-08 | `cmd/paseo-hosts` tests: run `onboard` and `link` with only the documented variables in a temporary home and an empty `PASEO_HOSTS_CACHE`, record the stand-ins' arguments, assert that the stand-in `npm` was asked to install the pinned `@getpaseo/cli` into `runtime/<version>/`, check the exit-3 error for a missing client alias, and check exit 3 naming `npm` when it is not on `PATH`. A test searches the plugin files for names from a list given in `PASEO_HOSTS_FORBIDDEN_NAMES`, which the live run sets to the operator host's names. |
| AC-09 | `internal/registry` tests parse the local tool's format and reject a line containing a command substitution without running it. `cmd/paseo-hosts` tests run `verify`, `status`, `list`, `link`, `unlink` and `remove` against a fixture in the local tool's format with no `PASEO_PUBLISHED`, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` or `PASEO_CLIENT_PORT`, and assert that `link` writes the client's alias block and `known_hosts` entry under `PASEO_DNS` with no port, and that `status` prints every field AC-09 names. |
| AC-10 | `cmd/paseo-hosts` tests record every stand-in's argument list, the debug log at `LOG_LEVEL=debug`, and both output streams during every command, and assert the password appears in none of them. |
| AC-11 | Reporter tests capture success, failure, skip and partial outcomes with a terminal and a pipe, with `NO_COLOR` absent, empty, `0` and `1`, and with `--plain`; assert no ANSI bytes in plain captures and that `--json` output parses with the documented fields and exit codes. |
| AC-12 | Manual: install `paseo-hosts@vhco-tools` in Codex and in Claude, start a new session on the operator host, ask to add a named server, and record that the agent loaded the skill, ran both commands, and showed no password. |
| AC-13 | Implementation review compares the README, `SKILL.md`, `paseo-hosts --help` and the marketplace row with the Terms table and records each mismatch. |
| AC-14 | `tests/paseo-hosts/package.test.ts`, run by the `bun test tests/paseo-hosts` step of the `paseo-hosts` CI job, copies `plugins/paseo-hosts` to a temporary directory, runs `scripts/paseo-hosts.sh --help` with an empty temporary `GOMODCACHE`, `GOFLAGS` unset and the default `GOPROXY`, and asserts it exits 0 and that both dependencies are now in that cache, as `tests/remote-gui/package.test.ts` does for remote-gui. |
| AC-15 | `internal/link` tests with a stand-in client without the app: `link --no-app` writes the key line, host key and block, calls no clipboard or app command and keeps the password out of every stream; a later `link` with the app present adds the entry; `unlink` skips the app step and removes the block and key line. |

Manual procedure on the operator host, a test server, the Mac and a Windows PC with OpenSSH Server and a signed-in user: (1) `onboard` the server and record the unit, config and Serve state; (2) re-run `onboard` and confirm the password file is unchanged; (3) `onboard --publish`, check the route and health, then `onboard` again and confirm the route is gone; (4) `link` the Mac, then from the Mac try a shell command and `ssh -W 127.0.0.1:22` with the key and confirm both fail; (5) check the Mac app's host list and tunnel process, check that no app process has `--remote-debugging-port` and the debugging port refuses connections, then run `link` again with a `paseotest` build and `PASEO_HOSTS_TEST_REJECT_ENTRY=1`, confirm it exits non-zero, the previous host list is back and no debugging port remains; (6) repeat steps 4 and 5 for the Windows PC and confirm the app window is on the user's desktop; (7) `unlink` the Windows PC, then `remove` the server, and record the clients, server and registry; (8) run the forbidden-names test with `PASEO_HOSTS_FORBIDDEN_NAMES` set to the operator host's machine, user and tailnet names, and record that it passed.

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
- [ ] T27 `docs/specs/paseo-hosts.md` - manual steps 1 to 5, 7 and 8 against a test server and the Mac, and AC-12 in Codex and Claude, recorded as evidence; each step's pass condition holds (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-12)
- [ ] T28 `docs/specs/paseo-hosts.md` - manual step 6 on the Windows PC once it accepts SSH, recorded as evidence; the app window is on the user's desktop and the tunnel is open (AC-04, AC-05, AC-06)

## Open Questions

None.

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
