import { expect, spyOn, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService } from "./original-publication-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

test("the retained native controller publishes one exact PR and settles its real owned Git lease", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned native fixture roots", JSON.stringify(roots));
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const result = await controller.publishPublication(f.publication);
    expect(result.state, result.reason).toBe("complete");
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(state.prs).toHaveLength(1); expect(state.prs[0]).toMatchObject({ title: "Repair the guide", draft: false, head: { sha: f.head } });
    expect(state.prs[0].labels.map((label: { name: string }) => label.name)).toEqual(["documentation"]);
    expect(readGit(f.origin, "rev-parse", "refs/heads/docs-drift/native-operation").toString().trim()).toBe(f.head);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-receipts/native-operation").toString().trim()).toBe("refs/heads/docs-drift-receipts/native-operation");
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native fixture roots", JSON.stringify(roots)); throw error; }
}, 365000);

test("the normal retained publish CLI delivers its exact approved batch without changing caller work", async () => {
  const roots: string[] = [];
  try {
    const { publicationCLIArguments } = await import("./original-publication-fixture");
    const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
    const { put } = await import("./repository-fixture");
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned native CLI fixture roots", JSON.stringify(roots));
    put(f.repo, "docs/guide.md", "Preserve another source draft\n"); put(f.candidate, "docs/guide.md", "Preserve another candidate draft\n");
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const environment = Object.fromEntries(Object.entries(f.native.environment).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    const completion = await executeOwnedProcess({ argv: publicationCLIArguments(f, "publish"), cwd: f.repo, env: environment, capture: "memory", watched_outputs: [],
      stdout: join(f.artifacts, "native-cli.stdout"), stderr: join(f.artifacts, "native-cli.stderr"), timeout_ms: 300000, started: () => {} });
    const { captured, ...processMetadata } = completion;
    writeFileSync(join(f.artifacts, "native-cli.stdout"), captured?.stdout ?? new Uint8Array(), { mode: 0o600 });
    writeFileSync(join(f.artifacts, "native-cli.stderr"), captured?.stderr ?? new Uint8Array(), { mode: 0o600 });
    writeFileSync(join(f.artifacts, "native-cli-process.json"), canonicalJSON(processMetadata), { mode: 0o600 });
    expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
    expect(completion.exit_code, Buffer.from(completion.captured?.stderr ?? []).toString() + Buffer.from(completion.captured?.stdout ?? []).toString().slice(0, 8192)).toBe(0);
    const report = JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString());
    expect(report.command).toBe("publish"); expect(report.publication_effects.state).toBe("complete");
    const state = JSON.parse(readFileSync(service.statePath, "utf8")); expect(state.prs).toHaveLength(1);
    const retainedJournal = readJournal(report.publication_effects.journal.directory, f.repo);
    const delivered = retainedJournal.plan.manifest.effects.find(effect => effect.kind === "pr-create");
    if (!delivered) throw Error("Missing original reviewed PR effect");
    expect(state.prs[0].body).toBe(delivered.payload.body);
    expect(report.publication_effects.journal.sha256).toBe(retainedJournal.digest);
    expect(JSON.stringify(report)).not.toContain("Exact synthetic source correction");
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native CLI fixture roots", JSON.stringify(roots)); throw error; }
}, 365000);

test("the retained controller resumes a delivered PR after its journal outcome write fails", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned native recovery fixture roots", JSON.stringify(roots));
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const original = journal.appendOutcome;
    let injected = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "publication" && !injected) { injected = true; throw Error("Synthetic failure after complete native PR delivery before its journal outcome"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishPublication(f.publication); }
    finally { fault.mockRestore(); }
    expect(injected).toBe(true); expect(pending.state).toBe("pending");
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(1);
    expect(pending.journal.events.some((event: { kind: string; effect_id: string }) => event.kind === "outcome" && event.effect_id === "publication")).toBe(false);
    const roleFiles = [f.worker.path, f.reviewer.path].map(path => readFileSync(join(f.artifacts, path)));
    const resumed = await controller.resumePublication({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state, resumed.reason).toBe("complete");
    const state = JSON.parse(readFileSync(service.statePath, "utf8")); expect(state.prs).toHaveLength(1);
    const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/pulls"))).toHaveLength(1);
    expect([f.worker.path, f.reviewer.path].map(path => readFileSync(join(f.artifacts, path)))).toEqual(roleFiles);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native recovery roots", JSON.stringify(roots)); throw error; }
}, 365000);

async function changedBindingCase(kind: string) {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned native invalidation fixture roots", JSON.stringify(roots));
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const authorityPath = join(f.artifacts, f.authority.path), authority = readFileSync(authorityPath);
    const original = journal.appendOutcome;
    let changed = false, originalBody = "";
    const mutation = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      const appended = original(current, id, outcome);
      if (!changed && id === (kind === "body" ? "publication" : "lease")) {
        changed = true;
        if (kind === "authority") writeFileSync(authorityPath, Buffer.concat([authority, Buffer.from("\n")]));
        else {
          const state = JSON.parse(readFileSync(service.statePath, "utf8"));
          if (kind === "actor") state.viewer_id = 21;
          else { originalBody = state.prs[0].body; state.prs[0].body += "\nAn external actor changed this published proposal.\n"; }
          writeFileSync(service.statePath, JSON.stringify(state));
        }
      }
      return appended;
    });
    let pending;
    try { pending = await controller.publishPublication(f.publication); }
    finally { mutation.mockRestore(); }
    expect(changed).toBe(true); expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(state.prs).toHaveLength(kind === "body" ? 1 : 0);
    if (kind === "authority") writeFileSync(authorityPath, authority);
    else { if (kind === "actor") state.viewer_id = 20; else state.prs[0].body = originalBody; writeFileSync(service.statePath, JSON.stringify(state)); }
    const writeCount = () => {
      const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
      return calls.filter((call: { program: string; args: string[] }) => {
        const repositoryMutation = call.args.some(arg => arg.startsWith("repos/"))
          && call.args.some(arg => ["POST", "PUT", "PATCH", "DELETE"].includes(arg));
        const readyCommand = call.args[0] === "pr" && call.args[1] === "ready";
        return call.program === "git" && call.args.includes("push") || call.program === "gh" && (repositoryMutation || readyCommand);
      }).length;
    };
    const writes = writeCount();
    const resumed = await controller.resumePublication({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state).toBe("pending"); expect(resumed.reason).toBe("reconciliation-only-no-replay");
    expect(resumed.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    expect(writeCount()).toBe(writes);
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(kind === "body" ? 1 : 0);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString().trim()).toBe("refs/heads/docs-drift-lease");
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native invalidation roots", JSON.stringify(roots)); throw error; }
}

