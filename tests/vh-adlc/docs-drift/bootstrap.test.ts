import * as filesystem from "node:fs";
import { installedSettingsFixture } from "./settings-fixture";
import { afterAll, expect, spyOn, test } from "bun:test";
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

test.each(["manifest", "binding"] as const)("native install markers preserve shipped identity and bytes: %s", kind => {
  const f = component(), directory = join(f.payload, ".in_use");
  chmodSync(f.payload, 0o755); mkdirSync(directory);
  const { plugin_version, source_commit, component_sha256 } = f.identity;
  const expected = kind === "manifest" ? f.identity : { plugin_version, source_commit, component_sha256 };
  const inspect = () => bootstrap.inspectInstalledPayload({ directory: f.payload, expected });
  const marker = join(directory, "12345"), bytes = Buffer.from(JSON.stringify({ pid: 12345, procStart: "123456789" }));
  writeFileSync(marker, bytes, { mode: 0o600 });
  const before = { root: lstatSync(f.payload).mode, marker: lstatSync(marker).mode };
  expect(inspect().files).toEqual(f.identity.files);
  expect(readFileSync(marker)).toEqual(bytes);
  expect({ root: lstatSync(f.payload).mode, marker: lstatSync(marker).mode }).toEqual(before);
  chmodSync(f.payload, 0o700);
  expect(() => inspectRetainedPayload({ directory: f.payload, expected: f.identity })).toThrow(/^docs-drift runtime setup required /u);
  rmSync(marker);
  expect(inspectRetainedPayload({ directory: f.payload, expected: f.identity }).files).toEqual(f.identity.files);
  writeFileSync(marker, bytes, { mode: 0o600 });
  chmodSync(f.payload, 0o755);
  writeFileSync(marker, ' \r\n{\t"procStart":"123456789",\n"pid":12345}\r\n');
  expect(inspect().files).toEqual(f.identity.files);
  writeFileSync(marker, JSON.stringify({ procStart: "987654321", pid: 12345 }).padEnd(256, " "));
  expect(inspect().component_sha256).toBe(component_sha256);
  const stale = join(directory, "9007199254740991");
  writeFileSync(stale, JSON.stringify({ pid: Number.MAX_SAFE_INTEGER, procStart: "0" }));
  expect(inspect().files).toEqual(f.identity.files);
  rmSync(marker); rmSync(stale);
  expect(inspect().files).toEqual(f.identity.files);
  writeFileSync(marker, bytes);
  writeFileSync(join(f.payload, "scripts/runner.ts"), "// changed shipped code\n");
  expect(inspect).toThrow(/^docs-drift runtime setup required /u);
});

test.each(["manifest", "binding", "retained"] as const)("empty directories preserve the existing payload policy: %s", kind => {
  const f = component();
  const { plugin_version, source_commit, component_sha256 } = f.identity;
  const inspect = kind === "retained"
    ? () => inspectRetainedPayload({ directory: f.payload, expected: f.identity })
    : () => bootstrap.inspectInstalledPayload({ directory: f.payload,
      expected: kind === "manifest" ? f.identity : { plugin_version, source_commit, component_sha256 } });
  expect(inspect().files).toEqual(f.identity.files);
  mkdirSync(join(f.payload, ".git"));
  const nested = join(f.payload, "nested/.GiT"); mkdirSync(nested, { recursive: true });
  expect(inspect().files).toEqual(f.identity.files);
  writeFileSync(join(nested, "unexpected"), "Not a shipped file\n");
  expect(inspect).toThrow(/^invalid docs-drift protocol path/u);
});

