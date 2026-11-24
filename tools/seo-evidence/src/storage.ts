import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { digest, safeFile, stable } from "./bundle";

const fileEntry = z.strictObject({ path: z.string().regex(/^[a-z][a-z0-9-]*\.(?:json|csv|md)$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const ManifestSchema = z.strictObject({ schema_version: z.literal(1), files: z.array(fileEntry).min(1) });
const CompleteSchema = z.strictObject({ schema_version: z.literal(1), manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const reserved = new Set(["manifest.json", "complete.json"]);
async function bytes(root: string, name: string): Promise<Buffer> {
  const file = await safeFile(root, name); const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if (!(await handle.stat()).isFile()) throw new Error("Artifact is not an ordinary file"); return await handle.readFile(); } finally { await handle.close(); }
}
const decode = (value: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(value);
async function publish(root: string, name: string, value: string): Promise<void> {
  const temporary = join(root, `.${name}.tmp`); const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, join(root, name));
}
export async function writeArtifact(output: string, files: Record<string, string> | Iterable<readonly [string, string]>, signal?: AbortSignal): Promise<void> {
  await mkdir(output, { mode: 0o700 });
  const marker = await open(join(output, "INCOMPLETE"), "wx", 0o600);
  try { await marker.writeFile("Output has not completed verification.\n"); } finally { await marker.close(); }
  signal?.throwIfAborted();
  const entries: Iterable<readonly [string, string]> = Symbol.iterator in files ? files : Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  const manifest: z.infer<typeof ManifestSchema> = { schema_version: 1, files: [] }; const seen = new Set<string>();
  for (const [name, content] of entries) {
    signal?.throwIfAborted();
    const entry = fileEntry.parse({ path: name, sha256: digest(content) });
    if (reserved.has(name) || seen.has(name)) throw new Error("Reserved or repeated output filename"); seen.add(name);
    await publish(output, name, content); manifest.files.push(entry);
  }
  if (!manifest.files.length) throw new Error("Empty artifact");
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  for (const f of manifest.files) if (digest(await bytes(output, f.path)) !== f.sha256) throw new Error("Output hash verification failed");
  signal?.throwIfAborted();
  const text = stable(manifest); await publish(output, "manifest.json", text);
  await publish(output, "complete.json", stable({ schema_version: 1, manifest_sha256: digest(text) }));
  await unlink(join(output, "INCOMPLETE"));
}
export async function readArtifact(file: string): Promise<unknown> {
  const directory = dirname(file);
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("Artifact directory must not be a symlink");
  const root = await realpath(directory);
  try { await lstat(join(root, "INCOMPLETE")); throw new Error("Artifact is incomplete"); } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const complete = CompleteSchema.parse(JSON.parse(decode(await bytes(root, "complete.json"))) as unknown);
  const manifestBytes = await bytes(root, "manifest.json");
  if (digest(manifestBytes) !== complete.manifest_sha256) throw new Error("Manifest hash mismatch");
  const manifest = ManifestSchema.parse(JSON.parse(decode(manifestBytes)) as unknown);
  const names = new Set(manifest.files.map(f => f.path));
  if (names.size !== manifest.files.length || [...names].some(n => reserved.has(n))) throw new Error("Invalid artifact manifest names");
  let requested: Buffer | null = null;
  for (const entry of manifest.files) {
    const value = await bytes(root, entry.path);
    if (digest(value) !== entry.sha256) throw new Error("Artifact file hash mismatch");
    if (entry.path === basename(file)) requested = value;
  }
  if (requested === null) throw new Error("Requested file is absent from verified manifest");
  return JSON.parse(decode(requested)) as unknown;
}
