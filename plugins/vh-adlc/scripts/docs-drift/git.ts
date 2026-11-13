import { gitEnvironment, readGitWithEnvironment as nativeGit } from "../git-read";
import { createYAMLReader } from "../settings-file";
import type { CollectionReaders } from "../docs-impact/collection";
import { decodeUTF8, protocolPath, sha256 } from "./protocol";

type Environment = Readonly<Record<string, string | undefined>>;

function ordinaryGitEnvironment(base: Environment): Record<string, string | undefined> {
  return {
    PATH: base.PATH ?? "/usr/bin:/bin", LANG: "C", LC_ALL: "C",
    ...(base.TMPDIR === undefined ? {} : { TMPDIR: base.TMPDIR }),
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };
}

/** An unsupported capability fails at option parsing, before Git can read or repair an object. */
export function readGit(repo: string, ...args: string[]): Buffer {
  return readGitWithEnvironment(repo, args, { PATH: process.env.PATH });
}

export function readGitWithEnvironment(repo: string, args: string[], environment: Environment, input?: Uint8Array): Buffer {
  return nativeGit(repo, [
    "--no-lazy-fetch", "--no-replace-objects", "-c", "credential.helper=", "-c", "http.extraHeader=",
    "-c", "core.hooksPath=/dev/null", ...args,
  ], ordinaryGitEnvironment(environment), input);
}

/** Read raw blobs in bounded batches. Large individual blobs keep the existing single-object path. */
export function mapGitBlobs<T>(repo: string, objects: ReadonlyArray<{ oid: string; size: number }>, map: (bytes: Buffer, index: number) => T): T[] {
  if (!Array.isArray(objects) || typeof map !== "function") throw Error("Git blob batch request");
  const requested = objects.map(row => {
    if (row === null || typeof row !== "object" || Object.keys(row).sort().join(",") !== "oid,size"
      || typeof row.oid !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(row.oid)
      || !Number.isSafeInteger(row.size) || row.size < 0) throw Error("Git blob batch request");
    return { oid: row.oid, size: row.size };
  });
  const limit = 4 * 1024 * 1024, result: T[] = [];
  for (let start = 0; start < requested.length;) {
    const first = requested[start];
    if (first.size + 128 > limit) {
      const metadata = readGitWithEnvironment(repo, ["cat-file", "--batch-check"], { PATH: process.env.PATH }, Buffer.from(first.oid + "\n"));
      if (!metadata.equals(Buffer.from(first.oid + " blob " + first.size + "\n"))) throw Error("Git blob batch framing");
      const bytes = readGit(repo, "cat-file", "blob", first.oid);
      if (bytes.length !== first.size) throw Error("Git blob batch framing");
      result.push(map(bytes, start++)); continue;
    }
    let end = start, estimated = 0;
    while (end < requested.length && requested[end].size + 128 <= limit
      && estimated + requested[end].size + 128 <= limit) estimated += requested[end++].size + 128;
    const bytes = readGitWithEnvironment(repo, ["cat-file", "--batch"], { PATH: process.env.PATH },
      Buffer.from(requested.slice(start, end).map(row => row.oid).join("\n") + "\n"));
    let offset = 0;
    for (let index = start; index < end; index++) {
      const newline = bytes.indexOf(10, offset);
      if (newline < 0) throw Error("Git blob batch framing");
      const header = /^([a-f0-9]{40}(?:[a-f0-9]{24})?) blob (0|[1-9][0-9]*)$/u.exec(bytes.subarray(offset, newline).toString("ascii"));
      const selected = requested[index];
      if (!header || header[1] !== selected.oid || Number(header[2]) !== selected.size) throw Error("Git blob batch framing");
      const boundary = newline + 1 + selected.size;
      if (boundary >= bytes.length || bytes[boundary] !== 10) throw Error("Git blob batch framing");
      result.push(map(bytes.subarray(newline + 1, boundary), index)); offset = boundary + 1;
    }
    if (offset !== bytes.length) throw Error("Git blob batch framing");
    start = end;
  }
  return result;
}

export type CommittedInput = { path: string; mode: string; blob: string; bytes: Buffer; sha256: string };

/** Read literal adoption-policy blobs without checkout filters, links or submodules. */
export function readAdoptionInput(repo: string, commit: string, path: string): CommittedInput | null {
  protocolPath(path);
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(commit)) throw Error("incomplete docs-drift adoption immutable commit required");
  const raw = readGit(repo, "--literal-pathspecs", "ls-tree", "-z", commit, "--", path);
  if (raw.length === 0) return null;
  const tab = raw.indexOf(9);
  const metadata = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/u.exec(raw.subarray(0, tab).toString("ascii"));
  if (tab < 0 || !metadata || raw.at(-1) !== 0 || decodeUTF8(raw.subarray(tab + 1, -1)) !== path) {
    throw Error("incomplete docs-drift adoption regular committed input " + path);
  }
  const bytes = readGit(repo, "cat-file", "blob", metadata[2]);
  return { path, mode: metadata[1], blob: metadata[2], bytes, sha256: sha256(bytes) };
}

/** The verified binary needs its normal cache location. Credential values and hooks stay excluded. */
export function verifiedHelperEnvironment(): Record<string, string | undefined> {
  return {
    ...gitEnvironment(ordinaryGitEnvironment({ PATH: process.env.PATH })),
    HOME: process.env.HOME, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "core.fsmonitor", GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "credential.helper", GIT_CONFIG_VALUE_1: "",
    GIT_CONFIG_KEY_2: "http.extraHeader", GIT_CONFIG_VALUE_2: "",
  };
}

export function collectionReaders() {
  let yaml: ((bytes: Uint8Array) => unknown) | undefined;
  return {
    git: readGit,
    yaml: (bytes: Uint8Array): unknown => {
      yaml ??= createYAMLReader(reason => { throw new Error(reason); }, { offline: true, environment: verifiedHelperEnvironment() });
      return yaml(bytes);
    },
  } satisfies CollectionReaders;
}

/** Write only content-addressed metadata objects in a previously verified owned bare store. */
export function writeMetadataObject(repo: string, kind: "blob" | "tree" | "commit", bytes: Uint8Array): string {
  const result = nativeGit(repo, [
    "--no-lazy-fetch", "--no-replace-objects", "-c", "credential.helper=", "-c", "http.extraHeader=",
    "-c", "core.hooksPath=/dev/null", "hash-object", "-t", kind, "-w", "--stdin",
  ], ordinaryGitEnvironment({ PATH: process.env.PATH }), bytes).toString().trim();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(result)) throw Error("invalid metadata Git object");
  return result;
}
