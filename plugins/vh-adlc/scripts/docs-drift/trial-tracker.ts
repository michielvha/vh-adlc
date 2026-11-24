import { readGit, writeMetadataObject } from "./git";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { COLLECTOR_RESOURCE_LIMIT, type CollectorLabel, type CollectorResources } from "./collector-proof";
import type { TrialContext } from "./trial-context";

type State = { schema_version: 1; kind: "docs-drift-synthetic-tracker"; fixture_id: string;
  resources: [string, Record<string, unknown>][]; labels: CollectorLabel[] };
export type TrialTracker = { commit: string; resources: CollectorResources; labels: Map<string, CollectorLabel> };
const stateRef = "refs/heads/state";

function fail(reason: string): never { throw Error("docs-drift synthetic tracker " + reason); }
function parseState(bytes: Uint8Array, fixtureID: string): State {
  if (bytes.length > 8 * 1024 * 1024) fail("state size bound");
  const value = JSON.parse(decodeUTF8(bytes)) as State;
  if (!value || typeof value !== "object" || !canonicalJSON(value).equals(Buffer.from(bytes))
    || Object.keys(value).sort().join(",") !== "fixture_id,kind,labels,resources,schema_version"
    || value.schema_version !== 1 || value.kind !== "docs-drift-synthetic-tracker" || value.fixture_id !== fixtureID
    || !Array.isArray(value.resources) || value.resources.length > COLLECTOR_RESOURCE_LIMIT || !Array.isArray(value.labels)
    || value.labels.length > 1000) fail("state schema or fixture binding");
  const keys = new Set<string>(), ids = new Set<number>();
  for (const row of value.resources) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || !/^(?:pulls|issues|comments)\/[1-9][0-9]*$/u.test(row[0])
      || keys.has(row[0]) || !row[1] || typeof row[1] !== "object" || Array.isArray(row[1])
      || !Number.isSafeInteger(row[1].id) || Number(row[1].id) < 1 || ids.has(Number(row[1].id))) fail("resource identity");
    const [surface, key] = row[0].split("/");
    if (Number(key) !== (surface === "comments" ? row[1].id : row[1].number)) fail("resource key binding");
    keys.add(row[0]); ids.add(Number(row[1].id));
  }
  const names = new Set<string>(), labelIDs = new Set<number>();
  for (const label of value.labels) {
    if (!label || typeof label !== "object" || Object.keys(label).sort().join(",") !== "id,name"
      || typeof label.name !== "string" || !label.name || /[\r\n\0]/u.test(label.name)
      || !Number.isSafeInteger(label.id) || label.id < 1 || names.has(label.name.toLowerCase()) || labelIDs.has(label.id)) fail("label identity");
    names.add(label.name.toLowerCase()); labelIDs.add(label.id);
  }
  return value;
}

/** Actual fixture objects and a CAS ref survive every separate invocation of the installed driver. */
export function readTrialTracker(context: TrialContext): TrialTracker {
  const current = readGit(context.tracker, "rev-parse", "--verify", stateRef).toString().trim();
  const history = readGit(context.tracker, "rev-list", "--parents", "--max-count=1002", current).toString().trim().split("\n");
  if (history.length > 1000) fail("history bound");
  let foundInitial = false, state: State | undefined;
  for (const line of history) {
    const [head, ...parents] = line.split(" ");
    if (foundInitial || parents.length > 1) fail("linear owned state history required");
    const tree = readGit(context.tracker, "ls-tree", "-r", head).toString();
    if (!/^100644 blob [a-f0-9]{40}(?:[a-f0-9]{24})?\tstate\.json\n$/u.test(tree)) fail("state-only tree required");
    const parsed = parseState(readGit(context.tracker, "show", head + ":state.json"), context.fixture_id);
    state ??= parsed;
    if (head === context.tracker_initial_commit) {
      foundInitial = true;
      if (parents.length !== 0) fail("initial tracker must be a root commit");
    } else if (parents.length !== 1) fail("initial tracker ancestry missing");
  }
  if (!foundInitial || !state) fail("initial tracker ancestry missing");
  return { commit: current, resources: new Map(state.resources), labels: new Map(state.labels.map(label => [label.name.toLowerCase(), label])) };
}

/** A losing concurrent writer retains uncertainty and cannot issue successful application proof. */
export function persistTrialTracker(context: TrialContext, state: TrialTracker): void {
  const next: State = { schema_version: 1, kind: "docs-drift-synthetic-tracker", fixture_id: context.fixture_id,
    resources: [...state.resources].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
    labels: [...state.labels.values()].sort((left, right) => left.id - right.id) };
  const bytes = canonicalJSON(next); parseState(bytes, context.fixture_id);
  const old = readGit(context.tracker, "show", state.commit + ":state.json");
  if (sha256(old) === sha256(bytes)) fail("mutation made no change");
  const blob = writeMetadataObject(context.tracker, "blob", bytes);
  const tree = writeMetadataObject(context.tracker, "tree", Buffer.concat([Buffer.from("100644 state.json\0"), Buffer.from(blob, "hex")]));
  const head = writeMetadataObject(context.tracker, "commit", Buffer.from(`tree ${tree}\nparent ${state.commit}\nauthor Synthetic <fixture@example.invalid> 0 +0000\ncommitter Synthetic <fixture@example.invalid> 0 +0000\n\nOwned synthetic tracker mutation\n`));
  readGit(context.tracker, "update-ref", stateRef, head, state.commit);
  const observed = readTrialTracker(context);
  if (observed.commit !== head || !canonicalJSON([...observed.resources]).equals(canonicalJSON(next.resources))) fail("committed state changed during observation");
  state.commit = head;
}
