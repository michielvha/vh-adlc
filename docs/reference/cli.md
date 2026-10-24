[Documentation](../README.md) / CLI

# CLI reference

The plugin calls the `vh-adlc` binary for document and Git checks. You normally
invoke the plugin's operations; direct CLI use is useful when inspecting a result
or integrating the checks into another tool.

The binary answers mechanical questions and prints a JSON report. It does not
edit feature documents, fetch Git refs, or run the agent workflow.

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

Every command above requires `--plugin-pin`, a full 40-character lowercase SHA.
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

## Output and exit codes

Commands return one JSON object with `schema_version`, `command`, `result`,
`knowledge`, `data`, and `findings`. The `--version` option prints a plain version
line. See the [JSON schema](../../schema/vh-adlc.schema.json) for the full contract.

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
