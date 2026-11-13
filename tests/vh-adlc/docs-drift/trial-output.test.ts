import { afterAll, expect, test } from "bun:test";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { syntheticTrialFixture } from "./trial-fixture";
import { readTrialTracker } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-tracker";
import { loadTrialContext } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { git } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("the synthetic report bound includes the full UTF-8 envelope and final newline", async () => {
  const { encodeTrialEntryReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/trial-output");
  const report = { schema_version: 1, kind: "docs-drift-synthetic-entry", context_sha256: "a".repeat(64),
    component_sha256: "b".repeat(64), receipt_path: "/private/試験/report.json", data: { scopes: ["é is evidence"] } };
  const expected = Buffer.from(JSON.stringify(report) + "\n");
  expect(Buffer.byteLength(JSON.stringify(report.data))).toBeLessThan(expected.length - 1);
  expect(() => encodeTrialEntryReport(report, expected.length - 1)).toThrow("Synthetic entry report exceeds the retained entry bound");
  expect(encodeTrialEntryReport(report, expected.length)).toEqual(expected);
});

test("the installed synthetic entry refuses an oversized full envelope before publishing its receipt", () => {
  const f = syntheticTrialFixture(roots, { max_entry_bytes: 512 });
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"), tracker = readTrialTracker(context).commit;
  const before = readdirSync(context.artifacts);
  const result = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), "inspect",
    "--synthetic-trial", f.root, "--context-commit", f.contextCommit], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(result.stdout.toString());
  expect(result.exitCode, JSON.stringify(report)).toBe(2);
  expect(report.outcome).toBe("refused");
  expect(report.diagnostics[0].message).toBe("Synthetic entry report exceeds the retained entry bound");
  expect(result.stdout.length).toBeLessThanOrEqual(512);
  expect(readdirSync(context.artifacts)).toEqual(before);
  expect(readTrialTracker(context).commit).toBe(tracker);
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
}, 90000);


test("the installed synthetic entry preserves a complete receipt that fits its full envelope bound", () => {
  const f = syntheticTrialFixture(roots, { max_entry_bytes: 2048 });
  const result = Bun.spawnSync([process.execPath, join(f.runtime, "scripts/docs-drift/trial-entry.ts"), "inspect",
    "--synthetic-trial", f.root, "--context-commit", f.contextCommit], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(result.stdout.toString());
  expect(result.exitCode, JSON.stringify(report)).toBe(0);
  expect(report.outcome).toBe("complete");
  expect(report.context_commit).toBe(f.contextCommit);
  expect(result.stdout.length).toBeLessThanOrEqual(2048);
  expect(JSON.parse(readFileSync(report.receipt_path, "utf8"))).toEqual(report);
}, 90000);
