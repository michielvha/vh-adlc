import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assessmentReviewFixture } from "./assessment-review-fixture";
import { evidence } from "./manifest-fixture";
import { captureSyntheticRole } from "./original-publication-fixture";
import { put } from "./repository-fixture";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => {
  if (preserveRoots) console.error("Preserved failed owned assessment CLI roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("the normal assessment entries bind actual original captures and emit the reviewed report without effects", async () => {
  try {
    const started = performance.now(), f = await assessmentReviewFixture(roots), options = f.options;
    put(f.repo, "docs/guide.md", "Keep the caller's documentation draft\n");
    const before = captureRepositoryState(f.repo);
    const run = async (command: "collect-assessment-review-target" | "read-assessment-review", reviewer?: { path: string; sha256: string }) => {
      // Reserve both bounded CLI stages before either starts.
      expect(performance.now() - started).toBeLessThan(command === "collect-assessment-review-target" ? 60000 : 180000);
      const argv = [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
        "--repo", f.repo, "--source", f.source, "--artifact-root", f.artifacts,
        "--cache-root", options.cache_directory, "--entry", options.entry, "--launcher", options.launcher_path, "--settings", options.settings_path,
        "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
        "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256,
        "--worker-capture", f.worker.path, "--worker-capture-sha256", f.worker.sha256];
      if (reviewer) argv.push("--reviewer-capture", reviewer.path, "--reviewer-capture-sha256", reviewer.sha256);
      const env = Object.fromEntries(Object.entries(f.native.environment).filter((row): row is [string, string] => typeof row[1] === "string"));
      const completion = await executeOwnedProcess({ argv, cwd: f.repo, env, capture: "memory", watched_outputs: [], timeout_ms: 120000,
        stdout: join(f.artifacts, command + "-stdout"), stderr: join(f.artifacts, command + "-stderr"),
        started: pid => writeFileSync(join(f.artifacts, command + "-start.json"), canonicalJSON({ pid, argv }), { mode: 0o600 }) });
      const { captured, ...metadata } = completion, stdout = Buffer.from(captured?.stdout ?? []), stderr = Buffer.from(captured?.stderr ?? []);
      writeFileSync(join(f.artifacts, command + "-stdout"), stdout, { mode: 0o600 }); writeFileSync(join(f.artifacts, command + "-stderr"), stderr, { mode: 0o600 });
      writeFileSync(join(f.artifacts, command + "-process.json"), canonicalJSON(metadata), { mode: 0o600 });
      expect(metadata.reaped).toBe(true); expect(metadata.timed_out, JSON.stringify(metadata)).toBe(false);
      expect(metadata.exit_code, stderr.toString()).toBe(0); expect(stdout.length).toBeGreaterThan(0); expect(stdout.length).toBeLessThanOrEqual(524288);
      const result = JSON.parse(stdout.toString()); expect(result.outcome, JSON.stringify(result.diagnostics)).toBe("collected");
      return result;
    };
    const first = await run("collect-assessment-review-target"), target = first.assessment_review_target;
    expect(target).toMatchObject({ complete: true, authority: "none", review: null });
    expect(first.markdown).toBeUndefined();
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256,
      evidence("original-assessment-cli-reviewer", target.target_sha256, "NO FINDINGS\n"));
    const reviewed = await run("read-assessment-review", reviewer);
    expect(reviewed.assessment_review).toMatchObject({ complete: true, authority: "none", review: { target_sha256: target.target_sha256 } });
    expect(reviewed.markdown).toContain("Finding assessments independently reviewed by claude-opus-5.5");
    expect(reviewed.markdown).toContain("0 candidate(s)"); expect(reviewed.markdown).not.toContain("provisional pending independent review");
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).toBe("Keep the caller's documentation draft\n");
  } catch (error) { preserveRoots = true; throw error; }
}, 305000);
