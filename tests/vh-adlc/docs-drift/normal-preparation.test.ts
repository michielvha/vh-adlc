/** Exercise normal preparation through owned native processes. No actual provider or remote writes. */
import { afterAll, expect, test } from "bun:test";
import { cpSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configureMixedPlanFixture, ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";
import { auditClient } from "./native-audit-client-fixture";
import { installOwnedNativeService } from "./original-publication-fixture";
import { git } from "./repository-fixture";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readRunDirectory } from "../../../plugins/vh-adlc/scripts/docs-drift/run-directory";
import { readBoundArtifact } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";

const roots: string[] = [];
let passed = false;
afterAll(() => {
  if (!passed) console.error("Preserved failed normal preparation fixtures", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each(["matching", "caller-change", "mixed-plans", "prepare-protocol"])("normal prepare retains the original worker selection and edits only its owned candidate: %s", async fault => {
  const component = ordinaryComponentFixture(roots, true), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable },
    fault === "mixed-plans" ? configureMixedPlanFixture : undefined);
  writeFileSync(component.executable, auditClient(["mixed-plans", "prepare-protocol"].includes(fault) ? fault : "prepare", true), { mode: 0o755 });
  const source = f.head(), origin = join(f.root, "origin.git"), directory = join(f.root, "run"), state = join(f.root, "state");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const service = installOwnedNativeService({ root: f.root, origin, source, head: source, publisher_identity: { actor: "fixture-owner", actor_id: 30 } });
  const before = captureRepositoryState(f.repo), nativeBefore = readFileSync(service.statePath), refs = git(origin, "for-each-ref");
  async function invoke(command: string, selectedDirectory = directory) {
    const runtime = command === "publish" || command === "resume" ? process.env.VH_ADLC_TEST_ALTERNATE_BUN ?? process.execPath : process.execPath;
    const result = await executeOwnedProcess({ argv: [runtime, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
      "--repo", f.repo, "--run-dir", selectedDirectory, ...(command === "scan" ? ["--source", source] : [])], cwd: f.repo,
      env: { PATH: join(f.root, "native-bin") + ":" + process.env.PATH, HOME: process.env.HOME!, GH_TOKEN: "synthetic-native-token",
        COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", XDG_STATE_HOME: state, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      capture: "memory", watched_outputs: [], timeout_ms: 900000, stdout: join(f.root, command + ".stdout"),
      stderr: join(f.root, command + ".stderr"), started: () => {} });
    expect(result.reaped).toBe(true); expect(result.timed_out).toBe(false);
    return { result, report: JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString()) as unknown };
  }
  expect((await invoke("scan")).result.exit_code).toBe(0);
  const ids = fault === "mixed-plans" ? ["guide-fix", "index-fix", "status-fix", "checkbox-fix"] : ["guide-fix"];
  writeFileSync(join(directory, "prepare.yaml"), "decisions:\n" + ids.map(id => "  - id: " + id + "\n    reason: Correct this selected synthetic source\n").join("") + "attention: []\n", { mode: 0o600 });
  const prepared = await invoke("prepare");
  expect(prepared.report).toMatchObject({ command: "prepare", outcome: "collected" });
  expect(prepared.result.exit_code).toBe(0);
  const run = readRunDirectory({ repo: f.repo, directory, origins: join(state, "vh-adlc/docs-drift/origins") });
  const stage = run.stages.at(-1);
  expect(stage?.command).toBe("prepare"); expect(stage?.state).toBe("complete");
  const reference = stage?.artifacts.preparation;
  if (!reference) throw Error("Original preparation reference required");
  const preparation = JSON.parse(readBoundArtifact({ source_repo: f.repo, artifact_root: directory, reference }).toString());
  expect(preparation.prepared.state).toBe("prepared-uncommitted");
  expect(readFileSync(join(preparation.prepared.checkout, "docs/guide.md"), "utf8")).toBe("# Corrected guide\n");
  if (fault === "mixed-plans") {
    expect(readFileSync(join(preparation.prepared.checkout, "docs/plans/README.md"), "utf8")).toContain("Current link");
    expect(readFileSync(join(preparation.prepared.checkout, "docs/plans/legacy.md"), "utf8"))
      .toContain("status: complete\ngoal: Preserve this contract");
    expect(readFileSync(join(preparation.prepared.checkout, "docs/plans/legacy.md"), "utf8"))
      .toContain("- [x] Verified behavior\n## Evidence\nOriginal retained evidence");
  }
  expect(stage?.artifacts.worker_capture).toBeDefined(); expect(stage?.artifacts.selection).toBeDefined();
  git(preparation.prepared.checkout, "add", "docs/guide.md", ...(fault === "mixed-plans" ? ["docs/plans"] : []));
  git(preparation.prepared.checkout, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Selected guide correction");
  const verified = await invoke("verify");
  expect(verified.report).toMatchObject({ command: "verify", outcome: "collected" }); expect(verified.result.exit_code).toBe(0);
  const final = readRunDirectory({ repo: f.repo, directory, origins: join(state, "vh-adlc/docs-drift/origins") }).stages.at(-1);
  expect(final?.command).toBe("verify"); expect(final?.state).toBe("complete");
  expect(final?.artifacts.candidate_verification).toBeDefined(); expect(final?.artifacts.reviewer_capture).toBeDefined();
  expect(final?.artifacts.reviewed_plan).toBeDefined();
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(readFileSync(service.statePath)).toEqual(nativeBefore); expect(git(origin, "for-each-ref")).toBe(refs);
  const manifest = final?.artifacts.reviewed_plan;
  if (!manifest) throw Error("Exact reviewed manifest required");
  const callsBeforeRefusals = readFileSync(service.calls), roleCalls = readFileSync(join(directory, "synthetic-role-order.jsonl"));
  const missingApproval = await invoke("publish");
  expect(missingApproval.result.exit_code).toBe(2);
  expect(missingApproval.report).toMatchObject({ outcome: "setup-required" });
  const copy = join(f.root, "copied-prepared-run"); cpSync(directory, copy, { recursive: true });
  const copied = await invoke("publish", copy);
  expect(copied.result.exit_code).toBe(2);
  // A missing approval also asks for setup, so assert the refusal only the ownership check gives.
  expect(copied.report).toMatchObject({ outcome: "setup-required",
    diagnostics: ["The original host ownership record is required for executing stages. Use resume --action inspect to observe this copy."] });
  const reviewer = final?.artifacts.reviewer_capture;
  if (!reviewer) throw Error("Original reviewer capture required");
  const rolePath = join(directory, reviewer.path), unavailable = rolePath + ".unavailable";
  renameSync(rolePath, unavailable);
  try {
    const missingRole = await invoke("publish");
    expect(missingRole.result.exit_code).toBe(2);
    expect(missingRole.report).toMatchObject({ outcome: "incomplete" });
  } finally { renameSync(unavailable, rolePath); }
  writeFileSync(join(directory, "approval.yaml"), "manifest_sha256: " + "f".repeat(64) + "\nrequest: Approve another synthetic batch\n", { mode: 0o600 });
  const wrongApproval = await invoke("publish");
  expect(wrongApproval.result.exit_code).toBe(2);
  expect(wrongApproval.report).toMatchObject({ outcome: "incomplete" });
  expect(readFileSync(service.calls)).toEqual(callsBeforeRefusals);
  expect(readFileSync(service.statePath)).toEqual(nativeBefore); expect(git(origin, "for-each-ref")).toBe(refs);
  writeFileSync(join(directory, "approval.yaml"), "manifest_sha256: " + manifest.sha256 + "\nrequest: Approve this exact synthetic publication batch\n", { mode: 0o600 });
  const head = git(preparation.prepared.checkout, "rev-parse", "HEAD");
  git(origin, "fetch", "--no-write-fetch-head", preparation.prepared.checkout, head);
  const native = JSON.parse(readFileSync(service.statePath, "utf8")); native.publication_commit = head;
  writeFileSync(service.statePath, JSON.stringify(native), { mode: 0o600 });
  if (fault === "caller-change") {
    const executable = join(f.root, "native-service/git");
    const injection = 'if (process.argv[1].endsWith("/git") && args.includes('
      + JSON.stringify(":" + f.afterSettings.publication.lease_ref) + ')) writeFileSync('
      + JSON.stringify(join(f.repo, "README.md")) + ', "Changed caller during final publication effect\\n");\n';
    const program = readFileSync(executable, "utf8");
    if (!program.includes("const nativeEnvironment =")) throw Error("Owned native effect injection point required");
    writeFileSync(executable, program.replace("const nativeEnvironment =", injection + "const nativeEnvironment ="));
  }
  const published = await invoke("publish");
  if (fault === "caller-change") expect(readFileSync(join(f.repo, "README.md"), "utf8")).toBe("Changed caller during final publication effect\n");
  expect(published.report).toMatchObject({ command: "publish", outcome: fault === "caller-change" ? "incomplete" : "collected", publication_effects: { state: "complete" } });
  expect(published.result.exit_code).toBe(fault === "caller-change" ? 2 : 0);
  const deliveredRun = readRunDirectory({ repo: f.repo, directory, origins: join(state, "vh-adlc/docs-drift/origins") });
  const deliveredStage = deliveredRun.stages.at(-1);
  expect(deliveredStage?.command).toBe("publish");
  expect(deliveredStage?.state).toBe(fault === "caller-change" ? "pending" : "complete");
  const deliveredReference = deliveredStage?.artifacts.publication_result;
  if (!deliveredReference) throw Error("Already executed publication evidence must remain referenced");
  expect(JSON.parse(readBoundArtifact({ source_repo: f.repo, artifact_root: directory, reference: deliveredReference }).toString()))
    .toMatchObject({ publication_effects: { state: "complete" } });
  const completed = JSON.parse(readFileSync(service.statePath, "utf8"));
  expect(completed.prs).toHaveLength(1); expect(completed.prs[0].title).toBe("Repair the guide");
  if (fault !== "caller-change") expect(captureRepositoryState(f.repo)).toEqual(before);
  else expect(captureRepositoryState(f.repo)).not.toEqual(before);
  const resumed = await invoke("resume");
  expect(resumed.report).toMatchObject({ command: "resume", outcome: "collected", publication_effects: { state: "complete" } });
  const selectedVersion = Bun.spawnSync([process.env.VH_ADLC_TEST_ALTERNATE_BUN ?? process.execPath, "--version"], { stdout: "pipe", stderr: "pipe", timeout: 5000 });
  expect(selectedVersion.exitCode).toBe(0);
  expect(resumed.report).toMatchObject({ bun_version: selectedVersion.stdout.toString().trim() });
  expect(resumed.result.exit_code).toBe(0);
  expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(1);
  if (fault !== "caller-change") expect(captureRepositoryState(f.repo)).toEqual(before);
  else expect(captureRepositoryState(f.repo)).not.toEqual(before);
  expect(readFileSync(join(directory, "synthetic-role-order.jsonl"))).toEqual(roleCalls);
  passed = true;
}, 1200000);
