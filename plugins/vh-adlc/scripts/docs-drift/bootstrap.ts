import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { readGit } from "./git";
import { canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";

type PayloadFile = { path: string; mode: "100644" | "100755"; sha256: string; size: number };
export type ComponentIdentity = {
  schema_version: 1; source_commit: string; plugin_version: string; component_sha256: string; files: PayloadFile[];
};
function fail(reason: string): never { throw Error("docs-drift runtime setup required " + reason); }
function componentDigest(files: PayloadFile[]): string {
  return sha256(canonicalJSON(files.map(file => [file.path, file.mode, file.sha256])));
}
function pluginVersion(bytes: Uint8Array): string {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("plugin metadata");
  const metadata = value as Record<string, unknown>;
  if (metadata.name !== "vh-adlc" || typeof metadata.version !== "string"
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(metadata.version)) fail("plugin name/version");
  return metadata.version;
}

/** The source release and repository are verified by setup. This computes their exact raw Git payload. */
export function computeComponentIdentity(repo: string, sourceCommit: string): ComponentIdentity {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(sourceCommit)
    || readGit(repo, "rev-parse", "--verify", "--end-of-options", sourceCommit + "^{commit}").toString().trim() !== sourceCommit) fail("immutable source required");
  const prefix = "plugins/vh-adlc/";
  const inventory = decodeUTF8(readGit(repo, "--literal-pathspecs", "ls-tree", "-r", "--full-tree", "-z", sourceCommit, "--", "plugins/vh-adlc"));
  const entries = inventory.split("\0");
  if (entries.pop() !== "" || entries.length === 0) fail("complete component inventory required");
  let version: string | undefined;
  const files = entries.map(entry => {
    const tab = entry.indexOf("\t");
    const fields = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/u.exec(entry.slice(0, tab));
    const fullPath = entry.slice(tab + 1);
    if (tab < 0 || !fields || !fullPath.startsWith(prefix)) fail("unsupported component entry");
    const path = protocolPath(fullPath.slice(prefix.length));
    const bytes = readGit(repo, "cat-file", "blob", fields[2]);
    if (path === ".claude-plugin/plugin.json") version = pluginVersion(bytes);
    return { path, mode: fields[1] as PayloadFile["mode"], sha256: sha256(bytes), size: bytes.length };
  }).sort((left, right) => compareUTF8(left.path, right.path));
  if (version === undefined) fail("plugin metadata missing");
  return freezeJSON({ schema_version: 1, source_commit: sourceCommit, plugin_version: version,
    component_sha256: componentDigest(files), files });
}

/** Recheck the exported shipped directory. Setup metadata and native session files belong outside it. */
export function inspectRetainedPayload(options: { directory: string; expected: ComponentIdentity }) {
  const { directory, expected } = options;
  canonicalJSON(expected);
  if (expected.schema_version !== 1 || !Array.isArray(expected.files) || expected.files.length === 0
    || componentDigest(expected.files) !== expected.component_sha256) fail("expected component identity");
  const root = realpathSync(directory), rootStat = lstatSync(directory), owner = process.getuid?.();
  if (owner === undefined || root !== directory || rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || rootStat.uid !== owner || (rootStat.mode & 0o077) !== 0) fail("private owned runtime root required");
  const selected = new Map(expected.files.map(file => [file.path, file]));
  if (selected.size !== expected.files.length) fail("duplicate component identity");
  const files: PayloadFile[] = [];
  let version: string | undefined;
  function walk(parent: string): void {
    for (const name of readdirSync(parent)) {
      const path = join(parent, name), stat = lstatSync(path);
      if (stat.uid !== owner || stat.isSymbolicLink()) fail("foreign or linked runtime input");
      if (stat.isDirectory()) { walk(path); continue; }
      const relative = protocolPath(path.slice(root.length + 1)), required = selected.get(relative);
      if (!stat.isFile() || stat.nlink !== 1 || !required || !Number.isSafeInteger(required.size)
        || required.size < 0 || stat.size !== required.size) fail("unexpected or changed runtime input");
      const mode = (stat.mode & 0o100) === 0 ? "100644" : "100755";
      if (mode !== required.mode) fail("runtime executable mode changed");
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== required.size
          || opened.uid !== owner || opened.nlink !== 1 || opened.mode !== stat.mode) fail("runtime input changed during inspection");
        const bytes = readFileSync(fd), digest = sha256(bytes);
        if (bytes.length !== required.size || digest !== required.sha256) fail("runtime input bytes changed");
        if (relative === ".claude-plugin/plugin.json") version = pluginVersion(bytes);
        files.push({ path: relative, mode, sha256: digest, size: bytes.length });
      } finally { closeSync(fd); }
    }
  }
  walk(root);
  files.sort((left, right) => compareUTF8(left.path, right.path));
  if (version !== expected.plugin_version || files.length !== expected.files.length
    || !canonicalJSON(files).equals(canonicalJSON(expected.files)) || componentDigest(files) !== expected.component_sha256) fail("retained component identity changed");
  return freezeJSON({ directory: root, plugin_version: version, component_sha256: componentDigest(files), files });
}
