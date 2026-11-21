---
status: draft
status_description: "Revised after review R-5; awaiting a new independent review."
issue: null
goal: "In a repository that declares visual_record, every pull request vh-adlc ships for a visible UI change carries before and after images linked at fixed commits, or says which images are missing and why."
covers:
  - plugins/vh-adlc/scripts/loop/visuals.ts
  - plugins/vh-adlc/scripts/loop/settings.ts
  - plugins/vh-adlc/scripts/loop/cli.ts
  - plugins/vh-adlc/scripts/loop/rungs.ts
  - plugins/vh-adlc/scripts/loop/git-paths.ts
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/scripts/branches/
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - tests/vh-adlc/loop/
  - tests/vh-adlc/branches/branches.test.ts
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
---

# Plan: Visual record in shipped pull requests

The ship operation adds a "Before and after" section to the pull request of any feature that changes
visible UI. The adopter's capture command produces the images, ship inspects them, and only then are
they stored on a per-PR ref outside `refs/heads`.

## Context

### Owner summary

A UI pull request today describes its change in text only. A reviewer can't see the old and new look
side by side, and the history keeps no visual record. vh-adlc does nothing with screenshots yet. The
owner asked for this on 2026-11-21, for every project that ships through vh-adlc, and the shared rule is
proposed as "Visual record in the pull request" in the frontend testing standard
([vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53)).

Each project opts in with two things: a `visual_record` block in `.vh-adlc/loop.yaml` naming the paths
that count as UI changes, and a capture command. When a committed change in the feature matches, ship
opens or updates the PR and runs a new `cli.ts visuals` command in two steps. The capture step runs the
project's command once with the base and head commits and an output folder; the command writes
`before/` and `after/` images however its project builds, including copies of screenshots the
repository already commits (one `git cat-file --filters` line each, shown in the guide). Ship then
looks at every image. Only if nothing should stay private does the push step store the images on
`refs/pr-visuals/<PR number>`, check that the PR's repository holds them, and print a table of embedded
images. Ship writes that section last in the PR body, inside markers, replacing only the section it
wrote before.

The owner's decisions on 2026-11-21: a missing record is disclosed and never blocks a delivery; a
repeated ship appends to the ref, so earlier images stay; nothing compares images automatically, so ship
inspects the pairs and says "No visible change" only when it sees none; the ref is named by PR number;
the project's command captures both sides and is the only image source, so vh-adlc builds no checkouts
and has no separate path for committed screenshots; the GitHub host, owner and repository come from the
PR; images are pushed only after ship inspected them; and review findings take their recommended fixes.

The push to `refs/pr-visuals/*` is part of ship's push authority and goes through its repository and
account confirmation. Ordinary clones don't fetch that ref; GitHub serves its files to anyone who can
read the repository, so in a public repository the images are public, like the PR. Deleting a ref that
holds an image it shouldn't needs the owner's explicit request, and even then GitHub still serves the
commit by SHA, so inspecting before the push is the real protection.

Nothing changes for a project without the block, and a `## Before and after` section someone writes by
hand is never touched. An adopter has to upgrade the plugin before adding the block, because older
settings readers reject unknown keys.

Planned proof is fixture tests against local Git repositories, text checks with stated examples, and one
manual check that the images render in a private GitHub PR. Observed so far: one probe showed GitHub
serving a file from a commit that only a custom ref holds, and kept serving it after the ref was
deleted. Reviews R-1 to R-5 found 25, 13, 15, 9 and 10 issues, the last with none blocking; this
revision applies R-5 and needs a new independent review.

Acceptance authorizes implementing this design on a feature branch. Merging, releasing and changing the
docs pin each need their own approval.

### Background

