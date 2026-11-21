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

## Sources

- [vhco-pro/docs#53](https://github.com/vhco-pro/docs/pull/53): the proposed shared rule this feature
  implements, including the per-PR ref and fixed-commit links.
- [Frontend testing standard at the repository's pin](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/frontend-testing.md):
  captures are required and missing evidence is reported, but PR images are not yet required.
- [michielvha/stackweaver#1177, before and after comment](https://github.com/michielvha/stackweaver/pull/1177#issuecomment-7065428660):
  a hand-made record using committed captures linked at base and head SHAs, the shape this feature
  automates.
