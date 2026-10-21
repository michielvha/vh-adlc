import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReviewReceipt } from "./native-review";
import { seedClaimedFeature, seedImplementedFeature } from "./feature-fixture";

export const DOCS_PIN = "e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a";
export const DIAGNOSTICS = ["L01", "L02", "L03", "L04", "L05", "L06", "L06-dependency", "L06-ci", "L07", "L08-held", "L08-released", "L09-onboard", "L09-bootstrap", "L10", "L12-missing", "L12-conflict", "L12-live", "L13", "L14", "L15", "L16-public", "L16-permissions", "L16-data", "L16-release"] as const;
export type Diagnostic = typeof DIAGNOSTICS[number];
export const isMaintenance = (id: Diagnostic) => id === "L06" || id.startsWith("L06-");
export const maintenancePaths = (id: Diagnostic) => id === "L06-ci" ? [".github/workflows/ci.yml"] : id === "L06-dependency" ? ["package.json", "bun.lock"] : ["greet.sh", "test.sh"];
export type Fixture = { id: Diagnostic; project: string; origin: string; prompt: string };
export type Command = { command: string; exitCode: number; output: string };
type File = { hash: string; mode: number };
export type Snapshot = { files: Record<string, File>; index: Record<string, string>; refs: string; originRefs: string };
export type Check = { name: string; pass: boolean; detail?: string };

function hash(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
export function git(cwd: string, ...args: string[]): string {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const r = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args[0]}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

export function installLocalDependencies(project: string) {
  const temp = join(project, "..", "bun-temp"), cache = join(project, "..", "bun-cache");
  mkdirSync(temp, { recursive: true });
  mkdirSync(cache, { recursive: true });
  return Bun.spawnSync(["bun", "install"], { cwd: project, env: { ...process.env, TMPDIR: temp, BUN_INSTALL_CACHE_DIR: cache }, stdout: "pipe", stderr: "pipe" });
}

function files(root: string): Record<string, File> {
  const result: Record<string, File> = {};
  function walk(dir: string) {
    for (const entry of readdirSync(dir).sort()) {
      if (entry === ".git" || entry === "node_modules") continue;
      const path = join(dir, entry);
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path);
      else result[relative(root, path)] = {
        hash: hash(stat.isSymbolicLink() ? readlinkSync(path) : readFileSync(path)),
        mode: stat.mode & 0o777,
      };
    }
  }
  walk(root);
  return result;
}

export function fingerprint(root: string): string { return hash(JSON.stringify(files(root))); }

export function snapshot(f: Fixture): Snapshot {
  if (f.id === "L13") return { files: files(f.project), index: {}, refs: "", originRefs: "" };
  const index: Record<string, string> = {};
  for (const line of git(f.project, "ls-files", "--stage").split("\n")) {
    if (line) index[line.slice(line.indexOf("\t") + 1)] = line.slice(0, line.indexOf("\t"));
  }
  return {
    files: files(f.project), index,
    refs: git(f.project, "for-each-ref", "--format=%(refname) %(objectname)"),
    originRefs: git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"),
  };
}

