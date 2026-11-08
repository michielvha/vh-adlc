#!/usr/bin/env bun
import { PublicationExecutionError } from "./attempts";
import { randomUUID } from "node:crypto";
import { realpathSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { publishArtifact } from "./journal";
import { canonicalJSON } from "./protocol";
import { publish } from "./publish";
import { resumeEffects } from "./recovery";
import { readTrialPublication, runTrialAcknowledgement } from "./trial-publication";
import { collectProposals } from "./proposals";
import { runScan } from "./scan";
import { captureSnapshot } from "./snapshot";
import { loadTrialContext } from "./trial-context";
import { createTrialReader, fetchTrialProposalObjects } from "./trial-reader";
import { readTrialTracker } from "./trial-tracker";

function inputs(argv: string[]) {
  const command = argv[0];
  if (!["inspect", "scan", "collect-proposals", "publish", "resume-effects", "prepare-acknowledgement", "acknowledge-delivery"].includes(command)) throw Error("unknown synthetic command");
  const allowed = ["--synthetic-trial", "--context-commit"];
  if (["publish", "resume-effects"].includes(command)) allowed.push("--request");
  if (command === "resume-effects") allowed.push("--journal");
  if (command === "publish") allowed.push("--interrupt-after");
  if (["prepare-acknowledgement", "acknowledge-delivery"].includes(command)) allowed.push("--selection");
  if (command === "acknowledge-delivery") allowed.push("--owner-request");
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!allowed.includes(key) || values.has(key) || !value || value.startsWith("--")) throw Error("invalid synthetic options");
    values.set(key, value);
  }
  const root = values.get("--synthetic-trial"), contextCommit = values.get("--context-commit");
  if (!root || !contextCommit) throw Error("synthetic context and immutable commit required");
  const request = values.get("--request"), journal = values.get("--journal");
  if (["publish", "resume-effects"].includes(command) && !request || command === "resume-effects" && !journal) throw Error("synthetic publication request or journal required");
  const selection = values.get("--selection"), ownerRequest = values.get("--owner-request");
  if (["prepare-acknowledgement", "acknowledge-delivery"].includes(command) && !selection
    || command === "acknowledge-delivery" && !ownerRequest) throw Error("synthetic acknowledgement selection or owner request required");
  return { command, root, contextCommit, request, journal, selection, ownerRequest, interrupt: values.get("--interrupt-after") };
}

/** This executable is confined to explicit setup-owned synthetic contexts by its constructor. */
export async function main(argv: string[]): Promise<number> {
  let report: Record<string, unknown>;
  try {
    const options = inputs(argv);
    const context = loadTrialContext({ root: options.root, context_commit: options.contextCommit, runtime_directory: resolve(import.meta.dir, "../..") });
    const entry = context.component.files.find(file => file.path === "scripts/docs-drift/trial-entry.ts");
    if (!entry) throw Error("synthetic entry absent from retained payload");
    let data: unknown, complete = true;
    if (["prepare-acknowledgement", "acknowledge-delivery"].includes(options.command)) {
      if (!options.selection) throw Error("synthetic acknowledgement selection required");
      const acknowledgement = await runTrialAcknowledgement(context, options.selection, options.ownerRequest);
      const { result } = acknowledgement;
      complete = false;
      data = { state: result.state, reason: result.reason, operation_id: result.journal.plan.manifest.operation_id,
        journal_directory: result.journal.directory, revision: result.journal.revision,
        scope: acknowledgement.scope, scope_sha256: acknowledgement.scope_sha256 };
    } else if (["publish", "resume-effects"].includes(options.command)) {
      if (!options.request) throw Error("synthetic publication request required");
      const publication = readTrialPublication(context, options.request);
      const requestHash = publication.request_sha256;
      if (options.interrupt) {
        if (!publication.plan.manifest.effects.some(effect => effect.id === options.interrupt)) throw Error("synthetic interruption effect unavailable");
        const execute = publication.transport.execute;
        publication.transport.execute = async (...args) => {
          const captured = await execute(...args);
          if (args[1].id === options.interrupt) throw new PublicationExecutionError(true, true, undefined, captured ?? undefined);
          return captured;
        };
      }
      let result;
      if (options.command === "resume-effects") {
        if (!options.journal || dirname(resolve(options.journal)) !== context.artifacts
          || realpathSync(options.journal) !== resolve(options.journal)) throw Error("synthetic journal outside owned artifacts");
        result = await resumeEffects({ ...publication, journal_directory: options.journal });
      } else result = await publish(publication);
      complete = result.state === "complete";
      data = { state: result.state, reason: result.reason, operation_id: result.journal.plan.manifest.operation_id,
        plan_sha256: result.objects.plan_sha256, journal_directory: result.journal.directory, revision: result.journal.revision,
        request_sha256: requestHash, interruption_effect_id: options.interrupt ?? null };
    } else if (options.command === "scan") {
      const assessment = await runScan(captureSnapshot(context.source, context.source_commit), {
        artifact_root: context.artifacts, owner: "synthetic", run: randomUUID(),
      });
      data = assessment; complete = assessment.complete;
    } else if (options.command === "collect-proposals") {
      const reader = createTrialReader(context), collected = collectProposals(reader, context.settings);
      const fetched = await Promise.all(collected.proposals.map(proposal => fetchTrialProposalObjects(context, proposal)));
      complete = collected.complete && fetched.every(item => item.complete);
      const objects = fetched.map(item => ({ complete: item.complete, diagnostics: item.diagnostics,
        base_sha: item.base_sha, head_sha: item.head_sha, merge_base: item.merge_base,
        patch_sha256: item.patch_sha256, inputs_sha256: item.inputs_sha256 }));
      data = { ...collected, objects, complete };
    } else {
      const tracker = readTrialTracker(context);
      data = { fixture_id: context.fixture_id, tracker_commit: tracker.commit, resource_count: tracker.resources.size };
    }
    const path = join(context.artifacts, "synthetic-entry-" + randomUUID() + ".json");
    report = { schema_version: 1, kind: "docs-drift-synthetic-entry", evidence_kind: "synthetic", transport: "collector",
      command: options.command, outcome: complete ? "complete" : "incomplete", source_commit: context.source_commit,
      context_commit: context.context_commit, context_sha256: context.context_sha256,
      component_sha256: context.component.component_sha256, entry_sha256: entry.sha256, receipt_path: path, data };
    publishArtifact(path, canonicalJSON(report));
  } catch (error) {
    report = { schema_version: 1, kind: "docs-drift-synthetic-entry", evidence_kind: "synthetic", transport: "collector",
      command: argv[0] ?? "", outcome: "refused", diagnostics: [{ code: "synthetic-setup-or-input",
        message: error instanceof Error ? error.message : "synthetic setup unavailable" }] };
  }
  writeSync(1, JSON.stringify(report) + "\n");
  return report.outcome === "complete" ? 0 : 2;
}
if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
