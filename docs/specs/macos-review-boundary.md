---
status: draft
status_description: "Being written; spec review on the host route pending."
issue: https://github.com/michielvha/vh-adlc/issues/187
goal: "Spec and implementation reviews in this repository run on Codex from a Mac, with no owner step per review, and no reviewer process can change the owning worktree or the private clone once the review has been judged."
covers:
  - plugins/vh-adlc/scripts/loop/review-route.ts
  - plugins/vh-adlc/scripts/triage/owned-process.ts
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/references/review-protocol.md
  - .vh-adlc/loop.yaml
  - tests/vh-adlc/loop/review-route.test.ts
  - tests/vh-adlc/loop/owned-process.test.ts
---

# Plan: Codex reviews on macOS

The command route that runs an external reviewer gets a macOS boundary: a Seatbelt profile that denies
every reviewer process writes to the owning worktree and the private clone. The repository then commits a
`.vh-adlc/loop.yaml` that sends both reviewer roles to Codex.

## Context

### Owner summary

Claude writes the specs and the code in this repository, and the owner wants Codex to review them. Two
things stop that today. The repository has no `.vh-adlc/loop.yaml`, so both reviewer roles fall back to
the host, which on Claude Code means Claude. And the Codex command route can't run on a Mac: it insists on
a Linux PID namespace, and the homelab Linux hosts are unreachable.

The PID namespace exists to enforce one guarantee: no reviewer process may outlive the review and change
the owning worktree or the private clone after the before-and-after check has judged it. This feature
keeps that guarantee on macOS by denying the writes rather than killing the processes. The route wraps
the reviewer command in `sandbox-exec` with a profile that refuses writes to exactly the paths the check
judges. The kernel applies the profile to every descendant, including one that detaches and clears its
environment. Measured on this Mac, such a writer was refused, and so was an attempt to hand the write to
launchd. Linux keeps its PID namespace unchanged.

The trade-off: Seatbelt profiles can't nest, so Codex has to run with its own sandbox off
(`-s danger-full-access`) inside the route's profile. Codex tool commands can then write outside the
worktree and the clone, for example in the home directory or in other repositories. Any host reviewer can
do the same today. The worktree and the clone stay protected. The alternative, keeping Codex's own
read-only sandbox, was measured as well and rejected. Codex starts its MCP servers outside that sandbox,
and this Mac's user config starts a Node REPL server. It would also stop an implementation reviewer from
running tests.

