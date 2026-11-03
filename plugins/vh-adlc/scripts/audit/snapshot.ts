import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { inventory } from "./inventory";
import { loadSettings } from "./settings";
import type { AuditMode, Settings } from "./types";

export function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
export function digest(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable) :
    item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : item;
  return hash(JSON.stringify(stable(value)));
}
export function gitBytes(root: string, ...args: string[]): Buffer {
  const child = Bun.spawnSync(["git", "-C", root, ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, stdout: "pipe", stderr: "pipe",
  });
  if (child.exitCode !== 0) throw Error("audit cannot read Git " + args[0]);
  return Buffer.from(child.stdout);
}
export function git(root: string, ...args: string[]): string {
  return gitBytes(root, ...args).toString().trimEnd();
}
export function privateDirectory(path: string, checkout: string): string {
  const stat = lstatSync(path), canonical = realpathSync(path), root = realpathSync(checkout);
  const rel = relative(root, canonical);
  if (!stat.isDirectory() || stat.isSymbolicLink() || canonical !== path ||
      (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0 ||
      (!rel || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel)))) {
    throw Error("audit artifacts require an owned private directory outside the checkout");
  }
  return canonical;
}
function source(root: string) {
  const status = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all");
  const untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean).map(path => {
    const file = join(root, path), stat = lstatSync(file);
    return [path, stat.mode, stat.isSymbolicLink() ? hash(readlinkSync(file)) : stat.isFile() ? hash(readFileSync(file)) : "unsupported"];
  });
  let branch: string | null = null;
  try { branch = git(root, "symbolic-ref", "--quiet", "--short", "HEAD"); } catch { /* Detached exact targets have no branch. */ }
  return {
    commit: git(root, "rev-parse", "HEAD"), branch,
    clean: !status, diff_digest: digest([status, git(root, "diff", "--binary", "HEAD", "--"), untracked]),
  };
}
export type Snapshot = ReturnType<typeof captureSnapshot>;
export function captureSnapshot(config: Settings, options: {
  mode: AuditMode; ids?: string[]; artifact_root: string; baseline?: string; scope_baseline?: string; required_checks?: Record<string, string[]>;
}) {
  if (!["status", "reverify", "full", "fix"].includes(options.mode)) throw Error("unknown audit mode");
  const fresh = loadSettings(config.root, { settingsPath: config.settings_path });
  if (digest(fresh) !== digest(config)) throw Error("audit settings changed");
  const artifact_root = privateDirectory(options.artifact_root, config.root), observed = inventory(config);
  const selected_ids = options.ids ?? observed.findings.map(finding => finding.id);
  if (new Set(selected_ids).size !== selected_ids.length || selected_ids.some(id => !observed.findings.some(f => f.id === id))) throw Error("unknown or repeated audit IDs");
  const required_checks = options.required_checks ?? {};
  if (Object.entries(required_checks).some(([id, checks]) => !selected_ids.includes(id) || !Array.isArray(checks) ||
      new Set(checks).size !== checks.length || checks.some(check => typeof check !== "string" || !check.trim()))) throw Error("invalid required audit checks");
  if (options.baseline !== undefined && (typeof options.baseline !== "string" || !/^[a-f0-9]{40,64}$/.test(options.baseline))) throw Error("invalid audit comparison baseline");
  const target = source(config.root);
  let history: { status: "scoped" | "unscoped"; baseline: string | null; reason: string } = {
    status: "unscoped", baseline: options.baseline ?? null, reason: "No reachable comparison baseline was supplied; directly reassess selected findings.",
  };
  if (options.baseline && /^[a-f0-9]{40,64}$/.test(options.baseline)) {
    try {
      git(config.root, "cat-file", "-e", options.baseline + "^{commit}");
      git(config.root, "merge-base", "--is-ancestor", options.baseline, target.commit);
      history = { status: "scoped", baseline: options.baseline, reason: "Resolved ancestor of assessed source." };
    } catch { /* Missing, shallow and non-ancestor history all require direct reassessment. */ }
  }
  const scope_baseline = options.scope_baseline ?? (options.mode === "fix" ? history.status === "scoped" ? history.baseline : null : target.commit);
  if (scope_baseline) {
    if (!/^[a-f0-9]{40,64}$/.test(scope_baseline)) throw Error("invalid audit scope baseline");
    git(config.root, "merge-base", "--is-ancestor", scope_baseline, target.commit);
  }
  const body = {
    scope_baseline,
    schema_version: 1 as const, repository: config.repository, hostname: config.hostname,
    mode: options.mode, selected_ids: [...selected_ids], required_checks: structuredClone(required_checks), artifact_root,
    source: target, bindings: {
      settings: hash(readFileSync(join(config.root, config.settings_path))),
      ledger: hash(readFileSync(join(config.root, config.ledger_path))),
      procedure: hash(readFileSync(join(config.root, config.project_procedure))),
    }, inventory: observed, history,
  };
  return { ...body, digest: digest(body) };
}
export function checkSnapshot(config: Settings, snap: Snapshot): { current: boolean; reason: string } {
  try {
    const { digest: claimed, ...body } = snap;
    if (digest(body) !== claimed) return { current: false, reason: "Snapshot identity changed." };
    const current = captureSnapshot(loadSettings(config.root, { settingsPath: config.settings_path }), {
      mode: snap.mode, ids: snap.selected_ids, artifact_root: snap.artifact_root,
      baseline: snap.history.baseline ?? undefined, scope_baseline: snap.scope_baseline ?? undefined, required_checks: snap.required_checks,
    });
    return { current: current.digest === claimed, reason: current.digest === claimed ? "Current bindings match." : "Source or audit inputs changed." };
  } catch { return { current: false, reason: "Current audit inputs cannot be validated." }; }
}
