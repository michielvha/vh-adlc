import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSettings, ownership } from "../../../plugins/vh-adlc/scripts/triage/settings";
import { fixture, git } from "./fixtures";
const root = resolve(import.meta.dir, "fixtures"), migration = join(root, "migration");
const read = (path: string) => readFileSync(join(migration, path), "utf8");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const allowed = (path: string) => [".vh-adlc/triage.json", "AGENTS.md", ".claude/commands/triage.md", "agents/issue-triage.md"].includes(path) || path.startsWith("tests/agent-triage/");

test("frozen legacy inputs retain measured source hashes and every intentional difference", () => {
  const manifest = JSON.parse(readFileSync(join(root, "legacy/manifest.json"), "utf8"));
  for (const [path, hash] of Object.entries(manifest.files)) expect(digest(readFileSync(join(root, "legacy", path), "utf8"))).toBe(hash as string);
  expect(manifest.intentional_differences).toEqual(["all-writes-approved", "unbounded-pagination", "incomplete-blocks-all-closures", "current-index-request", "all-modes-save-report", "report-commit-opt-in", "scope-safe-history"]);
});

test("the migration snapshot was exported from one exact adapter commit and only allowed paths", () => {
  const manifest = JSON.parse(read("manifest.json")) as { baseline: string; commit: string; files: Record<string,string> };
  expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/); expect(manifest.baseline).toMatch(/^[0-9a-f]{40}$/);
  for (const [path, hash] of Object.entries(manifest.files)) { expect(allowed(path)).toBe(true); expect(digest(read(path))).toBe(hash); }
  const checkout = process.env.STACKWEAVER_TRIAGE_CHECKOUT;
  if (checkout) {
    expect(git(checkout, "rev-parse", "HEAD")).toBe(manifest.commit);
    expect(git(checkout, "status", "--porcelain", "--", ...Object.keys(manifest.files))).toBe("");
    for (const [path, hash] of Object.entries(manifest.files)) expect(digest(readFileSync(join(checkout,path), "utf8"))).toBe(hash);
    expect(git(checkout, "diff", "--name-only", manifest.baseline, manifest.commit).split("\n").every(allowed)).toBe(true);
  }
});

test("Stackweaver entry points forward once, preserve the local model and fail clearly without the plugin", () => {
  const entry = read("agents/issue-triage.md"), command = read(".claude/commands/triage.md"), agents = read("AGENTS.md");
  expect(entry.length).toBeLessThan(4500); expect(command.length).toBeLessThan(2200);
  expect(entry).toContain("vh-adlc-triage"); expect(entry).toContain(".vh-adlc/triage.json"); expect(entry).toMatch(/missing|unavailable/i); expect(entry).toMatch(/install/i);
  expect(entry).not.toContain("Step 1 - Inventory"); expect(entry).not.toContain("--limit 200");
  expect(command).toMatch(/^model: fable$/m); expect(command).toContain("$ARGUMENTS"); expect(command).toContain("agents/issue-triage.md");
  expect(agents).toContain("agents/issue-triage.md"); expect(agents).toContain("agents/spec.md"); expect(agents).toContain("documentation tasks");
});

test("project settings retain source, priority, plan, history and hard ownership behavior", () => {
  const f = fixture();
  try {
    git(f.root, "remote", "set-url", "origin", "https://github.com/michielvha/stackweaver.git");
    f.write("docs/internal/status/.keep", ""); f.settings(JSON.parse(read(".vh-adlc/triage.json")));
    const config = loadSettings(f.root);
    expect(config.generated_mirrors).toContain("distribution"); expect(config.plan_roots).toEqual(["docs/internal"]);
    expect(config.report_dir).toBe("docs/internal/status"); expect(config.milestone_order[0]).toBe("Public Go Live");
    expect(config.priority_order).toEqual(["high", "medium", "low"]); expect(config.stale_days).toBe(90);
    const issue = {number: 999, author: "owner", labels: [], title: "New unlisted umbrella"};
    expect(ownership(issue, config, true)).toBe("index");
    for (const number of [332,334]) expect(ownership({...issue,number},config)).toBe("protected");
    for (const author of ["renovate","dependabot","stackweaver-release-bot"]) expect(ownership({...issue,author},config)).toBe("protected");
  } finally { f.dispose(); }
});

test("the adapter retains report frontmatter/index rules and a scope-limited rollback/publication handoff", () => {
  const entry = read("agents/issue-triage.md"), handoff = read("tests/agent-triage/README.md");
  for (const field of ["description", "status_description", "author", "covers"]) expect(entry).toContain(field);
  expect(entry).toContain("build-docs-index.js"); expect(entry).toMatch(/never.*hand-edit/i);
  expect(handoff).toContain("feat/shared-triage-migration"); expect(handoff).toMatch(/rollback/i); expect(handoff).toMatch(/reappl/i);
  expect(handoff).toMatch(/vh-adlc[\s\S]*first[\s\S]*Stackweaver/);
  expect(handoff).toContain("tests/agent-triage/"); expect(handoff).not.toMatch(/reset --hard|clean -fd|docker compose down/);
  const legacy = JSON.parse(readFileSync(join(root,"legacy/manifest.json"),"utf8"));
  for (const difference of legacy.intentional_differences) expect(handoff).toContain(difference);
});
