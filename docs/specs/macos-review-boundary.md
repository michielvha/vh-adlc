---
status: draft
status_description: "Revised for drift re-review R-18: the reviewer gets an allowlisted environment; a host re-review is pending, then owner acceptance."
issue: https://github.com/michielvha/vh-adlc/issues/187
branch: feat/macos-review-boundary
goal: "Spec and implementation reviews in this repository run on Codex from a Mac, with no owner step per review, and no reviewer process can change the owning worktree or the private clone once the review has been judged."
covers:
  - plugins/vh-adlc/scripts/loop/review-route.ts
  - plugins/vh-adlc/scripts/loop/cli.ts
  - plugins/vh-adlc/scripts/loop/settings.ts
  - plugins/vh-adlc/scripts/loop/pages.ts
  - plugins/vh-adlc/scripts/triage/owned-process.ts
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - tests/vh-adlc/evidence/macos-review-boundary/mutants.py
  - tests/vh-adlc/evidence/macos-review-boundary/run-review.sh
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - plugins/vh-adlc/plugin.json
  - .vh-adlc/loop.yaml
  - tests/vh-adlc/loop/review-route.test.ts
  - tests/vh-adlc/loop/owned-process.test.ts
  - tests/vh-adlc/loop/pages-stub.ts
---

# Plan: Codex reviews on macOS

The command route that runs an external reviewer gets a macOS boundary: a Seatbelt profile that denies
every reviewer process writes to the owning worktree, its Git directories, the private clone and the
directories above them. The repository commits a `.vh-adlc/loop.yaml` that sends both reviewer roles to
Codex.

## Context

### Owner summary

Claude writes the specs and the code in this repository, and the owner wants Codex to review them. Two
things stopped that. The repository had no `.vh-adlc/loop.yaml`, so both reviewer roles fell back to the
host, which on Claude Code means Claude. And the Codex command route couldn't run on a Mac: it insisted on
a Linux PID namespace, and the homelab Linux hosts are unreachable.

The PID namespace enforces one guarantee: no reviewer process may outlive the review and change the
owning worktree or the private clone after the before-and-after check has judged it. This feature keeps
that guarantee on macOS by refusing the writes instead of killing the processes. The route wraps the
reviewer command in `sandbox-exec` with a profile that denies writes to the paths the check judges, and to
each directory above them, so a process can't rename a parent and write through the new path. The kernel
applies the profile to every descendant, including one that detaches and clears its environment. Linux
keeps its PID namespace unchanged.

Seatbelt profiles can't nest, which has two consequences. Codex runs with its own sandbox off
(`-s danger-full-access`) inside the route's profile. And a reviewer inside the profile can't run tests that
start their own `sandbox-exec`, such as this feature's boundary tests. For this feature the owner directed
on #187 that the implementer runs those tests on this Mac outside any sandbox "at the exact reviewed
commit" and records the command, the commit, the exit code and the output. The orchestrator then ruled,
under the owner's delegation, that the exact reviewed commit is the code commit whose tree the reviewed
commit carries unchanged, because the record has to be committed on top of the code for the reviewer to
read it. Please confirm that reading when accepting. The Codex implementation reviewer reviews the code and
judges those criteria from that recorded run, in place of the review protocol's rule against judging
stored results. Planned: run inside a sandbox, the route tests will fail once with a clear reason ("The
route tests need an unsandboxed run: ...") instead of failing one by one.

The trade-offs, in plain words. The reviewer CLI and everything it starts get only an allowlisted
environment (paths, user, locale and terminal variables, `CODEX_HOME` and the XDG directories), so tokens in
the session that runs the review, such as `GH_TOKEN` or cloud keys, never reach reviewer commands or the
candidate's tests. Codex still authenticates and attests from `~/.codex`. Codex tool commands can write
anywhere outside the protected paths and reach the network. That includes the home directory, other repositories, Codex's own session log, and
user-level schedulers such as `~/Library/LaunchAgents`, crontab, shell startup files and `~/.gitconfig`.
Something planted there could change the worktree later, and this feature doesn't stop that, on macOS or on
Linux. The host Claude reviewer has the same access today through its Bash tool. The model attestation
reads that same session log, so it catches an accidental model mismatch but not a reviewer that forges its
own log; the owner accepted that limit on #187. A review stays pending when a protected file already has a
second hard link, when a scratch directory resolves onto a protected path, and when a protected file
disappears or can't be read during that check. Hard links on Git objects, which an ordinary local `git clone` creates, are a
stated limit. The orchestrator chose this write posture under the owner's delegation; a deny-by-default
profile would be a revision.

What changed since the R-5 acceptance, from the Codex spec reviews R-6 and R-7 and the owner's answers on
#187: the recorded unsandboxed run of the boundary tests and the loud failure inside a sandbox, replacing
the earlier plan to review boundary-code changes on the host route; the scratch overlap check; a pending
outcome when a protected file disappears during the link check; one new stated limit (session-log
forgery) and a reworded one (Git-object hard links); late writers released by the test after the review
returns; a script for the real-Codex proof that fails closed, used for the implementation half, while the
spec half rests on the stored Codex spec reviews R-6 to R-9 instead of a rerun; the delivery path;
and the files that decide routing, the reviewer's instructions and publication in `covers`.

What changed since the R-13 acceptance: drift re-review R-18 found that the route handed the reviewer the
whole environment of the session running it, credentials included, against the repository's coding
convention. The reviewer now gets an allowlisted environment (AC-12). Nothing else in the scope changed.

Observed so far on this Mac: T1 to T27 are built, each test watched failing first. #182 is merged, and
`tests/vh-adlc/loop/` passes. The recorded unsandboxed run at `5168340e` shows the boundary tests passing,
one clear failure inside a sandbox, and the mutant script catching all twelve mutations. The formal Codex
implementation review R-17 came back ready, attested and with the worktree unchanged; it rated AC-01, AC-03,
AC-04, AC-05, AC-07 and AC-10 met and AC-02, AC-06, AC-08 and AC-11 not met on edge cases, which the
orchestrator residualised to #195 (an alternate `GIT_INDEX_FILE`, the runner's porcelain-only state check,
HEAD removed mid-check, and a dangling scratch symlink, which Seatbelt still refuses to write through). This
revision resets those ticks and residuals. Still planned: the environment allowlist and its test, a new
recorded run, proof run and formal Codex implementation review, then Linux CI after merge.

Acceptance authorizes implementing this on the feature branch and opening a PR. Merging still needs the
owner.

### Background

The harm. Every spec and implementation review in this repository runs on Claude, the model family that
wrote the work. The owner wants Codex to review instead. Without this change that happens on every
review, several a day, and it doesn't fix itself. The simplest alternatives without new machinery all
fail the goal. Running Codex reviews from Linux is out, because the homelab is unreachable. The owner
running Codex by hand for each review was rejected by the owner. Dropping the boundary on macOS was ruled
out, because the guarantee has to stay. Reviewing boundary-code changes on the host route was rejected by
the owner on #187 ("why can codex not run the review, fix that"), and so was a route step that ran
declared commands outside the profile, after Codex review R-7 found it handed candidate code the
controller's authority; the owner's answer was "why would you not just run them on my macbook". The design
below adds the smallest mechanism that keeps the guarantee: one Seatbelt profile and one committed settings
file.

Current state, measured at `e910dfe8` on macOS 26 (Darwin 25.6.0) with Codex CLI 0.172.0:

- The repository has no `.vh-adlc/loop.yaml` (`ls .vh-adlc` lists `cleanup.yaml` and `triage.yaml`), so
  every role keeps the host default (`references/loop-settings.md:35`).
- `runReviewRoute` returns pending unless `result.boundary` is `pid-namespace`
  (`plugins/vh-adlc/scripts/loop/review-route.ts:338`), and `loop-settings.md:136-138` documents that
  requirement.
- `pidNamespaceAvailable()` runs `unshare` without catching a spawn failure and caches the answer in the
  module-level `namespaceProbe` (`plugins/vh-adlc/scripts/triage/owned-process.ts:20-27`). macOS has no
  `unshare`, so Bun throws `Executable not found in $PATH: "unshare"`. The route catches that error as "the
  reviewer command could not start" (`review-route.ts:333`). On this Mac,
  `bun test tests/vh-adlc/loop/review-route.test.ts` fails 39 tests with that reason and passes 5.
- The marker scan is blind on macOS. `markedProcesses` reads `ps -axeww -o pid=,command=`
  (`owned-process.ts:45`), and on this Mac that output shows no process environments, not even for a
  same-user child started with the marker set. A `runOwnedClient` run whose child forked a `setsid` writer
  reported `confirmed: true, survivors: []`, and the writer still wrote two seconds later. This happened
  with the marker kept and with the environment cleared. That bug is #186 and stays out of this feature.
- Smoke runs of real Codex through the route, on 2026-11-27 at `b765e737` on `feat/macos-review-boundary`
  (not stored reviews): a script called `runReviewRoute` with the planned argv
  (`codex exec -m gpt-6.2-sol -s danger-full-access --skip-git-repo-check --json` through `{prompt_file}`,
  `model_attestation: codex-session`) and a short prompt that ran `pwd`, `ls` and `touch probe-write.txt`.
  The spec kind returned `ready` in 12 seconds and the implementation kind in 16 seconds, each with
  `model: gpt-6.2-sol` attested from the session log. An earlier spec-kind run, whose prompt put prose
  before the `MODEL:` line, stayed pending on that and reported "The write probe was refused with
  `Operation not permitted`". `git status --porcelain` was empty before and after.
- The first stored Codex spec review (R-6) ran through `cli.ts review` at `5ae4e466`:
  `tests/vh-adlc/evidence/macos-review-boundary/spec-review-5ae4e466/` records `ready`, `gpt-6.2-sol`,
  exit 0 and an unchanged `git status`.
- The boundary test files need no installed dependencies. In a fresh `git clone --no-hardlinks` of
  `6880afc4`, outside any profile, `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts
  tests/vh-adlc/loop/owned-process.test.ts` took 45 seconds: 55 pass, 5 skip, 1 fail (the page-cache
  stub), and the clone stayed clean. Inside `sandbox-exec -p '(version 1)(allow default)(deny file-write*
  ...)'` the same route tests gave 3 pass and 50 fail, each with a "no process boundary" or page-cache
  pending reason.
- Codex's `--json` stream names the thread but not the model: a `codex exec --json` run emitted only
  `thread.started`, `turn.started`, `item.completed` and `turn.completed` events, with no model field. The
  session log under `~/.codex/sessions` is the only record of the served model.
- An ordinary local `git clone` shares object files with its source by hard link (R-6 F-03 measured a link
  count of two).
- `.github/workflows/ci.yml` (`checker-macos`) runs a portable subset of the tests on macOS and doesn't
  select `tests/vh-adlc/loop/`, so no CI job runs the darwin boundary tests.
- The plugin reaches hosts through the repository's marketplaces: `.claude-plugin/marketplace.json` and
  `.agents/plugins/marketplace.json` both point at `./plugins/vh-adlc` on the default branch.
  `.github/workflows/release.yml` releases the Go binary on `v*.*.*` tags, not the plugin.
- The host reviewer agent has a shell: `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:4` grants
  `Bash` and `execute`, and disallows only `Edit` and `Write`.

Candidate boundaries. Each one was run against a writer that calls `setsid`, clears its environment with
`env -i`, and writes into the protected directory two seconds after the reviewer exits:

