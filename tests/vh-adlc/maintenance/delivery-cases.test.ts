import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuthoredRepairCase } from "./delivery-cases";
import { installRecordingTransport, publicationState } from "./publication-cases";
import { git } from "./fixtures";
test("the selected bot patch really breaks the preserved caller contract while the owner checkout stays unchanged", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-authored-case-"));
  try {
    const item = createAuthoredRepairCase(root, "primary-repair", installRecordingTransport(root));
    const good = Bun.spawnSync([process.execPath, "test", "tests"], { cwd: item.primary.main, stdout: "pipe", stderr: "pipe" }); expect(good.exitCode).toBe(0);
    const bad = Bun.spawnSync([process.execPath, "test", "tests"], { cwd: item.seed_bot_checkout, stdout: "pipe", stderr: "pipe" }); expect(bad.exitCode).not.toBe(0); expect(bad.stderr.toString()).toContain("oldCall");
    expect(git(item.primary.main, "rev-parse", "HEAD")).toBe(item.primary.base);
    expect(publicationState(item.primary).invocation_index).toBe(item.primary.initial.invocation_index);
    expect(readFileSync(join(item.primary.invocation, "unrelated-staged.txt"), "utf8")).toBe("keep the other writer's staged bytes\n");
    expect(git(item.primary.main, "diff", "--name-only", item.primary.base, item.selected_bot_commit).split("\n").sort()).toEqual(["package.json", "runtime-lock.json", "vendor/widget.ts"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { isNormalizationDelta } from "./authored-trial";
test("generated-input classification preserves the selected version and rejects an independent target or unexplained field", () => {
  const before = '{"widget":"1.1.0","normalized":false}', selected = '{"fixture_widget_version":"1.1.0"}';
  expect(isNormalizationDelta(before, '{"widget":"1.1.0","normalized":true}', selected)).toBe(true);
  expect(isNormalizationDelta(before, '{"widget":"1.2.0","normalized":true}', selected)).toBe(false);
  expect(isNormalizationDelta(before, '{"widget":"1.1.0","normalized":true,"override":"new"}', selected)).toBe(false);
  expect(isNormalizationDelta(before, 'bad JSON', selected)).toBe(false);
});

import { enableSelectedDeliveryTransport, installSourceCheckRecorder } from "./delivery-cases";
test("native fixture check and delivery recordings observe real checks and one exact selected PR", () => {
  const temporary = mkdtempSync(join(tmpdir(), "maintenance-delivery-transport-")), actual = join(temporary, "actual"), root = join(temporary, "alias");
  mkdirSync(actual); symlinkSync(actual, root, "dir");
  try {
    const transport = installRecordingTransport(root), item = createAuthoredRepairCase(root, "primary-repair", transport); installSourceCheckRecorder(root, transport);
    const checked = Bun.spawnSync([join(transport.bin, "bun"), "test", "tests"], { cwd: item.seed_bot_checkout, env: transport.env, stdout: "pipe", stderr: "pipe" }); expect(checked.exitCode).not.toBe(0);
    let trace = readFileSync(transport.trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(trace.find(row => row.kind === "source-check")?.head).toBe(item.selected_bot_commit);
    expect(trace.find(row => row.kind === "source-check")?.stderr).toContain("oldCall");
    expect(trace.find(row => row.kind === "source-check")?.executable?.path).toBe(realpathSync(join(transport.bin, "bun")));
    const normalized = Bun.spawnSync([join(transport.bin, "bun"), "scripts/regenerate-lock.ts"], { cwd: item.seed_bot_checkout, env: transport.env, stdout: "pipe", stderr: "pipe" }); expect(normalized.exitCode).toBe(0);
    const normalizer = readFileSync(transport.trace, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(row => row.kind === "source-normalizer");
    expect(normalizer?.head).toBe(item.selected_bot_commit); expect(normalizer?.exit_code).toBe(0); expect(normalizer?.full_argv).toEqual([realpathSync(join(transport.bin, "bun")), "scripts/regenerate-lock.ts"]); expect(normalizer?.runtime?.sha256).toMatch(/^[a-f0-9]{64}$/); expect(normalizer?.executable?.sha256).toMatch(/^[a-f0-9]{64}$/);
    const sourceRef = "chore/selected-fixture-source"; git(item.primary.main, "branch", sourceRef, item.primary.base); git(item.primary.main, "push", item.primary.remote, sourceRef);
    enableSelectedDeliveryTransport(root, item, sourceRef);
    const invoke = (...args: string[]) => Bun.spawnSync([join(transport.bin, "gh"), ...args], { cwd: item.primary.main, env: transport.env, stdout: "pipe", stderr: "pipe" });
    expect(invoke("pr", "create", "--head", "wrong", "--base", "main", "--title", "wrong").exitCode).not.toBe(0);
    expect(invoke("pr", "create", "--head", sourceRef, "--base", "main", "--title", "Selected fixture only", "--body", "Synthetic test").exitCode).toBe(0);
    expect(invoke("pr", "create", "--head", sourceRef, "--base", "main").exitCode).not.toBe(0);
    const listed = invoke("pr", "list", "--head", sourceRef, "--json", "number,headRefOid"); expect(listed.exitCode).toBe(0); expect(JSON.parse(listed.stdout.toString())[0].headRefOid).toBe(item.primary.base);
    trace = readFileSync(transport.trace, "utf8").trim().split("\n").map(line => JSON.parse(line)); expect(trace.filter(row => row.kind === "gh-effect").length).toBe(1);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

import { isReadOnlyTrackerCommand } from "./authored-trial";
test("pre-review scope permits real tracker reads and rejects explicit or implicit API writes", () => {
  expect(isReadOnlyTrackerCommand(["pr", "list", "--repo", "example/tooling"])).toBe(true);
  expect(isReadOnlyTrackerCommand(["api", "--method", "GET", "repos/example/tooling", "-f", "page=1"])).toBe(true);
  expect(isReadOnlyTrackerCommand(["pr", "create", "--repo", "example/tooling"])).toBe(false);
  expect(isReadOnlyTrackerCommand(["api", "-X", "POST", "repos/example/tooling/pulls"])).toBe(false);
  expect(isReadOnlyTrackerCommand(["api", "repos/example/tooling/issues", "--field", "state=closed"])).toBe(false);
  expect(isReadOnlyTrackerCommand(["repo", "edit", "--enable-auto-merge"])).toBe(false);
});
