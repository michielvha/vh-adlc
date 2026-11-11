import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { loadSettings, ownership, sourcePath } from "../../../plugins/vh-adlc/scripts/triage/settings";
import { fixture, git } from "./fixtures";
import { blockYAML } from "../settings-yaml";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const project of projects.splice(0)) project.dispose(); });
function project() { const value = fixture(); projects.push(value); return value; }

test("no settings has conservative defaults and creates no config or report directory", () => {
  const f = project(), config = loadSettings(f.root);
  expect(config.repository).toBe("example/project");
  expect(config.hostname).toBe("github.com");
  expect(config.configured).toBe(false);
  expect(config.settings_path).toBe(".vh-adlc/triage.yaml");
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

test("declared workstream sources protect issue references even when observations omit ownership",()=>{
  const f=project();
  f.write("docs/owned/plan.md","---\nissue: 11\n---\n");
  f.write("docs/ledger.md","Owned #12 and https://github.com/example/project/issues/14; foreign other/project#13 is contextual.\n");
  git(f.root,"add","docs");git(f.root,"commit","-qm","test: seed workstream sources");
  f.settings({schema_version:1,workstreams:[{owner:"specialist",plan_roots:["docs/owned"],reference_files:["docs/ledger.md"]}]});
  const config=loadSettings(f.root);
  for(const number of [11,12,14])expect(ownership({number,author:"owner",title:"Scope",labels:[]},config)).toBe("protected");
  expect(ownership({number:13,author:"owner",title:"Other scope",labels:[]},config)).toBe("eligible");
  expect(config.workstream_ownership[11].sources).toContain("docs/owned/plan.md");
  f.write("docs/ledger.md","Changed owner scope #15\n");expect(()=>loadSettings(f.root)).toThrow();
});

test.each([
  null, [], { schema_version: 2 }, { schema_version: 1, unexpected: "private-value" },
  { schema_version: 1, stale_days: -1 }, { schema_version: 1, page_budget: 0 },
  { schema_version: 1, protected_ids: ["8"] }, { schema_version: 1, source_roots: "src" },
  { schema_version: 1, index_rules: { executable: "echo bad" } },
  { schema_version: 1, plan_fields: { issue: "same", status: "same" } },
  {schema_version:1,workstreams:"wrong"},{schema_version:1,workstreams:[{owner:"specialist"}]},
  {schema_version:1,workstreams:[{owner:"specialist",reference_files:["missing.md"]}]},
].map((input) => [input]))("malformed/unknown settings are rejected before collection: %j", (input) => {
  const f = project(); f.settings(input);
  expect(() => loadSettings(f.root)).toThrow();
});

// The JSON loader at a1f10de gave this for the same values, apart from root and settings_path.
const beforeYAML = {"schema_version":1,"configured":true,"repository":"example/project","hostname":"github.com","source_roots":["src","src"],"generated_mirrors":["generated"],"plan_roots":["plans"],"plan_fields":{"issue":"tracker","status":"state","status_description":"detail","priority":"rank"},"report_dir":".vh-adlc/reports/triage","report_dir_configured":false,"protected_ids":[8,3],"index_ids":[9],"index_rules":{"labels":["tracking"],"title_prefixes":["Milestone:"]},"bot_authors":["update-bot"],"owned_labels":["another-workstream"],"label_map":{"zeta":"z-label","alpha":"a-label"},"workstreams":[{"owner":"specialist","plan_roots":[],"reference_files":["docs/ledger.md"]}],"workstream_ownership":{"12":{"owners":["specialist"],"sources":["docs/ledger.md"]}},"workstream_sources":{"docs/ledger.md":"7fab47612a9c426725beb2f40408def77b8b742e733a10459462636068de4522"},"priority_order":["urgent","later"],"milestone_order":["Launch"],"stale_days":30,"page_budget":12};

test("a block YAML settings file gives the settings the JSON file gave", () => {
  const f = project();
  f.write("plans/a.md", "---\ntracker: 8\n---\n"); f.write("docs/ledger.md", "Owned #12.\n");
  git(f.root, "add", "plans", "docs"); git(f.root, "commit", "-qm", "test: seed workstream sources");
  f.settings({ schema_version: 1, repository: "example/project", source_roots: ["src", "./src"],
    generated_mirrors: ["generated"], plan_roots: ["plans"], protected_ids: [8, 8, 3], index_ids: [9],
    index_rules: { labels: ["tracking"], title_prefixes: ["Milestone:"] }, bot_authors: ["update-bot"],
    owned_labels: ["another-workstream"], priority_order: ["urgent", "later"], milestone_order: ["Launch"],
    plan_fields: { issue: "tracker", status: "state", status_description: "detail", priority: "rank" },
    label_map: { zeta: "z-label", alpha: "a-label" }, stale_days: 30, page_budget: 12,
    workstreams: [{ owner: "specialist", reference_files: ["docs/ledger.md"] }] });
  const text = readFileSync(join(f.root, ".vh-adlc/triage.yaml"), "utf8");
  expect(() => JSON.parse(text)).toThrow(); expect(blockYAML(text)).toContain("\nsource_roots:\n  - src\n");
  const { root, settings_path, ...config } = loadSettings(f.root);
  expect(root).toBe(realpathSync(f.root)); expect(settings_path).toBe(".vh-adlc/triage.yaml");
  expect(config).toEqual(beforeYAML as typeof config);
});

test("refused YAML and an explicitly missing settings file fail without exposing values", () => {
  const f = project(); f.write(".vh-adlc/triage.yaml", "# Broken on purpose.\nprivate-value: [unclosed\n");
  try { loadSettings(f.root); throw new Error("accepted invalid config"); }
  catch (error) { expect(String(error)).toContain("invalid triage settings"); expect(String(error)).not.toContain("private-value"); }
  expect(() => loadSettings(f.root, { settingsPath: "absent.yaml" })).toThrow("settings");
});

test.each(["json", "yml"])("a leftover .vh-adlc/triage.%s fails naming the YAML path, with or without --settings", suffix => {
  const f = project(); f.write(`.vh-adlc/triage.${suffix}`, "{\"schema_version\":1}\n");
  expect(() => loadSettings(f.root)).toThrow(".vh-adlc/triage.yaml");
  f.settings({ schema_version: 1 });
  expect(() => loadSettings(f.root, { settingsPath: ".vh-adlc/triage.yaml" })).toThrow(".vh-adlc/triage.yaml");
});

test("an explicit settings path must end in .yaml", () => {
  const f = project(); f.write("config/triage.json", "{\"schema_version\":1}\n");
  expect(() => loadSettings(f.root, { settingsPath: "config/triage.json" })).toThrow(".yaml");
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

test("root-wide source scope still excludes mirrors and Git metadata", () => {
  const f = project(); f.write("generated/app.ts", "export const mirror = true;\n");
  f.settings({ schema_version: 1, generated_mirrors: ["generated"] });
  const config = loadSettings(f.root);
  expect(sourcePath(config, "src/app.ts")).toBe(true);
  expect(sourcePath(config, "generated/app.ts")).toBe(false);
  expect(sourcePath(config, ".git/config")).toBe(false);
  f.settings({ schema_version: 1, report_dir: ".git/reports" });
  expect(() => loadSettings(f.root)).toThrow();
});

test("dot aliases and internal symlinks cannot disguise mirrors or Git metadata", () => {
  const f = project(); f.write("generated/app.ts", "export const mirror = true;\n");
  symlinkSync(join(f.root, "generated"), join(f.root, "alias"), "dir");
  f.settings({ schema_version: 1, generated_mirrors: ["generated"] });
  const config = loadSettings(f.root);
  expect(sourcePath(config, "././.git/config")).toBe(false);
  expect(sourcePath(config, "alias/app.ts")).toBe(false);
  f.settings({ schema_version: 1, report_dir: "././.git/reports" });
  expect(() => loadSettings(f.root)).toThrow();
});

test("a relative source spelling resolves to the same canonical source", () => {
  const f = project(); f.settings({ schema_version: 1, source_roots: ["./src"] });
  const config = loadSettings(f.root);
  expect(sourcePath(config, "src/app.ts")).toBe(true);
});
