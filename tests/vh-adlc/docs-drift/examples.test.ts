/** The packaged greenfield example runs collection without provider credentials or remote writes. */
import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readYAML } from "../../../plugins/vh-adlc/scripts/settings-file";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { verifyConfiguredWorkerCaller } from "./worker-callers-fixture";
import { readRunDirectory, latestRunArtifact } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { readBoundArtifact } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";

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
  expect(settings.schema_version).toBe(2);
  if (settings.schema_version !== 2) throw Error("Example uses ordinary installed settings");
  expect(settings.publication.mode).toBe("staged");
  expect(settings.component).toBeNull();
  expect(settings.required_detectors).toEqual(["local-links"]);
  expect(settings.credential_references).toEqual([]);
  expect(Object.keys(settings.execution.entries)).toEqual(["hosted", "interactive"]);
  expect(settings.clients.copilot).toEqual({ provider: "copilot", executable: "copilot" });
  expect(settings.execution.secret_mappings).toEqual({});
  for (const entry of Object.values(settings.execution.entries)) {
    expect(entry.worker.identity_source).toEqual({ provider: "copilot", event_type: "assistant.message", field_path: ["data", "model"] });
    expect(entry.reviewer.identity_source).toEqual(entry.worker.identity_source);
  }
  for (const path of [settings.project_procedure, settings.scanner.script,
    settings.execution.worker_workflow, settings.execution.scheduled_workflow, settings.execution.claude_command]) {
    if (path !== null) expect(readFileSync(join(example, path)).length).toBeGreaterThan(0);
  }
});

test.each([
  { name: "present target", missing: false, malformed: false, findings: 0 },
  { name: "missing target", missing: true, malformed: false, findings: 1 },
  { name: "malformed target", missing: false, malformed: true, findings: 1 },
])("the packaged example collects actual Git inputs with a $name", scenario => {
  try {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-example-"))); roots.push(root);
    const repo = join(root, "example with spaces"), artifacts = join(root, "run"), state = join(root, "state");
    cpSync(example, repo, { recursive: true });
    if (scenario.missing) unlinkSync(join(repo, "src/server.ts"));
    if (scenario.malformed) writeFileSync(join(repo, "docs/guide.md"), readFileSync(join(repo, "docs/guide.md"), "utf8") + "\n[Invalid link](a%zz.md)\n");
    readGit(repo, "init", "--template=", "-b", "main");
    readGit(repo, "add", "--all");
    readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Owned packaged example");
    const source = readGit(repo, "rev-parse", "HEAD").toString().trim(), before = captureRepositoryState(repo);
    const completion = Bun.spawnSync([process.execPath, join(repo, "scripts/docs-drift-entry.ts"), "scan", "--repo", repo, "--source", source, "--run-dir", artifacts], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, XDG_STATE_HOME: state, LANG: "C", LC_ALL: "C", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DOCS_DRIFT_PLUGIN_DIR: plugin },
      stdout: "pipe", stderr: "pipe", timeout: 30000,
    });
    expect(completion.exitCode).toBe(0);
    const report = JSON.parse(completion.stdout.toString());
    expect(report).toMatchObject({ command: "scan", outcome: "collected", counts: { findings: scenario.findings } });
    const run = readRunDirectory({ repo, directory: artifacts, origins: join(state, "vh-adlc/docs-drift/origins") });
    const reference = latestRunArtifact(run, "source_verification");
    if (!reference) throw Error("Example must retain its original scanner verification");
    const collected = JSON.parse(readBoundArtifact({ source_repo: repo, artifact_root: artifacts, reference }).toString());
    expect(collected.complete).toBe(true);
    expect(collected.scan.documents.map((row: { path: string }) => row.path)).toEqual(["docs/guide.md"]);
    expect(collected.scan.findings).toHaveLength(scenario.findings);
    if (scenario.findings) expect(collected.scan.findings[0]).toMatchObject({ detector: "local-links", document: "docs/guide.md" });
    if (scenario.malformed) {
      expect(collected.scan.documents[0].status).toBe("complete");
      expect(collected.scan.detectors[0].outcome).toBe("complete");
    }
    expect(captureRepositoryState(repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 45000);

test("the collection example binds the original committed component and rejects a changed digest", () => {
  try {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-pin-example-"))); roots.push(root);
    const repo = join(root, "consumer"); cpSync(example, repo, { recursive: true });
    const componentRepo = resolve(plugin, "../.."), componentSource = readGit(componentRepo, "rev-parse", "HEAD").toString().trim();
    const identity = computeComponentIdentity(componentRepo, componentSource);
    const component = { source_commit: componentSource, plugin_version: identity.plugin_version, component_sha256: identity.component_sha256 };
    const settings = readYAML(readFileSync(join(example, ".vh-adlc/docs-drift.yaml")), reason => { throw Error(reason); }, { offline: true });
    if (settings === null || typeof settings !== "object" || Array.isArray(settings)) throw Error("Example settings mapping required");
    expect(parseSettings(settings).schema_version).toBe(2);
    readGit(repo, "init", "--template=", "-b", "main");
    for (const changed of [false, true]) {
      writeFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), JSON.stringify({ ...settings,
        component: { ...component, component_sha256: changed ? "f".repeat(64) : component.component_sha256 } }) + "\n");
      readGit(repo, "add", "--all");
      readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Owned component pin example");
      const source = readGit(repo, "rev-parse", "HEAD").toString().trim(), before = captureRepositoryState(repo);
      const run = Bun.spawnSync([process.execPath, join(repo, "scripts/check-component.ts"), "--repo", repo, "--source", source,
        "--component-repo", componentRepo, "--component-source", componentSource], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DOCS_DRIFT_PLUGIN_DIR: plugin },
        stdout: "pipe", stderr: "pipe", timeout: 30000,
      });
      expect(run.exitCode, run.stderr.toString()).toBe(changed ? 2 : 0);
      if (!changed) expect(JSON.parse(run.stdout.toString())).toMatchObject({ outcome: "component-matched", authority: "none", component_sha256: identity.component_sha256 });
      expect(captureRepositoryState(repo)).toEqual(before);
    }
  } catch (error) { failed = true; throw error; }
}, 45000);

test("the staged collection workflow keeps explicit read-only caller permissions and credential-free collection", () => {
  const fail = (reason: string): never => { throw Error(reason); };
  const settings = parseSettings(readYAML(readFileSync(join(example, ".vh-adlc/docs-drift.yaml")), fail, { offline: true }));
  if (!settings.execution.scheduled_workflow || !settings.execution.worker_workflow) throw Error("Example requires both workflow paths");
  const workerPath = settings.execution.worker_workflow;
  const callerBytes = readFileSync(join(example, settings.execution.scheduled_workflow));
  const worker = readYAML(readFileSync(join(example, settings.execution.worker_workflow)), fail, { offline: true }) as any;
  const caller = readYAML(callerBytes, fail, { offline: true }) as any;
  expect(Object.keys(caller.on)).toEqual(["workflow_dispatch"]);
  expect(Object.keys(worker.on)).toEqual(["workflow_call"]);
  expect(worker.permissions).toEqual({ contents: "read", actions: "read" });
  expect(() => verifyConfiguredWorkerCaller({ bytes: callerBytes, worker_path: workerPath,
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
