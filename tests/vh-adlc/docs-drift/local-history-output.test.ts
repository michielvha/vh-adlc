/** Retained CLI and owned local-history fixtures. No actual paid-model or provider acceptance. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { historyOutputFixture, runHistoryOutput } from "./history-output-fixture";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned local-history output roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each(["matching", "actor-casing"])("retained local audit owns its invocation history and recognizes an authorized saved report: %s", async fault => {
  try {
    const f = await historyOutputFixture(roots, { localHistory: true, scannerCase: "finding" });
    const result = runHistoryOutput(f, `
const fs = await import("node:fs"), { join } = await import("node:path");
const { captureRepositoryState } = await import(plugin + "/scripts/docs-drift/snapshot.ts");
const args = ["run-audit", "--repo", options.repo, "--source", options.source, "--artifact-root", options.artifact_root,
  "--cache-root", options.cache_directory, "--entry", "copilot", "--launcher", options.launcher_path, "--settings", options.settings_path,
  "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
  "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256];
function run() {
  const before = JSON.stringify(captureRepositoryState(options.repo));
  const child = Bun.spawnSync([process.execPath, plugin + "/scripts/docs-drift/cli.ts", ...args], { env: process.env, timeout: 360000 });
  const output = JSON.parse(child.stdout.toString());
  return { code: child.exitCode, output, preserved: JSON.stringify(captureRepositoryState(options.repo)) === before };
}
const first = run();
let second = null;
if (first.output.audit_session?.complete && first.output.report_artifacts?.files.provenance_json) {
  // Explicit report-save permission in this owned synthetic consumer. The ordinary audit preserves its caller.
  const directory = join(options.repo, ".vh-adlc/docs-drift-history/earlier"); fs.mkdirSync(directory, { mode: 0o700 });
  for (const [key, name] of [["report_json", "report.json"], ["provenance_json", "provenance.json"]]) {
    const ref = first.output.report_artifacts.files[key];
    writeFileSync(join(directory, name), readFileSync(join(options.artifact_root, ref.path)), { mode: 0o600 });
  }
  if (${JSON.stringify(fault)} === "actor-casing") {
    const executable = ${JSON.stringify(join(f.root, "native-bin/gh"))};
    writeFileSync(executable, readFileSync(executable, "utf8").replaceAll("fixture-bot", "FiXtUrE-BoT"));
  }
  second = run();
}
const result = { first, second };
`, { session: false, timeoutMs: 780000 });
    expect(result.first.output.audit_session?.complete, JSON.stringify(result.first.output.audit_session?.diagnostics)).toBe(true);
    expect(result.first.code).toBe(1); expect(result.first.preserved).toBe(true);
    expect(result.first.output.report_artifacts.history_provenance).toBe("local-attestation");
    expect(result.first.output.audit_session.report.report.outcome).toBe("new-attention");
    expect(result.second, JSON.stringify(result)).not.toBeNull();
    expect(result.second.code).toBe(0); expect(result.second.preserved).toBe(true);
    expect(result.second.output.audit_session.report.report.outcome).toBe("carried-attention");
    const previous = result.first.output.audit_session.report.report.run_id;
    expect(result.second.output.audit_session.report.report.attention[0].carried_from).toContain("local-attestation:" + previous);
  } catch (error) { failed = true; throw error; }
}, 900000);

test("local report registration refuses copied contexts, native changes and partial writes", async () => {
  try {
    const f = await historyOutputFixture(roots, { localHistory: true });
    const result = runHistoryOutput(f, `
const fs = await import("node:fs"), { join } = await import("node:path"), { spyOn } = await import("bun:test");
const { persistLocalAuditOutput } = await import(plugin + "/scripts/docs-drift/local-history-output.ts");
const { createOriginalAuditReportEnvelope } = await import(plugin + "/scripts/docs-drift/audit-report.ts");
const transport = await import(plugin + "/scripts/docs-drift/transport.ts");
const save = selected => persistLocalAuditOutput({ repo: options.repo, source: options.source, artifact_root: options.artifact_root, session: selected });
const observe = saved => ({ ...saved, upload_file_exists: saved.directory && fs.existsSync(join(saved.directory, "provenance.json")) });
function records() {
  const root = join(options.cache_directory, "local-report-history");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true }).filter(file => String(file).endsWith(".json"));
}
const copied = observe(save(JSON.parse(JSON.stringify(session)))), wrapped = observe(save({ ...session }));
let hostedError = null;
try { createOriginalAuditReportEnvelope(session.report); } catch (error) { hostedError = error.message; }
const executable = ${JSON.stringify(join(f.root, "native-bin/gh"))}, native = readFileSync(executable, "utf8");
writeFileSync(executable, native.replaceAll("fixture-bot", "changed-actor"));
let actor; try { actor = observe(save(session)); } finally { writeFileSync(executable, native); }
const originalNative = transport.readNativeContext;
const sourceFault = spyOn(transport, "readNativeContext").mockImplementation(input => ({ ...originalNative(input),
  default_commit: ${JSON.stringify(JSON.parse(readFileSync(join(f.repo, f.configured.publication.adoption_record), "utf8")).source_candidate)} }));
let source; try { source = observe(save(session)); } finally { sourceFault.mockRestore(); }
const link = fs.linkSync;
const pairFault = spyOn(fs, "linkSync").mockImplementation((from, to) => {
  if (String(to).endsWith("/provenance.pending.json")) throw Error("Synthetic local pair write failure");
  return link(from, to);
});
let pair; try { pair = observe(save(session)); } finally { pairFault.mockRestore(); }
const recordFault = spyOn(fs, "linkSync").mockImplementation((from, to) => {
  if (String(to).includes("/local-report-history/") && String(to).includes("/.pending-")) throw Error("Synthetic local record write failure");
  return link(from, to);
});
let record; try { record = observe(save(session)); } finally { recordFault.mockRestore(); }
const rename = fs.renameSync, guide = join(options.repo, "docs/guide.md"), originalGuide = readFileSync(guide);
const callerFault = spyOn(fs, "renameSync").mockImplementation((from, to) => {
  const value = rename(from, to);
  if (String(to).endsWith("/provenance.json")) writeFileSync(guide, Buffer.concat([originalGuide, Buffer.from("Synthetic later caller change\\n")]));
  return value;
});
let caller; try { caller = observe(save(session)); } finally { callerFault.mockRestore(); writeFileSync(guide, originalGuide); }
const activationFault = spyOn(fs, "renameSync").mockImplementation((from, to) => {
  if (String(to).includes("/local-report-history/") && String(to).endsWith(".json")) throw Error("Synthetic local record activation failure");
  return rename(from, to);
});
let activation; try { activation = observe(save(session)); } finally { activationFault.mockRestore(); }
const beforeSuccess = records();
const success = observe(save(session)), afterSuccess = records();
const result = { copied, wrapped, hostedError, actor, source, pair, record, caller, activation, beforeSuccess, success, afterSuccess };
`);
    for (const name of ["copied", "wrapped", "actor", "source", "pair", "record", "caller", "activation"]) {
      const saved = result[name];
      expect(saved.complete, name + JSON.stringify(saved)).toBe(false); expect(saved.history_provenance, name).toBe("absent");
      expect(saved.local_invocation, name).toBeUndefined(); expect(saved.upload_file_exists, name).toBeFalsy();
    }
    expect(result.actor.scope_changed).toBe(true); expect(result.source.scope_changed).toBe(true); expect(result.caller.scope_changed).toBe(true);
    expect(result.source.diagnostics).toContain("Native local history source or actor changed");
    expect(result.hostedError).toContain("Original hosted history collection required");
    expect(result.pair.diagnostics).toContain("Synthetic local pair write failure");
    expect(result.record.diagnostics).toContain("Synthetic local record write failure");
    expect(result.activation.diagnostics).toContain("Synthetic local record activation failure");
    expect(result.caller.diagnostics).toContain("Caller changed during local report retention");
    expect(result.beforeSuccess).toEqual([]); expect(result.afterSuccess).toHaveLength(1);
    expect(result.success.complete, JSON.stringify(result.success)).toBe(true);
    expect(result.success.history_provenance).toBe("local-attestation");
    const reference = result.success.local_invocation;
    expect(sha256(readFileSync(join(f.options.cache_directory, reference.path)))).toBe(reference.sha256);
  } catch (error) { failed = true; throw error; }
}, 600000);
