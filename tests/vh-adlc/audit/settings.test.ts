import { afterEach, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { baseSettings, fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
function project(configured = true) {
  const f = fixture({ configured }); projects.push(f); return f;
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("missing audit settings gives an onboarding handoff without creating files or changing Git", () => {
  const f = project(false), before = git(f.root, "status", "--porcelain");
  expect(() => loadSettings(f.root)).toThrow("setup required");
  expect(existsSync(join(f.root, ".vh-adlc"))).toBe(false);
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

test("strict settings bind the existing ledger and local procedure to normalized Git origin", () => {
  const f = project();
  f.settings(baseSettings({ repository: "EXAMPLE/Project", hostname: "GITHUB.com" }));
  const before = git(f.root, "status", "--porcelain"), config = loadSettings(f.root);
  expect(config.root).toBe(f.root);
  expect(config.repository).toBe("example/project");
  expect(config.hostname).toBe("github.com");
  expect(config.ledger_path).toBe("docs/audit.md");
  expect(config.project_procedure).toBe("audit-project.md");
  expect(config.id_prefix).toBe("AUD");
  expect(config.profile.finding_level).toBe(3);
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

test.each([
  null, [], { schema_version: 2 }, baseSettings({ command: "untrusted-value" }),
  baseSettings({ repository: "other/project" }), baseSettings({ hostname: "other.example" }),
  baseSettings({ ledger_path: "../outside.md" }), baseSettings({ ledger_path: ".git/config" }),
  baseSettings({ ledger_path: "absent.md" }), baseSettings({ ledger_path: "src" }),
  baseSettings({ project_procedure: "absent.md" }), baseSettings({ id_prefix: ".*" }),
  baseSettings({ profile: { name: "unknown", index_heading: "Index", finding_level: 3 } }),
  baseSettings({ profile: { name: "markdown-audit-v1", index_heading: "", finding_level: 3 } }),
  baseSettings({ profile: { name: "markdown-audit-v1", index_heading: "Index", finding_level: 1 } }),
  baseSettings({ profile: { name: "markdown-audit-v1", index_heading: "Index", finding_level: 3, execute: "untrusted-value" } }),
].map(value => [value]))("malformed, unsupported, conflicting and unsafe settings are refused: %j", value => {
  const f = project(); f.settings(value);
  expect(() => loadSettings(f.root)).toThrow();
});

test("symlink escapes are refused for configuration, ledger and project procedure", () => {
  for (const kind of ["settings", "ledger_path", "project_procedure"]) {
    const f = project(false), outside = join(f.outer, "outside.md");
    writeFileSync(outside, kind === "settings" ? JSON.stringify(baseSettings()) : "# Outside\n");
    mkdirSync(join(f.root, ".vh-adlc"), { recursive: true });
    if (kind === "settings") symlinkSync(outside, join(f.root, ".vh-adlc/audit.json"));
    else {
      symlinkSync(outside, join(f.root, "escape.md"));
      f.settings(baseSettings({ [kind]: "escape.md" }));
    }
    expect(() => loadSettings(f.root)).toThrow();
  }
});

test("invalid input and credential-bearing origins never echo their values", () => {
  const f = project();
  f.write(".vh-adlc/audit.json", "do-not-echo-this-secret");
  let failure: unknown;
  try { loadSettings(f.root); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain("do-not-echo-this-secret");
  f.settings(baseSettings());
  git(f.root, "remote", "set-url", "origin", "https://do-not-echo-this-secret@github.com/example/project.git");
  failure = undefined;
  try { loadSettings(f.root); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain("do-not-echo-this-secret");
});

test("SSH and explicitly configured enterprise origin retain their actual identity", () => {
  const f = project(); git(f.root, "remote", "set-url", "origin", "git@github.com:example/project.git");
  expect(loadSettings(f.root).repository).toBe("example/project");
  git(f.root, "remote", "set-url", "origin", "https://git.example.test/example/project.git");
  f.settings(baseSettings({ hostname: "git.example.test" }));
  expect(loadSettings(f.root).hostname).toBe("git.example.test");
});

test("a public owner-login HTTPS prefix identifies the same repository without changing the configured transport or neutral helpers", () => {
  const f = project(), remote = "https://example@github.com/example/project.git";
  git(f.root, "remote", "set-url", "origin", remote);
  const config = loadSettings(f.root);
  expect(config.repository).toBe("example/project"); expect(config.hostname).toBe("github.com");
  expect(git(f.root, "remote", "get-url", "origin")).toBe(remote);
});
test.each(["https://other-login@github.com/example/project.git", "https://example:private-value@github.com/example/project.git", "https://example@github.com/example/project.git?token=private-value"])("userinfo outside the public owner-login exception is refused without disclosure", remote => {
  const f = project(); git(f.root, "remote", "set-url", "origin", remote);
  let failure: unknown; try { loadSettings(f.root); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error); expect(String(failure)).not.toContain(remote); expect(String(failure)).not.toContain("private-value");
});

test("a standalone adopter can copy the complete example and load all referenced files", () => {
  const f = project(), example = resolve(import.meta.dir, "../../../plugins/vh-adlc/examples/audit/basic");
  cpSync(example, f.root, { recursive: true });
  const config = loadSettings(f.root);
  expect(readFileSync(join(f.root, config.ledger_path), "utf8")).toContain("AUD-001");
  expect(readFileSync(join(f.root, config.project_procedure), "utf8")).toContain("No standing");
});
