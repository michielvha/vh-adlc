import { afterAll, expect, spyOn, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  sourceInsideCandidate?: boolean; sourceCheckNeedsRepair?: boolean;
  beforeCandidate?: (input: { repo: string; source: string; artifacts: string; baseline: Awaited<ReturnType<typeof verifyCandidate>>; selection: unknown; decisions: Uint8Array; worker_options: WorkerCollectionOptions }) => void | Promise<void>;
} = {}) {
  const { sourceInsideCandidate = false, sourceCheckNeedsRepair = false, beforeCandidate } = options;
  const f = await runtimeFixture(roots, true), repo = f.repo;
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
  const selection = { schema_version: 1, source_commit: source, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace", start: 0,
    end: preimage.length, before_sha256: sha256(preimage), replacement_base64: replacement.toString("base64"), after_mode: "100644" }] };
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
  const native = nativeReader({ ...f, candidate: source }, "fixture-bot", false, incompleteInventory), executable = Bun.which("git");
  if (!executable) throw Error("fixture requires Git");
  writeFileSync(join(f.root, "native-bin", "git"), `#!${process.execPath}
const args = process.argv.slice(2), target = args.indexOf("https://github.com/fixture/docs.git");
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
  return { ...f, ...common, repo, source, candidate, head, artifacts, selection, baseline, assessment, verified, decisions, native,
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
