import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const baseline = "b313327b134bc5ecfa7167856d4b567f8701ba06";
// Keep the owner summary, finding rules, drift re-review limit, the proportionality gate
// (michielvha/vh-adlc#148: harm statement and convergence trigger) and the author-added extras
// exception (michielvha/vh-adlc#141) in the spec baseline.
const specBaseline = "41355739d55e1d60f5c1839fa1c59a57089b96e0";
// The proportionality gate (michielvha/vh-adlc#148) adds the harm statement step to investigate.
const investigateBaseline = "e53fe39e7461b95c27b7481514688ee998970e18";
// The owner approved the rule that an agent-behavior proof needs a committed script that reruns it
// (docs/specs/reproducible-agent-proofs.md, parked in favour of this short rule). Keep it as the implement baseline.
const implementBaseline = "8d5a639bf3626a95901a125c0aeeff3e24b0f335";
test.each(["investigate", "spec", "tasks", "implement", "review", "ship", "resume"])("direct %s keeps its approved operation body", (name) => {
  const path = `plugins/vh-adlc/skills/vh-adlc-${name}/SKILL.md`;
  const revision = name === "spec" ? specBaseline : name === "investigate" ? investigateBaseline : name === "implement" ? implementBaseline : baseline;
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
    // Stage-scoped rungs (docs/specs/stage-scoped-verification-rungs.md): exact commands, never the stage-less one.
    const rungs = "`bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch>";
    if (name === "implement") for (const command of [`${rungs} --stage task --run true\``, `${rungs} --stage task\``]) expect(loop).toContain(command);
    if (name === "ship") for (const command of [`${rungs} --stage completion --run true\``, "--merge <merge commit> --stage completion --run true"]) expect(loop).toContain(command);
    if (name === "implement" || name === "ship") expect(current).not.toContain("rungs --repo <dir> --base <default branch> --run true");
    if (name === "ship") for (const phrase of ["--merge", "cli.ts ci", "cli.ts skip", "cli.ts delivery"]) expect(loop).toContain(phrase);
    if (name === "spec" || name === "review") for (const phrase of ["scripts/loop/cli.ts review", "references/review-protocol.md", "pending", "requested model"]) expect(loop).toContain(phrase);
    current = (current.slice(0, loopStart) + current.slice(loopEnd)).replace(/\n+$/, "\n");
  }
  // Shared issue labels (docs/specs/shared-issue-labels.md) add one section to the operations that file issues.
  if (name === "investigate" || name === "spec") {
    const start = current.indexOf("## Issue labels\n");
    expect(start).toBeGreaterThan(0);
    const next = current.indexOf("\n## ", start + 1), end = next < 0 ? current.length : next + 1;
    const section = current.slice(start, end);
    for (const phrase of ["scripts/labels/cli.ts file", "references/issues.md", "--preview", "--approved-digest", "missing labels", `--operation ${name}`]) expect(section).toContain(phrase);
    if (name === "investigate") for (const phrase of ["act now", "--waiting-on prerequisite", "--waiting-on decision", "reject"]) expect(section).toContain(phrase);
    if (name === "spec") expect(section).toContain("no state label");
    current = (current.slice(0, start) + current.slice(end)).replace(/\n+$/, "\n");
  } else expect(current).not.toContain("## Issue labels\n");
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
  // A newer baseline can include sections the test checks separately above.
  let previous = old.stdout.toString();
  for (const heading of ["Loop routes", "Issue labels"]) {
    const start = previous.indexOf(`## ${heading}\n`);
    if (start < 0) continue;
    const next = previous.indexOf("\n## ", start + 1);
    previous = (previous.slice(0, start) + previous.slice(next < 0 ? previous.length : next + 1)).replace(/\n+$/, "\n");
  }
  // A baseline taken after documentation impact landed carries that section too.
  const oldImpact = previous.indexOf("## Documentation impact\n");
  if (oldImpact > 0) previous = previous.slice(0, oldImpact) + previous.slice(previous.indexOf("## Start\n", oldImpact));
  expect(body(current)).toBe(body(previous));
});

test("the loop settings reference documents rung stages", () => {
  const reference = readFileSync(join(root, "plugins/vh-adlc/references/loop-settings.md"), "utf8");
  expect(reference.split("\n").some(line => line.startsWith("| `verification_rungs[].stages` |"))).toBe(true);
  expect(reference).toContain("--stage");
});
