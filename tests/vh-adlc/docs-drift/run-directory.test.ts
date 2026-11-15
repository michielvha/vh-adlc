import { afterAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRunDirectory, readRunDirectory, appendRunStage } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { installedSettingsFixture } from "./settings-fixture";
import { publicationFixture } from "./publication-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const f = publicationFixture(roots), directory = join(f.root, "run"), origins = join(f.root, "host-origins");
  mkdirSync(join(f.repo, ".vh-adlc"), { recursive: true });
  const settings = installedSettingsFixture();
  writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), JSON.stringify(settings));
  for (const path of [settings.scanner.script, settings.project_procedure, ...settings.feedback_files]) {
    const target = join(f.repo, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "Owned fixture input\n");
  }
  readGit(f.repo, "add", "--all");
  readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Owned ordinary policy");
  const source = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  return { ...f, input: { repo: f.repo, source, directory, origins, entry: "interactive" } };
}

test("a run retains immutable policy and bounded stage artifacts without granting effects", () => {
  const f = fixture(), run = createRunDirectory(f.input);
  expect(run.origin).toBe("original");
  expect(run.authority).toBe("none");
  expect(run.manifest.bun_version).toBe(Bun.version);
  const bytes = canonicalJSON({ complete: true, findings: [] });
  writeFileSync(join(f.input.directory, "scan-result.json"), bytes, { mode: 0o600 });
  const stage = appendRunStage(run, { command: "scan", state: "complete", artifacts: { scan: { path: "scan-result.json", sha256: sha256(bytes) } } });
  const reopened = readRunDirectory(f.input);
  expect(reopened.stages).toEqual([stage]);
  expect(reopened.manifest.settings_sha256).toBe(run.manifest.settings_sha256);
  expect(() => appendRunStage(run, { command: "report", state: "complete", artifacts: {} })).toThrow("changed");
});

test("a copied directory remains observation-only even with matching run metadata", () => {
  const f = fixture(), original = createRunDirectory(f.input), copy = join(f.root, "copy");
  cpSync(f.input.directory, copy, { recursive: true });
  const observer = readRunDirectory({ ...f.input, directory: copy });
  expect(observer.manifest).toEqual(original.manifest);
  expect(observer.origin).toBe("observation-only");
  expect(() => appendRunStage(observer, { command: "publish", state: "pending", artifacts: {} })).toThrow("original");
  expect(readFileSync(join(copy, "run.json"))).toEqual(readFileSync(join(f.input.directory, "run.json")));
});

test("changed retained artifacts stop inspection and never replace the original reference", () => {
  const f = fixture(), run = createRunDirectory(f.input), bytes = canonicalJSON({ complete: true });
  writeFileSync(join(f.input.directory, "role.json"), bytes, { mode: 0o600 });
  appendRunStage(run, { command: "verify", state: "pending", artifacts: { worker: { path: "role.json", sha256: sha256(bytes) } } });
  writeFileSync(join(f.input.directory, "role.json"), "changed");
  expect(() => readRunDirectory(f.input)).toThrow("changed");
});

test.each(["run", "origins"] as const)("a %s path in the caller is rejected before creating anything", kind => {
  const f = fixture(), path = join(f.repo, "unexpected");
  expect(() => createRunDirectory({ ...f.input, [kind === "run" ? "directory" : "origins"]: path })).toThrow("overlaps");
  expect(existsSync(path)).toBe(false);
});

test("missing host ownership leaves the surviving directory observation-only", () => {
  const f = fixture();
  createRunDirectory(f.input);
  rmSync(f.input.origins, { recursive: true });
  const run = readRunDirectory(f.input);
  expect(run.origin).toBe("observation-only");
  expect(() => appendRunStage(run, { command: "publish", state: "pending", artifacts: {} })).toThrow("original");
});

test.each(["schema", "source", "settings", "read-set", "entry"] as const)("run inspection refuses a changed %s binding", field => {
  const f = fixture();
  const run = createRunDirectory(f.input);
  const path = join(f.input.directory, "run.json"), value: Record<string, unknown> = { ...run.manifest };
  if (field === "schema") value.schema_version = 999;
  if (field === "source") value.source_commit = "a".repeat(40);
  if (field === "settings") value.settings_sha256 = "a".repeat(64);
  if (field === "read-set") value.read_set_sha256 = "a".repeat(64);
  if (field === "entry") value.entry = "unconfigured";
  writeFileSync(path, canonicalJSON(value));
  expect(() => readRunDirectory(f.input)).toThrow();
});
