[Documentation](../README.md) / Installation

# Install vh-adlc

Choose the client you use to work on a local Git repository. Check
[compatibility](../reference/compatibility.md) for its tested operations and plugin
versions. A successful installation does not establish that every workflow works
on that host.

The binary requires Git 2.35 or newer. The installer uses Bash, curl, tar, and a
SHA-256 utility (`sha256sum` or `shasum`). It downloads releases for Linux and
macOS on amd64 and arm64; you do not need Go to use the plugin.

## Codex desktop app

1. Open **Plugins** and select the **Local** environment.
2. Choose **Add**, then **Add a marketplace**.
3. Enter `michielvha/vh-adlc` in **Source** and add the marketplace.
4. Open **Personal** and install **vh-adlc** under **vhco-tools**.
5. Start a new chat. Select your project on **This computer**.
6. Type `@vh-adlc`, select the plugin, and describe the work, for example:
   `Use vh-adlc to diagnose this failure; report only`.

You can also select an operation explicitly:
`Invoke vh-adlc-spec for the feature I want to build`.

## VS Code Local chat

1. Open your project and choose **Local** in the Chat harness selector.
2. Run **Chat: Install Plugin from Source** from the Command Palette.
3. Enter `michielvha/vh-adlc`, review and trust the source, then select **vh-adlc**.
4. Start a new Local chat. Type `/vh-adlc` and choose an operation such as **vh-adlc-spec**.

Use the invocation the suggestion inserts. The tested VS Code 1.142 Local chat
inserts `/vh-adlc vh-adlc-spec`.

If you configure `chat.plugins.marketplaces` manually, put it in **User** settings.
VS Code rejects it in Workspace settings. Copilot Chat's other harnesses have
separate [compatibility entries](../reference/compatibility.md).

## Claude Code desktop app

1. Start a local Code session, choose **This computer**, and select your project.
2. Type `/plugin`, select the plugin-manager command, and submit it.
3. In Plugins, choose **Add plugin > Add marketplace > Add from a repository**.
4. Enter `https://github.com/michielvha/vh-adlc.git`, select that URL, and choose **Sync**.
5. Choose **Add** beside **Vh adlc**, then close Settings.
6. Type `/vh-adlc` and choose an operation. The desktop app offers names such as
   `vh-adlc:vh-adlc-spec`.

## Claude Code VS Code extension

The native Claude Code extension uses Claude Code's plugin registry. Install with
the desktop steps above or the CLI commands below, then open your project in Code.
Run **Claude Code: Open**, type `/vh-adlc` in the extension's message input, and
choose an operation such as `/vh-adlc:vh-adlc-spec`.

This is the native extension. Copilot Chat's **Claude** harness has its own
compatibility entry.

## Claude Code CLI

Run in a terminal:

```sh
claude plugin marketplace add michielvha/vh-adlc
claude plugin install vh-adlc@vhco-tools
```

Inside a Claude Code session, the equivalents are:

```text
/plugin marketplace add michielvha/vh-adlc
/plugin install vh-adlc@vhco-tools
```

Type `/vh-adlc` and choose an operation from the suggestions.

## What the plugin installs

The package contains eight skills and a reviewer definition. Its first operation
uses the [installer](../../plugins/vh-adlc/scripts/ensure-vh-adlc.sh) to fetch the
binary version in [vh-adlc.lock.json](../../plugins/vh-adlc/vh-adlc.lock.json).
It verifies the archive and binary hashes before execution and writes downloads
only to your user cache. Release binaries cover Linux and macOS on amd64 and arm64.

The first operation may ask permission to read the installed plugin's references
and its pinned public documentation cache. The plugin uses your repository's
engineering conventions pin when present, otherwise its
[own pin](../../plugins/vh-adlc/knowledge.md).

Shared triage uses Bun for its packaged helpers, Git for source verification, and the GitHub CLI
(`gh`) for its GitHub adapter. Authenticate that CLI for the intended repository using your normal
account setup before running triage; the plugin does not provision credentials or switch accounts.
Every published triage verdict and local assessment patch also needs the [managed verification controller](../../plugins/vh-adlc/references/triage-boundary.md),
which currently requires Linux, Bubblewrap, `flock` from util-linux and an authenticated supported CLI.
The shared procedure and stream protocol remain independent of the harness; other host integrations
must enforce the same boundary and pass their own tests. Missing confinement leaves closure execution and all assessment writes
unavailable; local reports remain available. Another read adapter must preserve the pagination and error contract. The other feature
operations continue to use the verified binary without requiring Bun.

The other marketplace plugins install separately. Bun is required for the
GitHub App registration scripts; installing vh-adlc does not install those scripts
or auth-refresh.

Continue with [your first feature](first-feature.md). For an existing installation,
see [updating and uninstalling](../user-guides/managing-plugins.md).
