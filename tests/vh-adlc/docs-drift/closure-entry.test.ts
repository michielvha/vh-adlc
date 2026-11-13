import { randomUUID } from "node:crypto";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
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
const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");

async function invoke(f: Awaited<ReturnType<typeof fixture>>, command = "collect-closure", selectionFile = "closure-selection.json") {
  const name = "closure-entry-" + randomUUID();
  const completion = await executeOwnedProcess({ argv: [process.execPath, entry, command, "--repo", f.repo, "--source", f.source,
    "--artifact-root", f.artifacts, "--selection", selectionFile, "--selection-sha256", sha256(f.selection)], cwd: f.repo,
    env: Object.fromEntries(Object.entries(f.environment).filter((pair): pair is [string, string] => typeof pair[1] === "string")),
    capture: "memory", watched_outputs: [], timeout_ms: 30000, stdout: join(f.artifacts, name + ".stdout"),
    stderr: join(f.artifacts, name + ".stderr"), started: () => {} });
  expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
  const calls = existsSync(f.calls) ? readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] }) : [];
  expect(calls.some(call => call.program === "git" && call.args.includes("push"))).toBe(false);
  expect(calls.filter(call => call.program === "gh").every(call => call.args.includes("GET")
    || call.args.includes("graphql") && !call.args.some(arg => /mutation\b/u.test(arg)))).toBe(true);
  return { result: { exitCode: completion.exit_code }, report: JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString()), calls };
}

test.each(["merge", "squash", "rebase"] as const)("normal fresh-session %s collection recovers closure evidence after default advances", async method => {
  const f = await fixture(method), before = captureRepositoryState(f.repo), { result, report } = await invoke(f);
  expect(result.exitCode).toBe(0);
  expect(report.closure).toMatchObject({ complete: true, inputs: { complete: true, current_default: f.source,
    consolidation: { number: 20, head_sha: f.head }, record: { sha256: sha256(f.recordBytes) } } });
  expect(report.closure.inputs.originals.map((proposal: PullRequestInput) => proposal.number)).toEqual([1]);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);

test.each(["unmerged", "open", "changed-original", "missing-original-ref", "required-input"])("normal fresh-session collection retains incomplete %s", async fault => {
  const f = await fixture("squash", fault), before = captureRepositoryState(f.repo), { result, report } = await invoke(f);
  expect(result.exitCode).toBe(2);
  expect(report.closure.complete).toBe(false);
  expect(report.closure.diagnostics.length).toBeGreaterThan(0);
  expect(new Set(report.closure.diagnostics).size).toBe(report.closure.diagnostics.length);
  if (fault === "unmerged" || fault === "open") {
    expect(report.closure.diagnostics).toContain("incomplete closure actual merged consolidation identity");
    expect(report.closure.scope_changed).toBe(false);
  }
  if (fault === "required-input") {
    expect(report.closure.diagnostics).toContain("Current observations for required closure inputs unavailable");
    expect(report.closure.inputs.record.value.source.required_inputs).toHaveLength(1);
  }
  expect(report.diagnostics.map((item: { message: string }) => item.message)).toEqual(report.closure.diagnostics);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);


test.each(["merge", "squash", "rebase"] as const)("normal %s closure target entry binds unverified model scopes without any GitHub writes", async method => {
  const f = await fixture(method), before = captureRepositoryState(f.repo);
  const selection = canonicalJSON({ schema_version: 1, source_commit: f.source, consolidation: 20, operation_id: "closure-entry" });
  writeFileSync(join(f.artifacts, "closure-target-selection.json"), selection, { mode: 0o600 });
  const { result, report, calls } = await invoke({ ...f, selection }, "collect-closure-target", "closure-target-selection.json");
  expect(result.exitCode, JSON.stringify(report.diagnostics)).toBe(0);
  expect(report.closure_target).toMatchObject({ authority: "none", complete: true, target: { authority: "none", verification_ready: false, complete: true } });
  expect(report.closure_target.target.effects.map((effect: { kind: string }) => effect.kind)).toEqual(["lease-acquire", "receipt-retain", "comment-create", "pr-close", "lease-release"]);
  expect(report.closure_target.target.verification_scopes).toHaveLength(f.recordValue.dispositions.length);
  expect(report.closure_target.target_sha256).toBe(canonicalDigest({ source_commit: f.source,
    identity: report.closure_target.identity, target: report.closure_target.target }));
  if (method === "merge") {
    const repeated = await invoke({ ...f, selection }, "collect-closure-target", "closure-target-selection.json");
    expect(repeated.result.exitCode, JSON.stringify(repeated.report.diagnostics)).toBe(0);
    expect(repeated.report.closure_target.target_sha256).toBe(report.closure_target.target_sha256);
  }
  expect(calls.some(call => call.program === "gh" && call.args.includes("graphql"))).toBe(true);
  expect(calls.some(call => call.program === "git" && call.args.includes("fetch"))).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);


test.each(["unmerged", "changed-original", "required-input", "missing-comments", "oversized-target", "extra-authority", "changed-actor"])("normal closure target refuses incomplete or unbound %s", async fault => {
  const f = await fixture("squash", fault), before = captureRepositoryState(f.repo);
  const packet = { schema_version: 1, source_commit: f.source, consolidation: 20, operation_id: "closure-entry" };
  const selection = canonicalJSON(fault === "extra-authority" ? { ...packet, approved: true } : packet);
  writeFileSync(join(f.artifacts, "closure-target-selection.json"), selection, { mode: 0o600 });
  const { result, report } = await invoke({ ...f, selection }, "collect-closure-target", "closure-target-selection.json");
  expect(result.exitCode).toBe(2); expect(report.outcome).toBe("incomplete");
  expect(report.closure_target?.complete ?? false).toBe(false);
  expect(report.closure_target?.target_sha256 ?? null).toBeNull();
  if (["missing-comments", "oversized-target", "changed-actor"].includes(fault)) {
    expect(report.closure_target.store).toBeDefined();
    expect(existsSync(report.closure_target.store.record_path)).toBe(true);
    expect(sha256(readFileSync(report.closure_target.store.record_path))).toBe(report.closure_target.store.record_sha256);
  }
  if (fault === "changed-actor") {
    const messages = report.diagnostics.map((item: { message: string }) => item.message);
    expect(messages).toContain("Closure target source or actor changed during collection");
    expect(messages).not.toContain("Native source or actor changed during closure collection");
  }
  if (fault === "oversized-target") expect(report.diagnostics.some((item: { message: string }) => item.message.includes("configured output bound"))).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);
