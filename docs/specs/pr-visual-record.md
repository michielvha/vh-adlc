---
status: draft
status_description: "Revised after review R-2; awaiting a new independent review."
issue: null
goal: "Every pull request vh-adlc ships for a visible UI change carries before and after images linked at fixed commits, or says which images are missing and why."
covers:
  - plugins/vh-adlc/scripts/loop/visuals.ts
  - plugins/vh-adlc/scripts/loop/settings.ts
  - plugins/vh-adlc/scripts/loop/cli.ts
  - plugins/vh-adlc/scripts/loop/rungs.ts
  - plugins/vh-adlc/scripts/loop/git-paths.ts
  - plugins/vh-adlc/scripts/branches/
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - tests/vh-adlc/loop/
  - tests/vh-adlc/branches/branches.test.ts
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
---

# Plan: Visual record in shipped pull requests

The ship operation adds a "Before and after" section to the pull request of any feature that changes
visible UI. The images come from screenshots the repository already commits, or from a capture command
the adopter declares, and new captures are stored on a per-PR ref outside `refs/heads`.

## Context

### Owner summary

A UI pull request today describes its change in text only. A reviewer can't see the old and new look
side by side, and the history keeps no visual record. The owner asked for this record on 2026-11-21,
and the shared rule is proposed as "Visual record in the pull request" in the frontend testing standard
([vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53)).

This feature makes ship produce that section. An adopter opts in with a `visual_record` block in
`.vh-adlc/loop.yaml`: path globs that mark a delivery as UI-affecting, globs of screenshots the
repository already commits, and an optional capture command. When a committed change in the feature
matches, ship opens or updates the PR, then runs a new `cli.ts visuals` command. It links changed
committed screenshots at the base and head commits. It runs the adopter's capture command once, giving
it both commits and an output folder; the command writes `before/` and `after/` images however its
project builds. The command pushes those images to `refs/pr-visuals/<PR number>`. Ship looks at every
pair from local copies and writes the section last in the PR body, replacing any earlier one.

The owner made six decisions on 2026-11-21. A missing record is disclosed and never blocks a delivery.
A repeated ship appends to the ref, so earlier images stay. Nothing compares images automatically: ship
inspects the pairs and says "No visible change" only when it sees none. The ref is named by PR number.
The adopter's command captures both sides, so vh-adlc builds no checkouts of its own. Review R-2's
remaining findings take their recommended fixes.

The extra push to `refs/pr-visuals/*` is part of ship's existing push authority and goes through its
repository and account confirmation. Ordinary clones don't fetch that ref; GitHub serves its files to
anyone who can read the repository, so in a public repository the images are public, like the PR.

Nothing changes for an adopter without the block. vh-adlc stays project-neutral: screens, fixture data,
how the base commit gets built, and the capture script belong to the adopter. An adopter has to upgrade
the plugin before adding the block, because older settings readers reject unknown keys.

Planned proof is fixture tests against local Git repositories, text checks with stated examples, and one
manual check that the images render in a private GitHub PR. Observed so far: one probe showed GitHub
serving a file from a commit that only a custom ref holds. Reviews R-1 and R-2 found 25 and 13 issues;
this revision applies R-2 and needs a new independent review.

Acceptance authorizes implementing this design on a feature branch. Merging, releasing and changing the
docs pin each need their own approval.

### Background

- Ship builds the PR body in its Deliver step with no image step:
  `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:98-101`, where it also writes `Closes #N` or `Refs #N`.
  It confirms the repository and account before any GitHub write (`SKILL.md:67-68`) and never stages
  unrelated dirty work (`SKILL.md:81-82`).
- Loop settings accept a fixed key list and reject anything else:
  `plugins/vh-adlc/scripts/loop/settings.ts:54` defines `LOOP_SETTINGS_KEYS`, and
  `plugins/vh-adlc/scripts/loop/settings.ts:208` enforces it. A rung timeout must be a positive whole
  number of minutes (`settings.ts:131`). Non-review commands read settings from the working tree
  (`plugins/vh-adlc/scripts/loop/cli.ts:79-80`); `loadLoopSettingsAt` reads them as committed
  (`settings.ts:238-251`).
