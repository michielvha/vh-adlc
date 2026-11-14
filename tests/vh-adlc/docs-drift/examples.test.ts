/** The packaged greenfield example runs collection without provider credentials or remote writes. */
import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readYAML } from "../../../plugins/vh-adlc/scripts/settings-file";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { verifyConfiguredWorkerCaller } from "../../../plugins/vh-adlc/scripts/docs-drift/worker-callers";

const plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc");
const example = join(plugin, "examples/docs-drift/basic");
const roots: string[] = [];
let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed docs-drift example roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("the complete example settings pass the production strict reader and stay staged", () => {
  const settings = parseSettings(readYAML(readFileSync(join(example, ".vh-adlc/docs-drift.yaml")), reason => { throw Error(reason); }, { offline: true }));
  expect(settings.publication.mode).toBe("staged");
  expect(settings.component_pin).toBeNull();
  expect(settings.required_detectors).toEqual(["local-links"]);
  expect(settings.runtime_loader.automatic_updates).toBe(false);
  expect(settings.runtime_loader.ambient_discovery).toBe(false);
  expect(settings.execution.secret_mappings).toEqual({});
  for (const path of [settings.project_procedure, settings.scanner.script, settings.runtime_loader.launcher,
    settings.execution.worker_workflow, settings.execution.scheduled_workflow, settings.execution.claude_command])
    expect(readFileSync(join(example, path)).length).toBeGreaterThan(0);
});

test.each([false, true])("the packaged example collects actual Git inputs and local-link findings, missing target %s", missing => {
  try {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-example-"))); roots.push(root);
    const repo = join(root, "example with spaces"), artifacts = join(root, "artifacts");
    cpSync(example, repo, { recursive: true }); mkdirSync(artifacts, { mode: 0o700 });
    if (missing) unlinkSync(join(repo, "src/server.ts"));
    readGit(repo, "init", "--template=", "-b", "main");
    readGit(repo, "add", "--all");
    readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Owned packaged example");
    const source = readGit(repo, "rev-parse", "HEAD").toString().trim(), before = captureRepositoryState(repo);
    const completion = Bun.spawnSync([process.execPath, join(repo, "scripts/docs-drift-entry.ts"), "scan", "--repo", repo, "--source", source, "--artifact-root", artifacts], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", LC_ALL: "C", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DOCS_DRIFT_PLUGIN_DIR: plugin },
      stdout: "pipe", stderr: "pipe", timeout: 30000,
    });
    expect(completion.exitCode).toBe(0);
    const report = JSON.parse(completion.stdout.toString());
    expect(report).toMatchObject({ command: "scan", outcome: "collected", assessment: { complete: true } });
    expect(report.assessment.documents.map((row: { path: string }) => row.path)).toEqual(["docs/guide.md"]);
    expect(report.assessment.findings).toHaveLength(missing ? 1 : 0);
    if (missing) expect(report.assessment.findings[0]).toMatchObject({ detector: "local-links", document: "docs/guide.md" });
    expect(captureRepositoryState(repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 45000);

test("the collection example binds the original committed component and rejects a changed digest", () => {
  try {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-pin-example-"))); roots.push(root);
    const repo = join(root, "consumer"); cpSync(example, repo, { recursive: true });
    const componentRepo = resolve(plugin, "../.."), componentSource = readGit(componentRepo, "rev-parse", "HEAD").toString().trim();
    const identity = computeComponentIdentity(componentRepo, componentSource);
    const pin = { schema_version: 1, source_repository: "michielvha/vh-adlc", source_commit: componentSource,
      source_release: "v0.0.0-example", plugin_version: identity.plugin_version, component_sha256: identity.component_sha256 };
    const pinPath = ".vh-adlc/docs-drift-components/collection.yaml";
    readGit(repo, "init", "--template=", "-b", "main");
    for (const changed of [false, true]) {
      writeFileSync(join(repo, pinPath), JSON.stringify({ ...pin, component_sha256: changed ? "f".repeat(64) : pin.component_sha256 }) + "\n");
      readGit(repo, "add", "--all");
      readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Owned component pin example");
      const source = readGit(repo, "rev-parse", "HEAD").toString().trim(), before = captureRepositoryState(repo);
      const run = Bun.spawnSync([process.execPath, join(repo, "scripts/check-component.ts"), "--repo", repo, "--source", source,
        "--component-repo", componentRepo, "--component-source", componentSource, "--component-pin", pinPath], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DOCS_DRIFT_PLUGIN_DIR: plugin },
        stdout: "pipe", stderr: "pipe", timeout: 30000,
      });
      expect(run.exitCode).toBe(changed ? 2 : 0);
      if (!changed) expect(JSON.parse(run.stdout.toString())).toMatchObject({ outcome: "component-matched", authority: "none", component_sha256: identity.component_sha256 });
      expect(captureRepositoryState(repo)).toEqual(before);
    }
  } catch (error) { failed = true; throw error; }
}, 45000);

test("the staged collection workflow keeps explicit read-only caller permissions and credential-free collection", () => {
  const fail = (reason: string): never => { throw Error(reason); };
  const settings = parseSettings(readYAML(readFileSync(join(example, ".vh-adlc/docs-drift.yaml")), fail, { offline: true }));
  const callerBytes = readFileSync(join(example, settings.execution.scheduled_workflow));
  const worker = readYAML(readFileSync(join(example, settings.execution.worker_workflow)), fail, { offline: true }) as any;
  const caller = readYAML(callerBytes, fail, { offline: true }) as any;
  expect(Object.keys(caller.on)).toEqual(["workflow_dispatch"]);
  expect(Object.keys(worker.on)).toEqual(["workflow_call"]);
  expect(worker.permissions).toEqual({ contents: "read", actions: "read" });
  expect(() => verifyConfiguredWorkerCaller({ bytes: callerBytes, worker_path: settings.execution.worker_workflow,
    permissions: settings.execution.permissions, secret_mappings: settings.execution.secret_mappings })).not.toThrow();
  expect(JSON.stringify(worker)).not.toContain("secrets.");
  const checkouts = worker.jobs.collect.steps.filter((step: any) => step.uses?.startsWith("actions/checkout@"));
  expect(checkouts).toHaveLength(2);
  expect(checkouts.every((step: any) => step.with["persist-credentials"] === false)).toBe(true);
});

test("Linux and macOS CI check the declared docs-drift types and reproducible bundle", () => {
  const workflow = readYAML(readFileSync(resolve(plugin, "../../.github/workflows/ci.yml")), reason => { throw Error(reason); }, { offline: true }) as any;
  for (const name of ["checker", "checker-macos"]) {
    const commands = workflow.jobs[name].steps.map((step: any) => step.run ?? "").join("\n");
    expect(commands).toContain("bun run --cwd plugins/vh-adlc/scripts/docs-drift typecheck");
    expect(commands).toContain("bun plugins/vh-adlc/scripts/docs-drift/build-zip.ts --check");
  }
});
