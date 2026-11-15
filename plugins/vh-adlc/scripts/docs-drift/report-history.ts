import { isPublisherLogin, sameLogin, projectRecordedAccount } from "./identity";
import { randomUUID } from "node:crypto";
import { constants, closeSync, mkdirSync, writeFileSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { GitHubReadError, type ArtifactInput, type JobInput, type PullRequestInput, type RepositoryReader, type WorkflowRunInput } from "../github-read";
import { ArchiveSetupError, readReportArchive } from "./archive";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { reportTime } from "./report";
import type { AttentionProjection, HistorySnapshot } from "./report";
import type { Settings } from "./settings";
import { externalArtifactDirectory } from "./snapshot";
import { executeOwnedProcess, ownedClientCompleted } from "./owned-process";

export type HistoryContext = { repository: string; scope_sha256: string; run_id: string; started_at: string };
/** Internal result of adopted-source verification. A report or CLI flag cannot supply this result. */
export type VerifiedProducer = {
  source_commit: string; manifest_sha256: string; component_sha256: string; source_inputs_sha256: string;
  job_name: string; attention_step: string; required_steps: string[];
  required_jobs?: Array<{ name: string; steps: string[] }>;
};
export type HistoryJob = JobInput;
type HistoryRecord = HistorySnapshot["records"][number];
export type OwnedInvocation = {
  origin: "local-attestation"; context: "production"; repository: string;
  id: string; source_commit: string; component_sha256: string; request_sha256: string; scope_sha256: string;
  report_sha256: string; completed_at: string; invocation_sha256: string;
};

/** An owner attestation has a closed shape and binds all recorded invocation fields. */
export function parseOwnedInvocation(value: unknown): OwnedInvocation {
  const row = object(value), fields = ["origin", "context", "repository", "id", "source_commit", "component_sha256", "request_sha256",
    "scope_sha256", "report_sha256", "completed_at", "invocation_sha256"];
  if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))
    || row.origin !== "local-attestation" || row.context !== "production") invalid("local invocation fields");
  text(row.repository); text(row.id);
  if (typeof row.source_commit !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(row.source_commit)) invalid("local source commit");
  for (const field of ["component_sha256", "request_sha256", "scope_sha256", "report_sha256", "invocation_sha256"]) hash(row[field]);
  reportTime(text(row.completed_at));
  const { invocation_sha256, ...original } = row;
  if (canonicalDigest(original) !== invocation_sha256) invalid("local invocation digest");
  return freezeJSON({ ...row }) as OwnedInvocation;
}

