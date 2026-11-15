import { publisherActor } from "../../../plugins/vh-adlc/scripts/docs-drift/identity";
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifySettingsLeaves, loadCommittedSettings, parseSettings, settingsProjections } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { installedSettingsFixture, settingsFixture } from "./settings-fixture";

const repositories: string[] = [];
afterAll(() => {
  for (const repo of repositories) rmSync(repo, { recursive: true, force: true });
});

test("strict settings preserve ordinary data and classify every recognized leaf once", () => {
  const settings = parseSettings(settingsFixture());
  const leaves = classifySettingsLeaves(settings);
  expect(leaves.length).toBeGreaterThan(70);
  expect(new Set(leaves.map(leaf => JSON.stringify(leaf.path))).size).toBe(leaves.length);
  expect(leaves.every(leaf => ["ordinary", "protected", "trial-setup"].includes(leaf.classification))).toBe(true);
  for (const root of ["roots", "exclusions", "suffixes", "required_detectors", "detector_inputs", "detector_options", "feedback_files"]) {
    expect(leaves.filter(leaf => leaf.path[0] === root).every(leaf => leaf.classification === "ordinary")).toBe(true);
  }
  for (const root of ["scanner", "read_set", "publication", "reports", "execution", "runtime_loader", "clients"]) {
    expect(leaves.filter(leaf => leaf.path[0] === root).every(leaf => leaf.classification === "protected")).toBe(true);
  }
});

test("ordinary options and dormant trial setup cannot alter the protected projection", () => {
  const original = settingsFixture();
  const before = settingsProjections(parseSettings(original));
  const changed = { ...original, roots: ["handbook"], detector_options: { ...original.detector_options, links: { check_history: false } },
    trial: { definition_path: ".vh-adlc/docs-drift-trials/fixture.yaml", definition_sha256: "b".repeat(64) } };
  const parsed = parseSettings(changed);
  const after = settingsProjections(parsed);
  expect(after.protected).toEqual(before.protected);
  expect(after.ordinary).not.toEqual(before.ordinary);
  expect(after.trial_setup).not.toEqual(before.trial_setup);
  expect(classifySettingsLeaves(parsed).filter(leaf => leaf.path[0] === "trial").every(leaf => leaf.classification === "trial-setup")).toBe(true);
  const executionChange = settingsFixture();
  executionChange.scanner.argv.push("--different-execution");
  expect(settingsProjections(parseSettings(executionChange)).protected).not.toEqual(before.protected);
  const narrowed = settingsFixture();
  expect(settingsProjections(parseSettings({ ...narrowed, read_set: { source_roots: ["src"], reference_roots: null } })).protected).not.toEqual(before.protected);
});

