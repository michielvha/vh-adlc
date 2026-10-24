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

The [Codex catalog](../../.agents/plugins/marketplace.json) and
[Claude catalog](../../.claude-plugin/marketplace.json) define package sources.
Both pin auth-refresh to the same component commit.

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
