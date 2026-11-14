---
status: planned
status_description: "Revision accepted at R-44; T45 to T49 add the Windows bootstrap fix and client call deadlines."
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

This feature rebuilds it as a Go CLI in a vhco-tools plugin, `paseo-hosts`. `onboard` installs a password-protected daemon reachable only over SSH, relay off; `--publish` adds a tailnet-only HTTPS route. `link` gives a macOS or Windows desktop a key that opens the daemon tunnel and, apart from the Unix socket limit below, nothing else, and adds the server to its Paseo app unattended. `unlink` takes one desktop off; `remove` unlinks all and deletes the service, config and local password, keeping Paseo state and workspace unless `--purge`. Plaintext passwords stay on the operator host and in the apps. Excluded: phones, the web UI, the Linux app, relay pairing, agent CLI installs and the operator's own daemon.

Side effects: the first run downloads two Go libraries and the pinned Paseo CLI. `link`, `unlink` and `remove` restart the desktop app at least twice, which stops its built-in daemon and may install a downloaded update. They briefly open a loopback debugging port and keep the app backup, passwords included. Windows needs OpenSSH Server and a signed-in user.

What changed: review R-41 found that a call to a Windows client could hang without end. On `win-main`, Windows PowerShell 5.1 never read a script that reached the SSH session 2 or more seconds after it started, so a debug launch waited 6 minutes and a `link` 6.5 minutes until the reviewer killed them. The revised bootstrap reads its script through PowerShell's own input pipeline, which read the late input in every run, and every SSH call to a desktop client gets a deadline: twice the snippet's own longest wait plus 30 seconds, because wait loops on the Mac ran 1.5 times longer than their sleeps add up to. A debug launch that times out counts as a failed attempt; any other call that times out fails the command as a failed snippet does at that point. New AC-18 covers both. After review R-42 the owner chose deadlines on every client call rather than only the app calls, the doubled wait, and timeout tests during a rollback and after a lost window. After R-43 a probe that times out exits 1 rather than reporting an unsupported platform, and, by the owner's answer, the `ssh -L` forward to the app's debugging port keeps its 20-second limit for opening instead of a deadline, because it stays open for a whole step. Earlier decisions stand, including the R-23 session revision and checking the marketplace install (AC-12) after the merge as https://github.com/michielvha/vh-adlc/issues/77.

Checks run: T1 to T44 pass Go tests, lint, race checks, a real `sshd` test and an installed-copy build. R-41 ran manual steps 1 to 7 and 9 live and returned every criterion met apart from AC-12, which waits for the merge, and AC-16, because of the hang. The new bootstrap was run by hand on `win-main` with the script delayed 0 to 10 seconds, and with a thrown error, an exit code, a warning and UTF-8 output. Planned: a stand-in `ssh` that never returns, a launch timeout counted as a failed attempt, a probe that never returns, stop timeouts in step 2, during a rollback and after a lost window, an alias block write and delete that never return, and a live late-input check on `win-main` as manual step 10.

Acceptance authorizes the new tasks on the feature branch and their live runs, which restart both desktop apps. The owner has approved opening the PR once the complete gate passes; merging stays separate.

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

- The established pattern for a plugin CLI in this repository is Go: `plugins/remote-gui` has `go.mod` (`go 1.27.2`), `cmd/remote-gui`, `internal/`, `.golangci.yml`, and a Bash wrapper that builds the module into a private user cache with `GOTOOLCHAIN=local` (`plugins/remote-gui/scripts/remote-gui.sh:20-39`). CI builds, tests with `-race`, vets, lints and checks `go mod tidy -diff` for it (`.github/workflows/ci.yml:93-116`).
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
| App backup | `PASEO_HOSTS_DIR/app-registry-<client>.backup.json`, mode 600: the client app's host list, passwords included, as it was before the last `link`, `unlink` or `remove` changed it. |
| Kept copy | `PASEO_HOSTS_DIR/app-registry-<client>.<UTC time>.backup.json`, mode 600: a copy of the app backup that a command names when it could not confirm the app still has its previous host list. Later commands only delete the entry of a server they unlink or remove from it. |

### Plugin layout

`plugins/paseo-hosts/` follows `plugins/remote-gui/`:

- `plugin.json` and `.claude-plugin/plugin.json` at version 0.1.0, `README.md`, and `skills/paseo-hosts/SKILL.md`.
- A Go module `github.com/michielvha/vh-adlc/plugins/paseo-hosts` with the Go version of `plugins/remote-gui/go.mod`, `cmd/paseo-hosts/main.go` for wiring only, packages under `internal/`, and `.golangci.yml` copied from remote-gui.
- The shell and PowerShell snippets that run on servers and clients, as files under `internal/` embedded with `go:embed`. They are sent to `ssh` on standard input, never as arguments, so they can be linted and tested on their own. On Windows the remote command is the fixed bootstrap `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <script>`, where `<script>` is the Base64 of the UTF-16LE text `$ProgressPreference = 'SilentlyContinue'; $WarningPreference = 'SilentlyContinue'; try { iex (@($input) -join [char]10) } catch { [Console]::Error.WriteLine($_); exit 1 }`. It holds no data, and Base64 has no character that `cmd.exe` or PowerShell treats specially, so it works whether the OpenSSH default shell is `cmd.exe` or PowerShell. It reads the script through `$input`, PowerShell's own input pipeline. On `win-main` (Windows OpenSSH 9.5p2, `cmd.exe` as default shell), `[Console]::In.ReadToEnd()`, `[Console]::In.ReadLine()` and a reader on `[Console]::OpenStandardInput()` never saw a script that reached the session 2 to 12 seconds after it started, in all 7 such runs, and blocked until killed; without a delay each run finished in under a second. `$input` and `findstr` read the same late input. Review R-41 met this hang in a debug launch and in the alias block write, and the PowerShell processes stayed on the client after `ssh` ended. With `-EncodedCommand`, Windows PowerShell writes its error, warning and progress streams to stderr as CLIXML, so the script turns progress and warning output off and writes a caught error as one plain line and exits 1, as an uncaught error does. The snippets call neither `Write-Host` nor `Write-Information`, whose output also reaches stderr as CLIXML. On `win-main` a `throw "boom"` gave exit 1 and the stderr line `boom`, `exit 3` gave exit 3, a script that called `Write-Warning` wrote nothing to stderr, nor did any run that succeeded, and UTF-8 output was unchanged; `pwsh` 7 on the operator host gave the same results. The snippets keep to Windows PowerShell 5.1 syntax, the version Windows ships. Because 5.1 writes UTF-16 or BOM-prefixed files that OpenSSH rejects, the snippets write `config`, `known_hosts` and key files only through `[IO.File]::WriteAllText` with UTF-8 without a BOM. Because 5.1 drops empty native arguments, `ssh-keygen` runs through `Start-Process` with a single argument string so `-N ""` survives.
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

Before any change, the CLI probes the client over SSH. It runs `uname -s`; `Darwin` is macOS, and any other answer or a failure leads to a PowerShell probe, which identifies Windows even when Git's Unix tools are on `PATH`. Anything else stops with exit 4, except that a `uname -s` or PowerShell probe call that passes its deadline, given below under Desktop app entry, stops at once with exit 1 and an error that names the probe and the timeout. The probe also looks up the server's host keys on the operator host with `ssh-keygen -F` under the name and port that `ssh -G <alias>` resolves (its `hostkeyalias` when set), which finds hashed entries too; with no entry `link` stops with exit 1, telling the owner to connect once with `ssh <alias>`. Unless `--no-app` is given, the probe also checks that the Paseo app is installed and, on Windows, that the client user is signed in to a desktop session; otherwise `link` stops here with nothing changed.

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
2. Quit the app on the client, wait as described below, and relaunch it with `--remote-debugging-port` on a random loopback port. On macOS the CLI asks the app to quit with AppleScript, sends `SIGTERM` if it has not quit, and starts it with `open -a`. On Windows it stops the `Paseo` process, which holds none of the CLI's writes yet, and starts the app through a one-time scheduled task that runs in the signed-in user's interactive session, then deletes the task. The operator host forwards the debugging port over SSH for the duration of the step. A debug launch succeeds when the app answers on its debugging port within 60 seconds. An attempt fails when the app's main process exits before that or the page has not answered after 60 seconds; the CLI then quits and waits, whose 3-second floor is the wait between attempts, and tries again. Every debug launch, in step 2, after a lost window and in each check after a rollback, gets up to three attempts. Before each attempt, the CLI checks that no app main process runs; when one has appeared, for example because an update install started the app again, it quits and waits again, and that uses one of the three attempts. When all three attempts in step 2 fail, nothing has been written yet, and the command goes to step 6 and exits 1 with the host list unchanged. In live runs on the Mac, a debug-mode app exited by itself within a second of starting, after it applied its login shell environment and before it opened a window, in 3 of about 9 runs; the likely cause is `setupSingleInstanceLock`, which quits without a log line when `requestSingleInstanceLock()` fails (`dist/main.js:702-707` in app 0.15.4).
3. The CLI finds the app window by its `@paseo:client-id-v1` key and upserts one entry for the `serverId` in `@paseo:daemon-registry`: label `<alias>`, the password, `lifecycle: {}`, one `remoteSsh` connection to `paseo-<alias>` with id `ssh:paseo-<alias>::<daemon port>`, and that connection as preferred. At port 6767 the id ends in `:` and the connection has no `daemonPort`, matching the app's normalized form. It writes only the keys the app's strict schema allows and keeps every other host and an existing entry's `appearance` and `createdAt`. It saves the previous value to `PASEO_HOSTS_DIR/app-registry-<client>.backup.json` with mode 600 and keeps it after success. The DevTools WebSocket client is `github.com/coder/websocket`.
4. Reload the app, wait 4 seconds and read the registry again. If the entry is gone or differs from the normalized form written in step 3, restore the previous value as described below and fail.
5. Whether or not step 3 or 4 succeeded, wait until 8 seconds have passed since the last registry write, which covers Chromium's default 5-second localStorage commit delay (`local_storage_impl.cc`, `kCommitDefaultDelaySecs`); its rate limiter can hold a commit longer, and only a graceful shutdown flushes pending writes (`LocalStorageImpl::ShutDown`). On `macbook-pro`, app 0.15.4, a probe key `paseoHostsCommitProbe` written through DevTools during the R-23 investigation appeared in the Local Storage leveldb `.log`, read with a read-only parser of its records, between 0.25 and 60 seconds after the write when the app was not quit, and two probe writes made right before an AppleScript quit were both in the log afterwards; so the CLI relies on the graceful quit, not on the wait. Then quit the app gracefully: AppleScript on macOS, and on Windows `window.close()` through DevTools, after which the app quits when its last window closes (`main.js:876-879` in app 0.15.3). Force-stop it only if it is still running 20 seconds later; after a force-stop, `link` succeeds only if step 6 confirms the tunnel and otherwise exits 1 saying the app may not have saved the change, and `unlink` of a change the app kept exits 1 and reports that the app may not have saved the change, so a re-run repeats it. Close the forward, then quit and wait as described below. After a rollback, check it: debug-launch the app once more, open a new forward to its debugging port and read the registry, restoring the backed-up value if the registry does not match the backup in that sense; then wait for the commit, quit gracefully, close the forward, and quit and wait as above. If the check had to restore, repeat it once. A rollback ends with one of two messages: that the previous host list is restored, when a check found the registry matching the backup, or that the CLI could not confirm it. In that case the CLI copies `PASEO_HOSTS_DIR/app-registry-<client>.backup.json` to `app-registry-<client>.<UTC time>.backup.json` with mode 600, the time written as `20060102T150405Z`, and the message names the copy, which holds the previous list. No command overwrites such a copy; `unlink` and `remove` delete their server's entry from it, as they do from every app backup. The README gives the steps to restore a copy through the app's DevTools. When the app had no `@paseo:daemon-registry` key before the command, the CLI writes no backup or copy and the message says the app had no host list. A force-stop or an installer that does not finish during a rollback leads to one of these two messages, with its reason added.
6. Relaunch the app without the debugging port and wait until its main process runs. `link` succeeds only when the client shows an `ssh` process with `-W 127.0.0.1:<port> paseo-<alias>` started by the app within 30 seconds. Every command then checks that the app's main process still runs, and fails if it does not. Every command ends with this step, after a rollback and after the message that names the backup file too, unless quit and wait gave up on an installer, which leaves the app stopped.

To quit and wait, the CLI waits until the app's main process is gone, then until at least 3 seconds have passed and no app update installer runs, for up to 120 seconds. The app updates itself, so the CLI reads the installer's name from the installed app on each run and uses today's value only when it cannot read it. On macOS the installer is the Squirrel.Mac `ShipIt` process whose arguments name the job `<identifier>.ShipIt`, where `<identifier>` is `CFBundleIdentifier` in the app's `Contents/Info.plist`, falling back to `sh.paseo.desktop`. `stop.sh` reads it with `PlistBuddy -c 'Print CFBundleIdentifier'`, which reads XML and binary property lists, with `/usr/libexec` added to the end of `PATH`; on `macbook-pro`, `/usr/libexec/PlistBuddy` printed `sh.paseo.desktop` for the installed app. Squirrel.Mac labels that job with the app's bundle identifier (`SQRLDirectoryManager.m`, `NSBundle.mainBundle.bundleIdentifier`) plus `.ShipIt` and passes the label to `ShipIt` as an argument (`SQRLShipItLauncher.m`); on `macbook-pro`, `Paseo.app/Contents/Info.plist` gives `CFBundleIdentifier` `sh.paseo.desktop`, `~/Library/Caches/sh.paseo.desktop.ShipIt/ShipItState.plist` names the same bundle, and the `ShipIt_stderr.log` beside it records the 0.15.4 install on 2026-11-11. A match on `ShipIt` alone would also catch other apps' installers, such as VS Code's `com.microsoft.VSCode.ShipIt`, which stays running on the Mac. On Windows the installer is any process whose executable is under `%LOCALAPPDATA%\<directory>\`, where `<directory>` is `updaterCacheDirName` in `%LOCALAPPDATA%\Programs\Paseo\resources\app-update.yml`, falling back to `@getpaseodesktop-updater`. The read takes the text after `updaterCacheDirName:` and strips surrounding single or double quotes. On macOS the AppleScript quit in every step names the app by that same identifier, with the same fallback. Each stop snippet prints `INSTALLER=<job or directory>` and `INSTALLER_SOURCE=file` or `fallback`, and the CLI logs both at debug level. electron-updater keeps a downloaded update in the directory named by `updaterCacheDirName` under `LOCALAPPDATA` (`AppAdapter.ts`, `getAppCacheDir`); on `win-main` the installed app's `resources\app-update.yml` gives `updaterCacheDirName: '@getpaseodesktop-updater'`, and that directory holds `installer.exe` and `pending\Paseo-Setup-0.15.4-x64.exe` from the R-23 update. If an installer still runs after 120 seconds, the command does not start the app and exits 1, saying to run it again once the update has installed; during a rollback, step 5 adds this reason to its message.

To restore, the CLI writes the backed-up value, or removes the key when there was none, reloads, waits 4 seconds and reads the key back. It repeats this up to three times until the key matches the backup: the same hosts by `serverId`, and each entry equal to the backup's apart from `createdAt`, `updatedAt` and the connection form the app normalizes on load. The read-back is needed because the app can delete `@paseo:daemon-registry` once more after the CLI writes it. Chromium then commits the write and the delete in one batch and only the delete persists, which the Mac app's Local Storage `.log`, read with the same parser, showed for failed rollbacks on app 0.15.4: the rejected entry at sequence 1479, the app's delete at 1482 and a second delete at 1485, committed in the same batch as the CLI's restore.

When the window stops answering after a reload in step 4 or in a restore, the CLI quits and waits. An app that exits by itself after such a reload counts as a lost window in the same way. On macOS it asks the app to quit with AppleScript, as in step 5. On Windows, where `window.close()` needs the page, it stops the `Paseo` process, which counts as a force-stop. Then it debug-launches the app again and continues with the read that follows the reload. It does this at most twice in one command. Unless the CLI saw the app quit gracefully, the step 3 write may be lost with it: the app was force-stopped, or it had already exited by itself and the quit found no process. So if the read in step 4 finds the registry still matching the backup, the CLI writes the change again, as in step 3, after each such lost window within the limit of two, and reloads as in step 4 before it judges whether the app kept it. If, after a window lost in step 4, the CLI cannot get back to that read, because the window is lost a third time, a debug launch's three attempts fail, a forward does not open or quit and wait gives up on an installer, it does not know whether the app kept the change. That ends like an unconfirmed rollback: the CLI keeps a copy of the backup, names it, adds the reason and exits 1; after an installer give-up the app stays stopped. Every rollback that ends without a confirmed restore, including a window lost a third time, a debug launch that fails three times and a failed forward, exits 1 with the message step 5 gives when it cannot confirm the restore.

Every SSH call to a desktop client, in `link`, `unlink` and `remove` as well as in the steps above, that runs a snippet has a deadline: twice the longest time its snippet waits by its own timers, plus 30 seconds. The `ssh -L` forward to the app's debugging port runs no snippet: it keeps its 20-second limit for opening and is closed with its step. Doubling covers wait loops that take longer than their sleeps add up to; on `macbook-pro` 100 checks with a 0.1-second sleep each took 15 seconds. A call whose snippet has no timer of its own gets 30 seconds: the platform probe, creating or reading the client key, writing or deleting the alias block, and checking that the app's main process runs. The tunnel check in `link` step 4 gets 100 seconds, from the 35 seconds of timers in its Windows snippet; a launch gets 150 seconds and the tunnel check in step 6 gets 90. Quit and wait gets twice the sum of its quit wait, its force-stop wait and the 120-second installer wait, plus 30 seconds, where the force-stop wait is 10 seconds on Windows and the quit wait again on macOS: with a 20-second quit wait that is 330 seconds on Windows and 350 on macOS. On macOS the AppleScript quit also waits for the app's reply, for up to AppleScript's 2-minute default, which the formula does not count; with that wait and the loops 1.5 times slower, the worst case is about 300 seconds, inside the 350. When a call passes its deadline, the CLI kills its `ssh` process, and the error names the step and says it timed out after that deadline. In a debug launch, a launch call that times out is a failed attempt, as when the app's main process exits before it answers, and the CLI quits and waits before the next attempt. Any other call that times out fails the command as a failed snippet does at that point, never as an unreachable client: before step 3 writes, the command exits 1 with the host list unchanged, and during a rollback or after a lost window it ends as an unconfirmed rollback does. Killing `ssh` does not stop a script that still runs on a Windows client; the bootstrap above removes the one cause of such hangs seen so far.

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

`SKILL.md` triggers on requests to add, onboard, link, unlink, remove, check or list Paseo servers. It uses `PASEO_HOSTS_DIR` or its default, which `onboard` creates, and asks the owner for a client alias only when `PASEO_HOSTS_CLIENT` is unset and the request names none. It runs `onboard` and then `link`, tells the owner before `link`, `unlink` or `remove` that the desktop app will restart at least twice, and more after a rollback or when it stops answering, and, with default app settings, stop the desktop's built-in daemon and its agents and may install a downloaded update, which leaves the app stopped when the install takes longer than 2 minutes, confirms `unlink` and `remove` with the owner first, and reports the CLI's checks from `--json`. When a command names a kept copy of the app backup, the skill stops, reports the file and the README's restore steps to the owner, and runs no other command for that client. It never prints, reads into the conversation or pastes a password, and runs `password` only into a pipe.

### Delivery

Both catalogs point at `./plugins/paseo-hosts` on the default branch, as they do for `remote-gui`, so merging is the release path for the plugin; the wrapper builds the binary on the operator host. The feature is delivered when a fresh install from each catalog after the merge builds and runs `paseo-hosts --help` starting from an empty Go module cache. The vh-adlc binary release workflow does not change. The logger release with `InitWithOptions` comes first, and the module pins it.

## Acceptance Criteria

