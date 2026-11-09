import { captureRepositoryState, captureSnapshot, createOwnedObjectStore, externalArtifactDirectory, type OwnedObjectStore } from "./snapshot";
import { collectClosureInputs, recheckClosureInputs, type ClosureInputs } from "./closure-inputs";
import { collectResolutionInputs, readResolutionProposal, recheckResolutionInputs, type ResolutionInputs, type ResolutionProposal } from "./resolve-inputs";
import { fetchProposalObjects } from "./proposals";
import { readNativeContext } from "./transport";
import { canonicalDigest, canonicalJSON } from "./protocol";

function selectedProposals(value: unknown, source: string): number[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("resolution selection object required");
  canonicalJSON(value);
  const input = value as Record<string, unknown>, keys = ["schema_version", "source_commit", "proposals"];
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key)) || input.schema_version !== 1
    || input.source_commit !== source || !Array.isArray(input.proposals) || input.proposals.length < 1 || input.proposals.length > 1000
    || input.proposals.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
    || new Set(input.proposals).size !== input.proposals.length) throw Error("resolution selection fields or source changed");
  return input.proposals as number[];
}

type ResolutionCollectionResult = {
  complete: boolean; diagnostics: string[]; store: OwnedObjectStore | null; inputs: ResolutionInputs | null;
};

type NativeCollectionOptions = {
  repo: string; source: string; artifact_root: string; selection: unknown; owner: string; run: string;
  credential: string; path?: string;
};

