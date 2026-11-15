import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { preflightFixture } from "./preflight-fixture";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { collectClosureInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-inputs";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["owner", "owner-casing", "wrong-id"])("ordinary post-merge collection verifies its original configured publisher: %s", fault => {
  const f = preflightFixture(roots), source = f.head(), settings = loadCommittedSettings(f.repo, source).settings;
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const proposal = { number: 501, state: "closed" as const, merged: true, merged_at: "2000-01-01T00:00:00Z", merge_commit_sha: source,
    body: "Synthetic merged proposal with no resolution record", draft: false, actor: fault === "owner-casing" ? "Fixture-Owner" : "fixture-owner",
    actor_id: fault === "wrong-id" ? 31 : 30, actor_type: "User", head_sha: source, head_ref: "docs-drift/owner-proposal",
    head_repository: repository, base_sha: source, base_ref: "main", base_repository: repository };
  const store = createOwnedObjectStore({ source_repo: f.repo, source_commit: source, parent: f.artifacts, evidence_directory: f.artifacts,
    repository: "fixture/docs", owner: "publisher-test", run: "source" });
  const reader = { repository: () => repository, mergedPull: () => structuredClone(proposal), pull: () => structuredClone(proposal),
    ref: () => ({ ref: "refs/heads/main", sha: source }), trace: () => [], comments: () => ({ complete: true, items: [], diagnostics: [], pages: 0 }) };
  const result = collectClosureInputs({ source_repo: f.repo, store, settings, reader, consolidation_id: 501, required_inputs: [] });
  expect(result.complete).toBe(false);
  expect(result.diagnostics.join("\n")).toContain(fault === "wrong-id" ? "actual merged consolidation identity" : "missing ambiguous or differently bound resolve record");
});
