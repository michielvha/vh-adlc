import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { publicationFixture } from "./publication-fixture";
import { installedSettingsFixture } from "./settings-fixture";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { CORE_PREFLIGHT_CHECKS, normalizedConfigurationDigest, nativeEntryDigest, preflightReviewTarget, upgradeChecks, verifyProductionPreflight } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const proof = "1".repeat(64);
function commit(repo: string, message: string) {
  readGit(repo, "add", "--all");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", message);
  return readGit(repo, "rev-parse", "HEAD").toString().trim();
}
function fixture(fault = "none") {
  const f = publicationFixture(roots), baseSettings = installedSettingsFixture(), configured = { ...baseSettings, reports: { ...baseSettings.reports, workflow_id: 100 } }, path = configured.publication.checklist_path;
  for (const entry of Object.values(configured.execution.entries)) for (const role of [entry.worker, entry.reviewer]) {
    role.model = "claude-opus-5.5";
    Object.assign(role, { identity_source: { provider: "copilot", event_type: "assistant.message", field_path: ["data", "model"] } });
  }
  const write = (path: string, bytes: Uint8Array) => { mkdirSync(dirname(join(f.repo, path)), { recursive: true }); writeFileSync(join(f.repo, path), bytes); };
  const before = canonicalJSON(configured), afterSettings = { ...configured, publication: { ...configured.publication, mode: "adopted" } };
  const after = canonicalJSON(afterSettings);
  write(".vh-adlc/docs-drift.yaml", before); write("scripts/entry.txt", Buffer.from("legacy\n"));
  const candidate = commit(f.repo, "Synthetic staged candidate C"), settings = parseSettings(configured), component = configured.component;
  const activation = [{ path: ".vh-adlc/docs-drift.yaml", before: { mode: "100644" as const, sha256: sha256(before) }, after: { mode: "100644" as const, sha256: sha256(after) } },
    { path: "scripts/entry.txt", before: { mode: "100644" as const, sha256: sha256(Buffer.from("legacy\n")) }, after: { mode: "100644" as const, sha256: sha256(Buffer.from("shared\n")) } }];
  const base = { repository: settings.repository, candidate_commit: candidate, component,
    configuration_sha256: normalizedConfigurationDigest(settings), activation };
  const checklist = { schema_version: 1, kind: "docs-drift-preflight", ...base, changes: ["initial"],
    review: { target_sha256: preflightReviewTarget(base), evidence_sha256: proof, model: "claude-opus-5.5" },
    checks: CORE_PREFLIGHT_CHECKS.map(name => ({ name, status: "passed", component, consumer_commit: candidate, evidence_sha256: proof,
      target_sha256: preflightReviewTarget(base), note: "Synthetic applicability check. Original native observations retain their own targets." })),
    native_entries: Object.fromEntries(Object.entries(settings.execution.entries).map(([entry]) => [entry, {
      entry_sha256: nativeEntryDigest(settings, entry), worker_model: "claude-opus-5.5", reviewer_model: "claude-opus-5.5",
      publisher: { actor: entry === "hosted" ? "fixture-bot" : "fixture-owner", actor_id: entry === "hosted" ? 20 : 30 },
      component, consumer_commit: candidate, evidence_sha256: proof,
    }])), pending_operations: [] };
  if (fault === "missing-check") checklist.checks.pop();
  if (fault === "wrong-component") checklist.component = { ...component, component_sha256: "f".repeat(64) };
  if (fault === "wrong-review") checklist.review.target_sha256 = "f".repeat(64);
  if (fault === "unknown-change") checklist.changes = ["unclassified"];
  if (fault === "missing-entry") delete checklist.native_entries.interactive;
  if (fault === "changed-entry") checklist.native_entries.interactive.entry_sha256 = "f".repeat(64);
  if (fault === "forged-original-entry") checklist.native_entries.interactive.consumer_commit = f.plan.manifest.bindings.source_commit;
  if (fault === "intervening") { write("unrelated.txt", Buffer.from("Intervening commit\n")); commit(f.repo, "Intervening before activation"); }
  write(path, canonicalJSON(checklist)); write(".vh-adlc/docs-drift.yaml", after); write("scripts/entry.txt", Buffer.from("shared\n"));
  if (fault === "extra-change") write("unapproved.txt", Buffer.from("Unexpected activation change\n"));
  const activationCommit = commit(f.repo, "Synthetic reviewed activation D");
  if (fault === "later-policy") { write(".vh-adlc/docs-drift.yaml", canonicalJSON({ ...afterSettings, roots: ["other-docs"] })); commit(f.repo, "Unreviewed policy change"); }
  if (fault === "later-activation") { write("scripts/entry.txt", Buffer.from("unreviewed\n")); commit(f.repo, "Unreviewed activation file"); }
  return { ...f, candidate, activationCommit, checklist, component, afterSettings, head: () => readGit(f.repo, "rev-parse", "HEAD").toString().trim(), write };
}

