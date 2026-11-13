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
| Enrolled spec | A spec whose Review Log uses the shared header; a consumer's adapted commands send it to the vh-adlc operations. |
| Verification rung | A declared check with a path condition or `always`, which must pass before push, completion and delivery. |
| Project procedure | The consumer's file of local rules that every SDD operation reads, named by `project_procedure`. |
| Primary worktree | The first entry of `git worktree list`; with `implement_worktree: isolated`, implement never writes there. |
| No publication path | The delivery verdict for a merge commit that carries the skip marker and touches only skip-eligible paths. |
| Delivered | A feature whose release paths have all published, or whose merge has no publication path. |

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
| `roles.<role>.model_attestation` | Optional, `command` only: `codex-session` reads the served model from Codex's session log for the run's thread id instead of the reviewer's self-report; the `argv` must include `--json`. A missing log, no or several recorded models, or a mismatch leaves the review pending. |
| `review_scratch` | Optional list of build-output directories inside the checkout that a shell-enabled implementation reviewer may write to; changes there do not leave the review pending. Never `.`. |
| `project_procedure` | Optional contained file of local rules. Every SDD operation reads it before acting. |
| `instruction_files` | Optional contained files, such as `AGENTS.md` and `CLAUDE.md`. Every SDD operation reads them, and every spec review checks the document against them. |
| `lenses` | Optional list of `{name, check, severity}`: a named check every spec review applies, with severity `blocking`, `should-fix` or `nit`. |

## Verification rungs

| Field | Value |
| --- | --- |
| `verification_rungs[].name` | Lowercase name, unique. |
| `verification_rungs[].when` | `always`, or `{paths: [glob, ...]}` matched against the whole feature delta. |
| `verification_rungs[].command` | A shell command run from the worktree. Exit 0 passes; exit 126 or 127 means it could not run; any other exit fails. |
| `verification_rungs[].procedure` | Instead of a command: a written procedure the operation performs and records. |
| `verification_rungs[].skipped_pattern` | Optional regular expression for an output line that reports a skipped mandatory subcheck; its first group names the subcheck. |

Before merge the feature delta is the branch against its merge base with the default branch, plus every
uncommitted change; after merge it is the merge commit against its first parent. Every applicable rung
must pass at the commit being pushed, completed or delivered; a result recorded at another commit does
not count. A failed rung always blocks. A rung that could not run, or that reported a skipped mandatory
subcheck, blocks unless the owner allows that exact rung (`<rung>`) or subcheck (`<rung>/<subcheck>`) for
that run, and the report records the allowance. With rungs or a post-merge watch declared, a feature
lands by merge commit only. Without rungs, operations keep reading verification commands from
`AGENTS.md`. `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --run true` reports the
delta, the applicable rungs, a result for every declared rung and whether the feature may advance; a
rung whose path condition does not hold is listed as not run with that reason and does not block. A written procedure rung
counts only through `--record <rung>=passed|failed:<what was observed>`, given by the operation that
performed it, at the current head.

## Delivery

| Field | Value |
| --- | --- |
| `ci_trigger` | `automatic` (default) or `manual`. With `manual`, ship reports CI as not triggered by policy and never dispatches a run. |
| `skip_ci_paths` | Optional globs of extra skip-eligible paths for feature deliveries, honoured only when the resolved delivery convention allows them; otherwise ship reports them ignored and names the pin update. |
| `post_merge_watch.argv` | A command run after a merge; it must contain `{merge_sha}`. Exit 0 means every release path published. |
| `post_merge_watch.no_publication_pattern` | Optional regular expression for watch output that means no workflow ran at all. |

After a merge, ship reads the actual merge commit. If its message carries the skip marker and its diff
against the first parent touches only skip-eligible paths, the feature is delivered with no publication
path and the watch does not run. Every other merge runs the watch: exit 0 means delivered; a failure
whose output matches `no_publication_pattern` leaves the feature blocked until the owner confirms
delivery; any other failure leaves it not delivered. Commands: `cli.ts ci`, `cli.ts skip` and
`cli.ts delivery`.

## Investigation

| Field | Value |
| --- | --- |
| `findings_document` | `on_request` (default) or `always`. With `always`, invoking investigate is the request to write its findings document. |
| `analysis_dir` | Where findings documents live (default `docs/analysis`). |

Before writing, investigate searches the analysis documents and open issues for the case. A covering
document is extended, never duplicated. An existing issue never holds the only copy of the findings: they
go in a document, and an issue update, where investigate has authority to make one, is a summary with a
link. An investigation ends with one verdict: act now, track (with the conditions that would change
it), or reject.

## Claiming and isolation

| Field | Value |
| --- | --- |
| `implement_worktree` | `shared` (default) or `isolated`. With `isolated`, implement never claims or edits in the primary worktree, the first entry of `git worktree list`. |

`bun scripts/loop/cli.ts claim` claims a planned feature from any worktree at the freshly fetched
default-branch tip with no tracked change, whether `HEAD` is detached, on the default branch or on a
branch this session created or was handed (`--owned`). It refuses an unrelated branch, a stale tip or a
stray change before writing anything; the fetch may move only remote-tracking refs. It pushes the claim
with `git push origin HEAD:<default branch>` and then creates the feature branch in that worktree. A
rejected push keeps the local claim commit, creates no feature branch and reports the claim pending.
`bun scripts/loop/cli.ts isolation --host-worktree-tool true|false` says whether to continue, to ask the
host's own worktree tool for a worktree, or to stop before writing.

`bun scripts/loop/cli.ts context --repo <dir>` prints the reading list (instruction files, then the
project procedure) and the lenses.

Only `spec_reviewer` and `implementation_reviewer` accept a `command` route; settings that give one to
`author` or `implementer` are refused, naming the role. Agent and skill files never name a model.

A command route runs its CLI in its own PID namespace (`unshare --user --pid`), so every process it
started, even one that left its group and cleared its environment, stops when the CLI exits. On a host
without that boundary, a command-route review stays pending.

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

The file serves every repository on the machine, so an entry for a role that this repository routes
to the host is ignored. One naming a model or arguments is refused.
The model, the arguments and the role mapping always come from the committed file.
