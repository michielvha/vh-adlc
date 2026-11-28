# Keep a finding's side points: replay results

Counts and run identities only, for [the feature document](../../../../docs/specs/reviewer-side-points.md). The
harness section below was written by `tests/vh-adlc/replay/run.ts` on a copy of the enterprise case directory,
with `--only first-passes --routes-under-test host`. In it, "new" is the brief under test: plugin `b04b70ac`
(`ef685da1` plus the side-point sentence) with docs `0fa68d68`. "old" is plugin `0c9fee77` with docs
`30c38c8d`, reused from the stored old-brief passes. The private-terms check passed on this file.

## Outcome, 2026-11-27

| Criterion | Host route | Command route |
| --- | --- | --- |
| AC-02 | Not met: L-08 at its minimum in 0 of the first 6 and 0 of all 12 counted passes | Not run |
| AC-03 | Met on this route: none of the 22 host pairs among the 59 fails retention | Not run |
| AC-04 | Met on this route: 5.33 blocking findings per counted pass, bound 6.85 for 12 passes | Not run |

Should-fix findings per counted pass: 19.00 under the brief under test, against 16.25 under the replayed new
brief. AC-02 needs both labels, so the host result decides it. The command route was not run: the workstream
orchestrator decided this on 2026-11-27 under the owner's delegation (ledger
[#179](https://github.com/michielvha/vh-adlc/issues/179)). Its result could not change the outcome.

Count-only cross-check of the stored records: no counted pass under the brief under test mentions the L-08
defect in any wording, while the design section it belongs to draws findings in 12 of 12 passes.

## Case: enterprise

Labels approved: 2026-11-22T20:27:08Z. Terms check: pass.

Briefs: old plugin `0c9fee774481` with docs `30c38c8dc684`; new plugin `b04b70ac8ff2` with docs `0fa68d68db3e`.

### First passes, host route

| Brief | Route | Run | Plugin | Docs | Model | Status | Labels raised |
| --- | --- | --- | --- | --- | --- | --- | --- |
| old | host | 1 | `0c9fee774481` | `30c38c8dc684` | claude-opus-5-5 | counted | L-03:blocking, L-30:blocking, L-42:blocking, L-06:should-fix, L-31:should-fix, L-11:should-fix, L-14:should-fix, L-12:should-fix, L-15:should-fix, L-17:should-fix, L-22:should-fix, L-23:should-fix, L-41:should-fix, L-26:should-fix, L-19:should-fix, L-35:should-fix, L-08:should-fix, L-02:should-fix, L-24:should-fix, L-40:should-fix, L-18:should-fix, L-32:should-fix, L-10:should-fix, L-37:should-fix, L-49:nit, L-27:nit |
| old | host | 2 | `0c9fee774481` | `30c38c8dc684` | claude-opus-5-5 | counted | L-03:blocking, L-30:blocking, L-46:blocking, L-18:blocking, L-06:blocking, L-37:blocking, L-14:should-fix, L-17:should-fix, L-19:should-fix, L-21:should-fix, L-22:should-fix, L-31:should-fix, L-24:should-fix, L-27:should-fix, L-26:should-fix, L-23:should-fix, L-11:should-fix, L-32:should-fix, L-40:should-fix, L-49:nit |
| old | host | 3 | `0c9fee774481` | `30c38c8dc684` | claude-opus-5-5 | counted | L-03:blocking, L-39:blocking, L-40:should-fix, L-30:blocking, L-07:should-fix, L-09:should-fix, L-14:should-fix, L-15:should-fix, L-12:should-fix, L-11:should-fix, L-18:should-fix, L-19:should-fix, L-21:should-fix, L-20:should-fix, L-22:should-fix, L-06:should-fix, L-26:should-fix, L-25:should-fix, L-31:should-fix, L-41:should-fix, L-23:should-fix, L-17:should-fix, L-34:should-fix, L-37:should-fix, L-08:should-fix, L-35:should-fix, L-01:nit, L-49:nit, L-27:nit |
| new | host | 1 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-01:blocking, L-39:blocking, L-41:blocking, L-25:blocking, L-22:blocking, L-30:blocking, L-46:blocking, L-14:should-fix, L-11:should-fix, L-12:should-fix, L-17:should-fix, L-07:should-fix, L-31:should-fix, L-37:should-fix, L-23:should-fix, L-19:should-fix, L-49:nit, L-27:nit |
| new | host | 2 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-25:blocking, L-22:blocking, L-14:blocking, L-11:blocking, L-30:blocking, L-07:should-fix, L-01:should-fix, L-40:should-fix, L-04:should-fix, L-05:should-fix, L-19:should-fix, L-21:should-fix, L-23:should-fix, L-10:should-fix, L-17:should-fix, L-26:should-fix, L-31:should-fix, L-06:should-fix, L-27:should-fix, L-24:should-fix |
| new | host | 3 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-25:blocking, L-09:blocking, L-03:blocking, L-02:blocking, L-30:blocking, L-46:blocking, L-22:blocking, L-14:should-fix, L-11:should-fix, L-16:should-fix, L-15:should-fix, L-12:should-fix, L-20:should-fix, L-23:should-fix, L-40:should-fix, L-07:should-fix, L-31:should-fix, L-19:should-fix, L-21:should-fix, L-43:should-fix, L-17:should-fix, L-06:should-fix, L-26:should-fix, L-01:should-fix, L-33:should-fix, L-34:should-fix, L-27:should-fix, L-37:should-fix, L-49:nit |
| new | host | 4 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-25:blocking, L-22:blocking, L-30:blocking, L-04:should-fix, L-40:should-fix, L-01:should-fix, L-14:should-fix, L-47:should-fix, L-15:should-fix, L-17:should-fix, L-11:should-fix, L-07:should-fix, L-06:should-fix, L-26:should-fix, L-35:should-fix, L-31:should-fix, L-20:should-fix, L-21:should-fix, L-23:should-fix, L-19:should-fix, L-46:should-fix, L-49:nit, L-27:nit, L-37:nit |
| new | host | 5 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-24:blocking, L-25:blocking, L-22:blocking, L-30:blocking, L-18:blocking, L-46:should-fix, L-11:should-fix, L-14:should-fix, L-43:should-fix, L-17:should-fix, L-07:should-fix, L-23:should-fix, L-19:should-fix, L-21:should-fix, L-31:should-fix, L-26:should-fix, L-06:should-fix, L-37:should-fix, L-40:should-fix, L-34:should-fix, L-49:nit, L-27:nit |
| new | host | 6 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-22:blocking, L-18:blocking, L-30:blocking, L-46:blocking, L-14:should-fix, L-11:should-fix, L-15:should-fix, L-16:should-fix, L-19:should-fix, L-12:should-fix, L-21:should-fix, L-17:should-fix, L-31:should-fix, L-40:should-fix, L-07:should-fix, L-23:should-fix, L-06:should-fix, L-01:should-fix, L-41:should-fix, L-35:should-fix, L-26:should-fix, L-27:should-fix, L-37:should-fix, L-49:nit, L-02:nit |
| new | host | 7 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-02:blocking, L-42:blocking, L-37:blocking, L-30:blocking, L-46:blocking, L-22:blocking, L-01:should-fix, L-11:should-fix, L-16:should-fix, L-14:should-fix, L-12:should-fix, L-17:should-fix, L-31:should-fix, L-41:should-fix, L-23:should-fix, L-40:should-fix, L-06:should-fix, L-19:should-fix, L-21:should-fix, L-26:should-fix, L-35:should-fix, L-27:should-fix, L-34:should-fix, L-49:nit |
| new | host | 8 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-22:blocking, L-18:blocking, L-46:should-fix, L-14:should-fix, L-12:should-fix, L-19:should-fix, L-21:should-fix, L-30:should-fix, L-37:should-fix, L-11:should-fix, L-10:should-fix, L-07:should-fix, L-40:should-fix, L-02:should-fix, L-41:should-fix, L-01:should-fix, L-04:should-fix, L-06:should-fix, L-31:should-fix, L-23:should-fix, L-26:should-fix, L-49:nit, L-27:nit |
| new | host | 9 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-02:blocking, L-25:blocking, L-42:blocking, L-37:blocking, L-22:blocking, L-20:blocking, L-21:blocking, L-11:should-fix, L-14:should-fix, L-17:should-fix, L-01:should-fix, L-31:should-fix, L-06:should-fix, L-30:should-fix, L-46:should-fix, L-04:should-fix, L-40:should-fix, L-23:should-fix, L-07:should-fix, L-26:should-fix, L-19:should-fix, L-49:nit, L-27:nit |
| new | host | 10 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-25:blocking, L-31:blocking, L-01:blocking, L-42:blocking, L-06:blocking, L-37:blocking, L-49:blocking, L-30:blocking, L-46:blocking, L-14:should-fix, L-19:should-fix, L-11:should-fix, L-15:should-fix, L-17:should-fix, L-10:should-fix, L-07:should-fix, L-23:should-fix, L-22:blocking, L-40:should-fix, L-41:should-fix, L-26:should-fix, L-27:should-fix |
| new | host | 11 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-02:blocking, L-14:blocking, L-25:blocking, L-31:blocking, L-01:blocking, L-22:blocking, L-18:blocking, L-30:blocking, L-37:blocking, L-11:should-fix, L-15:should-fix, L-12:should-fix, L-19:should-fix, L-21:should-fix, L-20:should-fix, L-43:should-fix, L-17:should-fix, L-07:should-fix, L-26:should-fix, L-23:should-fix, L-06:should-fix, L-40:should-fix, L-24:should-fix, L-34:should-fix, L-38:should-fix, L-49:nit |
| new | host | 12 | `b04b70ac8ff2` | `0fa68d68db3e` | claude-opus-5-5 | counted | L-03:blocking, L-25:blocking, L-22:blocking, L-01:should-fix, L-40:should-fix, L-14:should-fix, L-15:should-fix, L-12:should-fix, L-11:should-fix, L-07:should-fix, L-23:should-fix, L-06:should-fix, L-32:should-fix, L-19:should-fix, L-21:should-fix, L-17:should-fix, L-46:should-fix, L-31:should-fix, L-37:should-fix, L-49:nit, L-27:nit |

### Retention

| Route | Label | Old at its minimum | Old at any severity | New at its minimum | New at any severity | New runs | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| host | L-01 | 0/3 | 1/3 | 3/12 | 11/12 | 12 | pass |
| host | L-02 | 0/3 | 1/3 | 4/12 | 6/12 | 12 | pass |
| host | L-03 | 3/3 | 3/3 | 12/12 | 12/12 | 12 | pass |
| host | L-04 | 0/3 | 0/3 | 4/12 | 4/12 | 12 | not raised by old |
| host | L-05 | 0/3 | 0/3 | 0/12 | 1/12 | 12 | not raised by old |
| host | L-06 | 3/3 | 3/3 | 11/12 | 11/12 | 12 | pass |
| host | L-07 | 1/3 | 1/3 | 11/12 | 11/12 | 12 | pass |
| host | L-08 | 2/3 | 2/3 | 0/12 | 0/12 | 12 | fail |
| host | L-09 | 1/3 | 1/3 | 1/12 | 1/12 | 12 | pass |
| host | L-10 | 1/3 | 1/3 | 3/12 | 3/12 | 12 | pass |
| host | L-11 | 0/3 | 3/3 | 1/12 | 12/12 | 12 | pass |
| host | L-12 | 0/3 | 2/3 | 0/12 | 7/12 | 12 | pass |
| host | L-13 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
| host | L-14 | 3/3 | 3/3 | 12/12 | 12/12 | 12 | pass |
| host | L-15 | 2/3 | 2/3 | 6/12 | 6/12 | 12 | pass |
| host | L-16 | 0/3 | 0/3 | 3/12 | 3/12 | 12 | not raised by old |
| host | L-17 | 3/3 | 3/3 | 11/12 | 11/12 | 12 | pass |
| host | L-18 | 1/3 | 3/3 | 4/12 | 4/12 | 12 | pass |
| host | L-19 | 3/3 | 3/3 | 12/12 | 12/12 | 12 | pass |
| host | L-20 | 0/3 | 1/3 | 1/12 | 4/12 | 12 | pass |
| host | L-21 | 0/3 | 2/3 | 1/12 | 10/12 | 12 | pass |
| host | L-22 | 0/3 | 3/3 | 12/12 | 12/12 | 12 | pass |
| host | L-23 | 3/3 | 3/3 | 12/12 | 12/12 | 12 | pass |
| host | L-24 | 0/3 | 2/3 | 1/12 | 3/12 | 12 | pass |
| host | L-25 | 0/3 | 1/3 | 9/12 | 9/12 | 12 | pass |
| host | L-26 | 3/3 | 3/3 | 10/12 | 10/12 | 12 | pass |
| host | L-27 | 1/3 | 3/3 | 5/12 | 11/12 | 12 | pass |
| host | L-28 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
| host | L-29 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
| host | L-30 | 3/3 | 3/3 | 11/12 | 11/12 | 12 | pass |
| host | L-31 | 3/3 | 3/3 | 12/12 | 12/12 | 12 | pass |
| host | L-32 | 2/3 | 2/3 | 1/12 | 1/12 | 12 | pass |
| host | L-33 | 0/3 | 0/3 | 1/12 | 1/12 | 12 | not raised by old |
| host | L-34 | 1/3 | 1/3 | 4/12 | 4/12 | 12 | pass |
| host | L-35 | 2/3 | 2/3 | 3/12 | 3/12 | 12 | pass |
| host | L-36 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
| host | L-37 | 3/3 | 3/3 | 11/12 | 11/12 | 12 | pass |
| host | L-38 | 0/3 | 0/3 | 1/12 | 1/12 | 12 | not raised by old |
| host | L-39 | 1/3 | 1/3 | 1/12 | 1/12 | 12 | pass |
| host | L-40 | 3/3 | 3/3 | 11/12 | 11/12 | 12 | pass |
| host | L-41 | 2/3 | 2/3 | 5/12 | 5/12 | 12 | pass |
| host | L-42 | 1/3 | 1/3 | 3/12 | 3/12 | 12 | pass |
| host | L-43 | 0/3 | 0/3 | 3/12 | 3/12 | 12 | not raised by old |
| host | L-44 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
| host | L-45 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
| host | L-46 | 1/3 | 1/3 | 10/12 | 10/12 | 12 | pass |
| host | L-47 | 0/3 | 0/3 | 1/12 | 1/12 | 12 | not raised by old |
| host | L-48 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
| host | L-49 | 3/3 | 3/3 | 11/12 | 11/12 | 12 | pass |
| host | L-50 | 0/3 | 0/3 | 0/12 | 0/12 | 12 | not raised by old |
