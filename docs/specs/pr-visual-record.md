---
status: draft
status_description: "Cut down after review R-10 at the owner's request; awaiting a new independent review."
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
owner asked for this on 2026-11-21, for every project that ships through vh-adlc. The shared rule is
"Visual record in the pull request" in the frontend testing standard, merged on 2026-11-22
([vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53)).

Each project opts in with a `visual_record` block in `.vh-adlc/loop.yaml`, naming the paths that count as
UI changes and a capture command. After every PR create or update, ship runs a new `cli.ts visuals`
command in two steps. The capture step does nothing unless a committed change in the feature matches;
then it runs the project's command once, exactly as a verification rung runs, with the base and head
commits and an output folder. The command writes `before/` and `after/` images however its project
builds, including copies of screenshots the repository already commits. Ship looks at every image, and
only if nothing should stay private does the push step store them on `refs/pr-visuals/<PR number>`,
confirm that the PR's repository lists that ref, and print a table of embedded images. Ship writes that
section last in the PR body, between markers, replacing only the section it wrote before.

The owner's decisions on 2026-11-21 and 2026-11-22: a missing record is disclosed and never blocks a
delivery; a repeated ship appends to the ref, so earlier images stay; nothing compares images
automatically; the ref is named by PR number; the project's command captures both sides and is the only
image source; the GitHub host, owner and repository come from the PR; images are pushed only after
inspection; and the capture runs like a rung, with the rung runner's time limit and no further process
cleanup, so the command must stop what it starts.

The push to `refs/pr-visuals/*` is part of ship's push authority. GitHub serves the ref's files to anyone
who can read the repository, and keeps serving a commit by SHA even after its ref is deleted, so
inspecting before the push is the protection.

Nothing changes for a project without the block, and a hand-written `## Before and after` section is
never touched. An adopter upgrades the plugin before adding the block, because older settings readers
reject unknown keys.

Planned proof is fixture tests against local Git repositories, a few text checks with stated examples,
and one manual check that the images render in a private GitHub PR. Observed so far: two probes, one
showing GitHub serving a file from a commit only a custom ref holds (also after the ref was deleted), one
showing `matching-refs` listing a custom ref right after the push. Ten reviews preceded this cut; it needs
a new independent review.

Acceptance authorizes implementing this design on a feature branch. Merging, releasing and changing the
docs pin each need their own approval.

### Background