- [ ] AC-01: After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
- [ ] AC-02: `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
- [ ] AC-03: Running `onboard` again on an onboarded server, including one whose registry the local tool wrote with port 6867, keeps its password, daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, leaves one unit and at most one route, and passes verification. A `--listen-port` that differs from the recorded port exits 2 and changes nothing.
- [ ] AC-04: After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command, a forward to any other port and every TCP remote forward when the server user cannot bind port 1. The client trusts the server's host key under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
- [ ] AC-05: After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server, also when the app installs a downloaded update as it quits and the install ends within 2 minutes, when each debug launch answers within three attempts, and when its window stops answering or the app exits by itself after a reload at most twice, as long as each forward opens and the quit in step 5 completes gracefully within 20 seconds. When that quit is a force-stop, `link` succeeds only if the app's tunnel appears, and otherwise exits 1 saying the app may not have saved the change.
- [ ] AC-06: When the app does not keep a change from `link`, `unlink` or `remove`, its window stops answering or the app exits by itself after a reload at most twice in that command, it deletes the restored list at most once, any update it installs on a quit ends within 2 minutes, each debug launch answers within three attempts, each forward opens and each quit the CLI makes of an app instance it wrote to since that instance launched completes gracefully within 20 seconds, the command exits non-zero, and after the relaunch that ends the command the app lists exactly the hosts it listed before and runs without a debugging port. AC-16 covers the paths beyond those bounds.
- [ ] AC-07: After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, the registry files and password are gone, and no app backup in `PASEO_HOSTS_DIR` holds the server's entry. The rest of the server's Paseo state and workspace remain unless `--purge` was given. When the server has a tunnel-only key line that belongs to no client `remove` will unlink, `remove` without a `--client` for it or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line; `unlink --server-only` removes that client's key line and registry record without contacting it, after which `remove` completes; for a recorded client with no key line it drops the client, and for an unrecorded client whose key line has no `paseo-hosts:<client>` comment it exits 1 and changes nothing. With the server unreachable, `remove --skip-server` removes the app entry and alias block of every recorded client it can reach, drops and reports any client it cannot reach, which keeps its entry and block, and deletes the registry files, and with no client recorded or named it exits 3 unless `--no-clients` is given. Other servers and hosts in the apps are unchanged.
- [ ] AC-08: The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
- [ ] AC-09: Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`. `status <alias>` prints every field listed under link, in human output and under those keys in `--json`. A registry line that is not `KEY=value` is rejected without being executed.
- [ ] AC-10: No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
- [ ] AC-11: Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command, `--help` included, with the documented fields, and the exit code matches the documented meaning.
- [ ] AC-12: The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
- [ ] AC-13: The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
- [ ] AC-14: The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.
- [ ] AC-15: `link --no-app` sets up the key, host key and alias block as `link` does, records the client, changes neither the desktop app nor the clipboard and prints no password; a later `link` without `--no-app` adds the app entry, and `unlink` of a client without the app removes its block and key line.
- [ ] AC-16: When `link`, `unlink` or `remove` rolls back a change the app did not keep and cannot confirm the app's previous host list, or, after a lost window and before it knows whether the app kept the change, loses the window a third time, cannot debug-launch the app or open its forward, or gives up on an installer, it exits 1 and names a copy of the app backup, `PASEO_HOSTS_DIR/app-registry-<client>.<UTC time>.backup.json`, which holds the host list the app had before the command; later commands change it only by deleting the entry of a server they unlink or remove. When the app had no host list, the message says so and no copy is written.
- [ ] AC-17: When an app update installer still runs 2 minutes after `link`, `unlink` or `remove` quits the app, the command exits 1, leaves the app stopped and says to run it again once the update has installed; during a rollback, the message is one of the two step 5 gives, with this reason added, and after a window lost in step 4 it names the kept copy AC-16 describes.
- [ ] AC-18: A Windows client runs each snippet the CLI sends, also when the script reaches it seconds after the SSH session starts, and a snippet's warning writes nothing to standard error. Every SSH call to a desktop client that has not finished by its deadline, twice its snippet's own longest wait plus 30 seconds, ends with its `ssh` process killed and an error that names the step and says it timed out. A debug launch counts such a call as a failed attempt; any other such call fails the command as a failed snippet at that point does, so `link`, `unlink` and `remove` never wait on a hung client call past its deadline.

## Test Plan

