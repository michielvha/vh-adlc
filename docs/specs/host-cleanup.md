---
status: draft
status_description: "Cut down on the owner's direction on 2026-11-02; every question is decided. R-1's blockers still need a new independent review."
issue: null
goal: "Any agent session can remove what a repository's killed runs left behind, through one vh-adlc command that touches only what that repository's default branch says it owns and has abandoned."
covers:
  - cmd/vh-adlc/
  - internal/clean/
  - internal/report/
  - schema/vh-adlc.schema.json
  - plugins/vh-adlc/skills/vh-adlc-clean/
  - plugins/vh-adlc/references/clean.md
  - plugins/vh-adlc/references/lifecycle.md
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
that day emptied `/tmp` (`df -h /tmp`: 18M used), which ends that incident, but every killed run starts
the same build-up. Measured before the reboot on host `fedora-43`:

- `/tmp` is a 16G tmpfs with 9252M of a 12815M quota in use (`quota -s`), across 4152 entries.
- The largest entries were `TestConformance_*` (2 x 454 MB), 22 `go-build*` and seven
  `stackweaver-visuals-*`. vh-adlc's own tests left over 100 `vh-triage-*` entries
  (`tests/vh-adlc/triage/fixtures.ts:4-5`). Live entries such as `claude-1000` sit beside them.
- Docker is one rootful engine shared by every project (`docker context ls`). A live test run's objects
  carried `sh.stackweaver.test-run=fedora-43/461166`, and Compose slot containers carry
  `com.docker.compose.project.working_dir`. Stackweaver's dev stack is Compose project `deploy`, and its
  database has no backup (Stackweaver `CLAUDE.md:144`).
- Stackweaver's launcher writes firewall chains `SW-JOBS-<8 hex>` and nftables tables `sw_jobs_<8 hex>`,
  named from the SHA-256 of the network name, from a uid-0 `NET_ADMIN` container
  (`backend/internal/launcher/driver/network.go:196,342,469` at `96eaff82`). Removing a network leaves them.

Stackweaver already has this logic for one test package: `sweepEndedRuns`
(`backend/internal/launcher/driver/leftovers_integration_test.go:82` at `96eaff82`) reads a `host/pid`
mark, never forces a removal, and runs only in that package's `TestMain`.

Sessions cannot clean up today. The auto-mode classifier refuses to sweep shared `/tmp`, because it
cannot tell one project's files from another's. A narrow allow rule resolves before the classifier
(see Sources), and `codex execpolicy check` on codex-cli 0.163.0 returned `allow` for a `prefix_rule` on
`vh-adlc clean`.

`dispatch` requires `--plugin-pin` on every command (`cmd/vh-adlc/main.go:158`), and output is one JSON
object per run (`internal/report/report.go:97`). The plugin lock names 0.1.0, and `go.yaml.in/yaml/v3` is
already a dependency (`go.mod:5`). `GOTMPDIR` covers the go command and `t.TempDir` (`go doc`, Go 1.27).
The Bash tool's `PATH` here is `/usr/local/bin:/usr/bin`, so `~/go/bin` is not on it.

## Scope

In scope: `.vh-adlc/cleanup.yaml`, `vh-adlc env`, `vh-adlc clean` per repository, the `vh-adlc-clean`
operation for Claude Code and Codex, one allow rule each, vh-adlc's own manifest, Stackweaver's adoption
in its own repository, and the binary release and lock bump these need.

Out of scope: anything that defends against a hostile agent; a registry, host list or `--all-projects`;
any check of the remote; a timer; hosts other than Linux, where the binary refuses; killing host
processes; engine-wide pruning and the build cache; anonymous volumes and containers no rule matches;
directories outside `/tmp` and the temp root, including `~/.cache/go-build`; cloud resources; and
replacing a project's own cleanup code.

## Design

The threat is accidents. Agents already act as the owner on this machine, so nothing here tries to
stop one on purpose.

### Commands

`clean` and `env` need no conventions, so `dispatch` exempts them from `--plugin-pin` and their reports
carry `knowledge: null`. The logic lives in `internal/clean`. Both report `unsupported-platform` and do
nothing outside Linux.

- `vh-adlc env [--repo DIR] [--sh]` creates the project's temp root and reports `TMPDIR` and `GOTMPDIR`.
  `--sh` prints `export` lines, the second exception to the JSON contract after `--version`. On failure
  it prints nothing to stdout.
- `vh-adlc clean [--repo DIR] [--dry-run] [--older-than DURATION] [--firewall] [--kind]` plans and removes.
  `--older-than` can only raise a rule's age.

