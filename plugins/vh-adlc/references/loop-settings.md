# Loop settings

The optional `.vh-adlc/loop.yaml` is data, schema_version 1, written as block YAML.
`scripts/loop/settings.ts` reads it through the verified `vh-adlc` binary, with the file rules in
`triage-settings.md`: a settings file under another suffix fails and names `.vh-adlc/loop.yaml`. With
no settings file, every loop role keeps the host default and no binary is needed.

## Terms

| Term | Meaning |
| --- | --- |
| Loop role | One of `author`, `implementer`, `spec_reviewer` and `implementation_reviewer`; each has a route. |
| Route | How a role runs: `host` (in the current harness, optionally with a named model) or `command` (an external CLI, reviewer roles only). |

## Roles

| Loop role | Operations |
| --- | --- |
| `author` | spec authoring, tasks, investigate |
| `implementer` | implement, ship |
| `spec_reviewer` | spec review |
| `implementation_reviewer` | implementation review |

Resume takes the route of the operation it continues.

| Field | Value |
| --- | --- |
| `schema_version` | Required integer `1` when the file exists. |
| `roles.<role>.route` | `host` or `command`. A role that is not listed uses `host` with no model. |
| `roles.<role>.model` | Optional for `host`, passed to the host as a requested model under `review-protocol.md`. Required for `command`. |
| `roles.<role>.argv` | `command` only: the executable, then its arguments. It must contain `{prompt}` or `{prompt_file}`, and may use `{model}` and `{export_dir}`. No other placeholder is accepted. |
| `review_scratch` | Optional list of build-output directories inside the checkout that a shell-enabled implementation reviewer may write to; changes there do not leave the review pending. Never `.`. |
| `project_procedure` | Optional contained file of local rules. Every SDD operation reads it before acting. |
| `instruction_files` | Optional contained files, such as `AGENTS.md` and `CLAUDE.md`. Every SDD operation reads them, and every spec review checks the document against them. |
| `lenses` | Optional list of `{name, check, severity}`: a named check every spec review applies, with severity `blocking`, `should-fix` or `nit`. |

`bun scripts/loop/cli.ts context --repo <dir>` prints the reading list (instruction files, then the
project procedure) and the lenses.

Only `spec_reviewer` and `implementation_reviewer` accept a `command` route; settings that give one to
`author` or `implementer` are refused, naming the role. Agent and skill files never name a model.

## Per-user override

The executable path in `argv` is machine-specific. A file outside every repository,
`$XDG_CONFIG_HOME/vh-adlc/loop.local.yaml` (default `~/.config/vh-adlc/loop.local.yaml`), may replace
it and nothing else:

```yaml
schema_version: 1
roles:
  spec_reviewer:
    executable: /home/me/bin/copilot
```

An override for a role whose route is not `command`, or one naming a model or arguments, is refused.
The model, the arguments and the role mapping always come from the committed file.