- `featureDelta` (`plugins/vh-adlc/scripts/loop/rungs.ts:23`) returns committed paths plus every
  uncommitted and untracked path (`rungs.ts:29-32`). Committed paths come from
  `plugins/vh-adlc/scripts/loop/git-paths.ts:29-31`, which reads `diff --no-renames --name-only -z`.
  Rung commands run with a time limit and a process-group kill (`rungs.ts:40-60`), and exits 126 and
  127 count as "could not run" (`rungs.ts:59`).
- Loop commands exit 2 on a thrown error (`plugins/vh-adlc/scripts/loop/cli.ts:176-178`), including a
  failed Git call (`rungs.ts:12-16`), and 3 for some verdicts (`cli.ts:118`, `:149`, `:170`).
- After-merge cleanup "touches only that PR's head branch" (remote branch, tracking ref and local
  branches) and its worktree: `plugins/vh-adlc/references/branches.md:87-99`.
- The loop's Terms table has two columns, `| Term | Meaning |`
  (`plugins/vh-adlc/references/loop-settings.md:10`). Rejected synonyms live in the `TERMS` map of
  `tests/vh-adlc/loop/glossary.test.ts:8-17`, which fails on any lowercase substring match in the loop
  references and `scripts/loop/`.
- `tests/vh-adlc/check.test.ts:166-176` already requires `plugin.json` to equal the `.claude-plugin`
  manifest plus `$schema`.
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
  link form in a PR body for such a commit was not observed.
- `docs/specs/stage-scoped-verification-rungs.md` is in progress on `feat/stage-scoped-rungs` and changes
  `rungs.ts`, `settings.ts`, `cli.ts`, the ship skill and the plugin version too.

## Scope

In scope:

- The optional `visual_record` loop setting and its validation.
- A `cli.ts visuals` command that decides applicability, pairs committed screenshots, runs the capture
  command once, stores captured images on `refs/pr-visuals/<PR number>` and prints the PR section.
- The ship skill's Deliver step: open or update the PR, run the command, inspect the pairs from local
  files, write or replace the section, name uncaptured changed states, and say "No visible change" only
  after inspection.
- New Terms rows, the loop settings reference, the workflows user guide and a minor plugin version
  bump.

Out of scope:

- Choosing screens, building the base commit, writing capture scripts or seeding fixtures. Those stay
  with each adopter (owner decision, 2026-11-21).
- Automatic image comparison of any kind, by bytes or pixels (owner decision, 2026-11-21).
- Image upload to GitHub's attachment store, which has no API.
- Pruning old `refs/pr-visuals/*` refs. They are the record and are kept.
- Remotes other than GitHub. The command reports them as a missing item.
- Moving vh-adlc's own docs pin to the revision that holds the new rule. That is a separate reviewed
  change after [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53) merges.

## Design

### Terms

New rows in the two-column Terms table of `plugins/vh-adlc/references/loop-settings.md`, and new entries
in the `TERMS` map of `tests/vh-adlc/loop/glossary.test.ts`:

| Term | Meaning | Rejected synonyms (`TERMS`) |
| --- | --- | --- |
| Visual record | The before and after images of a UI delivery, linked at fixed commits. | `screenshot diff`, `visual diff` |
| Before and after section | The PR body section headed `## Before and after` that holds the visual record. | `screenshots section`, `visual section` |
| Record state | `complete`, `incomplete`, `planned` or `not-applicable`, as the `visuals` command reports it. | `visual verdict`, `record verdict` |

The third column is not added to the table; it lists what goes into `TERMS`.

### Setting

`.vh-adlc/loop.yaml` gains an optional `visual_record` key, added to `LOOP_SETTINGS_KEYS`:

| Field | Meaning |
| --- | --- |
| `when.paths` | Required, non-empty list of string globs. A delivery is UI-affecting when a committed path in the feature matches one. |
| `committed` | Optional list of string globs of screenshots the repository commits. |
| `capture.command` | Optional shell command that captures both sides in one run. |
| `capture.timeout_minutes` | Optional positive whole number, default 60, for the whole run. |

At least one of `committed` and `capture` is required. Invalid shapes fail with a message naming the
field, like the rung validation. The `visuals` command reads the block as committed at HEAD through
`loadLoopSettingsAt`, so an uncommitted edit to `.vh-adlc/loop.yaml` never changes what it runs.

### Command

`bun scripts/loop/cli.ts visuals --repo <dir> --base <default branch> --pr <number> --out <dir> [--run true]`
prints one JSON object.

