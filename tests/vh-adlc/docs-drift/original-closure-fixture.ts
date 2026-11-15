/** Complete synthetic original roles and real owned native Git refs for closure-controller tests. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "bun:test";
import { collectClosureWorkerInputs, collectClosureReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-worker";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { effectDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { closureRuntimeFixture, closureVerificationPacket } from "./closure-runtime-fixture";
import { captureSyntheticRole, retainSyntheticArtifact, installOwnedNativeService } from "./original-publication-fixture";
import { evidence } from "./manifest-fixture";
import { git } from "./repository-fixture";

export async function originalClosureFixture(roots: string[], publisher?: Parameters<typeof closureRuntimeFixture>[4]) {
  const f = await closureRuntimeFixture(roots, "merge", "none", undefined, publisher), origin = join(f.adopted.root, "closure-origin");
  git(f.adopted.root, "clone", "--no-local", "--no-checkout", f.repo, origin);
  git(origin, "update-ref", "refs/heads/main", f.source);
  git(origin, "update-ref", "refs/pull/20/head", f.head);
  for (const original of f.proposals.values()) git(origin, "update-ref", "refs/pull/" + original.number + "/head", original.head_sha);
  const service = installOwnedNativeService({ root: f.adopted.root, origin, source: f.source, head: f.source, publisher_identity: publisher?.identities[publisher.entry] });
  const state = JSON.parse(readFileSync(service.statePath, "utf8")), responses = JSON.parse(readFileSync(f.responses_file, "utf8"));
  // Native pull responses include the metadata needed for pre-dispatch delivery baselines.
  state.prs = [responses["repos/fixture/docs/pulls/1"], responses["repos/fixture/docs/pulls/20"]]
    .map((proposal: Record<string, unknown>) => ({ ...proposal, title: proposal.title ?? "Synthetic closure proposal", labels: proposal.labels ?? [] }));
  writeFileSync(service.statePath, JSON.stringify(state));
  const options = { ...f.options, path: join(f.adopted.root, "native-bin") + ":" + process.env.PATH };
  const current = await collectClosureWorkerInputs(options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!,
    evidence("closure-controller-worker", current.worker_input_sha256!, canonicalJSON(closureVerificationPacket(f, current)).toString()));
  const target = await collectClosureReviewTarget({ ...options, worker_capture: worker });
  expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
    evidence("closure-controller-reviewer", target.manifest_sha256!, "NO FINDINGS\n"));
  const request = retainSyntheticArtifact(f.artifacts, "closure-owner-request.txt", Buffer.from("Synthetic exact owner request approves the shown original closure batch, lease, receipt, explanations and release.\n"));
  const authority = retainSyntheticArtifact(f.artifacts, "closure-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority", manifest_sha256: target.manifest_sha256,
    origin: { kind: "owner-request", artifact: request }, effects: target.manifest!.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
  return { ...f, origin, service, worker, reviewer, target, publication: { ...options, worker_capture: worker, reviewer_capture: reviewer, authority } };
}

export function closureCLIArguments(f: Awaited<ReturnType<typeof originalClosureFixture>>, command: "check-closure-publication" | "publish-closure" | "resume-closure", journal?: string) {
  const selected = retainSyntheticArtifact(f.artifacts, "closure-cli-selection.json", canonicalJSON(f.options.selection)), options = f.publication;
  const argv = [process.execPath, join(f.adopted.retained.directory, "scripts/docs-drift/cli.ts"), command,
    "--repo", f.repo, "--source", f.source, "--artifact-root", f.artifacts, "--selection", selected.path, "--selection-sha256", selected.sha256,
    "--cache-root", options.cache_directory, "--entry", options.entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
    "--worker-capture", f.worker.path, "--worker-capture-sha256", f.worker.sha256,
    "--reviewer-capture", f.reviewer.path, "--reviewer-capture-sha256", f.reviewer.sha256,
    "--authority", options.authority.path, "--authority-sha256", options.authority.sha256];
  if (journal) argv.push("--journal-directory", journal);
  return argv;
}
