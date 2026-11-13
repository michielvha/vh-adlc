import { verifyRuntimeAdoption } from "./adoption";
import { collectionReaders, readAdoptionInput } from "./git";
import { requireOwnedStore } from "./proposals";
import { freezeJSON } from "./protocol";
import type { OwnedObjectStore } from "./snapshot";
import type { PublicationIdentity } from "./transport";

/** Reopen the approved chain; a trial successor never implicitly accepts an older contract. */
export function readCompatibleAdoptionLineage(input: { store: OwnedObjectStore; current_default: string; identity: PublicationIdentity }) {
  const store = { ...input.store }, identity = { ...input.identity }, seen = new Set<string>(), allowed: string[] = [];
  requireOwnedStore(store, identity.repository);
  let next = input.current_default;
  const record = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Incomplete docs-drift adoption lineage record");
    return value as Record<string, unknown>;
  };
  while (true) {
    if (seen.has(next) || seen.size >= 64) throw Error("Bounded docs-drift adoption lineage required");
    seen.add(next);
    const adopted = verifyRuntimeAdoption({ repo: store.root, current_default: next, identity });
    allowed.push(adopted.adoption_sha256);
    const original = readAdoptionInput(store.root, next, adopted.record_path);
    if (!original || original.sha256 !== adopted.adoption_sha256) throw Error("Approved docs-drift adoption lineage changed");
    const predecessor = record(collectionReaders().yaml(original.bytes)).predecessor;
    if (predecessor === null) break;
    const link = record(predecessor);
    if (link.route !== "compatible") break;
    if (typeof link.default_commit !== "string") throw Error("Approved docs-drift predecessor source required");
    next = link.default_commit;
  }
  return freezeJSON(allowed);
}
