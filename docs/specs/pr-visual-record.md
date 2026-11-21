---
status: draft
status_description: "Being written; not yet reviewed."
issue: null
goal: "Every pull request vh-adlc ships for a visible UI change carries before and after images linked at fixed commits, or says which images are missing and why."
covers:
  - plugins/vh-adlc/scripts/loop/visuals.ts
  - plugins/vh-adlc/scripts/loop/settings.ts
  - plugins/vh-adlc/scripts/loop/cli.ts
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - tests/vh-adlc/loop/
---

# Plan: Visual record in shipped pull requests

The ship operation adds a "Before and after" section to the pull request of any feature that changes
visible UI. The images come from captures the repository already commits, or from a capture command
the adopter declares, and are stored on a per-branch ref outside `refs/heads`.

## Context

### Owner summary

A UI pull request today describes its change in text only. A reviewer can't see the old and new look
side by side, and the history keeps no visual record. The owner asked for this record on 2026-11-21,
and the shared rule is proposed as "Visual record in the pull request" in the frontend testing standard
([vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53)).

This feature makes ship produce that section automatically. An adopter opts in with a `visual_record`
block in `.vh-adlc/loop.yaml`: path globs that mark a delivery as UI-affecting, globs of screenshots the
repository already commits, and an optional capture command. When the feature's delta matches, a new
`cli.ts visuals` command pairs the committed screenshots that changed and links them at the base and
head commits. It runs the capture command once on the base commit and once on the head commit, each in
a temporary worktree, and pushes the new images to `refs/pr-visuals/<branch>`. It then prints a Markdown
section that ship puts into the PR body. Ordinary clones skip that ref, but GitHub still serves its
files to anyone who can read the repository.

Two decisions came from the owner. When images can't be produced, ship discloses the gap in the PR body
and still ships; it never blocks. A repeated ship appends a commit to the ref, so earlier images stay in
the record and no push is ever forced.

Nothing changes for an adopter without the block. vh-adlc stays project-neutral: which screens to
capture, the fixture data and the capture script all belong to the adopter. An adopter has to upgrade
the plugin before adding the block, because older settings readers reject unknown keys.

Planned proof is unit and fixture tests against local Git repositories, plus a skill-text check for the
ship step. Observed so far: one probe on 2026-11-21 showed GitHub serving an image from a commit that
only a custom ref holds. The document has had no independent review yet.

Acceptance authorizes implementing this design on a feature branch. Merging, releasing and changing the
docs pin each need their own approval.

### Background

- Ship builds the PR body in its Deliver step with no image step:
  `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:98-101`.
- Loop settings accept a fixed key list and reject anything else:
  `plugins/vh-adlc/scripts/loop/settings.ts:54` defines `LOOP_SETTINGS_KEYS`, and
  `plugins/vh-adlc/scripts/loop/settings.ts:208` enforces it.
- The feature delta and path matching this design reuses already exist for verification rungs:
  `featureDelta` at `plugins/vh-adlc/scripts/loop/rungs.ts:23`, path-glob selection at
  `plugins/vh-adlc/scripts/loop/rungs.ts:35-38`, and command execution with a time limit and
  process-group kill at `plugins/vh-adlc/scripts/loop/rungs.ts:40-60`.
- After-merge cleanup "touches only that PR's head branch" (remote branch, tracking ref and local
  branches) and its worktree: `plugins/vh-adlc/references/branches.md:87-99`. No step names other refs.
- The shared frontend testing standard at the repository's pin requires captures to be taken and
  inspected, and missing evidence to be reported instead of marked verified, but says nothing about
  showing captures in a PR (`conventions/frontend-testing.md`, "Responsive visual quality" and
  "Evidence and completion", at `0c983f6793bfe35eb96ae95ad0c361c6200af44f`).
- Probe, 2026-11-21: a parentless commit holding one PNG was pushed to `refs/pr-visuals/probe` in the
  private repository `michielvha/stackweaver`. Fetching
  `https://raw.githubusercontent.com/michielvha/stackweaver/721b0569fae72c29695d11c2c8af9fbafb24665a/probe.png`
  with the session's token returned `200 image/png`, 34604 bytes, and
  `gh api repos/michielvha/stackweaver/contents/probe.png?ref=721b0569...` returned size 34604. No branch
  contained the commit. The ref was deleted afterwards.
- `docs/specs/stage-scoped-verification-rungs.md` is in progress on `feat/stage-scoped-rungs` and changes
  `rungs.ts`, `settings.ts`, `cli.ts` and the ship skill too.

## Scope

In scope:

- The optional `visual_record` loop setting and its validation.
- A `cli.ts visuals` command that decides applicability, pairs committed captures, runs the capture
  command on both sides, stores new images on `refs/pr-visuals/<branch>` and prints the PR section.
