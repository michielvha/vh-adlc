import { afterAll, expect, spyOn, test } from "bun:test";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPreparation, prepareEdits } from "../../../plugins/vh-adlc/scripts/docs-drift/preparation";
import type { Edit } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";
import * as ownedProcess from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import * as artifacts from "../../../plugins/vh-adlc/scripts/docs-drift/journal";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function fixture(fault = "none", format: "sha1" | "sha256" = "sha1") {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-preparation-"))); roots.push(repo);
  git(repo, "init", "--template=", "--object-format=" + format, "-b", "main");
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify(fault)).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  const f = populateRepository(repo, false, scanner), bytes = Buffer.from("# Guide\n");
  const edit: Edit = { id: "guide-fix", path: "docs/guide.md", action: "replace", start: 0, end: bytes.length,
    before_sha256: sha256(bytes), replacement_base64: Buffer.from("# Current guide\n").toString("base64"), after_mode: "100644" };
  return { ...f, edit, selection: { schema_version: 1, source_commit: f.commit, edits: [edit] } };
}

function prepareOptions(f: ReturnType<typeof fixture>) {
  const artifacts = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-prepared-output-"))); roots.push(artifacts);
  return { repo: f.repo, source: f.commit, selection: f.selection, artifact_root: artifacts, owner: "fixture-owner", run: "fixture-prepare" };
}

