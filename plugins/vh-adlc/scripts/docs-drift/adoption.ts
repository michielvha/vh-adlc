import { verifyCompatibleWorkerCaller } from "./worker-callers";
import type { PublicationIdentity } from "./transport";
import { readGit, collectionReaders } from "./git";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { classifySettingsLeaves, loadCommittedSettings, settingsProjections } from "./settings";

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
function object(value: unknown, keys: string[], label = "object"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid " + label);
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== [...keys].sort().join(",")) fail(label + " fields");
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

function verifyRecordedReceipts(value: unknown, bindings: ReturnType<typeof collectAdoptionBindings>, candidate: string, identity: PublicationIdentity, deliveryTime: number, boundary: AdoptionBoundary): void {
  const receipts = object(value, Object.keys(receiptRequirements));
  const target = canonicalDigest({ schema_version: 1, repository: bindings.settings.repository,
    source_candidate: candidate, protected_sha256: bindings.protected_sha256, component_pin_sha256: bindings.component_pin.sha256, identity });
  for (const name of Object.keys(receiptRequirements) as (keyof typeof receiptRequirements)[]) {
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
      if (bindings.settings.reports.workflow_id === null || receipt.producer_workflow_id !== bindings.settings.reports.workflow_id
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
function verifyAdoptionRecord(options: { repo: string; current_default: string; identity?: PublicationIdentity }, boundary: AdoptionBoundary) {
  const { repo, current_default: current } = options;
  immutable(current);
  if (loadCommittedSettings(repo, current).settings.publication.mode !== "adopted") fail("consumer is not adopted");
  const bindings = collectAdoptionBindings(repo, current), path = bindings.settings.publication.adoption_record;
  const input = committedInput(repo, current, path);
  if (!input || input.mode !== "100644") fail("committed adoption record missing");
  const record = object(collectionReaders().yaml(input.bytes), ["schema_version", "kind", "source_candidate", "protected_sha256",
    "protected_manifest", "component_pin_sha256", "identity", "receipts", "predecessor", ...(boundary.kind === "test-only" ? ["fixture_id"] : [])]);
  if (boundary.kind === "test-only" && record.fixture_id !== boundary.fixture_id) fail("synthetic adoption fixture identity");
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
  verifyRecordedReceipts(record.receipts, original, candidate, identity, deliveryTime, boundary);
  for (const historical of recordHistory(repo, delivery, current, path)) {
    if (historical.record?.mode !== "100644" || historical.record.sha256 !== input.sha256) fail("immutable adoption record changed");
  }
  return freezeJSON({ kind: "docs-drift-runtime-adoption", current_default: current,
    source_candidate: candidate, delivery_commit: delivery, record_path: path, adoption_sha256: input.sha256,
    protected_sha256: bindings.protected_sha256, component_pin: bindings.component_pin.value, identity, receipts: record.receipts });
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
  if (settings.publication.mode === "staged") {
    if (settings.trial !== null) fail("current-default trial signal target verification required");
    return freezeJSON({ status: "staged-no-target", source_commit: source, matches: null });
  }
  const adopted = verifyRuntimeAdoption({ repo: options.repo, current_default: source, identity: options.identity });
  const input = committedInput(options.repo, source, componentSignalPath), clientInput = committedInput(options.repo, source, clientSignalPath);
  if (!input || input.mode !== "100644" || !clientInput || clientInput.mode !== "100644") fail("regular required upgrade signals");
  const component = object(collectionReaders().yaml(input.bytes), ["schema_version", "source_repository", "source_commit", "source_release"], "component signal");
  if (component.schema_version !== 1 || typeof component.source_repository !== "string"
    || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u.test(component.source_repository)
    || component.source_repository.split("/").some(part => part === "." || part === "..")
    || typeof component.source_release !== "string" || !/^(?:v)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(component.source_release)) fail("component signal identity");
  const actual = { source_repository: component.source_repository.toLowerCase(), source_commit: immutable(component.source_commit), source_release: component.source_release };
  const expected = { source_repository: adopted.component_pin.source_repository, source_commit: adopted.component_pin.source_commit,
    source_release: adopted.component_pin.source_release };
  const clients = object(collectionReaders().yaml(clientInput.bytes), ["schema_version", "clients"], "client signals");
  if (clients.schema_version !== 1) fail("client signals schema");
  const signals = object(clients.clients, Object.keys(settings.clients), "client signal inventory");
  const clientResults = Object.entries(settings.clients).sort(([a], [b]) => compareUTF8(a, b)).map(([id, client]) => {
    const row = object(signals[id], ["provider", "package", "version", "platform"], "client signal " + id);
    if (typeof row.provider !== "string" || !["copilot", "claude", "codex"].includes(row.provider) || typeof row.package !== "string"
      || typeof row.version !== "string" || !row.version || typeof row.platform !== "string") fail("client signal identity");
    const selected = { provider: client.provider, package: clientPackages[client.provider], version: client.version, platform: client.platform };
    return { client_id: id, expected: selected, actual: row, matches: canonicalJSON(selected).equals(canonicalJSON(row)) };
  });
  const matches = canonicalJSON(expected).equals(canonicalJSON(actual)) && clientResults.every(result => result.matches);
  return freezeJSON({ status: matches ? "signal-match" : "signal-mismatch", source_commit: source, matches,
    component: { expected, actual }, clients: clientResults });
}


/** Collect mechanical execution changes. Component semantics require independent review.
 * This read-only comparison supplies no adoption or effect authority.
 */
export function collectUpgradeChanges(options: {
  repo: string; approved_default: string; source_candidate: string; identity: PublicationIdentity;
}) {
  const { repo } = options, base = immutable(options.approved_default), candidate = immutable(options.source_candidate);
  const adopted = verifyRuntimeAdoption({ repo, current_default: base, identity: options.identity });
  try { readGit(repo, "merge-base", "--is-ancestor", base, candidate); }
  catch { fail("successor source must descend from approved default"); }
  const previous = collectAdoptionBindings(repo, base);
  for (const [path, digest] of [[adopted.record_path, adopted.adoption_sha256], [previous.component_pin.path, previous.component_pin.sha256]]) {
    const selected = committedInput(repo, candidate, path);
    if (!selected || selected.mode !== "100644" || selected.sha256 !== digest
      || recordHistory(repo, base, candidate, path).some(row => row.record?.mode !== "100644" || row.record.sha256 !== digest)) fail("immutable predecessor input changed " + path);
  }
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
