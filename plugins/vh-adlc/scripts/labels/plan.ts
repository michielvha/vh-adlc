import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { effectiveLabels, loadSettings, origin } from "../triage/settings";
import type { LabelsGitHub, Metadata, RepoLabel } from "./github";

export type Status = "present" | "missing" | "different";
export type Entry = { standard: string; name: string; kind: "type" | "state"; status: Status; differs?: ("color" | "description")[]; mapped?: true };
export type Write = { action: "create" | "update"; name: string; before: Metadata | null; after: Metadata };
/** Everything that decides the writes is recorded, so apply can refuse when any of it changed. */
export type LabelPlan = {
  schema_version: 1;
  host: string;
  repository: string;
  actor: string;
  vocabulary_sha256: string;
  effective_names: Record<string, string>;
  labels_read: RepoLabel[];
  standard: Entry[];
  unmanaged: string[];
  writes: Write[];
};

export const VOCABULARY = resolve(import.meta.dir, "vocabulary.json");
export function digest(text: string): string { return createHash("sha256").update(text).digest("hex"); }
const byName = (a: { name: string }, b: { name: string }) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/** Observe the repository and compute the plan; reads only. */
export function observe(root: string, gh: LabelsGitHub): LabelPlan {
  root = realpathSync(root);
  const identity = origin(root);
  if (gh.host.toLowerCase() !== identity.hostname) throw new Error("GitHub host differs from the checkout's origin");
  const config = loadSettings(root);
  const labels = effectiveLabels(config);
  const actor = gh.actor();
  const read = gh.labels(identity.repository).sort(byName);
  const claimed = new Set<string>();
  const standard: Entry[] = [], writes: Write[] = [];
  for (const label of labels) {
    const after = { color: label.color, description: label.description };
    const mapped = config.label_map[label.standard] !== undefined && label.name !== label.standard ? { mapped: true as const } : {};
    const existing = read.find((item) => item.name.toLowerCase() === label.name.toLowerCase());
    if (!existing) {
      standard.push({ standard: label.standard, name: label.name, kind: label.kind, status: "missing", ...mapped });
      writes.push({ action: "create", name: label.name, before: null, after });
      continue;
    }
    claimed.add(existing.name.toLowerCase());
    const differs = (["color", "description"] as const).filter((field) => existing[field] !== after[field]);
    if (!differs.length) { standard.push({ standard: label.standard, name: existing.name, kind: label.kind, status: "present", ...mapped }); continue; }
    standard.push({ standard: label.standard, name: existing.name, kind: label.kind, status: "different", differs: [...differs], ...mapped });
    writes.push({ action: "update", name: existing.name, before: { color: existing.color, description: existing.description }, after });
  }
  return {
    schema_version: 1, host: identity.hostname, repository: identity.repository, actor,
    vocabulary_sha256: digest(readFileSync(VOCABULARY, "utf8")),
    effective_names: Object.fromEntries(labels.map((label) => [label.standard, label.name])),
    labels_read: read, standard,
    unmanaged: read.filter((item) => !claimed.has(item.name.toLowerCase())).map((item) => item.name),
    writes,
  };
}

/** The plan and the exact text whose digest the owner approves. */
export function buildPlan(root: string, gh: LabelsGitHub): { plan: LabelPlan; text: string; digest: string } {
  const plan = observe(root, gh), text = JSON.stringify(plan, null, 2) + "\n";
  return { plan, text, digest: digest(text) };
}
