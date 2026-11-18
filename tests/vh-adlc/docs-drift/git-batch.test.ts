import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { publicationFixture } from "./publication-fixture";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readGit, readGitWithEnvironment, writeMetadataObject } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("batched raw Git blobs preserve empty, binary, Unicode, duplicate and large objects in request order", async () => {
  const { mapGitBlobs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
  const f = publicationFixture(roots), large = Buffer.alloc(4 * 1024 * 1024 + 17, 0xab);
  large[0] = 10; large[32] = 0; large[large.length - 1] = 10;
  const bodies = [Buffer.alloc(0), Buffer.from("試験💡\n\0binary\n"), large, Buffer.alloc(0), Buffer.from([0, 10, 255, 10])];
  const objects = bodies.map(bytes => ({ oid: writeMetadataObject(f.store.root, "blob", bytes), size: bytes.length }));
  const before = captureRepositoryState(f.repo), refs = readGit(f.store.root, "for-each-ref", "--format=%(refname) %(objectname)");
  const result = mapGitBlobs(f.store.root, objects, (bytes, index) => ({ index, size: bytes.length, sha256: sha256(bytes) }));
  expect(result).toEqual(bodies.map((bytes, index) => ({ index, size: bytes.length, sha256: sha256(bytes) })));
  expect(readGit(f.store.root, "for-each-ref", "--format=%(refname) %(objectname)")).toEqual(refs);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["missing", "wrong-size", "non-blob"])("batched blob reads refuse incomplete or mismatched Git objects: %s", async scenario => {
  const { mapGitBlobs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
  const f = publicationFixture(roots), bytes = Buffer.from("known raw bytes\n"), blob = writeMetadataObject(f.store.root, "blob", bytes);
  const request = scenario === "missing" ? { oid: "f".repeat(40), size: 1 }
    : scenario === "non-blob" ? { oid: f.store.source_commit, size: Number(readGit(f.store.root, "cat-file", "-s", f.store.source_commit).toString()) }
    : { oid: blob, size: bytes.length + 1 };
  expect(() => mapGitBlobs(f.store.root, [request], bytes => sha256(bytes))).toThrow("Git blob batch framing");
});

test("invalid batch descriptors refuse before invoking Git", async () => {
  const { mapGitBlobs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
  for (const request of [{ oid: "HEAD\nHEAD", size: 1 }, { oid: "a".repeat(40), size: -1 }, { oid: "a".repeat(40), size: 1.5 },
    { oid: "a".repeat(40), size: Number.MAX_SAFE_INTEGER + 1 }])
    expect(() => mapGitBlobs("/nonexistent-repository", [request], () => null)).toThrow("Git blob batch request");
});

test("batched blob reads preserve full SHA-256 Git object identities", async () => {
  const { mkdtempSync, realpathSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const { mapGitBlobs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "vh-git-batch-sha256-"))); roots.push(repo);
  readGit(repo, "init", "--bare", "--template=", "--object-format=sha256");
  const bytes = Buffer.from("SHA-256 raw blob\n\0\n"), oid = writeMetadataObject(repo, "blob", bytes);
  expect(oid).toHaveLength(64);
  expect(mapGitBlobs(repo, [{ oid, size: bytes.length }], raw => raw.toString("hex"))).toEqual([bytes.toString("hex")]);
});


test("an empty blob request invokes neither Git nor the mapper and preserves caller state", async () => {
  const { mapGitBlobs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
  const f = publicationFixture(roots), before = captureRepositoryState(f.repo), refs = readGit(f.store.root, "for-each-ref", "--format=%(refname) %(objectname)");
  let calls = 0;
  expect(mapGitBlobs(f.store.root, [], () => { calls++; return null; })).toEqual([]);
  expect(mapGitBlobs("/nonexistent-repository", [], () => { calls++; return null; })).toEqual([]);
  expect(calls).toBe(0);
  expect(readGit(f.store.root, "for-each-ref", "--format=%(refname) %(objectname)")).toEqual(refs);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["abbreviated-sha256", "tagged-blob", "missing", "wrong-size"])("large blob reads refuse indirect, abbreviated or mismatched objects: %s", async scenario => {
  const { mkdtempSync, realpathSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const { mapGitBlobs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "vh-large-git-identity-"))); roots.push(repo);
  readGit(repo, "init", "--bare", "--template=", "--object-format=sha256");
  const bytes = Buffer.alloc(4 * 1024 * 1024 + 17, 0xab), oid = writeMetadataObject(repo, "blob", bytes);
  const tagBytes = Buffer.from(`object ${oid}\ntype blob\ntag fixture\ntagger Fixture <fixture@example.invalid> 1000000000 +0000\n\nSynthetic blob tag\n`);
  const tag = readGitWithEnvironment(repo, ["hash-object", "-t", "tag", "-w", "--stdin"], { PATH: process.env.PATH }, tagBytes).toString().trim();
  const refs = readGit(repo, "for-each-ref", "--format=%(refname) %(objectname)");
  const request = { oid: scenario === "abbreviated-sha256" ? oid.slice(0, 40) : scenario === "tagged-blob" ? tag : scenario === "missing" ? "f".repeat(64) : oid,
    size: bytes.length + (scenario === "wrong-size" ? 1 : 0) };
  let calls = 0;
  expect(() => mapGitBlobs(repo, [request], raw => { calls++; return raw.length; })).toThrow("Git blob batch framing");
  expect(calls).toBe(0);
  expect(readGit(repo, "for-each-ref", "--format=%(refname) %(objectname)")).toEqual(refs);
});