- The ship skill's Deliver step using that section, naming uncaptured changed states and stating "no
  visible change" when every capture matched.
- The loop settings reference, the workflows user guide and a minor plugin version bump.

Out of scope:

- Choosing screens, writing capture scripts or seeding fixtures. Those stay with each adopter.
- Pixel-diff thresholds or baseline approval. Comparison is byte equality only.
- Image upload to GitHub's attachment store, which has no API.
- Pruning old `refs/pr-visuals/*` refs. They are the record and are kept.
- Remotes other than GitHub. The command reports them as missing a link form.
- Moving vh-adlc's own docs pin to the revision that holds the new rule. That is a separate reviewed
  change, after [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53) merges.

## Design

### Setting

`.vh-adlc/loop.yaml` gains an optional `visual_record` key, added to `LOOP_SETTINGS_KEYS`:

| Field | Meaning |
| --- | --- |
| `when.paths` | Required, non-empty list of globs. A delivery is UI-affecting when any path in the feature delta matches one. |
| `committed` | Optional globs of captures the repository commits, such as guide screenshots. |
| `capture.command` | Optional shell command run once per side from that side's worktree root. |
| `capture.timeout_minutes` | Optional whole number, default 30, per side. |

At least one of `committed` and `capture` is required. Invalid shapes fail with a message naming the
field, like the existing rung validation.

### Command

`bun scripts/loop/cli.ts visuals --repo <dir> --base <default branch> [--run true]` prints JSON.

1. **Applicability.** The delta comes from `featureDelta`. When no delta path matches `when.paths`, the
   result is `{applicable: false}` and ship adds no section. Without `--run`, the command stops after
   applicability and lists the committed pairs it would link.
2. **Committed captures.** For delta paths matching `committed`, from
   `git diff --name-status <merge-base>..HEAD`: a modified file is a pair linked at the merge-base and
   HEAD SHAs, an added file an after image only, a deleted file a before image only.
3. **Captured images.** The command adds two detached temporary worktrees, at the merge base and at HEAD,
   and runs `capture.command` in each with `VH_ADLC_VISUAL_SIDE` set to `before` or `after` and
   `VH_ADLC_VISUAL_OUT` set to an empty directory. Files directly in that directory with a `.png`,
   `.webp` or `.jpg` extension are the captures; the file name is the screen name. Sides pair by name.
   A byte-identical pair goes on an `unchanged` list. HEAD means the committed head; uncommitted work is
   never captured. Both worktrees are removed after success, failure and timeout alike.
4. **Storage.** The command fetches `refs/pr-visuals/<branch>`, builds a commit whose tree holds
   `before/<name>` and `after/<name>` for each changed or one-sided capture, with the fetched tip as
   parent when the ref exists, and pushes it with `git push origin <commit>:refs/pr-visuals/<branch>`,
   never forced. Unchanged captures are not stored.
5. **Section.** The output carries a Markdown section headed "Before and after": a table row per screen
   with images linked as `https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true`, using the
   merge-base and HEAD SHAs for committed captures and the pushed ref commit for captured ones. It
   ends with the unchanged names and any missing items with their reasons.

The result's `state` is `complete` when every requested source produced its images, `incomplete` when
something is missing, and `not-applicable` as above. `missing` lists each gap: a non-zero capture exit
(with the exit code), a timeout, an output directory with no images, a remote whose URL is not GitHub,
or a push rejected twice. The process exits 0 in every one of those states; only bad arguments or
unreadable settings exit non-zero, as the other `cli.ts` commands do.

### Ship

In Deliver, before creating or updating the PR, ship runs `visuals --run true` when the settings declare
`visual_record`. On `complete` or `incomplete` it puts the section into the PR body. It then adds one line
per changed state it knows the captures don't show, such as an open dialog, and says why. When every
capture is unchanged it writes "No visible change" with the capture count. An `incomplete` record never
blocks the delivery (owner decision, 2026-11-21); the report repeats every missing item.

### Concurrency, failure, retry, upgrade

- **Concurrent ships.** The single-writer reservation already keeps two writers off one feature. If the
  ref push still loses a race, the command refetches, rebuilds the commit on the new tip and retries
  once. A second rejection is a missing item.
- **Partial failure.** Images captured but not pushed are discarded with their temporary worktrees and
  reported missing. A failed side doesn't discard the other side's committed pairs.
- **Retry and replay.** Each ship appends a commit on top of the previous tip (owner decision,
  2026-11-21). The PR links the newest commit, earlier commits stay reachable, and pushes stay
  fast-forward.
- **Upgrade and rollback.** Settings without `visual_record` produce output identical to today for every
  command. A plugin older than this feature rejects the new key (`settings.ts:54`, `settings.ts:208`), so
  adopters upgrade first. Rolling back means removing the block; existing refs stay and harm nothing.
