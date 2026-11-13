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
  // Loop settings (docs/specs/shared-development-loop.md) add one section; the rest of the body is unchanged.
  const loopStart = current.indexOf("## Loop routes\n");
  expect(loopStart).toBeGreaterThan(0);
  {
    const next = current.indexOf("\n## ", loopStart + 1);
    const loopEnd = next < 0 ? current.length : next + 1;
    const loop = current.slice(loopStart, loopEnd);
    for (const phrase of [".vh-adlc/loop.yaml", "scripts/loop/cli.ts route", "references/loop-settings.md", "host default", "scripts/loop/cli.ts context", "project procedure"]) expect(loop).toContain(phrase);
    if (name === "resume") expect(loop).toContain("--continues");
    if (name === "implement") for (const phrase of ["cli.ts isolation", "enter-host-worktree", "cli.ts claim", "unrelated"]) expect(loop).toContain(phrase);
    if (name === "implement") expect(loop).toContain("replace Enter steps 1 and 6");
    if (name === "ship") expect(loop).toContain("replaces the documentation-only skip-marker rule");
    if (name === "resume") expect(loop).toContain("cli.ts claim");
    if (name === "investigate") for (const phrase of ["findings_document: always", "extend a covering document", "only copy of the findings", "act now, track", "primary sources"]) expect(loop).toContain(phrase);
    if (name === "spec") expect(loop).toContain("lenses");
    if (name === "implement" || name === "ship") for (const phrase of ["verification rungs", "scripts/loop/cli.ts rungs"]) expect(loop).toContain(phrase);
    if (name === "ship") for (const phrase of ["--merge", "cli.ts ci", "cli.ts skip", "cli.ts delivery"]) expect(loop).toContain(phrase);
    if (name === "spec" || name === "review") for (const phrase of ["scripts/loop/cli.ts review", "references/review-protocol.md", "pending", "requested model"]) expect(loop).toContain(phrase);
    current = (current.slice(0, loopStart) + current.slice(loopEnd)).replace(/\n+$/, "\n");
  }
  if (name === "implement" || name === "ship") {
    const start = current.indexOf("## Documentation impact\n"), end = current.indexOf("## Start\n", start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const section = current.slice(start, end);
    for (const phrase of ["committed HEAD", "roots --repo", "knowledge", "before", "first", "manual", "missing-page", "--metadata-path", "incomplete", "references/docs-impact.md"]) expect(section).toContain(phrase);
    if (name === "implement") expect(section).toContain("before ticking/committing");
    else for (const phrase of ["owner-authorized", "preflight succeeds", "no completion", "review-refresh"]) expect(section).toContain(phrase);
    current = current.slice(0, start) + current.slice(end);
  }
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
      "after-merge",
      "references/branches.md",
      "contained in",
      "does not authorize a",
    ]) expect(cleanup).toContain(requirement);
    current = current.slice(0, start) + current.slice(end);
  }
  const prefix = current.slice(current.indexOf("## Generic intake"), current.indexOf("The plugin directory is two levels"));
  expect(prefix).toBe("## Generic intake\n\nFor generic vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here.\n\n");
  expect(body(current)).toBe(body(old.stdout.toString()));
});
