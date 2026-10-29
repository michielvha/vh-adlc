import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const baseline = "b313327b134bc5ecfa7167856d4b567f8701ba06";
// The owner requested a conversational summary before accepting a completed spec.
// Keep that intentional change as the spec baseline; other operation bodies retain theirs.
const specSummaryBaseline = "116accd0a50e2c0da741a0ed6f762f177c61babd";
test.each(["investigate", "spec", "tasks", "implement", "review", "ship", "resume"])("direct %s keeps its approved operation body", (name) => {
  const path = `plugins/vh-adlc/skills/vh-adlc-${name}/SKILL.md`;
  const revision = name === "spec" ? specSummaryBaseline : baseline;
  const old = Bun.spawnSync(["git", "show", `${revision}:${path}`], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect(old.exitCode).toBe(0);
  const body = (text: string) => text.slice(text.indexOf("The plugin directory is two levels"));
  let current = readFileSync(join(root, path), "utf8");
  if (name === "ship") {
    const promotionStart = current.indexOf("## Article and promotion handoff\n");
    const promotionEnd = current.indexOf("## After an authorized merge\n", promotionStart);
    expect(promotionStart).toBeGreaterThan(0);
    expect(promotionEnd).toBeGreaterThan(promotionStart);
    const promotion = current.slice(promotionStart, promotionEnd);
    for (const requirement of ["vh-adlc-blog promote", "Internal-only", "Do not invoke", "do not make promotion a feature gate", "PR does not establish"]) expect(promotion).toContain(requirement);
    current = current.slice(0, promotionStart) + current.slice(promotionEnd);
    const start = current.indexOf("## After an authorized merge\n");
    const end = current.indexOf("## Report\n", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const cleanup = current.slice(start, end);
    for (const requirement of [
      "delete_branch_on_merge",
      "tip is reachable from",
      "git branch -d",
      "git worktree list --porcelain",
      "does not authorize a",
    ]) expect(cleanup).toContain(requirement);
    current = current.slice(0, start) + current.slice(end);
  }
  const prefix = current.slice(current.indexOf("## Generic intake"), current.indexOf("The plugin directory is two levels"));
  expect(prefix).toBe("## Generic intake\n\nFor generic vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here.\n\n");
  expect(body(current)).toBe(body(old.stdout.toString()));
});
