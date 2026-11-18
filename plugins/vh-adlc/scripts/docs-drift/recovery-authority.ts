import type { AcknowledgementScope } from "./delivery-ack";
import type { ReconciliationScope } from "./recovery";
import { readBoundArtifact } from "./evidence-input";
import { readAdoptionInput, collectionReaders } from "./git";
import { readDocumentMetadata } from "../docs-impact/collection";
import { exactRecord } from "./publication-decisions";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";

type Purpose = "acknowledgement" | "reconciliation";
type CurrentProcedure = { repo: string; current_default: string; path: string; receipt_ref_prefix: string };
type Options = {
  source_repo: string; artifact_root: string; reference: unknown; purpose: Purpose;
  scope: AcknowledgementScope | ReconciliationScope;
  adopted_procedure?: CurrentProcedure;
  current_procedure?: () => CurrentProcedure;
};

function requireProcedurePermission(source: Buffer, scope: ReconciliationScope, receiptPrefix: string): void {
  const metadata = readDocumentMetadata(source, collectionReaders().yaml);
  const permission = exactRecord(metadata?.docs_drift_reconciliation,
    ["repository", "operation_prefix", "lease_ref", "receipt_ref_prefix", "effects"], "Recovery procedure must declare its reconciliation permission");
  if (permission.repository !== scope.repository || permission.lease_ref !== scope.lease_ref || permission.receipt_ref_prefix !== receiptPrefix
    || typeof permission.operation_prefix !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(permission.operation_prefix)
    || !scope.operation_id.startsWith(permission.operation_prefix) || !Array.isArray(permission.effects)
    || permission.effects.some(effect => !["absence-retirement", "receipt-retention", "owned-lease-release"].includes(effect))
    || new Set(permission.effects).size !== permission.effects.length || !permission.effects.includes("owned-lease-release")
    || scope.retire_effect_ids.length > 0 && !permission.effects.includes("absence-retirement")
    || scope.retain_receipt !== null && (!permission.effects.includes("receipt-retention")
      || scope.retain_receipt.ref !== receiptPrefix + scope.operation_id)) throw Error("Recovery current procedure does not authorize the selected effects and scope");
}

/** Trusted entries capture actual authority. Same-user source origin remains an owner attestation. */
export function readRecoveryAuthority(options: Options) {
  const bytes = readBoundArtifact({ ...options, reference: options.reference });
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  const request = exactRecord(value, ["schema_version", "kind", "purpose", "scope_sha256s", "origin"], "Recovery authority fields changed");
  if (!canonicalJSON(value).equals(bytes) || request.schema_version !== 1 || request.kind !== "docs-drift-recovery-authority"
    || request.purpose !== options.purpose || !Array.isArray(request.scope_sha256s) || request.scope_sha256s.length < 1
    || request.scope_sha256s.length > 1001 || request.scope_sha256s.some(value => typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    || new Set(request.scope_sha256s).size !== request.scope_sha256s.length || !request.scope_sha256s.includes(canonicalDigest(options.scope))) throw Error("Recovery authority exact purpose and current scope required");
  const acknowledgement = options.purpose === "acknowledgement";
  if (acknowledgement && request.scope_sha256s.length !== 1) throw Error("Acknowledgement requires one exact current scope");
  if (acknowledgement !== ("kind" in options.scope && options.scope.kind === "docs-drift-delivery-acknowledgement"))
    throw Error("Recovery authority scope kind changed");
  const origin = request.origin as Record<string, unknown> | null;
  let source: Buffer;
  if (origin?.kind === "owner-current-request") {
    exactRecord(origin, ["kind", "artifact"], "Recovery owner request fields changed");
    source = readBoundArtifact({ ...options, reference: origin.artifact });
  } else if (!acknowledgement && origin?.kind === "adopted-procedure") {
    exactRecord(origin, ["kind", "commit", "path", "sha256"], "Recovery procedure fields changed");
    const expected = options.current_procedure?.() ?? options.adopted_procedure;
    if (!expected) throw Error("Recovery current procedure unavailable");
    if (origin.commit !== expected.current_default || origin.path !== expected.path) throw Error("Recovery current procedure scope changed");
    const current = readAdoptionInput(expected.repo, expected.current_default, protocolPath(expected.path));
    if (!current) throw Error("Recovery current regular procedure required");
    source = current.bytes;
    if (sha256(source) !== origin.sha256) throw Error("Recovery current procedure bytes changed");
    requireProcedurePermission(source, options.scope as ReconciliationScope, expected.receipt_ref_prefix);
  } else throw Error(acknowledgement ? "Acknowledgement requires the owner's actual current approval" : "Recovery actual current authority required");
  if (!decodeUTF8(source).trim()) throw Error("Recovery original authority source required");
  const grant = { scope_sha256: canonicalDigest(options.scope), request_sha256: canonicalDigest({ record_sha256: sha256(bytes), source_sha256: sha256(source) }) };
  return freezeJSON(acknowledgement ? { ...grant, kind: "owner-delivery-acknowledgement" as const, source: "owner-current-request" as const } : grant);
}