It exits 2, like a thrown error in the other commands, when: the committed settings declare no
`visual_record` (message "visual_record is not declared"); `--base` or `--pr` is missing, or `--pr` is
not a positive whole number; `--run true` is given and `--out` is missing, not empty, or inside the
repository's working tree; the settings can't be read; the directory is not a Git checkout; or
`git merge-base` fails. Every other outcome exits 0 with a `state`.

Output, in every case where it exits 0:

| Field | Value |
| --- | --- |
| `state` | `not-applicable`, `planned` (without `--run`), `complete` or `incomplete`. |
| `base`, `head` | Full SHAs of the merge base and HEAD. |
| `ref` | `refs/pr-visuals/<number>`. |
| `ref_commit` | The pushed commit's full SHA, or `null` when nothing was pushed. |
| `pairs` | One object per screen: `name`, `source` (`committed` or `captured`), `before_url`, `after_url`, `before_file`, `after_file`. Each URL or file is `null` for a missing side. |
| `missing` | One object per gap: `item` and `reason`. |
| `markdown` | The section text, or `""` when `not-applicable` or `planned`. |

A committed screenshot's `name` is its repository path; a captured image's `name` is its file stem.

Steps:

1. **Applicability.** Paths come from the committed range only, `git diff --no-renames --name-only -z
   <merge-base> HEAD`; uncommitted and untracked files never count. When none matches `when.paths`,
   `state` is `not-applicable` and the command stops. Without `--run`, `state` is `planned`: `pairs` lists
   the committed screenshots with their URLs and `null` files, and `missing` holds only a remote URL
   problem, if any.
2. **Committed screenshots.** From `git diff --no-renames --name-status -z <merge-base> HEAD`, paths
   matching `committed`: a modified file is a pair at the merge-base and HEAD SHAs, an added file an
   after image only, a deleted file a before image only. A rename counts as a delete plus an add. Each
   side is written from its object (`git show <sha>:<path>`) to `<out>/committed/before/<path>` or
   `<out>/committed/after/<path>`, the pair's local files.
3. **Captured images.** The command creates the empty directories `<out>/captured/before/` and
   `<out>/captured/after/`, then runs `capture.command` once, with its working directory at the feature
   checkout's root and these variables: `VH_ADLC_VISUAL_BASE` and `VH_ADLC_VISUAL_HEAD` (the merge-base and
   HEAD SHAs) and `VH_ADLC_VISUAL_OUT` (`<out>/captured`). The command builds each commit however its
   project needs and writes images into the two directories; it must not change the feature checkout.
   Files directly in each directory with a `.png`, `.webp` or `.jpg` extension are the captures, the file
   stem is the screen name, and sides pair by stem. Two files with one stem on one side are a missing
   item, and neither is used. The time limit, process-group kill and 126 or 127 handling follow the rung
   runner.
4. **Storage.** Every captured image is stored; nothing is compared. When no image was captured, the
   command pushes nothing and `ref_commit` is `null`. Otherwise it reads the remote tip with
   `git ls-remote origin refs/pr-visuals/<number>`, fetches that commit when it exists, and builds a commit
   whose tree holds `before/<file>` and `after/<file>` with plumbing only (`hash-object -w`, `mktree`,
   `commit-tree`), with the remote tip as parent when it exists. It pushes with
   `git push origin <commit>:refs/pr-visuals/<number>`, never forced. Its own Git operations never create
   or move a local ref and never change the checkout's index, HEAD, branches or working files; Git may
   write `FETCH_HEAD`. A push rejected because the ref moved is rebuilt on the new tip and retried once.
5. **Section.** `markdown` is headed `## Before and after` and has a table row per screen. Committed
   screenshots link at the merge-base and HEAD SHAs, captured images at `ref_commit` under `before/` or
   `after/`. Every link has the form `https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true`, with
   each path segment percent-encoded. A `### Missing` list follows when `missing` is not empty. Committed
   links assume HEAD is on the remote, which ship ensures by pushing first.

**Owner and repository.** They come from the raw `git config --get remote.origin.url`, never from
`git remote get-url`, which applies `insteadOf` rewrites. Accepted forms, each with or without `.git`:
`https://github.com/<owner>/<repo>`, `git@github.com:<owner>/<repo>` and
`ssh://git@github.com/<owner>/<repo>`. Anything else, including an SSH host alias such as
`git@gh-work:<owner>/<repo>`, is a missing item with the reason "remote is not a recognised GitHub URL"
and no links.