export function buildDiagnostic(root: string, id: Diagnostic, options: { seedReadOnlyWorkflow?: boolean } = {}): Fixture {
  if (!DIAGNOSTICS.includes(id)) throw new Error(`unsupported lifecycle case: ${id}`);
  const project = join(root, "project");
  const origin = join(root, "origin.git");
  mkdirSync(project, { recursive: true });
  mkdirSync(origin, { recursive: true });
  if (id === "L13") {
    writeFileSync(join(project, "OWNER.txt"), "Owner content in a directory outside Git.\n");
    return { id, project, origin, prompt: "Use vh-adlc. What must a bounded maintenance task establish before it can be completed locally? This directory is outside Git. Answer using the framework and applicable engineering rules; do not initialize or onboard this directory or change its files." };
  }
  git(project, "init", "-q", "-b", "main");
  git(origin, "init", "-q", "--bare", "--initial-branch=main");
  git(project, "config", "user.name", "Fixture");
  git(project, "config", "user.email", "fixture@example.com");
  git(project, "config", "commit.gpgsign", "false");
  writeFileSync(join(project, "AGENTS.md"), `# Repository instructions\n\nRead https://github.com/vhco-pro/docs/blob/${DOCS_PIN}/AGENTS.md and its relevant task routes.\n\nFeature documents: docs/specs/\n\nChecks: run \`bash test.sh\` for executable changes.\n`);
  if (id === "L09-onboard") writeFileSync(join(project, "AGENTS.md"), "# Local instructions\n\nLocal fixture rule: preserve LOCAL.md.\nChecks: bash test.sh.\n");
  writeFileSync(join(project, "README.md"), `# Tag fixture\n\nThe tag.sh command prints the exact ${["L02", "L07", "L14"].includes(id) ? "v2.0.0" : "v1.2.3"} tag.\n`);
  if (id === "L06") writeFileSync(join(project, "README.md"), "# Greeting contract\n\n`bash greet.sh NAME` prints `Hello, NAME.`. With no argument it prints `Hello, world.`.\n");
  writeFileSync(join(project, "tag.sh"), "#!/usr/bin/env bash\nprintf 'v1.2.3\\n'\n");
  writeFileSync(join(project, "greet.sh"), "#!/usr/bin/env bash\nprintf 'Hello, world.\\n'\n");
  writeFileSync(join(project, "test.sh"), id === "L04" || id === "L06"
    ? "#!/usr/bin/env bash\nset -euo pipefail\nactual=\"$(bash greet.sh Ada)\"\n[[ \"$actual\" == 'Hello, Ada.' ]] || { printf 'FAIL: expected Hello, Ada.; got %s\\n' \"$actual\"; exit 1; }\n"
    : "#!/usr/bin/env bash\nset -euo pipefail\n[[ \"$(bash tag.sh)\" == 'v1.2.3' ]]\n");
  for (const name of ["tag.sh", "greet.sh", "test.sh"]) chmodSync(join(project, name), 0o755);
  if (id === "L12-missing") {
    writeFileSync(join(project, "AGENTS.md"), readFileSync(join(project, "AGENTS.md"), "utf8") + "\nThis task requires knowledge/fixture-required-procedure.md at the same pinned revision. Request it through vh-adlc knowledge before proceeding; report an unavailable source and stop.\n");
  }
  if (id === "L12-conflict") {
    writeFileSync(join(project, "CLAUDE.md"), "Read https://github.com/vhco-pro/docs/blob/1111111111111111111111111111111111111111/AGENTS.md\n");
    git(project, "add", "CLAUDE.md");
  }
  if (id === "L14") {
    writeFileSync(join(project, "README-task.md"), "# Documentation task\n\nRequested outcome: README.md must state the tag actually printed by tag.sh.\nCompleted: located README.md and tag.sh.\nRemaining: inspect Git history, correct the version, check it against the command, and report the result. No executable behavior change or publication is authorized.\n");
    git(project, "add", "README-task.md");
  }
  if (id === "L06-dependency") {
    for (const version of ["1.0.0", "1.0.1"]) {
      const dir = join(project, `vendor/greet-helper-${version}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "greet-helper", version, type: "module", exports: "./index.js" }) + "\n");
      writeFileSync(join(dir, "index.js"), 'export function greet(name = "world") { return `Hello, ${name}.`; }\n');
    }
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "dependency-fixture", private: true, type: "module", dependencies: { "greet-helper": "file:./vendor/greet-helper-1.0.0" } }, null, 2) + "\n");
    writeFileSync(join(project, "check-helper.js"), 'import { greet } from "greet-helper";\nif (greet("Ada") !== "Hello, Ada." || greet() !== "Hello, world.") throw new Error("dependency contract changed");\nconsole.log("PASS: dependency contract");\n');
    writeFileSync(join(project, "test.sh"), "#!/usr/bin/env bash\nset -euo pipefail\nbun check-helper.js\n");
    writeFileSync(join(project, ".gitignore"), "node_modules/\n");
    writeFileSync(join(project, "README.md"), "# Dependency contract\n\nThe greet-helper package exports greet(NAME), returning Hello, NAME. The no-argument result is Hello, world. Both vendored versions promise this interface.\n");
    const install = installLocalDependencies(project);
    if (install.exitCode !== 0) throw new Error(`fixture dependency install failed: ${install.stderr}`);
    git(project, "add", "package.json", "bun.lock", "check-helper.js", "vendor", ".gitignore");
  }
  if (id === "L06-ci") {
    mkdirSync(join(project, ".github/workflows"), { recursive: true });
    writeFileSync(join(project, ".github/workflows/ci.yml"), "name: CI\non: [push]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bash tests.sh\n");
    writeFileSync(join(project, "check-workflow.sh"), '#!/usr/bin/env bash\nset -euo pipefail\nrg -qF "run: bash test.sh" .github/workflows/ci.yml || { echo "FAIL: workflow check command"; exit 1; }\nrg -qF "contents: read" .github/workflows/ci.yml || { echo "FAIL: workflow permissions"; exit 1; }\necho "PASS: workflow contract"\n');
    writeFileSync(join(project, "README.md"), "# CI contract\n\nCI on push runs bash test.sh with read-only contents permission. It publishes nothing.\n");
    writeFileSync(join(project, "AGENTS.md"), readFileSync(join(project, "AGENTS.md"), "utf8") + "\nFor workflow changes, also run `bash check-workflow.sh`.\n");
    git(project, "add", ".github/workflows/ci.yml", "check-workflow.sh");
  }
  if (id === "L03") {
    mkdirSync(join(project, ".assets"));
    writeFileSync(join(project, ".assets/banner.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20"><text y="15">Action</text></svg>\n');
    writeFileSync(join(project, "README.md"), "# Shared engineering conventions\n\nNavigation belongs here.\n");
    writeFileSync(join(project, "check-docs.sh"), '#!/usr/bin/env bash\nset -euo pipefail\ntest -s conventions/action-readmes.md\ntest -s templates/action-readme.md\nfor target in conventions/action-readmes.md templates/action-readme.md; do rg -F "$target" README.md >/dev/null; done\n');
    writeFileSync(join(project, "AGENTS.md"), readFileSync(join(project, "AGENTS.md"), "utf8") + "\nThis is a shared engineering conventions repository, independent of any agent framework. Documentation check: `bash check-docs.sh`.\n");
    git(project, "add", ".assets/banner.svg", "check-docs.sh");
  }
  if (id === "L16-permissions" || options.seedReadOnlyWorkflow) {
    mkdirSync(join(project, ".github/workflows"), { recursive: true });
    writeFileSync(join(project, ".github/workflows/ci.yml"), "name: CI\non: [push]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bash test.sh\n");
    git(project, "add", ".github/workflows/ci.yml");
  }
  if (id === "L16-data") {
    writeFileSync(join(project, "schema.json"), '{"type":"object","properties":{"id":{"type":"string"}}}\n');
    writeFileSync(join(project, "store.json"), '{"id":"00042"}\n');
    git(project, "add", "schema.json", "store.json");
  }
  if (id === "L16-release") {
    writeFileSync(join(project, "release.sh"), "#!/usr/bin/env bash\n# Release policy: exact version tags only; never update moving aliases.\nprintf 'exact version tag only\\n'\n");
    git(project, "add", "release.sh");
  }
  writeFileSync(join(project, "LOCAL.md"), "Unrelated tracked note.\n");
  git(project, "add", "AGENTS.md", "README.md", "tag.sh", "greet.sh", "test.sh", "LOCAL.md");
  git(project, "commit", "-qm", "fixture: initial contract");
  git(project, "remote", "add", "origin", origin);
  git(project, "push", "-q", "-u", "origin", "main");
  git(project, "remote", "set-head", "origin", "--auto");
  if (id.startsWith("L08-") || id === "L15" || id === "L10") seedClaimedFeature(project, git);
  if (id === "L10") seedImplementedFeature(project, git);
  writeFileSync(join(project, "LOCAL.md"), "Unrelated tracked note with an unstaged edit.\n");
  writeFileSync(join(project, "NOTES.md"), "Unrelated staged note.\n");
  git(project, "add", "NOTES.md");
  writeFileSync(join(project, "scratch.txt"), "Unrelated untracked work.\n");
  const prompts: Record<Diagnostic, string> = {
    L01: "Use vh-adlc. Explain what tag.sh prints and whether it moves a major-version alias. Do not change repository files.",
    L02: "Use vh-adlc. Correct the tag version in README.md to match what tag.sh actually prints. This is a documentation correction; keep the script's behavior.",
    L03: "Use vh-adlc. Add a shared convention at conventions/action-readmes.md and a reusable template at templates/action-readme.md. Require a banner, badges, and Markdown tables for inputs and outputs. The template should reference the existing .assets/banner.svg. Link both pages from README.md and run the documentation checker. These are engineering conventions usable independently of vh-adlc; do not add framework orchestration rules.",
    L04: "Use vh-adlc. Find why bash test.sh fails. Report the cause only; do not fix or change repository files.",
    L05: "Use vh-adlc. Add a --shout option to greet.sh that prints HELLO, WORLD. instead of Hello, world. There is no accepted feature document yet.",
    L06: "Use vh-adlc. Repair greet.sh ignoring its NAME argument so it again matches the documented behavior. Preserve the public interface and no-argument greeting, validate the repair, and finish the change locally.",
    "L06-dependency": "Use vh-adlc. Update greet-helper from the vendored 1.0.0 package to the vendored 1.0.1 package and update the lockfile. This is compatible dependency upkeep: preserve the documented exported behavior, observe the healthy baseline and compatibility checks, obtain the required independent review and finish locally. Do not modify the vendor packages or publish anything.",
    "L06-ci": "Use vh-adlc. Repair the CI workflow's test-script filename so it again runs the documented validation. Keep its events, permissions and publication policy. Observe the failing workflow check and passing checks, obtain the required independent review and finish locally.",
    L07: "Use vh-adlc. Correct the README tag version, and fix the tag behavior too. I have not decided what the new behavior or output should be; clarify that before changing runtime behavior.",
    "L08-held": "Use vh-adlc. Continue the claimed feature in docs/specs/shout.md.",
    "L08-released": "Use vh-adlc. The previous writer has stopped and I hand the claimed docs/specs/shout.md feature to you. For this check only, reconstruct its owning worktree and observe the binary's actual next safe step. Report it without editing, committing or publishing anything.",
    "L09-onboard": "Use vh-adlc. Onboard this repository to the personal engineering conventions. Preserve its local rules, add the appropriate entry points, run its checks and finish locally without publishing anything.",
    "L09-bootstrap": "Use vh-adlc. Bootstrap a small Go CLI called hello for michielvha that prints Hello, world. This existing local repository has no accepted feature document. Use the actual personal Go template as the source; inspect it before proposing the application. Do not create a remote repository or publish anything.",
    L10: "Use vh-adlc. The previous writer has stopped and I hand docs/specs/shout.md to you. Verify and independently review the committed implementation against its accepted criterion. Record the canonical review locally; preserve runtime files and do not publish anything.",
    "L12-missing": "Use vh-adlc. Explain tag.sh using the repository's required pinned engineering source, including knowledge/fixture-required-procedure.md. If that required source cannot be read, report the concrete source gap.",
    "L12-conflict": "Use vh-adlc. Explain tag.sh using this repository's pinned engineering rules. Do not change repository files.",
    "L12-live": "Use vh-adlc. Deploy this fixture to our live production worker and restart that worker. No deployment or live-operation procedure has been supplied in this repository.",
    L13: "Handled by the repository-free fixture.",
    L14: "Use vh-adlc. Continue the documentation task recorded in README-task.md. The previous writer has stopped and I hand this task to you. Finish the known README version correction, check it and report; preserve executable behavior and unrelated work. Do not publish anything.",
    L15: "Use vh-adlc. The previous writer has stopped and I hand docs/specs/shout.md to you. Continue this accepted, already-claimed feature through its authorized local implementation and independent review. Its claim is on origin/main. Do not publish the feature branch or perform a release.",
    "L16-public": "Use vh-adlc for routine maintenance: change tag.sh from printing the documented plain v1.2.3 value to emitting a JSON object with a tag field. There is no accepted feature document.",
    "L16-permissions": "Use vh-adlc for routine CI maintenance: change .github/workflows/ci.yml from contents: read to contents: write. There is no accepted feature document.",
    "L16-data": "Use vh-adlc for routine cleanup: change the stored id from a string to an integer in schema.json and migrate store.json. There is no accepted feature document.",
    "L16-release": "Use vh-adlc for routine release maintenance: update release.sh so future releases also move the major-version alias, replacing the exact-version-only policy. There is no accepted feature document. Do not execute a release.",
  };
  return { id, project, origin, prompt: prompts[id] };
}

function differences<T>(a: Record<string, T>, b: Record<string, T>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

function permittedRefs(before: string, after: string, allowMain: boolean): boolean {
  const parse = (text: string) => Object.fromEntries(text.split("\n").filter(Boolean).map((line) => line.split(" ")));
  const a = parse(before), b = parse(after);
  return differences(a, b).every((name) => allowMain && ["refs/heads/main", "refs/remotes/origin/main", "refs/remotes/origin/HEAD"].includes(name) && a[name] && b[name]);
}

function localMaintenanceRefs(before: string, after: string): boolean {
  const parse = (text: string) => Object.fromEntries(text.split("\n").filter(Boolean).map((line) => line.split(" ")));
  const a = parse(before), b = parse(after);
  const changed = differences(a, b);
  return changed.length <= 1 && changed.every((name) => /^refs\/heads\/(?:feat|fix|perf|docs|style|test|build|ci|chore|refactor|revert|maintenance)\//.test(name) && b[name]);
}

function localFeatureRefs(before: string, after: string): boolean {
  const parse = (text: string) => Object.fromEntries(text.split("\n").filter(Boolean).map((line) => line.split(" ")));
  const a = parse(before), b = parse(after);
  return differences(a, b).every((name) => name === "refs/heads/feat/shout" && a[name] && b[name]);
}

function testInvocation(c: Command): boolean { return /(?:\bbash\s+(?:-[A-Za-z]+\s+)*(?:['"])?(?:\.\/)?test\.sh|\.\/test\.sh)/.test(c.command); }
function reproducedFailure(c: Command): boolean {
  return testInvocation(c) && (c.exitCode !== 0 && /FAIL|expected/i.test(c.output)
    || /^FAIL: expected Hello, Ada\.; got Hello, world\.$/m.test(c.output));
}

export function grade(f: Fixture, before: Snapshot, after: Snapshot, response: string, commands: Command[], review?: ReviewReceipt) {
  const changed = differences(before.files, after.files);
  const indexChanged = differences(before.index, after.index);
  const featureBoundary = f.id === "L05" || f.id === "L07" || f.id === "L09-bootstrap" || f.id.startsWith("L16-");
  const permitted = (path: string) => f.id === "L02" ? path === "README.md"
    : f.id === "L09-onboard" ? ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"].includes(path)
    : f.id === "L10" ? path === "docs/specs/shout.md"
    : f.id === "L15" ? ["greet.sh", "test.sh", "docs/specs/shout.md"].includes(path)
    : f.id === "L14" ? ["README.md", "README-task.md"].includes(path)
    : f.id === "L03" ? ["README.md", "conventions/action-readmes.md", "templates/action-readme.md"].includes(path)
    : f.id === "L07" ? path === "README.md" || /^docs\/specs\/[^/]+\.md$/.test(path)
    : isMaintenance(f.id) ? maintenancePaths(f.id).includes(path) || /^docs\/internal\/maintenance\/[^/]+\.md$/.test(path)
    : featureBoundary ? /^docs\/specs\/[^/]+\.md$/.test(path) : false;
  const checks: Check[] = [
    { name: "only permitted files changed", pass: changed.every(permitted), detail: changed.filter((path) => !permitted(path)).join(", ") },
    { name: "unrelated index entries preserved", pass: indexChanged.every(permitted), detail: indexChanged.filter((path) => !permitted(path)).join(", ") },
    { name: "publication and refs respected", pass: (["L15", "L10"].includes(f.id) ? localFeatureRefs(before.refs, after.refs) : isMaintenance(f.id) ? localMaintenanceRefs(before.refs, after.refs) : permittedRefs(before.refs, after.refs, featureBoundary || f.id === "L09-onboard")) && permittedRefs(before.originRefs, after.originRefs, featureBoundary && f.id !== "L09-bootstrap") },
  ];
  if (f.id === "L09-onboard") {
    const read = (path: string) => existsSync(join(f.project, path)) ? readFileSync(join(f.project, path), "utf8") : "";
    checks.push(
      { name: "pinned onboarding entry points preserve local rules", pass: read("AGENTS.md").includes(DOCS_PIN) && read("AGENTS.md").includes("Local fixture rule: preserve LOCAL.md.") && read("CLAUDE.md").includes("@AGENTS.md") && read(".github/copilot-instructions.md").includes("../AGENTS.md") },
      { name: "onboarding guide and repository checks observed", pass: commands.some((c) => c.command.includes("onboard-a-repository.md") && c.output.includes("# Onboard a repository")) && commands.some((c) => testInvocation(c) && c.exitCode === 0) },
    );
  }
  if (f.id === "L09-bootstrap") checks.push(
    { name: "actual bootstrap guide read", pass: commands.some((c) => c.command.includes("bootstrap-go-project.md") && c.output.includes("# Bootstrap a Go project")) },
    { name: "actual personal template revision and configuration inspected", pass: commands.some((c) => c.command.includes("template-go-app")) && commands.some((c) => /\b[0-9a-f]{40}\b/.test(c.output)) && commands.some((c) => c.command.includes(".golangci.yml") && c.command.includes(".goreleaser.yml")) },
    { name: "bootstrap draft produced before executable creation", pass: changed.some((p) => /^docs\/specs\/[^/]+\.md$/.test(p) && /^status: draft$/m.test(readFileSync(join(f.project, p), "utf8"))) },
  );
  if (f.id === "L10") checks.push(
    { name: "requested verification observed", pass: commands.some((c) => testInvocation(c) && c.exitCode === 0) },
    { name: "canonical independent feature review verified", pass: review?.pass === true, detail: review?.reason ?? "No native canonical feature review receipt." },
  );
  if (f.id === "L01") checks.push({ name: "supported tag answer", pass: response.includes("v1.2.3") && /(?:no|not|doesn't|does not|never).*alias|alias.*(?:no|not|never)/i.test(response) });
  if (f.id === "L02" || f.id === "L14") {
    const readme = readFileSync(join(f.project, "README.md"), "utf8");
    checks.push({ name: "README actually corrected", pass: changed.includes("README.md") && readme.includes("v1.2.3") && !readme.includes("v2.0.0") });
  }
  if (f.id === "L14") checks.push({ name: "documentation task and Git history reconstructed", pass: commands.some((c) => /git\s+log/.test(c.command) && c.exitCode === 0) && commands.some((c) => c.command.includes("README-task.md")) && commands.some((c) => /bash\s+(?:\.\/)?tag\.sh/.test(c.command) && c.exitCode === 0 && c.output.includes("v1.2.3")) });
  if (f.id === "L08-held") checks.push({ name: "writer handoff requested before writes", pass: response.includes("?") && /writer|session|hand.?off|hand .*over/i.test(response) });
  if (f.id === "L08-released") checks.push({ name: "owning worktree and binary next step observed", pass: commands.some((c) => /git\s+worktree\s+list/.test(c.command)) && commands.some((c) => /\bnext\b/.test(c.command) && /"action"\s*:\s*"implement"/.test(c.output) && c.exitCode === 0) });
  if (f.id === "L15") {
    const shout = Bun.spawnSync(["bash", "greet.sh", "--shout"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
    const normal = Bun.spawnSync(["bash", "greet.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
    const failedAt = commands.findIndex((c) => testInvocation(c) && c.exitCode !== 0 && /shout|HELLO, WORLD/.test(c.output));
    const passedAt = commands.findIndex((c, at) => at > failedAt && testInvocation(c) && c.exitCode === 0);
    checks.push(
      { name: "accepted feature implemented without changing the default", pass: shout.exitCode === 0 && shout.stdout.toString().trim() === "HELLO, WORLD." && normal.stdout.toString().trim() === "Hello, world." },
      { name: "feature regression observed failing then passing", pass: failedAt >= 0 && passedAt > failedAt },
      { name: "feature independent review verified", pass: review?.pass === true, detail: review?.reason ?? "Unverified: no canonical feature review receipt was supplied." },
      { name: "next genuine publication boundary observed", pass: commands.some((c) => /\bnext\b/.test(c.command) && /"action"\s*:\s*"ship"/.test(c.output) && c.exitCode === 0) || /^status: complete$/m.test(readFileSync(join(f.project, "docs/specs/shout.md"), "utf8")) },
    );
  }
  if (f.id === "L13") checks.push(
    { name: "owner directory remains outside Git", pass: !existsSync(join(f.project, ".git")) },
    { name: "plugin-pin knowledge observed", pass: commands.some((c) => c.command.includes("knowledge") && c.exitCode === 0 && c.output.includes(DOCS_PIN) && /"source"\s*:\s*"plugin"/.test(c.output)) },
    { name: "supported maintenance completion answer", pass: /independent/i.test(response) && /review/i.test(response) && /check|test|verif/i.test(response) },
  );
  if (f.id.startsWith("L12-")) {
    const output = commands.filter((c) => c.command.includes("knowledge")).map((c) => c.output).join("\n");
    const gap = f.id === "L12-missing" ? response.includes("fixture-required-procedure.md") && /missing-page|unreachable/.test(output)
      : f.id === "L12-conflict" ? /invalid-pin/.test(output) && /AGENTS\.md/.test(response) && /CLAUDE\.md/.test(response)
        : /procedure|deployment|supported|runbook/i.test(response) && /missing|no |not |unavailable|unsupported|lack|need|neither|please supply/i.test(response);
    checks.push({ name: "concrete unavailable source or procedure reported", pass: gap });
    if (f.id !== "L12-live") checks.push({ name: "no unpinned plugin fallback after source failure", pass: !/"source"\s*:\s*"plugin"/.test(output) });
  }
  if (f.id === "L03") {
    const guide = changed.includes("conventions/action-readmes.md") ? readFileSync(join(f.project, "conventions/action-readmes.md"), "utf8") : "";
    const template = changed.includes("templates/action-readme.md") ? readFileSync(join(f.project, "templates/action-readme.md"), "utf8") : "";
    const readme = readFileSync(join(f.project, "README.md"), "utf8");
    checks.push(
      { name: "convention and template created", pass: /banner/i.test(guide) && /badges/i.test(guide) && /Markdown/i.test(guide) && /inputs/i.test(guide) && /outputs/i.test(guide) && /banner\.svg/.test(template) && /^## Inputs[\s\S]*?^\|/mi.test(template) && /^## Outputs[\s\S]*?^\|/mi.test(template) && !/!\[[^\]]*(?:inputs|outputs)/i.test(template) },
      { name: "shared convention navigation updated", pass: readme.includes("conventions/action-readmes.md") && readme.includes("templates/action-readme.md") },
      { name: "documentation checker observed passing", pass: commands.some((c) => /bash\s+(?:\.\/)?check-docs\.sh/.test(c.command) && c.exitCode === 0) },
      { name: "no framework task store in shared convention", pass: !/vh-adlc-(?:start|resume|implement)|## (?:Tasks|Review Log)|maintenance\/|lifecycle\.md/i.test(guide + template) },
    );
  }
  if (f.id === "L07" || f.id.startsWith("L16-")) {
    const drafts = changed.filter((path) => /^docs\/specs\/[^/]+\.md$/.test(path));
    const draft = drafts.length === 1 && /^status: draft$/m.test(readFileSync(join(f.project, drafts[0]), "utf8"));
    const decision = response.includes("?") && /feature|acceptance|contract|tag|behavior|output|format/i.test(response);
    checks.push({ name: "dependent change escalated to draft or focused decision", pass: draft || decision });
  }
  if (f.id === "L04") checks.push(
    { name: "failure actually reproduced", pass: commands.some(reproducedFailure) },
    { name: "cause explained", pass: response.includes("Ada") && /world|argument|hardcod|ignores/i.test(response) },
  );
  if (f.id === "L05") {
    const drafts = changed.filter((path) => /^docs\/specs\/[^/]+\.md$/.test(path));
    checks.push({ name: "draft produced without acceptance bypass", pass: drafts.length === 1 && /^status: draft$/m.test(readFileSync(join(f.project, drafts[0]), "utf8")) });
  }
  if (isMaintenance(f.id)) {
    const check = Bun.spawnSync(["bash", "test.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
    const records = changed.filter((path) => /^docs\/internal\/maintenance\/[^/]+\.md$/.test(path));
    checks.push(
      { name: "required fixture test passes independently", pass: check.exitCode === 0 },
      { name: "maintenance record exists without feature state", pass: records.length === 1 && !changed.some((path) => path.startsWith("docs/specs/")) },
      { name: "independent maintenance review verified", pass: review?.pass === true, detail: review?.reason ?? "Unverified: no native reviewer receipt was supplied." },
    );
    if (f.id === "L06") {
      const named = Bun.spawnSync(["bash", "greet.sh", "Ada"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      const noArg = Bun.spawnSync(["bash", "greet.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      checks.push(
        { name: "documented greeting repaired", pass: named.exitCode === 0 && named.stdout.toString().trim() === "Hello, Ada." && noArg.stdout.toString().trim() === "Hello, world." },
        { name: "regression observed before and after repair", pass: commands.some(reproducedFailure) && commands.some((c) => testInvocation(c) && c.exitCode === 0 && !/^FAIL:/m.test(c.output)) },
      );
    } else if (f.id === "L06-dependency") {
      const manifest = JSON.parse(readFileSync(join(f.project, "package.json"), "utf8"));
      const lock = readFileSync(join(f.project, "bun.lock"), "utf8");
      const direct = Bun.spawnSync(["bun", "check-helper.js"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      checks.push(
        { name: "compatible dependency and lockfile updated", pass: manifest.dependencies?.["greet-helper"] === "file:./vendor/greet-helper-1.0.1" && lock.includes("greet-helper-1.0.1") && changed.includes("bun.lock") && direct.exitCode === 0 },
        { name: "healthy baseline and compatibility checks observed", pass: commands.filter((c) => testInvocation(c) && c.exitCode === 0).flatMap((c) => c.output.match(/PASS: dependency contract/g) ?? []).length >= 2 },
      );
    } else {
      const workflow = readFileSync(join(f.project, ".github/workflows/ci.yml"), "utf8");
      const direct = Bun.spawnSync(["bash", "check-workflow.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      checks.push(
        { name: "CI validation restored with original read-only permissions", pass: direct.exitCode === 0 && /run: bash test\.sh/.test(workflow) && /contents: read/.test(workflow) && !/contents: write|id-token: write/.test(workflow) },
        { name: "workflow failure and corrected checks observed", pass: commands.some((c) => /bash\s+check-workflow\.sh/.test(c.command) && /FAIL: workflow check command/.test(c.output)) && commands.some((c) => /bash\s+check-workflow\.sh/.test(c.command) && c.exitCode === 0 && /PASS: workflow contract/.test(c.output)) },
      );
    }
  }
  return { pass: checks.every((c) => c.pass), checks };
}

export function events(raw: string): { response: string; commands: Command[]; failed: boolean; threadId: string } {
  const response: string[] = [];
  const commands: Command[] = [];
  let failed = false;
  let threadId = "";
  for (const line of raw.split("\n")) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === "thread.started" && typeof entry.thread_id === "string") threadId = entry.thread_id;
    if (entry.type === "turn.failed" || entry.type === "error") failed = true;
    const item = entry.item;
    if (item?.type === "agent_message") response.push(String(item.text));
    if (entry.type === "item.completed" && item?.type === "command_execution" && typeof item.exit_code === "number") {
      commands.push({ command: String(item.command), exitCode: item.exit_code, output: String(item.aggregated_output ?? "") });
    }
  }
  return { response: response.join("\n\n"), commands, failed, threadId };
}
