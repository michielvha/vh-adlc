# vhco-tools

A plugin marketplace with workstation tooling that is not tied to one project. ADLC uses one shared
skill tree across native Codex, Claude Code and compatible agent-plugin clients.

## Install on a workstation

In Claude Code:

```
/plugin marketplace add michielvha/vh-adlc
/plugin install github-app-registration@vhco-tools
```

The scripts need [Bun](https://bun.sh).

## Plugins

| Plugin | What it does |
|---|---|
| `github-app-registration` | Registers a GitHub App through GitHub's manifest flow, stores its credentials locally with mode 0600, and copies them into a project's env and key files without printing them. |
| `vh-adlc` | A spec-driven development loop. One feature document is both spec and plan, and the `vh-adlc` binary decides every status change. |

## vh-adlc

The loop runs only when you invoke one of its operations. Each takes its rules from
[vhco-pro/docs](https://github.com/vhco-pro/docs) at the revision your repository pins in `AGENTS.md`, or
at the plugin's own pin when the repository has none.

| Operation | Invocation | What it does |
| --- | --- | --- |
| investigate | `/vh-adlc-investigate` | Measures an issue, failure or question and reports; never fixes |
| spec | `/vh-adlc-spec`, `/vh-adlc-spec review <path>` | Writes or revises a feature document, or dispatches an independent spec review |
| tasks | `/vh-adlc-tasks` | Breaks an accepted document into one-commit tasks, or replans the unchecked tail |
| implement | `/vh-adlc-implement` | Claims the feature, then works task by task on its branch, test first |
| review | `/vh-adlc-review` | Dispatches an independent implementation review of an exact commit |
| ship | `/vh-adlc-ship` | On your explicit request, pushes the branch, opens the PR and updates the issue; never merges |
| resume | `/vh-adlc-resume` | Reconstructs where a feature stands and continues the next safe step |

The skills call the `vh-adlc` binary. Its installer fetches the version that `vh-adlc.lock.json` names and
checks its SHA-256 digests before it runs anything. The installer writes only to your user cache. The
skills read their pages from the binary's cache.

### Install

#### Codex desktop app

1. Open **Plugins** and select the **Local** environment.
2. Choose **Add**, then **Add a marketplace**.
3. Enter `michielvha/vh-adlc` in **Source** and add the marketplace.
4. Open **Personal** and choose **Install vh-adlc** under **vhco-tools**.
5. Start a new thread. Select your project on **This computer**; do not assume a previously selected
   remote project is local.
6. Type `@vh-adlc`, select the plugin, and name the operation in your message. For example:
   `Invoke vh-adlc-spec for the feature I want to build`.

The validation run used the same native dialog with a local checkout path while this version was
being developed. It loaded all seven skills from the shared package, without an emitter, generated
skill mirror or separate Codex reviewer implementation.

The app bundle is named Codex; the tested version presents itself as ChatGPT in its native UI.
The desktop result does not establish the separate VS Code Codex extension or Copilot's Codex harness.

#### VS Code: Local chat

1. Open your project and choose **Local** in the Chat harness selector.
2. Run **Chat: Install Plugin from Source** from the Command Palette.
3. Enter `michielvha/vh-adlc`, review and trust that source, then select **vh-adlc** from the plugin list.
4. Start a new Local chat. Type `/vh-adlc` and choose an operation, such as **vh-adlc-spec**.

The suggestion inserts the invocation for you. In VS Code 1.142, Local chat inserts
`/vh-adlc vh-adlc-spec`; do not assume another client's slash syntax.

If you configure `chat.plugins.marketplaces` yourself, put it in **User** settings. VS Code rejects
that setting in Workspace settings. The other Chat harnesses have separate validation entries below;
a Local installation is not proof that a Copilot or Claude harness has loaded the plugin.

#### Claude Code desktop app

1. Start a local Code session, choose **This computer**, and select your project folder.
2. Type `/plugin`, select the plugin-manager command, and submit it.
3. In Plugins, choose **Add plugin**, **Add marketplace**, then **Add from a repository**.
4. Enter `https://github.com/michielvha/vh-adlc.git`, select that URL, and choose **Sync**.
5. Choose **Add** beside **Vh adlc**, then close Settings.
6. Type `/vh-adlc` and choose an operation. The desktop app offers names such as
   `vh-adlc:vh-adlc-spec`.

No terminal commands are needed for those GUI installs. The first operation can ask permission to
read the installed plugin's references and its pinned public documentation cache.

#### Claude Code VS Code extension

The native Claude Code extension uses the normal Claude Code plugin registry. In the GUI validation
run, it loaded the plugin installed through the desktop steps above.

Open your project in Code, run **Claude Code: Open**, and type `/vh-adlc` in the extension's own message
input. Choose a qualified operation such as `/vh-adlc:vh-adlc-spec`. This is the native extension,
not Copilot Chat's separate **Claude** harness.

#### Claude Code CLI

In a terminal:

```sh
claude plugin marketplace add michielvha/vh-adlc
claude plugin install vh-adlc@vhco-tools
```

Inside a session, the same commands are `/plugin marketplace add michielvha/vh-adlc` and
`/plugin install vh-adlc@vhco-tools`.

### Update

In Codex, open **Plugins** and choose **Refresh**, then inspect **Personal > vh-adlc** for the version.
For a clean GUI reinstall, open the plugin's **More actions > Uninstall**, then install vh-adlc again
from **Personal** and start a new thread. This uses native package management, not copied skill files.

The optional Codex CLI equivalents for the Git marketplace are:

```sh
codex plugin marketplace upgrade vhco-tools
codex plugin add vh-adlc@vhco-tools
```

In VS Code Local, use **Chat: Update Plugins**, then start a new Local chat.

For Claude Code:

```sh
claude plugin marketplace update vhco-tools
claude plugin update vh-adlc@vhco-tools
```

### Uninstall

In Codex, open **Plugins > Personal > vh-adlc**, then **More actions > Uninstall**. The optional CLI
equivalent is `codex plugin remove vh-adlc@vhco-tools`.

For Claude Code:

```sh
claude plugin uninstall vh-adlc@vhco-tools
```

Uninstalling leaves `github-app-registration` and the marketplace as they were. Remove the marketplace
with `claude plugin marketplace remove vhco-tools` only if no other plugin from it is installed.

### Support matrix

Supported means the scenario run in `tests/vh-adlc/evidence/` passed on that host. Everything else is
unsupported until its own run passes. Partial GUI entries name the checks actually run, rather than
claiming that the whole scenario matrix passed.

| Host or capability | Status | Evidence |
| --- | --- | --- |
| Claude Code CLI 2.1.303, Linux | Historical full scenario proof; the 0.2.0 model-policy changes have not had an authenticated scenario rerun | `tests/vh-adlc/evidence/claude-code/`; [0.2.0 compatibility discovery](tests/vh-adlc/evidence/codex/gui-smoke.md) |
| Codex desktop app 26.1013.40934, macOS arm64 | Core GUI loop passed on plugin 0.2.0, through independent implementation review and gated completion; unsafe shipping preflight correctly stopped | [Codex GUI run](tests/vh-adlc/evidence/codex/gui-smoke.md) |
| Codex CLI 0.163.0 | Native package installation passed in an isolated, credential-free profile; no CLI agent-loop claim | [Codex GUI run](tests/vh-adlc/evidence/codex/gui-smoke.md) |
| Codex VS Code extension and Copilot's Codex harness | Not yet tested | Not inferred from the desktop app |
| Claude Code desktop app 2.42304.2, macOS arm64 | Historical core GUI loop passed on plugin 0.1.2, through gated completion; the new inherited-default policy has not been rerun here | [Desktop GUI run](tests/vh-adlc/evidence/claude-desktop/gui-smoke.md) |
| Claude Code VS Code extension 2.1.301, macOS arm64 | Partial GUI validation: seven operations, investigation, independent spec review and structured owner questions passed | [Native extension GUI run](tests/vh-adlc/evidence/claude-code-extension/gui-smoke.md) |
| Claude Code remote sessions | Unsupported | Not inferred from another Claude Code surface |
| VS Code Copilot Chat 1.142, Local harness, macOS arm64 | Core GUI loop and explicit-model rejection passed; permission-mode caveat recorded separately | [Local GUI run](tests/vh-adlc/evidence/vscode-local/gui-smoke.md) |
| VS Code Copilot Chat, Copilot and Claude harnesses | Unsupported | Not tested |
| Copilot CLI | Unsupported | `tests/vh-adlc/evidence/copilot-cli/README.md` |
| macOS arm64 | Core desktop GUI loop passed; other surfaces and full-matrix limits are listed separately | [Desktop GUI run](tests/vh-adlc/evidence/claude-desktop/gui-smoke.md), [binary and fixture checks](tests/vh-adlc/evidence/claude-code/S1.host.macos.md) |
| Structural reviewer isolation | Unsupported: reviews record `procedural` | The reviewer has a shell, which can still write |
| Choosing a specific reviewer model | Capability-dependent; a mismatch remains pending | A host must be able to pass the requested model and return a matching identity. A silently substituted model or an unavailable selector never counts as a match |

On every host, a review with no named reviewer model uses the host's inherited default. Version 0.2.0
removes the earlier Claude-specific preferred-model and fallback chain.
Some hosts do not expose that model's identity: the Review Log records `unknown`, and the report says
that identity was not attested. Asking for a specific model still requires a matching identity;
`unknown` cannot satisfy that request.

Hosts may register the reviewer agent directly or dispatch a generic independent subagent that reads
the same reviewer file. If neither capability is available, the review stays pending with a handoff.
The primary session never substitutes self-review for independence.

## Developing

Run a plugin's tests with `bun test --cwd plugins/<plugin>/skills/<skill>/scripts`.

## Verifying a vh-adlc release

The [shared release design](https://github.com/vhco-pro/docs) composes
`michielvha/go-ci-action`, `michielvha/gitversion-tag-action`, and the release-only
`michielvha/goreleaser-action`, each pinned to its reviewed implementation.

CI-only jobs call the Go CI action directly. PR and main checks also test
snapshot packaging without publication or production signing keys. If an open
PR owns a feature branch's checks, the duplicate push checks are skipped.
Linux and macOS plugin checks remain part of CI.

For an open PR in this repository, a writer can add `release:preview` once.
After those checks succeed, a native `needs:` job requests **Version** on the
checked source branch. While the label stays present, each eligible PR update
requests another prerelease automatically. Removing it or closing the PR stops
future requests. Fork PRs get checks only.

GitVersion's branch configuration, history and tags determine the version; the
PR label only enables publication. The thin shared versioning workflow handles
App authentication, checkout and the public GitVersion action call. Main's
Version job calls it directly after the checks through `needs:`. Only the
resulting exact tag starts the shared Go CI and release workflow.

Manual Version runs default to read-only calculation on the selected branch.
Feature-branch publication requires a current open label-enabled PR. Automatic
requests follow CI through `needs:` and carry its source SHA; no CI run IDs,
job-name parameters, manually copied SHAs or per-commit approvals are used.

Automated tagging uses the reusable `michielvha-repo-write` GitHub App, installed
on the owner's repositories. Each tagging job requests a short-lived token for
this repository only, with Contents: write. Its `RELEASE_APP_CLIENT_ID` repository
variable and `RELEASE_APP_PRIVATE_KEY` secret configure that identity;
`PGP_PRIVATE_KEY` signs artifacts. Validation and snapshot jobs receive none
of these credentials. Only eligible versioning receives a repository-scoped
tag token, and only tag-triggered publication receives the signing key.
Do not grant the App key to untrusted code.

No cleanup is enabled. Re-run the original tag workflow for a transient failure;
inspect a partial release before retrying. GoReleaser's configuration forbids
replacing existing drafts or artifacts. Source fixes need a new version, never a
moved tag. Current external action consumers are not migrated by this pilot.

Each release of the `vh-adlc` binary publishes a `checksums.txt` and a detached signature,
`checksums.txt.sig`, made with the VHCO Pro release signing key. The public key is
[`release-signing-key.asc`](release-signing-key.asc) in this repository, and its primary fingerprint
is:

```text
9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6
```

Download the archive for your platform with `checksums.txt` and `checksums.txt.sig`, then run:

```sh
gpg --import release-signing-key.asc
gpg --fingerprint release@vhco.pro
gpg --verify checksums.txt.sig checksums.txt
sha256sum --check --ignore-missing checksums.txt            # Linux
shasum -a 256 --check --ignore-missing checksums.txt        # macOS
```

The fingerprint `gpg --fingerprint` prints must equal the one above. `gpg --verify` names the key's
signing subkey, `929B7A7AF19CB3E67EEEEC0272E691932274AE79`, and the key's primary fingerprint is the
one to compare.
