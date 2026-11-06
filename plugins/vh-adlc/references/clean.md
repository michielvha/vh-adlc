# Host cleanup

`vh-adlc clean` removes what a repository's killed runs left behind on this host. It touches only
top-level `/tmp` entries that the binary's built-in globs (`go-build*`, `gopls-tempmod*`, 24 hours) or the
repository's `.vh-adlc/cleanup.yaml` match, entries inside the project's temp root, and, with their flags,
Compose projects and kind clusters that manifest names. It reads the manifest from `origin`'s default
branch, so a rule counts once it is pushed there. `vh-adlc env` creates the temp root a project's own
entry points can point `TMPDIR` and `GOTMPDIR` at.

## Procedure

1. Run `vh-adlc clean --dry-run` from the repository, or with `--repo <dir>`. Report what it would
   remove, what it keeps and why, and what needs a flag.
2. When the user asked for cleanup, or the session cannot work because `/tmp` is full, and the dry run
   answered with no failing finding, run `vh-adlc clean`. Report what it removed and the space freed.
3. Pass `--compose` or `--kind` only when the user asks for them. A dry run without them still lists an
   abandoned Compose project or kind cluster under `needs_flag`, so you can tell the user it exists.
4. If the session is still blocked, list the kept entries and the `unmatched` count and size for the
   user. Remove nothing by hand.

`--older-than <duration>` raises every age for one run and never lowers one.

## Reports

The binary prints one JSON report. `knowledge` is `null`, because neither command reads conventions, and
`data` holds:

| Field | Meaning |
| --- | --- |
| `dry_run` | Whether this run only planned. |
| `removed` | What went, or in a dry run what would go: `kind`, `name`, `rule`, `reason` and `bytes`. |
| `kept` | What a rule matched and the run kept, with its `reason`: `younger`, `in-use`, `mount-point`, `symlink`, `other-owner`, `unreadable`, `live`, `unmarked` or `removal-failed`. |
| `needs_flag` | Abandoned Compose projects and kind clusters left for `--compose` or `--kind`. |
| `unmerged` | In a dry run, what a working-tree manifest that differs from the default branch would add. An applied run never uses it. |
| `freed_bytes` | The space `removed` frees. |
| `unmatched` | The count and size of the user's top-level `/tmp` entries no rule matched. |

| Result | When | What to do |
| --- | --- | --- |
| `answered` | A dry run with no failing finding | Report the plan and apply it if step 2 allows. |
| `pass` | An applied run that removed what it planned | Report what went. |
| `fail` | `removal-failed`, `manifest-invalid`, `engine-unreachable`, `kind-unavailable`, `temp-base-refused` or `host-settings-invalid`; a dry run fails on them too | Report the finding and do not apply. |
| `error` | `unsupported-platform`, `running-as-root`, `pid-namespace` or `git-too-old` | Report it; nothing was read or removed. |

`manifest-missing`, `default-branch-unknown`, `manifest-unmerged` and `engine-absent` are notes. With
`engine-absent`, no Docker engine answered, so container bind mounts were not checked. A working-tree
manifest that differs from the default branch and is invalid is a `manifest-unmerged` note naming the
refusal: a dry run plans nothing from it and does not fail, because an applied run never reads it. Only
an invalid default-branch manifest is `manifest-invalid`.

## What counts as in use

An entry is in use when a process of the same user holds the entry or a path inside it, through its
`cwd`, `exe`, an open file, a mapping or a bound socket, or when a container, running or stopped,
bind-mounts the entry or a path inside it. A container that bind-mounts `/tmp` or any directory above it
marks no top-level `/tmp` entry as in use. One that bind-mounts the project's temp root or any directory
above it, the temp base included, marks no temp-root entry as in use; `-v "$TMPDIR:$TMPDIR"` once `env`
has set `TMPDIR` is one, and so is a `$HOME` mount with a temp base under `$HOME`. Only age then protects
what the container uses. A container mounting all of `/tmp` or `/` should never run on a host that uses
`clean`. Age is also the only protection against other users' processes, same-user processes whose
`/proc` entries cannot be read, and Podman bind mounts.

## When the binary cannot run

- No `vh-adlc` on `PATH`, or `clean` answered with `usage` by an older binary: say in one line that the
  binary with `clean` must be installed on `PATH`, as the installation guide's host cleanup step shows,
  and stop.
- `pid-namespace`: say in one line that this session runs in a sandbox where `clean` cannot see the
  host's processes, and that the user can run `vh-adlc clean` in a terminal. A default `workspace-write`
  Codex session may be one.
- A shell that cannot start because `/tmp` is full: the user runs `vh-adlc clean` in a terminal. The
  binary writes nothing to `/tmp`.

## Allow rules

One rule per harness, in user scope, lets any session run the operation without a prompt:

- Claude Code, `~/.claude/settings.json`: `"permissions": {"allow": ["Bash(vh-adlc clean *)"]}`
- Codex, `~/.codex/rules/default.rules`: `prefix_rule(pattern=["vh-adlc", "clean"], decision="allow")`

The rules also match `--compose` and `--kind`, so step 3 is what keeps those to a user's request.

## The manifest

```yaml
schema_version: 1
project: example
temp_root: {max_age: 24h}
tmp:
  - {glob: "example-run-*", max_age: 12h}
compose:
  - {project: "example-*", volumes: true}
kind:
  - {cluster: example-e2e, liveness: {kind: pid, label: example.kind-run}}
```

Every glob and name needs four literal characters before its first wildcard and no path separator, and
every age is at least an hour. A Compose project goes only when the working directory of every one of
its containers is gone. A kind cluster goes only when it has marks, volumes carrying the liveness label
and `io.x-k8s.kind.cluster=<name>`, and every mark has ended.
