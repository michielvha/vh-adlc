// The scope of a spec review after the first (references/review-protocol.md, Routes): the previous spec
// review, the document diff since it without the Review Log, and whether the pass must be full. Both
// routes take it from this one computation: the spec skill passes it in the host dispatch, and the
// `review` command puts it in the command route's prompt, whose export has no Git history.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileCoverage } from "../docs-impact/matching";

export type ReviewScope = { previous: string; diff: string; full: boolean; reason: string };

/** The files `vh-adlc knowledge` reads a docs pin from; a change to one moves the conventions a review applies. */
export const PIN_BRIDGES = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];

function git(repo: string, ...args: string[]): { code: number; out: string } {
  const run = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: run.exitCode ?? -1, out: run.stdout.toString() };
}

/** Spec review rows that are not acceptances, in document order, with their commit cell. */
function specRows(text: string): string[] {
  const start = text.search(/^## Review Log\s*$/m);
  if (start < 0) return [];
  return text.slice(start).split("\n").flatMap((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 8 || !/^R-\d+$/.test(cells[2]) || cells[3] !== "spec" || cells[7] === "accepted by owner") return [];
    return [cells[4].replace(/`/g, "")];
  });
}

function covers(text: string): string[] {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
  if (!front) return [];
  const value = (Bun.YAML.parse(front) as Record<string, unknown> | null)?.covers;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** The document without its Review Log section, so stored records and rows never count as changed text. */
export function withoutReviewLog(text: string): string {
  const start = text.search(/^## Review Log\s*$/m);
  if (start < 0) return text;
  const rest = text.slice(start + 1);
  const next = rest.search(/^## /m);
  return text.slice(0, start) + (next < 0 ? "" : rest.slice(next));
}

export function reviewScope(repo: string, document: string, commit: string): ReviewScope {
  const full = (reason: string): ReviewScope => ({ previous: "", diff: "", full: true, reason });
  const at = git(repo, "show", `${commit}:${document}`);
  if (at.code !== 0) throw Error(`${document} does not exist at ${commit}`);
  let previous = "";
  for (const cell of specRows(at.out).reverse()) {
    // A +dirty row reviewed uncommitted work and never counts as a previous review.
    if (!/^[0-9a-f]{7,40}$/.test(cell)) continue;
    const resolved = git(repo, "rev-parse", "--verify", "--quiet", `${cell}^{commit}`);
    if (resolved.code !== 0) continue;
    const sha = resolved.out.trim();
    if (git(repo, "merge-base", "--is-ancestor", sha, commit).code === 0) { previous = sha; break; }
  }
  if (!previous) return full("no previous spec review");
  const changed = git(repo, "diff", "--name-only", "-z", previous, commit).out.split("\0").filter(Boolean);
  const patterns = covers(at.out).map((pattern) => compileCoverage(pattern, "feature"));
  const moved = changed.filter((path) => PIN_BRIDGES.includes(path) || (path !== document && patterns.some((matches) => matches(path))));
  if (moved.length) return full(`changed since the previous spec review: ${moved.join(", ")}`);
  const before = git(repo, "show", `${previous}:${document}`);
  const scratch = mkdtempSync(join(tmpdir(), "vh-review-scope-"));
  try {
    const a = join(scratch, "a"), b = join(scratch, "b");
    writeFileSync(a, withoutReviewLog(before.code === 0 ? before.out : ""));
    writeFileSync(b, withoutReviewLog(at.out));
    const diff = git(scratch, "diff", "--no-index", "--no-color", "-U3", "a", "b").out
      .replace(/^diff --git a\/a b\/b$/m, `diff --git a/${document} b/${document}`)
      .replace(/^--- a\/a$/m, `--- a/${document}`).replace(/^\+\+\+ b\/b$/m, `+++ b/${document}`);
    return { previous, diff, full: false, reason: "" };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
