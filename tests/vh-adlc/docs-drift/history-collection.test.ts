import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed native history collection roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["disabled-history", "changed-source-proof", "missing-hosted-run"])("native history collection binds its actual source and invocation: %s", async fault => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-collection"), f = await bindingFixture(roots, false);
    const before = captureRepositoryState(f.repo);
    if (fault === "changed-source-proof") writeFileSync(join(f.artifacts, f.options.source_verification.path), "Changed original proof\n");
    const result = await api.collectNativeReportHistory({ ...f.options, ...(fault === "missing-hosted-run" ? { entry: "hosted" as const } : {}) });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(fault === "disabled-history"); expect(result.authority).toBe("none");
    if (fault === "disabled-history") {
      expect(result.mode).toBe("none"); expect(result.history).toEqual([]); expect(result.context?.run_id).toBe(f.options.run);
      expect(result.context?.repository).toBe("fixture/docs"); expect(result.context?.started_at).toBe(result.captured_at);
      const snapshot = api.readCollectedReportHistory(result);
      expect(snapshot.records).toEqual([]); expect(snapshot.captured_at).toBe(result.captured_at);
      expect(() => api.readCollectedReportHistory(JSON.parse(JSON.stringify(result)))).toThrow("Original native history collection required");
    } else {
      expect(() => api.readCollectedReportHistory(result)).toThrow("Original native history collection required");
      if (fault === "changed-source-proof") expect(result.scope_changed).toBe(true);
      else expect(result.diagnostics.join("\n")).toContain("Current native scheduled run identity required");
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).not.toContain("Changed original proof");
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);

test.each(["matching", "cancelled"])("hosted history verifies the active native run and rechecks its stable identity: %s", async fault => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-collection"), f = await bindingFixture(roots, false);
    const { retainClientDistribution } = await import("../../../plugins/vh-adlc/scripts/docs-drift/bootstrap");
    await retainClientDistribution({ ...f.setup, profile_scope: { ...f.setup.profile_scope, entry: "hosted" } });
    const executable = join(f.root, "native-bin/gh"), countPath = join(f.root, "history-run-reads"), original = readFileSync(executable, "utf8");
    const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
    const native = { id: 101, run_attempt: 1, workflow_id: 19, path: ".github/workflows/docs-drift.yml", event: "schedule", status: "in_progress",
      conclusion: null, head_sha: f.source, head_branch: "main", repository, head_repository: repository,
      created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:01:00Z" };
    const extra = `
  let historyValue;
  if (endpoint === "repos/fixture/docs/actions/runs/101" || endpoint === "repos/fixture/docs/actions/runs/101/attempts/1") {
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
    const before = captureRepositoryState(f.repo), result = await api.collectNativeReportHistory({ ...f.options, entry: "hosted", run: "101" });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(fault === "matching");
    expect(result.mode).toBe("actions"); expect(result.authority).toBe("none");
    expect(Number(readFileSync(countPath, "utf8"))).toBe(2);
    if (fault === "matching") {
      expect(result.context?.run_id).toBe("101"); expect(api.readCollectedReportHistory(result).records).toEqual([]);
    } else {
      expect(result.scope_changed).toBe(true); expect(result.diagnostics.join("\n")).toContain("invocation changed");
      expect(() => api.readCollectedReportHistory(result)).toThrow("Original native history collection required");
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
