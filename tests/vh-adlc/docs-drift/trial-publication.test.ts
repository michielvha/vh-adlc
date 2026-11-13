import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJournal, sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { readAppliedDelivery } from "../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof";
import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { createTrialTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-transport";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { readTrialPublication } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-publication";
import { loadTrialContext } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { persistTrialTracker, readTrialTracker } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-tracker";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { persistentTrialPublication, syntheticTrialFixture } from "./trial-fixture";
import { git } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("a report flag cannot authorize synthetic publication", () => {
  const f = syntheticTrialFixture(roots);
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const request = join(context.artifacts, "request.json");
  writeFileSync(request, canonicalJSON({ approved: true, transport: "native", repository: "real/consumer" }), { mode: 0o600 });
  expect(() => readTrialPublication(context, request)).toThrow("synthetic publication fields");
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
});

async function publicationRequest(kind: "advisory" | "resolve" = "advisory") {
  const fixture = persistentTrialPublication(roots, { bound_roles: true }), { context } = fixture;
  const { review, policy: originalPolicy } = await fixture.options.gate();
  const policy = { ...originalPolicy, publication_kind: kind };
  const options = { ...fixture.options,
    plan: sealPlan({ reviewed: validateReviewedManifest(review), grants: review.grants, ...policy, corrections: [], attention: [] }),
    gate: async () => ({ review, policy }) };
  function retain(name: string, bytes: Uint8Array) {
    writeFileSync(join(context.artifacts, name), bytes, { mode: 0o600 });
    return { path: name, sha256: sha256(bytes) };
  }
  function role(name: "worker" | "reviewer") {
    const selected = review[name], { captured: _captured, ...process } = selected.process;
    return { native: retain(name + ".jsonl", selected.native), returned: retain(name + ".txt", selected.returned), process };
  }
  const request = { schema_version: 1, kind: "docs-drift-synthetic-publication", context_sha256: context.context_sha256,
    entry: "copilot", publication_kind: kind, plan: retain("plan.json", canonicalJSON(options.plan)), worker: role("worker"), reviewer: role("reviewer") };
  const path = join(context.artifacts, "request.json");
  writeFileSync(path, canonicalJSON(request), { mode: 0o600 });
  return { ...fixture, options, request, path };
}

test("a synthetic request revalidates original role artifacts before every common publisher step", async () => {
  const { f, context, path } = await publicationRequest();
  const options = readTrialPublication(context, path);
  expect(options.plan.adoption_sha256).toBe(context.context_sha256);
  expect(options.transport.kind).toBe("collector");
  const result = await publish(options);
  expect(result.state).toBe("complete");
  expect(git(f.origin, "rev-parse", "refs/heads/docs-drift/persistent")).toBe(f.sourceCommit);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 60000);

test("the common publisher consumes original process artifact references", async () => {
  const { context, request, path } = await publicationRequest();
  const workerBytes = canonicalJSON(request.worker.process), reviewerBytes = canonicalJSON(request.reviewer.process);
  writeFileSync(join(context.artifacts, "worker-process.json"), workerBytes, { mode: 0o600 });
  writeFileSync(join(context.artifacts, "reviewer-process.json"), reviewerBytes, { mode: 0o600 });
  const packet = { ...request, worker: { ...request.worker, process: { path: "worker-process.json", sha256: sha256(workerBytes) } },
    reviewer: { ...request.reviewer, process: { path: "reviewer-process.json", sha256: sha256(reviewerBytes) } } };
  writeFileSync(path, canonicalJSON(packet));
  const publication = readTrialPublication(context, path);
  expect((await publish(publication)).state).toBe("complete");
  writeFileSync(join(context.artifacts, "reviewer-process.json"), canonicalJSON({ ...request.reviewer.process, reaped: false }));
  expect(() => readTrialPublication(context, path)).toThrow("artifact changed");
}, 60000);

test.each(["missing-native", "changed-native", "unreaped", "wrong-context", "escaped-plan", "report-approval"] as const)("synthetic publication refuses %s before effects", async scenario => {
  const { f, context, request, path } = await publicationRequest();
  expect(() => readTrialPublication(context, path)).not.toThrow();
  if (scenario === "missing-native") rmSync(join(context.artifacts, request.worker.native.path));
  if (scenario === "changed-native") writeFileSync(join(context.artifacts, request.worker.native.path), "{}\n");
  if (scenario === "unreaped") request.reviewer.process.reaped = false;
  if (scenario === "wrong-context") request.context_sha256 = "f".repeat(64);
  if (scenario === "escaped-plan") request.plan.path = "../source/README.md";
  if (scenario === "report-approval") Object.assign(request, { approved: true });
  writeFileSync(path, canonicalJSON(request));
  const reason = { "missing-native": "worker.jsonl", "changed-native": "synthetic publication original artifact changed",
    unreaped: "synthetic publication native process incomplete", "wrong-context": "synthetic publication context or entry changed",
    "escaped-plan": "invalid docs-drift protocol path", "report-approval": "synthetic publication fields" }[scenario];
  expect(() => readTrialPublication(context, path)).toThrow(reason);
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 60000);

test("the installed synthetic entry publishes and resumes through the common publisher", async () => {
  const { f, context, path } = await publicationRequest();
  const entry = join(f.runtime, "scripts/docs-drift/trial-entry.ts");
  const args = ["--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--request", path];
  const published = Bun.spawnSync([process.execPath, entry, "publish", ...args], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(published.stdout.toString());
  expect(published.exitCode).toBe(0);
  expect(report.outcome).toBe("complete");
  expect(report.data.state).toBe("complete");
  expect(report.context_sha256).toBe(context.context_sha256);
  expect(report.data.request_sha256).toBe(sha256(readFileSync(path)));
  const tracker = readTrialTracker(context);
  const resumed = Bun.spawnSync([process.execPath, entry, "resume-effects", ...args, "--journal", report.data.journal_directory],
    { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  expect(resumed.exitCode).toBe(0);
  expect(JSON.parse(resumed.stdout.toString()).data.state).toBe("complete");
  expect(readTrialTracker(context).commit).toBe(tracker.commit);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 90000);

test("a changed original role artifact stops the next write and retains recovery refs", async () => {
  const { f, context, request, path } = await publicationRequest();
  const options = readTrialPublication(context, path), execute = options.transport.execute;
  const attempts: string[] = [];
  options.transport.execute = async (...args) => {
    attempts.push(args[1].id);
    const result = await execute(...args);
    writeFileSync(join(context.artifacts, request.worker.native.path), "{}\n");
    return result;
  };
  const result = await publish(options);
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("current-proof-or-effect-unavailable");
  expect(attempts).toEqual(["lease"]);
  expect(readTrialTracker(context).resources.size).toBe(0);
  if (!result.objects.lease_object || !result.objects.receipt_object) throw Error("missing owned recovery objects");
  expect(git(f.origin, "rev-parse", context.settings.publication.lease_ref)).toBe(result.objects.lease_object);
  expect(git(f.origin, "rev-parse", context.settings.publication.receipt_ref_prefix + options.plan.manifest.operation_id)).toBe(result.objects.receipt_object);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 60000);

test("the installed synthetic entry resumes an interrupted applied creation without a duplicate", async () => {
  const { f, context, path } = await publicationRequest();
  const entry = join(f.runtime, "scripts/docs-drift/trial-entry.ts");
  const args = ["--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--request", path];
  const interrupted = Bun.spawnSync([process.execPath, entry, "publish", ...args, "--interrupt-after", "pr"],
    { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(interrupted.stdout.toString());
  expect(interrupted.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.data.state).toBe("pending");
  expect(report.data.interruption_effect_id).toBe("pr");
  const tracker = readTrialTracker(context);
  expect(tracker.resources.size).toBe(1);
  const resumed = Bun.spawnSync([process.execPath, entry, "resume-effects", ...args, "--journal", report.data.journal_directory],
    { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  expect(resumed.exitCode).toBe(0);
  expect(JSON.parse(resumed.stdout.toString()).data.state).toBe("complete");
  expect(readTrialTracker(context).commit).toBe(tracker.commit);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 90000);

test.each(["approved", "standing-procedure", "changed-scope", "missing-proof", "foreign-lease"] as const)("installed recovery presents an exact scope and preserves an edited delivery (%s)", async approval => {
  const { f, context, options, path } = await publicationRequest("resolve");
  const publication = readTrialPublication(context, path), execute = publication.transport.execute;
  expect(publication.plan.publication_kind).toBe("resolve");
  publication.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (args[1].id === "pr") throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
    return captured;
  };
  const interrupted = await publish(publication);
  if (!interrupted.objects.lease_object || !interrupted.objects.receipt_object) throw Error("missing owned recovery objects");
  const tracker = readTrialTracker(context), resource = tracker.resources.get("pulls/501");
  if (!resource) throw Error("missing applied synthetic PR");
  resource.body += "\nSynthetic owner edit"; persistTrialTracker(context, tracker);
  const selectionPath = join(context.artifacts, "ack-selection.json");
  writeFileSync(selectionPath, canonicalJSON({ schema_version: 1, kind: "docs-drift-synthetic-acknowledgement-selection",
    context_sha256: context.context_sha256, journal_directory: interrupted.journal.directory,
    acknowledge_effect_ids: ["pr"], retire_effect_ids: [] }), { mode: 0o600 });
  const entry = join(f.runtime, "scripts/docs-drift/trial-entry.ts");
  const args = ["--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--selection", selectionPath];
  const refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"), trackerCommit = readTrialTracker(context).commit;
  const prepared = Bun.spawnSync([process.execPath, entry, "prepare-acknowledgement", ...args], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(prepared.stdout.toString());
  expect(prepared.exitCode).toBe(2);
  expect(report.data.state).toBe("pending");
  expect(report.data.scope.context).toBe("trial");
  expect(report.data.scope.acknowledgements[0].effect_id).toBe("pr");
  expect(report.data.scope_sha256).toBe(sha256(canonicalJSON(report.data.scope)));
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
  expect(readTrialTracker(context).commit).toBe(trackerCommit);
  if (approval === "changed-scope") {
    const current = readTrialTracker(context);
    const changed = current.resources.get("pulls/501");
    if (!changed) throw Error("missing applied synthetic PR");
    changed.body += "\nLater owner edit"; resource.body = changed.body;
    persistTrialTracker(context, current);
  }
  let missingProof: string | null = null;
  if (approval === "missing-proof") {
    const captured = readAppliedDelivery({ source_repo: context.source, journal_directory: interrupted.journal.directory,
      effect_id: "pr", settings: context.settings, transport: "collector" });
    missingProof = captured.successes[0].path;
    rmSync(missingProof);
  }
  if (approval === "foreign-lease") git(f.origin, "update-ref", context.settings.publication.lease_ref, f.sourceCommit);
  const preserved = readTrialTracker(context).commit;
  const ownerRequest = join(context.artifacts, "owner-current-request.json");
  writeFileSync(ownerRequest, canonicalJSON({ schema_version: 1, kind: "docs-drift-synthetic-owner-request",
    context_sha256: context.context_sha256, source: approval === "standing-procedure" ? "adopted-procedure" : "owner-current-request", scope_sha256: report.data.scope_sha256 }), { mode: 0o600 });
  const acknowledged = Bun.spawnSync([process.execPath, entry, "acknowledge-delivery", ...args, "--owner-request", ownerRequest],
    { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const result = JSON.parse(acknowledged.stdout.toString());
  expect(acknowledged.exitCode).toBe(2);
  expect(result.outcome).toBe("incomplete");
  expect(result.data.state).toBe(approval === "approved" ? "acknowledged" : "pending");
  if (approval === "approved") expect(result.data.reason).toBeNull();
  else if (approval === "standing-procedure" || approval === "changed-scope") {
    expect(result.data.reason).toBe("synthetic acknowledgement exact current owner request required");
    expect(result.data.scope?.kind).toBe("docs-drift-delivery-acknowledgement");
    if (approval === "standing-procedure") expect(result.data.scope_sha256).toBe(report.data.scope_sha256);
    else expect(result.data.scope_sha256).not.toBe(report.data.scope_sha256);
  } else {
    expect(result.data.reason).toContain(approval === "foreign-lease" ? "acknowledgement-owned-lease-changed" : missingProof);
    expect(result.data.scope).toBeNull();
  }
  const journal = readJournal(interrupted.journal.directory, context.source);
  expect(journal.plan.publication_kind).toBe("resolve");
  expect(journal.events.some(event => event.kind === "acknowledged-delivery")).toBe(approval === "approved");
  expect(journal.events.filter(event => event.effect_id === "release" && event.kind === "attempt").length).toBe(approval === "approved" ? 1 : 0);
  expect(readTrialTracker(context).commit).toBe(preserved);
  expect(readTrialTracker(context).resources.get("pulls/501")?.body).toBe(resource.body);
  const transport = createTrialTransport(context);
  expect(await transport.ref(context.settings.publication.lease_ref)).toEqual(approval === "approved" ? { state: "absent" }
    : { state: "present", object: approval === "foreign-lease" ? f.sourceCommit : interrupted.objects.lease_object });
  expect(await transport.ref(context.settings.publication.receipt_ref_prefix + options.plan.manifest.operation_id)).toEqual({ state: "present", object: interrupted.objects.receipt_object });
  expect(git(f.source, "status", "--porcelain")).toBe("");
  if (approval === "approved") {
    const resumed = Bun.spawnSync([process.execPath, entry, "resume-effects", "--synthetic-trial", f.root, "--context-commit", f.contextCommit,
      "--request", path, "--journal", interrupted.journal.directory], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
    expect(resumed.exitCode).toBe(2);
    expect(JSON.parse(resumed.stdout.toString()).data.state).toBe("acknowledged");
    expect(readTrialTracker(context).commit).toBe(preserved);
  }
}, 120000);

test("publication receipts bind the validated request and a same-plan request change stops the gate", async () => {
  const { context, request, path } = await publicationRequest();
  const original = sha256(readFileSync(path)), publication = readTrialPublication(context, path);
  expect(publication.request_sha256).toBe(original);
  request.entry = "claude";
  writeFileSync(path, canonicalJSON(request));
  expect(publication.request_sha256).toBe(original);
  await expect(publication.gate(null)).rejects.toThrow("synthetic publication request changed");
});

test("a request publication kind must match its sealed plan", async () => {
  const { f, context, request, path } = await publicationRequest();
  Object.assign(request, { publication_kind: "resolve" });
  writeFileSync(path, canonicalJSON(request));
  expect(() => readTrialPublication(context, path)).toThrow("current policy unavailable or changed");
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
});

test("installed recovery entries refuse outside, nested and linked journals without changing fixture state", async () => {
  const { f, context, path } = await publicationRequest();
  const publication = await publish(readTrialPublication(context, path));
  expect(publication.state).toBe("complete");
  const refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"), tracker = readTrialTracker(context).commit;
  const nested = join(context.artifacts, "nested"); mkdirSync(nested, { mode: 0o700 });
  for (const scenario of ["outside", "nested", "linked"] as const) {
    const journal = scenario === "outside" ? join(f.root, "evidence", "outside-journal")
      : scenario === "nested" ? join(nested, "journal") : join(context.artifacts, "linked-journal");
    if (scenario === "linked") symlinkSync(publication.journal.directory, journal);
    else cpSync(publication.journal.directory, journal, { recursive: true });
    const selection = join(context.artifacts, "confined-selection.json"), owner = join(context.artifacts, "confined-owner-request.json");
    writeFileSync(selection, canonicalJSON({ schema_version: 1, kind: "docs-drift-synthetic-acknowledgement-selection",
      context_sha256: context.context_sha256, journal_directory: journal, acknowledge_effect_ids: ["pr"], retire_effect_ids: [] }), { mode: 0o600 });
    writeFileSync(owner, canonicalJSON({ schema_version: 1, kind: "docs-drift-synthetic-owner-request",
      context_sha256: context.context_sha256, source: "owner-current-request", scope_sha256: "f".repeat(64) }), { mode: 0o600 });
    for (const command of ["resume-effects", "prepare-acknowledgement", "acknowledge-delivery", "prepare-reconciliation", "reconcile-publication"] as const) {
      const reconciliation = command === "prepare-reconciliation" || command === "reconcile-publication";
      writeFileSync(selection, canonicalJSON(reconciliation
        ? { schema_version: 1, kind: "docs-drift-synthetic-reconciliation-selection", context_sha256: context.context_sha256,
          journal_directory: journal, retire_effect_ids: ["pr"], retirement_lookups: {} }
        : { schema_version: 1, kind: "docs-drift-synthetic-acknowledgement-selection", context_sha256: context.context_sha256,
          journal_directory: journal, acknowledge_effect_ids: ["pr"], retire_effect_ids: [] }));
      const args = command === "resume-effects" ? ["--request", path, "--journal", journal]
        : ["--selection", selection, ...(["acknowledge-delivery", "reconcile-publication"].includes(command) ? ["--owner-request", owner] : [])];
      const result = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), command,
        "--synthetic-trial", f.root, "--context-commit", f.contextCommit, ...args],
        { stdout: "pipe", stderr: "pipe", timeout: 45000 });
      const report = JSON.parse(result.stdout.toString());
      expect(result.exitCode).toBe(2);
      expect(report.outcome).toBe("refused");
      // The context rejects every linked fixture input before any entry reads a journal.
      const reason = scenario === "linked" ? "foreign or linked fixture input" : command === "resume-effects"
        ? "synthetic journal outside owned artifacts" : reconciliation ? "synthetic reconciliation context or journal changed" : "synthetic acknowledgement context or journal changed";
      expect(report.diagnostics[0].message).toContain(reason);
      expect(readTrialTracker(context).commit).toBe(tracker);
      expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
    }
    rmSync(journal, { recursive: true });
    expect(readTrialTracker(context).commit).toBe(tracker);
    expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
  }
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 180000);

test.each(["approved", "missing", "wrong-purpose", "foreign-lease"])("installed trial reconciliation uses the common recovery authority and preserves non-success: %s", async approval => {
  const { f, context, path } = await publicationRequest(), publication = readTrialPublication(context, path), execute = publication.transport.execute;
  publication.transport.execute = async (...args) => {
    if (args[1].id === "pr") throw new PublicationExecutionError(false, true);
    return execute(...args);
  };
  const pending = await publish(publication);
  expect(pending.state).toBe("pending");
  const selection = join(context.artifacts, "reconciliation-selection.json");
  writeFileSync(selection, canonicalJSON({ schema_version: 1, kind: "docs-drift-synthetic-reconciliation-selection",
    context_sha256: context.context_sha256, journal_directory: pending.journal.directory, retire_effect_ids: ["pr"], retirement_lookups: {} }), { mode: 0o600 });
  const entry = join(f.runtime, "scripts/docs-drift/trial-entry.ts"), args = ["--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--selection", selection];
  const journalBefore = readJournal(pending.journal.directory, context.source), trackerBefore = readTrialTracker(context).commit;
  const refsBefore = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)");
  const inspected = Bun.spawnSync([process.execPath, entry, "prepare-reconciliation", ...args], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(inspected.stdout.toString());
  expect(inspected.exitCode).toBe(2);
  expect(report.data, JSON.stringify(report)).toBeDefined();
  expect(report.data.state).toBe("pending"); expect(report.data.reason).toBe("inspection-only");
  expect(report.data.scopes).toHaveLength(1);
  expect(report.data.scopes[0].retire_effect_ids).toEqual(["pr"]);
  expect(readJournal(pending.journal.directory, context.source)).toEqual(journalBefore);
  expect(readTrialTracker(context).commit).toBe(trackerBefore);
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refsBefore);
  const originBytes = Buffer.from("Synthetic actual current owner request approves only the presented known-absence retirement and owned lease settlement.\n");
  writeFileSync(join(context.artifacts, "reconciliation-owner.txt"), originBytes, { mode: 0o600 });
  const authority = join(context.artifacts, "reconciliation-owner.json");
  writeFileSync(authority, canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority", purpose: approval === "wrong-purpose" ? "acknowledgement" : "reconciliation",
    scope_sha256s: report.data.scope_sha256s, origin: { kind: "owner-current-request", artifact: { path: "reconciliation-owner.txt", sha256: sha256(originBytes) } } }), { mode: 0o600 });
  if (approval === "foreign-lease") git(f.origin, "update-ref", context.settings.publication.lease_ref, f.sourceCommit);
  const beforeApply = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)");
  const applied = Bun.spawnSync([process.execPath, entry, "reconcile-publication", ...args,
    ...(approval === "missing" ? [] : ["--owner-request", authority])], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const result = JSON.parse(applied.stdout.toString());
  expect(applied.exitCode).toBe(2);
  if (approval === "missing") expect(result.outcome).toBe("refused");
  else expect(result.data.state, JSON.stringify(result)).toBe(approval === "approved" ? "retired" : "pending");
  const journal = readJournal(pending.journal.directory, context.source);
  expect(journal.events.some(event => event.kind === "retired-absence" && event.effect_id === "pr")).toBe(approval === "approved");
  expect(journal.events.some(event => event.kind === "outcome" && event.effect_id === "pr")).toBe(false);
  expect(readTrialTracker(context).commit).toBe(trackerBefore);
  if (approval === "approved") {
    expect(git(f.origin, "for-each-ref", "--format=%(refname)", context.settings.publication.lease_ref)).toBe("");
    const repeated = Bun.spawnSync([process.execPath, entry, "reconcile-publication", ...args, "--owner-request", authority], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
    expect(repeated.exitCode).toBe(2); expect(JSON.parse(repeated.stdout.toString()).data.state).toBe("retired");
  } else expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(beforeApply);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 180000);
