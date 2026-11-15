import type { Settings } from "./settings";
import type { PublicationIdentity } from "./transport";

export const PUBLISHER_ENTRIES = ["hosted", "copilot", "claude"] as const;
export type PublisherEntry = typeof PUBLISHER_ENTRIES[number];
export type PublisherAccount = Pick<PublicationIdentity, "actor" | "actor_id">;
export type EntryIdentities = Record<PublisherEntry, PublisherAccount>;

export function sameLogin(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function sameAccount(left: PublisherAccount, right: PublisherAccount): boolean {
  return sameLogin(left.actor, right.actor) && left.actor_id === right.actor_id;
}

export function samePublicationIdentity(left: PublicationIdentity, right: PublicationIdentity): boolean {
  return left.repository.toLowerCase() === right.repository.toLowerCase()
    && left.repository_id === right.repository_id && left.default_branch === right.default_branch
    && sameAccount(left, right);
}

export function publisherActor(settings: Settings, entry?: PublisherEntry): string {
  const actors = settings.publication.entry_actors;
  if (actors === undefined) return settings.publication.actor;
  if (entry === undefined || !PUBLISHER_ENTRIES.includes(entry)) throw Error("docs-drift publisher entry required");
  return actors[entry];
}
