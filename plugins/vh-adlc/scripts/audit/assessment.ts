import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { resolveInside } from "../triage/settings";
import { checkSnapshot, digest, git, gitBytes, hash, privateDirectory, type Snapshot } from "./snapshot";
import type { Settings } from "./types";

type Artifact = { path: string; sha256: string };
type Check = { name: string; argv: string[]; exit_code: number; commit: string; artifact: Artifact };
export type Assessment = {
  id: string; disposition: "assessment-only" | "authored-repair"; verdict: string; reason: string;
  evidence: { path: string; sha256: string; symbol: string; scenario: string; commit: string }[];
  checks: Check[]; residuals: string[];
  challenge?: { producer: string; reviewer: string; result: string; id: string; source_commit: string; artifact: Artifact } | null;
  red?: Check;
  batch_review?: { source_commit: string; reviewer: string; producer: string; result: string; artifact: Artifact };
};
export function validArtifact(root: string, value: Artifact): boolean {
  try {
    if (!value || typeof value.path !== "string" || isAbsolute(value.path) || value.path.split(/[\\/]/).includes("..")) return false;
    const path = join(root, value.path), rel = relative(root, realpathSync(path)), stat = lstatSync(path);
    return !!rel && !rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel) && stat.isFile() && !stat.isSymbolicLink() &&
      (!process.getuid || stat.uid === process.getuid()) && !(stat.mode & 0o077) && hash(readFileSync(path)) === value.sha256;
  } catch { return false; }
}
export function evaluateAssessments(config: Settings, snap: Snapshot, document: unknown) {
  return evaluate(config, snap, document, false, false);
}
/** Used only with a separately checked full publication diff and append-only record freshness. */
export function evaluateCommittedAssessments(config: Settings, snap: Snapshot, document: unknown) {
  return evaluate(config, snap, document, true, false);
}
export function evaluateCandidateAssessments(config: Settings, snap: Snapshot, document: unknown) {
  const checked = evaluate(config, snap, document, false, true);
  return { ...checked, coverage: "provisional", eligible_ids: [], limit: checked.limit + " A provisional candidate supplies no completion/publication eligibility." };
}
function evaluate(config: Settings, snap: Snapshot, document: unknown, committed: boolean, provisional: boolean) {
  const errors: string[] = [], eligible: string[] = [], assessed: string[] = [];
  const limit = "Evidence records are operator attestations; structural checks do not establish semantic truth or shell-resistant proof.";
  const result = () => ({ pass: !errors.length, coverage: errors.length || assessed.length !== snap.selected_ids.length ? "incomplete" : "complete",
    eligible_ids: errors.length ? [] : eligible, errors, limit });
  try {
    privateDirectory(snap.artifact_root, config.root);
    if (committed) {
      const { digest: claimed, ...body } = snap;
      if (digest(body) !== claimed) errors.push("Snapshot identity changed.");
      for (const [name, path] of [["settings", config.settings_path], ["ledger", config.ledger_path], ["procedure", config.project_procedure]] as const) {
        if (hash(gitBytes(config.root, "show", `${snap.source.commit}:${path}`)) !== snap.bindings[name]) errors.push("Committed audit bindings differ.");
      }
    } else if (!checkSnapshot(config, snap).current) errors.push("Source and audit bindings must be current.");
    if (!snap.source.clean) errors.push("Assessed source must be clean.");
    const doc = document as { schema_version: number; snapshot_digest: string; assessments: Assessment[] };
    if (doc?.schema_version !== 1 || doc.snapshot_digest !== snap.digest || !Array.isArray(doc.assessments)) throw Error("Assessment document does not match its snapshot.");
    if (doc.assessments.length !== snap.selected_ids.length || new Set(doc.assessments.map(row => row.id)).size !== doc.assessments.length ||
        doc.assessments.some(row => !snap.selected_ids.includes(row.id))) errors.push("Every selected finding requires exactly one assessment.");
    for (const row of doc.assessments) {
      const before = errors.length;
      const finding = snap.inventory.findings.find(f => f.id === row.id);
      const gap = ["UNKNOWN", "PARTIAL"].includes(row.verdict);
      if (!finding || (!finding.identity_valid || finding.aggregate) && !gap) errors.push("Finding identity is incomplete: " + row.id);
      if (!["assessment-only", "authored-repair"].includes(row.disposition) || !["STILL_PRESENT", "FIXED", "PARTIAL", "REGRESSED", "MOOT", "UNKNOWN"].includes(row.verdict) ||
          typeof row.reason !== "string" || !row.reason.trim() || !Array.isArray(row.evidence) || !Array.isArray(row.checks) ||
          !Array.isArray(row.residuals) || row.residuals.some(r => typeof r !== "string" || !r.trim())) errors.push("Invalid finding assessment: " + row.id);
      const terminal = ["FIXED", "MOOT"].includes(row.verdict);
      if (gap) {
        if (!row.residuals.length) errors.push("An incomplete assessment must retain its actual gap: " + row.id);
        continue;
      }
      if (terminal && row.residuals.length) errors.push("Terminal verdict has unresolved residuals: " + row.id);
      if (!Array.isArray(row.evidence) || !row.evidence.length || row.evidence.some(e => {
        try {
          const path = resolveInside(config.root, e.path);
          const bytes = committed ? gitBytes(config.root, "show", `${snap.source.commit}:${e.path}`) : readFileSync(path);
          return !e.symbol?.trim() || !e.scenario?.trim() || e.commit !== snap.source.commit ||
            (committed ? !/^100(?:644|755) blob /.test(git(config.root, "ls-tree", snap.source.commit, "--", e.path)) : !lstatSync(path).isFile()) || hash(bytes) !== e.sha256;
        } catch { return true; }
      })) errors.push("Original scenario needs current source evidence: " + row.id);
      const required = snap.required_checks[row.id] ?? [];
      if (!Array.isArray(row.checks) || new Set(row.checks.map(c => c.name)).size !== row.checks.length ||
          required.some(name => !row.checks.some(c => c.name === name)) || row.checks.some(c => c.commit !== snap.source.commit || !Number.isInteger(c.exit_code) || terminal && c.exit_code !== 0 ||
            !Array.isArray(c.argv) || !c.argv.length || c.argv.some(a => typeof a !== "string" || !a) || !validArtifact(snap.artifact_root, c.artifact))) errors.push("Required checks are missing, failed or stale: " + row.id);
      const challenge = row.challenge;
      if (terminal && (!provisional || challenge) && (!challenge || !challenge.producer?.trim() || !challenge.reviewer?.trim() || challenge.producer === challenge.reviewer || challenge.id !== row.id ||
          challenge.source_commit !== snap.source.commit || challenge.result !== "supports-verdict" || !validArtifact(snap.artifact_root, challenge.artifact))) errors.push("Independent member challenge is missing or stale: " + row.id);
      if (terminal && row.disposition === "authored-repair") {
        const review = row.batch_review, red = row.red;
        let ancestor = false;
        if (red && /^[a-f0-9]{40,64}$/.test(red.commit)) {
          try { git(config.root, "merge-base", "--is-ancestor", red.commit, snap.source.commit); ancestor = red.commit !== snap.source.commit; } catch { /* Missing/non-ancestor targets cannot supply red. */ }
        }
        if (!red || red.exit_code === 0 || !Number.isInteger(red.exit_code) || red.commit === snap.source.commit || !red.argv?.length || !validArtifact(snap.artifact_root, red.artifact) ||
            !ancestor ||
            (!provisional && (!review || review.result !== "NO FINDINGS" || review.source_commit !== snap.source.commit || !review.producer || !review.reviewer || review.producer === review.reviewer ||
            !validArtifact(snap.artifact_root, review.artifact)))) errors.push("Authored repair needs actual red and current independent batch review: " + row.id);
      }
      if (errors.length === before) { assessed.push(row.id); if (terminal) eligible.push(row.id); }
    }
  } catch { errors.push("Assessment document or evidence cannot be validated."); }
  return result();
}