test.each(["authority", "body", "actor"])("the retained native controller invalidates changed binding %s", changedBindingCase, 365000);

test.each(["authority", "actor"])("resume permanently records a binding change first observed after interruption %s", async kind => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned interrupted binding fixture roots", JSON.stringify(roots));
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const original = journal.appendOutcome;
    let interrupted = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "lease" && !interrupted) { interrupted = true; throw Error("Synthetic interruption after lease delivery"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishPublication(f.publication); }
    finally { fault.mockRestore(); }
    expect(interrupted).toBe(true); expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(false);
    const authorityPath = join(f.artifacts, f.authority.path), authority = readFileSync(authorityPath);
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    if (kind === "authority") writeFileSync(authorityPath, Buffer.concat([authority, Buffer.from("\n")]));
    else { state.viewer_id = 21; writeFileSync(service.statePath, JSON.stringify(state)); }
    const options = { ...f.publication, journal_directory: pending.journal.directory };
    await expect(controller.resumePublication(options)).rejects.toThrow();
    const observed = journal.readJournal(options.journal_directory, f.repo);
    expect(observed.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    if (kind === "authority") writeFileSync(authorityPath, authority);
    else { state.viewer_id = 20; writeFileSync(service.statePath, JSON.stringify(state)); }
    const resumed = await controller.resumePublication(options);
    expect(resumed.state).toBe("pending"); expect(resumed.reason).toBe("reconciliation-only-no-replay");
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(0);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved interrupted binding roots", JSON.stringify(roots)); throw error; }
}, 365000);

