/** Narrow declarations for the pinned decoder API used by zip-reader.ts. */
declare module "yauzl" {
  import type { Readable } from "node:stream";
  export type Entry = {
    fileName: string; generalPurposeBitFlag: number; compressionMethod: number;
    externalFileAttributes: number; compressedSize: number; uncompressedSize: number;
  };
  export type ZipFile = {
    entryCount: number;
    eachEntry(): AsyncIterable<Entry>;
    openReadStreamPromise(entry: Entry): Promise<Readable>;
    close(): void;
  };
  export function fromBufferPromise(bytes: Buffer, options: {
    lazyEntries: true; strictFileNames: true; validateEntrySizes: true; decodeStrings: true;
  }): Promise<ZipFile>;
}