A dry run reports `answered`. An applied run reports `pass`, or `fail` when a removal failed, and
`running-as-root` and `unsupported-platform` report `error`. New finding codes: `manifest-invalid`,
`manifest-missing`, `manifest-unmerged`, `running-as-root`, `unsupported-platform`, `removal-failed`,
`engine-unreachable` and `kind-unavailable`.

### Temp root

Each project gets `<temp_base>/<project>`, mode 0700. `temp_base` is an optional setting in
`<user config dir>/vh-adlc/host.yaml`, defaulting to `/tmp/vh-adlc-<uid>`. `env` refuses a base that is a
symlink or is not owned by the user. A base missing after a reboot is recreated. A project's build and
test entry points take their environment from `vh-adlc env --sh`.

### Manifest

`.vh-adlc/cleanup.yaml` is data, decoded with `yaml.v3` into typed structs with unknown keys refused. It
holds no commands.

```yaml
schema_version: 1
project: stackweaver
temp_root: {max_age: 24h}
tmp:
  - {glob: "TestConformance_*", max_age: 12h}
docker:
  - kinds: [container, network, volume, image]
    match: {sh.stackweaver.managed: "true"}
    liveness: {kind: pid, label: sh.stackweaver.test-run}
    anonymous_volumes: true
compose:
  - {project: "swc-*", volumes: true}
kind:
  - {cluster: sw-e2e, liveness: {kind: pid, label: sh.stackweaver.kind-run}}
firewall:
  image: ghcr.io/example/tools@sha256:<64 hex>
  iptables_chain_prefix: SW-JOBS-
  nft_table_prefix: sw_jobs_
```

Liveness has two kinds. `pid`: a label holds `<host>/<pid>`, and the object is abandoned only when the
host is this host and `kill(pid, 0)` returns `ESRCH`. `path`: a label holds a path, and the object is
abandoned when that path is gone. An object without the label is not matched, and if two rules disagree,
live wins. A Compose project uses `path` on `com.docker.compose.project.working_dir`.

A glob needs four literal characters before its first wildcard, and an age must be at least one hour,
so a typo cannot match everything. A manifest that breaks these rules reports `manifest-invalid` and
removes nothing.

vh-adlc's own manifest owns `go-build*` and `gopls-tempmod*`, so `vh-adlc clean --repo <vh-adlc checkout>`
clears them.

### Where the rules come from

`clean` reads the manifest from the local default branch:
`git symbolic-ref refs/remotes/origin/HEAD`, then `git cat-file blob origin/<default>:.vh-adlc/cleanup.yaml`,
each with `GIT_NO_LAZY_FETCH=1`. A manifest changed only on a branch or in the working tree gets a dry
run, reported as `manifest-unmerged`. This prevents accidental edits and is not a security boundary.
"On the default branch" means pushed; it does not mean reviewed. With no manifest there, nothing is
removed and the run reports `manifest-missing`.

### What clean will and will not touch

- It never runs as root, and acts only on top-level `/tmp` entries the user owns that a glob matches, and
  entries inside the project's temp root.
- It skips symlinks and anything containing a mount point, and removes through `os.Root.RemoveAll`.
- It skips what is in use: a same-uid process's `cwd`, `exe`, open file or mapping under `/proc`, a bound
  socket in `/proc/net/unix`, or a container bind mount. Other users' processes are unreadable and not
  checked, so age is the only protection against them.
- It never forces a Docker removal. It removes containers (with their anonymous volumes when the rule
  says so), then networks, volumes and images, and keeps anything still in use. A container is stopped
  only when its rule says it is abandoned.
- A failed check counts as live. If the engine cannot be listed, no file entry is removed either, unless
  the socket is simply absent or refuses, which means no engine is running.
- It writes nothing to `/tmp`, so it works with the quota full. If a session's own shell cannot run, the
  owner runs `vh-adlc clean` in a terminal.

The report lists what was removed and kept, why, and the space freed.

### kind and firewall

`--kind` and `--firewall` are opt-in. The operation passes them only when the user named them.

A kind cluster has no owner mark, so its harness creates a small Docker volume labelled with the liveness
label and `io.x-k8s.kind.cluster=<name>`. A cluster with no mark is never touched, which is how a harness
keeps one for debugging. With an ended mark, `clean` stops the nodes, runs `kind delete cluster --name
<name>` and removes the mark. `kind` must be on `PATH`, otherwise it reports `kind-unavailable`.

A chain carries no label, so its liveness is its network: the chain or table name is the declared prefix
plus the first eight hex characters of the SHA-256 of a network name, compared without case. With
`--firewall`, `clean` runs one short-lived host-network `NET_ADMIN` container from the digest-pinned image,
using a script fixed in the binary. It lists chains and tables first and networks second, so a new
network cannot look orphaned, and removes what matches no network. Any failed listing removes nothing.
Without `--firewall`, a network with a firewall rule is kept as `firewall-chain-pending`, so `clean` never
creates orphan chains.

