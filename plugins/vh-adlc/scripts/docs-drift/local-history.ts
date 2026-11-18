import { sameAccount, type PublisherEntry } from "./identity";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, opendirSync, renameSync } from "node:fs";
import { join, relative } from "node:path";
import { verifyProductionPreflight } from "./preflight";
import { readBoundArtifact } from "./evidence-input";
import { isGitAncestor } from "./git";
import { publishArtifact } from "./journal";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import { parseOwnedInvocation, type OwnedInvocation } from "./report-history";
import { reportTime } from "./report";
import { loadCommittedSettings, SetupRequired, type Settings } from "./settings";
import { artifactDirectoryScope, type OwnedObjectStore } from "./snapshot";
import type { PublicationIdentity } from "./transport";

export type LocalHistoryContext = {
  repo: string; cache_directory: string; settings: Settings; identity: PublicationIdentity; store: OwnedObjectStore;
  current_default: string; source: string; entry?: PublisherEntry; component_sha256: string; run_id: string; scope_sha256: string; started_at: string;
  recheck(): void;
};
function registry(context: LocalHistoryContext, create: boolean, indexed = false): string | null {
  const cache = artifactDirectoryScope(context.cache_directory, context.repo).directory;
  const identity = canonicalDigest({ hostname: context.settings.hostname, repository_id: context.identity.repository_id, actor_id: context.identity.actor_id });
  let current = cache;
  for (const name of ["local-report-history", identity, ...(indexed ? ["by-invocation"] : [])]) {
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

/** Resolve only the invocations named by the bounded saved-pair collection. */
export function createLocalInvocationReader(inputContext: LocalHistoryContext) {
  const context = { ...inputContext }, diagnostics: string[] = [];
  if (context.settings.schema_version !== 2) throw new SetupRequired("Use the original implementation to inspect version-one local history.");
  return { diagnostics, read(input: OwnedInvocation): OwnedInvocation | null {
    try {
      const wanted = parseOwnedInvocation(input), completed = reportTime(wanted.completed_at), start = reportTime(context.started_at);
      if (wanted.repository !== context.settings.repository || wanted.scope_sha256 !== context.scope_sha256
        || completed >= start || start - completed > context.settings.reports.max_age_seconds * 1000
        || !isGitAncestor(context.store.root, wanted.source_commit, context.current_default)) throw Error("Local invocation scope or age changed");
      const root = registry(context, false);
      if (root === null) throw Error("Local invocation registry unavailable");
      const original = loadCommittedSettings(context.store.root, wanted.source_commit).settings;
      if (context.settings.schema_version !== 2 || !context.settings.component || original.schema_version !== 2 || !original.component || !context.entry)
        throw Error("Original ordinary local history policy required");
      verifyProductionPreflight({ repo: context.store.root, current_default: context.current_default, component: context.settings.component,
        publisher: { entry: context.entry, identity: context.identity } });
      const producer = verifyProductionPreflight({ repo: context.store.root, current_default: wanted.source_commit, component: original.component });
      if (!Object.values(producer.checklist.native_entries).some(entry => entry.repository_id === context.identity.repository_id
        && sameAccount(entry.publisher, context.identity))) throw Error("Original local publisher identity changed");
      const component = original.component.component_sha256;
      if (component !== wanted.component_sha256 || original.reports.interactive !== "local-attestation")
        throw Error("Local invocation producer is outside approved history");
      const expected = canonicalJSON({ schema_version: 1, kind: "docs-drift-local-invocation", identity: identity(context), invocation: wanted });
      const read = (directory: string, name: string, digest: string) => {
        const bytes = readBoundArtifact({ source_repo: context.repo, artifact_root: directory, reference: { path: name, sha256: digest } });
        if (bytes.length > Math.min(OUTPUT_LIMIT, context.settings.reports.max_entry_bytes)) throw Error("Local invocation exceeds the retained bound");
        const parsed: unknown = JSON.parse(decodeUTF8(bytes));
        if (!canonicalJSON(parsed).equals(bytes) || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Original local invocation record required");
        const record = parsed as Record<string, unknown>;
        if (Object.keys(record).sort().join(",") !== "identity,invocation,kind,schema_version" || record.schema_version !== 1
          || record.kind !== "docs-drift-local-invocation" || canonicalDigest(normalizedIdentity(record.identity)) !== canonicalDigest(identity(context)))
          throw Error("Local invocation identity changed");
        const invocation = parseOwnedInvocation(record.invocation);
        if (!canonicalJSON(invocation).equals(canonicalJSON(wanted))) throw Error("Original local invocation changed");
        return invocation;
      };
      const indexed = registry(context, false, true), name = wanted.invocation_sha256 + ".json";
      if (indexed !== null && existsSync(join(indexed, name))) return read(indexed, name, sha256(expected));
      // Original timestamp-addressed records remain readable without a second max_runs window.
      const prefix = stamp(wanted.completed_at) + "-", directory = opendirSync(root);
      try {
        let entry;
        while ((entry = directory.readSync()) !== null) {
          if (!entry.name.startsWith(prefix) || !/^\d{8}T\d{9}Z-[a-f0-9]{64}\.json$/u.test(entry.name)) continue;
          try { return read(root, entry.name, entry.name.slice(-69, -5)); }
          catch { /* A different invocation can share the same millisecond. */ }
        }
      } finally { directory.closeSync(); }
      throw Error("Original local invocation missing");
    } catch { diagnostics.push("Local invocation record " + input.id + " is missing, changed or ineligible"); return null; }
  } };
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
  const root = registry(context, true, true);
  if (root === null) throw Error("Private local invocation registry required");
  const digest = sha256(bytes), path = join(root, invocation.invocation_sha256 + ".json");
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