test("a flat checklist gates the direct reviewed activation without future switch evidence", () => {
  const f = fixture(), verified = verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component });
  expect(verified.activation_commit).toBe(f.activationCommit);
  expect(verified.policy_sha256).toHaveLength(64);
  expect(verified.checklist.pending_operations).toEqual([]);
  f.write("unrelated-product.txt", Buffer.from("Later unrelated product change\n")); commit(f.repo, "Unrelated later default");
  expect(verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component }).activation_commit).toBe(f.activationCommit);
});

test.each(["missing-check", "wrong-component", "wrong-review", "unknown-change", "missing-entry", "changed-entry", "forged-original-entry", "intervening", "extra-change", "later-policy", "later-activation"])("flat preflight refuses %s", fault => {
  const f = fixture(fault);
  expect(() => verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component })).toThrow();
});

test("native evidence for an unaffected provider keeps its original configuration binding", () => {
  const settings = parseSettings(installedSettingsFixture()), digest = nativeEntryDigest(settings, "interactive");
  const changed = { ...settings, credential_references: [...settings.credential_references, "CLAUDE_CODE_OAUTH_TOKEN"] };
  expect(nativeEntryDigest(changed, "interactive")).toBe(digest);
});

test("a normal integration merge retains the reviewed C-to-D activation", () => {
  const f = fixture();
  readGit(f.repo, "switch", "-c", "integration", f.candidate);
  f.write("unrelated-product.txt", Buffer.from("Concurrent product work\n")); commit(f.repo, "Unrelated integration parent");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "merge", "--no-ff", "--no-edit", "main");
  expect(verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component }).activation_commit).toBe(f.activationCommit);
});

test("staged policy and a different installed payload cannot authorize production", () => {
  const f = fixture();
  expect(() => verifyProductionPreflight({ repo: f.repo, current_default: f.candidate, component: f.component })).toThrow("adopted");
  expect(() => verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: { ...f.component, component_sha256: "f".repeat(64) } })).toThrow("installed component");
});

test("upgrade checks repeat the selected fixed rows and take the union for mixed changes", () => {
  expect(upgradeChecks(["component_unrelated"])).toEqual(["published_install", "installed_routing"]);
  expect(upgradeChecks(["workflow_pin"])).toContain("workflow_validation");
  expect(upgradeChecks(["workflow_runtime_permissions"])).toContain("native_trials");
  expect(upgradeChecks(["procedure_report", "scanner_scope_feedback", "effects_recovery"])).toEqual([
    "published_install", "installed_routing", "documents_package", "scanner_parity", "effects_recovery",
  ]);
  expect(() => upgradeChecks(["initial", "workflow_pin"])).toThrow();
});

test("a flat unrelated-component successor retains original native attribution and pending ownership", () => {
  const f = fixture(), path = ".vh-adlc/docs-drift-preflight-successor.yaml";
  const component = { plugin_version: "0.25.1", source_commit: "c".repeat(40), component_sha256: "d".repeat(64) };
  const staged = { ...f.afterSettings, component, publication: { ...f.afterSettings.publication, mode: "staged", checklist_path: path } };
  const adopted = { ...staged, publication: { ...staged.publication, mode: "adopted" } };
  f.write(".vh-adlc/docs-drift.yaml", canonicalJSON(staged));
  const candidate = commit(f.repo, "Synthetic unrelated-component candidate C2");
  const activation = [{ path: ".vh-adlc/docs-drift.yaml", before: { mode: "100644" as const, sha256: sha256(canonicalJSON(staged)) },
    after: { mode: "100644" as const, sha256: sha256(canonicalJSON(adopted)) } }];
  const base = { repository: f.checklist.repository, candidate_commit: candidate, component,
    configuration_sha256: normalizedConfigurationDigest(parseSettings(staged)), activation };
  const target = preflightReviewTarget(base);
  const checklist = { ...f.checklist, ...base, changes: ["component_unrelated"],
    review: { target_sha256: target, evidence_sha256: "2".repeat(64), model: "claude-opus-5.5" },
    checks: f.checklist.checks.map(check => ["published_install", "installed_routing"].includes(check.name)
      ? { ...check, component, consumer_commit: candidate, target_sha256: target, evidence_sha256: "2".repeat(64), note: "Repeated for the current payload and activation." }
      : { ...check, note: "Original source and evidence retained. Native roles, scanner and recovery contracts are unchanged in this synthetic case." }),
    pending_operations: [{ operation_id: "pending-original", component: f.component, lease_ref: "refs/heads/docs-drift-lease", lease_object: "e".repeat(40), preserved: true }] };
  f.write(path, canonicalJSON(checklist)); f.write(".vh-adlc/docs-drift.yaml", canonicalJSON(adopted));
  commit(f.repo, "Synthetic reviewed successor D2");
  const result = verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component });
  expect(result.checklist.native_entries).toEqual(f.checklist.native_entries);
  expect(result.checklist.pending_operations[0].component).toEqual(f.component);
  expect(result.checklist.checks.find(check => check.name === "native_trials")?.target_sha256).toBe(f.checklist.review.target_sha256);
  expect(result.authority).toBe("none");
});
