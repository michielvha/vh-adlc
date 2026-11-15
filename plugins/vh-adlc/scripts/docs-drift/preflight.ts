import { isGitAncestor, readAdoptionInput, readGit, verifiedHelperEnvironment } from "./git";
import { publisherActor, sameLogin } from "./identity";
import { fullModel, modelMatches, ref } from "./manifests";
import { canonicalDigest, canonicalJSON, freezeJSON, protocolPath } from "./protocol";
import { exactRecord } from "./publication-decisions";
import { loadCommittedSettings, parseComponentBinding, type InstalledSettings } from "./settings";
import { readYAML } from "../settings-file";
import { OUTPUT_LIMIT } from "./owned-process";
import { nativeCredentialReferences } from "./role-launch";

export const CORE_PREFLIGHT_CHECKS = ["published_install", "installed_routing", "scanner_parity", "native_trials", "paired_review", "rollback_rehearsal"] as const;
const checkNames = [...CORE_PREFLIGHT_CHECKS, "documents_package", "effects_recovery", "workflow_validation"] as const;
const upgradeRows = {
  initial: [...CORE_PREFLIGHT_CHECKS],
  component_unrelated: ["published_install", "installed_routing"],
  procedure_report: ["published_install", "installed_routing", "documents_package"],
  scanner_scope_feedback: ["published_install", "installed_routing", "scanner_parity"],
  effects_recovery: ["published_install", "installed_routing", "effects_recovery"],
  workflow_pin: ["published_install", "installed_routing", "workflow_validation"],
  workflow_runtime_permissions: ["published_install", "installed_routing", "workflow_validation", "native_trials"],
  native_entry: ["published_install", "installed_routing", "native_trials"],
} as const;
type Change = keyof typeof upgradeRows;
type CheckName = typeof checkNames[number];
type Component = ReturnType<typeof parseComponentBinding>;
type FileImage = { mode: "100644" | "100755"; sha256: string } | null;
type Activation = { path: string; before: FileImage; after: FileImage };
type Target = { repository: string; candidate_commit: string; component: Component; configuration_sha256: string; activation: Activation[] };
type Evidence = { component: Component; consumer_commit: string; evidence_sha256: string };
type Check = Evidence & { name: CheckName; status: "passed"; target_sha256: string; note: string };
type NativeEntry = Evidence & { entry_sha256: string; worker_model: string; reviewer_model: string; publisher: { actor: string; actor_id: number } };

function fail(reason: string): never { throw Error("docs-drift preflight " + reason); }
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail("nonempty text required");
  return value;
}
function hash(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/u.test(result)) fail("digest required");
  return result;
}
function commit(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(result)) fail("immutable commit required");
  return result;
}
function object(value: unknown, fields: string[]) { return exactRecord(value, fields, "docs-drift preflight unknown or missing fields"); }
function image(value: unknown): FileImage {
  if (value === null) return null;
  const input = object(value, ["mode", "sha256"]);
  if (input.mode !== "100644" && input.mode !== "100755") fail("regular activation file required");
  return { mode: input.mode, sha256: hash(input.sha256) };
}
function evidence(value: Record<string, unknown>): Evidence {
  return { component: parseComponentBinding(value.component), consumer_commit: commit(value.consumer_commit), evidence_sha256: hash(value.evidence_sha256) };
}
function same(left: unknown, right: unknown) { return canonicalDigest(left) === canonicalDigest(right); }

/** These two activation fields are the only omissions from the committed semantic policy. */
export function normalizedConfigurationDigest(settings: InstalledSettings): string {
  const { mode: _mode, checklist_path: _path, ...publication } = settings.publication;
  return canonicalDigest({ ...settings, publication });
}

/** Bind native trial observations to their entry configuration independently of unrelated policy changes. */
export function nativeEntryDigest(settings: InstalledSettings, entry: string): string {
  if (!Object.hasOwn(settings.execution.entries, entry)) fail("configured native entry required");
  const selected = settings.execution.entries[entry];
  const credentials = [...new Set([selected.worker, selected.reviewer].flatMap(role =>
    nativeCredentialReferences(settings.clients[role.client].provider, settings.credential_references)))].sort();
  return canonicalDigest({ entry, roles: selected,
    clients: { worker: settings.clients[selected.worker.client], reviewer: settings.clients[selected.reviewer.client] },
    credential_references: credentials, publisher: publisherActor(settings, entry).toLowerCase() });
}

/** The C and activation-diff review target is available before the checklist or D exists. */
export function preflightReviewTarget(target: Target): string {
  return canonicalDigest({ repository: target.repository, candidate_commit: target.candidate_commit, component: target.component,
    configuration_sha256: target.configuration_sha256, activation: target.activation });
}