test("native install marker refusal stops runtime selection before client probes", async () => {
  const f = component(), settings = installedSettingsFixture(), executable = join(f.root, "copilot"), trace = join(f.root, "probe-calls");
  const { plugin_version, source_commit, component_sha256 } = f.identity;
  settings.component = { plugin_version, source_commit, component_sha256 };
  settings.clients.copilot.executable = executable;
  writeFileSync(executable, `#!${process.execPath}
import { appendFileSync } from "node:fs";
const argument = process.argv.at(-1);
appendFileSync(${JSON.stringify(trace)}, argument + "\\n");
console.log(argument === "--version" ? "GitHub Copilot CLI 1.0.112." : "--plugin-dir --model --session-id --output-format --available-tools --no-custom-instructions --disable-builtin-mcps");
`, { mode: 0o755 });
  mkdirSync(join(f.repo, ".vh-adlc"), { recursive: true });
  writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), JSON.stringify(settings));
  const source = commit(f.repo), select = () => bootstrap.selectInstalledRuntime({ repo: f.repo, source_commit: source, directory: f.payload, entry: "interactive" });
  expect((await select()).complete).toBe(true);
  expect(readFileSync(trace, "utf8")).toContain("--version");
  rmSync(trace);
  const directory = join(f.payload, ".in_use"), marker = join(directory, "12345"); mkdirSync(directory);
  const bytes = '{"pid":12345,"procStart":"1","unexpected":true}'; writeFileSync(marker, bytes);
  await expect(select()).rejects.toThrow(/^docs-drift runtime setup required invalid native process metadata/u);
  expect(filesystem.existsSync(trace)).toBe(false);
  expect(readFileSync(marker, "utf8")).toBe(bytes);
});

test.each(["unknown-file", "zero-pid", "leading-zero", "wrong-pid", "string-pid", "fractional-pid", "unsafe-pid", "empty-start", "invalid-start", "long-start", "numeric-start", "missing-field", "unknown-field", "duplicate-field", "escaped-key", "escaped-start", "temporary-name", "exponent-pid", "decimal-pid", "negative-zero", "bom", "hardlink", "invalid-json", "invalid-utf8", "oversized", "executable", "group-executable", "symlink", "linked-directory", "nested-directory", "nested-marker", "outside-directory", "directory-marker"] as const)(
  "native install metadata refuses unsafe input: %s", fault => {
    const f = component(), directory = join(f.payload, fault === "outside-directory" ? ".in_use_other" : ".in_use"); mkdirSync(directory);
    let name = "12345", value: unknown = { pid: 12345, procStart: "123456789" };
    if (fault === "unknown-file") name = "ambient.ts";
    if (fault === "temporary-name") name = ".12345.tmp";
    if (fault === "exponent-pid") name = "1000";
    if (fault === "zero-pid") { name = "0"; value = { pid: 0, procStart: "1" }; }
    if (fault === "leading-zero") name = "012345";
    if (fault === "wrong-pid") value = { pid: 12346, procStart: "1" };
    if (fault === "string-pid") value = { pid: "12345", procStart: "1" };
    if (fault === "fractional-pid") value = { pid: 12345.5, procStart: "1" };
    if (fault === "unsafe-pid") { name = "9007199254740992"; value = { pid: 9007199254740992, procStart: "1" }; }
    if (fault === "empty-start") value = { pid: 12345, procStart: "" };
    if (fault === "invalid-start") value = { pid: 12345, procStart: "arbitrary code" };
    if (fault === "long-start") value = { pid: 12345, procStart: "1".repeat(33) };
    if (fault === "numeric-start") value = { pid: 12345, procStart: 123456789 };
    if (fault === "missing-field") value = { pid: 12345 };
    if (fault === "unknown-field") value = { pid: 12345, procStart: "1", run: "unexpected" };
    const marker = join(directory, name);
    if (fault === "symlink") symlinkSync(join(f.plugin, "guide.md"), marker);
    else if (fault === "hardlink") { const source = join(f.root, "native-marker-source"); writeFileSync(source, JSON.stringify(value)); linkSync(source, marker); }
    else if (fault === "linked-directory") { rmSync(directory, { recursive: true }); symlinkSync(f.plugin, directory); }
    else if (fault === "nested-directory") mkdirSync(join(directory, "nested"));
    else if (fault === "nested-marker") { mkdirSync(join(directory, "nested")); writeFileSync(join(directory, "nested", "12345"), JSON.stringify(value)); }
    else if (fault === "directory-marker") mkdirSync(marker);
    else {
      if (fault === "exponent-pid") name = "1000";
      const lexical = fault === "duplicate-field" ? '{"pid":12345,"pid":12345,"procStart":"1"}'
        : fault === "escaped-key" ? '{"\\u0070id":12345,"procStart":"1"}'
        : fault === "escaped-start" ? '{"pid":12345,"procStart":"\\u0031"}'
        : fault === "exponent-pid" ? '{"pid":1e3,"procStart":"1"}'
        : fault === "decimal-pid" ? '{"pid":12345.0,"procStart":"1"}'
        : fault === "negative-zero" ? '{"pid":-0,"procStart":"1"}' : JSON.stringify(value);
      if (["duplicate-field", "escaped-key", "escaped-start", "exponent-pid", "decimal-pid"].includes(fault))
        expect(JSON.parse(lexical)).toEqual({ pid: Number(name), procStart: "1" });
      const bytes = fault === "bom" ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lexical)])
        : fault === "invalid-json" ? "{" : fault === "invalid-utf8" ? Buffer.from([0xff])
        : fault === "oversized" ? JSON.stringify(value).padEnd(257, " ") : lexical;
      writeFileSync(fault === "exponent-pid" ? join(directory, name) : marker, bytes, { mode: fault === "executable" ? 0o700 : fault === "group-executable" ? 0o610 : 0o600 });
    }
    if (fault === "executable") chmodSync(marker, 0o700);
    if (fault === "group-executable") chmodSync(marker, 0o610);
    const snapshot = () => [".", ...readdirSync(f.payload, { recursive: true }).map(String).sort()].map(relative => {
      const path = join(f.payload, relative), stat = lstatSync(path);
      return [relative, stat.mode, stat.nlink, stat.isSymbolicLink() ? filesystem.readlinkSync(path)
        : stat.isFile() ? sha256(readFileSync(path)) : null];
    });
    const before = snapshot();
    const { plugin_version, source_commit, component_sha256 } = f.identity;
    for (const expected of [f.identity, { plugin_version, source_commit, component_sha256 }])
      expect(() => bootstrap.inspectInstalledPayload({ directory: f.payload, expected })).toThrow(/^docs-drift runtime setup required /u);
    expect(snapshot()).toEqual(before);
  },
);