Go tests run the CLI's commands with a stand-in `ssh` on `PATH` that executes the embedded snippets locally under a temporary home, with stand-in `npm`, `systemctl`, `loginctl`, `tailscale`, `osascript`, `open`, `PlistBuddy` and a stand-in daemon. The stand-in `ssh` runs the PowerShell snippets with a real `pwsh` against temporary files, with the ACL step replaced by a recorder; those tests skip with a message when `pwsh` is not on `PATH`. Because `pwsh` also accepts PowerShell 7 syntax, one test rejects `&&`, `||`, `??`, `?.`, the ternary operator, `>` and `>>` redirection, and `Out-File`, `Set-Content` and `Add-Content` in the `.ps1` snippets. CI needs no new step: the `ubuntu-latest` image ships PowerShell 7.6.9 (runner-images `Ubuntu2404-Readme.md`) and the repository is public, so its Actions minutes are not metered. A fake DevTools endpoint serves a page that applies the app's strict schema on reload and drops the whole registry on an invalid entry.

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | `internal/onboard` tests: assert the unit, config hash, removed or single route, password mode and reuse; re-run on a local-tool registry at port 6867 with a recorded client and a `--client-host`, and assert the kept port, clients and client host and that a different `--listen-port` exits 2 with no change; and assert that verification fails when the stand-in daemon accepts a password-less connection. Live: manual steps 1 to 3. |
| AC-04 | `internal/link` tests: run the `authorized_keys` and SSH config snippets twice for both platforms against temporary files and assert one restricted line and one block, including replacement of a `paseo-host` block; resolve host keys from a hashed operator `known_hosts` for a `--client-host` value and for a server on port 2222, and assert the client entries' names, and that a missing operator entry exits 1 before any change. A test starts an unprivileged `sshd` on a free loopback port with an `authorized_keys` file written by the authorize snippet, and asserts that `ssh -W` reaches a test HTTP server on the daemon port, that `-W` to another port, a shell command, and `ssh -N -o ExitOnForwardFailure=yes` with `-R 127.0.0.1:<free port>:127.0.0.1:<daemon port>` and, after the test HTTP server stops so the daemon port is free, with `-R 127.0.0.1:<daemon port>:127.0.0.1:<daemon port>` all fail; it skips with a message when `sshd` is not installed, and no CI step is added to install it. The `ubuntu-latest` runner is expected to have `sshd`, so the test should run in CI; the first push shows whether it ran or skipped. Live: manual steps 4 and 6. |
| AC-05, AC-06, AC-16, AC-17 | `internal/clientapp` tests against the fake DevTools endpoint: the upsert keeps other hosts and `appearance`, the written id and `daemonPort` match the app's normalized form at 6767 and at 6867, and an entry the page rejects causes a non-zero exit and the restored registry. Further cases make the page stop answering once after a reload, make the page stop answering after two reloads, make the page delete the restored value once, run `unlink` against a page that rejects the removal once, and make a restore that reads back in the session missing after the restart; each asserts a non-zero exit, the restored registry after the restart and that no app process has a debugging port at the end, and the last that the CLI restored and checked again; the `unlink` case that rejects the removal once also asserts a second debug launch after the rollback, for the check after a restart. A case whose page keeps the entry and stops answering once after the step 4 reload asserts exit 0, the entry, the tunnel and a second debug launch. A rollback with an app that ignores the graceful quit, and a fake commit delay longer than the CLI's wait so that each force-stop loses every write since the launch, asserts exit 1, a second debug launch for the check after a restart, and the "restored" message with the force-stop reason added and no kept copy. With that long commit delay, a case whose page keeps the entry, stops answering once after the step 4 reload and ignores only the graceful quit after the lost window asserts exit 0, the entry, the tunnel and a second write of the change; the same with the window lost after both the step 4 reload and the reload after the rewrite asserts exit 0 and a third write; a case whose page keeps the entry and whose app exits by itself right after the step 4 reload, losing the writes since its launch, asserts exit 0, the entry, the tunnel and a second write of the change; a case whose page rejects the entry and whose app exits by itself right after the step 4 reload, losing the writes since its launch, asserts a non-zero exit, a second write of the change and the previous registry after the relaunch that ends the command; and a case whose page keeps the entry and ignores the step 5 quit asserts exit 1 and the "may not have saved" message. A case whose page stops answering after every reload and ignores the graceful quit after each lost window, so that each force-stop loses the write and each rewrite is lost again, asserts exit 1 and a named copy holding the previous registry after the third loss. A case whose stand-in `ssh` refuses the forward after a window lost in step 4 asserts exit 1 and a named copy holding the previous registry. A case whose page stops answering after the step 4 reload and whose next three debug launch attempts exit early asserts exit 1 and a kept copy holding the previous registry. A case whose page rewrites the restored entries' connections into its normalized form on reload asserts the "restored" message, no kept copy and a second debug launch after the rollback, for the check after a restart. A case whose stand-in app exits before it answers on the first debug launch, with an entry the page keeps, asserts exit 0, the entry, the tunnel and two recorded debug launch attempts at least the quit-and-wait floor apart, as the test shortens it; a case where all three debug launches exit early asserts exit 1, an unchanged registry, three recorded attempts at least that floor apart and a final launch without a debugging port. A case whose page does not answer on the first attempt while the app runs, with an entry the page keeps and the 60-second limit shortened, asserts exit 0, a quit and a second attempt. Three more cases make every restore fail, make the page reject the entry, delete each restored value and stop answering after every reload, so that a third reload comes inside the rollback, and run `unlink` against a page that rejects the change and every restore; each asserts exit 1, a message naming the kept copy, that the copy holds the registry from before the command, that a following `link` leaves the copy unchanged and that no app process has a debugging port at the end. One case starts from an app without `@paseo:daemon-registry` and makes every restore fail; it asserts that the message says the app had no host list and that no backup file or copy was written. A `stop.sh` test runs a stand-in process whose arguments contain `sh.paseo.desktop.ShipIt` for 5 seconds, longer than the 3-second floor, and one with `com.microsoft.VSCode.ShipIt` that keeps running, and asserts that the quit returns no earlier than the first ends and without waiting for the second. The same test with a stand-in `Info.plist` naming `test.paseo.other` and a 5-second stand-in process whose arguments contain `test.paseo.other.ShipIt` asserts that the quit waits for it, that the AppleScript quit names `test.paseo.other`, and that it prints `INSTALLER_SOURCE=file`; without an `Info.plist` it prints `INSTALLER_SOURCE=fallback`. A `pwsh` test runs the installer read of `stop.ps1` on its own, apart from `Get-CimInstance`, with `LOCALAPPDATA` set to a temporary directory holding `Programs\Paseo\resources\app-update.yml` with `updaterCacheDirName: 'test-updater'`, and asserts `INSTALLER=test-updater` and `INSTALLER_SOURCE=file`; without the file it asserts `INSTALLER=@getpaseodesktop-updater` and `INSTALLER_SOURCE=fallback`. A fake case whose stand-in installer outlives an installer limit the test shortens to 2 seconds asserts that `link` exits 1 with the "run it again" message and that no launch follows the quit, the same through `unlink`, and that during a rollback the AC-16 message carries that reason. A case whose window is lost after the step 4 reload while a stand-in installer outlives that limit asserts exit 1, no launch after the quit, the "run it again" message and a named copy holding the previous registry. A case whose stand-in installer starts the app as it ends asserts that `link` exits 0, that the CLI quit the app again before its debug launch and that the debug launch answered. A test with a stand-in app that exits after its tunnel appears asserts that `link` exits 1, and the same stand-in through `unlink` asserts that `unlink` exits 1. A wrapper-built binary run with `PASEO_HOSTS_TEST_REJECT_ENTRY=1` writes a valid entry. The Windows installer wait, apart from that read, and the Windows check that the app still runs are checked live only, because the snippets need `Get-CimInstance`, which `pwsh` on Linux lacks. Live: manual steps 5, 6 and 9. |
| AC-18 | `internal/remote` tests: a stand-in `ssh` that never returns makes a call with a shortened deadline end at that deadline with an error that says it timed out and is not an unreachable host, and leaves no stand-in process running. `internal/clientapp` tests with the waits and the 30-second margin shortened: a launch that never returns on the first debug launch attempt, with an entry the page keeps, asserts exit 0, the entry and a second attempt; a stop that never returns in step 2 asserts exit 1, the step and the timeout in the message and an unchanged registry; a stop that never returns during a rollback, and one after a window lost in step 4, each assert exit 1, the unconfirmed-rollback message with the step and the timeout, and a kept copy of the backup. `internal/link` and `internal/remove` tests: a PowerShell probe that never returns, after a `uname -s` that fails, makes `link` exit 1, not 4, with the probe and the timeout in the message and the app's registry unchanged; an alias block write that never returns makes `link` exit 1 with the step and the timeout in the message and the client still in `PASEO_CLIENTS`, and an alias block delete that never returns makes `unlink` exit 1 with the step and the timeout. The Windows stand-in clients run the bootstrap's own arguments with `pwsh`; a case sends a script that throws and asserts exit 1 and its message, and one sends a script that writes a warning and asserts an empty standard error. Live: manual step 10, and manual steps 6 and 9 pass on the Windows PC. |
| AC-07 | `internal/remove` tests: after `link` with two stand-in clients, `remove` leaves no entry, block, key line, unit, route or registry file, keeps the state and workspace without `--purge` and deletes them with it, and keeps another server's files; a failure part way and a re-run finish the removal; `unlink` touches one client only and deletes the server's entry from the app backups, including a local-tool `mac-app-registry.backup.json`; `unlink --server-only` drops a recorded client with no key line, and for an unrecorded client whose key line lacks the `paseo-hosts:<client>` comment exits 1 and changes nothing; `remove --skip-server` with the server and one client unreachable drops and reports that client and completes; `remove --skip-server` with no client recorded or named exits 3 unless `--no-clients` is given; with one stand-in client unreachable, `remove` stops naming `unlink --server-only`, and after that command `remove` completes and the unreachable client's files are untouched; with the stand-in server refusing connections, `remove --skip-server` deletes each client's app entry, matched by connection host, its block and the registry files; with a local-tool registry and a key line the local tool wrote, `remove` exits 3 without `--client`, and also when `PASEO_CLIENTS` names a second client the plugin linked; and with `--client` it removes the app entry, the `paseo-host` block and the key line. Live: manual step 7. |
| AC-08 | `cmd/paseo-hosts` tests: run `onboard` and `link` with only the documented variables in a temporary home and an empty `PASEO_HOSTS_CACHE`, record the stand-ins' arguments, assert that the stand-in `npm` was asked to install the pinned `@getpaseo/cli` into `runtime/<version>/`, check the exit-3 error for a missing client alias, and check exit 3 naming `npm` when it is not on `PATH`. A test searches the plugin files for names from a list given in `PASEO_HOSTS_FORBIDDEN_NAMES`, which the live run sets to the operator host's names. |
| AC-09 | `internal/registry` tests parse the local tool's format and reject a line containing a command substitution without running it. `cmd/paseo-hosts` tests run `verify`, `status`, `list`, `link`, `unlink` and `remove` against a fixture in the local tool's format with no `PASEO_PUBLISHED`, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` or `PASEO_CLIENT_PORT`, and assert that `link` writes the client's alias block and `known_hosts` entry under `PASEO_DNS` with no port, and that `status` prints every field AC-09 names. |
| AC-10 | `cmd/paseo-hosts` tests record every stand-in's argument list, the debug log at `LOG_LEVEL=debug`, and both output streams during every command, and assert the password appears in none of them. |
| AC-11 | Reporter tests capture success, failure, skip and partial outcomes with a terminal and a pipe, with `NO_COLOR` absent, empty, `0` and `1`, and with `--plain`; assert no ANSI bytes in plain captures and that `--json` output parses with the documented fields and exit codes. `cmd/paseo-hosts` tests assert that `--help --json` and `<command> --help --json` print one object with `data.usage`, and that `/dev/null`, a file and a pipe are not terminals. |
| AC-12 | Manual: install `paseo-hosts@vhco-tools` in Codex and in Claude, start a new session on the operator host, ask to add a named server, and record that the agent loaded the skill, ran both commands, and showed no password. |
| AC-13 | Implementation review compares the README, `SKILL.md`, `paseo-hosts --help` and the marketplace row with the Terms table and records each mismatch. |
| AC-14 | `tests/paseo-hosts/package.test.ts`, run by the `bun test tests/paseo-hosts` step of the `paseo-hosts` CI job, copies `plugins/paseo-hosts` to a temporary directory, runs `scripts/paseo-hosts.sh --help` with an empty temporary `GOMODCACHE`, `GOFLAGS` unset and the default `GOPROXY`, and asserts it exits 0 and that both dependencies are now in that cache, as `tests/remote-gui/package.test.ts` does for remote-gui. |
| AC-15 | `internal/link` tests with a stand-in client without the app: `link --no-app` writes the key line, host key and block, calls no clipboard or app command and keeps the password out of every stream; a later `link` with the app present adds the entry; `unlink` skips the app step and removes the block and key line. |

Manual procedure on the operator host, a test server, the Mac and a Windows PC with OpenSSH Server and a signed-in user: (1) `onboard` the server and record the unit, config and Serve state; (2) re-run `onboard` and confirm the password file is unchanged; (3) `onboard --publish`, check the route and health, then `onboard` again and confirm the route is gone; (4) `link` the Mac, then from the Mac try a shell command, `ssh -W 127.0.0.1:22`, and `ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:<free port>:127.0.0.1:<daemon port>` with the key and confirm all three fail; (5) check the Mac app's host list and tunnel process, check that no app process has `--remote-debugging-port` and the debugging port refuses connections, then run `link` three times with a `paseotest` build and `PASEO_HOSTS_TEST_REJECT_ENTRY=1`; confirm that each run exits non-zero and that 90 seconds after it exits, which covers the 60-second commit delay seen on the Mac, `@paseo:daemon-registry` in the relaunched app's localStorage leveldb files, copied to the operator host and parsed read-only there, holds the hosts it held before; the parser takes the record with the highest sequence number for the key across the `.log` and `.ldb` files and counts a deletion as no host list, and that its tunnels are back and no debugging port remains; (6) repeat steps 4 and 5 for the Windows PC and confirm the app window is on the user's desktop; (7) `unlink` the Windows PC, then `remove` the server, and record the clients, server and registry; (8) run the forbidden-names test with `PASEO_HOSTS_FORBIDDEN_NAMES` set to the operator host's machine, user and tailnet names, and record that it passed; (9) on each desktop, start a stand-in installer that runs for 60 seconds, on the Mac a process with `sh.paseo.desktop.ShipIt` in its arguments and on Windows a copy of a system program such as `ping.exe` placed under `%LOCALAPPDATA%\@getpaseodesktop-updater\`, run `link` at once, and record that the stand-in was still running when the app's main process exited, that the app's next start came after the stand-in ended, and that the app still runs 60 seconds after `link` exits. On the Mac, repeat it with a stand-in that starts the app with `open -a` as it ends, and record that `link` succeeds and that the app ends without a debugging port. On Windows, repeat it with a stand-in that runs for 150 seconds and record exit 1, the "run it again" message and the app left stopped, then start the app and confirm its hosts. Also read `CFBundleIdentifier` from `Paseo.app/Contents/Info.plist` on the Mac and `updaterCacheDirName` from the installed app's `resources\app-update.yml` on Windows, and record from the CLI's debug log at `LOG_LEVEL=debug` that each desktop's stop snippet printed `INSTALLER_SOURCE=file` and its own value: `INSTALLER=<identifier>.ShipIt` on the Mac and `INSTALLER=<directory>` on Windows; (10) on the Windows PC, pipe a snippet that writes a warning and then prints a value to `ssh <pc> <bootstrap>` 10 seconds after the session starts, and record that it prints the value, exits 0 and writes nothing to standard error, and that no PowerShell process from it remains.

The implementation reviewer runs manual steps 1 to 7, 9 and 10 itself on the test server, the Mac and the Windows PC, including the three `paseotest` rollbacks on each desktop, and inspects the results over SSH. It records whether an app update was pending on each desktop, and if a run leaves a desktop's host list damaged, it records that and restores the list from the backup file. Afterwards it runs `onboard` on the server and `link` for both desktops again, so the setup is back in use. It prints no password.

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
- [x] T39 `internal/clientapp/fakedevtools_test.go`, `internal/clientapp/clientapp_test.go`, `internal/testenv/standins.go` - fake DevTools and stand-in app cases for a page that stops answering once and twice after a reload, a page that deletes the restored value once, `unlink` against a page that rejects the removal once, a restore that reads back in the session but is missing after the restart, a first debug launch whose app exits before it answers with an entry the page keeps, three debug launch attempts that all exit early, a page that does not answer on the first attempt, a page that rewrites the restored connections on reload, a page that keeps the entry and stops answering once after the step 4 reload, a rollback with an app that ignores the graceful quit, a kept entry whose lost window is force-stopped and loses the write, a kept entry whose app exits by itself after the step 4 reload and loses the write, a rejected entry whose app exits by itself after the step 4 reload and loses the write, a forward refused after a lost window, a window lost after the step 4 reload followed by three failed attempts, a restore that never holds, a page that rejects the entry, deletes each restored value and stops answering after every reload, a third lost window during the rewrites after force-stops, a kept entry whose step 5 quit is a force-stop that loses the write, a kept entry that loses the window twice with force-stops, `unlink` against a page that rejects the change and every restore, and an app without a host list whose restore never holds; each fails against the current code on an assertion the Test Plan gives for it (AC-05, AC-06, AC-16)
  - Evidence: `go test -race -count=1 ./internal/clientapp/` fails all 23 new cases against the current code, each on a Test Plan assertion, while the existing cases pass. Examples: the lost-window rollbacks leave the registry `[]`; the restore whose value the page deletes once leaves no key; the early-exit and deaf first attempts fail with `the Paseo app window did not answer over DevTools`; the rollback cases record 1 debug launch where 2 or 3 are expected; the step 5 force-stop says the tunnel is missing, not `may not have saved`; the unconfirmed cases name no kept copy, and the case without a host list does not say so. `go vet` for linux, darwin and windows and golangci-lint (0 issues) pass.
- [x] T40 `internal/clientapp/clientapp.go`, `internal/clientapp/cdp.go`, `internal/clientapp/snippets/launch.sh`, `internal/clientapp/snippets/launch.ps1` - every debug launch gets three attempts, retrying an app that exits or does not answer within 60 seconds after quit and wait, which now waits at least a 3-second floor that a variable names so the tests can shorten it, a lost window leads to a new debug launch and, unless the app quit gracefully, to a new write of the change when the read still matches the backup, every restore is read back and compared by host and entry apart from the fields the app rewrites on load, a rollback is confirmed after a restart, and an unconfirmed restore exits 1 naming a kept, timestamped copy of the backup; T39 and `go test -race ./...` pass (AC-05, AC-06, AC-16)
  - Evidence: the T39 cases failed first, as recorded under T39. After the change, `go test -race -count=1 ./...` with `pwsh` on PATH passes, including all 23 T39 cases (`internal/clientapp` in about 97 seconds), and `go test -tags paseotest` passes the rollback and upsert cases. `go vet` for linux, darwin and windows and golangci-lint (0 issues) pass. The T39 `srvHost` fixture now uses the connection id the app normalizes to, since the fake rewrote `ssh:old::` on every reload and the unlink case compared the raw text. The check that the main process still runs while the CLI waits for the window uses a new `running.sh` and `running.ps1`, which T42 also uses; `launch.ps1` already waited for the main process, and its failure now counts as a failed attempt.
- [x] T41 `internal/clientapp/snippets/stop.sh`, `internal/clientapp/snippets/stop.ps1`, `internal/clientapp/clientapp.go`, `internal/clientapp/fakedevtools_test.go`, `internal/clientapp/clientapp_test.go`, `internal/testenv/standins.go`, `internal/testenv/testenv.go` - a stand-in `PlistBuddy` that prints the identifier from a stand-in `Info.plist` and an `osascript` stand-in that accepts the identifier it is given; quit and wait, after the floor T40 adds, also waits until no app update installer runs, up to 120 seconds, and when it gives up the command exits 1 without starting the app, keeping a copy of the backup after a window lost in step 4; before each debug launch attempt the CLI quits an app that started again, reading the installer's name, and on macOS the identifier the AppleScript quit names, from the installed app with today's value as a fallback; the `stop.sh` test with a 5-second stand-in `sh.paseo.desktop.ShipIt` process and a stand-in `com.microsoft.VSCode.ShipIt` process, and with a stand-in `Info.plist` naming another identifier, the `pwsh` test of the `stop.ps1` installer read, and the fake cases with a 2-second installer limit, with that limit after a window lost in step 4, and with an installer that starts the app as it ends, fail first, then pass (AC-05, AC-16, AC-17)
  - Evidence: `GOTOOLCHAIN=local go test -race -count=1 ./internal/clientapp/ -run 'TestStopWaitsForTheAppsInstaller|TestStopPS1ReadsTheInstaller|TestInstallerOutlivesTheLimit|TestInstallerStartsTheAppAsItEnds'` failed first: all three `stop.sh` cases printed no `INSTALLER` or `INSTALLER_SOURCE`; the `pwsh` cases found no installer read section in `stop.ps1`; `link` and `unlink` with an installer past the 2-second limit exited 0; the rollback case ended without the "run it again" reason; the step 4 lost-window case exited 0; and the installer that starts the app as it ends got no quit before the debug launch. After the change all of them pass, and `go test -race -count=1 ./...`, `go test -race -tags paseotest ./internal/clientapp/`, `go vet ./...` for linux, darwin and windows, and `golangci-lint run` (0 issues) pass.
- [x] T42 `internal/clientapp/clientapp.go`, `internal/clientapp/snippets/launch.sh`, `internal/clientapp/snippets/running.sh`, `internal/clientapp/snippets/running.ps1`, `internal/clientapp/fakedevtools_test.go`, `internal/clientapp/clientapp_test.go` - the final launch waits for the app's main process, and every command fails when that process is gone at the end, checked on macOS by `running.sh` and on Windows by `running.ps1`; tests with a stand-in app that exits after its tunnel appears, through `link` and through `unlink`, fail first, then pass, and the PowerShell syntax test passes on `running.ps1` (AC-05)
  - Evidence: `GOTOOLCHAIN=local go test -race -count=1 ./internal/clientapp/ -run TestAppExitsAfterItsTunnelAppears` failed first: with a stand-in app that exits after its tunnel appears, `link` and `unlink` both exited 0. After the change both exit 1 saying the app stopped running, and `go test -race -count=1 ./...` with `pwsh` on PATH, including the PowerShell syntax test over `running.ps1`, `go test -race -tags paseotest ./internal/clientapp/`, `go vet ./...` for linux, darwin and windows, and `golangci-lint run` (0 issues) pass.
- [x] T43 `plugins/paseo-hosts/README.md`, `plugins/paseo-hosts/skills/paseo-hosts/SKILL.md` - both say that the app restarts at least twice, and more after a rollback or when it stops answering, that a command waits up to 2 minutes for a downloaded app update to install and leaves the app stopped when it takes longer, and that a restore the CLI cannot confirm names a kept copy of the backup; the README gives the steps to restore that copy through the app's DevTools, and the skill stops and reports it; a grep finds `at least twice`, `2 minutes` and `<UTC time>.backup.json` in each file and `restart twice` or `starts again twice` in neither (Design)
  - Evidence: `grep -c` on each file finds `at least twice`, `2 minutes` and `<UTC time>.backup.json` once each and `restart twice` or `starts again twice` zero times. The README gains "Restoring a kept copy" with the DevTools `localStorage.setItem` steps for the raw value `backup()` writes (`clientapp.go:302`), and SKILL.md gains the stop-and-report rule.
- [x] T44 `docs/specs/paseo-hosts.md` - manual steps 5, 6 and 9 with three `paseotest` rollbacks on each desktop, each followed 90 seconds later by a read-only parse of the relaunched app's localStorage leveldb files on the operator host that takes the highest-sequence record for the key across `.log` and `.ldb` files and counts a deletion as no host list, and the stand-in installer on each desktop, plus the Mac stand-in that starts the app as it ends and the 150-second Windows stand-in, recorded as evidence with whether a real update was pending and with `CFBundleIdentifier` read on the Mac, `updaterCacheDirName` read on Windows, and the debug log showing `INSTALLER_SOURCE=file` with `INSTALLER=<identifier>.ShipIt` on the Mac and `INSTALLER=<directory>` on Windows; both desktops end with their hosts and tunnels (AC-05, AC-06, AC-17)
  - Evidence: run on 2026-11-12 at `55f1698` with a release build and a `paseotest` build, app 0.15.4 on both desktops. No real update was pending on either: the Mac's `@getpaseodesktop-updater/pending` and the PC's `pending` folder hold 0.15.4, the installed version. `Paseo.app/Contents/Info.plist` gives `CFBundleIdentifier` `sh.paseo.desktop`, and `resources\app-update.yml` gives `updaterCacheDirName: '@getpaseodesktop-updater'`. Every `LOG_LEVEL=debug` run logged `installer_source` `file`, with `installer` `sh.paseo.desktop.ShipIt` on the Mac and `@getpaseodesktop-updater` on the PC. The leveldb parses ran on the operator host on copies of each app's Local Storage folder.
  - Evidence: step 5 on the Mac: before, 2 hosts (fedora-43, arch-1), the `-W 127.0.0.1:6767 paseo-arch-1` tunnel and no app process with `--remote-debugging-port` or listening port. Three `paseotest` `link` runs each exited 1 with "its previous host list is restored"; 90 seconds later the parse found the same 2 hosts at sequences 1906, 1922 and 1935, the tunnel had started within a second of each relaunch, and no debugging port remained. An earlier set on the same day stopped after two runs because the Mac went to sleep.
  - Evidence: step 6 on the PC: release `link` exited 0; from the PC with the tunnel key a shell command exited 1, `-W 127.0.0.1:22` exited 255 with "administratively prohibited" and `-R 127.0.0.1:47123:…` exited 255 with "remote port forwarding failed", and nothing listened on 47123 on arch-1. Three `paseotest` runs each exited 1 with "its previous host list is restored"; 90 seconds later the parse found the same 3 hosts (win-main, fedora-43, arch-1) at sequences 776, 787 and 798, both tunnels were back, no debugging port remained and the app ran in session 1, the signed-in user's console session. In the third run the check after the rollback had two debug launch attempts time out and the third answered.
  - Evidence: step 9 on the Mac, with a `bash` stand-in carrying `sh.paseo.desktop.ShipIt` in its arguments and a process monitor: the stand-in ran from 10:22:46 to 10:23:46 UTC, the app's main process was gone at 10:22:51 with the stand-in still running, its next start came at 10:23:47, `link` exited 0 and the app with its tunnel still ran 60 seconds later. With a stand-in that runs `open -a` on the app as it ends, the CLI logged "the Paseo app started again before its debug launch", quit it, waited, and `link` exited 0 with the app ending without a debugging port.
  - Evidence: step 9 on the PC, with a copy of `PING.EXE` under `%LOCALAPPDATA%\@getpaseodesktop-updater\`: the 60-second stand-in ran from 08:07:19 to 08:08:19 UTC, the app was gone at 08:07:28 with it running, the next start came at 08:08:21, `link` exited 0 and the app with both tunnels still ran 60 seconds later. With the 150-second stand-in `link` exited 1 with "an app update on win-main was still installing after 2m0s, so the app is left stopped; run it again once the update has installed; the app's host list on win-main is unchanged", and no Paseo process ran; started again, the app listed its 3 hosts with both tunnels. Both desktops end with their hosts and tunnels, and arch-1 keeps one key line for each.
- [ ] T45 `internal/remote/remote.go`, `internal/remote/remote_test.go` - a call takes a deadline, and a call that passes it kills `ssh` and returns an error that says it timed out after the deadline and is not `ErrUnreachable`; the test with a stand-in `ssh` that never returns and a shortened deadline fails first, then passes, and finds no stand-in process left (AC-18)
- [ ] T46 `internal/remote/remote.go`, `internal/testenv/testenv.go`, `internal/testenv/standins.go`, `internal/remote/remote_test.go` - the Windows bootstrap is the `-EncodedCommand` form the Design gives, and the Windows stand-in clients run its own arguments with `pwsh`; the stand-in cases with a script that throws and one that writes a warning pass, and `go test -race -count=1 ./...` passes; the late input cannot be reproduced off Windows, so T49 checks it live (AC-18)
- [ ] T47 `internal/clientapp/clientapp.go`, `internal/clientapp/clientapp_test.go`, `internal/clientapp/fakedevtools_test.go` - each desktop app call passes the deadline the Design derives from its waits, and a launch timeout in a debug launch is a failed attempt; the fake cases with a launch that never returns on the first attempt, and a stop that never returns in step 2, during a rollback and after a window lost in step 4, fail first, then pass, each asserting the step and the timeout in the message (AC-18)
- [ ] T48 `internal/link/link.go`, `internal/remove/remove.go`, `internal/link/link_test.go`, `internal/remove/remove_test.go` - the probe, key, alias block, tunnel check and client key calls pass their deadlines, and a probe call that times out stops with exit 1; the cases with a PowerShell probe that never returns under `link`, an alias block write that never returns under `link` and an alias block delete that never returns under `unlink` fail first, then pass (AC-18)
- [ ] T49 `docs/specs/paseo-hosts.md` - manual steps 6, 9 and 10 on `win-main`, with the `paseotest` build for the step 5 rollbacks within step 6 and a release build for the rest, recorded as evidence with the exit codes, the standard error and the PowerShell processes left (AC-18)

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
| 2026-11-11 | R-25 | spec | `a6a741c6d00d784fda40f3ebd24a597e978d92e8` | unknown | procedural | Four should-fix findings (three factual: the debug instance after a rollback check, a stand-in installer shorter than the wait floor, uncovered AC-06 and AC-16 clauses; one judgement: nothing protects or restores from the backup file) and two nits, none blocking; model identity not attested. |
| 2026-11-11 | R-26 | spec | `8463b0667104764bb08145e359d467c71999f4a0` | unknown | procedural | Two should-fix factual findings (AC-06 does not carry its bound; nothing builds or tests the 120-second installer give-up), two factual nits (the summary's AC-06 wording, the kept copy's mode) and one judgement nit (how the live read picks the current registry value). Applied the factual findings and raised Q12. |
| 2026-11-11 | R-27 | spec | `c79254865dc2b9a0130ffb70c69c03e3282c3d46` | unknown | procedural | One blocking factual finding (AC-06 was bounded by what the CLI reports rather than by what happens on the client, and covered only `link`), two should-fix factual findings (a debug-launch case that cannot fail first, a stand-in installer that may end before the quit) and one factual nit (T39 wording). Applied all four. |
| 2026-11-11 | R-28 | spec | `fc82f98615fbd4a2c1c77e1413dba353631389d0` | unknown | procedural | Two should-fix factual findings (AC-05 and AC-06 not bounded by the installer limit and the launch limit; two T39 cases that cannot fail first), one should-fix judgement finding (a macOS update install may relaunch the app before the debug launch), one judgement nit (the restore read-back is stricter than AC-06) and one factual nit (AC-16 wording on later changes to the copy). Applied the factual findings and raised Q13 and Q14. |
| 2026-11-12 | R-29 | spec | `39e23fa90d04e2fa491e3681eee7fd556af59399` | unknown | procedural | Four should-fix factual findings (two cases that cannot fail first, AC-17 checked only through macOS `link`, an unclear debug-launch limit with no outcome for a page that never answers) and two factual nits (AC-17's rollback message, the name of the wait between launches). Applied all six. |
| 2026-11-12 | R-30 | spec | `62c578b79e35bf46bf29ac2fc33450591595ffe8` | unknown | procedural | Two should-fix factual findings (a force-stop during a rollback is outside AC-06's bound and untested, and the Mac's 60-second commit delay is uncited; a window lost after a kept change is untested and unbounded) and two factual nits (the `unlink` case's placement, whether a quit before an attempt uses one). Applied all four. |
| 2026-11-12 | R-31 | spec | `fcb3beaa0989eae085e3c123efe98b0422215801` | unknown | procedural | Three should-fix factual findings (the graceful-quit bound excluded every Windows run and the lost-window quit was unstated; the force-stopped rollback case could pass before the change; a failed relaunch after a window lost in step 4 had no outcome). Applied all three. |
| 2026-11-12 | R-32 | spec | `21dcbc3c3e6c7d017ce23ed787ecbfe015b00e62` | claude-opus-4.8 | procedural | Four should-fix factual findings (a force-stopped lost window can drop a kept change; the force-stopped rollback case expects the wrong outcome; no case for a failed forward; an installer give-up after a lost window keeps no copy) and two factual nits (the installer-start case needs T41, the summary's AC-05 changes). Applied all six. |
| 2026-11-12 | R-33 | spec | `e35b672a3e3af910d117154727562cf94ed55ca1` | unknown | procedural | Three should-fix factual findings (a step 5 force-stop is outside AC-05's bound and breaks the planned case; one rewrite does not cover two force-stopped lost windows; the every-reload case and a third-loss trigger cannot happen as written) and one factual nit (the Mac measurements are not cited by command and output). Applied all four. |
| 2026-11-12 | R-34 | spec | `9a173efdc28ce3bffd65b632df3a1279b4f1bc62` | unknown | procedural | One should-fix factual finding (an app that exits by itself after a reload gets no rewrite) and four factual nits (AC-05 lacks the forward bound, the launch floor arrives after T40, no Sources section, no Terms rows for the backup and its copy), plus one judgement nit (the summary's length). Applied the factual findings and raised Q15. |
| 2026-11-12 | R-35 | spec | `85cb9d40735f5124edfee01d625a4be52b28ca57` | unknown | procedural | One should-fix factual finding (AC-06 reads an app that exits by itself as a quit that was not graceful, so it excludes the Mac failure) and one factual nit (the summary's AC-05 clause lacks the forward bound). Applied both. |
| 2026-11-12 | R-36 | spec | `41f03025c0bac68f3ef33f0a395dd74768421f68` | unknown | procedural | One should-fix factual finding (the updater path and the ShipIt job name are not cited, and no live check reads the real ones) and two factual nits (AC-06 counts force-stops of an instance holding no writes; the summary's AC-06 bound predates R-35). Measured both values and applied all three. |
| 2026-11-12 | R-37 | spec | `030bfc28d2977ee7a9ed07fae01cd94fee2e483b` | claude-opus-4.8 | procedural | Two factual nits (AC-05 counts attempts differently from the Design; step 9 reads the Mac job from a state file that may not exist) and one judgement nit (fixed installer names rather than reading them at run time). Applied the nits and raised Q16. |
| 2026-11-12 | R-38 | spec | `1350926d925c2d9642f74670eb26b20d73109bf8` | unknown | procedural | One should-fix factual finding (no check tells the Windows installer read from its fallback, and YAML quotes could break it) and one judgement nit (the macOS quit keeps a fixed app id). Applied the finding and raised Q17. |
| 2026-11-12 | R-39 | spec | `9c48ee3aafbb2077655321aa342d39fcc345b468` | unknown | procedural | Two factual nits: step 9 and T44 ask each desktop for both installer values, and the plist read has no named tool or test stand-in. Applied both. |
| 2026-11-12 | R-40 | spec | `d2726cca4b69656f5b3ecc7666d191087a8f54ad` | unknown | procedural | No findings. |
| 2026-11-12 | R-40 | spec | `d2726cca4b69656f5b3ecc7666d191087a8f54ad` | n/a | n/a | accepted by owner |
| 2026-11-12 | R-41 | implementation | `4ae46e203d4d05d142ce9fa9bae004bc6bdeb01d` | unknown | procedural | One blocking factual finding (remote snippet calls have no deadline, so a Windows PowerShell bootstrap that never sees end of input hangs the command) and one should-fix factual finding (AC-12 has no residual line); AC-16 not met, AC-12 not verified, the rest met. |
| 2026-11-13 | R-42 | spec | `09a17a644226f28d9db73d707142b302f9d25cac` | unknown | procedural | Four factual findings (the quit and wait deadline leaves out the force-stop wait, no open tasks, drift from main, warnings arrive as CLIXML) and two judgement findings (deadlines only on desktop app calls, timeout tests during a rollback); none blocking; model identity not attested. |
| 2026-11-13 | R-43 | spec | `6a077d29dabfc1a7857dbeeaa1d25500043f315e` | unknown | procedural | Three factual findings (a probe that times out falls through to exit 4, T49 names a release build for the rollbacks, the macOS quit deadline leaves out the AppleScript reply wait) and one judgement finding (the debugging-port forward reads as a call with a 30-second deadline); none blocking; model identity not attested. |
| 2026-11-14 | R-44 | spec | `b0916807a30ca6884847d9b7f682f13fd8203a76` | unknown | procedural | No blocking finding: one should-fix factual finding (AC-18 does not repeat the Design's exception for the debugging-port forward) and four factual nits (a `uname -s` timeout case, the macOS worst-case sum, the owner summary, a CI line citation); model identity not attested. |
| 2026-11-14 | R-44 | spec | `b0916807a30ca6884847d9b7f682f13fd8203a76` | n/a | n/a | accepted by owner |

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

### R-25

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, steps 5 and 6; Test Plan, AC-05, AC-06 and AC-16 row
EVIDENCE: Step 5 (line 191) ends a rollback this way: "After a rollback, debug-launch the app once more, open a new forward to its debugging port and read the registry; if it does not hold the backed-up value, restore it and repeat this step once." Step 6 (line 192) then says only "Relaunch the app without the debugging port and wait until its main process runs." No sentence says that the debug instance used for the check is quit and waited for before step 6, or that its forward is closed. On Windows that quit uses `window.close()` through the open forward. The current macOS launch runs `open -a "$app"` (internal/clientapp/snippets/launch.sh:6), which only activates an app that is already running. The fake app also ignores a launch while it runs (fakedevtools_test.go:142, `if !a.running`). So an implementation that follows the text literally leaves the debugging port open after every confirmed rollback, which contradicts AC-06's "runs without a debugging port". The Design also does not say whether the paths that end in the AC-16 exit still finish with the step 6 relaunch without a debugging port. The new Test Plan cases assert only "a non-zero exit and the restored registry after the restart" and do not assert that the debugging port is gone.
PROPOSAL: In step 5, state that a confirmed check ends with a graceful quit, then the forward is closed and the CLI quits and waits before step 6. State that every rollback path, including the AC-16 exits, ends with step 6 or with the app stopped and says which. Add "no app process has a debugging port" to the assertions of the new rollback cases.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06 and AC-16 row; Tasks, T41
EVIDENCE: Design line 194 says quit and wait lasts "until at least 3 seconds have passed and no app update installer runs". The planned test "runs a stand-in process whose arguments contain `sh.paseo.desktop.ShipIt` for 2 seconds ... and asserts that the quit returns after the first ends". A 2 second stand-in ends before the 3 second floor. An implementation that adds the floor but never looks for ShipIt therefore passes the test. T41's "fails first, then passes" holds against today's stop.sh, which returns as soon as the main process is gone (stop.sh:13-20), but it says nothing about installer detection. Neither the Test Plan nor T41 says that the test shortens the 3 second floor, as T17 did for the 8, 20 and 30 second waits.
PROPOSAL: Run the ShipIt stand-in for longer than the floor, for example 5 seconds, or have the test shorten the floor. Assert that the quit returns no earlier than the moment the stand-in ends.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06 and AC-16 row
EVIDENCE: AC-06 promises recovery when the window "stops answering after a reload up to twice", and Design line 198 bounds this at "at most twice in one command". The planned cases make the page stop answering "once after a reload" and "after every reload". No case loses the window exactly twice, so an off-by-one in that bound passes every planned test. AC-16 also requires that "when the app had no host list, the message says so", and AC-16 names `link`, `unlink` and `remove`. The two AC-16 cases ("make every restore fail and make the page stop answering after every reload") assert only "a message naming the backup file". No case starts from an app without `@paseo:daemon-registry`, and none runs the rollback through `unlink`. A passing subset does not meet a composite criterion, so an implementation review would have no check for these clauses.
PROPOSAL: Add a case where the window stops answering after two reloads and the restore is confirmed. Add an AC-16 case where the app had no host list, asserting the message and that no backup file is written. Add one AC-16 case driven through `unlink`, or limit AC-16 to the commands the Test Plan covers.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Desktop app entry step 3 and step 5; Design, Skill; Tasks, T43
EVIDENCE: AC-16 leaves the owner with an app that lost its hosts and a file that "holds the host list the app had before the command". Nothing restores from that file: no command, no README procedure and no skill instruction. T43 asks only that the README and skill say "a failed restore names the backup file". Step 3 (line 189) also overwrites `app-registry-<client>.backup.json` on every run where the key exists (clientapp.go:246-250, `if ok { a.backup(...) }`). Step 5 itself tells the owner to re-run after a force-stop. A re-run against an app that now holds a partial list or `[]` replaces the only copy of the previous hosts. If the key was deleted, the first re-run keeps the file, but the next `link` to that client overwrites it with the one-entry list. Hosts added by hand, whose passwords the operator host does not hold, are then lost. The owner set the rule after R-2 that every path runs unattended.
PROPOSAL: Raise an open question. Option A: the CLI refuses to overwrite a backup left by an unconfirmed restore until the owner clears it, or it keeps timestamped backups. Option B: the skill tells the agent to stop and report after an AC-16 exit, and the README describes how to restore. The answer should be reflected in AC-16 or a new criterion.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry, step 5 and quit and wait
EVIDENCE: Step 5 still says that after a force-stop "a rollback exits 1 and reports that the app may not have saved the change, so a re-run repeats it". That sentence was written before the new check after a rollback, which confirms the restore after a restart or ends in the AC-16 message naming the backup file. The Design does not say which message wins when a rollback was force-stopped. If the check confirms the restore, "may not have saved" is false. If it does not, the AC-16 message is required instead. The same gap applies to the quit and wait timeout (line 194), which "exits 1 without starting the app and says to run it again" even when it happens during a rollback whose restore was never confirmed.
PROPOSAL: Limit the force-stop sentence to `unlink` changes that were kept. State that a rollback, whatever the reason for its exit, gives the confirmed-restore message or the AC-16 message.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria, AC-06; Test Plan, manual step 5; Tasks, T44
EVIDENCE: AC-06 judges the host list "after the app's next start" but does not say which start: the CLI's check after the rollback, the step 6 relaunch, or a later start by the owner. Manual step 5 and T44 require a read of "the restarted app's `@paseo:daemon-registry`" while the app runs without a debugging port. They do not say how to read it, for example by parsing the app's localStorage leveldb as R-23 did, or by a separate debug launch, which would itself be another restart.
PROPOSAL: Name the start in AC-06, for example "after the relaunch that ends the command". In manual step 5, give the read method and the wait before it.

### R-26

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-06 and AC-16
EVIDENCE: AC-06 says "When the app does not keep the new entry, `link` exits non-zero, and after the relaunch that ends the command the app lists exactly the hosts it listed before and runs without a debugging port, also when its window stops answering after a reload up to twice or the app deletes the restored list once." Its main clause has no condition: it promises the previous hosts on every rejected entry. "also when" adds cases to that promise. It does not limit it. The Design gives up on some paths: "at most twice in one command", "up to three launches in all", and "Every rollback that ends without a confirmed restore ... exits 1 with the message step 5 gives". AC-16 covers those paths, and the Test Plan exercises them ("make every restore fail", "make the page stop answering after every reload"). In those tests the app does not list its previous hosts, so read literally, they contradict AC-06. The Q7 answer folded in at a6a741c chose "A. Bound AC-06, add AC-16", where AC-06 "covers a window lost up to twice and a restored list deleted once". The criterion text does not carry that bound.
PROPOSAL: Write the bound into AC-06. One way: start it with "When the app does not keep the new entry and the CLI confirms its restore", or add "except on the paths AC-16 describes". Then the AC-16 test cases cannot be read as evidence against AC-06.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, quit and wait and step 6; Test Plan, AC-05, AC-06 and AC-16 row; Tasks, T41
EVIDENCE: The Design says: "If an installer still runs after 120 seconds, the command does not start the app and exits 1, saying to run it again once the update has installed". Step 6 adds that the command ends "unless quit and wait gave up on an installer, which leaves the app stopped". At 8463b06, `session()` runs `a.launch(ctx, c, "")` whether or not `a.stop` failed (plugins/paseo-hosts/internal/clientapp/clientapp.go:204-208). So the current code starts the app during the install, which is the race R-23 F-02 found. T41 changes only `stop.sh`, `stop.ps1` and two test files, not `clientapp.go`. Its done condition and the Test Plan's `stop.sh` test cover only an installer that finishes (5 seconds) and a foreign ShipIt. Manual step 9 runs a 20-second stand-in. No test, task or manual step covers the 120-second give-up, its exit 1, the app left stopped, or the reason added to a rollback message. All planned checks can pass while the CLI still relaunches the app over a running installer.
PROPOSAL: Add `internal/clientapp/clientapp.go` to T41, or to a new task. Add a fake case where the installer stand-in outlives a shortened installer timeout. It should assert exit 1, the "run it again" message, no launch after the quit and, during a rollback, the AC-16 message with that reason.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: The summary says "AC-06 judges the host list after the next start". After the Q11 answer, AC-06 says "after the relaunch that ends the command". R-25 F-06 found "next start" ambiguous for this reason. The summary also does not say that AC-06 now covers only a window lost up to twice and a restore deleted once.
PROPOSAL: Change the summary to "AC-06 judges the host list after the relaunch that ends the command, for a window lost up to twice or a restore deleted once".

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, manual step 5; Tasks, T44
EVIDENCE: Manual step 5 asks for a read of `@paseo:daemon-registry` from "the relaunched app's localStorage leveldb files, copied to the operator host and parsed read-only there". It does not name the parser or say how the parser picks the current value. The Design describes R-23's Mac failure this way: "Chromium then commits the write and the delete in one batch and only the delete persists". A parser that takes the last put for the key, or reads only `.ldb` files, would find the restored value and miss the newer delete in the `.log` file. That run would pass while the host list is gone. Only the tunnel check in the same step would catch it, and only for hosts with Remote SSH connections.
PROPOSAL: Name the parser, or say that it takes the record with the highest sequence number for the key across the `.log` and `.ldb` files and treats a deletion as no host list.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry, step 5
EVIDENCE: Step 3 says the backup is saved "with mode 600". Step 5 says only that the CLI "copies `PASEO_HOSTS_DIR/app-registry-<client>.backup.json` to `app-registry-<client>.<UTC time>.backup.json`" and gives no mode. The copy holds every host's password, and later runs never overwrite it. The only protection the document states for it is the mode 700 on `PASEO_HOSTS_DIR`.
PROPOSAL: State that the timestamped copy is written with mode 600, like the backup.

### R-27

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria, AC-06 and AC-16
EVIDENCE: AC-06 (line 239) now begins "When the app does not keep the new entry and the CLI confirms its restore". AC-16 (line 249) covers every rollback the CLI "cannot confirm". The trigger for AC-06 is therefore the CLI's own report, not the app's state. Take an implementation that gives up after the first lost window and prints the "could not confirm" message. AC-06 then never applies, and AC-16 is met once a copy is named. The app can still come back with no hosts while both boxes are ticked, which is the R-23 Mac failure (the window was lost after the reload and the hosts were gone). The owner's Q7 answer A, at 7d22743 line 363, says "AC-06 covers a window lost up to twice and a restored list deleted once" and gives AC-16 "every other rollback path". So the owner bounded AC-06 by what happens on the client, not by whether the CLI confirms. R-26 F-01's suggested wording was applied, and it changed that bound. Under the current text, the fake cases "page stop answering once after a reload" and "after two reloads" (line 259) can fail without contradicting any criterion. Manual step 5's "holds the hosts it held before" is also stronger than any criterion. Separately, no criterion covers a confirmed rollback of `unlink` or `remove`. AC-06 names only `link`, and AC-16 covers only the unconfirmed case, so an `unlink` that never confirms also passes.
PROPOSAL: Bound AC-06 by client conditions, as Q7 A says. For example: "When the app does not keep a change from `link`, `unlink` or `remove`, its window stops answering after a reload at most twice, and it deletes the restored list at most once, the command exits non-zero, and after the relaunch that ends the command the app lists exactly the hosts it listed before and runs without a debugging port." AC-16 then covers only the paths beyond that bound.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06 and AC-16 row; Tasks, T39
EVIDENCE: The row (line 259) puts "make the stand-in app's first debug launch exit before it answers" among cases where "each asserts a non-zero exit, the restored registry after the restart and that no app process has a debugging port at the end". At c792548 the code already passes that case. findPage polls until LaunchTimeout and then fails with "the Paseo app window did not answer over DevTools" (internal/clientapp/cdp.go:23-38). session() then returns writeErr, which is non-zero, after a normal relaunch without a debugging port (clientapp.go:190-217). The registry was never written, so it equals the previous one. The case therefore cannot fail first, although T39 (line 355) says "each fails against the current code". Nothing tests the Design step 2 retry ("waits 3 seconds and launches it again, up to three launches in all"), so an implementation without it passes. If the case uses an entry the page keeps, the Design expects `link` to succeed after the retry, and the asserted non-zero exit contradicts the Design.
PROPOSAL: Run this case with an entry the page keeps. Assert exit 0, the entry and the tunnel, plus two recorded debug launches at least the shortened settle time apart. Optionally add a case where three launches all exit early and assert exit 1 with nothing written.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, manual step 9; Tasks, T44
EVIDENCE: Step 9 (line 270) starts a stand-in installer "that runs for 20 seconds", runs `link` "at once", and records "that the app's next start came after the stand-in ended". The app session is `link` step 5 (line 177). It runs after the probe, key, key line, host keys, alias block and tunnel check. On Windows the tunnel check alone took 12.7 s (T30 evidence), and a whole `link` took 30 s (T28 evidence), so the stand-in may have a few seconds left when the app quits, or none. If the stand-in ends before the quit, the recorded condition holds even when the CLI never looks for an installer. Nothing in the step requires that the stand-in was still running when the app's main process exited.
PROPOSAL: Start the stand-in so that it is still running at the quit. For example, run it until the CLI reports the app step plus 20 seconds, or for 60 seconds. Record that it was running when the app's main process exited and that the next launch came after it ended.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Tasks, T39
EVIDENCE: T39 (line 355) lists "a page that stops answering after every reload, the same through `unlink`". Read naturally, "the same" means a lost window through `unlink`. The Test Plan (line 259) instead runs `unlink` "against a page that rejects the change and every restore". T39 also says each case fails "for the reason the Test Plan names", but the Test Plan states assertions, not the reason any case fails.
PROPOSAL: Make T39 say "`unlink` against a page that rejects the change and every restore". Replace "for the reason the Test Plan names" with the assertion that fails first in each case, or drop the phrase.

### R-28

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-05 and AC-06; Design, Desktop app entry, quit and wait and step 6; Test Plan, AC-05, AC-06 and AC-16 row
EVIDENCE: AC-05 (line 238) says that after `link` the app "runs without a debugging port ... and has opened its SSH tunnel to the server, also when the app installs a downloaded update as it quits". It sets no limit on how long that install takes. AC-06 (line 239) bounds its premise only by a window lost at most twice and a restore deleted at most once, and says "AC-16 covers the paths beyond those bounds". The Design (line 194) gives up on the installer after 120 seconds: "the command does not start the app and exits 1". Step 6 (line 192) confirms that this "leaves the app stopped". Line 198 also sends "a debug launch that fails three times and a failed forward" to the AC-16 exit, and the AC-06 bound does not exclude those either. The Test Plan (line 259) plans a fake case where "stand-in installer outlives an installer limit ... asserts that `link` exits 1 ... that no launch follows the quit, and that during a rollback the AC-16 message carries that reason". In that case `link` has run, an update was installing as the app quit, and the app does not run afterwards, so read literally the result contradicts AC-05. The rollback variant meets AC-06's premise (no lost window, no deleted restore), but no relaunch ends the command and the app is stopped, so it contradicts AC-06 as well. A correct implementation would therefore be judged `not met` on evidence the plan itself requires. Neither the Owner summary nor the Skill section says that an install longer than 2 minutes leaves the app stopped.
PROPOSAL: Bound AC-05 and AC-06 by client conditions that cover the installer, for example "an update installer that finishes within 120 seconds, and a debug launch that answers within three launches". Then give the end state beyond that bound in a criterion: exit 1, the app stopped, and the "run it again" message, plus the AC-16 copy during a rollback. Also say in the Owner summary and the Skill section that an install longer than 2 minutes leaves the app stopped.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Tasks, T39; Test Plan, AC-05, AC-06 and AC-16 row
EVIDENCE: T39 (line 355) says that each listed case "fails against the current code on an assertion the Test Plan gives for it". Two cases do not. (1) "`unlink` against a page that rejects the removal once", with the asserted "non-zero exit, the restored registry after the restart and that no app process has a debugging port at the end". At fc82f98, `write()` restores the raw value, reloads and returns "its previous host list is restored" (plugins/paseo-hosts/internal/clientapp/clientapp.go:287-299). `session()` then waits for the commit, quits gracefully and relaunches without a port (clientapp.go:196-217). The fake keeps live writes on a graceful stop (fakedevtools_test.go:163-166), so the current code passes all three assertions, as it does for the `link` case in `TestRejectedEntryIsRolledBack`. (2) "all three debug launches exit early asserts exit 1, an unchanged registry and a final launch without a debugging port". In the current code `findPage` fails after `LaunchTimeout` (cdp.go:23-38), nothing is written, `stop` and `launch(ctx, c, "")` run (clientapp.go:204-208), and `writeErr` is returned. That meets every assertion with a single launch, so the retry the Design requires (line 188, "up to three launches in all") has no check that fails first.
PROPOSAL: In case (2), assert three recorded debug launches spaced at least the shortened wait apart. In case (1), assert something only the new code does, such as a debug launch after the rollback (the step 5 check) or a read of the key after the restore reload. Alternatively, name these two cases in T39 as regression guards that are not expected to fail first.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Desktop app entry, steps 2 and 5 and quit and wait; Test Plan, manual step 9
EVIDENCE: Quit and wait (line 194) assumes that an update install ends with the app stopped. It waits for the main process to go and for no installer to run, then debug-launches. That assumption is measured only on Windows, where R-23 logged "quitAndInstall requested { isSilent: true, isForceRunAfter: false }" and the app stayed stopped. On macOS the 0.15.4 `before-quit` path (main.js:874) installs through Squirrel.Mac and ShipIt. Electron documents `autoUpdater.quitAndInstall()` as restarting the app after the install, and electron-updater's Mac updater does not pass `isForceRunAfter` to it. If ShipIt relaunches the app, it runs without a debugging port when quit and wait returns. `launch.sh:4` runs `open -a "$app" --args ...`, which only activates an app that is already running and drops the arguments. Step 2 retries only "If the app's main process exits before that", so the CLI would wait for a page that never answers, and the same applies to the debug launch of the check after a rollback. The fake app also ignores a launch while it runs (fakedevtools_test.go:142). Manual step 9's stand-in `ShipIt` never starts the app, so no planned check would show this path.
PROPOSAL: Before each debug launch, require that no app main process runs, and quit and wait again when one has appeared, counted against the launch limit. Add a fake case and a step 9 variant where the stand-in installer starts the app as it ends, or record on the Mac whether ShipIt relaunches Paseo after an install on quit.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Desktop app entry, "To restore" and step 5 check after a rollback
EVIDENCE: The restore read-back repeats "until the key holds the same JSON value as the backup" (line 196), and the check after a restart restores "if the registry differs". The kept check is looser: `keptEntry` ignores `appearance`, `createdAt` and `updatedAt`, and `sameOthers` compares other hosts by `serverId` only (clientapp.go:392-432). The fake app, which models the real one, rewrites Remote SSH connections into the normalized form on reload and stores the result (fakedevtools_test.go:367-412). A backup that holds an entry the app rewrites on load, for example one stored by an older app version, would then never read back as equal. Every rollback for that client would end in the AC-16 exit, and the post-restart check would restore over a list that AC-06 counts as correct ("lists exactly the hosts it listed before").
PROPOSAL: Compare the read-back the way AC-06 judges the result: the same hosts and the same entries apart from fields the app rewrites on load. Otherwise, cite evidence that the app never rewrites a stored registry on reload.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-16; Design, Desktop app entry, step 5
EVIDENCE: AC-16 (line 249) says the copy "holds the host list the app had before the command and which later commands do not overwrite". Step 5 says "`unlink` and `remove` delete their server's entry from it, as they do from every app backup". `cleanBackups` globs `app-registry-*.backup.json` (plugins/paseo-hosts/internal/remove/remove.go:397), which matches `app-registry-<client>.<UTC time>.backup.json` and rewrites it. After a later `unlink` or `remove`, the copy no longer holds the list from before the command, so an implementation that follows the Design can be read as failing AC-16.
PROPOSAL: Word AC-16 so that later commands change the copy only by deleting the entry of a server they unlink or remove, as the Design states.

### R-29

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Tasks, T39; Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: T39 (line 356) says each listed case "fails against the current code on an assertion the Test Plan gives for it", and it lists "a page that rewrites the restored connections on reload". The Test Plan (line 260) gives that case only two assertions: "asserts the "restored" message and no kept copy". At 39e23fa, `write()` writes the raw backup back, reloads, does not read it back and returns "the app on %s did not keep the change; its previous host list is restored" (plugins/paseo-hosts/internal/clientapp/clientapp.go:287-299). The current code has no kept copy at all. The fake's `reload()` rewrites Remote SSH connections into the normalized form and stores the result (fakedevtools_test.go `reload` and `normalize`). So the current code prints the "restored" message and writes no copy, and it meets both assertions. The case cannot fail first.
PROPOSAL: Add an assertion that only the new code meets, for example a second debug launch after the rollback for the check after a restart, as the `unlink` case does. Otherwise, name this case in T39 as a regression guard for T40's comparison that is not expected to fail first.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06, AC-16 and AC-17 row; Tasks, T42
EVIDENCE: The Test Plan (line 260) says "A test with a stand-in app that exits right after its final launch asserts that `link` fails". T42 (line 359) says that test "fails first, then passes". Design step 6 (line 192) runs the new main-process check after the tunnel check: "`link` succeeds only when the client shows an `ssh` process ... within 30 seconds. Every command then checks that the app's main process still runs". The fake lists tunnel processes only while the app runs (fakedevtools_test.go:184-201, `if a.running`). `Add` runs `tunnel.sh` after the session (clientapp.go:114-118). So with an app that exits right after launch, today's `link` already fails at the tunnel check after `TunnelTimeout`, and the test passes before T42. `unlink` and `remove` have no tunnel check (`Delete`, clientapp.go:126-143), so for them the clause "every command fails when that process is gone at the end" has no test. In the R-23 Windows failure the app opened its tunnel and only then stopped, so `link` reported success.
PROPOSAL: Have the stand-in app exit after its tunnel appears, which is after the tunnel check would pass. Assert exit 1 for that case. Add the same case through `unlink`, where no tunnel check hides the missing main-process check.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-17; Test Plan, AC-05, AC-06, AC-16 and AC-17 row and manual step 9
EVIDENCE: AC-17 (line 250) covers `link`, `unlink` and `remove`. Its only planned check is "A fake case whose stand-in installer outlives an installer limit the test shortens to 2 seconds asserts that `link` exits 1" (line 260). That case runs `link` through the macOS `stop.sh` stand-ins. No case runs `unlink` or `remove`. On Windows the installer detection and the 120-second give-up are in `stop.ps1`, which "is checked live only, because the snippets need `Get-CimInstance`". Manual step 9 (line 271) runs a 60-second stand-in, which is shorter than the 120-second limit. So the Windows give-up branch never runs in any planned check. A passing subset does not meet a composite criterion, so an implementation review would have no executed evidence for those clauses.
PROPOSAL: Add the give-up case through `unlink` to the fake tests. Add a Windows variant of step 9 with a stand-in that runs longer than 120 seconds, and record exit 1, the "run it again" message and the app left stopped. Otherwise, narrow AC-17 to what is checked.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, step 2, step 5 and the lost-window paragraph; Acceptance Criteria, AC-05 and AC-06
EVIDENCE: Step 2 (line 188) says "the CLI waits 3 seconds and launches it again, up to three launches in all". AC-05 says "up to two of three debug launches", AC-06 says "one of every three debug launches answers", and line 198 says "a debug launch that fails three times". These read as a limit for each debug launch. The text "in all" reads as a limit for the whole command. Step 5 ("debug-launch the app once more", line 191) and the lost-window paragraph ("debug-launches the app again", line 198) do not say whether those launches retry. The Design reports early exits on the Mac in 3 of about 9 runs. Under a command-wide limit of three, one early exit in step 2 followed by two checks after a restart uses up the limit, and the result is the AC-16 exit inside AC-06's premise. The Design also gives no limit and no outcome for a debug launch whose app keeps running but never answers. That happens when `open -a` (launch.sh:4) only activates an instance that started after the check before launch. The code's `LaunchTimeout` of 60 seconds (clientapp.go:39, cdp.go:23-38) is not in the Design, and the retry covers only an app that exits.
PROPOSAL: State that every debug launch (step 2, after a lost window, and each check after a rollback) gets up to three attempts. State that an attempt also fails when the page has not answered within a named time while the main process runs. In that case the CLI quits and waits before the next attempt.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-17; Design, Desktop app entry, step 5
EVIDENCE: AC-17 (line 250) says "during a rollback, the message also names the kept copy AC-16 describes". Step 5 (line 191) says "A force-stop or an installer that does not finish during a rollback leads to one of these two messages, with its reason added". So when a check after a restart has already confirmed the restore and the following quit and wait gives up on an installer, the Design gives the "restored" message with no copy. When the app had no host list, AC-16 itself says "no copy is written". In both cases AC-17's wording contradicts the Design.
PROPOSAL: Word AC-17 as "during a rollback, the message is one of the two step 5 gives, with this reason added". Another option is "during a rollback whose restore is not confirmed, the message also names the kept copy AC-16 describes".

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: Two cases assert debug launches "at least the shortened settle time apart" (line 260). The Design does not name the 3-second wait between debug launches ("the CLI waits 3 seconds and launches it again", line 188). In the code, `SettleDelay` is the 4-second wait after a reload ("SettleDelay lets the reloaded app load and rewrite its registry", clientapp.go:36-37). A test written against `SettleDelay` would check the wrong wait.
PROPOSAL: Name the 3-second wait between debug launches in the Design and use that name in the Test Plan, or write "the shortened 3-second wait between debug launches".

### R-30

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-06; Design, Desktop app entry, step 5; Test Plan, AC-05, AC-06, AC-16 and AC-17 row and manual step 5
EVIDENCE: AC-06 (line 239) limits its premise to five conditions: the window is lost at most twice, the restored list is deleted at most once, each install ends within 2 minutes, each debug launch answers within three attempts and each forward opens. A force-stop is not one of them. Step 5 (line 191) expects a force-stop during a rollback and says it "leads to one of these two messages", which can be the unconfirmed one. Step 5 justifies its 8-second wait only by "Chromium's default 5-second localStorage commit delay" and adds that "only a graceful shutdown flushes pending writes". Manual step 5 (line 271) cites "the 60-second commit delay seen on the Mac", and neither Context nor Design states or cites that delay. On the Mac, an app that does not quit within 20 seconds is force-stopped about 28 seconds after the restore write, so the restore is lost. The check after a restart restores and repeats only once. A second force-stop therefore ends in the AC-16 exit while every AC-06 condition holds, which contradicts AC-06's "lists exactly the hosts it listed before". This can happen in practice: the fake models such an app (`stuck`, fakedevtools_test.go:46-47, :79), and T31 recorded a real force-stop on Windows. No Test Plan case runs a rollback with a force-stop. `TestForceStop` (clientapp_test.go:219-246) covers only a kept `link` and a kept delete.
PROPOSAL: Add to AC-06's bound that each quit is graceful within 20 seconds, and leave the force-stopped paths to AC-16. Otherwise, make the Design survive a force-stop. Either way, state the Mac's 60-second commit delay and its source in step 5, and add a fake case that rolls back with an app that ignores the graceful quit.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, lost-window paragraph; Acceptance Criteria, AC-05; Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: Line 198 says that when the window stops answering "after a reload in step 4", the CLI debug-launches again and "continues with the read that follows the reload". If the app kept the entry, `link` then succeeds. Every planned lost-window case in the Test Plan (line 260) is a rollback, where "each asserts a non-zero exit". No case loses the window after the step 4 reload of an entry the page keeps. At 62c578b, `write()` returns an error when the page is gone after the reload (clientapp.go:275-277). An implementation that rolls back or fails on any lost window therefore passes every planned test, although the Design says `link` should succeed. AC-05 (line 238) bounds the installer and the debug-launch attempts but says nothing about a lost window, so no criterion states the end state for this path either. R-23 F-03 saw the Mac debug instance die right after a reload. Line 198 also assumes the third loss happens inside a rollback ("Every rollback that ends without a confirmed restore, including a window lost a third time"). It does not say what happens when the third loss comes in step 4, before the CLI knows whether the app kept the change.
PROPOSAL: Add a fake case where the page keeps the entry and stops answering once after the step 4 reload, and assert exit 0, the entry, the tunnel and a second debug launch. Add "a window lost after a reload at most twice" to AC-05's bound, and state in the Design that a third loss in step 4 ends like an unconfirmed rollback.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: Line 260 reads: "A case whose stand-in installer starts the app as it ends asserts that `link` exits 0, that the CLI quit the app again before its debug launch and that the debug launch answered; the `unlink` case also asserts a second debug launch after the rollback, for the check after a restart." Placed there, "the `unlink` case" reads as an `unlink` variant of the installer case, which T39 does not list. The case it was written for (R-28 F-02) is "run `unlink` against a page that rejects the removal once". The second debug launch is the only assertion in that case the current code fails, and T39 requires each case to fail first.
PROPOSAL: Move the clause to the sentence that lists the further cases, and name the case: "the `unlink` case that rejects the removal once also asserts a second debug launch after the rollback".

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry, step 2
EVIDENCE: The owner chose option A for Q13 (dc69cbe, Open Questions): "when one has appeared, it quits and waits again, counted against the three-launch limit". Step 2 (line 188) now says "Before each attempt, the CLI checks that no app main process runs; when one has appeared, for example because an update install started the app again, it quits and waits again". It does not say whether this uses one of the three attempts. So the folded text does not settle whether an app that keeps reappearing can ever end the launch.
PROPOSAL: State whether an extra quit for an app that started again counts as one of the three attempts of that debug launch, as the Q13 answer says.

### R-31

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-06; Design, Desktop app entry, step 2 and the lost-window paragraph; Context, Owner summary
EVIDENCE: After R-30, AC-06 (line 239) applies only when "each quit completes gracefully within 20 seconds". Design step 2 (line 188) says "On Windows it stops the `Paseo` process, which holds none of the CLI's writes yet". At fcb3bea that quit is a force-stop. `stop()` passes `wait_ms` "0" for Windows in step 2 (plugins/paseo-hosts/internal/clientapp/clientapp.go:314-318), and stop.ps1:16-20 then runs `Stop-Process -Force` and prints `STOPPED=KILL`. No task changes this. Every Windows `link`, `unlink` and `remove` therefore has a quit that is not graceful, so AC-06's premise never holds on Windows. A Windows rollback that the CLI reports as "restored" but that comes back with no hosts would then contradict no criterion, because AC-16 covers only unconfirmed restores. The lost-window paragraph (line 198) has the same problem. It says the CLI "quits and waits" when the window stops answering, but on Windows the graceful quit is `window.close()` through DevTools, which a window that does not answer cannot run, and the Design does not say how that quit is done. The Owner summary describes AC-06 as covering "a window lost up to twice or a restore deleted once". It leaves out the bounds added since then, including the graceful-quit bound, which leaves force-stopped rollbacks to AC-16.
PROPOSAL: Limit the AC-06 bound to the quits after a registry write, for example "each quit after a registry write in step 5 or in a check after a rollback completes gracefully within 20 seconds", and say how the lost-window quit works on Windows. List all of AC-06's bounds in the Owner summary.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06, AC-16 and AC-17 row; Tasks, T39
EVIDENCE: T39 lists "a rollback with an app that ignores the graceful quit" among cases that each "fails against the current code on an assertion the Test Plan gives for it". The Test Plan (line 260) asserts only "exit 1 and one of the two step 5 messages with the force-stop reason added, and, when it is the unconfirmed one, a kept copy holding the previous registry". At fcb3bea, `write()` returns "the app on %s did not keep the change; its previous host list is restored" (clientapp.go:299). `session()` then force-stops the stuck app and returns exit 1 with "...; the app was force-stopped and may not have saved the restored host list, so run the command again" (clientapp.go:209-215). The fake's `stuck` app ignores a graceful quit only while it is debuggable (fakedevtools_test.go:79). A kill keeps writes older than the 100 ms `commitDelay` (fakedevtools_test.go:66, :164), and the tests wait a 300 ms `CommitDelay` (clientapp_test.go:28). So the restore survives, the current code gives the "restored" message with a force-stop reason and exit 1, and the conditional kept-copy assertion never comes into play. The existing rollback test checks only that the error contains "restored" (clientapp_test.go:210). The case can pass before T40. The disjunction also allows either outcome, although the fake's timing fixes which one happens.
PROPOSAL: Name the expected outcome for the fake's timing and assert something only the new code does. For example, assert a second debug launch after the rollback (the check after a restart) and the confirmed message without "may not have saved". Another option is to make the fake's commit delay longer than the CLI's wait, so the restore is lost, and assert the restore after the restart or the kept copy.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, step 2 and the lost-window paragraph; Acceptance Criteria, AC-05, AC-06 and AC-16
EVIDENCE: The lost-window paragraph (line 198) says that after a window is lost after the step 4 reload, the CLI "debug-launches the app again and continues with the read that follows the reload". Step 2 (line 188) gives this debug launch up to three attempts. The Design gives an outcome when all three attempts fail in step 2 ("nothing has been written yet ... exits 1 with the host list unchanged") and inside a rollback ("Every rollback that ends without a confirmed restore, including ... a debug launch that fails three times and a failed forward, exits 1 with the message step 5 gives"). It also covers a third lost window in step 4. It gives no outcome when the relaunch after a window lost in step 4 fails all three attempts, or its forward does not open. At that point the registry has been written and the CLI does not know whether the app kept the change, so it is not a rollback. No criterion covers that end state. AC-05 is bounded to "up to two of the three attempts", AC-06 needs a change the app did not keep, and AC-16 names only an unconfirmed rollback or a third lost window. The Design itself reports early exits on the Mac in 3 of about 9 runs and a debug instance that died right after a reload (R-23 F-03), so this path is reachable. No Test Plan case covers it.
PROPOSAL: State that a debug launch or forward that fails after a window lost in step 4 ends like a third loss, with the backup copy kept, named and exit 1. Add that path to AC-16's wording and add a fake case for it, for example a page that stops answering after the step 4 reload followed by three early exits.

### R-32

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-05; Design, Desktop app entry, lost-window paragraph and step 4; Context, Owner summary
EVIDENCE: AC-05 (line 238) says `link` succeeds "when its window stops answering after a reload at most twice". It does not require that the quit after that lost window is graceful. The lost-window paragraph (line 198) says: "On Windows, where `window.close()` needs the page, it stops the `Paseo` process, which counts as a force-stop." On macOS it uses the AppleScript quit "as in step 5", and step 5 force-stops the app when it has not quit after 20 seconds. Step 5 (line 191) says "only a graceful shutdown flushes pending writes" and gives the Mac's measured commit time as "between 0.25 and 60 seconds after the write". So after a force-stop that follows a lost window, the step 3 write can be gone. The CLI then "continues with the read that follows the reload", and step 4 (line 190) says that when the entry is gone it restores the previous value "and fail[s]". On Windows every lost window takes this path, and the result is a `link` that exits 1 inside AC-05's stated bound. AC-06 does not cover this path either: its bound now needs "each quit after a registry write" to be graceful, and on Windows a lost window always fails that bound. The Owner summary still says AC-06 applies "when the window is lost at most twice". No Test Plan case loses the window with a force-stop. The lost-window case where the page keeps the entry (line 260) runs on the macOS fake, which quits gracefully because `stuck` is unset (fakedevtools_test.go:79).
PROPOSAL: Add "each quit after a registry write completes gracefully" to AC-05's bound and give the end state beyond it. Another option is for the Design to write the change again after a force-stopped lost window, instead of treating a missing entry as a rejection. In the Owner summary, say that on Windows a lost window falls outside AC-06.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: The row (line 260) plans "A rollback with an app that ignores the graceful quit, and a fake commit delay longer than the CLI's wait so that each force-stop loses the restore". That case asserts "the unconfirmed message with the force-stop reason added and a kept copy holding the previous registry". In the fake, a launch copies the committed store (`a.live = maps.Clone(a.committed)`, fakedevtools_test.go:150). A kill commits nothing unless the last write is older than the commit delay (`if graceful || time.Since(a.lastWrite) >= a.commitDelay`, :163-164), and the page's own drop on reject counts as a write (:394, :401). So with a commit delay longer than the CLI's wait, the force-stop throws away the entry write, the app's drop and the restore together, and the stored value stays the list from before the command. The check after the restart (Design step 5, line 191) then reads a registry that matches the backup. It ends with the "previous host list is restored" message and no copy, and that check writes nothing, so its own force-stop loses nothing. A correct implementation would fail this case as written. The Test Plan does not say that the fake must commit the app's drop while losing the restore.
PROPOSAL: Say how the fake keeps the app's drop and loses only the restore, for example by committing each write on its own after the delay, with the drop committed. Otherwise, assert the confirmed message with the force-stop reason and a second debug launch.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-16; Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: AC-16 (line 249) names three triggers that happen before the CLI knows whether the app kept the change: it "loses the window a third time or cannot debug-launch the app or open its forward after a lost window". The Test Plan (line 260) covers the third lost window ("make the page stop answering after every reload") and the failed launch ("a window lost after the step 4 reload followed by three failed attempts"). No case makes the forward fail after a lost window, and no case makes any forward fail at all. A passing subset never upgrades a composite criterion, so an implementation review would have no check for that clause of AC-16.
PROPOSAL: Add a fake case where the forward after a window lost in step 4 does not open, for example through a stand-in `ssh -L` that exits. Assert exit 1 and a named copy holding the previous registry. Otherwise, drop the forward clause from AC-16.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, lost-window paragraph and quit and wait; Acceptance Criteria, AC-16 and AC-17
EVIDENCE: The lost-window paragraph (line 198) says that after a window lost in step 4 "the CLI quits and waits". It lists the outcomes that "come before the CLI knows whether the app kept the change and end like an unconfirmed rollback": a third loss, a debug launch whose three attempts fail, and a forward that does not open. Quit and wait (line 194) can also give up on an installer at that point: "the command does not start the app and exits 1, saying to run it again". Only "during a rollback" does step 5 add a kept copy. So a window lost in step 4, followed by an update install longer than 2 minutes, leaves the app stopped in an unknown state, writes no copy and tells the owner to run the command again. AC-17 asks only for exit 1 and the stopped app, and AC-16 does not name this path. A re-run then overwrites `app-registry-<client>.backup.json` (step 3, line 189), which is the loss the kept copy was added to prevent (R-25 F-04).
PROPOSAL: Add an installer give-up after a window lost in step 4 to the paths that end like an unconfirmed rollback. Name it in AC-16, or in AC-17 with the kept copy, and add a fake case for it.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Tasks, T39, T40 and T41
EVIDENCE: T39 (line 356) includes "an installer that starts the app as it ends". The Test Plan asserts "that the CLI quit the app again before its debug launch". T40 (line 357) needs "T39 and `go test -race ./...` pass". At 21dcbc3, `stop.sh` returns as soon as the main process is gone (snippets/stop.sh:13-20) and does not wait for an installer. The 3-second floor and the installer wait arrive only in T41 (line 358). So after T40 alone, the CLI debug-launches while the stand-in installer still runs. The fake starts the app with the debugging port, and the installer's later start is ignored because the app already runs (fakedevtools_test.go `handleLaunch`, `if !a.running`). The "quit again" assertion fails, so T40's done condition cannot hold until T41.
PROPOSAL: Move the installer case to T41's done condition, or order T41 before T40.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: The summary (line 33) says "AC-05 now covers an update installed on quit". AC-05 (line 238) also gained two cases where `link` must still succeed: "when the app exits or does not answer on up to two of the three attempts of a debug launch, and when its window stops answering after a reload at most twice". The standard asks the summary to "Explain material changes since the last accepted scope".
PROPOSAL: Add AC-05's debug-launch and lost-window cases to the summary sentence on what changed.

### R-33

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06, AC-16 and AC-17 row; Acceptance Criteria, AC-05; Design, Desktop app entry, step 5
EVIDENCE: The row (line 260) plans "A case whose page keeps the entry, stops answering once after the step 4 reload and ignores the graceful quit, with that long commit delay, asserts exit 0, the entry, the tunnel and a second write of the change". "That long commit delay" is defined earlier in the same row as one "so that each force-stop loses every write since the launch". The fake's `stuck` flag ignores every graceful quit while the app is debuggable, not just one (`if a.running && (!a.stuck || a.debugPort == "")`, plugins/paseo-hosts/internal/clientapp/fakedevtools_test.go:76-80). Its kill keeps nothing newer than `commitDelay` (:163-164). The step 5 quit after the second write therefore also ends in a force-stop, and that force-stop loses the rewritten entry. The relaunched app copies the committed store (`a.live = maps.Clone(a.committed)`, :150), and the fake reports tunnels only from that store (:192-212). So no tunnel appears. Design step 5 (line 191) says "after a force-stop, `link` succeeds only if step 6 confirms the tunnel". An implementation that follows the Design exits 1 here, and the case as written fails it. The same path shows that AC-05 (line 238) has no bound for a step 5 quit that is not graceful. On the Mac, step 5 measures commits "between 0.25 and 60 seconds after the write", and a force-stop comes about 28 seconds after the write. So a `link` that stays inside every AC-05 bound can exit 1 with the app missing the entry, which contradicts AC-05. R-32 F-01 raised this for the lost-window quit, and the Design's new rewrite covers only that quit.
PROPOSAL: Make the stand-in app ignore only the quit after the lost window, or expect exit 1 with the force-stop reason for this case. Also add "the quit in step 5 completes gracefully" to AC-05's bound and state the end state outside it: exit 1 and a message that the app may not have saved the change.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, lost-window paragraph; Acceptance Criteria, AC-05; Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: The lost-window paragraph (line 198) says: "When that quit was a force-stop, the step 3 write may be lost with it, so if the read in step 4 finds the registry still matching the backup, the CLI writes the change again once, as in step 3, and reloads as in step 4 before it judges whether the app kept it". On Windows, every lost window is a force-stop ("it stops the `Paseo` process, which counts as a force-stop"). AC-05 (line 238) promises success "when its window stops answering after a reload at most twice". Take this Windows sequence: the window is lost after the step 4 reload and the force-stop loses the write; the CLI rewrites the change and reloads; the window is lost a second time and that force-stop loses the write again. If "once" means once per command, the read then matches the backup, the CLI judges the change not kept, rolls back and exits 1. That stays inside AC-05's bound. The text does not say whether "once" means per command or per lost window. No Test Plan case loses the window twice with a kept entry and a force-stop.
PROPOSAL: State that the CLI writes the change again after each force-stopped lost window, up to the limit of two lost windows. Add a fake case with a kept entry that loses the window twice, each time with a force-stop that loses the write, and assert exit 0. Otherwise, narrow AC-05's bound to one force-stopped lost window.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05, AC-06, AC-16 and AC-17 row; Tasks, T39 and T40; Acceptance Criteria, AC-16
EVIDENCE: The row (line 260) says "make the page stop answering after two reloads" for a rejected entry, and asserts a non-zero exit and "the restored registry after the restart". It also lists "make the page stop answering after every reload" as an AC-16 case, which asserts "a message naming the kept copy". Under the Design, a rejected `link` with graceful macOS quits reloads only twice: once in step 4, then once in the first restore. After the second lost window, the CLI relaunches and "continues with the read that follows the reload" (line 198). That read finds the restore. Each quit committed the live store (`stop(true)`, fakedevtools_test.go:162-165), so the read matches the backup. The check after a restart (line 191) reads without a reload. No third reload happens, so "after every reload" behaves the same as "after two reloads". A correct implementation gives the "restored" message and no copy, so it fails this case, and T40 ("T39 and `go test -race ./...` pass") cannot hold without departing from the Design. For the same reason, AC-16's trigger "after a lost window and before it knows whether the app kept the change, loses the window a third time" (line 249) cannot happen: no reload follows a read that comes after a lost window before the CLI judges the change.
PROPOSAL: Make that case lose the window on every reload and also delete each restored value, so that a third reload happens inside the rollback. Or assert the confirmed restore and drop the case as a duplicate. Remove from AC-16 the third-loss trigger that comes before the CLI judges the change, or name a sequence that reaches it.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry, step 5 and "To restore"
EVIDENCE: Step 5 (line 191) gives the Mac's commit timing as "between 0.25 and 60 seconds after the write ... as measured during the R-23 investigation". The restore paragraph says "the Mac app's localStorage log showed" the write and the delete committed in one batch. Neither names the command or its output, and the R-23 records stored in this document hold neither measurement. feature-documents.md asks Context and Design to cite "a `file:line`, or a command and its output, gathered when the claim was written". The 60-second figure is the basis for the 90-second wait in manual step 5 and for the force-stop reasoning in AC-05 and AC-06.
PROPOSAL: Name the probe and the log the measurements came from: the command, the client and app version, and the observed range or the batch record.

### R-34

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, lost-window paragraph; Acceptance Criteria, AC-05; Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: The lost-window paragraph (line 198) rewrites the change only "When that quit was a force-stop": "the step 3 write may be lost with it, so if the read in step 4 finds the registry still matching the backup, the CLI writes the change again". Step 5 (line 191) says "only a graceful shutdown flushes pending writes". The lost window actually seen on the Mac was an app process that ended by itself. R-23 records "the debug instance then vanished" (AC-06 evidence) and "the debug instance died right after the reload in both rollback runs" (R-23 F-03). In that case the CLI's quit finds no process (stop.sh:13-15 prints `STOPPED=none`), so the quit is neither graceful nor a force-stop. The Design does not say how to treat it. The step 3 write is about 4 seconds old at the reload, which is less than the 5-second minimum commit delay. If the exit was not a clean shutdown, the write is gone. The read then matches the backup, no rewrite happens, step 4 judges the change not kept, and `link` rolls back and exits 1. That stays inside AC-05's bound (line 238): the window was lost once and the step 5 quit was graceful. In every planned lost-window case (line 260) the app process keeps running and the CLI then quits it gracefully or force-stops it. No case has an app that exits by itself after a reload.
PROPOSAL: Rewrite the change whenever the read after a lost window matches the backup, unless the CLI saw the app quit gracefully. This covers an app that had already exited and one that was force-stopped. Add a fake case where the app process exits by itself after the step 4 reload and drops its uncommitted writes, with an entry the page keeps, and assert exit 0, the entry and a second write.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-05; Design, Desktop app entry, lost-window paragraph
EVIDENCE: AC-05 (line 238) bounds success by the installer limit, the debug-launch attempts, at most two lost windows and a graceful step 5 quit. It does not require that each forward opens. AC-06 (line 239) does include "each forward opens". The lost-window paragraph (line 198) says that after a window lost in step 4, a forward that does not open "ends like an unconfirmed rollback: the CLI keeps a copy of the backup, names it, adds the reason and exits 1". So a `link` whose entry the app kept can exit 1 inside every bound AC-05 states.
PROPOSAL: Add "each forward opens" to AC-05's bound, as AC-06 has it.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Tasks, T39, T40 and T41
EVIDENCE: T39 (line 356) includes "a first debug launch whose app exits before it answers" and "three debug launch attempts that all exit early". The Test Plan (line 260) checks that their attempts are "at least the quit-and-wait floor apart, as the test shortens it". T40 (line 357) requires "T39 and `go test -race ./...` pass". T40 does not mention that floor. It arrives only in T41 (line 358): "quit and wait waits at least 3 seconds". At 9a173ef, stop.sh returns as soon as the main process is gone (snippets/stop.sh:13-20), and clientapp.go has no wait between attempts and no floor variable a test could shorten (clientapp.go:29-40). So T40's done condition cannot hold before T41. R-32 F-05 found the same ordering problem for the installer case.
PROPOSAL: Move the two floor assertions to T41's done condition, or have T40 add the wait between attempts and the variable that names it.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Document structure (no Sources section); Design, Desktop app entry, step 5; Test Plan
EVIDENCE: feature-documents.md says "Sources lists every external page read, each with the claim it supports". The document cites external pages it read: Chromium `local_storage_impl.cc` and `kCommitDefaultDelaySecs` (line 191), runner-images `Ubuntu2404-Readme.md` (Test Plan intro), the getpaseo/paseo v0.15.4 release (Background) and `michielvha/logger` `logger.go:55` (Background). `grep -n "Sources"` finds only matches inside stored review records, and the document has no Sources section.
PROPOSAL: Add a Sources section at the end that lists those pages, each with the claim it supports.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Terms; Acceptance Criteria, AC-13; Tasks, T43
EVIDENCE: The revision adds user-facing concepts that the owner must act on: the app backup `app-registry-<client>.backup.json` and its kept, timestamped copy (step 5, line 191; AC-16, line 249). T43 puts them into the README and the skill, and the skill must "stop" when "a command names a kept copy of the app backup" (Design, Skill). The standard says "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion." The Terms table (lines 108-119) has no row for either term, so AC-13 holds no wording for them.
PROPOSAL: Add Terms rows for the app backup and the kept copy, so that AC-13 covers how the README, skill and CLI messages name them.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary
EVIDENCE: The Owner summary (lines 25-37) runs to 651 words, and its "What changed" paragraph (line 33) is 284 words. One sentence of that paragraph, starting "AC-05 now covers an update installed on quit", is 147 words long and walks through AC-05, AC-06, AC-16 and AC-17 together. The standard asks for "a few short paragraphs" and says 250 to 400 words is usually enough.
PROPOSAL: Split that sentence into one short sentence per criterion, and leave the detailed bounds to the criteria themselves.

### R-35

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-06; Design, Desktop app entry, lost-window paragraph; Test Plan, AC-05, AC-06, AC-16 and AC-17 row
EVIDENCE: AC-06's bound (line 241) includes "each quit after a registry write completes gracefully within 20 seconds". This commit's lost-window paragraph (line 200) says that "Unless the CLI saw the app quit gracefully" the write may be lost, because "the app was force-stopped, or it had already exited by itself and the quit found no process". So by the Design's own terms, an app that exits by itself after a reload is not a graceful quit. That is the Mac failure R-23 measured in rollback runs: "the debug instance died right after the reload in both rollback runs" (R-23, line 131 of that subsection), and "the debug instance then vanished" after the app dropped the registry. Read literally, AC-06 now excludes the rollback failure this revision exists to fix. The live Mac rollbacks in manual step 5 and T44 also cannot be judged when the app exits by itself: such a run is neither clearly inside AC-06 nor clearly outside it. The only self-exit case in the Test Plan (line 262) is "a case whose page keeps the entry and whose app exits by itself right after the step 4 reload", which is a `link` that succeeds. No fake case puts a self-exit inside a rollback. In a rollback, the new rule also writes the rejected entry again when the read matches the backup.
PROPOSAL: State in AC-06 and the lost-window paragraph that an app that exits by itself after a reload counts as a lost window within the limit of two, and that the "quit after a registry write" in the bound means the CLI's own quits. Add a fake rollback case in which the app exits by itself after the step 4 reload and loses its uncommitted writes. It should assert a non-zero exit, a second write, and the previous registry after the relaunch that ends the command.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary, "What changed" paragraph
EVIDENCE: This commit added "each forward opens" to AC-05's bound (line 240: "as long as each forward opens and the quit in step 5 completes gracefully within 20 seconds"). The summary (line 33) still says "AC-05 now covers an update installed on quit, debug launch attempts that fail up to twice and a window lost up to twice, as long as the quit after the write is graceful". For AC-06 it does list "each forward opens".
PROPOSAL: If Q15 keeps the bounds in the summary, add "each forward opens" to the AC-05 clause. If Q15 option A is chosen, the new AC-05 sentence covers this.

### R-36

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, quit and wait (line 196); Test Plan, manual step 9 (line 273); Tasks, T41 and T44
EVIDENCE: Quit and wait says "On Windows the installer is any process whose executable is under `%LOCALAPPDATA%\@getpaseodesktop-updater\`". It gives no citation. The macOS rule, "the Squirrel.Mac `ShipIt` process whose arguments name the job `sh.paseo.desktop.ShipIt`", has none either. `grep -n getpaseodesktop-updater` finds the path only at line 196, in manual step 9 and in R-24 F-03's proposal. No measurement in the document places the real Windows installer there. R-23 F-02 records only that "the installer then rewrote the install directory at 15:52:04 and left no Paseo.exe running". The Windows wait is "checked live only". Its only planned live check is step 9, which puts a stand-in `ping.exe` under that same directory. So step 9 shows that the CLI detects a process at the path it already assumes. It does not show that Paseo's real updater runs from there. If the real installer runs from somewhere else, every planned check still passes. T44 then only records "whether a real update was pending", and the R-23 Windows failure remains: `link` relaunches the app during the install, the step 6 check runs at once and passes, and the installer then leaves the app stopped.
PROPOSAL: Cite where the updater directory comes from, for example the `updaterCacheDirName` in the installed app's `resources\app-update.yml` or a process listing taken during R-23, and cite the ShipIt job name the same way. Add a step to manual step 9 and T44 that reads that value on win-main and records that it matches the path `stop.ps1` checks.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-06 (line 241); Design, Desktop app entry, step 2 (line 190) and quit and wait
EVIDENCE: AC-06's bound includes "each debug launch answers within three attempts" and "each quit the CLI makes after a registry write completes gracefully within 20 seconds". Step 2 says that on Windows the CLI "stops the `Paseo` process". Every later quit and wait reuses that quit. It applies when "the page has not answered after 60 seconds" on an attempt, and when an app main process "has appeared, for example because an update install started the app again". In the check after a rollback, both happen after a registry write. On Windows both are force-stops of an instance that holds none of the CLI's writes. Read literally, one failed attempt in that check on Windows takes the run outside AC-06, although the same criterion allows up to two failed attempts. AC-16 does not cover that run either, so nothing states its outcome. The force-stop does not cause the risk the bound guards against, a write lost because the app had not committed it.
PROPOSAL: Limit the graceful-quit bound in AC-06 to quits of an app instance the CLI wrote to since its launch, which are the lost-window quit and the step 5 quit. Or state that quitting an instance that never answered, or that the CLI did not write to, does not count.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary, "What changed" paragraph (line 33)
EVIDENCE: The summary bounds AC-06 by "each quit after a registry write is graceful, so on Windows, where a lost window is force-stopped, that path falls outside AC-06". This commit changed AC-06 to "each quit the CLI makes after a registry write" and added "or the app exits by itself after a reload". The lost-window paragraph now says an app that exits by itself "counts as a lost window", and that in that case "the quit found no process". So on Windows, a window lost because the app exited by itself is not force-stopped, and the run stays inside AC-06. The summary still describes the bound from before R-35, which R-35 F-01 found excludes the self-exit failure.
PROPOSAL: Whatever Q15 decides about length, say "each quit the CLI makes", and limit the Windows remark to a window that stops answering while the app keeps running.

### R-37

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-05 (line 240); Design, Desktop app entry, step 2 (line 190)
EVIDENCE: Step 2 says "Before each attempt, the CLI checks that no app main process runs; when one has appeared, for example because an update install started the app again, it quits and waits again, and that uses one of the three attempts." AC-05 promises success "when the app exits or does not answer on up to two of the three attempts of a debug launch". Take a `link` in which an update install starts the app again before the first attempt, so that attempt is used, and the app then exits early on the other two. Under the Design all three attempts are used and none answered, so the command exits 1. The app exited on only two of the three attempts, so AC-05 promises success. AC-06 states the bound as "each debug launch answers within three attempts", which matches the Design.
PROPOSAL: Use AC-06's wording in AC-05 ("each debug launch answers within three attempts"), or have AC-05 say that quitting an app that has started again uses one of the three attempts.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Desktop app entry, quit and wait (line 196); Test Plan, manual step 9 (line 273); Tasks, T41 and T44
EVIDENCE: Quit and wait fixes the installer identity as the job `sh.paseo.desktop.ShipIt` and the directory `%LOCALAPPDATA%\@getpaseodesktop-updater\`, and T41 builds both into `stop.sh` and `stop.ps1`. Configuration pins only the Paseo CLI (`PASEO_HOSTS_VERSION`, line 146). The desktop app updates itself: R-23 saw Windows go from 0.15.3 to 0.15.4 during a run. The document's own citations show that both values come from the app's build settings. Squirrel.Mac takes the label from `NSBundle.mainBundle.bundleIdentifier` (`SQRLDirectoryManager.m`, `currentApplicationManager`, used by `SQRLShipItLauncher.shipItJobLabel`). electron-updater takes the directory from `updaterCacheDirName` in `app-update.yml`. The live check that R-36 added to step 9 and T44 compares those values with the snippets once. If a later app release changes either value, the wait stops seeing the installer without any error, and the R-23 race comes back. The document picks fixed values over reading them at run time from the client's installed app and does not raise that choice as a question.
PROPOSAL: Have the stop snippets read `CFBundleIdentifier` from the app's `Info.plist` and `updaterCacheDirName` from `resources\app-update.yml` on the client at run time, keeping the current values as fallbacks. Otherwise raise the choice as an open question.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan, manual step 9 (line 273); Tasks, T44 (line 363)
EVIDENCE: T44 records "the updater directory and `ShipIt` job read from each installed app". Step 9 reads the Mac value from "the bundle identifier in `ShipItState.plist`", and that file is under `~/Library/Caches/sh.paseo.desktop.ShipIt/`, not in the installed app. In `SQRLShipItLauncher.m`, the launcher writes the state file and starts ShipIt only when an update is ready to install (`SQRLUpdater.m`, `_shipItLauncher`). A Mac with no update staged may not have the file, so the step cannot always be done as written. The label comes from the main bundle's identifier (`SQRLDirectoryManager.m:22`, `NSBundle.mainBundle.bundleIdentifier`), which is `CFBundleIdentifier` in `Paseo.app/Contents/Info.plist`.
PROPOSAL: In step 9 and T44, read `CFBundleIdentifier` from the installed app's `Info.plist` on the Mac. Then cite `SQRLDirectoryManager.m` for how the label is derived, next to `SQRLShipItLauncher.m`.

### R-38

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, manual step 9 and the AC-05, AC-06, AC-16, AC-17 row; Tasks, T41 and T44; Design, quit and wait
EVIDENCE: Q16 was folded in as "the CLI reads the installer's name from the installed app on each run and uses today's value only when it cannot read it". The AC-05 row says "The Windows installer wait ... checked live only". The only check of the Windows read is step 9. That step places the stand-in "under `%LOCALAPPDATA%\@getpaseodesktop-updater\`", which is also the fallback value. If the `app-update.yml` read fails and the fallback is used, step 9 still passes, so no check can tell a working read from the fallback. Step 9 and T44 also require recording "that they are the values the stop snippets read". Nothing makes the snippets report the value they used. At 1350926, `internal/clientapp/clientapp.go` returns only `out.Values["STOPPED"]` from `stop.sh`/`stop.ps1`, and the only debug log of a remote call is `internal/remote/remote.go:87`, which logs the command and not the snippet's output. The Design cites the real file as `updaterCacheDirName: '@getpaseodesktop-updater'`, with single quotes. If the read keeps the quotes, the snippet gets a value that names no directory. That does not count as "cannot read it", so the fallback is never used. The wait then sees no installer, the R-23 race comes back, and no error is shown.
PROPOSAL: Have both stop snippets print the installer name they used and where it came from (for example `INSTALLER=<name>` and `INSTALLER_SOURCE=file|fallback`). Have step 9 and T44 record `file` on each desktop. Say in Design that the snippet strips YAML quotes from `updaterCacheDirName`, and test that parse in a `pwsh` test of a stand-in `app-update.yml`, apart from the `Get-CimInstance` part.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Desktop app entry steps 2 and 5, and quit and wait
EVIDENCE: Q16's reason is that a fixed name could go stale after an app update. The design now reads `CFBundleIdentifier` for the `ShipIt` match only. The macOS quit still uses a fixed id: `internal/clientapp/snippets/stop.sh:16` runs `osascript -e 'tell application id "sh.paseo.desktop" to quit'`. In `clientapp.go` `stop()`, the step 5 quit (wait > 0) falls back to `KILL`. If the identifier changed, the AppleScript quit would fail with no message, and every step 5 quit would become a force-stop after 20 seconds. `link` would then succeed only if the tunnel appears, and rollbacks would fall outside AC-06.
PROPOSAL: Have `stop.sh` use the identifier it reads from `Info.plist`, with the same fallback, for the AppleScript quit too. Alternatively, record in Design that the quit keeps the fixed id and explain why.

### R-39

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Test Plan, manual step 9 (line 273); Tasks, T44 (line 363)
EVIDENCE: Step 9 says "On each desktop, also read `updaterCacheDirName` from the installed app's `app-update.yml`, and on the Mac `CFBundleIdentifier` from `Paseo.app/Contents/Info.plist`, and record from the CLI's debug log at `LOG_LEVEL=debug` that the stop snippet printed `INSTALLER_SOURCE=file` and an `INSTALLER` naming those values." T44 records "the updater directory and `ShipIt` job read from each installed app and the debug log showing `INSTALLER_SOURCE=file` and those values on each desktop". Quit and wait (line 196) uses `updaterCacheDirName` only on Windows and the `<identifier>.ShipIt` job only on macOS, and "Each stop snippet prints `INSTALLER=<job or directory>`", so each desktop prints one value. Read literally, the pass condition asks the Mac's `INSTALLER` to name the updater directory as well, and `stop.sh` never prints it. The Mac app may also have an `app-update.yml` the CLI ignores, so "on each desktop" does not make the step fail for a missing file. It only leaves the pass condition open to two readings.
PROPOSAL: In step 9 and T44, read `updaterCacheDirName` on Windows and `CFBundleIdentifier` on the Mac. Require each desktop's `INSTALLER` to be its own value: `<directory>` on Windows and `<identifier>.ShipIt` on the Mac.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Tasks, T41 (line 360); Test Plan, AC-05, AC-06, AC-16, AC-17 row (line 262) and the stand-in list above the table; Design, quit and wait (line 196)
EVIDENCE: The row requires a `stop.sh` test with "a stand-in `Info.plist` naming `test.paseo.other`" that asserts "that the AppleScript quit names `test.paseo.other`, and that it prints `INSTALLER_SOURCE=file`". The `osascript` stand-in fails every script that does not name the current id: `internal/testenv/standins.go:1004` has `if !strings.Contains(script, `"sh.paseo.desktop"`) ... return fail(1, "testenv osascript: unsupported script %q", script)`. Snippets run with only the stand-ins in `internal/testenv/testenv.go:40-56` and the real tools in `sysTools` (`:66-70`). Neither list has a plist reader such as `defaults`, `plutil` or `PlistBuddy`. The Design does not say how `stop.sh` reads `CFBundleIdentifier`. If it uses a macOS plist tool, the read fails under testenv and falls back, so the `INSTALLER_SOURCE=file` assertion cannot pass without a new stand-in. If it parses the file as text, it depends on the real `Info.plist` being XML, and the document does not cite the file's format. T41 lists `stop.sh`, `stop.ps1`, `clientapp.go`, `fakedevtools_test.go` and `clientapp_test.go`, but not `internal/testenv/standins.go`. The Test Plan's stand-in list names `osascript` and `open` but no plist reader.
PROPOSAL: State in Design how `stop.sh` reads `CFBundleIdentifier`, for example `plutil` or `defaults read`, which accept both plist formats. Add `internal/testenv/standins.go` to T41 for the plist-reader stand-in and an `osascript` stand-in that accepts the identifier it is given. Otherwise, cite that Paseo's `Info.plist` is XML and say the snippet parses it as text.

### R-40

NO FINDINGS

### R-41

CRITERION: AC-01 After `paseo-hosts onboard <alias>` on a server that meets the prerequisites, the server runs the pinned Paseo daemon as an enabled `paseo.service` user unit on loopback with the relay off, no Tailscale Serve route points at the daemon port, the server's Paseo config holds a bcrypt hash and no plaintext password, and the plaintext password is absent from the server and its only file on the operator host is in `PASEO_HOSTS_DIR` with mode 600.
VERDICT: met
EVIDENCE: Manual step 1 on arch-1, run after `remove arch-1`, with the release build of 4ae46e2. Fresh `onboard arch-1` exited 0 and reported "created the password". Over SSH I read the following. `systemctl --user show paseo.service` gave ActiveState=active and UnitFileState=enabled. `ss -ltn` showed a listener only on 127.0.0.1:6767. `tailscale serve status` had 0 lines for 6767. state/config.json had listen 127.0.0.1:6767, relay enabled False and an auth password starting `$2b$`. On arch-1, `grep -rlF -f /dev/stdin` with the password over ~/.local/share/paseo/state, runtime, ~/.config, ~/.ssh and /etc/systemd found no match (rc=1). On the operator host, `grep -rlF` over ~/.config, ~/.local/share, ~/.cache/paseo-hosts* and my scratch logs matched only ~/.config/paseo-hosts/arch-1.password, which has mode 600. The onboard tests in `go test -race ./...` pass. Limitation: the operator-host search did not cover all of $HOME.

CRITERION: AC-02 `onboard` succeeds only when a connection without a password is rejected and the stored password is accepted over the server's `PASEO_URL`. With `--publish`, the server also has exactly one tailnet-only HTTPS route to the daemon and its health endpoint answers.
VERDICT: met
EVIDENCE: Manual step 3 on arch-1. Every onboard printed "password required" and "stored password accepted". `onboard arch-1 --publish` exited 0. `tailscale serve status` then showed exactly one route to 127.0.0.1:6767: `https://arch-1.tail6948f.ts.net:8956 (tailnet only)`. curl to https://arch-1.tail6948f.ts.net:8956/api/health returned 200, and `verify` exited 0. TestVerificationFailsWhenTheDaemonAcceptsNoPassword and TestPublishAddsOneRouteAndARerunRemovesIt pass under `go test -race -count=1 ./...`.

