// Finds a repository's `.vh-adlc/<name>.yaml` settings file and reads it through
// `vh-adlc settings read`, the strict reader in the verified binary. The callers'
// validators decide what the value means; this file only decides which bytes are
// read and how. A missing file needs no binary.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

type Fail = (reason: string) => never;
export type YAMLReaderOptions = { offline?: boolean; environment?: Record<string, string | undefined> };

export type SettingsFile = { path: string; configured: boolean; value: unknown };

/**
 * Reads the settings file for `name`. `inside` resolves a repository path and
 * refuses one that escapes the checkout; `fail` throws the caller's error.
 */
export function settingsFile(options: { root: string; name: string; settingsPath?: string; offline?: boolean; inside: (path: string) => string; fail: Fail }): SettingsFile {
  const { root, name, settingsPath, inside, fail } = options, expected = `.vh-adlc/${name}.yaml`;
  // A file under another suffix would otherwise leave the repository silently on defaults.
  for (const suffix of ["json", "yml"]) {
    const leftover = `.vh-adlc/${name}.${suffix}`;
    if (existsSync(join(root, leftover))) fail(`${leftover} is not read; settings belong in ${expected}`);
  }
  if (settingsPath !== undefined && !settingsPath.endsWith(".yaml")) fail("a settings path must end in .yaml");
  const file = inside(settingsPath ?? expected), path = relative(root, file).split(sep).join("/");
  if (!existsSync(file)) {
    if (settingsPath !== undefined) fail("requested settings file is missing");
    return { path, configured: false, value: {} };
  }
  return { path, configured: true, value: readYAML(readFileSync(file), fail, { offline: options.offline }) };
}

/** Returns the value `vh-adlc settings read` gives for `bytes`, or fails with its fixed reason. */
export function readYAML(bytes: Uint8Array, fail: Fail, options: YAMLReaderOptions = {}): unknown {
  return createYAMLReader(fail, options)(bytes);
}

/** Resolve the verified reader once; every call still parses a separate document strictly. */
export function createYAMLReader(fail: Fail, options: YAMLReaderOptions = {}): (bytes: Uint8Array) => unknown {
  const binary = verifiedBinary(options);
  if (!binary) fail("binary unavailable: the verified vh-adlc binary could not be obtained");
  return bytes => readVerifiedYAML(binary, bytes, fail, options.environment);
}

// Installer results for this process, keyed by mode, lock and environment. A hit is
// used only while the binary still has the bytes the installer verified.
const verified = new Map<string, { binary: string; sha256: string }>();

function verifiedBinary(options: YAMLReaderOptions): string | undefined {
  const key = installerKey(options), known = key === undefined ? undefined : verified.get(key);
  if (known && fileDigest(known.binary) === known.sha256) return known.binary;
  if (key !== undefined) verified.delete(key);
  const installer = Bun.spawnSync(["bash", join(import.meta.dir, "ensure-vh-adlc.sh"), ...(options.offline ? ["--offline"] : [])], { env: options.environment, stdout: "pipe", stderr: "pipe" });
  const binary = installer.exitCode === 0 ? installer.stdout.toString().trim() : "";
  if (!binary) return undefined;
  const digest = fileDigest(binary);
  if (key !== undefined && digest !== undefined) verified.set(key, { binary, sha256: digest });
  return binary;
}

function installerKey(options: YAMLReaderOptions): string | undefined {
  let lock: Buffer;
  try { lock = readFileSync(join(import.meta.dir, "..", "vh-adlc.lock.json")); } catch { return undefined; }
  const environment = Object.entries(options.environment ?? process.env).filter(([, value]) => value !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return JSON.stringify([options.offline === true, createHash("sha256").update(lock).digest("hex"), environment]);
}

function fileDigest(path: string): string | undefined {
  try { return createHash("sha256").update(readFileSync(path)).digest("hex"); } catch { return undefined; }
}

function readVerifiedYAML(binary: string, bytes: Uint8Array, fail: Fail, environment?: Record<string, string | undefined>): unknown {
  const run = Bun.spawnSync([binary, "settings", "read", "--stdin"], { env: environment, stdin: bytes, stdout: "pipe", stderr: "pipe" });
  let parsed: unknown;
  try { parsed = JSON.parse(run.stdout.toString()); } catch { fail("the settings reader returned no report"); }
  const report = record(parsed);
  if (report?.command !== "settings read") fail("the settings reader returned another command's report");
  const data = record(report.data);
  if (report.result === "answered" && run.exitCode === 0 && data && Object.hasOwn(data, "value")) return data.value;
  const finding = report.result === "malformed" && Array.isArray(report.findings) ? record(report.findings[0]) : undefined;
  if (typeof finding?.message === "string") {
    const line = Number.isSafeInteger(finding.line) && (finding.line as number) > 0 ? ` (line ${finding.line})` : "";
    fail(`settings file refused: ${finding.message}${line}`);
  }
  fail("the settings reader failed");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
