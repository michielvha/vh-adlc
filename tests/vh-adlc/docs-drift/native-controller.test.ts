import { expect, spyOn, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService } from "./original-publication-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
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
    expect(state.prs[0].body).toBe(report.publication_effects.journal.plan.manifest.effects.find((effect: { kind: string }) => effect.kind === "pr-create").payload.body);
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
