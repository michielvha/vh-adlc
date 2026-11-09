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
export function retainLookup(options: {
  artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect;
  transport: "native" | "collector"; lookup: unknown; state: "absent" | "conflict" | "done";
}): AbsenceEvidence {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  const bytes = canonicalJSON({ schema_version: 1, state: options.state, transport: options.transport,
    repository: options.plan.manifest.repository, operation_id: options.plan.manifest.operation_id,
    plan_sha256: sha256(canonicalJSON(options.plan)), effect_id: options.effect.id,
    effect_sha256: effectDigest([options.effect]), lookup: options.lookup });
  if (bytes.length > OUTPUT_LIMIT) throw Error("lookup evidence exceeds runtime bound");
  const path = join(root, options.state + "-" + randomUUID() + ".json");
  publishArtifact(path, bytes);
  return { path, sha256: sha256(bytes) };
}

export function readLookup(options: {
  evidence: AbsenceEvidence; artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect;
  transport: "native" | "collector"; state: "absent" | "conflict" | "done";
}): AbsenceEvidence {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  const evidence = options.evidence;
  if (dirname(evidence.path) !== root || realpathSync(evidence.path) !== evidence.path) throw Error("foreign lookup artifact");
  const bytes = readArtifact(evidence.path);
  if (sha256(bytes) !== evidence.sha256) throw Error("changed lookup evidence");
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("invalid lookup evidence");
  const value = parsed as Record<string, unknown>;
  if (!canonicalJSON(value).equals(bytes) || Object.keys(value).sort().join(",") !== "effect_id,effect_sha256,lookup,operation_id,plan_sha256,repository,schema_version,state,transport"
    || value.schema_version !== 1 || value.state !== options.state || value.transport !== options.transport
    || value.repository !== options.plan.manifest.repository || value.operation_id !== options.plan.manifest.operation_id
    || value.plan_sha256 !== sha256(canonicalJSON(options.plan)) || value.effect_id !== options.effect.id
    || value.effect_sha256 !== effectDigest([options.effect])) throw Error("lookup evidence scope changed");
  return { path: evidence.path, sha256: evidence.sha256 };
}


export function retainAbsence(options: Omit<Parameters<typeof retainLookup>[0], "state">): AbsenceEvidence {
  return retainLookup({ ...options, state: "absent" });
}
export function readAbsence(options: Omit<Parameters<typeof readLookup>[0], "state">): AbsenceEvidence {
  return readLookup({ ...options, state: "absent" });
}


/** Request timestamps change on revalidation. The observed facts and request destinations stay bound. */
export function lookupFactsDigest(path: string): string {
  const value = JSON.parse(decodeUTF8(readArtifact(path)));
  if (Array.isArray(value.lookup?.requests)) value.lookup.requests = value.lookup.requests.map((request: Record<string, unknown>) => {
    const { started_at: _started, observed_at: _observed, ...scope } = request;
    return scope;
  });
  return sha256(canonicalJSON(value));
}
