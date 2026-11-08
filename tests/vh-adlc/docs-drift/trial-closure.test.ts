import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { loadTrialContext } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { createTrialReader, collectTrialClosureInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-reader";
import { persistTrialTracker, readTrialTracker } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-tracker";
import { closureFixture } from "./closure-fixture";
import { git } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";
import { syntheticTrialFixture } from "./trial-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function rawPull(proposal: PullRequestInput, merged = false, mergeCommit: string | null = null): [string, Record<string, unknown>] {
  return ["pulls/" + proposal.number, { id: 1000 + proposal.number, number: proposal.number, title: "Synthetic proposal",
    state: proposal.state, merged, merged_at: proposal.merged_at, merge_commit_sha: mergeCommit,
    body: proposal.body, draft: proposal.draft, labels: [], user: { id: proposal.actor_id, login: proposal.actor, type: proposal.actor_type },
    head: { ref: proposal.head_ref, sha: proposal.head_sha, repo: proposal.head_repository },
    base: { ref: proposal.base_ref, sha: proposal.base_sha, repo: proposal.base_repository } }];
}

async function setup(method: "merge" | "squash" | "rebase") {
  const merged = await closureFixture(roots, method, true);
  const settings = settingsFixture(); settings.feedback_files = [...merged.snapshot.settings.feedback_files];
  const f = syntheticTrialFixture(roots, { seed: { repo: merged.repo, commit: merged.merged,
    objects: [merged.head, ...[...merged.proposals.values()].map(item => item.head_sha)], settings,
    resources: [rawPull(merged.consolidation, true, merged.merged), ...[...merged.proposals.values()].map(item => rawPull(item))] } });
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  return { merged, f, context };
}

test.each(["merge", "squash", "rebase"] as const)("installed closure collection reads actual %s objects and durable record", async method => {
  const { merged, f, context } = await setup(method);
  const refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"), tracker = readTrialTracker(context).commit;
  const result = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), "collect-closure",
    "--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--consolidation", "20"],
    { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(result.stdout.toString());
  expect(result.exitCode).toBe(0);
  expect(report.outcome).toBe("complete");
  expect(report.data.complete).toBe(true);
  expect(report.data.current_default).toBe(f.sourceCommit);
  expect(report.data.consolidation.merge_commit_sha).toBe(merged.merged);
  expect(report.data.record.sha256).toBe(merged.draft.record_sha256);
  expect(report.data.record.value).toEqual(merged.recordValue);
  expect(report.data.originals.map((item: PullRequestInput) => item.number)).toEqual([1]);
  expect(readTrialTracker(context).commit).toBe(tracker);
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 90000);

test.each(["open", "foreign-repository", "missing-head", "missing-original"] as const)("installed closure remains incomplete for %s without changing fixture state", async scenario => {
  const { f, context } = await setup("squash");
  expect((await collectTrialClosureInputs(context, 20)).complete).toBe(true);
  const state = readTrialTracker(context), consolidation = state.resources.get("pulls/20");
  if (!consolidation) throw Error("missing synthetic consolidation");
  if (scenario === "open") Object.assign(consolidation, { merged: false, state: "open", merged_at: null, merge_commit_sha: null });
  if (scenario === "foreign-repository") (consolidation.head as { repo: unknown }).repo = { id: 99, full_name: "foreign/consumer" };
  if (scenario === "missing-head") (consolidation.head as { sha: string }).sha = "f".repeat(40);
  if (scenario === "missing-original") state.resources.delete("pulls/1");
  persistTrialTracker(context, state);
  const reader = createTrialReader(context);
  if (scenario === "open") expect(reader.mergedPull(20).merged).toBe(false);
  if (scenario === "foreign-repository") expect(reader.mergedPull(20).head_repository?.full_name).toBe("foreign/consumer");
  if (scenario === "missing-head") {
    expect(reader.mergedPull(20).head_sha).toBe("f".repeat(40));
    expect(() => git(f.origin, "cat-file", "-e", "f".repeat(40))).toThrow();
  }
  if (scenario === "missing-original") expect(() => reader.pull(1)).toThrow("GitHub GET unavailable (404)");
  const refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"), tracker = readTrialTracker(context).commit;
  const result = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), "collect-closure",
    "--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--consolidation", "20"],
    { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(result.stdout.toString());
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.data).toEqual({ complete: false, diagnostics: ["Fixed-object synthetic closure fetch unavailable or inputs changed"] });
  expect(readTrialTracker(context).commit).toBe(tracker);
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 90000);
