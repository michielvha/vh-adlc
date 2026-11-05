import { expect, test } from "bun:test";
import { migrationReady, sourceCandidate, type CandidateEvidence, type PublishedEvidence, type Target } from "./migration";
// Deliberately synthetic targets: no fixture identifier is a claim about a real release.
const target: Target = { shared_commit: "synthetic-shared", consumer_commit: "synthetic-consumer", convention_revision: "synthetic-convention", payload_digest: "synthetic-payload" };
function evidence(): CandidateEvidence {
  return { ...target, kind: "local-source-candidate", corpus: { head: target.consumer_commit, outcome: "none", gaps: 0 },
    parity: { shared_commit: target.shared_commit, consumer_commit: target.consumer_commit, payload_digest: target.payload_digest, rebuilt_from_HEAD: true, lost_candidates: 0, unresolved_meaning_changes: 0 },
    inventory: { consumer_commit: target.consumer_commit, complete: true, unresolved_callers: [] },
    rollback: { preserved_unrelated: true, preserved_index: true, refused_conflicts: true, refused_symlinks: true } };
}
function published(): PublishedEvidence {
  return { kind: "published-marketplace", reviewed_payload_digest: target.payload_digest, published_payload_digest: target.payload_digest, convention_revision: target.convention_revision,
    convention_published: true, source_published: true, shared_ci_passed: true,
    hosts: ["codex-cli", "claude-cli"].map(host => ({ host: host as "codex-cli" | "claude-cli", kind: "published-marketplace", payload_digest: target.payload_digest, fresh: true, upgrade: true, discovered: true, standalone: true, preserved_inputs: true, preserved_index: true, credentials_copied: false })),
    existing_operations: { triage_knowledge: true, maintenance_knowledge: true, audit_unwarmed_handoff: true, audit_explicit_setup: true, audit_warmed_offline: true },
    paired_review: { shared_payload_digest: target.payload_digest, consumer_commit: target.consumer_commit, model: "claude-opus-5-5", blocking_or_should_fix: 0, fresh: true } };
}
test("verified local source candidates cannot stand in for published marketplace adoption", () => {
  expect(sourceCandidate(target, evidence())).toEqual([]);
  const result = migrationReady(target, evidence()); expect(result.ready).toBe(false); expect(result.limit).toContain("grants no");
  expect(migrationReady(target, evidence(), published()).ready).toBe(true);
});
test('parity cannot be rebound to a different shared commit', () => {
  const item = evidence(); Object.assign(item.parity, { shared_commit: 'different' });
  expect(sourceCandidate(target, item).length).toBeGreaterThan(0);
});
test.each(["shared", "consumer", "convention", "payload", "corpus", "strict-reader-gap", "loss", "meaning", "stale-index", "inventory", "rollback"])('%s blocks source readiness', change => {
  const item = evidence();
  if (change === "shared") item.shared_commit = "changed";
  if (change === "consumer") item.consumer_commit = "changed";
  if (change === "convention") item.convention_revision = "changed";
  if (change === "payload") item.payload_digest = "changed";
  if (change === "corpus") item.corpus.head = "changed";
  if (change === "strict-reader-gap") { item.corpus.outcome = "incomplete"; item.corpus.gaps = 1; }
  if (change === "loss") item.parity.lost_candidates = 1;
  if (change === "meaning") item.parity.unresolved_meaning_changes = 1;
  if (change === "stale-index") item.parity.rebuilt_from_HEAD = false;
  if (change === "inventory") item.inventory.unresolved_callers.push("new-caller");
  if (change === "rollback") item.rollback.preserved_unrelated = false;
  expect(sourceCandidate(target, item).length).toBeGreaterThan(0);
});
test.each(["source-copy", "missing-host", "duplicate-host", "wrong-payload", "fresh", "upgrade", "discovery", "standalone", "source-write", "index-write", "credentials", "CI", "convention", "old-operations", "cold-audit", "review", "review-target"])('%s cannot pass migration acceptance', change => {
  const item = published();
  if (change === "source-copy") Object.assign(item, { kind: "local-catalog" });
  if (change === "missing-host") item.hosts.pop();
  if (change === "duplicate-host") item.hosts[1].host = "codex-cli";
  if (change === "wrong-payload") item.published_payload_digest = "changed";
  if (change === "fresh") item.hosts[0].fresh = false;
  if (change === "upgrade") item.hosts[0].upgrade = false;
  if (change === "discovery") item.hosts[0].discovered = false;
  if (change === "standalone") item.hosts[0].standalone = false;
  if (change === "source-write") item.hosts[0].preserved_inputs = false;
  if (change === "index-write") item.hosts[0].preserved_index = false;
  if (change === "credentials") item.hosts[0].credentials_copied = true;
  if (change === "CI") item.shared_ci_passed = false;
  if (change === "convention") item.convention_revision = "changed";
  if (change === "old-operations") item.existing_operations.triage_knowledge = false;
  if (change === "cold-audit") item.existing_operations.audit_unwarmed_handoff = false;
  if (change === "review") item.paired_review.blocking_or_should_fix = 1;
  if (change === "review-target") item.paired_review.consumer_commit = "changed";
  expect(migrationReady(target, evidence(), item).ready).toBe(false);
});

