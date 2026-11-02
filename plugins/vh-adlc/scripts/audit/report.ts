import { join } from "node:path";
import { publishBytes } from "../maintenance/journal";
import { evaluateAssessments } from "./assessment";
import { checkSnapshot, privateDirectory, type Snapshot } from "./snapshot";
import type { Settings } from "./types";

/** A report is an exclusive private observation, never a permission or canonical ledger write. */
export function saveReport(config: Settings, snap: Snapshot, name: string, assessments?: unknown): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(name)) throw Error("invalid audit report name");
  const directory = privateDirectory(snap.artifact_root, config.root);
  if (!checkSnapshot(config, snap).current) throw Error("audit report bindings changed");
  const checked = assessments === undefined ? null : evaluateAssessments(config, snap, assessments);
  const safe = (value: unknown) => typeof value === "string" ? value.replace(/[\r\n]/g, " ").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("|", "\\|") : "not recorded";
  const rows = (assessments as { assessments?: unknown })?.assessments;
  const details = Array.isArray(rows) ? rows.flatMap(row => {
    if (!row || typeof row !== "object") return ["- Malformed assessment row; see evidence gaps."];
    return [`### ${safe(row.id)}`, `Proposed verdict: ${safe(row.verdict)}; disposition: ${safe(row.disposition)}.`,
      `Reason: ${safe(row.reason)}`, "Observed checks: " + (Array.isArray(row.checks) ? row.checks.map((c: { name?: string; exit_code?: number }) => `${safe(c?.name)} exit ${Number.isInteger(c?.exit_code) ? c.exit_code : "unknown"}`).join(", ") || "none recorded" : "not recorded"),
      "Residuals: " + (Array.isArray(row.residuals) ? row.residuals.map(safe).join("; ") || "none recorded" : "not recorded"),
      "Terminal eligibility: " + (checked?.eligible_ids.includes(row.id) ? "structurally eligible; semantic challenge still requires actual review" : "not established"), ""];
  }) : [];
  const lines = ["# Audit report", "", `Repository: ${snap.hostname}/${snap.repository}`, `Mode: ${snap.mode}`,
    `Source: ${snap.source.commit}`, `Snapshot: ${snap.digest}`, "", "## Recorded status", "",
    ...Object.entries(snap.inventory.recorded_counts).map(([state, count]) => `- ${state}: ${count}`), "",
    checked ? `Current verification: ${checked.coverage}; eligible terminal updates: ${checked.eligible_ids.join(", ") || "none"}.` : "Current verification: not performed",
    `History comparison: ${snap.history.status}. ${snap.history.reason}`, "",
    ...snap.inventory.diagnostics.map(d => `- Inventory gap: ${d.code}${d.id ? " (" + d.id + ")" : ""}`),
    ...(checked ? [checked.limit, ...checked.errors.map(error => "- Evidence gap: " + error)] : []), "",
    ...(details.length ? ["## Current assessments", "", ...details] : []),
    "This private report grants no ledger, live or remote effects.", ""];
  const path = join(directory, name + ".md");
  publishBytes(path, lines.join("\n"));
  return path;
}