CRITERION: AC-03 Running `onboard` again on an onboarded server, including one whose registry the local tool wrote with port 6867, keeps its password, daemon port, `PASEO_CLIENTS`, `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`, leaves one unit and at most one route, and passes verification. A `--listen-port` that differs from the recorded port exits 2 and changes nothing.
VERDICT: met
EVIDENCE: Manual step 2 on arch-1.
- Re-running `onboard arch-1` exited 0. The sha256 of arch-1.password stayed 69d75b097057 and the sha256 of arch-1.env stayed 9fb93566e3e5.
- `onboard arch-1 --listen-port 6868` exited 2 with "already runs on port 6767; linked clients name that port". The env sha was unchanged, nothing listened on 6868, and the unit's ActiveEnterTimestamp was unchanged.
- After `--publish` there was one route. A plain `onboard` then printed "removed the Serve route on port 8956", serve status had 0 lines for 6767, health no longer answered, and `verify` exited 0.
- The env file kept PASEO_CLIENTS=win-main,macbook-pro, PASEO_CLIENT_HOST and PASEO_CLIENT_PORT.
- The port 6867 local-tool case is covered only by TestRerunKeepsALocalToolRegistry, which passes.

CRITERION: AC-04 After `paseo-hosts link <alias>` with a macOS or a Windows client, the client's dedicated key opens a tunnel to the daemon port on the server, and the same key is refused a shell command, a forward to any other port and every TCP remote forward when the server user cannot bind port 1. The client trusts the server's host key under `PASEO_CLIENT_HOST` and `PASEO_CLIENT_PORT`. Running `link` again leaves one `authorized_keys` line for the key and one alias block on the client.
VERDICT: met
EVIDENCE: Manual steps 4 and 6, with the dedicated key on each desktop.
- From the Mac: a shell command exited 1. `-W 127.0.0.1:22` was "administratively prohibited". `-W 127.0.0.1:6767` returned HTTP/1.1 200. `-R 127.0.0.1:47123:127.0.0.1:6767` exited 255 with "remote port forwarding failed", and nothing listened on 47123 on arch-1.
- From Windows: a shell command exited 1. `-W 22` and `-L` to 22 were "administratively prohibited". `-R 47123` exited 255. `-L` to 6767 gave health 200.
- The alias block has HostName arch-1.tail6948f.ts.net, Port 22 and StrictHostKeyChecking yes.
- After repeated links, arch-1 holds exactly one line each for paseo-hosts:macbook-pro and paseo-hosts:win-main, and Windows ~/.ssh/config has one `Host paseo-arch-1`.
- The link tests pass, including the real sshd and port 2222 cases.

