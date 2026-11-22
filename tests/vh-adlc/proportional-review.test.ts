// Checks the text docs/specs/proportional-review.md requires in the companion shared convention, the
// plugin's reviewer, skills and references, and vh-adlc's own AGENTS.md. The phrases are fixed here so
// the companion vhco-pro/docs change and the plugin edits are tested against one wording. Prose wraps at
// any word, so every text is matched with whitespace collapsed.
//
// The convention resolves at the repository pin, as every operation sees it. Until the pin bump, set
// VH_ADLC_CONVENTION_DOCS to a local vhco-pro/docs checkout at the companion head to test that text.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const plugin = join(repo, "plugins/vh-adlc");
const flat = (text: string) => text.replace(/\s+/g, " ");
const read = (path: string) => flat(readFileSync(join(plugin, path), "utf8"));
const oldPin = "0c983f6793bfe35eb96ae95ad0c361c6200af44f";

function pinIn(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  if (!match) throw new Error(`pin not found by ${pattern}`);
  return match[1];
}

const knowledgePin = () => pinIn(readFileSync(join(plugin, "knowledge.md"), "utf8"), /Pass `([0-9a-f]{40})` as `--plugin-pin`/);
const agentsText = () => readFileSync(join(repo, "AGENTS.md"), "utf8");
const agentsPin = () => pinIn(agentsText(), /vhco-pro\/docs\/blob\/([0-9a-f]{40})\/AGENTS\.md/);

// resolvedConvention reads the companion checkout when one is named, otherwise asks the binary which docs
// revision applies to this repository and reads the cached page.
function resolvedConvention(): string {
  const override = process.env.VH_ADLC_CONVENTION_DOCS;
  if (override) return readFileSync(join(override, "conventions/feature-documents.md"), "utf8");
  const setup = Bun.spawnSync(["bash", join(plugin, "scripts/ensure-vh-adlc.sh"), "--offline"], { stdout: "pipe", stderr: "pipe" });
  if (setup.exitCode !== 0) throw new Error("verified cached binary required for proportional review checks");
  const binary = setup.stdout.toString().trim();
  const page = "conventions/feature-documents.md";
  const run = Bun.spawnSync([binary, "knowledge", "--repo", repo, "--plugin-pin", knowledgePin(), "--page", page], { stdout: "pipe", stderr: "pipe" });
  const report = JSON.parse(run.stdout.toString());
  if (report.result !== "answered") throw new Error(`knowledge did not answer: ${run.stdout.toString()}`);
  const cache = process.platform === "darwin" ? join(homedir(), "Library", "Caches") : process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return readFileSync(join(cache, "vh-adlc", "docs", report.knowledge.revision, page), "utf8");
}

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start < 0) return "";
  const next = text.indexOf("\n## ", start + 1);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

// The gate every plugin text uses to switch to the new rules.
const gate = "names the product profile as the context for severity";

