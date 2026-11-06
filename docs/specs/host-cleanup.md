---
status: draft
status_description: "Draft on feat/host-cleanup, revised for the owner's decisions of 2026-11-06 (R-9 F-04 covers internal/settings/, R-9 F-03 a stated limit), with R-8 F-01 to F-03 folded and every criterion tick and evidence line reset. The factual findings of R-10 to R-13 are folded, and the owner answered Q1 to Q4 on 2026-11-06. The owner's advance acceptance was conditional on R-12, which went stale when its two factual nits were folded; R-13 then added a Design change (a pruned origin/HEAD target is default-branch-unknown, task T25). Waits on a fresh spec review and the owner's acceptance naming it. Tasks T23 to T25 follow acceptance. The branch was rebuilt on origin/main 21bc3e4 at plugin 0.11.0; its pre-rebuild tip fd23dae stays reachable locally as refs/archive/host-cleanup-pre-rebuild, which keeps the commits the Review Log cites."
issue: null
branch: feat/host-cleanup
goal: "Any agent session can remove what a repository's killed runs left behind, through one vh-adlc command that touches only the binary's built-in Go temp globs and what that repository's default branch says it owns and has abandoned. A sandboxed Codex session may be refused and sent to a terminal."
covers:
  - cmd/vh-adlc/
  - internal/clean/
  - internal/gitcmd/
  - internal/report/
  - internal/settings/
  - schema/vh-adlc.schema.json
  - plugins/vh-adlc/skills/vh-adlc-clean/
  - plugins/vh-adlc/references/clean.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - .vh-adlc/cleanup.yaml
  - tests/vh-adlc/
  - docs/reference/cli.md
  - docs/reference/compatibility.md
  - docs/get-started/installation.md
  - docs/user-guides/workflows.md
  - README.md
---

# Plan: Host cleanup

Each project declares what it owns, and `vh-adlc clean` removes what killed runs left behind. Any
agent session can run it through one allow rule.

## Context

The owner reported on 2026-11-02 that the user's `/tmp` quota filled and blocked every session. A reboot
that day emptied `/tmp`, which ends that incident, but every killed run starts the same build-up. Measured
before the reboot on host `fedora-43`:

- `/tmp`, a 16G tmpfs, held 9252M of a 12815M quota (`quota -s`) across 4152 entries. The largest were
  `TestConformance_*` (2 x 454 MB), 22 `go-build*`, seven `stackweaver-visuals-*`, and over 100 `vh-triage-*`
  from vh-adlc's own tests (`tests/vh-adlc/triage/fixtures.ts:5-6`). Those classes account for at most 43% of
  the use, and the rest is unknown. Live entries such as `claude-1000` sat beside them.
- Docker is one rootful engine shared by every project (`docker context ls`). A live test run's objects
  carried `sh.stackweaver.test-run=fedora-43/461166`. Stackweaver's dev stack is Compose project `deploy`, and
  its database has no backup (Stackweaver `CLAUDE.md:144`).

Stackweaver's `sweepEndedRuns` (`backend/internal/launcher/driver/leftovers_integration_test.go:120` on its
`origin/main` at `cbf39566`) does this for one test package only: it reads a `host/pid` mark and
forces no removal of a network, volume or image.

The auto-mode classifier refuses to sweep shared `/tmp`, because it cannot tell projects apart. A narrow
allow rule resolves before it (see Sources), and `codex execpolicy check` on codex-cli 0.163.0 returned
`allow` for a `prefix_rule` on `vh-adlc clean`.

`dispatch` requires `--plugin-pin` unless a command sets `noPin`, as `settings read` does
(`cmd/vh-adlc/main.go:66-70,108,176` on `origin/main` at `21bc3e4`), and `GOTMPDIR` covers the go command
and `t.TempDir` (`go doc`, Go 1.27). The Bash tool's `PATH` here is `/usr/local/bin:/usr/bin`.
Disabling lazy fetch needs Git 2.45 (see Sources), while the stated floor is 2.35
(`docs/get-started/installation.md:10`). In a PID namespace, `kill -0` on a live host pid returns "No such
process" (a `bwrap --unshare-pid` probe, and `codex sandbox` the same).

## Scope