CRITERION: AC-05 After `link`, the Paseo desktop app on the client lists the server under its alias with a Remote SSH connection and the stored password, keeps every host it listed before, runs without a debugging port in the user's session, and has opened its SSH tunnel to the server, also when the app installs a downloaded update as it quits and the install ends within 2 minutes, when each debug launch answers within three attempts, and when its window stops answering or the app exits by itself after a reload at most twice, as long as each forward opens and the quit in step 5 completes gracefully within 20 seconds. When that quit is a force-stop, `link` succeeds only if the app's tunnel appears, and otherwise exits 1 saying the app may not have saved the change.
VERDICT: met
EVIDENCE: Release-build links on the Mac:
- Step 4: the app exited by itself after the reload, was recovered and kept the change.
- Step 9 with a 60 s ShipIt stand-in: the app did not start until the stand-in ended.
- Step 9 with a stand-in that runs `open -a`: the CLI logged "started again before its debug launch" and retried.
- The final link logged two graceful quits.
- Every one of these exited 0.

Release-build links on Windows: step 6, step 9 with a 61 s stand-in (the quit wait ended when the stand-in ended), and the final relink. Each exited 0.

After each link, I parsed the leveldb read-only and checked the processes:
- Mac: fedora-43 and arch-1, with arch-1 as `ssh:paseo-arch-1::`.
- PC: win-main, fedora-43 and arch-1. The parser shows labels, ids and connection ids only.
- 0 debug-port processes, and the `-W 127.0.0.1:6767 paseo-arch-1` tunnel present.
- An interactive task on Windows saw the Paseo window in session 1.
- No real update was pending: both desktops cache 0.15.4, which equals the installed 0.15.4.

