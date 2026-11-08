import type { PublicationIdentity } from "./transport";
import { readGit, collectionReaders } from "./git";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { loadCommittedSettings, settingsProjections } from "./settings";

type ComponentPin = {
  schema_version: 1; source_repository: string; source_commit: string; source_release: string;
  plugin_version: string; component_sha256: string;
};
type CommittedInput = { path: string; mode: string; blob: string; bytes: Buffer; sha256: string };
function fail(reason: string): never { throw Error("incomplete docs-drift adoption " + reason); }
function immutable(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) fail("immutable commit required");
  return value;
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid pin object");
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== [...keys].sort().join(",")) fail("pin fields");
  return input;
}
export function parseComponentPin(value: unknown): ComponentPin {
  const input = object(value, ["schema_version", "source_repository", "source_commit", "source_release", "plugin_version", "component_sha256"]);
  if (input.schema_version !== 1 || typeof input.source_repository !== "string"
    || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u.test(input.source_repository)
    || input.source_repository.split("/").some(part => part === "." || part === "..")) fail("pin repository or schema");
  const source_commit = immutable(input.source_commit);
  for (const field of ["source_release", "plugin_version"] as const) {
    if (typeof input[field] !== "string" || !/^(?:v)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(input[field])) fail("pin release/version");
  }
  if (typeof input.component_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(input.component_sha256)) fail("pin component digest");
  return freezeJSON({ schema_version: 1, source_repository: input.source_repository.toLowerCase(), source_commit,
    source_release: input.source_release as string, plugin_version: input.plugin_version as string, component_sha256: input.component_sha256 });
}

/** Read only the literal path's Git blob. Links, submodules and checkout overlays cannot supply policy. */
function committedInput(repo: string, commit: string, path: string): CommittedInput | null {
  protocolPath(path);
  const raw = readGit(repo, "--literal-pathspecs", "ls-tree", "-z", immutable(commit), "--", path);
  if (raw.length === 0) return null;
  const tab = raw.indexOf(9);
  const metadata = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/u.exec(raw.subarray(0, tab).toString("ascii"));
  if (tab < 0 || !metadata || raw.at(-1) !== 0 || decodeUTF8(raw.subarray(tab + 1, -1)) !== path) fail("regular committed input " + path);
  const bytes = readGit(repo, "cat-file", "blob", metadata[2]);
  return { path, mode: metadata[1], blob: metadata[2], bytes, sha256: sha256(bytes) };
}

/** Collect bindings only. Trial evidence, operator acceptance and effect authority are separate gates. */
export function collectAdoptionBindings(repo: string, sourceCommit: string) {
  const committed = loadCommittedSettings(repo, sourceCommit), { settings } = committed;
  if (settings.component_pin === null) fail("selected component pin missing");
  const pin = committedInput(repo, sourceCommit, settings.component_pin);
  if (!pin || pin.mode !== "100644") fail("selected component pin missing or nonregular");
  const value = parseComponentPin(collectionReaders().yaml(pin.bytes));
  const paths = [...new Set(["AGENTS.md", settings.project_procedure, settings.execution.worker_workflow,
    settings.execution.scheduled_workflow, settings.execution.claude_command, settings.runtime_loader.launcher,
    ...(settings.scanner.adapter === null ? [] : [settings.scanner.adapter])])].sort(compareUTF8);
  const blobs = paths.map(path => {
    const input = committedInput(repo, sourceCommit, path);
    if (input === null && path !== "AGENTS.md") fail("protected input missing " + path);
    return [path, input?.mode ?? null, input?.sha256 ?? null] as const;
  });
  const component = { path: pin.path, mode: pin.mode, sha256: pin.sha256, value };
  const protectedManifest = { settings: settingsProjections(settings).protected, component, blobs };
  return freezeJSON({ source_commit: sourceCommit, settings_sha256: committed.settings_sha256, settings,
    component_pin: component, protected_manifest: protectedManifest, protected_sha256: canonicalDigest(protectedManifest) });
}

