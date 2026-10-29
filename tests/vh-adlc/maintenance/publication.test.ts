import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { resolveStanding, reportPermission, type Standing } from "../../../plugins/vh-adlc/scripts/maintenance/authority";
import { beginCandidate, candidateSnapshot, commitCandidate, publicationReadiness, promoteOriginal } from "../../../plugins/vh-adlc/scripts/maintenance/report-candidate";
import { appendRun, createRun, readRun } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { renderReport, reserveReport, saveReport } from "../../../plugins/vh-adlc/scripts/maintenance/report";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import type { Inventory } from "../../../plugins/vh-adlc/scripts/maintenance/collect";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function project() { const f = fixture(); projects.push(f); return f; }
const fields = { repository: "example/project", hostname: "github.com", branch: "main", publication_route: "default-branch-checkout-ff-only", report_dir: "reports", index_paths: "[]", initial_publication: "commit-and-push-before-selection", same_run_updates: "commit-and-push" };
function declaration(overrides: Record<string, string> = {}) { return "## Standing maintenance report publication\n\n| Field | Value |\n| --- | --- |\n" + Object.entries({ ...fields, ...overrides }).map(([key, value]) => `| ${key} | ${value} |`).join("\n") + "\n"; }
function adopted(f: ReturnType<typeof fixture>, overrides: Record<string, string> = {}) {
  f.write("AGENTS.md", "Use [maintenance settings](.vh-adlc/maintenance.json).\n");
  f.settings({ schema_version: 1, report_dir: "reports", project_procedure: "maintenance-project.md" });
  f.write("maintenance-project.md", declaration(overrides));
  git(f.root, "add", "AGENTS.md", ".vh-adlc/maintenance.json", "maintenance-project.md"); git(f.root, "commit", "-qm", "docs: adopt report publication");
  const commit = git(f.root, "rev-parse", "HEAD"), branch = git(f.root, "branch", "--show-current");
  git(f.root, "update-ref", `refs/remotes/origin/${branch}`, commit);
  const config = loadSettings(f.root), standing = resolveStanding(config, { default_branch: branch, default_commit: commit });
  return { config, standing, commit, branch };
}
function permission(c: ReturnType<typeof loadSettings>, standing: Standing, id: string, options: Record<string, unknown> = {}) {
  return reportPermission(c, standing, { authorized_sweep: true, ...options }, { run_id: id, report_path: `${c.report_dir}/2026-10-29-dependency-sweep.md` });
}
function saved(f: ReturnType<typeof fixture>, c: ReturnType<typeof loadSettings>) {
  const run = createRun(c, { at: "2026-10-29T12:00:00.000Z" }), source = run.header.source_commit, empty = { status: "complete" as const, count: 0, pages: 1 };
  const inventory: Inventory = { schema_version: 1, hostname: c.hostname, repository: c.repository, source_commit: source, collected_at: run.header.created_at,
    scope: run.header.scope, requests: [], discovery: [], repositories: [{ repository: c.repository, identity: { id: 1, default_branch: "main" }, pulls: [], dashboards: [],
      dependabot: { alerts: [], coverage: empty }, code_scanning: { alerts: [], coverage: empty }, coverage: { identity: { ...empty, count: 1 }, pulls: empty, dashboards: empty } }] };
  const report = saveReport(c, run.header.run_id, renderReport(c, run, inventory), { default_commit: source });
  return { run, report };
}

test("only the committed default-branch instruction chain supplies an adopted grant", () => {
  const f = project(), { config, standing, commit } = adopted(f);
  expect(standing.status).toBe("adopted"); expect(standing.default_commit).toBe(commit);
  expect(standing.sources.map(source => source.path)).toEqual(["AGENTS.md", ".vh-adlc/maintenance.json", "maintenance-project.md"]);
  expect(standing.sources.every(source => /^[a-f0-9]{40,64}$/.test(source.blob))).toBe(true);
  f.write("maintenance-project.md", declaration({ repository: "other/project" }));
  expect(resolveStanding(config, { default_branch: "main", default_commit: commit })).toEqual(standing);
  git(f.root, "switch", "-qc", "feature-local-policy"); git(f.root, "add", "maintenance-project.md"); git(f.root, "commit", "-qm", "docs: unadopted change");
  expect(resolveStanding(config, { default_branch: "main", default_commit: commit })).toEqual(standing);
});

