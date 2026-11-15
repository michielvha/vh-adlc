import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { selectProductionRuntime } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { readAdoptedRolePolicy, roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { join } from "node:path";
import { commit, ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";
import { installedSettingsFixture } from "./settings-fixture";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { normalizedConfigurationDigest, nativeEntryDigest, preflightReviewTarget, upgradeChecks, verifyProductionPreflight } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const proof = "1".repeat(64);

test("a flat checklist gates the direct reviewed activation without future switch evidence", () => {
  const f = preflightFixture(roots), verified = verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component });
  expect(verified.activation_commit).toBe(f.activationCommit);
  expect(verified.policy_sha256).toHaveLength(64);
  expect(verified.checklist.pending_operations).toEqual([]);
  f.write("unrelated-product.txt", Buffer.from("Later unrelated product change\n")); commit(f.repo, "Unrelated later default");
  expect(verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component }).activation_commit).toBe(f.activationCommit);
});

test.each(["missing-check", "wrong-component", "wrong-review", "unknown-change", "missing-entry", "changed-entry", "forged-original-entry", "intervening", "extra-change", "later-policy", "later-activation"])("flat preflight refuses %s", fault => {
  const f = preflightFixture(roots, fault);
  expect(() => verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component })).toThrow();
});

test("native evidence for an unaffected provider keeps its original configuration binding", () => {
  const settings = parseSettings(installedSettingsFixture()), digest = nativeEntryDigest(settings, "interactive");
  const changed = { ...settings, credential_references: [...settings.credential_references, "CLAUDE_CODE_OAUTH_TOKEN"] };
  expect(nativeEntryDigest(changed, "interactive")).toBe(digest);
});

test("a normal integration merge retains the reviewed C-to-D activation", () => {
  const f = preflightFixture(roots);
  readGit(f.repo, "switch", "-c", "integration", f.candidate);
  f.write("unrelated-product.txt", Buffer.from("Concurrent product work\n")); commit(f.repo, "Unrelated integration parent");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "merge", "--no-ff", "--no-edit", "main");
  expect(verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component }).activation_commit).toBe(f.activationCommit);
});

test("staged policy and a different installed payload cannot authorize production", () => {
  const f = preflightFixture(roots);
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
  const f = preflightFixture(roots), path = ".vh-adlc/docs-drift-preflight-successor.yaml";
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


test.each(["matching", "recased", "wrong-id", "wrong-login", "wrong-repository-id", "wrong-repository", "wrong-default"] as const)("flat runtime policy binds the native publisher %s", scenario => {
  const f = preflightFixture(roots), identity = { repository: "fixture/docs", repository_id: 10, default_branch: "main", actor: "fixture-owner", actor_id: 30 };
  if (scenario === "recased") identity.actor = "Fixture-Owner";
  if (scenario === "wrong-id") identity.actor_id = 31;
  if (scenario === "wrong-login") identity.actor = "different-owner";
  if (scenario === "wrong-repository-id") identity.repository_id = 11;
  if (scenario === "wrong-repository") identity.repository = "fixture/different";
  if (scenario === "wrong-default") identity.default_branch = "different";
  const check = () => verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component,
    publisher: { entry: "interactive", identity } });
  if (scenario === "matching" || scenario === "recased") expect(check().policy_sha256).toHaveLength(64);
  else expect(check).toThrow("native");
});


test.each(["matching", "staged", "wrong-publisher", "changed-payload"] as const)("ordinary production runtime selects flat native policy %s", async scenario => {
  const { directory, executable, calls, identity } = ordinaryComponentFixture(roots);
  const f = preflightFixture(roots, "none", { component: identity, executable });
  const publisher = { repository: "fixture/docs", repository_id: 10, default_branch: "main", actor: "fixture-owner", actor_id: scenario === "wrong-publisher" ? 31 : 30 };
  if (scenario === "changed-payload") writeFileSync(join(directory, "extra.txt"), "Unreleased extra payload\n");
  const select = () => selectProductionRuntime({ repo: f.repo, current_default: scenario === "staged" ? f.candidate : f.head(), directory, entry: "interactive", identity: publisher });
  if (scenario !== "matching") {
    await expect(select()).rejects.toThrow();
    expect(() => readFileSync(calls)).toThrow();
    return;
  }
  const selected = await select();
  expect(selected.authentication).toBe("native");
  expect(selected.policy_sha256).toBe(verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component }).policy_sha256);
  expect(readAdoptedRolePolicy({ repo: f.repo, current_default: f.head(), identity: publisher, runtime: selected, role: "reviewer" }).adopted_model).toBe("claude-opus-5.5");
  const digest = roleRuntimeDigest(selected, "worker"), observations = readFileSync(calls, "utf8");
  expect(observations).toContain("--version"); expect(observations).toContain("--help");
  expect(observations).not.toContain("--prompt");
  expect(roleRuntimeDigest({ ...selected, worker: { ...selected.worker, version: "1.0.113" } }, "worker")).toBe(digest);
  expect(readFileSync(calls, "utf8")).toBe(observations);
});
