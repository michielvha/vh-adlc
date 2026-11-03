# Audit repair record

One compatible owner-selected workstream is one branch and one record. Keep the common Definition,
Evidence, Reviews and State sections. Use the consumer's maintenance/task location, otherwise
`docs/internal/maintenance/audit-<workstream>-<run-id>.md`. This ordinary audit record stays on its
source branch; it does not inherit the external paired dependency-record variant.

Use `scripts/audit/batch.ts`'s `renderRecord` to write the checked JSON Definition inside Markdown.
Consumers with internal-document conventions may pass `{description,covers}` as the second
argument. The renderer emits that metadata as YAML frontmatter before the record. Use actual
consumer code/config coverage globs. Create its stable title/frontmatter scaffold and regenerate
required tracked documentation indexes before freezing `source_target`; declare those index paths
in affected paths and verification inputs. The final record/ledger phase cannot change an index.
If a generator requires a new tracked delta after freezing, re-freeze and rerun checks/review;
never relax the source-equivalence allowlist or hand-edit generated indexes. This profile does not
support a separate tracked index whose bytes depend on the final ledger's status/content; it cannot
be changed in the post-freeze metadata phase. Keep that proposal private until an accepted design
supports its independently verified generation.
Replace every field with observed values. Its schema is:

```json
{
  "schema_version": 1,
  "repository": "example/project",
  "hostname": "github.com",
  "default_branch": "main",
  "run_id": "selected-run",
  "workstream": "A",
  "scope_baseline": "<fetched default ancestor>",
  "task_base": "<starting commit, including an explicitly included ledger report if any>",
  "source_target": "<real frozen source/test/config commit>",
  "ledger_path": "docs/audit.md",
  "record_path": "docs/internal/maintenance/audit-A-selected-run.md",
  "affected_paths": ["src/affected.ts", "docs/audit.md", "docs/internal/maintenance/audit-A-selected-run.md"],
  "verification_inputs": ["src/affected.ts", "tests/affected.test.ts", "relevant-manifest-or-config"],
  "members": [{
    "id": "AUD-001",
    "disposition": "authored-repair",
    "contract": "Exact pre-existing intended behavior and its authoritative source",
    "eligibility": "restoration",
    "required_checks": ["regression", "consumer-full-gate"],
    "pre_fix": "<actual failing target>",
    "repair_commit": "<actual repair target>"
  }],
  "carried": null
}
```

The Definition also records the requested outcome, scope/coupling, proposed repair, concrete pass
conditions and owner-decision boundaries in prose. Cite the actual existing contract for each
member. New public behavior, intentional permission/data boundary changes, format/migration or
delivery policy need the feature/owner route. A documented restoration can use bounded repair.
Do not omit unresolved original members, silently replace IDs or select another workstream.

An `assessment-only` member has no invented pre_fix/repair_commit or failing regression. It needs
its actual current scenario/source/check/challenge evidence and an explanation of why no repair
exists. UNKNOWN/PARTIAL, missing required access or a sibling residual blocks whole-batch completion
until the owner resolves/reselects scope. An all-assessment selection produces no empty repair PR.

For a carried report, replace null with commit, paths, full ids, report_snapshot_digest and a private
evidence_artifact `{path, sha256}`. That artifact contains the original snapshot, assessment document
and checked candidate. The current selection must explicitly include that known report/ledger commit
and every ID it would publish. Scope baseline remains its fetched default parent; Task base is the
ledger commit. A fix selection alone never grants publication of that separate report. Reconcile if
default source, ledger or policy advanced. The full publication diff starts at Scope baseline.

## Evidence

Retain one actual evidence section per selected/coupled member, including disposition, original
scenario, current symbols/files, cited contract, real red target/argv/exit/artifact for authored
repairs, repair target, final-target check argv/results/artifacts, residuals and independent challenge.
Required checks bind each member at the final review head; a sibling's pass does not substitute.
Keep verification-input hashes, ledger/settings/procedure bindings and every historical target honest.
Do not relabel an old red or a carried observation as an execution on a newer commit.

