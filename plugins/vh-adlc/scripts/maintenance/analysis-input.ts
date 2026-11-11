import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { git } from "../triage/settings";
import { canonicalJSON, digest, publishBytes, publishJSON, readRun, runID } from "./journal";
import { commitID, gitBytes, type HistoryReport } from "./history";
import { repositoryPath } from "./authority";
import { portableObservations } from "./report";
import type { Inventory } from "./collect";
import type { Settings } from "./types";

type InputFile = { path: string; sha256: string; mode: number };
export type AnalysisManifest = { schema_version: 1; run_id: string; synthetic_input: boolean; source_commit: string; hostname: string; repository: string;
  scope: Inventory["scope"]; component_commit: string; plugin_version: string; plugin_digest: string; collection_receipt: string;
  source_paths: string[]; release_paths: string[]; history: { path: string; provenance: "published" | "local"; commit?: string; digest: string }[];
  files: InputFile[]; input_digest: string };
export type AnalysisInput = { run_id: string; inventory: Inventory; synthetic_input: boolean; component: { root: string; commit: string };
  source_paths: string[]; release_paths: string[]; history: HistoryReport[]; output: string;
  collection_receipt: { argv: string[]; exit_code: number; requests_digest: string } };
function fail(message: string): never { throw Error(`maintenance packet: ${message}`); }
function frozen(root: string, commit: string, selectors: string[]): { path: string; mode: number; bytes: Buffer }[] {
  if (!Array.isArray(selectors) || !selectors.length || selectors.some(path => typeof path !== "string")) fail("explicit frozen input paths required");
  selectors.forEach(path => repositoryPath(path, true));
  const rows = gitBytes(root, "ls-tree", "-rz", commit, "--", ...selectors).toString().split("\0").filter(Boolean);
  const selected = rows.map(row => {
    const match = row.match(/^(100644|100755) blob [a-f0-9]+\t(.+)$/s);
    if (!match) fail("input contains a symlink or non-file Git object");
    repositoryPath(match[2]); return { path: match[2], mode: match[1] === "100755" ? 0o755 : 0o644, bytes: gitBytes(root, "show", `${commit}:${match[2]}`) };
  });
  for (const selector of selectors) if (!selected.some(row => selector === "." || row.path === selector || row.path.startsWith(selector + "/"))) fail("missing declared frozen input");
  return selected;
}
export function exportAnalysisInput(config: Settings, input: AnalysisInput) {
  const run = readRun(config, runID(input.run_id)), inventory = input.inventory;
  if (!inventory || inventory.schema_version !== 1 || inventory.repository !== config.repository || inventory.hostname !== config.hostname ||
      inventory.source_commit !== run.header.source_commit || canonicalJSON(inventory.scope) !== canonicalJSON(run.header.scope) || typeof input.synthetic_input !== "boolean") fail("collection source/scope differs from run");
  portableObservations(run, inventory);
  const receipt = input.collection_receipt;
  if (!receipt || receipt.exit_code !== 0 || !Array.isArray(receipt.argv) || receipt.argv.length < 3 || receipt.argv.some(arg => typeof arg !== "string" || arg.includes("\0")) || !receipt.argv.includes("collect") || !/^[a-f0-9]{64}$/.test(receipt.requests_digest) ||
      !Array.isArray(inventory.requests) || !inventory.requests.length || inventory.requests.some(row => row.method !== "GET" || row.hostname !== config.hostname)) fail("successful GET collection receipt required");
  commitID(config.root, inventory.source_commit);
  const sources = frozen(config.root, inventory.source_commit, [...input.source_paths, ...input.release_paths]);
  const required = [config.project_procedure, ...config.source_references, ...config.backlog_references, ...config.repositories.map(row => row.sync_workflow), ...config.surface_expectations.map(row => row.evidence)].filter((path): path is string => !!path);
  for (const path of required) if (!sources.some(row => row.path === path)) fail("referenced analysis policy/source missing from packet");
  const componentRoot = realpathSync(input.component.root), componentRepo = git(componentRoot, "rev-parse", "--show-toplevel"), componentCommit = commitID(componentRepo, input.component.commit);
  const prefix = relative(componentRepo, componentRoot).split(sep).join("/");
  if (prefix.startsWith("../") || prefix === "..") fail("component outside committed repository");
  const plugin = frozen(componentRepo, componentCommit, [prefix || "."]).map(row => ({ ...row, path: prefix ? row.path.slice(prefix.length + 1) : row.path }));
  for (const path of ["plugin.json", ".claude-plugin/plugin.json", "skills/vh-adlc-maintenance/SKILL.md", "references/maintenance.md"]) if (!plugin.some(row => row.path === path)) fail("maintenance operation absent from exact component");
  let pluginVersion: string;
  try {
    pluginVersion = JSON.parse(plugin.find(row => row.path === "plugin.json")!.bytes.toString()).version;
    if (typeof pluginVersion !== "string" || JSON.parse(plugin.find(row => row.path === ".claude-plugin/plugin.json")!.bytes.toString()).version !== pluginVersion) fail("component manifest mismatch");
  } catch { fail("invalid component metadata"); }
  const output = resolve(input.output);
  if (existsSync(output) || !existsSync(dirname(output)) || lstatSync(dirname(output)).isSymbolicLink()) fail("output must be a fresh directory with an existing physical parent");
  if (output === config.root || output.startsWith(config.root + sep) || output === componentRoot || output.startsWith(componentRoot + sep)) fail("packet output must be outside source/component checkouts");
  const content = new Map<string, { bytes: Buffer; mode: number }>();
  const add = (path: string, bytes: string | Buffer, mode = 0o600) => {
    repositoryPath(path); if (content.has(path)) fail("duplicate exported path"); content.set(path, { bytes: Buffer.from(bytes), mode });
  };
  for (const row of plugin) add(`plugin/${row.path}`, row.bytes, row.mode);
  for (const row of sources) add(`source/${row.path}`, row.bytes);
  const { root: _root, ...portableSettings } = config;
  add("settings.json", canonicalJSON({ ...portableSettings, root: "source" }) + "\n");
  add("inventory.json", JSON.stringify(inventory, null, 2) + "\n"); add("collection-receipt.json", canonicalJSON(receipt) + "\n");
  const history: AnalysisManifest["history"] = [];
  if (!Array.isArray(input.history)) fail("history list required even when unavailable");
  for (const [index, report] of input.history.entries()) {
    if (digest(report.text) !== report.digest || !["published", "local"].includes(report.provenance) || report.provenance === "published" && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(report.commit ?? "")) fail("invalid history provenance");
    const path = `history/${String(index).padStart(4, "0")}.md`; add(path, report.text);
    history.push({ path, provenance: report.provenance, digest: report.digest, ...(report.commit ? { commit: report.commit } : {}) });
  }
  const files = [...content].map(([path, row]) => ({ path, sha256: digest(row.bytes), mode: row.mode })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const pluginFiles = files.filter(row => row.path.startsWith("plugin/")).map(row => ({ ...row, path: row.path.slice(7) }));
  const manifest: AnalysisManifest = { schema_version: 1, run_id: run.header.run_id, synthetic_input: input.synthetic_input, source_commit: inventory.source_commit,
    hostname: inventory.hostname, repository: inventory.repository, scope: inventory.scope, component_commit: componentCommit, plugin_version: pluginVersion,
    plugin_digest: digest(canonicalJSON(pluginFiles)), collection_receipt: "collection-receipt.json", source_paths: [...input.source_paths], release_paths: [...input.release_paths], history, files, input_digest: digest(canonicalJSON(files)) };
  mkdirSync(output, { mode: 0o700 });
  for (const [path, row] of content) { const target = join(output, path); mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); publishBytes(target, row.bytes); chmodSync(target, row.mode); }
  publishJSON(join(output, "manifest.json"), manifest);
  const verified = verifyAnalysisInput(output); if (!verified.pass) fail("exported packet failed integrity checks");
  return { path: output, manifest, manifest_digest: digest(readFileSync(join(output, "manifest.json"))) };
}
export function verifyAnalysisInput(path: string): { pass: boolean; failures: string[]; manifest: AnalysisManifest } {
  const failures: string[] = []; let manifest: AnalysisManifest;
  try {
    if (lstatSync(path).isSymbolicLink()) fail("symlink packet root");
    const actual = new Set<string>();
    const walk = (relative: string) => {
      for (const name of readdirSync(join(path, relative))) {
        const candidate = relative ? `${relative}/${name}` : name, info = lstatSync(join(path, candidate));
        if (info.isSymbolicLink()) fail("symlink packet input");
        if (info.isDirectory()) walk(candidate); else if (!info.isFile()) fail("non-file packet input"); else actual.add(candidate);
      }
    };
    walk("");
    const info = lstatSync(join(path, "manifest.json")); if (!info.isFile() || info.isSymbolicLink()) fail("unsafe manifest");
    manifest = JSON.parse(readFileSync(join(path, "manifest.json"), "utf8"));
    if (manifest.schema_version !== 1 || typeof manifest.synthetic_input !== "boolean" || !Array.isArray(manifest.files) || runID(manifest.run_id) !== manifest.run_id || digest(canonicalJSON(manifest.files)) !== manifest.input_digest) fail("invalid manifest");
    const expected = new Set(["manifest.json"]), plugin: InputFile[] = [];
    for (const item of manifest.files) {
      repositoryPath(item.path);
      if (expected.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256) || ![0o600, 0o644, 0o755].includes(item.mode)) fail("invalid file index"); expected.add(item.path);
      if (!actual.has(item.path)) fail("missing declared input");
      const target = join(path, item.path), file = lstatSync(target);
      if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o777) !== item.mode || digest(readFileSync(target)) !== item.sha256) failures.push(`input-changed:${item.path}`);
      if (item.path.startsWith("plugin/")) plugin.push({ ...item, path: item.path.slice(7) });
    }
    if (digest(canonicalJSON(plugin)) !== manifest.plugin_digest) failures.push("plugin-digest");
    for (const candidate of actual) if (!expected.has(candidate)) failures.push(`unexpected-input:${candidate}`);
  } catch { failures.push("missing-or-malformed-input"); manifest = undefined as unknown as AnalysisManifest; }
  return { pass: failures.length === 0, failures, manifest };
}
