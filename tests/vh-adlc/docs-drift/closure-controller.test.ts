/** Synthetic exact permissions and native API, with owned local Git only. No live effect. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
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
    const controller = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const result = await controller.publishClosure(f.publication);
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

test("normal closure publication check command requires the exact original authority and sends no writes", async () => {
  const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
  const { retainSyntheticArtifact } = await import("./original-publication-fixture");
  const { canonicalJSON } = await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol");
  const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
  const selection = retainSyntheticArtifact(f.artifacts, "closure-controller-selection.json", canonicalJSON(f.options.selection));
  const argv = [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), "check-closure-publication",
    "--repo", f.repo, "--source", f.source, "--artifact-root", f.artifacts, "--selection", selection.path, "--selection-sha256", selection.sha256,
    "--cache-root", f.publication.cache_directory, "--entry", f.publication.entry, "--launcher", f.publication.launcher_path, "--settings", f.publication.settings_path,
    "--worker-capture", f.worker.path, "--worker-capture-sha256", f.worker.sha256,
    "--reviewer-capture", f.reviewer.path, "--reviewer-capture-sha256", f.reviewer.sha256,
    "--authority", f.publication.authority.path, "--authority-sha256", f.publication.authority.sha256];
  const env = Object.fromEntries(Object.entries({ ...process.env, PATH: f.publication.path, GH_TOKEN: "synthetic-read-token" })
    .filter((pair): pair is [string, string] => typeof pair[1] === "string"));
  const completion = await executeOwnedProcess({ argv, cwd: f.repo, env, capture: "memory", watched_outputs: [], timeout_ms: 90000,
    stdout: join(f.artifacts, "closure-check.stdout"), stderr: join(f.artifacts, "closure-check.stderr"), started: () => {} });
  expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
  const report = JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString());
  expect(completion.exit_code, JSON.stringify(report.diagnostics)).toBe(0);
  expect(report.closure_publication_check).toMatchObject({ complete: true, authority: "none", plan: { manifest_sha256: f.target.manifest_sha256 } });
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);

test("retained closure resumes an applied close after its local outcome write fails without repeating its explanation", async () => {
  try {
    const { spyOn } = await import("bun:test");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const controller = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts"));
    const original = journal.appendOutcome;
    let injected = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "close-1" && !injected) { injected = true; throw Error("Synthetic crash after native closure before local outcome"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishClosure(f.publication); }
    finally { fault.mockRestore(); }
    expect(injected).toBe(true); expect(pending.state).toBe("pending");
    const delivered = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    expect(delivered.prs[0].state).toBe("closed"); expect(delivered.comments["1"]).toHaveLength(1);
    const resumed = await controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state, JSON.stringify({ reason: resumed.reason })).toBe("complete");
    const repeated = await controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory });
    expect(repeated.state).toBe("complete");
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    const calls = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.filter(call => call.program === "gh" && call.args.includes("PATCH") && call.args.includes("repos/fixture/docs/pulls/1"))).toHaveLength(1);
    expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease")).toBe("");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);

test("edited delivered explanations invalidate original closure recovery even after their text is restored", async () => {
  try {
    const { spyOn } = await import("bun:test");
    const { writeFileSync } = await import("node:fs");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const controller = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts"));
    const append = journal.appendOutcome;
    let injected = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "close-1" && !injected) { injected = true; throw Error("Synthetic lost closure outcome"); }
      return append(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishClosure(f.publication); }
    finally { fault.mockRestore(); }
    expect(injected).toBe(true); expect(pending.state).toBe("pending");
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8")), body = state.comments["1"][0].body;
    state.comments["1"][0].body += "Later owner explanation edit\n";
    writeFileSync(f.service.statePath, JSON.stringify(state));
    await expect(controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory }))
      .rejects.toThrow("Current own closure effect changed");
    const invalidated = journal.readJournal(pending.journal.directory, f.repo);
    expect(invalidated.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    state.comments["1"][0].body = body;
    writeFileSync(f.service.statePath, JSON.stringify(state));
    const resumed = await controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state).toBe("pending"); expect(resumed.reason).toBe("reconciliation-only-no-replay");
    const writes = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] })
      .filter(call => call.program === "gh" && call.args.includes("PATCH") && call.args.includes("repos/fixture/docs/pulls/1"));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease")).toBe("refs/heads/docs-drift-lease");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);


test("closure execution refuses incomplete effect permission and a host controller without fallback", async () => {
  const { retainSyntheticArtifact } = await import("./original-publication-fixture");
  const { canonicalJSON } = await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol");
  const { existsSync } = await import("node:fs");
  const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
  const packet = JSON.parse(readFileSync(join(f.artifacts, f.publication.authority.path), "utf8"));
  packet.effects = [];
  const missing = retainSyntheticArtifact(f.artifacts, "missing-closure-effect-permission.json", canonicalJSON(packet));
  const checked = await checkClosurePublication({ ...f.publication, authority: missing });
  expect(checked.complete).toBe(false); expect(checked.plan).toBeNull();
  expect(checked.diagnostics).toContain("Publication authority exact effects required");
  await expect(publishClosure(f.publication)).rejects.toThrow("Retained executing closure controller required");
  expect(existsSync(join(f.artifacts, "closure-worker.closure-controller.json"))).toBe(false);
  const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  expect(state.prs[0].state).toBe("open"); expect(state.comments).toEqual({});
  expect(git(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease")).toBe("");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);

test("normal retained closure publish and resume commands keep bounded summaries and the original operation", async () => {
  try {
    const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
    const { writeFileSync } = await import("node:fs");
    const { closureCLIArguments } = await import("./original-closure-fixture");
    const { canonicalJSON } = await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const env = Object.fromEntries(Object.entries({ ...process.env, PATH: f.publication.path, GH_TOKEN: "synthetic-read-token" })
      .filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    async function invoke(command: "publish-closure" | "resume-closure", journal?: string) {
      const name = command + (journal ? "-original" : "-new");
      const completion = await executeOwnedProcess({ argv: closureCLIArguments(f, command, journal), cwd: f.repo, env,
        capture: "memory", watched_outputs: [], timeout_ms: 600000, stdout: join(f.artifacts, name + ".stdout"),
        stderr: join(f.artifacts, name + ".stderr"), started: () => {} });
      const { captured, ...metadata } = completion;
      writeFileSync(join(f.artifacts, name + ".stdout"), captured?.stdout ?? new Uint8Array(), { mode: 0o600 });
      writeFileSync(join(f.artifacts, name + ".stderr"), captured?.stderr ?? new Uint8Array(), { mode: 0o600 });
      writeFileSync(join(f.artifacts, name + "-process.json"), canonicalJSON(metadata), { mode: 0o600 });
      expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
      const text = Buffer.from(captured?.stdout ?? []).toString(), report = JSON.parse(text);
      expect(completion.exit_code, JSON.stringify(report.diagnostics)).toBe(0);
      expect(report.command).toBe(command); expect(report.publication_effects.state).toBe("complete");
      expect(text).not.toContain("Superseded after ");
      return report;
    }
    const published = await invoke("publish-closure"), directory = published.publication_effects.journal.directory;
    const resumed = await invoke("resume-closure", directory);
    expect(resumed.publication_effects.journal.directory).toBe(directory);
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 1500000);

test("a mistaken closure resume selection leaves its pending journal unchanged and correct resume can finish", async () => {
  try {
    const { spyOn } = await import("bun:test"), { canonicalDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const controller = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const journal = await import(join(f.adopted.retained.directory, "scripts/docs-drift/journal.ts")), original = journal.appendOutcome;
    let interrupted = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "close-1" && !interrupted) { interrupted = true; throw Error("Synthetic lost local close outcome"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishClosure(f.publication); }
    finally { fault.mockRestore(); }
    expect(interrupted).toBe(true); expect(pending.state).toBe("pending");
    const options = { ...f.publication, journal_directory: pending.journal.directory };
    const journalBefore = canonicalDigest(journal.readJournal(options.journal_directory, f.repo));
    await expect(controller.resumeClosure({ ...options, selection: { ...f.options.selection, consolidation: 999 } }))
      .rejects.toThrow("Original closure controller inputs changed");
    expect(canonicalDigest(journal.readJournal(options.journal_directory, f.repo))).toBe(journalBefore);
    const resumed = await controller.resumeClosure(options);
    expect(resumed.state, JSON.stringify(resumed.reason)).toBe("complete");
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments["1"]).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);

test.each(["authority", "origin"])("changed closure %s bytes persistently invalidate the batch before another effect", async kind => {
  try {
    const { spyOn } = await import("bun:test"), { writeFileSync } = await import("node:fs");
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const controller = await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
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
    try { pending = await controller.publishClosure(f.publication); }
    finally { fault.mockRestore(); }
    expect(changed).toBe(true); expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    expect(state.comments).toEqual({}); expect(state.prs[0].state).toBe("open");
    writeFileSync(path, bytes);
    const callsBefore = readFileSync(f.service.calls, "utf8"), resumed = await controller.resumeClosure({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state).toBe("pending"); expect(resumed.reason).toBe("reconciliation-only-no-replay");
    const later = readFileSync(f.service.calls, "utf8").slice(callsBefore.length).trim().split("\n").filter(Boolean)
      .map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(later.some(call => call.program === "git" && call.args.includes("push") || call.program === "gh"
      && call.args.some(arg => arg.startsWith("repos/")) && call.args.some(arg => ["POST", "PATCH", "PUT", "DELETE"].includes(arg)))).toBe(false);
    expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).comments).toEqual({});
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 600000);
