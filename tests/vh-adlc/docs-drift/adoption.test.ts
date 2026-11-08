import { source as adoptionSource, pin, write, commit, runtimeIdentity, portableRecord, deliverRecord } from "./adoption-fixture";
import * as bootstrap from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectAdoptionBindings, parseComponentPin, verifyCutoverAssembly } from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { readGitWithEnvironment as gitWithInput } from "../../../plugins/vh-adlc/scripts/git-read";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture } from "./publication-fixture";
import { parseClientBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { settingsFixture } from "./settings-fixture";
import { hash } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function source(options: Parameters<typeof adoptionSource>[1] = {}) { return adoptionSource(roots, options); }

test("component pins require exact source, release, plugin version and complete payload identity", () => {
  expect(parseComponentPin(pin())).toEqual(pin());
  for (const value of [{ ...pin(), source_commit: "main" }, { ...pin(), source_release: "latest" },
    { ...pin(), plugin_version: "latest" }, { ...pin(), component_sha256: "unknown" },
    { ...pin(), source_repository: "https://example.invalid/shared" }, { ...pin(), approved: true },
    { ...pin(), schema_version: 2 }, { ...pin(), source_release: undefined }]) {
    expect(() => parseComponentPin(value)).toThrow();
  }
});

test("protected inputs use committed source and the existing ordinary/trial/protected classification", () => {
  const f = source();
  const initial = collectAdoptionBindings(f.repo, f.candidate);
  expect(initial.component_pin.value).toEqual(pin());
  const before = captureRepositoryState(f.repo);
  write(f.repo, f.configured.runtime_loader.launcher, "uncommitted launcher replacement\n");
  expect(collectAdoptionBindings(f.repo, f.candidate)).toEqual(initial);
  write(f.repo, f.configured.runtime_loader.launcher, "Synthetic protected input " + f.configured.runtime_loader.launcher + "\n");
  expect(captureRepositoryState(f.repo)).toEqual(before);
  write(f.repo, "docs/guide.md", "Ordinary document correction\n");
  write(f.repo, f.configured.scanner.script, "Updated ordinary detector rules\n");
  const ordinary = { ...f.configured, detector_options: { ...f.configured.detector_options, links: { check_history: false } },
    trial: { definition_path: ".vh-adlc/docs-drift-trials/later.yaml", definition_sha256: hash("dormant trial") } };
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(ordinary));
  const advanced = collectAdoptionBindings(f.repo, commit(f.repo, "ordinary input advance"));
  expect(advanced.protected_sha256).toBe(initial.protected_sha256);
  expect(advanced.source_commit).not.toBe(initial.source_commit);
  write(f.repo, f.configured.runtime_loader.launcher, "Changed protected launcher\n");
  expect(collectAdoptionBindings(f.repo, commit(f.repo, "protected input advance")).protected_sha256).not.toBe(initial.protected_sha256);
});

test("missing or symlinked protected source and malformed pin bytes cannot establish adoption inputs", () => {
  for (const kind of ["missing", "symlink", "malformed-pin"]) {
    const f = source();
    if (kind === "malformed-pin") write(f.repo, f.configured.component_pin, "schema_version: 1\nschema_version: 1\n");
    else {
      rmSync(join(f.repo, f.configured.runtime_loader.launcher));
      if (kind === "symlink") readGit(f.repo, "update-index", "--add", "--cacheinfo", "120000," + readGit(f.repo, "hash-object", "README.md").toString().trim() + "," + f.configured.runtime_loader.launcher);
    }
    const current = kind === "symlink" ? (() => {
      readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "synthetic symlink");
      return readGit(f.repo, "rev-parse", "HEAD").toString().trim();
    })() : commit(f.repo, "invalid adoption inputs");
    expect(() => collectAdoptionBindings(f.repo, current)).toThrow();
  }
});

test("cutover assembly allows only the selected record as the exact direct child's change", () => {
  const f = source(), path = f.configured.publication.adoption_record;
  write(f.repo, path, "schema_version: 1\nsource_candidate: " + f.candidate + "\n");
  const delivery = commit(f.repo, "record-only cutover child");
  const before = captureRepositoryState(f.repo);
  const assembled = verifyCutoverAssembly({ repo: f.repo, source_candidate: f.candidate, delivery_commit: delivery, record_path: path });
  expect(assembled.source_candidate).toBe(f.candidate);
  expect(assembled.record.path).toBe(path);
  expect(assembled.bindings.source_commit).toBe(f.candidate);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  write(f.repo, "README.md", "unrelated change\n");
  const later = commit(f.repo, "extra change after record");
  expect(() => verifyCutoverAssembly({ repo: f.repo, source_candidate: f.candidate, delivery_commit: later, record_path: path })).toThrow();
});

