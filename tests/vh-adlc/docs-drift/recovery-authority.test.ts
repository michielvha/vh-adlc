import { afterAll, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { write, commit } from "./adoption-fixture";
import { publicationFixture } from "./publication-fixture";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import type { AcknowledgementScope } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-ack";
import type { ReconciliationScope } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const hash = "a".repeat(64);
function authorityFixture() {
  const f = publicationFixture(roots);
  write(f.repo, f.settings.project_procedure, "---\ndocs_drift_reconciliation:\n  repository: fixture/docs\n  operation_prefix: original-\n  lease_ref: refs/heads/docs-drift-lease\n  receipt_ref_prefix: refs/heads/docs-drift-receipts/\n  effects: [absence-retirement, receipt-retention, owned-lease-release]\n---\n\nSynthetic adopted metadata-recovery procedure.\n");
  commit(f.repo, "synthetic recovery procedure");
  return f;
}

function scope(): AcknowledgementScope {
  return { kind: "docs-drift-delivery-acknowledgement", repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20,
    operation_id: "original-operation", run_id: "original-run", plan_sha256: hash, context: "production", transport: "native",
    source_state_sha256: hash, settings_sha256: hash, settlement_sha256: hash,
    lease_ref: "refs/heads/docs-drift-lease", lease_object: "a".repeat(40), receipt_ref: "refs/heads/docs-drift-receipts/original-operation",
    receipt_object: "a".repeat(40), release_effect_id: "release", acknowledgements: [], retirements: [], accounts: [] };
}

test.each(["matching", "changed-scope", "extra-field", "wrong-purpose", "adopted-procedure", "changed-request"])("recovery authority binds the actual current owner request %s", async scenario => {
  const { readRecoveryAuthority } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-authority");
  const f = authorityFixture(), selected = scope(), source = Buffer.from("Approve the displayed exact metadata-only acknowledgement and owned-lease cleanup.\n");
  writeFileSync(join(f.artifacts, "current-owner.txt"), source, { mode: 0o600 });
  const record: Record<string, unknown> = { schema_version: 1, kind: "docs-drift-recovery-authority", purpose: "acknowledgement",
    scope_sha256s: [canonicalDigest(selected)], origin: { kind: "owner-current-request", artifact: { path: "current-owner.txt", sha256: sha256(source) } } };
  if (scenario === "extra-field") record.approved = true;
  if (scenario === "wrong-purpose") record.purpose = "reconciliation";
  const commit = readGit(f.repo, "rev-parse", "HEAD").toString().trim(), path = f.settings.project_procedure;
  if (scenario === "adopted-procedure") record.origin = { kind: "adopted-procedure", commit, path, sha256: sha256(readGit(f.repo, "show", commit + ":" + path)) };
  if (scenario === "changed-scope") selected.actor_id = 21;
  if (scenario === "changed-request") writeFileSync(join(f.artifacts, "current-owner.txt"), "A different request\n");
  const bytes = canonicalJSON(record); writeFileSync(join(f.artifacts, "recovery-authority.json"), bytes, { mode: 0o600 });
  const read = () => readRecoveryAuthority({ source_repo: f.repo, artifact_root: f.artifacts, reference: { path: "recovery-authority.json", sha256: sha256(bytes) },
    purpose: "acknowledgement", scope: selected, adopted_procedure: { repo: f.repo, current_default: commit, path, receipt_ref_prefix: f.settings.publication.receipt_ref_prefix } });
  if (scenario === "matching") expect(read()).toMatchObject({ kind: "owner-delivery-acknowledgement", source: "owner-current-request", scope_sha256: canonicalDigest(selected) });
  else expect(read).toThrow();
});

test("reconciliation authority remains distinct from acknowledgement approval", async () => {
  const { readRecoveryAuthority } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-authority");
  const f = authorityFixture(), selected: ReconciliationScope = { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20,
    operation_id: "original-operation", plan_sha256: hash, lease_ref: "refs/heads/docs-drift-lease", lease_object: "a".repeat(40),
    release_effect_id: "release", retire_effect_ids: ["publication"], retain_receipt: null };
  const source = Buffer.from("Approve only this displayed absent-effect retirement and metadata cleanup.\n");
  writeFileSync(join(f.artifacts, "current-owner.txt"), source, { mode: 0o600 });
  const bytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority", purpose: "reconciliation", scope_sha256s: [canonicalDigest(selected)],
    origin: { kind: "owner-current-request", artifact: { path: "current-owner.txt", sha256: sha256(source) } } });
  writeFileSync(join(f.artifacts, "recovery-authority.json"), bytes, { mode: 0o600 });
  const options = { source_repo: f.repo, artifact_root: f.artifacts, reference: { path: "recovery-authority.json", sha256: sha256(bytes) }, scope: selected };
  expect(readRecoveryAuthority({ ...options, purpose: "reconciliation" })).toEqual(expect.objectContaining({ scope_sha256: canonicalDigest(selected) }));
  expect(() => readRecoveryAuthority({ ...options, purpose: "acknowledgement" })).toThrow();
});


