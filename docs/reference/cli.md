[Documentation](../README.md) / CLI

# CLI reference

The plugin calls the `vh-adlc` binary for document and Git checks. You normally
invoke the plugin's operations; direct CLI use is useful when inspecting a result
or integrating the checks into another tool.

The binary answers mechanical questions and prints a JSON report. It does not
edit feature documents, fetch Git refs, or run the agent workflow. Two commands
act on the host: `env` creates a project's temp root and `clean` removes what a
project's killed runs left behind.

## Get the binary

Download the archive for your platform from
[releases](https://github.com/michielvha/vh-adlc/releases) and
[verify it](../security/verifying-releases.md) before running it. The plugin uses
the exact binary in its lock file, which can differ from the latest release.

From a source checkout, the plugin installer prints the path to its verified binary:

```sh
VH_ADLC=$(bash plugins/vh-adlc/scripts/ensure-vh-adlc.sh)
"$VH_ADLC" --version
```

## Commands

| Command | Question |
| --- | --- |
| `knowledge --page <path>` | Which conventions revision and feature root apply? Repeat `--page` for each needed page. |
| `find --issue <number>` or `find --slug <slug>` | Is there an existing feature document? |
| `lint <doc>` | Is the document well formed? |
| `fresh <doc>` | Are its reviews current? |
| `gate <target-status> <doc>` | May the document change to this status? |
| `next <doc>` | What is the next step? |
| `review check <doc> --review <id> --returned <file>` | Were the reviewer's records stored as returned? |
| `settings read --stdin` | What value does the YAML settings file on stdin hold? |
| `env [--sh]` | Where is this project's temp root? Creates it if needed. |
| `clean [--dry-run] [--older-than <duration>] [--compose] [--kind]` | What did killed runs leave behind? Removes it unless `--dry-run` is given. |

Every command above except `settings read`, `env` and `clean` requires
`--plugin-pin`, a full 40-character lowercase SHA. Those three read no
conventions, so they need no pin, ignore one if given and report `knowledge: null`.
Read the current value from [knowledge.md](../../plugins/vh-adlc/knowledge.md).
`--repo <dir>` selects the repository and defaults to the current directory.
`--offline` reads documentation from the cache only.

For example, replace the placeholders with the pin and paths for your checkout:

```sh
"$VH_ADLC" knowledge --repo <repo> --plugin-pin <sha> \
  --page conventions/feature-documents.md --page guides/humanize-prose.md
"$VH_ADLC" lint <doc> --repo <repo> --plugin-pin <sha>
"$VH_ADLC" next <doc> --repo <repo> --plugin-pin <sha>
```

Before `fresh` or `gate`, fetch the repository's default branch yourself. The
binary never fetches. A gate checks the current document; it does not change its
status. Apply a status change only after a passing result and follow the
[feature loop](../../plugins/vh-adlc/references/loop.md).

`settings read` takes one file's bytes, puts its value in `data.value` with
mapping keys sorted, and reports `knowledge: null`. It refuses anything outside
its strict subset of YAML with `malformed`, `data: null` and one
`settings-invalid` finding. The finding gives a fixed reason and, when known, a
line number. It never holds text from the file.

## Host cleanup

`env` and `clean` run on Linux only and report `unsupported-platform` elsewhere.
Each project declares what it owns in `.vh-adlc/cleanup.yaml`; the
[clean reference](../../plugins/vh-adlc/references/clean.md) gives the format and
every report field.

`env` reads the manifest from the working tree and creates `<temp_base>/<project>`
with mode 0700. `temp_base` defaults to `/tmp/vh-adlc-<uid>`; set another
absolute path in `host.yaml` under your user config directory
(`~/.config/vh-adlc/host.yaml` on Linux):

```yaml
temp_base: /home/me/.cache/vh-adlc-tmp
```

It may not be your home directory, a directory inside a Git work tree or a
parent of the repository. `env` reports `TMPDIR` and `GOTMPDIR` in `data`. With
`--sh` it prints two shell-quoted `export` lines instead, for a build to `eval`:

```sh
if lines=$(vh-adlc env --sh); then eval "$lines"; fi
```

On failure `env --sh` prints nothing to stdout, writes the report to stderr and
exits non-zero, and `env` creates nothing.

`clean` requires Git 2.45 or newer and refuses to run as root or outside the
initial PID namespace. It reads the manifest from `origin`'s default branch
without fetching, and always applies the built-in `go-build*` and
`gopls-tempmod*` globs, 24 hours old. `--dry-run` changes nothing and also plans
a differing working-tree manifest under `unmerged`. `--older-than` can only
raise an age. Compose projects and kind clusters change only with `--compose`
and `--kind`; without them a run lists them under `needs_flag`.

## Output and exit codes

Commands return one JSON object with `schema_version`, `command`, `result`,
`knowledge`, `data`, and `findings`. The `--version` option prints a plain version
line, and `env --sh` prints shell lines. See the
[JSON schema](../../schema/vh-adlc.schema.json) for the full contract.

| Exit | Result |
| --- | --- |
| `0` | `answered` or `pass` |
| `1` | `fail` |
| `2` | `usage` |
| `3` | `malformed` or `local-format` |
| `4` | `error` |
| `5` | `invalid-pin`, `missing-page`, or `unreachable` |

`local-format` means the repository uses its own feature format; the binary did
not decide the gate. Read the report's findings before continuing. A failed or
unavailable deterministic check must not be reported as a pass.