export class HistoryEligibilityError extends Error {
  constructor(reason: string) { super(`ineligible docs-drift history ${reason}`); }
}
export class PublicationEvidenceChanged extends HistoryEligibilityError {}
function invalid(reason: string): never { throw new HistoryEligibilityError(reason); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("object");
  return value as Record<string, unknown>;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) invalid("digest");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || /\0/u.test(value)) invalid("text");
  canonicalJSON(value);
  return value;
}
function parseCanonical(bytes: Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(Buffer.from(bytes))) invalid("noncanonical bytes");
  return object(value);
}
function reportRecord(bytes: Uint8Array): Record<string, unknown> {
  const report = parseCanonical(bytes);
  if (report.schema !== "docs-drift-report/v1" || report.collection_complete !== true
    || !Array.isArray(report.failures) || report.failures.length !== 0 || !Array.isArray(report.attention)
    || !["no-change", "carried-attention", "carried-delivery", "published", "new-attention"].includes(String(report.outcome))) invalid("technical report state");
  if (reportTime(text(report.completed_at)) < reportTime(text(report.started_at))) invalid("report chronology");
  hash(report.scope_sha256);
  text(report.repository); text(report.run_id); text(report.source_commit);
  for (const entry of report.attention) {
    const projection = object(object(entry).projection), binding = object(projection.binding);
    if (projection.version !== 1 || binding.version !== 1 || projection.sha256 !== canonicalDigest(binding)
      || binding.repository !== report.repository || binding.scope_sha256 !== report.scope_sha256) invalid("attention binding");
  }
  if (!Array.isArray(report.published) || !Array.isArray(report.carried_delivery) || !Array.isArray(report.pending_corrections)
    || report.pending_corrections.length !== 0) invalid("report delivery fields");
  const newAttention = report.attention.some(entry => {
    const row = object(entry);
    if (!Array.isArray(row.carried_from) || row.carried_from.some(value => typeof value !== "string" || !value)) invalid("carried report entry");
    return row.carried_from.length === 0;
  });
  const expected = newAttention ? "new-attention" : report.published.length ? "published" : report.carried_delivery.length ? "carried-delivery"
    : report.attention.length ? "carried-attention" : "no-change";
  const delivery = report.published.length ? "published" : report.carried_delivery.length ? "carried" : "none";
  if (report.outcome !== expected || report.success !== (expected !== "new-attention") || report.delivery !== delivery) invalid("report outcome fields");
  return report;
}
function producerIdentity(producer: VerifiedProducer): void {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(producer.source_commit)) invalid("producer commit");
  hash(producer.manifest_sha256); hash(producer.component_sha256); hash(producer.source_inputs_sha256);
  text(producer.job_name); text(producer.attention_step);
  if (!Array.isArray(producer.required_steps) || !producer.required_steps.length
    || new Set(producer.required_steps).size !== producer.required_steps.length || !producer.required_steps.includes(producer.attention_step)) invalid("producer step policy");
  for (const step of producer.required_steps) text(step);
  if (producer.required_jobs !== undefined) {
    const required = producer.required_jobs;
    if (!Array.isArray(required) || !required.length || new Set(required.map(job => text(job.name))).size !== required.length)
      invalid("producer job policy");
    for (const job of required) {
      if (!Array.isArray(job.steps) || !job.steps.length || new Set(job.steps).size !== job.steps.length) invalid("producer job step policy");
      for (const step of job.steps) text(step);
    }
    const selected = required.filter(job => job.name === producer.job_name);
    if (selected.length !== 1 || !canonicalJSON(selected[0].steps).equals(canonicalJSON(producer.required_steps))) invalid("producer attention job policy");
  }
}
function workflowMatches(settings: Settings, run: WorkflowRunInput): boolean {
  const path = settings.reports.workflow_path;
  return [path, `${path}@${settings.default_branch}`, `${path}@refs/heads/${settings.default_branch}`, `${path}@${run.head_sha}`].includes(run.path);
}
function supportedEvent(settings: Settings, event: string): boolean {
  return event === "schedule" || settings.schema_version === 2 && event === "workflow_dispatch";
}
function artifactName(settings: Settings, run: WorkflowRunInput): string {
  return settings.reports.artifact_name_template.replaceAll("{run_id}", String(run.id)).replaceAll("{run_attempt}", String(run.run_attempt));
}

/** Build only pre-upload facts. Native artifact identity and ZIP integrity are observed after upload. */
export function createActionsEnvelope(bytes: Uint8Array, input: { settings: Settings; run: WorkflowRunInput; producer: VerifiedProducer }): Buffer {
  const report = reportRecord(bytes);
  const { settings, run, producer } = input;
  producerIdentity(producer);
  if (report.repository !== settings.repository || report.run_id !== String(run.id) || report.source_commit !== run.head_sha
    || producer.source_commit !== run.head_sha || run.workflow_id !== settings.reports.workflow_id
    || !workflowMatches(settings, run) || run.head_branch !== settings.default_branch || !supportedEvent(settings, run.event)) invalid("producer/report binding");
  return canonicalJSON({ schema: "docs-drift-provenance/v1", origin: "actions", context: "production", repository: settings.repository,
    scope_sha256: report.scope_sha256, run_id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha,
    branch: run.head_branch, event: run.event, workflow_id: run.workflow_id, workflow_path: settings.reports.workflow_path,
    artifact_name: artifactName(settings, run), report_schema: report.schema, attention_version: 1,
    attention_sha256: canonicalDigest(report.attention), report_sha256: sha256(bytes), producer });
}