**State.** `complete` when at least one image is linked and nothing is missing. `incomplete` when
anything is missing. Missing reasons, the full list: no screenshot changed and no capture command is
declared; the capture exited non-zero (with the code); it could not run (126 or 127); it timed out; it
produced no images; it produced two files with one stem; the remote URL is not recognised; `ls-remote`
or `fetch` failed; building the commit failed (`hash-object`, `mktree` or `commit-tree`); the push failed
or was rejected twice. A failed capture doesn't discard committed pairs, and images captured but not
pushed are reported missing with their local files kept.

### Ship

Deliver changes as follows, only when the committed settings declare `visual_record`:

1. After pushing the feature branch, ship creates or updates the PR as today.
2. It runs `visuals --run true --pr <number> --out <dir>` with a new empty directory outside the
   repository.
3. On `complete` or `incomplete`, it looks at each pair's `before_file` and `after_file`.
4. It puts the command's section last in the PR body, replacing an earlier one from its
   `## Before and after` heading to the end of the body. `Closes` or `Refs` and every other part of the
   body stay above it. Earlier records stay reachable through the ref's history.
5. Inside the section, under the table, it adds one line per changed state no capture shows, such as an
   open dialog, and says why.
6. Also inside the section, when it inspected every pair and saw no visible difference, it writes
   `No visible change` with the number of screens it inspected.
7. An `incomplete` record never blocks the delivery (owner decision, 2026-11-21). The report repeats
   every missing item.

The ref push is part of the ship request's push authority and happens after ship's repository and
account confirmation; it needs no separate approval.

### Concurrency, failure, retry, upgrade

- **Concurrent ships.** Each run writes only to its own `--out` directory and its PR's ref. Where
  reservations are adopted, they keep two writers off one feature. In every case a ref push that loses a
  race is rebuilt on the new tip and retried once; a second rejection is a missing item.
- **Killed runs.** A run stopped from outside leaves only its `--out` directory and, possibly, unpushed
  objects that Git's garbage collection removes. The command registers nothing in the repository that a
  later run must clean.
- **Retry and replay.** Each ship that captured images appends a commit on top of the previous tip (owner
  decision, 2026-11-21). The PR links the newest commit, and pushes stay fast-forward.
- **Upgrade and rollback.** Settings without `visual_record` parse to the same object as today. A plugin
  older than this feature rejects the new key (`settings.ts:54`, `:208`), so adopters upgrade first.
  Rolling back means removing the block; existing refs stay and harm nothing.
- **Visibility.** The ref has the repository's visibility. Captures follow the pinned redaction rules
  above, and the proposed rule in vhco-pro/docs#53 adds that they show fixture data only.

### Coordination

`stage-scoped-verification-rungs` edits the same files and bumps the plugin version. This feature's
branch starts after that one merges, or merges the default branch in once it does. It is never rebased.

## Acceptance Criteria

- [ ] AC-01: Loop settings accept `visual_record` with a non-empty `when.paths`, optional `committed`
  globs and an optional `capture` with `command` and `timeout_minutes`. A block with neither `committed`
  nor `capture`, an empty `when.paths`, a non-string glob, or a non-positive or fractional timeout is
  rejected with a message naming the field. Settings without the key parse to the same object as before
  this feature. `visuals` uses the block as committed at HEAD, not an uncommitted edit.
- [ ] AC-02: `cli.ts visuals` reports `state: not-applicable` when no committed path in the feature
  matches `when.paths`, even when uncommitted or untracked files would match. Otherwise, without `--run`,
  it reports `state: planned` with committed pairs carrying URLs and `null` files and an empty
  `markdown`, and runs no command. Each exit-2 condition in the design exits 2.
- [ ] AC-03: A committed screenshot modified in the feature links at the merge-base and HEAD SHAs, an
  added one as an after image only, a deleted one as a before image only, and a renamed one as a delete
  plus an add, each named by its repository path, with local files written under `<out>/committed/`.
  Paths with spaces are handled.