test.each(["matching", "wrong-commit", "wrong-bytes", "extra-origin", "unrelated", "other-repository", "other-operation", "no-retirement", "other-lease-ref", "other-receipt-prefix", "no-receipt-retention", "outside-receipt-ref", "matching-receipt"])("reconciliation can bind only its actual current adopted procedure %s", async scenario => {
  const { readRecoveryAuthority } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-authority");
  const f = authorityFixture(), selected: ReconciliationScope = { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20,
    operation_id: "original-operation", plan_sha256: hash, lease_ref: "refs/heads/docs-drift-lease", lease_object: "a".repeat(40),
    release_effect_id: "release", retire_effect_ids: ["publication"], retain_receipt: null };
  if (["no-receipt-retention", "outside-receipt-ref", "matching-receipt"].includes(scenario)) {
    selected.retain_receipt = { effect_id: "receipt", ref: f.settings.publication.receipt_ref_prefix + selected.operation_id, object: "b".repeat(40) };
    if (scenario === "outside-receipt-ref") selected.retain_receipt.ref = "refs/heads/other-receipt/" + selected.operation_id;
  }
  if (["unrelated", "other-repository", "other-operation", "no-retirement", "other-lease-ref", "other-receipt-prefix", "no-receipt-retention"].includes(scenario)) {
    const path = f.settings.project_procedure;
    let bytes = readGit(f.repo, "show", "HEAD:" + path).toString();
    if (scenario === "unrelated") bytes = "An unrelated but nonempty documentation procedure.\n";
    if (scenario === "other-repository") bytes = bytes.replace("repository: fixture/docs", "repository: other/repo");
    if (scenario === "other-operation") bytes = bytes.replace("operation_prefix: original-", "operation_prefix: elsewhere-");
    if (scenario === "no-retirement") bytes = bytes.replace("absence-retirement, ", "");
    if (scenario === "other-lease-ref") bytes = bytes.replace("lease_ref: refs/heads/docs-drift-lease", "lease_ref: refs/heads/other-lease");
    if (scenario === "other-receipt-prefix") bytes = bytes.replace("receipt_ref_prefix: refs/heads/docs-drift-receipts/", "receipt_ref_prefix: refs/heads/other-receipts/");
    if (scenario === "no-receipt-retention") bytes = bytes.replace("receipt-retention, ", "");
    write(f.repo, path, bytes); commit(f.repo, "synthetic changed permission scope");
  }
  const commitSHA = readGit(f.repo, "rev-parse", "HEAD").toString().trim(), path = f.settings.project_procedure;
  const origin: Record<string, unknown> = { kind: "adopted-procedure", commit: commitSHA, path, sha256: sha256(readGit(f.repo, "show", commitSHA + ":" + path)) };
  if (scenario === "wrong-commit") origin.commit = "a".repeat(40);
  if (scenario === "wrong-bytes") origin.sha256 = "0".repeat(64);
  if (scenario === "extra-origin") origin.approved = true;
  const bytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority", purpose: "reconciliation", scope_sha256s: [canonicalDigest(selected)], origin });
  writeFileSync(join(f.artifacts, "procedure-authority.json"), bytes, { mode: 0o600 });
  const read = () => readRecoveryAuthority({ source_repo: f.repo, artifact_root: f.artifacts, reference: { path: "procedure-authority.json", sha256: sha256(bytes) },
    purpose: "reconciliation", scope: selected, adopted_procedure: { repo: f.repo, current_default: commitSHA, path, receipt_ref_prefix: f.settings.publication.receipt_ref_prefix } });
  if (scenario === "matching" || scenario === "matching-receipt") expect(read()).toEqual(expect.objectContaining({ scope_sha256: canonicalDigest(selected) }));
  else expect(read).toThrow();
});


test("one exact reconciliation approval covers its displayed base and retirement scopes", async () => {
  const { readRecoveryAuthority } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-authority");
  const f = authorityFixture(), base: ReconciliationScope = { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20,
    operation_id: "original-operation", plan_sha256: hash, lease_ref: "refs/heads/docs-drift-lease", lease_object: "a".repeat(40),
    release_effect_id: "release", retire_effect_ids: ["publication"], retain_receipt: null };
  const retirement: ReconciliationScope = { ...base, retirement: { effect_id: "publication", observed_state: "conflict", lookup: { path: join(f.artifacts, "displayed-lookup.json"), sha256: hash } } };
  const source = Buffer.from("Approve both displayed exact metadata recovery scopes.\n");
  writeFileSync(join(f.artifacts, "current-owner.txt"), source, { mode: 0o600 });
  const bytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority", purpose: "reconciliation",
    scope_sha256s: [canonicalDigest(base), canonicalDigest(retirement)], origin: { kind: "owner-current-request", artifact: { path: "current-owner.txt", sha256: sha256(source) } } });
  writeFileSync(join(f.artifacts, "batch-authority.json"), bytes, { mode: 0o600 });
  const options = { source_repo: f.repo, artifact_root: f.artifacts, reference: { path: "batch-authority.json", sha256: sha256(bytes) }, purpose: "reconciliation" as const };
  const first = readRecoveryAuthority({ ...options, scope: base }), second = readRecoveryAuthority({ ...options, scope: retirement });
  expect(first.request_sha256).toBe(second.request_sha256);
  expect(second.scope_sha256).toBe(canonicalDigest(retirement));
  expect(() => readRecoveryAuthority({ ...options, scope: { ...retirement, actor_id: 99 } })).toThrow();
});
