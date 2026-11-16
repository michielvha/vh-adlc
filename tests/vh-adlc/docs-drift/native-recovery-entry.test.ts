import { expect, spyOn, test } from "bun:test";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService, retainSyntheticArtifact } from "./original-publication-fixture";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

test("original retained recovery inspects and acknowledges a changed delivered PR under fresh owner approval", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    const publisher: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journals: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/journal") = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts")), append = journals.appendOutcome;
    const fault = spyOn(journals, "appendOutcome").mockImplementation((journal, id, outcome) => {
      if (id === "publication") throw Error("Synthetic lost delivered PR outcome");
      return append(journal, id, outcome);
    });
    let pending;
    try { pending = await f.invoke(run => publisher.publishPublication(f.publication, run)); } finally { fault.mockRestore(); }
    expect(pending.state, pending.reason ?? undefined).toBe("pending");
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
    const hostRecovery = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller");
    const artifactsBeforeRefusal = readdirSync(f.artifacts).sort();
    await expect(hostRecovery.applyRecovery({ ...common, entry: "copilot", purpose: "acknowledgement", authority: {} }))
      .rejects.toThrow("Original run required for version-two recovery");
    expect(readdirSync(f.artifacts).sort()).toEqual(artifactsBeforeRefusal);
    const recovery: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller") = await import(join(f.retained.directory, "scripts/docs-drift/recovery-controller.ts"));
    const inspected = await recovery.inspectRecovery(common);
    expect(inspected.complete, inspected.diagnostics.join("\n")).toBe(true); expect(inspected.authority).toBe("none");
    expect(inspected.scopes).toHaveLength(1);
    const acknowledgement = inspected.scopes[0];
    if (!("acknowledgements" in acknowledgement)) throw Error("Acknowledgement scope required");
    expect(acknowledgement.acknowledgements[0]).toMatchObject({ effect_id: "publication", differences: ["title_sha256"] });
    expect(journals.readJournal(pending.journal.directory, f.repo).digest).toBe(journalBefore);
    const recasedState = JSON.parse(readFileSync(service.statePath, "utf8")) as { viewer_login: string };
    recasedState.viewer_login = "Fixture-Bot"; writeFileSync(service.statePath, JSON.stringify(recasedState), { mode: 0o600 });
    const recased = await recovery.inspectRecovery(common);
    expect(recased.complete, recased.diagnostics.join("\n")).toBe(true);
    expect(recased.scopes[0]).toMatchObject({ actor: "Fixture-Bot", actor_id: pending.journal.plan.manifest.actor_id });
    expect(inspected.scopes[0]).toMatchObject({ actor: pending.journal.plan.manifest.actor, actor_id: pending.journal.plan.manifest.actor_id });
    expect(journals.readJournal(pending.journal.directory, f.repo).digest).toBe(journalBefore);
    const request = retainSyntheticArtifact(f.artifacts, "current-recovery-owner.txt", Buffer.from("Synthetic current owner approves this displayed exact acknowledgement and owned-lease cleanup, preserving the later title.\n"));
    const authority = retainSyntheticArtifact(f.artifacts, "current-recovery-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority",
      purpose: "acknowledgement", scope_sha256s: recased.scope_sha256s, origin: { kind: "owner-current-request", artifact: request } }));
    const applied = await f.invoke(run => recovery.applyRecovery({ ...common, purpose: "acknowledgement", authority }, run));
    expect(applied.state, JSON.stringify(applied)).toBe("acknowledged");
    const repeated = await f.invoke(run => recovery.applyRecovery({ ...common, purpose: "acknowledgement", authority }, run));
    expect(repeated.state).toBe("acknowledged");
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs[0].title).toBe("Later owner title");
    // The original resume route must retain the acknowledged status even after its old payload returns.
    const restored = JSON.parse(readFileSync(service.statePath, "utf8")) as { prs: Array<Record<string, unknown>> };
    restored.prs[0].title = pending.journal.plan.manifest.effects.find(effect => effect.id === "publication")!.payload.title;
    writeFileSync(service.statePath, JSON.stringify(restored), { mode: 0o600 });
    writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), readGit(f.repo, "show", f.source + ":.vh-adlc/docs-drift.yaml"));
    writeFileSync(f.options.launcher_path, readGit(f.repo, "show", f.source + ":" + f.options.launcher_path.slice(f.repo.length + 1)));
    const resumeBefore = captureRepositoryState(f.repo);
    const resumed = await f.invoke(run => publisher.resumePublication({ ...f.publication, journal_directory: pending.journal.directory }, run));
    expect(resumed.state, resumed.reason ?? undefined).toBe("acknowledged");
    expect(captureRepositoryState(f.repo)).toEqual(resumeBefore);
    const final = JSON.parse(readFileSync(service.statePath, "utf8")) as { prs: Array<Record<string, unknown>> };
    expect(final.prs).toHaveLength(1); expect(final.prs[0].title).toBe(restored.prs[0].title);
    const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/pulls"))).toHaveLength(1);
    expect(calls.filter(call => call.program === "gh" && call.args.includes("PATCH"))).toHaveLength(0);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
    expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native recovery roots", JSON.stringify(roots)); throw error; }
}, 365000);

