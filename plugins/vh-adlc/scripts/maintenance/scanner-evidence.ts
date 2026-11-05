import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { canonicalJSON, digest } from "./journal";
import * as v from "./security-value";

export type ScannerFinding = { fingerprint: string; rule: string; package: string | null; version: string | null; location: string;
  severity: string; advisory_ids: string[]; evidence: string; pointer: string };
export type ScannerEvidence = { schema_version: 1; kind: "maintenance-scanner-evidence-v1"; hostname: string; repository: string; source_commit: string;
  target: { kind: "source" | "image"; reference: string; platform: string }; producer: { name: string; version: string; schema: string; database: string; configuration: string; operator: string };
  observed_at: string; scope: { category: string; selectors: string[]; exclusions: string[] }; complete: boolean; synthetic: boolean;
  exit_code: number; findings: ScannerFinding[]; manifest_digest: string; files: { path: string; sha256: string }[] };

function path(value: unknown): string {
  const result = v.text(value);
  if (isAbsolute(result) || result.includes("\\") || result.split("/").some(part => !part || part === "." || part === "..")) throw Error("unsafe scanner evidence path");
  return result;
}
function physicalRoot(input: string): string {
  const root = resolve(input); let part = root;
  while (true) {
    const info = lstatSync(part); if (!info.isDirectory() || info.isSymbolicLink()) throw Error("unsafe scanner evidence root");
    if (dirname(part) === part) break; part = dirname(part);
  }
  return root;
}
function pointer(input: unknown, raw: unknown): string {
  const p = v.text(input); if (!p.startsWith("/")) throw Error("scanner evidence pointer must locate a raw finding");
  let current = raw;
  for (const token of p.slice(1).split("/")) {
    if (/~(?![01])/.test(token)) throw Error("invalid scanner evidence pointer");
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) throw Error("scanner evidence pointer missing");
    current = (current as Record<string, unknown>)[key];
  }
  if (current === null || current === undefined) throw Error("scanner evidence pointer has no finding");
  return p;
}

/** A supplied operator receipt is procedural evidence, not an attestation of scanner honesty. */
export function verifyScannerEvidence(input: string): ScannerEvidence {
  const root = physicalRoot(input), actual = new Set<string>();
  const walk = (relative: string) => {
    for (const name of readdirSync(join(root, relative))) {
      const candidate = relative ? `${relative}/${name}` : name, stat = lstatSync(join(root, candidate));
      if (stat.isSymbolicLink()) throw Error("scanner evidence symlink");
      if (stat.isDirectory()) walk(candidate); else if (stat.isFile()) actual.add(candidate); else throw Error("scanner evidence non-file");
    }
  };
  walk("");
  const bytes = readFileSync(join(root, "manifest.json"));
  const row = v.record(JSON.parse(bytes.toString()), ["schema_version", "kind", "hostname", "repository", "source_commit", "target", "producer", "observed_at", "scope", "scan_completed", "exit_code", "synthetic_input", "receipt", "files", "findings"]);
  if (row.schema_version !== 1 || row.kind !== "maintenance-scanner-evidence-v1") throw Error("unsupported scanner evidence schema");
  const target = v.record(row.target, ["kind", "reference", "platform"]), kind = v.choice(target.kind, ["source", "image"] as const), reference = v.text(target.reference);
  if (kind === "image" ? !/^sha256:[a-f0-9]{64}$/.test(reference) : reference !== v.commit(row.source_commit)) throw Error("scanner target must bind an exact digest or source commit");
  const producer = v.record(row.producer, ["name", "version", "schema", "database", "configuration", "operator"]);
  if (producer.schema !== "normalized-v1") throw Error("unsupported scanner producer schema");
  const scope = v.record(row.scope, ["category", "selectors", "exclusions"]), receipt = v.record(row.receipt, ["argv", "normalization", "evidence"]);
  if (!v.list(receipt.argv).map(v.text).length) throw Error("scanner invocation receipt required");
  v.text(receipt.normalization);
  const expected = new Set(["manifest.json"]), raws = new Map<string, unknown>();
  const files = v.list(row.files).map(value => {
    const item = v.record(value, ["path", "sha256"]), name = path(item.path), sha256 = v.hash(item.sha256);
    if (expected.has(name) || !actual.has(name)) throw Error("duplicate or missing scanner evidence file"); expected.add(name);
    const data = readFileSync(join(root, name)); if (digest(data) !== sha256) throw Error("scanner evidence digest mismatch");
    raws.set(name, JSON.parse(data.toString())); return { path: name, sha256 };
  });
  if (actual.size !== expected.size || [...actual].some(name => !expected.has(name))) throw Error("undeclared scanner evidence file");
  if (!raws.has(path(receipt.evidence))) throw Error("scanner normalization receipt evidence missing");
  const seen = new Set<string>();
  const findings = v.list(row.findings).map(value => {
    const f = v.record(value, ["fingerprint", "rule", "package", "version", "location", "severity", "advisory_ids", "evidence", "pointer"]), fingerprint = v.text(f.fingerprint), evidence = path(f.evidence);
    if (seen.has(fingerprint)) throw Error("duplicate scanner finding"); seen.add(fingerprint);
    if (!raws.has(evidence)) throw Error("scanner finding evidence missing");
    return { fingerprint, rule: v.text(f.rule), package: v.nullable(f.package), version: v.nullable(f.version), location: v.text(f.location), severity: v.text(f.severity), advisory_ids: v.strings(f.advisory_ids), evidence, pointer: pointer(f.pointer, raws.get(evidence)) };
  });
  return { schema_version: 1, kind: "maintenance-scanner-evidence-v1", ...v.identity(row.hostname, row.repository), source_commit: v.commit(row.source_commit),
    target: { kind, reference, platform: v.text(target.platform) }, producer: { name: v.text(producer.name), version: v.text(producer.version), schema: "normalized-v1", database: v.text(producer.database), configuration: v.text(producer.configuration), operator: v.text(producer.operator) },
    observed_at: v.timestamp(row.observed_at), scope: { category: v.choice(scope.category, ["vulnerability", "misconfiguration", "source"]), selectors: v.strings(scope.selectors), exclusions: v.strings(scope.exclusions) },
    complete: v.flag(row.scan_completed), exit_code: v.integer(row.exit_code), synthetic: v.flag(row.synthetic_input), findings, files, manifest_digest: digest(canonicalJSON(JSON.parse(bytes.toString()))) };
}
