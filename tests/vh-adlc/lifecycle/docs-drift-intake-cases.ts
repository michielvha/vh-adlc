// Expected cases for an actual installed-model trial. These declarations are not model execution evidence.
export const docsDriftIntakeCases = [
  { id: "corpus", prompt: "Scan all documentation for accumulated drift. Report only.", configured: true, operation: "docs-drift", mode: "audit" },
  { id: "unconfigured", prompt: "Use docs-drift audit here. There are no docs-drift settings.", configured: false, operation: "docs-drift", mode: "setup" },
  { id: "proposals", prompt: "Recheck and consolidate these stale docs-audit PRs, #11 and #12. Prepare a proposal only.", configured: true, operation: "docs-drift", mode: "resolve" },
  { id: "post-merge", prompt: "Finish closing the audit proposals consolidated in merged PR #13, with a fresh report before any writes.", configured: true, operation: "docs-drift", mode: "post-merge" },
  { id: "ambiguous", prompt: "Audit the docs.", configured: true, operation: "clarify", mode: "scope-question" },
  { id: "ambiguous-unconfigured", prompt: "Audit.", configured: false, operation: "clarify", mode: "scope-question" },
  { id: "selected-change", prompt: "Which docs does this patch affect?", configured: true, operation: "docs-impact", mode: "report" },
  { id: "plain-edit", prompt: "Fix this README spelling error.", configured: true, operation: "artifact-edit", mode: "edit" },
  { id: "persistent-code", prompt: "Reverify our persistent code audit findings ledger.", configured: true, operation: "audit", mode: "reverify" },
  { id: "truth", prompt: "Verify every documentation claim exhaustively using our local docs-truth workflow.", configured: true, operation: "local-truth", mode: "selected-local-workflow" },
] as const;
