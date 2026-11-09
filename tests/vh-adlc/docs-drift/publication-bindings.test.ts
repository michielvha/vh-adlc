import { afterAll, expect, spyOn, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as artifacts from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import type { WorkerCollectionOptions } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { verifyCandidate } from "../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { nativeReader, runtimeFixture } from "./runtime-fixture";
import { commitAll, git, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
async function fixture(incompleteInventory: boolean, options: {
  sourceInsideCandidate?: boolean; sourceCheckNeedsRepair?: boolean; mutableInventory?: boolean; role?: Parameters<typeof runtimeFixture>[3];
  beforeCandidate?: (input: { repo: string; source: string; artifacts: string; baseline: Awaited<ReturnType<typeof verifyCandidate>>; selection: unknown; decisions: Uint8Array; worker_options: WorkerCollectionOptions }) => void | Promise<void>;
} = {}) {
  const { sourceInsideCandidate = false, sourceCheckNeedsRepair = false, beforeCandidate } = options;
  const f = await runtimeFixture(roots, true, false, options.role), repo = f.repo;
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify("none")).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  put(repo, "scripts/scan.js", scanner); put(repo, "docs/suppressions.yaml", "suppressions: []\n");
  put(repo, "tests/docs/fixture.test.ts", sourceCheckNeedsRepair
    ? `import { expect, test } from "bun:test";\ntest("guide repaired", () => expect(require("node:fs").readFileSync("docs/guide.md", "utf8")).toBe("# Current candidate guide\\n"));\n`
    : `import { expect, test } from "bun:test";\ntest("guide exists", () => expect(require("node:fs").existsSync("docs/guide.md")).toBe(true));\n`);
  const source = commitAll(repo), candidate = join(f.root, "binding-candidate"), origin = join(f.root, "binding-origin"), artifacts = sourceInsideCandidate ? f.root : join(f.root, "binding-artifacts");
  if (!sourceInsideCandidate) mkdirSync(artifacts, { mode: 0o700 });
  git(f.root, "clone", "--no-local", "--no-checkout", repo, origin); git(origin, "update-ref", "refs/heads/main", source);
  let head = "";
  if (sourceInsideCandidate) {
    git(f.root, "clone", "--no-local", "--no-checkout", repo, candidate); git(candidate, "checkout", "--detach", source);
    put(candidate, "docs/guide.md", "# Current candidate guide\n"); head = commitAll(candidate);
  }
  const preimage = readFileSync(join(repo, "docs/guide.md")), replacement = Buffer.from("# Current candidate guide\n");
  const selection = { schema_version: 1 as const, source_commit: source, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace" as const, start: 0,
    end: preimage.length, before_sha256: sha256(preimage), replacement_base64: replacement.toString("base64"), after_mode: "100644" as const }] };
  const common = { artifact_root: artifacts, owner: "fixture-owner", run: "fixture-run" };
  const sourceArtifacts = sourceInsideCandidate ? join(candidate, "baseline-proof") : artifacts;
  if (sourceInsideCandidate) chmodSync(candidate, 0o700);
  if (sourceInsideCandidate) mkdirSync(sourceArtifacts, { mode: 0o700 });
  const baseline = await verifyCandidate({ ...common, artifact_root: sourceArtifacts, repo, source, candidate_repo: repo, candidate: source,
    selection: { schema_version: 1, source_commit: source, edits: [] } });
  if (sourceInsideCandidate) {
    if (!baseline.scan_artifacts || !baseline.evidence || !baseline.record_path) throw Error("missing baseline proof fixture");
    const references = [...Object.values(baseline.scan_artifacts), ...baseline.commands.flatMap(command => [command.start, command.stdout, command.stderr, command.completion])];
    for (const ref of references) if (ref) ref.path = relative(artifacts, join(sourceArtifacts, ref.path));
    const { evidence: _evidence, ...payload } = baseline, bytes = canonicalJSON(payload);
    writeFileSync(baseline.record_path, bytes, { mode: 0o600 });
    baseline.evidence = { path: relative(artifacts, baseline.record_path), sha256: sha256(bytes) };
  }
  const decisions = { schema_version: 1, kind: "docs-drift-decisions", mode: "advisory", source_commit: source,
    selected_proposals: [], decisions: [{ id: "guide-fix", reason: "Synthetic source-based candidate" }], attention: [] };
  const decisionBytes = canonicalJSON(decisions); writeFileSync(join(artifacts, "decisions.json"), decisionBytes, { mode: 0o600 });
  const inventoryFile = join(f.root, "binding-native-inventory.json");
  if (options.mutableInventory) writeFileSync(inventoryFile, "[]", { mode: 0o600 });
  const native = nativeReader({ ...f, candidate: source, inventory_path: options.mutableInventory ? inventoryFile : undefined }, "fixture-bot", false, incompleteInventory), executable = Bun.which("git");
  if (!executable) throw Error("fixture requires Git");
  writeFileSync(join(f.root, "native-bin", "git"), `#!${process.execPath}
const args = process.argv.slice(2), target = args.indexOf("https://github.com/fixture/docs.git");
if (args.includes("push")) process.exit(91);
if (args.includes("fetch") && args.some(value => value.startsWith("https://")) && target < 0) process.exit(91);
if (target >= 0) { args[target] = ${JSON.stringify(origin)}; args.splice(args.indexOf("fetch"), 0, "-c", "protocol.file.allow=always"); }
const result = Bun.spawnSync([${JSON.stringify(executable)}, ...args], { stdout: "inherit", stderr: "inherit" }); process.exit(result.exitCode);
`, { mode: 0o700 });
  const worker_options: WorkerCollectionOptions = { ...common, repo, source, source_verification: baseline.evidence!,
    decisions: { path: "decisions.json", sha256: sha256(decisionBytes) }, credential: "synthetic-read-token", path: native.environment.PATH,
    cache_directory: f.selection.cache_directory, entry: "copilot", launcher_path: f.selection.launcher_path, settings_path: join(repo, ".vh-adlc/docs-drift.yaml") };
  await beforeCandidate?.({ repo, source, artifacts, baseline, selection, decisions: decisionBytes, worker_options });
  if (!sourceInsideCandidate) {
    git(f.root, "clone", "--no-local", "--no-checkout", repo, candidate); git(candidate, "checkout", "--detach", source);
    put(candidate, "docs/guide.md", replacement.toString()); head = commitAll(candidate);
  }
  const verified = await verifyCandidate({ ...common, repo, source, candidate_repo: candidate, candidate: head, selection });
  const { assessSource } = await import("../../../plugins/vh-adlc/scripts/docs-drift/source-assessment");
  const assessment = sourceCheckNeedsRepair ? await assessSource({ ...common, repo, source }) : null;
  expect(baseline.complete, JSON.stringify({ stage: "source", diagnostics: baseline.diagnostics, scan: baseline.scan?.process })).toBe(!sourceCheckNeedsRepair);
  expect(verified.complete, JSON.stringify({ stage: "candidate", diagnostics: verified.diagnostics, scan: verified.scan?.process,
    commands: verified.commands.map(command => ({ argv: command.argv, process: command.process })) })).toBe(true);
  return { ...f, ...common, repo, source, candidate, head, artifacts, selection, baseline, assessment, verified, decisions, native, inventoryFile,
    options: { ...common, repo, source, candidate_repo: candidate, candidate: head, selection,
      source_verification: assessment?.evidence ?? baseline.evidence!, candidate_verification: verified.evidence!, decisions: { path: "decisions.json", sha256: sha256(decisionBytes) },
      credential: "synthetic-read-token", path: native.environment.PATH, cache_directory: f.selection.cache_directory,
      entry: "copilot" as const, launcher_path: f.selection.launcher_path, settings_path: join(repo, ".vh-adlc/docs-drift.yaml") } };
}

