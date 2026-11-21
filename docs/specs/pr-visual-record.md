---
status: draft
status_description: "Revised after review R-1; awaiting a new independent review."
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
  - tests/vh-adlc/settings-references.test.ts
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
committed screenshots at the base and head commits. It runs the head's capture command twice, once in a
temporary worktree of the base and once in one of the head, and pushes those images to
`refs/pr-visuals/<PR number>`. Ship then looks at the pairs and writes the section into the PR body,
replacing any earlier one.

The owner made five decisions on 2026-11-21. A missing record is disclosed and never blocks a delivery.
A repeated ship appends to the ref, so earlier images stay. Nothing compares images automatically: ship
inspects the pairs and says "No visible change" only when it sees none. The ref is named by PR number.
Both sides run the head's capture script, so the first PR that adds capture still gets a before side.

The extra push to `refs/pr-visuals/*` is part of ship's existing push authority and goes through its
repository and account confirmation. Ordinary clones don't fetch that ref; GitHub serves its files to
anyone who can read the repository, so in a public repository the images are public, like the PR.

Nothing changes for an adopter without the block. vh-adlc stays project-neutral: screens, fixture data
and capture script belong to the adopter. An adopter has to upgrade the plugin before adding the block,
because older settings readers reject unknown keys.

Planned proof is fixture tests against local Git repositories, a skill-text check with stated examples,
and one manual check that the images render in a private GitHub PR. Observed so far: one probe showed
GitHub serving a file from a commit that only a custom ref holds. Review R-1 found 25 issues; this
revision applies them and needs a new independent review.

Acceptance authorizes implementing this design on a feature branch. Merging, releasing and changing the
docs pin each need their own approval.

### Background

- Ship builds the PR body in its Deliver step with no image step:
  `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:98-101`. It confirms the repository and account before
  any GitHub write (`SKILL.md:67-68`) and never stages unrelated dirty work (`SKILL.md:81-82`).
- Loop settings accept a fixed key list and reject anything else:
  `plugins/vh-adlc/scripts/loop/settings.ts:54` defines `LOOP_SETTINGS_KEYS`, and
  `plugins/vh-adlc/scripts/loop/settings.ts:208` enforces it. A rung timeout must be a positive whole
  number of minutes (`settings.ts:131`).
- `featureDelta` (`plugins/vh-adlc/scripts/loop/rungs.ts:23`) returns committed paths plus every
  uncommitted and untracked path (`rungs.ts:29-32`). Committed paths come from
  `plugins/vh-adlc/scripts/loop/git-paths.ts:29-31`, which reads `diff --no-renames --name-only -z`.
  Rung commands run with a time limit and a process-group kill (`rungs.ts:40-60`), and exits 126 and
  127 count as "could not run" (`rungs.ts:59`).
- Loop commands exit 2 on a thrown error (`plugins/vh-adlc/scripts/loop/cli.ts:176-178`) and 3 for some
  verdicts (`cli.ts:118`, `:149`, `:170`).
- After-merge cleanup "touches only that PR's head branch" (remote branch, tracking ref and local
  branches) and its worktree: `plugins/vh-adlc/references/branches.md:87-99`.
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
  command on both sides, stores new images on `refs/pr-visuals/<PR number>` and prints the PR section.
- The ship skill's Deliver step: open or update the PR, run the command, inspect the pairs, write or
  replace the section, name uncaptured changed states, and say "No visible change" only after
  inspection.
- New Terms rows, the loop settings reference, the workflows user guide and a minor plugin version
  bump.

Out of scope:

- Choosing screens, writing capture scripts or seeding fixtures. Those stay with each adopter.
- Automatic image comparison of any kind, by bytes or pixels (owner decision, 2026-11-21).
- Image upload to GitHub's attachment store, which has no API.
- Pruning old `refs/pr-visuals/*` refs. They are the record and are kept.
- Remotes other than GitHub. The command reports them as a missing item.
- Moving vh-adlc's own docs pin to the revision that holds the new rule. That is a separate reviewed
  change after [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53) merges.

## Design

### Terms

New rows in the Terms table of `plugins/vh-adlc/references/loop-settings.md`:

| Term | Meaning | Not |
| --- | --- | --- |
| Visual record | The before and after images of a UI delivery, linked at fixed commits. | screenshot diff, visual diff, baseline |
| Before and after section | The PR body section headed `## Before and after` that holds the visual record. | screenshots section, visual section |
| Record state | `complete`, `incomplete` or `not-applicable`, as the `visuals` command reports it. | pass, fail |

### Setting

`.vh-adlc/loop.yaml` gains an optional `visual_record` key, added to `LOOP_SETTINGS_KEYS`:

