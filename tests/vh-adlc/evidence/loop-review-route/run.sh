#!/bin/bash
# T34: one real read-only spec review and one shell implementation review through the Codex command
# route, on a disposable feature, using the candidate plugin's scripts/loop/cli.ts.
set -euo pipefail
export PATH=$HOME/.bun/bin:$PATH
PLUGIN=/home/m/code/vh-adlc-shared-development-loop/plugins/vh-adlc
OUT=/tmp/sdd-diff/t34/out; rm -rf "$OUT"; mkdir -p "$OUT"
R=$(mktemp -d /tmp/vh-t34-feature.XXXX); cd "$R"
git init -q -b main; git config user.name t; git config user.email t@example.invalid
mkdir -p docs/specs .vh-adlc
cat > AGENTS.md <<'A'
# Repository instructions

Feature documents: docs/specs/

Local commands: `bun test`.
A
cat > math.ts <<'A'
export function add(a: number, b: number): number { return a + b; }
A
cat > math.test.ts <<'A'
import { expect, test } from "bun:test";
import { add } from "./math";
test("add returns the sum", () => { expect(add(2, 3)).toBe(5); });
A
cat > .vh-adlc/loop.yaml <<'A'
schema_version: 1
instruction_files: [AGENTS.md]
roles:
  spec_reviewer:
    route: command
    model: gpt-6.1-sol
    model_attestation: codex-session
    argv: [/usr/bin/codex, exec, --json, --skip-git-repo-check, -s, read-only, -m, "{model}", "{prompt}"]
  implementation_reviewer:
    route: command
    model: gpt-6.1-sol
    model_attestation: codex-session
    argv: [/usr/bin/codex, exec, --json, -s, workspace-write, -m, "{model}", "{prompt}"]
A
cat > docs/specs/add.md <<'A'
---
status: in-progress
status_description: "Disposable feature for the shared loop's real-route proof."
issue: null
branch: main
goal: "add returns the sum of two numbers."
covers:
  - math.ts
  - math.test.ts
---

# Plan: Add two numbers

## Context

### Owner summary

A disposable feature used only to exercise the review route: `add(a, b)` in `math.ts` returns `a + b`,
proved by `math.test.ts`. Nothing ships.

### Background

`math.ts:1` defines `add`; `math.test.ts:3` asserts `add(2, 3)` is 5.

## Scope

`add` in `math.ts` and its test. Out of scope: everything else.

## Design

`add(a: number, b: number): number` returns `a + b` (`math.ts:1`).

## Acceptance Criteria

- [ ] AC-01: `add(2, 3)` returns 5.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test` passes `math.test.ts`, which asserts `add(2, 3)` is 5. |

## Tasks

- [x] T1 `math.ts` - `add` returns the sum; `bun test` passes (AC-01)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
A
git add -A; git commit -q -m "disposable feature"; X=$(git rev-parse HEAD)
echo "repo $R commit $X" | tee "$OUT/target.txt"
for kind in spec implementation; do
  set +e
  bun "$PLUGIN/scripts/loop/cli.ts" review --repo "$R" --document docs/specs/add.md --commit "$X" --kind $kind \
    --docs-revision d8f07c9dd69038375a535af8ad586086688f85ab --binary /home/m/.cache/vh-adlc/bin/0.9.0/linux_amd64/vh-adlc \
    --plugin-pin c70769ebf43ea03a4bdffb3cda51954eb05b35a7 --timeout-ms 1500000 > "$OUT/$kind.json" 2> "$OUT/$kind.err"
  echo "$kind exit $?"
  set -e
done
git -C "$R" status --short > "$OUT/status-after.txt"; echo "status after: $(wc -l < "$OUT/status-after.txt") lines"