/** The production collector selects the native reader and fixed authenticated fetch itself. */
export async function collectNativeResolution(input: NativeCollectionOptions): Promise<ResolutionCollectionResult> {
  const options = { ...input, path: input.path ?? process.env.PATH }, selected = selectedProposals(structuredClone(input.selection), input.source);
  const result: ResolutionCollectionResult = { complete: false, diagnostics: [], store: null, inputs: null };
  const snapshot = captureSnapshot(options.repo, options.source), settings = snapshot.settings;
  const before = canonicalDigest(captureRepositoryState(snapshot.repo));
  const environment = { PATH: options.path ?? process.env.PATH,
    ...(settings.hostname === "github.com" || settings.hostname.endsWith(".ghe.com")
      ? { GH_TOKEN: options.credential } : { GH_ENTERPRISE_TOKEN: options.credential }) };
  const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository,
    credential: options.credential, path: options.path });
  try {
    const root = externalArtifactDirectory(options.artifact_root, snapshot.repo), context = native();
    if (context.default_commit !== snapshot.source_commit || context.identity.default_branch !== settings.default_branch)
      throw Error("resolution collection requires the observed current default source");
    const store = createOwnedObjectStore({ source_repo: snapshot.repo, source_commit: snapshot.source_commit,
      parent: root, evidence_directory: root, owner: options.owner, run: options.run, repository: settings.repository });
    result.store = store;
    const observed: ResolutionProposal[] = [];
    for (const number of selected) {
      try {
        const proposal = context.repository.pull(number);
        if (proposal.base_repository.id !== context.identity.repository_id) throw Error("selected proposal repository changed");
        const diff = await fetchProposalObjects(store, proposal, { hostname: settings.hostname, repository: settings.repository,
          default_branch: settings.default_branch, environment, expected_default_commit: options.source });
        if (!diff.complete) result.diagnostics.push(...diff.diagnostics.map(message => "Proposal " + number + ": " + message));
        else observed.push(readResolutionProposal(store, proposal));
      } catch { result.diagnostics.push("Required native proposal " + number + " unavailable"); }
    }
    const collection = { snapshot, store, reader: context.repository, selected };
    result.inputs = collectResolutionInputs(collection);
    result.diagnostics.push(...result.inputs.diagnostics);
    if (canonicalDigest(result.inputs.proposals) !== canonicalDigest(observed)) result.diagnostics.push("Selected proposal changed during native fetch");
    const fresh = recheckResolutionInputs(result.inputs, collection);
    result.diagnostics.push(...fresh.diagnostics);
    const current = native();
    if (current.default_commit !== snapshot.source_commit || canonicalDigest(current.identity) !== canonicalDigest(context.identity))
      result.diagnostics.push("Native source or actor changed during resolution collection");
    result.complete = result.inputs.complete && fresh.fresh && result.diagnostics.length === 0;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Native resolution collection unavailable"); }
  if (canonicalDigest(captureRepositoryState(snapshot.repo)) !== before) {
    result.diagnostics.push("Caller changed during resolution collection"); result.complete = false;
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  return result;
}

type ClosureCollectionResult = {
  complete: boolean; diagnostics: string[]; store: OwnedObjectStore | null; inputs: ClosureInputs | null;
};

/** Recover the committed consolidation record and original full diffs using current native inputs. */
export async function collectNativeClosure(input: NativeCollectionOptions): Promise<ClosureCollectionResult> {
  const options = { ...input, selection: structuredClone(input.selection), path: input.path ?? process.env.PATH };
  if (options.selection === null || typeof options.selection !== "object" || Array.isArray(options.selection)) throw Error("closure selection object required");
  canonicalJSON(options.selection);
  const selection = options.selection as Record<string, unknown>, keys = ["schema_version", "source_commit", "consolidation"];
  if (Object.keys(selection).length !== keys.length || keys.some(key => !Object.hasOwn(selection, key)) || selection.schema_version !== 1
    || selection.source_commit !== options.source || typeof selection.consolidation !== "number"
    || !Number.isSafeInteger(selection.consolidation) || selection.consolidation < 1) throw Error("closure selection fields or source changed");
  const consolidation = selection.consolidation;
  const result: ClosureCollectionResult = { complete: false, diagnostics: [], store: null, inputs: null };
  const before = canonicalDigest(captureRepositoryState(options.repo));
  try {
    const initial = await collectNativeResolution({ ...options, selection: { schema_version: 1, source_commit: options.source, proposals: [consolidation] } });
    result.store = initial.store;
    if (!initial.complete || !initial.store || !initial.inputs) {
      result.diagnostics.push(...initial.diagnostics); throw Error("Initial consolidation collection incomplete");
    }
    const snapshot = captureSnapshot(options.repo, options.source), settings = snapshot.settings;
    const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository,
      credential: options.credential, path: options.path });
    const context = native();
    if (context.default_commit !== options.source || context.identity.repository_id !== initial.inputs.repository_id)
      throw Error("Closure source or repository changed");
    const merged = context.repository.mergedPull(consolidation);
    const collection = { source_repo: snapshot.repo, store: initial.store, settings, reader: context.repository,
      consolidation_id: consolidation, required_inputs: [] };
    const candidate = collectClosureInputs(collection);
    if (!candidate.record) { result.inputs = candidate; result.diagnostics.push(...candidate.diagnostics); throw Error("Durable consolidation record unavailable"); }
    if (candidate.record.value.source.required_inputs.length > 0) {
      result.inputs = candidate;
      throw Error("Current observations for required closure inputs unavailable");
    }
    const environment = { PATH: options.path,
      ...(settings.hostname === "github.com" || settings.hostname.endsWith(".ghe.com")
        ? { GH_TOKEN: options.credential } : { GH_ENTERPRISE_TOKEN: options.credential }) };
    for (const original of candidate.record.value.originals) {
      try {
        const proposal = context.repository.pull(original.number);
        if (proposal.base_repository.id !== context.identity.repository_id) throw Error("Original repository changed");
        const diff = await fetchProposalObjects(initial.store, proposal, { hostname: settings.hostname, repository: settings.repository,
          default_branch: settings.default_branch, environment, expected_default_commit: options.source });
        if (!diff.complete) result.diagnostics.push(...diff.diagnostics.map(message => "Original " + original.number + ": " + message));
      } catch { result.diagnostics.push("Required original " + original.number + " unavailable"); }
    }
    result.inputs = collectClosureInputs(collection);
    result.diagnostics.push(...result.inputs.diagnostics);
    if (canonicalDigest(merged) !== canonicalDigest(result.inputs.consolidation)) result.diagnostics.push("Consolidation changed during collection");
    const fresh = recheckClosureInputs(result.inputs, collection); result.diagnostics.push(...fresh.diagnostics);
    const current = native();
    if (current.default_commit !== options.source || canonicalDigest(current.identity) !== canonicalDigest(context.identity))
      result.diagnostics.push("Native source or actor changed during closure collection");
    result.complete = result.inputs.complete && fresh.fresh && result.diagnostics.length === 0;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Native closure collection unavailable"); }
  if (canonicalDigest(captureRepositoryState(options.repo)) !== before) {
    result.diagnostics.push("Caller changed during closure collection"); result.complete = false;
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  return result;
}
