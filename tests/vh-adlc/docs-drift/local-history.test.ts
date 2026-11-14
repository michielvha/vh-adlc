/** Owned Git and observed-shaped invocation metadata fixtures, without model or hosted acceptance. */
import { afterAll, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { chmodSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { source, portableRecord, deliverRecord, runtimeIdentity, pin, write, commit } from "./adoption-fixture";
import { canonicalDigest, canonicalJSON, compareUTF8, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { buildReport } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import { collectLocalHistory, createLocalEnvelope } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { captureRepositoryState, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit, writeMetadataObject } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import type { OwnedInvocation } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned local-history metadata roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function withDirectoryOrder<T>(root: string, compare: (left: string, right: string) => number, run: () => T): T {
  const open = fs.opendirSync;
  let opened = 0;
  const ordered = spyOn(fs, "opendirSync").mockImplementation((...args: Parameters<typeof fs.opendirSync>) => {
    const directory = open(...args);
    if (String(args[0]) === root) {
      opened++;
      const entries = fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => compare(left.name, right.name));
      directory.readSync = () => entries.shift() ?? null;
    }
    return directory;
  });
  try {
    const result = run();
    expect(opened).toBeGreaterThan(0);
    return result;
  } finally { ordered.mockRestore(); }
}
function fixture(expired = false, nonLocal = false) {
  const f = source(roots);
  f.configured.reports.interactive = "local-attestation"; f.configured.reports.local_history_roots = ["history"];
  if (nonLocal) { f.configured.reports.interactive = "none"; f.configured.reports.local_history_roots = []; }
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(f.configured));
  if (!nonLocal) f.candidate = commit(f.repo, "synthetic local history policy");
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
  // Defensive reader fixture: the source must independently adopt local history even if the caller context selects it.
  if (nonLocal) { context.settings.reports.interactive = "local-attestation"; context.settings.reports.local_history_roots = ["history"]; }
  return { ...f, cache, invocation, context };
}

test.each(["matching", "current-casing", "legacy-casing", "interleaved", "changed", "foreign", "component", "scope", "unadopted", "fields", "symlink", "hardlink", "directory", "expired", "non-ancestor", "at-start", "after-start", "non-local", "guard", "mutated-guard"])("local invocation records are private, source-bound and activated last: %s", async fault => {
  try {
    const { createLocalInvocationReader, stageLocalInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/local-history");
    const f = fixture(fault === "expired", fault === "non-local"), before = captureRepositoryState(f.repo);
    expect(createLocalInvocationReader(f.context).read(f.invocation)).toBeNull();
    if (fault === "mutated-guard") f.context.recheck = () => { throw Error("Synthetic changed source"); };
    const staged = stageLocalInvocation(f.context, f.invocation);
    expect(createLocalInvocationReader(f.context).read(f.invocation)).toBeNull();
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
      if (["foreign", "component", "scope", "unadopted", "fields", "legacy-casing", "non-ancestor", "at-start", "after-start"].includes(fault)) {
        const record = JSON.parse(readFileSync(path, "utf8"));
        if (fault === "legacy-casing") { record.identity.repository = record.identity.repository.toUpperCase(); record.identity.actor = record.identity.actor.toUpperCase(); }
        if (fault === "foreign") record.identity.actor_id++;
        if (fault === "component") record.invocation.component_sha256 = "f".repeat(64);
        if (fault === "scope") record.invocation.scope_sha256 = "f".repeat(64);
        if (fault === "unadopted") record.invocation.source_commit = f.candidate;
        if (fault === "fields") record.extra = true;
        if (fault === "non-ancestor") {
          const tree = readGit(f.context.store.root, "rev-parse", f.context.current_default + "^{tree}").toString().trim();
          record.invocation.source_commit = writeMetadataObject(f.context.store.root, "commit", Buffer.from(
            "tree " + tree + "\nparent " + f.context.current_default
            + "\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nUnreachable sibling source\n"));
        }
        if (fault === "at-start" || fault === "after-start") record.invocation.completed_at =
          new Date(Date.parse(f.context.started_at) + (fault === "after-start" ? 1 : 0)).toISOString();
        const { invocation_sha256: _digest, ...original } = record.invocation;
        record.invocation.invocation_sha256 = canonicalDigest(original);
        f.invocation = record.invocation;
        const bytes = canonicalJSON(record), name = fault === "legacy-casing"
          ? join(dirname(dirname(path)), new Date(f.invocation.completed_at).toISOString().replaceAll(/[-:.]/gu, "") + "-" + sha256(bytes) + ".json")
          : join(dirname(path), f.invocation.invocation_sha256 + ".json");
        renameSync(path, path + ".original"); writeFileSync(name, bytes, { mode: 0o600 });
      }
      if (fault === "symlink") { renameSync(path, path + ".target"); symlinkSync(path + ".target", path); }
      if (fault === "hardlink") linkSync(path, path + ".linked");
      if (fault === "directory") chmodSync(dirname(path), 0o755);
    }
    const result = createLocalInvocationReader(f.context);
    const eligible = ["matching", "interleaved", "current-casing", "legacy-casing"].includes(fault);
    expect(result.read(f.invocation), JSON.stringify(result.diagnostics)).toEqual(eligible ? f.invocation : null);
    if (!eligible) expect(result.diagnostics).toHaveLength(1);
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

test.each(["current", "legacy"])("newer unsaved records cannot displace the saved report: %s", async layout => {
  try {
    const { createLocalInvocationReader, stageLocalInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/local-history");
    const f = fixture(), settings = f.context.settings;
    f.context.started_at = new Date(Date.now() + 1000).toISOString();
    settings.reports.max_runs = 2;
    const attention = [{ repository: settings.repository, scope_sha256: f.context.scope_sha256, identity: "claims:guide",
      disposition: "unknown" as const, reason: "Source verification pending", owner_action: "Choose the behavior",
      rule: { detector: "claims" }, inputs: { guide: sha256(Buffer.from("guide")) }, required_inputs: ["guide"],
      title: "Behavior decision", links: [] }];
    const savedReport = buildReport({ repository: settings.repository, scope_sha256: f.context.scope_sha256,
      run_id: f.invocation.id, source_commit: f.invocation.source_commit,
      started_at: new Date(Date.parse(f.invocation.completed_at) - 1000).toISOString(), completed_at: f.invocation.completed_at,
      collection_complete: true, failures: [], attention, corrections: [], proposals: [], published: [],
      history: { captured_at: new Date(Date.parse(f.invocation.completed_at) - 2000).toISOString(), records: [], diagnostics: [] } });
    const bytes = canonicalJSON(savedReport);
    const { invocation_sha256: _digest, ...original } = f.invocation;
    const saved = { ...original, report_sha256: sha256(bytes) }, invocation = { ...saved, invocation_sha256: canonicalDigest(saved) };
    function register(value: OwnedInvocation) {
      const staged = stageLocalInvocation({ ...f.context, run_id: value.id }, value); staged.activate(() => {});
      const path = join(f.cache, staged.reference.path), root = dirname(path);
      if (layout === "legacy") {
        const name = new Date(value.completed_at).toISOString().replaceAll(/[-:.]/gu, "") + "-" + staged.reference.sha256 + ".json";
        renameSync(path, join(dirname(root), name));
      }
      return staged.reference;
    }
    const originalReference = register(invocation), registryRoot = dirname(dirname(join(f.cache, originalReference.path)));
    const pair = join(f.repo, "history", "saved"); mkdirSync(pair, { recursive: true, mode: 0o700 });
    writeFileSync(join(pair, "report.json"), bytes, { mode: 0o600 });
    writeFileSync(join(pair, "provenance.json"), createLocalEnvelope(bytes, invocation), { mode: 0o600 });
    const savedTime = new Date(invocation.completed_at);
    for (const name of ["report.json", "provenance.json"]) utimesSync(join(pair, name), savedTime, savedTime);
    for (let i = 0; i < settings.reports.max_runs + 3; i++) {
      const entry = { ...saved, id: "unsaved-" + i,
        completed_at: new Date(Date.parse(invocation.completed_at) + 1000 + i).toISOString() };
      register({ ...entry, invocation_sha256: canonicalDigest(entry) });
    }
    const recorded = createLocalInvocationReader(f.context);
    const collect = () => collectLocalHistory({ repo: f.repo, settings,
      context: { repository: settings.repository, scope_sha256: f.context.scope_sha256, run_id: "current", started_at: f.context.started_at },
      readInvocation: recorded.read });
    const descending = (left: string, right: string) => compareUTF8(right, left);
    const history = layout === "legacy" ? withDirectoryOrder(registryRoot, descending, collect) : collect();
    expect(history.records, JSON.stringify({ collection: history.diagnostics, registry: recorded.diagnostics })).toHaveLength(1);
    expect(history.records[0]?.sha256).toBe(sha256(bytes));
    const current = buildReport({ repository: settings.repository, scope_sha256: f.context.scope_sha256,
      run_id: "current", source_commit: f.invocation.source_commit, started_at: f.context.started_at,
      completed_at: new Date(Date.parse(f.context.started_at) + 1000).toISOString(), collection_complete: true,
      failures: [], attention, corrections: [], proposals: [], published: [], history });
    expect(current.outcome).toBe("carried-attention");
    expect(current.success).toBe(true);
    // The one collection window also caps saved pairs, independently of registry size.
    for (const name of ["z-newer-1", "z-newer-2"]) {
      const laterBytes = canonicalJSON({ ...savedReport, run_id: name });
      const later = { ...saved, id: name, report_sha256: sha256(laterBytes) };
      const laterInvocation = { ...later, invocation_sha256: canonicalDigest(later) };
      register(laterInvocation);
      const directory = join(f.repo, "history", name); mkdirSync(directory, { mode: 0o700 });
      writeFileSync(join(directory, "report.json"), laterBytes, { mode: 0o600 });
      writeFileSync(join(directory, "provenance.json"), createLocalEnvelope(laterBytes, laterInvocation), { mode: 0o600 });
      for (const file of ["report.json", "provenance.json"]) utimesSync(join(directory, file), savedTime, savedTime);
    }
    const inspected: string[] = [];
    const collectBounded = () => collectLocalHistory({ repo: f.repo, settings,
      context: { repository: settings.repository, scope_sha256: f.context.scope_sha256, run_id: "current", started_at: f.context.started_at },
      readInvocation: wanted => { inspected.push(wanted.id); return recorded.read(wanted); } });
    const bounded = layout === "legacy" ? withDirectoryOrder(registryRoot, descending, collectBounded) : collectBounded();
    expect(bounded.records).toHaveLength(settings.reports.max_runs);
    expect(bounded.diagnostics).toEqual([]);
    expect(inspected).toEqual(["z-newer-2", "z-newer-1"]);
  } catch (error) { failed = true; throw error; }
}, 90000);

test.each(["foreign", "fields", "schema", "kind", "invocation", "digest", "noncanonical", "bound", "symlink", "hardlink"])("legacy invocation records require exact original metadata: %s", async fault => {
  try {
    const { createLocalInvocationReader, stageLocalInvocation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/local-history");
    const f = fixture(), before = captureRepositoryState(f.repo);
    const staged = stageLocalInvocation(f.context, f.invocation); staged.activate(() => {});
    const path = join(f.cache, staged.reference.path), root = dirname(dirname(path));
    renameSync(path, path + ".original");
    const record: Record<string, unknown> = { schema_version: 1, kind: "docs-drift-local-invocation",
      identity: { hostname: f.context.settings.hostname, ...f.context.identity }, invocation: f.invocation };
    if (fault === "foreign") record.identity = { hostname: f.context.settings.hostname, ...f.context.identity, actor_id: f.context.identity.actor_id + 1 };
    if (fault === "fields") record.extra = true;
    if (fault === "schema") record.schema_version = 2;
    if (fault === "kind") record.kind = "foreign-invocation";
    if (fault === "invocation") {
      const { invocation_sha256: _digest, ...original } = f.invocation, other = { ...original, id: "same-millisecond-other" };
      record.invocation = { ...other, invocation_sha256: canonicalDigest(other) };
    }
    const prefix = new Date(f.invocation.completed_at).toISOString().replaceAll(/[-:.]/gu, "") + "-";
    const bytes = fault === "noncanonical" ? Buffer.concat([canonicalJSON(record), Buffer.from(" ")]) : canonicalJSON(record);
    if (fault === "bound") f.context.settings.reports.max_entry_bytes = bytes.length - 1;
    const digest = fault === "digest" ? sha256(Buffer.from("different metadata")) : sha256(bytes);
    const legacy = join(root, prefix + digest + ".json");
    writeFileSync(legacy, bytes, { mode: 0o600 });
    if (fault === "symlink") { renameSync(legacy, legacy + ".target"); symlinkSync(legacy + ".target", legacy); }
    if (fault === "hardlink") linkSync(legacy, legacy + ".linked");
    const refused = createLocalInvocationReader(f.context);
    expect(refused.read(f.invocation)).toBeNull();
    expect(refused.diagnostics).toHaveLength(1);
    if (fault === "bound") {
      f.context.settings.reports.max_entry_bytes = bytes.length;
      const atLimit = createLocalInvocationReader(f.context);
      expect(atLimit.read(f.invocation)).toEqual(f.invocation);
      expect(atLimit.diagnostics).toEqual([]);
    }
    if (fault === "invocation") {
      // Both files share the timestamp. The wrong invocation must be skipped without hiding the requested record.
      const wanted = canonicalJSON({ ...record, invocation: f.invocation });
      writeFileSync(join(root, prefix + sha256(wanted) + ".json"), wanted, { mode: 0o600 });
      const matched = createLocalInvocationReader(f.context);
      const wrongFirst = (left: string, right: string) => {
        if (left === basename(legacy)) return -1;
        if (right === basename(legacy)) return 1;
        return compareUTF8(left, right);
      };
      expect(withDirectoryOrder(root, wrongFirst, () => matched.read(f.invocation))).toEqual(f.invocation);
      expect(matched.diagnostics).toEqual([]);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);
