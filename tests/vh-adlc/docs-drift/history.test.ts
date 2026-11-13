import { expect, test } from "bun:test";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createActionsEnvelope, createProducerSource, collectLocalHistory, collectActionsHistory, downloadActionsArtifact, publicationMarker, readReviewedProposal, verifyActionsReport } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import type { HistoryContext, ProducerSource, VerifiedProducer } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { attentionProjection, buildReport } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { settingsFixture } from "./settings-fixture";
import { createGitHubReader, createRepositoryReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { git, populateRepository } from "./repository-fixture";
import type { ArtifactInput, WorkflowRunInput } from "../../../plugins/vh-adlc/scripts/github-read";

const hash = (text: string) => sha256(Buffer.from(text));
const context: HistoryContext = { repository: "fixture/docs", scope_sha256: hash("scope"), run_id: "102", started_at: "2026-11-06T10:00:00Z" };
const producer: VerifiedProducer = { source_commit: "b".repeat(40), manifest_sha256: hash("manifest"), component_sha256: hash("component"), source_inputs_sha256: hash("native-source-inputs"), job_name: "Documentation drift", attention_step: "Attention status", required_steps: ["Collect", "Review", "Upload report", "Attention status"] };
function settings() { const input = settingsFixture(); return parseSettings({ ...input, reports: { ...input.reports, workflow_id: 55 } }); }
function report() {
  const item = { repository: context.repository, scope_sha256: context.scope_sha256, identity: "claims:guide", disposition: "unknown" as const, reason: "Current source verification pending", owner_action: "Choose the behavior", rule: { detector: "claims" }, inputs: { guide: hash("guide") }, required_inputs: ["guide"], title: "Behavior decision", links: [] };
  return buildReport({ repository: context.repository, scope_sha256: context.scope_sha256, run_id: "101", started_at: "2026-11-05T10:00:01Z", completed_at: "2026-11-05T10:01:00Z", source_commit: producer.source_commit, collection_complete: true, failures: [], attention: [item], corrections: [], proposals: [], published: [], history: { captured_at: "2026-11-05T10:00:01Z", records: [], diagnostics: [] } });
}
function zip(report: Uint8Array, provenance: Uint8Array): Buffer {
  const program = "import base64,io,json,sys,zipfile\nd=json.load(sys.stdin);s=io.BytesIO()\nwith zipfile.ZipFile(s,'w',compression=zipfile.ZIP_DEFLATED) as z:\n for name in ['report','provenance']:\n  info=zipfile.ZipInfo(name+'.json');info.create_system=3;info.external_attr=0o100600<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,base64.b64decode(d[name]))\nsys.stdout.buffer.write(s.getvalue())\n";
  const result = Bun.spawnSync(["python3", "-c", program], { stdin: Buffer.from(JSON.stringify({ report: Buffer.from(report).toString("base64"), provenance: Buffer.from(provenance).toString("base64") })), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}
function fixture() {
  const selected = settings();
  const run: WorkflowRunInput = { id: 101, run_attempt: 2, workflow_id: 55, path: selected.reports.workflow_path, event: "schedule", status: "completed", conclusion: "failure", head_sha: producer.source_commit, head_branch: "main", repository: { id: 11, full_name: context.repository }, head_repository: { id: 11, full_name: context.repository }, created_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-05T10:02:00Z" };
  const bytes = canonicalJSON(report());
  const envelope = createActionsEnvelope(bytes, { settings: selected, run, producer });
  const archive = zip(bytes, envelope);
  const artifact: ArtifactInput = { id: 201, name: "docs-drift-101-2", size_in_bytes: archive.length, digest: "sha256:" + sha256(archive), expired: false, created_at: "2026-11-05T10:01:01Z", expires_at: "2026-12-01T00:00:00Z", workflow_run: { id: 101, repository_id: 11, head_repository_id: 11, head_branch: "main", head_sha: producer.source_commit } };
  const jobs = [{ id: 301, run_id: 101, attempt: 2, head_sha: producer.source_commit, name: producer.job_name, status: "completed", conclusion: "failure", steps: producer.required_steps.map((name, index) => ({ number: index + 1, name, status: "completed", conclusion: name === producer.attention_step ? "failure" : "success" })) }];
  return { settings: selected, context, run, artifact, archive, producer, jobs, report_bytes: bytes, provenance_bytes: envelope };
}

test("a complete first-red scheduled report carries attention only with matching native provenance", async () => {
  const input = fixture();
  const verified = await verifyActionsReport(input);
  expect(verified.record.kind).toBe("report");
  expect(verified.record.sha256).toBe(sha256(input.report_bytes));
  expect(verified.receipt).toMatchObject({ origin: "actions", run_id: 101, run_attempt: 2, artifact_id: 201, archive_sha256: sha256(input.archive) });
  const current = report();
  current.run_id = context.run_id;
  const projection = attentionProjection(current.attention[0].item);
  expect(projection.sha256).toBe(current.attention[0].projection.sha256);
  const matches = buildReport({ ...context, completed_at: "2026-11-06T10:01:00Z", source_commit: "c".repeat(40), collection_complete: true, failures: [], attention: current.attention.map(row => row.item), corrections: [], proposals: [], published: [], history: { captured_at: context.started_at, records: [verified.record], diagnostics: [] } });
  expect(matches.outcome).toBe("carried-attention");
});

test("the upload envelope never contains its future artifact ID, archive digest or expiry", () => {
  const input = fixture();
  const parsed: unknown = JSON.parse(input.provenance_bytes.toString());
  expect(parsed).not.toHaveProperty("artifact_id");
  expect(parsed).not.toHaveProperty("archive_sha256");
  expect(parsed).not.toHaveProperty("expires_at");
  expect(parsed).toMatchObject({ report_sha256: sha256(input.report_bytes), producer: { manifest_sha256: producer.manifest_sha256 } });
});

test.each(["matching", "missing-job", "missing-step", "wrong-step-result"])("protected split-job history requires every original collection step: %s", async fault => {
  const input = fixture();
  const bound: VerifiedProducer & { required_jobs: Array<{ name: string; steps: string[] }> } = { ...producer,
    required_jobs: [{ name: producer.job_name, steps: [...producer.required_steps] }, { name: "Credential-free collection", steps: ["Read original corpus"] }] };
  input.producer = bound;
  input.provenance_bytes = createActionsEnvelope(input.report_bytes, { settings: input.settings, run: input.run, producer: bound });
  input.archive = zip(input.report_bytes, input.provenance_bytes);
  input.artifact = { ...input.artifact, size_in_bytes: input.archive.length, digest: "sha256:" + sha256(input.archive) };
  if (fault !== "missing-job") input.jobs.push({ ...input.jobs[0], id: 302, name: "Credential-free collection", conclusion: "success",
    steps: fault === "missing-step" ? [] : [{ number: 1, name: "Read original corpus", status: "completed", conclusion: fault === "wrong-step-result" ? "skipped" : "success" }] });
  if (fault === "matching") expect((await verifyActionsReport(input)).record.sha256).toBe(sha256(input.report_bytes));
  else await expect(verifyActionsReport(input)).rejects.toThrow("required producer job");
});

test("foreign workflow/repository/branch, fork, PR/dispatch/test context and unknown producer cannot carry", async () => {
  for (const change of [
    { workflow_id: 99 }, { path: ".github/workflows/foreign.yml" }, { event: "pull_request" }, { event: "workflow_dispatch" },
    { head_branch: "feature" }, { repository: { id: 99, full_name: "foreign/docs" } }, { head_repository: { id: 99, full_name: "foreign/docs" } },
    { status: "in_progress" }, { conclusion: "cancelled" }, { id: 102 },
  ]) {
    const input = fixture();
    input.run = { ...input.run, ...change };
    await expect(verifyActionsReport(input)).rejects.toThrow();
  }
  const unknown = fixture();
  unknown.producer = { ...producer, component_sha256: hash("unapproved-component") };
  await expect(verifyActionsReport(unknown)).rejects.toThrow();
  const planted = fixture();
  const envelope = JSON.parse(planted.provenance_bytes.toString());
  envelope.context = "synthetic";
  planted.archive = zip(planted.report_bytes, canonicalJSON(envelope));
  planted.artifact = { ...planted.artifact, size_in_bytes: planted.archive.length, digest: "sha256:" + sha256(planted.archive) };
  await expect(verifyActionsReport(planted)).rejects.toThrow();
});

test("expired, too old, post-snapshot, mismatched bytes/IDs and extra envelope fields are ineligible", async () => {
  for (const change of [{ expired: true }, { expires_at: context.started_at }, { created_at: "2026-11-06T10:00:01Z" }, { name: "planted" }, { digest: "sha256:" + "0".repeat(64) }, { size_in_bytes: 5 }, { workflow_run: { id: 555, repository_id: 11, head_repository_id: 11, head_branch: "main", head_sha: producer.source_commit } }]) {
    const input = fixture();
    input.artifact = { ...input.artifact, ...change };
    await expect(verifyActionsReport(input)).rejects.toThrow();
  }
  const futureField = fixture();
  futureField.archive = zip(futureField.report_bytes, canonicalJSON({ ...JSON.parse(futureField.provenance_bytes.toString()), artifact_id: 201 }));
  futureField.artifact = { ...futureField.artifact, digest: "sha256:" + sha256(futureField.archive), size_in_bytes: futureField.archive.length };
  await expect(verifyActionsReport(futureField)).rejects.toThrow();
  const tooOld = fixture();
  tooOld.settings.reports.max_age_seconds = 10;
  await expect(verifyActionsReport(tooOld)).rejects.toThrow();
});

test("native technical or upload failures cannot hide behind a first-red attention envelope", async () => {
  for (const step of ["Collect", "Review", "Upload report"]) {
    const input = fixture();
    const failed = input.jobs[0].steps.find(row => row.name === step);
    if (!failed) throw new Error("Missing fixture step");
    failed.conclusion = "failure";
    await expect(verifyActionsReport(input)).rejects.toThrow();
  }
  const missing = fixture();
  missing.jobs[0].steps = missing.jobs[0].steps.filter(row => row.name !== "Upload report");
  await expect(verifyActionsReport(missing)).rejects.toThrow();
  const incomplete = fixture();
  const modified = { ...report(), collection_complete: false };
  const bytes = canonicalJSON(modified);
  expect(() => createActionsEnvelope(bytes, { settings: incomplete.settings, run: incomplete.run, producer })).toThrow();
});

test("local history requires adopted private regular pairs and exact owned invocation attestations", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-local-history-"));
  try {
    const adopted = settingsFixture();
    const local = parseSettings({ ...adopted, reports: { ...adopted.reports, interactive: "local-attestation", local_history_roots: ["history"] } });
    const historyRoot = join(root, "history");
    mkdirSync(historyRoot, { mode: 0o700 });
    const runRoot = join(historyRoot, "run-101");
    mkdirSync(runRoot, { mode: 0o700 });
    const bytes = canonicalJSON(report());
    const invocation = { origin: "local-attestation" as const, context: "production" as const, repository: context.repository, id: "local-101", source_commit: producer.source_commit, component_sha256: producer.component_sha256, request_sha256: hash("request"), scope_sha256: context.scope_sha256, report_sha256: sha256(bytes), completed_at: "2026-11-05T10:01:00Z" };
    const envelope = { schema: "docs-drift-provenance/v1", origin: "local-attestation", repository: context.repository, scope_sha256: context.scope_sha256, context: "production", report_sha256: sha256(bytes), invocation, invocation_sha256: canonicalDigest(invocation) };
    writeFileSync(join(runRoot, "report.json"), bytes, { mode: 0o600 });
    writeFileSync(join(runRoot, "provenance.json"), canonicalJSON(envelope), { mode: 0o600 });
    const earlier = new Date("2026-11-05T10:01:01Z");
    for (const name of ["report.json", "provenance.json"]) utimesSync(join(runRoot, name), earlier, earlier);
    const options = { repo: root, settings: local, context, invocations: [{ ...invocation, invocation_sha256: canonicalDigest(invocation) }] };
    expect(collectLocalHistory(options).records).toHaveLength(1);
    expect(collectLocalHistory({ ...options, invocations: [] }).records).toHaveLength(0);
    for (const changed of [{ ...envelope, origin: "actions" }, { ...envelope, context: "synthetic" }]) {
      writeFileSync(join(runRoot, "provenance.json"), canonicalJSON(changed));
      utimesSync(join(runRoot, "provenance.json"), earlier, earlier);
      expect(collectLocalHistory(options).records).toHaveLength(0);
    }
    writeFileSync(join(runRoot, "provenance.json"), canonicalJSON(envelope));
    utimesSync(join(runRoot, "provenance.json"), earlier, earlier);
    chmodSync(join(runRoot, "report.json"), 0o644);
    expect(collectLocalHistory(options).records).toHaveLength(0);
    chmodSync(join(runRoot, "report.json"), 0o600);
    writeFileSync(join(runRoot, "report.json"), Buffer.concat([bytes, Buffer.from(" ")]));
    expect(collectLocalHistory(options).records).toHaveLength(0);
    writeFileSync(join(runRoot, "report.json"), bytes);
    rmSync(join(runRoot, "provenance.json"));
    symlinkSync(join(runRoot, "report.json"), join(runRoot, "provenance.json"));
    expect(collectLocalHistory(options).records).toHaveLength(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("malformed outcome/projection combinations cannot create an eligible producer envelope", () => {
  const current = fixture();
  const inconsistent = canonicalJSON({ ...report(), outcome: "no-change", success: true });
  expect(() => createActionsEnvelope(inconsistent, { settings: current.settings, run: current.run, producer })).toThrow();
});

test("the native binary backend accepts only a numeric same-repository API endpoint", async () => {
  const input = fixture();
  const root = mkdtempSync(join(tmpdir(), "docs-drift-history-download-"));
  const source = join(root, "source"), artifacts = join(root, "artifacts"), bin = join(root, "bin");
  for (const directory of [source, artifacts, bin]) mkdirSync(directory, { mode: 0o700 });
  populateRepository(source);
  const observed = join(root, "request.json");
  const program = `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(observed)},JSON.stringify({args:process.argv.slice(2),aws:process.env.AWS_SECRET_ACCESS_KEY,token:process.env.GH_TOKEN}));process.stdout.write(Buffer.from(${JSON.stringify(input.archive.toString("base64"))},'base64'));\n`;
  writeFileSync(join(bin, "gh"), program); chmodSync(join(bin, "gh"), 0o700);
  try {
    const downloaded = await downloadActionsArtifact({ repo: source, artifact_root: artifacts, settings: input.settings, artifact: input.artifact, environment: { PATH: bin, GH_TOKEN: "synthetic-history-token" } });
    expect(downloaded.bytes.equals(input.archive)).toBe(true);
    const request: unknown = JSON.parse(readFileSync(observed, "utf8"));
    expect(request).toMatchObject({ args: ["api", "--hostname", "github.com", "--method", "GET", "repos/fixture/docs/actions/artifacts/201/zip"], token: "synthetic-history-token" });
    expect(request).not.toHaveProperty("aws");
    expect(request).not.toHaveProperty("archive_download_url");
    expect(readFileSync(downloaded.record_path, "utf8")).not.toContain("synthetic-history-token");
    await expect(downloadActionsArtifact({ repo: source, artifact_root: artifacts, settings: input.settings, artifact: { ...input.artifact, id: -1 }, environment: {} })).rejects.toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function nativeFixture(root: string) {
  const source = join(root, "source"), artifacts = join(root, "artifacts"), bin = join(root, "bin");
  for (const directory of [source, artifacts, bin]) mkdirSync(directory, { mode: 0o700 });
  const populated = populateRepository(source), input = fixture();
  const workflow = readFileSync(join(source, input.settings.reports.workflow_path));
  const observedProducer = { ...producer, source_commit: populated.commit,
    source_inputs_sha256: canonicalDigest([[input.settings.reports.workflow_path, sha256(workflow)]]) };
  input.producer = observedProducer;
  input.run.head_sha = populated.commit;
  input.artifact.workflow_run.head_sha = populated.commit;
  input.jobs[0].head_sha = populated.commit;
  input.report_bytes = canonicalJSON({ ...report(), source_commit: populated.commit });
  input.provenance_bytes = createActionsEnvelope(input.report_bytes, { settings: input.settings, run: input.run, producer: observedProducer });
  input.archive = zip(input.report_bytes, input.provenance_bytes);
  input.artifact.digest = "sha256:" + sha256(input.archive);
  input.artifact.size_in_bytes = input.archive.length;
  const prefix = "repos/fixture/docs";
  const responses: Record<string, unknown> = {
    [prefix]: { id: 11, full_name: "fixture/docs", default_branch: "main" },
    [prefix + "/actions/workflows/55"]: { id: 55, path: input.settings.reports.workflow_path, state: "active" },
    [prefix + "/actions/workflows/55/runs?event=schedule&branch=main&status=completed&per_page=30&page=1"]: { total_count: 1, workflow_runs: [input.run] },
    [prefix + "/actions/runs/101/attempts/2"]: input.run,
    [prefix + "/actions/runs/101/artifacts?per_page=100&page=1"]: { total_count: 1, artifacts: [input.artifact] },
    [prefix + "/actions/artifacts/201"]: { ...input.artifact, archive_download_url: "https://foreign.invalid/ignored" },
    [prefix + "/actions/runs/101/attempts/2/jobs?per_page=100&page=1"]: { total_count: 1, jobs: input.jobs },
  };
  const rootTree = git(source, "rev-parse", "HEAD^{tree}");
  responses[prefix + "/git/commits/" + populated.commit] = { sha: populated.commit, tree: { sha: rootTree }, parents: [], message: "Owned fixture" };
  function tree(sha: string) {
    const entries = git(source, "ls-tree", "-z", sha).split("\0").filter(Boolean).map(row => {
      const match = /^(\d{6}) (blob|tree) ([a-f0-9]{40})\t(.+)$/u.exec(row);
      if (!match) throw new Error("Invalid fixture tree");
      return { mode: match[1], type: match[2], sha: match[3], path: match[4] };
    });
    responses[prefix + "/git/trees/" + sha] = { sha, truncated: false, tree: entries };
    for (const entry of entries) {
      if (entry.type === "tree") tree(entry.sha);
      else {
        const read = Bun.spawnSync(["git", "-C", source, "cat-file", "blob", entry.sha], { stdout: "pipe", stderr: "pipe" });
        if (read.exitCode !== 0) throw new Error("Fixture blob unavailable");
        responses[prefix + "/git/blobs/" + entry.sha] = { sha: entry.sha, size: read.stdout.length, encoding: "base64", content: read.stdout.toString("base64") };
      }
    }
  }
  tree(rootTree);
  const responsePath = join(root, "responses.json"), log = join(root, "requests.jsonl");
  writeFileSync(responsePath, JSON.stringify(responses));
  const program = `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);const endpoint=args.at(-1);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');if(endpoint==='repos/fixture/docs/actions/artifacts/201/zip'){process.stdout.write(Buffer.from(${JSON.stringify(input.archive.toString("base64"))},'base64'));}else{const value=JSON.parse(fs.readFileSync(${JSON.stringify(responsePath)},'utf8'))[endpoint];if(value===undefined){console.log('HTTP/2.0 404 Not Found\\r\\n\\r\\n{}');process.exit(1);}console.log('HTTP/2.0 200 OK\\r\\n\\r\\n'+JSON.stringify(value));}\n`;
  writeFileSync(join(bin, "gh"), program); chmodSync(join(bin, "gh"), 0o700);
  const environment = { PATH: bin, GH_TOKEN: "synthetic-history-token" };
  const reader = createRepositoryReader(createGitHubReader("github.com", { inherit_env: false, env: environment }), "fixture/docs");
  const options = { repo: source, artifact_root: artifacts, settings: input.settings, context, environment, reader,
    verifyProducer: (observed: ProducerSource) => {
      if (!observed.file(input.settings.reports.workflow_path)?.equals(workflow)) throw new Error("Unapproved producer source");
      return observedProducer;
    } };
  return { input, options, responses, responsePath, log };
}

test("native history uses hash-checked producer source, typed job reads and the packaged binary path", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-history-native-"));
  try {
    const fixture = nativeFixture(root);
    const result = await collectActionsHistory(fixture.options);
    expect(result.diagnostics).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.receipts).toHaveLength(1);
    const requests: unknown[] = readFileSync(fixture.log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    for (const request of requests) {
      expect(request).toEqual(expect.arrayContaining(["api", "--method", "GET"]));
      expect(JSON.stringify(request)).not.toContain("foreign.invalid");
    }
    fixture.responses["repos/fixture/docs/actions/runs/101/artifacts?per_page=100&page=1"] = { total_count: 2, artifacts: [fixture.input.artifact] };
    writeFileSync(fixture.responsePath, JSON.stringify(fixture.responses));
    const incomplete = await collectActionsHistory(fixture.options);
    expect(incomplete.complete).toBe(false);
    expect(incomplete.records).toHaveLength(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("history run limits bound API reads and an unapproved producer never becomes a match", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-history-limit-"));
  try {
    const fixture = nativeFixture(root);
    fixture.input.settings.reports.max_runs = 1;
    fixture.responses["repos/fixture/docs/actions/workflows/55/runs?event=schedule&branch=main&status=completed&per_page=1&page=1"] = { total_count: 1000, workflow_runs: [fixture.input.run] };
    writeFileSync(fixture.responsePath, JSON.stringify(fixture.responses));
    const result = await collectActionsHistory(fixture.options);
    expect(result.complete).toBe(true);
    expect(result.records).toHaveLength(1);
    const refused = await collectActionsHistory({ ...fixture.options, verifyProducer: () => { throw new Error("Unapproved lineage"); } });
    expect(refused.complete).toBe(false);
    expect(refused.records).toHaveLength(0);
    expect(readFileSync(fixture.log, "utf8")).not.toContain("page=2");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("only equivalent native workflow ref forms match the recorded producer", async () => {
  for (const suffix of ["@main", "@refs/heads/main", "@" + producer.source_commit]) {
    const input = fixture();
    input.run.path += suffix;
    await expect(verifyActionsReport(input)).resolves.toHaveProperty("receipt.origin", "actions");
  }
  const foreign = fixture();
  foreign.run.path += "@feature";
  await expect(verifyActionsReport(foreign)).rejects.toThrow();
});

function writeGit(repo: string, args: string[], bytes: Buffer): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdin: bytes, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

test("PR attention reads only its retained metadata ref and refuses edited bodies or unknown review policy", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-history-pr-"));
  try {
    const fixture = nativeFixture(root), settings = fixture.input.settings;
    const source = fixture.options.repo, operation = "unit-operation";
    const marker = publicationMarker(settings, operation);
    const body = "Reviewed advisory\n\n" + marker;
    const head = fixture.input.run.head_sha, tree = git(source, "rev-parse", head + "^{tree}");
    const plan = { repository: settings.repository, repository_id: 11, operation_id: operation, actor: "fixture-bot", actor_id: 12, head, tree,
      body_sha256: hash(body), corrections: [hash("patch")], attention: report().attention.map(row => row.projection) };
    const planBytes = canonicalJSON(plan);
    const blob = writeGit(source, ["hash-object", "-w", "--stdin"], planBytes);
    const receiptTree = writeGit(source, ["mktree"], Buffer.from(`100644 blob ${blob}\tplan.json\n`));
    const receiptCommit = git(source, "commit-tree", receiptTree, "-m", "Owned reviewed metadata");
    const ref = settings.publication.receipt_ref_prefix + operation;
    const identity = { id: 11, full_name: settings.repository };
    const pull = { number: 7, state: "open", merged_at: null, body, draft: true, user: { login: "fixture-bot", id: 12, type: "Bot" },
      head: { sha: head, ref: "docs-drift/advisory", repo: identity }, base: { sha: head, ref: "main", repo: identity } };
    Object.assign(fixture.responses, {
      "repos/fixture/docs/pulls/7": pull,
      ["repos/fixture/docs/git/ref/" + ref.slice(5)]: { ref, object: { type: "commit", sha: receiptCommit } },
      ["repos/fixture/docs/git/commits/" + receiptCommit]: { sha: receiptCommit, tree: { sha: receiptTree }, parents: [], message: "Owned reviewed metadata" },
      ["repos/fixture/docs/git/trees/" + receiptTree]: { sha: receiptTree, truncated: false, tree: [{ path: "plan.json", mode: "100644", type: "blob", sha: blob }] },
      ["repos/fixture/docs/git/blobs/" + blob]: { sha: blob, size: planBytes.length, encoding: "base64", content: planBytes.toString("base64") },
    });
    writeFileSync(fixture.responsePath, JSON.stringify(fixture.responses));
    const reader = fixture.options.reader;
    const original = reader.pull(7);
    const verify = (bytes: Buffer) => {
      if (!bytes.equals(planBytes)) throw new Error("Unknown reviewed intent");
      return plan;
    };
    const verified = await readReviewedProposal({ reader, settings, proposal: original, verifyPlan: verify });
    expect(verified.reviewed.body_sha256).toBe(hash(body));
    expect(verified.receipt).toMatchObject({ ref, object: receiptCommit, plan_sha256: sha256(planBytes) });
    fixture.responses["repos/fixture/docs/pulls/7"] = { ...pull, body: body + "\nChanged after review" };
    writeFileSync(fixture.responsePath, JSON.stringify(fixture.responses));
    await expect(readReviewedProposal({ reader, settings, proposal: original, verifyPlan: verify })).rejects.toThrow();
    await expect(readReviewedProposal({ reader, settings, proposal: reader.pull(7), verifyPlan: verify })).rejects.toThrow();
    fixture.responses["repos/fixture/docs/pulls/7"] = pull;
    writeFileSync(fixture.responsePath, JSON.stringify(fixture.responses));
    await expect(readReviewedProposal({ reader, settings, proposal: original, verifyPlan: () => { throw new Error("Policy no longer approved"); } })).rejects.toThrow();
    expect(readFileSync(fixture.log, "utf8")).not.toContain("https://foreign.invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("known pre-adoption producer runs stay ineligible while current history collection can finish", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-history-legacy-"));
  try {
    const fixture = nativeFixture(root);
    const result = await collectActionsHistory({ ...fixture.options, verifyProducer: () => null });
    expect(result.complete).toBe(true);
    expect(result.records).toHaveLength(0);
    expect(result.diagnostics[0]).toContain("no approved producer lineage");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("successful no-change reports have a successful native final step and job", async () => {
  const input = fixture();
  input.run.conclusion = "success";
  input.jobs[0].conclusion = "success";
  for (const step of input.jobs[0].steps) step.conclusion = "success";
  input.report_bytes = canonicalJSON({ ...report(), attention: [], outcome: "no-change", success: true });
  input.provenance_bytes = createActionsEnvelope(input.report_bytes, { settings: input.settings, run: input.run, producer });
  input.archive = zip(input.report_bytes, input.provenance_bytes);
  input.artifact = { ...input.artifact, size_in_bytes: input.archive.length, digest: "sha256:" + sha256(input.archive) };
  await expect(verifyActionsReport(input)).resolves.toHaveProperty("receipt.origin", "actions");
  input.jobs[0].steps[0].conclusion = "failure";
  await expect(verifyActionsReport(input)).rejects.toThrow();
});

test("a missing installed codec is a current setup failure even when old history would match", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-history-codec-"));
  try {
    const fixture = nativeFixture(root), scripts = join(root, "installed-scripts");
    cpSync(join(import.meta.dir, "../../../plugins/vh-adlc/scripts"), scripts, { recursive: true,
      filter: path => !path.endsWith("/vendor/zip-reader.cjs") && !path.split("/").includes("node_modules") });
    const program = `const {collectActionsHistory}=await import(${JSON.stringify(join(scripts, "docs-drift/report-history.ts"))});const {createGitHubReader,createRepositoryReader}=await import(${JSON.stringify(join(scripts, "github-read.ts"))});const environment=${JSON.stringify(fixture.options.environment)};const reader=createRepositoryReader(createGitHubReader('github.com',{inherit_env:false,env:environment}),'fixture/docs');const expected=${JSON.stringify(fixture.input.producer)};const result=await collectActionsHistory({repo:${JSON.stringify(fixture.options.repo)},artifact_root:${JSON.stringify(fixture.options.artifact_root)},settings:${JSON.stringify(fixture.options.settings)},context:${JSON.stringify(context)},reader,environment,verifyProducer(source){source.file(${JSON.stringify(fixture.input.settings.reports.workflow_path)});return expected;}});if(result.complete||result.records.length)process.exit(2);console.log(JSON.stringify(result.diagnostics));`;
    const result = Bun.spawnSync([process.execPath, "--eval", program], { env: { PATH: process.env.PATH, HOME: process.env.HOME, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" }, stdout: "pipe", stderr: "pipe" });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("requires verified setup");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("producer verification cannot mutate the retained native input bytes through its returned buffer", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-history-source-"));
  try {
    const fixture = nativeFixture(root), path = fixture.input.settings.reports.workflow_path;
    const source = createProducerSource(fixture.options.reader, fixture.input.run.head_sha);
    const observed = source.file(path);
    if (!observed) throw new Error("Missing native fixture source");
    const original = Buffer.from(observed);
    observed.fill(0);
    const again = source.file(path);
    expect(again?.equals(original)).toBe(true);
    expect(source.bindings()).toEqual([[path, sha256(original)]]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
