[Documentation](../README.md) / Installation

# Install vh-adlc

Choose the client you use to work on a local Git repository. Check
[compatibility](../reference/compatibility.md) for its tested operations and plugin
versions. A successful installation does not establish that every workflow works
on that host.

The binary requires Git 2.35 or newer, and its `clean` command Git 2.45. The installer uses Bash, curl, tar, and a
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

## Codex CLI

```sh
codex plugin marketplace add michielvha/vh-adlc
codex plugin add vh-adlc@vhco-tools
```

Start a new session in your project and invoke `vh-adlc` or a named operation.
The CLI keeps its own installation profile; installation in another client does
not establish that this profile has the plugin.

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

## Antigravity

With the [Antigravity CLI](https://antigravity.google/docs/cli/install/) (`agy`) installed, run:

```sh
agy plugin install https://github.com/michielvha/vh-adlc/tree/main/plugins/vh-adlc
```

The command installs the package from `main` globally. Antigravity is unsupported for vh-adlc
workflows. Only installation and skill discovery have been checked, on plugin 0.3.1 with CLI 1.4.7 and
the language server from IDE 2.5.5 run headless; no skill or workflow ran, and current versions are
untested. Antigravity also skipped the reviewer agent because it expects the agent's `tools`
frontmatter as a YAML list, so operations that dispatch the reviewer or the blog editor are not
expected to work there. See [compatibility](../reference/compatibility.md#support-matrix).

## What the plugin installs

The package contains fifteen skills: the generic `vh-adlc` entry, eleven engineering
operations, `vh-adlc-blog` for article and promotion drafts, `vh-adlc-docs-impact` for
documentation review and `vh-adlc-clean` for host cleanup. It includes
separate feature-reviewer and prose-editor definitions. Its first operation
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
unavailable; local reports remain available. Another read adapter must preserve the pagination and error contract. Shared dependency and security maintenance also requires Bun, Git and an authenticated `gh`.
Its [settings](../../plugins/vh-adlc/references/maintenance-settings.md) are optional;
project topology, verification commands and delivery policies stay in the consumer.
Triage and maintenance settings are YAML files, `.vh-adlc/triage.yaml` and `.vh-adlc/maintenance.yaml`.
`vh-adlc-maintenance` is available from plugin 0.6.0. A repository with a triage or maintenance
settings file needs plugin 0.7.0 or later, because earlier releases do not read these files and run on
their defaults. Missing `vh-adlc-maintenance` is an installation blocker; do not reconstruct it from a legacy
local agent.
Maintenance uses an agent procedure with observed evidence, rather than triage's
managed publication controller. The other feature operations continue to use the
verified binary without requiring Bun.

Persistent codebase audit requires plugin 0.8.0+, Bun and Git. Create the
[audit settings and project procedure](../../plugins/vh-adlc/references/audit-settings.md) in the
consumer repository before running its helpers. Use `.vh-adlc/audit.yaml`, declare the required language
pages in `knowledge_pages`, then explicitly cache the locked binary and the complete normalized docs
page set. Audit entry always uses offline bootstrap and knowledge; missing caches stop at setup. The example supplies new files; no existing personal
configuration is assumed. The operation uses artifact-backed agent verification. It does not inherit
triage's controller, provision credentials or grant remote effects merely by being installed.

The other marketplace plugins install separately. Bun is required for the
GitHub App registration scripts; installing vh-adlc does not install those scripts
or auth-refresh.

## Host cleanup

`vh-adlc-clean` calls `vh-adlc` from the shell's `PATH`, which the installer does not
change. After each plugin update that moves the lock, install the locked binary
once, on Linux, from the installed plugin's directory:

```sh
sudo install -m 755 "$(bash <plugin directory>/scripts/ensure-vh-adlc.sh)" /usr/local/bin/vh-adlc
```

Install [kind](https://kind.sigs.k8s.io/) the same way if a project's manifest
names kind clusters. Then add one allow rule for each client, in user scope, so
any session can run the operation without a prompt:

- Claude Code, in `~/.claude/settings.json`:
  `"permissions": {"allow": ["Bash(vh-adlc clean *)"]}`
- Codex, in `~/.codex/rules/default.rules`:
  `prefix_rule(pattern=["vh-adlc", "clean"], decision="allow")`

The rule also allows `--compose` and `--kind`; the operation adds those only when
you ask. A command other than `vh-adlc clean`, such as `rm`, still goes to the
client's own approval.

Continue with [your first feature](first-feature.md). For an existing installation,
see [updating and uninstalling](../user-guides/managing-plugins.md).

## Standalone documentation checking

Install Bun, Git and Bash first. Resolve your actual installed vh-adlc directory
from the native installer; do not assume another machine's cache location.
Prepare the locked binary explicitly with:

```sh
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
bash <installed-plugin>/scripts/ensure-vh-adlc.sh
bun <installed-plugin>/scripts/docs-impact/cli.ts roots --repo <project>
bun <installed-plugin>/scripts/docs-impact/cli.ts check --repo <project> --docs-root docs --path src/example.ts
```

The checker itself runs offline, writes no index and needs no active agent.
Create leading Markdown frontmatter with a `covers` list for the code the doc
describes; the [complete example](../../plugins/vh-adlc/examples/docs-impact/README.md)
shows new files and expected outcomes. Select changed doc metadata separately with
`--metadata-path`; otherwise committed HEAD is assessed. Missing binary/setup,
roots or malformed metadata return `incomplete` and exit 2.

For Stackweaver's compatibility wrapper, export `VH_ADLC_PLUGIN_ROOT` to that
actual installed directory before starting terminal, hook or agent sessions.
CI uses the same variable and verified installed payload. Refresh its value
when a marketplace upgrade relocates the install. Missing setup reports exit 2;
there is no cache-path guessing. Existing callers retain their path/stdin arguments.

Projects coordination also uses Bun, Git and your authenticated GitHub CLI. It needs separate Projects
scope and an explicit board/repository configuration; see the [Projects reference](../../plugins/vh-adlc/references/projects.md).
