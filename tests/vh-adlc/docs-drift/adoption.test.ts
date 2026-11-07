import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectAdoptionBindings, parseComponentPin, verifyCutoverAssembly } from "../../../plugins/vh-adlc/scripts/docs-drift/adoption";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture } from "./publication-fixture";
import { settingsFixture } from "./settings-fixture";
import { hash } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const pin = () => ({ schema_version: 1 as const, source_repository: "fixture/shared", source_commit: "a".repeat(40),
  source_release: "v1.0.0", plugin_version: "0.11.0", component_sha256: hash("fixture component") });
function write(repo: string, path: string, bytes: string | Uint8Array) {
  const file = join(repo, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
}
function commit(repo: string, message: string) {
  readGit(repo, "add", "--", ".");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", message);
  return readGit(repo, "rev-parse", "HEAD").toString().trim();
}
function source() {
  const f = publicationFixture(roots), settings = { ...settingsFixture(),
    component_pin: ".vh-adlc/docs-drift-components/shared.yaml", adoption: { mode: "adopted", record_path: ".vh-adlc/docs-drift-adoptions/fixture.yaml" },
    reports: { ...settingsFixture().reports, workflow_id: 19 } };
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings));
  write(f.repo, settings.component_pin, canonicalJSON(pin()));
  for (const path of [settings.project_procedure, settings.execution.worker_workflow, settings.execution.scheduled_workflow,
    settings.execution.claude_command, settings.runtime_loader.launcher]) write(f.repo, path, "Synthetic protected input " + path + "\n");
  write(f.repo, settings.scanner.script, "Synthetic ordinary detector implementation\n");
  write(f.repo, "docs/guide.md", "Synthetic ordinary document\n");
  return { ...f, configured: settings, candidate: commit(f.repo, "synthetic adopted source candidate") };
}

test("component pins require exact source, release, plugin version and complete payload identity", () => {
  expect(parseComponentPin(pin())).toEqual(pin());
  for (const value of [{ ...pin(), source_commit: "main" }, { ...pin(), source_release: "latest" },
    { ...pin(), plugin_version: "latest" }, { ...pin(), component_sha256: "unknown" },
    { ...pin(), source_repository: "https://example.invalid/shared" }, { ...pin(), approved: true },
    { ...pin(), schema_version: 2 }, { ...pin(), source_release: undefined }]) {
    expect(() => parseComponentPin(value)).toThrow();
  }
});

test("protected inputs use committed source and the existing ordinary/trial/protected classification", () => {
  const f = source();
  const initial = collectAdoptionBindings(f.repo, f.candidate);
  expect(initial.component_pin.value).toEqual(pin());
  const before = captureRepositoryState(f.repo);
  write(f.repo, f.configured.runtime_loader.launcher, "uncommitted launcher replacement\n");
  expect(collectAdoptionBindings(f.repo, f.candidate)).toEqual(initial);
  write(f.repo, f.configured.runtime_loader.launcher, "Synthetic protected input " + f.configured.runtime_loader.launcher + "\n");
  expect(captureRepositoryState(f.repo)).toEqual(before);
  write(f.repo, "docs/guide.md", "Ordinary document correction\n");
  write(f.repo, f.configured.scanner.script, "Updated ordinary detector rules\n");
  const ordinary = { ...f.configured, detector_options: { ...f.configured.detector_options, links: { check_history: false } },
    trial: { definition_path: ".vh-adlc/docs-drift-trials/later.yaml", definition_sha256: hash("dormant trial") } };
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(ordinary));
  const advanced = collectAdoptionBindings(f.repo, commit(f.repo, "ordinary input advance"));
  expect(advanced.protected_sha256).toBe(initial.protected_sha256);
  expect(advanced.source_commit).not.toBe(initial.source_commit);
  write(f.repo, f.configured.runtime_loader.launcher, "Changed protected launcher\n");
  expect(collectAdoptionBindings(f.repo, commit(f.repo, "protected input advance")).protected_sha256).not.toBe(initial.protected_sha256);
});

test("missing or symlinked protected source and malformed pin bytes cannot establish adoption inputs", () => {
  for (const kind of ["missing", "symlink", "malformed-pin"]) {
    const f = source();
    if (kind === "malformed-pin") write(f.repo, f.configured.component_pin, "schema_version: 1\nschema_version: 1\n");
    else {
      rmSync(join(f.repo, f.configured.runtime_loader.launcher));
      if (kind === "symlink") readGit(f.repo, "update-index", "--add", "--cacheinfo", "120000," + readGit(f.repo, "hash-object", "README.md").toString().trim() + "," + f.configured.runtime_loader.launcher);
    }
    const current = kind === "symlink" ? (() => {
      readGit(f.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "synthetic symlink");
      return readGit(f.repo, "rev-parse", "HEAD").toString().trim();
    })() : commit(f.repo, "invalid adoption inputs");
    expect(() => collectAdoptionBindings(f.repo, current)).toThrow();
  }
});

test("cutover assembly allows only the selected record as the exact direct child's change", () => {
  const f = source(), path = f.configured.adoption.record_path;
  write(f.repo, path, "schema_version: 1\nsource_candidate: " + f.candidate + "\n");
  const delivery = commit(f.repo, "record-only cutover child");
  const before = captureRepositoryState(f.repo);
  const assembled = verifyCutoverAssembly({ repo: f.repo, source_candidate: f.candidate, delivery_commit: delivery, record_path: path });
  expect(assembled.source_candidate).toBe(f.candidate);
  expect(assembled.record.path).toBe(path);
  expect(assembled.bindings.source_commit).toBe(f.candidate);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  write(f.repo, "README.md", "unrelated change\n");
  const later = commit(f.repo, "extra change after record");
  expect(() => verifyCutoverAssembly({ repo: f.repo, source_candidate: f.candidate, delivery_commit: later, record_path: path })).toThrow();
});

test("cutover rejects a second changed path even when the selected record is present", () => {
  const f = source(), path = f.configured.adoption.record_path;
  write(f.repo, path, "schema_version: 1\nsource_candidate: " + f.candidate + "\n");
  write(f.repo, "README.md", "unrelated change\n");
  const delivery = commit(f.repo, "mixed cutover child");
  expect(() => verifyCutoverAssembly({ repo: f.repo, source_candidate: f.candidate, delivery_commit: delivery, record_path: path })).toThrow();
});
