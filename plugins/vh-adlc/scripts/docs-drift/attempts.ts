import { readSuccess, type ExecutionEvidence } from "./success";
import { dirname } from "node:path";
import { canonicalJSON } from "./protocol";
import { readRejection, type RejectionEvidence } from "./rejections";
import { randomUUID } from "node:crypto";
import { appendAttempt, appendAttemptEnd, appendIntent, appendRecoveryOnly, readJournal, type Journal, type ReconciliationGrant } from "./journal";
import type { Effect } from "./manifests";
import type { PlanObjects, PublicationTransport } from "./transport";

/** Only the native executor's process/preflight observations supply this status. */
export class PublicationExecutionError extends Error {
  constructor(readonly sent: boolean, readonly reaped: boolean, readonly rejection?: RejectionEvidence, readonly execution?: ExecutionEvidence) { super("native publication execution unavailable"); }
}

export function pendingAttempt(journal: Journal, effect: Effect, retirement = false): string | null {
  const paired = new Set(journal.events.filter(event => event.kind === "attempt" && "atomic_receipt_id" in event.payload
    && event.payload.atomic_receipt_id === effect.id).map(event => "attempt_id" in event.payload ? event.payload.attempt_id : ""));
  const events = journal.events.filter(event => event.effect_id === effect.id
    || (["attempt", "attempt-ended"].includes(event.kind) && "attempt_id" in event.payload && paired.has(event.payload.attempt_id)));
  const attempts = events.filter(event => event.kind === "attempt");
  for (const attempt of retirement ? attempts : attempts.slice(-1)) {
    const attemptId = (attempt.payload as { attempt_id: string }).attempt_id;
    const ended = events.findLast(event => event.kind === "attempt-ended"
      && "attempt_id" in event.payload && event.payload.attempt_id === attemptId);
    if (!ended || ended.revision < attempt.revision) return "attempt-in-flight";
    const status = ended.payload as { sent: boolean; reaped: boolean; rejection?: RejectionEvidence; attempt_id: string };
    if (!status.reaped) return "attempt-not-reaped";
    if (status.rejection) {
      try {
        const dispatched = journal.plan.manifest.effects.find(item => item.id === attempt.effect_id);
        if (!dispatched) return "rejection-proof-unavailable";
        readRejection({ artifact_root: dirname(journal.directory), source_repo: journal.source_repo, plan: journal.plan,
          effect: dispatched, attempt_id: attemptId, evidence: status.rejection });
        continue;
      } catch { return "rejection-proof-unavailable"; }
    }
    if (status.sent && (retirement || ["lease-acquire", "push", "pr-create", "issue-create", "comment-create"].includes(effect.kind)
      || "atomic_receipt_id" in attempt.payload && attempt.payload.atomic_receipt_id === effect.id)) return "dispatch-outcome-unknown";
  }
  return null;
}

/** A lost acknowledgement of a local ending must not erase its already published status. */
async function recordEnding(journal: Journal, effectId: string, ending: Parameters<typeof appendAttemptEnd>[2], phase: "pre-dispatch" | "executed"): Promise<Journal | null> {
  for (;;) {
    try {
      let current = readJournal(journal.directory, journal.source_repo);
      if (!current.events.some(event => event.kind === "attempt" && event.effect_id === effectId
        && "attempt_id" in event.payload && event.payload.attempt_id === ending.attempt_id)) {
        if (phase === "executed" && !current.events.some(event => event.kind === "recovery-only")) {
          const marker = current.events.some(event => event.kind === "intent" && event.effect_id === effectId)
            ? effectId : current.plan.manifest.effects[0].id;
          if (!current.events.some(event => event.kind === "intent" && event.effect_id === marker)) current = appendIntent(current, marker);
          appendRecoveryOnly(current, marker, "executed-attempt-claim-unavailable");
        }
        return null;
      }
      const existing = current.events.find(event => event.kind === "attempt-ended" && event.effect_id === effectId
        && "attempt_id" in event.payload && event.payload.attempt_id === ending.attempt_id);
      if (existing) {
        if (!canonicalJSON(existing.payload).equals(canonicalJSON(ending))) throw Error("attempt ending changed");
        return current;
      }
      return appendAttemptEnd(current, effectId, ending);
    } catch (error) {
      if (!(error instanceof Error)
        || !["docs-drift journal revision conflict", "docs-drift journal read conflict"].includes(error.message)) throw error;
      await Bun.sleep(5);
    }
  }
}