The feature also fixes `pidNamespaceAvailable()`, which throws on macOS instead of returning false, and it
commits the Codex routes for both reviewer roles with session-log model attestation. Out of scope: the
macOS marker scan that never finds survivors (#186) and any change to triage behaviour.

Planned proof: unit fixtures with a detached, environment-clearing writer, each watched failing on this
Mac first, plus one real Codex spec review and one real implementation review through `cli.ts review` on
this Mac. Linux CI after merge shows the namespace path still works. None of this has been run against
the change yet. This spec's own review runs on the host route (Claude), because the Codex route can't run
here until the change exists.

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
- `pidNamespaceAvailable()` runs `unshare` without catching a spawn failure
  (`plugins/vh-adlc/scripts/triage/owned-process.ts:22-28`). macOS has no `unshare`, so Bun throws
  `Executable not found in $PATH: "unshare"`. The route catches that error as "the reviewer command could
  not start" (`review-route.ts:332`). On this Mac, `bun test tests/vh-adlc/loop/review-route.test.ts`
  fails 39 tests with that reason and passes 5.
- The marker scan is blind on macOS. `markedProcesses` reads `ps -axeww -o pid=,command=`
  (`owned-process.ts:46`), and on this Mac that output shows no process environments, not even for a
  same-user child started with the marker set. A `runOwnedClient` run whose child forked a `setsid` writer
  reported `confirmed: true, survivors: []`, and the writer still wrote two seconds later. This happened
  with the marker kept and with the environment cleared. That bug is #186 and stays out of this feature.

Candidate boundaries. Each one was run against a writer that calls `setsid`, clears its environment with
`env -i`, and writes into the protected directory two seconds after the reviewer exits:

| Candidate | Result |
| --- | --- |
| Process-group cleanup plus marker scan | Fails: the late write lands and cleanup reports confirmed. |
| `codex sandbox -c 'sandbox_mode="read-only"'` (Codex's Seatbelt) | Holds for commands Codex runs: the direct write, the detached writer and `launchctl submit` are all refused. But `codex exec --help` says MCP servers run outside the sandbox, `~/.codex/config.toml` declares `[mcp_servers.node_repl]`, and the Codex process itself runs unconfined. |
| `sandbox-exec -p '(version 1)(allow default)(deny file-write* (subpath D))'` around the whole command | Holds: the direct write, the detached writer and `launchctl submit` are refused, while writes outside `D` succeed. The same `launchctl submit` run outside any sandbox succeeds and writes. |
| Codex's Seatbelt inside the outer profile | Fails to start: `sandbox-exec: sandbox_apply: Operation not permitted`, exit 71. |

## Scope

In scope:

- A macOS write boundary for the command route: every reviewer process runs under a Seatbelt profile that
  denies writes to the paths the before-and-after check judges, minus `review_scratch`.
- The route accepts that boundary in place of the PID namespace. Linux behaviour is unchanged.
- `pidNamespaceAvailable()` returns false when `unshare` can't be started, instead of throwing.
- `.vh-adlc/loop.yaml` in this repository routes `spec_reviewer` and `implementation_reviewer` to Codex.
- The command-route paragraph of `references/loop-settings.md` and the command-route item in
  `references/review-protocol.md` (Routes) describe the macOS boundary and the Codex flag it needs.
- A plugin minor version bump.

Out of scope:

- The macOS marker scan (#186). Triage keeps its current behaviour.
- Protecting anything beyond the worktree and the clone. Under the Codex route, reviewer tool commands can
  write elsewhere on disk, as a host reviewer can today.
- `parseReply` and the Routes changes in #142 (PR #182), and the Instruction freshness section of
  `loop-settings.md` (#139).
- Other hosts without a boundary, such as Windows. They keep the pending outcome.

Not handled: a macOS reviewer process that outlives the review keeps running until it exits on its own.
It can't change the protected paths, but it can still write elsewhere, including Codex's session
directory. The PID namespace kills such processes on Linux. Killing them on macOS needs a working
survivor scan, which is #186.

## Design

**Boundary selection.** `runOwnedClient` (`owned-process.ts:92`) gains an optional `writeDeny` option:
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
boundary. `pidNamespaceAvailable()` wraps its spawn in `try` and returns false on any spawn error.

**Profile.** The profile is a fixed string with no interpolated paths:
`(version 1)(allow default)`, then `(deny file-write* (subpath (param "D0")) ...)` for each denied path,
then `(allow file-write* (subpath (param "A0")) ...)` for each allowed path. Paths are passed with
`-D D0=<path>` and are never embedded, so quotes or parentheses in a path can't change the profile. A
later Seatbelt rule overrides an earlier one, so the allows carve the scratch directories out of the
denies. Every path goes through `realpathSync` first, because Seatbelt matches resolved paths (`/tmp`
resolves to `/private/tmp`). A path that doesn't exist yet is resolved through its parent.

**What the route denies.** `runReviewRoute` passes `writeDeny` with:

- deny: the owning worktree (`repo`), its Git directory and its common Git directory
  (`git rev-parse --absolute-git-dir` and `--git-common-dir`), the private clone for an implementation
  review, and the export for a spec review;
- allow: each `review_scratch` entry under the owning worktree and under the clone, resolved as above.

These are the paths the `owning` and `full` snapshots judge (`review-route.ts:157-190`): the worktree's
files, ignored files, index, HEAD and branch ref, and the clone. The common Git directory also holds every
branch and tag, so a reviewer can't move a ref through it either. Writes everywhere else stay allowed: the
temporary directory, Codex's `~/.codex`, and build caches. That is what lets an implementation reviewer
run tests.

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
    model: gpt-6.1-sol
    model_attestation: codex-session
    argv: [sh, -c, 'f=$1; shift; exec "$@" - < "$f"', sh, "{prompt_file}", codex, exec, -m, "{model}", -s, danger-full-access, --skip-git-repo-check, --json]
  implementation_reviewer:
    # the same route
```

The model is the one this Mac's Codex config defaults to (`model = "gpt-6.1-sol"` in
`~/.codex/config.toml`). `{prompt_file}` follows the `loop-settings.md:37` recommendation.
`--skip-git-repo-check` is there because a spec review runs from the export, which has no `.git`.
`-s danger-full-access` is required on macOS because Codex's own Seatbelt can't start inside the route's
profile (measured above). On Linux the PID namespace and the before-and-after check guard the worktree and
the clone in the same way. The user config stays loaded: the attestation reads the session log Codex
writes under `$HOME/.codex`, and `-m` pins the model. The file declares no `review_scratch`. If the real
implementation review in the Test Plan needs a scratch directory, that becomes a finding for this
document.

**Concurrency, failure and rollback.** Each review builds its own profile from its own paths, with no
shared state, so concurrent reviews don't interact. If `sandbox-exec` fails to apply, the reviewer never
starts, and the outcome is pending with the command-start reason. A review interrupted mid-run leaves no
state behind beyond what it leaves today: the profile dies with the processes. Rolling back means deleting
`.vh-adlc/loop.yaml`, which returns both roles to the host. A plugin older than this change, reading the
committed file on a Mac, keeps today's pending outcome, which is safe.

**Documentation.** The `loop-settings.md` paragraph at lines 136-138 becomes: a command route runs its CLI
in a PID namespace on Linux, or under a `sandbox-exec` profile on macOS that denies every process it starts
writes to the owning worktree, its Git directories and the private clone outside `review_scratch`. A
Codex route on macOS passes `-s danger-full-access`, because Codex's own sandbox can't start inside that
profile. Without either boundary the review stays pending. `review-protocol.md` gets one sentence in the
command-route item saying the same boundary applies. The Instruction freshness section and `parseReply`
are left alone.

## Acceptance Criteria

- [ ] AC-01: On macOS, a command-route review whose reply passes every existing check comes back `ready`.
- [ ] AC-02: On macOS, no reviewer process can change the owning worktree (files, ignored files, index,
      HEAD, refs) or the private clone outside `review_scratch`, during or after the review. This includes a
      descendant that detaches into its own session, clears its environment and writes after the reviewer
      has exited. Writes inside `review_scratch` and in the temporary directory still succeed.
- [ ] AC-03: On a host where neither boundary can be applied, including a macOS process already inside a
      Seatbelt sandbox, a command-route review stays pending with a reason that names the missing boundary.
- [ ] AC-04: On a host without `unshare`, `runOwnedClient` with `pidNamespace: true` and no `writeDeny`
      runs the client with the `marker` boundary instead of throwing.
- [ ] AC-05: In this repository, `bun scripts/loop/cli.ts route` returns a `command` route with model
      `gpt-6.1-sol` and `model_attestation: codex-session` for both `spec review` and `review`.
- [ ] AC-06: On this Mac, a real Codex spec review and a real Codex implementation review through
      `cli.ts review` come back `ready` with the served model attested from the session log. The owning
      worktree is unchanged afterwards, and both stored record sets pass `vh-adlc review check`.
- [ ] AC-07: `references/loop-settings.md` and `references/review-protocol.md` state the macOS boundary, the
      `-s danger-full-access` requirement for Codex under it, and what stays writable.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/review-route.test.ts`, run on this Mac: the existing "replies", "file-only spec reviews" and "model attestation" tests pass. Watched failing first at `e910dfe8`, where they fail with `could not start: Executable not found in $PATH: "unshare"`. |
| AC-02 | New darwin-only tests in `review-route.test.ts`. (1) An implementation reviewer stub forks a writer with `perl -e 'POSIX::setsid(); exec env -i ...'` that writes `src/late.txt` in the owning worktree and a file in the clone one second after the stub exits. The review is ready, and after two seconds neither file exists. (2) The same stub writes into a declared scratch directory and the temporary directory, and both writes land. (3) A stub that runs `git branch x` and `git tag -f`, and one that writes `.git/index`, leaves refs and index unchanged. Each test is watched failing with the route's `writeDeny` removed. The existing "the owning worktree is preserved" tests stay. On macOS each one asserts the worktree is unchanged afterwards, whether the outcome is pending or ready. On Linux they keep their pending expectation. |
| AC-03 | `review-route.test.ts`: the existing `boundary: "unavailable"` test stays pending with the new reason. New darwin-only test: running the route from inside `sandbox-exec -p '(version 1)(allow default)'` (a nested process) leaves the review pending, with a reason naming the boundary. |
| AC-04 | `tests/vh-adlc/loop/owned-process.test.ts`: with `PATH` set so that no `unshare` is found, `runOwnedClient(..., { pidNamespace: true })` resolves with `boundary: "marker"`. Watched failing first: today it throws `Executable not found`. |
| AC-05 | Command: `bun plugins/vh-adlc/scripts/loop/cli.ts route --repo . --operation "spec review"` and `--operation review` print `route: command`, model `gpt-6.1-sol` and `model_attestation: codex-session`. Before the change both print `host`. |
| AC-06 | Manual procedure, recorded under `tests/vh-adlc/evidence/macos-review-boundary/`: on this Mac, run `cli.ts review --kind spec` on this document and `--kind implementation` on the feature commit with the committed `loop.yaml`. Record each JSON outcome (`ready`, attested model), `git status --porcelain` before and after (identical), and `vh-adlc review check` on the stored records (passes). |
| AC-07 | Read the changed paragraphs at the implementation commit and confirm each of the three statements. `tests/vh-adlc/direct-operation-compatibility.test.ts` still passes. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-27 | R-1 | spec | `7248ba28` | claude-opus-5-5 | procedural | 1 blocking, 4 should-fix, 4 nits; host route, because the Codex command route cannot run on macOS until this feature exists |

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
