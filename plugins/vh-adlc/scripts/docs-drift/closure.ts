import { captureRepositoryState } from "./snapshot";
import { canonicalDigest, canonicalJSON, freezeJSON } from "./protocol";
import { publicationMarker } from "./report-history";
import { effectMarker, type Effect } from "./manifests";
import { recheckClosureInputs, type ClosureCollection, type ClosureInputs } from "./closure-inputs";
import { readVerification, type ResolutionRecord, type Verification } from "./resolve";

type Disposition = ResolutionRecord["dispositions"][number];
export type ClosureVerificationScope = {
  inputs_sha256: string; source_commit: string; closure: ClosureInputs; decision: Disposition;
  proposed_effects: Effect[];
};
export type ClosureOptions = {
  collection: ClosureCollection; inputs: ClosureInputs; operation_id: string;
  observe_verification: (scope: ClosureVerificationScope) => Promise<unknown>;
};
export type ClosureProposal = {
  state: "proposal"; complete: boolean; diagnostics: string[]; effects: Effect[]; already_closed: number[];
  verification: Array<Verification & { proposal: number; hunk_id: string }>; inputs_sha256: string;
};

function fail(reason: string): never { throw Error("incomplete closure proposal " + reason); }
function unchanged(left: unknown, right: unknown): boolean { return canonicalJSON(left).equals(canonicalJSON(right)); }
function normalized(value: string): string { return value.replace(/\s+/gu, " ").trim(); }

function explanation(options: ClosureOptions, operationId: string, inputs: ClosureInputs, number: number, id: string): string {
  const { record, consolidation, current_default: current } = inputs;
  if (!record || !consolidation || !current) fail("missing reviewed inputs");
  const settings = options.collection.settings;
  const base = `https://${settings.hostname}/${settings.repository}`;
  const url = `${base}/pull/${consolidation.number}`;
  const recordURL = `${base}/blob/${consolidation.head_sha}/${record.path.split("/").map(encodeURIComponent).join("/")}`;
  const decisions = record.value.dispositions.filter(item => item.proposal === number);
  const preview = decisions.slice(0, 20).map(item => `- \`${item.hunk_id}\` ${item.disposition}`).join("\n");
  const remainder = decisions.length > 20 ? `\n\nThe linked resolve record contains all ${decisions.length} dispositions.` : "";
  return `Superseded after consolidation #${consolidation.number} merged. [Merged consolidation](${url})\n\n`
    + `Fresh closure checks used default \`${current}\` and record \`${record.sha256}\`. [Resolve record](${recordURL})\n\n`
    + `Recorded decisions\n\n${preview}${remainder}\n\n${publicationMarker(settings, operationId)}\n${effectMarker(id)}\n`;
}

/** Produce exact review inputs. The publisher separately checks actual authority and native role proof. */
export async function prepareClosure(options: ClosureOptions): Promise<ClosureProposal> {
  const result: ClosureProposal = { state: "proposal", complete: false, diagnostics: [], effects: [], already_closed: [], verification: [], inputs_sha256: "" };
  const before = canonicalDigest(captureRepositoryState(options.collection.source_repo));
  const operationId = options.operation_id;
  try {
    const inputs: ClosureInputs = freezeJSON(structuredClone(options.inputs));
    if (!inputs.complete || !inputs.record || !inputs.consolidation || !inputs.current_default
      || !recheckClosureInputs(inputs, options.collection).fresh) fail("current complete native inputs required");
    const marker = publicationMarker(options.collection.settings, operationId);
    const record = inputs.record.value;
    if (record.carried_decisions.some(item => !normalized(inputs.consolidation?.body ?? "").includes(normalized(item.text)))) fail("recorded carry-forward missing from current consolidation body");
    const settings = options.collection.settings;
    const effects: Effect[] = [
      { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
      { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + operationId } },
    ];
    const pending = inputs.originals.filter(original => original.state === "open");
    result.already_closed = inputs.originals.filter(original => original.state === "closed").map(original => original.number);
    for (const original of pending) {
      const comments = options.collection.reader.comments(original.number);
      if (!comments.complete || comments.diagnostics.length > 0) fail("complete native comment baseline required");
      const ids = comments.items.map(item => item.id).sort((left, right) => left - right);
      if (new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) fail("invalid native comment baseline");
      const id = "explain-" + original.number;
      const body = explanation(options, operationId, inputs, original.number, id);
      if (body.split(marker).length !== 2) fail("explanation marker binding");
      effects.push({ id, kind: "comment-create", payload: { number: original.number, body, prior_ids: ids } },
        { id: "close-" + original.number, kind: "pr-close", payload: { number: original.number, expected_head: original.head_sha } });
    }
    effects.push({ id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } });
    const verifications: ClosureProposal["verification"] = [];
    for (const original of pending) {
      for (const decision of record.dispositions.filter(item => item.proposal === original.number)) {
        const binding = { source_commit: inputs.current_default, closure: inputs, decision, proposed_effects: effects };
        const digest = canonicalDigest(binding);
        const scope: ClosureVerificationScope = freezeJSON({ inputs_sha256: digest, ...binding });
        const observed = readVerification(await options.observe_verification(scope), digest);
        if (observed.state !== "passed") fail("current disposition feedback or carry verification unavailable");
        const prior = record.originals.find(item => item.number === original.number);
        if (!prior) fail("missing original record");
        const hunk = prior.hunks.find(item => item.id === decision.hunk_id);
        if (hunk?.kind === "binary" && decision.disposition !== "defer" && observed.asset_checks.length === 0) fail("current binary asset checks required");
        verifications.push({ ...observed, proposal: original.number, hunk_id: decision.hunk_id });
      }
    }
    if (!recheckClosureInputs(inputs, options.collection).fresh
      || canonicalDigest(captureRepositoryState(options.collection.source_repo)) !== before) fail("native inputs changed during closure verification");
    result.verification = verifications;
    result.effects = pending.length > 0 ? freezeJSON(effects) : [];
    result.inputs_sha256 = canonicalDigest({ closure: inputs.inputs_sha256, operation_id: operationId, effects: result.effects });
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Required closure verification unavailable"); }
  return result;
}
