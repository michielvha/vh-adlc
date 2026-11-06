import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { reconcileAbsent, resumeEffects, inspectRetainedOperation, restoreRetainedOperation, type ReconciliationScope } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture, publicationOptions as options } from "./publication-fixture";
import { hash } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

async function abandoned() {
  const f = publicationFixture(roots), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => { if (effect.id === "pr") throw new PublicationExecutionError(false, true); await execute(plan, effect, objects); };
  const interrupted = await publish(options(f)); f.transport.execute = execute;
  return { f, interrupted };
}
function request(scope: ReconciliationScope) {
  return Promise.resolve({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("actual selected reconciliation request") });
}
function input(f: Awaited<ReturnType<typeof abandoned>>["f"], directory: string) {
  return { source_repo: f.repo, journal_directory: directory, object_store: f.store, settings: f.settings, transport: f.transport,
    retire_effect_ids: ["pr"], authorize: request };
}

test("exact new cleanup authority can retire a known-absent action and release only its lease", async () => {
  const { f, interrupted } = await abandoned();
  f.input.grants = []; f.input.reviewer.native = Buffer.from("old publication proof unavailable");
  const result = await reconcileAbsent(input(f, interrupted.journal.directory));
  expect(result.state).toBe("retired");
  expect(f.executed).toEqual(["lease", "receipt", "push", "release"]);
  expect(result.journal.events.some(event => event.kind === "retired-absence" && event.effect_id === "pr")).toBe(true);
  expect(result.journal.events.some(event => event.kind === "outcome" && event.effect_id === "pr")).toBe(false);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  expect(f.refs.has(f.settings.publication.receipt_ref_prefix + "operation-1")).toBe(true);
  const normal = await resumeEffects({ ...options(f), journal_directory: result.journal.directory });
  expect(normal.state).toBe("retired");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(0);
});

test("report data and stale or absent cleanup grants authorize no retirement or release", async () => {
  for (const authorize of [async () => null, async () => ({ scope_sha256: hash("wrong scope"), request_sha256: hash("request") })]) {
    const { f, interrupted } = await abandoned();
    const result = await reconcileAbsent({ ...input(f, interrupted.journal.directory), authorize });
    expect(result.state).toBe("pending");
    expect(result.journal.events.some(event => event.kind === "retired-absence")).toBe(false);
    expect(f.executed).toEqual(["lease", "receipt", "push"]);
  }
});

test("unknown, changed or incomplete absence evidence cannot retire an action", async () => {
  for (const mode of ["unknown", "conflict", "missing-evidence"] as const) {
    const { f, interrupted } = await abandoned(), observe = f.transport.observe;
    f.transport.observe = async (plan, effect, objects) => {
      if (effect.id === "pr") return mode === "missing-evidence" ? { state: "absent" } : { state: mode, reason: "actual-state-unavailable" };
      return observe(plan, effect, objects);
    };
    const result = await reconcileAbsent(input(f, interrupted.journal.directory));
    expect(result.state).toBe("pending");
    expect(result.journal.events.some(event => event.kind === "retired-absence")).toBe(false);
    expect(f.executed).toEqual(["lease", "receipt", "push"]);
  }
});

test("a moved lease is retained and never released under the old object's grant", async () => {
  const { f, interrupted } = await abandoned();
  f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
  const result = await reconcileAbsent(input(f, interrupted.journal.directory));
  expect(result.state).toBe("pending");
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe("f".repeat(40));
  expect(f.executed).toEqual(["lease", "receipt", "push"]);
});

test("revoked cleanup authority keeps retirement non-success and the lease pending", async () => {
  const { f, interrupted } = await abandoned();
  let calls = 0;
  const result = await reconcileAbsent({ ...input(f, interrupted.journal.directory), authorize: scope => ++calls < 3 ? request(scope) : Promise.resolve(null) });
  expect(result.state).toBe("pending");
  expect(result.journal.events.some(event => event.kind === "retired-absence")).toBe(true);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(true);
  const normal = await resumeEffects({ ...options(f), journal_directory: result.journal.directory });
  expect(normal.state).toBe("pending");
  expect(f.executed.filter(id => id === "pr")).toHaveLength(0);
});

test("caller mutation cannot replace the IDs selected by the actual cleanup grant", async () => {
  const { f, interrupted } = await abandoned();
  const selected = ["push"];
  const result = await reconcileAbsent({ ...input(f, interrupted.journal.directory), retire_effect_ids: selected,
    authorize: scope => { selected[0] = "pr"; return request(scope); } });
  expect(result.state).toBe("pending");
  expect(result.journal.events.some(event => event.kind === "retired-absence")).toBe(false);
  expect(f.executed).toEqual(["lease", "receipt", "push"]);
});

