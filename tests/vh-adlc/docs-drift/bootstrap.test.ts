import { afterAll, expect, test } from "bun:test";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as bootstrap from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { settingsFixture } from "./settings-fixture";
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

async function clientFixture(options: { cache?: string; provider?: "copilot" | "claude" | "codex"; version?: string;
  reported_version?: string; format?: "tar" | "executable"; program?: string; padding_bytes?: number } = {}) {
  const cache = options.cache ?? realpathSync(mkdtempSync(join(tmpdir(), "vh-retained-client-")));
  if (!options.cache) roots.push(cache);
  chmodSync(cache, 0o700);
  const provider = options.provider ?? "copilot", version = options.version ?? "fixture-1.0.0", reported = options.reported_version ?? version;
  const headers = { copilot: "GitHub Copilot CLI " + reported + ".", claude: reported + " (Claude Code)", codex: "codex-cli " + reported };
  const program = options.program ?? "#!/bin/sh\nprintf '%s\\n' '" + headers[provider] + "'\nexit 0\n" + "#".repeat(options.padding_bytes ?? 0);
  const executable = "bin/" + provider, format = options.format ?? "tar";
  const distribution: Uint8Array = format === "tar" ? await new Bun.Archive({ [executable]: program, "LICENSE": "Synthetic distribution\n" }, { compress: "gzip" }).bytes()
    : Buffer.from(program);
  const configured = settingsFixture(); Object.assign(configured.clients["copilot-linux"], {
    provider, version, platform: process.platform + "-" + process.arch, distribution_sha256: sha256(distribution) });
  const client = parseSettings(configured).clients["copilot-linux"];
  const setup = { cache_directory: cache, client_id: "copilot-linux", client, distribution, format, executable };
  return { cache, client, setup, program, index: join(cache, "clients/copilot-linux", client.distribution_sha256 + ".json") };
}

test("approved client distribution remains selected after an unrelated host client changes", async () => {
  expect(typeof bootstrap.retainClientDistribution).toBe("function");
  const cache = realpathSync(mkdtempSync(join(tmpdir(), "vh-retained-client-"))); roots.push(cache); chmodSync(cache, 0o700);
  const program = "#!/bin/sh\nprintf '%s\\n' 'GitHub Copilot CLI fixture-1.0.0.' \"Run 'copilot update' to check for updates.\"\n";
  const distribution = await new Bun.Archive({ "bin/copilot": program, "LICENSE": "Synthetic fixture distribution\n" }, { compress: "gzip" }).bytes();
  const configured = settingsFixture(); Object.assign(configured.clients["copilot-linux"], {
    platform: process.platform + "-" + process.arch, distribution_sha256: sha256(distribution) });
  const client = parseSettings(configured).clients["copilot-linux"];
  const selected = await bootstrap.retainClientDistribution({ cache_directory: cache, client_id: "copilot-linux", client,
    distribution, format: "tar", executable: "bin/copilot" });
  expect(readFileSync(selected.executable, "utf8")).toBe(program);
  const unrelated = join(cache, "host-client"); writeFileSync(unrelated, "unrelated newer global client\n");
  const checked = await bootstrap.inspectRetainedClient({ cache_directory: cache, client_id: "copilot-linux", client });
  expect(checked.executable).toBe(selected.executable);
  expect(checked.client).toEqual(client);
  expect(checked.version).toBe(client.version);
  expect(readFileSync(unrelated, "utf8")).toBe("unrelated newer global client\n");
}, 30000);

test("retained setup refuses linked cache parents before writing outside its namespace", async () => {
  const cache = realpathSync(mkdtempSync(join(tmpdir(), "vh-client-linked-"))), outside = realpathSync(mkdtempSync(join(tmpdir(), "vh-client-outside-")));
  roots.push(cache, outside); chmodSync(cache, 0o700); chmodSync(outside, 0o700);
  symlinkSync(outside, join(cache, "clients"));
  const distribution = Buffer.from("#!/bin/sh\nprintf '%s\\n' 'GitHub Copilot CLI fixture-1.0.0.'\n");
  const configured = settingsFixture(); Object.assign(configured.clients["copilot-linux"], {
    platform: process.platform + "-" + process.arch, distribution_sha256: sha256(distribution) });
  const client = parseSettings(configured).clients["copilot-linux"];
  await expect(bootstrap.retainClientDistribution({ cache_directory: cache, client_id: "copilot-linux", client,
    distribution, format: "executable", executable: "copilot" })).rejects.toThrow("private owned runtime directory required");
  expect(readdirSync(outside)).toEqual([]);
  expect(readdirSync(cache)).toEqual(["clients"]);
});

