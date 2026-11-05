// Acceptance consistency checks, not authorization or protection against forged owner files.
// Raw native transcripts and independent review still establish the recorded observations.
export type Target = { shared_commit: string; consumer_commit: string; convention_revision: string; payload_digest: string };
export type CandidateEvidence = Target & {
  kind: "local-source-candidate";
  corpus: { head: string; outcome: "candidates" | "none" | "incomplete"; gaps: number };
  parity: { consumer_commit: string; payload_digest: string; rebuilt_from_HEAD: boolean; lost_candidates: number; unresolved_meaning_changes: number };
  inventory: { consumer_commit: string; complete: boolean; unresolved_callers: string[] };
  rollback: { preserved_unrelated: boolean; preserved_index: boolean; refused_conflicts: boolean; refused_symlinks: boolean };
};
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function sourceCandidate(target: Target, input: unknown): string[] {
  const failures: string[] = [], evidence = record(input);
  if (!evidence) return ["candidate evidence missing or malformed"];
  for (const key of ["shared_commit", "consumer_commit", "convention_revision", "payload_digest"] as const) if (evidence[key] !== target[key]) failures.push(key + " changed");
  if (evidence.kind !== "local-source-candidate") failures.push("candidate kind differs");
  const corpus = record(evidence.corpus), parity = record(evidence.parity), inventory = record(evidence.inventory), rollback = record(evidence.rollback);
  if (!corpus || corpus.head !== target.consumer_commit || !["candidates", "none"].includes(String(corpus.outcome)) || corpus.gaps !== 0) failures.push("full cutover corpus incomplete or stale");
  if (!parity || parity.consumer_commit !== target.consumer_commit || parity.payload_digest !== target.payload_digest || parity.rebuilt_from_HEAD !== true || parity.lost_candidates !== 0 || parity.unresolved_meaning_changes !== 0) failures.push("legacy candidate parity incomplete or stale");
  if (!inventory || inventory.consumer_commit !== target.consumer_commit || inventory.complete !== true || !Array.isArray(inventory.unresolved_callers) || inventory.unresolved_callers.length) failures.push("caller inventory incomplete or stale");
  if (!rollback || ["preserved_unrelated", "preserved_index", "refused_conflicts", "refused_symlinks"].some(key => rollback[key] !== true)) failures.push("scoped rollback not verified");
  return failures;
}
export type PublishedEvidence = {
  kind: "published-marketplace";
  reviewed_payload_digest: string; published_payload_digest: string; convention_revision: string;
  convention_published: boolean; source_published: boolean; shared_ci_passed: boolean;
  hosts: Array<{ host: "codex-cli" | "claude-cli"; kind: "published-marketplace"; payload_digest: string; fresh: boolean; upgrade: boolean; discovered: boolean; standalone: boolean; preserved_inputs: boolean; preserved_index: boolean; credentials_copied: boolean }>;
  existing_operations: { triage_knowledge: boolean; maintenance_knowledge: boolean; audit_unwarmed_handoff: boolean; audit_explicit_setup: boolean; audit_warmed_offline: boolean };
  paired_review: { shared_payload_digest: string; consumer_commit: string; model: string; blocking_or_should_fix: number; fresh: boolean };
};
export function migrationReady(target: Target, candidate: unknown, input?: unknown): { ready: boolean; failures: string[]; limit: string } {
  const failures = sourceCandidate(target, candidate), published = record(input);
  if (!published) failures.push("published convention, marketplace and paired-review evidence absent");
  else {
    if (published.kind !== "published-marketplace" || published.convention_published !== true || published.source_published !== true || published.shared_ci_passed !== true || published.convention_revision !== target.convention_revision || published.reviewed_payload_digest !== target.payload_digest || published.published_payload_digest !== target.payload_digest) failures.push("published dependency or payload differs");
    const hosts: unknown[] = Array.isArray(published.hosts) ? published.hosts : [], rows = hosts.map(record);
    if (rows.length !== 2 || new Set(rows.map(host => host?.host)).size !== 2 || !["codex-cli", "claude-cli"].every(name => rows.some(host => host?.host === name))) failures.push("both native marketplace hosts required");
    if (rows.some(host => !host || host.kind !== "published-marketplace" || host.payload_digest !== target.payload_digest || ["fresh", "upgrade", "discovered", "standalone", "preserved_inputs", "preserved_index"].some(key => host[key] !== true) || host.credentials_copied !== false)) failures.push("native marketplace acceptance incomplete");
    const operations = record(published.existing_operations);
    if (!operations || ["triage_knowledge", "maintenance_knowledge", "audit_unwarmed_handoff", "audit_explicit_setup", "audit_warmed_offline"].some(key => operations[key] !== true)) failures.push("existing-operation upgrade setup incomplete");
    const review = record(published.paired_review);
    if (!review || review.shared_payload_digest !== target.payload_digest || review.consumer_commit !== target.consumer_commit || review.model !== "claude-opus-5-5" || review.blocking_or_should_fix !== 0 || review.fresh !== true) failures.push("paired review absent, stale or unresolved");
  }
  return { ready: failures.length === 0, failures, limit: "Operator observation consistency only. This grants no publication or merge permission and is not proof against a shell-capable actor forging attestations." };
}
