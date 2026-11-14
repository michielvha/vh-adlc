import type { LabelsGitHub } from "./github";
import { buildPlan, digest, type LabelPlan, type Write } from "./plan";

export type Outcome = { action: Write["action"]; name: string; status: "succeeded" | "failed" | "not_attempted" };
export type Receipt = { schema_version: 1; complete: boolean; reconciled: boolean; plan_digest: string; repository: string; actor: string; outcomes: Outcome[]; remaining: string[] };

/**
 * Apply an approved label plan. A fresh observation must reproduce the approved bytes exactly, so a
 * different host, repository, account, vocabulary, label_map or repository label refuses before any write.
 */
export function apply(root: string, gh: LabelsGitHub, text: string, approvedDigest: string): Receipt {
  if (!/^[0-9a-f]{64}$/.test(approvedDigest) || digest(text) !== approvedDigest) throw new Error("exact plan approval digest is missing or changed");
  let approved: LabelPlan;
  try { approved = JSON.parse(text) as LabelPlan; } catch { throw new Error("plan is not valid JSON"); }
  if (approved.schema_version !== 1 || !Array.isArray(approved.writes)) throw new Error("plan has an unsupported format");
  const fresh = buildPlan(root, gh);
  if (fresh.text !== text) throw new Error("the repository, account, vocabulary, label_map or labels changed since this plan was approved; plan again");
  const outcomes: Outcome[] = approved.writes.map((write) => ({ action: write.action, name: write.name, status: "not_attempted" }));
  for (const [index, write] of approved.writes.entries()) {
    try {
      if (write.action === "create") gh.create(approved.repository, write.name, write.after);
      else gh.update(approved.repository, write.name, write.after);
      outcomes[index].status = "succeeded";
    } catch {
      outcomes[index].status = "failed";
      break;
    }
  }
  const base = { schema_version: 1 as const, plan_digest: approvedDigest, repository: approved.repository, actor: approved.actor, outcomes };
  let after: LabelPlan;
  try { after = buildPlan(root, gh).plan; } catch {
    // Without a readback, report what this run did and treat every other planned write as remaining.
    return { ...base, complete: false, reconciled: false, remaining: outcomes.filter((outcome) => outcome.status !== "succeeded").map((outcome) => outcome.name) };
  }
  return {
    ...base, reconciled: true,
    complete: outcomes.every((outcome) => outcome.status === "succeeded") && after.writes.length === 0,
    remaining: after.writes.map((write) => write.name),
  };
}
