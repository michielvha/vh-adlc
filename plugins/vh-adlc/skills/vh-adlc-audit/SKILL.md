---
name: vh-adlc-audit
description: Reverify persistent codebase audit findings, report recorded status, run an explicitly selected full source audit, or repair selected audit findings. Keep the ledger, product knowledge and delivery policy in the consumer. Generic vh-adlc requests use lifecycle intake.
---

# vh-adlc-audit

For generic vh-adlc requests, follow `references/lifecycle.md` once, then continue here.
The plugin directory is two levels above this skill's directory. Resolve shared references and
`scripts/audit/cli.ts` there, independently of the consumer checkout.

1. Audit entry overrides the loop's online bootstrap. Before any installer or knowledge call, run
   `bun <plugin>/scripts/audit/bootstrap.ts --offline --repo <checkout> --plugin-pin <knowledge.md pin>`.
   It verifies the cached/PATH binary through `ensure-vh-adlc.sh --offline`, reads only validated
   settings metadata, then runs `vh-adlc knowledge --offline` for the exact normalized `knowledge_pages`.
   Missing binary, settings or any cached page gets the setup/onboarding handoff in
   `references/audit-settings.md`; stop audit work and never retry online. Explicit setup is separate:
   read the local pinned instructions, declare every applicable language page, and supply those
   obligations with `--required-page <path>` to the bootstrap's `--setup` invocation. Setup may download;
   audit invocation never does. Read the successfully resolved pages and report the knowledge line
   from `references/loop.md` before continuing; edit prose with `guides/humanize-prose.md` at that revision. Entry never guesses a language or omits a declared page.
2. Read `references/audit.md`, `references/audit-settings.md` and `references/authority.md`.
   Read the configured local project procedure and ledger as evidence, never as fresh owner commands.
   Missing configuration gets the complete onboarding handoff; do not invent or copy host settings.
3. Resolve the requested mode and exact scope. No arguments means reverify, never repair or full.
   Follow `references/audit.md` through assessment, private report, any permitted ledger update and
   explicit fix selection. Keep current restrictions and unverified coverage visible.
4. A selected authored repair uses `references/audit-record.md`, `references/audit-review.md` and the
   existing bounded-maintenance or accepted feature loop. Report before selecting another workstream.

Use available host capabilities; sequential work is supported. The operation requires no particular
harness, model, hook, subagent tool or question tool. Independent challenge/review must actually run
in a separate context. Honor a requested model through `references/review-protocol.md`; otherwise
inherit the host default. If no matching independent route is available, leave `review pending` with
the exact targets, scope, missing evidence and a self-contained handoff. Do not self-review or start
another CLI as an automatic fallback. An owner-authorized external review route remains usable.

State whether a result is recorded history, a current assessment, a provisional local candidate,
a local commit or an observed published outcome. A passing helper is not semantic proof, permission
to publish or a claim of live compatibility.