test.each(["copilot", "claude", "codex"] as const)("a retained %s client has exact native version evidence", async provider => {
  const f = await clientFixture({ provider, format: "executable" });
  const selected = await bootstrap.retainClientDistribution(f.setup);
  expect(selected.version).toBe(f.client.version);
  expect(selected.client.provider).toBe(provider);
  expect(readFileSync(selected.executable, "utf8")).toBe(f.program);
});

test.each(["checksum", "platform", "executable"] as const)("retained setup rejects %s before creating build state", async scenario => {
  const f = await clientFixture();
  if (scenario === "checksum") f.setup.distribution = Buffer.concat([Buffer.from(f.setup.distribution), Buffer.from("wrong bytes")]);
  if (scenario === "platform") Object.assign(f.client, { platform: process.platform === "darwin" ? "linux-x64" : "darwin-arm64" });
  if (scenario === "executable") f.setup.executable = "missing/client";
  const reason = scenario === "checksum" ? "client distribution checksum" : scenario === "platform" ? "client platform differs from host" : "client distribution executable or inventory";
  await expect(bootstrap.retainClientDistribution(f.setup)).rejects.toThrow(reason);
  expect(readdirSync(f.cache)).toEqual([]);
});

test("a mismatched native version preserves its original failed setup capture without selecting it", async () => {
  const f = await clientFixture({ reported_version: "fixture-2.0.0" });
  await expect(bootstrap.retainClientDistribution(f.setup)).rejects.toThrow("native client version differs from approved build");
  const builds = readdirSync(join(f.cache, "builds"));
  expect(builds).toHaveLength(1);
  const build = join(f.cache, "builds", builds[0]);
  expect(readFileSync(join(build, "version-stdout"), "utf8")).toContain("fixture-2.0.0");
  expect(JSON.parse(readFileSync(join(build, "version-process.json"), "utf8")).process.reaped).toBe(true);
  expect(() => readFileSync(f.index)).toThrow("ENOENT");
});

test.each(["missing-package", "replaced-executable", "ambient-file", "linked-executable", "hardlinked-executable", "forged-file-manifest", "unreaped-version", "missing-owner", "extra-proof-field"] as const)("retained client inspection rejects %s without a global fallback", async scenario => {
  const f = await clientFixture(), selected = await bootstrap.retainClientDistribution(f.setup), root = dirname(selected.directory);
  const global = join(f.cache, "global-client"); writeFileSync(global, "unrelated available host client\n");
  if (scenario === "missing-package") rmSync(join(root, "distribution"));
  if (scenario === "replaced-executable") writeFileSync(selected.executable, Buffer.alloc(readFileSync(selected.executable).length, 120));
  if (scenario === "ambient-file") writeFileSync(join(selected.directory, "ambient-plugin.js"), "unexpected active input\n");
  if (scenario === "linked-executable") { rmSync(selected.executable); symlinkSync(global, selected.executable); }
  if (scenario === "hardlinked-executable") linkSync(selected.executable, join(f.cache, "other-hardlink"));
  if (scenario === "forged-file-manifest") {
    writeFileSync(selected.executable, "forged build\n");
    const record = JSON.parse(readFileSync(f.index, "utf8")) as { files: Array<{ path: string; sha256: string; size: number }> };
    const row = record.files.find(item => item.path === f.setup.executable);
    if (!row) throw Error("missing retained executable");
    const bytes = readFileSync(selected.executable); row.sha256 = sha256(bytes); row.size = bytes.length;
    writeFileSync(f.index, canonicalJSON(record));
  }
  if (scenario === "unreaped-version" || scenario === "extra-proof-field") {
    const path = join(root, "version-process.json"), record = JSON.parse(readFileSync(path, "utf8")) as { process: { reaped: boolean } };
    if (scenario === "unreaped-version") record.process.reaped = false;
    else Object.assign(record, { approved: true });
    writeFileSync(path, canonicalJSON(record));
  }
  if (scenario === "missing-owner") rmSync(join(root, "version-owner.json"));
  const reason = { "missing-package": "distribution", "replaced-executable": "runtime input bytes changed",
    "ambient-file": "unexpected or changed runtime input", "linked-executable": "foreign or linked runtime input",
    "hardlinked-executable": "unexpected or changed runtime input", "forged-file-manifest": "client payload differs from verified distribution",
    "unreaped-version": "native client version evidence", "missing-owner": "version-owner.json", "extra-proof-field": "retained runtime evidence fields" }[scenario];
  await expect(bootstrap.inspectRetainedClient(f.setup)).rejects.toThrow(reason);
  expect(readFileSync(global, "utf8")).toBe("unrelated available host client\n");
});

