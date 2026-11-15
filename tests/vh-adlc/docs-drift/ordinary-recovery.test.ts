import { afterAll, expect, spyOn, test } from "bun:test";
import { cpSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ordinaryPublicationFixture } from "./ordinary-publication-fixture";
import { commit } from "./preflight-fixture";
import { git } from "./repository-fixture";
import { retainSyntheticArtifact } from "./original-publication-fixture";
import * as journals from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { publishPublication } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-controller";
import { inspectRecovery } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller";
import { readRunDirectory, appendRunStage } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("ordinary original-context recovery acknowledges after a schema upgrade, staged rollback and client removal", async () => {
  const f = await ordinaryPublicationFixture(roots), append = journals.appendOutcome;
  const interruption = spyOn(journals, "appendOutcome").mockImplementation((journal, id, outcome) => {
    if (id === "publication") throw Error("Synthetic lost local PR outcome");
    return append(journal, id, outcome);
  });
  let pending;
  try { pending = await publishPublication(f.publication, f.run); } finally { interruption.mockRestore(); }
  expect(pending.state, pending.reason ?? undefined).toBe("pending");
  expect(pending.journal.plan.schema_version).toBe(2);
  const original = canonicalJSON(pending.journal.plan);
  const observation = join(f.root, "lost-host-observations"), refs = git(f.origin, "for-each-ref");
  const nativeBefore = readFileSync(f.service.statePath);
  async function invoke(action: string, extra: string[] = [], directory = observation) {
    const result = await executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"),
      "resume", "--repo", f.repo, "--run-dir", directory, "--action", action, ...extra], cwd: f.repo,
      env: { PATH: f.options.path!, HOME: process.env.HOME!, GH_TOKEN: f.options.credential,
        XDG_STATE_HOME: join(f.root, directory === f.run.directory ? "original-state" : "observer-state"), BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      capture: "memory", watched_outputs: [], timeout_ms: 120000,
      stdout: join(f.root, action + ".stdout"), stderr: join(f.root, action + ".stderr"), started: () => {} });
    expect(result.reaped).toBe(true); expect(result.timed_out).toBe(false);
    return { result, report: JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString()) };
  }
  const restored = await invoke("restore", ["--source", f.source, "--operation-id", pending.journal.plan.manifest.operation_id]);
  expect(restored.report.retained_operation?.replay_authority, JSON.stringify(restored.report)).toBe(false);
  expect(restored.report.retained_operation?.journal_directory).toContain(observation);
  const observed = await invoke("inspect");
  expect(observed.result.exit_code).toBe(1);
  expect(observed.report.outcome).toBe("pending");
  expect(observed.report.operation).toMatchObject({ schema_version: 2, operation_id: pending.journal.plan.manifest.operation_id,
    approval_sha256: pending.journal.plan.approval_sha256, execution_origin: "observation-only" });
  expect(git(f.origin, "for-each-ref")).toBe(refs); expect(readFileSync(f.service.statePath)).toEqual(nativeBefore);
  const successor = { ...f.afterSettings, publication: { ...f.afterSettings.publication, mode: "staged" },
    successor_only_field: "unknown to the original release" };
  f.write(".vh-adlc/docs-drift.yaml", canonicalJSON(successor)); const current = commit(f.repo, "Synthetic successor rollback");
  git(f.origin, "fetch", "--no-write-fetch-head", f.repo, current); git(f.origin, "update-ref", "refs/heads/main", current);
  unlinkSync(f.component.executable);
  const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  state.commit = current; state.tree = git(f.repo, "rev-parse", "HEAD^{tree}"); state.prs[0].title = "Later owner title"; state.viewer_login = "Fixture-Owner";
  writeFileSync(f.service.statePath, JSON.stringify(state), { mode: 0o600 });
  const selection = { schema_version: 1, kind: "docs-drift-recovery-selection", source_commit: f.source,
    operation_id: pending.journal.plan.manifest.operation_id, purpose: "acknowledgement", acknowledge_effect_ids: ["publication"], retire_effect_ids: [], retirement_lookups: {} };
  const common = { ...f.options, journal_directory: pending.journal.directory, selection };
  const inspected = await inspectRecovery(common);
  expect(inspected.complete, inspected.diagnostics.join("\n")).toBe(true);
  expect(inspected.scopes).toHaveLength(1);
  const request = retainSyntheticArtifact(f.artifacts, "recovery-owner.txt", Buffer.from("Synthetic owner approves the displayed current acknowledgement and owned cleanup.\n"));
  const authority = retainSyntheticArtifact(f.artifacts, "recovery-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority",
    purpose: "acknowledgement", scope_sha256s: inspected.scope_sha256s, origin: { kind: "owner-current-request", artifact: request } }));
  const selected = retainSyntheticArtifact(f.artifacts, "recovery-selection.json", canonicalJSON(selection));
  appendRunStage(readRunDirectory(f.location), { command: "resume", state: "pending", artifacts: { recovery_selection: selected, approval: authority } });
  const copy = join(f.root, "copied-original-run"); cpSync(f.run.directory, copy, { recursive: true });
  const beforeCopy = readFileSync(f.service.calls);
  const refused = await invoke("acknowledge", [], copy);
  expect(refused.result.exit_code).toBe(2);
  expect(refused.report.diagnostics).toEqual([expect.stringContaining("Original host ownership")]);
  expect(readFileSync(f.service.calls)).toEqual(beforeCopy);
  const applied = await invoke("acknowledge", [], f.run.directory);
  expect(applied.report.recovery_effects?.state, JSON.stringify(applied.report)).toBe("acknowledged");
  expect(applied.result.exit_code).toBe(1);
  expect(canonicalJSON(journals.readJournal(pending.journal.directory, f.repo).plan).equals(original)).toBe(true);
  const repeated = await invoke("acknowledge", [], f.run.directory);
  expect(repeated.report.recovery_effects?.state, JSON.stringify(repeated.report)).toBe("acknowledged");
  const delivered = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  expect(delivered.prs).toHaveLength(1); expect(delivered.prs[0].title).toBe("Later owner title");
  const lease = Bun.spawnSync(["git", "show-ref", "--verify", "--quiet", f.afterSettings.publication.lease_ref],
    { cwd: f.origin, stdout: "pipe", stderr: "pipe" });
  expect(lease.exitCode).toBe(1);
  expect(lease.stderr.toString()).toBe("");
}, 600000);
