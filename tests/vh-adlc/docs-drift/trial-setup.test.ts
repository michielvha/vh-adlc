import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as setup from "../../../plugins/vh-adlc/scripts/docs-drift/trial-setup";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { trialDefinitionFixture } from "./trial-definition-fixture";
import { commit, runtimeIdentity, write } from "./adoption-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function input() {
  const f = trialDefinitionFixture(roots), parent = join(f.root, "trial-output"); mkdirSync(parent, { mode: 0o700 });
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
  expect(readGit(result.source, "status", "--porcelain").length).toBe(0);
  expect(readFileSync(join(result.source, "docs/guide.md"), "utf8")).toBe("Synthetic fixture document\n");
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
  expect(() => setup.prepareTrialFixture(options)).toThrow("current native trial identity");
});

test("repeated setup keeps independently owned exact fixture imports", () => {
  const { options } = input(), first = setup.prepareTrialFixture(options), second = setup.prepareTrialFixture(options);
  expect(first.root).not.toBe(second.root);
  expect(first.fixture).toEqual(second.fixture);
  expect(readGit(first.source, "status", "--porcelain").length).toBe(0);
});