- **Visibility.** The ref has the repository's visibility. In a public repository the images are public,
  like the PR itself, so captures must show fixture data only, as the frontend standard's redaction rule
  already requires.

### Coordination

`stage-scoped-verification-rungs` edits the same files. This feature's branch starts after that one
merges, or rebases onto it before review, so neither lands over the other's changes.

## Acceptance Criteria

- [ ] AC-01: Loop settings accept `visual_record` with a non-empty `when.paths`, optional `committed`
  globs and an optional `capture` with `command` and `timeout_minutes`. A block with neither `committed`
  nor `capture`, an empty `when.paths`, a non-string glob or a non-positive timeout is rejected with a
  message naming the field. Settings without the key produce unchanged output for every `cli.ts` command.
- [ ] AC-02: `cli.ts visuals` reports `not-applicable` when no delta path matches `when.paths`, and
  otherwise reports applicability with the committed pairs it would link, without running any command
  when `--run` is absent.
- [ ] AC-03: A committed capture modified in the delta is linked at the merge-base and HEAD SHAs, an added
  one as an after image only, and a deleted one as a before image only.
- [ ] AC-04: With `--run true`, the capture command runs once in a detached worktree at the merge base and
  once at HEAD, with `VH_ADLC_VISUAL_SIDE` and `VH_ADLC_VISUAL_OUT` set. Images pair by file name,
  byte-identical pairs are listed as unchanged, and no temporary worktree remains after a successful,
  failed or timed-out run.
- [ ] AC-05: Changed and one-sided captures are pushed to `refs/pr-visuals/<branch>` without force, in a
  commit whose parent is the previous tip when the ref exists. A push rejected because the ref moved is
  rebuilt on the new tip and retried once.
- [ ] AC-06: A non-zero capture exit, a timeout, an empty output directory, a non-GitHub remote and a push
  rejected twice each yield `state: incomplete` with a reason in `missing` and in the Markdown section,
  and the process exits 0.
- [ ] AC-07: The Markdown section is headed "Before and after" and links every image at a full commit SHA,
  never at a branch name, followed by the unchanged and missing lists.
- [ ] AC-08: The ship skill's Deliver step runs `visuals --run true` when `visual_record` is declared, puts
  the section into the PR body, names uncaptured changed states, writes "No visible change" when every
  capture matched, and does not block on an `incomplete` record.
- [ ] AC-09: `branches/cli.ts after-merge` leaves every `refs/pr-visuals/*` ref in place.
- [ ] AC-10: The loop settings reference and the workflows guide document every `visual_record` field,
  its defaults, the two environment variables, the ref name, retention, the visibility note and the
  upgrade order. Both plugin manifests carry the same version, one minor version above the version they
  had before this feature.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/loop/settings.test.ts`: valid and invalid `visual_record` shapes, and a snapshot comparison of every command's output for settings without the key. |
| AC-02 | `tests/vh-adlc/loop/visuals.test.ts`: fixture repositories whose deltas do and don't match `when.paths`, with a capture command that writes a marker file to prove it did not run. |
| AC-03 | `visuals.test.ts`: a fixture with one modified, one added and one deleted committed capture; assert the three link shapes and SHAs. |
| AC-04 | `visuals.test.ts`: a capture script that writes side-specific images and its environment to the output directory; a second that exits 1; a third that sleeps past a one-minute limit. After each, `git worktree list` holds only the fixture's own worktree. |
| AC-05 | `visuals.test.ts`: a fixture whose origin is a local bare repository; run twice and assert the second commit's parent and a non-forced fast-forward; move the remote ref between fetch and push and assert one rebuilt retry. |
| AC-06 | `visuals.test.ts`: one case per missing reason, asserting `state`, `missing`, the section text and exit code 0. The GitHub link form uses a fixture whose configured URL names github.com while `url.<base>.insteadOf` sends fetch and push to the local bare repository. |
| AC-07 | `visuals.test.ts`: parse the section and assert every image URL contains a 40-character SHA and no branch name. |
| AC-08 | `visuals.test.ts` skill-text check on `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md`, plus `tests/vh-adlc/direct-operation-compatibility.test.ts` still passing. |
| AC-09 | `tests/vh-adlc/branches/branches.test.ts`: a merged-PR fixture with a `refs/pr-visuals/<branch>` ref; after `after-merge`, the ref resolves to the same commit. |
| AC-10 | `tests/vh-adlc/settings-references.test.ts` extended for the new fields, and `tests/vh-adlc/loop/plugin-version.test.ts` for the manifest versions. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner settled the two judgement calls on 2026-11-21: disclose a missing record and ship, and
append to the ref on every ship.

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
