/** Owned Git and observed-shaped invocation metadata fixtures, without model or hosted acceptance. */
import { afterAll, expect, test } from "bun:test";
import { chmodSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { source, portableRecord, deliverRecord, runtimeIdentity, pin, write, commit } from "./adoption-fixture";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { captureRepositoryState, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import type { OwnedInvocation } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned local-history metadata roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function fixture(expired = false) {
  const f = source(roots);
  f.configured.reports.interactive = "local-attestation"; f.configured.reports.local_history_roots = ["history"];
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(f.configured)); f.candidate = commit(f.repo, "synthetic local history policy");
  const current = deliverRecord(f, portableRecord(f)), cache = join(f.artifacts, "local-cache");
  mkdirSync(cache, { mode: 0o700 });
  const store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts, source_repo: f.repo,
    source_commit: current, repository: f.configured.repository, owner: "local-history-fixture", run: "metadata" });
  const bare = { origin: "local-attestation" as const, context: "production" as const, repository: f.configured.repository,
    id: "previous-owned-run", source_commit: current, component_sha256: pin().component_sha256,
    request_sha256: sha256(Buffer.from("synthetic original request")), scope_sha256: sha256(Buffer.from("synthetic scope")),
    report_sha256: sha256(Buffer.from("synthetic report bytes")),
    completed_at: new Date(Date.now() - (expired ? 8 * 86400000 : 10000)).toISOString() };
  const invocation: OwnedInvocation = { ...bare, invocation_sha256: canonicalDigest(bare) };
  const context = { repo: f.repo, cache_directory: cache, settings: loadCommittedSettings(f.repo, current).settings,
    identity: runtimeIdentity, store, current_default: current, source: current, component_sha256: bare.component_sha256,
    run_id: bare.id, scope_sha256: bare.scope_sha256, started_at: new Date().toISOString(), recheck: () => {} };
  return { ...f, cache, invocation, context };
}

test.each(["matching", "current-casing", "legacy-casing", "interleaved", "changed", "foreign", "component", "scope", "unadopted", "fields", "symlink", "hardlink", "directory", "expired", "guard", "mutated-guard"])("local invocation records are private, source-bound and activated last: %s", async fault => {
  try {
    const { readLocalInvocationRegistry, stageLocalInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/local-history");
    const f = fixture(fault === "expired"), before = captureRepositoryState(f.repo);
    expect(readLocalInvocationRegistry(f.context).invocations).toEqual([]);
    if (fault === "mutated-guard") f.context.recheck = () => { throw Error("Synthetic changed source"); };
    const staged = stageLocalInvocation(f.context, f.invocation);
    expect(readLocalInvocationRegistry(f.context).invocations).toEqual([]);
    if (fault === "mutated-guard") f.context.recheck = () => {};
    if (fault === "guard" || fault === "mutated-guard") {
      const validate = fault === "guard" ? () => { throw Error("Synthetic changed source"); } : () => {};
      expect(() => staged.activate(validate)).toThrow("Synthetic changed source");
    } else {
      const concurrent = fault === "interleaved" ? stageLocalInvocation(f.context, f.invocation) : null;
      staged.activate(() => {});
      if (concurrent) expect(concurrent.activate(() => {})).toEqual(staged.reference);
      if (fault === "current-casing") f.context.identity = { ...f.context.identity,
        repository: f.context.identity.repository.toUpperCase(), actor: f.context.identity.actor.toUpperCase() };
      const path = join(f.cache, staged.reference.path);
      if (fault === "changed") writeFileSync(path, "Changed original invocation record\n");
      if (["foreign", "component", "scope", "unadopted", "fields", "legacy-casing"].includes(fault)) {
        const record = JSON.parse(readFileSync(path, "utf8"));
        if (fault === "legacy-casing") { record.identity.repository = record.identity.repository.toUpperCase(); record.identity.actor = record.identity.actor.toUpperCase(); }
        if (fault === "foreign") record.identity.actor_id++;
        if (fault === "component") record.invocation.component_sha256 = "f".repeat(64);
        if (fault === "scope") record.invocation.scope_sha256 = "f".repeat(64);
        if (fault === "unadopted") record.invocation.source_commit = f.candidate;
        if (fault === "fields") record.extra = true;
        const { invocation_sha256: _digest, ...original } = record.invocation;
        record.invocation.invocation_sha256 = canonicalDigest(original);
        const bytes = canonicalJSON(record), name = path.replace(/[a-f0-9]{64}(?=\.json$)/u, sha256(bytes));
        renameSync(path, path + ".original"); writeFileSync(name, bytes, { mode: 0o600 });
      }
      if (fault === "symlink") { renameSync(path, path + ".target"); symlinkSync(path + ".target", path); }
      if (fault === "hardlink") linkSync(path, path + ".linked");
      if (fault === "directory") chmodSync(dirname(path), 0o755);
    }
    const result = readLocalInvocationRegistry(f.context);
    expect(result.invocations, JSON.stringify(result.diagnostics)).toEqual(["matching", "interleaved", "current-casing", "legacy-casing"].includes(fault) ? [f.invocation] : []);
    if (fault === "matching") {
      const again = stageLocalInvocation(f.context, f.invocation);
      expect(again.activate(() => {})).toEqual(staged.reference);
      expect(readdirSync(dirname(join(f.cache, staged.reference.path))).filter(name => name.endsWith(".json"))).toHaveLength(1);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);

test("oversized invocation metadata is refused before cache records are created", async () => {
  try {
    const { stageLocalInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/local-history");
    const f = fixture(), id = "x".repeat(f.context.settings.reports.max_entry_bytes);
    const { invocation_sha256: _digest, ...original } = f.invocation, changed = { ...original, id };
    expect(() => stageLocalInvocation({ ...f.context, run_id: id }, { ...changed, invocation_sha256: canonicalDigest(changed) }))
      .toThrow("Local invocation exceeds the retained bound");
    expect(readdirSync(f.cache)).toEqual([]);
  } catch (error) { failed = true; throw error; }
}, 90000);
