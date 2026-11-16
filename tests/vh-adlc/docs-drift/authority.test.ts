/** Static entry/policy integration. Native effect enforcement is exercised in publication/recovery authority suites. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { docsDriftIntakeCases } from "../lifecycle/docs-drift-intake-cases";

const plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc");
const read = (path: string) => readFileSync(resolve(plugin, "references", path), "utf8");

test("intake exposes corpus audit, selected resolution and post-merge entry without consuming adjacent routes", () => {
  const text = read("lifecycle.md");
  const rows = text.split("\n").filter(line => line.startsWith("|"));
  const drift = rows.filter(row => row.includes("skills/vh-adlc-docs-drift/SKILL.md"));
  expect(drift).toHaveLength(1);
  for (const mode of ["audit", "resolve", "post-merge"]) expect(drift[0]).toContain(mode);
  for (const adjacent of ["vh-adlc-docs-impact/SKILL.md", "vh-adlc-audit/SKILL.md", "artifact", "truth"]) expect(text).toContain(adjacent);
  const section = text.split("## Documentation drift intake\n")[1]?.split("\n## ")[0];
  expect(section).toBeDefined();
  for (const requirement of ["one focused scope question", "before any scan or write", "settings", "ordinary", "offline", "post-merge", "local truth"]) expect(section).toContain(requirement);
  expect(docsDriftIntakeCases.filter(row => row.operation === "clarify").map(row => row.configured)).toEqual([true, false]);
  expect(new Set(docsDriftIntakeCases.filter(row => row.operation === "docs-drift").map(row => row.mode))).toEqual(new Set(["audit", "setup", "resolve", "post-merge"]));
});

test("the docs-drift authority matrix keeps every runtime effect and recovery approval independently visible", () => {
  const text = read("authority.md"), section = text.split("## Scoped docs-drift locations and effects\n")[1];
  expect(section).toBeDefined();
  const rows = section?.split("\n").filter(line => line.startsWith("| ")) ?? [];
  const actions = rows.slice(2).map(row => row.split("|")[1].trim());
  const required = ["Assessment and local report", "CI diagnostic upload", "Prepare/resolve edits and generators", "Local checkpoint commit",
    "Push and advisory/resolve PR", "Owned consolidation-branch refresh", "Issue creation", "Explanation comment", "Superseded-PR closure",
    "Publication lease acquisition", "Owned lease release", "Receipt creation and retention", "Administrative abandonment", "Delivery acknowledgement",
    "Workflow dispatch", "Workflow disable/enable", "Workflow-run cancellation", "Committed synthetic trial grant", "Synthetic draft PR", "Owned trial PR/branch cleanup",
    "Merged-branch cleanup", "Merge or release"];
  expect(actions).toEqual(required);
  expect(section).toContain("terminal receipt refs indefinitely");
  const introduction = section?.split("| Action | Authority and conditions |")[0];
  expect(introduction).toContain("Administrative abandonment and delivery acknowledgement require the owner's actual current approval");
  expect(introduction).toContain("only standing source for the synthetic trial scope");
  expect(section).toContain("Acknowledgement and administrative abandonment exclude standing adopted procedures");
  expect(section).toContain("Automatic expiry and job cancellation authorize neither action");
  expect(new Set(actions).size).toBe(actions.length);
  const acknowledgement = rows.find(row => row.includes("| Delivery acknowledgement |"));
  for (const requirement of ["actual current approval", "lookup", "evidence digests"]) expect(acknowledgement).toContain(requirement);
  const abandonment = rows.find(row => row.includes("| Administrative abandonment |"));
  for (const requirement of ["exact current approval", "repository", "operation", "lease/receipt refs", "observed object IDs",
    "ordinary Git compare-and-swap", "no delivery or settlement proof", "terminal receipts"])
    expect(abandonment).toContain(requirement);
  const trial = rows.find(row => row.includes("| Committed synthetic trial grant |"));
  for (const requirement of ["owner-approved", "committed trial definition", "path/digest", "component", "workflow", "publisher",
    "namespace", "run ID/attempt", "Dispatch input alone", "production"])
    expect(trial).toContain(requirement);
  for (const requirement of ["docs-drift-assessment", "docs-drift-prepare", "pr-object-store", "trial-scratch", "non-forced",
    "original ownership", "standing", "unattended", "triage", "maintenance", "Review Log"]) expect(section).toContain(requirement);
});

test("review protocol dispatches docs-drift through its bound role captures and leaves lifecycle review targeting intact", () => {
  const text = read("review-protocol.md"), section = text.split("## Documentation drift role review\n")[1]?.split("\n## ")[0];
  expect(section).toBeDefined();
  for (const requirement of ["docs-drift-review.md", "native", "worker", "reviewer", "full model", "review pending",
    "preflight checklist", "scoped authority", "owner/reviewer", "attestations", "retained-byte integrity", "formal feature"])
    expect(section).toContain(requirement);
  for (const original of ["--operation \"spec review\"", "--operation review", "exact commit", "Self-review"]) expect(text).toContain(original);
});