The force-stop clauses rely on TestForceStop and TestStep5ForceStopLosesTheChange, which pass. One later win-main link hung before the app step (F-01); after I killed the hung remote process it exited 1, and a re-run exited 0.

CRITERION: AC-06 When the app does not keep a change from `link`, `unlink` or `remove`, its window stops answering or the app exits by itself after a reload at most twice in that command, it deletes the restored list at most once, any update it installs on a quit ends within 2 minutes, each debug launch answers within three attempts, each forward opens and each quit the CLI makes of an app instance it wrote to since that instance launched completes gracefully within 20 seconds, the command exits non-zero, and after the relaunch that ends the command the app lists exactly the hosts it listed before and runs without a debugging port. AC-16 covers the paths beyond those bounds.
VERDICT: met
EVIDENCE: Manual step 5 used the paseotest build with PASEO_HOSTS_TEST_REJECT_ENTRY=1. The release build contains 0 occurrences of the variable.
- Mac: 4 runs, two of them with a recovered lost window. All exited 1 with "did not keep the change; its previous host list is restored". 92 s after each run the leveldb parse showed the same 2 hosts, with 0 debug-port processes and the arch-1 tunnel present.
- Windows: runs 1, 2 and 4 exited 1 with the same message. The parse 92 s later showed the same 3 hosts, both tunnels and 0 debug-port processes. Windows run 3 went beyond these bounds; it is judged under AC-16.
- TestRollbackAfterLostWindows, TestRestoreIsReadBack, TestRestoreMissingAfterARestartIsRestoredAgain and TestDebugLaunchAttempts pass, including with `-tags paseotest`.

