import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { hostedHistoryFaults, hostedHistoryFixture } from "./history-collection-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed native history collection roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["disabled-history", "changed-source-proof", "missing-hosted-run", "missing-hosted-attempt"])("native history collection binds its actual source and invocation: %s", async fault => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-collection"), f = await bindingFixture(roots, false);
    const before = captureRepositoryState(f.repo);
    if (fault === "changed-source-proof") writeFileSync(join(f.artifacts, f.options.source_verification.path), "Changed original proof\n");
    const result = await api.collectNativeReportHistory({ ...f.options, ...(fault.startsWith("missing-hosted") ? { entry: "hosted" as const,
      ...(fault === "missing-hosted-attempt" ? { run: "101" } : {}) } : {}) });
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

test.each([...hostedHistoryFaults])("hosted history verifies the active native run and rechecks its stable identity: %s", async fault => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-collection"), f = await hostedHistoryFixture(roots, fault), { countPath } = f;
    const before = captureRepositoryState(f.repo), result = await api.collectNativeReportHistory({ ...f.options, entry: "hosted", run: "101", hosted_run_attempt: 1 });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(fault === "matching");
    expect(result.mode).toBe("actions"); expect(result.authority).toBe("none");
    expect(Number(readFileSync(countPath, "utf8"))).toBe(["matching", "cancelled"].includes(fault) ? 2 : 1);
    if (fault === "matching") {
      expect(result.context?.run_id).toBe("101"); expect(api.readCollectedReportHistory(result).records).toEqual([]);
      expect(result.hosted_run_attempt).toBe(1);
    } else {
      expect(result.scope_changed).toBe(true); expect(result.diagnostics.join("\n")).toContain(fault === "cancelled" ? "invocation changed" : "Current native scheduled run identity changed");
      expect(() => api.readCollectedReportHistory(result)).toThrow("Original native history collection required");
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
