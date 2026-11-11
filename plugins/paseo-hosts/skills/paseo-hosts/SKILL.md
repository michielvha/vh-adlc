---
name: paseo-hosts
description: Add, onboard, link, unlink, remove, check or list Paseo servers. Use when the owner asks to set up a Linux machine as a Paseo server, to give a Mac or Windows PC's Paseo desktop app access to one, or to take a server or client away.
---

# Paseo servers and clients

Read the plugin `README.md` for the terms, setup and limits. Resolve the plugin's installed root two directories above this skill and run `scripts/paseo-hosts.sh` with an argument array. Add `--json` to every command and report the result from its `data`.

Terms:

- A **server** is a Linux machine, reached by an SSH alias from the operator host, that runs a Paseo daemon.
- A **client** is a Mac or Windows PC that runs the Paseo desktop app, reached by an SSH alias from the operator host.
- The **registry** is the `<alias>.env` and `<alias>.password` files in `PASEO_HOSTS_DIR`, or `~/.config/paseo-hosts` when it is unset. `onboard` creates it.
- **Onboard** installs or refreshes a server's daemon, password and exposure, then verifies authentication. **Link** gives a client a tunnel-only key and alias for a server and adds the server to the client's desktop app. **Unlink** takes one client off a server. **Remove** unlinks every client of a server and deletes its daemon service, route, config and registry entry.

## Add a server

A server needs Linux with OpenSSH 7.8 or later; the plugin `README.md` lists the rest.

1. Take the server's SSH alias from the request. Take the client's SSH alias from the request; when it names none and `PASEO_HOSTS_CLIENT` is unset, ask the owner for it.
2. Run `onboard <alias> --json`. Add `--publish` only when the owner asks for phone or browser access over the tailnet.
3. Before `link`, tell the owner that the Paseo desktop app on the client will quit and restart twice. With the app's default settings each quit also stops the desktop's built-in daemon and the agents running in it, and may install a downloaded app update.
4. Run `link <alias> --client <client> --json`. With `--no-app` it sets up SSH access only and leaves the app alone.
5. Report the checks: the exposure, the daemon port, the client's platform and whether the app lists the server.

## Take a client or server away

Confirm with the owner before `unlink` or `remove`, and give the same app restart warning first.

- `unlink <alias> --client <client> --json` takes one client off a server. Use `--server-only` for a client that is gone or offline.
- `remove <alias> --json` unlinks every recorded client and deletes the server's daemon, route, config and registry entry. When it exits 3 naming key lines that no recorded client owns, ask the owner whether to name those clients with `--client` or to accept them with `--no-clients`. Use `--skip-server` only when the server is gone, and `--purge` only when the owner asks to delete the server's Paseo state and workspace.

## Check and list

- `verify <alias> --json` checks that the daemon rejects a connection without a password and accepts the stored one.
- `status <alias> --json` gives the exposure, daemon port, URL, clients with their Remote SSH value, and agent CLIs.
- `list --json` gives every server in the registry.

## Passwords

Never print a password, read one into the conversation or paste one. Never read the registry's `.password` files. Run `password <alias>` only into a pipe, for example into the clipboard command the owner names. The other commands never print the password.

Exit codes: 0 success, 1 a failed check or remote step, 2 usage, 3 missing configuration, 4 an unsupported client. Report a non-zero exit with the command's `data.error`.
