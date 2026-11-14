import { afterAll, expect, test } from "bun:test";
import { lstatSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { historyOutputFixture, runHistoryOutput } from "./history-output-fixture";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned history-output roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("retained hosted audit prepares bounded native pre-upload history provenance", async () => {
  try {
    const f = await historyOutputFixture(roots), before = captureRepositoryState(f.repo);
    const result = runHistoryOutput(f, `
const args = ["run-audit", "--repo", options.repo, "--source", options.source, "--artifact-root", options.artifact_root,
  "--cache-root", options.cache_directory, "--entry", "hosted", "--launcher", options.launcher_path, "--settings", options.settings_path,
  "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
  "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256];
const child = Bun.spawnSync([process.execPath, plugin + "/scripts/docs-drift/cli.ts", ...args], {
  env: process.env, timeout: 360000 });
if (child.exitCode !== 0) throw Error(child.stderr.toString() || child.stdout.toString());
const result = { code: child.exitCode, output: JSON.parse(child.stdout.toString()) };
`, { session: false });
    expect(result.code, JSON.stringify(result)).toBe(0);
    const saved = result.output.report_artifacts;
    expect(saved.complete, JSON.stringify(saved)).toBe(true);
    expect(saved.history_provenance).toBe("pending");
    expect(saved.authority).toBe("none");
    const report = readFileSync(join(f.artifacts, saved.files.report_json.path));
    const provenance = JSON.parse(readFileSync(join(f.artifacts, saved.files.provenance_json.path), "utf8"));
    expect(provenance.schema).toBe("docs-drift-provenance/v1");
    expect(provenance.report_sha256).toBe(sha256(report));
    expect(provenance.producer.source_commit).toBe(f.source);
    expect(provenance.producer.job_name).toBe("drift / report");
    expect(provenance.run_id).toBe(101); expect(provenance.run_attempt).toBe(1);
    expect(provenance.artifact_name).toBe("docs-drift-101-1");
    expect(provenance.artifact_id).toBeUndefined();
    expect(lstatSync(saved.directory).mode & 0o777).toBe(0o700);
    for (const reference of Object.values(saved.files) as Array<{ path: string; sha256: string }>) {
      const path = join(f.artifacts, reference.path), bytes = readFileSync(path);
      expect(bytes.length).toBeLessThanOrEqual(524288); expect(sha256(bytes)).toBe(reference.sha256);
      expect(lstatSync(path).mode & 0o777).toBe(0o600);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 600000);

test("original hosted output refuses copied contexts, changed native inputs and partial provenance delivery", async () => {
  try {
    const f = await historyOutputFixture(roots), before = captureRepositoryState(f.repo);
    const result = runHistoryOutput(f, `
const { persistHostedAuditOutput } = await import(plugin + "/scripts/docs-drift/history-output.ts");
const { collectNativeReportHistory, createCollectedActionsEnvelope } = await import(plugin + "/scripts/docs-drift/history-collection.ts");
const { readOriginalAuditReport } = await import(plugin + "/scripts/docs-drift/audit-report.ts");
const { canonicalJSON } = await import(plugin + "/scripts/docs-drift/protocol.ts");
const save = selected => persistHostedAuditOutput({ repo: options.repo, source: options.source, artifact_root: options.artifact_root, session: selected });
const copied = save(JSON.parse(JSON.stringify(session)));
const wrapped = save({ ...session });
const interactive = await collectNativeReportHistory({ ...options, entry: "copilot" });
if (!interactive.complete) throw Error(JSON.stringify(interactive));
const report = canonicalJSON(readOriginalAuditReport(session.report));
let interactiveError = null, copiedError = null;
try { createCollectedActionsEnvelope(interactive, report); } catch (error) { interactiveError = error.message; }
const hosted = await collectNativeReportHistory(options);
if (!hosted.complete) throw Error(JSON.stringify(hosted));
try { createCollectedActionsEnvelope(JSON.parse(JSON.stringify(hosted)), report); } catch (error) { copiedError = error.message; }
const path = ${JSON.stringify(f.runPath)}, original = readFileSync(path);
writeFileSync(path, JSON.stringify({ ...JSON.parse(original), run_attempt: 2 }));
const changed = save(session);
writeFileSync(path, original);
const executable = ${JSON.stringify(join(f.root, "native-bin/gh"))}, nativeBytes = readFileSync(executable, "utf8");
writeFileSync(executable, nativeBytes.replaceAll("fixture-bot", "changed-actor"));
const changedActor = save(session);
writeFileSync(executable, nativeBytes);
const fs = await import("node:fs"), { spyOn } = await import("bun:test"), link = fs.linkSync;
const fault = spyOn(fs, "linkSync").mockImplementation((from, to) => {
  if (String(to).endsWith("/provenance.json")) throw Error("Synthetic provenance delivery failure");
  return link(from, to);
});
let partial; try { partial = save(session); } finally { fault.mockRestore(); }
const result = { copied, wrapped, changed, changedActor, interactiveError, copiedError, partial };
`);
    for (const key of ["copied", "wrapped", "changed", "changedActor", "partial"]) {
      expect(result[key].complete, JSON.stringify(result[key])).toBe(false);
      expect(result[key].history_provenance).toBe("absent");
      expect(result[key].authority).toBe("none");
    }
    expect(result.interactiveError).toContain("Original hosted history collection required");
    expect(result.copiedError).toContain("Original hosted history collection required");
    expect(result.changed.scope_changed).toBe(true); expect(result.changedActor.scope_changed).toBe(true);
    expect(result.partial.files.report_json).not.toBeNull(); expect(result.partial.files.markdown).not.toBeNull();
    expect(result.partial.files.provenance_json).toBeNull();
    expect(result.partial.diagnostics.join("\n")).toContain("Synthetic provenance delivery failure");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 600000);