## Reviews

Dispatch `references/audit-review.md` independently at the exact final source/ledger/record commit.
Retain the real MODEL header, model/isolation/target and returned records verbatim. A clean final
review can also supply a member's adversarial challenge only if it independently and explicitly
addresses that member's original failure/applicability, not merely the record's wording.

Freeze source/test/config first and record its real `source_target`. The later ledger/record-only
commit names it as Verified source; never insert a placeholder or try to make the ledger name its
own future commit. The reviewer compares actual Git objects: only the declared ledger/record metadata
may differ after source_target, while checks actually execute against the final review head.

## State

Start `review pending`. A local candidate with proposed FIXED/MOOT remains provisional until all
required gates and current independent review pass. Appending Evidence/Reviews/State without
rewriting them or the Definition can preserve freshness. Any ledger status/index/content, source,
test/config, selection or Definition change stales review and requires renewed checks/review.
Completion does not itself grant publication. Keep merge outcome in the external private journal,
with optional deduplicated tracking-issue update only under existing issue-write authority; never
push a new default-branch commit just to record the squash SHA.

## Checked provisional bundle

`batch-check` requires `provisional: {snapshot, document, candidate}` in addition to the final-head
snapshot/assessments and actual independent review. Retain the exact snapshot and assessment used
at frozen `source_target` to create `candidate --provisional true`; never reconstruct a proof from
a later ledger. The frozen ledger must still equal the selected Task-base ledger, including only
an explicitly included checked carried report. The final committed ledger must equal that candidate's
bytes. Final verdicts, dispositions, reasons, residuals and scenario/source evidence must match;
final checks and independent challenge/review artifacts bind the later actual review target.


## Follow-up after published CI fails

A consumer-authorized non-forced follow-up keeps the same selected batch only while its Scope
baseline is still the freshly observed default. Preserve prior evidence and review artifacts. On
the owned repair branch, make a follow-up source/test commit that also restores the ledger to the
exact Task-base blob. Freeze that commit as the new `source_target`, then regenerate the provisional
candidate from that frozen checkout. Commit the new candidate ledger and updated record, run the
required final-target checks and obtain a fresh independent review before another push. Update
member repair commits and actual evidence bindings; retain the original failing regression evidence.
Do not freeze a source commit that still carries the previous provisional ledger: the Task-base
check and duplicate run-note guard reject it. Declared generated indexes change before freezing.

If default advances after publication, stop for the owner's choice of a separately approved
rebase/force-push or a new batch from current default. Do not silently merge default into the
published repair branch or borrow the earlier review. A new batch resolves scope and pending
resources again, retains the old outcomes/history and needs fresh proof. This procedure grants
neither a rewrite nor publication; the consumer and current owner request govern both.

## Bound resource journal

Every `batch-check` bundle also requires `journal: {directory, batch_digest}`, including batches
that never create live resources. All snapshots in the batch, including provisional and final-head,
must retain the same original private artifact root. Create the run under that root as
`audit-run-<run_id>`. Compute its digest using `batchJournalDigest(definition)`: it binds repository,
hostname, run ID, workstream, actual default branch, Scope baseline, Task base, sorted member IDs
and the included carried report's commit/sorted IDs (or null). A different selected scope needs a
new run. Source and review updates keep this scope digest; their freshness checks still apply.
The run header is durably registered before live work in private common-Git-directory metadata;
a duplicate run ID in another root is refused. The helper reads the current policy-bound journal
and all registered runs, refusing completion while any key/row cleanup is pending, including a
denied or ambiguous handoff from an earlier selected scope. Missing registered state is unknown. An empty journal records that no resources
were registered; it supplies no authority or independent execution proof.


Committed provisional and carried reconstruction re-derives comparison status, baseline reachability
and its standard reason from actual source Git objects. The next Scope baseline must also be a
hex commit reachable from that assessed source. Rehashing edited snapshot JSON does not validate
invented history, arbitrary reason text or an invalid next baseline. Missing reachable comparison
history remains an unscoped reassessment requirement.