- [ ] AC-04: With `--run true`, the capture command runs once from the feature checkout's root with
  `VH_ADLC_VISUAL_BASE`, `VH_ADLC_VISUAL_HEAD` and `VH_ADLC_VISUAL_OUT` set, and its images in `before/`
  and `after/` pair by file stem, each with a local file. Two files with one stem on one side are a
  missing item.
- [ ] AC-05: Captured images are pushed to `refs/pr-visuals/<number>` without force, in a commit whose
  parent is the previous remote tip when the ref exists. A push rejected because the ref moved is rebuilt
  on the new tip and retried once. When no image was captured, nothing is pushed and `ref_commit` is
  `null`. The command's own operations leave the checkout's `git status --porcelain`,
  `git rev-parse HEAD` and local refs unchanged.
- [ ] AC-06: Each missing reason in the design's full list yields `state: incomplete` with that reason in
  `missing` and in the section, and exit 0. Owner and repository come from the raw `remote.origin.url`,
  and only the three listed GitHub URL forms produce links.
- [ ] AC-07: Every link in the section points at the right commit and path: committed screenshots at the
  merge-base and HEAD SHAs, captured images at `ref_commit` under `before/` or `after/`, with path
  segments percent-encoded. Each `<sha>:<path>` exists and matches the pair's local file byte for byte.
- [ ] AC-08: The ship skill's Deliver section contains each statement the AC-08 Test Plan row lists.
- [ ] AC-09: `branches/cli.ts after-merge` leaves every `refs/pr-visuals/*` ref in place.
- [ ] AC-10: The loop settings reference and the workflows guide each document every `visual_record`
  field, its defaults, the three environment variables, the `before/` and `after/` output layout, that
  the command builds no checkouts, the ref name, retention, visibility and the upgrade order. The Terms
  table holds the three new rows, `TERMS` holds their rejected synonyms, and both plugin manifests carry
  the same version, one minor version above the merge base's.
