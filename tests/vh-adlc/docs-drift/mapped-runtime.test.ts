/** Native-shaped account and receipt fixtures. These controls establish no provider or hosted acceptance. */
import { afterAll, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { readFileSync, rmSync } from "node:fs";
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


test("the mapped owner publishes and resumes through its retained native controller", async () => {
  try {
    const { originalPublicationFixture, installOwnedNativeService } = await import("./original-publication-fixture");
    const { captureRepositoryState } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
    const f = await originalPublicationFixture(roots, { entry: "copilot", identities });
    expect(f.target.manifest?.publisher_entry).toBe("copilot");
    expect(f.target.manifest?.actor_id).toBe(30);
    const service = installOwnedNativeService({ ...f, publisher_identity: identities.copilot });
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const published = await controller.publishPublication(f.publication);
    expect(published.state, published.reason).toBe("complete");
    expect(published.journal.plan.manifest.publisher_entry).toBe("copilot");
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(state.prs).toHaveLength(1);
    expect(state.prs[0].user).toMatchObject({ login: identities.copilot.actor, id: identities.copilot.actor_id });
    await expect(controller.resumePublication({ ...f.publication, entry: "claude", journal_directory: published.journal.directory }))
      .rejects.toThrow("Original publication controller inputs changed");
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toEqual(state.prs);
    const resumed = await controller.resumePublication({ ...f.publication, journal_directory: published.journal.directory });
    expect(resumed.state, resumed.reason).toBe("complete");
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
  } catch (error) { failed = true; throw error; }
}, 600000);


test("the mapped owner closes and resumes its reviewed exact batch through the retained native controller", async () => {
  try {
    const { originalClosureFixture } = await import("./original-closure-fixture");
    const { captureRepositoryState } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
    const f = await originalClosureFixture(roots, { entry: "copilot", identities });
    expect(f.target.manifest?.publisher_entry).toBe("copilot");
    expect(f.target.manifest?.actor_id).toBe(30);
    const before = captureRepositoryState(f.repo);
    const controller = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const published = await controller.publishClosure(f.publication);
    expect(published.state, published.reason).toBe("complete");
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    expect(state.prs.map((pr: { state: string }) => pr.state)).toEqual(["closed", "closed"]);
    expect(state.comments["1"]).toHaveLength(1);
    expect(state.comments["1"][0].user).toMatchObject({ login: identities.copilot.actor, id: identities.copilot.actor_id });
    await expect(controller.resumeClosure({ ...f.publication, entry: "claude", journal_directory: published.journal.directory }))
      .rejects.toThrow("Original closure controller inputs changed");
    const resumed = await controller.resumeClosure({ ...f.publication, journal_directory: published.journal.directory });
    expect(resumed.state, resumed.reason).toBe("complete");
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 600000);
