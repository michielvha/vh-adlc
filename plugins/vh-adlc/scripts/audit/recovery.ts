import { hasRetainedAbsence, handoff, outcome, observedOutcome, noteResource, pendingResources, registeredPending, requireRegistered, readRun, type Intent, type Receipt, type Run } from "./journal";

type Observation = { state: "done"; receipt: Receipt } | { state: "absent" | "unknown" };
function reload(run: Run) { return readRun(run.config, run.directory, run.header.batch_digest); }
export async function recoverEffect(run: Run, id: string, transport: {
  authorized: boolean; observe: (action: Intent) => Promise<Observation>; execute?: (action: Intent) => Promise<Receipt>;
}) {
  run = reload(run);
  requireRegistered(run);
  const action = run.events.find(e => e.kind === "intent" && e.action_id === id)?.payload as Intent | undefined;
  if (!action) throw Error("audit effect has no durable intent; inspect actual state before a new action");
  if (["key", "row"].includes(action.kind)) throw Error("audit resource intents require scoped cleanup reconciliation, never generic effect completion");
  const completed = run.events.find(e => ["outcome","observed-outcome"].includes(e.kind) && e.action_id === id);
  if (completed) return completed.payload as Receipt;
  if (run.events.some(event => event.kind === "retained-absence" && event.action_id === id)) return { state: "blocked" as const };
  const observed = await transport.observe(action);
  if (observed.state === "done") { if(run.cleanup_only)observedOutcome(run,id,observed.receipt);else outcome(run, id, observed.receipt); return observed.receipt; }
  if(run.cleanup_only || hasRetainedAbsence(run)){handoff(run,id,"reconciliation-only-no-replay");return {state:"blocked" as const};}
  if (observed.state === "unknown" || !transport.authorized || !transport.execute) {
    handoff(run, id, observed.state === "unknown" ? "actual-state-unknown" : "execution-not-authorized-or-recovery-only");
    return { state: "blocked" as const };
  }
  // Only an observed absence plus current authority permits a still-pending action.
  // A lost response deliberately leaves intent pending for read-only reconciliation.
  const receipt = await transport.execute(action); outcome(run, id, receipt); return receipt;
}
type Scope = { target: string; actor: string; organization: string; cleanup_method: string };
type Resource = Scope & { id: string };
export function liveReady(run: Run): boolean {
  run = reload(run);
  requireRegistered(run);
  return !run.cleanup_only && !hasRetainedAbsence(run) && registeredPending(run.config).length === 0;
}
export async function cleanupPending(run: Run, scope: Scope | ((action: Intent) => Scope), transport: {
  authorized: boolean; lookup: (action: Intent, recordedID?: string) => Promise<Resource[]>; cleanup: (action: Intent, resource: Resource) => Promise<void>;
}) {
  run = reload(run);
  requireRegistered(run);
  const handoffs: { action: string; reason: string }[] = [];
  const pending = pendingResources(run);
  for (const event of pending) {
    const action = event.payload as Intent;
    const recordedID = (run.events.find(e => e.kind === "resource" && e.action_id === action.id)?.payload as { resource_id: string } | undefined)?.resource_id;
    let reason = "", current: Scope;
    try {
      current = typeof scope === "function" ? scope(action) : scope;
      const fields = ["target", "actor", "organization", "cleanup_method"];
      if (!current || typeof current !== "object" || Array.isArray(current) || Object.keys(current).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(current,key) || typeof current[key as keyof Scope] !== "string" || !current[key as keyof Scope])) throw Error("scope unavailable");
    } catch { handoff(run,action.id,"cleanup-policy-unavailable"); handoffs.push({action:action.id,reason:"cleanup-policy-unavailable"}); continue; }
    if (Object.entries(current).some(([k, v]) => action[k as keyof Intent] !== v)) reason = "cleanup-scope-or-policy-changed";
    else if (!transport.authorized) reason = "cleanup-permission-denied";
    else {
      let resources: Resource[];
      try { resources = await transport.lookup(action, recordedID); } catch { resources = []; reason = "cleanup-lookup-unavailable"; }
      if (!reason && (resources.length > 1 || resources.some(resource => !resource.id || recordedID && resource.id !== recordedID || Object.entries(current).some(([k, v]) => resource[k as keyof Resource] !== v)))) reason = "cleanup-ownership-ambiguous";
      if (!reason) {
        const selected=resources[0], observedID=selected?.id;
        if (selected) {
          // The caller resolves this method from current authorized policy, never executes journal strings.
          if (!recordedID) noteResource(run, action.id, observedID!);
          try { await transport.cleanup(action, selected); } catch { reason = "cleanup-execution-failed"; }
          if (!reason) {
            try {
              const after = await transport.lookup(action, recordedID ?? observedID);
              if (after.length) reason = "cleanup-absence-not-observed";
            } catch { reason = "cleanup-absence-unavailable"; }
          }
        }
        if (!reason) outcome(run, action.id, { state: "observed", ...(observedID ? { resource_id: observedID } : {}) });
      }
    }
    if (reason) { handoff(run, action.id, reason); handoffs.push({ action: action.id, reason }); }
  }
  return { ready: liveReady(run), handoffs };
}
