import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { verifyScannerEvidence } from "../../../plugins/vh-adlc/scripts/maintenance/scanner-evidence";

const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
function packet(parent=tmpdir()) {
  const root = realpathSync(mkdtempSync(join(parent, "scanner-packet-"))); roots.push(root);
  const raw = JSON.stringify({ vulnerabilities: [{ id: "CVE-2026-1234", package: "widget" }] });
  writeFileSync(join(root, "raw.json"), raw);
  const manifest = { schema_version: 1, kind: "maintenance-scanner-evidence-v1", hostname: "github.com", repository: "example/project", source_commit: "a".repeat(40),
    target: { kind: "image", reference: "sha256:" + "b".repeat(64), platform: "linux/amd64" },
    producer: { name: "trivy", version: "1.0", schema: "normalized-v1", database: "db-digest", configuration: "config-digest", operator: "fixture" },
    observed_at: "2026-11-05T10:00:00Z", scope: { category: "vulnerability", selectors: ["image"], exclusions: [] },
    scan_completed: true, exit_code: 0, synthetic_input: false,
    receipt: { argv: ["trivy", "image", "--format", "json", "image"], normalization: "operator mapping of vulnerabilities[0]", evidence: "raw.json" },
    files: [{ path: "raw.json", sha256: digest(raw) }],
    findings: [{ fingerprint: "widget/CVE-2026-1234", rule: "CVE-2026-1234", package: "widget", version: "1.0", location: "/lib/widget", severity: "high", advisory_ids: ["CVE-2026-1234"], evidence: "raw.json", pointer: "/vulnerabilities/0" }] };
  const save = () => writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest)); save();
  return { root, manifest, save };
}
test("report-only zero exit with findings is complete but never an empty scan", () => {
  const p = packet(), result = verifyScannerEvidence(p.root);
  expect(result.complete).toBe(true); expect(result.findings).toHaveLength(1); expect(result.synthetic).toBe(false);
  p.manifest.exit_code = 1; p.save(); expect(verifyScannerEvidence(p.root).complete).toBe(true);
  p.manifest.scan_completed = false; p.save(); expect(verifyScannerEvidence(p.root).complete).toBe(false);
});
test("a complete empty scan and synthetic provenance remain distinct", () => {
  const p = packet(); p.manifest.findings = []; p.manifest.synthetic_input = true; p.save();
  expect(verifyScannerEvidence(p.root)).toMatchObject({ complete: true, synthetic: true, findings: [] });
});
test("owned packet fixtures support system temporary-directory aliases",()=>{
  const parent=realpathSync(mkdtempSync(join(tmpdir(),"scanner-alias-")));roots.push(parent);
  mkdirSync(join(parent,"physical"));symlinkSync(join(parent,"physical"),join(parent,"alias"),"dir");
  const p=packet(join(parent,"alias"));
  expect(verifyScannerEvidence(p.root).findings).toHaveLength(1);
});
test.each(["tamper", "missing", "extra", "symlink", "traversal", "pointer", "schema", "target", "duplicate"])("rejects %s evidence", kind => {
  const p = packet();
  if (kind === "tamper") writeFileSync(join(p.root, "raw.json"), "changed");
  if (kind === "missing") rmSync(join(p.root, "raw.json"));
  if (kind === "extra") writeFileSync(join(p.root, "extra"), "unlisted");
  if (kind === "symlink") { rmSync(join(p.root, "raw.json")); symlinkSync("/etc/hostname", join(p.root, "raw.json")); }
  if (kind === "traversal") p.manifest.files[0].path = "../raw.json";
  if (kind === "pointer") p.manifest.findings[0].pointer = "/vulnerabilities/99";
  if (kind === "schema") p.manifest.producer.schema = "future";
  if (kind === "target") p.manifest.target.reference = "latest";
  if (kind === "duplicate") p.manifest.findings.push({ ...p.manifest.findings[0] });
  p.save(); expect(() => verifyScannerEvidence(p.root)).toThrow();
});