| Field | Meaning |
| --- | --- |
| `when.paths` | Required, non-empty list of string globs. A delivery is UI-affecting when a committed path in the feature matches one. |
| `committed` | Optional list of string globs of screenshots the repository commits. |
| `capture.command` | Optional shell command, read from the head's settings and run once per side. |
| `capture.timeout_minutes` | Optional positive whole number, default 30, per side. |

At least one of `committed` and `capture` is required. Invalid shapes fail with a message naming the
field, like the rung validation.

### Command

`bun scripts/loop/cli.ts visuals --repo <dir> --base <default branch> --pr <number> [--run true]`
prints one JSON object. `--pr` is required; a missing or non-numeric value, an unreadable settings file
or a directory that is not a Git checkout exits 2, like a thrown error in the other commands. Every
other outcome exits 0.

Output, in every case:

| Field | Value |
| --- | --- |
| `state` | `not-applicable`, `planned` (without `--run`), `complete` or `incomplete`. |
| `base`, `head` | Full SHAs of the merge base and HEAD. |
| `ref` | `refs/pr-visuals/<number>`. |
| `ref_commit` | The pushed commit's full SHA, or `null`. |
| `pairs` | One object per screen: `name`, `source` (`committed` or `captured`), `before_url`, `after_url` (either may be `null` for a one-sided screen). |
| `missing` | One object per gap: `item` and `reason`. |
| `markdown` | The section text, or `""` when `not-applicable`. |

Steps:

1. **Applicability.** Paths come from the committed range only, `git diff --no-renames --name-only -z
   <merge-base> HEAD`; uncommitted and untracked files never count, because they are never captured.
   When none matches `when.paths`, `state` is `not-applicable` and the command stops. Without `--run`,
   `state` is `planned` and `pairs` lists the committed screenshots it would link.
2. **Committed screenshots.** From `git diff --no-renames --name-status -z <merge-base> HEAD`, paths
   matching `committed`: a modified file is a pair at the merge-base and HEAD SHAs, an added file an
   after image only, a deleted file a before image only. A rename counts as a delete plus an add.
3. **Captured images.** Before anything else, the command removes any registered worktree under its own
   prefix, `<git common dir>/vh-adlc-visuals/`, left by an earlier killed run, and runs
   `git worktree prune`. It then adds a detached worktree at the merge base, runs the capture command,
   removes that worktree, and does the same at HEAD; the sides never overlap. The command runs with its
   working directory in the side's worktree and these variables: `VH_ADLC_VISUAL_SIDE` (`before` or
   `after`), `VH_ADLC_VISUAL_OUT` (an empty directory) and `VH_ADLC_VISUAL_HEAD` (the HEAD worktree's
   path, so a script the feature adds resolves on both sides). Files directly in the output directory
   with a `.png`, `.webp` or `.jpg` extension are the captures, and the file stem is the screen name.
   Sides pair by stem. Two files with one stem on one side are a missing item, and neither is used.
   HEAD means the committed head; uncommitted work is never captured. The timeout and the 126 or 127
   handling follow the rung runner.
4. **Storage.** Every captured image is stored; nothing is compared. The command reads the remote tip
   with `git ls-remote origin refs/pr-visuals/<number>`, fetches that commit when it exists, and builds a
   commit whose tree holds `before/<file>` and `after/<file>` with plumbing only (`hash-object -w`,
   `mktree`, `commit-tree`), with the remote tip as parent when it exists. It pushes with
   `git push origin <commit>:refs/pr-visuals/<number>`, never forced. It never creates or moves a local
   ref and never changes the checkout's index, HEAD, branches or working files; Git may write
   `FETCH_HEAD`. A push rejected because the ref moved is rebuilt on the new tip and retried once.
5. **Section.** `markdown` is headed `## Before and after` and has a table row per screen. Committed
   screenshots link at the merge-base and HEAD SHAs, captured images at `ref_commit` under `before/` or
   `after/`. Every link has the form `https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true`, with
   each path segment percent-encoded. A `### Missing` list follows when `missing` is not empty.

**Owner and repository.** They come from the raw `git config --get remote.origin.url`, never from
`git remote get-url`, which applies `insteadOf` rewrites. Accepted forms, each with or without `.git`:
`https://github.com/<owner>/<repo>`, `git@github.com:<owner>/<repo>` and
`ssh://git@github.com/<owner>/<repo>`. Anything else, including an SSH host alias such as
`git@gh-work:<owner>/<repo>`, is a missing item with the reason "remote is not a recognised GitHub URL"
and no links.