/** Check structural C/D assembly. The evidence verifier separately validates the record contents. */
export function verifyCutoverAssembly(options: { repo: string; source_candidate: string; delivery_commit: string; record_path: string }) {
  const { repo, source_candidate: candidate, delivery_commit: delivery, record_path: path } = options;
  immutable(candidate); immutable(delivery); protocolPath(path);
  const bindings = collectAdoptionBindings(repo, candidate);
  if (bindings.settings.publication.mode !== "adopted" || bindings.settings.publication.adoption_record !== path) fail("cutover candidate selection");
  const parents = readGit(repo, "rev-list", "--parents", "-n", "1", delivery).toString().trim().split(" ");
  if (parents.length !== 2 || parents[0] !== delivery || parents[1] !== candidate) fail("cutover must be the direct single-parent child");
  if (committedInput(repo, candidate, path) !== null) fail("candidate already contains adoption record");
  const changed = readGit(repo, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-status", "-z", candidate, delivery, "--");
  if (!changed.equals(Buffer.from("A\0" + path + "\0"))) fail("cutover child must add only the selected record");
  const record = committedInput(repo, delivery, path);
  if (!record || record.mode !== "100644") fail("regular cutover record required");
  return { source_candidate: candidate, delivery_commit: delivery, bindings, record };
}

const receiptRequirements = {
  hosted_advisory: ["collection_complete", "independent_review", "reviewed_draft_payload", "report_uploaded", "lease_complete"],
  history_read: ["native_history_read", "producer_verified", "permissions_bound"],
  quiescence: ["schedule_disabled", "runs_drained", "interactive_frozen", "no_legacy_owners"],
  copilot_entry: ["audit", "resolve", "closure", "issue", "acknowledgement", "ownership_denials", "settlement_denials", "retained_loader", "role_dispatch"],
  claude_entry: ["audit", "resolve", "closure", "issue", "acknowledgement", "ownership_denials", "settlement_denials", "retained_loader", "role_dispatch", "forwarded_arguments", "command_binding"],
  paired_review: ["shared_target", "consumer_target", "no_blocking_findings", "owner_acceptance"],
  codex_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
  claude_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
  copilot_install: ["fresh_install", "upgrade", "discovery", "helper_preservation"],
} as const;

function adoptionDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail("record digest");
  return value;
}

function verifyRecordedReceipts(value: unknown, bindings: ReturnType<typeof collectAdoptionBindings>, candidate: string, identity: PublicationIdentity): void {
  const receipts = object(value, Object.keys(receiptRequirements));
  const target = canonicalDigest({ schema_version: 1, repository: bindings.settings.repository,
    source_candidate: candidate, protected_sha256: bindings.protected_sha256, component_pin_sha256: bindings.component_pin.sha256, identity });
  for (const name of Object.keys(receiptRequirements) as (keyof typeof receiptRequirements)[]) {
    const receipt = object(receipts[name], ["schema_version", "kind", "evidence_kind", "source_commit", "artifact_sha256",
      "bindings_sha256", "outcome", "native_conclusion", "worker_model", "reviewer_model", "observations",
      ...(name === "quiescence" ? ["workflow_id", "workflow_path", "observed_at", "queued_run_ids", "in_progress_run_ids", "interactive_request_sha256"] : [])]);
    if (receipt.schema_version !== 1 || receipt.kind !== name || receipt.evidence_kind !== "observed"
      || adoptionDigest(receipt.bindings_sha256) !== target) fail("observed record receipt " + name);
    immutable(receipt.source_commit); adoptionDigest(receipt.artifact_sha256);
    if (name === "quiescence") {
      if (bindings.settings.reports.workflow_id === null || receipt.workflow_id !== bindings.settings.reports.workflow_id
        || receipt.workflow_path !== bindings.settings.execution.scheduled_workflow || typeof receipt.observed_at !== "string"
        || !Number.isFinite(Date.parse(receipt.observed_at)) || !Array.isArray(receipt.queued_run_ids) || receipt.queued_run_ids.length
        || !Array.isArray(receipt.in_progress_run_ids) || receipt.in_progress_run_ids.length) fail("legacy quiescence receipt");
      adoptionDigest(receipt.interactive_request_sha256);
    }
    const expectedAttention = name === "hosted_advisory" && receipt.outcome === "trial-passed-expected-new-attention";
    if (expectedAttention ? receipt.native_conclusion !== "failure" : receipt.outcome !== "passed" || receipt.native_conclusion !== "success") {
      fail("recorded native outcome " + name);
    }
    const entry = name === "hosted_advisory" || name === "history_read" ? "hosted"
      : name === "copilot_entry" || name === "paired_review" ? "copilot" : name === "claude_entry" ? "claude" : null;
    const roles = entry === null ? null : bindings.settings.execution.entries[entry];
    const worker = name === "paired_review" || name === "history_read" ? null : roles?.worker.model ?? null;
    const reviewer = name === "history_read" ? null : roles?.reviewer.model ?? null;
    if (receipt.worker_model !== worker || receipt.reviewer_model !== reviewer) fail("recorded role identity " + name);
    const observations = object(receipt.observations, [...receiptRequirements[name], ...(expectedAttention ? ["only_attention_step_failed"] : [])]);
    if (Object.values(observations).some(observed => observed !== true)) fail("incomplete recorded observations " + name);
  }
}

