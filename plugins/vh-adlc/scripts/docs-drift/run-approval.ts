import { existsSync } from "node:fs";
import { join } from "node:path";
import { collectionReaders, readGit } from "./git";
import { readBoundArtifact } from "./evidence-input";
import { readArtifact } from "./journal";
import { effectDigest, manifestDigest, type ActionManifest } from "./manifests";
import { exactRecord } from "./publication-decisions";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { appendRunStage, createRunArtifactWriter, latestRunArtifact, originalRunContext, readRunDirectory, type RunDirectory } from "./run-directory";
import { loadCommittedSettings, SetupRequired } from "./settings";

/** Retain an exact owner request or explicitly selected committed procedure as an attestation. */
export function recordRunApproval(options: { repo: string; run: RunDirectory; manifest: ActionManifest; command: "publish" | "close" }) {
  const { repo, run, manifest } = options, location = originalRunContext(run).options;
  if (manifest.bindings.source_commit !== run.manifest.source_commit || manifest.bindings.settings_sha256 !== run.manifest.settings_sha256)
    throw Error("Approval manifest differs from the original run source or configuration");
  const prior = latestRunArtifact(run, "approval");
  if (prior) {
    const bytes = readBoundArtifact({ source_repo: repo, artifact_root: run.directory, reference: prior });
    const saved = exactRecord(JSON.parse(decodeUTF8(bytes)), ["schema_version", "kind", "manifest_sha256", "origin", "effects"], "Original approval fields changed");
    if (saved.schema_version !== 1 || saved.kind !== "docs-drift-publication-authority") throw Error("Original publication approval required");
    if (saved.manifest_sha256 === manifestDigest(manifest)) return run;
  }
  if (latestRunArtifact(run, "journal")) throw Error("Original operation approval is missing");
  const source = run.manifest.source_commit, settings = loadCommittedSettings(repo, source).settings;
  if (!existsSync(join(run.directory, "approval.yaml"))) throw new SetupRequired("Retain exact approval.yaml for the displayed manifest before publication.");
  const request = readArtifact(join(run.directory, "approval.yaml"));
  if (request.length > settings.reports.max_entry_bytes) throw Error("Bounded publication approval required");
  const payload: unknown = collectionReaders().yaml(request);
  const procedure = payload !== null && typeof payload === "object" && Object.hasOwn(payload, "procedure");
  const approved = exactRecord(payload, ["manifest_sha256", procedure ? "procedure" : "request"], "approval.yaml requires the exact manifest_sha256 and its actual request or procedure");
  if (approved.manifest_sha256 !== manifestDigest(manifest)) throw Error("Approval must bind the exact displayed manifest");
  const retain = createRunArtifactWriter(run, settings.reports.max_entry_bytes);
  let origin: { kind: "owner-request"; artifact: { path: string; sha256: string } }
    | { kind: "adopted-procedure"; commit: string; path: string; sha256: string };
  if (procedure) {
    if (approved.procedure !== settings.project_procedure) throw Error("Select the committed adopter procedure granting this operation");
    const bytes = readGit(repo, "show", source + ":" + settings.project_procedure);
    origin = { kind: "adopted-procedure", commit: source, path: settings.project_procedure, sha256: sha256(bytes) };
  } else {
    if (typeof approved.request !== "string" || !approved.request.trim()) throw Error("Actual owner request required");
    origin = { kind: "owner-request", artifact: retain("publication-owner-request", request) };
  }
  const approval = retain("publication-authority", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority",
    manifest_sha256: manifestDigest(manifest), origin, effects: manifest.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
  appendRunStage(run, { command: options.command, state: "pending", artifacts: { approval } });
  return readRunDirectory(location);
}
