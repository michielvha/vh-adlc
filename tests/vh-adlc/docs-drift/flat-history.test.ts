import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { preflightFixture } from "./preflight-fixture";
import { put } from "./repository-fixture";
import { createAdoptedProducerVerifier } from "../../../plugins/vh-adlc/scripts/docs-drift/history-producer";
import { createLocalInvocationReader, stageLocalInvocation } from "../../../plugins/vh-adlc/scripts/docs-drift/local-history";
import { readAdoptionInput, readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalDigest, canonicalJSON, compareUTF8, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import type { WorkflowRunInput } from "../../../plugins/vh-adlc/scripts/github-read";
import type { ProducerSource, OwnedInvocation } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const workflow = ".github/workflows/docs-drift.yml", worker = ".github/workflows/docs-drift-worker.yml";
const reader = { repository: "fixture/docs", repository_id: 10, actor: "fixture-owner", actor_id: 30, default_branch: "main" };

function fixture(manual = false) {
  const f = preflightFixture(roots, "none", undefined, (repo, settings) => {
    Object.assign(settings.execution, { scheduled_workflow: workflow, worker_workflow: worker, claude_command: ".claude/commands/docs-drift.md" });
    settings.reports.interactive = "local-attestation"; settings.reports.local_history_roots = ["history"];
    put(repo, workflow, canonicalJSON({ on: { schedule: [{ cron: "0 9 * * 1" }], ...(manual ? { workflow_dispatch: null } : {}) }, jobs: { drift: { uses: "./" + worker } } }).toString());
    put(repo, worker, canonicalJSON({ on: { workflow_call: null }, jobs: { report: { "runs-on": "ubuntu-latest",
      steps: ["collect", "review", "report", "upload", "attention"].map(id => ({ id: "docs-drift-" + id, name: "Drift " + id, run: "synthetic-only" })) } } }).toString());
    put(repo, ".claude/commands/docs-drift.md", "Synthetic command\n");
  });
  const current = f.head(), store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts,
    source_repo: f.repo, source_commit: current, repository: "fixture/docs", owner: "flat-history", run: "source" });
  return { ...f, current, store };
}

function source(repo: string, head: string, changed = false): ProducerSource {
  const files = new Map<string, Buffer | null>();
  return { commit_sha: head, tree_sha: readGit(repo, "rev-parse", head + "^{tree}").toString().trim(),
    file(path) { const bytes = changed && path === worker ? Buffer.from("Changed native source") : readAdoptionInput(repo, head, path)?.bytes ?? null;
      files.set(path, bytes); return bytes; },
    bindings() { return [...files].sort(([left], [right]) => compareUTF8(left, right))
      .map(([path, bytes]) => [path, bytes === null ? null : sha256(bytes)] as const); } };
}

test.each(["matching", "manual-dispatch", "changed-native-blob", "foreign-repository", "wrong-workflow", "wrong-event", "staged-source"])("flat scheduled history verifies its original source and native workflow: %s", fault => {
  const f = fixture(fault === "manual-dispatch"), head = fault === "staged-source" ? f.candidate : f.current;
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const run: WorkflowRunInput = { id: 101, run_attempt: 1, workflow_id: 100, path: workflow, event: "schedule",
    head_branch: "main", head_sha: head, repository, head_repository: repository,
    status: "completed", conclusion: "success", created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:01:00Z" };
  if (fault === "foreign-repository") run.repository = { ...repository, id: 11 };
  if (fault === "wrong-workflow") run.workflow_id++;
  if (fault === "wrong-event" || fault === "manual-dispatch") run.event = "workflow_dispatch";
  const verify = createAdoptedProducerVerifier({ store: f.store, current_default: f.current, identity: reader, entry: "interactive" });
  if (fault === "matching" || fault === "manual-dispatch") {
    const result = verify(source(f.repo, head), run);
    expect(result?.source_commit).toBe(head); expect(result?.component_sha256).toBe(f.component.component_sha256);
    expect(result?.job_name).toBe("drift / report");
  } else if (fault === "staged-source") expect(verify(source(f.repo, head), run)).toBeNull();
  else expect(() => verify(source(f.repo, head, fault === "changed-native-blob"), run)).toThrow("history producer");
});

test.each(["matching", "native-casing", "foreign-account", "changed-component"])("flat local history reopens the original checklist: %s", fault => {
  const f = fixture(), cache = join(f.root, "local-history"); mkdirSync(cache, { mode: 0o700 });
  const payload = { origin: "local-attestation" as const, context: "production" as const, repository: "fixture/docs", id: "earlier-run",
    source_commit: f.current, component_sha256: f.component.component_sha256,
    request_sha256: sha256(Buffer.from("request")), scope_sha256: sha256(Buffer.from("scope")), report_sha256: sha256(Buffer.from("report")),
    completed_at: new Date(Date.now() - 10000).toISOString() };
  const invocation: OwnedInvocation = { ...payload, invocation_sha256: canonicalDigest(payload) };
  if (fault === "changed-component") {
    payload.component_sha256 = "f".repeat(64);
    Object.assign(invocation, payload, { invocation_sha256: canonicalDigest(payload) });
  }
  const context = { repo: f.repo, cache_directory: cache, settings: loadCommittedSettings(f.repo, f.current).settings,
    identity: { ...reader, ...(fault === "native-casing" ? { actor: "Fixture-Owner" } : {}), ...(fault === "foreign-account" ? { actor_id: 31 } : {}) },
    store: f.store, current_default: f.current, source: f.current, entry: "interactive",
    component_sha256: payload.component_sha256, run_id: payload.id, scope_sha256: payload.scope_sha256,
    started_at: new Date().toISOString(), recheck: () => {} };
  const staged = stageLocalInvocation(context, invocation); staged.activate(() => {});
  const history = createLocalInvocationReader(context);
  const read = history.read(invocation);
  if (fault === "matching" || fault === "native-casing") expect(read, history.diagnostics.join("\n")).toEqual(invocation);
  else expect(read).toBeNull();
});