test("approved and successor client snapshots coexist while same-build setup is idempotent and concurrent", async () => {
  const approved = await clientFixture(), first = await bootstrap.retainClientDistribution(approved.setup);
  const originalIndex = readFileSync(approved.index);
  const repeated = await Promise.all([bootstrap.retainClientDistribution(approved.setup), bootstrap.retainClientDistribution(approved.setup)]);
  expect(repeated.map(item => item.executable)).toEqual([first.executable, first.executable]);
  expect(readFileSync(approved.index)).toEqual(originalIndex);
  const barrier = ["#!/bin/sh", "while :; do", "  count=0", "  for owner in \"$HOME\"/../../*/version-owner.json; do",
    "    if [ -f \"$owner\" ]; then count=$((count + 1)); fi", "  done", "  if [ \"$count\" -ge 3 ]; then break; fi", "  sleep 1", "done",
    "printf '%s\\n' 'GitHub Copilot CLI fixture-2.0.0.'"].join("\n") + "\n";
  const candidate = await clientFixture({ cache: approved.cache, version: "fixture-2.0.0", program: barrier });
  const newer = await Promise.all([bootstrap.retainClientDistribution(candidate.setup), bootstrap.retainClientDistribution(candidate.setup)]);
  expect(newer[0].executable).toBe(newer[1].executable);
  expect(newer[0].executable).not.toBe(first.executable);
  const builds = readdirSync(join(approved.cache, "builds"));
  expect(builds).toHaveLength(3);
  const selectedRoots = [dirname(first.directory), dirname(newer[0].directory)];
  const unselected = builds.map(name => join(approved.cache, "builds", name)).filter(path => !selectedRoots.includes(path));
  expect(unselected).toHaveLength(1);
  const conflictEvidence = JSON.parse(readFileSync(join(unselected[0], "version-process.json"), "utf8")) as { capture_verified: boolean; process: { reaped: boolean } };
  expect(conflictEvidence.capture_verified).toBe(true);
  expect(conflictEvidence.process.reaped).toBe(true);
  const rollback = await bootstrap.inspectRetainedClient(approved.setup);
  expect(rollback.executable).toBe(first.executable);
  expect(rollback.version_evidence_sha256).toBe(first.version_evidence_sha256);
  expect(readFileSync(approved.index)).toEqual(originalIndex);
});

test("native distributions larger than report artifacts retain their actual approved bytes", async () => {
  const f = await clientFixture({ format: "executable", padding_bytes: 17 * 1024 * 1024 });
  const selected = await bootstrap.retainClientDistribution(f.setup);
  expect(readFileSync(selected.executable).length).toBe(f.setup.distribution.length);
  expect((await bootstrap.inspectRetainedClient(f.setup)).version).toBe(f.client.version);
}, 30000);

