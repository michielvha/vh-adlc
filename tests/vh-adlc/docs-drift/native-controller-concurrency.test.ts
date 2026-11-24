import { expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { originalPublicationFixture, installOwnedNativeService } from "./original-publication-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

test("concurrent retained publishers execute an unchanged original batch only once", async () => {
  const roots: string[] = [];
  try {
    const f = await originalPublicationFixture(roots), service = installOwnedNativeService(f);
    console.error("Owned native concurrency fixture roots", JSON.stringify(roots));
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller") =
      await import(join(f.retained.directory, "scripts/docs-drift/publication-controller.ts"));
    const outcomes = await Promise.allSettled([
      f.invoke(run => controller.publishPublication(f.publication, run)),
      f.invoke(run => controller.publishPublication(f.publication, run)),
    ]);
    const finished = outcomes.filter(outcome => outcome.status === "fulfilled");
    expect(finished).toHaveLength(1); expect(finished[0].value.state).toBe("complete");
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(JSON.parse(readFileSync(service.statePath, "utf8")).prs).toHaveLength(1);
    const calls = readFileSync(service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => call.program === "gh" && call.args.includes("POST") && call.args.includes("repos/fixture/docs/pulls"))).toHaveLength(1);
    expect(readGit(f.origin, "for-each-ref", "--format=%(refname)", "refs/heads/docs-drift-lease").toString()).toBe("");
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error("Preserved failed native concurrency roots", JSON.stringify(roots)); throw error; }
}, 365000);
