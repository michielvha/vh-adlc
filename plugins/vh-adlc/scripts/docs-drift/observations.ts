import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { publishArtifact, readArtifact, type SealedPlan } from "./journal";
import { effectDigest, type Effect } from "./manifests";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { OUTPUT_LIMIT } from "./owned-process";
import { externalArtifactDirectory } from "./snapshot";

export type AbsenceEvidence = { path: string; sha256: string };

/** Each record comes from a fresh transport lookup, under that transport's selected artifact root. */
export function retainAbsence(options: {
  artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect;
  transport: "native" | "collector"; lookup: unknown;
}): AbsenceEvidence {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  const bytes = canonicalJSON({ schema_version: 1, state: "absent", transport: options.transport,
    repository: options.plan.manifest.repository, operation_id: options.plan.manifest.operation_id,
    plan_sha256: sha256(canonicalJSON(options.plan)), effect_id: options.effect.id,
    effect_sha256: effectDigest([options.effect]), lookup: options.lookup });
  if (bytes.length > OUTPUT_LIMIT) throw Error("absence lookup evidence exceeds runtime bound");
  const path = join(root, "absence-" + randomUUID() + ".json");
  publishArtifact(path, bytes);
  return { path, sha256: sha256(bytes) };
}

export function readAbsence(options: {
  evidence: AbsenceEvidence; artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect;
  transport: "native" | "collector";
}): AbsenceEvidence {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  const evidence = options.evidence;
  if (dirname(evidence.path) !== root || realpathSync(evidence.path) !== evidence.path) throw Error("foreign absence artifact");
  const bytes = readArtifact(evidence.path);
  if (sha256(bytes) !== evidence.sha256) throw Error("changed absence evidence");
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("invalid absence evidence");
  const value = parsed as Record<string, unknown>;
  if (!canonicalJSON(value).equals(bytes) || Object.keys(value).sort().join(",") !== "effect_id,effect_sha256,lookup,operation_id,plan_sha256,repository,schema_version,state,transport"
    || value.schema_version !== 1 || value.state !== "absent" || value.transport !== options.transport
    || value.repository !== options.plan.manifest.repository || value.operation_id !== options.plan.manifest.operation_id
    || value.plan_sha256 !== sha256(canonicalJSON(options.plan)) || value.effect_id !== options.effect.id
    || value.effect_sha256 !== effectDigest([options.effect])) throw Error("absence evidence scope changed");
  return { path: evidence.path, sha256: evidence.sha256 };
}