### Operation and allow rules

`skills/vh-adlc-clean/SKILL.md` runs `vh-adlc clean --dry-run`, reports the plan, and applies it when the
user asked for cleanup or the session is blocked on space. It never uses `rm`, `docker rm` or `pkill`.
`references/clean.md` holds the procedure and fields, and `references/lifecycle.md` gains a row. The
operation skips `knowledge`, so `references/loop.md` names that exception and
`tests/vh-adlc/check.test.ts` gains a category for it.

The owner installs the binary once per lock bump, where the Bash tool can find it:
`sudo install -m 755 "$(bash <plugin directory>/scripts/ensure-vh-adlc.sh)" /usr/local/bin/vh-adlc`, and
`kind` the same way if wanted. Then one rule each, in user scope:

- Claude Code, `~/.claude/settings.json`: `"allow": ["Bash(vh-adlc clean *)"]`.
- Codex, `~/.codex/rules/default.rules`: `prefix_rule(pattern=["vh-adlc", "clean"], decision="allow")`.

### Adoption

vh-adlc adds its manifest for `go-build*`, `gopls-tempmod*`, `vh-triage-*` and its other test prefixes.
Stackweaver, in its own repository:

- merges `.vh-adlc/cleanup.yaml`;
- takes its environment from `vh-adlc env --sh` when `command -v vh-adlc` finds it, and otherwise runs
  unchanged, so CI and self-hosters are unaffected;
- adds the `test-run` mark to test jobs networks, which `network.go:140` does not set today;
- creates the kind mark in `e2e/k8s/run.sh`, and removes it when `KEEP_CLUSTER=1`.

The reboot cleared the `/tmp` rows, so the real-host check recreates them as stand-ins.

| Leftover | Required outcome |
| --- | --- |
| `/tmp/TestConformance_*`, `/tmp/stackweaver-visuals-*`, and `/tmp/go-build*` from vh-adlc's manifest | Removed once older than their age and not in use |
| Docker objects with a live `test-run` mark | Kept while the pid lives, removed after |
| Compose `swc-N` with its worktree present | Kept |
| Compose `swc-N` with its worktree gone | Stopped and removed with its volumes |
| Compose `deploy`, `~/.cache/sw-*`, and anything else no rule matches | Untouched |
| kind `sw-e2e` with an ended mark, using `--kind` | Stopped and deleted |
| kind `sw-e2e` with a live mark or no mark | Untouched |
| `SW-JOBS-*` chains of removed networks, using `--firewall` | Removed |

### R-1 findings

| Finding | Outcome |
| --- | --- |
| F-01, F-08, F-09, F-10, F-24 | Resolved by removal: no remote proof, URL rules, host list or remote steps. |
| F-02 | `clean` writes nothing to `/tmp`, and AC-18 stays. |
| F-05, F-06 | Decided: vh-adlc owns the shared globs, and "pushed" is accepted with no plan or owner step. |
| F-11 | Four-character floor kept. Every rule needs `pid` or `path`, so namespace rules are dropped. |
| F-18 | Owner direction: flags only when named, with no extra rules. |
| F-21 | Criteria reduced with the scope. |
| Others | Applied in the text: F-03, F-04, F-07, F-12 to F-17, F-19, F-20, F-22, F-23, F-25, F-26. |

## Acceptance Criteria

- [ ] AC-01: `vh-adlc env` reports `TMPDIR` and `GOTMPDIR` under the project's temp root, mode 0700, and a `go test`
      run with that environment leaves its temp files only there.
- [ ] AC-02: `vh-adlc clean --dry-run` reports every declared, abandoned resource with its rule and reason and
      changes nothing.
- [ ] AC-03: `vh-adlc clean` removes those and keeps other users' entries, unmatched entries, symlinks, entries with
      a mount point, entries in use, entries younger than their age, and objects any matching rule reads as live.
- [ ] AC-04: No Docker removal is forced, and an object in use, or whose usage cannot be listed, stays.
- [ ] AC-05: A manifest changed only on a branch or in the working tree gets a dry run, and an applied run removes
      only what the default-branch manifest declares.
- [ ] AC-06: A manifest with unknown keys, a glob under four literal characters, an age under one hour, or a Docker
      rule without liveness is refused and removes nothing.
- [ ] AC-07: Run as root, `vh-adlc clean` removes nothing.
- [ ] AC-08: kind clusters and firewall objects change only with `--kind` or `--firewall`. Without `--firewall`, a
      network with a firewall rule stays. A cluster with no mark or a live mark stays. An orphan chain goes, a
      live network's chain stays, and a failed listing removes nothing.
