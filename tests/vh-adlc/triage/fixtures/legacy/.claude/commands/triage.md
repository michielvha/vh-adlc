---
description: Triage the open GitHub issue backlog — verify what's actually done, what's blocked, and rank what to tackle next
model: fable
---

Run the **Issue Triage Agent**. Read `agents/issue-triage.md` and follow it exactly.

Issues are the source of truth for what the platform still needs, so the point of this run is to
make the backlog trustworthy again: nothing open that is already shipped, nothing ranked that is
actually blocked, and a defensible answer to "what next".

Default flow - **analyze first, then ask**:
1. Inventory every open issue with its metadata, the owner's own status comments (highest-signal
   field in this repo), and the merged PRs referencing it - remembering that `ship` lands
   `Refs #N` for partial work and `Closes #N` only for full resolution, so a merged reference is
   not a resolution. Exclude the bot-owned and other-agent-owned issues (#332 Renovate dashboard,
   #334 dependency backlog, anything from renovate/dependabot/release-bot).
2. Build the plan-doc spine: every `docs/internal/**` doc with `issue:` frontmatter, plus its
   `status`, `status_description`, and `priority`. This is the roadmap and it drives both closure
   detection and ranking.
3. **Verify each issue against the code at HEAD** (parallel subagents), returning a tiered verdict
   - `resolved` / `partial` / `open` / `blocked` / `obsolete` / `duplicate` - each backed by
   file:line, a merged PR, a passing test, or a named empty search. Adversarially re-check every
   `resolved` claim yourself before accepting it; never cite a `distribution/**` mirror path.
4. Classify, apply obviously-missing type labels, and propose the thin triage-state label
   vocabulary (`ready`/`blocked`/`partial`/`needs-decision`) for approval.
5. Rank what to tackle next from the plan docs: `Public Go Live` milestone first, then plan
   `priority:`, then dependency order (blockers before dependents), then plan readiness, then
   narrow partial slices.
6. **Save a dated report** to `docs/internal/status/YYYY-MM-DD-issue-triage.md`, **present the
   overview**, and **ask** what to execute.
7. Only after they choose: post triage comments, apply labels, close the explicitly approved
   issues (evidence comment first), and sync the affected plan docs' `status` frontmatter.

Honor the hard rules in the playbook: **never close an issue without asking**, evidence or
silence, no self-credit in comments, never rewrite an issue body, `[skip ci]` on the
`docs/internal/**` commits.

Arguments (optional): $ARGUMENTS - `next` (ranked shortlist only), `close` (close candidates
only), `stale` (>90 days untouched), or one or more issue numbers to deep-verify.
