---
status: planned
status_description: "Accepted again at R-5 with gpt-6.2-sol; re-entering implementation on feat/macos-review-boundary."
issue: https://github.com/michielvha/vh-adlc/issues/187
branch: feat/macos-review-boundary
goal: "Spec and implementation reviews in this repository run on Codex from a Mac, with no owner step per review, and no reviewer process can change the owning worktree or the private clone once the review has been judged."
covers:
  - plugins/vh-adlc/scripts/loop/review-route.ts
  - plugins/vh-adlc/scripts/triage/owned-process.ts
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - plugins/vh-adlc/plugin.json
  - .vh-adlc/loop.yaml
  - tests/vh-adlc/loop/review-route.test.ts
  - tests/vh-adlc/loop/owned-process.test.ts
  - tests/vh-adlc/evidence/macos-review-boundary/
---

# Plan: Codex reviews on macOS

The command route that runs an external reviewer gets a macOS boundary: a Seatbelt profile that denies
every reviewer process writes to the owning worktree, its Git directories, the private clone and the
directories above them. The repository then commits a `.vh-adlc/loop.yaml` that sends both reviewer roles
to Codex.

## Context

### Owner summary

Claude writes the specs and the code in this repository, and the owner wants Codex to review them. Two
things stop that today. The repository has no `.vh-adlc/loop.yaml`, so both reviewer roles fall back to
the host, which on Claude Code means Claude. And the Codex command route can't run on a Mac: it insists on
a Linux PID namespace, and the homelab Linux hosts are unreachable.

The PID namespace enforces one guarantee: no reviewer process may outlive the review and change the
owning worktree or the private clone after the before-and-after check has judged it. This feature keeps
that guarantee on macOS by refusing the writes instead of killing the processes. The route wraps the
reviewer command in `sandbox-exec` with a profile that denies writes to the paths the check judges, and to
each directory above them, so a process can't rename a parent and write through the new path. The kernel
applies the profile to every descendant, including one that detaches and clears its environment. On this
Mac such a writer was refused, and so was an attempt to hand the write to launchd. Linux keeps its PID
namespace unchanged.

The trade-offs, in plain words. Seatbelt profiles can't nest, so Codex runs with its own sandbox off
(`-s danger-full-access`) inside the route's profile. Codex tool commands can then write anywhere outside
the protected paths and reach the network. That includes the home directory, other repositories, Codex's
own session log (which the model attestation reads), and user-level schedulers such as
`~/Library/LaunchAgents`, crontab, shell startup files and `~/.gitconfig`. Something planted there could
change the worktree later, and this feature doesn't stop that, on macOS or on Linux. The host Claude
reviewer has the same access today through its Bash tool. The orchestrator chose this posture under the
owner's delegation. The alternative is a profile that denies all writes except the temporary directory,
`~/.codex` and named build caches. It would close the scheduler routes, but every toolchain an
implementation reviewer runs would need its cache paths listed. Switching to it would be a revision of
this document. Keeping Codex's own read-only sandbox was measured and rejected: Codex runs MCP servers outside
it, and it stops implementation reviewers from running tests.

The feature also fixes `pidNamespaceAvailable()`, which throws on macOS, and commits Codex routes for both
reviewer roles with session-log model attestation. On macOS a review stays pending, naming the file, when a
protected file already has a second hard link, because a write through that other name would get past the
profile. One lasting limit: a Codex reviewer inside the profile
can't run tests that start their own `sandbox-exec`. So this feature, and any later change to
`review-route.ts` or `owned-process.ts`, gets its implementation review on the host route or on Linux.

Since the R-3 acceptance, the owner chose `gpt-6.2-sol` as the Codex review model on #187, so this
revision renames it, and the second plugin manifest joins `covers`. The AC-02 proof also changed: each late-writer test now waits for the writer to finish, and the main-checkout rename case checks the linked worktree's index. Nothing else in the scope changed.