/** Create local owner-attestation bytes. The controller separately retains the original invocation. */
export function createLocalEnvelope(bytes: Uint8Array, input: OwnedInvocation): Buffer {
  const report = reportRecord(bytes), owned = parseOwnedInvocation(input);
  if (report.repository !== owned.repository || report.run_id !== owned.id || report.source_commit !== owned.source_commit
    || report.scope_sha256 !== owned.scope_sha256 || report.completed_at !== owned.completed_at || sha256(bytes) !== owned.report_sha256)
    invalid("local report binding");
  const { invocation_sha256, ...invocation } = owned;
  return canonicalJSON({ schema: "docs-drift-provenance/v1", origin: "local-attestation", repository: owned.repository,
    scope_sha256: owned.scope_sha256, context: "production", report_sha256: sha256(bytes), invocation, invocation_sha256 });
}

function nativeTerminal(run: WorkflowRunInput, jobs: HistoryJob[], producer: VerifiedProducer, outcome: unknown): void {
  const expected = outcome === "new-attention" ? "failure" : "success";
  if (run.conclusion !== expected || jobs.length === 0 || new Set(jobs.map(job => job.id)).size !== jobs.length) invalid("native terminal result");
  const selected = jobs.filter(job => job.name === producer.job_name);
  if (selected.length !== 1) invalid("producer job identity");
  for (const required of producer.required_jobs ?? []) {
    const native = jobs.filter(job => job.name === required.name);
    if (native.length !== 1) invalid("required producer job missing or ambiguous");
    for (const step of required.steps) {
      const matched = native[0].steps.filter(item => item.name === step), attention = required.name === producer.job_name && step === producer.attention_step;
      if (matched.length !== 1 || matched[0].status !== "completed" || matched[0].conclusion !== (attention ? expected : "success"))
        invalid("required producer job step");
    }
  }
  for (const job of jobs) {
    if (job.run_id !== run.id || job.attempt !== run.run_attempt || job.head_sha !== run.head_sha || job.status !== "completed") invalid("native job binding");
    const target = job === selected[0];
    if (job.conclusion !== (target ? expected : "success") && !(job.conclusion === "skipped" && !target)) invalid("native job failure");
    if (target) for (const required of producer.required_steps) {
      const matched = job.steps.filter(step => step.name === required);
      if (matched.length !== 1 || matched[0].status !== "completed" || matched[0].conclusion !== (required === producer.attention_step ? expected : "success")) invalid("required producer step");
    }
    for (const step of job.steps) {
      const attention = target && step.name === producer.attention_step;
      if (step.status !== "completed" || (!attention && step.conclusion !== "success" && step.conclusion !== "skipped")
        || (attention && step.conclusion !== expected)) invalid("native step failure");
    }
  }
}

