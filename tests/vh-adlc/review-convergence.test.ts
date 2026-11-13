// Checks the text that docs/specs/spec-review-convergence.md requires in the resolved shared convention,
// the plugin's references and the user guides. The phrases are fixed here so the companion
// vhco-pro/docs change and the plugin edits are tested against one wording.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const setup = Bun.spawnSync(["bash", join(repo, "plugins/vh-adlc/scripts/ensure-vh-adlc.sh"), "--offline"], { stdout: "pipe", stderr: "pipe" });
if (setup.exitCode !== 0) throw new Error("verified cached binary required for review convergence checks");
const binary = setup.stdout.toString().trim();

function pluginPin(): string {
  const match = readFileSync(join(repo, "plugins/vh-adlc/knowledge.md"), "utf8").match(/Pass `([0-9a-f]{40})` as `--plugin-pin`/);
  if (!match) throw new Error("plugin pin not found in knowledge.md");
  return match[1];
}

// resolvedPage asks the binary which docs revision applies to this repository, so the repository pin
// in AGENTS.md wins over the plugin pin exactly as every operation sees it, then reads the cached page.
function resolvedPage(page: string): string {
  const run = Bun.spawnSync([binary, "knowledge", "--repo", repo, "--plugin-pin", pluginPin(), "--page", page], { stdout: "pipe", stderr: "pipe" });
  const report = JSON.parse(run.stdout.toString());
  if (report.result !== "answered") throw new Error(`knowledge did not answer: ${run.stdout.toString()}`);
  const cache = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return readFileSync(join(cache, "vh-adlc", "docs", report.knowledge.revision, page), "utf8");
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
    expect(reviewLog).toContain("a nit on the normative baseline never causes a revision on its own");
  });

  test("requires must-pass and must-fail examples in a free-text pattern proof (AC-05)", () => {
    expect(section(convention, "Test plan")).toContain("lists its must-pass and must-fail examples in the row");
  });
});

describe("user guides", () => {
  const guides = ["docs/get-started/first-feature.md", "docs/user-guides/workflows.md"].map((path) => ({
    path,
    text: readFileSync(join(repo, path), "utf8"),
  }));

  for (const guide of guides) {
    test(`${guide.path} describes the severities, the nit rule and one revision per pass (AC-08)`, () => {
      expect(guide.text).toContain("blocking, should-fix or nit");
      expect(guide.text).toContain("never causes a revision on its own");
      expect(guide.text).toContain("as one revision");
    });
  }

  test("docs/user-guides/workflows.md says no approval allows rewriting a reviewed commit (AC-10, R-15 F-06)", () => {
    expect(guides[1].text).toContain("No approval allows rewriting a commit that a Review Log row names");
  });
});
