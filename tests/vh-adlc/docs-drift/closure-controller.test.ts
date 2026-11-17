/** Synthetic exact permissions and native API, with owned local Git only. No live effect. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkClosurePublication, publishClosure } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-controller";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { originalClosureFixture } from "./original-closure-fixture";
import { git, put } from "./repository-fixture";

const roots: string[] = [];
let preserveFailedRoots = false;
afterAll(() => {
  if (preserveFailedRoots) console.error("Preserved failed owned closure fixture roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("normal closure authority check seals the reviewed exact batch without sending any writes", async () => {
  const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
  const result = await checkClosurePublication(f.publication);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.authority).toBe("none");
  expect(result.plan!.manifest_sha256).toBe(f.target.manifest_sha256!);
  const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  expect(state.prs[0].state).toBe("open"); expect(state.comments).toEqual({});
  const calls = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
  expect(calls.some(call => call.program === "git" && call.args.includes("push") || call.program === "gh" && (call.args.includes("PATCH")
    || call.args.includes("DELETE") || call.args.includes("PUT") || call.args.includes("POST") && !call.args.includes("graphql")
    || call.args.includes("graphql") && call.args.some(arg => /mutation\b/u.test(arg))))).toBe(false);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);

test("retained original closure controller publishes only its exact approved explanations and closes", async () => {
  try {
    const f = await originalClosureFixture(roots);
    put(f.repo, "docs/guide.md", "Preserve another documentation draft\n");
    const before = captureRepositoryState(f.repo);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/closure-controller") = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const result = await f.invoke(run => controller.publishClosure(f.publication, run));
    expect(result.state, JSON.stringify({ reason: result.reason, events: result.journal.events.map((event: { kind: string; effect_id: string }) => [event.kind, event.effect_id]) })).toBe("complete");
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    expect(state.prs[0].state).toBe("closed"); expect(state.prs[1].state).toBe("closed");
    expect(state.comments["1"]).toHaveLength(1);
    expect(state.comments["1"][0].body).toBe(f.target.manifest!.effects.find(effect => effect.kind === "comment-create")!.payload.body);
    expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease")).toBe("");
    expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-receipts/closure-worker")).toBe("refs/heads/docs-drift-receipts/closure-worker");
    const receiptRef = "refs/heads/docs-drift-receipts/closure-worker";
    expect(git(f.origin, "rev-parse", receiptRef)).toBe(result.objects.receipt_object ?? result.objects.object);
    const calls = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.some(call => call.program === "git" && call.args.includes("push")
      && (call.args.includes(":" + receiptRef) || call.args.includes("--delete") && call.args.includes(receiptRef))
      || call.program === "gh" && call.args.includes("DELETE") && call.args.some(arg => arg.includes("git/refs/heads/docs-drift-receipts/")))).toBe(false);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 365000);

test.each(["local", "hosted"])("retained closure resumes an applied close after its local outcome write fails without repeating its explanation: %s", async entry => {
  try {
    const { spyOn } = await import("bun:test");
    const identities = Object.fromEntries(["hosted", "copilot", "claude", "interactive"].map(name => [name, { actor: "fixture-bot", actor_id: 20 }]));
    const f = await originalClosureFixture(roots, entry === "hosted" ? { entry: "hosted", identities } : undefined);
    const before = captureRepositoryState(f.repo);
    if (entry === "hosted") {
      const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
      const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
      state.workflow_runs = [{ id: 501, run_attempt: 2, workflow_id: f.snapshot.settings.reports.workflow_id,
        path: f.snapshot.settings.reports.workflow_path, event: "schedule", status: "in_progress", conclusion: null,
        head_sha: f.source, head_branch: "main", repository, head_repository: repository,
        created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:00:00Z" }];
      writeFileSync(f.service.statePath, JSON.stringify(state));
    }
    const publication = { ...f.publication, ...(entry === "hosted" ? { hosted_executor: { run_id: 501, run_attempt: 2 } } : {}) };
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/closure-controller") = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts"));
    const original = journal.appendOutcome;
    let injected = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "close-1" && !injected) { injected = true; throw Error("Synthetic crash after native closure before local outcome"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await f.invoke(run => controller.publishClosure(publication, run)); }
    finally { fault.mockRestore(); }
    expect(injected).toBe(true); expect(pending.state).toBe("pending");
    const receiptRef = f.snapshot.settings.publication.receipt_ref_prefix + pending.journal.plan.manifest.operation_id;
    const receiptObject = git(f.origin, "rev-parse", receiptRef);
    const delivered = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    expect(delivered.prs[0].state).toBe("closed"); expect(delivered.comments["1"]).toHaveLength(1);
    const resumed = await f.invoke(run => controller.resumeClosure({ ...publication, journal_directory: pending.journal.directory }, run));
    expect(resumed.state, JSON.stringify({ reason: resumed.reason })).toBe("complete");
    const repeated = await f.invoke(run => controller.resumeClosure({ ...publication, journal_directory: pending.journal.directory }, run));
    expect(repeated.state).toBe("complete");
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    const calls = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.filter(call => call.program === "gh" && call.args.includes("PATCH") && call.args.includes("repos/fixture/docs/pulls/1"))).toHaveLength(1);
    expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease")).toBe("");
    expect(git(f.origin, "rev-parse", receiptRef)).toBe(receiptObject);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);

test("edited delivered explanations invalidate original closure recovery even after their text is restored", async () => {
  try {
    const { spyOn } = await import("bun:test");
    const { writeFileSync } = await import("node:fs");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/closure-controller") = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts"));
    const append = journal.appendOutcome;
    let injected = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "close-1" && !injected) { injected = true; throw Error("Synthetic lost closure outcome"); }
      return append(current, id, outcome);
    });
    let pending;
    try { pending = await f.invoke(run => controller.publishClosure(f.publication, run)); }
    finally { fault.mockRestore(); }
    expect(injected).toBe(true); expect(pending.state).toBe("pending");
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8")), body = state.comments["1"][0].body;
    state.comments["1"][0].body += "Later owner explanation edit\n";
    writeFileSync(f.service.statePath, JSON.stringify(state));
    await expect(f.invoke(run => controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory }, run)))
      .rejects.toThrow("Current own closure effect changed");
    const invalidated = journal.readJournal(pending.journal.directory, f.repo);
    expect(invalidated.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    state.comments["1"][0].body = body;
    writeFileSync(f.service.statePath, JSON.stringify(state));
    const resumed = await f.invoke(run => controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory }, run));
    expect(resumed.state).toBe("pending"); expect(resumed.reason).toBe("reconciliation-only-no-replay");
    const writes = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] })
      .filter(call => call.program === "gh" && call.args.includes("PATCH") && call.args.includes("repos/fixture/docs/pulls/1"));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease")).toBe("refs/heads/docs-drift-lease");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);


test("closure execution refuses incomplete permission and sends no native effects without its original run", async () => {
  const { retainSyntheticArtifact } = await import("./original-publication-fixture");
  const { canonicalJSON } = await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol");
  const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
  const packet = JSON.parse(readFileSync(join(f.artifacts, f.publication.authority.path), "utf8"));
  packet.effects = [];
  const missing = retainSyntheticArtifact(f.artifacts, "missing-closure-effect-permission.json", canonicalJSON(packet));
  const checked = await checkClosurePublication({ ...f.publication, authority: missing });
  expect(checked.complete).toBe(false); expect(checked.plan).toBeNull();
  expect(checked.diagnostics).toContain("Publication authority exact effects required");
  const pending = await publishClosure(f.publication);
  expect(pending.state).toBe("pending");
  expect(pending.journal.events.find(event => event.kind === "attempt-ended")?.payload).toMatchObject({ sent: false, reaped: true });
  const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  expect(state.prs[0].state).toBe("open"); expect(state.comments).toEqual({});
  expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease")).toBe("");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);

test("a mistaken closure resume selection leaves its pending journal unchanged and correct resume can finish", async () => {
  try {
    const { spyOn } = await import("bun:test"), { canonicalDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/closure-controller") = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts")), original = journal.appendOutcome;
    let interrupted = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "close-1" && !interrupted) { interrupted = true; throw Error("Synthetic lost local close outcome"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await f.invoke(run => controller.publishClosure(f.publication, run)); }
    finally { fault.mockRestore(); }
    expect(interrupted).toBe(true); expect(pending.state).toBe("pending");
    const options = { ...f.publication, journal_directory: pending.journal.directory };
    const journalBefore = canonicalDigest(journal.readJournal(options.journal_directory, f.repo));
    await expect(f.invoke(run => controller.resumeClosure({ ...options, selection: { ...f.options.selection, consolidation: 999 } }, run)))
      .rejects.toThrow("Original closure controller inputs changed");
    expect(canonicalDigest(journal.readJournal(options.journal_directory, f.repo))).toBe(journalBefore);
    const resumed = await f.invoke(run => controller.resumeClosure(options, run));
    expect(resumed.state, JSON.stringify(resumed.reason)).toBe("complete");
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);

test.each(["authority", "origin"])("changed closure %s bytes persistently invalidate the batch before another effect", async kind => {
  try {
    const { spyOn } = await import("bun:test"), { writeFileSync } = await import("node:fs");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/closure-controller") = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts")), original = journal.appendOutcome;
    const authority = JSON.parse(readFileSync(join(f.artifacts, f.publication.authority.path), "utf8"));
    const path = join(f.artifacts, kind === "authority" ? f.publication.authority.path : authority.origin.artifact.path), bytes = readFileSync(path);
    let changed = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      const appended = original(current, id, outcome);
      if (id === "lease" && !changed) { changed = true; writeFileSync(path, Buffer.concat([bytes, Buffer.from("\n")])); }
      return appended;
    });
    let pending;
    try { pending = await f.invoke(run => controller.publishClosure(f.publication, run)); }
    finally { fault.mockRestore(); }
    expect(changed).toBe(true); expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    expect(state.comments).toEqual({}); expect(state.prs[0].state).toBe("open");
    writeFileSync(path, bytes);
    const callsBefore = readFileSync(f.service.calls, "utf8"), resumed = await f.invoke(run => controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory }, run));
    expect(resumed.state).toBe("pending"); expect(resumed.reason).toBe("reconciliation-only-no-replay");
    const later = readFileSync(f.service.calls, "utf8").slice(callsBefore.length).trim().split("\n").filter(Boolean)
      .map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(later.some(call => call.program === "git" && call.args.includes("push") || call.program === "gh"
      && call.args.some(arg => arg.startsWith("repos/")) && call.args.some(arg => ["POST", "PATCH", "PUT", "DELETE"].includes(arg)))).toBe(false);
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments).toEqual({});
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);
