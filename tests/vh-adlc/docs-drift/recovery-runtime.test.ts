import { afterAll, expect, test } from "bun:test";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as bootstrap from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { runtimeFixture } from "./runtime-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["matching", "changed-worktree-policy", "wrong-adoption", "changed-component", "missing-client"])("recovery selection preserves the original retained runtime for %s", async scenario => {
  const f = await runtimeFixture(roots, true);
  const approved = await bootstrap.selectApprovedRuntime({ ...f.selection, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") });
  const input = { repo: f.repo, source_commit: f.selection.current_default, identity: f.selection.identity, cache_directory: f.selection.cache_directory,
    entry: f.selection.entry, adoption_sha256: approved.adoption_sha256 };
  if (scenario === "changed-worktree-policy") {
    writeFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), "Changed current policy must be preserved\n");
    writeFileSync(f.selection.launcher_path, "Changed launcher must be preserved\n");
  }
  if (scenario === "wrong-adoption") input.adoption_sha256 = "0".repeat(64);
  if (scenario === "changed-component") {
    const path = join(f.retained.directory, "scripts/runner.ts");
    chmodSync(path, 0o600); writeFileSync(path, "Changed original runtime\n"); chmodSync(path, 0o400);
  }
  if (scenario === "missing-client") rmSync(f.approved.directory, { recursive: true });
  const before = captureRepositoryState(f.repo);
  if (scenario === "matching" || scenario === "changed-worktree-policy") {
    const runtime = await bootstrap.selectRecoveryRuntime(input);
    expect(runtime).toMatchObject({ kind: "docs-drift-recovery-runtime", authority: "none", purpose: "metadata-recovery", source_commit: input.source_commit,
      adoption_sha256: approved.adoption_sha256, component: { directory: approved.component.directory }, worker: { profile_directory: approved.worker.profile_directory } });
    expect(runtime.worker.client.version).toBe("fixture-1.0.0");
  } else await expect(bootstrap.selectRecoveryRuntime(input)).rejects.toThrow();
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 60000);
