---
status: draft
status_description: "Fixture feature."
issue: https://github.com/example/repo/issues/7
goal: "A fixture feature with an observable outcome."
covers:
  - src/
  - config.yml
---

# Plan: Fixture

A fixture feature document.

## Context

Why the fixture exists.

## Scope

In scope: the fixture.

## Design

The design. A fenced example is not a criterion:

```markdown
- [ ] AC-99: Inside a fence.
### Q9: Inside a fence too
```

## Acceptance Criteria

- [ ] AC-01: The first end state,
      wrapped onto a second line.
- [ ] AC-02: The second end state.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `go test ./src` |
| AC-02 | A written manual procedure |

## Tasks

- [ ] T1 `src/a_test.go` - the failing test; fails because there is no code (AC-01)
- [ ] T2 `src/a.go` - the change; T1 passes (AC-01,
      AC-02)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