function ancestry(repo: string, ancestor: string, descendant: string, parents = false): string[] {
  const bytes = readGit(repo, "rev-list", "--ancestry-path", "--max-count=4096", ...(parents ? ["--parents"] : []), `${ancestor}..${descendant}`, "--");
  const lines = decodeUTF8(bytes).trim().split("\n").filter(Boolean);
  if (lines.length === 4096) fail("record ancestry exceeds verification bound");
  return lines;
}

/** Validate the portable owner attestation at a freshly observed immutable default revision.
 * Historical native execution and artifact contents are verified separately by the operator.
 * This read-only result supplies no publication, cleanup, workflow or merge authority.
 */
export function verifyRuntimeAdoption(options: { repo: string; current_default: string; identity?: PublicationIdentity }) {
  const { repo, current_default: current } = options;
  immutable(current);
  if (loadCommittedSettings(repo, current).settings.publication.mode !== "adopted") fail("consumer is not adopted");
  const bindings = collectAdoptionBindings(repo, current), path = bindings.settings.publication.adoption_record;
  const input = committedInput(repo, current, path);
  if (!input || input.mode !== "100644") fail("committed adoption record missing");
  const record = object(collectionReaders().yaml(input.bytes), ["schema_version", "kind", "source_candidate", "protected_sha256",
    "protected_manifest", "component_pin_sha256", "identity", "receipts", "predecessor"]);
  if (record.schema_version !== 1 || record.kind !== "docs-drift-adoption") fail("record schema");
  const candidate = immutable(record.source_candidate);
  if (candidate === current) fail("circular source candidate record");
  // Successor records require the separate compatibility/trial verifier, implemented by T21.
  if (record.predecessor !== null) fail("successor adoption evidence unavailable");
  const original = collectAdoptionBindings(repo, candidate);
  if (adoptionDigest(record.protected_sha256) !== original.protected_sha256
    || adoptionDigest(record.component_pin_sha256) !== original.component_pin.sha256
    || !canonicalJSON(record.protected_manifest).equals(canonicalJSON(original.protected_manifest))
    || bindings.protected_sha256 !== original.protected_sha256) fail("protected record bindings changed");
  const identity = object(record.identity, ["repository", "repository_id", "actor", "actor_id", "default_branch"]);
  if (identity.repository !== bindings.settings.repository || identity.actor !== bindings.settings.publication.actor
    || identity.default_branch !== bindings.settings.default_branch || typeof identity.repository_id !== "number"
    || !Number.isSafeInteger(identity.repository_id) || identity.repository_id < 1 || typeof identity.actor_id !== "number"
    || !Number.isSafeInteger(identity.actor_id) || identity.actor_id < 1 || !options.identity
    || !canonicalJSON(identity).equals(canonicalJSON(options.identity))) fail("current native adoption identity");
  verifyRecordedReceipts(record.receipts, original, candidate, options.identity);
  const deliveries = ancestry(repo, candidate, current, true).map(line => line.split(" ")).filter(parts => {
    if (parts.length !== 2 || parts[1] !== candidate) return false;
    const recordAtChild = committedInput(repo, immutable(parts[0]), path);
    return recordAtChild?.mode === "100644" && recordAtChild.sha256 === input.sha256;
  });
  if (deliveries.length !== 1) fail("unique record-only cutover child required");
  const delivery = deliveries[0][0];
  verifyCutoverAssembly({ repo, source_candidate: candidate, delivery_commit: delivery, record_path: path });
  for (const commit of ancestry(repo, delivery, current)) {
    const historical = committedInput(repo, immutable(commit), path);
    if (historical?.mode !== "100644" || historical.sha256 !== input.sha256) fail("immutable adoption record changed");
  }
  return freezeJSON({ kind: "docs-drift-runtime-adoption", evidence: "owner-attestation", current_default: current,
    source_candidate: candidate, delivery_commit: delivery, record_path: path, adoption_sha256: input.sha256,
    protected_sha256: bindings.protected_sha256, component_pin: bindings.component_pin.value, identity, receipts: record.receipts });
}
