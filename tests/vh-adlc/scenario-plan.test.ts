import { expect, test } from "bun:test";
import { scenarioPlan } from "./lifecycle/scenario-plan";

test("repeated cases have distinct fixture keys and reserved prompts retain their fixture oracle", () => {
  const repeated = scenarioPlan({ cases: "L02,L06", repeat: "3" });
  expect(new Set(repeated.map((s) => s.trial)).size).toBe(6);
  const named = scenarioPlan({ reserved: "R03" });
  expect(named[0].id).toBe("L04");
  expect(named[0].prompt).toContain("/vh-adlc-investigate");
});

test("unknown cases, conflicting selections and unsupported multi-turn trials fail before an agent starts", () => {
  expect(() => scenarioPlan({ cases: "L999" })).toThrow();
  expect(() => scenarioPlan({ cases: "L01", reserved: "R01" })).toThrow();
  expect(() => scenarioPlan({ reserved: "R04" })).toThrow("multi-turn");
  expect(() => scenarioPlan({ repeat: "0" })).toThrow();
});