test("a declaration present only on the feature branch or an uncommitted main edit grants nothing", () => {
  const f = project(), base = git(f.root, "rev-parse", "HEAD");
  const { config } = adopted(f); git(f.root, "update-ref", "refs/remotes/origin/main", base);
  expect(resolveStanding(config, { default_branch: "main", default_commit: base }).status).toBe("unadopted");
  expect(() => resolveStanding(config, { default_branch: "main", default_commit: git(f.root, "rev-parse", "HEAD") })).toThrow("tracking");
});

test("declaration validation rejects missing, unknown, duplicate, unsafe and mismatched fields", () => {
  for (const change of [{ publication_route: "" }, { publication_route: "push-from-anywhere" }, { repository: "other/project" }, { hostname: "other.example" }, { branch: "other" },
    { report_dir: "../other" }, { report_dir: "reports/*" }, { index_paths: '["docs/**"]' }, { index_paths: '["../README.md"]' }, { initial_publication: "always" }, { same_run_updates: "always" }, { extra: "unknown" }]) {
    const f = project(), { config, commit } = adopted(f, change);
    expect(resolveStanding(config, { default_branch: "main", default_commit: commit }).status).not.toBe("adopted");
  }
  const f = project(); adopted(f); f.write("maintenance-project.md", declaration() + "| repository | example/project |\n");
  git(f.root, "add", "maintenance-project.md"); git(f.root, "commit", "-qm", "docs: ambiguous field");
  const commit = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  expect(resolveStanding(loadSettings(f.root), { default_branch: "main", default_commit: commit }).status).toBe("invalid");
});

test("missing and example-only adoption links do not authorize publication", () => {
  for (const contents of ["No adopted maintenance route.\n", "```md\n[settings](.vh-adlc/maintenance.json)\n```\n", "<!-- [settings](.vh-adlc/maintenance.json) -->\n"]) {
    const f = project(); adopted(f); f.write("AGENTS.md", contents); git(f.root, "add", "AGENTS.md"); git(f.root, "commit", "-qm", "docs: no live adoption link");
    const commit = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", commit);
    expect(resolveStanding(loadSettings(f.root), { default_branch: "main", default_commit: commit }).status).toBe("unadopted");
  }
});

test("the same opt-in works on another default branch and every current restriction wins", () => {
  const f = project(); git(f.root, "branch", "-m", "trunk");
  const { config, standing } = adopted(f, { branch: "trunk" }), run = createRun(config);
  expect(standing.status).toBe("adopted");
  expect(permission(config, standing, run.header.run_id)).toMatchObject({ commit: true, push: true, save: "checkout" });
  expect(permission(config, standing, run.header.run_id, { no_push: true })).toMatchObject({ commit: true, push: false });
  for (const restriction of ["read_only", "draft_only", "no_commit"]) expect(permission(config, standing, run.header.run_id, { [restriction]: true })).toMatchObject({ commit: false, push: false, save: "draft" });
  expect(permission(config, standing, run.header.run_id, { no_filesystem: true })).toMatchObject({ commit: false, push: false, save: "chat" });
  expect(permission(config, standing, run.header.run_id, { authorized_sweep: false })).toMatchObject({ commit: false, push: false });
});

test("generic explicit commit has no push; explicit publication binds the exact artifact and destination", () => {
  const f = project(), config = loadSettings(f.root), commit = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  const standing = resolveStanding(config, { default_branch: "main", default_commit: commit }), run = createRun(config), path = `${config.report_dir}/2026-10-29-dependency-sweep.md`;
  expect(permission(config, standing, run.header.run_id)).toMatchObject({ commit: false, push: false });
  expect(permission(config, standing, run.header.run_id, { commit_report: true })).toMatchObject({ commit: true, push: false });
  const publication = { repository: config.repository, hostname: config.hostname, branch: "main", publication_route: "default-branch-checkout-ff-only", report_path: path, index_paths: [] };
  expect(permission(config, standing, run.header.run_id, { publication })).toMatchObject({ commit: true, push: true, basis: "current-request" });
  for (const change of [{ branch: "other" }, { repository: "other/project" }, { report_path: "reports/another.md" }, { publication_route: "direct-push" }]) {
    expect(permission(config, standing, run.header.run_id, { publication: { ...publication, ...change } }).push).toBe(false);
  }
});

test("later updates do not inherit a declaration that requires an explicit request", () => {
  const f = project(), { config, standing } = adopted(f, { same_run_updates: "explicit-request" }), run = createRun(config);
  const scope = { run_id: run.header.run_id, report_path: `${config.report_dir}/2026-10-29-dependency-sweep.md`, later_update: true };
  expect(reportPermission(config, standing, { authorized_sweep: true }, scope).push).toBe(false);
});

