import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTrialPublication } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-publication";
import { loadTrialContext } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { readTrialTracker } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-tracker";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { persistentTrialPublication, syntheticTrialFixture } from "./trial-fixture";
import { git } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("a report flag cannot authorize synthetic publication", () => {
  const f = syntheticTrialFixture(roots);
  const context = loadTrialContext({ root: f.root, context_commit: f.contextCommit, runtime_directory: f.runtime });
  const request = join(context.artifacts, "request.json");
  writeFileSync(request, canonicalJSON({ approved: true, transport: "native", repository: "real/consumer" }), { mode: 0o600 });
  expect(() => readTrialPublication(context, request)).toThrow("synthetic publication fields");
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
});

async function publicationRequest() {
  const fixture = persistentTrialPublication(roots, { bound_roles: true }), { context, options } = fixture;
  const { review } = await options.gate();
  function retain(name: string, bytes: Uint8Array) {
    writeFileSync(join(context.artifacts, name), bytes, { mode: 0o600 });
    return { path: name, sha256: sha256(bytes) };
  }
  function role(name: "worker" | "reviewer") {
    const selected = review[name], { captured: _captured, ...process } = selected.process;
    return { native: retain(name + ".jsonl", selected.native), returned: retain(name + ".txt", selected.returned), process };
  }
  const request = { schema_version: 1, kind: "docs-drift-synthetic-publication", context_sha256: context.context_sha256,
    entry: "copilot", plan: retain("plan.json", canonicalJSON(options.plan)), worker: role("worker"), reviewer: role("reviewer") };
  const path = join(context.artifacts, "request.json");
  writeFileSync(path, canonicalJSON(request), { mode: 0o600 });
  return { ...fixture, request, path };
}

test("a synthetic request revalidates original role artifacts before every common publisher step", async () => {
  const { f, context, path } = await publicationRequest();
  const options = readTrialPublication(context, path);
  expect(options.plan.adoption_sha256).toBe(context.context_sha256);
  expect(options.transport.kind).toBe("collector");
  const result = await publish(options);
  expect(result.state).toBe("complete");
  expect(git(f.origin, "rev-parse", "refs/heads/docs-drift/persistent")).toBe(f.sourceCommit);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 60000);

test.each(["missing-native", "changed-native", "unreaped", "wrong-context", "escaped-plan", "report-approval"] as const)("synthetic publication refuses %s before effects", async scenario => {
  const { f, context, request, path } = await publicationRequest();
  if (scenario === "missing-native") rmSync(join(context.artifacts, request.worker.native.path));
  if (scenario === "changed-native") writeFileSync(join(context.artifacts, request.worker.native.path), "{}\n");
  if (scenario === "unreaped") request.reviewer.process.reaped = false;
  if (scenario === "wrong-context") request.context_sha256 = "f".repeat(64);
  if (scenario === "escaped-plan") request.plan.path = "../source/README.md";
  if (scenario === "report-approval") Object.assign(request, { approved: true });
  writeFileSync(path, canonicalJSON(request));
  expect(() => readTrialPublication(context, path)).toThrow();
  expect(git(f.origin, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 60000);

test("the installed synthetic entry publishes and resumes through the common publisher", async () => {
  const { f, context, path } = await publicationRequest();
  const entry = join(f.runtime, "scripts/docs-drift/trial-entry.ts");
  const args = ["--synthetic-trial", f.root, "--context-commit", f.contextCommit, "--request", path];
  const published = Bun.spawnSync([process.execPath, entry, "publish", ...args], { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  const report = JSON.parse(published.stdout.toString());
  expect(published.exitCode).toBe(0);
  expect(report.outcome).toBe("complete");
  expect(report.data.state).toBe("complete");
  expect(report.context_sha256).toBe(context.context_sha256);
  expect(report.data.request_sha256).toBe(sha256(readFileSync(path)));
  const tracker = readTrialTracker(context);
  const resumed = Bun.spawnSync([process.execPath, entry, "resume-effects", ...args, "--journal", report.data.journal_directory],
    { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  expect(resumed.exitCode).toBe(0);
  expect(JSON.parse(resumed.stdout.toString()).data.state).toBe("complete");
  expect(readTrialTracker(context).commit).toBe(tracker.commit);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 90000);

test("a changed original role artifact stops the next write and retains recovery refs", async () => {
  const { f, context, request, path } = await publicationRequest();
  const options = readTrialPublication(context, path), execute = options.transport.execute;
  const attempts: string[] = [];
  options.transport.execute = async (...args) => {
    attempts.push(args[1].id);
    const result = await execute(...args);
    writeFileSync(join(context.artifacts, request.worker.native.path), "{}\n");
    return result;
  };
  const result = await publish(options);
  expect(result.state).toBe("pending");
  expect(result.reason).toBe("current-proof-or-effect-unavailable");
  expect(attempts).toEqual(["lease"]);
  expect(readTrialTracker(context).resources.size).toBe(0);
  if (!result.objects.lease_object || !result.objects.receipt_object) throw Error("missing owned recovery objects");
  expect(git(f.origin, "rev-parse", context.settings.publication.lease_ref)).toBe(result.objects.lease_object);
  expect(git(f.origin, "rev-parse", context.settings.publication.receipt_ref_prefix + options.plan.manifest.operation_id)).toBe(result.objects.receipt_object);
  expect(git(f.source, "status", "--porcelain")).toBe("");
}, 60000);
