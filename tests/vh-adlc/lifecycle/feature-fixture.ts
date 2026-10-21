import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SHOUT_CRITERION = "Running bash greet.sh --shout prints HELLO, WORLD. and running it without arguments still prints Hello, world.";
type Git = (cwd: string, ...args: string[]) => string;

// Seeded review/acceptance are fixture state, never evidence for the real feature.
export function seedClaimedFeature(project: string, git: Git) {
  const path = "docs/specs/shout.md";
  mkdirSync(join(project, "docs/specs"), { recursive: true });
  const draft = `---
status: draft
status_description: "Specified for the shout fixture."
issue: null
goal: "Add an explicit shout option while preserving the default greeting."
covers:
  - greet.sh
  - test.sh
---

# Plan: Shout option

## Context

greet.sh:2 prints Hello, world. for every invocation. The owner requested an explicit shout option.

## Scope

Add --shout and preserve the no-argument greeting. No other options, interfaces, permissions or release changes.

## Design

greet.sh selects the uppercase greeting only for --shout. Its existing printf output keeps one newline.
test.sh verifies the two documented invocations, preserving its tag check.

## Acceptance Criteria

- [ ] AC-01: ${SHOUT_CRITERION}

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Observe bash test.sh fail for the new shout assertion before implementation, then pass for default and shout output; independently run both invocations. |

## Tasks

- [ ] T1 \`test.sh\`, \`greet.sh\` - add the shout/default regression check, observe the new assertion fail, implement --shout and observe bash test.sh pass (AC-01).

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
`;
  writeFileSync(join(project, path), draft);
  git(project, "add", path);
  git(project, "commit", "-qm", "fixture: seed the reviewed feature definition", "--", path);
  const target = git(project, "rev-parse", "HEAD");
  const reviewed = draft.replace("status: draft", "status: planned")
    + `| 2026-10-21 | R-1 | spec | \x60${target}\x60 | unknown | procedural | NO FINDINGS |\n`
    + `| 2026-10-21 | R-1 | spec | \x60${target}\x60 | n/a | n/a | accepted by owner |\n\n### R-1\n\nNO FINDINGS\n`;
  writeFileSync(join(project, path), reviewed);
  git(project, "add", path);
  git(project, "commit", "-qm", "fixture: record accepted feature scope", "--", path);
  writeFileSync(join(project, path), reviewed.replace("status: planned", "status: in-progress").replace("issue: null", "issue: null\nbranch: feat/shout"));
  git(project, "add", path);
  git(project, "commit", "-qm", "fixture: publish the implementation claim", "--", path);
  git(project, "push", "-q", "origin", "main");
  git(project, "switch", "-qc", "feat/shout");
}
