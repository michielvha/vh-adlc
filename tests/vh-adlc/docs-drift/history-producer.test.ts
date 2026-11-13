import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { source, write, commit, portableRecord, deliverRecord, runtimeIdentity } from "./adoption-fixture";
import { compatibleTrialUpgrade, trialAdoptionDelivery } from "./adoption-trial-fixture";
import { canonicalDigest, canonicalJSON, compareUTF8, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readAdoptionInput, readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import type { WorkflowRunInput } from "../../../plugins/vh-adlc/scripts/github-read";
import type { ProducerSource } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed history producer roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const f = source(roots);
  write(f.repo, f.configured.execution.scheduled_workflow, JSON.stringify({ on: { schedule: [{ cron: "0 3 * * *" }] },
    jobs: { drift: { uses: "./" + f.configured.execution.worker_workflow } } }));
  write(f.repo, f.configured.execution.worker_workflow, JSON.stringify({ on: { workflow_call: null }, jobs: { report: {
    "runs-on": "ubuntu-latest", steps: ["collect", "review", "report", "upload", "attention"].map(id => ({ id: "docs-drift-" + id, name: "Drift " + id, run: "synthetic-only" })) } } }));
  f.candidate = commit(f.repo, "synthetic protected report workflow");
  const current = deliverRecord(f, portableRecord(f));
  const store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts, source_repo: f.repo,
    source_commit: current, repository: f.configured.repository, owner: "synthetic-history", run: "producer" });
  return { ...f, current, store };
}
function producerSource(repo: string, head: string, altered?: string): ProducerSource {
  const files = new Map<string, Buffer | null>();
  return { commit_sha: head, tree_sha: readGit(repo, "rev-parse", head + "^{tree}").toString().trim(),
    file(path) { const actual = readAdoptionInput(repo, head, path)?.bytes ?? null, value = path === altered ? Buffer.from("Changed native API blob") : actual;
      files.set(path, value); return value; },
    bindings() { return [...files].sort(([left], [right]) => compareUTF8(left, right)).map(([path, bytes]) => [path, bytes === null ? null : sha256(bytes)] as const); } };
}
// Bounded native-metadata shape only. Actual Actions listing/download remains a separate acceptance surface.
function run(head: string): WorkflowRunInput {
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  return { id: 101, run_attempt: 1, workflow_id: 19, path: ".github/workflows/docs-drift.yml", event: "schedule",
    head_branch: "main", head_sha: head, repository, head_repository: repository,
    status: "completed", conclusion: "success", created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:01:00Z" };
}

test.each(["matching", "changed-native-blob", "foreign-repository", "unadopted-source", "wrong-source"])("producer eligibility reopens adopted source and protected native blobs: %s", async fault => {
  try {
    const { createAdoptedProducerVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-producer");
    const f = fixture(), before = captureRepositoryState(f.repo), verify = createAdoptedProducerVerifier({ store: f.store,
      current_default: f.current, identity: runtimeIdentity });
    const head = fault === "unadopted-source" ? f.candidate : f.current;
    const original = producerSource(f.repo, head, fault === "changed-native-blob" ? f.configured.execution.worker_workflow : undefined), native = run(head);
    if (fault === "foreign-repository") native.repository = { ...native.repository, id: 11 };
    if (fault === "wrong-source") original.commit_sha = f.candidate;
    if (["changed-native-blob", "foreign-repository", "wrong-source"].includes(fault)) {
      expect(() => verify(original, native)).toThrow("incomplete docs-drift history producer");
    } else {
      const result = verify(original, native);
      if (fault === "unadopted-source") expect(result).toBe(null);
      else {
        expect(result?.source_commit).toBe(f.current); expect(result?.source_inputs_sha256).toBe(canonicalDigest(original.bindings()));
        expect(result?.job_name).toBe("drift / report"); expect(result?.attention_step).toBe("Drift attention");
        expect(result?.required_jobs).toEqual([{ name: "drift / report", steps: ["Drift collect", "Drift review", "Drift report", "Drift upload", "Drift attention"] }]);
      }
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
});

// Observed-shaped owner-attestation parser fixtures only; these do not establish actual native adoption.
test("a verified compatible predecessor remains eligible while test-only successor evidence refuses", async () => {
  try {
    const { createAdoptedProducerVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-producer");
    const f = source(roots);
    write(f.repo, f.configured.execution.worker_workflow, JSON.stringify({ on: { workflow_call: null }, jobs: { report: {
      "runs-on": "ubuntu-latest", steps: ["collect", "review", "report", "upload", "attention"].map(id => ({ id: "docs-drift-" + id, name: "Drift " + id, run: "synthetic-only" })) } } }));
    write(f.repo, f.configured.execution.scheduled_workflow, canonicalJSON({ on: { schedule: [{ cron: "0 6 * * *" }], workflow_dispatch: null },
      permissions: f.configured.execution.permissions, jobs: { worker: { uses: "./" + f.configured.execution.worker_workflow,
        with: { component_pin: f.configured.component_pin, pr_draft: false }, secrets: { COPILOT_GITHUB_TOKEN: "${{ secrets.COPILOT_GITHUB_TOKEN }}" } } } }));
    f.candidate = commit(f.repo, "synthetic compatible caller source");
    const original = { source: f.repo, configured: f.configured, candidate: f.candidate, record: portableRecord(f),
      manifest: { fixture_id: "00000000-0000-0000-0000-000000000001" } };
    const successor = compatibleTrialUpgrade(original), record = successor.record;
    Reflect.deleteProperty(record, "fixture_id"); Reflect.deleteProperty(record.predecessor, "fixture_id"); record.predecessor.evidence_kind = "observed";
    const compatibility = record.predecessor.compatibility;
    Reflect.deleteProperty(compatibility, "fixture_id"); compatibility.evidence_kind = "observed";
    for (const regression of compatibility.regressions) { Reflect.deleteProperty(regression, "fixture_id"); regression.evidence_kind = "observed"; }
    for (const receipt of Object.values(record.receipts)) { Reflect.deleteProperty(receipt, "fixture_id"); receipt.evidence_kind = "observed"; }
    const selected = { ...original, configured: successor.configured, candidate: successor.candidate, record }, current = trialAdoptionDelivery(selected);
    const store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts, source_repo: f.repo,
      source_commit: current, repository: f.configured.repository, owner: "synthetic-history", run: "compatible" });
    const before = captureRepositoryState(f.repo), verify = createAdoptedProducerVerifier({ store, current_default: current, identity: runtimeIdentity });
    const previous = verify(producerSource(f.repo, successor.previousDefault), run(successor.previousDefault));
    expect(previous?.source_commit).toBe(successor.previousDefault); expect(previous?.job_name).toBe("worker / report");
    expect(verify(producerSource(f.repo, current), run(current))?.component_sha256).not.toBe(previous?.component_sha256);
    expect(captureRepositoryState(f.repo)).toEqual(before);
    compatibility.evidence_kind = "test-only";
    const invalid = trialAdoptionDelivery(selected), invalidStore = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts, source_repo: f.repo,
      source_commit: invalid, repository: f.configured.repository, owner: "synthetic-history", run: "invalid-successor" });
    expect(() => createAdoptedProducerVerifier({ store: invalidStore, current_default: invalid, identity: runtimeIdentity })).toThrow("compatibility receipt bindings");
  } catch (error) { preserveRoots = true; throw error; }
});
