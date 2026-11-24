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
import { settingsFixture, installedSettingsFixture } from "./settings-fixture";
import type { WorkflowRunInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { preflightFixture } from "./preflight-fixture";
import { createRunDirectory, createRunArtifactWriter, appendRunStage, readRunDirectory } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { runPublication } from "../../../plugins/vh-adlc/scripts/docs-drift/run-publication";
import { runClosure } from "../../../plugins/vh-adlc/scripts/docs-drift/run-closure";

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


test.each(["publish", "close"])("normal hosted %s refuses missing Actions selectors before publication inputs", async command => {
  const f = preflightFixture(roots), directory = join(f.root, "hosted-entry"), origins = join(f.root, "entry-origins");
  const location = { repo: f.repo, directory, origins };
  let run = createRunDirectory({ ...location, source: f.head(), entry: "hosted", mode: command === "close" ? "close" : "audit",
    proposals: command === "close" ? [501] : [] });
  if (command === "close") {
    const retain = createRunArtifactWriter(run, f.afterSettings.reports.max_entry_bytes);
    appendRunStage(run, { command: "close", state: "pending", artifacts: { closure_review: retain("closure-review", canonicalJSON({ fixture: true })) } });
    run = readRunDirectory(location);
  }
  const keys = ["GITHUB_ACTIONS", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GH_TOKEN"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.GH_TOKEN = "synthetic-no-network-token";
    const operation = command === "close" ? runClosure : runPublication;
    await expect(operation({ repo: f.repo, run })).rejects.toThrow("Hosted production requires GitHub Actions run selectors");
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});


test("hosted run attribution checks every native execution binding", async () => {
  const { selectHostedExecutor, readHostedExecutor } = await import("../../../plugins/vh-adlc/scripts/docs-drift/hosted-executor");
  const environment = { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "501", GITHUB_RUN_ATTEMPT: "2" };
  const executor = { run_id: 501, run_attempt: 2 };
  expect(selectHostedExecutor("hosted", environment)).toEqual(executor);
  for (const entry of ["interactive", "custom-job"]) {
    expect(selectHostedExecutor(entry, {})).toBeUndefined();
    expect(() => selectHostedExecutor(entry, environment)).toThrow("hosted profile");
  }
  for (const invalid of [{}, { ...environment, GITHUB_ACTIONS: undefined }, { ...environment, GITHUB_ACTIONS: "false" },
    ...["", "0", "-1", "1.5", "abc", String(Number.MAX_SAFE_INTEGER + 1)].flatMap(value =>
      [{ ...environment, GITHUB_RUN_ID: value }, { ...environment, GITHUB_RUN_ATTEMPT: value }])])
    expect(() => selectHostedExecutor("hosted", invalid)).toThrow("run selectors");
  const raw = installedSettingsFixture();
  const settings = parseSettings({ ...raw, reports: { ...raw.reports, workflow_id: 101 } }), source = "a".repeat(40);
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const run: WorkflowRunInput = { id: 501, run_attempt: 2, workflow_id: 101, path: settings.reports.workflow_path,
    event: "schedule", status: "in_progress", conclusion: null, head_sha: source, head_branch: "main",
    repository, head_repository: repository, created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:00:00Z" };
  const identity = { repository: "fixture/docs", repository_id: 10, default_branch: "main", actor: "fixture-bot", actor_id: 20 };
  const calls: number[][] = [];
  let observed = run;
  const options = { entry: "hosted", executor, settings, source, identity,
    reader: { run(id: number, attempt: number) { calls.push([id, attempt]); return observed; } } };
  for (const event of ["schedule", "workflow_dispatch"]) for (const suffix of ["", "@main", "@refs/heads/main", "@" + source]) {
    observed = { ...run, event, path: settings.reports.workflow_path + suffix };
    expect(readHostedExecutor(options)).toEqual(executor);
  }
  expect(calls.every(value => value[0] === 501 && value[1] === 2)).toBe(true);
  const invalidRuns: WorkflowRunInput[] = [
    { ...run, id: 502 }, { ...run, run_attempt: 3 }, { ...run, workflow_id: 102 }, { ...run, path: ".github/workflows/another.yml" },
    { ...run, event: "push" }, { ...run, status: "completed", conclusion: "success" }, { ...run, status: "queued" },
    { ...run, head_sha: "b".repeat(40) }, { ...run, head_branch: "other" }, { ...run, repository: { ...repository, id: 11 } },
    { ...run, repository: { ...repository, full_name: "foreign/docs" } }, { ...run, head_repository: null },
    { ...run, head_repository: { ...repository, id: 11 } }, { ...run, head_repository: { ...repository, full_name: "foreign/docs" } },
  ];
  for (const invalid of invalidRuns) { observed = invalid; expect(() => readHostedExecutor(options)).toThrow("native run"); }
  observed = run;
  expect(() => readHostedExecutor({ ...options, entry: "interactive" })).toThrow("hosted profile");
  expect(() => readHostedExecutor({ ...options, identity: { ...identity, repository_id: 11 } })).toThrow("native run");
  expect(() => readHostedExecutor({ ...options, settings: { ...settings, reports: { ...settings.reports, workflow_id: null } } })).toThrow("reports.workflow_id");
  expect(() => readHostedExecutor({ ...options, reader: { run() { throw Error("Synthetic unavailable native run"); } } })).toThrow("unavailable native run");
});