test("an authorized report commit is isolated from a dirty unrelated invocation branch", () => {
  const f = project(), { config, standing, commit } = adopted(f); git(f.root, "switch", "-qc", "unrelated-feature");
  f.write("src/app.ts", "another session\n"); git(f.root, "add", "src/app.ts"); f.write("untracked.txt", "keep\n");
  const { run, report } = saved(f, config), index = readFileSync(join(f.root, ".git/index")), state = git(f.root, "status", "--porcelain");
  const authority = permission(config, standing, run.header.run_id, { no_push: true });
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const snapshot = candidateSnapshot(candidate);
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["fixture-required-check"], exit_code: 0, input_digest: snapshot }], skip_ci: true });
  expect(result.commit).not.toBe(commit);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(commit); expect(git(f.root, "status", "--porcelain")).toBe(state);
  expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
  expect(git(candidate.worktree, "show", "--format=", "--name-only", "HEAD")).toBe(candidate.report_path);
  expect(readFileSync(join(candidate.worktree, candidate.report_path), "utf8")).toBe(readFileSync(report.path, "utf8"));
  expect(publicationReadiness(config, run.header.run_id, result.step_id, authority).ready).toBe(false);
});

test("no default-branch checkout leaves the candidate local and never switches or directly pushes", () => {
  const f = project(), { config, standing, commit } = adopted(f); git(f.root, "switch", "-qc", "only-feature-checkout");
  const { run } = saved(f, config), authority = permission(config, standing, run.header.run_id), candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }] });
  const readiness = publicationReadiness(config, run.header.run_id, result.step_id, authority);
  expect(readiness.ready).toBe(false); expect(readiness.reason).toContain("default-branch checkout");
  expect(git(f.root, "branch", "--show-current")).toBe("only-feature-checkout");
  expect(git(f.root, "rev-parse", "main")).toBe(commit);
});

test("candidate commit recovery finds its exact existing commit instead of creating another", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit }), checks = [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }];
  const first = commitCandidate(config, run.header.run_id, candidate.step_id, { checks });
  const second = commitCandidate(config, run.header.run_id, candidate.step_id, { checks });
  expect(second.commit).toBe(first.commit); expect(git(candidate.worktree, "rev-list", "--count", `${commit}..HEAD`)).toBe("1");
});

test("changed candidate inputs and unrelated files cannot hide behind earlier checks", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit }), input_digest = candidateSnapshot(candidate);
  f.write("other.txt", "unrelated original\n");
  const file = join(candidate.worktree, "src/app.ts"); writeFileSync(file, "unexpected repair\n");
  expect(() => commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest }] })).toThrow();
  expect(git(candidate.worktree, "rev-parse", "HEAD")).toBe(commit);
});

test("promotion archives and removes only this run's unchanged untracked original", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run, report } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  f.write("another.md", "keep\n"); const original = readFileSync(report.path);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }] });
  promoteOriginal(config, run.header.run_id, result.step_id);
  expect(existsSync(report.path)).toBe(false); expect(readFileSync(join(f.root, "another.md"), "utf8")).toBe("keep\n");
  const state = readRun(config, run.header.run_id);
  expect(readFileSync(String(state.state.report?.archive_path))).toEqual(original);
  expect(publicationReadiness(config, run.header.run_id, result.step_id, authority).ready).toBe(true);
});

test("an actual interrupted Git commit resumes from trailers and tree without a duplicate", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const hookDir = join(f.root, ".git/fixture-hooks"); mkdirSync(hookDir);
  const hook = join(hookDir, "post-commit"); writeFileSync(hook, '#!/bin/sh\nkill -KILL "$PPID"\n', { mode: 0o700 });
  git(f.root, "config", "core.hooksPath", hookDir);
  expect(() => commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }] })).toThrow("Git commit failed");
  const interrupted = git(candidate.worktree, "rev-parse", "HEAD"); expect(interrupted).not.toBe(commit);
  git(f.root, "config", "core.hooksPath", "/dev/null");
  const result = Bun.spawnSync([process.execPath, "-e", `import{writeSync}from'node:fs';import{loadSettings}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/maintenance/settings.ts"))};import{commitCandidate}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/maintenance/report-candidate.ts"))};writeSync(1,JSON.stringify(commitCandidate(loadSettings(${JSON.stringify(f.root)}),${JSON.stringify(run.header.run_id)},${JSON.stringify(candidate.step_id)},{checks:[]})));`], { stdout: "pipe", stderr: "pipe" });
  expect({ exit: result.exitCode, error: result.stderr.toString() }).toEqual({ exit: 0, error: "" });
  expect(JSON.parse(result.stdout.toString()).commit).toBe(interrupted);
  expect(git(candidate.worktree, "rev-list", "--count", `${commit}..HEAD`)).toBe("1");
});

