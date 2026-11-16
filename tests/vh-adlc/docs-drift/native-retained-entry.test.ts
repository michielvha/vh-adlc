import { expect, spyOn, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService } from "./original-publication-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { git } from "./repository-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

test.each(["published", "never-dispatched"])("native recovery restores only retained native observations without original local proof: %s", async scenario => {
  // Fail at the missing controller before constructing the expensive native-service fixture.
  const controller = await import("../../../plugins/vh-adlc/scripts/docs-drift/retained-controller");
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    const publisher: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journals: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/journal") = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const append = journals.appendOutcome;
    const fault = spyOn(journals, "appendOutcome").mockImplementation((journal, id, outcome) => {
      if (scenario === "never-dispatched" && journal.plan.manifest.effects.find(effect => effect.id === id)?.kind === "push")
        throw Error("Synthetic lost branch outcome before PR dispatch");
      return append(journal, id, outcome);
    });
    const original = await (async () => {
      try { return await f.invoke(run => publisher.publishPublication(f.publication, run)); } finally { fault.mockRestore(); }
    })();
    expect(original.state, original.reason ?? undefined).toBe(scenario === "published" ? "complete" : "pending");
    if (scenario === "published") {
      git(f.repo, "commit", "--allow-empty", "-m", "Unrelated synthetic continuation");
      const changedSource = git(f.repo, "rev-parse", "HEAD"), refusalRoot = join(f.root, "wrong-source-observations");
      mkdirSync(refusalRoot, { mode: 0o700 });
      await expect(controller.collectNativeRetained({ repo: f.repo, source: changedSource, artifact_root: refusalRoot,
        operation_id: original.journal.plan.manifest.operation_id, owner: "fixture-owner", run: "wrong-source",
        credential: f.options.credential, path: f.options.path })).rejects.toThrow("Retained native original source or operation changed");
      expect(readdirSync(refusalRoot).some(name => name === "docs-drift-" + original.journal.plan.manifest.operation_id || name.startsWith("retained-inspection-"))).toBe(false);
    }
    renameSync(f.artifacts, f.artifacts + "-unavailable");
    renameSync(f.options.cache_directory, f.options.cache_directory + "-unavailable");
    writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), "Preserve unrelated current settings\n");
    const root = join(f.root, "new-observation-artifacts"); mkdirSync(root, { mode: 0o700 });
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const refs = readGit(f.origin, "for-each-ref", "--format=%(refname) %(objectname)");
    const serviceBefore = readFileSync(service.statePath), callsBefore = readFileSync(service.calls).length;
    async function inspect(restore = false) {
      return controller.collectNativeRetained({ repo: f.repo, source: f.source, artifact_root: root,
        operation_id: original.journal.plan.manifest.operation_id, owner: "fixture-owner", run: "retained-observation",
        credential: f.options.credential, path: f.options.path, ...(restore ? { restore: true as const } : {}) });
    }
    const inspection = await inspect();
    expect(inspection.retained_operation.authority).toBe("none"); expect(inspection.retained_operation.replay_authority).toBe(false);
    expect(inspection.retained_operation.historical_review_verified).toBe(false);
    expect(inspection.retained_operation.policy_state).toBe("unavailable-or-changed");
    const restored = await inspect(true), summary = restored.retained_operation;
    expect(summary.state).toBe(scenario === "published" ? "complete" : "pending");
    if (scenario === "never-dispatched") expect(summary.reason).toBe("retained-restore-no-replay");
    expect(summary.authority).toBe("none"); expect(summary.replay_authority).toBe(false);
    if (!summary.journal_directory) throw Error("Restored original journal required");
    const journal = readJournal(summary.journal_directory, f.repo);
    expect(journal.header.recovery_mode).toBe("observation-only"); expect(journal.events.some(event => event.kind === "attempt")).toBe(false);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toEqual(refs);
    expect(readFileSync(service.statePath)).toEqual(serviceBefore);
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    const calls = readFileSync(service.calls).subarray(callsBefore).toString().trim().split("\n").filter(Boolean)
      .map(line => JSON.parse(line) as { program: string; args: string[] });
    const viewerQuery = (call: { program: string; args: string[] }) => call.program === "gh" && call.args.includes("graphql")
      && call.args.includes("POST") && call.args.includes("query=query { viewer { login databaseId } }");
    expect(calls.filter(call => call.program === "gh" && call.args.some(arg => ["POST", "PATCH", "PUT", "DELETE"].includes(arg)) && !viewerQuery(call))).toHaveLength(0);
    expect(calls.filter(call => call.program === "git" && call.args.includes("push"))).toHaveLength(0);
    for (const path of roots) rmSync(path, { recursive: true, force: true });
  } catch (error) { console.error("Preserved owned native retained-entry roots", JSON.stringify(roots)); throw error; }
}, 360000);
