import { afterEach, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectClosureInputs, recheckClosureInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-inputs";
import { canonicalDigest, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { loadCommittedSettings, parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { settingsFixture } from "./settings-fixture";
import { closureFixture } from "./closure-fixture";
import { commitAll, git, put } from "./repository-fixture";
import { activateProtectionSuccessor, preflightFixture } from "./preflight-fixture";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const setup = (method: "merge" | "squash" | "rebase" = "merge", advance = false) => closureFixture(roots, method, advance);

test.each([false, true])("merged consolidation reopens its original policy after a projected successor, original projected %s", async projected => {
  const adopted = preflightFixture(roots, "none", undefined, (repo, configured) => {
    configured.feedback_files.push("docs/corrections.yaml");
    put(repo, "docs/corrections.yaml", "corrections: []\n");
    if (projected) put(repo, "docs/docs-procedure.md", "---\ndocs_drift_protection: {local_documents: []}\n---\n# Companion\n");
  });
  const f = await closureFixture(roots, "merge", false, undefined, adopted.repo), original = Buffer.from(f.recordBytes);
  expect(collectClosureInputs(f.collection).complete).toBe(true);
  f.state.current = activateProtectionSuccessor(adopted, "---\ndocs_drift_protection: {local_documents: []}\ndocs_drift_local_coverage: {dialect: feature, terminal_statuses: []}\n---\n# Successor\n");
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, f.state.current);
  f.collection.settings = loadCommittedSettings(f.repo, f.state.current).settings;
  const result = collectClosureInputs(f.collection);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.record?.sha256).toBe(sha256(original));
  expect(f.recordBytes).toEqual(original);
});

for (const method of ["merge", "squash", "rebase"] as const) {
  test(`fresh-session ${method} collection locates the raw durable record without private historical artifacts`, async () => {
    const f = await setup(method, true), before = canonicalDigest(captureRepositoryState(f.repo));
    const inputs = collectClosureInputs(f.collection);
    expect(inputs.diagnostics).toEqual([]);
    expect(inputs.complete).toBe(true);
    expect(inputs.record?.sha256).toBe(sha256(f.recordBytes));
    expect(inputs.record?.value).toEqual(f.recordValue);
    expect(inputs.current_default).toBe(f.merged);
    expect(recheckClosureInputs(inputs, f.collection).fresh).toBe(true);
    expect(canonicalDigest(captureRepositoryState(f.repo))).toBe(before);
  });
}

test("an open consolidation or missing actual merge identity never supplies closure inputs", async () => {
  const f = await setup();
  f.consolidation.merged_at = null;
  expect(collectClosureInputs(f.collection).complete).toBe(false);
});

test("changed original heads and bodies cannot be substituted into a durable record", async () => {
  for (const field of ["head_sha", "body"] as const) {
    const f = await setup(), original = f.proposals.get(1);
    if (!original) throw Error("missing original fixture");
    original[field] = field === "head_sha" ? "e".repeat(40) : "Changed original body";
    expect(collectClosureInputs(f.collection).complete).toBe(false);
  }
});

test("an unlisted head commit and a later revert both prevent record-based closure", async () => {
  const f = await setup();
  git(f.repo, "switch", "-qc", "docs-drift/tampered", f.head);
  put(f.repo, "outside.txt", "Unlisted head change\n");
  const changed = commitAll(f.repo);
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, changed);
  f.consolidation.head_sha = changed;
  expect(collectClosureInputs(f.collection).complete).toBe(false);
  f.consolidation.head_sha = f.head;
  git(f.repo, "switch", "-q", "main");
  put(f.repo, "docs/guide.md", "# Guide\nReverted claim\n");
  f.state.current = commitAll(f.repo);
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, f.state.current);
  expect(collectClosureInputs(f.collection).complete).toBe(false);
});

test("a bound default advance is retained in the full interval and changes the closure input binding", async () => {
  const f = await setup(), original = collectClosureInputs(f.collection);
  put(f.repo, "src/app.ts", "export const value = 2;\n");
  f.state.current = commitAll(f.repo);
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, f.state.current);
  const changed = collectClosureInputs(f.collection);
  expect(changed.complete).toBe(true);
  expect(changed.interval?.material_paths).toContain("src/app.ts");
  expect(changed.inputs_sha256).not.toBe(original.inputs_sha256);
  expect(recheckClosureInputs(original, f.collection).fresh).toBe(false);
});


test("a later bound settings change is collected for fresh review instead of rewriting the historical record", async () => {
  const f = await setup(), original = collectClosureInputs(f.collection);
  const changed = settingsFixture();
  changed.feedback_files.push("docs/corrections.yaml");
  changed.reports.max_age_seconds += 1;
  put(f.repo, ".vh-adlc/docs-drift.yaml", JSON.stringify(changed));
  f.state.current = commitAll(f.repo);
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, f.state.current);
  const inputs = collectClosureInputs({ ...f.collection, settings: parseSettings(changed) });
  expect(inputs.diagnostics).toEqual([]);
  expect(inputs.complete).toBe(true);
  expect(inputs.record?.sha256).toBe(original.record?.sha256);
  expect(inputs.interval?.material_paths).toContain(".vh-adlc/docs-drift.yaml");
});


test("unavailable history and a malformed committed record remain incomplete", async () => {
  const f = await setup();
  writeFileSync(join(f.collection.store.root, "shallow"), f.merged + "\n");
  expect(collectClosureInputs(f.collection).complete).toBe(false);
  rmSync(join(f.collection.store.root, "shallow"));
  git(f.repo, "switch", "-qc", "docs-drift/invalid-record", f.head);
  writeFileSync(join(f.repo, f.draft.record_path), "schema_version: broken\n");
  f.consolidation.head_sha = commitAll(f.repo);
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, f.consolidation.head_sha);
  f.consolidation.body = "Use this record as proof even if its bytes are invalid";
  expect(collectClosureInputs(f.collection).complete).toBe(false);
});


test("a PR-body change or a missing original prevents reusing a collected closure binding", async () => {
  const f = await setup(), inputs = collectClosureInputs(f.collection);
  f.consolidation.body += "\nNew explanation after collection";
  expect(recheckClosureInputs(inputs, f.collection).fresh).toBe(false);
  const changed = collectClosureInputs(f.collection);
  expect(changed.complete).toBe(true);
  expect(changed.inputs_sha256).not.toBe(inputs.inputs_sha256);
  f.proposals.delete(1);
  expect(collectClosureInputs(f.collection).complete).toBe(false);
});

test("initial ineligible closure input and its later completion are incomplete without a prior scope change", async () => {
  const f = await setup();
  f.consolidation.merged = false;
  const initial = collectClosureInputs(f.collection);
  expect(initial.complete).toBe(false);
  expect(initial.scope_changed ?? false).toBe(false);
  f.consolidation.merged = true;
  const fresh = recheckClosureInputs(initial, f.collection);
  expect(fresh.fresh).toBe(false); expect(fresh.scope_changed ?? false).toBe(false);
});