test.each(["worker", "reviewer"] as const)("a role capture changing after candidate review permanently invalidates the effect gate %s", async selectedRole => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned original-role race roots", JSON.stringify(roots));
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const reviews = await import(join(f.retained.directory, "scripts/docs-drift/candidate-review.ts"));
    const originalOutcome = journal.appendOutcome, originalReview = reviews.collectCandidateReview;
    const path = join(f.artifacts, f[selectedRole].path), originalBytes = readFileSync(path);
    let leased = false, changed = false;
    const outcome = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, result: unknown) => {
      const appended = originalOutcome(current, id, result);
      if (id === "lease") leased = true;
      return appended;
    });
    const race = spyOn(reviews, "collectCandidateReview").mockImplementation(async (options: unknown) => {
      const result = await originalReview(options);
      if (leased && !changed && result.complete) {
        changed = true;
        writeFileSync(path, Buffer.concat([originalBytes, Buffer.from("\n")]));
      }
      return result;
    });
    let pending;
    try { pending = await controller.publishPublication(f.publication); }
    finally { outcome.mockRestore(); race.mockRestore(); }
    expect(changed).toBe(true); expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    writeFileSync(path, originalBytes);
    const resumed = await controller.resumePublication({ ...f.publication, journal_directory: pending.journal.directory });
    expect(resumed.state).toBe("pending"); expect(resumed.reason).toBe("reconciliation-only-no-replay");
    expect(resumed.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(0);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved original-role race roots", JSON.stringify(roots)); throw error; }
}, 365000);

test("native output capacity refusal precedes publication and original resume mutations", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const outputs: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-output") = await import(join(f.retained.directory, "scripts/docs-drift/recovery-output.ts"));
    const project = outputs.publicationEffectsOutput;
    // Inject capacity 1 at the actual projector boundary, preserving every adopted input and original role record.
    const refusal = spyOn(outputs, "publicationEffectsOutput").mockImplementation(options => project({ ...options, limit: 1 }));
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    try {
      const published = await controller.publishPublication(f.publication);
      expect(published.state).toBe("pending");
      expect(published.journal.events.some(event => event.kind === "intent" && event.effect_id === "lease")).toBe(true);
      expect(published.journal.events.some(event => event.kind === "handoff" && event.effect_id === "lease")).toBe(true);
      expect(published.journal.events.some(event => event.kind === "attempt")).toBe(false);
      const assertNoWrites = () => {
        const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
        expect(calls.some(call => call.program === "git" && call.args.includes("push"))).toBe(false);
        expect(calls.some(call => call.program === "gh" && (call.args.includes("PATCH") || call.args.includes("DELETE") || call.args.includes("PUT")
          || call.args.includes("POST") && !call.args.includes("graphql")
          || call.args.includes("graphql") && call.args.some(arg => /mutation\b/u.test(arg))))).toBe(false);
        expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
      };
      assertNoWrites();
      const digest = readJournal(published.journal.directory, f.repo).digest;
      await expect(controller.resumePublication({ ...f.publication, journal_directory: published.journal.directory }))
        .rejects.toThrow("Configured output bound cannot retain the recovery summary");
      assertNoWrites(); expect(readJournal(published.journal.directory, f.repo).digest).toBe(digest);
      expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    } finally { refusal.mockRestore(); }
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native capacity roots", JSON.stringify(roots)); throw error; }
}, 365000);
