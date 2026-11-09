import { readBoundArtifact } from "./evidence-input";
import { readGit } from "./git";
import { effectDigest, manifestDigest, parseActionManifest, type ActionManifest, type EffectGrant } from "./manifests";
import { exactRecord } from "./publication-decisions";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";

/** The trusted entry records the actual request or adopted procedure. Same-user source origin is an attestation. */
export function readPublicationAuthority(options: {
  source_repo: string; artifact_root: string; reference: unknown; manifest: ActionManifest;
  adopted_procedure?: { repo: string; current_default: string; path: string };
}) {
  const bytes = readBoundArtifact({ ...options, reference: options.reference });
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(parsed).equals(bytes)) throw Error("Publication authority canonical record required");
  const request = exactRecord(parsed, ["schema_version", "kind", "manifest_sha256", "origin", "effects"], "Publication authority fields changed");
  const manifest = parseActionManifest(options.manifest), digest = manifestDigest(manifest);
  if (request.schema_version !== 1 || request.kind !== "docs-drift-publication-authority") throw Error("Publication authority actual scoped request required");
  if (request.manifest_sha256 !== digest) throw Error("Publication authority manifest changed");
  if (!canonicalJSON(request.effects).equals(canonicalJSON(manifest.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })))))
    throw Error("Publication authority exact effects required");
  const origin = request.origin as Record<string, unknown> | null;
  let source: Buffer;
  if (origin?.kind === "owner-request") {
    exactRecord(origin, ["kind", "artifact"], "Publication authority owner request fields changed");
    source = readBoundArtifact({ ...options, reference: origin.artifact });
  } else if (origin?.kind === "adopted-procedure" && options.adopted_procedure) {
    exactRecord(origin, ["kind", "commit", "path", "sha256"], "Publication authority procedure fields changed");
    const expected = options.adopted_procedure;
    if (origin.commit !== manifest.bindings.source_commit || origin.path !== expected.path) throw Error("Publication authority adopted procedure scope changed");
    source = readGit(expected.repo, "show", expected.current_default + ":" + expected.path);
    const original = readGit(expected.repo, "show", manifest.bindings.source_commit + ":" + expected.path);
    if (sha256(source) !== origin.sha256 || !source.equals(original)) throw Error("Publication authority adopted procedure changed");
  } else throw Error("Publication authority actual owner request or adopted procedure required");
  if (!decodeUTF8(source).trim()) throw Error("Publication authority original source required");
  const authority_sha256 = canonicalDigest({ record_sha256: sha256(bytes), source_sha256: sha256(source) });
  const grants: Array<EffectGrant & { authority_sha256: string }> = manifest.effects.map(effect => ({ manifest_sha256: digest,
    effect_id: effect.id, effect_sha256: effectDigest([effect]), authority_sha256 }));
  return freezeJSON({ origin: "owner-attestation" as const, source_kind: origin!.kind as "owner-request" | "adopted-procedure", authority_sha256, grants });
}