**State.** `complete` when at least one image is linked and nothing is missing. `incomplete` when
anything is missing, or when an applicable delivery links no image at all, with the reason "no
screenshot changed and no capture command is declared" or "the capture command produced no images".
Missing reasons: the capture exited non-zero (with the code), could not run (126 or 127), timed out,
produced no images, produced two files with one stem, a worktree could not be added, the remote URL is
not recognised, `ls-remote` or `fetch` failed, or the push failed or was rejected twice. A failed
capture side doesn't discard committed pairs or the other side's images, and images captured but not
pushed are reported missing.

### Ship

Deliver changes as follows, only when the settings declare `visual_record`:

1. After pushing the feature branch, ship creates or updates the PR as today.
2. It runs `visuals --run true --pr <number>`.
3. On `complete` or `incomplete`, it looks at every pair. It writes the command's section into the PR
   body, replacing an earlier one from its `## Before and after` heading up to the next `## ` heading or
   the end. Earlier records stay reachable through the ref's history.
4. It adds one line per changed state it knows no capture shows, such as an open dialog, and says why.
5. When it inspected every pair and saw no visible difference, it writes `No visible change` with the
   number of screens it inspected.
6. An `incomplete` record never blocks the delivery (owner decision, 2026-11-21). The report repeats
   every missing item.

The ref push is part of the ship request's push authority and happens after ship's repository and
account confirmation; it needs no separate approval.

### Concurrency, failure, retry, upgrade

- **Concurrent ships.** Where reservations are adopted, they keep two writers off one feature. In every
  case a ref push that loses a race is rebuilt on the new tip and retried once; a second rejection is a
  missing item.
- **Killed runs.** A run stopped from outside can leave a temporary worktree or a capture process. The
  next run removes leftovers under its prefix before starting.
- **Retry and replay.** Each ship appends a commit on top of the previous tip (owner decision,
  2026-11-21). The PR links the newest commit, and pushes stay fast-forward.
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
  this feature.
- [ ] AC-02: `cli.ts visuals` reports `state: not-applicable` when no committed path in the feature
  matches `when.paths`, even when uncommitted or untracked files would match, and otherwise
  `state: planned` with the committed screenshots it would link, without running any command when
  `--run` is absent. A missing or non-numeric `--pr` exits 2.
- [ ] AC-03: A committed screenshot modified in the feature links at the merge-base and HEAD SHAs, an
  added one as an after image only, a deleted one as a before image only, and a renamed one as a delete
  plus an add. Paths with spaces are handled.
- [ ] AC-04: With `--run true`, the head's capture command runs first in a detached worktree at the merge
  base and then at HEAD, never both at once, with `VH_ADLC_VISUAL_SIDE`, `VH_ADLC_VISUAL_OUT` and
  `VH_ADLC_VISUAL_HEAD` set, including when the script exists only at HEAD. Images pair by file stem, and
  two files with one stem on one side are a missing item. After a successful, failed or timed-out run,
  and after a run that starts with a leftover worktree under its prefix, no worktree under that prefix
  remains.
- [ ] AC-05: Captured images are pushed to `refs/pr-visuals/<number>` without force, in a commit whose
  parent is the previous remote tip when the ref exists. A push rejected because the ref moved is rebuilt
  on the new tip and retried once. A run leaves the checkout's `git status --porcelain`,
  `git rev-parse HEAD` and local refs unchanged.
- [ ] AC-06: Each missing reason in the design yields `state: incomplete` with that reason in `missing`
  and in the section, and exit 0, as does an applicable delivery that links no image. Owner and
  repository come from the raw `remote.origin.url`, and only the three listed GitHub URL forms produce
  links.
- [ ] AC-07: Every link in the section points at the right commit and path: committed screenshots at the
  merge-base and HEAD SHAs, captured images at `ref_commit` under `before/` or `after/`, with path
  segments percent-encoded, and each `<sha>:<path>` exists.
- [ ] AC-08: The ship skill's Deliver step runs `visuals --run true --pr <number>` after creating or
  updating the PR when `visual_record` is declared, writes or replaces the `## Before and after` section,
  names uncaptured changed states, writes `No visible change` only after inspecting every pair, and does
  not block on an `incomplete` record. It states that the ref push falls under the ship request's push
  authority.
- [ ] AC-09: `branches/cli.ts after-merge` leaves every `refs/pr-visuals/*` ref in place.
- [ ] AC-10: The loop settings reference and the workflows guide document every `visual_record` field, its
  defaults, the three environment variables, the ref name, retention, visibility and the upgrade order.
  The Terms table holds the three new rows, and both plugin manifests carry the same version, one minor
  version above the merge base's.
