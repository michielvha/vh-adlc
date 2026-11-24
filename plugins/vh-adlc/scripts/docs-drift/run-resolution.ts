import { randomUUID } from "node:crypto";
import { assessSource, readSourceAssessmentArtifacts } from "./source-assessment";
import { collectNativeResolution } from "./resolution-entry";
import { canonicalJSON } from "./protocol";
import { createRunArtifactWriter, originalRunContext, type RunDirectory } from "./run-directory";
import { loadCommittedSettings } from "./settings";
import { readNativeCredential, withNativeObservation } from "./transport";

/** Collect every selected original diff before any consolidation decision or candidate is prepared. */
export async function runResolution(options: { repo: string; run: RunDirectory; source_verification?: { path: string; sha256: string } }) {
  const { repo, run } = options, source = run.manifest.source_commit, nonce = randomUUID();
  originalRunContext(run);
  if (run.manifest.mode !== "resolve" || !run.manifest.proposals.length) throw Error("Resolve requires exact selected proposal numbers in a fresh run");
  const common = { repo, source, artifact_root: run.directory, owner: run.manifest.id, run: nonce };
  const baseline = options.source_verification ? readSourceAssessmentArtifacts({ ...common, candidate_repo: repo, reference: options.source_verification })
    : await assessSource(common);
  if (!baseline.complete || !baseline.evidence) throw Error(baseline.diagnostics.join("\n") || "Complete current source assessment required");
  const settings = loadCommittedSettings(repo, source).settings;
  const credential = await readNativeCredential({ hostname: settings.hostname, cwd: repo });
  const selected = { schema_version: 1, source_commit: source, proposals: run.manifest.proposals };
  const resolution = await withNativeObservation({ hostname: settings.hostname, repository: settings.repository, credential, collection: "audit" },
    observation => collectNativeResolution({ ...common, selection: selected, credential, observation }));
  if (!resolution.complete || !resolution.inputs) throw Error(resolution.diagnostics.join("\n") || "Complete original proposal inputs required");
  const retain = createRunArtifactWriter(run, settings.reports.max_entry_bytes, nonce);
  return { artifacts: { source_verification: baseline.evidence, resolution_inputs: retain("resolution-inputs", canonicalJSON(resolution)) },
    count: resolution.inputs.proposals.length };
}