test.each([
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, unknown_policy: true }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, schema_version: 2 }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, required_detectors: [] }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, required_detectors: ["links", "links"] }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, detector_inputs: { links: { all_inventory: true } } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, detector_inputs: { ...value.detector_inputs, extra: { all_inventory: true } } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, detector_inputs: { ...value.detector_inputs, links: { all_inventory: true, roots: ["docs"] } } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, roots: ["../foreign"] }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, detector_options: { links: { number: Infinity } } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, scanner: { ...value.scanner, secret_access: true } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, scanner: { ...value.scanner, argv: [] } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, reports: { ...value.reports, hosted: "none" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, reports: { ...value.reports, interactive: "local-attestation" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, runtime_loader: { ...value.runtime_loader, automatic_updates: true } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, runtime_loader: { ...value.runtime_loader, ambient_discovery: true } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, runtime_loader: { ...value.runtime_loader, argv: ["{ambient_path}"] } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, clients: { ...value.clients, "copilot-linux": { ...value.clients["copilot-linux"], distribution_sha256: "missing" } } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, publication: { ...value.publication, closure: "before-merge" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, publication: { ...value.publication, receipt_ref_prefix: value.publication.lease_ref + "/" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, publication: { ...value.publication, lease_ref: "refs/heads/docs-drift" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, publication: { ...value.publication, base: "other" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, reports: { ...value.reports, artifact_name_template: "docs-{run_id}-{run_attempt}}" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, detector_options: { links: new Date() } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, publication: { ...value.publication, mode: "adopted" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, component_pin: ".vh-adlc/docs-drift-components/fixture.yaml", publication: { ...value.publication, mode: "adopted" } }),
  (value: ReturnType<typeof settingsFixture>) => ({ ...value, trial: { definition_path: "trial.yaml", definition_sha256: "b".repeat(64), production_enabled: true } }),
])("unknown, incomplete or unsafe settings are rejected %#", change => {
  expect(() => parseSettings(change(settingsFixture()))).toThrow();
});

test("explicit null option data remains distinct from omitted options", () => {
  const value = settingsFixture();
  expect(parseSettings({ ...value, detector_options: { links: null } }).detector_options).toEqual({ links: null, claims: {} });
});

test("omitted read bounds become explicit conservative nulls and remain protected", () => {
  const { read_set: _readSet, ...value } = settingsFixture();
  const parsed = parseSettings(value);
  expect(parsed.read_set).toEqual({ source_roots: null, reference_roots: null });
  expect(settingsProjections(parsed).protected.read_set).toEqual(parsed.read_set);
});

test("configured Git path identities retain literal leading/trailing whitespace", () => {
  const value = settingsFixture();
  const parsed = parseSettings({ ...value, roots: [" docs "], feedback_files: ["docs/ feedback.yaml "] });
  expect(parsed.roots).toEqual([" docs "]);
  expect(parsed.feedback_files).toEqual(["docs/ feedback.yaml "]);
});

test("explicit empty read bounds and detector selectors retain their zero-input meaning", () => {
  const value = settingsFixture();
  const parsed = parseSettings({ ...value, read_set: { source_roots: [], reference_roots: [] },
    detector_inputs: { ...value.detector_inputs, claims: { roots: [], exclusions: [], suffixes: [] } } });
  expect(parsed.read_set).toEqual({ source_roots: [], reference_roots: [] });
  expect(parsed.detector_inputs.claims).toEqual({ roots: [], exclusions: [], suffixes: [] });
});

test("committed settings use exact selected Git bytes, reject suffix conflicts and preserve dirty caller state", () => {
  const repo = mkdtempSync(join(tmpdir(), "vh-drift-settings-"));
  repositories.push(repo);
  mkdirSync(join(repo, ".vh-adlc"));
  const raw = Buffer.from("# Exact synthetic committed bytes\n" + JSON.stringify(settingsFixture(), null, 2) + "\n");
  writeFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), raw);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-qm", "fixture");
  const commit = git("rev-parse", "HEAD");
  writeFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), "invalid: [dirty\n");
  writeFileSync(join(repo, ".git/FETCH_HEAD"), "preserve fetch state\n");
  const index = readFileSync(join(repo, ".git/index"));
  const result = loadCommittedSettings(repo, commit);
  expect(result.settings.repository).toBe("fixture/docs");
  expect(result.settings_sha256).toBe(createHash("sha256").update(raw).digest("hex"));
  expect(result.source_commit).toBe(commit);
  expect(readFileSync(join(repo, ".git/index"))).toEqual(index);
  expect(readFileSync(join(repo, ".git/FETCH_HEAD"), "utf8")).toBe("preserve fetch state\n");
  expect(readFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), "utf8")).toBe("invalid: [dirty\n");
  expect(() => loadCommittedSettings(repo, "HEAD")).toThrow();
  writeFileSync(join(repo, ".vh-adlc/docs-drift.json"), "{}\n");
  git("add", ".vh-adlc/docs-drift.json");
  git("commit", "-qm", "suffix conflict");
  expect(() => loadCommittedSettings(repo, git("rev-parse", "HEAD"))).toThrow();
  expect(loadCommittedSettings(repo, commit).settings_sha256).toBe(result.settings_sha256);
});