test('omitted required observation flags never count as verification', () => {
  const candidate = evidence(), market = published();
  for (const key of Object.keys(candidate.rollback)) Reflect.deleteProperty(candidate.rollback, key);
  expect(sourceCandidate(target, candidate).length).toBeGreaterThan(0);
  for (const key of Object.keys(market.existing_operations)) Reflect.deleteProperty(market.existing_operations, key);
  expect(migrationReady(target, evidence(), market).ready).toBe(false);
});
test('malformed or missing evidence gives a blocked result rather than crashing', () => {
  const candidate = evidence(); Object.assign(candidate, { corpus: null });
  expect(() => sourceCandidate(target, candidate)).not.toThrow();
  const market = published(); Reflect.deleteProperty(market, 'paired_review');
  expect(() => migrationReady(target, evidence(), market)).not.toThrow();
  expect(migrationReady(target, evidence(), market).ready).toBe(false);
});

test('one actual strict-reader failure blocks an otherwise unchanged coverage corpus until a syntax-only repair', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { collectImpact } = await import('../../../plugins/vh-adlc/scripts/docs-impact/collection');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-migration-corpus-'));
  function git(...args: string[]) {
    const result = Bun.spawnSync(['git', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).toBe(0); return result.stdout.toString().trim();
  }
  try {
    fs.mkdirSync(path.join(root, 'docs')); fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Documentation impact roots: ["docs"]\n');
    fs.writeFileSync(path.join(root, 'docs/good.md'), '---\ncovers: ["src/**"]\n---\nGuide.\n');
    const invalid = '---\ndescription: Notes: two\ncovers: ["src/**"]\n---\nPreserve this body.\n';
    fs.writeFileSync(path.join(root, 'docs/bad.md'), invalid);
    git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic corpus');
    const broken = collectImpact({ repo: root, paths: ['src/app.ts'] });
    expect(broken.outcome).toBe('incomplete'); expect(broken.candidates.map(doc => doc.path)).toEqual(['docs/good.md']);
    const currentTarget = { ...target, consumer_commit: git('rev-parse', 'HEAD') };
    const current = evidence(); current.consumer_commit = currentTarget.consumer_commit;
    current.corpus = { head: broken.source.head!, outcome: broken.outcome, gaps: broken.diagnostics.length };
    current.parity.consumer_commit = currentTarget.consumer_commit; current.inventory.consumer_commit = currentTarget.consumer_commit;
    expect(sourceCandidate(currentTarget, current)).toContain('full cutover corpus incomplete or stale');
    const repaired = invalid.replace('description: Notes: two', 'description: "Notes: two"');
    expect(repaired.split('\n').slice(2)).toEqual(invalid.split('\n').slice(2));
    fs.writeFileSync(path.join(root, 'docs/bad.md'), repaired); git('add', 'docs/bad.md'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic syntax correction');
    const fixed = collectImpact({ repo: root, paths: ['src/app.ts'] });
    expect(fixed.outcome).toBe('candidates'); expect(fixed.candidates.map(doc => doc.path)).toEqual(['docs/bad.md', 'docs/good.md']);
    expect(fixed.diagnostics).toEqual([]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