export async function verifyActionsReport(input: {
  settings: Settings; context: HistoryContext; run: WorkflowRunInput; artifact: ArtifactInput; archive: Uint8Array;
  producer: VerifiedProducer; jobs: HistoryJob[];
}) {
  const { settings, context, run, artifact, archive, producer } = input;
  const started = reportTime(context.started_at);
  if (context.repository !== settings.repository || run.repository.full_name.toLowerCase() !== context.repository.toLowerCase()
    || run.head_repository?.id !== run.repository.id || run.head_repository.full_name.toLowerCase() !== context.repository.toLowerCase()
    || run.status !== "completed" || String(run.id) === context.run_id || !supportedEvent(settings, run.event)
    || run.workflow_id !== settings.reports.workflow_id || !workflowMatches(settings, run)
    || run.head_branch !== settings.default_branch || reportTime(run.updated_at) >= started) invalid("native producer");
  const created = reportTime(artifact.created_at);
  if (artifact.expired || reportTime(artifact.expires_at) <= started || created >= started
    || created < reportTime(run.created_at) || created > reportTime(run.updated_at)
    || started - created > settings.reports.max_age_seconds * 1000 || artifact.name !== artifactName(settings, run)
    || artifact.workflow_run.id !== run.id || artifact.workflow_run.repository_id !== run.repository.id
    || artifact.workflow_run.head_repository_id !== run.repository.id || artifact.workflow_run.head_branch !== run.head_branch
    || artifact.workflow_run.head_sha !== run.head_sha || !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest)) invalid("native artifact binding or expiry");
  const decoded = await readReportArchive(archive, { size: artifact.size_in_bytes, sha256: artifact.digest.slice(7) }, settings.reports);
  const report = reportRecord(decoded.report_bytes);
  if (report.repository !== context.repository || report.scope_sha256 !== context.scope_sha256
    || reportTime(text(report.started_at)) < reportTime(run.created_at) || reportTime(text(report.completed_at)) > created) invalid("report scope or chronology");
  const expected = createActionsEnvelope(decoded.report_bytes, { settings, run, producer });
  if (!expected.equals(decoded.provenance_bytes)) invalid("producer envelope does not match observed source");
  nativeTerminal(run, input.jobs, producer, report.outcome);
  const expires = Math.min(reportTime(artifact.expires_at), created + settings.reports.max_age_seconds * 1000);
  const record: HistoryRecord = { kind: "report", locator: `actions:${run.id}:${run.run_attempt}:${artifact.id}`,
    bytes: decoded.report_bytes, sha256: decoded.report_sha256, expires_at: new Date(expires).toISOString() };
  return { record, receipt: { origin: "actions" as const, repository: context.repository, run_id: run.id, run_attempt: run.run_attempt,
    artifact_id: artifact.id, archive_sha256: sha256(archive), report_sha256: decoded.report_sha256,
    provenance_sha256: decoded.provenance_sha256, producer } };
}

function privateDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0) invalid("private owned directory required");
}
function privateFile(path: string, maxBytes: number, before: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0
      || stat.size > maxBytes || stat.mtimeMs > before) invalid("private bounded report file required");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (bytes.length !== stat.size || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size) invalid("report changed during read");
    return bytes;
  } finally { closeSync(fd); }
}

