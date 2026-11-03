import { afterEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import * as journal from "../../../plugins/vh-adlc/scripts/audit/journal";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { digest } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { recoverEffect, liveReady } from "../../../plugins/vh-adlc/scripts/audit/recovery";
import { fixture, git } from "./fixtures";
const made: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of made.splice(0)) f.dispose(); });
function context(kind: journal.Intent["kind"] = "merge") {
  expect(typeof journal.retainAbsence).toBe("function");
  const f = fixture(); made.push(f); let config = loadSettings(f.root);
  const run = journal.createRun(config, { artifact_root: f.artifacts, run_id: "retained-run", batch_digest: "a".repeat(64) });
  const action: journal.Intent = { id: "effect", kind, correlation: "owned-effect", target: "pull:42", ...(["key", "row"].includes(kind) ? { actor: "actor", organization: "org", cleanup_method: "#cleanup" } : {}) };
  journal.intent(run, action);
  const observation = { schema_version: 1, repository: config.repository, hostname: config.hostname, run_id: run.header.run_id, batch_digest: run.header.batch_digest,
    action_id: action.id, intent: action, intent_digest: digest(action), state: "absent", observed_at: new Date().toISOString(), method: "read-only:owned-effect-lookup" };
  const lookup = f.artifact("absence.json", JSON.stringify(observation));
  const request = { owner_approved: true, journal_only: true, owner_handoff: "owner:retain-declined-effect", expected_digest: run.digest, intent_digest: digest(action), lookup };
  return { f, config, run, action, observation, request, record: (value: unknown = request, confirmed = true, restrictions: string[] = []) => journal.retainAbsence(config, run.directory, run.header.batch_digest, action.id, value, { absence_confirmed: confirmed, restrictions }),
    drift: () => { f.write("audit-project.md", "# Candidate changed policy\n"); f.commit(); config = loadSettings(f.root); }, current: () => config };
}

test("a declined non-resource effect records typed absence after candidate policy drift without activating it", () => {
  const c = context(), header = readFileSync(join(c.run.directory, "header.json")); c.drift();
  const after = c.record(); expect(after.policy_current).toBe(false); expect(after.cleanup_only).toBe(false);
  expect(after.events.at(-1)?.kind).toBe("retained-absence"); expect(readFileSync(join(c.run.directory, "header.json")).equals(header)).toBe(true);
  const row = journal.registeredOutstanding(c.current())[0]; expect(row.action.id).toBe(c.action.id); expect(row.disposition).toBe("retained-absence");
  expect(journal.inspectPending(c.current(), c.run.directory, c.run.header.batch_digest).live_ready).toBe(false);
});

test("typed absence never permits replay, ordinary outcome, retirement or reuse of the old batch", async () => {
  const c = context(); c.record(); const run = journal.readRun(c.config, c.run.directory, c.run.header.batch_digest); let executed = 0;
  const recovered = await recoverEffect(run, c.action.id, { authorized: true, observe: async () => ({ state: "absent" }), execute: async () => { executed++; return { state: "observed" }; } });
  expect(recovered.state).toBe("blocked"); expect(executed).toBe(0); expect(liveReady(run)).toBe(false);
  expect(() => journal.outcome(run, c.action.id, { state: "observed" })).toThrow();
  expect(() => journal.intent(run, { ...c.action, id: "new-effect" })).toThrow();
  expect(() => journal.retireRun(c.config, run.directory, run.header.batch_digest, { owner_approved: true, owner_handoff: "owner:retire", expected_digest: run.digest })).toThrow();
  const next = journal.createRun(c.config, { artifact_root: c.f.artifacts, run_id: "new-run", batch_digest: "b".repeat(64) }); expect(liveReady(next)).toBe(true);
});

