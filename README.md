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

## Developing

Run a plugin's tests with `bun test --cwd plugins/<plugin>/skills/<skill>/scripts`.
