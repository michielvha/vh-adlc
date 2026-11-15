/** Ordinary installed code, strict flat policy and owned native services with synthetic role captures. */
import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";
import { git, put, commitAll } from "./repository-fixture";
import { captureSyntheticRole, installOwnedNativeService, retainSyntheticArtifact } from "./original-publication-fixture";
import { evidence } from "./manifest-fixture";
import { assessSource } from "../../../plugins/vh-adlc/scripts/docs-drift/source-assessment";
import { verifyCandidate } from "../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { collectReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/review-target";
import { effectDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { readAdoptedRolePolicy, roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { createRunDirectory } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

export async function ordinaryPublicationFixture(roots: string[]) {
  const component = ordinaryComponentFixture(roots, true), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable });
  const source = f.head(), origin = join(f.root, "ordinary-origin.git"), candidate = join(f.root, "ordinary-candidate");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const location = { repo: f.repo, directory: join(f.root, "ordinary-run"), origins: join(f.root, "original-state/vh-adlc/docs-drift/origins") };
  const run = createRunDirectory({ ...location, source, entry: "interactive" }), artifacts = run.directory;
  const common = { repo: f.repo, source, artifact_root: artifacts, owner: run.manifest.id, run: run.manifest.id };
  const service = installOwnedNativeService({ root: f.root, origin, source, head: source,
    publisher_identity: { actor: "fixture-owner", actor_id: 30 } });
  const path = join(f.root, "native-bin") + ":" + process.env.PATH;
  const baseline = await assessSource(common);
  expect(baseline.complete, baseline.diagnostics.join("\n")).toBe(true);
  const before = readFileSync(join(f.repo, "docs/guide.md")), replacement = Buffer.from("# Current candidate guide\n");
  const selection = { schema_version: 1 as const, source_commit: source, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace" as const,
    start: 0, end: before.length, before_sha256: sha256(before), replacement_base64: replacement.toString("base64"), after_mode: "100644" as const }] };
  const decisions = retainSyntheticArtifact(artifacts, "decisions.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-decisions",
    mode: "advisory", source_commit: source, selected_proposals: [], decisions: [{ id: "guide-fix", reason: "Synthetic selected correction" }], attention: [] }));
  const workerOptions = { ...common, source_verification: baseline.evidence!, decisions, credential: "synthetic-native-token", path,
    cache_directory: artifacts, entry: "interactive", launcher_path: join(f.repo, "scripts/entry.txt"), settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") };
  const current = await collectWorkerInputs(workerOptions);
  expect(current.complete, current.diagnostics.join("\n")).toBe(true);
  const facts = current.facts;
  if (!facts?.runtime || !facts.store || !facts.current_default || !facts.identity || !current.worker_input_sha256)
    throw Error("Complete ordinary native worker facts required");
  const nativePolicy = { repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime: facts.runtime };
  const workerPolicy = readAdoptedRolePolicy({ ...nativePolicy, role: "worker" });
  const publication = { operation_id: "ordinary-operation", proposal: { kind: "pr-create", payload: { base: "main", branch: "docs-drift/ordinary-operation",
    title: "Repair the guide", body: "Exact synthetic source correction\n", labels: ["documentation"], draft: false } } };
  const worker = captureSyntheticRole(artifacts, source, "worker", roleRuntimeDigest(facts.runtime, "worker"),
    evidence("ordinary-worker", current.worker_input_sha256, canonicalJSON({ input_sha256: current.worker_input_sha256, edits: selection.edits, publication }).toString()), workerPolicy);
  git(f.root, "clone", "--no-local", f.repo, candidate);
  put(candidate, "docs/guide.md", replacement.toString()); const head = commitAll(candidate);
  const verified = await verifyCandidate({ ...common, candidate_repo: candidate, candidate: head, selection });
  expect(verified.complete, verified.diagnostics.join("\n")).toBe(true);
  git(origin, "fetch", "--no-write-fetch-head", candidate, head);
  const state = JSON.parse(readFileSync(service.statePath, "utf8")); state.publication_commit = head;
  await Bun.write(service.statePath, JSON.stringify(state));
  const options = { ...workerOptions, candidate_repo: candidate, candidate: head, selection, candidate_verification: verified.evidence! };
  const target = await collectReviewTarget({ ...options, worker_capture: worker });
  expect(target.complete, target.diagnostics.join("\n")).toBe(true);
  const reviewerPolicy = readAdoptedRolePolicy({ ...nativePolicy, role: "reviewer" });
  const reviewer = captureSyntheticRole(artifacts, source, "reviewer", target.reviewer_runtime_sha256!,
    evidence("ordinary-reviewer", target.manifest_sha256!, "NO FINDINGS\n"), reviewerPolicy);
  const instruction = retainSyntheticArtifact(artifacts, "owner-request.txt", Buffer.from("Synthetic owner approves this exact displayed publication batch.\n"));
  const authority = retainSyntheticArtifact(artifacts, "owner-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority",
    manifest_sha256: target.manifest_sha256, origin: { kind: "owner-request", artifact: instruction },
    effects: target.manifest!.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
  return { ...f, component, source, origin, candidate, head, location, run, artifacts, service, options, baseline,
    publication: { ...options, worker_capture: worker, reviewer_capture: reviewer, authority } };
}
