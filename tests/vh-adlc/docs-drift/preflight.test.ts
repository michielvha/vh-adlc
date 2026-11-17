import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { selectProductionRuntime, withRuntimeValidation } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { readAdoptedRolePolicy, roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { commit, ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";
import { installedSettingsFixture } from "./settings-fixture";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { committedConfigurationDigest, normalizedConfigurationDigest, nativeEntryDigest, preflightReviewTarget, upgradeChecks, verifyProductionPreflight } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const proof = "1".repeat(64);

test("configuration digest opts in only through the original committed local-document member", () => {
  const settings = parseSettings(installedSettingsFixture());
  const legacy = normalizedConfigurationDigest(settings);
  const bytes = (metadata: unknown) => Buffer.from("---\n" + canonicalJSON(metadata).toString() + "\n---\n# Companion\n");
  const rows = [{ patterns: ["plans/**"], exclude_patterns: [], kind: "plan", editable_parts: ["frontmatter"] }];
  const coverage = { dialect: "feature", terminal_statuses: ["done"], optional_future_value: ["a", "b"] };
  const metadata = { docs_drift_protection: { local_documents: rows, other_writers: [] }, docs_drift_local_coverage: coverage };
  const { mode: _mode, checklist_path: _path, ...publication } = settings.publication;
  const projected = canonicalDigest({ settings: { ...settings, publication }, docs_drift_protection: { local_documents: rows }, docs_drift_local_coverage: coverage });
  expect(normalizedConfigurationDigest(settings, bytes(metadata))).toBe(projected);
  expect(projected).not.toBe(legacy);
  expect(normalizedConfigurationDigest(settings, bytes({ docs_drift_protection: { other_writers: [] }, docs_drift_local_coverage: coverage }))).toBe(legacy);
  expect(normalizedConfigurationDigest(settings, bytes({ docs_drift_protection: { local_documents: [] } }))).not.toBe(legacy);
  expect(normalizedConfigurationDigest(settings, Buffer.concat([bytes(metadata), Buffer.from("Additional prose\n")]))).toBe(projected);
  expect(normalizedConfigurationDigest(settings, bytes({ ...metadata, docs_drift_protection: { ...metadata.docs_drift_protection,
    other_writers: [{ writer: "current", document: "docs/guide.md", document_sha256: "f".repeat(64) }] } }))).toBe(projected);
  expect(normalizedConfigurationDigest(settings, bytes({ ...metadata, docs_drift_local_coverage: { ...coverage, optional_future_value: ["b", "a"] } }))).not.toBe(projected);
});

test.each(["unchanged", "prose", "optional-value", "remove-marker", "add-marker"])("production checks derive the policy form from each exact source: %s", scenario => {
  const hasMarker = scenario !== "add-marker";
  const original = "---\ndocs_drift_protection: " + JSON.stringify(hasMarker ? { local_documents: [] } : {})
    + "\ndocs_drift_local_coverage: {dialect: feature, terminal_statuses: []}\n---\n# Companion\n";
  const f = preflightFixture(roots, "none", undefined, repo => writeFileSync(join(repo, "docs/docs-procedure.md"), original));
  expect(() => verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component })).not.toThrow();
  const before = readFileSync(join(f.repo, "docs/docs-procedure.md"));
  let next = original;
  if (scenario === "prose") next += "Ordinary documentation change\n";
  if (scenario === "optional-value") next = next.replace("terminal_statuses: []", "terminal_statuses: [], statuses: [planned]");
  if (scenario === "remove-marker") next = next.replace('{"local_documents":[]}', "{}");
  if (scenario === "add-marker") next = next.replace("docs_drift_protection: {}", 'docs_drift_protection: {"local_documents":[]}');
  if (next !== original) { f.write("docs/docs-procedure.md", Buffer.from(next)); commit(f.repo, "Selected companion change"); }
  const check = () => verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component });
  if (["unchanged", "prose"].includes(scenario)) expect(check).not.toThrow();
  else expect(check).toThrow("binding");
  expect(readGit(f.repo, "show", f.candidate + ":docs/docs-procedure.md")).toEqual(before);
  expect(() => verifyProductionPreflight({ repo: f.repo, current_default: f.activationCommit, component: f.component })).not.toThrow();
});