In scope: `.vh-adlc/cleanup.yaml`, `vh-adlc env`, `vh-adlc clean` per repository, the `vh-adlc-clean`
operation for Claude Code and Codex, one allow rule each, vh-adlc's own manifest, and a reviewed Stackweaver
adoption branch based on Stackweaver's `main`. The release, lock bump and first real run follow the merge,
under [Order](#order).

Host firewall chains are out of scope: the owner's answer on 2026-11-02, replacing the earlier `--firewall`
option. The owner accepted the cost: firewall objects of `stackweaver-jobs-slot-*` networks and of networks
already removed last until a reboot. The rest stay with Stackweaver's own sweep, with the limits under Adoption.

Also out of scope: defending against a hostile agent; a registry, host list or `--all-projects`; any check
of the remote; a timer; hosts other than Linux; killing host processes; engine-wide pruning and the build
cache; a `docker` rule type, which has no consumer and which `schema_version` can add later; objects no rule
matches; directories outside `/tmp` and the temp root; cloud resources; and
replacing a project's own cleanup code.

## Design

The threat is accidents. Agents already act as the owner on this machine, so nothing here tries to
stop one on purpose. The owner's answer on 2026-11-02: a run nobody asked for may remove `/tmp` entries and
the project's temp root only. Compose and kind sit behind `--compose` and `--kind`, and an agent passes those
flags only when the user asks. `references/authority.md` gains a row in those words.

### Commands

`clean` and `env` need no conventions, so they set `noPin`, as `settings read` does, and `dispatch` does
not require `--plugin-pin` for them. Their reports carry `knowledge: null`. The logic lives in
`internal/clean`. Outside Linux, both report `unsupported-platform` and do nothing. `clean` also refuses with `running-as-root`, with `git-too-old` on
Git older than 2.45, and with `pid-namespace` unless `/proc/self/ns/pid` is the initial namespace, because
`kill` and `/proc` give wrong answers inside one. That also covers a PID-namespace sandbox that hides the
engine socket.

- `vh-adlc env [--repo DIR] [--sh]` creates the project's temp root, reports `TMPDIR` and `GOTMPDIR`, and
  reports `answered`. `--sh` prints shell-quoted `export` lines, the second exception to the JSON contract
  after `--version`. On failure it prints nothing to stdout and exits non-zero.
- `vh-adlc clean [--repo DIR] [--dry-run] [--older-than DURATION] [--compose] [--kind]` plans and removes.
  `--older-than` applies to `tmp` and `temp_root` ages, and can only raise them. A dry run without
  `--compose` or `--kind` also lists abandoned Compose projects and clusters, marked as needing their flag.

Those refusals report `error`. A dry run reports `answered` and an applied run `pass`; either reports
`fail` instead on `removal-failed`, `manifest-invalid`, `engine-unreachable`, `kind-unavailable`,
`temp-base-refused` or `host-settings-invalid`, so the operation never applies after a failed dry run.
The one exception is an invalid working-tree manifest on a dry run, a note under
[Where the rules come from](#where-the-rules-come-from).
`temp-base-refused` and `host-settings-invalid` also stop the run before it removes anything.
`manifest-missing`, `default-branch-unknown`, `manifest-unmerged` and `engine-absent` are notes. `env` fails
on `manifest-missing`, `manifest-invalid`, `temp-root-undeclared`, `temp-base-refused` or
`host-settings-invalid`, and creates nothing then. All but
`git-too-old` and `default-branch-unknown` are new finding codes.

### Temp root

Each project gets `<temp_base>/<project>`, mode 0700. `temp_base` is an optional setting in
`<user config dir>/vh-adlc/host.yaml`, defaulting to `/tmp/vh-adlc-<uid>`. A valid `temp_base` is absolute, is
not `$HOME`, and is neither inside a Git work tree nor a parent of the repository in use; otherwise the run
reports `host-settings-invalid`. `env` refuses a symlinked or foreign base and recreates a missing one, and
`tmp` globs skip the base silently. `env` deletes nothing, so it reads the manifest from the working tree.
`host.yaml` passes through the same strict reader and typed decode as the manifest.

### Manifest

`.vh-adlc/cleanup.yaml` is data. It passes through the strict reader in `internal/settings` that
`settings read` uses, then a typed `go.yaml.in/yaml/v4` decode with unknown keys refused. It holds no
commands.

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

Liveness has two kinds. `pid`: a label holds `<host>/<pid>`, and the object is abandoned only when the
host is this host and `kill(pid, 0)` returns `ESRCH`. `path`: a label holds a path, and the object is
abandoned when that path is gone. Compose liveness is `path`, decided per project: a project is abandoned
only when the `com.docker.compose.project.working_dir` path of every one of its containers is gone. A project with no containers left is not matched and stays, even
if an earlier removal of its volumes failed, a stated limit. Built images and slot state stay with the
project's own teardown.

An age is measured from the newest modification time in the entry, and `temp_root` is optional. A manifest
is refused with `manifest-invalid`, and its rules remove nothing, for unknown keys, a `schema_version` other
than 1, a glob with fewer than four literal characters before its first wildcard or holding a path separator,
an age under one hour, a `project` that is not one plain path segment, an unknown `liveness.kind`, a
`kind` rule without liveness, or anything the strict reader refuses, such as an anchor, an alias or a
second document. Globs match single top-level names.

The binary itself owns `go-build*` and `gopls-tempmod*`, with an age of 24 hours, so every `clean` run
clears them under the same limits, including in a repository with no manifest.

### Where the rules come from

`clean` finds the default branch with `git symbolic-ref refs/remotes/origin/HEAD`, finds
`.vh-adlc/cleanup.yaml` on `origin/<default>` with `git ls-tree`, then reads that object with
`git cat-file blob`, each with `GIT_NO_LAZY_FETCH=1`. With no such ref, or one that names a remote-tracking
branch that no longer exists, as after a renamed default branch and a pruning fetch, it reports
`default-branch-unknown`; with no manifest there it reports `manifest-missing`. Both are notes and skip
project rules.

A dry run also plans a working-tree copy that differs, marked `manifest-unmerged`. A differing copy that
is invalid is reported as a `manifest-unmerged` note naming the refusal: it plans nothing and does not fail
the run, the owner's answer on 2026-11-06. An applied run uses only the default-branch manifest. This prevents accidental edits and is not a security boundary. "On the default
branch" means pushed; it does not mean reviewed.

### What clean will and will not touch

- It acts only on top-level `/tmp` entries the user owns that a glob matches, and entries inside the
  project's temp root. It skips symlinks and anything containing a mount point, and removes through
  `os.Root.RemoveAll`.
- It skips what is in use: a same-uid process's `cwd`, `exe`, open file or mapping under `/proc`, a bound
  socket in `/proc/net/unix`, or a container bind mount, each holding the entry or a path inside it. Age is
  the only protection against other users' processes, same-uid processes with unreadable `/proc` entries,
  and Podman's bind mounts. A pid that exits during the scan is not a failed check.
- A container that bind-mounts `/tmp` or any directory above it marks no top-level `/tmp` entry as in use.
  One that bind-mounts the project's temp root or any directory above it, the temp base included, marks no
  temp-root entry as in use; `-v "$TMPDIR:$TMPDIR"` once `env` has set `TMPDIR` is one, and so is a `$HOME`
  mount with a base under `$HOME`. Age alone then protects what the container uses. This is a stated limit
  with no handling of its own: the owner's answers on 2026-11-06. A container mounting all of `/tmp` or `/`
  should never run on these hosts.
- With `--compose`, it stops an abandoned project's containers and removes them, then its networks, then
  its volumes when the rule says so, and keeps anything in use. It never forces a Docker removal, with one
  exception: `kind delete cluster` on nodes already stopped.
- A failed check counts as live. If the engine cannot be listed, no file entry is removed either, unless
  the socket is absent or refuses, which means no engine is running, reported as `engine-absent`. The socket
  is `DOCKER_HOST` when it is `unix://`, otherwise `/var/run/docker.sock`. Permission denied is a failed
  listing. A `tcp://` or `ssh://` `DOCKER_HOST` or another Docker context reads as no engine, a stated limit.
- It writes nothing to `/tmp`, so it works with the quota full. If a session's shell cannot run, the owner
  runs `vh-adlc clean` in a terminal. The report lists what was removed and kept, why, the space freed, and
  the count and total size of user-owned `/tmp` entries no rule matched.

### kind

A kind cluster has no owner mark, so its harness creates a per-run Docker volume
labelled with the liveness label and `io.x-k8s.kind.cluster=<name>`. A cluster with no mark is never touched,
which is how a harness keeps one for debugging. The harness removes ended marks when it starts and every mark of
the cluster on exit, so a run that reuses a killed run's cluster and keeps it leaves it unmarked. A cluster
is abandoned only when it has marks and all have ended. `clean` then stops the nodes, runs
`kind delete cluster --name <name>` and removes the marks. Without `kind` on `PATH`, only this step is
skipped, and the run reports `kind-unavailable`.

### Operation and allow rules

`skills/vh-adlc-clean/SKILL.md` runs `vh-adlc clean --dry-run`, reports the plan, and applies it when the
user asked for cleanup or the session is blocked on space. It adds `--compose` or `--kind` only when the user
asks, and never uses `rm`, `docker rm` or `pkill`. `references/clean.md` holds the procedure and fields, and
`references/lifecycle.md` gains a row. It calls `vh-adlc` from `PATH`, unverified, so `references/loop.md`
names the exception to its steps 1 and 2 and `tests/vh-adlc/check.test.ts` gains a category.

A missing binary, or an older one that answers `clean` with `usage`, reports one line pointing at the install
step. On `pid-namespace` it tells the user to run the command in a terminal, which a default `workspace-write`
Codex session may need: whether its `allow` rule leaves the sandbox is unproved.

The owner installs the binary once per lock bump, after Order step 2, on the Bash tool's `PATH`:
`sudo install -m 755 "$(bash <plugin directory>/scripts/ensure-vh-adlc.sh)" /usr/local/bin/vh-adlc`, and
`kind` the same way if wanted. Then one rule each, in user scope:

- Claude Code, `~/.claude/settings.json`: `"permissions": {"allow": ["Bash(vh-adlc clean *)"]}`.
- Codex, `~/.codex/rules/default.rules`: `prefix_rule(pattern=["vh-adlc", "clean"], decision="allow")`.

### Adoption

vh-adlc adds its manifest for `vh-triage-*` and its other test prefixes. Stackweaver, in its own repository:

- adds `.vh-adlc/cleanup.yaml`;
- takes its environment from `vh-adlc env --sh`, when that succeeds, in `make test`, `make test-integration`
  (which runs `TestConformance_*`), `make verify`, `e2e/k8s/run.sh` and `e2e/k8s/driver-conformance.sh`, and
  otherwise runs unchanged. A direct `go test` stays outside and relies on the `tmp` globs;
- creates and removes the kind marks in `e2e/k8s/run.sh` and `e2e/k8s/driver-conformance.sh`.

`clean` keeps to Stackweaver's `/tmp` entries, Compose slots and kind cluster. Everything a test run marks
stays with `sweepEndedRuns` (at `cbf39566`), which removes a killed run's jobs network and firewall objects
(`TestSweepRemovesAnEndedRunsJobsNetworkAndItsFirewall`). Its limits: it runs only when the driver integration
tests next run; without an ended run's `sw-tools-*` image the network stays and it says so; and it does not
reach the firewall objects of `stackweaver-jobs-slot-*` networks, unmarked `sw-test-jobs-*` networks or
networks already removed. Those last until a reboot.

The real-host sequence uses the candidate binary and disposable clones whose `origin/<default>` holds this
branch's manifest and Stackweaver's reviewed one, with stand-ins for the rows the reboot cleared. Each run
happens once per clone:

1. `clean --dry-run`: every row that needs no flag reports its outcome, and the owner accepts the report.
2. `clean`: those rows end as the table requires.
3. `clean --compose`, with one slot's worktree present and another's gone.
4. `clean --kind` three times, with `sw-e2e` holding a live mark, then no mark, then an ended mark.

An untouched row passes by appearing in no removal or stop in the report.

| Leftover | Required outcome |
| --- | --- |
| `/tmp/TestConformance_*`, `/tmp/stackweaver-visuals-*`, `/tmp/vh-triage-*` and vh-adlc's other declared prefixes, and built-in `/tmp/go-build*` | Removed once older than their age and not in use |
| Compose `swc-N`, using `--compose` | Kept with its worktree present; stopped and removed with its volumes with it gone |
| Compose `deploy`, `~/.cache/sw-*`, and anything else no rule matches, including the `e2e/k8s/run.sh` registry container, a stated gap | Untouched |
| Everything a Stackweaver test run marks, including containers, images, jobs networks and their firewall objects | Untouched; its own sweep owns them |
| kind `sw-e2e`, using `--kind` | Stopped and deleted with an ended mark; untouched with a live mark or none |

### Order

Every criterion is proved on the feature branch. The rest follows `complete`, and its outcomes go in
`status_description`, outside the normative baseline:

1. This PR lands with a `feat` commit, so `main` tags a stable minor release.
2. The lock moves to that release in its own PR, after the release is tagged.
3. The owner installs the binary and adds the rule for each harness.
4. Stackweaver's adoption PR merges, and a first real run follows.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc env` points a `go test` run at the project's temp root, mode 0700, and it leaves temp files only
      there. `temp_base` moves every root, defaulting to `/tmp/vh-adlc-<uid>`, a symlinked or foreign base is refused,
      and a missing one is recreated.
- [ ] AC-02: `vh-adlc clean --dry-run` reports every declared, abandoned resource with its reason and changes nothing,
      lists abandoned Compose projects and clusters marked as needing their flag, and an applied run reports what
      it removed and kept, with reasons, the space freed, and the count and size of
      user-owned `/tmp` entries no rule matched.
- [ ] AC-03: `vh-adlc clean` removes those and keeps other users' entries, unmatched entries, symlinks, entries with
      a mount point, entries in use and entries younger than their age. No Docker removal is forced, apart from
      `kind delete cluster` on stopped nodes, and an object in use, or whose usage cannot be listed, stays. With a
      denied or failed engine listing no file entry is removed, and with an absent or refused socket file
      entries still are.
- [ ] AC-05: A dry run plans a changed working-tree manifest, and an applied run removes only what the default-branch
      manifest declares. A dry run with an invalid working-tree manifest reports it as a `manifest-unmerged` note,
      plans nothing from it and does not fail on it.
- [ ] AC-06: Each manifest refusal listed in Design, in the default-branch manifest `clean` applies or the working-tree
      manifest `env` reads, reports `manifest-invalid`, that manifest's rules remove nothing, and `env` creates
      nothing for it.
- [ ] AC-07: Run as root, outside the initial PID namespace, outside Linux or with Git older than 2.45, `vh-adlc clean`
      removes nothing and reports why.
- [ ] AC-08: Compose projects change only with `--compose`, and a project stays unless the `working_dir` path of every
      one of its containers is gone. kind
      clusters change only with `--kind`. A cluster with no mark, or any live mark, stays, including one a run
      reused from a killed run and kept. A cluster whose marks have all ended is stopped and deleted.
- [ ] AC-11: With the candidate binary on `PATH`, the plugin from this branch and the one documented rule, a Claude
      Code session in auto mode and a default `workspace-write` Codex session run the operation with no prompt,
      and a direct `rm -rf` of a `/tmp` entry still goes to the classifier or approval. A session that is blocked
      on space and was not asked passes neither `--compose` nor `--kind`. If `clean` refuses with `pid-namespace`
      in the Codex session, that is a stated limit recorded in the evidence, not a failure here.
- [ ] AC-12: Run 1 of the real-host sequence reports every row that needs no flag as required, the owner accepts
      that report before run 2, and runs 2 to 4 leave every row as the table requires.
- [ ] AC-14: The guides, the CLI reference, the compatibility table and `references/clean.md` document the commands,
      the manifest, the Git floor and both rules, `references/authority.md` has the new row, and the package
      checker accepts the operation.
- [ ] AC-18: With the `/tmp` quota exhausted, an applied run frees space and writes nothing to `/tmp`.
- [ ] AC-23: On Stackweaver's reviewed branch, `make test`, `make test-integration`, `make verify`, `e2e/k8s/run.sh`
      and `e2e/k8s/driver-conformance.sh` keep their temp files under its temp root, and `e2e/k8s/run.sh` and
      `e2e/k8s/driver-conformance.sh` each mark the cluster and remove the mark on exit. Without the binary, or when `env` fails, those run unchanged.
- [ ] AC-24: `--older-than` below a rule's age changes nothing, a repository with no manifest still gets the built-in
      globs, and a missing `kind` skips only the kind step. An invalid `host.yaml`, including a relative `temp_base`,
      `$HOME`, or one inside a Git work tree or above the repository, stops the run before it removes anything. A
      failing `env --sh` prints nothing to stdout, and a path with a space or quote is shell-quoted.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `internal/clean` tests on a temporary home, and a `cmd/vh-adlc` test running `go test` on a fixture module. |
| AC-02, AC-03, AC-07 | Fake-filesystem table tests: a `t.TempDir` stands in for `/tmp`, with injected uid, platform, PID namespace, Git version, clock, `/proc` and mount data. Cases include a recent nested file, an unreadable same-uid process and a pid that exits during the scan. The dry-run case compares a tree snapshot. |
| AC-07 | A `cmd/vh-adlc` test runs the real binary under `bwrap --unshare-pid` and asserts `pid-namespace` with nothing removed. |
| AC-02, AC-03, AC-08 | Fake-engine tests: an `httptest` server on a Unix socket records every call and fails on any `force` parameter, across Compose projects and clusters with ended and live marks, a mixed-label Compose project, a killed run's cluster reused and kept, a bind mount, failed listings, and an absent, refused and denied socket. |
| AC-03, AC-08 | Integration test behind a build tag on the real engine, with disposable objects and clusters. |
| AC-05, AC-06 | Table tests on fixture repositories: each refusal, an anchor and a second document among them, a branch edit, an uncommitted edit, an invalid uncommitted edit on a dry run, and an `origin/HEAD` that names a pruned branch. A missing object in a partial clone must not fetch. |
| AC-11 | Written manual procedure in disposable sessions, recorded under `tests/vh-adlc/evidence/clean/`, with `codex execpolicy check` output, the default Codex session's outcome, and a session blocked on space with no request for cleanup. |
| AC-12 | The real-host sequence in Adoption, with each row's outcome recorded. |
| AC-14 | `bun test tests/vh-adlc`, a golden JSON report against the updated schema, and a read of the documentation against the flags. |
| AC-18 | A `cmd/vh-adlc` test under Bubblewrap, without a new PID namespace, with a filled, size-limited tmpfs at `/tmp`. |
| AC-23 | On Stackweaver's adoption branch: each named entry point with the candidate binary, without it, and with a refused base so `env` fails; and an `e2e/k8s/run.sh` run observing the mark during the run and its removal on exit, with and without `KEEP_CLUSTER=1`, and a `driver-conformance.sh` run observing the same. |
| AC-24 | `internal/clean` table tests, and a `cmd/vh-adlc` test capturing stdout of a failing `env --sh`. |

## Tasks

- [x] T1 `internal/gitcmd/gitcmd.go`, `internal/gitcmd/gitcmd_test.go` - a version check against a floor the caller names, whose error names that floor, while `CheckVersion` keeps 2.35; `go test ./internal/gitcmd` fails first because the function does not exist, then passes (AC-07)
      Evidence: `go test ./internal/gitcmd` failed first with `undefined: checkVersionOutput` and `g.CheckMinVersion undefined`; after the change it passed, with 2.44.2 refused at 2.45, 2.45.0 accepted and `CheckVersion` still at 2.35. `go test ./internal/knowledge` still passes.
- [x] T2 `internal/report/codes.go`, `schema/vh-adlc.schema.json` - add the new finding codes Design names for `clean` and `env`; `TestSchema` fails first on the schema missing them, then passes (AC-14)
      Evidence: `go test ./cmd/vh-adlc -run TestSchema` failed first, the schema code list lacking the 13 new codes; after the schema change `TestSchema` and `TestGolden` passed.
- [x] T3 `internal/clean/manifest.go`, `internal/clean/manifest_test.go` - decode `.vh-adlc/cleanup.yaml` through the `internal/settings` reader, then a typed `yaml.v3` decode with unknown keys refused (R-8 F-01); one table row per refusal in Design, plus an anchor, a second document, bad glob syntax, an unparseable age, an empty label and the literal floor on `compose.project` and `kind.cluster` (R-7 F-07), each reporting `manifest-invalid`; `go test ./internal/clean` fails first because the package does not exist, then passes (AC-06)
      Evidence: `go test ./internal/clean` failed first with `undefined: ParseManifest`, and once it built, on `volumes: yes`, which the strict reader keeps as a string and the typed decode read as true. After the change it passed `TestParseManifest` and all 49 `TestManifestRefusals` rows, among them an anchor and alias, a second document, a merge key, a tag, `abcd[`, `max_age: soon`, an empty label and `*` as `compose.project` and `kind.cluster`. Choices for R-7 F-07: the four-character floor applies to every glob and name, a literal one included; a bool takes only `true` or `false`; a project name is `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- [x] T4 `internal/clean/host.go`, `internal/clean/host_test.go` - read `host.yaml` through the same reader, default `temp_base` to `/tmp/vh-adlc-<uid>`, and refuse a relative base, `$HOME`, one inside a Git work tree or above the repository with `host-settings-invalid`, and a symlinked, foreign or group- or world-writable base with `temp-base-refused`; table tests on a temporary home fail first, then pass (AC-01, AC-24)
      Evidence: `go test ./internal/clean` failed first with `undefined: CheckBase` and `LoadTempBase`; after the change it passed: the default `<tmp>/vh-adlc-<uid>`, a set base, 15 `host-settings-invalid` rows (relative, `~/tmp`, the home with and without a slash, the repository, inside its work tree, a linked worktree, above the repository, `/`, an empty value, an unknown key, a number, two documents, an anchor, an empty file) and `temp-base-refused` for a symlink, a file, a world-writable and a foreign base. Choices: a work tree is a `.git` file or a `.git` directory with `HEAD`, so the empty `~/.git` on this host does not count; a base writable by group or others is refused as foreign; an empty `host.yaml` is invalid.
- [x] T5 `internal/clean/env.go`, `internal/clean/env_test.go` - `env` creates the project's temp root, mode 0700, recreates a missing base, reports `TMPDIR` and `GOTMPDIR`, fails with nothing created on each failure code in Design, and shell-quotes its `--sh` lines; table tests, including a path with a space and a quote, fail first, then pass (AC-01, AC-06, AC-24)
      Evidence: `go test ./internal/clean` failed first with `undefined: Env`; after the change it passed: the root at `<base>/example` with base and root at 0700, a base removed and recreated, a 0755 root set back to 0700, `--sh` lines read back by `sh` for a path with a space and a quote, and seven failures (`manifest-missing`, two `manifest-invalid`, `temp-root-undeclared`, `host-settings-invalid`, `temp-base-refused`, `unsupported-platform`) each with one finding, `data: null` and an unchanged home snapshot. Choice: outside Linux `env` reports `error`, as `clean` does for its refusals.
- [x] T6 `internal/clean/files.go`, `internal/clean/files_test.go` - plan and remove top-level `/tmp` and temp-root entries on a fake filesystem with injected uid, clock, `/proc`, `/proc/net/unix` and mount data: other users' entries, unmatched entries, symlinks, mount points, a same-uid `cwd`, `exe`, open file, mapping and bound socket, an unreadable same-uid process, a pid that exits during the scan, a recent nested file, the skipped temp base, `--older-than` below and above a rule's age and on the built-in globs, removal through `os.Root`, the space freed and the unmatched count and size, and a dry run that leaves a tree snapshot unchanged; `go test ./internal/clean` fails first, then passes (AC-02, AC-03, AC-24)
      Evidence: `go test ./internal/clean` failed first with `undefined: planFiles`, `builtinRules` and `applyFiles`; once it built, `TestPlanFiles` failed when its snapshot could not read the locked fake pid, which the helper now records. After the change it passed: eight removals (an old built-in `go-build` and `gopls-tempmod` entry, a 13-hour entry under a 12-hour rule, an entry only an unreadable same-uid process or another user's process references, one whose pid left no links, a symlink's target and an old temp-root entry), twelve kept with reasons (a recent nested file, another owner, a symlink, a mount point with an escaped space, `cwd`, `exe`, a deleted open file, a mapping, a bound socket, a container bind mount, and two younger entries), one unmatched entry counted with its size, the temp base and an entry holding it skipped, an unreadable subdirectory kept as `unreadable`, a missing `/proc` failing the plan, and a dry-run tree snapshot unchanged. Choice for R-6 F-09: `--older-than` also raises the built-in 24 hours.
- [x] T7 `internal/clean/engine.go`, `internal/clean/engine_test.go` - a Docker API client on a Unix socket chosen from `DOCKER_HOST` or `/var/run/docker.sock`; a fake engine on a Unix socket records every call and fails on any `force` parameter, and shows a bind mount keeping a `/tmp` entry, a denied or failed listing removing no file entry, and an absent or refused socket, or a `tcp://` `DOCKER_HOST`, reporting `engine-absent` while file entries are still removed; fails first, then passes (AC-03)
      Evidence: `go test ./internal/clean` failed first with `undefined: ResolveSocket`, `listEngine` and `NewEngine` (the code was moved aside while the tests ran); after the change it passed: `DOCKER_HOST` unset, `unix://`, `tcp://` and `ssh://`; a listing on a fake Unix-socket engine that records every call and fails on `force`, with only the bind source kept; a missing, refused or unconfigured socket reading as absent; a denied socket and a 500 listing reporting `engine-unreachable`; and a bind-mounted `/tmp` entry kept as `in-use` beside a free one removed. That a failed listing removes no file entry, and an absent one still lets them go, is shown in the T10 run.
- [x] T8 `internal/clean/compose.go`, `internal/clean/compose_test.go` - with `--compose`, stop and remove an abandoned project's containers, then its networks, then its volumes when the rule says so, keeping anything in use; without the flag list it as needing `--compose`; a mixed-label project, a project with one working directory present and a failed removal (`removal-failed`) are fake-engine cases; fails first, then passes (AC-02, AC-03, AC-08)
      Evidence: `go test ./internal/clean` failed first with `undefined: doCompose`; after the change it passed on the fake engine: without `--compose` nothing changed and `example-1` was listed as needing the flag; a `--compose` dry run listed its two containers, network, project and volume with no change; an applied run sent exactly a stop of the running container, two container removals, the network and the volume, and kept `example-2` (worktree present), `example-3` (mixed labels after an upgrade) and `example-4` (no working-directory label) as live, and `deploy`, which no rule matches, untouched; a rule without `volumes` left the volume; a 409 kept the volume as `in-use`, a 500 on the network gave one `removal-failed`; a container the engine would not remove stopped the network and volume steps. No call carried `force`.
- [x] T9 `internal/clean/kind.go`, `internal/clean/kind_test.go` - with `--kind`, a cluster whose marks have all ended has its nodes stopped, `kind delete cluster --name` run and its marks removed; a cluster with no mark, a live mark, a mark from another host, or a killed run's cluster reused and kept stays; without the flag it is listed as needing `--kind`; without `kind` on `PATH` only this step is skipped, with `kind-unavailable`; a mark whose cluster is gone is left alone (R-7 F-01, the reading that removes least); fake-engine and fake-`kind` tests fail first, then pass (AC-02, AC-08, AC-24)
      Evidence: `go test ./internal/clean` failed first with `undefined: markEnded` and `doKind`; after the change it passed with an injected `kind` and process table: without `--kind` nothing changed and only `example-ended` was listed as needing the flag; a dry run listed it and its two marks with no change; an applied run stopped its one running node, ran `kind delete cluster --name example-ended` and removed both marks, and kept `example-nomark` (unmarked, as a cluster a harness keeps), `example-live`, `example-otherhost` and `example-reused` (a killed run's ended mark beside the live mark of the run that reused it) as live, with a malformed mark reading as live; `m-gone`, a mark whose cluster is gone, drew no call. Without `kind` nothing changed and one `kind-unavailable` was reported; a failed `kind delete` gave `removal-failed` and kept the marks. Choice for R-7 F-01: a mark with no cluster is left alone.
- [x] T10 `internal/clean/clean.go`, `internal/clean/clean_test.go` - the `clean` run: refusals for platform, root, PID namespace and Git older than 2.45 that remove nothing; the default-branch manifest read with `GIT_NO_LAZY_FETCH=1`; `default-branch-unknown` and `manifest-missing` notes; a dry run that also plans a differing working-tree manifest as `manifest-unmerged`, and an applied run that uses only the default branch; a partial clone that does not fetch; and one table from every finding code to its result and exit code, a dry run included (R-6 F-08, R-7 F-04); fixture-repository tests fail first, then pass (AC-02, AC-05, AC-06, AC-07)
      Evidence: `go test ./internal/clean` failed first with `undefined: Clean`, `Options` and `Data`. Once it built, two `TestResults` dry-run rows failed: an invalid default-branch manifest was reported twice because an identical working tree read as different, which the code now prevents, and with no default branch the working-tree manifest is planned as `manifest-unmerged`, which the table now expects. After that it passed: root, a PID namespace (also unreadable), outside Linux and `git version 2.44.2` each report `error`, change no file and send no engine call, applied or dry; an applied run removes only past-age matches and lists the Compose project as needing `--compose`; a dry run with both flags changes neither tree nor engine; a branch commit and an uncommitted edit are planned only under `unmerged` by a dry run and never used applied; a partial clone missing the manifest blob reports `manifest-invalid` and the blob is still missing afterwards; a 500 listing or denied socket removes no file entry, an absent socket or `tcp://` `DOCKER_HOST` still removes them with `engine-absent`. The result table passes for 19 rows: `pass`/`answered` (exit 0) with no finding and with each note, and `fail` (exit 1) for `manifest-invalid`, `host-settings-invalid`, `temp-base-refused`, `engine-unreachable`, `kind-unavailable` and `removal-failed`, dry runs included. Choices for R-6 F-08: every failing code fails a dry run too; a manifest blob that would need a fetch is `manifest-invalid`.
- [x] T11 `cmd/vh-adlc/main.go`, `cmd/vh-adlc/main_test.go`, `cmd/vh-adlc/golden_test.go`, `cmd/vh-adlc/testdata/golden/` - wire `clean` and `env` with `noPin` (R-8 F-03), with `env --sh` printing only `export` lines and nothing to stdout on failure, landing as a `feat` commit; a `go test` run on a fixture module under `env` leaves its temp files only in the root, and golden reports for `env` and `clean --dry-run` pass `TestGolden` and `TestSchema`; `go test ./cmd/vh-adlc` fails first because the commands do not exist, then passes (AC-01, AC-14, AC-24)
      Evidence: `go test ./cmd/vh-adlc` failed first: `env` and `clean` answered `usage` with "unknown command". After the change it passed: under `env --sh`, with a temp base holding a space and a quote, a fixture module's `go test -work` reported its `WORK` directory, `t.TempDir()`, `os.CreateTemp` and `os.TempDir()` all under `<base>/fixture`, mode 0700; a failing `env --sh` printed nothing to stdout, exited 1, wrote the `manifest-missing` report to stderr and created no base; `env` and `clean` ignored a missing or malformed `--plugin-pin` with `knowledge: null`; `clean` and `env` usage errors (an argument, `--older-than soon` and `-2h`) exited 2; goldens `env-manifest-missing` and `clean-host-settings-invalid` passed `TestGolden` and `TestSchema`, and every older golden was unchanged. A golden of a full `clean` report is not possible, as the binary reads the real `/tmp`; the report shape is covered by the `internal/clean` tests. A first real `clean --dry-run` printed `null` for empty lists; `TestCleanDryRunChangesNothing` then failed on a check that empty lists print as `[]`, and passed after the change.
- [x] T12 `cmd/vh-adlc/bwrap_test.go` - the real binary under `bwrap --unshare-pid` reports `pid-namespace` and removes nothing, and under Bubblewrap without a new PID namespace, with a filled, size-limited tmpfs at `/tmp`, an applied run frees space and writes nothing there; both skip without `bwrap` unless `VH_ADLC_REQUIRE_BWRAP=1`, which makes a missing `bwrap` fail; fails first, then passes (AC-07, AC-18)
      Evidence: The behaviour landed in T10 and T11, so the first run of `TestCleanFreesAFullTmp` failed only on two test errors: it expected no `manifest-missing` note and left an empty probe file in `/tmp`. With those fixed, `VH_ADLC_REQUIRE_BWRAP=1 go test ./cmd/vh-adlc -run ...` passed both: under `bwrap --unshare-pid` the real binary reported `error` with `pid-namespace` and `/tmp/go-build1` stayed; with the host `/proc`, a 4 MiB tmpfs `/tmp` that a write could not extend, an applied run reported `pass` with the `engine-absent` and `manifest-missing` notes, `freed_bytes` 1048576, 1024 KiB more available, and only the unmatched entry left. To show the tests can fail, a mutated build that ignored the namespace and read `/mnt` as `/tmp` failed both. Without `bwrap` on `PATH` the test skipped, and with `VH_ADLC_REQUIRE_BWRAP=1` it failed.
- [x] T13 `tests/vh-adlc/clean-bwrap.test.ts` - the `checker` CI job, which installs Bubblewrap and Go, runs the T12 tests with `VH_ADLC_REQUIRE_BWRAP=1`, so a missing `bwrap` fails that job rather than skipping (R-6 F-02, with no change to `ci.yml`); `bun test tests/vh-adlc/clean-bwrap.test.ts` fails first while the tests are absent from the run, then passes (AC-07, AC-18)
      Evidence: `bun test tests/vh-adlc/clean-bwrap.test.ts` with a `PATH` holding only `git`, `go` and `sh` failed: with `VH_ADLC_REQUIRE_BWRAP=1` the Go tests failed instead of skipping. With `bwrap` on `PATH` it passed, seeing `--- PASS` for both tests and no `--- SKIP`. The file skips outside Linux, so the macOS checker job, which globs `tests/vh-adlc/*.test.ts`, is unaffected. No change to `ci.yml`.
- [x] T14 `internal/clean/engine_integration_test.go` - behind the `engine` build tag, disposable Compose-labelled objects and a disposable kind cluster on the real engine; `go vet -tags engine ./internal/clean` passes, and running it is the owner's (AC-03, AC-08)
      Evidence: `go vet -tags engine ./internal/clean` and `golangci-lint run --build-tags engine ./internal/clean/...` passed, and `go test -tags engine -list` compiled and listed `TestRealEngineCompose` and `TestRealEngineKind` without running them. Not run: the safety rules for this build keep every removal test off the real engine, so neither a failing first run nor a pass was observed. The owner runs it with `go test -tags engine ./internal/clean`, adding `VH_ADLC_ENGINE_KIND=1` for the kind case.
- [x] T15 `.vh-adlc/cleanup.yaml`, `internal/clean/manifest_test.go` - vh-adlc's own manifest for `vh-triage-*` and its other test prefixes; a test decodes it and checks that each declared glob matches a prefix the tests create and none matches the temp base (AC-02, AC-03)
      Evidence: `go test ./internal/clean -run TestOwnManifest` failed first with the manifest absent, then passed: 45 `tmp` globs at 6 hours, each matching a prefix from a search of the tests for `tmpdir()` and `os.MkdirTemp`, every one of the 66 prefixes matched, and none matching `vh-adlc-0`, `vh-adlc-1000` or `vh-adlc-65534`. Choices: no `vh-adlc-*` or bare `triage-*` and `maintenance-*` globs, so the base and other tools' names stay out; no `temp_root`, as the repository's tests do not use `env`. A real `clean --dry-run` with the candidate binary in this worktree answered with `manifest-missing` (origin/main has no manifest yet) and `manifest-unmerged`, planning 28 current `/tmp` entries under this manifest and removing nothing.
- [x] T16 `plugins/vh-adlc/skills/vh-adlc-clean/SKILL.md`, `plugins/vh-adlc/references/clean.md`, `plugins/vh-adlc/references/lifecycle.md`, `plugins/vh-adlc/references/loop.md`, `plugins/vh-adlc/references/authority.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json`, `tests/vh-adlc/check.test.ts` - the operation, its procedure and fields, the lifecycle row, the loop exception to steps 1 and 2, the authority row, the one-line reports for a missing or older binary and the terminal instruction on `pid-namespace` (R-7 F-04), a version bump, and a checker category for a host operation; `bun test tests/vh-adlc` fails first on the new category, then passes (AC-11, AC-14)
      Evidence: `bun test tests/vh-adlc/check.test.ts` failed first on the four new host-operation tests (no skill, no `references/clean.md`, no loop exception, no authority or lifecycle row), then passed 57 of 57. Adding the skill also failed the skill counts in `tests/vh-adlc/triage/discovery.test.ts` and `tests/vh-adlc/maintenance/discovery.test.ts`, which now expect twelve skills and leave `vh-adlc-clean` out of the engineering-operation count. The full `bun test tests/vh-adlc` ran 636 tests under load: 13 failed and 4 errored, every one a timeout in `maintenance/analysis`, `maintenance/publication`, `triage/execution` or `triage/journal-crash`. Rerun with `--timeout 120000` and `VH_ADLC_TRIAGE_TEST_TIMEOUT_MS=60000`, those four files passed 104 of 106; the two left were `maintenance/analysis.test.ts` tests with their own fixed 30-second limits, and that file alone passed 14 of 14 on this tree and on the base `aa5c66e`. The plugin version moves to 0.8.0.
- [x] T17 `docs/reference/cli.md`, `docs/reference/compatibility.md`, `docs/get-started/installation.md`, `docs/user-guides/workflows.md`, `README.md` - document the commands, the manifest, the Git floor and both allow rules, and limit the compatibility page's verified-binary sentence to the triage and maintenance settings (R-8 F-04); a read of each page against the built binary's flags and reports agrees (AC-14)
      Evidence: The doc-agreement test in `tests/vh-adlc/triage/discovery.test.ts`, changed to expect twelve skills, `vh-adlc-clean` and `vh-adlc clean`, failed first against the old pages (`Expected to contain: "twelve skills"`), then passed with `check.test.ts` and `blog.test.ts`, 67 of 67. A read of the pages against a binary built from this branch agreed: the documented `if lines=$(vh-adlc env --sh); then eval "$lines"; fi` set `TMPDIR` and `GOTMPDIR` to `<base>/demo` at mode 0700 from `host.yaml` in the config directory, a failing `env --sh` exited 1 with nothing on stdout, `clean --dry-run --older-than 1h` answered with `knowledge: null`, and `--older-than x` gave `usage`. The compatibility page now says the verified binary reads only the triage and maintenance settings, and the `vh-adlc` on `PATH` reads `cleanup.yaml` unverified (R-8 F-04).
- [x] T18 `tests/vh-adlc/evidence/clean/procedure.md` - the written AC-11 procedure for disposable Claude Code and Codex sessions, with `codex execpolicy check`, a direct `rm -rf` control, a session blocked on space with no request, and the missing-binary, older-binary and `pid-namespace` reports; a read against the operation agrees, and running it is the owner's (AC-11)
      Evidence: Read against `skills/vh-adlc-clean/SKILL.md` and `references/clean.md`: the procedure checks the dry run before the applied run, the two documented rules only, `codex execpolicy check --rules <file> <command>` (the syntax `codex execpolicy check --help` printed on codex-cli here), a direct `rm -rf` control in each harness, a session blocked on space with no request passing neither `--compose` nor `--kind`, and the one-line reports for a missing binary, the locked 0.9.0 binary that answers `usage`, and `pid-namespace`. `bun test tests/vh-adlc/evidence-index.test.ts tests/vh-adlc/check.test.ts` passed. Not run: it needs the binary installed in `/usr/local/bin` and the owner's rules, so AC-11 stays open.
- [x] T19 `internal/clean/engine.go`, `internal/clean/compose.go`, `internal/clean/compose_test.go` - R-9 F-01 and F-02: a network delete answered with 403, which Docker returns while a container is still attached, keeps the network as `in-use` instead of failing the run, and a Compose project is listed under `removed` only once all its containers went, otherwise under `kept` with the reason its first stuck container was kept; `go test ./internal/clean` fails first on the two cases, then passes (AC-02, AC-03)
      Evidence: `go test -count=1 ./internal/clean -run TestCompose` failed first: `TestComposeKeepsANetworkWithActiveEndpoints` got one `removal-failed` for `DELETE /networks/net1: 403 Forbidden`, and `TestComposeStopsAtAContainerItCannotRemove` found `compose_project example-1:abandoned` under `removed` after a container answered 409. After the change both passed, for a container answering 409 (`in-use`) and 500 (`removal-failed`), and `go test ./...`, `go vet ./...`, `go vet -tags engine ./internal/clean`, `golangci-lint run` (2.14.0 here; CI pins 2.15.0), the engine-tag lint, `gofmt -l` and `go mod tidy -diff` were clean. On Docker 29.7.2, `DELETE /networks/<net>` on a disposable network with an attached container answered 403.
- [x] T20 `plugins/vh-adlc/references/clean.md` - R-9 F-03, as the owner decided on 2026-11-06: state as a known limit that a container bind-mounting all of `/tmp` or `/` marks no entry as in use, with no new handling; `bun test tests/vh-adlc/check.test.ts` passes and a read against `usage.holds` agrees (AC-14)
      Evidence: A new "What counts as in use" section names the same-user process links and container bind mounts that keep an entry, the whole-`/tmp` or `/` bind mount as a limit that only age covers, and the limits Design already lists. `internal/clean/files.go` `usage.holds` and `mountedIn` call `within(p, entry)`, which holds only for the entry or a path inside it, so a bind source of `/tmp` or `/` holds no entry, as the section says. `bun test tests/vh-adlc/check.test.ts` passed 61 of 61 on the tree rebuilt on `origin/main` `21bc3e4`. No code changed.
- [x] T21 `plugins/vh-adlc/references/clean.md` - R-10 F-06: say that a stopped container's bind mount also keeps an entry, as the engine listing includes stopped containers; `bun test tests/vh-adlc/check.test.ts` passes and a read against `internal/clean/engine.go` agrees (AC-14)
      Evidence: `listEngine` in `internal/clean/engine.go` requests `/containers/json?all=1`, and `engineState.binds` takes the bind sources of every listed container, so "a container, running or stopped" matches the code. `bun test tests/vh-adlc/check.test.ts` passed 61 of 61. No code changed.
- [x] T22 `plugins/vh-adlc/references/clean.md` - the owner's answer to Q1 (R-10 F-03) on 2026-11-06: the stated limit also names a container that bind-mounts the temp base or the project's temp root, docs only; `bun test tests/vh-adlc/check.test.ts` passes and a read against `usage.holds` agrees (AC-14)
      Evidence: "What counts as in use" now names a bind of all of `/tmp` or `/`, the temp base or the project's temp root, with `-v "$TMPDIR:$TMPDIR"` as the example. `usage.holds` and `mountedIn` in `internal/clean/files.go` call `within(p, entry)`, which holds only for the entry or a path inside it, so a bind source that is an ancestor of the scanned directory holds no entry below it. `bun test tests/vh-adlc/check.test.ts` passed 61 of 61. No code changed.
- [ ] T23 `plugins/vh-adlc/references/clean.md` - the owner's answer to Q4 (R-11 F-03) on 2026-11-06, with R-12 F-01: the stated limit names a bind of `/tmp` or any directory above it for top-level entries, and a bind of the project's temp root or any directory above it, the temp base included, for temp-root entries, docs only; `bun test tests/vh-adlc/check.test.ts` passes and a read against `usage.holds` agrees (AC-14)
- [ ] T24 `internal/clean/clean_test.go`, `internal/clean/clean.go`, `plugins/vh-adlc/references/clean.md` - the owner's answer to Q3 (R-11 F-02) on 2026-11-06: a dry run reports an invalid working-tree manifest as a `manifest-unmerged` note naming the refusal, plans nothing from it and does not fail on it, while an invalid default-branch manifest still fails; `references/clean.md` says so; a `TestResults` row and a `TestManifestSources` case for the invalid uncommitted edit fail first, then pass (AC-05, AC-06, AC-14)
- [ ] T25 `internal/clean/clean_test.go`, `internal/clean/clean.go` - R-13 F-01: an `origin/HEAD` that names a remote-tracking branch which no longer exists reports `default-branch-unknown`, a note with the `git remote set-head origin --auto` hint, and skips project rules while the built-in globs still apply, instead of failing with `manifest-invalid`; a fixture-repository case with a renamed default branch and a pruning fetch fails first, then passes (AC-05, AC-24)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-02 | R-1 | spec | `5dbeab86b1c11bf1cd5affd42e0d5e50fd04d140` | claude-opus-5-5 | procedural | 26 findings, 7 blocking |
| 2026-11-02 | R-2 | spec | `443b34d47ad543865cb2892ea12a3d5633924006` | claude-opus-5-5 | procedural | 15 findings, 3 blocking |
| 2026-11-02 | R-3 | spec | `22769c05e7ba2e6f30b43b91a3f60ad9413c62f8` | claude-opus-5-5 | procedural | 15 findings, 1 blocking |
| 2026-11-02 | R-4 | spec | `d225d01622be32d9ec446a21bd15e910fea72585` | claude-opus-5-5 | procedural | 13 findings, 0 blocking |
| 2026-11-02 | R-5 | spec | `d875e20f90e14d3d059de04fc3bf71203f45b386` | claude-opus-5-5 | procedural | 14 findings, 1 blocking |
| 2026-11-02 | R-6 | spec | `104d96968de60313f1c940edc464180edf015fbb` | claude-opus-5-5 | procedural | 10 findings, 1 blocking |
| 2026-11-02 | R-7 | spec | `ffe9dd6e7f388e7cfd20918e7f85ddf67b9c54ec` | claude-opus-5-5 | procedural | 9 findings, 0 blocking |
| 2026-11-02 | R-7 | spec | `ffe9dd6e7f388e7cfd20918e7f85ddf67b9c54ec` | n/a | n/a | accepted by owner |
| 2026-11-03 | R-8 | spec | `aa5c66e7fe2c62142e7cf330b6fc504a87ec0d6c` | claude-opus-5-5 | procedural | 4 findings, 0 blocking |
| 2026-11-06 | R-9 | implementation | `1ad76f2a3ff81c2f1c69ce0fe06ca8fac9e10c03` | claude-opus-5-5 | procedural | 10 criteria met, 3 not verified, 5 findings, 0 blocking |
| 2026-11-06 | R-10 | spec | `6d0c8af90cdc036493479430e57b6f2c202cba48` | claude-opus-5-5 | procedural | 6 findings, 0 blocking |
| 2026-11-06 | R-11 | spec | `1fdaced37fbcefc58a02328a71cc88eebfe83753` | claude-opus-5-5 | procedural | 4 findings, 0 blocking |
| 2026-11-06 | R-12 | spec | `3507447e4a40945626f5281b945f045572531a7f` | claude-opus-5-5 | procedural | 2 findings, 0 blocking |
| 2026-11-06 | R-13 | spec | `b68e46d87dd8bdfcd318b24b34eab987a8211f91` | claude-opus-5-5 | procedural | 2 findings, 0 blocking |
| 2026-11-06 | R-14 | spec | `804c97b40c6d428e2e993abcece1593e0dbbb3de` | claude-opus-5-5 | procedural | 1 finding, 0 blocking |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Where the rules come from and The operation
EVIDENCE: Lines 304-305: a dry run "needs no proof: it falls back to the local default-branch ref and reports `remote-unverified`". Line 439: the operation starts with `vh-adlc clean --dry-run`. Lines 441-442: "When a project's rules are unmerged, unproven or untrusted, it reports the finding and what clears it, and removes nothing." So every operation run sees `remote-unverified` and never applies, and AC-11 (dry run and apply) cannot pass. Line 301 also says "Every run does this" proof, which contradicts line 304. Lines 307-308 have the binary apply the proven rules with `manifest-unmerged`, while the operation refuses on that same finding, so a session on a branch that edits the manifest cannot clean.
PROPOSAL: Make the dry run attempt the proof first and report `remote-unverified` only when the proof fails, with a field saying which rules it used. State that the operation stops only for projects with no proven rules, and that `manifest-unmerged` alone does not stop an apply.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Design, Where the rules come from; Acceptance Criteria
EVIDENCE: The incident is a full `/tmp` quota that "blocked every session" (line 40). Line 292 puts the proof's bare repository in "a per-run temporary directory" with no location given, and `go doc os.TempDir` gives `$TMPDIR`, else `/tmp`. Line 304: "A failed step removes nothing for that project." The default temp root and the Claude Code scratch directory are also on that tmpfs. `df -h ~/.cache` now shows `/home` at 98% with 4.5G free. No criterion or Test Plan row runs `clean` with `/tmp` at its quota. With every box ticked, the command can fail in exactly the state it exists to fix, and on demand is the only schedule (line 206).
PROPOSAL: Fix the proof's temporary location outside `/tmp` and hold its size budget, and add a criterion that an applied run frees space with the `/tmp` quota exhausted. State which route works when the session's own shell cannot write, such as the owner's terminal.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Design, Temp root; Risks and safeguards
EVIDENCE: Lines 232 and 504: "a failed check counts as live". Line 327 decides use by reading `cwd`, `root`, `exe` and `fd` in `/proc/<pid>`. As uid 1000 here, `readlink /proc/1/cwd` returned rc=1, `ls /proc/1/fd` gave Permission denied, and 429 of 532 pids had an unreadable `cwd`. Taken literally, no entry is ever removed on a normal Linux host. If foreign pids are skipped instead, a rootful container that bind-mounts a `/tmp` entry is invisible, because its processes are root and its mounts are in another namespace, so `/proc/self/mountinfo` does not show them. The listed links also miss listening Unix sockets (the fd link reads `socket:[n]`) and memory-mapped files.
PROPOSAL: Define what an unreadable `/proc` entry of another uid means and state the resulting limit. Add an engine check of container `Mounts` sources, and decide whether sockets and maps count, with a Test Plan case for each.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Design, Removal and hard limits rule 7; Scope
EVIDENCE: Rule 7 deletes a cluster with `kind delete cluster` when node containers "are older than the rule's age", with no liveness check. kind's docker provider `DeleteNodes` runs `docker rm -f -v` ("force the container to be delete now", `pkg/cluster/internal/providers/docker/provider.go:143-145`). That contradicts line 381 (limits hold regardless of the manifest), rule 3 ("Removal is never forced"), rule 4 and Scope line 181 ("Only engine containers that a rule calls abandoned are stopped"). The goal says "has abandoned", but a live `e2e/k8s/run.sh` run or a `KEEP_CLUSTER=1` cluster older than the age is deleted. The risk row on engine objects names only `pid` and `path` liveness, and no criterion keeps a live cluster.
PROPOSAL: Require real liveness for a cluster, for example a `pid` mark on a harness-owned object or a stopped-nodes condition, and add a criterion that a live cluster stays. Otherwise state rule 7 as a named exception to the never-forced limit, with the owner's agreement.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria, AC-12 and AC-13; Stackweaver adoption
EVIDENCE: AC-12 needs only "Stackweaver's and vh-adlc's manifests merged" yet requires every fixture row to classify. The row `/tmp/go-build*`, 22 entries, needs "Shared host manifest, not Stackweaver", and lines 361-363 put that in a repository the owner keeps, "for example dotfiles". Scope, Stackweaver adoption and the Test Plan name no such repository, and `ls ~/code | grep -i dot` returned nothing. It must also be on the host list and under `trusted_remotes`. As written, AC-12 and AC-13 cannot pass, and one of the largest recurring classes has no owner.
PROPOSAL: Name the shared repository, or assign the `go-build*` and `gopls-tempmod*` globs to one existing repository, and add it to Scope and to AC-12. Otherwise change the row to untouched and counted as unattributed.

FINDING: F-06
KIND: factual
SEVERITY: blocking
WHERE: Design, Risks and safeguards, row "An agent with push rights changing the default branch"
EVIDENCE: The row says Stackweaver's manifest "needs branch protection or a code owner for that one path". `gh api repos/michielvha/stackweaver/branches/main/protection` returned HTTP 403, "Upgrade to GitHub Pro or make this repository public to enable this feature", and rulesets returned the same. `gh repo view` reports the repository PRIVATE. Both it and vh-adlc report `"protected": false`. `git show main:.github/CODEOWNERS` returned nothing. No Scope item, criterion or Open Question covers this, so any session with push rights can merge a wider manifest and run it through the allow rule with no classifier, and "merged" proves nothing about review.
PROPOSAL: Raise it as an owner decision with options: a paid plan, a public repository, or an explicit acceptance that merged means pushed. Then add the outcome to Scope and a criterion, because Open Questions "None." does not hold while this is undecided.

FINDING: F-07
KIND: factual
SEVERITY: blocking
WHERE: Design, Where the rules come from; Risks row on `core.sshCommand`; AC-15
EVIDENCE: Lines 298-300 keep remote commands out of the repository, but the dry-run fallback at line 305 reads a local ref inside it, under the same allow rule. In a scratch repository with `extensions.partialClone=origin`, `remote.origin.promisor=true`, an `ssh://` origin, a planted `core.sshCommand` and a ref whose blob was missing, `git cat-file blob origin/main:.vh-adlc/cleanup.yaml` ran the planted command (canary file created). A local read can therefore become a lazy fetch. The risk row's "repository configuration is never read for them" and AC-15's "never runs" are both false for this path.
PROPOSAL: Set `GIT_NO_LAZY_FETCH=1` or pass `--no-lazy-fetch` on every Git command run inside a project repository, and list the only local commands the binary may run. Extend AC-15 to dry runs with this case.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-15
EVIDENCE: The row tests "a local bare repository" and a planted `core.sshCommand` canary. In a scratch repository, `git fetch origin` with a local-path origin and a planted `core.sshCommand` created no canary, while the same fetch with an `ssh://` origin created it. Git never calls ssh for a local remote, so the proof passes even if the binary runs Git inside the repository.
PROPOSAL: Run the canary case with an `ssh://` URL so the transport would invoke `core.sshCommand`. Assert that the canary is absent and that a control run inside the repository creates it.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Design, Where the rules come from step 1; AC-15
EVIDENCE: Step 1 normalizes the URL and matches a text prefix, and the refused list names only local, `file://`, `http://` and `ext::`. `git ls-remote -- https://github.com/michielvha/../octocat/Hello-World.git HEAD` printed "redirecting to https://github.com/octocat/Hello-World.git/" and returned that repository's head. That URL starts with the trusted `github.com/michielvha/` prefix but reads a repository outside it.
PROPOSAL: Require exactly `<host>/<owner>/<repo>` after normalization and refuse dot segments, percent escapes, queries and fragments. Add these forms to the AC-15 refused list, and treat an HTTP redirect to another repository as a failed proof.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Host settings and the host list; Ownership manifest
EVIDENCE: Line 273: "Losing it costs nothing". Lines 374-377 check overlap only across proven manifests of listed repositories. With `projects.yaml` lost, deleted or not yet holding a project, `clean --repo A` compares A with nothing, so A can remove B's entries. The file sits in the user cache with no deny rule. A listed repository whose proof fails this run also drops out of the check. The risk row "overlap refusal on every run" does not hold in these cases.
PROPOSAL: Correct the claim. Decide what happens when a listed repository is unproven, for example hold back overlapping `tmp` and engine work, and add a Test Plan case with an emptied host list.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Design, Ownership manifest refusals; AC-06
EVIDENCE: The four-character floor applies only to `tmp` globs (line 367). Nothing limits `compose.project`, a Docker `name` glob or `kind.cluster`, so `project: "*"` with `volumes` passes and takes any project on the engine whose working directory is gone. `label_namespace` has no floor or reserved list, so `com.docker.compose.` is accepted, and an `age` rule on `com.docker.compose.project=deploy` with kind volume can match the dev stack's volumes while they are unused. That defeats the risk row "The `deploy` project matches no rule". Line 381 promises limits that hold "regardless of what a manifest declares".
PROPOSAL: Apply the literal-prefix floor to every glob. Refuse namespaces owned by tools, such as `com.docker.`, `io.x-k8s.`, `org.opencontainers.` and `io.containers.`, require a minimum namespace length, and cover these in AC-06.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Design, Ownership manifest
EVIDENCE: The `docker` row lists `engines` and rules with `kinds`, `match`, `name`, `liveness` and `anonymous_volumes`, but `age` needs `max_age` (line 355), and with strict parsing (line 335) that key is unknown. No field says which label holds the `pid` or `path` value, or whether `match` is a key or key=value. Line 356 requires a `name` glob "when the label is shared with live production objects", which the binary cannot decide, and the refusal list omits it.
PROPOSAL: Give the full rule schema, with one example each for `pid`, `path` and `age`. Make the `name` glob mandatory for every `age` rule and add that to the refusals.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Context; Design, fixture rows for `sw-test-*`
EVIDENCE: Lines 75-76 call unmarked jobs networks "older". At `96eaff82`, `network.go:140` still creates every jobs network with only `LabelManaged`, and `container_integration_test.go:656-662` makes `sw-test-jobs-*` through `EnsureNetwork`, so a live run's jobs network has no `test-run` mark today. Tests also add `withTestRun` on top of `LabelManaged` (`container_integration_test.go:632`), so a network can match both the `pid` rule and the `age` rule on `managed=true` with `sw-test-*`. The design gives no precedence between rules, yet the fixture requires "Kept while the pid lives". An idle live network past its age is removed, firewall objects included.
PROPOSAL: Correct the Context claim and state that any rule reading live keeps the object. Have Stackweaver add the mark in `EnsureNetwork` for tests, or justify the `age` rule against the longest run, and add a two-rule case to the Test Plan.

FINDING: F-14
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Firewall; AC-08
EVIDENCE: Line 421: an object that "hashes to no network on the engine is an orphan". If networks are listed before chains, a network created in between has a chain that reads as an orphan, and removing it strips a live job network's isolation. Stackweaver also runs Podman, which writes nftables tables (`network.go:61-63`), and the manifest allows both `engines`, so a table of the other engine reads as an orphan. Coverage is short too: `chainName` is uppercase while `nftTableName` is lowercase (`network.go:198,343`), tables exist "in the inet and the bridge family" (`:341`), and `ip6tables` chains exist (`:333-335`). The design mentions none of these, and a case-sensitive compare would orphan every chain.
PROPOSAL: Specify the order as firewall objects first, then networks across every engine in the manifest, with any failed listing orphaning nothing. Name the case, both nft families and ip6tables, and add a Test Plan case for a network created during the run.

FINDING: F-15
KIND: factual
SEVERITY: should-fix
WHERE: Design, The operation and Permission rules; AC-11
EVIDENCE: The design installs to `~/.local/bin/vh-adlc` and the rule matches the bare name `vh-adlc`. In this Claude Code Bash tool, `echo $PATH` printed `/usr/local/bin:/usr/bin`, the same as the parent process's environment, so `~/.local/bin` and `~/go/bin` are absent. `which vh-adlc kind claude` found none of them, while `bash -lc` finds `kind` and `claude`. The absolute path `ensure-vh-adlc.sh` prints does not match the allow rule. So a session of this kind gets command not found, and `--kind` gets `kind-unavailable`. Context itself had to call `~/go/bin/kind`.
PROPOSAL: Choose an install location verified on the Bash tool's PATH on this host, or document the PATH change the owner must make. Add a check for it to the AC-11 procedure and state how `kind` is found.

FINDING: F-16
KIND: factual
SEVERITY: should-fix
WHERE: Design, The operation; Permission rules; Risks row "A fake `vh-adlc` on `PATH`"
EVIDENCE: The operation runs `ensure-vh-adlc.sh`, but the rules cover only `vh-adlc clean` and `vh-adlc env`. `codex execpolicy check` on `bash /x/ensure-vh-adlc.sh` returned no matched rules, and under Claude Code it goes to the classifier, so AC-11's "without a permission prompt or refusal" depends on a command outside the rules. The script also runs the candidate: line 90 calls `reports_version` after a digest mismatch, which executes the PATH binary with `--version`, so the safeguard runs the fake before rejecting it.
PROPOSAL: Document a third rule for the verification step or replace it with a digest check that needs no rule. Have the operation refuse a digest mismatch without executing the candidate.

FINDING: F-17
KIND: factual
SEVERITY: should-fix
WHERE: Design, The operation; frontmatter `covers`; AC-14
EVIDENCE: Line 447 has the operation skip `knowledge`, while line 272 says "Every vh-adlc operation starts with `knowledge`", and `references/loop.md:3` says every operation follows the same frame. `tests/vh-adlc/check.test.ts:229` accepts only the entry skill, scheduled operations and `CONTENT_OPERATIONS`, and `:253-254` requires scheduled skills to contain `vh-adlc knowledge`. The design names no category for this operation. `covers` omits `plugins/vh-adlc/.claude-plugin/plugin.json`, whose version the checker requires to change (`:213-221`), and `plugins/vh-adlc/references/loop.md`.
PROPOSAL: Define the operation's checker category and its exception to the loop, and fix line 272. Add the missing paths to `covers`, along with any other page that lists operations, such as `docs/get-started/installation.md`.

FINDING: F-18
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Commands and The operation; Scope
EVIDENCE: Scope calls the heavy kinds "opt-in", and a risk row counts "only with `--firewall`" as a safeguard for a root-equivalent container. Line 251 protects the allow rule from widening, but `Bash(vh-adlc clean *)` and the Codex prefix rule also pass `--firewall`, `--kind` and `--all-projects`, so any session can opt itself in with no classifier. The operation text never says when these flags are used, and it applies when "the session is blocked on space".
PROPOSAL: State that the operation passes these flags only when the user named them. Document a Claude Code `ask` rule and a Codex `prompt` or `forbidden` rule for the two heavy flags, or record that the owner accepts this.

FINDING: F-19
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Design, Temp root, Removal and Permission rules
EVIDENCE: Only hosts other than Linux and macOS are out of scope, but `go doc os.UserConfigDir` gives `$HOME/Library/Application Support` on Darwin, so `Edit(~/.config/vh-adlc/**)` protects nothing there. Rule 2 relies on `/proc/self/mountinfo`, which macOS lacks, and line 232 turns a failed check into live. The design does not cover macOS `/tmp` being a symlink, against "a symlink is skipped", or `$TMPDIR` under `/var/folders`, which keeps Go leftovers out of the `/tmp` rules. The Docker socket default is also Linux-shaped. No criterion or Test Plan row covers macOS.
PROPOSAL: Either state the macOS behaviour for each of these and add a proof, or limit v1 to Linux and have the binary refuse elsewhere.

FINDING: F-20
KIND: factual
SEVERITY: should-fix
WHERE: Design, Commands and Results; AC-07, AC-10
EVIDENCE: Line 254 maps results only for dry run, removal success, failed removal and failed proof. No result is given for `running-as-root`, `busy`, `temp-base-refused`, `engine-unreachable` or `kind-unavailable`; a root run has no planned removal, so it reads as `pass`. Line 255 makes an unproven project `fail`, and this host's clones include third-party `LowGok/*` remotes and could include repositories with no origin, so once such a repository is listed, `--all-projects` can never pass. `env --sh` has no failure path, though its output goes to `eval`. No code covers an invalid `host.yaml`.
PROPOSAL: Add a table from every finding code to its result and exit code, and decide whether `remote-untrusted` fails a run or is only counted. State what `--sh` prints to stdout on failure, and add a code for host settings.

FINDING: F-21
KIND: judgement
SEVERITY: should-fix
WHERE: Scope; Acceptance Criteria; Test Plan
EVIDENCE: Scope item "A binary release and the plugin lock bump" has no criterion, and the lock still names 0.1.0. `--older-than` raise-only is the stated reason an allowed session "cannot widen what is removed", yet it has no criterion. Neither do the `busy` lock, continuing file work after `engine-unreachable`, or a missing base after a reboot, where AC-17 reads as a refusal though nothing is wrong. Stackweaver's `env` adoption has no criterion either: AC-12 covers only its manifest. AC-02 claims the engine stays unchanged, but its only Test Plan row is the fake filesystem, and a dry run still writes the host list.
PROPOSAL: Add criteria and proofs for these behaviours, including the Stackweaver test-run outcome that temp files land in the root. Add AC-02 to the fake-engine row and exempt vh-adlc's own host state from "filesystem unchanged".

FINDING: F-22
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Temp root and Stackweaver adoption
EVIDENCE: Lines 315-317 and 472 have Stackweaver's build and test entry points take their environment from `vh-adlc env --sh`. The design says nothing about where the binary is absent, such as CI, other contributors or self-hosters, or about a repository with a manifest but no `temp_root`. Stackweaver's product goal treats a plain install as first class, and its CI runs on GitHub Actions. An unguarded call breaks those paths, and a silent fallback puts leftovers back in `/tmp` unnoticed.
PROPOSAL: State the fallback for a missing binary and for no `temp_root`, and add that case to the Stackweaver adoption scope with a proof.

FINDING: F-23
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-13
EVIDENCE: AC-13 requires bytes freed to "match the measured change in `/tmp` usage and `docker system df` within the stated image-size bound". That bound covers images only, and nothing is stated for files or volumes. This host runs concurrent sessions: `/tmp` went from 18M in the document to 38M and Docker from 300 to 305 images during the day, so the comparison cannot be exact. The standard also warns against a criterion that measures rather than states an end state.
PROPOSAL: State the end state as the fixture rows being gone or kept. Compare bytes only against stand-ins of known size in an isolated temp base and on disposable engine objects, with a stated tolerance.

FINDING: F-24
KIND: judgement
SEVERITY: nit
WHERE: Design, Where the rules come from step 2
EVIDENCE: Step 2 removes "every `GIT_*` variable", which also drops `GIT_TERMINAL_PROMPT=0`, and no timeout is stated for `ls-remote` or the fetch. A remote that waits on credentials or a host key can hold `clean.lock` and turn every other run into `busy`.
PROPOSAL: Set `GIT_TERMINAL_PROMPT=0` after clearing the environment and give each remote step a context timeout.

FINDING: F-25
KIND: factual
SEVERITY: nit
WHERE: Plan summary; Scope; Report; fixture table
EVIDENCE: Line 33 says "one allow rule per harness" while Permission rules gives two allow rules and a deny rule. Line 183 says the report counts pruning leftovers, including the build cache and dangling images, but line 433 lists only `/tmp` entries, anonymous volumes and stopped containers. The fixture row "As declared" gives AC-12 nothing to check, and the `stackweaver-visuals-*` row omits the age and not-in-use conditions other rows state.
PROPOSAL: Align these statements and replace "As declared" with the required outcome for each named pattern.

FINDING: F-26
KIND: factual
SEVERITY: nit
WHERE: Stackweaver adoption
EVIDENCE: Line 473 gives vh-adlc's manifest "the `vh-*` test fixtures". `vh-` has three literal characters, so line 367 refuses that glob, and it also matches the reserved temp base `vh-adlc-<uid>` under line 370. The tests use over 20 distinct `vh-` prefixes (`vh-maintenance-`, `vh-lifecycle-`, `vh-feature-review-`) plus `triage-*`, `maintenance-*` and `quiet-*` names.
PROPOSAL: List the real prefixes in the manifest, or move the tests under a single four-character prefix that does not match the temp base.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Scope; Acceptance Criteria, AC-11, AC-12, AC-13 and AC-19; Test Plan
EVIDENCE: `docs/specs/settings-reader.md:22-23`: "A lock can name only a stable release, which comes from `main` ... so this has to merge and publish before the plugin can use it." `docs/internal/releasing.md:16-17` gives stable tags on `main` and only prereleases on a feature branch, and `tests/vh-adlc/check.test.ts:385` requires `^\d+\.\d+\.\d+$` in the lock. `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:17-18,39-42,66` runs `gate complete` on the feature branch and never merges, tags or releases. The `complete` gate needs `all_met` and `impl_review_clean`. So AC-19 cannot be met before the merge it must precede. The same holds for AC-12 and AC-13: `clean` reads only `origin/<default>` (lines 145-147), so vh-adlc's manifest and the `go-build*` row count only after merge. The AC-11 install also comes from the lock (line 196). The design gives no sequence, and `issue: null` leaves no tracker for a residual. The Test Plan proof for AC-19, `bun test tests/vh-adlc`, checks only the lock's shape (`check.test.ts:380-391`), so it does not show that the release has `env` and `clean`.
PROPOSAL: Split this as settings-reader and yaml-settings were split: a first feature ships `env`, `clean` and the manifest parser to `main` and a stable release, and a second carries the lock bump, operation, rules and adoption. Otherwise record which criteria close after merge, and give AC-19 a proof that runs the locked binary's `env` and `clean`.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design, kind and firewall; AC-08; adoption table
EVIDENCE: Line 184: "Without `--firewall`, a network with a firewall rule is kept as `firewall-chain-pending`". The binary cannot observe that without the privileged container. As uid 1000 here, `iptables -S` printed "Permission denied (you must be root)" and `nft list tables` printed "Operation not permitted (you must be root)". The chain name is a hash, and a jobs network carries only `LabelManaged` (`network.go:140` at `96eaff82`), so no label or name marks it. Either every network of a manifest with `firewall:` is held, or `clean` runs the container that line 172 makes opt-in. Under the first reading, the row "Docker objects with a live `test-run` mark ... removed after" (line 218) and AC-03 fail for networks on any run without `--firewall`, which the operation does not pass unless the user names it.
PROPOSAL: Define the test the binary applies, for example a rule field or label that declares a network firewalled, or state that every matched network of such a manifest waits for `--firewall`. Align row 218 and AC-03 with that choice, and add a case for a plain network without a chain.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Design, What clean will and will not touch; AC-03; Test Plan
EVIDENCE: Lines 157-159 check "a same-uid process's `cwd`, `exe`, open file or mapping" and exempt only "Other users' processes". Line 163: "A failed check counts as live." Reading `/proc` for the 87 uid-1000 processes here, 6 failed with PermissionError: `systemd` and `(sd-pam)` (`cwd`, `exe`, `maps`, and `fd` for `(sd-pam)`), `sshd-session` (all four), and 3 `firefox` processes (`fd`). Taken literally, one such process makes the check fail for every entry, so nothing is ever removed on this host, and AC-03 cannot pass. If they are skipped instead, the stated limit is wrong, because those firefox processes are the user's own and can hold files in a `/tmp` entry. R-1 F-03 raised this for other uids, and the same shape remains for the same uid. The Test Plan has no unreadable-entry case, and a process that exits during the scan is not defined either.
PROPOSAL: State that an unreadable same-uid process is treated like another user's process, leaving age as the only protection, and that a vanished pid is not a failed check. Add both as cases in the fake-`/proc` table test.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, kind and firewall; AC-02; AC-12
EVIDENCE: AC-02: `--dry-run` "reports every declared, abandoned resource ... and changes nothing". AC-12 needs a dry run to classify the row "`SW-JOBS-*` chains of removed networks, using `--firewall`" (line 224). Chains can be listed only from the host-network `NET_ADMIN` container (lines 181-183 and the output in F-02), which creates a container and may pull an image. The design does not say whether a dry run starts it, so AC-02 and AC-12 cannot both hold as written.
PROPOSAL: State that a `--firewall` dry run starts the listing container and removes nothing, and narrow AC-02 to allow that one container. Otherwise state that a dry run reports chains as unknown and change AC-12.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, kind and firewall; AC-08; R-1 findings table
EVIDENCE: Line 180 defines the match as the prefix plus eight hex characters, and AC-08 says "An orphan chain goes". `FirewallScript` also creates `chain + "-IN"` jumped from INPUT (`network.go:284` at `96eaff82`), which that form does not match. Stackweaver's own removal (`removeFirewallChains`, `container_integration_test.go:741`) first deletes the jumps from DOCKER-USER and INPUT, then flushes and deletes both chains, then deletes the table in both `inet` and `bridge`. The design mentions neither jumps, `-IN`, ip6tables nor the two families, and `iptables -X` needs the jumps gone first. So AC-08 can pass while the `-IN` chain and its INPUT jump stay, and that jump rejects by source subnet, which a later network can reuse. Line 236 lists R-1 F-14 as applied, but its proposal to name both nft families and ip6tables and to add a Test Plan case for a network created during the run is not in the text. `/usr/bin/podman` is installed, and the removal of `engines` leaves a rootful Podman network's table reading as an orphan.
PROPOSAL: Specify what the fixed script removes, in order: jumps, both chains, ip6tables and both nft families, and how the suffix is declared. Add these and the created-during-run case to AC-08's proof, and state the Podman limit.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Manifest; adoption table
EVIDENCE: The example rule (lines 116-120) has `match: {sh.stackweaver.managed: "true"}` with `kinds` including `image`. `conformance_integration_test.go:206` builds its image with only `LABEL sh.stackweaver.test-run`, and `buildToolsImage` passes `withTestRun(nil)` (`container_integration_test.go:140`), so neither carries the managed label. `sweepEndedRuns` filters on the test-run label alone. Those images match no rule, and row 218 ("removed after") fails for them. `sw-probe-*` images do carry both labels, so a test using only those would pass.
PROPOSAL: Drop `match` from this rule, or have Stackweaver's adoption add the managed label to both builds, and include a conformance or tools image in the AC-12 stand-ins.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, kind and firewall; Adoption; AC-08
EVIDENCE: Lines 174-177 and 211 give the mark no name and no removal when a run ends normally, and they do not say what happens with several marks on one cluster. `e2e/k8s/run.sh:140` at `96eaff82` reuses an existing cluster. On the engine here, a second `docker volume create --label sh.test.run=b/2 <name>` on an existing volume returned rc=0 and kept `{"sh.test.run":"a/1"}`. A fixed-name mark left by an ended run therefore keeps its ended pid during a new live run, and `clean --kind` stops that live cluster. With per-run names, a cluster can hold an ended and a live mark, and "if two rules disagree, live wins" covers rules, not marks.
PROPOSAL: Specify the mark's name and lifecycle: a per-run name, removal on every harness exit, and a cluster counts as abandoned only when all its marks have ended. Add a reused-cluster case to the Test Plan.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design, Manifest; adoption table
EVIDENCE: Line 133: "An object without the label is not matched." Line 134 uses `com.docker.compose.project.working_dir`. `docker volume inspect swc-7_postgres_data` shows only `config-hash`, `project`, `version` and `volume`, so the working directory is on containers alone. Once a slot's containers are gone (a partial run or `docker rm`), its volumes and networks have no liveness and stay forever. `scripts/compose-slot.sh` `cmd_down` also removes `swc-N-*` images and the state directory; the `compose` rule has no image key, and 8 such image repositories exist here. `cmd_status` lists a slot from that state directory, so a slot `clean` removed still appears. Row 220 says only "removed with its volumes".
PROPOSAL: State that Compose liveness is decided per project from its containers, what a project with no containers gets, and whether built images and project state are removed or left to the project's own teardown.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Design, Commands and Where the rules come from; R-1 findings table
EVIDENCE: Line 236 lists R-1 F-20 as applied. Lines 93-96 give a result only for a dry run, removal success or failure, `running-as-root` and `unsupported-platform`. Nothing maps `manifest-invalid`, `manifest-missing`, `manifest-unmerged`, `engine-unreachable` or `kind-unavailable`, so an applied run that refuses its manifest reads as `pass` because no removal failed. `env` has no result at all, its refusal of a bad base (line 101) has no code, and an invalid `host.yaml` has no code. A failed `git symbolic-ref refs/remotes/origin/HEAD` has no code either, though `/home/m/code/claude-plugins` printed "fatal: ref refs/remotes/origin/HEAD is not a symbolic ref" here. The binary already has `default-branch-unknown` and a no-remote path (`internal/report/codes.go:47`, `internal/fresh/fresh.go:97-118`), and the design neither reuses nor rejects them.
PROPOSAL: Add one table from every finding code to its result, for `clean` and `env`, with codes for temp-base and host-settings refusal. Reuse `default-branch-unknown` and state whether `internal/fresh`'s default-branch resolution applies.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Where the rules come from; Commands; AC-05
EVIDENCE: Lines 147-148: a changed manifest "gets a dry run". AC-05 adds that "an applied run removes only what the default-branch manifest declares". These can be read as an applied run downgraded to a dry run, or as an applied run using the default-branch rules while reporting the change, and the text does not say which rules the dry run uses. A manifest present only on a branch satisfies both `manifest-unmerged` and `manifest-missing` (lines 147-150). `env` reads a project name (lines 87, 100), but line 145 gives the source only for `clean`, so `env` with no manifest, or one only on a branch, is undefined, and that is the state of a Stackweaver adoption branch.
PROPOSAL: State for each case (working-tree change, branch change, branch only) which rules a dry run and an applied run use and what they report. State where `env` reads `project` and what it does with none.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Design, What clean will and will not touch
EVIDENCE: Lines 163-164 keep removing file entries when the socket "is simply absent or refuses, which means no engine is running". That is the only path where a failed engine check allows removal, because the bind-mount check is then skipped. The design never says which socket is read. `docker context ls` here reports "Current DOCKER_HOST based configuration", Stackweaver's tests accept `STACKWEAVER_TEST_ENGINE_SOCKET`, and `/usr/bin/podman` is installed. A binary reading a fixed path while the engine is elsewhere sees "absent" and removes entries a running container has bind-mounted. Permission denied is not classified either, and neither is covered by a criterion or Test Plan row.
PROPOSAL: Resolve the engine as the Docker CLI does and state the order, count permission denied as a failed listing, and add the absent, refused and denied cases to AC-04's proof.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Temp root and Manifest; AC-06
EVIDENCE: The default base `/tmp/vh-adlc-<uid>` is a top-level `/tmp` entry the user owns, and R-1's reserved base is no longer in the text. vh-adlc's manifest must list "its other test prefixes" (line 204), and the tests use `vh-adlc-fixtures-`, `vh-adlc-claude-` and `vh-adlc-golden-` (`tests/vh-adlc/fixtures.test.ts:11`, `tests/vh-adlc/scenarios/host.ts:27`, `cmd/vh-adlc/golden_test.go:28`). A shortened `vh-adlc-*` passes the four-character floor and matches the base, removing every project's idle temp root. `project` has no format rule, so `..` or `.` in `<temp_base>/<project>` escapes or widens the root, and AC-06 does not cover it.
PROPOSAL: Exclude the temp base from `tmp` matching, and require `project` to be a single plain path segment. Add both refusals to AC-06.

FINDING: F-13
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria; Test Plan
EVIDENCE: Several behaviours the design states have no criterion or proof row: `--older-than` "can only raise a rule's age" (line 91, raised in R-1 F-21 and still uncovered), `manifest-missing` removing nothing (line 150), `kind-unavailable` (line 177), and `--sh` printing nothing to stdout on failure (lines 88-89). `--sh` output is what the Stackweaver entry points consume, and line 235 records F-21 only as "Criteria reduced with the scope".
PROPOSAL: Add criteria and Test Plan rows for these four, or remove the behaviours from the design.

FINDING: F-14
KIND: judgement
SEVERITY: nit
WHERE: Design, Manifest; AC-03
EVIDENCE: Line 136 and AC-03 use an age, but nothing says what it is measured from. A directory's mtime does not change when a nested file is written, so a tree in active use can read as old. An extracted tree with preserved times reads as old too. The in-use check sees only open files, not a process between writes.
PROPOSAL: Define age, for example as the newest mtime in the entry, and add a table case with a recent nested file.

FINDING: F-15
KIND: factual
SEVERITY: nit
WHERE: Design, Operation and allow rules
EVIDENCE: Line 199 gives the Claude Code setting as `"allow": ["Bash(vh-adlc clean *)"]` in `~/.claude/settings.json` with no `permissions` object, so copied as written it does not sit where allow rules are read. The rule pattern itself is correct: the permissions page says a trailing ` *` also matches the bare command.
PROPOSAL: Show the rule inside `"permissions": {"allow": [...]}`, since AC-14 has the guides document it.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria, AC-12 and AC-13; Design, Adoption table; Test Plan
EVIDENCE: AC-12 says "a dry run on this host classifies every row of the adoption table as required", and AC-13 says "After that applied run, the removable rows are gone and every kept row is present". Lines 247-248 need `sw-e2e` to be ended (deleted), live and unmarked (both untouched). The manifest names one literal `cluster: sw-e2e` (line 125), `e2e/k8s/run.sh:14` at `96eaff82` fixes that name, and an engine holds one cluster of that name, so one run cannot show these states. Line 243 needs networks "Reported as `firewall-chain-pending`" and also "removed with `--firewall`", which are two different invocations, and lines 247 and 249 need the flags. A single run with `--firewall --kind` never exercises the pending row, and one without them never exercises the kind and chain rows. An implementation review must return `not met` for AC-12 and AC-13 as written. Test Plan line 315 repeats the single sequence: "save the dry-run report, owner review, apply".
PROPOSAL: Restate AC-12 and AC-13 as a named sequence of runs, one per mutually exclusive state, each with its flags, and record the outcome per row. Change the Test Plan row to match.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, kind and firewall
EVIDENCE: Line 197: `clean` "runs one short-lived host-network `NET_ADMIN` container". Line 199: "The script lists chains and tables first and networks second". The design gives that container host network and `NET_ADMIN` and no engine socket, so the script cannot list Docker networks. Stackweaver's writer is a one-shot `sh -c script` whose result is its exit code (`runFirewall`, `network.go:469` at `96eaff82`). If the binary lists networks and hands them to the script, networks come first, which is the race line 199 exists to prevent. If the binary lists chains from one container, lists networks, then deletes from a second, that is two containers, not the "one" of line 197. Mounting the socket into a `NET_ADMIN` container is a new privilege the design does not state.
PROPOSAL: State the mechanism: a listing container whose output the binary reads, then the binary's network listing through the engine API, then a separate delete container given the exact names. Keep the socket out of the container and correct "one".

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, kind and firewall; AC-02, AC-08, AC-12
EVIDENCE: Lines 205-206 claim "`clean` therefore never creates orphan chains". Nothing orders network removal against the firewall step on a `--firewall` run. If networks go first and the firewall listing then fails, the chains of removed networks are orphans, which line 206 denies and "Any failed listing removes nothing" leaves in place. If chains are scanned first, the chains of networks removed in this run still hash to a network and survive to a later run, so "An orphan chain goes" fails for row 249. If the scan treats planned removals as gone, a network that stays because a container uses it (line 173) loses its chain, which AC-08 forbids ("a live network's objects stay"). A dry run removes no network, so its listing shows those chains as live, and AC-02's "every declared, abandoned resource" and AC-12's chain row do not hold unless the plan predicts them.
PROPOSAL: Specify the sequence: a listing preflight that holds all network removal if it fails, then network removal, then a chain pass that only sees networks actually gone. State how a dry run reports the chains of planned network removals, and add a case for a network kept in use.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Manifest, kind and firewall, and Adoption; AC-02
EVIDENCE: Line 127 is a placeholder, `ghcr.io/example/tools@sha256:<64 hex>`, and Adoption (lines 226-233) names no real image for Stackweaver, though AC-12 and AC-13 run its manifest with `--firewall`. Stackweaver's own sweep uses a locally built `sw-tools-*` tag (`leftovers_integration_test.go` at `96eaff82`, `buildToolsImage` in `container_integration_test.go`), which has no stable digest across hosts. `network.go` requires `nft` in the image, and the listing needs iptables, ip6tables and nft together. The design does not say whether `clean` pulls. If it does, a dry run leaves an image behind, which AC-02's exception ("the short-lived listing container") does not allow, and a private image needs registry auth. If it does not, a missing image is a failed listing and `--firewall` can never remove anything on that host.
PROPOSAL: Name the published image and digest Stackweaver's manifest will use, and check that it holds all three tools. State whether `clean` pulls, and widen AC-02 to match if it does.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, kind and firewall; Adoption; AC-08
EVIDENCE: Line 189: "A cluster with no mark is never touched, which is how a harness keeps one for debugging." Lines 190-191 and 233 have each run remove only its own mark, and a cluster is abandoned when all its marks have ended. `e2e/k8s/run.sh:140` at `96eaff82` reuses an existing cluster. Take run A killed (its ended mark stays), then run B with `KEEP_CLUSTER=1` reusing the cluster. B removes its own mark on exit, leaving only A's ended mark, so `clean --kind` deletes the cluster B kept for debugging. Likewise, a later run without `KEEP_CLUSTER` deletes the cluster at `run.sh:64-66` but leaves A's mark, which then applies to the next cluster of that name created by hand. The Test Plan's "reused cluster with mixed marks" covers neither case.
PROPOSAL: Have the harness remove every mark of the cluster on exit, or remove ended marks when it starts. State what `clean` does with a mark whose cluster is gone, and add the killed-then-kept sequence to the Test Plan.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Manifest liveness and What clean will and will not touch; AC-03; Test Plan
EVIDENCE: Line 133 reads a mark as ended when `kill(pid, 0)` returns `ESRCH`, and the in-use check reads `/proc`. Inside a PID namespace both are silently wrong rather than failed, so "A failed check counts as live" does not apply. `bwrap --ro-bind / / --dev /dev --unshare-pid --proc /proc bash -c 'kill -0 <live host pid>'` printed "No such process", rc=1, with 4 pids visible. The same call without `--unshare-pid` returned rc=0. `codex sandbox -- bash -c ...` gave pids=5 and the same "No such process", and `~/.codex/config.toml` here has `sandbox_mode = "workspace-write"`. In both, `/var/run/docker.sock` appears owned by `nobody`. I did not try connecting, so a denied socket may stop the run in those two cases, but a sandbox that hides the socket reads as "absent", which line 176 treats as no engine, and file removal then runs with only age as protection. I did not observe whether a Codex `allow` rule leaves the sandbox, and AC-11 does not state it. Nothing in the design or Test Plan covers this.
PROPOSAL: Have `clean` refuse with a new finding code unless it runs in the initial PID namespace, for example `/proc/self/ns/pid` reading `pid:[4026531836]`, as a normal session here does. Add a Test Plan case, and have AC-11 record that the Codex run was not sandboxed.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Manifest and Operation and allow rules; Goal; AC-11, AC-12
EVIDENCE: Lines 147-148 make `go-build*` reachable only by `vh-adlc clean --repo <vh-adlc checkout>`, and line 211 has the operation run `vh-adlc clean --dry-run` with no `--repo`, so it covers the session's own repository. Go builds in every project leave `go-build*`, the Context's count of 22 includes them, and Stackweaver's `CLAUDE.md` tells sessions to run `cd backend && go test` directly, which bypasses the entry points that take `vh-adlc env`. A Stackweaver session blocked on space therefore cannot reach those entries. A session in a repository with no manifest gets `manifest-missing` and frees nothing. With every box ticked, AC-12 still passes, because it runs on a vh-adlc clone, while the operation does not clear this class from the sessions that hit the problem. The goal says "Any agent session".
PROPOSAL: State how the operation chooses the repository, including how it finds a vh-adlc checkout on the host, or state that `go-build*` is cleared only from a named checkout and have `references/clean.md` tell the session to report that. Add this case to AC-11's procedure.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design, Operation and allow rules; AC-11
EVIDENCE: `plugins/vh-adlc/references/loop.md` step 1 has every operation run `ensure-vh-adlc.sh` and "use the path it prints for every later call", and line 9-16 of that page define what to do when the installer fails. Design line 214 names only one exception to the loop, skipping `knowledge`. The skill must instead call bare `vh-adlc clean`, because the printed cache path does not match `Bash(vh-adlc clean *)`, so step 1 is skipped too, and the binary used is not verified against the lock. The design does not say what the skill does when `vh-adlc` is not on `PATH`, which is the state before step 3 of Order, or when the installed binary predates the lock, which `ensure-vh-adlc.sh` tolerates with "ignoring ...".
PROPOSAL: Have the loop exception cover step 1 as well, state that the operation uses the `PATH` binary unverified, and define the report for a missing or older binary.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-23
EVIDENCE: AC-23 has four claims: temp files stay under the temp root, jobs networks are marked, the kind cluster is marked, and entry points run unchanged "Without the binary, or when `env` fails". The proof at line 318 is "run driver tests through the entry point with the candidate binary and without it". Driver tests do not run `e2e/k8s/run.sh`, so the kind mark goes unproved, and removal of that mark on exit, including with `KEEP_CLUSTER=1`, goes unproved too. The `env` failure case has no proof. Under the standard, a passing subset never upgrades a composite criterion.
PROPOSAL: Add a harness run that observes the mark during the run and its removal on exit, and add a run with `env` failing, for example with a refused base.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Design, Where the rules come from; AC-05 proof; Test Plan
EVIDENCE: Lines 153-154 rely on `GIT_NO_LAZY_FETCH=1`, and the Test Plan requires "A missing object in a partial clone must not fetch". `docs/get-started/installation.md:10` says the binary requires "Git 2.35 or newer". Git's release notes first mention `--no-lazy-fetch` in 2.45.0 (`RelNotes/2.45.0.adoc:120`; 2.43.0 and 2.44.0 have no match). On 2.35 to 2.44 the variable is ignored, so the guard is silently absent, and the test passes here only because this host has Git 2.55.0.
PROPOSAL: Raise the stated floor for `clean` to 2.45 and have it refuse on an older Git, or give a way to detect a partial clone and refuse there. Update `docs/reference/compatibility.md` and the installation page to match.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Review Log; frontmatter
EVIDENCE: The pinned `conventions/delivery.md:36-37`: until a document has a `branch` field, "it is committed and pushed to the default branch". This document has no `branch`. `git branch -a --contains 22769c0` lists only local `spec/host-cleanup`, and `git log origin/main..HEAD` has 9 commits. The standard counts an unreachable reviewed commit as stale, so rebasing this branch onto `main` voids this review and any acceptance built on it.
PROPOSAL: Push the document to the default branch at its current content, or get the commit into `main` without rewriting it, before the review the acceptance names.

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Design, kind and firewall; AC-24
EVIDENCE: Lines 192-193 say a missing `kind` reports `kind-unavailable`. AC-24 says a "missing `kind` removes nothing and reports why". The text does not say whether that means the whole run or only the cluster step, and the two give different results for the `/tmp` entries and Docker objects in the same run.
PROPOSAL: State which, and word AC-24 to match.

FINDING: F-13
KIND: factual
SEVERITY: nit
WHERE: Design, Temp root and Manifest; AC-06
EVIDENCE: Line 103 says "`tmp` globs never match the base", which reads as skipping. AC-06 says a glob "matching the temp base" is refused. Lines 142-145 list the refusals and include neither this one nor AC-06's "a Docker rule without liveness". `temp_base` is a per-host setting (line 102), so a refusal makes one manifest valid on one host and invalid on another.
PROPOSAL: Choose skip or refuse, list every refusal in Design, and say which base a glob is checked against.

FINDING: F-14
KIND: judgement
SEVERITY: nit
WHERE: Design, Commands and Manifest; AC-24
EVIDENCE: `--older-than` "can only raise a rule's age" (line 91), but `docker`, `compose`, `kind` and `firewall` rules have no age, so the flag's effect on them is undefined. The manifest section does not say which keys are required, and `env` with a manifest that has no `temp_root` is undefined, which R-1 F-22 asked about.
PROPOSAL: State that `--older-than` applies only to `tmp` and `temp_root` rules. State whether `temp_root` is required, and what `env` reports when it is absent.

FINDING: F-15
KIND: judgement
SEVERITY: nit
WHERE: Design, Adoption and adoption table
EVIDENCE: `e2e/k8s/run.sh:171` at `96eaff82` starts a `registry:2` container on the `kind` network with `-v "$CERT_DIR/registry:/auth:ro"`, and `CERT_DIR` comes from `mktemp -d`. A killed run leaves that container, which `kind delete cluster` does not remove and which carries no mark, so no rule matches it. After adoption, `CERT_DIR` sits in the temp root, and the bind mount keeps that entry in use until the next harness run removes the container at line 170.
PROPOSAL: Have the harness put its run mark on the registry container and add a `docker` rule for that label, or add it to the untouched row so the gap is explicit.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-12; Design, Adoption sequence
EVIDENCE: AC-12 (line 260): "Run 1 of the real-host sequence reports every row of the adoption table as required". Design line 215 defines run 1 as `clean --dry-run` where "every row without `--kind` reports its outcome", and the table's last row (line 228) is "kind `sw-e2e`, using `--kind`". So the criterion asks run 1 for a row it cannot report, and the standard's composite rule makes that `not met` as written. This is what remains of R-3 F-01. Lines 212-217 also use two disposable clones but name no `--repo`, and `clean` takes one repository per run, so the sequence does not say which run covers which rows.
PROPOSAL: Change AC-12 to "every row without `--kind`", matching line 215. State which clone each run targets, or that each run happens once per clone.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Adoption and adoption table
EVIDENCE: At Stackweaver `cc2cbbed`, `backend/internal/launcher/driver/container.go:295` creates the per-job executor volume with only `LabelManaged` and `LabelJob`, so it has no `test-run` label. `:182` records its name on the container in `sh.stackweaver.executor-volume`, and `removeContainer` (`:460-468`) deletes it from that label. `sweepEndedRuns` calls `d.removeContainer`, so today the sweep clears it. After adoption, `clean` removes the ended container first (line 223). The volume is named, so `anonymous_volumes` does not take it (Sources: `docker container rm --volumes` keeps named volumes). No rule matches it, and the sweep has lost the only pointer to it. `clean` therefore turns a leftover the sweep clears into a permanent one. The sweep also finds unlabelled `sw-test-*` networks through ended containers' `NetworkSettings.Networks`, and `clean` removes that link too. Lines 204-210 present the two tools as not conflicting.
PROPOSAL: Have Stackweaver's adoption put the run's mark on the executor volume, for example from `Request.Labels`, and add a stand-in row to the adoption table. Otherwise leave containers to the sweep and say so.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-11; Test Plan, AC-11; Goal
EVIDENCE: AC-11 proves "a Codex session that is not sandboxed". `~/.codex/config.toml:6` here is `sandbox_mode = "workspace-write"`, so the session the owner actually runs is the unproved one. Line 85 refuses `clean` with `pid-namespace` inside a PID namespace, and Context line 57 records `codex sandbox` as one. The Codex rules page the document cites says "allow: Run the command outside the sandbox without prompting", which suggests the rule may make the default session work, but nothing proves it and Sources cites that page only for syntax. With every box ticked, a default Codex session may still get `pid-namespace`, and the goal says "Any agent session".
PROPOSAL: Run AC-11's Codex case in a default `workspace-write` session and require that `clean` runs without `pid-namespace`. If it does not, state that limit in Design and keep the current wording.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Scope; Open Questions
EVIDENCE: Lines 66-67: "the coordinator's decision on 2026-11-02, overriding the owner's earlier answer to keep a `--firewall` option." The draft's Q7 (`git show 4b32379:docs/specs/host-cleanup.md`, line 532 onward) said "Why this is yours", and the document at `22769c0` still carried `--firewall` as the owner's answer. The standard says "Only the owner answers them", and "None." under Open Questions means every question has been answered. The owner's general direction that day was to cut oversized designs, which may cover this, but no owner statement on this reversal is in the document or Git. The cost is also real: firewall objects of `stackweaver-jobs-slot-*` networks and of removed networks now last until a reboot (lines 208-210).
PROPOSAL: Name this reversal and its cost explicitly when asking for acceptance, and record the owner's answer in Scope in place of "coordinator's decision". If the owner wants it kept, reopen it as a question.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, Commands and What clean will and will not touch
EVIDENCE: Lines 89-91 make `temp-root-undeclared` a failure, but line 96's list of `fail` codes omits it. Line 97 makes `manifest-missing` a note, so `env` in a repository with no manifest, which R-2 F-10 asked about, reports `pass` with no `project` to name a root, and what `--sh` prints is undefined. Most repositories start in that state, and AC-23's proof covers only a refused base. Separately, line 165 continues file work when the socket is absent or refuses, but no code or result is given for that case: if it reports `engine-unreachable`, line 96 makes every applied run on a Docker-free host `fail`. Line 96 also does not say whether `temp-base-refused` or `host-settings-invalid` stops `clean`'s other work, though without a known base the `tmp` skip at line 104 cannot be applied.
PROPOSAL: State that `env` with no working-tree manifest fails, with `manifest-missing`, and add `temp-root-undeclared` to the `fail` list. Give the absent-socket case its own note, and say what `clean` does after each of the two host-level failures.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Scope; Acceptance Criteria; Adoption table
EVIDENCE: Scope line 63 includes "vh-adlc's own manifest", and Context names over 100 `vh-triage-*` entries from this repository. Line 212 uses this branch's manifest in the sequence, yet the table (lines 219-228) has no `vh-triage-*` row, and no criterion mentions the manifest. With every box ticked, `.vh-adlc/cleanup.yaml` could be missing or match nothing, and this repository's own recurring leftover would survive.
PROPOSAL: Add a table row for `/tmp/vh-triage-*` and the other declared prefixes, required removed once older than their age and not in use, so AC-12 covers it.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Design, Adoption and Order; Test Plan, AC-23
EVIDENCE: Everything Stackweaver's manifest and AC-23's driver proof rely on is unmerged. On Stackweaver `main`, `git cat-file -e main:backend/internal/launcher/driver/container.go` and the same for `scripts/compose-slot.sh` both fail, and `git grep -c sh.stackweaver.test-run main -- backend` finds nothing. They exist on `feat/runner-architecture`, whose PR #1002 is open (`gh pr list --head feat/runner-architecture`). The document cites that branch for the sweep, but Scope's "reviewed Stackweaver adoption branch" and Order step 4 name no base and no dependency on that PR.
PROPOSAL: State that the adoption branch is based on `feat/runner-architecture` and that step 4 follows PR #1002, or give the order if the adoption must land first.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-03; Test Plan
EVIDENCE: Line 165 says "If the engine cannot be listed, no file entry is removed either". That rule is the only protection for a `/tmp` entry a running container has bind-mounted when the engine cannot be read, and no criterion states it. AC-03 says only that "an object in use, or whose usage cannot be listed, stays", which is about engine objects. The Test Plan lists "failed listings, and an absent, refused and denied socket" against AC-02, AC-03 and AC-08, so the cases run with no end state to check against. `host-settings-invalid` has neither a criterion nor a proof row.
PROPOSAL: Add to AC-03 that with a denied or failed engine listing no file entry is removed, and that with an absent or refused socket file entries are still removed. Add the invalid `host.yaml` case to AC-01 or AC-24 and its proof.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Review Log; frontmatter
EVIDENCE: This repeats R-3 F-11. The status line says R-3's findings were applied, but `git ls-remote origin main spec/host-cleanup` returns only `refs/heads/main` at `c8343c5`, `git branch -a --contains d225d01` lists only local `spec/host-cleanup`, and `git log origin/main..HEAD` has 11 commits. The document has no `branch`, and the pinned `conventions/delivery.md:36-37` says such a document is committed and pushed to the default branch. Local `main` (`930541c`) does not contain `origin/main`, so a rebase of this branch to land it is a live risk, and a rebase would make this review's commit unreachable.
PROPOSAL: Fast-forward `origin/main` to this branch's commit, which is possible today, before the review the acceptance names. Do not rebase it.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Frontmatter goal; Design, Manifest
EVIDENCE: The goal says the command "touches only what that repository's default branch says it owns". Lines 140-141 and AC-24 have the binary remove `go-build*` and `gopls-tempmod*` in every run, "including in a repository with no manifest".
PROPOSAL: Add the binary's built-in Go temp globs to the goal.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Design, What clean will and will not touch and kind; AC-03
EVIDENCE: Line 162 says "It never forces a Docker removal" and AC-03 says "No Docker removal is forced", while line 178 runs `kind delete cluster`, and Sources records that it runs `docker rm -f -v`. The nodes are stopped first, so the effect is harmless, but the sentences are false as written, and the fake engine's force check cannot see kind's own CLI calls.
PROPOSAL: Name `kind delete cluster` on already stopped nodes as the one exception, in Design and AC-03.

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Design, Commands and What clean will and will not touch
EVIDENCE: Line 86: "That also covers a sandbox that hides the engine socket." It covers only a sandbox with a PID namespace; one that hides the socket without one reads as "absent" at line 165, leaving age as the only protection. Line 166 falls back to `/var/run/docker.sock` when `DOCKER_HOST` is `tcp://` or `ssh://`, or a Docker context points elsewhere, so a running remote or relocated engine also reads as no engine.
PROPOSAL: Narrow line 86 to PID-namespace sandboxes and state the non-`unix://` case as a limit in line 166, or treat it as a failed listing.

FINDING: F-13
KIND: judgement
SEVERITY: nit
WHERE: Design, Manifest; AC-06
EVIDENCE: Lines 135-138 list the refusals. Not listed: a `schema_version` other than 1, an unknown value in `kinds`, a `kind` rule without liveness, and a glob holding a path separator. `../home/m/x*` has four literal characters, so it passes the floor; it is harmless only if matching is done on directory entry names, which the design implies but does not state. AC-06 covers only what Design lists.
PROPOSAL: Add these four to the refusal list, and state that globs match single top-level names.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Operation and allow rules; frontmatter covers; Open Questions
EVIDENCE: Lines 189-190 have the operation apply the plan "when the user asked for cleanup or the session is blocked on space", so an agent can apply with no request from anyone. An applied run can stop a Compose slot and remove its named volumes (lines 126, 231). `plugins/vh-adlc/references/authority.md:25` says "Destructive Git or data operations, history rewrites, credential changes | Separate approval for that exact action", and the paragraph after the table says "Host approval cannot supply missing task authority". So the allow rule cannot grant this. `authority.md` is not in `covers`, the Design, any criterion or the Test Plan. Stackweaver `CLAUDE.md:146` says to remove named volumes individually and "ask first, naming the exact volume", and `loop.md:57` says local instructions win over central pages and that conflicts are reported. Its slot tool does remove them on request (`scripts/compose-slot.sh down N`), so the conflict there is about an unrequested run. A session that follows the shipped authority page must stop when it is only blocked on space, while the Design and AC-11 ("with no prompt") say it proceeds. The first draft (`4b32379`) already had this line, but the owner decisions folded at `a842b58` do not cover it. Open Questions "None." therefore does not hold for it.
PROPOSAL: Get the owner's decision on what an unrequested apply may remove, for example file entries only with Compose volumes held back unless the user asked. Record it in Design, add the matching row to `authority.md`, add that path to `covers`, and add the case to AC-11's procedure.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Temp root; AC-24
EVIDENCE: Lines 105-107 place the root at `<temp_base>/<project>`, and the only checks on `temp_base` are "symlinked or foreign". Line 159 has `clean` act on entries inside that root, and the Scope exclusion "directories outside `/tmp` and the temp root" follows wherever the setting points. `temp_base: /home/m/code` with `project: stackweaver` gives `/home/m/code/stackweaver`, the main checkout, which the user owns and which is not a symlink. Every top-level entry older than `max_age` and not in use is then removed, through a command the allow rule runs unprompted. The stated threat is accidents (line 77). Nothing says what makes `host.yaml` invalid beyond existing, so AC-24's "invalid `host.yaml`" has no content for this field. A relative path or `~/tmp` is undefined, and nothing says `--sh` quotes a value that goes to `eval`.
PROPOSAL: Define a valid `temp_base`: absolute, not a parent of or inside a Git work tree or `$HOME` itself, and refused with `host-settings-invalid` otherwise. Have `clean` act only on a root with mode 0700 owned by the user, state that `--sh` shell-quotes its values, and add these cases to AC-24.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Commands; AC-06
EVIDENCE: Line 99-100 lists `env`'s failures as `manifest-missing`, `temp-root-undeclared`, `temp-base-refused` or `host-settings-invalid`, with no `manifest-invalid`. Line 108 has `env` read the working-tree manifest, and that path has no default-branch step before it. The refusal of a `project` that is not one plain path segment (line 141) is what keeps `<temp_base>/<project>` inside the base, and `env` creates that directory. AC-06 only says the manifest's "rules remove nothing", which `env` satisfies while still creating a directory for `project: ../x`. The result of a successful `env` is also unstated: lines 96-98 cover refusals, dry runs and applied runs only.
PROPOSAL: Add `manifest-invalid` to `env`'s failures, name its result on success, and extend AC-06 to say `env` creates nothing for a refused manifest.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context; Scope; Goal
EVIDENCE: Context says `/tmp` held 9252M across 4152 entries and names the classes the design covers. The first draft (`git show 4b32379:docs/specs/host-cleanup.md`, lines 41-52) gives their sizes: 2 x 454 MB, 22 `go-build*` with the three largest at 145, 134 and 108 MB, and seven `stackweaver-visuals-*` at about 94 MB. That bounds them at 908 + 2439 + 658 = 4005 MB, 43% of the measured use, and the real figure is lower. The named classes plus the 105 `vh-triage-*` entries are 136 of 4152 entries. The same draft names `crossplane-docs-tools` (279 MB) and `stack-triage-rehearsal-*` (175 MB), which belong to repositories with no manifest in Scope. What held the other 5.2G or more was never identified, and the reboot cleared it. `clean` is also per repository, and line 175 reports only what was removed and kept, so an unmatched entry is invisible. With every box ticked, a session at the quota can free under half of it and get no sign of what holds the rest. R-1 F-25 pointed at the earlier counts of unmatched leftovers, and that report was cut.
PROPOSAL: State in Context that the named classes account for at most 43% and the rest is unknown. Add to the report the count and total size of user-owned `/tmp` entries no rule matched, removing nothing, so the next incident can be attributed from the report.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Manifest and What clean will and will not touch; AC-03; Test Plan
EVIDENCE: Since R-4, line 210 says "Stackweaver's manifest has no `docker` rules", and line 204 limits vh-adlc's manifest to `/tmp` prefixes. So the `docker:` section (lines 121-124), `kinds`, `anonymous_volumes`, image removal and rule disagreement for those objects have no consumer. The real-host table (lines 227-234) has no row that uses a `docker` rule, and AC-12 never runs one. Only the fake engine and an integration test would. The `conventions/coding.md` Scope and structure section says "Make the smallest change that satisfies the request". Compose and kind need only part of this: containers, networks and volumes by project label, and marks. The `pid` liveness kind stays because `kind` uses it, and the `path` kind stays for Compose only as a fixed rule.
PROPOSAL: Remove the `docker` rule type from v1 and narrow AC-03 and the Test Plan to `compose` and `kind`, leaving `schema_version` to add it later. If it stays, name the consumer and add a real-host row.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Adoption; AC-23; Test Plan, AC-23
EVIDENCE: Line 108 says "A project's entry points take their environment from `env --sh`", line 207 repeats it for Stackweaver, and AC-23 says "its entry points run unchanged", but no entry point is named. At `cc2cbbed` the candidates include the `Makefile` targets `test`, `test-integration` and `verify`, `e2e/k8s/run.sh`, `e2e/k8s/driver-conformance.sh` and `scripts/docs-visuals/index.js:92`, which is the source of `stackweaver-visuals-*`. Stackweaver's `CLAUDE.md` tells sessions to run `cd backend && go test` directly, and `scripts/tfe-compat/run.sh:70` hard-codes `/tmp`. The AC-23 proof says "driver tests through the entry point", so wiring one target ticks the criterion while `TestConformance_*` runs from any other path still land in `/tmp`. An implementation review cannot decide "its entry points" from the text.
PROPOSAL: List the exact Stackweaver entry points that adopt `env`, including the one that runs `TestConformance_*`, in Adoption and in AC-23. State that a direct `go test` stays outside and relies on the `tmp` globs.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-11; Goal; Design, Operation and allow rules
EVIDENCE: AC-11 now ends "If `clean` refuses with `pid-namespace` in the Codex session, that is a stated limit recorded in the evidence, not a failure here." `~/.codex/config.toml:6` is `sandbox_mode = "workspace-write"`, and Context records that sandbox as a PID namespace. I repeated the namespace effect with `bwrap --unshare-pid`: `kill -0` on a live pid printed "No such process", and `/proc/self/ns/pid` read `pid:[4026535966]`, not the `pid:[4026531836]` of a normal session here. So AC-11 can tick while the owner's default Codex session frees nothing, which leaves a Scope item ("for Claude Code and Codex, one allow rule each") as a rule that reaches only a refusal. The goal still says "Any agent session". The limit is not stated in Design, and lines 189-193 give the operation a report only for a missing binary, not for this refusal. The outcome is not recorded, though one disposable session would settle it before the design is accepted.
PROPOSAL: Run one default Codex session with the rule now and record the result in Context. Then either drop the escape clause, or state the limit in the Goal and Design and say what the operation tells the user, such as running the command in a terminal.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-07
EVIDENCE: The AC-07 row proves root, PID namespace, platform and Git version only through "injected uid, platform, PID namespace, Git version". The PID namespace refusal exists because `kill` and `/proc` give wrong answers without failing (line 85), so a mistake in reading `/proc/self/ns/pid` would turn ended-run decisions on live objects into removals. An injected value never runs that read. The AC-18 proof already uses Bubblewrap and deliberately avoids a new PID namespace, and `.github/workflows/ci.yml:36-38` sets up `bwrap` for CI.
PROPOSAL: Add a `cmd/vh-adlc` test that runs the real binary under `bwrap --unshare-pid` and asserts `pid-namespace` with nothing removed.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Review Log; frontmatter status_description
EVIDENCE: This repeats R-3 F-11 and R-4 F-09. `status_description` says "R-4 findings applied", but `git ls-remote origin main spec/host-cleanup` returns only `refs/heads/main` at `c8343c5`, `git branch -a --contains HEAD` lists only local `spec/host-cleanup`, and `git log origin/main..HEAD` has 15 commits. The document has no `branch`, and `conventions/delivery.md` says such a document is "committed and pushed to the default branch". `origin/main` is still an ancestor of HEAD, so a fast-forward works today. Local `main` at `930541c` is not an ancestor of HEAD (`git log HEAD..main` lists commits, including a merge), so landing through local `main` invites a rebase, which would make every reviewed commit in this log unreachable and stale.
PROPOSAL: Fast-forward `origin/main` to the commit this review covers without rebasing, or correct the status line and state why it waits.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: Lines 46-48 say `sweepEndedRuns` "never forces a removal". At Stackweaver `cc2cbbed` it calls `d.removeContainer`, which calls `engine.remove`, and `backend/internal/launcher/driver/engineapi.go:287` sends `url.Values{"force": {"1"}, "v": {"1"}}`. The sweep's comment holds for networks, volumes and images only. The sentence is used as the model for this design's own never-forced rule.
PROPOSAL: Write that it forces no removal of a network, volume or image.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Design, Manifest; What clean will and will not touch
EVIDENCE: Lines 134-136 say a Compose project with no containers left "is not matched and stays". Line 167 removes containers first, then networks and volumes. If a volume removal fails or the volume is in use on the first run, `removal-failed` is reported once, and every later run finds no containers and no liveness, so that run's own remainder is never retried. The Test Plan has no such case.
PROPOSAL: State this as a limit, or keep one container until its project's networks and volumes are gone.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Design, Operation and allow rules; Order
EVIDENCE: Line 193 covers only a missing binary. Running the locked 0.1.0 binary as `clean --dry-run` returned result `usage`, exit 2, with "unknown command \"clean\"". Order merges the skill at step 1 and moves the lock at step 2, and the documented install at line 196 prints the locked binary, so between those steps it installs one with no `clean`. R-3 F-08 asked for the older-binary case.
PROPOSAL: Have the operation treat that `usage` result like a missing binary, with the same one line, and say the install step needs the lock from Order step 2.

FINDING: F-13
KIND: factual
SEVERITY: nit
WHERE: Sources; frontmatter covers
EVIDENCE: Line 56 cites Git's "release notes" for the 2.45 floor, and Sources does not list them, while the standard says Sources lists every external page read. `covers` omits `internal/gitcmd/`, which holds `MinMinor = 35` and a `TooOldError` message fixed to that value, and which line 150's calls run through, so a 2.45 check for `clean` touches or depends on it.
PROPOSAL: Add the Git release notes page to Sources and `internal/gitcmd/` to `covers`.

FINDING: F-14
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-12; Design, Adoption table
EVIDENCE: AC-12 says run 1 "reports every row without `--kind` as required". The rows at lines 232-233 require "Untouched" for objects no rule matches, and line 175 and AC-02 report only declared resources, so run 1 says nothing about them. A review must read absence as a report. AC-06 covers only what Design lists, and lines 139-141 name unknown values in `kinds` but not in `liveness.kind`.
PROPOSAL: Say that an untouched row passes by appearing in no removal or stop in the report, and add an unknown `liveness.kind` to the refusals.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Manifest; AC-08; Test Plan
EVIDENCE: Line 135 says Compose liveness is "decided per project from its containers'" `working_dir`, and line 134 says an object is abandoned "when that path is gone". Neither says what happens when a project's containers disagree, and they can. Stackweaver's `scripts/compose-slot.sh` at `cc2cbbed` documents the flow: "`up` from checkout A, create work, then from checkout B `up N --upgrade`: same project, same volumes", and `--checkout DIR` is for "a worktree of an older release". Its last step is `dc up -d --build --remove-orphans`, with no `--force-recreate`. I ran a two-service project on this host's `docker compose` with `--project-directory A`, then again with `--project-directory B`. The service with a relative bind mount was recreated with label B. The service with no mount stayed `Up` with label A: `hcrev-t-1 .../B`, `hcrev-s-1 .../A`. `swc-7-redis` and `swc-7-frontend` have no mounts here. So after an upgrade, once the old worktree A is removed, a live slot holds one label whose path is gone and others whose path exists. A binary that reads any container, or the first one, calls that slot abandoned. It then stops the slot and removes `swc-N_postgres_data` and its other named volumes. "A failed check counts as live" does not apply, because the check succeeds. AC-08's "one with its working directory present stays" does not decide a mixed project, and the fake-engine row has no such case, so every box can tick with this defect in place. The scratch project was removed afterwards.
PROPOSAL: State that a Compose project is abandoned only when the `working_dir` path of every one of its containers is gone. Say so in AC-08 and add a mixed-label project to the fake-engine row.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-07 and AC-18; frontmatter covers
EVIDENCE: Both rows require a `cmd/vh-adlc` test that runs under Bubblewrap. `go test ./...` runs only in the `verify` job, through `michielvha/go-ci-action` (`action.yml:53`), and a search of that action finds no `bwrap`, `bubblewrap` or `apparmor`. Bubblewrap is installed and its AppArmor profile loaded only in the `checker` job (`.github/workflows/ci.yml:36-38`), which runs `bun test tests/vh-adlc`. No Go test uses `bwrap` today (`grep -rn bwrap cmd internal` is empty). So these two tests either fail in `verify`, which gates the release, or skip there, and a skip shows green. R-5 F-08 cited the `checker` lines as if they covered this test. The document does not say which outcome applies, and `.github/workflows/ci.yml` is not in `covers`.
PROPOSAL: Name the CI job that runs these two tests and state that a missing `bwrap` fails that job and does not skip. Move them under `tests/vh-adlc`, or add a Go step to `checker`, and add `ci.yml` to `covers` if it changes.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Commands and Adoption; AC-02; AC-12
EVIDENCE: AC-02 says `vh-adlc clean --dry-run` "reports every declared, abandoned resource". Compose and kind rules are declared, and line 82 puts them "behind `--compose` and `--kind`". Adoption run 1 is a flagless dry run that reports only "every row that needs no flag". The document does not say whether a flagless dry run lists abandoned projects and clusters. If it omits them, AC-02 is false as written. Line 192 also has the operation add the flags only when the user asks, so the user never learns there is anything to ask for. If it lists them, nothing says how they are marked. An implementation review cannot decide AC-02 for this case.
PROPOSAL: State that a dry run without the flags also lists abandoned Compose projects and clusters, marked as needing their flag, with no change to the removal rules. Otherwise narrow AC-02 to the flags given and say what the operation reports instead.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, kind and Adoption; AC-08; AC-23
EVIDENCE: Line 216 creates marks only in `e2e/k8s/run.sh`. At `cc2cbbed`, `e2e/k8s/driver-conformance.sh` defaults to the same cluster (`:27`, `sw-e2e`), requires that it already exists (`:40`) and runs a `go test -timeout 30m` against it, with no mark. Take a killed `run.sh`, which leaves the cluster with one ended mark. A later `driver-conformance.sh` on that cluster is a live run the mark set cannot see. Line 185's rule, "only when it has marks and all have ended", then lets `clean --kind` stop the nodes during that test. AC-08 protects only "any live mark", and AC-23 names this script only for its temp files.
PROPOSAL: Have `driver-conformance.sh` create and remove a mark the way `run.sh` does, including the removal of ended marks at start. Add that to Adoption and AC-23, or state the gap as a limit.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-23
EVIDENCE: The row says "each named entry point with the candidate binary, without it, and with a refused base so `env` fails". The mark half has a stated observation. The temp-file half has none, and the standard asks for "a scenario with a pass condition". AC-23 says five entry points "keep their temp files under its temp root". A before-and-after comparison of `/tmp` on this host cannot show that, because other sessions write there at the same time (R-1 F-23 measured the drift). A review therefore cannot return `met` from running the targets. The AC-01 fixture proves only one `go test` in a `cmd/vh-adlc` test.
PROPOSAL: State the observation for each entry point, such as a probe test or script that records `TMPDIR`, `GOTMPDIR` and `t.TempDir` as seen inside the run, or a private `/tmp` for the run. Give the pass condition.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Order
EVIDENCE: Lines 246 and 251 say the release, lock bump, install and first real run are "recorded here afterwards". Order is inside Design, a normative section (`normative_sections` in the pinned rules block), and "A change to any of them is a revision". These steps happen after `complete`, because the `complete` gate runs on the feature branch before the merge. The transitions allow `complete` to move only to `archived` or `superseded`, so the document cannot return to `draft`. Following the sentence therefore either breaks the standard or leaves `vh-adlc fresh` reporting a changed baseline on a closed document.
PROPOSAL: Record these outcomes outside the normative baseline, for example in Context or `status_description`, and change the sentence to say where.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Review Log; frontmatter status_description
EVIDENCE: This repeats R-3 F-11, R-4 F-09 and R-5 F-09. `status_description` says "R-5 findings applied", but R-5 F-09 is not. `git ls-remote origin main spec/host-cleanup` returns only `refs/heads/main` at `c8343c5`, `git branch -a --contains HEAD` lists only local `spec/host-cleanup`, and `git log origin/main..HEAD` has 17 commits. The document has no `branch`, and the pinned `conventions/delivery.md` says such a document is "committed and pushed to the default branch". `git merge-base --is-ancestor origin/main HEAD` succeeds, so a fast-forward works today. Local `main` at `930541c` is still not an ancestor of HEAD, and a rebase would make every reviewed commit in this log unreachable.
PROPOSAL: Fast-forward `origin/main` to the commit the acceptance will name, without rebasing, or correct the status line and state why it waits.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, Commands
EVIDENCE: Line 100 says "A dry run reports `answered`", and lines 101-102 say `temp-base-refused` and `host-settings-invalid` "also report `fail`, and stop the run". Line 101's list is scoped to "An applied run", and the "also" sentence does not say whether it carries that scope. A `clean --dry-run` with an invalid `host.yaml` could therefore report either result. The same is open for `engine-unreachable` and `manifest-invalid` on a dry run. The operation acts on that result before it applies.
PROPOSAL: State the result of a dry run for each of these four codes.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Design, Commands and Manifest; AC-24
EVIDENCE: Line 98 says `--older-than` "applies to `tmp` and `temp_root` ages". The built-in `go-build*` and `gopls-tempmod*` globs have a fixed 24 hours and are in neither manifest section. Line 146 says they clear "under the same limits", which does not say whether the flag raises their age. AC-24 speaks of "a rule's age".
PROPOSAL: State whether `--older-than` also raises the built-in age.

FINDING: F-10
KIND: judgement
SEVERITY: nit
WHERE: Design, opening paragraph; Temp root
EVIDENCE: Line 81 says "a run nobody asked for may remove `/tmp` files only", and `references/authority.md` gains that row. Line 110 lets `temp_base` move every temp root out of `/tmp`, and line 161 removes entries inside the root wherever it is. With a moved base, an unrequested run removes files outside `/tmp`, which the sentence says it may not.
PROPOSAL: Word the rule and the authority row as "`/tmp` entries and the project's temp root".

### R-7

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, kind and Adoption; AC-08
EVIDENCE: Lines 183-186 treat "has marks and all have ended" as abandoned, and line 183 says a cluster with no mark is how a harness keeps one for debugging. R-6 F-04 closed this gap for `driver-conformance.sh` only, and two more cases remain. First, unmarked live work: Stackweaver `e2e/k8s/gitops-controllers.sh:4-11` at `cc2cbbed` installs into the running `sw-e2e` and says it can run on its own, and `conformance_kubernetes_integration_test.go:18` documents a direct `SW_KIND_CONTEXT=kind-sw-e2e go test`. Neither makes a mark, so on a killed run's cluster `clean --kind` stops the nodes under them. Second, a kept cluster becomes abandoned: `run.sh` with `KEEP_CLUSTER=1` leaves no mark, then a `driver-conformance.sh` on it, now marked by line 217, is killed. That leaves one ended mark, so the cluster kept for debugging is stopped and deleted. AC-08 protects only "no mark" and "any live mark", and the fake-engine row has neither case. What `clean` does with a mark whose cluster is gone is still unstated, as R-3 F-05 asked. `run.sh` itself prints `kind delete cluster` as the manual route, so an ended mark can outlive its cluster and then apply to the next hand-made `sw-e2e`.
PROPOSAL: Record on the mark whether its run created the cluster, and make a cluster eligible only while such a mark exists and all marks have ended, or state both cases as limits in Design. Say that `clean` removes a mark with no cluster, and add these cases to AC-08 and the fake-engine row.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, What clean will and will not touch and Operation; AC-02; AC-18
EVIDENCE: Context says the named classes are at most 43% of the incident's use and "the rest is unknown". Line 178 reports only the count and total size of unmatched entries, which sizes that unknown but does not attribute it. On this host now, `ls -A /tmp` gives 73 top-level entries and 1 matches any named class. The next largest are `playwright_firefoxdev_profile-ESCJ53` at 58 MB, `node-compile-cache` at 37 MB and `sw-seo-polish-e2e-pgvcdcdp` at 24 MB. Ages are floors: built-in globs wait 24 hours (line 147) and `--older-than` can only raise an age (line 98), so a same-day killed run is kept. Line 192 stops at applying the plan and gives no next step for a session still blocked. `rm` goes back to the classifier, which Context says refuses this sweep. AC-18 needs only that a run "frees space". With every box ticked, a session at the quota can free a small part and learn one number.
PROPOSAL: Have the report name the largest unmatched and age-kept entries with size and age, for example the top ten, removing nothing. Have `references/clean.md` tell a session that is still blocked to hand that list to the user, and add both to AC-02.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Frontmatter status_description; Design, Commands; Test Plan, AC-07, AC-18 and AC-23; covers
EVIDENCE: The status line says R-6 F-02, F-05, F-08 and F-09 "carry into tasks". All four are still in the text and all four are baseline matters, while the standard's normative list has Scope, Design, Acceptance Criteria, Test Plan and `covers`, and not Tasks. The AC-23 row still gives no observation or pass condition for temp files, so a task cannot make an implementation review return `met`. Lines 101-103 still give no dry-run result for `host-settings-invalid`, `temp-base-refused`, `engine-unreachable` or `manifest-invalid`, and the operation acts on that result. Line 98 and line 147 still leave `--older-than` on built-in globs open. The AC-07 and AC-18 rows still need Bubblewrap from a `cmd/vh-adlc` test, while `.github/workflows/ci.yml:36-38` installs it only in `checker`, and `ci.yml` is not in `covers`. Fixing any of these after acceptance is a revision: the document moves back to `draft` and acceptance is repeated.
PROPOSAL: Fold these four small edits in before the acceptance review. That means a pass condition per entry point in the AC-23 row, one sentence on dry-run results, one on `--older-than`, and the named CI job with `ci.yml` in `covers`.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Commands and Operation; Acceptance Criteria; Test Plan, AC-14
EVIDENCE: Lines 101-107 map every code to a result, and `references/loop.md` says the operation acts only on the binary's JSON result, but no criterion states a result. AC-07 says "reports why", AC-02 and AC-03 describe entries, and AC-14 mentions no result. Only the AC-14 row names "a golden JSON report", and that checks shape against the schema. A build that reports `pass` on `removal-failed` or `engine-unreachable`, or `answered` on `running-as-root`, ticks every box while a session reads a failed run as clean. Lines 198-200 have the same gap: the one-line report for a missing or older binary and the terminal instruction on `pid-namespace` have no criterion or proof. AC-11 records the `pid-namespace` outcome, but not what the session told the user.
PROPOSAL: Add a criterion that each code reports the result Design gives, with exit codes, and add that table to the `internal/clean` proof. Add the missing-binary, older-binary and `pid-namespace` reports to AC-11 and its procedure.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Review Log; frontmatter status_description
EVIDENCE: This repeats R-3 F-11, R-4 F-09, R-5 F-09 and R-6 F-07, and the status line says it waits on the owner. `git ls-remote origin main spec/host-cleanup` returns only `refs/heads/main` at `c8343c5`. `git branch -a --contains HEAD` lists only local `spec/host-cleanup`, and `git log origin/main..HEAD` has 19 commits. The document has no `branch`, and the pinned `conventions/delivery.md` says such a document is committed and pushed to the default branch. `origin/main` is an ancestor of HEAD, so a fast-forward still works. An acceptance row would bind to a commit that exists in one clone, and a rebase makes it `commit-unreachable`.
PROPOSAL: Put the push to the owner together with the acceptance question, and fast-forward `origin/main` to the accepted commit without rebasing.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context; Design, Adoption; Scope
EVIDENCE: Lines 48 and 220 cite "`feat/runner-architecture` at `cc2cbbed`". `git branch -a --contains cc2cbbed` prints nothing, and it is an ancestor of neither local `feat/runner-architecture` (`f4d05d2a`) nor PR #1002's head (`df83bf91`). The branch was rewritten, so the commit can be pruned. On the cited paths the local tip differs only in `Makefile`, so the claims hold today. PR #1002's head has no `e2e/k8s/driver-conformance.sh`, which Adoption and AC-23 change: `git cat-file -e origin/feat/runner-architecture:e2e/k8s/driver-conformance.sh` fails. Scope's base and Order step 4 therefore mean the local branch, not the PR as published.
PROPOSAL: Cite a commit that a ref holds, and say the adoption branch needs that work pushed to PR #1002 first.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Manifest; AC-06
EVIDENCE: Lines 141-145 list the refusals, and AC-06 covers only that list. I decoded with `go.yaml.in/yaml/v3` and `KnownFields(true)`: a manifest with a second YAML document decoded with no error and dropped that document, whereas `settings-reader.md` accepts one document only. `path.Match("abcd[", ...)` returned `syntax error in pattern` on every name, and `abcd[` passes the four-character floor. A syntax error, an unparseable age and an empty `label` are not listed either. Nothing says whether `compose.project` and `kind.cluster` count as "a glob". The example uses another key, so `project: "*"` with `volumes: true` reads as valid, which R-1 F-11 raised.
PROPOSAL: Add these refusals, and state that the literal floor applies to `compose.project` and `kind.cluster`.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Scope; Design, Adoption table
EVIDENCE: Row "Compose `swc-N`" says "stopped and removed with its volumes", and line 169 removes "its networks". `docker network inspect swc-8_jobs` shows only `{"sh.stackweaver.managed":"true"}`, with no Compose label, so that network matches no project. The launcher programs its firewall (`backend/internal/launcher/main.go:206`, with `RUNNER_NETWORK` defaulting to `${COMPOSE_PROJECT_NAME}_jobs` at `deploy/docker-compose.yml:495`). Stackweaver's `cmd_down` filters by the same label, so this is no regression. Scope and the limits at line 223 still name only `stackweaver-jobs-slot-*` and `sw-test-jobs-*`, so an abandoned slot's `swc-N_jobs` stays with no stated owner. I did not read the firewall itself, which needs root.
PROPOSAL: Name `swc-N_jobs` and its firewall objects in the untouched row or the limits at line 223.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria, AC-03
EVIDENCE: AC-03 opens "`vh-adlc clean` removes those", which points at AC-02's "every declared, abandoned resource". That set includes Compose projects and clusters, which a flagless `clean` must not change under AC-08. The criterion is not readable alone, and a review has to infer the flags.
PROPOSAL: Write it as `/tmp` entries and temp-root entries past their age, leaving Compose and kind to AC-08.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Manifest and Temp root; frontmatter covers; AC-06
EVIDENCE: The pin is now 0e52f51, and `conventions/coding.md:70-71` there says "Settings files we define use the `.yaml` suffix and load strictly". PR #43 added the repository's strict reader, `parse` in `internal/settings/settings.go`. It refuses anchors and aliases, merge keys, tags, a second document, non-decimal numbers and boolean spellings other than true and false. I checked it with the locked 0.9.0 binary. `settings read --stdin` refused `a: &p x` / `b: *p` ("anchors and aliases are not accepted") and `a: 1` / `---` / `b: 2` ("more than one document"). Design line 119 decodes `cleanup.yaml` "with `yaml.v3` into typed structs with unknown keys refused", and line 112 does the same for `host.yaml`. That is a second, looser reader. I ran a probe against go.yaml.in/yaml/v3 v3.0.5, the version in `go.mod`, using `Decoder.KnownFields(true)` into typed structs. It decoded `volumes: yes` as true, accepted an anchor and alias, decoded `schema_version: 1.0` as 1, and returned no error on a two-document manifest. In that last case the second document's `compose` rule was dropped without any notice. So someone reviewing `cleanup.yaml` on the default branch can see rules that `clean` never applies, and the binary would ship two definitions of "strict". `internal/settings/` is also not in `covers`, so later changes to the shared reader would not make this feature's reviews stale.
PROPOSAL: Have Design say that `cleanup.yaml` and `host.yaml` pass through the `internal/settings` parser before the typed, unknown-key-refusing decode, or say why they do not. Add `internal/settings/` to `covers`, and add an anchor and a two-document manifest to the AC-06 refusal cases. This changes the baseline, so it takes the revision path that `status_description` already describes.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Order step 2
EVIDENCE: Line 251 reads "The lock moves to that release, in `yaml-settings.md`'s PR if that lands next." `docs/specs/yaml-settings.md` is now `status: complete` and merged as PR #43 at `aa5c66e`. That PR already moved `plugins/vh-adlc/vh-adlc.lock.json` to 0.9.0 and the plugin to 0.7.0, and `git describe --tags origin/main` returns `v0.10.0`. The condition can no longer hold, so step 2 now names no PR for the lock bump. Its release-sequence finding also says a stable tag comes only from `main`, so the bump has to be a separate change.
PROPOSAL: At the next revision, reword step 2 so the lock moves to the release from step 1 in its own PR after that release is tagged.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context; Design, Commands
EVIDENCE: Context cites "`dispatch` requires `--plugin-pin` (`cmd/vh-adlc/main.go:158`)". The check is now at `main.go:176` as `if !c.noPin && !fullSHA.MatchString(o.pluginPin)`. The `command` struct gained `noPin` (`main.go:66-70`), and `settings read` already uses it (`main.go:108`). `docs/reference/cli.md:39` now reads "Every command above except `settings read` requires `--plugin-pin`". The claim is no longer true without qualification, and Design's exemption for `clean` and `env` can reuse an existing mechanism instead of a new one. The citation `tests/vh-adlc/triage/fixtures.ts:4-5` has also shifted: line 4 is now `import { settingsYAML }`, and the `vh-triage-*` lines are 5-6.
PROPOSAL: Update both Context citations, which needs no revision. At the next revision, name `noPin` in Design as the way `clean` and `env` are exempted.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Operation and allow rules; AC-14
EVIDENCE: The new "Repository settings" section in `docs/reference/compatibility.md:56-62` says "Reading a settings file uses the verified `vh-adlc` binary that the plugin installs". Design line 195 has the operation call `vh-adlc` "from `PATH`, unverified", and that binary reads `.vh-adlc/cleanup.yaml`, a YAML file under `.vh-adlc/` that the operation defines. If the page is not changed, it will contradict the feature for that file. AC-14 requires only that the compatibility table "document the commands, the manifest, the Git floor and both rules".
PROPOSAL: Have AC-14's documentation task limit that sentence to the triage and maintenance settings files, or add that `cleanup.yaml` is read by the `vh-adlc` on `PATH` without verification.

### R-9

CRITERION: AC-01 `vh-adlc env` points a `go test` run at the project's temp root, mode 0700, and it leaves temp files only there. `temp_base` moves every root, defaulting to `/tmp/vh-adlc-<uid>`, a symlinked or foreign base is refused, and a missing one is recreated.
VERDICT: met
EVIDENCE: `VH_ADLC_REQUIRE_BWRAP=1 go test -count=1 -v ./internal/clean ./cmd/vh-adlc` in a scratch clone at `1ad76f2`, TMPDIR outside /tmp, Go 1.27.2. Both packages passed, with no SKIP. TestEnvPointsGoTestAtTheRoot ran a fixture module's `go test -work` under `env --sh` and found WORK, t.TempDir(), os.CreateTemp and os.TempDir() all under `<base>/fixture` at mode 0700. TestEnvCreatesTheRoot, TestCheckBase, TestTempBaseDefault and TestEnvFailuresCreateNothing (symlinked base) also passed. Limitations: the default base was checked against a stand-in /tmp, and "only there" rests on those four paths.

CRITERION: AC-02 `vh-adlc clean --dry-run` reports every declared, abandoned resource with its reason and changes nothing, lists abandoned Compose projects and clusters marked as needing their flag, and an applied run reports what it removed and kept, with reasons, the space freed, and the count and size of user-owned `/tmp` entries no rule matched.
VERDICT: met
EVIDENCE: Same run at `1ad76f2`. These passed: TestPlanFiles, TestCleanDryRunChangesNothing, TestCleanAppliedRun, TestComposeNeedsItsFlag, TestComposeDryRun, TestKindNeedsItsFlag and TestKindDryRun. I also built the binary from `1ad76f2` and ran a real `clean --dry-run --repo <worktree>` on this host while /tmp was at its quota (12799M of 12814M). It answered with `manifest-unmerged` and `manifest-missing` notes, 2 removals and 1 keep with reasons, 273 unmerged items, freed_bytes 11309056 and unmatched count 3298, and it removed nothing. Limitations: applied runs ran only on fakes. F-02 records a report inaccuracy when a project's container removal fails.

CRITERION: AC-03 `vh-adlc clean` removes those and keeps other users' entries, unmatched entries, symlinks, entries with a mount point, entries in use and entries younger than their age. No Docker removal is forced, apart from `kind delete cluster` on stopped nodes, and an object in use, or whose usage cannot be listed, stays. With a denied or failed engine listing no file entry is removed, and with an absent or refused socket file entries still are.
VERDICT: met
EVIDENCE: Unit run at `1ad76f2` passed the fake-filesystem and fake-engine cases: TestPlanFiles, TestApplyFiles, TestBindMountKeepsEntry, TestEngineListingGatesFileRemoval (failed listing, denied socket, absent socket, tcp DOCKER_HOST), TestComposeInUseAndFailures and TestUnreadableProcStopsRemoval. The fake engine fails on any force parameter. `VH_ADLC_ENGINE_KIND=1 go test -count=1 -tags engine -run TestRealEngine ./internal/clean` on Docker 29.7.2 and kind v0.33.0 also passed: TestRealEngineCompose took 14.71s and TestRealEngineKind 39.83s. Afterwards no vhclean container, volume, network or kind cluster remained. A real-engine probe showed that a network with an attached container returns 403 and is kept, but it is reported as removal-failed (F-01). Limitations: file and socket cases ran on fakes. F-03 records a gap for a container that bind-mounts /tmp itself.

CRITERION: AC-05 A dry run plans a changed working-tree manifest, and an applied run removes only what the default-branch manifest declares.
VERDICT: met
EVIDENCE: TestManifestSources passed at `1ad76f2` in two forms, an unpushed topic-branch commit and an uncommitted edit. In both, the dry run reported only `manifest-unmerged` and planned the extra entry under `unmerged`. The applied run returned pass and left `example-more-x` in place. TestPartialCloneDoesNotFetch passed, and the blob was still missing afterwards. The code reads `origin/<default>` through ls-tree and cat-file with GIT_NO_LAZY_FETCH=1 (internal/clean/clean.go, defaultBranchManifest).

CRITERION: AC-06 Each manifest refusal listed in Design reports `manifest-invalid`, that manifest's rules remove nothing, and `env` creates nothing for it.
VERDICT: met
EVIDENCE: TestManifestRefusals passed at `1ad76f2`. I read its 49 rows, which cover every refusal Design lists: unknown keys, schema_version not 1, a glob under four literal characters, a path separator, an age under an hour, a project that is not a plain segment, an unknown liveness.kind and a kind rule without liveness. The rows also cover anchors, second documents and loose booleans. TestResults (manifest-invalid fails, and only the built-in globs apply) and TestEnvFailuresCreateNothing (two manifest-invalid rows with the home snapshot unchanged) passed. Clean and env both reach refusals through ParseManifest, so the downstream handling is the same code for every refusal.

CRITERION: AC-07 Run as root, outside the initial PID namespace, outside Linux or with Git older than 2.45, `vh-adlc clean` removes nothing and reports why.
VERDICT: met
EVIDENCE: TestCleanRefusals passed at `1ad76f2`, applied and dry, for root, a PID namespace (also an unreadable one), darwin and `git version 2.44.2`. Each gave `error` with its code, changed no file and made no engine call. TestCleanRefusesInAPIDNamespace with VH_ADLC_REQUIRE_BWRAP=1 ran the real binary under `bwrap --unshare-pid` and passed. Limitations: root, the platform and the Git version were injected.

CRITERION: AC-08 Compose projects change only with `--compose`, and a project stays unless the `working_dir` path of every one of its containers is gone. kind clusters change only with `--kind`. A cluster with no mark, or any live mark, stays, including one a run reused from a killed run and kept. A cluster whose marks have all ended is stopped and deleted.
VERDICT: met
EVIDENCE: The real-engine run at `1ad76f2` passed. The Compose project whose directory remained was kept as live, and the abandoned one's container and volume went. The kind cluster with no mark was kept as unmarked, and after an ended mark was added its nodes and the mark were gone. The fake cases also passed: TestComposeNeedsItsFlag, TestComposeRemovesAbandonedProject (mixed labels, a directory present, no working-dir label), TestKindNeedsItsFlag, TestKindDeletesOnlyAnEndedCluster (live, other host, reused and kept) and TestMarkEnded. Limitations: flag gating, live marks and the reused cluster were shown on fakes only.

CRITERION: AC-11 With the candidate binary on `PATH`, the plugin from this branch and the one documented rule, a Claude Code session in auto mode and a default `workspace-write` Codex session run the operation with no prompt, and a direct `rm -rf` of a `/tmp` entry still goes to the classifier or approval. A session that is blocked on space and was not asked passes neither `--compose` nor `--kind`. If `clean` refuses with `pid-namespace` in the Codex session, that is a stated limit recorded in the evidence, not a failure here.
VERDICT: not verified
EVIDENCE: The written procedure is in tests/vh-adlc/evidence/clean/procedure.md, and its sessions were not run. I observed only parts of it. `command -v vh-adlc` found nothing on PATH, and this branch's plugin is not installed. `codex execpolicy check --rules ~/.codex/rules/default.rules` on codex-cli 0.163.0 returned `allow` for `vh-adlc clean` and `vh-adlc clean --dry-run`, and no matched rule for `rm -rf /tmp/vh-ac11-control`. `~/.claude/settings.json:51` holds `Bash(vh-adlc clean *)`. No Claude Code or Codex session ran the operation.

CRITERION: AC-12 Run 1 of the real-host sequence reports every row that needs no flag as required, the owner accepts that report before run 2, and runs 2 to 4 leave every row as the table requires.
VERDICT: not verified
EVIDENCE: Design, Adoption gives the real-host sequence, and no execution was observed or recorded. It needs Stackweaver's reviewed manifest, and no branch has one (see AC-23).

CRITERION: AC-14 The guides, the CLI reference, the compatibility table and `references/clean.md` document the commands, the manifest, the Git floor and both rules, `references/authority.md` has the new row, and the package checker accepts the operation.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` at `1ad76f2` gave 635 pass and 1 fail. The failure was a 5000ms timeout in maintenance/delivery-cases.test.ts, and that file passed 4 of 4 when run alone. check.test.ts, triage and maintenance discovery, clean-bwrap and evidence-index together passed 70 of 70. TestSchema and TestGolden passed. I read the diffs of cli.md, compatibility.md, installation.md, workflows.md, references/clean.md and authority.md against the flags in cmd/vh-adlc/main.go, and they agree. Limitation: this holds on the branch tree only. F-05 records merge conflicts with origin/main in these files.

CRITERION: AC-18 With the `/tmp` quota exhausted, an applied run frees space and writes nothing to `/tmp`.
VERDICT: met
EVIDENCE: TestCleanFreesAFullTmp with VH_ADLC_REQUIRE_BWRAP=1 passed at `1ad76f2`. It runs the real binary under Bubblewrap with a filled, size-limited tmpfs at /tmp. Limitation: a tmpfs size limit stands in for the user quota. No applied run was made on the real host, which was at quota during this review.

CRITERION: AC-23 On Stackweaver's reviewed branch, `make test`, `make test-integration`, `make verify`, `e2e/k8s/run.sh` and `e2e/k8s/driver-conformance.sh` keep their temp files under its temp root, and `e2e/k8s/run.sh` and `e2e/k8s/driver-conformance.sh` each mark the cluster and remove the mark on exit. Without the binary, or when `env` fails, those run unchanged.
VERDICT: not verified
EVIDENCE: I searched every local branch and remote-tracking ref in /home/m/code/stackweaver for `.vh-adlc/cleanup.yaml`, and none has it. No adoption branch exists, so the Test Plan's procedure could not run.

CRITERION: AC-24 `--older-than` below a rule's age changes nothing, a repository with no manifest still gets the built-in globs, and a missing `kind` skips only the kind step. An invalid `host.yaml`, including a relative `temp_base`, `$HOME`, or one inside a Git work tree or above the repository, stops the run before it removes anything. A failing `env --sh` prints nothing to stdout, and a path with a space or quote is shell-quoted.
VERDICT: met
EVIDENCE: These passed at `1ad76f2`: TestOlderThan, TestBuiltinGlobsWithoutManifest, TestKindUnavailable, TestHostSettingsInvalid, TestResults, TestEnvShFailurePrintsNothing (empty stdout, exit 1), TestEnvShellLines and TestEnvPointsGoTestAtTheRoot (a base with a space and a quote, eval'd by sh). Clean calls LoadTempBase and CheckBase before it reads /tmp (internal/clean/clean.go, Clean).

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: internal/clean/engine.go, Engine.do; Design, What clean will and will not touch
EVIDENCE: `do` treats only 409 as in use (engine.go:195-197). On Docker 29.7.2 I ran `curl --unix-socket /var/run/docker.sock -X DELETE /networks/<net>` on a network with an attached container, which I created and then removed. It returned `status 403` with "network ... has active endpoints". The same call on a volume in use returned 409. So `clean --compose` keeps an in-use network but reports it as `removal-failed`, and the run fails. Design says it "keeps anything in use". TestComposeInUseAndFailures fakes a network failure with 500, not the engine's real status.
PROPOSAL: Treat a 403 from DELETE /networks as in use, the same as 409, and add a fake-engine case that returns 403 for a network.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: internal/clean/compose.go, doCompose
EVIDENCE: compose.go:68-69 appends the project to `Removed` with reason `abandoned` before `removeProject` runs. A container the engine will not remove then leaves the project listed as removed while its container is kept. The kind step lists a cluster only after `kind delete` succeeds (kind.go:161).
PROPOSAL: Add the project to `Removed` only when all its containers went, otherwise to `Kept` with `removal-failed` or `in-use`, and assert this in TestComposeStopsAtAContainerItCannotRemove.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: internal/clean/files.go, usage.holds; Design, What clean will and will not touch
EVIDENCE: `holds` returns true only when a used path lies inside the entry (files.go:283-290, `within(p, entry)`). A container that bind-mounts `/tmp` or `/`, as `-v /tmp:/tmp` does, has bind source `/tmp`, so no top-level entry counts as in use. A rootful container's processes are invisible under /proc to the user, so only the entry's age protects what that container uses. Design and references/clean.md list age as the only protection for other users' processes, unreadable /proc entries and Podman bind mounts, but not for this case.
PROPOSAL: Treat a bind source that is the scanned directory or one of its ancestors as holding every entry below it, which matches "a failed check counts as live". Otherwise, state this limit in Design and references/clean.md.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: frontmatter covers
EVIDENCE: internal/clean/manifest.go `decodeStrict` calls `settings.Command`, so both cleanup.yaml and host.yaml depend on the internal/settings reader. `covers` does not list `internal/settings/`, which R-8 F-01 already proposed. The standard says covers "lists every path whose change can affect the feature", and a change to that reader would not make this feature's reviews stale.
PROPOSAL: Add `internal/settings/` to covers, through the revision path, since covers is part of the normative baseline.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Branch state; AC-14 artifacts; docs/reference/compatibility.md
EVIDENCE: `vh-adlc fresh` (0.9.0, docs 0e52f51) reports spec review R-8 stale with `covered-drift`, and `gate complete` fails on spec_review_fresh, all_met, impl_review_fresh and impl_review_clean. `git merge-tree --write-tree origin/main 1ad76f2` shows conflicts in README.md, docs/get-started/installation.md, docs/user-guides/workflows.md, both plugin.json files, tests/vh-adlc/check.test.ts and both discovery tests. The branch sets the plugin to 0.8.0, origin/main has 0.10.0 (tag v0.15.0), and compatibility.md:68 says "`vh-adlc-clean` needs plugin 0.8.0", which will be wrong after the merge.
PROPOSAL: Merge origin/main into feat/host-cleanup and set the plugin version and the compatibility sentence to the release that will carry the operation. Then rerun the AC-14 checks on the merged tree and get a fresh spec review. The normative baseline is unchanged, so the acceptance stands.

### R-10

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Context; Design, Adoption and Order step 4
EVIDENCE: Scope bases the adoption branch "on `feat/runner-architecture`", and Order step 4 says "Stackweaver's adoption PR merges after its PR #1002". In /home/m/code/stackweaver, `git log origin/main --grep='#1002'` returns `a5f811d1 Merge pull request #1002: launchers, drivers and executors for every run, job and sync`, dated 2026-11-05, and `git merge-base --is-ancestor feat/runner-architecture origin/main` succeeds. origin/main is now 116 commits past that merge. So the Order condition already holds, and a branch cut from `feat/runner-architecture` (a3ebafa3) starts behind main. The cited commits are also unheld: `git branch -a --contains 619dce9c` and `git branch -a --contains cc2cbbed` print nothing, so both can be pruned. The cited code is on origin/main: `sweepEndedRuns` at `backend/internal/launcher/driver/leftovers_integration_test.go:120`, `TestSweepRemovesAnEndedRunsJobsNetworkAndItsFirewall` at line 367, and `e2e/k8s/driver-conformance.sh` exists there.
PROPOSAL: Base the adoption branch on Stackweaver's main, drop the PR #1002 condition from Order step 4, and cite `sweepEndedRuns` at a commit on origin/main, for example `cbf39566`. Scope is normative, so make the edit in this draft before the acceptance review.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-06; Test Plan, AC-05 and AC-06 row
EVIDENCE: The revision folds R-8 F-01 into Design only: "It passes through the strict reader in `internal/settings` that `settings read` uses". R-8 F-01 also proposed "add an anchor and a two-document manifest to the AC-06 refusal cases", because a second document's rules were silently dropped by a plain typed decode. AC-06 still covers only "Each manifest refusal listed in Design", and Design's list (unknown keys, schema_version, glob floor or separator, age under an hour, project segment, unknown liveness.kind, kind rule without liveness) names no strict-reader refusal. The Test Plan row says only "each refusal". A build that skips `internal/settings` and drops a second document could tick AC-06 as written. Only checked task T3, which is not normative, names the anchor and second-document cases. AC-24 does not have this gap for `host.yaml`, because its "An invalid `host.yaml`, including ..." is open-ended.
PROPOSAL: Add the strict reader's refusals (at least an anchor or alias and a second document) to the refusals Design lists, or name them in AC-06 and in its Test Plan row.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, What clean will and will not touch
EVIDENCE: The new limit names only a container that bind-mounts "all of `/tmp` or `/`". `internal/clean/files.go` `usage.holds` calls `within(p, entry)`, and `planFiles` runs `decide` on each entry inside `<temp_base>/<project>`. So a bind source equal to the temp root or the temp base (for example a harness passing `-v "$TMPDIR:$TMPDIR"` once `env` sets `TMPDIR` to the root) also marks no temp-root entry as in use. The owner's reason, "Such a container should never run on these hosts", fits a whole-`/tmp` mount less well when the mount is a project's own `TMPDIR`. No current Stackweaver harness does this. `e2e/k8s/run.sh:384` on `feat/runner-architecture` mounts `$CERT_DIR/registry`, a path inside an entry, which `holds` covers.
PROPOSAL: Widen the stated limit to a bind of any ancestor of the scanned directory, naming the temp base and the project's temp root, and make the same edit in `references/clean.md`.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: Context cites "`cmd/vh-adlc/main.go:66-70,108,176`" without a ref. Those lines match origin/main 21bc3e4 (`type command struct` at 67, `noPin` at 70, `settings read` at 108, the `fullSHA` check at 176). At HEAD 6d0c8af the feature's commands have shifted them: `type command struct` is at 76, `noPin` at 79, `settings read` at 117, `env` at 125, `clean` at 131 and the check at 229.
PROPOSAL: Say the citation is on origin/main 21bc3e4, or cite the HEAD lines. Context is not normative, so no revision is needed.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design, Temp root
EVIDENCE: The new sentence "`host.yaml` is read the same way as the manifest below." comes right after "`env` deletes nothing, so it reads the manifest from the working tree." That can be read as "read from the working tree" or "from the default branch", not as "through the strict reader and typed decode". The code does the third: `internal/clean/host.go:64` calls `decodeStrict`, as `manifest.go:113` does.
PROPOSAL: Write "`host.yaml` passes through the same strict reader and typed decode as the manifest."

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: plugins/vh-adlc/references/clean.md, What counts as in use (AC-14 artifact)
EVIDENCE: `references/clean.md:51` says an entry is in use "when a running container bind-mounts the entry or a path inside it". `internal/clean/engine.go:110` lists `/containers/json?all=1`, and `engineState.binds` takes the bind sources of every listed container, stopped ones included. Design says only "a container bind mount". The page states less protection than the code gives.
PROPOSAL: Drop "running" from that sentence, or say that stopped containers count too.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Commands
EVIDENCE: Design says "A dry run reports `answered`. An applied run reports `pass`, or `fail` on `removal-failed`, `manifest-invalid`, `engine-unreachable` or `kind-unavailable`." The code disagrees. `Clean` in `internal/clean/clean.go` sets `report.Answered` for a dry run, then switches to `report.Fail` when any finding is in the `failing` list (`clean.go:80-83` and `165-173`). That list holds `removal-failed`, `manifest-invalid`, `engine-unreachable`, `kind-unavailable`, `temp-base-refused` and `host-settings-invalid`. `plugins/vh-adlc/references/clean.md:42` agrees with the code: "a dry run fails on them too". A dry run with an invalid working-tree manifest exited 1 with `fail` (see F-02). R-6 F-08 and R-7 F-03 both asked Design to state what a dry run reports for these codes. Only the checked task T10 records the choice ("every failing code fails a dry run too"), and Tasks are not normative. The operation's apply step depends on this result (`SKILL.md` step 2). No criterion states a result, so an implementation review would not catch the mismatch.
PROPOSAL: Have Design say that a dry run reports `answered`, or `fail` on the same codes as an applied run, which is what the code and `references/clean.md` already do.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Where the rules come from; Design, Operation and allow rules
EVIDENCE: Setup: a scratch clone of this repository at 1fdaced, so `origin/HEAD` holds the branch's valid manifest; a binary built from HEAD outside the repository; and a working-tree `.vh-adlc/cleanup.yaml` replaced with `schema_version: 2`. `clean --dry-run --older-than 10000h` exited 1 with result `fail` and one finding, `manifest-invalid`, "the working tree's manifest: schema_version must be 1". `workingTreeManifest` (`clean.go:243-253`) is read only on a dry run, so an applied run would use the valid default-branch manifest and pass. `SKILL.md` step 2 and `references/clean.md` step 2 apply only when the dry run answered with no failing finding. So in a repository with a broken, uncommitted manifest edit, a session blocked on space cannot clean through the operation, even though Design says "An applied run uses only the default-branch manifest". Design does not say what happens to an invalid working-tree copy.
PROPOSAL: Report an invalid working-tree manifest on a dry run as a note that does not fail the run, for example beside `manifest-unmerged`. Otherwise, state in Design that it fails the dry run and that the operation then sends the user to a terminal.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, What clean will and will not touch
EVIDENCE: The stated limit names a bind of "all of `/tmp` or `/`, the temp base, or the project's temp root". Under Temp root, a valid `temp_base` only has to be absolute, not `$HOME`, outside any Git work tree and not above the repository. So a base such as `~/.cache/vh-adlc` or `/var/tmp/vh` is valid. Bind sources reach the in-use check through `files.go:124`, and `usage.holds` (`files.go:283-290`) calls `within(p, entry)` (`host.go:108-111`), which holds only for the entry itself or a path inside it. So a container that bind-mounts any directory above a custom base also marks no temp-root entry as in use, for example a dev container that mounts `$HOME`. The stated limit does not name that case. R-10 F-03 proposed "any ancestor of the scanned directory", and Q1 offered only the temp base and the temp root.
PROPOSAL: Widen the sentence in Design and in `references/clean.md` to a bind of the temp base, the project's temp root, or any directory above them.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Sources
EVIDENCE: The first Sources entry is labelled "Pinned feature-document standard". It and the coding, Go and prose links point at `vhco-pro/docs` blob `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`. The repository pin is `0e52f51f01b84eda75a976763c42d8ec0a07b544` (`AGENTS.md:4`). `vh-adlc lint` and `gate` report `knowledge.revision` 0e52f51, and the R-8 records cite that pin.
PROPOSAL: Point the four links at 0e52f51, or drop the word "Pinned".

### R-12

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Design, What clean will and will not touch; Tasks, T23
EVIDENCE: Folding Q4 rewrote the stated limit as "A container that bind-mounts the project's temp root, the temp base or any directory above the base, such as `/tmp`, `/` or, for a custom base, `$HOME` ... marks no entry below that path as in use". At 1fdaced the text named "all of `/tmp` or `/`" on its own terms. `/tmp` is above the base only when the base is the default `/tmp/vh-adlc-<uid>`. Temp root allows any absolute base that is not `$HOME`, is outside a Git work tree and is not above the repository, so `/var/tmp/vh` and `~/.cache/vh-adlc` are both valid. With such a base, a container that bind-mounts `/tmp` is not covered by the sentence. The code still marks no top-level `/tmp` entry as in use for that container: `planFiles` scans `h.Tmp` (`internal/clean/files.go:126`), and `usage.holds` and `mountedIn` (`files.go:283`, `:292`) call `within(p, entry)` (`internal/clean/host.go:108`). That call holds only for the entry itself or a path below it, so a bind source of `/tmp` or `/` holds no `/tmp/<name>`, whatever the base is. The closing sentence ("A container mounting all of `/tmp` or `/` should never run on these hosts") is advice, not the limit. T23 copies the same narrower wording into `references/clean.md`.
PROPOSAL: Make the limit cover both scanned directories: a bind of `/tmp` or any directory above it hides top-level entries, and a bind of the project's temp root or any directory above it, the temp base included, hides temp-root entries. Change T23 to match.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Where the rules come from
EVIDENCE: Design says `clean` reads the manifest with "`git symbolic-ref refs/remotes/origin/HEAD`, then `git cat-file blob origin/<default>:.vh-adlc/cleanup.yaml`". `defaultBranchManifest` in `internal/clean/clean.go` runs three commands instead: `symbolic-ref -q refs/remotes/origin/HEAD` (line 209), then `ls-tree -z --format=%(objecttype) %(objectname) <branch> -- .vh-adlc/cleanup.yaml` (line 217), then `cat-file blob <sha>` (line 229). All three run with `GIT_NO_LAZY_FETCH=1`. The `ls-tree` step is what turns a missing path into `manifest-missing` and a non-blob into `manifest-invalid`. The behaviour matches Design, but the commands it names do not.
PROPOSAL: Describe the read as `ls-tree` on `origin/<default>` and then `cat-file blob` of the object it names, or name no commands and say "reads the blob at `origin/<default>:.vh-adlc/cleanup.yaml` without fetching".

### R-13

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Where the rules come from
EVIDENCE: Design says "With no such ref it reports `default-branch-unknown`, and with no manifest there `manifest-missing`, and skips project rules." `defaultBranchManifest` in `internal/clean/clean.go` only treats a failed `symbolic-ref -q refs/remotes/origin/HEAD` that way. When that ref names a branch that no longer exists, the `ls-tree` error goes to `invalid(...)`, which reports `manifest-invalid`. That is a failing code on dry runs too. This happens when a remote renames its default branch and a pruning fetch then deletes the old remote-tracking ref. I tested it in scratch repositories: upstream on `master`, a clone, upstream renamed to `main`, then `git fetch --prune` in the clone. Afterwards `git symbolic-ref -q refs/remotes/origin/HEAD` printed `refs/remotes/origin/master` with rc=0, and `git ls-tree ... origin/master` failed with "fatal: Not a valid object name origin/master". A binary built from b68e46d ran `clean --dry-run --repo <clone>` and exited 1 with result `fail` and a single finding: `manifest-invalid`, "reading .vh-adlc/cleanup.yaml on origin/master without a fetch: ... Not a valid object name origin/master". Neither the default branch nor the working tree has any manifest in that clone. `SKILL.md` and `references/clean.md` step 2 apply only after a dry run with no failing finding, so in such a repository the operation never applies, and even the built-in `go-build*` globs are not cleared through it. The message also leaves out the fix that the `default-branch-unknown` message gives (`git remote set-head origin --auto`). No Test Plan row covers this case.
PROPOSAL: State in Design that an `origin/HEAD` whose target ref is missing reports `default-branch-unknown`, a note, and skips project rules. Add that case to the AC-05, AC-06 fixture-repository row. The open T24 already touches `clean.go`, so the code change can go there.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Frontmatter status_description
EVIDENCE: status_description says "Waits on spec review R-12, then the owner's acceptance." The Review Log already has the R-12 row and subsection at 3507447, and b68e46d folds both of its findings. `vh-adlc fresh` reports R-12 stale with `baseline-changed`, and `vh-adlc next` returns `spec review`, so the document now waits on a new pass, not on R-12.
PROPOSAL: Change the line to say R-12's findings are folded and the document waits on the next spec review, then the owner's acceptance. The field is not normative, so this edit needs no revision.

### R-14

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-05 and AC-24; Test Plan, AC-05 and AC-06 row; Tasks, T25
EVIDENCE: At 804c97b, Design ("Where the rules come from") now says an `origin/HEAD` that "names a remote-tracking branch that no longer exists" reports `default-branch-unknown` as a note and skips project rules. No criterion states that end state. AC-05 covers a changed or invalid working-tree manifest and the applied run's use of the default-branch manifest. AC-06 covers "Each manifest refusal listed in Design", and a pruned ref is not one of those refusals. AC-24 says only that "a repository with no manifest still gets the built-in globs". The current code already meets that clause in the pruned case: `defaultBranchManifest` in `internal/clean/clean.go` sends the `ls-tree` error to `invalid(...)` and returns a nil manifest, `plan` still applies `builtinRules()`, and `Clean` then reports `fail` because `manifest-invalid` is in `failing`. So a build without T25 meets AC-05, AC-06 and AC-24 as written, while the operation never applies in such a repository, which is the defect R-13 F-01 found. The proof is filed under the wrong criteria as well. The Test Plan puts "an `origin/HEAD` that names a pruned branch" in the AC-05, AC-06 row, and T25 cites AC-05 and AC-24, but the AC-24 row ("`internal/clean` table tests, and a `cmd/vh-adlc` test capturing stdout of a failing `env --sh`") does not mention the case. T24's fold set the pattern to follow: its invalid working-tree case went into the text of AC-05. `vh-adlc fresh` reports R-13 stale with `baseline-changed`, so this pass is the one an acceptance would name.
PROPOSAL: Add to AC-05 or AC-24 that a missing `origin/HEAD`, or one whose target ref no longer exists, reports a `default-branch-unknown` note, skips project rules and does not fail the run, dry or applied. Then list that criterion in the Test Plan row that holds the pruned-branch case, and in T25.

## Sources

- [Feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md), [coding](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/coding.md), [Go](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/go.md) and [prose](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md) pages at `e4d58d2`, read when this document was first written; the repository pin is now `0e52f51`: document format and writing rules.
- [Claude Code: configure permissions](https://code.claude.com/docs/en/permissions): Bash rule wildcards and compound-command splitting.
- [Claude Code: permission modes](https://code.claude.com/docs/en/permission-modes): narrow allow rules stay in auto mode and resolve before the classifier.
- [Codex rules](https://learn.chatgpt.com/docs/agent-configuration/rules): `prefix_rule` syntax and `codex execpolicy check`.
- [docker container prune](https://docs.docker.com/reference/cli/docker/container/prune/) and [docker volume prune](https://docs.docker.com/reference/cli/docker/volume/prune/): prune filters by label or time, without ownership or liveness, so this design does not use it.
- [docker container rm](https://docs.docker.com/reference/cli/docker/container/rm/): `--volumes` removes a container's anonymous volumes and keeps named ones.
- [kind Docker provider constants](https://raw.githubusercontent.com/kubernetes-sigs/kind/main/pkg/cluster/internal/providers/docker/constants.go): node containers carry `io.x-k8s.kind.cluster`.
- [kind Docker provider](https://github.com/kubernetes-sigs/kind/blob/main/pkg/cluster/internal/providers/docker/provider.go): `DeleteNodes` runs `docker rm -f -v`, as R-1 F-04 reports, so `clean` stops nodes first.
- [Git 2.45.0 release notes](https://raw.githubusercontent.com/git/git/master/Documentation/RelNotes/2.45.0.adoc): `git --no-lazy-fetch` arrives in 2.45.
- Read for options now removed: [systemd.timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), [loginctl](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html), [git-ls-remote](https://git-scm.com/docs/git-ls-remote), [git-config](https://git-scm.com/docs/git-config) and [GitHub required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews).
