import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { readBoundArtifact } from "./evidence-input";
import { readGit } from "./git";
import { exactRecord } from "./publication-decisions";
import { canonicalDigest, canonicalJSON, decodeUTF8, protocolPath } from "./protocol";
import { createRunArtifactWriter, originalRunContext, type RunDirectory } from "./run-directory";
import { captureRepositoryState, captureSnapshot, matchesRepositoryState } from "./snapshot";
import { verifyCandidate } from "./candidate-verification";
import { readCandidatePatch } from "./preparation";
import { collectReviewTarget } from "./review-target";
import { collectCandidateReview } from "./candidate-review";
import { captureConfiguredRole, NATIVE_REVIEW_REPLY } from "./role-process";
import { readAdoptedRolePolicy } from "./role-capture";
import { readNativeCredential, withNativeObservation } from "./transport";

type Reference = { path: string; sha256: string };

/** Verify the recorded owned candidate, then run the independent native review against its exact manifest. */
export async function runVerification(options: { repo: string; run: RunDirectory; source_verification: Reference;
  preparation: Reference; selection: Reference; decisions: Reference; worker_capture: Reference }) {
  const { repo, run } = options, source = run.manifest.source_commit, nonce = randomUUID();
  originalRunContext(run);
  const read = (reference: Reference) => readBoundArtifact({ source_repo: repo, artifact_root: run.directory, reference });
  const payload: unknown = JSON.parse(decodeUTF8(read(options.preparation)));
  const hasResolution = payload !== null && typeof payload === "object" && Object.hasOwn(payload, "resolution_record");
  const saved = exactRecord(payload, ["schema_version", "source_commit", "prepared", "publication", ...(hasResolution ? ["resolution_record"] : [])], "Original preparation required");
  if (saved.schema_version !== 1 || saved.source_commit !== source || saved.prepared === null || typeof saved.prepared !== "object"
    || Array.isArray(saved.prepared) || !("checkout" in saved.prepared) || typeof saved.prepared.checkout !== "string")
    throw Error("Original owned candidate checkout required");
  const candidateRepo = realpathSync(saved.prepared.checkout);
  protocolPath(relative(run.directory, candidateRepo));
  const candidate = readGit(candidateRepo, "rev-parse", "HEAD").toString().trim(), selection: unknown = JSON.parse(decodeUTF8(read(options.selection)));
  let resolutionRecord: Reference | undefined;
  if (hasResolution) {
    const record = exactRecord(saved.resolution_record, ["path", "sha256"], "Original resolution record reference required");
    if (typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.sha256)) throw Error("Original resolution digest required");
    resolutionRecord = { path: protocolPath(record.path), sha256: record.sha256 };
  }
  const before = canonicalDigest(captureRepositoryState(candidateRepo, "full")), snapshot = captureSnapshot(repo, source);
  const retain = createRunArtifactWriter(run, snapshot.settings.reports.max_entry_bytes, nonce);
  const verification = await verifyCandidate({ repo, source, candidate_repo: candidateRepo, candidate, selection,
    artifact_root: run.directory, owner: run.manifest.id, run: nonce, resolution_record: resolutionRecord });
  if (!verification.complete || !verification.evidence || !verification.scan?.checkout)
    throw Error(verification.diagnostics.join("\n") || "Commit and verify the selected owned candidate under the project rules");
  const verifiedCheckout = verification.scan.checkout;
  const credential = await readNativeCredential({ hostname: snapshot.settings.hostname, cwd: repo });
  const common = { repo, source, candidate_repo: candidateRepo, candidate, selection, artifact_root: run.directory,
    owner: run.manifest.id, run: nonce, source_verification: options.source_verification, candidate_verification: verification.evidence,
    decisions: options.decisions, worker_capture: options.worker_capture, credential, cache_directory: run.directory,
    entry: run.manifest.entry, launcher_path: join(import.meta.dir, "cli.ts"), settings_path: join(repo, ".vh-adlc/docs-drift.yaml"), resolution_record: resolutionRecord };
  const review = await withNativeObservation({ hostname: snapshot.settings.hostname, repository: snapshot.settings.repository, credential, collection: "audit" }, async observation => {
    const target = await collectReviewTarget({ ...common, observation }), facts = target.bindings?.facts;
    if (!target.complete || !target.manifest || !target.manifest_sha256 || !facts?.runtime || !facts.store || !facts.current_default || !facts.identity || !facts.candidate?.object_store)
      throw Error(target.diagnostics.join("\n") || "Exact native candidate review target required");
    const runtime = facts.runtime;
    const policy = readAdoptedRolePolicy({ repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime, role: "reviewer" });
    const manifest = retain("reviewed-plan", canonicalJSON(target.manifest));
    const patch = retain("candidate-full-diff", readCandidatePatch(facts.candidate.object_store, snapshot.settings.repository, source, candidate));
    const request = retain("candidate-review-request", canonicalJSON({ schema_version: 1, kind: "docs-drift-candidate-review-request",
      artifact_root: run.directory, source_commit: source, candidate_commit: candidate, candidate_checkout: verifiedCheckout,
      source_verification: options.source_verification, candidate_verification: verification.evidence, decisions: options.decisions,
      worker_capture: options.worker_capture, selection: options.selection, full_diff: patch,
      target_sha256: target.manifest_sha256, manifest: target.manifest, project_procedure: snapshot.settings.project_procedure,
      feedback_files: snapshot.settings.feedback_files, canonicalizer: join(runtime.component.directory, "scripts/docs-drift/protocol.ts") }));
    const prompt = [
      "Independently review the exact proposed documentation correction and every effect in the request manifest. Read the full raw candidate diff, original source assessment, worker output, decision packet, selected postimages, verification evidence, current source, consumer procedure and feedback.",
      "Check full accounting, source-grounded claims, protected documents/frontmatter, generator outputs, unchanged unrelated behavior and exact publication payload. For resolution, every original hunk and feedback choice must be accounted for. Unknown or incomplete evidence prevents a clean review.",
      "Use read-only tools. Do not write files, run shell/network commands, publish, delegate or reuse another context. This review supplies no owner permission.",
      NATIVE_REVIEW_REPLY,
      "DOCS_DRIFT_REQUEST: " + JSON.stringify({ path: join(run.directory, request.path), sha256: request.sha256 }),
    ].join("\n");
    const cwd = verifiedCheckout;
    const reviewer = await captureConfiguredRole({ source_repo: repo, candidate_repo: candidateRepo, source_commit: source, artifact_root: run.directory,
      runtime, role: "reviewer", cwd, prompt, environment: process.env, target_sha256: target.manifest_sha256, policy });
    read(request); read(patch); read(manifest);
    const checked = await collectCandidateReview({ ...common, observation, reviewer_capture: reviewer });
    if (!checked.complete) throw Error(checked.diagnostics.join("\n") || "Independent candidate review incomplete");
    return { reviewer_capture: reviewer, reviewed_plan: manifest, candidate_review: retain("candidate-review", canonicalJSON(checked)) };
  });
  for (const reference of [options.preparation, options.selection, options.decisions, options.worker_capture, options.source_verification]) read(reference);
  if (!matchesRepositoryState(candidateRepo, before, "full")) throw Error("Owned candidate changed during verification and review");
  return { artifacts: { ...review, candidate_verification: verification.evidence,
    candidate: retain("candidate", canonicalJSON({ source_commit: source, candidate_commit: candidate, checkout: candidateRepo,
      ...(resolutionRecord ? { resolution_record: resolutionRecord } : {}) })) } };
}