test("cutover rejects a second changed path even when the selected record is present", () => {
  const f = source(), path = f.configured.publication.adoption_record;
  write(f.repo, path, "schema_version: 1\nsource_candidate: " + f.candidate + "\n");
  write(f.repo, "README.md", "unrelated change\n");
  const delivery = commit(f.repo, "mixed cutover child");
  expect(() => verifyCutoverAssembly({ repo: f.repo, source_candidate: f.candidate, delivery_commit: delivery, record_path: path })).toThrow();
});

test("production adoption requires a committed record and adopted current-default policy", () => {
  const f = source();
  expect(typeof adoption.verifyRuntimeAdoption).toBe("function");
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: f.candidate })).toThrow("record");
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured,
    publication: { ...f.configured.publication, mode: "staged" } }));
  const staged = commit(f.repo, "synthetic rolled-back publication policy");
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: staged })).toThrow("not adopted");
});


test("portable owner attestation validates a non-circular record-only child without private artifacts", () => {
  const f = source(), record = portableRecord(f), delivery = deliverRecord(f, record), before = captureRepositoryState(f.repo);
  const checked = adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity });
  expect(checked.evidence).toBe("owner-attestation");
  expect(checked.source_candidate).toBe(f.candidate);
  expect(checked.delivery_commit).toBe(delivery);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery })).toThrow("native adoption identity");
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery,
    identity: { ...runtimeIdentity, repository_id: 11 } })).toThrow("native adoption identity");
});

for (const invalid of ["test-only", "missing-history", "incomplete-entry", "changed-model", "changed-client", "unknown-observation", "active-run", "missing-freeze", "predecessor"] as const) {
  test(`portable adoption refuses ${invalid} evidence despite a passing outer claim`, () => {
    const f = source(), record = portableRecord(f);
    if (invalid === "test-only") record.receipts.copilot_entry!.evidence_kind = "test-only";
    if (invalid === "missing-history") delete record.receipts.history_read;
    if (invalid === "incomplete-entry") record.receipts.claude_entry!.observations.closure = false;
    if (invalid === "changed-model") record.receipts.copilot_entry!.reviewer_model = "different-model";
    if (invalid === "changed-client") record.receipts.copilot_entry!.client_bindings["copilot-linux"] = {
      ...f.configured.clients["copilot-linux"], distribution_sha256: "b".repeat(64) };
    if (invalid === "unknown-observation") record.receipts.hosted_advisory!.observations.silent_override = true;
    if (invalid === "active-run") Object.assign(record.receipts.quiescence!, { queued_run_ids: [7] });
    if (invalid === "missing-freeze") record.receipts.quiescence!.observations.interactive_frozen = false;
    if (invalid === "predecessor") Object.assign(record, { predecessor: { evidence_kind: "test-only", source_candidate: f.candidate } });
    const delivery = deliverRecord(f, record);
    expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity })).toThrow();
  });
}

test("ordinary source and dormant trial changes preserve the selected portable attestation", () => {
  const f = source(), delivery = deliverRecord(f, portableRecord(f));
  write(f.repo, "docs/guide.md", "Ordinary document advance\n");
  write(f.repo, f.configured.scanner.script, "Ordinary detector advance\n");
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured,
    detector_options: { ...f.configured.detector_options, links: { check_history: false } },
    trial: { definition_path: ".vh-adlc/docs-drift-trials/later.yaml", definition_sha256: hash("dormant later definition") } }));
  const current = commit(f.repo, "ordinary assessment inputs and dormant setup");
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity }).delivery_commit).toBe(delivery);
  write(f.repo, f.configured.runtime_loader.launcher, "Changed protected loader\n");
  const protectedAdvance = commit(f.repo, "protected execution change");
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: protectedAdvance, identity: runtimeIdentity })).toThrow("protected record bindings");
});

