# paseo-hosts

Onboard Linux servers as SSH-only Paseo daemons and link the Paseo desktop app on Macs and Windows PCs to them. The `paseo-hosts` CLI runs on the operator host, which reaches every server and client by an SSH alias.

## Terms

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

## Install

Install `paseo-hosts` from the vhco-tools marketplace. For Claude Code:

```sh
claude plugin marketplace add michielvha/vh-adlc
claude plugin install paseo-hosts@vhco-tools
```

In Codex desktop, add `michielvha/vh-adlc` as a marketplace and select `paseo-hosts`. Start a new session so the skill is found.

`scripts/paseo-hosts.sh` builds the CLI on first use into `builds/` under `PASEO_HOSTS_CACHE` and runs it. The first build downloads two Go modules through the module proxy and checks them against `go.sum`.

## Requirements

- Operator host: the Go version in `go.mod`, Node and npm, and `ssh` with a working alias for every server and client. The CLI installs the pinned `@getpaseo/cli` into `runtime/<version>/` under `PASEO_HOSTS_CACHE` the first time a command needs it, and uses it to hash passwords and verify servers.
- Server: Linux with OpenSSH 7.8 or later, Node, npm, Git, user lingering for systemd user units and the agent CLIs on `PATH`. Tailscale is needed only for `--publish`.
- Client: macOS, or Windows with OpenSSH Server. For the app step, the Paseo desktop app installed and, on Windows, the user signed in to a desktop session.

## Commands

```sh
paseo-hosts onboard <alias> [--publish] [--listen-port N] [--serve-port N] [--client-host HOST]
paseo-hosts link <alias> [--client CLIENT] [--no-app]
paseo-hosts unlink <alias> --client CLIENT [--server-only]
paseo-hosts remove <alias> [--client CLIENT]... [--no-clients] [--skip-server] [--purge]
paseo-hosts verify <alias>
paseo-hosts status <alias>
paseo-hosts list
paseo-hosts password <alias>
```

`onboard` installs the pinned daemon as the `paseo.service` user unit on loopback with the relay off, creates or reuses the password, stores only its bcrypt hash on the server and checks that a connection without the password is refused. Without `--publish` it deletes Serve routes to the daemon port; with it, it adds one tailnet-only HTTPS route. Running it again keeps the password, port and recorded clients.

`link` gives the client a dedicated key that the server accepts for a forward to the daemon port, pins the server's host key, writes a `paseo-<alias>` SSH alias block, and adds the server to the client's desktop app as a Remote SSH host. `--no-app` stops after the SSH access. The key refuses shells, forwards to other ports and TCP remote forwards, with one known limit: no key option stops a Unix socket remote forward (`ssh -R <path>:...`), so the key can still create a socket at an unused path the server user can write. Key lines written before the key carried `permitlisten` stay open to TCP remote forwards until `link` runs again for that client.

`unlink` takes one client off a server. `--server-only` does not contact the client and deletes only its key line and registry record. `remove` unlinks every recorded client, then deletes the server's daemon service, Serve route, runtime and config, and the registry entry. It keeps the rest of the server's Paseo state and workspace unless `--purge` is given. `--skip-server` is for a server that is gone.

`password` prints a server's password; pipe it into a clipboard command, never into a chat or log. No other command prints it, and the CLI passes it to other processes only on standard input or in the environment.

Every command takes `--json`, which prints one object with `schema_version`, `command`, `result` and `data` on standard output, and `--plain` for ASCII status lines. Exit codes: 0 success, 1 a failed check or remote step, 2 usage, 3 missing configuration, 4 an unsupported client. `LOG_LEVEL=debug` writes diagnostics to standard error.

## The desktop app restarts

`link`, `unlink` and `remove` change the app's host list through its DevTools port, so the app on the client quits and starts again at least twice, and more after a rollback or when it stops answering. With the default settings `manageBuiltInDaemon: true` and `keepRunningAfterQuit: false`, each quit stops the desktop's own built-in daemon and the agents running in it, and the app may install a downloaded update before it exits. Finish work in the built-in daemon first. The CLI does not change those settings.

Before each start the CLI waits up to 2 minutes for a downloaded app update to install. When the install takes longer, the command exits 1 and leaves the app stopped; run it again once the update has installed.

Before it changes the host list, the CLI saves the app backup, `PASEO_HOSTS_DIR/app-registry-<client>.backup.json`, mode 600, passwords included. When a change fails, it writes that list back and checks it after a restart.

## Restoring a kept copy

When the CLI cannot confirm that the app has its previous host list again, it exits 1 and names a kept copy of the app backup, `PASEO_HOSTS_DIR/app-registry-<client>.<UTC time>.backup.json`. No command overwrites it; `unlink` and `remove` only delete the entry of the server they take away. The copy holds passwords, so never paste it into a chat or log. To put it back through the app's DevTools:

1. Quit the Paseo app on the client and start it with a loopback debugging port. On macOS run `open -a Paseo --args --remote-debugging-port=9222`; on Windows, in the signed-in user's session, run `& "$env:LOCALAPPDATA\Programs\Paseo\Paseo.exe" --remote-debugging-port=9222`.
2. On the operator host, run `ssh -N -L 9222:127.0.0.1:9222 <client>`. In a Chromium browser open `chrome://inspect`, add `localhost:9222` under Configure, and click inspect under the Paseo page.
3. In the Console, type `localStorage.setItem('@paseo:daemon-registry', JSON.stringify(`, paste the copy's contents, type `))` and press Enter. Then run `location.reload()`.
4. Check that the app lists its hosts, wait 10 seconds, quit the app from its menu so it saves the list, and start it again normally.
5. Delete the copy, and stop the `ssh` forward.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PASEO_HOSTS_DIR` | `~/.config/paseo-hosts` | Registry files and plaintext passwords, mode 700 and 600 |
| `PASEO_HOSTS_CLIENT` | none | SSH alias of the client for `link`; `--client` overrides it |
| `PASEO_HOSTS_VERSION` | `0.14.0` | Paseo CLI version installed on servers and used locally |
| `PASEO_HOSTS_LISTEN_PORT` | `6767` | Daemon port for a newly onboarded server; `--listen-port` overrides it |
| `PASEO_HOSTS_SERVE_PORT` | `8956` | Tailnet HTTPS port when `--publish` is given |
| `PASEO_HOSTS_CACHE` | `${XDG_CACHE_HOME:-~/.cache}/paseo-hosts` | Local Paseo runtime and the build cache |
| `PASEO_HOSTS_CLIENT_KEY` | `id_ed25519_paseo` | File name of the dedicated key in the client's `.ssh` directory |

Registry files written by the earlier local `paseo-host` script keep working.

## Development

From `plugins/paseo-hosts`:

```sh
go build ./cmd/paseo-hosts
go test -race ./...
go vet ./...
go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 config verify
go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run
go mod tidy -diff
```

From the repository root, `bun test tests/paseo-hosts` builds an installed copy with an empty module cache. The PowerShell snippet tests need `pwsh` on `PATH` and skip without it.