test("original retained reconciliation retires absent writes and settles only the original owned lease", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    const publisher: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journals: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/journal") = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const append = journals.appendOutcome, fault = spyOn(journals, "appendOutcome").mockImplementation((journal, id, outcome) => {
      if (id === "receipt") throw Error("Synthetic interruption before candidate and PR delivery");
      return append(journal, id, outcome);
    });
    let pending;
    try { pending = await f.invoke(run => publisher.publishPublication(f.publication, run)); } finally { fault.mockRestore(); }
    expect(pending.state, pending.reason ?? undefined).toBe("pending");
    const currentSettings = JSON.parse(readGit(f.repo, "show", f.source + ":.vh-adlc/docs-drift.yaml").toString());
    const currentProcedure = "docs/recovery-procedure.md";
    currentSettings.project_procedure = currentProcedure;
    const procedure = Buffer.from("---\ndocs_drift_reconciliation:\n  repository: fixture/docs\n  operation_prefix: native-\n  lease_ref: refs/heads/docs-drift-lease\n  receipt_ref_prefix: refs/heads/docs-drift-receipts/\n  effects: [absence-retirement, receipt-retention, owned-lease-release]\n---\n\nSynthetic current adopted reconciliation permission.\n");
    writeFileSync(join(f.repo, currentProcedure), procedure);
    writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), JSON.stringify(currentSettings));
    readGit(f.repo, "add", "--", currentProcedure, ".vh-adlc/docs-drift.yaml");
    readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "move current recovery procedure");
    const currentDefault = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
    readGit(f.repo, "push", f.origin, "HEAD:refs/heads/main");
    const currentState = JSON.parse(readFileSync(service.statePath, "utf8"));
    currentState.commit = currentDefault; currentState.tree = readGit(f.repo, "rev-parse", "HEAD^{tree}").toString().trim();
    writeFileSync(service.statePath, JSON.stringify(currentState), { mode: 0o600 });
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const journalBefore = journals.readJournal(pending.journal.directory, f.repo).digest;
    const selection = retainSyntheticArtifact(f.artifacts, "reconciliation-selection.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-selection",
      source_commit: f.source, operation_id: pending.journal.plan.manifest.operation_id, purpose: "reconciliation",
      acknowledge_effect_ids: [], retire_effect_ids: ["candidate", "publication"], retirement_lookups: {} }));
    const recovery: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller") = await import(join(f.retained.directory, "scripts/docs-drift/recovery-controller.ts"));
    const common = { repo: f.repo, source: f.source, artifact_root: f.artifacts, journal_directory: pending.journal.directory,
      cache_directory: f.options.cache_directory, entry: "copilot", owner: "fixture-owner", run: "fixture-reconciliation",
      credential: f.options.credential, path: f.options.path, selection: JSON.parse(readFileSync(join(f.artifacts, selection.path), "utf8")) };
    const inspection = await recovery.inspectRecovery(common);
    expect(inspection.complete, inspection.diagnostics.join("\n")).toBe(true);
    expect(inspection.authority).toBe("none"); expect(inspection.scope_sha256s).toHaveLength(1);
    expect(inspection.scopes[0]).toHaveProperty("retire_effect_ids");
    expect("retire_effect_ids" in inspection.scopes[0] ? inspection.scopes[0].retire_effect_ids : null).toEqual(["candidate", "publication"]);
    expect(journals.readJournal(pending.journal.directory, f.repo).digest).toBe(journalBefore);
    const authority = retainSyntheticArtifact(f.artifacts, "reconciliation-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority",
      purpose: "reconciliation", scope_sha256s: inspection.scope_sha256s, origin: { kind: "adopted-procedure", commit: currentDefault,
        path: currentProcedure, sha256: (await import("../../../plugins/vh-adlc/scripts/docs-drift/protocol")).sha256(procedure) } }));
    const applied = await f.invoke(run => recovery.applyRecovery({ ...common, purpose: "reconciliation", authority }, run));
    expect(applied.state, JSON.stringify(applied)).toBe("retired");
    const repeated = await f.invoke(run => recovery.applyRecovery({ ...common, purpose: "reconciliation", authority }, run));
    expect(repeated.state).toBe("retired");
    const final = JSON.parse(readFileSync(service.statePath, "utf8")) as { prs: unknown[] };
    expect(final.prs).toHaveLength(0);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift/native-operation", "refs/heads/docs-drift-lease").toString()).toBe("");
    const journal = journals.readJournal(pending.journal.directory, f.repo);
    expect(journal.events.filter(event => event.kind === "retired-absence").map(event => event.effect_id)).toEqual(["candidate", "publication"]);
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native reconciliation roots", JSON.stringify(roots)); throw error; }
}, 365000);
