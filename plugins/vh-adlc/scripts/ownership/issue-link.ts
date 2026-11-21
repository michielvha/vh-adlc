import { OwnershipGit } from "./git";
import { associate, validAlias, writer, type Item } from "./identity";
import { currentWriter, describeRecord, matching, OPERATION, publish, snapshot, type EntryRequest, type RecordState, type Result, type Snapshot } from "./entry";
import { requirePending, savePending } from "./pending";

type Action = "link" | "issue-pending" | "issue-recover" | "resolve-alias";
type Link = EntryRequest & { operation: string; alias?: Item; preview?: string | Buffer; confirmed?: boolean; notCreated?: boolean; conflict?: string; choose?: string; approved?: boolean; stopped?: boolean; preserved?: boolean };

function itemAt(git: OwnershipGit, view: Snapshot, item: Item) {
  const association = associate(git, view.tip.main, view.binding.repository, item);
  return { association, records: matching(view.state, association.aliases) };
}

function one(records: RecordState[]): RecordState {
  if (records.length !== 1 || !records[0]) throw Error("select one existing reservation");
  return records[0];
}

function verify(git: OwnershipGit, view: Snapshot, operation: string, previous: RecordState[], records: RecordState[], status: Result["status"]): Result {
  const applied = publish(git, view, { ...view.state, operation, items: [...view.state.items.filter(value => !previous.includes(value)), ...records] });
  if (!applied && status === "pending") throw Error("issue preparation is uncertain; recover the pending operation before creating an issue");
  const after = snapshot(git);
  if (typeof after === "string") throw Error("reservation authority changed before verifying the update");
  const selected = records.map(record => after.state.items.find(current => JSON.stringify(current) === JSON.stringify(record)));
  if (selected.some(record => !record)) throw Error("alias update did not verify; inspect reservation status before continuing");
  return { ...describeRecord(git, selected[0]!, status, after.tip.reservation), operation };
}

export function updateAliases(action: Action, request: Link): Result {
  if (request.noPush || !OPERATION.test(request.operation) || request.operation === "absent") throw Error("alias update needs an operation ID and permission to update the reservation");
  const git = new OwnershipGit(request.repo, request.env);
  const view = snapshot(git);
  if (typeof view === "string") throw Error("repository has no adopted reservation history");
  if (action === "resolve-alias") {
    if (!request.approved || !request.stopped || !request.preserved || !request.conflict || !request.choose || !validAlias(request.choose)) {
      throw Error("alias reconciliation needs both writers stopped, preserved work and the owner's exact selection");
    }
    const records = view.state.items.filter(row => row.conflict === request.conflict);
    const chosen = records.find(row => row.aliases.includes(request.choose!));
    if (!chosen || records.length < 2) throw Error("alias conflict changed or no longer exists");
    const incoming = currentWriter(git, request.env ?? process.env, chosen.writer.locator, request.client);
    if (incoming.fingerprint !== chosen.writer.fingerprint || incoming.checkout !== chosen.writer.checkout) {
      throw Error("run reconciliation from the selected writer and checkout");
    }
    const aliases = [...new Set(records.flatMap(row => row.aliases))];
    return verify(git, view, request.operation, records, [{ aliases, writer: incoming, operation: request.operation }], "linked");
  }

  const { association, records } = itemAt(git, view, request);
  const current = one(records);
  if (current.conflict) throw Error("resolve the existing alias conflict before making another change");
  const identity = writer(request.env ?? process.env, association.locator, request.client);
  if (identity.fingerprint !== current.writer.fingerprint) throw Error("only the current writer can change the reservation's aliases");
  const mine = currentWriter(git, request.env ?? process.env, association.locator, request.client);
  if (action === "issue-pending") {
    if (!request.spec || !request.preview || current.aliases.some(alias => alias.startsWith("issue:"))) {
      throw Error("select an issue-less draft and its approved issue preview");
    }
    if (current.pending) throw Error("another issue creation is pending; recover it before attempting another");
    const digest = savePending(git, request.preview);
    const next: RecordState = { aliases: current.aliases, writer: mine, operation: request.operation, pending: digest };
    const result = verify(git, view, request.operation, [current], [next], "pending");
    return { ...result, preview: requirePending(git, digest) };
  }

  if (action === "issue-recover") {
    if (!request.confirmed || !current.pending) throw Error("recover the pending tracker request with an owner-confirmed outcome");
    requirePending(git, current.pending);
    if (request.notCreated) {
      if (request.alias) throw Error("select a verified existing issue or confirm that none was created");
      return verify(git, view, request.operation, [current], [{ aliases: current.aliases, writer: mine, operation: request.operation }], "linked");
    }
    if (!request.alias?.issue) throw Error("specify the verified existing issue");
  } else if (current.pending) {
    throw Error("recover the pending issue creation before changing aliases");
  }
  if (!request.alias) throw Error("select an issue or spec alias to link");
  const target = itemAt(git, view, request.alias);
  const peers = target.records.filter(row => row !== current);
  if (peers.some(row => row.conflict || row.pending)) throw Error("resolve the destination reservation's existing conflict or issue before linking");
  if (peers.length) {
    const conflict = [...peers, current].map(row => ({ ...row, conflict: request.operation }));
    // The draft's preview stays local; confirmed linking discharges its pending tracker request.
    delete conflict[conflict.length - 1]!.pending;
    return verify(git, view, request.operation, [...peers, current], conflict, "conflict");
  }
  const aliases = [...new Set([...current.aliases, ...target.association.aliases])];
  return verify(git, view, request.operation, [current], [{ aliases, writer: mine, operation: request.operation }], "linked");
}