- [ ] AC-11: On a private GitHub repository, a shipped fixture change shows the PR body's images to a
  signed-in reader with access, including at least one image from a `refs/pr-visuals/*` commit that no
  branch contains.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/settings.test.ts`: valid and invalid `visual_record` shapes, each rejection's field name; for settings without the key, `loadLoopSettings` and `loadLoopSettingsAt` return no `visual_record` key while the existing expectations in `settings.test.ts`, `cli.test.ts` and `rungs.test.ts` pass unchanged. `tests/vh-adlc/loop/visuals.test.ts`: a fixture whose working-tree `.vh-adlc/loop.yaml` names a different capture command from the committed one; the committed one runs. |
| AC-02 | `visuals.test.ts`: fixtures whose committed range does and doesn't match; one with a matching file only uncommitted and one only untracked, both `not-applicable`; a `planned` run asserting URLs, `null` files and `markdown: ""`, with a capture command that writes a marker file to prove it did not run. Exit 2 for: no `visual_record` committed, missing `--base`, missing `--pr`, `--pr x`, `--run true` without `--out`, a non-empty `--out`, an `--out` inside the repository, unreadable settings, a non-Git directory, and a `--base` with no merge base. |
| AC-03 | `visuals.test.ts`: one modified, one added, one deleted and one renamed committed screenshot, one with a space in its path; assert each link shape, SHA, `name` and local file. |
| AC-04 | `visuals.test.ts`: a capture script that records its working directory and the three variables and writes side-specific images; assert both pairs and their files. A script that writes `home.png` and `home.jpg` into `before/` yields the stem missing item. |
| AC-05 | `visuals.test.ts`: origin is a local bare repository. Run twice and assert the second commit's parent and a fast-forward without force; move the remote ref between `ls-remote` and push and assert one rebuilt retry; a run with only committed screenshots asserts no push and `ref_commit: null`; with staged and unstaged unrelated changes present, `git status --porcelain`, `git rev-parse HEAD` and `git for-each-ref` are identical before and after a run whose capture script writes only to its output directory. |
| AC-06 | `visuals.test.ts`: one case per missing reason in the design's list, each asserting `state`, the `missing` entry, the section text and exit 0; the timeout case passes a sub-minute limit to the function under test. URL forms, via `remote.origin.url` with `url.<bare>.insteadOf` routing fetch and push to the local bare repository: must link for `https://github.com/acme/app`, `https://github.com/acme/app.git`, `git@github.com:acme/app.git` and `ssh://git@github.com/acme/app`; must not link for `git@gh-work:acme/app.git`, `https://gitlab.com/acme/app.git` and a local path. |
| AC-07 | `visuals.test.ts`: parse every link in the section; assert committed links use `base` or `head`, captured links use `ref_commit` with `before/` or `after/`, a path with a space is encoded as `%20`, and `git cat-file -p <sha>:<path>` in the bare repository equals the pair's local file. |
| AC-08 | `tests/vh-adlc/loop/visuals-docs.test.ts` splits the Deliver section of `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` into paragraphs (blank-line separated, list items each a paragraph) and requires, case-insensitively, one paragraph matching each statement. (1) `visuals --run true --pr`: passes "run `cli.ts visuals --run true --pr <number> --out <dir>`", fails "run the visuals command". (2) `## Before and after` with `last` and `replac`: passes "Put the `## Before and after` section last, replacing an earlier one", fails "Add a `## Before and after` section". (3) `before_file` and `after_file` with `look`: passes "Look at each pair's `before_file` and `after_file`", fails "Look at the pairs". (4) `No visible change` with `inspected`: passes "Write `No visible change` only when you inspected every pair", fails "Write `No visible change` when nothing changed". (5) `no capture shows`: passes "Add a line for each changed state no capture shows", fails "Mention other states". (6) `incomplete` with `never blocks` or `does not block`: passes "An `incomplete` record never blocks the delivery", fails "An `incomplete` record blocks the delivery". (7) `report` with `missing item`: passes "The report repeats every missing item", fails "The report summarizes the delivery". (8) `push authority`: passes "The ref push falls under the ship request's push authority", fails "Push the ref". Each fail sentence, substituted alone into otherwise passing text, makes the check fail. `tests/vh-adlc/direct-operation-compatibility.test.ts` still passes. |
| AC-09 | `tests/vh-adlc/branches/branches.test.ts`: a merged-PR fixture with `refs/pr-visuals/7` on the remote; after `after-merge`, the ref resolves to the same commit. |
| AC-10 | `visuals-docs.test.ts` reads `plugins/vh-adlc/references/loop-settings.md` and `docs/user-guides/workflows.md` and requires in each: `when.paths`, `committed`, `capture.command`, `capture.timeout_minutes`, `60`, `VH_ADLC_VISUAL_BASE`, `VH_ADLC_VISUAL_HEAD`, `VH_ADLC_VISUAL_OUT`, `before/`, `after/`, `refs/pr-visuals/`, and the phrases `builds no checkouts`, `kept after merge`, `repository's visibility` and `upgrade the plugin before`. Must pass: a text with all of them; must fail: the same text without `kept after merge`. `tests/vh-adlc/loop/glossary.test.ts` holds the three rows and their `TERMS` entries; `tests/vh-adlc/check.test.ts:166-176` holds manifest equality; at review, `git show $(git merge-base origin/main HEAD):plugins/vh-adlc/plugin.json` compared with HEAD shows a minor bump, recorded in the review. |
| AC-11 | Manual procedure: in a private GitHub repository the owner selects, adopt `visual_record` with a capture command that writes one image per side, ship a one-line UI change, open the PR signed in as a reader with access, and record that every image renders, naming one from a `refs/pr-visuals/*` commit and confirming with `git branch -r --contains <sha>` that no branch holds it. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner settled every judgement call on 2026-11-21: disclose a missing record and ship, append
to the ref, no automatic comparison, a ref named by PR number, the adopter's command captures both
sides, and the recommended resolution of the remaining judgement findings of reviews R-1 and R-2.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | R-1 | spec | `35b30950` | claude-opus-5-5 | procedural | 1 blocking, 20 should-fix, 4 nits |
| 2026-11-21 | R-2 | spec | `630c3d2a` | claude-opus-5-5 | procedural | 1 blocking, 11 should-fix, 1 nit |

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

## Sources

- [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53): the proposed shared rule this feature
  implements, including the per-PR ref and fixed-commit links.
- [Frontend testing standard at the repository's pin](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/frontend-testing.md):
  captures are required and missing evidence is reported, but PR images are not yet required.
- [michielvha/stackweaver#1177, before and after comment](https://github.com/michielvha/stackweaver/pull/1177#issuecomment-7065428660):
  a hand-made record using committed captures linked at base and head SHAs, the shape this feature
  automates.