test.each(["matching", "source-proof", "candidate-proof", "decision-source", "advisory-selection", "partial-inventory", "source-in-candidate"])("production binding collection %s", async scenario => {
  const f = await fixture(scenario === "partial-inventory", { sourceInsideCandidate: scenario === "source-in-candidate" }), options = structuredClone(f.options);
  if (scenario === "source-proof") options.source_verification.sha256 = "0".repeat(64);
  if (scenario === "candidate-proof") options.candidate_verification = options.source_verification;
  if (scenario === "decision-source" || scenario === "advisory-selection") {
    const changed = { ...f.decisions, source_commit: scenario === "decision-source" ? "0".repeat(40) : f.source,
      selected_proposals: scenario === "advisory-selection" ? [7] : [] };
    const bytes = canonicalJSON(changed); writeFileSync(join(f.artifacts, "decisions.json"), bytes, { mode: 0o600 }); options.decisions.sha256 = sha256(bytes);
  }
  put(f.repo, "docs/guide.md", "Preserve source draft\n"); put(f.candidate, "docs/guide.md", "Preserve candidate draft\n");
  const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings(options);
  if (scenario === "matching") expect(result.diagnostics).toEqual([]);
  else {
    const reasons: Record<string, string> = { "source-proof": "artifact changed", "candidate-proof": "complete exact-source record required",
      "decision-source": "Decision packet fields or source changed", "advisory-selection": "Advisory decision packet contains a resolution selection", "partial-inventory": "Complete current proposal inventory required", "source-in-candidate": "overlaps a caller checkout" };
    expect(result.diagnostics.join("\n")).toContain(reasons[scenario]);
  }
  expect(result.complete).toBe(scenario === "matching"); expect(result.authority).toBe("none");
  if (scenario === "matching") {
    expect(result.bindings).toMatchObject({ source_commit: f.source, candidate_commit: f.head,
      candidate_tree: git(f.candidate, "rev-parse", f.head + "^{tree}"), assessment_sha256: f.baseline.scan_artifacts!.report.sha256 });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({ path: "docs/guide.md", postimage_sha256: sha256(Buffer.from("# Current candidate guide\n")) });
    expect(result.facts?.runtime?.kind).toBe("docs-drift-approved-runtime");
  } else expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
}, 60000);

