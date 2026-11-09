import { expect, spyOn, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService, retainSyntheticArtifact } from "./original-publication-fixture";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

test("normal retained recovery inspects and acknowledges a changed delivered PR under fresh owner approval", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    const publisher = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journals: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/journal") = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts")), append = journals.appendOutcome;
    const fault = spyOn(journals, "appendOutcome").mockImplementation((journal, id, outcome) => {
      if (id === "publication") throw Error("Synthetic lost delivered PR outcome");
      return append(journal, id, outcome);
    });
    let pending;
    try { pending = await publisher.publishPublication(f.publication); } finally { fault.mockRestore(); }
    expect(pending.state, pending.reason).toBe("pending");
    const state = JSON.parse(readFileSync(service.statePath, "utf8")) as { prs: Array<Record<string, unknown>> };
    state.prs[0].title = "Later owner title"; writeFileSync(service.statePath, JSON.stringify(state), { mode: 0o600 });
    writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), "Preserve changed current settings\n");
    writeFileSync(f.options.launcher_path, "Preserve changed current launcher\n");
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate), journalBefore = journals.readJournal(pending.journal.directory, f.repo).digest;
    const selection = retainSyntheticArtifact(f.artifacts, "recovery-selection.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-selection",
      source_commit: f.source, operation_id: pending.journal.plan.manifest.operation_id, purpose: "acknowledgement",
      acknowledge_effect_ids: ["publication"], retire_effect_ids: [], retirement_lookups: {} }));
    const common = { repo: f.repo, source: f.source, artifact_root: f.artifacts, journal_directory: pending.journal.directory,
      cache_directory: f.options.cache_directory, entry: "copilot", owner: "fixture-owner", run: "fixture-recovery-inspection",
      credential: f.options.credential, path: f.options.path, selection: JSON.parse(readFileSync(join(f.artifacts, selection.path), "utf8")) };
    const recovery = await import(join(f.retained.directory, "scripts/docs-drift/recovery-controller.ts"));
    const inspected = await recovery.inspectRecovery(common);
    expect(inspected.complete, inspected.diagnostics.join("\n")).toBe(true); expect(inspected.authority).toBe("none");
    expect(inspected.scopes).toHaveLength(1); expect(inspected.scopes[0].acknowledgements[0]).toMatchObject({ effect_id: "publication", differences: ["title_sha256"] });
    expect(journals.readJournal(pending.journal.directory, f.repo).digest).toBe(journalBefore);
    const environment = Object.fromEntries(Object.entries(f.native.environment).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    let invocation = 0;
    const invoke = async (command: string, extra: string[] = []) => {
      const argv = [process.execPath, join(f.retained.directory, "scripts/docs-drift/cli.ts"), command, "--repo", f.repo, "--source", f.source,
        "--artifact-root", f.artifacts, "--cache-root", f.options.cache_directory, "--entry", "copilot", "--journal-directory", pending.journal.directory,
        "--selection", selection.path, "--selection-sha256", selection.sha256, ...extra];
      const completion = await executeOwnedProcess({ argv, cwd: f.repo, env: environment, watched_outputs: [], capture: "memory", timeout_ms: 300000,
        stdout: join(f.artifacts, command + "-" + (++invocation) + ".stdout"), stderr: join(f.artifacts, command + "-" + invocation + ".stderr"), started: () => {} });
      expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
      return { completion, report: JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString()) };
    };
    const cliInspection = await invoke("inspect-recovery");
    expect(cliInspection.completion.exit_code, JSON.stringify(cliInspection.report.diagnostics)).toBe(0);
    expect(cliInspection.report.recovery_inspection.scope_sha256s).toEqual(inspected.scope_sha256s);
    expect(journals.readJournal(pending.journal.directory, f.repo).digest).toBe(journalBefore);
    const request = retainSyntheticArtifact(f.artifacts, "current-recovery-owner.txt", Buffer.from("Synthetic current owner approves this displayed exact acknowledgement and owned-lease cleanup, preserving the later title.\n"));
    const authority = retainSyntheticArtifact(f.artifacts, "current-recovery-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority",
      purpose: "acknowledgement", scope_sha256s: inspected.scope_sha256s, origin: { kind: "owner-current-request", artifact: request } }));
    const applied = await invoke("acknowledge-delivery", ["--authority", authority.path, "--authority-sha256", authority.sha256]);
    expect(applied.completion.exit_code, JSON.stringify(applied.report.diagnostics)).toBe(1);
    expect(applied.report.recovery_effects.state).toBe("acknowledged"); expect(applied.report.outcome).toBe("attention");
    const repeated = await invoke("acknowledge-delivery", ["--authority", authority.path, "--authority-sha256", authority.sha256]);
    expect(repeated.completion.exit_code).toBe(1); expect(repeated.report.recovery_effects.state).toBe("acknowledged");
    const final = JSON.parse(readFileSync(service.statePath, "utf8")) as { prs: Array<Record<string, unknown>> };
    expect(final.prs).toHaveLength(1); expect(final.prs[0].title).toBe("Later owner title");
    const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/pulls"))).toHaveLength(1);
    expect(calls.filter(call => call.program === "gh" && call.args.includes("PATCH"))).toHaveLength(0);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native recovery roots", JSON.stringify(roots)); throw error; }
}, 365000);

