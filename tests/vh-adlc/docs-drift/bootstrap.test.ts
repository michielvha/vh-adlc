import { installedSettingsFixture } from "./settings-fixture";
import { afterAll, expect, test } from "bun:test";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as bootstrap from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
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

test("ordinary installed payloads keep their existing modes and support a canonical root alias", () => {
  const f = component();
  chmodSync(f.payload, 0o755);
  const guide = join(f.payload, "guide.md");
  rmSync(guide);
  linkSync(join(f.plugin, "guide.md"), guide);
  const alias = join(f.root, "installed-plugin");
  symlinkSync(f.payload, alias);
  const before = { mode: lstatSync(f.payload).mode, links: lstatSync(guide).nlink, source: captureRepositoryState(f.repo) };
  const inspected = bootstrap.inspectInstalledPayload({ directory: alias, expected: f.identity });
  expect(inspected.directory).toBe(f.payload);
  expect(inspected.component_sha256).toBe(f.identity.component_sha256);
  expect(inspected.plugin_version).toBe(f.identity.plugin_version);
  expect({ mode: lstatSync(f.payload).mode, links: lstatSync(guide).nlink, source: captureRepositoryState(f.repo) }).toEqual(before);
});

test("ordinary payload verification is reused only within its invocation", async () => {
  const f = component(), options = { directory: f.payload, expected: f.identity };
  const first = await bootstrap.withRuntimeValidation(async () => {
    const selected = bootstrap.inspectInstalledPayload(options);
    await Promise.resolve();
    expect(bootstrap.inspectInstalledPayload(options)).toBe(selected);
    expect(bootstrap.withRuntimeValidation(() => bootstrap.inspectInstalledPayload(options))).toBe(selected);
    expect(() => bootstrap.inspectInstalledPayload({ ...options,
      expected: { ...f.identity, component_sha256: "f".repeat(64) } })).toThrow();
    return selected;
  });
  expect(bootstrap.inspectInstalledPayload(options)).not.toBe(first);
  expect(bootstrap.withRuntimeValidation(() => bootstrap.inspectInstalledPayload(options))).not.toBe(first);
  writeFileSync(join(f.payload, "guide.md"), "Changed between invocations\n");
  expect(() => bootstrap.withRuntimeValidation(() => bootstrap.inspectInstalledPayload(options))).toThrow();
});

test.each(["unchanged", "changed", "extra", "missing"] as const)("ordinary payload binding validates the complete file set without a separate manifest %s", scenario => {
  const f = component();
  const { plugin_version, source_commit, component_sha256 } = f.identity;
  if (scenario === "changed") writeFileSync(join(f.payload, "guide.md"), "changed\n");
  if (scenario === "extra") writeFileSync(join(f.payload, ".hidden-extra"), "extra\n");
  if (scenario === "missing") rmSync(join(f.payload, "guide.md"));
  const inspect = () => bootstrap.inspectInstalledPayload({ directory: f.payload, expected: { plugin_version, source_commit, component_sha256 } });
  if (scenario === "unchanged") expect(inspect().files).toEqual(f.identity.files);
  else expect(inspect).toThrow();
});

test.each(["changed", "missing", "extra", "hidden-extra", "executable", "symlink", "directory"] as const)(
  "ordinary installed inventory rejects %s under an unchanged version", scenario => {
    const f = component(), guide = join(f.payload, "guide.md");
    chmodSync(f.payload, 0o755);
    if (scenario === "changed") writeFileSync(guide, "changed installed bytes\n");
    if (scenario === "missing") rmSync(guide);
    if (scenario === "extra") writeFileSync(join(f.payload, "extra.agent.md"), "unexpected agent\n");
    if (scenario === "hidden-extra") writeFileSync(join(f.payload, ".installer-metadata"), "unlisted bytes\n");
    if (scenario === "executable") chmodSync(guide, 0o755);
    if (scenario === "symlink") { rmSync(guide); symlinkSync(join(f.plugin, "guide.md"), guide); }
    if (scenario === "directory") { rmSync(guide); mkdirSync(guide); }
    expect(() => bootstrap.inspectInstalledPayload({ directory: f.payload, expected: f.identity })).toThrow();
    expect(lstatSync(f.payload).mode & 0o777).toBe(0o755);
  },
);

test("ordinary client inspection uses the installed command without creating a private distribution", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-installed-client-")));
  roots.push(root);
  const executable = join(root, "claude");
  const program = "#!/bin/sh\nprintf '%s\\n' '2.1.325 (Claude Code)'\n";
  writeFileSync(executable, program, { mode: 0o755 });
  const selected = await bootstrap.inspectInstalledClient({ client: { provider: "claude", executable: "claude" }, cwd: root, path: root });
  expect(selected.complete).toBe(true);
  expect(selected.version).toBe("2.1.325");
  expect(selected.executable).toBe(executable);
  expect(readdirSync(root)).toEqual(["claude"]);
  expect(readFileSync(executable, "utf8")).toBe(program);
});

