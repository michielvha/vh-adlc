import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSettings, normalizeLogin, classifyAuthor } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { resolveStanding } from "../../../plugins/vh-adlc/scripts/maintenance/authority";
import { fixture, git } from "./fixtures";
import { blockYAML } from "../settings-yaml";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function project() { const f = fixture(); projects.push(f); return f; }

test("security policy is an optional repository-contained reference, not executable settings", () => {
  const f = project(); f.write("security-policy.md", "Consumer deadlines and risk decisions.\n");
  f.settings({ schema_version: 1, security_policy: "security-policy.md" });
  expect(loadSettings(f.root).security_policy).toBe("security-policy.md");
  f.settings({ schema_version: 1, security_policy: "../elsewhere.md" });
  expect(() => loadSettings(f.root)).toThrow();
});

test("an unconfigured project has one repository and creates no settings or output", () => {
  const f = project(), before = git(f.root, "status", "--porcelain"), config = loadSettings(f.root);
  expect(config.repository).toBe("example/project");
  expect(config.hostname).toBe("github.com");
  expect(config.configured).toBe(false);
  expect(config.settings_path).toBe(".vh-adlc/maintenance.yaml");
  expect(config.repositories).toEqual([]);
  expect(config.bot_authors).toEqual(["renovate", "dependabot"]);
  expect(config.report_dir).toBe(".vh-adlc/reports/maintenance");
  expect(config.history_dir).toBe(config.report_dir);
  expect(existsSync(join(f.root, ".vh-adlc"))).toBe(false);
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

// The JSON loader at a1f10de gave this for the same values, apart from root and settings_path.
const beforeYAML = {"schema_version":1,"configured":true,"repository":"example/project","hostname":"github.com","repositories":[{"repository":"example/satellite","role":"synced","sync_workflow":"sync.yml"},{"repository":"example/standalone","role":"independent"}],"discovery_organizations":["example"],"excluded_repositories":["example/excluded"],"bot_authors":["renovate","dependabot","update-bot"],"bot_inventory_terms":["release-bot"],"dashboards":[{"repository":"example/project","issue":7},{"repository":"example/satellite","title":"Dependency Dashboard"}],"generated_mirrors":["generated"],"source_references":["sync.yml"],"backlog_references":["security.md"],"report_dir":"reports","history_dir":"prior","project_procedure":"policy.md","surface_expectations":[{"repository":"example/project","surface":"code_scanning","status":403,"message_contains":"Advanced Security is not enabled","reason":"Documented unavailable","evidence":"security.md"}]};

test("settings retain topology, required references, exclusions and exact security expectation", () => {
  const f = project();
  f.write("policy.md", "Local maintenance policy.\n");
  f.write("sync.yml", "source: src\n");
  f.write("security.md", "Documented no-GHAS response.\n");
  f.settings({ schema_version: 1, repository: "EXAMPLE/Project", hostname: "GITHUB.com",
    repositories: [{ repository: "example/satellite", role: "synced", sync_workflow: "sync.yml" }, { repository: "example/standalone", role: "independent" }],
    discovery_organizations: ["example"], excluded_repositories: ["example/excluded"],
    bot_authors: ["Renovate[bot]", "app/dependabot", "update-bot"], bot_inventory_terms: ["release-bot"],
    dashboards: [{ repository: "example/project", issue: 7 }, { repository: "example/satellite", title: "Dependency Dashboard" }],
    generated_mirrors: ["generated"], source_references: ["sync.yml"], backlog_references: ["security.md"],
    report_dir: "reports", history_dir: "prior", project_procedure: "policy.md",
    surface_expectations: [{ repository: "example/project", surface: "code_scanning", status: 403,
      message_contains: "Advanced Security is not enabled", reason: "Documented unavailable", evidence: "security.md" }],
  });
  const text = readFileSync(join(f.root, ".vh-adlc/maintenance.yaml"), "utf8");
  expect(() => JSON.parse(text)).toThrow(); expect(blockYAML(text)).toContain("\nrepositories:\n  - repository: example/satellite\n");
  const config = loadSettings(f.root);
  const { root, settings_path, ...values } = config;
  expect(root).toBe(f.root); expect(settings_path).toBe(".vh-adlc/maintenance.yaml");
  expect(values).toEqual(beforeYAML as typeof values);
  expect(config.repository).toBe("example/project");
  expect(config.configured).toBe(true);
  expect(config.repositories[0].sync_workflow).toBe("sync.yml");
  expect(config.excluded_repositories).toEqual(["example/excluded"]);
  expect(config.bot_authors).toEqual(["renovate", "dependabot", "update-bot"]);
  expect(config.history_dir).toBe("prior");
  expect(config.surface_expectations[0].status).toBe(403);
  expect(config.surface_expectations[0].evidence).toBe("security.md");
});

test("bot matching normalizes whole logins while unknown bot and legacy matches stay gaps", () => {
  const config = loadSettings(project().root);
  expect(normalizeLogin("APP/Renovate[bot]")).toBe("renovate");
  for (const login of ["renovate[bot]", "APP/Dependabot"]) expect(classifyAuthor(config, login, "Bot")).toBe("configured");
  for (const login of ["renovate-other[bot]", "my-dependabot[bot]", "new-account"]) expect(classifyAuthor(config, login, "Bot")).toBe("gap");
  expect(classifyAuthor(config, "person", "User")).toBe("other");
  config.bot_inventory_terms = ["release-bot"];
  expect(classifyAuthor(config, "new-release-bot-name", "User")).toBe("gap");
  expect(classifyAuthor(config, "app/renovate-other", "User")).toBe("gap");
});

test.each([
  null, [], { schema_version: 2 }, { schema_version: 1, command: "private-value" },
  { schema_version: 1, repository: "other/project" }, { schema_version: 1, hostname: "other.example" },
  { schema_version: 1, repositories: [{ repository: "example/project", role: "independent" }] },
  { schema_version: 1, repositories: [{ repository: "example/satellite", role: "synced" }] },
  { schema_version: 1, repositories: [{ repository: "example/a", role: "independent" }, { repository: "EXAMPLE/A", role: "synced", sync_workflow: "absent" }] },
  { schema_version: 1, repositories: [{ repository: "example/a", role: "surprise" }] },
  { schema_version: 1, excluded_repositories: ["example/project"] },
  { schema_version: 1, repositories: [{ repository: "example/a", role: "independent" }], excluded_repositories: ["example/a"] },
  { schema_version: 1, bot_authors: "renovate" }, { schema_version: 1, source_references: ["absent"] },
  { schema_version: 1, project_procedure: "absent" }, { schema_version: 1, report_dir: "../escape" },
  { schema_version: 1, report_dir: ".git/reports" }, { schema_version: 1, report_dir: "src/app.ts" },
  { schema_version: 1, report_dir: ".vh-adlc/maintenance.yaml" },
  { schema_version: 1, dashboards: [{ repository: "example/project", issue: 1, title: "ambiguous" }] },
  { schema_version: 1, dashboards: [{ repository: "unconfigured/project", issue: 1 }] },
  { schema_version: 1, surface_expectations: [{ repository: "example/project", surface: "dependabot", status: 403, message_contains: "x", reason: "x", evidence: "src/app.ts" }] },
  { schema_version: 1, surface_expectations: [{ repository: "example/project", surface: "code_scanning", status: 403, message_contains: "", reason: "x", evidence: "src/app.ts" }] },
].map(x => [x]))("malformed, conflicting or unsafe settings fail before collection: %j", (data) => {
  const f = project(); f.settings(data);
  expect(() => loadSettings(f.root)).toThrow();
});

test("refused YAML, missing explicit settings and secret-bearing origins fail without values", () => {
  const f = project(); f.write(".vh-adlc/maintenance.yaml", "# Broken on purpose.\nprivate-value: &a 1\n");
  try { loadSettings(f.root); throw Error("did not reject"); }
  catch (error) { expect(String(error)).toContain("invalid maintenance settings"); expect(String(error)).not.toContain("private-value"); }
  expect(() => loadSettings(f.root, { settingsPath: "absent.yaml" })).toThrow();
  f.settings({ schema_version: 1 });
  git(f.root, "remote", "set-url", "origin", "https://private-value@github.com/example/project.git");
  try { loadSettings(f.root); throw Error("did not reject"); } catch (error) { expect(String(error)).not.toContain("private-value"); }
});

test.each(["json", "yml"])("a leftover .vh-adlc/maintenance.%s fails naming the YAML path, with or without --settings", suffix => {
  const f = project(); f.write(`.vh-adlc/maintenance.${suffix}`, "{\"schema_version\":1}\n");
  expect(() => loadSettings(f.root)).toThrow(".vh-adlc/maintenance.yaml");
  f.settings({ schema_version: 1 });
  expect(() => loadSettings(f.root, { settingsPath: ".vh-adlc/maintenance.yaml" })).toThrow(".vh-adlc/maintenance.yaml");
});

test("an explicit settings path must end in .yaml", () => {
  const f = project(); f.write("config/maintenance.json", "{\"schema_version\":1}\n");
  expect(() => loadSettings(f.root, { settingsPath: "config/maintenance.json" })).toThrow(".yaml");
});

test("SSH origins work and an enterprise hostname requires explicit matching identity", () => {
  const f = project(); git(f.root, "remote", "set-url", "origin", "git@github.com:example/project.git");
  expect(loadSettings(f.root).repository).toBe("example/project");
  git(f.root, "remote", "set-url", "origin", "ssh://git@git.company.test/example/project.git");
  expect(() => loadSettings(f.root)).toThrow();
  f.settings({ schema_version: 1, hostname: "git.company.test" });
  expect(loadSettings(f.root).hostname).toBe("git.company.test");
});

test("symlinked output and reference paths cannot escape the checkout", () => {
  const f = project(), outside = mkdtempSync(join(tmpdir(), "vh-maintenance-outside-"));
  try {
    symlinkSync(outside, join(f.root, "escape"));
    f.settings({ schema_version: 1, report_dir: "escape/reports" });
    expect(() => loadSettings(f.root)).toThrow();
    f.settings({ schema_version: 1, source_references: ["escape/secret"] });
    expect(() => loadSettings(f.root)).toThrow();
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("security_settings takes apply or check and keep-off rows name scoped repositories and known settings", () => {
  const f = project();
  expect(loadSettings(f.root).security_settings ?? "check").toBe("check");
  f.settings({ schema_version: 1, security_settings: "apply", repositories: [{ repository: "example/satellite", role: "independent" }],
    security_settings_keep_off: [{ repository: "example/satellite", settings: ["secret_scanning", "dependabot_alerts"], reason: "Owner keeps alerts off here" }] });
  const config = loadSettings(f.root);
  expect(config.security_settings).toBe("apply");
  expect(config.security_settings_keep_off).toEqual([{ repository: "example/satellite", settings: ["secret_scanning", "dependabot_alerts"], reason: "Owner keeps alerts off here" }]);
  f.settings({ schema_version: 1, security_settings: "check" });
  expect(loadSettings(f.root).security_settings).toBe("check");
});

test.each([
  [{ security_settings: "maybe" }, "security_settings"],
  [{ security_settings_keep_off: [{ repository: "example/project", settings: ["code_scanning"], reason: "x" }] }, "security_settings_keep_off settings"],
  [{ security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"] }] }, "security_settings_keep_off reason"],
  [{ security_settings_keep_off: [{ repository: "other/project", settings: ["secret_scanning"], reason: "x" }] }, "outside configured scope"],
  [{ security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"], reason: "x" }, { repository: "example/project", settings: ["dependabot_alerts"], reason: "y" }] }, "security_settings_keep_off duplicates"],
  [{ security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"], reason: "x", note: "extra" }] }, "unsupported fields"],
] as const)("invalid security settings fail naming the field: %j", (data, field) => {
  const f = project(); f.settings({ schema_version: 1, ...data });
  expect(() => loadSettings(f.root)).toThrow(field);
});

test("committed security settings keys keep an adopted standing publication grant", () => {
  const f = project();
  f.write("AGENTS.md", "Use [maintenance settings](.vh-adlc/maintenance.yaml).\n");
  f.settings({ schema_version: 1, report_dir: "reports", project_procedure: "maintenance-project.md", security_settings: "apply",
    security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"], reason: "Owner choice" }] });
  f.write("maintenance-project.md", "## Standing maintenance report publication\n\n| Field | Value |\n| --- | --- |\n| repository | example/project |\n| hostname | github.com |\n| branch | main |\n| publication_route | default-branch-checkout-ff-only |\n| report_dir | reports |\n| index_paths | [] |\n| initial_publication | commit-and-push-before-selection |\n| same_run_updates | commit-and-push |\n");
  git(f.root, "add", "AGENTS.md", ".vh-adlc/maintenance.yaml", "maintenance-project.md"); git(f.root, "commit", "-qm", "docs: adopt");
  const commit = git(f.root, "rev-parse", "HEAD"); git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  const standing = resolveStanding(loadSettings(f.root), { default_branch: "main", default_commit: commit });
  expect(standing.status).toBe("adopted");
});
