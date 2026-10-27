<div align="center">

<img src="docs/assets/vhco.png" alt="VH & Co" width="130" />

# vh-adlc

A development workflow for coding agents, from first question to reviewed pull request.

[![CI](https://github.com/michielvha/vh-adlc/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/michielvha/vh-adlc/actions/workflows/ci.yml)
[![Release](https://github.com/michielvha/vh-adlc/actions/workflows/release.yml/badge.svg)](https://github.com/michielvha/vh-adlc/actions/workflows/release.yml)
[![Latest binary release](https://img.shields.io/github/v/release/michielvha/vh-adlc?sort=semver&label=binary)](https://github.com/michielvha/vh-adlc/releases/latest)
[![Documentation](https://img.shields.io/badge/docs-get_started-06b6d4)](docs/README.md)

[Get started](docs/get-started/installation.md) · [Documentation](docs/README.md) · [Compatibility](docs/reference/compatibility.md) · [Contributing](CONTRIBUTING.md)

</div>

vh-adlc helps you investigate problems, maintain a project, and build features with
Codex, Claude Code, and VS Code Local chat. Describe the work you want done, or
choose an operation yourself.

For features, a single document holds the spec, plan, and review history. A Go
binary checks that the work meets the requirements for each status change.
The agent runs the workflow; you accept the feature scope and decide when to ship.

## Why use it?

- Keep a feature's requirements, tasks, and evidence together in Git.
- Check review freshness and completion with deterministic commands.
- Get independent spec and implementation reviews before completing a feature.
- Handle documentation and small maintenance tasks without creating a feature spec.
- Triage backlog issues against source and observed checks. [Every published triage verdict requires the managed verification controller](plugins/vh-adlc/references/triage-boundary.md) and exact approval; local reports work across harnesses.

## Get started

### Codex desktop

Open **Plugins** in the **Local** environment, choose **Add > Add a marketplace**,
and enter `michielvha/vh-adlc`. Install **vh-adlc** from **vhco-tools** under
**Personal**, then start a new local chat in your project.

Select `@vh-adlc` and describe the work:

```text
Use vh-adlc to diagnose this test failure; report only.
```

### Claude Code

```sh
claude plugin marketplace add michielvha/vh-adlc
claude plugin install vh-adlc@vhco-tools
```

Describe the work with `Use vh-adlc`, or choose an operation such as
`/vh-adlc:vh-adlc-spec` to describe a feature.

See [installation](docs/get-started/installation.md) for desktop and VS Code
instructions, then follow [your first feature](docs/get-started/first-feature.md).
Host coverage varies by plugin version and operation; check
[compatibility](docs/reference/compatibility.md) before choosing a client.

## Find your way

| I want to… | Read |
| --- | --- |
| Build a feature from spec to PR | [Your first feature](docs/get-started/first-feature.md) |
| Triage and prioritize a backlog | [Workflows](docs/user-guides/workflows.md) |
| Choose an operation or resume work | [Workflows](docs/user-guides/workflows.md) |
| Update or remove the plugin | [Managing plugins](docs/user-guides/managing-plugins.md) |
| Check which hosts have been tested | [Compatibility](docs/reference/compatibility.md) |
| Use the binary directly | [CLI reference](docs/reference/cli.md) |
| Check a download's signature | [Verifying releases](docs/security/verifying-releases.md) |

## Also in vhco-tools

This repository hosts the **vhco-tools** marketplace. Each plugin installs separately.

| Plugin | Purpose |
| --- | --- |
| `vh-adlc` | Development workflows, feature gates, and independent reviews. |
| `auth-refresh` | Check and restore local SSO identities in isolated account lanes. |
| `github-app-registration` | Register GitHub Apps and save their credentials locally. |
| `codex-qr-pairing` | Generate a fresh QR code for pairing with this Codex host. |

See the [marketplace guide](docs/reference/marketplace.md) for availability and installation.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and local checks.
Report bugs and suggest improvements in [GitHub Issues](https://github.com/michielvha/vh-adlc/issues).

Maintained by [VH & Co](https://vhco.pro).
