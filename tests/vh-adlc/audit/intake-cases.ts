// Expected routing for actual model trials. Static package tests do not pretend to execute an agent.
export const intakeCases = [
  { id: "explicit-unconfigured", prompt: "Use vh-adlc-audit status; this repository has no audit settings.", configured: false, operation: "audit", outcome: "onboarding", mode: "status" },
  { id: "explicit-reverify", prompt: "Reverify the persistent codebase audit findings ledger.", configured: true, operation: "audit", outcome: "private-proposal", mode: "reverify" },
  { id: "explicit-full", prompt: "Run a full persistent source audit of the configured areas and append new findings as a private proposal.", configured: true, operation: "audit", outcome: "private-proposal", mode: "full" },
  { id: "explicit-fix", prompt: "Fix the existing audit finding AUD-001 only.", configured: true, operation: "audit", outcome: "selected-fix", mode: "fix" },
  { id: "dependency-security", prompt: "Sweep bot dependency PRs and security advisory alerts.", configured: true, operation: "maintenance", outcome: "report-first", mode: null },
  { id: "one-off-diagnosis", prompt: "Investigate why the login endpoint returns 500. Report only.", configured: true, operation: "investigate", outcome: "report-only", mode: null },
  { id: "backlog", prompt: "Triage our open issues and rank the next ready backlog work.", configured: true, operation: "triage", outcome: "report-first", mode: null },
  { id: "ambiguous-security", prompt: "Audit security.", configured: true, operation: "clarify", outcome: "scope-question", mode: null },
  { id: "ambiguous-source", prompt: "Audit the code for security issues.", configured: false, operation: "clarify", outcome: "scope-question", mode: null },
] as const;
