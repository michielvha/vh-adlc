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
| Verification rung | A declared check with a path condition or `always` and the stages it runs at: each task's verification, and push, completion and delivery. |
| Project procedure | The consumer's file of local rules that every SDD operation reads, named by `project_procedure`. |
| Primary worktree | The first entry of `git worktree list`; with `implement_worktree: isolated`, implement never writes there. |
| No publication path | The delivery verdict for a merge commit that carries the skip marker and touches only skip-eligible paths. |
| Delivered | A feature whose release paths have all published, or whose merge has no publication path. |
| Instruction freshness | The state `context` reports for a listed file against origin's default branch tip, with the version an operation reads. |

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
| `roles.<role>.argv` | `command` only: the executable, then its arguments. It must contain `{prompt}` or `{prompt_file}`, and may use `{model}` and `{export_dir}`. No other placeholder is accepted. `{prompt}` passes the whole prompt as one argument, which Linux limits to 128 KiB, and a scoped spec re-review's prompt carries the document diff, so a large revision can pass that limit. Prefer `{prompt_file}`, for example `sh -c 'f=$1; shift; exec "$@" - < "$f"' sh {prompt_file} codex exec ...` for a CLI that reads `-` from standard input. |
| `roles.<role>.model_attestation` | Optional, `command` only: `codex-session` reads the served model from Codex's session log for the run's thread id instead of the reviewer's self-report; the `argv` must include `--json`. A missing log, no or several recorded models, or a mismatch leaves the review pending. |
| `review_scratch` | Optional list of directories inside the checkout left out of the before-and-after check: build output a shell-enabled implementation reviewer may write to, and ignored directories other sessions or tools write while a review runs, such as other worktrees, temp roots and `node_modules`. Changes there do not leave the review pending. The settings check an entry by its path alone, so it may be a symlink, such as a worktree's shared `node_modules`; under the macOS boundary the route also resolves it and leaves the review pending when it points onto a protected path. Never `.`, an absolute path, `..` or `.git`. |
| `project_procedure` | Optional contained file of local rules. Every SDD operation reads it before acting. |
| `instruction_files` | Optional contained files, such as `AGENTS.md` and `CLAUDE.md`. Every SDD operation reads them, and every spec review checks the document against them. |
| `lenses` | Optional list of `{name, check, severity}`: a named check every spec review applies, with severity `blocking`, `should-fix` or `nit`. |

## Verification rungs

| Field | Value |
| --- | --- |
| `verification_rungs[].name` | Lowercase name, unique. |
| `verification_rungs[].when` | `always`, or `{paths: [glob, ...]}` matched against the whole feature delta. |
| `verification_rungs[].stages` | Optional list of `task` and `completion`, default both, with no duplicates. It must include `completion`. A rung with `stages: [completion]` is skipped at each task's verification and still runs before push, completion and delivery. Needs plugin 0.29.0 or later; older versions refuse the field. |
| `verification_rungs[].command` | A shell command run from the worktree. Exit 0 passes; exit 126 or 127 means it could not run; any other exit fails. |
| `verification_rungs[].procedure` | Instead of a command: a written procedure the operation performs and records. |
| `verification_rungs[].timeout_minutes` | Optional whole number of minutes a command may run, default 60. A command that runs longer is stopped with every process it started and reported as not run, with a reason that says it timed out. |
| `verification_rungs[].skipped_pattern` | Optional regular expression for an output line that reports a skipped mandatory subcheck; its first group names the subcheck. |

Before merge the feature delta is the branch against its merge base with the default branch, plus every
uncommitted change; after merge it is the merge commit against its first parent. Every applicable rung
must pass at the commit being pushed or delivered; a result recorded at another commit does not count. The
one exemption is ship's completion commit: ship runs the completion stage just before its Gate step, and
pushes the completion commit that follows without a second run when that commit changes only the feature
document and the push happens in the same ship run. A retried or resumed push runs the completion stage
again at the head. Implement's Finish sets `complete` only when no rung was deferred, every rung having
passed at its task commits; a push still goes through ship's completion run. A failed rung always blocks. A rung that could not run, or that reported a skipped mandatory
subcheck, blocks unless the owner allows that exact rung (`<rung>`) or subcheck (`<rung>/<subcheck>`) for
that run, and the report records the allowance. With rungs or a post-merge watch declared, a feature
lands by merge commit only. Without rungs, operations keep reading verification commands from
`AGENTS.md`. `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task|completion --run true`
reports the stage, the delta, the applicable rungs, `deferred`, a result for every declared rung and whether
the stage may advance; a rung whose path condition does not hold is listed as not run with that reason and
does not block. `--stage task` selects the rungs whose `stages` include `task`; `deferred` lists the rungs
whose path condition holds but which run at the completion stage only, reported as not run without being
executed. `--stage completion` selects every applicable rung, and `deferred` is empty. Without `--stage`,
the command runs the completion stage, so a caller that leaves it out never checks less. `--stage task`
with `--merge` is refused, as is any other value. Without `--run true`, the command still reports
`deferred` and exits 3 when rungs are declared, with `blocking` listing the stage's applicable rungs. A written procedure rung
counts only through `--record <rung>=passed|failed:<what was observed>`, given by the operation that
performed it, at the current head. Repeat `--record` for each procedure rung, or join records with `;`; a `;` inside a record's own text
stays in it.

## Delivery

