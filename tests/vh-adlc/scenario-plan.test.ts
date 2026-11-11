import { expect, test } from "bun:test";
import { scenarioPlan } from "./lifecycle/scenario-plan";

test("repeated cases have distinct fixture keys and reserved prompts retain their fixture oracle", () => {
  const repeated = scenarioPlan({ cases: "L02,L06", repeat: "3" });
  expect(new Set(repeated.map((s) => s.trial)).size).toBe(6);
  const named = scenarioPlan({ reserved: "R03" });
  expect(named[0].id).toBe("L04");
  expect(named[0].prompt).toContain("/vh-adlc-investigate");
});

test("unknown cases and conflicting selections fail before an agent starts", () => {
  expect(() => scenarioPlan({ cases: "L999" })).toThrow();
  expect(() => scenarioPlan({ cases: "L01", reserved: "R01" })).toThrow();
  expect(() => scenarioPlan({ repeat: "0" })).toThrow();
});

test("the reserved scope-change case retains both turns and seeds a read-only workflow", () => {
  const [s] = scenarioPlan({ reserved: "R04" });
  expect(s.id).toBe("L07");
  expect(s.prompts?.length).toBe(2);
  expect(s.seedReadOnlyWorkflow).toBe(true);
});
