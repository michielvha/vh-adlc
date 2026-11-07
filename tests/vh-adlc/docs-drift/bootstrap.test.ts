import { afterAll, expect, test } from "bun:test";
import { chmodSync, linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { computeComponentIdentity, inspectRetainedPayload } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture } from "./publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function commit(repo: string) {
  readGit(repo, "add", "--", ".");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "synthetic component");
  return readGit(repo, "rev-parse", "HEAD").toString().trim();
}
function component() {
  const f = publicationFixture(roots), plugin = join(f.repo, "plugins/vh-adlc");
  mkdirSync(join(plugin, ".claude-plugin"), { recursive: true }); mkdirSync(join(plugin, "scripts"));
  writeFileSync(join(plugin, ".claude-plugin/plugin.json"), '{"name":"vh-adlc","version":"0.13.0"}\n');
  writeFileSync(join(plugin, "scripts/runner.ts"), "// synthetic executable\n", { mode: 0o755 });
  writeFileSync(join(plugin, "guide.md"), "Synthetic complete payload\n");
  const source = commit(f.repo), identity = computeComponentIdentity(f.repo, source);
  const payload = join(f.root, "retained-payload"); mkdirSync(payload, { mode: 0o700 });
  for (const row of identity.files) {
    const path = join(payload, row.path); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, readGit(f.repo, "show", source + ":plugins/vh-adlc/" + row.path), { mode: row.mode === "100755" ? 0o755 : 0o644 });
  }
  return { ...f, plugin, source, identity, payload };
}

test("the component digest covers every shipped path, mode and raw blob at the exact source", () => {
  const f = component(), before = captureRepositoryState(f.repo);
  expect(f.identity.plugin_version).toBe("0.13.0");
  expect(f.identity.files.map(row => row.path)).toEqual([".claude-plugin/plugin.json", "guide.md", "scripts/runner.ts"]);
  expect(f.identity.component_sha256).toBe(sha256(canonicalJSON(f.identity.files.map(row => [row.path, row.mode, row.sha256]))));
  expect(inspectRetainedPayload({ directory: f.payload, expected: f.identity }).component_sha256).toBe(f.identity.component_sha256);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  writeFileSync(join(f.plugin, "guide.md"), "dirty host source replacement\n");
  expect(computeComponentIdentity(f.repo, f.source)).toEqual(f.identity);
  expect(inspectRetainedPayload({ directory: f.payload, expected: f.identity }).plugin_version).toBe("0.13.0");
});

test("unrelated source changes preserve payload identity while a shipped helper or manifest change does not", () => {
  const f = component();
  writeFileSync(join(f.repo, "README.md"), "Unrelated repository change\n");
  expect(computeComponentIdentity(f.repo, commit(f.repo)).component_sha256).toBe(f.identity.component_sha256);
  writeFileSync(join(f.plugin, "scripts/runner.ts"), "// changed shared helper\n");
  expect(computeComponentIdentity(f.repo, commit(f.repo)).component_sha256).not.toBe(f.identity.component_sha256);
});

test("missing, changed and ambient retained payload files cannot pass identity checks", () => {
  for (const mode of ["changed", "missing", "extra", "executable", "symlink", "hardlink"]) {
    const f = component(), guide = join(f.payload, "guide.md");
    if (mode === "changed") writeFileSync(guide, "changed bytes\n");
    if (mode === "missing") rmSync(guide);
    if (mode === "extra") writeFileSync(join(f.payload, "ambient-helper.ts"), "unexpected executable input\n");
    if (mode === "executable") chmodSync(guide, 0o755);
    if (mode === "symlink") { rmSync(guide); symlinkSync(join(f.plugin, "guide.md"), guide); }
    if (mode === "hardlink") { rmSync(guide); linkSync(join(f.plugin, "guide.md"), guide); }
    expect(() => inspectRetainedPayload({ directory: f.payload, expected: f.identity })).toThrow();
  }
});

test("a shared or symlinked runtime root cannot stand in for the recorded owned payload", () => {
  for (const mode of ["shared", "symlink"]) {
    const f = component();
    if (mode === "shared") chmodSync(f.payload, 0o755);
    const path = mode === "symlink" ? join(f.root, "payload-alias") : f.payload;
    if (mode === "symlink") symlinkSync(f.payload, path);
    expect(() => inspectRetainedPayload({ directory: path, expected: f.identity })).toThrow();
  }
});
