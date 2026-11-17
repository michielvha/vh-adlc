import { expect, spyOn, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService } from "./original-publication-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { collectNativeRetained } from "../../../plugins/vh-adlc/scripts/docs-drift/retained-controller";
import { originalClosureFixture } from "./original-closure-fixture";
import { checkClosurePublication } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-controller";

test("the retained native controller publishes one exact PR and settles its real owned Git lease", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned native fixture roots", JSON.stringify(roots));
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const result = await f.invoke(run => controller.publishPublication(f.publication, run));
    expect(result.state, result.reason ?? undefined).toBe("complete");
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

test("the retained controller resumes a delivered PR after its journal outcome write fails", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned native recovery fixture roots", JSON.stringify(roots));
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const original = journal.appendOutcome;
    let injected = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "publication" && !injected) { injected = true; throw Error("Synthetic failure after complete native PR delivery before its journal outcome"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await f.invoke(run => controller.publishPublication(f.publication, run)); }
    finally { fault.mockRestore(); }
    expect(injected).toBe(true); expect(pending.state).toBe("pending");
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(1);
    expect(pending.journal.events.some((event: { kind: string; effect_id: string }) => event.kind === "outcome" && event.effect_id === "publication")).toBe(false);
    const roleFiles = [f.worker.path, f.reviewer.path].map(path => readFileSync(join(f.artifacts, path)));
    const resumed = await f.invoke(run => controller.resumePublication({ ...f.publication, journal_directory: pending.journal.directory }, run));
    expect(resumed.state, resumed.reason ?? undefined).toBe("complete");
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
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
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
    try { pending = await f.invoke(run => controller.publishPublication(f.publication, run)); }
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
    const resumed = await f.invoke(run => controller.resumePublication({ ...f.publication, journal_directory: pending.journal.directory }, run));
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
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const original = journal.appendOutcome;
    let interrupted = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "lease" && !interrupted) { interrupted = true; throw Error("Synthetic interruption after lease delivery"); }
      return original(current, id, outcome);
    });
    let pending;
    try { pending = await f.invoke(run => controller.publishPublication(f.publication, run)); }
    finally { fault.mockRestore(); }
    expect(interrupted).toBe(true); expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(false);
    const authorityPath = join(f.artifacts, f.authority.path), authority = readFileSync(authorityPath);
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    if (kind === "authority") writeFileSync(authorityPath, Buffer.concat([authority, Buffer.from("\n")]));
    else { state.viewer_id = 21; writeFileSync(service.statePath, JSON.stringify(state)); }
    const options = { ...f.publication, journal_directory: pending.journal.directory };
    await expect(f.invoke(run => controller.resumePublication(options, run))).rejects.toThrow();
    const observed = journal.readJournal(options.journal_directory, f.repo);
    expect(observed.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    if (kind === "authority") writeFileSync(authorityPath, authority);
    else { state.viewer_id = 20; writeFileSync(service.statePath, JSON.stringify(state)); }
    const resumed = await f.invoke(run => controller.resumePublication(options, run));
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
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
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
    try { pending = await f.invoke(run => controller.publishPublication(f.publication, run)); }
    finally { outcome.mockRestore(); race.mockRestore(); }
    expect(changed).toBe(true); expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(true);
    writeFileSync(path, originalBytes);
    const resumed = await f.invoke(run => controller.resumePublication({ ...f.publication, journal_directory: pending.journal.directory }, run));
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
      const published = await f.invoke(run => controller.publishPublication(f.publication, run));
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
      await expect(f.invoke(run => controller.resumePublication({ ...f.publication, journal_directory: published.journal.directory }, run)))
        .rejects.toThrow("Configured output bound cannot retain the recovery summary");
      assertNoWrites(); expect(readJournal(published.journal.directory, f.repo).digest).toBe(digest);
      expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    } finally { refusal.mockRestore(); }
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native capacity roots", JSON.stringify(roots)); throw error; }
}, 365000);