CRITERION: AC-07 After `paseo-hosts remove <alias>`, no client it unlinked lists the server in its app or has its alias block, the server's `authorized_keys` has no line that permits only the daemon port with `command="/bin/false"`, `paseo.service` no longer exists, nothing listens on the daemon port, no Serve route points at it, `~/.local/share/paseo/runtime` and `state/config.json` are gone, the registry files and password are gone, and no app backup in `PASEO_HOSTS_DIR` holds the server's entry. The rest of the server's Paseo state and workspace remain unless `--purge` was given. When the server has a tunnel-only key line that belongs to no client `remove` will unlink, `remove` without a `--client` for it or `--no-clients` exits 3 and changes nothing. `unlink` removes only that client's entry, block and key line; `unlink --server-only` removes that client's key line and registry record without contacting it, after which `remove` completes; for a recorded client with no key line it drops the client, and for an unrecorded client whose key line has no `paseo-hosts:<client>` comment it exits 1 and changes nothing. With the server unreachable, `remove --skip-server` removes the app entry and alias block of every recorded client it can reach, drops and reports any client it cannot reach, which keeps its entry and block, and deletes the registry files, and with no client recorded or named it exits 3 unless `--no-clients` is given. Other servers and hosts in the apps are unchanged.
VERDICT: met
EVIDENCE: Manual step 7, `unlink arch-1 --client win-main`, exited 0.
- The PC app then listed only win-main and fedora-43, with no paseo-arch-1 config block. Its fedora-43 tunnel remained.
- arch-1 kept only paseo-hosts:macbook-pro, and PASEO_CLIENTS became macbook-pro.
- No backup in PASEO_HOSTS_DIR held srv_9XVgOi1SYKtK any longer, counted with `grep -c`.

`remove arch-1` exited 0 after recovering a lost window on the Mac.
- The Mac app then listed only fedora-43, and its config had 0 paseo-arch-1 lines.
- On arch-1: "Unit paseo.service could not be found", nothing on 6767, no Serve route, 0 paseo-hosts or /bin/false key lines, and runtime and state/config.json gone.
- The workspace and the remaining state (server-id among it) stayed, so re-onboarding kept serverId srv_9XVgOi1SYKtK.
- arch-1.env and arch-1.password were gone, and no backup matched the serverId or paseo-arch-1.

The exit 3 case, `--server-only`, `--skip-server` and the uncommented-line case rely on the TestRemove* and TestUnlink* stand-in tests, which pass.

CRITERION: AC-08 The plugin works from an operator host whose settings come only from the variables in Design: with a fresh `PASEO_HOSTS_DIR` and `PASEO_HOSTS_CLIENT` set, every SSH command targets the given server and client aliases, and `link` without a client alias exits 3 naming `PASEO_HOSTS_CLIENT`. The plugin's files contain no host, user or tailnet name.
VERDICT: met
EVIDENCE: Live, `link arch-1` without a client alias exited 3 with "no client alias: pass --client or set PASEO_HOSTS_CLIENT". TestOnlyTheDocumentedVariables, TestLinkWithoutClientNamesTheVariable and TestNoForbiddenNames pass. The debug logs of every live run show ssh targets only arch-1, macbook-pro and win-main. Limitation: I did not run the forbidden-names step 8 manually, as instructed.

CRITERION: AC-09 Registry files written by the local tool, including one without `PASEO_PUBLISHED` or `PASEO_CLIENTS`, work unchanged with `verify`, `status`, `list`, `link`, `unlink` and `remove`. `status <alias>` prints every field listed under link, in human output and under those keys in `--json`. A registry line that is not `KEY=value` is rejected without being executed.
VERDICT: met
EVIDENCE: `status arch-1 --json` exited 0 with schema_version 1 and data keys alias, ssh, exposure, daemon_port, url, clients and agents. `list` printed one line per registry file (arch-1 and fedora-43, the latter written by the local tool). `verify` exited 0. TestLocalToolRegistry, TestParseLocalToolFormat, TestRejectsNonAssignmentLines and TestRemoveLocalToolLink pass. Limitation: I did not live-test a local-tool registry without these keys.

CRITERION: AC-10 No plaintext password appears in a process argument list, in a log record or in the output of any command other than `password`.
VERDICT: met
EVIDENCE: I ran `grep -cF -f arch-1.password` over the stdout and the debug-level stderr of every live run in this review. That covers about 20 link, unlink, remove, onboard, verify and status runs across arch-1, the Mac and Windows, and every count was 0. Reading remote.go:69-89 showed that snippets and their variables travel on ssh stdin, not as arguments. TestHashTakesThePasswordOnStdin passes. Limitation: I did not sample remote process argument lists during the runs.

CRITERION: AC-11 Human output meets `conventions/terminal-output.md`: labelled status lines on standard error, no colour when `NO_COLOR` is non-empty or the stream is not a terminal, and ASCII words with `--plain`. With `--json`, standard output holds only one JSON object per command, `--help` included, with the documented fields, and the exit code matches the documented meaning.
VERDICT: met
EVIDENCE:
- `verify arch-1 --plain` printed "OK Passed: ..." lines with 0 non-ASCII bytes.
- Output to a pipe had 0 escape sequences.
- `verify --json` wrote one object with command verify and result ok on stdout, and the status lines on stderr.
- `verify nosuch --json` wrote one object with result config and exited 3.
- `--help --json` produced one object with keys command, data, result and schema_version.
- TestHumanOutput, TestOnlyATerminalCountsAsATerminal, TestJSONOutputAndExitCodes and TestHelpWithJSONPrintsOneObject pass.

CRITERION: AC-12 The plugin installs from the vhco-tools marketplace in Codex and Claude, and in a new session a request to add a Paseo server leads the agent to the skill, which runs `onboard` and `link` and reports the result without showing the password.
VERDICT: not verified
EVIDENCE: I did not install the plugin from either catalog or start a Codex or Claude session in this review. Both catalogs list `paseo-hosts` with source ./plugins/paseo-hosts. Limitation: the document has no `Residual:` line for AC-12, and `gate complete` reports "AC-12 is not verified without a residual" (F-02).

CRITERION: AC-13 The README, the skill and the CLI help use the terms in Design with those meanings, and the plugin's marketplace row describes it in the same terms.
VERDICT: met
EVIDENCE: The Design Terms table has Operator host, Server, Client, Registry, SSH-only, Published, Onboard, Link, Unlink, Remove, App backup and Kept copy. grep finds App backup, Kept copy, Registry and Operator host in both README.md and SKILL.md. Both also contain "at least twice", "2 minutes" and the `.backup.json` kept-copy name. The Claude catalog, the Codex catalog and docs/reference/marketplace.md describe the plugin as onboarding Linux servers as SSH-only Paseo daemons and linking the desktop app. `--help` uses the same words. Limitation: the meaning check was a read plus grep, not word by word.

CRITERION: AC-14 The wrapper in an installed copy of the plugin, outside the repository, builds and runs `paseo-hosts --help` starting from an empty Go module cache, fetching its dependencies through the module proxy and verifying them against `go.sum`.
VERDICT: met
EVIDENCE: I copied plugins/paseo-hosts to a scratch directory outside the repository and set GOMODCACHE, GOCACHE and PASEO_HOSTS_CACHE to empty scratch paths, with GOPROXY=https://proxy.golang.org,direct and GOSUMDB=sum.golang.org. Running scripts/paseo-hosts.sh --help exited 0 and printed the usage. Its stderr showed "go: downloading github.com/michielvha/logger v0.1.0" and "github.com/coder/websocket v1.8.15". `--help --json` then printed one object. The copy and caches are deleted.

CRITERION: AC-15 `link --no-app` sets up the key, host key and alias block as `link` does, records the client, changes neither the desktop app nor the clipboard and prints no password; a later `link` without `--no-app` adds the app entry, and `unlink` of a client without the app removes its block and key line.
VERDICT: met
EVIDENCE: The `--no-app` tests in cmd/paseo-hosts/main_test.go (lines 100, 115, 175), internal/link/link_test.go (lines 155, 159, 206) and internal/remove/remove_test.go pass under `go test -race -count=1 ./...`. They fail if the app step is reached and they cover the later app-adding link and unlink. Limitation: I did not run `--no-app` live.

CRITERION: AC-16 When `link`, `unlink` or `remove` rolls back a change the app did not keep and cannot confirm the app's previous host list, or, after a lost window and before it knows whether the app kept the change, loses the window a third time, cannot debug-launch the app or open its forward, or gives up on an installer, it exits 1 and names a copy of the app backup, `PASEO_HOSTS_DIR/app-registry-<client>.<UTC time>.backup.json`, which holds the host list the app had before the command; later commands change it only by deleting the entry of a server they unlink or remove. When the app had no host list, the message says so and no copy is written.
VERDICT: not met
EVIDENCE: Windows paseotest rollback run 3 started at 10:55:32 UTC.
- After the rollback's quit (10:56:06), the debug launch for the check after the rollback ran launch.ps1 over ssh at 10:56:07. That call did not return.
- For 6 minutes no Paseo.exe ran on win-main, the remote PowerShell sat idle (CPU 0.17 s), the paseo-hosts-launch task did not exist, and the command did not exit.
- Only after I stopped the remote PowerShell at 11:02:08 did the command continue. It exited 1 at 11:02:15 naming app-registry-win-main.20261112T110213Z.backup.json (mode 600) and gave "win-main is unreachable over SSH: " with an empty reason.
- The Design's 60-second attempt limit is not enforced. Left alone, the command does not reach this criterion's exit 1.

