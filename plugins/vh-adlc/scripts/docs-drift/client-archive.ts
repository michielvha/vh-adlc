import { gunzipSync } from "node:zlib";
import { decodeUTF8, protocolPath, sha256 } from "./protocol";

type ArchiveFile = { size: number; executable: boolean; sha256: string };
function fail(reason: string): never { throw Error("docs-drift runtime setup required client archive " + reason); }
function field(header: Buffer, start: number, length: number): string {
  const bytes = header.subarray(start, start + length), end = bytes.indexOf(0);
  if (end >= 0 && bytes.subarray(end).some(byte => byte !== 0)) fail("noncanonical header text");
  return decodeUTF8(end < 0 ? bytes : bytes.subarray(0, end));
}
function octal(header: Buffer, start: number, length: number): number {
  const bytes = header.subarray(start, start + length);
  if (bytes.some(byte => byte > 127)) fail("unsupported numeric header");
  const text = bytes.toString("ascii").replace(/[\0 ]+$/u, "").trimStart();
  if (!/^[0-7]+$/u.test(text)) fail("unsupported numeric header");
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) fail("numeric bound");
  return value;
}
export function clientArchivePath(path: string): string {
  return protocolPath(path.replace(/^(?:\.\/)+/u, ""));
}

/** Validate the complete bounded ustar inventory before Bun reads its regular-file map.
 * Extended/special entries require an explicitly supported distribution, never silent omission.
 */
export function inspectClientArchive(distribution: Uint8Array, limits: { file: number; total: number; entries: number }) {
  const compressed = distribution[0] === 0x1f && distribution[1] === 0x8b;
  const bytes = compressed ? gunzipSync(distribution, { maxOutputLength: limits.total + limits.entries * 512 + 1024 }) : Buffer.from(distribution);
  if (bytes.length % 512 !== 0 || bytes.length < 1024 || bytes.length > limits.total + limits.entries * 512 + 1024) fail("block or size bound");
  const files = new Map<string, ArchiveFile>(), names = new Map<string, string>();
  let offset = 0, total = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (bytes.length - offset < 1024 || bytes.subarray(offset).some(byte => byte !== 0)) fail("trailing members or terminator");
      for (const file of files.keys()) {
        const parents = file.split("/"); parents.pop();
        while (parents.length) {
          const kind = names.get(parents.join("/"));
          if (kind !== undefined && kind !== "5") fail("regular file shadows a directory");
          parents.pop();
        }
      }
      return files;
    }
    if (names.size >= limits.entries) fail("entry bound");
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(header, 148, 8) || header.subarray(257, 263).toString() !== "ustar\0"
      || header.subarray(263, 265).toString() !== "00") fail("unsupported or corrupt header");
    const kind = String.fromCharCode(header[156]);
    if (kind !== "0" && kind !== "\0" && kind !== "5") fail("unsupported member type");
    const name = field(header, 0, 100), prefix = field(header, 345, 155);
    const raw = (prefix ? prefix + "/" : "") + name;
    const path = kind === "5" && /^(?:\.\/)+$/u.test(raw) ? "." : clientArchivePath(kind === "5" ? raw.replace(/\/$/u, "") : raw);
    if (names.has(path)) fail("duplicate canonical member");
    names.set(path, kind);
    const size = octal(header, 124, 12), mode = octal(header, 100, 8);
    if (field(header, 157, 100) || size > limits.file || (kind === "5" && size !== 0)
      || (total += size) > limits.total) fail("member size or link metadata");
    const start = offset + 512, next = start + Math.ceil(size / 512) * 512;
    if (next > bytes.length) fail("truncated member");
    if (kind !== "5") files.set(path, { size, executable: (mode & 0o111) !== 0, sha256: sha256(bytes.subarray(start, start + size)) });
    offset = next;
  }
  fail("missing terminator");
}
