import { expect, test } from "bun:test";
import { assessCliSuite, REQUIRED_TRIALS } from "./lifecycle/suite";
import { DOCS_PIN } from "./lifecycle/fixtures";

function complete() {
  return Object.entries(REQUIRED_TRIALS).flatMap(([key, count]) => Array.from({ length: count }, (_, n) => ({
    id: key.startsWith("R") ? "L07" : key, variant: key.startsWith("R") ? key : undefined,
    trial: `${key}-${n}`, status: "pass", packageHash: "frozen-package", docsPin: DOCS_PIN,
    host: "codex-cli 0.163.0", configuration: "workspace-write; no model override", rawEventsHash: `${key}-${n}-events`,
    fixtureUnchangedSinceTrial: true, checks: [{ name: "fixture verified", pass: true }],
    ...(key === "R04" || key === "L11-ship" ? { phases: [{ thread: key, exitCode: 0 }, { thread: key, exitCode: 0 }] } : {}),
  })));
}

test("all mandatory variants and fresh repetitions must pass against the frozen package and pin", () => {
  const trials = complete();
  expect(assessCliSuite(trials, "frozen-package", DOCS_PIN).pass).toBe(true);
  expect(assessCliSuite(trials.filter((t) => t.id !== "L18-contract"), "frozen-package", DOCS_PIN).pass).toBe(false);
  trials[0].packageHash = "earlier-package";
  expect(assessCliSuite(trials, "frozen-package", DOCS_PIN).pass).toBe(false);
});

test("duplicate evidence and a missing second turn cannot complete an otherwise passing suite", () => {
  const trials = complete();
  const docs = trials.filter((t) => t.id === "L02");
  docs[1].rawEventsHash = docs[0].rawEventsHash;
  expect(assessCliSuite(trials, "frozen-package", DOCS_PIN).pass).toBe(false);
  docs[1].rawEventsHash = "restored-unique";
  trials.find((t) => t.variant === "R04")!.phases!.pop();
  expect(assessCliSuite(trials, "frozen-package", DOCS_PIN).pass).toBe(false);
});