test("a historical adoption-record edit remains invalid after its bytes are restored", () => {
  const f = source(), record = portableRecord(f);
  deliverRecord(f, record);
  write(f.repo, f.configured.publication.adoption_record, canonicalJSON({ ...record, kind: "changed" }));
  commit(f.repo, "historical record modification");
  const current = deliverRecord(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity })).toThrow("immutable adoption record");
});

test("a red advisory trial can retain only its declared expected attention failure", () => {
  const f = source(), record = portableRecord(f), trial = record.receipts.hosted_advisory!;
  trial.outcome = "trial-passed-expected-new-attention"; trial.native_conclusion = "failure";
  trial.observations.only_attention_step_failed = true;
  const delivery = deliverRecord(f, record);
  const checked = adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity });
  expect(checked.receipts).toEqual(record.receipts);
  expect(checked.receipts).toMatchObject({ hosted_advisory: { native_conclusion: "failure" } });
});

test("an observed entry receipt must retain its protected native client identities", () => {
  const f = source(), record = portableRecord(f);
  Reflect.deleteProperty(record.receipts.copilot_entry!, "client_bindings");
  const delivery = deliverRecord(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity })).toThrow();
});

test("an alternate C child cannot hide an earlier adopted record and its later edit", () => {
  const f = source(), original = portableRecord(f);
  deliverRecord(f, original);
  const replacement = portableRecord(f);
  replacement.receipts.paired_review!.artifact_sha256 = hash("different original review");
  deliverRecord(f, replacement);
  readGit(f.repo, "switch", "-c", "alternate-cutover", f.candidate);
  deliverRecord(f, replacement);
  readGit(f.repo, "switch", "main");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "merge", "--no-ff", "--no-edit", "alternate-cutover");
  const current = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity })).toThrow();
});

test("an unrelated receipt commit cannot replace its bound source target", () => {
  const f = source(), record = portableRecord(f);
  record.receipts.copilot_entry!.source_commit = "e".repeat(40);
  const delivery = deliverRecord(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity })).toThrow();
});

test("quiescence retains native workflow state and the observed drained run results", () => {
  const f = source(), record = portableRecord(f);
  Reflect.deleteProperty(record.receipts.quiescence!, "workflow_state");
  Reflect.deleteProperty(record.receipts.quiescence!, "drained_runs");
  const delivery = deliverRecord(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity })).toThrow();
});

test("native repository and actor casing preserves authoritative numeric identities", () => {
  const f = source(), delivery = deliverRecord(f, portableRecord(f));
  const checked = adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery,
    identity: { ...runtimeIdentity, repository: "Fixture/Docs", actor: "Fixture-Bot" } });
  expect(checked.identity.repository_id).toBe(runtimeIdentity.repository_id);
  expect(checked.identity.actor_id).toBe(runtimeIdentity.actor_id);
});

for (const invalid of ["false-flag", "missing-flag", "success-conclusion", "non-hosted"] as const) {
  test(`expected red attention refuses ${invalid}`, () => {
    const f = source(), record = portableRecord(f), trial = record.receipts.hosted_advisory!;
    trial.outcome = "trial-passed-expected-new-attention"; trial.native_conclusion = "failure";
    trial.observations.only_attention_step_failed = true;
    if (invalid === "false-flag") trial.observations.only_attention_step_failed = false;
    if (invalid === "missing-flag") delete trial.observations.only_attention_step_failed;
    if (invalid === "success-conclusion") trial.native_conclusion = "success";
    if (invalid === "non-hosted") record.receipts.claude_entry!.outcome = "trial-passed-expected-new-attention";
    const delivery = deliverRecord(f, record);
    expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity }))
      .toThrow(invalid === "false-flag" || invalid === "missing-flag" ? "incomplete recorded observations hosted_advisory" : "recorded native outcome");
  });
}

for (const timestamp of ["2999-01-01T00:00:00Z", "2026-11-08", "2026-11-08T10:00:00", "2026-02-30T10:00:00Z", "2000-01-01T00:00:00+01:00"]) {
  test(`quiescence rejects an invalid verification timestamp ${timestamp}`, () => {
    const f = source(), record = portableRecord(f);
    record.receipts.quiescence!.observed_at = timestamp;
    const delivery = deliverRecord(f, record);
    expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity })).toThrow();
  });
}

