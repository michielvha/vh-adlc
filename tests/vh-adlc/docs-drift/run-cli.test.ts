import { afterAll, expect, test } from "bun:test";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { fixture as manifestFixture, bindings, hash } from "./manifest-fixture";
import { createJournal, sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";

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
function invoke(f: ReturnType<typeof fixture>, command: string, extra: string[] = [], state = join(f.root, "state"), nativePath = process.env.PATH) {
  const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"),
    command, "--repo", f.repo, "--run-dir", f.directory, ...extra], {
    env: { PATH: nativePath, HOME: process.env.HOME, XDG_STATE_HOME: state, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    stdout: "pipe", stderr: "pipe", timeout: 60000,
  });
  const parsed: unknown = JSON.parse(result.stdout.toString());
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("CLI report object required");
  return { status: result.exitCode, report: parsed as Record<string, unknown> };
}

test.each(["several-consolidations", "missing-consolidation", "missing-originals", "ambiguous-resume-operation"])("normal option refusals precede run creation: %s", fault => {
  const f = fixture(), command = fault === "missing-originals" ? "resolve" : fault === "ambiguous-resume-operation" ? "resume" : "close";
  const extra = fault === "ambiguous-resume-operation" ? ["--operation-id", "known-operation"] : ["--source", f.source,
    ...(fault === "several-consolidations" ? ["--proposal", "1", "--proposal", "2"] : [])];
  const result = invoke(f, command, extra);
  expect(result.status).toBe(2); expect(result.report.diagnostics).not.toEqual([]);
  expect(existsSync(f.directory)).toBe(false);
});

test.each(["unknown-field", "malformed"])("committed policy errors have a setup outcome before any run is created: %s", fault => {
  const f = fixture(), path = join(f.repo, ".vh-adlc/docs-drift.yaml");
  writeFileSync(path, fault === "malformed" ? "schema_version: [\n" : readFileSync(path, "utf8") + "\nunexpected_setup_field: true\n");
  readGit(f.repo, "add", "--all");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Invalid synthetic setup");
  f.source = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  const result = invoke(f, "scan", ["--source", f.source]);
  expect(result.status).toBe(2); expect(result.report).toMatchObject({ outcome: "setup-required" });
  expect(existsSync(f.directory)).toBe(false);
});

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

test.each(["resolve", "prepare", "verify", "publish", "close"])("a copied run refuses normal %s before adding an executing stage", command => {
  const f = fixture(), caller = captureRepositoryState(f.repo);
  expect(invoke(f, "scan", ["--source", f.source]).status).toBe(0);
  const copy = { ...f, directory: join(f.root, "copied-run") };
  cpSync(f.directory, copy.directory, { recursive: true });
  const original = readFileSync(join(copy.directory, "run.json")), stages = readdirSync(join(copy.directory, "stages"));
  const result = invoke(copy, command);
  expect(result.status).toBe(2);
  expect(result.report).toMatchObject({ command, outcome: "setup-required", diagnostics: [expect.stringContaining("original host ownership")] });
  expect(readFileSync(join(copy.directory, "run.json"))).toEqual(original);
  expect(readdirSync(join(copy.directory, "stages"))).toEqual(stages);
  expect(captureRepositoryState(f.repo)).toEqual(caller);
});

test("an existing XDG state alias preserves original ownership through normal scan and resume", () => {
  const f = fixture(), state = join(f.root, "state"), alias = join(f.root, "state-alias");
  mkdirSync(state, { mode: 0o700 });
  symlinkSync(state, alias);
  expect(invoke(f, "scan", ["--source", f.source], alias).status).toBe(0);
  const resumed = invoke(f, "resume", ["--action", "inspect"], alias);
  expect(resumed.status).toBe(0);
  expect(resumed.report.summary).toContain("Original run retained");
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

function retainedBytes(directory: string): unknown[] {
  return readdirSync(directory).sort().map(name => {
    const path = join(directory, name), stat = lstatSync(path);
    return [name, stat.mode, stat.isDirectory() ? retainedBytes(path) : readFileSync(path).toString("base64")];
  });
}
test.each(["absent", "original"])("receipt retirement matches unknown-action parsing with an %s run", kind => {
  const f = fixture(), bin = join(f.root, "native-bin"), calls = join(f.root, "transport-calls");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), "#!/usr/bin/env bun\nimport { appendFileSync } from 'node:fs'; appendFileSync(" + JSON.stringify(calls) + ", 'called'); process.exit(94);\n", { mode: 0o755 });
  const nativePath = bin + ":" + process.env.PATH;
  if (kind === "original") {
    expect(invoke(f, "scan", ["--source", f.source], join(f.root, "state"), nativePath).status).toBe(0);
    const input = manifestFixture({ ...bindings, source_commit: f.source }, [], "unsupported-action");
    createJournal({ source_repo: f.repo, artifact_root: f.directory, plan: sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
      adoption_sha256: hash("diagnostic"), publication_kind: "advisory", context: "production", transport: "native", corrections: [], attention: [] }) });
  }
  const before = existsSync(f.directory) ? retainedBytes(f.directory) : null;
  for (const action of ["unsupported-action", "retire-receipt"]) {
    const result = invoke(f, "resume", ["--action", action], join(f.root, "state"), nativePath);
    expect(result.status).toBe(2);
    expect(result.report).toMatchObject({ command: "resume", outcome: "incomplete", diagnostics: ["Select a supported resume action."] });
    expect(existsSync(f.directory) ? retainedBytes(f.directory) : null).toEqual(before);
    expect(existsSync(calls)).toBe(false);
  }
});