test("ordinary client inspection reports a missing command as setup", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-installed-missing-")));
  roots.push(root);
  const selected = await bootstrap.inspectInstalledClient({ client: { provider: "claude", executable: "unprovisioned-client" }, cwd: root, path: root });
  expect(selected.complete).toBe(false);
  expect(selected.process).toBeNull();
  expect(selected.diagnostics.join(" ")).toContain("command");
  expect(readdirSync(root)).toEqual([]);
});

test.each(["supported", "missing", "unsupported", "missing-capability"] as const)("ordinary runtime selects configured native roles in place %s", async scenario => {
  const f = component(), settings = installedSettingsFixture(), executable = join(f.root, "copilot");
  settings.component = { plugin_version: f.identity.plugin_version, source_commit: f.identity.source_commit, component_sha256: f.identity.component_sha256 };
  settings.clients.copilot.executable = scenario === "missing" ? "unprovisioned-client" : executable;
  if (scenario === "unsupported") Reflect.set(settings.clients.copilot, "provider", "codex");
  const flags = scenario === "missing-capability" ? "--model" : "--plugin-dir --model --session-id --output-format --available-tools --no-custom-instructions --disable-builtin-mcps";
  writeFileSync(executable, "#!/bin/sh\nif [ \"$1\" = '--no-auto-update' ]; then shift; fi\nif [ \"$1\" = '--version' ]; then printf '%s\\n' 'GitHub Copilot CLI 1.0.112.'; else printf '%s\\n' '" + flags + "'; fi\n", { mode: 0o755 });
  mkdirSync(join(f.repo, ".vh-adlc"), { recursive: true });
  writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), JSON.stringify(settings));
  const source = commit(f.repo);
  const selected = await bootstrap.selectInstalledRuntime({ repo: f.repo, source_commit: source, directory: f.payload, entry: "interactive" });
  expect(selected.complete).toBe(scenario === "supported");
  if (scenario === "supported") {
    expect(selected.runtime?.authority).toBe("none");
    expect(selected.runtime?.worker.executable).toBe(executable);
    expect(selected.runtime?.worker.model).toBe(settings.execution.entries.interactive.worker.model);
    expect(selected.runtime?.authentication).toBe("native");
    expect(selected.runtime?.component.directory).toBe(f.payload);
    expect(readdirSync(f.root).filter(name => name.includes("client") || name.includes("profile"))).toEqual([]);
  } else {
    expect(selected.runtime).toBeNull();
    expect(selected.diagnostics.length).toBeGreaterThan(0);
  }
});

test("native capability probes are shared only within their exact invocation", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-native-capability-scope-"))); roots.push(root);
  const executable = join(root, "claude"), trace = join(root, "probe-calls");
  writeFileSync(executable, `#!${process.execPath}
import { appendFileSync } from "node:fs";
const argument = process.argv.at(-1);
appendFileSync(${JSON.stringify(trace)}, argument + "\\n");
console.log(argument === "--version" ? "2.1.325 (Claude Code)" : "--plugin-dir");
`, { mode: 0o755 });
  const options: Parameters<typeof bootstrap.inspectInstalledClient>[0] = { client: { provider: "claude", executable }, cwd: root, required_flags: ["--plugin-dir"] };
  const calls = () => readFileSync(trace, "utf8").trim().split("\n");
  await bootstrap.withRuntimeValidation(async () => {
    const [first, concurrent] = await Promise.all([bootstrap.inspectInstalledClient(options), bootstrap.inspectInstalledClient(options)]);
    expect(first.complete).toBe(true); expect(concurrent).toBe(first);
    expect(calls()).toEqual(["--version", "--help"]);
    expect(await bootstrap.inspectInstalledClient(options)).toBe(first);
    const stronger = { ...options, required_flags: ["--plugin-dir", "--missing-capability"] };
    expect((await bootstrap.inspectInstalledClient(stronger)).complete).toBe(false);
    expect((await bootstrap.inspectInstalledClient(stronger)).complete).toBe(false);
    expect(calls()).toHaveLength(6);
  });
  await bootstrap.withRuntimeValidation(() => bootstrap.inspectInstalledClient(options));
  expect(calls()).toHaveLength(8);
  await bootstrap.inspectInstalledClient(options);
  expect(calls()).toHaveLength(10);
});
