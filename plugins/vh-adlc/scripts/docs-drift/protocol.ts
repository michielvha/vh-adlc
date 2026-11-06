import { createHash } from "node:crypto";
import type { DetectorSelector, Settings } from "./settings";

export type BlobInput = { path: string; mode: string; bytes: Uint8Array };
export type PathDigest = readonly [path: string, sha256: string];

function invalid(reason: string): never {
  throw new Error(`invalid docs-drift protocol ${reason}`);
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function compareUTF8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export function decodeUTF8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

function unicode(value: string): string {
  if (/[\uD800-\uDFFF]/u.test(value)) invalid("Unicode string");
  return value;
}

/** Git identities use POSIX separators. A backslash remains a literal filename character. */
export function protocolPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\0")) invalid("path");
  unicode(value);
  if (value.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) invalid("path");
  return value;
}

/** Serialize JSON directly so numeric-looking keys retain the required byte ordering. */
export function canonicalJSON(value: unknown): Buffer {
  const ancestors = new WeakSet<object>();
  function encode(value: unknown): string {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(unicode(value));
    if (typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) invalid("finite number");
      return JSON.stringify(value);
    }
    if (typeof value !== "object") invalid("JSON value");
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if ((!array && prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) invalid("JSON object");
    if (ancestors.has(value)) invalid("cyclic JSON value");
    ancestors.add(value);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors);
      function entry(key: string): unknown {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) invalid("JSON property");
        return descriptor.value;
      }
      if (array) {
        if (keys.length !== value.length + 1) invalid("JSON array properties");
        const items: string[] = [];
        for (let index = 0; index < value.length; index++) items.push(encode(entry(String(index))));
        return "[" + items.join(",") + "]";
      }
      return "{" + keys.sort(compareUTF8).map(key => JSON.stringify(unicode(key)) + ":" + encode(entry(key))).join(",") + "}";
    } finally {
      ancestors.delete(value);
    }
  }
  return Buffer.from(encode(value));
}

export function canonicalDigest(value: unknown): string {
  return sha256(canonicalJSON(value));
}

function set(values: readonly string[]): string[] {
  if (new Set(values).size !== values.length) invalid("duplicate scope value");
  return values.map(unicode).sort(compareUTF8);
}

function prefixes(values: readonly string[]): string[] {
  return set(values.map(value => value === "." ? value : protocolPath(value)));
}

function normalizedSelector(selector: DetectorSelector): DetectorSelector {
  if ("all_inventory" in selector) {
    if (selector.all_inventory !== true || Object.keys(selector).length !== 1) invalid("detector selector");
    return { all_inventory: true };
  }
  return { roots: prefixes(selector.roots), exclusions: prefixes(selector.exclusions), suffixes: set(selector.suffixes) };
}

function scopeFor(settings: Settings) {
  const required = set(settings.required_detectors);
  if (required.length === 0 || Object.keys(settings.detector_inputs).length !== required.length ||
      Object.keys(settings.detector_inputs).some(id => !required.includes(id))) invalid("required detector selectors");
  return {
    roots: prefixes(settings.roots),
    exclusions: prefixes(settings.exclusions),
    suffixes: set(settings.suffixes),
    required_detectors: required,
    detector_inputs: Object.fromEntries(required.map(id => [id, normalizedSelector(settings.detector_inputs[id])] as const)),
    read_set: {
      source_roots: settings.read_set.source_roots === null ? null : prefixes(settings.read_set.source_roots),
      reference_roots: settings.read_set.reference_roots === null ? null : prefixes(settings.read_set.reference_roots),
    },
  };
}

export function withinPrefix(path: string, root: string): boolean {
  return root === "." || path === root || path.startsWith(root + "/");
}

function selected(path: string, scope: { roots: string[]; exclusions: string[]; suffixes: string[] }): boolean {
  return scope.roots.some(root => withinPrefix(path, root)) &&
    !scope.exclusions.some(root => withinPrefix(path, root)) && scope.suffixes.some(suffix => path.endsWith(suffix));
}

export type ProtocolInput = { source_commit: string; settings_sha256: string; settings: Settings; blobs: BlobInput[] };

/** Derive document and detector inventories from owned Git blobs, independent of scanner output. */
export function createProtocolBindings(input: ProtocolInput) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(input.source_commit) || !/^[a-f0-9]{64}$/u.test(input.settings_sha256)) invalid("source bindings");
  const scope = scopeFor(input.settings);
  const blobs = new Map<string, BlobInput>();
  for (const blob of input.blobs) {
    protocolPath(blob.path);
    if (blobs.has(blob.path)) invalid("duplicate Git path");
    blobs.set(blob.path, blob);
    const touchesScope = scope.roots.some(root => withinPrefix(blob.path, root) || withinPrefix(root, blob.path));
    const excluded = scope.exclusions.some(root => withinPrefix(blob.path, root));
    if (touchesScope && !excluded && !["100644", "100755"].includes(blob.mode)) invalid("nonregular documentation input");
  }
  const documents: PathDigest[] = [...blobs.values()].filter(blob => selected(blob.path, scope))
    .sort((left, right) => compareUTF8(left.path, right.path))
    .map(blob => [blob.path, sha256(blob.bytes)] as const);
  const feedback: PathDigest[] = set(input.settings.feedback_files).map(path => {
    protocolPath(path);
    const blob = blobs.get(path);
    if (!blob || !["100644", "100755"].includes(blob.mode)) invalid("missing regular feedback file");
    return [path, sha256(blob.bytes)] as const;
  });
  const scopeDigest = canonicalDigest(scope);
  const feedbackDigest = canonicalDigest(feedback);
  const detectors = scope.required_detectors.map(id => {
    const selector = scope.detector_inputs[id];
    const applicable = "all_inventory" in selector ? documents : documents.filter(([path]) => selected(path, selector));
    const options = input.settings.detector_options[id];
    const digestInput = {
      source_commit: input.source_commit,
      settings_sha256: input.settings_sha256,
      scope_sha256: scopeDigest,
      feedback_sha256: feedbackDigest,
      detector_id: id,
      options,
      documents: applicable,
    };
    return { id, selector, options, documents: applicable, input_sha256: canonicalDigest(digestInput) };
  });
  const bindings = {
    schema_version: 1 as const,
    source_commit: input.source_commit,
    settings_sha256: input.settings_sha256,
    scope,
    scope_sha256: scopeDigest,
    feedback,
    feedback_sha256: feedbackDigest,
    documents,
    detectors,
  };
  const bytes = canonicalJSON(bindings);
  return { bindings, bytes, sha256: sha256(bytes) };
}

export type BoundProtocol = ReturnType<typeof createProtocolBindings>;

/** The owned bindings file has no self-digest. Retain and check its original bytes externally. */
export function verifyProtocolBindings(bytes: Uint8Array, expected: BoundProtocol): void {
  if (sha256(bytes) !== expected.sha256 || !Buffer.from(bytes).equals(expected.bytes)) invalid("changed bindings file");
}
