import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectAdoptionBindings, parseComponentPin, verifyCutoverAssembly } from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture } from "./publication-fixture";
import { settingsFixture } from "./settings-fixture";
import { hash } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const pin = () => ({ schema_version: 1 as const, source_repository: "fixture/shared", source_commit: "a".repeat(40),
  source_release: "v1.0.0", plugin_version: "0.11.0", component_sha256: hash("fixture component") });
function write(repo: string, path: string, bytes: string | Uint8Array) {
  const file = join(repo, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
}
function commit(repo: string, message: string) {
  readGit(repo, "add", "--", ".");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", message);
  return readGit(repo, "rev-parse", "HEAD").toString().trim();
}
function source() {
  const f = publicationFixture(roots), settings = { ...settingsFixture(),
    component_pin: ".vh-adlc/docs-drift-components/shared.yaml", publication: { ...settingsFixture().publication, mode: "adopted" },
    reports: { ...settingsFixture().reports, workflow_id: 19 } };
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings));
  write(f.repo, settings.component_pin, canonicalJSON(pin()));
  for (const path of [settings.project_procedure, settings.execution.worker_workflow, settings.execution.scheduled_workflow,
    settings.execution.claude_command, settings.runtime_loader.launcher]) write(f.repo, path, "Synthetic protected input " + path + "\n");
  write(f.repo, settings.scanner.script, "Synthetic ordinary detector implementation\n");
  write(f.repo, "docs/guide.md", "Synthetic ordinary document\n");
  return { ...f, configured: settings, candidate: commit(f.repo, "synthetic adopted source candidate") };
}

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

const runtimeIdentity = { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20, default_branch: "main" };

// Observed-shaped owner-attestation parser fixtures only. They establish no native host execution.
function portableRecord(f: ReturnType<typeof source>) {
  const bindings = collectAdoptionBindings(f.repo, f.candidate);
  const target = hash(canonicalJSON({ schema_version: 1, repository: f.configured.repository,
    source_candidate: f.candidate, protected_sha256: bindings.protected_sha256,
    component_pin_sha256: bindings.component_pin.sha256, identity: runtimeIdentity }).toString());
  const requirements = {
    hosted_advisory: ["collection_complete", "independent_review", "reviewed_draft_payload", "report_uploaded", "lease_complete"],
    history_read: ["native_history_read", "producer_verified", "permissions_bound"],
    quiescence: ["schedule_disabled", "runs_drained", "interactive_frozen", "no_legacy_owners"],
    copilot_entry: ["audit", "resolve", "closure", "issue", "acknowledgement", "ownership_denials", "settlement_denials", "retained_loader", "role_dispatch"],
    claude_entry: ["audit", "resolve", "closure", "issue", "acknowledgement", "ownership_denials", "settlement_denials", "retained_loader", "role_dispatch", "forwarded_arguments", "command_binding"],
    paired_review: ["shared_target", "consumer_target", "no_blocking_findings", "owner_acceptance"],
    codex_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
    claude_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
    copilot_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
  };
  const receipts = Object.fromEntries(Object.entries(requirements).map(([name, observations]) => {
    const entry = name === "hosted_advisory" ? f.configured.execution.entries.hosted
      : name === "claude_entry" ? f.configured.execution.entries.claude
      : name === "copilot_entry" || name === "paired_review" ? f.configured.execution.entries.copilot : null;
    return [name, { schema_version: 1, kind: name, evidence_kind: "observed", source_commit: f.candidate,
      artifact_sha256: hash(name + " synthetic original bytes"), bindings_sha256: target, outcome: "passed", native_conclusion: "success",
      worker_model: name === "paired_review" ? null : entry?.worker.model ?? null, reviewer_model: entry?.reviewer.model ?? null,
      observations: Object.fromEntries(observations.map(observation => [observation, true])),
      ...(name === "quiescence" ? { workflow_id: f.configured.reports.workflow_id,
        workflow_path: f.configured.execution.scheduled_workflow, observed_at: "2026-11-08T10:00:00Z",
        queued_run_ids: [], in_progress_run_ids: [], interactive_request_sha256: hash("synthetic explicit freeze") } : {}) }];
  }));
  return { schema_version: 1, kind: "docs-drift-adoption", source_candidate: f.candidate,
    protected_sha256: bindings.protected_sha256, protected_manifest: bindings.protected_manifest,
    component_pin_sha256: bindings.component_pin.sha256, identity: runtimeIdentity, receipts, predecessor: null };
}
function deliverRecord(f: ReturnType<typeof source>, record: ReturnType<typeof portableRecord>) {
  write(f.repo, f.configured.publication.adoption_record, canonicalJSON(record));
  return commit(f.repo, "synthetic portable attestation child");
}

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

for (const invalid of ["test-only", "missing-history", "incomplete-entry", "changed-model", "unknown-observation", "active-run", "missing-freeze", "predecessor"] as const) {
  test(`portable adoption refuses ${invalid} evidence despite a passing outer claim`, () => {
    const f = source(), record = portableRecord(f);
    if (invalid === "test-only") record.receipts.copilot_entry!.evidence_kind = "test-only";
    if (invalid === "missing-history") delete record.receipts.history_read;
    if (invalid === "incomplete-entry") record.receipts.claude_entry!.observations.closure = false;
    if (invalid === "changed-model") record.receipts.copilot_entry!.reviewer_model = "different-model";
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
  expect(trial.native_conclusion).toBe("failure");
});