- The ship skill has the sections Generic intake, Documentation impact, Loop routes, Start, Make the
  feature shippable, Deliver, Article and promotion handoff, After an authorized merge and Report
  (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:8-143`). Deliver builds the PR body with `Closes #N` or
  `Refs #N` and no image step (`SKILL.md:105-107`). Ship confirms the repository and account before any
  GitHub write (`SKILL.md:74-75`) and never stages unrelated dirty work (`SKILL.md:88-89`).
- The authority table grants an explicit ship request "Push the feature branch, create or update its
  PR, update the linked issue" (`plugins/vh-adlc/references/authority.md:27`).
- `tests/vh-adlc/direct-operation-compatibility.test.ts:12-100` holds each direct operation's body equal
  to a baseline after stripping sections it checks separately by required phrases, such as Issue labels
  (`:44-54`).
- Loop settings accept a fixed key list (`plugins/vh-adlc/scripts/loop/settings.ts:54`) and reject
  unknown keys and fields (`settings.ts:216`, `keys()` at `:62-63`). A rung timeout must be a positive
  whole number of minutes (`settings.ts:131`). Every command except `review` loads working-tree settings
  first (`plugins/vh-adlc/scripts/loop/cli.ts:80`); `loadLoopSettingsAt` reads them as committed
  (`settings.ts:246`).
- `plugins/vh-adlc/scripts/loop/git-paths.ts:30` reads committed paths with
  `diff --no-renames --name-only -z`. The rung runner runs `bash -c` in its own process group with stdin
  ignored and output captured, waits for the exit and the output pipes, kills the group only at its time
  limit, and treats exits 126 and 127 as "could not run" (`plugins/vh-adlc/scripts/loop/rungs.ts:55-75`);
  `cli.ts rungs` returns the output tail (`cli.ts:142`). A process left running in the background keeps
  the pipes open until the time limit (R-5 F-03).
- Loop commands exit 2 on a thrown error (`cli.ts:185`).
- After-merge cleanup touches only the PR's head branch and its worktree
  (`plugins/vh-adlc/references/branches.md:87-99`).
- The loop's Terms table has two columns (`plugins/vh-adlc/references/loop-settings.md:10`); rejected
  synonyms live in `TERMS` in `tests/vh-adlc/loop/glossary.test.ts:8-17`.
- `tests/vh-adlc/check.test.ts:166-176` requires the two plugin manifests to match. Upgrade notes for
  new loop settings live in `docs/reference/compatibility.md` (for example `:180`).
- The pinned frontend testing standard requires captures to be taken and inspected, missing evidence to
  be reported, and credentials and session material to be redacted before sharing
  (`conventions/frontend-testing.md:77`, `:177-178` at `0c983f6793bfe35eb96ae95ad0c361c6200af44f`).
- Probe, 2026-11-21: a parentless commit holding one PNG on `refs/pr-visuals/probe` in the private
  repository `michielvha/stackweaver` was served by `raw.githubusercontent.com` (`200 image/png`, 34604
  bytes) and the contents API. After the ref was deleted, the commits and contents APIs still returned it
  (R-5 F-05).
- Probe, 2026-11-22: an empty-tree commit `77e40d2b324234a6d166d18214d6b1e559cd8546` pushed to
  `refs/pr-visuals/probe-empty` in the same repository was listed straight after the push by
  `gh api repos/michielvha/stackweaver/git/matching-refs/pr-visuals/probe-empty`. The ref was then
  deleted.
- GitHub serves a commit pushed to any repository in a fork network from the others (R-8 F-01), so only a
  check on the ref, not the commit, proves the PR's repository holds the record.

## Scope

In scope:

- The optional `visual_record` loop setting.
- A `cli.ts visuals` command with a capture step and a push step.
- A `## Visual record` section in the ship skill after Deliver, the matching change to
  `direct-operation-compatibility.test.ts`, and the ref push in the ship row of
  `plugins/vh-adlc/references/authority.md`.
- New Terms rows, the loop settings reference, the workflows guide with a copyable example for committed
  screenshots, a compatibility note and a minor plugin version bump.

Out of scope:

- Choosing screens, building either commit, writing capture scripts or seeding fixtures; those stay with
  each adopter.
- A separate source or helper for committed screenshots; automatic image comparison; parsing remote URLs.
- Process cleanup beyond the rung runner's: a capture that leaves processes running is the adopter's to
  fix (owner decision, 2026-11-22).
- Pruning `refs/pr-visuals/*`; only the owner's explicit request deletes one.
- Moving vh-adlc's own docs pin to the revision holding the merged rule; a separate reviewed change.

## Design

### Terms

New rows in the two-column Terms table of `plugins/vh-adlc/references/loop-settings.md`, with their
rejected synonyms as new `TERMS` entries:

| Term | Meaning | Rejected synonyms (`TERMS`) |
| --- | --- | --- |
| Visual record | The before and after images of a UI delivery, linked at fixed commits. | `screenshot diff`, `visual diff` |
| Before and after section | The PR body text from vh-adlc's start marker through its end marker, headed `## Before and after`. | `screenshots section`, `visual section` |
| Record state | `not-applicable`, `preview`, `captured`, `full` or `partial`, as the `visuals` command reports it. | `visual verdict`, `record verdict` |

The third column lists `TERMS` entries; it is not added to the table.

### Setting

`.vh-adlc/loop.yaml` gains an optional `visual_record` key:

| Field | Meaning |
| --- | --- |
| `when.paths` | Required, non-empty list of string globs, matched like `verification_rungs[].when.paths`. |
| `capture.command` | Required shell command that captures both sides in one run. |
| `capture.timeout_minutes` | Optional positive whole number, default 60. |

A missing required field, an unknown field, a non-string glob or a non-positive or fractional timeout
fails with a message naming the field. `visuals` skips the working-tree settings load, like `review`, and
reads the block as committed at HEAD through `loadLoopSettingsAt`.

### Command

`bun scripts/loop/cli.ts visuals --repo <dir> --base <ref> --pr <number> --github <host>/<owner>/<repo> --out <dir> [--capture true | --push true]`
prints exactly one JSON object on stdout.

It exits 2 when: the committed settings declare no `visual_record` (message exactly "visual_record is not
declared"); a flag is missing or malformed, or both step flags are given; with `--capture`, `--out` exists
and is not empty, or lies inside the repository (a nonexistent `--out` is created); with `--push`,
`<out>/capture.json` is missing or records another base, head or PR; the committed settings can't be
read; the directory is not a Git checkout; or `git merge-base` fails. Every other outcome exits 0.

| Field | Value |
| --- | --- |
| `state` | `not-applicable`; `preview` (no step flag); `captured` or `partial` (capture step); `full` or `partial` (push step). |
| `base`, `head` | Full SHAs of the merge base and HEAD. |
| `ref`, `ref_commit` | `refs/pr-visuals/<number>`, and the pushed commit or `null`. |
| `pairs` | Per screen: `name` (file stem), `before_file`, `after_file`, `before_url`, `after_url`; `null` for an absent side, URLs `null` until verified. |
| `missing` | Per gap: `item` and `reason`. |
| `output_tail` | The capture's output tail, or `""`. |
| `markdown` | The push step's section, else `""`. |

1. **Applicability.** Only committed paths count (`git diff --no-renames --name-only -z <merge-base>
   HEAD`). No match gives `not-applicable`; no step flag gives `preview`, running nothing.
2. **Capture step.** It creates `<out>/before/` and `<out>/after/` and runs `capture.command` through the
   rung runner, from the feature checkout's root, with `VH_ADLC_VISUAL_BASE`, `VH_ADLC_VISUAL_HEAD` and
   `VH_ADLC_VISUAL_OUT` set; stdin, output, time limit, 126 or 127 and the output tail behave as for a
   rung. The command must show each side at its given commit, never the working tree, must not change
   the feature checkout, must exit non-zero when a side can't be built or captured, and must stop
   everything it starts before it exits, because a process left running holds the run until the time
   limit. Files directly in each directory ending in `.png`, `.webp`, `.jpg` or `.jpeg` in any letter
   case are captures, named by stem and paired by stem; a stem on one side only is an added or removed
   screen, and an empty side is allowed. Two files with one stem on one side drop that stem from both
   sides and are a missing item. Images count only when the command exited 0; otherwise `missing` holds
   exactly that one reason. The step writes `<out>/capture.json` and pushes nothing.
3. **Push step.** It reads `capture.json`. With no image it pushes nothing. Otherwise it builds a commit
   holding `before/<file>` and `after/<file>` with plumbing only (`hash-object -w`, `mktree`,
   `commit-tree`), parented on the remote tip from `git ls-remote origin refs/pr-visuals/<number>` when
   one exists, and pushes it with `git push origin <commit>:refs/pr-visuals/<number>`, never forced,
   retrying once on a new tip after a rejection. It sets URLs only when
   `gh api --hostname <host> repos/<owner>/<repo>/git/matching-refs/pr-visuals/<number>` lists that ref
   at `ref_commit`. Its own Git operations never create or move a local ref or change the checkout.
4. **Section.** The start marker `<!-- vh-adlc:visual-record -->`, the heading `## Before and after`,
   then, when URLs are set, a `Screen | Before | After` table with the stem and
   `![<name> before](<url>)` or `![<name> after](<url>)` cells (`none` for an absent side; `\`, `|`, `[`
   and `]` backslash-escaped in the stem and alt text), then `### Missing` when anything is missing, and
   the end marker `<!-- /vh-adlc:visual-record -->`. URLs have the form
   `https://<host>/<owner>/<repo>/blob/<ref_commit>/<before|after>/<file>?raw=true`, each path segment
   percent-encoding every byte outside `A-Z a-z 0-9 - . _ ~`.

**State.** The push step reports `full` when an image is linked and nothing is missing, else `partial`.
Missing reasons: the capture exited non-zero (with code and output tail); could not run; timed out; wrote
no images; wrote one stem twice on one side; `ls-remote` or `fetch` failed; building the commit failed;
the push failed or was rejected twice; the PR's repository does not list the ref at `ref_commit` (or
`gh` failed).

### Ship

The new `## Visual record` section, after Deliver, carries every step; Deliver and the Input paragraph are
unchanged, and the compatibility test strips the section and checks the statements in the AC-07 row.

1. The ship request's push authority covers `refs/pr-visuals/<number>`, as the authority table's ship row
   says, after ship's repository and account confirmation.
2. After Deliver creates or updates the PR, ship runs `git fetch origin <default branch>`, takes
   `<host>/<owner>/<repo>` from `gh pr view <number> --json url`, and runs `bun scripts/loop/cli.ts
   visuals --repo <owning worktree> --base origin/<default branch> --pr <number> --github
   <host>/<owner>/<repo> --out <new directory under the system temp directory> --capture true`, in a way
   the host does not stop before `capture.timeout_minutes`, such as a background command it waits on.
3. On "visual_record is not declared" or `not-applicable`, ship removes its section if a complete marker
   pair is present, and does nothing else.
4. Otherwise it looks at each pair's `before_file` and `after_file`. When an image shows a credential, a
   session or real user data, or can't be viewed as an image, it never runs the push step; it writes its
   section with the line "Visual record missing: ship withheld the images after inspection" and reports
   that to the owner.
5. Otherwise it runs the command again with `--push true` and puts the push step's section last in the PR
   body, replacing a complete marker pair, or appending when there is none or a marker has no partner. A
   `## Before and after` section without vh-adlc's markers is never touched.
6. Inside its section it adds a line for each changed state no capture shows, and writes
   `No visible change` only when every screen has both sides, nothing is missing and it saw no
   difference.
7. On any other exit 2, or when a step produced no output, it writes its section with "Visual record
   missing:" and the reason.
8. A `partial` or missing record never blocks the delivery; the report repeats every missing item. Ship
   removes the output directory when done, except when it holds images that were captured but not
   stored, which it keeps and names in the report.
9. Deleting `refs/pr-visuals/<number>` happens only on the owner's explicit request; GitHub still serves
   the commit by SHA afterwards.

### Concurrency, failure, retry, upgrade

- Each run writes only to its own `--out` and its PR's ref; a ref push that loses a race is rebuilt on
  the new tip and retried once.
- A capture killed from outside, or one that leaves processes running, is the adopter's to clean up; the
  guide says so.
- Each ship that stores images appends a commit; the PR links the newest.
- Settings without `visual_record` parse as today. Older plugins reject the key, so adopters upgrade first.
  Removing the block makes the next ship remove the section; refs stay.

## Acceptance Criteria

- [ ] AC-01: Loop settings accept `visual_record` as designed and reject each invalid shape with a message
  naming the field; settings without it parse as before; `visuals` uses the block as committed at HEAD.
- [ ] AC-02: `visuals` reports `not-applicable` when no committed path matches (uncommitted or untracked
  matches don't count), `preview` without a step flag, running nothing, and exits 2 for each exit-2
  condition.
- [ ] AC-03: The capture step runs the command once through the rung runner with the three variables,
  pairs images by stem with local files, ignores other files, writes `capture.json`, pushes nothing, and
  keeps the capture's output off stdout.
- [ ] AC-04: The push step pushes without force onto the previous remote tip, retries once after a moved
  ref, pushes nothing without images, sets URLs only when the PR's repository lists the ref at
  `ref_commit`, and leaves the checkout's status, HEAD and local refs unchanged.
- [ ] AC-05: Each missing reason yields `partial`, that reason in `missing` and the section, and exit 0; a
  failed capture uses no image and lists only its own reason; a duplicate stem drops that screen.
- [ ] AC-06: The section has the markers, heading, table, escaping and URL form the design states, and
  each linked `<ref_commit>:<path>` matches its local file.
- [ ] AC-07: The ship skill's `## Visual record` section and the authority table contain the statements
  the AC-07 row lists, and the rest of the ship skill body is unchanged.
- [ ] AC-08: `after-merge` leaves every `refs/pr-visuals/*` ref in place.
- [ ] AC-09: The loop settings reference and the workflows guide document the setting, the capture
  contract and the ref's retention and deletion; the guide gives a copyable example for committed
  screenshots on both sides; the compatibility note, Terms rows, `TERMS` entries and a minor manifest
  bump are in place.
- [ ] AC-10: On a private GitHub repository, a shipped fixture change shows its images inline to a reader
  with access, including one from a commit only `refs/pr-visuals/*` holds.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/settings.test.ts`: valid and invalid shapes, including `capture.timeout` as an unknown field and a fractional timeout, each naming its field; settings without the key unchanged in the existing expectations. `tests/vh-adlc/loop/visuals.test.ts`: a working-tree `.vh-adlc/loop.yaml` that is invalid, or names another command, while the committed one is valid; the committed command runs. |
| AC-02 | `visuals.test.ts`: matching and non-matching committed ranges; a match only in an uncommitted or untracked file gives `not-applicable`; a `preview` run whose capture command would write a marker file leaves none; exit 2 for the exact "not declared" message, each missing flag, a malformed `--pr` and `--github`, both step flags, a non-empty or in-repository `--out`, `--push` without `capture.json` or with one recorded for another PR, base or head, unreadable committed settings, a non-Git directory and a base with no merge base. |
| AC-03 | `visuals.test.ts`: a script that records its environment and working directory, prints a hundred lines, and writes `home.png`, `list.WEBP`, `card.jpeg` and `notes.txt` to `before/` and `home.png`, `list.webp` and `new.jpg` to `after/`; assert pairs `home` and `list`, one-sided `card` and `new`, `notes.txt` ignored, local files present, `capture.json` written, no remote ref, stdout parsing as one JSON object and `output_tail` holding the script's last lines. |
| AC-04 | `visuals.test.ts` with a local bare origin and a `gh` stub on `PATH`: two pushes, the second parented on the first; a ref moved between `ls-remote` and push gives one rebuilt retry; no images, no push; the stub failing, listing no ref, or listing it at another commit each give `null` URLs and the missing reason; with unrelated staged and unstaged changes, `git status --porcelain`, `git rev-parse HEAD` and `git for-each-ref` unchanged. |
| AC-05 | `visuals.test.ts`: one case per missing reason asserting `partial`, the entry, the section text and exit 0 (the timeout case with a sub-minute limit passed to the function); a script that writes images then exits 1 gives no image and only the exit reason; `before/home.png`, `before/home.webp` and `after/home.png` give the one-stem reason and no `home` screen. |
| AC-06 | `visuals.test.ts` with `--github github.com/acme/app` and `--github ghe.example.com/acme/app`: first lines are the start marker and heading, last line the end marker; header `\| Screen \| Before \| After \|`; image cells match the URL form for that host; `none` for an absent side; `my screen.png` becomes `my%20screen.png`, and `a\|b (c).png` appears as `a\\\|b (c)` in the text and `a%7Cb%20%28c%29.png` in the URL; `git cat-file -p <ref_commit>:<path>` equals each local file. |
| AC-07 | `tests/vh-adlc/direct-operation-compatibility.test.ts` strips the ship skill's `## Visual record` section, compares the rest as today, and splits the section into paragraphs (blank-line separated, each list item one paragraph). After folding whitespace runs, line breaks included, to one space, a statement passes when one paragraph contains all its tokens case-insensitively; one paragraph may satisfy several. Each fail example substituted alone makes the check fail. (1) `push authority`, `refs/pr-visuals/`: passes "The ship request's push authority covers `refs/pr-visuals/<number>`", fails "Push the ref". (2) `visuals`, `--repo`, `--base origin/`, `--github`, `gh pr view`, `--capture true`: passes "take `--github` from `gh pr view <number> --json url` and run `cli.ts visuals --repo <worktree> --base origin/<default> --pr <n> --github <x> --out <dir> --capture true`", fails the same without `--repo`. (3) `before_file`, `after_file`, `session`, `user data`, `never run`, `push step`: passes "Look at each `before_file` and `after_file`; if one shows a credential, a session or real user data, never run the push step", fails the same without "a session or real user data". (4) `--push true`, `last`, `complete marker pair`: passes "Run it again with `--push true` and put the section last, replacing a complete marker pair", fails "Run it again with `--push true` and add the section". (5) `No visible change`, `every screen has both sides`: passes "Write `No visible change` only when every screen has both sides, nothing is missing and you saw no difference", fails "Write `No visible change` when you saw no difference". (6) `never blocks`, `missing item`: passes "A `partial` or missing record never blocks the delivery; the report repeats every missing item", fails "A `partial` record blocks the delivery". (7) The authority table's ship row contains `refs/pr-visuals/`: passes "Push the feature branch and `refs/pr-visuals/<number>`, create or update its PR, update the linked issue", fails the row as it reads today. |
| AC-08 | `tests/vh-adlc/branches/branches.test.ts`: a merged-PR fixture with `refs/pr-visuals/7` on the remote keeps it at the same commit after `after-merge`. |
| AC-09 | `tests/vh-adlc/loop/visuals-docs.test.ts`, folding whitespace as in AC-07, requires in `loop-settings.md` and `workflows.md`: `visual_record.when.paths`, `visual_record.capture.command`, `visual_record.capture.timeout_minutes`, `default 60 minutes`, the three variable names, `<out>/before/`, `<out>/after/`, the four extensions, `any letter case`, `paired by file stem`, `never the working tree`, `exit non-zero`, `must not change the feature checkout`, `stop everything it starts`, `refs/pr-visuals/`, `kept after merge` and `still serves the commit by SHA`; in the guide, `git cat-file --filters "$VH_ADLC_VISUAL_BASE:` and `git cat-file --filters "$VH_ADLC_VISUAL_HEAD:`; and in `docs/reference/compatibility.md`, `visual_record` with `upgrade the plugin before`. Must fail: the same text without `stop everything it starts`. It also fails when the ship section or the guide contains a rejected synonym. `glossary.test.ts` holds the Terms rows and `TERMS`; `check.test.ts:166-176` holds manifest equality; at review, the manifest at the merge base compared with HEAD shows a minor bump. |
| AC-10 | Manual procedure: in a private GitHub repository the owner selects, adopt `visual_record`, ship a one-line UI change, open the PR as a reader with access, and record that every image renders inline, naming one from a `refs/pr-visuals/*` commit that `git branch -r --contains` shows no branch holds. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner settled every judgement call on 2026-11-21 and 2026-11-22, including the cut after R-10:
the capture runs like a rung, the ref check is a single call, and the text checks keep only the essential
statements.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | R-1 | spec | `35b30950` | claude-opus-5-5 | procedural | 1 blocking, 20 should-fix, 4 nits |
| 2026-11-21 | R-2 | spec | `630c3d2a` | claude-opus-5-5 | procedural | 1 blocking, 11 should-fix, 1 nit |
| 2026-11-21 | R-3 | spec | `b8be9f60` | claude-opus-5-5 | procedural | 2 blocking, 10 should-fix, 3 nits |
| 2026-11-21 | R-4 | spec | `baf9eba0` | claude-opus-5-5 | procedural | 1 blocking, 5 should-fix, 3 nits |
| 2026-11-21 | R-5 | spec | `fdfe84c7` | claude-opus-5-5 | procedural | 0 blocking, 9 should-fix, 1 nit |
| 2026-11-21 | R-6 | spec | `10298ec8` | claude-opus-5-5 | procedural | 1 blocking, 7 should-fix, 4 nits |
| 2026-11-21 | R-7 | spec | `e7bac6a4` | claude-opus-5-5 | procedural | 0 blocking, 6 should-fix, 2 nits |
| 2026-11-22 | R-8 | spec | `25865301` | claude-opus-5-5 | procedural | 0 blocking, 5 should-fix, 2 nits |
| 2026-11-22 | R-9 | spec | `b0b67bbf` | claude-opus-5-5 | procedural | 0 blocking, 5 should-fix, 1 nit |
| 2026-11-22 | R-10 | spec | `a94fb265` | claude-opus-5-5 | procedural | 0 blocking, 6 should-fix, 1 nit |
| 2026-11-22 | R-11 | spec | `7f8e3452` | claude-opus-5-5 | procedural | 0 blocking, 5 should-fix, 4 nits |

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

### R-7

TARGET: e7bac6a4b3fb675eda85e9cfa68cef21142494ca

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command (synopsis, "prints one JSON object"; step 2, the capture step); Design > Ship steps 2 to 8; AC-03; AC-04; Test Plan rows AC-03 and AC-04
EVIDENCE: Ship parses the command's single JSON object in steps 3 to 8. Step 2 says the result is decided at exit, "not when its output pipes close". It never says whether the capture's stdout and stderr are inherited, piped or discarded, or what stdin the capture gets. The rung runner pipes both streams, sets stdin to ignore (`plugins/vh-adlc/scripts/loop/rungs.ts:59`) and keeps the output, which `cli.ts rungs` returns as `output_tail` (`cli.ts:142`). If an implementation inherits stdout, the adopter's build and browser logs land before the JSON and ship cannot parse the result. If it inherits stdin from an interactive host, a prompt in the capture waits until the 60-minute limit. The missing reason for a non-zero exit carries only the exit code, so neither ship nor the owner can see why a capture failed. No Test Plan row checks any of this: the AC-04 background-process case asserts only timing and PIDs.
PROPOSAL: State that the capture's stdin is ignored, that its stdout and stderr are captured and never written to the command's stdout, and that a bounded output tail goes into the output and into the failed-capture missing reason. Add a capture script that prints to stdout to the AC-03 row, and assert that stdout is exactly one JSON object.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 2 ("an empty side is allowed: a broken build shows up as a failed capture, not as a missing side"; "the command must not change the feature checkout"); AC-05 ("a side with no images next to a side with images is not a missing item"); AC-09; Test Plan rows AC-05 and AC-09
EVIDENCE: This revision applied R-6 F-06. It removed the reasons "it wrote no before images" and "it wrote no after images" and added that "a broken build shows up as a failed capture". That holds only when the adopter's command exits non-zero after failing to build or capture a side. Take a script that builds HEAD, fails to start the server, catches the error and exits 0 with an empty `after/`. It now yields record state `full`, with every screen shown as removed and nothing in `missing`, which goes against the goal ("or says which images are missing and why"). Step 2 also says the command "must not change the feature checkout". That checkout is the owning worktree, where unrelated dirty work may sit and must never be staged or discarded (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:88-89`). A capture script that checks out the base commit there switches the feature branch. Neither obligation is in AC-09's list or among the AC-09 row's required phrases (`never the working tree`, `builds no checkouts`, `tolerate leftovers`), so the guide adopters copy from can leave out both.
PROPOSAL: Add both obligations to AC-09, with required phrases in its row (for example `exit non-zero` when either side cannot be built or captured, and `must not change the feature checkout`) and a must-fail example that lacks each.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-07, statement (11); AC-07; Design > Ship steps 4 and 8
EVIDENCE: Statement (11) requires only the token `Visual record missing`. Step 4's withheld line, "Visual record missing: ship withheld the images after inspection", already holds that token in its own paragraph. So a skill that keeps steps 1 to 7, 9 and 10 but drops step 8 (any other exit 2, or a step with no output) passes (11) and every other statement. That skill writes nothing to the PR when the command errors, so the record is silently absent. A scratch script confirmed that every pass example contains its tokens and every fail example lacks one, so the gap is coverage, not a broken example. The row's text changed in this revision (statement (6), the paragraph rule, (16) and (17)) and has had no clean pass, so this is not a widening nit on a passed row.
PROPOSAL: Make (11) require `Visual record missing` together with `exit 2` and `no output`. Use the pass example "On any other exit 2, or when a step produced no output, write a marked section holding \"Visual record missing:\" and the reason", and add the fail example "If a file can't be viewed, write \"Visual record missing: ship withheld the images\"".

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-02; AC-02 ("Each exit-2 condition in the design exits 2"); Design > Command (exit-2 list, "`<out>/capture.json` is missing or was written for another base, head or PR")
EVIDENCE: The Design exits 2 when `capture.json` was written for another base, head or PR. The AC-02 row tests only "a `capture.json` for another PR". The realistic mismatch is a new commit on the feature branch, or a merge of the default branch, between the capture and push steps. Without the check, the push step would push images captured at one commit and link them as the record of another. An implementation that compares only the PR number passes the row.
PROPOSAL: Add to the AC-02 row a `--push` after a new commit on the feature branch (head mismatch) and one with a `--base` whose merge base differs from the capture's (base mismatch), each exiting 2.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship steps 2 and 4; Design > Command, State paragraph ("Images not pushed keep their local files"); Design > Concurrency, failure, retry, upgrade ("Concurrent ships", "Visibility")
EVIDENCE: Every ship creates a new `--out` "outside the repository", and the command keeps images it did not push. Nothing says whether ship removes that directory after the push step, keeps it, or names it in its report. In the withheld case (step 4), the directory holds an image ship judged to show a credential, a session or real user data. The pinned standard keeps screenshots in "an ignored artifact directory" and says "Redact credentials and session material before sharing artifacts" (`conventions/frontend-testing.md:175`, `:177` at 0c983f6). One implementer deletes the directory. Another leaves an unnamed temporary directory behind on every ship, holding whatever was withheld.
PROPOSAL: State where ship creates `--out` and that its report names it. Say whether the directory is removed after a verified push and whether it is kept or removed after a withheld record. Add that as a statement in the AC-07 row.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship, lead paragraph ("replaces the earlier marked text") and steps 3 and 6; Design > Terms (Before and after section row); Test Plan row AC-07, statements (4) and (8)
EVIDENCE: vh-adlc's section is "the text from its start marker through its end marker". A PR body is free text that people edit, and some bodies have no defined section: a start marker with no end marker after it, an end marker alone, or two start markers from a pasted copy. One implementer treats everything after the start marker as the section and deletes a reviewer's later text. Another appends a second section and leaves the stray marker. Steps 3 and 6 remove or replace the section on every ship, so this decides whether ship deletes text it did not write, which the design otherwise rules out ("A `## Before and after` section without the markers is never touched").
PROPOSAL: State that ship removes or replaces only a complete start-to-end pair. When the markers are unpaired, it leaves the existing body text alone, appends its section last and reports the stray marker. Add this as a statement in the AC-07 row.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context > Owner summary, second paragraph ("when a committed change in the feature matches, it then runs a new `cli.ts visuals` command in two steps"); Design > Ship steps 2 and 3
EVIDENCE: Ship step 2 runs the command after every Deliver. The command decides applicability itself (Command step 1) and reports `not-applicable`, and ship then removes its section (Ship step 3). The summary still reads as if ship checks the match before running anything. This wording came from applying R-6 F-12 in this revision.
PROPOSAL: Say that ship runs `cli.ts visuals` after every PR create or update, and that the command captures only when a committed change matches.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design > Setting (`when.paths`); Design > Command step 1; AC-02
EVIDENCE: `when.paths` is a "list of string globs" with no matcher named. The rung path condition matches with `Bun.Glob` (`plugins/vh-adlc/scripts/loop/rungs.ts:43`), while `covers` patterns use a separate matcher held to shared cases (`tests/vh-adlc/loop/covers-cases.json`). The two agree on simple patterns, so this rarely changes a result.
PROPOSAL: Say that `when.paths` matches the same way as `verification_rungs[].when.paths`.

### R-8

TARGET: 25865301052ddbb235e6d62d492d7362d4aa341c

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 ("runs `gh api --hostname <host> repos/<owner>/<repo>/commits/<ref_commit>`; only when that succeeds do the URLs get set, so links never point at a repository that doesn't hold the commit"); Design > Command, State paragraph ("the PR's repository does not hold the pushed commit (or `gh` failed)"); Scope (the push step bullet, "checks the PR's repository holds them"); Context > Owner summary, second paragraph ("check that the PR's repository holds them"); Design > Concurrency, failure, retry, upgrade ("Retry and replay"); AC-04 ("URLs are set only after `gh api` confirms the PR's repository holds `ref_commit`"); Test Plan row AC-04
EVIDENCE: The push step pushes to `origin` (`git push origin <commit>:refs/pr-visuals/<number>`) but verifies against the `--github` repository taken from the PR. GitHub's fork documentation (docs.github.com, About permissions and visibility of forks, fetched in this review) says "Commits pushed to any repository in a network can be accessible from other repositories in that network, including the upstream repository." So when `origin` is a fork and the PR targets the upstream, a case `plugins/vh-adlc/references/branches.md:91` already handles ("A PR from a fork has no branch in this repository"), the commits API check succeeds although the PR's repository holds no `refs/pr-visuals/<number>`. The record then lives in the fork, outside the retention, after-merge and deletion rules the Design states for the PR's repository, and the State reason for a repository that doesn't hold the commit never fires. A check on the ref itself is available: in this review `gh api repos/michielvha/stackweaver/git/matching-refs/pull/1177` returned `refs/pull/1177/head`, so that endpoint lists refs outside `refs/heads` and `refs/tags`. The AC-04 row's `gh` stub only succeeds or fails, so it cannot tell the two checks apart.
PROPOSAL: Verify the ref in the PR's repository, for example by requiring `gh api --hostname <host> repos/<owner>/<repo>/git/matching-refs/pr-visuals/<number>` to list `refs/pr-visuals/<number>` at `ref_commit` (probe it once on a custom ref first), or state that a PR whose head repository differs from its base is a missing item. Update every location above and give the AC-04 stub a case where the commit resolves but the ref is absent.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-07, statement (8); Design > Ship, the lead paragraph ("Every section ship writes between vh-adlc's markers goes last in the PR body and replaces the earlier marked text") and steps 3 and 6
EVIDENCE: A scratch script split Design > Ship into paragraphs, using the row's own rule (blank-line separated, each list item its own paragraph), and tested each statement's tokens case-insensitively. Every statement matched exactly one paragraph except (8) (`last`, `replac`, `marker`), which matched the lead paragraph, step 3 and step 6. Step 3 gained "ship removes or replaces only such a complete pair" and "appends its own section last" when this revision applied R-7 F-06. A skill that keeps step 3 but has step 6 put the push step's section first, or drops step 6's placement rule, still passes (8), so the statement no longer checks where the pushed record goes. The row changed in this revision ((11) rewritten, (18) and (19) added), so it has not passed review.
PROPOSAL: Make (8) require `push step` together with `last`, with the pass example "Put the push step's section last, replacing the whole earlier text between vh-adlc's markers" and the fail example "Put the push step's section first, replacing the earlier marked text". Neither step 3 nor the lead paragraph contains `push step`, and step 4 does not contain `last`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 2 ("Ship removes that directory after a verified push; after a withheld record it removes it as well and names its former path in the report"); Design > Command, State paragraph ("Images not pushed keep their local files"); Design > Command exit paragraph ("a nonexistent `--out` is created"); Test Plan row AC-07, statement (18)
EVIDENCE: Step 2 covers only two outcomes. Ship creates a new directory under the temporary directory on every run, but the Design never says what happens to it after `not-applicable`, an exit 2, a step with no output, a capture with no images, a failed or twice-rejected push, or a push whose `gh` check failed. The State paragraph keeps unpushed images on disk, yet the report is required to name the directory only after a withheld record, so in those cases inspected images sit in an unnamed temporary directory that nobody is told about. One implementer removes the directory after every outcome. Another keeps it without saying where it is. R-7 F-05 proposed that the report name `--out`, and this revision applied that only to the withheld case.
PROPOSAL: State, for every outcome, whether ship removes the directory, and require the report to name any directory it keeps, for example after a failed push so the owner can retry. Extend statement (18) to cover that rule.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context > Owner summary, second paragraph ("any background process it leaves behind is stopped when it exits"); Design > Command step 2 ("kills whatever is left of the capture's process group, so a server it started in the background never holds the run"); Design > Concurrency, failure, retry, upgrade ("Killed runs"); AC-04; AC-09 ("tolerance of leftovers"); Test Plan row AC-09 (`tolerate leftovers`)
EVIDENCE: The Design kills only the capture's process group, as the rung runner does (`plugins/vh-adlc/scripts/loop/rungs.ts:59` spawns detached, `:61` kills `-child.pid`). A process that calls `setsid` or daemonizes, and a container started through a daemon such as `docker compose up -d`, is not in that group and keeps running after every ship. The summary promises that any leftover background process is stopped, which the Design does not deliver. The guide only has to tell adopters to tolerate leftovers after a SIGKILL ("Killed runs"), so a guide that never says the command must stop what it starts outside its process group passes AC-09, and an adopter following it leaves servers or containers running after each ship.
PROPOSAL: Say in the summary that leftover processes in the capture's process group are stopped. Require the guide to say that the capture command must stop anything it starts outside its process group, such as containers or daemons, before it exits, with a required phrase and a must-fail example in the AC-09 row.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Terms (the third column and "Reports write \"record state `full`\" and so on, never the bare value"); AC-09 ("`TERMS` holds their rejected synonyms"); Test Plan row AC-09 ("`tests/vh-adlc/loop/glossary.test.ts` holds the three rows and their `TERMS` entries"); Context > Background (the glossary bullet)
EVIDENCE: `tests/vh-adlc/loop/glossary.test.ts:18-21` scans only `loop-settings.md`, `review-protocol.md`, `loop.md`, `authority.md` and `scripts/loop/*`. The new terms are used mainly where that scan does not reach: the ship skill's `## Visual record` section, which tells ship how to write the section and the report, and `docs/user-guides/workflows.md`. A ship skill or guide that says "visual diff" or "screenshots section" passes AC-09. The standard says a feature's user-facing terms are "held to it by a criterion" (`conventions/feature-documents.md:169-170` at 0c983f6), and as written the criterion checks a test entry, not the surfaces readers see.
PROPOSAL: Have `visuals-docs.test.ts`, or the AC-07 test, also reject the three terms' rejected synonyms in the ship skill's `## Visual record` section and in `docs/user-guides/workflows.md`, with a must-fail example, and name that in AC-09 and its row.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design > Setting ("Invalid shapes, including a missing `capture` or `capture.command`, fail with a message naming the field, like the rung validation"); AC-01; Test Plan row AC-01
EVIDENCE: Rung validation rejects unknown fields through `keys()` (`plugins/vh-adlc/scripts/loop/settings.ts:62-63`, applied at `:112` and `:119`). The Design implies the same for `visual_record`, `when` and `capture` only through "like the rung validation", and neither AC-01 nor its row names an unknown field. With a lenient reader, a typo such as `capture.timeout` would silently fall back to the 60-minute default.
PROPOSAL: Say that unknown fields in `visual_record`, `visual_record.when` and `visual_record.capture` are rejected, and add one such case to the AC-01 row.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design > Ship steps 4, 7 and 8; Design > Command step 4 (the `### Missing` list "before the closing marker"); Design > Terms (the Before and after section row, "headed `## Before and after`")
EVIDENCE: Steps 4 and 8 have ship write a marked section "holding one line", without saying whether the `## Before and after` heading comes first, although the Terms row defines the section as headed and the push step's `markdown` always includes the heading. Step 7 puts ship's own lines "under the table" but does not say whether they go before or after the `### Missing` list that the push step places just before the closing marker.
PROPOSAL: Say that every marked section ship writes starts with the heading, and say where step 7's lines go relative to `### Missing`.

### R-9

TARGET: b0b67bbf800f60e309754ed686c5a44cd042f204

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-07, statement (18); Design > Ship step 2 ("After a withheld record it removes the directory and names its former path in the report, so no withheld image stays on disk"); Design > Command, State paragraph ("Images not pushed keep their local files"); AC-07
EVIDENCE: Statement (18) only requires the tokens `temporary directory`, `remov`, `withheld`, `keeps` and `names it in the report` somewhere in one paragraph. It never checks which outcome removes the directory and which keeps it. A scratch script tested this wrong paragraph: "Ship uses a new directory under the system's temporary directory. It removes it after a verified push; when ship withheld the images, or a push failed, it keeps the directory and names it in the report." It holds all five tokens, so it passes (18). A skill that says this leaves on disk the images ship judged to show a credential, a session or real user data. That is the case step 2 calls out ("so no withheld image stays on disk"), and the pinned standard says "Redact credentials and session material before sharing artifacts" (`conventions/frontend-testing.md:177-178` at 0c983f6). This revision rewrote (18) when it applied R-8 F-03, so the row has not passed review and this is not a widening nit.
PROPOSAL: Split (18) into two statements: one for the withheld case (for example `withheld` together with `remov` and `former path`), and one for the kept case (`captured but not pushed`, `keeps`, `names it in the report`). Give the paragraph above as a fail example for the first.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-07 (the matching rule: "A statement passes when at least one paragraph contains all of its tokens, matched case-insensitively"); Test Plan row AC-09 (required phrases in `loop-settings.md`, `docs/user-guides/workflows.md` and `docs/reference/compatibility.md`, and the synonym rejection)
EVIDENCE: Both rows match multi-word tokens such as `names it in the report`, `temporary directory`, `before writing`, `stray marker`, `must not change the feature checkout`, `still serves the commit by SHA` and `upgrade the plugin before`. Neither row says whether whitespace runs fold to one space before matching. The target files are hard-wrapped Markdown: `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:15-18` and `plugins/vh-adlc/references/loop-settings.md:5-6` break sentences across lines. A scratch script split this document's own Design > Ship text with the row's paragraph rule. Statement (18) matched no paragraph when only newlines were replaced, because step 2 wraps "names it in" and "the report" onto separate indented lines. It matched step 2 only after whitespace runs were folded. So a test that doesn't fold fails a correct skill or guide whenever a line break falls inside a token. A test that folds passes the same text. Two implementers would write different tests, and a later rewrap of a correct document could break one of them.
PROPOSAL: State in both rows that the checked text and each token have whitespace runs folded to one space before the case-insensitive match, as the standard does for criterion text. Add one must-pass example in each row where a required phrase spans a line break.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 7 ("when it inspected every pair and saw no visible difference, the line `No visible change` with the number of screens it inspected"); Context > Owner summary, the decisions paragraph ("says \"No visible change\" only when it sees none"); Test Plan row AC-07, statement (10)
EVIDENCE: "Every pair" is vacuously inspected when `pairs` is empty. That happens after a non-zero, unrunnable or timed-out capture, because "no image is used" (Command step 2), and after a capture that wrote nothing. In those cases the push step returns a section with no table and a `### Missing` list (Command step 4). Step 7 doesn't rule out adding "No visible change" with zero screens. Statement (10)'s pass example, "Write `No visible change` only when you inspected every pair", is satisfied by a skill that allows it. A reader of such a PR sees "No visible change" next to a failed capture, which works against the goal ("or says which images are missing and why"). One skill author would require at least one inspected pair. Another would follow the text literally.
PROPOSAL: Say that ship writes `No visible change` only when it inspected at least one screen with both sides and the record has no missing item. Make (10) require that condition, with a fail example such as "Write `No visible change` when you saw no difference in the pairs".

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design > Command step 3 (`gh api --hostname <host> repos/<owner>/<repo>/git/matching-refs/pr-visuals/<number>`); Design > Command, State paragraph ("the PR's repository does not list `refs/pr-visuals/<number>` at `ref_commit` (or `gh` failed)"); AC-04; Test Plan row AC-04; Context > Owner summary, second paragraph ("check that the PR's repository holds that ref") and the validation paragraph ("Observed so far"); Context > Background, the probe bullet
EVIDENCE: Every URL now depends on that endpoint listing a user-pushed ref in a custom namespace right after the push. The Background records only one probe: raw and contents fetches of a commit on `refs/pr-visuals/probe`. It doesn't record a `matching-refs` call on that ref. The only cited observation of the endpoint is R-8 F-01's call on `refs/pull/1177`, a ref GitHub manages. R-8 F-01 proposed "probe it once on a custom ref first", and this revision adopted the endpoint without recording such a probe. Read-only, I found no custom ref to test against: `git ls-remote origin` for `michielvha/vh-adlc` lists none outside heads, tags and pull. If the endpoint omits such refs, or lags behind the push, every record ends `partial` with null URLs. The `gh` stub in the AC-04 row can't detect either case, and only the manual AC-10 at the very end would.
PROPOSAL: Before acceptance, run and record a probe in the Background: push a custom `refs/pr-visuals/*` ref to a private repository and call `matching-refs` on it straight away. Or state the fallback (for example a bounded retry of the check) if the listing can lag.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Concurrency, failure, retry, upgrade ("Killed runs": "Processes outside the group, such as a daemon, a `setsid` child or a container started with `docker compose up -d`, are never killed by the step"); Design > Command step 2 (the group kill at exit); Context > Owner summary, second paragraph ("leftover processes in its process group are stopped when it exits, and the guide tells adopters to stop containers or daemons they start"); AC-04; AC-09 and Test Plan row AC-09 (`outside its process group`)
EVIDENCE: The plugin already has a runner that stops helpers that left the group. `plugins/vh-adlc/scripts/triage/owned-process.ts:1-7` says: "A helper can also leave the group with setsid or setpgid, so every child carries an owner marker in its environment, which descendants inherit, and processes that still carry it after the group is gone are stopped as well". It exports `markedProcesses` (`:33`) and `OWNER_MARKER_VARIABLE` (`:30`), and `tests/vh-adlc/loop/owned-process.test.ts` covers it. The design models the capture step on the rung runner (`rungs.ts:59-61`), which kills only the group. It then pushes every `setsid` or daemonized helper onto each adopter's guide, so a capture whose browser driver or dev server detaches keeps running after every ship. Only a container that a daemon owns is genuinely out of reach. This boundary was set when this revision applied R-8 F-04.
PROPOSAL: Either reuse the owner-marker cleanup in the capture step, so marked processes that left the group are also stopped and only daemon-owned containers stay with the adopter, or raise the choice between the two as an Open Question. Update the summary, Killed runs, AC-04 (with a `setsid` child case) and the AC-09 phrase to match.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context > Background ("Loop commands exit 2 on a thrown error (`cli.ts:185`), including a failed Git call (`rungs.ts:17`)")
EVIDENCE: `plugins/vh-adlc/scripts/loop/rungs.ts:17` is the line `function git(repo: string, args: string[]): string {`. The throw on a failed Git call is at `rungs.ts:19`.
PROPOSAL: Cite `rungs.ts:19`, or `:17-21` for the whole helper.

### R-10

TARGET: a94fb2658410631982bdca43c038657263e12be7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command, the exit paragraph ("On SIGINT or SIGTERM during a capture it kills the capture's process group before exiting"); Design > Concurrency, failure, retry, upgrade ("Killed runs": "On SIGINT or SIGTERM, and after the capture command exits normally, the capture step stops the capture's process group and every process carrying its owner marker"); Design > Command step 2 (the marker cleanup at exit); AC-04; Test Plan row AC-04 (the SIGTERM and SIGINT cases); Context > Owner summary, second paragraph
EVIDENCE: The exit paragraph stops only the process group on a signal, while Killed runs and AC-04 also require every marked process to stop. `runOwnedClient` stops marked processes on cancellation only when it is cancelled through `options.signal` (`plugins/vh-adlc/scripts/triage/owned-process.ts:87`, `:170-175`, then `stopMarked` at `:185`). An implementation that installs its own SIGTERM handler, kills `-pid` and exits skips the marker sweep, as the exit paragraph allows. The AC-04 signal cases start "a child sleeping for minutes", which stays in the group, so they pass that implementation. Only the exit-0 cases use `setsid`. The rule changed when this revision applied R-9 F-05 (owner-marker cleanup).
PROPOSAL: Make the exit paragraph say that the signal path also stops every process carrying the owner marker, for example by aborting `runOwnedClient` through its AbortSignal. Add a `setsid sleep 600 &` child to the SIGTERM and SIGINT cases of the AC-04 row.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 2 ("The capture runs through the owned-process runner (`runOwnedClient`)", "Images count only when the command exited 0"); Design > Command, State paragraph ("Missing reasons, the full list"); Design > Command output table (`output_tail`); AC-04; AC-05; Test Plan rows AC-04 and AC-05
EVIDENCE: Reusing `runOwnedClient` brings outcomes that the "full list" of missing reasons does not name. With `capture: "memory"`, the natural way to keep the capture's output off the command's stdout, the runner applies `OUTPUT_LIMIT` of 16 MiB (`owned-process.ts:61`, `:93`). On overflow it sets `output_limit` and stops the whole group (`:148`, `:165`), so a verbose build is killed partway through. File output without `maxOutputBytes` has no limit at all. After the child exits, the runner can also return `confirmed: false` with `survivors`, or a group probe it cannot settle (`:185-194`, `groupProbe` at `:53-56`). `review-route.ts:339` treats that case as pending. Here, a capture that exited 0 would have its images used under step 2, although AC-04 says nothing is left behind. The runner's `pidNamespace` option (`:99-100`), which `review-route.ts:331` turns on, decides whether processes that clear the marker are stopped, and the Design does not say whether the capture uses it. Two implementers would classify output overflow as a timeout, a non-zero exit or an exit 2, and would use or drop images after unconfirmed cleanup. This came in when this revision applied R-9 F-05.
PROPOSAL: State the runner options the capture uses: the output mode and limit, and either a PID namespace or the marker only. Add output overflow and unconfirmed cleanup to the full list of missing reasons, each saying whether images are used, and add a case for each to the AC-05 row.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers`; Design > Command step 2 (`runOwnedClient`); Context > Background (the `owned-process.ts` bullet)
EVIDENCE: The capture step now runs through `runOwnedClient`, `OWNER_MARKER_VARIABLE` and `markedProcesses`, all in `plugins/vh-adlc/scripts/triage/owned-process.ts` (`:30`, `:33`, `:91`). That path is not in `covers`, which lists only `scripts/loop/` files, `scripts/settings-file.ts` and `scripts/branches/` among the scripts. The runner's test, `tests/vh-adlc/loop/owned-process.test.ts`, is covered through `tests/vh-adlc/loop/`, but its source is not. A change to the runner's cleanup, limits or exit handling would change AC-04 and AC-05 behaviour, yet it would not make a review stale or show in `feature_tree_clean`. The dependency came in with this revision.
PROPOSAL: Add `plugins/vh-adlc/scripts/triage/owned-process.ts` to `covers`.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 2 ("If the listing of the PR's ref lags behind the push, the step repeats the ref check up to three times, a few seconds apart, before reporting the missing item"); Design > Command step 3 (the `gh api ... matching-refs` check); Design > Command, State paragraph ("does not list `refs/pr-visuals/<number>` at `ref_commit` (or `gh` failed)"); AC-04; Test Plan row AC-04 ("a `gh` stub that lists the ref only on its third call"); Context > Owner summary, second paragraph; Context > Background, the 2026-11-22 probe
EVIDENCE: The retry rule sits in the capture step, which "pushes nothing" and runs no ref check; the check lives in step 3. "Repeats the ref check up to three times" can mean three calls in all or four. "A few seconds apart" fixes no interval. The text also does not say whether a `gh` that exits non-zero, or a listing at another commit, is retried or ends at once. AC-04's text has no retry, so an implementation without one meets the criterion but fails the row's third-call case. An implementation that makes three calls and one that makes four both pass that case. The sentence came in this revision, applying R-9 F-04.
PROPOSAL: Move the rule into step 3 and state the total number of calls, the interval and which results are retried. Add the retry to AC-04's text, and add a stub case that lists the ref only after the last allowed call and expects null URLs.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 7 ("only when the record has no missing item, at least one screen has both sides, and it inspected every pair and saw no visible difference"); Context > Owner summary, decisions paragraph ("says \"No visible change\" only when it saw complete pairs and no difference"); Test Plan row AC-07, statement (10); Design > Command step 2 ("A stem on one side only is a one-sided screen, added or removed")
EVIDENCE: A one-sided screen is a screen the feature added or removed, which is a visible change. Step 7 requires only that at least one screen has both sides. Take a record with an unchanged `home` pair and a new after-only `settings` screen. A skill that reads "pair" as a two-sided screen meets step 7's words and writes `No visible change` on a PR that adds a page. The summary's "complete pairs" reads as every screen having both sides, which contradicts step 7. The tokens of statement (10) (`No visible change`, `inspected`, `both sides`, `no missing item`) accept both readings. This wording came in this revision, applying R-9 F-03.
PROPOSAL: Require in step 7 and the summary that every screen in the record has both sides, with at least one screen, no missing item and no difference seen. Give (10) the token `every screen`, with the fail example "Write `No visible change` when there is no missing item, at least one screen has both sides and you inspected every pair".

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 2 (the `--capture true` run); Design > Ship step 8 ("when a step produced no output"); Design > Setting (`capture.timeout_minutes`, default 60); Design > Concurrency, failure, retry, upgrade ("Killed runs"); AC-07; Test Plan row AC-07
EVIDENCE: Ship runs the capture as an ordinary host command. The Bash tool of the Claude Code host running this review caps a foreground command at 600000 ms ("max 600000 for a foreground command" in its tool schema). That is a sixth of the 60-minute default the Design sets for building and capturing two commits. A search of `plugins/vh-adlc/references` and `plugins/vh-adlc/skills` for "foreground", "in the background", "run_in_background" and "tool limit" found nothing, so no shared rule covers this. When the host stops the command, ship gets no output, and step 8 writes "Visual record missing" on every ship of a project whose capture takes longer. A stop by SIGKILL also leaves the capture's processes behind ("Killed runs"). Rungs have the same 60-minute default (`rungs.ts:58`), but a failed rung blocks delivery. Here the failure is disclosed and the delivery goes on, so a slow capture never produces a record and the original problem remains for that project. One skill author would tell ship to keep the host from cutting the run short; another would not.
PROPOSAL: Say in Ship step 2 how ship runs the capture so the host cannot stop it before `capture.timeout_minutes` runs out, for example as a background command ship waits on, or with a host timeout at least that long. Add that statement to the AC-07 row with must-pass and must-fail examples.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context > Owner summary, validation paragraph ("Observed so far: one probe showed GitHub serving a file from a commit that only a custom ref holds") and second paragraph
EVIDENCE: This revision added a second probe to Background for R-9 F-04: on 2026-11-22, `matching-refs` listed `refs/pr-visuals/probe-empty` right after the push. Every URL now depends on that listing, and step 2 adds a bounded retry of the ref check. The summary still names one probe and does not mention the retry. I confirmed the probe's remains: `gh api repos/michielvha/stackweaver/commits/77e40d2b324234a6d166d18214d6b1e559cd8546` returns a parentless commit with the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`, and `gh api repos/michielvha/stackweaver/git/matching-refs/pr-visuals/` now returns `[]`.
PROPOSAL: Name both probes in the summary's observed proof and mention the bounded retry of the ref check.

### R-11

TARGET: 7f8e3452accadc83c227ac96ce060cf4eb15027b

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 8 ("except when it holds images that were captured but not stored, which it keeps and names in the report"); Design > Ship step 4 (withheld images); Context > Owner summary, first paragraph ("only if nothing should stay private does the push step store them") and third paragraph ("inspecting before the push is the protection"); Test Plan row AC-07 (no statement covers what happens to the output directory)
EVIDENCE: Images that ship withholds in step 4, because one shows a credential, a session or real user data, are by definition "captured but not stored". Step 8 as written therefore keeps them on disk and names their path in the report. The previous revision ruled this out. At a94fb265, Ship step 2 said "After a withheld record it removes the directory and names its former path in the report, so no withheld image stays on disk", which was the fix for R-9 F-01. This revision dropped that sentence. The owner's decisions about the cut, as Open Questions records them, cover three items only: the capture runs like a rung, the ref check is a single call, and the text checks keep only the essential statements. Retention is not among them. The pinned standard says "Redact credentials and session material before sharing artifacts" and "Do not put runtime secrets, private user data or captured sessions into Git" (`conventions/frontend-testing.md:77`, `:177-178` at 0c983f6). This traces to a change the previous revision made (7f8e3452 reverted the R-9 F-01 fix).
PROPOSAL: Restore the rule that a withheld record's directory is removed and its former path reported, and keep only images that passed inspection but failed to push or verify. Either that, or raise keeping withheld images as an Open Question.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship step 5 ("replacing a complete marker pair, or appending when there is none or a marker has no partner"); Design > Ship step 3 ("removes its section if a complete marker pair is present"); Design > Terms, the "Before and after section" row ("from vh-adlc's start marker through its end marker"); Design > Command step 4 (the markers); Context > Owner summary, second paragraph ("replacing only the section it wrote before")
EVIDENCE: The document doesn't say how markers pair once a body holds a stray one. Take a body with a start marker whose end marker someone deleted, then a reviewer's paragraph, then the start and end markers of the section the last ship appended (step 5 appends when "a marker has no partner"). On the next ship, pairing each start marker with the next end marker gives a pair that spans the reviewer's paragraph, and replacing it deletes text vh-adlc did not write. Pairing innermost replaces only the appended section. The design also doesn't say whether a body that holds both a stray marker and a complete pair gets a replacement or an append. The previous revision had "the text from its start marker through the next end marker ... When a start or end marker has no partner, ship leaves the existing body text alone, appends its own section last and reports the stray marker" (a94fb265, Ship step 3, from R-7 F-?? at line 985 of this document). This revision removed it, so two implementers would replace different spans. This traces to a change the previous revision made.
PROPOSAL: Define the pair as a start marker followed by an end marker with no other marker between them. Ship replaces or removes only that span, leaves every other marker and the text around it in place, and reports a stray marker. Use the same definition in the Terms row and in steps 3 and 5.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Ship steps 2, 5, 6 and 7 (the PR body write); Design > Ship step 8 ("the report repeats every missing item"); Design > Concurrency, failure, retry, upgrade, first bullet ("Each run writes only to its own `--out` and its PR's ref"); Context > Owner summary, second paragraph
EVIDENCE: Deliver writes the PR body, and then the capture runs for up to `capture.timeout_minutes`, 60 by default, before ship writes the section. The design doesn't say when ship reads the body it rewrites. An implementation that reuses the body from Deliver overwrites any edit the owner, a reviewer or a bot made during the capture. The design also defines no outcome when the ref push succeeded but the body write fails. The command has already reported `full` with no missing item, so step 8 has nothing to repeat and the record is stored but never linked or disclosed. The previous revision covered both: "It reads the PR body again just before writing it ... If writing the PR body fails, ship reports a missing record naming the pushed `ref_commit`" (a94fb265, Ship step 6, which applied R-6's finding at line 911 of this document). The Concurrency bullet names only `--out` and the ref as shared state, not the PR body. This traces to a change the previous revision made.
PROPOSAL: State that ship reads the PR body again just before writing it, and that a failed body write is reported as a missing record naming the pushed `ref_commit`. Name the PR body in the Concurrency bullet.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design > Command step 3 ("It reads `capture.json`" and builds the commit with `hash-object -w`); Design > Ship steps 4 and 5; Context > Owner summary, third paragraph ("inspecting before the push is the protection"); Scope, out of scope ("Process cleanup beyond the rung runner's"); Design > Concurrency, failure, retry, upgrade, second bullet; Test Plan row AC-04
EVIDENCE: The rung runner returns once the child exits and its output pipes close (`plugins/vh-adlc/scripts/loop/rungs.ts:59-62`). A helper started with `setsid ... >/dev/null 2>&1 &` holds neither pipe, so the run ends with exit 0 while the helper keeps running and can still write to `$VH_ADLC_VISUAL_OUT/before/` or `after/`. The design deliberately leaves such processes running. The push step then reads whatever bytes are on disk when it runs, after ship's inspection, and nothing in `capture.json` ties those bytes to the ones ship looked at. The Owner summary calls inspection "the protection" because GitHub keeps serving a commit by SHA after its ref is deleted (Background, 2026-11-21 probe). An image that changes between inspection and push is therefore published for good without ever being inspected.
PROPOSAL: Record each capture's blob ID (`git hash-object`, without `-w`) in `capture.json`. Have the push step store only files whose ID still matches, and report any mismatch as a missing item. Add a changed-after-capture case to the AC-04 row.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-06 ("`a\|b (c).png` appears as `a\\\|b (c)` in the text"); Design > Command step 4 (the escaping rule); AC-06
EVIDENCE: The row sits inside a table, where `\|` stands for a pipe. Parsing the row's code spans with remark-gfm (from `/home/m/code/stackweaver/frontend/node_modules`) gave `a|b (c).png`, `a\\|b (c)` with two backslashes, and `| Screen | Before | After |` for the header. The file name holds no backslash (the URL example `a%7Cb%20%28c%29.png` has no `%5C`), so the design's rule ("`\`, `|`, `[` and `]` backslash-escaped") gives `a\|b (c)` with one backslash. As rendered, the row expects text that a correct implementation does not produce. A reader of the raw source could take it either way, so two implementers would write different assertions. The text came in with this revision. At a94fb265 the row read `a\|b (c)`, which rendered as an unescaped `a|b (c)`. This traces to a change the previous revision made.
PROPOSAL: State the expected Screen cell and alt text in prose outside the table's code spans, for example "the stem with one backslash before the pipe", or move the escaping examples to a list below the table.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design > Command step 3 ("parented on the remote tip from `git ls-remote origin refs/pr-visuals/<number>` when one exists"); Design > Command, State paragraph ("`ls-remote` or `fetch` failed")
EVIDENCE: `commit-tree -p <tip>` needs the parent object in the local repository, so the step has to fetch the tip. The State paragraph still lists a `fetch` failure, but step 3 no longer mentions a fetch. At a94fb265, step 3 said "fetches that commit when it exists". 7f8e3452 dropped it. This traces to a change the previous revision made.
PROPOSAL: Restore "fetches that commit when it exists" in step 3.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Test Plan row AC-05 ("the timeout case with a sub-minute limit passed to the function"); Design > Setting (`capture.timeout_minutes`, "default 60"); Design > Command step 2 ("time limit ... behave as for a rung")
EVIDENCE: The rung runner uses `rung.timeout_minutes` when it is set and falls back to `options.timeoutMs` only otherwise (`plugins/vh-adlc/scripts/loop/rungs.ts:58`). An implementation that turns the 60-minute default into `timeout_minutes: 60` ignores a millisecond override. The design names no function and no override for the row to call.
PROPOSAL: Name the exported function and its timeout override in Command step 2, and say the override wins over `capture.timeout_minutes`.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context > Background, the frontend testing bullet ("`conventions/frontend-testing.md:77`, `:177-178`")
EVIDENCE: At 0c983f6, line 77 reads "Do not put runtime secrets, private user data or captured sessions into Git." Taking and inspecting captures is at `:164-165`, and reporting missing evidence is at `:188`.
PROPOSAL: Cite `:164-165`, `:188` and `:177-178` for the stated claims, and quote `:77` as the rule against putting captured sessions into Git.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Sources, first bullet ("the proposed shared rule this feature implements"); Context > Owner summary, first paragraph ("merged on 2026-11-22")
EVIDENCE: `gh pr view 53 -R vhco-pro/docs --json state,mergedAt,mergeCommit` returned `MERGED`, `2026-11-22T07:31:36Z`, merge commit `edd4c091cd7913e5c4eeb716e6f0f13df2fe7ab7`. The summary says the rule is merged, but Sources still calls it proposed.
PROPOSAL: Call it the merged rule in Sources and name the merge commit.

## Sources

- [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53): the proposed shared rule this feature
  implements, including the per-PR ref and fixed-commit links.
- [Frontend testing standard at the repository's pin](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/frontend-testing.md):
  captures are required and missing evidence is reported, but PR images are not yet required.
- [michielvha/stackweaver#1177, before and after comment](https://github.com/michielvha/stackweaver/pull/1177#issuecomment-7065428660):
  a hand-made record using committed captures linked at base and head SHAs, the shape this feature
  automates.