test("dirty target indexes and known protection refusals leave main and its index unchanged", () => {
  const f = project(), { config, standing, commit } = adopted(f, { index_paths: '["README.md"]' }), { run } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }] });
  promoteOriginal(config, run.header.run_id, result.step_id);
  f.write("README.md", "another session's staged index\n"); git(f.root, "add", "README.md");
  const index = readFileSync(join(f.root, ".git/index")), status = git(f.root, "status", "--porcelain");
  expect(publicationReadiness(config, run.header.run_id, result.step_id, authority).reason).toContain("overlapping");
  expect(publicationReadiness(config, run.header.run_id, result.step_id, authority, { known_blocker: "observed protected branch refusal" }).reason).toContain("refusal");
  expect(git(f.root, "rev-parse", "HEAD")).toBe(commit); expect(git(f.root, "status", "--porcelain")).toBe(status);
  expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
});

test("edited or staged original reports block promotion without capturing or erasing their changes", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run, report } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }] });
  writeFileSync(report.path, readFileSync(report.path, "utf8") + "external update\n"); git(f.root, "add", authority.report_path);
  const index = readFileSync(join(f.root, ".git/index"));
  expect(() => promoteOriginal(config, run.header.run_id, result.step_id)).toThrow("promotion blocked");
  expect(readFileSync(report.path, "utf8")).toEndWith("external update\n"); expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
});

test("one candidate refresh preserves old refs and a late collision keeps both reports' bytes", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run, report } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const own = readFileSync(report.path), first = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const initial = commitCandidate(config, run.header.run_id, first.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(first) }] });
  promoteOriginal(config, run.header.run_id, first.step_id);
  f.write(first.report_path, "other host's published report\n"); git(f.root, "add", first.report_path); git(f.root, "commit", "-qm", "docs: concurrent report");
  const nextBase = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", nextBase);
  const path = reserveReport(config, run.header.run_id, nextBase), nextStanding = resolveStanding(config, { default_branch: "main", default_commit: nextBase });
  const nextAuthority = reportPermission(config, nextStanding, { authorized_sweep: true }, { run_id: run.header.run_id, report_path: path });
  const refreshed = beginCandidate(config, run.header.run_id, nextAuthority, { default_commit: nextBase, refresh_of: first.step_id });
  const second = commitCandidate(config, run.header.run_id, refreshed.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(refreshed) }] });
  expect(path).toContain(run.header.run_id); expect(readFileSync(join(second.worktree, path))).toEqual(own);
  expect(readFileSync(join(f.root, first.report_path), "utf8")).toBe("other host's published report\n");
  expect(git(f.root, "rev-parse", initial.ref)).toBe(initial.commit!);
  f.write("extra.md", "next default change\n"); git(f.root, "add", "extra.md"); git(f.root, "commit", "-qm", "docs: another default advance");
  const thirdBase = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", thirdBase);
  const thirdAuthority = reportPermission(config, resolveStanding(config, { default_branch: "main", default_commit: thirdBase }), { authorized_sweep: true }, { run_id: run.header.run_id, report_path: path });
  expect(() => beginCandidate(config, run.header.run_id, thirdAuthority, { default_commit: thirdBase, refresh_of: second.step_id })).toThrow("repeated");
  expect(git(f.root, "rev-parse", second.ref)).toBe(second.commit!);
});

test("an owned report ref moved after commit is a conflict rather than fresh publication proof", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }] });
  promoteOriginal(config, run.header.run_id, candidate.step_id);
  writeFileSync(join(candidate.worktree, "extra.md"), "changed owned source\n"); git(candidate.worktree, "add", "extra.md"); git(candidate.worktree, "commit", "-qm", "docs: changed candidate");
  expect(() => publicationReadiness(config, run.header.run_id, result.step_id, authority)).toThrow("changed");
});