- [ ] AC-09: The report lists removed and kept items with reasons and the space freed.
- [ ] AC-11: With the one documented rule, a Claude Code session in auto mode and a Codex session run the operation
      with no prompt or refusal, and a direct `rm -rf` of a `/tmp` entry still goes to the classifier or approval.
- [ ] AC-12: With Stackweaver's and vh-adlc's manifests merged, a dry run on this host classifies every row of the
      adoption table as required, and the owner accepts that report before the first applied run.
- [ ] AC-13: After the first applied run, the removable rows are gone and every kept row is present.
- [ ] AC-14: The CLI reference, the installation and workflows guides, the compatibility table and `references/clean.md`
      document the commands, the manifest and both rules, and the package checker accepts the operation.
- [ ] AC-17: `temp_base` moves every temp root, the default is `/tmp/vh-adlc-<uid>`, a symlinked or foreign base is
      refused, and a base missing after a reboot is recreated.
- [ ] AC-18: With the `/tmp` quota exhausted, an applied run frees space and writes nothing to `/tmp`.
- [ ] AC-19: The plugin lock names a release that has `env` and `clean`.
- [ ] AC-22: On a platform other than Linux, `env` and `clean` do nothing and report `unsupported-platform`.
- [ ] AC-23: With `vh-adlc` installed, a Stackweaver test run keeps its temp files under its temp root and marks its
      jobs networks and kind cluster. Without it, Stackweaver's entry points run unchanged.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-17, AC-22 | `internal/clean` tests on a temporary home, with the platform injected, and a `cmd/vh-adlc` test running `go test` on a fixture module. |
| AC-02, AC-03, AC-07 | Fake-filesystem table tests: a `t.TempDir` stands in for `/tmp`, with injected uid, clock, `/proc` and mount data. The dry-run case compares a tree snapshot. |
| AC-02, AC-03, AC-04, AC-08 | Fake-engine tests: an `httptest` server on a Unix socket records every call and fails on any `force` parameter, across ended and live marks, disagreeing rules, a bind mount and failed listings. |
| AC-03, AC-04, AC-08 | Integration test behind a build tag on the real engine, with disposable objects, chains and clusters. |
| AC-05, AC-06 | Table tests on fixture repositories: each refusal, a branch edit and an uncommitted edit. A missing object in a partial clone must not fetch. |
| AC-09 | A golden JSON report validated against the updated schema. |
| AC-11 | Written manual procedure in disposable sessions, recorded under `tests/vh-adlc/evidence/clean/`, with `codex execpolicy check` output. |
| AC-12, AC-13 | Real-host procedure: create stand-ins, save the dry-run report, owner review, apply, record each row. |
| AC-14, AC-19 | `bun test tests/vh-adlc` against the bumped lock, and a read of the documentation against the flags. |
| AC-18 | A `cmd/vh-adlc` test under Bubblewrap with a filled, size-limited tmpfs at `/tmp`. |
| AC-23 | In Stackweaver, run driver tests through the entry point with and without the binary. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-02 | R-1 | spec | `5dbeab86b1c11bf1cd5affd42e0d5e50fd04d140` | claude-opus-5-5 | procedural | 26 findings, 7 blocking |

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

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md), [coding](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/coding.md), [Go](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/go.md) and [prose](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md) pages: document format and writing rules.
- [Claude Code: configure permissions](https://code.claude.com/docs/en/permissions): Bash rule wildcards and compound-command splitting.
- [Claude Code: permission modes](https://code.claude.com/docs/en/permission-modes): narrow allow rules stay in auto mode and resolve before the classifier.
- [Codex rules](https://learn.chatgpt.com/docs/agent-configuration/rules): `prefix_rule` syntax and `codex execpolicy check`.
- [docker container prune](https://docs.docker.com/reference/cli/docker/container/prune/) and [docker volume prune](https://docs.docker.com/reference/cli/docker/volume/prune/): prune filters by label or time, without ownership or liveness, so this design does not use it.
- [docker container rm](https://docs.docker.com/reference/cli/docker/container/rm/): `--volumes` removes a container's anonymous volumes and keeps named ones.
- [kind Docker provider constants](https://raw.githubusercontent.com/kubernetes-sigs/kind/main/pkg/cluster/internal/providers/docker/constants.go): node containers carry `io.x-k8s.kind.cluster`.
- [kind Docker provider](https://github.com/kubernetes-sigs/kind/blob/main/pkg/cluster/internal/providers/docker/provider.go): `DeleteNodes` runs `docker rm -f -v`, as R-1 F-04 reports, so `clean` stops nodes first.
- Read for options now removed: [systemd.timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), [loginctl](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html), [git-ls-remote](https://git-scm.com/docs/git-ls-remote), [git-config](https://git-scm.com/docs/git-config) and [GitHub required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews).
