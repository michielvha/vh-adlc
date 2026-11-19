---
name: vh-adlc-docs-truth
description: Verify factual claims in a bounded batch of documentation or agent instructions against source. Use on explicit request for rolling claim review, a targeted sweep or recorded verification freshness.
---

# vh-adlc-docs-truth

Read [the docs truth procedure](../../references/docs-truth.md) for input validation,
batch selection, evidence, and reporting. Resolve the plugin from this skill's installed
directory. Generic vh-adlc requests first use [lifecycle intake](../../references/lifecycle.md).

Input is a Git checkout, mode and optional claim scope. Use the repository's committed
`.vh-adlc/docs-truth.md` for its selection policy and source checks. Return findings in the
session. The shared operation leaves fixes, ledger updates and delivery to independently
authorized project procedures.
