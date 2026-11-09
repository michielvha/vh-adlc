import { captureRepositoryState, captureSnapshot, createOwnedObjectStore, externalArtifactDirectory, type OwnedObjectStore } from "./snapshot";
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

/** The production collector selects the native reader and fixed authenticated fetch itself. */
export async function collectNativeResolution(input: {
  repo: string; source: string; artifact_root: string; selection: unknown; owner: string; run: string;
  credential: string; path?: string;
}): Promise<ResolutionCollectionResult> {
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
          default_branch: settings.default_branch, environment });
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
  return result;
}
