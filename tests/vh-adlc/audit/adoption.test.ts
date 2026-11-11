import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adoptionPreflight, effectsDigest } from "../../../plugins/vh-adlc/scripts/audit/adoption";
const directories: string[] = [];
const effects = { status: [], reverify: ["ledger-update", "ledger-commit"], full: ["ledger-update", "ledger-commit"], fix: ["source-edit", "ledger-update", "local-commit"] };
function context() {
  const root = mkdtempSync(join(tmpdir(), "audit-adoption-")); chmodSync(root, 0o700); directories.push(root); let sequence = 0;
  const artifact = (text: string) => { const path = `proof-${sequence++}.txt`; writeFileSync(join(root, path), text, { mode: 0o600 }); return { path, sha256: createHash("sha256").update(text).digest("hex") }; };
  const command = (argv: string[], output = "Synthetic native-command fixture.\n") => ({ argv, exit_code: 0, timed_out: false, transcript: artifact(output) });
  const expected = { shared_repository: "example/shared", reviewed_shared_commit: "a".repeat(40), published_source_commit: "b".repeat(40), consumer_repository: "example/project", consumer_commit: "c".repeat(40), version: "0.7.0", payload_digest: "d".repeat(64), review_model: "claude-opus-5.5",
    policy: { agents_blob: "1".repeat(40), settings_blob: "2".repeat(40), procedure_blob: "3".repeat(40), parity_blob: "4".repeat(40), effects_digest: effectsDigest(effects) } };
  const receipt = { schema_version: 1, kind: "published-marketplace", operation: "vh-adlc-audit", recorded_at: "2026-11-02T12:00:00Z", ...expected,
    paired_review: { shared_commit: expected.reviewed_shared_commit, consumer_commit: expected.consumer_commit, result: "NO FINDINGS", model: expected.review_model,
      artifact: artifact("MODEL: claude-opus-5.5\nNO FINDINGS\n") },
    candidate_policy: { kind: "installed-candidate-policy", shared_commit: expected.published_source_commit, consumer_commit: expected.consumer_commit, payload_digest: expected.payload_digest,
      bindings: expected.policy, valid: true, allowed: false, adopted: false,
      command: command(["bun", "/isolated/plugins/cache/vh-adlc/scripts/audit/cli.ts", "policy-candidate", "--default-branch", "main", "--commit", expected.consumer_commit], JSON.stringify({ valid: true, allowed: false, adopted: false, consumer_commit: expected.consumer_commit, bindings: expected.policy, declaration: { effects } })) },
    hosts: ["codex-cli", "claude-cli"].map(host => ({ host, source: "published-marketplace", catalog_repository: expected.shared_repository,
      published_source_commit: expected.published_source_commit, version: expected.version, payload_digest: expected.payload_digest, isolated_profile: true, authentication_copied: false,
      fresh_install: command([host === "codex-cli" ? "codex" : "claude", "plugin", "install", "vh-adlc@vhco-tools"]),
      upgrade: command([host === "codex-cli" ? "codex" : "claude", "plugin", "update", "vh-adlc@vhco-tools"]),
      reinstall: command([host === "codex-cli" ? "codex" : "claude", "plugin", "install", "vh-adlc@vhco-tools"]),
      discovery: { operation: "vh-adlc-audit", command: command([host === "codex-cli" ? "codex" : "claude", "plugin", "details"]) },
      helpers: ["settings", "inventory", "report"].map(stage => ({ stage, input_before_digest: "e".repeat(64), input_after_digest: "e".repeat(64), index_before_digest: "f".repeat(64), index_after_digest: "f".repeat(64),
        command: command(["bun", "/isolated/plugins/cache/vh-adlc/scripts/audit/cli.ts", stage]) })) })),
  };
  return { root, artifact, command, expected, receipt, check: () => adoptionPreflight({ expected, receipt, artifact_root: root }) };
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
test("audit cutover requires matching published targets, both native hosts and actual bound policy/review artifacts", () => {
  const c = context(), result = c.check(); expect(result.pass).toBe(true); expect(result.limit).toContain("attestations");
});
test.each(["local-catalog", "operation", "version", "source", "consumer", "payload", "review-model", "review-bytes", "helper-operation", "policy-commit", "policy-blob", "policy-grant", "policy-effects", "policy-transcript-commit", "policy-transcript-bindings", "policy-absent", "missing-host", "duplicate-host", "upgrade", "native-failure", "source-drift", "index-drift", "credentials-copied"])("%s cannot pass audit adoption", kind => {
  const c = context(), r = c.receipt;
  if (kind === "local-catalog") r.kind = "local-catalog";
  if (kind === "operation") r.operation = "vh-adlc-maintenance";
  if (kind === "version") r.version = "0.6.0";
  if (kind === "source") r.published_source_commit = "0".repeat(40);
  if (kind === "consumer") r.consumer_commit = "0".repeat(40);
  if (kind === "payload") r.hosts[0].payload_digest = "0".repeat(64);
  if (kind === "review-model") r.paired_review.model = "another-model";
  if (kind === "review-bytes") r.paired_review.artifact = c.artifact("MODEL: claude-opus-5.5\nFINDING: missing evidence\n");
  if (kind === "helper-operation") r.hosts[0].helpers[0].command.argv[1] = "/cache/scripts/maintenance/cli.ts";
  if (kind === "policy-commit") r.candidate_policy.consumer_commit = "0".repeat(40);
  if (kind === "policy-blob") r.candidate_policy.bindings = { ...r.candidate_policy.bindings, settings_blob: "0".repeat(40) };
  if (kind === "policy-grant") r.candidate_policy.allowed = true;
  if (kind === "policy-effects") r.candidate_policy.command.transcript = c.artifact(JSON.stringify({ valid: true, allowed: false, declaration: { effects: { ...effects, fix: ["branch-push"] } } }));
  if (kind === "policy-transcript-commit") r.candidate_policy.command.transcript = c.artifact(JSON.stringify({ valid: true, allowed: false, adopted: false, consumer_commit: "0".repeat(40), bindings: c.expected.policy, declaration: { effects } }));
  if (kind === "policy-transcript-bindings") r.candidate_policy.command.transcript = c.artifact(JSON.stringify({ valid: true, allowed: false, adopted: false, consumer_commit: c.expected.consumer_commit, bindings: { ...c.expected.policy, agents_blob: "0".repeat(40) }, declaration: { effects } }));
  if (kind === "policy-absent") delete (r as { candidate_policy?: unknown }).candidate_policy;
  if (kind === "missing-host") r.hosts.pop();
  if (kind === "duplicate-host") r.hosts[1].host = r.hosts[0].host;
  if (kind === "upgrade") delete (r.hosts[0] as { upgrade?: unknown }).upgrade;
  if (kind === "native-failure") r.hosts[0].fresh_install.exit_code = 1;
  if (kind === "source-drift") r.hosts[0].helpers[0].input_after_digest = "0".repeat(64);
  if (kind === "index-drift") r.hosts[0].helpers[0].index_after_digest = "0".repeat(64);
  if (kind === "credentials-copied") r.hosts[0].authentication_copied = true;
  expect(c.check().pass).toBe(false);
});
test("tampered/missing artifact bytes or a path escape block otherwise matching receipts", () => {
  const c = context(); writeFileSync(join(c.root, c.receipt.paired_review.artifact.path), "Changed review\n"); expect(c.check().pass).toBe(false);
  c.receipt.paired_review.artifact = { path: "../escape", sha256: "0".repeat(64) }; expect(c.check().pass).toBe(false);
});
test("effect comparison treats declaration order as irrelevant, without dropping missing effects", () => {
  expect(effectsDigest({ ...effects, reverify: effects.reverify.slice().reverse() })).toBe(effectsDigest(effects));
  expect(effectsDigest({ ...effects, reverify: [] })).not.toBe(effectsDigest(effects));
});

test.each(["CRITERION: AC-01\nVERDICT: not met\nNO FINDINGS\n", "NO FINDINGS\nExtra footer\n"])("mixed paired review content is never a clean result: %s", body => {
  const c = context(); c.receipt.paired_review.artifact = c.artifact("MODEL: claude-opus-5.5\n" + body); expect(c.check().pass).toBe(false);
});