describe("companion convention (AC-01, AC-02, AC-03, AC-14)", () => {
  const convention = resolvedConvention();
  const reviewLog = flat(section(convention, "Review log"));
  const openQuestions = flat(section(convention, "Open questions"));
  const deferred = flat(section(convention, "Deferred"));
  const sections = flat(section(convention, "Sections"));

  test("names the product profile as the context for severity", () => {
    expect(reviewLog).toContain("This is severity by consequence");
    expect(reviewLog).toContain("the `## Product profile` section of its root `AGENTS.md`");
    expect(reviewLog).toContain("what the product is, who uses it, its stage, and what is at stake");
    expect(reviewLog).toContain("Without a product profile, rate as for production software with users whose data matters.");
  });

  test("defines blocking, should-fix and nit by consequence", () => {
    expect(reviewLog).toContain("- blocking: a stated fact is false and that changes what is built");
    expect(reviewLog).toContain("a concrete failure that a user, tenant or operator of the profiled product would plausibly hit, with serious harm; or an always-blocking defect");
    expect(reviewLog).toContain("- should-fix: a concrete failure that the profiled product's users would plausibly hit, with limited harm");
    expect(reviewLog).toContain("two careful implementers would build things whose difference a user or operator would notice");
    expect(reviewLog).toContain("a proof could pass on a wrong implementation");
    expect(reviewLog).toContain("an undefined path that nobody using the profiled product would plausibly hit");
    expect(reviewLog).not.toContain("- should-fix: two careful implementers would build different things");
  });

  test("keeps the three always-blocking classes blocking on every product", () => {
    expect(reviewLog).toContain("An always-blocking defect is blocking on every product, whatever its profile");
    expect(reviewLog).toContain("a security defect lets someone read or act beyond their authorization, or exposes a credential or secret");
    expect(reviewLog).toContain("a data-loss defect loses or corrupts data a user or tenant owns and cannot regenerate");
    expect(reviewLog).toContain("a tenant-isolation defect lets one tenant read or affect another tenant's data, runs or configuration");
  });

  test("accepts a stated limit and re-raises it only for the three conditions", () => {
    expect(reviewLog).toContain("`Not handled: <the case>, <why> (R-<n> F-<nn>).`");
    expect(reviewLog).toContain("unless the limit excludes a case the goal, a criterion or a behavior Scope promises names");
    expect(reviewLog).toContain("A later pass does not raise the substance of a stated limit again, unless the limit leaves an always-blocking defect, makes a criterion unmeetable or leaves the stated problem unsolved");
    expect(reviewLog).toContain("its `EVIDENCE` quotes the limit");
  });

  test("defines scoped re-review and when a pass is full", () => {
    expect(reviewLog).toContain("A spec review after the first is a scoped re-review");
    expect(reviewLog).toContain("every section that states a rule, ID or term the diff changes");
    expect(reviewLog).toContain("outside that scope it reports only blocking findings");
    expect(reviewLog).toContain("The pass is full when there is no previous spec review, or when a `covers` path outside the document or a docs pin bridge file changed");
  });

  test("allows owner-list triage of unapplied nits with the full list in the same reply", () => {
    expect(reviewLog).toContain("owner-list triage");
    expect(reviewLog).toContain("only the unapplied nits the owner's recorded rules do not settle, with a count of the rest");
    expect(reviewLog).toContain("`All unapplied nits`");
  });

  test("raises open questions only under the plausible-choice rule", () => {
    expect(openQuestions).not.toContain("Every trade-off the document settles is an open question");
    expect(openQuestions).toContain("plausible-choice rule");
    expect(openQuestions).toContain("Raise an open question only where the owner could plausibly choose differently");
    expect(openQuestions).toContain("such as scope, a public contract, security posture, permissions or cost to users");
    expect(openQuestions).toContain("The owner's recorded rules are the product profile plus the instruction files and project procedure");
    expect(openQuestions).toContain("records every other choice in Design with a one-line reason");
    expect(openQuestions).toContain("Each option offered meets the goal in full");
    expect(openQuestions).toContain("raises that choice here only under the plausible-choice rule");
    expect(openQuestions).toContain("every judgement call the goal does not decide is an open question");
  });

  test("defines the optional Deferred section outside the normative baseline, with its five sources", () => {
    expect(sections).toContain("Deferred (after Open Questions)");
    expect(deferred).toContain("deferred list");
    expect(deferred).toContain("outside the normative baseline, so adding or editing an entry never makes a review stale");
    expect(deferred).toContain("`- D-<nn>: <the item>. From: <source>. Verdict: pending.`");
    for (const source of ["`R-<n> F-<nn>, stated limit`", "`R-<n> F-<nn>, deferred at acceptance`", "`owner cut on <date>`", "`author cut`", "`drift re-review R-<n>`"]) {
      expect(deferred).toContain(source);
    }
    expect(deferred).toContain("IDs are never reused");
    expect(deferred).toContain("An entry answers its finding the way a stated limit does");
  });

  test("uses every glossary term except Cut check and Follow-up review (AC-09)", () => {
    const text = flat(convention).toLowerCase();
    const terms = ["product profile", "severity by consequence", "always-blocking defect", "security defect", "data-loss defect", "tenant-isolation defect", "stated limit", "scoped re-review", "owner's recorded rules", "plausible-choice rule", "deferred list", "owner-list triage"];
    expect(terms.filter((term) => !text.includes(term))).toEqual([]);
  });
});

describe("reviewer (AC-03, AC-04, AC-05, AC-08, AC-14)", () => {
  const reviewer = read("agents/vh-adlc-reviewer.agent.md");

  test("gates the new rules on the resolved convention and keeps the old check on an older revision", () => {
    expect(reviewer).toContain(gate);
    expect(reviewer).toContain("On a revision that does not, a path the document leaves undefined is a finding");
  });

  test("reads the product profile at the reviewed commit and has a production default", () => {
    expect(reviewer).toContain("Read the `## Product profile` section of `AGENTS.md` at the reviewed commit");
    expect(reviewer).toContain("Without a profile, judge as for production software with users whose data matters.");
    expect(reviewer).toContain("rate each gap by whether a user, tenant or operator of that product would plausibly hit it and how much harm it does");
  });

  test("honours stated limits and Deferred entries", () => {
    expect(reviewer).toContain("Do not raise the substance of a stated limit or a `## Deferred` entry again");
    expect(reviewer).toContain("leaves an always-blocking defect, makes a criterion unmeetable or leaves the stated problem unsolved");
  });

  test("scopes a re-review to the dispatched scope", () => {
    expect(reviewer).toContain("Return every finding you can establish within this pass's scope");
    expect(reviewer).toContain("Outside the scope, report only blocking findings");
    expect(reviewer).toContain("the scope `review-scope` computed");
  });
});

