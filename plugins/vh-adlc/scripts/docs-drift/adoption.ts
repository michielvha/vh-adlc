import { verifyCompatibleWorkerCaller } from "./worker-callers";
import type { PublicationIdentity } from "./transport";
import { readGit, collectionReaders, readAdoptionInput as committedInput } from "./git";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath } from "./protocol";
import { classifySettingsLeaves, loadCommittedSettings, parseSettings, settingsProjections } from "./settings";
import { readTrialDefinition, readTrialHistoryBindings } from "./trial-definition";

type ComponentPin = {
  schema_version: 1; source_repository: string; source_commit: string; source_release: string;
  plugin_version: string; component_sha256: string;
};
function fail(reason: string): never { throw Error("incomplete docs-drift adoption " + reason); }
function immutable(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) fail("immutable commit required");
  return value;
}
function object(value: unknown, keys: string[], label = "object"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid " + label);
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  const actual = Object.keys(input).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) fail(label + " fields");
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

/** Collect bindings only. Trial evidence, operator acceptance and effect authority are separate gates. */
export function collectAdoptionBindings(repo: string, sourceCommit: string) {
  return collectSelectedBindings(repo, sourceCommit, loadCommittedSettings(repo, sourceCommit));
}

function collectSelectedBindings(repo: string, sourceCommit: string, committed: ReturnType<typeof loadCommittedSettings>,
  scheduled?: { path: string; mode: string; sha256: string }) {
  const { settings } = committed;
  if (settings.component_pin === null) fail("selected component pin missing");
  const pin = committedInput(repo, sourceCommit, settings.component_pin);
  if (!pin || pin.mode !== "100644") fail("selected component pin missing or nonregular");
  const value = parseComponentPin(collectionReaders().yaml(pin.bytes));
  const paths = [...new Set(["AGENTS.md", settings.project_procedure, settings.execution.worker_workflow,
    settings.execution.scheduled_workflow, settings.execution.claude_command, settings.runtime_loader.launcher,
    ...(settings.scanner.adapter === null ? [] : [settings.scanner.adapter])])].sort(compareUTF8);
  const blobs = paths.map(path => {
    const input = scheduled?.path === path ? scheduled : committedInput(repo, sourceCommit, path);
    if (input === null && path !== "AGENTS.md") fail("protected input missing " + path);
    return [path, input?.mode ?? null, input?.sha256 ?? null] as const;
  });
  const component = { path: pin.path, mode: pin.mode, sha256: pin.sha256, value };
  const protectedManifest = { settings: settingsProjections(settings).protected, component, blobs };
  return freezeJSON({ source_commit: sourceCommit, settings_sha256: committed.settings_sha256, settings,
    component_pin: component, protected_manifest: protectedManifest, protected_sha256: canonicalDigest(protectedManifest) });
}

/** Committed setup is non-granting. Actual fixture ownership and trial permission are separate. */
export function collectTrialBindings(options: { repo: string; current_default: string; identity?: PublicationIdentity }) {
  const source = immutable(options.current_default), current = loadCommittedSettings(options.repo, source).settings;
  const policy = readTrialDefinition({ repo: options.repo, source, settings: current });
  const candidate = collectSelectedBindings(options.repo, source, { settings: policy.candidate_settings.value,
    settings_sha256: policy.candidate_settings.sha256, source_commit: source }, policy.scheduled_contract);
  if (candidate.protected_sha256 !== policy.prospective_protected_sha256
    || candidate.component_pin.path !== policy.candidate_component.path
    || candidate.component_pin.sha256 !== policy.candidate_component.sha256) fail("prospective trial bindings changed");
  const normalized = (identity: PublicationIdentity) => ({ ...identity, repository: identity.repository.toLowerCase(), actor: identity.actor.toLowerCase() });
  if (options.identity && !canonicalJSON(normalized(nativeIdentity(options.identity))).equals(canonicalJSON(normalized(policy.identity)))) fail("current native trial identity");
  return freezeJSON({ ...policy, source_commit: source, candidate, authority: "none" as const });
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

function verificationTime(value: unknown, deliveryTime: number): string {
  const when = typeof value === "string" ? Date.parse(value) : NaN;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    || !Number.isFinite(when) || when > deliveryTime
    || new Date(when).toISOString().replace(/\.000Z$/u, "Z") !== value.replace(/\.000Z$/u, "Z")) fail("verification time");
  return value;
}

function nativeIdentity(value: unknown): PublicationIdentity {
  const identity = object(value, ["repository", "repository_id", "actor", "actor_id", "default_branch"], "native identity");
  if (typeof identity.repository !== "string" || !identity.repository || typeof identity.actor !== "string" || !identity.actor
    || typeof identity.default_branch !== "string" || !identity.default_branch || typeof identity.repository_id !== "number"
    || !Number.isSafeInteger(identity.repository_id) || identity.repository_id < 1 || typeof identity.actor_id !== "number"
    || !Number.isSafeInteger(identity.actor_id) || identity.actor_id < 1) fail("native identity values");
  return { repository: identity.repository, repository_id: identity.repository_id, actor: identity.actor,
    actor_id: identity.actor_id, default_branch: identity.default_branch };
}

type AdoptionBoundary = { kind: "observed" } | { kind: "test-only"; fixture_id: string };

function parseAdoptionRecord(bytes: Uint8Array, boundary: AdoptionBoundary) {
  const record = object(collectionReaders().yaml(bytes), ["schema_version", "kind", "source_candidate", "protected_sha256",
    "protected_manifest", "component_pin_sha256", "identity", "receipts", "predecessor", ...(boundary.kind === "test-only" ? ["fixture_id"] : [])]);
  if (boundary.kind === "test-only" && record.fixture_id !== boundary.fixture_id) fail("synthetic adoption fixture identity");
  if (record.schema_version !== 1 || record.kind !== "docs-drift-adoption") fail("record schema");
  return record;
}