Observed so far, on this Mac: tasks T1 to T7 are built, each test watched failing first, and a committed
mutant script shows every macOS boundary test failing against the part it guards. Four route and CLI
tests still fail here for a reason outside this feature: the test page-cache stub writes where macOS
doesn't read, which #182 fixes. Two smoke runs of real Codex `gpt-6.2-sol` through the route came back
ready with the model attested, and Codex's write probe was refused inside the profile. Still planned: the
committed `loop.yaml` (T8), one real Codex spec review and one real implementation review through
`cli.ts review` (AC-06), and Linux CI after merge. This spec's reviews run on the host route, because the
Codex route isn't committed yet.

Acceptance authorizes implementing this on a feature branch and opening a PR. Merging still needs the
owner.

### Background

The harm. Every spec and implementation review in this repository runs on Claude, the model family that
wrote the work. The owner wants Codex to review instead. Without this change that happens on every
review, several a day, and it doesn't fix itself. The simplest alternatives without new machinery all
fail the goal. Running Codex reviews from Linux is out, because the homelab is unreachable. The owner
running Codex by hand for each review was rejected by the owner. Dropping the boundary on macOS was ruled
out, because the guarantee has to stay. The design below adds the smallest mechanism that keeps the
guarantee: one Seatbelt profile and one committed settings file.

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
- Under that boundary, a review whose protected files already share an inode with another path stays
  pending.
- `pidNamespaceAvailable()` returns false when `unshare` can't be started, instead of throwing.
- `.vh-adlc/loop.yaml` in this repository routes `spec_reviewer` and `implementation_reviewer` to Codex.
- The command-route paragraph of `references/loop-settings.md` and the command-route item in
  `references/review-protocol.md` (Routes) describe the macOS boundary, the Codex flag it needs and the
  test-nesting limit.
- A plugin minor version bump.

Out of scope:

- The macOS marker scan (#186). Triage keeps its current behaviour.
- `parseReply` and the Routes changes in #142 (PR #182), and the Instruction freshness section of
  `loop-settings.md` (#139).
- Other hosts without a boundary, such as Windows. They keep the pending outcome.

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

Not handled: a reviewer under the route's profile can't start another Seatbelt sandbox, so tests that need
`sandbox-exec` fail inside a macOS command-route implementation review. This feature, and any later change
to `review-route.ts` or `owned-process.ts`, gets its implementation review on the host route or on a Linux
host (R-1 F-03).

Not handled: a Git file other than the index and HEAD, such as a loose ref or an object, that already
shares an inode with a path outside the protected trees. Git doesn't create such links for refs, and an
object file isn't part of what the check judges (R-1 F-02).

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
`sandbox_apply` can't nest. In that case the route stays pending and the reason names the missing
boundary. `pidNamespaceAvailable()` wraps its spawn in `try` and returns false on any spawn error. Both
probes cache their answer per process, so tests that need a fresh answer run in a subprocess.

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
`/private/tmp`).

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

**Pre-existing hard links.** Seatbelt checks the path a write goes through. It refuses a new hard link to
a protected file, but a file that already has a second name outside the protected trees can be written
through that name. Under the Seatbelt boundary, before the reviewer starts, the route checks the link count
of every regular file the `owning` snapshot hashes, plus the index and HEAD. If any count is above 1, the
review stays pending with a reason naming the first such path. The private clone needs no check, because
the route makes it with `--no-hardlinks` (`review-route.ts:317`). Under the PID namespace no reviewer
process survives the review, so the check doesn't run there.

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

The model is the one the owner chose for Codex reviews when accepting this feature (2026-11-27, #187); `codex exec -m gpt-6.2-sol --json` on codex-cli 0.172.0 served it, and its session log recorded only that model.
`{prompt_file}` follows the `loop-settings.md:37` recommendation. `--skip-git-repo-check` is there because
a spec review runs from the export, which has no `.git`. `-s danger-full-access` is required on macOS
because Codex's own Seatbelt can't start inside the route's profile (measured above). The same argv runs
on Linux, where it turns Codex's own sandbox off too. There nothing denies writes during the review: the
PID namespace stops every reviewer process when the CLI exits, and the before-and-after check catches any
net change to the worktree or the clone, but a write the reviewer reverts before it exits goes unseen. The
user config stays loaded: the attestation reads the session log Codex writes under `$HOME/.codex`, and
`-m` pins the model. The file declares no `review_scratch`. If the real implementation review in the Test
Plan needs a scratch directory, that becomes a finding for this document.

**Concurrency, failure and rollback.** Each review builds its own profile from its own paths, with no
shared state, so concurrent reviews don't interact. Other sessions' processes run outside the profile, so
their writes to the worktree's parents are unaffected. If `sandbox-exec` fails to apply, the reviewer
never starts, and the outcome is pending with the command-start reason. A review interrupted mid-run
leaves no state behind beyond what it leaves today. Rolling back means deleting `.vh-adlc/loop.yaml`,
which returns both roles to the host. A plugin older than this change, reading the committed file on a
Mac, keeps today's pending outcome, which is safe.

**Documentation.** The `loop-settings.md` paragraph at lines 136-138 becomes three statements. A command
route runs its CLI in a PID namespace on Linux, or on macOS under a `sandbox-exec` profile that denies
every process it starts writes to the owning worktree, its Git directories, the private clone and each of
their parent directories, outside `review_scratch`; everything else stays writable. A Codex route on macOS
passes `-s danger-full-access`, because Codex's own sandbox can't start inside that profile. A reviewer
inside the profile can't run tests that start their own `sandbox-exec`, so changes to the route's boundary
code get their implementation review on the host route or on Linux. Without either boundary the review
stays pending. `review-protocol.md` gets one sentence in the command-route item saying the same boundary
applies. The Instruction freshness section and `parseReply` are left alone.

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
- [ ] AC-05: In this repository, `bun scripts/loop/cli.ts route` returns a `command` route with model
      `gpt-6.2-sol` and `model_attestation: codex-session` for both `spec review` and `review`.
- [ ] AC-06: On this Mac, a real Codex spec review and a real Codex implementation review through
      `cli.ts review` come back `ready` with the served model attested from the session log. The owning
      worktree is unchanged afterwards, and both stored record sets pass `vh-adlc review check`.
- [ ] AC-07: `references/loop-settings.md` and `references/review-protocol.md` state the macOS boundary, the
      `-s danger-full-access` requirement for Codex under it, what stays writable, and that boundary-code
      changes get their implementation review on the host route or on Linux.
- [ ] AC-08: On macOS, a command-route review whose owning worktree holds a protected file with a second
      hard link stays pending, with a reason naming that file.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/review-route.test.ts`, run on this Mac: the existing "replies", "file-only spec reviews" and "model attestation" tests pass. Watched failing first at `e910dfe8`, where they fail with `could not start: Executable not found in $PATH: "unshare"`. |
| AC-02 | New darwin-only tests in `review-route.test.ts`, each watched failing with the named part of the profile removed. They use a fixture of their own, so the Git-directory and parent denies are actually exercised and no test can move the shared temporary directory: a fresh `mkdtemp` directory `T`, a main checkout at `T/a/b/main`, and a linked worktree at `T/a/b/wt` (`git worktree add`) that is the owning worktree. Its Git directory (`T/a/b/main/.git/worktrees/wt`) and common Git directory (`T/a/b/main/.git`) lie outside it. Each late writer sleeps one second, tries its write, and then records that it finished in a file under the temporary directory. The test waits for that record, up to a 10-second deadline, before asserting, so a slow start on a loaded host can't fail a correct implementation. (1) Late writer: an implementation reviewer stub forks a writer with `perl -e 'POSIX::setsid(); exec env -i ...'` that writes `src/late.txt` in the owning worktree after the stub exits. The review is ready, and once the writer has finished the file doesn't exist (fails without `writeDeny`). (2) Rename routes: two late writers each rename a directory, write through the new path and rename it back. One renames the grandparent `T/a` and writes `src/late.txt`; the other renames the main checkout `T/a/b/main`, which holds the common Git directory, and appends to the linked worktree's index at `.git/worktrees/wt/index`. Each rename is refused, which the writer records in a file under `T`; `src/late.txt` doesn't exist and the index is unchanged afterwards (each fails without the parent denies). (3) Clone and export during the review: an implementation reviewer stub tries to write a file in its clone, and a spec reviewer stub tries the same in the export after `chmod u+w`. Each records the result in a file in the temporary directory. Both writes are refused and both reviews are ready (fails without the clone or export deny). (4) Scratch and temporary directory: the stub writes into a declared scratch directory and the temporary directory, and both writes land. (5) Refs and index: stubs run `git -C <owning worktree> branch x`, `git -C <owning worktree> tag -f t` and write the linked worktree's index at `T/a/b/main/.git/worktrees/wt/index`. Refs and index are unchanged afterwards (fails without the Git-directory and common-directory denies). The existing "the owning worktree is preserved" tests stay. On macOS each one asserts the worktree is unchanged afterwards, whether the outcome is pending or ready. On Linux they keep their pending expectation. |
| AC-03 | `review-route.test.ts`: the existing `boundary: "unavailable"` test stays pending with the new reason. New darwin-only test: a subprocess started under `sandbox-exec -p '(version 1)(allow default)'` runs the route, and the review stays pending with a reason naming the boundary. |
| AC-04 | `tests/vh-adlc/loop/owned-process.test.ts`: a subprocess with a `PATH` that holds no `unshare` imports the module fresh and calls `runOwnedClient(..., { pidNamespace: true })`. It resolves with `boundary: "marker"`. The subprocess keeps the module-level probe cache from hiding the case on Linux. Watched failing first: today the call throws `Executable not found`. |
| AC-05 | Command: `bun plugins/vh-adlc/scripts/loop/cli.ts route --repo . --operation "spec review"` and `--operation review` print JSON with `"route":"command"`, `"model":"gpt-6.2-sol"` and `"model_attestation":"codex-session"`. Before the change both print `"route":"host"`. |
| AC-06 | Manual procedure, recorded under `tests/vh-adlc/evidence/macos-review-boundary/`: on this Mac, run `cli.ts review --kind spec` on this document and `--kind implementation` on the feature commit with the committed `loop.yaml`. Record each JSON outcome (`ready`, attested model), `git status --porcelain` before and after (identical), and `vh-adlc review check` on the stored records (passes). The implementation review's own verdicts on AC-01 to AC-03 and AC-08 don't count toward this feature's completion: those tests need `sandbox-exec`, so the formal implementation review runs on the host route. |
| AC-07 | Read the changed paragraphs at the implementation commit and confirm each of the four statements. `tests/vh-adlc/direct-operation-compatibility.test.ts` still passes. |
| AC-08 | New darwin-only test in `review-route.test.ts`: the fixture hard-links a tracked file to a path in the temporary directory before the review. The review stays pending with a reason naming that file, and the reviewer stub never runs (it would create a marker file). Watched failing with the link-count check removed. |

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
- [ ] T10 `tests/vh-adlc/loop/review-route.test.ts` - every late writer records that it finished, and each late-writer test waits for that record, up to a 10-second deadline, before asserting; the boundary tests pass on this Mac and `tests/vh-adlc/evidence/macos-review-boundary/mutants.py` still shows each one failing against its part (AC-02, R-5 F-01)
- [ ] T8 `.vh-adlc/loop.yaml` - both reviewer roles routed to Codex with the accepted model and `model_attestation: codex-session`; the AC-05 `cli.ts route` commands print the expected JSON, where both printed `"route":"host"` before (AC-05)
- [ ] T9 `tests/vh-adlc/evidence/macos-review-boundary/` - one real Codex spec review and one real Codex implementation review through `cli.ts review` on this Mac, each JSON outcome, `git status --porcelain` before and after, and `vh-adlc review check` on the stored records (AC-06)

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
