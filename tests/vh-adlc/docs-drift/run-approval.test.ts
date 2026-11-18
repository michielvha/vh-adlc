/** Exact local approval retention only. These synthetic manifests grant no execution in this test. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { preflightFixture } from "./preflight-fixture";
import { createRunDirectory, latestRunArtifact } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { recordRunApproval } from "../../../plugins/vh-adlc/scripts/docs-drift/run-approval";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { manifestDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { readBoundArtifact } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("re-preparation before dispatch needs fresh exact approval and preserves the earlier request", () => {
  const f = preflightFixture(roots), source = f.head(), directory = join(f.root, "run");
  const run = createRunDirectory({ repo: f.repo, source, directory, origins: join(f.root, "origins"), entry: "interactive" });
  const manifest = structuredClone(f.plan.manifest);
  manifest.bindings.source_commit = source; manifest.bindings.settings_sha256 = captureSnapshot(f.repo, source).settings_sha256;
  const approve = () => writeFileSync(join(directory, "approval.yaml"), "manifest_sha256: " + manifestDigest(manifest) + "\nrequest: Approve this exact synthetic manifest\n", { mode: 0o600 });
  approve();
  const first = recordRunApproval({ repo: f.repo, run, manifest, command: "publish" }), original = latestRunArtifact(first, "approval");
  if (!original) throw Error("Original exact approval required");
  const bytes = readFileSync(join(directory, original.path));
  const effect = manifest.effects.find(effect => effect.kind === "pr-create");
  if (!effect) throw Error("Synthetic publication required");
  effect.payload.title = "Newly reviewed title";
  expect(() => recordRunApproval({ repo: f.repo, run: first, manifest, command: "publish" })).toThrow("exact displayed manifest");
  approve();
  const second = recordRunApproval({ repo: f.repo, run: first, manifest, command: "publish" }), current = latestRunArtifact(second, "approval");
  if (!current) throw Error("Fresh exact approval required");
  expect(current).not.toEqual(original);
  expect(JSON.parse(readBoundArtifact({ source_repo: f.repo, artifact_root: directory, reference: current }).toString()).manifest_sha256).toBe(manifestDigest(manifest));
  expect(readFileSync(join(directory, original.path))).toEqual(bytes);
}, 60000);