| Candidate | Result |
| --- | --- |
| Process-group cleanup plus marker scan | Fails: the late write lands and cleanup reports confirmed. |
| `codex sandbox -c 'sandbox_mode="read-only"'` (Codex's Seatbelt) | Holds for commands Codex runs: the direct write, the detached writer and `launchctl submit` are all refused. But `codex exec --help` says MCP servers run outside the sandbox, `~/.codex/config.toml` declares `[mcp_servers.node_repl]`, and the Codex process itself runs unconfined. |
| `sandbox-exec -p '(version 1)(allow default)(deny file-write* (subpath D))'` around the whole command | Holds against the detached writer: the direct write, the late write and `launchctl submit` are refused, while writes outside `D` succeed. The same `launchctl submit` run outside any sandbox succeeds and writes. Creating a hard link to a file in `D` (`ln D/f T/out/l`) is refused. Spec review R-1 showed the gap: renaming a parent of `D`, writing through the new path and renaming it back succeeds. Adding a `literal` deny on each parent refuses that rename and still allows new files beside `D`. A hard link to a file in `D` that already existed before the run can be written through. |
| Codex's Seatbelt inside the outer profile | Fails to start: `sandbox-exec: sandbox_apply: Operation not permitted`, exit 71. Any profile with rules fails the same way inside another. |

## Scope

In scope:

- A macOS write boundary for the command route: every reviewer process runs under a Seatbelt profile that
  denies writes to the paths the before-and-after check judges, minus `review_scratch`, and to each of
  their parent directories.
- The route accepts that boundary in place of the PID namespace. Linux behaviour is unchanged.
- Under that boundary, a review stays pending when a protected file already shares an inode with another
  path, when a `review_scratch` entry resolves onto a protected path, and when a protected file disappears
  or can't be read during the link check.
- For this feature's implementation review, an owner-directed recorded run: the implementer runs the
  boundary test files on this Mac outside any sandbox at the code being reviewed and records it, and the
  Codex reviewer judges the darwin-only criteria from that record.
- The route test file fails once, with an "unsandboxed run" reason, on a process that has no boundary,
  instead of failing test by test.
- The reviewer CLI, and every process it starts, gets an allowlisted environment instead of the
  controller's.
- `pidNamespaceAvailable()` returns false when `unshare` can't be started, instead of throwing.
- `.vh-adlc/loop.yaml` in this repository routes `spec_reviewer` and `implementation_reviewer` to Codex.
- The command-route paragraphs of `references/loop-settings.md`, which own the details, and the
  command-route item in `references/review-protocol.md` (Routes), which names the boundary and links there.
- A plugin minor version bump.

Out of scope:

- The macOS marker scan (#186). Triage keeps its current behaviour.
- `parseReply` and the Routes changes in #142 (PR #182), and the Instruction freshness section of
  `loop-settings.md` (#139).
- Other hosts without a boundary, such as Windows. They keep the pending outcome.
- Any route step that runs commands outside the reviewer's profile, and any protocol change for judging
  recorded runs. The recorded run is an owner-directed exception for this feature (#187).
- Installing the candidate through the marketplaces before merge. This feature's own reviews run
  `cli.ts review` from the branch, as Delivery says.

Not handled: writes outside the protected paths. Under the Codex route, reviewer tool commands can write
anywhere else on disk and reach the network, as the host reviewer can through its shell. Neither
boundary covers deferred execution planted outside the protected paths, such as `~/Library/LaunchAgents`,
crontab, shell startup files, `~/.gitconfig` (`core.hooksPath`), plugin and binary caches, or Codex's
session log. The boundary covers reviewer processes and their descendants, which is what the Linux
namespace covers. Posture A, decided by the orchestrator under the owner's delegation of the Codex-review
setup on 2026-11-27 (ledger #179) (R-1 F-04).

Not handled: a macOS reviewer process that outlives the review keeps running until it exits on its own.
It can't change the protected paths, but it can write elsewhere as above. The PID namespace kills such
processes on Linux. Killing them on macOS needs a working survivor scan, which is #186.

Not handled: a reviewer that forges the Codex session log the model attestation reads. The log lives
under `~/.codex`, which reviewer tool commands can write under posture A, on macOS and on Linux, and
Codex's `--json` stream carries no model to check against. The attestation catches an accidental model
mismatch, not deliberate tampering; the owner accepted this limit on #187 (R-6 F-02).

Not handled: a Git file other than the index and HEAD, such as an object or a loose ref, that already
shares an inode with a path outside the protected trees, as objects do after an ordinary local
`git clone`. Git doesn't create such links for refs, and an object file isn't part of what the
before-and-after check judges; changing one needs a deliberate in-place write through the other name, and
checking for them would leave every review pending for anyone with such a clone (R-1 F-02, R-6 F-03).

## Design

**Boundary selection.** `runOwnedClient` (`owned-process.ts:91`) gains an optional `writeDeny` option:
`{ deny: string[]; allow: string[] }`. When the caller asks for the PID namespace and the namespace is
available, nothing changes. Otherwise, when `writeDeny` is set and the Seatbelt boundary is available,
the argv is prefixed with `/usr/bin/sandbox-exec`, the profile and its parameters, and the result's
`boundary` is `seatbelt`. In every other case the boundary stays `marker`, as today. `OwnedResult.boundary`
becomes `"pid-namespace" | "seatbelt" | "marker"`. `ownedClientCompleted` keeps accepting only `marker`
and `pid-namespace`, because triage never passes `writeDeny` and its contract doesn't change. Callers
that don't pass the new option see no behaviour change. The review route's test seam `boundary: "unavailable"`
turns off both boundaries.

**Availability probe.** `seatbeltAvailable()` returns true only on `darwin` when `/usr/bin/sandbox-exec`
exists and a one-time probe succeeds. The probe applies a profile that denies writes to a fresh temporary
directory, tries one write there, and requires the run to exit 0 with the write refused. The probe fails
when the process is already inside a Seatbelt sandbox, for example a host's own command sandbox, because
`sandbox_apply` can't nest. In that case the route stays pending, before the reviewer starts, and the reason
names both boundaries. `pidNamespaceAvailable()` wraps its spawn in `try` and
returns false on any spawn error. Both probes cache their answer per process, so tests that need a fresh
answer run in a subprocess.

**Profile.** The profile string holds no paths: `(version 1)(allow default)`, then
`(deny file-write* (subpath (param "D0")) ...)` for each denied path, then
`(deny file-write* (literal (param "P0")) ...)` for each parent directory of a denied path, up to `/`,
then `(allow file-write* (subpath (param "A0")) ...)` for each allowed path. Paths are passed with
`-D D0=<path>`, so quotes or parentheses in a path can't change the profile. A later Seatbelt rule
overrides an earlier one, so the allows carve the scratch directories out of the denies. The `literal`
denies stop a process from renaming, removing or replacing a parent directory, which would otherwise let
it write through a new path. They still allow creating and changing other entries inside those parents,
so writes beside the worktree, such as in a sibling worktree or the temporary directory, keep working.
Every path goes through `realpathSync` first, because Seatbelt matches resolved paths (`/tmp` resolves to
`/private/tmp`); a path that doesn't exist yet is resolved through its longest existing prefix.

**What the route denies.** `runReviewRoute` passes `writeDeny` with:

- deny: the owning worktree (`repo`), its Git directory (`git rev-parse --absolute-git-dir`), its common
  Git directory (`git rev-parse --path-format=absolute --git-common-dir`), the private clone for an
  implementation review, and the export for a spec review;
- allow: each `review_scratch` entry under the owning worktree and under the clone, resolved as above.

These are the paths the `owning` and `full` snapshots judge (`review-route.ts:157-203`): the worktree's
files, ignored files, index, HEAD and branch ref, and the clone. The common Git directory also holds every
branch and tag, so a reviewer can't move a ref through it either. Writes everywhere else stay allowed: the
temporary directory, Codex's `~/.codex`, and build caches. That is what lets an implementation reviewer
run tests. Posture A in Scope records why the profile doesn't deny writes by default.

**Scratch overlap.** `review_scratch` entries are validated by name (`settings.ts:70-79`) and may be
symlinks, so an allow could resolve onto a protected path and override its deny. Under the Seatbelt
boundary, before the reviewer starts, the route resolves every allow. If one equals a denied path, is a
parent of one, or lies inside the Git directory or the common Git directory, the review stays pending
with a reason naming the entry. So does an entry whose resolved path differs from its declared path and
lies inside a denied path, such as a symlink to a tracked directory of the worktree or clone, because the
before-and-after check excludes the declared path, not what it points at. An entry that is a real
directory at its declared path stays allowed, and so does a symlink to a directory disjoint from every
denied path, such as a main checkout's `node_modules`. The profile is built from these validated resolved
paths.

**Pre-existing hard links.** Seatbelt checks the path a write goes through. It refuses a new hard link to
a protected file, but a file that already has a second name outside the protected trees can be written
through that name. Under the Seatbelt boundary, before the reviewer starts, the route checks the link count
of every regular file in the owning worktree outside `.git` and the scratch directories, plus the index
and HEAD. If any count is above 1, the review stays pending with a reason naming the first such path. The
private clone needs no check, because the route makes it with `--no-hardlinks` (`review-route.ts:349`).
Under the PID namespace no reviewer process survives the review, so the check doesn't run there. A file
that disappears or can't be read during the check, for example because another session deletes it, leaves
the review pending with a reason saying the protected tree changed while it was checked and the review can
be retried, never a thrown error.

**Loud failure without a boundary.** At load, `tests/vh-adlc/loop/review-route.test.ts` checks
`pidNamespaceAvailable() || seatbeltAvailable()`. Without either, it registers one failing test whose
message says the route tests need an unsandboxed run, because this process is inside a sandbox that can't
nest, and it skips every test that runs the route. The tests that don't
run the route, such as the snapshot and reply-parsing tests, still run.

**Reviewer environment.** An implementation reviewer runs the candidate's tests, and the Codex route gives it
network access, so the reviewer CLI must not inherit the controller's environment, which holds the session's
credentials (`conventions/coding.md`: a process that runs user-supplied code gets an explicit allowlisted
environment). `runReviewRoute` passes only these variables from `process.env`, when set: `PATH`, `HOME`,
`TMPDIR`, `USER`, `LOGNAME`, `SHELL`, `LANG`, every `LC_*`, `TERM`, `CODEX_HOME`, `XDG_CONFIG_HOME`,
`XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` and `XDG_RUNTIME_DIR`, then `request.env` on top.
`cli.ts review` passes no `request.env`. Measured on this Mac: `codex exec -m gpt-6.2-sol -s
danger-full-access --json` started with only `PATH`, `HOME`, `TMPDIR`, `USER`, `LOGNAME`, `SHELL`, `LANG` and
`TERM` exited 0, and its session log recorded only `gpt-6.2-sol`, so authentication and attestation keep
working. The owned-process marker is added by `runOwnedClient` as before.

**Route acceptance.** The check at `review-route.ts:338` accepts `pid-namespace` or `seatbelt`. Its
pending reason names both boundaries ("a PID namespace through unshare on Linux, or a sandbox-exec write
boundary on macOS"). The cleanup confirmation, the before-and-after check and every later check stay as
they are and run under both boundaries. The isolation value stored in the Review Log stays `procedural`.

**Codex route.** `.vh-adlc/loop.yaml`:

```yaml
schema_version: 1
roles:
  spec_reviewer:
    route: command
    model: gpt-6.2-sol
    model_attestation: codex-session
    argv: [sh, -c, 'f=$1; shift; exec "$@" - < "$f"', sh, "{prompt_file}", codex, exec, -m, "{model}", -s, danger-full-access, --skip-git-repo-check, --json]
  implementation_reviewer:
    route: command
    model: gpt-6.2-sol
    model_attestation: codex-session
    argv: [sh, -c, 'f=$1; shift; exec "$@" - < "$f"', sh, "{prompt_file}", codex, exec, -m, "{model}", -s, danger-full-access, --skip-git-repo-check, --json]
```

The model is the one the owner chose for Codex reviews when accepting this feature (2026-11-27, #187);
`codex exec -m gpt-6.2-sol --json` on codex-cli 0.172.0 served it, and its session log recorded only that
model. `{prompt_file}` follows the `loop-settings.md:37` recommendation. `--skip-git-repo-check` is there
because a spec review runs from the export, which has no `.git`. `-s danger-full-access` is required on
macOS because Codex's own Seatbelt can't start inside the route's profile (measured above). The same argv
runs on Linux, where it turns Codex's own sandbox off too. There nothing denies writes during the review:
the PID namespace stops every reviewer process when the CLI exits, and the before-and-after check catches
any net change to the worktree or the clone, but a write the reviewer reverts before it exits goes unseen.
The user config stays loaded: the attestation reads the session log Codex writes under `$HOME/.codex`, and
`-m` pins the model. The file declares no `review_scratch`.

**Recorded unsandboxed run (owner-directed, #187).** A Codex implementation reviewer runs inside the
route's profile, so it can't run the boundary tests, which start their own `sandbox-exec`. For this
feature, the implementer runs `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts
tests/vh-adlc/loop/owned-process.test.ts` on this Mac outside any sandbox, in a fresh
`git clone --no-hardlinks` of the code commit, after #182's page-cache fix has reached the branch. The same
run also executes `/usr/bin/sandbox-exec -p '(version 1)(allow default)' bun test --timeout 60000
tests/vh-adlc/loop/review-route.test.ts`, the AC-10 invocation, and
`python3 tests/vh-adlc/evidence/macos-review-boundary/mutants.py`. Each command's text, the full code
commit, its exit code and its complete output go into one record file under
`tests/vh-adlc/evidence/macos-review-boundary/recorded-run/`, which is outside `covers`, and the task's
evidence line names it. The record is committed on top of the code commit, and the implementation review
targets a later commit, so the record is in the reviewer's private clone. Between the code commit and the
reviewed commit only the feature document, `recorded-run/` and the kept review artifact directories
(`spec-review-*`, `implementation-proof-*`) may change, and `mutants.py` and `run-review.sh` must be
byte-identical; the record names the code commit, and `git diff --name-only <code commit> <reviewed commit>`
in the clone shows that. The owner directed "at the exact reviewed commit"; the orchestrator's decision on
#187 (comment 7220697331) reads: "'Exact reviewed commit' means the code commit whose tree the reviewed
commit carries unchanged; only the document and evidence differ." The Codex reviewer judges AC-01 to
AC-03, AC-08, AC-10 and AC-11 from the record while reviewing the code.

**The AC-06 proof runs.** A review can't observe its own outcome, so AC-06 is judged from completed runs.
The spec half is already on record: the Codex spec reviews R-6 to R-9 ran through `cli.ts review` on this
Mac, came back `ready` with `gpt-6.2-sol` attested and left `git status` unchanged, and their artifacts are
committed under `spec-review-<commit>` directories. They ran before the T19 route changes; the spec-kind
path through the final route code is exercised at the code commit by the recorded run, whose
`review-route.test.ts` includes spec-kind reviews through `runReviewRoute` (the export tests of AC-02 (3)
and the "file-only spec reviews" tests), so a T19 change that left spec reviews pending fails there. No
further Codex spec run is made, because a stored spec
review becomes the latest one, which the `complete` gate requires to be clean. For the implementation half,
after the record is committed at commit P, `run-review.sh implementation P` runs once as the proof run. It
is an implementation review through the route, so its `ready` records are stored under the next `### R-<n>`
like any other, with a Review Log row marking it diagnostic. Its kept artifacts (route JSON, outcome with
the attested model, before-and-after status and refs, transcript and the script's exit status) go into
`implementation-proof-P` and are committed in commit Q, whose directory name gives the proof run's target.
The formal Codex implementation review targets Q, where its clone holds the proof artifacts, and judges
AC-06 from them and from the spec runs' artifacts. Its records are stored after the proof run's and are the
latest implementation review, the one the `complete` gate reads.

**Delivery.** Merging publishes the plugin through the repository marketplaces, which serve
`./plugins/vh-adlc` from the default branch; each host picks it up with its plugin update, Claude Code
and Codex alike. Until a host runs 0.34.0, its installed plugin reads the committed `loop.yaml` and, on
macOS, fails to start the reviewer, so reviews stay pending, which is safe; Linux hosts keep working.
Before merge, this feature's own reviews run `cli.ts review` from the feature branch directly and record
that, because the lifecycle skills stop on `plugin.stale` when the branch's plugin is newer than the
installed one.

**Concurrency, failure and rollback.** Each review builds its own profile from its own paths, with no shared state, so concurrent reviews don't interact. Other sessions' processes run
outside the profile, so their writes to the worktree's parents are unaffected; a protected file another
session removes or makes unreadable during the link check leaves the review pending with a retryable
reason. A review interrupted mid-run
leaves no state behind beyond what it leaves today. Rolling back for future commits means deleting
`.vh-adlc/loop.yaml`, which returns both roles to the host. A commit that already holds the Codex routes
keeps them, because the route reads settings from the reviewed commit. An older plugin reviewing such a
commit stays pending on macOS, because it can't start the reviewer, and it works on Linux. The route always
comes from the reviewed commit and a local override can change only the executable (`settings.ts:190-207`),
so there is no host fallback for such a commit: the recovery is to update the host to a plugin that can run
the committed route, or to review a later commit without `loop.yaml`.

**Documentation.** `loop-settings.md` owns the details. Its command-route paragraphs state: the two
boundaries and what each denies; that everything else stays writable; the pending cases; that a Codex
route on macOS passes `-s danger-full-access` because Codex's own sandbox can't start inside the profile;
and that a reviewer inside the profile can't run tests that start their own `sandbox-exec`, so such tests
need a run outside any sandbox. `review-protocol.md`'s command-route item names the boundary in one
sentence and links to `loop-settings.md`. The Instruction freshness section and
`parseReply` are left alone.

## Acceptance Criteria

- [ ] AC-01: On macOS, a command-route review whose reply passes every existing check comes back `ready`.
- [ ] AC-02: On macOS, no reviewer process can change the owning worktree (files, ignored files, index,
      HEAD, refs) or the private clone outside `review_scratch`, during or after the review, either through
      their own paths or by renaming a parent directory. This includes a descendant that detaches into its
      own session, clears its environment and writes after the reviewer has exited. Writes inside
      `review_scratch` and in the temporary directory still succeed.
- [ ] AC-03: On a host where neither boundary can be applied, including a macOS process already inside a
      Seatbelt sandbox, a command-route review stays pending with a reason that names the missing boundary.
- [ ] AC-04: On a host without `unshare`, `runOwnedClient` with `pidNamespace: true` and no `writeDeny`
      runs the client with the `marker` boundary instead of throwing.
- [ ] AC-05: In this repository, `bun plugins/vh-adlc/scripts/loop/cli.ts route` returns a `command` route
      with model `gpt-6.2-sol` and `model_attestation: codex-session` for both `spec review` and `review`.
- [ ] AC-06: On this Mac, real Codex spec reviews through `cli.ts review` are stored with outcome `ready`,
      the served model attested from the session log and `git status` unchanged (R-6 to R-9). A real Codex
      implementation review through the final route code comes back `ready` the same way, its reviewer
      having read the recorded unsandboxed run, with the owning worktree's status and refs unchanged. The
      committed script that ran it fails unless the outcome is `ready` for that commit and nothing changed,
      and keeps the run's Codex transcript.
- [ ] AC-07: `references/loop-settings.md` states the macOS boundary and what it denies, what stays
      writable, the pending cases, the `-s danger-full-access` requirement for Codex under it, and that tests
      starting their own `sandbox-exec` need a run outside any sandbox; `references/review-protocol.md` names
      the boundary and links to `loop-settings.md`.
- [ ] AC-08: On macOS, a command-route review whose owning worktree holds a protected file with a second
      hard link stays pending, with a reason naming that file, and a protected file that disappears or can't
      be read during that check leaves the review pending with a retryable reason instead of an error.
- [ ] AC-10: Run on a process without a boundary, such as inside a Seatbelt sandbox,
      `tests/vh-adlc/loop/review-route.test.ts` reports one failure whose message says the route tests need
      an unsandboxed run, and skips its route tests instead of failing each one.
- [ ] AC-11: On macOS, a `review_scratch` entry that resolves to a protected path, a parent of one, or a path
      inside the Git directory or common Git directory, or a symlink to a path inside a denied path, leaves the
      review pending with a reason naming the entry, while a real scratch directory and a scratch symlink to a
      disjoint directory still work.
- [ ] AC-12: A command-route reviewer and every process it starts see only the allowlisted environment
      variables and `request.env`, never another variable of the controller's environment, and Codex still
      authenticates and attests with that environment.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/review-route.test.ts`, run on this Mac: the existing "replies", "file-only spec reviews" and "model attestation" tests pass. Watched failing first at `e910dfe8`, where they fail with `could not start: Executable not found in $PATH: "unshare"`. |
| AC-02 | Darwin-only tests in `review-route.test.ts`, each watched failing with the named part of the profile removed through `tests/vh-adlc/evidence/macos-review-boundary/mutants.py`. They use a fixture of their own, so the Git-directory and parent denies are actually exercised and no test can move the shared temporary directory: a fresh `mkdtemp` directory `T`, a main checkout at `T/a/b/main`, and a linked worktree at `T/a/b/wt` (`git worktree add`) that is the owning worktree. Its Git directory (`T/a/b/main/.git/worktrees/wt`) and common Git directory (`T/a/b/main/.git`) lie outside it. The fixture's Git calls clear `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE` and the other repository-local Git variables, and a test checks that an independently supplied `GIT_DIR` and `GIT_INDEX_FILE` are left untouched. Each late writer waits for a release file the test creates only after the route has returned `ready`, then tries its write and records that it finished; the test waits for that record up to a 10-second deadline, and the writer gives up after its own 10-second deadline. (1) Late writer: an implementation reviewer stub forks a writer with `perl -e 'POSIX::setsid(); exec env -i ...'` that writes `src/late.txt` in the owning worktree after release. Once the writer has finished the file doesn't exist (fails without `writeDeny`). (2) Rename routes: two late writers each rename a directory, write through the new path and rename it back. One renames the grandparent `T/a` and writes `src/late.txt`; the other renames the main checkout `T/a/b/main`, which holds the common Git directory, and appends to the linked worktree's index at `.git/worktrees/wt/index`. Each rename is refused, which the writer records in a file under `T`; `src/late.txt` doesn't exist and the index is unchanged afterwards (each fails without the parent denies). (3) Clone and export during the review: an implementation reviewer stub tries to write a file in its clone, and a spec reviewer stub tries the same in the export after `chmod u+w`. Each records the result in a file in the temporary directory. Both writes are refused and both reviews are ready (fails without the clone or export deny). (4) Scratch and temporary directory: the stub writes into a declared scratch directory and the temporary directory, and both writes land; with the allow rules removed the scratch write is refused while the temporary write still lands. (5) Refs and index: stubs run `git -C <owning worktree> branch x`, `git -C <owning worktree> tag -f t` and write the linked worktree's index at `T/a/b/main/.git/worktrees/wt/index`. Refs and index are unchanged afterwards (fails without the Git-directory and common-directory denies). The existing "the owning worktree is preserved" tests stay. On macOS each one asserts the worktree is unchanged afterwards, whether the outcome is pending or ready. On Linux they keep their pending expectation. |
| AC-03 | `review-route.test.ts`: the existing `boundary: "unavailable"` test stays pending with the new reason. Darwin-only: a subprocess started under `sandbox-exec -p '(version 1)(allow default)'` runs the route, and the review stays pending with a reason naming the boundary (fails without the boundary precheck). |
| AC-04 | `tests/vh-adlc/loop/owned-process.test.ts`: a subprocess with a `PATH` that holds no `unshare` imports the module fresh and calls `runOwnedClient(..., { pidNamespace: true })`. It resolves with `boundary: "marker"`. The subprocess keeps the module-level probe cache from hiding the case on Linux. Watched failing first: today the call throws `Executable not found`. |
| AC-05 | Command: `bun plugins/vh-adlc/scripts/loop/cli.ts route --repo . --operation "spec review"` and `--operation review` print JSON with `"route":"command"`, `"model":"gpt-6.2-sol"` and `"model_attestation":"codex-session"`. Before the change both printed `"route":"host"`. |
| AC-06 | Spec half: the stored Codex spec reviews R-6 to R-9 and their committed artifacts under `spec-review-<commit>` (outcome `ready`, attested `gpt-6.2-sol`, identical status before and after); they predate the T19 route changes, and the spec-kind path through the final route is covered by the recorded run, as Design says. Implementation half: `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh implementation P <dir>`, run on this Mac on commit P, the commit that holds the recorded run, with the committed `loop.yaml`. It keeps the route JSON read at that commit, the JSON outcome (`ready`, attested `gpt-6.2-sol`), `git status --porcelain` and the refs before and after (identical), the reply's records and the Codex session log of the run's thread as its transcript, and it exits nonzero unless the outcome is `ready` for that commit and nothing changed. The run's transcript shows the reviewer reading the recorded run in its clone. The implementation run here is the proof run Design describes: its records are stored as a diagnostic implementation review, and its artifacts are committed in commit Q under `implementation-proof-P`. The formal implementation review targets Q and judges AC-06 from those artifacts and the spec runs' artifacts. Storing each record set and running `vh-adlc review check` and `vh-adlc lint` are the implementer's evidence afterwards, recorded on T22. |
| AC-07 | Read the changed paragraphs at the implementation commit and confirm each statement AC-07 lists, in `loop-settings.md`, and the name and the link in `review-protocol.md`. `tests/vh-adlc/direct-operation-compatibility.test.ts` still passes. |
| AC-08 | Darwin-only tests in `review-route.test.ts`: (1) the fixture hard-links a tracked file to a path in the temporary directory before the review; the review stays pending with a reason naming that file, and the reviewer stub never runs (it would create a marker file; fails without the link-count check). (2) A unit test of the link check over a tree whose file is removed between the directory listing and the `lstat`, through a seam that removes it, returns the retryable pending reason and doesn't throw (fails without the guard). |
| AC-10 | Run `/usr/bin/sandbox-exec -p '(version 1)(allow default)' bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts` on this Mac, as part of the recorded run: one failure whose message contains "unsandboxed run" (must pass: "The route tests need an unsandboxed run: this process is inside a Seatbelt sandbox, which cannot nest"; must fail: "no process boundary on this host" and a run with no failure), the route tests reported as skipped, and the non-route tests passing. Watched failing first: before the change the same run gives 50 failures with per-test pending reasons. |
| AC-11 | Darwin-only tests in `review-route.test.ts`: a scratch entry that is a symlink to the owning worktree's root, one that is a symlink into the common Git directory, and one that is a symlink to the worktree's tracked `src` directory each leave the review pending with a reason naming the entry, and the reviewer stub never runs (fails without the overlap check). A real scratch directory and a scratch entry that is a symlink to a directory outside every protected path still let the stub write through them. |
| AC-12 | `tests/vh-adlc/loop/review-route.test.ts`, on every platform with a boundary: with a sentinel variable such as `VH_REVIEW_SENTINEL` set in the test process, an implementation reviewer stub writes `env` to a record file outside the protected paths; the record holds `PATH` and `HOME` and no sentinel, and a variable passed through `request.env` is present. Watched failing first: today the sentinel appears. The authentication and attestation half is the AC-06 proof run and the formal review, which run real Codex through the route with this environment. |

## Tasks

- [x] T1 `tests/vh-adlc/loop/owned-process.test.ts` - a subprocess with no `unshare` on `PATH` calls `runOwnedClient(..., { pidNamespace: true })` and expects `boundary: "marker"`; fails because the probe throws `Executable not found` (AC-04)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/owned-process.test.ts -t "without unshare"` on this Mac fails: the subprocess throws `Executable not found in $PATH: "unshare"` from `pidNamespaceAvailable`, as expected before T2.
- [x] T2 `plugins/vh-adlc/scripts/triage/owned-process.ts` - `pidNamespaceAvailable()` returns false on a spawn error; T1 passes and the existing `owned-process.test.ts` and `tests/vh-adlc/triage/owned-process.test.ts` still pass (AC-04)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/owned-process.test.ts tests/vh-adlc/triage/owned-process.test.ts` on this Mac: 13 pass, 5 skip (the existing PID-namespace and confirmed-cleanup skips), 0 fail. With the T2 change reverted, the T1 test fails again on `Executable not found in $PATH: "unshare"`. The T1 fixture now keeps `ps` on its `PATH`, because the macOS marker scan runs it.
- [x] T3 `tests/vh-adlc/loop/review-route.test.ts` - darwin-only tests on the nested linked-worktree fixture for AC-02 (1) to (5), the nested-sandbox case for AC-03 and the pre-existing hard link for AC-08, plus macOS expectations for the existing preserved-worktree tests; the new tests fail on this Mac at T2 (AC-01, AC-02, AC-03, AC-08)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts` on this Mac at T2: 5 pass, 48 fail. All 9 new darwin tests fail: 8 because the review stays pending with "no process boundary on this host", and the nested-sandbox test because the route fails to start with `posix_spawn ps` EPERM instead of naming the boundary. The preserved-worktree tests and the private-clone edit test now use `refusedOrPending`, which accepts a ready outcome on macOS only when the owning worktree is unchanged.
- [x] T4 `plugins/vh-adlc/scripts/triage/owned-process.ts` - the `writeDeny` option, `seatbeltAvailable()` and the profile with subpath, parent `literal` and allow rules passed as `-D` parameters; `ownedClientCompleted` unchanged; `owned-process.test.ts` and the triage owned-process tests pass (AC-02, AC-03)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/owned-process.test.ts tests/vh-adlc/triage/owned-process.test.ts` on this Mac: 13 pass, 5 skip, 0 fail; `ownedClientCompleted` is unchanged. A direct `runOwnedClient` run with `writeDeny` and a detached env-cleared writer reported `boundary: seatbelt`; the late write and the parent rename were refused, and a write beside the protected directory landed. The route-level proof comes with T5.
- [x] T5 `plugins/vh-adlc/scripts/loop/review-route.ts` - pass `writeDeny` with the worktree, both Git directories, clone or export and scratch allows, accept `seatbelt`, add the link-count check and the new pending reason; `review-route.test.ts` passes on this Mac, and each AC-02, AC-03 and AC-08 test fails again with its part of the profile or check removed (AC-01, AC-02, AC-03, AC-08)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts` on this Mac: 52 pass, 1 fail. The one failure ("an uncommitted loop.yaml edit ...") and three in `tests/vh-adlc/loop/cli.test.ts` are a macOS-only fixture mismatch outside this feature: `pagesStub` writes the page cache under `XDG_CACHE_HOME`, while `pages.ts:14` reads `~/Library/Caches` on darwin, so `cli.ts review` stays pending before any route runs. `tests/vh-adlc/evidence/macos-review-boundary/mutants.py` removes one part at a time; each darwin test fails against its part (`mutants.out`): denied paths (6 tests), parent literal denies (2), Git-directory denies (2), clone deny (1), export deny (1), link-count check (1), boundary precheck (1). The two existing detached-helper tests now call setsid(2) through perl, because macOS has no setsid binary, and four more write tests use `refusedOrPending`.
- [x] T6 `plugins/vh-adlc/references/loop-settings.md`, `plugins/vh-adlc/references/review-protocol.md` - the command-route paragraph and the Routes sentence state the four AC-07 points; `tests/vh-adlc/direct-operation-compatibility.test.ts` passes (AC-07)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/loop/glossary.test.ts tests/vh-adlc/loop/settings.test.ts tests/vh-adlc/proportional-review.test.ts tests/vh-adlc/docs-drift/authority.test.ts`: 71 pass, 0 fail. `tests/vh-adlc/check.test.ts`: 77 pass, 1 fail ("a package change comes with a version change"), which T7 clears. The `loop-settings.md` paragraph states the macOS boundary, what stays writable, `-s danger-full-access` for Codex, and the host-or-Linux review for boundary code. The Routes item in `review-protocol.md` names the boundary. The Instruction freshness section and `parseReply` are untouched.
- [x] T7 `plugins/vh-adlc/.claude-plugin/plugin.json` - minor version bump; `tests/vh-adlc/loop/plugin-version.test.ts` passes (Design)
      Evidence: Both manifests (`plugins/vh-adlc/.claude-plugin/plugin.json` and `plugins/vh-adlc/plugin.json`) moved from 0.33.0 to 0.34.0. `bun test --timeout 60000 tests/vh-adlc/check.test.ts tests/vh-adlc/loop/plugin-version.test.ts`: 86 pass, 0 fail. #139 also targets 0.34.0, so whichever merges second rebumps.
- [x] T10 `tests/vh-adlc/loop/review-route.test.ts` - every late writer records that it finished, and each late-writer test waits for that record, up to a 10-second deadline, before asserting; the boundary tests pass on this Mac and `tests/vh-adlc/evidence/macos-review-boundary/mutants.py` still shows each one failing against its part (AC-02, R-5 F-01)
      Evidence: Each late writer now writes a `done` record and each late-writer test waits for it up to 10 seconds. Three consecutive runs of `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts` on this Mac: 52 pass, 1 fail each time. That one failure is the page-cache fixture #182 fixes. `python3 tests/vh-adlc/evidence/macos-review-boundary/mutants.py` gives the same result as before: every darwin test still fails against its part (denied paths 6, parent literal denies 2, Git-directory denies 2, clone 1, export 1, link-count check 1, boundary precheck 1).
- [x] T8 `.vh-adlc/loop.yaml` - both reviewer roles routed to Codex with the accepted model and `model_attestation: codex-session`; the AC-05 `cli.ts route` commands print the expected JSON, where both printed `"route":"host"` before (AC-05)
      Evidence: Before: `bun plugins/vh-adlc/scripts/loop/cli.ts route --repo . --operation "spec review"` printed `{"role":"spec_reviewer","route":"host"}` and `--operation review` printed `{"role":"implementation_reviewer","route":"host"}`. After: both print `"route":"command"`, `"model":"gpt-6.2-sol"` and `"model_attestation":"codex-session"` with the Codex argv; `implement` stays `host`. `bun test --timeout 60000 tests/vh-adlc/loop/` on this Mac: 181 pass, 5 skip, 5 fail. All five fail because the page-cache stub writes where macOS does not read, which #182 fixes. `cli.ts context` reports `stale` here because it reads this repository's own `plugin.json` (0.34.0) as the running version while 0.33.0 is installed, which comes from developing the plugin inside its own repository.
- [x] T18 `tests/vh-adlc/loop/review-route.test.ts` - the AC-11 scratch overlap tests (root, Git storage and tracked-descendant symlinks refused; real and disjoint scratch allowed), the AC-08 disappearing-file test, the AC-10 loud failure, late writers released only after `ready`, and fixture Git calls that clear the repository-local Git variables with their check; the new tests fail on this Mac at T8 (AC-02, AC-08, AC-10, AC-11)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts` on this Mac at T8 plus these tests: 54 pass, 6 fail. Five fail as expected: the three scratch-symlink cases run the reviewer instead of staying pending, and the two link-check tests fail because `protectedLinkCheck` does not exist yet. The sixth is the page-cache stub (#182). Late writers now wait for a release file the test creates after the route returns; the first version expanded `$n` in the stub's bash, which the escaping fixes. The fixture Git helper clears the repository-local Git variables: with that removed, the new check fails (the outer repository's HEAD moved from 2620bd61 to 8387fab1), and with it the check passes. Under `/usr/bin/sandbox-exec -p '(version 1)(allow default)'` the file reports one failure, "The route tests need an unsandboxed run: ...", 55 skipped and 3 passing, plus the two link-check tests that wait for T19; before this change the same run gave 50 per-test failures.
- [x] T19 `plugins/vh-adlc/scripts/loop/review-route.ts`, `plugins/vh-adlc/scripts/triage/owned-process.ts`, `tests/vh-adlc/evidence/macos-review-boundary/mutants.py` - the scratch overlap check with the profile built from the validated paths, and the disappearing-file guard; `review-route.test.ts` passes on this Mac apart from the page-cache stub, and the mutant script, extended with the allow rules, the overlap check and the disappearing-file guard, shows each test failing against its part (AC-02, AC-08, AC-11)
      Evidence: After merging `origin/main` with #182 (merge 6c031566; version conflict resolved to 0.34.0): `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/triage/owned-process.test.ts` on this Mac gives 208 pass, 5 skip, 0 fail, so the page-cache failures are gone. `python3 tests/vh-adlc/evidence/macos-review-boundary/mutants.py` exits 0. Each of ten mutations fails at least one of the 15 boundary tests (`mutants.out`): denied paths 6, parent literal denies 2, Git-directory denies 2, clone deny 1, export deny 1, allow rules 2, link-count check 1, disappearing-file guard 1, scratch overlap check 3, boundary precheck 1. The script now exits nonzero if a mutation fails no test or no test runs.
- [x] T20 `plugins/vh-adlc/references/loop-settings.md`, `plugins/vh-adlc/references/review-protocol.md` - the statements AC-07 lists, replacing the host-route sentence; `tests/vh-adlc/direct-operation-compatibility.test.ts` passes (AC-07)
      Evidence: `loop-settings.md` now states the two boundaries and what the macOS profile denies, that everything else stays writable, the pending cases (hard link, scratch alias, a file that vanishes during the check, no boundary), `-s danger-full-access` for Codex, and that tests starting their own `sandbox-exec` need a run outside any sandbox. That last sentence replaces the host-route sentence. The `review_scratch` row tells the name check apart from the route's resolved-path check. `review-protocol.md`'s command-route item already names the boundary and links to `loop-settings.md`. `bun test --timeout 60000 tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/loop/glossary.test.ts tests/vh-adlc/loop/settings.test.ts tests/vh-adlc/check.test.ts`: 111 pass, 0 fail.
- [x] T21 `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh` - for the AC-06 implementation run, reads the route at the commit, compares status and refs before and after, keeps the records and the run's Codex session log, and exits nonzero unless the outcome is `ready` for that commit and nothing changed; a run against a commit with no command route exits nonzero (AC-06)
      Evidence: `run-review.sh` now runs the controller from a clean clone of the commit, reads the route there, compares the owning worktree's status with ignored files, HEAD, branch, refs, index entries and index digest before and after, keeps `records.txt` and the run's Codex session log as `transcript.jsonl`, and exits nonzero unless the outcome is `ready` for that commit and nothing changed. `sh run-review.sh spec e910dfe8 <dir>` exits 1 with "the route at e910dfe8... is not a command route", before any review starts.
- [x] T23 `tests/vh-adlc/loop/review-route.test.ts` - a scratch symlink to the filesystem root leaves the review pending, and an unreadable index gives the retryable link-check result; both fail at T21 (AC-08, AC-11, R-14 F-01, F-03)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts` at T21 plus these tests: 63 pass, 2 fail. The filesystem-root scratch symlink runs the reviewer instead of staying pending, and the unreadable index returns `{}` instead of `{ changed }`. The new "missing HEAD or index is not a change" test passes, as it should.
- [x] T24 `plugins/vh-adlc/scripts/loop/review-route.ts`, `plugins/vh-adlc/scripts/triage/owned-process.ts`, `tests/vh-adlc/evidence/macos-review-boundary/mutants.py` - containment that handles `/`, scratch paths resolved once and passed to the profile as validated, and Git metadata errors other than a missing file reported as retryable; T23 passes and the mutant script still catches every mutation (AC-02, AC-08, AC-11, R-14 F-01 to F-03)
      Evidence: Containment now treats `/` as a parent of every path; each scratch allow is resolved once, and the profile takes those validated paths (`WriteDeny.resolved`); an index or HEAD that fails with anything but ENOENT gives `{ changed }`. `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/triage/owned-process.test.ts`: 211 pass, 5 skip, 0 fail. `mutants.py` exits 0. All twelve mutations are caught, including the two new ones: filesystem-root containment (1 test) and the Git metadata error guard (1 test).
- [x] T25 `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh` - refuses an output directory that already holds artifacts, takes the one Codex session log this invocation created for the commit, and fails when a state command fails; a run with a failing state command exits nonzero (AC-06, R-14 F-05, F-06)
      Evidence: With a `shasum` that always fails first on `PATH`, `run-review.sh implementation 447e26c4 <dir>` exits 1 with "the state before the review could not be measured", before any review starts. Rerun into the same directory, it exits 2 with "refusing ...: it already holds artifacts". The transcript is now the one Codex session log created after the run started that names the commit, and any other count fails the run.
- [x] T26 `tests/vh-adlc/loop/review-route.test.ts`, `tests/vh-adlc/loop/settings.test.ts` - a separate Git directory whose name ends in a space stays protected, and `tracked/.`, `a/./b` and `./build` are refused as scratch entries; all fail at T25 (AC-02, AC-11, R-15 F-01, F-02)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/settings.test.ts tests/vh-adlc/loop/review-route.test.ts` at T25: 88 pass, 4 fail. The append to the index under `meta /` lands (its digest changed), because `.trim()` drops the space and the deny names a path that does not exist. `tracked/.`, `a/./b` and `./build` load without refusal.
- [x] T27 `plugins/vh-adlc/scripts/loop/review-route.ts`, `plugins/vh-adlc/scripts/loop/settings.ts`, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh` - Git paths keep everything but the trailing newline, scratch entries with a `.` component are refused, and the runner accepts only exit 1 from `symbolic-ref` as detached; T26 passes, the mutant script catches every mutation, and a runner whose `symbolic-ref` fails with another code exits nonzero (AC-02, AC-06, AC-11, R-15 F-01, F-02, F-05). R-15 F-03 and F-06 are follow-up #194, below this alpha's threshold by the orchestrator's decision under the owner's delegation.
      Evidence: Git paths now drop only the trailing newline, `settings.ts` refuses scratch entries with a `.` component, and the runner treats only exit 1 from `symbolic-ref` as detached. `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/triage/owned-process.test.ts`: 215 pass, 5 skip, 0 fail, so T26 passes. With a `git` shim whose `symbolic-ref` exits 128, the runner exits 1 with "the state before the review could not be measured", before any review starts. A first version of that guard written as an AND-OR list did not stop the run under `set -e`: that run went on to a full Codex review, which passed. The `if` form fixes it, and the snippet was checked on its own before the rerun.
- [x] T22 `tests/vh-adlc/evidence/macos-review-boundary/recorded-run/` - once #182 has reached the branch, the owner-directed recorded run on this Mac outside any sandbox, in a fresh clone of the code commit: the boundary test files, the AC-10 sandboxed invocation and the mutant script, each with command, commit, exit code and output, committed on top of the code commit as commit P; then the `implementation` proof run on P, its records stored as a diagnostic implementation review and its artifacts committed as commit Q under `implementation-proof-P`; then the formal Codex implementation review on Q, its records stored, and `vh-adlc review check` and `vh-adlc lint` passing (AC-01, AC-02, AC-03, AC-06, AC-08, AC-10, AC-11)
      Evidence: Recorded run at code commit 5168340e (`recorded-run/record-5168340e.md`): boundary tests 69 pass, 5 skip, 0 fail; AC-10 sandboxed run 1 failure, 58 skip; mutant script exit 0, 12/12 caught. Committed as e274ff17. The proof run R-16 on e274ff17 was `ready`, attested `gpt-6.2-sol`, state unchanged, runner exit 0, with artifacts committed at bc5cf01c (`implementation-proof-e274ff17`). The formal Codex implementation review R-17 on bc5cf01c was `ready` and attested, with the state unchanged and artifacts in `implementation-review-bc5cf01c`. Both record sets pass `vh-adlc review check`. Earlier cycles: R-14 at c55aa45a and R-15 at b8c1a07f led to T23 to T27.

- [ ] T28 `tests/vh-adlc/loop/review-route.test.ts` - the AC-12 sentinel test; fails because the reviewer inherits the controller's environment (AC-12, R-18 F-01)
- [ ] T29 `plugins/vh-adlc/scripts/loop/review-route.ts` - pass the allowlisted environment plus `request.env`; T28 passes and `tests/vh-adlc/loop/` passes (AC-12)
- [ ] T30 `tests/vh-adlc/evidence/macos-review-boundary/` - the recorded unsandboxed run at the new code commit, the AC-06 proof run on the commit that holds it, and the formal Codex implementation review on the commit that holds the proof artifacts, each stored and checked as in T22 (AC-01 to AC-08, AC-10 to AC-12)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-27 | R-1 | spec | `7248ba28` | claude-opus-5-5 | procedural | 1 blocking, 4 should-fix, 4 nits; host route, because the Codex command route cannot run on macOS until this feature exists |
| 2026-11-27 | R-2 | spec | `c0f89a56` | claude-opus-5-5 | procedural | 0 blocking, 1 should-fix, 2 nits; host route |
| 2026-11-27 | R-3 | spec | `b6f3156b` | claude-opus-5-5 | procedural | clean: 0 blocking, 0 should-fix, 1 nit (unapplied under the nit rule); host route |
| 2026-11-27 | R-3 | spec | `b6f3156b` | n/a | n/a | accepted by owner |
| 2026-11-27 | R-4 | spec | `b765e737` | claude-opus-5-5 | procedural | 0 blocking, 2 should-fix, 2 nits; full pass after the gpt-6.2-sol rename; host route |
| 2026-11-27 | R-5 | spec | `58342e95` | claude-opus-5-5 | procedural | clean: 0 blocking, 1 should-fix and 2 nits, all outside the normative baseline (Tasks, Context); host route |
| 2026-11-27 | R-5 | spec | `58342e95` | n/a | n/a | accepted by owner |
| 2026-11-27 | R-6 | spec | `5ae4e466` | gpt-6.2-sol | procedural | 5 blocking, 8 should-fix, 2 nits; first review through the committed Codex command route on macOS (model attested from the session log), full pass |
| 2026-11-27 | R-7 | spec | `519dbbfd` | gpt-6.2-sol | procedural | 8 blocking, 7 should-fix, 1 nit; Codex command route; convergence trigger fired (R-6 had 5 blocking), revision held for the owner's proportionality answer |
| 2026-11-27 | R-8 | spec | `cc7bb1ac` | gpt-6.2-sol | procedural | 6 blocking, 8 should-fix; Codex command route; F-05 and F-06 re-raise owner-accepted limits; held for the owner |
| 2026-11-27 | R-9 | spec | `34633957` | gpt-6.2-sol | procedural | 9 blocking, 8 should-fix; Codex command route; convergence trigger fired again (R-8 had 6 blocking); held for the owner |
| 2026-11-27 | R-10 | spec | `7fd292bb` | claude-opus-5-5 | procedural | 1 blocking, 4 should-fix, 2 nits; host route, owner-directed gating pass on #187 because the convergence trigger fired twice (R-7, R-9) on Codex findings that re-raise owner decisions; Codex stays the route for every other review |
| 2026-11-27 | R-11 | spec | `6af33856` | claude-opus-5-5 | procedural | clean: 0 blocking, 2 should-fix, 1 nit; host route, the owner-directed gating pass continued |
| 2026-11-27 | R-12 | spec | `e531af54` | claude-opus-5-5 | procedural | 1 blocking, 1 should-fix; host route, the owner-directed gating pass continued |
| 2026-11-27 | R-13 | spec | `8543fb32` | claude-opus-5-5 | procedural | NO FINDINGS; host route, the owner-directed gating pass |
| 2026-11-27 | R-13 | spec | `8543fb32` | n/a | n/a | accepted by owner |
| 2026-11-27 | R-14 | implementation | `c55aa45a` | gpt-6.2-sol | procedural | diagnostic AC-06 proof run through the Codex command route (ready, attested, worktree unchanged); AC-02, AC-08 and AC-11 not met, AC-06 not verified, 4 findings fixed after |
| 2026-11-27 | R-15 | implementation | `b8c1a07f` | gpt-6.2-sol | procedural | diagnostic AC-06 proof run on the final route code through the Codex command route (ready, attested, worktree unchanged); AC-02, AC-08 and AC-11 not met on new edge cases, AC-06 not verified |
| 2026-11-27 | R-16 | implementation | `e274ff17` | gpt-6.2-sol | procedural | diagnostic AC-06 proof run on the final code (C3 `5168340e`) through the Codex command route: ready, attested, worktree unchanged; its artifacts are the AC-06 proof for the formal review |
| 2026-11-27 | R-17 | implementation | `bc5cf01c` | gpt-6.2-sol | procedural | formal Codex implementation review: AC-01, AC-03, AC-04, AC-05, AC-07 and AC-10 met; AC-02, AC-06, AC-08 and AC-11 not met on edge cases, to be residualised by the orchestrator's decision |
| 2026-11-27 | R-18 | spec | `6282c941` | claude-opus-5-5 | procedural | 1 blocking, 1 should-fix, 1 nit; host route, owner-directed drift re-review after #182 merged covered files; held for the owner on the reviewer environment |

### R-18

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Scope (the "Not handled: writes outside the protected paths" posture A line), Design (Codex route; What the route denies), Context (Owner summary, trade-offs paragraph)
EVIDENCE: `plugins/vh-adlc/scripts/loop/review-route.ts:416` builds the reviewer's environment as `{ ...process.env, ...request.env }` and passes it to `runOwnedClient` at line 420. `owned-process.ts:171` spawns with that environment plus only the marker. The line comes from 2aed641a (2026-11-13), so it predates this feature. This feature makes it live for this repository by committing the Codex `loop.yaml`. The pinned `conventions/coding.md:95-97` says "A process that runs user-supplied code gets an explicit allowlisted environment, never the parent's environment, which holds the platform's credentials". An implementation reviewer runs the candidate commit's tests, and the committed route gives it network access. R-17 F-05 (blocking) raised this, and so did R-16 F-04. The document never answers it. Its stated limit, posture A, covers writes outside the protected paths and network reach, but says nothing about the inherited environment or about reading credentials. The only answer is on issue #195 ("F-05 ... falls under posture A, which the owner accepted, so it isn't a residual"), and that is not in the document. The product profile lists the user's credentials as at stake, and exposing a credential is in the always-blocking class. `impl_review_clean` reads only the criterion records, so after a clean spec pass `vh-adlc next` would move on to ship with this finding still open in the latest implementation review.
PROPOSAL: In Design, specify an allowlisted environment for the reviewer process: PATH, HOME, TMPDIR, LANG, CODEX_HOME and whatever else Codex needs to start and to write the session log the attestation reads. Add a criterion with a sentinel-variable test showing reviewer commands cannot see other controller variables. If the owner prefers to keep the inherited environment, that is a security-posture choice that goes against the repository's coding convention, so raise it as an Open Question and do not leave it to the #195 comment.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary: the "Observed so far on this Mac" and "Still planned" paragraph, and the trade-offs paragraph)
EVIDENCE: At X the summary still says "T1 to T8 and T10 are built", that five loop tests fail because of the page-cache stub "which #182 fixes; the recorded run needs #182 merged first", and "Still planned: the scratch and tree checks, the single clear failure inside a sandbox, the runner that fails closed, the recorded unsandboxed run, the real Codex implementation proof run and the formal implementation review". The rest of the document disagrees. #182 is merged at 6c031566, and T19 evidence reports 208 pass and 0 fail. Every task through T27 is ticked. The recorded run is at 5168340e, R-16 and R-17 are stored, and AC-02, AC-06, AC-08 and AC-11 are unticked with residuals on #195 after R-17 returned not met. The summary mentions none of this: the four residualised criteria, R-17's two blocking findings (F-01, the alternate index changed by the route's clone, and F-05, the inherited environment), or the decision on #195 that F-05 falls under posture A. `conventions/feature-documents.md` (Owner summary in Context) requires the summary to be refreshed "when scope, proof or decisions change" and to tell planned checks apart from observed proof.
PROPOSAL: Refresh the Owner summary to give the observed state at X: what R-17 met, the four criteria residualised to #195 with the edge case behind each, how R-17 F-05 is handled (see F-01), and that #182 is merged. Remove the "Still planned" items that are done.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: frontmatter (`status_description`)
EVIDENCE: `status_description: "Being implemented on feat/macos-review-boundary; T18 to T22 remain, the recorded run after #182."` At X every task, T18 to T27 included, is ticked, #182 is merged, and the only remaining steps are this drift re-review and shipping with four residuals.
PROPOSAL: Update the line to the current state, for example that all tasks are done, AC-02, AC-06, AC-08 and AC-11 are residualised on #195, and the feature waits for the drift spec review and merge.

### R-17

CRITERION: AC-01 On macOS, a command-route review whose reply passes every existing check comes back `ready`.
VERDICT: met
EVIDENCE: I checked that the changes from `5168340e` to the target are limited to the feature document and permitted evidence files. The owner-directed unsandboxed run recorded 69 passes, five owned-process skips and zero failures. I inspected the matching-reply, file-only spec and model-attestation tests and confirmed that they assert `ready`. This session cannot start a nested Seatbelt profile.

CRITERION: AC-02 On macOS, no reviewer process can change the owning worktree (files, ignored files, index, HEAD, refs) or the private clone outside `review_scratch`, during or after the review, either through their own paths or by renaming a parent directory. This includes a descendant that detaches into its own session, clears its environment and writes after the reviewer has exited. Writes inside `review_scratch` and in the temporary directory still succeed.
VERDICT: not met
EVIDENCE: The matching unsandboxed record covers the listed late writes, renames, clone and export writes, and scratch writes. In a disposable repository, the same clone command used by the route replaced a staged entry in the owner's active alternate index. The route does this before its baseline snapshot and omits the alternate index from its deny paths. I observed the index change during clone preparation.

CRITERION: AC-03 On a host where neither boundary can be applied, including a macOS process already inside a Seatbelt sandbox, a command-route review stays pending with a reason that names the missing boundary.
VERDICT: met
EVIDENCE: In this macOS session, `/usr/bin/sandbox-exec` exited 71 with `sandbox_apply: Operation not permitted`. At the target I called `runReviewRoute` with automatic boundary detection and with the unavailable-boundary seam. Both returned `pending` and named the PID namespace and `sandbox-exec` write boundary. The owner-directed run also covers the explicit nested Seatbelt case.

CRITERION: AC-04 On a host without `unshare`, `runOwnedClient` with `pidNamespace: true` and no `writeDeny` runs the client with the `marker` boundary instead of throwing.
VERDICT: met
EVIDENCE: The targeted `without unshare` test passed at the target, asserting `boundary: "marker"` and client exit code 0. I used an empty `ps` stub because this session forbids spawning the real `ps`. The matching unsandboxed run covers the test with the real scanner.

CRITERION: AC-05 In this repository, `bun plugins/vh-adlc/scripts/loop/cli.ts route` returns a `command` route with model `gpt-6.2-sol` and `model_attestation: codex-session` for both `spec review` and `review`.
VERDICT: met
EVIDENCE: I ran both `cli.ts route` commands at the target. The `spec_reviewer` and `implementation_reviewer` results each reported `command`, `gpt-6.2-sol` and `codex-session`.

CRITERION: AC-06 On this Mac, real Codex spec reviews through `cli.ts review` are stored with outcome `ready`, the served model attested from the session log and `git status` unchanged (R-6 to R-9). A real Codex implementation review through the final route code comes back `ready` the same way, its reviewer having read the recorded unsandboxed run, with the owning worktree's status and refs unchanged. The committed script that ran it fails unless the outcome is `ready` for that commit and nothing changed, and keeps the run's Codex transcript.
VERDICT: not met
EVIDENCE: I parsed the four spec outcomes and the implementation outcome for `e274ff17`. All five reported `ready` and attested `gpt-6.2-sol`. I compared the paired state files byte for byte, checked that the code matches the target, and confirmed that the implementation transcript contains the successful read of `record-5168340e.md`. The runner's state check misses changes to the contents of a file that is already modified, as I confirmed with its `state()` function in a disposable repository. Its controller clone also runs before the first measurement and uses the same Git command that changed the active alternate index in the AC-02 fixture.

CRITERION: AC-07 `references/loop-settings.md` states the macOS boundary and what it denies, what stays writable, the pending cases, the `-s danger-full-access` requirement for Codex under it, and that tests starting their own `sandbox-exec` need a run outside any sandbox; `references/review-protocol.md` names the boundary and links to `loop-settings.md`.
VERDICT: met
EVIDENCE: I checked `loop-settings.md:136-154` and `review-protocol.md:20-24` at the target against each required statement and the link. The direct-operation compatibility, glossary and settings tests reported 36 passes and zero failures.

CRITERION: AC-08 On macOS, a command-route review whose owning worktree holds a protected file with a second hard link stays pending, with a reason naming that file, and a protected file that disappears or can't be read during that check leaves the review pending with a retryable reason instead of an error.
VERDICT: not met
EVIDENCE: The matching unsandboxed run covers a hard-linked tracked file and the retry for a file removed after directory listing. I called the target's `protectedLinkCheck` with a fixture that removed an existing HEAD after the index check. It returned `{}`. A separate fixture with a hard-linked alternate index returned `{}` for the paths the route checks and named the linked file when given the active index path.

CRITERION: AC-10 Run on a process without a boundary, such as inside a Seatbelt sandbox, `tests/vh-adlc/loop/review-route.test.ts` reports one failure whose message says the route tests need an unsandboxed run, and skips its route tests instead of failing each one.
VERDICT: met
EVIDENCE: At the target, `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts` reported eight passes, 58 skips and one failure containing `The route tests need an unsandboxed run`. The explicit Seatbelt invocation in the matching run reports the same counts and message.

CRITERION: AC-11 On macOS, a `review_scratch` entry that resolves to a protected path, a parent of one, or a path inside the Git directory or common Git directory, or a symlink to a path inside a denied path, leaves the review pending with a reason naming the entry, while a real scratch directory and a scratch symlink to a disjoint directory still work.
VERDICT: not met
EVIDENCE: The matching unsandboxed run covers the existing overlap and writable-scratch fixtures. I tested the target's `resolvedPath()` with a scratch symlink to a missing file under a protected directory. It returned the declared scratch path. At `review-route.ts:363-368`, that result passes the overlap check as though the entry were an ordinary scratch directory. I observed the path resolution directly. This session could not run the resulting profile.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: AC-02, AC-06, AC-08, Design (What the route denies, Pre-existing hard links, The AC-06 proof runs), `plugins/vh-adlc/scripts/loop/review-route.ts:382-419`, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh:18-36`
EVIDENCE: In a disposable repository, `git rev-parse --git-path index` resolved `GIT_INDEX_FILE` outside both Git metadata directories. The clone command exited 0 and replaced the staged entry in that index with the committed entry. Both the route and the proof runner clone before measuring the owner's state. The route's deny and link-check inputs also omit the active index.
PROPOSAL: Clear repository-local Git variables for private clone operations. Protect and measure the owner's active index, or refuse unsupported index overrides before either clone starts. Verify that a staged alternate index survives byte for byte.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: AC-08, Scope (third In scope bullet), Design (Pre-existing hard links, Concurrency, failure and rollback), Test Plan AC-08, `plugins/vh-adlc/scripts/loop/review-route.ts:329-338,383-387`
EVIDENCE: I removed an existing HEAD while `protectedLinkCheck` advanced from the index to HEAD. The function returned `{}` because it ignores all metadata `ENOENT` errors. The route needs a `changed` result to leave the review pending with a retry reason.
PROPOSAL: Distinguish metadata that was absent at the start from metadata that vanishes during the check. Exercise the latter case through the route's pending outcome.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: AC-11, Scope (third In scope bullet), Design (Scratch overlap), Test Plan AC-11, `plugins/vh-adlc/scripts/triage/owned-process.ts:60-65`, `plugins/vh-adlc/scripts/loop/review-route.ts:363-368,402-407`
EVIDENCE: A disposable scratch symlink pointed to a missing path inside the protected tree. The resolver returned the symlink's declared pathname, and the overlap condition treats those equal paths as an ordinary scratch entry. The route therefore omits the promised pending reason.
PROPOSAL: Distinguish a missing scratch directory from a symlink whose destination cannot be resolved. Leave the review pending with the entry's name when containment cannot be established.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: AC-06, Design (The AC-06 proof runs), Test Plan AC-06, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh:22-31,53`
EVIDENCE: In a disposable repository I ran the runner's `state()` function before and after changing the contents of an already-modified tracked file. The snapshots were byte-identical. The runner's comparison cannot establish its unchanged-state claim for that file.
PROPOSAL: Measure the contents covered by the unchanged-state claim and take the first measurement before preparing the controller clone. Add a check with an already-dirty file whose contents change while its porcelain status stays the same.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Design (Codex route), `plugins/vh-adlc/scripts/loop/review-route.ts:416-421`, `plugins/vh-adlc/scripts/triage/owned-process.ts:171-173`, `conventions/coding.md` (Inputs and safety)
EVIDENCE: The route passes the full controller environment to the reviewer process. The pinned coding convention requires an explicit allowlist for a process that runs user-supplied code. An exported controller credential is consequently available to reviewer tool commands, which have network access under the committed Codex route.
PROPOSAL: Pass an explicit environment allowlist for reviewer startup and attestation. Verify with a harmless sentinel that reviewer commands cannot see unapproved controller variables.

### R-16

CRITERION: AC-01 On macOS, a command-route review whose reply passes every existing check comes back `ready`.
VERDICT: met
EVIDENCE: I verified that `git diff --name-status 5168340e7cbd699711b873347b21cc8a994fcb5f HEAD` lists only the added run record. The owner-directed unsandboxed run reported 69 passes, five skips and zero failures. I inspected the matching-reply, file-only spec and model-attestation tests and confirmed they assert `ready`. The five skips were in the owned-process fixtures.

CRITERION: AC-02 On macOS, no reviewer process can change the owning worktree (files, ignored files, index, HEAD, refs) or the private clone outside `review_scratch`, during or after the review, either through their own paths or by renaming a parent directory. This includes a descendant that detaches into its own session, clears its environment and writes after the reviewer has exited. Writes inside `review_scratch` and in the temporary directory still succeed.
VERDICT: not met
EVIDENCE: The equivalent-tree recorded run covers the listed write, rename, clone and scratch fixtures. At the reviewed commit, I reproduced a separate case with an alternate Git index in a temporary directory. Git resolved the active index outside both metadata directories, and the route's `git clone --no-hardlinks` command changed that index before the reviewer's sandbox or the route's baseline snapshot. The generated deny list also omits the active index.

CRITERION: AC-03 On a host where neither boundary can be applied, including a macOS process already inside a Seatbelt sandbox, a command-route review stays pending with a reason that names the missing boundary.
VERDICT: met
EVIDENCE: I ran `cli.ts review` at the target in this macOS session. It exited 3 with `pending` and named both the PID namespace and the `sandbox-exec` write boundary. The equivalent-tree recorded run also covers the explicit unavailable-boundary and nested Seatbelt cases.

CRITERION: AC-04 On a host without `unshare`, `runOwnedClient` with `pidNamespace: true` and no `writeDeny` runs the client with the `marker` boundary instead of throwing.
VERDICT: met
EVIDENCE: I ran the targeted `without unshare` test at the reviewed commit. It passed and asserted `boundary: "marker"` and client exit 0. I used an empty `ps` stub because this session rejects spawning the real `ps`. The equivalent-tree unsandboxed run covers the same test with the real scanner.

CRITERION: AC-05 In this repository, `bun plugins/vh-adlc/scripts/loop/cli.ts route` returns a `command` route with model `gpt-6.2-sol` and `model_attestation: codex-session` for both `spec review` and `review`.
VERDICT: met
EVIDENCE: I ran both route commands at the reviewed commit. The `spec_reviewer` and `implementation_reviewer` JSON outputs both reported `command`, `gpt-6.2-sol` and `codex-session`.

CRITERION: AC-06 On this Mac, real Codex spec reviews through `cli.ts review` are stored with outcome `ready`, the served model attested from the session log and `git status` unchanged (R-6 to R-9). A real Codex implementation review through the final route code comes back `ready` the same way, its reviewer having read the recorded unsandboxed run, with the owning worktree's status and refs unchanged. The committed script that ran it fails unless the outcome is `ready` for that commit and nothing changed, and keeps the run's Codex transcript.
VERDICT: not verified
EVIDENCE: I parsed all four spec outcomes and compared their status files byte for byte. All four reported `ready` and `gpt-6.2-sol` with `codex-session` configured, and all four status pairs matched. The newest implementation proof targets `b8c1a07f`. Its state files match, but `review-route.ts`, `settings.ts` and `run-review.sh` changed after that target. The reviewed commit adds the matching unsandboxed test record. It contains no real-Codex implementation proof for that code. My live invocation stopped at the boundary check with `pending`.

CRITERION: AC-07 `references/loop-settings.md` states the macOS boundary and what it denies, what stays writable, the pending cases, the `-s danger-full-access` requirement for Codex under it, and that tests starting their own `sandbox-exec` need a run outside any sandbox; `references/review-protocol.md` names the boundary and links to `loop-settings.md`.
VERDICT: met
EVIDENCE: I checked `loop-settings.md:136-154` and `review-protocol.md:20-24` at the target for each required statement and the link. The direct-operation compatibility, glossary and settings tests reported 36 passes and zero failures.

CRITERION: AC-08 On macOS, a command-route review whose owning worktree holds a protected file with a second hard link stays pending, with a reason naming that file, and a protected file that disappears or can't be read during that check leaves the review pending with a retryable reason instead of an error.
VERDICT: not met
EVIDENCE: The equivalent-tree recorded run covers the route's refusal of a hard-linked tracked file. All four link-check unit tests passed live. In a separate temporary fixture, I confirmed that after an existing index or HEAD was moved aside, `protectedLinkCheck` returned `{}` for its known path. The route emits the retryable reason only for a `changed` result.

CRITERION: AC-10 Run on a process without a boundary, such as inside a Seatbelt sandbox, `tests/vh-adlc/loop/review-route.test.ts` reports one failure whose message says the route tests need an unsandboxed run, and skips its route tests instead of failing each one.
VERDICT: met
EVIDENCE: I ran the route test file by itself at the target. Bun reported eight passes, 58 skips and one failure containing `The route tests need an unsandboxed run`. The explicit nested Seatbelt invocation in the equivalent-tree record reports the same counts and message.

CRITERION: AC-11 On macOS, a `review_scratch` entry that resolves to a protected path, a parent of one, or a path inside the Git directory or common Git directory, or a symlink to a path inside a denied path, leaves the review pending with a reason naming the entry, while a real scratch directory and a scratch symlink to a disjoint directory still work.
VERDICT: met
EVIDENCE: I inspected the overlap check at the target and confirmed that it checks both Git directories and passes the same resolved scratch paths to the profile. The equivalent-tree recorded run covers the refused aliases and both writable scratch cases. Its overlap, filesystem-root and allow-rule mutations failed the corresponding tests. I also reran the settings tests covering the rejection of dotted scratch entries.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: AC-02, Design (What the route denies), `plugins/vh-adlc/scripts/loop/review-route.ts:382-413`, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh:18-36`
EVIDENCE: In a disposable macOS fixture with `GIT_INDEX_FILE` pointing to an alternate index, `git rev-parse --git-path index` reported a path outside both Git metadata directories. With the same environment, the route's clone command exited 0 and changed the alternate index digest. The route takes its baseline after cloning and builds its deny list from the worktree and metadata directories, which omit that index.
PROPOSAL: Isolate both private-clone commands from repository-local Git variables. Resolve the owner's active index for the boundary and baseline, or refuse the override before creating either clone. Add a regression that compares the alternate index byte for byte.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: AC-08, Scope (third In scope bullet), Design (Pre-existing hard links, Concurrency, failure and rollback), Test Plan AC-08, `plugins/vh-adlc/scripts/loop/review-route.ts:329-338,383-387`
EVIDENCE: `protectedLinkCheck` treats every metadata `ENOENT` as an initially absent file. I observed the same empty result after moving an existing index and an existing HEAD aside in a temporary fixture. T27 tracks this case in #194, while AC-08 still requires a retryable result for protected files that disappear.
PROPOSAL: Distinguish absent-at-start metadata from metadata that disappears during the check, and test the disappearance path through the pending outcome.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: AC-06, Design (The AC-06 proof runs), Test Plan AC-06, T22
EVIDENCE: The target contains `record-5168340e.md`. Its newest completed implementation proof still targets `b8c1a07f`, before changes to the route, settings and proof runner. The four successful spec artifacts and the latest unsandboxed test record establish only part of AC-06.
PROPOSAL: Run the real-Codex implementation proof on a commit carrying the unsandboxed record for the final code. Commit the outcome, state comparisons, transcript and diagnostic records before dispatching the formal review.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Design (Codex route), `plugins/vh-adlc/scripts/loop/review-route.ts:416-421`, `plugins/vh-adlc/scripts/triage/owned-process.ts:171-173`, `conventions/coding.md` (Inputs and safety)
EVIDENCE: The route copies the full controller environment into the reviewer process. The pinned coding convention requires an explicit allowlist for processes running user-supplied code. Any credential exported by the invoking session is consequently available to reviewer tool commands, which the committed route allows to reach the network.
PROPOSAL: Pass an explicit environment allowlist that supports Codex startup and session attestation. Verify with a harmless sentinel that unapproved controller variables are absent from reviewer commands.

### R-15

CRITERION: AC-01 On macOS, a command-route review whose reply passes every existing check comes back `ready`.
VERDICT: met
EVIDENCE: I compared the target with `4b061c90be6c7b8365385585fbbb255765cd72af`. The only changed file is `record-4b061c90.md`. Its unsandboxed run reports 68 passes, five skips and zero failures. The skips belong to the owned-process cleanup and PID namespace fixtures. The matching-reply, file-only spec and model-attestation tests assert `ready`. I used the recorded run because this session cannot apply a nested Seatbelt profile.

CRITERION: AC-02 On macOS, no reviewer process can change the owning worktree (files, ignored files, index, HEAD, refs) or the private clone outside `review_scratch`, during or after the review, either through their own paths or by renaming a parent directory. This includes a descendant that detaches into its own session, clears its environment and writes after the reviewer has exited. Writes inside `review_scratch` and in the temporary directory still succeed.
VERDICT: not met
EVIDENCE: The equivalent-tree run covers the listed write, rename and scratch fixtures. At the target, a separate Git metadata directory with trailing whitespace was missing from the generated deny profile. A second fixture showed that the profile and the snapshot disagree about which directory a scratch entry with a `.` component excludes. I inspected the generated paths without applying the profile.

CRITERION: AC-03 On a host where neither boundary can be applied, including a macOS process already inside a Seatbelt sandbox, a command-route review stays pending with a reason that names the missing boundary.
VERDICT: met
EVIDENCE: I ran `cli.ts review` at the target from this macOS session. The Seatbelt probe was refused, and the CLI exited 3 with `pending` and a reason naming both the PID namespace and the `sandbox-exec` write boundary. The equivalent-tree recorded run covers the explicit unavailable-boundary and nested Seatbelt cases.

CRITERION: AC-04 On a host without `unshare`, `runOwnedClient` with `pidNamespace: true` and no `writeDeny` runs the client with the `marker` boundary instead of throwing.
VERDICT: met
EVIDENCE: I ran the targeted `without unshare` test at the target. It passed and asserted `boundary: "marker"` and client exit code 0. I used an empty `ps` stub because this session refuses to spawn the real `ps`. The equivalent-tree unsandboxed run also covers the test with the real process scanner.

CRITERION: AC-05 In this repository, `bun plugins/vh-adlc/scripts/loop/cli.ts route` returns a `command` route with model `gpt-6.2-sol` and `model_attestation: codex-session` for both `spec review` and `review`.
VERDICT: met
EVIDENCE: I ran both route commands at the target. The `spec_reviewer` and `implementation_reviewer` outputs each reported `command`, `gpt-6.2-sol` and `codex-session`.

CRITERION: AC-06 On this Mac, real Codex spec reviews through `cli.ts review` are stored with outcome `ready`, the served model attested from the session log and `git status` unchanged (R-6 to R-9). A real Codex implementation review through the final route code comes back `ready` the same way, its reviewer having read the recorded unsandboxed run, with the owning worktree's status and refs unchanged. The committed script that ran it fails unless the outcome is `ready` for that commit and nothing changed, and keeps the run's Codex transcript.
VERDICT: not verified
EVIDENCE: I parsed the four spec artifacts and compared their status files byte for byte. All four report `ready` and `gpt-6.2-sol` with `codex-session` configured, and all four status pairs match. The sole implementation proof targets `c55aa45a`. Its state files match and its transcript shows the reviewer reading the earlier record. The route, profile builder and runner changed after that commit. This session could only observe the current route return `pending` for the missing boundary.

CRITERION: AC-07 `references/loop-settings.md` states the macOS boundary and what it denies, what stays writable, the pending cases, the `-s danger-full-access` requirement for Codex under it, and that tests starting their own `sandbox-exec` need a run outside any sandbox; `references/review-protocol.md` names the boundary and links to `loop-settings.md`.
VERDICT: met
EVIDENCE: I checked `loop-settings.md:136-154` and `review-protocol.md:20-24` at the target against each required statement and the link. The direct-operation compatibility, glossary and settings tests reported 33 passes and zero failures.

CRITERION: AC-08 On macOS, a command-route review whose owning worktree holds a protected file with a second hard link stays pending, with a reason naming that file, and a protected file that disappears or can't be read during that check leaves the review pending with a retryable reason instead of an error.
VERDICT: not met
EVIDENCE: All four link-check unit tests passed at the target, and the equivalent-tree record covers the route's refusal of a hard-linked tracked file. In a separate temporary repository, I confirmed that an existing index moved out of place before the check produced `{}`. The route emits the retryable reason only for a `changed` result.

CRITERION: AC-10 Run on a process without a boundary, such as inside a Seatbelt sandbox, `tests/vh-adlc/loop/review-route.test.ts` reports one failure whose message says the route tests need an unsandboxed run, and skips its route tests instead of failing each one.
VERDICT: met
EVIDENCE: I ran the route test file at the target in this boundary-unavailable session. Bun reported eight passes, 57 skips and one failure with `The route tests need an unsandboxed run`. The explicit `sandbox-exec` invocation in the equivalent-tree record reports the same counts and message.

CRITERION: AC-11 On macOS, a `review_scratch` entry that resolves to a protected path, a parent of one, or a path inside the Git directory or common Git directory, or a symlink to a path inside a denied path, leaves the review pending with a reason naming the entry, while a real scratch directory and a scratch symlink to a disjoint directory still work.
VERDICT: not met
EVIDENCE: The equivalent-tree record covers the filesystem-root alias and the writable scratch cases. At the target, the settings loader accepted `tracked/.` in a temporary repository. The overlap check receives the same normalized path for the declared and resolved values, while the snapshot still includes the tracked directory. The route therefore allows a path that the snapshot treats as protected.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: AC-02, AC-08, AC-11, Design (What the route denies, Scratch overlap, Pre-existing hard links), `plugins/vh-adlc/scripts/loop/review-route.ts:381-405`
EVIDENCE: In a temporary repository with a separate Git metadata directory whose name ends in a space, both `rev-parse` commands returned the correct path. The route's `.trim()` removed the space. The resulting index path did not exist, and the actual metadata directory was outside the worktree and absent from the generated deny profile.
PROPOSAL: Preserve the path Git returns and remove only the output terminator. Add a fixture that verifies the boundary and link check use the actual separate metadata directory.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: AC-02, AC-11, Design (Scratch overlap), `plugins/vh-adlc/scripts/loop/settings.ts:70-79`, `plugins/vh-adlc/scripts/loop/review-route.ts:40-44,363-368,399-418`
EVIDENCE: In a temporary repository at the target, `loadLoopSettings` accepted `tracked/.`. The snapshot's content digest matched the snapshot with no scratch entry, confirming that it still included `tracked`. The route normalizes that same entry for the profile and treats it as an ordinary scratch directory. A post-review write to that directory would occur outside the snapshot's scratch exclusion.
PROPOSAL: Reject noncanonical scratch entries or canonicalize them once before the snapshot, link check, overlap check and profile consume them. Add a regression that checks those consumers agree.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: AC-08, Design (Pre-existing hard links, Concurrency, failure and rollback), Test Plan AC-08, `plugins/vh-adlc/scripts/loop/review-route.ts:329-338,383-386`
EVIDENCE: I confirmed that an index existed in a temporary repository, moved it aside, and passed its known path to `protectedLinkCheck`. The function returned `{}` because it ignores `ENOENT` for metadata. The existing missing-metadata test passes a path that never existed and does not cover disappearance.
PROPOSAL: Treat metadata that disappears after its presence has been established as a retryable change. Add a regression for that case.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: AC-06, Design (The AC-06 proof runs), Test Plan AC-06, T22
EVIDENCE: `git ls-tree` at `b8c1a07f` lists the new recorded run and only `implementation-proof-c55aa45a`. A diff from `c55aa45a` confirms changes to `review-route.ts`, `owned-process.ts` and `run-review.sh`. The current route has no committed real-Codex implementation proof.
PROPOSAL: After the route and runner fixes, record a proof run on the commit carrying the matching unsandboxed run. Dispatch the formal review at the commit that contains those artifacts.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: AC-06, Test Plan AC-06, T25, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh:22-29`
EVIDENCE: The branch measurement uses `git symbolic-ref -q HEAD || echo detached`. Running that shell expression with a Git fixture returning 128 produced `detached` and exit 0. The runner can accept two matching snapshots whose branch measurements both failed.
PROPOSAL: Accept exit 1 as detached HEAD and fail the measurement on any other nonzero exit. Verify the runner rejects a branch measurement error.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: AC-06, Test Plan AC-06, T25, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh:41-45`
EVIDENCE: The runner selects a transcript by modification time and a commit substring. I confirmed that the file filter can select an older file. Requiring one match does not establish that the file belongs to the thread whose model the controller attested.
PROPOSAL: Return the attested thread ID from the controller and use it to locate the transcript. Fail if that thread's log cannot be copied.

### R-14

CRITERION: AC-01 On macOS, a command-route review whose reply passes every existing check comes back `ready`.
VERDICT: met
EVIDENCE: At `c55aa45a`, I compared the tree with recorded code commit `3bf6ec47`. Only the two recorded-run files differ. The unsandboxed Bun run reports 65 passes, 5 skips and no failures. The matching-reply test in `review-route.test.ts:104` ran and asserts `ready`, the target and the returned records. I inspected the recorded run because Seatbelt cannot nest in this session.

CRITERION: AC-02 On macOS, no reviewer process can change the owning worktree (files, ignored files, index, HEAD, refs) or the private clone outside `review_scratch`, during or after the review, either through their own paths or by renaming a parent directory. This includes a descendant that detaches into its own session, clears its environment and writes after the reviewer has exited. Writes inside `review_scratch` and in the temporary directory still succeed.
VERDICT: not met
EVIDENCE: The recorded run at `3bf6ec47` covers the listed write and rename fixtures. At `c55aa45a`, a temporary scratch symlink resolving to `/` passed the production overlap check, and the profile builder emitted a root-wide write allow after the worktree and Git denies. I inspected the generated profile without applying it.

CRITERION: AC-03 On a host where neither boundary can be applied, including a macOS process already inside a Seatbelt sandbox, a command-route review stays pending with a reason that names the missing boundary.
VERDICT: met
EVIDENCE: I called `runReviewRoute` at `c55aa45a` from this sandboxed macOS process. It returned `pending` and named both the PID namespace and the `sandbox-exec` write boundary. The recorded run at `3bf6ec47` also covers the explicit `boundary: "unavailable"` case.

CRITERION: AC-04 On a host without `unshare`, `runOwnedClient` with `pidNamespace: true` and no `writeDeny` runs the client with the `marker` boundary instead of throwing.
VERDICT: met
EVIDENCE: At `c55aa45a`, the targeted `without unshare` test passed and asserted `boundary: "marker"` with client exit code 0. I used a `ps` stub that reports an empty process list because this sandbox refuses to spawn the real `ps`. The equivalent-tree unsandboxed run at `3bf6ec47` also executed this test with the real process scanner. Its five skips belong to the cleanup and PID namespace fixtures.

CRITERION: AC-05 In this repository, `bun plugins/vh-adlc/scripts/loop/cli.ts route` returns a `command` route with model `gpt-6.2-sol` and `model_attestation: codex-session` for both `spec review` and `review`.
VERDICT: met
EVIDENCE: I ran both route commands at `c55aa45a`. The `spec_reviewer` and `implementation_reviewer` JSON outputs both reported `command`, `gpt-6.2-sol` and `codex-session`.

CRITERION: AC-06 On this Mac, real Codex spec reviews through `cli.ts review` are stored with outcome `ready`, the served model attested from the session log and `git status` unchanged (R-6 to R-9). A real Codex implementation review through the final route code comes back `ready` the same way, its reviewer having read the recorded unsandboxed run, with the owning worktree's status and refs unchanged. The committed script that ran it fails unless the outcome is `ready` for that commit and nothing changed, and keeps the run's Codex transcript.
VERDICT: not verified
EVIDENCE: At `c55aa45a`, I compared the four spec artifacts with their recorded targets. All four show `ready` and `gpt-6.2-sol` with `codex-session` configured, and their paired status files are byte-identical. The target contains the unsandboxed test record but no `implementation-proof-*` directory or diagnostic implementation review. The live implementation outcome, record read, state comparison and transcript were unverified.

CRITERION: AC-07 `references/loop-settings.md` states the macOS boundary and what it denies, what stays writable, the pending cases, the `-s danger-full-access` requirement for Codex under it, and that tests starting their own `sandbox-exec` need a run outside any sandbox; `references/review-protocol.md` names the boundary and links to `loop-settings.md`.
VERDICT: met
EVIDENCE: At `c55aa45a`, I checked `loop-settings.md:136-154` and `review-protocol.md:20-24` against all requested statements and the link. `bun test --timeout 60000 tests/vh-adlc/direct-operation-compatibility.test.ts` reported 8 passes and no failures.

CRITERION: AC-08 On macOS, a command-route review whose owning worktree holds a protected file with a second hard link stays pending, with a reason naming that file, and a protected file that disappears or can't be read during that check leaves the review pending with a retryable reason instead of an error.
VERDICT: not met
EVIDENCE: At `c55aa45a`, both link-check unit tests passed, but a separate temporary metadata fixture produced `EACCES` from `lstatSync(index)` and `{}` from `protectedLinkCheck`. The route only returns the retryable pending reason for a `changed` result. A missing index passed to the same check also returned `{}`.

CRITERION: AC-10 Run on a process without a boundary, such as inside a Seatbelt sandbox, `tests/vh-adlc/loop/review-route.test.ts` reports one failure whose message says the route tests need an unsandboxed run, and skips its route tests instead of failing each one.
VERDICT: met
EVIDENCE: I ran the route test file at `c55aa45a` from this Seatbelt sandbox. Bun reported 6 passes, 56 skips and one failure, "The route tests need an unsandboxed run". The recorded explicit `sandbox-exec` invocation at `3bf6ec47` reported the same counts and diagnostic.

CRITERION: AC-11 On macOS, a `review_scratch` entry that resolves to a protected path, a parent of one, or a path inside the Git directory or common Git directory, or a symlink to a path inside a denied path, leaves the review pending with a reason naming the entry, while a real scratch directory and a scratch symlink to a disjoint directory still work.
VERDICT: not met
EVIDENCE: At `c55aa45a`, I ran the production `scratchOverlap` function against a temporary scratch symlink. It resolved to the filesystem root, an ancestor of every denied path, and the function returned no overlap. The recorded checks cover the repository root, Git storage, a protected descendant and disjoint scratch, but omit the filesystem root.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Scratch overlap, Profile), AC-02, AC-11, Test Plan AC-11, `plugins/vh-adlc/scripts/loop/review-route.ts:355-360`
EVIDENCE: A temporary scratch symlink resolving to `/` returned no overlap because the containment check looks for a `//` prefix when the proposed ancestor is `/`. The generated profile places the resulting write allow after the denies, broadening reviewer writes to paths outside the declared scratch entry.
PROPOSAL: Use a containment check that handles the filesystem root. Add a regression that verifies the route returns pending, names the entry and never starts the reviewer.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design (Scratch overlap, Concurrency, failure and rollback), AC-02, AC-11, `plugins/vh-adlc/scripts/loop/review-route.ts:355-360,395-410`, `plugins/vh-adlc/scripts/triage/owned-process.ts:67-68`
EVIDENCE: The route resolves each scratch entry for overlap validation, resolves it again after taking snapshots and resolves it a third time during profile construction. If a concurrent process changes a scratch entry between those steps, the profile can allow a protected path that the overlap check never examined.
PROPOSAL: Resolve the paths once, validate that set and pass the same resolved values to the profile builder. Add a test that changes a scratch entry between validation and profile construction.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Pre-existing hard links, Concurrency, failure and rollback), AC-08, Test Plan AC-08, `plugins/vh-adlc/scripts/loop/review-route.ts:329-343,376-379`
EVIDENCE: The loop that checks the index and HEAD discards every `lstatSync` error. A temporary index whose parent could not be traversed produced `EACCES`, but the check returned `{}`. The existing disappearing-file test exercises only the recursive worktree walk.
PROPOSAL: Return a retryable `changed` result when required Git metadata becomes unavailable during the check. Add an index or HEAD case to the proof.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Design (The AC-06 proof runs), AC-06, Test Plan AC-06, T22
EVIDENCE: `git ls-tree` at `c55aa45a` lists the recorded-run directory and four spec-review directories. The commit contains neither the completed implementation proof artifacts nor the diagnostic Review Log row that the formal review is meant to inspect.
PROPOSAL: Complete the implementation proof run and commit its artifacts and diagnostic records. Dispatch the formal review at the commit that contains them.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: AC-06, Test Plan AC-06, T21, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh:38-49`
EVIDENCE: The runner copies the first recently modified Codex log containing the target commit. Two sessions reviewing the same commit can both match. If the output directory is reused, an old `transcript.jsonl` also satisfies the final check when the lookup finds no new session.
PROPOSAL: Select the transcript by the thread ID attested by the controller. Require the runner to capture that transcript in the current invocation.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: AC-06, Test Plan AC-06, T21, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh:20-26,32-37,46`
EVIDENCE: The runner ignores failures from both `state` calls, and `state` can continue after a Git command fails. If the same measurement fails before and after, `cmp` can accept two identical partial snapshots.
PROPOSAL: Check each required state command and fail the runner if either snapshot is incomplete. Add a negative check that forces one state command to fail.

### R-13

NO FINDINGS

### R-12

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria AC-06, Test Plan AC-06, Design (The AC-06 proof runs), Tasks T21 and T22, Owner summary ("a script for the real-Codex proof that fails closed"; "Still planned")
EVIDENCE: AC-06 (lines 407-411) still says "A committed script reruns both, fails unless the outcome is `ready` and the worktree is unchanged, and keeps their Codex transcripts." This revision, applying R-11 F-02, drops the spec run of the script. Design lines 352-354 and the Test Plan AC-06 row now say the spec half is "the committed artifacts of the Codex spec reviews R-6 to R-9 under `spec-review-<commit>`". Those artifacts do not support the criterion. `ls tests/vh-adlc/evidence/macos-review-boundary/spec-review-*/` at X shows only environment.txt, outcome.json, route.json, status-before.txt, status-after.txt and an empty stderr.txt in each of the four directories. There is no Codex session log or transcript and no refs before and after. They also came from the current `run-review.sh`, which records `exit=$?` and then returns the status of its last reporting command (lines 17-19), not from the fail-closed script T21 delivers. The AC-06 row still says "For each it keeps ... the refs before and after ..., the Codex session log of the run's thread as its transcript", but only one run is left. No run is planned that would show the final script running a spec review, failing closed on it, or keeping its transcript. Under "A passing subset never upgrades a composite criterion", the formal implementation reviewer has to return `not verified` or `not met` for AC-06. `impl_review_clean` then fails, and a correct implementation cannot reach `complete` on this plan. Running the script for spec now would store a spec review, which Design rightly avoids because it would become the latest spec review. The Owner summary does not tell the owner that the spec half of the proof changed from a rerun to earlier artifacts.
PROPOSAL: Restate AC-06 to match the new proof: the spec half is the stored R-6 to R-9 Codex spec reviews (ready, attested, status unchanged), and the committed fail-closed script with kept transcript and refs applies to the implementation run. Apply the same wording to the Test Plan AC-06 row, T21 and T22, and name the change in the Owner summary for the owner's acceptance.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (The AC-06 proof runs), Test Plan AC-06, Tasks T19 and T22
EVIDENCE: The spec half of AC-06 now rests on R-6 to R-9, run at `5ae4e466`, `519dbbfd`, `cc7bb1ac` and `34633957` (the spec-review-*/environment.txt files). Those runs used the route code as it was then. T19, still unticked, changes `plugins/vh-adlc/scripts/loop/review-route.ts` and `owned-process.ts` after them: "the scratch overlap check with the profile built from the validated paths, and the disappearing-file guard". Both run before every reviewer starts, including the spec kind with its export deny. Nothing planned runs a real Codex spec review through the final route code. The only implementation-code run of the real route is the implementation-kind proof run at P. A T19 change that left spec reviews pending on this Mac, for example an overlap check that rejected the export, would still pass the AC-06 proof as written. This traces to this revision's switch from a spec rerun to earlier artifacts.
PROPOSAL: Say in Design that the stored spec runs predate T19, and have the formal implementation reviewer confirm, from the diff between `34633957` and the code commit, that the spec-kind path through the route is unchanged except for the checks the recorded-run tests cover. Alternatively, have the recorded run include a spec-kind stub run of the real route at the code commit.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (The AC-06 proof run; Recorded unsandboxed run, the allowed delta), Test Plan AC-06, Tasks T22
EVIDENCE: Design at X, lines 352-355, says the proof run "runs once on that commit", its artifacts "go into an `implementation-proof-<commit>` directory and are committed. The formal implementation review then runs on that commit". T22 says the same: "the `implementation` proof run on the commit that holds the record, with both runs' artifacts committed; then the formal Codex implementation review on that commit". In both places "that commit" reads as the commit the proof run targeted. That commit cannot hold the proof artifacts, because they are committed after it. The implementation reviewer works in a private clone of its target (`review-protocol.md:17-18`), so a formal review at that commit has nothing in its clone to judge AC-06 from. The allowed delta at lines 343-344 lists `implementation-proof-*`, which suggests the author meant the later commit that adds the artifacts, but no sentence says so. One implementer would target the record commit and get `not verified` for AC-06; another would target the artifact commit. This text was added in this revision for R-10 F-01.
PROPOSAL: Say that the formal implementation review targets the commit that adds the `implementation-proof-<commit>` directory (and the spec run's artifacts), and that the directory name gives the proof run's target. Use the same wording in Design, the Test Plan AC-06 row and T22.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (The AC-06 proof run), Test Plan AC-06, Tasks T22
EVIDENCE: Design lines 353-356 say of the proof run: "Its records are not stored ... its records [the formal review's] are the ones stored". The Test Plan AC-06 row now reads "Storing the formal review's records", where the previous revision said "Storing each record set", so this revision also leaves the AC-06 spec run's records unstored. Both runs go through `cli.ts review` and come back `ready`. `plugins/vh-adlc/references/review-protocol.md:23-25` at X requires: "On `ready`, store its `records` under `### R-<n>` with a Review Log row ... On `pending`, store nothing". The convention also asks for "One table row per review pass" (feature-documents.md, Review log). The owner's exception on #187 (comment 7220327075) covers judging the darwin criteria from the recorded run. It does not cover dropping review passes. Storing the spec run has its own effect that the document doesn't mention: a Codex spec review stored during implementation becomes the latest spec review, and `spec_review_clean` is a `complete` gate, so a blocking finding there stops completion. Recent Codex passes R-6 to R-9 each had 5 to 9 blocking findings. The orchestrator's comment 7220697331 also says "No more Codex spec rounds".
PROPOSAL: Either store both runs per the protocol and state in Design that the stored spec run becomes the latest spec review and gates `complete`, or record an owner decision that exempts the two AC-06 runs from storage, citing it, while keeping their replies in the committed artifacts.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Concurrency, failure and rollback), Tasks T18 and T19
EVIDENCE: This revision narrowed AC-08, Scope and the Owner summary to "a protected file disappears or can't be read during the link check" (R-10 F-04). The R-10 F-04 WHERE named the Concurrency paragraph, but lines 367-368 still say "a concurrent change to the owning worktree during the link check leaves the review pending as described". That covers additions, which the walk does not detect. T18 ("the AC-08 changing-tree test") and T19 ("the changing-tree guard", "the tree guard") keep the older term. This traces to the partial application of R-10 F-04 in this revision.
PROPOSAL: Change the Concurrency sentence to say that a protected file another session removes or makes unreadable during the link check leaves the review pending with a retryable reason. Rename the T18 and T19 items to the disappearing-file guard.

### R-10

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan AC-06, Acceptance Criteria AC-06, Tasks T22
EVIDENCE: The new Test Plan AC-06 text, added in this revision for R-9 F-08, says "The implementation review judges AC-06 from the spec review's kept artifacts and from its own dispatch, which the route only reaches with a `ready` outcome." That premise is false. At X, `plugins/vh-adlc/scripts/loop/review-route.ts:366` dispatches the reviewer through `runOwnedClient`. The route decides the outcome only afterwards: the unchanged-worktree check at 375-378, the exit check at 380, the model attestation at 384-388 and `ready` at 391. So a reviewer that is running has not been shown to come back `ready`. It cannot observe its own attestation result, the worktree after it exits, or `run-review.sh`'s exit status. The spec review's artifacts say nothing about the implementation half of AC-06. T22 has one `run-review.sh` implementation run, and its records are the ones stored, so that formal review has to give an AC-06 verdict from events that have not happened yet. An honest reviewer returns `not verified`, `impl_review_clean` fails, and a correct implementation cannot reach `complete` on this plan.
PROPOSAL: Make T22's `run-review.sh` implementation run a completed proof run whose kept artifacts (outcome, attestation, before-and-after snapshots, transcript, exit status) are committed to the evidence directory. Have the formal implementation review judge AC-06 from those artifacts and the spec run's artifacts, and say in T22 which run is diagnostic and which counts.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (second paragraph on the recorded run), Scope (recorded-run bullet), Design (Recorded unsandboxed run), frontmatter status_description
EVIDENCE: Design cites "(orchestrator under the owner's delegation, #187: "run it on the Mac at the code that's being reviewed")". No comment on #187 contains that phrase (`gh api repos/michielvha/vh-adlc/issues/187/comments --paginate` filtered for "code that.s being reviewed" returned nothing). The owner's direction (comment 7220327075) says "at the exact reviewed commit". The reinterpretation comes from the orchestrator's decision (comment 7220697331): "'Exact reviewed commit' means the code commit whose tree the reviewed commit carries unchanged". The Owner summary now says "For this feature the owner directed the simplest answer on #187: the implementer runs those tests ... at the code being reviewed". That puts the orchestrator's wording in the owner's mouth and hides a material change that the owner should see before accepting. This text changed in this revision.
PROPOSAL: Replace the invented quote with a citation of comment 7220697331 and its actual words. In the Owner summary, say that the owner directed the exact reviewed commit and that the orchestrator ruled the code commit counts, as a change for the owner to confirm when accepting.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (second paragraph, "now fail once"; "Observed so far" paragraph, "Still planned" list), Test Plan AC-10
EVIDENCE: The Owner summary says "Run inside a sandbox, the route tests now fail once with a clear "needs an unsandboxed run" reason". At X, `grep -n "unsandboxed\|seatbeltAvailable" tests/vh-adlc/loop/review-route.test.ts` finds nothing, and T18, which adds that behaviour, is unticked. `run-review.sh:17-19` still logs the exit and then returns the status of its reporting command. The "Still planned" list leaves out both the loud failure and the fail-closed runner, so the summary presents planned work as observed. R-9 F-16 raised this. It is still unapplied, and this revision edited the paragraph. The quoted reason "needs an unsandboxed run" also differs from the AC-10 must-pass example in this revision, "The route tests need an unsandboxed run: ...", which does not contain "needs".
PROPOSAL: Describe the single failure and the fail-closed runner as planned, and add both to "Still planned". Quote the reason as the Test Plan's must-pass example gives it.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-08, Test Plan AC-08, Scope (pending-cases bullet), Owner summary (third paragraph), Design (Pre-existing hard links, Concurrency, failure and rollback)
EVIDENCE: AC-08, Scope and the Owner summary promise a retryable pending outcome when "a protected tree that changes during that check". Design limits it to "A file that disappears or can't be read during the check". The walk at `review-route.ts:316-323` lists each directory once, so a file added to a directory it has already listed is never seen, and no error is raised. Proof (2) only removes a file between listing and `lstat`. A check that misses every addition passes the proof, and two implementers could read AC-08 as needing either the narrow or the broad check. The AC-08 row and criterion were rewritten in this revision. The same gap was raised as R-9 F-13 and still applies to the reverted text.
PROPOSAL: Narrow AC-08, the Scope bullet and the Owner summary to Design's case: a file that disappears or cannot be read during the check leaves the review pending with a retryable reason.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design (Recorded unsandboxed run), frontmatter covers, Tasks T22
EVIDENCE: This revision defines "exact reviewed commit" as the code commit, "whose tree the reviewed commit carries unchanged apart from the document and the evidence". It also says "only the feature document and the evidence directory may change". `covers` lists `tests/vh-adlc/evidence/macos-review-boundary/mutants.py` and `.../run-review.sh`, which sit in that directory. So the mutant script or the runner at the reviewed commit can differ from the version that produced the record, and the `git diff --name-only` check still passes. The reviewer would then read a script that is not the one whose output it judges AC-02, AC-03, AC-08 and AC-11 from. R-9 F-10 raised the same delta.
PROPOSAL: Limit the allowed delta to the feature document, `recorded-run/` and the kept review artifact directories, and require both covered scripts to be byte-identical to the code commit.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design (Pre-existing hard links)
EVIDENCE: "the route makes it with `--no-hardlinks` (`review-route.ts:317`)". At X, line 317 is the `readdirSync` call in `linkedFile`, and the `git clone -q --no-hardlinks` call is at `review-route.ts:349`. R-9 F-17 raised this, and the paragraph was rewritten in this revision without correcting it.
PROPOSAL: Cite `review-route.ts:349`.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Owner summary ("What changed since the R-5 acceptance"), Scope (Not handled: a Git file other than the index and HEAD)
EVIDENCE: The summary lists "two stated limits" as changes since R-5. The Git-file limit was already in the accepted R-5 text (`git show 58342e95:docs/specs/macos-review-boundary.md` lines 161-163), so only the session-log limit is new. The restored limit also changes its reason. R-5 said "Git doesn't create such links for refs, and an object file isn't part of what the check judges". The new reason, "checking for them would leave every review pending for anyone with such a clone", explains objects but not the loose refs the same line names. The orchestrator's comment 7220697331 says the limit "is restored as it was".
PROPOSAL: Name the one new limit and the reworded one in the summary. Either restore the R-5 reason for refs or add it next to the clone reason.

### R-9

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Owner summary, Scope (recorded run and protocol exclusion), Design (Recorded unsandboxed run, Documentation), AC-01 to AC-03, AC-06, AC-08, AC-10, AC-11, Test Plan AC-06, Tasks T20 to T22, Open Questions
EVIDENCE: The R-8 revision puts the record in the reviewer’s clone. Scope still excludes “any protocol change for judging recorded runs.” `plugins/vh-adlc/references/review-protocol.md:43-47` forbids this dispatch instruction, and the pinned feature-document convention requires the reviewer to observe executed evidence for `met`. The owner approved a one-time exception, but neither the canonical instructions nor `cli.ts:55-76,178-196` gives that exception effect. In this review environment, an attempt to start `sandbox-exec` returned `sandbox_apply: Operation not permitted`. [Owner direction on #187](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7220327075)
PROPOSAL: Raise an Open Question about how to authorize and deliver the one-time exception under both the repository protocol and the pinned verdict rule. Specify the affected criteria and what the reviewer must verify before relying on the record.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter status description, Owner summary, Scope (recorded run), Design (Recorded unsandboxed run), AC-06, Test Plan AC-06 and AC-10, Task T22
EVIDENCE: The R-8 revision retains the promise to run the tests “at the exact reviewed commit” in the Owner summary and Scope. Design and T22 now run them at the code commit and dispatch the review at its successor. An endpoint tree comparison can establish which files differ, but the two commits still have different identities. The owner’s direction specifies the exact reviewed commit. [Owner direction on #187](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7220327075)
PROPOSAL: Use one target for execution and dispatch with a separate evidence handoff, or obtain explicit agreement to the two-commit procedure and make every statement of the requirement match it.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Owner summary, Context (rejected route-run evidence), Scope (recorded run), Design (Recorded unsandboxed run), Test Plan AC-02, Tasks T19 and T22
EVIDENCE: The R-8 revision still runs candidate tests and the mutation script outside Seatbelt. A fresh clone isolates the checkout under test, while the process retains the implementer’s filesystem access. `tests/vh-adlc/evidence/macos-review-boundary/mutants.py:15-22` also passes the inherited environment to Bun. The pinned `conventions/coding.md:95-97` requires an allowlisted environment for user-supplied code.
PROPOSAL: Specify a local test context that can start Seatbelt, uses an explicit environment allowlist, and lacks access to the implementer’s credentials and owning checkout. Use that context for all three recorded commands.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter goal, Owner summary (boundary and pending cases), Scope (write boundary and pending cases), Design (What the route denies, Pre-existing hard links, Documentation), AC-02, AC-07, AC-08, Test Plan AC-02 and AC-08, Tasks T18 and T19
EVIDENCE: The R-8 revision checks the owning index and HEAD, common `objects` and `refs`, and `packed-refs`, while the boundary promises protection for the Git directories and refs. Git also supports reftable, per-worktree administrative storage, and reflogs that can hold the only references to unpublished work. The new traversal leaves those files outside its link-count check. The same design assumes `--no-hardlinks` makes the private clone self-contained, but Git can carry forward a source repository’s external object alternates. [Git ref storage formats](https://git-scm.com/docs/git-init), [Git repository layout](https://git-scm.com/docs/gitrepository-layout), [Git clone documentation](https://git-scm.com/docs/git-clone)
PROPOSAL: Define which storage the route protects and keep the review pending whenever it cannot establish that the repository and clone use protected storage. Add a proof that distinguishes a shared ref from a shared object, including packed refs where supported.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter goal, Owner summary (boundary and pending cases), Scope (write boundary, pending cases, and surviving processes), Design (Pre-existing hard links, Concurrency, failure and rollback, Documentation), AC-02, AC-07, AC-08, Test Plan AC-02 and AC-08, Tasks T18 and T19
EVIDENCE: The R-8 revision adds a one-time scan of shared Git storage. In `review-route.ts:329-367` the check precedes clone or export preparation, the initial snapshot, and reviewer launch. Design expressly leaves other sessions free to write and lets detached reviewer processes outlive judgment. An ordinary local clone from another session can create aliases after the scan, including after `ready`. The disappearance test checks a failed lookup during the scan and leaves this lifetime gap open. [Git clone documentation](https://git-scm.com/docs/git-clone)
PROPOSAL: Specify a boundary that keeps Git storage protected for the full lifetime of reviewer processes. Use a disposable fixture to verify the outcome when another session creates a local clone after the preflight.

FINDING: F-06
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (Git hard-link recovery), Context (Background), Design (Pre-existing hard links, Documentation), AC-07, AC-08, Test Plan AC-08, Tasks T18 to T20
EVIDENCE: The R-8 revision prescribes `git repack -a -d` or recloning for every flagged Git file. In a disposable repository, an ordinary local clone shared object files only, an additional `--no-hardlinks` clone left the source links in place, and repack left a loose ref’s link count at two. In a separate disposable repository, `git repack -a -d` removed a recoverable draft object from an old pack. The planned proof checks the wording and never exercises recovery. [Git clone documentation](https://git-scm.com/docs/git-clone), [Git repack documentation](https://git-scm.com/docs/git-repack)
PROPOSAL: Give recovery guidance that preserves local data and identifies which repository and alias must be addressed. Prove that the original owning worktree can be reviewed after recovery and that unpublished data survives.

FINDING: F-07
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (model attestation), Scope (session-log forgery limit and Posture A), Design (What the route denies, Route acceptance, Codex route), AC-05, AC-06, Test Plan AC-05 and AC-06, Tasks T21 and T22
EVIDENCE: Scope excludes “a reviewer that forges the Codex session log the model attestation reads.” `review-route.ts:269-296,371-391` uses that reviewer-writable log to grant eligibility to store a reply as the requested model. The accepted limit therefore leaves the model eligibility decision dependent on evidence the reviewer can forge. [Owner direction on #187](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7218794661)
PROPOSAL: Base eligibility for a requested model on evidence outside the reviewer’s write authority. Keep the review pending when that evidence is unavailable.

FINDING: F-08
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (real Codex proof), Design (Recorded unsandboxed run, Route acceptance), AC-06, Test Plan AC-06, Tasks T21 and T22
EVIDENCE: The R-8 revision makes the implementation transcript show the reviewer reading the committed record. AC-06 also requires that implementation review to finish, its records to be stored and checked, and lint to pass. T22 schedules one implementation run and those later checks. If that run is the formal review, it must return an AC-06 verdict before those parts of its own proof exist. `review-route.ts:381-391` can return `ready` before criterion coverage is checked, and `internal/review/review.go:25-39` checks byte equality only.
PROPOSAL: Specify a completed proof run whose transcript, target, full criterion record set, storage check and lint result are available to a later formal reviewer. Say which run is diagnostic and which counts toward completion.

FINDING: F-09
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (unsandboxed-run diagnostic), Scope (test-file diagnostic), Design (Loud failure without a boundary, Recorded unsandboxed run), AC-10, Test Plan AC-10, Tasks T18 and T22
EVIDENCE: The changed AC-10 proof requires the literal substring `needs an unsandboxed run`. The message `The route tests need an unsandboxed run` satisfies the criterion and the Design wording, yet fails that match. The changed row also omits the must-pass and must-fail examples the pinned Test Plan convention requires.
PROPOSAL: Use a diagnostic check that accepts the stated message and distinguishes it from unrelated failures. List passing and failing examples and require the expected exit status, single failure, skips and non-route passes.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers`, Design (Recorded unsandboxed run), AC-02, AC-06, Test Plan AC-02 and AC-06, Tasks T19, T21 and T22
EVIDENCE: The R-8 revision adds the proof scripts to `covers`, but its code-to-review comparison permits changes anywhere in their enclosing evidence directory. Either script can therefore differ from the version at the tested commit and still pass the proposed comparison. The decisive test record also remains outside `covers`, so `internal/fresh/fresh.go:165-193` can report the review fresh after the record is replaced or removed.
PROPOSAL: Limit the allowed delta to the exact generated record and any permitted document changes. Bind freshness to the record the reviewer actually used.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (real Codex proof), Design (Delivery), AC-06, Test Plan AC-06, Tasks T21 and T22
EVIDENCE: The changed AC-06 row promises exact-target route JSON and an unchanged worktree. `run-review.sh:7-16` runs the controller from its own checkout, and `cli.ts:90-104` reads worktree settings for `route`. Matching porcelain status and refs can also miss changed bytes in a file already marked modified, an ignored file, or an index flag.
PROPOSAL: Pin the controller and route inspection to the proof target. Compare an independent snapshot of file contents, ignored paths, HEAD, index and refs, and verify that a same-status content change fails the check.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (mutation proof), Design (Recorded unsandboxed run), Test Plan AC-02, AC-03, AC-08 and AC-11, Tasks T5, T10, T19 and T22
EVIDENCE: The R-8 revision records the mutation script’s complete output, but `mutants.py:21-28` discards the Bun exit code and assertion diagnostics. The script can exit successfully with zero failures for a mutation, and a setup failure can supply a failure count without establishing that the guard was exercised.
PROPOSAL: Require the mutation script to verify the expected failing test and diagnostic for each mutation. Preserve the subprocess exit statuses and reject setup failures and zero-test runs.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (protected-tree changes), Scope (pending cases), Design (Pre-existing hard links, Concurrency, failure and rollback, Documentation), AC-08, Test Plan AC-08, Tasks T18 and T19
EVIDENCE: The R-8 revision retains the promise of a retryable reason when the protected tree changes, but its proof removes a listed file before `lstat`. That test can pass even when the scanner overlooks additions to a visited directory. The revised Design also names `packed-refs` without specifying how it distinguishes a normally absent file from one that vanished during the scan.
PROPOSAL: Define which changes produce the retryable reason and test each promised case. Include a normal repository without `packed-refs` and examples of pending reasons the changed proof must accept and reject.

FINDING: F-14
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (scratch and pending cases), Scope (scratch overlap and documentation), Design (Scratch overlap, Documentation), AC-07, AC-11, Test Plan AC-07 and AC-11, Tasks T18 to T20
EVIDENCE: AC-11 promises refusal for a destination above a protected root and for protected descendants in the private clone. Its proof covers the owning root, common Git storage and an owning-worktree descendant. It can pass with either promised check missing. `references/loop-settings.md:39` also says scratch entries are checked by path alone, while the planned edits cover its command-route paragraphs.
PROPOSAL: Add refusal cases for a strict ancestor and a protected clone descendant. Update the settings row to describe both name validation and the resolved-path check.

FINDING: F-15
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (validation and rollout), Scope (plugin bump and candidate installation), Design (Delivery, Concurrency, failure and rollback), AC-06, Test Plan AC-06, Tasks T7, T21 and T22
EVIDENCE: The changed proof still runs `cli.ts` directly from branch source. Design identifies `plugin.stale` as a stop in the supported lifecycle, and T8 records that `plugin.stale` is already true in the development checkout. The proof can pass without showing that either installed host can reach review and store its records. The pinned testing convention requires fresh installation and upgrade proof.
PROPOSAL: Stage the candidate privately through both marketplace layouts and exercise an upgrade through the supported review and record-storage flow before merge.

FINDING: F-16
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter status description, Owner summary (changes since R-5 and validation), Design (Loud failure without a boundary), AC-10, Test Plan AC-10, Tasks T18 and T21
EVIDENCE: The R-8 Owner summary says the route tests “now fail once” under a sandbox and lists a proof script that fails closed. T18 and T21 still schedule those changes. At `34633957`, `tests/vh-adlc/loop/review-route.test.ts` lacks the single failure registration, and `run-review.sh:15-19` logs the review exit code then returns the status of a reporting command.
PROPOSAL: Mark both changes as planned in the summary. Report observed results separately with the commit that produced them.

FINDING: F-17
KIND: factual
SEVERITY: nit
WHERE: Design (Pre-existing hard links), Sources
EVIDENCE: The R-8 revision reports “about a second over 373 objects” without a command, target or output. Its citation `review-route.ts:317` points to the directory walker in this export. The `--no-hardlinks` clone is at line 349.
PROPOSAL: Cite the command, target and output for the timing claim or remove it. Correct the clone citation.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Frontmatter status description, Owner summary, Scope (recorded run and protocol exclusion), Design (Recorded unsandboxed run, Documentation), AC-06, Test Plan AC-06, Tasks T20 to T22, Open Questions
EVIDENCE: The R-7 revision says, “Any route step that runs commands outside the reviewer's profile, and any protocol change for judging recorded runs. The recorded run is an owner-directed exception for this feature (#187).” The owner approved that exception. `references/review-protocol.md:43-47` still forbids dispatching a reviewer to judge from stored results, and `agents/vh-adlc-reviewer.agent.md:24-33,97-101` and the pinned `conventions/feature-documents.md:298-300` require evidence observed in the review for `met`. The planned edits leave those instructions in force and give the reviewer no way to apply the approved exception. [Owner direction on #187](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7220327075)
PROPOSAL: Raise an Open Question about how to give the approved one-off exception effect in the dispatch and verdict rules. Keep the existing rule for other reviews and specify which checks the exception covers.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Owner summary, Scope (recorded run), Design (Recorded unsandboxed run), AC-06, Test Plan AC-06, Tasks T21 and T22
EVIDENCE: The revised Design creates the log after testing the exact target and says the implementation prompt names it. `review-route.ts:347-354` checks out that target in a private clone, so the later log is absent there. `cli.ts:55-76,178-196` has no evidence argument or prompt field, and T21 and T22 specify no other handoff. Excluding the log from `covers` preserves freshness but does not deliver it to the reviewer.
PROPOSAL: Specify how the controller passes an exact-target log that the reviewer can read from the private clone. Bind the handoff to the full commit and log contents, and have the proof reject a missing or mismatched log.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter status description, Owner summary, Scope (recorded run and loud failure), Design (Loud failure without a boundary, Recorded unsandboxed run), AC-10, Test Plan AC-10, Tasks T18 and T22
EVIDENCE: The R-7 revision assigns AC-10 to the recorded run, but Design and T22 record the ordinary Bun invocation and the mutant script only. Test Plan AC-10 requires a separate run of the test file under `sandbox-exec` to observe one diagnostic failure, skipped route tests and passing non-route tests. The ordinary run exercises a different condition, and the Codex reviewer cannot start the required wrapper from its own profile.
PROPOSAL: Add the standalone AC-10 invocation to the exact-target recorded run. Keep its full output and check the expected nonzero exit, the single diagnostic failure and the pass and skip counts.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter status description, Owner summary, Context (rejected route-run evidence), Scope (recorded run), Design (Recorded unsandboxed run), Test Plan AC-02, Task T22
EVIDENCE: The replacement for route-run evidence executes candidate test and mutation code outside Seatbelt. A fresh clone separates the files under test, but it leaves the test process with the implementer's filesystem permissions. `mutants.py:15,21-22` also forwards the inherited environment to Bun, exposing any credentials it contains. The pinned `conventions/coding.md:95-97` requires an explicit allowlisted environment for user-supplied code. The owner authorized the run on the Mac outside Seatbelt. [Owner direction on #187](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7220327075)
PROPOSAL: Define a local test environment with an explicit environment allowlist and an account that cannot access the implementer's credentials or owning checkout. Keep it able to start Seatbelt and use it for the ordinary, nested and mutation runs.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Scope (hard-linked Git files limit and protected-file pending case), Goal, Owner summary (boundary and hard links), Design (What the route denies, Pre-existing hard links, Documentation), AC-02, AC-08, Test Plan AC-02 and AC-08
EVIDENCE: Scope excludes “a Git file other than the index and HEAD, such as an object or a loose ref, that already shares an inode with a path outside the protected trees.” The R-7 revision retains that limit. `review-route.ts:314-342` leaves those Git files out of the link-count check. An ordinary local clone can share those object inodes, as Context records. The limit leaves unpublished Git data writable through an outside name even though AC-02 promises to preserve refs and the owning repository.
PROPOSAL: Keep a review pending when the route cannot establish that shared Git storage is protected. Add a proof with an ordinary local clone containing unpublished Git data.

FINDING: F-06
KIND: factual
SEVERITY: blocking
WHERE: Scope (session-log forgery limit and Posture A), Owner summary (model attestation), Design (What the route denies, Route acceptance, Codex route), AC-05, AC-06, Test Plan AC-05 and AC-06, Tasks T21 and T22
EVIDENCE: Scope excludes “a reviewer that forges the Codex session log the model attestation reads.” The R-7 revision retains that limit. `review-route.ts:269-295,371-391` uses the reviewer-writable log to decide whether the owner-requested model ran and whether the reply is eligible to store. That permits a reply from a different model to qualify as the requested one.
PROPOSAL: Base requested-model eligibility on evidence that reviewer tools cannot change. Leave the review pending if that evidence is unavailable.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers`, Owner summary, Design (Recorded unsandboxed run), AC-02, AC-06, Test Plan AC-02 and AC-06, Tasks T19, T21 and T22
EVIDENCE: The R-7 revision removes the whole evidence directory from `covers` to allow late recording of logs. That also excludes `mutants.py` and `run-review.sh`, the executable checks the plan uses to establish AC-02 and AC-06. Changing either script can change what the proof establishes without making the review stale.
PROPOSAL: List the two proof scripts individually in `covers`. Keep generated logs and transcripts outside those entries.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (real Codex proof), Design (Delivery), AC-06, Test Plan AC-06, Tasks T21 and T22
EVIDENCE: The revised runner proof compares porcelain status and refs. Those can match when an already-modified file changes again, an ignored file changes, or an index flag changes. The existing `review-route.test.ts` includes a case named “a rewrite that keeps the status line leaves the review pending.” The plan also pins the policy to the target but leaves the runner free to execute `cli.ts` from a different checkout, as `run-review.sh:7-16` does today.
PROPOSAL: Run the controller from the exact proof target and compare an independent snapshot that includes file contents, ignored paths, HEAD, index and refs. Test that the runner fails when a file changes while its porcelain status stays the same.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Design (Route acceptance, Recorded unsandboxed run), AC-06, Test Plan AC-06, Tasks T21 and T22
EVIDENCE: The revised proof requires `ready`, `review check` and `lint`. `review-route.ts:381-391` can return `ready` without checking criterion coverage. `internal/review/review.go:25-39` checks that the stored bytes match, and `internal/doc/lint.go:148-151` checks record format. The checks for exactly one record per current criterion and its exact accepted text are in `internal/gate/gate.go:172-195`. The proposed proof can therefore pass with a record set that cannot enter the completion gate.
PROPOSAL: Make the runner proof validate the full implementation record set against the target document. Define which smoke dispatch produces the proof that the formal implementation reviewer will inspect.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (scratch and pending cases), Scope (scratch overlap and documentation), Design (Scratch overlap, Documentation), AC-07, AC-11, Test Plan AC-07 and AC-11, Tasks T18 to T20
EVIDENCE: The revised AC-11 promises refusal for a scratch destination above a protected root and for protected descendants in either checkout. Its proof covers the owning root, common Git storage and an owning-worktree descendant. It can pass if the parent check or the clone check is absent. `references/loop-settings.md:39` also says scratch entries are checked by path alone, while the planned documentation edits only its command-route paragraphs.
PROPOSAL: Add refusal cases for a strict ancestor and a protected clone descendant. Update the `review_scratch` settings row to distinguish name validation from the macOS route's resolved-path check.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (protected-tree changes), Scope (pending cases), Design (Pre-existing hard links, Concurrency, failure and rollback, Documentation), AC-08, Test Plan AC-08, Tasks T18 and T19
EVIDENCE: Scope and AC-08 promise a retryable pending outcome when the protected tree changes during the check. Design and the proof cover a listed file disappearing or becoming unreadable. A successful listing and `lstat` sequence can still miss a file added to an already-scanned directory, so the proposed proof can pass under a narrower contract than AC-08 states.
PROPOSAL: Define which changes the check detects and make Scope, AC-08 and the proof agree. If the promise includes additions during the scan, add a fixture that makes one and checks the retryable outcome.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (observed mutation proof), Design (Recorded unsandboxed run), Test Plan AC-02, AC-03, AC-08 and AC-11, Tasks T5, T10, T19 and T22
EVIDENCE: The R-7 revision relies on the mutant script's recorded run. `mutants.py:21-28` prints failure names and counts, discards the subprocess exit code and the assertion diagnostics, and can finish successfully with zero failures for a mutation. A logged exit of zero and a failure count cannot establish that the expected test ran and failed for the expected reason.
PROPOSAL: Require the mutation run to verify the expected failing test and assertion for each mutation. Retain each subprocess's exit status and diagnostic, and reject zero-test runs and setup failures.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (validation and rollout), Scope (plugin bump and candidate installation exclusion), Design (Delivery, Concurrency, failure and rollback), AC-06, Test Plan AC-06, Tasks T7, T21 and T22
EVIDENCE: The revised Scope excludes pre-merge candidate installation through the marketplaces. The only planned trial runs `cli.ts` from branch source, bypassing the installed plugin and the `plugin.stale` check that Design identifies as part of the supported workflow. The pinned testing convention requires installation and upgrade proof in a fresh environment, and the delivery convention requires a pre-merge check of the real artifact path.
PROPOSAL: Stage the candidate package privately and check both marketplace manifests in clean host profiles. Exercise the upgrade through the first review and record-storage step without publishing the candidate.

FINDING: F-14
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter status description, Owner summary (validation and changes since R-5), Design (Loud failure without a boundary), AC-10, Test Plan AC-10, Tasks T18 and T21
EVIDENCE: The Owner summary says the route tests “now fail once” inside a sandbox and lists a runner that fails closed among changes since R-5. At `cc7bb1ac`, `/usr/bin/sandbox-exec -p '(version 1)(allow default)' /usr/bin/true` reported `sandbox_apply: Operation not permitted`. In that environment, running the two named test files produced 3 passes, 51 failures and 1 load error, with repeated no-boundary failures in the route file. `run-review.sh:15-19` records the review exit and then returns the status of its final reporting command. T18 and T21 still list both changes as work to do.
PROPOSAL: Describe both behaviors as planned in the status and Owner summary. Record the observed behavior separately and name the target of each successful proof once it exists.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (evidence and permissions), Scope (route evidence), Design (Route evidence, Codex route, Concurrency, failure and rollback, Documentation), AC-09, Test Plan AC-09, Tasks T11 to T16
EVIDENCE: The revision after R-6 lets the commit under review supply shell commands that the controller runs outside Seatbelt on macOS. The design requires neither authorization for new commands nor an allowlisted environment. A candidate change can therefore acquire the controller's permissions before the reviewer starts, including access to credentials and the ability to write to the owning worktree. The after-snapshot cannot undo those effects, and `review-route.ts:195-197` checks only the owning branch among shared refs. The pinned `conventions/coding.md:95-97` requires an explicit allowlisted environment for user-supplied code.
PROPOSAL: Take execution authority from a trusted policy independent of the candidate commit, and run approved checks with an allowlisted environment in an isolated workspace that can start Seatbelt. Prove that a candidate cannot widen that authority or write to the owning repository.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (evidence at the reviewed commit), Scope (route evidence), Design (Route evidence, Codex route, Concurrency, failure and rollback), AC-06, AC-09, Test Plan AC-06 and AC-09, Tasks T12 to T17
EVIDENCE: The revision after R-6 takes the clone's baseline after running candidate commands in that same clone. A command can change the checkout before the reviewer sees it, and a later command can run against the changed checkout while its log header still names the original commit. The before-and-after check then compares the changed clone with itself. Test Plan AC-09 uses one command and checks the commit printed by that command, so it cannot detect either failure.
PROPOSAL: Give evidence commands disposable checkouts and give the reviewer a separately verified clean clone of the exact target. Add a two-command proof that establishes what the second command and the reviewer each see after the first command changes its checkout.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Goal, Owner summary (boundary and pending cases), Scope (write boundary and scratch overlap), Design (Profile, What the route denies, Scratch overlap, Concurrency, failure and rollback, Documentation), AC-02, AC-11, Test Plan AC-02 and AC-11, Tasks T13 to T15
EVIDENCE: The overlap check added after R-6 rejects a scratch destination equal to or above a denied root, or inside a Git directory. It leaves out protected descendants of the worktree and clone. A scratch alias to an ordinary tracked directory inside either root passes that check, while the later allow in `owned-process.ts:67-77` grants writes to its destination. The snapshot still excludes scratch by its declared path. The proof covers the root, Git storage and a disjoint directory, so it can pass with this gap.
PROPOSAL: Permit an allow only for the declared scratch subtree or a destination disjoint from every protected root. Use the validated canonical paths to build the profile and add a refusal case for an alias to a protected descendant.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Scope (hard-linked Git files limit and protected-file pending case), Goal, Owner summary (boundary and hard links), Design (What the route denies, Pre-existing hard links, Documentation), AC-02, AC-08, Test Plan AC-02 and AC-08
EVIDENCE: The revision after R-6 excludes “a Git file other than the index and HEAD, such as an object or a loose ref, that already shares an inode with a path outside the protected trees.” In a disposable fixture on this Mac, an ordinary local clone shared the source object's inode and both names reported two links. A `--no-hardlinks` clone had its own inode. The owning repository's objects remain outside the check at `review-route.ts:314-342`, so the stated limit can leave unpublished Git data writable through an outside alias.
PROPOSAL: Protect Git storage with outside aliases or keep the review pending when the route cannot establish that those aliases are protected. Add a proof using an ordinary disposable local clone.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Scope (session-log forgery limit and Posture A), Owner summary (model attestation), Design (What the route denies, Route acceptance, Codex route), AC-05, AC-06, Test Plan AC-05 and AC-06, Task T17
EVIDENCE: The revision after R-6 excludes “a reviewer that forges the Codex session log the model attestation reads.” `review-route.ts:269-296,371-391` still uses that reviewer-writable log to decide whether the requested model ran and whether the reply is eligible to store. The stated limit therefore leaves a way to forge the evidence that grants eligibility. The owner recorded the limit in [the R-6 answers on issue #187](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7218794661).
PROPOSAL: Base eligibility for a requested model on evidence that reviewer tools cannot modify. Keep the review pending if that evidence is unavailable and prove that a reviewer-writable log cannot establish eligibility.

FINDING: F-06
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (evidence and Linux behavior), Scope (Linux behavior and read-only evidence), Design (What the route denies, Route evidence, Codex route, Concurrency, failure and rollback, Documentation), AC-09, Test Plan AC-09, Tasks T12 to T16
EVIDENCE: The revision after R-6 runs evidence commands on Linux too. AC-09 requires the reviewer to be unable to change the logs or the protected paths, but the Linux route uses a PID namespace and turns Codex's own sandbox off. Design at lines 340-344 explicitly says Linux permits writes during review. The macOS-only proof cannot establish the unconditional criterion.
PROPOSAL: State the Linux and macOS contracts separately and make AC-09 and its proof match them. If Linux also promises immutable logs, specify and test the boundary that enforces that promise.

FINDING: F-07
KIND: judgement
SEVERITY: blocking
WHERE: Owner summary (evidence handoff), Scope (route evidence and protocol updates), Design (Route evidence, Loud failure without a boundary, Codex route, Documentation), AC-02, AC-06, AC-07, AC-09, AC-10, Test Plan AC-02, AC-06, AC-07, AC-09 and AC-10, Tasks T13 to T17, Open Questions
EVIDENCE: The revision after R-6 tells the reviewer to judge from route logs, but `references/review-protocol.md:43-47` excludes dispatch instructions to judge from stored results in place of running a check. The planned documentation edit covers only Routes. The declared evidence command also runs only the two ordinary Bun test files. It omits the standalone AC-10 invocation and the AC-02 mutation run, whose script writes source files before launching tests. The Codex reviewer cannot run those proofs in the protected clone. The owner requires Codex to review this implementation. [Issue #187 owner decision](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7218794661)
PROPOSAL: Resolve in Open Questions how fresh controller-run evidence from the same dispatch qualifies under the independence rule. Specify which proofs the controller owns, including the nested-run and mutation proofs, and run any source-changing proof in disposable scratch.

FINDING: F-08
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (profile failure), Scope (profile-application pending case), Design (Availability probe, Profile application failure, Route acceptance, Documentation), AC-03, Test Plan AC-03, Tasks T13 and T14
EVIDENCE: The revision after R-6 treats exit 71 and `sandbox_apply` on stderr as proof that the reviewer never started. The planned test deliberately starts a reviewer command that emits that status and message. It requires the route to classify a started reviewer as a failed wrapper, so a correct implementation that distinguishes the two events would fail the proof.
PROPOSAL: Establish whether the wrapper launched the reviewer through a controller-observed startup signal. Test an application failure separately from a started reviewer that returns the same status and diagnostic.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (real Codex proof), Design (Delivery), AC-06, Test Plan AC-06, Task T17, `tests/vh-adlc/evidence/macos-review-boundary/run-review.sh`
EVIDENCE: The script added since R-6 records the review exit at line 17 but returns the status of the final status-report command. A pending review can leave the script successful. It also queries `route` from the working tree while `review` loads policy from the target commit, and it has no exact-run transcript locator. The R-6 artifact's before and after status files match, but both contain a pre-existing untracked path. Identical porcelain output alone cannot establish preservation of dirty bytes or refs. `internal/gate/gate.go:172-195` checks criterion coverage and exact wording that `lint` and `review check` do not establish.
PROPOSAL: Make the runner fail closed on the target, route outcome and preservation checks, and bind each retained transcript to the exact dispatch. Specify a proof run that precedes the formal implementation review, validate the full record set, and keep generated output outside `covers` so recording it does not stale the reviewed commit.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (validation and CI), Context (boundary-test measurement), Scope (PR #182 exclusion), Design (Codex route, Delivery), Test Plan AC-01, AC-06 and AC-09, Tasks T5, T8, T10, T14 and T16
EVIDENCE: The declared evidence command includes the known failing page-cache fixture. At this target, `pages-stub.ts:17-21` writes under `XDG_CACHE_HOME`, while `pages.ts:13-15` reads the macOS cache under `~/Library/Caches`. T14 requires the route test file to pass, but the task sequence never brings in the stated fix. The macOS CI job at `.github/workflows/ci.yml:73-110` does not select these loop test files. [PR #182 describes the fixture fix](https://github.com/michielvha/vh-adlc/pull/182)
PROPOSAL: Make the fixture fix an explicit prerequisite for the exact-target macOS proof and require an observed passing run before merge. Name which checks the local run, Linux CI and macOS CI each establish.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (evidence defaults), Scope (route evidence), Design (Route evidence, Concurrency, failure and rollback), AC-09, Test Plan AC-09, Tasks T11 to T14
EVIDENCE: The revision after R-6 specifies a per-command timeout and says a timeout is logged, but it gives no output limit or total dispatch budget. `owned-process.ts:125-126,157-172` applies its default output cap only when capture or watched outputs are enabled. The proposed file-backed logs can therefore grow without a cap, and a list of commands can delay the reviewer by the sum of their timeouts. The proof exercises a normal exit and a nonzero exit only.
PROPOSAL: Define valid timeout bounds and cap evidence duration and output at the dispatch level. Make cancellation and truncation visible in the log, and exercise both timeout and output exhaustion.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Goal, Owner summary (rollback and approval), Scope (committed Codex routes), Design (Delivery, Concurrency, failure and rollback)
EVIDENCE: The revision after R-6 names the host route as the fallback for commits that already carry the Codex routes. `cli.ts:178-184` reads the route from the target commit, and `settings.ts:190-207` allows a local override to replace only the executable. Deleting `loop.yaml` on a later commit therefore cannot select a host review for the older target. The owner also declined a host exception for this feature. [Issue #187 owner decision](https://github.com/michielvha/vh-adlc/issues/187#issuecomment-7218794661)
PROPOSAL: Describe rollback for future commits and give an executable recovery path for existing targets. State the pending outcome when the installed version cannot run the target's configured route.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (validation and delivery), Scope (plugin minor bump), Design (Delivery), AC-06, Test Plan AC-06, Tasks T7, T8 and T17
EVIDENCE: Delivery now names both marketplaces, but its only candidate procedure runs `cli.ts review` directly from source. On this export, `cli.ts context` reported candidate `0.34.0`, installed `0.33.0` and `stale: true`. The review skill stops before storage on that result. The direct run also does not exercise either marketplace installation path as required by `conventions/delivery.md:111-117`.
PROPOSAL: Add a pre-merge candidate installation check through both marketplace paths. Exercise the supported review and record-storage flow with the candidate loaded.

FINDING: F-14
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers`, Scope (evidence and committed routes), Design (Route evidence, Codex route, Delivery, Documentation), AC-06, AC-07, AC-09, Test Plan AC-06, AC-07 and AC-09
EVIDENCE: `covers` now includes `cli.ts`, but `cli.ts:55-58` reads the command reviewer's actual instructions from `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, which is omitted. Both marketplace catalogs are also omitted despite deciding what package Delivery publishes. Changes to those files can alter the behavior or artifact this document promises without being recognized as covered drift.
PROPOSAL: Cover the canonical reviewer instructions and both marketplace catalogs. Include any other direct proof dependencies introduced by the revised plan.

FINDING: F-15
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (observed mutation proof), Test Plan AC-02 (4), Tasks T5, T10 and T14
EVIDENCE: The updated summary says the committed mutant script shows every boundary test failing against its guard. `mutants.py:6-14` has no allow-rule mutation, which Test Plan AC-02 (4) requires. T14 correctly lists that mutation as future work. The observed claim therefore overstates the committed proof.
PROPOSAL: Name the mutations already observed and mark the allow-rule proof as planned until the run establishes it.

FINDING: F-16
KIND: factual
SEVERITY: nit
WHERE: Scope (route evidence), Design (Route evidence, Documentation), AC-07, Test Plan AC-07, Task T15
EVIDENCE: The revision introduces the user-facing term `route evidence`. The pinned feature-document standard requires new user-facing terms to appear in a glossary row and be held to that wording by a criterion. AC-07 requires a description of the file but omits the glossary entry.
PROPOSAL: Define `route evidence` in the existing loop settings glossary and include that entry in the AC-07 proof.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Goal, Owner summary (boundary guarantee), Scope (first In scope bullet), Design (Profile, What the route denies, Documentation), AC-02, Test Plan AC-02 (4)
EVIDENCE: `settings.ts:70-79` validates scratch names lexically. `owned-process.ts:49-77` resolves them and places their allows after the protected-path denies. An otherwise valid scratch name can resolve to the owning worktree or its Git directory, making protected files writable. The before-and-after check cannot catch a detached process writing after it returns. The committed configuration declares no scratch, but the boundary is a plugin feature that explicitly supports it, and the proof tests only an ordinary `build` directory.
PROPOSAL: Validate scratch destinations against the resolved protected roots before launching the reviewer. Preserve disjoint shared-cache symlinks and add a refusal test for a scratch destination that overlaps a protected root.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Scope (Posture A stated limit), Owner summary (trade-offs and attestation), Design (What the route denies, Codex route), AC-05, AC-06, Test Plan AC-05 and AC-06
EVIDENCE: Scope leaves writes outside the protected paths open and expressly includes “Codex's session log.” `review-route.ts:269-296,371-389` uses that reviewer-writable log as the authority for whether a reply from `MODEL: unknown` came from the owner's requested model. The model match decides whether a review may be stored. The same tool access the design grants the reviewer lets it alter the evidence used to decide its eligibility.
PROPOSAL: Establish the served model through evidence that reviewer tools cannot modify. Keep the review pending when that evidence is unavailable, and change the proof to check that reviewer-writable data cannot establish a match.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Scope (hard-linked Git files stated limit and third In scope bullet), Goal, Owner summary (boundary and hard-link paragraphs), Design (What the route denies, Pre-existing hard links, Documentation), AC-02, AC-08, Test Plan AC-08
EVIDENCE: Scope excludes “a Git file other than the index and HEAD, such as a loose ref or an object, that already shares an inode with a path outside the protected trees.” `review-route.ts:314-342` skips `.git` apart from the index and HEAD. I created an ordinary local clone in scratch and verified that it shared a Git object inode with its source, with a link count of two. The path-based profile leaves the outside name writable. A reviewer process could corrupt an object containing unpublished work without changing a worktree file, index or ref or triggering the snapshot.
PROPOSAL: Make the review pending when an object or ref in the protected Git storage has a writable outside alias that the boundary cannot protect. Add a proof using a disposable ordinary local clone.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Test Plan AC-02 (linked-worktree fixture), Tasks T3 and T10
EVIDENCE: The new fixture runs `git init`, `git add`, `git commit` and `git worktree add` through the helper at `review-route.test.ts:15-19,397-409`. The helper inherits `process.env`, including Git repository and index overrides. A run started by a Git hook can therefore direct these writes at the repository the hook is acting on. The pinned `conventions/testing.md:103-106` explicitly requires fixture builders to clear those variables.
PROPOSAL: Clear Git's repository-local environment in fixture Git calls before running any write. Check that the fixture leaves an independently supplied repository and index untouched.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Goal, Owner summary (test-nesting limit), Scope (test-nesting stated limit), Design (Codex route, Concurrency, failure and rollback, Documentation), AC-01 to AC-03, AC-06 to AC-08, Test Plan AC-01 to AC-03 and AC-06 to AC-08, Tasks T8 and T9
EVIDENCE: The formal implementation review is assigned to the host route or Linux. At this target, `cli.ts route --operation review` returns `command`. The review skill uses that route in place of the host dispatch, and `cli.ts:181-184` reads policy from the reviewed commit. A local edit or per-user executable override cannot select the host route at that commit. Linux skips the Darwin-only proofs at `review-route.test.ts:376,418-498`. In this macOS review session, `sandbox-exec` returned `sandbox_apply: Operation not permitted`, and the route tests failed to establish the macOS boundary. The prescribed alternatives therefore leave no documented workflow that can establish all criteria at the committed target.
PROPOSAL: Specify and prove how an independent reviewer outside Seatbelt on macOS produces the formal implementation review for the same commit while both Codex command routes stay configured. Raise an Open Question if that requires changing the repository's route-selection rules.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (planned AC-06 proof), AC-06, Test Plan AC-06, Tasks T9
EVIDENCE: The Test Plan specifies a manual procedure. `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:122-126` requires a committed script that reruns an agent session and keeps its transcript when agent behavior is the proof. The two stated pass checks also leave a gap. `review-route.ts:381-391` returns `ready` after checking the header, model and target, and `internal/review/review.go:25-39` checks that the stored bytes match the returned bytes. A malformed record set can pass both.
PROPOSAL: Make T9 deliver a rerunnable script that captures both exact-target transcripts, verifies record format and criterion coverage as appropriate, and runs `review check` against the stored bytes. Commit that evidence before the formal implementation review so the covered evidence files belong to its target.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (AC-02 proof changes), AC-02, Test Plan AC-02 (1) and (2), Tasks T10
EVIDENCE: The revised wait proves that the writer finished, but does not prove when it attempted the write. `review-route.test.ts:382-389,419-444` starts a one-second sleep when the stub forks and observes the completion file after the route returns. If the controller takes longer than a second to finish, the writer can attempt the write before judgment and the same assertions still pass.
PROPOSAL: Release each detached writer with a signal from the test after the route returns `ready`, then wait for its completion record. Keep a deadline for both waits.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (mutation proof), Design (Profile), AC-02, Test Plan AC-02 (4), Tasks T5 and T10
EVIDENCE: The row requires each boundary test to fail when the part it guards is removed. The scratch test at `review-route.test.ts:463-469` checks the allow rule, but `mutants.py:6-13` never removes that rule. The mutation evidence therefore does not establish the claim that every boundary test failed against the part it guards.
PROPOSAL: Run the scratch test with the allow rule removed and record that the scratch write fails while the ordinary temporary write still succeeds.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Scope (documentation bullet), Design (Documentation), AC-07, Test Plan AC-07, Tasks T6
EVIDENCE: AC-07 calls for both references to state four points. Design asks only for a sentence in `review-protocol.md` naming the boundary. The implementation follows Design at `review-protocol.md:19-21`, linking to `loop-settings.md:136-152` for the details. A reviewer reading the criterion literally would find three of its required statements absent from the protocol.
PROPOSAL: State which reference owns the four details and what the protocol must say or link to. Make the proof and T6 use that same requirement.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Goal, Owner summary (validation and rollout), Scope (plugin minor bump), Design (Concurrency, failure and rollback), Tasks T7 to T9
EVIDENCE: `cli.ts context` from this export reported running 0.34.0, installed 0.33.0 and `stale: true`. The spec and review skills stop before writes on that result. The document records the mismatch in T8, but gives no way to install or run the candidate through the supported lifecycle before merge. A direct `cli.ts review` smoke run can reach `ready` while the operator still cannot store it through the documented workflow. The pinned delivery convention also requires the feature to name its artifact publication paths.
PROPOSAL: Name the Claude Code and Codex plugin distribution paths and document how to load the candidate consistently before storing reviews. Verify the supported workflow from an older installation and state how to roll back for future targets and for targets that already committed the Codex routes.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Design (Pre-existing hard links, Concurrency, failure and rollback), AC-03, AC-08, Test Plan AC-03 and AC-08
EVIDENCE: The reviews use separate temporary directories but share the owning worktree. The new preflight at `review-route.ts:314-342` performs a directory listing followed by separate `lstatSync` calls. An ordinary concurrent deletion between the two can throw and produce a CLI error instead of a pending review. Design also promises a command-start reason if Seatbelt cannot apply. A started `sandbox-exec` process that fails to apply its profile follows the child-exit path at `review-route.ts:366-380`, which reports a generic exit code.
PROPOSAL: Define retryable pending results for a changing or unreadable protected tree and for profile-application failure. Add proofs that distinguish those failures from reviewer-command errors.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers`, Scope (committed routes), Design (Route acceptance, Codex route), AC-05, AC-06, Test Plan AC-05 and AC-06
EVIDENCE: `covers` omits `plugins/vh-adlc/scripts/loop/cli.ts`, `settings.ts` and `pages.ts`. Those files decide the route, load policy at the exact commit and can stop both real reviews before the boundary starts. `internal/fresh/fresh.go:165-180` only invalidates an implementation review for changed covered paths. A later change that breaks route selection or page caching can therefore leave this feature's review current.
PROPOSAL: Add the direct routing and preflight dependencies to `covers`, together with any fixtures the revised proof depends on.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `status_description`, Owner summary (opening and validation paragraphs), Tasks T8 to T10
EVIDENCE: The change since the previous review committed `.vh-adlc/loop.yaml` and updated the late-writer tests. The status still lists T8 and T10 as outstanding, and the summary says there is no committed route and this spec still uses the host route. Both route lookups on the export returned `command`, `gpt-6.2-sol` and `codex-session`. The summary also gives a four-failure count while T8 gives five for its broader run. I reproduced the cache-stub failure in the targeted CLI test, but those counts refer to different runs.
PROPOSAL: Update the status and summary to reflect the committed configuration and late-writer changes. Name the scope of any test counts and keep the two end-to-end runs and formal implementation review visible as remaining work.

FINDING: F-14
KIND: factual
SEVERITY: nit
WHERE: AC-05, Test Plan AC-05
EVIDENCE: The criterion gives `bun scripts/loop/cli.ts route` “In this repository,” but that path does not exist at the repository root. Both commands in its Test Plan passed using `plugins/vh-adlc/scripts/loop/cli.ts`.
PROPOSAL: Use the repository-relative CLI path in AC-05.

FINDING: F-15
KIND: factual
SEVERITY: nit
WHERE: Scope (plugin minor bump), Tasks T7
EVIDENCE: T7 names only `.claude-plugin/plugin.json` and cites `(Design)` in place of a criterion. Both manifests at the target report 0.34.0. The named `plugin-version.test.ts` checks version reporting and stale detection. It does not prove that both manifests received the same minor bump.
PROPOSAL: Name both manifests and make matching minor versions an explicit done condition linked to a criterion.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-02 (the new sentences "Each late writer sleeps one second, tries its write, and then records that it finished in a file under the temporary directory. The test waits for that record, up to a 10-second deadline, before asserting"), Tasks T3 and T5 (ticked), and the unchecked tail T8 and T9
EVIDENCE: This revision applied R-4 F-02 by changing the AC-02 row, which is part of the normative baseline. It did not add a task to bring the tests in line. At X, `tests/vh-adlc/loop/review-route.test.ts:379-381` (`lateWriter`) still runs `sleep 1; <command>` and writes no completion record. Test (1) at `:410-415` still does `await Bun.sleep(2_000); expect(existsSync(late)).toBe(false);`, and the rename tests at `:418-436` still do `await Bun.sleep(2_000)` and then `readFileSync(rec, ...)`, with no wait for a record and no deadline. T3 and T5 stay ticked against the old row, and the only unchecked tasks are T8 (`.vh-adlc/loop.yaml`) and T9 (AC-06 evidence). The convention says "Re-planning keeps checked tasks and changes only the unchecked tail; new requirements get new task IDs." An implementer who finishes T8 and T9 leaves the tests with the fixed sleeps R-4 F-02 identified as flaky, so the AC-02 proof named in the row does not exist and the implementation review finds a mismatch. The gap comes from this revision's change to the AC-02 row.
PROPOSAL: Add a new unchecked task before T8, for example T10 on `tests/vh-adlc/loop/review-route.test.ts`: every late writer records that it finished, and each late-writer test waits for that record, up to a 10-second deadline, before asserting. Its done condition is that the boundary tests pass on this Mac and `mutants.py` still shows each one failing against its part (AC-02).

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (validation paragraph: "Two smoke runs of real Codex `gpt-6.2-sol` through the route came back ready with the model attested, and Codex's write probe was refused inside the profile.")
EVIDENCE: Nothing in the document, the Tasks evidence or `tests/vh-adlc/evidence/macos-review-boundary/` records these runs. That directory holds only `mutants.py` and `mutants.out`, and `git grep -i smoke 58342e95 -- docs/specs/macos-review-boundary.md tests/vh-adlc/evidence` finds only this sentence and unrelated Antigravity files. The convention says "Context and Design cite their claims: a `file:line`, or a command and its output", and the summary must "distinguish planned checks from observed proof". This revision added the sentence.
PROPOSAL: Cite the command and the observed outcome of the smoke runs (date, commit, the `ready` status and the attested model, and the refused write) in Background, or drop the sentence and leave AC-06 as the planned real-Codex proof.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary ("so this revision renames it, and the second plugin manifest joins `covers`. Nothing else in the scope changed.")
EVIDENCE: The same revision also changed the normative AC-02 Test Plan row since the R-3 acceptance. The late-writer tests now wait for a completion record up to a 10-second deadline, and the main-checkout rename test now checks the linked worktree's index instead of `src/late.txt`. The convention asks the summary to "Explain material changes since the last accepted scope". The sentence is narrowly true of the Scope section, but it leaves the owner thinking the model and `covers` are the only baseline changes being accepted again.
PROPOSAL: Add half a sentence saying that the AC-02 proof now waits for each late writer to finish, and that the main-checkout rename case checks the index.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary: "Planned proof: ... Nothing has run against the change yet. This spec's reviews run on the host route, because the Codex route can't run here until the change exists."), Tasks T1 to T7 evidence lines
EVIDENCE: At X, Tasks T1 to T7 are ticked with observed evidence: unit runs on this Mac (T2, T4, T5), the mutation runs in `tests/vh-adlc/evidence/macos-review-boundary/mutants.out` and the doc and version checks (T6, T7). I reran `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts tests/vh-adlc/loop/owned-process.test.ts` on this Mac: 54 pass, 5 skip, 2 fail on the first run, and 1 fail (the known `pagesStub` cache case) on the second. So the Owner summary's claim that nothing has run against the change is false at X. The convention requires the summary to "distinguish planned checks from observed proof" and to be refreshed "when scope, proof or decisions change and before asking for acceptance". The summary also says nothing about this revision, which is the reason the owner has to accept again: the model moves from gpt-6.1-sol to gpt-6.2-sol (issue #187: "the Codex review model is now `gpt-6.2-sol`, which supersedes `gpt-6.1-sol`") and `plugins/vh-adlc/plugin.json` joins `covers`. The convention asks the summary to "Explain material changes since the last accepted scope". This stale text comes from before R-3. The revision since R-3 made it wrong by recording T1 to T7 without updating the summary.
PROPOSAL: Rewrite the validation paragraph of the Owner summary so it separates what has been observed (the T1 to T7 unit and mutation runs on this Mac, and the one macOS-only failure outside the feature) from what is still planned (T8, the AC-06 real Codex reviews, Linux CI). Add one sentence on what changed since the R-3 acceptance: the gpt-6.2-sol model the owner chose on #187, and the second manifest added to `covers`.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-02 (test (1) "one second after the stub exits ... after two seconds", test (2) "Each rename is refused, which the writer records in a file under `T`"), Tasks T5, `tests/vh-adlc/loop/review-route.test.ts:379-381` and `:418-436`
EVIDENCE: On my first run of `bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts tests/vh-adlc/loop/owned-process.test.ts` on this Mac at X, the darwin test "a late writer cannot rename the worktree's grandparent and write through the new path" failed after 4109 ms; it normally takes about 3.6 s. It passed when rerun alone, in three more sequential runs of the boundary tests and in two `--parallel` runs. I did not capture the assertion message. The test design leaves only a narrow timing margin. `lateWriter` forks perl, which calls setsid and execs `env -i /bin/sh -c "sleep 1; ..."`, so the one-second delay starts when the stub forks, not when it exits. The test then reads the record file with `readFileSync(rec)` after a fixed `Bun.sleep(2_000)` once the review returns, and never waits for the writer to finish. A slow perl or shell start on a loaded Mac makes the record absent, which fails a correct implementation. The Test Plan row gives a fixed two-second wait for (1) and no wait at all for the record in (2). T5's evidence ("52 pass, 1 fail", that one failure being the pages fixture) does not record this flake.
PROPOSAL: In the AC-02 row, have each late-writer test wait for the writer's record file to appear, up to a deadline such as 10 seconds, before asserting on it and on the protected file. Keep a fixed delay only as the writer's own sleep, then update the tests to match.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-02 (test (2), Rename routes)
EVIDENCE: The row still says both late writers "write `src/late.txt` through the new path" and that "the file doesn't exist afterwards". The implemented main-checkout test at `tests/vh-adlc/loop/review-route.test.ts:428-436` instead appends to `${main}x/.git/worktrees/wt/index` through the renamed path and asserts the index digest is unchanged, which is what R-3 F-01 proposed. The row was not updated, so it now describes a different check from the one T3 built and `mutants.out` lists under "no parent literal denies" and "no Git-directory denies". This revision changed the baseline but did not touch this row.
PROPOSAL: Reword test (2) in the row so the main-checkout writer changes the linked worktree's index through the renamed path and the index is asserted unchanged, as the test does.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Tasks T7
EVIDENCE: T7 names only `plugins/vh-adlc/.claude-plugin/plugin.json`, but its evidence line and commit c245b94c bump both manifests. `plugins/vh-adlc/plugin.json` now reads `"version": "0.34.0"`, and this revision adds that path to `covers`. The convention says each task "names the file it touches".
PROPOSAL: Name both manifests in T7's task line.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-02 (test (2), Rename routes)
EVIDENCE: Test (2) has both late writers "rename a directory, write `src/late.txt` through the new path and rename it back", and one of them renames the main checkout `T/a/b/main`. `src/late.txt` is in the owning worktree `T/a/b/wt`, which is not under `T/a/b/main`, so renaming the main checkout gives no new path to it. What that rename actually exposes is the common Git directory: refs and the linked worktree's index and HEAD under `T/a/b/main/.git/worktrees/wt`. On this Mac I set up plain directories in a fresh `mktemp -d` T: `T/a/b/main/dg` subpath-denied in place of the common directory, `T/a/b/wt` subpath-denied, and literal denies on `T/a/b/main`, `T/a/b`, `T/a` and T. Under that profile, `mv T/a/b/main T/a/b/m2` was refused ("rename ... Operation not permitted"), creating `T/a/b/main/side` succeeded, and a write through a symlink outside the trees into `T/a/b/wt/src` was refused. So the "rename is refused" record still makes the test fail when the main checkout's literal deny is missing. But the row's "the file doesn't exist afterwards" check does nothing for the main-checkout writer, and no write to the Git directory through the renamed path is ever tried or checked. This text is new in this revision, added for R-2 F-01. I could not build the fixture with real `git worktree add` here, because this session's harness refuses git commands that point outside its worktree. The rename and symlink results above come from plain directories.
PROPOSAL: For the main-checkout writer, have it write a ref or `.git/worktrees/wt/index` through the renamed path, and assert that file is unchanged afterwards, instead of `src/late.txt`.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-02 (tests (2) and (5)), AC-02, Design (Profile: "for each parent directory of a denied path, up to `/`"; What the route denies: Git directory and common Git directory)
EVIDENCE: The existing fixture `repository()` (tests/vh-adlc/loop/review-route.test.ts:23-38) makes the owning worktree as `mkdtemp(join(tmpdir(), "vh-review-route-"))` and runs `git init` in it, so it is a main worktree whose `.git` sits inside `repo`, and its parent directory is `$TMPDIR` itself. Three consequences, all from the AC-02 row this revision rewrote for R-1 F-01 and F-05. First, test (5) (`git branch x`, `git tag -f t`, writing `.git/index`) passes when the route denies only `repo`: neither the `--absolute-git-dir` deny nor the `--git-common-dir` deny is exercised, yet in a linked worktree such as this repository's `.claude/worktrees/<name>` the index, HEAD and every ref live in `/Users/michielvh/code/vh-adlc/.git`, outside `repo`. Test (5) also does not say the stubs target the owning worktree; an implementation reviewer's cwd is the clone (review-route.ts:331), where those commands only touch the clone. Second, test (2) renames only the immediate parent, so an implementation that adds a `literal` deny for the immediate parent and not for the ancestors above it passes. On this Mac, in a fresh `mktemp -d` T with D0=T/gp/parent/repo and literal denies on T/gp/parent and T/gp only, `mv T/gp T/gpx` was refused but `mv T T.x` returned 0, so the grandparent rename route stays open. Third, with today's fixture the parent test (2) renames is `/var/folders/sm/.../T`, the user's per-user temporary directory (`ls -ld` shows its parent `drwxr-xr-x michielvh staff`, so the rename succeeds unconfined). The row requires each test to be "watched failing with the named part of the profile removed", and that watched-failing run of (2) moves the whole `$TMPDIR` away from every other process on the machine until the writer renames it back.
PROPOSAL: Give the AC-02 tests a fixture of their own: a main checkout nested two levels below a fresh `mkdtemp` directory plus a linked worktree (`git worktree add`) used as the owning worktree, so its Git directory and common Git directory lie outside `repo`. Have test (2) rename the grandparent and, separately, the main checkout directory, and have test (5) run `git -C <owning worktree>` and write the linked worktree's index, each watched failing with the matching deny removed.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Context (Owner summary: "The owner can still pick it at acceptance."), Scope (Not handled: "Posture A, decided by the orchestrator under the owner's delegation ... (R-1 F-04)"), Open Questions ("None.")
EVIDENCE: The Owner summary offers the owner a choice between posture A and the deny-by-default profile at acceptance, but Scope records the posture as already decided and Open Questions says "None.", which the convention reads as every question answered. An acceptance row therefore records nothing about which posture the owner chose. The delegation cited (ledger #179) asks for the Codex review setup to be configured without asking; it does not name the write posture. This text is new in this revision.
PROPOSAL: Either drop "The owner can still pick it at acceptance" so the summary matches Scope, or, if the owner is meant to choose, raise the posture as an Open Question with both options.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary), Scope (third In scope bullet), Design (Pre-existing hard links), AC-08
EVIDENCE: Scope, Design and AC-08 add a new default: under the macOS boundary, a review whose protected files (including every file in ignored directories, which `treeManifest` hashes, review-route.ts:49-62 and 186-189) already share an inode with another path stays pending. The Owner summary, which the convention asks to cover important defaults and permissions, does not mention this pending outcome. I found no such files in this worktree or the main checkout today (`find ... -type f -links +1` printed nothing), so it changes nothing an implementer builds.
PROPOSAL: Add one sentence to the Owner summary saying that on macOS a review stays pending, naming the file, when a protected file has a second hard link.

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Profile; What the route denies), Owner summary ("refuses writes to exactly the paths the check judges"), goal frontmatter, AC-02, Test Plan row AC-02
EVIDENCE: A `(deny file-write* (subpath D))` rule does not stop a process from renaming an ancestor of D. I ran this on this Mac in a fresh mktemp dir T with D0=T/parent/repo: `sandbox-exec -D D0=... -p '(version 1)(allow default)(deny file-write* (subpath (param "D0")))' /bin/sh -c "echo x > T/parent/repo/f; mv T/parent T/moved; echo hacked > T/moved/repo/f; mv T/moved T/parent"`. The direct write was refused ("Operation not permitted"), but `mv=ok w=0 back=0` followed, and `cat T/parent/repo/f` printed `hacked`. The ancestors of the denied paths are left writable: for this worktree that is `/Users/michielvh/code/vh-adlc/.claude/worktrees` and the main checkout `/Users/michielvh/code/vh-adlc`, which also holds the common Git directory. So a detached writer can change the worktree, the index and refs after the review has been judged, which is the guarantee the goal and AC-02 promise. The AC-02 tests only write through the protected path, so every listed proof passes on this design. I also tested the fix: adding `(literal (param "A1")) (literal (param "A2"))` for T/parent and T to the deny refused the `mv` ("rename ... Operation not permitted"), still allowed creating a sibling file in T/parent, and left the file as `orig`.
PROPOSAL: In the profile, also deny `file-write*` on the `literal` path of every ancestor of each denied path, up to `/`. State this in Design and the loop-settings paragraph, and add an AC-02 test where a late writer renames the worktree's parent directory, writes through the new path and renames it back, asserting that the rename is refused and the file is unchanged.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Profile; What the route denies), Scope, AC-02
EVIDENCE: Seatbelt matches the path a write goes through, not the inode. In a fresh temp dir I made a hard link `T/out/link` to `T/repo/f` and ran `sandbox-exec ... (deny file-write* (subpath T/repo))` with `echo hacked > T/out/link`. It returned `w=0`, and `T/repo/f` then read `hacked`. Any file in the worktree or its Git directories that shares an inode with a writable path outside them can be changed through that other path, during or after the review. Examples are Git objects shared with a local clone made without `--no-hardlinks`, and hard-linked package stores. The route's own clone uses `--no-hardlinks` (review-route.ts:317), which shows the hazard is known. I found no such links in this repository today (`find ... -links +1` returned nothing). AC-02 still says "no reviewer process can change the owning worktree" without exception.
PROPOSAL: Either leave the review pending when a protected tree holds a regular file with a link count above 1, or add a Scope "Not handled" line for hard-linked files and narrow AC-02 to match.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (What the route denies: "That is what lets an implementation reviewer run tests"; Codex route), AC-01, AC-02, AC-03, AC-06, Test Plan rows AC-01 to AC-03 and AC-06
EVIDENCE: Seatbelt profiles with rules do not nest. `sandbox-exec -p '(version 1)(allow default)' sandbox-exec -p '<deny profile>' ...` and a deny profile inside a deny profile both exited 71 with `sandbox_apply: Operation not permitted`. An implementation reviewer runs inside the route's profile, so on this Mac `bun test tests/vh-adlc/loop/review-route.test.ts` in the clone finds neither boundary. The 39 tests that fail today (I reproduced 5 pass, 39 fail) still fail there, and the new darwin-only seatbelt tests fail with them. The Codex implementation review that AC-06 runs on this feature, and any later macOS Codex implementation review of a feature covering review-route.ts, therefore cannot observe AC-01 to AC-03 and can only return `not verified` or `not met` for them. AC-06 needs only `ready`, so it can still go green, but the feature cannot reach a clean implementation review through the route it adds. The document never says so.
PROPOSAL: State the limit in Scope and Design. Name how this feature's implementation review establishes AC-01 to AC-03, for example a host-route implementation review or the reviewer reading a recorded run, and how later macOS Codex reviews treat tests that need sandbox-exec.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (trade-off paragraph), Design (Codex route: "On Linux the PID namespace and the before-and-after check guard the worktree and the clone in the same way"), Scope (Out of scope: "Protecting anything beyond the worktree and the clone"), AC-02, Open Questions
EVIDENCE: `codex exec --help` (0.172.0) says `-s` selects "the sandbox policy to use when executing model-generated shell commands". Under `danger-full-access` those commands also get network access, which Codex's read-only policy denies. The Owner summary mentions only writes "in the home directory or in other repositories". It omits three things. First, network access next to readable credentials. Second, write access to `~/.codex/sessions`, the log the attestation trusts (review-route.ts:278-296). Third, deferred-execution routes that change the worktree after judgement without being a descendant: `~/Library/LaunchAgents`, crontab, shell rc files, `~/.gitconfig` (`core.hooksPath`), and the plugin and vh-adlc binary caches. The AC-02 proof covers only descendants, so readers can disagree whether such routes count as "a reviewer process". "Any host reviewer can do the same today" has no citation. The Linux sentence is also inaccurate: on Linux nothing denies writes, and the check only catches net changes, so a write the reviewer reverts before exit goes unseen. The committed argv turns Codex's own sandbox off on Linux too. The design never weighs the obvious alternative: an outer profile that denies `file-write*` by default and allows only the temporary directory, `~/.codex` and named build caches. That would close the persistence routes and the F-01 rename route together. Security posture is a plausible-choice item under conventions/feature-documents.md (Open questions).
PROPOSAL: Put network access, session-log writability and the persistence routes in the Owner summary and the Scope limit, and fix the Linux sentence. Weigh a deny-by-default write profile in Design with a reason for keeping or rejecting it. If both options still meet the goal, raise the choice as an Open Question.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-02, AC-02
EVIDENCE: Test (1) asserts that a late write into the clone is absent "after two seconds". But `runReviewRoute` deletes `work` (the clone's parent) in its `finally` block (review-route.ts:357-360) before it returns. So that half of the test passes whether or not the clone is denied. The existing "the owning worktree is preserved" stubs do write into the clone, since they run with cwd = clone (review-route.ts:331). Under the Test Plan, though, on macOS they assert only that the owning worktree is unchanged. No listed proof shows that a write into the clone, or into the export, is refused during the review. A `writeDeny` without the clone passes every row, although AC-02 promises the clone cannot be changed "during or after the review".
PROPOSAL: Add a darwin-only test whose stub tries to write into the clone, and into the export for a spec review, while the review runs, and records the result in a file in the temporary directory. Assert that the write was refused and the review is ready.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design (What the route denies; Profile)
EVIDENCE: The design takes the common Git directory from `git rev-parse --git-common-dir` and then calls `realpathSync`. In a main worktree that command prints `.git` relative to the repository, and `realpathSync` would resolve it against the Bun process's cwd. In a linked worktree it printed an absolute path (`/Users/michielvh/code/vh-adlc/.git`). No harm results today, because in a main worktree the Git directory sits under `repo` and is also covered by `--absolute-git-dir`.
PROPOSAL: Specify `git rev-parse --path-format=absolute --git-common-dir`.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-05
EVIDENCE: The row expects the command to "print `route: command`, model `gpt-6.1-sol` and `model_attestation: codex-session`". `bun plugins/vh-adlc/scripts/loop/cli.ts route --repo . --operation "spec review"` prints JSON: `{"role":"spec_reviewer","route":"host"}` today (cli.ts:103).
PROPOSAL: Write the expected output as the JSON fields `"route":"command"`, `"model":"gpt-6.1-sol"` and `"model_attestation":"codex-session"`.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-04, Design (Availability probe)
EVIDENCE: `pidNamespaceAvailable()` caches its result in the module-level `namespaceProbe` (owned-process.ts:20-27). `tests/vh-adlc/loop/owned-process.test.ts:27` already calls it when the file loads. On Linux CI, where `unshare` works, the cached `true` means setting `PATH` in the test changes nothing, and the AC-04 test gets `pid-namespace`. The row does not say how the test avoids the cache.
PROPOSAL: Run the AC-04 case in a subprocess with the reduced `PATH`, or name a probe-reset seam in Design.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: frontmatter covers, Context (Background), Design (Boundary selection; What the route denies)
EVIDENCE: Scope includes "A plugin minor version bump", but `covers` does not list `plugins/vh-adlc/.claude-plugin/plugin.json` (version 0.33.0) or the evidence directory `tests/vh-adlc/evidence/macos-review-boundary/` named in the AC-06 row. Several citations are off by a line or more. The "could not start" catch is at review-route.ts:333, not 332. The `ps` call is at owned-process.ts:45, not 46. `runOwnedClient` starts at owned-process.ts:91, not 92. `snapshot` spans review-route.ts:157-203, not 157-190.
PROPOSAL: Add both paths to `covers` and correct the line citations.

## Sources

- `codex exec --help` (codex-cli 0.172.0): MCP servers run outside the sandbox;
  `--dangerously-bypass-approvals-and-sandbox` is "intended solely for running in environments that are
  externally sandboxed"; `-s, --sandbox <SANDBOX_MODE>` selects the policy for model-generated shell commands.
- Measurement scripts and runs on this Mac, 2026-11-27: `runOwnedClient` with a `setsid` writer, `codex
  sandbox` with a detached writer and `launchctl submit`, `sandbox-exec` with the same, and nested
  `sandbox-exec`, as reported in Background.
