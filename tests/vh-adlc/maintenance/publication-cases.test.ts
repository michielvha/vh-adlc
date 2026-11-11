import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPublicationCase, installRecordingTransport, publicationState } from "./publication-cases";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { git } from "./fixtures";
test("recording Git transport preserves origin identity and redirects only owned transport to a local bare remote", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-publication-test-"));
  try {
    const transport = installRecordingTransport(root), item = createPublicationCase(root, "standing", transport);
    expect(loadSettings(item.invocation).repository).toBe("example/project");
    const before = publicationState(item);
    const result = Bun.spawnSync(["git", "-C", item.main, "fetch", "origin", "main"], { env: transport.env, stdout: "pipe", stderr: "pipe" });
    expect({ exit: result.exitCode, error: result.exitCode ? result.stderr.toString() : "" }).toEqual({ exit: 0, error: "" }); expect(git(item.main, "remote", "get-url", "origin")).toBe("https://github.com/example/project.git");
    expect(publicationState(item).remote).toBe(before.remote);
    const refused = Bun.spawnSync(["git", "-C", item.main, "push", "--force", "origin", "main"], { env: transport.env, stdout: "pipe", stderr: "pipe" });
    expect(refused.exitCode).not.toBe(0); expect(readFileSync(transport.trace, "utf8")).toContain("forbidden");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { gradePublicationCases } from "./lifecycle-trial";
test("a narrative publication claim cannot replace actual local/remote state and transport effects", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-publication-grade-"));
  try {
    const transport = installRecordingTransport(root), item = createPublicationCase(root, "standing", transport);
    const grade = gradePublicationCases([item], [], '{"publication":"done"}');
    expect(grade.pass).toBe(false); expect(grade.failures).toContain("standing:publication-count-or-remote");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { createRun } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { reportPermission, resolveStanding } from "../../../plugins/vh-adlc/scripts/maintenance/authority";
import { beginCandidate, candidateSnapshot, commitCandidate } from "../../../plugins/vh-adlc/scripts/maintenance/report-candidate";
import { renderReport, saveReport } from "../../../plugins/vh-adlc/scripts/maintenance/report";
test("local-only grading observes an actual committed report ref with the Git ref glob", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-report-ref-grade-"));
  try {
    const transport = installRecordingTransport(root), item = createPublicationCase(root, "no-push", transport), config = loadSettings(item.invocation), run = createRun(config);
    const empty = { status: "complete", count: 0, pages: 1 }, inventory: any = { schema_version: 1, repository: config.repository, hostname: config.hostname, source_commit: run.header.source_commit, collected_at: run.header.created_at, scope: run.header.scope, requests: [], discovery: [], repositories: [{ repository: config.repository, identity: { id: 1, default_branch: item.branch }, pulls: [], dashboards: [], dependabot: { alerts: [], coverage: empty }, code_scanning: { alerts: [], coverage: empty }, coverage: { identity: { ...empty, count: 1 }, pulls: empty, dashboards: empty } }] };
    saveReport(config, run.header.run_id, renderReport(config, run, inventory), { default_commit: item.base, draft: true });
    const standing = resolveStanding(config, { default_branch: item.branch, default_commit: item.base });
    const path = `reports/${run.header.created_at.slice(0,10)}-dependency-sweep.md`, authority = reportPermission(config, standing, { authorized_sweep: true, no_push: true }, { run_id: run.header.run_id, report_path: path });
    const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: item.base });
    const generated = Bun.spawnSync([process.execPath, "scripts/generate-index.ts", candidate.report_path], { cwd: candidate.worktree, stdout: "pipe", stderr: "pipe" }); expect(generated.exitCode).toBe(0);
    const check = Bun.spawnSync([process.execPath, "scripts/check-report.ts"], { cwd: candidate.worktree, stdout: "pipe", stderr: "pipe" }); expect(check.exitCode).toBe(0);
    commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: [process.execPath, "scripts/check-report.ts"], exit_code: check.exitCode, input_digest: candidateSnapshot(candidate) }], generated_indexes: { base: item.base, paths: ["reports/README.md"], input: "committed-base-plus-report", generator: [process.execPath, "scripts/generate-index.ts", candidate.report_path] } });
    const grade = gradePublicationCases([item], [], "local-only report retained"); expect(grade.pass).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