test("hosted publication retains native executor IDs for inspection and refuses a different resumed job", async () => {
  const roots: string[] = [];
  try {
    const identities = Object.fromEntries(["hosted", "copilot", "claude", "interactive"].map(entry => [entry, { actor: "fixture-bot", actor_id: 20 }]));
    const f = await originalPublicationFixture(roots, { entry: "hosted", identities }), service = installOwnedNativeService(f);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const missingExecutor = await controller.checkPublication(f.publication);
    expect(missingExecutor.complete).toBe(false);
    expect(missingExecutor.diagnostics.join("\n")).toContain("Hosted executor identity required");
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
    state.workflow_runs = [{ id: 501, run_attempt: 2, workflow_id: f.configured.reports.workflow_id,
      path: f.configured.reports.workflow_path, event: "schedule", status: "in_progress", conclusion: null,
      head_sha: f.source, head_branch: "main", repository, head_repository: repository,
      created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:00:00Z" }];
    writeFileSync(service.statePath, JSON.stringify(state));
    const publication = { ...f.publication, hosted_executor: { run_id: 501, run_attempt: 2 } };
    state.workflow_runs[0].status = "completed";
    writeFileSync(service.statePath, JSON.stringify(state));
    const refused = await controller.checkPublication(publication);
    expect(refused.complete).toBe(false); expect(refused.diagnostics.join("\n")).toContain("native run");
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", f.configured.publication.lease_ref).toString()).toBe("");
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(0);
    state.workflow_runs[0].status = "in_progress";
    writeFileSync(service.statePath, JSON.stringify(state));
    const runReadsBefore = readFileSync(service.calls, "utf8").split("\n").filter(line => line.includes("/actions/runs/501/attempts/2")).length;
    const result = await f.invoke(run => controller.publishPublication(publication, run));
    expect(result.state, result.reason ?? undefined).toBe("complete");
    expect(readFileSync(service.calls, "utf8").split("\n").filter(line => line.includes("/actions/runs/501/attempts/2")).length - runReadsBefore).toBe(1);
    expect(result.journal.plan).toMatchObject({ hosted_executor: publication.hosted_executor });
    const before = readFileSync(service.statePath), refs = readGit(f.origin, "for-each-ref");
    for (const executor of [{ run_id: 502, run_attempt: 2 }, { run_id: 501, run_attempt: 3 }])
      await expect(f.invoke(run => controller.resumePublication({ ...publication, hosted_executor: executor,
        journal_directory: result.journal.directory }, run))).rejects.toThrow("controller inputs changed");
    expect(readFileSync(service.statePath)).toEqual(before); expect(readGit(f.origin, "for-each-ref")).toEqual(refs);
    const inspected = await collectNativeRetained({ repo: f.repo, source: f.source, artifact_root: f.artifacts,
      operation_id: result.journal.plan.manifest.operation_id, owner: "inspection-owner", run: "inspect-hosted",
      credential: f.publication.credential, path: f.publication.path });
    expect(inspected.outcome, JSON.stringify(inspected.diagnostics)).toBe("collected");
    if (!inspected.retained_operation) throw Error("Retained operation inspection required");
    const plan = JSON.parse(readFileSync(join(inspected.retained_operation.inspection_directory, "plan.json"), "utf8"));
    expect(plan.hosted_executor).toEqual(publication.hosted_executor);
    expect(readFileSync(service.statePath)).toEqual(before); expect(readGit(f.origin, "for-each-ref")).toEqual(refs);
    expect(JSON.parse(before.toString()).prs).toHaveLength(1);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved hosted native publication fixture roots", JSON.stringify(roots)); throw error; }
}, 600000);


test("hosted closure seals native executor identity before acquiring its lease", async () => {
  const roots: string[] = [];
  try {
    const identities = Object.fromEntries(["hosted", "copilot", "claude", "interactive"].map(entry => [entry, { actor: "fixture-bot", actor_id: 20 }]));
    const f = await originalClosureFixture(roots, { entry: "hosted", identities });
    const missingExecutor = await checkClosurePublication(f.publication);
    expect(missingExecutor.complete).toBe(false);
    expect(missingExecutor.diagnostics.join("\n")).toContain("Hosted executor identity required");
    const settings = f.snapshot.settings, state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
    state.workflow_runs = [{ id: 501, run_attempt: 2, workflow_id: settings.reports.workflow_id, path: settings.reports.workflow_path,
      event: "workflow_dispatch", status: "in_progress", conclusion: null, head_sha: f.source, head_branch: "main",
      repository, head_repository: repository, created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:00:00Z" }];
    writeFileSync(f.service.statePath, JSON.stringify(state));
    state.workflow_runs[0].status = "completed";
    writeFileSync(f.service.statePath, JSON.stringify(state));
    const refused = await checkClosurePublication({ ...f.publication, hosted_executor: { run_id: 501, run_attempt: 2 } });
    expect(refused.complete).toBe(false); expect(refused.diagnostics.join("\n")).toContain("native run");
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", settings.publication.lease_ref).toString()).toBe("");
    state.workflow_runs[0].status = "in_progress";
    writeFileSync(f.service.statePath, JSON.stringify(state));
    const before = readFileSync(f.service.statePath), refs = readGit(f.origin, "for-each-ref");
    const runReadsBefore = readFileSync(f.service.calls, "utf8").split("\n").filter(line => line.includes("/actions/runs/501/attempts/2")).length;
    const result = await checkClosurePublication({ ...f.publication, hosted_executor: { run_id: 501, run_attempt: 2 } });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    expect(readFileSync(f.service.calls, "utf8").split("\n").filter(line => line.includes("/actions/runs/501/attempts/2")).length - runReadsBefore).toBe(1);
    expect(result.plan).toMatchObject({ hosted_executor: { run_id: 501, run_attempt: 2 }, context: "production", publication_kind: "resolve" });
    expect(readFileSync(f.service.statePath)).toEqual(before); expect(readGit(f.origin, "for-each-ref")).toEqual(refs);
    const calls = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.some(call => call.program === "git" && call.args.includes("push") || call.program === "gh"
      && ["PATCH", "DELETE", "PUT", "POST"].some(method => call.args.includes(method)) && !call.args.includes("graphql"))).toBe(false);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved hosted closure fixture roots", JSON.stringify(roots)); throw error; }
}, 600000);

test("a transient hosted review gap preserves pending recovery without permanent binding invalidation", async () => {
  const roots: string[] = [];
  try {
    const identities = Object.fromEntries(["hosted", "copilot", "claude", "interactive"].map(entry => [entry, { actor: "fixture-bot", actor_id: 20 }]));
    const f = await originalPublicationFixture(roots, { entry: "hosted", identities }), service = installOwnedNativeService(f);
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
    state.workflow_runs = [{ id: 501, run_attempt: 2, workflow_id: f.configured.reports.workflow_id,
      path: f.configured.reports.workflow_path, event: "schedule", status: "in_progress", conclusion: null,
      head_sha: f.source, head_branch: "main", repository, head_repository: repository,
      created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:00:00Z" }];
    writeFileSync(service.statePath, JSON.stringify(state));
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const reviews = await import(join(f.retained.directory, "scripts/docs-drift/candidate-review.ts"));
    const originalOutcome = journal.appendOutcome, originalReview = reviews.collectCandidateReview;
    let acquired = false;
    const outcomeSpy = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      const result = originalOutcome(current, id, outcome);
      if (id === "lease") acquired = true;
      return result;
    });
    const reviewSpy = spyOn(reviews, "collectCandidateReview").mockImplementation(async (...args: unknown[]) => {
      const result = await originalReview(...args);
      return acquired ? { ...result, complete: false, diagnostics: ["Synthetic transient review gap"] } : result;
    });
    let pending;
    try { pending = await f.invoke(run => controller.publishPublication({ ...f.publication, hosted_executor: { run_id: 501, run_attempt: 2 } }, run)); }
    finally { outcomeSpy.mockRestore(); reviewSpy.mockRestore(); }
    expect(acquired).toBe(true);
    expect(pending.state).toBe("pending");
    expect(pending.journal.events.some((event: { kind: string }) => event.kind === "invalidation")).toBe(false);
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(0);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved transient hosted recovery fixture", JSON.stringify(roots)); throw error; }
}, 600000);