test("generated indexes use committed documents plus this report and cannot include untracked source", () => {
  const f = project(); adopted(f, { index_paths: '["docs/README.md"]' });
  f.write("docs/old.md", "# Already committed, missing from the old index\n"); f.write("docs/README.md", "# Contents\n");
  git(f.root, "add", "docs"); git(f.root, "commit", "-qm", "docs: committed index drift");
  const commit = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  const config = loadSettings(f.root), standing = resolveStanding(config, { default_branch: "main", default_commit: commit }), { run } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  f.write("docs/unpublished.md", "# Must stay private\n");
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  expect(existsSync(join(candidate.worktree, "docs/unpublished.md"))).toBe(false);
  // The actual consumer keeps its generator; this synthetic generator has the same frozen-input boundary.
  const generator = [process.execPath, "-e", `import{readdirSync,writeFileSync}from'node:fs';writeFileSync('docs/README.md','# Contents\\n'+readdirSync('docs').filter(p=>p!=='README.md').join('\\n')+'\\n'+${JSON.stringify(candidate.report_path)}+'\\n');`];
  const generated = Bun.spawnSync(generator, { cwd: candidate.worktree, stdout: "pipe", stderr: "pipe" }); expect(generated.exitCode).toBe(0);
  const checks = [{ argv: ["synthetic-content-check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }];
  expect(() => commitCandidate(config, run.header.run_id, candidate.step_id, { checks })).toThrow("provenance");
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks, generated_indexes: { base: commit, paths: ["docs/README.md"], input: "committed-base-plus-report", generator } });
  const output = git(candidate.worktree, "show", `${result.commit}:docs/README.md`);
  expect(output).toContain("old.md"); expect(output).toContain(candidate.report_path); expect(output).not.toContain("unpublished");
  expect(readFileSync(join(f.root, "docs/README.md"), "utf8")).toBe("# Contents\n");
});

test("changed adopted instruction blobs block publication until authority is read again", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const candidate = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  const result = commitCandidate(config, run.header.run_id, candidate.step_id, { checks: [{ argv: ["check"], exit_code: 0, input_digest: candidateSnapshot(candidate) }] });
  promoteOriginal(config, run.header.run_id, candidate.step_id);
  f.write("maintenance-project.md", declaration({ same_run_updates: "explicit-request" })); git(f.root, "add", "maintenance-project.md"); git(f.root, "commit", "-qm", "docs: changed report authority");
  const advanced = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", advanced);
  expect(() => publicationReadiness(config, run.header.run_id, result.step_id, authority)).toThrow("source changed");
  expect(git(f.root, "rev-parse", "HEAD")).toBe(advanced);
});

test("declared output paths cannot traverse a committed symlink ancestor", () => {
  const f = project(); adopted(f, { index_paths: '["docs/README.md"]' });
  symlinkSync("../outside-the-checkout", join(f.root, "docs")); git(f.root, "add", "docs"); git(f.root, "commit", "-qm", "test: unsafe output ancestor");
  const commit = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  expect(resolveStanding(loadSettings(f.root), { default_branch: "main", default_commit: commit }).status).toBe("invalid");
});

test("an interrupted candidate intent before archive creation is resumable from its owned source", () => {
  const f = project(), { config, standing, commit } = adopted(f), { run, report } = saved(f, config), authority = permission(config, standing, run.header.run_id);
  const current = readRun(config, run.header.run_id), step = randomUUID(), ref = `chore/maintenance-report-${run.header.run_id}-${step}`;
  const worktree = join(dirname(f.root), `.vh-adlc-maintenance-${basename(f.root)}-${run.header.run_id}-${step}`), archive_path = join(run.run_dir, `archives/report-${step}.md`);
  mkdirSync(join(run.run_dir, "archives"), { mode: 0o700 });
  const candidate = { step_id: step, run_id: run.header.run_id, worktree, ref, base: commit, report_path: authority.report_path, report_digest: report.digest,
    allowed_paths: [authority.report_path], permission_binding: authority.binding, archive_path, archive_digest: report.digest, state: "intent", original: { path: report.path, digest: report.digest, inode: report.inode }, refresh_of: null };
  appendRun(config, run.header.run_id, current, { ...current.state, authority: authority as never, operations: [{ kind: "report-candidate", step_id: step, candidate }] }, "intent");
  const resumed = beginCandidate(config, run.header.run_id, authority, { default_commit: commit });
  expect(resumed.step_id).toBe(step); expect(resumed.state).toBe("prepared");
  expect(readFileSync(join(resumed.worktree, resumed.report_path))).toEqual(readFileSync(report.path));
});

test("a mismatched explicit current publication request never falls back to standing permission", () => {
  const f = project(), { config, standing } = adopted(f), run = createRun(config), path = `${config.report_dir}/2026-10-29-dependency-sweep.md`;
  const publication = { repository: "other/project", hostname: config.hostname, branch: "main", publication_route: "default-branch-checkout-ff-only", report_path: path, index_paths: [] };
  expect(permission(config, standing, run.header.run_id, { publication }).push).toBe(false);
});
