/** Original role-capture controls use synthetic model records and an owned native service. */
import { randomUUID } from "node:crypto";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectClosureWorkerInputs, collectClosureReviewTarget, collectClosureReview } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-worker";
import { sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { effectDigest, manifestDigest, validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { collectResolutionInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve-inputs";
import { commitAll, git } from "./repository-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { runtimeFixture } from "./runtime-fixture";
import { nativeClosureFixture } from "./closure-native-fixture";
import { evidence, role } from "./manifest-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
async function fixture(method: "merge" | "squash" | "rebase" = "merge", binary = false) {
  const adopted = await runtimeFixture(roots, true, false,
    { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source }, true);
  const f = await nativeClosureFixture(roots, method, "none", adopted.repo, binary ? original => {
    const bytes = Buffer.from([0, 255, 1]);
    git(original.repo, "switch", "-q", "docs-drift/one");
    writeFileSync(join(original.repo, "docs/asset.bin"), bytes);
    const head = commitAll(original.repo);
    git(original.repo, "switch", "-q", "main");
    git(original.collection.store.root, "fetch", "--no-write-fetch-head", original.repo, head);
    const proposal = original.proposals.get(1);
    if (!proposal) throw Error("Missing original fixture");
    proposal.head_sha = head;
    const inputs = collectResolutionInputs(original.collection);
    const asset = { id: "asset", path: "docs/asset.bin", action: "create", start: 0, end: 0, before_sha256: null,
      replacement_base64: bytes.toString("base64"), after_mode: "100644" };
    return { ...original.options, inputs, decisions: inputs.proposals[0].hunks.map(hunk => ({ ...original.decision, hunk_id: hunk.id,
      edit_ids: [hunk.path === asset.path ? asset.id : original.edit.id] })), edits: [original.edit, asset],
      observe_verification: async scope => ({ inputs_sha256: scope.inputs_sha256, state: "passed", artifact_sha256: sha256(bytes),
        method: "Synthetic historical asset check", asset_checks: [sha256(bytes)] }) };
  } : undefined);
  const options = { repo: f.repo, source: f.source, artifact_root: f.artifacts, owner: "closure-test", run: "closure-worker",
    selection: { schema_version: 1, source_commit: f.source, consolidation: 20, operation_id: "closure-worker" },
    credential: "synthetic-read-token", path: f.environment.PATH!, cache_directory: adopted.selection.cache_directory,
    entry: "copilot" as const, launcher_path: adopted.selection.launcher_path, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") };
  return { ...f, adopted, options };
}
type AssetCheck = { path: string; sha256: string | null; artifact: { path: string; sha256: string } };
function packet(f: Awaited<ReturnType<typeof fixture>>, current: Awaited<ReturnType<typeof collectClosureWorkerInputs>>) {
  const blob = f.snapshot.blobs.find(blob => blob.path === "src/app.ts");
  if (!blob) throw Error("Missing source fixture");
  return { input_sha256: current.worker_input_sha256, verifications: current.target!.target!.verification_scopes.map(scope => ({
    inputs_sha256: scope.inputs_sha256, state: "passed", method: "Native worker source assessment",
    evidence: [{ path: blob.path, sha256: sha256(blob.bytes), start: 0, end: blob.bytes.length, quote_sha256: sha256(blob.bytes) }], asset_checks: [] as AssetCheck[] })) };
}

async function invoke(f: Awaited<ReturnType<typeof fixture>>, command: string, worker?: { path: string; sha256: string }, reviewer?: { path: string; sha256: string }) {
  const name = "closure-role-" + randomUUID(), selected = canonicalJSON(f.options.selection);
  writeFileSync(join(f.artifacts, name + "-selection.json"), selected, { mode: 0o600 });
  const argv = [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
    "--repo", f.repo, "--source", f.source, "--artifact-root", f.artifacts, "--selection", name + "-selection.json", "--selection-sha256", sha256(selected),
    "--cache-root", f.options.cache_directory, "--entry", f.options.entry, "--launcher", f.options.launcher_path, "--settings", f.options.settings_path];
  if (worker) argv.push("--worker-capture", worker.path, "--worker-capture-sha256", worker.sha256);
  if (reviewer) argv.push("--reviewer-capture", reviewer.path, "--reviewer-capture-sha256", reviewer.sha256);
  const completion = await executeOwnedProcess({ argv, cwd: f.repo,
    env: Object.fromEntries(Object.entries(f.environment).filter((pair): pair is [string, string] => typeof pair[1] === "string")),
    capture: "memory", watched_outputs: [], timeout_ms: 60000, stdout: join(f.artifacts, name + ".stdout"),
    stderr: join(f.artifacts, name + ".stderr"), started: () => {} });
  expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
  const report = JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString());
  const calls = existsSync(f.calls) ? readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] }) : [];
  expect(calls.every(call => call.program === "git" ? !call.args.includes("push")
    : call.args.includes("GET") || call.args.includes("graphql") && !call.args.some(arg => /mutation\b/u.test(arg)))).toBe(true);
  return { completion, report };
}

