import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectionReaders } from "./git";
import { readBoundArtifact } from "./evidence-input";
import { publishArtifact, readArtifact } from "./journal";
import { canonicalJSON } from "./protocol";
import { exactRecord, parseDecisionPacket } from "./publication-decisions";
import { collectWorkerInputs } from "./publication-worker";
import { collectWorkerPreparation } from "./worker-preparation";
import { prepareEdits } from "./preparation";
import { captureSnapshot } from "./snapshot";
import { createRunArtifactWriter, originalRunContext, type RunDirectory } from "./run-directory";
import { captureConfiguredRole } from "./role-process";
import { readAdoptedRolePolicy } from "./role-capture";
import { readNativeContext, readNativeCredential, withNativeObservation } from "./transport";
import { buildResolution } from "./resolve";
import { resolutionVerificationReader } from "./resolution-verification";

/** Prepare the selected corrections in an owned checkout, retaining the actual worker and its inputs. */
export async function runPreparation(options: { repo: string; run: RunDirectory; source_verification: { path: string; sha256: string } }) {
  const { repo, run } = options, source = run.manifest.source_commit;
  originalRunContext(run);
  const resolving = run.manifest.mode === "resolve";
  if (run.manifest.mode === "close") throw Error("Post-merge cleanup uses the close operation");
  const snapshot = captureSnapshot(repo, source), nonce = randomUUID();
  const retain = createRunArtifactWriter(run, snapshot.settings.reports.max_entry_bytes, nonce);
  const requestPath = join(run.directory, "prepare.yaml"), requestBytes = readArtifact(requestPath);
  if (requestBytes.length > snapshot.settings.reports.max_entry_bytes) throw Error("Preparation request exceeds the configured bound");
  const selection = exactRecord(collectionReaders().yaml(requestBytes), resolving ? ["decisions", "attention", "resolution_id", "carry_decisions"]
    : ["decisions", "attention"], "prepare.yaml fields differ from the selected audit or resolution mode");
  const request = retain("prepare-request", requestBytes);
  const decisions = retain("decisions", canonicalJSON({ schema_version: 1, kind: "docs-drift-decisions", mode: resolving ? "resolve" : "advisory",
    source_commit: source, selected_proposals: resolving ? run.manifest.proposals : [], decisions: selection.decisions, attention: selection.attention }));
  const packet = parseDecisionPacket(readArtifact(join(run.directory, decisions.path)), snapshot);
  const credential = await readNativeCredential({ hostname: snapshot.settings.hostname, cwd: repo });
  const common = { repo, source, artifact_root: run.directory, owner: run.manifest.id, run: nonce,
    source_verification: options.source_verification, decisions, credential, cache_directory: run.directory,
    entry: run.manifest.entry, launcher_path: join(import.meta.dir, "cli.ts"), settings_path: join(repo, ".vh-adlc/docs-drift.yaml") };
  const result = await withNativeObservation({ hostname: snapshot.settings.hostname, repository: snapshot.settings.repository, credential, collection: "audit" }, async observation => {
    const inputs = await collectWorkerInputs({ ...common, observation }), facts = inputs.facts, baseline = inputs.source_verification;
    if (!inputs.complete || !inputs.worker_input_sha256 || !facts?.runtime || !facts.store || !facts.current_default || !facts.identity || !baseline?.scan?.checkout)
      throw Error(inputs.diagnostics.join("\n") || "Complete original preparation inputs required");
    const runtime = facts.runtime, cwd = baseline.scan.checkout;
    const policy = readAdoptedRolePolicy({ repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime, role: "worker" });
    const roleRequest = retain("prepare-worker-request", canonicalJSON({ schema_version: 1, kind: "docs-drift-prepare-worker-request",
      artifact_root: run.directory, source_commit: source, source_checkout: cwd, source_verification: options.source_verification,
      decisions, project_procedure: snapshot.settings.project_procedure, feedback_files: snapshot.settings.feedback_files,
      worker_input_sha256: inputs.worker_input_sha256, resolution: inputs.resolution,
      canonicalizer: join(runtime.component.directory, "scripts/docs-drift/protocol.ts") }));
    const prompt = [
      "Prepare only the selected documentation corrections in the request. Read the original source assessment, complete scanner findings, decisions, project procedure, feedback and current source.",
      "Keep the source checkout unchanged. Return proposed edits as data. Do not publish, commit, run network commands, delegate, resume another context or change policy.",
      "Return MODEL: <actual full model ID> on its own line, then one JSON handoff {input_sha256:worker_input_sha256,edits:[{id,path,action,start,end,before_sha256,replacement_base64,after_mode}],publication:{operation_id,proposal:{kind,payload}}|null}.",
      (resolving ? "Use only edit_ids selected by the complete hunk dispositions." : "Use each selected decision ID exactly once.")
        + " Edit offsets and hashes refer to raw committed blobs. Actions are replace, create, delete or chmod. Respect protected documents, frontmatter and consumer rules. Report unavailable evidence explicitly.",
      "Publication is an exact proposed pr-create, pr-update or issue-create payload under consumer policy. It grants no publication permission. Keep it null if no proposal can be supported. Candidate verification, independent review and exact current authority follow separately.",
      ...(resolving ? ["For resolve mode, account for every full original hunk in the decision packet, including feedback and carried decisions. Return only edits selected by those decisions. Also include resolution_verifications:[{proposal,hunk_id,state,method,evidence,asset_checks}] in the same JSON handoff, exactly once for every decision. These native rows bind your complete returned edits and the exact input decision packet. State is passed, failed or unknown. Passed rows need current committed-source quotes {path,sha256,start,end,quote_sha256}. Binary changes also need exact postimage asset checks {path,sha256,artifact:{path,sha256}} referencing your bounded private inspection record. Unknown evidence stays unknown."] : []),
      "DOCS_DRIFT_REQUEST: " + JSON.stringify({ path: join(run.directory, roleRequest.path), sha256: roleRequest.sha256 }),
    ].join("\n");
    const worker = await captureConfiguredRole({ source_repo: repo, candidate_repo: cwd, source_commit: source, artifact_root: run.directory,
      runtime, role: "worker", cwd, prompt, environment: process.env, target_sha256: inputs.worker_input_sha256, policy });
    const preparation = await collectWorkerPreparation({ ...common, observation, worker_capture: worker, candidate_repo: cwd });
    if (!preparation.complete || !preparation.selection) throw Error(preparation.diagnostics.join("\n") || "Original worker preparation incomplete");
    let resolution: Awaited<ReturnType<typeof buildResolution>> | null = null;
    if (resolving) {
      if (!inputs.resolution || !baseline.object_store || !preparation.worker || typeof selection.resolution_id !== "string")
        throw Error("Complete original resolution, worker and selected identity required");
      const parsedDecisions = packet.decisions.map(value => {
        const row = exactRecord(value, ["proposal", "hunk_id", "disposition", "reason", "evidence", "edit_ids", "feedback", "carry", "changed_paths"], "Complete resolution dispositions required");
        const { changed_paths: _paths, ...decision } = row;
        return decision;
      });
      const reader = readNativeContext({ hostname: snapshot.settings.hostname, repository: snapshot.settings.repository, credential, observation }).repository;
      const observe = resolutionVerificationReader({ repo, artifact_root: run.directory, snapshot, inputs: inputs.resolution,
        records: preparation.resolution_verifications, returned_sha256: preparation.worker.binding.returned_sha256, decisions: parsedDecisions });
      const { checkout: _checkout, output_path: _output, record_path: _record, process: _process, ...scan } = baseline.scan;
      resolution = await buildResolution({ collection: { snapshot, store: baseline.object_store, reader, selected: run.manifest.proposals },
        inputs: inputs.resolution, scan, resolution_id: selection.resolution_id, decisions: parsedDecisions,
        edits: preparation.selection.edits, carry_decisions: selection.carry_decisions, observe_verification: async scope => observe(scope) });
      if (!resolution.complete || !resolution.record || !canonicalJSON(resolution.record.dispositions).equals(canonicalJSON(packet.decisions)))
        throw Error(resolution.diagnostics.join("\n") || "Original resolution dispositions or postimages changed");
    }
    return { worker_capture: worker, selection: preparation.selection, publication: preparation.publication, role_request: roleRequest, resolution };
  });
  if (!readArtifact(requestPath).equals(requestBytes)) throw Error("Preparation request changed during the worker invocation");
  readBoundArtifact({ source_repo: repo, artifact_root: run.directory, reference: result.role_request });
  const prepared = await prepareEdits({ repo, source, artifact_root: run.directory, owner: run.manifest.id, run: nonce, selection: result.selection });
  let resolutionRecord: { path: string; sha256: string } | null = null;
  if (result.resolution?.record_bytes && result.resolution.record_sha256 && prepared.checkout && prepared.state !== "incomplete") {
    const path = join(prepared.checkout, result.resolution.record_path);
    mkdirSync(dirname(path), { mode: 0o700, recursive: true });
    publishArtifact(path, result.resolution.record_bytes);
    resolutionRecord = { path: result.resolution.record_path, sha256: result.resolution.record_sha256 };
  }
  const artifacts = { prepare_request: request, decisions, worker_capture: result.worker_capture,
    selection: retain("selection", canonicalJSON(result.selection)),
    preparation: retain("preparation", canonicalJSON({ schema_version: 1, source_commit: source, prepared, publication: result.publication,
      ...(resolutionRecord ? { resolution_record: resolutionRecord } : {}) })) };
  return { prepared, artifacts };
}