export function collectLocalHistory(options: { repo: string; settings: Settings; context: HistoryContext; invocations?: OwnedInvocation[];
  readInvocation?: (wanted: OwnedInvocation) => OwnedInvocation | null }): HistorySnapshot {
  const { settings, context } = options;
  const snapshot: HistorySnapshot = { captured_at: context.started_at, records: [], diagnostics: [] };
  if (settings.reports.interactive !== "local-attestation") return snapshot;
  if (settings.repository !== context.repository) invalid("local repository scope");
  const repo = realpathSync(options.repo), started = reportTime(context.started_at);
  let inspected = 0;
  for (const configured of settings.reports.local_history_roots) {
    try {
      protocolPath(configured);
      const root = join(repo, configured);
      let parent = repo;
      for (const part of configured.split("/")) {
        parent = join(parent, part);
        if (lstatSync(parent).isSymbolicLink()) invalid("symlink history root");
      }
      const delta = relative(repo, realpathSync(root));
      if (isAbsolute(delta) || delta === ".." || delta.startsWith("../")) invalid("foreign history root");
      privateDirectory(root);
      for (const name of readdirSync(root).sort(compareUTF8).reverse()) {
        if (inspected++ >= settings.reports.max_runs) break;
        try {
          if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(name)) invalid("local run directory");
          const directory = join(root, name);
          privateDirectory(directory);
          if (readdirSync(directory).sort().join(",") !== "provenance.json,report.json") invalid("local report pair");
          const bytes = privateFile(join(directory, "report.json"), settings.reports.max_entry_bytes, started);
          const rawEnvelope = privateFile(join(directory, "provenance.json"), settings.reports.max_entry_bytes, started);
          const report = reportRecord(bytes), envelope = parseCanonical(rawEnvelope), invocation = object(envelope.invocation);
          const digest = canonicalDigest(invocation);
          const wanted = parseOwnedInvocation({ ...invocation, invocation_sha256: digest });
          const owned = options.readInvocation ? options.readInvocation(wanted)
            : options.invocations?.find(candidate => candidate.invocation_sha256 === digest);
          if (!owned || owned.origin !== "local-attestation" || owned.context !== "production" || owned.repository !== context.repository) invalid("unknown invocation attestation");
          const { invocation_sha256: ownedDigest, ...original } = owned;
          if (ownedDigest !== canonicalDigest(original) || !canonicalJSON(original).equals(canonicalJSON(invocation))) invalid("changed invocation attestation");
          const expected = canonicalJSON({ schema: "docs-drift-provenance/v1", origin: "local-attestation", repository: context.repository,
            scope_sha256: context.scope_sha256, context: "production", report_sha256: sha256(bytes), invocation, invocation_sha256: digest });
          const completed = reportTime(text(report.completed_at));
          if (!expected.equals(rawEnvelope) || envelope.report_sha256 !== owned.report_sha256 || report.repository !== context.repository
            || report.scope_sha256 !== context.scope_sha256 || report.run_id === context.run_id || report.source_commit !== owned.source_commit
            || owned.scope_sha256 !== context.scope_sha256 || owned.completed_at !== report.completed_at
            || completed >= started || started - completed > settings.reports.max_age_seconds * 1000) invalid("local report provenance");
          snapshot.records.push({ kind: "report", locator: `local-attestation:${owned.id}`, bytes, sha256: sha256(bytes), expires_at: new Date(completed + settings.reports.max_age_seconds * 1000).toISOString() });
        } catch { snapshot.diagnostics.push(`Local report ${name} is missing, changed or ineligible`); }
      }
    } catch { snapshot.diagnostics.push(`Configured local history root ${configured} is unavailable or ineligible`); }
  }
  return snapshot;
}

