import { randomUUID } from "node:crypto";
import { appendAttempt, appendAttemptEnd, readJournal, type Journal, type ReconciliationGrant } from "./journal";
import type { Effect } from "./manifests";
import type { PlanObjects, PublicationTransport } from "./transport";

/** Only the native executor's process/preflight observations supply this status. */
export class PublicationExecutionError extends Error {
  constructor(readonly sent: boolean, readonly reaped: boolean) { super("native publication execution unavailable"); }
}

export function pendingAttempt(journal: Journal, effect: Effect, retirement = false): string | null {
  const events = journal.events.filter(event => event.effect_id === effect.id);
  const attempt = events.findLast(event => event.kind === "attempt");
  if (!attempt) return null;
  const ended = events.findLast(event => event.kind === "attempt-ended");
  if (!ended || ended.revision < attempt.revision) return "attempt-in-flight";
  const status = ended.payload as { sent: boolean; reaped: boolean };
  if (!status.reaped) return "attempt-not-reaped";
  if (status.sent && (retirement || ["lease-acquire", "pr-create", "issue-create", "comment-create"].includes(effect.kind))) return "dispatch-outcome-unknown";
  return null;
}

/** A durable revision-CAS admits one executor. Unconfirmed dispatch never becomes proven absence. */
export async function executeAttempt(options: {
  journal: Journal; effect: Effect; objects: PlanObjects; transport: PublicationTransport; reconciliation?: ReconciliationGrant;
}): Promise<Journal> {
  let journal = options.journal;
  const pending = pendingAttempt(journal, options.effect);
  if (pending) throw Error(pending);
  const id = randomUUID();
  journal = appendAttempt(journal, options.effect.id, id, options.reconciliation);
  let failure: unknown;
  let status = { sent: true, reaped: true };
  try {
    readJournal(journal.directory, journal.source_repo, journal);
    await options.transport.execute(journal.plan, options.effect, options.objects, id);
  } catch (error) {
    failure = error;
    status = error instanceof PublicationExecutionError ? { sent: error.sent, reaped: error.reaped } : { sent: true, reaped: false };
  }
  // An observer may already have recorded an actual outcome. Keep its receipt and our process status.
  journal = readJournal(journal.directory, journal.source_repo);
  journal = appendAttemptEnd(journal, options.effect.id, { attempt_id: id, ...status });
  if (failure !== undefined) throw failure;
  return journal;
}