test.each(["file", "descendant"] as const)("release inventories refuse reserved native metadata: %s", kind => {
  const f = component(), path = join(f.plugin, ".in_use");
  if (kind === "descendant") { mkdirSync(path); writeFileSync(join(path, "12345"), '{"pid":12345,"procStart":"1"}'); }
  else writeFileSync(path, "Reserved runtime metadata\n");
  const source = commit(f.repo);
  expect(() => computeComponentIdentity(f.repo, source)).toThrow(/^docs-drift runtime setup required native process metadata cannot be shipped/u);
});

test.each(["removal", "replacement"] as const)("native install marker races fail once and permit an explicit rerun: %s", async fault => {
  const f = component(), directory = join(f.payload, ".in_use"), marker = join(directory, "12345"); mkdirSync(directory);
  const bytes = '{"pid":12345,"procStart":"1"}'; writeFileSync(marker, bytes);
  const replacement = join(f.root, "replacement-marker"); writeFileSync(replacement, bytes);
  const originalList = filesystem.readdirSync, originalOpen = filesystem.openSync;
  let injected = false, attempts = 0;
  const listing = spyOn(filesystem, "readdirSync").mockImplementation(((...args: unknown[]) => {
    const result = Reflect.apply(originalList, filesystem, args) as ReturnType<typeof filesystem.readdirSync>;
    if (fault === "removal" && args[0] === directory) {
      attempts++;
      if (!injected) { injected = true; rmSync(marker); }
    }
    return result;
  }) as typeof filesystem.readdirSync);
  const opening = spyOn(filesystem, "openSync").mockImplementation((...args: unknown[]) => {
    if (fault === "replacement" && args[0] === marker) {
      attempts++;
      if (!injected) { injected = true; filesystem.renameSync(replacement, marker); }
    }
    return Reflect.apply(originalOpen, filesystem, args) as number;
  });
  try {
    await bootstrap.withRuntimeValidation(async () => {
      expect(() => bootstrap.inspectInstalledPayload({ directory: f.payload, expected: f.identity }))
        .toThrow(fault === "removal" ? /ENOENT/u : /^docs-drift runtime setup required runtime input changed during inspection/u);
      expect(injected).toBe(true); expect(attempts).toBe(1);
      if (fault === "removal") writeFileSync(marker, bytes);
      expect(bootstrap.inspectInstalledPayload({ directory: f.payload, expected: f.identity }).files).toEqual(f.identity.files);
      expect(attempts).toBe(2); expect(readFileSync(marker, "utf8")).toBe(bytes);
    });
  } finally { opening.mockRestore(); listing.mockRestore(); }
});