export async function downloadActionsArtifact(options: {
  repo: string; artifact_root: string; settings: Settings; artifact: ArtifactInput;
  environment: Readonly<Record<string, string | undefined>>; timeout_ms?: number;
}) {
  const { settings, artifact } = options;
  if (!Number.isSafeInteger(artifact.id) || artifact.id < 1 || !Number.isSafeInteger(artifact.size_in_bytes)
    || artifact.size_in_bytes < 1 || artifact.size_in_bytes > settings.reports.max_archive_bytes
    || !/^[a-z0-9-]+\/[a-z0-9_.-]+$/iu.test(settings.repository)
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(settings.hostname)) invalid("download target or size");
  const parent = externalArtifactDirectory(options.artifact_root, options.repo);
  const id = randomUUID(), root = join(parent, "docs-drift-history-" + id), record = join(parent, id + ".json");
  const endpoint = `repos/${settings.repository}/actions/artifacts/${artifact.id}/zip`;
  const argv = ["gh", "api", "--hostname", settings.hostname, "--method", "GET", endpoint];
  writeFileSync(record, canonicalJSON({ kind: "actions-history-download", repository: settings.repository, artifact_id: artifact.id,
    archive_sha256: artifact.digest, size: artifact.size_in_bytes, root, argv }), { flag: "wx", mode: 0o600 });
  mkdirSync(root, { mode: 0o700 });
  const rawEnvironment = { PATH: options.environment.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME,
    GH_CONFIG_DIR: options.environment.GH_CONFIG_DIR, GH_HOST: settings.hostname, GH_TOKEN: options.environment.GH_TOKEN,
    GITHUB_TOKEN: options.environment.GITHUB_TOKEN, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_PAGER: "" };
  const env = Object.fromEntries(Object.entries(rawEnvironment).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const archivePath = join(root, "artifact.zip");
  const execution = await executeOwnedProcess({ argv, cwd: root, env, stdout: archivePath, stderr: join(root, "stderr"),
    watched_outputs: [], timeout_ms: options.timeout_ms ?? 60000, max_output_bytes: settings.reports.max_archive_bytes,
    started: pid => writeFileSync(join(root, "process-start.json"), canonicalJSON({ pid }), { flag: "wx", mode: 0o600 }) });
  writeFileSync(join(root, "process-result.json"), canonicalJSON(execution), { flag: "wx", mode: 0o600 });
  if (!ownedClientCompleted(execution)) invalid("native archive download failed");
  const bytes = readFileSync(archivePath);
  if (bytes.length !== artifact.size_in_bytes || "sha256:" + sha256(bytes) !== artifact.digest) invalid("downloaded API digest or size");
  return { bytes, archive_path: archivePath, record_path: record, record_sha256: sha256(readFileSync(record)) };
}

export type ProducerSource = ReturnType<typeof createProducerSource>;
/** Content comes only from the native run's Git commit through repository-bound, hash-checked reads. */
export function createProducerSource(reader: RepositoryReader, commit: string) {
  const native = reader.commit(commit);
  const trees = new Map<string, ReturnType<RepositoryReader["tree"]>>();
  const files = new Map<string, Buffer | null>();
  function tree(sha: string) {
    let value = trees.get(sha);
    if (!value) { value = reader.tree(sha); trees.set(sha, value); }
    return value;
  }
  return {
    commit_sha: commit, tree_sha: native.tree_sha,
    file(path: string): Buffer | null {
      protocolPath(path);
      if (files.has(path)) {
        const cached = files.get(path);
        return cached === null || cached === undefined ? null : Buffer.from(cached);
      }
      const parts = path.split("/");
      let current = native.tree_sha;
      for (let index = 0; index < parts.length; index++) {
        const entry = tree(current).entries.find(entry => entry.path === parts[index]);
        if (!entry) { files.set(path, null); return null; }
        if (index < parts.length - 1) {
          if (entry.type !== "tree" || entry.mode !== "040000") invalid("producer source directory");
          current = entry.sha;
        } else {
          if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) invalid("producer source regular blob");
          const bytes = reader.blob(entry.sha);
          files.set(path, bytes);
          return Buffer.from(bytes);
        }
      }
      invalid("producer source path");
    },
    bindings(): Array<readonly [string, string | null]> {
      return [...files].sort(([left], [right]) => compareUTF8(left, right)).map(([path, bytes]) => [path, bytes === null ? null : sha256(bytes)] as const);
    },
  };
}

