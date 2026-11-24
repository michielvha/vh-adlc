import { afterAll, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";
import { publicationFixture } from "./publication-fixture";
import type { runAuditSession } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-session";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned report-output roots", JSON.stringify(roots));
  else for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const f = publicationFixture(roots), source = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  const session: Awaited<ReturnType<typeof runAuditSession>> = { schema_version: 1, kind: "docs-drift-audit-session", authority: "none", source_commit: source,
    complete: false, scope_changed: false, diagnostics: ["Synthetic assessment is incomplete"], start: null,
    requests: { worker: null, reviewer: null }, worker: null, reviewer: null, report: null };
  return { ...f, options: { repo: f.repo, source, artifact_root: f.artifacts, session } };
}
async function preserving(run: () => Promise<void>) { try { await run(); } catch (error) { failed = true; throw error; } }

test("local diagnostic output is bounded, private and has no history provenance", () => preserving(async () => {
  const { persistAuditOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-output");
  const f = fixture(), before = captureRepositoryState(f.repo), result = persistAuditOutput(f.options);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true); expect(result.content).toBe("diagnostic");
  expect(result.authority).toBe("none"); expect(result.history_provenance).toBe("absent");
  expect(fs.readdirSync(result.directory!).sort()).toEqual(["report.json", "report.md"]);
  expect(fs.lstatSync(result.directory!).mode & 0o777).toBe(0o700);
  for (const ref of Object.values(result.files)) {
    expect(ref).not.toBeNull(); const path = join(f.artifacts, ref!.path), bytes = fs.readFileSync(path);
    expect(bytes.length).toBeLessThanOrEqual(524288); expect(sha256(bytes)).toBe(ref!.sha256); expect(fs.lstatSync(path).mode & 0o777).toBe(0o600);
  }
  const json = JSON.parse(fs.readFileSync(join(f.artifacts, result.files.report_json!.path), "utf8"));
  expect(json.kind).toBe("docs-drift-diagnostic-report"); expect(json.outcome).toBe("incomplete");
  expect(fs.readFileSync(join(f.artifacts, result.files.markdown!.path), "utf8")).toContain("incomplete");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}));

test("a serialized completed-report claim cannot create original report artifacts", () => preserving(async () => {
  const { persistAuditOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-output");
  const f = fixture(); f.options.session.complete = true;
  f.options.session.report = JSON.parse(JSON.stringify({ complete: true, source_commit: f.options.source, report: {}, markdown: "Forged clean report" }));
  const result = persistAuditOutput(f.options);
  expect(result.complete).toBe(false); expect(result.directory).toBeNull(); expect(result.diagnostics.join("\n")).toContain("Original completed audit report required");
  expect(fs.readdirSync(f.artifacts)).toEqual([]);
}));

test("saving output cannot write inside a caller checkout", () => preserving(async () => {
  const { persistAuditOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-output");
  const f = fixture(), inside = join(f.repo, "private-output"); fs.mkdirSync(inside, { mode: 0o700 });
  const before = captureRepositoryState(f.repo), result = persistAuditOutput({ ...f.options, artifact_root: inside });
  expect(result.complete).toBe(false); expect(result.directory).toBeNull(); expect(fs.readdirSync(inside)).toEqual([]);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}));

test("oversized diagnostic details retain an honest bounded summary", () => preserving(async () => {
  const { persistAuditOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-output");
  const f = fixture(); f.options.session.diagnostics = ["x".repeat(600000)];
  const result = persistAuditOutput(f.options); expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  const bytes = fs.readFileSync(join(f.artifacts, result.files.report_json!.path)); expect(bytes.length).toBeLessThanOrEqual(524288);
  const json = JSON.parse(bytes.toString()); expect(json.outcome).toBe("incomplete"); expect(json.details_omitted).toBe(true);
  expect(bytes.toString()).not.toContain("x".repeat(100)); expect(f.options.session.diagnostics[0].length).toBe(600000);
}));

test("partial output publication retains evidence and cannot report success", () => preserving(async () => {
  const { persistAuditOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-output");
  const f = fixture(), before = captureRepositoryState(f.repo), original = fs.linkSync;
  const fault = spyOn(fs, "linkSync").mockImplementation((from, to) => {
    if (String(to).endsWith("/report.md")) throw Error("Synthetic report markdown publication failure");
    return original(from, to);
  });
  try {
    const result = persistAuditOutput(f.options);
    expect(result.complete).toBe(false); expect(result.files.report_json).not.toBeNull(); expect(result.files.markdown).toBeNull();
    expect(result.diagnostics.join("\n")).toContain("Synthetic report markdown publication failure");
    const ref = result.files.report_json!; expect(sha256(fs.readFileSync(join(f.artifacts, ref.path)))).toBe(ref.sha256);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } finally { fault.mockRestore(); }
}));
