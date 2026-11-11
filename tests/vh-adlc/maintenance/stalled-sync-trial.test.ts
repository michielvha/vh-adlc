import { expect, test } from "bun:test";
import { gradeStalledSync } from "./stalled-sync-trial";
test("stalled-sync proof requires observed root checks before queue classification and rejects unpublished-version and remote-write claims", () => {
  const source = "a".repeat(40), trace = [{ kind: "sync-read", surface: "failure" }, { kind: "source-check", head: source, exit_code: 0 }, { kind: "sync-read", surface: "queue" }], response = { current_destination_version: "1.0.0", prepared_local_version: "1.1.0", root_source_target: source, root_deployed: false, items: [{ number: 31, disposition: "propose-close-superseded" }, { number: 32, disposition: "pending-source-delivery" }, { number: 33, disposition: "unresolved-mixed" }] };
  const measured = [...trace, { kind: "sync-pointer-read", revision: "main:deps/builder.version.json", exit_code: 0, stdout: '{"repository":"example/builder","widget":"1.0.0"}' }];
  // Grader controls; only the actual native driver can establish a trial pass.
  expect(gradeStalledSync(measured, response, source).pass).toBe(true);
  expect(gradeStalledSync(trace, response, source).pass).toBe(false);
  expect(gradeStalledSync([trace[0], trace[2], trace[1]], response, source).pass).toBe(false);
  expect(gradeStalledSync(trace.slice(1), response, source).pass).toBe(false);
  expect(gradeStalledSync(trace, { ...response, current_destination_version: "1.1.0" }, source).pass).toBe(false);
  expect(gradeStalledSync(trace, { ...response, root_deployed: true }, source).pass).toBe(false);
  expect(gradeStalledSync(trace, { ...response, items: response.items.slice(1) }, source).pass).toBe(false);
  expect(gradeStalledSync([...trace, { kind: "sync-write" }], response, source).pass).toBe(false);
});
