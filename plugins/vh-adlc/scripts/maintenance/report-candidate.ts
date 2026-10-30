import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, relative, sep } from "node:path";
import { origin } from "../triage/settings";
import { appendRun, canonicalJSON, digest, privateDirectory, publishBytes, readRun, runID, syncDirectory, type JSONObject, type Run } from "./journal";
import { commitID, gitBytes, parseObservation } from "./history";
import { reportPermission, repositoryPath, resolveStanding, type ReportPermission } from "./authority";
import { reserveReport } from "./report";
import type { Settings } from "./types";

export type Candidate = { step_id: string; run_id: string; worktree: string; ref: string; base: string; report_path: string; report_digest: string;
  allowed_paths: string[]; permission_binding: string; archive_path: string; archive_digest: string; state: "intent" | "prepared" | "committed";
  original: { path: string; digest: string; inode: string } | null; refresh_of: string | null; commit?: string; tree?: string; input_digest?: string };
export type Check = { argv: string[]; exit_code: number; input_digest: string };
function fail(message: string): never { throw Error(`maintenance candidate: ${message}`); }
function command(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) fail(`Git ${args[0]} failed; inspect and reconcile owned state`);
  return result.stdout.toString().trim();
}
function success(root: string, ...args: string[]) {
  return Bun.spawnSync(["git", "-C", root, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, stdout: "pipe", stderr: "pipe" }).exitCode === 0;
}
function worktrees(root: string) {
  return gitBytes(root, "worktree", "list", "--porcelain", "-z").toString().split("\0\0").filter(Boolean).map(block => {
    const fields = block.split("\0"), path = fields.find(field => field.startsWith("worktree "))?.slice(9), branch = fields.find(field => field.startsWith("branch "))?.slice(7);
    if (!path) fail("unreadable worktree identity"); return { path, branch };
  });
}
function file(path: string) {
  const info = lstatSync(path); if (!info.isFile() || info.isSymbolicLink()) fail("report is not a regular owned file");
  const bytes = readFileSync(path); return { bytes, digest: digest(bytes), inode: `${info.dev}:${info.ino}` };
}
function safeOutput(worktree: string, path: string): string {
  repositoryPath(path);
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    const absolute = join(worktree, ...parts.slice(0, index + 1));
    let info; try { info = lstatSync(absolute); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") break; throw error; }
    if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) fail("unsafe output path/ancestor in candidate");
  }
  return join(worktree, path);
}
function permission(config: Settings, authority: ReportPermission, run: Run) {
  if (authority.run_id !== run.header.run_id || authority.repository !== config.repository || authority.hostname !== config.hostname) fail("permission identity mismatch");
  const expected = reportPermission(config, authority.standing, authority.request, { run_id: authority.run_id, report_path: authority.report_path, later_update: authority.later_update });
  if (canonicalJSON(expected) !== canonicalJSON(authority)) fail("permission payload changed");
  const fresh = resolveStanding(config, { default_branch: authority.branch, default_commit: command(config.root, "rev-parse", `refs/remotes/origin/${authority.branch}`) });
  if (fresh.default_commit !== authority.default_commit || canonicalJSON(fresh.sources) !== canonicalJSON(authority.standing.sources) || canonicalJSON(fresh.grant) !== canonicalJSON(authority.standing.grant)) fail("instruction/default source changed; refresh authority first");
  if (run.settings_changed) fail("settings changed; reconcile run first");
}
function candidate(run: Run, step: string): Candidate {
  runID(step);
  const operation = run.state.operations.find(op => op.kind === "report-candidate" && op.step_id === step);
  if (!operation || !operation.candidate) fail("candidate absent from this run");
  return operation.candidate as unknown as Candidate;
}
function withCandidate(run: Run, value: Candidate): JSONObject[] {
  return run.state.operations.map(op => op.kind === "report-candidate" && op.step_id === value.step_id ? { ...op, candidate: value as unknown as JSONObject } : op);
}
function identity(config: Settings, run: Run, value: Candidate) {
  if (value.run_id !== run.header.run_id || !worktrees(config.root).some(row => row.path === value.worktree && row.branch === `refs/heads/${value.ref}`) ||
      realpathSync(command(value.worktree, "rev-parse", "--path-format=absolute", "--git-common-dir")) !== run.header.git_common_dir ||
      command(value.worktree, "symbolic-ref", "--quiet", "HEAD") !== `refs/heads/${value.ref}`) fail("owned worktree/ref identity changed");
  const remote = origin(value.worktree);
  if (remote.repository.toLowerCase() !== config.repository || remote.hostname !== config.hostname) fail("candidate origin changed");
}
function changedPaths(root: string) {
  return [...new Set([...gitBytes(root, "diff", "--name-only", "-z", "HEAD").toString().split("\0"),
    ...gitBytes(root, "ls-files", "--others", "--exclude-standard", "-z").toString().split("\0")].filter(Boolean))].sort();
}
export function candidateSnapshot(value: Candidate): string {
  const rows = changedPaths(value.worktree).map(path => {
    const absolute = join(value.worktree, path);
    if (!existsSync(absolute)) return { path, missing: true };
    const info = lstatSync(absolute);
    if (!info.isFile() && !info.isSymbolicLink()) fail("unexpected changed directory");
    return { path, mode: info.mode & 0o111, digest: digest(info.isSymbolicLink() ? readlinkSync(absolute) : readFileSync(absolute)) };
  });
  return digest(canonicalJSON({ base: command(value.worktree, "rev-parse", "HEAD"), rows }));
}
function assertDelta(before: string, after: string, run: Run) {
  const parse = (text: string) => {
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/); if (!match) fail("missing report metadata");
    const value = Bun.YAML.parse(match[1]) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid report metadata");
    const fields = [...match[1].matchAll(/^([a-z_][a-z0-9_-]*):/gmi)].map(item => item[1]);
    if (new Set(fields).size !== fields.length) fail("duplicate report metadata");
    if (value.run_id !== run.header.run_id || value.repository !== run.header.repository || value.hostname !== run.header.hostname || canonicalJSON(value.scope) !== canonicalJSON(run.header.scope)) fail("report run identity changed");
    for (const field of ["status", "status_description"]) { if (typeof value[field] !== "string") fail("mutable status must be scalar"); delete value[field]; }
    const observation = parseObservation(text); if (!observation || observation.run_id !== run.header.run_id) fail("missing owned observation");
    return { metadata: value, body: match[2], observation };
  };
  const old = parse(before), next = parse(after);
  if (canonicalJSON(old.metadata) !== canonicalJSON(next.metadata) || !next.body.startsWith(old.body) || canonicalJSON(old.observation) !== canonicalJSON(next.observation)) fail("report update rewrites immutable metadata or body history");
}
export function beginCandidate(config: Settings, id: string, authority: ReportPermission, options: { default_commit: string; refresh_of?: string }): Candidate {
  let run = readRun(config, id); permission(config, authority, run);
  if (!authority.commit) fail("no report commit authority");
  const base = commitID(config.root, options.default_commit);
  if (base !== authority.default_commit) fail("candidate base differs from fetched authority source");
  const reserved = reserveReport(config, id, base); run = readRun(config, id);
  if (reserved !== authority.report_path) fail("reserved path changed; refresh scoped artifact authority");
  const report = run.state.report;
  if (!report || typeof report.path !== "string" || typeof report.digest !== "string" || typeof report.inode !== "string") fail("saved report required");
  const source = file(report.path); if (source.digest !== report.digest || source.inode !== report.inode) fail("report changed; preserve original");
  if (options.refresh_of) {
    const previous = candidate(run, options.refresh_of);
    if (previous.refresh_of !== null) fail("repeated default-branch advancement; publication pending");
    if (previous.base === base) fail("refresh has no changed default base");
  }
  const unfinished = run.state.operations.find(op => op.kind === "report-candidate" && (op.candidate as unknown as Candidate)?.state === "intent");
  if (unfinished) {
    const value = unfinished.candidate as unknown as Candidate;
    if (value.base !== base || value.permission_binding !== authority.binding || value.report_path !== reserved || value.archive_digest !== source.digest ||
        value.archive_path !== join(run.run_dir, "archives", `report-${runID(value.step_id)}.md`)) fail("interrupted candidate inputs changed; reconcile before resuming");
    if (!existsSync(value.archive_path)) publishBytes(value.archive_path, source.bytes);
    return resumeCandidate(config, run, value);
  }
  const step = randomUUID(), ref = `chore/maintenance-report-${id}-${step}`, path = join(dirname(config.root), `.vh-adlc-maintenance-${basename(config.root)}-${id}-${step}`);
  if (existsSync(path) || success(config.root, "show-ref", "--verify", `refs/heads/${ref}`) || worktrees(config.root).some(row => path === row.path || path.startsWith(`${row.path}${sep}`))) fail("owned candidate path/ref collision");
  const archive = join(privateDirectory(run.run_dir, ["archives"], true), `report-${step}.md`);
  let original: Candidate["original"] = null;
  if (report.kind === "checkout-draft") {
    const rel = relative(config.root, report.path).split(sep).join("/"); repositoryPath(rel);
    if (command(config.root, "status", "--porcelain=v1", "--untracked-files=all", "--", rel) !== `?? ${rel}` || success(config.root, "ls-files", "--error-unmatch", "--", rel)) fail("original report is staged/tracked or changed; promotion blocked");
    original = { path: report.path, digest: source.digest, inode: source.inode };
  }
  const value: Candidate = { step_id: step, run_id: id, worktree: path, ref, base, report_path: reserved, report_digest: source.digest,
    allowed_paths: [...new Set([reserved, ...authority.index_paths])], permission_binding: authority.binding, archive_path: archive, archive_digest: source.digest,
    original, refresh_of: options.refresh_of ?? null, state: "intent" };
  run = appendRun(config, id, run, { ...run.state, authority: authority as unknown as JSONObject,
    operations: [...run.state.operations, { kind: "report-candidate", step_id: step, candidate: value as unknown as JSONObject }],
    owned_locations: [...run.state.owned_locations, { role: "report", repository: config.repository, base, owner_path: config.root, path, ref, step_id: step }] }, "intent");
  publishBytes(archive, source.bytes);
  return resumeCandidate(config, run, value);
}
function resumeCandidate(config: Settings, run: Run, value: Candidate): Candidate {
  if (file(value.archive_path).digest !== value.archive_digest) fail("candidate archive changed or missing; reconcile intent");
  if (!existsSync(value.worktree)) {
    if (success(config.root, "show-ref", "--verify", `refs/heads/${value.ref}`)) {
      if (command(config.root, "rev-parse", value.ref) !== value.base) fail("interrupted owned ref changed");
      command(config.root, "worktree", "add", value.worktree, value.ref);
    } else command(config.root, "worktree", "add", "-b", value.ref, value.worktree, value.base);
  }
  identity(config, run, value);
  if (command(value.worktree, "rev-parse", "HEAD") !== value.base) fail("unexpected commit during candidate preparation; reconcile");
  for (const path of value.allowed_paths) safeOutput(value.worktree, path);
  const target = safeOutput(value.worktree, value.report_path), bytes = readFileSync(value.archive_path);
  if (existsSync(target)) {
    const existing = file(target);
    assertDelta(existing.bytes.toString(), bytes.toString(), run);
    if (existing.digest !== digest(bytes)) writeFileSync(target, bytes);
  } else { mkdirSync(dirname(target), { recursive: true }); publishBytes(target, bytes); }
  const prepared: Candidate = { ...value, state: "prepared" };
  appendRun(config, run.header.run_id, run, { ...run.state, operations: withCandidate(run, prepared) }, "receipt");
  return prepared;
}
function validateCommit(config: Settings, run: Run, value: Candidate, commit: string, expectedTree: string) {
  if (command(value.worktree, "rev-parse", "HEAD") !== commit) fail("owned candidate ref changed after verification");
  if (file(value.archive_path).digest !== value.archive_digest) fail("candidate archive changed");
  if (command(value.worktree, "rev-parse", `${commit}^`) !== value.base || command(value.worktree, "rev-parse", `${commit}^{tree}`) !== expectedTree) fail("unexpected candidate history/tree");
  const message = gitBytes(value.worktree, "show", "-s", "--format=%B", commit).toString();
  if (!message.includes(`\nMaintenance-Run: ${run.header.run_id}\n`) || !message.includes(`\nMaintenance-Step: ${value.step_id}\n`)) fail("candidate commit identity trailers absent");
  const changed = gitBytes(value.worktree, "diff", "--name-only", "-z", value.base, commit).toString().split("\0").filter(Boolean);
  if (!changed.includes(value.report_path) || changed.some(path => !value.allowed_paths.includes(path))) fail("outgoing candidate contains unrelated paths");
  const actual = gitBytes(value.worktree, "show", `${commit}:${value.report_path}`).toString();
  assertDelta(readFileSync(value.archive_path, "utf8"), actual, run);
  if (command(value.worktree, "status", "--porcelain")) fail("hook or concurrent writer left candidate changes");
}
export function commitCandidate(config: Settings, id: string, step: string, options: { checks: Check[]; skip_ci?: boolean; generated_indexes?: { base: string; paths: string[]; input: "committed-base-plus-report"; generator: string[] } }): Candidate {
  let run = readRun(config, id), value = candidate(run, step); identity(config, run, value);
  const authority = run.state.authority as unknown as ReportPermission; permission(config, authority, run);
  if (!authority.commit || value.permission_binding !== authority.binding) fail("candidate authority changed");
  const head = command(value.worktree, "rev-parse", "HEAD");
  if (head !== value.base) {
    if (!value.tree) fail("unrecorded candidate commit; explicit reconciliation required");
    validateCommit(config, run, value, head, value.tree);
    if (value.commit && value.commit !== head) fail("candidate commit changed");
  } else {
    for (const path of value.allowed_paths) safeOutput(value.worktree, path);
    const changed = changedPaths(value.worktree);
    if (!changed.includes(value.report_path) || changed.some(path => !value.allowed_paths.includes(path))) fail("candidate contains unrelated or missing report changes");
    const snapshot = candidateSnapshot(value);
    if (!Array.isArray(options.checks) || !options.checks.length || options.checks.some(check => !Array.isArray(check.argv) || !check.argv.length || check.argv.some(arg => typeof arg !== "string" || arg.includes("\0")) || check.exit_code !== 0 || check.input_digest !== snapshot)) fail("missing, failed or stale required checks");
    const indexes = changed.filter(path => path !== value.report_path);
    if (indexes.length) {
      const provenance = options.generated_indexes;
      if (!provenance || provenance.base !== value.base || provenance.input !== "committed-base-plus-report" || !provenance.generator.length || canonicalJSON([...provenance.paths].sort()) !== canonicalJSON(indexes)) fail("generated index provenance missing");
    }
    assertDelta(readFileSync(value.archive_path, "utf8"), file(join(value.worktree, value.report_path)).bytes.toString(), run);
    command(value.worktree, "add", "--", ...changed);
    const staged = gitBytes(value.worktree, "diff", "--cached", "--name-only", "-z").toString().split("\0").filter(Boolean);
    if (staged.some(path => !value.allowed_paths.includes(path)) || candidateSnapshot(value) !== snapshot) fail("candidate changed while staging");
    const tree = command(value.worktree, "write-tree"); value = { ...value, tree, input_digest: snapshot };
    run = appendRun(config, id, run, { ...run.state, operations: withCandidate(run, value), checks: [...run.state.checks, ...options.checks.map(check => ({ step_id: step, ...check }))] }, "intent");
    const subject = `docs: ${authority.later_update ? "update" : "record"} maintenance sweep${options.skip_ci ? " [skip ci]" : ""}`;
    command(value.worktree, "commit", "-m", `${subject}\n\nMaintenance-Run: ${id}\nMaintenance-Step: ${step}`, "--", ...changed);
    validateCommit(config, run, value, command(value.worktree, "rev-parse", "HEAD"), tree);
  }
  const committed: Candidate = { ...value, state: "committed", commit: command(value.worktree, "rev-parse", "HEAD") };
  const report = file(join(value.worktree, value.report_path));
  appendRun(config, id, run, { ...run.state, operations: withCandidate(run, committed), report: { ...run.state.report, kind: "candidate", path: join(value.worktree, value.report_path),
    relative_path: value.report_path, digest: report.digest, inode: report.inode, saved: true, candidate_step: step, commit: committed.commit!, base: value.base,
    archive_path: value.archive_path, pending_publication: true, published: false } }, "receipt");
  return committed;
}
export function promoteOriginal(config: Settings, id: string, step: string) {
  let run = readRun(config, id); const value = candidate(run, step);
  if (value.state !== "committed" || !value.commit || !value.tree) fail("verified report commit required before promotion");
  identity(config, run, value); validateCommit(config, run, value, value.commit, value.tree);
  if (!value.original) return;
  if (file(value.archive_path).digest !== value.archive_digest) fail("promotion archive changed");
  const original = value.original, path = relative(config.root, original.path).split(sep).join("/"); repositoryPath(path);
  const operation = run.state.operations.find(op => op.kind === "report-promotion" && op.step_id === step);
  if (!existsSync(original.path)) {
    if (!operation) fail("original disappeared without promotion intent");
    if (operation.state !== "receipt") appendRun(config, id, run, { ...run.state, operations: run.state.operations.map(op => op === operation ? { ...op, state: "receipt" } : op) }, "receipt");
    return;
  }
  const actual = file(original.path);
  if (actual.digest !== original.digest || actual.inode !== original.inode || command(config.root, "status", "--porcelain=v1", "--untracked-files=all", "--", path) !== `?? ${path}` || success(config.root, "ls-files", "--error-unmatch", "--", path)) fail("original report edited, staged or replaced; promotion blocked");
  if (!operation) run = appendRun(config, id, run, { ...run.state, operations: [...run.state.operations, { kind: "report-promotion", step_id: step, state: "intent", path: original.path, digest: original.digest, inode: original.inode }] }, "intent");
  const recheck = file(original.path); if (recheck.digest !== original.digest || recheck.inode !== original.inode) fail("concurrent original edit");
  unlinkSync(original.path); syncDirectory(dirname(original.path));
  appendRun(config, id, run, { ...run.state, operations: run.state.operations.map(op => op.kind === "report-promotion" && op.step_id === step ? { ...op, state: "receipt" } : op) }, "receipt");
}
export function publicationReadiness(config: Settings, id: string, step: string, authority: ReportPermission, options: { known_blocker?: string } = {}) {
  const run = readRun(config, id), value = candidate(run, step);
  let observed: Record<string, unknown> = {};
  const pending = (reason: string, details: Record<string, unknown> = {}) => ({ ready: false, reason, candidate: value, ...observed, ...details });
  permission(config, authority, run);
  if (!value.commit || !value.tree || value.state !== "committed") return pending(authority.push ? "verified candidate commit required" : "report publication not authorized by current request");
  identity(config, run, value); validateCommit(config, run, value, value.commit, value.tree);
  const checkouts = worktrees(config.root).filter(row => row.branch === `refs/heads/${authority.branch}`);
  const main = checkouts.length === 1 ? checkouts[0].path : null;
  let head = "", remote = "";
  if (main) {
    head = command(main, "rev-parse", "HEAD"); remote = command(main, "rev-parse", `refs/remotes/origin/${authority.branch}`);
    const transferred = success(main, "merge-base", "--is-ancestor", value.commit, head), remoteContains = success(main, "merge-base", "--is-ancestor", value.commit, remote);
    observed = { main, head, remote, transferred, remote_contains: remoteContains,
      ...(transferred && !remoteContains ? { pending_commit: value.commit, exposure_warning: "The already authorized report commit remains on the shared default branch. A future ordinary push can carry it, including any [skip ci] marker; reconcile this existing history before further publication." } : {}) };
  }
  // Restrictions govern the next effect; they cannot hide a commit already transferred to shared main.
  if (!authority.push) return pending("report publication not authorized by current request; reconcile any existing transferred state");
  if (value.permission_binding !== authority.binding) return pending("candidate authority changed; reconcile");
  if (!main) return pending("owning default-branch checkout unavailable; local candidate retained");
  if (options.known_blocker) return pending(`known publication refusal: ${options.known_blocker}`);
  if (command(main, "status", "--porcelain=v1", "--untracked-files=all", "--", ...value.allowed_paths)) return pending("overlapping report/index working or staged changes");
  if (observed.remote_contains) return pending("candidate already contained remotely; reconcile publication receipt without another push");
  if (remote !== value.base) return pending("default branch advanced; prepare one fresh candidate without rewriting the old ref");
  if (head !== value.base && head !== value.commit) return pending("default checkout has unrelated outgoing history, divergence or needs ff-only synchronization");
  return { ready: true, reason: head === value.commit ? "already transferred; reconcile before retrying push" : "candidate may fast-forward only from the owning default-branch checkout",
    candidate: value, ...observed };
}
