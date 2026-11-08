/** Committed synthetic policy metadata. This fixture runs no hosted or model trial. */
import { collectAdoptionBindings } from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { chmodSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalDigest, canonicalJSON, protocolPath, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { commit, portableRecord, runtimeIdentity, source, write } from "./adoption-fixture";

function fixtureBundle(roots: string[], repo: string, source: string,
  manifest: { files: { target: string; source: string; mode: string; sha256: string }[] }, path: string, format: "sha1" | "sha256" = "sha1") {
  const scratch = mkdtempSync(join(tmpdir(), "vh-trial-bundle-")); roots.push(scratch);
  readGit(scratch, "init", "--template=", "--object-format=" + format, "-b", "fixture");
  readGit(scratch, "config", "gc.auto", "0"); readGit(scratch, "config", "maintenance.auto", "false");
  for (const row of manifest.files) {
    const target = protocolPath(row.target), input = protocolPath(row.source);
    write(scratch, target, readGit(repo, "show", source + ":" + input));
    chmodSync(join(scratch, target), row.mode === "100755" ? 0o755 : 0o644);
  }
  const sourceCommit = commit(scratch, "synthetic portable trial source");
  const tree = readGit(scratch, "rev-parse", sourceCommit + "^{tree}").toString().trim(), bundle = join(scratch, "source.bundle");
  readGit(scratch, "bundle", "create", bundle, "HEAD");
  const bytes = readFileSync(bundle); write(repo, path, bytes);
  return { source_commit: sourceCommit, tree, bundle: { path, sha256: sha256(bytes) } };
}

export function trialDefinitionFixture(roots: string[], options: {
  approved?: Parameters<typeof source>[1];
  candidate_client?: ReturnType<typeof source>["configured"]["clients"]["copilot-linux"];
  caller?: "extra-job-permission" | "different-secret" | "missing-permissions" | "job-only-permissions";
  history_job_write?: boolean; worker_cron?: boolean;
  bundle_format?: "sha1" | "sha256";
} = {}) {
  const f = source(roots, options.approved), settings = structuredClone(f.configured);
  // Detached maintenance from fixture commits must settle before read-only preservation checks.
  readGit(f.repo, "config", "gc.auto", "0"); readGit(f.repo, "config", "maintenance.auto", "false");
  if (options.candidate_client) settings.clients["copilot-linux"] = options.candidate_client;
  const activeCaller = readGit(f.repo, "show", f.candidate + ":" + settings.execution.scheduled_workflow);
  write(f.repo, settings.execution.worker_workflow, canonicalJSON({ on: { workflow_call: { inputs: {
    component_pin: { required: true, type: "string" }, pr_draft: { required: true, type: "boolean" }, fixture: { required: true, type: "string" },
  }, secrets: { COPILOT_GITHUB_TOKEN: { required: true } } }, ...(options.worker_cron ? { schedule: [{ cron: "0 6 * * *" }] } : {}) },
  jobs: { worker: { "runs-on": settings.execution.runner, steps: [{ run: "printf 'Synthetic worker fixture\\n'" }] } } }));
  const scheduled = { on: { schedule: [{ cron: "0 6 * * *" }], workflow_dispatch: null },
    permissions: settings.execution.permissions, jobs: { worker: { uses: "./" + settings.execution.worker_workflow,
      with: { component_pin: settings.component_pin, pr_draft: false, fixture: "consumer" },
      secrets: { COPILOT_GITHUB_TOKEN: "${{ secrets.COPILOT_GITHUB_TOKEN }}" } } } };
  if (options.caller === "extra-job-permission") Object.assign(scheduled.jobs.worker, { permissions: { ...settings.execution.permissions, issues: "write" } });
  if (options.caller === "different-secret") scheduled.jobs.worker.secrets.COPILOT_GITHUB_TOKEN = "${{ secrets.OTHER_TOKEN }}";
  if (options.caller === "job-only-permissions") Object.assign(scheduled.jobs.worker, { permissions: settings.execution.permissions });
  if (options.caller === "missing-permissions" || options.caller === "job-only-permissions") Reflect.deleteProperty(scheduled, "permissions");
  write(f.repo, settings.execution.scheduled_workflow, canonicalJSON(scheduled));
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings));
  const prospective = commit(f.repo, "synthetic prospective trial bindings");
  const bindings = collectAdoptionBindings(f.repo, prospective);
  const candidatePath = ".vh-adlc/docs-drift-trials/candidate-settings.yaml";
  const trialCaller = ".github/workflows/docs-drift-trial.yml", prospectiveCaller = ".vh-adlc/docs-drift-trials/prospective.yaml";
  const readerPath = ".github/workflows/docs-drift-history-check.yml", bundle = "tests/docs-drift-fixture";
  write(f.repo, candidatePath, canonicalJSON(settings));
  write(f.repo, prospectiveCaller, canonicalJSON(scheduled));
  write(f.repo, trialCaller, canonicalJSON({ ...scheduled, on: { workflow_dispatch: null }, jobs: { worker: {
    ...scheduled.jobs.worker, with: { ...scheduled.jobs.worker.with, pr_draft: true, fixture: "synthetic" },
  } } }));
  write(f.repo, readerPath, canonicalJSON({ on: { workflow_dispatch: null }, permissions: { actions: "read", contents: "read" },
    jobs: { read: { "runs-on": "ubuntu-latest", steps: [{ run: "bun report-history.ts --trial-read-check" }],
      ...(options.history_job_write ? { permissions: { actions: "write", contents: "read" } } : {}) } } }));
  write(f.repo, bundle + "/docs/guide.md", "Synthetic fixture document\n");
  write(f.repo, bundle + "/settings.yaml", canonicalJSON(settings));
  const staged = commit(f.repo, "synthetic dormant policy inputs");
  const blob = (path: string) => ({ path, sha256: sha256(readGit(f.repo, "show", staged + ":" + path)) });
  const manifest = { schema_version: 1, files: [
    { target: "docs/guide.md", source: bundle + "/docs/guide.md", mode: "100644", sha256: blob(bundle + "/docs/guide.md").sha256 },
    { target: settings.scanner.script, source: settings.scanner.script, mode: "100644", sha256: blob(settings.scanner.script).sha256 },
    { target: ".vh-adlc/docs-drift.yaml", source: bundle + "/settings.yaml", mode: "100644", sha256: blob(bundle + "/settings.yaml").sha256 },
  ] };
  const manifestPath = bundle + "/manifest.json";
  write(f.repo, manifestPath, canonicalJSON(manifest));
  const packed = fixtureBundle(roots, f.repo, staged, manifest, bundle + "/source.bundle", options.bundle_format);
  const definition = { schema_version: 1, kind: "docs-drift-trial",
    identity: { ...runtimeIdentity, hostname: settings.hostname },
    candidate_settings: blob(candidatePath), candidate_component: blob(settings.component_pin),
    prospective_protected_sha256: bindings.protected_sha256, worker: blob(settings.execution.worker_workflow),
    callers: { trial: blob(trialCaller), prospective: blob(prospectiveCaller), production_pr_draft: false,
      input_differences: { fixture: { trial: "synthetic", scheduled: "consumer" } } },
    history: { reader: blob(readerPath), reader_workflow_id: 22, producer_workflow_id: 21 },
    fixture: { id: "00000000-0000-0000-0000-000000000001", ...packed,
      bundle_root: bundle, manifest: { path: manifestPath, sha256: sha256(canonicalJSON(manifest)) },
      scanner: blob(settings.scanner.script), dependencies: [], settings: blob(bundle + "/settings.yaml") },
    namespace: { output_root: "tests/docs-drift-trial-output", branch_prefix: "docs-drift-trial/", lease_ref: "refs/heads/docs-drift-trial-lease" },
    expected: { attention: "new-attention", cases: [{ id: "synthetic-advisory", fixture_sha256: sha256(canonicalJSON(manifest)),
      outcome_sha256: sha256(Buffer.from("Synthetic expected reviewed advisory")) }] }, upgrade: null };
  const definitionPath = ".vh-adlc/docs-drift-trials/first.yaml";
  write(f.repo, definitionPath, canonicalJSON(definition));
  const trial = { definition_path: definitionPath, definition_sha256: sha256(canonicalJSON(definition)) };
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured, publication: { ...f.configured.publication, mode: "staged" }, trial }));
  write(f.repo, settings.execution.scheduled_workflow, activeCaller);
  return { ...f, roots, candidate_settings: settings, definition, manifest, trial, staged: commit(f.repo, "synthetic current-default trial definition"), bindings };
}