/** A durable revision-CAS admits one executor. Unconfirmed dispatch never becomes proven absence. */
export async function executeAttempt(options: {
  journal: Journal; effect: Effect; objects: PlanObjects; transport: PublicationTransport; reconciliation?: ReconciliationGrant;
}): Promise<Journal> {
  let journal = options.journal;
  const pending = pendingAttempt(journal, options.effect);
  if (pending) throw Error(pending);
  const id = randomUUID();
  let receipt: Effect | undefined;
  if (options.effect.kind === "lease-acquire") {
    receipt = journal.plan.manifest.effects[1];
    if (journal.plan.manifest.effects[0].id !== options.effect.id || receipt?.kind !== "receipt-retain") throw Error("missing atomic metadata envelope");
    const receiptId = receipt.id;
    if (!journal.events.some(event => event.kind === "intent" && event.effect_id === receiptId)) journal = appendIntent(journal, receiptId, options.effect.id);
  }
  try {
    journal = appendAttempt(journal, options.effect.id, id, options.reconciliation, receipt?.id);
    const current = readJournal(journal.directory, journal.source_repo, journal);
    const claimed = current.events.at(-1);
    if (claimed?.kind !== "attempt" || claimed.effect_id !== options.effect.id
      || !("attempt_id" in claimed.payload) || claimed.payload.attempt_id !== id) throw Error("attempt dispatch fence changed");
    journal = current;
  } catch (error) {
    await recordEnding(journal, options.effect.id, { attempt_id: id, sent: false, reaped: true }, "pre-dispatch");
    throw error;
  }
  let failure: unknown;
  let status: { sent: boolean; reaped: boolean; rejection?: RejectionEvidence; execution?: ExecutionEvidence } = { sent: true, reaped: true };
  try {
    const execution = await options.transport.execute(journal.plan, options.effect, options.objects, id);
    if (execution) status.execution = execution;
  } catch (error) {
    failure = error;
    status = error instanceof PublicationExecutionError ? { sent: error.sent, reaped: error.reaped, ...(error.rejection ? { rejection: error.rejection } : {}), ...(error.execution ? { execution: error.execution } : {}) } : { sent: true, reaped: false };
  }
  if (status.execution) {
    try {
      const successes = status.execution.successes;
      if (!Array.isArray(successes) || successes.length > 16 || new Set(successes.map(item => item.path)).size !== successes.length) throw Error("invalid captured execution");
      for (const evidence of successes) readSuccess({ artifact_root: dirname(journal.directory), source_repo: journal.source_repo,
        plan: journal.plan, effect: options.effect, attempt_id: id, evidence });
    } catch (error) {
      failure ??= error;
      status = { sent: status.sent, reaped: false };
    }
  }
  // An observer may already have recorded an actual outcome. Keep its receipt and our process status.
  const ended = await recordEnding(journal, options.effect.id, { attempt_id: id, ...status }, "executed");
  if (ended === null) throw Error("executed attempt claim unavailable");
  if (failure !== undefined) throw failure;
  return ended;
}

export function hasEffectAttempt(journal: Journal, effectId: string): boolean {
  return journal.events.some(event => event.kind === "attempt" && (event.effect_id === effectId
    || "atomic_receipt_id" in event.payload && event.payload.atomic_receipt_id === effectId));
}