test("a lost cleanup acknowledgement can finish read-only without repeating deletion", async () => {
  const { f, interrupted } = await abandoned();
  const execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "lease-release") throw Error("cleanup acknowledgement lost");
  };
  const cleanup = await reconcileAbsent(input(f, interrupted.journal.directory));
  expect(cleanup.state).toBe("pending");
  f.transport.execute = execute;
  const result = await resumeEffects({ ...options(f), journal_directory: cleanup.journal.directory });
  expect(result.state).toBe("retired");
  expect(f.executed.filter(id => id === "release")).toHaveLength(1);
  expect(f.executed.filter(id => id === "pr")).toHaveLength(0);
});


test("changed absence evidence cannot retire an action", async () => {
  const { f, interrupted } = await abandoned(), observe = f.transport.observe;
  f.transport.observe = async (plan, effect, objects) => {
    const result = await observe(plan, effect, objects);
    if (effect.id === "pr" && result.state === "absent" && result.evidence) writeFileSync(result.evidence.path, "{}");
    return result;
  };
  const result = await reconcileAbsent(input(f, interrupted.journal.directory));
  expect(result.state).toBe("pending");
  expect(result.journal.events.some(event => event.kind === "retired-absence")).toBe(false);
  expect(f.executed).toEqual(["lease", "receipt", "push"]);
});

test("the final lease compare-and-swap preserves a replacement after approval", async () => {
  const { f, interrupted } = await abandoned(), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.kind === "lease-release") f.refs.set(f.settings.publication.lease_ref, "f".repeat(40));
    await execute(plan, effect, objects);
  };
  const result = await reconcileAbsent(input(f, interrupted.journal.directory));
  expect(result.state).toBe("pending");
  expect(f.refs.get(f.settings.publication.lease_ref)).toBe("f".repeat(40));
  expect(f.executed.filter(id => id === "pr")).toHaveLength(0);
  expect(result.journal.events.some(event => event.kind === "retired-absence")).toBe(true);
});


test("cleanup cannot retire or release while the original attempt is in flight", async () => {
  const { f, interrupted } = await abandoned();
  const execute = f.transport.execute;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  f.transport.execute = async (plan, effect, objects) => {
    if (effect.id === "pr") { entered(); await finish; }
    await execute(plan, effect, objects);
  };
  const running = resumeEffects({ ...options(f), journal_directory: interrupted.journal.directory });
  await started;
  try {
    const cleanup = await reconcileAbsent(input(f, interrupted.journal.directory));
    expect(cleanup.state).toBe("pending");
    expect(cleanup.reason).toBe("attempt-in-flight");
    expect(cleanup.journal.events.some(event => event.kind === "retired-absence")).toBe(false);
    expect(f.executed.includes("release")).toBe(false);
  } finally { release(); }
  expect((await running).state).toBe("complete");
});


test("lost original proof still permits read-only restoration and separately approved terminal lease cleanup", async () => {
  const f = publicationFixture(roots), execute = f.transport.execute;
  f.transport.execute = async (plan, effect, objects) => {
    await execute(plan, effect, objects);
    if (effect.kind === "pr-create") throw Error("lost response and runner");
  };
  const interrupted = await publish(options(f));
  f.transport.execute = execute;
  rmSync(interrupted.journal.directory, { recursive: true });
  f.input.grants = [];
  f.input.reviewer.native = Buffer.from("original native proof lost");
  const recoveredRoot = join(f.root, "new-host-artifacts");
  mkdirSync(recoveredRoot, { mode: 0o700 });
  f.transport = { ...f.transport, artifact_root: recoveredRoot };
  const inspection = await inspectRetainedOperation({ source_repo: f.repo, artifact_root: recoveredRoot,
    settings: f.settings, transport: f.transport, operation_id: "operation-1", verify_policy: () => f.policy });
  const restored = await restoreRetainedOperation({ inspection, publication: { ...options(f), artifact_root: recoveredRoot } });
  expect(restored.state).toBe("pending");
  expect(restored.reason).toBe("retained-restore-no-replay");
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr"]);
  const cleanup = await reconcileAbsent({ ...input(f, restored.journal.directory), retire_effect_ids: [] });
  expect(cleanup.state).toBe("complete");
  expect(f.executed).toEqual(["lease", "receipt", "push", "pr", "release"]);
  expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  expect(f.refs.has(f.settings.publication.receipt_ref_prefix + "operation-1")).toBe(true);
});
