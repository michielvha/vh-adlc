# The vh-adlc loop

Every operation follows the same frame. The steps below are the plugin's procedure; the rules they
apply live in `vhco-pro/docs` at the resolved revision, and an operation cites the page it took each
rule from.

`skills/vh-adlc-clean/SKILL.md` skips steps 1 and 2 altogether; audit's offline bootstrap below still
uses the verified binary and knowledge. Clean calls `vh-adlc` from `PATH` without the installer, so that
its allow rule matches, and it skips `knowledge`, because `clean` and `env` read no conventions. The
binary it runs is therefore not checked against the lock.

## Link the work you refer to

In updates, approval requests and handoffs, name the kind of artifact and link it the first time
you refer to it. Use a Markdown link with the official URL for a published document, issue, pull
request, project board, release or CI run. For example, call a roadmap a Markdown file and link
directly to the file or relevant section. Link commits and review evidence at the exact revision when
it matters. For unpublished work, label it local and link the actual file using its absolute path.
When a link is unavailable, give the repository and exact path or identifier. Use links the reader is
authorized to open.

## Weigh the harm before building machinery

Machinery is any new mechanism a fix adds: code, a workflow, a credential or account, a gate, or
signalling between systems. Before you recommend, file or specify it, write the harm statement:

- The harm: who is affected, how often, how bad it is, and whether it heals on its own.
- The simplest alternative without machinery: a process rule, a manual step, documentation, or
  waiting for a later milestone.

Recommend machinery only when it clearly beats that alternative, and say why. Otherwise recommend
the alternative. The same check comes first when one feature would become a prerequisite of another,
before it gates any work or any fan-out waits on it: a prerequisite that loses to its alternative
gates nothing, and the dependent work goes ahead with the alternative.

## Product profile

A repository states its product in a section headed Product profile in its root `AGENTS.md`: what the
product is, who uses it, its stage, and what is at stake (tenants, user data, money, credentials). A few
lines are enough. When the resolved `conventions/feature-documents.md` names the product profile as the
context for severity, spec reviews rate failure paths by it, and the spec skill judges Open Questions and
the owner's nit list against it together with the files `bun scripts/loop/cli.ts context` lists.
Without a profile, reviews judge as for production software with users whose data matters. Each adopter
writes its own; the plugin never adds one to a consumer repository.

## Check host capacity before any fan-out

Before you create a worktree, start another session or sub-agent, or launch parallel or long local
work (independent reviews, test suites, cluster runs), run the capacity check on the checkout and the
temp directory and read its last line:

```sh
bash "<plugin directory>/scripts/host/capacity.sh" "<checkout>" "${TMPDIR:-/tmp}"
```

On `capacity: blocked`, start nothing new. Report each blocked line to the owner and wait for them to
free space or load. Do not delete shared host data to make room, and do not retry on another path of
the same filesystem. Run the check again before every later wave of fan-out, and as soon as a command
stalls or fails with no space left on device. Count what you are about to add: several sessions that
each check out the repository and build images need far more room than one. A btrfs host can report
free space while its metadata is full, which the check catches and `df` alone does not.

## 1. Get the binary

Audit entry overrides this section's online bootstrap, including when selected through lifecycle
intake. Use `scripts/audit/bootstrap.ts --offline` as the audit skill specifies: cached verified binary,
validated settings metadata, then cache-only knowledge for its normalized `knowledge_pages`. Missing
prerequisites stop audit work with an explicit setup handoff. Never invoke the online installer first.
The metadata read is the narrow exception to knowledge-first order. Explicit setup may obtain the
binary and complete pinned pages separately; other operations keep the ordinary procedure below.

The plugin directory is the one that holds `skills/`: two levels above the skill's own directory, which
the host names when it loads the skill. Resolve a symlinked skill directory to its real location first.
Run the installer through Bash from there and use the path it prints for every later call:

```sh
VH_ADLC=$(bash "<plugin directory>/scripts/ensure-vh-adlc.sh")
```

Some native installers do not preserve executable bits. Bash invocation requires only a readable
script; do not change installed permissions. The installer still performs checksum verification
against `vh-adlc.lock.json` and fails closed on any mismatch; never work around a failure.

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
`Conventions: vhco-pro/docs@0e52f51 (repository pin, AGENTS.md); prose edited with guides/humanize-prose.md`.
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