- The ship skill has the sections Generic intake, Documentation impact, Loop routes, Start, Make the
  feature shippable, Deliver, Article and promotion handoff, After an authorized merge and Report
  (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:8-143`). Its Input paragraph names its push authority
  (`SKILL.md:16`). Deliver builds the PR body with `Closes #N` or `Refs #N` and no image step
  (`SKILL.md:105-107`). Ship confirms the repository and account before any GitHub write (`SKILL.md:74-75`),
  never stages unrelated dirty work (`SKILL.md:88-89`), and compares against `origin/<default>` for CI
  policy (`SKILL.md:97-98`).
- `tests/vh-adlc/direct-operation-compatibility.test.ts:12-100` holds each direct operation's body equal
  to a baseline after stripping sections it checks separately by required phrases: Loop routes
  (`:20-43`), Issue labels (`:44-63`), and for ship Article and promotion handoff and After an authorized
  merge (`:64-85`), with Documentation impact handled in the baseline (`:89-98`).
- The authority table grants an explicit ship request "Push the feature branch, create or update its
  PR, update the linked issue" (`plugins/vh-adlc/references/authority.md:27`), and the ship skill
  defers to it (`SKILL.md:15-16`).
- A Bun child that leaves a background process holds its output pipes open after it exits, and the rung
  runner waits for the pipes as well as the exit (`rungs.ts:59-63`; R-5 F-03 measured exit at 1 ms and
  pipes closed after 4002 ms for `sleep 4 &`).
- Loop settings accept a fixed key list and reject anything else:
  `plugins/vh-adlc/scripts/loop/settings.ts:54` defines `LOOP_SETTINGS_KEYS`, and `settings.ts:216`
  enforces it. A rung timeout must be a positive whole number of minutes (`settings.ts:131`). Every
  command except `review` loads working-tree settings before it dispatches
  (`plugins/vh-adlc/scripts/loop/cli.ts:80`), and `settingsFile` fails when a leftover
  `.vh-adlc/loop.yml` or `.json` exists (`plugins/vh-adlc/scripts/settings-file.ts:20-23`).
  `loadLoopSettingsAt` reads settings as committed (`settings.ts:246`). Required flags throw through
  `need` (`cli.ts:45`, `:78`).
- `plugins/vh-adlc/scripts/loop/git-paths.ts:30` reads committed paths with
  `diff --no-renames --name-only -z`. Rung commands run in their own process group (`rungs.ts:59`),
  which only the timeout handler kills, with SIGKILL (`rungs.ts:61`); exits 126 and 127 count as "could
  not run" (`rungs.ts:71`).
- Loop commands exit 2 on a thrown error (`cli.ts:185`), including a failed Git call (`rungs.ts:17`),
  and 3 for some verdicts (`cli.ts:156`, `:170`).
- After-merge cleanup "touches only that PR's head branch" (remote branch, tracking ref and local
  branches) and its worktree: `plugins/vh-adlc/references/branches.md:87-99`.
- The loop's Terms table has two columns, `| Term | Meaning |`
  (`plugins/vh-adlc/references/loop-settings.md:10`). Rejected synonyms live in the `TERMS` map of
  `tests/vh-adlc/loop/glossary.test.ts:8-17`, which fails on any lowercase substring match in the loop
  references and `scripts/loop/`. "planned" and "complete" are also feature document statuses.
- `tests/vh-adlc/check.test.ts:166-176` already requires `plugin.json` to equal the `.claude-plugin`
  manifest plus `$schema`. Upgrade notes for new loop settings live in `docs/reference/compatibility.md`
  (for example `:180`, for rung `stages`).
- Maintenance settings require a repository identity to "match origin" and a nonstandard GitHub
  hostname to be explicit (`plugins/vh-adlc/references/maintenance-settings.md:16`).
- The frontend testing standard at the repository's pin requires captures to be taken and inspected and
  missing evidence to be reported, and says "Redact credentials and session material before sharing
  artifacts" and "Do not put runtime secrets, private user data or captured sessions into Git"
  (`conventions/frontend-testing.md:77`, `:177-178` at `0c983f6793bfe35eb96ae95ad0c361c6200af44f`). It
  says nothing about images in a PR. "Captures show fixture data only" is new text in vhco-pro/docs#53.
- Probe, 2026-11-21: a parentless commit holding one PNG was pushed to `refs/pr-visuals/probe` in the
  private repository `michielvha/stackweaver`. Fetching
  `https://raw.githubusercontent.com/michielvha/stackweaver/721b0569fae72c29695d11c2c8af9fbafb24665a/probe.png`
  with the session's token returned `200 image/png`, 34604 bytes, and
  `gh api repos/michielvha/stackweaver/contents/probe.png?ref=721b0569...` returned size 34604. No branch
  contained the commit. The ref was deleted afterwards. Rendering of the `github.com/.../blob/<sha>`
  link form in a PR body for such a commit was not observed. After the deletion, R-5 F-05 found
  `gh api repos/michielvha/stackweaver/commits/721b0569...` still returning the commit and the contents
  API still returning the 34604-byte file: GitHub serves a commit by SHA after its only ref is gone.
- That repository's `remote.origin.url` is `https://michielvha@github.com/michielvha/stackweaver.git`
  (R-3 F-01), one of many URL forms; the PR names its repository unambiguously.
- `docs/specs/stage-scoped-verification-rungs.md` has merged and is `complete`.

## Scope

In scope:

- The optional `visual_record` loop setting and its validation.
- A `cli.ts visuals` command with a capture step, which runs the capture command once and keeps the
  images locally, and a push step, which stores them on `refs/pr-visuals/<PR number>`, checks the PR's
  repository holds them and prints the PR section.
- A new `## Visual record` section in the ship skill, after Deliver, and the matching change to
  `tests/vh-adlc/direct-operation-compatibility.test.ts`. Deliver and the Input paragraph stay as they
  are.
- The ship row of the authority table in `plugins/vh-adlc/references/authority.md`, which gains the push
  of `refs/pr-visuals/<number>`.
- New Terms rows, the loop settings reference, the workflows user guide with a copyable example for
  committed screenshots, a compatibility note in `docs/reference/compatibility.md`, and a minor plugin
  version bump.

Out of scope:

- Choosing screens, building either commit, writing capture scripts or seeding fixtures. Those stay with
  each adopter (owner decision, 2026-11-21).
- A separate source for screenshots the repository commits, or a shared helper for them; the capture
  command copies them (owner decision, 2026-11-21).
- Automatic image comparison of any kind, by bytes or pixels (owner decision, 2026-11-21).
- Parsing remote URLs; image upload to GitHub's attachment store, which has no API.
- Pruning old `refs/pr-visuals/*` refs. They are the record and are kept; only the owner's explicit
  request deletes one.
- Moving vh-adlc's own docs pin to the revision that holds the new rule. That is a separate reviewed
  change after [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53) merges.

## Design

### Terms

New rows in the two-column Terms table of `plugins/vh-adlc/references/loop-settings.md`, and new entries
in the `TERMS` map of `tests/vh-adlc/loop/glossary.test.ts`:

| Term | Meaning | Rejected synonyms (`TERMS`) |
| --- | --- | --- |
| Visual record | The before and after images of a UI delivery, linked at fixed commits. | `screenshot diff`, `visual diff` |
| Before and after section | The PR body text from vh-adlc's start marker through its end marker, headed `## Before and after`, that holds the visual record. | `screenshots section`, `visual section` |
| Record state | `not-applicable`, `preview`, `captured`, `full` or `partial`, as the `visuals` command reports it. | `visual verdict`, `record verdict` |

The third column is not added to the table; it lists what goes into `TERMS`. Reports write "record state
`full`" and so on, never the bare value.

### Setting

`.vh-adlc/loop.yaml` gains an optional `visual_record` key, added to `LOOP_SETTINGS_KEYS`:

| Field | Meaning |
| --- | --- |
| `when.paths` | Required, non-empty list of string globs. A delivery is UI-affecting when a committed path in the feature matches one. |
| `capture.command` | Required shell command that captures both sides in one run. |
| `capture.timeout_minutes` | Optional positive whole number, default 60, for the whole run. |

Invalid shapes, including a missing `capture` or `capture.command`, fail with a message naming the field,
like the rung validation. The `visuals` command is exempt from the working-tree settings load, like
`review`, and reads the block only as committed at HEAD through `loadLoopSettingsAt`; an uncommitted or
invalid working-tree `.vh-adlc/loop.yaml` changes nothing it does.

### Command

`bun scripts/loop/cli.ts visuals --repo <dir> --base <ref> --pr <number> --github <host>/<owner>/<repo> --out <dir> [--capture true | --push true]`
prints one JSON object. Without `--capture` or `--push` it previews.

It exits 2, like a thrown error in the other commands, when: the committed settings declare no
`visual_record` (message exactly "visual_record is not declared"); `--repo`, `--base`, `--pr`,
`--github` or `--out` is missing; `--pr` is not a positive whole number; `--github` is not
`<host>/<owner>/<repo>`; both `--capture` and `--push` are given; with `--capture`, `--out` exists and is
not empty, or lies inside the repository's working tree (a nonexistent `--out` is created); with
`--push`, `<out>/capture.json` is missing or was written for another base, head or PR; the committed
settings can't be read; the directory is not a Git checkout; or `git merge-base` fails. Every other
outcome exits 0 with a `state`. On SIGINT or SIGTERM during a capture it kills the capture's process
group before exiting.

Output, in every case where it exits 0:

| Field | Value |
| --- | --- |
| `state` | `not-applicable`; `preview` (no step); `captured` or `partial` (capture step); `full` or `partial` (push step). |
| `base`, `head` | Full SHAs of the merge base and HEAD. |
| `ref` | `refs/pr-visuals/<number>`. |
| `ref_commit` | The pushed commit's full SHA, or `null` when nothing was pushed. |
| `pairs` | One object per screen: `name` (the file stem), `before_file`, `after_file`, `before_url`, `after_url`. A file is `null` for an absent side; URLs are `null` until a verified push. Empty in `preview`. |
| `missing` | One object per gap: `item` and `reason`. Empty in `preview`. |
| `markdown` | The section text after the push step; `""` otherwise. |

Steps:

1. **Applicability.** Paths come from the committed range only, `git diff --no-renames --name-only -z
   <merge-base> HEAD`; uncommitted and untracked files never count. When none matches `when.paths`,
   `state` is `not-applicable` and the command stops. Without a step flag, `state` is `preview` and the
   command stops without running anything.
2. **Capture step (`--capture true`).** The command creates `<out>/before/` and `<out>/after/`, then runs
   `capture.command` once, with its working directory at the feature checkout's root and these
   variables: `VH_ADLC_VISUAL_BASE` and `VH_ADLC_VISUAL_HEAD` (the merge-base and HEAD SHAs) and
   `VH_ADLC_VISUAL_OUT` (`<out>`). Each side must show its given commit, never the working tree, and the
   command must not change the feature checkout; building each commit is the adopter's job. Files
   directly in each directory whose extension is `.png`, `.webp`, `.jpg` or `.jpeg`, in any letter case,
   are the captures; the file stem is the screen name, and sides pair by stem. A stem on one side only is
   a one-sided screen, added or removed. Two files with one stem on one side are a missing item, and
   that stem is dropped from both sides. The result is decided when the capture command exits, not when
   its output pipes close; at that point the step kills whatever is left of the capture's process group,
   so a server it started in the background never holds the run. The time limit and 126 or 127 handling
   follow the rung runner. Images count only when the command exited 0; after a non-zero exit, a command
   that could not run, or a timeout, no image is used, because a killed write can leave a truncated file. The step writes its result,
   including base, head and PR, to `<out>/capture.json` and reports `captured` when it has images and
   nothing is missing, otherwise `partial`. It pushes nothing.
3. **Push step (`--push true`).** It reads `<out>/capture.json` and the images it lists. Nothing is
   compared. When there is no image, it pushes nothing and `ref_commit` is `null`. Otherwise it reads the
   remote tip with `git ls-remote origin refs/pr-visuals/<number>`, fetches that commit when it exists,
   and builds a commit whose tree holds `before/<file>` and `after/<file>` with plumbing only
   (`hash-object -w`, `mktree`, `commit-tree`), with the remote tip as parent when it exists. It pushes
   with `git push origin <commit>:refs/pr-visuals/<number>`, never forced; a push rejected because the
   ref moved is rebuilt on the new tip and retried once. It then runs
   `gh api --hostname <host> repos/<owner>/<repo>/commits/<ref_commit>`; only when that succeeds do the
   URLs get set, so links never point at a repository that doesn't hold the commit. Its own Git operations
   never create or move a local ref and never change the checkout's index, HEAD, branches or working
   files; Git may write `FETCH_HEAD`.
4. **Section.** The push step's `markdown` starts with the line `<!-- vh-adlc:visual-record -->`, then
   `## Before and after`, and ends with the line `<!-- /vh-adlc:visual-record -->`; the heading is inside
   the markers. When URLs are set, a table with the columns `Screen`, `Before` and `After` follows the heading, one row per
   screen; each image cell is `![<name> before](<url>)` or `![<name> after](<url>)`, and an absent side's
   cell is `none`. Every URL has the form
   `https://<host>/<owner>/<repo>/blob/<ref_commit>/<before|after>/<file>?raw=true`, with each path segment
   percent-encoded. When nothing was pushed or verified, there is no table. A `### Missing` list follows
   when `missing` is not empty, before the closing marker.

**State.** The push step reports `full` when at least one image is linked and nothing is missing, and
`partial` when anything is missing, including every missing item the capture step recorded. Missing
reasons, the full list: the capture exited non-zero (with the code); it could not run (126 or 127); it
timed out; it wrote no images at all (this replaces the two one-side reasons); it wrote no before
images; it wrote no after images; it wrote two files with one stem on one side; `ls-remote` or `fetch`
failed; building the commit failed (`hash-object`, `mktree` or
`commit-tree`); the push failed or was rejected twice; the PR's repository does not hold the pushed
commit (or `gh` failed). Images not pushed keep their local files.

### Ship

A new `## Visual record` section in the ship skill, after Deliver, carries every visual record step;
Deliver and the Input paragraph are unchanged. `direct-operation-compatibility.test.ts` strips that
section before comparing the ship body, as it does for Issue labels, and requires each statement in the
AC-07 Test Plan row inside it. The section says:

1. The ship request's push authority covers `refs/pr-visuals/<number>`, as the ship row of
   `references/authority.md` says; that push happens after ship's repository and account confirmation
   and needs no separate approval.
2. After Deliver creates or updates the PR, ship runs `git fetch origin <default branch>`, takes
   `<host>/<owner>/<repo>` from the PR's URL (`gh pr view <number> --json url`), and runs
   `bun scripts/loop/cli.ts visuals --repo <owning worktree> --base origin/<default branch> --pr <number> --github <host>/<owner>/<repo> --out <new empty directory outside the repository> --capture true`.
3. vh-adlc's section is the text from its start marker through its end marker, heading included. On exit
   2 with "visual_record is not declared", or on `not-applicable`, ship removes that text, if present,
   and does nothing else. A `## Before and after` section without the markers is never touched.
4. On `captured` or `partial`, it looks at each pair's `before_file` and `after_file`. When any image shows
   a credential, a session or real user data, or a file can't be viewed as an image, it never runs the
   push step: it writes the marked section itself, holding one line, "Visual record missing: ship withheld
   the images after inspection", with the reason, and reports that to the owner.
5. Otherwise it runs the same command with `--push true` in place of `--capture true`.
6. It puts the push step's section last in the PR body, replacing the whole earlier text between
   vh-adlc's markers, so one heading remains. `Closes` or `Refs` and every other part of the body stay
   outside the markers. Earlier records stay reachable through the ref's history.
7. Inside the markers, under the table, it adds one line per changed state no capture shows, such as an
   open dialog, and says why; and, when it inspected every pair and saw no visible difference, the line
   `No visible change` with the number of screens it inspected.
8. On any other exit 2, or when a step produced no output, it writes a marked section holding one line,
   "Visual record missing:", with the reason.
9. A `partial` record or a missing record never blocks the delivery (owner decision, 2026-11-21). The
   report repeats every missing item.
10. Deleting `refs/pr-visuals/<number>` (`git push origin --delete refs/pr-visuals/<number>`) happens only
    on the owner's explicit request. GitHub still serves the commit by SHA after the ref is gone, and the
    PR's edit history keeps the links, so removing a leaked image takes GitHub support; inspecting before
    the push is the protection.

### Concurrency, failure, retry, upgrade

- **Concurrent ships.** Each run writes only to its own `--out` directory and its PR's ref. Where
  reservations are adopted, they keep two writers off one feature. In every case a ref push that loses a
  race is rebuilt on the new tip and retried once; a second rejection is a missing item.
- **Killed runs.** On SIGINT or SIGTERM, and after the capture command exits normally, the capture step
  kills the capture's process group. A run killed
  with SIGKILL can leave the capture's processes and whatever the adopter's command created, such as
  servers or build output, so the guide tells adopters to make their command tolerate leftovers from an
  earlier run. The command registers nothing in the repository that a later run must clean.
- **Retry and replay.** Each ship whose push step stored images appends a commit on top of the previous
  tip (owner decision, 2026-11-21). The PR links the newest commit, and pushes stay fast-forward.
- **Upgrade and rollback.** Settings without `visual_record` parse to the same object as today. A plugin
  older than this feature rejects the new key (`settings.ts:54`, `:216`), so adopters upgrade first, as
  the compatibility note says. Rolling back means removing the block; the next ship removes the marked
  section, and existing refs stay and harm nothing.
- **Visibility.** The ref has the repository's visibility. Ship inspects every image before the push,
  the pinned redaction rules above apply, and the proposed rule in vhco-pro/docs#53 adds that captures
  show fixture data only.

### Coordination

The feature branch starts from the current default branch, which already holds
`stage-scoped-verification-rungs`.

## Acceptance Criteria

- [ ] AC-01: Loop settings accept `visual_record` with a non-empty `when.paths` and a `capture` with a
  `command` and an optional `timeout_minutes`. A block without `capture` or `capture.command`, an empty
  `when.paths`, a non-string glob, or a non-positive or fractional timeout is rejected with a message
  naming the field. Settings without the key parse to the same object as before this feature. `visuals`
  uses the block as committed at HEAD, and an invalid or different working-tree settings file changes
  nothing it does.
- [ ] AC-02: `cli.ts visuals` reports record state `not-applicable` when no committed path in the feature
  matches `when.paths`, even when uncommitted or untracked files would match. Otherwise, without a step
  flag, it reports record state `preview` with empty `pairs`, `missing` and `markdown`, and runs nothing.
  Each exit-2 condition in the design exits 2, and a nonexistent `--out` is created.
- [ ] AC-03: The capture step runs the capture command once from the feature checkout's root with
  `VH_ADLC_VISUAL_BASE`, `VH_ADLC_VISUAL_HEAD` and `VH_ADLC_VISUAL_OUT` set. Images in `before/` and
  `after/` with the four accepted extensions in any case pair by stem, each with a local file; a stem on
  one side only is a one-sided screen; other files are ignored; nothing is pushed; and the result is
  written to `<out>/capture.json`.
- [ ] AC-04: The push step pushes the captured images to `refs/pr-visuals/<number>` without force, in a
  commit whose parent is the previous remote tip when the ref exists, and retries once on the new tip
  after a rejection because the ref moved. When there is no image, nothing is pushed and `ref_commit` is
  `null`. URLs are set only after `gh api` confirms the PR's repository holds `ref_commit`. The command's
  own operations leave the checkout's `git status --porcelain`, `git rev-parse HEAD` and local refs
  unchanged. Neither SIGTERM during a capture nor a capture that exits 0 with a background process still
  running leaves a process of the capture's group behind, and the latter's images are used.
- [ ] AC-05: Each missing reason in the design's full list yields record state `partial` with that reason
  in `missing` and in the section, and exit 0. A failed, unrunnable or timed-out capture contributes no
  image, an empty capture yields only "it wrote no images at all", a duplicate stem on one side drops
  that stem from both sides, and when nothing was pushed or verified the section has no table.
- [ ] AC-06: The section opens with the start marker and then `## Before and after`, ends with the end
  marker, and holds a `Screen | Before | After` table of embedded images whose URLs use the `--github`
  host, owner and repository, `ref_commit` and `before/` or `after/`, with path segments percent-encoded
  and `none` for an absent side. Each `<ref_commit>:<path>` exists and matches the pair's local file byte
  for byte.
- [ ] AC-07: The ship skill's `## Visual record` section contains each statement the AC-07 Test Plan row
  lists, the rest of the ship skill body is unchanged, and the ship row of `references/authority.md`
  names the `refs/pr-visuals/<number>` push.
- [ ] AC-08: `branches/cli.ts after-merge` leaves every `refs/pr-visuals/*` ref in place.
- [ ] AC-09: The loop settings reference and the workflows guide each document every `visual_record`
  field and default, the three environment variables, the output layout, the four accepted extensions in
  any letter case, stem pairing, that each side shows its given commit, that the command builds no
  checkouts, the two steps with inspection between them, tolerance of leftovers, the ref name, retention,
  deletion on the owner's request and that GitHub still serves a deleted ref's commit by SHA, visibility
  and the upgrade order; the guide also gives a copyable example that copies a committed screenshot for
  each side with Git's filters applied. `docs/reference/compatibility.md` notes the new key and the
  upgrade order. The Terms table holds the three new rows, `TERMS` holds their rejected synonyms, and both
  plugin manifests carry the same version, one minor version above the merge base's.
- [ ] AC-10: On a private GitHub repository, a shipped fixture change shows the PR body's images inline
  to a signed-in reader with access, including at least one image from a `refs/pr-visuals/*` commit that
  no branch contains.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/settings.test.ts`: valid and invalid `visual_record` shapes, each rejection's field name; for settings without the key, `loadLoopSettings` and `loadLoopSettingsAt` return no `visual_record` key while the existing expectations in `settings.test.ts`, `cli.test.ts` and `rungs.test.ts` pass unchanged. `tests/vh-adlc/loop/visuals.test.ts`: a fixture whose working-tree `.vh-adlc/loop.yaml` names a different capture command from the committed one, where the committed one runs; and one whose working-tree file is invalid YAML while the committed block is valid, where the capture succeeds. |
| AC-02 | `visuals.test.ts`: fixtures whose committed range does and doesn't match; one with a matching file only uncommitted and one only untracked, both `not-applicable`; a `preview` run asserting empty `pairs`, `missing` and `markdown`, with a capture command that writes a marker file to prove it did not run. Exit 2 for: no `visual_record` committed (asserting the exact message), each of `--repo`, `--base`, `--pr`, `--github` and `--out` missing, `--pr x`, `--github acme/app`, both step flags, a non-empty `--out` and an `--out` inside the repository with `--capture`, `--push` without `capture.json` and with a `capture.json` for another PR, unreadable committed settings, a non-Git directory, and a `--base` with no merge base. A nonexistent `--out` with `--capture` is created. |
| AC-03 | `visuals.test.ts`: a capture script that records its working directory and the three variables and writes `home.png`, `list.WEBP`, `card.jpeg` and `notes.txt` to `before/`, and `home.png`, `list.webp` and `new.jpg` to `after/`; assert pairs for `home` and `list`, one-sided `card` and `new`, `notes.txt` ignored, every local file present, `capture.json` written, and no ref on the bare origin. |
| AC-04 | `visuals.test.ts`: origin is a local bare repository and `gh` is replaced by a stub on `PATH` that succeeds or fails on demand. Push twice and assert the second commit's parent and a fast-forward without force; move the remote ref between `ls-remote` and push and assert one rebuilt retry; a capture with no images yields no push and `ref_commit: null`; a failing `gh` stub yields `null` URLs and the missing reason; with staged and unstaged unrelated changes present, `git status --porcelain`, `git rev-parse HEAD` and `git for-each-ref` are identical before and after; a capture script that starts a child sleeping for minutes and writes its PID, then SIGTERM to the command, after which that PID no longer exists; and a capture script that writes one image per side, starts `sleep 600 &`, writes its PID and exits 0, after which the step returns within ten seconds, uses both images, and that PID no longer exists. |
| AC-05 | `visuals.test.ts`: one case per missing reason in the design's list, each asserting record state `partial`, the `missing` entry, the section text and exit 0; the timeout case passes a sub-minute limit to the function under test; a script that writes images and then exits 1 contributes no image; a script that writes nothing yields only "it wrote no images at all"; a script that writes `before/home.png`, `before/home.webp` and `after/home.png` yields the one-stem reason and no `home` pair or one-sided screen; a failed push yields a section with no table row. |
| AC-06 | `visuals.test.ts` with `--github github.com/acme/app` and with `--github ghe.example.com/acme/app`: parse the section; assert the first two lines are the start marker and the heading and the last line is the end marker, the header row `\| Screen \| Before \| After \|`, that every image cell matches `!\[[^\]]+ (before\|after)\]\(https://<host>/acme/app/blob/<ref_commit>/(before\|after)/[^)]+\?raw=true\)` for that host, that an absent side's cell is `none`, that a file named `my screen.png` appears as `my%20screen.png`, and that `git cat-file -p <ref_commit>:<path>` in the bare repository equals the pair's local file. |
| AC-07 | `tests/vh-adlc/direct-operation-compatibility.test.ts` strips the ship skill's `## Visual record` section before the body comparison, which still passes, and requires inside it, split into paragraphs (blank-line separated, each list item its own paragraph) and matched case-insensitively, one paragraph per statement; each fail sentence, substituted alone into otherwise passing text, makes the check fail. (1) `push authority` with `refs/pr-visuals/`: passes "The ship request's push authority covers `refs/pr-visuals/<number>`", fails "Push the ref". (2) `git fetch origin`: passes "run `git fetch origin <default branch>`", fails "fetch". (3) `visuals`, `--repo`, `--base origin/`, `--pr`, `--github`, `--out` and `--capture true`: passes "run `bun scripts/loop/cli.ts visuals --repo <owning worktree> --base origin/<default branch> --pr <number> --github <host>/<owner>/<repo> --out <dir> --capture true`", fails the same command without `--repo`. (3a) `gh pr view` with `url` and `--github`: passes "take `--github` from the PR's URL with `gh pr view <number> --json url`", fails "take `--github` from `origin`". (4) `not-applicable` and `visual_record is not declared` with `remov`, `start marker` and `end marker`: passes "On \"visual_record is not declared\" or `not-applicable`, remove the text from vh-adlc's start marker through its end marker", fails "On `not-applicable`, stop". (5) `without the markers` with `never touched`: passes "A `## Before and after` section without the markers is never touched", fails "Replace any `## Before and after` section". (6) `before_file`, `after_file`, `credential`, `session`, `user data`, `viewed` and `withheld`, with `never runs the push step`: passes "Look at each pair's `before_file` and `after_file`; if one shows a credential, a session or real user data, or a file can't be viewed as an image, never run the push step and write the marked section saying ship withheld the images", fails the same sentence without "a session or real user data", and "Look at the pairs". (7) `--push true`: passes "Otherwise run the same command with `--push true`", fails "Then push the images". (8) `last` with `replac` and `marker`: passes "Put the section last, replacing an earlier section between vh-adlc's markers", fails "Add the section". (9) `no capture shows`: passes "Add a line for each changed state no capture shows", fails "Mention other states". (10) `No visible change` with `inspected`: passes "Write `No visible change` only when you inspected every pair", fails "Write `No visible change` when nothing changed". (11) `Visual record missing`: passes "write a marked section holding \"Visual record missing:\" and the reason", fails "report the error". (12) `never blocks` or `does not block`, with `partial` and `missing record`: passes "A `partial` record or a missing record never blocks the delivery", fails "A `partial` record never blocks the delivery". (13) `report` with `missing item`: passes "The report repeats every missing item", fails "The report summarizes the delivery". (14) `--delete refs/pr-visuals/` with `owner` and `by SHA`: passes "Delete the ref with `git push origin --delete refs/pr-visuals/<number>` only on the owner's explicit request; GitHub still serves the commit by SHA", fails "Delete the ref when needed". (15) The ship row of `plugins/vh-adlc/references/authority.md`, read by the same test, contains `refs/pr-visuals/`: passes "Push the feature branch and `refs/pr-visuals/<number>`, create or update its PR, update the linked issue", fails "Push the feature branch, create or update its PR, update the linked issue". |
| AC-08 | `tests/vh-adlc/branches/branches.test.ts`: a merged-PR fixture with `refs/pr-visuals/7` on the remote; after `after-merge`, the ref resolves to the same commit. |
| AC-09 | `tests/vh-adlc/loop/visuals-docs.test.ts` reads `plugins/vh-adlc/references/loop-settings.md` and `docs/user-guides/workflows.md` and requires in each: `visual_record.when.paths`, `visual_record.capture.command`, `visual_record.capture.timeout_minutes`, `default 60 minutes`, `VH_ADLC_VISUAL_BASE`, `VH_ADLC_VISUAL_HEAD`, `VH_ADLC_VISUAL_OUT`, `<out>/before/`, `<out>/after/`, `.png`, `.webp`, `.jpg`, `.jpeg`, `--capture true`, `--push true`, `refs/pr-visuals/`, and the phrases `any letter case`, `paired by file stem`, `never the working tree`, `builds no checkouts`, `inspected before the push`, `tolerate leftovers`, `kept after merge`, `owner's explicit request`, `still serves the commit by SHA`, `repository's visibility` and `upgrade the plugin before`; in the guide, `git cat-file --filters "$VH_ADLC_VISUAL_BASE:`; and in `docs/reference/compatibility.md`, `visual_record` with `upgrade the plugin before`. Must pass: a text with all of them; must fail: the same text without `visual_record.capture.timeout_minutes`, without `kept after merge`, and without `.webp`. `tests/vh-adlc/loop/glossary.test.ts` holds the three rows and their `TERMS` entries; `tests/vh-adlc/check.test.ts:166-176` holds manifest equality; at review, `git show $(git merge-base origin/main HEAD):plugins/vh-adlc/plugin.json` compared with HEAD shows a minor bump, recorded in the review. |
| AC-10 | Manual procedure: in a private GitHub repository the owner selects, adopt `visual_record` with a capture command that writes one image per side, ship a one-line UI change, open the PR signed in as a reader with access, and record that every image renders inline, naming one from a `refs/pr-visuals/*` commit and confirming with `git branch -r --contains <sha>` that no branch holds it. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner settled every judgement call on 2026-11-21: disclose a missing record and ship, append
to the ref, no automatic comparison, a ref named by PR number, the project's command captures both sides
and is the only image source, the GitHub host, owner and repository come from the PR, images are pushed
only after inspection, and the recommended resolution of the remaining judgement findings of reviews
R-1 to R-5.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | R-1 | spec | `35b30950` | claude-opus-5-5 | procedural | 1 blocking, 20 should-fix, 4 nits |
| 2026-11-21 | R-2 | spec | `630c3d2a` | claude-opus-5-5 | procedural | 1 blocking, 11 should-fix, 1 nit |
| 2026-11-21 | R-3 | spec | `b8be9f60` | claude-opus-5-5 | procedural | 2 blocking, 10 should-fix, 3 nits |
| 2026-11-21 | R-4 | spec | `baf9eba0` | claude-opus-5-5 | procedural | 1 blocking, 5 should-fix, 3 nits |
| 2026-11-21 | R-5 | spec | `fdfe84c7` | claude-opus-5-5 | procedural | 0 blocking, 9 should-fix, 1 nit |
| 2026-11-21 | R-6 | spec | `10298ec8` | claude-opus-5-5 | procedural | 1 blocking, 7 should-fix, 4 nits |

### R-1

TARGET: 35b30950a5ec5a125364efb5663e299ecd602919

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design > Command (the `missing` list, "a remote whose URL is not GitHub"); Scope, out of scope ("Remotes other than GitHub"); AC-06; Test Plan row AC-06
EVIDENCE: The design never says which URL decides "GitHub" or which URL forms count. The AC-06 proof uses "a fixture whose configured URL names github.com while `url.<base>.insteadOf` sends fetch and push to the local bare repository". In a scratch repository with `remote.origin.url=https://github.com/acme/app.git` and `url.<bare>.insteadOf https://github.com/acme/app.git`, `git remote get-url origin` printed the local bare path, while `git config remote.origin.url` printed `https://github.com/acme/app.git`. So an implementation that reads the effective URL with `git remote get-url`, which the design allows, classifies the fixture as non-GitHub, and the AC-06 proof fails it. The design is also silent on `git@github.com:o/r.git`, `ssh://git@github.com/o/r`, a `.git` suffix and SSH host aliases.
PROPOSAL: State that owner and repo come from the raw `remote.origin.url`, list the accepted GitHub URL forms (https, scp-style SSH, ssh://, with or without `.git`), and add must-pass and must-fail URL examples to the AC-06 row.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers`; Background (reuse of `featureDelta` and the time-limit and process-group kill code in `rungs.ts`); AC-08, AC-09 and AC-10 with their Test Plan rows
EVIDENCE: The design reuses `featureDelta` and the path matching in `plugins/vh-adlc/scripts/loop/rungs.ts:23-38`, which calls `diffPaths` and `statusEntries` in `plugins/vh-adlc/scripts/loop/git-paths.ts`. AC-09 depends on `plugins/vh-adlc/scripts/branches/` (only refs/heads and refs/remotes/origin are touched, `branches.ts:352-505`). The proofs live in `tests/vh-adlc/branches/branches.test.ts`, `tests/vh-adlc/settings-references.test.ts` and `tests/vh-adlc/direct-operation-compatibility.test.ts`. None of these is in `covers`, which lists only `tests/vh-adlc/loop/` among tests. The sibling spec `stage-scoped-verification-rungs` (on `feat/stage-scoped-rungs`) does cover `direct-operation-compatibility.test.ts`, and it is changing `rungs.ts`. A change to any of these paths would not stale reviews or show in `feature_tree_clean`.
PROPOSAL: Add `plugins/vh-adlc/scripts/loop/rungs.ts`, `plugins/vh-adlc/scripts/loop/git-paths.ts`, `plugins/vh-adlc/scripts/branches/` and the three test files outside `tests/vh-adlc/loop/` to `covers`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3; Design > Setting (`capture.command`, "run once per side from that side's worktree root"); AC-04; Owner summary (second paragraph)
EVIDENCE: Settings are read from the working tree (`loadLoopSettings(repo)`, `cli.ts:80`), but the command string runs with its working directory in the merge-base worktree. A capture script the feature adds (say an adopter's first UI PR that also adds `scripts/capture.sh` and the `visual_record` block) does not exist on the before side, and a script the feature changes runs in its old version there. The design doesn't say whether the before side uses the base tree's script, the head's script or a copy, so two implementers would build different things and the before side of a first adoption always fails.
PROPOSAL: Say which version of the capture script and settings each side runs (for example the head's command string, with documented behaviour when its script is missing at the base), and add a fixture case to the AC-04 row where the script exists only at HEAD.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design > Command step 1 ("The delta comes from `featureDelta`") and step 3 ("uncommitted work is never captured"); AC-02; Owner summary ("When the feature's delta matches")
EVIDENCE: `featureDelta` with a base returns committed paths plus every uncommitted and untracked path in the worktree: `plugins/vh-adlc/scripts/loop/rungs.ts:29-32` (`statusEntries(repo, ["--untracked-files=all"])`). Ship leaves unrelated dirty work in place (`vh-adlc-ship/SKILL.md:81-82`). So unrelated dirty UI files make a delivery applicable, the command captures committed HEAD (which has no UI change) and ship writes "No visible change" or an empty section into a PR that changes no UI.
PROPOSAL: Decide applicability from the committed range only (merge base to HEAD), consistent with capturing committed HEAD, and add a dirty-worktree fixture to the AC-02 row.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design > Command step 2; AC-03; Test Plan row AC-03
EVIDENCE: Step 2 uses `git diff --name-status <merge-base>..HEAD` and defines only modified, added and deleted files. Without `--no-renames`, Git reports a moved or renamed capture as `R<score>`, which none of the three rules covers. The repository's own path reads use `--no-renames` and NUL-delimited output so a rename counts as both paths and spaces survive: `plugins/vh-adlc/scripts/loop/git-paths.ts:29-31` (`diff --no-renames --name-only -z`).
PROPOSAL: Specify `git diff --no-renames --name-status -z`, so a rename is a delete plus an add, and add a renamed capture and a path with a space to the AC-03 fixture.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design > Command step 1 ("the result is `{applicable: false}`"); Design > Command, the `state` paragraph ("`not-applicable` as above"); AC-02; Test Plan row AC-02
EVIDENCE: Step 1 gives the not-applicable result as `{applicable: false}`, while the state paragraph and AC-02 call it `state: not-applicable`. The JSON shape without `--run` ("lists the committed pairs it would link") has no defined `state` at all. Tests assert JSON fields, so two implementers would emit different objects.
PROPOSAL: Define one output schema for every case (with and without `--run`), naming each field and the `state` value in each, and use it in step 1, the state paragraph and AC-02.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 ("the file name is the screen name. Sides pair by name"); AC-04
EVIDENCE: The design accepts `.png`, `.webp` and `.jpg` but doesn't say whether the extension is part of the name. With the extension, `home.png` before and `home.webp` after never pair. Without it, `home.png` and `home.jpg` on one side collide, and the stored paths `before/<name>` and `after/<name>` become ambiguous.
PROPOSAL: State whether pairing uses the full file name or the stem, and what happens on a stem collision within one side, then cover both in the AC-04 row.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 4; AC-05; Test Plan row AC-05
EVIDENCE: Ship runs this command in the feature's owning worktree, which may hold unrelated dirty or staged work that ship must never stage (`vh-adlc-ship/SKILL.md:81-82`). Step 4 says the command "builds a commit" for the ref but doesn't say it must use plumbing with a temporary index (`hash-object`, a private `GIT_INDEX_FILE`, `mktree` or `commit-tree`) and leave the checkout's index, HEAD and branch untouched. No proof checks that the feature checkout's index and HEAD are unchanged after a run, or where the fetched tip is stored (FETCH_HEAD or a local ref).
PROPOSAL: Require that the command never changes the feature checkout's index, HEAD, branches or worktree files, say where the fetched tip is kept, and assert in the AC-05 row that `git status --porcelain` and `git rev-parse HEAD` are unchanged by a run.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command, the `state` paragraph ("`complete` when every requested source produced its images"); Design > Ship ("When every capture is unchanged it writes 'No visible change'"); AC-06; AC-08; frontmatter `goal`
EVIDENCE: The goal says the PR carries images "or says which images are missing and why". An adopter with only `committed` globs whose UI change didn't update any screenshot gets an applicable delivery with zero pairs. Every requested source "produced its images" (none), so `state` is `complete` and ship prints an empty "Before and after" section with nothing marked missing. The "No visible change" rule is also undefined when captured images are all unchanged but committed captures changed.
PROPOSAL: Make an applicable delivery that yields no image at all `incomplete`, with a reason in `missing`. Define "No visible change" as no committed pair and no changed capture, and cover both in AC-06 and AC-08.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship ("puts the section into the PR body"); Design > Concurrency, failure, retry, upgrade ("Retry and replay"); AC-08
EVIDENCE: Ship "creates or updates" the PR (`vh-adlc-ship/SKILL.md:98`), and the design makes every ship append a new ref commit. It doesn't say whether a re-ship replaces the existing "Before and after" section in the body or adds another one, or how it finds the old section. Replay is defined for the ref only, so two implementers would produce either one current section or a growing stack of stale ones.
PROPOSAL: State that a re-ship replaces the earlier section (and how it is delimited, for example by its heading up to the next heading) and that earlier records stay reachable only through the ref history. Add that to AC-08.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 and the `state` paragraph; Design > Concurrency, failure, retry, upgrade ("Partial failure"); AC-04; AC-06
EVIDENCE: The `missing` reasons are a closed list (non-zero exit, timeout, empty directory, non-GitHub remote, push rejected twice). Unclassified: `git worktree add` failing, a capture command that cannot run (126 or 127, which `runRungs` treats separately at `rungs.ts:59`), a fetch failure, and a push that fails for authentication or network rather than a moved ref. Each of these could reasonably exit 2 or report `incomplete`. Cleanup is promised for "success, failure and timeout" but not when the CLI itself is killed. The two default 30-minute sides can outlast a host's foreground tool limit, which leaves registered temporary worktrees and orphan processes that the next run doesn't prune. Whether the two sides run sequentially or in parallel (port clashes for adopter servers) is also unstated.
PROPOSAL: Classify every git and process failure as either a `missing` reason or an exit 2. Run the sides sequentially, and have the command prune its own leftover temporary worktrees, by a recognisable path prefix, at the start of each run. Add those cases to AC-04 and AC-06.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: AC-07; Test Plan row AC-07; Design > Command step 5
EVIDENCE: The AC-07 proof asserts only that every image URL "contains a 40-character SHA and no branch name". An implementation that links captured images at the HEAD SHA (where `before/<name>` does not exist), at the wrong commit, or with an unencoded path containing a space passes it. AC-03 checks committed links only, and AC-05 checks the ref's parent, not the links.
PROPOSAL: Have the AC-07 row assert that each captured image URL uses the pushed ref commit and `before/<name>` or `after/<name>`, that committed links use the merge-base and HEAD SHAs, that `git cat-file -e <sha>:<path>` succeeds for every link, and that path segments are percent-encoded.

FINDING: F-13
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan (all rows); AC-07; Background (the probe); Owner summary ("Observed so far")
EVIDENCE: The problem is that a reviewer can't see the old and new look. Every proof runs against local repositories, so all boxes can be ticked without an image ever rendering on GitHub. The probe fetched `raw.githubusercontent.com/...` with a token and the contents API (I confirmed via `gh api repos/michielvha/stackweaver/commits/721b0569...` that this is a parentless commit holding `probe.png`, that no `refs/pr-visuals/*` remains, and that the repository is private). The design's link form is `https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true` rendered in a PR body. The cited hand-made comment (stackweaver#1177) used that form only for commits on branches, never for a commit that only a custom ref holds.
PROPOSAL: Add a written manual procedure to the AC-07 row (or a new criterion): ship a fixture change to a private GitHub repository and confirm that the PR body's images render for a reader with access, including one from a `refs/pr-visuals/*` commit.

FINDING: F-14
KIND: judgement
SEVERITY: should-fix
WHERE: AC-01; Test Plan row AC-01; Design > Concurrency, failure, retry, upgrade ("output identical to today for every command")
EVIDENCE: The proof is "a snapshot comparison of every command's output for settings without the key". A snapshot recorded with the new code compares the new code to itself, and "every command" includes `claim`, `review`, `delivery`, `skip` and `ci`, which need remotes, `gh` or command routes (`cli.ts:81-171`). The row names neither a baseline nor a command list, so it can pass on a wrong implementation or be unexecutable.
PROPOSAL: Name the observable that carries settings into output (for example that `loadLoopSettings` and `loadLoopSettingsAt` return no `visual_record` key and deep-equal a fixed expected object, and that `context` and `rungs` output is unchanged against stated expected JSON), and list the commands the row runs.

FINDING: F-15
KIND: judgement
SEVERITY: should-fix
WHERE: AC-10; Test Plan row AC-10; Scope ("a minor plugin version bump")
EVIDENCE: AC-10 requires both manifests to be "one minor version above the version they had before this feature". The proof extends `tests/vh-adlc/loop/plugin-version.test.ts`, which today tests session staleness (`pluginStatus`), not manifest history. A committed test can only hardcode a version, which breaks on the next release, or compare to `origin/main`, which becomes equal after merge (`tests/vh-adlc/check.test.ts:224-232` already compares the `.claude-plugin` version to `origin/main` and only asserts that it differs). The sibling stage-scoped feature also bumps the minor version first, so the base moves.
PROPOSAL: Prove manifest equality with a committed test and the minor bump with a stated check against the merge base (for example comparing both manifests at `git merge-base origin/main HEAD`), skipped when the package is unchanged.

FINDING: F-16
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-08
EVIDENCE: The row is a "skill-text check" on `vh-adlc-ship/SKILL.md`, which judges free text with a pattern. The standard says such a proof "lists its must-pass and must-fail examples in the row" (`conventions/feature-documents.md`, Test plan). The row lists none, so the pattern and what it accepts are undefined.
PROPOSAL: State the exact phrases or patterns the check requires (the `visuals --run true` command, the section placement, the uncaptured-state line, "No visible change", not blocking on `incomplete`) with at least one must-pass and one must-fail example each.

FINDING: F-17
KIND: factual
SEVERITY: should-fix
WHERE: Design > Coordination ("or rebases onto it before review"); Background (last bullet)
EVIDENCE: The pinned delivery convention says that a feature branch "takes follow-ups as new commits and the default branch by merge; it is never amended, rebased or force-pushed once a review has cited its commits", and "a feature branch merges the default branch in instead" (`conventions/delivery.md:36`, `:103-105` at 0c983f6). Rebasing a pushed feature branch also contradicts ship's "never ... rewrite a pushed commit" (`vh-adlc-ship/SKILL.md:106`).
PROPOSAL: Replace the rebase option with starting the branch after `feat/stage-scoped-rungs` merges, or merging the default branch into this branch once it does.

FINDING: F-18
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions ("None. The owner settled the two judgement calls"); Scope, out of scope ("Comparison is byte equality only"); Design > Command step 4 (`refs/pr-visuals/<branch>`); Design > Setting (default `timeout_minutes` 30); Owner summary ("Two decisions came from the owner")
EVIDENCE: The standard says "Every trade-off the document settles is an open question" (`conventions/feature-documents.md`, Open questions). The document settles at least two more without asking. First, byte equality: screenshots of the same UI are rarely byte-identical across runs, so "No visible change" seldom fires and every ship stores every capture in a ref that is kept forever. Second, keying the ref by branch name: after `after-merge` deletes a branch, a later PR reusing the name appends to the old PR's ref, and a ref `refs/pr-visuals/a/b` would block a later `refs/pr-visuals/a`. The proposed shared rule in vhco-pro/docs#53 calls the ref "one per pull request (`refs/pr-visuals/<branch>`)", which these collide with.
PROPOSAL: Raise the comparison method and the ref key (branch name, PR number, or branch plus first-ship SHA) as owner questions with options, or record the owner's decisions where they were already made.

FINDING: F-19
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 5 and Design > Ship; AC-07; AC-08; AC-10
EVIDENCE: The feature introduces user-facing terms: "Before and after", "visual record", "No visible change", and the states `complete`, `incomplete` and `not-applicable`. The loop keeps a Terms table in `references/loop-settings.md`, guarded by `tests/vh-adlc/loop/glossary.test.ts`. The standard requires that "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion". The document adds no glossary row and no criterion.
PROPOSAL: Add the new terms to the loop Terms table, with rejected synonyms, and extend AC-10 (and its Test Plan row through `glossary.test.ts`) to hold them.

FINDING: F-20
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (last paragraph, permissions); Design > Ship; Design > Command step 4
EVIDENCE: Every ship of a UI feature now pushes to a new ref namespace on `origin`. Ship requires confirming "which repository and account" before any GitHub write (`vh-adlc-ship/SKILL.md:67-68`), and `references/authority.md` says that push authority "still comes from their own procedures". Neither the design nor the owner summary says whether a ship request authorizes this extra push, or that it falls under that confirmation. The summary's permission paragraph covers only implementing, merging, releasing and the docs pin.
PROPOSAL: State that the ref push is part of the ship request's push authority and goes through ship's repository and account confirmation (or needs its own approval), and mention it in the owner summary.

FINDING: F-21
KIND: factual
SEVERITY: nit
WHERE: Design > Concurrency, failure, retry, upgrade ("Visibility")
EVIDENCE: The design says captures must show fixture data only, "as the frontend standard's redaction rule already requires". At the pin, the standard says "Redact credentials and session material before sharing artifacts" and "Do not put runtime secrets, private user data or captured sessions into Git" (`conventions/frontend-testing.md:77`, `:177-178`). "Captures show fixture data only" is new text proposed in vhco-pro/docs#53, not yet at the pin.
PROPOSAL: Cite the pinned rules as they read, and attribute "fixture data only" to the proposed rule.

FINDING: F-22
KIND: factual
SEVERITY: nit
WHERE: Design > Command, the `state` paragraph ("only bad arguments or unreadable settings exit non-zero, as the other `cli.ts` commands do")
EVIDENCE: Other loop commands also exit non-zero for verdict states: `rungs` returns 3 when it may not advance, `delivery` returns 3 when not delivered, and `review` returns 3 when it is not ready (`plugins/vh-adlc/scripts/loop/cli.ts:118`, `:149`, `:170`). Thrown errors exit 2 (`cli.ts:176-178`).
PROPOSAL: Drop the comparison or say "exits 2 on bad arguments or unreadable settings, like a thrown error in the other commands".

FINDING: F-23
KIND: factual
SEVERITY: nit
WHERE: Design > Concurrency, failure, retry, upgrade ("Concurrent ships")
EVIDENCE: "The single-writer reservation already keeps two writers off one feature" holds only in repositories that adopted reservations. Others continue as `legacy` (`plugins/vh-adlc/references/authority.md:117`, `references/loop-settings.md:127-129`), and the convention says that "a pushed claim advertises the branch, it is not a lock" (`authority.md:99`, `conventions/delivery.md:106-107`). The fetch, rebuild and retry design handles the race either way.
PROPOSAL: Say the reservation applies where adopted and that the retry covers the race in every case.

FINDING: F-24
KIND: factual
SEVERITY: nit
WHERE: Design > Setting (`capture.timeout_minutes`, "whole number"); AC-01; Test Plan row AC-04
EVIDENCE: The design requires a whole number, but AC-01 lists only "a non-positive timeout" as rejected, while the rung validator rejects both (`settings.ts:131`, "must be a positive whole number of minutes"). The AC-04 proof "sleeps past a one-minute limit", which makes the test run over a minute per timed-out side. The rung tests pass a fractional limit straight to the runner instead (`tests/vh-adlc/loop/rungs.test.ts:219`).
PROPOSAL: Add "a fractional timeout" to AC-01's rejections and let the AC-04 test pass a sub-minute limit to the function under test.

FINDING: F-25
KIND: judgement
SEVERITY: nit
WHERE: Design > Command (synopsis and step 4)
EVIDENCE: The synopsis `visuals --repo <dir> --base <default branch> [--run true]` takes no branch, yet the ref is `refs/pr-visuals/<branch>`. Where `<branch>` comes from, and what happens on a detached HEAD, is unstated.
PROPOSAL: State that the branch is the checkout's current branch and that a detached HEAD exits 2, or add a `--branch` flag.

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design > Command step 3 (`VH_ADLC_VISUAL_HEAD`, "adds a detached worktree at the merge base, runs the capture command, removes that worktree, and does the same at HEAD; the sides never overlap"); Owner summary (second paragraph, and the decision "Both sides run the head's capture script, so the first PR that adds capture still gets a before side"); Open Questions ("the head's capture script on both sides"); AC-04; Test Plan row AC-04
EVIDENCE: Step 3 defines `VH_ADLC_VISUAL_HEAD` as "the HEAD worktree's path, so a script the feature adds resolves on both sides". The same step runs the before side first and creates the HEAD worktree only after the base worktree is removed, so while the before side runs, the path in `VH_ADLC_VISUAL_HEAD` does not exist yet. A capture command such as `"$VH_ADLC_VISUAL_HEAD/scripts/capture.sh"` then exits 127 on the before side whenever the script exists only at HEAD, which is exactly the case AC-04 requires ("including when the script exists only at HEAD") and the AC-04 proof tests ("a capture script added only at HEAD ... assert both sides ran, in order, without overlap"). An implementation that follows step 3 fails the criterion; one that passes it must depart from step 3 (create the HEAD worktree first, or point the variable at the feature checkout), and the two choices differ. This revision introduced both the variable and the strict ordering in answer to R-1 F-03 and F-11.
PROPOSAL: Say where the head's script is read from during the before side, for example create the HEAD worktree first and keep it, read-only, until both sides finish, while still running the two capture commands one after the other. Or point `VH_ADLC_VISUAL_HEAD` at a separate export of HEAD made before either side runs, and state that in step 3, the owner summary and AC-04.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 ("removes any registered worktree under its own prefix, `<git common dir>/vh-adlc-visuals/`, left by an earlier killed run, and runs `git worktree prune`"); Design > Concurrency, failure, retry, upgrade ("Killed runs", "Concurrent ships"); AC-04; Test Plan row AC-04
EVIDENCE: Every linked worktree of a repository shares one common directory. In a scratch repository, `git rev-parse --git-common-dir` run inside a linked worktree printed the main checkout's `.git`. Ship runs in the feature's owning worktree (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:65-66`), so two ships of different features in one repository share the prefix. When the second run starts, its cleanup removes the first run's live capture worktree in the middle of a capture, because nothing tells a leftover from a worktree another run is still using. The Concurrency section covers only two ships of one feature racing on the ref. This cleanup rule is new in this revision, added for R-1 F-11.
PROPOSAL: Remove only leftovers whose owning run is gone, for example a per-run subdirectory holding the owner's PID and a lock, or key the prefix by the owning worktree. Add a fixture to the AC-04 row where a second run starts while a first run's capture is still going, and assert that the first run's worktree survives.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design > Setting (`capture.command`, "read from the head's settings"); Design > Command step 3 ("HEAD means the committed head; uncommitted work is never captured"); Design > Command step 1 (`when.paths`); Owner summary (second paragraph)
EVIDENCE: Every non-review loop command reads settings from the working tree: `loadLoopSettings(repo)` at `plugins/vh-adlc/scripts/loop/cli.ts:79-80`. Only `review` reads the committed policy through `loadLoopSettingsAt` (`plugins/vh-adlc/scripts/loop/settings.ts:238-251`). Ship leaves unrelated dirty work in place (`vh-adlc-ship/SKILL.md:81-82`), so `.vh-adlc/loop.yaml` can be dirty. The document says the capture command comes from "the head's settings" without saying whether that means the committed HEAD or the working tree, and it does not say where `when.paths` and `committed` come from. One implementer copies the other commands and reads the working tree, which can run an uncommitted capture command or apply an uncommitted block. Another reads HEAD. Nothing in the Test Plan separates the two.
PROPOSAL: State that `visuals` reads the whole `visual_record` block as committed at HEAD (for example through `loadLoopSettingsAt`), or name the working tree on purpose. Add a dirty `.vh-adlc/loop.yaml` fixture to the AC-01 or AC-04 row.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command, Output table (`pairs`: `before_url`, `after_url`); Design > Command step 3 (`VH_ADLC_VISUAL_OUT`); Design > Ship steps 3 and 5 ("it looks at every pair", "When it inspected every pair"); Owner summary ("Ship then looks at the pairs"); AC-08
EVIDENCE: The decision that "Nothing compares images automatically: ship inspects the pairs" depends on ship seeing the images. The output gives each image only as a `https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true` URL, which in a private repository needs a signed-in browser or a token, and for a failed push there is no URL at all. The output directories are temporary and the document does not say they outlive the run. It does not say how ship gets the image bytes: by fetching URLs, by `git cat-file` on local objects, or from a kept directory. So two implementers would build different inspection steps, and one of them may not be able to look at any image, which leaves "No visible change" impossible to justify.
PROPOSAL: Add a local handle to each pair side, such as the object name `<sha>:<path>` or the blob ID that `hash-object -w` wrote, and state in Design > Ship that ship extracts each image to a temporary file and views it from there. Require that wording in the AC-08 skill-text check.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 3 ("replacing an earlier one from its `## Before and after` heading up to the next `## ` heading or the end"), step 4 ("adds one line per changed state it knows no capture shows") and step 5 ("writes `No visible change`"); AC-08; Test Plan row AC-08
EVIDENCE: Steps 4 and 5 do not say where ship writes its own lines: inside the section, under its table, or elsewhere in the body. Lines written outside the section survive the next re-ship's replacement and leave a stale "No visible change" or stale uncaptured-state notes beside a new record. The document also does not say where the section goes in the body. Ship writes `Closes #N` or `Refs #N` there (`vh-adlc-ship/SKILL.md:98-100`), so if that line or any other text without a heading follows the section, the "up to the next `## ` heading or the end" rule deletes it on the next ship.
PROPOSAL: State that ship's uncaptured-state lines and the "No visible change" line go inside the section, and that the section is placed last in the body or ends with a fixed closing marker. Then add a must-pass and must-fail example for that to the AC-08 row.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-08; AC-08 ("names uncaptured changed states"); Design > Ship steps 4 and 6 ("The report repeats every missing item")
EVIDENCE: The row requires five patterns but none for the uncaptured-state line that AC-08 names, and none for the report repeating missing items, so a Deliver text without either passes. Its only must-pass example is "the revised Deliver text", which does not exist yet and so accepts whatever the implementer writes. The standard says a free-text proof "lists its must-pass and must-fail examples in the row" (`conventions/feature-documents.md`, Test plan). "near `incomplete`" and "in a sentence" give no measurable distance or boundary. The row was rewritten in this revision for R-1 F-16 and has not passed a clean review, so widening it is not limited to a nit.
PROPOSAL: Add patterns for the uncaptured-state line and for the report repeating missing items. Give at least one concrete must-pass sentence and one must-fail sentence for each pattern, and replace "near" with a stated window, such as the same sentence or paragraph.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command (synopsis paragraph: "Every other outcome exits 0"); Design > Command, State paragraph (the list of missing reasons); AC-02; AC-06; Test Plan rows AC-02 and AC-06
EVIDENCE: Several outcomes have neither an exit code nor a state. These are: settings that declare no `visual_record` block (ship skips the command then, but the command itself is undefined), a missing `--base`, a `git merge-base` that fails, a temporary worktree that cannot be removed after a side, and a failure of `hash-object`, `mktree` or `commit-tree`. "Every other outcome exits 0" puts them all at exit 0 but gives no `state` or missing reason, while a thrown error from these same git helpers exits 2 in the other commands (`cli.ts:176-178`, `rungs.ts:12-16`). Two implementers would emit different JSON, and the AC-06 "one case per missing reason" row cannot cover reasons the list does not name. AC-02 and its row also test only `--pr` for exit 2, not the stated "unreadable settings file or a directory that is not a Git checkout".
PROPOSAL: Classify each of these outcomes as exit 2 or as a named missing reason, and say what the command prints when no `visual_record` is declared. Extend the AC-02 or AC-06 row to cover them.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 4 ("Every captured image is stored"); Design > Concurrency, failure, retry, upgrade ("Retry and replay": "Each ship appends a commit on top of the previous tip"); Owner summary ("A repeated ship appends to the ref"); Output table (`ref_commit`); AC-05
EVIDENCE: The document does not say what step 4 does when no image was captured: no `capture` block, both sides failed, or both sides produced nothing. One reading of "each ship appends a commit" pushes an empty-tree commit on every ship and reports its SHA in `ref_commit`. The other skips the push and reports `null`. AC-05 and its row test only runs that capture images, so either choice passes.
PROPOSAL: State that the command pushes nothing and reports `ref_commit: null` when no image was captured (or the opposite), and add that case to the AC-05 row.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Design > Terms (the three rows and their `Not` column); Design > Command, Output table (`state`); AC-10 ("The Terms table holds the three new rows"); Test Plan row AC-10 (`glossary.test.ts` for the three Terms rows)
EVIDENCE: The Terms table in `plugins/vh-adlc/references/loop-settings.md:10` has two columns, `| Term | Meaning |`. Rejected synonyms live only in the `TERMS` map of `tests/vh-adlc/loop/glossary.test.ts:8-17`, which fails on any lowercase substring match in `loop-settings.md`, `review-protocol.md`, `loop.md`, `authority.md` and every file in `scripts/loop/`. The new rows bring a third `Not` column that the table lacks, so an implementer either rebuilds the whole table or drops the column. If the rejected synonyms are held the way every existing term is, "pass" and "fail" for Record state fail at once: a lowercase grep of those files found "pass" on 31 lines and "fail" on 90, for example `fail(` throughout `settings.ts` and "passed" in `rungs.ts`. The Record state row also lists three values, while the `state` field has a fourth, `planned`.
PROPOSAL: Write the rows in the table's two-column shape and list each term's rejected synonyms as the `TERMS` entries the glossary test will hold. Choose synonyms that the existing text does not contain as substrings (drop bare "pass" and "fail"), and add `planned` to the Record state row or explain why it is not a record state.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-10; AC-10
EVIDENCE: AC-10 requires the loop settings reference and the workflows guide to document every field, its defaults, the three environment variables, the ref name, retention, visibility and the upgrade order. The row says only "`tests/vh-adlc/settings-references.test.ts` extended for the new fields". That file tests only `triage-settings.md` and `maintenance-settings.md` (`tests/vh-adlc/settings-references.test.ts:20-23`), and nothing reads `docs/user-guides/workflows.md`. The row names no assertions and no must-pass or must-fail examples, so a reference that omits retention, visibility or the upgrade order passes. The equal-manifest check it adds already exists: `tests/vh-adlc/check.test.ts:166-176` requires `plugin.json` to equal the `.claude-plugin` manifest plus `$schema`.
PROPOSAL: Name what the extended test asserts in each of the two documents (for example each field name, `refs/pr-visuals/`, the three variable names, and stated phrases for retention, visibility and upgrade order), with a must-pass and a must-fail example. Cite the existing manifest test instead of adding a new one.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 (the prefix `<git common dir>/vh-adlc-visuals/`, `VH_ADLC_VISUAL_OUT` "an empty directory"); AC-10 (the documentation list); Owner summary ("screens, fixture data and capture script belong to the adopter")
EVIDENCE: The capture runs in a fresh detached checkout, which holds no ignored or untracked files such as `node_modules`, local env files or built assets. A UI capture usually needs these. In a scratch repository, `git worktree add --detach .git/vh-adlc-visuals/before HEAD~1` worked. Because that path sits inside the feature checkout's `.git`, tools that walk up parent directories, such as Node module resolution or `package.json` lookup, reach the feature checkout's own files from the before side. The document also does not say where the output directory lives. If it sits inside the side's worktree, it is deleted when step 3 removes the worktree, before step 4 stores the images. AC-10 does not ask the guides to explain any of this to the adopters who write the scripts.
PROPOSAL: State that each side is a clean checkout, say whether the prefix stays inside the common directory or moves to a temporary directory outside the repository, and require the output directories to be outside the worktrees. Add the capture environment to AC-10's documentation list.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command, Output table (`pairs.name`, `missing`, `markdown`); Design > Command step 1 ("Without `--run`, `state` is `planned` and `pairs` lists the committed screenshots it would link"); AC-02; AC-03
EVIDENCE: For captured images the screen name is the file stem (step 3). For committed screenshots the document never says whether `name` is the full path, the base name or the stem, and two committed files with one base name in different directories would collide under the last two choices. The output says `markdown` is `""` only for `not-applicable`. It does not say whether `planned` output carries URLs, a section or `missing` entries. AC-02 and AC-03 assert neither, so implementations that differ here all pass.
PROPOSAL: Define `name` for committed screenshots (for example the repository path) and the `markdown`, `missing` and URL fields in `planned` output, and assert them in the AC-02 and AC-03 rows.

FINDING: F-13
KIND: judgement
SEVERITY: nit
WHERE: Design > Command step 5 (committed links "at the merge-base and HEAD SHAs")
EVIDENCE: Committed-screenshot links point at the local HEAD and merge base, but the command never checks that either commit is on `origin`. Ship pushes first (Design > Ship step 1), so only a standalone `--run true` before a push produces links that 404 while `state` reads `complete`.
PROPOSAL: Note that the links assume HEAD has been pushed, or have the command check `git branch -r --contains HEAD` and report a missing item when the check fails.

### R-3

TARGET: b8be9f601aa140ffbf1e9e958393c4fc3d578074

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design > Command, "Owner and repository" paragraph (the closed list of accepted forms); Design > Command, State paragraph (missing reason "the remote URL is not recognised"); Scope, out of scope ("Remotes other than GitHub"); AC-06 ("only the three listed GitHub URL forms produce links"); Test Plan row AC-06 (must-link and must-not-link examples)
EVIDENCE: `git -C /home/m/code/stackweaver config --get remote.origin.url` prints `https://michielvha@github.com/michielvha/stackweaver.git`. That is the repository of the Background probe and of the Sources example (stackweaver#1177, "the shape this feature automates"). An https URL with a user name is none of the three accepted forms, and the design says "Anything else ... is a missing item with the reason 'remote is not a recognised GitHub URL' and no links". An implementer following the document builds a command that gives the motivating adopter an `incomplete` record with no links on every ship. The closed list came in with the previous revision (630c3d2a, for R-1 F-01) and is unchanged.
PROPOSAL: Accept an optional user-info part (`https://<user>@github.com/<owner>/<repo>`, with or without `.git`) and never copy it into links. Add `https://user@github.com/acme/app.git` to the AC-06 must-link examples.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Test Plan row AC-08, statement (1) (`visuals --run true --pr` and its must-pass example); Design > Ship step 2 (`visuals --run true --pr <number> --out <dir>`); Design > Command synopsis (`visuals --repo <dir> --base <default branch> --pr <number> --out <dir> [--run true]`) and its exit-2 list ("`--base` or `--pr` is missing"); AC-08
EVIDENCE: Statement (1) needs the literal substring `visuals --run true --pr`. A Deliver paragraph that copies the Design synopsis, for example "run `cli.ts visuals --repo <dir> --base <default branch> --pr <number> --out <dir> --run true`", has no such substring and fails the check, so the proof fails a correct implementation. The only passing example, and Design > Ship step 2, leave out `--base` (and `--repo`). The Command section makes a missing `--base` exit 2, and `need(options, "repo")` throws for a missing `--repo` (`plugins/vh-adlc/scripts/loop/cli.ts:45-48`, `:78`). A skill written to pass the check would tell ship to run a command that always exits 2. The row was rewritten in this revision for R-2 F-06 and has not passed review.
PROPOSAL: Give Design > Ship step 2 the full invocation with `--repo` and `--base`. Change statement (1) to require each flag (`visuals`, `--run true`, `--pr`, `--base`, `--out`) in one paragraph in any order, and make the must-pass example the full command.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command synopsis (`--base <default branch>`); Design > Command steps 1 and 2 (`<merge-base>`); Design > Ship step 2; Owner summary ("links changed committed screenshots at the base and head commits")
EVIDENCE: The document never says whether `--base` is the local default branch or `origin/<default>`. In this very worktree the local `main` is an ancestor of `origin/main` and `git rev-list --count main..origin/main` prints 234. With a stale local `main`, the merge base is older than the PR's real base. Other features' UI paths then make the delivery applicable, other features' screenshot changes appear as pairs, and the before side is built from an old main. Ship's own CI policy compares against `origin/<default>` (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:90-92`), which is what GitHub's PR diff shows.
PROPOSAL: State that ship passes `origin/<default branch>` after `git fetch origin <default branch>`, and say so in Design > Ship step 2 and the AC-08 statement (1) example.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship (opening line "only when the committed settings declare `visual_record`", steps 2 to 4 and 7); Design > Command (exit-2 list); AC-08; Test Plan row AC-08; frontmatter `goal` ("or says which images are missing and why")
EVIDENCE: Ship's handling of three outcomes is undefined. (1) Exit 2: no JSON, no section, so the PR says nothing about missing images, against the goal. The design does not say whether ship reports it, blocks, or writes a placeholder section. (2) The command is killed. Its default limit is 60 minutes for the whole run, and ship runs it like any other command, so a host's foreground command limit can stop it first. Ship then has no output at all. (3) `not-applicable`, or an exit 2, on a re-ship whose PR body already holds a `## Before and after` section from an earlier ship. Step 4 replaces the section only when a new one is written, so a stale record can stay. The document also does not say how ship decides that the committed settings declare `visual_record` (reading `git show HEAD:.vh-adlc/loop.yaml`, or running the command and treating "visual_record is not declared" as a skip). No AC-08 statement covers any of these.
PROPOSAL: State what ship does for exit 2, a missing result and `not-applicable`. For example, an exit 2 or missing result becomes a `## Before and after` section holding one missing line with the reason, an earlier section is removed on `not-applicable`, and the "not declared" exit is the skip signal. Add a statement for each to the AC-08 row.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design > Concurrency, failure, retry, upgrade ("Killed runs": "leaves only its `--out` directory and, possibly, unpushed objects"); Design > Command step 3 ("The time limit, process-group kill and 126 or 127 handling follow the rung runner")
EVIDENCE: The rung runner starts the command in its own process group (`detached: true`, `plugins/vh-adlc/scripts/loop/rungs.ts:47`) and kills that group only from its timeout handler (`rungs.ts:49`). When the CLI itself is stopped from outside, nothing signals the capture group, so the capture command keeps running. So do any servers, builds or checkouts it made ("builds each commit however its project needs"), and they can hold ports that make the next ship's capture fail. The previous revision (630c3d2a) said a killed run "can leave a temporary worktree or a capture process". This revision changed that to the narrower claim.
PROPOSAL: Restore an accurate statement: a killed run can leave the capture process group and whatever the adopter's command created. Either have the command kill its capture group on SIGINT and SIGTERM, or require the adopter's command to tolerate leftovers, and document it.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 (the capture contract); AC-04; AC-10 (the documentation list); Test Plan rows AC-04 and AC-10; Owner summary ("the command writes `before/` and `after/` images however its project builds")
EVIDENCE: The previous revision said "HEAD means the committed head; uncommitted work is never captured". This revision hands building to the adopter and drops that sentence. Nothing now tells the adopter that the after side must be built from `VH_ADLC_VISUAL_HEAD` and not from the working tree. The command runs at the feature checkout's root, which may hold unrelated dirty work that ship never stages (`SKILL.md:81-82`), and a cheap script would capture the running checkout as "after". The command also runs the working-tree version of any script it calls, so the sentence "an uncommitted edit to `.vh-adlc/loop.yaml` never changes what it runs" does not cover the script itself. AC-10 asks the guides for the variables, the layout and "builds no checkouts". It does not ask for: build each side from its SHA, do not change the feature checkout, only `.png`, `.webp` and `.jpg` files directly in each directory count, and pairing by stem. Whether `.PNG` or `.jpeg` counts is also unstated, so two implementers differ.
PROPOSAL: State in step 3 that each side must show its given commit, never the working tree, and that extension matching is case-sensitive or not. Add these points, the accepted extensions and stem pairing to AC-10's list and the AC-10 row's phrases.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command, State paragraph ("it produced no images"; "`complete` when at least one image is linked and nothing is missing"); Design > Command step 3; AC-04; AC-06; Test Plan rows AC-04 and AC-06
EVIDENCE: The design does not say whether "it produced no images" means both directories are empty or either one. Suppose the after build fails inside an adopter script that still exits 0, so `before/` holds images and `after/` is empty. One reading gives a missing item. The other gives captured pairs whose after side is `null`, with nothing missing and `state: complete`, which hides the failed capture. The design also does not say whether a captured stem present on one side only is a missing item or a legitimate added or removed screen. For committed screenshots the design says so explicitly.
PROPOSAL: Define both cases: an empty side is a missing item, and a stem on one side only is either a missing item or a stated one-sided screen. Add each case to the AC-04 or AC-06 row.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design > Setting (the `capture.command` row, "Optional shell command"; "At least one of `committed` and `capture` is required"); AC-01 ("an optional `capture` with `command` and `timeout_minutes`"); Test Plan row AC-01
EVIDENCE: The field table marks `capture.command` optional, so `capture: { timeout_minutes: 5 }` is a valid block that also meets "at least one of `committed` and `capture`". With `--run true`, nothing then says what runs or which missing reason applies. One implementer rejects the block and another accepts it, and the AC-01 row lists no such case.
PROPOSAL: Make `command` required whenever `capture` is present, and add a `capture` block without `command` to the AC-01 rejections.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Design > Setting ("reads the block as committed at HEAD through `loadLoopSettingsAt`, so an uncommitted edit to `.vh-adlc/loop.yaml` never changes what it runs"); Design > Command exit-2 list ("the settings can't be read"); AC-01; Test Plan row AC-01
EVIDENCE: `main` loads working-tree settings for every command except `review` before it dispatches (`plugins/vh-adlc/scripts/loop/cli.ts:79-80`). `settingsFile` also fails when a leftover `.vh-adlc/loop.yml` or `.json` exists (`plugins/vh-adlc/scripts/settings-file.ts:20-23`). A `visuals` branch added like the other commands therefore exits 2 when the working-tree file is invalid, even though the committed block is valid, so an uncommitted edit does change the outcome. The AC-01 fixture uses a valid working-tree file with a different capture command, which does not tell the two implementations apart. The document does not say which settings "can't be read" refers to.
PROPOSAL: State that `visuals` is exempt from the working-tree load, like `review`, and that "the settings can't be read" means the committed ones. Add a fixture with an invalid working-tree `.vh-adlc/loop.yaml` and a valid committed one to the AC-01 row.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 5 ("has a table row per screen", "Every link has the form ..."); Output table (`markdown`); AC-07; Test Plan row AC-07; AC-11
EVIDENCE: The problem is that a reviewer cannot see the old and new look side by side. Step 5 defines link URLs but not whether the cells embed images (`![before](url)`) or plain links (`[before](url)`), what the table's columns are, or what a cell shows for a `null` side. A section of plain hyperlinks passes AC-07 ("parse every link") and every fixture test, and only the manual AC-11 at the end would show that no image renders inline.
PROPOSAL: Specify the table's columns (screen name, before, after), the image syntax for each cell and the text for a missing side. Assert the image syntax in the AC-07 row.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 2 ("Each side is written from its object (`git show <sha>:<path>`)"); AC-03; AC-07 ("matches the pair's local file byte for byte"); Test Plan rows AC-03 and AC-07
EVIDENCE: Repositories often commit screenshots through Git LFS. For an LFS-tracked path, `git show <sha>:<path>` returns the text pointer, not the image. Ship would then "look at" a pointer file, and AC-07's byte comparison passes because both sides are the same pointer. The document neither handles nor excludes this case, so ship could write "No visible change" without having seen an image.
PROPOSAL: Write each side with the path's filters applied (`git cat-file --filters <sha>:<path>`), or detect an LFS pointer and report it as a named missing reason. State which one, and add an LFS-pointer fixture to the AC-03 row.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-10 (the required tokens `committed` and `60`); AC-10
EVIDENCE: Read as plain substrings, these tokens already appear in both documents today. "committed" occurs on 3 lines of `plugins/vh-adlc/references/loop-settings.md` and 5 lines of `docs/user-guides/workflows.md`. "60" occurs in `loop-settings.md:52`, the rung default. So the check passes on `loop-settings.md` without the `committed` field or the 60-minute capture default being documented, which lets a wrong implementation pass. The row was rewritten in this revision for R-2 F-10 and has not passed review.
PROPOSAL: Require qualified tokens that cannot match existing text, such as `visual_record.committed` or a phrase like "`capture.timeout_minutes` ... default 60" within the `visual_record` section. Add a must-fail example that drops the `committed` field.

FINDING: F-13
KIND: factual
SEVERITY: nit
WHERE: frontmatter `goal` ("Every pull request vh-adlc ships for a visible UI change carries before and after images")
EVIDENCE: The feature is opt-in: "Nothing changes for an adopter without the block" (Owner summary) and Design > Ship acts "only when the committed settings declare `visual_record`". A UI pull request in a repository without the block gets no images and no disclosure.
PROPOSAL: Scope the goal to repositories that declare `visual_record`.

FINDING: F-14
KIND: factual
SEVERITY: nit
WHERE: Design > Ship (closing paragraph, "The ref push is part of the ship request's push authority"); Test Plan row AC-08, statement (8)
EVIDENCE: The ship skill's Input paragraph lists its authority as "to push the feature branch, create or update its one PR and update the linked issue" (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:16-18`). The design adds the ref push only to the Deliver section, so the skill would state its authority in two places that disagree.
PROPOSAL: Name the `refs/pr-visuals/<number>` push in the Input authority sentence as well.

FINDING: F-15
KIND: judgement
SEVERITY: nit
WHERE: Design > Terms (the Record state row); Design > Command, Output table (`state`)
EVIDENCE: Two Record state values, `planned` and `complete`, are also feature document statuses throughout the loop references (`conventions/feature-documents.md`, Statuses). A ship report that says a record is `planned` or `complete` next to a document that is `planned` or `complete` can be misread.
PROPOSAL: Use distinct values, such as `preview` and `full`, or have reports always write "record state `complete`".

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan row AC-07 (statements (1) to (10), and "`tests/vh-adlc/direct-operation-compatibility.test.ts` still passes"); AC-07; Design > Ship (the Input paragraph's authority sentence and Deliver steps 1 to 8); Scope (the ship skill bullet); frontmatter `covers` (lists the test)
EVIDENCE: `tests/vh-adlc/direct-operation-compatibility.test.ts:12-17` and `:85-100` require the ship skill body, from "The plugin directory is two levels" onward, to equal the body at baseline `b313327b`. Only the Loop routes, Issue labels, Documentation impact, Article and After an authorized merge sections are stripped first. The Input paragraph (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:15-18`) and the Deliver section (`SKILL.md:95-113`) are in the compared body, yet the AC-07 row requires statement (10) "In the Input paragraph" and statements (1) to (9) in or alongside Deliver. In a scratch clone at baf9eba the test printed 8 pass, 0 fail. After the row's own statement (10) pass text ("authority to push the feature branch and `refs/pr-visuals/<number>`") was put into the Input sentence, it printed "(fail) direct ship keeps its approved operation body", 7 pass, 1 fail. Any Deliver edit fails the same way. So an implementation that meets the row's ten statements fails the row's last requirement unless the guard changes, and the document never says how it changes. The sibling feature avoided this by putting its ship text in Loop routes and extending the test (merge 40015896 changes the test by 11 lines). The Deliver conflict dates from R-1. This revision added the Input statement (10) in answer to R-3 F-14.
PROPOSAL: State how the compatibility test changes. For example, put the visual record steps in their own ship section that the test strips and checks for required phrases, like Issue labels, and name the allowed authority-sentence change. Then make the AC-07 statements name that section instead of Deliver and the Input paragraph, or say the ship baseline moves and to which commit.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 3 (removal on "visual_record is not declared" and on `not-applicable`) and step 5 (replacement "from its `## Before and after` heading to the end of the body"); Owner summary ("Nothing changes for a project without the block"); Design > Concurrency, failure, retry, upgrade ("Upgrade and rollback": "the next ship removes the section"); Test Plan row AC-07 statement (8)
EVIDENCE: Step 3 makes ship remove "any earlier `## Before and after` section" when the committed settings declare no `visual_record`, and step 5 defines a section as running from that heading to the end of the body. So in every project without the block, each ship now deletes a hand-written `## Before and after` section and all text after it. That contradicts the Owner summary's "Nothing changes for a project without the block". The proposed shared rule (vhco-pro/docs#53) asks every UI PR for such a record, so a project that has not adopted `visual_record` is the likeliest to write one by hand, as michielvha/stackweaver#1177 did in a comment. A section written by hand for a change outside `when.paths` is removed on `not-applicable` in the same way. The removal on "not declared" came in with this revision, applying R-3 F-04.
PROPOSAL: Remove or replace only a section vh-adlc wrote, identified by a fixed marker the command emits (for example an HTML comment line under the heading), and leave the body untouched otherwise. Or state the deletion in the Owner summary and the guide, and add the marker check to the AC-07 row.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 (Storage) and the State paragraph; Design > Ship steps 2 and 4; Design > Concurrency, failure, retry, upgrade ("Visibility", "Retry and replay"); Scope, out of scope ("Pruning old `refs/pr-visuals/*` refs. They are the record and are kept."); Owner summary (third paragraph, "in a public repository the images are public")
EVIDENCE: The pinned standard says "Redact credentials and session material before sharing artifacts" and "Do not put runtime secrets, private user data or captured sessions into Git" (`conventions/frontend-testing.md:177-178`, `:77` at 0c983f6, confirmed). In the design, `visuals --run true` pushes the images (step 3) before ship looks at any of them (Ship step 4), and the ref only ever grows: pushes are never forced and old refs are kept. Nothing between the capture and the push checks for secrets or real user data, and the document gives no way to take a leaked image back. Deleting the ref is not a defined operation and needs authority ship does not have. So the one step that inspects the images comes after they are shared, which in a public repository means published.
PROPOSAL: Split capture from storage: `--run true` captures and writes local files only, ship inspects them, and a second call (for example `--push true`) stores them only after that inspection passes. Also define an owner-approved removal path for a ref that holds an image it should not.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command synopsis (`--github <owner>/<repo>`) and step 4 (URL form `https://github.com/<owner>/<repo>/blob/...`); Design > Command step 3 (`git ls-remote origin`, `git push origin`); Design > Ship step 2 (`gh pr view <number> --json url`); Owner summary (decision "the GitHub owner and repository come from the PR ship created"); Scope, out of scope ("Parsing remote URLs"); AC-06; Test Plan row AC-06
EVIDENCE: The images are pushed to `origin`, but the links name the PR's repository, and nothing checks that the two are the same. When they differ, every link points at a repository that may not hold the commit while `state` reads `full`. That happens with a clone whose `origin` is a fork while `gh` creates the PR on the parent, or with a `gh` default repository set elsewhere. The PR URL also carries the host, but `--github` keeps only `<owner>/<repo>` and the links hard-code `github.com`, so a GitHub Enterprise repository gets broken links. Elsewhere the plugin handles both cases: maintenance settings say the repository identity "must match origin" and "A nonstandard GitHub hostname requires an explicit matching hostname" (`plugins/vh-adlc/references/maintenance-settings.md:16`). This decoupling came in with this revision's answer to R-3 F-01. The AC-06 proof checks `github.com/acme/app` only, so either reading passes.
PROPOSAL: Take the host as well as owner and repository from the PR. Require that the PR's repository is the one `origin` pushes to, or else report a named missing reason with no links. Add a must-fail case for a mismatch to the AC-05 or AC-06 row.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command, State paragraph (the full list of missing reasons and "Images captured but not pushed are reported missing with their local files kept"); Design > Command step 2 ("The time limit and 126 or 127 handling follow the rung runner"), step 3 and step 4 ("an absent side's cell is `none`"); Output table (`pairs`, "Each is `null` for an absent side"); AC-05; Test Plan row AC-05
EVIDENCE: Three outcomes are left open. (1) Whether images left in `<out>` by a capture that exited non-zero, could not run or timed out are pushed and linked. The rung runner stops a timed-out group with SIGKILL (`plugins/vh-adlc/scripts/loop/rungs.ts:61`), so a file being written can be truncated and still match an image extension. (2) When the capture writes nothing, whether `missing` holds only "it wrote no images at all" or also the two one-side reasons. (3) When the push fails, each pair has `before_file` and `after_file` but no URL. One implementer then renders a table of `none` cells, which reads as screens added or removed. Another omits the table. The AC-05 row asserts "the `missing` entry" and "the section text" per reason, which either choice passes.
PROPOSAL: State whether images from a failed, unrunnable or timed-out capture are stored, that "no images at all" replaces the two one-side reasons, and what the table shows when nothing was pushed. Assert each in the AC-05 row.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-07, statements (1), (6) and (8); AC-07; Design > Ship steps 2, 3 and 8
EVIDENCE: Statement (1) requires `visuals`, `--run true`, `--pr`, `--base origin/`, `--github` and `--out`, but not `--repo`. `main` calls `need(options, "repo")` before anything else (`plugins/vh-adlc/scripts/loop/cli.ts:78`, `:45-48`), so a skill text without `--repo` passes the check while every run exits 2 and ship writes "Visual record missing". The row does not check the `git fetch origin <default branch>` that Design > Ship step 2 runs first, so a stale `origin/<default>` can widen the merge base. No statement covers step 3's removal of an earlier section on `not-applicable`. Statement (6) holds only a `partial` record, while step 8 says "A `partial` record or a missing record never blocks the delivery". The row was rewritten in this revision for R-3 F-02 and F-04 and has not passed review, so these gaps are not limited to nits.
PROPOSAL: Add `--repo` to statement (1) and a statement for the fetch before the run. Add a statement for the `not-applicable` removal, and make statement (6) cover a missing record too, each with a must-pass and a must-fail example.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context > Background (the ship skill bullet `SKILL.md:98-101`, `:67-68`, `:81-82`, `:90-92`; the settings bullet `settings.ts:208`, `settings.ts:238-251`; the rung bullets `rungs.ts:40-60`, `:47-49`, `:59`, `rungs.ts:12-16`, `cli.ts:176-178`, `cli.ts:149`; the last bullet, "is in progress on `feat/stage-scoped-rungs`"); Design > Concurrency, failure, retry, upgrade ("Upgrade and rollback", `settings.ts:54`, `:208`); Design > Coordination
EVIDENCE: Merge 40015896 (PR #147, stage-scoped rungs) is an ancestor of baf9eba, and `docs/specs/stage-scoped-verification-rungs.md` there has `status: complete`. The cited lines moved. At baf9eba: the PR step with `Closes`/`Refs` is `SKILL.md:105-107`, the repository and account confirmation is `:74-75`, unrelated dirty work is `:88-89` and the CI policy is `:97-98`. `keys(input, LOOP_SETTINGS_KEYS, ...)` is `settings.ts:216` and `loadLoopSettingsAt` is `:246-259`. The rung process group and timer are `rungs.ts:59-61`, 126/127 is `:71` and the git throw is `:17-21`. The thrown-error exit is `cli.ts:182-186`, and rungs returns 3 at `cli.ts:156`. The Coordination condition is already met.
PROPOSAL: Refresh the line citations, say the sibling feature has merged, and reduce Coordination to branching from the current default branch.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design > Command (exit-2 list, "`--out` is missing, not empty, or inside the repository's working tree") and step 2 ("creates the empty directories `<out>/before/` and `<out>/after/`"); Test Plan row AC-02
EVIDENCE: A `--out` path that does not exist is neither "missing" nor "not empty". One implementer creates it and another exits 2. Ship always passes "a new empty directory", so nothing ship observes changes.
PROPOSAL: Say whether a nonexistent `--out` is created or exits 2.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Scope (documentation bullet); AC-09
EVIDENCE: Per-version upgrade notes for new loop settings live in `docs/reference/compatibility.md:180-183` ("Plugin 0.29.0 lets a verification rung declare `stages` ... Older plugins refuse the field, so update the plugin before adding it"), added by the sibling feature at 0ebf5bef. This feature has the same upgrade order but names only the loop settings reference and the workflows guide.
PROPOSAL: Add a compatibility reference note for the new key to Scope, or leave it to ship's documentation impact step and say so.

### R-5

TARGET: fdfe84c71d8ee7ca710a4becee19700ef5407e8a

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship steps 4, 5, 6 and 8; Design > Command, State paragraph (missing reason "ship withheld the images after inspection"); AC-05; Test Plan row AC-05 ("the withheld case writes it through the capture result as ship would"); Test Plan row AC-07 statement (6)
EVIDENCE: Ship step 4 says that on a withheld image ship "pushes nothing, reports that to the owner and records the missing reason", and step 5 runs `--push true` only "Otherwise". The State paragraph lists the withheld reason among the push step's reasons that yield record state `partial` and a `### Missing` list, but the push step is never run in that case and has no flag or documented `capture.json` field that tells it about a withholding. The AC-05 proof writes the reason "through the capture result as ship would", yet no ship step writes `capture.json`, and the `capture.json` format is not defined. If ship did edit it and then ran the push step, the push step "reads `<out>/capture.json` and the images it lists" and would push the withheld images unless ship also removed them. One implementer has ship write a step-8 "Visual record missing:" section, another adds a field to `capture.json` and runs the push step. The withheld path came in with this revision, applying R-4 F-03.
PROPOSAL: Define one mechanism: either ship writes the step-8 marked section with the withheld reason and the push step never sees it (and drop the reason from the push step's list and AC-05), or the push step takes a defined input (for example `--withheld true`) that pushes nothing and reports the reason. Make the AC-05 and AC-07 rows test that mechanism.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 4 (the section "starts with `## Before and after` and the line `<!-- vh-adlc:visual-record -->`"); Design > Ship steps 3, 6 and 8; Design > Terms (Before and after section row); Owner summary ("inside markers, replacing only the section it wrote before"); AC-06; Test Plan row AC-07 statements (4), (5) and (8)
EVIDENCE: The heading line comes before the start marker, so it lies outside the markers. Ship step 6 replaces "an earlier section between vh-adlc's markers" and says "every other part of the body stay outside the markers"; step 3 "removes an earlier section between vh-adlc's markers". Read literally, a re-ship leaves the old `## Before and after` heading in place and appends a new section with its own heading, so headings pile up with each ship. A removal on `not-applicable` or rollback leaves an orphan `## Before and after` heading, which statement (5) then protects as a section "without the markers" that is "never touched". Another implementer treats the heading directly above the start marker as part of the section. The marker scheme came in with this revision, applying R-4 F-02.
PROPOSAL: Put the start marker before the heading, or state that vh-adlc's section runs from the `## Before and after` line directly above the start marker to the end marker. Add a re-ship case and a removal case to a Test Plan row that assert exactly one heading, or none, remains.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design > Command step 2 ("The time limit and 126 or 127 handling follow the rung runner"; "Images count only when the command exited 0"); Design > Concurrency, failure, retry, upgrade ("Killed runs"); AC-04; Test Plan row AC-04; AC-09 ("tolerance of leftovers")
EVIDENCE: The rung runner waits on `Promise.all` of the stdout text, the stderr text and `child.exited`, and clears its timer only after all three resolve (`plugins/vh-adlc/scripts/loop/rungs.ts:59-63`). In a scratch Bun script, `Bun.spawn(["bash","-c","sleep 4 & echo started; exit 0"], {stdout:"pipe", stderr:"pipe", detached:true})` printed "exited 0 1 ms" and then "pipes closed after 4002 ms". A capture command that starts a dev server or a compose stack in the background and exits 0, which the document itself expects ("such as servers or build output"), therefore holds the run until the time limit (60 minutes by default). The run is then reported as timed out and, under step 2, every image is discarded. The document only covers killed runs. It does not say whether the command waits for exit or for the output pipes, or whether it kills processes the capture leaves running after a normal exit.
PROPOSAL: State that the capture's result is decided at the command's exit, after which the command kills the capture's process group (or stops reading its output), and add a fixture to the AC-04 row whose script leaves a background sleeper and exits 0, asserting the images are used and the sleeper is gone.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design > Ship step 1 ("The ship request's push authority covers `refs/pr-visuals/<number>`"); Owner summary, third paragraph ("part of ship's push authority"); Scope (the ship skill bullet, "Deliver and the Input paragraph stay as they are"); frontmatter `covers`
EVIDENCE: The ship skill tells the agent to "Follow `references/loop.md` and `references/authority.md`" (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:15-16`). The authority table grants an explicit ship request only "Push the feature branch, create or update its PR, update the linked issue" (`plugins/vh-adlc/references/authority.md:27`), and its Input paragraph repeats that list (`SKILL.md:16-18`). The design adds a push to a new ref namespace but changes neither, and `references/authority.md` is not in Scope or `covers`. The skill would then claim an authority that the table it defers to does not list.
PROPOSAL: Add the `refs/pr-visuals/<number>` push to the ship row of `references/authority.md`, put that file in Scope and `covers`, and have AC-07 or a new criterion check the row.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary, third paragraph ("Deleting a ref that holds an image it shouldn't needs the owner's explicit request"); Design > Ship step 10; Scope, out of scope (the pruning bullet); Context > Background (the probe bullet, "The ref was deleted afterwards"); AC-09 ("retention and deletion on the owner's request"); Test Plan row AC-09 (`owner's explicit request`)
EVIDENCE: `git ls-remote origin 'refs/pr-visuals/*'` in /home/m/code/stackweaver printed nothing today, so the probe ref is gone. Yet `gh api repos/michielvha/stackweaver/commits/721b0569fae72c29695d11c2c8af9fbafb24665a` still returned the commit (0 parents, files ["probe.png"]), and `gh api "repos/michielvha/stackweaver/contents/probe.png?ref=721b0569..."` returned size 34604. GitHub keeps serving a commit by SHA after its only ref is deleted, and the PR body's edit history keeps the links. Step 10 only says deletion "can't recall copies others already fetched", and the guide (AC-09) will present deletion as the remedy. An adopter who deletes the ref after a leak would believe the image is gone when every reader can still open it.
PROPOSAL: State in Design > Ship step 10, the Owner summary and the guide that deleting the ref does not stop GitHub serving the commit by SHA, and that removing a leaked image needs GitHub support or other steps. Add a required phrase for that to the AC-09 row.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Scope (the workflows guide's copyable example for committed screenshots); Owner summary ("one `git show` line each, shown in the guide"); Design > Command step 2 (any file with an accepted extension is a capture); Design > Ship step 4; AC-09; Test Plan row AC-09 (`git show "$VH_ADLC_VISUAL_BASE:`)
EVIDENCE: The required guide example copies committed screenshots with `git show "$VH_ADLC_VISUAL_BASE:<path>"`. For a path tracked by Git LFS, `git show` writes the pointer text, not the image, so the capture holds a `.png` that is not an image. The command accepts it by extension alone. Ship step 4 withholds only for "a credential, a session or real user data" and says nothing about a file it cannot view, so it runs the push step and the PR shows broken images with record state `full`. R-3 F-11 raised this for vh-adlc's own copy; moving the copy into the adopter's command, with vh-adlc supplying the example, leaves the case undefined.
PROPOSAL: Make the guide example use `git cat-file --filters "$VH_ADLC_VISUAL_BASE:<path>"` (which applies LFS smudge filters) and require that phrase in the AC-09 row. Also state in Ship step 4 that a file ship cannot view as an image is withheld with a named missing reason.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 2 ("Two files with one stem on one side are a missing item, and neither is used"; "A stem on one side only is a one-sided screen, added or removed"); AC-03; AC-05; Test Plan row AC-05
EVIDENCE: With `before/home.png`, `before/home.webp` and `after/home.png`, both before files are dropped. The document does not say what happens to `after/home.png`: one implementer drops the whole stem, another keeps it as a one-sided screen, so the PR shows `home` as an added screen when it existed before. No Test Plan row covers the other side of a duplicate.
PROPOSAL: State that a duplicate stem on one side drops that stem from both sides, or that the other side is kept and marked, and assert it in the AC-05 duplicate-stem case.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-07 statements (3) and (6); AC-07; Design > Ship steps 2 and 4
EVIDENCE: Statement (3) requires the token `--github` but not where its value comes from. A skill that says `--github github.com/<owner>/<repo>`, or takes it from `origin`, passes, although the owner decided that host, owner and repository come from the PR (`gh pr view <number> --json url`, Ship step 2). Statement (6) requires `before_file`, `after_file` and `withheld`, and its passing example names only "a credential". A skill that withholds only for credentials passes, while step 4 also withholds for "a session or real user data", the privacy check R-4 F-03 asked for. The row was rewritten in this revision for R-4 F-01 and F-06 and has not passed review.
PROPOSAL: Add to statement (3) a requirement for `gh pr view` with `url`, and to statement (6) `session` and `user data`, each with a must-fail example that lacks them.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-09 (the required token `.jpeg`); AC-09 ("the accepted extensions"); Design > Command step 2 (`.png`, `.webp`, `.jpg` or `.jpeg`, "in any letter case")
EVIDENCE: The row requires only `.jpeg` among the extensions, and nothing about letter case. A reference or guide that lists `.jpeg` alone passes, so the check passes docs that omit three of the four accepted extensions and the case rule AC-09 asks for. The row changed in this revision (the `docs/reference/compatibility.md` requirement was added), so it has not passed review.
PROPOSAL: Require `.png`, `.webp`, `.jpg`, `.jpeg` and a phrase such as `any letter case`, with a must-fail example that drops `.webp`.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context > Background (the `direct-operation-compatibility.test.ts` bullet, "Loop routes, Issue labels and Documentation impact (`:40-60`, `:90-95`)")
EVIDENCE: For the ship body the test also strips Article and promotion handoff and After an authorized merge (`tests/vh-adlc/direct-operation-compatibility.test.ts:64-85`). The Loop routes strip is at `:20-43`, not `:40-60`.
PROPOSAL: List all five stripped sections and cite `:20-43`, `:44-63`, `:64-85` and `:89-98`.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan row AC-07, statement (6); AC-07; Design > Ship step 4
EVIDENCE: Statement (6) requires the token `never runs the push step`, but its must-pass example says "...or a file can't be viewed as an image, never run the push step and write the marked section saying ship withheld the images". A case-insensitive substring check of the listed tokens against that example (node, scratch script) reported the one missing token as [ 'never runs the push step' ]. The Design step 4 text ("it never runs the push step") passes. So the row's own must-pass example fails the check it defines, and so would a skill written in the imperative voice the other examples use. The token and the example's wording came in with this revision. At fdfe84c7, statement (6) required only `before_file`, `after_file` and `withheld`, and this revision added `session`, `user data`, `viewed` and `never runs the push step` when it applied R-5 F-01 and F-08.
PROPOSAL: Require `never run` together with `push step`, which matches both "never run" and "never runs", or rewrite the must-pass example to "never runs the push step". Then check every other statement's pass example against its tokens.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-07 ("split into paragraphs ... one paragraph per statement"); Design > Ship, the lead paragraph and steps 2, 3, 7 and 9
EVIDENCE: The row can be read two ways. Either each statement's tokens must all appear within some one paragraph, or each statement needs a paragraph of its own. The Design's own list items each carry several statements: step 2 holds (2), (3) and (3a), step 3 holds (4) and (5), step 7 holds (9) and (10), and step 9 holds (12) and (13). Under the second reading, a skill that copies the Design fails. The row changed in this revision, so it has not passed review.
PROPOSAL: Say that each statement passes when at least one paragraph contains all of its tokens, and that one paragraph may satisfy several statements.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command (the exit paragraph, "On SIGINT or SIGTERM during a capture it kills the capture's process group"); Design > Concurrency, failure, retry, upgrade ("Killed runs", "On SIGINT or SIGTERM"); AC-04; Test Plan row AC-04
EVIDENCE: The Design requires the process-group kill for both SIGINT and SIGTERM. AC-04 says only "Neither SIGTERM during a capture nor...", and the AC-04 proof sends only SIGTERM. An implementation that handles SIGTERM alone meets every criterion, yet when a host interrupts a foreground command with Ctrl-C or SIGINT, the capture's servers are left running.
PROPOSAL: Name SIGINT in AC-04 next to SIGTERM, and add a SIGINT case with the same PID assertion to the AC-04 row.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 4 (the table and image cells, "each path segment percent-encoded"); Design > Command output table (`pairs.name`); AC-06; Test Plan row AC-06
EVIDENCE: The Design never says what the Screen cell holds or how the stem is escaped in that cell and in the alt text `![<name> before](<url>)`. It also does not say which characters "percent-encoded" covers. A stem containing `|` splits the table row. A `]` in a stem ends the alt text early. `encodeURIComponent` leaves `(` and `)` unencoded, and an unbalanced `)` in a file name ends a CommonMark link destination early. The AC-06 proof checks only `my screen.png`, so two implementations that escape differently both pass, and one of them breaks the table for legal file names.
PROPOSAL: Say that the Screen cell holds the stem, give the escaping for table cells and alt text (at least `|`, `[`, `]` and backslash), and say that URL segments encode every byte outside the unreserved set, including `(` and `)`. Add a stem containing `|` and `)` to the AC-06 row.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: AC-09 ("a copyable example that copies a committed screenshot for each side with Git's filters applied"); Test Plan row AC-09 (`git cat-file --filters "$VH_ADLC_VISUAL_BASE:`); Scope (the workflows guide bullet); Owner summary ("one `git cat-file --filters` line each")
EVIDENCE: AC-09 asks for an example that copies a screenshot for each side, but the row requires only the base-side form. A guide whose example copies the after side with `git show "$VH_ADLC_VISUAL_HEAD:..."`, which writes the LFS pointer text, or leaves the after side out, passes. The row changed in this revision, when it applied R-5 F-06, so it has not passed review.
PROPOSAL: Also require `git cat-file --filters "$VH_ADLC_VISUAL_HEAD:` in the guide, with a must-fail example that copies the after side some other way.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 2 ("A stem on one side only is a one-sided screen, added or removed"); Design > Command, State paragraph (the reasons "it wrote no before images" and "it wrote no after images"); AC-05; AC-09
EVIDENCE: Take a feature that adds a new page, where the adopter captures only that page. The after side holds `newpage.png` and the before side is empty. Step 2 treats the screen as a legitimately added one-sided screen, but the State list turns the empty before side into the missing reason "it wrote no before images", so the record is `partial` and the PR shows a Missing item although nothing is missing. The Design gives no rationale for this, and the guide (AC-09) is not required to tell adopters how to avoid it.
PROPOSAL: Either state the rule and its reason, that each side must hold at least one screen so a broken build is caught, and require the guide to tell adopters to capture at least one screen present at both commits, or drop the one-side reasons when the other side's screens are all one-sided. Add the chosen case to the AC-05 row.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command, State paragraph ("it wrote no images at all (this replaces the two one-side reasons)"); Design > Command step 2 ("after a non-zero exit, a command that could not run, or a timeout, no image is used"); AC-05; Test Plan row AC-05
EVIDENCE: When the capture exits 1 after writing images, or times out, step 2 uses no image. The Design does not say whether `missing` then holds only the exit or timeout reason, or also "it wrote no images at all", or the one-side reasons. The AC-05 proof checks that each reason is present, not that the list holds nothing else, so both behaviours pass, and two implementers would put different Missing lists in the PR.
PROPOSAL: State that a non-zero exit, a command that could not run, or a timeout yields exactly that one reason, and assert in the AC-05 exit-1 case that `missing` holds only that entry.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship steps 6, 8 and 9; Design > Concurrency, failure, retry, upgrade ("Concurrent ships", "Retry and replay"); Test Plan row AC-07
EVIDENCE: Step 6 reads the PR body, replaces the marked text and writes the body back. The Design does not cover the body write failing after the ref push succeeded: the record is then stored but not linked, and step 8 covers only an exit 2 or a step with no output. It also does not cover a concurrent body edit between the read and the write, whether a second ship of the same PR without reservations or a person editing the body; the "Concurrent ships" bullet covers only the ref. One implementer reports a failed body write as a missing record and another reports nothing.
PROPOSAL: State that a failed body write is reported as a missing record naming the pushed `ref_commit`, and that ship reads the body again just before writing it. Add the reporting requirement to a statement in the AC-07 row.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Context > Background (the `direct-operation-compatibility.test.ts` bullet)
EVIDENCE: The bullet cites Issue labels at `:44-63`, but `tests/vh-adlc/direct-operation-compatibility.test.ts:44-54` strips Issue labels and `:55-63` strips the current body's Documentation impact. The bullet says only that Documentation impact is "handled in the baseline (`:89-98`)". These citations came from the proposal of R-5 F-10, applied in this revision.
PROPOSAL: Cite Issue labels at `:44-54` and say that Documentation impact is stripped from the current body at `:55-63` and from the baseline at `:96-98`.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Design > Ship, lead paragraph ("requires each statement in the AC-07 Test Plan row inside it"); Test Plan row AC-07, statement (15)
EVIDENCE: Statement (15) is checked against the ship row of `plugins/vh-adlc/references/authority.md`, not inside the skill's `## Visual record` section, so "each statement ... inside it" is not accurate for that one.
PROPOSAL: Say "each of statements (1) to (14) inside it, and statement (15) in the authority table".

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Design > Ship steps 4, 6 and 8
EVIDENCE: Step 6 says only the push step's section goes last and replaces the earlier marked text. Steps 4 (withheld) and 8 (other exit 2 or no output) say ship "writes the marked section" or "writes a marked section", without saying where it goes or that it replaces an earlier one. Step 3's definition implies replacement but does not say so.
PROPOSAL: State once that every section ship writes between vh-adlc's markers goes last in the body and replaces the earlier marked text.

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Context > Owner summary (second paragraph); Design > Setting (`capture.timeout_minutes`, default 60)
EVIDENCE: The summary does not mention the 60-minute default limit on the capture run, during which ship waits, or that leftover background processes are killed when the capture exits. Both are defaults an owner would want to know. The sentence "When a committed change in the feature matches, ship opens or updates the PR" also reads as if opening the PR depends on the match.
PROPOSAL: Add one sentence on the 60-minute default and the cleanup, and reword so that only the visual record step depends on the match.

## Sources

- [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53): the proposed shared rule this feature
  implements, including the per-PR ref and fixed-commit links.
- [Frontend testing standard at the repository's pin](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/frontend-testing.md):
  captures are required and missing evidence is reported, but PR images are not yet required.
- [michielvha/stackweaver#1177, before and after comment](https://github.com/michielvha/stackweaver/pull/1177#issuecomment-7065428660):
  a hand-made record using committed captures linked at base and head SHAs, the shape this feature
  automates.