/** The adoption runtime supplies its verifier. No external record selects a verifier or declares itself approved. */
export async function collectActionsHistory(options: {
  repo: string; artifact_root: string; settings: Settings; context: HistoryContext; reader: RepositoryReader;
  environment: Readonly<Record<string, string | undefined>>;
  verifyProducer: (source: ProducerSource, run: WorkflowRunInput) => VerifiedProducer | null | Promise<VerifiedProducer | null>;
}) {
  const { settings, context, reader } = options;
  const snapshot: HistorySnapshot & { complete: boolean; receipts: unknown[] } = { captured_at: context.started_at, records: [], diagnostics: [], complete: true, receipts: [] };
  try {
    if (settings.reports.workflow_id === null || context.repository !== settings.repository) invalid("adopted workflow identity missing");
    const workflowID = settings.reports.workflow_id;
    const repository = reader.repository(), workflow = reader.workflow(workflowID);
    if (repository.full_name.toLowerCase() !== settings.repository.toLowerCase() || repository.default_branch !== settings.default_branch
      || workflow.path !== settings.reports.workflow_path) invalid("current native repository or workflow changed");
    const events = settings.schema_version === 2 ? ["schedule", "workflow_dispatch"] as const : ["schedule"] as const;
    const pages = events.map(event => reader.recentRuns(workflowID, settings.default_branch, settings.reports.max_runs, event));
    if (pages.some(page => !page.complete)) invalid("workflow run collection incomplete");
    const start = reportTime(context.started_at);
    const eligible = pages.flatMap(page => page.items).filter(run => run.status === "completed" && String(run.id) !== context.run_id && reportTime(run.updated_at) < start)
      .sort((left, right) => reportTime(right.created_at) - reportTime(left.created_at)).slice(0, settings.reports.max_runs);
    for (const candidate of eligible) {
      try {
        const run = reader.run(candidate.id, candidate.run_attempt);
        if (canonicalDigest(run) !== canonicalDigest(candidate)) invalid("run changed during collection");
        const source = createProducerSource(reader, run.head_sha);
        const producer = await options.verifyProducer(source, run);
        if (producer === null) {
          snapshot.diagnostics.push(`Earlier run ${run.id} has no approved producer lineage`);
          continue;
        }
        if (!source.bindings().length || producer.source_inputs_sha256 !== canonicalDigest(source.bindings()) || producer.source_commit !== run.head_sha) invalid("adopted producer source binding");
        const artifacts = reader.artifacts(run.id), jobs = reader.jobs(run.id, run.run_attempt);
        if (!artifacts.complete || !jobs.complete) invalid("artifact or job collection incomplete");
        const selected = artifacts.items.filter(artifact => artifact.name === artifactName(settings, run));
        if (selected.length !== 1) {
          snapshot.diagnostics.push(`Earlier run ${run.id} has no unambiguous report artifact`);
          continue;
        }
        const artifact = reader.artifact(selected[0].id);
        if (canonicalDigest(artifact) !== canonicalDigest(selected[0])) invalid("artifact metadata changed during collection");
        if (artifact.expired || reportTime(artifact.expires_at) <= start || start - reportTime(artifact.created_at) > settings.reports.max_age_seconds * 1000) {
          snapshot.diagnostics.push(`Earlier run ${run.id} report expired or exceeded the history age`);
          continue;
        }
        const downloaded = await downloadActionsArtifact({ ...options, artifact });
        try {
          const verified = await verifyActionsReport({ settings, context, run, artifact, archive: downloaded.bytes, producer, jobs: jobs.items });
          snapshot.records.push(verified.record);
          snapshot.receipts.push({ ...verified.receipt, download_record_sha256: downloaded.record_sha256 });
        } catch (error) {
          if (error instanceof ArchiveSetupError) {
            snapshot.complete = false;
            snapshot.diagnostics.push("Packaged history reader requires verified setup");
          } else snapshot.diagnostics.push(`Earlier run ${run.id} report has ineligible provenance or terminal state`);
        }
      } catch {
        snapshot.complete = false;
        snapshot.diagnostics.push(`Earlier run ${candidate.id} required native history inputs could not be verified`);
      }
    }
  } catch {
    snapshot.complete = false;
    snapshot.diagnostics.push("Configured Actions history collection could not be completed");
  }
  return snapshot;
}

export type ReviewedPublication = {
  repository: string; repository_id: number; operation_id: string; actor: string; actor_id: number; head: string; tree: string;
  body_sha256: string; corrections: string[]; attention: AttentionProjection[];
};
export type NativePublicationBinding = ReviewedPublication & { ref: string; object: string };

export function publicationMarker(settings: Settings, operation: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(operation)) invalid("operation marker");
  return `<!-- vh-adlc-docs-drift operation=${operation} receipt=${settings.publication.receipt_ref_prefix}${operation} -->`;
}

