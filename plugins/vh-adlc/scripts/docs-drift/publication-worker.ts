import type { WorkerInputs } from "./manifests";
import { canonicalDigest, freezeJSON, sha256 } from "./protocol";
import { resolutionSource } from "./resolve";
import type { Snapshot } from "./snapshot";

/** Source assessment and explicit decisions exist before a worker can produce a candidate. */
export function deriveWorkerInputs(options: {
  snapshot: Snapshot; assessment_sha256: string; source_verification: { path: string; sha256: string };
  decisions_sha256: string; proposals_sha256: string;
}): WorkerInputs {
  const { snapshot } = options;
  const implementation = (path: string | null) => {
    if (path === null) return null;
    const blob = snapshot.blobs.find(blob => blob.path === path);
    if (!blob) throw Error("Declared scanner implementation missing");
    return sha256(blob.bytes);
  };
  return freezeJSON({ source_commit: snapshot.source_commit, assessment_sha256: options.assessment_sha256,
    settings_sha256: snapshot.settings_sha256,
    scanner_sha256: canonicalDigest({ policy: snapshot.settings.scanner, script: implementation(snapshot.settings.scanner.script), adapter: implementation(snapshot.settings.scanner.adapter) }),
    options_sha256: canonicalDigest(snapshot.settings.detector_options), scope_sha256: snapshot.protocol.bindings.scope_sha256,
    feedback_sha256: snapshot.protocol.bindings.feedback_sha256, proposals_sha256: options.proposals_sha256, decisions_sha256: options.decisions_sha256,
    dependencies_sha256: canonicalDigest({ source: resolutionSource(snapshot), source_verification: options.source_verification }) });
}
