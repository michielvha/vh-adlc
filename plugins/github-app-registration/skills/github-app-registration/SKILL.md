---
name: github-app-registration
description: Register a new GitHub App through GitHub's manifest flow and store its credentials (App id, client id and secret, webhook secret, private key) locally without them reaching the chat, the terminal or Git; then copy them into a project's env and key files. Use when someone needs a new GitHub App, or a GitHub App's client secret or private key and the existing App can be replaced. It cannot change an existing App.
---

# GitHub App registration

Two Bun scripts in `scripts/` beside this file. `register.ts` serves a one-page form on
`127.0.0.1` (or on the tailnet, see below) that posts an App manifest to GitHub, receives GitHub's one-time code on its own
callback and exchanges it for the App's credentials, which it writes to a file with mode 0600.
`export.ts` copies chosen fields from that file into an env file and writes the private key to a
key file, printing only what it set and where. Neither ever prints a credential value.

The person confirms every step on GitHub themselves: you give them the registration link, they
review and create the App, and they install it. Never click through GitHub on their behalf.

## Before starting

1. **Know what this cannot do.** The manifest flow only creates an App. To add a callback URL or
   a client secret to an existing App, the owner does that on the App's settings page; say so
   rather than registering a replacement nobody asked for.
2. **Ask for what the registration needs**, grounding the defaults in what exists (for an App
   being replaced, `gh api /apps/<slug>` gives its permissions and events):
   - owner: a user login or an organization login (organization needs its admin to confirm);
   - App name (unique across GitHub, at most 34 characters);
   - repository and organization permissions, and webhook events;
   - who may install it: `public: false` (the owner only) or `true` (any account); which
     repositories it reaches is chosen by the person at install time;
   - callback URLs, setup URL, webhook URL, and whether to show an install link afterwards
     (`afterRegistration.installLink`: false when installing must start from the product itself).
3. **Have Bun.** `bun --version`; install from https://bun.sh if missing.
4. **Know where the person's browser is.** The link must open in their browser, and GitHub sends
   that browser back to the helper's callback. If they are on this machine, keep the default
   `"reach": "loopback"`. If they are on another of their devices (a remote session, a laptop),
   set `"reach": "tailnet"`: the helper then listens on this machine's Tailscale address and the
   link uses its MagicDNS name, so only the person's own tailnet devices can open it. Check with
   `tailscale status` that their device is listed and online. Without Tailscale, they forward the
   port themselves from their machine (`ssh -L <port>:127.0.0.1:<port> <this host>`) and open
   the loopback link there; this machine usually cannot SSH into their laptop.

## Run

1. Write the config to a scratch file (it holds no secrets). Shape, all fields:

   ```json
   {
     "owner": { "type": "user", "login": "octo", "targetId": 123 },
     "port": 8768,
     "reach": "loopback",
     "credentialPath": "/home/me/.local/share/github-apps/my-app.json",
     "afterRegistration": { "installLink": true, "note": "shown after registration" },
     "manifest": {
       "name": "my-app", "url": "https://example.com", "description": "...", "public": false,
       "callback_urls": ["https://example.com/oauth/callback"],
       "setup_url": "https://example.com/installed", "setup_on_update": false,
       "hook_attributes": { "url": "https://example.com/webhook", "active": true },
       "default_permissions": { "contents": "read", "metadata": "read" },
       "default_events": ["push"],
       "request_oauth_on_install": false
     }
   }
   ```

   `credentialPath` defaults to `~/.local/share/github-apps/<name>.json`; the script refuses to
   overwrite an existing file. `targetId` (the owner's numeric id) preselects the account on the
   install page.
2. Run the tests: `bun test --cwd <skill dir>/scripts`.
3. Start it in the background: `bun <skill dir>/scripts/register.ts <config>`. It prints the
   registration link and stops by itself 3 seconds after a registration, or after 30 minutes.
4. Give the person the link. Poll `curl -s <origin>/status` (the origin of the printed link) until it answers
   `registered`. A registration whose owner, permissions or events differ from the request is
   still saved (GitHub hands out the private key once), but the page tells them not to install.
5. Copy the credentials where the project reads them, for example:

   ```bash
   bun <skill dir>/scripts/export.ts --credentials ~/.local/share/github-apps/my-app.json \
     --env-file deploy/app.env --compose-escape APP_CLIENT_ID=client_id APP_CLIENT_SECRET=client_secret \
     --pem-file deploy/app-private-key.pem --replace
   ```

   Exportable fields: `id`, `slug`, `owner`, `client_id`, `client_secret`, `webhook_secret`;
   the private key only goes to `--pem-file`. `--compose-escape` doubles `$` for Docker Compose
   env files. `--replace` moves an existing key file beside the credentials file (outside any
   repository) as `<name>.<timestamp>.previous`. The key is written
   0600; when a container running as another user reads it from a bind mount, pass
   `--pem-mode 0644` (the most the script allows) and check the container can read it.

## Rules

- Never print, cat, echo or paste a credential, the callback code or the key file. Check that a
  value is set with `grep -c '^KEY=' file`, not by reading it.
- Never commit the credentials file, an env file with secrets, or a key file. Check the target
  paths are git-ignored before exporting into a repository.
- Leave registration and installation confirmations to the person.