test("two distinct record-only children remain ambiguous even with identical record bytes", () => {
  const f = source(), record = portableRecord(f);
  const first = deliverRecord(f, record);
  readGit(f.repo, "switch", "-c", "duplicate-cutover", f.candidate);
  write(f.repo, f.configured.publication.adoption_record, canonicalJSON(record));
  const second = commit(f.repo, "a distinct record-only delivery");
  expect(second).not.toBe(first);
  readGit(f.repo, "switch", "main");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "merge", "--no-ff", "--no-edit", "duplicate-cutover");
  const current = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity })).toThrow("unique record-only");
});

test("mixed-case configured actors can retain the same native numeric identity", () => {
  const f = source();
  f.configured.publication.actor = "Fixture-Bot";
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(f.configured));
  f.candidate = commit(f.repo, "mixed-case configured native actor");
  const delivery = deliverRecord(f, portableRecord(f));
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity }).identity.actor_id)
    .toBe(runtimeIdentity.actor_id);
});

for (const invalid of ["active-workflow", "pending-run", "missing-conclusion", "duplicate-run", "unknown-conclusion"] as const) {
  test(`quiescence refuses invalid native state ${invalid}`, () => {
    const f = source(), record = portableRecord(f), quiescence = record.receipts.quiescence!;
    const runs: { run_id: number; status: string; conclusion: string | null }[] = [{ run_id: 7, status: "completed", conclusion: "cancelled" }];
    if (invalid === "active-workflow") quiescence.workflow_state = "active";
    if (invalid === "pending-run") runs[0]!.status = "queued";
    if (invalid === "missing-conclusion") runs[0]!.conclusion = null;
    if (invalid === "duplicate-run") runs.push({ ...runs[0]! });
    if (invalid === "unknown-conclusion") runs[0]!.conclusion = "unknown";
    Object.assign(quiescence, { drained_runs: runs });
    const delivery = deliverRecord(f, record);
    expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity }))
      .toThrow(invalid === "active-workflow" ? "legacy quiescence receipt" : "drained run result");
  });
}

test("quiescence preserves completed native cancellation results", () => {
  const f = source(), record = portableRecord(f);
  Object.assign(record.receipts.quiescence!, { drained_runs: [{ run_id: 7, status: "completed", conclusion: "cancelled" }] });
  const delivery = deliverRecord(f, record);
  const checked = adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity });
  expect(checked.receipts).toMatchObject({ quiescence: { workflow_state: "disabled_manually",
    drained_runs: [{ run_id: 7, status: "completed", conclusion: "cancelled" }] } });
});


test("ordinary long-lived consumer history keeps the original adoption valid", () => {
  const f = source(), delivery = deliverRecord(f, portableRecord(f));
  const commands: string[] = [];
  for (let index = 1; index <= 4100; index += 1) {
    commands.push(`commit refs/heads/main\nmark :${index}\ncommitter Fixture <fixture@example.invalid> ${1700000000 + index} +0000\ndata 8\nordinary\nfrom ${index === 1 ? delivery : ":" + (index - 1)}\n\n`);
  }
  gitWithInput(f.repo, ["-c", "core.hooksPath=/dev/null", "fast-import", "--quiet"], { PATH: process.env.PATH }, Buffer.from(commands.join("")));
  const current = readGit(f.repo, "rev-parse", "main").toString().trim();
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: runtimeIdentity }).delivery_commit).toBe(delivery);
});

for (const field of ["producer_workflow_id", "producer_workflow_path", "reader_workflow_id", "reader_workflow_path"]) {
  test(`history-read receipt rejects a changed ${field}`, () => {
    const f = source(), record = portableRecord(f), receipt = record.receipts.history_read!;
    Object.assign(receipt, { producer_workflow_id: f.configured.reports.workflow_id,
      producer_workflow_path: f.configured.execution.scheduled_workflow, reader_workflow_id: 222,
      reader_workflow_path: f.configured.execution.worker_workflow });
    if (field === "producer_workflow_id") Object.assign(receipt, { [field]: 999 });
    else if (field === "reader_workflow_id") Object.assign(receipt, { [field]: 0 });
    else Object.assign(receipt, { [field]: ".github/workflows/unrelated.yml" });
    const delivery = deliverRecord(f, record);
    expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivery, identity: runtimeIdentity })).toThrow();
  });
}


