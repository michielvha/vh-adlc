import { readBoundArtifact } from "./evidence-input";
import { exactRecord } from "./publication-decisions";
import { matchesSourceQuote, parseSourceQuote, type VerificationScope, type Verification } from "./resolve";
import { canonicalDigest, protocolPath, sha256 } from "./protocol";
import type { Snapshot } from "./snapshot";
import type { ResolutionInputs } from "./resolve-inputs";

/** Read only semantic rows from the original native worker's source/decision/edit-bound handoff. */
export function resolutionVerificationReader(options: { repo: string; artifact_root: string; snapshot: Snapshot; inputs: ResolutionInputs;
  records: unknown[] | null; returned_sha256: string; decisions: unknown[] }) {
  if (!options.records || options.records.length !== options.decisions.length) throw Error("Complete original worker resolution verifications required");
  const rows = options.records.map(value => exactRecord(value, ["proposal", "hunk_id", "state", "method", "evidence", "asset_checks"], "Resolution verification fields changed"));
  const key = (proposal: unknown, hunk: unknown) => canonicalDigest([proposal, hunk]);
  const selected = new Map(rows.map(row => [key(row.proposal, row.hunk_id), row]));
  if (selected.size !== rows.length) throw Error("Repeated original resolution verification");
  return (scope: VerificationScope): Verification => {
    const row = selected.get(key(scope.decision.proposal, scope.decision.hunk_id));
    if (!row || (row.state !== "passed" && row.state !== "failed" && row.state !== "unknown") || typeof row.method !== "string" || !row.method.trim()
      || !Array.isArray(row.evidence) || !Array.isArray(row.asset_checks)) throw Error("Exact original resolution verification required");
    const evidence = row.evidence.map(parseSourceQuote);
    if ((row.state === "passed" && !evidence.length) || evidence.some(quote => !matchesSourceQuote(quote, { snapshot: options.snapshot })))
      throw Error("Current quoted resolution verification evidence required");
    const hunk = options.inputs.proposals.find(proposal => proposal.number === scope.decision.proposal)?.hunks.find(hunk => hunk.id === scope.decision.hunk_id);
    const checks = row.asset_checks.map(value => {
      const check = exactRecord(value, ["path", "sha256", "artifact"], "Resolution asset check fields changed");
      const path = protocolPath(check.path), change = scope.changes.find(change => change.path === path);
      if (!hunk || hunk.kind !== "binary" || hunk.path !== path || !change || check.sha256 !== change.after_sha256)
        throw Error("Selected resolution asset postimage required");
      const bytes = readBoundArtifact({ source_repo: options.repo, artifact_root: options.artifact_root, reference: check.artifact });
      if (!bytes.length || bytes.length > options.snapshot.settings.reports.max_entry_bytes) throw Error("Bounded original asset inspection required");
      return sha256(bytes);
    });
    if (new Set(checks).size !== checks.length) throw Error("Repeated resolution asset evidence");
    return { state: row.state, method: row.method, inputs_sha256: scope.inputs_sha256,
      artifact_sha256: options.returned_sha256, asset_checks: checks };
  };
}
