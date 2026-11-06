import { expect, test } from "bun:test";
import { collect, render } from "../../../plugins/vh-adlc/scripts/projects/inventory";
import { fixture, settings, page, issue, field, boardStep, itemsStep, repoStep, relationsStep } from "./fixtures";

test("native gh collection paginates repositories, preserves issue identity and separates PR facts", () => {
  const f = fixture([boardStep(), itemsStep(), repoStep("example/one", [issue()], true, "more"), repoStep("example/one", [], false), relationsStep([{ url: "https://github.com/example/one/pull/2", state: "OPEN", headRefOid: "abc", reviewDecision: "APPROVED", commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] } }]), repoStep("other/two", [issue("I_2", "other/two")]), relationsStep()]);
  const result = collect(settings(), f.gh);
  expect(result.complete).toBe(true);
  expect(result.issues.map(i => i.id)).toEqual(["I_1", "I_2"]);
  expect(result.issues[0]).toMatchObject({ lifecycle: null, prs: [{ state: "OPEN", checks: "SUCCESS" }] });
  expect(result.proposed.map(op => op.kind)).toEqual(["add", "add"]);
  expect(render(result)).toContain("Repository lifecycle: unknown");
  const calls = f.calls();
  expect(calls.every(call => call.query.startsWith("query "))).toBe(true);
  expect(calls.some(call => call.variables.cursor === "more")).toBe(true);
  expect(calls.every(call => call.args.join(" ") === "api graphql --hostname github.com --input -")).toBe(true);
});
test("redactions, API errors and budget exhaustion are incomplete and never propose writes", () => {
  for (const steps of [[{ operation: "ProjectFields", response: { data: null, errors: [{ message: "denied" }] } }], [boardStep(), itemsStep([ { id: "redacted", content: null, fieldValues: page([]) } ])], [boardStep()]]) {
    const f = fixture(steps, steps.length === 1 ? 1 : 100);
    const result = collect(settings(), f.gh);
    expect(result.complete).toBe(false); expect(result.proposed).toEqual([]); expect(result.gaps.length).toBeGreaterThan(0);
  }
});
test("missing fields and cursor cycles are refused, not guessed", () => {
  const bad = fixture([{ operation: "ProjectFields", response: { data: { organization: { projectV2: { id: "P_1", url: settings().project, fields: page([]) } } } } }]);
  expect(collect(settings(), bad.gh).complete).toBe(false);
  const cycle = fixture([boardStep(), itemsStep(), repoStep("example/one", [], true, "again"), repoStep("example/one", [], true, "again")]);
  expect(collect(settings(), cycle.gh).complete).toBe(false);
});