test("normal retained reconciliation retires absent writes and settles only the original owned lease", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    const publisher = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journals: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/journal") = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const append = journals.appendOutcome, fault = spyOn(journals, "appendOutcome").mockImplementation((journal, id, outcome) => {
      if (id === "receipt") throw Error("Synthetic interruption before candidate and PR delivery");
      return append(journal, id, outcome);
    });
    let pending;
    try { pending = await publisher.publishPublication(f.publication); } finally { fault.mockRestore(); }
    expect(pending.state, pending.reason).toBe("pending");
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const journalBefore = journals.readJournal(pending.journal.directory, f.repo).digest;
    const selection = retainSyntheticArtifact(f.artifacts, "reconciliation-selection.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-selection",
      source_commit: f.source, operation_id: pending.journal.plan.manifest.operation_id, purpose: "reconciliation",
      acknowledge_effect_ids: [], retire_effect_ids: ["candidate", "publication"], retirement_lookups: {} }));
    const environment = Object.fromEntries(Object.entries(f.native.environment).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    let invocation = 0;
    const invoke = async (command: string, extra: string[] = []) => {
      const argv = [process.execPath, join(f.retained.directory, "scripts/docs-drift/cli.ts"), command, "--repo", f.repo, "--source", f.source,
        "--artifact-root", f.artifacts, "--cache-root", f.options.cache_directory, "--entry", "copilot", "--journal-directory", pending.journal.directory,
        "--selection", selection.path, "--selection-sha256", selection.sha256, ...extra];
      const name = "reconciliation-" + (++invocation);
      const completion = await executeOwnedProcess({ argv, cwd: f.repo, env: environment, watched_outputs: [], capture: "memory", timeout_ms: 300000,
        stdout: join(f.artifacts, name + ".stdout"), stderr: join(f.artifacts, name + ".stderr"), started: () => {} });
      expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
      return { completion, report: JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString()) };
    };
    const inspected = await invoke("inspect-recovery"), inspection = inspected.report.recovery_inspection;
    expect(inspected.completion.exit_code, JSON.stringify(inspected.report.diagnostics)).toBe(0);
    expect(inspection.authority).toBe("none"); expect(inspection.scope_sha256s).toHaveLength(1);
    expect(inspection.scopes[0].retire_effect_ids).toEqual(["candidate", "publication"]);
    expect(journals.readJournal(pending.journal.directory, f.repo).digest).toBe(journalBefore);
    const request = retainSyntheticArtifact(f.artifacts, "reconciliation-owner.txt", Buffer.from("Synthetic current owner approves these exact absent-effect retirements and original owned-lease cleanup.\n"));
    const authority = retainSyntheticArtifact(f.artifacts, "reconciliation-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority",
      purpose: "reconciliation", scope_sha256s: inspection.scope_sha256s, origin: { kind: "owner-current-request", artifact: request } }));
    const extra = ["--authority", authority.path, "--authority-sha256", authority.sha256];
    const applied = await invoke("reconcile-publication", extra);
    expect(applied.completion.exit_code, JSON.stringify(applied.report.diagnostics)).toBe(1);
    expect(applied.report.recovery_effects.state).toBe("retired"); expect(applied.report.outcome).toBe("attention");
    const repeated = await invoke("reconcile-publication", extra);
    expect(repeated.completion.exit_code).toBe(1); expect(repeated.report.recovery_effects.state).toBe("retired");
    const final = JSON.parse(readFileSync(service.statePath, "utf8")) as { prs: unknown[] };
    expect(final.prs).toHaveLength(0);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift/native-operation", "refs/heads/docs-drift-lease").toString()).toBe("");
    const journal = journals.readJournal(pending.journal.directory, f.repo);
    expect(journal.events.filter(event => event.kind === "retired-absence").map(event => event.effect_id)).toEqual(["candidate", "publication"]);
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native reconciliation roots", JSON.stringify(roots)); throw error; }
}, 365000);
