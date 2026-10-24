[Documentation](../README.md) / Managing plugins

# Managing plugins

## Update

In Codex, open **Plugins**, choose **Refresh**, then inspect **Personal > vh-adlc**
for the installed version. Start a new chat after updating.

The optional Codex CLI equivalents for the Git marketplace are:

```sh
codex plugin marketplace upgrade vhco-tools
codex plugin add vh-adlc@vhco-tools
```

In VS Code Local, run **Chat: Update Plugins**, then start a new Local chat.

In Claude Code:

```sh
claude plugin marketplace update vhco-tools
claude plugin update vh-adlc@vhco-tools
```

## Reinstall in Codex

Open **Plugins > Personal > vh-adlc > More actions > Uninstall**, install vh-adlc
again from **Personal**, and start a new local chat. Use native package management
so the client loads the plugin's shared skill tree.

## Uninstall

In Codex, open **Plugins > Personal > vh-adlc > More actions > Uninstall**.
The CLI equivalent is:

```sh
codex plugin remove vh-adlc@vhco-tools
```

In Claude Code:

```sh
claude plugin uninstall vh-adlc@vhco-tools
```

Other marketplace plugins remain installed. In Claude Code, remove the
marketplace only when none of its plugins are still installed:

```sh
claude plugin marketplace remove vhco-tools
```

## If the plugin does not appear

Start a new chat after installation or update. Confirm that you installed into
the client and environment you are using: VS Code Local, the native Claude Code
extension, and Copilot's other harnesses have separate plugin surfaces.

For a binary checksum failure, stop and inspect the installation. The installer
fails closed; do not bypass verification or substitute an unverified binary.
See [verifying releases](../security/verifying-releases.md).

Return to [installation](../get-started/installation.md) or check
[compatibility](../reference/compatibility.md).
