import { settingsYAML } from "../settings-yaml";
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export function git(root: string, ...args: string[]): string {
  const child = Bun.spawnSync(["git", "-C", root, ...args], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0" },
    stdout: "pipe", stderr: "pipe",
  });
  if (child.exitCode !== 0) throw Error("fixture git " + args[0] + " failed: " + child.stderr.toString());
  return child.stdout.toString().trim();
}

export const ledger = [
  "# Example audit", "", "## Severity index", "",
  "| ID | Sev | Finding | Status |", "| --- | --- | --- | --- |",
  "| AUD-001 | High | Incorrect result | OPEN |",
  "| AUD-002 | Low | Historical observation | FIXED |", "",
  "## Findings", "", "### AUD-001 - Incorrect result",
  "The return value needs a current check.", "", "### AUD-002 - Historical observation",
  "Recorded FIXED on an older commit. This text is not fresh verification.", "",
].join("\n");

export function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1, repository: "example/project", hostname: "github.com",
    ledger_path: "docs/audit.md", project_procedure: "audit-project.md", id_prefix: "AUD",
    profile: { name: "markdown-audit-v1", index_heading: "Severity index", finding_level: 3 },
    ...overrides,
  };
}

export function fixture(options: { configured?: boolean } = {}) {
  const outer = realpathSync(mkdtempSync(join(tmpdir(), "vh-audit-")));
  const root = join(outer, "repo");
  mkdirSync(root);
  const artifacts = join(outer, "artifacts");
  mkdirSync(artifacts, { mode: 0o700 });
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.com");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  git(root, "remote", "add", "origin", "https://github.com/example/project.git");
  write("src/app.ts", "export const answer = 42;\n");
  write("docs/audit.md", ledger);
  write("audit-project.md", "# Audit project policy\n\nNo standing publication grant.\n");
  const settings = (value: unknown) => write(".vh-adlc/audit.yaml", settingsYAML(value));
  if (options.configured !== false) settings(baseSettings());
  const commit = (message = "test: seed fixture") => {
    git(root, "add", ".");
    git(root, "commit", "-qm", message);
    return git(root, "rev-parse", "HEAD");
  };
  commit();
  return {
    root, outer, artifacts, write, settings, commit,
    artifact: (name: string, value = "Synthetic fixture observation.\n") => {
      writeFileSync(join(artifacts, name), value, { mode: 0o600 });
      return { path: name, sha256: createHash("sha256").update(value).digest("hex") };
    },
    // This entire directory and its optional sibling worktrees belong to this fixture.
    dispose: () => rmSync(outer, { recursive: true, force: true }),
  };
}


/** Native CLI test transport: observe one real disposable bare default, with no URL/global rewrite. */
export function wireDefault(f:ReturnType<typeof fixture>,commit:string){
 const bare=join(f.outer,"observed-default.git");git(f.root,"init","--bare",bare);
 git(f.root,"--git-dir",bare,"fetch",f.root,commit+":refs/heads/main");git(f.root,"--git-dir",bare,"symbolic-ref","HEAD","refs/heads/main");
 const directory=join(f.outer,"wire-bin");mkdirSync(directory);
 const content="#!/usr/bin/env bun\nconst args=process.argv.slice(2);const forwarded=JSON.stringify(args)===JSON.stringify(['-C',"+JSON.stringify(f.root)+",'ls-remote','--symref','origin','HEAD'])?['ls-remote','--symref',"+JSON.stringify(bare)+",'HEAD']:args;const result=Bun.spawnSync(['/usr/bin/git',...forwarded],{stdout:'inherit',stderr:'inherit'});process.exit(result.exitCode);\n";
 writeFileSync(join(directory,"git"),content);chmodSync(join(directory,"git"),0o700);return directory;
}
