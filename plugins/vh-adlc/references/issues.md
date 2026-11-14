# Issue labels

Every repository that adopts vh-adlc carries the same issue labels, and the operations that file or
assess issues apply them the same way. The set lives in `scripts/labels/vocabulary.json`; the table
below renders it, and a test keeps the two equal.

## Terms

| Term | Meaning |
| --- | --- |
| standard label set | The labels the vocabulary file defines, each with name, color and description |
| type label | A standard label that says what kind of work an issue is |
| state label | A standard label that says where an issue stands: `ready`, `blocked`, `partial`, `needs-decision` |
| label plan | The labels helper's comparison of one repository with the standard label set, bound by a digest |

## The standard label set

| Name | Kind | Color | Description |
| --- | --- | --- | --- |
| `bug` | type | `d73a4a` | Something isn't working |
| `enhancement` | type | `a2eeef` | New feature or request |
| `documentation` | type | `0075ca` | Improvements or additions to documentation |
| `refactor` | type | `2f6dc8` | Code change that keeps behavior the same |
| `security` | type | `d93f0b` | Security weakness or hardening |
| `ready` | state | `0e8a16` | Verified unblocked, scope understood - safe to pick up |
| `blocked` | state | `b60205` | Named prerequisite missing; the issue or its document names it |
| `partial` | state | `fbca04` | Some phases shipped; the issue or its document names what remains |
| `needs-decision` | state | `5319e7` | Needs a product or architecture call before work starts |

GitHub's other default labels (`duplicate`, `good first issue`, `help wanted`, `invalid`, `question`,
`wontfix`) are not part of the set. Neither are labels a bot creates, such as Dependabot's
`dependencies` or Renovate's `major-upgrade`. They stay as their owners create them.

## Who applies which label

- Investigate files an issue only when the owner asks for one. It gives that issue one type label
  and the state label its verdict names:

  | Verdict | State label |
  | --- | --- |
  | act now | `ready` |
  | track, with a missing prerequisite named in the findings document | `blocked` |
  | track, waiting on an owner, product or architecture call | `needs-decision` |
  | reject, filed only because the owner asked | none |

- Spec gives an issue it files under acceptance or request one type label and no state label. The
  feature document carries the state.
- Triage owns every state change after filing. A state label it applies is a triage verdict and
  follows `references/triage.md`, including its confined-controller proof. Triage's neutral
  `create-request` issues carry no labels.

Before filing, show the owner the labels together with the title and body. When a needed label does
not exist in the repository, file nothing and point to the labels helper's plan below.

## Repository names

A repository may keep its own name for a standard label through `label_map` in
`.vh-adlc/triage.yaml` (see `references/triage-settings.md`). Every operation then applies the mapped
name, and the labels helper treats the mapped label as the standard one, including its color and
description. A mapping onto any existing label, even one a bot created, makes that label managed.

## Bringing a repository to the set

The labels helper under `scripts/labels/` compares a repository with the set and, after the owner
approves its exact label plan, creates the missing labels and corrects colors and descriptions. It
never deletes or renames a label, and it leaves every label outside the set alone unless `label_map`
names it. It needs Bun and an authenticated GitHub CLI.

```sh
bun "$plugin_dir/scripts/labels/cli.ts" plan --repo "$checkout" --output "$report_dir/labels-plan.json"
```

`plan` reads only. It writes the label plan to a new file and prints its digest, each standard label
as present, missing or different, the labels it leaves unmanaged, and every write with its before and
after values. The plan records the host, repository, authenticated account, a hash of the vocabulary,
the effective names after `label_map` and the labels it read.

Show the owner every write and the digest. Only after the owner approves that exact digest:

```sh
bun "$plugin_dir/scripts/labels/cli.ts" apply --repo "$checkout" \
  --plan "$report_dir/labels-plan.json" --approved-digest APPROVED_SHA256
```

`apply` observes the repository again and refuses before any write unless the result is
byte-identical to the approved plan, so a different account, repository, vocabulary, `label_map` or
label means planning again. It then makes exactly the planned writes and prints a receipt; a failed
write stops the rest and the receipt names what remains.