export function commitTrialDefinition(f: ReturnType<typeof trialDefinitionFixture>) {
  f.definition.fixture.manifest.sha256 = sha256(canonicalJSON(f.manifest));
  write(f.repo, f.definition.fixture.manifest.path, canonicalJSON(f.manifest));
  const inputs = readGit(f.repo, "status", "--porcelain").length ? commit(f.repo, "synthetic revised trial inputs")
    : readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  Object.assign(f.definition.fixture, fixtureBundle(f.roots, f.repo, inputs, f.manifest, f.definition.fixture.bundle.path,
    f.definition.fixture.source_commit.length === 64 ? "sha256" : "sha1"));
  f.trial.definition_sha256 = sha256(canonicalJSON(f.definition));
  write(f.repo, f.trial.definition_path, canonicalJSON(f.definition));
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured,
    publication: { ...f.configured.publication, mode: "staged" }, trial: f.trial }));
  return commit(f.repo, "synthetic revised trial definition");
}

/** Observed-shaped portable records exercise parsing without claiming native trial execution. */
export function fullDefinitionUpgradeFixture(roots: string[], options: {
  changed_rule?: "mapped" | "unmapped"; approved?: Parameters<typeof source>[1];
  candidate_client?: ReturnType<typeof source>["configured"]["clients"]["copilot-linux"];
} = {}) {
  const f = trialDefinitionFixture(roots, { approved: options.approved }), repo = f.repo, originalCandidate = f.bindings.source_commit;
  readGit(repo, "switch", "--detach", originalCandidate);
  const original = portableRecord({ repo, configured: f.configured, candidate: originalCandidate });
  write(repo, f.configured.publication.adoption_record, canonicalJSON(original));
  const originalDelivery = commit(repo, "synthetic full-definition predecessor"), predecessorHash = sha256(canonicalJSON(original));
  const candidateSettings = structuredClone(f.configured);
  candidateSettings.publication.adoption_record = ".vh-adlc/docs-drift-adoptions/full-successor.yaml";
  candidateSettings.clients["copilot-linux"] = options.candidate_client ?? { ...candidateSettings.clients["copilot-linux"], version: "fixture-2.0.0" };
  candidateSettings.execution.worker_workflow = ".github/workflows/docs-drift-candidate-worker.yml";
  const workerBytes = readGit(repo, "show", originalCandidate + ":" + f.configured.execution.worker_workflow);
  write(repo, candidateSettings.execution.worker_workflow, workerBytes);
  const futureCaller = JSON.parse(readGit(repo, "show", originalCandidate + ":" + f.configured.execution.scheduled_workflow).toString());
  futureCaller.jobs.worker.uses = "./" + candidateSettings.execution.worker_workflow;
  write(repo, candidateSettings.execution.scheduled_workflow, canonicalJSON(futureCaller));
  write(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(candidateSettings));
  const prototype = commit(repo, "synthetic prospective client update"), prospective = collectAdoptionBindings(repo, prototype);
  readGit(repo, "switch", "--detach", originalDelivery);
  const paths = [f.definition.candidate_settings.path, f.definition.callers.trial.path, f.definition.callers.prospective.path, f.definition.fixture.bundle.path,
    f.definition.history.reader.path, f.definition.fixture.manifest.path, f.definition.fixture.settings.path,
    ...f.manifest.files.map(row => row.source)];
  for (const path of new Set(paths)) write(repo, path, readGit(repo, "show", f.staged + ":" + path));
  write(repo, candidateSettings.execution.worker_workflow, workerBytes);
  f.definition.worker = { path: candidateSettings.execution.worker_workflow, sha256: sha256(workerBytes) };
  for (const role of ["trial", "prospective"] as const) {
    const selected = f.definition.callers[role], caller = JSON.parse(readGit(repo, "show", f.staged + ":" + selected.path).toString());
    caller.jobs.worker.uses = "./" + candidateSettings.execution.worker_workflow;
    write(repo, selected.path, canonicalJSON(caller)); selected.sha256 = sha256(canonicalJSON(caller));
  }
  write(repo, f.definition.candidate_settings.path, canonicalJSON(candidateSettings));
  f.definition.candidate_settings.sha256 = sha256(canonicalJSON(candidateSettings));
  write(repo, f.definition.fixture.settings.path, canonicalJSON(candidateSettings));
  f.definition.fixture.settings.sha256 = sha256(canonicalJSON(candidateSettings));
  f.manifest.files[2]!.sha256 = f.definition.fixture.settings.sha256;
  write(repo, f.definition.fixture.manifest.path, canonicalJSON(f.manifest));
  f.definition.fixture.manifest.sha256 = sha256(canonicalJSON(f.manifest));
  f.definition.expected.cases[0]!.fixture_sha256 = f.definition.fixture.manifest.sha256;
  f.definition.prospective_protected_sha256 = prospective.protected_sha256;
  const inputs = commit(repo, "synthetic successor trial inputs");
  Object.assign(f.definition.fixture, fixtureBundle(roots, repo, inputs, f.manifest, f.definition.fixture.bundle.path));
  const rule = { id: "changed-rule", surface: "assessment", scenario: "Synthetic changed assessment rule",
    fixture_sha256: f.definition.fixture.manifest.sha256, old_contract_sha256: sha256(Buffer.from("Synthetic old assessment contract")),
    new_contract_sha256: sha256(Buffer.from("Synthetic new assessment contract")), old_expected_sha256: sha256(Buffer.from("Synthetic old outcome")),
    new_expected_sha256: sha256(Buffer.from("Synthetic new outcome")) };
  const changedRules = options.changed_rule ? [rule] : [];
  if (options.changed_rule === "mapped") f.definition.expected.cases.push({ id: rule.id,
    fixture_sha256: rule.fixture_sha256, outcome_sha256: rule.new_expected_sha256 });
  Object.assign(f.definition, { upgrade: { schema_version: 1, kind: "docs-drift-upgrade-trial",
    predecessor_adoption_sha256: predecessorHash, candidate_component: prospective.component_pin.value,
    candidate_protected_sha256: prospective.protected_sha256, classification: options.changed_rule ? "contract" : "execution",
    affected_entries: ["hosted", "copilot", "claude"], changed_rules: changedRules } });
  f.trial.definition_sha256 = sha256(canonicalJSON(f.definition));
  write(repo, f.trial.definition_path, canonicalJSON(f.definition));
  write(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured, trial: f.trial }));
  const policySource = commit(repo, "synthetic full trial policy with predecessor active");
  write(repo, candidateSettings.execution.scheduled_workflow, canonicalJSON(futureCaller));
  write(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...candidateSettings, trial: f.trial }));
  const candidate = commit(repo, "synthetic tested successor selection");
  const fresh = portableRecord({ repo, configured: candidateSettings, candidate });
  fresh.receipts.quiescence = structuredClone(original.receipts.quiescence!);
  const record = { ...fresh, predecessor: { schema_version: 1, evidence_kind: "observed", route: "trial", default_commit: policySource,
    record_path: f.configured.publication.adoption_record, record_sha256: predecessorHash, carry_receipts: ["quiescence"],
    trial: { schema_version: 1, evidence_kind: "observed", definition_path: f.trial.definition_path,
      definition_sha256: f.trial.definition_sha256, source_candidate: candidate, predecessor_adoption_sha256: predecessorHash,
      reviewer_model: candidateSettings.execution.entries.copilot.reviewer.model,
      artifact_sha256: sha256(Buffer.from("Synthetic full-definition trial artifact")),
      cases: changedRules.map(rule => ({ id: rule.id, evidence_kind: "observed", source_candidate: candidate,
        rule_sha256: canonicalDigest(rule), outcome_sha256: rule.new_expected_sha256,
        artifact_sha256: sha256(Buffer.from("Synthetic changed-rule artifact")), result: "passed" })),
      observations: { definition_reviewed: true, prospective_bindings_matched: true, affected_roles_exercised: true,
        complete_native_results: true, no_blocking_findings: true, no_should_fix_findings: true } } } };
  write(repo, candidateSettings.publication.adoption_record, canonicalJSON(record));
  const delivery = commit(repo, "synthetic full-definition record-only delivery");
  readGit(repo, "switch", "main");
  return { ...f, policySource, candidate, delivery, record, candidate_settings: candidateSettings };
}
