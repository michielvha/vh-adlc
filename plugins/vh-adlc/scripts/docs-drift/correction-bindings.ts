import { readCandidatePatch } from "./preparation";
import { canonicalDigest, sha256 } from "./protocol";
import type { CorrectionInput } from "./report";
import { resolutionSource } from "./resolve";
import type { ScanAssessment } from "./scan";
import type { OwnedObjectStore, Snapshot } from "./snapshot";

/** Normalize the configured check result and exact postimages after candidate verification. */
export function deriveCorrectionBindings(input: {
  source: Snapshot;
  candidate: Snapshot;
  store: OwnedObjectStore;
  paths: string[];
  scan: ScanAssessment;
}): CorrectionInput[] {
  const { source, candidate, store, paths, scan } = input;
  const inputs = canonicalDigest(resolutionSource(source));
  const verification = canonicalDigest({
    commands: source.settings.verification_commands,
    documents: candidate.protocol.bindings.documents,
    detectors: scan.detectors.map(({ input_sha256: _input, ...detector }) => detector),
    findings: scan.findings,
    suppressed_findings: scan.suppressed_findings,
    stale_suppressions: scan.stale_suppressions,
  });
  const postimages = new Map(candidate.blobs.map(blob => [blob.path, blob]));
  return paths.map(path => {
    const postimage = postimages.get(path);
    return {
      repository: source.settings.repository,
      scope_sha256: source.protocol.bindings.scope_sha256,
      identity: "correction-" + canonicalDigest({ path }),
      path,
      patch_sha256: sha256(readCandidatePatch(store, source.settings.repository, source.source_commit, candidate.source_commit, [path])),
      postimage_sha256: postimage ? sha256(postimage.bytes) : canonicalDigest({ path, absent: true }),
      verification_sha256: verification,
      inputs_sha256: inputs,
    };
  });
}