for (const kind of ["report", "local-commit", "issue", "push", "pull", "merge"] as const) test(`all pending ${kind} intents remain visible to cutover`, () => {
  const c = context(kind); const rows = journal.registeredOutstanding(c.config); expect(rows).toHaveLength(1); expect(rows[0].action.kind).toBe(kind); expect(rows[0].disposition).toBe("pending");
});
for (const variant of ["unapproved", "not-journal-only", "stale-digest", "wrong-intent", "unknown-result", "wrong-run", "wrong-repository", "bad-hash", "public-artifact", "unconfirmed", "request-no-write", "helper-no-write", "unknown-field"] as const) test(`absence refuses ${variant} before a journal write`, () => {
  const c = context(), before = readdirSync(join(c.run.directory, "events"));
  let request: Record<string, unknown> = { ...c.request }, confirmed = true, restrictions: string[] = [];
  if (variant === "unapproved") request.owner_approved = false;
  if (variant === "not-journal-only") request.journal_only = false;
  if (variant === "stale-digest") request.expected_digest = "b".repeat(64);
  if (variant === "wrong-intent") request.intent_digest = "b".repeat(64);
  if (variant === "unknown-result" || variant === "wrong-run" || variant === "wrong-repository") {
    const value = { ...c.observation, ...(variant === "unknown-result" ? { state: "unknown" } : variant === "wrong-run" ? { run_id: "another-run" } : { repository: "other/project" }) };
    request.lookup = c.f.artifact("changed-absence.json", JSON.stringify(value));
  }
  if (variant === "bad-hash") request.lookup = { ...c.request.lookup, sha256: "b".repeat(64) };
  if (variant === "public-artifact") chmodSync(join(c.f.artifacts, c.request.lookup.path), 0o644);
  if (variant === "unconfirmed") confirmed = false;
  if (variant === "request-no-write") request.restrictions = ["no-write"];
  if (variant === "helper-no-write") restrictions = ["no-write"];
  if (variant === "unknown-field") request.token = "must-not-be-recorded";
  expect(() => c.record(request, confirmed, restrictions)).toThrow(); expect(readdirSync(join(c.run.directory, "events"))).toEqual(before);
});
for (const kind of ["key", "row"] as const) test(`retained absence never clears a ${kind} resource`, () => {
  const c = context(kind); expect(() => c.record()).toThrow(); expect(journal.registeredPending(c.config)).toHaveLength(1);
});
test("a free reason handoff is never a typed absence and missing registered roots stay unknown", () => {
  const c = context(); journal.handoff(c.run, c.action.id, "retained-absence"); expect(journal.registeredOutstanding(c.config)[0].disposition).toBe("pending");
  rmSync(join(c.run.directory, "header.json")); expect(() => journal.registeredOutstanding(c.config)).toThrow();
});
test("the dedicated native command requires explicit absence confirmation and cannot be replaced by a reason", () => {
  const c = context(), request = c.f.artifact("request.json", JSON.stringify(c.request));
  const invoke = (flag: string) => Bun.spawnSync([process.execPath, resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/audit/cli.ts"), "journal-retained-absence", "--repo", c.f.root, "--directory", c.run.directory,
    "--batch-digest", c.run.header.batch_digest, "--action-id", c.action.id, "--input", join(c.f.artifacts, request.path), "--absence-confirmed", flag], { stdout: "pipe", stderr: "pipe" });
  expect(invoke("false").exitCode).toBe(1); const result = invoke("true"); expect(result.exitCode).toBe(0);
  const report = JSON.parse(result.stdout.toString()); expect(report.events.at(-1).kind).toBe("retained-absence"); expect(report.policy_current).toBe(true);
  expect(invoke("true").exitCode).toBe(1);
});


test("the journal-only recorder also works after a current-policy cleanup transition", () => {
  const c = context(), header = readFileSync(join(c.run.directory, "header.json")); c.drift();
  const policy_commit = git(c.f.root, "rev-parse", "HEAD");
  const run = journal.reconcilePolicy(c.current(), c.run.directory, c.run.header.batch_digest,
    { owner_approved: true, owner_handoff: "owner:cleanup-policy", expected_digest: c.run.digest, policy_commit }, { observe: () => ({ default_branch: "main", default_commit: policy_commit }) });
  expect(run.cleanup_only).toBe(true);
  const recorded = c.record({ ...c.request, expected_digest: run.digest });
  expect(recorded.cleanup_only).toBe(true); expect(recorded.policy_current).toBe(true);
  expect(recorded.events.at(-1)?.kind).toBe("retained-absence"); expect(readFileSync(join(c.run.directory, "header.json")).equals(header)).toBe(true);
  expect(journal.inspectPending(c.current(), c.run.directory, c.run.header.batch_digest).live_ready).toBe(false);
});
test("an earlier run's lookup and stale registration cannot attest another run", () => {
  const c = context(), next = journal.createRun(c.config, { artifact_root: c.f.artifacts, run_id: "other-run", batch_digest: "b".repeat(64) });
  journal.intent(next, c.action);
  expect(() => journal.retainAbsence(c.config, next.directory, next.header.batch_digest, c.action.id,
    { ...c.request, expected_digest: next.digest }, { absence_confirmed: true })).toThrow();
  git(c.f.root, "remote", "set-url", "origin", "https://github.com/other/project.git"); expect(() => c.record()).toThrow();
});
