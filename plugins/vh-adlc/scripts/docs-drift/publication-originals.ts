import { fetchProposalObjects } from "./proposals";
import { collectResolutionInputs, readResolutionProposal, type ResolutionCollection } from "./resolve-inputs";
import type { OwnedObjectStore, Snapshot } from "./snapshot";
import type { readNativeContext } from "./transport";

/** Fetch every selected original independently of discovery, retaining both native observations. */
export async function collectPublicationOriginals(options: {
  snapshot: Snapshot; store: OwnedObjectStore; context: ReturnType<typeof readNativeContext>; selected: number[];
  current_default: string; credential: string; path?: string;
}) {
  const { snapshot, store, context, selected } = options;
  const environment = { PATH: options.path, ...(snapshot.settings.hostname === "github.com" || snapshot.settings.hostname.endsWith(".ghe.com")
    ? { GH_TOKEN: options.credential } : { GH_ENTERPRISE_TOKEN: options.credential }) };
  const observed: ReturnType<typeof readResolutionProposal>[] = [];
  for (const id of selected) {
    const proposal = context.repository.pull(id);
    const fetched = await fetchProposalObjects(store, proposal, { hostname: snapshot.settings.hostname, repository: snapshot.settings.repository,
      default_branch: snapshot.settings.default_branch, expected_default_commit: options.current_default, environment });
    if (!fetched.complete) throw Error("Selected complete original diff unavailable");
    observed.push(readResolutionProposal(store, proposal));
  }
  const collection: ResolutionCollection = { snapshot, store, reader: context.repository, selected };
  return { collection, inputs: collectResolutionInputs(collection), observed };
}