export function upgradeChecks(changes: readonly Change[]): CheckName[] {
  if (!changes.length || changes.some(change => !Object.hasOwn(upgradeRows, change)) || new Set(changes).size !== changes.length
    || changes.includes("initial") && changes.length !== 1) fail("classified change rows required");
  return [...new Set<CheckName>(changes.flatMap(change => [...upgradeRows[change]]))];
}

/** Operator/reviewer attestations retain their original targets and confer no effect authority. */
export function parsePreflightChecklist(value: unknown) {
  canonicalJSON(value);
  const input = object(value, ["schema_version", "kind", "repository", "candidate_commit", "component", "configuration_sha256",
    "activation", "review", "changes", "checks", "native_entries", "pending_operations"]);
  if (input.schema_version !== 1 || input.kind !== "docs-drift-preflight" || !Array.isArray(input.activation)
    || !Array.isArray(input.changes) || !Array.isArray(input.checks) || !Array.isArray(input.pending_operations)) fail("supported complete checklist required");
  const target: Target = { repository: text(input.repository), candidate_commit: commit(input.candidate_commit), component: parseComponentBinding(input.component),
    configuration_sha256: hash(input.configuration_sha256), activation: input.activation.map(value => {
      const file = object(value, ["path", "before", "after"]);
      const before = image(file.before), after = image(file.after);
      if (same(before, after)) fail("activation must describe a real change");
      return { path: protocolPath(file.path), before, after };
    }) };
  if (!target.activation.length || new Set(target.activation.map(file => file.path)).size !== target.activation.length
    || !target.activation.some(file => file.path === ".vh-adlc/docs-drift.yaml")) fail("exact activation and settings diff required");
  const changes = input.changes.map(value => {
    const selected = Object.keys(upgradeRows).find(name => name === value);
    if (!selected) fail("unclassified change remains pending");
    return selected as Change;
  });
  const required = upgradeChecks(changes);
  const review = object(input.review, ["target_sha256", "evidence_sha256", "model"]);
  if (hash(review.target_sha256) !== preflightReviewTarget(target)) fail("current candidate/activation review target changed");
  const checks: Check[] = input.checks.map(value => {
    const check = object(value, ["name", "status", "component", "consumer_commit", "evidence_sha256", "target_sha256", "note"]);
    const name = checkNames.find(name => name === check.name);
    if (!name || check.status !== "passed") fail("passed known checks required");
    return { name, status: "passed", ...evidence(check), target_sha256: hash(check.target_sha256), note: text(check.note) };
  });
  if (new Set(checks.map(check => check.name)).size !== checks.length
    || [...CORE_PREFLIGHT_CHECKS, ...required].some(name => !checks.some(check => check.name === name))) fail("required check missing");
  for (const check of checks) if (required.includes(check.name) && (!same(check.component, target.component)
    || check.consumer_commit !== target.candidate_commit || check.target_sha256 !== preflightReviewTarget(target))) fail("selected check requires current component/candidate/activation applicability");
  if (required.includes("paired_review")) {
    const paired = checks.find(check => check.name === "paired_review");
    if (!paired || paired.consumer_commit !== target.candidate_commit || paired.evidence_sha256 !== review.evidence_sha256) fail("final paired review must bind C and its activation");
  }
  const entries = input.native_entries;
  if (entries === null || typeof entries !== "object" || Array.isArray(entries)) fail("native entry observations required");
  const native_entries = Object.fromEntries(Object.entries(entries).map(([name, value]) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(name)) fail("native entry name required");
    const entry = object(value, ["entry_sha256", "worker_model", "reviewer_model", "publisher", "component", "consumer_commit", "evidence_sha256"]);
    const publisher = object(entry.publisher, ["actor", "actor_id"]);
    if (typeof publisher.actor_id !== "number" || !Number.isSafeInteger(publisher.actor_id) || publisher.actor_id < 1) fail("native publisher numeric identity required");
    const parsed: NativeEntry = { ...evidence(entry), entry_sha256: hash(entry.entry_sha256), worker_model: fullModel(entry.worker_model), reviewer_model: fullModel(entry.reviewer_model),
      publisher: { actor: text(publisher.actor), actor_id: publisher.actor_id } };
    return [name, parsed];
  }));
  const pending_operations = input.pending_operations.map(value => {
    const pending = object(value, ["operation_id", "component", "lease_ref", "lease_object", "preserved"]);
    const id = text(pending.operation_id);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(id) || pending.preserved !== true) fail("pending original operation must be preserved");
    return { operation_id: id, component: parseComponentBinding(pending.component), lease_ref: ref(pending.lease_ref), lease_object: commit(pending.lease_object), preserved: true as const };
  });
  if (new Set(pending_operations.map(operation => operation.operation_id)).size !== pending_operations.length) fail("duplicate pending operation");
  return freezeJSON({ schema_version: 1 as const, kind: "docs-drift-preflight" as const, ...target, changes,
    review: { target_sha256: hash(review.target_sha256), evidence_sha256: hash(review.evidence_sha256), model: fullModel(review.model) }, checks, native_entries, pending_operations });
}