When `source` is `plugin`, the repository has no pin yet. `vh-adlc-investigate`, `vh-adlc-resume` and
`vh-adlc-review`, `vh-adlc-docs-impact` and `vh-adlc-docs-drift` add none: they work with the plugin pin and report the missing pin, and onboarding waits
for the next operation that writes. A review that committed onboarding first would move its own target.
`vh-adlc-spec`, `vh-adlc-tasks`, `vh-adlc-implement` and `vh-adlc-ship` call `knowledge` again with the
same pages plus `guides/onboard-a-repository.md`, and read it. Their first change then adds the pinned
`AGENTS.md` and its bridges as that guide describes, merged into any local instructions, in its own
commit. Local instructions win over the central pages; report every conflict between them.
Onboarding also checks GitHub's automatic deletion of merged PR branches with `auto-delete` from
`references/branches.md` and reports the setting. When it is off, ask the owner whether to turn it
on; enable it only after they say yes. The setting is a repository change, not a commit, so it never
holds up the onboarding commit.
Beside that check, onboarding runs the security-settings helper from
`references/security-settings.md` in the mode `security-settings-mode` prints, and reports its
output. That is also a repository change that never holds up the onboarding commit. Onboarding has no
maintenance request, so the committed settings alone decide; it usually runs in `check`, because its
own commit is what links the settings. A request that is read-only or draft-only, or forbids
pushing or filesystem writes, selects `check` without calling the command. A nonzero
`security-settings-mode` exit, whatever its cause, leads to `check` with mode reason
`committed-settings-unresolved` and the cause, never to `apply`. Under `check`, report the states,
say how to opt in with `security_settings: apply`, and record the onboarding guide's security
checklist item as pending the owner's choice. Never run the guide's manual commands or the helper's
`apply` on an in-session yes.

Every page the loop needs is requested on every call, so a pin older than the plugin's pages stops with
`missing-page`: always include `conventions/feature-documents.md` and `guides/humanize-prose.md`.

A repository may declare loop settings in `.vh-adlc/loop.yaml` (`references/loop-settings.md`). The
SDD operations (spec, tasks, implement, review, ship, investigate and resume) then read their loop role's
route with `bun scripts/loop/cli.ts route`, and before acting read the instruction files and project
procedure that `bun scripts/loop/cli.ts context` lists.

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

Read-only checks can run before writer entry. When the chosen operation writes a
feature, follow [feature writer entry](authority.md#feature-writer-entry) once in the
owning checkout. The standalone claim command checks entry itself in adopted repositories.

## 4. Write prose a reader sees

Before committing or posting any prose a reader will see (document sections, commit messages, PR and
issue bodies, review summaries, run reports), edit it with `guides/humanize-prose.md` at the resolved
revision. The knowledge line at the top of the report names that page and revision. Records a reviewer
returned are stored exactly as returned.

Restate what an issue, an owner turn or any other source says in your own edited words. Do not paste its
wording as a quotation, even inside quotation marks: a quoted phrase keeps the tells the guide removes.
This holds in the report too. When you say you followed an owner's note, or chose not to, describe it in
your own words and never repeat its phrases.
Code, commands and file contents stay exact, in code spans.

## 5. Report

End every operation by reporting what changed, what was verified, every binary result acted on, and what
is left.

Name every issue, pull request, commit, release, workflow run, repository or document hosted online in
a report, question or summary as a Markdown link with a short readable label where it is first
mentioned, such as `[OWNER/REPO#8](https://github.com/OWNER/REPO/pull/8)`,
`[OWNER/REPO](https://github.com/OWNER/REPO)` or, for a commit,
`[abc1234](https://github.com/OWNER/REPO/commit/abc1234)`. Never give only a bare `#8`, `OWNER/REPO#8`
or `OWNER/REPO`, and never paste a raw URL as plain text. A local file keeps its path. The same holds in
documents and PR and issue bodies you write. A commit message, or other text where Markdown does not
render, gives the full URL instead. Quoted records stay as returned.

When reporting finished spec work to the owner or requesting spec acceptance, including through resume,
present the owner-facing summary from `skills/vh-adlc-spec/SKILL.md` in the conversation before the
acceptance question. Keep the full document and review status available as supporting detail.

## Clean up when the session's work is done

Clean up once, when the work this session was started for is finished and the session is about to be
archived or handed back: a feature merged and its branch removed, a maintenance or audit batch delivered,
an investigation or review reported with nothing left to run. Do not clean up between operations of the
same work, because the next step would have to check out, build and download everything again.

A failed run is not the end of the work when a retry is planned. While you or the owner still intend to
retry, keep what the retry reuses (pulled images, build and dependency caches, a kept cluster, a
restore target) and say in the report that you kept it and for which retry. Remove it as soon as no
retry is planned or wanted, and at the latest when the session's work is done. Never let leftovers of
failed runs pile up across retries: a retry reuses the earlier run's kept state or removes it first.

A script or tool you write that creates per-run scratch (a temporary container engine, a restore target,
a fixture checkout) removes that scratch on every exit, success or failure, through a trap or `finally`,
unless the run was started with an explicit keep-for-retry option. It pulls images and dependencies into
a reusable cache it can find again, not into a fresh per-run directory, so a retry does not download the
same gigabytes again.

1. Remove what this session created and no longer needs: scratch directories, temporary worktrees and
   their branches, worktree slots, Compose projects and clusters it started for itself, and background
   processes it launched. Keep what open work still depends on, and never touch what another session
   created.
2. Run `vh-adlc clean --dry-run --compose --kind` from the repository. When it answers with no failing
   finding, run `vh-adlc clean --compose --kind`. The binary removes only what its built-in rules and
   the repository's cleanup manifest declare, and only Compose projects and clusters whose runs have
   ended, so this needs no separate permission. Follow `references/clean.md` for its findings.
3. Name what you removed and the space it freed in the final report, and list anything you kept.
