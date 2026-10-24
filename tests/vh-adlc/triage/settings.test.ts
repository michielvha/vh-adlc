import { afterEach, expect, test } from "bun:test";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { loadSettings, ownership, sourcePath } from "../../../plugins/vh-adlc/scripts/triage/settings";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const project of projects.splice(0)) project.dispose(); });
function project() { const value = fixture(); projects.push(value); return value; }

test("no settings has conservative defaults and creates no config or report directory", () => {
  const f = project(), config = loadSettings(f.root);
  expect(config.repository).toBe("example/project");
  expect(config.hostname).toBe("github.com");
  expect(config.configured).toBe(false);
  expect(config.report_dir).toBe(".vh-adlc/reports/triage");
  expect(config.plan_roots).toEqual([]);
  expect(config.priority_order).toEqual([]);
  expect(config.protected_ids).toEqual([]);
  expect(config.stale_days).toBe(90);
  expect(existsSync(join(f.root, ".vh-adlc"))).toBe(false);
});

test("project data controls ownership and ranking without built-in project identities", () => {
  const f = project();
  f.write("plans/a.md", "---\ntracker: 8\n---\n");
  f.settings({ schema_version: 1, repository: "example/project", source_roots: ["src"],
    generated_mirrors: ["generated"], plan_roots: ["plans"], protected_ids: [8], index_ids: [9],
    index_rules: { labels: ["tracking"], title_prefixes: ["Milestone:"] }, bot_authors: ["update-bot"],
    owned_labels: ["another-workstream"], priority_order: ["urgent", "later"], milestone_order: ["Launch"],
    plan_fields: { issue: "tracker", status: "state", status_description: "detail", priority: "rank" },
    label_map: { ready: "ready-for-work" }, stale_days: 30, page_budget: 12 });
  const config = loadSettings(f.root);
  expect(config.plan_fields.issue).toBe("tracker");
  expect(config.priority_order).toEqual(["urgent", "later"]);
  expect(config.page_budget).toBe(12);
  expect(ownership({ number: 8, author: "owner", labels: [], title: "Feature" }, config)).toBe("protected");
  expect(ownership({ number: 10, author: "update-bot", labels: [], title: "Update" }, config)).toBe("protected");
  expect(ownership({ number: 11, author: "owner", labels: ["another-workstream"], title: "Work" }, config)).toBe("protected");
  expect(ownership({ number: 99, author: "owner", labels: ["tracking"], title: "New umbrella" }, config)).toBe("index");
  expect(ownership({ number: 100, author: "owner", labels: [], title: "Milestone: Next" }, config)).toBe("index");
  expect(sourcePath(config, "src/app.ts")).toBe(true);
  expect(sourcePath(config, "generated/app.ts")).toBe(false);
});

test("an evidenced unlisted index stays protected even without settings", () => {
  const config = loadSettings(project().root);
  const issue = { number: 123, author: "owner", labels: [], title: "Release tracker" };
  expect(ownership(issue, config, true)).toBe("index");
  expect(ownership(issue, config, false)).toBe("eligible");
});

test.each([
  null, [], { schema_version: 2 }, { schema_version: 1, unexpected: "private-value" },
  { schema_version: 1, stale_days: -1 }, { schema_version: 1, page_budget: 0 },
  { schema_version: 1, protected_ids: ["8"] }, { schema_version: 1, source_roots: "src" },
  { schema_version: 1, index_rules: { executable: "echo bad" } },
  { schema_version: 1, plan_fields: { issue: "same", status: "same" } },
])("malformed/unknown settings are rejected before collection: %j", (input) => {
  const f = project(); f.settings(input);
  expect(() => loadSettings(f.root)).toThrow();
});

test("invalid JSON and an explicitly missing settings file fail without exposing values", () => {
  const f = project(); f.write(".vh-adlc/triage.json", "private-value: not json");
  try { loadSettings(f.root); throw new Error("accepted invalid config"); }
  catch (error) { expect(String(error)).not.toContain("private-value"); }
  expect(() => loadSettings(f.root, { settingsPath: "absent.json" })).toThrow("settings");
});

test("configured repository conflicts never switch target or account", () => {
  const f = project(); f.settings({ schema_version: 1, repository: "other/project" });
  expect(() => loadSettings(f.root)).toThrow("repository");
  expect(git(f.root, "remote", "get-url", "origin")).toBe("https://github.com/example/project.git");
});

test("SSH GitHub origins are normalized; non-GitHub-style and authenticated URLs are rejected", () => {
  const f = project(); git(f.root, "remote", "set-url", "origin", "git@github.com:example/project.git");
  expect(loadSettings(f.root).repository).toBe("example/project");
  for (const remote of ["/tmp/origin.git", "https://secret@github.com/example/project.git", "https://github.com/example/project.git?token=secret"]) {
    git(f.root, "remote", "set-url", "origin", remote);
    expect(() => loadSettings(f.root)).toThrow();
  }
});

test.each(["../outside", "/tmp", "src/../../outside"])("source/report paths cannot escape: %s", (path) => {
  const f = project(); f.settings({ schema_version: 1, source_roots: [path] });
  expect(() => loadSettings(f.root)).toThrow();
  f.settings({ schema_version: 1, report_dir: path });
  expect(() => loadSettings(f.root)).toThrow();
});

test("symlinks cannot turn a declared source or report location into host-file access", () => {
  const f = project(), outside = project();
  symlinkSync(outside.root, join(f.root, "escape"), "dir");
  f.settings({ schema_version: 1, source_roots: ["escape"] });
  expect(() => loadSettings(f.root)).toThrow();
  f.settings({ schema_version: 1, report_dir: "escape/new/reports" });
  expect(() => loadSettings(f.root)).toThrow();
});