test.each([false, true])("legacy row refresh and writer changes keep their existing path with new-policy marker %s", marker => {
  const f = preflightFixture(roots, "none", undefined, repo => {
    const policy = { ...(marker ? { local_documents: [] } : {}),
      document_kinds: [{ document: "docs/guide.md", document_sha256: sha256(readFileSync(join(repo, "docs/guide.md"))), kind: "ordinary" }] };
    writeFileSync(join(repo, "docs/docs-procedure.md"), "---\ndocs_drift_protection: " + canonicalJSON(policy).toString() + "\n---\n# Companion\n");
  });
  const original = readGit(f.repo, "show", f.activationCommit + ":docs/docs-procedure.md");
  const current = "# Current guide\n";
  f.write("docs/guide.md", Buffer.from(current));
  const policy = { ...(marker ? { local_documents: [] } : {}),
    document_kinds: [{ document: "docs/guide.md", document_sha256: sha256(Buffer.from(current)), kind: "ordinary" }],
    other_writers: [{ writer: "current-session", document: "docs/guide.md", document_sha256: sha256(Buffer.from(current)) }] };
  f.write("docs/docs-procedure.md", Buffer.from("---\ndocs_drift_protection: " + canonicalJSON(policy).toString() + "\n---\n# Changed companion prose\n"));
  commit(f.repo, "Refresh existing document digest and current writer");
  expect(verifyProductionPreflight({ repo: f.repo, current_default: f.head(), component: f.component }).activation_commit).toBe(f.activationCommit);
  expect(readGit(f.repo, "show", f.activationCommit + ":docs/docs-procedure.md")).toEqual(original);
});

test("an earlier reader accepts original proof and refuses the opted-in envelope", async () => {
  const component = ordinaryComponentFixture(roots, true);
  const baseline = "8484a00830739bf0f7d32f28d92bb1a0a59da7bf";
  const path = "plugins/vh-adlc/scripts/docs-drift/preflight.ts";
  writeFileSync(join(component.root, path), readGit(join(import.meta.dir, "../../.."), "show", baseline + ":" + path));
  const earlier = await import(pathToFileURL(join(component.root, path)).href);
  const original = preflightFixture(roots);
  expect(earlier.verifyProductionPreflight({ repo: original.repo, current_default: original.head(), component: original.component }).activation_commit).toBe(original.activationCommit);
  const projected = preflightFixture(roots, "none", undefined, repo => writeFileSync(join(repo, "docs/docs-procedure.md"),
    "---\ndocs_drift_protection: {local_documents: []}\n---\n# Companion\n"));
  expect(() => earlier.verifyProductionPreflight({ repo: projected.repo, current_default: projected.head(), component: projected.component })).toThrow("binding");
  expect(verifyProductionPreflight({ repo: projected.repo, current_default: projected.head(), component: projected.component }).activation_commit).toBe(projected.activationCommit);
});

test("immutable preflight results stay scoped to their exact invocation and publisher", () => {
  const f = preflightFixture(roots), options = { repo: f.repo, current_default: f.head(), component: f.component,
    publisher: { entry: "interactive", identity: { repository: "fixture/docs", repository_id: 10,
      actor: "fixture-owner", actor_id: 30, default_branch: "main" } } };
  const first = withRuntimeValidation(() => {
    const { publisher: _publisher, ...immutable } = options;
    const selected = verifyProductionPreflight(immutable);
    expect(verifyProductionPreflight(options)).toBe(selected);
    expect(verifyProductionPreflight(options)).toBe(selected);
    const worker = { ...options, role: "worker" }, reviewer = { ...options, role: "reviewer" };
    expect(verifyProductionPreflight(worker)).toBe(selected);
    expect(verifyProductionPreflight(reviewer)).toBe(selected);
    expect(() => verifyProductionPreflight({ ...options,
      publisher: { ...options.publisher, identity: { ...options.publisher.identity, actor_id: 999 } } })).toThrow();
    return selected;
  });
  expect(verifyProductionPreflight(options)).not.toBe(first);
  expect(withRuntimeValidation(() => verifyProductionPreflight(options))).not.toBe(first);
});

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

test.each([false, true])("a flat unrelated-component successor retains original native attribution and pending ownership, new-policy marker %s", marker => {
  const f = preflightFixture(roots, "none", undefined, marker ? repo => writeFileSync(join(repo, "docs/docs-procedure.md"),
    "---\ndocs_drift_protection: {local_documents: []}\n---\n# Companion\n") : undefined), path = ".vh-adlc/docs-drift-preflight-successor.yaml";
  const component = { plugin_version: "0.25.1", source_commit: "c".repeat(40), component_sha256: "d".repeat(64) };
  const staged = { ...f.afterSettings, component, publication: { ...f.afterSettings.publication, mode: "staged", checklist_path: path } };
  const adopted = { ...staged, publication: { ...staged.publication, mode: "adopted" } };
  f.write(".vh-adlc/docs-drift.yaml", canonicalJSON(staged));
  const candidate = commit(f.repo, "Synthetic unrelated-component candidate C2");
  const activation = [{ path: ".vh-adlc/docs-drift.yaml", before: { mode: "100644" as const, sha256: sha256(canonicalJSON(staged)) },
    after: { mode: "100644" as const, sha256: sha256(canonicalJSON(adopted)) } }];
  const base = { repository: f.checklist.repository, candidate_commit: candidate, component,
    configuration_sha256: committedConfigurationDigest(f.repo, candidate, parseSettings(staged)), activation };
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
