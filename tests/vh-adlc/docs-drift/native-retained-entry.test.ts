import { expect, spyOn, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService } from "./original-publication-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { git } from "./repository-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

test.each(["published", "never-dispatched"])("normal CLI restores only retained native observations without original local proof: %s", async scenario => {
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
      try { return await publisher.publishPublication(f.publication); } finally { fault.mockRestore(); }
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
    const environment = Object.fromEntries(Object.entries(f.native.environment).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    async function invoke(command: "inspect-retained" | "restore-retained") {
      const argv = [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
        "--repo", f.repo, "--source", f.source, "--artifact-root", root, "--operation-id", original.journal.plan.manifest.operation_id];
      const prefix = join(root, command);
      const result = await executeOwnedProcess({ argv, cwd: f.repo, env: environment, watched_outputs: [], capture: "memory", timeout_ms: 120000,
        stdout: prefix + ".stdout", stderr: prefix + ".stderr", started: pid => writeFileSync(prefix + "-started.json", canonicalJSON({ pid, argv }), { mode: 0o600, flag: "wx" }) });
      const { captured, ...metadata } = result;
      writeFileSync(prefix + ".stdout", captured?.stdout ?? new Uint8Array(), { mode: 0o600, flag: "wx" });
      writeFileSync(prefix + ".stderr", captured?.stderr ?? new Uint8Array(), { mode: 0o600, flag: "wx" });
      writeFileSync(prefix + "-process.json", canonicalJSON(metadata), { mode: 0o600, flag: "wx" });
      const diagnostic = JSON.stringify({ ...metadata, stderr: Buffer.from(captured?.stderr ?? []).toString().slice(0, 512) });
      expect(result.reaped, diagnostic).toBe(true); expect(result.timed_out, diagnostic).toBe(false);
      expect(result.exit_code, diagnostic).toBe(command === "inspect-retained" || scenario === "published" ? 0 : 2);
      return JSON.parse(Buffer.from(captured?.stdout ?? []).toString());
    }
    const inspection = await invoke("inspect-retained");
    expect(inspection.retained_operation.authority).toBe("none"); expect(inspection.retained_operation.replay_authority).toBe(false);
    expect(inspection.retained_operation.historical_review_verified).toBe(false);
    expect(inspection.retained_operation.policy_state).toBe("unavailable-or-changed");
    const restored = await invoke("restore-retained"), summary = restored.retained_operation;
    expect(summary.state).toBe(scenario === "published" ? "complete" : "pending");
    if (scenario === "never-dispatched") expect(summary.reason).toBe("retained-restore-no-replay");
    expect(summary.authority).toBe("none"); expect(summary.replay_authority).toBe(false);
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


test.each(["inspect-retained", "restore-retained"])("normal retained commands reject collector and write-authority flags: %s", command => {
  for (const flag of ["--transport", "--selection", "--authority"]) {
    const result = Bun.spawnSync([process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
      "--repo", "/nonexistent-consumer", "--source", "a".repeat(40), "--artifact-root", "/nonexistent-artifacts", "--operation-id", "operation", flag, "collector"],
      { stdout: "pipe", stderr: "pipe", timeout: 10000 });
    expect(result.exitCode, result.stderr.toString()).toBe(2);
    const report = JSON.parse(result.stdout.toString());
    expect(report.diagnostics).toEqual([{ code: "command-setup-or-input", message: "unknown " + command + " option" }]);
  }
});
