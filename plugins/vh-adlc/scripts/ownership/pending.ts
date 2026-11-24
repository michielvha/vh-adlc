import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OwnershipGit } from "./git";

function hash(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

function directory(git: OwnershipGit, digest: string): string {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw Error("invalid pending issue record");
  return join(git.text("rev-parse", "--absolute-git-dir"), "vh-adlc-reservation-pending", digest);
}

export function requirePending(git: OwnershipGit, digest: string): string {
  const dir = directory(git, digest);
  const preview = join(dir, "preview.json");
  try {
    if (readFileSync(join(dir, "marker"), "utf8").trim() === digest && hash(readFileSync(preview)) === digest) return preview;
  } catch { /* Recovery requires both private artifacts, regardless of the filesystem error. */ }
  throw Error("pending issue marker and approved preview must both be preserved in this checkout");
}

export function savePending(git: OwnershipGit, preview: string | Buffer): string {
  const bytes = typeof preview === "string" ? readFileSync(preview) : preview;
  if (!bytes.length || bytes.length > 1_048_576) throw Error("approved issue preview has an invalid size");
  const digest = hash(bytes);
  const dir = directory(git, digest);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [name, data] of [["preview.json", bytes], ["marker", `${digest}\n`]] as const) {
    try { writeFileSync(join(dir, name), data, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  requirePending(git, digest);
  return digest;
}
