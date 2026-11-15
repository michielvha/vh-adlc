import { runtimePolicyBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
/** Original role-capture controls use synthetic model records and an owned native service. */
import { randomUUID } from "node:crypto";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectClosureWorkerInputs, collectClosureReviewTarget, collectClosureReview } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-worker";
import { collectNativeClosure } from "../../../plugins/vh-adlc/scripts/docs-drift/resolution-entry";
import { captureClosureInventory } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-inventory";
import { readNativeContext, createNativeTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { appendIntent, appendOutcome, createJournal, writePublicationObjects, sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { effectDigest, manifestDigest, validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { collectResolutionInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve-inputs";
import { commitAll, git } from "./repository-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { closureRuntimeFixture, closureVerificationPacket as packet } from "./closure-runtime-fixture";
import { evidence, role } from "./manifest-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";

const roots: string[] = [];
let failedProcess = false;
afterAll(() => {
  if (failedProcess) console.error("Preserved failed closure CLI fixture roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});
async function fixture(method: "merge" | "squash" | "rebase" = "merge", binary = false, nativeFault = "none") {
  return closureRuntimeFixture(roots, method, nativeFault, binary ? original => {
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
  const { captured, ...metadata } = completion;
  writeFileSync(join(f.artifacts, name + ".stdout"), captured?.stdout ?? new Uint8Array(), { mode: 0o600 });
  writeFileSync(join(f.artifacts, name + ".stderr"), captured?.stderr ?? new Uint8Array(), { mode: 0o600 });
  writeFileSync(join(f.artifacts, name + "-process.json"), canonicalJSON(metadata), { mode: 0o600 });
  failedProcess ||= !completion.reaped || completion.timed_out;
  expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
  const report = JSON.parse(Buffer.from(captured?.stdout ?? []).toString());
  const calls = existsSync(f.calls) ? readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] }) : [];
  expect(calls.every(call => call.program === "git" ? !call.args.includes("push")
    : call.args.includes("GET") || call.args.includes("graphql") && !call.args.some(arg => /mutation\b/u.test(arg)))).toBe(true);
  return { completion, report, calls };
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
  const plan = sealPlan({ reviewed: validated, grants, ...runtimePolicyBinding(current.runtime!), context: "production", transport: "native",
    publication_kind: "resolve", corrections: [], attention: [] });
  expect(plan.manifest_sha256).toBe(reviewedTarget.manifest_sha256!);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);


test("normal closure role commands preserve original native evidence and remain read-only", async () => {
  const f = await fixture(), before = captureRepositoryState(f.repo);
  const initial = await invoke(f, "collect-closure-worker-inputs"), current = initial.report.closure_worker_inputs as Awaited<ReturnType<typeof collectClosureWorkerInputs>>;
  expect(initial.completion.exit_code, JSON.stringify(initial.report.diagnostics)).toBe(0);
  expect(initial.calls.filter(call => call.args.includes("graphql"))).toHaveLength(3);
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!,
    evidence("closure-cli-worker", current.worker_input_sha256!, canonicalJSON(packet(f, current)).toString()));
  const targetResult = await invoke(f, "collect-closure-review-target", worker), target = targetResult.report.closure_review_target as Awaited<ReturnType<typeof collectClosureReviewTarget>>;
  expect(targetResult.completion.exit_code, JSON.stringify(targetResult.report.diagnostics)).toBe(0);
  expect(targetResult.calls.filter(call => call.args.includes("graphql"))).toHaveLength(6);
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
    evidence("closure-cli-reviewer", target.manifest_sha256!, "NO FINDINGS\n"));
  const review = await invoke(f, "read-closure-review", worker, reviewer);
  expect(review.completion.exit_code, JSON.stringify(review.report.diagnostics)).toBe(0);
  expect(review.calls.filter(call => call.args.includes("graphql"))).toHaveLength(9);
  expect(review.calls.filter(call => call.args.at(-1) === "user/20")).toHaveLength(9);
  expect(review.report.closure_review).toMatchObject({ complete: true, authority: "none", review: { manifest_sha256: target.manifest_sha256 },
    worker_input_sha256: current.worker_input_sha256, target_sha256: current.target!.target_sha256 });
  expect(targetResult.report.closure_review_target.worker_inputs).toBeUndefined();
  expect(review.report.closure_review.target).toBeUndefined();
  const initialSize = Buffer.byteLength(JSON.stringify(initial.report) + "\n");
  expect(Buffer.byteLength(JSON.stringify(targetResult.report) + "\n")).toBeLessThan(initialSize);
  expect(Buffer.byteLength(JSON.stringify(review.report) + "\n")).toBeLessThan(initialSize);
  const responses = JSON.parse(readFileSync(f.responses_file, "utf8"));
  const endpoint = "repos/fixture/docs/pulls/1";
  responses.__mutation_after = { at: 11, endpoint, value: { ...responses[endpoint], body: responses[endpoint].body + " Changed during final replay" } };
  writeFileSync(f.responses_file, JSON.stringify(responses));
  const changed = await invoke(f, "read-closure-review", worker, reviewer);
  expect(changed.completion.exit_code).toBe(2);
  expect(changed.report.outcome).toBe("incomplete");
  expect(JSON.stringify(changed.report.diagnostics)).toContain("Native repository inputs changed");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 240000);

test.each(["missing", "duplicate", "foreign-scope", "unknown", "failed", "stale-quote", "stale-quote-bytes", "extra-fields"])("closure worker refuses %s semantic evidence", async fault => {
  const f = await fixture("merge", false, fault === "stale-quote-bytes" ? "changed-source-bytes" : "none"), before = captureRepositoryState(f.repo), current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const selected = packet(f, current);
  if (fault === "missing") selected.verifications = [];
  if (fault === "duplicate") selected.verifications.push(structuredClone(selected.verifications[0]));
  if (fault === "foreign-scope") selected.verifications[0].inputs_sha256 = "b".repeat(64);
  if (fault === "unknown" || fault === "failed") selected.verifications[0].state = fault;
  if (fault === "stale-quote") selected.verifications[0].evidence[0].sha256 = "c".repeat(64);
  if (fault === "stale-quote-bytes") {
    const currentBytes = readFileSync(join(f.repo, "src/app.ts"));
    expect(sha256(currentBytes)).not.toBe(selected.verifications[0].evidence[0].quote_sha256);
    selected.verifications[0].evidence[0].sha256 = sha256(currentBytes);
  }
  const original = evidence("closure-negative-worker", current.worker_input_sha256!, canonicalJSON(fault === "extra-fields" ? { ...selected, approved: true } : selected).toString());
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!, original);
  const result = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
  expect(result.complete).toBe(false); expect(result.manifest).toBeNull();
  const expected: Record<string, string> = {
    missing: "Exact complete closure worker scopes required", duplicate: "Exact complete closure worker scopes required", "foreign-scope": "Exact unique closure verification required",
    unknown: "incomplete closure proposal current disposition feedback or carry verification unavailable", failed: "incomplete closure proposal current disposition feedback or carry verification unavailable",
    "stale-quote": "Current quoted closure source evidence required", "stale-quote-bytes": "Current quoted closure source evidence required", "extra-fields": "Closure worker fields changed",
  };
  expect(result.diagnostics).toContain(expected[fault]);
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
  const expected: Record<string, string> = { "same-context": "invalid docs-drift manifest independent review context",
    "blocking-findings": "invalid docs-drift manifest blocking review findings", "changed-target": "docs-drift original role capture original launch target or context changed",
    "changed-artifact": "docs-drift original evidence artifact changed" };
  expect(reviewed.diagnostics).toContain(expected[fault]);
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
    else {
      expect(target.manifest).toBeNull();
      const expected: Record<string, string> = { missing: "incomplete closure proposal current binary asset checks required",
        "wrong-path": "Current selected closure asset binding required", "stale-asset": "Current selected closure asset binding required",
        "empty-artifact": "Bounded original asset inspection artifact required" };
      expect(target.diagnostics).toContain(expected[fault]);
    }
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);


test("original closure roles survive freshly proven own explanation and closure on retry", async () => {
  const f = await fixture(), before = captureRepositoryState(f.repo), current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const workerEvidence = evidence("closure-retry-worker", current.worker_input_sha256!, canonicalJSON(packet(f, current)).toString());
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!, workerEvidence);
  const target = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
  expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
  const reviewerEvidence = evidence("closure-retry-reviewer", target.manifest_sha256!, "NO FINDINGS\n");
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!, reviewerEvidence);
  const manifest = target.manifest!, grants = manifest.effects.map(effect => ({ manifest_sha256: target.manifest_sha256!, effect_id: effect.id, effect_sha256: effectDigest([effect]) }));
  const validated = validateReviewedManifest({ manifest, current: manifest, worker: workerEvidence, reviewer: reviewerEvidence, policy: { worker: role, reviewer: role }, grants });
  const plan = sealPlan({ reviewed: validated, grants, ...runtimePolicyBinding(current.runtime!), context: "production", transport: "native", publication_kind: "resolve", corrections: [], attention: [] });
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
  const selected = retainSyntheticArtifact(f.artifacts, "retry-original-target.json", canonicalJSON({ source_commit: f.source,
    identity: current.target!.identity, target: current.target!.target }));
  for (const effect of plan.manifest.effects.slice(0, -1)) {
    journal = appendIntent(journal, effect.id);
    if (effect.kind !== "pr-close") journal = appendOutcome(journal, effect.id, { state: "observed", observation_sha256: "a".repeat(64),
      resource_id: effect.kind === "comment-create" ? "101" : null, object: null });
  }
  const responses = JSON.parse(readFileSync(f.responses_file, "utf8")), comment = plan.manifest.effects.find(effect => effect.kind === "comment-create")!;
  responses["repos/fixture/docs/pulls/1"].state = "closed";
  responses["repos/fixture/docs/issues/1/comments?per_page=100&page=1"] = [{ id: 101, body: comment.payload.body, user: { login: "fixture-bot", id: 20, type: "Bot" } }];
  writeFileSync(f.responses_file, JSON.stringify(responses));
  const store = current.target!.store!, transport = createNativeTransport({ source_repo: f.repo, artifact_root: f.artifacts,
    object_store: store, settings: f.collection.settings, credential: f.options.credential, path: f.options.path });
  const native = readNativeContext({ hostname: "github.com", repository: "fixture/docs", credential: f.options.credential, path: f.options.path });
  const context = await captureClosureInventory({ source_repo: f.repo, artifact_root: f.artifacts, journal_directory: journal.directory,
    original: selected, transport, objects: writePublicationObjects(store, plan, journal.header), reader: native.repository });
  const result = await collectClosureReview({ ...f.options, closure_inventory: context, worker_capture: worker, reviewer_capture: reviewer });
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.review!.manifest_sha256).toBe(target.manifest_sha256!);
  const other = await collectClosureWorkerInputs({ ...f.options, closure_inventory: context,
    selection: { ...f.options.selection, operation_id: "another-closure" } });
  expect(other.complete).toBe(false);
  expect(other.diagnostics).toContain("Original closure inventory scope changed");
  const foreign = await collectClosureWorkerInputs({ ...f.options, closure_inventory: context,
    selection: { ...f.options.selection, consolidation: 21 } });
  expect(foreign.complete).toBe(false); expect(foreign.diagnostics).toContain("Original closure inventory scope changed");
  const direct = { ...f.options, closure_inventory: context,
    selection: { schema_version: 1, source_commit: f.source, consolidation: 20 } };
  await expect(collectNativeClosure(direct)).rejects.toThrow("Original closure inventory scope changed");
  await expect(collectNativeClosure({ ...direct, closure_operation: "another-closure" })).rejects.toThrow("Original closure inventory scope changed");
  await expect(collectNativeClosure({ ...direct, closure_operation: f.options.selection.operation_id,
    selection: { ...direct.selection, consolidation: 21 } })).rejects.toThrow("Original closure inventory scope changed");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);


test.each(["actor", "late-actor", "runtime-actor", "runtime-comments", "default", "body", "head", "comments", "closed"])("closure original roles flag changed native %s after worker inputs", async fault => {
  const f = await fixture(), before = captureRepositoryState(f.repo), current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!,
    evidence("closure-native-change-worker", current.worker_input_sha256!, canonicalJSON(packet(f, current)).toString()));
  const values = JSON.parse(readFileSync(f.responses_file, "utf8"));
  if (fault === "actor") values.__viewer = { login: "other-fixture-actor", databaseId: 21 };
  if (["late-actor", "runtime-actor", "runtime-comments"].includes(fault)) {
    const reads = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    const count = reads.filter(call => call.program === "gh" && call.args.includes("graphql")).length;
    if (fault === "runtime-comments") values.__mutation_after = { at: count + 7,
      endpoint: "repos/fixture/docs/issues/1/comments?per_page=100&page=1",
      value: [{ id: 301, body: "Later owner concern", user: { login: "owner", id: 22 } }] };
    else values.__viewer_after = { at: count + (fault === "late-actor" ? 6 : 8), viewer: { login: "other-fixture-actor", databaseId: 21 } };
  }
  if (fault === "default") {
    values["repos/fixture/docs/git/ref/heads/main"].object.sha = f.snapshot.source_commit;
    values["repos/fixture/docs/git/commits/" + f.snapshot.source_commit] = { ...values["repos/fixture/docs/git/commits/" + f.source], sha: f.snapshot.source_commit };
  }
  if (fault === "body") values["repos/fixture/docs/pulls/1"].body += "Material later original edit\n";
  if (fault === "head") values["repos/fixture/docs/pulls/1"].head.sha = f.head;
  if (fault === "comments") values["repos/fixture/docs/issues/1/comments?per_page=100&page=1"] = [{ id: 301, body: "New owner concern", user: { login: "owner", id: 22 } }];
  if (fault === "closed") values["repos/fixture/docs/pulls/1"].state = "closed";
  writeFileSync(f.responses_file, JSON.stringify(values));
  const checked = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
  expect(checked.complete).toBe(false); expect(checked.scope_changed, JSON.stringify(checked.diagnostics)).toBe(true);
  const expected: Record<string, string> = { actor: "Current closure actor differs from committed policy",
    "late-actor": "Closure target source or actor changed during collection", "runtime-actor": "Closure source or actor changed during final role recheck",
    "runtime-comments": "Closure payload changed after original role collection", default: "Closure target requires its observed current default source",
    body: "incomplete closure original head or body changed", head: "incomplete closure original head or body changed",
    comments: "docs-drift original role capture original launch target or context changed", closed: "docs-drift original role capture original launch target or context changed" };
  expect(checked.diagnostics).toContain(expected[fault]);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 120000);


test("closure independent review rechecks the native actor after reopening both original roles", async () => {
  const f = await fixture(), before = captureRepositoryState(f.repo), current = await collectClosureWorkerInputs(f.options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!,
    evidence("closure-final-worker", current.worker_input_sha256!, canonicalJSON(packet(f, current)).toString()));
  const target = await collectClosureReviewTarget({ ...f.options, worker_capture: worker });
  expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
    evidence("closure-final-reviewer", target.manifest_sha256!, "NO FINDINGS\n"));
  const reads = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
  const values = JSON.parse(readFileSync(f.responses_file, "utf8"));
  values.__viewer_after = { at: reads.filter(call => call.program === "gh" && call.args.includes("graphql")).length + 12,
    viewer: { login: "changed-final-review-actor", databaseId: 21 } };
  writeFileSync(f.responses_file, JSON.stringify(values));
  const reviewed = await collectClosureReview({ ...f.options, worker_capture: worker, reviewer_capture: reviewer });
  expect(reviewed.complete).toBe(false); expect(reviewed.scope_changed).toBe(true); expect(reviewed.review).toBeNull();
  expect(reviewed.diagnostics).toContain("Closure source or actor changed during final role recheck");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);
