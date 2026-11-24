// Convention pages a command-route review needs (references/review-protocol.md, Routes). The reviewer
// reads every page the repository routes it to from the binary's cache and stops at the first one it
// cannot read. A command-route reviewer often cannot fetch, so the dispatching operation caches the
// pages first, and a review whose pages cannot be cached stays pending without starting the reviewer.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PAGE = /\b(?:conventions|guides|knowledge)\/[A-Za-z0-9._-]+\.md\b/g;
/** Every reviewer starts with the feature-document standard, and reads the revision's own AGENTS.md. */
const BASE = ["AGENTS.md", "conventions/feature-documents.md"];

export function docsCache(revision: string): string {
  const base = process.platform === "darwin" ? join(homedir(), "Library", "Caches") : (process.env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"));
  return join(base, "vh-adlc", "docs", revision);
}

function committed(repo: string, commit: string, path: string): string {
  const run = Bun.spawnSync(["git", "show", `${commit}:${path}`], { cwd: repo, stdout: "pipe", stderr: "ignore", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  return run.exitCode === 0 ? run.stdout.toString() : "";
}

/** The pages named by AGENTS.md at the reviewed commit and by the docs revision's own AGENTS.md, plus the base pages. */
export function reviewPages(repo: string, commit: string, revision: string): string[] {
  const routed = (text: string) => text.match(PAGE) ?? [];
  let docs = "";
  try { docs = readFileSync(join(docsCache(revision), "AGENTS.md"), "utf8"); } catch { /* fetched with the pages below */ }
  return [...new Set([...BASE, ...routed(committed(repo, commit, "AGENTS.md")), ...routed(docs)])].sort();
}

/** Caches every review page at `revision`; returns the pages still missing afterwards. */
export function cacheReviewPages(input: { repo: string; commit: string; revision: string; binary: string; pluginPin: string }): { pages: string[]; missing: string[]; reason?: string } {
  const missingNow = (pages: string[]) => pages.filter(page => !existsSync(join(docsCache(input.revision), page)));
  let pages = reviewPages(input.repo, input.commit, input.revision);
  if (missingNow(pages).length === 0) return { pages, missing: [] };
  const fetch = (wanted: string[]) => {
    const run = Bun.spawnSync([input.binary, "knowledge", "--repo", input.repo, "--plugin-pin", input.pluginPin, ...wanted.flatMap(page => ["--page", page])],
      { cwd: input.repo, stdout: "pipe", stderr: "pipe" });
    let answer: { result?: string; knowledge?: { revision?: string } | null } = {};
    try { answer = JSON.parse(run.stdout.toString()); } catch { /* reported below */ }
    if (answer.result !== "answered") return `vh-adlc knowledge did not answer (${answer.result ?? `exit ${run.exitCode}`})`;
    if (answer.knowledge?.revision !== input.revision) return `vh-adlc knowledge resolved revision ${answer.knowledge?.revision ?? "none"}, not the dispatched ${input.revision}`;
    return undefined;
  };
  let reason = fetch(missingNow(pages));
  // The docs revision's AGENTS.md arrives with the first fetch and may route further pages.
  if (!reason) { pages = reviewPages(input.repo, input.commit, input.revision); if (missingNow(pages).length) reason = fetch(missingNow(pages)); }
  const missing = missingNow(pages);
  return reason || missing.length ? { pages, missing, reason: reason ?? "the pages are not in the cache after vh-adlc knowledge" } : { pages, missing: [] };
}
