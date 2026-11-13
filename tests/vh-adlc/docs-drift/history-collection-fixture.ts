/** Owned synthetic native API/runtime fixtures only. No hosted/model execution. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";

export const hostedHistoryFaults = ["matching", "cancelled", "repository-id", "head-repository-id", "head-sha", "head-branch", "event", "completed", "workflow-id", "path-ref", "run-attempt"] as const;
export type HostedHistoryFault = typeof hostedHistoryFaults[number];

export async function hostedHistoryFixture(roots: string[], fault: HostedHistoryFault = "matching") {
  const f = await bindingFixture(roots, false);
  const { retainClientDistribution } = await import("../../../plugins/vh-adlc/scripts/docs-drift/bootstrap");
  await retainClientDistribution({ ...f.setup, profile_scope: { ...f.setup.profile_scope, entry: "hosted" } });
  const executable = join(f.root, "native-bin/gh"), countPath = join(f.root, "history-run-reads"), original = readFileSync(executable, "utf8");
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const native = { id: 101, run_attempt: 1, workflow_id: 19, path: ".github/workflows/docs-drift.yml", event: "schedule", status: "in_progress",
    conclusion: null, head_sha: f.source, head_branch: "main", repository, head_repository: repository,
    created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:01:00Z" };
  if (fault === "repository-id") native.repository = { ...repository, id: 11 };
  if (fault === "head-repository-id") native.head_repository = { ...repository, id: 11 };
  if (fault === "head-sha") native.head_sha = "f".repeat(40);
  if (fault === "head-branch") native.head_branch = "feature";
  if (fault === "event") native.event = "workflow_dispatch";
  if (fault === "completed") native.status = "completed";
  if (fault === "workflow-id") native.workflow_id = 20;
  if (fault === "path-ref") native.path += "@feature";
  if (fault === "run-attempt") native.run_attempt = 2;
  const extra = `
let historyValue;
if (endpoint === "repos/fixture/docs/actions/runs/101" || endpoint?.startsWith("repos/fixture/docs/actions/runs/101/attempts/")) {
  const fs = require("node:fs"), path = ${JSON.stringify(countPath)}, count = fs.existsSync(path) ? Number(fs.readFileSync(path, "utf8")) : 0;
  fs.writeFileSync(path, String(count + 1)); historyValue = ${JSON.stringify(native)};
  if (count > 0) { historyValue.updated_at = "2000-01-01T00:02:00Z";
    if (${JSON.stringify(fault)} === "cancelled") { historyValue.status = "completed"; historyValue.conclusion = "cancelled"; } }
} else if (endpoint === "repos/fixture/docs/actions/workflows/19") historyValue = { id: 19, path: ".github/workflows/docs-drift.yml", state: "active" };
else if (endpoint?.startsWith("repos/fixture/docs/actions/workflows/19/runs?")) historyValue = { total_count: 0, workflow_runs: [] };
if (historyValue !== undefined) { console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(historyValue)); process.exit(0); }
`;
  if (!original.includes("  const sha = ")) throw Error("Missing original native read fixture boundary");
  writeFileSync(executable, original.replace("  const sha = ", extra + "  const sha = "));
  return { ...f, countPath };
}
