import { randomUUID } from "node:crypto";
import { executeOwnedProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { closureFixture } from "./closure-fixture";
import { commitAll, git, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
function nativePull(proposal: PullRequestInput) {
  return { number: proposal.number, state: proposal.state, merged_at: proposal.merged_at, body: proposal.body, draft: proposal.draft,
    user: { login: proposal.actor, id: proposal.actor_id, type: proposal.actor_type },
    head: { sha: proposal.head_sha, ref: proposal.head_ref, repo: proposal.head_repository },
    base: { sha: proposal.base_sha, ref: proposal.base_ref, repo: proposal.base_repository } };
}

async function fixture(method: "merge" | "squash" | "rebase", fault = "none") {
  const f = await closureFixture(roots, method, false, fault === "required-input" ? selected => ({ ...selected.options,
    collection: { ...selected.collection, snapshot: { ...selected.snapshot,
      required_inputs: [{ id: "current-date", kind: "time", sha256: sha256(Buffer.from("synthetic recorded date")) }] } } }) : undefined), artifacts = dirname(f.collection.store.record_path), bin = join(artifacts, "native-bin");
  mkdirSync(bin, { mode: 0o700 });
  if (fault === "oversized-target") {
    const path = join(f.repo, ".vh-adlc/docs-drift.yaml"), settings = JSON.parse(readFileSync(path, "utf8"));
    settings.reports.max_entry_bytes = f.recordBytes.length + 100;
    put(f.repo, ".vh-adlc/docs-drift.yaml", JSON.stringify(settings));
  }
  put(f.repo, "later-unrelated.txt", "Later default commit\n"); const source = commitAll(f.repo);
  git(f.repo, "update-ref", "refs/pull/20/head", f.head);
  for (const proposal of f.proposals.values()) git(f.repo, "update-ref", "refs/pull/" + proposal.number + "/head", proposal.head_sha);
  if (fault === "missing-original-ref") git(f.repo, "update-ref", "-d", "refs/pull/1/head");
  const original = f.proposals.get(1); if (!original) throw Error("missing fixture original");
  const repository = original.base_repository;
  const merged = fault !== "unmerged" && fault !== "open";
  const consolidation = { ...nativePull(f.consolidation), merged, merge_commit_sha: merged ? f.merged : null,
    merged_at: merged ? f.consolidation.merged_at : null, state: fault === "open" ? "open" : "closed" };
  const proposal = { ...nativePull(original), body: fault === "changed-original" ? "Changed original body" : original.body };
  const responses = { "repos/fixture/docs": repository,
    "repos/fixture/docs/git/ref/heads/main": { ref: "refs/heads/main", object: { type: "commit", sha: source } },
    ["repos/fixture/docs/git/commits/" + source]: { sha: source, tree: { sha: "a".repeat(40) }, parents: [], message: "Fixture" },
    "repos/fixture/docs/pulls/20": consolidation, "repos/fixture/docs/pulls/1": proposal,
    "repos/fixture/docs/issues/1/comments?per_page=100&page=1": fault === "missing-comments" ? null : [] };
  const calls = join(artifacts, "native-closure-calls.jsonl");
  const realGit = Bun.which("git"); if (!realGit) throw Error("fixture requires Git");
  writeFileSync(join(bin, "git"), `#!${process.execPath}
const args = process.argv.slice(2), target = args.indexOf("https://github.com/fixture/docs.git");
require("node:fs").appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ program: "git", args }) + "\\n", { mode: 0o600 });
if (target >= 0) { args[target] = ${JSON.stringify(f.repo)}; args.splice(args.indexOf("fetch"), 0, "-c", "protocol.file.allow=always"); }
const child = Bun.spawnSync([${JSON.stringify(realGit)}, ...args], { stdout: "inherit", stderr: "inherit" }); process.exit(child.exitCode);
`, { mode: 0o700 });
  writeFileSync(join(bin, "gh"), `#!${process.execPath}
const args = process.argv.slice(2);
require("node:fs").appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ program: "gh", args }) + "\\n", { mode: 0o600 });
if (args.includes("graphql")) {
  const reads = require("node:fs").readFileSync(${JSON.stringify(calls)}, "utf8").trim().split("\\n").map(line => JSON.parse(line));
  const changed = ${JSON.stringify(fault === "changed-actor")} && reads.filter(call => call.program === "gh" && call.args.includes("graphql")).length >= 6;
  console.log(JSON.stringify({ data: { viewer: { login: changed ? "other-fixture-actor" : "fixture-bot", databaseId: changed ? 21 : 20 } } })); process.exit(0);
}
if (args[args.indexOf("--method") + 1] !== "GET") process.exit(91);
const values = ${JSON.stringify(responses)}, value = values[args.at(-1)];
if (!value) { console.log("HTTP/2.0 404 Not Found\\r\\n\\r\\n{}"); process.exit(1); }
console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value));
`, { mode: 0o700 });
  const selection = canonicalJSON({ schema_version: 1, source_commit: source, consolidation: 20 });
  writeFileSync(join(artifacts, "closure-selection.json"), selection, { mode: 0o600 });
  return { ...f, source, artifacts, selection, calls, environment: { ...process.env, PATH: bin + ":" + process.env.PATH, GH_TOKEN: "synthetic-read-token" } };
}
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
  if (fault === "unmerged" || fault === "open") expect(report.closure.diagnostics).toContain("incomplete closure actual merged consolidation identity");
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
  if (fault === "changed-actor") expect(report.diagnostics.some((item: { message: string }) => item.message.includes("actor changed"))).toBe(true);
  if (fault === "oversized-target") expect(report.diagnostics.some((item: { message: string }) => item.message.includes("configured output bound"))).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 65000);
