import { afterEach, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { inspectAdoptedPolicy, inspectCandidatePolicy } from "../../../plugins/vh-adlc/scripts/audit/authority";
import { settingsYAML } from "../settings-yaml";
import { baseSettings, fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
const loader = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/audit/settings.ts");
const installer = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/ensure-vh-adlc.sh");
const path = ".vh-adlc/audit.yaml";

// Explicit test setup may obtain the locked binary; the audit read itself must stay offline.
beforeAll(() => {
  const run = Bun.spawnSync(["bash", installer], { stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) throw Error("locked reader test setup failed: " + run.stderr.toString());
});
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

function project(value: unknown = baseSettings()) {
  const f = fixture({ configured: false }); projects.push(f);
  f.write(path, settingsYAML(value)); f.write("AGENTS.md", `# Rules\n\nAudit [settings](${path}).\n`);
  f.write("audit-project.md", [
    "# Project audit", "", "## Standing audit workflow authorization", "", "| Field | Value |", "| --- | --- |",
    "| repository | example/project |", "| hostname | github.com |", "| default_branch | main |", "| ledger_path | docs/audit.md |",
    "| status_effects | none |", "| reverify_effects | ledger-update,ledger-commit |", "| full_effects | ledger-update,ledger-commit |",
    "| fix_effects | source-edit,ledger-update,local-commit |", "| selection_policy | #selection |", "| verification_policy | #verification |", "| merge_policy | #merge |",
    "", "## Selection", "Exact IDs only.", "", "## Verification", "All required checks.", "", "## Merge", "No standing remote delivery.", "",
  ].join("\n"));
  const commit = f.commit(); git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  return { f, commit, observed: () => ({ default_branch: "main", default_commit: git(f.root, "rev-parse", "refs/remotes/origin/main") }) };
}
function reason(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return [row.reason, row.limit].filter(item => typeof item === "string").join(" ");
}
function candidate(c: ReturnType<typeof project>, config = loadSettings(c.f.root)) {
  return inspectCandidatePolicy(config, { default_branch: "main", commit: c.commit, observe: c.observed });
}

test("commented block YAML preserves the observed old normalized settings", () => {
  const observed = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/legacy-settings.json"), "utf8")) as { value: Record<string, unknown> };
  const { settings_path: oldPath, ...oldValue } = observed.value;
  const input = { ...observed.value }; delete input.settings_path;
  const c = project(input), before = git(c.f.root, "status", "--porcelain");
  const current: Record<string, unknown> = { ...loadSettings(c.f.root) };
  expect(oldPath).toBe(".vh-adlc/audit.json"); expect(current.settings_path).toBe(path);
  delete current.root; delete current.settings_path; delete current.knowledge_pages;
  expect(current).toEqual(oldValue); expect(git(c.f.root, "status", "--porcelain")).toBe(before);
  const bytes = readFileSync(join(c.f.root, path), "utf8");
  expect(bytes).toMatch(/^#/m); expect(() => JSON.parse(bytes)).toThrow();
});

test("the shared positive fixture writer emits commented YAML at the documented path", () => {
  const f = fixture(); projects.push(f);
  expect(existsSync(join(f.root, ".vh-adlc/audit.json"))).toBe(false);
  expect(existsSync(join(f.root, path))).toBe(true);
  const bytes = readFileSync(join(f.root, path), "utf8");
  expect(bytes).toMatch(/^#/m); expect(() => JSON.parse(bytes)).toThrow();
});

test.each(["json", "yml"])("a leftover %s is refused even with an explicit YAML path", suffix => {
  const c = project(); c.f.write(`.vh-adlc/audit.${suffix}`, "{}\n");
  for (const settingsPath of [undefined, path]) expect(() => loadSettings(c.f.root, { settingsPath })).toThrow(path);
});
test.each([".vh-adlc/audit.json", ".vh-adlc/audit.yml", "config/audit", "config/audit.YAML"])("explicit path %s cannot bypass the YAML contract", settingsPath => {
  const c = project(); c.f.write(settingsPath, settingsYAML(baseSettings()));
  expect(() => loadSettings(c.f.root, { settingsPath })).toThrow(".yaml");
});
test.each([
  "schema_version: 1\nsecret-canary: 1\nsecret-canary: 2\n",
  "schema_version: 1\nsecret-canary: &value 1\n",
])("refused YAML fails without echoing its content", bytes => {
  const c = project(); c.f.write(path, bytes); let message = "";
  try { loadSettings(c.f.root); } catch (error) { message = String(error); }
  expect(message).toContain("settings-reader-refused"); expect(message).not.toContain("secret-canary");
});

test("the exact committed YAML declaration is valid but never adopted or action-granting in candidate mode", () => {
  const c = project(), config = loadSettings(c.f.root), result = candidate(c, config);
  expect(result.valid).toBe(true); expect(result.allowed).toBe(false); expect(result.adopted).toBe(false);
  expect(inspectAdoptedPolicy(config, { refresh: c.observed }).adopted).toBe(true);
});
test("semantically equal YAML with different bytes is not the reviewed configuration", () => {
  const c = project(), config = loadSettings(c.f.root);
  c.f.write(path, readFileSync(join(c.f.root, path), "utf8") + "# Unreviewed comment.\n");
  expect(candidate(c, config).valid).toBe(false);
  expect(inspectAdoptedPolicy(config, { refresh: c.observed }).allowed).toBe(false);
});
test("a stale committed JSON settings link is explicitly unadopted", () => {
  const c = project(), config = loadSettings(c.f.root);
  c.f.write("AGENTS.md", "# Rules\n\n[settings](.vh-adlc/audit.json)\n"); c.commit = c.f.commit();
  git(c.f.root, "update-ref", "refs/remotes/origin/main", c.commit);
  for (const result of [candidate(c, config), inspectAdoptedPolicy(config, { refresh: c.observed })]) {
    expect(result.valid).toBe(false); expect(result.allowed).toBe(false); expect(result.adopted).toBe(false);
    expect(reason(result)).toContain("settings-link-stale");
  }
});
test.each(["json", "yml"])("a committed %s leftover absent from the checkout still blocks policy", suffix => {
  const c = project(), config = loadSettings(c.f.root), leftover = `.vh-adlc/audit.${suffix}`;
  c.f.write(leftover, "{}\n"); c.commit = c.f.commit(); git(c.f.root, "update-ref", "refs/remotes/origin/main", c.commit);
  rmSync(join(c.f.root, leftover));
  for (const result of [candidate(c, config), inspectAdoptedPolicy(config, { refresh: c.observed })]) {
    expect(result.valid).toBe(false); expect(result.allowed).toBe(false);
    expect(reason(result)).toContain("settings-suffix-conflict");
  }
});
test("a referenced ledger must be a regular file in the same reviewed commit", () => {
  const c = project(), config = loadSettings(c.f.root);
  git(c.f.root, "rm", "--cached", "docs/audit.md"); git(c.f.root, "commit", "-qm", "test: missing committed ledger");
  c.commit = git(c.f.root, "rev-parse", "HEAD"); git(c.f.root, "update-ref", "refs/remotes/origin/main", c.commit);
  expect(existsSync(join(c.f.root, "docs/audit.md"))).toBe(true);
  expect(candidate(c, config).valid).toBe(false);
});

function coldReader(c: ReturnType<typeof project>, unverified = false) {
  const home = join(c.f.outer, "cold-home"), bin = join(c.f.outer, "cold-bin"), marker = join(c.f.outer, "unexpected-download");
  mkdirSync(home); mkdirSync(bin);
  for (const name of ["git", "bash", "dirname", "uname", "sed", "awk", "cut", "sha256sum", "shasum", "mktemp", "rm", "mkdir", "tar", "chmod", "cp", "mv"]) {
    const executable = Bun.which(name); if (executable) symlinkSync(executable, join(bin, name));
  }
  if (unverified) {
    const lock = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../plugins/vh-adlc/vh-adlc.lock.json"), "utf8")) as { version: string };
    writeFileSync(join(bin, "vh-adlc"), `#!/bin/sh\nprintf ran > "$HOME/unverified-program-ran"\nprintf 'vh-adlc ${lock.version}\\n'\n`); chmodSync(join(bin, "vh-adlc"), 0o755);
  }
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  writeFileSync(join(bin, "curl"), `#!/bin/sh\nprintf attempted > ${quote(marker)}\nexit 88\n`); chmodSync(join(bin, "curl"), 0o755);
  const script = `import { loadSettings } from ${JSON.stringify(loader)}; try { console.log(JSON.stringify(loadSettings(${JSON.stringify(c.f.root)}))); } catch (error) { console.error(String(error)); process.exit(1); }`;
  const before = git(c.f.root, "status", "--porcelain"), refs = git(c.f.root, "for-each-ref", "--format=%(refname) %(objectname)");
  const run = Bun.spawnSync([process.execPath, "-e", script], {
    env: { BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", HOME: home, XDG_CACHE_HOME: join(home, "cache"), PATH: bin, TMPDIR: c.f.outer, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0", LANG: "C" },
    stdout: "pipe", stderr: "pipe", timeout: 20_000,
  });
  expect(run.exitCode).toBe(1); expect(run.stderr.toString()).toContain("settings-reader-unavailable");
  expect(run.stdout.toString()).toBe(""); expect(existsSync(marker)).toBe(false); expect(readdirSync(home)).toEqual([]);
  expect(git(c.f.root, "status", "--porcelain")).toBe(before); expect(git(c.f.root, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
}
test("an empty isolated binary cache fails offline without a download, cache write, source/index/ref change or fallback", () => coldReader(project()));

test("a same-version unverified PATH binary is refused without download or cache writes", () => coldReader(project(), true));
