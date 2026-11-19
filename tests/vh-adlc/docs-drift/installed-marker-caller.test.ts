import * as filesystem from "node:fs";
import { afterAll, expect, spyOn, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { computeComponentIdentity, inspectInstalledPayload } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const completed = new Set<string>(), roots: string[] = [];
afterAll(() => {
  for (const root of roots) {
    if (completed.has(root)) rmSync(root, { recursive: true, force: true });
    else console.error("Retained failed marker caller fixture: " + root);
  }
});

const cases = (["report", "prepare"] as const).flatMap(command =>
  (["removal", "replacement", "invalid"] as const).map(fault => [command, fault] as const));
test.each(cases)("ordinary %s caller preserves marker failure outcomes and explicit rerun: %s", async (command, fault) => {
  const sourceRepo = resolve(import.meta.dir, "../../.."), source = readGit(sourceRepo, "rev-parse", "HEAD").toString().trim();
  const identity = computeComponentIdentity(sourceRepo, source);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-marker-caller-"))), repo = join(root, "source"), plugin = join(root, "installed"), directory = join(root, "run");
  roots.push(root);
  cpSync(join(sourceRepo, "plugins/vh-adlc"), plugin, { recursive: true });
  // Validate the exact copied component before importing any code from it.
  inspectInstalledPayload({ directory: plugin, expected: identity });
  cpSync(join(sourceRepo, "plugins/vh-adlc/examples/docs-drift/basic"), repo, { recursive: true });
  const settings = join(repo, ".vh-adlc/docs-drift.yaml");
  writeFileSync(settings, readFileSync(settings, "utf8").replace("component: null", "component:\n  plugin_version: " + identity.plugin_version
    + "\n  source_commit: " + identity.source_commit + "\n  component_sha256: " + identity.component_sha256));
  readGit(repo, "init", "--template=", "-b", "main"); readGit(repo, "add", "--all");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Owned marker caller fixture");
  const consumer = readGit(repo, "rev-parse", "HEAD").toString().trim(), before = captureRepositoryState(repo);
  const runtime: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/run-cli") = await import(pathToFileURL(join(plugin, "scripts/docs-drift/run-cli.ts")).href);
  const validation: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/runtime-validation") = await import(pathToFileURL(join(plugin, "scripts/docs-drift/runtime-validation.ts")).href);
  const transport: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/transport") = await import(pathToFileURL(join(plugin, "scripts/docs-drift/transport.ts")).href);
  const metadata = join(plugin, ".in_use"), marker = join(metadata, "12345"), replacement = join(root, "replacement");
  mkdirSync(metadata); const bytes = '{"pid":12345,"procStart":"1"}'; writeFileSync(marker, bytes);
  let output = "", nativeCalls = 0, armed = false, attempts = 0;
  const originalWrite = filesystem.writeSync, originalList = filesystem.readdirSync, originalOpen = filesystem.openSync;
  const previousState = process.env.XDG_STATE_HOME; process.env.XDG_STATE_HOME = join(root, "state");
  const writing = spyOn(filesystem, "writeSync").mockImplementation(((...args: unknown[]) => {
    if (args[0] === 1 && typeof args[1] === "string") { output += args[1]; return Buffer.byteLength(args[1]); }
    return Reflect.apply(originalWrite, filesystem, args) as number;
  }) as typeof filesystem.writeSync);
  const listing = spyOn(filesystem, "readdirSync").mockImplementation(((...args: unknown[]) => {
    const result = Reflect.apply(originalList, filesystem, args) as ReturnType<typeof filesystem.readdirSync>;
    if (armed && fault === "removal" && args[0] === metadata) { attempts++; armed = false; rmSync(marker); }
    return result;
  }) as typeof filesystem.readdirSync);
  const opening = spyOn(filesystem, "openSync").mockImplementation((...args: unknown[]) => {
    if (armed && fault === "replacement" && args[0] === marker) { attempts++; armed = false; filesystem.renameSync(replacement, marker); }
    return Reflect.apply(originalOpen, filesystem, args) as number;
  });
  const native = spyOn(transport, "readNativeCredential").mockImplementation(async () => {
    nativeCalls++; throw Error("Unexpected native work in a marker refusal");
  });
  async function invoke(command: string, extra: string[] = []) {
    output = "";
    const status = await runtime.runDirectoryMain([command, "--repo", repo, "--run-dir", directory, ...extra]);
    const report: unknown = JSON.parse(output);
    if (report === null || typeof report !== "object" || Array.isArray(report)) throw Error("CLI report required");
    return { status, report: report as Record<string, unknown> };
  }
  try {
    const healthy = await invoke("scan", ["--source", consumer]);
    expect(healthy.status).toBe(0); expect(healthy.report.component).toMatchObject({ matched: true });
    writeFileSync(marker, fault === "invalid" ? '{"pid":12345,"procStart":"bad"}' : bytes);
    writeFileSync(replacement, bytes); armed = true; const previousAttempts = attempts;
    await validation.withRuntimeValidation(async () => {
        const refused = await invoke(command);
        expect(refused.report.outcome).toBe(command === "report" ? "pending" : "setup-required");
        expect(refused.status).toBe(command === "report" ? 1 : 2);
        expect(refused.report).toMatchObject({ outcome: command === "report" ? "pending" : "setup-required", component: { matched: false } });
        expect(refused.report.diagnostics).toEqual([expect.stringContaining("selected component differs")]);
        expect(attempts - previousAttempts).toBe(fault === "invalid" ? 0 : 1);
        expect(nativeCalls).toBe(0);
        armed = false; writeFileSync(marker, bytes);
        const rerun = await invoke("scan");
        expect(rerun.status).toBe(0);
        expect(rerun.report).toMatchObject({ outcome: "collected", component: { matched: true } });
        expect(readFileSync(marker, "utf8")).toBe(bytes);
    });
    expect(nativeCalls).toBe(0); expect(captureRepositoryState(repo)).toEqual(before);
    completed.add(root);
  } finally {
    native.mockRestore(); opening.mockRestore(); listing.mockRestore(); writing.mockRestore();
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
  }
});