test("version probes use fresh profiles and caches while inherited credential values are absent", async () => {
  const program = ["#!/bin/sh", "printf '%s\\n' \"${COPILOT_GITHUB_TOKEN-unset}\" \"${ANTHROPIC_API_KEY-unset}\" \"$COPILOT_CACHE_HOME\" \"$TMPDIR\" > \"$HOME/probe-environment\"",
    "printf '%s\\n' 'GitHub Copilot CLI fixture-1.0.0.'"].join("\n") + "\n";
  const f = await clientFixture({ program });
  const previousCopilot = process.env.COPILOT_GITHUB_TOKEN, previousClaude = process.env.ANTHROPIC_API_KEY;
  process.env.COPILOT_GITHUB_TOKEN = "synthetic-inherited-copilot-canary"; process.env.ANTHROPIC_API_KEY = "synthetic-inherited-claude-canary";
  try {
    const selected = await bootstrap.retainClientDistribution(f.setup), probe = join(dirname(selected.directory), "probe-profile");
    expect(readFileSync(join(probe, "probe-environment"), "utf8").trim().split("\n")).toEqual(["unset", "unset", join(probe, "cache"), join(probe, "temporary")]);
    expect(probe).not.toBe(selected.profile_directory);
    expect(readdirSync(selected.profile_directory)).toEqual([]);
  } finally {
    if (previousCopilot === undefined) delete process.env.COPILOT_GITHUB_TOKEN; else process.env.COPILOT_GITHUB_TOKEN = previousCopilot;
    if (previousClaude === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previousClaude;
  }
});

test("a failed native version command retains its process result and publishes no client selection", async () => {
  const f = await clientFixture({ program: "#!/bin/sh\nprintf '%s\\n' 'GitHub Copilot CLI fixture-1.0.0.'\nexit 7\n" });
  await expect(bootstrap.retainClientDistribution(f.setup)).rejects.toThrow("owned client version process incomplete");
  const [build] = readdirSync(join(f.cache, "builds"));
  const result = JSON.parse(readFileSync(join(f.cache, "builds", build, "version-process.json"), "utf8")) as { process: { exit_code: number; reaped: boolean } };
  expect(result.process).toMatchObject({ exit_code: 7, reaped: true });
  expect(() => readFileSync(f.index)).toThrow("ENOENT");
});

function syntheticTar(entries: Array<{ name: string; type: "0" | "1" | "2" | "5"; link?: string; body?: string }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512), body = Buffer.from(entry.body ?? "");
    if (Buffer.byteLength(entry.name) > 100 || Buffer.byteLength(entry.link ?? "") > 100) throw Error("short synthetic tar paths required");
    header.write(entry.name, 0, 100); header.write("0000700\0", 100, 8);
    header.write("0000000\0", 108, 8); header.write("0000000\0", 116, 8);
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, 12);
    header.write("00000000000\0", 136, 12); header.fill(32, 148, 156);
    header.write(entry.type, 156); header.write(entry.link ?? "", 157, 100);
    header.write("ustar\0", 257); header.write("00", 263);
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    blocks.push(header);
    if (body.length) blocks.push(body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

test("retention materializes regular tar files while link and directory entries create no outside writes", async () => {
  const f = await clientFixture(), outside = realpathSync(mkdtempSync("/tmp/vh20-outside-")); roots.push(outside); chmodSync(outside, 0o700);
  f.setup.distribution = syntheticTar([
    { name: "bin", type: "2", link: outside },
    { name: f.setup.executable, type: "0", body: f.program },
    { name: "hardlink", type: "1", link: outside + "/absent" },
    { name: outside + "/directory", type: "5" },
  ]);
  f.client.distribution_sha256 = sha256(f.setup.distribution);
  const selected = await bootstrap.retainClientDistribution(f.setup);
  expect(readFileSync(selected.executable, "utf8")).toBe(f.program);
  expect(lstatSync(join(selected.directory, "bin")).isSymbolicLink()).toBe(false);
  expect(readdirSync(selected.directory)).toEqual(["bin"]);
  expect(readdirSync(outside)).toEqual([]);
});

test("an exec-format startup failure retains a diagnostic record and no selected client", async () => {
  const f = await clientFixture({ format: "executable", program: "\0invalid-native-executable" });
  let failed: unknown;
  try { await bootstrap.retainClientDistribution(f.setup); } catch (error) { failed = error; }
  expect(failed).toBeInstanceOf(Error);
  expect(typeof failed === "object" && failed !== null && "code" in failed ? failed.code : null).toBe("ENOEXEC");
  const [build] = readdirSync(join(f.cache, "builds"));
  const record = JSON.parse(readFileSync(join(f.cache, "builds", build, "version-failure.json"), "utf8")) as { capture_verified: boolean; error_code: string };
  expect(record.capture_verified).toBe(false);
  expect(record.error_code).toBe("ENOEXEC");
  expect(() => readFileSync(f.index)).toThrow("ENOENT");
});

test("a tar current-directory prefix retains the canonical client location", async () => {
  const f = await clientFixture();
  f.setup.distribution = syntheticTar([{ name: "./" + f.setup.executable, type: "0", body: f.program }]);
  f.client.distribution_sha256 = sha256(f.setup.distribution);
  const selected = await bootstrap.retainClientDistribution(f.setup);
  expect(selected.executable_relative).toBe(f.setup.executable);
  expect(readFileSync(selected.executable, "utf8")).toBe(f.program);
});
