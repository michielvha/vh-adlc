/** Seeded metadata and owned Git/API observations only. These fixtures establish no model execution or actual publication history. */
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectNativeRetained, observePendingLease } from "../../../plugins/vh-adlc/scripts/docs-drift/retained-controller";
import { readNativeContext } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { sealPlan, writePlanObject } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { writeMetadataObject } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { fixture, bindings, hash } from "./manifest-fixture";
import { installOwnedNativeService } from "./original-publication-fixture";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
let preserveFailure = false;
afterAll(() => {
  if (preserveFailure) console.error("Preserved seeded native observation fixtures", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function seeded(limit = 524288, deep = false, foreign: false | "schema" | "layout" = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-native-observations-"))); roots.push(root);
  let base = root;
  if (deep) while (base.length < 1700) { base = join(base, "p".repeat(100)); mkdirSync(base, { mode: 0o700 }); }
  const repo = join(base, "source"), origin = join(base, "origin"), artifacts = join(base, "artifacts"), metadata = join(base, "seed-metadata");
  for (const path of [repo, artifacts, metadata]) mkdirSync(path, { mode: 0o700 });
  populateRepository(repo);
  const settings = settingsFixture(); settings.reports.max_entry_bytes = limit;
  put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
  const source = commitAll(repo), operation = "seeded-native";
  git(root, "clone", "--bare", "--no-local", repo, origin);
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + operation } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/seeded", head: source } },
    { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ];
  const review = fixture({ ...bindings, source_commit: source, candidate_commit: source,
    candidate_tree: git(repo, "rev-parse", source + "^{tree}"), settings_sha256: sha256(canonicalJSON(settings)) }, effects, operation);
  const plan = sealPlan({ reviewed: validateReviewedManifest(review), grants: review.grants, adoption_sha256: hash("seeded unavailable approval"),
    context: "production", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  expect(canonicalJSON(plan).length).toBeLessThan(limit);
  const store = createOwnedObjectStore({ source_repo: repo, source_commit: source, parent: metadata, evidence_directory: metadata,
    repository: settings.repository, owner: "fixture-owner", run: "seed" });
  const objects = writePlanObject(store, plan);
  git(origin, "fetch", "--no-tags", "--no-write-fetch-head", store.root, objects.object);
  git(origin, "update-ref", settings.publication.receipt_ref_prefix + operation, objects.object);
  git(origin, "update-ref", "refs/heads/docs-drift/seeded", source);
  if (foreign) {
    const blob = writeMetadataObject(store.root, "blob", canonicalJSON({ schema_version: 99, kind: "future-foreign-lease" }));
    const entries = foreign === "layout" ? [Buffer.from("100644 note.txt\0"), Buffer.from(blob, "hex"), Buffer.from("100644 plan.json\0"), Buffer.from(blob, "hex")]
      : [Buffer.from("100644 plan.json\0"), Buffer.from(blob, "hex")];
    const tree = writeMetadataObject(store.root, "tree", Buffer.concat(entries));
    const object = writeMetadataObject(store.root, "commit", Buffer.from(`tree ${tree}\nauthor Fixture <fixture@example.invalid> 0 +0000\ncommitter Fixture <fixture@example.invalid> 0 +0000\n\nForeign lease\n`));
    git(origin, "fetch", "--no-tags", "--no-write-fetch-head", store.root, object);
    git(origin, "update-ref", settings.publication.lease_ref, object);
  }
  const service = installOwnedNativeService({ root, origin, source, head: source });
  return { repo, source, origin, artifacts, operation, objects, plan, settings, service, options: { repo, source, artifact_root: artifacts, operation_id: operation,
    owner: "fixture-owner", run: "observe", credential: "synthetic-read-token", path: join(root, "native-bin") + ":" + process.env.PATH, restore: true as const } };
}

test.each(["matching", "receipt-absent", "foreign-repository", "receipt-forbidden"])("a pending lease retains available plan and receipt observations: %s", mode => {
  try {
    const f = seeded(), lease = f.settings.publication.lease_ref;
    const receipt = f.settings.publication.receipt_ref_prefix + f.operation;
    git(f.origin, "update-ref", lease, f.objects.object);
    if (mode === "receipt-absent") git(f.origin, "update-ref", "-d", receipt, f.objects.object);
    if (mode === "receipt-forbidden") {
      const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
      state.ref_status = 403; state.ref_status_ref = receipt;
      writeFileSync(f.service.statePath, JSON.stringify(state));
    }
    const before = git(f.origin, "for-each-ref"), native = readFileSync(f.service.statePath);
    const context = readNativeContext({ hostname: f.settings.hostname, repository: f.settings.repository,
      credential: f.options.credential, path: f.options.path });
    const result = observePendingLease(context.repository, parseSettings(f.settings), mode === "foreign-repository" ? 999 : context.identity.repository_id);
    expect(result).toMatchObject({ authority: "none", replay_authority: false,
      observed_refs: { lease: { ref: lease, object: f.objects.object } } });
    if (mode === "foreign-repository") {
      expect(result?.operation_id).toBeNull(); expect(result?.observed_refs.receipt).toBeNull();
      expect(result?.diagnostics.join("\n")).toContain("another repository");
    } else {
      expect(result?.operation_id).toBe(f.operation); expect(result?.plan_sha256).toBe(f.objects.plan_sha256);
      if (mode === "receipt-forbidden") {
        expect(result?.observed_refs.receipt).toBeNull(); expect(result?.diagnostics).toHaveLength(2);
      } else expect(result?.observed_refs.receipt).toEqual({ ref: receipt, object: mode === "receipt-absent" ? null : f.objects.object });
    }
    expect(git(f.origin, "for-each-ref")).toBe(before); expect(readFileSync(f.service.statePath)).toEqual(native);
  } catch (error) { preserveFailure = true; throw error; }
}, 120000);

test.each(["schema", "layout"] as const)("native retained recovery compares foreign metadata without parsing or cleaning it: %s", async mode => {
  try {
    const f = seeded(undefined, false, mode), refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)");
    const report = await collectNativeRetained(f.options);
    expect(report.retained_operation.state, JSON.stringify(report.diagnostics)).toBe("complete");
    expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
  } catch (error) { preserveFailure = true; throw error; }
}, 120000);

test("native restore labels its observations as the earlier inspection snapshot", async () => {
  try {
    const f = seeded(), report = await collectNativeRetained(f.options);
    expect(report.retained_operation.state).toBe("complete");
    expect(report.retained_operation).toHaveProperty("inspection_observations");
    expect(report.retained_operation).toHaveProperty("inspection_observation_count", 4);
    expect(report.retained_operation).not.toHaveProperty("observations");
  } catch (error) { preserveFailure = true; throw error; }
}, 120000);

test("committed native report bounds omit details and refuse an unretainable journal locator", async () => {
  try {
    const probe = seeded(undefined, true), full = await collectNativeRetained(probe.options);
    expect(full.retained_operation.state).toBe("complete");
    const fullSize = Buffer.byteLength(JSON.stringify(full) + "\n"), limit = fullSize - 1;
    const omitted = seeded(limit, true), bounded = await collectNativeRetained(omitted.options);
    expect(bounded.retained_operation.details_omitted).toBe(true);
    expect(bounded.retained_operation).toMatchObject({ state: "complete", plan_sha256: omitted.objects.plan_sha256,
      journal_directory: join(omitted.artifacts, "docs-drift-" + omitted.operation) });
    expect(Buffer.byteLength(JSON.stringify(bounded) + "\n")).toBeLessThanOrEqual(limit);
    const tooSmall = seeded(canonicalJSON(probe.plan).length + 128, true);
    await expect(collectNativeRetained(tooSmall.options)).rejects.toThrow("Configured output bound cannot retain the native observation summary and journal reference");
    expect(readdirSync(tooSmall.artifacts)).not.toContain("docs-drift-" + tooSmall.operation);
  } catch (error) { preserveFailure = true; throw error; }
}, 240000);