// Synthetic native processes and observed-shaped attestations exercise selection, never actual adoption.
async function runtimeFixture(options: { hostname?: string; provision_hostname?: string } = {}) {
  const shared = publicationFixture(roots), prefix = "plugins/vh-adlc/";
  write(shared.repo, prefix + ".claude-plugin/plugin.json", '{"name":"vh-adlc","version":"0.13.0"}\n');
  write(shared.repo, prefix + "scripts/runner.ts", "// Synthetic retained worker\n");
  const sharedSource = commit(shared.repo, "synthetic published shared component");
  const component = bootstrap.computeComponentIdentity(shared.repo, sharedSource);
  const selectedPin = { ...pin(), source_commit: sharedSource, plugin_version: component.plugin_version,
    component_sha256: component.component_sha256 };
  const distribution = Buffer.from("#!/bin/sh\nprintf '%s\\n' 'GitHub Copilot CLI fixture-1.0.0.'\n");
  const client = parseClientBinding({ ...settingsFixture().clients["copilot-linux"], platform: process.platform + "-" + process.arch,
    distribution_sha256: hash(distribution.toString()) });
  const f = source({ pin: selectedPin, client, hostname: options.hostname }), delivery = deliverRecord(f, portableRecord(f));
  const cache = join(f.root, "approved-runtime"); mkdirSync(cache, { mode: 0o700 });
  const retained = bootstrap.retainComponentSnapshot({ cache_directory: cache, consumer_repo: f.repo, source_repo: shared.repo, pin: selectedPin });
  const native = await bootstrap.retainClientDistribution({ consumer_repo: f.repo, cache_directory: cache, client_id: "copilot-linux", client,
    profile_scope: { hostname: options.provision_hostname ?? f.configured.hostname, repository_id: 10, actor_id: 20, entry: "copilot" }, distribution, format: "executable", executable: "copilot" });
  const selection = { repo: f.repo, current_default: delivery, identity: runtimeIdentity, cache_directory: cache,
    entry: "copilot" as const, launcher_path: join(f.repo, f.configured.runtime_loader.launcher),
    settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") };
  return { ...f, delivery, retained, native, cache, selection };
}

test("approved runtime selection binds committed policy, retained component and exact role clients", async () => {
  const f = await runtimeFixture(), before = captureRepositoryState(f.repo);
  expect(typeof bootstrap.selectApprovedRuntime).toBe("function");
  const selected = await bootstrap.selectApprovedRuntime(f.selection);
  expect(selected.component.directory).toBe(f.retained.directory);
  expect(selected.worker.executable).toBe(f.native.executable);
  expect(selected.reviewer.client).toEqual(f.native.client);
  expect(selected.worker.model).toBe(f.configured.execution.entries.copilot.worker.model);
  expect(selected.loader.argv).toEqual(["--plugin-dir", f.retained.directory]);
  expect(selected.evidence).toBe("owner-attestation");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});


test.each(["launcher-bytes", "launcher-path", "settings-bytes", "missing-component", "missing-client", "client-mode", "staged", "identity"] as const)("approved runtime preflight refuses %s", async scenario => {
  const f = await runtimeFixture();
  if (scenario === "launcher-bytes") writeFileSync(f.selection.launcher_path, "Uncommitted alternate launcher\n");
  if (scenario === "launcher-path") { f.selection.launcher_path = join(f.repo, "other-launcher.ts"); writeFileSync(f.selection.launcher_path, "Alternate launcher\n"); }
  if (scenario === "settings-bytes") writeFileSync(f.selection.settings_path, "Uncommitted alternate settings\n");
  if (scenario === "missing-component") rmSync(join(f.retained.directory, ".claude-plugin/plugin.json"));
  if (scenario === "missing-client") rmSync(f.native.executable);
  if (scenario === "client-mode") chmodSync(f.native.executable, 0o700);
  if (scenario === "staged") {
    writeFileSync(f.selection.settings_path, canonicalJSON({ ...f.configured, publication: { ...f.configured.publication, mode: "staged" } }));
    f.selection.current_default = commit(f.repo, "synthetic rollback to staged policy");
  }
  if (scenario === "identity") f.selection.identity = { ...runtimeIdentity, actor_id: 99 };
  await expect(bootstrap.selectApprovedRuntime(f.selection)).rejects.toThrow();
});

test("ordinary corpus and dormant-trial updates keep approved roles while a protected client update is denied", async () => {
  const f = await runtimeFixture();
  writeFileSync(join(f.repo, "docs/guide.md"), "New ordinary corpus input\n");
  writeFileSync(f.selection.settings_path, canonicalJSON({ ...f.configured,
    trial: { definition_path: ".vh-adlc/docs-drift-trials/candidate.yaml", definition_sha256: hash("dormant candidate") } }));
  f.selection.current_default = commit(f.repo, "ordinary input and unselected trial");
  const selected = await bootstrap.selectApprovedRuntime(f.selection);
  expect(selected.component.directory).toBe(f.retained.directory);
  expect(selected.worker.executable).toBe(f.native.executable);
  writeFileSync(f.selection.settings_path, canonicalJSON({ ...f.configured, clients: { ...f.configured.clients,
    "copilot-linux": { ...f.configured.clients["copilot-linux"], version: "fixture-2.0.0", distribution_sha256: "b".repeat(64) } } }));
  f.selection.current_default = commit(f.repo, "unadopted native client update");
  await expect(bootstrap.selectApprovedRuntime(f.selection)).rejects.toThrow("protected record bindings changed");
  expect(readFileSync(f.native.executable, "utf8")).toContain("fixture-1.0.0");
});


test("approved entry preflight supports clean group-writable Git checkouts", async () => {
  const f = await runtimeFixture(); chmodSync(f.selection.launcher_path, 0o664); chmodSync(f.selection.settings_path, 0o664);
  const selected = await bootstrap.selectApprovedRuntime(f.selection);
  expect(selected.worker.executable).toBe(f.native.executable);
});

test("approved runtime cache must stay outside its consumer worktree", async () => {
  const f = await runtimeFixture(), cache = join(f.repo, "unsafe-runtime-cache"); mkdirSync(cache, { mode: 0o700 });
  await expect(bootstrap.selectApprovedRuntime({ ...f.selection, cache_directory: cache })).rejects.toThrow("outside source and consumer worktrees");
});

test("approved entry preflight refuses world-writable inputs with matching committed bytes", async () => {
  const f = await runtimeFixture(); chmodSync(f.selection.launcher_path, 0o666);
  await expect(bootstrap.selectApprovedRuntime(f.selection)).rejects.toThrow("regular committed entry input required");
});

test("approved entry derives the native profile host from committed consumer settings", async () => {
  const f = await runtimeFixture({ hostname: "enterprise.example.invalid" });
  const selected = await bootstrap.selectApprovedRuntime(f.selection);
  expect(selected.worker.profile_directory).toBe(f.native.profile_directory);
  expect(selected.worker.profile_directory).toContain("/enterprise.example.invalid/");
});

test("a profile provisioned for github.com cannot stand in for a committed enterprise host", async () => {
  const f = await runtimeFixture({ hostname: "enterprise.example.invalid", provision_hostname: "github.com" });
  const profile = f.native.profile_directory, expected = profile.replace("/github.com/", "/enterprise.example.invalid/");
  expect(readdirSync(profile)).toEqual([]);
  await expect(bootstrap.selectApprovedRuntime(f.selection)).rejects.toThrow(expected);
  expect(readdirSync(profile)).toEqual([]);
});

test.each([".vh-adlc/docs-drift-adoptions/[literal].yaml", ":(literal)adoptions/record.yaml"])("immutable adoption history reads literal path %s", path => {
  const f = source(); f.configured.publication.adoption_record = path;
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(f.configured)); f.candidate = commit(f.repo, "synthetic literal adoption path");
  const record = portableRecord(f), delivered = deliverRecord(f, record);
  expect(adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivered, identity: runtimeIdentity }).record_path).toBe(f.configured.publication.adoption_record);
  write(f.repo, f.configured.publication.adoption_record, canonicalJSON({ ...record, kind: "changed" }));
  commit(f.repo, "synthetic literal-path historical modification");
  const restored = deliverRecord(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: restored, identity: runtimeIdentity })).toThrow("immutable adoption record changed");
});


test("combined observation names cannot substitute for required adoption observations", () => {
  const f = source(), record = portableRecord(f), observations = record.receipts.hosted_advisory!.observations;
  Reflect.deleteProperty(observations, "collection_complete"); Reflect.deleteProperty(observations, "independent_review");
  Object.assign(observations, { "collection_complete,independent_review": true });
  const delivered = deliverRecord(f, record);
  expect(() => adoption.verifyRuntimeAdoption({ repo: f.repo, current_default: delivered, identity: runtimeIdentity }))
    .toThrow("incomplete recorded observations hosted_advisory fields");
});
