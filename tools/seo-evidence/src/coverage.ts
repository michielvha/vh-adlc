import type { Counts, Coverage, Finding, Observation, Snapshot } from "./types";
import { identity } from "./url";

const counts = (items: Observation[]): Counts => ({ declared: items.length, captured: items.filter(o => o.page.outcome === "captured").length, failed: items.filter(o => o.page.outcome === "failed").length, not_collected: items.filter(o => o.page.outcome === "not_collected").length });
const modes = (items: Observation[]) => ({ initial: counts(items.filter(o => o.page.mode === "initial")), rendered: counts(items.filter(o => o.page.mode === "rendered")) });
export function coverage(snapshot: Snapshot, findings: Finding[]): Coverage {
  return { ...counts(snapshot.observations), modes: modes(snapshot.observations), groups: Object.fromEntries(Object.entries(snapshot.groups).sort(([a], [b]) => a.localeCompare(b)).map(([name, urls]) => {
    const set = new Set(urls); const items = snapshot.observations.filter(o => set.has(identity(o.page.requested_url)));
    const seen = new Set(items.map(o => identity(o.page.requested_url)));
    const finalUrls = new Set(items.flatMap(o => o.page.outcome === "captured" ? [identity(o.page.final_url)] : []));
    return [name, { ...counts(items), urls: [...set].sort(), unobserved_urls: [...set].filter(u => !seen.has(u)).sort(), modes: modes(items), findings: findings.filter(f => set.has(f.url) || finalUrls.has(f.url)).map(f => f.id).sort() }];
  })) };
}