test("the accepted publication block is the only adoption and per-operation PR-state authority", () => {
  const base = settingsFixture(), publication = base.publication;
  const input = { ...base, publication: { ...publication, mode: "staged", adoption_record: ".vh-adlc/docs-drift-adoptions/fixture.yaml",
    pr_state: { advisory: "ready", resolve: "draft" } } };
  const parsed = parseSettings(input);
  expect(parsed.publication).toMatchObject({ mode: "staged", adoption_record: input.publication.adoption_record,
    pr_state: { advisory: "ready", resolve: "draft" } });
  expect(Object.hasOwn(parsed, "adoption")).toBe(false);
  const before = settingsProjections(parsed).protected;
  expect(settingsProjections(parseSettings({ ...input, publication: { ...input.publication, pr_state: { advisory: "draft", resolve: "draft" } } })).protected).not.toEqual(before);
  for (const changed of [
    { ...input, adoption: { mode: "adopted", record_path: input.publication.adoption_record } },
    { ...input, publication: { ...input.publication, pr_draft: false } },
    { ...input, publication: { ...input.publication, mode: "rolled-back" } },
    { ...input, publication: { ...input.publication, adoption_record: "../foreign.yaml" } },
    { ...input, publication: { ...input.publication, mode: undefined } },
    { ...input, publication: { ...input.publication, adoption_record: undefined } },
    { ...input, publication: { ...input.publication, pr_state: undefined } },
    { ...input, publication: { ...input.publication, pr_state: { advisory: "ready" } } },
    { ...input, publication: { ...input.publication, pr_state: { advisory: "ready", resolve: "unknown" } } },
    { ...input, publication: { ...input.publication, pr_state: { advisory: "ready", resolve: "draft", fallback: "draft" } } },
  ]) expect(() => parseSettings(changed)).toThrow();
});


test("ordinary settings use configured client commands and harness-neutral entry profiles", () => {
  const settings = parseSettings(installedSettingsFixture());
  expect(settings.schema_version).toBe(2);
  expect(settings.clients.copilot).toEqual({ provider: "copilot", executable: "copilot" });
  expect(Object.keys(settings.execution.entries)).toEqual(["interactive", "hosted"]);
  expect(settings.publication.checklist_path).toBe(".vh-adlc/docs-drift-preflight.yaml");
  expect(settings.component?.plugin_version).toBe("0.25.0");
  expect(settings.credential_references).toEqual(["COPILOT_GITHUB_TOKEN"]);
  expect(Object.hasOwn(settings, "runtime_loader")).toBe(false);
  expect(Object.hasOwn(settings, "component_pin")).toBe(false);
  expect(settingsProjections(settings).protected.clients).toEqual(settings.clients);
});


test("publisher selection binds a configured profile independently of the invoking harness", () => {
  const settings = parseSettings(installedSettingsFixture());
  expect(publisherActor(settings, "interactive")).toBe("fixture-owner");
  expect(publisherActor(settings, "hosted")).toBe("fixture-bot");
  expect(() => publisherActor(settings, "unknown-profile")).toThrow("publisher entry required");
});

test("ordinary settings reject obsolete setup and incomplete review-bound policy", () => {
  const input = installedSettingsFixture();
  for (const changed of [
    { ...input, schema_version: 3 },
    { ...input, protocol_version: 2 },
    { ...input, runtime_loader: settingsFixture().runtime_loader },
    { ...input, component_pin: "old-pin.yaml" },
    { ...input, clients: { copilot: settingsFixture().clients["copilot-linux"] } },
    { ...input, publication: { ...input.publication, adoption_record: "old-adoption.yaml" } },
    { ...input, publication: { ...input.publication, mode: "adopted", checklist_path: null } },
    { ...input, component: { ...input.component, component_sha256: "unknown" } },
    { ...input, publication: { ...input.publication, entry_actors: { hosted: "fixture-bot" } } },
    { ...input, pr_discovery: { ...input.pr_discovery, authors: ["fixture-owner"] } },
    { ...input, pr_discovery: { ...input.pr_discovery, branch_prefixes: ["other/"] } },
  ]) expect(() => parseSettings(changed)).toThrow();
  expect(parseSettings(settingsFixture()).schema_version).toBe(1);
  const baseline = settingsProjections(parseSettings(input)).protected;
  for (const changed of [
    { ...input, component: { ...input.component, plugin_version: "0.26.0" } },
    { ...input, credential_references: ["GH_TOKEN"] },
    { ...input, clients: { copilot: { ...input.clients.copilot, executable: "/different/copilot" } } },
  ]) expect(settingsProjections(parseSettings(changed)).protected).not.toEqual(baseline);
});
