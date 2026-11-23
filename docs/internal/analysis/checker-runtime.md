---
issue: https://github.com/michielvha/vh-adlc/issues/157
---

# Analysis: why the vh-adlc plugin checker is slow

Measured on 2026-11-23 against `0c9fee77` (origin/main) and the `test/faster-checker` branch. The
conclusions come from primary sources read in this run: the CI logs of run
[45044570637](https://github.com/michielvha/vh-adlc/actions/runs/45044570637), the test and plugin
source at that commit, and timings taken on fedora-43 (8 CPUs, shared with other sessions, load
between 3 and 39 during the measurements).

## Summary

The suite has 276 test files and 4,289 tests. On CI the `Check the vh-adlc package` step took
117 minutes, and a local serial run on fedora-43 had not finished after 4 hours 10 minutes. Three
causes account for this:

1. Bun runs the files one after another in one process. Nothing in the repository asks for
   parallel files.
2. Locally, Bun's default 5-second test timeout applies. CI passes `--timeout 60000`, but the
   documented command `bun test tests/vh-adlc` does not, so tests that take longer than 5 seconds
   on a busy machine fail locally even though nothing is wrong.
3. The docs-drift tests run the real native paths, and each of those paths spawns thousands of
   processes. docs-drift is 121 of the 276 files and 6,584 of the 7,010 seconds of the CI run
   (94%). Ten files take 4,063 seconds; 133 files take under a second each.

The network and Go checks are not where the time goes. `fixtures.test.ts`, which fetches the
pinned shared docs from GitHub, took 2.4 seconds on CI, and `clean-bwrap.test.ts`, which runs
`go test`, took 18 seconds.

## What the suite checks

| Area | Files | What it proves |
|------|------:|----------------|
| `docs-drift/` | 121 | The docs-drift engine in `plugins/vh-adlc/scripts/docs-drift/`: protocol, manifests, snapshots, the journal, scanning, preflight, publication, closure, recovery and reconciliation, the native controller and transport, role launch and capture, history, archives, bootstrap and the run CLI. Most tests build real Git repositories and drive the native paths through fake `git` and `gh` programs that enforce GitHub's refusal rules. |
| `audit/` | 26 | The audit settings, ledger, inventory, snapshot, batch and authority checks, journal and recovery, report, rebuild and CLI entry, and grading of recorded trials. |
| `maintenance/` | 27 | Dependency maintenance collection against a fake GitHub API, settings, journal, publication, report, security collection, migration and analysis, and grading of recorded agent trials. |
| `triage/` | 23 | Triage settings, collection, report, search, execution and journal (including crash points in a subprocess), verification, owned processes, controller artifacts, acceptance and migration. |
| `loop/` | 13 | Loop claim, CLI, delivery, investigate, lenses, review routes, rungs, settings, plugin version and glossary checks, and owned-process cleanup. |
| `ownership/` | 7 | Writer reservation, claim, handoff and policy through bare remotes and two clones. |
| `docs-impact/`, `docs-truth/` | 10 | Documentation impact matching, collection and CLI; docs-truth discovery, routing and its example. |
| `labels/`, `projects/`, `security-settings/`, `branches/`, `diagram/`, `lifecycle/` | 19 | Each helper's CLI against a fake `gh`, its typecheck, stale-branch detection and removal, the diagram catalog and grader, and the issue-label contract. |
| Top level | 30 | Static package and text contracts on skills, references and the marketplace (11), lifecycle outcome grading of synthetic transcripts against Git fixtures (13), and infrastructure: the installer, the scenario fixture builder, Git reads, the settings loader, the binary on synthetic specs, and `clean-bwrap` (6). |

No test file runs an agent. The scenario and trial runners (`lifecycle/run.ts`, `blog/run.ts`,
`scenarios/run.ts`, `diagram/run.ts` and the `*-trial.ts` runners) are started by hand; tests import
only their grading functions.

## Where the time goes

### Per-file and per-test times on CI

Parsed from the CI log of run 45044570637 (commit `d3ad7ce2`, 2026-11-22, `ubuntu-latest`). The
slowest files:

| File | Tests | Seconds |
|------|------:|--------:|
| `docs-drift/closure-controller.test.ts` | 9 | 709 |
| `docs-drift/closure-worker.test.ts` | 27 | 584 |
| `docs-drift/native-controller.test.ts` | 13 | 465 |
| `docs-drift/normal-preparation.test.ts` | 4 | 425 |
| `docs-drift/audit-report.test.ts` | 17 | 406 |
| `docs-drift/trial-publication.test.ts` | 42 | 364 |
| `docs-drift/publication-bindings.test.ts` | 65 | 324 |
| `docs-drift/native-refresh.test.ts` | 15 | 292 |
| `docs-drift/normal-resolution.test.ts` | 1 | 268 |
| `docs-drift/audit-session.test.ts` | 8 | 226 |

Single tests take 50 to 270 seconds. The slowest is `normal resolve preserves the complete original
hunk and recovers a lost close response` (268 seconds). Outside docs-drift, the slowest areas are
audit (173 seconds), maintenance (62), the top-level files (59) and triage (44).

### Process spawns

Each slow test spends its time starting processes. Measured with a logging `git` on `PATH` and with
`strace -f -e trace=execve`:

- `docs-drift/delivery-ack.test.ts` ran 227 tests in 352 seconds alone and started 63,323 `git`
  processes. In its slowest test, 2,580 of 2,906 Git calls were `worktree list --porcelain`,
  `rev-parse --git-common-dir` and `rev-parse --git-path`. They come from
  `externalArtifactDirectory()` in `plugins/vh-adlc/scripts/docs-drift/snapshot.ts`, which re-reads
  the caller's worktree list on each call. 37 call sites in the docs-drift scripts call it, once per
  journal read or write.
- `docs-drift/normal-resolution.test.ts` (one test) started at least 33,175 processes before the
  traced run was stopped: 12,790 `git`, 11,692 runs of the fixture's `native-bin/git`, 820 runs of
  the `vh-adlc` binary, 778 `bun` processes, 771 `flock` and about 410 runs of
  `ensure-vh-adlc.sh` with its `uname`, `sha256sum`, `cut`, `awk`, `sed` and `dirname` children.
- The fixture `native-bin/git` was a Bun script, so every Git call on the native path started a
  JavaScript runtime. 100 calls took 0.85 seconds with plain Git, 1.28 seconds through a shell
  stub, 5.57 seconds through the Bun stub and 8.91 seconds through the Bun stub with
  `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` (load about 15).
- Every settings read runs the installer and then the binary: `createYAMLReader()` in
  `plugins/vh-adlc/scripts/settings-file.ts` spawns `ensure-vh-adlc.sh`, which hashes the binary,
  before each `vh-adlc settings read`. One installer run took about 370 milliseconds at load 15.
- `docs-drift/closure-entry.test.ts` made 12,372 Git calls directly from the plugin code, with no
  fixture wrapper in between.

### Real waits

Most sleeps are short and deliberate: they wait to show that a late write never arrives
(`loop/review-route.test.ts`, 14.6 seconds on CI) or that a timeout fires. The longest is in
`ensure.test.ts` (27 seconds on CI): one test waits out curl's `--max-time 25` during a stalled
download. These waits check timeout behavior, so they stay.

### Bun configuration

Bun 1.4.3 ignores `timeout` and `parallel` under `[test]` in `bunfig.toml`. A preload that calls
`setDefaultTimeout()` applies only to the first file of a serial run; later files get 5 seconds
again. `pathIgnorePatterns` works, but it also drops files named explicitly on the command line, so
it cannot hold an opt-in suite. The timeout and parallelism therefore belong on the command line.

## Harm and the simplest alternative

Harm: a full run costs about two hours of CI per push and longer locally, so changes ship with
partial local evidence. Locally, the 5-second default turns slow tests into failures that look
real. The session that reported this saw 18 tests in `delivery-ack.test.ts` fail that way on main,
run alone; in this run, three of its tests took longer than 5 seconds at load 4. People and agents
spend time diagnosing failures that are not defects.

Simplest alternative: run the existing suite with Bun's own `--parallel` and the CI timeout, and
document that command. No new machinery: no separate suites and no configuration file.

Recommendation: take the alternative, plus one test-side change where a fixture alone wastes the
time: write the fixture `git` and `gh` wrappers as shell scripts instead of Bun scripts. Both are
on the branch. The plugin-side costs (the per-call worktree re-read and the per-read installer run)
are product behavior with security intent and need their own decision; they are tracked below, not
changed here.

## Changes on `test/faster-checker`

- The documented and CI command is `bun test tests/vh-adlc --parallel --timeout 60000`. The macOS
  job runs its portable subset with `--parallel` too. CONTRIBUTING.md explains both flags and
  advises a smaller worker count on a machine that other work already loads.
- The triage fixture cap (`VH_ADLC_TRIAGE_TEST_TIMEOUT_MS` in `triage/boundary-test.ts` and
  `triage/journal-crash.test.ts`) defaults to 60 seconds, the value CI already set. The CI override
  is removed, so local runs and CI use one limit.
- `tests/vh-adlc/docs-drift/git-stub.ts` builds the fixture wrappers as POSIX shell scripts.
  `binding-fixture.ts`, `closure-native-fixture.ts` and `installOwnedNativeService()` in
  `original-publication-fixture.ts` use it. The two tests that patched the old Bun wrapper's source
  (`normal-report.test.ts` and the `changed-after-fetch` fault in `audit-proposal-inputs-fixture.ts`)
  now ask the helper for the same behavior: a caller record, and a command to run after Git returns.
- The rewritten wrappers keep every rule the Bun versions enforced: pushes and foreign HTTPS fetches
  exit 91, read-only Git refuses HTTPS, writes go through the state lock and the fake service, and
  the call logs hold the same JSON. A differential check ran the old and new wrappers on 33
  argument vectors in 114 comparisons, including quotes, backslashes, control characters,
  non-ASCII text and empty or missing arguments. It found no difference in exit code, arguments
  passed on, environment, log contents or log file mode, under bash with gawk and under dash with
  mawk.

No assertion was removed or weakened, and no test moved out of the default suite.

### Opt-in suite: not created

The checks that need the network or Go are cheap: `fixtures.test.ts` 2.4 seconds, `clean-bwrap`
18 seconds, `maintenance/bot-only-trial` 8.7 seconds and the four typecheck tests under a second each
on CI. Moving them out would save little time, and CI would then need a second job to keep them.
They stay in the default suite, and the documented command names its prerequisites: `go` on `PATH`
and network access to GitHub.

## Measurements

Load figures are the one-minute load average on the 8-CPU host. Other sessions shared the host
throughout, so local numbers vary with load; CI on `ubuntu-latest` is the comparable environment.

### Before

- CI run 45044570637 (`d3ad7ce2`): the test step took 117 minutes; per-file times sum to
  7,010 seconds. No failures.
- Local, `bun test tests/vh-adlc --parallel=1 --timeout=900000` at `0c9fee77` (one worker, a
  generous timeout so nothing fails on time): stopped unfinished after 4 hours 10 minutes, when the
  host was handed to another session. Load rose from 3.4 to 39 during the run.

### Single files, main against the branch

Each pair ran back to back, main first, so both sides saw similar load.

| File | Main (s) | Branch (s) | Load at start | Result |
|------|---------:|-----------:|---------------|--------|
| `docs-drift/normal-resolution.test.ts` | 1,042.1 | 303.5 | 26 / 19 | 1 pass each |
| `docs-drift/normal-report.test.ts` | 328.5 | 143.6 | 8 / 7 | 10 pass each |
| `docs-drift/audit-proposal-inputs.test.ts` | 63.4 | 58.0 | 6 / 7 | 9 pass each |
| `docs-drift/closure-entry.test.ts` | 56.9 | 57.4 | 12 / 7 | 18 pass each |
| `docs-drift/native-service.test.ts` | 0.2 | 0.2 | 12 / 12 | 1 pass each |

The wrapper change pays off where the owned native service carries the Git traffic
(normal-resolution 3.4x, normal-report 2.3x). Files whose Git calls come from the plugin code
itself, such as closure-entry with 12,372 calls, do not change.

`publication-bindings.test.ts` took 615.3 seconds on main and 1,077.3 seconds on the branch, but
most of the branch run overlapped load near 28, and one case hit its own 125-second limit there.
Its eleven `candidate review target retains the original author` cases then ran back to back at
load 17: 238.4 seconds on main and 234.0 on the branch, all passing on both.

### Whole suite on the branch

- `bun test tests/vh-adlc --parallel --timeout 60000` (eight workers) at `dc85b7aa`: 58.9 minutes,
  load 13 to 23, with the serial baseline still running beside it. 4,285 pass and 4 fail out of
  4,289 tests in 276 files. Per-file times summed to 22,002 seconds, about three times their CI
  values, because eight workers oversubscribed a host that was already loaded.
- The four failures, each diagnosed:
  - `docs-drift/evidence-input.test.ts`, `bound evidence preserves literal nested artifact paths
    and bytes`: an environment failure. Bun 1.4.3's `realpathSync` returns ENOENT for an existing
    file named `literal\name` + newline + `Σ`, while `lstat` finds it. It fails the same way on
    main, alone, and passes on CI with the declared Bun 1.4.5.
  - `triage/managed-recovery.test.ts`: hit the triage cap of 15 seconds, which CI raised to 60
    through the environment. The cap now defaults to 60 seconds; the file passes alone in 8.6
    seconds and `journal-crash.test.ts` in 55.7.
  - `docs-drift/closure-worker.test.ts`, `original binary closure binds a current asset`: hit its
    own 180-second limit. Alone at load 20 it passes in 85 seconds.
  - `docs-drift/preflight.test.ts`, `an earlier reader accepts original proof`: hit its own
    30-second limit. Alone at load 20 it passes in 1.9 seconds. The test copies the plugin and
    imports its modules from the copy, so it is file-system heavy as well as CPU heavy.
- A four-worker run was stopped when the host was handed to another session, before it finished.

### After on CI

Pending: the CI run of the pushed branch.

## Follow-ups

- Track: `externalArtifactDirectory()` re-reads the worktree list and two Git paths on each of its
  calls. Caching the scope for one operation would remove most Git calls from the docs-drift tests
  and from real runs. It changes when a newly added worktree is noticed, so it needs a decision on
  the docs-drift security model.
- Track: settings readers run `ensure-vh-adlc.sh` once per read. Resolving the verified binary once
  per process would remove a bash run, a hash of the binary and several helper processes from every
  read. It changes how soon a replaced binary is noticed.
- Track: `closure-controller.test.ts` (709 seconds on CI) sets the lower bound of a parallel run,
  because Bun parallelizes files, not tests. Splitting its nine tests across files would lower it.
- Track: `review-convergence.test.ts` and `owner-summary.test.ts` run the installer with
  `--offline` when they load, so on a machine with an empty binary cache they pass only if another
  file has downloaded the binary first.
- Track: this host runs Bun 1.4.3 while the repository declares 1.4.5, which is why
  `evidence-input.test.ts` fails here.
