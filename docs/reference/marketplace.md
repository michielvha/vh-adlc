[Documentation](../README.md) / Marketplace

# The vhco-tools marketplace

The repository is named **vh-adlc**; its marketplace is named **vhco-tools**.
Adding the marketplace makes its plugins discoverable. Install each plugin you
want separately.

## Plugins

| Plugin | Purpose | Availability |
| --- | --- | --- |
| `vh-adlc` | Lifecycle intake, maintenance, and a spec-driven feature loop. | Codex and Claude catalogs. See [installation](../get-started/installation.md). |
| `auth-refresh` | Check and restore local SSO identities in isolated account lanes, with Claude Remote Control phone notifications. | Codex and Claude catalogs; source lives in [auth-refresh](https://github.com/michielvha/auth-refresh). |
| `github-app-registration` | Register a GitHub App through its manifest flow, save credentials locally with mode 0600, and export them to project files. | Claude catalog. The scripts require [Bun](https://bun.sh). |
| `codex-qr-pairing` | Generate a fresh QR code for pairing with this Codex host. | Codex and Claude catalogs. Requires a signed-in Codex host with Remote Control running and `qrencode`. |

The [Codex catalog](../../.agents/plugins/marketplace.json) and
[Claude catalog](../../.claude-plugin/marketplace.json) define package sources.
Both pin auth-refresh to the same component commit.

## Shared maintenance

The `vh-adlc-maintenance` operation is included in vh-adlc from plugin 0.6.0;
it is not a separate marketplace plugin. Update the client installation and
verify its version and operation discovery before replacing a local entry.
Project-specific maintenance policy and scope remain in the consuming repository.
See [maintenance workflow](../user-guides/workflows.md#dependency-and-security-maintenance).

For a migration, validate an exact candidate in isolated profiles first, then
repeat installation and installed-helper checks against the published marketplace.
A local catalog or copied skill is insufficient for consumer cutover. The packaged
adoption preflight checks the exact shared/consumer targets, version, payload,
native-host receipts and paired review. It treats receipts as operator attestations;
it neither publishes the feature nor authorizes a consumer merge.

## codex-qr-pairing

After adding this marketplace, install **codex-qr-pairing** from **vhco-tools**.
The CLI equivalents are:

```sh
codex plugin add codex-qr-pairing@vhco-tools
```

```sh
claude plugin install codex-qr-pairing@vhco-tools
```

Start a new chat and ask: `Use codex-qr-pairing to generate a pairing QR code`.
The [pairing skill](../../plugins/codex-qr-pairing/skills/codex-qr-pairing/SKILL.md)
generates a fresh token and displays the full pairing URL as a QR image. Scan it
with your phone's Camera app, then complete setup in ChatGPT. Run the skill on
the host whose sessions you want to access. The QR flow has been tested with a
phone; desktop clients can use their own connection setup and manual-code flow.

## auth-refresh

After adding this marketplace, select **auth-refresh** from **vhco-tools** in
Codex, or install it in Claude Code:

```sh
claude plugin install auth-refresh@vhco-tools
```

The optional Codex CLI command is `codex plugin add auth-refresh@vhco-tools`.
It can also be installed independently from its own repository. Its source and
runtime releases are public; fetching them does not require GitHub credentials.

For provider setup and day-to-day use, read the
[auth-refresh documentation](https://github.com/michielvha/auth-refresh#readme).
Before migrating an existing setup, check the
[acceptance results and Linux-host handoff](../specs/portable-auth-refresh.md).
Some phone MFA and live-provider acceptance checks remain outstanding.

## github-app-registration

Install in a Claude Code session:

```text
/plugin marketplace add michielvha/vh-adlc
/plugin install github-app-registration@vhco-tools
```

Ask the plugin to register a GitHub App and provide the owner, permissions, and
callback requirements. You review and confirm registration and installation on
GitHub yourself. The manifest flow creates a new App; it cannot modify an
existing one.

Read the [registration workflow](../../plugins/github-app-registration/skills/github-app-registration/SKILL.md)
for configuration, credential storage, and export options.
