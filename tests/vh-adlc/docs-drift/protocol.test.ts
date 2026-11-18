import { expect, test } from "bun:test";
import golden from "./protocol-golden.json";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { canonicalJSON, createProtocolBindings, decodeUTF8, protocolPath, sha256, verifyProtocolBindings } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

function input() {
  return {
    source_commit: golden.source_commit,
    settings_sha256: sha256(Buffer.from(golden.settings_base64, "base64")),
    settings: parseSettings(golden.settings),
    blobs: golden.blobs.map(blob => ({ path: blob.path, mode: blob.mode, bytes: Buffer.from(blob.content_base64, "base64") })),
  };
}

test("canonical JSON sorts every key by UTF-8 bytes, including integer-looking and Unicode keys", () => {
  const value = { "2": "two", "10": "ten", "🚀": 3, "\uE000": 4, "é": 2, "Z": 1, inner: { b: -0, a: [true, null, 1.5] } };
  expect(canonicalJSON(value).toString()).toBe('{"10":"ten","2":"two","Z":1,"inner":{"a":[true,null,1.5],"b":0},"é":2,"":4,"🚀":3}');
});

test.each([undefined, NaN, Infinity, -Infinity, 1n, Symbol("invalid"), () => 1, new Date(), new Map(), "\uD800", { "\uDFFF": 1 }, { missing: undefined }, [undefined], Array(2)])("unsupported canonical value is refused %#", value => {
  expect(() => canonicalJSON(value)).toThrow();
});

test("canonical encoding refuses cycles, hidden properties, array extensions and getters", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() => canonicalJSON(cycle)).toThrow();
  expect(() => canonicalJSON(Object.defineProperty({}, "hidden", { value: 1 }))).toThrow();
  expect(() => canonicalJSON(Object.assign([], { extra: true }))).toThrow();
  expect(() => canonicalJSON({ [Symbol("hidden")]: 1 })).toThrow();
  let reads = 0;
  const getter = Object.defineProperty({}, "value", { enumerable: true, get() { reads++; return 1; } });
  expect(() => canonicalJSON(getter)).toThrow();
  expect(reads).toBe(0);
  const shared = { value: 1 };
  expect(canonicalJSON([shared, shared]).toString()).toBe('[{"value":1},{"value":1}]');
});

test.each(["", ".", "./docs/a.md", "../docs/a.md", "docs/../a.md", "/docs/a.md", "docs//a.md", "docs/a.md/", "docs/./a.md", ".git/config", "docs/\0.md", "docs/\uD800.md"])("invalid Git path is refused (%s)", path => {
  expect(() => protocolPath(path)).toThrow();
});

test("Git paths preserve case, literal backslashes, BOM, newline and valid Unicode", () => {
  for (const path of ["docs/A.md", "docs/a\\b.md", "\uFEFFdocs/a.md", "docs/a\nb.md", "docs/🚀.md"]) expect(protocolPath(path)).toBe(path);
  expect(decodeUTF8(Buffer.from("\uFEFFdocs/🚀.md"))).toBe("\uFEFFdocs/🚀.md");
  expect(() => decodeUTF8(Buffer.from([255]))).toThrow();
});

test("bindings match independently generated canonical bytes, raw hashes and per-unit inventories", () => {
  const created = createProtocolBindings(input());
  expect<unknown>(created.bindings).toEqual(golden.expected_bindings);
  expect(created.bytes).toEqual(Buffer.from(golden.expected_canonical_base64, "base64"));
  expect(created.sha256).toBe(golden.expected_sha256);
  expect(created.bindings.detectors.find(unit => unit.id === "claims")?.documents.map(row => row[0])).toEqual(["docs/A.md", "docs/é.md"]);
  expect(created.bindings.documents.map(row => row[0])).toEqual(["docs/A.md", "docs/é.md", "docs/🚀.md"]);
  expect(created.bindings).not.toHaveProperty("bindings_sha256");
  expect(created.bindings).not.toHaveProperty("sha256");
});

test("raw blob digests retain BOM/CRLF and document/unit order is independent of input ordering", () => {
  const first = input();
  const created = createProtocolBindings(first);
  const reordered = input();
  reordered.blobs.reverse();
  reordered.settings.required_detectors.reverse();
  expect(createProtocolBindings(reordered).bytes).toEqual(created.bytes);
  const changed = input();
  const blob = changed.blobs.find(blob => blob.path === "docs/A.md");
  if (!blob) throw new Error("missing fixture blob");
  blob.bytes = Buffer.from(blob.bytes.toString().replace(/^\uFEFF/u, "").replaceAll("\r\n", "\n"));
  expect(createProtocolBindings(changed).bindings.documents).not.toEqual(created.bindings.documents);
  expect(createProtocolBindings(changed).bindings.detectors[0].input_sha256).not.toBe(created.bindings.detectors[0].input_sha256);
});

test("zero-input units remain present and incomplete independent inputs cannot become bindings", () => {
  const zero = input();
  zero.settings.detector_inputs.claims = { roots: ["empty"], exclusions: [], suffixes: [".md"] };
  expect(createProtocolBindings(zero).bindings.detectors.find(unit => unit.id === "claims")?.documents).toEqual([]);
  const missing = input();
  missing.blobs = missing.blobs.filter(blob => blob.path !== "docs/suppressions.yaml");
  expect(() => createProtocolBindings(missing)).toThrow();
  const duplicate = input();
  duplicate.blobs.push(duplicate.blobs[0]);
  expect(() => createProtocolBindings(duplicate)).toThrow();
  const symlink = input();
  symlink.blobs[0].mode = "120000";
  expect(() => createProtocolBindings(symlink)).toThrow();
});

test("changed protocol files and noncanonical re-encoding fail the retained binding check", () => {
  const created = createProtocolBindings(input());
  expect(() => verifyProtocolBindings(created.bytes, created)).not.toThrow();
  expect(() => verifyProtocolBindings(Buffer.concat([created.bytes, Buffer.from("\n")]), created)).toThrow();
  const changed = structuredClone(created.bindings);
  changed.settings_sha256 = "0".repeat(64);
  expect(() => verifyProtocolBindings(canonicalJSON(changed), created)).toThrow();
});