/** Validate the committed C-to-D activation and current policy. Current effect grants remain separate. */
export function verifyProductionPreflight(options: { repo: string; current_default: string; component: Component }) {
  const current = loadCommittedSettings(options.repo, options.current_default).settings;
  if (current.schema_version !== 2 || current.publication.mode !== "adopted" || !current.publication.checklist_path || !current.component)
    fail("new production work requires adopted ordinary settings and a complete checklist");
  if (!same(current.component, parseComponentBinding(options.component))) fail("installed component differs from policy");
  const path = current.publication.checklist_path, blob = readAdoptionInput(options.repo, options.current_default, path);
  if (!blob || blob.bytes.length > OUTPUT_LIMIT) fail("bounded committed checklist required");
  const checklist = parsePreflightChecklist(readYAML(blob.bytes, reason => fail(reason), { offline: true, environment: verifiedHelperEnvironment() }));
  const candidate = checklist.candidate_commit;
  if (checklist.repository !== current.repository || !same(checklist.component, current.component)
    || checklist.configuration_sha256 !== normalizedConfigurationDigest(current) || !isGitAncestor(options.repo, candidate, options.current_default)) fail("current policy/checklist binding changed");
  const staged = loadCommittedSettings(options.repo, candidate).settings;
  if (staged.schema_version !== 2 || staged.publication.mode !== "staged" || normalizedConfigurationDigest(staged) !== checklist.configuration_sha256
    || readAdoptionInput(options.repo, candidate, path) !== null || checklist.activation.some(file => file.path === path)) fail("staged C and fresh immutable checklist required");
  const added = readGit(options.repo, "log", "--full-history", "--format=%H", "--diff-filter=A", options.current_default, "--", path).toString().trim().split("\n");
  const activation = added.find(commit => {
    const parents = readGit(options.repo, "rev-list", "--parents", "-n", "1", commit).toString().trim().split(" ");
    return parents.length === 2 && parents[1] === candidate && readAdoptionInput(options.repo, commit, path)?.sha256 === blob.sha256;
  });
  if (!activation) fail("reviewed activation D must be C's direct child");
  const activated = loadCommittedSettings(options.repo, activation).settings;
  if (activated.schema_version !== 2 || activated.publication.mode !== "adopted" || activated.publication.checklist_path !== path
    || normalizedConfigurationDigest(activated) !== checklist.configuration_sha256) fail("activation settings changed");
  const changed = readGit(options.repo, "diff-tree", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", candidate, activation).toString().split("\0").filter(Boolean).sort();
  const allowed = [...checklist.activation.map(file => file.path), path].sort();
  if (!same(changed, allowed)) fail("unapproved activation paths changed");
  for (const file of checklist.activation) {
    const actual = (commit: string) => {
      const value = readAdoptionInput(options.repo, commit, file.path);
      return value ? { mode: value.mode, sha256: value.sha256 } : null;
    };
    if (!same(actual(candidate), file.before) || !same(actual(activation), file.after) || !same(actual(options.current_default), file.after)) fail("activation file content or mode changed");
  }
  for (const item of [...checklist.checks, ...Object.values(checklist.native_entries)])
    if (!isGitAncestor(options.repo, item.consumer_commit, candidate)) fail("evidence consumer attribution unavailable");
  if (!same(Object.keys(current.execution.entries).sort(), Object.keys(checklist.native_entries).sort())) fail("complete configured native entry observations required");
  for (const [entry, selected] of Object.entries(current.execution.entries)) {
    const observed = checklist.native_entries[entry];
    const original = loadCommittedSettings(options.repo, observed.consumer_commit).settings;
    if (original.schema_version !== 2 || !same(original.component, observed.component)
      || nativeEntryDigest(original, entry) !== observed.entry_sha256) fail("original native entry attribution changed");
    if (observed.entry_sha256 !== nativeEntryDigest(current, entry) || !sameLogin(observed.publisher.actor, publisherActor(current, entry))
      || !modelMatches(selected.worker.model, observed.worker_model) || !modelMatches(selected.reviewer.model, observed.reviewer_model)
      || !selected.worker.identity_source || !selected.reviewer.identity_source) fail("native entry configuration or observed model changed");
  }
  return freezeJSON({ authority: "none" as const, policy_sha256: canonicalDigest(checklist), checklist, activation_commit: activation });
}
