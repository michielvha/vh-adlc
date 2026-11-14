/** Owned native-service integration with the ordinary Actions-token REST allowance. No live API or model operation. */
import { expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalClosureFixture } from "./original-closure-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

test("one original closure completes within the ordinary Actions REST allowance", async () => {
  const roots: string[] = [];
  try {
    const f = await originalClosureFixture(roots), before = captureRepositoryState(f.repo);
    const requests = readFileSync(f.service.calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as { program: string; args: string[] });
    const preparation = requests.filter(row => row.program === "gh" && row.args[0] === "api" && !row.args.includes("graphql")).length;
    expect(preparation).toBeLessThan(1000);
    const state = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    state.rest_request_limit = 1000 - preparation; state.rest_requests = 0;
    writeFileSync(f.service.statePath, JSON.stringify(state), { mode: 0o600 });
    const controller: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/closure-controller") =
      await import(join(f.adopted.retained.directory, "scripts/docs-drift/closure-controller.ts"));
    const result = await controller.publishClosure(f.publication);
    const observed = JSON.parse(readFileSync(f.service.statePath, "utf8"));
    console.error("Owned closure REST counts", JSON.stringify({ preparation, execution: observed.rest_requests, total: preparation + observed.rest_requests }));
    expect(result.state, result.reason ?? undefined).toBe("complete");
    expect(preparation + observed.rest_requests).toBeLessThanOrEqual(1000);
    expect(observed.prs.find((pr: { number: number }) => pr.number === 1).state).toBe("closed");
    expect(observed.comments["1"]).toHaveLength(1);
    expect(captureRepositoryState(f.repo)).toEqual(before);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } catch (error) {
    console.error("Preserved failed closure REST-budget roots", JSON.stringify(roots));
    throw error;
  }
}, 900000);
