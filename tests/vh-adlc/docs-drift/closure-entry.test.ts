import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { join } from "node:path";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { nativeClosureFixture } from "./closure-native-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const fixture = (method: "merge" | "squash" | "rebase", fault = "none") => nativeClosureFixture(roots, method, fault);
import { collectNativeClosure, collectNativeClosureTarget, closureTargetOutput } from "../../../plugins/vh-adlc/scripts/docs-drift/resolution-entry";

function collectionOptions(f: Awaited<ReturnType<typeof fixture>>) {
  return { repo: f.repo, source: f.source, artifact_root: f.artifacts, selection: JSON.parse(f.selection.toString()),
    owner: "fixture-owner", run: "closure-collection", path: f.environment.PATH, credential: f.environment.GH_TOKEN ?? "" };
}
function readOnlyCalls(f: Awaited<ReturnType<typeof fixture>>) {
  const calls = existsSync(f.calls) ? readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] }) : [];
  expect(calls.some(call => call.program === "git" && call.args.includes("push"))).toBe(false);
  expect(calls.filter(call => call.program === "gh").every(call => call.args.includes("GET")
    || call.args.includes("graphql") && !call.args.some(arg => /mutation\b/u.test(arg)))).toBe(true);
  return calls;
}
async function target(f: Awaited<ReturnType<typeof fixture>>) {
  const report = closureTargetOutput(await collectNativeClosureTarget(collectionOptions(f)), f.source);
  return { report, calls: readOnlyCalls(f) };
}

test.each(["merge", "squash", "rebase"] as const)("native fresh-session %s collection recovers closure evidence after default advances", async method => {
  const f = await fixture(method), before = captureRepositoryState(f.repo), closure = await collectNativeClosure(collectionOptions(f));
  expect(closure.complete, closure.diagnostics.join("\n")).toBe(true);
  readOnlyCalls(f);
  expect(closure).toMatchObject({ complete: true, inputs: { complete: true, current_default: f.source,
    consolidation: { number: 20, head_sha: f.head }, record: { sha256: sha256(f.recordBytes) } } });
  expect(closure.inputs!.originals.map((proposal: PullRequestInput) => proposal.number)).toEqual([1]);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);

test.each(["unmerged", "open", "changed-original", "missing-original-ref", "required-input"])("native fresh-session collection retains incomplete %s", async fault => {
  const f = await fixture("squash", fault), before = captureRepositoryState(f.repo), closure = await collectNativeClosure(collectionOptions(f));
  expect(closure.complete).toBe(false);
  expect(closure.diagnostics.length).toBeGreaterThan(0);
  expect(new Set(closure.diagnostics).size).toBe(closure.diagnostics.length);
  if (fault === "unmerged" || fault === "open") {
    expect(closure.diagnostics).toContain("incomplete closure actual merged consolidation identity");
    expect(closure.scope_changed).toBe(false);
  }
  if (fault === "required-input") {
    expect(closure.diagnostics).toContain("Current observations for required closure inputs unavailable");
    expect(closure.inputs!.record!.value.source.required_inputs).toHaveLength(1);
  }
  readOnlyCalls(f);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);


test.each(["merge", "squash", "rebase"] as const)("native %s closure target binds unverified model scopes without any GitHub writes", async method => {
  const f = await fixture(method), before = captureRepositoryState(f.repo);
  const selection = canonicalJSON({ schema_version: 1, source_commit: f.source, consolidation: 20, operation_id: "closure-entry" });
  writeFileSync(join(f.artifacts, "closure-target-selection.json"), selection, { mode: 0o600 });
  const { report, calls } = await target({ ...f, selection });
  expect(report.outcome, JSON.stringify(report.diagnostics)).toBe("collected");
  expect(report.closure_target).toMatchObject({ authority: "none", complete: true, target: { authority: "none", verification_ready: false, complete: true } });
  expect(report.closure_target.target!.effects.map((effect: { kind: string }) => effect.kind)).toEqual(["lease-acquire", "receipt-retain", "comment-create", "pr-close", "lease-release"]);
  expect(report.closure_target.target!.verification_scopes).toHaveLength(f.recordValue.dispositions.length);
  expect(report.closure_target.target_sha256).toBe(canonicalDigest({ source_commit: f.source,
    identity: report.closure_target.identity, target: report.closure_target.target }));
  if (method === "merge") {
    const repeated = await target({ ...f, selection });
    expect(repeated.report.outcome, JSON.stringify(repeated.report.diagnostics)).toBe("collected");
    expect(repeated.report.closure_target.target_sha256).toBe(report.closure_target.target_sha256);
  }
  expect(calls.some(call => call.program === "gh" && call.args.includes("graphql"))).toBe(true);
  expect(calls.some(call => call.program === "git" && call.args.includes("fetch"))).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);


test.each(["unmerged", "changed-original", "required-input", "missing-comments", "oversized-target", "extra-authority", "changed-actor"])("native closure target refuses incomplete or unbound %s", async fault => {
  const f = await fixture("squash", fault), before = captureRepositoryState(f.repo);
  const packet = { schema_version: 1, source_commit: f.source, consolidation: 20, operation_id: "closure-entry" };
  const selection = canonicalJSON(fault === "extra-authority" ? { ...packet, approved: true } : packet);
  writeFileSync(join(f.artifacts, "closure-target-selection.json"), selection, { mode: 0o600 });
  if (fault === "extra-authority") {
    await expect(target({ ...f, selection })).rejects.toThrow("Closure target selection fields changed");
    expect(captureRepositoryState(f.repo)).toEqual(before);
    return;
  }
  const { report } = await target({ ...f, selection });
  expect(report.outcome).toBe("incomplete");
  expect(report.closure_target?.complete ?? false).toBe(false);
  expect(report.closure_target?.target_sha256 ?? null).toBeNull();
  if (["missing-comments", "oversized-target", "changed-actor"].includes(fault)) {
    expect(report.closure_target.store).toBeDefined();
    expect(existsSync(report.closure_target.store!.record_path)).toBe(true);
    expect(sha256(readFileSync(report.closure_target.store!.record_path))).toBe(report.closure_target.store!.record_sha256);
  }
  if (fault === "changed-actor") {
    const messages = report.diagnostics.map((item: { message: string }) => item.message);
    expect(messages).toContain("Closure target source or actor changed during collection");
    expect(messages).not.toContain("Native source or actor changed during closure collection");
  }
  if (fault === "oversized-target") expect(report.diagnostics.some((item: { message: string }) => item.message.includes("configured output bound"))).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);
