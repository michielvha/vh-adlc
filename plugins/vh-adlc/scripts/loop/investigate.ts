// Investigation defaults (references/loop-settings.md): where findings go, and the verdict an
// investigation ends with. A findings document is written or extended, never duplicated; an issue is
// never the only copy of the findings, only a summary that links to the document.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { LoopSettings } from "./settings";

export const VERDICTS = ["act now", "track", "reject"] as const;
export type Verdict = typeof VERDICTS[number];
export function verdict(value: string): Verdict {
  if (!(VERDICTS as readonly string[]).includes(value)) throw Error("an investigation verdict is one of act now, track or reject");
  return value as Verdict;
}

export type Issue = { number: number; title: string; body?: string };
export type FindingsPlan = {
  document: { action: "write" | "extend"; path: string } | { action: "none"; reason: string };
  duplicates: string[];
  issue: { action: "none" } | { action: "summary-and-link"; number: number; create: false };
};

/** A document or issue covers the case when every search term appears in its description, title or body. */
function covers(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.length > 0 && terms.every(term => lower.includes(term.toLowerCase()));
}
function description(markdown: string): string {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? "";
  const title = /^# (.+)$/m.exec(markdown)?.[1] ?? "";
  return `${front}\n${title}`;
}
function markdownFiles(root: string, dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).flatMap(name => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? markdownFiles(root, path) : name.endsWith(".md") ? [path] : [];
  });
}

export function findingsPlan(settings: LoopSettings, request: { slug: string; terms: string[]; issues: Issue[]; requested?: boolean }): FindingsPlan {
  const docs = markdownFiles(settings.root, settings.analysis_dir).filter(path => covers(description(readFileSync(join(settings.root, path), "utf8")), request.terms));
  const issues = request.issues.filter(issue => covers(`${issue.title}\n${issue.body ?? ""}`, request.terms));
  const duplicates = [...docs, ...issues.map(issue => `#${issue.number}`)];
  const issue: FindingsPlan["issue"] = issues.length ? { action: "summary-and-link", number: issues[0]!.number, create: false } : { action: "none" };
  if (settings.findings_document === "on_request" && !request.requested)
    return { document: { action: "none", reason: "findings_document is on_request and the owner did not ask" }, duplicates, issue };
  const document = docs.length ? { action: "extend" as const, path: docs[0]! } : { action: "write" as const, path: `${settings.analysis_dir}/${request.slug}.md` };
  return { document, duplicates, issue };
}
