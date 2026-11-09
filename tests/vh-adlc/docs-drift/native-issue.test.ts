import { expect, spyOn, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sourceOnlyFixture } from "./source-only-fixture";
import { captureSyntheticRole, installOwnedNativeService, retainSyntheticArtifact } from "./original-publication-fixture";
import { evidence } from "./manifest-fixture";
import { collectReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/review-target";
import { effectDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

test("the retained source-only issue controller resumes one delivered issue despite failing baseline checks", async () => {
  const roots: string[] = [];
  try {
    const f = await sourceOnlyFixture(roots, "issue-create", true);
    console.error("Owned source-only native issue roots", JSON.stringify(roots));
    const target = await collectReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, target.diagnostics.join("\n")).toBe(true);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("source-only-reviewer", target.manifest_sha256!, "NO FINDINGS\n"));
    const request = retainSyntheticArtifact(f.artifacts, "source-only-request.txt", Buffer.from("Synthetic owner approves this exact issue and its lease/receipt/cleanup scope.\n"));
    const authority = retainSyntheticArtifact(f.artifacts, "source-only-authority.json", canonicalJSON({ schema_version: 1,
      kind: "docs-drift-publication-authority", manifest_sha256: target.manifest_sha256,
      origin: { kind: "owner-request", artifact: request }, effects: target.manifest!.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
    const options = { ...f.options, worker_capture: f.worker, reviewer_capture: reviewer, authority };
    const service = installOwnedNativeService(f);
    writeFileSync(join(f.repo, "docs/guide.md"), "Preserve this unrelated source-only caller draft\n");
    const before = captureRepositoryState(f.repo);
    const controller = await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const journal = await import(join(f.retained.directory, "scripts/docs-drift/journal.ts"));
    const append = journal.appendOutcome;
    let interrupted = false;
    const fault = spyOn(journal, "appendOutcome").mockImplementation((current: unknown, id: string, outcome: unknown) => {
      if (id === "publication" && !interrupted) { interrupted = true; throw Error("Synthetic lost issue outcome after native delivery"); }
      return append(current, id, outcome);
    });
    let pending;
    try { pending = await controller.publishPublication(options); }
    finally { fault.mockRestore(); }
    expect(interrupted).toBe(true); expect(pending.state).toBe("pending");
    const resumed = await controller.resumePublication({ ...options, journal_directory: pending.journal.directory });
    expect(resumed.state, resumed.reason).toBe("complete");
    const state = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(state.issues).toHaveLength(1); expect(state.prs).toHaveLength(0);
    expect(state.issues[0].title).toBe("Investigate documentation baseline");
    const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/issues"))).toHaveLength(1);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift/").toString()).toBe("");
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(f.baseline.complete).toBe(false);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved source-only native issue roots", JSON.stringify(roots)); throw error; }
}, 365000);
