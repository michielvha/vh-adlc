import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectClosureInputs, recheckClosureInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-inputs";
import { buildResolution } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { canonicalDigest, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { settingsFixture } from "./settings-fixture";
import { resolutionFixture } from "./resolution-fixture";
import { commitAll, git, put } from "./repository-fixture";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function setup(method: "merge" | "squash" | "rebase" = "merge", advance = false) {
  const f = resolutionFixture(roots), draft = await buildResolution(f.options);
  if (!draft.complete || !draft.record_bytes || !draft.record) throw Error("missing resolution fixture");
  const recordBytes = draft.record_bytes, recordValue = draft.record;
  git(f.repo, "switch", "-qc", "docs-drift/consolidation");
  for (const change of draft.changes) {
    if (change.after_base64 === null) rmSync(join(f.repo, change.path));
    else writeFileSync(join(f.repo, change.path), Buffer.from(change.after_base64, "base64"));
  }
  mkdirSync(dirname(join(f.repo, draft.record_path)), { recursive: true });
  writeFileSync(join(f.repo, draft.record_path), draft.record_bytes);
  const head = commitAll(f.repo);
  git(f.repo, "switch", "-q", "main");
  if (advance) { put(f.repo, "outside.txt", "Disjoint advance\n"); commitAll(f.repo); }
  if (method === "merge") git(f.repo, "merge", "--no-ff", "-m", "Merge consolidation", head);
  else if (method === "squash") { git(f.repo, "merge", "--squash", head); commitAll(f.repo); }
  else git(f.repo, "cherry-pick", head);
  const merged = git(f.repo, "rev-parse", "HEAD");
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, merged, head);
  const original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const consolidation = { ...original, number: 20, state: "closed" as const, merged_at: "2026-11-07T00:00:00Z" as string | null,
    body: "Reviewed consolidation", draft: false, head_sha: head, head_ref: "docs-drift/consolidation", merge_commit_sha: merged };
  const state = { current: merged };
  const reader = { ...f.collection.reader, repository: () => structuredClone(repository),
    mergedPull: (number: number) => { if (number !== 20) throw Error("unselected merge"); return structuredClone(consolidation); },
    ref: (ref: string) => ({ ref, sha: state.current }) };
  const collection = { source_repo: f.repo, store: f.collection.store, settings: f.snapshot.settings, reader,
    consolidation_id: 20, required_inputs: [] };
  return { ...f, draft, recordBytes, recordValue, head, merged, state, consolidation, collection };
}

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
