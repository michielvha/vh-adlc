import { expect, test } from "bun:test";
import { requireExecutionBun } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";

test.each(["1.4.3", "1.4.4", "1.5.0"])("ordinary operation execution treats Bun %s as diagnostic", version => {
  expect(() => requireExecutionBun(2, version)).not.toThrow();
});

test("original version-one execution retains its declared Bun compatibility", () => {
  expect(() => requireExecutionBun(1, "1.4.4")).not.toThrow();
  expect(() => requireExecutionBun(1, "1.4.3")).toThrow("Original retained execution Bun version required");
  expect(() => requireExecutionBun(1, "1.5.0")).toThrow("Original retained execution Bun version required");
});
