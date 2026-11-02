import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateAssessments } from "./assessment";
import { checkSnapshot, privateDirectory, type Snapshot } from "./snapshot";
import type { Settings } from "./types";

/** A report is an exclusive private observation, never a permission or canonical ledger write. */
export function saveReport(config: Settings, snap: Snapshot, name: string, assessments?: unknown): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(name)) throw Error("invalid audit report name");
  const directory = privateDirectory(snap.artifact_root, config.root);
  if (!checkSnapshot(config, snap).current) throw Error("audit report bindings changed");
  const checked = assessments === undefined ? null : evaluateAssessments(config, snap, assessments);
  const lines = ["# Audit report", "", `Repository: ${snap.hostname}/${snap.repository}`, `Mode: ${snap.mode}`,
    `Source: ${snap.source.commit}`, `Snapshot: ${snap.digest}`, "", "## Recorded status", "",
    ...Object.entries(snap.inventory.recorded_counts).map(([state, count]) => `- ${state}: ${count}`), "",
    checked ? `Current verification: ${checked.coverage}; eligible terminal updates: ${checked.eligible_ids.join(", ") || "none"}.` : "Current verification: not performed",
    `History comparison: ${snap.history.status}. ${snap.history.reason}`, "",
    ...snap.inventory.diagnostics.map(d => `- Inventory gap: ${d.code}${d.id ? " (" + d.id + ")" : ""}`),
    ...(checked ? [checked.limit, ...checked.errors.map(error => "- Evidence gap: " + error)] : []), "",
    "This private report grants no ledger, live or remote effects.", ""];
  const path = join(directory, name + ".md");
  writeFileSync(path, lines.join("\n"), { flag: "wx", mode: 0o600 });
  return path;
}
