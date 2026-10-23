import { expect, test } from "bun:test";
import { compactTrial } from "./evidence-index";

const trial = {
  id: "L02", trial: "L02-1", candidate: "final", status: "pass", durationMs: 42,
  packageHash: "package", graderHash: "grader", docsPin: "docs", rawEventsHash: "raw-events",
  host: "codex-cli 0.163.0", fixtureUnchangedSinceTrial: true,
  checks: [{ name: "only permitted files changed", pass: true }],
};

test("the evidence index retains traceable identities without copying raw checks", () => {
  const index = compactTrial(trial, "runs/docs/L02-1");
  expect(index.rawEventsHash).toBe("raw-events");
  expect(index.source).toBe("runs/docs/L02-1");
  expect(index.checkCount).toBe(1);
  expect(index.checksHash).toHaveLength(64);
  expect(index).not.toHaveProperty("checks");
  expect(index).not.toHaveProperty("pass");
});

test("indexing cannot hide failed checks or invent a verified trial", () => {
  expect(() => compactTrial({ ...trial, checks: [{ name: "state preserved", pass: false }] }, "run")).toThrow();
  expect(() => compactTrial({ ...trial, rawEventsHash: "" }, "run")).toThrow();
  expect(() => compactTrial({ ...trial, fixtureUnchangedSinceTrial: false }, "run")).toThrow();
  const failed = compactTrial({ ...trial, status: "fail", checks: [{ name: "state preserved", pass: false }] }, "run");
  expect(failed.failedChecks).toEqual(["state preserved"]);
  expect(failed.status).toBe("fail");
});

test("regraded evidence retains its original failed outcome", () => {
  expect(compactTrial({ ...trial, originalStatus: "fail" }, "run").originalStatus).toBe("fail");
});