test.each(["matching", "partial-inventory"])("normal publication binding entry %s", async scenario => {
  const f = await fixture(scenario === "partial-inventory"), options = f.options;
  const selection = canonicalJSON(f.selection); writeFileSync(join(f.artifacts, "selection.json"), selection, { mode: 0o600 });
  const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
  const outcome = Bun.spawnSync([process.execPath, entry, "bind-publication", "--repo", f.repo, "--source", f.source,
    "--candidate-repo", f.candidate, "--candidate", f.head, "--artifact-root", f.artifacts, "--selection", "selection.json", "--selection-sha256", sha256(selection),
    "--cache-root", options.cache_directory, "--entry", options.entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
    "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
    "--candidate-verification", options.candidate_verification.path, "--candidate-verification-sha256", options.candidate_verification.sha256,
    "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256], { env: f.native.environment, stdout: "pipe", stderr: "pipe", timeout: 60000 });
  const report = JSON.parse(outcome.stdout.toString());
  expect(outcome.exitCode).toBe(scenario === "matching" ? 0 : 2);
  if (scenario === "matching") expect(report.publication_bindings).toMatchObject({ complete: true, authority: "none", bindings: { source_commit: f.source, candidate_commit: f.head } });
  else expect(report.diagnostics.map((item: { message: string }) => item.message).join("\n")).toContain("Complete current proposal inventory required");
}, 60000);

async function resolveFixture(scenario: string) {
  const f = await fixture(false), { captureSnapshot } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
  const { collectResolutionInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/resolve-inputs");
  const { buildResolution } = await import("../../../plugins/vh-adlc/scripts/docs-drift/resolve");
  const snapshot = captureSnapshot(f.repo, f.source), store = f.baseline.inspection?.object_store;
  if (!store || !f.baseline.scan) throw Error("missing assessed fixture objects");
  git(store.root, "fetch", "--no-write-fetch-head", f.candidate, f.head);
  const origin = join(f.root, "binding-origin");
  git(origin, "fetch", "--no-write-fetch-head", f.candidate, f.head); git(origin, "update-ref", "refs/pull/1/head", f.head);
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const outside = scenario.startsWith("outside-");
  const proposal = { number: 1, state: "open" as const, merged_at: null, body: "Synthetic selected original" + (scenario === "outside-during-fetch" ? " Changed" : ""), draft: true,
    actor: outside ? "other-author" : "fixture-bot", actor_id: outside ? 70 : 20, actor_type: "Bot", head_sha: f.head, head_ref: outside ? "other-scope/proposal" : "docs-drift/proposal", head_repository: repository,
    base_sha: f.source, base_ref: "main", base_repository: repository };
  const reader = { repository: () => repository, pull: (id: number) => { if (id !== 1) throw Error("unselected original"); return structuredClone(proposal); }, trace: () => [] };
  const collection = { snapshot, store, reader, selected: [1] }, inputs = collectResolutionInputs(collection), quote = snapshot.blobs.find(blob => blob.path === "README.md");
  if (!inputs.complete || !quote) throw Error("missing original fixture inputs");
  const decisions = inputs.proposals[0].hunks.map(hunk => ({ proposal: 1, hunk_id: hunk.id, disposition: "apply", reason: "Synthetic source-bound correction",
    evidence: [{ path: quote.path, sha256: sha256(quote.bytes), start: 0, end: quote.bytes.length, quote_sha256: sha256(quote.bytes) }],
    edit_ids: [f.selection.edits[0].id], feedback: null, carry: null }));
  const draft = await buildResolution({ collection, inputs, scan: f.baseline.scan, resolution_id: "bound-resolution", decisions, edits: f.selection.edits, carry_decisions: [],
    observe_verification: async scope => ({ state: "passed", inputs_sha256: scope.inputs_sha256, artifact_sha256: f.verified.evidence!.sha256,
      method: "synthetic-original-candidate-checks", asset_checks: [] }) });
  if (!draft.complete || !draft.record || !draft.record_bytes || !draft.record_sha256) throw Error("missing generated resolve fixture " + draft.diagnostics.join(" "));
  put(f.candidate, draft.record_path, draft.record_bytes.toString()); const head = commitAll(f.candidate);
  const record = { path: draft.record_path, sha256: draft.record_sha256 };
  const verified = await verifyCandidate({ repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: head, selection: f.selection,
    resolution_record: record, artifact_root: f.artifacts, owner: f.owner, run: f.run });
  if (!verified.complete) throw Error(JSON.stringify({ diagnostics: verified.diagnostics, scan: verified.scan?.diagnostics,
    scan_process: verified.scan?.process, inspection: verified.inspection?.diagnostics, commands: verified.commands.map(command => ({ argv: command.argv, process: command.process,
      stdout: existsSync(join(f.artifacts, command.stdout.path)) ? readFileSync(join(f.artifacts, command.stdout.path), "utf8").slice(-4000) : null,
      stderr: existsSync(join(f.artifacts, command.stderr.path)) ? readFileSync(join(f.artifacts, command.stderr.path), "utf8").slice(-4000) : null })) }));
  const packet = { ...f.decisions, mode: "resolve", selected_proposals: [1], decisions: structuredClone(draft.record.dispositions) };
  if (scenario === "changed-decisions") packet.decisions[0].reason = "An unrecorded decision";
  const bytes = canonicalJSON(packet); writeFileSync(join(f.artifacts, "decisions.json"), bytes, { mode: 0o600 });
  const raw = { number: 1, state: "open", merged_at: null, body: proposal.body + (scenario === "changed-original" ? " Changed" : ""), draft: true,
    user: { login: proposal.actor, id: proposal.actor_id, type: "Bot" }, head: { sha: f.head, ref: proposal.head_ref, repo: repository }, base: { sha: f.source, ref: "main", repo: repository } };
  writeFileSync(join(f.root, "native-bin", "gh"), `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync } from "node:fs";
const args = process.argv.slice(2), endpoint = args.at(-1), source = ${JSON.stringify(f.source)}, repository = ${JSON.stringify(repository)}, proposal = ${JSON.stringify(raw)};
const trace = ${JSON.stringify(join(f.root, "resolve-native-reads.jsonl"))}, previous = existsSync(trace) ? readFileSync(trace, "utf8").split("\\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const pulls = previous.filter(value => value.endpoint === "repos/fixture/docs/pulls/1").length;
appendFileSync(trace, JSON.stringify({ endpoint }) + "\\n");
if (${JSON.stringify(outside)}) proposal.body = "Synthetic selected original" + (pulls >= (${JSON.stringify(scenario)} === "outside-during-fetch" ? 1 : 2) ? " Changed" : "");
if (args.includes("graphql")) { console.log(JSON.stringify({ data: { viewer: { login: "fixture-bot", databaseId: 20 } } })); process.exit(0); }
if (args[args.indexOf("--method") + 1] !== "GET") process.exit(91);
const value = endpoint === "repos/fixture/docs" ? repository
  : endpoint === "repos/fixture/docs/git/ref/heads/main" ? { ref: "refs/heads/main", object: { type: "commit", sha: source } }
  : endpoint === "repos/fixture/docs/git/commits/" + source ? { sha: source, tree: { sha: "a".repeat(40) }, parents: [], message: "Synthetic source" }
  : endpoint === "repos/fixture/docs/pulls?state=open&base=main&per_page=100&page=1" ? [proposal]
  : endpoint === "repos/fixture/docs/pulls/1" ? proposal : null;
if (!value) process.exit(92); console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value));
`, { mode: 0o700 });
  if (scenario === "missing-ref") git(origin, "update-ref", "-d", "refs/pull/1/head");
  return { ...f, options: { ...f.options, candidate: head, candidate_verification: verified.evidence!, resolution_record: record,
    decisions: { path: "decisions.json", sha256: sha256(bytes) } } };
}

test.each(["matching", "changed-decisions", "changed-original", "missing-ref"])("resolve publication bindings recheck complete native originals %s", async scenario => {
  const f = await resolveFixture(scenario), before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings(f.options);
  if (scenario === "matching") { expect(result.diagnostics).toEqual([]); expect(result.resolution?.complete).toBe(true); expect(result.corrections).toHaveLength(1); }
  else expect(result.diagnostics.join("\n")).toContain(scenario === "missing-ref" ? "Selected complete original diff unavailable" : "Resolve record decisions or complete original bindings changed");
  expect(result.complete).toBe(scenario === "matching"); expect(result.authority).toBe("none");
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
}, 60000);

test("publication bindings retain a bounded body-free proposal preimage and expose the worker target", async () => {
  const f = await resolveFixture("matching"), { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings(f.options);
  expect(result.complete).toBe(true);
  expect(result.proposal_snapshot).toMatchObject({ sha256: result.bindings!.proposals_sha256 });
  const bytes = readFileSync(join(f.artifacts, result.proposal_snapshot!.path));
  expect(sha256(bytes)).toBe(result.bindings!.proposals_sha256);
  expect(bytes.toString()).not.toContain("Synthetic selected original");
  expect(JSON.parse(bytes.toString()).inventory[0].body_sha256).toBe(sha256(Buffer.from("Synthetic selected original")));
  const { workerInputDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  expect(result.worker_input_sha256).toBe(workerInputDigest(result.bindings!));
});


test("proposal snapshot retention failure leaves binding assembly incomplete with its resource locator", async () => {
  const f = await fixture(false), { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const publish = artifacts.publishArtifact;
  const failure = spyOn(artifacts, "publishArtifact").mockImplementation((path, bytes) => {
    if (path.includes("/proposal-snapshot-")) throw Error("fixture proposal-snapshot retention failure");
    return publish(path, bytes);
  });
  try {
    const result = await collectPublicationBindings(f.options);
    expect(result.complete).toBe(false);
    expect(result.proposal_snapshot).toBe(null);
    expect(result.worker_input_sha256).toBe(null);
    expect(result.proposal_snapshot_path?.startsWith(f.artifacts + "/proposal-snapshot-")).toBe(true);
    expect(result.diagnostics).toContain("fixture proposal-snapshot retention failure");
    expect(result.facts?.store?.root.startsWith(f.artifacts + "/")).toBe(true);
  } finally { failure.mockRestore(); }
});

test.each(["outside-late-change", "outside-during-fetch"])("selected resolve originals are rechecked independently of discovery %s", async scenario => {
  const f = await resolveFixture(scenario), { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings(f.options);
  expect(result.complete).toBe(false);
  expect(result.diagnostics.join("\n")).toContain(scenario === "outside-during-fetch"
    ? "Selected original inputs changed between fetch and collection"
    : "Selected original inputs changed during final recheck");
  const reads = readFileSync(join(f.root, "resolve-native-reads.jsonl"), "utf8").trim().split("\n")
    .map(line => JSON.parse(line) as { endpoint: string }).filter(item => item.endpoint === "repos/fixture/docs/pulls/1");
  expect(reads.length).toBe(scenario === "outside-during-fetch" ? 2 : 3);
});

test.each(["missing", "extra", "duplicate", "unknown-field", "malformed-attention", "duplicate-attention"])("publication bindings refuse unaccounted decisions or attention %s", async scenario => {
  const f = await fixture(false), packet: Record<string, unknown> = structuredClone(f.decisions);
  if (scenario === "missing") packet.decisions = [];
  if (scenario === "extra") packet.decisions = [...f.decisions.decisions, { id: "unselected", reason: "Not selected" }];
  if (scenario === "duplicate") packet.decisions = [f.decisions.decisions[0], f.decisions.decisions[0]];
  if (scenario === "unknown-field") packet.decisions = [{ ...f.decisions.decisions[0], approved: true }];
  if (scenario === "malformed-attention") packet.attention = [7];
  if (scenario === "duplicate-attention") {
    const item = { identity: "unknown-one", disposition: "unknown", reason: "A current input is unavailable", owner_action: "Choose its resolution",
      rule: { id: "fixture-rule" }, title: "Current input", links: [] };
    packet.attention = [item, item];
  }
  const bytes = canonicalJSON(packet); writeFileSync(join(f.artifacts, "decisions.json"), bytes, { mode: 0o600 });
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings({ ...f.options, decisions: { path: "decisions.json", sha256: sha256(bytes) } });
  expect(result.complete).toBe(false);
  expect(result.diagnostics.join("\n")).toContain(scenario.includes("attention") ? "Invalid or duplicate attention proposal" : "Advisory decisions do not account for selected edits");
});


test("worker target is captured before a candidate exists and passes the original review validator", async () => {
  const workerInputs = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  const { workerInputsDigest, manifestDigest, validateReviewedManifest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  const { captureSnapshot } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
  const { projectProposalBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/proposals");
  const { evidence, role } = await import("./manifest-fixture");
  let target = "", originalWorker: ReturnType<typeof evidence>;
  const f = await fixture(false, { beforeCandidate: input => {
    expect(existsSync(join(input.repo, "../binding-candidate"))).toBe(false);
    const inputs = workerInputs.deriveWorkerInputs({ snapshot: captureSnapshot(input.repo, input.source),
      assessment_sha256: input.baseline.scan_artifacts!.report.sha256, source_verification: input.baseline.evidence!,
      decisions_sha256: sha256(input.decisions), proposals_sha256: sha256(canonicalJSON(projectProposalBindings([], null))) });
    target = workerInputsDigest(inputs);
    originalWorker = evidence("pre-candidate-worker", target, canonicalJSON({ input_sha256: target, edits: (input.selection as { edits: unknown[] }).edits, publication: null }).toString());
  } });
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings(f.options);
  expect(result.diagnostics).toEqual([]); expect(result.worker_input_sha256).toBe(target);
  const worker = originalWorker!, manifest = { schema_version: 1 as const, operation_id: "pre-candidate", repository: "fixture/docs", repository_id: 10,
    actor: "fixture-bot", actor_id: 20, bindings: result.bindings!, effects: [], worker: { invocation_id: worker.invocation_id, context_id: worker.context_id,
      native_sha256: worker.native_sha256, returned_sha256: worker.returned_sha256 } };
  const reviewer = evidence("post-candidate-reviewer", manifestDigest(manifest), "NO FINDINGS\n");
  const checked = validateReviewedManifest({ manifest, current: structuredClone(manifest), worker, reviewer, grants: [], policy: { worker: role, reviewer: role } });
  expect(checked.manifest_sha256).toBe(manifestDigest(manifest));
  const { sealPlan, readRetainedPlan } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const plan = sealPlan({ reviewed: checked, grants: [], adoption_sha256: sha256(Buffer.from("synthetic adoption")),
    context: "production", transport: "native", publication_kind: "advisory", corrections: result.corrections, attention: result.attention,
    candidate_verification_sha256: result.candidate_verification_sha256! });
  expect(readRetainedPlan(canonicalJSON(plan))).toEqual(plan);
  const repeated = await verifyCandidate({ repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    selection: f.selection, artifact_root: f.artifacts, owner: f.owner, run: f.run });
  expect(repeated.complete).toBe(true);
  const next = await collectPublicationBindings({ ...f.options, candidate_verification: repeated.evidence! });
  expect(next.diagnostics).toEqual([]); expect(next.worker_input_sha256).toBe(target);
  expect(next.candidate_verification_sha256).not.toBe(result.candidate_verification_sha256);
  expect(next.bindings!.delivery_sha256).not.toBe(result.bindings!.delivery_sha256);
  const changed = { ...manifest, bindings: next.bindings! };
  expect(() => validateReviewedManifest({ manifest: changed, current: structuredClone(changed), worker, reviewer, grants: [],
    policy: { worker: role, reviewer: role } })).toThrow("review target");
  expect(result.candidate_verification_sha256).toBe(f.verified.evidence!.sha256);
  expect(result.bindings!.delivery_sha256).toBe(sha256(canonicalJSON({ corrections: result.corrections, attention: result.attention,
    candidate_verification_sha256: f.verified.evidence!.sha256 })));
}, 60000);


test("normal binding collection accepts a complete source scan when only the repaired checkpoint passes checks", async () => {
  const f = await fixture(false, { sourceCheckNeedsRepair: true });
  expect(f.baseline.complete).toBe(false); expect(f.assessment?.complete).toBe(true); expect(f.verified.complete).toBe(true);
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings(f.options);
  expect(result.diagnostics).toEqual([]); expect(result.complete).toBe(true);
  expect(result.source_verification?.scan?.complete).toBe(true);
  expect(result.bindings?.assessment_sha256).toBe(f.assessment!.scan_artifacts!.report.sha256);
}, 60000);


test.each(["api", "cli"])("normal worker-input collection precedes the candidate and matches its later review binding %s", async surface => {
  let target = "";
  const f = await fixture(false, { beforeCandidate: async input => {
    expect(existsSync(join(input.repo, "../binding-candidate"))).toBe(false);
    const before = captureRepositoryState(input.repo);
    if (surface === "api") {
      const { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
      const result = await collectWorkerInputs(input.worker_options);
      expect(result.diagnostics).toEqual([]); expect(result.complete).toBe(true); expect(result.authority).toBe("none");
      target = result.worker_input_sha256!;
    } else {
      const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), options = input.worker_options;
      const proof = options.source_verification as { path: string; sha256: string }, decisions = options.decisions as { path: string; sha256: string };
      const outcome = Bun.spawnSync([process.execPath, entry, "collect-worker-inputs", "--repo", input.repo, "--source", input.source,
        "--artifact-root", input.artifacts, "--source-verification", proof.path, "--source-verification-sha256", proof.sha256,
        "--decisions", decisions.path, "--decisions-sha256", decisions.sha256, "--cache-root", options.cache_directory,
        "--entry", options.entry, "--launcher", options.launcher_path, "--settings", options.settings_path], {
        env: { ...process.env, PATH: options.path, GH_TOKEN: "synthetic-read-token" }, stdout: "pipe", stderr: "pipe", timeout: 60000 });
      const report = JSON.parse(outcome.stdout.toString());
      expect(outcome.exitCode, JSON.stringify(report.diagnostics)).toBe(0);
      expect(report.worker_inputs).toMatchObject({ complete: true, authority: "none" });
      target = report.worker_inputs.worker_input_sha256;
    }
    expect(captureRepositoryState(input.repo)).toEqual(before);
  } });
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const result = await collectPublicationBindings(f.options);
  expect(result.diagnostics).toEqual([]); expect(result.worker_input_sha256).toBe(target);
}, 60000);

test.each(["source-only", "resolve", "partial-inventory", "changed-proof"])("normal worker inputs retain source/original bindings and refuse incomplete inputs %s", async scenario => {
  const f = scenario === "resolve" ? await resolveFixture("matching") : await fixture(scenario === "partial-inventory", { sourceCheckNeedsRepair: scenario === "source-only" });
  const options = structuredClone(f.options), { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  if (scenario === "changed-proof") options.source_verification.sha256 = "0".repeat(64);
  const result = await collectWorkerInputs(options), complete = scenario === "source-only" || scenario === "resolve";
  if (complete) {
    expect(result.diagnostics).toEqual([]);
    const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
    const reviewed = await collectPublicationBindings(f.options);
    expect(reviewed.diagnostics).toEqual([]); expect(result.worker_input_sha256).toBe(reviewed.worker_input_sha256);
    if (scenario === "resolve") expect(result.resolution?.complete).toBe(true);
  } else {
    expect(result.diagnostics.join("\n")).toContain(scenario === "partial-inventory" ? "Complete current proposal inventory required" : "artifact changed");
    expect(result.worker_input_sha256).toBe(null);
  }
  expect(result.complete).toBe(complete); expect(result.authority).toBe("none");
}, 60000);

test.each(["outside-late-change", "outside-during-fetch"])("normal worker inputs recheck selected originals outside discovery %s", async scenario => {
  const f = await resolveFixture(scenario), { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  const result = await collectWorkerInputs(f.options);
  expect(result.scope_changed).toBe(true);
  expect(result.complete).toBe(false); expect(result.authority).toBe("none");
  expect(result.diagnostics.join("\n")).toContain(scenario === "outside-during-fetch"
    ? "Selected original inputs changed between fetch and collection" : "Selected original inputs changed during final recheck");
}, 60000);


test("worker input snapshot retention failure preserves caller state and owned resource locators", async () => {
  const f = await fixture(false), { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  put(f.repo, "docs/guide.md", "Preserved source draft\n"); const before = captureRepositoryState(f.repo), publish = artifacts.publishArtifact;
  const failure = spyOn(artifacts, "publishArtifact").mockImplementation((path, bytes) => {
    if (path.includes("/proposal-snapshot-")) throw Error("fixture worker snapshot retention failure");
    return publish(path, bytes);
  });
  try {
    const result = await collectWorkerInputs(f.options);
    expect(result.complete).toBe(false); expect(result.authority).toBe("none");
    expect(result.worker_input_sha256).toBe(null); expect(result.proposal_snapshot).toBe(null);
    expect(result.proposal_snapshot_path?.startsWith(f.artifacts + "/proposal-snapshot-")).toBe(true);
    expect(result.facts?.store?.root.startsWith(f.artifacts + "/")).toBe(true);
    expect(result.diagnostics).toContain("fixture worker snapshot retention failure");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } finally { failure.mockRestore(); }
}, 60000);


test.each(["matching", "cli", "alias", "alias-only-observed", "successor-model", "missing-edits", "wrong-returned-input", "changed-target", "outside-edit", "unknown-capability", "malformed-publication"])("normal preparation reads only the original worker handoff %s", async scenario => {
  const { collectWorkerPreparation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/worker-preparation");
  const { roleRuntimeDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-capture");
  const { evidence, role } = await import("./manifest-fixture");
  const { verifyRoleIdentity } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  const { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  let captured: { path: string; sha256: string } | null = null;
  const requested = ["alias", "alias-only-observed", "successor-model"].includes(scenario) ? "opus" : "claude-opus-5.5";
  const configured = { model: requested, native_model: scenario === "alias-only-observed" ? "opus" : "claude-opus-5.5", identity_source: scenario === "unknown-capability" ? null : role.identity_source! };
  const f = await fixture(false, { role: configured, beforeCandidate: async input => {
    if (scenario === "unknown-capability" || scenario === "alias-only-observed") return;
    const inputs = await collectWorkerInputs(input.worker_options);
    expect(inputs.complete, JSON.stringify(inputs.diagnostics)).toBe(true);
    const runtime = inputs.facts!.runtime!, target = inputs.worker_input_sha256!;
    expect(inputs.worker_runtime_sha256).toBe(roleRuntimeDigest(runtime, "worker"));
    expect(roleRuntimeDigest({ ...runtime, current_default: "e".repeat(40) }, "worker")).toBe(inputs.worker_runtime_sha256!);
    expect(roleRuntimeDigest(runtime, "reviewer")).not.toBe(inputs.worker_runtime_sha256!);
    const { parseEdit } = await import("../../../plugins/vh-adlc/scripts/docs-drift/resolve");
    const edits = (input.selection as { edits: unknown[] }).edits.map(parseEdit);
    if (scenario === "missing-edits") edits.length = 0;
    if (scenario === "outside-edit") {
      const bytes = readFileSync(join(input.repo, "README.md"));
      Object.assign(edits[0], { path: "README.md", start: 0, end: bytes.length, before_sha256: sha256(bytes) });
    }
    const original = evidence("actual-worker-handoff", scenario === "changed-target" ? sha256(Buffer.from("another run")) : target,
      canonicalJSON({ input_sha256: scenario === "wrong-returned-input" ? sha256(Buffer.from("unrelated input")) : target, edits,
        publication: scenario === "malformed-publication" ? { operation_id: "unvalidated-worker-proposal", proposal: { kind: "pr-create", payload: { approved: true } } } : null }).toString());
    if (scenario === "successor-model") {
      original.native = Buffer.from(Buffer.from(original.native).toString().replaceAll("claude-opus-5.5", "claude-opus-5.6"));
      original.returned = Buffer.from(Buffer.from(original.returned).toString().replaceAll("claude-opus-5.5", "claude-opus-5.6"));
      original.native_sha256 = sha256(original.native); original.returned_sha256 = sha256(original.returned);
    }
    const { records: _records, ...binding } = verifyRoleIdentity(original, { ...role, requested_model: configured.model,
      adopted_model: scenario === "successor-model" ? "claude-opus-5.6" : "claude-opus-5.5" });
    const retain = (name: string, bytes: Uint8Array) => { writeFileSync(join(input.artifacts, name), bytes, { mode: 0o600 }); return { path: name, sha256: sha256(bytes) }; };
    const launch = { schema_version: 1, kind: "docs-drift-role-launch", role: "worker", invocation_id: original.invocation_id,
      context_id: original.context_id, source_commit: input.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: original.target_sha256, pid: original.process.pid };
    captured = retain("worker-capture.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-role-capture", role: "worker", source_commit: input.source,
      runtime_sha256: launch.runtime_sha256, launch: retain("worker-launch.json", canonicalJSON(launch)), binding, artifacts: {
        native: retain("worker-native.jsonl", original.native), returned: retain("worker-returned.txt", original.returned), process: retain("worker-process.json", canonicalJSON(original.process)) } }));
  } });
  const before = captureRepositoryState(f.repo);
  let result: Awaited<ReturnType<typeof collectWorkerPreparation>>;
  if (scenario === "cli") {
    if (!captured) throw Error("missing original worker fixture capture");
    const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), options = f.options;
    const capture = captured as { path: string; sha256: string };
    const outcome = Bun.spawnSync([process.execPath, entry, "read-worker-preparation", "--repo", f.repo, "--source", f.source,
      "--artifact-root", f.artifacts, "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
      "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256, "--cache-root", options.cache_directory,
      "--entry", options.entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
      "--worker-capture", capture.path, "--worker-capture-sha256", capture.sha256], { env: f.native.environment, stdout: "pipe", stderr: "pipe", timeout: 60000 });
    const report = JSON.parse(outcome.stdout.toString()); expect(outcome.exitCode, JSON.stringify(report.diagnostics)).toBe(0); result = report.worker_preparation;
  } else result = await collectWorkerPreparation({ ...f.options, worker_capture: captured });
  if (["matching", "cli", "alias"].includes(scenario)) { expect(result.diagnostics).toEqual([]); expect(result.selection).toEqual(f.selection); expect(result.publication).toBe(null); }
  else {
    const reasons: Record<string, string> = { "wrong-returned-input": "Original worker input target changed", "changed-target": "original launch target or context changed",
      "outside-edit": "outside", "unknown-capability": "recorded native identity source", "alias-only-observed": "native model identity", "successor-model": "adopted native identity", "missing-edits": "Advisory decisions do not account for selected edits", "malformed-publication": "effect payload" };
    expect(result.diagnostics.join("\n")).toContain(reasons[scenario]);
  }
  expect(result.complete).toBe(["matching", "cli", "alias"].includes(scenario)); expect(result.authority).toBe("none");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 60000);


test.each(["legacy", "scan-only"])("worker input rechecks reuse their original assessed store %s", async mode => {
  const f = await fixture(false, { sourceCheckNeedsRepair: mode === "scan-only" });
  const { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  const store = mode === "scan-only" ? f.assessment?.object_store : f.baseline.inspection?.object_store;
  if (!store) throw Error("missing original assessed fixture store");
  const inventory = () => readdirSync(f.artifacts).filter(name => name.startsWith("docs-drift-objects-")).sort();
  const before = inventory();
  const first = await collectWorkerInputs(f.options);
  expect(first.diagnostics).toEqual([]); expect(first.facts?.store?.root).toBe(store.root);
  const second = await collectWorkerInputs(f.options);
  expect(second.diagnostics).toEqual([]); expect(second.facts?.store?.root).toBe(store.root);
  expect(inventory()).toEqual(before); expect(second.worker_input_sha256).toBe(first.worker_input_sha256);
}, 60000);

test.each(["matching", "cli", "changed-selection", "missing-proposal", "foreign-branch", "reviewer", "stale-reviewer", "same-reviewer-context", "findings-reviewer", "reviewer-cli", "publication-check", "publication-check-cli", "missing-publication-authority", "retained-execution"])("candidate review target retains the original author %s", async scenario => {
  const { collectReviewTarget } = await import("../../../plugins/vh-adlc/scripts/docs-drift/review-target");
  const { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  const { roleRuntimeDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-capture");
  const { evidence, role } = await import("./manifest-fixture");
  const { verifyRoleIdentity, manifestDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  let captured: { path: string; sha256: string } | null = null;
  const f = await fixture(false, { role: { model: "opus", native_model: role.adopted_model, identity_source: role.identity_source }, beforeCandidate: async input => {
    const current = await collectWorkerInputs(input.worker_options);
    expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
    const edits = structuredClone((input.selection as { edits: unknown[] }).edits);
    if (scenario === "changed-selection") (edits[0] as { id: string }).id = "another-worker-edit";
    const publication = scenario === "missing-proposal" ? null : { operation_id: "original-operation", proposal: { kind: "pr-create", payload: {
      base: "main", branch: scenario === "foreign-branch" ? "foreign/branch" : "docs-drift/original-operation", title: "Repair guide", body: "Reviewed source correction\n", labels: ["documentation"], draft: false } } };
    const original = evidence("pre-candidate-author", current.worker_input_sha256!, canonicalJSON({ input_sha256: current.worker_input_sha256!, edits, publication }).toString());
    const { records: _records, ...binding } = verifyRoleIdentity(original, role);
    const retain = (name: string, bytes: Uint8Array) => { writeFileSync(join(input.artifacts, name), bytes, { mode: 0o600 }); return { path: name, sha256: sha256(bytes) }; };
    const launch = { schema_version: 1, kind: "docs-drift-role-launch", role: "worker", invocation_id: original.invocation_id, context_id: original.context_id,
      source_commit: input.source, runtime_sha256: roleRuntimeDigest(current.facts!.runtime!, "worker"), target_sha256: original.target_sha256, pid: original.process.pid };
    captured = retain("review-author-capture.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-role-capture", role: "worker", source_commit: input.source,
      runtime_sha256: launch.runtime_sha256, launch: retain("review-author-launch.json", canonicalJSON(launch)), binding, artifacts: {
        native: retain("review-author-native.jsonl", original.native), returned: retain("review-author-returned.txt", original.returned), process: retain("review-author-process.json", canonicalJSON(original.process)) } }));
  } });
  const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
  const invokeReview = (command: string, extra: string[] = []) => {
    if (!captured) throw Error("missing review-target author fixture");
    const reference = captured as { path: string; sha256: string }, selection = canonicalJSON(f.selection), options = f.options;
    writeFileSync(join(f.artifacts, "review-selection.json"), selection, { mode: 0o600 });
    const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
    const outcome = Bun.spawnSync([process.execPath, entry, command, "--repo", f.repo, "--source", f.source,
      "--candidate-repo", f.candidate, "--candidate", f.head, "--artifact-root", f.artifacts, "--selection", "review-selection.json", "--selection-sha256", sha256(selection),
      "--cache-root", options.cache_directory, "--entry", options.entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
      "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
      "--candidate-verification", options.candidate_verification.path, "--candidate-verification-sha256", options.candidate_verification.sha256,
      "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256,
      "--worker-capture", reference.path, "--worker-capture-sha256", reference.sha256, ...extra], { env: f.native.environment, stdout: "pipe", stderr: "pipe", timeout: 60000 });
    const report = JSON.parse(outcome.stdout.toString());
    expect(outcome.exitCode, JSON.stringify(report.diagnostics) + outcome.stderr.toString()).toBe(0);
    return report;
  };
  let result: Awaited<ReturnType<typeof collectReviewTarget>>;
  if (scenario === "cli") result = invokeReview("collect-review-target").review_target;
  else result = await collectReviewTarget({ ...f.options, worker_capture: captured });
  if (["reviewer", "reviewer-cli", "stale-reviewer", "same-reviewer-context", "findings-reviewer", "publication-check", "publication-check-cli", "missing-publication-authority", "retained-execution"].includes(scenario)) {
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    const { collectCandidateReview } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-review");
    const reviewer = evidence("candidate-reviewer", scenario === "stale-reviewer" ? sha256(Buffer.from("old candidate")) : result.manifest_sha256!,
      scenario === "findings-reviewer" ? "FINDING: F-01\nKIND: factual\nSEVERITY: should-fix\nWHERE: candidate\nEVIDENCE: incomplete correction\nPROPOSAL: repair\n" : "NO FINDINGS\n");
    if (scenario === "same-reviewer-context") reviewer.context_id = result.manifest!.worker.invocation_id + "-context";
    const { records: _records, ...binding } = verifyRoleIdentity(reviewer, role);
    const retain = (name: string, bytes: Uint8Array) => { writeFileSync(join(f.artifacts, name), bytes, { mode: 0o600 }); return { path: name, sha256: sha256(bytes) }; };
    const launch = { schema_version: 1, kind: "docs-drift-role-launch", role: "reviewer", source_commit: f.source, runtime_sha256: result.reviewer_runtime_sha256,
      target_sha256: reviewer.target_sha256, invocation_id: reviewer.invocation_id, context_id: reviewer.context_id, pid: reviewer.process.pid };
    const reviewerCapture = retain("candidate-reviewer-capture.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-role-capture", role: "reviewer", source_commit: f.source,
      runtime_sha256: launch.runtime_sha256, launch: retain("candidate-reviewer-launch.json", canonicalJSON(launch)), binding, artifacts: {
        native: retain("candidate-reviewer-native.jsonl", reviewer.native), returned: retain("candidate-reviewer-returned.txt", reviewer.returned), process: retain("candidate-reviewer-process.json", canonicalJSON(reviewer.process)) } }));
    const reviewed: Awaited<ReturnType<typeof collectCandidateReview>> = scenario === "reviewer-cli"
      ? invokeReview("read-candidate-review", ["--reviewer-capture", reviewerCapture.path, "--reviewer-capture-sha256", reviewerCapture.sha256]).candidate_review
      : await collectCandidateReview({ ...f.options, worker_capture: captured, reviewer_capture: reviewerCapture });
    if (["publication-check", "publication-check-cli", "missing-publication-authority", "retained-execution"].includes(scenario)) {
      expect(reviewed.complete, JSON.stringify(reviewed.diagnostics)).toBe(true);
      const { checkPublication, publishPublication } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller");
      const { effectDigest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
      const { readGit } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
      const instruction = retain("publication-owner-request.txt", Buffer.from("Synthetic owner request approves this exact publication batch, including its lease, retained receipt, candidate push, PR and lease release.\n"));
      const approval = retain("publication-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority",
        manifest_sha256: result.manifest_sha256, origin: { kind: "owner-request", artifact: instruction },
        effects: result.manifest!.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
      const options = { ...f.options, worker_capture: captured, reviewer_capture: reviewerCapture,
        authority: scenario === "missing-publication-authority" ? { ...approval, sha256: "0".repeat(64) } : approval };
      if (scenario === "retained-execution") await expect(publishPublication(options)).rejects.toThrow("Retained executing publication controller required");
      else {
        const checked: Awaited<ReturnType<typeof checkPublication>> = scenario === "publication-check-cli"
          ? invokeReview("check-publication", ["--reviewer-capture", reviewerCapture.path, "--reviewer-capture-sha256", reviewerCapture.sha256,
            "--authority", approval.path, "--authority-sha256", approval.sha256]).publication_check
          : await checkPublication(options);
        if (["publication-check", "publication-check-cli"].includes(scenario)) {
          expect(checked.diagnostics).toEqual([]); expect(checked.plan?.manifest_sha256).toBe(result.manifest_sha256!);
          expect(checked.resources?.object_store?.source_commit).toBe(f.source);
          expect(readGit(checked.resources!.object_store!.root, "rev-parse", f.head + "^{tree}").toString().trim()).toBe(result.manifest!.bindings.candidate_tree);
        } else expect(checked.diagnostics.join("\n")).toContain("artifact changed");
        expect(checked.complete).toBe(["publication-check", "publication-check-cli"].includes(scenario)); expect(checked.authority).toBe("none");
      }
      expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
      return;
    }
    if (["reviewer", "reviewer-cli"].includes(scenario)) {
      expect(reviewed.diagnostics).toEqual([]); expect(reviewed.review?.manifest_sha256).toBe(result.manifest_sha256!);
      expect(reviewed.review?.reviewer.invocation_id).toBe("candidate-reviewer"); expect(Object.hasOwn(reviewed, "grants")).toBe(false);
    } else {
      const reasons = { "stale-reviewer": "original launch target or context changed", "same-reviewer-context": "independent review context", "findings-reviewer": "blocking review findings" };
      expect(reviewed.diagnostics.join("\n")).toContain(reasons[scenario as keyof typeof reasons]);
    }
    expect(reviewed.complete).toBe(["reviewer", "reviewer-cli"].includes(scenario)); expect(reviewed.authority).toBe("none");
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    return;
  }
  if (["matching", "cli"].includes(scenario)) {
    expect(result.diagnostics).toEqual([]); expect(result.manifest_sha256).toBe(manifestDigest(result.manifest!));
    expect(result.manifest?.bindings.candidate_commit).toBe(f.head);
    expect(result.manifest?.worker.invocation_id).toBe("pre-candidate-author");
    expect(result.manifest?.effects.map(effect => effect.kind)).toEqual(["lease-acquire", "receipt-retain", "push", "pr-create", "lease-release"]);
    expect(result.manifest?.effects[2].payload.head).toBe(f.head);
    expect(result.manifest?.effects[3].payload.body).toContain("Reviewed source correction\n");
    expect(result.manifest?.effects[3].payload.body).toContain("original-operation");
    expect(Object.hasOwn(result, "review_verdict")).toBe(false); expect(Object.hasOwn(result, "grants")).toBe(false);
    expect(result.reviewer_runtime_sha256).toMatch(/^[a-f0-9]{64}$/);
  } else {
    const reasons = { "changed-selection": "Advisory decisions do not account for selected edits", "missing-proposal": "Original worker publication proposal required", "foreign-branch": "candidate branch scope" };
    expect(result.diagnostics.join("\n")).toContain(reasons[scenario as keyof typeof reasons]);
  }
  expect(result.complete).toBe(["matching", "cli"].includes(scenario)); expect(result.authority).toBe("none");
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
}, 60000);

test("normal binding rechecks preserve the reviewed input after its exact own PR creation", async () => {
  const f = await fixture(false, { mutableInventory: true });
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
  const { capturePublicationInventory } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-inventory");
  const { fixture: manifestFixture } = await import("./manifest-fixture");
  const { validateReviewedManifest, effectMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  const { createJournal, appendIntent, appendOutcome, sealPlan, writePublicationObjects } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const { publicationMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-history");
  const { captureSnapshot } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
  const bound = await collectPublicationBindings(f.options); expect(bound.complete, JSON.stringify(bound.diagnostics)).toBe(true);
  const settings = captureSnapshot(f.repo, f.source).settings, runtime = bound.facts!.runtime!, store = bound.source_verification!.object_store!;
  const payload = { base: "main", branch: "docs-drift/own-replay", title: "Repair guide", body: "Synthetic exact original correction\n" + publicationMarker(settings, "own-replay") + "\n" + effectMarker("pr"), labels: ["documentation"], draft: false };
  const input = manifestFixture(bound.bindings!, [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + "own-replay" } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/" + payload.branch, head: f.head } },
    { id: "pr", kind: "pr-create", payload }, { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ], "own-replay");
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: runtime.adoption_sha256,
    context: "production", transport: "native", publication_kind: "advisory", corrections: bound.corrections, attention: bound.attention,
    candidate_verification_sha256: bound.candidate_verification_sha256! });
  let journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
  const objects = writePublicationObjects(store, plan, journal.header);
  for (const effect of plan.manifest.effects.slice(0, 3)) {
    journal = appendIntent(journal, effect.id);
    journal = appendOutcome(journal, effect.id, { state: "observed", observation_sha256: "a".repeat(64), resource_id: null, object: null });
  }
  journal = appendIntent(journal, "pr");
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  writeFileSync(f.inventoryFile, JSON.stringify([{ number: 73, state: "open", merged_at: null, body: payload.body, draft: false,
    user: { id: 20, login: "fixture-bot", type: "Bot" }, head: { sha: f.head, ref: payload.branch, repo: repository },
    base: { sha: f.source, ref: "main", repo: repository } }]), { mode: 0o600 });
  const { readNativeContext } = await import("../../../plugins/vh-adlc/scripts/docs-drift/transport");
  const { collectProposals } = await import("../../../plugins/vh-adlc/scripts/docs-drift/proposals");
  const native = readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: f.options.credential, path: f.options.path });
  const current = collectProposals(native.repository, settings); expect(current.complete).toBe(true);
  const transport = { kind: "native" as const, observe: async () => ({ state: "done" as const, outcome: {
    state: "observed" as const, observation_sha256: "a".repeat(64), resource_id: "73", object: f.head } }) };
  // Synthetic native-observer result for this projection control. The normal controller constructs the actual transport.
  const context = await capturePublicationInventory({ source_repo: f.repo, artifact_root: f.artifacts, journal_directory: journal.directory,
    original: bound.proposal_snapshot!, current_proposals: current.proposals, transport, objects });
  const worker = await collectWorkerInputs({ ...f.options, inventory_context: context });
  expect(worker.diagnostics).toEqual([]); expect(worker.worker_input_sha256).toBe(bound.worker_input_sha256!);
  const after = await collectPublicationBindings({ ...f.options, inventory_context: context });
  expect(after.diagnostics).toEqual([]); expect(after.bindings).toEqual(bound.bindings);
}, 60000);
