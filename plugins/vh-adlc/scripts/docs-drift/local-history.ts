import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join, relative } from "node:path";
import { verifyRuntimeAdoption } from "./adoption";
import { readCompatibleAdoptionLineage } from "./adoption-lineage";
import { readBoundArtifact } from "./evidence-input";
import { isGitAncestor } from "./git";
import { publishArtifact } from "./journal";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import { parseOwnedInvocation, type OwnedInvocation } from "./report-history";
import { reportTime } from "./report";
import { loadCommittedSettings, type Settings } from "./settings";
import { artifactDirectoryScope, type OwnedObjectStore } from "./snapshot";
import type { PublicationIdentity } from "./transport";

export type LocalHistoryContext = {
  repo: string; cache_directory: string; settings: Settings; identity: PublicationIdentity; store: OwnedObjectStore;
  current_default: string; source: string; component_sha256: string; run_id: string; scope_sha256: string; started_at: string;
  recheck(): void;
};
function registry(context: LocalHistoryContext, create: boolean): string | null {
  const cache = artifactDirectoryScope(context.cache_directory, context.repo).directory;
  const identity = canonicalDigest({ hostname: context.settings.hostname, repository_id: context.identity.repository_id, actor_id: context.identity.actor_id });
  let current = cache;
  for (const name of ["local-report-history", identity]) {
    current = join(current, name);
    if (!existsSync(current)) {
      if (!create) return null;
      try { mkdirSync(current, { mode: 0o700 }); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
    }
    artifactDirectoryScope(current, context.repo);
  }
  return current;
}
function normalizedIdentity(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Local invocation identity required");
  const value = input as Record<string, unknown>;
  if (typeof value.repository !== "string" || typeof value.actor !== "string") throw Error("Local invocation identity names required");
  return { ...value, repository: value.repository.toLowerCase(), actor: value.actor.toLowerCase() };
}
function identity(context: LocalHistoryContext) { return normalizedIdentity({ hostname: context.settings.hostname, ...context.identity }); }
function stamp(value: string) { return new Date(reportTime(value)).toISOString().replaceAll(/[-:.]/gu, ""); }

/** Read only cache-owned attestations. Adoption and the eventual report pair remain independent requirements. */
export function readLocalInvocationRegistry(context: LocalHistoryContext): { invocations: OwnedInvocation[]; diagnostics: string[] } {
  const invocations: OwnedInvocation[] = [], diagnostics: string[] = [];
  try {
    const root = registry(context, false);
    if (root === null) return { invocations, diagnostics };
    const allowed = new Set(readCompatibleAdoptionLineage({ store: context.store, current_default: context.current_default, identity: context.identity }));
    const names = readdirSync(root).filter(name => /^\d{8}T\d{9}Z-[a-f0-9]{64}\.json$/u.test(name))
      .sort(compareUTF8).reverse().slice(0, context.settings.reports.max_runs);
    for (const name of names) {
      try {
        const digest = name.slice(-69, -5), bytes = readBoundArtifact({ source_repo: context.repo, artifact_root: root,
          reference: { path: name, sha256: digest } });
        if (bytes.length > Math.min(OUTPUT_LIMIT, context.settings.reports.max_entry_bytes)) throw Error("Local invocation exceeds the retained bound");
        const parsed: unknown = JSON.parse(decodeUTF8(bytes));
        if (!canonicalJSON(parsed).equals(bytes) || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Original local invocation record required");
        const record = parsed as Record<string, unknown>;
        if (Object.keys(record).sort().join(",") !== "identity,invocation,kind,schema_version" || record.schema_version !== 1
          || record.kind !== "docs-drift-local-invocation" || canonicalDigest(normalizedIdentity(record.identity)) !== canonicalDigest(identity(context)))
          throw Error("Local invocation identity changed");
        const invocation = parseOwnedInvocation(record.invocation), completed = reportTime(invocation.completed_at), start = reportTime(context.started_at);
        if (name !== stamp(invocation.completed_at) + "-" + sha256(bytes) + ".json" || invocation.repository !== context.settings.repository
          || invocation.scope_sha256 !== context.scope_sha256 || completed >= start || start - completed > context.settings.reports.max_age_seconds * 1000
          || !isGitAncestor(context.store.root, invocation.source_commit, context.current_default)) throw Error("Local invocation scope or age changed");
        const adopted = verifyRuntimeAdoption({ repo: context.store.root, current_default: invocation.source_commit, identity: context.identity });
        if (!allowed.has(adopted.adoption_sha256) || adopted.component_pin.component_sha256 !== invocation.component_sha256
          || loadCommittedSettings(context.store.root, invocation.source_commit).settings.reports.interactive !== "local-attestation")
          throw Error("Local invocation producer is outside approved history");
        invocations.push(invocation);
      } catch { diagnostics.push("Local invocation record " + name + " is missing, changed or ineligible"); }
    }
  } catch { diagnostics.push("Local invocation registry is unavailable; earlier local attention cannot be carried"); }
  return freezeJSON({ invocations, diagnostics });
}

/** Stage immutable owner-attestation metadata. Activation follows the controller's final original-input checks. */
export function stageLocalInvocation(inputContext: LocalHistoryContext, input: OwnedInvocation) {
  const context = { ...inputContext };
  const invocation = parseOwnedInvocation(input);
  if (context.settings.reports.interactive !== "local-attestation" || invocation.repository !== context.settings.repository
    || invocation.source_commit !== context.source || invocation.component_sha256 !== context.component_sha256
    || invocation.scope_sha256 !== context.scope_sha256 || invocation.id !== context.run_id) throw Error("Original local invocation scope required");
  const bytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-local-invocation", identity: identity(context), invocation });
  if (bytes.length > Math.min(OUTPUT_LIMIT, context.settings.reports.max_entry_bytes)) throw Error("Local invocation exceeds the retained bound");
  const root = registry(context, true);
  if (root === null) throw Error("Private local invocation registry required");
  const digest = sha256(bytes), path = join(root, stamp(invocation.completed_at) + "-" + digest + ".json");
  const reference = { path: relative(context.cache_directory, path), sha256: digest };
  const read = () => readBoundArtifact({ source_repo: context.repo, artifact_root: context.cache_directory, reference });
  const existing = existsSync(path), pending = join(root, ".pending-" + randomUUID());
  if (existing) { if (!read().equals(bytes)) throw Error("Original local invocation changed"); }
  else publishArtifact(pending, bytes);
  return { reference, activate(validate: () => void) {
    if (!existing) readBoundArtifact({ source_repo: context.repo, artifact_root: root, reference: { path: relative(root, pending), sha256: digest } });
    context.recheck(); validate();
    if (!existing) renameSync(pending, path);
    return freezeJSON({ ...reference });
  } };
}
