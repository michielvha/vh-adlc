/** Full original-diff collection and native resolution preparation through the public entry. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";
import { auditClient } from "./native-audit-client-fixture";
import { installOwnedNativeService } from "./original-publication-fixture";
import { git, put } from "./repository-fixture";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readRunDirectory } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { readBoundArtifact } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";

const roots: string[] = [];
let passed = false;
afterAll(() => {
  if (!passed) console.error("Preserved failed normal resolution fixtures", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("normal resolve accounts for the complete original hunk and retains its consolidation record", async () => {
  const closeReplyFault = process.env.VH_ADLC_TEST_CLOSE_REPLY_FAULT === "1";
  const component = ordinaryComponentFixture(roots, true), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable });
  writeFileSync(component.executable, auditClient("prepare", true), { mode: 0o755 });
  const source = f.head(), origin = join(f.root, "origin.git"), directory = join(f.root, "run"), stateRoot = join(f.root, "state");
  git(f.repo, "switch", "-c", "docs-drift/original"); put(f.repo, "docs/guide.md", "# Corrected guide\n");
  git(f.repo, "add", "docs/guide.md"); git(f.repo, "commit", "-m", "Synthetic original correction");
  const original = git(f.repo, "rev-parse", "HEAD"); git(f.repo, "switch", "main");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  git(origin, "update-ref", "refs/pull/1/head", original);
  const service = installOwnedNativeService({ root: f.root, origin, source, head: original, publisher_identity: { actor: "fixture-owner", actor_id: 30 } });
  const state = JSON.parse(readFileSync(service.statePath, "utf8")), repository = state.repository_identity;
  state.prs = [{ ...(closeReplyFault ? {} : { id: 101 }), number: 1, state: "open", merged_at: null, title: "Original correction", body: "Original whole change", draft: true, labels: [],
    user: { login: "fixture-bot", id: 20, type: "Bot" }, base: { ref: "main", sha: source, repo: repository },
    head: { ref: "docs-drift/original", sha: original, repo: repository } }];
  writeFileSync(service.statePath, JSON.stringify(state));
  const before = captureRepositoryState(f.repo), nativeBefore = readFileSync(service.statePath);
  let selectedDirectory = directory, closeSource = source;
  async function invoke(command: string) {
    const result = await executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
      "--repo", f.repo, "--run-dir", selectedDirectory, ...(command === "resolve" ? ["--source", source, "--proposal", "1"] : []),
      ...(command === "close" ? ["--source", closeSource, "--proposal", "501"] : [])], cwd: f.repo,
      env: { PATH: join(f.root, "native-bin") + ":" + process.env.PATH, HOME: process.env.HOME!, GH_TOKEN: "synthetic-native-token",
        COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", XDG_STATE_HOME: stateRoot, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      capture: "memory", watched_outputs: [], timeout_ms: 900000, stdout: join(f.root, command + ".stdout"), stderr: join(f.root, command + ".stderr"), started: () => {} });
    expect(result.reaped).toBe(true); expect(result.timed_out).toBe(false);
    return { result, report: JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString()) as unknown };
  }
  const collected = await invoke("resolve");
  expect(collected.report).toMatchObject({ command: "resolve", outcome: "collected" }); expect(collected.result.exit_code).toBe(0);
  const location = { repo: f.repo, directory, origins: join(stateRoot, "vh-adlc/docs-drift/origins") }, run = readRunDirectory(location);
  const reference = run.stages.at(-1)?.artifacts.resolution_inputs;
  if (!reference) throw Error("Original full resolution inputs required");
  const inputs = JSON.parse(readBoundArtifact({ source_repo: f.repo, artifact_root: directory, reference }).toString());
  expect(inputs.inputs.proposals).toHaveLength(1); expect(inputs.inputs.proposals[0].hunks).toHaveLength(1);
  const code = readFileSync(join(f.repo, "src/app.ts"));
  const quote = { path: "src/app.ts", sha256: sha256(code), start: 0, end: code.length, quote_sha256: sha256(code) };
  const decisions = [{ proposal: 1, hunk_id: inputs.inputs.proposals[0].hunks[0].id, disposition: "apply", reason: "Matches the current source",
    evidence: [quote], edit_ids: ["guide-fix"], feedback: null, carry: null, changed_paths: ["docs/guide.md"] }];
  writeFileSync(join(directory, "prepare.yaml"), JSON.stringify({ decisions, attention: [], resolution_id: "normal-resolution", carry_decisions: [] }), { mode: 0o600 });
  const prepared = await invoke("prepare");
  expect(prepared.report).toMatchObject({ command: "prepare", outcome: "collected" }); expect(prepared.result.exit_code).toBe(0);
  const saved = readRunDirectory(location).stages.at(-1)?.artifacts.preparation;
  if (!saved) throw Error("Original consolidation preparation required");
  const preparation = JSON.parse(readBoundArtifact({ source_repo: f.repo, artifact_root: directory, reference: saved }).toString());
  expect(preparation.resolution_record.path).toBe(".vh-adlc/docs-drift/resolutions/normal-resolution.yaml");
  expect(sha256(readFileSync(join(preparation.prepared.checkout, preparation.resolution_record.path)))).toBe(preparation.resolution_record.sha256);
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(readFileSync(service.statePath)).toEqual(nativeBefore);
  git(preparation.prepared.checkout, "add", "--all"); git(preparation.prepared.checkout, "commit", "-m", "Consolidate the selected original");
  const verified = await invoke("verify");
  expect(verified.report).toMatchObject({ command: "verify", outcome: "collected" }); expect(verified.result.exit_code).toBe(0);
  const manifest = readRunDirectory(location).stages.at(-1)?.artifacts.reviewed_plan;
  if (!manifest) throw Error("Exact reviewed consolidation manifest required");
  writeFileSync(join(directory, "approval.yaml"), "manifest_sha256: " + manifest.sha256 + "\nrequest: Approve the exact synthetic consolidation batch\n", { mode: 0o600 });
  const head = git(preparation.prepared.checkout, "rev-parse", "HEAD");
  git(origin, "fetch", "--no-write-fetch-head", preparation.prepared.checkout, head);
  const publication = JSON.parse(readFileSync(service.statePath, "utf8")); publication.publication_commit = head;
  writeFileSync(service.statePath, JSON.stringify(publication));
  const published = await invoke("publish");
  expect(published.report).toMatchObject({ command: "publish", outcome: "collected", publication_effects: { state: "complete" } });
  expect(published.result.exit_code).toBe(0);
  const completed = JSON.parse(readFileSync(service.statePath, "utf8"));
  expect(completed.prs).toHaveLength(2); expect(completed.prs[0].state).toBe("open");
  expect(completed.comments).toEqual({});
  expect(captureRepositoryState(f.repo)).toEqual(before);
  git(f.repo, "fetch", "--no-write-fetch-head", preparation.prepared.checkout, head);
  git(f.repo, "merge", "--no-ff", "-m", "Merge the synthetic consolidation", head);
  closeSource = git(f.repo, "rev-parse", "HEAD");
  git(origin, "fetch", "--no-write-fetch-head", f.repo, closeSource);
  git(origin, "update-ref", "refs/heads/main", closeSource); git(origin, "update-ref", "refs/pull/501/head", head);
  completed.commit = closeSource; completed.tree = git(origin, "rev-parse", closeSource + "^{tree}");
  completed.refs["refs/heads/main"] = closeSource;
  Object.assign(completed.prs[1], { state: "closed", merged: true, merge_commit_sha: closeSource, merged_at: "2000-01-01T00:00:00Z" });
  writeFileSync(service.statePath, JSON.stringify(completed));
  selectedDirectory = join(f.root, "close-run");
  const closeBefore = captureRepositoryState(f.repo), reviewBefore = readFileSync(service.statePath);
  const reviewed = await invoke("close");
  expect(reviewed.report).toMatchObject({ command: "close", outcome: "pending" }); expect(reviewed.result.exit_code).toBe(1);
  expect(readFileSync(service.statePath)).toEqual(reviewBefore);
  const closeLocation = { ...location, directory: selectedDirectory };
  const closeManifest = readRunDirectory(closeLocation).stages.at(-1)?.artifacts.reviewed_plan;
  if (!closeManifest) throw Error("Exact independent closure review required");
  writeFileSync(join(selectedDirectory, "approval.yaml"), "manifest_sha256: " + closeManifest.sha256 + "\nrequest: Approve this exact synthetic post-merge closure batch\n", { mode: 0o600 });
  let closed = await invoke("close");
  if (closeReplyFault) {
    expect(closed.report).toMatchObject({ command: "close", outcome: "pending" }); expect(closed.result.exit_code).toBe(1);
    const observed = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(observed.prs[0].state).toBe("closed"); expect(observed.comments["1"]).toHaveLength(1);
    closed = await invoke("resume");
  }
  if (closed.result.exit_code !== 0) {
    const retained = readRunDirectory(closeLocation).stages.findLast(stage => stage.artifacts.journal)?.artifacts.journal;
    if (retained) console.error("Closure journal progress", JSON.stringify(readJournal(dirname(join(selectedDirectory, retained.path)), f.repo)
      .events.map(event => ({ kind: event.kind, effect_id: event.effect_id }))));
  }
  expect(closed.report).toMatchObject({ command: closeReplyFault ? "resume" : "close", outcome: "collected", publication_effects: { state: "complete" } });
  expect(closed.result.exit_code).toBe(0);
  const final = JSON.parse(readFileSync(service.statePath, "utf8"));
  expect(final.prs[0].state).toBe("closed"); expect(final.comments["1"]).toHaveLength(1);
  expect(captureRepositoryState(f.repo)).toEqual(closeBefore);
  passed = true;
}, 1200000);
