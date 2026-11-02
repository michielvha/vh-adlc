import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createRun, readRun, intent, outcome, inspectPending } from "../../../plugins/vh-adlc/scripts/audit/journal";
import { recoverEffect } from "../../../plugins/vh-adlc/scripts/audit/recovery";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
export function context() {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root);
  const run = createRun(config, { artifact_root: f.artifacts, run_id: "synthetic-run", batch_digest: "a".repeat(64) });
  return { f, config, run, reload: () => readRun(config, run.directory, "a".repeat(64)) };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("saved report and local commit recovery retains the actual paths and commit without replay", async () => {
  const c = context(), before = git(c.f.root, "status", "--porcelain");
  const report = c.f.artifact("saved-report.md", "Saved observation.\n");
  const action = { id: "local-report", kind: "report" as const, correlation: "report-synthetic-run", target: "local-artifact" };
  intent(c.run, action); outcome(c.run, action.id, { state: "observed", artifact_path: report.path, artifact_digest: report.sha256 });
  const commit = git(c.f.root, "rev-parse", "HEAD");
  intent(c.reload(), { id: "local-commit", kind: "local-commit", correlation: "commit-synthetic-run", target: "owned-ledger", expected_head: commit });
  let replayed = 0;
  const result = await recoverEffect(c.reload(), "local-commit", {
    observe: async () => ({ state: "done", receipt: { state: "observed", commit } }),
    execute: async () => { replayed++; throw Error("must not execute"); }, authorized: true,
  });
  expect(result.state).toBe("observed"); expect(replayed).toBe(0);
  expect(c.reload().events.filter(e => e.kind === "outcome")).toHaveLength(2);
  expect(git(c.f.root, "status", "--porcelain")).toBe(before);
});

test("lost squash-merge acknowledgement records one observed outcome privately and never repeats the merge", async () => {
  const c = context(), before = git(c.f.root, "for-each-ref", "--format=%(refname) %(objectname)");
  intent(c.run, { id: "merge-42", kind: "merge", correlation: "pull-42", target: "pull:42", expected_head: git(c.f.root, "rev-parse", "HEAD") });
  let merged = false, calls = 0;
  const transport = {
    authorized: true,
    observe: async () => merged ? { state: "done", receipt: { state: "observed", commit: "b".repeat(40), pull_number: 42 } } : { state: "absent" },
    execute: async () => { calls++; merged = true; throw Error("lost response after accepted merge"); },
  } as const;
  await expect(recoverEffect(c.run, "merge-42", transport)).rejects.toThrow("lost response");
  expect(c.reload().events.filter(e => e.kind === "outcome")).toHaveLength(0);
  expect((await recoverEffect(c.reload(), "merge-42", transport)).state).toBe("observed");
  expect((await recoverEffect(c.reload(), "merge-42", transport)).state).toBe("observed");
  expect(calls).toBe(1); expect(c.reload().events.filter(e => e.kind === "outcome")).toHaveLength(1);
  expect(git(c.f.root, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(before);
  expect(readFileSync(join(c.run.directory, "events", "00000002.json"), "utf8")).toContain("pull_number");
});

test("missing local outcome or unknown remote state cannot authorize a blind merge retry", async () => {
  const c = context(); intent(c.run, { id: "merge", kind: "merge", correlation: "pull-42", target: "pull:42" });
  expect((await recoverEffect(c.reload(), "merge", { authorized: true, observe: async () => ({ state: "unknown" }) })).state).toBe("blocked");
  expect((await recoverEffect(c.reload(), "merge", { authorized: false, observe: async () => ({ state: "absent" }) })).state).toBe("blocked");
  await expect(recoverEffect(c.reload(), "missing-intent", { authorized: true, observe: async () => ({ state: "unknown" }) })).rejects.toThrow();
});

test("journal conflicts, scope drift, public modes, secret fields and symlinks fail closed", () => {
  const c = context(), action = { id: "x", kind: "merge" as const, correlation: "pull-42", target: "pull:42" };
  const stale = c.reload(); intent(c.run, action);
  expect(() => intent(stale, { ...action, id: "other" })).toThrow();
  expect(() => intent(c.reload(), { ...action, id: "secret", token: "do-not-save" } as never)).toThrow();
  expect(() => readRun(c.config, c.run.directory, "c".repeat(64))).toThrow();
  c.f.write("audit-project.md", "# Changed policy\n"); expect(() => c.reload()).toThrow();
  c.f.write("audit-project.md", "# Audit project policy\n\nNo standing publication grant.\n");
  chmodSync(join(c.run.directory, "header.json"), 0o644); expect(() => c.reload()).toThrow();
  chmodSync(join(c.run.directory, "header.json"), 0o600);
  const linked = join(c.f.artifacts, "linked"); symlinkSync(c.run.directory, linked); expect(() => readRun(c.config, linked, "a".repeat(64))).toThrow();
  expect(existsSync(join(c.f.root, "audit-run-synthetic-run"))).toBe(false);
});

test("changed policy leaves resource intents inspectable without conferring journal mutation or retry authority", () => {
  const c = context(); intent(c.run, { id: "owned-key", kind: "key", correlation: "unique-owned-key", target: "development:slot", actor: "fixture", organization: "org", cleanup_method: "#cleanup" });
  c.f.write("audit-project.md", "# Updated current policy\n");
  const result = inspectPending(loadSettings(c.f.root), c.run.directory, c.run.header.batch_digest);
  expect(result.policy_current).toBe(false); expect(result.handoff).toBe("policy-changed"); expect(result.live_ready).toBe(false);
  expect(result.pending.map(row => row.id)).toEqual(["owned-key"]);
  expect(() => outcome(c.run, "owned-key", { state: "observed" })).toThrow();
});
