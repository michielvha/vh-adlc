import { afterAll, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import * as artifacts from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import * as setup from "../../../plugins/vh-adlc/scripts/docs-drift/trial-setup";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { trialDefinitionFixture } from "./trial-definition-fixture";
import { commit, runtimeIdentity, write } from "./adoption-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function input(bundleFormat: "sha1" | "sha256" = "sha1") {
  const f = trialDefinitionFixture(roots, { bundle_format: bundleFormat }), parent = join(f.root, "trial-output"); mkdirSync(parent, { mode: 0o700 });
  return { f, options: { repo: f.repo, current_default: f.staged, identity: runtimeIdentity, directory: parent } };
}

function commitMetadata(f: ReturnType<typeof trialDefinitionFixture>) {
  f.trial.definition_sha256 = sha256(canonicalJSON(f.definition));
  write(f.repo, f.trial.definition_path, canonicalJSON(f.definition));
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured, publication: { ...f.configured.publication, mode: "staged" }, trial: f.trial }));
  return commit(f.repo, "synthetic setup metadata");
}

test("trial setup imports the exact portable fixture without touching the consumer", () => {
  const { f, options } = input(), before = captureRepositoryState(f.repo);
  const result = setup.prepareTrialFixture(options);
  expect(result.authority).toBe("none");
  expect(result.fixture.source_commit).toBe(f.definition.fixture.source_commit);
  expect(result.fixture.tree).toBe(f.definition.fixture.tree);
  expect(JSON.parse(readFileSync(join(result.root, "preparation.json"), "utf8"))).toEqual(result);
  expect(readGit(result.source, "status", "--porcelain").length).toBe(0);
  expect(readFileSync(join(result.source, "docs/guide.md"), "utf8")).toBe("Synthetic fixture document\n");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("trial setup materializes a SHA-256 fixture independently of the consumer object format", () => {
  const { f, options } = input("sha256"), before = captureRepositoryState(f.repo);
  const result = setup.prepareTrialFixture(options);
  expect(result.fixture.source_commit).toHaveLength(64);
  expect(readGit(result.source, "rev-parse", "--show-object-format").toString().trim()).toBe("sha256");
  expect(result.fixture.tree).toBe(f.definition.fixture.tree);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("trial setup refuses a missing committed bundle without recreating it", () => {
  const { f, options } = input(); rmSync(join(f.repo, f.definition.fixture.bundle.path));
  readGit(f.repo, "add", "--", f.definition.fixture.bundle.path);
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "missing synthetic bundle");
  options.current_default = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  expect(() => setup.prepareTrialFixture(options)).toThrow("committed blob");
});

test("trial setup refuses checksummed bytes that are not a Git bundle", () => {
  const { f, options } = input();
  const bytes = Buffer.from("Synthetic invalid bundle\n");
  write(f.repo, f.definition.fixture.bundle.path, bytes);
  f.definition.fixture.bundle.sha256 = sha256(bytes);
  options.current_default = commitMetadata(f);
  expect(() => setup.prepareTrialFixture(options)).toThrow();
});

test("trial setup refuses a declared tree absent from the bundle", () => {
  const { f, options } = input(); f.definition.fixture.tree = "0".repeat(40);
  options.current_default = commitMetadata(f);
  expect(() => setup.prepareTrialFixture(options)).toThrow("fixture tree");
  const directories = readdirSync(options.directory);
  expect(directories).toHaveLength(1);
  const failed = JSON.parse(readFileSync(join(options.directory, directories[0]!, "setup-failed.json"), "utf8"));
  expect(failed).toMatchObject({ authority: "none", phase: "fixture-tree", reason: "docs-drift trial setup fixture tree",
    fixture_id: f.definition.fixture.id, bundle_sha256: f.definition.fixture.bundle.sha256 });
});

test("a failure to retain diagnostics preserves the original setup error", () => {
  const { f, options } = input(), bin = join(f.root, "git-wrapper"); mkdirSync(bin, { mode: 0o700 });
  const wrapper = join(bin, "git");
  writeFileSync(wrapper, '#!/bin/sh\ncase " $* " in\n  *" bundle verify "*) umask 077; printf synthetic > "$PWD/../setup-failed.json"; exit 17 ;;\nesac\nexec /usr/bin/git "$@"\n');
  chmodSync(wrapper, 0o700);
  const original = process.env.PATH; process.env.PATH = bin + ":" + (original ?? "/usr/bin:/bin");
  let captured: unknown;
  try { setup.prepareTrialFixture(options); }
  catch (error) { captured = error; }
  finally {
    if (original === undefined) delete process.env.PATH;
    else process.env.PATH = original;
  }
  expect(captured).toBeInstanceOf(AggregateError);
  if (!(captured instanceof AggregateError)) throw Error("missing combined setup/recording failure");
  expect(captured.message).toContain("Git collection failed");
  expect(captured.errors).toHaveLength(2);
  expect(captured.cause).toMatchObject({ message: "Git collection failed" });
});

test("trial setup refuses output inside a consumer checkout", () => {
  const { f, options } = input(); options.directory = join(f.repo, "output"); mkdirSync(options.directory, { mode: 0o700 });
  expect(() => setup.prepareTrialFixture(options)).toThrow("overlaps a caller checkout");
});

test("trial setup compares the bundle tree with the declared file map", () => {
  const { f, options } = input();
  f.manifest.files[0]!.target = "docs/different.md";
  write(f.repo, f.definition.fixture.manifest.path, canonicalJSON(f.manifest));
  f.definition.fixture.manifest.sha256 = sha256(canonicalJSON(f.manifest));
  options.current_default = commitMetadata(f);
  const before = captureRepositoryState(f.repo);
  expect(() => setup.prepareTrialFixture(options)).toThrow("fixture manifest differs");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("trial setup refuses another native actor before creating an owned fixture", () => {
  const { options } = input(); options.identity = { ...runtimeIdentity, actor_id: runtimeIdentity.actor_id + 1 };
  expect(() => setup.prepareTrialFixture(options)).toThrow("incomplete docs-drift adoption current native trial identity");
  expect(readdirSync(options.directory)).toEqual([]);
});

test("trial setup requires a native identity from an untyped caller", () => {
  const { options } = input(); Reflect.deleteProperty(options, "identity");
  expect(() => setup.prepareTrialFixture(options)).toThrow("current native trial identity required");
  expect(readdirSync(options.directory)).toEqual([]);
});

test("allocated setup failures retain a Unicode-safe bounded reason", () => {
  const { options } = input(), failure = Error("x".repeat(2047) + "🚀" + "continued reason");
  const original = artifacts.publishArtifact;
  const fault = spyOn(artifacts, "publishArtifact").mockImplementation((path, bytes) => {
    if (basename(path) === "preparation.json") throw failure;
    original(path, bytes);
  });
  let captured: unknown;
  try { setup.prepareTrialFixture(options); }
  catch (error) { captured = error; }
  finally { fault.mockRestore(); }
  expect(captured).toBe(failure);
  const directories = readdirSync(options.directory);
  expect(directories).toHaveLength(1);
  const record = JSON.parse(readFileSync(join(options.directory, directories[0]!, "setup-failed.json"), "utf8"));
  expect(record.reason).toBe("x".repeat(2047) + "🚀");
  expect(record.phase).toBe("finalize");
});

test("repeated setup keeps independently owned exact fixture imports", () => {
  const { options } = input(), first = setup.prepareTrialFixture(options), second = setup.prepareTrialFixture(options);
  expect(first.root).not.toBe(second.root);
  expect(first.fixture).toEqual(second.fixture);
  expect(readGit(first.source, "status", "--porcelain").length).toBe(0);
});

test.each(["hosted", "copilot", "claude"] as const)("mapped trial preparation forwards the explicit %s account selection", entry => {
  const actors = { hosted: "fixture-bot", copilot: "fixture-owner", claude: "fixture-owner" };
  const f = trialDefinitionFixture(roots, { entry_actors: actors }), directory = join(f.root, "mapped-output");
  mkdirSync(directory, { mode: 0o700 });
  const before = captureRepositoryState(f.repo), identity = { ...runtimeIdentity, actor: actors[entry], actor_id: entry === "hosted" ? 20 : 30 };
  const result = setup.prepareTrialFixture({ repo: f.repo, current_default: f.staged, identity, entry, directory });
  expect(result.authority).toBe("none");
  expect(result).toMatchObject({ publisher_entry: entry, identity });
  expect(JSON.parse(readFileSync(join(result.root, "preparation.json"), "utf8"))).toMatchObject({ publisher_entry: entry, identity });
  expect(result.fixture.tree).toBe(f.definition.fixture.tree);
  expect(readGit(result.source, "status", "--porcelain").length).toBe(0);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["trial-bindings", "prepare-trial-fixture"] as const)("normal %s CLI forwards the selected interactive native account", async command => {
  const { nativeReader } = await import("./runtime-fixture");
  const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
  const f = trialDefinitionFixture(roots, { entry_actors: { hosted: "fixture-bot", copilot: "fixture-owner", claude: "fixture-owner" } });
  const directory = join(f.root, "mapped-cli-output"); mkdirSync(directory, { mode: 0o700 });
  const native = nativeReader({ root: f.root, candidate: f.staged }, "fixture-owner", false, false, 30);
  const before = captureRepositoryState(f.repo), argv = [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"),
    command, "--repo", f.repo, "--source", f.staged, "--entry", "copilot"];
  if (command === "prepare-trial-fixture") argv.push("--artifact-root", directory);
  const result = await executeOwnedProcess({ argv, cwd: f.repo,
    env: { PATH: native.environment.PATH!, HOME: process.env.HOME ?? f.root, TMPDIR: process.env.TMPDIR ?? f.root,
      GH_TOKEN: "synthetic-read-token", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" }, capture: "memory", watched_outputs: [], timeout_ms: 30000,
    stdout: join(f.root, command + ".stdout"), stderr: join(f.root, command + ".stderr"), started: () => {} });
  expect(result.reaped).toBe(true); expect(result.timed_out).toBe(false);
  const output = Buffer.from(result.captured?.stdout ?? []).toString();
  expect(result.exit_code, output).toBe(0);
  const report = JSON.parse(output);
  expect(report.outcome).toBe("collected");
  if (command === "trial-bindings") {
    expect(report.trial.publisher_entry).toBe("copilot");
    expect(report.trial.identity).toMatchObject({ actor: "fixture-owner", actor_id: 30 });
  } else expect(report.preparation).toMatchObject({ authority: "none", publisher_entry: "copilot",
    identity: { actor: "fixture-owner", actor_id: 30 } });
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 60000);
