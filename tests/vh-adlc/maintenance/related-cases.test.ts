import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createIndependentRepairCase } from "./related-cases";
import { installRecordingTransport } from "./publication-cases";
import { git } from "./fixtures";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
test("a declared independent fresh clone keeps its real source identity and hooks while primary owns the record scope", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-related-"));
  try {
    const transport = installRecordingTransport(root), f = createIndependentRepairCase(root, transport), clone = join(root, "owned-fresh-clone"), actual = Bun.spawnSync([join(transport.bin, "git"), "clone", f.source_remote, clone], { cwd: f.primary.main, env: transport.env, stdout: "pipe", stderr: "pipe" });
    expect({ exit: actual.exitCode, error: actual.exitCode ? actual.stderr.toString() : "" }).toEqual({ exit: 0, error: "" });
    expect(loadSettings(clone).repository).toBe("example/tooling"); expect(loadSettings(f.primary.main).repositories).toEqual([{ repository: "example/tooling", role: "independent" }]);
    expect(git(clone, "rev-parse", "HEAD")).toBe(f.source_base); expect(git(clone, "rev-parse", f.selected_bot_commit)).toBe(f.selected_bot_commit);
    expect(git(clone, "config", "core.hooksPath")).toBe(git(f.source_owner, "config", "core.hooksPath"));
    const fetched = Bun.spawnSync([join(transport.bin, "git"), "fetch", "origin", "main"], { cwd: clone, env: transport.env, stdout: "pipe", stderr: "pipe" }); expect(fetched.exitCode).toBe(0);
    const api = Bun.spawnSync([join(transport.bin, "gh"), "api", "--method", "GET", "--include", "repos/example/tooling"], { cwd: clone, env: transport.env, stdout: "pipe", stderr: "pipe" }); expect(api.exitCode).toBe(0); expect(api.stdout.toString()).toContain('"full_name":"example/tooling"');
    expect(git(f.source_owner, "rev-parse", "HEAD")).toBe(f.source_owner_state.head); expect(digest(readFileSync(git(f.source_owner, "rev-parse", "--path-format=absolute", "--git-path", "index")))).toBe(f.source_owner_state.index);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { existsSync, writeFileSync } from "node:fs";
import { installSourceCheckRecorder } from "./delivery-cases";
test("the satellite's actual committed builder fails before repair and produces a source-bound artifact before any primary pointer change", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-builder-"));
  try {
    const transport = installRecordingTransport(root), f = createIndependentRepairCase(root, transport, "satellite"); installSourceCheckRecorder(root, transport);
    expect(loadSettings(f.primary.main).repositories).toEqual([{ repository: "example/builder", role: "synced", sync_workflow: ".github/workflows/sync-builder.yml" }]);
    const failedOutput = join(root, "builds/failed.json"), failed = Bun.spawnSync([join(transport.bin, "bun"), "scripts/build.ts", "--output", failedOutput], { cwd: f.seed_bot_checkout, env: transport.env, stdout: "pipe", stderr: "pipe" }); expect(failed.exitCode).not.toBe(0); expect(existsSync(failedOutput)).toBe(false);
    writeFileSync(join(f.seed_bot_checkout, "src/greet.ts"), readFileSync(join(f.seed_bot_checkout, "src/greet.ts"), "utf8").replaceAll("oldCall", "newCall"));
    expect(Bun.spawnSync([process.execPath, "scripts/regenerate-lock.ts"], { cwd: f.seed_bot_checkout, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
    git(f.seed_bot_checkout, "add", "src/greet.ts", "runtime-lock.json"); git(f.seed_bot_checkout, "commit", "-qm", "fix: synthetic builder caller before pointer preparation");
    const output = join(root, "builds/repaired.json"), built = Bun.spawnSync([join(transport.bin, "bun"), "scripts/build.ts", "--output", output], { cwd: f.seed_bot_checkout, env: transport.env, stdout: "pipe", stderr: "pipe" }); expect({ exit: built.exitCode, error: built.stderr.toString() }).toEqual({ exit: 0, error: "" });
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({ repository: "example/builder", source_commit: git(f.seed_bot_checkout, "rev-parse", "HEAD"), widget: "1.1.0", greeting: "Hello, Zoë." });
    expect(JSON.parse(readFileSync(join(f.primary.main, "deps/builder.version.json"), "utf8")).widget).toBe("1.0.0"); expect(git(f.primary.main, "diff", "--name-only", f.primary.base, f.primary_bot_commit!)).toBe("deps/builder.version.json");
    expect(readFileSync(transport.trace, "utf8")).toContain('"kind":"source-build"');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
