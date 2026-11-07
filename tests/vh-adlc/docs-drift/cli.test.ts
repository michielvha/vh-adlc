import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import type { CLIReport } from "../../../plugins/vh-adlc/scripts/docs-drift/cli";
import { populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
function fixture(fault = "none") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-cli-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify(fault)).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  return { ...populateRepository(repo, false, scanner), root, artifacts };
}
function invoke(argv: string[], environment = process.env) {
  const result = Bun.spawnSync([process.execPath, entry, ...argv], { env: environment, stdout: "pipe", stderr: "pipe", timeout: 30000 });
  return { result, report: JSON.parse(result.stdout.toString()) as CLIReport };
}

test("the normal CLI scans the selected committed source and preserves dirty caller work", () => {
  const f = fixture();
  put(f.repo, "src/app.ts", "Other work stays local\n"); put(f.repo, "untracked", "Another task\n");
  put(f.repo, ".vh-adlc/docs-drift.yaml", "uncommitted_host_override: true\n");
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["scan", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts]);
  expect(result.exitCode).toBe(0);
  expect(report.command).toBe("scan");
  expect(report.outcome).toBe("collected");
  expect(report.source_commit).toBe(f.commit);
  expect(report.assessment?.complete).toBe(true);
  expect(report.assessment?.detectors).toHaveLength(2);
  expect(report.assessment?.checkout.startsWith(f.artifacts + "/")).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("the normal CLI retains incomplete collection and valid finding neighbors", () => {
  const f = fixture("mixed-findings");
  const { result, report } = invoke(["scan", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts]);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.assessment?.complete).toBe(false);
  expect(report.assessment?.findings.map((item: { detector: string }) => item.detector)).toEqual(["valid-before", "valid-after"]);
});

test.each([
  ["scan"], ["scan", "--fixture", "yes"], ["scan", "--collector", "yes"], ["scan", "--repo", "x", "--repo", "y"],
  ["scan", "--repo", "x", "--source", "main", "--artifact-root", "x"], ["publish", "--approved", "true"],
].map(argv => [argv]))("unknown, duplicate or unsafe CLI inputs return a structured refusal %j", argv => {
  const { result, report } = invoke(argv);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.diagnostics.length).toBeGreaterThan(0);
});

test.each(["caller", "shared", "symlink"] as const)("technical scan refuses artifact root %s", kind => {
  const f = fixture(), before = captureRepositoryState(f.repo);
  let artifacts = kind === "caller" ? f.repo : f.artifacts;
  if (kind === "shared") chmodSync(artifacts, 0o755);
  if (kind === "symlink") { artifacts = join(f.root, "artifact-alias"); symlinkSync(f.artifacts, artifacts); }
  const { result, report } = invoke(["scan", "--repo", f.repo, "--source", f.commit, "--artifact-root", artifacts]);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});


test("the normal scan entry keeps provider credentials out of the consumer scanner", () => {
  const f = fixture("environment");
  const { result, report } = invoke(["scan", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts], {
    ...process.env, GH_TOKEN: "synthetic-cli-gh-canary", COPILOT_GITHUB_TOKEN: "synthetic-cli-provider-canary",
  });
  expect(result.exitCode).toBe(0);
  if (!report.assessment) throw Error("missing scan assessment");
  const probe = JSON.parse(readFileSync(report.assessment.output_path + ".environment.json", "utf8")) as { environment: Record<string, unknown> };
  expect(probe.environment.GH_TOKEN).toBeUndefined();
  expect(probe.environment.COPILOT_GITHUB_TOKEN).toBeUndefined();
  expect(result.stdout.toString()).not.toContain("synthetic-cli-gh-canary");
});