test("edit inspection deduplicates equivalent postimages while preserving caller state", () => {
  const f = fixture(), before = captureRepositoryState(f.repo);
  const result = inspectPreparation({ repo: f.repo, source: f.commit, selection: { ...f.selection, edits: [f.edit, { ...f.edit, id: "same-fix" }] } });
  expect(result.complete).toBe(true);
  expect(result.changes).toHaveLength(1);
  expect(result.authority).toBe("none");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["source", "extra-field", "duplicate-id", "overlap", "outside-scope", "preimage"])("edit inspection refuses %s", scenario => {
  const f = fixture(), selection = structuredClone(f.selection);
  if (scenario === "source") selection.source_commit = "0".repeat(40);
  if (scenario === "extra-field") Object.assign(selection, { approved: true });
  if (scenario === "duplicate-id") selection.edits.push({ ...f.edit });
  if (scenario === "overlap") selection.edits.push({ ...f.edit, id: "other-fix", replacement_base64: Buffer.from("Other replacement\n").toString("base64") });
  if (scenario === "outside-scope") Object.assign(selection.edits[0], { path: "src/app.ts", end: Buffer.byteLength("export const value = 1;\n"),
    before_sha256: sha256(Buffer.from("export const value = 1;\n")) });
  if (scenario === "preimage") selection.edits[0].before_sha256 = "0".repeat(64);
  const before = captureRepositoryState(f.repo), result = inspectPreparation({ repo: f.repo, source: f.commit, selection });
  expect(result.complete).toBe(false);
  expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["claimed-guide", "normative-spec"])("normal edit inspection reports protected %s", scenario => {
  const f = fixture(), template = readFileSync(join(import.meta.dir, "../../../internal/testrepo/testdata/docs/conforming.md"), "utf8");
  const feature = template.replace("status: draft", scenario === "claimed-guide" ? "status: in-progress\nbranch: feat/other-writer" : "status: planned")
    .replace("  - src/\n  - config.yml", "  - docs/guide.md");
  put(f.repo, "plans/feature.md", feature);
  put(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...settingsFixture(), roots: ["docs", "plans"] }).toString());
  const source = commitAll(f.repo), edit = scenario === "claimed-guide" ? f.edit : { ...f.edit, path: "plans/feature.md", end: Buffer.byteLength(feature),
    before_sha256: sha256(Buffer.from(feature)), replacement_base64: Buffer.from(feature.replace("The design.", "Another design.")).toString("base64") };
  const before = captureRepositoryState(f.repo), result = inspectPreparation({ repo: f.repo, source,
    selection: { schema_version: 1, source_commit: source, edits: [edit] } });
  expect(result.complete).toBe(false);
  expect(result.protection?.edits[0].reason).toBe(scenario === "claimed-guide" ? "active-feature-overlap" : "protected-feature-range");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["replace", "create", "delete", "chmod", "literal"] as const)("owned preparation applies %s and preserves caller state and index", async action => {
  const f = fixture(), edit: Edit = { ...f.edit };
  if (action === "create") Object.assign(edit, { path: "docs/new.md", action: "create", start: 0, end: 0, before_sha256: null });
  if (action === "delete") Object.assign(edit, { action: "delete", replacement_base64: "", after_mode: null });
  if (action === "chmod") Object.assign(edit, { action: "chmod", start: 0, end: 0, replacement_base64: "", after_mode: "100755" });
  if (action === "literal") {
    edit.path = "docs/literal\\name\nΣ.md";
    put(f.repo, edit.path, "# Guide\n"); f.commit = commitAll(f.repo);
  }
  const options = { ...prepareOptions(f), selection: { ...f.selection, source_commit: f.commit, edits: [edit] } };
  const before = captureRepositoryState(f.repo), result = await prepareEdits(options);
  expect(result.state).toBe("prepared-uncommitted");
  if (!result.checkout || !result.record_path) throw Error("missing prepared resource");
  const path = join(result.checkout, edit.path);
  if (action === "delete") expect(existsSync(path)).toBe(false);
  else if (action === "chmod") expect(lstatSync(path).mode & 0o100).toBe(0o100);
  else expect(readFileSync(path).toString()).toBe("# Current guide\n");
  expect(git(result.checkout, "rev-parse", "HEAD")).toBe(f.commit);
  expect(git(result.checkout, "diff", "--cached", "--name-only")).toBe("");
  expect(readFileSync(result.record_path).toString()).toBe(canonicalJSON(result).toString());
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 30000);

test("an incomplete initial scan preserves its source and prevents preparation", async () => {
  const f = fixture("omit-document"), before = captureRepositoryState(f.repo), result = await prepareEdits(prepareOptions(f));
  expect(result.state).toBe("incomplete");
  expect(result.scan?.complete).toBe(false);
  expect(result.checkout).toBeNull();
  expect(result.diagnostics).toContain("preparation requires complete source collection");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["sha1", "sha256"] as const)("binary preparation uses the %s source repository format", async format => {
  const f = fixture("none", format), bytes = Buffer.from([0, 255, 10, 0, 128, 1]);
  const edit: Edit = { ...f.edit, path: "docs/binary.dat", action: "create", start: 0, end: 0,
    before_sha256: null, replacement_base64: bytes.toString("base64") };
  const result = await prepareEdits({ ...prepareOptions(f), selection: { ...f.selection, edits: [edit] } });
  expect(result.diagnostics).toEqual([]);
  expect(result.state).toBe("prepared-uncommitted");
  if (!result.checkout) throw Error("missing binary preparation source");
  expect(readFileSync(join(result.checkout, edit.path))).toEqual(bytes);
});

test("asynchronous preparation retains its original selection and resource paths", async () => {
  const f = fixture(), options = prepareOptions(f), originalOutput = options.artifact_root;
  const pending = prepareEdits(options);
  options.selection.edits[0].replacement_base64 = Buffer.from("Changed after start\n").toString("base64");
  options.artifact_root = join(originalOutput, "other-output"); options.source = "0".repeat(40);
  const result = await pending;
  expect(result.state).toBe("prepared-uncommitted");
  if (!result.checkout) throw Error("missing prepared source");
  expect(result.checkout.startsWith(originalOutput + "/")).toBe(true);
  expect(readFileSync(join(result.checkout, "docs/guide.md")).toString()).toBe("# Current guide\n");
  expect(existsSync(options.artifact_root)).toBe(false);
});

test.each(["retained", "applied-response-lost", "recording-failed"])("failed application keeps its original cause and evidence %s", async recording => {
  const f = fixture(), options = prepareOptions(f), before = captureRepositoryState(f.repo);
  const failure = new Error("fixture apply stopped"), recordingFailure = new Error("fixture recording stopped");
  const execute = ownedProcess.executeOwnedProcess, publish = artifacts.publishArtifact;
  const execution = spyOn(ownedProcess, "executeOwnedProcess").mockImplementation(async args => {
    if (args.argv.includes("apply") && !args.argv.includes("--check")) {
      if (recording === "applied-response-lost") await execute(args);
      throw failure;
    }
    return execute(args);
  });
  const capture = spyOn(artifacts, "publishArtifact").mockImplementation((path, bytes) => {
    if (recording === "recording-failed" && path.endsWith("/prepare-result.json")) throw recordingFailure;
    return publish(path, bytes);
  });
  try {
    if (recording === "recording-failed") {
      try { await prepareEdits(options); throw Error("expected failed evidence recording"); }
      catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        if (!(error instanceof AggregateError)) throw error;
        expect(error.errors).toEqual([failure, recordingFailure]);
        expect(error.cause).toBe(failure);
      }
    } else {
      const result = await prepareEdits(options);
      expect(result.state).toBe("incomplete");
      expect(result.diagnostics).toContain(failure.message);
      if (!result.record_path || !result.checkout) throw Error("missing failed preparation resource");
      expect(readFileSync(result.record_path).toString()).toBe(canonicalJSON(result).toString());
      expect(readFileSync(join(result.checkout, "docs/guide.md")).toString()).toBe(recording === "applied-response-lost" ? "# Current guide\n" : "# Guide\n");
      if (recording === "applied-response-lost") {
        execution.mockRestore();
        const retried = await prepareEdits(options);
        expect(retried.state).toBe("prepared-uncommitted");
        expect(retried.checkout).not.toBe(result.checkout);
        expect(readFileSync(result.record_path).toString()).toBe(canonicalJSON(result).toString());
      }
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } finally { execution.mockRestore(); capture.mockRestore(); }
});

test.each(["* text eol=crlf\n", "* ident\n", "docs/guide.md working-tree-encoding=UTF-16LE\n"])("preparation applies raw blob bytes under committed attributes %j", async attributes => {
  const f = fixture(); put(f.repo, ".gitattributes", attributes);
  git(f.repo, "add", "--", ".gitattributes"); git(f.repo, "commit", "-qm", "synthetic conversion attributes");
  const source = git(f.repo, "rev-parse", "HEAD"), replacement = Buffer.from("# Current guide $Id$\n");
  const options = prepareOptions(f), before = captureRepositoryState(f.repo);
  const result = await prepareEdits({ ...options, source, selection: { ...f.selection, source_commit: source,
    edits: [{ ...f.edit, replacement_base64: replacement.toString("base64") }] } });
  expect(result.diagnostics).toEqual([]);
  expect(result.state).toBe("prepared-uncommitted");
  if (!result.checkout) throw Error("missing attribute preparation source");
  expect(readFileSync(join(result.checkout, f.edit.path))).toEqual(replacement);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});
