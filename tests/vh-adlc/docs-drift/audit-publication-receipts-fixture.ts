/** Real owned Git receipt objects behind a GET-only native fixture. No publication or provider trial. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditProposalInputsFixture } from "./audit-proposal-inputs-fixture";
import { fixture, bindings, hash, role } from "./manifest-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureSnapshot, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { deriveSourceWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { readOwnedPatch } from "../../../plugins/vh-adlc/scripts/docs-drift/preparation";
import { deliveryDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import { resolutionSource } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan, writePlanObject } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

export async function auditReceiptFixture(roots: string[], options: { single?: boolean; currentResult?: boolean } = {}) {
  const f = await auditProposalInputsFixture(roots, options.single ? "matching" : "multiple", { role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source } });
  const snapshot = captureSnapshot(f.repo, f.source), head = f.proposalHead, settings = snapshot.settings;
  const store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts, source_repo: f.candidate,
    source_commit: f.source, repository: settings.repository, owner: "synthetic-receipt", run: "publication" });
  readGit(store.root, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", "--no-tags", "--no-auto-maintenance", "--", f.candidate, head);
  const tree = readGit(store.root, "rev-parse", head + "^{tree}").toString().trim(), operation = "operation-1";
  const ref = settings.publication.receipt_ref_prefix + operation, body = "Synthetic reviewed advisory\n" + publicationMarker(settings, operation) + "\n" + effectMarker("pr");
  const inventory = JSON.parse(readFileSync(f.inventoryFile, "utf8"));
  inventory[0].body = body; inventory[0].draft = settings.publication.pr_state.advisory === "draft";
  writeFileSync(f.inventoryFile, canonicalJSON(inventory), { mode: 0o600 });
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/" + inventory[0].head.ref, head } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: inventory[0].head.ref, title: inventory[0].title, body,
      labels: ["documentation"], draft: inventory[0].draft } },
    { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ];
  let correction = { repository: settings.repository, scope_sha256: snapshot.protocol.bindings.scope_sha256,
    identity: "correction-" + canonicalDigest({ path: "docs/guide.md" }), path: "docs/guide.md",
    patch_sha256: sha256(readOwnedPatch(store, settings.repository, f.source, head, ["docs/guide.md"])),
    postimage_sha256: sha256(readGit(store.root, "show", head + ":docs/guide.md")), verification_sha256: hash("synthetic normalized result"),
    inputs_sha256: canonicalDigest(resolutionSource(snapshot)) };
  if (options.currentResult) {
    const { deriveCorrectionBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/correction-bindings");
    const { readCandidateVerificationArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/verification-evidence");
    if (!f.verified.evidence) throw Error("Original candidate result required for the retained fixture receipt");
    const proof = readCandidateVerificationArtifacts({ ...f.options, reference: f.verified.evidence });
    if (!proof.inspection?.object_store || !proof.scan) throw Error("Complete original candidate result required");
    [correction] = deriveCorrectionBindings({ source: snapshot, candidate: captureSnapshot(f.candidate, head),
      store: proof.inspection.object_store, paths: ["docs/guide.md"], scan: proof.scan });
  }
  const selected = { ...bindings, ...deriveSourceWorkerInputs(snapshot), candidate_commit: head, candidate_tree: tree,
    diff_sha256: sha256(readOwnedPatch(store, settings.repository, f.source, head)), delivery_sha256: deliveryDigest([correction], []) };
  const input = fixture(selected, effects), plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    adoption_sha256: sha256(readGit(store.root, "show", f.source + ":" + settings.publication.adoption_record)),
    publication_kind: "advisory", context: "production", transport: "native", corrections: [correction], attention: [] });
  const objects = writePlanObject(store, plan), bytes = canonicalJSON(plan), prefix = "repos/fixture/docs";
  const refEndpoint = prefix + "/git/ref/" + ref.slice(5), blobEndpoint = prefix + "/git/blobs/" + objects.blob;
  const responses: Record<string, unknown> = {
    [refEndpoint]: { ref, object: { type: "commit", sha: objects.object } },
    [prefix + "/git/commits/" + objects.object]: { sha: objects.object, tree: { sha: objects.tree }, parents: [], message: "Owned synthetic retained plan" },
    [prefix + "/git/trees/" + objects.tree]: { sha: objects.tree, truncated: false, tree: [{ path: "plan.json", type: "blob", mode: "100644", sha: objects.blob }] },
    [blobEndpoint]: { sha: objects.blob, size: bytes.length, encoding: "base64", content: bytes.toString("base64") },
    [prefix + "/git/commits/" + head]: { sha: head, tree: { sha: tree }, parents: [{ sha: f.source }], message: "Owned synthetic proposal" },
  };
  const responsesPath = join(f.artifacts, "audit-receipt-responses.json"), faultsPath = join(f.artifacts, "audit-receipt-faults.json"), countPath = join(f.artifacts, "audit-receipt-ref-count");
  writeFileSync(responsesPath, canonicalJSON(responses), { mode: 0o600 }); writeFileSync(faultsPath, "{}", { mode: 0o600 });
  const executable = join(f.root, "native-bin/gh"), original = readFileSync(executable, "utf8");
  const extra = `
const receiptFS = require("node:fs"), receiptData = JSON.parse(receiptFS.readFileSync(${JSON.stringify(responsesPath)}, "utf8")), receiptFault = JSON.parse(receiptFS.readFileSync(${JSON.stringify(faultsPath)}, "utf8"));
if (receiptData[endpoint] !== undefined) {
  let value = receiptData[endpoint];
  if (endpoint === ${JSON.stringify(refEndpoint)}) {
    const path = ${JSON.stringify(countPath)}, count = receiptFS.existsSync(path) ? Number(receiptFS.readFileSync(path, "utf8")) : 0;
    receiptFS.writeFileSync(path, String(count + 1), { mode: 0o600 });
    if (receiptFault.missing_ref || (receiptFault.late_missing_ref && count >= receiptFault.late_missing_ref)) { console.log("HTTP/2.0 404 Not Found\\r\\n\\r\\n{}"); process.exit(1); }
    if (receiptFault.late_ref && count >= 2) value = { ref: value.ref, object: { type: "commit", sha: "f".repeat(40) } };
  }
  if (endpoint === ${JSON.stringify(blobEndpoint)}) {
    if (receiptFault.missing_blob) { console.log("HTTP/2.0 503 Service Unavailable\\r\\n\\r\\n{}"); process.exit(1); }
    if (receiptFault.input_path) receiptFS.writeFileSync(receiptFault.input_path, "Preserve the changed original input during lookup\\n", { mode: 0o600 });
  }
  console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value)); process.exit(0);
}
`;
  if (!original.includes("  const sha = ")) throw Error("Missing owned native receipt fixture boundary");
  writeFileSync(executable, original.replace("  const sha = ", extra + "  const sha = "), { mode: 0o700 });
  return { ...f, receipt: { objects, ref, correction, responsesPath, faultsPath, countPath } };
}