test.each(["merge", "squash", "rebase"] as const)("original %s closure roles bind current semantics and exact effects without permission", async method => {
  const f = await fixture(method), before = captureRepositoryState(f.repo);
  const current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  expect(current.authority).toBe("none");
  const workerEvidence = evidence("closure-native-worker", current.worker_input_sha256!, canonicalJSON(packet(f, current)).toString());
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!, workerEvidence);
  const reviewedTarget = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
  expect(reviewedTarget.complete, JSON.stringify(reviewedTarget.diagnostics)).toBe(true);
  expect(reviewedTarget.manifest!.effects).toEqual(current.target!.target!.effects);
  expect(reviewedTarget.manifest_sha256).toBe(manifestDigest(reviewedTarget.manifest!));
  expect(reviewedTarget.proposal!.verification.every(row => row.state === "passed")).toBe(true);
  const reviewerEvidence = evidence("closure-native-reviewer", reviewedTarget.manifest_sha256!, "NO FINDINGS\n");
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", reviewedTarget.reviewer_runtime_sha256!, reviewerEvidence);
  const reviewed = await collectClosureReview({ ...f.options, worker_capture: worker, reviewer_capture: reviewer });
  expect(reviewed.complete, JSON.stringify(reviewed.diagnostics)).toBe(true);
  expect(reviewed.authority).toBe("none");
  expect(reviewed.review!.manifest_sha256).toBe(reviewedTarget.manifest_sha256!);
  // Synthetic grants check journal compatibility only. These are never sent to a publisher.
  const manifest = reviewedTarget.manifest!, grants = manifest.effects.map(effect => ({ manifest_sha256: reviewedTarget.manifest_sha256!, effect_id: effect.id, effect_sha256: effectDigest([effect]) }));
  const validated = validateReviewedManifest({ manifest, current: manifest, worker: workerEvidence, reviewer: reviewerEvidence,
    policy: { worker: role, reviewer: role }, grants });
  const plan = sealPlan({ reviewed: validated, grants, adoption_sha256: current.runtime!.adoption_sha256, context: "production", transport: "native",
    publication_kind: "resolve", corrections: [], attention: [] });
  expect(plan.manifest_sha256).toBe(reviewedTarget.manifest_sha256!);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);


test("normal closure role commands preserve original native evidence and remain read-only", async () => {
  const f = await fixture(), before = captureRepositoryState(f.repo);
  const initial = await invoke(f, "collect-closure-worker-inputs"), current = initial.report.closure_worker_inputs as Awaited<ReturnType<typeof collectClosureWorkerInputs>>;
  expect(initial.completion.exit_code, JSON.stringify(initial.report.diagnostics)).toBe(0);
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!,
    evidence("closure-cli-worker", current.worker_input_sha256!, canonicalJSON(packet(f, current)).toString()));
  const targetResult = await invoke(f, "collect-closure-review-target", worker), target = targetResult.report.closure_review_target as Awaited<ReturnType<typeof collectClosureReviewTarget>>;
  expect(targetResult.completion.exit_code, JSON.stringify(targetResult.report.diagnostics)).toBe(0);
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
    evidence("closure-cli-reviewer", target.manifest_sha256!, "NO FINDINGS\n"));
  const review = await invoke(f, "read-closure-review", worker, reviewer);
  expect(review.completion.exit_code, JSON.stringify(review.report.diagnostics)).toBe(0);
  expect(review.report.closure_review).toMatchObject({ complete: true, authority: "none", review: { manifest_sha256: target.manifest_sha256 } });
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 240000);

