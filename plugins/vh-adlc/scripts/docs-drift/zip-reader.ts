import { fromBufferPromise } from "yauzl";

export type ArchiveLimits = { max_archive_bytes: number; max_entry_bytes: number };
export type ArchiveEntries = { report: Buffer; provenance: Buffer };

function invalid(reason: string): never { throw new Error(`invalid docs-drift archive ${reason}`); }

export async function readEntries(bytes: Uint8Array, limits: ArchiveLimits): Promise<ArchiveEntries> {
  if (!Number.isSafeInteger(limits.max_archive_bytes) || limits.max_archive_bytes <= 0
    || !Number.isSafeInteger(limits.max_entry_bytes) || limits.max_entry_bytes <= 0
    || bytes.byteLength > limits.max_archive_bytes) invalid("bound");
  const zip = await fromBufferPromise(Buffer.from(bytes), { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, decodeStrings: true });
  const entries = new Map<string, Buffer>();
  let compressed = 0;
  let expanded = 0;
  try {
    if (zip.entryCount !== 2) invalid("entry count");
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName !== "report.json" && entry.fileName !== "provenance.json") invalid("entry name");
      if (entries.has(entry.fileName)) invalid("duplicate entry");
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((mode !== 0 && mode !== 0o100000) || (entry.externalFileAttributes & 0x10) !== 0) invalid("regular entry required");
      if ((entry.generalPurposeBitFlag & (1 | 64)) !== 0 || ![0, 8].includes(entry.compressionMethod)) invalid("encoding");
      if (!Number.isSafeInteger(entry.compressedSize) || entry.compressedSize < 0
        || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0
        || entry.uncompressedSize > limits.max_entry_bytes) invalid("entry bound");
      compressed += entry.compressedSize;
      if (compressed > bytes.byteLength) invalid("compressed bound");
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const value of stream) {
          const chunk: unknown = value;
          if (!(chunk instanceof Uint8Array)) invalid("stream bytes");
          size += chunk.byteLength;
          expanded += chunk.byteLength;
          if (size > limits.max_entry_bytes || expanded > limits.max_entry_bytes * 2) invalid("expanded bound");
          chunks.push(Buffer.from(chunk));
        }
      } finally { stream.destroy(); }
      if (size !== entry.uncompressedSize) invalid("actual entry size");
      entries.set(entry.fileName, Buffer.concat(chunks, size));
    }
    const report = entries.get("report.json");
    const provenance = entries.get("provenance.json");
    if (!report || !provenance || entries.size !== 2) invalid("missing entry");
    return { report, provenance };
  } finally { zip.close(); }
}