test.each(["growth", "shrink"] as const)("native install marker size races never request unbounded data: %s", fault => {
  const f = component(), directory = join(f.payload, ".in_use"), marker = join(directory, "12345"); mkdirSync(directory);
  const bytes = '{"pid":12345,"procStart":"1"}'; writeFileSync(marker, bytes);
  const originalOpen = filesystem.openSync, originalStat = filesystem.fstatSync;
  const originalRead = filesystem.readSync, originalWholeRead = filesystem.readFileSync;
  let markerFd: number | null = null, grew = false, unbounded = 0;
  const lengths: number[] = [];
  const opening = spyOn(filesystem, "openSync").mockImplementation((...args: unknown[]) => {
    const fd = Reflect.apply(originalOpen, filesystem, args) as number;
    if (args[0] === marker) markerFd = fd;
    return fd;
  });
  const stating = spyOn(filesystem, "fstatSync").mockImplementation(((...args: unknown[]) => {
    const result = Reflect.apply(originalStat, filesystem, args) as ReturnType<typeof filesystem.fstatSync>;
    if (args[0] === markerFd && !grew) { grew = true; if (fault === "growth") filesystem.appendFileSync(marker, " ".repeat(4096)); else writeFileSync(marker, "{"); }
    return result;
  }) as typeof filesystem.fstatSync);
  const reading = spyOn(filesystem, "readSync").mockImplementation((...args: unknown[]) => {
    if (args[0] === markerFd) lengths.push(typeof args[3] === "number" ? args[3] : (args[1] as Uint8Array).byteLength);
    return Reflect.apply(originalRead, filesystem, args) as number;
  });
  const wholeReading = spyOn(filesystem, "readFileSync").mockImplementation(((...args: unknown[]) => {
    if (args[0] === markerFd || args[0] === marker) unbounded++;
    return Reflect.apply(originalWholeRead, filesystem, args) as ReturnType<typeof filesystem.readFileSync>;
  }) as typeof filesystem.readFileSync);
  try {
    expect(() => bootstrap.inspectInstalledPayload({ directory: f.payload, expected: f.identity }))
      .toThrow(/^docs-drift runtime setup required native process metadata changed during inspection/u);
    expect(grew).toBe(true); expect(unbounded).toBe(0);
    expect(lengths.length).toBeGreaterThan(0);
    expect(lengths.every(length => length <= 257)).toBe(true);
    expect(originalWholeRead(marker, "utf8")).toBe(fault === "growth" ? bytes + " ".repeat(4096) : "{");
    writeFileSync(marker, bytes);
    expect(bootstrap.inspectInstalledPayload({ directory: f.payload, expected: f.identity }).files).toEqual(f.identity.files);
    expect(originalWholeRead(marker, "utf8")).toBe(bytes);
  } finally { wholeReading.mockRestore(); reading.mockRestore(); stating.mockRestore(); opening.mockRestore(); }
});


test("native install marker FIFOs are refused without opening them", () => {
  const f = component(), directory = join(f.payload, ".in_use"), marker = join(directory, "12345"); mkdirSync(directory);
  const created = Bun.spawnSync(["mkfifo", marker], { stdout: "pipe", stderr: "pipe" });
  expect(created.exitCode, created.stderr.toString()).toBe(0);
  const originalOpen = filesystem.openSync;
  let opened = 0;
  const guard = spyOn(filesystem, "openSync").mockImplementation((...args: unknown[]) => {
    if (args[0] === marker) { opened++; throw Error("Would open a blocking native metadata FIFO"); }
    return Reflect.apply(originalOpen, filesystem, args) as number;
  });
  try {
    expect(() => bootstrap.inspectInstalledPayload({ directory: f.payload, expected: f.identity }))
      .toThrow(/^docs-drift runtime setup required unexpected or changed runtime input/u);
    expect(opened).toBe(0);
  } finally { guard.mockRestore(); }
});
