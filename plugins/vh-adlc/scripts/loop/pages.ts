// Convention pages a command-route review needs (references/review-protocol.md, Routes). The reviewer
// reads every page the repository routes it to from the binary's cache and stops at the first one it
// cannot read. A command-route reviewer often cannot fetch, so the dispatching operation caches the
// pages first, and a review whose pages cannot be cached stays pending without starting the reviewer.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix } from "node:path";

const PAGE = /\b(?:conventions|guides|knowledge)\/[A-Za-z0-9._-]+\.md\b/g;
/** A Markdown link's target, with an optional title: `[text](target "title")` or `[text](<target>)`. */
const LINK = /\]\(\s*<?([^\s()<>]+)>?(?:\s+"[^"]*")?\s*\)/g;
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

/** The docs-repository pages a Markdown link names: relative `.md` targets that stay inside the repository, without anchor. */
function linked(text: string): string[] {
  return [...text.matchAll(LINK)].flatMap(([, target]) => {
    const path = target!.replace(/[#?].*$/, "");
    if (!path.endsWith(".md") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || path.startsWith("/")) return [];
    const clean = posix.normalize(path);
    return clean === ".." || clean.startsWith("../") ? [] : [clean];
  });
}

function cachedPage(revision: string, page: string): string {
  try { return readFileSync(join(docsCache(revision), page), "utf8"); } catch { return ""; }
}

/**
 * The pages named by AGENTS.md at the reviewed commit and by the docs revision's own AGENTS.md, plus the base
 * pages. The docs AGENTS.md also routes through its Markdown links, root pages such as README.md included, and a
 * root page it links (README.md holds the task route) adds the pages it links in turn, one level deep. A link in
 * the reviewed repository's AGENTS.md names that repository's own files, so only its convention paths count.
 */
export function reviewPages(repo: string, commit: string, revision: string): string[] {
  const routed = (text: string) => text.match(PAGE) ?? [];
  const docs = cachedPage(revision, "AGENTS.md");
  const fromDocs = [...routed(docs), ...linked(docs)];
  const roots = fromDocs.filter(page => !page.includes("/") && page !== "AGENTS.md");
  const fromRoots = roots.flatMap(page => { const text = cachedPage(revision, page); return [...routed(text), ...linked(text)]; });
  return [...new Set([...BASE, ...routed(committed(repo, commit, "AGENTS.md")), ...fromDocs, ...fromRoots])].sort();
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
  // The docs revision's AGENTS.md arrives with the first fetch and may route further pages, and a root page it
  // links, such as README.md, arrives with the second and routes the last ones.
  for (let round = 0; round < 2 && !reason; round++) {
    pages = reviewPages(input.repo, input.commit, input.revision);
    if (!missingNow(pages).length) break;
    reason = fetch(missingNow(pages));
  }
  const missing = missingNow(pages);
  return reason || missing.length ? { pages, missing, reason: reason ?? "the pages are not in the cache after vh-adlc knowledge" } : { pages, missing: [] };
}
