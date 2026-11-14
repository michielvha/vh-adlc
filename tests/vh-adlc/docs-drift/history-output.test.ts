import { afterAll, expect, test } from "bun:test";
import { lstatSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { historyOutputFixture, runHistoryOutput } from "./history-output-fixture";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import type { AuditOutputArtifacts } from "../../../plugins/vh-adlc/scripts/docs-drift/report-output";

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
    expect(readdirSync(saved.directory).sort()).toEqual(["provenance.json", "report.json", "report.md"]);
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
  if (String(to).endsWith("/provenance.json") || String(to).endsWith("/provenance.pending.json")) throw Error("Synthetic provenance delivery failure");
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

test("late hosted refusals keep provisional evidence outside the upload pair", async () => {
  try {
    const f = await historyOutputFixture(roots), before = captureRepositoryState(f.repo);
    const result = runHistoryOutput(f, `
const fs = await import("node:fs"), { spyOn } = await import("bun:test");
const output = await import(plugin + "/scripts/docs-drift/report-output.ts");
const reports = await import(plugin + "/scripts/docs-drift/audit-report.ts");
const { persistHostedAuditOutput } = await import(plugin + "/scripts/docs-drift/history-output.ts");
const { HistoryEligibilityError } = await import(plugin + "/scripts/docs-drift/report-history.ts");
const { sha256 } = await import(plugin + "/scripts/docs-drift/protocol.ts");
const save = () => persistHostedAuditOutput({ repo: options.repo, source: options.source, artifact_root: options.artifact_root, session });
const nativePath = ${JSON.stringify(f.runPath)}, native = readFileSync(nativePath), guide = options.repo + "/docs/guide.md", originalGuide = readFileSync(guide);
const link = fs.linkSync, late = {};
for (const fault of ["run", "reopen", "caller"]) {
  const hook = spyOn(fs, "linkSync").mockImplementation((from, to) => {
    const value = link(from, to);
    if (String(to).endsWith("/provenance.json") || String(to).endsWith("/provenance.pending.json")) {
      if (fault === "run") writeFileSync(nativePath, JSON.stringify({ ...JSON.parse(native), status: "completed", conclusion: "cancelled" }));
      if (fault === "reopen") writeFileSync(to, "Changed provisional envelope\\n", { mode: 0o600 });
      if (fault === "caller") writeFileSync(guide, Buffer.concat([originalGuide, Buffer.from("Synthetic later caller change\\n")]));
    }
    return value;
  });
  try { late[fault] = structuredClone(save()); } finally { hook.mockRestore(); writeFileSync(nativePath, native); writeFileSync(guide, originalGuide); }
  late[fault].upload_file_exists = fs.existsSync(late[fault].directory + "/provenance.json");
  late[fault].provisional_file_exists = fs.existsSync(late[fault].directory + "/provenance.pending.json");
}
const persist = output.persistAuditOutput;
const identityFault = spyOn(output, "persistAuditOutput").mockImplementation(options => {
  const saved = structuredClone(persist(options)), path = options.artifact_root + "/" + saved.files.report_json.path;
  const bytes = Buffer.concat([readFileSync(path), Buffer.from("\\n")]); writeFileSync(path, bytes);
  saved.files.report_json.sha256 = sha256(bytes); return saved;
});
let identity; try { identity = save(); } finally { identityFault.mockRestore(); }
const originalEnvelope = reports.createOriginalAuditReportEnvelope;
let envelopeCalls = 0;
const differentEnvelope = spyOn(reports, "createOriginalAuditReportEnvelope").mockImplementation(report => {
  const bytes = originalEnvelope(report); return ++envelopeCalls === 1 ? bytes : Buffer.concat([bytes, Buffer.from("\\n")]);
});
let changedEnvelope;
try {
  const saved = save();
  changedEnvelope = { ...saved, upload_file_exists: fs.existsSync(saved.directory + "/provenance.json"),
    provisional_file_exists: fs.existsSync(saved.directory + "/provenance.pending.json") };
} finally { differentEnvelope.mockRestore(); }
const oversized = spyOn(reports, "createOriginalAuditReportEnvelope").mockImplementation(report => {
  const bytes = originalEnvelope(report); return Buffer.concat([bytes, Buffer.alloc(524288)]);
});
let bound; try { bound = save(); } finally { oversized.mockRestore(); }
const earlyChange = spyOn(reports, "createOriginalAuditReportEnvelope").mockImplementation(report => {
  const bytes = originalEnvelope(report);
  writeFileSync(guide, Buffer.concat([originalGuide, Buffer.from("Synthetic caller change during early refusal\\n")]));
  return Buffer.concat([bytes, Buffer.alloc(524288)]);
});
let earlyRefusal; try { earlyRefusal = save(); } finally { earlyChange.mockRestore(); writeFileSync(guide, originalGuide); }
const ineligible = spyOn(reports, "createOriginalAuditReportEnvelope").mockImplementation(() => { throw new HistoryEligibilityError("technical report state"); });
let refused; try { refused = save(); } finally { ineligible.mockRestore(); }
const earlyDirectories = { bound: fs.readdirSync(bound.directory).sort(),
  earlyRefusal: fs.readdirSync(earlyRefusal.directory).sort(), refused: fs.readdirSync(refused.directory).sort() };
const result = { late, identity, changedEnvelope, bound, earlyRefusal, refused, earlyDirectories };
`);
    type LateOutput = AuditOutputArtifacts & { upload_file_exists: boolean; provisional_file_exists: boolean };
    const diagnostics: Record<string, string> = { run: "Current native scheduled run changed before output",
      reopen: "docs-drift original evidence artifact changed", caller: "Caller changed during hosted report retention" };
    for (const [fault, saved] of Object.entries(result.late as Record<string, LateOutput>)) {
      expect(saved.complete, fault + JSON.stringify(saved)).toBe(false);
      expect(saved.scope_changed, fault).toBe(true); expect(saved.history_provenance).toBe("absent");
      expect(saved.files.provenance_json, fault).toBeNull(); expect(saved.upload_file_exists, fault).toBe(false);
      expect(saved.provisional_file_exists, fault).toBe(true);
      expect(saved.diagnostics, fault).toContain(diagnostics[fault]);
    }
    expect(result.late.caller.diagnostics.filter((message: string) => message === diagnostics.caller)).toHaveLength(1);
    for (const name of ["bound", "earlyRefusal", "refused"])
      expect(result.earlyDirectories[name], name).toEqual(["report.json", "report.md"]);
    expect(result.identity.complete).toBe(false); expect(result.identity.scope_changed).toBe(true);
    expect(result.identity.diagnostics).toContain("Original hosted report bytes changed");
    expect(result.changedEnvelope.complete).toBe(false); expect(result.changedEnvelope.scope_changed).toBe(true);
    expect(result.changedEnvelope.files.provenance_json).toBeNull();
    expect(result.changedEnvelope.upload_file_exists).toBe(false); expect(result.changedEnvelope.provisional_file_exists).toBe(true);
    expect(result.changedEnvelope.diagnostics).toContain("Original hosted provenance changed during retention");
    expect(result.bound.complete).toBe(false); expect(result.bound.scope_changed).toBe(false);
    expect(result.bound.diagnostics).toContain("Hosted provenance exceeds the configured retained entry bound");
    expect(result.earlyRefusal.complete).toBe(false); expect(result.earlyRefusal.scope_changed).toBe(true);
    expect(result.earlyRefusal.files.provenance_json).toBeNull(); expect(result.earlyRefusal.history_provenance).toBe("absent");
    expect(result.earlyRefusal.diagnostics).toContain("Hosted provenance exceeds the configured retained entry bound");
    expect(result.earlyRefusal.diagnostics).toContain("Caller changed during hosted report retention");
    expect(result.refused.complete).toBe(false); expect(result.refused.history_provenance).toBe("absent");
    expect(result.refused.files.report_json).not.toBeNull(); expect(result.refused.files.markdown).not.toBeNull();
    expect(result.refused.diagnostics).toContain("ineligible docs-drift history technical report state");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 600000);
