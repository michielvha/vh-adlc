/** Toy retained adoption plus an owned native closure repository. No model/provider operation. */
import { join } from "node:path";
import { runtimeFixture } from "./runtime-fixture";
import { nativeClosureFixture } from "./closure-native-fixture";
import { role } from "./manifest-fixture";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import type { collectClosureWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-worker";

export async function closureRuntimeFixture(roots: string[], method: "merge" | "squash" | "rebase" = "merge", fault = "none",
  configure?: Parameters<typeof nativeClosureFixture>[4]) {
  const adopted = await runtimeFixture(roots, true, false,
    { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source }, true);
  const f = await nativeClosureFixture(roots, method, fault, adopted.repo, configure);
  const options = { repo: f.repo, source: f.source, artifact_root: f.artifacts, owner: "closure-test", run: "closure-worker",
    selection: { schema_version: 1, source_commit: f.source, consolidation: 20, operation_id: "closure-worker" },
    credential: "synthetic-read-token", path: f.environment.PATH!, cache_directory: adopted.selection.cache_directory,
    entry: "copilot" as const, launcher_path: adopted.selection.launcher_path, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") };
  return { ...f, adopted, options };
}

type AssetCheck = { path: string; sha256: string | null; artifact: { path: string; sha256: string } };
export function closureVerificationPacket(f: Awaited<ReturnType<typeof closureRuntimeFixture>>, current: Awaited<ReturnType<typeof collectClosureWorkerInputs>>) {
  const blob = f.snapshot.blobs.find(blob => blob.path === "src/app.ts");
  if (!blob) throw Error("Missing source fixture");
  return { input_sha256: current.worker_input_sha256, verifications: current.target!.target!.verification_scopes.map(scope => ({
    inputs_sha256: scope.inputs_sha256, state: "passed", method: "Native worker source assessment",
    evidence: [{ path: blob.path, sha256: sha256(blob.bytes), start: 0, end: blob.bytes.length, quote_sha256: sha256(blob.bytes) }], asset_checks: [] as AssetCheck[] })) };
}
