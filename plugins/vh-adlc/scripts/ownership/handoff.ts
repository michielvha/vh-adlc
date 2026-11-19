import { OwnershipGit } from "./git";
import { associate } from "./identity";
import { requirePending } from "./pending";
import { currentWriter, describeRecord, matching, OPERATION, publish, snapshot, type EntryRequest, type RecordState, type Result, type Snapshot } from "./entry";

type Transfer = EntryRequest & { approved: boolean; stopped: boolean; preserved: boolean; expected: string; operation: string };

function select(git: OwnershipGit, view: Snapshot, request: EntryRequest) {
  const association = associate(git, view.tip.main, view.binding.repository, request, git.text("rev-parse", "--abbrev-ref", "HEAD"));
  const matches = matching(view.state, association.aliases);
  if (matches.length > 1) throw Error("feature aliases have conflicting reservations; ask the owner to reconcile them");
  return { association, current: matches[0] };
}

export function status(request: EntryRequest): Result {
  const git = new OwnershipGit(request.repo, request.env);
  const view = snapshot(git, false);
  if (view === "no-remote") return { status: "held", reason: "canonical origin is absent" };
  if (view === "legacy") return { status: "legacy" };
  const { association, current } = select(git, view, request);
  if (current) return describeRecord(git, current, "reserved", view.tip.reservation);
  return { status: "vacant", item: association.aliases[0], tip: view.tip.reservation,
    ...(association.claimed ? { reason: "existing claim requires owner enrollment" } : {}) };
}

export function handoff(request: Transfer): Result {
  if (!request.approved || !request.stopped || !request.preserved || request.noPush) {
    throw Error("handoff needs owner approval, stopped previous work, preserved files and permission to update the reservation");
  }
  if (!OPERATION.test(request.operation) || !OPERATION.test(request.expected) || request.operation === request.expected || request.operation === "absent") {
    throw Error("handoff needs a distinct operation ID and the observed reservation operation or absent");
  }
  const git = new OwnershipGit(request.repo, request.env);
  for (let attempt = 0; attempt < 4; attempt++) {
    const view = snapshot(git);
    if (typeof view === "string") throw Error("there is no adopted reservation to transfer");
    const { association, current } = select(git, view, request);
    if (current?.conflict) throw Error("resolve the alias conflict before transferring a writer");
    if (current?.pending) requirePending(git, current.pending);
    const incoming = currentWriter(git, request.env ?? process.env, association.locator, request.client);
    if (current?.operation === request.operation) {
      if (current.previous !== request.expected || JSON.stringify(current.writer) !== JSON.stringify(incoming)) {
        throw Error("handoff operation is already bound to a different writer, location or prior record");
      }
      return describeRecord(git, current, "transferred", view.tip.reservation);
    }
    if ((current?.operation ?? "absent") !== request.expected || (!current && !association.claimed)) {
      throw Error("the prior writer changed or there is no existing claim; inspect reservation status before retrying");
    }
    const next: RecordState = {
      aliases: [...new Set([...(current?.aliases ?? []), ...association.aliases])],
      writer: incoming, operation: request.operation, previous: request.expected, ...(current?.pending ? { pending: current.pending } : {}),
    };
    publish(git, view, { ...view.state, operation: request.operation, items: [...view.state.items.filter(row => row !== current), next] });
  }
  throw Error("handoff result is uncertain; keep the previous writer stopped and verify the exact operation");
}
