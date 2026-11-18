import { inspectCandidate } from "./preparation";
import { readBoundArtifact } from "./evidence-input";
import { canonicalJSON, decodeUTF8, freezeJSON } from "./protocol";
import type { readSourceAssessmentArtifacts } from "./source-assessment";
import { readCandidateVerificationArtifacts } from "./verification-evidence";

type Options = Omit<Parameters<typeof readCandidateVerificationArtifacts>[0], "reference"> & { candidate_verification: unknown };
type Source = ReturnType<typeof readSourceAssessmentArtifacts>;

/** A source-only issue can reuse its original scan. Changed candidates still require passing verification. */
export function readPublicationCandidateProof(input: Options, source: Source) {
  const options = structuredClone(input);
  if (!source.complete || source.source_commit !== options.source || !source.evidence || !source.scan?.complete || !source.object_store)
    throw Error("Complete original source assessment required");
  let sourceOnly = false;
  if (options.candidate === options.source && canonicalJSON(options.candidate_verification).equals(canonicalJSON(source.evidence))) {
    const record: unknown = JSON.parse(decodeUTF8(readBoundArtifact({ source_repo: options.repo, artifact_root: options.artifact_root, reference: source.evidence })));
    sourceOnly = record !== null && typeof record === "object" && "kind" in record && record.kind === "docs-drift-source-assessment";
  }
  const verification = sourceOnly ? null : readCandidateVerificationArtifacts({ ...options, reference: options.candidate_verification });
  const inspection = sourceOnly ? inspectCandidate({ ...options, object_store: source.object_store }) : verification?.inspection;
  const scan = sourceOnly ? source.scan : verification?.scan;
  const evidence = sourceOnly ? source.evidence : verification?.evidence;
  if (!inspection?.complete || !inspection.object_store || !scan?.complete || !evidence)
    throw Error("Complete original candidate proof required");
  if (sourceOnly && (inspection.changed_paths.length !== 0 || inspection.source_commit !== source.source_commit))
    throw Error("Source-only publication cannot contain candidate changes");
  return freezeJSON({ source_only: sourceOnly, inspection, scan, evidence, verification });
}
