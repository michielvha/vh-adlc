/** Native-shaped account and receipt fixtures. These controls establish no provider or hosted acceptance. */
import { afterAll, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { runtimeFixture } from "./runtime-fixture";
import { selectApprovedRuntime } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { readAdoptedRolePolicy } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import * as adoption from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";

const roots: string[] = [];
let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed mapped runtime fixtures", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const identities = {
  hosted: { actor: "fixture-bot", actor_id: 20 },
  copilot: { actor: "fixture-owner", actor_id: 30 },
  claude: { actor: "fixture-owner", actor_id: 30 },
};

test.each(["hosted", "copilot", "claude"] as const)("mapped %s runtime role selection uses its own native account and adopted receipt", async entry => {
  const f = await runtimeFixture(roots, true, true, undefined, true, undefined, { entry, identities });
  expect(f.selection.identity.actor_id).toBe(identities[entry].actor_id);
  const runtime = await selectApprovedRuntime({ ...f.selection, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") });
  expect(runtime.entry).toBe(entry);
  const original = adoption.readRecordedRoleModel, reads: string[] = [];
  const observer = spyOn(adoption, "readRecordedRoleModel").mockImplementation((receipts, name, role) => {
    reads.push(name);
    return original(receipts, name, role);
  });
  try {
    const policy = readAdoptedRolePolicy({ repo: f.repo, current_default: f.selection.current_default,
      identity: f.selection.identity, runtime, role: "worker" });
    expect(policy.requested_model).toBe(runtime.worker.model);
    expect(reads).toEqual([entry === "hosted" ? "hosted_advisory" : entry === "copilot" ? "copilot_entry" : "claude_entry"]);
  } finally { observer.mockRestore(); }
}, 120000);



test.each(["copilot", "claude"] as const)("the mapped %s owner resumes a pending native publication after account recasing", async entry => {
  try {
    const { originalPublicationFixture, installOwnedNativeService } = await import("./original-publication-fixture");
    const { captureRepositoryState } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
    const f = await originalPublicationFixture(roots, { entry, identities });
    expect(f.target.manifest?.publisher_entry).toBe(entry);
    expect(f.target.manifest?.actor_id).toBe(30);
    const creation = f.target.manifest!.effects.find(effect => effect.kind === "pr-create")!;
    const service = installOwnedNativeService({ ...f, publisher_identity: identities[entry] });
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts")), append = journal.appendOutcome;
    let interrupted = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === creation.id && !interrupted) { interrupted = true; throw Error("Synthetic lost outcome after native PR creation"); }
      return append(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishPublication(f.publication); }
    finally { fault.mockRestore(); }
    expect(interrupted).toBe(true);
    expect(pending.state, pending.reason).toBe("pending");
    expect(pending.journal.plan.manifest.publisher_entry).toBe(entry);
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(state.prs).toHaveLength(1);
    expect(state.prs[0].user).toMatchObject({ login: identities[entry].actor, id: identities[entry].actor_id });
    await expect(controller.resumePublication({ ...f.publication, entry: entry === "copilot" ? "claude" : "copilot", journal_directory: pending.journal.directory }))
      .rejects.toThrow("Original publication controller inputs changed");
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toEqual(state.prs);
    state.viewer_login = identities[entry].actor.toUpperCase();
    state.prs[0].user.login = identities[entry].actor.toUpperCase();
    writeFileSync(service.statePath, JSON.stringify(state));
    const resumed = await controller.resumePublication({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state, resumed.reason).toBe("complete");
    expect(resumed.journal.plan).toEqual(pending.journal.plan);
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(1);
    const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/pulls"))).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
  } catch (error) { failed = true; throw error; }
}, 600000);

test.each(["copilot", "claude"] as const)("the mapped %s owner resumes a pending native closure after account recasing", async entry => {
  try {
    const { originalClosureFixture } = await import("./original-closure-fixture");
    const { captureRepositoryState } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
    const f = await originalClosureFixture(roots, { entry, identities });
    expect(f.target.manifest?.publisher_entry).toBe(entry);
    expect(f.target.manifest?.actor_id).toBe(30);
    const close = f.target.manifest!.effects.find(effect => effect.kind === "pr-close")!;
    const before = captureRepositoryState(f.repo);
    const controller = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts")), append = journal.appendOutcome;
    let interrupted = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === close.id && !interrupted) { interrupted = true; throw Error("Synthetic lost outcome after native close"); }
      return append(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishClosure(f.publication); }
    finally { fault.mockRestore(); }
    expect(interrupted).toBe(true);
    expect(pending.state, pending.reason).toBe("pending");
    expect(pending.journal.plan.manifest.publisher_entry).toBe(entry);
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    expect(state.prs.map((pr: { state: string }) => pr.state)).toEqual(["closed", "closed"]);
    expect(state.comments["1"]).toHaveLength(1);
    expect(state.comments["1"][0].user).toMatchObject({ login: identities[entry].actor, id: identities[entry].actor_id });
    await expect(controller.resumeClosure({ ...f.publication, entry: entry === "copilot" ? "claude" : "copilot", journal_directory: pending.journal.directory }))
      .rejects.toThrow("Original closure controller inputs changed");
    state.viewer_login = identities[entry].actor.toUpperCase();
    state.comments["1"][0].user.login = identities[entry].actor.toUpperCase();
    state.prs[0].user.login = state.prs[0].user.login.toUpperCase();
    writeFileSync(f.service.statePath, JSON.stringify(state));
    const resumed = await controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state, resumed.reason).toBe("complete");
    expect(resumed.journal.plan).toEqual(pending.journal.plan);
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    const calls = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/issues/1/comments"))).toHaveLength(1);
    expect(calls.filter(call => call.program === "gh" && call.args.includes("PATCH") && call.args.includes("repos/fixture/docs/pulls/1"))).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 600000);