The rest of the criterion holds:
- The later `unlink` and `remove` deleted only the arch-1 entry from that copy (grep count 1 to 0).
- TestUnknownOutcomeKeepsACopy and TestUnconfirmedRestoreKeepsACopy pass.

Afterwards the PC listed its 3 hosts with both tunnels, so no restore was needed. I deleted the kept copy that my run created.

CRITERION: AC-17 When an app update installer still runs 2 minutes after `link`, `unlink` or `remove` quits the app, the command exits 1, leaves the app stopped and says to run it again once the update has installed; during a rollback, the message is one of the two step 5 gives, with this reason added, and after a window lost in step 4 it names the kept copy AC-16 describes.
VERDICT: met
EVIDENCE: Windows step 9 used a stand-in under %LOCALAPPDATA%\@getpaseodesktop-updater (PING.EXE copied as ph-standin.exe, run with `-n 151`) and the release `link`. The stand-in started at 11:10:15 and the app's main process was gone by 11:10:24. The command exited 1 at 11:12:25 with "an app update on win-main was still installing after 2m0s, so the app is left stopped; run it again once the update has installed; the app's host list on win-main is unchanged". A poll 60 s later still showed 0 Paseo processes. I restarted the app through an interactive task; it listed its 3 hosts with both tunnels, and the stand-in is deleted. The rollback-message and step 4 kept-copy clauses rely on TestInstallerOutlivesTheLimit and TestStopWaitsForTheAppsInstaller, which pass.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: plugins/paseo-hosts/internal/remote/remote.go:85-89 (run), internal/clientapp/clientapp.go:827 (launch), Design debug launch paragraph ("An attempt fails when ... the page has not answered after 60 seconds"), AC-16
EVIDENCE: `run` starts `ssh -o BatchMode=yes -o ConnectTimeout=15 alias ...` with exec.CommandContext on the caller's context and no deadline. No WithTimeout wraps the launch, stop or running calls; grep finds deadlines only in cdp.go and onboard.go:257. On win-main the bootstrap `powershell.exe ... -Command "iex ([Console]::In.ReadToEnd())"` sometimes never ends because stdin EOF does not arrive.
- Rollback run 3 hung 6 minutes in launch.ps1 with the app stopped (AC-16 record).
- The final `link arch-1 --client win-main` hung 6.5 minutes at the alias-block snippet. ~/.ssh/config was not written; the remote PowerShell sat in ReadToEnd under cmd.exe.
- A bare `sleep 25 | ssh win-main` bootstrap of my own hung the same way.
- Two such PowerShell processes from 2026-11-11 (PIDs 40548 and 25320) are still running on win-main.

Each hang ended only when I stopped the remote process. The CLI then reported "is unreachable over SSH: " with an empty reason.
PROPOSAL: Give every remote snippet call a deadline, for example the launch wait plus a margin and fixed limits for the probe and stop calls. On expiry, kill the ssh process and treat the call as a failed attempt, so the debug launch retries and then takes the AC-16 path. Report a timeout distinctly from an unreachable host. Add a fake-runner test where a snippet never returns.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: docs/specs/paseo-hosts.md, AC-12 (line 247) and its Evidence/Residual block
EVIDENCE: `vh-adlc gate complete docs/specs/paseo-hosts.md --repo . --plugin-pin a4e3d59` fails with "AC-12 is not verified without a residual". The document has no `Residual:` line for AC-12, although the Owner summary says it is tracked as issue #77.
PROPOSAL: Add the AC-12 `Residual:` line naming issue #77, so the gate can accept the not verified criterion.

### R-42

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Desktop app entry, deadline paragraph ("for quit and wait its quit wait of 0 or 20 seconds plus the 120-second installer wait plus 30 seconds"), and AC-18 ("30 seconds after the snippet's own longest wait")
EVIDENCE: The paragraph says each deadline is 30 seconds longer than the snippet's own longest wait. The quit and wait formula leaves out the snippets' force-stop wait. stop.ps1 lines 49 to 50 wait `Gone 10000` (10 seconds) after Stop-Process. stop.sh lines 35 to 39 run a second `gone` of wait_ms (20 seconds) after pkill. The snippets' longest waits are therefore 20 + 20 + 120 = 160 seconds on macOS with a 20-second quit wait, 10 + 120 = 130 seconds on Windows with no quit wait, and 20 + 10 + 120 = 150 seconds on Windows with a 20-second quit wait. The documented deadlines of 170, 150 and 170 seconds leave margins of about 10, 20 and 20 seconds, not 30. The stop.sh loops also run longer than their nominal time, because each of their wait_ms/100 iterations runs sleep 0.1 plus pgrep, and the installer loop allows about 121 seconds. The margin on macOS is therefore under 10 seconds, and a slow but healthy quit could be killed as a timeout. The formula as written contradicts both the stated rule and AC-18.
PROPOSAL: Derive the quit and wait deadline from every wait in stop.ps1 and stop.sh, including the force-stop wait: wait + force-stop wait + 120 + 30, where the force-stop wait is 10 seconds on Windows and wait_ms on macOS and Linux. Alternatively, state one fixed deadline per platform that is at least 30 seconds over the measured worst case. Update AC-18 and the Test Plan if the wording changes.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Desktop app entry, deadline paragraph ("Each SSH call that runs a desktop app snippet has a deadline", "the bootstrap above removes the one cause of such hangs seen so far"); AC-18 ("so `link`, `unlink` and `remove` never wait on a hung call past its deadline"); Open Questions
EVIDENCE: R-41 F-01 saw the hang in the link alias block write: client-ssh.ps1, called from internal/link/link.go line 153, is not a desktop app snippet. R-41 proposed a deadline on every remote snippet call. The revision bounds only desktop app snippet calls. The other client calls still run through remote.run (remote.go lines 85 to 115), which uses exec.CommandContext with no deadline. These are the link probe (link.go lines 198 and 214), the key call (line 136), the alias block write (line 153), the tunnel check in link (line 166), and the unblock and client-pub calls in remove (remove.go lines 264 and 339). A hang in any of them still blocks `link` or `remove` with no end. AC-18's closing clause reads as a promise for the whole command, but it holds only for the desktop app calls. Scoping the deadlines this way, and relying on the bootstrap fix alone for the other calls, is a trade-off the document settles without an Open Question.
PROPOSAL: Give every SSH call to a client a deadline, and state per call or per class what it fails as. Otherwise, add an Open Question that records the choice to bound only desktop app calls, and reword AC-18's closing clause so it promises only what those calls get.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Tasks (T1 to T44 are all ticked); Owner summary, Acceptance paragraph ("Acceptance authorizes the new tasks"); Test Plan, manual procedure and the implementation reviewer paragraph
EVIDENCE: The Owner summary says acceptance authorizes new tasks, but the Tasks section has no unchecked task for the bootstrap swap, the per-call deadlines, the stand-in bootstrap change or AC-18. In the previous revision, T39 to T44 were in the document before the spec review that accepted it at d2726cc. Without open tasks, after acceptance the binary's next step goes from implement straight to review, with no failing-test-first task for the new behaviour. The AC-18 Test Plan row has a live check, piping a snippet to `ssh win-main <bootstrap>` 10 seconds after the session starts. That check is not a numbered manual step, and the paragraph that lists which manual steps the implementation reviewer runs does not name it, so the document does not say who runs it.
PROPOSAL: Add unchecked one-commit tasks with failing-test-first wording. They should cover the remote deadline test and implementation, the clientapp timeout cases (launch timeout as a failed attempt, step 2 stop timeout), the stand-in bootstrap change, the bootstrap constant swap in remote.go and testenv.go, and the live win-main late-input check. Also make the live check a numbered manual step, or name who runs it.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Branch feat/paseo-hosts at 09a17a6 compared with origin/main; covered paths .github/workflows/ci.yml, CONTRIBUTING.md and docs/reference/marketplace.md
EVIDENCE: `vh-adlc fresh` reports covered-path drift for .github/workflows/ci.yml, CONTRIBUTING.md and docs/reference/marketplace.md. These files changed on origin/main after merge-base 55e7771. `git merge-tree --write-tree 09a17a6 origin/main` reports conflicts in CONTRIBUTING.md and docs/reference/marketplace.md. Any review recorded at 09a17a6 will be stale against main once those changes are counted, and the branch cannot merge cleanly as it is.
PROPOSAL: Merge origin/main into feat/paseo-hosts and resolve the conflicts. Then run the spec review that acceptance relies on at the merged commit.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Plugin layout, Windows bootstrap description ("writes a caught error as one plain line")
EVIDENCE: Measured on win-main (Windows PowerShell 5.1) and with pwsh 7.6.9 locally: with the new `-EncodedCommand` bootstrap, a thrown error comes back as one plain stderr line with exit 1, as the paragraph says. `Write-Warning` output, however, now comes back on stderr as a `#< CLIXML` block. With the old bootstrap it came back on stdout as `WARNING: careful`. No plugin snippet calls Write-Warning, but a cmdlet that a snippet calls can write warnings. Those would then reach the CLI's lastLine(stderr) as CLIXML in a failure message. The paragraph says nothing about non-error streams.
PROPOSAL: Have the script silence or redirect the warning and information streams (for example, set `$WarningPreference` or redirect them to stdout), or state in the Design that warnings arrive as CLIXML on stderr and the CLI ignores them.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, AC-18 row; Design deadline paragraph ("during a rollback or after a lost window it ends as an unconfirmed rollback does", "the error names the step")
EVIDENCE: The AC-18 row tests two timeouts: a launch timeout on the first debug launch attempt, and a step 2 stop timeout. It does not test a timeout during a rollback or after a lost window, which the Design says must end as an unconfirmed rollback. It also does not assert that the error names the step. AC-18 and the Design require both.
PROPOSAL: Add a clientapp case where a call during rollback, or after a lost window, never returns. It should assert the unconfirmed-rollback outcome. Every timeout case should also assert that the message names the step.

### R-43

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, link probe paragraph ("any other answer or a failure leads to a PowerShell probe ... Anything else stops with exit 4") and Desktop app entry deadline paragraph ("A call whose snippet has no timer of its own gets 30 seconds: the platform probe ..."; "Any other call that times out fails the command as a failed snippet does at that point ... the command exits 1"); AC-18; Test Plan AC-18 row; T48
EVIDENCE: plugins/paseo-hosts/internal/link/link.go lines 198 to 220 handle only ErrUnreachable from `uname -s` as a stop. Any other error, which includes a killed `ssh`, falls through to the PowerShell probe. When that probe returns no `OS=Windows_NT`, which is what a timed-out probe returns, the command exits with ExitUnsupported (4) and the message "client <c> is neither macOS nor Windows (uname -s: no answer)". That message drops the error. The PowerShell probe is the same kind of call that hung in R-41. The Design's probe rule makes a failed or timed-out probe stop with exit 4 and say nothing about a timeout. The deadline paragraph and AC-18 require exit 1 and an error that names the step and says it timed out. The two rules contradict each other for the probe, which runs first in `link`, `unlink` and `remove`. The Test Plan and T48 have no case where the probe never returns, so an implementation that keeps the current fallthrough passes every planned check while AC-18 fails for the probe.
PROPOSAL: State in the probe paragraph that a `uname -s` or PowerShell probe call that passes its deadline stops at once with exit 1 and names the probe and the timeout. It must not fall through to the PowerShell probe or exit 4. Add a T48 and Test Plan case with a probe that never returns that asserts exit 1, the timeout message and an unchanged registry.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Desktop app entry deadline paragraph ("Every SSH call to a desktop client, in `link`, `unlink` and `remove` as well as in the steps above, has a deadline"); AC-18 ("Every SSH call to a desktop client that has not finished by its deadline, twice its snippet's own longest wait plus 30 seconds")
EVIDENCE: The DevTools forward is an `ssh -N -L` process to the client (clientapp.go `forward`, lines 993 to 1034). It must stay open for the whole debug step, often longer than 30 seconds, and it runs no snippet. Today it is bounded only by `forwardTimeout` (20 seconds) while it opens. Read literally, the Design and AC-18 give it a deadline of 0 + 30 seconds. An implementer or reviewer could then kill it in the middle of a step, or count it as an unbounded call.
PROPOSAL: Say that the formula covers snippet calls, and that the debugging-port forward is bounded by its 20-second open wait and is closed with its step.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Tasks, T49 ("manual steps 6 and 9 on `win-main` with a release build")
EVIDENCE: Manual step 6 repeats steps 4 and 5 for the Windows PC. Step 5 runs `link` three times "with a `paseotest` build and `PASEO_HOSTS_TEST_REJECT_ENTRY=1`", which a release build does not contain ("Release builds do not contain this code"). T44 ran the same steps with "three `paseotest` rollbacks on each desktop". As written, T49 asks for something step 6 cannot do.
PROPOSAL: Have T49 name the `paseotest` build for the step 5 rollbacks within step 6, and the release build for step 4, step 9 and step 10.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry deadline paragraph ("Quit and wait gets twice the sum of its quit wait, its force-stop wait and the 120-second installer wait, plus 30 seconds ... 350 on macOS")
EVIDENCE: stop.sh line 34 runs `osascript -e "tell application id ... to quit"` before the first `gone` loop. osascript waits for the app's reply to the quit event, up to AppleScript's default 2-minute timeout, and the derivation does not count that wait. The same paragraph does count `ssh` ConnectTimeout=10 among the "35 seconds of timers" in the Windows tunnel snippet. The worst case on macOS is about 120 + 30 + 30 + 121 = 301 seconds, using the measured 1.5 factor for each 20-second `gone` loop and the SECONDS-bounded installer loop. That still fits under 350, but with about 49 seconds of headroom rather than the doubling the paragraph gives as the reason.
PROPOSAL: Count the AppleScript reply wait in the macOS quit derivation, or note that the deadline still covers it. That way, a later change to the quit or installer waits keeps the margin.

### R-44

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-18 ("Every SSH call to a desktop client that has not finished by its deadline, twice its snippet's own longest wait plus 30 seconds, ends with its `ssh` process killed"); Design, Desktop app entry deadline paragraph ("Every SSH call to a desktop client ... that runs a snippet has a deadline"); Design, link probe paragraph ("a `uname -s` or PowerShell probe call that passes its deadline")
EVIDENCE: The R-43 F-02 fix narrowed only the Design. It now says the formula covers calls "that runs a snippet" and that the `ssh -L` forward "keeps its 20-second limit for opening and is closed with its step". AC-18 is unchanged since 6a077d2 (`git diff 6a077d2 b091680` touches no AC line), and it still says every SSH call to a desktop client. The forward (clientapp.go:1000, `ssh -N ... -L ... alias`) is an SSH call to the client with no snippet. Read literally, AC-18 gives it a 30-second deadline and requires it to be killed mid-step, so the normative criterion contradicts the owner's answer. The narrowed Design wording also leaves out the `uname -s` call. That call is a fixed command argument (link.go:198, `remote.Command(ctx, alias, "uname", "-s")`), not an embedded snippet sent on standard input (Plugin layout defines snippets that way). The probe paragraph still depends on that call having a deadline, and the same paragraph lists "the platform probe" among the 30-second calls.
PROPOSAL: Make AC-18 match the Design: the deadline covers every SSH call to a desktop client that runs a snippet or a fixed command such as `uname -s`, and the debugging-port forward is bounded by its 20-second open limit and closed with its step. Make the Design's deadline sentence name the fixed `uname -s` command too.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-18 row ("a PowerShell probe that never returns, after a `uname -s` that fails, makes `link` exit 1, not 4"); Tasks, T48
EVIDENCE: The probe paragraph says a `uname -s` call that passes its deadline "stops at once with exit 1". In today's code, any `uname -s` error other than ErrUnreachable falls through to the PowerShell probe (link.go:198 to 220), and a killed `ssh` gives such an error. The only planned case hangs the PowerShell probe after a `uname -s` that fails. An implementation that keeps the fallthrough after a `uname -s` timeout would wait on a second hung call and then exit 1 through the PowerShell branch. That passes every planned check, but it does not stop at once as the Design requires.
PROPOSAL: Add a T48 and Test Plan case where `uname -s` never returns. It should assert exit 1, the probe and the timeout in the message, and that no PowerShell probe call was made.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, Desktop app entry deadline paragraph ("with that wait and the loops 1.5 times slower, the worst case is about 300 seconds, inside the 350")
EVIDENCE: If every loop in stop.sh is 1.5 times slower, the total is 120 + 30 + 30 + 180 = 360 seconds, which is over the 350-second deadline. The 300-second figure holds only because the installer loop is also bounded by the clock (stop.sh:50 to 52, `SECONDS=0` and `(SECONDS - 1) * 1000 >= limit_ms`), which caps it near 121 seconds while the two `gone` loops count iterations (stop.sh:25). The paragraph does not state that bound. It also does not count the operator side's `ConnectTimeout=15` (remote.go:86), which brings the worst case to about 316 seconds.
PROPOSAL: State that the installer wait is bounded by the clock, so only the two quit loops stretch, and give the worst case with the 15-second connect included. A later change to that loop would then show that it uses up the margin.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary ("every SSH call to a desktop client gets a deadline: twice the snippet's own longest wait plus 30 seconds"; "Planned: a stand-in `ssh` that never returns, ...")
EVIDENCE: Since R-43 the Design leaves the debugging-port forward out of the deadline formula, by the owner's answer to R-43 F-02, and a probe that times out now exits 1 instead of falling through to exit 4. The summary still says every SSH call gets the formula deadline. It does not mention the owner's R-43 decision or the probe change, and its Planned list leaves out the probe timeout case that the Test Plan now has. The standard asks for the summary to be refreshed when decisions or proof change and before asking for acceptance.
PROPOSAL: Add one sentence on the forward exception and the owner's R-43 answer, and add the probe timeout case to the Planned list.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Repository and convention facts ("CI builds, tests with `-race`, vets, lints and checks `go mod tidy -diff` for it (`.github/workflows/ci.yml:89-110`)")
EVIDENCE: The merge of origin/main added 4 lines to the `checker` job (`git diff 6a077d2 b091680 -- .github/workflows/ci.yml`). At b091680 the `remote-gui:` job starts at ci.yml:93, and its module checks and installed-copy step run to line 116. Line 89 is now inside the `checker-macos` job's test list. `vh-adlc fresh` reports covered-drift for ci.yml against R-43.
PROPOSAL: Update the citation to `.github/workflows/ci.yml:93-116`.

## Sources

- [Chromium `local_storage_impl.cc`](https://chromium.googlesource.com/chromium/src/+/main/components/services/storage/dom_storage/local_storage_impl.cc): `kCommitDefaultDelaySecs` is 5 seconds, the default localStorage commit delay step 5 waits out.
- [runner-images `Ubuntu2404-Readme.md`](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md): the `ubuntu-latest` image ships PowerShell 7.6.9, so CI needs no new step for the `.ps1` tests.
- [getpaseo/paseo release v0.15.4](https://github.com/getpaseo/paseo/releases/tag/v0.15.4): Paseo publishes the desktop app for Windows (x64 and arm64) beside the macOS `.dmg` files.
- [michielvha/logger `logger.go` at v0.0.5, line 55](https://github.com/michielvha/logger/blob/v0.0.5/logger.go#L55): the logger always writes JSON to standard output.
- [Squirrel.Mac `SQRLShipItLauncher.m`](https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLShipItLauncher.m): the `ShipIt` job label is the app's identifier plus `.ShipIt`, and the launcher passes it to `ShipIt` as an argument.
- [electron-updater `AppAdapter.ts`](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/AppAdapter.ts): on Windows the update cache lives under `LOCALAPPDATA`, in the directory `app-update.yml` names with `updaterCacheDirName`.
- [Squirrel.Mac `SQRLDirectoryManager.m`](https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLDirectoryManager.m#L22): the application identifier Squirrel.Mac uses is the main bundle's `bundleIdentifier`.
