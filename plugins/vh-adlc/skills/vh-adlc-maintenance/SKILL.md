---
name: vh-adlc-maintenance
description: Sweep dependency and security maintenance, assess bot PRs and alerts, find and remove stale merged branches, save a report, or resume its selected work. Keep project topology and delivery rules local; authored compatible repairs use bounded maintenance. Generic vh-adlc requests use lifecycle intake.
---

# vh-adlc-maintenance

For generic vh-adlc requests, follow `references/lifecycle.md` once, then continue here.
The plugin directory is two levels above this skill's own directory. Resolve packaged references
and helpers from there, independently of the consumer checkout.

For supplied-packet `report-stage`, read that section of `references/maintenance.md` first.
Use the trusted operator's verified knowledge/runtime receipts and supplied pages when command tools
are unavailable; missing inputs remain blockers. Normal runs follow these steps.

1. Follow `references/loop.md` to obtain the verified binary and run `vh-adlc knowledge` with
   `conventions/feature-documents.md`, `conventions/coding.md`, `conventions/documentation.md`,
   `conventions/delivery.md` and `guides/humanize-prose.md`, plus applicable language pages.
   Read the resolved pages and repository instructions; report the knowledge line.
2. Read `references/maintenance.md`, `references/maintenance-settings.md` and
   `references/authority.md`. Read the configured local project procedure before deciding work.
3. Before a new run's collection, follow `references/security-settings.md` for each repository in
   scope: run `security-settings-mode`, then the helper in that mode with the run ID and binding.
   Among maintenance runs only a full sweep with `authorized_sweep` true may apply, onboarding
   applies as committed settings decide, and a PR scope checks. A nonzero mode exit means `check`
   with `committed-settings-unresolved` and the cause, never `apply`. `no_filesystem` selects `check`
   without the command, keeps output in chat and saves no JSON. Otherwise save each JSON in the
   run's private journal directory; pass the files with `--security-settings` to `collect` and
   `report`, and each `apply` repository with `--applied-repository` to `collect`. A helper failure
   or exit 1 never blocks collection. A continuation reuses the saved files. For an
   `alerts-enabled-this-run` surface, add a `coverage_handoffs` row: the repository, surface
   `dependabot`, handoff `reference` the run ID, `owner` null, `assignment_handoff` the next
   maintenance sweep, `next_action` collect the surface again.
4. Follow the canonical procedure for a sweep, supplied-packet `report-stage`, selected repair or
   continuation. A normal sweep reports first and asks for selection. Existing explicit selection
   or preauthorization remains valid within its unchanged scope. Current restrictions win.
   For dependency advisories, prefer a sufficient supported upstream version bump over custom source
   changes. Use an existing bot update when suitable; record evidence before choosing another repair.
5. For an authored repair, use `references/maintenance-record.md` and
   `references/maintenance-review.md` with the lifecycle's bounded-maintenance procedure.
   Wider behavior, permission or delivery-policy changes use the feature loop.
6. Follow the security accounting contract in `references/maintenance.md`. Preserve every observed
   occurrence and coverage gap, reconcile through `security-reconcile`, and carry its typed result into
   the report. Complete accounting requires a verified outcome or a concrete tracked follow-up.
   A reconciled sweep can still have open remediation, exceptions, incomplete coverage or pending delivery.
   Treat packet receipts as procedural evidence; they grant no selection, dismissal or publication.
   A read-tools host needs the trusted operator's verified typed result for reconciliation; without
   it, keep its analysis and security accounting visibly pending.
7. Check stale branches in every sweep with `references/branches.md`. First run `auto-delete` and
   offer to enable GitHub's automatic merged-branch deletion where it is off. Then plan, report the plan and its
   digest, and apply it once selected, or right away when the request already asked for removal.
   After any merge this run performs, run `after-merge` for that PR.

Use available host capabilities; serial analysis is supported. Do not depend on commands, hooks,
subagents, question tools or a particular model. An unavailable collector requires a verified supplied
packet or a collection blocker. A missing independent reviewer leaves a self-contained handoff and
`review pending`; never invent a reviewer or start another CLI as an automatic fallback.
A supplied synthetic packet supports bounded analysis only. Record actual native model/tool identity
and distinguish a saved report, local commit, remote publication and observed delivery outcomes.
