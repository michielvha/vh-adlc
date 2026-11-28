// Checks the text that docs/specs/spec-review-convergence.md requires in the resolved shared convention,
// the plugin's references and the user guides. The phrases are fixed here so the companion
// vhco-pro/docs change and the plugin edits are tested against one wording.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const setup = Bun.spawnSync(["bash", join(repo, "plugins/vh-adlc/scripts/ensure-vh-adlc.sh")], { stdout: "pipe", stderr: "pipe" });
if (setup.exitCode !== 0) throw new Error("verified cached binary required for review convergence checks");
const binary = setup.stdout.toString().trim();

// The complete docs/specs/spec-review-convergence.md proved its convention text at this revision. Later
// features change that text (docs/specs/proportional-review.md), so the pages resolve here explicitly,
// whatever the repository pin names.
const CONVERGENCE_REVISION = "0c983f6793bfe35eb96ae95ad0c361c6200af44f";

// resolvedPage resolves the page at CONVERGENCE_REVISION: a throwaway repository with no pin of its own
// takes the plugin pin it is given, then the page is read from the binary's cache.
function resolvedPage(page: string): string {
  const scratch = mkdtempSync(join(tmpdir(), "vh-convergence-"));
  try {
    Bun.spawnSync(["git", "-C", scratch, "init", "-q"], { stdout: "pipe", stderr: "pipe" });
    const run = Bun.spawnSync([binary, "knowledge", "--repo", scratch, "--plugin-pin", CONVERGENCE_REVISION, "--page", page], { stdout: "pipe", stderr: "pipe" });
    const report = JSON.parse(run.stdout.toString());
    if (report.result !== "answered" || report.knowledge.revision !== CONVERGENCE_REVISION) throw new Error(`knowledge did not answer at ${CONVERGENCE_REVISION}: ${run.stdout.toString()}`);
    // The binary caches under ~/Library/Caches on macOS and the XDG cache directory elsewhere.
    const cache = process.platform === "darwin" ? join(homedir(), "Library", "Caches") : process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
    return readFileSync(join(cache, "vh-adlc", "docs", report.knowledge.revision, page), "utf8");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start < 0) return "";
  const next = text.indexOf("\n## ", start + 1);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

describe("resolved feature-document convention", () => {
  const convention = resolvedPage("conventions/feature-documents.md");
  const reviewLog = section(convention, "Review log");

  test("defines blocking, should-fix and nit beside the spec review record format (AC-02)", () => {
    expect(reviewLog).toMatch(/^- blocking: a stated fact is false and that changes what is built/m);
    expect(reviewLog).toMatch(/^- should-fix: two careful implementers would build different things/m);
    expect(reviewLog).toMatch(/^- nit: wording, style, redundancy, or a citation slip/m);
  });

  test("states the nit rule beside the severity definitions (AC-08)", () => {
    expect(reviewLog).toContain("A nit on the normative baseline never causes a revision on its own.");
    expect(reviewLog).toContain("the same commit fixes every nit of that pass, in any");
    expect(reviewLog).toContain("free-text widening nit, which stays listed even when the baseline changes for other findings");
    expect(reviewLog).toContain("in its report and the owner-facing conversation summary, not in the document");
  });

  test("lets a declared review lens keep its own severity (AC-02)", () => {
    expect(reviewLog).toContain("A\nfinding a declared lens raises takes that lens's severity");
  });

  test("exempts nits from open questions (AC-11)", () => {
    expect(section(convention, "Open questions")).toContain("A review finding rated nit is the exception");
  });

  test("requires must-pass and must-fail examples in a free-text pattern proof (AC-05)", () => {
    expect(section(convention, "Test plan")).toContain("lists its must-pass and must-fail examples in the row");
  });
});

describe("user guides", () => {
  const guides = ["docs/get-started/first-feature.md", "docs/user-guides/workflows.md"].map((path) => ({
    path,
    // Prose wraps at any word, so phrases are matched with whitespace collapsed.
    text: readFileSync(join(repo, path), "utf8").replace(/\s+/g, " "),
  }));

  for (const guide of guides) {
    test(`${guide.path} describes the severities, the nit rule and one revision per pass (AC-08)`, () => {
      expect(guide.text).toContain("blocking, should-fix or nit");
      expect(guide.text).toContain("never causes a revision on its own");
      expect(guide.text).toContain("as one revision");
    });
  }

  test("docs/user-guides/workflows.md says no approval allows rewriting a reviewed commit (AC-08)", () => {
    expect(guides[1].text).toContain("No approval allows rewriting a commit that a Review Log row names");
  });
});

describe("plugin authority reference", () => {
  const authority = readFileSync(join(repo, "plugins/vh-adlc/references/authority.md"), "utf8");

  test("Preservation forbids rewriting a commit a Review Log row names, even with approval (AC-10)", () => {
    const preservation = section(authority, "Preservation");
    expect(preservation).toContain("rewrites a commit that a Review Log row names");
    expect(preservation).toContain("even with the owner's approval");
  });

  test("the history-rewrite row carries the same exception (AC-10)", () => {
    const row = authority.split("\n").find((line) => line.startsWith("| Destructive Git or data operations, history rewrites"));
    expect(row).toBeDefined();
    expect(row).toContain("never a commit a Review Log row names");
  });
});
