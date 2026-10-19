# vhco-tools

A Claude Code plugin marketplace with workstation tooling that is not tied to one project.

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

In the Claude Code CLI:

```sh
claude plugin marketplace add michielvha/vh-adlc
claude plugin install vh-adlc@vhco-tools
```

Inside a session, the same commands are `/plugin marketplace add michielvha/vh-adlc` and
`/plugin install vh-adlc@vhco-tools`.

### Update

```sh
claude plugin marketplace update vhco-tools
claude plugin update vh-adlc@vhco-tools
```

### Uninstall

```sh
claude plugin uninstall vh-adlc@vhco-tools
```

Uninstalling leaves `github-app-registration` and the marketplace as they were. Remove the marketplace
with `claude plugin marketplace remove vhco-tools` only if no other plugin from it is installed.

### Support matrix

Supported means the scenario run in `tests/vh-adlc/evidence/` passed on that host. Everything else is
unsupported until its own run passes.

| Host or capability | Status | Evidence |
| --- | --- | --- |
| Claude Code CLI 2.1.303, Linux | Supported | `tests/vh-adlc/evidence/claude-code/` |
| Claude Code desktop app, VS Code extension, remote sessions | Unsupported: discovery not yet run | Same runtime as the CLI; not yet checked on each surface |
| VS Code Copilot Chat, Local harness | Unsupported: the hand run is pending | None yet |
| VS Code Copilot Chat, Copilot and Claude harnesses | Unsupported | Not tested |
| Copilot CLI | Unsupported | `tests/vh-adlc/evidence/copilot-cli/README.md` |
| macOS | Unsupported for the loop; the binary ships for it | Every scenario ran on Linux |
| Structural reviewer isolation | Unsupported: reviews record `procedural` | The reviewer has a shell, which can still write |
| Choosing the reviewer's model on Claude Code | Supported, with a caveat | When settings refuse the requested model, Claude Code runs the reviewer on another model without saying so. The reviewer names the model it ran on, and the loop compares it with the request. A named model that ran elsewhere leaves the review pending with a handoff. A default pass that ran on neither `fable` nor `opus` is dispatched again on `opus`. The Review Log records the model that ran |

## Developing

Run a plugin's tests with `bun test --cwd plugins/<plugin>/skills/<skill>/scripts`.

## Verifying a vh-adlc release

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
