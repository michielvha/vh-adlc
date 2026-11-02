import { readFileSync } from "node:fs";
import { join } from "node:path";
import { origin } from "../triage/settings";
import { inventory, tableCells } from "./inventory";
import { loadSettings } from "./settings";
import { digest, git, gitBytes, hash } from "./snapshot";
import type { AuditMode, Settings } from "./types";

export type Effect = "source-edit" | "ledger-update" | "ledger-commit" | "local-commit" | "live-verify" | "issue-write" | "branch-push" | "pr-write" | "conditional-merge";
type Observed = { default_branch: string; default_commit: string };
type Request = { authorized: boolean; mode: AuditMode; ids: string[]; workstream?: string; eligible_repair?: boolean; effects?: Effect[] };
export type AuthorityOptions = { mode: AuditMode; ids: string[]; workstream?: string; effect: Effect; request: Request; no_fetch?: boolean;
  restrictions?: string[]; prohibited_effects?: Effect[]; refresh?: () => Observed };
const local = ["source-edit", "ledger-update", "local-commit"] as const;
const remote = ["live-verify", "issue-write", "branch-push", "pr-write", "conditional-merge"] as const;
const modes: Record<AuditMode, readonly Effect[]> = { status: [], reverify: ["ledger-update", "ledger-commit"], full: ["ledger-update", "ledger-commit"], fix: [...local, ...remote] };
const fields = ["repository", "hostname", "default_branch", "ledger_path", "status_effects", "reverify_effects", "full_effects", "fix_effects", "selection_policy", "verification_policy", "merge_policy"];
function fail(): never { throw Error("invalid audit authorization declaration"); }
function visible(input: string): string {
  let fence: string | null = null;
  return input.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split(/\r?\n/).map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = null; return ""; }
    return fence || /^(?: {4}|\t)/.test(line) ? "" : line;
  }).join("\n");
}
export function parseDeclaration(markdown: string, config: Settings, default_branch: string) {
  const input = visible(markdown), heading = /^## Standing audit workflow authorization[ \t]*$/gm;
  const found = [...input.matchAll(heading)];
  if (!found.length) return null;
  if (found.length !== 1 || [...input.matchAll(/^\|\s*Field\s*\|\s*Value\s*\|\s*$/gm)].length !== 1) fail();
  const section = input.slice(found[0].index! + found[0][0].length).split(/^#{1,2} /m)[0].trim();
  const lines = section.split("\n");
  if (!/^\|\s*Field\s*\|\s*Value\s*\|\s*$/.test(lines.shift() ?? "") ||
      !/^\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*$/.test(lines.shift() ?? "")) fail();
  const declaration: Record<string, string> = {};
  while (lines[0]?.trim().startsWith("|")) {
    const cells = tableCells(lines.shift()!);
    if (cells.length !== 2 || !cells[1] || !fields.includes(cells[0]) || Object.hasOwn(declaration, cells[0]) || /[`<>\x00-\x1f\x7f]/.test(cells[1])) fail();
    declaration[cells[0]] = cells[1];
  }
  if (Object.keys(declaration).length !== fields.length || declaration.repository !== config.repository || declaration.hostname !== config.hostname ||
      declaration.default_branch !== default_branch || declaration.ledger_path !== config.ledger_path) fail();
  const effects = {} as Record<AuditMode, Effect[]>;
  for (const mode of Object.keys(modes) as AuditMode[]) {
    const value = declaration[mode + "_effects"];
    effects[mode] = value === "none" ? [] : value.split(",").map(s => s.trim()) as Effect[];
    if (new Set(effects[mode]).size !== effects[mode].length || effects[mode].some(e => !modes[mode].includes(e))) fail();
    if (effects[mode].includes("ledger-commit") && !effects[mode].includes("ledger-update")) fail();
  }
  const fix = effects.fix;
  if (fix.includes("local-commit") && local.some(e => !fix.includes(e)) ||
      remote.some(e => fix.includes(e)) && local.some(e => !fix.includes(e)) ||
      fix.includes("pr-write") && !fix.includes("branch-push") ||
      fix.includes("conditional-merge") && ["branch-push", "pr-write"].some(e => !fix.includes(e as Effect))) fail();
  const slugs = [...input.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)].map(m =>
    m[1].toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/\s/g, "-"));
  for (const name of ["selection_policy", "verification_policy", "merge_policy"]) {
    const fragment = declaration[name];
    if (!/^#[a-z0-9][a-z0-9_-]*$/.test(fragment) || slugs.filter(slug => slug === fragment.slice(1)).length !== 1) fail();
  }
  return { declaration, effects };
}
export function inspectCandidatePolicy(config: Settings, options: { default_branch: string }) {
  try {
    const parsed = parseDeclaration(readFileSync(join(config.root, config.project_procedure), "utf8"), config, options.default_branch);
    return { valid: parsed !== null, allowed: false as const, reason: "Candidate inspection confers no adopted effect.", declaration: parsed };
  } catch { return { valid: false, allowed: false as const, reason: "Invalid candidate declaration.", declaration: null }; }
}
export function refreshDefault(config: Settings): Observed {
  const head = git(config.root, "ls-remote", "--symref", "origin", "HEAD");
  const match = head.match(/^ref: refs\/heads\/([^\s]+)\s+HEAD$/m);
  if (!match) throw Error("remote default branch is unavailable");
  const default_branch = match[1];
  git(config.root, "check-ref-format", "refs/heads/" + default_branch);
  git(config.root, "fetch", "--no-tags", "origin", `+refs/heads/${default_branch}:refs/remotes/origin/${default_branch}`);
  return { default_branch, default_commit: git(config.root, "rev-parse", "refs/remotes/origin/" + default_branch) };
}
function committedFile(config: Settings, commit: string, path: string): string {
  if (!path || path.startsWith("/") || path.split(/[\\/]/).some(p => !p || ["..", ".git"].includes(p))) fail();
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    const entry = git(config.root, "ls-tree", commit, "--", parts.slice(0, i + 1).join("/"));
    if (!(i === parts.length - 1 ? /^100(?:644|755) blob / : /^040000 tree /).test(entry)) fail();
  }
  return gitBytes(config.root, "show", `${commit}:${path}`).toString();
}
export function inspectAuthority(config: Settings, options: AuthorityOptions) {
  const sources: { path: string; digest: string }[] = [];
  let default_commit: string | null = null, default_branch: string | null = null;
  const response = (allowed: boolean, basis: "adopted" | "current-request" | "none", reason: string) => ({
    allowed, basis, reason, sources, default_commit, default_branch,
    scope: { mode: options.mode, ids: options.ids, workstream: options.workstream ?? null, effect: options.effect },
    pending_conditions: allowed && remote.includes(options.effect as typeof remote[number]),
    limit: "Operator policy inspection; no OS capability or proof that semantic delivery gates passed.",
  });
  const request = options.request, restrictions = new Set(options.restrictions ?? []), effect = options.effect;
  try {
    if (digest(loadSettings(config.root, { settingsPath: config.settings_path })) !== digest(config)) return response(false, "none", "Settings changed.");
    const identity = origin(config.root);
    if (identity.repository.toLowerCase() !== config.repository || identity.hostname !== config.hostname) return response(false, "none", "Origin changed.");
    const known = new Set(inventory(config).findings.map(f => f.id));
    if (options.ids.some(id => !known.has(id)) || options.mode === "fix" && !options.ids.length) return response(false, "none", "Unknown or empty selected finding scope.");
    if (!modes[options.mode]?.includes(effect) || !request?.authorized || request.mode !== options.mode ||
        digest([...request.ids].sort()) !== digest([...options.ids].sort()) || new Set(options.ids).size !== options.ids.length ||
        (request.workstream ?? null) !== (options.workstream ?? null)) return response(false, "none", "Mode or current selected scope does not authorize this effect.");
    if (restrictions.has("read-only") || restrictions.has("no-write") || options.prohibited_effects?.includes(effect) ||
        restrictions.has("no-commit") && ["ledger-commit", "local-commit"].includes(effect) ||
        restrictions.has("no-push") && ["branch-push", "pr-write", "conditional-merge"].includes(effect) ||
        restrictions.has("no-merge") && effect === "conditional-merge" || restrictions.has("no-live") && effect === "live-verify") return response(false, "none", "Current restriction or local prohibition wins.");
    const explicit = request.effects?.includes(effect) || options.mode === "fix" && request.eligible_repair && local.includes(effect as typeof local[number]);
    if (explicit) return response(true, "current-request", "Current selected request grants this scoped effect; retained gates still apply.");
    if (options.no_fetch) return response(false, "none", "Fresh default policy unavailable under no-fetch request.");
    const observed = (options.refresh ?? (() => refreshDefault(config)))();
    git(config.root, "check-ref-format", "refs/heads/" + observed.default_branch);
    if (!/^[a-f0-9]{40,64}$/.test(observed.default_commit) || git(config.root, "rev-parse", "refs/remotes/origin/" + observed.default_branch) !== observed.default_commit) fail();
    default_commit = observed.default_commit; default_branch = observed.default_branch;
    const read = (path: string) => { const text = committedFile(config, observed.default_commit, path); sources.push({ path, digest: hash(text) }); return text; };
    const agents = visible(read("AGENTS.md"));
    const links = [...agents.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)].map(m => m[1].replace(/^\.\//, ""));
    if (!links.includes(config.settings_path)) return response(false, "none", "Default AGENTS has no audit settings link.");
    const settings = read(config.settings_path), currentSettings = readFileSync(join(config.root, config.settings_path), "utf8");
    if (settings.trimEnd() !== currentSettings.trimEnd()) return response(false, "none", "Candidate settings are not adopted default settings.");
    const parsed = JSON.parse(settings);
    if (parsed.project_procedure !== config.project_procedure) fail();
    const procedure = read(config.project_procedure);
    if (procedure.trimEnd() !== readFileSync(join(config.root, config.project_procedure), "utf8").trimEnd()) return response(false, "none", "Candidate procedure is not adopted default policy.");
    const grant = parseDeclaration(procedure, config, observed.default_branch);
    return grant?.effects[options.mode].includes(effect) ? response(true, "adopted", "Fresh committed scoped grant; semantic gates remain pending.") : response(false, "none", "No adopted grant for this effect.");
  } catch { return response(false, "none", "Fresh adopted policy could not be established."); }
}