test.each(["missing", "duplicate", "foreign-scope", "unknown", "failed", "stale-quote", "extra-fields"])("closure worker refuses %s semantic evidence", async fault => {
  const f = await fixture(), before = captureRepositoryState(f.repo), current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const selected = packet(f, current);
  if (fault === "missing") selected.verifications = [];
  if (fault === "duplicate") selected.verifications.push(structuredClone(selected.verifications[0]));
  if (fault === "foreign-scope") selected.verifications[0].inputs_sha256 = "b".repeat(64);
  if (fault === "unknown" || fault === "failed") selected.verifications[0].state = fault;
  if (fault === "stale-quote") selected.verifications[0].evidence[0].sha256 = "c".repeat(64);
  const original = evidence("closure-negative-worker", current.worker_input_sha256!, canonicalJSON(fault === "extra-fields" ? { ...selected, approved: true } : selected).toString());
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!, original);
  const result = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
  expect(result.complete).toBe(false); expect(result.manifest).toBeNull();
  expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 120000);

test.each(["same-context", "blocking-findings", "changed-target", "changed-artifact"])("closure review refuses %s original role records", async fault => {
  const f = await fixture(), before = captureRepositoryState(f.repo), current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const workerEvidence = evidence("closure-review-worker", current.worker_input_sha256!, canonicalJSON(packet(f, current)).toString());
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!, workerEvidence);
  const target = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
  expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
  const returned = fault === "blocking-findings" ? "FINDING: F-01\nKIND: factual\nSEVERITY: should-fix\nWHERE: closure\nEVIDENCE: Synthetic unresolved semantic issue\nPROPOSAL: Keep this operation incomplete\n" : "NO FINDINGS\n";
  const original = evidence("closure-review-reviewer", fault === "changed-target" ? "a".repeat(64) : target.manifest_sha256!, returned);
  if (fault === "same-context") original.context_id = workerEvidence.context_id;
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!, original);
  if (fault === "changed-artifact") writeFileSync(join(f.artifacts, "reviewer-returned.txt"), "MODEL: claude-opus-5.5\nChanged later\n");
  const reviewed = await collectClosureReview({ ...f.options, worker_capture: worker, reviewer_capture: reviewer });
  expect(reviewed.complete).toBe(false); expect(reviewed.review).toBeNull();
  if (fault === "changed-artifact") expect(reviewed.scope_changed).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);


test("original binary closure binds a current asset and its original inspection artifact", async () => {
  const f = await fixture("merge", true), before = captureRepositoryState(f.repo), current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const selected = packet(f, current), scopes = current.target!.target!.verification_scopes;
  const binaryIndex = scopes.findIndex(scope => scope.decision.changed_paths.includes("docs/asset.bin"));
  expect(binaryIndex).toBeGreaterThanOrEqual(0);
  const row = selected.verifications[binaryIndex], bytes = Buffer.from([0, 255, 1]);
  for (const fault of ["missing", "wrong-path", "stale-asset", "empty-artifact", "valid"] as const) {
    const proposed = structuredClone(selected);
    if (fault !== "missing") proposed.verifications[binaryIndex].asset_checks = [{ path: fault === "wrong-path" ? "docs/other.bin" : "docs/asset.bin",
      sha256: fault === "stale-asset" ? "a".repeat(64) : sha256(bytes),
      artifact: retainSyntheticArtifact(f.artifacts, "asset-" + fault + ".txt", fault === "empty-artifact" ? Buffer.alloc(0) : Buffer.from("Synthetic current asset inspection at " + f.source + " and scope " + row.inputs_sha256)) }];
    const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!,
      evidence("closure-asset-worker", current.worker_input_sha256!, canonicalJSON(proposed).toString()));
    const target = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
    expect(target.complete, JSON.stringify({ fault, diagnostics: target.diagnostics })).toBe(fault === "valid");
    if (fault === "valid") expect(target.proposal!.verification[binaryIndex].asset_checks).toHaveLength(1);
    else expect(target.manifest).toBeNull();
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);
