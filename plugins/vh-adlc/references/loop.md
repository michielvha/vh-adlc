# The vh-adlc loop

Every operation follows the same frame. The steps below are the plugin's procedure; the rules they
apply live in `vhco-pro/docs` at the resolved revision, and an operation cites the page it took each
rule from.

## 1. Get the binary

The plugin directory is the one that holds `skills/`: two levels above the skill's own directory, which
the host names when it loads the skill. Use `$CLAUDE_PLUGIN_ROOT` instead only when the environment sets
it. Run the installer from there and use the path it prints for every later call:

```sh
VH_ADLC=$("<plugin directory>/scripts/ensure-vh-adlc.sh")
```

The installer verifies the binary against `vh-adlc.lock.json` and fails closed on any mismatch; never
work around a failure.

When the installer fails, open the report with a line that reads exactly
`deterministic checks unavailable`, so a reader can search for it, and carry on only with read-only work:
investigating, drafting and reporting. Every status change stops, unless the owner
explicitly allows a procedural gate for this run. Record that permission in the feature document and
write the gate line as `vh-adlc gate <target>: procedural (owner allowed: <reason>)`.

## 2. Resolve knowledge

Call `knowledge` first, with every docs page the operation will read:

```sh
"$VH_ADLC" knowledge --repo <dir> --plugin-pin <pin from knowledge.md> --page <path> ...
```

State the result in one line that also names the prose guide, for example
`Conventions: vhco-pro/docs@e4d58d2 (repository pin, AGENTS.md); prose edited with guides/humanize-prose.md`.
Every report opens with this line, after the `deterministic checks unavailable` line when there is one,
including a report that stops at a gate or waits for the owner. Every call below passes the same
`--repo` and `--plugin-pin`, written out on each call. The binary needs every word as its own argument:
the command, each path, each flag and each value. A quoted variable that holds several of them arrives as
one unknown command or flag.

The binary caches each page it resolved. Read them from that cache rather than from memory:
`${XDG_CACHE_HOME:-$HOME/.cache}/vh-adlc/docs/<sha>/<page>` on Linux and
`$HOME/Library/Caches/vh-adlc/docs/<sha>/<page>` on macOS.

Stop and report when the result is `invalid-pin`, `missing-page` (recommend the pin bump it names) or
`unreachable`. Each finding already names the page or pin at fault, so do not re-run `knowledge` with
fewer pages to see which ones resolve, and do not read any page from that revision.

When `source` is `plugin`, the repository has no pin yet. Call `knowledge` again with the same pages plus
`guides/onboard-a-repository.md`, and read it. The operation's first change there then adds the pinned
`AGENTS.md` and its bridges as that guide describes, merged into any local instructions, in its own
commit. Local instructions win over the central pages; report every conflict between them.

Every page the loop needs is requested on every call, so a pin older than the plugin's pages stops with
`missing-page`: always include `conventions/feature-documents.md` and `guides/humanize-prose.md`.

## 3. Decide with the binary

The binary decides; the operation only acts on its JSON result and quotes it in the report.

| Step | Command |
| --- | --- |
| Is there already a document for this issue or topic? | `find (--issue <n> \| --slug <s>)` |
| Is the document well formed? | `lint <doc>` |
| Are the reviews still current? | `fresh <doc>` |
| May the document change status now? | `gate <target-status> <doc>` |
| What comes next? | `next <doc>` |
| Were the reviewer's records stored as returned? | `review check <doc> --review R-<n> --returned <file>` |

Before every `fresh` and `gate`, run `git fetch origin <default branch>`; the binary never fetches.

A status change happens in this order and no other: run `gate <target>` while the document still has its
current status, edit the status only when the result is `pass`, re-run `lint`, and commit with the gate's
`data.line` copied into the commit body. A failing gate changes nothing: report each failing condition
and stop.

A `malformed` result means the document must be fixed, never bypassed. `local-format` means the
repository keeps its own format: run the gate procedurally, as that repository does, and say the binary
did not decide it.

## 4. Write prose a reader sees

Before committing or posting any prose a reader will see (document sections, commit messages, PR and
issue bodies, review summaries, run reports), edit it with `guides/humanize-prose.md` at the resolved
revision. The knowledge line at the top of the report names that page and revision. Records a reviewer returned are stored exactly
as returned.

Restate what an issue, an owner turn or any other source says in your own edited words. Do not paste its
wording as a quotation, even inside quotation marks: a quoted phrase keeps the tells the guide removes.
Code, commands and file contents stay exact, in code spans.

## 5. Report

End every operation by reporting what changed, what was verified, every binary result acted on, and what
is left.
