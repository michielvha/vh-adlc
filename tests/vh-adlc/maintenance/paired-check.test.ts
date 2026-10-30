import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createAuthoredRepairCase, installSourceCheckRecorder } from "./delivery-cases";
import { installRecordingTransport } from "./publication-cases";
import { git } from "./fixtures";
import { runPairedChecks } from "./paired-check";
test("independent worker binds the actual committed source, baseline and Definition and rejects a changed verification-input export", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-paired-worker-"));
  try {
    const transport = installRecordingTransport(root), item = createAuthoredRepairCase(root, "primary-repair", transport); installSourceCheckRecorder(root, transport);
    const source = item.seed_bot_checkout, record = join(root, "record"), packet = join(root, "input"), output = join(root, "output"); mkdirSync(packet); mkdirSync(output);
    writeFileSync(join(source, "src/greet.ts"), readFileSync(join(source, "src/greet.ts"), "utf8").replaceAll("oldCall", "newCall"));
    expect(Bun.spawnSync([process.execPath, "scripts/regenerate-lock.ts"], { cwd: source, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
    git(source, "add", "src/greet.ts", "runtime-lock.json"); git(source, "commit", "-qm", "fix: synthetic caller and selected generated input");
    git(item.primary.main, "worktree", "add", "-b", "fixture-paired-record", record, item.primary.base);
    mkdirSync(dirname(join(record, item.record_path)), { recursive: true }); writeFileSync(join(record, item.record_path), "# Synthetic record\n\n## Definition\n\nPreserve the greeting API.\n\n## Evidence\n\nPending review.\n"); git(record, "add", item.record_path); git(record, "commit", "-qm", "docs: synthetic paired Definition");
    const h = { source_repository: "example/project", record_repository: "example/project", affected_paths: ["src/greet.ts", "runtime-lock.json"], source_root: source, source_target: git(source, "rev-parse", "HEAD"), task_base: item.selected_bot_commit, record_root: record, record_target: git(record, "rev-parse", "HEAD"), record_path: item.record_path };
    for (const [label, target] of [["source", h.source_target], ["baseline", h.task_base], ["contract-baseline", item.primary.base]]) {
      const path = join(packet, label); mkdirSync(path);
      const archived = Bun.spawnSync(["git", "-C", source, "archive", target], { stdout: "pipe", stderr: "pipe" }); expect(archived.exitCode).toBe(0);
      expect(Bun.spawnSync(["tar", "-x", "-C", path], { stdin: archived.stdout, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
    }
    writeFileSync(join(packet, "repair-record.md"), readFileSync(join(record, item.record_path)));
    const options = { handoff: h, previous_record_target: null, selected_bot_commit: item.selected_bot_commit, contract_base: item.primary.base, primary: item.primary, packet, output, receipt: join(output, "execution.json"), sourceIndex: git(source, "rev-parse", "--path-format=absolute", "--git-path", "index"), recordIndex: git(record, "rev-parse", "--path-format=absolute", "--git-path", "index"), git: Bun.which("git"), bun: join(transport.bin, "bun") };
    const recordBytes = readFileSync(join(packet, "repair-record.md"));
    writeFileSync(join(packet, "repair-record.md"), recordBytes.toString().trimEnd());
    expect(() => runPairedChecks({ ...options, receipt: join(output, "trimmed.json") })).toThrow("committed Definition correspondence failed");
    writeFileSync(join(packet, "repair-record.md"), recordBytes);
    expect(() => runPairedChecks({ ...options, previous_record_target: h.record_target, receipt: join(output, "self-comparison.json") })).toThrow("distinct actual target");
    const observed = runPairedChecks(options); expect(observed.preserved).toBe(true); expect(observed.correspondence.source_inputs.some(row => row.path === "runtime-lock.json")).toBe(true); expect(observed.source_check.argv[0]).toBe(options.bun); expect(observed.source_check.exit_code).toBe(0); expect(observed.baseline_check.exit_code).not.toBe(0); expect(observed.normalizer_check.pass).toBe(true);
    writeFileSync(join(packet, "source/src/app.ts"), "// forged otherwise unused verification input\n");
    expect(() => runPairedChecks({ ...options, receipt: join(output, "forged.json") })).toThrow("Git blob/mode mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30_000);
