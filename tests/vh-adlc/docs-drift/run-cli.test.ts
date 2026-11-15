import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-run-cli-"))), repo = join(root, "source"), directory = join(root, "run");
  roots.push(root);
  cpSync(resolve(import.meta.dir, "../../../plugins/vh-adlc/examples/docs-drift/basic"), repo, { recursive: true });
  readGit(repo, "init", "--template=", "-b", "main");
  readGit(repo, "add", "--all");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Owned ordinary example");
  return { root, repo, directory, source: readGit(repo, "rev-parse", "HEAD").toString().trim() };
}
function invoke(f: ReturnType<typeof fixture>, command: string, extra: string[] = []) {
  const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"),
    command, "--repo", f.repo, "--run-dir", f.directory, ...extra], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, XDG_STATE_HOME: join(f.root, "state"), BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    stdout: "pipe", stderr: "pipe", timeout: 60000,
  });
  const parsed: unknown = JSON.parse(result.stdout.toString());
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("CLI report object required");
  return { status: result.exitCode, report: parsed as Record<string, unknown> };
}

test("normal scan and report retain their inputs in one external directory", () => {
  const f = fixture(), before = captureRepositoryState(f.repo);
  const scan = invoke(f, "scan", ["--source", f.source]);
  expect(scan.status).toBe(0);
  expect(scan.report).toMatchObject({ command: "scan", outcome: "collected", source_commit: f.source, authority: "none" });
  const manifest: unknown = JSON.parse(readFileSync(join(f.directory, "run.json"), "utf8"));
  expect(manifest).toMatchObject({ settings_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  const report = invoke(f, "report");
  expect(report.status).toBe(1);
  expect(report.report).toMatchObject({ command: "report", outcome: "pending", counts: { findings: 0 } });
  expect(report.report.summary).toContain("review");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["resolve", "prepare", "verify", "publish", "close"])("normal %s exposes missing prerequisites without invoking a provider or publishing", command => {
  const f = fixture();
  expect(invoke(f, "scan", ["--source", f.source]).status).toBe(0);
  const result = invoke(f, command);
  expect(result.status).toBe(2);
  expect(result.report).toMatchObject({ command, outcome: "setup-required", authority: "none" });
  expect(Array.isArray(result.report.diagnostics)).toBe(true);
  expect(result.report.diagnostics).not.toHaveLength(0);
});

test("resume inspects a surviving run using its recorded source", () => {
  const f = fixture();
  expect(invoke(f, "scan", ["--source", f.source]).status).toBe(0);
  const resumed = invoke(f, "resume", ["--action", "inspect"]);
  expect(resumed.status).toBe(0);
  expect(resumed.report).toMatchObject({ command: "resume", outcome: "collected", source_commit: f.source, stage: "scan" });
});

test("a failed scan can retry in the same directory while preserving its original stage", () => {
  const f = fixture(), scanner = join(f.repo, "scripts/docs-scan.mjs"), marker = join(f.root, "first-scan");
  const program = 'import { existsSync as attemptExists, writeFileSync as recordAttempt } from "node:fs";\n'
    + "if (!attemptExists(" + JSON.stringify(marker) + ")) { recordAttempt(" + JSON.stringify(marker) + ', "attempted"); process.exit(17); }\n';
  writeFileSync(scanner, program + readFileSync(scanner, "utf8"));
  readGit(f.repo, "add", "--all");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Owned transient scanner");
  f.source = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  expect(invoke(f, "scan", ["--source", f.source]).status).toBe(2);
  const path = join(f.directory, "stages/0000000001.json"), first = readFileSync(path);
  expect(invoke(f, "scan").status).toBe(0);
  expect(readFileSync(path)).toEqual(first);
  expect(readdirSync(join(f.directory, "stages"))).toEqual(["0000000001.json", "0000000002.json"]);
});

test("an explicitly changed execution profile cannot silently reuse a run", () => {
  const f = fixture();
  expect(invoke(f, "scan", ["--source", f.source]).status).toBe(0);
  const result = invoke(f, "resume", ["--entry", "hosted"]);
  expect(result.status).toBe(2);
  expect(result.report.diagnostics).toEqual([expect.stringContaining("profile")]);
});

test("static collection records a component mismatch while retaining its scan", () => {
  const f = fixture(), path = join(f.repo, ".vh-adlc/docs-drift.yaml");
  // The packaged settings are YAML. Change only its unset component binding.
  writeFileSync(path, readFileSync(path, "utf8").replace("component: null", "component:\n  plugin_version: 0.0.0\n  source_commit: " + "a".repeat(40) + "\n  component_sha256: " + "f".repeat(64)));
  readGit(f.repo, "add", "--all");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Owned mismatched component binding");
  f.source = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  const result = invoke(f, "scan", ["--source", f.source]);
  expect(result.status).toBe(0);
  expect(result.report.diagnostics).toEqual([expect.stringContaining("component")]);
  expect(invoke(f, "publish").report.outcome).toBe("setup-required");
});
