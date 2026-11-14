import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { refreshFixture } from "./refresh-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["shared", "legacy"])("normal refresh review target binds the native existing PR and original preimage %s", async kind => {
  const f = await refreshFixture(roots, kind === "legacy");
  expect(f.target.complete, f.target.diagnostics.join("\n")).toBe(true);
  const effects = f.target.manifest!.effects;
  expect(effects.map(effect => effect.kind)).toEqual(["lease-acquire", "receipt-retain", "branch-refresh", "pr-update", "lease-release"]);
  expect(effects[2].payload).toEqual({ ref: "refs/heads/" + f.branch, number: 17, expected_head: f.source, head: f.head });
  expect(effects[3].payload).toMatchObject({ number: 17, expected_head: f.head, expected_payload: f.before, title: "Repair the guide", draft: false });
}, 60000);

test.each(["cli", "interrupted-branch", "interrupted-delivery", "legacy", "alias"])("the retained refresh controller updates one original proposal through %s", async scenario => {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { spyOn } = await import("bun:test");
  const { reviewRefresh } = await import("./refresh-fixture");
  const { installOwnedNativeService, publicationCLIArguments } = await import("./original-publication-fixture");
  const { readGit } = await import("../../../plugins/vh-adlc/scripts/docs-drift/git");
  const { captureRepositoryState } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
  const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
  const f = await refreshFixture(roots, scenario === "legacy", scenario === "alias" ? "alias" : undefined), publication = reviewRefresh(f);
  const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
  readGit(f.origin, "update-ref", "refs/heads/" + f.branch, f.source);
  const service = installOwnedNativeService(f), state = JSON.parse(readFileSync(service.statePath, "utf8"));
  state.prs = [f.original];
  if (scenario === "alias") state.labels.Documentation = state.labels.documentation;
  writeFileSync(service.statePath, JSON.stringify(state), { mode: 0o600 });
  const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
  if (scenario === "cli") {
    const argv = publicationCLIArguments({ ...f, reviewer: publication.reviewer_capture, authority: publication.authority, publication }, "publish");
    const environment = Object.fromEntries(Object.entries(f.native.environment).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    const completed = await executeOwnedProcess({ argv, cwd: f.repo, env: environment, watched_outputs: [], capture: "memory", timeout_ms: 600000,
      stdout: join(f.artifacts, "refresh-cli.stdout"), stderr: join(f.artifacts, "refresh-cli.stderr"), started: () => {} });
    expect(completed.reaped).toBe(true); expect(completed.timed_out).toBe(false);
    const output = Buffer.from(completed.captured?.stdout ?? []).toString();
    const report = JSON.parse(output);
    expect(completed.exit_code, JSON.stringify({ diagnostics: report.diagnostics, reason: report.publication_effects?.reason,
      stderr: Buffer.from(completed.captured?.stderr ?? []).toString() })).toBe(0);
    expect(report.publication_effects.state).toBe("complete");
  } else if (scenario.startsWith("interrupted")) {
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts")), append = journal.appendOutcome;
    let injected = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === (scenario === "interrupted-branch" ? "candidate" : "publication") && !injected) { injected = true; throw Error("Synthetic lost refresh outcome"); }
      return append(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishPublication(publication); } finally { fault.mockRestore(); }
    expect(injected).toBe(true); expect(pending.state, pending.reason).toBe("pending");
    const resumed = await controller.resumePublication({ ...publication, journal_directory: pending.journal.directory });
    expect(resumed.state, resumed.reason).toBe("complete");
  } else {
    const result = await controller.publishPublication(publication); expect(result.state, result.reason).toBe("complete");
  }
  const final = JSON.parse(readFileSync(service.statePath, "utf8"));
  expect(final.prs).toHaveLength(1); expect(final.prs[0]).toMatchObject({ number: 17, user: f.original.user,
    title: "Repair the guide", draft: false, head: { ref: f.branch, sha: f.head } });
  expect(final.prs[0].labels.map((label: { name: string }) => label.name)).toEqual(["documentation"]);
  const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/pulls"))).toHaveLength(0);
  expect(calls.filter(call => call.program === "gh" && call.args.includes("PATCH") && call.args.includes("repos/fixture/docs/pulls/17"))).toHaveLength(1);
  expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
}, 900000);


test.each(["title", "body", "head", "number", "draft", "fork", "id-only", "foreign-author"] as const)("normal refresh refuses an unbound native target %s", async fault => {
  const f = await refreshFixture(roots, false, fault);
  expect(f.target.complete).toBe(false); expect(f.target.manifest).toBeNull();
  const expected = fault === "number" ? "one collected native proposal" : fault === "draft" ? "draft policy" : "metadata preimage changed";
  expect(f.target.diagnostics.join("\n")).toContain(expected);
}, 60000);