| Field | Value |
| --- | --- |
| `ci_trigger` | `automatic` (default) or `manual`. With `manual`, ship reports CI as not triggered by policy and never dispatches a run. With `automatic` in a private or internal GitHub repository, `cli.ts ci` adds a `warning`, because the delivery convention runs private repository CI locally; the owner may keep hosted checks, so it never blocks. |
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

`bun scripts/loop/cli.ts context --repo <dir> [--default-branch <branch>]` prints the reading list
(instruction files, then the project procedure), the lenses, `freshness` (see Instruction freshness
below), and `plugin`: the running plugin version and, where the host keeps an
install record, the installed one. A host keeps the plugin a session started with, so after an update
`plugin.stale` is true until the session restarts, and operations stop before writing. When a `vh-adlc`
on PATH is not the plugin's locked binary, because its digest does not match the lock, `plugin.binary_warning`
says so and `plugin.path_binary` is `unverified`, and operations run only the binary
`scripts/ensure-vh-adlc.sh` prints. Neither the context command nor the installer ever runs an unverified
PATH entry.

Only `spec_reviewer` and `implementation_reviewer` accept a `command` route; settings that give one to
`author` or `implementer` are refused, naming the role. Agent and skill files never name a model.

A command route keeps every process its CLI starts, even one that left its group and cleared its
environment, from changing the owning worktree or the private clone after the review has been judged.
On Linux it runs the CLI in its own PID namespace (`unshare --user --pid`), so all of them stop when the
CLI exits. On macOS it runs the CLI under a `sandbox-exec` profile that denies every process it starts
writes to the owning worktree, its Git directory and common Git directory, the private clone or export,
and each of their parent directories, outside `review_scratch`. Everything else stays writable, such as
the temporary directory, `~/.codex` and build caches, and a process that outlives the review is not
stopped there. On macOS a review also stays pending when a protected file already has a second hard
link, when a `review_scratch` entry resolves onto a protected path, and when a protected file disappears
or can't be read while the route checks for hard links, which is worth a retry. On a host with neither
boundary, including a process already inside another Seatbelt sandbox, a command-route review stays
pending.

Seatbelt profiles do not nest, which has two consequences on macOS. A Codex route passes
`-s danger-full-access`, because Codex's own sandbox cannot start inside the route's profile; its tool
commands can then write outside the protected paths and reach the network. And a reviewer inside the
profile cannot run tests that start their own `sandbox-exec`, such as the route's own boundary tests;
those tests need a run outside any sandbox, and run inside one they report a single "unsandboxed run"
failure.

The reviewer CLI never inherits the controller's environment, which holds the session's credentials: it
gets `PATH`, `HOME`, `TMPDIR`, `USER`, `LOGNAME`, `SHELL`, `LANG`, every `LC_*`, `TERM`, `CODEX_HOME` and
the `XDG_*` base directories, when set, and nothing else. On macOS the profile also refuses reads, writes
and renames of a fixed list of credential stores under the reviewer's home: `.ssh`, `.aws`, `.kube`,
`.docker`, `.config/gh`, `.config/gcloud`, `.netrc` and `.git-credentials`. A `review_scratch` entry that
equals, contains or lies inside one of those stores, or equals a store's parent, leaves the review
pending. The macOS Keychain stays reachable, because denying it also breaks Codex's network connections,
so a token kept there can still be read by a reviewer command; other readable files stay readable; and on
Linux the PID namespace denies no reads, so the listed stores stay readable there.

Feature reservations use the adopted remote's committed `.vh-adlc/work-ownership.yaml`,
independent of local loop overrides or a stale feature checkout. See
[reservation adoption](authority.md#reservation-adoption) before enabling them.

## Instruction freshness

A checkout behind the default branch holds old copies of the repository's rules, and nothing in the
files says so. `context` therefore fetches origin's default branch, with `--no-tags` and a 30-second
timeout, which moves only `refs/remotes/origin/<branch>`. It then compares the settings file and each
listed file with that tip and with the merge base of `HEAD` and the tip:

| State | When | `read` |
| --- | --- | --- |
| `current` | The local copy equals the tip's | the path |
| `edited` | The local copy differs from the tip's and from the merge base's: this branch changed it | the path |
| `stale` | The local copy equals the merge base's, and the tip changed it | `<tip sha>:<path>` |
| `removed` | The local copy equals the merge base's, and the tip deleted it | `null` |
| `unverified` | No tip or merge base could be found; `freshness.reason` says why | the path |

When the settings file itself is `stale`, the reading list and lenses come from the tip's settings, so
a rule file added on the default branch is listed too. If the tip's settings fail to load,
`freshness.settings.error` says why and the local list stays.

Every operation that reads these files follows the same rule:

- Run `context` with `--default-branch <default branch>`. Without it, `context` uses `origin/HEAD` or
  asks origin with `git ls-remote`.
- Read each entry of `freshness.files` at its `read` value: a path with the file tools, a revision with
  `git show <read>`. Skip `removed` entries. On `unverified`, read the local copies and open the report
  with a line naming `freshness.reason`. `freshness.settings` is not read; it says which settings
  supplied the list.
- The conventions revision is always the one `vh-adlc knowledge` resolves from the checkout. A pin line
  in a copy read from the tip changes neither the revision the operation follows nor the one it passes
  to the binary and reviewers, so the operation and the binary's gates judge by the same conventions.

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
