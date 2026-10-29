import { expect, test } from "bun:test";
import { builderOrder } from "./builder-order";
test("builder ordering includes a fresh primary worktree created directly at the selected pointer commit", () => {
  const source = "/owned/builder", target = "a".repeat(40), bot = "b".repeat(40), bump = { root: "/owned/primary-batch", ref: "chore/run-pointer", builder_receipt: "/owned/build/result.json" }, built = { kind: "source-build", cwd: source, head: target, exit_code: 0, argv: ["scripts/build.ts", "--output", bump.builder_receipt] }, applied = { kind: "git-result", operation: "worktree", git_cwd: "/owned/main", args: ["worktree", "add", "-b", bump.ref, bump.root, bot], exit_code: 0 };
  expect(builderOrder([built, applied], source, target, bump, bot).pass).toBe(true);
  expect(builderOrder([built, { ...applied, args: ["worktree", "add", "-b", bump.ref, "../primary-batch", bot] }], source, target, bump, bot).pass).toBe(true);
  expect(builderOrder([applied, built], source, target, bump, bot).pass).toBe(false);
  expect(builderOrder([applied], source, target, bump, bot).pass).toBe(false);
  expect(builderOrder([{ ...built, head: "c".repeat(40) }, applied], source, target, bump, bot).pass).toBe(false);
});
