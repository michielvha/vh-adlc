import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeIdentity } from "./adoption-fixture";
import { preflightFixture } from "./preflight-fixture";
import { put } from "./repository-fixture";
import { canonicalDigest, canonicalJSON, compareUTF8, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readAdoptionInput, readGit, writeMetadataObject } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import type { WorkflowRunInput } from "../../../plugins/vh-adlc/scripts/github-read";
import type { ProducerSource } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { collectActionsHistory } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { createGitHubReader, createRepositoryReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed history producer roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const base = preflightFixture(roots, "none", undefined, (repo, configured) => {
    configured.reports.workflow_id = 19;
    Object.assign(configured.execution, { scheduled_workflow: configured.reports.workflow_path, worker_workflow: ".github/workflows/docs-drift-worker.yml" });
    put(repo, configured.reports.workflow_path, JSON.stringify({ on: { schedule: [{ cron: "0 3 * * *" }] },
      jobs: { drift: { uses: "./.github/workflows/docs-drift-worker.yml" } } }));
    put(repo, ".github/workflows/docs-drift-worker.yml", JSON.stringify({ on: { workflow_call: null }, jobs: { report: {
      "runs-on": "ubuntu-latest", steps: ["collect", "review", "report", "upload", "attention"].map(id => ({ id: "docs-drift-" + id, name: "Drift " + id, run: "synthetic-only" })) } } }));
  });
  const f = { ...base, configured: base.afterSettings, candidate: base.checklist.candidate_commit }, current = f.head();
  const store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts, source_repo: f.repo,
    source_commit: current, repository: f.configured.repository, owner: "synthetic-history", run: "producer" });
  return { ...f, current, store };
}
function producerSource(repo: string, head: string, altered?: string): ProducerSource {
  const files = new Map<string, Buffer | null>();
  return { commit_sha: head, tree_sha: readGit(repo, "rev-parse", head + "^{tree}").toString().trim(),
    file(path) { const actual = readAdoptionInput(repo, head, path)?.bytes ?? null, value = path === altered ? Buffer.from("Changed native API blob") : actual;
      files.set(path, value); return value; },
    bindings() { return [...files].sort(([left], [right]) => compareUTF8(left, right)).map(([path, bytes]) => [path, bytes === null ? null : sha256(bytes)] as const); } };
}
// Bounded native-metadata shape only. Actual Actions listing/download remains a separate acceptance surface.
function run(head: string): WorkflowRunInput {
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  return { id: 101, run_attempt: 1, workflow_id: 19, path: ".github/workflows/docs-drift.yml", event: "schedule",
    head_branch: "main", head_sha: head, repository, head_repository: repository,
    status: "completed", conclusion: "success", created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:01:00Z" };
}

test.each(["matching", "changed-native-blob", "foreign-repository", "unadopted-source", "wrong-source"])("producer eligibility reopens adopted source and protected native blobs: %s", async fault => {
  try {
    const { createAdoptedProducerVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-producer");
    const f = fixture(), before = captureRepositoryState(f.repo), verify = createAdoptedProducerVerifier({ store: f.store,
      current_default: f.current, identity: runtimeIdentity });
    const head = fault === "unadopted-source" ? f.candidate : f.current;
    const original = producerSource(f.repo, head, fault === "changed-native-blob" ? ".github/workflows/docs-drift-worker.yml" : undefined), native = run(head);
    if (fault === "foreign-repository") native.repository = { ...native.repository, id: 11 };
    if (fault === "wrong-source") original.commit_sha = f.candidate;
    if (["changed-native-blob", "foreign-repository", "wrong-source"].includes(fault)) {
      expect(() => verify(original, native)).toThrow("incomplete docs-drift history producer");
    } else {
      const result = verify(original, native);
      if (fault === "unadopted-source") expect(result).toBe(null);
      else {
        expect(result?.source_commit).toBe(f.current); expect(result?.source_inputs_sha256).toBe(canonicalDigest(original.bindings()));
        expect(result?.job_name).toBe("drift / report"); expect(result?.attention_step).toBe("Drift attention");
        expect(result?.required_jobs).toEqual([{ name: "drift / report", steps: ["Drift collect", "Drift review", "Drift report", "Drift upload", "Drift attention"] }]);
      }
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
});

test.each(["shallow-history", "ancestry-command-failure"])("history collection is incomplete rather than skipping unavailable producer ancestry: %s", async fault => {
  try {
    const { createAdoptedProducerVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-producer");
    const f = fixture(), tree = readGit(f.store.root, "rev-parse", f.current + "^{tree}").toString().trim();
    const current = writeMetadataObject(f.store.root, "commit", Buffer.from(`tree ${tree}\nparent ${f.current}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nOwned later default\n`));
    const verify = createAdoptedProducerVerifier({ store: f.store, current_default: current, identity: runtimeIdentity }), native = run(f.current);
    expect(verify(producerSource(f.repo, f.current), native)?.source_commit).toBe(f.current);
    const before = captureRepositoryState(f.repo), empty = join(f.artifacts, "unused-api-bin"); mkdirSync(empty, { mode: 0o700 });
    let artifactReads = 0, callbackError: unknown;
    const reader = { ...createRepositoryReader(createGitHubReader("github.com", { inherit_env: false, env: { PATH: empty } }), "fixture/docs"),
      repository: () => ({ id: 10, full_name: "fixture/docs", default_branch: "main" }),
      workflow: () => ({ id: 19, path: f.configured.reports.workflow_path, state: "active" }),
      recentRuns: () => ({ items: [native], pages: 1, complete: true, diagnostics: [] }), run: () => native,
      commit: (sha: string) => ({ sha, tree_sha: readGit(f.store.root, "rev-parse", sha + "^{tree}").toString().trim(), parents: [], message: "Owned synthetic source" }),
      artifacts: () => { artifactReads++; throw Error("Artifact reads must not replace unavailable ancestry proof"); } };
    const oldPath = process.env.PATH;
    try {
      if (fault === "shallow-history") writeFileSync(join(f.store.root, "shallow"), current + "\n", { mode: 0o600 });
      else {
        const git = Bun.which("git"), bin = join(f.artifacts, "producer-git-fault"); if (!git) throw Error("Fixture Git unavailable");
        mkdirSync(bin, { mode: 0o700 }); writeFileSync(join(bin, "git"), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes("merge-base") && args.includes("--is-ancestor")) process.exit(2);
const result = Bun.spawnSync([${JSON.stringify(git)}, ...args], { env: process.env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);
`, { mode: 0o700 }); process.env.PATH = bin + ":" + oldPath;
      }
      const result = await collectActionsHistory({ repo: f.repo, artifact_root: f.artifacts, settings: parseSettings(f.configured), reader,
        context: { repository: "fixture/docs", scope_sha256: sha256(Buffer.from("synthetic history scope")), run_id: "102", started_at: "2000-01-02T00:00:00Z" },
        environment: { PATH: empty }, verifyProducer: (source, run) => {
          try { return verify(source, run); } catch (error) { callbackError = error; throw error; }
        } });
      expect(result.complete).toBe(false); expect(result.records).toEqual([]);
      expect(result.diagnostics).toContain("Earlier run 101 required native history inputs could not be verified");
      expect(callbackError).toBeInstanceOf(Error); expect((callbackError as Error).message).toContain("incomplete docs-drift history producer");
      expect(artifactReads).toBe(0);
    } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 90000);