- [ ] AC-11: On a private GitHub repository, a shipped fixture change shows the PR body's images to a
  signed-in reader with access, including at least one image from a `refs/pr-visuals/*` commit that no
  branch contains.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/settings.test.ts`: valid and invalid `visual_record` shapes, each rejection's field name; and for settings without the key, `loadLoopSettings` and `loadLoopSettingsAt` return no `visual_record` key while the existing settings, `context` and `rungs` expectations in `settings.test.ts`, `cli.test.ts` and `rungs.test.ts` pass unchanged. |
| AC-02 | `tests/vh-adlc/loop/visuals.test.ts`: fixtures whose committed range does and doesn't match; one with a matching file only uncommitted and one only untracked, both `not-applicable`; a capture command that writes a marker file proves it did not run without `--run`; `--pr` missing and `--pr x` exit 2. |
| AC-03 | `visuals.test.ts`: one modified, one added, one deleted and one renamed committed screenshot, one of them with a space in its path; assert each link shape and SHA. |
| AC-04 | `visuals.test.ts`: a capture script added only at HEAD that writes side-specific images, its environment and start and end timestamps; assert both sides ran, in order, without overlap; a script that exits 1; one that sleeps past a sub-minute limit passed to the function under test; one that writes `home.png` and `home.jpg`; and a run that starts with a planted leftover worktree under the prefix. After each, `git worktree list` holds no entry under the prefix. |
| AC-05 | `visuals.test.ts`: origin is a local bare repository. Run twice and assert the second commit's parent and a fast-forward without force; move the remote ref between `ls-remote` and push and assert one rebuilt retry; with staged and unstaged unrelated changes present, `git status --porcelain`, `git rev-parse HEAD` and `git for-each-ref` are identical before and after. |
| AC-06 | `visuals.test.ts`: one case per missing reason, and the zero-image case, each asserting `state`, the `missing` entry, the section text and exit 0. URL forms, via `remote.origin.url` with `url.<bare>.insteadOf` routing fetch and push to the local bare repository: must link for `https://github.com/acme/app`, `https://github.com/acme/app.git`, `git@github.com:acme/app.git` and `ssh://git@github.com/acme/app`; must not link for `git@gh-work:acme/app.git`, `https://gitlab.com/acme/app.git` and a local path. |
| AC-07 | `visuals.test.ts`: parse every link in the section; assert committed links use `base` or `head`, captured links use `ref_commit` with `before/` or `after/`, a path with a space is encoded as `%20`, and `git cat-file -e <sha>:<path>` succeeds in the bare repository for each. |
| AC-08 | `visuals.test.ts` reads `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md`'s Deliver section and requires each of: `visuals --run true --pr`; `## Before and after` with the word `replac`; `No visible change` in a sentence that also says `inspect`; `never blocks` or `does not block` near `incomplete`; and `push authority`. Must pass: the revised Deliver text. Must fail: the same text with the `visuals` line removed, and with `never blocks` changed to `blocks`. `tests/vh-adlc/direct-operation-compatibility.test.ts` still passes. |
| AC-09 | `tests/vh-adlc/branches/branches.test.ts`: a merged-PR fixture with `refs/pr-visuals/7` on the remote; after `after-merge`, the ref resolves to the same commit. |
| AC-10 | `tests/vh-adlc/settings-references.test.ts` extended for the new fields; `tests/vh-adlc/loop/glossary.test.ts` for the three Terms rows; a committed test that the two manifests carry the same version; and at review, `git show $(git merge-base origin/main HEAD):plugins/vh-adlc/plugin.json` compared with HEAD shows a minor bump, recorded in the review. |
| AC-11 | Manual procedure: in a private GitHub repository the owner selects, adopt `visual_record` with a capture command that writes one image per side, ship a one-line UI change, open the PR signed in as a reader with access, and record that every image renders, naming one from a `refs/pr-visuals/*` commit and confirming with `git branch -r --contains <sha>` that no branch holds it. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner settled every judgement call on 2026-11-21: disclose a missing record and ship, append
to the ref on every ship, no automatic comparison, a ref named by PR number, the head's capture script
on both sides, and the recommended resolution of review R-1's remaining judgement findings.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | R-1 | spec | `35b30950` | claude-opus-5-5 | procedural | 1 blocking, 20 should-fix, 4 nits |

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

## Sources

- [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53): the proposed shared rule this feature
  implements, including the per-PR ref and fixed-commit links.
- [Frontend testing standard at the repository's pin](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/frontend-testing.md):
  captures are required and missing evidence is reported, but PR images are not yet required.
- [michielvha/stackweaver#1177, before and after comment](https://github.com/michielvha/stackweaver/pull/1177#issuecomment-7065428660):
  a hand-made record using committed captures linked at base and head SHAs, the shape this feature
  automates.