describe("review protocol (AC-05)", () => {
  const protocol = read("references/review-protocol.md");

  test("both routes pass the scope from one command", () => {
    expect(protocol).toContain("bun scripts/loop/cli.ts review-scope --repo <dir> --document <doc> --commit <X>");
    expect(protocol).toContain("A dispatch never tells the reviewer to skip a check, except the scope `review-scope` computes");
  });
});

describe("spec skill (AC-06, AC-07, AC-08, AC-14, AC-15)", () => {
  const spec = read("skills/vh-adlc-spec/SKILL.md");

  test("gates on the resolved convention", () => {
    expect(spec).toContain(gate);
  });

  test("raises judgement calls and findings only under the plausible-choice rule", () => {
    expect(spec).toContain("plausible-choice rule");
    expect(spec).toContain("judged against the product profile and the files `bun scripts/loop/cli.ts context` lists");
  });

  test("lets the author answer a finding with a stated limit", () => {
    expect(spec).toContain("`Not handled: <the case>, <why> (R-<n> F-<nn>).`");
  });

  test("records every deferral with its exact source", () => {
    for (const source of ["`R-<n> F-<nn>, stated limit`", "`R-<n> F-<nn>, deferred at acceptance`", "`owner cut on <date>`", "`author cut`", "`drift re-review R-<n>`"]) {
      expect(spec).toContain(source);
    }
  });

  test("runs the cut check after every owner-directed deferral", () => {
    expect(spec).toContain("`Cut check: nothing important lost (D-<a> to D-<b> recorded).`");
    expect(spec).toContain("becomes an Open Question instead of a Deferred entry");
  });

  test("triages the owner's nit list and keeps the full list in the reply", () => {
    expect(spec).toContain("`All unapplied nits`");
    expect(spec).toContain("only the unapplied nits the owner's recorded rules do not settle, with a count of the rest");
  });

  test("passes the review scope in the host dispatch", () => {
    expect(spec).toContain("bun scripts/loop/cli.ts review-scope");
  });
});

describe("loop reference (AC-04, AC-09)", () => {
  test("states the product profile once", () => {
    const loop = read("references/loop.md");
    expect(loop).toContain("## Product profile");
    expect(loop).toContain("what the product is, who uses it, its stage, and what is at stake");
    expect(loop.split("## Product profile").length - 1).toBe(1);
  });
});

describe("follow-up review after merge (AC-08, AC-16)", () => {
  const ship = read("skills/vh-adlc-ship/SKILL.md");
  const resume = read("skills/vh-adlc-resume/SKILL.md");
  const authority = read("references/authority.md");

  test("ship runs it for a merged feature, gated on the resolved convention", () => {
    expect(ship).toContain("## Follow-up review after merge");
    expect(ship).toContain(gate);
    expect(ship).toContain("drop, follow-up or gap");
    expect(ship).toContain("bun scripts/labels/cli.ts file --operation follow-up");
    expect(ship).toContain("`Deferred: <document path> D-<nn>`");
    expect(ship).toContain("gh issue list --state all");
    expect(ship).toContain("`docs/follow-up-<slug>`");
    expect(ship).toContain("pending Deferred entries");
  });

  test("resume flags a merged complete document with pending entries", () => {
    expect(resume).toContain("pending Deferred entries");
    expect(resume).toContain("follow-up review");
  });

  test("authority gives ship the follow-up review's issues, branch and PR", () => {
    expect(authority).toContain("follow-up review");
    expect(authority).toContain("`docs/follow-up-<slug>`");
  });
});

describe("vh-adlc's own instructions (AC-09)", () => {
  test("AGENTS.md states vh-adlc's product profile", () => {
    const agents = flat(agentsText());
    expect(agents).toContain("## Product profile");
    expect(agents).toContain("used by a few developers on their own machines and repositories");
  });

  test("AGENTS.md and knowledge.md pin the same companion revision", () => {
    expect(existsSync(join(plugin, "knowledge.md"))).toBe(true);
    expect(agentsPin()).toBe(knowledgePin());
    expect(agentsPin()).not.toBe(oldPin);
  });
});