/** The journal/review verifier supplies semantic approval after native ref/object and current PR checks. */
export async function readReviewedProposal(options: {
  reader: RepositoryReader; settings: Settings; proposal: PullRequestInput;
  verifyPlan: (bytes: Buffer, native: Omit<NativePublicationBinding, "corrections" | "attention">) => ReviewedPublication | null | Promise<ReviewedPublication | null>;
}) {
  const { reader, settings, proposal } = options;
  const current = reader.pull(proposal.number);
  if (canonicalDigest(projectRecordedAccount(current, proposal)) !== canonicalDigest(proposal)) throw new PublicationEvidenceChanged("current owned PR changed during read");
  if (current.state !== "open" || current.merged_at !== null
    || current.base_repository.full_name.toLowerCase() !== settings.repository.toLowerCase()
    || current.base_ref !== settings.default_branch || current.head_repository?.id !== current.base_repository.id
    || !isPublisherLogin(settings, current.actor)) invalid("current owned PR changed or unavailable");
  canonicalJSON(current.body);
  const markers = [...current.body.matchAll(/<!-- vh-adlc-docs-drift\b[^\r\n]*? -->/gu)];
  if (markers.length !== 1) invalid("missing or ambiguous operation marker");
  const operation = /^<!-- vh-adlc-docs-drift operation=([A-Za-z0-9][A-Za-z0-9_-]{0,79}) receipt=([^\s]+) -->$/u.exec(markers[0][0]);
  if (!operation || markers[0][0] !== publicationMarker(settings, operation[1])) invalid("foreign operation ref");
  const ref = settings.publication.receipt_ref_prefix + operation[1];
  const nativeRef = reader.ref(ref), receiptCommit = reader.commit(nativeRef.sha), tree = reader.tree(receiptCommit.tree_sha, 1);
  if (receiptCommit.parents.length !== 0 || tree.entries.length !== 1 || tree.entries[0].path !== "plan.json"
    || tree.entries[0].type !== "blob" || tree.entries[0].mode !== "100644") invalid("metadata-only retained receipt tree");
  const bytes = reader.blob(tree.entries[0].sha, settings.reports.max_entry_bytes);
  parseCanonical(bytes);
  const candidate = reader.commit(current.head_sha);
  const native = { repository: settings.repository, repository_id: current.base_repository.id, operation_id: operation[1], actor: current.actor, actor_id: current.actor_id,
    head: current.head_sha, tree: candidate.tree_sha, body_sha256: sha256(Buffer.from(current.body)), ref, object: nativeRef.sha };
  const reviewed = await options.verifyPlan(bytes, native);
  if (reviewed === null) invalid("review policy does not accept this receipt");
  for (const key of ["repository", "repository_id", "operation_id", "actor", "actor_id", "head", "tree", "body_sha256"] as const) {
    if (key === "actor" ? !sameLogin(reviewed.actor, native.actor) : reviewed[key] !== native[key]) invalid("reviewed publication payload mismatch");
  }
  if (!Array.isArray(reviewed.corrections) || !Array.isArray(reviewed.attention)) invalid("reviewed item bindings");
  for (const correction of reviewed.corrections) hash(correction);
  for (const item of reviewed.attention) {
    if (item.version !== 1 || hash(item.sha256) !== canonicalDigest(item.binding)) invalid("reviewed attention projection");
  }
  let recheckedRef: ReturnType<RepositoryReader["ref"]>;
  try { recheckedRef = reader.ref(ref); }
  catch (error) {
    if (error instanceof GitHubReadError && error.status === 404) throw new PublicationEvidenceChanged("native publication disappeared during read");
    throw error;
  }
  if (recheckedRef.sha !== nativeRef.sha || canonicalDigest(projectRecordedAccount(reader.pull(current.number), current)) !== canonicalDigest(current))
    throw new PublicationEvidenceChanged("native publication changed during read");
  return { reviewed: { actor: reviewed.actor, head: reviewed.head, body_sha256: reviewed.body_sha256,
    corrections: reviewed.corrections, attention: reviewed.attention },
    receipt: { repository: settings.repository, repository_id: current.base_repository.id, operation_id: operation[1], ref, object: nativeRef.sha,
      tree: receiptCommit.tree_sha, plan_sha256: sha256(bytes), actor_id: current.actor_id } };
}