function verifyRecordedReceipts(repo: string, value: unknown, bindings: ReturnType<typeof collectAdoptionBindings>, candidate: string, identity: PublicationIdentity, deliveryTime: number, boundary: AdoptionBoundary, carried?: { names: string[]; receipts: unknown }): void {
  const receipts = object(value, Object.keys(receiptRequirements));
  const target = canonicalDigest({ schema_version: 1, repository: bindings.settings.repository,
    source_candidate: candidate, protected_sha256: bindings.protected_sha256, component_pin_sha256: bindings.component_pin.sha256, identity });
  for (const name of Object.keys(receiptRequirements) as (keyof typeof receiptRequirements)[]) {
    if (carried?.names.includes(name)) {
      const previous = object(carried.receipts, Object.keys(receiptRequirements));
      if (!canonicalJSON(receipts[name]).equals(canonicalJSON(previous[name]))) fail("carried receipt changed " + name);
      continue;
    }
    const receipt = object(receipts[name], ["schema_version", "kind", "evidence_kind", "source_commit", "artifact_sha256",
      "bindings_sha256", "outcome", "native_conclusion", "worker_model", "reviewer_model", "client_bindings", "observations",
      ...(boundary.kind === "test-only" ? ["fixture_id"] : []),
      ...(name === "history_read" ? ["producer_workflow_id", "producer_workflow_path", "reader_workflow_id", "reader_workflow_path"] : []),
      ...(name === "quiescence" ? ["workflow_id", "workflow_path", "observed_at", "queued_run_ids", "in_progress_run_ids", "interactive_request_sha256", "workflow_state", "drained_runs"] : [])], "receipt " + name);
    if (receipt.schema_version !== 1 || receipt.kind !== name || receipt.evidence_kind !== boundary.kind
      || (boundary.kind === "test-only" && receipt.fixture_id !== boundary.fixture_id)
      || adoptionDigest(receipt.bindings_sha256) !== target) fail(boundary.kind + " record receipt " + name);
    // Consumer receipts target C. Install receipts target the pinned shared component source.
    const source = name.endsWith("_install") ? bindings.component_pin.value.source_commit : candidate;
    if (immutable(receipt.source_commit) !== source) fail("recorded source target " + name);
    adoptionDigest(receipt.artifact_sha256);
    if (name === "history_read") {
      const history = readTrialHistoryBindings({ repo, source: candidate, settings: bindings.settings });
      if (history) {
        if (Object.entries(history).some(([field, value]) => receipt[field] !== value)) fail("history producer/reader workflow");
      } else if (bindings.settings.reports.workflow_id === null || receipt.producer_workflow_id !== bindings.settings.reports.workflow_id
        || receipt.producer_workflow_path !== bindings.settings.execution.scheduled_workflow
        || typeof receipt.reader_workflow_id !== "number" || !Number.isSafeInteger(receipt.reader_workflow_id) || receipt.reader_workflow_id < 1
        || receipt.reader_workflow_path !== bindings.settings.execution.worker_workflow) fail("history producer/reader workflow");
    }
    if (name === "quiescence") {
      verificationTime(receipt.observed_at, deliveryTime);
      if (bindings.settings.reports.workflow_id === null || receipt.workflow_id !== bindings.settings.reports.workflow_id
        || receipt.workflow_path !== bindings.settings.execution.scheduled_workflow || receipt.workflow_state !== "disabled_manually"
        || !Array.isArray(receipt.drained_runs) || !Array.isArray(receipt.queued_run_ids) || receipt.queued_run_ids.length
        || !Array.isArray(receipt.in_progress_run_ids) || receipt.in_progress_run_ids.length) fail("legacy quiescence receipt");
      const runs = new Set<number>();
      for (const value of receipt.drained_runs) {
        const run = object(value, ["run_id", "status", "conclusion"], "drained run");
        if (typeof run.run_id !== "number" || !Number.isSafeInteger(run.run_id) || run.run_id < 1 || runs.has(run.run_id)
          || run.status !== "completed" || typeof run.conclusion !== "string"
          || !["success", "failure", "neutral", "cancelled", "skipped", "stale", "timed_out", "action_required", "startup_failure"].includes(run.conclusion)) fail("drained run result");
        runs.add(run.run_id);
      }
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
    const clientNames = roles === null || name === "history_read" ? []
      : name === "paired_review" ? [roles.reviewer.client] : [roles.worker.client, roles.reviewer.client];
    const clients = Object.fromEntries(Object.entries(bindings.settings.clients).filter(([id]) => clientNames.includes(id)));
    if (!canonicalJSON(receipt.client_bindings).equals(canonicalJSON(clients))) fail("recorded client identity " + name);

    const observations = object(receipt.observations, [...receiptRequirements[name], ...(expectedAttention ? ["only_attention_step_failed"] : [])], "incomplete recorded observations " + name);
    if (Object.values(observations).some(observed => observed !== true)) fail("incomplete recorded observations " + name);
  }
}

/** Full history follows both merge parents. Path filtering excludes ordinary content advances.
 * Parent identities are read separately because path-limited --parents rewrites them.
 */
function recordHistory(repo: string, ancestor: string, descendant: string, path: string) {
  const bytes = readGit(repo, "rev-list", "--full-history", "--ancestry-path", `${ancestor}..${descendant}`, "--", path);
  return decodeUTF8(bytes).trim().split("\n").filter(Boolean).map(value => {
    const commit = immutable(value);
    const parents = readGit(repo, "show", "-s", "--format=%P", commit).toString().trim().split(" ").filter(Boolean);
    return { commit, parents, record: committedInput(repo, commit, path) };
  });
}

/** Validate the portable owner attestation at a freshly observed immutable default revision.
 * Historical native execution and artifact contents are verified separately by the operator.
 * This read-only result supplies no publication, cleanup, workflow or merge authority.
 */
function readAdoptionFrame(options: { repo: string; current_default: string; identity?: PublicationIdentity }, boundary: AdoptionBoundary) {
  const { repo, current_default: current } = options;
  immutable(current);
  if (loadCommittedSettings(repo, current).settings.publication.mode !== "adopted") fail("consumer is not adopted");
  const bindings = collectAdoptionBindings(repo, current), path = bindings.settings.publication.adoption_record;
  const input = committedInput(repo, current, path);
  if (!input || input.mode !== "100644") fail("committed adoption record missing");
  const record = parseAdoptionRecord(input.bytes, boundary);
  const candidate = immutable(record.source_candidate);
  if (candidate === current) fail("circular source candidate record");
  const original = collectAdoptionBindings(repo, candidate);
  if (adoptionDigest(record.protected_sha256) !== original.protected_sha256
    || adoptionDigest(record.component_pin_sha256) !== original.component_pin.sha256
    || !canonicalJSON(record.protected_manifest).equals(canonicalJSON(original.protected_manifest))
    || bindings.protected_sha256 !== original.protected_sha256) fail("protected record bindings changed");
  const identity = nativeIdentity(record.identity);
  if (!options.identity) fail("current native adoption identity");
  const observed = nativeIdentity(options.identity);
  const normalized = (value: PublicationIdentity) => ({ ...value, repository: value.repository.toLowerCase(), actor: value.actor.toLowerCase() });
  if (identity.repository.toLowerCase() !== bindings.settings.repository || identity.actor.toLowerCase() !== bindings.settings.publication.actor.toLowerCase()
    || identity.default_branch !== bindings.settings.default_branch
    || !canonicalJSON(normalized(identity)).equals(canonicalJSON(normalized(observed)))) fail("current native adoption identity");
  const history = recordHistory(repo, candidate, current, path);
  if (history.some(item => item.record !== null && (item.record.mode !== "100644" || item.record.sha256 !== input.sha256))) {
    fail("immutable adoption record changed");
  }
  const deliveries = history.filter(item => item.parents.length === 1 && item.parents[0] === candidate && item.record !== null);
  if (deliveries.length !== 1) fail("unique record-only cutover child required");
  const delivery = deliveries[0].commit;
  verifyCutoverAssembly({ repo, source_candidate: candidate, delivery_commit: delivery, record_path: path });
  const deliveryTime = Number(readGit(repo, "show", "-s", "--format=%ct", delivery).toString().trim()) * 1000;
  if (!Number.isSafeInteger(deliveryTime)) fail("cutover delivery time");
  for (const historical of recordHistory(repo, delivery, current, path)) {
    if (historical.record?.mode !== "100644" || historical.record.sha256 !== input.sha256) fail("immutable adoption record changed");
  }
  verifyRetainedInputs(repo, candidate, current, [[path, input.sha256], [original.component_pin.path, original.component_pin.sha256]]);
  const result = freezeJSON({ kind: "docs-drift-runtime-adoption", current_default: current,
    source_candidate: candidate, delivery_commit: delivery, record_path: path, adoption_sha256: input.sha256,
    protected_sha256: bindings.protected_sha256, component_pin: bindings.component_pin.value, identity, receipts: record.receipts });
  return { result, record, original, deliveryTime };
}

function verifyRetainedInputs(repo: string, base: string, candidate: string, inputs: [string, string][]) {
  for (const [path, digest] of inputs) {
    const selected = committedInput(repo, candidate, path);
    if (!selected || selected.mode !== "100644" || selected.sha256 !== digest
      || recordHistory(repo, base, candidate, path).some(row => row.record?.mode !== "100644" || row.record.sha256 !== digest)) fail("immutable predecessor input changed " + path);
  }
}

type AdoptionResult = ReturnType<typeof readAdoptionFrame>["result"];
const compatibleCarriedReceipts = ["hosted_advisory", "history_read", "quiescence", "copilot_entry", "claude_entry"];

function predecessorLink(value: unknown, boundary: AdoptionBoundary) {
  const route = value !== null && typeof value === "object" && !Array.isArray(value) ? Reflect.get(value, "route") : null;
  if (route !== "compatible" && route !== "trial") fail("successor route required");
  const link = object(value, ["schema_version", "evidence_kind", "route", "default_commit", "record_path", "record_sha256",
    "carry_receipts", route === "trial" ? "trial" : "compatibility", ...(boundary.kind === "test-only" ? ["fixture_id"] : [])], "successor predecessor");
  if (link.schema_version !== 1 || link.evidence_kind !== boundary.kind
    || (boundary.kind === "test-only" && link.fixture_id !== boundary.fixture_id)) fail("predecessor evidence kind or fixture");
  if (route === "compatible" && !canonicalJSON(link.carry_receipts).equals(canonicalJSON(compatibleCarriedReceipts))) fail("compatible carried receipt inventory");
  return { route, default_commit: immutable(link.default_commit), record_sha256: adoptionDigest(link.record_sha256),
    record_path: link.record_path, carry_receipts: link.carry_receipts, compatibility: link.compatibility, trial: link.trial };
}

function verifyCompatibility(repo: string, value: unknown, previous: AdoptionResult, next: ReturnType<typeof readAdoptionFrame>, boundary: AdoptionBoundary) {
  const changes = compareUpgradeBindings({ repo, approved_default: previous.current_default,
    source_candidate: next.result.source_candidate, identity: next.result.identity }, previous);
  if (changes.known_affected_entries.length) fail("compatible upgrade changes execution bindings");
  verifyComponentReview(value, previous, next, boundary);
}

function verifyComponentReview(value: unknown, previous: AdoptionResult, next: ReturnType<typeof readAdoptionFrame>,
  boundary: AdoptionBoundary, preservedEntries?: string[]) {
  const receipt = object(value, ["schema_version", "evidence_kind", "source_candidate", "predecessor_adoption_sha256",
    "previous_component", "next_component", "previous_protected_sha256", "classification", "reviewer_model", "artifact_sha256",
    "diff_sha256", "dependencies_sha256", "observations", "regressions", ...(preservedEntries ? ["preserved_entries"] : []), ...(boundary.kind === "test-only" ? ["fixture_id"] : [])], "compatibility receipt");
  if (receipt.schema_version !== 1 || receipt.evidence_kind !== boundary.kind
    || (boundary.kind === "test-only" && receipt.fixture_id !== boundary.fixture_id)
    || receipt.source_candidate !== next.result.source_candidate || receipt.predecessor_adoption_sha256 !== previous.adoption_sha256
    || receipt.previous_protected_sha256 !== previous.protected_sha256
    || !canonicalJSON(receipt.previous_component).equals(canonicalJSON(previous.component_pin))
    || !canonicalJSON(receipt.next_component).equals(canonicalJSON(next.result.component_pin))
    || receipt.reviewer_model !== next.original.settings.execution.entries.copilot.reviewer.model) fail("compatibility receipt bindings");
  if (preservedEntries && !canonicalJSON(receipt.preserved_entries).equals(canonicalJSON(preservedEntries))) fail("component preservation inventory");
  if (receipt.classification !== "contract-preserving" && receipt.classification !== "contract-restoring") fail("compatibility classification");
  for (const field of ["artifact_sha256", "diff_sha256", "dependencies_sha256"]) adoptionDigest(receipt[field]);
  const observations = object(receipt.observations, ["full_diff_reviewed", "dependencies_complete", "no_blocking_findings",
    "no_should_fix_findings", "contract_preserved", "affected_regressions", "installed_contract_checks"], "compatibility observations");
  if (Object.values(observations).some(value => value !== true)) fail("incomplete compatibility observations");
  if (!Array.isArray(receipt.regressions) || !receipt.regressions.length) fail("compatibility regressions required");
  const ids = new Set<string>();
  let restored = false;
  const coveredEntries = new Set<string>();
  for (const value of receipt.regressions) {
    const regression = object(value, ["id", "evidence_kind", "category", "previous_source", "next_source", "command_sha256",
      "accepted_rule_sha256", "expected_sha256", "before_sha256", "after_sha256", "before_result", "after_result", "artifact_sha256",
      ...(preservedEntries ? ["entry"] : []), ...(boundary.kind === "test-only" ? ["fixture_id"] : [])], "compatibility regression");
    if (typeof regression.id !== "string" || !regression.id || ids.has(regression.id)
      || regression.evidence_kind !== boundary.kind || (boundary.kind === "test-only" && regression.fixture_id !== boundary.fixture_id)
      || regression.previous_source !== previous.component_pin.source_commit
      || regression.next_source !== next.result.component_pin.source_commit) fail("compatibility regression bindings");
    ids.add(regression.id);
    if (preservedEntries) {
      if (typeof regression.entry !== "string" || !preservedEntries.includes(regression.entry)) fail("component preservation entry");
      coveredEntries.add(regression.entry);
    }
    for (const field of ["command_sha256", "accepted_rule_sha256", "expected_sha256", "before_sha256", "after_sha256", "artifact_sha256"]) adoptionDigest(regression[field]);
    if (regression.after_result !== "passed" || regression.after_sha256 !== regression.expected_sha256) fail("compatibility regression after result");
    if (regression.category === "preservation") {
      if (regression.before_result !== "passed" || regression.before_sha256 !== regression.expected_sha256) fail("compatibility preservation regression");
    } else if (regression.category === "restoration" && receipt.classification === "contract-restoring") {
      if (regression.before_result !== "failed" || regression.before_sha256 === regression.expected_sha256) fail("compatibility restoration regression");
      restored = true;
    } else fail("compatibility regression category");
  }
  if (preservedEntries?.some(entry => !coveredEntries.has(entry))) fail("component preservation regression coverage");
  if (receipt.classification === "contract-restoring" && !restored) fail("contract restoration regression required");
}

/** Verify portable upgrade-trial observations against the definition at the approved predecessor.
 * Original native artifacts and actual trial authorization remain operator checks.
 */
function verifyTrialSuccessor(repo: string, link: ReturnType<typeof predecessorLink>, previous: AdoptionResult,
  next: ReturnType<typeof readAdoptionFrame>, boundary: AdoptionBoundary): string[] {
  const changes = compareUpgradeBindings({ repo, approved_default: previous.current_default,
    source_candidate: next.result.source_candidate, identity: next.result.identity }, previous);
  const previousSettings = loadCommittedSettings(repo, previous.current_default).settings, policy = previousSettings.trial;
  if (policy === null) fail("upgrade trial definition missing");
  const definitionInput = committedInput(repo, previous.current_default, policy.definition_path);
  if (!definitionInput || definitionInput.mode !== "100644" || definitionInput.sha256 !== policy.definition_sha256) fail("upgrade trial definition binding");
  let value = collectionReaders().yaml(definitionInput.bytes);
  let expectedCases: ReturnType<typeof readTrialDefinition>["expected"]["cases"] | null = null;
  if (value !== null && typeof value === "object" && !Array.isArray(value) && Reflect.get(value, "kind") === "docs-drift-trial") {
    const policy = collectTrialBindings({ repo, current_default: previous.current_default, identity: previous.identity });
    if (policy.candidate.protected_sha256 !== next.result.protected_sha256
      || (boundary.kind === "test-only" && policy.fixture.id !== boundary.fixture_id)) fail("full upgrade trial binding");
    expectedCases = policy.expected.cases;
    value = policy.upgrade;
  }
  const definition = object(value, ["schema_version", "kind", "predecessor_adoption_sha256",
    "candidate_component", "candidate_protected_sha256", "classification", "affected_entries", "changed_rules",
    ...(value !== null && typeof value === "object" && Object.hasOwn(value, "component_entries") ? ["component_entries"] : [])], "upgrade trial definition");
  if (definition.schema_version !== 1 || definition.kind !== "docs-drift-upgrade-trial"
    || definition.predecessor_adoption_sha256 !== previous.adoption_sha256
    || definition.candidate_protected_sha256 !== next.result.protected_sha256
    || !canonicalJSON(definition.candidate_component).equals(canonicalJSON(next.result.component_pin))) fail("upgrade trial prospective binding");
  if (typeof definition.classification !== "string" || !["execution", "contract", "uncertain"].includes(definition.classification)) fail("upgrade trial classification");
  const all = ["hosted", "copilot", "claude"] as const;
  let componentEntries: string[] | null = null;
  if (Object.hasOwn(definition, "component_entries")) {
    const selected = definition.component_entries;
    if (!changes.component.changed || definition.classification !== "execution" || !Array.isArray(definition.changed_rules) || definition.changed_rules.length
      || !Array.isArray(selected) || !selected.length || selected.length >= all.length || selected.some(entry => !all.includes(entry))
      || !canonicalJSON(selected).equals(canonicalJSON(all.filter(entry => selected.includes(entry))))) fail("component affected entry scope");
    componentEntries = selected;
  }
  if (definition.classification === "execution" && changes.component.changed && componentEntries === null) fail("component contract coverage required");
  const affected = componentEntries !== null
    ? all.filter(entry => componentEntries.includes(entry) || changes.known_affected_entries.includes(entry))
    : changes.component.changed || definition.classification !== "execution" ? [...all] : changes.known_affected_entries;
  if (!affected.length || !canonicalJSON(definition.affected_entries).equals(canonicalJSON(affected))) fail("upgrade affected surface inventory");
  const carried = compatibleCarriedReceipts.filter(name => name === "quiescence"
    || (name === "hosted_advisory" || name === "history_read" ? !affected.includes("hosted")
      : name === "copilot_entry" ? !affected.includes("copilot") : !affected.includes("claude")));
  if (!canonicalJSON(link.carry_receipts).equals(canonicalJSON(carried))) fail("trial carried receipt inventory");
  const policyBlobs = ["AGENTS.md", previousSettings.project_procedure, next.original.settings.project_procedure,
    previousSettings.scanner.adapter, next.original.settings.scanner.adapter];
  const policyChanged = changes.changed_settings.some(path => !["clients", "execution", "runtime_loader", "component_pin"].includes(String(path[0]))
    && !(path[0] === "publication" && path[1] === "adoption_record")) || changes.changed_blobs.some(path => policyBlobs.includes(path));
  const historyPolicyChanged = changes.changed_settings.some(path => path[0] === "reports"
    || (path[0] === "execution" && path[1] === "permissions" && path[2] === "actions"));
  if (!Array.isArray(definition.changed_rules)) fail("changed rule coverage required");
  if (!definition.changed_rules.length && historyPolicyChanged) fail("changed history coverage required");
  if (!definition.changed_rules.length && (definition.classification !== "execution" || policyChanged)) fail("changed rule coverage required");
  const receipt = object(link.trial, ["schema_version", "evidence_kind", "definition_path", "definition_sha256", "source_candidate",
    "predecessor_adoption_sha256", "reviewer_model", "artifact_sha256", "observations", "cases",
    ...(componentEntries !== null ? ["component_review"] : []), ...(boundary.kind === "test-only" ? ["fixture_id"] : [])], "upgrade trial receipt");
  if (receipt.schema_version !== 1 || receipt.evidence_kind !== boundary.kind
    || (boundary.kind === "test-only" && receipt.fixture_id !== boundary.fixture_id)
    || receipt.definition_path !== policy.definition_path || receipt.definition_sha256 !== definitionInput.sha256
    || receipt.source_candidate !== next.result.source_candidate || receipt.predecessor_adoption_sha256 !== previous.adoption_sha256
    || receipt.reviewer_model !== next.original.settings.execution.entries.copilot.reviewer.model) fail("upgrade trial receipt bindings");
  if (componentEntries !== null) verifyComponentReview(receipt.component_review, previous, next, boundary, all.filter(entry => !componentEntries.includes(entry)));
  adoptionDigest(receipt.artifact_sha256);
  const observations = object(receipt.observations, ["definition_reviewed", "prospective_bindings_matched", "affected_roles_exercised",
    "complete_native_results", "no_blocking_findings", "no_should_fix_findings"], "upgrade trial observations");
  if (Object.values(observations).some(value => value !== true)) fail("incomplete upgrade trial observations");
  if (!Array.isArray(receipt.cases) || receipt.cases.length !== definition.changed_rules.length) fail("changed rule case inventory");
  const ids = new Set<string>();
  let historyCovered = false;
  for (const [index, value] of definition.changed_rules.entries()) {
    const rule = object(value, ["id", "surface", "scenario", "fixture_sha256", "old_contract_sha256", "new_contract_sha256",
      "old_expected_sha256", "new_expected_sha256"], "changed rule definition");
    if (typeof rule.id !== "string" || !rule.id || ids.has(rule.id) || typeof rule.scenario !== "string" || !rule.scenario
      || typeof rule.surface !== "string" || !["assessment", "scan", "status", "attention", "history", "resolve", "publication", "lease"].includes(rule.surface)) fail("changed rule identity");
    ids.add(rule.id);
    for (const field of ["fixture_sha256", "old_contract_sha256", "new_contract_sha256", "old_expected_sha256", "new_expected_sha256"]) adoptionDigest(rule[field]);
    if (expectedCases !== null) {
      const expected = expectedCases.find(row => row.id === rule.id);
      if (!expected || expected.fixture_sha256 !== rule.fixture_sha256 || expected.outcome_sha256 !== rule.new_expected_sha256) fail("changed rule missing from full trial expectations");
    }
    if (rule.old_contract_sha256 === rule.new_contract_sha256 || rule.old_expected_sha256 === rule.new_expected_sha256) fail("changed rule case does not discriminate");
    const history = ["status", "attention", "history"].includes(rule.surface);
    historyCovered ||= history;
    const result = object(receipt.cases[index], ["id", "evidence_kind", "source_candidate", "rule_sha256", "outcome_sha256", "artifact_sha256",
      "result", ...(boundary.kind === "test-only" ? ["fixture_id"] : []), ...(history ? ["history_read", "unchanged_carried", "changed_new_attention"] : [])], "changed rule result");
    if (result.id !== rule.id || result.evidence_kind !== boundary.kind || (boundary.kind === "test-only" && result.fixture_id !== boundary.fixture_id)
      || result.source_candidate !== next.result.source_candidate || result.rule_sha256 !== canonicalDigest(rule)
      || result.outcome_sha256 !== rule.new_expected_sha256 || result.result !== "passed") fail("changed rule observation binding");
    adoptionDigest(result.artifact_sha256);
    if (history && (result.history_read !== true || result.unchanged_carried !== true || result.changed_new_attention !== true)) fail("changed history observations required");
  }
  if (historyPolicyChanged && !historyCovered) fail("changed history coverage required");
  return carried;
}

/** Rollback can select an earlier record while later delivered records still need retention. */
function verifyHistoricalAdoptionInputs(repo: string, current: string, boundary: AdoptionBoundary): void {
  const settingsByBlob = new Map<string, ReturnType<typeof loadCommittedSettings>["settings"]>(), checked = new Set<string>();
  const revisions = readGit(repo, "log", "--full-history", "--format=%H", current, "--", ".vh-adlc/docs-drift.yaml")
    .toString().trim().split("\n").filter(Boolean);
  for (const revision of revisions) {
    const settingsInput = committedInput(repo, revision, ".vh-adlc/docs-drift.yaml");
    if (!settingsInput) continue;
    let settings = settingsByBlob.get(settingsInput.blob);
    if (!settings) {
      settings = loadCommittedSettings(repo, revision).settings;
      settingsByBlob.set(settingsInput.blob, settings);
    }
    if (settings.publication.mode !== "adopted") continue;
    const path = settings.publication.adoption_record;
    const inputs = [committedInput(repo, revision, path), ...recordHistory(repo, revision, current, path).map(row => row.record)];
    for (const input of inputs) {
      if (input === null) continue;
      const key = canonicalJSON([path, input.sha256]).toString();
      if (checked.has(key)) continue;
      checked.add(key);
      const retained = committedInput(repo, current, path);
      if (input.mode !== "100644" || retained?.mode !== "100644" || retained.sha256 !== input.sha256) fail("historical adoption input changed " + path);
      const record = parseAdoptionRecord(input.bytes, boundary), candidate = immutable(record.source_candidate);
      const bindings = collectAdoptionBindings(repo, candidate);
      if (bindings.settings.publication.adoption_record !== path) fail("historical adoption record selection");
      const deliveries = recordHistory(repo, candidate, current, path)
        .filter(row => row.parents.length === 1 && row.parents[0] === candidate && row.record?.sha256 === input.sha256);
      if (deliveries.length !== 1) fail("historical adoption cutover child");
      const delivery = deliveries[0].commit;
      verifyCutoverAssembly({ repo, source_candidate: candidate, delivery_commit: delivery, record_path: path });
      verifyRetainedInputs(repo, delivery, current, [[path, input.sha256], [bindings.component_pin.path, bindings.component_pin.sha256]]);
    }
  }
}

/** Walk immutable predecessor defaults before accepting any carried observation. */
function verifyAdoptionRecord(options: { repo: string; current_default: string; identity?: PublicationIdentity }, boundary: AdoptionBoundary): AdoptionResult {
  const frames: ReturnType<typeof readAdoptionFrame>[] = [], seen = new Set<string>();
  let current = options.current_default;
  while (true) {
    if (seen.has(current)) fail("cyclic predecessor adoption");
    seen.add(current);
    const frame = readAdoptionFrame({ ...options, current_default: current }, boundary);
    frames.push(frame);
    verifyRetainedInputs(options.repo, current, options.current_default,
      [[frame.result.record_path, frame.result.adoption_sha256], [frame.original.component_pin.path, frame.original.component_pin.sha256]]);
    if (frame.record.predecessor === null) break;
    const link = predecessorLink(frame.record.predecessor, boundary);
    if (link.default_commit === frame.result.source_candidate) fail("predecessor must predate successor candidate");
    try { readGit(options.repo, "merge-base", "--is-ancestor", link.default_commit, frame.result.source_candidate); }
    catch { fail("predecessor default outside successor history"); }
    current = link.default_commit;
  }
  let previous: AdoptionResult | null = null;
  for (const frame of frames.reverse()) {
    if (previous === null) {
      verifyRecordedReceipts(options.repo, frame.record.receipts, frame.original, frame.result.source_candidate, frame.result.identity, frame.deliveryTime, boundary);
    } else {
      const link = predecessorLink(frame.record.predecessor, boundary);
      if (link.default_commit !== previous.current_default || link.record_path !== previous.record_path
        || link.record_sha256 !== previous.adoption_sha256) fail("predecessor adoption binding");
      const carried = link.route === "compatible" ? compatibleCarriedReceipts : verifyTrialSuccessor(options.repo, link, previous, frame, boundary);
      if (link.route === "compatible") verifyCompatibility(options.repo, link.compatibility, previous, frame, boundary);
      verifyRecordedReceipts(options.repo, frame.record.receipts, frame.original, frame.result.source_candidate, frame.result.identity,
        frame.deliveryTime, boundary, { names: carried, receipts: previous.receipts });
    }
    previous = frame.result;
  }
  if (previous === null) fail("missing adoption record");
  verifyHistoricalAdoptionInputs(options.repo, options.current_default, boundary);
  return previous;
}

/** Production always requires observed owner-attested receipts. */
export function verifyRuntimeAdoption(options: { repo: string; current_default: string; identity?: PublicationIdentity }) {
  return freezeJSON({ ...verifyAdoptionRecord(options, { kind: "observed" }), evidence: "owner-attestation" as const });
}

/** Only the separate synthetic driver constructs this test-only gate from its owned context. */
export async function createTrialAdoptionGate(options: { root: string; context_commit: string; runtime_directory: string }) {
  const { loadTrialContext, TRIAL_IDENTITY } = await import("./trial-context");
  const setup = Object.freeze({ ...options }), context = loadTrialContext(setup);
  return Object.freeze({ fixture_id: context.fixture_id, verify(input: { current_default: string }) {
    loadTrialContext(setup);
    const current = immutable(input.current_default);
    try { readGit(context.source, "merge-base", "--is-ancestor", context.source_commit, current); }
    catch { fail("synthetic adoption default outside owned source"); }
    const { settings } = loadCommittedSettings(context.source, current);
    if (settings.hostname !== "docs-drift.invalid" || settings.repository !== TRIAL_IDENTITY.repository
      || settings.default_branch !== TRIAL_IDENTITY.default_branch || settings.publication.actor !== TRIAL_IDENTITY.actor) fail("synthetic adoption namespace");
    const result = verifyAdoptionRecord({ repo: context.source, current_default: current, identity: TRIAL_IDENTITY },
      { kind: "test-only", fixture_id: context.fixture_id });
    return freezeJSON({ ...result, evidence: "test-only" as const, fixture_id: context.fixture_id });
  } });
}

const componentSignalPath = ".vh-adlc/docs-drift-upgrade-signal.yaml";
const clientSignalPath = ".vh-adlc/docs-drift-client-upgrade-signals.yaml";
const clientPackages = { copilot: "@github/copilot", claude: "@anthropic-ai/claude-code", codex: "@openai/codex" } as const;

/** Signals are non-executing intake. Their mismatch never selects or replaces a runtime. */
export function checkUpgradeSignals(options: { repo: string; source: string; identity?: PublicationIdentity }) {
  const source = immutable(options.source), { settings } = loadCommittedSettings(options.repo, source);
  let selectedPin: ComponentPin, selectedSettings = settings, target: "candidate-trial" | "adopted";
  if (settings.publication.mode === "staged") {
    if (settings.trial === null) return freezeJSON({ status: "staged-no-target", source_commit: source, matches: null });
    const trial = collectTrialBindings({ repo: options.repo, current_default: source, identity: options.identity });
    selectedPin = trial.candidate.component_pin.value;
    selectedSettings = trial.candidate.settings;
    target = "candidate-trial";
  } else {
    const input = committedInput(options.repo, source, settings.publication.adoption_record);
    if (!input || input.mode !== "100644") fail("committed adoption record missing");
    const record = parseAdoptionRecord(input.bytes, { kind: "observed" });
    // Consistency checks use only committed identity. Runtime selection still requires native identity.
    selectedPin = verifyAdoptionRecord({ repo: options.repo, current_default: source,
      identity: nativeIdentity(record.identity) }, { kind: "observed" }).component_pin;
    target = "adopted";
  }
  const input = committedInput(options.repo, source, componentSignalPath), clientInput = committedInput(options.repo, source, clientSignalPath);
  if (!input || input.mode !== "100644" || !clientInput || clientInput.mode !== "100644") fail("regular required upgrade signals");
  const component = object(collectionReaders().yaml(input.bytes), ["schema_version", "source_repository", "source_commit", "source_release"], "component signal");
  if (component.schema_version !== 1 || typeof component.source_repository !== "string"
    || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u.test(component.source_repository)
    || component.source_repository.split("/").some(part => part === "." || part === "..")
    || typeof component.source_release !== "string" || !/^(?:v)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(component.source_release)) fail("component signal identity");
  const actual = { source_repository: component.source_repository.toLowerCase(), source_commit: immutable(component.source_commit), source_release: component.source_release };
  const expected = { source_repository: selectedPin.source_repository, source_commit: selectedPin.source_commit,
    source_release: selectedPin.source_release };
  const clients = object(collectionReaders().yaml(clientInput.bytes), ["schema_version", "clients"], "client signals");
  if (clients.schema_version !== 1) fail("client signals schema");
  const signals = object(clients.clients, Object.keys(selectedSettings.clients), "client signal inventory");
  const clientResults = Object.entries(selectedSettings.clients).sort(([a], [b]) => compareUTF8(a, b)).map(([id, client]) => {
    const row = object(signals[id], ["provider", "package", "version", "platform"], "client signal " + id);
    if (typeof row.provider !== "string" || !["copilot", "claude", "codex"].includes(row.provider) || typeof row.package !== "string"
      || typeof row.version !== "string" || !row.version || typeof row.platform !== "string") fail("client signal identity");
    const selected = { provider: client.provider, package: clientPackages[client.provider], version: client.version, platform: client.platform };
    return { client_id: id, expected: selected, actual: row, matches: canonicalJSON(selected).equals(canonicalJSON(row)) };
  });
  const matches = canonicalJSON(expected).equals(canonicalJSON(actual)) && clientResults.every(result => result.matches);
  return freezeJSON({ status: matches ? "signal-match" : "signal-mismatch", source_commit: source, matches, target,
    component: { expected, actual }, clients: clientResults });
}


/** Collect mechanical execution changes. Component semantics require independent review.
 * This read-only comparison supplies no adoption or effect authority.
 */
export function collectUpgradeChanges(options: {
  repo: string; approved_default: string; source_candidate: string; identity: PublicationIdentity;
}) {
  const adopted = verifyRuntimeAdoption({ repo: options.repo, current_default: options.approved_default, identity: options.identity });
  return compareUpgradeBindings(options, adopted);
}

/** A new C selects its absent successor record. Earlier delivered selections remain authoritative. */
function verifyPriorSelection(repo: string, base: string, candidate: string): void {
  const settingsByBlob = new Map<string, ReturnType<typeof loadCommittedSettings>["settings"]>();
  const commits = readGit(repo, "rev-list", `${base}..${candidate}`).toString().trim().split("\n").filter(Boolean);
  for (const commit of commits) {
    const input = committedInput(repo, commit, ".vh-adlc/docs-drift.yaml");
    if (!input) continue;
    let settings = settingsByBlob.get(input.blob);
    if (!settings) {
      settings = loadCommittedSettings(repo, commit).settings;
      settingsByBlob.set(input.blob, settings);
    }
    if (settings.publication.mode !== "adopted") continue;
    const path = settings.publication.adoption_record, record = committedInput(repo, commit, path);
    if (record === null) continue;
    const retained = committedInput(repo, base, path);
    if (record.mode !== "100644" || retained?.mode !== "100644" || retained.sha256 !== record.sha256) fail("intervening adopted selection");
  }
}

function compareUpgradeBindings(options: { repo: string; approved_default: string; source_candidate: string; identity: PublicationIdentity }, adopted: AdoptionResult) {
  const { repo } = options, base = immutable(options.approved_default), candidate = immutable(options.source_candidate);
  try { readGit(repo, "merge-base", "--is-ancestor", base, candidate); }
  catch { fail("successor source must descend from approved default"); }
  const previous = collectAdoptionBindings(repo, base);
  verifyRetainedInputs(repo, base, candidate,
    [[adopted.record_path, adopted.adoption_sha256], [previous.component_pin.path, previous.component_pin.sha256]]);
  verifyPriorSelection(repo, base, candidate);
  const next = collectAdoptionBindings(repo, candidate);
  if (previous.settings.repository !== next.settings.repository || previous.settings.hostname !== next.settings.hostname
    || previous.settings.default_branch !== next.settings.default_branch) fail("successor consumer identity differs");
  const leaves = (settings: typeof previous.settings) => new Map(classifySettingsLeaves(settings)
    .filter(row => row.classification === "protected").map(row => [canonicalJSON(row.path).toString(), row] as const));
  const before = leaves(previous.settings), after = leaves(next.settings);
  const changedSettings = [...new Map([...before, ...after])].sort(([a], [b]) => compareUTF8(a, b)).filter(([key]) => {
    const old = before.get(key), current = after.get(key);
    return !old || !current || !canonicalJSON(old.value).equals(canonicalJSON(current.value));
  }).map(([, row]) => row.path);
  const entries = ["hosted", "copilot", "claude"] as const;
  type Entry = typeof entries[number];
  const affected = new Set<Entry>();
  const mark = (...selected: Entry[]) => { for (const entry of selected) affected.add(entry); };
  for (const path of changedSettings) {
    if (path[0] === "component_pin" || (path[0] === "publication" && path[1] === "adoption_record")) continue;
    if (path[0] === "clients") {
      const selected = entries.filter(name => [previous.settings.execution.entries[name], next.settings.execution.entries[name]]
        .some(entry => entry.worker.client === path[1] || entry.reviewer.client === path[1]));
      mark(...(selected.length ? selected : entries));
    } else if (path[0] === "runtime_loader") mark(...entries);
    else if (path[0] === "execution" && path[1] === "entries" && (path[2] === "hosted" || path[2] === "copilot" || path[2] === "claude")) mark(path[2]);
    else if (path[0] === "execution" && path[1] === "claude_command") mark("claude");
    else if (path[0] === "execution") mark("hosted");
    else mark(...entries);
  }
  const oldBlobs = new Map(previous.protected_manifest.blobs.map(row => [row[0], row] as const));
  const newBlobs = new Map(next.protected_manifest.blobs.map(row => [row[0], row] as const));
  const changedBlobs = [...new Set([...oldBlobs.keys(), ...newBlobs.keys()])].sort(compareUTF8)
    .filter(path => !canonicalJSON(oldBlobs.get(path) ?? null).equals(canonicalJSON(newBlobs.get(path) ?? null)));
  let callerProof: ReturnType<typeof verifyCompatibleWorkerCaller> | null = null, callerFailure: string | null = null;
  const scheduled = previous.settings.execution.scheduled_workflow;
  if (previous.component_pin.path !== next.component_pin.path) {
    const old = committedInput(repo, base, scheduled), current = committedInput(repo, candidate, scheduled);
    if (scheduled === next.settings.execution.scheduled_workflow && old && current && old.mode === current.mode) {
      try { callerProof = verifyCompatibleWorkerCaller({ previous: old.bytes, next: current.bytes,
        worker_path: previous.settings.execution.worker_workflow, previous_component_pin: previous.component_pin.path,
        next_component_pin: next.component_pin.path }); }
      catch (error) { callerFailure = error instanceof Error ? error.message : "caller comparison unavailable"; }
    } else callerFailure = "scheduled caller path, mode or committed input changed";
    if (!callerProof) mark("hosted");
  }
  for (const path of changedBlobs) {
    if (path === scheduled && callerProof) continue;
    if ([previous.settings.execution.claude_command, next.settings.execution.claude_command].includes(path)) mark("claude");
    else if ([previous.settings.runtime_loader.launcher, next.settings.runtime_loader.launcher].includes(path)) mark(...entries);
    else if ([previous.settings.execution.worker_workflow, next.settings.execution.worker_workflow,
      previous.settings.execution.scheduled_workflow, next.settings.execution.scheduled_workflow].includes(path)) mark("hosted");
    else mark(...entries);
  }
  const componentChanged = !canonicalJSON(previous.component_pin.value).equals(canonicalJSON(next.component_pin.value));
  return freezeJSON({ kind: "docs-drift-upgrade-bindings", approved_default: base, source_candidate: candidate,
    predecessor_adoption_sha256: adopted.adoption_sha256, changed_settings: changedSettings, changed_blobs: changedBlobs,
    component: { previous: previous.component_pin.value, next: next.component_pin.value, changed: componentChanged,
      classification: componentChanged ? "pending-independent-review" : "unchanged" },
    known_affected_entries: entries.filter(entry => affected.has(entry)), caller_pin_exception: callerProof, caller_failure: callerFailure });
}
